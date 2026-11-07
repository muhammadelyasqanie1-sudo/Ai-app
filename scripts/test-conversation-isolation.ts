import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { pool, checkDatabase } from '../src/api/database.ts';
import { handleAuthApi, hashPassword } from '../src/api/auth.ts';
import { handleConversationsApi } from '../src/api/conversations.ts';
// Refuse all non-disposable database targets; tests create and remove synthetic users.
const target = new URL(process.env.DATABASE_URL || '');
assert.equal(target.hostname, '127.0.0.1'); assert.equal(target.port, '55432');
const ids: string[] = [];
const server = createServer((req,res) => { void (req.url!.startsWith('/api/auth/') ? handleAuthApi(req,res,new URL(req.url!, 'http://local').pathname) : handleConversationsApi(req,res,new URL(req.url!, 'http://local').pathname)).catch(() => { res.statusCode=500;res.end(); }); });
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const address = server.address() as {port:number};
const csrf = randomBytes(24).toString('hex');
const call = (path:string, token:string, method='GET', body?:unknown, withCsrf=true) => fetch(`http://127.0.0.1:${address.port}/api/conversations${path}`, {method,headers:{Cookie:`afg_session=${token}; afg_csrf=${csrf}`,...(withCsrf?{'X-CSRF-Token':csrf}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
try {
  assert.equal((await checkDatabase()).schemaReady,true);
  const password=randomBytes(24).toString('hex');
  const passwordHash=await hashPassword(password);
  const tokens:string[]=[];
  for(let i=0;i<2;i++) {
    const id=randomUUID();ids.push(id);const token=randomBytes(32).toString('hex');tokens.push(token);
    await pool!.query('INSERT INTO users(id,email,password_hash,email_verified) VALUES($1,$2,$3,true)',[id,`${id}@example.invalid`,passwordHash]);
    await pool!.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",[id,createHash('sha256').update(token).digest('hex')]);
  }
  const login=await fetch(`http://127.0.0.1:${address.port}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`${ids[0]}@example.invalid`,password})});
  assert.equal(login.status,200);assert.equal((await login.json()).authenticated,true);
  assert.ok(login.headers.getSetCookie().some(cookie=>cookie.startsWith('afg_session=') && cookie.includes('HttpOnly')));
  const invalidLogin=await fetch(`http://127.0.0.1:${address.port}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`${ids[0]}@example.invalid`,password:'incorrect-password'})});assert.equal(invalidLogin.status,401);
  assert.equal((await call('','')).status,401);
  assert.equal((await call('',tokens[0],'POST',{title:'Private'},false)).status,403);
  const created=await call('',tokens[0],'POST',{title:'Private test conversation'});assert.equal(created.status,201);
  const id=(await created.json()).conversation.id;
  for(const [method,path,body] of [['GET',`/${id}`,undefined],['PATCH',`/${id}`,{title:'Intrusion'}],['DELETE',`/${id}`,undefined],['GET',`/${id}/messages`,undefined],['POST',`/${id}/messages`,{role:'user',content:'intrusion'}]] as const) assert.equal((await call(path,tokens[1],method,body)).status,404);
  const message={role:'assistant',content:'Partial response',status:'cancelled',clientMessageId:randomUUID()};
  assert.equal((await call(`/${id}/messages`,tokens[0],'POST',message)).status,201);
  assert.equal((await call(`/${id}/messages`,tokens[0],'POST',message)).status,200);
  assert.equal((await call(`/${id}/messages`,tokens[0],'POST',{...message,content:'Changed'})).status,409);
  const history=await (await call(`/${id}/messages`,tokens[0])).json();assert.equal(history.messages.length,1);assert.equal(history.messages[0].status,'cancelled');
  assert.equal((await (await call('?search=Private&limit=1',tokens[0])).json()).conversations.length,1);
  assert.equal((await (await call('',tokens[1])).json()).conversations.length,0);
  assert.equal((await call('?limit=-1',tokens[0])).status,400);
  await pool!.query('UPDATE sessions SET expires_at=now()-interval \'1 minute\' WHERE user_id=$1',[ids[0]]);
  assert.equal((await call('',tokens[0])).status,401);
  console.log('PostgreSQL ownership, CSRF, expired sessions, persistence, cancelled status, idempotency and search tests passed.');
} finally {
  await pool!.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids]);
  server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve()));await pool!.end();
}
