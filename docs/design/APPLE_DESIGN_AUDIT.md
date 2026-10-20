# Post2Drive Apple Design Skill audit and implementation tracker

**Status:** In progress. Foundational code commit `7fa75cf659c8d67c57c94d4095a98cad1dc2d651` passed Validate run `39504619519` and Security Scan run `39504619497`; docs-only follow-up `d486651179377de37a6ce5a3617f1dbf48b44132` also passed Validate run `39504879512` and Security Scan run `39504879471`. Subsequent review-branch refinements improve requirement action names, vehicle form structure/date rendering, payment action names/theme tokens, and account-settings heading hierarchy/deletion confirmation. Validation for the newest changes is pending; do not treat them as validated until their own CI completes. Automated rendered-page accessibility scanning, browser/device validation, and complete screen-by-screen review remain release gates.

## Standard and method

- Required product-wide reference: pinned Apple Design Skill submodule at `.agents/skills/apple-design`.
- Required references: `references/hig/accessibility.md`, `layout.md`, `typography.md`, `color.md`, and `references/cross-platform.md`.
- Add 3–6 relevant references per screen/interaction. Relevant references considered include `tab-bars.md`, `entering-data.md`, `design-principles.md`, and `designing-for-ios.md`.
- Apply Purpose, Agency, Responsibility, Familiarity, Flexibility, Simplicity, Craft, and Delight. Use transferable principles, not iOS-only controls, for the Next.js/Capacitor web and Android product.
- Protect authentication, permissions, payments, market separation, and job/delivery lifecycle. Source review is not proof of rendered conformance.

## Risk scale

- **P0 Critical:** likely blocks safe/equitable use, exposes data, breaks a core task, or creates a serious accessibility barrier. Must be resolved or explicitly accepted before release.
- **P1 High:** core workflow or important accessibility/responsive failure; resolve before release.
- **P2 Medium:** meaningful usability, consistency, or resilience issue; resolve before broad release.
- **P3 Low:** polish and maintainability; schedule after higher-risk items.

## Risk-ranked findings and required changes

| Risk | Section | Finding / required change | Evidence / acceptance test |
|---|---|---|---|
| P0 | Authentication, authorization, market integrity | Do not infer security from visual UI. Verify server-side authorization, account ownership, and country/currency isolation for every changed flow. Design refactors must not loosen permissions or market boundaries. | Run market-isolation, country-matrix, auth and lifecycle regressions; inspect API authorization boundaries. Any failure blocks release. |
| P0 | Accessibility across all screens | Full product-wide keyboard, accessible-name, focus-order, contrast, error-announcement, zoom/text-scaling and screen-reader audit is not complete. Rendered axe/keyboard/overflow checks are now wired into CI for public and authenticated routes at four viewport sizes; newest run must pass before these checks count as evidence. | Run an automated accessibility scan on key routes and manually test keyboard + screen reader; record route, browser, viewport and outcomes. |
| P0 | Account mutation concurrency and session revocation | Implemented on this branch: PATCH and DELETE take the same account-row lock and re-check active state inside the transaction; password changes increment `User.sessionVersion`; JWT validation compares the persisted version and rejects deleted accounts; successful password change signs out and asks the user to sign in again. PostgreSQL concurrency/session-version regression coverage has been added. Runtime JWT callback tests for password-change revocation, deletion revocation and legacy-token fail-closed behavior are now wired into CI; latest CI must pass before this is considered verified. | Require the new CI race test, migration, TypeScript/build and secret scan to pass; confirm stale tokens return no session. Browser/session integration and independent security review remain release gates. |
| P1 | Mobile navigation | Primary navigation was crowded. It is now reduced to Home, Marketplace, Post a Job and Vehicles; secondary links are in More. Active-page state, safe-area padding, touch sizing and Escape handling exist. Recent refinement gives More links an accessible group name and only returns focus when Escape closes an open menu. | At 320, 375, 430 and 700 px; test keyboard, touch, active routes, India-only Requirements, safe area, page-content obstruction and Escape focus return. Current refinement's CI is pending. |
| P1 | Jobs / marketplace lifecycle | Dense filters and lifecycle actions risk unclear hierarchy. Filters expose group/pressed semantics. Loading, failure, empty, success and destructive-action messaging still need a full announcement/recovery audit. Marketplace loading failures now have a distinct assertive error state and retry action rather than being confused with an empty list. | Test every status and owner/driver role; confirm messages are announced, actions are understandable, destructive actions are confirmed, and retries do not duplicate state changes. |
| P1 | Signup | Progress semantics and error alert exist; market-dependent steps, optional research, verification and terms require end-to-end keyboard/focus testing. Step changes should make the new heading and validation feedback discoverable without disrupting screen readers. | Exercise every market and step, invalid form, back/continue, optional step, submission, network failure, verification resend and 200% zoom. Confirm no market/pricing behavior changes. |
| P1 | Login / session | Shared auth layout improves consistency, but focus, error state, password-manager/autofill, narrow viewport and keyboard operation need runtime checks. | Test valid/invalid credentials, loading and server failure, autofill, mobile keyboard and visible focus. |
| P1 | Dashboard | Responsive metric grid is implemented. The next action, active work, exceptions and operational information hierarchy remain to be checked with realistic data and zoom. | Review empty, sparse and high-volume accounts at mobile/tablet/desktop widths; ensure cards wrap without horizontal scrolling and links have visible focus. |
| P1 | Forms, payments, vehicles, requirements, admin | These screens have not had a complete control-by-control audit. Check field labels/help/errors, status communication, confirmation for consequential actions, permission-aware content, and useful empty/loading/error recovery. | Build a route inventory and verify each screen in keyboard, touch and screen-reader passes; validate role/country-specific views. |
| P2 | Color and typography | Global palette/tokens exist, but actual contrast ratios and text scaling have not been measured across every state. Muted text, disabled states, selected tabs and color-only status cues need particular attention. | Measure text/non-text contrast against WCAG 2.2 AA; test 200% zoom and browser text scaling; never use color alone to convey status. |
| P2 | Responsive layout and safe areas | Fixed mobile navigation and safe-area spacing exist, but overlap/scroll behavior is not runtime-verified. Check landscape, virtual keyboard, browser chrome and short-height screens. | Device/emulator checks for portrait/landscape, small viewport, keyboard-open forms, safe areas and bottom content reachability. |
| P2 | Empty/loading/error states | Empty-state and failure recovery patterns need consistent next steps; errors must be announced and loading should not appear as a blank or frozen page. | For each major route, simulate slow network, API error, no data and retry; assert visible, announced message and clear recovery action. |
| P2 | CSS tokens and cascade | `app/globals.css` has accumulated repeated/overlapping rules and some inline styles remain. Consolidate incrementally only with baseline screenshots and no behavior change. | Inventory duplicate selectors/tokens, add visual regression snapshots, then consolidate in small commits; re-run build and visual tests. |
| P2 | Personalization | Home greeting now uses the session name with a neutral fallback. Verify missing/blank name, session loading, signed-out and long-name cases. | Test session states and narrow widths; no personal data should leak between sessions. |
| P2 | Android / Capacitor | Native wrapper-specific viewport, keyboard, back navigation, touch and safe-area behavior is unverified. | Test a built app/emulator, not only responsive browser emulation; validate Android back behavior and keyboard viewport changes. |
| P3 | Motion and polish | Reduced-motion overrides exist for selected navigation/cards; audit all transitions, loading indicators and animated state changes. | With reduced motion enabled, ensure nonessential motion is removed and state changes remain clear. |
| P3 | Copy and familiarity | Review labels, button verbs, jargon, and consistent terminology for poster/driver/haulier roles and regional markets. | Content review with representative tasks; preserve legally or commercially meaningful terms. |

## Implemented on `design/apple-hig-foundation`

- Added the pinned Apple Design Skill submodule and root `AGENTS.md` requiring the skill for future UI/UX work.
- Mobile navigation: four primary destinations, More menu for secondary destinations, active-route semantics, safe-area padding, touch-sized links, visible focus and reduced-motion rules.
- Mobile More menu: Escape closes an open menu and returns focus to its trigger; the links group now has an accessible name.
- Global accessibility pass (source-level): darkened positive/warning semantic colors, replaced faint focus outlines with solid focus indicators, and applied reduced-motion preferences globally.
- Account mutation safety: PATCH and DELETE serialize on a shared `Account` row lock and perform their state checks/writes within the same transaction; deletion revalidates the current password after acquiring the lock.
- Session revocation policy: changing a password invalidates all existing JWT sessions, including the current one; the UI signs out and returns the user to login with an explanatory message. Account deletion also increments session versions, and JWT validation rejects deleted accounts. Pre-version JWTs fail closed and require sign-in.
- Status communication: payment success/error and loading states now expose status/alert semantics; vehicle, account-settings, and marketplace loading states are announced; marketplace empty-state, account save/password feedback, and signup verification resend feedback use status announcements.
- Account recovery: account settings now surface load/save/password failures, provide a retry action when initial loading fails, prevent duplicate save/password submissions while busy, and retain password-manager autocomplete hints.
- Touch and disclosure semantics: form controls/buttons use a 44px minimum height; the mobile More menu remains in the DOM while collapsed so `aria-controls` always points to an existing element, with an explicit hidden-state rule.
- Keyboard bypass: the shared layout now provides a skip-to-main-content link and a programmatically focusable target, so keyboard users can bypass repeated navigation.
- Authentication usability: login and password-change fields now provide browser autofill semantics; dashboard greeting has a neutral fallback for missing profile names.
- Regression guard: added `scripts/qa/design-accessibility-contract.mjs`, wired it into `qa:all` and the Validate workflow. It checks contrast-token ratios, global focus/reduced-motion rules, minimum control sizes, navigation/filter/progress semantics, and selected loading/error announcements.
- Dashboard: responsive metric-card grid using shared CSS tokens and focus/hover treatment.
- Home greeting: session-derived name with neutral fallback.
- Login: shared responsive authentication layout.
- Jobs filters: labelled group, button types, `aria-pressed`, wrapping and 44px minimum height.
- Vehicle onboarding: separate loading failure from submission errors, provide a retry action, expose the empty state as a status, and use a 44px submit target.
- Marketplace recovery: initial job-list failures are distinct from action feedback, announced as alerts and recoverable with Retry loading jobs; the empty-state message is suppressed while the list is in an error state.
- Payments: add a retry action when the initial load fails, announce refresh/loading state, and expose empty-result cards as statuses with the shared readable muted-text token.
- Multi-step forms: signup and job-posting wizards move focus to the newly rendered step heading, making progress changes discoverable to keyboard and assistive-technology users.
- Signup: progressbar role, min/max/current values and step name.

## Latest automated validation evidence

For commit `7fa75cf659c8d67c57c94d4095a98cad1dc2d651`:
- **TypeScript type-check:** passed in GitHub Actions Validate run `39504619519`.
- **Next.js production build:** passed in the same run.
- **Account mutation race regression:** passed against local CI PostgreSQL in the same run. It covers deletion-first (a waiting PATCH is rejected) and PATCH-first (deletion waits and anonymizes the last committed profile state).
- **Prisma schema validation/client generation and clean-database migration deploy, including `User.sessionVersion`:** passed.
- **Market-isolation/country-matrix, worker lifecycle/atomic claims, staging-schema migration, read-only QA inventory, lifecycle source contracts, and design-accessibility source contracts:** passed.
- **Repository/history secret scan:** passed in run `39504619497`.
- **Accessibility improvements with source-contract coverage:** skip navigation, contrast-token thresholds, visible focus, reduced-motion, 44px targets, payment/vehicle recovery and empty states, and focus transitions in signup/job-posting wizards.
- **Still outstanding at that commit:** rendered-page accessibility scan, browser/device visual and keyboard review, Android/Capacitor testing, full route-by-route QA, and runtime verification that stale JWT sessions are rejected after password changes/deletion.

## Latest review-branch refinements (validation pending)

- India requirements: added a named region and route-specific accessible names for repeated Edit, Marketplace and Incident links; each status has a readable text label.
- Vehicle onboarding: added a visible heading associated with the registration form, a named region for registered vehicles, disabled browser autofill for registration plates, and stable UTC rendering for date-only expiry values.
- Payments: added job-specific accessible names to Mark as paid and Confirm received actions, disabled Refresh during loading while keeping existing payment context visible during refresh and announcing progress, removed a hard-coded Arial override, and changed card surfaces/muted text to shared theme tokens.
- Account settings: changed section headings to a consistent second-level hierarchy, named the destructive section, reused danger/surface tokens, and disabled browser capitalization/spellchecking helpers for the typed DELETE confirmation.
- Marketplace loading failures now use a distinct alert, retry action and suppress the false empty state.
- Added `scripts/qa/auth-session-revocation.ts` to exercise the real NextAuth JWT/session callbacks against CI PostgreSQL for password changes, account deletion and legacy JWTs; added `scripts/qa/rendered-accessibility.mjs` to create a temporary verified India account, sign in through the UI, and run axe WCAG checks, horizontal-overflow checks and first-tab skip-link checks across public and authenticated routes at 320, 390, 768 and 1440px.
- Validate workflow now installs browser-only QA dependencies, installs Chromium, runs the JWT regression, launches the built app locally, and scans rendered routes. The new browser checks are not yet counted as passed until the latest workflow completes successfully.
- Design accessibility source contracts now guard these new route names, semantic regions, theme tokens, date handling, settings behavior and marketplace retry behavior. CI must pass for the latest head before these additions are considered validated.

## Release gates

1. Run all repository-defined QA contracts, including `npm run qa:all`, in a supported environment and record exact results.
2. Add or update regression tests for changed behavior; test mobile navigation across routes and markets.
3. Run automated accessibility checks and manual keyboard/screen-reader review.
4. Review screenshots in browser and on a real/emulated Android device at narrow, standard and large viewports; include 200% zoom and reduced motion.
5. Re-check contrast and all loading, empty, error and success states.
6. Keep changes on the review branch and PR. Do not merge, change the default branch, deploy, or run destructive production/staging QA without explicit authorization.

## Reference index

- `.agents/skills/apple-design/references/hig/accessibility.md` — Mobility, Cognitive, labels, focus, hit regions.
- `.agents/skills/apple-design/references/hig/layout.md` — Visual hierarchy, Adaptability, Guides and safe areas.
- `.agents/skills/apple-design/references/hig/typography.md` — Ensuring legibility, Conveying hierarchy, Dynamic Type.
- `.agents/skills/apple-design/references/hig/color.md` — semantic color and contrast.
- `.agents/skills/apple-design/references/hig/tab-bars.md` — Best practices for prioritizing primary navigation, adapted for web/Android.
- `.agents/skills/apple-design/references/hig/entering-data.md` — form entry, validation and feedback.
- `.agents/skills/apple-design/references/hig/design-principles.md` — product design principles.
- `.agents/skills/apple-design/references/cross-platform.md` — translating principles across platforms.
