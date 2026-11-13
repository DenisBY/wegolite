---
phase: 07-hardening-community-release
plan: 12
subsystem: testing
tags: [vitest, coverage-v8, coverage-thresholds, container, docker, qual-04]

requires:
  - phase: 07-01
    provides: container contract test edited in wave 1 (this plan's contract pin sits on top of it)
  - phase: 07-03
    provides: golden save and route data that the measured coverage baseline includes
provides:
  - "@vitest/coverage-v8 5.0.5 installed in the container image, exact pin, lockfile committed"
  - "v8 coverage over src/sim, src/persistence and src/content, with reports in test-results/coverage"
  - "per-glob coverage thresholds at the floor of the first measured baseline, enforced by docker compose run --rm test"
  - "test script `vitest run --coverage`, pinned by the container contract"
affects: [verify chain, QUAL-04, future coverage-gated plans, 07-09]

# Actuals (#2632) — chars/4 over the realized diff, not a harness token count.
actuals:
  tokens: 3694
  tasks: 3
  commits: 3
plan_head_before: 6453a17da3758205dd0959b2c6bba11b21f9698c
plan_head_after: d8c3f432f0e56659d5c8c8e83cbf205f50435ca1

tech-stack:
  added: ["@vitest/coverage-v8@5.0.5 (exact devDependency)"]
  patterns:
    - "Coverage thresholds are the measured floor per glob, never an invented number; the measured table lives in the config comment"
    - "Glob-keyed thresholds are checked on the aggregate of the matched files (sum covered over sum total)"

key-files:
  created:
    - ".planning/phases/07-hardening-community-release/07-12-SUMMARY.md"
  modified:
    - "package.json"
    - "package-lock.json"
    - "vitest.config.ts"
    - "tests/contract/container-contract.test.ts"
    - "tests/guards/content-boundary.test.ts"
    - "tools/oolite-ingest/drift.test.ts"

key-decisions:
  - "Owner approved the @vitest/coverage-v8@5.0.5 install conditionally on the registry checks; the executor ran those checks in the container before installing and all passed."
  - "src/persistence/idb-store.ts stays out of unit coverage (D-20); fake-indexeddb is not installed."
  - "Thresholds are the floor of each measured aggregate from one unthresholded run on 2026-11-08; no number was invented."

patterns-established:
  - "Provider, script and pins change together: the contract test pins the exact test script string."

requirements-completed: [QUAL-04]

coverage:
  - id: D1
    description: "@vitest/coverage-v8 5.0.5 installed as an exact devDependency in the container, with the lockfile committed"
    requirement: "QUAL-04"
    verification:
      - kind: command
        ref: "docker compose run --rm test npm view @vitest/coverage-v8@5.0.5 (registry checks, see Owner package check below); rg -c '\"@vitest/coverage-v8\": \"5\\.0\\.5\"' package.json = 1"
        status: pass
    human_judgment: true
    rationale: "The package legitimacy decision (D-19) is the owner's trust call. The owner approved it conditionally; the executor verified the registry metadata, and the owner still holds the approval."
  - id: D2
    description: "Unit runs in the container measure v8 coverage and enforce per-glob thresholds at the measured floors"
    requirement: "QUAL-04"
    verification:
      - kind: command
        ref: "docker compose run --rm test (exit 0; coverage table printed; 93 files, 1163 passed, 1 skipped)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The test script runs coverage and the container contract pins it; idb-store.ts stays excluded and fake-indexeddb is absent"
    requirement: "QUAL-04"
    verification:
      - kind: unit
        ref: "tests/contract/container-contract.test.ts#FOUND-03 maps each service to its documented npm script"
        status: pass
      - kind: command
        ref: "rg -c 'fake-indexeddb' package.json (no match); rg -c 'idb-store' vitest.config.ts = 1"
        status: pass
    human_judgment: false

duration: unknown
completed: 2026-11-08
status: complete
---

# Phase 7 Plan 12: Coverage provider and measured thresholds Summary

**v8 coverage at exactly @vitest/coverage-v8 5.0.5 gates src/sim, src/sim/economy, src/sim/hyperspace, src/persistence and src/content at the floor of their first measured baseline, so `docker compose run --rm test` fails when untested core code appears**

## Performance

- **Duration:** not measured (the run resumed after the owner checkpoint; the plan start time was not recorded in this session)
- **Started:** unknown
- **Completed:** 2026-11-08T09:33Z (HEAD `d8c3f43`)
- **Tasks:** 3 of 3 (Task 1 was the owner checkpoint, resolved by approval and registry checks)
- **Files modified:** 6 (plus this SUMMARY)

## Accomplishments

- `@vitest/coverage-v8@5.0.5` is installed as an exact devDependency, inside the container. The image was rebuilt with `--no-cache` and the named volume dropped.
- `vitest.config.ts` has a root `test.coverage` block: provider v8, reporters text and json-summary, reports in `test-results/coverage`, includes over the three source globs, and excludes for `idb-store.ts` (D-20), `src/content/generated/**`, test files and declaration files.
- Five glob-keyed thresholds were set at the floor of the measured baseline, and the full measured table sits in the config comment.
- The `test` script is `vitest run --coverage`, and the container contract pins it.
- Three explicit timeouts were added to tests that timed out under coverage load (see Deviations).

## Owner package check (D-19) — registry results

The owner replied "approved, conditional on the npm checks", and asked the executor to verify the registry itself before installing. All checks ran in the container with read-only `npm view`:

| Check | Result |
|-------|--------|
| `@vitest/coverage-v8@5.0.5` version exists | pass (`version = '5.0.5'`) |
| `repository.url` | pass: `git+https://github.com/vitest-dev/vitest.git` |
| `maintainers` | listed: ariperkkio, antfu, hiogawa, oreanno, yyx990803 |
| `dist.integrity` | `sha512-4KpkGdIrSqBihx/JyP/e+S+IKB98etg1XDQiLAxksLfcShnwi1VReGeOT9NI43hLHbknosKp/1CCLn9Zgcs8mg==`; the lockfile entry carries the same value |
| `peerDependencies` | pass: `{ vitest: '5.0.5', '@vitest/browser': '5.0.5' }` |
| `peerDependenciesMeta` | pass: `@vitest/browser` optional `true`, so no browser package is pulled in |
| `dependencies` | pass, exactly the eight expected names: obug ^3.0.0, std-env ^4.3.0, magicast ^0.5.5, tinyrainbow ^3.2.0, @bcoe/v8-coverage ^1.0.2, ast-v8-to-istanbul ^1.0.7, @vitest/istanbul-lib-report ^1.0.2, @vitest/istanbul-lib-coverage ^1.0.2 |
| `vitest@5.0.5` and `@vitest/browser@5.0.5` exist | pass (both `5.0.5`) |

The install added exactly 12 lockfile packages (the eight above plus their transitive babel, js-tokens and magicast dependencies). No existing entries were removed. The lockfile integrity matches the registry `dist.integrity`.

## Measured baseline (2026-11-08)

Source: one `docker compose run --rm test` with coverage and no thresholds (log at `/tmp/claude-1027/-home-opencode-git-wegolite/47488adf-73f4-4088-8723-7c27b4b0091c/scratchpad/measure-run3.log`; summary at `test-results/coverage/coverage-summary.json`). Each glob is the sum of covered over the sum of total. Thresholds are the floor of each measured percentage.

| Glob | Files | Lines | Statements | Functions | Branches | Thresholds set (lines / stmts / funcs / branches) |
|------|-------|-------|------------|-----------|----------|----------------------------------------------------|
| `src/sim/**/*.ts` | 34 | 93.5697 | 91.8507 | 97.7273 | 86.9988 | 93 / 91 / 97 / 86 |
| `src/sim/economy/**/*.ts` | 4 | 94.1176 | 91.7391 | 100.0000 | 85.8025 | 94 / 91 / 100 / 85 |
| `src/sim/hyperspace/**/*.ts` | 3 | 97.7528 | 97.7778 | 100.0000 | 92.5000 | 97 / 97 / 100 / 92 |
| `src/persistence/**/*.ts` | 4 | 88.7500 | 87.0849 | 85.7143 | 85.5140 | 88 / 87 / 85 / 85 |
| `src/content/**/*.ts` | 15 | 66.8367 | 64.9289 | 57.1429 | 53.3333 | 66 / 64 / 57 / 53 |

Zero-line files observed in the baseline (not gated by a rule in this plan; see Issues Encountered): `src/persistence/store.ts` (types and constants; no runtime importer in unit tests) and `src/content/ships.ts`. No file under `src/sim/economy/**` or `src/sim/hyperspace/**` measured 0% lines, so no direct test was required there.

## Verification (final state, HEAD `d8c3f43`)

| Command | Result |
|---------|--------|
| `docker compose build --no-cache` then `docker compose down --volumes` | pass (image rebuilt; volume dropped) |
| `docker compose run --rm test` (thresholds enforced) | exit 0; 93 files passed, 1163 tests passed, 1 skipped; coverage table printed; All files: stmts 87.96, branch 83.62, funcs 89.43, lines 89.69; no `ERROR: Coverage for` line |
| `docker compose run --rm test npx vitest run tests/contract/container-contract.test.ts tests/compliance.test.ts` | exit 0; 2 files, 32 tests passed |
| `docker compose run --rm lint` | exit 0 (eslint and prettier --check) |
| `docker compose run --rm typecheck` | exit 0 |

Not run in this execution: the full `docker compose run --rm verify` chain (its build and e2e stages). The unit, contract, lint and typecheck stages it contains were run above.

Acceptance greps (Task 2 and Task 3): `"@vitest/coverage-v8": "5.0.5"` = 1; `"test": "vitest run --coverage"` = 1; `idb-store` in vitest.config.ts = 1; `"src/persistence/**/*.ts"` = 2; `"src/sim/**/*.ts"` = 2; `"src/content/**/*.ts"` = 2; `"src/sim/economy/**/*.ts"` = 1; `"src/sim/hyperspace/**/*.ts"` = 1; `fake-indexeddb` in package.json = none.

## Task Commits

1. **Deviation fix: explicit timeouts for coverage-loaded tests** - `23023ed` (test)
2. **Task 2: coverage provider, script, contract pin, persistence threshold** - `8a6794d` (feat)
3. **Task 3: remaining four glob thresholds** - `d8c3f43` (feat)

**Plan metadata:** recorded in the docs commit that follows this SUMMARY.

## Files Created/Modified

- `package.json` - devDependency `@vitest/coverage-v8` 5.0.5; `test` script is `vitest run --coverage`
- `package-lock.json` - 12 packages added for the coverage provider
- `vitest.config.ts` - `test.coverage` block (provider, reporters, reportsDirectory, include, exclude) and five glob-keyed thresholds with the measured table in the comment
- `tests/contract/container-contract.test.ts` - pin of the `test` script updated to `vitest run --coverage`
- `tests/guards/content-boundary.test.ts` - explicit 180 s timeouts on the eslint-probe cases (60 s before) and the probe-cleanup case (5 s default before)
- `tools/oolite-ingest/drift.test.ts` - explicit 180 s timeouts on the six asset-copy cases

## Decisions Made

- The owner's conditional approval was honoured: the executor ran the registry checks in the container before installing. All passed, and the install went ahead at exactly 5.0.5.
- Thresholds are floors of one unthresholded measurement, so the first gated run passes by construction. A later drop in coverage fails the run.
- `idb-store.ts` remains excluded from unit coverage, and `fake-indexeddb` was not added (D-20).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Explicit timeouts on coverage-loaded tests**
- **Found during:** Task 2 verification (first run with coverage enabled)
- **Issue:** With v8 coverage on, the unit run failed on three load-sensitive tests. `content-boundary > removes the probe even when the body throws` timed out at the 5 s default (STATE.md already records this test as missing an explicit timeout). On a later run `content-boundary > fails lint when the sim imports the runtime content index` hit its 60 s limit, and `drift > reports no differences on an unmodified copy` hit 5 s. The host was saturated (load average about 4.6 on 4 cores).
- **Fix:** Gave each of those tests an explicit 180 s timeout, matching the sibling tests in the same files. The six drift cases share the same asset-copy pattern, so all six got the explicit timeout. No assertion changed.
- **Files modified:** tests/guards/content-boundary.test.ts, tools/oolite-ingest/drift.test.ts
- **Verification:** `docker compose run --rm test` exit 0 after the change (93 files passed).
- **Committed in:** `23023ed`

**2. [Rule 1 - Bug] Contract pin of the test script**
- **Found during:** Task 2 verification (expected failure)
- **Issue:** `container-contract.test.ts` pinned `vitest run`, which the new script no longer matches.
- **Fix:** Updated the pin to `vitest run --coverage`. Every other pin is unchanged.
- **Committed in:** `8a6794d`

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug). **Impact on plan:** Both were needed for the coverage gate to pass in the container. Scope did not grow: no test logic changed, and no new test was added.

## Issues Encountered

- **Plan commit ledger was not written before the first commit.** The 0c ledger step was skipped. The base for the `commits:` count was therefore taken retroactively as the parent of the first plan commit (`6453a17`). The count of 3 is measured from that base with `git rev-list --count 6453a17..HEAD`.
- **Zero-line rule wording vs. the measured file.** Task 2 names `src/persistence/save.ts` for the zero-line rule, but `save.ts` measured non-zero. The file that measured 0% is `src/persistence/store.ts`, which holds only types and constants that no unit test loads at runtime. No test was added for it. `src/content/ships.ts` also measured 0% lines; no rule in this plan covers `src/content`, so it was not changed. Both are candidates for follow-up coverage work.
- **Breach behaviour not demonstrated.** The threshold enforcement is configured and the run passes at the floors. This execution did not run a deliberately-breached run to show the failure line, so that proof is still open.
- **npm audit warning.** The container `npm install` reported 10 moderate-severity vulnerabilities across the whole tree. This plan did not triage them and does not attribute them to the coverage packages.
- **Interim failures during verification** were the expected contract pin change and the load-sensitive timeouts above; both are resolved.

## User Setup Required

None - no external service configuration required.

## Threat Flags

None. The new devDependency's supply-chain check (T-07-09, T-07-SC) was gated by the owner's package check and the registry verification recorded above.

## Known Stubs

None.

## Next Phase Readiness

- QUAL-04 coverage half is delivered. The unit run enforces the five measured floors in the container.
- Follow-ups: (a) a deliberate breach run to demonstrate the failure line; (b) coverage for `src/persistence/store.ts` constants and `src/content/ships.ts` if the owner wants those globs raised; (c) triage of the npm audit moderate findings.

## Self-Check: PASSED

- Created file present: `.planning/phases/07-hardening-community-release/07-12-SUMMARY.md` (this file).
- Commits present on this branch: `23023ed`, `8a6794d`, `d8c3f43` (`git rev-list --count 6453a17..HEAD` = 3).
- Verification commands in the table above all exit 0.

---
*Phase: 07-hardening-community-release*
*Completed: 2026-11-08*
