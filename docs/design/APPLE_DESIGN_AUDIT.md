# Post2Drive design audit and implementation tracker

**Status:** In progress — source review only; browser/device verification and automated checks are still required.

## Scope

Apply the Apple Design Skill as a product-wide design-review standard to the Next.js web app and Capacitor/Android experience. Use transferable HIG principles, not iOS-only UI conventions. Keep product behavior, market separation, authentication, payments, and delivery lifecycle intact.

## First implementation: mobile navigation

### Observed issues in source
- The mobile bottom bar previously displayed every destination at once (7 links, or 8 for India), with 11px labels and narrow flex items.
- The navigation had repeated inline layout styling and no explicit current-page state.
- The fixed bar needs to account for the device safe area and must not obscure page content.

### Changes on this branch
- Reduced the persistent mobile destinations to Home, Marketplace, Post a Job, and Vehicles.
- Moved Payments, Account, Admin, and India-specific My Requirements into a clearly labeled, expandable More menu.
- Added active-page semantics, visible active states, keyboard focus styling, 44px+ menu-row hit areas, safe-area padding, and reduced-motion handling.
- Kept the complete desktop navigation destinations and URL routes unchanged.

### Design references to use when reviewing
- .agents/skills/apple-design/references/hig/accessibility.md — keyboard access, labels, hit regions, contrast.
- .agents/skills/apple-design/references/hig/layout.md — responsive layout and safe areas.
- .agents/skills/apple-design/references/hig/typography.md — readable type hierarchy.
- .agents/skills/apple-design/references/hig/color.md — semantic color and contrast.
- .agents/skills/apple-design/references/hig/tab-bars.md — top-level navigation principles; adapt to the web/Android context.
- .agents/skills/apple-design/references/cross-platform.md — translate platform conventions to this stack.

## Prioritized full-product audit

| Priority | Area | Source-level concern / review target | Required verification |
|---|---|---|---|
| P0 | Accessibility | Audit every interactive screen for keyboard access, focus visibility, accessible names, error announcements, and contrast | Automated accessibility scan plus keyboard/manual checks |
| P1 | Mobile navigation | Validate the More menu, active route, small widths, safe areas, and menu dismissal | Browser/device checks at narrow and large widths; keyboard testing |
| P1 | Dashboard | Dashboard is a large, dense surface with multiple metrics and operational sections | Validate hierarchy around the next action, active work, and exceptions |
| P1 | Job lifecycle | Jobs screen contains many statuses and lifecycle actions | Verify action priority, status clarity, confirmations, and recoverability |
| P1 | Signup and login | Multi-step signup has market-dependent content, validation, and account verification states | Test all steps, keyboard order, field errors, loading and recovery states |
| P1 | Market integrity | Country and currency choices affect available marketplace and pricing behavior | Run country matrix and market-isolation regression tests after UI changes |
| P2 | Design tokens and CSS | Global stylesheet has accumulated repeated responsive/control overrides | Inventory token use first; consolidate incrementally with visual regression coverage |
| P2 | Personalization | Check that greetings and account context derive from the authenticated session | Test signed-in, signed-out, and missing-profile states |
| P2 | Empty/loading/error states | Review listings, dashboard, payments, vehicles, and verification states | Confirm clear next actions and no reliance on color alone |
| P2 | Android wrapper | Check safe-area behavior, viewport sizing, touch ergonomics, and back navigation | Validate on an actual Android/Capacitor build or emulator |

## Release gates

1. Run formatting/lint/typecheck/build commands that are actually defined in the repository and report exact results.
2. Run the relevant QA contracts, including npm run qa:all, after confirming the environment/dependencies support them.
3. Add regression coverage for any changed navigation behavior and verify all mobile navigation routes.
4. Do a browser/device visual review; source inspection alone is not proof of correct rendering.
5. Keep the work on a review branch and open a PR only when the branch is coherent. Do not merge or deploy without explicit authorization.

## Current limitations

- No browser or device render has been inspected for this change.
- No typecheck, build, accessibility scan, or QA suite has been run in this environment yet.
- The initial full-product findings are source-review targets, not confirmed runtime defects.


## Additional implementation progress

- **Personalized welcome:** the signed-in landing screen now uses the authenticated session's display name, with a neutral fallback if it is absent; the hardcoded personal greeting was removed.
- **Dashboard overview:** the metric cards now use a responsive auto-fit grid and shared design tokens, with a consistent hover and keyboard-focus treatment. This is a presentation-only change; the underlying metric queries and destinations are unchanged.
- **Login consistency:** the login form now uses the shared `.auth-page` responsive authentication layout so global field sizing, focus styling, and form surface styles apply consistently.

These are source changes awaiting the current commit's typecheck and secret scan, plus browser/device and broader regression validation. No claim of visual/accessibility conformance is made until those checks are performed.


- **Mobile menu keyboard handling:** Escape now closes the More menu and restores focus to its trigger; the trigger exposes expanded state and popup semantics.
- **Job status filters:** filters are labeled as a group, expose their selected state through `aria-pressed`, wrap on narrow screens, and have a minimum 44px height.
- **Signup progress:** the multi-step progress indicator now exposes the current step, total steps, and step name through progressbar accessibility attributes.

## Additional HIG references applied
- `references/hig/accessibility.md` — Mobility and Cognitive: keyboard operation, focus continuity, meaningful state announcements.
- `references/hig/layout.md` — Visual hierarchy, Adaptability, and Guides and safe areas.
- `references/hig/typography.md` — Ensuring legibility and Conveying hierarchy.
- `references/hig/tab-bars.md` — Best practices for prioritizing primary navigation; adapted to a web/Android bottom navigation pattern rather than copying native iOS UI.
- `references/cross-platform.md` — Translate principles to Post2Drive's web and Capacitor environment.
