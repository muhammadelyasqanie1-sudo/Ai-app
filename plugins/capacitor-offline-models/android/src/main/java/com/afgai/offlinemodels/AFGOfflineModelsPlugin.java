package com.afgai.offlinemodels;

import android.app.DownloadManager;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.os.VibrationEffect;
import android.telephony.PhoneNumberUtils;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Set;

@CapacitorPlugin(name = "AFGOfflineModels")
public class AFGOfflineModelsPlugin extends Plugin {
    private static final String PREFS = "afg_ai_offline_downloads";
    private static final String PREFIX = "download_";
    private static final boolean NATIVE_RUNTIME_AVAILABLE;

    static {
        boolean loaded;
        try { System.loadLibrary("afg_llama_jni"); loaded = true; }
        catch (UnsatisfiedLinkError error) { loaded = false; android.util.Log.e("AFGOfflineModels", "llama.cpp native library unavailable", error); }
        NATIVE_RUNTIME_AVAILABLE = loaded;
    }

    private native boolean nativeLoadModel(String path, String nativeLibraryDirectory, int contextSize, int threads);
    private native String nativeGenerate(String messagesJson, int maxTokens);
    private native void nativeUnloadModel();
    private native String nativeGetLastError();

    private DownloadManager manager() {
        return (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
    }

    private File modelDirectory() throws Exception {
        File downloads = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (downloads == null) throw new Exception("App-specific download storage is unavailable.");
        File directory = new File(downloads, "afg-ai-models");
        if (!directory.exists() && !directory.mkdirs()) throw new Exception("Unable to create the private model directory.");
        return directory;
    }

    private String key(long id) { return PREFIX + id; }

    private JSONObject metadata(long id) {
        String raw = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(key(id), null);
        if (raw == null) return new JSONObject();
        try { return new JSONObject(raw); } catch (JSONException ignored) { return new JSONObject(); }
    }

    private void saveMetadata(long id, JSONObject value) {
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(key(id), value.toString()).apply();
    }

    private String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[1024 * 1024];
        try (FileInputStream input = new FileInputStream(file)) {
            int read;
            while ((read = input.read(buffer)) != -1) digest.update(buffer, 0, read);
        }
        StringBuilder result = new StringBuilder();
        for (byte value : digest.digest()) result.append(String.format(Locale.ROOT, "%02x", value & 0xff));
        return result.toString();
    }

    private JSObject queryDownload(long id) throws Exception {
        DownloadManager dm = manager();
        Cursor cursor = dm.query(new DownloadManager.Query().setFilterById(id));
        if (cursor == null) throw new Exception("Unable to query Android download status.");
        try {
            if (!cursor.moveToFirst()) throw new Exception("Android download record was not found.");
            int statusIndex = cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS);
            int downloadedIndex = cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR);
            int totalIndex = cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES);
            int reasonIndex = cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON);
            int uriIndex = cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI);
            int statusCode = cursor.getInt(statusIndex);
            long downloaded = cursor.getLong(downloadedIndex);
            long total = cursor.getLong(totalIndex);
            int reason = cursor.getInt(reasonIndex);
            JSONObject meta = metadata(id);
            String localPath = meta.optString("localPath", "");
            String expectedSha = meta.optString("expectedSha256", "");
            String computedSha = meta.optString("computedSha256", "");
            boolean hashVerified = meta.optBoolean("hashVerified", false);
            String state;
            String error = "";

            if (statusCode == DownloadManager.STATUS_SUCCESSFUL) {
                File file = new File(localPath);
                long expectedBytes = meta.optLong("expectedBytes", -1L);
                if (!file.isFile() || file.length() <= 0) {
                    state = "error";
                    error = "Downloaded model file is missing or empty.";
                } else if (expectedBytes > 0 && file.length() != expectedBytes) {
                    file.delete();
                    state = "error";
                    error = "Downloaded model size does not match the trusted repository metadata; the incomplete file was deleted.";
                } else if (computedSha.isEmpty()) {
                    computedSha = sha256(file);
                    hashVerified = !expectedSha.isEmpty() && expectedSha.equalsIgnoreCase(computedSha);
                    if (!expectedSha.isEmpty() && !hashVerified) {
                        file.delete();
                        meta.put("computedSha256", computedSha);
                        meta.put("hashVerified", false);
                        meta.put("integrityError", true);
                        saveMetadata(id, meta);
                        state = "error";
                        error = "SHA-256 verification failed. The corrupted model was deleted.";
                    } else {
                        meta.put("computedSha256", computedSha);
                        meta.put("hashVerified", hashVerified);
                        saveMetadata(id, meta);
                        state = "installed";
                    }
                } else if (!expectedSha.isEmpty() && !expectedSha.equalsIgnoreCase(computedSha)) {
                    file.delete();
                    state = "error";
                    error = "SHA-256 verification failed. The corrupted model was deleted.";
                } else {
                    state = "installed";
                }
            } else if (statusCode == DownloadManager.STATUS_FAILED) {
                state = "error";
                error = "Android DownloadManager failed (reason " + reason + ").";
            } else if (statusCode == DownloadManager.STATUS_PAUSED) {
                state = "paused";
            } else {
                state = "downloading";
            }

            JSObject result = new JSObject();
            result.put("id", meta.optString("id", ""));
            result.put("downloadId", id);
            result.put("repoId", meta.optString("repoId", ""));
            result.put("revision", meta.optString("revision", "main"));
            result.put("fileName", meta.optString("fileName", ""));
            result.put("status", state);
            result.put("downloadedBytes", downloaded);
            long knownBytes = total > 0 ? total : meta.optLong("expectedBytes", -1);
            result.put("expectedBytes", knownBytes > 0 ? knownBytes : null);
            result.put("expectedSha256", expectedSha.isEmpty() ? null : expectedSha);
            result.put("computedSha256", computedSha.isEmpty() ? null : computedSha);
            result.put("hashVerified", hashVerified);
            result.put("localPath", localPath.isEmpty() ? null : localPath);
            if (!error.isEmpty()) result.put("error", error);
            return result;
        } finally {
            cursor.close();
        }
    }


    // Narrow, user-visible Android actions. Sensitive actions only open the
    // system confirmation UI; this plugin never sends SMS or places calls silently.
    @PluginMethod
    public void getBatteryStatus(PluginCall call) {
        try {
            Intent battery = getContext().registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (battery == null) { call.reject("Battery status is unavailable."); return; }
            int level = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scale = battery.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
            int status = battery.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
            int plugged = battery.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0);
            int percent = level >= 0 && scale > 0 ? Math.round(level * 100f / scale) : -1;
            JSObject result = new JSObject();
            result.put("level", percent);
            result.put("charging", status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL);
            result.put("plugged", plugged != 0);
            result.put("technology", battery.getStringExtra(BatteryManager.EXTRA_TECHNOLOGY));
            result.put("temperatureC", battery.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1) / 10.0);
            call.resolve(result);
        } catch (Exception error) { call.reject("Unable to read battery status.", error); }
    }

    @PluginMethod
    public void vibrate(PluginCall call) {
        Integer duration = call.getInt("durationMs");
        int ms = duration == null ? 180 : Math.max(1, Math.min(1000, duration));
        try {
            Vibrator vibrator;
            if (Build.VERSION.SDK_INT >= 31) {
                VibratorManager manager = (VibratorManager) getContext().getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                vibrator = manager == null ? null : manager.getDefaultVibrator();
            } else {
                //noinspection deprecation
                vibrator = (Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
            }
            if (vibrator == null || !vibrator.hasVibrator()) { call.reject("This device has no available vibrator."); return; }
            if (Build.VERSION.SDK_INT >= 26) vibrator.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
            else {
                //noinspection deprecation
                vibrator.vibrate(ms);
            }
            JSObject result = new JSObject(); result.put("started", true); result.put("durationMs", ms); call.resolve(result);
        } catch (Exception error) { call.reject("Unable to activate vibration.", error); }
    }

    @PluginMethod
    public void openApp(PluginCall call) {
        String app = call.getString("app", "").toLowerCase(Locale.ROOT).trim();
        String packageName = null;
        if ("youtube".equals(app)) packageName = "com.google.android.youtube";
        else if ("maps".equals(app)) packageName = "com.google.android.apps.maps";
        else if ("chrome".equals(app)) packageName = "com.android.chrome";
        else if ("telegram".equals(app)) packageName = "org.telegram.messenger";
        else if ("whatsapp".equals(app)) packageName = "com.whatsapp";
        else if ("settings".equals(app)) {
            try {
                Intent settings = new Intent(android.provider.Settings.ACTION_SETTINGS);
                settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(settings);
                JSObject result = new JSObject(); result.put("opened", true); result.put("app", app); call.resolve(result); return;
            } catch (Exception error) { call.reject("Unable to open Android Settings.", error); return; }
        } else if ("camera".equals(app)) {
            try {
                Intent camera = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
                camera.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                if (camera.resolveActivity(getContext().getPackageManager()) == null) { call.reject("No camera app is available."); return; }
                getContext().startActivity(camera);
                JSObject result = new JSObject(); result.put("opened", true); result.put("app", app); call.resolve(result); return;
            } catch (Exception error) { call.reject("Unable to open the camera app.", error); return; }
        } else { call.reject("This app is not in AFG AI's allowed app list."); return; }

        try {
            Intent launch = getContext().getPackageManager().getLaunchIntentForPackage(packageName);
            if (launch == null) { call.reject("The requested app is not installed."); return; }
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(launch);
            JSObject result = new JSObject(); result.put("opened", true); result.put("app", app); call.resolve(result);
        } catch (Exception error) { call.reject("Unable to open the requested app.", error); }
    }

    @PluginMethod
    public void requestCallConfirmation(PluginCall call) {
        String number = call.getString("phoneNumber", "").trim();
        if (number.isEmpty() || number.length() > 40) { call.reject("A valid phone number is required."); return; }
        try {
            Intent dial = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(number)));
            dial.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(dial);
            JSObject result = new JSObject(); result.put("confirmationOpened", true); call.resolve(result);
        } catch (Exception error) { call.reject("Unable to open the system dialer.", error); }
    }

    @PluginMethod
    public void requestSmsConfirmation(PluginCall call) {
        String number = call.getString("phoneNumber", "").trim();
        String body = call.getString("message", "");
        if (number.isEmpty() || number.length() > 40 || body.length() > 5000) { call.reject("A valid phone number and message are required."); return; }
        try {
            Intent sms = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + Uri.encode(number)));
            sms.putExtra("sms_body", body);
            sms.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(sms);
            JSObject result = new JSObject(); result.put("confirmationOpened", true); call.resolve(result);
        } catch (Exception error) { call.reject("Unable to open the system SMS composer.", error); }
    }

    @PluginMethod
    public void getRuntimeInfo(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", NATIVE_RUNTIME_AVAILABLE);
        result.put("engine", NATIVE_RUNTIME_AVAILABLE ? "llama.cpp" : "unavailable");
        result.put("abi", Build.SUPPORTED_ABIS != null && Build.SUPPORTED_ABIS.length > 0 ? Build.SUPPORTED_ABIS[0] : "unknown");
        result.put("backend", "CPU");
        if (!NATIVE_RUNTIME_AVAILABLE) result.put("reason", "The arm64 llama.cpp native library was not included in this build.");
        call.resolve(result);
    }

    @PluginMethod
    public void loadModel(PluginCall call) {
        if (!NATIVE_RUNTIME_AVAILABLE) { call.reject("The Android llama.cpp runtime is not available in this APK."); return; }
        String path = call.getString("path", "");
        Integer contextSize = call.getInt("contextSize");
        Integer threads = call.getInt("threads");
        try {
            File model = new File(path);
            File modelRoot = modelDirectory();
            String rootPath = modelRoot.getCanonicalPath() + File.separator;
            String modelPath = model.getCanonicalPath();
            if (!modelPath.startsWith(rootPath) || !model.isFile() || model.length() <= 0 ||
                !model.getName().toLowerCase(Locale.ROOT).endsWith(".gguf")) {
                call.reject("A non-empty GGUF model inside AFG AI's private model directory is required.");
                return;
            }
            boolean loaded = nativeLoadModel(modelPath, getContext().getApplicationInfo().nativeLibraryDir, contextSize == null ? 2048 : contextSize, threads == null ? 4 : threads);
            if (!loaded) { call.reject(nativeGetLastError()); return; }
            JSObject result = new JSObject(); result.put("loaded", true); result.put("path", model.getAbsolutePath()); result.put("sizeBytes", model.length()); call.resolve(result);
        } catch (Exception error) { call.reject("Unable to load the local GGUF model.", error); }
    }

    @PluginMethod
    public void generate(PluginCall call) {
        if (!NATIVE_RUNTIME_AVAILABLE) { call.reject("The Android llama.cpp runtime is not available in this APK."); return; }
        String messages = call.getString("messages", "[]");
        Integer maxTokens = call.getInt("maxTokens");
        if (messages == null || messages.length() > 1_000_000) {
            call.reject("The local inference prompt exceeds the 1 MB input limit.");
            return;
        }
        try {
            String response = nativeGenerate(messages, maxTokens == null ? 256 : maxTokens);
            if (response == null) { call.reject(nativeGetLastError()); return; }
            JSObject result = new JSObject(); result.put("text", response); call.resolve(result);
        } catch (Exception error) { call.reject("Local GGUF inference failed.", error); }
    }

    @PluginMethod
    public void unloadModel(PluginCall call) {
        if (NATIVE_RUNTIME_AVAILABLE) nativeUnloadModel();
        JSObject result = new JSObject(); result.put("unloaded", true); call.resolve(result);
    }
    @PluginMethod
    public void startDownload(PluginCall call) {
        try {
            String url = call.getString("url", "");
            String repoId = call.getString("repoId", "");
            String revision = call.getString("revision", "main");
            String fileName = call.getString("fileName", "");
            String expectedSha = call.getString("expectedSha256", "");
            Long expectedBytesValue = call.getLong("expectedBytes");
            long expectedBytes = expectedBytesValue == null ? -1L : expectedBytesValue;
            Uri uri = Uri.parse(url);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || !"huggingface.co".equalsIgnoreCase(uri.getHost())) {
                call.reject("Only HTTPS Hugging Face model downloads are allowed."); return;
            }
            if (!repoId.matches("[^/]+/[^/]+") || fileName.isEmpty() || !fileName.toLowerCase(Locale.ROOT).endsWith(".gguf") ||
                    fileName.contains("..") || fileName.startsWith("/")) {
                call.reject("Invalid GGUF model selection."); return;
            }
            File directory = modelDirectory();
            String safeName = UUID.randomUUID().toString() + "-" + new File(fileName).getName().replaceAll("[^a-zA-Z0-9._-]", "_");
            File destination = new File(directory, safeName);
            DownloadManager.Request request = new DownloadManager.Request(uri);
            request.setTitle("AFG AI model download");
            request.setDescription(repoId + " · " + fileName);
            request.setMimeType("application/octet-stream");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setAllowedOverMetered(true);
            request.setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS, "afg-ai-models/" + safeName);
            long id = manager().enqueue(request);

            JSONObject meta = new JSONObject();
            meta.put("id", repoId + "/" + fileName);
            meta.put("repoId", repoId);
            meta.put("revision", revision);
            meta.put("fileName", fileName);
            meta.put("expectedBytes", expectedBytes);
            meta.put("expectedSha256", expectedSha);
            meta.put("localPath", destination.getAbsolutePath());
            saveMetadata(id, meta);

            JSObject result = new JSObject();
            result.put("downloadId", id);
            result.put("id", repoId + "/" + fileName);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to start the Android model download.", error);
        }
    }

    @PluginMethod
    public void getDownloadStatus(PluginCall call) {
        try {
            Long id = call.getLong("downloadId");
            if (id == null || id <= 0) { call.reject("A valid download ID is required."); return; }
            call.resolve(queryDownload(id));
        } catch (Exception error) {
            call.reject("Unable to read Android model download status.", error);
        }
    }

    @PluginMethod
    public void listDownloads(PluginCall call) {
        try {
            JSArray downloads = new JSArray();
            Map<String, ?> all = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).getAll();
            for (String storedKey : all.keySet()) {
                if (!storedKey.startsWith(PREFIX)) continue;
                try {
                    long id = Long.parseLong(storedKey.substring(PREFIX.length()));
                    downloads.put(queryDownload(id));
                } catch (Exception ignored) { }
            }
            JSObject result = new JSObject();
            result.put("downloads", downloads);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to list Android model downloads.", error);
        }
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        removeDownload(call, true);
    }

    @PluginMethod
    public void deleteModel(PluginCall call) {
        removeDownload(call, true);
    }

    private void removeDownload(PluginCall call, boolean deleteFile) {
        try {
            Long id = call.getLong("downloadId");
            if (id == null || id <= 0) { call.reject("A valid download ID is required."); return; }
            JSONObject meta = metadata(id);
            manager().remove(id);
            if (deleteFile) {
                String path = meta.optString("localPath", "");
                if (!path.isEmpty()) new File(path).delete();
            }
            getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(key(id)).apply();
            JSObject result = new JSObject();
            result.put("removed", true);
            result.put("deleted", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to remove the Android model file.", error);
        }
    }
}
