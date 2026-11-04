import { createHash } from 'node:crypto';
import { pool } from '../api/database.ts';

const SOURCE = 'https://publicapis.lol/api/apis';
const MAX_PAGES = 100;
const PAGE_TIMEOUT_MS = 20_000;

type RawApi = Record<string, unknown>;
export type PublicApiRecord = {
  sourceKey: string;
  name: string;
  description: string;
  auth: string;
  https: string;
  cors: string;
  category: string;
  homepageUrl: string | null;
  docsUrl: string | null;
  healthStatus: 'unknown' | 'online' | 'slow' | 'offline' | 'error';
  responseTimeMs: number | null;
  raw: RawApi;
};

function field(row: RawApi, ...keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
  }
  const lower = new Map(Object.entries(row).map(([key, value]) => [key.toLowerCase().replace(/[^a-z0-9]/g, ''), value]));
  for (const key of keys) {
    const value = lower.get(key.toLowerCase().replace(/[^a-z0-9]/g, ''));
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function text(value: unknown, max: number, fallback = ''): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim().slice(0, max) || fallback;
  }
  return fallback;
}

function triState(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const normalized = text(value, 40, 'Unknown').toLowerCase();
  if (['yes','true','1','enabled','supported'].includes(normalized)) return 'Yes';
  if (['no','false','0','none','disabled','not supported'].includes(normalized)) return 'No';
  if (normalized === 'unknown' || normalized === '?') return 'Unknown';
  return text(value, 40, 'Unknown');
}

function safeHttpUrl(value: unknown): string | null {
  const raw = text(value, 2048);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return ['https:','http:'].includes(url.protocol) && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}

function unwrapRows(payload: unknown): { rows: RawApi[]; hasMore: boolean | null } {
  if (Array.isArray(payload)) return { rows: payload.filter((v): v is RawApi => Boolean(v) && typeof v === 'object' && !Array.isArray(v)), hasMore: null };
  if (!payload || typeof payload !== 'object') return { rows: [], hasMore: false };
  const object = payload as Record<string, unknown>;
  const nested = [object.apis, object.items, object.results, object.data, object.entries]
    .find((value) => Array.isArray(value));
  if (Array.isArray(nested)) {
    return {
      rows: nested.filter((v): v is RawApi => Boolean(v) && typeof v === 'object' && !Array.isArray(v)),
      hasMore: object.has_more === true || object.hasMore === true || object.next_page !== null && object.next_page !== undefined,
    };
  }
  const data = object.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const child = data as Record<string, unknown>;
    const rows = [child.apis, child.items, child.results, child.entries].find(Array.isArray);
    if (Array.isArray(rows)) {
      return {
        rows: rows.filter((v): v is RawApi => Boolean(v) && typeof v === 'object' && !Array.isArray(v)),
        hasMore: child.has_more === true || child.hasMore === true || child.next_page !== null && child.next_page !== undefined,
      };
    }
  }
  return { rows: [], hasMore: false };
}

function normalize(row: RawApi): PublicApiRecord | null {
  const name = text(field(row, 'API','name','apiName','title'), 160);
  if (!name) return null;
  const description = text(field(row, 'Description','description','summary'), 1200);
  const category = text(field(row, 'Category','category','group'), 100, 'Uncategorized');
  const homepageUrl = safeHttpUrl(field(row, 'Homepage','homepage','website','url'));
  const docsUrl = safeHttpUrl(field(row, 'Link','link','docs','documentation','documentationUrl','callThisApi')) || homepageUrl;
  const stable = [name.toLowerCase(), category.toLowerCase(), docsUrl || homepageUrl || ''].join('|');
  const sourceKey = createHash('sha256').update(stable).digest('hex');
  const healthValue = text(field(row, 'status','healthStatus','health'), 24).toLowerCase();
  const healthStatus = (['online','slow','offline','error'].includes(healthValue) ? healthValue : 'unknown') as PublicApiRecord['healthStatus'];
  const time = Number(field(row,'responseTimeMs','response_time_ms','latencyMs'));
  return {
    sourceKey, name, description,
    auth: text(field(row,'Auth','auth','authentication'),40,'Unknown'),
    https: triState(field(row,'HTTPS','https','supportsHttps')),
    cors: triState(field(row,'CORS','cors','supportsCors')),
    category, homepageUrl, docsUrl, healthStatus,
    responseTimeMs: Number.isInteger(time) && time >= 0 && time <= 600000 ? time : null,
    raw: row,
  };
}

async function fetchPage(page: number): Promise<{ rows: PublicApiRecord[]; hasMore: boolean | null }> {
  const url = new URL(SOURCE);
  url.searchParams.set('page', String(page));
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'AFG-AI-API-Hub/1.0' },
    signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`Public API directory returned HTTP ${response.status} on page ${page}.`);
  const body = await response.text();
  if (body.length > 5_000_000) throw new Error('Public API directory page exceeded the 5 MB safety limit.');
  let payload: unknown;
  try { payload = JSON.parse(body); } catch { throw new Error('Public API directory returned invalid JSON.'); }
  const extracted = unwrapRows(payload);
  return { rows: extracted.rows.map(normalize).filter((row): row is PublicApiRecord => row !== null), hasMore: extracted.hasMore };
}

let syncInFlight: Promise<{ imported: number; pages: number; complete: boolean }> | null = null;

export async function syncPublicApiCatalog(): Promise<{ imported: number; pages: number; complete: boolean }> {
  if (!pool) throw new Error('The API catalog requires the PostgreSQL database.');
  if (syncInFlight) return syncInFlight;
  syncInFlight = (async () => {
    await pool.query(`INSERT INTO public_api_sync_state(source,status,last_started_at,last_error,updated_at)
      VALUES('publicapis.lol','running',now(),NULL,now())
      ON CONFLICT(source) DO UPDATE SET status='running',last_started_at=now(),last_error=NULL,updated_at=now()`);
    let imported = 0;
    let pages = 0;
    let complete = false;
    try {
      for (let page = 1; page <= MAX_PAGES; page++) {
        const result = await fetchPage(page);
        pages++;
        if (!result.rows.length) { complete = true; break; }
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          for (let offset = 0; offset < result.rows.length; offset += 80) {
            const batch = result.rows.slice(offset, offset + 80);
            const values: unknown[] = [];
            const tuples = batch.map((item, index) => {
              const base = index * 13;
              values.push(item.sourceKey,item.name,item.description,item.auth,item.https,item.cors,item.category,
                item.homepageUrl,item.docsUrl,item.healthStatus,item.responseTimeMs,JSON.stringify(item.raw),true);
              return `(${Array.from({length:13},(_,i)=>'$'+(base+i+1)).join(',')},now(),now())`;
            });
            await client.query(`INSERT INTO public_api_catalog
              (source_key,name,description,auth,https,cors,category,homepage_url,docs_url,health_status,response_time_ms,source_payload,is_active,imported_at,updated_at)
              VALUES ${tuples.join(',')}
              ON CONFLICT(source_key) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,
                auth=EXCLUDED.auth,https=EXCLUDED.https,cors=EXCLUDED.cors,category=EXCLUDED.category,
                homepage_url=EXCLUDED.homepage_url,docs_url=EXCLUDED.docs_url,
                health_status=CASE WHEN public_api_catalog.last_health_check IS NULL THEN EXCLUDED.health_status ELSE public_api_catalog.health_status END,
                response_time_ms=CASE WHEN public_api_catalog.last_health_check IS NULL THEN EXCLUDED.response_time_ms ELSE public_api_catalog.response_time_ms END,
                source_payload=EXCLUDED.source_payload,is_active=true,imported_at=now(),updated_at=now()`, values);
          }
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally { client.release(); }
        imported += result.rows.length;
        if (result.hasMore === false) { complete = true; break; }
        if (result.hasMore === null && result.rows.length < 10) { complete = true; break; }
      }
      if (!complete && pages < MAX_PAGES) complete = true;
      const status = complete ? 'success' : 'partial';
      await pool.query(`UPDATE public_api_sync_state SET status=$2,items_imported=$3,pages_fetched=$4,
        last_completed_at=now(),last_error=NULL,updated_at=now() WHERE source='publicapis.lol'`,
        [SOURCE,status,imported,pages]);
      return { imported, pages, complete };
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0,500) : 'Catalog sync failed.';
      await pool.query(`UPDATE public_api_sync_state SET status='error',items_imported=$2,pages_fetched=$3,
        last_completed_at=now(),last_error=$4,updated_at=now() WHERE source='publicapis.lol'`,
        [SOURCE,imported,pages,message]).catch(() => {});
      throw error;
    }
  })();
  try { return await syncInFlight; } finally { syncInFlight = null; }
}

export async function queryPublicApiCatalog(filters: {
  q?: string; category?: string; auth?: string; https?: string; cors?: string; page?: number; pageSize?: number;
}) {
  if (!pool) throw new Error('The API catalog requires the PostgreSQL database.');
  const page = Math.max(1, Math.min(100000, Math.trunc(filters.page || 1)));
  const pageSize = Math.max(1, Math.min(100, Math.trunc(filters.pageSize || 24)));
  const where: string[] = ['is_active=true'];
  const values: unknown[] = [];
  const add = (value: unknown) => { values.push(value); return '$' + values.length; };
  if (filters.q?.trim()) {
    const needle = '%' + filters.q.trim().slice(0,120).replace(/[\\%_]/g, '\\$&') + '%';
    const param = add(needle);
    where.push(`(name ILIKE ${param} OR description ILIKE ${param} OR category ILIKE ${param})`);
  }
  if (filters.category && filters.category !== 'all') where.push('category=$' + (values.push(filters.category.slice(0,100))));
  if (filters.auth && filters.auth !== 'all') where.push('lower(auth)=lower($' + values.push(filters.auth.slice(0,40)) + ')');
  if (filters.https && filters.https !== 'all') where.push('lower(https)=lower($' + values.push(filters.https==='true'?'Yes':'No') + ')');
  if (filters.cors && filters.cors !== 'all') where.push('lower(cors)=lower($' + values.push(filters.cors==='true'?'Yes':'No') + ')');
  const clause = where.join(' AND ');
  const count = await pool.query(`SELECT count(*)::int AS total FROM public_api_catalog WHERE ${clause}`, values);
  const rows = await pool.query(`SELECT source_key,name,description,auth,https,cors,category,homepage_url,docs_url,
      health_status,response_time_ms,last_health_check,imported_at
    FROM public_api_catalog WHERE ${clause} ORDER BY category,name LIMIT ${pageSize} OFFSET ${(page-1)*pageSize}`, values);
  return { items: rows.rows, page, pageSize, total: Number(count.rows[0]?.total || 0), categories: await listPublicApiCategories() };
}

export async function listPublicApiCategories() {
  if (!pool) return [];
  const result = await pool.query(`SELECT category,count(*)::int AS count
    FROM public_api_catalog WHERE is_active=true GROUP BY category ORDER BY category`);
  return result.rows;
}

export async function getPublicApiSyncStatus() {
  if (!pool) return { configured: false, status: 'unavailable' };
  const result = await pool.query(`SELECT source,status,items_imported,pages_fetched,last_started_at,last_completed_at,last_error
    FROM public_api_sync_state WHERE source='publicapis.lol' LIMIT 1`);
  return { configured: true, sync: result.rows[0] || null };
}
