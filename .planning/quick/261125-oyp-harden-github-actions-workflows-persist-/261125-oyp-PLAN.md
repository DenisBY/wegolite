---
phase: quick-261125-oyp
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .github/workflows/audit.yml
  - .github/workflows/verify.yml
  - .github/workflows/pages.yml
  - .github/dependabot.yml
autonomous: true
requirements: [quick-261125-oyp]

estimate:
  tokens: 30000
  raw_tokens: 30000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "Every `uses:` line in .github/workflows names its action by a full 40-hex commit SHA followed by a `# vX.Y.Z` comment, and each SHA equals the commit its upstream patch tag points at (checked with git ls-remote at execution time)"
    - "Every actions/checkout step (verify.yml x2, pages.yml x1, audit.yml x1) sets `persist-credentials: false`, so no job writes the GITHUB_TOKEN into .git/config"
    - "In pages.yml the top-level grant is `contents: read` only; the build job holds `contents: read` + `pages: read`; only the deploy job holds `pages: write` + `id-token: write`"
    - "All four YAML files pass `prettier --check` in the lint container (which also proves they parse)"
    - "Nothing else changes: triggers, concurrency, job graph, steps and commands are untouched; the diff against c58ed48d removes exactly the 8 `uses:` lines and the 2 top-level Pages write lines, and removes nothing from dependabot.yml"
  artifacts:
    - path: .github/workflows/audit.yml
      provides: "SHA-pinned checkout without persisted credentials"
    - path: .github/workflows/verify.yml
      provides: "SHA-pinned checkout (x2) and upload-artifact; no persisted credentials"
    - path: .github/workflows/pages.yml
      provides: "SHA-pinned Pages actions; Pages write and OIDC scoped to the deploy job"
    - path: .github/dependabot.yml
      provides: "One comment line recording that Dependabot updates the SHA pins with their version comment"
  key_links:
    - from: .github/dependabot.yml
      to: .github/workflows/verify.yml
      via: "github-actions ecosystem entry rewrites each SHA pin together with its trailing `# vX.Y.Z` comment"
    - from: .github/workflows/pages.yml
      to: .github/workflows/pages.yml
      via: "job-level `permissions:` on build and deploy replace (not merge with) the top-level `contents: read` set"
---

<objective>
Harden the three GitHub Actions workflows, as approved by the owner after a github-actions-hardening audit:
1. `persist-credentials: false` on every `actions/checkout` step.
2. pages.yml: Pages write and OIDC only in the `deploy` job; top-level `contents: read` only.
3. Every `uses: actions/*@vN` pinned to its full commit SHA with a trailing `# vX.Y.Z` comment.

Purpose: a moved tag can no longer swap the code that runs with the job token. The job token no longer sits in `.git/config`, which `docker compose run` bind-mounts (`.:/app`, compose.yaml `x-workspace`) into containers that run third-party npm code. The Pages build job runs `npm run build`, so it can no longer deploy to Pages or mint an OIDC token.

Output: four edited YAML files and three commits. No source, test or content changes.

CHANGELOG decision: CHANGELOG.md stays untouched. These are CI-internal changes with no user-visible or released behaviour, so AGENTS.md ("Internal-only changes ... may be omitted") allows leaving them out. The earlier CI commits 9d7db779 (action major bumps), 73d10ad4 (audit workflow) and c40a021b (verify concurrency) also left CHANGELOG.md alone.

Gate choice: these are workflow-only YAML changes, so the checks are static: a SHA re-check with `git ls-remote`, rg gates, and prettier in the lint container. No `verify`/`verify-full` run is needed (AGENTS.md gate policy: no browser-facing, render, input, persistence or network-guard code changes). These workflows only really run on GitHub after the owner pushes (see Output).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@AGENTS.md
@.github/workflows/audit.yml
@.github/workflows/verify.yml
@.github/workflows/pages.yml
@.github/dependabot.yml

Grounded facts (measured while planning, 2026-11-25, HEAD c58ed48d68af60f1761e0fee8056f2ad9be2db04):

- Pin table. git ls-remote shows lightweight tags; each major tag and its patch tag point at the same commit, so behaviour does not change:
  - actions/checkout `3d3c42e5aac5ba805825da76410c181273ba90b1` = v7 = v7.0.1
  - actions/upload-artifact `cf430e030ddbb5b0abf93d22962f4752f3646cd9` = v7 = v7.0.2
  - actions/configure-pages `45bfe0192ca1faeb007ade9deae92b16b8254a0d` = v6 = v6.0.0
  - actions/upload-pages-artifact `fc324d3547104276b827a68afc52ff2a11cc49c9` = v5 = v5.0.0
  - actions/deploy-pages `368f82528645a54fb793d4d04e342629a3f51346` = v5 = v5.0.1
- Pin line format: `uses: <owner>/<repo>@<40-hex sha> # vX.Y.Z`, with one space on each side of `#`. Prettier 3.10.1 in the lint container accepts it unchanged; a scratch copy of all target edits passed `prettier --check`.
- Prettier covers `.github/`: lint runs `eslint . && prettier --check .`, and `.prettierignore` does not exclude `.github`. There is no `.prettierrc`, so Prettier uses its defaults.
- Permission sources:
  - configure-pages@v6 (src/api-client.js) calls only `GET /repos/{owner}/{repo}/pages`. It calls POST only when its `enablement` input is true; the default is false, and the action.yml says enablement needs a non-GITHUB_TOKEN token anyway.
  - GitHub's "Permissions required for GitHub Apps" table lists that GET as Pages **read**.
  - upload-pages-artifact is a composite action that tars the site and uploads it with upload-artifact through the Actions runtime token. It needs no GITHUB_TOKEN scope.
  - deploy-pages@v5 (src/internal/api-client.js) calls only `/repos/{owner}/{repo}/pages/deployments*` endpoints. It reads the artifact through the @actions/artifact Twirp client, which uses the runtime token, so it does not need `actions: read`.
  - GitHub Pages docs ("Using custom workflows with GitHub Pages"): the deploy job needs "a minimum of `pages: write` and `id-token: write`".
  - Job-level `permissions:` replaces the top-level set rather than merging with it.
- Nothing in the repo uses git auth after checkout: no `git fetch|push|pull|clone` or token use in scripts, compose.yaml or the workflows. `scripts/audit-release.sh` uses anonymous https ls-remote and is not run by CI.
- The repository is public (DenisBY/wegolite).
</context>

<tasks>

<task type="tracer">
  <name>Task 1 (tracer): audit.yml end to end: re-verify the pin table, pin checkout, drop persisted credentials, pass prettier</name>
  <files>.github/workflows/audit.yml</files>
  <precondition>All five pin-table SHAs still equal the commits their upstream patch tags point at (git ls-remote loop at the start of verify); halt on any mismatch.</precondition>
  <action>
Prove the whole chain on the smallest workflow before repeating it: pin table, then pin format, then persist-credentials, then prettier, then commit.

1. Before editing, re-verify all five SHAs in the context pin table against the exact patch tags with the loop in verify (git ls-remote is a read-only fact check, not a build, so it may run on the host). If any SHA differs, STOP and report the mismatch. Do not substitute a different SHA: the owner approved these exact pins.
2. In .github/workflows/audit.yml, replace the checkout step's `actions/checkout@v7` with `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`.
3. Give that step a `with:` block containing `persist-credentials: false`. Directly above that key, add one comment line, wrapped if needed and indented to match: "No step fetches or pushes with git auth, and compose bind-mounts the workspace into every container, so keep the job token out of .git/config."
4. Change nothing else in the file.
5. Run the verify command, then commit only this file with the message `ci(quick-261125-oyp): pin the audit checkout to a commit SHA, drop persisted credentials`, ending with the Co-Authored-By trailer the session prescribes. Do not push.
  </action>
  <verify>
    <automated>ok=1; for t in checkout:v7.0.1:3d3c42e5aac5ba805825da76410c181273ba90b1 upload-artifact:v7.0.2:cf430e030ddbb5b0abf93d22962f4752f3646cd9 configure-pages:v6.0.0:45bfe0192ca1faeb007ade9deae92b16b8254a0d upload-pages-artifact:v5.0.0:fc324d3547104276b827a68afc52ff2a11cc49c9 deploy-pages:v5.0.1:368f82528645a54fb793d4d04e342629a3f51346; do IFS=: read -r a v s <<< "$t"; got=$(git ls-remote "https://github.com/actions/$a" "refs/tags/$v" "refs/tags/$v^{}" | tail -n1 | cut -f1); [ "$got" = "$s" ] || { echo "MISMATCH $a $v $got"; ok=0; }; done; [ "$ok" = 1 ] && test "$(rg -n '^\s+persist-credentials: false$' .github/workflows/audit.yml | wc -l)" -eq 1 && test "$(rg -n '^\s*- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\.0\.1$' .github/workflows/audit.yml | wc -l)" -eq 1 && docker compose run --rm lint npx prettier --check .github</automated>
    Gate baselines: persist-credentials in audit.yml [HEAD=0 EXPECT==1]; pinned checkout in audit.yml [HEAD=0 EXPECT==1]. The SHA loop is the precondition check, and prettier --check .github is a guard that already passes at HEAD and must stay green; it also proves the YAML parses.
  </verify>
  <done>All five SHAs match their patch tags upstream. audit.yml has the pinned checkout with `persist-credentials: false` and its comment, prettier passes on `.github`, and the change is committed as its own commit (not pushed).</done>
</task>

<task type="auto">
  <name>Task 2: verify.yml pins and persist-credentials; dependabot.yml pin note</name>
  <files>.github/workflows/verify.yml, .github/dependabot.yml</files>
  <action>
Apply the pattern Task 1 proved to verify.yml, then record the pin convention for Dependabot.

1. In .github/workflows/verify.yml:
   - Replace both `actions/checkout@v7` refs (jobs `checks` and `e2e`) with `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`.
   - Replace `actions/upload-artifact@v7` with `actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2`. Keep its existing `if: failure()` and `with:` block as they are.
   - Give each checkout step a `with:` block containing `persist-credentials: false`. Put the same comment line used in Task 1 above the key in the `checks` job only; the `e2e` job gets the bare key.
   - The aggregate `verify` job has no checkout; leave it untouched.
   - Do not touch the header comment, triggers, concurrency, permissions, matrix or run commands.
2. In .github/dependabot.yml, add exactly one comment line, indented two spaces like the existing docker-entry comment, directly above `  - package-ecosystem: github-actions` (after the blank line). Text: "Workflow actions are pinned to full commit SHAs with a trailing `# vX.Y.Z` comment; Dependabot moves the SHA and the comment together." Remove or reword nothing else in that file: the github-actions ecosystem entry already exists and needs no config change.
3. Run the verify command, then commit both files with the message `ci(quick-261125-oyp): pin the verify workflow actions to commit SHAs, drop persisted credentials`, ending with the session's Co-Authored-By trailer. Do not push.
  </action>
  <verify>
    <automated>git cat-file -e 'c58ed48d68af60f1761e0fee8056f2ad9be2db04^{commit}' && test "$(rg -n '^\s+persist-credentials: false$' .github/workflows/verify.yml | wc -l)" -eq 2 && test "$(rg -n '^\s*(- )?uses: ' .github/workflows/verify.yml | rg -v 'uses: actions/[a-z-]+@[0-9a-f]{40} # v[0-9]+\.[0-9]+\.[0-9]+$' | wc -l)" -eq 0 && test "$(rg -o 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\.0\.1$|actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7\.0\.2$' .github/workflows/verify.yml | wc -l)" -eq 3 && test "$(rg -n -i 'commit SHA' .github/dependabot.yml | wc -l)" -eq 1 && test "$(git diff -U0 c58ed48d68af60f1761e0fee8056f2ad9be2db04 -- .github/dependabot.yml | rg '^[+-][^+-]' | wc -l)" -eq 1 && docker compose run --rm lint npx prettier --check .github</automated>
    Gate baselines: persist-credentials in verify.yml [HEAD=0 EXPECT==2]; unpinned `uses:` in verify.yml [HEAD=3 EXPECT==0]; exact pins in verify.yml [HEAD=0 EXPECT==3]; "commit SHA" in dependabot.yml [HEAD=0 EXPECT==1]; changed lines (added plus removed) in dependabot.yml vs c58ed48d [HEAD=0 EXPECT==1]. Together the last two prove the only change is the one added comment line. Prettier is a guard that stays green.
  </verify>
  <done>verify.yml has three SHA-pinned `uses:` lines and two `persist-credentials: false` keys. dependabot.yml gains one comment line and loses nothing. Prettier passes, and the change is committed (not pushed).</done>
</task>

<task type="auto">
  <name>Task 3: pages.yml: scope Pages write and OIDC to deploy, pin the Pages actions, drop persisted credentials</name>
  <files>.github/workflows/pages.yml</files>
  <action>
Edit .github/workflows/pages.yml only. Put every new comment ABOVE its `permissions:` line, never between `permissions:` and its keys: the gates match each block as consecutive lines.

1. Top-level permissions: delete the `  pages: write` and `  id-token: write` lines so the block is just `permissions:` / `  contents: read`.
   - Above `permissions:`, add a comment: "Least privilege: the default is read-only. A job-level `permissions:` block replaces this set (it does not merge), so each job lists every scope it needs."
2. build job: add a job-level block between `timeout-minutes: 30` and `steps:`. It is `permissions:` with exactly two keys in this order: `contents: read`, `pages: read`.
   - Above it, add a comment: "checkout reads the repository. configure-pages reads the Pages site (GET /repos/{owner}/{repo}/pages needs Pages read; it would create a site only with its enablement input on, which stays off). upload-pages-artifact uploads through the Actions runtime token and needs no GITHUB_TOKEN scope. This job runs the npm build, so it gets no write scope and cannot mint an OIDC token."
   - This uses `pages: read` (not none, not write) because the REST permission table lists the configure-pages GET as Pages read.
3. deploy job: add a job-level block between `runs-on: ubuntu-latest` and `environment:`. It is `permissions:` with exactly two keys in this order: `pages: write`, `id-token: write`. Do not add `contents: read`: deploy-pages checks out nothing and reads the artifact through the runtime token.
   - Above it, add a comment: "Only this job publishes: deploy-pages creates the Pages deployment (Pages write) and proves its origin with an OIDC token (id-token write). It checks out nothing, so it gets no contents scope."
4. Pins:
   - `actions/checkout@v7` becomes `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`.
   - `actions/configure-pages@v6` becomes `actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d # v6.0.0`.
   - `actions/upload-pages-artifact@v5` becomes `actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9 # v5.0.0`.
   - `actions/deploy-pages@v5` becomes `actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346 # v5.0.1`. Keep its `id: deployment` line above it.
5. The checkout step already has a `with:` block with `ref:` and its comment. Add `persist-credentials: false` after the `ref:` line, with the same one-line comment as Task 1 directly above the key.
6. Leave the triggers, the `if:` expression, concurrency, environment, `url:`, the build command and the `path: dist` input unchanged.
7. Run the verify command (it includes the repo-wide final gates), then commit with the message `ci(quick-261125-oyp): scope Pages write and OIDC to the deploy job, pin the Pages actions`, ending with the session's Co-Authored-By trailer. Do not push.
  </action>
  <verify>
    <automated>W=.github/workflows; git cat-file -e 'c58ed48d68af60f1761e0fee8056f2ad9be2db04^{commit}' && test "$(rg -n '^  (pages|id-token):' $W/pages.yml | wc -l)" -eq 0 && test "$(rg -U -c '^permissions:\n  contents: read\n[^ ]' $W/pages.yml)" -eq 1 && test "$(rg -U -c '^    permissions:\n      contents: read\n      pages: read\n    [a-z]' $W/pages.yml)" -eq 1 && test "$(rg -U -c '^    permissions:\n      pages: write\n      id-token: write\n    [a-z]' $W/pages.yml)" -eq 1 && test "$(rg -n '^\s*permissions:' $W/pages.yml | wc -l)" -eq 3 && test "$(rg -n '^\s+persist-credentials: false$' $W | wc -l)" -eq 4 && test "$(rg -n '^\s*(- )?uses: ' $W | rg -v 'uses: [a-z0-9-]+/[a-z0-9-]+@[0-9a-f]{40} # v[0-9]+\.[0-9]+\.[0-9]+$' | wc -l)" -eq 0 && test "$(rg -n '^\s*(- )?uses: actions/[a-z-]+@[0-9a-f]{40} # v[0-9]+\.[0-9]+\.[0-9]+$' $W | wc -l)" -eq 8 && test "$(git diff -U0 c58ed48d68af60f1761e0fee8056f2ad9be2db04 -- $W | rg '^-[^-]' | wc -l)" -eq 10 && test "$(git diff -U0 c58ed48d68af60f1761e0fee8056f2ad9be2db04 -- $W | rg '^-[^-]' | rg '^-\s+(- )?uses: actions/|^-  (pages|id-token): write$' | wc -l)" -eq 10 && docker compose run --rm lint npx prettier --check .github</automated>
    Gate baselines:
    - top-level Pages/OIDC keys [HEAD=2 EXPECT==0]
    - top-level block is exactly `contents: read` [HEAD=0 EXPECT==1]
    - build block [HEAD=0 EXPECT==1]
    - deploy block [HEAD=0 EXPECT==1]
    - `permissions:` lines in pages.yml [HEAD=1 EXPECT==3]
    - persist-credentials repo-wide [HEAD=0 EXPECT==4]
    - unpinned `uses:` repo-wide [HEAD=8 EXPECT==0]
    - pinned `uses:` repo-wide [HEAD=0 EXPECT==8]
    - lines removed from workflows vs c58ed48d [HEAD=0 EXPECT==10]
    - removed lines that are `uses:` or top-level Pages-write lines [HEAD=0 EXPECT==10]; with the previous gate this proves no other line was removed
    - prettier is a guard that stays green
    - All gates were dry-run against a scratch copy of the target state while planning; each hit its EXPECT value.
  </verify>
  <done>pages.yml grants `contents: read` at top level, `contents: read` + `pages: read` to build, and `pages: write` + `id-token: write` to deploy only, each with its reasoning comment. All four Pages-workflow actions are SHA-pinned and checkout has `persist-credentials: false`. The repo-wide gates hold (4 persist-credentials, 8 pinned `uses:`, 0 unpinned, exactly 10 removed lines). Prettier passes, and the change is committed (not pushed).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| runner → third-party action code | `uses:` refs resolve to code from github.com/actions/* that runs with the job's GITHUB_TOKEN |
| checkout workspace → Docker containers | `docker compose run` bind-mounts the checkout, including `.git/config`, into containers that execute npm dependencies |
| pages build job → Pages deploy / OIDC | build runs repository and npm code; deploy publishes the site and mints an OIDC token |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-oyp-01 | Tampering | `uses: actions/*@vN` in all three workflows | medium | mitigate | Pin to full commit SHAs, re-verified against the exact patch tags with git ls-remote in Task 1. A trailing `# vX.Y.Z` lets Dependabot (github-actions ecosystem, already configured) update the pins. |
| T-oyp-02 | Information disclosure | actions/checkout default credential persistence | medium | mitigate | `persist-credentials: false` on all 4 checkout steps, so the token never reaches `.git/config` or the bind-mounted containers. No step uses git auth (verified while planning). |
| T-oyp-03 | Elevation of privilege | pages.yml build job (runs `npm run build`) | high | mitigate | Top level `contents: read`. Build gets `contents: read` + `pages: read` only. Only deploy (no checkout, no npm code) gets `pages: write` + `id-token: write`. |
| T-oyp-04 | Denial of service | pages.yml after the permission split | low | accept | Grounded in the REST permission table and the deploy-pages and configure-pages source. pages.yml only runs on main after a successful verify, so the first post-push run is the real proof. If it fails at configure-pages or deploy-pages with a 403, revert the Task 3 commit and report to the owner. Do not widen scopes without owner approval. |
| T-oyp-SC | Tampering | npm/pip/cargo installs | low | accept | This task installs no packages. Action refs are covered by T-oyp-01. |
</threat_model>

<verification>
- All three task `<automated>` commands pass. Task 3's command doubles as the repo-wide final gate.
- Pipeline safety: every gate that pipes `git` into `wc -l` expects a nonzero count, so a failed `git` (0 lines) fails the gate instead of reading as clean. The `git cat-file -e` prefix also proves the base commit exists. A failed `git ls-remote` gives an empty SHA, which the loop reports as MISMATCH.
- `docker compose run --rm lint` (full eslint + prettier) passes once after Task 3.
- `git log --oneline c58ed48d68af60f1761e0fee8056f2ad9be2db04..HEAD -- .github` lists exactly the three task commits. If another commit touched `.github` since planning, re-base the diff gates on it and say so in the SUMMARY.
- `git diff --name-only c58ed48d68af60f1761e0fee8056f2ad9be2db04 HEAD -- . ':!.planning'` lists only the four files in `files_modified`. CHANGELOG.md is deliberately absent (see objective).
</verification>

<success_criteria>
- 8 of 8 `uses:` lines SHA-pinned with version comments; 0 unpinned.
- 4 of 4 checkout steps set `persist-credentials: false`.
- pages.yml: top `contents: read`; build `contents: read` + `pages: read`; deploy `pages: write` + `id-token: write`; reasoning recorded in YAML comments.
- dependabot.yml: one added comment line, no other change.
- Lint passes in the container; no push, no tag.
</success_criteria>

<output>
Create `.planning/quick/261125-oyp-harden-github-actions-workflows-persist-/261125-oyp-SUMMARY.md` when done. Include:

- the git ls-remote result for the five patch tags;
- the gate values;
- the three commit SHAs;
- the CHANGELOG omission and why.

Add a "Post-push confirmation (owner)" section. These workflows run only on GitHub, so list:

- `gh run list --workflow verify --limit 1` and `gh run list --workflow audit --limit 1` prove the pinned checkout. The pinned upload-artifact runs only when a Chromium shard fails, so a green run does not exercise it.
- `gh run list --workflow pages --limit 1` proves the permission split; the pages run follows the verify run on main. `gh workflow run pages` republishes main by hand.
- On failure, `gh run view <id> --log-failed`; for pages, apply the T-oyp-04 rollback.
</output>
