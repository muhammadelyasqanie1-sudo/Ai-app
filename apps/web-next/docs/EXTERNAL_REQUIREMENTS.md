# AFG AI — Remaining External Requirements

Honest status: everything below works in this build, but its full capability depends on external configuration that cannot be fabricated in the sandbox. Each item includes the exact requirement and what happens without it.

## 1. Email delivery (verification & password-reset emails)
- **Requirement:** `RESEND_API_KEY` + verified `EMAIL_FROM` (Resend account).
- **Without it:** the flows still work end-to-end; with `AFG_ALLOW_DEV_CODES=true` the 6-digit code is returned by the API and clearly displayed in the UI as a development code. With the flag `false` and no provider, code delivery fails with an explicit error — never a fake success.

## 2. Google sign-in
- **Requirement:** `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` from Google Cloud Console; redirect URI `https://YOUR_APP_ORIGIN/api/auth/google-callback`.
- **Without it:** the button renders as explicitly "Disabled" and the API returns `GOOGLE_NOT_CONFIGURED`.

## 3. 9Router AI Gateway
- **Requirement:** a reachable 9Router deployment: `NINEROUTER_BASE_URL` (+ `NINEROUTER_API_KEY` only if 9Router's `requireApiKey` is enabled).
- **Without it:** the provider appears in Admin with honest status `UNKNOWN`/`UNREACHABLE` and "No models discovered yet" until a successful health check.

## 4. Ollama
- **Requirement:** an Ollama server reachable at `OLLAMA_BASE_URL`.
- **Without it:** same honest-unavailable behavior as above. Chat continues via AFG Cloud or any configured provider.

## 5. Custom OpenAI-compatible gateways
- **Requirement:** none at build time — admins add them at runtime (Admin → Providers) with base URL + optional key.
- **Note:** health = real `/v1/models` request; streaming = real `/v1/chat/completions`.

## 6. On-device offline inference (model packs)
- **Requirement:** the AFG AI desktop (Electron) or Android (Capacitor) shell with a downloaded model pack — the web sandbox cannot bundle a WebLLM runtime reliably (model weights are multi-GB, fetched from HF at runtime).
- **Implemented instead:** PWA offline shell, cached conversations, storage management — all real. The Offline Hub states the limitation explicitly.

## 7. Production domain + HTTPS
- **Requirement:** `APP_ORIGIN=https://your.domain` for `Secure` cookies and Google OAuth redirects.

## 8. Push notifications / background sync
- Not implemented (not requested by the mission's core list). The service worker architecture supports adding them without rework.
