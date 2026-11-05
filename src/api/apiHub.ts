import type { IncomingMessage, ServerResponse } from 'http';
import { pool } from './database.ts';
import { authenticateRequest, readJsonBody, sendAuthJson, verifyCsrf } from './auth.ts';
import { getPublicApiSyncStatus, queryPublicApiCatalog, syncPublicApiCatalog, syncPublicMcpCatalog } from '../services/publicApiCatalog.ts';
import { discoverOpenApiOperations } from '../services/openApiDiscovery.ts';

export async function handleApiHubApi(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> {
  if (!pathname.startsWith('/api/api-hub') && !pathname.startsWith('/api/admin/api-hub')) return false;
  if (!pool) { sendAuthJson(res,503,{error:'The API Hub requires DATABASE_URL and migrations 0012–0015 plus 0024.'}); return true; }
  const user = await authenticateRequest(req).catch(() => null);
  if (!user) { sendAuthJson(res,401,{error:'Sign in is required.'}); return true; }
  const admin = ['admin','superadmin'].includes(user.role);
  if (pathname.startsWith('/api/admin/') && !admin) { sendAuthJson(res,403,{error:'Administrator access is required.'}); return true; }
  if (req.method !== 'GET' && !verifyCsrf(req)) { sendAuthJson(res,403,{error:'CSRF validation failed.'}); return true; }
  try {
    if (req.method === 'POST' && pathname === '/api/admin/api-hub/work-queue/claim') {
      if (!admin) { sendAuthJson(res,403,{error:'Administrator access is required.'}); return true; }
      const body=await readJsonBody(req,2000);
      const requested=Number(body.limit||10);
      const limit=Number.isInteger(requested)?Math.max(1,Math.min(25,requested)):10;
      const client=await pool.connect();
      let claimed:any[]=[];
      try{
        await client.query('BEGIN');
        const result=await client.query(`WITH candidates AS (
            SELECT t.source_key FROM public_api_implementation_tracking t
            JOIN public_api_catalog c ON c.source_key=t.source_key
            WHERE c.is_active=true AND (
              t.work_state='queued' OR (t.work_state='claimed' AND t.lease_until < now())
            )
            ORDER BY CASE t.discovery_status WHEN 'catalogued' THEN 0 WHEN 'docs_discovered' THEN 1 ELSE 2 END,
              t.updated_at ASC
            FOR UPDATE OF t SKIP LOCKED LIMIT $1
          )
          UPDATE public_api_implementation_tracking t
          SET work_state='claimed',claimed_by=$2,claimed_at=now(),lease_until=now()+interval '20 minutes',
              attempts=t.attempts+1,updated_at=now()
          FROM candidates x WHERE t.source_key=x.source_key
          RETURNING t.source_key,t.discovery_status,t.official_docs_url,t.openapi_spec_url,t.attempts,t.lease_until`,[limit,String(user.id)]);
        claimed=result.rows;
        await client.query('COMMIT');
      }catch(error){await client.query('ROLLBACK');throw error;}
      finally{client.release();}
      if(claimed.length){
        const keys=claimed.map(row=>row.source_key);
        const details=await pool.query(`SELECT source_key,name,description,category,auth,homepage_url,docs_url
          FROM public_api_catalog WHERE source_key=ANY($1::text[])`,[keys]);
        const byKey=new Map(details.rows.map(row=>[row.source_key,row]));
        claimed=claimed.map(row=>({...row,...(byKey.get(row.source_key)||{})}));
      }
      await pool.query('INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)',
        [user.id,'api_hub.discovery.queue.claim','api_catalog_batch',null,JSON.stringify({claimed:claimed.length,limit})]).catch(()=>{});
      sendAuthJson(res,200,{claimed,limit,leaseMinutes:20});return true;
    }
    if (req.method === 'POST' && pathname === '/api/admin/api-hub/work-queue/complete') {
      if (!admin) { sendAuthJson(res,403,{error:'Administrator access is required.'}); return true; }
      const body=await readJsonBody(req,5000);
      const sourceKey=typeof body.sourceKey==='string'?body.sourceKey.trim():'';
      const outcome=typeof body.outcome==='string'?body.outcome:'';
      const officialDocsUrl=typeof body.officialDocsUrl==='string'?body.officialDocsUrl.trim():'';
      const specUrl=typeof body.specUrl==='string'?body.specUrl.trim():'';
      const reason=typeof body.reason==='string'?body.reason.trim().slice(0,500):'';
      if(!/^[a-f0-9]{64}$/i.test(sourceKey)){sendAuthJson(res,400,{error:'A valid source key is required.'});return true;}
      if(!['docs_discovered','contract_discovered','unsupported','retry'].includes(outcome)){sendAuthJson(res,400,{error:'Unsupported queue outcome.'});return true;}
      const validUrl=(value:string)=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&value.length<=2048;}catch{return false;}};
      if(outcome==='docs_discovered'&&!validUrl(officialDocsUrl)){sendAuthJson(res,400,{error:'A verified HTTPS official documentation URL is required.'});return true;}
      if(outcome==='contract_discovered'&&!validUrl(specUrl)){sendAuthJson(res,400,{error:'A verified HTTPS OpenAPI JSON URL is required.'});return true;}
      if(outcome==='unsupported'&&!reason){sendAuthJson(res,400,{error:'Explain why this protocol is unsupported.'});return true;}
      const nextStatus=outcome==='retry'?null:outcome;
      const result=await pool.query(`UPDATE public_api_implementation_tracking
        SET discovery_status=COALESCE($3,discovery_status),
          official_docs_url=CASE WHEN $4<>'' THEN $4 ELSE official_docs_url END,
          openapi_spec_url=CASE WHEN $5<>'' THEN $5 ELSE openapi_spec_url END,
          unsupported_reason=CASE WHEN $6<>'' THEN $6 ELSE unsupported_reason END,
          work_state=CASE WHEN $7='retry' THEN 'queued' WHEN $7='unsupported' THEN 'blocked' ELSE 'done' END,
          claimed_by=NULL,claimed_at=NULL,lease_until=NULL,last_work_error=CASE WHEN $7='retry' THEN $6 ELSE NULL END,
          updated_at=now()
        WHERE source_key=$1 AND work_state='claimed' AND claimed_by=$2
        RETURNING source_key,discovery_status,work_state`,
        [sourceKey,String(user.id),nextStatus,officialDocsUrl,specUrl,reason,outcome]);
      if(!result.rows[0]){sendAuthJson(res,409,{error:'This API is not currently claimed by your admin session, or its lease expired.'});return true;}
      await pool.query('INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)',
        [user.id,'api_hub.discovery.queue.complete','api_catalog',sourceKey,JSON.stringify({outcome})]).catch(()=>{});
      sendAuthJson(res,200,{item:result.rows[0]});return true;
    }
    if (req.method === 'GET' && pathname === '/api/admin/api-hub/work-queue') {
      const result=await pool.query(`SELECT work_state,count(*)::int AS count FROM public_api_implementation_tracking GROUP BY work_state`);
      const counts:Record<string,number>={queued:0,claimed:0,done:0,blocked:0};
      for(const row of result.rows)counts[String(row.work_state)]=Number(row.count||0);
      sendAuthJson(res,200,{counts,total:Object.values(counts).reduce((sum,n)=>sum+n,0)});return true;
    }
    if (req.method === 'POST' && pathname === '/api/api-hub/openapi/discover') {
      const body = await readJsonBody(req,4000);
      const specUrl = typeof body.specUrl === 'string' ? body.specUrl.trim() : '';
      const sourceKey = typeof body.sourceKey === 'string' ? body.sourceKey.trim() : '';
      if (!specUrl || specUrl.length > 2048) { sendAuthJson(res,400,{error:'A valid OpenAPI JSON document URL is required.'}); return true; }
      if (sourceKey && !/^[a-f0-9]{64}$/i.test(sourceKey)) { sendAuthJson(res,400,{error:'A valid catalog source key is required.'}); return true; }
      const result = await discoverOpenApiOperations(specUrl);
      if (sourceKey) {
        const tracked = await pool.query(`UPDATE public_api_implementation_tracking t
          SET openapi_spec_url=$2,
            discovery_status=CASE WHEN t.discovery_status IN ('catalogued','docs_discovered') THEN 'contract_discovered' ELSE t.discovery_status END,
            work_state=CASE WHEN t.work_state='claimed' THEN 'done' ELSE t.work_state END,
            claimed_by=NULL,claimed_at=NULL,lease_until=NULL,last_discovered_at=now(),updated_at=now()
          FROM public_api_catalog c
          WHERE t.source_key=c.source_key AND t.source_key=$1 AND c.is_active=true
          RETURNING t.source_key`,[sourceKey,result.specUrl]);
        if (!tracked.rows[0]) { sendAuthJson(res,404,{error:'The selected API catalog entry was not found or has no tracking record.'}); return true; }
      }
      await pool.query('INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)',
        [user.id,'api_hub.openapi.discover','api_catalog',result.specUrl,JSON.stringify({operationCount:result.operationCount,sourceKey:sourceKey||null})]).catch(()=>{});
      sendAuthJson(res,200,result); return true;
    }
    if (req.method === 'GET' && pathname === '/api/api-hub/catalog') {
      const url = new URL(req.url || '/', 'http://localhost');
      const result = await queryPublicApiCatalog({
        q: url.searchParams.get('q') || '',
        category: url.searchParams.get('category') || 'all',
        auth: url.searchParams.get('auth') || 'all',
        https: url.searchParams.get('https') || 'all',
        cors: url.searchParams.get('cors') || 'all',
        page: Number(url.searchParams.get('page') || 1),
        pageSize: Number(url.searchParams.get('pageSize') || 24),
      });
      sendAuthJson(res,200,result); return true;
    }
    if (req.method === 'GET' && pathname === '/api/api-hub/random') {
      const url = new URL(req.url || '/', 'http://localhost');
      const category = url.searchParams.get('category');
      const result = await pool.query(`SELECT source_key,name,description,auth,https,cors,category,homepage_url,docs_url,icon_url,image_url,site_name,site_description,health_status,response_time_ms
        FROM public_api_catalog WHERE is_active=true AND ($1::text IS NULL OR category=$1) ORDER BY random() LIMIT 1`,
        [category && category !== 'all' ? category.slice(0,100) : null]);
      sendAuthJson(res,200,{item:result.rows[0]||null}); return true;
    }
    if (req.method === 'GET' && pathname === '/api/api-hub/favorites') {
      const result = await pool.query(`SELECT c.source_key,c.name,c.description,c.auth,c.https,c.cors,c.category,
        c.homepage_url,c.docs_url,c.icon_url,c.image_url,c.site_name,c.site_description,c.health_status,f.note,f.created_at
        FROM user_public_api_favorites f JOIN public_api_catalog c ON c.source_key=f.source_key
        WHERE f.user_id=$1 ORDER BY f.created_at DESC`,[user.id]);
      sendAuthJson(res,200,{items:result.rows}); return true;
    }
    if (req.method === 'POST' && pathname === '/api/api-hub/favorites') {
      const body = await readJsonBody(req,2000);
      const sourceKey = typeof body.sourceKey === 'string' ? body.sourceKey : '';
      if (!/^[a-f0-9]{64}$/i.test(sourceKey)) { sendAuthJson(res,400,{error:'A valid catalog source key is required.'}); return true; }
      const result = await pool.query(`INSERT INTO user_public_api_favorites(user_id,source_key)
        SELECT $1,source_key FROM public_api_catalog WHERE source_key=$2 AND is_active=true
        ON CONFLICT(user_id,source_key) DO NOTHING RETURNING source_key`,[user.id,sourceKey]);
      if (!result.rows[0]) {
        const exists = await pool.query('SELECT 1 FROM user_public_api_favorites WHERE user_id=$1 AND source_key=$2',[user.id,sourceKey]);
        if (!exists.rows[0]) { sendAuthJson(res,404,{error:'API catalog entry was not found.'}); return true; }
      }
      sendAuthJson(res,200,{saved:true,sourceKey}); return true;
    }
    const favoriteMatch = pathname.match(/^\/api\/api-hub\/favorites\/([a-f0-9]{64})$/i);
    if (req.method === 'DELETE' && favoriteMatch) {
      const result = await pool.query('DELETE FROM user_public_api_favorites WHERE user_id=$1 AND source_key=$2 RETURNING source_key',[user.id,favoriteMatch[1]]);
      sendAuthJson(res,200,{deleted:Boolean(result.rows[0])}); return true;
    }
    const detailMatch = pathname.match(/^\/api\/api-hub\/catalog\/([a-f0-9]{64})$/i);
    if (req.method === 'GET' && detailMatch) {
      const result = await pool.query(`SELECT c.source_key,c.name,c.description,c.auth,c.https,c.cors,c.category,c.homepage_url,c.docs_url,c.icon_url,c.image_url,c.site_name,c.site_description,
        c.health_status,c.response_time_ms,c.last_health_check,c.source_payload,
        COALESCE(t.discovery_status,'catalogued') AS implementation_status,t.official_docs_url,t.openapi_spec_url,
        t.endpoint_url,t.http_method,t.auth_type,t.endpoint_verified,t.auth_configured,t.last_probe_at,t.last_probe_status,t.unsupported_reason
        FROM public_api_catalog c LEFT JOIN public_api_implementation_tracking t ON t.source_key=c.source_key
        WHERE c.source_key=$1 AND c.is_active=true LIMIT 1`,[detailMatch[1]]);
      if (!result.rows[0]) { sendAuthJson(res,404,{error:'API catalog entry was not found.'}); return true; }
      const item=result.rows[0];
      const alternatives=await pool.query(`SELECT source_key,name,description,auth,https,cors,category,homepage_url,docs_url,icon_url,image_url,site_name,site_description
        FROM public_api_catalog WHERE category=$1 AND source_key<>$2 AND is_active=true
        ORDER BY CASE WHEN lower(auth)=lower($3) THEN 0 ELSE 1 END,
          CASE WHEN https='Yes' THEN 0 ELSE 1 END,name LIMIT 6`,[item.category,item.source_key,item.auth]);
      sendAuthJson(res,200,{item,alternatives:alternatives.rows}); return true;
    }
    if (req.method === 'GET' && pathname === '/api/admin/api-hub/status') {
      const status=await getPublicApiSyncStatus();
      let mcpDirectory:{total:number;configured:boolean}={total:0,configured:false};
      try{const mcp=await pool.query('SELECT count(*)::int AS total FROM mcp_directory_catalog WHERE is_active=true');mcpDirectory={total:Number(mcp.rows[0]?.total||0),configured:true};}catch{}
      sendAuthJson(res,200,{...status,mcpDirectory}); return true;
    }
    if (req.method === 'POST' && pathname === '/api/admin/api-hub/sync') {
      const body = await readJsonBody(req,1000);
      if (Object.keys(body).length) { sendAuthJson(res,400,{error:'The sync endpoint does not accept custom source URLs or options.'}); return true; }
      if (user.role !== 'superadmin') { sendAuthJson(res,403,{error:'Superadmin access is required to refresh the global API catalog.'}); return true; }
      const catalog=await syncPublicApiCatalog();
      let mcpDirectory:{imported:number;error?:string};
      try{mcpDirectory=await syncPublicMcpCatalog();}
      catch{mcpDirectory={imported:0,error:'MCP directory sync requires migration 0013 and access to the upstream repository README.'};}
      const complete=catalog.complete&&mcpDirectory.imported>0;
      const result={catalog,mcpDirectory,complete};
      await pool.query('INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',
        [user.id,user.role,'api_hub.catalog.sync','api_catalog','public-apis/public-apis',JSON.stringify(result)]);
      sendAuthJson(res,complete?200:206,{result,status:complete?'success':'partial'}); return true;
    }
    sendAuthJson(res,404,{error:'API Hub route not found.'}); return true;
  } catch (error) {
    console.error('AFG_API_HUB_REQUEST_FAILED',JSON.stringify({path:pathname,method:req.method,error:error instanceof Error?error.message:'unknown_error'}));
    sendAuthJson(res,502,{error:'The API Hub request failed. Check the request ID and catalog sync status.'}); return true;
  }
}
