import assert from 'node:assert/strict';
import { parseJarvisCommand } from '../src/lib/jarvis-command-engine';
import { buildJarvisLocalCommandPrompt, extractJarvisLocalCommand, buildJarvisNeedleCommandConfig, extractJarvisNeedleCommand } from '../src/lib/jarvis-local-agent';

const cases: Array<{ input: string; expected: ReturnType<typeof parseJarvisCommand> }> = [
  { input: 'open Telegram', expected: { kind: 'app', packageName: 'org.telegram.messenger', label: 'Telegram' } },
  { input: 'لطفاً باز کن تلگرام', expected: { kind: 'app', packageName: 'org.telegram.messenger', label: 'Telegram' } },
  { input: 'تلگرام را باز کن', expected: { kind: 'app', packageName: 'org.telegram.messenger', label: 'Telegram' } },
  { input: 'باتری چند فیصد است', expected: { kind: 'device', action: 'battery' } },
  { input: 'د بیټرۍ چارج څو دی', expected: { kind: 'device', action: 'battery' } },
  { input: 'چراغ قوه روشن کن', expected: { kind: 'device', action: 'torchOn' } },
  { input: 'فلش را خاموش کن', expected: { kind: 'device', action: 'torchOff' } },
  { input: 'مهرباني وکړئ بازگشت', expected: { kind: 'action', action: 'back' } },
  { input: 'مهربانی وکړئ بازگشت', expected: { kind: 'action', action: 'back' } },
  { input: 'لطفاً بازگشت', expected: { kind: 'action', action: 'back' } },
  { input: 'read recent sms', expected: { kind: 'device', action: 'recentSms' } },
  { input: 'do something unsafe', expected: { kind: 'unknown' } },
  { input: '', expected: { kind: 'unknown' } },
];

for (const testCase of cases) {
  assert.deepEqual(parseJarvisCommand(testCase.input), testCase.expected, testCase.input);
}

assert.deepEqual(parseJarvisCommand('x'.repeat(121)), { kind: 'unknown' });
const localCandidate = extractJarvisLocalCommand('```json\n{"command":"open Telegram"}\n```');
assert.equal(localCandidate, 'open Telegram');
assert.deepEqual(parseJarvisCommand(localCandidate || ''), { kind: 'app', packageName: 'org.telegram.messenger', label: 'Telegram' });
assert.equal(extractJarvisLocalCommand('I will open Telegram.'), null);
assert.equal(extractJarvisLocalCommand('{"command":""}'), null);
assert.equal(extractJarvisLocalCommand('{"command":"' + 'x'.repeat(121) + '"}'), null);
assert.equal(extractJarvisLocalCommand('x'.repeat(4001)), null);
assert.match(buildJarvisLocalCommandPrompt('dari'), /Afghan Dari\/Persian/);
assert.deepEqual(parseJarvisCommand(extractJarvisLocalCommand('{"command":"install another app"}') || ''), { kind: 'unknown' });
const needleConfig = buildJarvisNeedleCommandConfig('dari');
assert.match(needleConfig.systemPrompt, /Afghan Dari\/Persian/);
assert.match(needleConfig.toolsJson, /jarvis_command/);
assert.match(needleConfig.toolsJson, /open Telegram/);
const needleResult = JSON.stringify({ confidence: 0.93, function_calls: [{ name: 'jarvis_command', arguments: { command: 'open Telegram' } }] });
assert.equal(extractJarvisNeedleCommand(needleResult), 'open Telegram');
assert.deepEqual(parseJarvisCommand(extractJarvisNeedleCommand(needleResult) || ''), { kind: 'app', packageName: 'org.telegram.messenger', label: 'Telegram' });
assert.equal(extractJarvisNeedleCommand(JSON.stringify({ confidence: 0.2, function_calls: [{ name: 'jarvis_command', arguments: { command: 'open Telegram' } }] })), null);
assert.equal(extractJarvisNeedleCommand(JSON.stringify({ confidence: 0.99, function_calls: [{ name: 'jarvis_command', arguments: { command: 'install app' } }] })), null);
assert.equal(extractJarvisNeedleCommand(JSON.stringify({ confidence: 0.99, function_calls: [{ name: 'other_tool', arguments: { command: 'open Telegram' } }] })), null);
assert.equal(extractJarvisNeedleCommand(JSON.stringify({ confidence: 0.99, function_calls: [{ name: 'jarvis_command', arguments: { command: 'open Telegram' } }, { name: 'jarvis_command', arguments: { command: 'back' } }] })), null);
assert.equal(extractJarvisNeedleCommand('{not json'), null);
process.stdout.write(`JARVIS parser and local model guards: ${cases.length + 21} checks passed.\n`);
