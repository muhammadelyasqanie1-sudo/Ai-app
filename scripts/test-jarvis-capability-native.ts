import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const plugin = readFileSync(new URL('../plugins/capacitor-jarvis/android/src/main/java/com/afgai/jarvis/AFGJarvisPlugin.java', import.meta.url), 'utf8');
const accessibility = readFileSync(new URL('../plugins/capacitor-jarvis/android/src/main/java/com/afgai/jarvis/AFGJarvisAccessibilityService.java', import.meta.url), 'utf8');

function method(name: string): string {
  const start = plugin.indexOf('@PluginMethod public void ' + name + '(PluginCall call)');
  assert.ok(start >= 0, 'Missing native method: ' + name);
  const next = plugin.indexOf('@PluginMethod public void ', start + 1);
  return plugin.slice(start, next < 0 ? plugin.length : next);
}

assert.match(method('startListening'), /Manifest\.permission\.RECORD_AUDIO/);
assert.match(method('performAction'), /isAccessibilityEnabled\(\)/);
assert.match(method('performAction'), /AFGJarvisAccessibilityService\.isConnected\(\)/);
assert.match(method('performAction'), /Arrays\.asList\("back","home","notifications","quickSettings","scrollForward","scrollBackward"\)/);
assert.match(method('clickText'), /text\.length\(\) > 120/);
assert.match(method('clickText'), /isAccessibilityEnabled\(\)/);
assert.match(method('clickText'), /AFGJarvisAccessibilityService\.isConnected\(\)/);
assert.match(method('typeText'), /text\.length\(\) > 2000/);
assert.match(method('typeText'), /isAccessibilityEnabled\(\)/);
assert.match(method('typeText'), /AFGJarvisAccessibilityService\.isConnected\(\)/);
assert.match(method('setTorch'), /Manifest\.permission\.CAMERA/);
assert.match(method('getLocation'), /Manifest\.permission\.ACCESS_FINE_LOCATION/);
assert.match(method('getLocation'), /Manifest\.permission\.ACCESS_COARSE_LOCATION/);
assert.match(method('getContacts'), /Manifest\.permission\.READ_CONTACTS/);
assert.match(method('getContacts'), /Math\.min\(call\.getInt\("limit", 20\), 50\)/);
assert.match(method('getRecentSms'), /Manifest\.permission\.READ_SMS/);
assert.match(method('getRecentSms'), /Math\.min\(call\.getInt\("limit", 5\), 5\)/);
const securitySnapshot = method('getSecuritySnapshot');
assert.match(securitySnapshot, /Intent\.ACTION_MAIN/);
assert.match(securitySnapshot, /Intent\.CATEGORY_LAUNCHER/);
assert.match(securitySnapshot, /final int maxApps = 100/);
assert.match(securitySnapshot, /manager\.checkPermission\(permission, packageName\)/);
for (const permission of ['READ_PHONE_STATE', 'READ_PHONE_NUMBERS', 'WRITE_CONTACTS', 'RECEIVE_SMS', 'RECEIVE_MMS', 'BODY_SENSORS', 'READ_CALENDAR', 'WRITE_CALENDAR', 'GET_ACCOUNTS', 'ACCESS_BACKGROUND_LOCATION', 'BLUETOOTH_CONNECT', 'POST_NOTIFICATIONS', 'READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO', 'READ_MEDIA_AUDIO', 'READ_MEDIA_VISUAL_USER_SELECTED']) {
  assert.ok(securitySnapshot.includes(permission), 'Security review should include ' + permission);
}
assert.match(securitySnapshot, /Settings\.Global\.ADB_ENABLED/);
assert.match(securitySnapshot, /KeyguardManager/);
assert.match(securitySnapshot, /Build\.VERSION\.SECURITY_PATCH/);
assert.match(securitySnapshot, /android:system_alert_window/);
assert.match(securitySnapshot, /android:write_settings/);
assert.match(securitySnapshot, /android:request_install_packages/);
assert.match(securitySnapshot, /checkOpNoThrow\(/);
assert.match(securitySnapshot, /specialAccess\.put\("state", state\)/);
assert.match(securitySnapshot, /AppOpsManager\.MODE_ALLOWED/);
assert.match(securitySnapshot, /AppOpsManager\.MODE_DEFAULT/);
assert.ok(!securitySnapshot.includes('REQUEST_INSTALL_PACKAGES",\n                Manifest.permission.READ_EXTERNAL_STORAGE'), 'Special installer access must not be represented as a normal runtime permission.');
assert.ok(!securitySnapshot.includes('QUERY_ALL_PACKAGES'), 'The local review must not request broad package visibility.');
assert.match(method('takePhoto'), /MediaStore\.ACTION_IMAGE_CAPTURE/);
assert.match(method('openDialer'), /Intent\.ACTION_DIAL/);
assert.match(method('openSmsComposer'), /Intent\.ACTION_SENDTO/);
assert.match(method('openSmsComposer'), /body\.length\(\) > 1000/);
assert.match(accessibility, /onAccessibilityEvent\(AccessibilityEvent event\) \{ \/\* Events are not recorded or transmitted\. \*\/ \}/);

console.log('JARVIS native Android audit: OS permission gates, bounded inputs, accessibility enablement, safe intents and non-recording event handler passed.');
