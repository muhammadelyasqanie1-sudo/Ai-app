# AFG AI setup and release guide

## Supported build environment

Use the following toolchain for the repository's current Vite 8 and Capacitor 8 setup:

- Node.js 22 LTS (22.12 or newer).
- npm 10 or newer (npm 11 is supported).
- Java 21 (Temurin recommended).
- Android SDK Platform and Platform Tools.
- Android NDK 29.0.13113456.
- CMake 3.31.6.
- Git and access to the `muhammadelyasqanie1-sudo/Ai-app` repository.

Check versions before installing dependencies:

```sh
node -v
npm -v
java -version
```

Install dependencies and build the web app:

```sh
npm install --no-audit --no-fund
npm run build
```

Run the offline unit and integration suite when authorized:

```sh
npm run test:offline
```

## Android debug APK

The `.github/workflows/android-offline-build.yml` workflow supports manual dispatch and pushes to `offline-complete`. It installs the pinned Android NDK and CMake versions, builds the web assets, generates/synchronizes the Capacitor Android project, assembles a debug APK, and uploads it as the `afg-ai-offline-hub-debug-apk` artifact.

The workflow needs no signing secrets. Its artifact is a debug APK and is intended for installation/testing, not Play Store distribution.

## Signed Android release

Create a dedicated Android upload/release keystore locally. Do not commit the keystore or its passwords. Add these four repository Actions secrets under Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded bytes of the JKS/PKCS12 keystore |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Alias of the release key |
| `ANDROID_KEY_PASSWORD` | Password for that key |

On a machine with the Android signing keystore, encode it without line wrapping:

```sh
base64 -w 0 release-keystore.jks
```

On macOS, use `base64 < release-keystore.jks | tr -d '\\n'`.

Never paste the raw keystore, password, or private key into chat, source files, build logs, or a commit. Rotate the key if it is exposed. Keep a secure offline backup; losing the key can prevent updates to an app already distributed with that signing identity.

The `.github/workflows/android-release.yml` workflow is manually dispatched. It validates all four secrets, writes the keystore only in the ephemeral runner, configures `android/app/build.gradle`, builds `assembleRelease`, and uploads the signed APK. The keystore path and passwords are passed as environment variables, not written into Gradle source.

## Runtime configuration

The API server reads provider credentials only on the server. Configure the required provider credentials in the hosting service's environment settings. For Cloudflare Workers AI, use `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. Do not add provider API keys to `VITE_*` variables or the Android application.

For database-backed accounts and conversations, configure `DATABASE_URL`, set `DATABASE_SSL=require` for the Supabase pooler, then run `npm run db:migrate`. The initial schema is tracked as `database/migrations/001_initial_schema.sql`; the migration runner records checksums and applies each migration once. Google sign-in is enabled only when `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `APP_ORIGIN` are configured; register `${APP_ORIGIN}/api/auth/google/callback` as an authorized redirect URI in Google Cloud Console. Email/password registration and verification require `RESEND_API_KEY` and `EMAIL_FROM`.

For a mobile build that should connect to a deployed API, set the optional `api_base_url` input in the APK workflow or define the repository Actions variable `VITE_API_BASE_URL` to the HTTPS API origin (for example, the Render service origin). If omitted, the app uses its same-origin API path; a standalone APK will not magically have a remote server at its own origin.

## Offline model limitations

- Browser inference uses the WebLLM prebuilt model catalog and its supported model formats. It does not load arbitrary GGUF files.
- Android GGUF inference requires the native llama.cpp library compiled for the APK ABI. The current native Gradle configuration targets `arm64-v8a`.
- Model download metadata, disk space, and RAM are checked before download/load, but a device can still fail model loading because of memory pressure, thermal throttling, unsupported GGUF architecture, or Android vendor limitations.
- A model download is not proof that the model can be loaded or that its tokenizer/chat template is supported.

## Before distribution

1. Configure hosting environment variables and database schema.
2. Add the four Android release secrets if a signed release is needed.
3. Run the web build and offline tests.
4. Build and install the debug APK on supported physical devices.
5. Test download interruption, pause/resume, checksum mismatch, model load, token streaming, cancellation, and airplane-mode chat.
6. Build a signed release only after debug verification.
