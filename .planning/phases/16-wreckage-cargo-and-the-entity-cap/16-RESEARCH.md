# Phase 16: Wreckage, Cargo and the Entity Cap - Research

**Researched:** 2026-11-16
**Domain:** Deterministic debris in a fixed-step TypeScript simulation (`src/sim/`), Oolite's explosion and cargo rules (`ShipEntity.m`, `Universe.m`), the content pipeline (`tools/oolite-ingest`, `scripts/vendor-oolite.sh`), instanced Three.js layers inside the 50-call budget
**Confidence:** HIGH for the Oolite rules and the in-tree integration points (every cited block was read this session; the four Oolite files this phase cites are byte-identical between the pinned commit 7437f22 and the checkout); MEDIUM for the render design and the wreckage lifetime (derived by arithmetic from the C, never measured in a running Oolite); LOW for the visual look of the effects.

<user_constraints>
## User Constraints

**No `16-CONTEXT.md` exists for this phase** (the owner chose to plan without a discuss step). The binding inputs are the ROADMAP Phase 16 text, the "Owner decisions in force" table of the ROADMAP, the Key Decisions rows of PROJECT.md written by Phase 15, and the locked decisions of `15-CONTEXT.md` that name Phase 16. They are copied here verbatim so the planner can honour them.

### Locked Decisions

From ROADMAP.md, "Owner decisions in force" (taken 2026-11-16):
- "The entity cap stays 256, with the thresholds 243 and 128 (Oolite's 0.95 and 0.50 scaled to it)" (Phase 16)
- "Debris models are vendored from the local Oolite checkout" (Phase 16)
- "One snapshot v4 bump with pristine-omit hashing" (Phase 15; so Phase 16 adds no hashed field and no bump)
- "Contact with the station hull stays damage-free" (Phase 18, not this phase)

From ROADMAP.md, Phase 16 success criteria 1 to 4 and scope note (verbatim in substance, see the file): the explosion leaves alloy plates, cargo pods and wreckage by Oolite's cargo rule (alloy count from the ship's mass, up to three wrecks, the pod chance with its 15-pod limit, the blast pushing neighbours), each piece on its own path, same seed and same kill give the same debris at any frame rate; the cap holds, debris is shed above 243 and 128, a kill resolves when the world refuses a spawn, Oolite's frame-time term is dropped and recorded; explosion, debris, pods and flashes are drawn in a fixed number of draw calls (instanced layers within the 50-call budget), live only in the render layer and never change the world hash; the debris models and textures are vendored through `scripts/vendor-oolite.sh` with `CHECKSUMS.sha256`, `ASSETS.md` and `NOTICE` rows, load lazily after the first frame and keep the cold start under 9,437,184 bytes. Scope note: "no scooping exists in this milestone (CBT-11 is unscheduled). Pods and plates drift, can be shot, and are rammed in Phase 18; nothing picks them up. A pod carries a count, not a new commodity field (research PITFALLS 14)."

From `15-CONTEXT.md` (decisions that bind Phase 16):
- **D-01:** "Debris (cargo, wreckage) moves by a velocity vector held on the entity, independent of its orientation, as in Oolite (drift is separate from tumble). The vector is a new hashed field, pristine-omit ... one-way."
- **D-02:** "Wreckage and pod lifetime is held in the existing `Entity.energy` (it decreases per tick; at zero the entity leaves through the same kill path), as in Oolite. No separate lifetime field."
- **D-03:** "Tumble stays a render-side cosmetic derived from entity id and flight time unless a later phase needs it in the sim; the orientation field is free for it." (See Pitfall 8: an id may not leave `src/sim`, so the render derives tumble from the contact's orientation instead.)
- **D-06:** "Cargo on an NPC is a capsule count only (one number, chosen at spawn from `likely_cargo`/`max_cargo`). The commodity of each capsule is drawn at the moment of the explosion from the ship's own `combat` stream (Phase 16)." (Open Question 1: nothing can store the commodity.)
- **D-15:** "New code is total (outside AI fault containment): no function may throw on any world state."
- **D-17:** "No contact-guard field is added for Phase 18 collision rebounds."

### Claude's Discretion

Everything the ROADMAP lists under "Decisions to settle": the wreckage lifetime formula; what a pod holds; the debris spawn order and the dropped frame-time term (both recorded in Key Decisions and FIDELITY.md). Also the plan split, the file and identifier names proposed below, and the render design.

### Deferred Ideas (OUT OF SCOPE)

Scooping and jettisoning (CBT-11); hitting and ramming pods and plates (Phase 18, DATA-15: their hulls); NPC fire (Phase 17); station and buoy hits (Phase 18); equipment damage (Phase 19); the player's own death and its debris (Phase 20); audio (AUD-*); sub-wreckage and the other Oolite details cut below; the escort release (see Carry-over, it is already recorded for Phase 17).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-16 | Debris models and textures are vendored from the local Oolite checkout through `scripts/vendor-oolite.sh` with `CHECKSUMS.sha256`, `ASSETS.md` and `NOTICE` rows | "Content and vendoring" section: exact file list with sizes, the vendor-script gap (it fetches over the network and the container has no `git`), converter changes, drift gate |
| WORLD-17 | Explosions, debris, pods and flashes are drawn within the draw-call budget and do not affect the world hash | "Render" section: instanced layers, call estimate, tumble without an id, hash-independence proof design |
| CBT-08 (staged, destruction clauses only) | A ship at zero energy explodes into wreckage, alloy plates and cargo pods by Oolite's cargo rule under an entity cap of 256 with thresholds 243 and 128 | "The Oolite explosion rule, ported" section; the requirement completes in Phase 19 and is not checked off here |
| QUAL-11 (standing gate) | World hash equal at 30, 60 and 144 Hz; frozen 20-seed acceptance stays 21 of 21 after every plan touching `src/sim/world/**` or `src/content/generated/ships-npc.json` | "Validation Architecture": which plans trigger the by-hand run |
</phase_requirements>

## Summary

Phase 15 left everything the sim needs in place: `Entity.velocity`, `Entity.cargo` and the per-kind lifetime-in-`energy` rule are hashed fields of snapshot v4, `killShip` is the one idempotent removal, and `ENTITY_KINDS` already contains `cargo` and `wreckage`. Phase 16 is therefore three pieces of work and no format change: (1) a pure, total `releaseDebris` called from `killShip` that ports Oolite's `becomeExplosion` debris block with every random draw taken from the dying ship's own `combat` stream, plus a small debris pass in `stepWorld` that drifts debris and burns wreckage down to zero; (2) a content step that vendors the barrel, alloy and five wreck models and the explosion particle textures, compiles a debris catalogue, the hull bounding boxes and `explosions.json`, and keeps all of it lazy; (3) a render step with two instanced layers (debris models, explosion sprites) fed by id-free contacts and by `shipDestroyed`, which the router must start routing.

Four findings change how the plans should be cut. **First**, a destroyed NPC ship leaves very little: for the nine hulls `n_alloys` is 1.17 to 1.99 (`sqrt(sqrt(mass / 6000))`), so a kill yields at most 3 wrecks, at most 1 plate and at most 15 pods (a pod needs a capsule: `max_cargo` is 0 for the sidewinder and viper and 2 to 30 for the other seven hulls [VERIFIED: `ships-npc.json`], and Phase 15's populator gives a count only to traders, pirates and the shuttle; a `?test=1` hook ship carries 0). The debris volume is small; the cap matters only in a long fight because pods and plates never expire (`dumbAI.plist` only pauses its AI for 3600 s, nothing removes them). **Second**, Oolite's wreckage lifetime is not a timer: a wreck is created at 1000 degrees with a cooling insulation of 1e7 and `energy = lifetime / 2`, and `takeHeatDamage` drains `dt * temperature` per frame. Working the C through gives a drain of about 1000 energy per second falling by 10 per second, so a wreck lasts `(1000 - sqrt(1e6 - 20 E)) / 10` seconds, about `E / 1000`: 0.05 to 0.68 s (7 to 82 ticks at 120 Hz) for `E` of 50 to 675. That matches the roadmap's "about E/1000 s" and is exact for the C as written; it still has never been seen in a running game, so it stays LOW for the "does it look right" question. **Third**, three pieces of the roadmap text need a decision the code cannot make for the planner: `D-06` wants a commodity drawn per pod but no hashed field can hold it (Open Question 1); "the blast pushing neighbours" gives debris kicks of 1 to 20 m/s typically but up to 6,400 m/s for a piece close to the centre (alloy plates up to 23,500 m/s, above the sanitiser bound `MAX_ENTITY_VELOCITY` of 1e4), while ships and the player get under 0.03 m/s and can be cut; and `scripts/vendor-oolite.sh` fetches over HTTP from GitHub while the owner decision and AGENTS.md say to use the local checkout (and the container has no `git`). **Fourth**, the existing test pilot scans with no kind filter, so after the first kill it can chase a pod; the scan must exclude debris (Oolite excludes `CLASS_CARGO` from its ship scans).

**Primary recommendation:** Add `src/sim/world/debris.ts` (the pure Oolite port: constants with source lines, `releaseDebris`, `stepDebris`) and call it from `killShip` (optional `DebrisContext`, so Phase 15 tests stay valid), supply the compiled debris and bounding-box facts through `CombatOptions.debris`, route `shipDestroyed` to the existing `dockFeedback` subscriber, and draw debris with the NPC layer's instancing pattern (one call per model and primitive, models loaded per key by the existing lazy loader) plus a pooled additive sprite layer for the explosion cloud and flash. Spawn each piece only while the live count stays at or below the threshold (per piece, not per kill), and draw every random value before the spawn is attempted.

## Project Constraints (from AGENTS.md)

No `./CLAUDE.md` exists in the repository (the user's global files hold only the advisor and Context7 rules); the project instructions are `AGENTS.md`, read this session. Directives the plans must honour:
- **Docker only.** Tests and builds run in containers; a green host run is not evidence. Commands: `docker compose run --rm test`, `... test npx vitest run <file>`, `... typecheck`, `... lint`, `... assets npm run assets:check`, `... verify`, `... e2e sh -lc "npm run build:e2e && npx playwright test <spec>"`. Scratch reproductions live under `/tmp` and are mounted with `-v /tmp/<dir>:/scratch`, never added to the repo.
- **Gate by change type:** pure `src/sim/` plans need `test`, `lint`, `typecheck`; `src/app/`, `src/render/`, `src/input/`, `src/ui/` and `index.html` need `verify`; render, input, persistence or network-guard changes (this phase has render) end with `verify-full`, run on the remote test machine only when the owner confirms.
- **QUAL-11 standing gate:** by-hand `npm run test:acceptance` (21 of 21) after any change under `src/sim/npc/**`, `src/sim/world/**` or to `ships-npc.json`, result recorded in the plan SUMMARY. Thresholds and detectors are frozen (owner trailer `Detector-change-approved-by-owner`).
- **Sim purity:** `src/sim/` imports no Three.js and no DOM, is deterministic and fixed-step, never calls `Math.random`, `Date.now` or `performance.now`; ids never leave `src/sim` (`tests/guards/entity-id-scope.test.ts`).
- **Content is compiled, never hand-edited.** Bounds live in `src/sim/world/limits.ts` only. Licensing: every new asset needs `ASSETS.md` and `NOTICE` provenance; Oolite-derived art is CC BY-NC-SA 3.0.
- **Oolite reference:** read behaviour from `/home/opencode/git/oolite`, consume data from `third_party/oolite/` and keep `CHECKSUMS.sha256` honest. Do not fetch Oolite files over the network.
- **Docs in English;** Key Decisions rows in PROJECT.md for every significant decision; user-visible change under `## [Unreleased]` in `CHANGELOG.md` in the same commit; FIDELITY.md rows each quote an excerpt of at most 20 lines (`tests/contract/fidelity.test.ts`).
- Project skills exist under `.agents/skills/` (`three-webgl-game`, `threejs-shaders`, `playwright-best-practices`, `principle-*`); the executor may load `three-webgl-game` and `threejs-shaders` for the render plans.
- No dependency change is needed, so no `docker compose down --volumes` and no image rebuild.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Debris release (counts, positions, velocities, lifetimes, draw order) | Simulation (`src/sim/world/debris.ts`, called from `kill.ts`) | none | Hashed state, deterministic, uses only the dying ship's own stream |
| Drift and wreckage burn-down | Simulation (`stepWorld`, new pass) | none | `Entity.velocity` and `Entity.energy` are hashed; expiry goes through `killShip` |
| Entity cap thresholds (243, 128) | Simulation (`debris.ts`, with `MAX_ENTITIES`) | none | Decided from the live count, a function of world state only |
| Per-hull inputs (mass, `fragmentChance`, bounding box) and per-model inputs (mass, radius) | Content build (`tools/oolite-ingest`) | App (`traffic.ts`, `step-options.ts`) maps them to a sim type | Sim never imports content; the app builds the table like `npcWeapons` |
| Debris models and textures | Content build + vendoring script | Render (lazy load per key) | Provenance and drift gate; never in the cold start |
| Explosion parameters (`explosions.json`) | Content build | Render | Presentation only; the sim never reads it |
| Explosion cloud and flash | Render (pooled sprite layer) | App router (`shipDestroyed` to the layer) | Not world entities; they do not count against the cap and never touch the hash |
| Debris drawing (instanced models) | Render (instanced layer) | Simulation supplies id-free contacts | Same pattern as `createNpcLayer` |
| Tumble | Render | none | Derived from the contact's orientation and flight time (no id may leave the sim) |
| Not-a-target rules (scan, ident, lasers, mass lock, jump blockage) | Simulation (kind filters, scan classes) | none | Debris must stay out of every ship-only candidate list |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 6.0.2 | Sim, app, render | [VERIFIED: package.json devDependencies `"typescript": "6.0.2"`] |
| three | 0.187.0 | `InstancedMesh`, sprite layers | [VERIFIED: package.json dependencies `"three": "0.187.0"`] |
| zod | 4.6.7 | Strict schemas for the two new generated catalogues | [VERIFIED: package.json `"zod": "4.6.7"`] |
| vitest + fast-check | 5.0.5 + 4.10.2 | Scenarios and the property tests | [VERIFIED: package.json] |
| `@gltf-transform/core` | 4.5.1 | Already used by the GLB emitter | [VERIFIED: package.json] |
| `cwebp` (apt `webp`) | image-pinned | Texture re-encode in the content build | [VERIFIED: Dockerfile lines 35-37 install `webp` into the `ci` image] |

### Supporting
None. No new package, no image change.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `Points` with a per-vertex size shader for the explosion | `InstancedMesh` of a unit quad, camera-facing matrices written on the CPU, `instanceColor` carrying brightness times alpha | Oolite blends additively (`glBlendFunc(GL_SRC_ALPHA, GL_ONE)`, `OOParticleSystem.m:148`), so alpha folds into rgb and no custom shader is needed; `Points` needs a shader for per-particle size |
| A new `Entity` field for the pod commodity | None (Open Question 1) | Another snapshot bump; D-06's draw has no consumer until scooping exists |

**Installation:** none.

## Package Legitimacy Audit

No external package is installed or changed in this phase, so `gsd-tools query package-legitimacy check` was not run.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | - | - | - | - | - | No install |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## The Oolite explosion rule, ported

All line numbers are `src/Core/...` of the pinned commit 7437f22. [VERIFIED: `git diff --stat 7437f22 HEAD` over `ShipEntity.m`, `Universe.m`, `shipdata.plist` and `explosions.plist` in `/home/opencode/git/oolite` printed nothing, so the checkout reads identically; the pinned bytes of the four debris assets I hashed equal the working tree.]

### Order of events in `becomeExplosion` (`Entities/ShipEntity.m:7891-8143`)

1. Visual effects (render side here): the default ship explosion cloud plus the flash when `explosionType` is nil; any named list otherwise. All nine compiled records have `explosionType` null [VERIFIED: node read of `src/content/generated/ships-npc.json` this session], so the default applies to every hull.
2. `releaseCargoPodsDebris` (`7814-7879`): pods.
3. Wreckage (`8042-8069`), then `n_alloys = randf() * n_alloys` (`8068`).
4. Alloy plates (`8083-8111`).
5. Subentities explode (`8114-8120`): none of the nine hulls has a solid subentity (`ship-radius.ts` header), cut.
6. Momentum: `dealMomentumWithinDesiredRange:0.125f * mass` with `desired_range = collision_radius * 2.5f` (`8123-8126`).

### Pods (`ShipEntity.m:7814-7879`)

```
unsigned cargo_chance = 70;                       // 7823
unsigned limit = 15;                              // 7826
for (i = 0; i < n_jetsam; i++) {                  // 7830
    if (Ranrot() % 100 < cargo_chance)            // 7831
        if (cargo_chance > 10) { ... cargo_chance -= 30; }   // 7834-7840, NPC: 30, player: 20
        limit--;                                  // 7841
        ... position, velocity, orientation ...
    if (limit <= 0) break;                        // 7875
}
```
- One draw per cargo item decides survival; the chance runs 70, 40, 10, 10, ... so after two survivors it stays 10 %. At most 15 survivors.
- Position: `xposition + OORandomPositionInBoundingBox(boundingBox)` then `+ (ranrot_rand() % 7) - 3` per axis (`7847-7855`). The offset is **not rotated** by the ship's orientation (Oolite adds the local box offset to the world position). `OORandomPositionInBoundingBox` is `bb.min + randf() * (bb.max - bb.min)` per axis (`OOVector.m:107-113`).
- Velocity: `0.1 * ((ranrot_rand() % speed_low) - speed_low / 2)` per axis with `speed_low = 200`, plus `[self velocity]` (`7856-7859`).
- `[self velocity]` is the **drift** vector only. Flight speed is a separate `thrustVector` (`ShipEntity.m:11158-11170`, `totalVelocity` is the sum), so a ship dying at 300 m/s does not hand its flight speed to its debris. Port with `Entity.velocity` (drift) only; `Entity.speed` is not inherited.
- A random orientation (`quaternion_set_random`); Wegolite already has the same 4-draw port, `randomQuaternion(rng)` [VERIFIED: `src/sim/world/placement.ts:255` `export function randomQuaternion(rng: RngState): Quat {`].
- Each real pod is a `cargopod` ship (`oolite_template_barrel`, `oolite_barrel.dat`, `max_energy = 1`, `scan_class = "CLASS_CARGO"`, `dumbAI.plist`) [VERIFIED: `Resources/Config/shipdata.plist:603-634`]. `reifyCargoPod` builds the real pod from a template and draws a commodity, an amount and a 50 % role roll (`Universe.m:3863-3878`); see Open Question 1.

### Wreckage (`ShipEntity.m:8042-8069`, `Universe.m:5497-5526`)

```
if ((n_alloys && canFragment) || canReleaseSubWreckage) {                  // 8044
    if (UNIVERSE->n_entities < 0.50 * UNIVERSE_MAX_ENTITIES) {             // 8047
        n_wreckage = (n_alloys < maxWrecks) ? floorf(randf() * (n_alloys + 2)) : maxWrecks;   // 8055, maxWrecks = 3
    }
    for (i = 0; i < n_wreckage; i++) {                                     // 8059
        Vector r1 = [octree randomPoint];                                  // 8060
        Vector dir = quaternion_rotate_vector([self normalOrientation], r1);
        HPVector rpos = HPvector_add(vectorToHPVector(dir), xposition);
        GLfloat lifetime = 750.0 * randf() + 250.0 * i + 100.0;            // 8063
        ShipEntity* wreck = [UNIVERSE addWreckageFrom:self withRole:@"wreckage" at:rpos scale:1.0 lifetime:lifetime / 2];   // 8064
        [wreck setVelocity:vector_add([wreck velocity], vector_multiply_scalar(vector_normal(dir), randf() * [wreck collisionRadius]))];  // 8066
    }
    n_alloys = randf() * n_alloys;                                         // 8068
}
```
`addWreckageFrom` (`Universe.m:5497-5526`): `expected_mass = 0.1f * [ship mass] * (0.75 + 0.5 * randf())`; `scale_factor = powf(expected_mass / wreck_mass, 0.33333333f) * scale`; rescale (mass times `factor^3`); `velocity = [ship velocity]`; random orientation; `setTemperature:1000.0` ("take 1000e heat damage per second"); `setHeatInsulation:1.0e7`; `setEnergy:lifetime`; `setIsWreckage:YES`; then `performTumble`.
- The wreck is one of five hulls chosen by the role "wreckage": `wreckage-component` (`wreck1.dat`) and `more-wreckage2` to `more-wreckage5` (`wreck2.dat` to `wreck5.dat`), all `like_ship = "oolite_template_wreckage-component"` [VERIFIED: `shipdata.plist:4227-4246` and `4555-4585`]. The selection is a uniform probability-set draw [ASSUMED: roles carry no probability suffix, so each has weight 1; not traced through `OOShipRegistry`].
- `fragment_chance = 0.0` on the wreck template means a wreck never fragments (`ShipEntity.m:372` `canFragment = [shipDict oo_fuzzyBooleanForKey:@"fragment_chance" defaultValue:0.9];`).
- **Wreck energy** is `lifetime / 2 = 375 u + 125 i + 50` for draw `u` and wreck index `i`: 50 to 425 for `i = 0`, 175 to 550 for `i = 1`, 300 to 675 for `i = 2`.
- **Wreck collision**: `canCollide` returns NO for wreckage (`ShipEntity.m:1865-1868`, "wreckage won't collide"), so wreckage is never a laser or ramming target.
- **Sub-wreckage** (`canReleaseSubWreckage`, which needs `[UNIVERSE detailLevel] >= DETAIL_LEVEL_EXTRAS`, `7918`) lets an expiring wreck breed sub-wrecks. It depends on a user detail setting Wegolite does not have: cut and record.

### Wreckage lifetime (the pinned formula; ROADMAP "LOW confidence")

`ShipEntity.m:2254-2272` per update: `heatThreshold = heatInsulation * 100` (here 1e9); with no sun `external_temp = 0`, the cooling branch runs `ship_temperature += (external_temp - heatThreshold - ship_temperature) * delta_t * SHIP_COOLING_FACTOR / heatInsulation` (`SHIP_COOLING_FACTOR 0.1f`, `ShipEntity.h:63`), which is `-(10 + 1e-8 T) * dt`: the temperature falls by **10 per second** from 1000. Then `if (ship_temperature > SHIP_MAX_CABIN_TEMP) [self takeHeatDamage:delta_t * ship_temperature];` (`SHIP_MAX_CABIN_TEMP 256.0f`, `ShipEntity.h:69`), and `takeHeatDamage` does `energy -= amount` and `getDestroyedBy:` at `energy <= 0` (`11678-11704`). Energy drain is `T(t) = 1000 - 10 t` per second, so the wreck survives `T` seconds where `1000 T - 5 T^2 = E`, i.e. `T = (1000 - sqrt(1e6 - 20 E)) / 10`.

| E | T (s) | ticks at 120 Hz |
|---|-------|-----------------|
| 50 | 0.0500 | 7 |
| 175 | 0.1752 | 22 |
| 300 | 0.3005 | 37 |
| 425 | 0.4259 | 52 |
| 550 | 0.5515 | 67 |
| 675 | 0.6773 | 82 |

[VERIFIED: computed from the C above in a node one-liner this session.] The roadmap's "about E/1000 s" is right to within 1 %. **Port as a per-tick rule with no new state:** in `stepWorld`, for each live `wreckage` entity, `ageSeconds = (tick - spawnTick) * dt`, `energy = max(0, energy - dt * (1000 - 10 * ageSeconds))`, and when `energy` reaches 0 call `killShip(world, id, NO_ENTITY, events)`. The temperature is a closed function of age because nothing else changes it (the dropped `1e-8 T` term is below 1e-5 relative). Mark the formula "arithmetic from the C, not measured in a running Oolite" in FIDELITY.md and add it to `.planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md` (an OXP can log `wreck.energy` over time).

### Plates (`ShipEntity.m:8072-8111`)

`if (!canFragment) n_alloys = 0; else if (!add_debris) n_alloys = (n_alloys > 1.0) ? 1.0 : 0.0;` then `numAlloys = floorf(n_alloys)`. A plate uses role "alloy": `alloy` (`oolite_alloy.dat`) or `scarred-alloy` (same model, scarred diffuse) [VERIFIED: `shipdata.plist:173-205`, `3481-3498`, `4268-4271`, `4497-4500`]. Position and velocity as for pods; `setCommodity:@"alloys" andAmount:1` (no field here).

### The cap (`ShipEntity.m:7939`, `8047`)

```
BOOL add_debris = (UNIVERSE->n_entities < 0.95 * UNIVERSE_MAX_ENTITIES) && ([UNIVERSE getTimeDelta] < 0.125); // FPS > 8
```
- Scaled to Wegolite's cap [VERIFIED: `src/sim/world/ids.ts:53` `export const MAX_ENTITIES = 256;`]: `0.95 * 256 = 243.2`, `0.50 * 256 = 128`. Keep the C's strict `<` on the float products, so debris is added while the live count is **at most 243** and wreckage while it is **at most 127**. The roadmap's "243 and 128" are these two products rounded; pin the integer consequences in a test.
- **Dropped term:** `[UNIVERSE getTimeDelta] < 0.125` is the frame time; drop it (treat as true) and record it: the world must not depend on the frame rate.
- **Dropped term:** `[self isVisible] || HPdistance2(position, PLAYER position) < SCANNER_MAX_RANGE2` (`7930`): `isVisible` is `cam_zero_distance <= ABSOLUTE_NO_DRAW_DISTANCE2` with `ABSOLUTE_NO_DRAW_DISTANCE2 (2500.0 * 2500.0 * NO_DRAW_DISTANCE_FACTOR * NO_DRAW_DISTANCE_FACTOR)` and `NO_DRAW_DISTANCE_FACTOR 1024.0` (`Entity.h:45-46`, `Entity.m:1028-1031`), about 2,560 km, larger than any Wegolite world. The test is always true; record it as dropped.
- Oolite's `n_entities` counts every entity (the player, planet, sun, station, buoys, effect entities, the dying ship). Wegolite's count is the non-dead dynamic entities only [VERIFIED: `world.ts:224-226` `liveEntityCount`, `ids.ts` comment "The five static entities live in `world.statics` and do not count"], and the dying victim is already dead when debris is released, and render effects are not entities. Record these three differences.
- **Recommended refinement (divergence, record it):** Oolite tests the gate once per explosion, so one explosion can push the count past the threshold by its whole debris load (up to 15 + 3 + 1 pieces). Success criterion 2 says "no ship fails to spawn or die because of debris", so test the live count **per piece** (a piece spawns only while `live <= 243`; wrecks while `live <= 127`). Every draw is still taken before the test, so the stream position never depends on it. This keeps at least 13 slots free for ships.
- Pods and plates never expire (Oolite has no timeout, `Resources/AIs/dumbAI.plist` is `ENTER = (performTumble); RESTARTED = (performTumble); UPDATE = ("pauseAI: 3600");`), and scooping does not exist yet, so a long fight can fill the world to 243. Do not add eviction (Open Question 6); a launch or jump replaces the world.

### Blast momentum (`ShipEntity.m:7680-7698`, called at `8125`)

`moment = amount * desired_range / d2` with `d2 = magnitude2(p2) - ecr * ecr` floored at 0.1; `e2.velocity += normal(p2) * (moment / e2.mass)` for every ship `e2` that `isShip` and `isInSpace` and is within `desired_range + e2.collision_radius` (`Universe.m:5862-5867` `EntityInRange`). It runs **after** the debris is spawned, so fresh pods, plates and wrecks are kicked too, and order does not matter (each entity gets one additive kick).

Worked numbers [VERIFIED: pod, plate and wreck masses and radii computed in the `test` container with the repo's own `hullMass` and `hullRadius` this session; ship values from `ships-npc.json`]:

| Model | Oolite file | mass | radius |
|-------|-------------|------|--------|
| pod | `oolite_barrel.dat` | 993.37 | 5.7986 |
| plate | `oolite_alloy.dat` | 273.44 | 5.1492 |
| plate (alt) | `alloy.dat` / `scarred_alloy.dat` | 390.63 | 5.1488 |
| wreck 1 to 5 | `wreck1.dat` to `wreck5.dat` | 3979.17 / 5793.83 / 2678.52 / 4352.72 / 6317.55 | 17.28 / 18.66 / 19.39 / 21.19 / 22.42 |

(the comment at `ShipEntity.m:6105` says "a cargopod has a mass of about 1000", which agrees). For a Cobra Mk I victim (mass 52,291.8, radius 39.26): `amount = 6536.5`, `desired_range = 98.15`. A pod 15 m from the victim centre gets `6536.5 * 98.15 / (225 - 33.6) / 993 = 3.4 m/s`; a pod within 5.8 m of the centre (about 2 % of pods) hits the 0.1 floor and gets `6.4e6 / 993 = 6,400 m/s`, and a plate in the same place `6.4e6 / 273 = 23,500 m/s`. That exceeds `MAX_ENTITY_VELOCITY` [VERIFIED: `src/sim/world/limits.ts:126` `export const MAX_ENTITY_VELOCITY = 1e4;`], and `sanitizeEntity` would clamp it **and count a repair** (`cleanV4Fields`, `sanitize.ts:580-`), moving a hashed counter. Clamp each component to `MAX_ENTITY_VELOCITY` at the write site and record the clamp.

Ships and the player: a non-overlapping NPC neighbour of the heaviest victim (krait, mass 93,291, radius 50.2, so `amount = 11,661`, `desired_range = 125.5`) is at least 73 m away, so `d2 >= 4,812` and the kick on the lightest hull (shuttle, 11,318) is at most `11,661 * 125.5 / 4,812 / 11,318 = 0.027 m/s`; the Cobra Mk III player (mass 214,737.69, [CITED: the todo `2026-11-14-measure-oolite-reference-in-docker.md`], radius 72.7) gets under 0.002 m/s. [VERIFIED: arithmetic from the compiled masses and radii.] **Cut the push on ships and on the player** and record the bound (an overlapping pair, which only Phase 18's collisions allow, would hit the 0.1 floor); port it for debris (the only recipients with a visible effect). Phase 18's rebounds will need ship drift integration anyway.

## Architecture Patterns

### System Architecture Diagram

```
laser hit (Phase 13/15)                                   stepWorld (each tick, dt = 1/120)
   |                                                         |
resolveShots -> applyLedger -> lethal set                    |- steer/think/drain (unchanged; ai !== null only)
   |                                                         |- NEW stepDebris: for kind cargo|wreckage
   v                                                         |     position += velocity * dt
killShip(victim) --- store.kill, shipDestroyed, notify       |     wreckage: energy -= dt*(1000 - 10*age); 0 -> killShip(NO_ENTITY)
   |                                                         |- proximity, sanitise, commit #1 (entityRemoved)
   |-- NEW releaseDebris(world, victim, ctx) [ship kind only]
   |      gate: live <= 243 (pods, plates)  live <= 127 (wrecks)    stream = victim.rng.combat (local copy, written back)
   |      draws FIRST, spawn attempt AFTER (refusal never changes a draw)
   |      order: canFragment roll -> pods (index order) -> n_wreckage + wrecks (i = 0..) -> n_alloys + plates
   |      spawnEntity(kind cargo | wreckage, ai null, velocity clamped)    <- never throws, may refuse "storeFull"
   |      blast kick on debris within 2.5 R
   v
drainAiEventsNow -> commit #2 (entityRemoved) -> updateIdentTarget
   |
   v   (presentation, never feeds back)
events: shipDestroyed{position, radius, specKey}  ---router row--->  dockFeedback -> scene.explosions.add(...)
world.store.live -> debrisContacts(world) (id-free: specKey, position, orientation, radius) -> scene.debris.update(...)
```

### Recommended Project Structure
```
src/sim/world/debris.ts          # constants (each with its Oolite line), releaseDebris, stepDebris (new)
src/sim/world/kill.ts            # killShip gains an optional DebrisContext parameter
src/sim/world/step.ts            # calls stepDebris after the update loop
src/sim/world/world.ts           # SpawnInit.velocity (bounded) beside SpawnInit.cargo
src/sim/world/contacts.ts        # debrisContacts (id-free), beside npcContacts
src/sim/combat/step.ts           # CombatOptions.debris; resolveShots passes the context to killShip
src/sim/ai/pilots/test-pilot.ts  # scan excludes cargo and wreckage
src/content/schemas/debris.ts, explosions.ts, ship-npc.ts   # strict schemas (+ boundingBox on the NPC record)
src/content/debris.ts, explosions.ts                         # lazy loaders (import.meta.glob, non-eager)
src/content/generated/debris.json, explosions.json           # generated
tools/oolite-ingest/convert/debris.ts, explosions.ts         # converters; glb.ts gains the debris GLBs
src/app/session/traffic.ts, step-options.ts                  # TrafficContent.debris -> CombatOptions.debris
src/app/session/event-router.ts                              # shipDestroyed row -> dockFeedback
src/render/bodies/debris.ts, explosions.ts                   # the two layers; system-scene.ts factories
public/models/{barrel,alloy,scarred-alloy,wreck1..5}.glb, public/textures/*   # generated
```
(Names are proposals; the planner may rename.)

### Pattern 1: A total release function with draws before spawns
**What:** Every random value is drawn from a local copy of the victim's `combat` stream, written back at the end, in one fixed order. A spawn attempt follows each batch of draws and its result (`ok` or a refusal) is ignored except to count.
**When to use:** Always in `releaseDebris`; it is what keeps the cap, the id counter and the cadence tests independent of each other.
**Example:**
```typescript
// Skeleton, not final code. Oolite constants are quoted above; names are proposals.
export function releaseDebris(world: World, victim: Entity, ctx: DebrisContext): void {
  const rng = createRngState(victim.rng.combat);           // local copy (steerEntity does the same)
  const next = (): number => rngNext(rng);                  // [0,1)
  // No throw path: every lookup tolerates a missing key (still draw, spawn nothing).
  const facts = ctx.hulls.get(victim.specKey);              // mass, fragmentChance, boundingBox, octree
  const canFragment = next() < (facts?.fragmentChance ?? 0.9);
  // pods: one survival draw per capsule, position/velocity/orientation draws per survivor
  // wrecks: n_wreckage draw, then per wreck: octree draws, lifetime, mass, model, orientation, push
  // plates: n_alloys draw, then per plate: model, position, velocity, orientation
  victim.rng.combat = rng.s;
}
```

### Pattern 2: A debris pass with no AI
**What:** `stepWorld` skips every `ai === null` entity (`step.ts:112-114`: `for (let i = 0; i < n; i += 1) { const entity = world.store.live[i]; if (entity === undefined || entity.dead || entity.ai === null) continue;`), so debris is never moved by the steering loop. Add one separate loop for `kind === "cargo" || kind === "wreckage"` after it: drift, then burn the wreckage down.
**When to use:** Always; debris is `ai: null` like Oolite's `dumbAI`/`nullAI` entities.

### Pattern 3: Id-free presentation
**What:** The router handler for `shipDestroyed` reads `position`, `radius` and `specKey` only and stores nothing; debris reaches the render through a `debrisContacts(world)` list built each frame exactly like `npcContacts` (`src/sim/world/contacts.ts:44-66`). Tumble is derived from the contact's own orientation (a constant for debris, because the sim never rotates it) and the flight time, for example the spin axis from the quaternion's vector part and a rate from its scalar part, so two pieces tumble differently without an id.
**When to use:** Always; D-03's "derived from entity id" cannot be done because `tests/guards/entity-id-scope.test.ts` forbids naming `EntityId` outside `src/sim`.

### Anti-Patterns to Avoid
- **Gating draws on the spawn result.** A refused spawn must not change any later draw or `nextId` (spawn refusals happen before `store.allocate`, `world.ts:479-` docs).
- **Reading the hull table lazily inside the hash path.** The wreck position uses the victim's octree (`randomPoint`); the table can be absent (lazy chunk). Take the same number of draws and fall back to the origin offset, so a missing table can never change a stream position. (A kill needs a hit, a hit needs the hull table, so in practice it is loaded, but the function must be total, D-15.)
- **Letting debris into a ship-only list.** See Pitfall 2.
- **Frame time anywhere.** No `getTimeDelta`, no wall clock; the wreck burn-down uses `(tick - spawnTick) * dt` with the fixed step.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Random quaternion for a piece | A new generator | `randomQuaternion(rng)` [VERIFIED: `placement.ts:255`] | Already the port of Oolite's `quaternion_set_random`, 4 draws |
| Own-stream draws | `Math.random`, a world-stream draw | `createRngState(entity.rng.combat)` + `rngNext`, written back (the `steerEntity` pattern, `step.ts:174-197`) | `ENTITY_RNG_PURPOSES = ["ai", "combat"]` [VERIFIED: `rng.ts:80`]; a world-stream draw would move the populator's next draws |
| Removing a wreck | A direct `store.kill` | `killShip(world, id, NO_ENTITY, events)` | Idempotent, total, already commits through `entityRemoved` |
| Spawning a piece | A hand-built entity | `spawnEntity` with `SpawnInit` | Domain checks, id counter, stream forks, cap check, never throws |
| Instanced model drawing | A second instancing scheme | The `createNpcLayer` pattern (one `InstancedMesh` per model and primitive, shared geometry, camera-relative float64 subtraction) | Same cost model, same disposal rule |
| Lazy model loading | A new loader | `createNpcModelLoader` keyed by model key (its `open()` latch and `request(keys)`) | Already satisfies "no request before the first in-flight frame" |
| Mass and radius of a debris model | Typed constants | The converter's `hullMass`, `hullRadius` | Keeps the numbers tied to the vendored bytes and the drift gate |
| Explosion parameters | Typed constants in the render | `explosions.json` compiled from `explosions.plist` | The roadmap requires the compile and the drift gate |

**Key insight:** every hard part (streams, spawning, removal, instancing, loading) already exists; the phase is a careful port of one C function plus its plumbing. The risk is in the details of order, totality and what must stay out of target lists, not in new mechanisms.

## Common Pitfalls

### Pitfall 1: A refused spawn changes the stream, the cap changes the hash
**What goes wrong:** Drawing a value only when `spawnEntity` succeeds makes the stream position depend on the live count; a cadence test with a full world then diverges.
**Why:** The natural code shape is `if (spawn.ok) { draw velocity }`.
**How to avoid:** Draw everything for a piece first (box offset, jitter, velocity, orientation), then spawn. The gates (`live <= 243`, `live <= 127`) read world state only, which is identical at every cadence.
**Warning signs:** `nextId` differing between a "cap hit" and "cap not hit" run of the same draws; a hash difference between 30, 60 and 144 Hz only in a world with kills.

### Pitfall 2: Debris leaks into ship-only candidate lists
**What goes wrong:** After the first kill a test pilot chases a pod. [VERIFIED: `src/sim/ai/pilots/test-pilot.ts:73` `const hits = view.scan(` passes no `kinds`, and `view-impl.ts:146-152` `candidateIds` lists every non-dead entity.]
**Why:** `view.scan` reports all kinds unless `ScanFilter.kinds` is given [VERIFIED: `view.ts:54` `readonly kinds?: readonly BodyKind[];`].
**How to avoid:** Give the pilot's scan an explicit kinds list that omits `cargo` and `wreckage` (hash-neutral for every existing world, none holds debris). Already safe: laser candidates (`combat/step.ts:287` filters `kind === "ship"`), ident (`ident.ts:73` and `:109`), `npcContacts` (`contacts.ts:48`), the ledger, mass lock (`NON_LOCKING_SCAN_CLASSES` contains `"CLASS_NO_DRAW"` and `"CLASS_CARGO"`, [VERIFIED: `ship-field.ts:41-49`]) and jump blockage (no `shipMasses` row for a debris key). The proximity pass reads a candidate's mass through `massFor`, 0 for a debris key, and `proximityAlertFor` returns when `otherMass < PROXIMITY_MIN_MASS` [VERIFIED: `constants.ts:573` `export const PROXIMITY_MIN_MASS = 2000;`]; it still visits every pair, so a hundred pods adds pair tests (Pitfall 9). One small divergence to record: a pod (mass 993) never alerts in Oolite either (`ShipEntity.m:6105`, "a cargopod has a mass of about 1000"), but a fresh wreck of mass `0.1 * victim mass * (0.75 to 1.25)` can reach 2,000 and would alert crewed ships for its 0.05 to 0.7 s; here it never does.
**Warning signs:** a fight test whose shooter stops attacking after a kill; a jump refused beside wreckage.

### Pitfall 3: A blast kick over the velocity bound
**What goes wrong:** The 0.1 floor on `d2` makes a piece near the centre receive 6,400 to 23,500 m/s, above `MAX_ENTITY_VELOCITY` (1e4); `sanitizeEntity` clamps it and increments `repairs`, a hashed counter, and the acceptance-style "repairs 0" rules fail.
**How to avoid:** Clamp each component at the write. Test with a plate at the origin of a heavy victim.

### Pitfall 4: The wreck drain reads or writes new state
**What goes wrong:** Adding a temperature or lifetime field is a snapshot bump (D-02 forbids it).
**How to avoid:** The temperature is `1000 - 10 * ageSeconds`; `age` comes from `spawnTick`, which is hashed already. Floor the energy at 0 in the same write so the sanitiser's negative-energy repair (`cleanEnergy`, `sanitize.ts:159`) never fires.

### Pitfall 5: Debris spawned after the sanitise pass is out of domain
**What goes wrong:** Pieces are created in `resolveShots`, after `stepWorld`'s sanitise loop and before the second commit (15-REVIEWS "the case that actually matters arrives in Phase 16"). A non-finite or oversized value would reach a snapshot at the tick boundary.
**How to avoid:** Build every value in-domain (clamped velocity, finite positions, a unit quaternion, energy in `0..maxEnergy`, radius above 0); extend the Phase 15 property test (`tests/sim/combat/kill.property.test.ts`, whose comment names the extension point) with a spawn inside the kill, and assert `snapshotWorld` round-trips at the boundary.

### Pitfall 6: The router widening leaks the id, or breaks a pinned test
**What goes wrong:** Adding `shipDestroyed` to `ROUTED_EVENT_KINDS` changes `tests/app/session-order.test.ts` ([VERIFIED: line 870 `it("reserved kinds pass through", () => {`, with a `shipDestroyed:` fixture at line 889]), and a handler that keeps `event.id` breaks the id-scope rule.
**How to avoid:** Edit the table and the pin together, in the same plan, and say why (Phase 15 recorded that Phase 16 widens it). Use `EVENT_KIND_SUBSCRIBER["shipDestroyed"] = ["dockFeedback"]` (the presentation subscriber `laserFired` already uses, so `EVENT_SUBSCRIBER_ORDER` is unchanged: `"stationFlow", "worldLifecycle", "hudMessages", "dockFeedback", "hyperspaceFlow"`). Read only `position`, `radius`, `specKey`; call `ctx.core.scene?.explosions.add(...)` at call time, as `laserFired` does for `scene.shots`.

### Pitfall 7: Hash and cap tests that pass vacuously
**What goes wrong:** A cadence test with a kill but no debris content passes while testing nothing, because debris needs content in `options.combat.debris`.
**How to avoid:** Non-vacuity assertions: the world holds at least one `wreckage` and one `cargo` entity after the kill, `liveEntityCount` rose by the expected amount, and the same scenario at a full store spawns fewer pieces and draws the same values.

### Pitfall 8: Tumble from an id
**What goes wrong:** D-03 says "derived from entity id", but ids may not leave `src/sim`.
**How to avoid:** Derive from the contact's orientation (constant for debris). Record the substitution in Key Decisions.

### Pitfall 9: Pair and scan cost at the cap
**What goes wrong:** `runProximityPass` visits every pair of live entities whenever any ship is steered (`proximity.ts` loop at the end of `runProximityPass`); 256 entities is 32,640 pairs per tick, each calling `steeredOf` twice.
**How to avoid:** Skip debris kinds in the two pair loops (a hash-neutral change: debris never holds an alert and a debris mass is 0, so it can never trigger one), or accept the cost and measure it. Either way add the "a ship in a field of 200 pods still picks a ship" test.

### Pitfall 10: Wreck expiry and `shipDestroyed`
**What goes wrong:** `killShip` emits `shipDestroyed` for ships only (`kill.ts:126` `if (kind !== "ship") return true;`), so an expiring wreck leaves silently; a pod that is later destroyed (Phase 18) will too.
**How to avoid:** Accept it for wreckage (Oolite draws a burn-out cloud and, at the highest detail, sub-wrecks; cut and record). Do not add a second event kind just for this.

### Pitfall 11: Content timing at the lazy hull and debris chunks
**What goes wrong:** The debris catalogue loads with traffic content; if it is absent when a kill happens (hook spawn before the chunk loads) the kill must still resolve with no debris and the same draws.
**How to avoid:** `releaseDebris` is a no-op without `ctx` (the Phase 15 path) and total with an empty table; the session builds both from the same catalogue load, so they arrive together.

## Code Examples

### The pod survival rule (Oolite, to be ported)
```c
// Source: /home/opencode/git/oolite/src/Core/Entities/ShipEntity.m:7823-7841 (pinned 7437f22)
unsigned cargo_chance = 70;
...
if (Ranrot() % 100 < cargo_chance) {
    if (cargo_chance > 10) { if (EXPECT_NOT([self isPlayer])) { cargo_chance -= 20; } else { cargo_chance -= 30; } }
    limit--;
```

### The wreck burn-down per tick (to write)
```typescript
// Per live wreckage entity, in stepWorld's debris pass (dt is the fixed step).
const ageSeconds = (tick - entity.spawnTick) * dt;
const temperature = 1000 - 10 * ageSeconds;           // 1000 K start, falls 10 per second (arithmetic above)
entity.energy = Math.max(0, entity.energy - dt * temperature);
if (entity.energy === 0) killShip(world, entity.id, NO_ENTITY, events);
```

### The blast kick with the bound (to write)
```typescript
// For each non-dead debris entity e2 within desiredRange + e2.radius of the victim (after all spawns).
const d2 = Math.max(0.1, distSq(e2.position, victim.position) - e2.radius * e2.radius);
const moment = (0.125 * victimMass) * (victimRadius * 2.5) / d2;
const k = moment / debrisMass(e2.specKey);                 // 0 mass: skip (total)
e2.velocity = clampVelocity(add(e2.velocity, scale(normalize(sub(e2.position, victim.position)), k)));
```

### Lazy catalogue loading (existing pattern to copy)
`src/content/ships-npc.ts` loads a generated JSON through a non-eager `import.meta.glob(..., { query: "?raw", import: "default" })`, parses it with the strict schema and caches the promise; `start-session.ts` calls it in the boot `Promise.all` only when traffic is on. Copy it for `debris.json` and `explosions.json`.

## Content and vendoring (DATA-16)

### What to vendor
[VERIFIED: sizes by `ls -la` of the checkout; sha256 of four of them equal at the pinned commit and in the working tree.]

| Path under `Resources/` | Bytes | Why |
|-------------------------|-------|-----|
| `Models/oolite_barrel.dat` | 26,307 | the pod (`cargopod`) |
| `Models/oolite_alloy.dat` | 3,225 | the alloy plate model named by `oolite_template_alloy` |
| `Models/wreck1.dat` to `wreck5.dat` | 2,159 / 5,301 / 2,946 / 1,646 / 2,946 | the five wreckage hulls |
| `Textures/oolite_barrel_diffuse.png`, `oolite_barrel_normal.png`, `oolite_barrel_specular.png` | 385,416 / 189,166 / 575,703 | the barrel's three maps (`shipdata.plist:613-619`) |
| `Textures/oolite_alloy_diffuse.png` | 152,639 | plate, with the alpha emission |
| `Textures/oolite_alloy_diffuse_scarred.png` | 153,629 | the `scarred-alloy` variant (optional, Open Question 7) |
| `Textures/wreck.png` | 108,049 | the wreck models' own legacy texture (`TEXTURES` section of each `.dat`) |
| `Textures/oolite-particle-cloud2.png` | 21,592 | the default ship explosion cloud (`explosions.plist` `oolite-default-ship-explosion`) |
| `Textures/oolite-particle-flash.png` | 15,946 | the explosion flash (`OOFlashEffectEntity.m`, `sFlashTexture`) |
| `Textures/oolite-particle-fragments.png`, `...fragments2.png` | 29,640 / 28,266 | only if a fragment explosion is rendered (wreckage chunk and wreck explosions, which this phase cuts); vendor only what is drawn |

`Config/explosions.plist` and `Config/shipdata.plist` are already vendored (listed in `scripts/vendor-oolite.sh` `FILES`), so the alloy, barrel and wreckage entries and the explosion parameters are readable from the vendored copy today.

### Converter work
- **Naming rule:** `shipGlbFile` accepts only `oolite_<name>.dat` and fails the build for any other model name (`glb.ts` `SHIP_MODEL_PATTERN`), so `wreck1.dat` to `wreck5.dat` need a debris-specific rule (a new emitter or a widened pattern).
- **Models and masses:** emit one GLB per debris model; `hullMass` and `hullRadius` give the catalogue numbers (table above). The wreck models are legacy textured (`TEXTURES` lines name `wreck.png`; `parseDat` already handles both legacy modes), which the texture closure must accept for entries with no `materials` dictionary (new code in `textures.ts`, check first).
- **`debris.json`:** per model key: file, GLB path, mass, radius, plus the role grouping (pod, plate variants, wreck variants). Strict zod schema, golden under `tests/golden/content/`, lazy loader.
- **Hull bounding box:** pods and plates are placed in the **dying ship's** `boundingBox` (`OOEntityWithDrawable.m:55`, `boundingBox = [drawable boundingBox]`). Nothing compiled carries it today (the NPC record keys are `aftWeapon,...,viper` without a box; [VERIFIED: node read this session]). Add `boundingBox` (min and max, float32 of the `.dat` vertices) to the NPC record: a `ships-npc.json` change, which triggers the QUAL-11 by-hand run and a golden regeneration of `tests/golden/content/ships-npc.json`.
- **`explosions.json`:** compile `explosions.plist` (the 11 entries) to a strict record list: `alpha`, `color_order`, `count`, `duration`, `growth_rate`, `size`, `spread`, `texture`, with Oolite's defaults for absent keys (`OOExplosionCloudEntity.m` defaults: `kExplosionCloudDuration 0.9`, `kGrowthRateFactor 1.5f`, `kExplosionCloudAlpha 0.85f`, `kExplosionDefaultSize 2.5f`, spread 1.0, count 25). Presentation only; the sim never reads it.
- **Drift gate:** `npm run assets:check` regenerates into a temp tree and diffs; new emitters join `generate.ts` the way `emitNpcShips` does.

### The vendor script (decision needed)
`scripts/vendor-oolite.sh` downloads each `FILES` entry with `fetch(\`${BASE_URL}/${path}\`)` from `raw.githubusercontent.com` at the pinned commit, then rewrites `CHECKSUMS.sha256`, `pin.json` and the digest cells of `ASSETS.md`, and fails when a vendored path has no `ASSETS.md` row [VERIFIED: `scripts/vendor-oolite.sh`]. AGENTS.md and the owner decision say vendor from the local checkout and never fetch Oolite files over the network, and the `ci` image has no `git` [VERIFIED: `docker compose run --rm test sh -lc 'command -v git'` printed `sh: 1: git: not found`]. The pinned commit 7437f22 resolves in the checkout and the debris assets are byte-identical at the pin and in the working tree [VERIFIED: `git show 7437f22:<path> | sha256sum` equals `sha256sum <path>` for `wreck1.dat`, `oolite_barrel.dat`, `wreck.png`, `oolite-particle-cloud2.png`]. Recommended: add an opt-in local source to the script (a mounted directory such as `-v /home/opencode/git/oolite:/oolite:ro` and an `OOLITE_LOCAL=/oolite/Resources` variable) that copies the listed files instead of fetching, with a verification step that compares each file's SHA-256 with a list produced on the host by `git -C <checkout> show 7437f22:Resources/<path> | sha256sum`, and fails on any mismatch (research Pitfall 25: "SHA-256 cross-check against the pinned commit"). The default (network) mode stays for the pinned-release workflow; it is a human-run script, so this is a checkpoint task, not an unattended one.

### Provenance rows
Every new path needs an `ASSETS.md` row (the script errors without one) and `NOTICE` paragraphs for the generated catalogues, following the existing `ships-npc.json` paragraph (`NOTICE` line 74). Generated GLBs and re-encoded textures get `generated-asset` rows like `public/textures/oolite_gecko_diffuse.webp`. `tests/compliance-assets.test.ts` enforces the table.

## Render (WORLD-17)

**Budget facts.** [VERIFIED: `docs/PERFORMANCE.md` rows] The traffic-on in-flight scene measures 17 calls with the 12 inert ships (the NPC layer adds 8 of them, at most 13); the budget is `const DRAW_CALL_BUDGET = 50;` [VERIFIED: `tests/e2e/budget.spec.ts:45`]. Estimate for this phase: debris layer at most one call per (model, primitive) over eight models, so 8 to 10; explosion layers 2 (cloud, flash). Worst case about `17 - 8 + 13 + 10 + 2 = 34`, well inside 50 [ASSUMED: primitive counts of the new GLBs are not known until the converter runs; the existing traffic and combat specs measure the real number].

**Debris layer.** Same shape as `createNpcLayer` [VERIFIED: `npc-ships.ts:43` `export const NPC_INSTANCE_CAPACITY = 256;`, one `InstancedMesh` per model and primitive, shared geometry and material, `frustumCulled = false`, camera-relative float64 subtraction before the float32 write]. Differences: contacts come from `debrisContacts(world)` (kinds `cargo` and `wreckage`), the per-instance scale is `contact.radius / modelRadius` (a wreck's `radius` is the scaled collision radius, so the hashed `radius` carries the scale), and the instance rotation is `contact.orientation` composed with the cosmetic spin. Models load per key through `createNpcModelLoader` (its `open()` latch stays closed until the first in-flight frame draws); a key with no loaded model is simply not drawn.

**Explosion layer.** Two pooled additive sprite layers (cloud, flash), preallocated, one `InstancedMesh` of a unit quad each with `instanceColor` carrying brightness times alpha (additive blending makes alpha a multiplier on rgb), camera-facing matrices written per frame, retired by flight time like `laser-shots.ts` (`LASER_SHOT_POOL = 32`, `LASER_SHOT_DURATION`). Parameters from `OOExplosionCloudEntity.m:50-130` and `OOFlashEffectEntity.m`: cloud `size = collisionRadius * settings.size`, `growthRate = settings.growth_rate * size`, particle speed between `size * 0.8 * spread` and `size * 1.2 * spread`, `count` capped at 10 for detail below `DETAIL_LEVEL_EXTRAS` and 25 above (Open Question 8), duration from the entry, alpha fades linearly; flash `duration 0.4`, `alpha 0.5`, `growth = max(150 * size, 600)`, white, fade in over the first two thirds and out over the last third. A hard cap on simultaneous explosions (a ring buffer, like the shot pool) keeps the call count fixed however many ships die. Particle randomness is render-only and must not use the sim streams; seed it from the event's position bits so a test can reproduce it.

**Hash independence (success criterion 3).** The sim never imports the render and the router handler never writes to the world, so the world hash cannot depend on the layers; prove it two ways: (1) the guard `scripts/check-arch-determinism.sh` and the sim-purity tests stay green; (2) a browser step runs the same manual-clock kill scenario that the Node tick replay (`trafficContent`/`createInertPopulate` are shared by both, `traffic.ts` header) runs without any layer, and the probe's `worldHash()` [VERIFIED: `probe-publisher.ts` exposes `worldHash` and `advanceTicks` on the hook] equals the Node hash. The 30, 60 and 144 Hz equality is a Vitest cadence test over a world with kills (`tests/sim/world/world-cadence.test.ts` pattern).

## Carry-over from the Phase 15 reviews

| Item | Finding | Action |
|------|---------|--------|
| Router table for `shipDestroyed` without leaking the id | Pitfall 6 above; `shipDestroyed` and `entityRemoved` are pinned as unrouted in `tests/app/session-order.test.ts` | Route `shipDestroyed` only, to `dockFeedback`; amend the pin in the same plan |
| Doubled hit sound over the explosion | `shipHit` has **no consumer**: `rg shipHit src` finds it only in `src/sim` (`events.ts`, `ledger.ts`), it is not in `ROUTED_EVENT_KINDS`, and audio (AUD-01 to AUD-03) is unscheduled [VERIFIED: rg this session] | No code change; record "no consumer, revisit with audio" in the Key Decisions row. The optional fix (skip `shipHit` for a target already in the lethal set in `applyLedger`) would bend the Phase 13 "every record applies" rule and change Phase 15 pins, so do not take it unless the owner asks |
| Escort release when a leader dies | Already checked and recorded in ROADMAP Phase 17: `escortCheckMother` at `ShipEntityAI.m:1591` (`escortAI.plist` `UPDATE = (escortCheckMother, "pauseAI: 15")`), no escorts are spawned by the populator, no gameplay effect; the port belongs to the first phase that spawns escorts [VERIFIED: rg of `ShipEntityAI.m` and `escortAI.plist` this session] | None in Phase 16 |
| `ship_kills` tally | Unmodelled, deferred with LAW-* | None |
| Hook-spawned "kill a trader, see pods" | The hooks spawn with cargo 0 (`test-spawn.ts`, PROJECT.md Phase 15 row); `SpawnInit.cargo` exists [VERIFIED: `entity.ts:137` `cargo?: number;`] | The browser step needs a hook spawn with a capsule count: extend the existing hook members (an additive argument), tainting the session as the others do (T-13-27), and update `probe-shape.spec.ts` under the sanction note if a member is added |

## Runtime State Inventory

Not applicable: this is a greenfield feature phase, not a rename, refactor or migration. Nothing is renamed, no stored data, service config, OS registration, secret or installed package carries an old name. (The one persisted-adjacent change, `ships-npc.json` gaining `boundingBox`, is a build artifact regenerated by `assets:build` and guarded by the drift gate; world snapshots are test-only today, saves do not hold a snapshot [VERIFIED by Phase 15 research `rg` over `src`].)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Phase 15: a destroyed ship simply disappears | Phase 16: the ship explodes into debris through the same `killShip` | this phase | `killShip` gains a debris context; `entityRemoved` still comes from the second commit |
| Debris drift planned as "render-side" in early notes | Drift is hashed sim state (`Entity.velocity`, D-01) integrated by the world step | Phase 15 (D-01) | Debris positions are part of the hash and must replay equal at every cadence |
| Oolite's frame-time and visibility gates | Dropped (world state only) | this phase | Recorded in Key Decisions and FIDELITY.md |

**Deprecated/outdated:** none.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The wreck's lifetime formula is exact for the C as read, but it has never been seen in a running Oolite; the look (a wreck gone in 0.05 to 0.7 s) is unverified | The Oolite explosion rule, ported | Wreckage looks too short or too long; the pin is one constant per FIDELITY row and the todo measures it |
| A2 | The wreck and plate models are chosen with equal weight from their role sets (no probability suffix in `roles`) | Wreckage, Plates | A different 50/50 or 1-in-5 mix; cosmetic only |
| A3 | The debris layer's primitive counts (about one per model) and the 34-call worst case | Render | Budget closer to 50 than estimated; measured by the traffic and combat specs before merge |
| A4 | Pods and plates have no hulls in this phase, so they cannot be shot or rammed until Phase 18 (the scope note says "can be shot" but DATA-15, the barrel and plate hulls, is Phase 18) | Open Question 3 | If the owner wants them hittable now, two hulls join the lazy hull chunk and the hit candidates widen in this phase |
| A5 | Skipping the blast push on ships and the player is acceptable (bounded by 0.027 m/s and 0.002 m/s) | Blast momentum | A reviewer may read "the blast pushing neighbours" as ships too; the bound is in the Key Decisions row |
| A6 | D-06's per-pod commodity draw has no consumer, so none is taken (Open Question 1) | Open Questions | If the owner insists on the letter of D-06, a dead draw or a specKey-encoded commodity is needed |
| A7 | Explosion `count` of 10 or 25 (Oolite's `detailLevel`-dependent cap) | Render | Cosmetic; pick one and record |
| A8 | Per-piece cap gating instead of Oolite's per-explosion gating | The cap | A divergence from Oolite that only shows near 243 live entities; recorded |
| A9 | `isVisible` is effectively always true in Wegolite (about 2,560 km) | The cap | If a world could exceed it, far kills would spawn debris Oolite would skip |

## Open Questions

1. **What does a pod hold (D-06 against YAGNI)?**
   - What we know: D-06 says the commodity of each capsule is drawn at the explosion from the ship's `combat` stream. Nothing stores it: there is no commodity field, scooping (CBT-11) is unscheduled, and the review noted "`specKey` is the only hashed place" (15-REVIEWS). Oolite's pod also draws an amount (tonnes 1; kg `1 + (Ranrot() % 6) * 3`; g `4 + ...`) and a 50 % role roll (`Universe.m:3863-3878`, `3977-3996`), and the ship's cargo list is filled from the system market at spawn (`ShipEntity.m:7318-7373`).
   - What's unclear: whether the owner wants a dead draw to keep the stream order that a later scooping phase would need, or no draw.
   - Recommendation: take **no commodity draw**; spawn every pod as one `cargopod` model. A later phase that adds scooping adds its commodity (probably a `specKey` such as `cargopod:<commodity>` with its own draw) and accepts the changed stream then; pre-release saves do not hold worlds. State it in the Key Decisions row as narrowing D-06, and ask the owner to confirm at plan review.

2. **How does the vendor script read the local checkout?** See "The vendor script". Recommendation: add an opt-in local source with a host-produced pinned-hash list; the owner runs it (checkpoint task).

3. **Can pods and plates be shot or rammed in this phase?** The scope note says "Pods and plates drift, can be shot, and are rammed in Phase 18". Recommendation: no hulls, so no hits and no collisions until Phase 18 (DATA-15); they are visual and physical drifters only. Confirm.

4. **Blast push on ships and the player.** Recommendation: cut for ships and the player (bounded, above), port for debris, clamp at `MAX_ENTITY_VELOCITY`.

5. **Gate per piece or per explosion?** Recommendation: per piece (above); it satisfies "no ship fails to spawn because of debris".

6. **Eviction of old debris at the cap?** Oolite has none. Recommendation: none; the world is replaced on launch and jump, and a full world only sheds new debris.

7. **Scarred alloy variant.** Vendor the second texture (153,629 bytes) for the 50/50 plate mix, or ship one plate look. Lazy-loaded, so no cold-start cost; discretion.

8. **Explosion particle count (10 or 25) and the wreck burn-out cloud.** Oolite caps the cloud at 10 below the extras detail level and uses the authored 25 above. Recommendation: 10 (the default level below extras), no burn-out cloud for expiring wrecks, no fragment sprites; record.

9. **Which cargo count does a hook-spawned ship carry?** See Carry-over; an additive hook argument.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker + compose | every test, build, assets run | yes | images `wegolite-ci`, `wegolite-cross` present; a `test` container ran this session | none needed |
| Node, npm on the host | not authoritative | n/a | not used | all commands run in containers |
| `cwebp` | texture re-encode when a new texture appears | yes (in the `ci` image, `Dockerfile` apt `webp`) | image-pinned | none needed |
| `git` inside the container | a `git show`-based vendor check | no (`sh: 1: git: not found`) | - | run the pinned-hash list on the host, mount the checkout read-only, compare hashes in node |
| Oolite checkout | vendor script (local mode), FIDELITY verbatim excerpts | yes at `/home/opencode/git/oolite` (HEAD `21978c37b`, the four cited files identical to 7437f22) | - | set `OOLITE_SRC` for the verbatim FIDELITY check |
| Remote test machine | `verify`, `verify-full`, browser specs, the 20-seed acceptance run | per project memory (opencode@192.168.178.51 and a wrapper script); not probed this session | - | slow local container |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** `git` in the container (see above).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.5 with fast-check 4.10.2; Playwright 1.64.1 for browser specs [VERIFIED: package.json] |
| Config file | `vitest.config.ts` (coverage thresholds on `src/sim/**`, `src/persistence/**`, `src/content/**`), `vitest.acceptance.config.ts`, `playwright.config.ts` |
| Quick run command | `docker compose run --rm test npx vitest run <file>` (or `npm run test:fast` for the suite without coverage) |
| Full suite command | `docker compose run --rm test`; gates `docker compose run --rm lint`, `... typecheck`, `... assets npm run assets:check`, `... verify`, `... verify-full` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CBT-08 (destruction) | pod survival schedule 70/40/10, 15-pod limit, per-hull n_alloys, `n_wreckage` range, plate count, `canFragment` roll | unit (worked examples hand-computed from the C) | `docker compose run --rm test npx vitest run tests/sim/world/debris.test.ts` | Wave 0 |
| CBT-08 / criterion 1 | same seed and same kill give the same debris at 30, 60, 144 Hz; spawn order fixed | cadence scenario | `... vitest run tests/sim/world/debris-cadence.test.ts` | Wave 0 |
| criterion 2 | thresholds 243 and 127, per-piece gate, refused spawn leaves draws and `nextId` rule intact, kill resolves at a full store | unit + property | `... vitest run tests/sim/world/debris-cap.test.ts` | Wave 0 |
| criterion 1 | wreck burn-down equals the table (7 to 82 ticks), expiry through `killShip`, no sanitiser repair | unit | `... vitest run tests/sim/world/debris.test.ts` | Wave 0 |
| criterion 2 | totality and snapshot round trip with debris spawned inside the kill (extends the Phase 15 property) | fast-check | `... vitest run tests/sim/combat/kill.property.test.ts` | exists, extend |
| criterion 2 | a ship in a field of pods still picks a ship; ident, laser candidates, mass lock and jump blockage ignore debris | unit | `... vitest run tests/sim/ai tests/sim/world/ship-field.test.ts` | extend |
| blast | kick formula, clamp at `MAX_ENTITY_VELOCITY`, ships and player untouched | unit | `... vitest run tests/sim/world/debris.test.ts` | Wave 0 |
| DATA-16 | converter, schemas, goldens for `debris.json`, `explosions.json`, `boundingBox` | content | `docker compose run --rm test npx vitest run tools/oolite-ingest tests/content` and `docker compose run --rm assets npm run assets:check` | extend |
| DATA-16 | provenance rows for every new path | compliance | `... vitest run tests/compliance-assets.test.ts tests/compliance.test.ts` | exists, extend |
| DATA-16 | FIDELITY rows quote at most 20 lines each, divergences quote a Key Decisions row | contract | `... vitest run tests/contract/fidelity.test.ts` (`OOLITE_SRC` for the verbatim mode) | exists, extend |
| WORLD-17 | router row, subscriber order, no id stored | app | `... vitest run tests/app/session-order.test.ts tests/guards/entity-id-scope.test.ts` | exists, amend |
| WORLD-17 | layers: capacity, disposal (half-built path), no per-frame allocation, tumble from orientation | render | `... vitest run tests/render` | Wave 0 |
| WORLD-17 | fixed draw calls with hundreds of pieces; debris and explosion assets not requested on a cold start | browser | `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/combat.spec.ts tests/e2e/traffic.spec.ts tests/e2e/budget.spec.ts"` (remote machine) | extend |
| WORLD-17 | probe world hash equals the Node replay hash with layers on | browser | same command, `combat.spec.ts` | extend |
| QUAL-11 | frozen 20-seed acceptance still 21 of 21 | by hand | `docker compose run --rm test npm run test:acceptance` (remote machine) | exists |

### Sampling Rate
- **Per task commit:** the targeted `vitest run <file>`.
- **Per wave merge:** `docker compose run --rm test`, `lint`, `typecheck` for sim plans; add `assets npm run assets:check` for content plans; `verify` for app and render plans.
- **Phase gate:** `verify-full` on the remote machine when the owner confirms (render change), and the by-hand 20-seed run after the last plan that touches `src/sim/world/**` or `ships-npc.json`, recorded in that SUMMARY.

### Wave 0 Gaps
- [ ] `tests/sim/world/debris.test.ts`, `debris-cap.test.ts`, `debris-cadence.test.ts`: the new sim tests above.
- [ ] A hand-computed fixture file per rule (the Phase 13 constants-ledger style: source line beside every number): n_alloys per hull (1.2788, 1.7182, 1.4240, 1.9857, 1.5630, 1.7092, 1.1719, 1.4300, 1.5433 for adder to viper), the lifetime table, the kick examples.
- [ ] `tests/render/debris-layer.test.ts`, `explosion-layer.test.ts`, and disposal cases in the system-scene test.
- [ ] Content tests for `debris` and `explosions` (schema bounds, golden, drift).
- [ ] Extensions: `kill.property.test.ts` (spawn inside the kill), `tests/app/session-order.test.ts` (router row), `budget.spec.ts` (debris GLBs and textures in the "not requested on a cold start" list), `npc-assets.spec.ts` (debris GLBs decode).
- Framework install: none.

## Security Domain

`security_enforcement` is enabled (ASVS level 1, block on high) in `.planning/config.json`. The game is a static client with no accounts, so most categories do not apply.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | none (no accounts) |
| V3 Session Management | no | none |
| V4 Access Control | no | none |
| V5 Input Validation | yes | strict zod schemas for the two new generated files, parsed as untrusted input at load (`ships-npc.ts` pattern); bounded sim fields (`sanitizeEntity`, `limits.ts`) |
| V6 Cryptography | no | SHA-256 provenance only, through the existing script (never hand-rolled) |
| V12 Files and resources | yes | GLB path pattern check before any fetch (`NPC_GLB_PATH_PATTERN`, re-checked in `loadNpcModel`); assets only through the vendor script; `connect-src 'self'` unchanged |
| V14 Configuration | yes | no new network origin; provenance in `ASSETS.md` and `NOTICE` |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A tampered lazy catalogue (`debris.json`, `explosions.json`) with huge counts, non-finite numbers or a path escape | Tampering | Strict schema with finite and bounded numbers, closed key sets, GLB path pattern; the loader rejects and the sim runs with no debris content |
| Unbounded entity creation by a kill | DoS | Fixed per-kill maxima (15 pods, 3 wrecks, plates from a finite `n_alloys`), the per-piece gate at 243 and `spawnEntity`'s `storeFull` refusal |
| Unbounded effect instances | DoS | Preallocated pools with a ring buffer; fixed draw calls |
| Non-finite or out-of-domain values entering the hash or a snapshot | Tampering | In-domain construction, the velocity clamp, `sanitizeEntity`; `releaseDebris` total on any world state |
| A debug hook that spawns cargo or debris without tainting the session | Tampering | Every hook mutation sets the taint that skips autosave (T-13-27); any new hook argument follows it |
| Entity ids escaping the sim through the new router row or layer | Information disclosure | The handler reads position, radius and spec key only; `entity-id-scope` guard stays green |
| A vendor step that trusts unpinned bytes | Tampering | Pinned-commit hash list, `CHECKSUMS.sha256`, `ASSETS.md` row per path |

## Plan-split advice (for the planner)

The ROADMAP asks that Phase 16's and Phase 17's seam plans do not share a wave; whichever lands second rebases. Suggested cut (five plans, content first because the sim plan needs its numbers):

1. **Content and vendoring (DATA-16).** Vendor script local mode (checkpoint: human runs it), the debris and wreck assets, `debris.json`, `explosions.json`, `boundingBox` on the NPC record, schemas, goldens, `ASSETS.md`/`NOTICE`/`CHECKSUMS.sha256`. Gate: `test`, `assets:check`, then the by-hand acceptance run (`ships-npc.json` changed).
2. **Sim debris (CBT-08 destruction clauses).** `debris.ts`, `killShip` context, `stepDebris`, `SpawnInit.velocity`, the cap, the draw order, the blast kick, the scan filter, the property and cadence tests. Gate: `test`, `lint`, `typecheck`, then the by-hand acceptance run.
3. **App wiring.** Catalogue loading with traffic content, `CombatOptions.debris` through `step-options.ts`, the router row and its pin, the hook cargo argument, the Node-replay parity. Gate: `verify`.
4. **Render (WORLD-17).** Debris and explosion layers, scene factories and disposal, `debrisContacts`, driver wiring, lazy loading. Gate: `verify`.
5. **Close-out.** Browser steps (`combat.spec` with debris and the draw-call count, `budget.spec` and `npc-assets.spec` lists, the probe-versus-replay hash), FIDELITY rows with excerpts, the Key Decisions rows (cap thresholds and the dropped terms, spawn order, lifetime formula LOW, D-06 narrowing, tumble from orientation, per-piece gate, the cuts), `CHANGELOG.md`, `docs/PERFORMANCE.md` rows, the todo update. Gate: `verify-full` on the remote machine when the owner confirms.

Document order inside the Key Decisions row the planner must write (ROADMAP "Decisions to settle"): the lifetime formula, the spawn order, the dropped frame-time term, and what a pod holds.

## Sources

### Primary (HIGH confidence)
- Oolite checkout `/home/opencode/git/oolite` (pinned 7437f22; the four files cited are identical to HEAD): `src/Core/Entities/ShipEntity.m` (becomeExplosion 7891-8143, releaseCargoPodsDebris 7814-7879, setCargoFlag 7323-7373, takeHeatDamage 11678-11704, update heat 2230-2272, canCollide 1858-1876, dealMomentumWithinDesiredRange 7680-7698, thrustVector 11158-11170, randomEjectaTemperature 7562-7582), `src/Core/Universe.m` (addWreckageFrom 5497-5526, reifyCargoPod/cargoPodFromTemplate 3853-3878, getRandomAmountOfCommodity 3977-3996, EntityInRange 5862-5867, addEntity cap 5004), `src/Core/OOVector.m:107-113`, `src/Core/Octree.m:683-714`, `src/Core/Entities/Entity.h:45-50`, `OOExplosionCloudEntity.m`, `OOFlashEffectEntity.m`, `OOParticleSystem.m:148`, `Resources/Config/shipdata.plist`, `Resources/Config/explosions.plist`, `Resources/AIs/dumbAI.plist`, `Resources/Models/*`, `Resources/Textures/*`.
- Wegolite tree (read this session): `src/sim/world/{kill,step,entity,world,limits,ids,sanitize,serialize,contacts,view-impl,ship-field,populate}.ts`, `src/sim/combat/{step,ledger,octree}.ts`, `src/sim/npc/proximity.ts`, `src/sim/ai/pilots/test-pilot.ts`, `src/sim/rng.ts`, `src/sim/sim.ts`, `src/app/session/{event-router,render-driver,traffic,step-options}.ts`, `src/app/npc-models.ts`, `src/render/bodies/{npc-ships,laser-shots}.ts`, `src/render/system-scene.ts`, `src/render/asset-cache.ts`, `src/content/{ships-npc.ts,schemas/ship-npc.ts,schemas/ship-hull.ts}`, `tools/oolite-ingest/{generate.ts,convert/glb.ts,convert/ship-mass.ts,convert/octree.ts}`, `scripts/vendor-oolite.sh`, `tests/e2e/{budget,combat,npc-assets,traffic}.spec.ts`, `tests/contract/fidelity.test.ts`, `docs/PERFORMANCE.md`, `Dockerfile`, `compose.yaml`, `package.json`.
- Planning documents: ROADMAP.md, REQUIREMENTS.md, STATE.md, PROJECT.md Key Decisions, `15-CONTEXT.md`, `15-RESEARCH.md`, `15-VERIFICATION.md`, `15-REVIEWS.md`, the 15 SUMMARY files (grep), `.planning/research/PITFALLS.md` (pitfalls 8, 9, 14, 17, 20, 25 and the rest).
- Container measurements: `hullMass` and `hullRadius` of the repo run in the `test` container over the Oolite `.dat` files (`/tmp/dm/mass.ts`, scratch, not in the repo); node arithmetic for n_alloys and the lifetime table.

### Secondary (MEDIUM confidence)
- None used.

### Tertiary (LOW confidence)
- The look of the effects and the real in-game wreck lifetime (A1, A7): derived, not observed.

The research-plan and research-store seam (`gsd-tools query research-plan`) was not used: every finding comes from the local source trees, so there is nothing to fetch or cache. The codebase-memory MCP tools were not available as callable functions in this run; the Wegolite tree was read directly with `rg` and file reads, and graph results were not relied on for any claim.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, no new dependency, versions read from `package.json`
- Oolite rules and numbers: HIGH for the C as read and the arithmetic; MEDIUM for how it plays (never measured)
- Architecture and integration points: HIGH, each point read in the tree
- Render design: MEDIUM, patterns exist but the new layers are unwritten and the call estimate is an assumption (A3)
- Pitfalls: HIGH

**Research date:** 2026-11-16
**Valid until:** 2026-12-16 (the tree changes with Phase 17 running beside this phase; recheck `src/sim/world/step.ts`, `src/sim/combat/step.ts` and the router table before planning if Phase 17 lands first)
