---
phase: 06-hyperspace-navigation-persistence
plan: 12
subsystem: persistence
tags: [save-v2, writer-gate, allow-list, docs, decisions, gap-closure, gate]

requires:
  - phase: 06-hyperspace-navigation-persistence
    provides: "gap closures 06-07 (G-1), 06-08 (G-2), 06-09 (G-3), 06-10 (G-4, G-5, G-9 source comment), 06-11 (G-6, G-7, G-8)"
provides:
  - "Writer gate enforces the reader's system and station allow-lists (T-06-36)"
  - "Corrected cargo ceiling, reserved-F-key and pre-launch-anchor wording"
  - "Removed dead public surface: SaveLoadScreen.isOpen, ChartOverlay.paintCount, MAX_VERSION_SNIFF_CHARS export"
  - "G-9 chart-orientation and mass-blockage Key Decisions rows in PROJECT.md"
  - "06-GAP-CLOSURE.md: closure ledger for G-1..G-10, same-path findings and deferrals, with the observed full-gate result"
affects: [phase-6-reverification, phase-7-hardening]

tech-stack:
  added: []
  patterns:
    - "The writer gate and the reader share referent allow-list checks, so a blob the writer commits always parses"

key-files:
  created:
    - .planning/phases/06-hyperspace-navigation-persistence/06-GAP-CLOSURE.md
  modified:
    - src/persistence/save.ts
    - src/ui/save-load.ts
    - src/ui/chart.ts
    - src/input/keyboard.ts
    - tests/persistence/save-v2.test.ts
    - tests/persistence/autosave.test.ts
    - .planning/PROJECT.md

key-decisions:
  - "The chart stays north-up: the vertical divergence from Oolite's negative vscale is recorded as a decision, not flipped; the projection is unchanged"
  - "Oolite's ship-mass-blockage jump check is omitted in empty v1 space, where no mass-lockable ship exists; revisit when traffic arrives"

patterns-established:
  - "Writer-gate parity: each writer rejection has a test that asserts the reader returns corrupt for the same bytes"

requirements-completed: [NAV-01, NAV-02, NAV-03, NAV-04, NAV-05, NAV-06, SAVE-01, SAVE-02, SAVE-03, SAVE-04, SAVE-05, SAVE-06, WORLD-06]

coverage:
  - id: D1
    description: "isEncodedSaveValid rejects a saved system or station the reader's allow-lists omit, and a market good the allow-list does not know"
    requirement: "SAVE-01"
    verification:
      - kind: unit
        ref: "tests/persistence/save-v2.test.ts#the writer gate (isEncodedSaveValid)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Stale comments and test wording corrected: cargo ceiling, six reserved F-keys, pre-launch anchor (D-17)"
    verification:
      - kind: unit
        ref: "tests/persistence/autosave.test.ts#snapshotForSave"
        status: pass
    human_judgment: false
  - id: D3
    description: "Dead public surface removed: SaveLoadScreen.isOpen, ChartOverlay.paintCount, MAX_VERSION_SNIFF_CHARS export"
    verification:
      - kind: other
        ref: "docker compose run --rm typecheck and lint (no remaining src/ caller)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Two G-9 Key Decisions rows (chart orientation, mass-blockage omission) with Oolite source references"
    verification:
      - kind: other
        ref: "docker compose run --rm test sh -lc grep gate over .planning/PROJECT.md"
        status: pass
    human_judgment: false
  - id: D5
    description: "Gap-closure ledger reconciles G-1..G-10, same-path findings and deferrals, and records the observed full gate"
    verification:
      - kind: other
        ref: "docker compose run --rm verify (exit 0) and the ledger grep gate"
        status: pass
    human_judgment: false

duration: 45min
completed: 2026-11-07
status: complete

actuals:
  tokens: 6120
  tasks: 3
  commits: 3
plan_head_before: 8eb50d046d5cbfeccdf709658ceebc80e8e3e0b9
plan_head_after: 7266232c39926c473d5de6c31a765fb3502910df
---

# Phase 6 Plan 12: Writer allow-list gate, stale-surface cleanup, G-9 decisions, and the full-gate ledger

**The autosave writer now rejects any snapshot whose system or station the reader would reject, the stale comments and dead surface are gone, the two G-9 chart decisions are recorded, and the full `docker compose run --rm verify` gate is green (exit 0) with the closure ledger written.**

## Performance

- **Duration:** about 45 min
- **Started:** 2026-11-07 (sequential run on `main`, after 06-11)
- **Completed:** 2026-11-07T13:19Z
- **Tasks:** 3 of 3
- **Files modified:** 8 (7 modified, 1 created)

## Accomplishments

- `isEncodedSaveValid` checks `allow.systems` and `allow.stations` after the strict schema, so writer and reader share the same referent allow-lists.
- Two writer rejections plus a market-good rejection each pin the reader's `corrupt` verdict on the same bytes.
- The worst-case size fixture now allow-lists its control-character referents, so it still proves the size bound under the enforced gate.
- Dead public surface removed: `SaveLoadScreen.isOpen`, `ChartOverlay.paintCount` (the `data-paints` attribute stays for the browser proof), and the `MAX_VERSION_SNIFF_CHARS` export.
- Stale wording corrected: the cargo ceiling (17 schema, 16 tradeable), the six reserved F-keys, and the pre-launch anchor (D-17).
- Two G-9 Key Decisions rows added to PROJECT.md with `GuiDisplayGen.m` and `PlayerEntity.m` references; no existing row changed.
- `06-GAP-CLOSURE.md` maps G-1..G-9 and G-10 to plans, commits, evidence and deferrals.
- Full gate observed: `docker compose run --rm verify` exited 0.

## Task Commits

1. **Task 1: Enforce the reader allow-lists in the writer gate and remove the stale surface** - `552f3c3` (fix)
2. **Task 2: Record the chart-orientation and mass-blockage decisions (G-9)** - `7437baf` (docs)
3. **Task 3: Run the full container gate and write the gap-closure ledger** - `7266232` (docs)

**Plan metadata:** this SUMMARY is committed as the next commit (docs: complete plan).

## Gate evidence (`docker compose run --rm verify`)

| Stage | Result |
| --- | --- |
| Lint (eslint and prettier --check) | exit 0 |
| Typecheck (both tsconfigs) | exit 0 |
| `assets:check` | no differences |
| Vitest | 89 of 89 files, 1110 of 1110 tests |
| Production build | built |
| Playwright | 74 passed, none failed |
| Overall | exit 0 |

The gate was run once, sequentially, on the working tree at `7437baf` plus the ledger. The ledger grep gate also passes in the container.

## Files Created/Modified

- `src/persistence/save.ts` - writer allow-list checks; corrected cargo comment; `MAX_VERSION_SNIFF_CHARS` made module-private
- `src/ui/save-load.ts` - removed `isOpen` from the interface and implementation
- `src/ui/chart.ts` - removed `paintCount` from the interface and getter
- `src/input/keyboard.ts` - reserved-F-key comments name the six keys
- `tests/persistence/save-v2.test.ts` - writer-gate block (four cases)
- `tests/persistence/autosave.test.ts` - pre-launch anchor case, corrected post-launch case, allow-listed worst-case fixture
- `.planning/PROJECT.md` - two G-9 Key Decisions rows
- `.planning/phases/06-hyperspace-navigation-persistence/06-GAP-CLOSURE.md` - closure ledger

## Decisions Made

- The chart stays north-up. The vertical divergence from Oolite's negative `vscale` is a recorded decision; the projection is unchanged.
- Oolite's ship-mass-blockage jump check is deliberately omitted in empty v1 space, because no mass-lockable ship exists. Revisit when traffic arrives.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Worst-case size fixture rejected by the enforced writer gate**
- **Found during:** Task 1 (targeted vitest run after the writer change)
- **Issue:** `fits the maximum tuple inside MAX_SAVE_CHARS` used control-character system and station keys that its allow-list did not contain. The new gate correctly rejected them, so the write did not commit.
- **Fix:** The test keeps its worst-case referents and allow-lists them, passing `systems` and `stations` sets that contain exactly those keys. The size proof is unchanged.
- **Files modified:** `tests/persistence/autosave.test.ts`
- **Verification:** targeted vitest 2 files green; full gate green
- **Committed in:** `552f3c3`

**2. [Rule 1 - Bug] Stale pre-launch wording was partly wrong, not just outdated**
- **Found during:** Task 1 (reading `snapshotForSave` and the sim launch path)
- **Issue:** The plan asked for the first autosave case to describe the pre-launch anchor while keeping the `CLOCK_START + 600` assertion. That case calls `launch` first, so its state is post-`beginLaunch`. It cannot describe the pre-launch anchor and keep that assertion at once.
- **Fix:** The +600 case is kept and renamed to say it copies the clock of the state it is given. A new case takes the snapshot while docked, before any launch command, and asserts `CLOCK_START`, which is the shipped D-17 anchor. The header cites D-17.
- **Files modified:** `tests/persistence/autosave.test.ts`
- **Verification:** targeted vitest green; full gate green
- **Committed in:** `552f3c3`

**3. [Rule 2 - Missing critical] Writer-gate parity tests added beyond the plan's minimum**
- **Found during:** Task 1
- **Issue:** The plan asked for two writer-gate rejection cases. The writer had no direct test at all.
- **Fix:** Added an accept case, a station case, and a market-good case. Each rejection also asserts that `parseSave` returns `corrupt` for the same bytes, which pins writer/reader parity.
- **Files modified:** `tests/persistence/save-v2.test.ts`
- **Committed in:** `552f3c3`

**Total deviations:** 3 auto-fixed (1 bug in a fixture, 1 wording correction, 1 test addition). **Impact:** all three stay inside the plan's owned files and the plan's stated intent. No behaviour change beyond the writer rejecting the out-of-allow-list referents that the reader already rejected.

## Issues Encountered

- The first targeted run failed on the worst-case size fixture (see deviation 1). Fixed in the same task.
- `06-REVIEW-DISPOSITION.md` still lists every review finding as `open`. It is outside this plan's file set, so it was not changed. The ledger is the closure record; the verifier should update the disposition file.
- The plan's `actuals.tokens` estimate was 48,000. The realized diff is about 6,120 tokens by chars/4 (24,481 characters over three commits), so the estimate was high for this plan.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 6 gap closure is complete: G-1..G-10 are closed or carry explicit deferrals in `06-GAP-CLOSURE.md`.
- Re-verification should start from `06-VERIFICATION.md` and the three blocker reproductions listed in the ledger, sampling live state after a resumed fixed step.
- Deferred to Phase 7: WR-04 browser negative control (no injection seam), WR-05 dead wiring, IN-06 overlay modality, and UI visual debt. IN-01 and WR-06 are accepted.

## Self-Check

- [x] `src/persistence/save.ts` contains the allow-list checks in `isEncodedSaveValid`
- [x] Commits `552f3c3`, `7437baf` and `7266232` exist on `main`
- [x] `06-GAP-CLOSURE.md` exists and the ledger grep gate passes in the container
- [x] Full gate `docker compose run --rm verify` exited 0

## Self-Check: PASSED

---
*Phase: 06-hyperspace-navigation-persistence*
*Completed: 2026-11-07*
