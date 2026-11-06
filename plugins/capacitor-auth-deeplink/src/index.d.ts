export interface AfgAuthWebViewPlugin {
  enableThirdPartyCookies(): Promise<void>;
}

export const AfgAuthWebView: AfgAuthWebViewPlugin;
