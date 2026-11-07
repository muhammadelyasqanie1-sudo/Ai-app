import assert from 'node:assert/strict';
import { readChatStream } from '../src/lib/chatStream.ts';
async function collect(text: string, signal = new AbortController().signal) {
  const bytes = new TextEncoder().encode(text);
  const response = new Response(new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } }));
  const events = []; for await (const event of readChatStream(response, signal)) events.push(event); return events;
}
const content = 'data: {"type":"content","text":"سلام"}\r\n\r\n';
assert.equal((await collect(': heartbeat\n\n' + content + 'data: {"type":"done"}\n\n'))[0].text, 'سلام');
await assert.rejects(collect(content), /before completion/);
await assert.rejects(collect(content + 'data: [DONE]'), /before completion/);
await assert.rejects(collect('data: invalid\n\n'), SyntaxError);
const abort = new AbortController(); abort.abort(); await assert.rejects(collect(content, abort.signal));
assert.equal((await collect(content + 'data: [DONE]\n\n')).length, 1);
console.log('SSE fragmentation, Unicode, terminal events, malformed input, truncation and cancellation passed.');
