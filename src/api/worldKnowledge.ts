import type { IncomingMessage, ServerResponse } from 'http';
import { createHash } from 'crypto';
import { z } from 'zod';
import { pool } from './database.ts';
import { authenticateRequest, readJsonBody, sendAuthJson, verifyCsrf } from './auth.ts';

const sourceSchema = z.object({
  name: z.string().trim().min(1).max(180),
  url: z.string().url().max(2048),
  sourceType: z.enum(['official','academic','research','news','community','documentation','other']),
  trustLevel: z.enum(['official','academic','established','community','unreviewed']).default('unreviewed'),
  licenseLabel: z.string().trim().max(120).default('unknown'),
}).strict();

const researchJobSchema = z.object({
  query: z.string().trim().min(3).max(500),
  language: z.enum(['english','dari','persian','pashto','arabic','urdu','russian','other','unknown']).default('unknown'),
  priority: z.number().int().min(0).max(10).default(5),
}).strict();

const finishJobSchema = z.object({
  outcome: z.enum(['completed','failed']),
  summary: z.string().trim().max(2000).default(''),
}).strict();

const documentSchema = z.object({
  sourceId: z.string().uuid(),
  title: z.string().trim().min(1).max(240),
  content: z.string().trim().min(1).max(30000),
  topic: z.string().trim().min(1).max(100).default('general'),
  language: z.enum(['english','dari','persian','pashto','arabic','urdu','russian','other','unknown']).default('unknown'),
  evidenceType: z.enum(['fact','research','theory','opinion','experience','news','reference','unverified']).default('reference'),
  confidence: z.number().min(0).max(1).default(0.5),
  publishedAt: z.string().datetime().optional(),
}).strict();

function reply(res: ServerResponse, status: number, body: Record<string, unknown>) {
  sendAuthJson(res, status, body);
}
function isAdmin(role: string) {
  return role === 'admin' || role === 'superadmin';
}
function safeHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url;
  } catch { return null; }
}

/** Curated shared knowledge endpoints. Only administrators can ingest or curate sources. */
export async function handleWorldKnowledgeApi(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> {
  if (!pathname.startsWith('/api/intelligence/world/')) return false;
  if (!pool) {
    reply(res, 503, { error: 'Universal Knowledge Engine requires DATABASE_URL and migration 0036.' });
    return true;
  }
  const user = await authenticateRequest(req);
  if (!user) {
    reply(res, 401, { error: 'Sign in to access AFG AI world knowledge.' });
    return true;
  }
  if (!['GET','HEAD'].includes(req.method || 'GET') && !verifyCsrf(req)) {
    reply(res, 403, { error: 'CSRF validation failed.' });
    return true;
  }

  if (pathname === '/api/intelligence/world/jobs' && req.method === 'POST') {
    if (!isAdmin(user.role)) { reply(res, 403, { error: 'Only administrators can schedule shared research jobs.' }); return true; }
    try {
      const parsed = researchJobSchema.safeParse(await readJsonBody(req, 4000));
      if (!parsed.success) { reply(res, 400, { error: 'Provide a research query, language and priority.' }); return true; }
      const queryHash = createHash('sha256').update(parsed.data.query.toLocaleLowerCase() + '|' + parsed.data.language).digest('hex');
      const result = await pool.query(
        `INSERT INTO world_knowledge_research_jobs(query,language,priority,query_hash,requested_by)
         VALUES($1,$2,$3,$4,$5)
         ON CONFLICT(query_hash) DO UPDATE SET
           status=CASE WHEN world_knowledge_research_jobs.status IN ('completed','failed') THEN 'queued' ELSE world_knowledge_research_jobs.status END,
           priority=GREATEST(world_knowledge_research_jobs.priority,EXCLUDED.priority),
           next_run_at=CASE WHEN world_knowledge_research_jobs.status IN ('completed','failed') THEN now() ELSE world_knowledge_research_jobs.next_run_at END,
           updated_at=now()
         RETURNING id,query,language,priority,status,attempts,created_at AS "createdAt"`,
        [parsed.data.query,parsed.data.language,parsed.data.priority,queryHash,user.id],
      );
      reply(res, 201, { job: result.rows[0] });
    } catch {
      reply(res, 400, { error: 'Could not schedule this research job.' });
    }
    return true;
  }

  if (pathname === '/api/intelligence/world/jobs' && req.method === 'GET') {
    if (!isAdmin(user.role)) { reply(res, 403, { error: 'Administrator access is required.' }); return true; }
    const result = await pool.query(
      `SELECT id,query,language,priority,status,attempts,last_error AS "lastError",
              next_run_at AS "nextRunAt",lease_until AS "leaseUntil",
              created_at AS "createdAt",updated_at AS "updatedAt"
         FROM world_knowledge_research_jobs ORDER BY priority DESC,created_at DESC LIMIT 100`,
    );
    reply(res, 200, { jobs: result.rows });
    return true;
  }

  if (pathname === '/api/intelligence/world/jobs/claim' && req.method === 'POST') {
    if (!isAdmin(user.role)) { reply(res, 403, { error: 'Only an authorized research worker can claim jobs.' }); return true; }
    const result = await pool.query(
      `WITH candidate AS (
         SELECT id FROM world_knowledge_research_jobs
          WHERE (status='queued' AND next_run_at<=now())
             OR (status='processing' AND lease_until<now())
          ORDER BY priority DESC,created_at ASC
          FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE world_knowledge_research_jobs j
          SET status='processing',attempts=j.attempts+1,claimed_by=$1,
              lease_until=now()+interval '10 minutes',updated_at=now()
         FROM candidate WHERE j.id=candidate.id
       RETURNING j.id,j.query,j.language,j.priority,j.attempts,j.lease_until AS "leaseUntil"`,
      [user.id],
    );
    reply(res, 200, { job: result.rows[0] || null });
    return true;
  }

  const finishMatch = /^\/api\/intelligence\/world\/jobs\/([0-9a-f-]{36})\/finish$/.exec(pathname);
  if (finishMatch && req.method === 'POST') {
    if (!isAdmin(user.role)) { reply(res, 403, { error: 'Only an authorized research worker can finish jobs.' }); return true; }
    try {
      const parsed = finishJobSchema.safeParse(await readJsonBody(req, 5000));
      if (!parsed.success) { reply(res, 400, { error: 'Provide a valid job outcome and summary.' }); return true; }
      const result = await pool.query(
        `UPDATE world_knowledge_research_jobs
            SET status=$1,last_error=CASE WHEN $1='failed' THEN NULLIF($2,'') ELSE NULL END,
                lease_until=NULL,claimed_by=NULL,updated_at=now(),
                next_run_at=CASE WHEN $1='failed' AND attempts<5 THEN now()+make_interval(mins => LEAST(60,5*attempts)) ELSE next_run_at END
          WHERE id=$3 AND status='processing' AND claimed_by=$4
          RETURNING id,status,attempts,updated_at AS "updatedAt"`,
        [parsed.data.outcome,parsed.data.summary,finishMatch[1],user.id],
      );
      if (!result.rows[0]) { reply(res, 409, { error: 'Job lease not found, expired or owned by another worker.' }); return true; }
      reply(res, 200, { job: result.rows[0], summary: parsed.data.summary });
    } catch {
      reply(res, 400, { error: 'Could not finish this research job.' });
    }
    return true;
  }

  if (pathname === '/api/intelligence/world/status' && req.method === 'GET') {
    const [sources, documents, repositories, releases] = await Promise.all([
      pool.query('SELECT count(*)::int AS total,count(*) FILTER (WHERE enabled=true)::int AS enabled FROM world_knowledge_sources'),
      pool.query('SELECT count(*)::int AS total,count(DISTINCT topic)::int AS topics FROM world_knowledge_documents'),
      pool.query('SELECT count(*)::int AS total,count(*) FILTER (WHERE last_checked_at >= now()-interval \'7 days\')::int AS checked_recently FROM world_knowledge_repositories'),
      pool.query('SELECT count(*)::int AS total FROM world_knowledge_releases WHERE draft=false'),
    ]);
    reply(res, 200, {
      engine: 'programming-research-rag',
      available: true,
      ingestion: 'scheduled-worker-required; bounded-public-repository-indexing',
      sources: Number(sources.rows[0]?.total || 0),
      enabledSources: Number(sources.rows[0]?.enabled || 0),
      documents: Number(documents.rows[0]?.total || 0),
      topics: Number(documents.rows[0]?.topics || 0),
      repositories: Number(repositories.rows[0]?.total || 0),
      repositoriesCheckedRecently: Number(repositories.rows[0]?.checked_recently || 0),
      releases: Number(releases.rows[0]?.total || 0),
      modelWeightTraining: false,
      vectorSearch: false,
      fullTextSearch: true,
    });
    return true;
  }

  if (pathname === '/api/intelligence/world/repositories' && req.method === 'GET') {
    const url = new URL(req.url || '/', 'http://localhost');
    const query = (url.searchParams.get('q') || '').trim().slice(0,160);
    const limit = Math.max(1,Math.min(100,Number(url.searchParams.get('limit') || 50)));
    const result = await pool.query(
      `SELECT id,owner,repo,full_name AS "fullName",default_branch AS "defaultBranch",
              license_spdx AS license,stars,forks,pushed_at AS "pushedAt",
              latest_release_tag AS "latestReleaseTag",
              latest_release_published_at AS "latestReleasePublishedAt",
              last_checked_at AS "lastCheckedAt",metadata
         FROM world_knowledge_repositories
        WHERE $1='' OR full_name ILIKE '%' || $1 || '%' OR COALESCE(metadata->>'description','') ILIKE '%' || $1 || '%'
        ORDER BY pushed_at DESC NULLS LAST,stars DESC LIMIT $2`,
      [query,limit],
    );
    reply(res, 200, { repositories: result.rows });
    return true;
  }

  const repositoryReleasesMatch = /^\/api\/intelligence\/world\/repositories\/([0-9a-f-]{36})\/releases$/.exec(pathname);
  if (repositoryReleasesMatch && req.method === 'GET') {
    const result = await pool.query(
      `SELECT r.tag_name AS "tagName",r.release_name AS name,r.body,r.html_url AS url,
              r.target_commitish AS "targetCommitish",r.published_at AS "publishedAt",
              r.prerelease
         FROM world_knowledge_releases r
        WHERE r.repository_id=$1 AND r.draft=false
        ORDER BY r.published_at DESC NULLS LAST LIMIT 30`,
      [repositoryReleasesMatch[1]],
    );
    reply(res, 200, { releases: result.rows });
    return true;
  }

  if (pathname === '/api/intelligence/world/sources' && req.method === 'GET') {
    const result = await pool.query(
      `SELECT id,name,canonical_url AS url,domain,source_type AS "sourceType",
              trust_level AS "trustLevel",license_label AS "licenseLabel",enabled,
              created_at AS "createdAt"
         FROM world_knowledge_sources ORDER BY trust_level, name LIMIT 200`,
    );
    reply(res, 200, { sources: result.rows });
    return true;
  }

  if (pathname === '/api/intelligence/world/sources' && req.method === 'POST') {
    if (!isAdmin(user.role)) { reply(res, 403, { error: 'Only administrators can register shared knowledge sources.' }); return true; }
    try {
      const parsed = sourceSchema.safeParse(await readJsonBody(req, 8000));
      if (!parsed.success) { reply(res, 400, { error: 'Provide a valid source name, URL, type, trust level and license label.' }); return true; }
      const url = safeHttpUrl(parsed.data.url);
      if (!url) { reply(res, 400, { error: 'Only public HTTP or HTTPS source URLs are accepted.' }); return true; }
      const result = await pool.query(
        `INSERT INTO world_knowledge_sources(name,canonical_url,domain,source_type,trust_level,license_label,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT(canonical_url) DO UPDATE SET name=EXCLUDED.name,domain=EXCLUDED.domain,
           source_type=EXCLUDED.source_type,trust_level=EXCLUDED.trust_level,
           license_label=EXCLUDED.license_label,enabled=true,updated_at=now()
         RETURNING id,name,canonical_url AS url,domain,source_type AS "sourceType",
                   trust_level AS "trustLevel",license_label AS "licenseLabel",enabled`,
        [parsed.data.name,url.toString(),url.hostname.toLowerCase(),parsed.data.sourceType,parsed.data.trustLevel,parsed.data.licenseLabel,user.id],
      );
      reply(res, 201, { source: result.rows[0] });
    } catch {
      reply(res, 400, { error: 'Could not register this knowledge source.' });
    }
    return true;
  }

  if (pathname === '/api/intelligence/world/documents' && req.method === 'GET') {
    const result = await pool.query(
      `SELECT d.id,d.title,d.topic,d.language,d.evidence_type AS "evidenceType",
              d.confidence,d.published_at AS "publishedAt",d.created_at AS "createdAt",
              s.name AS "sourceName",s.canonical_url AS "sourceUrl",s.trust_level AS "trustLevel"
         FROM world_knowledge_documents d JOIN world_knowledge_sources s ON s.id=d.source_id
        WHERE s.enabled=true ORDER BY d.updated_at DESC LIMIT 100`,
    );
    reply(res, 200, { documents: result.rows });
    return true;
  }

  if (pathname === '/api/intelligence/world/documents' && req.method === 'POST') {
    if (!isAdmin(user.role)) { reply(res, 403, { error: 'Only administrators can ingest shared knowledge.' }); return true; }
    try {
      const parsed = documentSchema.safeParse(await readJsonBody(req, 100_000));
      if (!parsed.success) { reply(res, 400, { error: 'Provide a valid source, title, content, topic, language and evidence classification.' }); return true; }
      const source = await pool.query(
        'SELECT id FROM world_knowledge_sources WHERE id=$1 AND enabled=true LIMIT 1',
        [parsed.data.sourceId],
      );
      if (!source.rows[0]) { reply(res, 404, { error: 'Enabled knowledge source not found.' }); return true; }
      const contentHash = createHash('sha256').update(parsed.data.title + '\n' + parsed.data.content).digest('hex');
      const result = await pool.query(
        `INSERT INTO world_knowledge_documents(
           source_id,title,content,topic,language,evidence_type,confidence,published_at,content_hash,ingested_by
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT(content_hash) DO UPDATE SET
           source_id=EXCLUDED.source_id,title=EXCLUDED.title,content=EXCLUDED.content,
           topic=EXCLUDED.topic,language=EXCLUDED.language,evidence_type=EXCLUDED.evidence_type,
           confidence=EXCLUDED.confidence,published_at=EXCLUDED.published_at,updated_at=now()
         RETURNING id,title,topic,language,evidence_type AS "evidenceType",confidence,created_at AS "createdAt"`,
        [parsed.data.sourceId,parsed.data.title,parsed.data.content,parsed.data.topic,parsed.data.language,
          parsed.data.evidenceType,parsed.data.confidence,parsed.data.publishedAt || null,contentHash,user.id],
      );
      reply(res, 201, { document: result.rows[0], stored: true });
    } catch {
      reply(res, 400, { error: 'Could not ingest this knowledge document.' });
    }
    return true;
  }

  if (pathname === '/api/intelligence/world/search' && req.method === 'GET') {
    const url = new URL(req.url || '/', 'http://localhost');
    const query = (url.searchParams.get('q') || '').trim().slice(0,500);
    if (!query) { reply(res, 400, { error: 'Provide a search query.' }); return true; }
    const result = await pool.query(
      `WITH search_query AS (
         SELECT websearch_to_tsquery('simple',$1) AS tsq
       )
       SELECT d.id,d.title,d.content,d.topic,d.language,d.evidence_type AS "evidenceType",
              d.confidence,d.published_at AS "publishedAt",s.name AS "sourceName",
              s.canonical_url AS "sourceUrl",s.source_type AS "sourceType",
              s.trust_level AS "trustLevel",s.license_label AS "licenseLabel",
              ts_rank_cd(d.search_vector,q.tsq,32) AS relevance
         FROM world_knowledge_documents d
         JOIN world_knowledge_sources s ON s.id=d.source_id
         CROSS JOIN search_query q
        WHERE s.enabled=true AND d.search_vector @@ q.tsq
        ORDER BY relevance DESC,d.published_at DESC NULLS LAST,d.updated_at DESC LIMIT 8`,
      [query],
    );
    reply(res, 200, { query, results: result.rows });
    return true;
  }

  reply(res, 404, { error: 'World knowledge route not found.' });
  return true;
}
