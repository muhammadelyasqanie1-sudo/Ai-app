# AFG AI Android APK

This repository can be packaged as an Android application with Capacitor.

## Build an APK with GitHub Actions

1. Open the repository on GitHub.
2. Go to **Actions**.
3. Select **Build Android APK**.
4. Press **Run workflow** and select the `main` branch after the changes are merged.
5. When the run finishes, open its **Artifacts** section and download `AFG-AI-Android-APK`.
6. Extract the ZIP and install `app-debug.apk` on the Android device.

The workflow builds the web app, creates the native Android project, syncs the app assets, and produces a debug APK. It does not run the test suite.

## App identity

- App name: AFG AI
- Android application ID: `com.afgai.app`
- Packaging: Capacitor Android WebView

## Local build

Install Node.js 22 and Java 21, then run:

```bash
npm install
npm run build
npx cap add android
npx cap sync android
cd android
./gradlew assembleDebug
```

APK output:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

## Important backend note

The chat UI currently sends requests to `/api/chat`. A native APK does not automatically host the Express/Vite development server, so production chat requires the API server to be deployed and the app's API request URL to be configured for that deployed HTTPS endpoint. The APK build packages the current app UI; it does not deploy the AI backend.
