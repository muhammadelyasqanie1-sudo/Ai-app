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
            last_discovered_at=now(),updated_at=now()
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
