import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/afg/AfgJarvisView.tsx', import.meta.url), 'utf8');
const mapStart = source.indexOf('const capabilityByRunKey: Record<string, JarvisCapability> = {');
const mapEnd = source.indexOf('\n  };', mapStart);
assert.ok(mapStart >= 0 && mapEnd > mapStart, 'The central capability map must exist.');
const map = source.slice(mapStart, mapEnd);
const dispatcherStart = source.indexOf('async function run(key: string');
const dispatcherEnd = source.indexOf('function confirmLocalCommand', dispatcherStart);
assert.ok(dispatcherStart >= 0 && dispatcherEnd > dispatcherStart, 'The shared action dispatcher must exist.');
const dispatcher = source.slice(dispatcherStart, dispatcherEnd);

assert.match(source, /authorizeJarvisCapability/);
assert.match(source, /getJarvisCapabilityRule/);
assert.match(dispatcher, /if \(!capability\)/, 'Unknown run keys must be denied.');
assert.ok(
  dispatcher.indexOf('authorizeJarvisCapability') < dispatcher.indexOf('const result = await task()'),
  'Authorization must complete before the native action task runs.',
);

const mappedKeys = [
  'voice-app', 'voice-action', 'listen', 'stop', 'speak', 'settings', 'security-scan',
  'battery', 'network', 'sensors', 'vibrate', 'torch', 'camera',
  'location', 'contacts', 'sms', 'clipboard-set', 'clipboard-get',
  'dial', 'sms-compose', 'click', 'type', 'back', 'home',
  'notifications', 'quickSettings', 'scrollForward', 'scrollBackward',
];
for (const key of mappedKeys) {
  assert.ok(
    map.includes("'" + key + "':") || map.includes('\n    ' + key + ':'),
    'Missing capability mapping for run key: ' + key,
  );
}

assert.match(source, /const voiceDeviceCapabilities: Record<string, JarvisCapability>/);
assert.match(source, /key\.startsWith\('voice-device-'\)/);
assert.ok(!source.includes('confirmedRunKeys') && !source.includes('sensitiveRunKeys'), 'Confirmation must not be inferred from an action key.');
assert.match(source, /const confirmed = authorization\.confirmed === true/);
assert.match(source, /const sensitive = authorization\.sensitive === true/);
assert.ok(source.includes("if (/^[A-Za-z_][A-Za-z0-9_]*(\\.[A-Za-z_][A-Za-z0-9_]*)+$/.test(key)) return 'device.app.launch';"), 'Valid package namespaces such as net.* and io.* must be launchable.');
assert.match(source, /function runAfterConfirmation\(key: string, task: \(\) => Promise<unknown>, sensitive = false\)/);
assert.match(source, /return run\(key, task, \{ confirmed: true, sensitive \}\)/);
assert.match(source, /runAfterConfirmation\('voice-device-' \+ parsed\.action, tasks\[parsed\.action\], true\)/);
assert.match(source, /if \(window\.confirm\(label\('Run a local security review\?/);
assert.match(source, /runAfterConfirmation\('security-scan', async \(\) => \{[\s\S]*?AFGJarvis\.getSecuritySnapshot\(\)/);
assert.match(source, /runAfterConfirmation\(item\.id, \(\) => AFGJarvis\.performAction\(\{ action: item\.id \}\), true\)/);
assert.ok(source.includes("runAfterConfirmation('location', async () => { const location = await AFGJarvis.getLocation(); setDeviceData(v => ({...v,location})); }, true);"));
assert.ok(source.includes("runAfterConfirmation('contacts', async () => { const contacts = await AFGJarvis.getContacts({limit:20}); setDeviceData(v => ({...v,contacts})); }, true);"));
assert.ok(source.includes("runAfterConfirmation('clipboard-get', async () => { const value=await AFGJarvis.getClipboard(); setClipboardInput(value.text); }, true);"));
assert.ok(source.includes("runAfterConfirmation('click', () => AFGJarvis.clickText({ text: targetText.trim() }), true);"));
assert.match(source, /if \(window\.confirm\(label\('Start speech recognition now\?/);
assert.match(source, /if \(window\.confirm\(label\('Read the current clipboard contents/);
assert.match(source, /SMS reading disabled by default/);
assert.ok(source.includes('app.specialAccess.map(access =>'), 'The local review must display Android special access separately.');
assert.ok(source.includes("access.name.replace(/_/g, ' ')"), 'Special-access labels must be rendered readably.');
assert.match(source, /access\.state === 'default'/);
assert.match(source, /access\.state === 'unknown'/);
assert.match(source, /access.state === 'default'/);
assert.ok(!source.includes("runAfterConfirmation('sms',"), 'The SMS UI must not offer an active read action while policy keeps it disabled by default.');
assert.match(source, /if \(window\.confirm\(label\('Replace the clipboard/);

const permissionGuardStart = source.indexOf('async function requestJarvisPermission');
const permissionGuardEnd = source.indexOf('async function run(key: string', permissionGuardStart);
assert.ok(permissionGuardStart >= 0 && permissionGuardEnd > permissionGuardStart);
for (const method of [
  'requestCameraPermission', 'requestLocationPermission', 'requestContactsPermission',
  'requestSmsReadPermission', 'requestMicrophonePermission',
]) {
  const matches = [...source.matchAll(new RegExp('AFGJarvis\\.' + method + '\\(\\)', 'g'))];
  assert.equal(matches.length, 1, method + ' must be requested only by the policy preflight.');
  assert.ok(matches[0].index >= permissionGuardStart && matches[0].index < permissionGuardEnd);
}

console.log('JARVIS dispatcher: all native actions have policy mappings; unknown actions fail closed; consent and Android permission preflights run before native tasks.');
