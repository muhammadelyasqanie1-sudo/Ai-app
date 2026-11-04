import { createHash, randomBytes } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import { pool } from './database.ts';
import { authenticateRequest, readJsonBody } from './auth.ts';

type User = { id: string; role: string; status: string };
type Auth = { user: User; tokenId: string | null; scopes: string[] };

function send(res: ServerResponse, status: number, body: Record<string, unknown>, requestId: string) {
  res.statusCode = status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Request-Id',requestId);
  res.end(JSON.stringify({ ...body, requestId }));
}
function hash(value: string) { return createHash('sha256').update(value).digest('hex'); }

async function authenticateTerminal(req: IncomingMessage): Promise<Auth | null> {
  const authorization = req.headers.authorization || '';
  if (authorization.startsWith('Bearer afg_cli_') && pool) {
    const raw = authorization.slice('Bearer '.length);
    const found = await pool.query(
      `SELECT t.id AS token_id,t.scopes,u.id,u.role,u.status
         FROM cli_tokens t JOIN users u ON u.id=t.user_id
        WHERE t.token_hash=$1 AND t.revoked_at IS NULL AND t.expires_at>now()
        LIMIT 1`, [hash(raw)],
    );
    const row = found.rows[0];
    if (!row || row.status !== 'active') return null;
    const limit = Math.max(10,Math.min(1000,Number.parseInt(process.env.CLI_RATE_LIMIT_PER_HOUR || '120',10) || 120));
    const bucket = await pool.query(
      `INSERT INTO cli_token_rate_limits(token_id,bucket_start,request_count)
       VALUES($1,date_trunc('hour',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',1)
       ON CONFLICT(token_id,bucket_start) DO UPDATE
         SET request_count=cli_token_rate_limits.request_count+1
         WHERE cli_token_rate_limits.request_count < $2
       RETURNING request_count`,
      [row.token_id,limit],
    );
    if (!bucket.rowCount) throw Object.assign(new Error('CLI token hourly request limit reached.'),{statusCode:429});
    void pool.query('UPDATE cli_tokens SET last_used_at=now() WHERE id=$1',[row.token_id]).catch(()=>{});
    return { user: { id: row.id, role: row.role, status: row.status }, tokenId: row.token_id, scopes: row.scopes || [] };
  }
  const user = await authenticateRequest(req);
  if (!user || user.status !== 'active') return null;
  return { user, tokenId: null, scopes: user.role === 'admin' || user.role === 'superadmin' ? ['*'] : ['terminal.read'] };
}
function hasScope(auth: Auth, scope: string) {
  return auth.user.role === 'admin' || auth.user.role === 'superadmin' || auth.scopes.includes('*') || auth.scopes.includes(scope);
}
function parseBearer(req: IncomingMessage) { return (req.headers.authorization || '').startsWith('Bearer afg_cli_'); }

async function runNativeCommand(command: string, userId: string): Promise<{ output: string; exitCode: number }> {
  const parts = command.trim().split(/\s+/);
  if (parts[0] !== 'afg') return { output: 'Only read-only afg-native commands are available. Shell execution is disabled.', exitCode: 4 };
  const args = parts.slice(1);
  if (args.length === 1 && args[0] === 'version') return { output: 'AFG AI CLI API v1 (server command surface)', exitCode: 0 };
  if (args.join(' ') === 'status') {
    await pool!.query('SELECT 1 AS ready');
    return { output: ['AFG AI API: responding', 'PostgreSQL: connected', 'Account scope: enforced', 'Shell execution: disabled', 'Terminal workspace: browser-isolated'].join('\n'), exitCode: 0 };
  }
  if (args.join(' ') === 'account') {
    const result = await pool!.query('SELECT display_name,role,status FROM users WHERE id=$1 LIMIT 1',[userId]);
    const account = result.rows[0];
    if (!account) return { output: 'Account profile not found.', exitCode: 1 };
    return { output: ['Name: ' + String(account.display_name || 'AFG AI user').replace(/[\r\n]/g,' ').slice(0,100), 'Role: ' + account.role, 'Status: ' + account.status].join('\n'), exitCode: 0 };
  }
  if (args.join(' ') === 'models list') {
    const result = await pool!.query(`SELECT provider_key,model_key,display_name,enabled,last_health_ok FROM model_catalog ORDER BY provider_key,display_name LIMIT 100`);
    return { output: result.rows.length ? result.rows.map((r:any)=>`${r.provider_key}::${r.model_key}  ${r.display_name}  ${r.enabled && r.last_health_ok ? 'verified' : 'unavailable'}`).join('\n') : 'No models are currently registered.', exitCode: 0 };
  }
  if (args.join(' ') === 'conv list') {
    const result = await pool!.query(`SELECT id,title,updated_at FROM conversations WHERE user_id=$1 AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 50`,[userId]);
    return { output: result.rows.length ? result.rows.map((r:any)=>`${r.id}  ${String(r.title).replace(/[\r\n]/g,' ').slice(0,100)}  ${new Date(r.updated_at).toISOString()}`).join('\n') : 'No conversations found.', exitCode: 0 };
  }
  if (args.join(' ') === 'files list') {
    const result = await pool!.query(`SELECT id,kind,mime,size_bytes,created_at FROM files WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,[userId]);
    return { output: result.rows.length ? result.rows.map((r:any)=>`${r.id}  ${r.kind}  ${r.mime || 'unknown'}  ${r.size_bytes} bytes`).join('\n') : 'No uploaded files found.', exitCode: 0 };
  }
  if (args[0] === 'help' || args.length === 0) return { output: 'AFG AI account commands: afg version | afg status | afg account | afg models list | afg conv list | afg files list. Shell execution is disabled.', exitCode: 0 };
  return { output: 'Unsupported command. Run afg help.', exitCode: 1 };
}

export async function handleTerminalApi(req: IncomingMessage, res: ServerResponse, pathname: string, requestId: string): Promise<boolean> {
  if (!pathname.startsWith('/api/terminal')) return false;
  let terminalEnabled = false;
  try {
    const flag = await pool?.query("SELECT enabled FROM feature_flags WHERE flag_key='terminal_exec_enabled' LIMIT 1");
    terminalEnabled = flag?.rows[0]?.enabled === true;
  } catch { terminalEnabled = false; }
  if (!terminalEnabled) { send(res, 403, { error: 'Terminal is disabled by the administrator.' }, requestId); return true; }
  if (!pool) { send(res,503,{error:'Terminal requires the PostgreSQL database.'},requestId); return true; }
  let auth: Auth | null;
  try { auth = await authenticateTerminal(req); }
  catch (error:any) { send(res,error?.statusCode===429?429:503,{error:error?.statusCode===429?error.message:'Terminal authentication service unavailable.'},requestId); return true; }
  if (!auth) { send(res,401,{error:'Sign in or provide a valid CLI token.'},requestId); return true; }
  const method = req.method || 'GET';

  if (pathname === '/api/terminal/whoami' && method === 'GET') {
    if (!hasScope(auth,'terminal.read')) { send(res,403,{error:'Missing terminal.read permission.'},requestId); return true; }
    send(res,200,{user:{id:auth.user.id,role:auth.user.role},authentication:auth.tokenId?'cli_token':'browser_session',scopes:auth.scopes.filter(scope=>scope==='terminal.read')},requestId); return true;
  }

  if (pathname === '/api/terminal/tokens' && method === 'POST') {
    if (parseBearer(req)) { send(res,403,{error:'A CLI token cannot create another token.'},requestId); return true; }
    const body = await readJsonBody(req);
    const name = typeof body.name === 'string' ? body.name.trim().slice(0,80) : '';
    if (!name) { send(res,400,{error:'A token name is required.'},requestId); return true; }
    const days = Math.min(90,Math.max(1,Number.isInteger(body.ttlDays) ? Number(body.ttlDays) : Number(process.env.CLI_TOKEN_TTL_DAYS || 30)));
    const requested = Array.isArray(body.scopes) ? body.scopes.filter((s): s is string => typeof s === 'string') : ['terminal.read'];
    const allowed = new Set(['terminal.read']);
    const scopes = [...new Set(requested.filter(s=>allowed.has(s)))];
    if (!scopes.includes('terminal.read')) scopes.push('terminal.read');
    const token = 'afg_cli_' + randomBytes(32).toString('base64url');
    const client = await pool.connect();
    let tokenRecord;
    try {
      await client.query('BEGIN');
      const saved = await client.query(
        `INSERT INTO cli_tokens(user_id,token_hash,token_prefix,name,scopes,expires_at)
         VALUES($1,$2,$3,$4,$5,now()+($6::text||' days')::interval)
         RETURNING id,name,scopes,created_at,expires_at`,
        [auth.user.id,hash(token),token.slice(0,16),name,scopes,String(days)],
      );
      tokenRecord = saved.rows[0];
      await client.query('INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)',[auth.user.id,'terminal.cli_token.created','cli_token',tokenRecord.id,JSON.stringify({scopes})]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    send(res,201,{token,tokenRecord,warning:'Copy this token now. It will not be shown again.'},requestId); return true;
  }

  if (pathname === '/api/terminal/tokens' && method === 'GET') {
    if (parseBearer(req)) { send(res,403,{error:'Token listing requires a browser session.'},requestId); return true; }
    const result = await pool.query('SELECT id,name,token_prefix,scopes,created_at,expires_at,last_used_at,revoked_at FROM cli_tokens WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[auth.user.id]);
    send(res,200,{tokens:result.rows},requestId); return true;
  }
  const tokenMatch = pathname.match(/^\/api\/terminal\/tokens\/([0-9a-f-]{36})$/i);
  if (tokenMatch && method === 'DELETE') {
    if (parseBearer(req)) { send(res,403,{error:'Token revocation requires a browser session.'},requestId); return true; }
    const client = await pool.connect();
    let revoked = false;
    try {
      await client.query('BEGIN');
      const result = await client.query('UPDATE cli_tokens SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL RETURNING id',[tokenMatch[1],auth.user.id]);
      if (!result.rowCount) {
        await client.query('ROLLBACK');
      } else {
        await client.query('INSERT INTO audit_logs(actor_user_id,action,target_type,target_id) VALUES($1,$2,$3,$4)',[auth.user.id,'terminal.cli_token.revoked','cli_token',tokenMatch[1]]);
        await client.query('COMMIT');
        revoked = true;
      }
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    if (!revoked) { send(res,404,{error:'Active token not found.'},requestId); return true; }
    send(res,200,{revoked:true},requestId); return true;
  }

  if (pathname === '/api/terminal/sessions' && method === 'GET') {
    if (!hasScope(auth,'terminal.read')) { send(res,403,{error:'Missing terminal.read permission.'},requestId); return true; }
    const result = await pool.query(`SELECT id,surface,created_at,last_active_at,revoked_at FROM terminal_sessions WHERE user_id=$1 AND revoked_at IS NULL AND last_active_at>now()-interval '15 minutes' ORDER BY created_at DESC LIMIT 50`,[auth.user.id]);
    send(res,200,{sessions:result.rows,executionEnabled:false},requestId); return true;
  }
  if (pathname === '/api/terminal/sessions' && method === 'POST') {
    if (!hasScope(auth,'terminal.read')) { send(res,403,{error:'Missing terminal.read permission.'},requestId); return true; }
    const body = await readJsonBody(req);
    const surface = body.surface === 'cli' && parseBearer(req) ? 'cli' : 'web';
    const result = await pool.query('INSERT INTO terminal_sessions(user_id,surface,cli_token_id) VALUES($1,$2,$3) RETURNING id,surface,created_at,last_active_at',[auth.user.id,surface,auth.tokenId]);
    send(res,201,{session:result.rows[0],executionEnabled:false},requestId); return true;
  }

  const sessionMatch = pathname.match(/^\/api\/terminal\/sessions\/([0-9a-f-]{36})(?:\/(commands|history))?$/i);
  if (sessionMatch) {
    const sessionId = sessionMatch[1];
    const action = sessionMatch[2] || '';
    const owned = await pool.query(`SELECT id FROM terminal_sessions WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND last_active_at>now()-interval '15 minutes'`,[sessionId,auth.user.id]);
    if (!owned.rowCount) { send(res,404,{error:'Terminal session not found.'},requestId); return true; }
    if (!action && method === 'DELETE') {
      await pool.query('UPDATE terminal_sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2',[sessionId,auth.user.id]);
      send(res,200,{revoked:true},requestId); return true;
    }
    if (action === 'history' && method === 'GET') {
      const history = await pool.query('SELECT command,output_text,exit_code,duration_ms,request_id,created_at FROM terminal_audit WHERE session_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 100',[sessionId,auth.user.id]);
      send(res,200,{history:history.rows},requestId); return true;
    }
    if (action === 'commands' && method === 'POST') {
      if (!hasScope(auth,'terminal.read')) { send(res,403,{error:'Missing terminal.read permission.'},requestId); return true; }
      const body = await readJsonBody(req,8192);
      const command = typeof body.command === 'string' ? body.command.trim().slice(0,500) : '';
      if (!command || /[\0\r\n]/.test(command)) { send(res,400,{error:'Enter one command on a single line.'},requestId); return true; }
      if (/\b(term|exec)\b/.test(command)) { send(res,403,{error:'Shell execution is disabled. Only read-only afg-native commands are available.'},requestId); return true; }
      const started = Date.now();
      const result = await runNativeCommand(command,auth.user.id);
      const duration = Date.now()-started;
      const outputLimit = Math.max(1024,Math.min(262144,Number.parseInt(process.env.TERMINAL_MAX_OUTPUT_BYTES || '262144',10) || 262144));
      const safeOutput = Buffer.from(result.output,'utf8').subarray(0,outputLimit).toString('utf8');
      await pool.query('INSERT INTO terminal_audit(session_id,user_id,command,output_text,exit_code,duration_ms,request_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[sessionId,auth.user.id,command,safeOutput,result.exitCode,duration,requestId]);
      await pool.query('UPDATE terminal_sessions SET last_active_at=now() WHERE id=$1',[sessionId]);
      send(res,result.exitCode===0?200:400,{output:safeOutput,exitCode:result.exitCode,executionEnabled:false,requestId},requestId); return true;
    }
  }
  send(res,404,{error:'Terminal route not found.'},requestId); return true;
}
