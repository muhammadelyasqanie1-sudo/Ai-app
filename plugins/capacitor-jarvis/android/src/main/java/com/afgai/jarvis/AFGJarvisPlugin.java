package com.afgai.jarvis;

import android.Manifest;
import android.content.Intent;
import android.app.Activity;
import android.content.ContentResolver;
import android.database.Cursor;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.location.Location;
import android.location.LocationManager;
import android.hardware.Sensor;
import android.hardware.SensorManager;
import android.hardware.camera2.CameraManager;
import android.os.BatteryManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.net.Uri;
import android.provider.ContactsContract;
import android.provider.Telephony;
import android.util.Base64;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import java.io.ByteArrayOutputStream;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.text.TextUtils;

import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;
import com.getcapacitor.ActivityResult;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Locale;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "AFGJarvis",
    permissions = {
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }),
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
        @Permission(alias = "contacts", strings = { Manifest.permission.READ_CONTACTS }),
        @Permission(alias = "smsRead", strings = { Manifest.permission.READ_SMS }),
        @Permission(alias = "camera", strings = { Manifest.permission.CAMERA })
    }
)
public class AFGJarvisPlugin extends Plugin {
    private SpeechRecognizer speechRecognizer;
    private TextToSpeech textToSpeech;
    private boolean ttsReady = false;

    @Override public void load() {
        super.load();
        if (SpeechRecognizer.isRecognitionAvailable(getContext())) {
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
            speechRecognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle params) { emitSpeech("listening", "", ""); }
                @Override public void onBeginningOfSpeech() { emitSpeech("listening", "", ""); }
                @Override public void onRmsChanged(float rmsdB) { }
                @Override public void onBufferReceived(byte[] buffer) { }
                @Override public void onEndOfSpeech() { emitSpeech("processing", "", ""); }
                @Override public void onError(int error) { emitSpeech("error", "", speechError(error)); }
                @Override public void onResults(Bundle results) {
                    ArrayList<String> matches = results == null ? null : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    emitSpeech("result", matches != null && !matches.isEmpty() ? matches.get(0) : "", "");
                }
                @Override public void onPartialResults(Bundle results) {
                    ArrayList<String> matches = results == null ? null : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    if (matches != null && !matches.isEmpty()) emitSpeech("partial", matches.get(0), "");
                }
                @Override public void onEvent(int eventType, Bundle params) { }
            });
        }
        textToSpeech = new TextToSpeech(getContext(), status -> ttsReady = status == TextToSpeech.SUCCESS);
    }

    private String speechError(int code) {
        switch (code) {
            case SpeechRecognizer.ERROR_AUDIO: return "Audio recording error.";
            case SpeechRecognizer.ERROR_CLIENT: return "Speech recognizer client error.";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: return "Microphone permission is required.";
            case SpeechRecognizer.ERROR_NETWORK: return "The speech service requires a network connection.";
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: return "Speech service network timeout.";
            case SpeechRecognizer.ERROR_NO_MATCH: return "No speech was recognized.";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: return "Speech recognizer is busy.";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: return "No speech detected.";
            default: return "Speech recognition failed (code " + code + ").";
        }
    }

    private void emitSpeech(String state, String text, String error) {
        JSObject event = new JSObject();
        event.put("state", state); event.put("text", text); event.put("error", error);
        notifyListeners("speechEvent", event);
    }

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
        result.put("speechRecognizerAvailable", SpeechRecognizer.isRecognitionAvailable(getContext()));
        result.put("microphonePermission", getContext().checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED);
        result.put("offlinePreferenceSupported", true);
        result.put("offlineRecognitionGuaranteed", false);
        result.put("ttsAvailable", textToSpeech != null && ttsReady);
        call.resolve(result);
    }

    @PluginMethod public void requestMicrophonePermission(PluginCall call) {
        if (getContext().checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            JSObject result = new JSObject(); result.put("granted", true); call.resolve(result); return;
        }
        requestPermissionForAlias("microphone", call, "microphonePermissionCallback");
    }

    @PermissionCallback private void microphonePermissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        boolean granted = getContext().checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
        result.put("granted", granted);
        if (granted) call.resolve(result); else call.reject("Microphone permission was not granted.");
    }

    @PluginMethod public void startListening(PluginCall call) {
        if (getContext().checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) { call.reject("Grant microphone permission first."); return; }
        if (speechRecognizer == null) { call.reject("No Android speech recognition service is installed."); return; }
        String language = call.getString("language", "en-US");
        if (!Arrays.asList("en-US","fa-AF","fa-IR","ps-AF","ar").contains(language)) language = "en-US";
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        // Hint only: Android's recognition provider may ignore this and use network services.
        intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
        try { speechRecognizer.startListening(intent); JSObject result = new JSObject(); result.put("started", true); result.put("offlinePreferred", true); call.resolve(result); }
        catch (Exception error) { call.reject("Unable to start speech recognition.", error); }
    }

    @PluginMethod public void stopListening(PluginCall call) {
        if (speechRecognizer != null) speechRecognizer.stopListening();
        JSObject result = new JSObject(); result.put("stopped", true); call.resolve(result);
    }

    @PluginMethod public void speak(PluginCall call) {
        String text = call.getString("text", "");
        String language = call.getString("language", "en-US");
        if (text == null || text.trim().isEmpty() || text.length() > 3000) { call.reject("Speech text must be 1 to 3,000 characters."); return; }
        if (textToSpeech == null || !ttsReady) { call.reject("Android text-to-speech engine is not ready."); return; }
        Locale locale = "fa-AF".equals(language) ? new Locale("fa", "AF") : "fa-IR".equals(language) ? new Locale("fa", "IR") : "ps-AF".equals(language) ? new Locale("ps", "AF") : "ar".equals(language) ? new Locale("ar") : Locale.US;
        int availability = textToSpeech.setLanguage(locale);
        if (availability == TextToSpeech.LANG_MISSING_DATA || availability == TextToSpeech.LANG_NOT_SUPPORTED) { call.reject("The selected voice is not installed on this device."); return; }
        int resultCode = textToSpeech.speak(text, TextToSpeech.QUEUE_FLUSH, null, "afg-jarvis-utterance");
        if (resultCode == TextToSpeech.ERROR) { call.reject("Android text-to-speech failed."); return; }
        JSObject result = new JSObject(); result.put("started", true); call.resolve(result);
    }

    @PluginMethod public void openAccessibilitySettings(PluginCall call) {
        try { Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS); intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); getContext().startActivity(intent); JSObject result = new JSObject(); result.put("opened", true); call.resolve(result); }
        catch (Exception error) { call.reject("Unable to open Android Accessibility settings.", error); }
    }

    @PluginMethod public void openApp(PluginCall call) {
        String packageName = call.getString("packageName", "");
        if (packageName == null || !packageName.matches("[A-Za-z0-9_]+(\\.[A-Za-z0-9_]+)+")) { call.reject("A valid Android package name is required."); return; }
        try { PackageManager manager = getContext().getPackageManager(); Intent launch = manager.getLaunchIntentForPackage(packageName); if (launch == null) { call.reject("That app is not installed or cannot be launched."); return; } launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); getContext().startActivity(launch); JSObject result = new JSObject(); result.put("opened", true); call.resolve(result); }
        catch (Exception error) { call.reject("Unable to open the selected app.", error); }
    }

    @PluginMethod public void performAction(PluginCall call) {
        String action = call.getString("action", "");
        if (!Arrays.asList("back","home","notifications","quickSettings","scrollForward","scrollBackward").contains(action)) { call.reject("Unsupported device action."); return; }
        if (!isAccessibilityEnabled() || !AFGJarvisAccessibilityService.isConnected()) { call.reject("Enable the AFG AI Jarvis accessibility service first."); return; }
        boolean performed = AFGJarvisAccessibilityService.perform(action); JSObject result = new JSObject(); result.put("performed", performed); call.resolve(result);
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


    // Device tools below are deliberately pull-based: they run only after a direct app action.
    @PluginMethod public void getBatteryStatus(PluginCall call) {
        Intent battery = getContext().registerReceiver(null, new android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (battery == null) { call.reject("Battery status is unavailable."); return; }
        int level = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int scale = battery.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
        int status = battery.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
        int temp = battery.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1);
        JSObject out = new JSObject();
        out.put("levelPercent", level >= 0 && scale > 0 ? Math.round(level * 100f / scale) : -1);
        out.put("charging", status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL);
        out.put("temperatureC", temp >= 0 ? temp / 10.0 : JSONObject.NULL);
        call.resolve(out);
    }

    @PluginMethod public void vibrate(PluginCall call) {
        int duration = call.getInt("durationMs", 300);
        if (duration < 50 || duration > 2000) { call.reject("Vibration duration must be 50 to 2,000 ms."); return; }
        Vibrator vibrator = (Vibrator) getContext().getSystemService(android.content.Context.VIBRATOR_SERVICE);
        if (vibrator == null || !vibrator.hasVibrator()) { call.reject("This device has no vibrator."); return; }
        if (Build.VERSION.SDK_INT >= 26) vibrator.vibrate(VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE));
        else vibrator.vibrate(duration);
        JSObject out = new JSObject(); out.put("performed", true); out.put("durationMs", duration); call.resolve(out);
    }


    @PluginMethod public void requestCameraPermission(PluginCall call) {
        if (getContext().checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            JSObject out = new JSObject(); out.put("granted", true); call.resolve(out); return;
        }
        requestPermissionForAlias("camera", call, "cameraPermissionCallback");
    }
    @PermissionCallback private void cameraPermissionCallback(PluginCall call) {
        if (getContext().checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) { call.reject("Camera permission was not granted."); return; }
        JSObject out = new JSObject(); out.put("granted", true); call.resolve(out);
    }

    @PluginMethod public void setTorch(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        if (getContext().checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) { call.reject("Camera permission is required. Grant it in Android app settings, then retry."); return; }
        try {
            CameraManager manager = (CameraManager) getContext().getSystemService(android.content.Context.CAMERA_SERVICE);
            for (String id : manager.getCameraIdList()) {
                android.hardware.camera2.CameraCharacteristics c = manager.getCameraCharacteristics(id);
                Boolean flash = c.get(android.hardware.camera2.CameraCharacteristics.FLASH_INFO_AVAILABLE);
                Integer facing = c.get(android.hardware.camera2.CameraCharacteristics.LENS_FACING);
                if (Boolean.TRUE.equals(flash) && (facing == null || facing == android.hardware.camera2.CameraCharacteristics.LENS_FACING_BACK)) {
                    manager.setTorchMode(id, enabled);
                    JSObject out = new JSObject(); out.put("enabled", enabled); call.resolve(out); return;
                }
            }
            call.reject("No rear camera flash is available.");
        } catch (Exception e) { call.reject("Unable to change flashlight state.", e); }
    }

    @PluginMethod public void getNetworkStatus(PluginCall call) {
        ConnectivityManager manager = (ConnectivityManager) getContext().getSystemService(android.content.Context.CONNECTIVITY_SERVICE);
        Network network = manager == null ? null : manager.getActiveNetwork();
        NetworkCapabilities caps = network == null ? null : manager.getNetworkCapabilities(network);
        String transport = "none";
        if (caps != null) {
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) transport = "wifi";
            else if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) transport = "cellular";
            else if (caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) transport = "ethernet";
            else if (caps.hasTransport(NetworkCapabilities.TRANSPORT_BLUETOOTH)) transport = "bluetooth";
            else transport = "other";
        }
        JSObject out = new JSObject(); out.put("connected", caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET));
        out.put("validated", caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED));
        out.put("transport", transport); call.resolve(out);
    }

    @PluginMethod public void requestLocationPermission(PluginCall call) {
        if (getContext().checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            getContext().checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            JSObject out = new JSObject(); out.put("granted", true); call.resolve(out); return;
        }
        requestPermissionForAlias("location", call, "locationPermissionCallback");
    }
    @PermissionCallback private void locationPermissionCallback(PluginCall call) {
        boolean granted = getContext().checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            getContext().checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (!granted) { call.reject("Location permission was not granted."); return; }
        JSObject out = new JSObject(); out.put("granted", true); call.resolve(out);
    }

    @PluginMethod public void getLocation(PluginCall call) {
        boolean fine = getContext().checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean coarse = getContext().checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (!fine && !coarse) { call.reject("Request location permission first."); return; }
        try {
            LocationManager manager = (LocationManager) getContext().getSystemService(android.content.Context.LOCATION_SERVICE);
            Location best = null;
            for (String provider : manager.getProviders(true)) {
                if (!LocationManager.GPS_PROVIDER.equals(provider) && !LocationManager.NETWORK_PROVIDER.equals(provider) && !LocationManager.PASSIVE_PROVIDER.equals(provider)) continue;
                Location candidate = manager.getLastKnownLocation(provider);
                if (candidate != null && (best == null || candidate.getTime() > best.getTime())) best = candidate;
            }
            if (best == null) { call.reject("No cached location is available. Enable GPS and try again."); return; }
            JSObject out = new JSObject(); out.put("latitude", best.getLatitude()); out.put("longitude", best.getLongitude());
            out.put("accuracyMeters", best.hasAccuracy() ? best.getAccuracy() : JSONObject.NULL); out.put("timestamp", best.getTime());
            out.put("source", fine ? "fine" : "coarse"); call.resolve(out);
        } catch (SecurityException e) { call.reject("Android denied location access.", e); }
        catch (Exception e) { call.reject("Unable to read cached location.", e); }
    }

    @PluginMethod public void requestContactsPermission(PluginCall call) {
        if (getContext().checkSelfPermission(Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED) {
            JSObject out = new JSObject(); out.put("granted", true); call.resolve(out); return;
        }
        requestPermissionForAlias("contacts", call, "contactsPermissionCallback");
    }
    @PermissionCallback private void contactsPermissionCallback(PluginCall call) {
        if (getContext().checkSelfPermission(Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) { call.reject("Contacts permission was not granted."); return; }
        JSObject out = new JSObject(); out.put("granted", true); call.resolve(out);
    }
    @PluginMethod public void getContacts(PluginCall call) {
        if (getContext().checkSelfPermission(Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) { call.reject("Request contacts permission first."); return; }
        int limit = Math.max(1, Math.min(call.getInt("limit", 20), 50));
        JSArray rows = new JSArray();
        try (Cursor cursor = getContext().getContentResolver().query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            new String[]{ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER},
            null, null, ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC")) {
            if (cursor != null) {
                int nameCol = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
                int numberCol = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);
                while (cursor.moveToNext() && rows.length() < limit) {
                    JSObject item = new JSObject(); item.put("name", cursor.getString(nameCol)); item.put("phone", cursor.getString(numberCol)); rows.put(item);
                }
            }
            JSObject out = new JSObject(); out.put("contacts", rows); out.put("count", rows.length()); call.resolve(out);
        } catch (Exception e) { call.reject("Unable to read contacts.", e); }
    }

    @PluginMethod public void requestSmsReadPermission(PluginCall call) {
        if (getContext().checkSelfPermission(Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED) {
            JSObject out = new JSObject(); out.put("granted", true); call.resolve(out); return;
        }
        requestPermissionForAlias("smsRead", call, "smsReadPermissionCallback");
    }
    @PermissionCallback private void smsReadPermissionCallback(PluginCall call) {
        if (getContext().checkSelfPermission(Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) { call.reject("SMS permission was not granted."); return; }
        JSObject out = new JSObject(); out.put("granted", true); call.resolve(out);
    }
    @PluginMethod public void getRecentSms(PluginCall call) {
        if (getContext().checkSelfPermission(Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) { call.reject("Request SMS read permission first."); return; }
        int limit = Math.max(1, Math.min(call.getInt("limit", 5), 5));
        JSArray rows = new JSArray();
        try (Cursor cursor = getContext().getContentResolver().query(Telephony.Sms.CONTENT_URI,
            new String[]{Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE, Telephony.Sms.TYPE},
            null, null, Telephony.Sms.DATE + " DESC")) {
            if (cursor != null) {
                int address = cursor.getColumnIndex(Telephony.Sms.ADDRESS), body = cursor.getColumnIndex(Telephony.Sms.BODY);
                int date = cursor.getColumnIndex(Telephony.Sms.DATE), type = cursor.getColumnIndex(Telephony.Sms.TYPE);
                while (cursor.moveToNext() && rows.length() < limit) {
                    JSObject item = new JSObject(); item.put("address", cursor.getString(address));
                    String message = cursor.getString(body); item.put("body", message == null ? "" : message.substring(0, Math.min(message.length(), 500)));
                    item.put("date", cursor.getLong(date)); item.put("type", cursor.getInt(type) == Telephony.Sms.MESSAGE_TYPE_INBOX ? "inbox" : "sent"); rows.put(item);
                }
            }
            JSObject out = new JSObject(); out.put("messages", rows); out.put("count", rows.length()); call.resolve(out);
        } catch (Exception e) { call.reject("Unable to read recent SMS messages.", e); }
    }

    @PluginMethod public void openSmsComposer(PluginCall call) {
        String number = call.getString("number", "").trim(), body = call.getString("body", "");
        if (number.isEmpty() || number.length() > 40 || body.length() > 1000) { call.reject("A phone number and a message up to 1,000 characters are required."); return; }
        try {
            Intent intent = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + Uri.encode(number)));
            intent.putExtra("sms_body", body); intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); getContext().startActivity(intent);
            JSObject out = new JSObject(); out.put("opened", true); call.resolve(out);
        } catch (Exception e) { call.reject("Unable to open the SMS composer.", e); }
    }

    @PluginMethod public void openDialer(PluginCall call) {
        String number = call.getString("number", "").trim();
        if (number.isEmpty() || number.length() > 40 || !number.matches("[+0-9*#(). -]+")) { call.reject("A valid phone number is required."); return; }
        try {
            Intent intent = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(number)));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); getContext().startActivity(intent);
            JSObject out = new JSObject(); out.put("opened", true); call.resolve(out);
        } catch (Exception e) { call.reject("Unable to open the phone dialer.", e); }
    }

    @PluginMethod public void takePhoto(PluginCall call) {
        try {
            Intent intent = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
            if (intent.resolveActivity(getContext().getPackageManager()) == null) { call.reject("No camera app is available."); return; }
            startActivityForResult(call, intent, "cameraCaptureResult");
        } catch (Exception e) { call.reject("Unable to launch the camera.", e); }
    }
    @com.getcapacitor.annotation.ActivityCallback private void cameraCaptureResult(PluginCall call, ActivityResult result) {
        if (result == null || result.getResultCode() != Activity.RESULT_OK || result.getData() == null) { call.reject("Camera capture was cancelled or returned no image."); return; }
        Object raw = result.getData().getExtras() == null ? null : result.getData().getExtras().get("data");
        if (!(raw instanceof Bitmap)) { call.reject("Camera did not return a preview image."); return; }
        Bitmap bitmap = (Bitmap) raw; ByteArrayOutputStream stream = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.JPEG, 82, stream);
        JSObject out = new JSObject(); out.put("mimeType", "image/jpeg");
        out.put("dataBase64", Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP));
        out.put("width", bitmap.getWidth()); out.put("height", bitmap.getHeight()); call.resolve(out);
    }

    @PluginMethod public void getSensors(PluginCall call) {
        SensorManager manager = (SensorManager) getContext().getSystemService(android.content.Context.SENSOR_SERVICE);
        JSArray rows = new JSArray();
        if (manager != null) for (Sensor sensor : manager.getSensorList(Sensor.TYPE_ALL)) {
            JSObject item = new JSObject(); item.put("name", sensor.getName()); item.put("vendor", sensor.getVendor());
            item.put("type", sensor.getType()); item.put("powerMa", sensor.getPower()); item.put("wakeUp", sensor.isWakeUpSensor()); rows.put(item);
        }
        boolean biometric = getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_FINGERPRINT);
        JSObject out = new JSObject(); out.put("sensors", rows); out.put("fingerprintOrBiometricAvailable", biometric);
        out.put("fingerprintDataAccessible", false); call.resolve(out);
    }

    @Override protected void handleOnDestroy() {
        if (speechRecognizer != null) { speechRecognizer.destroy(); speechRecognizer = null; }
        if (textToSpeech != null) { textToSpeech.stop(); textToSpeech.shutdown(); textToSpeech = null; }
        super.handleOnDestroy();
    }
}
