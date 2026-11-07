---
phase: 07-hardening-community-release
plan: 01
subsystem: infra
tags: [vite, build-plugin, licence-compliance, csp, zod, playwright, footer]

# Dependency graph
requires:
  - phase: 06-hyperspace-navigation-persistence
    provides: the shipped single-page shell, the docked footer and the probe-driven e2e harness
provides:
  - NOTICE, LICENSE and ASSETS.md emitted byte-identical into dist/ by a build plugin
  - One footer with the release version, the three document links, the source link and the unchanged disclaimer
  - Release title Wegolite 0.1.0 pinned from package.json across page, overlay, preview smoke and contract tests
  - Same-origin Content-Security-Policy meta tag enforced in the shipped page, with a data: favicon
  - zod runs without JIT so the strict policy refuses no probe
affects: [07-08 request-listener network guard, 07-09 Firefox CSP check, 07-10 README release title]

# Actuals (#2632) — chars/4 over the realized diff of this plan's commits
actuals:
  tokens: 4877
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Build plugin emits repository-root licence documents with emitFile, never via public/"
    - "Strict CSP meta tag; zod jitless set before any schema is constructed"

key-files:
  created:
    - src/app/zod-csp.ts
    - tests/e2e/compliance-shipped.spec.ts
  modified:
    - vite.config.ts
    - index.html
    - scripts/smoke-preview.sh
    - src/main.ts
    - tests/compliance.test.ts
    - tests/contract/container-contract.test.ts
    - .planning/PROJECT.md

key-decisions:
  - "Licence documents ship through shipComplianceDocs() using emitFile with an explicit fileName; Vite 8.3.5 accepted it, so the closeBundle copy fallback was not needed"
  - "The CSP is a meta tag: script-src 'self', connect-src 'self', object-src 'none', base-uri 'none', no remote origin and no unsafe-eval; style-src keeps 'unsafe-inline' for the inline stylesheet"
  - "zod is set to jitless in src/app/zod-csp.ts, the first import of src/main.ts, because zod's new Function('') probe is refused by the policy and reported as a securitypolicyviolation"
  - "The release title is the literal Wegolite 0.1.0 in index.html and the smoke script; tests/contract derives it from package.json, so a version bump fails the pins until all three agree"
  - "Playwright's own evaluate runs under the policy without bypassCSP, so playwright.config.ts is unchanged"

patterns-established:
  - "Compliance documents are read from the repository root by path relative to vite.config.ts, never from process.cwd()"
  - "Shipped-page proofs run against vite preview in tests/e2e/compliance-shipped.spec.ts after npm run build"

requirements-completed: [QUAL-07, QUAL-08]

coverage:
  - id: D1
    description: "NOTICE, LICENSE and ASSETS.md are served byte-identical from the build output"
    requirement: "QUAL-07"
    verification:
      - kind: e2e
        ref: "tests/e2e/compliance-shipped.spec.ts#the built site serves NOTICE, LICENSE and ASSETS.md byte-for-byte"
        status: pass
    human_judgment: false
  - id: D2
    description: "The single footer shows Wegolite 0.1.0, links the three documents and the source, and keeps the disclaimer"
    requirement: "QUAL-07"
    verification:
      - kind: e2e
        ref: "tests/e2e/compliance-shipped.spec.ts#the shipped footer links the licence documents and the source"
        status: pass
      - kind: unit
        ref: "tests/compliance.test.ts#ships one footer that links the licence documents and the source"
        status: pass
    human_judgment: false
  - id: D3
    description: "Document title, #title overlay, preview smoke and contract pins agree on Wegolite 0.1.0 derived from package.json"
    requirement: "QUAL-07"
    verification:
      - kind: unit
        ref: "tests/compliance.test.ts#titles the document with the release version from package.json"
        status: pass
      - kind: unit
        ref: "tests/contract/container-contract.test.ts#FOUND-02 production preview"
        status: pass
      - kind: command
        ref: "sh scripts/smoke-preview.sh"
        status: pass
    human_judgment: false
  - id: D4
    description: "The shipped page refuses a cross-origin connection with a connect-src violation"
    requirement: "QUAL-08"
    verification:
      - kind: e2e
        ref: "tests/e2e/compliance-shipped.spec.ts#the CSP blocks a cross-origin connection from the shipped page"
        status: pass
      - kind: unit
        ref: "tests/compliance.test.ts#content security policy"
        status: pass
    human_judgment: false
  - id: D5
    description: "Booting to flight raises no CSP violation and the full Chromium suite stays green under the policy"
    requirement: "QUAL-08"
    verification:
      - kind: e2e
        ref: "tests/e2e/compliance-shipped.spec.ts#booting to flight raises no CSP violation"
        status: pass
      - kind: e2e
        ref: "docker compose run --rm e2e (80 passed)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The footer and title make no browser-support claim (D-07)"
    requirement: "QUAL-07"
    verification:
      - kind: unit
        ref: "tests/compliance.test.ts#keeps browser claims out of the footer and keeps a single footer element"
        status: pass
    human_judgment: true
    rationale: "The test pins only the absence of Safari, WebKit and macOS; whether the wording claims support for any other browser is a judgment, and the plan flags this prohibition for human review"

# Metrics
duration: ~40min (approximate; start time was not recorded, estimated from commit timestamps 21:04Z to 21:40Z)
completed: 2026-11-07
status: complete
---

# Phase 07 Plan 01: Shipped licence documents, release title and enforced CSP Summary

**Build ships NOTICE, LICENSE and ASSETS.md byte-identical with one linked footer, Wegolite 0.1.0 pinned from package.json, and a same-origin CSP enforced by the browser with zod running jitless**

## Performance

- **Duration:** approximately 40 min (start time not recorded at plan start; estimated)
- **Started:** approximately 2026-11-07T21:05Z
- **Completed:** 2026-11-07T21:40Z (last task commit bcd6f43)
- **Tasks:** 3
- **Files modified:** 9 (2 created)

## Accomplishments

- `npm run build` writes NOTICE, LICENSE and ASSETS.md into dist/ from the repository root; `cmp` confirms they match the committed files and public/ holds none of them.
- The page has one footer: `Wegolite 0.1.0`, links to ./NOTICE, ./LICENSE, ./ASSETS.md and the source repository, above the unchanged non-affiliation disclaimer. The links are clickable; the footer stays click-through elsewhere.
- The document title and #title overlay read `Wegolite 0.1.0`; the old development marker is gone from index.html, scripts/smoke-preview.sh and tests/contract/container-contract.test.ts.
- A Content-Security-Policy meta tag with `connect-src 'self'`, `script-src 'self'` and `object-src 'none'` is enforced: a cross-origin fetch raises a `connect-src` violation, and booting to flight raises none.
- The full Chromium suite (80 tests) passes under the policy.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end licence shipping** - `1688ee2` (feat)
2. **Task 2: Release title Wegolite 0.1.0 (D-06)** - `eb7193a` (feat)
3. **Task 3: CSP meta tag, data: favicon, zod jitless (D-04)** - `bcd6f43` (feat)

**Plan metadata:** recorded in the docs commit that adds this file, STATE.md and ROADMAP.md (see Self-Check).

## Files Created/Modified

- `vite.config.ts` - `shipComplianceDocs()` build plugin (name `wegolite-compliance-docs`, `apply: "build"`) emitting the three repository-root documents
- `index.html` - release title and overlay, footer block with four links, footer CSS (`body > footer p`, `body > footer a`), CSP meta tag, `data:` favicon link
- `src/app/zod-csp.ts` (new) - `config({ jitless: true })` before any schema is built
- `src/main.ts` - imports `./app/zod-csp.js` first
- `tests/e2e/compliance-shipped.spec.ts` (new) - four post-build tests: byte-for-byte documents, footer links, cross-origin CSP violation, no violation booting to flight
- `tests/compliance.test.ts` - title version pin, single-footer and footer-link pins, no browser-claim check, content-security-policy describe
- `tests/contract/container-contract.test.ts` - FOUND-02 marker derived from `PackageManifest.version`
- `scripts/smoke-preview.sh` - greps the literal `Wegolite 0.1.0` with `grep -qF`
- `.planning/PROJECT.md` - Key Decisions row for the CSP and jitless zod decision

## Decisions Made

- The licence documents use `emitFile` with an explicit `fileName`; the `closeBundle` copy fallback named in the plan was not needed.
- The CSP keeps `style-src 'unsafe-inline'` for the inline stylesheet and `img-src 'self' data: blob:`; no remote origin and no eval keyword is permitted.
- zod runs jitless. Its `Function("")` capability probe is refused by the policy; `jitless` is the path zod's own source comment names for strict CSPs.
- `playwright.config.ts` is unchanged: Playwright's page evaluation runs under the policy without `bypassCSP`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] zod's eval probe was refused by the shipped CSP**
- **Found during:** Task 3 (booting-to-flight CSP test)
- **Issue:** The built bundle reported `script-src` violation `blocked=eval` at the zod capability probe `Function("")` (zod 4.6.7, `util.js` `allowsEval`). zod catches the throw, but the browser still reports the violation, and the Chromium console logs a refusal. The plan's contingency covered only Playwright evaluation and same-origin asset refusals, not this.
- **Fix:** Added `src/app/zod-csp.ts` calling `config({ jitless: true })`, imported first in `src/main.ts` so it runs before the content schemas are built. No `unsafe-eval` and no origin was added to the policy.
- **Files modified:** src/app/zod-csp.ts (new), src/main.ts, .planning/PROJECT.md (decision row)
- **Verification:** `compliance-shipped.spec.ts` 4/4 pass; full Chromium suite 80/80; `vitest` 1138/1138; `typecheck` and `lint` pass.
- **Committed in:** bcd6f43 (Task 3)

**2. [Formatting] Prettier reflow of the footer and new spec**
- **Found during:** Task 3 (`lint` gate)
- **Issue:** `prettier --check` flagged index.html and tests/e2e/compliance-shipped.spec.ts.
- **Fix:** `prettier --write` in the lint container; formatting only.
- **Committed in:** bcd6f43 (Task 3)

**Total deviations:** 2 (1 blocking auto-fix, 1 formatting). **Impact:** The CSP is stricter than the plan's minimum-widening contingency required, and the core boot is unaffected; no policy relaxation was needed.

## Issues Encountered

- **Plan grep baseline for `<footer`:** the plan states `rg -c "<footer" index.html` prints 1 at HEAD. It prints 2 at HEAD and now, because a pre-existing CSS comment at index.html:379 contains the literal `<footer>`. The single-footer invariant is pinned with a line-start match (`^ *<footer\b`), which counts exactly 1. No markup was changed to satisfy the grep.
- **Plan-level PLAN_HEAD ledger:** the `0c` commit ledger was not written before the first task commit. The base is reconstructed as `20fb7f5` (HEAD before the first task commit, from `git log`), and `commits` is measured as `git rev-list --count 20fb7f5..HEAD`.
- **Preview smoke:** the first `curl` attempts reset while the preview container built; the script's retry loop absorbed this and the smoke passed.

## User Setup Required

None - no external service configuration required.

## Self-Check: PASSED

- Files exist: all 10 created or modified paths listed above, and this SUMMARY.
- Commits exist on main: `1688ee2`, `eb7193a`, `bcd6f43`.
- Verification run in the containers (results):
  - `docker compose run --rm test npx vitest run tests/compliance.test.ts tests/contract/container-contract.test.ts`: 29 passed.
  - `docker compose run --rm test` (full unit and integration): 90 files, 1138 tests passed.
  - `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/compliance-shipped.spec.ts"`: 4 passed.
  - `docker compose run --rm e2e` (full Chromium suite under the CSP): 80 passed, exit 0.
  - `docker compose run --rm typecheck`: exit 0.
  - `docker compose run --rm lint`: exit 0 after prettier formatting.
  - `sh scripts/smoke-preview.sh`: "preview smoke: 4173 served the production bundle", exit 0.
  - Host checks: `cmp` of dist/NOTICE, dist/LICENSE and dist/ASSETS.md against the root files passed; public/ holds none of them.

## Next Phase Readiness

- 07-08 (request-listener network guard) builds on the CSP and footer proven here; QUAL-08 is only half-covered by this plan (browser-enforced half).
- 07-09 (Firefox) must confirm the CSP meta tag on Firefox (research assumption A6, Firefox half).
- 07-10 (README release title) can rely on `Wegolite 0.1.0` as the single source in package.json.

---
*Phase: 07-hardening-community-release*
*Completed: 2026-11-07*
