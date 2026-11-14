---
phase: 12-inert-ships-and-the-world-lifecycle
plan: 09
subsystem: testing
tags: [world-lifecycle, jump-commit, save-regeneration, tick-replay, traffic-variants, d-01]
requires:
  - phase: 12-inert-ships-and-the-world-lifecycle
    provides: "plan 12-08 traffic.ts (trafficContent, createInertPopulate) and the session wiring; plan 12-07 populateInertWorld; plan 12-04 ShipField and the mass lock; plan 12-05 torusRefused and StepOptionsInput.shipMasses"
provides:
  - "Vitest proof that the jump commit clears the world on the same tick (sim level and through the real sim driver, router, hyperspace flow and controller) and that the destination is repopulated deterministically from id 101 to 112 with anchor 113"
  - "Vitest proof of SAVE-08 for the inert world: a reload regenerates the fresh arrival's world section at the leg anchor, a docked save writes 101 and keeps no world, a differing counter never blocks a load and is never copied over the regenerated one"
  - "tests/helpers/tick-script.ts: with traffic on the Node replay populates and passes the NPC masses exactly as the session does, through traffic.ts"
  - "tests/app/session/traffic-variants.test.ts: WORLD-16's traffic-on launch, manual docking, docking computer and torus rows"
  - "PROJECT.md Key Decisions: D-05 after the Phase 12 populator (D-01), the same-tick jump-commit rule, SAVE-08 recorded"
affects: [12-10, 12-12, 12-14]
status: complete
actuals:
  tokens: 18400
  tasks: 3
  commits: 3
plan_head_before: 0bd0a1dccb8e92dda8b4b28c6325e0f4ea7f7de9
plan_head_after: 3e4a7b48cbb5cb6659fd0ef9a1711ec628d011bf
tech-stack:
  added: []
  patterns:
    - "a traffic-on test wires the real inert populate over the committed ships-npc.json read with readFileSync, as start-up does; expected counts (12, 113, 101, 101 to 112) come from the decisions"
    - "a same-tick lifecycle row runs the real sim driver stepOnce, the real router with the real hyperspace flow and the real hyperspace controller over a scene double, with an old-world pilot that moves, so an unstepped old world is observable"
    - "a variant row steps stepSim twice over one setup, populated world plus masses versus no world, with buildStepOptions as the session builds it, and compares events and serializeFlight"
key-files:
  created:
    - tests/app/session/traffic-variants.test.ts
  modified:
    - tests/app/session/world-lifecycle.test.ts
    - tests/app/session/tick-parity.test.ts
    - tests/persistence/save-v3.test.ts
    - tests/helpers/tick-script.ts
    - .planning/PROJECT.md
key-decisions:
  - "D-01 recorded in the lifecycle row: the seed and each fresh world's starting counter (101) stay independent of the traffic flag; the post-populate counter is 113 with traffic on and 101 off; an NPC-free world keeps the v1 flight hash."
  - "Jump commit clears the world on the same tick (WORLD-14): stepSim skips the old world on the hyperspaceJumped step and the handler in the same stepOnce pass replaces it through begin; a failed arrival pauses the session before begin."
  - "SAVE-08 recorded complete for the inert world (full traffic is SAVE-10): a counter mismatch never blocks a load, and a docked save writes 101 and restores no world."
requirements-completed: [WORLD-14]
coverage:
  - id: D1
    description: "A jump clears the old world on the commit tick (not stepped on that tick, unreachable after it) and the destination is repopulated deterministically with ids 101 to 112, anchor 113 and the five static bodies unchanged"
    requirement: "WORLD-14"
    verification:
      - kind: unit
        ref: "tests/app/session/world-lifecycle.test.ts#jump commit clears the world on the same tick (WORLD-14)"
        status: pass
      - kind: unit
        ref: "tests/app/session/world-lifecycle.test.ts#arrival (traffic on, traffic off, Pitfall 17)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A reload regenerates the inert world at the leg anchor with a section identical to a fresh arrival's; a counter mismatch never blocks a load"
    requirement: "SAVE-08"
    verification:
      - kind: unit
        ref: "tests/persistence/save-v3.test.ts#regenerated inert world (SAVE-08, Phase 12)"
        status: pass
      - kind: unit
        ref: "tests/app/session/world-lifecycle.test.ts#load"
        status: pass
    human_judgment: false
  - id: D3
    description: "The Node replay populates like the session with traffic on; traffic-off parity rows unchanged"
    requirement: "WORLD-14"
    verification:
      - kind: unit
        ref: "tests/app/session/tick-parity.test.ts#tick parity with the populated world (plan 12-09, WORLD-14)"
        status: pass
      - kind: e2e
        ref: "playwright tests/e2e/tick-hook.spec.ts (5 passed, remote)"
        status: pass
    human_judgment: false
  - id: D4
    description: "With traffic on, launch, manual docking and the docking computer match traffic off; the torus engages with no ship in range and is refused next to a placed ship"
    requirement: "WORLD-16"
    verification:
      - kind: unit
        ref: "tests/app/session/traffic-variants.test.ts"
        status: pass
    human_judgment: false
duration: 25min
completed: 2026-11-14
---

# Phase 12 Plan 09: Prove the world lifecycle, the regenerated inert world and the traffic-on flight variants Summary

A jump now has Vitest proof that the old world is not stepped on the commit tick and is unreachable after it, that the destination is repopulated deterministically (ids 101 to 112, anchor 113), that a reload regenerates the fresh arrival's section at the leg anchor, that the Node replay populates exactly like the session, and that launch, manual docking, the docking computer and the torus behave as in v1 with traffic on except for Oolite's own ship mass lock. No src file changed.

## Accomplishments

- **Tracer, same tick (Task 1).** Sim level: a populated Lave world plus a test pilot that keeps moving for the whole 1,800-step countdown; on the step that emits `hyperspaceJumped` the pilot's `serializeEntity` line and the whole `serializeWorldSection` are unchanged, and the pilot's line did change on every earlier step. Session level: the real `stepOnce` pass, the real router with the real `createHyperspaceFlow` and the real hyperspace controller over a scene double. After the one commit step `lifecycle.world` is a new object, no old entity object is in the new `store.live`, the live ids are 101 to 112, the anchor is 113, and the next step leaves the old world untouched. Mutation check: removing the `!events.some(hyperspaceJumped)` condition in `src/sim/sim.ts` makes exactly these two rows fail; `sim.ts` was restored byte for byte (no diff under src).
- **Arrival rows.** Traffic on: two identical sessions reach equal `serializeWorldSection` texts, equal to `createWorld(worldSeedFor(nextSeed, 2))` populated over the destination layout, different from the origin's ships. Traffic off: no entity, anchor 101, `hashWorld` equals `hashFlight`. Pitfall 17: `world.statics` is still `STATIC_ENTITIES`, ids 1 to 5, the two buoys at 4 and 5 with `CLASS_BUOY`; every dynamic entity has id 101 or more and none is a buoy.
- **Regeneration (Task 2).** `begin` then `resetForRestore(e)` and `resume` rebuild an identical section at anchor 113 (lifecycle row); an in-flight Load of a traffic-on save restores the fresh arrival's 12 ships and the cold Continue agrees; a traffic-off save (101) loads with traffic on and regenerates 113; a traffic-on save loads with traffic off and regenerates an empty world at 101; a tampered `nextEntityId` (5000) is parsed and never used (T-12-22). A docked save writes 101, restores epoch only and no world, and the next launch builds 113.
- **Populated replay.** `runTickScript(..., { traffic: true })` reads `ships-npc.json` with `readFileSync`, validates with `NpcShipCatalogueSchema`, builds `trafficContent`, passes `createInertPopulate(() => content, () => layout)` and `shipMasses`. With traffic off nothing is read. The session harness and the replay reach the same `hashWorld` after a launch and 600 ticks and on every tick of a 601-tick trace. The pre-existing traffic-off parity rows pass with unchanged expected values.
- **Traffic variants (Task 3).** 7 rows: the populated variant is 12 ships at 113; a 601-tick launch gives equal events and `hashFlight` every tick; the aligned manual capture docks on the weighted-plane tick (via `manual`) and the 45 m approach stays in flight, both identical to traffic off; Shift+C docks with `clockDelta` 1200 identically; the torus engages at a lock-free point (asserted through `createShipField`) exactly as with traffic off and is refused with `torusRefused` 1,000 m from a placed ship while traffic off engages there.
- **Records.** The "World lifecycle and epoch bump points" row gained "D-05 after the Phase 12 populator" and "Jump commit clears the world on the same tick"; the "Do not save NPCs" row is now "✓ Phase 12 plan 12-09: the inert world is regenerated at the leg anchor (SAVE-08 complete for the inert world; full traffic is SAVE-10)" with the counter-mismatch and docked-anchor sentences.

## Task Commits

| Task | Name | Commit |
| --- | --- | --- |
| 1 | prove the jump commit clears the world on the same tick and the arrival repopulates deterministically (tracer) | a62efd1 |
| 2 | regenerate the inert world at the leg anchor and populate the Node replay like the session | 22a752a |
| 3 | traffic-on variants of launch, docking, the docking computer and the torus; record D-01, the same-tick rule and SAVE-08 | 3e4a7b4 |

Tracer gate: the automated-only `<verify>` (targeted Vitest) was run after the commit's content was final and passed; the sim.ts mutation check shows the rows fail when the rule is broken. No checkpoint.

## Gates run (all in Docker)

| Gate | Where | Result |
| --- | --- | --- |
| `vitest run world-lifecycle.test.ts entity-id-scope.test.ts` (Task 1) | local | 2 files, 62 passed |
| `vitest run world-lifecycle tick-parity save-v3 save-golden entity-id-scope` (Task 2) | local | 5 files, 146 passed |
| `vitest run traffic-variants.test.ts` (Task 3) | local | 1 file, 7 passed |
| `docker compose run --rm test` (full, coverage), on the final tree | local | exit 0, 149 files, 2,948 passed, 2 skipped, no coverage error |
| `docker compose run --rm lint` (final tree) | local | exit 0 (ESLint and Prettier) |
| `docker compose run --rm typecheck` (final tree) | local | exit 0, no `error TS` |
| `npm run build:e2e && npx playwright test tests/e2e/tick-hook.spec.ts` on HEAD 22a752a | remote wrapper | 5 passed (the traffic-off Node parity test and the opt-in traffic case included) |

The remote wrapper does not forward a quoted `sh -lc "..."` argument (the first two invocations printed npm usage, exit 1, before any test ran); passing the command as `"'npm run build:e2e && ...'"` works. The spec was not re-run locally because the remote and local agree on every other gate and the spec only imports the replay helper; if a reviewer wants local confirmation it is one command.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TS2345 on a narrowed const inside a function declaration**
- **Found during:** Task 1 typecheck
- **Issue:** `diso` was narrowed by a top-level `throw` but `jumpSession` is a function declaration, where TypeScript drops the narrowing.
- **Fix:** `const disoFound = ...; if undefined throw; const diso: System = disoFound`.
- **Files modified:** tests/app/session/world-lifecycle.test.ts
- **Commit:** a62efd1 (fixed before the commit)

**2. [Rule 1 - Bug] A shared session helper changed a pre-existing row**
- **Found during:** Task 2
- **Issue:** Wiring the inert populate into tick-parity's `session()` for every traffic-on session broke the existing `probe.sim` row, which opens with `traffic=1` and expects a world holding only its own spawned entity.
- **Fix:** `session(search, populated = false)` wires the populate only when asked and only with traffic on; every pre-existing call is unchanged and the new rows pass `true`.
- **Files modified:** tests/app/session/tick-parity.test.ts
- **Commit:** 22a752a

### Departures worth a reviewer's eye (no rule triggered)

- **No red run.** The plan asks for the rows first and red where they need the helper change. The src behaviour already existed (12-08) and the helper change was small, so the rows were written together with the helper and ran green. The Task 1 rows were mutation-checked against `sim.ts` (see above) to show they bite.
- **Extra harness parameters.** `arrivalHarness(failDestinationBuild, traffic)` and `loadHarness({ traffic })` in tests/app/session/world-lifecycle.test.ts gained an opt-in traffic mode; defaults keep every existing row's behaviour. A module-level `committedTraffic()` replaced the inline JSON read in `tracer()`.
- **"Row 236".** The plan names row 236 for the lifecycle row; in the current file that row is at line 238 and was found by its text ("World lifecycle and epoch bump points"). The "Do not save NPCs" row is at line 213, as named.
- **No CHANGELOG entry.** The plan changes tests and planning records only (no user-visible behaviour), which AGENTS.md allows to omit.
- **Commits.** The plan's brief says "do not commit"; the dispatch required per-task commits. Nothing was pushed or tagged.
- **Start time not captured.** `duration: 25min` is estimated from the first and last commit times and the session length, not from a recorded start.
- **Requirements.** `requirements.ready-ids` returned WORLD-14 ready and SAVE-08 and WORLD-16 blocked (plan 12-12 also declares them and has no SUMMARY yet), so only WORLD-14 was marked complete. The Key Decisions row states SAVE-08 is complete for the inert world; REQUIREMENTS.md keeps SAVE-08 and WORLD-16 Pending until 12-12 and 12-14 finish.

## Known Stubs

None.

## Threat Flags

None. T-12-22 (a tampered `nextEntityId` is parsed and never copied over the regenerated counter; rows in save-v3.test.ts and world-lifecycle.test.ts) and T-12-33 (the same-tick rows, recorded in the lifecycle row) are mitigated as the plan states; no new endpoint or trust boundary, and no src file changed.

## Next

Ready for 12-10 (the scanner contacts) and 12-12 (the populated browser/Node parity can now hold, since the replay populates like the session).

## Self-Check: PASSED

- FOUND: tests/app/session/traffic-variants.test.ts, tests/helpers/tick-script.ts, tests/app/session/world-lifecycle.test.ts, tests/app/session/tick-parity.test.ts, tests/persistence/save-v3.test.ts, .planning/PROJECT.md
- FOUND commits a62efd1, 22a752a and 3e4a7b4 on HEAD
- Acceptance greps: `same tick` 3, `serializeWorldSection` 10+, `createInertPopulate` 8+, `Pitfall 17` 1, `CLASS_BUOY` 2 (world-lifecycle); `trafficContent(` 1 (tick-script); `SAVE-08` 1+ (save-v3); `runTickScript(... traffic: true` 2 (tick-parity); `torusRefused` 1+ (traffic-variants); the three PROJECT.md phrases 1 each
