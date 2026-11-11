import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync(new URL('../src/api/openjarvis.ts', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../src/components/afg/AfgOpenJarvisPanel.tsx', import.meta.url), 'utf8');
const docs = readFileSync(new URL('../services/openjarvis/README.md', import.meta.url), 'utf8');

const authIndex = api.indexOf('const user = await authenticateRequest(req)');
const configIndex = api.indexOf('const cfg = config()', authIndex);
const postIndex = api.indexOf("if (req.method === 'POST' && pathname === '/api/openjarvis/chat/completions')");
const csrfIndex = api.indexOf('if (!verifyCsrf(req))', postIndex);
const bodyIndex = api.indexOf('readJsonBody(req, 96_000)', postIndex);
const schemaIndex = api.indexOf('chatSchema.safeParse(raw)', postIndex);
const upstreamIndex = api.indexOf("fetch(cfg.base + '/v1/chat/completions'", postIndex);

assert.ok(authIndex >= 0 && configIndex > authIndex, 'Authentication must precede runtime configuration and all proxy routes.');
assert.ok(postIndex > configIndex, 'Chat proxy route must be evaluated only after authentication and configuration.');
assert.ok(csrfIndex > postIndex && bodyIndex > csrfIndex, 'CSRF validation must precede body parsing.');
assert.ok(schemaIndex > bodyIndex && upstreamIndex > schemaIndex, 'Schema validation must precede the upstream request.');
assert.match(api, /z\.object\([\s\S]*?role: z\.enum\(\['system', 'user', 'assistant'\]\)/);
assert.match(api, /content: z\.string\(\)\.max\(32_000\)/);
assert.match(api, /messages: z\.array\(messageSchema\)\.min\(1\)\.max\(80\)/);
assert.match(api, /max_tokens: z\.number\(\)\.int\(\)\.min\(1\)\.max\(16_384\)\.optional\(\)/);
assert.match(api, /\}\)\.strict\(\);/);
assert.ok(!/tools\s*:|tool_choice\s*:|functions\s*:|function_call\s*:/.test(api), 'The proxy schema must not accept caller-supplied tool or function execution fields.');
assert.match(api, /readJsonBody\(req, 96_000\)/, 'The request body must remain bounded.');
assert.match(api, /OPENJARVIS_API_KEY/);
assert.ok(!/VITE_OPENJARVIS_API_KEY/.test(api), 'The private service key must not use a VITE-prefixed variable.');
assert.match(api, /Authorization: 'Bearer ' \+ cfg\.key/);
assert.match(api, /req\.on\('aborted', abortUpstream\)/);
assert.match(api, /res\.on\('close', \(\) => \{ if \(!res\.writableEnded\) abort\.abort\(\); \}\)/);
assert.match(panel, /'X-CSRF-Token': getCsrfToken\(\)/);
assert.match(panel, /\/api\/openjarvis\/chat\/completions/);
assert.ok(!/tool_choice|function_call|OPENJARVIS_API_KEY/.test(panel), 'The browser panel must not expose the private key or tools execution controls.');
assert.match(docs, /single OpenJarvis runtime home/);
assert.match(docs, /does not yet claim per-user isolation/);
assert.match(docs, /Shell, code execution, browser automation, filesystem writes, connector actions and outbound channels are not exposed/);

console.log('OpenJarvis bridge audit: authentication, CSRF, strict bounded schema, no caller tools, server-only key, abort handling and single-tenant caveat passed.');
