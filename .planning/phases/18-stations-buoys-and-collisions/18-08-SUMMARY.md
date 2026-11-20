---
phase: 18-stations-buoys-and-collisions
plan: 08
subsystem: render, hud, sim-compass
tags: [buoys, scanner, compass, render, fidelity, CBT-17]

requires:
  - phase: 18-05
    provides: buoyPosition, isBuoyDestroyed, buoyOrientation (the buoy pose and liveness)
  - phase: 18-15
    provides: isBuoySubentityAttached (the detached subentity)
  - phase: 18-07
    provides: ShipField.buoy(key) (liveness, offset and attachment in the flight step)
  - phase: 18-14
    provides: World.buoys, createBuoyStates (pristine buoys in every new world)
provides:
  - applyBuoyState(scene, buoys, cameraWorld) in src/render/sync.ts (BuoyViewState, BuoyViewStates)
  - BuoyBody.setSubentityVisible (hides the GLB "core" node)
  - HudModelOptions.buoys (HudBuoy, HudBuoys): a destroyed buoy has no scanner contact, a moved one is plotted and pointed at where it is
  - buoyViewStates(world, layout) in src/app/session/render-driver.ts, read each frame
  - nextCompassMode(mode, witchpointAlive = true) and the step-5 compass fallback to the planet
affects: [18-11, 18-18, 18-19, 18-22, 18-12]

actuals:
  tokens: 22736
  tasks: 3
  commits: 6
plan_head_before: 98a72ab7376426b5e3605a153be32576ffce64ce
plan_head_after: 54013c33f524db3e29d8ac9d96b9ce383e747afc

tech-stack:
  added: []
  patterns:
    - "One per-frame buoy view state feeds both the scene and the HUD, so a destroyed buoy leaves the view and the scanner on the same frame"
    - "Buoy state crosses into app code by layout key only (witchpoint, navBuoy); no entity id"

key-files:
  created:
    - tests/sim/compass-beacon.test.ts
  modified:
    - src/render/sync.ts
    - src/render/bodies/buoy.ts
    - src/app/hud-model.ts
    - src/app/session/render-driver.ts
    - src/sim/world/aegis.ts
    - src/sim/flight/step.ts
    - tests/render/sync.test.ts
    - tests/render/buoy.test.ts
    - tests/ui/hud-model.test.ts
    - tests/app/session/render-driver.test.ts
    - tests/sim/aegis.test.ts
    - tests/sim/world/statics.test.ts
    - FIDELITY.md
    - CHANGELOG.md
    - .planning/PROJECT.md

key-decisions:
  - "Keep Wegolite's compass cycle (auto -> planet -> station -> witchpoint -> auto) and skip a destroyed witchpoint beacon (station -> auto); recorded as a PROJECT.md Key Decisions row and FIDELITY E-126 'Compass cycle model' (A7, D-05)"
  - "A compass on the witchpoint turns to the planet, mode and target, on the first stepped tick whose field reports the witchpoint buoy dead (PlayerEntity.m:4655-4659, FIDELITY E-125, faithful)"
  - "A new world restores both buoys; Oolite keeps a destroyed buoy through a dock and relaunch (FIDELITY E-127, the world-lifecycle divergence)"

patterns-established:
  - "applyBuoyState runs after applyFrame and finds each BuoyBody by its root, so the order of scene.buoys does not matter"

requirements-completed: [CBT-17]

coverage:
  - id: D1
    description: "A destroyed buoy leaves the 3D view and the scanner on the frame after its destruction; a live buoy is drawn and plotted as before"
    requirement: CBT-17
    verification:
      - kind: unit
        ref: "tests/render/sync.test.ts#hides a destroyed buoy and shows it again when the state says it is alive"
        status: pass
      - kind: unit
        ref: "tests/ui/hud-model.test.ts#drops a destroyed nav buoy from the scanner and keeps the others"
        status: pass
      - kind: unit
        ref: "tests/app/session/render-driver.test.ts#hides a destroyed nav buoy, draws a moved witchpoint buoy without its subentity, and plots both so on the next frame"
        status: pass
    human_judgment: false
  - id: D2
    description: "A moved buoy is drawn, plotted and pointed at (witchpoint compass) at buoyPosition; an unmoved buoy is drawn exactly as before"
    requirement: CBT-17
    verification:
      - kind: unit
        ref: "tests/render/sync.test.ts#places a buoy moved 50 m exactly 50 m further"
        status: pass
      - kind: unit
        ref: "tests/ui/hud-model.test.ts#plots a moved witchpoint buoy where it is, not at its layout position"
        status: pass
      - kind: unit
        ref: "tests/ui/hud-model.test.ts#points the witchpoint compass at the moved buoy"
        status: pass
      - kind: unit
        ref: "tests/app/session/render-driver.test.ts#draws both buoys at their layout positions with no world, as with a pristine world"
        status: pass
    human_judgment: false
  - id: D3
    description: "A detached buoy subentity hides only the GLB core node; the hull and the flashers stay"
    requirement: CBT-17
    verification:
      - kind: unit
        ref: "tests/render/buoy.test.ts#hides only the subentity's core node when the subentity is detached, and shows it again"
        status: pass
      - kind: unit
        ref: "tests/render/sync.test.ts#hides a detached subentity on that buoy only"
        status: pass
    human_judgment: false
  - id: D4
    description: "Compass fallback: witchpoint mode with the witchpoint buoy destroyed becomes planet (mode and target) on the first stepped tick, permanently; the cycle skips the destroyed beacon (station -> auto); no field or a live buoy changes nothing"
    requirement: CBT-17
    verification:
      - kind: unit
        ref: "tests/sim/compass-beacon.test.ts"
        status: pass
      - kind: unit
        ref: "tests/sim/aegis.test.ts#skips a destroyed witchpoint: station -> auto, every other step unchanged"
        status: pass
      - kind: unit
        ref: "tests/sim/world/flight-hash-pins.test.ts, tests/sim/flight-cadence.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-04: createWorld with any seed restores both buoys at 250, unmoved, with whole subentities, whatever the previous world did; nothing under src/persistence changed"
    requirement: CBT-17
    verification:
      - kind: unit
        ref: "tests/sim/world/statics.test.ts#returns both buoys at 250, unmoved and whole whatever the previous world did to them"
        status: pass
      - kind: other
        ref: "git diff --quiet 76229f5 -- src/persistence tests/e2e/save-load.spec.ts (exit 0)"
        status: pass
    human_judgment: false
  - id: D6
    description: "On screen: a destroyed buoy vanishes from the view and the scanner, and a stripped buoy shows no core assembly"
    verification:
      - kind: e2e
        ref: "remote verify smoke and tests/e2e/hud.spec.ts at 54013c3 (no regression; no spec destroys a buoy yet)"
        status: pass
    human_judgment: true
    rationale: "No browser spec destroys or strips a buoy yet; plan 18-22 adds the traffic-on scanner check, and the visual of the hidden core mesh is not automated"

duration: 23min
completed: 2026-11-20
status: complete
---

# Phase 18 Plan 08: Buoys as the Player Sees Them Summary

**A destroyed buoy now leaves the 3D view and the scanner, a moved buoy is drawn, plotted and pointed at where it is, a detached subentity's `core` mesh is hidden, and a compass left on a destroyed witchpoint beacon turns to the planet by Oolite's rule while the manual cycle skips it.**

## Performance

- **Duration:** 23 min
- **Started:** 2026-11-20T11:28:44Z
- **Completed:** 2026-11-20T11:51:46Z
- **Tasks:** 3
- **Files modified:** 16 (the 14 planned, plus `tests/render/buoy.test.ts` and `.planning/PROJECT.md`)

## Accomplishments

- **View (D-05, PD-01, PD-02).** `applyBuoyState` runs after `applyFrame` each frame. It places each buoy group camera-relative through the one `placeRelative` helper, hides a destroyed buoy, and calls `BuoyBody.setSubentityVisible`, which toggles the GLB's `"core"` node (the `oolite_buoy_subents` model, one of the existing `NODE_NAMES`). An unmoved buoy lands exactly where `applyFrame` put it.
- **Scanner and compass (D-05, PD-02).** `HudModelOptions.buoys` drops a destroyed buoy from the static contacts and plots a live one at its given position with its layout radius. The witchpoint compass target uses the same position. Without the option the three static contacts are unchanged; a test pins that the contacts and compass are equal with live, unmoved buoys and with no option.
- **One read per frame.** `buoyViewStates(world, layout)` in the render driver reads `buoyPosition`, `isBuoyDestroyed` and `isBuoySubentityAttached` from `ctx.core.worldLifecycle?.world`. With no world, both buoys are alive, whole and at their layout positions. The same value feeds the scene and `buildHudModel`. Only layout keys cross into app code, and the entity-id-scope guard passes.
- **Compass fallback (D-05, `PlayerEntity.m:4655-4659`).** In step 5, before `resolveCompassTarget`, a `witchpoint` mode becomes `planet` when `ships?.buoy("witchpoint").alive === false`. The field reflects the previous tick, so this happens on the first stepped tick that sees the destruction. The mode then stays `planet`, even if a field reports the buoy alive again. Docked, step 5 does not run, so nothing changes there.
- **Cycle skip (A7, `PlayerEntity.m:4761-4808`).** `nextCompassMode(mode, witchpointAlive = true)` takes `station` to `auto` when the beacon is dead. The flight step passes `ships?.buoy("witchpoint").alive ?? true`. A full six-press cycle with the beacon destroyed never lands on `witchpoint`.
- **Lifecycle (D-04).** A world with a destroyed nav buoy, a moved and moving witchpoint buoy, a detached subentity and sticky routing is followed by `createWorld` for seeds 0, 1, 2, 0x7fffffff and 0xffffffff. Every new world has both buoys at 250, with zero offset and velocity, a subentity at 200, no routing flag and pristine `isPristineBuoyStates`. It shares no object with the old world, and the old world is untouched. The test doc names the call sites: `begin` from `createWorldLifecycleFlow` (`event-router.ts`, launch) and `hyperspace-controller.ts` (arrival), and `resume` from `restoreWorldAnchor` (Continue/Load).
- **Records.**
  - FIDELITY E-125: the compass fallback, faithful.
  - FIDELITY E-126: 'Compass cycle model', a divergence. Its Mechanic cell cites `PlayerEntity.m:4761-4808`.
  - FIDELITY E-127: buoys restored with every world, a divergence. The Oolite cell is `Universe.m:1088-1091`: `setUpUniverseFromStation` rebuilds only from witchspace, so a dock and relaunch keep every entity.
  - FIDELITY E-128: the live-pose presentation, faithful (the scanner loop over the universe's entities, `HeadUpDisplay.m:1112-1120`).
  - The "Stations and buoys" open-items bullet is extended.
  - PROJECT.md gains a Key Decisions row for the compass cycle.
  - CHANGELOG gains the plan's `Added` line.

## Task Commits

1. **Task 1: a destroyed, moved and stripped buoy as the player sees them (tracer, TDD).** `07b411b` (test, RED), `86ec658` (feat, GREEN). Tracer gate: auto mode (`workflow.auto_advance` true). The `<verify>` re-ran green at `86ec658`: 5 files, 140 tests; typecheck had 0 `error TS`. Expansion went ahead.
2. **Task 2: the compass falls back from a destroyed witchpoint beacon (TDD).** `8756193` (test, RED), `61ea69b` (feat, GREEN).
3. **Task 3: the lifecycle proof, the records and the remote checks.** `13c873b` (docs and test).
- Follow-up comment correction: `54013c3`. The `BuoyBody.setSubentityVisible` doc had implied that Oolite draws no explosion for a detached subentity. It now says that only Wegolite skips it, matching FIDELITY E-123.

## TDD Gate Compliance

- **Task 1 RED (`07b411b`).** 10 target tests failed on the missing behaviour:
  - `buoy.setSubentityVisible is not a function`
  - `applyBuoyState is not a function` (4 cases)
  - The HUD still listed `navBuoy`.
  - The moved witchpoint contact was still invisible.
  - The compass sat at x -25.2 instead of +25.2.
  - The render-driver cases failed with `expected [] to deeply equal [ true ]` and `expected true to be false`.

  The first render-driver run failed with `buoy.update is not a function`. That was a fixture fault: my body double lacked `update`. I fixed it before the commit, so the committed RED fails on assertions.
- **Task 2 RED (`8756193`).** 6 target tests failed: `expected 'witchpoint' to be 'auto'` and `expected 'witchpoint' to be 'planet'`. The no-field, live-buoy, other-mode and docked cases passed in RED as intended. They are regression guards for behaviour that already held.
- **GREEN.** `86ec658` and `61ea69b`; all target files pass. I did not run the formal `tdd-red-evidence` classifier. This plan is not `type: tdd`, and this follows the 18-05 and 18-07 precedent.

## Verification evidence

- **Local Docker:**
  - Targeted Task 1 verify: 5 files, 140 passed. Task 2 verify: 4 files, 33 passed. `tests/sim/world/statics.test.ts`: 13 passed.
  - `docker compose run --rm test` (coverage): 256 files, 6,949 passed and 10 skipped, exit 0.
  - `lint` exit 0. `typecheck` exit 0.
  - FIDELITY contract: 9 passed. It was also run verbatim with `OOLITE_SRC` mounted from `git archive 7437f22 src` (`/tmp/wego-1808-oolite`): 9 of 9 passed, none skipped, so the four new excerpts equal the pin.
- **Remote 20-seed acceptance** (`run --rm test npm run test:acceptance`): `snapshot 13c873b (committed HEAD)`, 21 passed, `exit=0 elapsed=78s snapshot=13c873b`. This checks the frozen worlds only. The harness runs `realHullTable()` with no statics, collisions or buoy mass, so it is no evidence for this plan's paths (review L660@b45e113). My output filter kept only the summary lines, not the per-seed stuck/frozen/repair counts. The run passed its frozen thresholds unchanged.
- **Remote `verify`:** `snapshot 54013c3 (committed HEAD)`, 256 unit files, 6,949 passed and 10 skipped; e2e smoke 27 passed; `exit=0 elapsed=197s snapshot=54013c3`. No flake reruns were needed.
- **Remote browser specs** (`run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/hud.spec.ts tests/e2e/combat.spec.ts"`): `snapshot 54013c3 (committed HEAD)`, 4 passed, `exit=0 elapsed=40s snapshot=54013c3`. No scanner or compass spec exists besides `hud.spec.ts`.
- **Gates not run:** `verify-full` is left for plan 18-12's release gate (PD-04 and the owner's gate policy). AGENTS.md would ask for it on a render change.
- **Twin hashes:** none moved. `HASH_60_AFTER_KILL` and `TWIN_HASH_60_AFTER_KILL` are untouched. tick-parity passed in the full suite and `combat.spec.ts` passed remotely. No file under `tests/e2e` or `tests/acceptance` changed.

## Files Created/Modified

- `src/render/sync.ts`: `BuoyViewState`, `BuoyViewStates`, `applyBuoyState`.
- `src/render/bodies/buoy.ts`: `BuoyBody.setSubentityVisible`; the `SUBENTITY_NODE` is the `"core"` of `NODE_NAMES`.
- `src/app/hud-model.ts`: `HudBuoy`, `HudBuoys`, `HudModelOptions.buoys`; `scannerTargets`, `bodyFor`, `buildContacts` and `buildCompass` read it.
- `src/app/session/render-driver.ts`: `buoyViewStates`. It calls `applyBuoyState` after `applyFrame` and passes `buoys` to `buildHudModel`.
- `src/sim/world/aegis.ts`: `nextCompassMode(mode, witchpointAlive = true)`.
- `src/sim/flight/step.ts`: the cycle passes buoy liveness, and step 5 falls back to the planet.
- `tests/sim/compass-beacon.test.ts` (new); `tests/sim/aegis.test.ts`, `tests/render/sync.test.ts`, `tests/render/buoy.test.ts`, `tests/ui/hud-model.test.ts`, `tests/app/session/render-driver.test.ts` and `tests/sim/world/statics.test.ts` (extended).
- `FIDELITY.md`: E-125 to E-128 with their excerpts, the open-items sentence, and three re-pointed line references.
- `.planning/PROJECT.md`: Key Decisions row "Keep Wegolite's compass cycle and skip a destroyed witchpoint beacon (Phase 18, D-05, A7)".
- `CHANGELOG.md`: the plan's `Added` line, and the 18-05 bullet corrected (see deviation 4).

## Decisions Made

See `key-decisions`. No decision needed the owner. The cycle model follows the plan's A7 and revision-2 ruling.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The FIDELITY contract requires each divergence to quote a PROJECT.md row**
- **Found during:** Task 3.
- **Issue:** `tests/contract/fidelity.test.ts` checks that every divergence cell quotes text present in `.planning/PROJECT.md`. No row recorded the compass cycle model.
- **Fix:** Added the Key Decisions row "Keep Wegolite's compass cycle and skip a destroyed witchpoint beacon (Phase 18, D-05, A7)". It records the plan's existing ruling and revises nothing. The D-04 row quotes the existing "World lifecycle and epoch bump points: no world while docked".
- **Files modified:** `.planning/PROJECT.md`
- **Committed in:** `13c873b`

**2. [Rule 3 - Blocking] The 20-line excerpt cap and the 4761-4808 citation**
- **Found during:** Task 3.
- **Issue:** The contract caps an excerpt at 20 lines and requires the Oolite cell to equal the excerpt's range. `PlayerEntity.m:4761-4808` is 48 lines.
- **Fix:** The 'Compass cycle model' row names `PlayerEntity.m:4761-4808` in its Mechanic cell, which satisfies the acceptance check. Its Oolite cell and excerpt E-126 quote the beacon walk, `4789-4807` (19 lines).
- **Committed in:** `13c873b`

**3. [Rule 2 - Docs honesty] FIDELITY line references moved by this plan's edits**
- `src/sim/flight/step.ts:266` -> `:272` (countdown cancelled by a dock), `src/app/session/render-driver.ts:333` -> `:368` (HUD drawn while launching) and `src/app/hud-model.ts:255` -> `:321` (roll bar at zero while launching). Each new line holds the same code as before. The ASC row (`step.ts:213`) and the aegis row (`aegis.ts:34`) did not move.
- **Committed in:** `13c873b`

**4. [Rule 1 - Docs bug] A stale CHANGELOG bullet from 18-05**
- The `[Unreleased]` buoy bullet said a destroyed buoy "stays destroyed until you leave the system" and that "its removal from the view and the scanner follows in a later update". This plan delivers that removal. D-04 also restores the buoys on every launch, so the bullet now reads "until your next launch, jump or load, which restores both buoys". The plan's own line was added after it.
- **Committed in:** `13c873b`

**5. [Rule 3] `tests/render/buoy.test.ts` added to the touched files.** The plan's Task 1 verify names it, and it is the natural home of the `setSubentityVisible` test, but the file list omitted it. **Committed in:** `07b411b`.

**6. Comment correction (`54013c3`).** See Task Commits.

**Total deviations:** 6: 2 blocking contract fixes, 1 docs-honesty update, 1 docs bug, 1 extra test file and 1 comment correction. **Impact:** no scope creep. No frozen threshold, detector, browser spec or twin hash changed.

## Known Caveats

- The CHANGELOG line "a rammed buoy is shown where it drifts" describes the presentation, which is ready now. Nothing writes a buoy's velocity until the collision plans (18-11 and 18-18) land, so no buoy drifts in play yet. The line is in `[Unreleased]` and is true by the phase's release.
- `buildCompass` resolves from `state.compassMode`. On a tick where the combat step destroys the witchpoint buoy while it is selected, the HUD can point at the buoy's last position until the next stepped tick (one 1/60 s tick), when the sim falls back. This matches "the first stepped tick that sees the destruction".
- Still open from 18-07: the torus factor's nearest surface reads the layout buoys (todo `2026-11-20-torus-nearest-surface-live-buoys`). This plan does not touch it.

## Issues Encountered

None beyond the RED fixture fault noted under TDD Gate Compliance.

## User Setup Required

None.

## Next Phase Readiness

- 18-22 (the traffic-on browser check that a destroyed nav buoy leaves the scanner) can rely on `HudModelOptions.buoys` and on the render driver feeding it every frame.
- 18-18 and 18-19 (buoy collisions and blasts) need no presentation work: once they write `World.buoys.<key>.velocity` and offset, the scene, scanner and compass follow.
- CBT-17 stays Pending in REQUIREMENTS.md while sibling plans still declare it.

---
*Phase: 18-stations-buoys-and-collisions*
*Completed: 2026-11-20*

## Self-Check: PASSED

- Files: `tests/sim/compass-beacon.test.ts` and every modified file are present.
- Commits `07b411b`, `86ec658`, `8756193`, `61ea69b`, `13c873b` and `54013c3` are ancestors of HEAD. The measured count is 6 (`98a72ab..54013c3`).
- Acceptance criteria re-run: `applyBuoyState` export 1; `setSubentityVisible` 2; `buoyPosition` in the render driver 3; `witchpointAlive` in `aegis.ts` 4; non-comment `buoy("witchpoint")` in `step.ts` 2; `4655-4659` in FIDELITY 2; the 'Compass cycle model' row citing `4761-4808` 1; the persistence diff against `76229f5` exits 0; the flight-hash pins pass unchanged.
