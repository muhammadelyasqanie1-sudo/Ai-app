export type JarvisAction = 'back' | 'home' | 'notifications' | 'quickSettings' | 'scrollForward' | 'scrollBackward';
export interface JarvisStatus {
  supported: boolean;
  accessibilityEnabled: boolean;
  serviceConnected: boolean;
  androidVersion: number | null;
  overlaySupported: false;
  voiceOfflineSupported: false;
}
export interface AFGJarvisPlugin {
  getStatus(): Promise<JarvisStatus>;
  openAccessibilitySettings(): Promise<{ opened: boolean }>;
  openApp(options: { packageName: string }): Promise<{ opened: boolean }>;
  performAction(options: { action: JarvisAction }): Promise<{ performed: boolean }>;
  clickText(options: { text: string }): Promise<{ clicked: boolean }>;
  typeText(options: { text: string }): Promise<{ typed: boolean }>;
}
export const AFGJarvis: AFGJarvisPlugin;
