import type { IncomingMessage, ServerResponse } from 'http';
import { createHash } from 'crypto';
import { pool } from './database.ts';
import { z } from 'zod';
import { authenticateRequest, verifyCsrf, readJsonBody, sendAuthJson, hashPassword, verifyPassword, clearSessionCookies, recordSecurityNotification, recordAuthSecurityEvent } from './auth.ts';

function reply(res: ServerResponse, status: number, body: Record<string, unknown>) { sendAuthJson(res, status, body); }
const SENSITIVE_MEMORY_PATTERN = /\b(password|passcode|secret|api.?key|token|otp|verification.?code|recovery.?code|private.?key|credential|passport|national.?id|identity.?card|social.?security|ssn|driver.?license|medical|diagnosis|medication|prescription|hospital|doctor|disease|symptom|health|diabetes|cancer|pregnan|depression|anxiety|allergy|blood.?pressure|bank.?account|account.?number|credit.?card|debit.?card|cvv|iban)\b|رمز|پاسورد|تذکره|پاسپورت|کارت هویت|شماره هویت|کلید خصوصی|کد تایید|کد تأیید|رمز یکبار مصرف|صحت|مریض|دوا|دارو|تشخیص|بیماری|شفاخانه|داکتر|دکتر|حساسیت|فشار خون|شکر|سرطان|حاملگی|بارداری|افسردگی|اضطراب|حساب بانکی|شماره حساب|کارت بانکی/i;
function containsSensitiveMemory(value: string): boolean { return SENSITIVE_MEMORY_PATTERN.test(value); }
function cookieToken(req: IncomingMessage, name: string): string {
  const entry = (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(name + '='));
  if (!entry) return '';
  try { return decodeURIComponent(entry.slice(name.length + 1)); } catch { return ''; }
}
function secretHash(value: string) { return createHash('sha256').update(value).digest('hex'); }
const memorySchema = z.object({
  category: z.enum(['preferences','language','style','facts']),
  content: z.string().trim().min(1).max(2000),
  consentSensitive: z.boolean().optional(),
}).strict();
const memoryStatusSchema = z.object({ enabled: z.boolean() }).strict();
const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(12).max(256),
}).strict();
const accountDeleteSchema = z.object({
  confirmation: z.literal('DELETE MY ACCOUNT'),
  currentPassword: z.string().max(256).optional(),
}).strict();

const PREFERENCE_FIELDS = new Set(['language','appearance','accentColor','density','fontSize','chatWidth','animationsEnabled','defaultModel','autoSelectModel','responseStyle','responseLength','creativity','memoryEnabled','voiceEnabled','defaultLanguage','notifications']);

export async function handleAccountApi(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> {
  if (pathname !== '/api/account' && !pathname.startsWith('/api/account/')) return false;
  if (!pool) { reply(res, 503, { error: 'Account services require DATABASE_URL and the current database schema.' }); return true; }
  const user = await authenticateRequest(req);
  if (!user) { reply(res, 401, { error: 'Sign in is required.' }); return true; }
  if (req.method !== 'GET' && !verifyCsrf(req)) { reply(res, 403, { error: 'CSRF validation failed.' }); return true; }

  if (pathname === '/api/account/locale' && req.method === 'GET') {
    const result = await pool.query("SELECT COALESCE(s.locale,u.preferred_language,'dari') AS locale FROM users u LEFT JOIN user_settings s ON s.user_id=u.id WHERE u.id=$1", [user.id]);
    reply(res,200,{locale:result.rows[0]?.locale || 'dari'}); return true;
  }
  if (pathname === '/api/account/locale' && req.method === 'PATCH') {
    try {
      const parsed = z.object({ locale: z.enum(['dari','english']) }).strict().safeParse(await readJsonBody(req,2000));
      if (!parsed.success) { reply(res,400,{error:'A supported locale is required.'}); return true; }
      const locale = parsed.data.locale;
      await pool.query('UPDATE users SET preferred_language=$1,updated_at=now() WHERE id=$2',[locale,user.id]);
      await pool.query('INSERT INTO user_settings(user_id,locale,updated_at) VALUES($1,$2,now()) ON CONFLICT(user_id) DO UPDATE SET locale=EXCLUDED.locale,updated_at=now()',[user.id,locale]);
      await pool.query('INSERT INTO user_preferences(user_id,language,default_language) VALUES($1,$2,$2) ON CONFLICT(user_id) DO UPDATE SET language=EXCLUDED.language,default_language=EXCLUDED.default_language,updated_at=now()',[user.id,locale]);
      reply(res,200,{locale,saved:true});
    } catch { reply(res,400,{error:'Could not save the language preference.'}); }
    return true;
  }
  if (pathname === '/api/account/preferences' && req.method === 'GET') {
    await pool.query("INSERT INTO user_settings(user_id,locale) SELECT id,COALESCE(preferred_language,'dari') FROM users WHERE id=$1 ON CONFLICT(user_id) DO NOTHING", [user.id]);
    await pool.query("INSERT INTO user_preferences(user_id,language,default_language) SELECT id,COALESCE(preferred_language,'dari'),COALESCE(preferred_language,'dari') FROM users WHERE id=$1 ON CONFLICT(user_id) DO NOTHING", [user.id]);
    const result = await pool.query("SELECT p.*, s.locale FROM user_preferences p LEFT JOIN user_settings s ON s.user_id=p.user_id WHERE p.user_id=$1", [user.id]);
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
        [user.id, v.language === 'english' ? 'english' : 'dari', appearance, ['cyan','blue','violet','emerald','rose'].includes(String(v.accentColor)) ? String(v.accentColor) : 'cyan', density, Math.max(12,Math.min(20,Number(v.fontSize)||14)), chatWidth, v.animationsEnabled !== false, typeof v.defaultModel === 'string' && v.defaultModel.trim() ? v.defaultModel.trim().slice(0,300) : null, v.autoSelectModel !== false, ['balanced','concise','detailed','creative','formal'].includes(String(v.responseStyle)) ? String(v.responseStyle) : 'balanced', ['short','medium','long'].includes(String(v.responseLength)) ? String(v.responseLength) : 'medium', Math.max(0,Math.min(1,Number(v.creativity ?? 0.7))), v.memoryEnabled !== false, v.voiceEnabled !== false, v.defaultLanguage === 'english' ? 'english' : 'dari', JSON.stringify({inApp:notifications.inApp!==false,email:notifications.email===true,productUpdates:notifications.productUpdates===true,usageAlerts:notifications.usageAlerts!==false,securityAlerts:notifications.securityAlerts!==false})],
      );
      await pool.query('UPDATE users SET preferred_language=$1,memory_enabled=$2,default_model=$3,updated_at=now() WHERE id=$4', [v.language === 'english' ? 'english' : 'dari',v.memoryEnabled!==false,typeof v.defaultModel==='string'&&v.defaultModel.trim()?v.defaultModel.trim():null,user.id]);
      await pool.query('INSERT INTO user_settings(user_id,locale,updated_at) VALUES($1,$2,now()) ON CONFLICT(user_id) DO UPDATE SET locale=EXCLUDED.locale,updated_at=now()', [user.id, v.language === 'english' ? 'english' : 'dari']);
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
      const parsed=memorySchema.safeParse(await readJsonBody(req,8000));
      if(!parsed.success){reply(res,400,{error:'Choose a valid category and provide 1–2,000 characters.'});return true;}
      const body=parsed.data; const category=body.category; const content=body.content;
      const sensitive=containsSensitiveMemory(content);
      if(sensitive&&body.consentSensitive!==true){reply(res,400,{error:'This may contain sensitive information. Explicit per-item consent is required.'});return true;}
      const result=await pool.query('INSERT INTO user_memories(user_id,category,content,consent_sensitive) VALUES($1,$2,$3,$4) RETURNING id,category,content,consent_sensitive AS "consentSensitive",created_at AS "createdAt"',[user.id,category,content,sensitive]);
      reply(res,201,{memory:result.rows[0]});
    } catch {reply(res,400,{error:'Could not save this memory.'});}
    return true;
  }
  const memoryMatch=pathname.match(/^\/api\/account\/memories\/([0-9a-f-]{36})$/i);
  if(memoryMatch&&req.method==='PATCH'){
    try{
      const parsed=memorySchema.safeParse(await readJsonBody(req,8000));
      if(!parsed.success){reply(res,400,{error:'Valid category and content are required.'});return true;}
      const body=parsed.data; const content=body.content; const category=body.category;
      const sensitive=containsSensitiveMemory(content);
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
    try{const parsed=memoryStatusSchema.safeParse(await readJsonBody(req));if(!parsed.success){reply(res,400,{error:'enabled must be boolean.'});return true;} const body=parsed.data;
      await pool.query('UPDATE users SET memory_enabled=$1,updated_at=now() WHERE id=$2',[body.enabled,user.id]);
      await pool.query('INSERT INTO user_preferences(user_id,memory_enabled) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET memory_enabled=EXCLUDED.memory_enabled,updated_at=now()',[user.id,body.enabled]);
      reply(res,200,{enabled:body.enabled});
    }catch{reply(res,400,{error:'Could not update memory settings.'});}return true;
  }

  if(pathname==='/api/account/conversations'&&req.method==='DELETE'){
    const result=await pool.query('DELETE FROM conversations WHERE user_id=$1',[user.id]);
    reply(res,200,{deleted:true,count:result.rowCount||0});return true;
  }
  const conversationMatch=pathname.match(/^\/api\/account\/conversations\/([0-9a-f-]{36})$/i);
  if(conversationMatch&&req.method==='DELETE'){
    const result=await pool.query('DELETE FROM conversations WHERE id=$1 AND user_id=$2',[conversationMatch[1],user.id]);
    reply(res,result.rowCount?200:404,result.rowCount?{deleted:true}:{error:'Conversation not found.'});return true;
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
    const result=await pool.query('SELECT id,created_at AS "createdAt",last_seen_at AS "lastSeenAt",expires_at AS "expiresAt",(token_hash=$2) AS current FROM sessions WHERE user_id=$1 AND expires_at>now() AND revoked_at IS NULL ORDER BY last_seen_at DESC LIMIT 50',[user.id,currentHash]);
    reply(res,200,{sessions:result.rows});return true;
  }
  const sessionMatch=pathname.match(/^\/api\/account\/sessions\/([0-9a-f-]{36})$/i);
  if(sessionMatch&&req.method==='DELETE'){
    const result=await pool.query('UPDATE sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL',[sessionMatch[1],user.id]);
    reply(res,result.rowCount?200:404,result.rowCount?{revoked:true}:{error:'Session not found.'});return true;
  }
  if(pathname==='/api/account/password'&&req.method==='POST'){
    try{
      const parsed=passwordChangeSchema.safeParse(await readJsonBody(req));if(!parsed.success){reply(res,400,{error:'Provide your current password and a new password of at least 12 characters.'});return true;}
      const body=parsed.data;const current=body.currentPassword;const next=body.newPassword;
      const stored=await pool.query('SELECT password_hash FROM users WHERE id=$1',[user.id]);
      if(!stored.rows[0]?.password_hash||!await verifyPassword(current,stored.rows[0].password_hash)){reply(res,401,{error:'Current password is incorrect.'});return true;}
      await pool.query('UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2',[await hashPassword(next),user.id]);
      await pool.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND token_hash<>$2 AND revoked_at IS NULL',[user.id,secretHash(cookieToken(req,'afg_session'))]);
      await recordSecurityNotification(user.id,'security.password_changed','Password changed','Your AFG AI account password was changed.');
      reply(res,200,{changed:true,otherSessionsRevoked:true});
    }catch{reply(res,400,{error:'Could not change password.'});}return true;
  }
  if(pathname==='/api/account/export'&&req.method==='GET'){
    const [profile,prefs,memories,items,conversations,identities,sessions,assets,usage,apiKeys,notifications]=await Promise.all([
      pool.query('SELECT id,email,display_name,preferred_language,created_at FROM users WHERE id=$1',[user.id]),
      pool.query('SELECT * FROM user_preferences WHERE user_id=$1',[user.id]),
      pool.query('SELECT category,content,consent_sensitive,created_at,updated_at FROM user_memories WHERE user_id=$1',[user.id]),
      pool.query('SELECT tool_type,title,content,parameters,created_at,updated_at FROM productivity_items WHERE user_id=$1',[user.id]),
      pool.query('SELECT c.id,c.title,c.created_at,c.updated_at,COALESCE(json_agg(json_build_object(\'role\',m.role,\'content\',m.content,\'createdAt\',m.created_at) ORDER BY m.created_at) FILTER (WHERE m.id IS NOT NULL),\'[]\'::json) AS messages FROM conversations c LEFT JOIN messages m ON m.conversation_id=c.id WHERE c.user_id=$1 GROUP BY c.id ORDER BY c.created_at',[user.id]),
      pool.query('SELECT provider,email_verified,created_at FROM auth_identities WHERE user_id=$1',[user.id]),
      pool.query('SELECT created_at,last_seen_at,expires_at FROM sessions WHERE user_id=$1 ORDER BY created_at DESC',[user.id]),
      pool.query('SELECT asset_type,prompt,mime_type,metadata,created_at FROM generated_assets WHERE user_id=$1',[user.id]),
      pool.query('SELECT provider_key,model_key,capability,input_tokens,output_tokens,cost_microusd,created_at FROM usage_events WHERE user_id=$1 ORDER BY created_at DESC LIMIT 5000',[user.id]),
      pool.query('SELECT label,key_prefix,scopes,last_used_at,expires_at,revoked_at,created_at FROM api_keys WHERE owner_user_id=$1',[user.id]),
      pool.query('SELECT event_type,title,body,read_at,created_at FROM user_notification_events WHERE user_id=$1 ORDER BY created_at DESC',[user.id]),
    ]);
    reply(res,200,{exportedAt:new Date().toISOString(),profile:profile.rows[0],preferences:prefs.rows,memories:memories.rows,productivityItems:items.rows,conversations:conversations.rows,linkedIdentities:identities.rows,sessionHistory:sessions.rows,generatedAssets:assets.rows,usageHistory:usage.rows,apiKeyMetadata:apiKeys.rows,notifications:notifications.rows});return true;
  }
  if(pathname==='/api/account'&&req.method==='DELETE'){
    try{
      const parsed=accountDeleteSchema.safeParse(await readJsonBody(req));
      if(!parsed.success){reply(res,400,{error:'Type DELETE MY ACCOUNT to confirm.'});return true;}
      const body=parsed.data;
      const stored=await pool.query('SELECT password_hash FROM users WHERE id=$1',[user.id]);
      if(stored.rows[0]?.password_hash && (!body.currentPassword||!await verifyPassword(body.currentPassword,stored.rows[0].password_hash))){reply(res,401,{error:'Current password is required and must be correct.'});return true;}
      await pool.query('INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)',[user.id,'account.self_delete','user',user.id,JSON.stringify({source:'account-settings'})]);
      await recordAuthSecurityEvent(req,user.id,'auth.account_deleted','warning');
      await pool.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',[user.id]);
      await pool.query('DELETE FROM users WHERE id=$1',[user.id]);
      clearSessionCookies(res);
      reply(res,200,{deleted:true});
    }catch{reply(res,400,{error:'Could not delete account.'});}return true;
  }
  reply(res,404,{error:'Account route not found.'});return true;
}
