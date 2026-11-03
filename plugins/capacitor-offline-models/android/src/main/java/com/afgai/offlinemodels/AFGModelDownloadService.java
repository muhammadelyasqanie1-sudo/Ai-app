package com.afgai.offlinemodels;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

/** Foreground entry point that hands durable transfer ownership to WorkManager. */
public final class AFGModelDownloadService extends Service {
    public static final String ACTION_ENQUEUE = "com.afgai.offlinemodels.ENQUEUE";
    public static final String EXTRA_DOWNLOAD_ID = "downloadId";
    private static final String CHANNEL = "afg-ai-model-download-service";
    private static final int NOTIFICATION_ID = 7280;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(NOTIFICATION_ID, notification());
        if (intent != null && ACTION_ENQUEUE.equals(intent.getAction())) {
            int id = intent.getIntExtra(EXTRA_DOWNLOAD_ID, -1);
            if (id > 0) enqueue(this, id);
        }
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf(startId);
        return START_NOT_STICKY;
    }

    public static void enqueue(Context context, int downloadId) {
        Data input = new Data.Builder().putInt(EXTRA_DOWNLOAD_ID, downloadId).build();
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(AFGDownloadWorker.class)
            .setInputData(input)
            .setBackoffCriteria(androidx.work.BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
            .addTag("afg-model-download-" + downloadId)
            .build();
        WorkManager.getInstance(context).enqueueUniqueWork(workName(downloadId), ExistingWorkPolicy.REPLACE, request);
    }

    public static String workName(int downloadId) {
        return "afg-model-download-" + downloadId;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager.getNotificationChannel(CHANNEL) == null) {
                manager.createNotificationChannel(new NotificationChannel(CHANNEL, "AFG AI download service", NotificationManager.IMPORTANCE_LOW));
            }
        }
    }

    private Notification notification() {
        return new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle("AFG AI")
            .setContentText("Preparing model download")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
