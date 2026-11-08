import { mimeByExtension, privateBytes, scannerConfigured, scanOwnedFile } from '../services/media/storage.ts';
import type { IncomingMessage, ServerResponse } from 'http';
import { createHash } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { pool } from './database.ts';
import { authenticateRequest, readJsonBody, sendAuthJson, verifyCsrf } from './auth.ts';
import { ensureQuarantineDirectory, MAX_UPLOAD_BYTES, quarantineUpload } from '../security/upload.ts';

const MIME_BY_EXTENSION = mimeByExtension;
const MAX_ENCODED_BYTES = Math.ceil(MAX_UPLOAD_BYTES * 4 / 3) + 128_000;
const MAX_FILES_PER_USER = 100;
const MAX_USER_STORAGE_BYTES = 100 * 1024 * 1024;

function reply(res:ServerResponse,status:number,body:Record<string,unknown>) {
  sendAuthJson(res,status,body);
}

/**
 * Private file library. Uploads are stored outside the web root and remain
 * quarantined; this API deliberately does not expose download or AI-ingestion
 * routes until a malware/content scanning service approves each file.
 */
export async function handleFilesApi(req:IncomingMessage,res:ServerResponse,pathname:string):Promise<boolean> {
  if (pathname !== '/api/files' && !pathname.startsWith('/api/files/')) return false;
  if (!pool) { reply(res,503,{error:'Private file storage requires the database and migrations.'}); return true; }
  const user = await authenticateRequest(req);
  if (!user) { reply(res,401,{error:'Sign in to manage private files.'}); return true; }
  if (req.method !== 'GET' && !verifyCsrf(req)) { reply(res,403,{error:'CSRF validation failed.'}); return true; }

  if (pathname === '/api/files/status' && req.method === 'GET') {
    let privateStorageConfigured = false;
    try { await ensureQuarantineDirectory(); privateStorageConfigured = true; } catch { /* Keep uploads disabled until the private disk is valid. */ }
    reply(res,200,{verified:true,privateStorageConfigured,scannerConfigured:scannerConfigured(),aiIngestionEnabled:false,approvedFileProcessingSupported:true,scannerState:'requires_per_file_scan',maxUploadBytes:MAX_UPLOAD_BYTES}); return true;
  }

  if (pathname === '/api/files' && req.method === 'GET') {
    const url=new URL(req.url||pathname,'http://localhost');
    const offset=Math.floor(Math.min(10000,Math.max(0,Number(url.searchParams.get('offset'))||0)));
    const search=(url.searchParams.get('search')||'').slice(0,240);
    const result = await pool.query(
      `SELECT id,original_name AS "name",kind,mime,size_bytes AS "sizeBytes",status,created_at AS "createdAt"
         FROM files WHERE user_id=$1 AND original_name ILIKE $2 ORDER BY created_at DESC,id DESC LIMIT 100 OFFSET $3`,
      [user.id,'%'+search+'%',offset],
    );
    reply(res,200,{files:result.rows,limit:100,maxUploadBytes:MAX_UPLOAD_BYTES}); return true;
  }

  if (pathname === '/api/files' && req.method === 'POST') {
    if (!process.env.AFG_UPLOAD_QUARANTINE_DIR || !path.isAbsolute(process.env.AFG_UPLOAD_QUARANTINE_DIR)) {
      reply(res,503,{error:'Private quarantine storage is not configured on this server.'}); return true;
    }
    let body:Record<string,unknown>;
    try { body=await readJsonBody(req,MAX_ENCODED_BYTES); }
    catch { reply(res,413,{error:'Upload payload is too large or invalid.'}); return true; }
    const name=typeof body.name==='string'?body.name.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,240):'';
    const encoded=typeof body.dataBase64==='string'?body.dataBase64:'';
    const extension=path.extname(name).toLowerCase();
    if (!name || name.includes('/') || name.includes('\\') || name==='.' || name==='..' ||
        !MIME_BY_EXTENSION[extension] || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || !encoded) {
      reply(res,400,{error:'Choose a supported PDF, image, text, audio or video file.'}); return true;
    }
    const estimatedBytes=Math.floor(encoded.length*3/4)-(encoded.endsWith('==')?2:encoded.endsWith('=')?1:0);
    if (estimatedBytes<1 || estimatedBytes>MAX_UPLOAD_BYTES) {
      reply(res,413,{error:'Files must be between 1 byte and 15 MB.'}); return true;
    }
    const bytes=Buffer.from(encoded,'base64');
    if (bytes.length!==estimatedBytes) { reply(res,400,{error:'The uploaded file encoding is invalid.'}); return true; }
    const quotaClient=await pool.connect();
    let lockHeld=false;
    let quarantined:Awaited<ReturnType<typeof quarantineUpload>>|null=null;
    try {
      await quotaClient.query("SELECT pg_advisory_lock(hashtext('afg-file-quota:' || $1))",[user.id]);
      lockHeld=true;
      const quota=await quotaClient.query('SELECT count(*)::int AS count,COALESCE(sum(size_bytes),0)::bigint AS total FROM files WHERE user_id=$1',[user.id]);
      if (Number(quota.rows[0]?.count||0)>=MAX_FILES_PER_USER || Number(quota.rows[0]?.total||0)+bytes.length>MAX_USER_STORAGE_BYTES) {
        reply(res,413,{error:'Your private file library quota is full (100 files or 100 MB). Delete an existing file before uploading more.'});
        return true;
      }
      try { quarantined=await quarantineUpload({bytes,originalName:name}); }
      catch(error) {
        const message=error instanceof Error?error.message:'Upload validation failed.';
        reply(res,400,{error:message}); return true;
      }
      const digest=createHash('sha256').update(bytes).digest('hex');
      const saved=await quotaClient.query(
        `INSERT INTO files(user_id,kind,mime,size_bytes,storage_key,original_name,status,sha256)
         VALUES($1,$2,$3,$4,$5,$6,'quarantined',$7)
         RETURNING id,original_name AS "name",kind,mime,size_bytes AS "sizeBytes",status,created_at AS "createdAt"`,
        [user.id,extension.slice(1),MIME_BY_EXTENSION[extension],bytes.length,quarantined.quarantinePath,name,digest],
      );
      reply(res,201,{file:saved.rows[0],message:'Stored privately in quarantine. It cannot be opened by AI until a security scanner approves it.'});
    } catch {
      if(quarantined) await unlink(quarantined.quarantinePath).catch(()=>{});
      reply(res,503,{error:'File metadata could not be saved; the temporary upload was removed.'});
    } finally {
      if(lockHeld) await quotaClient.query("SELECT pg_advisory_unlock(hashtext('afg-file-quota:' || $1))",[user.id]).catch(()=>{});
      quotaClient.release();
    }
    return true;
  }

  const mediaMatch=pathname.match(/^\/api\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(download|scan)$/i);
  if(mediaMatch) {
    const found=await pool.query('SELECT * FROM files WHERE id=$1 AND user_id=$2',[mediaMatch[1],user.id]);
    if(!found.rowCount){reply(res,404,{error:'File not found.'});return true;}
    if(mediaMatch[2]==='download'&&req.method==='GET') {
      try {
        const bytes=await privateBytes(found.rows[0]);
        res.statusCode=200;res.setHeader('Content-Type',found.rows[0].mime);res.setHeader('Content-Length',bytes.length);
        res.setHeader('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(found.rows[0].original_name));
        res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");res.setHeader('Cache-Control','private, no-store');res.end(bytes);
      } catch {reply(res,409,{error:'File is quarantined, missing or failed integrity validation.'});}
      return true;
    }
    if(mediaMatch[2]==='scan'&&req.method==='POST') {
      try {reply(res,200,{file:await scanOwnedFile(user.id,mediaMatch[1])});}
      catch {reply(res,503,{error:'Security scan unavailable or failed. Configure ClamAV and its current signature database; no file was approved.'});}
      return true;
    }
    reply(res,405,{error:'Method not allowed.'});return true;
  }

  const match=pathname.match(/^\/api\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  if (!match) { reply(res,404,{error:'File route not found.'}); return true; }
  if (req.method==='DELETE') {
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const found=await client.query('SELECT id,storage_key FROM files WHERE id=$1 AND user_id=$2 FOR UPDATE',[match[1],user.id]);
      if (!found.rows.length) { await client.query('ROLLBACK'); reply(res,404,{error:'File not found.'}); return true; }
      await client.query("INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,'media.file.deleted','file',$2,'{}')",[user.id,match[1]]);
      await client.query('DELETE FROM files WHERE id=$1 AND user_id=$2',[match[1],user.id]);
      await client.query('COMMIT');
      const storageKey=String(found.rows[0].storage_key||'');
      try {
        const root=await ensureQuarantineDirectory();
        const candidate=path.resolve(storageKey);
        if (storageKey && path.dirname(candidate)===root && path.basename(candidate)===path.basename(storageKey)) {
          await unlink(candidate).catch(()=>{});
        }
      } catch { /* Keep metadata deletion successful even if private storage is unavailable. */ }
      reply(res,200,{deleted:true,id:match[1]}); return true;
    } catch {
      await client.query('ROLLBACK').catch(()=>{});
      reply(res,503,{error:'The file could not be deleted.'}); return true;
    } finally { client.release(); }
  }
  reply(res,405,{error:'Method not allowed.'}); return true;
}
