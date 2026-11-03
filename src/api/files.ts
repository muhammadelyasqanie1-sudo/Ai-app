import type { IncomingMessage, ServerResponse } from 'http';
import { createHash } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { pool } from './database.ts';
import { authenticateRequest, readJsonBody, sendAuthJson, verifyCsrf } from './auth.ts';
import { MAX_UPLOAD_BYTES, quarantineUpload } from '../security/upload.ts';

const MIME_BY_EXTENSION: Record<string,string> = {
  '.pdf':'application/pdf','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg',
  '.gif':'image/gif','.webp':'image/webp','.txt':'text/plain','.csv':'text/csv',
};
const MAX_ENCODED_BYTES = Math.ceil(MAX_UPLOAD_BYTES * 4 / 3) + 128_000;

function reply(res:ServerResponse,status:number,body:Record<string,unknown>) {
  sendAuthJson(res,status,body);
}

/**
 * Private file library. Uploads are stored outside the web root and remain
 * quarantined; this API deliberately does not expose download or AI-ingestion
 * routes until a malware/content scanning service is configured.
 */
export async function handleFilesApi(req:IncomingMessage,res:ServerResponse,pathname:string):Promise<boolean> {
  if (pathname !== '/api/files' && !pathname.startsWith('/api/files/')) return false;
  if (!pool) { reply(res,503,{error:'Private file storage requires the database and migrations.'}); return true; }
  const user = await authenticateRequest(req);
  if (!user) { reply(res,401,{error:'Sign in to manage private files.'}); return true; }
  if (req.method !== 'GET' && !verifyCsrf(req)) { reply(res,403,{error:'CSRF validation failed.'}); return true; }

  if (pathname === '/api/files/status' && req.method === 'GET') {
    reply(res,200,{verified:true,privateStorageConfigured:Boolean(process.env.AFG_UPLOAD_QUARANTINE_DIR && path.isAbsolute(process.env.AFG_UPLOAD_QUARANTINE_DIR)),scannerConfigured:false,aiIngestionEnabled:false,maxUploadBytes:MAX_UPLOAD_BYTES}); return true;
  }

  if (pathname === '/api/files' && req.method === 'GET') {
    const result = await pool.query(
      `SELECT id,original_name AS "name",kind,mime,size_bytes AS "sizeBytes",status,created_at AS "createdAt"
         FROM files WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`,
      [user.id],
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
    const name=typeof body.name==='string'?body.name.trim().slice(0,240):'';
    const encoded=typeof body.dataBase64==='string'?body.dataBase64:'';
    const extension=path.extname(name).toLowerCase();
    if (!name || name.includes('/') || name.includes('\\') || name==='.' || name==='..' ||
        !MIME_BY_EXTENSION[extension] || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || !encoded) {
      reply(res,400,{error:'Choose a supported PDF, image, TXT or CSV file.'}); return true;
    }
    const estimatedBytes=Math.floor(encoded.length*3/4)-(encoded.endsWith('==')?2:encoded.endsWith('=')?1:0);
    if (estimatedBytes<1 || estimatedBytes>MAX_UPLOAD_BYTES) {
      reply(res,413,{error:'Files must be between 1 byte and 15 MB.'}); return true;
    }
    const bytes=Buffer.from(encoded,'base64');
    if (bytes.length!==estimatedBytes) { reply(res,400,{error:'The uploaded file encoding is invalid.'}); return true; }
    let quarantined;
    try { quarantined=await quarantineUpload({bytes,originalName:name}); }
    catch(error) {
      const message=error instanceof Error?error.message:'Upload validation failed.';
      reply(res,400,{error:message}); return true;
    }
    const digest=createHash('sha256').update(bytes).digest('hex');
    try {
      const saved=await pool.query(
        `INSERT INTO files(user_id,kind,mime,size_bytes,storage_key,original_name,status,sha256)
         VALUES($1,$2,$3,$4,$5,$6,'quarantined',$7)
         RETURNING id,original_name AS "name",kind,mime,size_bytes AS "sizeBytes",status,created_at AS "createdAt"`,
        [user.id,extension.slice(1),MIME_BY_EXTENSION[extension],bytes.length,quarantined.quarantinePath,name,digest],
      );
      reply(res,201,{file:saved.rows[0],message:'Stored privately in quarantine. It cannot be opened by AI until a security scanner approves it.'});
    } catch {
      await unlink(quarantined.quarantinePath).catch(()=>{});
      reply(res,503,{error:'File metadata could not be saved; the temporary upload was removed.'});
    }
    return true;
  }

  const match=pathname.match(/^\/api\/files\/([0-9a-f-]{36})$/i);
  if (!match) { reply(res,404,{error:'File route not found.'}); return true; }
  if (req.method==='DELETE') {
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const found=await client.query('SELECT id,storage_key FROM files WHERE id=$1 AND user_id=$2 FOR UPDATE',[match[1],user.id]);
      if (!found.rows.length) { await client.query('ROLLBACK'); reply(res,404,{error:'File not found.'}); return true; }
      await client.query('DELETE FROM files WHERE id=$1 AND user_id=$2',[match[1],user.id]);
      await client.query('COMMIT');
      const storageKey=String(found.rows[0].storage_key||'');
      const root=path.resolve(process.env.AFG_UPLOAD_QUARANTINE_DIR||'/nonexistent');
      if (storageKey && path.dirname(path.resolve(storageKey))===root) await unlink(storageKey).catch(()=>{});
      reply(res,200,{deleted:true,id:match[1]}); return true;
    } catch {
      await client.query('ROLLBACK').catch(()=>{});
      reply(res,503,{error:'The file could not be deleted.'}); return true;
    } finally { client.release(); }
  }
  reply(res,405,{error:'Method not allowed.'}); return true;
}
