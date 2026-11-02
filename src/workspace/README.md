# Minimal workspace UI

Light, minimal AI app-builder workspace built with React, Tailwind and `motion/react`
(the Framer Motion successor already in `package.json`). It is self-contained and does
not touch `App.tsx`, `index.css` or the i18n dictionaries.

## Run

```bash
npm run dev
# open http://localhost:3000/workspace.html
```

## Design tokens (`workspace.css`)

`canvas` #F8F9FA, `brand` #2563EB, `line` #E5E7EB, white panels, 12 to 16px radii,
Inter / Vazirmatn at weights 400, 500 and 600.

## Components

`Layout`, `Sidebar`, `Header` (model selector + Minimal badge), `ChatArea`,
`MessageBubble` (+ `ThinkingBubble`), `BottomInput`, `ToolsDropdown`, `BottomNav`,
plus the tool pages (Terminal, Files, Providers, Offline, Media, Settings).

## Motion

| Where | Behavior |
| --- | --- |
| Page load | Sidebar slides in from the start edge; chat rows and messages stagger-fade up |
| Buttons | Scale to 1.02 with a soft shadow on hover |
| Chat rows | Nudge 2px toward the end on hover; the dots menu fades in |
| Sidebar tabs / bottom nav | One shared pill / indicator glides between items (`layoutId`) |
| Tools menu, model menu | Fade in and scale from 95% to 100% with a spring |
| AI thinking | Three bouncing dots inside an AI bubble |
| Search | The magnifier glows while the field has focus |

`MotionConfig reducedMotion="user"` disables transform animations for people who ask
their OS for reduced motion.

## Layout

- Desktop (lg and up): permanent sidebar that can be collapsed.
- Mobile: slide-in drawer plus a fixed bottom bar (Chat, Terminal, Files, Settings).
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

Chats, projects and the model list are seeded from `data.ts`; replace with persisted data.

## Not done yet

- Production build: `vite.config.ts` has no multi-page input, so `npm run build` does not bundle `workspace.html`. Add `build.rollupOptions.input` for both pages, or mount `WorkspaceApp` from `App.tsx`.
- The microphone and attach buttons are visual only.
- Not wired into the main app and not run through `npm run lint` or a browser yet.
