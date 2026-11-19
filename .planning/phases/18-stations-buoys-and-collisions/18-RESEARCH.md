# Phase 18: Stations, Buoys and Collisions - Research

**Researched:** 2026-11-19
**Domain:** Deterministic TypeScript simulation port of Oolite's laser-hit subentity rule, octree-against-octree collision, `collideWithShip` velocity/damage response, buoy health, plus the content build for four new hull sets
**Confidence:** HIGH on the Oolite rules and the Coriolis measurement (read from the checkout and run in the `assets` container this session); MEDIUM on integration choices marked `[ASSUMED]` (they need owner or planner confirmation)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Carried forward (already decided, do not re-ask)**
- Statics are hit by porting Oolite's subentity rule. The merged-hull shortcut is not taken (owner, 2026-11-16).
- The station only absorbs hits and is never destroyed. Only buoys hold damage, in `World.staticHealth` (Phase 15, FOUND-18, D-08/D-09).
- Contact with the station hull stays damage-free until DOCK-09. Docking is unchanged.
- Station and buoy collision radii are Oolite's: 779.37 m and 59.14 m (quick task 261117-k1l).
- The first plan measures the Coriolis octree, with its subentities, against the hull caps (16,384 nodes, 200,000 bytes) in the `assets` container.
- The player's energy stays floored at 0 until Phase 20. A collision cannot kill the player in this phase.
- Phase 18 supersedes the Key Decisions row "Statics are neither laser nor ident targets", in the same commit as the rule change.

**Collision response (the push)**
- **D-01:** Port Oolite's collision velocity response in full, for NPC ships, debris and the player. `collideWithShip` (`ShipEntity.m:11020-11140`) gives each party its elastic change along the line of centres (`adjustVelocity`). This includes the "moving apart at over 1 m/s" early return, the 1 m/s anti-conjoin push and the reversal when one party dies ("inelastic! - take explosion velocity damage instead"). Port the damage formula from the same function: `dam = m_other * v2b^2 / 50000000`, applied through `takeScrapeDamage`. Do not port it from the wrong half (PITFALLS 12). — **Reversibility:** costly — the drift velocity becomes hashed simulation state that every collision replay and golden depends on.
- **D-02:** Drift is a separate velocity vector beside the engine speed, as in Oolite. NPCs reuse `Entity.velocity` from snapshot v4 (Phase 15, D-01). The player gets a drift vector in its flight state. Each tick, power braking removes the drift: the player by `thrust` (`PlayerEntity.m:3372-3405`, with the `VELOCITY_CLEANUP_*` terms), an NPC by `SHIP_THRUST_FACTOR * thrust` (`ShipEntity.m:5810-5823`). Worlds and flights that never collide must hash as before (pristine-omit, success criterion 5).
- **D-03:** The explosion blast push is ported onto ships and the player, not only debris. This supersedes the Phase 16 Key Decisions row "The explosion's blast pushes debris only" (D16-04 / OC-4). Use `dealMomentumWithinDesiredRange:0.125 * mass` with `desired_range = 2.5 * collision_radius` (`ShipEntity.m:7680-7698`, `8123-8126`, `addImpactMoment` at `11178`). Owner decision 2026-11-19, after an independent check. The push is invisible for an ordinary kill at non-overlapping range (at most 0.09 m/s on an NPC and 0.003 m/s on the player, braked within one frame). It is large for a ramming or point-blank kill: a Krait dying inside the player's sphere gives the player 68 m/s, about 72 m of drift. Oolite relies on it as the survivor's rebound after a lethal collision, because `collideWithShip` reverses the normal rebound in that case.

**Destroyed buoy**
- **D-04:** A destroyed buoy stays destroyed for the life of the current `World`, and a new world brings it back at full energy. A new world is created by a jump arrival, a save load and, by the existing lifecycle, every launch. Saves are unchanged: a save never carries world state. In Oolite a buoy stays destroyed through a dock and relaunch within the same system visit. Wegolite rebuilds the world on every launch, which is the existing world-lifecycle divergence that NPCs share (`src/app/session/world-lifecycle.ts`). It is not changed here. Record it in FIDELITY.
- **D-05:** A destroyed buoy leaves the 3D view and the scanner, ends any ident lock on it, and stops blocking jumps (D-09). The compass follows Oolite's rule for a destroyed beacon. The researcher must port the exact rule, with citations, for the "witchpoint" compass mode (`src/sim/world/aegis.ts` cycle: auto -> planet -> station -> witchpoint), both when that mode is selected and when the buoy dies while it is selected.
- **D-06:** Owner sanction to change the fixture pose in `tests/e2e/hyperspace-failure.spec.ts` (it parks the player at 0 m from the witchpoint buoy). Move it outside the buoy hull and outside the 264.3 m blockage radius, with a Key Decisions row. Add a unit test that no arrival or launch pose overlaps a buoy hull. This is the one sanctioned edit to an existing browser spec in this phase.

**Debris as targets**
- **D-07:** Follow Oolite's `canCollide` rule exactly. Laser hits (`Universe.m:5578`) and ident (`Universe.m:5691`) both require it.
  - Cargo pods and alloy plates get hulls (DATA-15). They can be shot, rammed and ident-locked, and are destroyed at zero energy.
  - Wrecks get no hull. They never collide and are neither laser nor ident targets (`ShipEntity.m:1858-1868`).
- **D-08:** Pods, plates and buoys do not mass-lock (`PlayerEntity.m:3045-3051`, CLASS_CARGO and CLASS_BUOY). Pods and plates do not block jumps. Debris stays off the scanner until scooping (D16-26 unchanged).

**Buoys block the jump (folded todo)**
- **D-09:** Fold in `2026-11-14-make-buoys-block-hyperspace-like-oolite.md`. Both live buoys join the existing `isWitchspaceBlocked` path with their compiled mass of 698,691.1875, giving a blockage radius of about 264.3 m, as observed in Oolite 1.93.1 by quick task 261117-lka. A destroyed buoy does not block. Update FIDELITY E-22 and the Key Decisions row "Keep the buoys non-blocking in Phase 12". The researcher must confirm against Oolite whether an immediate re-jump after arrival next to the witchpoint buoy is refused, and how Oolite places the arrival relative to the buoy. Wegolite must match.

### Claude's Discretion
- Whether the Coriolis hull fits the existing hull artifact or ships as its own lazily loaded file. The measurement decides; record the result as a Key Decision.
- How the player's collision damage passes through shields and energy: follow Oolite's `takeScrapeDamage` for the player, and reuse the Phase 17 shield path where it matches.
- The broad phase and pair-cost strategy (PITFALLS 17), the launching exemption and once-per-pair resolution order, all within the determinism rules (ascending id, 30/60/144 Hz equality).
- How the station's subentities answer hits at the dock mouth: port Oolite's rule, proven by octree fixtures written independently of the port.

### Deferred Ideas (OUT OF SCOPE)
- Keep a destroyed buoy destroyed across dock and relaunch within one system visit, as in Oolite. This needs world state to outlive the docked period, which is a world-lifecycle change, not this phase.
- Reviewed, not folded: `2026-11-18-per-system-main-station-types.md` (the hull work here should not preclude it); UI todos `2026-11-17-ui-flight-hud-differences-from-oolite.md`, `2026-11-11-terminal-color-palette-setting.md`; tripwire todos `2026-11-18-mutual-kill-credit-symmetry.md`, `2026-11-18-narrow-kill-time-ship-target-lost.md`, `2026-11-17-skip-shiphit-for-a-doomed-target.md`, `2026-11-19-player-ident-lock-in-target-targets-self.md` (if collision kills become the first consumer, the planner must honour the tripwire); `2026-11-14-measure-oolite-reference-in-docker.md` (may be used to verify D-09, not folded). Not in this phase: planet and sun collision, scooping, the player's death (Phase 20), equipment damage (Phase 19), per-system station types.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-15 | Hulls for the Coriolis (with subentities), the buoy, the cargo barrel and the alloy plate are built from Oolite octrees; Coriolis size measured in `assets` and either fits the hull caps or ships as a separate file | Measured this session: the Coriolis does not fit (32,841-node hull alone vs 16,384 cap; about 293 kB total vs 200,000 B). Needs a second lazy artifact plus a `subentities` schema extension (see "Coriolis measurement", Pattern 1) |
| CBT-17 | Lasers and ident hit the station and the navigation buoys; station only absorbs, buoys (250 energy) hold damage and can be destroyed; subentities ported as in Oolite | `doesHitLine:hitEntity:` subentity rule (`ShipEntity.m:1323-1357`), dock-mouth probe results, ledger and `staticHealth` widening, ident over static ids, compass fallback rule, jump-blockage fold-in (Patterns 2, 3, 6, 7) |
| CBT-18 | Ship-ship and ship-buoy collisions damage both by Oolite's mass and closing-speed rule (octree against octree); station contact stays damage-free | `collideWithShip` full sequence with line numbers, `isHitByOctree`/`doOctreesCollide` port notes, drift state, blast push, scrape damage path for the player, opt-in gating for the acceptance harness (Patterns 4, 5, 8) |
</phase_requirements>

## Project Constraints (from AGENTS.md)

Directives that bind every plan of this phase [VERIFIED: /home/opencode/git/wegolite/AGENTS.md read this session]:

- Everything runs in Docker. A green host run is not evidence. Commands: `docker compose run --rm test`, `... test npx vitest run <file>`, `... e2e sh -lc "npm run build:e2e && npx playwright test <spec>"`, `... typecheck`, `... lint`, `... assets`, `... assets npm run assets:check`, `... verify`, `... verify-full`. `verify`, `verify-full` and browser tests run on the remote test machine, owner-gated.
- Gate choice: pure `src/sim/` changes need `test`, `lint`, `typecheck`; browser-facing code (`src/app/`, `src/render/`, `src/input/`, `src/ui/`, `index.html`) needs `verify`; `verify-full` for render, input, persistence or network-guard changes.
- QUAL-11: after any change under `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json`, rerun `npm run test:acceptance` by hand on the remote machine and record the 21-of-21 result in the plan SUMMARY. Thresholds and detectors are frozen (`Detector-change-approved-by-owner` trailer).
- `src/sim/` must not import Three.js or touch the DOM; pure, fixed-timestep, deterministic. Content data is compiled from Oolite at build time; never hand-edit `src/content/generated/`.
- No database; saves unchanged. No OXP. Licensing: record provenance for any new asset in `NOTICE`/`ASSETS.md` (no new asset is needed here: every model is already vendored, see Environment Availability).
- Scratch reproductions live under `/tmp` mounted into the container; never in the repo. Docs in English. CHANGELOG `[Unreleased]` entry in the same commit as each user-visible change. Record significant decisions in `.planning/PROJECT.md` Key Decisions.
- Do not edit via Edit/Write outside a GSD workflow. Reviewers are read-only.
- Prefer `rg` over `grep`. Use the codebase-memory index and confirm against files. Include the Oolite checkout path (`/home/opencode/git/oolite`) and the Docker-only brief in every subagent prompt.

## Summary

Phase 18 is five coupled ports and one content change. (1) The hull build must produce octrees for the Coriolis (hull plus the three solid subentities faceplate, tris and dock), the buoy (hull plus `oolite_buoy_subents`), the cargo barrel and the alloy plate. The measurement the roadmap demands was run this session: the Coriolis hull alone is 32,841 nodes and `oolite_coriolis_tris` is 30,089, both over the 16,384-node per-hull cap, and the four Coriolis octrees total 71,268 nodes and about 168,600 bytes of compact JSON against a 200,000-byte file cap that already holds 89,673 bytes. It cannot fit; it ships as its own lazily loaded artifact with a schema that carries `subentities` and its own bounds. (2) The laser hit rule must gain Oolite's subentity branch: the beam is tested against the hull octree and then against every ship-subentity octree at its offset, and the smallest non-zero distance wins. At the dock mouth this means a shot through the slot ends on the dock tube's back wall about 242 m inside, a shot beside the slot ends on the faceplate, and the hull octree alone would let both through. (3) Statics (ids 3, 4, 5) and pods/plates (kind `cargo`) become hit and ident candidates; buoys lose energy in `World.staticHealth`, recharge at 2/s, and a buoy at energy 0 is destroyed, which must disappear from render, scanner, ident, compass and jump blockage. (4) Collisions need `isHitByOctree` ported (not yet in `src/sim/combat/octree.ts`), `collideWithShip` ported from its real sequence, a drift vector for NPCs (the `Entity.velocity` field exists but nothing integrates it for ships) and for the player (a new flight-state field; `FlightState.impulse` has dock-bounce semantics and must not be reused), the blast push on ships and the player, and a scrape-damage path for the player that does not heat the cabin (`routeDamage` heats). (5) The collision stage must be opt-in so the frozen 20-seed acceptance worlds, which pass real hulls but no player combat state, stay byte-identical.

Three findings go beyond CONTEXT and need owner or planner attention. First, the buoys are layout statics that cannot move: Oolite's response moves the buoy (`adjustVelocity` on a non-station), so full fidelity is impossible; the cost of the divergence is small (the buoy's own thrust of 100 stops 100 m/s of drift within about 10 m) and the rule is below. Second, D-08 says pods and plates do not block jumps, but Oolite's blockage loop has no scan-class filter, so a pod within 9.97 m or a plate within 5.23 m of the player at countdown completion does block in Oolite; the decision stands but needs a FIDELITY row. Third, the nav buoy sits 10,000 m dead ahead of the dock on the launch axis, so flying straight out at the 350 m/s limit hits it at 631 m/s of rebound and 1,712 damage (player energy floors at 0 in this phase); fly-away browser specs that pass 10 km on the dock axis need an audit.

**Primary recommendation:** Plan in this order: (a) measurement and the second hull artifact with `subentities` schema (DATA-15, Key Decision), (b) subentity-aware laser hit plus statics/pods as candidates plus buoy health (CBT-17, with oracle fixtures authored in `tests/oracles`), (c) ident, compass, scanner, render and jump-blockage consumers, (d) `isHitByOctree` and `collideWithShip` as pure functions with an independent oracle, (e) drift state and the opt-in collision stage wired through the one ledger, (f) blast push on ships and the player, QUAL-11 reruns, docs. Port `collideWithShip` literally from `ShipEntity.m:11020-11152`, including its asymmetries, and write every divergence into FIDELITY.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Hull/octree compilation (Coriolis, buoy, barrel, plate, subentity offsets) | Content build (`tools/oolite-ingest`) | Content schema (`src/content/schemas`) | Build-time only; `src/sim` may not import the catalogue, so the sim sees a caller-supplied table |
| Static poses (station rotation, buoy tumble) as hit/collision targets | Sim core (`src/sim/world`, `src/sim/dock`) | Render (consumes the same functions) | The pose must be one function shared by sim and render (PITFALLS 11); the buoy tumble formula currently lives in `src/render/bodies/buoy.ts` and must move to sim |
| Laser hit with subentities, ident over statics and debris | Sim core (`src/sim/combat`) | App (names for the HUD message) | Deterministic hit rule; the app only maps spec keys to display names |
| Buoy health, recharge, destruction | Sim core (`World.staticHealth`) | Render/HUD (remove drawn buoy, scanner blip) | Hashed pristine-omit state already exists; presentation reads a derived flag |
| `isHitByOctree`, `collideWithShip`, drift, braking, blast | Sim core (`src/sim/combat`, `src/sim/world`, `src/sim/flight`) | None | Pure maths on entities and flight state; one ledger applies the damage |
| Player drift integration and braking | Sim core (`src/sim/flight/step.ts`) | None | The flight step owns the player's pose |
| Jump blockage by buoys | Sim core (`ship-field.ts`, `countdown.ts`, flight step) | App (refusal message text) | Same predicate as ships and the station |
| Compass fallback for a destroyed beacon | Sim core (flight step reads a read-only field flag) | HUD | Mode lives in `FlightState.compassMode` |
| Hull artifact loading, ident names, message text | App session (`start-session.ts`, `event-router.ts`) | Content loaders | Lazy load and copy are app-owned |
| Persistence | Unchanged | None | Saves never carry world state; no save-schema change |

## Standard Stack

No new runtime or dev dependency is needed [VERIFIED: package.json read this session; `zod` 4.6.7, `three` 0.187.0, `vitest` 5.0.5, `fast-check` 4.10.2, `tsx` 4.23.15, `typescript` 6.0.2].

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript (strict, `exactOptionalPropertyTypes`) | 6.0.2 | all sim and tooling code | project standard |
| zod | 4.6.7 | strict schema for the new hull artifact (bounded tree walk as in `ship-hull.ts`) | existing hull schema is the template |
| Vitest | 5.0.5 | unit, golden, oracle tests | project standard |
| fast-check | 4.10.2 | property tests (octree-against-octree vs a brute-force reference, once-per-contact, pristine-omit) | already used in `tests/sim/combat/octree.test.ts` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tsx | 4.23.15 | run measurement scripts in the `assets` container | the Coriolis measurement and any scratch probe |
| Playwright | 1.64.1 | browser specs (remote machine only) | fixture move D-06, destroyed-buoy render, ident message |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Second artifact for the Coriolis | Raise `MAX_HULL_NODES` and `MAX_HULL_ARTIFACT_BYTES` for the one file | Loosens the bound that protects the ray test from hostile or corrupt chunks (T-13-06/07) for the ten small hulls; a separate schema with its own bounds keeps the strict cap where it is |
| One merged octree for the Coriolis | The subentity branch | Owner already rejected the merged-hull shortcut (2026-11-16) |
| Reuse `FlightState.impulse` for player drift | New `FlightState.drift` field | `impulse` is the dock bounce with a feel-only exponential decay (`src/sim/dock/step.ts:78-121`); Oolite drift brakes linearly by thrust. Two meanings in one field would break both |

**Installation:** none. **Version verification:** not applicable (no package is added). Existing versions read from `package.json`, not from the registry.

## Package Legitimacy Audit

No external package is installed by this phase. Nothing to check and no `gsd-tools query package-legitimacy` call is needed.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Coriolis measurement (DATA-15, the first plan)

Measured in the `assets` container this session with the repository's own `parseDat`, `buildOctree` and `hullRadius` (script under the session scratchpad, mounted at `/scratch`; nothing added to the repository) [VERIFIED: ran `docker compose run --rm -v <scratch>:/scratch assets npx tsx /scratch/measure.ts`]:

| Octree (vendored `.dat`) | Root half-width | Depth | Nodes (all) | Solid leaves | Compact root bytes | Over 16,384-node cap? |
|---|---|---|---|---|---|---|
| `oolite_coriolis.dat` (hull) | 500.5 | 6 | 32,841 | 11,148 | 76,829 | yes |
| `oolite_coriolis_faceplate.dat` | 534.7979736328125 | 6 | 6,601 | 2,220 | 15,421 | no |
| `oolite_coriolis_tris.dat` | 500.5 | 6 | 30,089 | 11,912 | 72,089 | yes |
| `oolite_coriolis_dock.dat` | 250.5 | 5 | 1,737 | 790 | 4,263 | no |
| `oolite_buoy.dat` (hull) | 58.22785949707031 | 5 | 10,945 | 4,181 | 26,070 | no |
| `oolite_buoy_subents.dat` | 24.34779930114746 | 5 | 3,025 | 812 | 6,861 | no |
| `oolite_barrel.dat` | 5.287789821624756 | 4 | 457 | 172 | 1,085 | no |
| `oolite_alloy.dat` | 5 | 4 | 201 | 56 | 457 | no |

Verbatim caps they are measured against [VERIFIED: src/content/schemas/ship-hull.ts:36,39,47]: `export const MAX_HULL_NODES = 16_384;`, `export const MAX_HULLS = 16;`, `export const MAX_HULL_ARTIFACT_BYTES = 200_000;`. The current artifact `src/content/generated/ships-hulls.json` is 89,673 bytes [VERIFIED: `ls -la`].

Reading: the Coriolis set is 71,268 nodes and about 168,600 compact-root bytes, so the Coriolis alone breaks the per-hull node cap twice (hull, tris) and, added to the existing file, takes it to about 293 kB against 200,000. The buoy, barrel and plate alone would fit the existing file (about 124 kB total) but each of the four needs the `subentities` field (the buoy has one subentity), so the schema changes either way. Subentity facts from the compiled catalogue [VERIFIED: `src/content/generated/ships-client.json` extras, read this session]: Coriolis subentities `oolite_coriolis_faceplate` at (0,0,0), `oolite_coriolis_tris` at (0,0,0), `oolite_coriolis_dock` at `[0, 0, 500.2561]` with `is_dock: 'true'`, all with `orientation: [1, 0, 0, 0]`; buoy subentity `oolite_buoy_subentity` at (0,0,0) with `orientation: [1, 0, 0, 0]`. Every subentity orientation is the identity, so a hull record needs only a position per subentity (build failure, not silent acceptance, on a non-identity orientation).

Recommendation (a Key Decision row, owner-visible): ship one new lazily loaded artifact, for example `src/content/generated/ships-static-hulls.json`, holding the Coriolis, the buoy, the barrel and the alloy plate with their subentities, behind a schema variant with its own bounds (a per-octree node bound of 40,000 covers the measured maximum 32,841 with 22 percent margin; a file bound of 300,000 bytes against about 205,000 expected; re-derive both from the first plan's emitted file, not from this estimate). Leave `ships-hulls.json` and its digest golden untouched (ten hulls, `HULL_SHIP_KEYS` unchanged), which keeps the Phase 13 goldens and `tests/content/ships-hulls.test.ts` green. A hull record gains an optional `subentities: [{ key, position: [x, y, z] (Oolite model axes), octree }]`. The new hull's `collisionRadius` is the client record's float32 (779.3702392578125 for the station, 59.13554763793945 for the buoy), already compiled [VERIFIED: layout.ts:71-73].

Size and load cost: parse and walk are iterative in the existing schema (`checkHullTree`); 71k nodes is cheap. The real cost is cold-start bytes: PITFALLS 17 records a traffic-on cold start of 8,855,706 bytes against 9,437,184 (headroom 581,478) at Phase 15 research time [CITED: .planning/research/PITFALLS.md Pitfall 17]; `tests/e2e/budget.spec.ts` carries `FIRST_LOAD_BYTES_CEILING = 9 * MIB`. Today `loadShipHulls()` runs inside the boot `Promise.all` only when `testFlags.traffic` is on (`src/app/session/start-session.ts:420-452` [VERIFIED]). Statics must be hittable in every build, including the traffic-off browser-test bundle, so the static artifact must load independently of the traffic flag; load it with the first-in-flight-frame latch (the Phase 12 pattern, `trafficModelGlb`) rather than in the boot `Promise.all`, and re-measure with `budget.spec.ts` (owner-run on the remote machine).

## Architecture Patterns

### System Architecture Diagram

```
                      content build (assets container)
 third_party/oolite/Models/*.dat ──> buildOctree ──> ships-hulls.json (10 hulls, unchanged)
                                         └────────> ships-static-hulls.json (NEW: coriolis+3 subs, buoy+1 sub, barrel, alloy)
                                                           │ lazy import, schema-validated (strict, bounded)
                                                           ▼
 app session: hullTable(core.hulls) ── merges both artifacts into one HullTable keyed by spec key
                                                           │ options.combat.{hulls, collisions?}
                                                           ▼
 stepSim(tick)
  ├─ createShipField(world, masses, layout)  [read-only: ships + LIVE buoys for mass/blockage]
  ├─ stepFlight: player drift integrate + power-brake; compass fallback; blockage (station, buoys, ships)
  ├─ stepPlayerCombat
  ├─ stepWorld: steering; drift pass for ships and debris (brake then integrate); static recharge
  └─ resolveShots (the one ledger)
        1. candidates = player? + live ships + live cargo + statics{3,4,5 (4,5 only if alive)}
        2. laser: firstShipHit(stage A sphere, stage B hull octree + each subentity octree) ──> HitRecord{kind:laser}
        3. collisions (only if opted in): sort by axis, stage A sphere r1+r2, stage B doOctreesCollide
              ──> collideWithShip(pure) ──> velocity responses applied now (drift), damage queued
                  as HitRecord{kind:scrape}, position nudges applied now
        4. applyLedger: ascending order; player scrape = shields by other's side, no heat;
              buoy: staticHealth -= amount, 0 => destroyed; cargo: energy 1 - amount
        5. killShip per lethal victim (+ debris, + D-03 blast on ships and the player)
        6. drainAiEventsNow, second commitWorld, updateIdentTarget (statics + pods valid targets)
                                                           │ events + world/flight state
                                                           ▼
 render/HUD: hide destroyed buoy (3D + scanner + compass blip), ident frame from layout/static pose
```

### Recommended Project Structure

```
tools/oolite-ingest/convert/
├── ship-hulls.ts          # unchanged ten hulls
└── static-hulls.ts        # NEW: coriolis/buoy/barrel/alloy + subentity offsets, own emitter and path const
src/content/
├── schemas/ship-static-hull.ts   # NEW: strict bounded schema with subentities and its own caps
├── ships-static-hulls.ts         # NEW: lazy loader (import.meta.glob, ?raw), starts with "ships"
src/sim/combat/
├── octree.ts              # add isHitByOctree (+ helpers) next to isHitByLine
├── hit.ts                 # HullData gains subentities; firstShipHit tests each (Pattern 2)
├── collide.ts             # NEW: collideWithShip (pure), broad phase, doOctreesCollide composition
├── ledger.ts              # HitRecord gains kind; statics and cargo targets; scrape path for the player
└── step.ts                # candidates, collision stage, ordering (Pattern 8)
src/sim/world/
├── static-pose.ts         # NEW: stationPose(layout, stationAngle), buoyPose(flightTime) shared with render
├── drift.ts               # NEW: shipDrift pass (brake then integrate), shared by AI and AI-less ships
├── ship-field.ts          # buoys join blocks()
src/sim/flight/            # state.ts (drift field), step.ts (integrate/brake), sanitize.ts, launch.ts, arrival.ts
tests/oracles/combat/      # NEW independent oracle (no `src` imports; see oracle-independence guard)
```

### Pattern 1: A second artifact with `subentities`, bounds per octree

**What:** Extend the hull record with an optional `subentities` array and validate every octree (hull and subentity) with `checkHullTree` against a per-schema node bound; keep the strict, iterative, depth-bounded walk.
**When to use:** the Coriolis and buoy. The existing ten-hull schema stays as is.
**Example:**
```typescript
// Source: pattern of src/content/schemas/ship-hull.ts (read this session); not yet written
const StaticHullSchema = z.strictObject({
  key: z.string().min(1),
  collisionRadius: z.number().positive(),
  octree: OctreeSchema,                       // radius, depth, root (bounded walk)
  subentities: z.array(z.strictObject({
    key: z.string().min(1),
    position: z.tuple([z.number(), z.number(), z.number()]), // Oolite model axes, as authored
    octree: OctreeSchema,
  })).max(4),
});
```

### Pattern 2: The laser subentity rule (Oolite `doesHitLine:hitEntity:`)

**What:** `ShipEntity.m:1323-1357` tests the beam against the entity's own hull octree, then, for every ship-type subentity in list order, against that subentity's octree after moving the beam into the subentity's frame (`absolutePositionForSubentity`, `absoluteIJKForSubentity`, `ShipEntity.m:2008-2025`); the result is the smallest non-zero distance (`hitSub && (hit_distance == 0 || hit_distance > hitSub)`). Stage A (`Universe.m:5611-5619`) uses the entity's `collision_radius`, which for the Coriolis already includes the dock (779.37 = 500.2561 + dock radius 279.11) [VERIFIED: ShipEntity.m:2028-2044 `addSubentityToCollisionRadius`]. All Coriolis and buoy subentities have identity orientation, so each subentity test is the same `toOoliteModelSegment` with the beam start shifted by the authored position (the dock at `+500.2561` along Oolite model Z). Flashers are not ship subentities (`shipSubEntityEnumerator` filters `isShip`, `ShipEntity.m:1219-1222`).

Dock-mouth probe (regression pins only, measured with the repository's own line test, so they are NOT independent evidence) [VERIFIED: ran in `assets`, rays along Oolite -Z from z=+3000, distance from ray start to the centre of the first solid leaf]:

| Beam offset (x, y) | hull | faceplate | tris | dock | Nearest wins |
|---|---|---|---|---|---|
| (0, 0) in the slot | 3,492.7 (far back wall) | miss | miss | 2,742.4 (dock tube back wall, z about 258) | dock |
| (50, 0) beside the slot | 3,492.7 | 2,473.6 (z about 526) | miss | 2,507.6 | faceplate (2,473.6 is the smaller) |
| (100, 0) | 3,492.7 | 2,473.6 | miss | miss | faceplate |
| (0, 100) | 3,492.7 | miss | miss | 2,507.6 | dock |
| (250, 100) | 3,492.7 | 2,507 | miss | miss | faceplate |

So the hull octree is open at the mouth (the beam crosses to the far wall at about 3,493); the dock subentity is what stops a shot through the slot and the faceplate what stops a shot beside it. The slot half-width is about 51.7 m and half-height 120.9 m (`src/content/generated/dock-port.json` corridor `ww` 51.70615, `hh` 120.944). A merged-hull shortcut or a hull-only test would both be wrong at the mouth, which is exactly what the independent fixtures must show.

### Pattern 3: Statics and debris as hit candidates

**What:** Extend the candidate list in `resolveShotHits` (`src/sim/combat/step.ts:402-412`, today ships only) with: the station (id 3, `specKey "coriolis-station"`, position `layout.station.position`, orientation `portQuaternion(layout, player.stationAngle)` from `src/sim/dock/port-frame.ts:32-37`), each live buoy (id 4 witchpoint, id 5 nav; position from layout; orientation from the shared buoy pose), and live entities of kind `cargo` (pod `barrel`, plate `alloy`). Wreckage stays out (`canCollide` is NO, `ShipEntity.m:1858-1868`). `HitRecord.target` already admits any id; `applyLedger` today skips targets that are not ships (`ledger.ts:115-116`) and must branch: id 4/5 into `staticHealth`, id 3 absorb (no state change), `cargo` entities through the normal energy path.
**Rules to carry:**
- Station: the beam stops at its hull and a `shipHit` is emitted, no energy change. Oolite lowers the main station's energy only while `amount < energy` and recharges 100/s (`StationEntity.m:1116-1157`, `shipdata.plist` `energy_recharge_rate = 100`); the effect is unobservable except as hashed churn in `staticHealth.station`, so do not decrement it [ASSUMED, recommended; record it].
- Buoy: `energy -= amount`; at `<= 0` destroyed (`ShipEntity.m:11418-11561`); recharge 2/s while alive (`shipdata.plist:1018`, `energy_recharge_rate = 2`, `max_energy = 250`). Recharge must be guarded by `value > 0`, otherwise a destroyed buoy (stored as 0) would revive. Pulse laser damage is 15 [VERIFIED: constants.ts LASER_STATS pulse `damage: 15`], so a fresh buoy dies on the 17th hit with no recharge.
- Static recharge needs a tick site: `rechargeShips` (`step.ts:314-323`) covers `kind === "ship"` only. Add a static recharge beside it, before this tick's hits apply, and keep the repair uncounted (as the existing note in `sanitizeStaticHealth` says).
- Pods and plates: `DEBRIS_MAX_ENERGY = 1` [VERIFIED: debris.ts:168]; `rechargeShips` does not touch them. A hit or a scrape above energy 1 kills through `killShip` (marks dead, no `shipDestroyed`, no debris, `kill.ts` "Any other kind ... is only marked dead"). Whether a destroyed pod should draw an explosion is an Open Question.
**Pose rule (PITFALLS 11):** the buoy's orientation is the render's `roll(Z, t*0.1) * pitch(X, t*0.15)` of the flight clock (`src/render/bodies/buoy.ts` `update`, BUOY_ROLL_RATE 0.1, BUOY_PITCH_RATE 0.15; Oolite `performBuoyTumble` roll 0.10, pitch 0.15, `ShipEntityAI.m:458-464` [VERIFIED]). Move that formula into `src/sim/world/static-pose.ts` and make the render import it, so the hit pose and the drawn pose cannot diverge. `t` is `FlightState.flightTime`.

### Pattern 4: `collideWithShip`, sequence and numbers

Full sequence, each step with its line in `ShipEntity.m` [VERIFIED: read this session]:

1. `loc` = unit vector self to other (`HPvector_normal_or_zbasis`: +Z when the centres coincide), 11032-11033. `m1 = mass`, `m2 = other.mass`, 11053-11054.
2. `v = vel1b - vel2b` (total velocities: drift plus `forward * flightSpeed`, `ShipEntity.m:11159-11162`), `v2b = dot(v, loc)`, 11072. `v1a = sqrt(v2b^2 * m2 / m1)`, negated when `v2b < 0`, 11074-11076.
3. `v2b < 0`: if `v2b < -1` **return, no damage, no response** (11080-11081). Otherwise `position -= hploc` (a direct 1 m nudge of self), `v = 0` (11083-11084), "the 1 m/s solution".
4. `dam1 = m2 * v2b^2 / 50000000`, `dam2 = m1 * v2b^2 / 50000000` (11089-11090). `vel1a = loc * -v1a`, `vel2a = loc * v2b` (11093-11094). If `|v|^2 <= 0.1`: `vel1a = -loc`, `vel2a = loc` (11096-11099).
5. Apply `adjustVelocity` to other (`vel2a`) then self (`vel1a`) (11103-11109). The station's override ignores it; for any other entity `velocity += xVel` (`ShipEntity.m:11173-11176`).
6. `selfDestroyed = dam1 > energy`, `otherDestroyed = dam2 > other.energy && !otherIsStation` (11111-11112), both read **before** this pair's damage.
7. `dam1 > 0.05`: `takeScrapeDamage(dam1)` on self; if selfDestroyed, `vel2a *= -1` and `other.adjustVelocity(vel2a)` (net zero for other). `dam2 > 0.05`: scrape on other; if otherDestroyed, `vel1a *= -1` and `self.adjustVelocity(vel1a)` (11114-11134).
8. If neither is destroyed: `t = 10 * timeDelta`; `self.position += loc * (t * v1a)`; unless other is the station, `other.position += loc * (t * v2b)` (11138-11146). The comment says "10 ticks"; use `10 * DT` (DT = 1/120, `src/sim/step.ts:8` [VERIFIED]) so the nudge cannot depend on frame rate.
9. `shipCollided` script event and AI message `COLLISION` to both (11152+). Wegolite's `AI_EVENT_NAMES` has no such event (`src/sim/ai/types.ts:55-79`); do not add one in this phase and record it.

Worked values (player 214,737.6875 kg, Krait 93,291.40625, buoy 698,691.1875, pod 993.3700561523438, plate 273.4375; masses from `ships-client.json`, `ships-npc.json`, `ships-debris.json` [VERIFIED]), `self` = player, closing speed `v2b`:

| Other | v2b | dam to player (dam1) | dam to other (dam2) | v1a (player rebound) |
|---|---|---|---|---|
| Krait | 100 | 18.658 | 42.948 | 65.91 |
| Krait | 350 | 228.564 | 526.107 | 230.69 |
| Buoy | 100 | 139.738 | 42.948 | 180.38 |
| Buoy | 350 | 1,711.793 | 526.107 | 631.33 |
| Pod | 100 | 0.199 | 42.948 | 6.80 |
| Plate | 100 | 0.055 | 42.948 | 3.57 |

Derived thresholds: a buoy (energy 250) is destroyed by a ram above 241.27 m/s; a pod (energy 1) is destroyed above 15.26 m/s and takes no scrape damage below 3.41 m/s (0.05 floor); the player's `selfDestroyed` reversal against a buoy occurs above 135.35 m/s (dam1 > 256).

Port notes that are easy to get wrong:
- **The player takes scrape through a different path than a laser.** `PlayerEntity.takeScrapeDamage` (`PlayerEntity.m:5701-5753`) drains the shield on the other's side (`d_forward >= 0` forward, else aft), then `[super takeScrapeDamage:]` does `energy -= amount` with **no cabin heating**, whereas `takeEnergyDamage` (`5599-5700`) heats the cabin (`ship_temperature += amount * SHIP_ENERGY_DAMAGE_TO_HEAT_FACTOR / heatInsulation`). `routeDamage` (`src/sim/combat/shields.ts`) heats, so reusing it unchanged is the "wrong half" for the player. Add a heat-free variant (`scrape`) sharing the shield-facing kernel; the internal-damage loop (`:5746-5752`) is Phase 19.
- **Launching exemption.** `ShipEntity.takeScrapeDamage` returns early when either party is `STATUS_LAUNCHING` (`ShipEntity.m:11641-11649`), but the player's shields are drained before that call and the velocity response still happens, and `PlayerEntity.canCollide` is YES while launching (`PlayerEntity.m:2242-2254`). Recommended simplification: skip any pair involving the player in `launching` mode entirely and record it as a divergence (the launch tunnel is inside the station and no NPC is launched in v2.3) [ASSUMED].
- **Once per contact** comes from the velocity response, not a guard: after the response the pair separates faster than 1 m/s and step 3 returns. Oolite also removes self from the other's collision list (`:11150`), so each contact is processed once with `self` = the entity whose update runs first. Use ascending id with `self` = the lower id (the player, id 100, is always lowest) [ASSUMED: approximates Oolite's creation-order update].
- The hull test `doOctreesCollide(prime, other)` is not symmetric in a grazing case (it picks the "axial" octree by radius), so always call it with `prime` = the lower id.
- **No random draw is needed.** `takeScrapeDamage` rolls `randf() < frag_chance` only to set `being_mined` (`ShipEntity.m:11659-11667`), which only matters for asteroids (`ShipEntity.m:7993`); drop it and say so.
- Position nudge in the closing case moves self by `+loc * t * v1a` (toward the other) and the other by `+loc * t * v2b`; net separation change is `t * (v2b - v1a)`. For a heavier `self` that opens the gap; for a lighter `self` (player against a buoy) it closes it. This is literal Oolite; keep it and pin it with a fixture.

### Pattern 5: Octree against octree

`isHitByOctree` (`Octree.m:473-595`) and `offsetForOctant` (`Octree.m:158-161`) are not ported; `src/sim/combat/octree.ts` exports `isHitByLine`, `randomOctreePoint`, `toOoliteModelSegment` only [VERIFIED: rg of exports]. Port rules read from the C:
- Both frames in Oolite model axes. `relative_position_of_other = resolve(other_pos - prime_pos, prime_ijk)` and `relative_ijk_of_other[i] = resolve(other_ijk[i], prime_ijk)` (`ShipEntity.m:1889-1894`), with ijk = (right, up, forward). In Wegolite axes: right = `rotate(q, +X)`, up = `rotate(q, +Y)`, forward = `rotate(q, -Z)` (the same convention `toOoliteModelSegment` uses).
- Early returns: axial root empty, other absent or empty. Then a **crude prune**: if `otherRadius < axialRadius`, reject when the other's centre plus or minus `otherRadius` leaves the axial cube on any axis (note this uses the other cube's inscribed sphere, so it can reject a true corner overlap; Oolite's result is a subset of exact geometry); else test the axial sphere against the other cube in the other's frame. Then: axial solid and other solid is a hit; axial solid and other not decomposes the other (nearest octant first, order `nearest ^ change_oct[i]` with `change_oct = {0,1,2,4,3,5,6,7}`, `Octree.m:70`); otherwise decompose the axial octree against the same other (`Octree.m:573-595`).
- `doOctreesCollide` order (`ShipEntity.m:1878-1942`): hull against hull; prime subentities against the other's hull; prime hull against the other's subentities; subentities against subentities. `canCollide` is required for each subentity (all four Coriolis/buoy subs are ship subentities in status `STATUS_INACTIVE`, which `canCollide` accepts).
- Float behaviour: Oolite is float32; the existing line test is float64 and records it (RESEARCH A2). Keep float64, document that grazing results can differ, and make fixtures robust to it (cell-centred, not on boundaries).

### Pattern 6: Ident over statics and debris

`firstEntityTargetedByPlayer` (`Universe.m:5649-5710`) takes every ship-class entity, requires `canCollide` and `scanClass != CLASS_NO_DRAW` (`:5691`), and picks the nearest whose collision circle the view axis crosses. Wegolite's `firstEntityTargetedByPlayer` (`src/sim/combat/ident.ts:91-127`) lists live `kind === "ship"` only. Add ids 3, 4, 5 (from layout, respecting destruction) and live `cargo`. `isValidTarget` (`ident.ts:67-78`) must accept static ids and drop a destroyed buoy through the existing `identLost` path; `identTargetSnapshot` (`:222-232`) must read the position and radius from the layout for statics. `identLocked.specKey` stays a spec key; the HUD name lookup is `ctx.core.npcTraffic?.catalogue.find` with the key as fallback (`event-router.ts:406-418`), so it must learn the names of `coriolis-station` ("Coriolis Station"), `buoy` ("Navigation Buoy"), the witchpoint beacon ("Witchpoint Beacon", `shipdata.plist:1111-1113`), `barrel` ("Cargo container", `shipdata.plist:603-640`) and `alloy` ("Metal fragment", `shipdata.plist:173-205`). The client catalogue carries `extras.name` for the station and the buoy; the debris catalogue has no `name` field, so the debris schema (strict) needs one, or a small compiled name table does. Oolite prints `identFromShip` = `displayName` (`ShipEntity.m:6254-6260`).
Both ident keys are Oolite `canCollide` rules, so wrecks (never collide) stay unlockable. The tripwire todo `2026-11-19-player-ident-lock-in-target-targets-self.md` concerns the player id in the candidate list; static ids 3-5 never equal the player.

### Pattern 7: Jump blockage and the compass (folded D-05, D-09)

Blockage: `checkShipsInVicinityForWitchJumpExit` (`ShipEntity.m:12498-12531`) loops **every** ship except self with `k = 0.1`: `k * mass > d2 && d2 < SCANNER_MAX_RANGE2`. Add both live buoys with mass 698,691.1875 (a literal `NAV_BUOY_MASS` in `countdown.ts` pinned equal to `ships-client.json`, as `CORIOLIS_STATION_MASS` is, `countdown.ts:63`); radius `sqrt(0.1 * 698691.1875) = 264.33 m` [VERIFIED: computed]. Extend `createShipField` (it already receives the world and is built before `stepFlight`) with the buoys and their liveness; `WitchspaceBlocker = "station" | "ship"` (`countdown.ts:119`) gains a buoy kind, which touches the event type, the router's refusal text, the probe and any test that enumerates the union.

Arrival (answers the D-09 question). Oolite's `leaveWitchspace` (`PlayerEntity.m:6913-6928`): `d1 = SCANNER_MAX_RANGE * (rand/256 - 0.5)`, `min_d1 = safeWitchspaceExitDistance` = witchpoint buoy `collisionRadius + 750` = 809.14 m (`Universe.m:2843-2851`, `Universe.h:162`), and `if (abs((int)d1) < min_d1) d1 += (d1 > 0 ? min_d1 : -min_d1)`, so the arrival is never closer than 809 m to the witchpoint buoy. Wegolite already implements this (`src/sim/hyperspace/arrival.ts:99-123`, `safety = layout.witchpoint.radius + MIN_DISTANCE_TO_BUOY`). Therefore an immediate re-jump after arrival is **not** refused by the witchpoint buoy (809 m exceeds the 264.33 m blockage radius) and nothing needs matching. Across all 2,048 systems the nav buoy is at least 223,595 m from the witchpoint (minimum at galaxy 1 "Diti") while the arrival offset is at most 12,800 + 809 m, so no arrival can overlap the nav buoy [VERIFIED: ran `deriveSystemLayout` over `src/content/generated/systems/g0..g7.json` in `assets`]. The launch pose is the dock mouth, 10,000 m from the nav buoy. Both are provable by a unit test, as D-06 asks.

Compass (D-05). `validateCompassTarget` (`PlayerEntity.m:4610-4666`): in `COMPASS_MODE_BEACONS` the target is `[self nextBeacon]` (a weak reference); `if (new_target == nil || [new_target status] < STATUS_ACTIVE || == STATUS_IN_HOLD) { setCompassMode(COMPASS_MODE_PLANET); new_target = the_planet; }` (`:4655-4659`). A destroyed buoy is removed from the entity list, which calls `clearBeacon` and unlinks it from the beacon list (`Universe.m:9615-9619`, `3446-3463`), so its weak reference reads nil. Rule to port: **when the compass mode is `witchpoint` and the witchpoint buoy is destroyed, the mode becomes `planet` and the target `planet`, permanently (no return to `auto`)**. When the mode is cycled: Oolite's `setNextCompassMode` (`PlayerEntity.m:4761-4808`) walks only live beacons and ends in `COMPASS_MODE_PLANET` when none remains, so with the witchpoint buoy destroyed the step after `station` skips `witchpoint`. Wegolite's existing wrap is `witchpoint -> auto` (`aegis.ts:66-77`), an already-existing divergence from Oolite's `-> planet`; do not widen it in this phase, just skip `witchpoint` when destroyed and record the pre-existing wrap divergence next to it [ASSUMED mapping]. The mode only exists with the Advanced Space Compass (`flight/step.ts:164-166`). Implementation seam: `stepFlight` already receives the read-only `ShipField`; add a `buoyAlive("witchpoint")` style query so the flight step applies the fallback in the same place as `resolveCompassTarget` (`flight/step.ts:405`), and clear nothing else. Wegolite has no nav-buoy compass mode, so a destroyed nav buoy changes only the scanner and the 3D view.

### Pattern 8: The collision stage, drift and the blast

- **Opt-in (QUAL-11, PITFALLS 4).** The acceptance harness calls `stepSim(..., stepOptions, undefined)` with `options.combat = { mounts, hulls: realHullTable(), npcWeapons }` and no player combat state [VERIFIED: tests/acceptance/detectors.ts:1135-1170]. Its worlds have `MAX_HULL_CROSSINGS = 0` and `MAX_STATION_SPHERE_ENTRIES = 0` [VERIFIED: thresholds.ts:322,346], so a correct hull test would stay silent, but the harness throws on any flyer death, so gate the collision stage on an explicit flag that the harness never sets, for example `CombatOptions.collisions: true` set by the app and by collision tests. Without the flag nothing about the frozen worlds changes (no stage, no drift pass work beyond zero-velocity skips).
- **Order.** After `stepWorld` and before `applyLedger` (`resolveShots`, `step.ts:508-548`): laser records in ascending shooter id (existing), then collision records in ascending `(selfId, otherId)`; the ledger applies every record before lethality is decided (existing A6 rule).
- **Velocity and position effects apply immediately, damage is queued.** Oolite is sequential, so a ship in two contacts sees the first contact's velocity change in the second. Applying velocity responses in pair order while queuing damage keeps Oolite's behaviour for motion and the ledger's behaviour for damage; `selfDestroyed`/`otherDestroyed` read the energy at tick start, not after earlier pairs' damage [ASSUMED divergence; record it].
- **Broad phase.** `n(n-1)/2` is 32,640 pairs at the cap of 256 (`MAX_ENTITIES`, `ids.ts:53`). Collect collidables once per tick into a reusable array (player when launching-free and with a combat state, live ships, live cargo, the buoys), sort by one world axis with the id as tie-break, sweep with the radius sum, then stage B. Oolite's own region code does the same with a z-sorted chain (`Universe.m:6713-7060`, `CollisionRegion.m:226-374`) and tests `dist2 < (r1 + r2)^2` (`CollisionRegion.m` min_dist2). Wreckage never enters (`canCollide`). Pods and plates do (they have hulls). Budget and assert 0.3 ms per tick at 256 entities in a benchmark guard or `docs/PERFORMANCE.md`, as PITFALLS 17 asks.
- **The station is not a collider.** Ship-vs-station stays the dock SAT; NPC-vs-station is not modelled. Oolite's corridor exemption (`CollisionRegion.m` `shipIsInDockingCorridor`) and station immovability (`StationEntity.m:1159-1163`) are then moot. Contact with the hull stays damage-free (DOCK-09). Record that NPCs and pods can pass through the station hull.
- **Buoys are immovable.** `adjustVelocity` and the position nudge apply to a non-station other in Oolite, but a buoy's position comes from `SystemLayout`. Apply the response to the mover only and skip the buoy's side as the C does for the station (`otherIsStation`). Cost, from the compiled buoy `thrust: 100` (braking `5 * 100 = 500 m/s^2`, `ShipEntity.m:5810`): Oolite would carry the buoy about `v^2 / 1000` metres, 10 m at 100 m/s and about 122 m at 350 m/s [VERIFIED: arithmetic on ships-client.json extras]. Also the player is pushed deeper into the buoy by the nudge (about 15 m at 100 m/s) because the buoy's own offset is skipped. Owner confirmation recommended (Open Questions).
- **Drift state.** NPC: `Entity.velocity` exists and is hashed `;vel:` (zero omitted) [VERIFIED: entity.ts:103]; integrate it for ships in a pass that runs after steering: brake then move. `applyThrust`'s brake is `velocity *= max((|v| - 5 * thrust * dt) / |v|, 0)` only when `thrust != 0` (`ShipEntity.m:5808-5823`; the existing port notes it as a no-op, `src/sim/npc/flight.ts:147-151`), and the position moves by `velocity * dt` in `Entity.update` afterwards (`Entity.m:868-882`). Pods and plates have `thrust = 0` (`shipdata.plist` barrel and alloy) so they drift forever unless hit; the existing `stepDebris` already integrates them. An AI-less (inert) ship holds its placement today (`world/step.ts` header note), so it needs the drift pass explicitly or a collision would freeze it with a velocity it never uses. Clamp each component at `MAX_ENTITY_VELOCITY = 1e4` [VERIFIED: limits.ts:126] at the write, as debris does.
- **Player drift.** Add `FlightState.drift: Vec3` (pristine-omit in `serializeFlight`: append a `drift=` line only when non-zero so every existing flight golden is unchanged), and handle it everywhere `impulse` is handled: `initFlightState` and `serializeFlight` (`flight/state.ts:133,192`), `sanitizeFlightState` (`flight/sanitize.ts:81`), `beginLaunch` (`flight/launch.ts:114`), `applyWitchpointArrival` (`hyperspace/arrival.ts:160`), `dockWithComputer` (`dock/computer.ts:59`), `restoreFromSave` and the autosave reset (`persistence/autosave.ts:297`) [VERIFIED by rg]. Per tick in flight (`PlayerEntity.m:3374-3405`): `position += drift * dt`, then `velmag2 = |drift| - dt * thrust * thrust_factor`, with the cleanup term above 2000 m/s (`VELOCITY_CLEANUP_MIN 2000`, `FULL 5000`, `RATE 0.001`), `drift = 0` if `velmag2 < 0`. **Use the raw Cobra `thrust` (32 [VERIFIED: ships-client.json]), not `config.thrustAccel` (= `SHIP_THRUST_FACTOR * thrust` = 160, `flight/config.ts`)**: the player's braking has no 5x factor in the C (`PlayerEntity.m:3388`), only NPCs do. The total velocity used in `collideWithShip` is `drift + forward * speed + impulse`-free (impulse is the dock bounce, unrelated).
- **Blast on ships and the player (D-03).** Extend `blast()` (`debris.ts:607-650`) beyond `cargo`/`wreckage`: for each live ship (excluding the victim, which is dead) and for the player, `dv = amount * range / max(0.1, d^2 - r^2) / mass` along the unit vector from the victim, `amount = 0.125 * hullMass`, `range = 2.5 * victimRadius`, in range when `d^2 < (range + r)^2` (`Universe.m:5862-5867`). Masses for ships come from `DebrisHull.mass` (compiled for every NPC hull) and for the player from the Cobra record; the player push must be applied where the player is in scope (`resolveShots`' kill loop), since `killShip` has no `FlightState`. Statics do not move. I re-derived the owner's number: Krait inside the player's sphere gives `0.125 * 93291.40625 * (2.5 * 50.196590423583984) / 0.1 / 214737.6875 = 68.1 m/s` [VERIFIED: computed], matching D-03.
- **Frame-rate independence.** Nothing reads frame time; `10 * DT` replaces `getTimeDelta`. The 30/60/144 Hz cadence tests drive the same fixed 120 Hz steps, so they pass provided no state is keyed to render frames.

### Suggested plan decomposition (for the planner, not binding)

1. Measure and decide the artifact (record the Key Decision), schema with `subentities`, the new builder, goldens, drift gate, loader, boot wiring independent of traffic, budget re-measure.
2. Subentity-aware `firstShipHit`; statics and cargo as candidates; `HitRecord.kind`; ledger branches; buoy recharge and destruction; independent oracle fixtures for the dock mouth.
3. Ident over statics and pods (names, snapshot), destroyed-buoy consumers (render, scanner, compass fallback, probe), blockage with buoys and the new refusal kind, the D-06 fixture move and the no-overlap test.
4. `isHitByOctree`, `doOctreesCollide`, `collideWithShip` as pure functions plus the oracle.
5. Drift (NPC pass, player field), the opt-in collision stage, player scrape path, kills and debris from collisions.
6. Blast push on ships and the player; QUAL-11 reruns; FIDELITY, Key Decisions rows, CHANGELOG; the remote `verify`/`verify-full` and acceptance run.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Octree line test against subentities | A new ray test | `isHitByLine` + `toOoliteModelSegment` per octree with the start shifted by the subentity position | The existing port already encodes Oolite's visiting order and leaf-centre distance (`octree.ts` header); only the loop over octrees is new |
| Octree-vs-octree decision | An exact cube-cube SAT as the production rule | A literal port of `isHitByOctree` (`Octree.m:473-595`) | Oolite's crude sphere prunes make its answer differ from exact geometry on corners; fidelity means the same heuristic |
| Hull artifact validation | A looser ad-hoc parse | The existing iterative bounded `checkHullTree` with a per-schema node bound | A hostile or corrupt chunk must fail at load, not in the ray test (T-13-06/07) |
| Player shield routing | A second shield kernel | The existing facing test in `routeDamage`, with a heat-free scrape variant | Same `d_forward >= 0` rule (`PlayerEntity.m:5730-5742`); only the heat and the energy call differ |
| Entity removal | A new removal path | `killShip` + the second `commitWorld` | FOUND-19: the tick boundary must hold no dead entity and no queued AI event |
| Blast on debris | A second blast | Extend the existing `blast()` | One momentum rule, one clamp, one draw order |
| Frame-rate handling | `getTimeDelta` equivalents | `DT` constant | Determinism at 30/60/144 Hz |
| Station pose | A time-derived re-computation | `portQuaternion(layout, stationAngle)` (`dock/port-frame.ts:32-37`) | PITFALLS 11: one pose for render, SAT and hits |
| Octree-vs-octree fuzz reference | Reuse of the port | A brute-force cell-pair reference in `tests/oracles/combat` with no `src` import | The oracle must be independent (`tests/guards/oracle-independence.test.ts`) |

**Key insight:** every rule here is a literal port with known asymmetries (the nudge sign, the crude prunes, `self`/`other` roles). "Cleaning up" any of them is the main risk; the independent oracle exists to catch it.

## Runtime State Inventory

Not a rename/refactor/migration phase. Two lifecycle facts matter and are stated explicitly because the planner cannot otherwise distinguish "checked, none" from "not checked":

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None. Saves never carry world state, no save-schema change (D-04). `World.staticHealth` is not persisted | none |
| Live service config | None | none |
| OS-registered state | None | none |
| Secrets/env vars | None | none |
| Build artifacts | New generated file `ships-static-hulls.json` plus `manifest.json` entry; `assets:check` drift gate and a digest golden under `tests/golden/content/` must be created | regenerate with `docker compose run --rm assets`, commit generated output |

World lifecycle: a destroyed buoy returns at full energy on every new world (launch, arrival, Load), by D-04; no code is needed beyond `createWorld` already returning `createStaticHealth()` (`world.ts:187`).

## Common Pitfalls

### Pitfall 1: Porting `collideWithShip` from the wrong half (PITFALLS 12)
**What goes wrong:** damage applied with `routeDamage` (heats the cabin) or from `takeEnergyDamage`, the 0.05 floor dropped, the 1 m/s rule or the `selfDestroyed` reversal omitted, or the nudge "fixed".
**Why it happens:** the two halves of the rule look alike and `routeDamage` exists.
**How to avoid:** port step by step from Pattern 4 with each line cited; add a heat-free player scrape path; pin the worked table above as fixtures computed from the C, not from the port.
**Warning signs:** cabin temperature rising after a ram; a pair damaged on two ticks; any `launching` state with damage.

### Pitfall 2: A velocity vector nothing integrates
**What goes wrong:** an inert NPC or a buoy-rammed ship keeps a `velocity` but never moves, so it re-collides every tick; or the player drift is added to `impulse` and decays with the dock constant.
**How to avoid:** the explicit ship drift pass and the separate `FlightState.drift`; cross-check once-per-contact with a scenario test over many ticks.
**Warning signs:** repeated `shipHit` for one contact; an NPC that spins in place after a ram.

### Pitfall 3: The frozen acceptance worlds change
**What goes wrong:** `tests/acceptance/detectors.ts:541-545` throws `flyer <id> is gone` for any flyer death; hull-sphere contact (radius sum) would register where hulls are 41 m apart.
**How to avoid:** sphere prefilter then octree test, never sphere-only; gate the stage on a flag the harness lacks; rerun `npm run test:acceptance` on the remote machine after every plan touching `src/sim/world/**` or `src/sim/npc/**`.
**Warning signs:** any acceptance number moving with thresholds untouched; `aiFaulted`, `aiDropped` or `repairs` non-zero.

### Pitfall 4: Buoy and station poses diverge between sim and render (PITFALLS 11)
**What goes wrong:** hits land on a differently rotated model than the one drawn; a destroyed buoy still drawn or still blocking.
**How to avoid:** one pose function in `src/sim`, imported by render; a derived `destroyed` read by render, scanner, ident, compass and blockage from the same field.

### Pitfall 5: Hull data loaded lazily changes behaviour by timing
**What goes wrong:** collisions or hits begin the tick the artifact arrives; replays differ.
**How to avoid:** like hits today (D-01), a target with no hull data is skipped, and tests supply the table; keep steering independent of hull data (T-14-47). Do not make the artifact boot-blocking; use the first-in-flight-frame latch and measure.

### Pitfall 6: Fixtures that park the player on a buoy
**What goes wrong:** with collisions on, a pose at the witchpoint (0,0,0) collides at tick 1, and with blocking buoys the jump is refused.
**How to avoid:** `tests/e2e/hyperspace-failure.spec.ts:57-61` (D-06, sanctioned) and `tests/e2e/save-load.spec.ts:662,734` also use `[0,0,0]`; the latter only asserts the restore snapshot, so it is probably unaffected, but audit every spec and unit test that places an in-flight player at the witchpoint or within 132 m (hull radii 59.1 + 72.7) or 264.3 m of either buoy. Add the unit test for arrival and launch poses (the proof is in Pattern 7).
**Warning signs:** a refused jump or a probe `shipHit` in a spec that never fires.

### Pitfall 7: The dock axis runs through the nav buoy
**What goes wrong:** fly-away specs and any scripted launch that flies straight out meet the buoy at 10,000 m on the stationToPlanet axis (`layout.ts:173-176`); at 350 m/s the player takes 1,712 damage and rebounds at 631 m/s.
**How to avoid:** fly-away specs complete at 10,625 m or more, "at least 625 m past the nav buoy" per PROJECT.md (their path passes it); inspect how they traverse it (probably pose seams, not flight) before the collision stage is enabled in the browser build, and consider whether the buoy hazard needs a Key Decisions row for the owner.

### Pitfall 8: Cap and cost with debris collisions
**What goes wrong:** freshly released pods overlap each other and the player (jitter is only +-3 m against a 5.8 m radius), so pod-pod and pod-player contacts begin on the next tick; at 256 entities the naive pair loop is 3.9 M tests per second.
**How to avoid:** the sorted sweep (Pattern 8) and an allocation-free loop; accept that overlapping pods get Oolite's anti-conjoin push (`magnitude2(v) <= 0.1` branch) and do no damage below the 0.05 floor.

### Pitfall 9: Static recharge revives a destroyed buoy
**How to avoid:** guard recharge with `value > 0`; destruction writes exactly 0 (the snapshot and sanitiser already allow 0, `sanitize.ts:772-780`, `snapshot.ts:1021-1034`).

### Pitfall 10: Tripwire guards
**What goes wrong:** a new file naming `killer` or `shipHit` fails `tests/guards/kill-credit-consumers.test.ts` and `ship-hit-consumers.test.ts` (allowlists: `kill.ts`, `ledger.ts`, `step.ts`, `events.ts`; `events.ts` and `ledger.ts`).
**How to avoid:** keep collision code to `HitRecord.source` and route lethality through the existing ledger and `killShip`; a same-tick mutual collision kill reaches the asymmetric credit rule but nothing reads the credit.

## Code Examples

### Subentity-aware beam test (shape only; not yet written)
```typescript
// Source: Universe.m:5611-5629 and ShipEntity.m:1323-1357, read this session
// For each octree of the target (hull first, then each subentity in list order):
//   w = toOoliteModelSegment(target.position, target.orientation, p0, endpoint)
//   shift the Oolite-model z (and x,y) of w0,w1 by the subentity's authored position
//   d = isHitByLine(octree, w0', w1'); keep the smallest d > 0
// accept if 0 < best < nearest, exactly as firstShipHit does today (hit.ts:127-131)
```

### Player drift per tick (shape only)
```typescript
// Source: PlayerEntity.m:3374-3405, read this session
// position += drift * dt
// mag = |drift|; next = mag - dt * thrust * factor   // thrust = Cobra 32, NOT 5 * 32
// if (mag > 2000) next -= mag * min(0.001, (mag - 2000) / 3000 * 0.001)
// drift = next < 0 ? 0 : drift * (next / mag)
```

### Scrape on the player (shape only)
```typescript
// Source: PlayerEntity.m:5701-5753
// shield facing: dot(otherPosition - playerPosition, forward) >= 0 ? forward : aft
// shield absorbs; remainder reduces energy; NO cabin heat; energy floors at 0 (Phase 20 adds death)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Ten-hull artifact, ships only | Two artifacts, statics and debris with subentities | this phase | Station, buoys, pods, plates become targets and colliders |
| Statics are neither laser nor ident targets (Key Decisions row) | Statics are targets | this phase (supersede in the same commit) | Rows to amend: "Statics are neither laser nor ident targets", "The explosion's blast pushes debris only", "Debris is not a target in Phase 16", "Keep the buoys non-blocking in Phase 12"; FIDELITY E-22 and the statics rows (E-48, E-52 per the FIDELITY text) |
| Ships hold velocity zero | Ships carry drift | this phase | `;vel:` hashed segment becomes live for ships |

**Deprecated/outdated within the repo:** the comments in `debris.ts` and `world/step.ts` that say ships are not pushed or integrated until Phase 18 (update them in the same commit as the change).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Total emitted size of the static artifact is about 205 kB (compact-root sum plus key overhead); the caps proposed (40,000 nodes per octree, 300,000 bytes) are derived from that and must be re-derived from the emitted file | Coriolis measurement | Wrong caps fail the build or leave excess slack; the first plan measures it |
| A2 | (SUPERSEDED by PD-02: buoys move when rammed) Buoys stay immovable (layout statics) and the response is applied to the mover only | Pattern 8 | A visible 10 to 122 m buoy displacement that Oolite shows is missing; owner may want it |
| A3 | The launching player is excluded from all pairs instead of Oolite's partial behaviour (velocity response plus shield drain, no energy loss) | Pattern 4 | A ship at the launch mouth during launch would react in Oolite and not here |
| A4 | (SUPERSEDED by plan 18-11's rank rule: the player first, then ascending distance from the player, then id, after Oolite's sortedEntities update order) `self` = lower id, the player first | Pattern 4 | Asymmetric velocity responses differ from Oolite for NPC pairs created out of id order (none exist: ids ascend with creation) |
| A5 | Damage is queued while velocity and position effects apply at once; `selfDestroyed` reads tick-start energy | Pattern 8 | A ship in two contacts in one tick differs slightly from Oolite's sequential energy |
| A6 | `statics.station` is never decremented (Oolite's `amount < energy` guard plus 100/s recharge is unobservable) | Pattern 3 | If a later phase makes station energy observable, the rule must be ported then |
| A7 | Compass: a destroyed witchpoint beacon while in `witchpoint` mode becomes `planet`; cycling skips it and keeps the existing `-> auto` wrap | Pattern 7 | The existing wrap already differs from Oolite; wording of the FIDELITY row |
| A8 | No `shipCollided` AI event is added | Pattern 4 | NPC AIs that Oolite would tell COLLISION do not react (inert NPCs and the test pilots do not use it) |
| A9 | A destroyed pod or plate leaves silently (no explosion event) | Pattern 3, Open Questions | Visible: a shot barrel vanishes without Oolite's explosion |
| A10 | The collision stage is gated by a new `CombatOptions` flag rather than by the presence of the player's combat state | Pattern 8 | Tests and the app must set it; forgetting it silently disables collisions |
| A11 | The pod-and-plate no-block rule of D-08 is accepted despite Oolite's loop having no class filter | Open Questions | In Oolite a pod within 9.97 m or a plate within 5.23 m blocks a completing jump |

## Open Questions

1. **Buoys cannot move; is that acceptable?** (RESOLVED: owner decision PD-02, 2026-11-19: buoys move when rammed, as in Oolite; buoy pose and velocity become per-world state, plans 18-14, 18-17, 18-18)
   - What we know: Oolite moves any non-station other (`ShipEntity.m:11103-11109`, `11143-11146`); the buoy's thrust 100 would stop 100 m/s of drift in about 10 m and 350 m/s in about 122 m.
   - What's unclear: whether D-01's "in full" was meant to include the buoy moving.
   - Recommendation: treat the buoy like the station for motion only, record in FIDELITY, ask the owner in Russian with this recommendation.

2. **Pods and plates and jump blockage (D-08).** (RESOLVED: D-08 stands; plan 18-07 records the FIDELITY row with the 9.97 m and 5.23 m radii, and plan 18-20 measures Oolite's behaviour on the reference container per PD-03)
   - What we know: Oolite's loop has no scan-class filter (`ShipEntity.m:12514-12528`); a pod blocks within `sqrt(0.1 * 993.37) = 9.97 m`, a plate within 5.23 m.
   - What's unclear: whether the owner knew; the effect needs a pod to sit that close at completion.
   - Recommendation: keep D-08, add one FIDELITY row naming the two radii.

3. **Pod destruction presentation.** (RESOLVED: silent removal with a FIDELITY row, plan 18-15; the pod's blast is ported in plan 18-19) A destroyed pod is removed by `killShip` with no event today. Oolite shows an explosion (`explosion_type = ("oolite-builtin-slowcloud","oolite-builtin-fastspark")`, not compiled in Wegolite, only `oolite-default-ship-explosion` exists). Recommendation: silent removal, recorded, unless the planner can reuse the default explosion at pod size cheaply.

4. **The nav buoy on the dock axis.** (RESOLVED: Oolite's behaviour is kept and recorded in the collision Key Decisions row, plan 18-11; traffic-off browser specs load no hull table and cannot collide, and the four traffic-on specs run remotely in plan 18-11) Flying straight out at 350 m/s hits it hard. This is Oolite's behaviour, but the owner should know before the browser build enables collisions; also confirm the fly-away browser specs do not pass through the 132 m contact window.

5. **Real-Oolite verification.** (RESOLVED: owner decision PD-03: all three claims are measured on the reference container in plan 18-20; a mismatch opens a fix and never changes a fixture silently) Three claims can be measured with `tools/oolite-reference/run-remote.sh` (a probe OXP kept outside the repo): the Coriolis beam distances at the mouth, the player-against-buoy rebound and nudge numbers, and the pod blockage radius. The time box and whether to spend it is the planner's and owner's call; the oracle fixtures can be authored from the C alone.

6. **Ident name source for pods, plates and the witchpoint beacon.** (RESOLVED: the five display names are compiled into the static hull artifact, plan 18-01, and read by the HUD, plan 18-06; no debris-schema change) A compiled `name` field in the debris catalogue (schema change) versus a fixed table in the app. Recommendation: add `name` to the debris record at build time (schema strict, golden regenerated once with the hull work).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker + Compose | every task | yes | Docker 29.8.2 | none (project rule) |
| `assets` container (tsx, Node) | measurement, content build, drift gate | yes (ran this session) | image `wegolite-ci` | none |
| Oolite checkout | rule derivation | yes | `/home/opencode/git/oolite` | none |
| Vendored models for all eight hulls | DATA-15 | yes: `oolite_coriolis`, `_faceplate`, `_tris`, `_dock`, `oolite_buoy`, `_buoy_subents`, `oolite_barrel`, `oolite_alloy` `.dat` under `third_party/oolite/Models/` [VERIFIED: ls] | pin in `third_party/oolite/pin.json` | none; no new vendoring, `CHECKSUMS.sha256` unchanged |
| Remote test machine (`opencode@192.168.178.51`) | `verify`, `verify-full`, browser specs, `npm run test:acceptance` | not probed (owner-run) | — | owner runs it; record results in SUMMARY |
| Real Oolite reference container | optional measurements (Open Question 5) | not probed | 1.93.1-255 AppImage | derive fixtures from the C |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** the real-Oolite measurement (fixtures from the C instead).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.5 (+ fast-check 4.10.2), Playwright 1.64.1 for browser specs |
| Config file | `vitest.config.ts`, `vitest.acceptance.config.ts`, `playwright.config.ts` |
| Quick run command | `docker compose run --rm test npx vitest run <file>` |
| Full suite command | `docker compose run --rm test` (unit), `docker compose run --rm verify` (fast gate, remote), `docker compose run --rm verify-full` (release, remote) |
| Content drift | `docker compose run --rm assets npm run assets:check` |
| Acceptance | `npm run test:acceptance` on the remote machine, by hand |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-15 | Static artifact parses under the strict bounded schema, holds exactly the four hull keys with the authored subentity positions (dock `[0, 0, 500.2561]`), radii equal `ships-client.json`, sizes under the new gates, digest golden, drift gate | unit + golden + drift | `docker compose run --rm test npx vitest run tests/content/ships-static-hulls.test.ts` ; `docker compose run --rm assets npm run assets:check` | no, Wave 0 |
| DATA-15 | Measurement recorded: node counts per octree reproduced by a test that rebuilds the octrees | unit | same file | no, Wave 0 |
| DATA-15 | Loader never in the boot path; budget unchanged within ceiling | static guard + browser | `tests/content/ships-static-hulls.test.ts` (boot-path scan as in `ships-hulls.test.ts`); `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/budget.spec.ts"` (remote) | partial |
| CBT-17 | Subentity rule: beam through the slot, beside the slot, through the hull only, dock vs faceplate nearest-wins, independent of the port | oracle + unit | `docker compose run --rm test npx vitest run tests/sim/combat/hit.test.ts tests/oracles/combat` | extend `hit.test.ts`; oracle new |
| CBT-17 | Station absorbs (shipHit, no state change, never destroyed); buoy 250 energy, dies on the 17th pulse hit; recharge 2/s; destroyed stays 0; hash pristine-omit; sanitiser keeps 0 | unit | `... vitest run tests/sim/combat/ledger.test.ts tests/sim/world/sanitize.test.ts tests/sim/world/hash.test.ts` | extend |
| CBT-17 | A shot at a ship behind the station hits the station and stops there | unit scenario | `... vitest run tests/sim/combat/step.test.ts` | extend |
| CBT-17 | Ident locks station, buoys, pods, plates; not wrecks; lock ends on buoy destruction with `identLost`; names | unit + app | `... vitest run tests/sim/combat/ident.test.ts tests/app/session-order.test.ts tests/app/session/probe-publisher.test.ts` (the router's message text has no dedicated file today: add `tests/app/session/event-router-ident.test.ts`) | extend |
| CBT-17 | Destroyed buoy: not drawn, not on the scanner, not blocking, compass falls back to `planet`; witchpoint skipped in the cycle | unit (hud-model, flight step) + browser | `... vitest run tests/sim/aegis.test.ts tests/sim/hyperspace-blockage.test.ts tests/ui/hud-model.test.ts` ; `playwright test tests/e2e/hud.spec.ts` (remote) | extend |
| CBT-17 (D-09) | Buoys block at 264.3 m minus/plus 1 m; arrival never within 809 m of the witchpoint buoy; no arrival or launch overlaps either buoy over all 2,048 layouts | unit | `... vitest run tests/sim/hyperspace-blockage.test.ts tests/sim/hyperspace-arrival.test.ts` | extend; new layout sweep |
| D-06 | Fixture moved off the buoy and outside 264.3 m; the spec still proves the failure surface | browser (seams) | `docker compose run --rm e2e sh -lc "npx playwright test --config=playwright.seams.config.ts"` (remote) | edit existing spec |
| CBT-18 | `isHitByOctree` against an independent oracle: hand-authored tiny octrees, offsets, rotations, prune corners; fuzz against a brute-force cell reference | oracle + property | `docker compose run --rm test npx vitest run tests/oracles/combat tests/sim/combat/octree.test.ts` | new |
| CBT-18 | `collideWithShip` worked table above (damage, `v1a`, 0.05 floor, `v2b < -1` return, the 1 m/s branch, `magnitude2(v) <= 0.1`, both reversals, nudge signs) from the C | unit | `... vitest run tests/sim/combat/collide.test.ts` | new |
| CBT-18 | Once per contact over many ticks; separating pair ignored; launching player excluded; station contact damage-free; unknown mass is a no-op | scenario | same | new |
| CBT-18 | Player: scrape through shields by the other's side, no heat, energy floors at 0, drift braking by raw thrust 32, cleanup above 2000 m/s | unit | `... vitest run tests/sim/combat/shields.test.ts tests/sim/flight-*.test.ts` | extend |
| CBT-18 | A collision kill releases debris through the one kill path; blast push on ships and the player equals the 68.1 m/s example | unit | `... vitest run tests/sim/world/debris.test.ts tests/sim/world/kill.test.ts` | extend |
| Crit. 5 | Worlds that never fire, ident or collide hash as before; collision scenario equal at 30, 60 and 144 Hz | cadence + pins | `... vitest run tests/sim/world/world-cadence.test.ts tests/sim/world/flight-hash-pins.test.ts tests/sim/world/debris-cadence.test.ts` | extend; new collision cadence case |
| QUAL-11 | 21 of 21 acceptance after every plan touching `src/sim/world/**`, `src/sim/npc/**` | acceptance | `npm run test:acceptance` on the remote machine | exists |

### Sampling Rate
- **Per task commit:** the targeted `vitest run <file>` for the touched module, `docker compose run --rm typecheck`, `lint`.
- **Per wave merge:** `docker compose run --rm test` plus `assets:check`.
- **Phase gate:** `docker compose run --rm verify` (browser-facing code is touched), `verify-full` (render and persistence-adjacent code), the acceptance rerun, all owner-run on the remote machine, before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/oracles/combat/` independent oracle: Oolite C quoted per fixture (file:line), no `src` import, follows `tests/guards/oracle-independence.test.ts`.
- [ ] `tests/content/ships-static-hulls.test.ts` and `tests/golden/content/ships-static-hulls.json`.
- [ ] `tests/sim/combat/collide.test.ts`.
- [ ] Layout sweep test over `src/content/generated/systems/g0..g7.json` for arrival, launch and buoy clearance.
- [ ] A benchmark guard or `docs/PERFORMANCE.md` entry for the pair loop at 256 entities.
- [ ] Update the pinned member lists (`tests/sim/world/view.test.ts`, `tests/sim/world/ship-field.test.ts`) if `ShipField`, `WorldView` or `BodyView` gain members.
- Framework install: none.

## Security Domain

`security_enforcement` is enabled in `.planning/config.json`, ASVS level 1 [VERIFIED: config.json read this session].

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | not applicable (no accounts) |
| V3 Session Management | no | not applicable |
| V4 Access Control | no | not applicable |
| V5 Input Validation | yes | zod strict schema with an iterative, depth- and node-bounded tree walk for the new artifact (`checkHullTree` pattern); sanitise every new hashed field (`drift`, ship `velocity`) so no non-finite value reaches a hash |
| V6 Cryptography | no | not applicable (hashing is FNV-1a for determinism, not security) |
| V12 Files and Resources | yes | the artifact is loaded as `?raw` and parsed as untrusted input; bound size and nesting |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Hostile or corrupted hull chunk (deep nesting, huge tree) exhausting stack or CPU | Denial of service | iterative walk, per-schema node and depth bounds, `MAX_OCTREE_DEPTH` check in the runtime walk (existing), artifact size gate |
| NaN or Infinity from a degenerate collision (coincident centres, zero mass, overflow at torus speed) reaching the world hash | Tampering | `normal_or_zbasis` for coincident centres, a no-op on missing or non-positive mass, clamp velocity at `MAX_ENTITY_VELOCITY`, existing sanitise pass before commit |
| Quadratic pair cost at the entity cap | Denial of service | sorted sweep, kind filter, cap 256 (`MAX_ENTITIES`) |
| Static ids leaking out of `src/sim` | Information disclosure | `tests/guards/entity-id-scope.test.ts` stays green; `identLocked` carries spec keys, never ids |

## Sources

### Primary (HIGH confidence)
- Oolite checkout read directly (all in `/home/opencode/git/oolite/src/Core`): `Entities/ShipEntity.m` 1219-1222, 1314-1357, 1858-1942, 1944-1992, 2008-2044, 5808-5823, 6254-6260, 7680-7711, 8108-8135, 10991-11152, 11173-11181, 11418-11561, 11641-11676, 12498-12531; `Entities/PlayerEntity.m` 2242-2254, 3035-3060, 3346-3412, 4610-4666, 4761-4808, 5599-5753, 6913-6928; `Entities/StationEntity.m` 1099-1170; `Entities/Entity.m` 868-882; `Entities/ShipEntityAI.m` 458-464; `Universe.m` 2843-2851, 5549-5640, 5649-5710, 5862-5867, 6713-7060, 9595-9640, 3446-3463; `CollisionRegion.m` 226-374; `Octree.m` 70, 158-161, 336-471, 473-640; `Resources/Config/shipdata.plist` (Coriolis 1690-1830, buoy 1011-1125, barrel 603-640, alloy 173-205, subentities 4706-4770, 4954-4975); `Resources/Scripts/oolite-populator.js` 100-145.
- Repository files read this session: `src/sim/combat/{hit,step,ledger,ident,octree,shields}.ts`, `src/sim/world/{entity,layout,ids,kill,ship-field,debris,contacts,step,aegis,world,sanitize}.ts`, `src/sim/{sim,time}.ts`, `src/sim/flight/{state,step}.ts`, `src/sim/hyperspace/{countdown,arrival}.ts`, `src/sim/dock/port-frame.ts`, `src/content/schemas/ship-hull.ts`, `src/content/ships-hulls.ts`, `tools/oolite-ingest/convert/{ship-hulls,octree,ship-mass,ship-radius}.ts`, `src/app/session/{start-session,event-router}.ts`, `tests/acceptance/{detectors,thresholds}.ts`, `tests/guards/*`, `tests/e2e/{hyperspace-failure,save-load,budget}.spec.ts`.
- Measurements run in the `assets` container this session (scratch scripts outside the repository): Coriolis/buoy/barrel/alloy octree sizes, dock-mouth probe, nav-buoy distance over 2,048 layouts, collision arithmetic.
- Planning documents: `18-CONTEXT.md`, `REQUIREMENTS.md`, `ROADMAP.md` Phase 18, `STATE.md`, `PROJECT.md` Key Decisions rows, `research/PITFALLS.md` (4, 9, 11, 12, 17), `research/ARCHITECTURE.md` (2, 4, 6), `research/STACK.md`.

### Secondary (MEDIUM confidence)
- Compiled catalogues `ships-client.json`, `ships-npc.json`, `ships-debris.json`, `dock-port.json` (generated from the vendored pin).

### Tertiary (LOW confidence)
- None used as authority. No web or documentation-service lookups were needed: every rule comes from the pinned Oolite source and the repository.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, no new dependency.
- Architecture: MEDIUM-HIGH, the rule derivations are read from the C; the integration seams (flag, pose function, field flags) are recommendations.
- Pitfalls: HIGH, each traced to a file and line in this session.
- Coriolis measurement: HIGH for node counts and compact bytes (run this session); MEDIUM for the emitted file size and the proposed caps (estimate until the first plan emits the file).

**Research date:** 2026-11-19
**Valid until:** the Oolite pin and the repository's Phase 17 state change (about 30 days or the next change to `src/sim/combat/**`, `src/sim/world/**` or the hull schema).
