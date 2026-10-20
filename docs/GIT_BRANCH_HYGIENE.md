# Git branch hygiene and integration review

**Reviewed:** 2026-10-21  
**Repository:** `Post2Drive/post2drive-app`  
**Review branch:** `design/apple-hig-foundation`  
**Default branch:** `main`

## Snapshot

- 50 remote branches were visible at review time.
- 7 pull requests were open; all were unmerged.
- PR #41 (`design/apple-hig-foundation`) is the product-wide design/accessibility and account-lifecycle review branch. Its diff against `main` is 36 files.
- PR #12 (`feature/country-localisation-audit`) is a separate, large integration track: 115 changed files, 312 commits reported by GitHub, and GitHub currently reports it as not mergeable.
- The open PRs form a dependency chain. Treating all branches as independent, or simply changing their bases, can drop changes or create misleading diffs.

## Open pull requests and dependency order

| PR | Head | Base | Current review note |
|---|---|---|---|
| #12 | `feature/country-localisation-audit` | `main` | Draft; GitHub reports not mergeable. Needs a real integration/conflict-resolution pass and combined checks. |
| #34 | `fix/qa-runner-market-narrowing` | `feature/country-localisation-audit` | QA-runner fix stacked on #12. |
| #35 | `fix/user-side-market-workflows-audit` | `feature/country-localisation-audit` | User-side market workflow fixes stacked on #12. |
| #37 | `fix/ops-dashboard-evidence-integrity` | `feature/country-localisation-audit` | Ops evidence fixes stacked on #12. |
| #39 | `audit/security-ux-hardening-2026-10` | `fix/user-side-market-workflows-audit` | Security changes stacked on #35. |
| #40 | `fix/account-lifecycle-race-session-revocation` | `audit/security-ux-hardening-2026-10` | Account lifecycle/session changes stacked on #39. |
| #41 | `design/apple-hig-foundation` | `main` | Draft; app-wide UI/accessibility and lifecycle changes under review. |

Keep the base branches used by open PRs until the dependent PRs have been safely integrated or explicitly retargeted after review. Do not merge the stack in an arbitrary order.

## Product-wide coverage for PR #41

The design branch's rendered browser suite covers all 21 page routes present in its tree, including public/legal pages, dashboard, marketplace, job posting/edit/incidents, vehicles, payments, requirements, settings, profile, and admin pages. It exercises authenticated and public states at 320, 390, 768 and 1440 CSS-pixel widths, with axe checks, overflow detection and keyboard skip-link checks. The suite also covers selected wizard focus, mobile More-menu Escape behavior, marketplace retry recovery, populated job/vehicle/payment fixtures and cross-market profile privacy.

Coverage in CI is not yet evidence of a pass: the latest Validate, Security Scan and Android workflow runs for `f8414c4ba4fa09fb9ad8f5bc1fbd080e7970cd4d` were queued at the time of this review. Manual screen-reader and real-device checks remain release gates.

## Cleanup candidates requiring verification

The following groups look like historical checkpoints or overlapping work, but branch names alone do **not** prove they are safe to delete:

- Account lifecycle checkpoints: `audit/account-lifecycle-race-session-revocation`, `audit/account-lifecycle-race-session-revocation-final`, `audit/account-lifecycle-race-session-revocation-final2`, `audit/account-lifecycle-race-session-revocation-final3`, `audit/account-lifecycle-race-session-revocation-rerun`.
- Staging-document checkpoints: `docs/finalise-staging-deploy-wording`, `docs/reconcile-railway-staging`, `docs/staging-status-final-sync`.
- QA-builder styling checkpoints: `fix/qa-builder-dashboard-styles`, `fix/qa-builder-dashboard-styles-pr`.
- Alternative design track: `design/vibrant-colour-system`.

The comparison of `audit/account-lifecycle-race-session-revocation-final3` to `fix/account-lifecycle-race-session-revocation` found 15 additional commits and unique password-reset/token-hashing files on the latter branch. These lifecycle branches are therefore **not interchangeable duplicates**. The QA-builder styling branches are also diverged and contain changes across QA campaigns, the internal admin bridge, the ops dashboard and QA runner. Do not delete either group merely to reduce the branch count.

## Safe consolidation procedure

1. Keep `main` unchanged while integration is unresolved.
2. Resolve PR #12's real Git conflicts in a dedicated integration branch using a full Git checkout, not by changing the PR base or copying whole files between branches.
3. Integrate and validate the #34/#35/#37 fixes against that resolved base; then rebase/retarget #39 and #40 only after their dependencies are verified.
4. Keep #41 as an independent design/accessibility PR unless a reviewed integration branch is created and combined checks pass. Its shared UI changes must not overwrite market-localisation, pricing, QA or operational behavior from the other track.
5. For each branch proposed for retirement, verify that no open PR uses it as a head or base, compare its tree and unique commits with the final integrated tree, preserve any unique work, and only then delete it.
6. Require current-head typecheck/build, security scan, QA contracts, browser accessibility, account lifecycle/session tests and Android smoke results before considering merge. Manual screen-reader and real-device review must also be recorded.
7. Obtain explicit authorization before any merge, default-branch change, remote branch deletion or deployment.

## Actions taken

- Inventory and dependency relationships recorded for repeatable review.
- No branch was deleted, renamed, force-updated or merged.
- No deployment or destructive QA was performed.
