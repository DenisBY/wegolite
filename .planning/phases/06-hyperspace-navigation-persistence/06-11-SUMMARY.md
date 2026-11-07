---
phase: 06-hyperspace-navigation-persistence
plan: 11
subsystem: app
tags: [hyperspace, countdown, arrival, save-load, hud, status-overlay, test-hook, vitest, playwright]

# Dependency graph
requires:
  - phase: 06-hyperspace-navigation-persistence
    provides: "the countdown and jump sim (06-01/06-04), the arrival pose and v2 snapshot (06-02/06-04), the F2 Save/Load screen (06-05), the reload proof (06-06); the gap list in 06-VERIFICATION.md"
provides:
  - "Pure array-aware begin/cancel mapping, so two H presses drained into one frame start then cancel"
  - "Guarded committed-arrival install: destination market and scene are built before any live reference moves; a throw shows the failure surface and freezes the sim"
  - "Committed hyperspaceTargetId retained through the arrival snapshot, HUD and F5 line"
  - "Global #status overlay driven by the live system after boot, a jump and a Load"
  - "MessageQueue.clear(), a dock-feedback reset and a rebound ?test=1 hook in the in-session Load install block"
  - "Required probe.messages queue depth, published from updateProbe and set at both probe construction sites"
affects: [phase 6 re-verification (06-VERIFICATION gaps G-6, G-7, G-8, IN-02), phase 7 UI hardening]

# Actuals (#2632) - chars/4 over the full content of the 9 files changed (HEAD at 7a383e9..4277605)
actuals:
  tokens: 46181
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A drained command array is mapped in input order, tracking liveness across the array rather than from frame-start state"
    - "Every throwing operation of a committed jump runs before the first live reference moves; the install block is plain assignments"
    - "Load resets per-session UI by replacing instances (a fresh dock-feedback object) and by clearing queues, not by adding reset APIs"

key-files:
  created:
    - src/app/hyperspace-commands.ts
    - tests/app/hyperspace-commands.test.ts
  modified:
    - src/app/game-session.ts
    - src/app/probe.ts
    - src/main.ts
    - src/render/hud/messages.ts
    - tests/hud/format.test.ts
    - tests/e2e/hyperspace.spec.ts
    - tests/e2e/save-load.spec.ts

key-decisions:
  - "mapHyperspaceBeginEdges walks the drained array in input order: a begin while live becomes a cancel, a begin while not live is copied and marks the countdown live, and a cancel clears liveness. The helper never mutates its input. (NAV-04 choice; flagged unresolved in the plan.)"
  - "The committed hyperspaceTargetId is kept through the arrival, as PROJECT.md:126-127 and Oolite's unchanged target_system_id require. The code already did this; the change records it in a comment and asserts it in the browser. (NAV-05 choice; flagged unresolved in the plan.)"
  - "A failed arrival build calls showBootFailure with the fixed reload copy, publishFailure with the thrown message, and sets paused so the sim stops behind the failure surface. Profile, market, seed, target and the system/scene/layout triple are untouched on that path."
  - "The fixed boot string `Wegolite — new game: Lave` in main.ts is removed. The session owns #status through syncStatusOverlay (IN-02)."
  - "An in-session Load clears the message queue at install time, resets the scrape throttle, replaces the dock-feedback instance, rebinds the ?test=1 hook to the restored state only when the hook was enabled at boot, and re-checks saveScreenOpen after the IndexedDB await. The testTainted latch is deliberately not cleared. (SAVE-03/SAVE-05 choices; flagged unresolved in the plan.)"
  - "probe.messages is a required field, not optional, so a probe literal that forgets to publish queue state fails to typecheck."

patterns-established:
  - "Negative controls are run by removing one production line, confirming the named proof fails for that reason, and restoring the file (checked with cmp against a saved copy)."

requirements-completed: []
requirements-addressed: [NAV-04, NAV-05, SAVE-03, SAVE-05]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Two H presses drained into one frame start then cancel; a live begin cancels; a cancel-then-begin restarts; input is not mutated"
    requirement: "NAV-04"
    verification:
      - kind: unit
        ref: "tests/app/hyperspace-commands.test.ts#mapHyperspaceBeginEdges"
        status: pass
    human_judgment: false
  - id: D2
    description: "A committed jump keeps its target in the arrival snapshot, the HUD line and F5, and after reload; #status names Diso after the jump and after Continue"
    requirement: "NAV-05"
    verification:
      - kind: e2e
        ref: "tests/e2e/hyperspace.spec.ts#chart target, countdown, abort, refusal, arrival and reload"
        status: pass
      - kind: e2e
        ref: "tests/e2e/autosave.spec.ts (arrival trigger matrix, target assertions unchanged)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A destination build failure is visible and publishes the failure probe; no profile, market, seed, target or scene is installed on that path"
    requirement: "NAV-05"
    verification:
      - kind: typecheck
        ref: "docker compose run --rm typecheck (catch path)"
        status: pass
    human_judgment: true
    rationale: "GameSession has no injection seam for enterSystemById, so the throw path has no browser negative control (per the plan; recorded as deferred WR-04). Only the success path is browser-proven."
  - id: D4
    description: "A message queued before an in-session Load is gone after it (queue depth bounded to the first-use hint), dock envelopes read zero, a Load closed during the read installs nothing"
    requirement: "SAVE-03"
    verification:
      - kind: unit
        ref: "tests/hud/format.test.ts#clear drops a non-empty queue and later enqueues still show"
        status: pass
      - kind: e2e
        ref: "tests/e2e/save-load.spec.ts#an in-session Load of an in-flight save returns to flight with the station hidden"
        status: pass
    human_judgment: false
  - id: D5
    description: "The ?test=1 hook mutates the live state the Load installed: setPosition(1,2,3) with setSpeed(0) settles the probe within 1e-3"
    requirement: "SAVE-05"
    verification:
      - kind: e2e
        ref: "tests/e2e/save-load.spec.ts#an in-session Load of an in-flight save returns to flight with the station hidden (step 5)"
        status: pass
    human_judgment: false

# Metrics
duration: "~30 min (approximate; plan start time was not recorded, estimated from the first tool call near 12:28Z)"
completed: 2026-11-07
status: complete
plan_head_before: 7a383e9
plan_head_after: 4277605540d6822b9e3bc19ef114c166fb8aeda3
commits: 3
---

# Phase 6 Plan 11: Same-frame H edges, guarded arrival and in-session Load reset Summary

**Two H presses in one frame now cancel, a committed arrival cannot half-apply and keeps its target, and an in-session Load clears the replaced session's HUD state while the test hook follows the live state.**

## Performance

- **Duration:** ~30 min (approximate; not recorded)
- **Started:** ~12:28Z (estimated)
- **Completed:** 2026-11-07T12:57Z (last task commit `4277605` at 12:57:17Z UTC)
- **Tasks:** 3
- **Files modified:** 9 (plus 2 created)

## Accomplishments

- G-6 closed: `mapHyperspaceBeginEdges` walks the drained command array in order. The frame's H pair becomes begin then cancel, so the countdown is zero after the step with no fuel or clock cost. The game-session mapping is one call, and the drained array is no longer mutated in place.
- G-7 closed: `handleHyperspaceJumped` generates the destination market and builds the destination scene inside one `try`, before any live reference moves. A throw shows the fatal surface, publishes the failure probe and freezes the sim. The success path installs profile, market, seed and arrival pose in one block of plain assignments. The committed target is kept, so the arrival autosave, HUD and F5 line keep naming the destination.
- G-8 closed: the Load path re-checks `saveScreenOpen` after the IndexedDB await. The install block clears the message queue, resets the scrape throttle, replaces the dock-feedback instance (both envelopes drop) and rebinds the `?test=1` hook to the restored state when the hook was enabled.
- IN-02 closed: `#status` is written by `syncStatusOverlay` after the boot install, after a jump and in the Load install block. The hard-coded `new game: Lave` write in `main.ts` is removed.
- `MessageQueue.clear()` and the required `probe.messages` depth are added, with both probe construction sites updated.

## Task Commits

Each task was committed atomically on `main`:

1. **Task 1: Map same-frame hyperspace edges against the live command sequence** - `e3e2f48` (fix)
2. **Task 2: Guard the committed arrival install and name the live system** - `2d48e54` (fix)
3. **Task 3: Reset the HUD and rebind the test hook on an in-session Load** - `4277605` (fix)

**Plan metadata:** recorded in the following `docs(06-11)` commit (SUMMARY.md and ROADMAP.md). STATE.md was updated on disk but is not staged; see "Tracking state" below.

## Files Created/Modified

- `src/app/hyperspace-commands.ts` (new) - pure `mapHyperspaceBeginEdges(commands, countdownLive)`
- `tests/app/hyperspace-commands.test.ts` (new) - five cases: begin+begin, live begin, cancel-then-begin, unrelated commands preserved and input not mutated, empty array
- `src/app/game-session.ts` - drained-array mapping call; guarded arrival; `syncStatusOverlay`; `bindTestHook`; post-await `saveScreenOpen` re-check; Load install resets
- `src/app/probe.ts` - required `messages: number` field and its `publishFailure` literal value
- `src/main.ts` - removed fixed `#status` write; `messages: 0` in the boot probe literal
- `src/render/hud/messages.ts` - `MessageQueue.clear()`
- `tests/hud/format.test.ts` - non-empty `clear()` case
- `tests/e2e/hyperspace.spec.ts` - post-jump target and `#status` assertions; `#status` after Continue
- `tests/e2e/save-load.spec.ts` - in-flight in-session Load proof: relaunch, dock through the pose seam, pre-load message captured on a docked F2 screen, queue and envelope reset after Load, hook rebind proof

## Decisions Made

See `key-decisions` in the frontmatter. Three of the plan's assumption flags (NAV-04, NAV-05, SAVE-03/SAVE-05) describe choices made here; those requirement IDs are listed under `requirements-addressed`, not `requirements-completed`, because the plan itself marks them unresolved for manual review.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed the fixed `#status` boot string from `main.ts`**
- **Found during:** Task 2
- **Issue:** `main.ts` wrote `Wegolite — new game: Lave` to `#status` at boot, so the overlay could never name the live system (G-8/IN-02 truth). The plan listed `main.ts` only for the probe literal.
- **Fix:** Removed the write; the session owns `#status` through `syncStatusOverlay`.
- **Files modified:** `src/main.ts`
- **Commit:** `2d48e54`

**2. [Rule 2 - Missing critical functionality] Freeze the sim after a failed arrival**
- **Found during:** Task 2
- **Issue:** The plan's failure path shows the surface and returns. The sim has already committed the jump, so the loop would keep stepping and could autosave the advanced clock behind the failure surface.
- **Fix:** The catch sets `paused = true`, which stops `frame()` from stepping or draining commands.
- **Files modified:** `src/app/game-session.ts`
- **Commit:** `2d48e54`

**3. [Test-harness fix] Wait for F2 to close before launching in the in-flight Load proof**
- **Found during:** Task 3, first isolated run
- **Issue:** `Escape` followed immediately by `Digit1` raced the F2 close, so the launch never started and the wait timed out at step 1. The failure was independent of the code change; the page snapshot showed the ship still docked with the F2 overlay closed.
- **Fix:** `await expect(page.locator("#save-load")).toBeHidden()` between the two keys, the same wait `save-load.spec.ts` uses at its existing launch-after-Escape step.
- **Files modified:** `tests/e2e/save-load.spec.ts`
- **Commit:** `4277605`

### Plan-prediction mismatch (code unchanged)

The plan predicted that without `messages.clear()` the captured pre-load `hud.message` would still equal the captured text. The negative control did not show that: the head text changed after the Load while the queue depth stayed at 4. The discriminating assertion is therefore the queue-depth bound (`expect(after.messages).toBeLessThanOrEqual(1)`), which fails with 4. The head-text assertions are kept because they are correct, but they are not the proof.

### Test change to an existing test

The in-flight in-session Load test now boots with `/?test=1`, relaunches, and docks through the pose seam before the Load. Its original assertions (restore pose, speed, clock, market, `#docked` hidden, byte identity, the `__loadMarker`) are unchanged and still run after the Load.

## Verification

| Gate | Command | Result |
| --- | --- | --- |
| Targeted unit | `docker compose run --rm test npx vitest run tests/app/hyperspace-commands.test.ts tests/hud/format.test.ts` | 2 files, 15 tests passed |
| Full unit | `docker compose run --rm test` | 89 files, 1105 tests passed |
| Typecheck | `docker compose run --rm typecheck` | exit 0 (run after each task and at the end) |
| Lint | `docker compose run --rm lint` (eslint + prettier) | exit 0 |
| Browser, final tree | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/hyperspace.spec.ts tests/e2e/save-load.spec.ts tests/e2e/autosave.spec.ts"` | 28 passed (hyperspace 1, save-load 8, autosave 19), exit 0 |

The full `verify` gate was not run; the targeted gates above cover every file this plan touched and the specs the plan names.

### Negative controls (each restored after the run, confirmed with `cmp`)

- Removing `messages.clear()` from the Load install: the in-flight test fails at `expect(after.messages).toBeLessThanOrEqual(1)` with `Received: 4`.
- Removing `bindTestHook(restored.state)` from the Load install: the in-flight test fails at the step-5 probe wait (30 s timeout) that requires the probe to settle on `[1, 2, 3]`.

The throw path of the arrival catch has no browser negative control; see Deferred below.

## Known Stubs

None.

## Threat Flags

None. No new network endpoint, auth path, file access or schema change was introduced. The failure surface reuses `showBootFailure` and `publishFailure`.

## Deferred / Residual

- **WR-04 browser negative control (deferred, per plan):** `GameSession` has no injection seam for `enterSystemById`. The catch is typechecked and the success path is browser-proven.
- **Residual inside the fatal path:** `enterSystemById` calls `scenes.enterSystem` before its layout check. If the layout check throws after the scene manager has switched, the scene manager shows the destination while `system` and `layout` still name the origin. The failure surface freezes the sim and requires a reload, so no save is written from that state, but the in-memory split is real.
- **Mapper edge:** a `beginHyperspace` that the sim refuses (docked or unfunded) is still treated as live by the mapper. A second begin in the same array therefore becomes a cancel, which the sim would also ignore. The only observable loss is a press drained after a refused begin and a launch in the same frame, which is negligible and is documented in the module comment.
- **Failure copy:** the mid-session failure text reads `Wegolite could not start: Hyperspace arrival failed. Reload the page to restart Wegolite.` That wording comes from the single boot-failure surface the plan chose; it is accurate but its "could not start" prefix is awkward mid-session. Flagged for the UI review pass.
- **Empty status before a session:** with the boot string removed, `#status` is empty until the session installs a system. The title screen no longer shows `new game: Lave`.

## Tracking state

`ROADMAP.md` was updated through `roadmap update-plan-progress`. `STATE.md` was advanced on disk. Both files already had uncommitted changes from the working tree at run start (`STATE.md` was modified before this plan), so `STATE.md` is not staged and not committed by this plan. The docs commit stages only this SUMMARY and `ROADMAP.md`.

## Self-Check

- Commits present on `main`: `e3e2f48`, `2d48e54`, `4277605` (verified with `git log`).
- Files listed under key-files exist, including the two created files.
- Requirements NAV-04, NAV-05, SAVE-03 and SAVE-05 are not marked complete; the plan flagged their choices as unresolved for manual review, and the verifier should re-check them.
