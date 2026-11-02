# AFG AI UI/UX design system

## Visual language
- Premium dark and light themes use shared CSS tokens. Dark mode uses cyan/violet accent gradients, subtle ambient glow and layered surfaces; light mode uses clean white surfaces and restrained borders.
- Shared cards use an 18px radius, controls 12px, and short 140–180ms transitions.
- Chat is the default landing screen. All destinations are reached through one logical-start slide-over drawer: left in LTR and right in RTL. No permanent bottom navigation is rendered.

## Navigation destinations
The drawer groups Overview and History under Main; Image Studio, Video Tools, Tools Center, Terminal, Offline Learning, and the Files alias under Tools; and Settings and Admin under Account. The Files entry currently opens Tools Center because a dedicated file manager is not implemented. Model exploration remains available through the real model selector in the chat composer. Profile is represented by the account summary until a standalone profile route exists.

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
- Drawer placement and entrance/exit motion follow the selected document direction, and reduced-motion preferences disable the drawer animation.

## Implementation notes
- The Files and Profile destinations are currently aliases as noted above.
- The component primitives are available for incremental adoption; not every legacy screen has been migrated to them yet.
- No tests, build, or deployment were run as part of this UI implementation.
