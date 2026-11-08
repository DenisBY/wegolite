---
phase: 07-hardening-community-release
plan: 11
subsystem: infra
tags: [licensing, audit, gitignore, playwright, vitest, release, qual-07, qual-08]

requires:
  - phase: 07-hardening-community-release
    provides: NOTICE, LICENSE, ASSETS.md and footer (07-01); compliance-shipped spec (07-01); browser gates (07-04, 07-09)
provides:
  - scripts/audit-release.sh: local licensing audit and --remote source-offer check
  - .gitignore excludes .agents/ and skills-lock.json
  - ASSETS.md not-distributed rows for .agents/ and skills-lock.json
  - PROJECT.md Phase 7 Key Decisions rows (D-01 to D-25 as delivered), including the D-17 scope and the browser-claim warning
  - QUAL-01 deferral recorded in REQUIREMENTS.md and docs/PERFORMANCE.md (owner decision 2026-11-08)
affects: [release publication (owner push checkpoint), QUAL-01 carry-over to a later phase]

actuals:
  tokens: 30607
  tasks: 2
  commits: 3
  measured_from: 955973e

key-files:
  created:
    - scripts/audit-release.sh
  modified:
    - .gitignore
    - ASSETS.md
    - .planning/PROJECT.md
    - .planning/REQUIREMENTS.md
    - docs/PERFORMANCE.md

key-decisions:
  - "The licensing audit is one command: local checks (deny-list, ignore check, licence documents, origin, uncommitted source, shipped-site spec) and a --remote mode that compares the public main with the gated commit and the served bytes of NOTICE, LICENSE, ASSETS.md and src/main.ts."
  - "The shipped-site step runs the compliance spec with --project=chromium, the same Chromium gate as test:e2e; the firefox project is headed and needs the cross image's xvfb."
  - "PROJECT.md's browser-claim row records the open Safari wording as an owner decision: ROADMAP criterion 2 and QUAL-02 already read Chrome and Firefox, but src/app/fallback.ts line 32 still names Safari. This plan does not change product code."
  - "QUAL-01 is deferred by the owner on 2026-11-08 to a later phase. REQUIREMENTS is unchecked with a Pending traceability row; the automated container budget gates are not deferred and still run."
  - "The public push remains an owner checkpoint (D-01). No agent ran git push."

patterns-established:
  - "Audit captures command output before testing it, so a failing git or docker command cannot read as clean."

requirements-completed: []  # QUAL-07 and QUAL-08 not complete: remote source offer not yet true (push pending) and verify gate is red on this run

duration: ~3 h wall (gate runs dominate: verify 1987 s, e2e-cross 139 s, isolated re-run 716 s)
completed: 2026-11-08
status: halted
---

# Phase 7 Plan 11: Licensing audit, Phase 7 decisions, gates and publication checkpoint Summary

**Licensing audit command with agent-tooling exclusion and Phase 7 decision record; verify gate red on five Chromium timeouts under parallel load (all five pass alone), e2e-cross green, public push held for the owner**

## Status

Halted before completion. Automated Task 1 is done. Task 2's decision record is done, but the `verify` gate exited 1 on the gate commit, so the plan's own rule ("a red gate stops the plan before Task 3") applies. Task 3 (owner push) is returned as a checkpoint and has not been run. STATE.md and ROADMAP.md were not advanced by this plan.

## Performance

- **Plan commits:** 3 (measured from ledger base 955973e)
- **Tasks:** 2 of 3 automated work done; checkpoint returned, not run
- **Files changed:** 6

## Accomplishments

- `scripts/audit-release.sh` runs the local licensing audit. It passes end to end: `release audit: local checks passed` (exit 0, 23.6 s wall, including build and four shipped-site Chromium tests).
- `.gitignore` excludes `.agents/` and `skills-lock.json`. Both paths are absent from `git ls-files`, and neither appears as untracked any longer.
- ASSETS.md has not-distributed rows for both paths. Prettier check passes.
- PROJECT.md has 15 new Phase 7 decision rows (14 with a ✓ or ⚠ outcome and one ⏳ pending the owner's push; 16 ✓/⚠ rows in total with the two pre-existing ones), including the browser-claim warning row, and the updated last-updated footer. The Platform constraint already reads current stable Chrome and Firefox and needed no edit.
- QUAL-01 deferred per owner decision (see Owner decision below).

## Task Commits

1. **Task 1: licensing audit, ignore rules and ASSETS rows** - `2af55fb` (chore)
2. **Task 2: Phase 7 decisions in PROJECT.md** - `e133251` (docs). This is the gate commit: `verify` and `e2e-cross` ran on it.
3. **Owner decision: QUAL-01 deferral** - `4e4de8f` (docs). Changes REQUIREMENTS.md and docs/PERFORMANCE.md only. Prettier check passes on the PERFORMANCE.md change. It was not re-gated.

**Plan metadata:** this SUMMARY is committed separately after these.

## Gate Results (gate commit e133251)

| Gate | Command | Result | Wall time |
|------|---------|--------|-----------|
| Licensing audit (local) | `sh scripts/audit-release.sh` | PASS (exit 0) | 23.6 s |
| Compliance unit tests | `docker compose run --rm test npx vitest run tests/compliance.test.ts tests/compliance-assets.test.ts` | PASS, 28 of 28 | ~seconds |
| Full verify | `docker compose run --rm verify` | **FAIL (exit 1)**: lint, typecheck, assets:check, unit and coverage passed (94 files, 1187 tests, 1 skipped); Chromium e2e 87 passed, 5 failed | 1987 s |
| Firefox gate | `docker compose run --rm e2e-cross` | PASS (exit 0), 2 passed | 139 s |

### Verify failures (Chromium, full parallel run)

| Spec | Failure in verify run | Isolated re-run (one worker, same container) |
|------|----------------------|----------------------------------------------|
| tests/e2e/core-loop.spec.ts (new game to launch to trade to hyperspace to dock to save and reload) | waitForFunction timeout (240 s) | PASS (4.3 min) |
| tests/e2e/autosave.spec.ts (trigger matrix) | waitForFunction timeout (180 s) | PASS (4.5 min) |
| tests/e2e/docking.spec.ts (a bounce shakes, flashes and messages) | waitForFunction timeout (30 s) | PASS (56.7 s) |
| tests/e2e/hyperspace.spec.ts (jump completed beside the station is refused as blocked) | waitForFunction timeout (180 s) | PASS (1.8 min) |
| tests/e2e/scene.spec.ts (boots to the title, launches and flies) | test timeout (30 s) | PASS (14.9 s) |

All five are timeouts while the host ran under load (load average about 9 on 4 CPUs). The isolated re-run is diagnostic only: it does not turn the recorded verify run green. The verify run is recorded as red. A green verify needs a rerun on a quiet host, or a timeout review that the owner has not authorised; no test or src/ change was made.

Budget gates are not deferred and passed in the verify run: `tests/e2e/budget.spec.ts` (three tests) and `tests/render/planet-budget.test.ts` (16 tests).

## Owner Decision Applied: QUAL-01 Deferred

Owner decision, 2026-11-08 (coordinator message):
- REQUIREMENTS.md QUAL-01 is unchecked (pending) with the note "deferred by the owner on 2026-11-08 to a later phase; the Firefox and Chrome sampler results are recorded in docs/PERFORMANCE.md; the manual cold-start Load time was not supplied". Traceability row: `Pending`.
- docs/PERFORMANCE.md status: "manual reference-desktop run deferred by the owner on 2026-11-08 to a later phase; results recorded above are partial; QUAL-01 is not evidenced in this phase." Recorded rows, preliminary section and Machine block are unchanged.
- ROADMAP: 07-05 stays checked as an executed plan. Phase 7 is not marked complete on QUAL-01's basis.
- **Carried over to a later phase: QUAL-01 (60 fps on the reference desktop).** Not evidenced in Phase 7.

## Owner Checkpoint (returned, not run)

Task 3 remains open. `sh scripts/audit-release.sh --remote` was run read-only before the push: it fails as expected, because public main is `df35afb11da9ba4787f0c41bd6faf947a3ed3b88` and local main is `4e4de8f3bc9b6964bc04a382b062cc3a45e111fc` (gate commit `e133251`). No `git push` was run.

Open items for the owner, not decided here:
1. Publish or hold. Publish is one-way (D-01). Reply "pushed" after `git push origin main`, or "hold: reason".
2. D-02: `.planning/` is already public at df35afb. Pushing main publishes its full current history.
3. Hosting target (D-05).
4. Reference machine (D-10). The manual Load run is deferred (QUAL-01).
5. Restore copy (D-16).
6. Safari wording: `src/app/fallback.ts` line 32 ("Try a current Chrome, Firefox or Safari"). Recorded in PROJECT.md as a warning row; the default is Chrome and Firefox only.
7. The verify gate needs a green run before the push is offered (see Gate Results).

## Deviations from Plan

**1. [Rule 3 - Blocking] `--project=chromium` added to the audit's shipped-site step**
- **Found during:** Task 1 (audit script design)
- **Issue:** the plan's command `npx playwright test tests/e2e/compliance-shipped.spec.ts` runs every configured project. The firefox project is headed and needs xvfb, which exists only in the `cross` image.
- **Fix:** pinned to `--project=chromium`, the same flag `test:e2e` uses.
- **Committed in:** 2af55fb

**2. [Rule 1 - Accuracy] PROJECT.md browser-claim row written against the current files, not the plan's stale premise**
- **Found during:** Task 2
- **Issue:** the plan said ROADMAP criterion 2 and QUAL-02 still say "Chrome, Firefox, and Safari". They already read Chrome and Firefox (QUAL-02 says Safari is not claimed). The remaining Safari wording is `src/app/fallback.ts`, which the plan does not list.
- **Fix:** the ⚠ row records the actual state and the open owner decision. No product code was changed.
- **Committed in:** e133251

**3. [Rule 1 - Accuracy] Platform constraint line needed no edit**
- It already reads "current stable Chrome and current stable Firefox" at HEAD, so Task 2's Platform change was not repeated.

**Total deviations:** 3 (1 blocking, 2 accuracy). **Impact:** the audit and records are accurate to the repository. The verify gate is red and the plan is halted.

## Issues Encountered

- The `verify` gate ran red on five Chromium timeouts under parallel load (see Gate Results). Each passes alone in the same container, so the failures are timing, not functional. I did not change tests or timeouts, per the coordinator's instruction.
- During the run, the coordinator's owner decision on QUAL-01 arrived and was applied as commit `4e4de8f`.

## User Setup Required

None for the automated work. The owner push checkpoint is pending (see above).

## Next Phase Readiness

- Re-run `docker compose run --rm verify` on a quiet host, or have the owner approve a timeout review, to make the gate green on the offered commit.
- QUAL-01 carries over to a later phase.
- After the owner's push: `sh scripts/audit-release.sh --remote` must print `release audit: public main matches <sha>` where `<sha>` is the gate-passing commit.

## Self-Check

- [x] scripts/audit-release.sh exists and is executable (100755)
- [x] Commits 2af55fb, e133251, 4e4de8f exist on main
- [x] No `git push` run
- [ ] verify gate green on gate commit (exit 1)

## Self-Check: FAILED (verify gate red; halted per plan)

---
*Phase: 07-hardening-community-release*
*Completed: 2026-11-08 (halted)*
