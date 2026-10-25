# Project-local agent skills

These skills live under `.agents/skills/` so they stay out of normal product UI and are discoverable by compatible coding agents. `AGENTS.md` makes the relevant skills part of the default workflow; agents should load them when their descriptions match the task rather than dumping every file into context.

## Entry point

- `codex-workflow`: project-wide routing, evidence-based verification, and branch/deploy safeguards.

## Installed specialist skills

- `nextjs-review`, `react-review` — [yldgio/codereview-skills](https://github.com/yldgio/codereview-skills)
- `debugging`, `code-review`, `security-analysis`, `test-driven-development`, `integration-testing`, `browser-testing`, `root-cause-analysis`, `accessibility-review` — [arjunprabhulal/agent-skills](https://github.com/arjunprabhulal/agent-skills)
- `emil-design-eng` — [emilkowalski/skills](https://github.com/emilkowalski/skills), pinned in this repository as a reviewed skill snapshot

Each imported upstream skill includes its source URL at the bottom. These are snapshots, not auto-updating vendor dependencies; review upstream changes and security before refreshing them.

## Codex compatibility

This project uses the standard `AGENTS.md` plus `.agents/skills/<skill-name>/SKILL.md` layout. The old `openai/skills` repository is not copied wholesale. Codex-specific instructions and the supported skill format should be kept aligned with the current official documentation: https://developers.openai.com/codex/skills/

## Operating principle

Skills are automatically selected by task relevance, not blindly run all at once. The workflow entry point is always applicable to substantive coding work; specialist skills are loaded for matching tasks. The Emil Design Engineering skill is mandatory for UI/UX work; the accessibility-review skill remains a separate required baseline.
