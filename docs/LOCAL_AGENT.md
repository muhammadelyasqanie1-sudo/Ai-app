# AFG AI Local Agent — implementation status

## Default behavior

AFG AI now follows a local-first chat policy on the native Android app:

1. Check whether the Android llama.cpp runtime is present.
2. Find an installed GGUF model whose download integrity check succeeded.
3. Load that model from AFG AI's private app-specific storage and generate the response on-device.
4. If no verified local model is ready, preserve the existing configured cloud chat path.
5. If the device is offline and no local model can answer, show an explicit setup hint rather than pretending that a response was generated.

The web app does not attempt to use the Android native runtime. Existing online provider selection, image generation routing, conversation persistence and cloud model configuration remain in place.

## Runtime and model requirements

- Android native app packaged with Capacitor.
- arm64-v8a ABI. The current offline-model plugin is configured for arm64-v8a only.
- A GGUF model downloaded through the Offline AI Hub and verified against trusted repository SHA-256 metadata.
- The llama.cpp native library must be present in the APK. Runtime availability is checked at run time.
- The selected model must fit the phone's available memory. A successful download does not guarantee that the model can be loaded.
- The current inference bridge uses a bounded 2,048-token context, up to four CPU threads and a maximum of 256 generated tokens from the chat coordinator.

The 14 MB Needle model mentioned in the referenced video is not wired into this runtime. The current native bridge is llama.cpp/GGUF; do not claim Needle compatibility without its own supported runtime, license review and device validation.

## Privacy

When local inference succeeds, the conversation prompt is passed to the native model bridge and is not sent to the AFG AI cloud chat endpoint. Local chat text is not uploaded by this coordinator. Existing account conversation persistence remains a separate behavior when the user is signed in; the app's existing persistence flow may store messages on the configured server. Local inference therefore does not by itself mean that every part of the application is network-silent.

## Device-control boundary

The Android plugin now exposes a small allowlisted tool set:
- Read battery percentage, charging state and temperature.
- Trigger a short vibration.
- Open YouTube, Maps, Chrome, Android Settings or the camera app.
- Open the system dialer with a requested number; the user must tap Call.
- Open the system SMS composer with a recipient and draft; the user must tap Send.

The chat coordinator routes explicit, deterministic device commands to these tools before local text generation. The model cannot execute arbitrary shell commands or choose arbitrary Android packages. Calls and SMS are never placed or sent silently.

Not implemented: reading the SMS inbox, contacts or call history; capturing and returning a photo; GPS/location; fingerprint hardware; arbitrary sensor access; smart-home controls; background Telegram control. These require separate native integrations, runtime permissions, platform-policy review and additional consent flows. Do not claim these capabilities are available.

## Verification status

Source changes were made on a feature branch. Tests, lint, Android builds, APK packaging, model downloads, runtime smoke tests, offline network-isolation tests and deployments were not run. The implementation must be validated on a physical arm64 Android device before it is described as production-ready.
