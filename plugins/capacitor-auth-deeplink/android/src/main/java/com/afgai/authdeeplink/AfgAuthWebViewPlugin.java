package com.afgai.authdeeplink;

import android.webkit.CookieManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AfgAuthWebView")
public class AfgAuthWebViewPlugin extends Plugin {
    @PluginMethod
    public void enableThirdPartyCookies(PluginCall call) {
        try {
            CookieManager.getInstance().setAcceptThirdPartyCookies(getBridge().getWebView(), true);
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not configure secure API cookies for the Android WebView.");
        }
    }
}
