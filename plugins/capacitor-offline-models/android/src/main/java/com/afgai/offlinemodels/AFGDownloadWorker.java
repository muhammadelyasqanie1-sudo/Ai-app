package com.afgai.offlinemodels;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.system.Os;

import androidx.core.app.NotificationCompat;
import androidx.work.Data;
import androidx.work.ForegroundInfo;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.concurrent.TimeUnit;

public final class AFGDownloadWorker extends Worker {
    private static final String CHANNEL = "afg-ai-model-downloads";
    private static final int NOTIFICATION_ID = 7341;
    private final int downloadId;
    private volatile HttpURLConnection activeConnection;

    public AFGDownloadWorker(Context context, WorkerParameters parameters) {
        super(context, parameters);
        downloadId = parameters.getInputData().getInt("downloadId", -1);
    }

    @Override
    public Result doWork() {
        if (downloadId <= 0) return Result.failure();
        JSONObject meta = AFGDownloadStore.get(getApplicationContext(), downloadId);
        if (meta == null) return Result.failure();
        File part = new File(meta.optString("partPath", ""));
        File destination = new File(meta.optString("localPath", ""));
        if (part.getParentFile() == null || destination.getParentFile() == null) return Result.failure();
        HttpURLConnection connection = null;
        try {
            if (!part.getParentFile().exists() && !part.getParentFile().mkdirs()) throw new java.io.IOException("Cannot create model storage directory.");
            if (!destination.getParentFile().exists() && !destination.getParentFile().mkdirs()) throw new java.io.IOException("Cannot create model storage directory.");
            setForegroundAsync(foreground("Downloading " + meta.optString("fileName", "AI model"), 0)).get(10, TimeUnit.SECONDS);
            long offset = part.isFile() ? part.length() : 0L;
            String previousEtag = meta.optString("etag", "");
            if (offset > 0 && previousEtag.isEmpty()) {
                if (!part.delete()) throw new java.io.IOException("Cannot discard an unvalidated partial model file.");
                offset = 0L;
            }
            connection = (HttpURLConnection) new URL(meta.getString("url")).openConnection();
            activeConnection = connection;
            connection.setConnectTimeout(20000);
            connection.setReadTimeout(30000);
            connection.setInstanceFollowRedirects(true);
            connection.setRequestProperty("Accept", "application/octet-stream");
            if (offset > 0) {
                connection.setRequestProperty("Range", "bytes=" + offset + "-");
                if (!previousEtag.isEmpty()) connection.setRequestProperty("If-Range", previousEtag);
            }
            int status = connection.getResponseCode();
            String etag = connection.getHeaderField("ETag");
            if (status == HttpURLConnection.HTTP_REQUESTED_RANGE_NOT_SATISFIABLE) {
                long expected = meta.optLong("expectedBytes", -1L);
                if (expected > 0 && offset == expected) return verifyAndInstall(meta, part, destination);
                part.delete();
                AFGDownloadStore.update(getApplicationContext(), downloadId, "etag", "");
                AFGDownloadStore.update(getApplicationContext(), downloadId, "downloadedBytes", 0L);
                return Result.retry();
            }
            if (status == HttpURLConnection.HTTP_OK && offset > 0) {
                // If-Range failed or the origin ignored Range. Never append a full 200 body.
                // FileOutputStream below opens with append=false because offset is reset to zero.
                offset = 0;
                previousEtag = "";
                AFGDownloadStore.update(getApplicationContext(), downloadId, "etag", "");
                AFGDownloadStore.update(getApplicationContext(), downloadId, "downloadedBytes", 0L);
            } else if (status != HttpURLConnection.HTTP_OK && status != HttpURLConnection.HTTP_PARTIAL) {
                if (status >= 500 || status == 408 || status == 429) return Result.retry();
                AFGDownloadStore.update(getApplicationContext(), downloadId, "status", "error");
                AFGDownloadStore.update(getApplicationContext(), downloadId, "error", "HTTP download failed (" + status + ").");
                return Result.failure();
            }
            if (status == HttpURLConnection.HTTP_PARTIAL) {
                String range = connection.getHeaderField("Content-Range");
                Matcher rangeMatcher = range == null ? null : Pattern.compile("^bytes (\\d+)-(\\d+)/(\\d+|\\*)$").matcher(range);
                boolean validRange = offset > 0 && rangeMatcher != null && rangeMatcher.matches()
                    && Long.parseLong(rangeMatcher.group(1)) == offset
                    && Long.parseLong(rangeMatcher.group(2)) >= offset;
                if (validRange && meta.optLong("expectedBytes", -1L) > 0 && !rangeMatcher.group(3).equals("*")) {
                    validRange = Long.parseLong(rangeMatcher.group(3)) == meta.optLong("expectedBytes", -1L);
                }
                if (!validRange || previousEtag.isEmpty() || etag == null || !previousEtag.equals(etag)) {
                    part.delete();
                    AFGDownloadStore.update(getApplicationContext(), downloadId, "etag", "");
                    AFGDownloadStore.update(getApplicationContext(), downloadId, "downloadedBytes", 0L);
                    AFGDownloadStore.update(getApplicationContext(), downloadId, "status", "paused");
                    return Result.retry();
                }
            }
            if (etag != null && !etag.isEmpty()) AFGDownloadStore.update(getApplicationContext(), downloadId, "etag", etag);
            long total = meta.optLong("expectedBytes", -1L);
            if (total <= 0) {
                long responseLength = connection.getContentLengthLong();
                total = status == HttpURLConnection.HTTP_PARTIAL && responseLength > 0 ? offset + responseLength : responseLength;
            }
            AFGDownloadStore.update(getApplicationContext(), downloadId, "status", "downloading");
            AFGDownloadStore.update(getApplicationContext(), downloadId, "downloadedBytes", offset);
            try (InputStream input = connection.getInputStream();
                 FileOutputStream output = new FileOutputStream(part, offset > 0)) {
                byte[] buffer = new byte[1024 * 1024];
                long downloaded = offset;
                int read;
                while ((read = input.read(buffer)) != -1) {
                    if (isStopped()) {
                        output.getFD().sync();
                        AFGDownloadStore.update(getApplicationContext(), downloadId, "status", "paused");
                        AFGDownloadStore.update(getApplicationContext(), downloadId, "downloadedBytes", downloaded);
                        return Result.failure();
                    }
                    output.write(buffer, 0, read);
                    downloaded += read;
                    AFGDownloadStore.update(getApplicationContext(), downloadId, "downloadedBytes", downloaded);
                    setProgressAsync(new Data.Builder().putLong("downloadedBytes", downloaded).putLong("totalBytes", total).build());
                    setForegroundAsync(foreground("Downloading " + meta.optString("fileName", "AI model"), total > 0 ? (int) Math.min(100, downloaded * 100 / total) : 0));
                }
                output.getFD().sync();
            }
            if (total > 0 && part.length() != total) {
                AFGDownloadStore.update(getApplicationContext(), downloadId, "status", "paused");
                AFGDownloadStore.update(getApplicationContext(), downloadId, "downloadedBytes", part.length());
                return Result.retry();
            }
            return verifyAndInstall(meta, part, destination);
        } catch (Exception error) {
            if (isStopped()) {
                syncPartialFile(part);
                AFGDownloadStore.update(getApplicationContext(), downloadId, "status", "paused");
                return Result.failure();
            }
            AFGDownloadStore.update(getApplicationContext(), downloadId, "status", "paused");
            AFGDownloadStore.update(getApplicationContext(), downloadId, "error", "Network interrupted; the partial file is retained for resume.");
            return Result.retry();
        } finally {
            if (connection != null) connection.disconnect();
            activeConnection = null;
        }
    }

    @Override
    public void onStopped() {
        HttpURLConnection connection = activeConnection;
        if (connection != null) connection.disconnect();
        super.onStopped();
    }

    private Result verifyAndInstall(JSONObject meta, File part, File destination) throws Exception {
        if (!part.isFile() || part.length() <= 0) return Result.failure();
        String computed = sha256(part);
        String expected = meta.optString("expectedSha256", "");
        if (!expected.isEmpty() && !expected.equalsIgnoreCase(computed)) {
            part.delete();
            AFGDownloadStore.update(getApplicationContext(), downloadId, "status", "error");
            AFGDownloadStore.update(getApplicationContext(), downloadId, "error", "SHA-256 verification failed; partial model removed.");
            return Result.failure();
        }
        // Both paths are inside the same app-private directory; POSIX rename is atomic.
        Os.rename(part.getAbsolutePath(), destination.getAbsolutePath());
        AFGDownloadStore.update(getApplicationContext(), downloadId, "computedSha256", computed);
        AFGDownloadStore.update(getApplicationContext(), downloadId, "hashVerified", !expected.isEmpty());
        AFGDownloadStore.update(getApplicationContext(), downloadId, "downloadedBytes", destination.length());
        AFGDownloadStore.update(getApplicationContext(), downloadId, "status", "installed");
        AFGDownloadStore.update(getApplicationContext(), downloadId, "error", "");
        setForegroundAsync(foreground("Model download complete", 100));
        return Result.success(new Data.Builder().putString("localPath", destination.getAbsolutePath()).putString("sha256", computed).build());
    }

    private void syncPartialFile(File file) {
        try (java.io.RandomAccessFile handle = new java.io.RandomAccessFile(file, "rw")) {
            handle.getFD().sync();
        } catch (Exception ignored) { }
    }

    private String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[1024 * 1024];
        try (FileInputStream input = new FileInputStream(file)) {
            int read;
            while ((read = input.read(buffer)) != -1) digest.update(buffer, 0, read);
        }
        StringBuilder value = new StringBuilder();
        for (byte item : digest.digest()) value.append(String.format(Locale.ROOT, "%02x", item & 0xff));
        return value.toString();
    }

    private ForegroundInfo foreground(String title, int progress) {
        Context context = getApplicationContext();
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && manager.getNotificationChannel(CHANNEL) == null) {
            manager.createNotificationChannel(new NotificationChannel(CHANNEL, "AFG AI model downloads", NotificationManager.IMPORTANCE_LOW));
        }
        Notification notification = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(context.getApplicationInfo().icon)
            .setContentTitle(title)
            .setContentText(progress > 0 ? progress + "% complete" : "Preparing secure model download")
            .setProgress(100, progress, progress == 0)
            .setOngoing(progress < 100)
            .setOnlyAlertOnce(true)
            .build();
        if (Build.VERSION.SDK_INT >= 29) return new ForegroundInfo(NOTIFICATION_ID + downloadId, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        return new ForegroundInfo(NOTIFICATION_ID + downloadId, notification);
    }
}
