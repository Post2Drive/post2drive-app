# Agent guidance

## Product-wide design standard

For every UI/UX task, design review, visual change, or front-end refactor in Post2Drive, read and apply `.agents/skills/emil-design-eng/SKILL.md`. Use Emil Kowalski's design-engineering approach: deliberate restraint, frequency-based animation decisions, explicit timing/easing, interruptible transitions, origin-aware anchored surfaces, responsive pointer behavior, and careful interaction details. Do not add motion just for decoration or copy a platform's visual identity as a substitute for product-specific design.

Keep the shared accessibility and platform baseline: semantic landmarks, keyboard access, visible focus, contrast, target sizing, text scaling, useful loading/empty/error states, and reduced-motion support. These remain mandatory regardless of visual direction. Preserve Post2Drive's established colour semantics and product identity unless a separate approved design change explicitly changes them.

Before a substantial UI change, read the relevant sections of the Emil skill, then load `.agents/skills/accessibility-review/SKILL.md` and the applicable component/browser-testing skill. Cite the specific skill section when explaining design decisions. Review the rendered result at mobile and desktop sizes; source-only review is not proof of conformance.

## Engineering and release safety

- Inspect existing behavior and tests before changing a flow. Prefer small, reviewable changes over wholesale rewrites.
- Preserve market separation, authentication, permissions, payments, delivery lifecycle, and data integrity.
- Add or update regression tests for behavior changes. Report precisely which checks ran and their outcomes; never claim a check passed without evidence.
- Do not merge pull requests, change default branches, deploy, or run destructive production/staging QA without explicit authorization.
- Treat source-only findings as preliminary until verified in a running browser/device.

## Persistent coding skills

For every substantive coding task, follow `.agents/skills/codex-workflow/SKILL.md` and load the specialist skill(s) that match the task. These are project-local instructions and are intended to be used automatically, without the user needing to name a skill.

Routing:
- Unknown failures: `.agents/skills/debugging/SKILL.md`
- Code/PR review: `.agents/skills/code-review/SKILL.md`
- Next.js App Router: `.agents/skills/nextjs-review/SKILL.md`
- React components/hooks: `.agents/skills/react-review/SKILL.md`
- Auth/security/data exposure: `.agents/skills/security-analysis/SKILL.md`
- New behavior/bug fixes: `.agents/skills/test-driven-development/SKILL.md`
- DB/API integration: `.agents/skills/integration-testing/SKILL.md`
- Browser E2E/responsive UI: `.agents/skills/browser-testing/SKILL.md`
- Accessibility: `.agents/skills/accessibility-review/SKILL.md` plus `.agents/skills/emil-design-eng/SKILL.md`.
- Incident postmortems: `.agents/skills/root-cause-analysis/SKILL.md`

Do not claim tests passed without evidence. Never merge, deploy, change the default branch, or delete/force-update branches without explicit user approval.
