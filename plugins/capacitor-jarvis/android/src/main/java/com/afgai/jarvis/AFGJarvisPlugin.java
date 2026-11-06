package com.afgai.jarvis;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;
import android.text.TextUtils;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AFGJarvis")
public class AFGJarvisPlugin extends Plugin {
    private boolean isAccessibilityEnabled() {
        String enabled = Settings.Secure.getString(getContext().getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (TextUtils.isEmpty(enabled)) return false;
        String expected = getContext().getPackageName() + "/" + AFGJarvisAccessibilityService.class.getName();
        TextUtils.SimpleStringSplitter splitter = new TextUtils.SimpleStringSplitter(':');
        splitter.setString(enabled);
        while (splitter.hasNext()) if (expected.equalsIgnoreCase(splitter.next())) return true;
        return false;
    }

    @PluginMethod public void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", true);
        result.put("accessibilityEnabled", isAccessibilityEnabled());
        result.put("serviceConnected", AFGJarvisAccessibilityService.isConnected());
        result.put("androidVersion", Build.VERSION.SDK_INT);
        result.put("overlaySupported", false);
        result.put("voiceOfflineSupported", false);
        call.resolve(result);
    }

    @PluginMethod public void openAccessibilitySettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject(); result.put("opened", true); call.resolve(result);
        } catch (Exception error) { call.reject("Unable to open Android Accessibility settings.", error); }
    }

    @PluginMethod public void openApp(PluginCall call) {
        String packageName = call.getString("packageName", "");
        if (packageName == null || !packageName.matches("[A-Za-z0-9_]+(\\.[A-Za-z0-9_]+)+")) {
            call.reject("A valid Android package name is required."); return;
        }
        try {
            PackageManager manager = getContext().getPackageManager();
            Intent launch = manager.getLaunchIntentForPackage(packageName);
            if (launch == null) { call.reject("That app is not installed or cannot be launched."); return; }
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(launch);
            JSObject result = new JSObject(); result.put("opened", true); call.resolve(result);
        } catch (Exception error) { call.reject("Unable to open the selected app.", error); }
    }

    @PluginMethod public void performAction(PluginCall call) {
        String action = call.getString("action", "");
        if (!java.util.Arrays.asList("back","home","notifications","quickSettings","scrollForward","scrollBackward").contains(action)) {
            call.reject("Unsupported device action."); return;
        }
        if (!isAccessibilityEnabled() || !AFGJarvisAccessibilityService.isConnected()) {
            call.reject("Enable the AFG AI Jarvis accessibility service first."); return;
        }
        boolean performed = AFGJarvisAccessibilityService.perform(action);
        JSObject result = new JSObject(); result.put("performed", performed); call.resolve(result);
    }

    @PluginMethod public void clickText(PluginCall call) {
        String text = call.getString("text", "");
        if (text == null || text.trim().isEmpty() || text.length() > 120) { call.reject("Button text must be 1 to 120 characters."); return; }
        if (!isAccessibilityEnabled() || !AFGJarvisAccessibilityService.isConnected()) { call.reject("Enable the AFG AI Jarvis accessibility service first."); return; }
        JSObject result = new JSObject(); result.put("clicked", AFGJarvisAccessibilityService.clickText(text)); call.resolve(result);
    }

    @PluginMethod public void typeText(PluginCall call) {
        String text = call.getString("text", "");
        if (text == null || text.length() > 2000) { call.reject("Text must not exceed 2,000 characters."); return; }
        if (!isAccessibilityEnabled() || !AFGJarvisAccessibilityService.isConnected()) { call.reject("Enable the AFG AI Jarvis accessibility service first."); return; }
        JSObject result = new JSObject(); result.put("typed", AFGJarvisAccessibilityService.typeText(text)); call.resolve(result);
    }
}
