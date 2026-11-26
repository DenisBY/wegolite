# Phase 22: Initial Population - Context

**Gathered:** 2026-11-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Port the initial-population half of Oolite's `oolite-populator.js`: each system the player arrives in with traffic on is populated with traders, pirates (independents and packs), police and light bounty hunters at the rates its government, economy, tech level and neighbours give, as whole groups at Oolite's location codes. The port is verified against oracle fixtures recorded from Oolite's own script. The ships stay inert (`ai: null`): they are drawn, appear on the scanner, count for mass lock and jump blockage, and can be shot. The largest anarchy draws within the draw-call budget (completing QUAL-09). Requirements: WORLD-08, QUAL-09. Repopulation (WORLD-19), launches and departures (WORLD-09) and every AI behaviour belong to later phases.

</domain>

<decisions>
## Implementation Decisions

### Placement at the station (STATION_AEGIS)
- **D-01:** Ships are placed exactly as Oolite places them. STATION_AEGIS is `OORandomPositionInShell(station, 1.2 × collision radius, 2 × SCANNER_MAX_RANGE)`, rejected while inside 1.5 planet radii (`Universe.m:1811-1815`), and it goes through the existing samplers in `src/sim/world/placement.ts`. Initial population never launches a ship from the station. Oolite's STATION_AEGIS entries (`oolite-populator.js:671`, `:946`) are plain coordinates, so no launch or exclusion logic is added. This keeps the draw counts equal to the oracle's.
- **D-02:** Until Phase 23 an inert ship can land on the dock axis, where a launching player would hit it. The 2,048-system census (success criterion 3) also counts the ships that land inside the launch corridor (the docking corridor geometry in `src/sim/dock/corridor.ts`, extended out along the launch path). If the count is above zero, add a todo with a tripwire guard that Phase 23 closes, since its AI moves ships away from the station. Do not add an exclusion zone in this phase. — **Reversibility:** reversible.
- **D-03:** The initial populator uses no planet location in scope. Planet-orbit codes appear only for rock hermits, which are out of scope. Planet launches and landings belong to the WORLD-09 stand-in (Phase 23) and repopulation (Phase 26).

### Oracle size
- **D-04:** The populator recorder records about 32 systems × 3 seeds under `tests/oracles/population/`. The sample is stratified:
  - all 8 government types;
  - rich and poor economies;
  - low and high tech levels;
  - at least one isolated system (no neighbours within 7 LY);
  - at least one bottleneck system;
  - the largest anarchy by expected population;
  - systems from more than one galaxy.

  The aim is to cover the rare branches of the formulas (the neighbour terms, the bottleneck test, the anarchy tail). The oracle size affects test coverage only: the game populates all 2,048 systems with the same planner either way. Fixtures stay in the hundreds of KB. Research picks the concrete system list and records why each system is in it. — **Reversibility:** reversible.

### Entity cap and overflow
- **D-05:** A group spawns whole or not at all. The populator may fill at most `MAX_ENTITIES` (256) minus a debris reserve. When a group does not fit, it is skipped and population continues with the next entries in the script's order, so smaller later groups (police, for example) can still fit. Each group draws from its own forked stream, so a skip moves no other group's draws. — **Reversibility:** reversible.
- **D-06:** The debris reserve is set from measured data: the worst debris of a fight, as in success criterion 5. The bound lives in `src/sim/world/limits.ts`. A test over all 2,048 systems asserts that no group is skipped in practice. Oolite has no such cap at population time, so the rule gets a `FIDELITY.md` row, and the row says that it never triggers for any committed system.

### Real-Oolite census spike (QUAL-13 groundwork)
- **D-07:** One independent plan at the end of the phase, with at most two attempts per obstacle. Success means headless Oolite in the reference container (`tools/oolite-reference`, run on the remote machine through `run-remote.sh`) starts in a chosen system through a scenario save, for one anarchy and one quiet system, and dumps a census of ships by role, with a script that repeats the run. Failure is recorded as an answer: where it got stuck and why. Phase 26 then compares against the oracle only. Either outcome closes the phase; the spike never blocks it. — **Reversibility:** reversible.

### Scope settled after research (owner, 2026-11-26)
- **D-08:** Engine escorts spawn in this phase. The stub host models `setUpMixedEscorts` from `escort_roles` (as compiled in Phase 21), the fixtures record the escorts, and the port spawns them with `ownerId` and `escortSlot`, each escort's primary role set to `escort`, as Oolite does. Safe governments drop a trader's escorts with probability `gov/7`, as in the script. This closes research assumption A3 and avoids a second re-pin in Phase 23. — **Reversibility:** reversible.
- **D-09:** Interceptor wings (`oolite-interceptors-route1`, `oolite-interceptors-witchpoint`) are in scope as police (research assumption A1). Thargoids, aegis raiders, asteroids, hermits and the two buoys are recorded cuts (A2).
- **D-10:** Trader opportunists keep their data effects (`PIRATE_GOODS`, `_setSkill(2)`, `_setWeapons(2.5)`), and only `switchAI` is cut (research assumption A4). This refines the "trader opportunists are absent as recorded cuts" wording of success criterion 1: the cut is the AI switch, not the ships' data.
- **D-11:** If the 2,048-system census shows a world with more groups than `MAX_WORLD_GROUPS` (128), raise `MAX_WORLD_GROUPS` from the census peak with headroom, instead of skipping groups. It is a world-state shape change: the v5 hash and snapshot bound move together and are re-pinned once, with the measured cause recorded (standing re-pin approval, 21-CONTEXT D-04), and a Key Decisions row records the new bound. If the census stays within 128, the bound is unchanged. — **Reversibility:** costly.

### Claude's Discretion
- The plan split after the fixed first plan (the recorder and its fixtures before the port).
- How the neighbourhood facts (`systemsInRange` within 7 LY, `bottleneck`) are computed outside the planner and injected, and how they are checked against Oolite's native code.
- The exact debris-reserve number, from measurement (D-06).
- The corridor-hit measurement method (D-02).

### Folded Todos
- `2026-11-25-pod-kind-live-populator.md` (`resolves_phase: 22`): the live populator sets `cargoKind` at spawn, per Oolite's per-context `setCargoType` calls:
  - a trader leaving the station gets PLENTIFUL_GOODS, and an arriving trader gets SCARCE_GOODS;
  - a medical ship gets MEDICAL_GOODS (narcotics, E-198);
  - offender opportunists and pirates get PIRATE_GOODS;
  - couriers get ILLEGAL_GOODS;
  - a ship whose cargo type is never set carries no cargo.

  Add a runtime test over sample worlds that no placed ship has `cargo > 0` with `cargoKind` 0, and that each kind matches its spawn context. Do not widen the allow-list of `tests/guards/pod-kind-fallback.test.ts`. Update the FIDELITY rows that describe the fallback (E-197 and the E-78 rewrite) so they say it applies only to the inert path.
- `2026-11-25-missiles-and-ecm.md` (roadmap-named): every NPC spawns with zero missiles. The tripwire guard lands with CBT-19 in Phase 23, not here.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and decisions
- `.planning/ROADMAP.md` § "Phase 22: Initial Population": goal, success criteria, scope note, implied work, pitfalls C1/C4/C12/M7/m7, ordering rules (frozen inert path, oracle-first, standing gate QUAL-12)
- `.planning/REQUIREMENTS.md`: WORLD-08, QUAL-09, QUAL-12 (standing), QUAL-13 (spike groundwork), owner decisions D1-D13
- `.planning/PROJECT.md` Key Decisions: the WORLD-15 / `INERT_POPULATION` row (Phase 22 records the live session's move to the new populator beside it); "Draw-call budget and NPC model loading for the v2.4 roster"
- `.planning/phases/21-roster-state-shape-and-seams/21-CONTEXT.md`: D-04 (standing hash re-pin approval for v2.4), D-05 (draw-call budget, 21-18 deferral, no raise while 21-18 stays deferred), D-07 (lazy model loading)
- `.planning/research/SUMMARY.md` § "Phase 22" and the population-size open question; `.planning/research/PITFALLS.md` (C1, C4, C12, M7); `.planning/research/FEATURES.md` R1.4, R2.3
- `FIDELITY.md`: E-78, E-197, E-198 and the new rows this phase adds (cap rule; cuts)

### Oolite reference (local checkout, pin 7437f22; never vendored)
- `/home/opencode/git/oolite/Resources/Scripts/oolite-populator.js`: the initial populator, group builders `_addFreighter`, `_addCourier`, `_addSmuggler`, pirates, hunters and police (around lines 600-1000 and 1380-1900), `setCargoType` (lines 1385-1448), and `_addShips` (line 2359)
- `/home/opencode/git/oolite/src/Core/Universe.m:1773-1830`: `locationByCode` (WITCHPOINT, LANE_*, STATION_AEGIS)
- `/home/opencode/git/oolite/src/Core/Entities/ShipEntity.m:7323-7375`: `setCargoFlag`

### Todos
- `.planning/todos/pending/2026-11-25-pod-kind-live-populator.md`
- `.planning/todos/pending/2026-11-25-missiles-and-ecm.md`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/sim/world/placement.ts`: ports of `locationByCode` (LANE_WP/WS/PS/WPS, STATION_AEGIS), the shell and cylinder samplers, `randomQuaternion`, and the `MAX_PLACEMENT_TRIES` cap with its `fallback` flag. A WITCHPOINT code is still to add.
- `src/sim/world/populate.ts`: the inert populator (`populateInertWorld`, `INERT_POPULATION`). It is the pattern for record filtering, totality and per-spawn forked cargo streams. It is frozen and must not be edited.
- `src/sim/rng.ts` `forkSeed`: forked stateless streams, one per group and roll (C4).
- `src/sim/world/world.ts` `World.groups` / `World.populator` and `src/sim/world/serialize.ts` (`groups:`, `repop:` lines), designed in Phase 21 with pristine-omit hashing. Phase 22 writes `World.groups` for the first time.
- `src/sim/world/debris.ts` `resolvePodCargoKind`: its fallback serves only the inert path (folded todo).
- `tools/ai-harness/` (`host.ts`, `load.ts`): the dev-only harness that runs Oolite's JS. The populator recorder builds on it, and `check:dist` keeps it out of `dist`.
- `tools/oolite-reference/` (`run-remote.sh`, `steps/`): the headless Oolite container used by the spike (D-07).

### Established Patterns
- Oracle-first, as in Phases 14 and 17: record the fixtures from Oolite's own script and commit them under `tests/oracles/`, then port. CI replays the fixtures without the checkout.
- Every new sim function is total on malformed input, with a fast-check property. Bounds live only in `src/sim/world/limits.ts`. `MAX_ENTITIES` = 256 (`src/sim/world/ids.ts:61`).
- The galaxy-0 sweep in `tests/sim/world/populate.test.ts` asserts that no placement fallback is taken. The 2,048-system census follows the same pattern.

### Integration Points
- `src/app/session/traffic.ts` and `src/app/session/world-lifecycle.ts` call the inert populator today. The traffic-on live session switches to the new populator, built beside the inert one.
- Re-pins, under 21-CONTEXT D-04: `tests/app/session/tick-parity.test.ts` and the traffic-on browser twins. The frozen 20-seed run and the epoch 1-20 inert pin must not move.
- Draw-call proof: `tests/e2e/anarchy.spec.ts` (calls assertion, tripwire for 21-18) and `tests/e2e/budget.spec.ts` (`DRAW_CALL_BUDGET` = 50).

</code_context>

<specifics>
## Specific Ideas

- The owner confirmed that the oracle size is a test-coverage question only, with no gameplay effect. The stratified sample was chosen for coverage of rare formula branches rather than breadth.
- Fidelity first: no gameplay workaround (such as a dock exclusion zone) for a temporary inert-phase artefact. Measure it, and let the AI phase resolve it.

</specifics>

<deferred>
## Deferred Ideas

None came up in the discussion; it stayed within the phase scope.

### Reviewed Todos (not folded)
- The automatic todo match returned 43 keyword hits. Apart from the two folded todos, none belong to this phase. Phase-tagged todos stay where they are tagged (Phase 23: `narrow-kill-time-ship-target-lost`, `player-ident-lock-in-target-targets-self`, `skip-shiphit-for-a-doomed-target`; Phase 25: `mutual-kill-credit-symmetry`; Phase 26: `acceptance-run-with-collisions-on`). The `npc-variant-family-instancing` todo (deferred plan 21-18) stays behind its tripwire in `tests/e2e/anarchy.spec.ts`. It becomes live only if the real anarchy population exceeds 50 calls.

</deferred>

---

*Phase: 22-initial-population*
*Context gathered: 2026-11-26*
