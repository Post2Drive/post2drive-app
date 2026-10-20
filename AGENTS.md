# Agent guidance

## Product-wide design standard

For every UI/UX task, design review, visual change, or front-end refactor in Post2Drive, read and apply the Apple Design Skill at `.agents/skills/apple-design/SKILL.md`. After checkout, initialize submodules with `git submodule update --init --recursive` if the skill directory is absent. The skill is a design standard for transferable principles; Post2Drive is a Next.js web application with an Android/Capacitor target, so do not impose native-iOS-only conventions where they do not fit the platform.

Before a review or substantial UI change, read the skill's required references:
- `references/hig/accessibility.md`
- `references/hig/layout.md`
- `references/hig/typography.md`
- `references/hig/color.md`
- `references/cross-platform.md`

Then load 3–6 additional references relevant to the screens and controls being changed. Cite the reference file and heading for guideline-based recommendations.

Use the principles Purpose, Agency, Responsibility, Familiarity, Flexibility, Simplicity, Craft, and Delight. Prioritize accessibility failures as Critical; evaluate hierarchy, responsive behavior, touch targets, keyboard access, focus visibility, contrast, text scaling, empty/loading/error states, and reduced-motion behavior.

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
- Accessibility: `.agents/skills/accessibility-review/SKILL.md` plus the Apple Design Skill.
- Incident postmortems: `.agents/skills/root-cause-analysis/SKILL.md`

Do not claim tests passed without evidence. Never merge, deploy, change the default branch, or delete/force-update branches without explicit user approval.
