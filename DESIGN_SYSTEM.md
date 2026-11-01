# AFG AI UI/UX design system

## Visual language
- Premium dark and light themes use shared CSS tokens. Dark mode uses cyan/violet accent gradients, subtle ambient glow and layered surfaces; light mode uses clean white surfaces and restrained borders.
- Shared cards use an 18px radius, controls 12px, and short 140–180ms transitions.
- Mobile uses a seven-destination bottom navigation; desktop uses a logical-start sidebar that mirrors automatically in RTL.

## Navigation destinations
Chat, Tools, Image Studio, Files, History, Settings and Profile. The current app maps Files to the Tools center until a dedicated file manager exists, and Profile to Settings until a standalone profile page exists. These are navigation aliases, not claims that those pages are already implemented.

## Component library
`src/components/afg/AfgDesignSystem.tsx` exports reusable CapabilityBadge, ToolCard, SettingsSection, ModelPicker, Composer, ChatMessage, FileDropzone, ImageGrid, ConfirmDialog, Toast, ErrorBoundary, EmptyState and Skeleton primitives. Existing AFG-specific chat views and composer remain the production chat experience.

## Accessibility and localization
- Buttons and form controls are native keyboard-operable elements with accessible labels.
- Global `:focus-visible` rings provide visible keyboard focus.
- Dialogs expose alert-dialog semantics, focus the primary action, and close on Escape.
- Toasts use polite or assertive live regions; the shared error boundary avoids showing stack traces.
- RTL uses logical inline positioning and margins. Text inputs use plaintext bidi handling so embedded Latin text and numbers keep their natural direction. Directional icons can use `.afg-directional-icon` to flip in RTL.
- Chat auto-scroll respects `prefers-reduced-motion`; global motion styles also reduce animation for the operating-system preference.
- The interface language remains controlled by the selected Dari or English locale.

## Implementation notes
- The Files and Profile destinations are currently aliases as noted above.
- The component primitives are available for incremental adoption; not every legacy screen has been migrated to them yet.
- No tests, build, or deployment were run as part of this UI implementation.
