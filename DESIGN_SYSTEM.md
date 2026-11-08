<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:9cc2f1eb3c8e99d3f61cb8433640d59bccc33d00c2d530cb73e1eb9b8b003ca6 -->

# AFG AI UI/UX design system

## Current visual language

AFG AI uses deep black `#05060A`, graphite `#0B0F17`, cyan `#0DF2FF`, blue `#168BFF`, violet `#7C4DFF`, white `#F4F7FF` and amber `#FFB86B`. Complete command-center light and dark surfaces share semantic text, border, card and accent tokens. System theme follows the operating-system preference.

The current shell has desktop navigation, an optional intelligence panel, a mobile drawer and touch-friendly bottom navigation. This replaces the previous drawer-only description and matches the requested command-center design. Existing tool screens retain their routing and backend contracts.

## Components and motion

Use the existing AFG component library and chat components. `IntelligenceCore` supplies the reusable CSS 3D/SVG brand centerpiece and compact activity mark; `experience.ts` resolves actual activity and validated device-local graphics preferences. High/balanced/low profiles use 16/8/0 particles. Shared motion timings are 140/240/600 ms. System/account/device reduced motion takes priority over effects.

The optional welcome uses the existing `AfgCinematicIntro`, reworked to avoid fictional progress and metrics. `ExperiencePanel` uses native modal focus handling. All new controls have real actions. Provider availability and device capabilities must continue to come from existing services.

## Accessibility and localization

Use native controls, visible focus, textual states, localized accessible labels and logical inline positioning. Core graphics are hidden from assistive technology; live textual status communicates application activity. Chat keeps the composer visible above mobile navigation. The real audio meter uses an already authorized MediaStream and stops on teardown.

New experience/dashboard/local-file/task/voice strings live in centralized resources for English, Dari, Persian, Pashto and Arabic. Navigation retains its centralized dictionary. Legacy tool bodies still need complete translation and review; do not claim a fully localized application.

## Detailed design and verification

See [AFG experience](docs/AFG_EXPERIENCE.md) for architecture, state mapping, performance policy, setup, privacy and verification limits. Existing authentication, provider configuration, database migrations and native platform constraints remain in force.


<!-- /coderabbit-ai-generated:v1 -->