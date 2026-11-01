import type { IncomingMessage, ServerResponse } from 'http';
import { createHash } from 'crypto';
import { pool } from './database.ts';
import { authenticateRequest, verifyCsrf, readJsonBody, sendAuthJson, hashPassword, verifyPassword, clearSessionCookies } from './auth.ts';

function reply(res: ServerResponse, status: number, body: Record<string, unknown>) { sendAuthJson(res, status, body); }
function cookieToken(req: IncomingMessage, name: string): string {
  const entry = (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(name + '='));
  if (!entry) return '';
  try { return decodeURIComponent(entry.slice(name.length + 1)); } catch { return ''; }
}
function secretHash(value: string) { return createHash('sha256').update(value).digest('hex'); }
const PREFERENCE_FIELDS = new Set(['language','appearance','accentColor','density','fontSize','chatWidth','animationsEnabled','defaultModel','autoSelectModel','responseStyle','responseLength','creativity','memoryEnabled','voiceEnabled','defaultLanguage','notifications']);

export async function handleAccountApi(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> {
  if (pathname !== '/api/account' && !pathname.startsWith('/api/account/')) return false;
  if (!pool) { reply(res, 503, { error: 'Account services require DATABASE_URL and the current database schema.' }); return true; }
  const user = await authenticateRequest(req);
  if (!user) { reply(res, 401, { error: 'Sign in is required.' }); return true; }
  if (req.method !== 'GET' && !verifyCsrf(req)) { reply(res, 403, { error: 'CSRF validation failed.' }); return true; }

  if (pathname === '/api/account/preferences' && req.method === 'GET') {
    const result = await pool.query('SELECT * FROM user_preferences WHERE user_id=$1', [user.id]);
    reply(res, 200, { preferences: result.rows[0] || null }); return true;
  }
  if (pathname === '/api/account/preferences' && req.method === 'PATCH') {
    try {
      const body = await readJsonBody(req, 20000);
      const v = Object.fromEntries(Object.entries(body).filter(([key]) => PREFERENCE_FIELDS.has(key)));
      if (typeof body.defaultModel === 'string' && body.defaultModel.trim()) {
        const { getVerifiedModelDescriptors } = await import('../services/providerGateway.ts');
        const models = await getVerifiedModelDescriptors();
        const chosen = models.find((model) => (model.providerId + '::' + model.id === body.defaultModel || model.id === body.defaultModel) && model.enabled && model.verifiedAt);
        if (!chosen) { reply(res,400,{error:'Default model must be enabled and health-verified.'}); return true; }
      }
      const notifications = v.notifications && typeof v.notifications === 'object' ? v.notifications as Record<string, unknown> : {};
      const appearance = ['light','dark','neon','system'].includes(String(v.appearance)) ? v.appearance : 'system';
      const density = ['compact','comfortable','spacious'].includes(String(v.density)) ? v.density : 'comfortable';
      const chatWidth = ['narrow','comfortable','wide'].includes(String(v.chatWidth)) ? v.chatWidth : 'comfortable';
      const result = await pool.query(
        'INSERT INTO user_preferences (user_id,language,appearance,accent_color,density,font_size,chat_width,animations_enabled,default_model,auto_select_model,response_style,response_length,creativity,memory_enabled,voice_enabled,default_language,notifications_json,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,now()) ON CONFLICT (user_id) DO UPDATE SET language=EXCLUDED.language,appearance=EXCLUDED.appearance,accent_color=EXCLUDED.accent_color,density=EXCLUDED.density,font_size=EXCLUDED.font_size,chat_width=EXCLUDED.chat_width,animations_enabled=EXCLUDED.animations_enabled,default_model=EXCLUDED.default_model,auto_select_model=EXCLUDED.auto_select_model,response_style=EXCLUDED.response_style,response_length=EXCLUDED.response_length,creativity=EXCLUDED.creativity,memory_enabled=EXCLUDED.memory_enabled,voice_enabled=EXCLUDED.voice_enabled,default_language=EXCLUDED.default_language,notifications_json=EXCLUDED.notifications_json,updated_at=now() RETURNING *',
        [user.id, v.language === 'english' ? 'english' : 'dari', appearance, typeof v.accentColor === 'string' ? v.accentColor.slice(0,30) : 'cyan', density, Math.max(12,Math.min(20,Number(v.fontSize)||14)), chatWidth, v.animationsEnabled !== false, typeof v.defaultModel === 'string' ? v.defaultModel.slice(0,300) : null, v.autoSelectModel !== false, typeof v.responseStyle === 'string' ? v.responseStyle.slice(0,40) : 'balanced', typeof v.responseLength === 'string' ? v.responseLength.slice(0,30) : 'medium', Math.max(0,Math.min(1,Number(v.creativity ?? 0.7))), v.memoryEnabled !== false, v.voiceEnabled !== false, v.defaultLanguage === 'english' ? 'english' : 'dari', JSON.stringify({inApp:notifications.inApp!==false,email:notifications.email===true,productUpdates:notifications.productUpdates===true,usageAlerts:notifications.usageAlerts!==false,securityAlerts:notifications.securityAlerts!==false})],
      );
      await pool.query('UPDATE users SET preferred_language=$1,memory_enabled=$2,default_model=$3,updated_at=now() WHERE id=$4', [v.language === 'english' ? 'english' : 'dari',v.memoryEnabled!==false,typeof v.defaultModel==='string'&&v.defaultModel?v.defaultModel:null,user.id]);
      reply(res,200,{preferences:result.rows[0]});
    } catch { reply(res,400,{error:'Could not save account preferences.'}); }
    return true;
  }

  if (pathname === '/api/account/memories' && req.method === 'GET') {
    const result = await pool.query('SELECT id,category,content,consent_sensitive AS "consentSensitive",created_at AS "createdAt",updated_at AS "updatedAt" FROM user_memories WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 300',[user.id]);
    reply(res,200,{memories:result.rows}); return true;
  }
  if (pathname === '/api/account/memories' && req.method === 'POST') {
    try {
      const body=await readJsonBody(req,8000);
      const category=['preferences','language','style','facts'].includes(String(body.category))?String(body.category):'';
      const content=typeof body.content==='string'?body.content.trim():'';
      if(!category||!content||content.length>2000){reply(res,400,{error:'Choose a category and provide 1–2,000 characters.'});return true;}
      const sensitive=/\b(password|passcode|secret|api.?key|token|passport|national.?id|ssn|medical|diagnosis|medication|health|bank.?account|credit.?card|رمز|پاسورد|تذکره|پاسپورت|صحت|مریض|دوا|تشخیص)\b/i.test(content);
      if(sensitive&&body.consentSensitive!==true){reply(res,400,{error:'This may contain sensitive information. Explicit per-item consent is required.'});return true;}
      const result=await pool.query('INSERT INTO user_memories(user_id,category,content,consent_sensitive) VALUES($1,$2,$3,$4) RETURNING id,category,content,consent_sensitive AS "consentSensitive",created_at AS "createdAt"',[user.id,category,content,sensitive]);
      reply(res,201,{memory:result.rows[0]});
    } catch {reply(res,400,{error:'Could not save this memory.'});}
    return true;
  }
  const memoryMatch=pathname.match(/^\/api\/account\/memories\/([0-9a-f-]{36})$/i);
  if(memoryMatch&&req.method==='PATCH'){
    try{
      const body=await readJsonBody(req,8000); const content=typeof body.content==='string'?body.content.trim():'';
      const category=['preferences','language','style','facts'].includes(String(body.category))?String(body.category):'';
      if(!content||content.length>2000||!category){reply(res,400,{error:'Valid category and content are required.'});return true;}
      const sensitive=/\b(password|passcode|secret|api.?key|token|passport|national.?id|ssn|medical|diagnosis|medication|health|bank.?account|credit.?card)\b|رمز|پاسورد|تذکره|پاسپورت|صحت|مریض|دوا|تشخیص/i.test(content);
      if(sensitive&&body.consentSensitive!==true){reply(res,400,{error:'Explicit per-item consent is required.'});return true;}
      const result=await pool.query('UPDATE user_memories SET category=$1,content=$2,consent_sensitive=$3,updated_at=now() WHERE id=$4 AND user_id=$5 RETURNING id',[category,content,sensitive,memoryMatch[1],user.id]);
      reply(res,result.rowCount?200:404,result.rowCount?{updated:true}:{error:'Memory not found.'});
    }catch{reply(res,400,{error:'Could not update memory.'});}
    return true;
  }
  if(memoryMatch&&req.method==='DELETE'){
    const result=await pool.query('DELETE FROM user_memories WHERE id=$1 AND user_id=$2',[memoryMatch[1],user.id]);
    reply(res,result.rowCount?200:404,result.rowCount?{deleted:true}:{error:'Memory not found.'});return true;
  }
  if(pathname==='/api/account/memory-status'&&req.method==='PATCH'){
    try{const body=await readJsonBody(req);if(typeof body.enabled!=='boolean'){reply(res,400,{error:'enabled must be boolean.'});return true;}
      await pool.query('UPDATE users SET memory_enabled=$1,updated_at=now() WHERE id=$2',[body.enabled,user.id]);
      await pool.query('INSERT INTO user_preferences(user_id,memory_enabled) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET memory_enabled=EXCLUDED.memory_enabled,updated_at=now()',[user.id,body.enabled]);
      reply(res,200,{enabled:body.enabled});
    }catch{reply(res,400,{error:'Could not update memory settings.'});}return true;
  }

  if(pathname==='/api/account/notifications'&&req.method==='GET'){
    const result=await pool.query('SELECT id,event_type AS "eventType",title,body,read_at AS "readAt",created_at AS "createdAt" FROM user_notification_events WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[user.id]);
    reply(res,200,{notifications:result.rows});return true;
  }
  const notificationMatch=pathname.match(/^\/api\/account\/notifications\/([0-9a-f-]{36})$/i);
  if(notificationMatch&&req.method==='PATCH'){
    const result=await pool.query('UPDATE user_notification_events SET read_at=now() WHERE id=$1 AND user_id=$2 RETURNING id',[notificationMatch[1],user.id]);
    reply(res,result.rowCount?200:404,result.rowCount?{read:true}:{error:'Notification not found.'});return true;
  }

  if(pathname==='/api/account/sessions'&&req.method==='GET'){
    const currentHash=secretHash(cookieToken(req,'afg_session'));
    const result=await pool.query('SELECT id,created_at AS "createdAt",last_seen_at AS "lastSeenAt",expires_at AS "expiresAt",(token_hash=$2) AS current FROM sessions WHERE user_id=$1 AND expires_at>now() ORDER BY last_seen_at DESC LIMIT 50',[user.id,currentHash]);
    reply(res,200,{sessions:result.rows});return true;
  }
  const sessionMatch=pathname.match(/^\/api\/account\/sessions\/([0-9a-f-]{36})$/i);
  if(sessionMatch&&req.method==='DELETE'){
    const result=await pool.query('DELETE FROM sessions WHERE id=$1 AND user_id=$2',[sessionMatch[1],user.id]);
    reply(res,result.rowCount?200:404,result.rowCount?{revoked:true}:{error:'Session not found.'});return true;
  }
  if(pathname==='/api/account/password'&&req.method==='POST'){
    try{
      const body=await readJsonBody(req);const current=typeof body.currentPassword==='string'?body.currentPassword:'';const next=typeof body.newPassword==='string'?body.newPassword:'';
      if(next.length<12||next.length>256){reply(res,400,{error:'New password must be at least 12 characters.'});return true;}
      const stored=await pool.query('SELECT password_hash FROM users WHERE id=$1',[user.id]);
      if(!stored.rows[0]?.password_hash||!await verifyPassword(current,stored.rows[0].password_hash)){reply(res,401,{error:'Current password is incorrect.'});return true;}
      await pool.query('UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2',[await hashPassword(next),user.id]);
      await pool.query('DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2',[user.id,secretHash(cookieToken(req,'afg_session'))]);
      reply(res,200,{changed:true,otherSessionsRevoked:true});
    }catch{reply(res,400,{error:'Could not change password.'});}return true;
  }
  if(pathname==='/api/account/export'&&req.method==='GET'){
    const [profile,prefs,memories,items,conversations]=await Promise.all([
      pool.query('SELECT id,email,display_name,preferred_language,created_at FROM users WHERE id=$1',[user.id]),
      pool.query('SELECT * FROM user_preferences WHERE user_id=$1',[user.id]),
      pool.query('SELECT category,content,consent_sensitive,created_at,updated_at FROM user_memories WHERE user_id=$1',[user.id]),
      pool.query('SELECT tool_type,title,content,parameters,created_at,updated_at FROM productivity_items WHERE user_id=$1',[user.id]),
      pool.query('SELECT c.id,c.title,c.created_at,c.updated_at,COALESCE(json_agg(json_build_object(\'role\',m.role,\'content\',m.content,\'createdAt\',m.created_at) ORDER BY m.created_at) FILTER (WHERE m.id IS NOT NULL),\'[]\'::json) AS messages FROM conversations c LEFT JOIN messages m ON m.conversation_id=c.id WHERE c.user_id=$1 GROUP BY c.id ORDER BY c.created_at',[user.id]),
    ]);
    reply(res,200,{exportedAt:new Date().toISOString(),profile:profile.rows[0],preferences:prefs.rows,memories:memories.rows,productivityItems:items.rows,conversations:conversations.rows});return true;
  }
  if(pathname==='/api/account'&&req.method==='DELETE'){
    try{
      const body=await readJsonBody(req);
      if(body.confirmation!=='DELETE MY ACCOUNT'){reply(res,400,{error:'Type DELETE MY ACCOUNT to confirm.'});return true;}
      const stored=await pool.query('SELECT password_hash FROM users WHERE id=$1',[user.id]);
      if(!stored.rows[0]?.password_hash||typeof body.currentPassword!=='string'||!await verifyPassword(body.currentPassword,stored.rows[0].password_hash)){reply(res,401,{error:'Current password is required and must be correct.'});return true;}
      await pool.query('DELETE FROM users WHERE id=$1',[user.id]);
      clearSessionCookies(res);
      reply(res,200,{deleted:true});
    }catch{reply(res,400,{error:'Could not delete account.'});}return true;
  }
  reply(res,404,{error:'Account route not found.'});return true;
}
