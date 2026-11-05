import { createHash } from 'node:crypto';
import { pool } from '../api/database.ts';

const MNFST_SOURCE = 'mnfst/awesome-free-llm-apis';
const OPEN_FREE_SOURCE = 'open-free-llm-api/awesome-freellm-apis';
const MNFST_DATA_URL = 'https://raw.githubusercontent.com/mnfst/awesome-free-llm-apis/main/data.json';
const OPEN_FREE_README_URL = 'https://raw.githubusercontent.com/open-free-llm-api/awesome-freellm-apis/main/README.md';
const FETCH_TIMEOUT_MS = 30_000;
const MAX_SOURCE_BYTES = 4_000_000;

type SourceName = typeof MNFST_SOURCE | typeof OPEN_FREE_SOURCE;
type FreeTierType = 'permanent' | 'renewable' | 'trial' | 'promotional' | 'unknown';
type PaymentRequirement = 'no_card' | 'card' | 'phone_verification' | 'registration' | 'unknown';

type LlmApiRecord = {
  source: SourceName;
  sourceKey: string;
  providerSlug: string;
  providerName: string;
  providerType: 'provider_api' | 'inference_provider' | 'unknown';
  baseUrl: string | null;
  apiKeyUrl: string | null;
  providerUrl: string | null;
  description: string;
  freeTierType: FreeTierType;
  paymentRequirement: PaymentRequirement;
  freeTierDetails: string;
  modelId: string | null;
  modelName: string | null;
  modelPageUrl: string | null;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  modalities: string[];
  rateLimit: string | null;
  sourceUpdatedAt: string | null;
  sourcePayload: Record<string, unknown>;
};

type SyncResult = {
  complete: boolean;
  sources: Array<{ source: SourceName; imported: number; providers: number; status: 'success' | 'error'; error?: string; sourceUpdatedAt: string | null }>;
  imported: number;
  providers: number;
};

let syncInFlight: Promise<SyncResult> | null = null;

function safeString(value: unknown, max = 2000): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max) : '';
}

function safeHttpsUrl(value: unknown): string | null {
  const raw = safeString(value, 2048);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null;
    return url.toString().slice(0, 2048);
  } catch {
    return null;
  }
}

function makeSourceKey(source: SourceName, providerSlug: string, modelId: string | null): string {
  return createHash('sha256').update([source, providerSlug, modelId || '__provider__'].join('|')).digest('hex');
}

function slugify(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'unknown';
}

function contextNumber(value: unknown): number | null {
  const raw = safeString(value, 40).replace(/,/g, '').trim().toUpperCase();
  if (!raw || raw === '-' || raw === 'UNKNOWN' || raw === 'DYNAMIC') return null;
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*([KM])?$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const multiplier = match[2] === 'M' ? 1_000_000 : match[2] === 'K' ? 1_000 : 1;
  const parsed = Math.round(amount * multiplier);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 10_000_000 ? parsed : null;
}

function inferPaymentRequirement(...parts: string[]): PaymentRequirement {
  const value = parts.join(' ').toLowerCase();
  if (/phone\s+verification|phone\s+verified|sms\s+verification/.test(value)) return 'phone_verification';
  if (/credit\s+card\s+required|card\s+required|requires?\s+a\s+card/.test(value)) return 'card';
  if (parts.some(part => part.trim().toLowerCase() === 'no') || /no\s+credit\s+card|without\s+(?:a\s+)?credit\s+card|no\s+card|anonymous\s+access/.test(value)) return 'no_card';
  if (/registration|sign[ -]?up|account\s+required|requires?\s+an?\s+account/.test(value)) return 'registration';
  return 'unknown';
}

function inferFreeTierType(description: string, fallback: FreeTierType = 'unknown'): FreeTierType {
  const value = description.toLowerCase();
  if (/renewable\s+credits|periodically\s+renew|monthly\s+credits|daily\s+credits\s+reset/.test(value)) return 'renewable';
  if (/trial\s+api|trial\s+key|trial\s+tier/.test(value)) return 'trial';
  if (/limited[ -]time|first[ -]come|promotional|promo\s+allowance/.test(value)) return 'promotional';
  if (/permanent(?:ly)?\s+free|free\s+forever|permanent\s+free\s+tier/.test(value)) return 'permanent';
  return fallback;
}

function parseHtmlAnchor(value: string): { text: string; href: string | null } {
  const anchor = value.match(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
  const href = anchor ? safeHttpsUrl(anchor[1]) : null;
  const text = (anchor ? anchor[2] : value).replace(/<[^>]+>/g, '').replace(/&rarr;|&#8594;/gi, '→').replace(/&amp;/gi, '&').replace(/&nbsp;/gi, ' ').trim();
  return { text, href };
}

function markdownCells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(value => value.trim());
}

function markedSection(lines: string[], startMarker: string, endMarker: string): string[] {
  const start = lines.findIndex(line => line.includes(startMarker));
  if (start < 0) return [];
  const end = lines.findIndex((line, index) => index > start && line.includes(endMarker));
  return lines.slice(start + 1, end < 0 ? lines.length : end);
}

async function fetchBoundedText(url: string, accept: string): Promise<string> {
  const safeUrl = safeHttpsUrl(url);
  if (!safeUrl) throw new Error('Upstream source URL is not a valid HTTPS URL.');
  const response = await fetch(safeUrl, {
    headers: { Accept: accept, 'User-Agent': 'AFG-AI-LLM-Catalog/1.0' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('Upstream LLM catalogue returned HTTP ' + response.status + '.');
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > MAX_SOURCE_BYTES) throw new Error('Upstream LLM catalogue exceeded the size limit.');
  const body = await response.text();
  if (body.length > MAX_SOURCE_BYTES) throw new Error('Upstream LLM catalogue exceeded the size limit.');
  return body;
}

function toRecord(input: Omit<LlmApiRecord, 'sourceKey'>): LlmApiRecord {
  return { ...input, sourceKey: makeSourceKey(input.source, input.providerSlug, input.modelId) };
}

function parseMnfstDataset(raw: string): { records: LlmApiRecord[]; updatedAt: string | null } {
  let payload: any;
  try { payload = JSON.parse(raw); } catch { throw new Error('The mnfst source did not return valid JSON.'); }
  if (!payload || !Array.isArray(payload.providers)) throw new Error('The mnfst source is missing its provider list.');
  const updatedAt = /^\d{4}-\d{2}-\d{2}$/.test(safeString(payload.lastUpdated, 20)) ? payload.lastUpdated : null;
  const records: LlmApiRecord[] = [];
  for (const provider of payload.providers) {
    const providerName = safeString(provider?.name, 160);
    if (!providerName || /gemini|google\s+ai/i.test(providerName)) continue;
    const providerSlug = slugify(providerName);
    const description = safeString(provider.description, 2000);
    const providerType = provider.category === 'provider_api' ? 'provider_api' : provider.category === 'inference_provider' ? 'inference_provider' : 'unknown';
    const baseUrl = safeHttpsUrl(provider.baseUrl);
    const apiKeyUrl = safeHttpsUrl(provider.url);
    const models = Array.isArray(provider.models) ? provider.models : [];
    if (!models.length) {
      records.push(toRecord({
        source: MNFST_SOURCE, providerSlug, providerName, providerType,
        baseUrl, apiKeyUrl, providerUrl: null, description,
        freeTierType: inferFreeTierType(description), paymentRequirement: inferPaymentRequirement(description),
        freeTierDetails: description, modelId: null, modelName: null, modelPageUrl: null,
        contextWindow: null, maxOutputTokens: null, modalities: [], rateLimit: null,
        sourceUpdatedAt: updatedAt, sourcePayload: { provider: { name: providerName, category: provider.category, country: provider.country } },
      }));
      continue;
    }
    for (const model of models) {
      const modelId = safeString(model?.id, 300);
      if (!modelId) continue;
      const modalityText = safeString(model.modality, 300);
      const modalities = [...new Set(modalityText.toLowerCase().split(/[+,/]|\s+and\s+/).map(item => item.trim()).filter(Boolean))].slice(0, 20);
      records.push(toRecord({
        source: MNFST_SOURCE, providerSlug, providerName, providerType,
        baseUrl, apiKeyUrl, providerUrl: null, description,
        freeTierType: inferFreeTierType(description), paymentRequirement: inferPaymentRequirement(description),
        freeTierDetails: description, modelId, modelName: safeString(model.name || model.id, 300),
        modelPageUrl: null, contextWindow: contextNumber(model.context), maxOutputTokens: contextNumber(model.maxOutput),
        modalities, rateLimit: safeString(model.rateLimit, 300) || null, sourceUpdatedAt: updatedAt,
        sourcePayload: { provider: { name: providerName, category: provider.category }, model },
      }));
    }
  }
  if (!records.length) throw new Error('No eligible provider or model records were parsed from mnfst data.json.');
  return { records, updatedAt };
}

function parseOpenFreeReadme(markdown: string): { records: LlmApiRecord[]; updatedAt: string | null } {
  const lines = markdown.split(/\r?\n/);
  const updatedAt = (markdown.match(/Last updated:\s*(\d{4}-\d{2}-\d{2})/) || [])[1] || null;
  const providerInfo = new Map<string, {
    providerName: string; providerSlug: string; baseUrl: string | null; apiKeyUrl: string | null;
    freeTierType: FreeTierType; paymentRequirement: PaymentRequirement; freeTierDetails: string;
    modalities: string[]; contextWindow: number | null; modelCount: number | null;
  }>();
  const ensureProvider = (name: string) => {
    const providerSlug = slugify(name);
    let item = providerInfo.get(providerSlug);
    if (!item) {
      item = { providerName: name, providerSlug, baseUrl: null, apiKeyUrl: null, freeTierType: 'unknown', paymentRequirement: 'unknown', freeTierDetails: '', modalities: [], contextWindow: null, modelCount: null };
      providerInfo.set(providerSlug, item);
    }
    return item;
  };
  for (const section of [
    { rows: markedSection(lines, 'BEGIN_PERMANENT_FREE', 'END_PERMANENT_FREE'), type: 'permanent' as const },
    { rows: markedSection(lines, 'BEGIN_RENEWABLE', 'END_RENEWABLE'), type: 'renewable' as const },
  ]) {
    for (const line of section.rows) {
      if (!line.trim().startsWith('|') || line.includes('|---')) continue;
      const cells = markdownCells(line);
      if (cells.length < 6 || /^provider$/i.test(cells[0])) continue;
      const anchor = parseHtmlAnchor(cells[0]);
      const providerName = safeString(anchor.text, 160);
      if (!providerName || /gemini|google\s+ai/i.test(providerName)) continue;
      const provider = ensureProvider(providerName);
      provider.freeTierType = section.type;
      const freeDetails = cells.slice(1, 5).map(cell => parseHtmlAnchor(cell).text).join(' · ').slice(0, 800);
      provider.freeTierDetails = freeDetails;
      provider.paymentRequirement = inferPaymentRequirement(cells[2], cells[1]);
      provider.modelCount = contextNumber(cells[1]);
      provider.contextWindow = contextNumber(cells[3]);
      provider.modalities = [...new Set(cells[4].split(',').map(value => value.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
      const keyAnchor = parseHtmlAnchor(cells[5]);
      if (!provider.apiKeyUrl && keyAnchor.href) provider.apiKeyUrl = keyAnchor.href;
    }
  }

  const quickReference = markedSection(lines, 'BEGIN_QUICK_REF', 'END_QUICK_REF');
  for (const line of quickReference) {
    if (!line.trim().startsWith('|') || line.includes('|---')) continue;
    const cells = markdownCells(line);
    if (cells.length < 4 || /^provider$/i.test(cells[0])) continue;
    const name = safeString(parseHtmlAnchor(cells[0]).text, 160);
    if (!name || /gemini|google\s+ai/i.test(name)) continue;
    const provider = ensureProvider(name);
    const base = safeString(cells[1].replace(/^`|`$/g, ''), 2048);
    if (!provider.baseUrl && base.startsWith('https://')) provider.baseUrl = base;
    const keyAnchor = parseHtmlAnchor(cells[2]);
    if (!provider.apiKeyUrl && keyAnchor.href) provider.apiKeyUrl = keyAnchor.href;
    const payment = inferPaymentRequirement(cells[3]);
    if (provider.paymentRequirement === 'unknown' && payment !== 'unknown') provider.paymentRequirement = payment;
  }

  const records: LlmApiRecord[] = [];
  const seenModels = new Set<string>();
  let currentProvider: ReturnType<typeof ensureProvider> | null = null;
  const bestModels = markedSection(lines, 'BEGIN_BEST_MODELS', 'END_BEST_MODELS');
  for (const line of bestModels) {
    if (!line.trim().startsWith('|') || line.includes('|---')) continue;
    const cells = markdownCells(line);
    if (cells.length < 5 || /^provider$/i.test(cells[0])) continue;
    const providerCell = safeString(parseHtmlAnchor(cells[0]).text, 160);
    if (providerCell) {
      if (/gemini|google\s+ai/i.test(providerCell)) { currentProvider = null; continue; }
      currentProvider = ensureProvider(providerCell);
    }
    if (!currentProvider) continue;
    const modelCell = parseHtmlAnchor(cells[1]);
    const modelId = safeString(cells[2].replace(/^`|`$/g, ''), 300);
    if (!modelId || seenModels.has(currentProvider.providerSlug + '::' + modelId)) continue;
    seenModels.add(currentProvider.providerSlug + '::' + modelId);
    const modelPageUrl = modelCell.href;
    const modelName = safeString(modelCell.text, 300) || modelId;
    const context = contextNumber(cells[3]);
    const freeDetails = currentProvider.freeTierDetails;
    records.push(toRecord({
      source: OPEN_FREE_SOURCE, providerSlug: currentProvider.providerSlug, providerName: currentProvider.providerName,
      providerType: 'inference_provider', baseUrl: currentProvider.baseUrl, apiKeyUrl: currentProvider.apiKeyUrl,
      providerUrl: null, description: freeDetails,
      freeTierType: currentProvider.freeTierType, paymentRequirement: currentProvider.paymentRequirement,
      freeTierDetails: freeDetails, modelId, modelName, modelPageUrl, contextWindow: context,
      maxOutputTokens: null, modalities: currentProvider.modalities, rateLimit: safeString(cells[4], 300) || null,
      sourceUpdatedAt: updatedAt, sourcePayload: { provider: currentProvider.providerName, modelName, modelId, context: cells[3], rateLimit: cells[4] },
    }));
  }

  for (const provider of providerInfo.values()) {
    const hasModel = records.some(record => record.providerSlug === provider.providerSlug);
    if (hasModel) continue;
    records.push(toRecord({
      source: OPEN_FREE_SOURCE, providerSlug: provider.providerSlug, providerName: provider.providerName,
      providerType: 'inference_provider', baseUrl: provider.baseUrl, apiKeyUrl: provider.apiKeyUrl, providerUrl: null,
      description: provider.freeTierDetails, freeTierType: provider.freeTierType,
      paymentRequirement: provider.paymentRequirement, freeTierDetails: provider.freeTierDetails,
      modelId: null, modelName: null, modelPageUrl: null, contextWindow: provider.contextWindow,
      maxOutputTokens: null, modalities: provider.modalities, rateLimit: null, sourceUpdatedAt: updatedAt,
      sourcePayload: { provider: provider.providerName, modelCount: provider.modelCount },
    }));
  }

  if (!records.length) throw new Error('No eligible provider or model records were parsed from the open-free README.');
  return { records, updatedAt };
}

async function persistRecords(records: LlmApiRecord[]): Promise<void> {
  if (!pool) throw new Error('The LLM API catalogue requires PostgreSQL.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of records) {
      await client.query(`INSERT INTO llm_api_catalog (
        source_key,source,provider_slug,provider_name,provider_type,base_url,api_key_url,provider_url,description,
        free_tier_type,payment_requirement,free_tier_details,model_id,model_name,model_page_url,context_window,
        max_output_tokens,modalities,rate_limit,source_updated_at,source_payload,is_active,first_seen_at,last_seen_at,updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb,true,now(),now(),now()
      )
      ON CONFLICT(source_key) DO UPDATE SET
        provider_name=EXCLUDED.provider_name,provider_type=EXCLUDED.provider_type,base_url=EXCLUDED.base_url,
        api_key_url=EXCLUDED.api_key_url,provider_url=EXCLUDED.provider_url,description=EXCLUDED.description,
        free_tier_type=EXCLUDED.free_tier_type,payment_requirement=EXCLUDED.payment_requirement,
        free_tier_details=EXCLUDED.free_tier_details,model_name=EXCLUDED.model_name,model_page_url=EXCLUDED.model_page_url,
        context_window=EXCLUDED.context_window,max_output_tokens=EXCLUDED.max_output_tokens,modalities=EXCLUDED.modalities,
        rate_limit=EXCLUDED.rate_limit,source_updated_at=EXCLUDED.source_updated_at,source_payload=EXCLUDED.source_payload,
        is_active=true,last_seen_at=now(),updated_at=now()`,
      [
        item.sourceKey,item.source,item.providerSlug,item.providerName,item.providerType,item.baseUrl,item.apiKeyUrl,item.providerUrl,
        item.description,item.freeTierType,item.paymentRequirement,item.freeTierDetails,item.modelId,item.modelName,item.modelPageUrl,
        item.contextWindow,item.maxOutputTokens,item.modalities,item.rateLimit,item.sourceUpdatedAt,JSON.stringify(item.sourcePayload),
      ]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateSyncState(source: SourceName, values: {
  status: 'running' | 'success' | 'partial' | 'error';
  itemsImported?: number;
  providersImported?: number;
  sourceUpdatedAt?: string | null;
  error?: string | null;
}): Promise<void> {
  if (!pool) return;
  await pool.query(`INSERT INTO llm_api_sync_state(source,status,items_imported,providers_imported,source_updated_at,last_started_at,last_completed_at,last_error,updated_at)
    VALUES($1,$2,$3,$4,$5,CASE WHEN $2='running' THEN now() ELSE NULL END,CASE WHEN $2='running' THEN NULL ELSE now() END,$6,now())
    ON CONFLICT(source) DO UPDATE SET status=EXCLUDED.status,items_imported=EXCLUDED.items_imported,
      providers_imported=EXCLUDED.providers_imported,source_updated_at=COALESCE(EXCLUDED.source_updated_at,llm_api_sync_state.source_updated_at),
      last_started_at=CASE WHEN EXCLUDED.status='running' THEN now() ELSE llm_api_sync_state.last_started_at END,
      last_completed_at=CASE WHEN EXCLUDED.status='running' THEN llm_api_sync_state.last_completed_at ELSE now() END,
      last_error=EXCLUDED.last_error,updated_at=now()`,
    [source,values.status,values.itemsImported||0,values.providersImported||0,values.sourceUpdatedAt||null,values.error||null]);
}

export async function syncPublicLlmCatalog(): Promise<SyncResult> {
  if (!pool) throw new Error('The LLM API catalogue requires PostgreSQL.');
  if (syncInFlight) return syncInFlight;
  syncInFlight = (async (): Promise<SyncResult> => {
    const outcomes: SyncResult['sources'] = [];
    await Promise.all([updateSyncState(MNFST_SOURCE,{status:'running'}),updateSyncState(OPEN_FREE_SOURCE,{status:'running'})]);
    const jobs: Array<{source:SourceName; run:()=>Promise<{records:LlmApiRecord[];updatedAt:string|null}>}> = [
      {source:MNFST_SOURCE,run:async()=>parseMnfstDataset(await fetchBoundedText(MNFST_DATA_URL,'application/json'))},
      {source:OPEN_FREE_SOURCE,run:async()=>parseOpenFreeReadme(await fetchBoundedText(OPEN_FREE_README_URL,'text/plain'))},
    ];
    let totalImported=0;
    let totalProviders=0;
    for (const job of jobs) {
      try {
        const result=await job.run();
        await persistRecords(result.records);
        const providerCount=new Set(result.records.map(record=>record.providerSlug)).size;
        await pool.query('UPDATE llm_api_catalog SET is_active=false,updated_at=now() WHERE source=$1 AND NOT (source_key=ANY($2::text[]))',[job.source,result.records.map(record=>record.sourceKey)]);
        await updateSyncState(job.source,{status:'success',itemsImported:result.records.length,providersImported:providerCount,sourceUpdatedAt:result.updatedAt,error:null});
        totalImported+=result.records.length;
        totalProviders+=providerCount;
        outcomes.push({source:job.source,imported:result.records.length,providers:providerCount,status:'success',sourceUpdatedAt:result.updatedAt});
      } catch(error) {
        const message=error instanceof Error?error.message.slice(0,400):'Source import failed.';
        await updateSyncState(job.source,{status:'error',error:message});
        outcomes.push({source:job.source,imported:0,providers:0,status:'error',error:message,sourceUpdatedAt:null});
      }
    }
    return {complete:outcomes.every(item=>item.status==='success'),sources:outcomes,imported:totalImported,providers:totalProviders};
  })();
  try { return await syncInFlight; } finally { syncInFlight=null; }
}

export async function queryLlmApiCatalog(filters: { q?:string; provider?:string; freeTier?:string; page?:number; pageSize?:number }) {
  if (!pool) throw new Error('The LLM API catalogue requires PostgreSQL.');
  const page=Math.max(1,Math.min(100000,Math.trunc(filters.page||1)));
  const pageSize=Math.max(1,Math.min(100,Math.trunc(filters.pageSize||24)));
  const where:string[]=['c.is_active=true','c.eligibility_status NOT IN (\'blocked\',\'retired\')'];
  const values:unknown[]=[];
  const add=(value:unknown)=>{values.push(value);return '$'+values.length;};
  if(filters.q?.trim()){
    const needle='%'+filters.q.trim().slice(0,120).replace(/[\\%_]/g,'\\$&')+'%';
    where.push('(c.provider_name ILIKE '+add(needle)+' OR COALESCE(c.model_name,\'\') ILIKE '+add(needle)+' OR COALESCE(c.model_id,\'\') ILIKE '+add(needle)+' OR c.description ILIKE '+add(needle)+')');
  }
  if(filters.provider?.trim())where.push('c.provider_slug='+add(filters.provider.trim().toLowerCase().slice(0,80)));
  if(filters.freeTier&&filters.freeTier!=='all')where.push('c.free_tier_type='+add(filters.freeTier));
  const clause=where.join(' AND ');
  const count=await pool.query(`SELECT count(*)::int AS total FROM (
    SELECT c.provider_slug,COALESCE(c.model_id,'') AS model_key
    FROM llm_api_catalog c WHERE ${clause}
    GROUP BY c.provider_slug,COALESCE(c.model_id,'')
  ) deduplicated`,values);
  const rows=await pool.query(`SELECT DISTINCT ON (c.provider_slug,COALESCE(c.model_id,'')) c.source,c.source_key,c.provider_slug,c.provider_name,c.provider_type,
    c.base_url,c.api_key_url,c.description,c.free_tier_type,c.payment_requirement,c.free_tier_details,
    c.model_id,c.model_name,c.model_page_url,c.context_window,c.max_output_tokens,c.modalities,c.rate_limit,
    c.source_updated_at,c.eligibility_status,c.review_note,
    (SELECT array_agg(DISTINCT related.source ORDER BY related.source) FROM llm_api_catalog related
      WHERE related.is_active=true AND related.provider_slug=c.provider_slug AND COALESCE(related.model_id,'')=COALESCE(c.model_id,'')) AS sources
    FROM llm_api_catalog c WHERE ${clause}
    ORDER BY c.provider_slug,COALESCE(c.model_id,''),CASE WHEN c.source='${MNFST_SOURCE}' THEN 0 ELSE 1 END
    LIMIT ${pageSize} OFFSET ${(page-1)*pageSize}`,values);
  return {items:rows.rows,page,pageSize,total:Number(count.rows[0]?.total||0)};
}

export async function getLlmApiSyncStatus() {
  if (!pool) return {configured:false,providers:0,models:0,sources:[]};
  const [states,counts]=await Promise.all([
    pool.query('SELECT source,status,items_imported,providers_imported,source_updated_at,last_started_at,last_completed_at,last_error FROM llm_api_sync_state ORDER BY source'),
    pool.query(`SELECT count(DISTINCT provider_slug)::int AS providers,
      count(DISTINCT (provider_slug||'::'||model_id)) FILTER(WHERE model_id IS NOT NULL)::int AS models,
      count(*) FILTER(WHERE eligibility_status='candidate')::int AS candidate_records
      FROM llm_api_catalog WHERE is_active=true`),
  ]);
  return {configured:true,providers:Number(counts.rows[0]?.providers||0),models:Number(counts.rows[0]?.models||0),
    candidateRecords:Number(counts.rows[0]?.candidate_records||0),sources:states.rows};
}
