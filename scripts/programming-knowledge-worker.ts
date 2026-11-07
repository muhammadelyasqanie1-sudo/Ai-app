import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { shouldUseDatabaseTls } from '../src/api/databaseTls.ts';

const databaseUrl = process.env.DATABASE_URL?.trim();
const apiKey = process.env.TAVILY_API_KEY?.trim();
const githubToken = process.env.GITHUB_TOKEN?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
if (!apiKey) throw new Error('TAVILY_API_KEY is required for the programming knowledge worker.');

const useDatabaseTls = shouldUseDatabaseTls(databaseUrl, process.env.DATABASE_SSL);
const databaseSslCa = process.env.DATABASE_SSL_CA?.replace(/\\n/g, '\n').trim();
const pool = new Pool({
  connectionString: databaseUrl,
  max: 2,
  connectionTimeoutMillis: 8000,
  idleTimeoutMillis: 10000,
  ...(useDatabaseTls
    ? {
        ssl: {
          rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
          ...(databaseSslCa ? { ca: databaseSslCa } : {}),
        },
      }
    : {}),
});
const MAX_JOBS = Math.max(1, Math.min(20, Number(process.env.AFG_KNOWLEDGE_MAX_JOBS || 8)));
const MAX_RESULTS = 5;
const TIMEOUT_MS = 20000;
const MAX_API_BYTES = 1_200_000;
const MAX_REPO_FILES = 2;
const MAX_REPOS_PER_JOB = 1;
const MAX_REPOS_PER_RUN = 3;
const MAX_REPO_DOCS_PER_RUN = 12;
const MAX_RELEASES_PER_REPO = 3;
const PERMISSIVE_SOURCE_LICENSES = new Set(['MIT','MIT-0','Apache-2.0','BSD-2-Clause','BSD-3-Clause','ISC','0BSD','Unlicense']);

type Topic = { topic_key: string; label: string; search_queries: string[]; search_queries_by_language?: Record<string,string[]>; priority: number };
type Job = { id: string; query: string; language: string; attempts: number; topic_key: string | null };
type SearchResult = { title?: string; url?: string; content?: string; raw_content?: string; score?: number; published_date?: string };

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
function normalizeDocument(value: unknown, limit: number) {
  return String(value || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n').trim().slice(0, limit);
}
function cleanText(value: unknown, limit: number) {
  return String(value || '').replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, limit);
}
function safePublicUrl(value: unknown): URL | null {
  try {
    const url = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
        /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host === '[::1]' ||
        /^(10\.|127\.|192\.168\.|169\.254\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return null;
    url.hash = '';
    return url;
  } catch { return null; }
}

async function boundedFetch(url: string, init: RequestInit = {}, maxBytes = MAX_API_BYTES): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, redirect: 'error', signal: controller.signal });
    if (!response.ok) throw new Error('Upstream HTTP ' + response.status);
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > maxBytes) throw new Error('Upstream response exceeds size limit');
    const reader = response.body?.getReader();
    if (!reader) return '';
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maxBytes) { await reader.cancel(); throw new Error('Upstream response exceeds size limit'); }
      chunks.push(part.value);
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder().decode(merged);
  } finally { clearTimeout(timer); }
}

async function queueTopicQuery(query: string, language: string, priority: number, topicKey: string) {
  const normalized = query.trim();
  if (normalized.length < 3 || !['english','dari','persian','pashto'].includes(language)) return;
  const hash = sha(normalized.toLowerCase() + '|' + language);
  await pool.query(
    `INSERT INTO world_knowledge_research_jobs(query,language,priority,query_hash,topic_key)
     VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(query_hash) DO UPDATE SET
       topic_key=COALESCE(world_knowledge_research_jobs.topic_key,EXCLUDED.topic_key),
       status=CASE WHEN world_knowledge_research_jobs.status IN ('completed','failed')
                     AND world_knowledge_research_jobs.updated_at < now()-interval '7 days'
                   THEN 'queued' ELSE world_knowledge_research_jobs.status END,
       attempts=CASE WHEN world_knowledge_research_jobs.status IN ('completed','failed')
                       AND world_knowledge_research_jobs.updated_at < now()-interval '7 days'
                     THEN 0 ELSE world_knowledge_research_jobs.attempts END,
       next_run_at=CASE WHEN world_knowledge_research_jobs.status IN ('completed','failed')
                          AND world_knowledge_research_jobs.updated_at < now()-interval '7 days'
                        THEN now() ELSE world_knowledge_research_jobs.next_run_at END`,
    [normalized,language,Math.max(0,Math.min(10,priority)),hash,topicKey],
  );
}

async function seedTopicQueries() {
  const topics = await pool.query<Topic>(
    'SELECT topic_key,label,search_queries,search_queries_by_language,priority FROM world_knowledge_topics WHERE enabled=true ORDER BY priority DESC,topic_key',
  );
  for (const topic of topics.rows) {
    for (const query of topic.search_queries || []) await queueTopicQuery(query,'english',topic.priority,topic.topic_key);
    for (const [language,queries] of Object.entries(topic.search_queries_by_language || {})) {
      for (const query of Array.isArray(queries) ? queries : []) await queueTopicQuery(query,language,topic.priority,topic.topic_key);
    }
  }
  return topics.rowCount || 0;
}

async function claimJob(): Promise<Job | null> {
  const result = await pool.query<Job>(
    `WITH candidate AS (
       SELECT id FROM world_knowledge_research_jobs
        WHERE ((status='queued' AND next_run_at<=now()) OR (status='processing' AND lease_until<now()))
          AND attempts < 5
        ORDER BY priority DESC,created_at ASC
        FOR UPDATE SKIP LOCKED LIMIT 1
     )
     UPDATE world_knowledge_research_jobs j
        SET status='processing',attempts=j.attempts+1,
            lease_until=now()+interval '5 minutes',updated_at=now()
       FROM candidate WHERE j.id=candidate.id
     RETURNING j.id,j.query,j.language,j.attempts,j.topic_key`,
  );
  return result.rows[0] || null;
}

async function search(query: string): Promise<SearchResult[]> {
  const body = await boundedFetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query, search_depth: 'advanced', max_results: MAX_RESULTS, include_answer: false, include_raw_content: 'markdown' }),
  }, 1_200_000);
  const data = JSON.parse(body) as { results?: SearchResult[] };
  return Array.isArray(data.results) ? data.results.slice(0, MAX_RESULTS) : [];
}

async function storeDocument(input: {
  title: string; url: string; domain: string; content: string; topic: string;
  evidence: 'unverified' | 'reference'; confidence: number; sourceType: 'other' | 'documentation' | 'academic' | 'community';
  trust: 'unreviewed' | 'community' | 'established' | 'official' | 'academic'; query: string; licenseLabel?: string; publishedAt?: string | null; language?: 'english' | 'dari' | 'persian' | 'pashto' | 'arabic' | 'urdu' | 'russian' | 'other' | 'unknown';
}) {
  const title = cleanText(input.title, 240);
  const content = normalizeDocument(input.content, 29000);
  const url = safePublicUrl(input.url);
  if (!url || !title || content.length < 80) return false;
  const source = await pool.query(
    `INSERT INTO world_knowledge_sources(name,canonical_url,domain,source_type,trust_level,license_label)
     VALUES($1,$2,$3,$4,$5,$6)
     ON CONFLICT(canonical_url) DO UPDATE SET name=EXCLUDED.name,license_label=EXCLUDED.license_label,updated_at=now()
     RETURNING id`,
    [title, url.toString(), input.domain || url.hostname.toLowerCase(), input.sourceType, input.trust, cleanText(input.licenseLabel || 'unknown', 100)],
  );
  const enriched = ('Research query: ' + cleanText(input.query, 400) + '\n\n' + content).slice(0, 30000);
  const hash = sha(url.toString() + '\n' + title + '\n' + enriched);
  await pool.query(
    `INSERT INTO world_knowledge_documents(source_id,title,content,topic,language,evidence_type,confidence,published_at,content_hash)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT(content_hash) DO NOTHING`,
    [source.rows[0].id, title, enriched, input.topic, input.language || 'english', input.evidence, Math.max(0, Math.min(1, input.confidence)), input.publishedAt || null, hash],
  );
  return true;
}

function classifySource(hostname: string): { trust: 'official' | 'academic' | 'established' | 'community' | 'unreviewed'; sourceType: 'documentation' | 'academic' | 'community' | 'other'; confidence: number } {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  const matches = (domains: string[]) => domains.some((domain) => host === domain || host.endsWith('.' + domain));
  if (matches([
    'developer.mozilla.org','docs.python.org','typescriptlang.org','nodejs.org','react.dev','nextjs.org','vite.dev','rust-lang.org','go.dev','kotlinlang.org',
    'developer.android.com','developer.apple.com','learn.microsoft.com','docs.microsoft.com','azure.microsoft.com','developers.google.com','cloud.google.com','docs.cloud.google.com',
    'docs.github.com','docs.docker.com','kubernetes.io','postgresql.org','supabase.com','owasp.org','w3.org','cloudflare.com','aws.amazon.com','docs.aws.amazon.com',
    'developer.chrome.com','playwright.dev','docs.npmjs.com','docs.oracle.com','docs.rs','pkg.go.dev','pytorch.org','tensorflow.org','huggingface.co',
    'fastapi.tiangolo.com','docs.djangoproject.com','flask.palletsprojects.com','spring.io','docs.spring.io','developer.hashicorp.com','terraform.io','docs.ansible.com',
    'docs.ros.org','docs.flutter.dev','reactnative.dev','expo.dev','flutter.dev','tauri.app','electronjs.org','docs.stripe.com','developer.paypal.com',
    'docs.opencv.org','scikit-learn.org','numpy.org','pandas.pydata.org','jupyter.org'
  ])) return { trust: 'official', sourceType: 'documentation', confidence: 0.78 };
  if (matches(['arxiv.org','acm.org','ieee.org','usenix.org','nist.gov','nature.com','science.org'])) return { trust: 'academic', sourceType: 'academic', confidence: 0.72 };
  if (matches(['martinfowler.com','netflixtechblog.com','engineering.fb.com','github.blog','shopify.engineering','stackoverflow.blog','airbnb.tech','increment.com','sre.google','stripe.com/blog'])) return { trust: 'established', sourceType: 'documentation', confidence: 0.68 };
  if (matches(['github.com','stackoverflow.com','stackexchange.com','dev.to','freecodecamp.org','reddit.com','medium.com','hashnode.dev'])) return { trust: 'community', sourceType: 'community', confidence: 0.55 };
  return { trust: 'unreviewed', sourceType: 'other', confidence: 0.35 };
}

function parseGitHubRepo(value: string): { owner: string; repo: string } | null {
  const url = safePublicUrl(value);
  if (!url || url.hostname.toLowerCase() !== 'github.com') return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2 || !/^[A-Za-z0-9_.-]{1,100}$/.test(parts[0]) || !/^[A-Za-z0-9_.-]{1,100}$/.test(parts[1])) return null;
  if (['topics','collections','marketplace','features','orgs','settings','login'].includes(parts[0].toLowerCase())) return null;
  return { owner: parts[0], repo: parts[1].replace(/\.git$/i, '') };
}

async function githubApi(path: string): Promise<any> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'AFG-AI-Knowledge-Research' };
  if (githubToken) headers.Authorization = 'Bearer ' + githubToken;
  return JSON.parse(await boundedFetch('https://api.github.com' + path, { headers }, MAX_API_BYTES));
}

async function githubRepositorySearch(query: string, license: string): Promise<any[]> {
  const q = query + ' license:' + license;
  const response = await githubApi('/search/repositories?q=' + encodeURIComponent(q) + '&sort=stars&order=desc&per_page=10');
  return Array.isArray(response.items) ? response.items.slice(0, 10) : [];
}

async function repositoryNeedsRefresh(fullName: string): Promise<boolean> {
  const existing = await pool.query('SELECT last_checked_at FROM world_knowledge_repositories WHERE full_name=$1', [fullName]);
  const lastChecked = existing.rows[0]?.last_checked_at;
  if (!lastChecked) return true;
  const timestamp = new Date(lastChecked).getTime();
  return !Number.isFinite(timestamp) || Date.now() - timestamp >= 7 * 24 * 60 * 60 * 1000;
}


const CODE_EXTENSIONS: Record<string,string> = {
  ts:'typescript',tsx:'tsx',js:'javascript',jsx:'javascript',mjs:'javascript',cjs:'javascript',
  py:'python',go:'go',rs:'rust',java:'java',kt:'kotlin',swift:'swift',sql:'sql',
  sh:'shell',yaml:'yaml',yml:'yaml',json:'json',md:'markdown',mdx:'mdx',toml:'toml',
};
const SKIP_CODE_PATH = /(^|\/)(node_modules|vendor|dist|build|coverage|\.git|\.next|target|Pods|out|bin)(\/|$)/i;
const SENSITIVE_CODE_PATH = /(^|\/)(\.env(?:\..*)?|secrets?(?:\..*)?|credentials?(?:\..*)?|id_rsa|id_ed25519|.*\.(?:pem|key|p12|pfx))$/i;
const MAX_CODE_FILES_PER_REPO = 8;
const MAX_CODE_BYTES_PER_FILE = 36000;
const MAX_CODE_BYTES_PER_RUN = 240000;
let codeBytesIndexedThisRun = 0;
let codeFilesIndexedTotal = 0;
let codeSymbolsIndexedTotal = 0;
let dependencyManifestsIndexedTotal = 0;
function codeLanguage(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return CODE_EXTENSIONS[ext] || 'unknown';
}
function redactPotentialSecrets(source: string) {
  return source
    .replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]')
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED AWS ACCESS KEY]')
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, '[REDACTED GITHUB TOKEN]')
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, '[REDACTED GITHUB TOKEN]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED JWT]');
}
function extractCodeSymbols(source: string, language: string) {
  const patterns: Array<{kind:string; re:RegExp}> = [];
  if (['typescript','javascript'].includes(language)) {
    patterns.push(
      {kind:'function',re:/\b(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g},
      {kind:'class',re:/\b(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g},
    );
    if(language==='typescript') patterns.push(
      {kind:'interface',re:/\b(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/g},
      {kind:'type',re:/\b(?:export\s+)?type\s+([A-Za-z_$][\w$]*)/g},
      {kind:'enum',re:/\b(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)/g},
    );
  } else if(language==='python') {
    patterns.push({kind:'function',re:/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/gm},{kind:'class',re:/^\s*class\s+([A-Za-z_]\w*)/gm});
  } else if(language==='go') {
    patterns.push({kind:'function',re:/^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/gm},{kind:'type',re:/^\s*type\s+([A-Za-z_]\w*)\s+(?:struct|interface)/gm});
  } else if(language==='rust') {
    patterns.push({kind:'function',re:/^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/gm},{kind:'struct',re:/^\s*(?:pub\s+)?struct\s+([A-Za-z_]\w*)/gm},{kind:'enum',re:/^\s*(?:pub\s+)?enum\s+([A-Za-z_]\w*)/gm},{kind:'trait',re:/^\s*(?:pub\s+)?trait\s+([A-Za-z_]\w*)/gm});
  } else if(language==='java'||language==='kotlin') {
    patterns.push({kind:'class',re:/\b(?:data\s+)?class\s+([A-Za-z_$][\w$]*)/g},{kind:'interface',re:/\binterface\s+([A-Za-z_$][\w$]*)/g},{kind:'enum',re:/\benum\s+class?\s+([A-Za-z_$][\w$]*)/g});
    if(language==='kotlin') patterns.push({kind:'function',re:/\bfun\s+([A-Za-z_$][\w$]*)/g});
  } else if(language==='swift') {
    patterns.push({kind:'type',re:/\b(?:class|struct|enum|protocol|actor)\s+([A-Za-z_]\w*)/g},{kind:'function',re:/\bfunc\s+([A-Za-z_]\w*)/g});
  } else if(language==='sql') {
    patterns.push({kind:'sql-object',re:/\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE|TABLE|VIEW)\s+([A-Za-z_][\w.]*)/gi});
  }
  const found = new Map<string,{name:string;kind:string;line:number;approximate:true}>();
  for(const item of patterns) {
    let match:RegExpExecArray|null;
    while((match=item.re.exec(source))!==null) {
      const name=match[1];
      if(name && name.length<=120) found.set(item.kind+':'+name,{name,kind:item.kind,line:source.slice(0,match.index).split('\n').length,approximate:true});
      if(found.size>=300) return [...found.values()];
    }
  }
  return [...found.values()];
}
function parseDependencyManifest(path: string, source: string) {
  const name=path.split('/').pop()?.toLowerCase()||'';
  const result:Record<string,unknown>={manifest:name,dependencies:{}};
  try {
    if(name==='package.json') {
      const value=JSON.parse(source);
      result.dependencies={...(value.dependencies||{}),...(value.devDependencies||{}),...(value.optionalDependencies||{})};
      result.projectName=typeof value.name==='string'?value.name.slice(0,160):null;
      result.projectVersion=typeof value.version==='string'?value.version.slice(0,80):null;
    } else if(name==='requirements.txt') {
      result.dependencies=source.split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith('#')&&!x.startsWith('-')).slice(0,300);
    } else if(name==='pyproject.toml'||name==='cargo.toml'||name==='go.mod'||name==='pom.xml') {
      result.dependencyLines=source.split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith('#')&&!x.startsWith('//')).slice(0,400);
    }
  } catch { result.parseError='manifest_parse_failed'; }
  return result;
}
async function storeCodeFile(repositoryId: string, fullName: string, license: string, defaultBranch: string, entry: any, source: string) {
  const path=String(entry.path||'').slice(0,700);
  const language=codeLanguage(path);
  const url='https://github.com/'+fullName+'/blob/'+encodeURIComponent(defaultBranch)+'/'+path.split('/').map(encodeURIComponent).join('/');
  const safeSource=redactPotentialSecrets(source);
  const symbols=extractCodeSymbols(safeSource,language);
  const manifestNames=['package.json','requirements.txt','pyproject.toml','cargo.toml','go.mod','pom.xml'];
  const dependencies=manifestNames.includes(path.split('/').pop()?.toLowerCase()||'') ? parseDependencyManifest(path,safeSource) : {};
  const contentHash=sha(safeSource);
  await pool.query(
    `INSERT INTO world_knowledge_code_files(repository_id,path,language,blob_sha,html_url,license_spdx,content,symbols,dependencies,content_hash,indexed_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,now())
     ON CONFLICT(repository_id,path) DO UPDATE SET language=EXCLUDED.language,blob_sha=EXCLUDED.blob_sha,
       html_url=EXCLUDED.html_url,license_spdx=EXCLUDED.license_spdx,content=EXCLUDED.content,
       symbols=EXCLUDED.symbols,dependencies=EXCLUDED.dependencies,content_hash=EXCLUDED.content_hash,
       indexed_at=now(),updated_at=now()`,
    [repositoryId,path,language,String(entry.sha||'').slice(0,80),url,license,safeSource,
      JSON.stringify(symbols),JSON.stringify(dependencies),contentHash],
  );
  return {bytes:Buffer.byteLength(safeSource,'utf8'),symbols:symbols.length,manifest:Object.keys(dependencies).length>0};
}

async function indexGitHubRepository(result: SearchResult, query: string, topicKey: string | null) {
  const parsed = parseGitHubRepo(result.url || '');
  if (!parsed) return 0;
  const { owner, repo } = parsed;
  const encoded = encodeURIComponent;
  const metadata = await githubApi('/repos/' + encoded(owner) + '/' + encoded(repo));
  if (metadata.private || metadata.disabled || metadata.archived) return 0;
  const fullName = String(metadata.full_name || owner + '/' + repo);
  const htmlUrl = 'https://github.com/' + fullName;
  const description = cleanText(metadata.description, 2000);
  const license = cleanText(metadata.license?.spdx_id || 'unknown', 100);
  const defaultBranch = String(metadata.default_branch || 'main').slice(0, 120);
  const repoSource = await pool.query(
    `INSERT INTO world_knowledge_sources(name,canonical_url,domain,source_type,trust_level,license_label)
     VALUES($1,$2,'github.com','documentation','community',$3)
     ON CONFLICT(canonical_url) DO UPDATE SET name=EXCLUDED.name,license_label=EXCLUDED.license_label,updated_at=now()
     RETURNING id`,
    [fullName, htmlUrl, license],
  );
  const repoRow = await pool.query(
    `INSERT INTO world_knowledge_repositories(
       owner,repo,full_name,source_id,default_branch,license_spdx,stars,forks,pushed_at,last_commit_sha,metadata,last_checked_at
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,now())
     ON CONFLICT(full_name) DO UPDATE SET
       source_id=EXCLUDED.source_id,default_branch=EXCLUDED.default_branch,license_spdx=EXCLUDED.license_spdx,
       stars=EXCLUDED.stars,forks=EXCLUDED.forks,pushed_at=EXCLUDED.pushed_at,
       last_commit_sha=EXCLUDED.last_commit_sha,metadata=EXCLUDED.metadata,last_checked_at=now(),updated_at=now()
     RETURNING id`,
    [owner,repo,fullName,repoSource.rows[0].id,defaultBranch,license,
      Math.max(0,Number(metadata.stargazers_count||0)),Math.max(0,Number(metadata.forks_count||0)),
      metadata.pushed_at && !Number.isNaN(Date.parse(metadata.pushed_at)) ? new Date(metadata.pushed_at).toISOString() : null,
      null,
      JSON.stringify({ description, archived: Boolean(metadata.archived), language: cleanText(metadata.language,80), topics: Array.isArray(metadata.topics) ? metadata.topics.slice(0,20) : [] })],
  );
  let count = 0;
  let codeFilesIndexed = 0;
  let symbolsIndexed = 0;
  let manifestsIndexed = 0;
  let latestReleaseAt = 0;

  try {
    const releases = await githubApi('/repos/' + encoded(owner) + '/' + encoded(repo) + '/releases?per_page=' + MAX_RELEASES_PER_REPO);
    if (Array.isArray(releases)) {
      for (const release of releases.slice(0, MAX_RELEASES_PER_REPO)) {
        if (release.draft || !release.tag_name || !release.html_url) continue;
        const tag = cleanText(release.tag_name,160);
        const releaseName = cleanText(release.name || tag,240);
        const body = PERMISSIVE_SOURCE_LICENSES.has(license) ? normalizeDocument(release.body || '',18000) : '';
        const publishedAt = release.published_at && !Number.isNaN(Date.parse(release.published_at))
          ? new Date(release.published_at).toISOString() : null;
        const releaseHash = sha(fullName + '|' + tag + '|' + body);
        await pool.query(
          `INSERT INTO world_knowledge_releases(repository_id,tag_name,release_name,body,html_url,target_commitish,published_at,prerelease,draft,content_hash)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,false,$9)
           ON CONFLICT(repository_id,tag_name) DO UPDATE SET
             release_name=EXCLUDED.release_name,body=EXCLUDED.body,html_url=EXCLUDED.html_url,
             target_commitish=EXCLUDED.target_commitish,published_at=EXCLUDED.published_at,
             prerelease=EXCLUDED.prerelease,content_hash=EXCLUDED.content_hash,updated_at=now()`,
          [repoRow.rows[0].id,tag,releaseName,body,String(release.html_url).slice(0,2048),
            cleanText(release.target_commitish,120),publishedAt,Boolean(release.prerelease),releaseHash],
        );
        if (publishedAt && Date.parse(publishedAt) > latestReleaseAt) {
          latestReleaseAt = Date.parse(publishedAt);
          await pool.query(
            'UPDATE world_knowledge_repositories SET latest_release_tag=$1,latest_release_published_at=$2,updated_at=now() WHERE id=$3',
            [tag,publishedAt,repoRow.rows[0].id],
          );
        }
        if (body.length >= 80) {
          count += Number(await storeDocument({
            title: fullName + ' — Release ' + tag + ': ' + releaseName,
            url: String(release.html_url), domain: 'github.com',
            content: 'Repository: ' + fullName + '\nRelease tag: ' + tag + '\nPrerelease: ' + Boolean(release.prerelease) + '\nLicense declared by GitHub: ' + license + '\n\n' + body,
            topic: topicKey || 'open-source', evidence: 'reference', confidence: 0.7,
            sourceType: 'documentation', trust: 'community', query, licenseLabel: license, publishedAt,
          }));
        }
      }
    }
  } catch { /* Release API may be rate-limited or unavailable; keep repository docs. */ }

  try {
    const readme = PERMISSIVE_SOURCE_LICENSES.has(license)
      ? await githubApi('/repos/' + encoded(owner) + '/' + encoded(repo) + '/readme')
      : {};
    if (readme.encoding === 'base64' && typeof readme.content === 'string') {
      const markdown = Buffer.from(readme.content.replace(/\s/g, ''), 'base64').toString('utf8').slice(0, 24000);
      count += Number(await storeDocument({
        title: fullName + ' — README',
        url: htmlUrl + '/blob/' + encodeURIComponent(defaultBranch) + '/' + String(readme.path || 'README.md').split('/').map(encodeURIComponent).join('/'),
        domain: 'github.com', content: 'Repository: ' + fullName + '\nDescription: ' + description + '\nLicense declared by GitHub: ' + license + '\nDefault branch: ' + defaultBranch + '\n\n' + markdown,
        topic: topicKey || 'open-source', evidence: 'reference', confidence: 0.65,
        sourceType: 'documentation', trust: 'community', query, licenseLabel: license,
      }));
    }
  } catch { /* README may be absent or unavailable; retain other search evidence. */ }

  try {
    const tree = PERMISSIVE_SOURCE_LICENSES.has(license)
      ? await githubApi('/repos/' + encoded(owner) + '/' + encoded(repo) + '/git/trees/' + encodeURIComponent(defaultBranch) + '?recursive=1')
      : { tree: [] };
    const entries = Array.isArray(tree.tree) ? tree.tree : [];
    const docCandidates = entries.filter((entry: any) =>
      entry.type === 'blob' && typeof entry.path === 'string' &&
      /^(README|CONTRIBUTING|CHANGELOG|docs\/[^/]+|\.github\/[^/]+)\.(md|mdx|rst|txt)$/i.test(entry.path) &&
      Number(entry.size || 0) > 80 && Number(entry.size || 0) <= 18000
    ).slice(0, MAX_REPO_FILES);
    for (const entry of docCandidates) {
      const path = String(entry.path).split('/').map(encodeURIComponent).join('/');
      try {
        const file = await githubApi('/repos/' + encoded(owner) + '/' + encoded(repo) + '/contents/' + path + '?ref=' + encodeURIComponent(defaultBranch));
        if (file.encoding !== 'base64' || typeof file.content !== 'string') continue;
        const text = Buffer.from(file.content.replace(/\s/g, ''), 'base64').toString('utf8').slice(0, 16000);
        count += Number(await storeDocument({
          title: fullName + ' — ' + String(entry.path).slice(0, 180),
          url: htmlUrl + '/blob/' + encodeURIComponent(defaultBranch) + '/' + path,
          domain: 'github.com', content: 'Repository: ' + fullName + '\nLicense declared by GitHub: ' + license + '\nFile path: ' + entry.path + '\n\n' + text,
          topic: topicKey || 'open-source', evidence: 'reference', confidence: 0.6,
          sourceType: 'documentation', trust: 'community', query,
        }));
      } catch { /* Skip individual files that exceed limits or disappear during indexing. */ }
    }
    const codeCandidates = entries.filter((entry: any) => {
      if (entry.type !== 'blob' || typeof entry.path !== 'string' || SKIP_CODE_PATH.test(entry.path) || SENSITIVE_CODE_PATH.test(entry.path)) return false;
      const language = codeLanguage(entry.path);
      const base = entry.path.split('/').pop()?.toLowerCase() || '';
      const manifest = ['package.json','requirements.txt','pyproject.toml','cargo.toml','go.mod','pom.xml'].includes(base);
      return (language !== 'unknown' || manifest) && Number(entry.size || 0) >= 20 &&
        Number(entry.size || 0) <= MAX_CODE_BYTES_PER_FILE;
    }).slice(0, MAX_CODE_FILES_PER_REPO);
    for (const entry of codeCandidates) {
      if (codeBytesIndexedThisRun >= MAX_CODE_BYTES_PER_RUN) break;
      const path = String(entry.path).split('/').map(encodeURIComponent).join('/');
      try {
        const file = await githubApi('/repos/' + encoded(owner) + '/' + encoded(repo) + '/contents/' + path + '?ref=' + encodeURIComponent(defaultBranch));
        if (file.encoding !== 'base64' || typeof file.content !== 'string') continue;
        const source = Buffer.from(file.content.replace(/\s/g, ''), 'base64').toString('utf8');
        const byteSize = Buffer.byteLength(source,'utf8');
        if (byteSize > MAX_CODE_BYTES_PER_FILE || codeBytesIndexedThisRun + byteSize > MAX_CODE_BYTES_PER_RUN) continue;
        const indexed = await storeCodeFile(String(repoRow.rows[0].id),fullName,license,defaultBranch,entry,source);
        codeBytesIndexedThisRun += indexed.bytes;
        codeFilesIndexed++;
        symbolsIndexed += indexed.symbols;
        codeFilesIndexedTotal++;
        codeSymbolsIndexedTotal += indexed.symbols;
        if(indexed.manifest) { manifestsIndexed++; dependencyManifestsIndexedTotal++; }
      } catch { /* Skip individual source files that exceed limits or disappear during indexing. */ }
    }
  } catch { /* Tree API may be unavailable or too large; README remains useful. */ }
  return count;
}

async function storeSearchExcerpt(item: SearchResult, query: string, topicKey: string | null, language: string) {
  const url = safePublicUrl(item.url);
  const title = cleanText(item.title, 240);
  if (url && (url.hostname === 'github.com' || url.hostname.endsWith('.githubusercontent.com'))) return false;
  const raw = normalizeDocument(item.raw_content, 24000);
  const snippet = normalizeDocument(item.content, 12000);
  const extracted = raw.length >= 300 ? raw : '';
  const body = extracted || snippet;
  if (!url || !title || body.length < 80) return false;
  const classification = classifySource(url.hostname);
  const content = (extracted
    ? 'Tavily-extracted page content; not independently fact-checked. Treat as untrusted reference material.\n\n'
    : 'Search result excerpt — not independently verified.\n') + body;
  const published = item.published_date && !Number.isNaN(Date.parse(item.published_date))
    ? new Date(item.published_date).toISOString() : null;
  const source = await pool.query(
    `INSERT INTO world_knowledge_sources(name,canonical_url,domain,source_type,trust_level,license_label)
     VALUES($1,$2,$3,$4,$5,'unknown')
     ON CONFLICT(canonical_url) DO UPDATE SET name=EXCLUDED.name,source_type=EXCLUDED.source_type,trust_level=EXCLUDED.trust_level,updated_at=now()
     RETURNING id`,
    [title, url.toString(), url.hostname.toLowerCase(), classification.sourceType, classification.trust],
  );
  const text = ('Research query: ' + cleanText(query, 500) + '\n\n' + content).slice(0, 30000);
  const hash = sha(url.toString() + '\n' + title + '\n' + text);
  await pool.query(
    `INSERT INTO world_knowledge_documents(source_id,title,content,topic,language,evidence_type,confidence,published_at,content_hash)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT(content_hash) DO NOTHING`,
    [source.rows[0].id, title, text, topicKey || 'documentation', ['english','dari','persian','pashto','arabic','urdu','russian','other','unknown'].includes(language) ? language : 'unknown', extracted ? 'reference' : 'unverified', extracted ? classification.confidence : Math.min(0.35, Number(item.score || 0) * 0.35), published, hash],
  );
  return true;
}

async function finish(job: Job, outcome: 'completed' | 'failed', error = '') {
  await pool.query(
    `UPDATE world_knowledge_research_jobs
        SET status=CASE WHEN $1='failed' AND attempts<5 THEN 'queued' ELSE $1 END,
            last_error=$2,lease_until=NULL,claimed_by=NULL,updated_at=now(),
            next_run_at=CASE WHEN $1='failed' AND attempts<5
              THEN now()+make_interval(mins => LEAST(120,5*attempts)) ELSE next_run_at END
      WHERE id=$3 AND status='processing'`,
    [outcome, error.slice(0, 1000) || null, job.id],
  );
}

async function main() {
  const lockClient = await pool.connect();
  const lockResult = await lockClient.query('SELECT pg_try_advisory_lock(74062026, 1) AS acquired');
  if (!lockResult.rows[0]?.acquired) {
    lockClient.release();
    process.stdout.write(JSON.stringify({ worker: 'afg-programming-knowledge', skipped: true, reason: 'another_worker_run_is_active' }) + '\n');
    return;
  }
  try {
    const topics = await seedTopicQueries();
    let processed = 0, excerptsIndexed = 0, repositoryDocsIndexed = 0, reposVisitedThisRun = 0;
    for (; processed < MAX_JOBS; processed++) {
      const job = await claimJob();
      if (!job) break;
      try {
        const results = await search(job.query);
        let excerpts = 0, repoDocs = 0, reposVisited = 0;
        for (const item of results) {
          if (await storeSearchExcerpt(item, job.query, job.topic_key, job.language)) excerpts++;
          if (parseGitHubRepo(item.url || '') && reposVisited < MAX_REPOS_PER_JOB && reposVisitedThisRun < MAX_REPOS_PER_RUN && repositoryDocsIndexed + repoDocs < MAX_REPO_DOCS_PER_RUN) {
            reposVisited++;
            reposVisitedThisRun++;
            try { repoDocs += await indexGitHubRepository(item, job.query, job.topic_key); }
            catch { /* Keep processing the other discovery results. */ }
          }
        }
        excerptsIndexed += excerpts;
        repositoryDocsIndexed += repoDocs;
        await finish(job, 'completed', excerpts + ' search excerpts and ' + repoDocs + ' public repository documents indexed.');
      } catch (error) {
        await finish(job, 'failed', error instanceof Error ? error.message : 'Unknown research worker error');
      }
    }
    const directRepositorySearches = [
      { query: 'AI coding agent', license: 'mit', topic: 'coding-agents' },
      { query: 'AI coding agent', license: 'apache-2.0', topic: 'coding-agents' },
      { query: 'Playwright browser automation', license: 'mit', topic: 'browser-automation' },
      { query: 'tree-sitter language server', license: 'mit', topic: 'compiler-tooling' },
    ];
    for (const discovery of directRepositorySearches) {
      if (reposVisitedThisRun >= MAX_REPOS_PER_RUN || repositoryDocsIndexed >= MAX_REPO_DOCS_PER_RUN) break;
      try {
        const candidates = await githubRepositorySearch(discovery.query, discovery.license);
        for (const candidate of candidates) {
          if (reposVisitedThisRun >= MAX_REPOS_PER_RUN || repositoryDocsIndexed >= MAX_REPO_DOCS_PER_RUN) break;
          const fullName = cleanText(candidate.full_name, 180);
          if (!fullName || !await repositoryNeedsRefresh(fullName)) continue;
          reposVisitedThisRun++;
          try {
            const indexed = await indexGitHubRepository({
              title: fullName,
              url: String(candidate.html_url || ('https://github.com/' + fullName)),
              content: cleanText(candidate.description, 2000),
              score: 0.95,
            }, 'GitHub Search API: ' + discovery.query + ' license:' + discovery.license, discovery.topic);
            repositoryDocsIndexed += indexed;
          } catch { /* One repository must not stop the rest of the research run. */ }
        }
      } catch { /* GitHub search may be rate-limited; Tavily discovery remains available. */ }
    }

    process.stdout.write(JSON.stringify({
      worker: 'afg-programming-knowledge',
      topicsSeeded: topics,
      jobsProcessed: processed,
      excerptsIndexed,
      repositoryDocsIndexed,
      repositoriesVisited: reposVisitedThisRun,
      maxRepositoriesPerRun: MAX_REPOS_PER_RUN,
      codeBytesIndexed: codeBytesIndexedThisRun,
      codeFilesIndexed: codeFilesIndexedTotal,
      codeSymbolsIndexed: codeSymbolsIndexedTotal,
      dependencyManifestsIndexed: dependencyManifestsIndexedTotal,
      maxCodeBytesPerRun: MAX_CODE_BYTES_PER_RUN,
      maxJobsPerRun: MAX_JOBS,
    }) + '\n');
  } finally {
    await lockClient.query('SELECT pg_advisory_unlock(74062026, 1)');
    lockClient.release();
  }
}
main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.message : 'Worker failed') + '\n');
  process.exitCode = 1;
}).finally(async () => { await pool.end(); });
