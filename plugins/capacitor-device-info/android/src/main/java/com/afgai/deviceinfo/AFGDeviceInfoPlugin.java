package com.afgai.deviceinfo;

import android.app.ActivityManager;
import android.content.Context;
import android.os.Build;
import android.os.StatFs;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

@CapacitorPlugin(name = "AFGDeviceInfo")
public class AFGDeviceInfoPlugin extends Plugin {
    @PluginMethod
    public void getInfo(PluginCall call) {
        try {
            Context context = getContext();
            ActivityManager manager = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
            ActivityManager.MemoryInfo memory = new ActivityManager.MemoryInfo();
            if (manager != null) manager.getMemoryInfo(memory);

            File appFiles = context.getFilesDir();
            StatFs storage = new StatFs(appFiles.getAbsolutePath());
            String model = (Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.trim())
                    + " " + (Build.MODEL == null ? "Android device" : Build.MODEL.trim());

            JSObject result = new JSObject();
            result.put("deviceLabel", model.trim());
            result.put("osLabel", "Android " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")");
            result.put("architecture", Build.SUPPORTED_ABIS != null && Build.SUPPORTED_ABIS.length > 0
                    ? String.join(", ", Build.SUPPORTED_ABIS) : "Unknown");
            result.put("cpuCores", Runtime.getRuntime().availableProcessors());
            result.put("memoryGiB", memory.totalMem > 0
                    ? Math.round((memory.totalMem / 1073741824.0) * 10.0) / 10.0 : 0);
            result.put("availableMemoryGiB", memory.availMem > 0
                    ? Math.round((memory.availMem / 1073741824.0) * 10.0) / 10.0 : 0);
            result.put("lowMemory", memory.lowMemory);
            // App-scoped filesystem availability; Android does not expose a universal free-space figure.
            result.put("storageFreeBytes", storage.getAvailableBytes());
            call.resolve(result);
        } catch (Exception exception) {
            call.reject("Unable to read device capabilities", exception);
        }
    }
}