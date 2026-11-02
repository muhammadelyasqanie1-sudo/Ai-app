# Minimal workspace UI

Light, minimal AI coding workspace built with React, Tailwind and lucide-react.
It is self-contained and does not touch `App.tsx`, `index.css` or the i18n dictionaries.

## Run

```bash
npm run dev
# open http://localhost:3000/workspace.html
```

## Layout

- Desktop (lg and up): permanent left sidebar.
- Mobile: slide-in drawer sidebar plus a fixed bottom bar (Chat, Terminal, Files, Settings).
- Right-to-left is supported through logical properties; switch language in Settings.

## Where to connect real APIs

Search for `INJECTION POINT`. All network calls are stubs in `api.ts`:

| Function | Purpose |
| --- | --- |
| `sendChatMessage` | chat completion |
| `runTerminalCommand` | terminal |
| `listFiles` | file manager |
| `generateMedia` | image / video |
| `listProviders` | providers |

Chats and projects are seeded from `data.ts`; replace with persisted data.

## Not done yet

- Production build: `vite.config.ts` has no multi-page input, so `npm run build` does not bundle `workspace.html`. Add `build.rollupOptions.input` for both pages, or mount `WorkspaceApp` from `App.tsx`.
- Not wired into the main app and not run through `npm run lint` or a browser yet.
