# AFG AI — Windows 8 offline JARVIS bridge

## Scope

The Windows browser cannot use the Android JNI runtime. The Offline AI Hub therefore has an optional desktop bridge to a **llama.cpp server running on the same computer**. The browser connects only to the fixed loopback address `http://127.0.0.1:8080`; prompts are sent to that local process, not to Railway, Supabase, 9Router, Gemini or another cloud provider.

This bridge is an inference path, not a Windows device-control agent. It does not grant access to the Windows shell, files, keyboard, camera or microphone.

## Prerequisites

1. Install/cache the AFG AI web app while the computer is online. The service worker caches the app shell and build assets; open the same AFG AI origin after disconnecting to check whether the cached shell is available.
2. Obtain a **Windows 8-compatible** llama.cpp `llama-server.exe` build. Do not assume the newest llama.cpp Windows release supports Windows 8; the executable must be tested on the actual Windows 8 installation.
3. Download a GGUF instruct model that fits the computer's physical RAM and CPU. Keep the model file on the computer. The browser cannot pass a file from its private web storage to the native llama.cpp process.
4. Start the local server with loopback binding only. Example (replace the model path and allowed origin):

```bat
llama-server.exe -m "C:\\AFG-AI\\models\\assistant.gguf" --host 127.0.0.1 --port 8080 --cors-origins "https://YOUR-AFG-AI-ORIGIN"
```

Use the exact origin shown in the browser address bar (scheme + host + optional port). Do not use `*` for CORS. Do not bind the server to `0.0.0.0` or expose port 8080 to the LAN/Internet. If the installed llama.cpp build uses a different CORS flag, consult that build's own `--help`; do not disable browser security to make it work.

## Connect

1. Open AFG AI → Offline AI Hub on the same Windows computer.
2. In **Windows local AI engine**, select **Connect local model**.
3. The panel should report the model ID returned by `GET /v1/models`.
4. Send a short test message. AFG AI calls the OpenAI-compatible `/v1/chat/completions` endpoint at loopback.
5. Disconnect the network and test again. The local server process and GGUF file must remain on the computer.

If connection fails, confirm that the server is listening on 127.0.0.1:8080, that its CORS allowlist contains the exact AFG AI origin, and that the browser permits loopback requests from that origin.

## Important Windows 8 limitation

Windows 8 is outside current browser and llama.cpp support windows. The repository change provides a browser-to-local-server bridge, but it does **not** package or certify a Windows 8 llama.cpp executable. A compatible CPU build, driver behavior, RAM headroom and offline browser loopback access must be verified on the Dell before this can be called working. If no compatible executable is available, the Windows 8 path remains blocked even though the AFG AI shell loads offline.

## Privacy and safety

- The browser bridge uses a hard-coded loopback endpoint and omits cookies/credentials.
- No provider key is required or stored by this bridge.
- The local server is powerful: keep it bound to 127.0.0.1, use a trusted GGUF file, and do not expose it to other devices.
- The server's CORS configuration is not authentication. A malicious local process or browser extension may still interact with a loopback service.
- The bridge only supports text chat. Offline speech recognition, offline Dari/Pashto speech synthesis, and Windows OS automation are separate work and are not implied by a successful model connection.
