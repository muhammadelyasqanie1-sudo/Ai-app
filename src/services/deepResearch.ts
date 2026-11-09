import { pool } from '../api/database.ts';
import { isBrowserResearchConfigured, readPublicPageWithBrowser } from '../api/browserAutomation.ts';
import { searchWebSources, type WebSearchSource } from '../api/research.ts';
import { fetchNineRouterPage } from './nineRouterWebSearch.ts';
import {
  KnowledgeError,
  enforceResearchRunRateLimit,
  saveKnowledgeDocument,
} from './knowledgeBase.ts';
import {
  classifyKnowledge,
  classifySource,
  computeRefreshAfter,
  deriveVerification,
  detectLanguage,
  extractKeyPoints,
  extractSummary,
  hashContent,
  isKnowledgeCategory,
  normalizeKnowledgeText,
  tokenContainment,
  tokenOverlap,
  type KnowledgeCategory,
  type KnowledgeTrustLevel,
  type KnowledgeVerification,
} from './knowledgeEngine.ts';

export type ResearchDepth = 'standard' | 'deep';

export type ResearchedSource = {
  index: number;
  title: string;
  url: string;
  domain: string;
  trustLevel: KnowledgeTrustLevel;
  verification: KnowledgeVerification;
  status: 'read' | 'failed' | 'skipped';
  fetchMethod: 'search' | 'browser';
  publishedAt: string | null;
  summary: string;
  keyPoints: string[];
  agreement: number;
  overlap: number;
  error?: string;
  documentId?: string;
  deduplicated?: boolean;
};

export type ResearchReportInput = {
  query: string;
  depth: ResearchDepth;
  generatedAt: string;
  provider: string;
  sources: ResearchedSource[];
  verificationSummary: Record<string, number>;
  warnings: string[];
  saveRequested: boolean;
};

function clean(value: unknown, limit: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function normalizeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function normalizePublished(value?: string): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

/**
 * Deterministic, extractive brief. It preserves exact source URLs, reports
 * unread sources, and explicitly labels lexical agreement as a proxy rather
 * than fact-checking. No model is called and no claim is generated.
 */
export function buildResearchReport(input: ResearchReportInput): string {
  const read = input.sources.filter((source) => source.status === 'read');
  const failed = input.sources.filter((source) => source.status !== 'read');
  const lines: string[] = [
    'AFG AI deep research brief',
    '',
    'Query: ' + input.query,
    'Generated: ' + input.generatedAt,
    'Depth: ' + input.depth,
    'Search provider: ' + input.provider,
    'Sources discovered: ' + input.sources.length + ' · Sources read: ' + read.length,
    'Knowledge saving: ' + (input.saveRequested ? 'requested by the user' : 'not requested'),
    '',
    'METHOD',
    '- This brief is extractive: every key point is a sentence copied from a source that was actually read.',
    '- "read via search" is provider-supplied extracted content or a substantial excerpt; "read via browser" opened the page in an isolated browser. Neither guarantees the complete page.',
    '- Verification labels describe provenance and lexical corroboration, not independent fact-checking.',
    '- No source was invented. Unread sources are reported separately and are not cited as evidence.',
    '',
    '## Key points by source',
  ];
  if (!read.length) {
    lines.push('- No source could be read, so no findings are reported.');
  }
  for (const source of read) {
    lines.push(
      '',
      `### [${source.index}] ${source.title || source.domain}`,
      'URL: ' + source.url,
      'Provenance: ' + source.domain + ' · trust=' + source.trustLevel + ' · verification=' + source.verification + ' · read via ' + source.fetchMethod,
      ...(source.publishedAt ? ['Published: ' + source.publishedAt] : []),
      ...(source.summary ? ['Extract: ' + source.summary] : []),
      ...(source.keyPoints.length
        ? source.keyPoints.slice(0, 4).map((point) => '- ' + point)
        : ['- No bounded key sentence could be extracted.']),
      'Lexical agreement with other sources: ' + Math.round(source.agreement * 100) + '% token containment (proxy only).',
    );
  }
  lines.push('', '## Source comparison');
  if (read.length < 2) {
    lines.push('- Fewer than two readable sources were available, so cross-source comparison is not meaningful.');
  } else {
    const multi = read.filter((source) => source.verification === 'multi_source');
    const single = read.filter((source) => source.verification === 'single_source' || source.verification === 'unverified');
    lines.push(
      '- ' + multi.length + ' source(s) shared substantial lexical overlap with at least one independent domain.',
      '- ' + single.length + ' source(s) remained single-source or unverified.',
      '- Domains represented: ' + [...new Set(read.map((source) => source.domain))].join(', ') + '.',
      '- Disagreement was not automatically adjudicated. Read the cited sources before relying on a disputed detail.',
    );
  }
  if (failed.length) {
    lines.push('', '## Sources not read (not used as evidence)');
    for (const source of failed) {
      lines.push(`- [${source.index}] ${source.url} — ${source.error || source.status}`);
    }
  }
  lines.push('', '## Verification summary');
  for (const [label, count] of Object.entries(input.verificationSummary)) {
    lines.push('- ' + label + ': ' + count);
  }
  lines.push(
    '- "official"/"academic" means the domain is recognized as an official or academic source; it does not guarantee the page is current or correct.',
    '- "multi_source" means lexical overlap with another independent domain, not independent verification of truth.',
    '- Technical details change; check the source publication date and current official documentation when accuracy matters.',
  );
  if (input.warnings.length) {
    lines.push('', '## Warnings');
    for (const warning of input.warnings) lines.push('- ' + warning);
  }
  return lines.join('\n').slice(0, 40_000);
}

type RunRow = { id: string };

/**
 * Run one bounded deep-research request. Search results are deduplicated by URL
 * and content. Only pages with real readable content become citations. Stored
 * knowledge is owner-scoped and only written when the user requested saving.
 */
export async function runDeepResearch(input: {
  userId: string;
  query: string;
  depth?: ResearchDepth;
  categories?: string[];
  save?: boolean;
  signal?: AbortSignal;
}): Promise<{
  runId: string;
  status: 'completed' | 'failed';
  report: string;
  citations: Array<Record<string, unknown>>;
  sources: ResearchedSource[];
  savedDocuments: number;
  deduplicatedDocuments: number;
  warnings: string[];
}> {
  if (!pool) throw new KnowledgeError('Deep research requires the AFG AI database.', 503, 'database_unavailable');
  const userId = String(input.userId || '');
  if (!userId) throw new KnowledgeError('Sign in is required.', 401, 'authentication_required');
  const query = clean(input.query, 500);
  if (query.length < 3) throw new KnowledgeError('Provide a research query of at least three characters.', 400, 'invalid_query');
  const depth: ResearchDepth = input.depth === 'deep' ? 'deep' : 'standard';
  const save = input.save !== false;
  const categories = [...new Set((input.categories || []).filter(isKnowledgeCategory))].slice(0, 5) as KnowledgeCategory[];
  const requestedCategory = categories.length === 1 ? categories[0] : undefined;

  await enforceResearchRunRateLimit(userId);
  // A crashed prior run must not stay "running" forever.
  await pool.query(
    `UPDATE knowledge_research_runs SET status='failed',error='stale_run',
            completed_at=now()
      WHERE user_id=$1 AND status='running' AND started_at < now()-interval '15 minutes'`,
    [userId],
  ).catch(() => undefined);
  const run = await pool.query<RunRow>(
    `INSERT INTO knowledge_research_runs(user_id,query,depth,categories,status)
     VALUES($1,$2,$3,$4,'running') RETURNING id`,
    [userId, query, depth, categories],
  );
  const runId = String(run.rows[0].id);
  const warnings: string[] = [];
  const maxResults = depth === 'deep' ? 25 : 15;
  const maxRead = depth === 'deep' ? 12 : 8;
  const maxBrowserReads = depth === 'deep' ? 3 : 0;

  try {
    let search: Awaited<ReturnType<typeof searchWebSources>>;
    try {
      search = await searchWebSources(userId, {
        query,
        maxResults,
        includeContent: true,
        searchTypes: depth === 'deep' ? ['web', 'news', 'x'] : ['web', 'news'],
      }, input.signal);
      warnings.push(...(search.warnings || []));
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 240) : 'Web search failed.';
      await pool.query(
        `UPDATE knowledge_research_runs SET status='failed',error=$2,completed_at=now() WHERE id=$1`,
        [runId, message],
      );
      throw new KnowledgeError(message, 502, 'research_search_failed');
    }

    const unique: Array<WebSearchSource & { url: string }> = [];
    const seenUrls = new Set<string>();
    const seenContent = new Set<string>();
    for (const source of search.sources) {
      const url = normalizeUrl(source.url);
      if (!url || seenUrls.has(url)) continue;
      const candidate = normalizeKnowledgeText(source.content || source.snippet, 120_000);
      const candidateHash = candidate.length >= 200 ? hashContent(candidate) : '';
      if (candidateHash && seenContent.has(candidateHash)) continue;
      seenUrls.add(url);
      if (candidateHash) seenContent.add(candidateHash);
      unique.push({ ...source, url });
      if (unique.length >= maxRead) break;
    }

    const sources: ResearchedSource[] = [];
    const contentByCitation = new Map<number, string>();
    const browserConfigured = isBrowserResearchConfigured();
    let nineRouterReads = 0;
    let browserReads = 0;
    for (let index = 0; index < unique.length; index += 1) {
      if (input.signal?.aborted) throw new KnowledgeError('Research was cancelled.', 499, 'research_cancelled');
      const candidate = unique[index];
      const classification = classifySource(candidate.url);
      let content = normalizeKnowledgeText(candidate.content || candidate.snippet, 120_000);
      let title = clean(candidate.title, 240);
      let fetchMethod: 'search' | 'browser' = 'search';
      let readError = '';
      if (content.length < 2_000 && depth === 'deep' && search.provider.startsWith('9router') && nineRouterReads < maxBrowserReads) {
        nineRouterReads += 1;
        try {
          const page = await fetchNineRouterPage(candidate.url, 40_000, input.signal, search.fetchApiKey);
          const fetchedText = normalizeKnowledgeText(page.text, 120_000);
          if (fetchedText.length > content.length) {
            content = fetchedText;
            title = clean(page.title || title, 240);
            fetchMethod = 'browser';
          }
        } catch {
          readError = 'ninerouter_fetch_failed';
          warnings.push('9Router could not fully read ' + classification.domain + '; search-extracted text was used when available.');
        }
      }
      if (content.length < 400 && depth === 'deep' && browserConfigured && browserReads < maxBrowserReads) {
        browserReads += 1;
        try {
          const page = await readPublicPageWithBrowser(candidate.url);
          const browserText = normalizeKnowledgeText(page.text, 120_000);
          if (browserText.length > content.length) {
            content = browserText;
            title = clean(page.title || title, 240);
            fetchMethod = 'browser';
            readError = '';
          }
        } catch {
          readError = 'browser_read_failed';
          warnings.push('Browser reading failed for ' + classification.domain + '; search-extracted text was used when available.');
        }
      }
      const read = content.length >= 200;
      if (!read) {
        sources.push({
          index: index + 1,
          title,
          url: candidate.url,
          domain: classification.domain,
          trustLevel: classification.trustLevel,
          verification: 'unverified',
          status: content.length >= 80 ? 'skipped' : 'failed',
          fetchMethod,
          publishedAt: normalizePublished(candidate.publishedDate),
          summary: '',
          keyPoints: [],
          agreement: 0,
          overlap: 0,
          error: readError || (browserConfigured ? 'insufficient_readable_content' : 'insufficient_content_browser_unavailable'),
        });
        continue;
      }
      const summary = extractSummary(content, 800);
      const keyPoints = extractKeyPoints(content, query, 4);
      contentByCitation.set(index + 1, content);
      sources.push({
        index: index + 1,
        title: title || classification.domain,
        url: candidate.url,
        domain: classification.domain,
        trustLevel: classification.trustLevel,
        verification: 'unverified',
        status: 'read',
        fetchMethod,
        publishedAt: normalizePublished(candidate.publishedDate),
        summary,
        keyPoints,
        agreement: 0,
        overlap: 0,
        error: readError || undefined,
      });
      if (!browserConfigured && depth === 'deep' && content.length < 400) {
        warnings.push('Some pages returned limited text and Browserbase is not configured for deeper reading.');
      }
    }

    // Lexical cross-source agreement. This is a proxy for corroboration, not proof.
    const readable = sources.filter((source) => source.status === 'read');
    for (const source of readable) {
      const own = source.keyPoints.join(' ') || source.summary;
      let best = 0;
      for (const other of readable) {
        if (other.domain === source.domain) continue;
        const comparison = other.keyPoints.join(' ') || other.summary;
        best = Math.max(best, tokenContainment(own, comparison), tokenOverlap(own, comparison));
      }
      source.overlap = Math.round(best * 100) / 100;
      source.agreement = source.overlap;
      source.verification = deriveVerification({
        trustLevel: source.trustLevel,
        sourceRead: true,
        contentLength: 200,
        corroborated: source.overlap >= 0.5,
      });
    }

    let savedDocuments = 0;
    let deduplicatedDocuments = 0;
    if (save) {
      for (const source of readable) {
        try {
          const saved = await saveKnowledgeDocument({
            userId,
            title: (source.title || source.domain).slice(0, 180),
            content: normalizeKnowledgeText(
              'Research query: ' + query + '\nSource: ' + source.url + '\nTrust: ' + source.trustLevel + '\n\n' +
              normalizeKnowledgeText(contentByCitation.get(source.index) || source.summary, 300_000),
              400_000,
            ),
            category: requestedCategory || classifyKnowledge(source.summary + ' ' + source.keyPoints.join(' '), source.title).category,
            sourceUrl: source.url,
            sourceLabel: source.domain,
            sourceType: 'web',
            trustLevel: source.trustLevel,
            verification: source.verification,
            summary: source.summary,
            tags: [source.domain, query.split(/\s+/).slice(0, 4).join(' ')],
            language: detectLanguage(source.summary),
            metadata: {
              researchRunId: runId,
              researchQuery: query,
              domain: source.domain,
              publishedAt: source.publishedAt,
              citationIndex: source.index,
              fetchMethod: source.fetchMethod,
              lexicalAgreement: source.agreement,
            },
            refreshAfter: computeRefreshAfter(source.trustLevel),
          });
          source.documentId = saved.document.id;
          source.deduplicated = saved.deduplicated;
          if (saved.deduplicated) deduplicatedDocuments += 1;
          else savedDocuments += 1;
        } catch (error) {
          if (error instanceof KnowledgeError && error.code.startsWith('knowledge_quota')) {
            warnings.push('Knowledge saving stopped because the knowledge-base quota is full.');
            break;
          }
          warnings.push('One source could not be saved to the knowledge base.');
        }
      }
    }

    const verificationSummary: Record<string, number> = { official: 0, multi_source: 0, single_source: 0, unverified: 0 };
    for (const source of readable) {
      verificationSummary[source.verification] = (verificationSummary[source.verification] || 0) + 1;
    }
    const generatedAt = new Date().toISOString();
    const report = buildResearchReport({
      query, depth, generatedAt, provider: search.provider, sources,
      verificationSummary, warnings: [...new Set(warnings)], saveRequested: save,
    });
    const citations = readable.map((source) => ({
      index: source.index,
      title: source.title,
      url: source.url,
      domain: source.domain,
      trustLevel: source.trustLevel,
      verification: source.verification,
      publishedAt: source.publishedAt,
      fetchMethod: source.fetchMethod,
      documentId: source.documentId || null,
    }));

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const source of sources) {
        await client.query(
          `INSERT INTO knowledge_research_sources(
             run_id,user_id,document_id,url,title,domain,trust_level,verification,
             fetch_method,status,published_at,content_hash,summary,key_points,metadata,error
           ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16)`,
          [runId, userId, source.documentId || null, source.url, source.title, source.domain,
            source.trustLevel, source.verification, source.fetchMethod, source.status,
            source.publishedAt, source.status === 'read'
              ? hashContent(contentByCitation.get(source.index) || source.summary)
              : null,
            source.summary, JSON.stringify(source.keyPoints.slice(0, 6)),
            JSON.stringify({ agreement: source.agreement, overlap: source.overlap }), source.error || null],
        );
      }
      await client.query(
        `UPDATE knowledge_research_runs
            SET status='completed',search_provider=$2,sources_discovered=$3,sources_read=$4,
                documents_saved=$5,report=$6,citations=$7::jsonb,verification_summary=$8::jsonb,
                completed_at=now(),error=NULL
          WHERE id=$1 AND user_id=$9`,
        [runId, search.provider, sources.length, readable.length, savedDocuments + deduplicatedDocuments,
          report, JSON.stringify(citations), JSON.stringify(verificationSummary), userId],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    if (deduplicatedDocuments) warnings.push(deduplicatedDocuments + ' source(s) already existed in the knowledge base and were linked instead of duplicated.');
    return {
      runId,
      status: 'completed',
      report,
      citations,
      sources,
      savedDocuments,
      deduplicatedDocuments,
      warnings: [...new Set(warnings)],
    };
  } catch (error) {
    const message = error instanceof KnowledgeError ? error.message : 'Research failed.';
    await pool.query(
      `UPDATE knowledge_research_runs SET status='failed',error=$2,completed_at=now()
        WHERE id=$1 AND user_id=$3 AND status='running'`,
      [runId, message.slice(0, 500), userId],
    ).catch(() => undefined);
    if (error instanceof KnowledgeError) throw error;
    throw new KnowledgeError('Deep research could not be completed.', 502, 'research_failed');
  }
}
