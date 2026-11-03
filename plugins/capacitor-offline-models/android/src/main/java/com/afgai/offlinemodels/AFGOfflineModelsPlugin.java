package com.afgai.offlinemodels;

import android.app.DownloadManager;
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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "AFGOfflineModels")
public class AFGOfflineModelsPlugin extends Plugin {
    private static final String PREFS = "afg_ai_offline_downloads";
    private static final String PREFIX = "download_";
    private static final ExecutorService INFERENCE_EXECUTOR = Executors.newSingleThreadExecutor();
    private static final boolean NATIVE_RUNTIME_AVAILABLE;

    static {
        boolean loaded;
        try { System.loadLibrary("afg_llama_jni"); loaded = true; }
        catch (UnsatisfiedLinkError error) { loaded = false; android.util.Log.e("AFGOfflineModels", "llama.cpp native library unavailable", error); }
        NATIVE_RUNTIME_AVAILABLE = loaded;
    }

    private native boolean nativeLoadModel(String path, String nativeLibraryDirectory, int contextSize, int threads);
    private native String nativeGenerate(String messagesJson, int maxTokens);
    private native String nativeGenerateStream(String messagesJson, int maxTokens, Object callback);
    private native void nativeCancelGeneration();
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
                if (!file.isFile() || file.length() <= 0) {
                    state = "error";
                    error = "Downloaded model file is missing or empty.";
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
        File model = new File(path);
        if (!model.isFile() || !model.getName().toLowerCase(Locale.ROOT).endsWith(".gguf")) { call.reject("A downloaded GGUF model file is required."); return; }
        try {
            boolean loaded = nativeLoadModel(model.getAbsolutePath(), getContext().getApplicationInfo().nativeLibraryDir, contextSize == null ? 2048 : contextSize, threads == null ? 4 : threads);
            if (!loaded) { call.reject(nativeGetLastError()); return; }
            JSObject result = new JSObject(); result.put("loaded", true); result.put("path", model.getAbsolutePath()); result.put("sizeBytes", model.length()); call.resolve(result);
        } catch (Exception error) { call.reject("Unable to load the local GGUF model.", error); }
    }

    @PluginMethod
    public void generate(PluginCall call) {
        if (!NATIVE_RUNTIME_AVAILABLE) { call.reject("The Android llama.cpp runtime is not available in this APK."); return; }
        String messages = call.getString("messages", "[]");
        Integer maxTokens = call.getInt("maxTokens");
        try {
            String response = nativeGenerate(messages, maxTokens == null ? 256 : maxTokens);
            if (response == null) { call.reject(nativeGetLastError()); return; }
            JSObject result = new JSObject(); result.put("text", response); call.resolve(result);
        } catch (Exception error) { call.reject("Local GGUF inference failed.", error); }
    }

    @PluginMethod
    public void generateStream(PluginCall call) {
        generationCancelled = false;
        if (!NATIVE_RUNTIME_AVAILABLE) { call.reject("The Android llama.cpp runtime is not available in this APK."); return; }
        final String messages = call.getString("messages", "[]");
        final Integer requestedTokens = call.getInt("maxTokens");
        INFERENCE_EXECUTOR.execute(() -> {
            try {
                String response = nativeGenerateStream(messages, requestedTokens == null ? 256 : requestedTokens, this);
                if (response == null) {
                    String error = nativeGetLastError();
                    call.reject(error == null || error.isEmpty() ? "Local GGUF streaming inference failed." : error);
                    return;
                }
                JSObject result = new JSObject();
                result.put("text", response);
                result.put("cancelled", generationCancelled);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Local GGUF streaming inference failed.", error);
            }
        });
    }

    private volatile boolean generationCancelled = false;

    public void onNativeToken(String token) {
        JSObject event = new JSObject();
        event.put("token", token);
        notifyListeners("generationToken", event);
    }

    @PluginMethod
    public void cancelGeneration(PluginCall call) {
        generationCancelled = true;
        if (NATIVE_RUNTIME_AVAILABLE) nativeCancelGeneration();
        JSObject result = new JSObject();
        result.put("cancelled", true);
        call.resolve(result);
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
