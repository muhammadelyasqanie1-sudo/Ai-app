import type { IncomingMessage, ServerResponse } from 'http';
import { pool } from './database.ts';
import { authenticateRequest, readJsonBody, sendAuthJson, verifyCsrf } from './auth.ts';
import { getPublicApiSyncStatus, queryPublicApiCatalog, syncPublicApiCatalog } from '../services/publicApiCatalog.ts';

export async function handleApiHubApi(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> {
  if (!pathname.startsWith('/api/api-hub') && !pathname.startsWith('/api/admin/api-hub')) return false;
  if (!pool) { sendAuthJson(res,503,{error:'The API Hub requires DATABASE_URL and the 0012 migration.'}); return true; }
  const user = await authenticateRequest(req).catch(() => null);
  if (!user) { sendAuthJson(res,401,{error:'Sign in is required.'}); return true; }
  const admin = ['admin','superadmin'].includes(user.role);
  if (pathname.startsWith('/api/admin/') && !admin) { sendAuthJson(res,403,{error:'Administrator access is required.'}); return true; }
  if (req.method !== 'GET' && !verifyCsrf(req)) { sendAuthJson(res,403,{error:'CSRF validation failed.'}); return true; }
  try {
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
    if (req.method === 'GET' && pathname === '/api/admin/api-hub/status') {
      sendAuthJson(res,200,await getPublicApiSyncStatus()); return true;
    }
    if (req.method === 'POST' && pathname === '/api/admin/api-hub/sync') {
      const body = await readJsonBody(req,1000);
      if (Object.keys(body).length) { sendAuthJson(res,400,{error:'The sync endpoint does not accept custom source URLs or options.'}); return true; }
      if (user.role !== 'superadmin') { sendAuthJson(res,403,{error:'Superadmin access is required to refresh the global API catalog.'}); return true; }
      const result = await syncPublicApiCatalog();
      await pool.query('INSERT INTO audit_logs(actor_user_id,actor_role,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',
        [user.id,user.role,'api_hub.catalog.sync','api_catalog','publicapis.lol',JSON.stringify(result)]);
      sendAuthJson(res,result.complete?200:206,{result,status:result.complete?'success':'partial'}); return true;
    }
    sendAuthJson(res,404,{error:'API Hub route not found.'}); return true;
  } catch (error) {
    console.error('AFG_API_HUB_REQUEST_FAILED',JSON.stringify({path:pathname,method:req.method,error:error instanceof Error?error.message:'unknown_error'}));
    sendAuthJson(res,502,{error:'The API Hub request failed. Check the request ID and catalog sync status.'}); return true;
  }
}
