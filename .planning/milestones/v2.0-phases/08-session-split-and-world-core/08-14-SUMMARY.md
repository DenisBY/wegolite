---
phase: 08-session-split-and-world-core
plan: 14
subsystem: app
tags: [test-flags, manual-clock, advance-ticks, sim-driver, taint, d-09, d-10, found-14]
status: complete

requires:
  - phase: 08-session-split-and-world-core
    provides: 08-10 sim driver (advanceFrame, stepOnce); 08-12 frame-loop, start-session and the facade that builds every module's deps; 08-04 probe publisher (bindTestHook)
provides:
  - src/app/session/test-flags.ts, TestFlags and parseTestFlags(search)
  - ctx.runtime.testFlags, read once at start-up in startSession
  - src/app/session/sim-driver.ts, MAX_ADVANCE_TICKS (200000), advanceTicks(n) and one private drain shared with advanceFrame
  - the manual-clock branch in src/app/session/frame-loop.ts
  - markHookMutation() returned by createProbePublisher and passed to the sim driver
affects: [08-15, 08-16]

plan_head_before: bf6731c4fdbdb71873058fd5d7f5746111bee5c0
plan_head_after: 83b112e3bd6f998eacbbb64b49b66a7dda9b83fd
actuals:
  tokens: 8900
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "one private drain function holds the command drain, launch filter, pre-launch autosave, hyperspace edge mapping and input frame, and both advanceFrame and advanceTicks call it, so the manual clock cannot drift from the realtime path"
    - "the hook's taint callback is a named function (markHookMutation) that the hook and the driver share, instead of a second copy of the taint and redraw request"
    - "a refusal table test asserts the full no-op: unchanged tick, no step, no drain, no input frame, no taint, pending untouched"

key-files:
  created:
    - src/app/session/test-flags.ts
    - tests/app/session/test-flags.test.ts
  modified:
    - src/app/session/context.ts
    - src/app/session/start-session.ts
    - src/app/session/sim-driver.ts
    - src/app/session/frame-loop.ts
    - src/app/session/probe-publisher.ts
    - src/app/game-session.ts
    - tests/app/session/sim-driver.test.ts
    - tests/app/session-order.test.ts

key-decisions:
  - "traffic is the effective setting: true without the hook (production), and under the hook only for traffic=1; the research sketch's `hook && traffic === 1` is not used (D-10 refinement kept, as the plan states)"
  - "startSession sets testFlags and testHookEnabled together at the top, right after the re-entry guard; the later `if (testHookEnabled) bindTestHook(...)` keeps its position, and the Load rebind in save-controller reads the same field"
  - "advanceTicks refuses (tick unchanged, nothing tainted) when there is no input source as well as no state, because the drain needs one; the plan lists only the state case"

patterns-established:
  - "a test-only stepping entry refuses before it taints: every guard (disposed first, flag, count, pause, overlays, state) runs before markHookMutation, so a refused call leaves no trace"

requirements-completed: []

coverage:
  - id: D1
    description: "parseTestFlags is pure and exact: hook only for test=1, manualClock only with the hook and clock=manual, traffic true without the hook and traffic=1 under it; read once into ctx.runtime.testFlags at start-up"
    requirement: FOUND-14
    verification:
      - kind: unit
        ref: "tests/app/session/test-flags.test.ts (the 10-row table plus purity)"
        status: pass
    human_judgment: false
  - id: D2
    description: "advanceTicks(n) steps exactly n ticks with taint first, the drained commands on the first tick only and one shared, unmutated input frame; it refuses every unsafe call with no side effect, stops early on pause, overlay or dispose, and propagates a throwing step with the session already tainted"
    requirement: FOUND-14
    verification:
      - kind: unit
        ref: "tests/app/session/sim-driver.test.ts#the manual clock (tracer), #advanceTicks, the refusal table, #advanceTicks, the stepping contract"
        status: pass
    human_judgment: false
  - id: D3
    description: "The manual-clock frame keeps every phase except the sim driver and draws at alpha 1; the flag-less frame order is unchanged"
    requirement: FOUND-14
    verification:
      - kind: unit
        ref: "tests/app/session-order.test.ts#frame phase order (manual clock row and flag-less row)"
        status: pass
    human_judgment: false
  - id: D4
    description: "markHookMutation has the same observable effects as a hook mutation (taint, probe.test.tainted, a redraw request) and the probe shape, probe.ts and the shape fixture are unchanged"
    requirement: FOUND-14
    verification:
      - kind: unit
        ref: "tests/app/session/sim-driver.test.ts#markHookMutation, taint equivalence with the hook's mutate callback"
        status: pass
      - kind: other
        ref: "git diff --quiet bf6731c -- src/app/probe.ts tests/fixtures/probe-shape.json tests/golden exits 0; docker compose run --rm verify exit 0 (134 unit files, 2362 tests, 2 skipped; 26 Chromium specs)"
        status: pass
    human_judgment: false
---

# Phase 8 Plan 14: Manual clock and advanceTicks (driver half) Summary

The session reads `?test=1`, `clock=manual` and `traffic` once at start-up, the frame loop stops self-stepping under the manual clock, and `advanceTicks(n)` steps exactly n fixed ticks through the real driver, tainting the session first and refusing every unsafe call. No probe change.

## Accomplishments

- `parseTestFlags(search)` (`src/app/session/test-flags.ts`) with exact string comparisons; `clock` and `traffic` are inert without exactly `test=1`; read once into `ctx.runtime.testFlags` in `startSession`, replacing the inline `new URLSearchParams` read (the only remaining one is in the parser).
- `sim-driver.ts` factors the drain (keyboard commands plus `pending`, launch filter, pre-launch autosave on a docked home-screen launch, hyperspace edge mapping, one input frame stored in `ctx.core.currentFrame`) into one private `drain`, used by `advanceFrame` (behaviour unchanged) and the new `advanceTicks`.
- `advanceTicks(n)`: refuses (live tick, or 0 without a state; no step, no drain, no taint) when disposed (checked first), the manual clock is off, `n` is not a safe integer in 1..`MAX_ADVANCE_TICKS` (200000), the session is paused, the chart or Save/Load screen is open, or there is no state. Otherwise it calls `markHookMutation()`, drains once, steps `n` times with the commands on the first tick only and one shared input frame, and stops after any step that disposes or pauses the session or opens an overlay. A throwing step propagates (documented in the doc comment).
- `frame-loop.ts`: under `manualClock` the not-paused branch skips `simDriver.advanceFrame` and uses alpha 1, reaching the same single `renderFrame(alpha, shouldDraw())`.
- `probe-publisher.ts` returns `markHookMutation()`, the former inline hook callback (still the one `redrawGate.request();` there), and `bindTestHook` passes it to `createTestHook`; the facade hands the driver a late-bound wrapper.

## Task Commits

1. Task 1 (tracer): `dcfecaf` feat(08-14): add the test-flag parser, the manual clock and advanceTicks
2. Task 2 (TDD): `83b112e` test(08-14): pin the advanceTicks refusal and stepping contract and the manual frame order

## Verification

- `docker compose run --rm test npx vitest run` over test-flags, sim-driver, session-order (plus redraw-gate, economy-purity, probe-publisher, start-session, save-controller for the tracer): all green; sim-driver.test.ts 19 -> 42 tests, session-order.test.ts 30 -> 32.
- `docker compose run --rm typecheck`, `lint`: clean. `docker compose run --rm verify` (run once, after both commits): exit 0, 134 unit files / 2362 tests (2 skipped), 26 Chromium specs, probe-shape spec included. No flaky retry was needed.
- Acceptance: `new URLSearchParams` appears once under src/app (test-flags.ts); `MAX_ADVANCE_TICKS = 200_000` once; `manualClock` in frame-loop.ts; five `redrawGate.request();` and one `renderFrame(alpha, shouldDraw())`; probe.ts, probe-shape.json and tests/golden unchanged since the plan base; no pre-existing test title in sim-driver.test.ts or session-order.test.ts was removed or renamed (comm diff empty for both); the only removed lines in those two test files are the vitest import, the driver import and the harness options signature.
- Not run: `verify-full` (the plan does not require it).

## Deviations from Plan

### Auto-fixed Issues

None for correctness. Two process notes:

1. **[Process] test-flags.test.ts landed in the Task 1 commit** (`dcfecaf`) instead of Task 2, because the tracer needed `parseTestFlags` and its table was written beside it. Task 2 then covered the driver, taint-equivalence and frame-order rows.
2. **[Process] Task 2 had no RED phase.** The tracer in Task 1 already implemented advanceTicks, the refusal guards and the manual frame branch, so the Task 2 tests passed on first run; they were written from the plan's behaviour list, not from the code. A throwing-step, early-stop and refusal row each assert a distinct no-op, so removing the corresponding guard fails them.
3. **[Rule 2 - Missing critical] advanceTicks also refuses without an input source** (the drain dereferences it); the plan only names the no-state case. The row is covered by the same no-op assertions.

**Total deviations:** 1 auto-added guard, 2 process notes. **Impact:** none on scope; the file set is the plan's ten.

## Known Stubs

None.

## Threat Flags

None. `advanceTicks` is not on the hook yet (plan 08-16), so no new reachable surface exists in this plan. Residual T-08-29 (a crafted `?test=1` page can freeze its own tab by calling the hook repeatedly) is accepted in the plan.

## Next Phase Readiness

Plan 08-15 takes the `traffic` flag from `ctx.runtime.testFlags` and plugs the world into `stepOnce`; plan 08-16 exposes `advanceTicks` and `worldHash` on the hook in the one deliberate probe commit and proves browser and Vitest parity. FOUND-14 stays open (shared with 08-15 and 08-16; `requirements.ready-ids` reports it blocked).

## Self-Check: PASSED

- Files exist: src/app/session/test-flags.ts, tests/app/session/test-flags.test.ts (FOUND).
- Commits exist: dcfecaf, 83b112e (both ancestors of HEAD); `git rev-list --count bf6731c..HEAD` before this SUMMARY = 2.
