import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createOpenAICompatibleAdapter } from '../src/providers/openAiCompatible.ts';

// --- unit-level honesty checks (no network) --------------------------------
const unconfigured = createOpenAICompatibleAdapter({ id: 't', displayName: 'T', baseUrl: '', apiKey: '' });
await assert.rejects(
  unconfigured.generateImage!({ prompt: 'x', stylePreset: 'realistic', aspectRatio: '1:1', quality: 'standard' }),
  /provider_not_configured|not configured/i,
);
const adapter = createOpenAICompatibleAdapter({ id: 't', displayName: 'T', baseUrl: 'http://127.0.0.1:0', apiKey: 'k' });
await assert.rejects(
  adapter.generateImage!({ prompt: 'x', stylePreset: 'realistic', aspectRatio: '1:1', quality: 'standard' }),
  (error: any) => error.code === 'model_required',
  'generation without an exact verified model id must be rejected',
);
await assert.rejects(
  adapter.editImage!({ image: new Uint8Array([1]), mimeType: 'text/plain', instruction: 'x', model: 'm' }),
  (error: any) => error.code === 'unsupported_media_format',
  'non-image mime must be rejected',
);
const options = adapter.imageGenerationOptions!('any-model');
assert.equal(options.aspectRatios.length, 3);
assert.ok(options.stylePresets.length >= 5);
console.log('image adapter guards (config, model required, mime, options) passed.');

// --- wire-level checks against a fake OpenAI-compatible provider ------------
let lastGenerationBody: any = null;
let lastEditForm: FormData | null = null;
const PNG_BASE64 = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64');
const server = createServer((req, res) => {
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    if (req.url === '/images/generations') {
      lastGenerationBody = JSON.parse(raw);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ data: [{ b64_json: PNG_BASE64 }] }));
    } else if (req.url === '/images/edits') {
      lastEditForm = new FormData();
      // Rebuild the multipart body into a FormData for assertions.
      const boundary = /boundary=(.+)$/.exec(req.headers['content-type'] || '')?.[1];
      for (const part of raw.split('--' + boundary)) {
        const name = /name="([^"]+)"/.exec(part)?.[1];
        if (name) lastEditForm.append(name, 'present');
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ data: [{ b64_json: PNG_BASE64 }] }));
    } else {
      res.statusCode = 404; res.end('{}');
    }
  });
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = (server.address() as { port: number }).port;
const live = createOpenAICompatibleAdapter({ id: 't', displayName: 'T', baseUrl: `http://127.0.0.1:${port}`, apiKey: 'k' });

const result = await live.generateImage!({
  prompt: 'a minaret at dawn',
  stylePreset: 'realistic',
  aspectRatio: '3:2',
  quality: 'high',
  model: 'img-model-1',
});
assert.equal(result.mimeType, 'image/png');
assert.match(result.url, /^data:image\/png;base64,/);
assert.equal(lastGenerationBody.model, 'img-model-1', 'the exact caller-selected model is sent');
assert.ok(lastGenerationBody.prompt.includes('a minaret at dawn'), 'the user prompt is sent');
assert.ok(lastGenerationBody.prompt.includes('Photorealistic'), 'the style preset is applied as a prompt suffix');
assert.equal(lastGenerationBody.size, '1536x1024', 'aspect ratio maps to a real pixel size');
assert.equal(lastGenerationBody.quality, 'high');

const editResult = await live.editImage!({
  image: new Uint8Array([137, 80, 78, 71]),
  mimeType: 'image/png',
  instruction: 'remove the wires',
  mask: new Uint8Array([137, 80, 78, 71]),
  model: 'img-model-1',
});
assert.match(editResult.url, /^data:image\/png;base64,/);
assert.equal(lastEditForm!.get('model'), 'present');
assert.equal(lastEditForm!.get('image'), 'present');
assert.equal(lastEditForm!.get('mask'), 'present', 'the mask is forwarded as its own multipart field');

server.closeAllConnections(); server.close();
console.log('image generation/editing wire contract passed (model fidelity, size/quality mapping, style suffix, mask field, inline base64 result).');
console.log('Image adapter regression suite passed.');
