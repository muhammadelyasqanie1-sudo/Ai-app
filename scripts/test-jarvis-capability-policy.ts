import assert from 'node:assert/strict';
import { authorizeJarvisCapability, getJarvisCapabilityRule } from '../src/lib/jarvis-capability-policy';

const allPermissions = new Set([
  'CAMERA',
  'ACCESS_COARSE_LOCATION',
  'ACCESS_FINE_LOCATION',
  'READ_CONTACTS',
  'READ_SMS',
  'RECORD_AUDIO',
  'USER_ENABLED_ACCESSIBILITY_SERVICE',
]);

const granted = (permission: string) => allPermissions.has(permission);
const foreground = { foreground: true };

assert.equal(getJarvisCapabilityRule('device.battery.read')?.risk, 'low');
assert.equal(getJarvisCapabilityRule('device.location.read')?.anyOfPermissions?.length, 1);

// Unknown or misspelled actions must never fall through to an allowed operation.
assert.deepEqual(
  authorizeJarvisCapability('made.up.capability', foreground),
  { allowed: false, reason: 'unknown_capability' },
);
assert.deepEqual(
  authorizeJarvisCapability('device.files.delete', { ...foreground, confirmed: true }),
  { allowed: false, reason: 'unknown_capability' },
);

// Foreground is mandatory, even for read-only tools.
assert.equal(authorizeJarvisCapability('device.battery.read').reason, 'foreground_required');
assert.equal(authorizeJarvisCapability('device.battery.read', foreground).allowed, true);

// Always-confirm actions stay blocked until the UI reports a fresh confirmation.
assert.equal(authorizeJarvisCapability('device.location.read', foreground).reason, 'confirmation_required');
assert.equal(
  authorizeJarvisCapability('device.location.read', { ...foreground, confirmed: true }).reason,
  'permission_required',
);

// Android grants approximate OR precise location; neither must require both.
assert.equal(
  authorizeJarvisCapability('device.location.read', {
    ...foreground, confirmed: true, permissionGranted: p => p === 'ACCESS_COARSE_LOCATION',
  }).allowed,
  true,
);
assert.equal(
  authorizeJarvisCapability('device.location.read', {
    ...foreground, confirmed: true, permissionGranted: p => p === 'ACCESS_FINE_LOCATION',
  }).allowed,
  true,
);

// A sensitive navigation action requires confirmation only when the caller marks it sensitive.
assert.equal(
  authorizeJarvisCapability('device.accessibility.navigate', {
    ...foreground, sensitive: true,
    permissionGranted: p => p === 'USER_ENABLED_ACCESSIBILITY_SERVICE',
  }).reason,
  'confirmation_required',
);
assert.equal(
  authorizeJarvisCapability('device.accessibility.navigate', {
    ...foreground, sensitive: true, confirmed: true,
    permissionGranted: p => p === 'USER_ENABLED_ACCESSIBILITY_SERVICE',
  }).allowed,
  true,
);
assert.equal(
  authorizeJarvisCapability('device.accessibility.navigate', {
    ...foreground, sensitive: true, confirmed: true,
  }).reason,
  'permission_required',
);

// Every high-impact device capability checks its Android permission and user confirmation.
assert.equal(
  authorizeJarvisCapability('device.contacts.read', { ...foreground, confirmed: true }).reason,
  'permission_required',
);
assert.equal(
  authorizeJarvisCapability('device.contacts.read', {
    ...foreground, confirmed: true, permissionGranted: granted,
  }).allowed,
  true,
);
assert.equal(
  authorizeJarvisCapability('device.microphone.listen', { ...foreground, confirmed: true }).reason,
  'permission_required',
);
assert.equal(
  authorizeJarvisCapability('device.microphone.listen', {
    ...foreground, confirmed: true, permissionGranted: granted,
  }).allowed,
  true,
);

// SMS reading, shell/code execution and payments remain blocked even with consent and permissions.
for (const capability of ['device.sms.read', 'agent.shell.execute', 'agent.code.execute', 'agent.payment']) {
  assert.equal(
    authorizeJarvisCapability(capability, {
      ...foreground, confirmed: true, permissionGranted: granted,
    }).reason,
    'disabled_by_default',
    capability,
  );
}

// A settings shortcut and TTS do not claim to change system settings or access private data.
assert.equal(authorizeJarvisCapability('security.scan', foreground).reason, 'confirmation_required');
assert.equal(authorizeJarvisCapability('security.scan', { ...foreground, confirmed: true }).allowed, true);
assert.equal(authorizeJarvisCapability('device.accessibility.settings.open', foreground).allowed, true);
assert.equal(authorizeJarvisCapability('device.speech.speak', foreground).allowed, true);

console.log('JARVIS capability policy: unknown actions, foreground, confirmation, sensitive navigation, permission groups and disabled-by-default gates passed.');
