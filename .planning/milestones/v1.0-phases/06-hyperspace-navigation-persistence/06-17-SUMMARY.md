---
phase: 06-hyperspace-navigation-persistence
plan: 17
subsystem: ui
tags: [chart, projection, arrow-keys, oolite-fidelity, gap-closure, G-9]

requires:
  - phase: 06-hyperspace-navigation-persistence
    provides: 2:1 isotropic chart projection (06-10/06-12), short-range arrow selection (G-5), chartDistance connectivity
provides:
  - Oolite's galactic chart orientation: larger galaxy y is drawn lower on screen
  - chartArrowVector(arrow) routing each arrow to the drawn direction
  - Unit and browser proof that each arrow selects the system drawn in the pressed direction
  - PROJECT.md Key Decision for Oolite's orientation; G-9 reopened and reversed in the gap ledger
affects: [phase 6 verification, any later chart or arrow-navigation work]

actuals:
  tokens: 4820      # chars/4 over the realized diff of the four code/test files and 06-GAP-CLOSURE.md
  tasks: 3
  commits: 3        # MEASURED: git rev-list --count c8fb4c6..HEAD

tech-stack:
  added: []
  patterns:
    - "Chart orientation lives in one projection sign; arrow vectors come from one table (chartArrowVector)"

key-files:
  created:
    - .planning/phases/06-hyperspace-navigation-persistence/06-17-SUMMARY.md
  modified:
    - src/ui/chart-model.ts
    - src/app/game-session.ts
    - tests/ui/chart-model.test.ts
    - tests/e2e/hyperspace.spec.ts
    - .planning/PROJECT.md
    - .planning/phases/06-hyperspace-navigation-persistence/06-GAP-CLOSURE.md

key-decisions:
  - "Follow Oolite's galactic chart orientation (owner direction 2026-11-07): screen y grows downward with galaxy y, citing GuiDisplayGen.m:1575 (negative vscale) and :1948 (star y placement). Supersedes the north-up divergence row, which stays in PROJECT.md as history."
  - "Connectivity, distance and fuel still come from chart coordinates through chartDistance; no pixel value feeds a jump decision. nearestInDirection and visibleSystemIds bodies are byte-identical to HEAD."

patterns-established:
  - "Every chart orientation expectation cites the GuiDisplayGen.m line it matches"

requirements-completed: [NAV-01, NAV-02]

coverage:
  - id: D1
    description: "Projection draws a larger galaxy y lower on screen, citing GuiDisplayGen.m:1575"
    requirement: "NAV-01"
    verification:
      - kind: unit
        ref: "tests/ui/chart-model.test.ts#draws a larger galaxy y lower on screen, as Oolite's negative vscale does"
        status: pass
    human_judgment: false
  - id: D2
    description: "Each arrow from Lave selects the system drawn in the pressed direction (Up Reorte, Down Lave, Right Zaonce, Left Lave)"
    requirement: "NAV-02"
    verification:
      - kind: unit
        ref: "tests/ui/chart-model.test.ts#chartArrowVector follows the drawn screen"
        status: pass
      - kind: e2e
        ref: "tests/e2e/hyperspace.spec.ts#chart arrow keys select the system drawn in the pressed direction"
        status: pass
    human_judgment: false
  - id: D3
    description: "PROJECT.md Key Decision row and G-9 reopened in the gap ledger"
    verification: []
    human_judgment: true
    rationale: "Documentation of an owner decision; the owner set the direction, so the record is reviewed by the phase owner rather than automated"

duration: approx. 60min (start time was not recorded; two full verify runs dominate)
completed: 2026-11-07
status: complete
---

# Phase 6 Plan 17: Galactic chart follows Oolite's orientation Summary

**The F6 chart draws a larger galaxy y lower, as Oolite's `drawStarChart` does, and each arrow key selects the system drawn in that direction (Lave: Up Reorte, Down Lave, Right Zaonce, Left Lave)**

## Performance

- **Duration:** approx. 60 min (start time not recorded at `record_start_time`)
- **Started:** not recorded
- **Completed:** 2026-11-07
- **Tasks:** 3
- **Files modified:** 6 (plus this SUMMARY)

## Accomplishments

- `chartProjection` flips the sign of the halved chart-y term; the module header and doc comment cite `GuiDisplayGen.m:1575` and `:1948` and no longer defend north-up.
- `chartArrowVector(arrow)` is the single table routing up to (0, -1), down to (0, 1), left to (-1, 0), right to (1, 0). `moveChartSelection` takes a `ChartArrow`, and the four chart key routes go through it.
- Unit tests pin the flipped sign, the taller-viewport value of 600, and the arrow-to-screen direction from Lave, including the four-step chain.
- Browser test presses ArrowUp, ArrowDown, ArrowRight and ArrowLeft from Lave and reads painted positions via a new `markerPoint` helper; `clickSystem` now calls it with identical click behaviour.
- PROJECT.md records Oolite's orientation as a Key Decision beside the superseded north-up row; G-9 is reopened and reversed in 06-GAP-CLOSURE.md.

## Task Commits

1. **Task 1: Trace ArrowUp from Lave to Reorte through the flipped projection** - `1457f0b` (fix)
2. **Task 2: Prove every arrow selects the system drawn in its direction** - `04ee941` (test)
3. **Task 3: Record the reversal in PROJECT.md and the G-9 ledger** - `c5b0402` (docs)

**Plan metadata:** committed as the final docs commit that adds this SUMMARY.md.

Task 1 is a `type="tracer"` task. Its tracer gate has no `gate="blocking-human"`, so after the automated `<verify>` passed the executor continued without a checkpoint.

## Files Created/Modified

- `src/ui/chart-model.ts` - flipped projection sign, Oolite citations, `ChartArrow` and `chartArrowVector`
- `src/app/game-session.ts` - `moveChartSelection(arrow)` and chart key routes through `chartArrowVector`
- `tests/ui/chart-model.test.ts` - sign-pinning expectations cite Oolite; new `chartArrowVector follows the drawn screen` block
- `tests/e2e/hyperspace.spec.ts` - `markerPoint` helper and the arrow-key browser test
- `.planning/PROJECT.md` - one Key Decision row added (committed hunk only; see Deviations)
- `.planning/phases/06-hyperspace-navigation-persistence/06-GAP-CLOSURE.md` - G-9 cell reopened and reversed

## Decisions Made

- Adopted Oolite's orientation as the plan directed; the north-up row remains as history.
- Kept the arrow change to one vector table and two sign changes. `nearestInDirection`, `visibleSystemIds`, `hitTest`, `selectLabels` and `chartDistance` are unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fuel-circle test pinned the old sign**
- **Found during:** Task 1 (first run of `tests/ui/chart-model.test.ts`)
- **Issue:** `draws the fuel circle as a true circle` asserted `centre.y - yEdge.y`. The plan's list of sign-pinning expectations named three; this fourth one failed after the flip.
- **Fix:** Changed to `yEdge.y - centre.y` with a `GuiDisplayGen.m:1575` comment.
- **Files modified:** tests/ui/chart-model.test.ts
- **Verification:** unit file passes, 25/25 after Task 1; 29/29 after Task 2.
- **Committed in:** 1457f0b

**2. [Scope note] `markerPoint` returns page pixels, not canvas-relative pixels**
- The plan described `markerPoint` as the CSS-pixel point the painter uses. The helper returns the canvas bounding-box offset plus that point, so `clickSystem` can call `page.mouse.click` directly with the same coordinates as before. Comparisons inside the test are unaffected, since both points share the same box. Committed in 1457f0b.

### Process deviations (no code impact)

- **Plan commit ledger not written before the first commit.** Step 0c was skipped, so `commits:` and `plan_head_before:` are reconstructed from git: the base is `c8fb4c6`, the parent of the first commit `1457f0b`. Measured with `git rev-list --count c8fb4c6..HEAD` = 3.
- **PROJECT.md committed as a partial index.** The working copy carries the orchestrator's uncommitted hunks (including the superseded marker on the north-up row and the 06-08 and arrival-pose rows). I built the index blob from HEAD plus only the new decision row, so commit `c5b0402` contains exactly one added line in PROJECT.md. The orchestrator's hunks remain uncommitted in the working tree and are not in this plan's commits.
- **Task 1 commit amended once** to fix a typo in its message. The commit had not been pushed.
- **No STATE.md or ROADMAP.md update.** The parallel-execution brief limits tracking writes to SUMMARY.md, and the orchestrator owns those files.

## Issues Encountered

- **`docker compose run --rm verify` did not exit 0 in either of two full runs.** Each run failed on a different browser spec with a title-to-docked timeout (`#docked` hidden after New game, or a 30 s `waitForFunction` in `scene.spec.ts`):
  - Run 1 (`verify.log`): `save-load.spec.ts:456` "a future or unreadable slot is refused and never overwritten" and `scene.spec.ts:15` "boots to the title, starts docked at Lave, launches and flies". 73 passed, 2 failed, 1120 unit tests passed, assets:check no differences.
  - Run 2 (`verify2.log`): `autosave.spec.ts:683` "New game clears a committed save before starting". 74 passed, 1 failed, 1120 unit tests passed, assets:check no differences.
  - Each failing spec passes when run alone in the same container (`save-load` -g, `scene.spec.ts` 3/3, `autosave` -g). None of them opens the chart. The pattern matches the SwiftShader cadence caveat already recorded in PROJECT.md. I did not prove the baseline flake rate at `c8fb4c6`, and I did not weaken any test or add retries.
  - Logs: `/tmp/claude-1027/-home-opencode-git-wegolite/3065a5cb-8171-424e-bdfc-5b5fa4c26546/scratchpad/verify.log` and `.../verify2.log`.
- **The wrapper for run 1 reported exit 0** because it echoed `tail`'s status. The log's `VERIFY_EXIT=1` is the real result. Run 2 captured the real exit code.

## Test Results (Docker, this plan's touched suites)

| Command | Result |
| --- | --- |
| `docker compose run --rm test npx vitest run tests/ui/chart-model.test.ts` | 29/29 passed |
| `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/hyperspace.spec.ts -g 'chart arrow keys select'"` | 1 passed |
| `docker compose run --rm lint` | exit 0 (eslint and prettier --check clean) |
| `docker compose run --rm typecheck` | clean (tsc both configs, no output) |
| `docker compose run --rm verify` (run 1) | exit 1: unit 1120/1120, assets:check clean, e2e 73 passed, 2 failed (flake, see above) |
| `docker compose run --rm verify` (run 2) | exit 1: unit 1120/1120, assets:check clean, e2e 74 passed, 1 failed (flake, see above) |

The full gate is therefore not green on this working tree. The plan's `docker compose run --rm verify` acceptance criterion is not met.

## Known Stubs

None.

## Threat Flags

None. The change adds no network, auth, storage or schema surface. It affects only the chart projection and arrow vector, as the plan's threat model describes.

## Next Phase Readiness

- Chart orientation and arrow routing are done. Phase 6 verification should re-read G-9 as reopened and reversed.
- The full `verify` gate needs a re-run on a quieter host or with the SwiftShader timeouts addressed before phase sign-off.
- Observation outside this plan's scope: in PROJECT.md the Key Decisions rows after the "Cancel an active hyperspace countdown" row are separated from the table by a blank line, so the rows at the end of the table render outside it. This is pre-existing at HEAD and was not changed.

---
*Phase: 06-hyperspace-navigation-persistence*
*Completed: 2026-11-07*
