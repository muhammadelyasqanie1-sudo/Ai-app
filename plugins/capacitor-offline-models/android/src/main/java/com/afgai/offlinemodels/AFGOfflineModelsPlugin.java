package com.afgai.offlinemodels;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.File;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import androidx.work.WorkManager;
import androidx.work.WorkInfo;

@CapacitorPlugin(name = "AFGOfflineModels")
public class AFGOfflineModelsPlugin extends Plugin {
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
    private native void nativeResetGeneration();
    private native void nativeUnloadModel();
    private native String nativeGetLastError();

    private JSObject queryDownload(long id) throws Exception {
        if (id <= 0 || id > Integer.MAX_VALUE) throw new Exception("Invalid download ID.");
        JSONObject meta = AFGDownloadStore.get(getContext(), (int) id);
        if (meta == null) throw new Exception("Model download was not found.");
        String status = meta.optString("status", "paused");
        String localPath = meta.optString("localPath", "");
        File part = new File(meta.optString("partPath", ""));
        long downloaded = "installed".equals(status) && new File(localPath).isFile()
            ? new File(localPath).length() : (part.isFile() ? part.length() : meta.optLong("downloadedBytes", 0L));
        JSObject result = new JSObject();
        result.put("id", meta.optString("id", ""));
        result.put("downloadId", id);
        result.put("repoId", meta.optString("repoId", ""));
        result.put("revision", meta.optString("revision", "main"));
        result.put("fileName", meta.optString("fileName", ""));
        result.put("status", status);
        result.put("downloadedBytes", downloaded);
        long expected = meta.optLong("expectedBytes", -1L);
        result.put("expectedBytes", expected > 0 ? expected : null);
        String expectedSha = meta.optString("expectedSha256", "");
        String computedSha = meta.optString("computedSha256", "");
        result.put("expectedSha256", expectedSha.isEmpty() ? null : expectedSha);
        result.put("computedSha256", computedSha.isEmpty() ? null : computedSha);
        result.put("hashVerified", meta.optBoolean("hashVerified", false));
        result.put("localPath", "installed".equals(status) && !localPath.isEmpty() ? localPath : null);
        String error = meta.optString("error", "");
        if (!error.isEmpty()) result.put("error", error);
        return result;
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
        nativeResetGeneration();
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

    @androidx.annotation.Keep
    public void onNativeToken(String token) {
        android.app.Activity activity = getActivity();
        if (activity == null) return;
        activity.runOnUiThread(() -> {
            JSObject event = new JSObject();
            event.put("token", token);
            notifyListeners("generationToken", event);
        });
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
                    fileName.contains("..") || fileName.startsWith("/") || (!expectedSha.isEmpty() && !expectedSha.matches("(?i)[a-f0-9]{64}")) ||
                    expectedBytes == 0 || expectedBytes < -1) {
                call.reject("Invalid GGUF model selection or integrity metadata."); return;
            }
            File directory = new File(getContext().getFilesDir(), "afg-ai-models");
            if (!directory.exists() && !directory.mkdirs()) throw new Exception("Unable to create private model storage.");
            int id = AFGDownloadStore.nextId(getContext());
            String safeName = id + "-" + new File(fileName).getName().replaceAll("[^a-zA-Z0-9._-]", "_");
            File part = new File(directory, safeName + ".part");
            File destination = new File(directory, safeName);
            JSONObject meta = new JSONObject();
            meta.put("downloadId", id);
            meta.put("id", repoId + "/" + fileName);
            meta.put("url", url);
            meta.put("repoId", repoId);
            meta.put("revision", revision);
            meta.put("fileName", fileName);
            meta.put("expectedBytes", expectedBytes);
            meta.put("expectedSha256", expectedSha);
            meta.put("partPath", part.getAbsolutePath());
            meta.put("localPath", destination.getAbsolutePath());
            meta.put("downloadedBytes", 0L);
            meta.put("status", "queued");
            meta.put("createdAt", System.currentTimeMillis());
            meta.put("updatedAt", System.currentTimeMillis());
            AFGDownloadStore.put(getContext(), id, meta);
            Intent intent = new Intent(getContext(), AFGModelDownloadService.class);
            intent.setAction(AFGModelDownloadService.ACTION_ENQUEUE);
            intent.putExtra(AFGModelDownloadService.EXTRA_DOWNLOAD_ID, id);
            if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(intent);
            else getContext().startService(intent);
            JSObject result = new JSObject();
            result.put("downloadId", id);
            result.put("id", repoId + "/" + fileName);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to start the resumable Android model download.", error);
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
            for (JSONObject meta : AFGDownloadStore.all(getContext())) {
                int id = meta.optInt("downloadId", -1);
                if (id > 0) downloads.put(queryDownload(id));
            }
            JSObject result = new JSObject();
            result.put("downloads", downloads);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to list Android model downloads.", error);
        }
    }

    @PluginMethod
    public void pauseDownload(PluginCall call) {
        Long rawId = call.getLong("downloadId");
        if (rawId == null || rawId <= 0 || rawId > Integer.MAX_VALUE) { call.reject("A valid download ID is required."); return; }
        int id = rawId.intValue();
        JSONObject meta = AFGDownloadStore.get(getContext(), id);
        if (meta == null) { call.reject("Model download was not found."); return; }
        new Thread(() -> {
            try {
                WorkManager manager = WorkManager.getInstance(getContext());
                String workName = AFGModelDownloadService.workName(id);
                manager.cancelUniqueWork(workName).getResult().get(10, java.util.concurrent.TimeUnit.SECONDS);
                long deadline = System.currentTimeMillis() + 8000L;
                while (System.currentTimeMillis() < deadline) {
                    java.util.List<WorkInfo> infos = manager.getWorkInfosForUniqueWork(workName).get(2, java.util.concurrent.TimeUnit.SECONDS);
                    boolean stopped = infos.isEmpty();
                    for (WorkInfo info : infos) {
                        WorkInfo.State state = info.getState();
                        if (state != WorkInfo.State.CANCELLED && state != WorkInfo.State.SUCCEEDED && state != WorkInfo.State.FAILED) stopped = false;
                    }
                    if (stopped) break;
                    Thread.sleep(50L);
                }
                File part = new File(meta.optString("partPath", ""));
                long bytes = part.isFile() ? part.length() : 0L;
                AFGDownloadStore.update(getContext(), id, "status", "paused");
                AFGDownloadStore.update(getContext(), id, "downloadedBytes", bytes);
                JSObject result = new JSObject();
                result.put("paused", true);
                result.put("downloadedBytes", bytes);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Unable to pause the model download safely.", error);
            }
        }, "afg-download-pause").start();
    }

    @PluginMethod
    public void resumeDownload(PluginCall call) {
        Long rawId = call.getLong("downloadId");
        if (rawId == null || rawId <= 0 || rawId > Integer.MAX_VALUE) { call.reject("A valid download ID is required."); return; }
        int id = rawId.intValue();
        JSONObject meta = AFGDownloadStore.get(getContext(), id);
        if (meta == null) { call.reject("Model download was not found."); return; }
        if ("installed".equals(meta.optString("status", ""))) { call.reject("This model is already installed."); return; }
        AFGDownloadStore.update(getContext(), id, "status", "queued");
        AFGDownloadStore.update(getContext(), id, "error", "");
        AFGModelDownloadService.enqueue(getContext(), id);
        JSObject result = new JSObject();
        result.put("resumed", true);
        call.resolve(result);
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
            Long rawId = call.getLong("downloadId");
            if (rawId == null || rawId <= 0 || rawId > Integer.MAX_VALUE) { call.reject("A valid download ID is required."); return; }
            int id = rawId.intValue();
            JSONObject meta = AFGDownloadStore.get(getContext(), id);
            WorkManager.getInstance(getContext()).cancelUniqueWork(AFGModelDownloadService.workName(id));
            if (deleteFile && meta != null) {
                String partPath = meta.optString("partPath", "");
                String finalPath = meta.optString("localPath", "");
                if (!partPath.isEmpty()) new File(partPath).delete();
                if (!finalPath.isEmpty()) new File(finalPath).delete();
            }
            AFGDownloadStore.remove(getContext(), id);
            JSObject result = new JSObject();
            result.put("removed", true);
            result.put("deleted", deleteFile);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to remove the Android model file.", error);
        }
    }
}