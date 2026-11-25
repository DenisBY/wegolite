---
phase: quick-261125-oyp
plan: 01
subsystem: ci
tags: [github-actions, hardening, supply-chain, least-privilege]
status: complete
requires: []
provides:
  - SHA-pinned actions in all three workflows
  - persist-credentials false on every checkout
  - Pages write and OIDC scoped to the deploy job
affects: [.github/workflows/audit.yml, .github/workflows/verify.yml, .github/workflows/pages.yml, .github/dependabot.yml]
key-files:
  modified:
    - .github/workflows/audit.yml
    - .github/workflows/verify.yml
    - .github/workflows/pages.yml
    - .github/dependabot.yml
decisions:
  - "Pin to full commit SHAs with a trailing `# vX.Y.Z` comment so Dependabot moves SHA and comment together"
  - "build job gets pages: read (configure-pages GET), only deploy gets pages: write + id-token: write"
  - "CHANGELOG.md left untouched: CI-internal change, AGENTS.md allows omitting internal-only changes"
commits: 3
plan_head_before: c58ed48d68af60f1761e0fee8056f2ad9be2db04
plan_head_after: 1f64ef8abc1c687d84a2c6aab028cf1200ba79c4
actuals:
  tokens: 6000
  tasks: 3
  commits: 3
---

# Phase quick-261125-oyp Plan 01: Harden GitHub Actions workflows Summary

All 8 `uses:` lines in the three workflows are pinned to full commit SHAs, every checkout sets `persist-credentials: false`, and Pages write plus OIDC now exist only in the `deploy` job.

## Commits

| Task | Commit | Files |
| ---- | ------ | ----- |
| 1 (tracer) audit.yml | d5f1c5a9 | .github/workflows/audit.yml |
| 2 verify.yml + dependabot note | 56335461 | .github/workflows/verify.yml, .github/dependabot.yml |
| 3 pages.yml | 1f64ef8a | .github/workflows/pages.yml |

## git ls-remote check (precondition, run at execution time)

All five matched the plan's pin table exactly:

| Action | Tag | SHA |
| ------ | --- | --- |
| actions/checkout | v7.0.1 | 3d3c42e5aac5ba805825da76410c181273ba90b1 |
| actions/upload-artifact | v7.0.2 | cf430e030ddbb5b0abf93d22962f4752f3646cd9 |
| actions/configure-pages | v6.0.0 | 45bfe0192ca1faeb007ade9deae92b16b8254a0d |
| actions/upload-pages-artifact | v5.0.0 | fc324d3547104276b827a68afc52ff2a11cc49c9 |
| actions/deploy-pages | v5.0.1 | 368f82528645a54fb793d4d04e342629a3f51346 |

## Gate values (all hit EXPECT)

- persist-credentials: audit.yml 1, verify.yml 2, repo-wide 4
- unpinned `uses:` repo-wide 0; pinned `uses:` 8; verify.yml exact pins 3
- pages.yml: top-level `pages|id-token` keys 0; top-level block exactly `contents: read` (1); build block (1); deploy block (1); `permissions:` lines 3
- lines removed from workflows vs c58ed48d: 10, all of them `uses: actions/` lines or the two top-level Pages write lines
- dependabot.yml: 1 changed line (added comment), "commit SHA" matches 1
- `prettier --check .github` green after each task; full `docker compose run --rm lint` green after Task 3
- `git log c58ed48d..HEAD -- .github` lists exactly the three task commits; `git diff --name-only` outside `.planning` lists only the four planned files

## Deviations from Plan

None. One formatting choice: the dependabot.yml note is a single (long) comment line, because the plan's gate requires exactly one changed line and one "commit SHA" match.

## CHANGELOG

CHANGELOG.md untouched. These are CI-internal changes with no user-visible or released behaviour, so AGENTS.md ("Internal-only changes ... may be omitted") allows leaving them out, as earlier CI commits 9d7db779, 73d10ad4 and c40a021b did.

## Known Stubs

None.

## Threat Flags

None. T-oyp-01 to T-oyp-03 mitigated as planned; T-oyp-04 accepted (see rollback below).

## Post-push confirmation (owner)

These workflows only run on GitHub. After pushing:

- `gh run list --workflow verify --limit 1` and `gh run list --workflow audit --limit 1` prove the pinned checkout. The pinned upload-artifact runs only when a Chromium shard fails, so a green run does not exercise it.
- `gh run list --workflow pages --limit 1` proves the permission split; the pages run follows the verify run on main. `gh workflow run pages` republishes main by hand.
- On failure, `gh run view <id> --log-failed`. For pages, apply the T-oyp-04 rollback: if configure-pages or deploy-pages fails with a 403, revert commit 1f64ef8a and report to the owner. Do not widen scopes without owner approval.

## Self-Check: PASSED

- .github/workflows/audit.yml, verify.yml, pages.yml, dependabot.yml: present and modified
- Commits d5f1c5a9, 56335461, 1f64ef8a: present in history on main
