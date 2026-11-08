import { createHash } from 'node:crypto';

/**
 * Pure, deterministic knowledge-processing helpers.
 *
 * Everything here is extractive or heuristic. No function invents facts,
 * calls a model, or treats source text as instructions. These helpers are
 * shared by the knowledge base, deep-research pipeline, refresh worker and
 * their tests.
 */

export const KNOWLEDGE_CATEGORIES = [
  'programming',
  'ai-ml',
  'security',
  'frontend',
  'backend',
  'databases',
  'devops',
  'mobile',
  'architecture',
  'documentation',
  'research',
  'general',
  'other',
] as const;
export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

export const TRUST_LEVELS = [
  'official',
  'academic',
  'established',
  'community',
  'user_provided',
  'unverified',
] as const;
export type KnowledgeTrustLevel = (typeof TRUST_LEVELS)[number];

export const VERIFICATION_STATES = [
  'official',
  'multi_source',
  'single_source',
  'user_corrected',
  'unverified',
] as const;
export type KnowledgeVerification = (typeof VERIFICATION_STATES)[number];

export function isKnowledgeCategory(value: unknown): value is KnowledgeCategory {
  return typeof value === 'string' && (KNOWLEDGE_CATEGORIES as readonly string[]).includes(value);
}

export function hashContent(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Build a forgiving OR/prefix tsquery so natural-language questions still
 * retrieve documents when the strict websearch query requires every word.
 * Returns an empty string when the query has no usable terms.
 */
export function buildRelaxedTsQuery(value: unknown): string {
  const terms = String(value ?? '')
    .toLocaleLowerCase()
    .match(/[\p{L}\p{N}_]+/gu) || [];
  const unique = [...new Set(terms.filter((term) => term.length >= 2))].slice(0, 12);
  return unique.map((term) => `${term}:*`).join(' | ');
}

/** Strip executable markup, NULs and control characters while keeping prose and code. */
export function normalizeKnowledgeText(value: unknown, maxChars = 400_000): string {
  const text = String(value ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  return text.slice(0, Math.max(1, maxChars));
}

/** Reject obvious binary payloads (for example a raw PDF) before storage. */
export function looksBinary(value: string): boolean {
  if (!value) return true;
  const sample = value.slice(0, 4096);
  let nonText = 0;
  for (let index = 0; index < sample.length; index += 1) {
    const code = sample.charCodeAt(index);
    if (code === 9 || code === 10 || code === 13) continue;
    if (code < 32 || code === 127) nonText += 1;
  }
  return nonText / sample.length > 0.02;
}

const CATEGORY_KEYWORDS: Record<Exclude<KnowledgeCategory, 'general' | 'other'>, Array<[string, number]>> = {
  programming: [
    ['programming', 3], ['source code', 3], ['compiler', 3], ['interpreter', 3], ['algorithm', 2],
    ['data structure', 2], ['function', 1], ['class ', 1], ['typescript', 2], ['javascript', 2],
    ['python', 2], ['java', 2], ['kotlin', 2], ['rust', 2], ['golang', 2], ['c++', 2], ['csharp', 2],
    ['syntax', 2], ['runtime', 1], ['package manager', 2], ['npm', 1], ['pip', 1], ['cargo', 1],
    ['api', 1], ['sdk', 1], ['library', 1], ['framework', 1], ['debug', 1], ['refactor', 2],
    ['repository', 1], ['git ', 1], ['unit test', 2], ['recursion', 2], ['object oriented', 2],
  ],
  'ai-ml': [
    ['machine learning', 3], ['deep learning', 3], ['neural network', 3], ['language model', 3],
    ['llm', 3], ['embedding', 2], ['transformer', 2], ['fine-tune', 2], ['fine tune', 2],
    ['inference', 2], ['training data', 2], ['pytorch', 3], ['tensorflow', 3], ['scikit-learn', 3],
    ['rag ', 2], ['retrieval augmented', 2], ['agent', 1], ['tokenizer', 2], ['evaluation benchmark', 2],
    ['machine learning ops', 1], ['mlops', 2], ['reinforcement learning', 3],
  ],
  security: [
    ['vulnerability', 3], ['exploit', 3], ['owasp', 3], ['threat model', 3], ['encryption', 2],
    ['cryptography', 2], ['authentication', 2], ['authorization', 2], ['csrf', 3], ['xss', 3],
    ['sql injection', 3], ['malware', 2], ['phishing', 2], ['cve-', 3], ['penetration test', 3],
    ['secure coding', 3], ['zero trust', 2], ['secrets management', 2], ['tls', 1], ['certificate', 1],
    ['defensive security', 3], ['incident response', 2],
  ],
  frontend: [
    ['react', 2], ['vue', 2], ['angular', 2], ['svelte', 2], ['next.js', 2], ['css', 2],
    ['html', 2], ['dom', 2], ['browser api', 3], ['accessibility', 2], ['wcag', 3],
    ['responsive design', 3], ['component', 1], ['design system', 2], ['tailwind', 2],
    ['state management', 2], ['web vitals', 3], ['hydration', 2], ['frontend', 3],
  ],
  backend: [
    ['backend', 3], ['server-side', 2], ['rest api', 2], ['graphql', 2], ['grpc', 2],
    ['microservice', 2], ['message queue', 2], ['webhook', 2], ['middleware', 2],
    ['express', 1], ['fastapi', 2], ['django', 2], ['spring boot', 2], ['rate limit', 2],
    ['reverse proxy', 2], ['server architecture', 2],
  ],
  databases: [
    ['database', 3], ['postgresql', 3], ['postgres', 3], ['mysql', 3], ['sqlite', 3],
    ['mongodb', 3], ['redis', 3], ['sql', 2], ['query plan', 3], ['index scan', 3],
    ['transaction isolation', 3], ['replication', 2], ['sharding', 3], ['normalization', 2],
    ['foreign key', 2], ['orm', 2], ['vector database', 2],
  ],
  devops: [
    ['devops', 3], ['docker', 2], ['kubernetes', 3], ['terraform', 3], ['ci/cd', 3],
    ['continuous integration', 3], ['continuous deployment', 3], ['observability', 2],
    ['opentelemetry', 3], ['prometheus', 2], ['grafana', 2], ['serverless', 2],
    ['infrastructure as code', 3], ['sre', 2], ['incident', 1], ['load balancer', 2],
    ['container', 1], ['deployment pipeline', 2],
  ],
  mobile: [
    ['android', 3], ['ios', 3], ['swiftui', 3], ['jetpack compose', 3], ['react native', 3],
    ['flutter', 3], ['kotlin multiplatform', 3], ['mobile app', 2], ['app store', 2],
    ['play store', 3], ['capacitor', 2], ['xcode', 2], ['gradle', 2],
  ],
  architecture: [
    ['software architecture', 3], ['system design', 3], ['design pattern', 3],
    ['distributed system', 3], ['event driven', 2], ['cqrs', 3], ['domain driven', 3],
    ['modular monolith', 2], ['scalability', 2], ['high availability', 2], ['consistency', 1],
    ['architecture decision record', 3], ['separation of concerns', 2], ['dependency injection', 2],
  ],
  documentation: [
    ['documentation', 3], ['api reference', 3], ['official docs', 3], ['user guide', 2],
    ['quickstart', 2], ['tutorial', 2], ['changelog', 2], ['migration guide', 3],
    ['release notes', 2], ['specification', 2], ['how to install', 2], ['readme', 2],
  ],
  research: [
    ['research paper', 3], ['study', 2], ['experiment', 2], ['hypothesis', 3],
    ['dataset', 2], ['methodology', 3], ['peer reviewed', 3], ['survey', 1],
    ['benchmark', 2], ['evaluation', 1], ['arxiv', 3], ['citation', 2], ['abstract', 1],
  ],
};

function countKeyword(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1 && count < 12) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

/** Classify into a stable, UI-filterable category. Code-shaped text favours programming. */
export function classifyKnowledge(text: string, title = ''): { category: KnowledgeCategory; scores: Record<string, number> } {
  const haystack = (title + '\n' + text).toLocaleLowerCase().slice(0, 80_000);
  const scores: Record<string, number> = {};
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const [keyword, weight] of keywords) score += countKeyword(haystack, keyword) * weight;
    scores[category] = score;
  }
  if (/```[\s\S]{20,}```/.test(text) || /\b(?:const|let|function|class|import|export|def|fn|pub fn)\b/.test(text)) {
    scores.programming += 4;
  }
  if (/^#{1,6}\s/m.test(text) && /\b(?:install|usage|example|api|configuration)\b/i.test(text)) {
    scores.documentation += 2;
  }
  if (/https?:\/\/(?:developer\.mozilla\.org|docs\.python\.org|nodejs\.org|react\.dev|developer\.android\.com|learn\.microsoft\.com)\b/i.test(text)) {
    scores.documentation += 3;
  }
  let best: KnowledgeCategory = 'general';
  let bestScore = 0;
  for (const category of KNOWLEDGE_CATEGORIES) {
    if (category === 'general' || category === 'other') continue;
    const score = scores[category] || 0;
    if (score > bestScore) { best = category; bestScore = score; }
  }
  return { category: bestScore >= 2 ? best : 'general', scores };
}

const OFFICIAL_DOMAINS = [
  'developer.mozilla.org', 'docs.python.org', 'typescriptlang.org', 'nodejs.org', 'react.dev',
  'nextjs.org', 'vite.dev', 'rust-lang.org', 'go.dev', 'kotlinlang.org', 'developer.android.com',
  'developer.apple.com', 'learn.microsoft.com', 'docs.microsoft.com', 'azure.microsoft.com',
  'developers.google.com', 'cloud.google.com', 'docs.cloud.google.com', 'docs.github.com',
  'docs.docker.com', 'kubernetes.io', 'postgresql.org', 'supabase.com', 'owasp.org', 'w3.org',
  'cloudflare.com', 'aws.amazon.com', 'docs.aws.amazon.com', 'developer.chrome.com',
  'playwright.dev', 'docs.npmjs.com', 'docs.oracle.com', 'docs.rs', 'pkg.go.dev', 'pytorch.org',
  'tensorflow.org', 'huggingface.co', 'fastapi.tiangolo.com', 'docs.djangoproject.com',
  'flask.palletsprojects.com', 'spring.io', 'docs.spring.io', 'developer.hashicorp.com',
  'terraform.io', 'docs.ansible.com', 'docs.ros.org', 'docs.flutter.dev', 'reactnative.dev',
  'expo.dev', 'flutter.dev', 'tauri.app', 'electronjs.org', 'docs.stripe.com', 'developer.paypal.com',
  'docs.opencv.org', 'scikit-learn.org', 'numpy.org', 'pandas.pydata.org', 'jupyter.org',
  'rfc-editor.org', 'nist.gov',
];
const ACADEMIC_DOMAINS = ['arxiv.org', 'acm.org', 'ieee.org', 'usenix.org', 'nature.com', 'science.org'];
const ESTABLISHED_DOMAINS = [
  'martinfowler.com', 'netflixtechblog.com', 'engineering.fb.com', 'github.blog',
  'shopify.engineering', 'stackoverflow.blog', 'airbnb.tech', 'increment.com', 'sre.google',
  'stripe.com', 'thoughtworks.com', 'infoq.com',
];
const COMMUNITY_DOMAINS = [
  'github.com', 'stackoverflow.com', 'stackexchange.com', 'dev.to', 'freecodecamp.org',
  'reddit.com', 'medium.com', 'hashnode.dev', 'ycombinator.com', 'news.ycombinator.com',
];

function domainMatches(host: string, domains: string[]): boolean {
  return domains.some((domain) => host === domain || host.endsWith('.' + domain));
}

/** Heuristic source classification; it is provenance metadata, not a truth verdict. */
export function classifySource(url: string, explicitTrust?: KnowledgeTrustLevel): {
  domain: string;
  trustLevel: KnowledgeTrustLevel;
  sourceType: 'web' | 'documentation' | 'repository' | 'research';
  confidence: number;
} {
  let domain = '';
  try { domain = new URL(url).hostname.toLocaleLowerCase().replace(/^www\./, ''); } catch { domain = ''; }
  if (explicitTrust) {
    return { domain, trustLevel: explicitTrust, sourceType: explicitTrust === 'official' ? 'documentation' : 'web', confidence: explicitTrust === 'official' ? 0.8 : 0.5 };
  }
  if (domainMatches(domain, OFFICIAL_DOMAINS)) {
    return { domain, trustLevel: 'official', sourceType: 'documentation', confidence: 0.78 };
  }
  if (domainMatches(domain, ACADEMIC_DOMAINS)) {
    return { domain, trustLevel: 'academic', sourceType: 'research', confidence: 0.72 };
  }
  if (domainMatches(domain, ESTABLISHED_DOMAINS)) {
    return { domain, trustLevel: 'established', sourceType: 'web', confidence: 0.68 };
  }
  if (domainMatches(domain, COMMUNITY_DOMAINS)) {
    return { domain, trustLevel: 'community', sourceType: domain === 'github.com' ? 'repository' : 'web', confidence: 0.52 };
  }
  return { domain, trustLevel: 'unverified', sourceType: 'web', confidence: 0.32 };
}

/** Best-effort script detection only; it does not claim reliable Dari/Persian distinction. */
export function detectLanguage(text: string): string {
  const sample = text.slice(0, 4000);
  const latin = (sample.match(/[A-Za-z]/g) || []).length;
  const persianScript = (sample.match(/[\u0600-\u06FF]/g) || []).length;
  const pashtoOnly = (sample.match(/[\u0693\u0696\u069A\u06AB\u06BC\u0689\u067C\u069C]/g) || []).length;
  if (persianScript > latin * 0.5 && persianScript > 10) return pashtoOnly >= 3 ? 'pashto' : 'persian';
  if (latin > 20) return 'english';
  return 'unknown';
}

const SENTENCE_SPLIT = /(?<=[.!?؟])\s+|\n+/;

function meaningfulSentences(text: string, maxLength = 320): string[] {
  return text
    .split(SENTENCE_SPLIT)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter((sentence) => sentence.length >= 30 && sentence.length <= maxLength && !/^https?:\/\//i.test(sentence));
}

/**
 * Extractive summary: selects real sentences from the source, never generates
 * new claims. The result is bounded and safe to show as a preview.
 */
export function extractSummary(text: string, maxChars = 640): string {
  const normalized = normalizeKnowledgeText(text, 120_000);
  if (!normalized) return '';
  if (normalized.length <= maxChars) return normalized.replace(/\s+/g, ' ').trim();
  const paragraphs = normalized.split(/\n\s*\n/).filter((paragraph) => paragraph.trim().length >= 40);
  const chosen: string[] = [];
  let total = 0;
  for (const paragraph of paragraphs.slice(0, 8)) {
    const sentences = meaningfulSentences(paragraph).slice(0, 2);
    for (const sentence of sentences) {
      if (total + sentence.length + 1 > maxChars) break;
      if (!chosen.some((existing) => existing.toLocaleLowerCase() === sentence.toLocaleLowerCase())) {
        chosen.push(sentence);
        total += sentence.length + 1;
      }
    }
    if (total >= maxChars * 0.75) break;
  }
  if (!chosen.length) {
    return normalized.replace(/\s+/g, ' ').slice(0, maxChars).trim();
  }
  return chosen.join(' ').slice(0, maxChars);
}

export type KnowledgeChunk = { chunkIndex: number; heading: string; content: string };

function splitLongBlock(block: string, maxChars: number): string[] {
  if (block.length <= maxChars) return [block];
  const pieces: string[] = [];
  let remaining = block;
  while (remaining.length > maxChars) {
    let cut = remaining.lastIndexOf('\n', maxChars);
    if (cut < maxChars * 0.5) cut = remaining.lastIndexOf('. ', maxChars);
    if (cut < maxChars * 0.5) cut = maxChars;
    pieces.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
    if (pieces.length >= 40) break;
  }
  if (remaining) pieces.push(remaining);
  return pieces;
}

/** Heading-aware chunking with hard size limits; long inputs are truncated, never silently claimed complete. */
export function chunkKnowledge(text: string, options: { maxChars?: number; maxChunks?: number } = {}): KnowledgeChunk[] {
  const maxChars = Math.max(400, Math.min(2400, options.maxChars ?? 1400));
  const maxChunks = Math.max(1, Math.min(500, options.maxChunks ?? 400));
  const normalized = normalizeKnowledgeText(text, 400_000);
  if (!normalized) return [];
  const lines = normalized.split('\n');
  const blocks: Array<{ heading: string; body: string }> = [];
  let heading = '';
  let buffer: string[] = [];
  const flush = () => {
    const body = buffer.join('\n').trim();
    if (body) blocks.push({ heading, body });
    buffer = [];
  };
  for (const line of lines) {
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (headingMatch) {
      flush();
      heading = headingMatch[2].trim().slice(0, 200);
      continue;
    }
    buffer.push(line);
  }
  flush();
  const chunks: KnowledgeChunk[] = [];
  let current = '';
  let currentHeading = '';
  const push = () => {
    const content = current.trim();
    if (content.length >= 20) chunks.push({ chunkIndex: chunks.length, heading: currentHeading, content: content.slice(0, 4000) });
    current = '';
  };
  for (const block of blocks) {
    for (const piece of splitLongBlock(block.body, maxChars)) {
      const prefix = block.heading ? `[${block.heading}]\n` : '';
      const candidate = prefix + piece;
      if (current && current.length + candidate.length + 2 > maxChars) push();
      if (!current) currentHeading = block.heading.slice(0, 200);
      current = current ? current + '\n\n' + candidate : candidate;
      if (chunks.length >= maxChunks) break;
    }
    if (chunks.length >= maxChunks) break;
  }
  push();
  return chunks.slice(0, maxChunks);
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'you', 'are', 'was', 'were',
  'have', 'has', 'not', 'but', 'can', 'will', 'would', 'should', 'could', 'about', 'their', 'there',
  'what', 'when', 'where', 'which', 'while', 'than', 'then', 'them', 'they', 'also', 'more', 'most',
  'such', 'only', 'other', 'some', 'these', 'those', 'been', 'being', 'does', 'did', 'how', 'why',
]);

export function tokenSet(value: string): Set<string> {
  const tokens = value.toLocaleLowerCase().match(/[\p{L}\p{N}_+#.-]{3,}/gu) || [];
  return new Set(tokens.filter((token) => !STOPWORDS.has(token)).slice(0, 400));
}

/** Jaccard overlap of meaningful tokens. Used only as a lexical-agreement proxy. */
export function tokenOverlap(a: string, b: string): number {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

/** Containment is better than Jaccard when one source is much longer than another. */
export function tokenContainment(a: string, b: string): number {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / Math.min(left.size, right.size);
}

/** Select real sentences that look explanatory and relate to the query. */
export function extractKeyPoints(text: string, query = '', limit = 5): string[] {
  const normalized = normalizeKnowledgeText(text, 80_000);
  const sentences = meaningfulSentences(normalized);
  const queryTokens = tokenSet(query);
  const scored = sentences.map((sentence, index) => {
    const lower = sentence.toLocaleLowerCase();
    const tokens = tokenSet(sentence);
    let overlap = 0;
    for (const token of queryTokens) if (tokens.has(token)) overlap += 1;
    let cue = 0;
    if (/\b(?:is|are|means|refers to|allows|provides|supports|requires|use|install|configure|because|enables|recommended|deprecated|instead)\b/i.test(lower)) cue += 2;
    if (/\b(?:always|never|must|should|warning|caution|security|breaking change)\b/i.test(lower)) cue += 2;
    if (/\d/.test(sentence)) cue += 0.5;
    return { sentence, index, score: overlap * 3 + cue - index * 0.02 };
  }).filter((item) => item.sentence.length >= 40);
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of scored) {
    const key = item.sentence.toLocaleLowerCase().slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item.sentence);
    if (result.length >= Math.max(1, Math.min(8, limit))) break;
  }
  return result;
}

export function deriveVerification(input: {
  trustLevel: KnowledgeTrustLevel;
  sourceRead: boolean;
  contentLength: number;
  corroborated: boolean;
}): KnowledgeVerification {
  if (!input.sourceRead || input.contentLength < 200) return 'unverified';
  if (input.trustLevel === 'official' || input.trustLevel === 'academic') return 'official';
  return input.corroborated ? 'multi_source' : 'single_source';
}

const REFRESH_DAYS: Record<KnowledgeTrustLevel, number | null> = {
  official: 30,
  academic: 30,
  established: 21,
  community: 14,
  unverified: 7,
  user_provided: null,
};

export function computeRefreshAfter(trustLevel: KnowledgeTrustLevel, from = new Date()): Date | null {
  const days = REFRESH_DAYS[trustLevel];
  if (days === null) return null;
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

export function safeTagList(values: unknown, limit = 12): string[] {
  if (!Array.isArray(values)) return [];
  const tags = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const tag = value.trim().toLocaleLowerCase()
      .replace(/[^a-z0-9+#._-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    if (tag.length >= 2) tags.add(tag);
    if (tags.size >= limit) break;
  }
  return [...tags];
}
