---
phase: 21-roster-state-shape-and-seams
plan: 19
subsystem: testing
tags: [draw-calls, triangles, budget, D-05, D-06, D-07, QUAL-09, DATA-18, gpu-frame-time, phase-gate]
requires:
  - phase: 21-16
    provides: "tests/e2e/anarchy.spec.ts and the 65 / 68 call baseline"
  - phase: 21-17
    provides: "D-05 fix (1), every NPC hull one primitive; anarchy 39 / 42 calls"
  - phase: 21-18
    provides: "the recorded deferral of fix (2) (status deferred, orchestrator decision 6, 2026-11-26)"
provides:
  - "tests/e2e/helpers/budgets.ts: the one DRAW_CALL_BUDGET (50), TRIANGLE_BUDGET (250,000), FIRST_LOAD_BYTES_CEILING (9,437,184) and withinBudget (inclusive, zero and non-finite fail)"
  - "tests/app/e2e-budgets.test.ts: the Vitest boundary check (11 tests)"
  - "anarchy.spec.ts asserts both triangle counts and both call counts against the shared budgets (the 21-18 deferral tripwire)"
  - "docs/PERFORMANCE.md 'Full-anarchy draw-call spike (Phase 21, D-05)': counts per step, seven-debris bound 49, the one-off RTX 4060 frame times"
  - "PROJECT.md Key Decisions row 'Draw-call budget and NPC model loading for the v2.4 roster' and the dated D-05 note in 21-CONTEXT.md, both flagging the 21-18 deferral for owner review"
affects: [22, QUAL-09, QUAL-01]
key-files:
  created:
    - tests/e2e/helpers/budgets.ts
    - tests/app/e2e-budgets.test.ts
  modified:
    - tests/e2e/anarchy.spec.ts
    - tests/e2e/budget.spec.ts
    - tests/e2e/traffic.spec.ts
    - tests/e2e/npc-flight.spec.ts
    - tests/e2e/combat.spec.ts
    - docs/PERFORMANCE.md
    - .planning/PROJECT.md
    - .planning/phases/21-roster-state-shape-and-seams/21-CONTEXT.md
key-decisions:
  - "DRAW_CALL_BUDGET stays 50: after fix (1) the anarchy is 39 calls and 42 after a kill, the seven-debris bound is 49; no raise was needed, the 2026-11-25 authorisation was not used, and none is allowed while 21-18 is deferred"
  - "The 21-18 deferral departs from D-05's order of fixes and is flagged for owner review in the Key Decisions row, the D-05 note and this SUMMARY"
  - "The seven-debris bound counts all seven debris models as unshown (the probe does not name the debris models drawn): 42 + 7 = 49, confirmed by the layer maxima 39 + 1 laser + 2 explosion + 7 debris = 49"
  - "The GPU reading was taken against the production preview served on the remote machine, not the local dev server, whose Vite dependency cache was stale (504 Outdated Optimize Dep); the shared dev server was left untouched"
  - "Besides the protocol's 60 Hz-paced sampler, an unpaced reading (--disable-gpu-vsync --disable-frame-rate-limit) was recorded because the paced one cannot discriminate (fight and baseline both at the frame interval)"
requirements-completed: [DATA-18]
actuals:
  tokens: 9100
  tasks: 3
  commits: 3
duration: 1h20m
completed: 2026-11-26
status: complete
commits: 3
plan_head_before: f73ede6b1614379bb36133d59fb10a1755d625e6
plan_head_after: 390a8fcc377443bf0537cb8f7e32fc892d6a41bb
---

# Phase 21 Plan 19: draw-call budget decision, shared browser budgets and the phase gate Summary

**The full 29-hull anarchy after D-05 fix (1) draws 39 calls (42 after a kill, at most 49 with all seven debris models) and 77,934 / 78,598 triangles, so `DRAW_CALL_BUDGET` stays 50 with no raise; the browser budgets now live in one module asserted by all five specs, the anarchy spec carries the 21-18 deferral tripwire, and a one-off RTX 4060 reading puts the fight at p95 3.4 ms unpaced (16.7 ms at 60 Hz pacing).**

## Precondition check (D-05, before the value was decided)

- 21-17-SUMMARY.md: fix (1) implemented (22 multi-primitive hulls merged, none refused), anarchy measured at 39 worst case / 42 after a kill (commit 90c5f209, again 985b9049). Present.
- 21-18-SUMMARY.md: `status: deferred`, the orchestrator's recorded deferral of 2026-11-26 (fix (1) alone puts the anarchy within 50). Present.
- Rule applied: with fix (2) deferred no raise is allowed; the decision reads the after-fix-(1) counts; a count above 50 would stop the plan. Neither count nor the seven-debris bound exceeds 50, so the plan continued and the budget stays 50.

## Counts per D-05 step (remote `anarchy.spec.ts`, SwiftShader, browser-test bundle)

| Step | Worst case calls | Worst case triangles | After kill calls | After kill triangles |
|---|---|---|---|---|
| 21-16 baseline, before any fix | 65 | 77,934 | 68 | 78,598 |
| After fix (1) (21-17) | 39 | 77,934 | 42 | 78,598 |
| After fix (2a)/(2b) (21-18) | deferred | deferred | deferred | deferred |
| This plan, at f8ea61cb and again at 390a8fcc (with the assertions) | 39 | 77,934 | 42 | 78,598 |

- Debris entities after the kill: 5. Every NPC key costs one call (29) plus the 10 calls of the scene without ships.
- **Seven-debris upper bound: 49 calls** (42 measured + 7 for the seven stock debris models `barrel`, `alloy`, `wreck1`-`wreck5`, each one primitive in its GLB, all counted as unshown because the probe does not name the debris models drawn). Cross-check by layer maxima: 39 + laser shots 1 + explosion 2 + debris 7 = 49. Within 50, one call to spare, at Standard quality.
- **Triangles: 77,934 and 78,598, within 250,000 (31 %).** No triangle stop.
- No split family and no refused hull: fix (2) did not run, and fix (1) refused none.

## GPU frame time (D-06, one-off; not QUAL-01 evidence)

Renderer string, read from the game page: `ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 4060), OpenGL 4.6)`. Chromium 159.0.8154.6 headed under Xvfb in the remote `wegolite-pw-mcp` container (the GPU recipe of the memory note), viewport 1920x1080, DPR 1, against the production preview (`npm run build`) of f8ea61cb served on the remote machine, the PERFORMANCE.md sampler for 30 s per row. Fight: `?test=1&traffic=1`, real clock, launch, speed 0, `spawnTestAnarchy()`, wait for 39 calls held 3 s, fire held, `spawnTestShooter(20)`, sampler at start delay 0 (calls read once per second ran 39 to 43; the shooter died inside the window). Baseline: `?test=1` (traffic off), Lave in flight, start delay 5 s.

| Row | Count | p50 | p95 | p99 | max |
|---|---|---|---|---|---|
| Fight, 60 Hz paced | 1,794 | 16.70 | 16.70 | 16.80 | 83.30 |
| Baseline, 60 Hz paced | 1,800 | 16.70 | 16.70 | 16.80 | 16.80 |
| Fight, unpaced | 13,581 | 2.00 | 3.40 | 6.90 | 71.80 |
| Baseline, unpaced | 20,933 | 1.40 | 1.70 | 2.40 | 670.40 |

D-05's condition (fight p95 at most 16.7 ms) holds, but the paced reading cannot discriminate: Chromium paces rAF at 60 Hz and both rows read the frame interval (the baseline's p95 is 16.70, not above 16.7 ms, while its p99 is 16.80). **Flagged for the owner:** the paced criterion says nothing about headroom at 60 Hz pacing; the unpaced rows (an addition to the protocol for this reading only) show it, fight p95 3.4 ms against baseline 1.7 ms. No budget raise depends on it, because none was made.

## Budget decision

`DRAW_CALL_BUDGET` = **50**, unchanged. No raise was needed; the owner's 2026-11-25 authorisation was not used; D-05's envelope (at most about 80 calls, fight p95 at most 16.7 ms) was not entered. **Owner review requested** for the 21-18 deferral only (it departs from D-05's order of fixes), recorded in the Key Decisions row and the D-05 note.

## Consolidated constants

`rg -c "const DRAW_CALL_BUDGET|const TRIANGLE_BUDGET|const FIRST_LOAD_BYTES_CEILING" tests/e2e` reports only `tests/e2e/helpers/budgets.ts`. The four draw-call, one triangle and two first-load declarations (and the two local `MIB` constants) were replaced by imports in `budget.spec.ts`, `traffic.spec.ts`, `npc-flight.spec.ts` and `combat.spec.ts`; `anarchy.spec.ts` imports all three it uses. The budget.spec.ts ceiling history moved into the helper's doc comment.

## Key Decisions row and CONTEXT note

- `.planning/PROJECT.md`: new row "Draw-call budget and NPC model loading for the v2.4 roster (D-05, D-06, D-07, plans 21-17 to 21-19)" after the last Phase 21 row; the "Evidence 60 fps" row's figures are unchanged because the budget did not change.
- `21-CONTEXT.md` line 34: the dated note under D-05 (`*Note (2026-11-26, plan 21-19; records the outcome, D-05 itself unchanged)*`); `rg -c "2026-11-25"` rose from 3 to 4.

## Verification

- Task 1: `docker compose run --rm test npx vitest run tests/app/e2e-budgets.test.ts`: 1 file, 11 passed. Remote `anarchy.spec.ts` at f8ea61cb: 1 passed, exit 0, 28 s; `anarchy-counts: {worstCaseCalls 39, worstCaseTriangles 77934, afterKillCalls 42, afterKillTriangles 78598, keys 29, debrisEntities 5}`.
- Task 2: docs only; the GPU readings above (remote preview of f8ea61cb). Its anarchy verify is covered by the Task 3 run at 390a8fcc.
- Task 3 / plan boundary (local, at 390a8fcc): `lint` clean (eslint and prettier), `typecheck` clean, `assets:check` no differences, `test` 308 files, 8,512 passed, 10 skipped, exit 0 (574 s).
- Remote five specs (`anarchy`, `budget`, `traffic`, `npc-flight`, `combat`) at 390a8fcc: 10 passed, 0 failed, 0 flaky, exit 0, 117 s; anarchy again 39 / 77,934 and 42 / 78,598.
- **Phase gate, remote `verify-full`** at 390a8fcc: exit 0, 1,136 s; lint, typecheck, `assets:check` no differences, 308 unit files (8,512 passed, 10 skipped), build, full Chromium suite 167 passed, seams suite 2 passed.
- **Phase gate, remote frozen 20-seed acceptance run** (`npm run test:acceptance`) at 390a8fcc: exit 0, 88 s, 1 file, **21 of 21 passed**.
- Acceptance greps: `rg -c "const (DRAW_CALL_BUDGET|TRIANGLE_BUDGET|FIRST_LOAD_BYTES_CEILING)" tests/e2e` reports only `tests/e2e/helpers/budgets.ts`; `rg -c withinBudget tests/app/e2e-budgets.test.ts` = 10; `TRIANGLE_BUDGET` in anarchy.spec.ts; `e2e/helpers/budgets` in the Vitest file; `Full-anarchy draw-call spike` once in PERFORMANCE.md; the Key Decisions row title once in PROJECT.md; `2026-11-25` in 21-CONTEXT.md 3 -> 4.
- No hash, twin or golden moved (tests and docs only).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] GPU reading taken against a remote production preview instead of the local dev server**
- **Found during:** Task 2
- **Issue:** the shared dev server at the address in CLAUDE.local.md answered every pre-bundled dependency with `504 (Outdated Optimize Dep)` (zod, three, GLTFLoader), so the page never booted (`window.__wegolite` undefined after 60 s, twice).
- **Fix:** served the production preview of the committed HEAD on the remote machine (`wegolite-remote-run.sh up preview`, stopped afterwards with `docker compose stop preview`) and pointed the GPU Chromium at it over the remote's loopback. This matches the reference-desktop protocol (production preview) better than a dev build. The shared local dev server was not restarted or changed; its stale cache is left for whoever owns it.
- **Commit:** none (measurement only).

**2. [Rule 2 - Missing] Unpaced frame-time rows added to the one-off reading**
- **Found during:** Task 2
- **Issue:** the paced sampler reads the 60 Hz frame interval for both the fight and the baseline, so it cannot discriminate (the plan anticipated this case).
- **Fix:** a second run with `--disable-gpu-vsync --disable-frame-rate-limit`, recorded beside the paced rows and labelled as an addition to the protocol.
- **Commit:** 96980192.

**3. [Process] Plan commit ledger not written to the git directory**
- The worktree isolation hook refuses commands that write under `.git/worktrees/...`, so the #3968 ledger file was not created; the base is the verified spawn base f73ede6b and `commits:` is measured with `git rev-list --count f73ede6b..HEAD`.

No CHANGELOG line: the plan changes tests and documentation only, nothing user-visible.

## Known Stubs

None.

## Threat Flags

None. T-21-32 (repudiation of a raise) is mitigated by the precondition check above, the unchanged budget and the owner-review flag; T-21-43 (constant drift) by the single module, the acceptance greps and the Vitest boundary check.

## Commits

- f8ea61cb test(21-19): shared browser budget module and anarchy triangle assertions (Task 1)
- 96980192 docs(21-19): full-anarchy draw-call spike and one-off GPU frame time (Task 2)
- 390a8fcc test(21-19): keep the draw-call budget at 50 and move the specs onto the shared budgets (Task 3)

## Self-Check: PASSED

- FOUND: tests/e2e/helpers/budgets.ts, tests/app/e2e-budgets.test.ts, the docs/PERFORMANCE.md subsection, the PROJECT.md row, the 21-CONTEXT.md note
- FOUND: f8ea61cb, 96980192, 390a8fcc (ancestors of HEAD)

