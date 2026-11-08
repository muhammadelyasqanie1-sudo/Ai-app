import assert from 'node:assert/strict';
import {
  buildRelaxedTsQuery,
  chunkKnowledge,
  classifyKnowledge,
  computeRefreshAfter,
  deriveVerification,
  detectLanguage,
  extractKeyPoints,
  extractSummary,
  hashContent,
  looksBinary,
  normalizeKnowledgeText,
  safeTagList,
  tokenContainment,
  tokenOverlap,
} from '../src/services/knowledgeEngine.ts';
import { cosineSimilarity } from '../src/services/knowledgeEmbeddings.ts';
import { buildResearchReport, type ResearchedSource } from '../src/services/deepResearch.ts';

function testClassification() {
  assert.equal(classifyKnowledge('```ts\nconst app = express();\nfunction handler() { return 1; }\n```', 'Express API').category, 'programming');
  assert.equal(classifyKnowledge('A transformer language model uses embeddings, attention and inference. Fine-tune the LLM on a dataset.', 'LLM notes').category, 'ai-ml');
  assert.equal(classifyKnowledge('OWASP threat model, SQL injection vulnerability, CSRF and secure coding remediation.', 'AppSec').category, 'security');
  assert.equal(classifyKnowledge('The weather is pleasant and the garden has many flowers.', 'Garden').category, 'general');
  console.log('PASS classification');
}

function testChunking() {
  const body = Array.from({ length: 30 }, (_, index) => `Paragraph ${index + 1}. ` + 'This sentence explains a practical software engineering detail. '.repeat(6)).join('\n\n');
  const text = `# Installation\n\n${body}\n\n## Configuration\n\n${body}`;
  const chunks = chunkKnowledge(text, { maxChars: 1200, maxChunks: 50 });
  assert.ok(chunks.length > 2, 'expected multiple chunks');
  assert.ok(chunks.every((chunk) => chunk.content.length <= 4000), 'chunk size bound');
  assert.deepEqual(chunks.map((chunk) => chunk.chunkIndex), chunks.map((_, index) => index));
  assert.ok(chunks.some((chunk) => chunk.heading === 'Installation'));
  assert.ok(chunks.some((chunk) => chunk.heading === 'Configuration'));
  assert.ok(chunks.map((chunk) => chunk.content).join('').includes('Paragraph 30'));
  console.log('PASS chunking');
}

function testSummaryAndKeyPoints() {
  const source = 'PostgreSQL uses multi-version concurrency control to provide transaction isolation. ' +
    'The default isolation level is read committed. ' +
    'Applications should use indexes for frequently filtered columns. ' +
    'A sequential scan may still be faster for small tables.';
  const summary = extractSummary(source, 240);
  assert.ok(summary.length > 0 && summary.length <= 240);
  const normalizedSource = source.replace(/\s+/g, ' ');
  for (const sentence of summary.split(/(?<=[.!?])\s+/)) {
    if (sentence.length > 30) assert.ok(normalizedSource.includes(sentence.replace(/\s+/g, ' ').trim()), 'summary must copy real source sentences');
  }
  const points = extractKeyPoints(source, 'postgres transaction isolation', 2);
  assert.ok(points.length > 0);
  assert.ok(points.every((point) => source.includes(point)), 'key points must be real source sentences');
  console.log('PASS summary/key points');
}

function testNormalization() {
  const dirty = '<script>alert(1)</script><style>.x{}</style><h1>Title</h1>\u0000\u0001Hello   world.\r\n';
  const clean = normalizeKnowledgeText(dirty);
  assert.ok(!clean.includes('alert(1)'));
  assert.ok(!clean.includes('.x{}'));
  assert.ok(/Hello\s+world\./.test(clean));
  assert.equal(looksBinary(clean), false);
  assert.equal(looksBinary('abc\u0000\u0001\u0002def'), true);
  console.log('PASS normalization');
}

function testHashingAndFreshness() {
  assert.equal(hashContent('abc'), hashContent('abc'));
  assert.notEqual(hashContent('abc'), hashContent('abd'));
  assert.equal(computeRefreshAfter('user_provided'), null);
  const official = computeRefreshAfter('official', new Date('2026-01-01T00:00:00Z'));
  assert.equal(official?.toISOString(), '2026-01-31T00:00:00.000Z');
  assert.equal(deriveVerification({ trustLevel: 'official', sourceRead: true, contentLength: 500, corroborated: false }), 'official');
  assert.equal(deriveVerification({ trustLevel: 'community', sourceRead: true, contentLength: 500, corroborated: true }), 'multi_source');
  assert.equal(deriveVerification({ trustLevel: 'community', sourceRead: true, contentLength: 500, corroborated: false }), 'single_source');
  assert.equal(deriveVerification({ trustLevel: 'official', sourceRead: false, contentLength: 500, corroborated: false }), 'unverified');
  assert.deepEqual(safeTagList(['JavaScript', ' C++ ', 'bad tag!', 'x']), ['javascript', 'c++', 'bad-tag']);
  assert.equal(detectLanguage('This is English text about software.'), 'english');
  console.log('PASS hashing/freshness');
}

function testOverlapAndEmbeddings() {
  assert.ok(tokenOverlap('database transaction isolation level', 'transaction isolation in a database') > 0.4);
  assert.ok(tokenContainment('postgres index', 'postgres index and query planner details') > 0.6);
  assert.equal(tokenOverlap('', 'text'), 0);
  assert.equal(buildRelaxedTsQuery('Postgres transaction isolation!'), 'postgres:* | transaction:* | isolation:*');
  assert.equal(buildRelaxedTsQuery('node.js c++ AI'), 'node:* | js:* | ai:*');
  assert.equal(buildRelaxedTsQuery('...'), '');
  assert.ok(Math.abs(cosineSimilarity([1, 0], [1, 0]) - 1) < 1e-9);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  console.log('PASS overlap/embeddings');
}

function testReport() {
  const sources: ResearchedSource[] = [
    {
      index: 1, title: 'Official PostgreSQL docs', url: 'https://www.postgresql.org/docs/current/transaction-iso.html',
      domain: 'postgresql.org', trustLevel: 'official', verification: 'official', status: 'read',
      fetchMethod: 'search', publishedAt: '2026-01-10T00:00:00.000Z',
      summary: 'PostgreSQL documents transaction isolation levels.', keyPoints: ['Read committed is the default isolation level.'],
      agreement: 0.7, overlap: 0.7,
    },
    {
      index: 2, title: 'Unread source', url: 'https://example.com/unread',
      domain: 'example.com', trustLevel: 'unverified', verification: 'unverified', status: 'failed',
      fetchMethod: 'search', publishedAt: null, summary: '', keyPoints: [], agreement: 0, overlap: 0,
      error: 'source_unavailable',
    },
  ];
  const report = buildResearchReport({
    query: 'PostgreSQL isolation levels',
    depth: 'deep',
    generatedAt: '2026-11-08T00:00:00.000Z',
    provider: 'tavily',
    sources,
    verificationSummary: { official: 1, multi_source: 0, single_source: 0, unverified: 0 },
    warnings: ['browser_not_configured'],
    saveRequested: true,
  });
  assert.ok(report.includes('https://www.postgresql.org/docs/current/transaction-iso.html'));
  assert.ok(report.includes('https://example.com/unread'));
  assert.ok(report.includes('Sources not read'));
  assert.ok(report.includes('extractive'));
  assert.ok(report.includes('lexical'));
  assert.ok(report.includes('provider-supplied'));
  assert.ok(!report.includes('https://invented.example'), 'must not invent sources');
  assert.ok(report.length <= 40_000);
  console.log('PASS research report');
}

testClassification();
testChunking();
testSummaryAndKeyPoints();
testNormalization();
testHashingAndFreshness();
testOverlapAndEmbeddings();
testReport();
console.log('AFG knowledge engine offline tests passed.');
