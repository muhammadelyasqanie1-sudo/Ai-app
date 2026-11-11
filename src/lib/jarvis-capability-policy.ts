/**
 * JARVIS capability policy.
 *
 * This is a client-side safety contract, not an authorization boundary by itself.
 * Native/server handlers MUST enforce the same policy before performing an action.
 * Unknown capabilities fail closed. High-impact actions always require a fresh,
 * human-visible confirmation; permissions are requested only at point of use.
 */
export type JarvisRisk = 'low' | 'moderate' | 'high' | 'critical';
export type JarvisCapability =
  | 'device.status.read'
  | 'device.battery.read'
  | 'device.network.read'
  | 'device.sensors.read'
  | 'device.vibrate'
  | 'device.torch.control'
  | 'device.location.read'
  | 'device.contacts.read'
  | 'device.sms.read'
  | 'device.camera.capture'
  | 'device.clipboard.read'
  | 'device.clipboard.write'
  | 'device.accessibility.navigate'
  | 'device.accessibility.click'
  | 'device.accessibility.type'
  | 'device.app.launch'
  | 'device.dialer.open'
  | 'device.sms.compose'
  | 'device.microphone.listen'
  | 'device.microphone.stop'
  | 'device.speech.speak'
  | 'device.accessibility.settings.open'
  | 'files.read'
  | 'files.write'
  | 'files.delete'
  | 'security.scan'
  | 'security.settings.change'
  | 'agent.web.search'
  | 'agent.browser.interact'
  | 'agent.shell.execute'
  | 'agent.code.execute'
  | 'agent.message.send'
  | 'agent.payment'
  | 'agent.schedule';

export type JarvisCapabilityRule = {
  risk: JarvisRisk;
  confirmation: 'never' | 'when_sensitive' | 'always';
  permissions: readonly string[];
  anyOfPermissions?: readonly (readonly string[])[];
  backgroundAllowed: boolean;
  description: string;
};

const rules: Record<JarvisCapability, JarvisCapabilityRule> = {
  'device.status.read': { risk: 'low', confirmation: 'never', permissions: [], backgroundAllowed: false, description: 'Read basic Android and JARVIS support status' },
  'device.battery.read': { risk: 'low', confirmation: 'never', permissions: [], backgroundAllowed: false, description: 'Read battery level and charging state' },
  'device.network.read': { risk: 'low', confirmation: 'never', permissions: [], backgroundAllowed: false, description: 'Read network transport and validated connectivity without collecting network identifiers' },
  'device.sensors.read': { risk: 'low', confirmation: 'never', permissions: [], backgroundAllowed: false, description: 'List sensor types and availability, not raw biometric data' },
  'device.vibrate': { risk: 'low', confirmation: 'never', permissions: [], backgroundAllowed: false, description: 'Trigger a short bounded vibration' },
  'device.torch.control': { risk: 'moderate', confirmation: 'when_sensitive', permissions: ['CAMERA'], backgroundAllowed: false, description: 'Turn the camera torch on or off' },
  'device.location.read': { risk: 'high', confirmation: 'always', permissions: [], anyOfPermissions: [['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION']], backgroundAllowed: false, description: 'Read location only after explicit user request; approximate or precise access is sufficient' },
  'device.contacts.read': { risk: 'high', confirmation: 'always', permissions: ['READ_CONTACTS'], backgroundAllowed: false, description: 'Read a bounded contact list after explicit user request' },
  'device.sms.read': { risk: 'critical', confirmation: 'always', permissions: ['READ_SMS'], backgroundAllowed: false, description: 'Read a bounded number of recent SMS messages after explicit user request' },
  'device.camera.capture': { risk: 'high', confirmation: 'always', permissions: [], backgroundAllowed: false, description: 'Open the external system camera for user-controlled capture; the user takes the photo' },
  'device.clipboard.read': { risk: 'high', confirmation: 'always', permissions: [], backgroundAllowed: false, description: 'Read clipboard only in foreground after a direct user action' },
  'device.clipboard.write': { risk: 'moderate', confirmation: 'always', permissions: [], backgroundAllowed: false, description: 'Replace clipboard contents after user review' },
  'device.accessibility.navigate': { risk: 'moderate', confirmation: 'when_sensitive', permissions: ['USER_ENABLED_ACCESSIBILITY_SERVICE'], backgroundAllowed: false, description: 'Perform visible navigation actions through user-enabled AccessibilityService' },
  'device.accessibility.settings.open': { risk: 'low', confirmation: 'never', permissions: [], backgroundAllowed: false, description: 'Open Android accessibility settings; the user must enable the service themselves' },
  'device.microphone.listen': { risk: 'high', confirmation: 'always', permissions: ['RECORD_AUDIO'], backgroundAllowed: false, description: 'Start speech recognition only after a foreground user action and Android microphone permission' },
  'device.microphone.stop': { risk: 'low', confirmation: 'never', permissions: [], backgroundAllowed: false, description: 'Stop the active speech recognition session' },
  'device.speech.speak': { risk: 'low', confirmation: 'never', permissions: [], backgroundAllowed: false, description: 'Speak text through the installed Android text-to-speech engine' },
  'device.accessibility.click': { risk: 'high', confirmation: 'always', permissions: ['USER_ENABLED_ACCESSIBILITY_SERVICE'], backgroundAllowed: false, description: 'Click a visible UI control after showing the target and asking confirmation' },
  'device.accessibility.type': { risk: 'high', confirmation: 'always', permissions: ['USER_ENABLED_ACCESSIBILITY_SERVICE'], backgroundAllowed: false, description: 'Enter user-reviewed text into the currently focused field' },
  'device.app.launch': { risk: 'low', confirmation: 'never', permissions: [], backgroundAllowed: false, description: 'Launch an installed app explicitly named by the user' },
  'device.dialer.open': { risk: 'moderate', confirmation: 'always', permissions: [], backgroundAllowed: false, description: 'Open the system dialer with a proposed number; never place a call directly' },
  'device.sms.compose': { risk: 'high', confirmation: 'always', permissions: [], backgroundAllowed: false, description: 'Open the system SMS composer; the user presses Send' },
  'files.read': { risk: 'moderate', confirmation: 'when_sensitive', permissions: ['USER_SELECTED_URI'], backgroundAllowed: false, description: 'Read only files selected through Android scoped storage' },
  'files.write': { risk: 'high', confirmation: 'always', permissions: ['USER_SELECTED_URI'], backgroundAllowed: false, description: 'Write to a user-selected destination after preview' },
  'files.delete': { risk: 'critical', confirmation: 'always', permissions: ['USER_SELECTED_URI'], backgroundAllowed: false, description: 'Delete only a specifically identified user-selected file after a second confirmation' },
  'security.scan': { risk: 'moderate', confirmation: 'always', permissions: [], backgroundAllowed: false, description: 'Run a user-confirmed local security exposure review of Android lock, ADB, accessibility and visible launcher-app permission requests; not an antivirus scan' },
  'security.settings.change': { risk: 'critical', confirmation: 'always', permissions: ['ANDROID_SYSTEM_CONSENT'], backgroundAllowed: false, description: 'Open Android system settings for the user to review and apply a security change' },
  'agent.web.search': { risk: 'low', confirmation: 'never', permissions: [], backgroundAllowed: false, description: 'Search public web information' },
  'agent.browser.interact': { risk: 'high', confirmation: 'always', permissions: ['USER_VISIBLE_BROWSER_SESSION'], backgroundAllowed: false, description: 'Interact with a visible browser session; confirm consequential submissions' },
  'agent.shell.execute': { risk: 'critical', confirmation: 'always', permissions: ['SERVER_SANDBOX_ONLY'], backgroundAllowed: false, description: 'Disabled by default; if enabled later, execute only in an isolated server sandbox' },
  'agent.code.execute': { risk: 'critical', confirmation: 'always', permissions: ['SERVER_SANDBOX_ONLY'], backgroundAllowed: false, description: 'Disabled by default; if enabled later, execute only in an isolated server sandbox' },
  'agent.message.send': { risk: 'critical', confirmation: 'always', permissions: ['CONNECTED_ACCOUNT_CONSENT'], backgroundAllowed: false, description: 'Prepare and preview outbound messages; explicit final approval required' },
  'agent.payment': { risk: 'critical', confirmation: 'always', permissions: ['EXTERNAL_PROVIDER_AUTH'], backgroundAllowed: false, description: 'Never authorize or submit payments without a separate provider-controlled approval' },
  'agent.schedule': { risk: 'moderate', confirmation: 'always', permissions: ['OWNER_SCOPED_JOB_STORAGE'], backgroundAllowed: false, description: 'Create owner-scoped scheduled work with pause and cancel controls' },
};

export function getJarvisCapabilityRule(capability: string): JarvisCapabilityRule | null {
  return Object.prototype.hasOwnProperty.call(rules, capability)
    ? rules[capability as JarvisCapability]
    : null;
}

export type JarvisCapabilityContext = {
  permissionGranted?: (permission: string) => boolean;
  confirmed?: boolean;
  foreground?: boolean;
  sensitive?: boolean;
};

export type JarvisCapabilityDecision =
  | { allowed: true; rule: JarvisCapabilityRule }
  | { allowed: false; reason: 'unknown_capability' | 'confirmation_required' | 'permission_required' | 'foreground_required' | 'disabled_by_default' };

const disabledByDefault = new Set<JarvisCapability>([
  'device.sms.read',
  'agent.shell.execute',
  'agent.code.execute',
  'agent.payment',
]);

export function authorizeJarvisCapability(
  capability: string,
  context: JarvisCapabilityContext = {},
): JarvisCapabilityDecision {
  const rule = getJarvisCapabilityRule(capability);
  if (!rule) return { allowed: false, reason: 'unknown_capability' };
  const typed = capability as JarvisCapability;
  if (disabledByDefault.has(typed)) return { allowed: false, reason: 'disabled_by_default' };
  if ((rule.confirmation === 'always' || (rule.confirmation === 'when_sensitive' && context.sensitive === true)) && context.confirmed !== true) {
    return { allowed: false, reason: 'confirmation_required' };
  }
  if (rule.backgroundAllowed === false && context.foreground !== true) {
    return { allowed: false, reason: 'foreground_required' };
  }
  if (rule.permissions.some(permission => context.permissionGranted?.(permission) !== true)) {
    return { allowed: false, reason: 'permission_required' };
  }
  if (rule.anyOfPermissions?.some(group => !group.some(permission => context.permissionGranted?.(permission) === true))) {
    return { allowed: false, reason: 'permission_required' };
  }
  return { allowed: true, rule };
}
