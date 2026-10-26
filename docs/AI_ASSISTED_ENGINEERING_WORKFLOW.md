# AI-Assisted Engineering Workflow

**Status:** Proposed workflow adaptation  
**Scope:** Development and QA only; this document does not authorize merges, deployments, production data access, or autonomous changes.

This adopts selected ideas from three public projects by Andrej Karpathy as lightweight practices, not as runtime dependencies:

- [autoresearch](https://github.com/karpathy/autoresearch) — controlled, measurable improvement loops.
- [rendergit](https://github.com/karpathy/rendergit) — convenient whole-repository context for code review.
- [llm-council](https://github.com/karpathy/llm-council) — independent model critiques and synthesis.

These are adaptations for Post2Drive, not official integrations or endorsements.

## 1. Autoresearch-inspired QA experiments

Use for a measurable improvement or a reproducible defect: API performance, marketplace workflow correctness, accessibility, signup, regression failures, or QA-runner reliability.

1. Start from a named commit and confirm the working tree/branch is isolated.
2. State one hypothesis and one primary metric before editing.
3. Record the baseline and exact test command, environment, dataset/pool size, and relevant configuration.
4. Make one bounded change per experiment; avoid mixing unrelated fixes.
5. Run the same checks against the same conditions. Record failures and uncertainty; do not treat a flaky or incomplete run as a pass.
6. Keep a change only when the evidence supports the hypothesis and required regression/security checks still pass. Otherwise revert the experiment or leave it explicitly unresolved.
7. Summarize the result in the PR with commit SHA, commands, outcome, and limitations.

**Safety boundaries:** experiments must use isolated non-production data and authorized environments. No production data, destructive live tests, automatic merge, or automatic deploy. Existing QA Campaign Builder isolation and approval guards remain mandatory.

### Experiment record template

- **Hypothesis:**
- **Baseline commit / branch:**
- **Metric and success threshold:**
- **Environment and dataset:**
- **Commands and baseline result:**
- **Single change tested:**
- **Post-change result:**
- **Regression/security checks:**
- **Decision:** keep / revert / inconclusive
- **Evidence and limitations:**

## 2. Rendergit-inspired repository context

Use a repository-wide rendered view only when a review needs relationships across files—for example, auth/session handling, job lifecycle transitions, market isolation, or a multi-file refactor. For a small isolated change, use targeted file/diff review instead.

- Prefer local or otherwise approved processing of source code.
- Exclude `.env*`, credentials, signing keys, tokens, database URLs, user data, build outputs, and generated artifacts.
- Review the selected file set before sharing a bundle with any external service or model.
- Treat rendered output as review context, not as proof of correctness. Validate conclusions against the current branch and exact diff.

**No dependency added:** rendergit is an optional reviewer utility; it is not part of the Post2Drive runtime or build.

## 3. LLM-Council-inspired independent review

Use selectively for high-risk or cross-cutting PRs: authentication and session revocation, authorization, market/country isolation, payments, privacy/data minimization, concurrency, migrations, and security-sensitive QA tooling.

1. Prepare a concise review brief with the PR diff, expected behavior, constraints, and relevant tests.
2. Ask reviewers independently to identify defects, threat scenarios, missing tests, and regressions before exposing other reviewers' conclusions.
3. Reconcile findings against code and reproducible tests. Record accepted findings and reasoned dismissals.
4. Require human ownership and the repository's normal CI/review gates for the final decision.

- Do not send private source code to an unapproved third-party model/provider.
- Do not include secrets, real customer data, or production credentials in review prompts.
- Model agreement is not a security certification. CI, code inspection, and controlled verification remain authoritative.
- Keep this review manual/on-demand initially; do not add a paid or network-dependent multi-model service to CI.

## Post2Drive release gates remain unchanged

This workflow supplements, and never replaces, the existing validation workflow, QA contracts, CodeQL, security scan, Android/WebView checks, staging verification, or documented launch-readiness gates. A successful unit/contract test does not prove deployed behavior, email delivery, backup/restore, rollback, or production readiness.

No branch is merged and no Railway deployment is triggered by following this document.
