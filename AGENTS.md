# Agent guidance

## Product-wide design standard

For every UI/UX task, design review, visual change, or front-end refactor in Post2Drive, read and apply the Apple Design Skill at `.agents/skills/apple-design/SKILL.md`. The skill is a design standard for transferable principles; Post2Drive is a Next.js web application with an Android/Capacitor target, so do not impose native-iOS-only conventions where they do not fit the platform.

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
