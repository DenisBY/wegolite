---
phase: 18-stations-buoys-and-collisions
plan: 06
subsystem: combat
tags: [ident, target-lock, station, buoy, cargo-pods, alloy-plates, hud, CBT-17, PD-02, D-05, D-07]

requires:
  - phase: 18-15
    provides: "pods and plates as laser candidates; buoy subentity ids 6 and 7 (never ident targets)"
  - phase: 18-05
    provides: "STATIC_TARGETS rows, buoyPosition, isBuoyDestroyed, destroyBuoy"
  - phase: 18-13
    provides: "the static hull artifact with compiled names"
provides:
  - "firstEntityTargetedByPlayer, isValidTarget, updateIdentTarget and identTargetSnapshot take a SystemLayout; statics 3 to 5 are visited first at their live poses and layout radii, then ships, pods and plates; wrecks never"
  - "identLocked carries the static's identKey (coriolis-station, buoy, buoy-witchpoint)"
  - "ctx.core.targetNames (targetNameMap over loadSessionContent().staticNames), installed in startSession and cleared with hulls"
  - "identName: NPC catalogue name, else compiled target name, else the key"
  - "the HUD frame and the probe read a static lock through identTargetSnapshot(combat, world, layout)"
affects: [18-07, 18-08, 18-11, 18-12, 18-18]

actuals:
  tokens: 14300
  tasks: 3
  commits: 5
plan_head_before: 6e322f9d3a771dd3427b406414b0e79f3355613f
plan_head_after: f3d04bc3dd76ec61c5c6efcf47e489281be181e3

tech-stack:
  added: []
  patterns:
    - "Ident candidates in ascending id: static rows first (strict < keeps the first on an equal distance), then the store"
    - "Display names resolve through compiled content only; the key is the fallback"

key-files:
  created:
    - tests/app/session/event-router-ident.test.ts
    - .planning/todos/pending/2026-11-20-ident-hud-raw-static-key-traffic-off.md
  modified:
    - src/sim/combat/ident.ts
    - src/sim/combat/step.ts
    - src/app/session/context.ts
    - src/app/session/start-session.ts
    - src/app/session/event-router.ts
    - src/app/session/render-driver.ts
    - src/app/session/probe-publisher.ts
    - tests/sim/combat/ident.test.ts
    - tests/app/session/render-driver.test.ts
    - tests/app/session/probe-publisher.test.ts
    - tests/app/session/tick-parity.test.ts
    - tests/e2e/combat.spec.ts
    - .planning/PROJECT.md
    - FIDELITY.md
    - CHANGELOG.md

key-decisions:
  - "Ident locks the station, both buoys (live pose, PD-02), cargo pods and alloy plates, never wrecks or buoy subentities (Universe.m:5689-5707, D-07); a static's sphere is its layout radius; a destroyed buoy's lock ends on its tick with identLost"
  - "Owner decision 2026-11-20 (option A): re-pin the debris twin hash f1926a36 -> f6927215 in the Node twin and the browser spec, because ident now re-locks the nav buoy on the kill tick; the world is unchanged, only the hashed identTarget differs"
  - "Owner decision 2026-11-20: the traffic-off HUD raw key (\"Ident system locked onto coriolis-station.\") is deferred to a todo, triaged at phase close (18-12)"

patterns-established:
  - "18-07, 18-08 and 18-18 can rely on identTargetSnapshot for static locks; no entity id leaves src/sim"

requirements-completed: []

coverage:
  - id: D1
    description: "R locks the station and the HUD names it 'Coriolis Station' from compiled content"
    requirement: CBT-17
    verification:
      - kind: unit
        ref: "tests/sim/combat/ident.test.ts; tests/app/session/event-router-ident.test.ts#prints the compiled station name with traffic on"
        status: pass
    human_judgment: false
  - id: D2
    description: "Both buoys (live pose), pods and plates lock with compiled names; wrecks and subentities never; a destroyed buoy's lock ends with identLost"
    requirement: CBT-17
    verification:
      - kind: unit
        ref: "tests/sim/combat/ident.test.ts; tests/app/session/event-router-ident.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "The HUD frame and the probe follow a static lock at its live position"
    requirement: CBT-17
    verification:
      - kind: unit
        ref: "tests/app/session/render-driver.test.ts#frames a locked nav buoy at its live position (plan 18-06, PD-02); tests/app/session/probe-publisher.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "The debris twin re-pinned for the nav buoy re-lock on the kill tick, Node and browser agree"
    verification:
      - kind: unit
        ref: "tests/app/session/tick-parity.test.ts#fire held from the spawn destroys the hook-spawned shooter before its return fire empties the bank"
        status: pass
      - kind: e2e
        ref: "remote: npx playwright test tests/e2e/combat.spec.ts (f3d04bc)"
        status: pass
    human_judgment: false

duration: 58min
completed: 2026-11-20
status: complete
---

# Phase 18 Plan 06: Ident Locks Statics and Debris Summary

**Ident (R) now locks the Coriolis station, both buoys at their live poses, cargo pods and alloy plates, names them from the compiled static artifact, and drops a buoy's lock on the tick it is destroyed; wrecks and buoy subentities are never locked.**

## Performance

- **Duration:** about 58 min (two executor runs around one owner checkpoint)
- **Started:** 2026-11-20T10:27+01:00 (ledger base 6e322f9)
- **Completed:** 2026-11-20T11:25+01:00
- **Tasks:** 3 of 3
- **Files modified:** 17

## Accomplishments

- The ident search ports Oolite's `firstEntityTargetedByPlayer` rule (Universe.m:5689-5707): statics 3 to 5 first, at their layout radii (779.37 station, 59.14 buoy), then ships, pods and plates, with the strict `<` keeping the first on an equal distance.
- The HUD names the lock: NPC catalogue name, else the compiled static name ("Coriolis Station", "Navigation Buoy", "Witchpoint Beacon", "Cargo container", "Metal fragment"), else the key.
- A static lock is framed and published at its live pose; a destroyed buoy is lost on its tick and never re-acquired; beyond 25,600 m a static is lost as a ship is.
- Decision rows: PROJECT.md (statics ident half; pods and plates lock, wrecks never), FIDELITY E-52 `faithful`, CHANGELOG Added.

## Task Commits

1. **Task 1: R locks the station and the HUD names it (tracer, TDD)** - `cd87ae6` (test, RED), `c0b38f4` (feat, GREEN)
2. **Task 2: buoys, pods and plates, validity, the lost lock, the HUD frame and the probe** - `a41bd99` (test)
3. **Task 3: decision rows and the remote verify** - `c87825e` (docs), `f3d04bc` (test: owner-sanctioned twin re-pin and the todo)

## TDD Gate Compliance

- RED: `cd87ae6` added the station lock and compiled-name tests (ident.test.ts, event-router-ident.test.ts) and replaced the superseded "never locks the station or the buoys" case; they failed against the pre-plan ident, which never visited statics.
- GREEN: `c0b38f4` implemented the search, the layout parameter, `targetNames` and `identName`.
- Task 2's tests passed on their first run because Task 1 already implemented the full search and validity; a mutation run (no cargo, no destroyed check, no static range) failed 5 of them, so they are not vacuous.

## Deviations from Plan

1. **[Rule 3] Snapshot call sites moved into Task 1.** Giving `identTargetSnapshot` the layout parameter broke the render-driver and probe-publisher callers at once, so they were updated in Task 1 instead of Task 2.
2. **[Rule 1] Task 2 tests passed on the first run.** See TDD Gate Compliance; validated by a mutation run that failed 5.
3. **[Plan supersede] Two pre-existing ident tests changed.** "Never locks the station or the buoys" became the station lock case; the cargo-ignore case became a wreck case. The plan supersedes both.
4. **[Rule 3] Names installed in `startSession`.** `ctx.core.targetNames` is built with `targetNameMap(loadSessionContent().staticNames)`, because `loadSessionContent` returns what it does not install itself.
5. **[Test geometry] The pod and plate test puts the 5 m piece on the fore view axis,** so the small sphere is inside the sight line.
6. **[Docs] FIDELITY row text shortened;** the status cell is exactly `faithful`, which the fidelity guard needs.
7. **[Owner decision, option A] Debris twin re-pinned.** In both twins the player's sight line runs through the nav buoy, so on the kill tick `updateIdentTarget` emits `identLost` and then `identLocked` on the nav buoy (static id 5). The world is unchanged (forcing `identTarget` back to 0 gives `f1926a36`); only the hashed `identTarget` differs. `HASH_60_AFTER_KILL` and `TWIN_HASH_60_AFTER_KILL` went from `f1926a36` to `f6927215`. In the Node kill twin, `not.toContain("identLocked")` became `identLost` followed by `identLocked` with `combat.identTarget === STATION_NAV_BUOY_ID`, and the "Target lost." message check became `/^Ident system locked onto/`, because the fresh lock's message replaces it. The browser spec already accepts either outcome. This is the third `tests/e2e` edit in Phase 18, after 18-05 and the D-06 edit planned in 18-07.

**Impact:** None of these deviations widens the plan's scope. The re-pin follows from the plan's own rule (ident locks buoys).

## Issues Encountered

- **Traffic-off raw key (deferred by owner decision):** with traffic off, `loadSessionContent` loads no static artifact, so no names are installed and the HUD prints the hull key ("Ident system locked onto coriolis-station."). This is pinned in `tests/app/session/event-router-ident.test.ts` and recorded in PROJECT.md. The todo is `.planning/todos/pending/2026-11-20-ident-hud-raw-static-key-traffic-off.md`, to be triaged at 18-12. The Node twin installs no names either, so its re-lock reads "buoy".
- The resume brief mentioned a separate committed `fidelity.test.ts` fix. No such commit exists after the ledger base, and the full suite (including the fidelity guard) is green.

## Verification

- Local Docker: tick-parity 29/29; full `test` 253 files, 6900 passed, 10 skipped; `lint` and `typecheck` clean.
- Remote at `f3d04bc`: `tests/e2e/combat.spec.ts` 1 passed; `verify` green (6900 unit, 27 e2e smoke), with no flake reruns needed.
- NPC acceptance run: not needed (no change under `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json`).
- Tripwire `2026-11-19-player-ident-lock-in-target-targets-self`: not triggered. This plan adds lock targets and no reader of the player's lock in NPC steering, and statics 3 to 5 never equal the player.
- CBT-17 is not marked complete: later Phase 18 plans still carry parts of it.

## Next Phase Readiness

18-07, 18-08 and 18-18 can read static locks through `identTargetSnapshot`. The traffic-off naming todo is open for 18-12.

---
*Phase: 18-stations-buoys-and-collisions*
*Completed: 2026-11-20*

## Self-Check: PASSED
