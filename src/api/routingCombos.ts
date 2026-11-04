import type { IncomingMessage, ServerResponse } from 'http';
import { z } from 'zod';
import { pool } from './database.ts';
import { authenticateRequest, readJsonBody, sendAuthJson, verifyCsrf } from './auth.ts';
import { getVerifiedModelDescriptors } from '../services/providerGateway.ts';

const comboSchema = z.object({
  slug: z.string().trim().toLowerCase().min(2).max(48).regex(/^[a-z0-9][a-z0-9-]+$/),
  displayName: z.string().trim().min(1).max(80),
  strategy: z.enum(['fallback','round_robin']).default('fallback'),
  modelIds: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{1,47}::[a-zA-Z0-9@][a-zA-Z0-9._:/-]{0,299}$/)).min(1).max(20),
  fallbackOnError: z.boolean().default(true),
  enabled: z.boolean().default(true),
}).strict();

function normalize(row: any) {
  return { id: row.id, slug: row.slug, displayName: row.display_name, strategy: row.strategy,
    modelIds: row.model_ids, fallbackOnError: row.fallback_on_error, enabled: row.enabled,
    nextIndex: row.next_index, createdAt: row.created_at, updatedAt: row.updated_at };
}

async function verifiedModelIds() {
  const descriptors = await getVerifiedModelDescriptors();
  return new Set(descriptors.filter(m => m.enabled && m.verifiedAt &&
    Date.now()-Date.parse(m.verifiedAt)<=300000 && m.capabilities.text && m.capabilities.streaming)
    .map(m => m.providerId+'::'+m.id));
}

export async function handleRoutingComboApi(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> {
  if (!pathname.startsWith('/api/admin/routing/combos')) return false;
  if (!pool) { sendAuthJson(res,503,{error:'Routing combos require DATABASE_URL and applied migrations.'}); return true; }
  const user = await authenticateRequest(req).catch(() => null);
  if (!user) { sendAuthJson(res,401,{error:'Sign in is required.'}); return true; }
  if (user.role !== 'superadmin') { sendAuthJson(res,403,{error:'Superadmin access is required to manage routing combos.'}); return true; }
  if (req.method !== 'GET' && !verifyCsrf(req)) { sendAuthJson(res,403,{error:'CSRF validation failed.'}); return true; }
  try {
    if (req.method === 'GET' && pathname === '/api/admin/routing/combos') {
      const result = await pool.query('SELECT * FROM routing_combos ORDER BY display_name');
      sendAuthJson(res,200,{combos:result.rows.map(normalize)}); return true;
    }
    if (req.method === 'POST' && pathname === '/api/admin/routing/combos') {
      const parsed = comboSchema.safeParse(await readJsonBody(req,12000));
      if (!parsed.success) { sendAuthJson(res,400,{error:'Invalid combo configuration.',details:parsed.error.flatten()}); return true; }
      const available = await verifiedModelIds();
      const unavailable = parsed.data.modelIds.filter(id => !available.has(id));
      if (unavailable.length) { sendAuthJson(res,409,{error:'Every combo model must be currently verified, enabled, and support streaming text.',unavailable}); return true; }
      const d = parsed.data;
      const result = await pool.query(
        `INSERT INTO routing_combos(slug,display_name,strategy,model_ids,fallback_on_error,enabled,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [d.slug,d.displayName,d.strategy,d.modelIds,d.fallbackOnError,d.enabled,user.id]);
      sendAuthJson(res,201,{combo:normalize(result.rows[0])}); return true;
    }
    const match = pathname.match(/^\/api\/admin\/routing\/combos\/([a-z0-9-]+)$/);
    if (match && req.method === 'PATCH') {
      const body = await readJsonBody(req,12000);
      const current = await pool.query('SELECT * FROM routing_combos WHERE slug=$1 LIMIT 1',[match[1]]);
      if (!current.rows[0]) { sendAuthJson(res,404,{error:'Combo not found.'}); return true; }
      const old = current.rows[0];
      const merged = {
        slug: body.slug ?? old.slug, displayName: body.displayName ?? old.display_name,
        strategy: body.strategy ?? old.strategy, modelIds: body.modelIds ?? old.model_ids,
        fallbackOnError: body.fallbackOnError ?? old.fallback_on_error, enabled: body.enabled ?? old.enabled,
      };
      const parsed = comboSchema.safeParse(merged);
      if (!parsed.success) { sendAuthJson(res,400,{error:'Invalid combo configuration.',details:parsed.error.flatten()}); return true; }
      const available = await verifiedModelIds();
      const unavailable = parsed.data.modelIds.filter(id => !available.has(id));
      if (unavailable.length) { sendAuthJson(res,409,{error:'Combo contains models that are not currently verified.',unavailable}); return true; }
      const d = parsed.data;
      const updated = await pool.query(
        `UPDATE routing_combos SET slug=$2,display_name=$3,strategy=$4,model_ids=$5,
          fallback_on_error=$6,enabled=$7,next_index=0,updated_at=now()
          WHERE slug=$1 RETURNING *`,
        [match[1],d.slug,d.displayName,d.strategy,d.modelIds,d.fallbackOnError,d.enabled]);
      sendAuthJson(res,200,{combo:normalize(updated.rows[0])}); return true;
    }
    if (match && req.method === 'DELETE') {
      const deleted = await pool.query('DELETE FROM routing_combos WHERE slug=$1 RETURNING slug',[match[1]]);
      if (!deleted.rows.length) { sendAuthJson(res,404,{error:'Combo not found.'}); return true; }
      sendAuthJson(res,200,{deleted:true,slug:match[1]}); return true;
    }
    sendAuthJson(res,405,{error:'Method not allowed.'}); return true;
  } catch (error) {
    if ((error as {code?:string})?.code === '23505') { sendAuthJson(res,409,{error:'A combo with this slug already exists.'}); return true; }
    console.error('AFG_ROUTING_COMBO_API_FAILED',JSON.stringify({error:error instanceof Error?error.message:'unknown_error'}));
    sendAuthJson(res,500,{error:'Could not process routing combo request.'}); return true;
  }
}
