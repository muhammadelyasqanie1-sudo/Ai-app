# AFG AI JARVIS — Android device controls

## What is implemented

The optional `@afg-ai/capacitor-jarvis` Capacitor plugin adds an Android-only, user-consented control bridge:

- Read whether the AFG AI Accessibility Service is enabled and connected.
- Open Android's Accessibility settings so the device owner can enable the service.
- Launch an installed Android app by package name.
- Perform explicit Back, Home, Notifications, Quick Settings and scroll actions.
- Click a visible control by its displayed text.
- Insert user-provided text into the currently focused editable field.

The React screen is available from the navigation drawer as **JARVIS device assistant**. It reports unsupported browser use instead of simulating device actions.

## Android setup

1. Install/update the AFG AI Android APK built from this branch.
2. Open **JARVIS device assistant**.
3. Tap **Open Accessibility settings**.
4. In Android settings, enable **AFG AI Jarvis device controls** after reviewing the system disclosure.
5. Return to AFG AI and refresh the permission status.

No root permission is required. The service uses Android's official AccessibilityService APIs. It only receives window/focus callbacks and does not persist, log, or upload screen contents. Actions are invoked only after a direct user interaction in the app; click and text-entry actions show an additional confirmation.

## Security and platform boundaries

- This is a guided control bridge, not an autonomous agent. It does not independently decide what to click or type.
- It does not auto-like posts, subscribe, send messages, make purchases, install packages, unlock the device, or bypass app security.
- Some apps expose incomplete accessibility trees, so text-based clicks and focused-field typing may not work everywhere.
- Android and individual apps can block or constrain automation. The service cannot grant itself accessibility permission.
- The current implementation intentionally does not request overlay permission, microphone access, camera access, notification access, location, or device-admin privileges.
- Offline speech recognition, a persistent floating bubble, hand-gesture recognition, flight radar, and anti-theft/lockout features are not implemented in this increment. Do not present them as available.
- The Android app must be rebuilt for the native plugin to be packaged. A web-only deployment cannot control the phone.
- Google Play distribution of accessibility-based automation is subject to Play policy and review; sideloading does not remove Android's own permission and security boundaries.

## API surface

The native bridge exports `AFGJarvis.getStatus()`, `openAccessibilitySettings()`, `openApp({ packageName })`, `performAction({ action })`, `clickText({ text })`, and `typeText({ text })`. It is registered through the local Capacitor package in `package.json`.

## Verification status

Source files and manifest wiring were inspected. Per repository policy, no tests, type-check, lint, Android sync, build, APK workflow, or deployment was run. Install dependencies and run Capacitor Android sync/build only after the project owner authorizes those operations.
