---
phase: 04-manual-docking
plan: 04
subsystem: simulation
tags: [docking-computer, credits, equipment, tech-level, keyboard-chord, tdd, e2e]

# Dependency graph
requires:
  - phase: 04-manual-docking
    provides: the measured dock port and corridor/arming rules (04-01/04-02) and the contact pipeline (04-03) that the docked pose and the in-flight gate share
provides:
  - "PlayerProfile, newProfile, canPurchase, purchase, formatCredits, setCredits, grantCredits"
  - "loadEquipment/parseEquipment/findEquipment over the strict equipment schema"
  - "dockWithComputer(state, layout, hasComputer) and DOCK_COMPUTER_KEY"
  - "StepOptions.equipment and the terminalTransition clock guard"
  - "Command {kind:'dockingComputer'}, dockDenied, and docked.clockDelta usage"
  - "REQUIRES_SHIFT chord-aware keyDown with a fresh command object per keydown"
  - "DockedPanel.setCredits/setDockComputer and probe.dock.lastClockDelta"
affects: [04-05]

# Actuals (#2632) — chars/4 over the realized src+tests+index diff, same scale as the estimate.
actuals:
  tokens: 18329
  tasks: 3
  commits: 4
  plan_head_before: 5b94b7f9db913af8eea2697fc5aa9574aa36e84e
  plan_head_after: 605bfcc14d91d66da07047c7df66f370f9b09345
  # (the SUMMARY commit and the STATE/ROADMAP commit are separate)

tech-stack:
  added: []
  patterns:
    - "Ownership travels beside a command (StepOptions.equipment), never inside it"
    - "Command-phase terminal transitions suppress the +dt clock so launch and computer dock are exact"
    - "A chord resolves by partitioning bound actions into shift-required and ordinary sets"
    - "The purchase price is validated from the catalogue before any credits arithmetic"

key-files:
  created:
    - src/sim/dock/computer.ts
    - src/sim/player/profile.ts
    - src/content/equipment.ts
    - tests/sim/dock-computer.test.ts
    - tests/sim/player-profile.test.ts
    - tests/sim/dock-transitions.test.ts
  modified:
    - src/sim/commands.ts
    - src/sim/events.ts
    - src/sim/flight/step.ts
    - src/input/actions.ts
    - src/input/keyboard.ts
    - src/ui/docked.ts
    - index.html
    - src/app/game-session.ts
    - src/app/probe.ts
    - tests/input/bindings.test.ts
    - tests/settings/schema.test.ts
    - tests/e2e/docking.spec.ts
    - .planning/PROJECT.md

key-decisions:
  - "The TL 9 requirement is enforced against the raw System.techLevelRaw, so Lave (raw 4) refuses EQ_DOCK_COMP and Phase 5 reuses canPurchase unchanged"
  - "canPurchase reports the tech-level refusal before affordability, and validates the price before any credits comparison so NaN cannot pass"
  - "The dockingComputer command is payload-free; the session derives a read-only equipment set from the profile each frame"
  - "Every mode-changing command is gated on modeAtStart, and terminalTransition stops step 5 so a computer dock adds exactly 1200 s"
  - "When the item is owned, the panel prefers 'Already fitted' over the tech-level reason; canPurchase keeps its techLevel-first order for a fresh purchase"
  - "Purchase durability is handed to 04-05 through the session-level onProfileChanged seam; this plan calls it after every accepted change"
  - "The ?test=1 hook grants only a validated catalogue key and marks the same testTainted flag; it never persists"

patterns-established:
  - "A clock contract is proved once as a four-row matrix rather than re-stated per test"
  - "Keyboard chords are resolved by an explicit REQUIRES_SHIFT set in the input layer, not by a second binding table"
  - "A disabled purchase control is backed by a second canPurchase check in the click path"

requirements-completed: [DOCK-05]

coverage:
  - id: D1
    description: "Pure credits and purchase maths: new game 1000 decicredits, exact 14999/15000 boundaries, owned refusal, catalogue price, integer safety"
    requirement: DOCK-05
    verification:
      - kind: unit
        ref: "tests/sim/player-profile.test.ts#deducts exactly the catalogue price and appends the key once"
        status: pass
      - kind: unit
        ref: "tests/sim/player-profile.test.ts#accredits exactly 15000 and refuses 14999"
        status: pass
      - kind: unit
        ref: "tests/sim/player-profile.test.ts#refuses every invalid price shape"
        status: pass
    human_judgment: false
  - id: D2
    description: "The TL 9 gate is real: Lave refuses EQ_DOCK_COMP and a synthetic TL 9 system accepts it"
    requirement: DOCK-05
    verification:
      - kind: unit
        ref: "tests/sim/player-profile.test.ts#refuses a TL 9 item at Lave (raw techLevel 4) even with enough credits"
        status: pass
      - kind: unit
        ref: "tests/sim/player-profile.test.ts#accepts a TL 9 item on a synthetic TL 9 system"
        status: pass
      - kind: e2e
        ref: "tests/e2e/docking.spec.ts#the docked panel shows real credits and refuses the TL 9 computer at Lave"
        status: pass
    human_judgment: false
  - id: D3
    description: "Shift+C with the computer fitted docks on the same tick, adds exactly 1200 s and advances neither flightTime nor stationAngle"
    requirement: DOCK-05
    verification:
      - kind: unit
        ref: "tests/sim/dock-computer.test.ts#docks on the same tick with exactly +1200 s and no flight-time advance"
        status: pass
      - kind: unit
        ref: "tests/sim/dock-transitions.test.ts#computer dock: tick +1, exactly +1200 s, no flight time"
        status: pass
      - kind: e2e
        ref: "tests/e2e/docking.spec.ts#Shift+C with the computer granted docks instantly with exactly 1200 s"
        status: pass
    human_judgment: false
  - id: D4
    description: "The aegis gate and refusals: exactly at 51,200 m docks, one metre beyond denies, missing equipment denies, and plain C never fires"
    requirement: DOCK-05
    verification:
      - kind: unit
        ref: "tests/sim/dock-computer.test.ts#docks exactly at the aegis boundary and denies one unit beyond it"
        status: pass
      - kind: unit
        ref: "tests/input/bindings.test.ts#requires Shift for the docking computer and never fires on plain C"
        status: pass
      - kind: e2e
        ref: "tests/e2e/docking.spec.ts#Shift+C beyond the station aegis stays in flight and says why"
        status: pass
    human_judgment: false
  - id: D5
    description: "One mode-changing transition per tick: a dock and a launch drained together cannot both take effect"
    requirement: DOCK-05
    verification:
      - kind: unit
        ref: "tests/sim/dock-computer.test.ts#docks once when Shift+C and launch are drained on the same tick"
        status: pass
      - kind: unit
        ref: "tests/input/bindings.test.ts#queues a fresh command object for every Shift+C keydown"
        status: pass
    human_judgment: false
  - id: D6
    description: "The docked purchase line reads clearly and the reason copy is legible in the panel's actual layout"
    requirement: DOCK-05
    verification: []
    human_judgment: true
    rationale: "Automation pins the exact strings, the disabled state and the reason; whether the extra line reads well beside credits/ship/fuel and the Launch control is a visual/layout judgement."

duration: 44 min
completed: 2026-11-05
status: complete
---

# Phase 4 Plan 4: Docking Computer, Credits and the TL Gate Summary

**A TL-gated 15,000-decicredit docking computer bought from the docked panel, Shift+C instant docking with exactly +1200 s, and a four-row transition matrix proven in both the sim and the browser.**

## Performance

- **Duration:** ~44 min
- **Started:** 2026-11-05T08:40:00Z (approximate)
- **Completed:** 2026-11-05T09:24:16Z
- **Tasks:** 3 (one tracer, one TDD expansion, one UI/e2e expansion)
- **Files modified:** 19

## Accomplishments

- Added the payload-free `dockingComputer` command, the `dockWithComputer` transition and the `dockDenied` event; ownership is a read-only equipment set on `StepOptions`, so no shared command object can carry a forged `installed` flag.
- Made the clock contract exact: every mode-changing command is gated on `modeAtStart`, and a command-phase `terminalTransition` suppresses step 5, so launch adds exactly +600 s and the computer dock exactly +1200 s while `flightTime` and `stationAngle` do not move.
- Made Shift+C a real chord: a chord-aware `keyDown` partitions the code's actions by `REQUIRES_SHIFT`, plain C queues nothing, a KeyC rebind still separates pause from docking, and each keydown pushes a fresh command object.
- Added the pure profile (`newProfile`, `canPurchase`, `purchase`, `formatCredits`, `setCredits`, `grantCredits`) and the validated equipment loader; prices are catalogue-sourced and a zero, negative, fractional or non-finite price is refused before arithmetic.
- Enforced the TL 9 gate against the session's raw `System.techLevelRaw`: Lave (raw 4) refuses the computer in the panel and in the click path, while a synthetic TL 9 system accepts it.
- Replaced the constant `100.0 Cr` with the live balance through `setCredits`, added the one D-10 purchase line and reason field, and wired the 04-05 `onProfileChanged` seam.
- Proved the browser chain: the Lave refusal, a granted computer docking on Shift+C with `probe.dock.lastClockDelta === 1200`, plain C doing nothing, and the beyond-aegis refusal leaving the ship in flight with the far message.

## Task Commits

Each task was committed atomically; Task 2 followed RED → GREEN:

1. **Task 1 (tracer): Shift+C docks with exactly twenty minutes** - `d0c1412` (feat)
2. **Task 2 RED: failing profile, equipment and TL-gate tests** - `48e6c29` (test)
3. **Task 2 GREEN: pure profile, catalogue and TL gate** - `aa70717` (feat)
4. **Task 3: docked purchase line, session wiring and browser proof** - `605bfcc` (feat)

**Plan metadata:** the docs commits that follow this file.

## Files Created/Modified

- `src/sim/dock/computer.ts` - `dockWithComputer`, the aegis/ownership gates and the exact +1200 s transition
- `src/sim/player/profile.ts` - credits, equipment, `canPurchase`, `purchase`, formatting and grant validation
- `src/content/equipment.ts` - `?raw` loader, strict schema validation, duplicate rejection and `findEquipment`
- `src/sim/commands.ts` - the payload-free `dockingComputer` command
- `src/sim/events.ts` - `dockDenied` with the two refusal reasons
- `src/sim/flight/step.ts` - `StepOptions.equipment`, `modeAtStart` command gates and `terminalTransition`
- `src/input/actions.ts` - the `dockingComputer` action, `KeyC` default and Shift label
- `src/input/keyboard.ts` - `REQUIRES_SHIFT`, chord partitioning and fresh command objects
- `src/ui/docked.ts` - `setCredits`, `setDockComputer`, the buy control and the reason field
- `index.html` - the docking-computer row, reason field and Buy control
- `src/app/game-session.ts` - profile lifecycle, buy handler, equipment set, dockDenied copy, test-hook grants
- `src/app/probe.ts` - `probe.dock.lastClockDelta`, `setCredits` and `grantEquipment` on the test seam
- `tests/sim/dock-computer.test.ts` - exact clock, aegis boundary, refusals and the same-tick guard
- `tests/sim/player-profile.test.ts` - purchase boundaries, invalid prices, the Lave/TL 9 pair and the catalogue
- `tests/sim/dock-transitions.test.ts` - the four-row mode/tick/flightTime/stationAngle/clock matrix
- `tests/input/bindings.test.ts` - plain C, the Shift chord, object identity and the rebind case
- `tests/settings/schema.test.ts` - an older blob gains `dockingComputer`
- `tests/e2e/docking.spec.ts` - the panel refusal, Shift+C +1200 s, plain C and the far refusal
- `.planning/PROJECT.md` - the TL-gate, catalogue-price and 04-05 durability rows

## Decisions Made

- `canPurchase` checks the tech-level gate first and the price before any credits arithmetic; the panel additionally prefers "Already fitted" when the item is owned, because ownership is the more relevant reason once fitted.
- `dockWithComputer` returns exactly one event and leaves a same-tick `launch` gated on `modeAtStart`, rather than trusting command order.
- The panel's purchase reason has its own `[data-field="dockcomp-message"]` so the launch hint on the shared message line cannot hide it.
- `mergeDefaults` already supplied the new action for older blobs; only the settings test needed the new assertion, not the schema source.
- The dev seam grants only keys present in the validated catalogue and calls the same `onProfileChanged` seam; 04-05 will refuse to autosave a tainted profile.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The panel reported the TL reason for an already-fitted computer**
- **Found during:** Task 3 (docked e2e)
- **Issue:** `canPurchase` correctly reports `techLevel` before `owned`, so after granting the computer at Lave the panel said "Requires TL 9" instead of "Already fitted"; the e2e and the plan's reason list expect the owned case to be distinguishable.
- **Fix:** `dockComputerView` checks ownership first and returns "Already fitted"; the purchase rule itself keeps `techLevel` first, so a fresh purchase at Lave is still refused with the TL reason.
- **Files modified:** `src/app/game-session.ts`
- **Verification:** the panel e2e and the Shift+C e2e both pass; full `verify` is green.
- **Committed in:** `605bfcc`

---

**Total deviations:** 1 auto-fixed (1 bug).
**Impact on plan:** No scope change. The fix is a presentation-order correction; the enforced gate and the tested clock contract are exactly as planned.

## TDD Gate Compliance

The plan is `type: execute` and `workflow.tdd_mode` is false, so the runtime TDD gate is inactive. Task 2 carries `tdd="true"` and followed RED → GREEN:

- **RED:** `48e6c29` added `tests/sim/player-profile.test.ts`. The target suite failed before implementation because the new `profile`/`equipment` modules did not exist (`Cannot find module '../../src/content/equipment.js'`). This is a module-resolution RED rather than an assertion RED because the task creates both modules; no GREEN code existed at that commit.
- **GREEN:** `aa70717` added the two modules and the PROJECT.md decision rows; all 17 profile/catalogue tests and both purity guards passed.
- **REFACTOR:** none needed; Prettier formatting was the only cleanup.

The transition-matrix test was written in Task 3 (a non-TDD expansion task) and passed on its first run against the Task 1 implementation.

## Issues Encountered

- The first docked-panel e2e run failed on the already-fitted reason (deviation 1). The product fix was preferred over weakening the browser assertion.
- The docked-panel test initially matched two tests when grepped with an unescaped `+`; rerunning with a literal substring confirmed both.
- `dockDenied` and the step's normal `massLockChanged` event can share a tick; the computer-dock tests assert the dock events by membership rather than by exact array equality, which is the event stream's real contract.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 04-05 can attach a purchase autosave at `GameSessionOptions.onProfileChanged`; every accepted purchase and dev grant already calls it, and `testTainted` is published through `probe.test.tainted`.
- `loadEquipment`/`findEquipment` are ready for 04-05's save allow-list, and the profile's 64-key/safe-integer bounds match the proposed save schema.
- No blockers. Phase 5 can reuse `canPurchase(profile, item, techLevelRaw)` and the catalogue loader when the outfitting screen replaces the single line.

---

*Phase: 04-manual-docking*
*Completed: 2026-11-05*

## Self-Check: PASSED
