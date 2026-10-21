# Emil Design Engineering Audit — Post2Drive

**Status:** Living acceptance criteria for the design-engineering direction. This document is not a release sign-off; every current-head CI check and the remaining manual/device gates must be recorded separately.

## Design standard

The required UI craft reference is `.agents/skills/emil-design-eng/SKILL.md`, sourced from [emilkowalski/skills](https://github.com/emilkowalski/skills). Apply it to web and Capacitor UI with Post2Drive's own product identity and existing colour semantics.

### Preserve shared principles

The design-direction change does **not** remove the parts that overlap with the prior Apple-HIG implementation:

- semantic page landmarks, meaningful accessible names, keyboard operation, and visible focus;
- contrast and target-size requirements, responsive layout, safe-area handling, and text scaling;
- reduced-motion behavior and accessible loading, empty, success, and error states;
- compact mobile navigation, correct current-page state, Escape behavior, and focus handling;
- server-side authorization, account ownership, market separation, payment integrity, and delivery lifecycle guarantees.

These are product requirements, not a vendor-specific visual style.

## Emil design-engineering rules

1. **Motion must earn its place.** Decide whether to animate based on frequency and purpose before writing CSS. Repeated filters, navigation and keyboard-triggered actions should feel immediate; do not add decorative movement to high-frequency tasks.
2. **Keep interaction motion fast.** Use explicit properties and durations; typical UI feedback should stay under 300ms. Prefer a strong ease-out for entry and immediate feedback, ease-in-out for on-screen movement, and linear timing only for constant motion.
3. **Never use `transition: all`.** Name properties so unrelated layout changes do not animate accidentally.
4. **Make pointer feedback subtle.** A fine-pointer press may scale to approximately `0.97`; do not animate keyboard-visible focus or block an action while motion runs.
5. **Respect spatial origin.** When adding a popover or anchored surface, make it enter from its trigger. Centered dialogs remain centered. Do not introduce motion to the existing mobile More menu merely for decoration.
6. **Prefer interruptible transitions for rapidly changing UI.** Dynamic toasts, menus and toggles should not restart from a stale keyframe. Animate transform/opacity when practical rather than layout-heavy dimensions.
7. **Honor reduced motion.** Remove positional/scale movement under `prefers-reduced-motion: reduce`; preserve necessary state and focus feedback.
8. **Touch behavior must be intentional.** Gate hover-only effects behind `(hover: hover) and (pointer: fine)`; never rely on hover to expose required actions.
9. **Review the rendered product.** Inspect 320, 390, 768 and 1440px widths, keyboard paths, real loading/error/empty states, and Android WebView behavior. Source contracts and axe do not replace manual VoiceOver/TalkBack and physical-device testing.

## Risk-ranked release gates

| Risk | Area | Acceptance criteria |
| --- | --- | --- |
| P0 | Authentication, authorization and market integrity | Authenticated HTTP lifecycle matrix, account-ownership checks, country/currency isolation, and security scans pass. A visual refactor must not alter server-side permissions or business rules. |
| P0 | Accessibility | Rendered axe, keyboard, skip-link, focus, contrast, overflow and reduced-motion checks pass on the latest commit. Manual screen-reader review remains required. |
| P0 | Account lifecycle and sessions | PATCH/DELETE serialization, password-change/reset session revocation, token single-use and legacy-token fail-closed tests pass against isolated PostgreSQL. |
| P1 | Mobile navigation | Current route is announced, More opens/closes accessibly, Escape restores focus correctly, safe-area padding is respected, and controls remain usable at 320–700px. |
| P1 | Marketplace and delivery workflow | Loading failures remain distinct from empty results; retry, bidding, accept, pickup, delivery, payment and incident flows preserve ownership and state. |
| P1 | Forms and account settings | Labels, validation feedback, step changes, save/disabled states, and destructive confirmations remain clear to keyboard and screen-reader users. |
| P1 | Motion and performance | Named transition properties, purposeful motion, pointer-gated hover/press effects and reduced-motion behavior are verified. No interaction is delayed to show an animation. |
| P2 | Visual consistency | Keep Post2Drive's established palette, typography hierarchy, spacing and clear operational status cues. Polish should come from detail and coherence, not gratuitous gradients or animation. |
| P2 | Release evidence | Independent review, manual VoiceOver/TalkBack, real-device checks, staging verification, backup/restore, monitoring/recovery and rollback checks remain separate release gates. |

## Current scope and safety

- Preserve all localization, QA, account-security, accessibility, responsive and Android smoke tests.
- Do not relax test assertions to make a run green; update fixtures/contracts when they no longer reflect the real implementation.
- Keep PR #43 draft until current-head checks and release gates are reviewed.
- No merge or deployment is implied by this design-standard replacement.
