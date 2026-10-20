# Post2Drive Apple Design Skill audit and implementation tracker

**Status:** In progress. Latest verified source commit before the current navigation refinement, `aa79714938e15ec2a764261bb0e5a102d87eed55`, passed the repository's TypeScript/Next.js production build workflow and secret scan. The current navigation refinement must receive its own checks. Browser/device validation, automated accessibility scanning, and complete screen-by-screen review remain release gates.

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
| P0 | Accessibility across all screens | Full product-wide keyboard, accessible-name, focus-order, contrast, error-announcement, zoom/text-scaling and screen-reader audit is not complete. | Run an automated accessibility scan on key routes and manually test keyboard + screen reader; record route, browser, viewport and outcomes. |
| P1 | Mobile navigation | Primary navigation was crowded. It is now reduced to Home, Marketplace, Post a Job and Vehicles; secondary links are in More. Active-page state, safe-area padding, touch sizing and Escape handling exist. Recent refinement gives More links an accessible group name and only returns focus when Escape closes an open menu. | At 320, 375, 430 and 700 px; test keyboard, touch, active routes, India-only Requirements, safe area, page-content obstruction and Escape focus return. Current refinement's CI is pending. |
| P1 | Jobs / marketplace lifecycle | Dense filters and lifecycle actions risk unclear hierarchy. Filters expose group/pressed semantics. Loading, failure, empty, success and destructive-action messaging still need a full announcement/recovery audit. | Test every status and owner/driver role; confirm messages are announced, actions are understandable, destructive actions are confirmed, and retries do not duplicate state changes. |
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
- Mobile More menu: Escape closes an open menu and returns focus to its trigger; the links group now has an accessible name. Current changes are awaiting CI.
- Dashboard: responsive metric-card grid using shared CSS tokens and focus/hover treatment.
- Home greeting: session-derived name with neutral fallback.
- Login: shared responsive authentication layout.
- Jobs filters: labelled group, button types, `aria-pressed`, wrapping and 44px minimum height.
- Signup: progressbar role, min/max/current values and step name.

## Latest automated validation evidence

For commit `aa79714938e15ec2a764261bb0e5a102d87eed55`:
- **TypeScript type-check:** passed in GitHub Actions run `39500380337`.
- **Next.js production build:** passed in the same run.
- **Reliability, health, lifecycle/market guards, supported-market isolation, country matrix, QA runner guard, worker lifecycle/claims, Prisma schema/client, clean-database migrations, staging-schema migrations, and read-only QA cleanup inventory:** passed in the same workflow.
- **Repository/history secret scan:** passed in run `39500380377`.
- **Automated accessibility scan:** not yet evidenced.
- **Browser/device visual and keyboard review:** not yet performed.
- **Full route-by-route QA:** not yet evidenced; existing CI contracts do not substitute for the complete design audit.
- **Current navigation refinement:** new commit(s) after `aa79714938e15ec2a764261bb0e5a102d87eed55`; must pass their own typecheck/build and secret scan before calling them validated.

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
