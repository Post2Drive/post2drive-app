**Status:** In progress. The foundational code commit `7fa75cf659c8d67c57c94d4095a98cad1dc2d651` passed Validate run `39504619519` and Security Scan run `39504619497`. The latest review branch adds rendered browser tests, runtime JWT revocation checks, profile-market isolation, admin research aggregation, marketplace retry recovery and an Android emulator smoke workflow. Validate run `39508195125` passed schema/migration, concurrency, source-contract, TypeScript/build and runtime JWT steps, then exposed that the Marketplace page lacked a main landmark; the Marketplace and Dashboard landmarks have since been corrected. Latest-head Validate and Security Scan are pending. Android debug compilation passed on an earlier commit, but an earlier emulator attempt did not complete reliably; the current API 34 WebView-launch smoke and staging preflight remain unverified. Automated rendered-page checks must pass, and manual screen-reader/real-device review remains a release gate. No merge or deployment has been performed.

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
| P0 | Account mutation concurrency and session revocation | Implemented on this branch: PATCH and DELETE take the same account-row lock and re-check active state inside the transaction; password changes increment `User.sessionVersion`; JWT validation compares the persisted version and rejects deleted accounts; successful password change signs out and asks the user to sign in again. PostgreSQL concurrency/session-version regression coverage has been added. Runtime JWT callback tests for password-change revocation, deletion revocation and legacy-token fail-closed behavior passed on Validate run `39508195125`; the latest head still needs its own full CI pass. | Require the new CI race test, migration, TypeScript/build and secret scan to pass; confirm stale tokens return no session. Browser/session integration and independent security review remain release gates. |
| P1 | Mobile navigation | Primary navigation was crowded. It is now reduced to Home, Marketplace, Post a Job and Vehicles; secondary links are in More. Active-page state, safe-area padding, touch sizing and Escape handling exist. Recent refinement gives More links an accessible group name and only returns focus when Escape closes an open menu. | At 320, 375, 430 and 700 px; test keyboard, touch, active routes, India-only Requirements, safe area, page-content obstruction and Escape focus return. Current refinement's CI is pending. |
| P1 | Jobs / marketplace lifecycle | Dense filters and lifecycle actions risk unclear hierarchy. Filters expose group/pressed semantics. Loading failures now have a distinct alert and retry action, and the page exposes a `main` landmark. Success and destructive-action messaging still need a full announcement/recovery audit. Marketplace loading failures now have a distinct assertive error state and retry action rather than being confused with an empty list. | Test every status and owner/driver role; confirm messages are announced, actions are understandable, destructive actions are confirmed, and retries do not duplicate state changes. |
| P1 | Signup | Progress semantics and error alert exist; market-dependent steps, optional research, verification and terms require end-to-end keyboard/focus testing. Step changes should make the new heading and validation feedback discoverable without disrupting screen readers. | Exercise every market and step, invalid form, back/continue, optional step, submission, network failure, verification resend and 200% zoom. Confirm no market/pricing behavior changes. |
| P1 | Login / session | Shared auth layout improves consistency, but focus, error state, password-manager/autofill, narrow viewport and keyboard operation need runtime checks. | Test valid/invalid credentials, loading and server failure, autofill, mobile keyboard and visible focus. |
| P1 | Dashboard | Responsive metric grid is implemented. The page now exposes a `main` landmark; the next action, active work, exceptions and operational information hierarchy still need review with realistic data and zoom. | Review empty, sparse and high-volume accounts at mobile/tablet/desktop widths; ensure cards wrap without horizontal scrolling and links have visible focus. |
| P1 | Forms, payments, vehicles, requirements, admin | These screens have not had a complete control-by-control audit. Requirements, vehicle, payment, settings, profile and admin-research refinements are now covered by additional source contracts and rendered browser tests, pending latest CI. Check field labels/help/errors, status communication, confirmation for consequential actions, permission-aware content, and useful empty/loading/error recovery. | Build a route inventory and verify each screen in keyboard, touch and screen-reader passes; validate role/country-specific views. |
| P2 | Color and typography | Global palette/tokens exist, but actual contrast ratios and text scaling have not been measured across every state. Muted text, disabled states, selected tabs and color-only status cues need particular attention. | Measure text/non-text contrast against WCAG 2.2 AA; test 200% zoom and browser text scaling; never use color alone to convey status. |
| P2 | Responsive layout and safe areas | Fixed mobile navigation and safe-area spacing exist, but overlap/scroll behavior is not runtime-verified. Check landscape, virtual keyboard, browser chrome and short-height screens. | Device/emulator checks for portrait/landscape, small viewport, keyboard-open forms, safe areas and bottom content reachability. |
| P2 | Empty/loading/error states | Empty-state and failure recovery patterns need consistent next steps; errors must be announced and loading should not appear as a blank or frozen page. | For each major route, simulate slow network, API error, no data and retry; assert visible, announced message and clear recovery action. |
| P2 | CSS tokens and cascade | `app/globals.css` has accumulated repeated/overlapping rules and some inline styles remain. Consolidate incrementally only with baseline screenshots and no behavior change. | Inventory duplicate selectors/tokens, add visual regression snapshots, then consolidate in small commits; re-run build and visual tests. |
| P2 | Personalization | Home greeting now uses the session name with a neutral fallback. Verify missing/blank name, session loading, signed-out and long-name cases. | Test session states and narrow widths; no personal data should leak between sessions. |
| P2 | Android / Capacitor | A debug build against the existing HTTPS staging URL is configured; an Android emulator test now asserts that the Capacitor WebView launches, preceded by a read-only staging reachability check. Latest emulator run is pending. | Test a built app/emulator, not only responsive browser emulation; validate Android back behavior and keyboard viewport changes. |
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

## Latest review-branch refinements (latest CI pending)

- India requirements: named region, route-specific Edit/Marketplace/Incident links, and visible status context.
- Vehicle onboarding: labelled registration form, named registered-vehicle region, no registration-plate autofill, stable UTC expiry-date display.
- Payments: route-specific action names, refresh-disabled state, preserved content during refresh, progress announcement, shared theme tokens, and populated completed-payment browser fixture.
- Account settings: consistent second-level headings, named destructive section, shared danger/surface tokens, and reliable typed DELETE confirmation input.
- Marketplace: initial load failure is distinct from an empty result, announced assertively, and recoverable via Retry loading jobs.
- Dashboard and Marketplace: rendered-route test exposed missing main landmarks; both have now been corrected and are guarded by source contracts.
- Public profile: restored the missing `/api/profile/[id]` route. It requires authentication, checks same-country/currency access before reading profile/vehicle/rating details, hides deleted accounts, excludes private contact/document fields, and returns only intended profile data. The UI now has accessible loading/error/retry states and correct job-count rendering.
- India market research: restored the linked admin route as an aggregate-only report. It excludes deletion-requested accounts, selects only survey JSON, and does not expose account-level identifiers.
- Pricing: shared design tokens replace hard-coded colors; pricing-tier names use semantic headings.
- Runtime JWT regression: `scripts/qa/auth-session-revocation.ts` exercises real NextAuth JWT/session callbacks against CI PostgreSQL for password changes, account deletion and legacy-token fail-closed behavior. This step passed in Validate run `39508195125`; the latest head must still pass its own full Validate run.
- Rendered browser QA: `scripts/qa/rendered-accessibility.mjs` signs in a temporary verified India test account and scans public legal/pricing and authenticated marketplace, admin, profile, vehicle, payment and settings routes across 320, 390, 768 and 1440px. It checks axe WCAG rules, horizontal overflow, first-tab skip navigation, signup/job wizard focus, mobile More/Escape behavior, marketplace retry, populated fixtures and cross-market profile privacy.
- Android/Capacitor: the workflow builds a debug APK with the existing HTTPS staging URL, checks that URL and cleartext settings, and preflights the existing staging homepage. An API 34 emulator smoke test checks that the Capacitor WebView launches. A prior Espresso-Web attempt stalled and another emulator image download failed; the current simplified smoke test is not yet validated.
- CI status: latest code head and its security, full Validate and Android emulator workflows are pending. Do not treat the new rendered accessibility or emulator checks as passed until those exact runs complete successfully.


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
