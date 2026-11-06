# AFG AI JARVIS — Android device controls

## What is implemented

The optional `@afg-ai/capacitor-jarvis` Capacitor plugin adds an Android-only, user-consented control bridge:

- Read whether the AFG AI Accessibility Service is enabled and connected.
- Open Android's Accessibility settings so the device owner can enable the service.
- Launch an installed Android app by package name.
- Perform explicit Back, Home, Notifications, Quick Settings and scroll actions.
- Click a visible control by its displayed text.
- Insert user-provided text into the currently focused editable field.
- Capture speech through Android SpeechRecognizer, request offline recognition preference, emit live transcript events, and speak text through the installed Android TextToSpeech engine.
- Parse a small, deterministic, multilingual command allowlist locally on the device (English, Afghan Dari (`fa-AF`), Persian (`fa-IR`), Pashto and Arabic) for app launching and navigation, with a separate confirmation before each action. The parser does not call an AI model or send transcripts to a server.

The React screen is available from the navigation drawer as **JARVIS device assistant**. It reports unsupported browser use instead of simulating device actions.

## Supported on-device command behavior

The offline parser is an exact-phrase allowlist, not a general conversational model. It recognizes supported app-launch, navigation and device-tool phrases in English, Afghan Dari, Persian, Pashto and Arabic. It accepts a small set of polite prefixes and common Dari/Pashto variants. Unknown or ambiguous phrases return `unknown` and are never executed. Sensitive actions (location, contacts, SMS, camera, flashlight and navigation) still require an explicit confirmation in the app and the relevant Android permission.

The native toolkit is pull-based: it does not run background scans or continuously monitor the phone. Cached location is not live GPS; the result includes the actual Android provider and timestamp. Contact and SMS reads are capped by the native API, and camera previews are resized before being returned to the WebView. JARVIS checks native action results rather than showing a success message when Android reports that an action could not be completed.

## Android setup

1. Install/update the AFG AI Android APK built from this branch.
2. Open **JARVIS device assistant**.
3. Tap **Open Accessibility settings**.
4. In Android settings, enable **AFG AI Jarvis device controls** after reviewing the system disclosure.
5. Return to AFG AI and refresh the permission status.

No root permission is required. The service uses Android's official AccessibilityService APIs. It only receives window/focus callbacks and does not persist, log, or upload screen contents. Actions are invoked only after a direct user interaction in the app; click and text-entry actions show an additional confirmation.

## Voice setup and offline limitations

When the app language is Dari, JARVIS requests the Afghan Dari locale `fa-AF`; Persian uses `fa-IR`. The recognition and TTS engines must actually provide those locale voices/language packs. If `fa-AF` is not supported by the installed Android speech provider, Dari voice recognition may fail or fall back according to that provider; the app does not claim guaranteed Dari recognition. The JARVIS screen requests microphone permission at the moment the user taps Start listening. Android speech recognition receives `EXTRA_PREFER_OFFLINE=true`; this is only a preference. The installed recognition provider can ignore it or require network access, so offline recognition is not guaranteed. Afghan Dari (`fa-AF`) availability is device/provider-dependent. Install offline language packs in Android voice-input settings and test with connectivity disabled before relying on offline use. Text-to-speech uses the installed Android TTS engine and selected voice data; voice data may need to be installed separately. Speech result events are kept in app memory for the current screen and are not sent to AFG AI servers by this plugin. The allowlisted voice commands (app launch, Back, Home, Notifications, Quick Settings and scrolling) are parsed locally by `src/lib/jarvis-command-engine.ts` and require a separate confirmation. Phrase matching is deterministic, not a generative local LLM; unknown phrases are never executed.


## Local device toolkit

The Android bridge now exposes additional explicit, pull-based tools:

- Battery percentage, charging state and temperature.
- Vibration with a bounded 50–2,000 ms duration.
- Camera flash/torch control after runtime camera permission.
- Network transport and validated-connectivity state. SSID, BSSID and IP are intentionally not collected.
- Last-known GPS/network location after runtime location permission. This is a cached location read, not continuous/live tracking.
- Up to 20 contacts after runtime contacts permission.
- Up to five recent SMS messages after runtime SMS permission. This permission is sensitive and may make the app ineligible for Google Play distribution unless it qualifies under Google's SMS/Call Log policy.
- Explicitly invoked clipboard read/write (up to 4,000 characters). Clipboard reads may be restricted by Android while the app is in the background; this plugin reads only after a foreground user action.
- Camera capture through the Android camera app. The user must frame and press the shutter; AFG AI receives only the returned preview bitmap.
- Phone dialer and SMS composer intents. The user must press Call or Send in the system app; the plugin never places a call or sends an SMS directly.
- A list of available sensor names/types and whether fingerprint hardware is advertised by Android. Fingerprint templates and sensor-private biometric data are never accessible to this app; no fingerprint bypass or raw sensor capture is implemented.

The JARVIS screen offers direct controls and the local command parser recognizes a small allowlist of English, Afghan Dari, Persian, Pashto and Arabic phrases for battery, network, sensors, vibration, torch, location, contacts, recent SMS and camera. Each parsed device action requires a confirmation dialog. Location, contacts, SMS and camera-related permissions are requested only when the user invokes the relevant feature. Results remain in the current screen's memory and are not uploaded by this plugin.

### Generative offline model status

JARVIS currently has a small deterministic offline command parser only. It does not contain a general-purpose local LLM, Needle weights, a Cactus native runtime, or fully offline speech recognition. The official Cactus Android guide describes an Android native integration that needs an ARM64 `libcactus.so` engine and Kotlin bindings; those native artifacts are not currently packaged in this repository. Do not enable a model-download or AI-agent control button until the engine/model versions, checksums, licensing, memory footprint and Android 10 runtime have been verified on-device. See the [official Cactus Android integration guide](https://docs.cactuscompute.com/v1.12/android/).

### Offline model boundary

The current command parser is deterministic phrase matching and works offline; it is not Needle. The upstream Cactus project now hosts Needle 3 and the legacy 14 MB Needle 2 runtime separately. A production Android integration must bundle or provision a verified Android ABI engine and model asset, verify its Apache-2.0 licensing/redistribution terms and memory use on the target phone, and expose only the same permission-gated tools through a constrained function-call schema. This PR does not claim that a generative Needle model is bundled or that Telegram remote control works without internet.

## Local GGUF command understanding

JARVIS can reuse a GGUF file that the user has already downloaded in the **Offline AI Hub**:

1. In Offline AI Hub, choose a GGUF model that fits the phone and wait until the download is complete.
2. The JARVIS panel lists only installed models whose SHA-256 digest was supplied and successfully verified.
3. Load the selected model. JARVIS uses a conservative 1,024-token context and two CPU threads, then translates a Dari/Pashto/English request into one exact command from the existing allowlist.
4. The deterministic command parser validates the proposed command. The user must review and confirm it before any Android action runs. Unknown, malformed or unsupported model output is rejected.

The existing Capacitor offline-model plugin builds a CPU llama.cpp JNI runtime for Android **arm64-v8a**. The Android offline build workflow installs the configured Android NDK/CMake toolchain and builds the native library from its pinned llama.cpp source revision. No separate runtime dependency or provider key is required. The model weights remain a separate user-selected download and are not included in the APK.

This is a constrained intent router, not unrestricted autonomous phone control and not a general JARVIS conversation model. Inference runs locally after the model is loaded. Model loading and speed depend on free RAM, model architecture and quantization; low-memory phones may fail to load larger models. Only one native GGUF model can be loaded by this shared plugin at a time.

Needle 3 is **not** installed by this integration. Its `.cact` weights and Cactus engine are separate from llama.cpp/GGUF and require a distinct Android native runtime package.

## Security and platform boundaries

- This is a guided control bridge, not an autonomous agent. It does not independently decide what to click or type.
- It does not auto-like posts, subscribe, send messages, make purchases, install packages, unlock the device, or bypass app security.
- Some apps expose incomplete accessibility trees, so text-based clicks and focused-field typing may not work everywhere.
- Android and individual apps can block or constrain automation. The service cannot grant itself accessibility permission.
- The app requests microphone, camera (torch only), location, contacts and SMS permissions only when the user invokes the related feature. It does not request overlay, notification-listener or device-admin privileges.
- Fully offline speech-to-text is not implemented: Android SpeechRecognizer may still require network access. The local command parser includes Afghan Dari wording (including common `را`/`ره` command forms) and works offline only after speech has been transcribed; it is not a replacement speech model.
- JARVIS can optionally use the existing Android llama.cpp runtime with a locally downloaded, SHA-256-verified GGUF model for constrained multilingual command understanding. It does not bundle model weights or download them automatically. Needle 3/Cactus uses a different `.cact` format/runtime and is not integrated. A persistent floating bubble, hand-gesture recognition, flight radar, and anti-theft/lockout features are not implemented.
- The Android app must be rebuilt for the native plugin to be packaged. A web-only deployment cannot control the phone.
- Google Play distribution of accessibility-based automation is subject to Play policy and review; sideloading does not remove Android's own permission and security boundaries.

## API surface

The native bridge exports `getStatus()`, `getBatteryStatus()`, `vibrate()`, `requestCameraPermission()`, `setTorch()`, `getNetworkStatus()`, `requestLocationPermission()`, `getLocation()`, `requestContactsPermission()`, `getContacts()`, `requestSmsReadPermission()`, `getRecentSms()`, `setClipboard()`, `getClipboard()`, `openSmsComposer()`, `openDialer()`, `takePhoto()`, `getSensors()`, `openAccessibilitySettings()`, `openApp()`, `performAction()`, `clickText()`, `typeText()`, microphone permission and speech methods, and the `speechEvent` listener. It is registered through the local Capacitor package in `package.json`.

## Troubleshooting

| Symptom | What to check |
|---|---|
| JARVIS says Android app required | Open the installed Capacitor Android APK, not the website in Chrome. |
| Back/Home/scroll does nothing | Open Accessibility settings, enable AFG AI Jarvis device controls, return to JARVIS and refresh status. Some apps do not expose scrollable/clickable accessibility nodes. |
| Voice button is disabled | Confirm that Android has a speech recognition service installed and that microphone permission is granted. |
| Voice recognition fails offline | Install the language's offline speech pack in Android voice-input settings. The Android recognizer can still require internet; the offline preference is not a guarantee. |
| Dari/Pashto speech is unavailable | The installed recognizer must support the requested locale. JARVIS cannot install system voice packs itself. |
| Text-to-speech is unavailable | Install the required voice data in Android Text-to-Speech settings, then reopen JARVIS. |
| Location says no cached location | Turn on location services and use a map/location app first; this API reads last-known location only and does not request a live fix. |
| Flashlight fails | Check that the phone has a rear flash, grant camera permission and close any app currently using the camera. |
| SMS or contacts access is denied | Check Android app permissions. READ_SMS is subject to Google Play policy and may be unavailable to distributed builds. |
| An app cannot be opened | Confirm that it is installed and has a launcher activity; Android package visibility and OEM restrictions can affect discovery. |

The deterministic parser regression suite is available as `npm run test:jarvis-command`; it covers app launch, Afghan Dari/Pashto phrases, device commands, polite prefixes, unknown-command rejection and input-length bounds.

## Verification status

Source files and manifest wiring were inspected. Per repository policy, no tests, type-check, lint, Android sync, build, APK workflow, or deployment was run. Native runtime behavior, camera result handling, permission behavior across Android vendors, and Google Play eligibility still require device verification. Install dependencies and run Capacitor Android sync/build only after the project owner authorizes those operations.


The local device toolkit does not require root access. Android runtime permissions are requested only when the user invokes the corresponding feature; the operating system remains responsible for granting or denying each permission.
