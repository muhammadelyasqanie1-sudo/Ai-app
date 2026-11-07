import { createHash } from 'node:crypto';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL?.trim();
const apiKey = process.env.TAVILY_API_KEY?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
if (!apiKey) throw new Error('TAVILY_API_KEY is required for the programming knowledge worker.');

const pool = new Pool({
  connectionString: databaseUrl,
  max: 2,
  connectionTimeoutMillis: 8000,
  idleTimeoutMillis: 10000,
});
const MAX_JOBS = Math.max(1, Math.min(20, Number(process.env.AFG_KNOWLEDGE_MAX_JOBS || 8)));
const MAX_RESULTS = 5;
const FETCH_TIMEOUT_MS = 20000;

type Topic = { topic_key: string; label: string; search_queries: string[]; priority: number };
type Job = { id: string; query: string; language: string; attempts: number; topic_key: string | null };

function sha(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
function cleanText(value: unknown, limit: number) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}
function safePublicUrl(value: unknown): URL | null {
  try {
    const url = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    if (url.hostname === 'localhost' || url.hostname.endsWith('.localhost') ||
        url.hostname.endsWith('.local') || /^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname) ||
        url.hostname === '[::1]' || url.hostname.startsWith('10.') ||
        url.hostname.startsWith('192.168.') || url.hostname.startsWith('127.')) return null;
    url.hash = '';
    return url;
  } catch { return null; }
}

async function seedTopicQueries() {
  const topics = await pool.query<Topic>(
    'SELECT topic_key,label,search_queries,priority FROM world_knowledge_topics WHERE enabled=true ORDER BY priority DESC,topic_key',
  );
  for (const topic of topics.rows) {
    for (const query of topic.search_queries || []) {
      const normalized = query.trim();
      if (normalized.length < 3) continue;
      const hash = sha(normalized.toLocaleLowerCase() + '|english');
      await pool.query(
        `INSERT INTO world_knowledge_research_jobs(query,language,priority,query_hash,topic_key)
         VALUES($1,'english',$2,$3,$4)
         ON CONFLICT(query_hash) DO UPDATE SET topic_key=COALESCE(world_knowledge_research_jobs.topic_key,EXCLUDED.topic_key)`,
        [normalized, Math.max(0, Math.min(10, topic.priority)), hash, topic.topic_key],
      );
    }
  }
  return topics.rowCount || 0;
}

async function claimJob(): Promise<Job | null> {
  const result = await pool.query<Job>(
    `WITH candidate AS (
       SELECT id FROM world_knowledge_research_jobs
        WHERE ((status='queued' AND next_run_at<=now())
           OR (status='processing' AND lease_until<now()))
          AND attempts < 5
        ORDER BY priority DESC,created_at ASC
        FOR UPDATE SKIP LOCKED LIMIT 1
     )
     UPDATE world_knowledge_research_jobs j
        SET status='processing',attempts=j.attempts+1,
            lease_until=now()+interval '3 minutes',updated_at=now()
       FROM candidate WHERE j.id=candidate.id
     RETURNING j.id,j.query,j.language,j.attempts,j.topic_key`,
  );
  return result.rows[0] || null;
}

async function search(query: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      redirect: 'error',
      signal: controller.signal,
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'advanced',
        max_results: MAX_RESULTS,
        include_answer: false,
        include_raw_content: false,
      }),
    });
    if (!response.ok) throw new Error('Search provider returned HTTP ' + response.status);
    const data = await response.json() as { results?: Array<{ title?: string; url?: string; content?: string; score?: number; published_date?: string }> };
    return Array.isArray(data.results) ? data.results.slice(0, MAX_RESULTS) : [];
  } finally {
    clearTimeout(timer);
  }
}

async function storeResult(item: { title?: string; url?: string; content?: string; score?: number; published_date?: string }, query: string, topicKey: string | null) {
  const url = safePublicUrl(item.url);
  const title = cleanText(item.title, 240);
  const snippet = cleanText(item.content, 12000);
  if (!url || !title || snippet.length < 80) return false;

  // Search snippets are short discovery evidence, not a substitute for full licensed source ingestion.
  const source = await pool.query(
    `INSERT INTO world_knowledge_sources(name,canonical_url,domain,source_type,trust_level,license_label)
     VALUES($1,$2,$3,'other','unreviewed','unknown')
     ON CONFLICT(canonical_url) DO UPDATE SET name=EXCLUDED.name,updated_at=now()
     RETURNING id`,
    [title, url.toString(), url.hostname.toLowerCase()],
  );
  const content = [
    'Discovery query: ' + cleanText(query, 500),
    'Search result excerpt (not independently verified):',
    snippet,
  ].join('\n\n').slice(0, 30000);
  const contentHash = sha(title + '\n' + content);
  const publishedAt = item.published_date && !Number.isNaN(Date.parse(item.published_date))
    ? new Date(item.published_date).toISOString() : null;
  await pool.query(
    `INSERT INTO world_knowledge_documents(
       source_id,title,content,topic,language,evidence_type,confidence,published_at,content_hash
      ) VALUES($1,$2,$3,$7,'english','unverified',$4,$5,$6)
     ON CONFLICT(content_hash) DO NOTHING`,
    [source.rows[0].id, title, content, Math.max(0, Math.min(0.35, Number(item.score || 0) * 0.35)), publishedAt, contentHash, topicKey || 'documentation'],
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
  const topics = await seedTopicQueries();
  let processed = 0;
  let stored = 0;
  for (; processed < MAX_JOBS; processed++) {
    const job = await claimJob();
    if (!job) break;
    try {
      const results = await search(job.query);
      let count = 0;
      for (const item of results) {
        if (await storeResult(item, job.query, job.topic_key)) count++;
      }
      stored += count;
      await finish(job, 'completed', count + ' programming search excerpts indexed.');
    } catch (error) {
      await finish(job, 'failed', error instanceof Error ? error.message : 'Unknown research worker error');
    }
  }
  process.stdout.write(JSON.stringify({
    worker: 'afg-programming-knowledge',
    topicsSeeded: topics,
    jobsProcessed: processed,
    documentsIndexed: stored,
    maxJobsPerRun: MAX_JOBS,
  }) + '\n');
}

main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.message : 'Worker failed') + '\n');
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
