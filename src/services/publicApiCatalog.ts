import { createHash } from 'node:crypto';
import { pool } from '../api/database.ts';

const DIRECTORY_API = 'https://publicapis.lol/api/apis';
const REPOSITORY_README = 'https://raw.githubusercontent.com/public-apis/public-apis/master/README.md';
const REPOSITORY_SOURCE = 'public-apis/public-apis';
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
  iconUrl: string | null;
  imageUrl: string | null;
  siteName: string;
  siteDescription: string;
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

function stripMarkdown(value: string): string {
  return value.replace(/[*_]/g, '').replaceAll(String.fromCharCode(96), '').trim();
}

function triState(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const normalized = stripMarkdown(text(value, 40, 'Unknown')).toLowerCase();
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

function normalize(row: RawApi): PublicApiRecord | null {
  const name = text(field(row, 'API','name','apiName','title'), 160);
  if (!name) return null;
  const description = text(field(row, 'Description','description','summary'), 1200);
  const category = text(field(row, 'Category','category','categoryName','categorySlug','group'), 100, 'Uncategorized');
  const homepageUrl = safeHttpUrl(field(row, 'Homepage','homepage','website','siteUrl','websiteUrl'));
  const docsUrl = safeHttpUrl(field(row, 'Link','link','docs','documentation','documentationUrl','callThisApi','url')) || homepageUrl;
  const iconUrl = safeHttpUrl(field(row,'iconUrl','icon_url','icon'));
  const imageUrl = safeHttpUrl(field(row,'imageUrl','image_url','image'));
  const siteName = text(field(row,'siteName','site_name'),160,name);
  const siteDescription = text(field(row,'siteDescription','site_description'),1200,description);
  const stable = [name.toLowerCase(), category.toLowerCase(), docsUrl || homepageUrl || ''].join('|');
  const sourceKey = createHash('sha256').update(stable).digest('hex');
  const healthValue = text(field(row, 'status','healthStatus','health'), 24).toLowerCase();
  const healthStatus = (['online','slow','offline','error'].includes(healthValue) ? healthValue : 'unknown') as PublicApiRecord['healthStatus'];
  const time = Number(field(row,'responseTimeMs','response_time_ms','latencyMs'));
  return {
    sourceKey,name,description,auth:stripMarkdown(text(field(row,'Auth','auth','authentication'),40,'No')) || 'No',
    https:triState(field(row,'HTTPS','https','supportsHttps')),
    cors:triState(field(row,'CORS','cors','supportsCors')),
    category,homepageUrl,docsUrl,iconUrl,imageUrl,siteName,siteDescription,healthStatus,
    responseTimeMs:Number.isInteger(time)&&time>=0&&time<=600000?time:null,raw:row,
  };
}

function unwrapRows(payload: unknown): { rows: RawApi[]; hasMore: boolean | null } {
  if (Array.isArray(payload)) return { rows: payload.filter((v): v is RawApi => Boolean(v)&&typeof v==='object'&&!Array.isArray(v)),hasMore:null };
  if (!payload||typeof payload!=='object') return {rows:[],hasMore:false};
  const object=payload as Record<string,unknown>;
  const nested=[object.apis,object.items,object.results,object.data,object.entries].find(Array.isArray);
  if(Array.isArray(nested)){
    const page=Number(object.page??object.current_page??object.currentPage);
    const pages=Number(object.pages??object.total_pages??object.totalPages);
    const total=Number(object.total??object.total_count);
    const perPage=Number(object.per_page??object.perPage??object.limit);
    let hasMore:boolean|null=null;
    if(Number.isFinite(page)&&Number.isFinite(pages)&&pages>0)hasMore=page<pages;
    else if(typeof object.has_more==='boolean')hasMore=object.has_more;
    else if(typeof object.hasMore==='boolean')hasMore=object.hasMore;
    else if(object.next_page===null)hasMore=false;
    else if(object.next_page!==undefined)hasMore=true;
    else if(Number.isFinite(total)&&Number.isFinite(page)&&Number.isFinite(perPage)&&perPage>0)hasMore=page*perPage<total;
    return {rows:nested.filter((v):v is RawApi=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v)),hasMore};
  }
  return {rows:[],hasMore:false};
}

function parseRepositoryReadme(markdown: string): PublicApiRecord[] {
  const rows: PublicApiRecord[]=[];
  let category='Uncategorized';
  let inApiTable=false;
  let inApilayerTable=false;
  for(const line of markdown.split(/\r?\n/)){
    const heading=line.match(/^###\s+(.+?)\s*$/);
    if(heading){category=heading[1].replace(/\s+/g,' ').trim().slice(0,100);inApiTable=false;continue;}
    if(/^##\s+/.test(line.trim())){inApiTable=false;inApilayerTable=/^##\s+APILayer APIs\s*$/i.test(line.trim());continue;}
    if(line.trim().startsWith('|')||/^API\s*\|/i.test(line.trim())){
      const cells=line.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(value=>value.trim());
      const normalized=cells.map(value=>stripMarkdown(value).toLowerCase());
      if(inApilayerTable&&normalized.length>=3&&normalized[0]==='api'&&normalized[1]==='description'&&normalized[2]==='call this api')continue;
      if(normalized.length>=5&&normalized[0]==='api'&&normalized[1]==='description'&&normalized[2]==='auth'&&normalized[3]==='https'&&normalized[4]==='cors'){
        inApiTable=true;continue;
      }
      if(/^:?-{3,}:?$/.test(cells[0]||''))continue;
      if(inApilayerTable&&cells.length>=3){
        const layer=cells[0].match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)/i);
        if(layer){
          const callLink=cells[2].match(/\]\((https?:\/\/[^)]+)\)/i);
          const record=normalize({API:layer[1],Description:cells[1].replace(/<[^>]*>/g,'').trim(),Auth:'apiKey',HTTPS:'Unknown',CORS:'Unknown',Category:'APILayer Suite',Homepage:layer[2],Link:callLink?.[1]||layer[2],siteName:'APILayer Unified Suite',siteDescription:'One APILayer account and API key for supported suite products.',source:REPOSITORY_SOURCE});
          if(record)rows.push(record);
        }
        continue;
      }
      if(!inApiTable||cells.length<5)continue;
      const match=cells[0].match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)/i);
      if(!match)continue;
      const name=match[1].replace(/&amp;/g,'&').trim();
      const url=match[2].trim();
      const description=cells[1].replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
      const record=normalize({API:name,Description:description,Auth:stripMarkdown(cells[2])||'No',HTTPS:stripMarkdown(cells[3]),CORS:stripMarkdown(cells[4]),Category:category,Homepage:url,Link:url,source:REPOSITORY_SOURCE});
      if(record)rows.push(record);
    }else if(line.trim()&&!line.trim().startsWith('<')&&!line.trim().startsWith('*')&&!line.trim().startsWith('[')){
      if(!line.startsWith(' '))inApiTable=false;
    }
  }
  const unique=new Map<string,PublicApiRecord>();
  for(const row of rows)unique.set(row.sourceKey,row);
  return [...unique.values()];
}

type RepositoryMcpRecord = {
  slug:string;name:string;description:string;authType:string;transports:string[];
  websiteUrl:string|null;installUrl:string|null;sourceUrl:string;
};

function parseRepositoryMcpDirectory(markdown:string):RepositoryMcpRecord[] {
  const output:RepositoryMcpRecord[]=[];
  let inMcpSection=false;
  let inMcpTable=false;
  for(const line of markdown.split(/\r?\n/)){
    if(/^##\s+MCP Servers\s*$/i.test(line.trim())){inMcpSection=true;inMcpTable=false;continue;}
    if(/^##\s+/.test(line.trim())&&inMcpSection){inMcpSection=false;inMcpTable=false;}
    if(!inMcpSection||!line.trim().startsWith('|'))continue;
    const cells=line.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(value=>value.trim());
    const normalized=cells.map(value=>stripMarkdown(value).toLowerCase());
    if(normalized.length>=5&&normalized[0]==='name'&&normalized[1]==='description'&&normalized[2]==='auth'&&normalized[3]==='transport'&&normalized[4]==='install'){
      inMcpTable=true;continue;
    }
    if(/^:?-{3,}:?$/.test(cells[0]||''))continue;
    if(!inMcpTable||cells.length<5)continue;
    const first=cells[0].match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)/i);
    if(!first)continue;
    const install=cells[4].match(/\]\((https?:\/\/[^)]+)\)/i);
    const transports=cells[3].replaceAll(String.fromCharCode(96),'').split(/[,\s]+/).map(value=>value.toLowerCase()).filter(value=>['stdio','http'].includes(value));
    const name=first[1].trim();
    const slug=name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);
    output.push({slug,name,description:cells[1].replace(/<[^>]*>/g,'').trim().slice(0,1200),
      authType:stripMarkdown(cells[2])||'Unknown',transports:[...new Set(transports)],
      websiteUrl:first[2],installUrl:install?.[1]||null,sourceUrl:REPOSITORY_README});
  }
  const unique=new Map<string,RepositoryMcpRecord>();
  for(const item of output)unique.set(item.slug,item);
  return [...unique.values()];
}

async function fetchRepositoryReadme():Promise<{rows:PublicApiRecord[];hasMore:false}> {
  const response=await fetch(REPOSITORY_README,{
    headers:{Accept:'text/plain','User-Agent':'AFG-AI-API-Hub/1.0'},
    signal:AbortSignal.timeout(30_000),redirect:'error',
  });
  if(!response.ok)throw new Error('Public APIs GitHub README returned HTTP '+response.status+'.');
  const markdown=await response.text();
  if(markdown.length>5_000_000)throw new Error('Public APIs GitHub README exceeded the 5 MB safety limit.');
  const rows=parseRepositoryReadme(markdown);
  if(rows.length<100)throw new Error('Public APIs GitHub README parser found fewer than 100 API entries; refusing an incomplete catalog import.');
  return {rows,hasMore:false};
}

async function fetchDirectoryApiPage(page:number):Promise<{rows:PublicApiRecord[];hasMore:boolean|null}> {
  const url=new URL(DIRECTORY_API);
  url.searchParams.set('page',String(page));
  const response=await fetch(url,{
    headers:{Accept:'application/json','User-Agent':'AFG-AI-API-Hub/1.0'},
    signal:AbortSignal.timeout(PAGE_TIMEOUT_MS),redirect:'error',
  });
  if(!response.ok)throw new Error('Public API directory returned HTTP '+response.status+' on page '+page+'.');
  const body=await response.text();
  if(body.length>5_000_000)throw new Error('Public API directory page exceeded the 5 MB safety limit.');
  let payload:unknown;
  try{payload=JSON.parse(body);}catch{throw new Error('Public API directory returned invalid JSON.');}
  const extracted=unwrapRows(payload);
  return {rows:extracted.rows.map(normalize).filter((row):row is PublicApiRecord=>row!==null),hasMore:extracted.hasMore};
}

type CatalogSyncResult={imported:number;pages:number;complete:boolean;sourceCoverage:{repositoryReadme:boolean;directoryApi:boolean}};
let syncInFlight:Promise<CatalogSyncResult>|null=null;

async function persistApiBatch(rows:PublicApiRecord[]):Promise<void> {
  if(!pool)throw new Error('The API catalog requires PostgreSQL.');
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    for(let offset=0;offset<rows.length;offset+=80){
      const batch=rows.slice(offset,offset+80);
      const values:unknown[]=[];
      const tuples=batch.map((item,index)=>{
        const base=index*17;
        values.push(item.sourceKey,item.name,item.description,item.auth,item.https,item.cors,item.category,
          item.homepageUrl,item.docsUrl,item.iconUrl,item.imageUrl,item.siteName,item.siteDescription,
          item.healthStatus,item.responseTimeMs,JSON.stringify(item.raw),true);
        return '('+Array.from({length:17},(_,i)=>'$'+(base+i+1)).join(',')+',now(),now())';
      });
      const sql='INSERT INTO public_api_catalog '+
        '(source_key,name,description,auth,https,cors,category,homepage_url,docs_url,icon_url,image_url,site_name,site_description,health_status,response_time_ms,source_payload,is_active,imported_at,updated_at) '+
        'VALUES '+tuples.join(',')+
        ' ON CONFLICT(source_key) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,'+
        'auth=EXCLUDED.auth,https=EXCLUDED.https,cors=EXCLUDED.cors,category=EXCLUDED.category,'+
        'homepage_url=EXCLUDED.homepage_url,docs_url=EXCLUDED.docs_url,'+
        'icon_url=EXCLUDED.icon_url,image_url=EXCLUDED.image_url,site_name=EXCLUDED.site_name,site_description=EXCLUDED.site_description,'+
        'health_status=CASE WHEN public_api_catalog.last_health_check IS NULL THEN EXCLUDED.health_status ELSE public_api_catalog.health_status END,'+
        'response_time_ms=CASE WHEN public_api_catalog.last_health_check IS NULL THEN EXCLUDED.response_time_ms ELSE public_api_catalog.response_time_ms END,'+
        'source_payload=EXCLUDED.source_payload,is_active=true,imported_at=now(),updated_at=now()';
      await client.query(sql,values);
      // Create a durable work-tracking row for every newly catalogued API. Existing progress is never reset by a resync.
      await client.query(`INSERT INTO public_api_implementation_tracking(source_key,discovery_status,official_docs_url,last_discovered_at,created_at,updated_at)
        SELECT source_key,'catalogued',docs_url,now(),now(),now() FROM public_api_catalog WHERE source_key = ANY($1::text[])
        ON CONFLICT(source_key) DO UPDATE SET
          official_docs_url=COALESCE(EXCLUDED.official_docs_url,public_api_implementation_tracking.official_docs_url),
          last_discovered_at=now(),updated_at=now()`,[batch.map(item=>item.sourceKey)]);
    }
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}
  finally{client.release();}
}

export async function syncPublicApiCatalog():Promise<{imported:number;pages:number;complete:boolean;sourceCoverage:{repositoryReadme:boolean;directoryApi:boolean}}> {
  if(!pool)throw new Error('The API catalog requires PostgreSQL.');
  if(syncInFlight)return syncInFlight;
  syncInFlight=(async():Promise<CatalogSyncResult>=>{
    await pool.query("INSERT INTO public_api_sync_state(source,status,last_started_at,last_error,updated_at) VALUES($1,'running',now(),NULL,now()) ON CONFLICT(source) DO UPDATE SET status='running',last_started_at=now(),last_error=NULL,updated_at=now()",[REPOSITORY_SOURCE]);
    let imported=0,pages=0;
    let repositoryReadme=false,directoryApi=false;
    const all=new Map<string,PublicApiRecord>();
    const errors:string[]=[];
    try{
      // Import both official directory sources. A successful README fetch must not hide
      // entries that exist only in the companion JSON directory (and vice versa).
      try{
        const result=await fetchRepositoryReadme();
        for(const row of result.rows)all.set(row.sourceKey,{...row,raw:{...row.raw,catalogSource:'public-apis-readme'}});
        repositoryReadme=true;pages++;
      }catch(error){
        errors.push('repository README: '+(error instanceof Error?error.message:'unknown error'));
        console.warn('AFG_PUBLIC_API_REPOSITORY_README_UNAVAILABLE',JSON.stringify({error:error instanceof Error?error.message:'unknown'}));
      }
      try{
        for(let page=1;page<=MAX_PAGES;page++){
          const result=await fetchDirectoryApiPage(page);
          pages++;
          if(!result.rows.length){directoryApi=true;break;}
          for(const row of result.rows){
            const existing=all.get(row.sourceKey);
            all.set(row.sourceKey,existing
              ? {...existing,raw:{...existing.raw,alsoListedIn:'publicapis.lol',directoryPayload:row.raw}}
              : {...row,raw:{...row.raw,catalogSource:'publicapis.lol'}});
          }
          if(result.hasMore===false){directoryApi=true;break;}
        }
        if(!directoryApi)errors.push('companion directory: pagination did not reach a confirmed final page within '+MAX_PAGES+' pages');
      }catch(error){
        errors.push('companion directory: '+(error instanceof Error?error.message:'unknown error'));
        console.warn('AFG_PUBLIC_API_DIRECTORY_UNAVAILABLE',JSON.stringify({error:error instanceof Error?error.message:'unknown'}));
      }
      if(!all.size)throw new Error('No API records could be retrieved from either official directory source. '+errors.join('; '));
      const records=[...all.values()];
      await persistApiBatch(records);
      imported=records.length;
      const complete=repositoryReadme&&directoryApi;
      // Never deactivate entries based on a partial snapshot from only one upstream source.
      if(complete){
        await pool.query('UPDATE public_api_catalog SET is_active=false,updated_at=now() WHERE NOT (source_key = ANY($1::text[]))',[records.map(row=>row.sourceKey)]);
      }
      const status=complete?'success':'partial';
      const lastError=errors.length?errors.join(' | ').slice(0,500):null;
      await pool.query("UPDATE public_api_sync_state SET status=$2,items_imported=$3,pages_fetched=$4,repository_readme_ok=$6,directory_api_ok=$7,last_completed_at=now(),last_error=$5,updated_at=now() WHERE source=$1",
        [REPOSITORY_SOURCE,status,imported,pages,lastError,repositoryReadme,directoryApi]);
      return {imported,pages,complete,sourceCoverage:{repositoryReadme,directoryApi}};
    }catch(error){
      const message=error instanceof Error?error.message.slice(0,500):'Catalog sync failed.';
      await pool.query("UPDATE public_api_sync_state SET status='error',items_imported=$2,pages_fetched=$3,repository_readme_ok=$5,directory_api_ok=$6,last_completed_at=now(),last_error=$4,updated_at=now() WHERE source=$1",
        [REPOSITORY_SOURCE,imported,pages,message,repositoryReadme,directoryApi]).catch(()=>{});
      throw error;
    }
  })();
  try{return await syncInFlight}finally{syncInFlight=null;}
}
export async function syncPublicMcpCatalog():Promise<{imported:number}> {
  if(!pool)throw new Error('The MCP directory requires PostgreSQL.');
  const response=await fetch(REPOSITORY_README,{
    headers:{Accept:'text/plain','User-Agent':'AFG-AI-API-Hub/1.0'},
    signal:AbortSignal.timeout(30_000),redirect:'error',
  });
  if(!response.ok)throw new Error('Public APIs GitHub README returned HTTP '+response.status+' while syncing MCP servers.');
  const markdown=await response.text();
  if(markdown.length>5_000_000)throw new Error('Public APIs GitHub README exceeded the 5 MB safety limit.');
  const records=parseRepositoryMcpDirectory(markdown);
  if(!records.length)throw new Error('No MCP servers were parsed from the upstream repository README.');
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    for(let offset=0;offset<records.length;offset+=50){
      const batch=records.slice(offset,offset+50);
      const values:unknown[]=[];
      const tuples=batch.map((item,index)=>{
        const base=index*8;
        values.push(item.slug,item.name,item.description,item.authType,item.transports,item.websiteUrl,item.installUrl,item.sourceUrl);
        return '('+Array.from({length:8},(_,i)=>'$'+(base+i+1)).join(',')+',NULL,true,now())';
      });
      await client.query('INSERT INTO mcp_directory_catalog(slug,name,description,auth_type,transports,website_url,install_url,source_url,endpoint_url,is_active,updated_at) VALUES '+
        tuples.join(',')+
        ' ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,auth_type=EXCLUDED.auth_type,transports=EXCLUDED.transports,website_url=EXCLUDED.website_url,install_url=EXCLUDED.install_url,source_url=EXCLUDED.source_url,is_active=true,updated_at=now()',values);
    }
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}
  finally{client.release();}
  await pool.query('UPDATE mcp_directory_catalog SET is_active=false,updated_at=now() WHERE NOT (slug = ANY($1::text[]))',[records.map(item=>item.slug)]);
  return {imported:records.length};
}

export async function queryPublicApiCatalog(filters:{
  q?:string;category?:string;auth?:string;https?:string;cors?:string;page?:number;pageSize?:number;
}){
  if(!pool)throw new Error('The API catalog requires PostgreSQL.');
  const page=Math.max(1,Math.min(100000,Math.trunc(filters.page||1)));
  const pageSize=Math.max(1,Math.min(100,Math.trunc(filters.pageSize||24)));
  const where:string[]=['is_active=true'];
  const values:unknown[]=[];
  const add=(value:unknown)=>{values.push(value);return '$'+values.length;};
  if(filters.q?.trim()){
    const needle='%'+filters.q.trim().slice(0,120).replace(/[\\%_]/g,'\\$&')+'%';
    where.push('(name ILIKE '+add(needle)+' OR description ILIKE '+add(needle)+' OR category ILIKE '+add(needle)+')');
  }
  if(filters.category&&filters.category!=='all')where.push('category='+add(filters.category.slice(0,100)));
  if(filters.auth&&filters.auth!=='all')where.push('lower(auth)=lower('+add(filters.auth.slice(0,40))+')');
  if(filters.https&&filters.https!=='all')where.push('lower(https)=lower('+add(filters.https==='true'?'Yes':'No')+')');
  if(filters.cors&&filters.cors!=='all')where.push('lower(cors)=lower('+add(filters.cors==='true'?'Yes':'No')+')');
  const clause=where.join(' AND ');
  const count=await pool.query('SELECT count(*)::int AS total FROM public_api_catalog WHERE '+clause,values);
  const rows=await pool.query(`SELECT source_key,name,description,auth,https,cors,category,
    CASE
      WHEN lower(category) ~ '(image|photo|avatar|art|drawing|design|visual)' OR lower(name||' '||description) ~ '(image generation|text.to.image|image editing|image synthesis)' THEN 'image'
      WHEN lower(category) ~ '(machine learning|artificial intelligence|text analysis|language|translation|sentiment)' OR lower(name||' '||description) ~ '(llm|chat completion|text generation|embedding|language model)' THEN 'ai'
      WHEN lower(category) ~ '(weather|environment|climate)' OR lower(name||' '||description) ~ '(forecast|weather data|air quality)' THEN 'weather'
      WHEN lower(category) ~ '(finance|currency|exchange|cryptocurrency|banking)' OR lower(name||' '||description) ~ '(exchange rate|currency conversion|stock market|crypto price)' THEN 'finance'
      WHEN lower(category) ~ '(map|geocod|location|transport|navigation)' OR lower(name||' '||description) ~ '(geocoding|routing|directions|place search)' THEN 'maps'
      WHEN lower(category) ~ '(developer|programming|development|code|testing)' OR lower(name||' '||description) ~ '(code repository|package registry|developer tools|source control)' THEN 'coding'
      WHEN lower(category) ~ '(news|media|social)' OR lower(name||' '||description) ~ '(news feed|articles|social media)' THEN 'news'
      WHEN lower(category) ~ '(food|recipe|nutrition)' OR lower(name||' '||description) ~ '(recipe|nutrition data)' THEN 'food'
      ELSE 'general'
    END AS capability,
    homepage_url,docs_url,icon_url,image_url,site_name,site_description,health_status,response_time_ms,last_health_check,imported_at,
    COALESCE(tracking.discovery_status,'catalogued') AS implementation_status
    FROM public_api_catalog LEFT JOIN public_api_implementation_tracking tracking USING(source_key) WHERE ${clause} ORDER BY category,name LIMIT ${pageSize} OFFSET ${(page-1)*pageSize}`,values);
  return {items:rows.rows,page,pageSize,total:Number(count.rows[0]?.total||0),categories:await listPublicApiCategories()};
}

export async function listPublicApiCategories(){
  if(!pool)return [];
  const result=await pool.query('SELECT category,count(*)::int AS count FROM public_api_catalog WHERE is_active=true GROUP BY category ORDER BY category');
  return result.rows;
}

export async function getPublicApiSyncStatus(){
  if(!pool)return {configured:false,status:'unavailable'};
  const result=await pool.query('SELECT source,status,items_imported,pages_fetched,repository_readme_ok,directory_api_ok,last_started_at,last_completed_at,last_error FROM public_api_sync_state WHERE source=$1 LIMIT 1',[REPOSITORY_SOURCE]);
  let implementationTracking:{configured:boolean;total:number;byStatus:Record<string,number>}={configured:false,total:0,byStatus:{}};
  try{
    const tracking=await pool.query('SELECT discovery_status,count(*)::int AS count FROM public_api_implementation_tracking GROUP BY discovery_status');
    const byStatus:Record<string,number>={};
    for(const row of tracking.rows)byStatus[String(row.discovery_status)]=Number(row.count||0);
    implementationTracking={configured:true,total:Object.values(byStatus).reduce((sum,value)=>sum+value,0),byStatus};
  }catch(error){
    console.warn('AFG_API_IMPLEMENTATION_TRACKING_UNAVAILABLE',JSON.stringify({error:error instanceof Error?error.message:'unknown'}));
  }
  return {configured:true,sync:result.rows[0]||null,implementationTracking};
}
