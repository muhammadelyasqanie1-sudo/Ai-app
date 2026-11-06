package com.afgai.jarvis;

import android.Manifest;
import android.content.Intent;
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
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Locale;

@CapacitorPlugin(
    name = "AFGJarvis",
    permissions = { @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }) }
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
        if (!Arrays.asList("en-US","fa-IR","ps-AF","ar").contains(language)) language = "en-US";
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
        Locale locale = "fa-IR".equals(language) ? new Locale("fa", "IR") : "ps-AF".equals(language) ? new Locale("ps", "AF") : "ar".equals(language) ? new Locale("ar") : Locale.US;
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

    @Override protected void handleOnDestroy() {
        if (speechRecognizer != null) { speechRecognizer.destroy(); speechRecognizer = null; }
        if (textToSpeech != null) { textToSpeech.stop(); textToSpeech.shutdown(); textToSpeech = null; }
        super.handleOnDestroy();
    }
}
