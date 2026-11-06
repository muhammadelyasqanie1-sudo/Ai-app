export type JarvisAction = 'back' | 'home' | 'notifications' | 'quickSettings' | 'scrollForward' | 'scrollBackward';
export type JarvisSpeechLanguage = 'en-US' | 'fa-IR' | 'ps-AF' | 'ar';
export interface JarvisStatus {
  supported: boolean; accessibilityEnabled: boolean; serviceConnected: boolean;
  androidVersion: number | null; speechRecognizerAvailable: boolean;
  microphonePermission: boolean; offlinePreferenceSupported: boolean;
  offlineRecognitionGuaranteed: false; ttsAvailable: boolean;
}
export interface JarvisSpeechEvent { state: 'listening' | 'processing' | 'partial' | 'result' | 'error'; text: string; error: string; }
export interface AFGJarvisPlugin {
  getStatus(): Promise<JarvisStatus>;
  requestMicrophonePermission(): Promise<{ granted: boolean }>;
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
