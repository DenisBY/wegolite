# Project Research Summary

**Project:** Wegolite, milestone v2.3 "Combat and Death"
**Domain:** Deterministic browser port of Oolite; combat consequences added to an existing fixed-step, golden-hashed simulation (NPC laser fire, hits on stations and buoys, ship destruction with wreckage and cargo, ship collisions, player death and game over)
**Researched:** 2026-11-16
**Confidence:** HIGH on rules and integration points (read from the Oolite checkout and the Wegolite tree); MEDIUM on wreckage lifetime, per-hull cargo, the Coriolis subentity rule and effort estimates. This SUMMARY supersedes the one from the earlier milestone.

## Executive Summary

v2.3 is a rules-porting and integration milestone, not a technology milestone. The v1 to v2.2 stack is validated, and every new capability is hand-written sim code that follows closed-form Oolite rules: damage `m * v^2 / 50,000,000`, the NPC fire gate, `becomeExplosion` and `releaseCargoPodsDebris`, `takeInternalDamage`, and `getDestroyedBy`. The only real stack work is in the content pipeline: widening the NPC record, vendoring about eight models and several textures, and emitting hulls for the Coriolis, buoy, pod and alloy plate. The expensive part is that every new rule has to pass through four constraints: determinism (own-stream draws, no frame-time gates), the frozen Phase 14 entity record and golden, the frozen 20-seed acceptance run, and a clean tick boundary (no dead entity, no queued AI event).

The recommended approach has four parts.
1. Design all new hashed entity state once, with one `WORLD_SNAPSHOT_VERSION` 4 bump and one golden regeneration, taken in the first plan.
2. Route all damage through one ledger, `applyDamage`, resolved after `stepWorld`, with a second `commitWorld` and an immediate AI drain so the tick boundary stays clean.
3. Keep death as a single sim function that sets `FlightMode "dead"`, and give the app a single death flow that reuses the existing warm-Load install path instead of a second restore path.
4. Keep explosions and effects render-only.

Do not add a physics engine, particle library, ECS or any dependency. Do not raise `MAX_ENTITIES`. Scale Oolite's 0.95 and 0.50 debris thresholds to the current cap of 256 (243 and 128).

The biggest risk is not technical. In shipped play every NPC is `ai: null`, and priority AI, pirates and police are out of scope, so nothing makes an NPC fire. Without an owner decision, "NPC fire" is reachable only through test pilots. Further risks:
- The frozen acceptance run throws on any flyer death, and it only runs by hand on the remote machine.
- Save and equipment-damage persistence is contested between the research files.
- Statics (Coriolis, buoys) have no energy, hull or removal path today, and the Coriolis hull may break the hull artifact caps.
- A dead player must never be autosaved, because `snapshotForSave` currently encodes any non-`inFlight` mode as `docked`.

## OPEN FOR THE OWNER

Decisions the four research files raise that the research cannot make. Ask in Russian, plain SRE/devops wording, with a recommendation.

| ID | Question | Recommendation | Source |
|----|----------|----------------|--------|
| **OQ-1** | **Who triggers NPC fire in shipped play?** All 12 populated NPCs are `ai: null`; `AI_REGISTRY` holds only test pilots. (a) engine only, proven by test pilots and the `?test=1` hook; (b) minimal wake-on-hit "reflex" AI attached when an `ai: null` ship is hit, recorded as a divergence; (c) pull a slice of role AI from the backlog. | (a) fits "technical minimum"; (b) only if a player must see it. Never shoot-on-sight, never (c). Record in Key Decisions and FIDELITY.md. | FEATURES Q1, ARCH Q1, PITFALLS 1 |
| **OQ-2** | **Equipment damage persistence / save v5.** STACK, ARCH, FEATURES TS-14: save v5 with `damagedEquipment`. PITFALLS: stay on v4 and remove the key (a `_DAMAGED` key is rejected by the save validator and there is no repair path). **Files disagree.** | Owner call; cheapest is key removal on v4 plus a FIDELITY.md row. Decide with OQ-3. | STACK, ARCH Q2, FEATURES TS-14, PITFALLS 13, 18 |
| **OQ-3** | **Repair (CBT-12 slice, D-8).** Add the 50 % repair at F3 or leave damage permanent? FEATURES: add; ARCH: leave out. | If repair is out, OQ-2 leans to remove-key. | FEATURES Q3, ARCH Q4 |
| **OQ-4** | **Statics hit model.** Port the subentity branch or bake Coriolis (faceplate, tris, dock) and buoy (core) into one merged octree? How does the buoy take damage? | Merged hull, parent energy only, recorded divergence; spike first on the Coriolis dock mouth. Station absorbs hits (25000 energy, 100/s, never destroyed); buoys (250, 2/s) hold state in a per-world `staticHealth`, hashed only when non-pristine. | FEATURES Q2, ARCH Q8, PITFALLS 11 |
| **OQ-5** | **Entity cap 256 vs Oolite's 2048.** | Keep 256; thresholds 243 and 128; drop the frame-time term (`getTimeDelta < 0.125`) and record both; keep the scanner-range gate. | STACK, FEATURES TS-6, PITFALLS 8 |
| **OQ-6** | **Coriolis octree vs hull caps** (`MAX_HULL_NODES` 16,384; `MAX_HULL_ARTIFACT_BYTES` 200,000; artifact already 89,673 bytes). | Measure in the `assets` container. Fits: one file, `MAX_HULLS` 32. Otherwise a separate `ships-statics-hulls.json`. Key Decisions row either way. | STACK, ARCH 13 |
| **OQ-7** | **Snapshot design:** always-present `;wpn:` segment (ARCH) vs pristine-omit (PITFALLS); debris motion model (heading + `speed` vs bounded velocity vector). | One v4 bump, one regeneration of `inert-lave-epoch1.json`, strip-and-rehash proof to the previous golden; pristine-omit wherever a field is default for existing ships; decide the motion model in the same plan. | ARCH 6, PITFALLS 3, 9 |
| **OQ-8** | **Vendoring new assets** (wreck1..5, oolite_alloy, oolite_barrel, textures, five particle sprites). | Copy from the local checkout via `scripts/vendor-oolite.sh`, with `CHECKSUMS.sha256`, `ASSETS.md`, `NOTICE` rows. Confirm sanctioned. | STACK, ARCH 8, PITFALLS 25 |
| **OQ-9** | Game over: reload or in-page return to title? | Page reload (also matches Oolite). | ARCH Q5 |
| **OQ-10** | May the player die while `launching`? | Require `inFlight`; clamp energy at 1 while launching; record divergence. | ARCH Q6, FEATURES TS-12 |
| **OQ-11** | Station-hull contact stays damage-free (v1)? | Yes, until DOCK-09; state it in the requirements. | FEATURES Q4, PITFALLS 12 |
| **OQ-12** | Buoy collision vs arrival/launch poses (`hyperspace-failure.spec.ts` parks at 0 m from the witchpoint buoy; buoy hull ~100 m vs sim radius 10 m). | Sanctioned fixture change with a Key Decisions row; unit test that no arrival draw overlaps the buoy hull. | FEATURES Q5 |
| **OQ-13** | Wreckage lifetime (LOW confidence, ~E/1000 s). | Pin the formula, mark LOW in FIDELITY.md, add to the deferred todo `2026-11-14-measure-oolite-reference-in-docker`. | FEATURES Q6, PITFALLS 20 |
| **OQ-14** | Smaller calls: (a) lasers never internally damaged; (b) `ship_trade_in_factor` not persisted; (c) subentity explosion/ring/spark polish deferred; (d) world during the 30 s game-over window. | (a) yes; (b) no; (c) defer; (d) freeze with a deterministic dead hash. | FEATURES D-6, D-9, ARCH Q3 |

## Key Findings

### Recommended Stack (STACK.md)

Zero new runtime or dev dependencies, no Docker image change, no version bumps (TypeScript, Three.js 0.187.0, zod 4.6.7, Vite, Vitest, fast-check 4.10.2, Playwright stay pinned). No `docker compose down --volumes` needed.

- TypeScript sim (`src/sim/combat/`, `src/sim/npc/`): pure functions over `World` for damage, destruction, collision, internal damage.
- Three.js `InstancedMesh`/`Points` pools (`src/render/bodies/`) for explosions, flashes, sparks, debris, as in `laser-shots.ts` and `npc-ships.ts`.
- zod strict schemas: widen the NPC and hull records, never loosen.
- Content ingest: vendor debris models, widen the NPC record, emit Coriolis/buoy/barrel/alloy hulls, compile `explosions.plist` to `explosions.json`.
- fast-check: damage formulas, `isHitByOctree` against a brute-force reference, totality.

Rejected: physics engines, particle libraries, `three-mesh-bvh`, ECS/XState, server or database, the frame-time gate. Never `Math.random` or `Date.now` in `src/sim`.

Numbers to reproduce (Oolite source): collision `dam = m_other * v^2 / 5e7`, 0.05 floor, separating faster than 1 m/s ignored, stations never moved or destroyed; `n_alloys = (mass/6000)^(1/4)`, up to 3 wrecks, pod chance 70 falling 30 (NPC) or 20 (player) per survivor, 15-pod limit, blast momentum `0.125 * mass` over `2.5 * radius`; internal damage loop `(rand & 31) < amount`, minus 32 per iteration; NPC fire gate (temperature cutout 0.85, energy, recharge, range roll, `onTarget`).

### Expected Features (FEATURES.md)

**Table stakes:** TS-1/3/15 NPC destruction at energy 0 (station exempt), NPC-vs-NPC kills, clean removal (`entityRemoved`, `identLost`); TS-2/4 NPC fire by Oolite's gate and hits on the player through shields; TS-5/6/7 pods, scrap, wreckage with the entity cap; TS-8/9 lasers and ident hit station and buoys (closes todo `2026-11-15-lasers-and-ident-hit-stations-and-buoys`); TS-10/11 ship-ship and ship-buoy collision damage; TS-12/13 player death from any cause and game over loading the last save; TS-14 player internal damage; TS-16 render-only explosion.

**Nearly free:** D-3 explosion momentum on neighbours, D-2 evasive-on-hit. Owner-gated: D-1 retaliation (OQ-1), D-8 repair (OQ-3).

**Defer:** D-4 sparks, D-5 particle fidelity, D-7 B&W fade, D-9 trade-in wear persistence, D-10 buoy core fidelity. **Out:** missiles, ECM, mines, escape pods, bounty/legal status, scooping, sun/planet/heat death, docking-slot scrape damage, audio, asteroids, server/database, raising `MAX_ENTITIES`.

### Architecture Approach (ARCHITECTURE.md)

Everything resolves at one point of `stepSim` after `stepWorld`: player-dead early-out, `resolveCollisions`, `resolveShotHits` (returns records), `applyDamage` (ledger, ascending order), `destroyShips`, `checkPlayerDeath`, `drainAiEventsNow`, second `commitWorld`, then `updateIdentTarget`. The tick boundary is always clean. The sim decides and emits events; the app commits profile changes. Death is `FlightMode "dead"`, fail-closed in every existing mode gate.

Components: (1) `ledger.ts`/`destroy.ts`/`debris.ts`; (2) `npc/fire.ts` + `SteerContext.fire`; (3) `collision.ts` + `isHitByOctree`; (4) `static-hulls.ts` + `staticHealth`; (5) `death.ts`, `death-flow.ts`, `game-over.ts`, `loadSavedGame`; (6) `internal-damage.ts`, `damage-flow.ts`; (7) render `debris.ts`, `explosions.ts`.

### Critical Pitfalls (PITFALLS.md)

1. Nobody pulls the trigger (OQ-1); test the whole fire route through the hook spawn.
2. Phase 13's gate-less fire becomes 120 Hz spam once steering calls fire; port the full gate, quantise `shot_time` to integer ticks, extend oracle fixtures first (written without reading `src/sim/npc`).
3. Every hashed field costs a snapshot bump and golden regeneration; one bump, strip-and-rehash proof, pristine-omit, wreckage lifetime reuses `Entity.energy`, bounds in `limits.ts` only.
4. The frozen acceptance run throws on any flyer death; keep new fire and collision gated so frozen worlds are byte-identical; octree collision, never sphere-only; rerun 21 of 21 by hand on the remote machine after every plan touching `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json`; changing the harness needs the `Detector-change-approved-by-owner` trailer.
5. Kills after the commit leave a dead entity at the tick boundary (`snapshotWorld` throws): second commit, one idempotent `killShip`, property test.
6. Death is decided inside the damage funnel, not by polling; amend N2, the player energy floor and A7.
7. Autosave and death: `snapshotForSave` must refuse `dead`; session latch before every autosave/manual-save guard; death-load waits for queued writes; never write on death.
8. One death path: enumerate about 15 `paused` sites, chart, F2 screen, countdown, ident lock, held keys, focus loss, context loss; refactor `loadFromSave` out of F2 gating; handle every save status.
9. Debris determinism: no frame-time gate, draw even when `spawnEntity` refuses at the cap, fixed spawn order, hash equal at 30/60/144 Hz.
10. New combat code is outside AI fault containment: keep every function total, fast-check it.

## Implications for Roadmap

Phase numbering continues at 15. A single snapshot bump goes first; the damage funnel precedes fire, collisions and death; statics and collisions share one hull table; death comes last because it consumes every damage source.

- **Phase 15: Foundation, damage ledger and destruction core.** Plan 1 is the single entity-field design (weapon, cargo, `staticHealth`, motion model), snapshot v4, one golden regeneration, compiled NPC cargo/weapon fields. Then ledger, `killShip`, second commit, `drainAiEventsNow`, events, NPC death at energy 0, clean removal, `identLost`. TS-1, TS-3, TS-15. Needs OQ-7.
- **Phase 16: Debris, cargo, wreckage, entity cap.** Pods, alloy plates, wreckage, thresholds 243/128, ballistic debris, instanced layers, `explosions.json`, vendored models with provenance. TS-5/6/7/16, D-3. Needs OQ-5, OQ-8.
- **Phase 17: NPC fire.** `npc/fire.ts`, `SteerContext.fire`, un-skip `fireMainWeapon:` sites, cooling and shot timer, decision source per OQ-1, new oracle fixtures, end-to-end hook-spawn spec. TS-2/4, D-2. 20-seed acceptance by hand. Needs OQ-1.
- **Phase 18: Statics as targets, and collisions.** Coriolis/buoy/barrel/alloy hulls, `static-hulls.ts` poses, laser and ident candidates, buoy `staticHealth`, `isHitByOctree` port, `collision.ts`, player `impulse` response. TS-8/9/10/11. Needs OQ-4, OQ-6, OQ-11, OQ-12.
- **Phase 19: Player death, game over and internal damage.** `FlightMode "dead"` with fail-closed review of the 48 mode references, `deathFlow`, `GameOver` overlay and input context, `loadSavedGame`, autosave latch, probe `death` field, `internal-damage.ts`, `damage-flow.ts`, save v5 or key removal (OQ-2), F3 repair if OQ-3. TS-12/13/14. `verify-full` once at the end.
- **Phase 20 (close-out, may fold into 19):** final acceptance (21 of 21), `verify-full`, FIDELITY.md rows and Key Decisions amendments, CHANGELOG, provenance, CI timeout margins.

Gates (AGENTS.md): pure `src/sim/` plans need `test`, `lint`, `typecheck`; browser-facing plans need `verify`; death flow and persistence need `verify-full` once. Keep browser specs to about three (death-and-reload, game-over guard, NPC-fire hook).

### Research Flags

Need research during planning: Phase 17 (OQ-1, fire gate, `onTarget` per behaviour), Phase 18 (Coriolis octree spike, subentity decision, independent octree fixtures), Phase 16 (`becomeExplosion`, `releaseCargoPodsDebris`, wreckage lifetime, per-hull cargo), Phase 19 (OQ-2, OQ-3, per-pod to commodity mapping). Standard patterns: Phase 15, the death-flow wiring after decisions, Phase 20.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Numbers read from Oolite; open: Coriolis octree vs hull caps |
| Features | HIGH rules, MEDIUM effort | Wreckage lifetime LOW; static subentity details MEDIUM |
| Architecture | HIGH integration, MEDIUM fidelity | Cargo source per role, `onTarget`, Coriolis subentity, per-pod mapping need phase research |
| Pitfalls | HIGH | Wreckage lifetime and per-hull cargo MEDIUM |

### Gaps to Address

- Research disagreements: save v5 vs v4 key removal (OQ-2), `;wpn:` vs pristine-omit and debris motion (OQ-7), repair (OQ-3). Do not pick silently.
- Wreckage lifetime (LOW); per-hull cargo and NPC cargo source (MEDIUM; count-only pods per PITFALLS vs market-driven per FEATURES TS-5).
- Coriolis octree and subentity rule: measure, then decide.
- What a destroyed buoy means for scanner, ident, witchpoint beacon and `hyperspace-failure.spec.ts`.
- Death with a pending save write: confirm `store.read()` waits for a queued write.
- Cadence and cap tests for worlds containing kills.

## Sources

- Primary: Oolite checkout `/home/opencode/git/oolite` (pinned `7437f22`): `ShipEntity.m`, `PlayerEntity.m`, `Universe.m`, `CollisionRegion.m`, `Octree.m`, `OOTypes.h`, `OOEquipmentType.m`, `Resources/Config/{shipdata,equipment,explosions,descriptions}.plist`; Wegolite tree at `main` `9419f1c`; `.planning/PROJECT.md`; `AGENTS.md`; Context7 `/mrdoob/three.js/r186`; npm registry (2026-11-16).
- Secondary (MEDIUM): Wegolite effort estimates; cargo-source, `onTarget`, Coriolis-subentity details.
- Tertiary (LOW): wreckage lifetime (about `E/1000` s).

Detailed findings: `.planning/research/STACK.md`, `FEATURES.md`, `ARCHITECTURE.md`, `PITFALLS.md`.

---
*Research completed: 2026-11-16*
*Ready for roadmap: yes, once OQ-1, OQ-2, OQ-4, OQ-6 and OQ-7 are answered (or explicitly deferred into the affected phase's discuss step)*
