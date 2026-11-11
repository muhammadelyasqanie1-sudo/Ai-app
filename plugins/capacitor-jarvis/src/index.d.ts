export type JarvisAction = 'back' | 'home' | 'notifications' | 'quickSettings' | 'scrollForward' | 'scrollBackward';
export type JarvisSpeechLanguage = 'en-US' | 'fa-AF' | 'fa-IR' | 'ps-AF' | 'ar';
export interface JarvisStatus {
  supported: boolean; accessibilityEnabled: boolean; serviceConnected: boolean;
  androidVersion: number | null; speechRecognizerAvailable: boolean;
  microphonePermission: boolean; offlinePreferenceSupported: boolean;
  offlineRecognitionGuaranteed: false; voskModelImported: boolean; voskModelReady: boolean; ttsAvailable: boolean;
}
export interface JarvisSpeechEvent { state: 'listening' | 'processing' | 'partial' | 'result' | 'error'; text: string; error: string; }
export interface JarvisBatteryStatus { levelPercent: number; charging: boolean; temperatureC: number | null; }
export interface JarvisNetworkStatus { connected: boolean; validated: boolean; transport: 'wifi' | 'cellular' | 'ethernet' | 'bluetooth' | 'other' | 'none'; }
export interface JarvisLocation { latitude: number; longitude: number; accuracyMeters: number | null; timestamp: number; source: 'gps' | 'network' | 'passive' | 'unknown'; }
export interface JarvisContact { name: string | null; phone: string | null; }
export interface JarvisSms { address: string | null; body: string; date: number; type: 'inbox' | 'sent'; }
export interface JarvisSensor { name: string; vendor: string; type: number; powerMa: number; wakeUp: boolean; }
export interface JarvisCameraPreview { mimeType: 'image/jpeg'; dataBase64: string; width: number; height: number; }
export interface AFGJarvisPlugin {
  getStatus(): Promise<JarvisStatus>;
  getBatteryStatus(): Promise<JarvisBatteryStatus>;
  setClipboard(options: { text: string }): Promise<{ copied: boolean }>;
  getClipboard(): Promise<{ text: string }>;
  vibrate(options?: { durationMs?: number }): Promise<{ performed: boolean; durationMs: number }>;
  requestCameraPermission(): Promise<{ granted: boolean }>;
  setTorch(options: { enabled: boolean }): Promise<{ enabled: boolean }>;
  getNetworkStatus(): Promise<JarvisNetworkStatus>;
  requestLocationPermission(): Promise<{ granted: boolean }>;
  getLocation(): Promise<JarvisLocation>;
  requestContactsPermission(): Promise<{ granted: boolean }>;
  getContacts(options?: { limit?: number }): Promise<{ contacts: JarvisContact[]; count: number }>;
  requestSmsReadPermission(): Promise<{ granted: boolean }>;
  getRecentSms(options?: { limit?: number }): Promise<{ messages: JarvisSms[]; count: number }>;
  openSmsComposer(options: { number: string; body: string }): Promise<{ opened: boolean }>;
  openDialer(options: { number: string }): Promise<{ opened: boolean }>;
  takePhoto(): Promise<JarvisCameraPreview>;
  getSensors(): Promise<{ sensors: JarvisSensor[]; fingerprintOrBiometricAvailable: boolean; fingerprintDataAccessible: false }>;
  requestMicrophonePermission(): Promise<{ granted: boolean }>;
  importVoskModel(): Promise<{ imported: boolean; localPath: string; expandedBytes: number }>;
  loadVoskModel(): Promise<{ loaded: boolean; localPath: string }>;
  startVoskListening(): Promise<{ started: boolean; offline: true }>;
  stopVoskListening(): Promise<{ stopped: boolean }>;
  startListening(options?: { language?: JarvisSpeechLanguage }): Promise<{ started: boolean; offlinePreferred: boolean }>;
  stopListening(): Promise<{ stopped: boolean }>;
  speak(options: { text: string; language?: JarvisSpeechLanguage }): Promise<{ started: boolean }>;
  addListener(eventName: 'speechEvent', listener: (event: JarvisSpeechEvent) => void): Promise<{ remove: () => Promise<void> }>;
  openAccessibilitySettings(): Promise<{ opened: boolean }>;
  openApp(options: { packageName: string }): Promise<{ opened: boolean }>;
  performAction(options: { action: JarvisAction }): Promise<{ performed: boolean }>;
  clickText(options: { text: string }): Promise<{ clicked: boolean }>;
  typeText(options: { text: string }): Promise<{ typed: boolean }>;
}
export const AFGJarvis: AFGJarvisPlugin;
