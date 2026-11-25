# Phase 21: Roster, State Shape and Seams - Research

**Researched:** 2026-11-25 (repo HEAD `9736e01b`, clean tree; Oolite pin `7437f22`)
**Domain:** deterministic-sim state design (world snapshot v4 to v5, pristine-omit hashing), an Oolite content pipeline (shipdata to a 28-record NPC catalogue, models and textures), and a Three.js draw-call spike
**Confidence:** HIGH for in-repo and Oolite facts (each read this session); MEDIUM for byte, draw-call and effort estimates (marked `[ASSUMED]`)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Debris and explosion velocity (todo folded)**
- **D-01:** The todo `2026-11-24-debris-inherits-ship-velocity.md` is in scope for Phase 21. Debris released by a dying ship (cargo pods, alloy plates, wrecks) inherits the ship's total velocity: drift plus forward times flight speed, as `ShipEntity -velocity` returns it (ShipEntity.m:11158-11166 at pin 7437f22). The kick is added on top of that velocity. This moves the hashed debris velocities. The move lands in the same single re-pin as the pod commodity and amount fields, with the measured cause recorded. A guard test pins debris velocity as ship velocity plus kick. - **Reversibility:** costly - reverting moves the debris goldens and twin hashes a second time.
- **D-02:** The explosion bursts take the same velocity in the same change. The small burst moves at 1x, the big burst at 0.85x (`OOParticleSystem.m:274`, `:324`). The dying ship's velocity is carried in the explosion event from `killPlayer` and `killShip`, and the render layer offsets each burst centre by `velocity x t`. The explosion layer is render-only and outside the world hash (Phase 20 D-01), so it needs no re-pin. Update or retire FIDELITY E-173 ("the absent velocity drift") and E-179 to match.
- **D-03:** Pods drift with their source ship from this phase on. This is what Phase 24's scooping builds on.

**Hash re-pin authority**
- **D-04:** The Phase 18 standing approval extends to all of milestone v2.4 (Phases 21 to 26). An executor may re-pin the tick-parity twin hash (`tests/app/session/tick-parity.test.ts`), its browser twin (`tests/e2e/combat.spec.ts`), the matching kill-twin assertions and debris goldens without a checkpoint, under two conditions:
  1. The cause is measured and is an intended effect of the plan.
  2. Node and the browser produce the same new value.

  Each re-pin is recorded in the plan SUMMARY as owner-sanctioned, with a comment in each file naming the plan. Three things still need the owner: the frozen acceptance thresholds and detectors, the inert-world epoch 1-20 pin, and any hash move with an unexplained cause. This answers the roadmap's "ask the owner once, in the first plan"; the first plan need not ask again.

**Draw-call budget**
- **D-05:** The spike follows D6's order of fixes: merge primitives per hull at build time, then share textures across variants. If a full anarchy with a fight and its debris still exceeds 50 calls after both fixes, the budget may be raised to at most about 80 without a further owner checkpoint. The condition is that the measured frame time holds on the remote GPU test machine, read as p95 frame time <= 16.7 ms during the fight. Record the measurement, the new budget and the reason in PROJECT.md Key Decisions and `docs/PERFORMANCE.md`, and update `DRAW_CALL_BUDGET` in `tests/e2e/budget.spec.ts`. Above 80, or when p95 misses 16.7 ms, stop and bring the numbers to the owner. Lowering traffic is never the fix. - **Reversibility:** reversible.
- **D-06:** The p95 measurement is a one-off number that informs this decision. It is not QUAL-01's 60 fps evidence, which stays deferred.

**New model loading**
- **D-07:** The new hull GLBs are prefetched in the background after first load, while the player is on the menu or docked, so they are ready before launch. They stay outside the 9,437,184-byte first-load ceiling, with traffic on and off. If a ship appears before its model has arrived, it draws once the model loads. The simulation never waits on or reads model loading, and determinism is unaffected.

### Claude's Discretion
- How large a comms-string subset of `descriptions.plist` to compile: the minimum the in-scope roles use, behind the strict schema.
- The exact bounds of new fields in `src/sim/world/limits.ts` (a roadmap "decision to settle" left to research and planning).
- The plan split, inside the roadmap's fixed first plan (inert-world isolation and the epoch 1-20 hash pin before any catalogue or field change).
- Whether the hit-reaction stage becomes the first `shipHit` consumer. If it does, the `skip-shiphit-for-a-doomed-target` todo comes with it, the offence broadcast is never skipped, and the `ship-hit-consumers` guard covers it (roadmap todo note).

### Deferred Ideas (OUT OF SCOPE)
None came up in the discussion; it stayed within the phase scope.

Reviewed todos (not folded): apart from the two todos named in the roadmap, none of the 41 keyword hits belong to this phase. Phase-tagged ones stay where they are tagged: `narrow-kill-time-ship-target-lost`, `player-ident-lock-in-target-targets-self` and `skip-shiphit-for-a-doomed-target` in Phase 23 (the last can move earlier, see Claude's Discretion); `mutual-kill-credit-symmetry` in Phase 25; `acceptance-run-with-collisions-on` in Phase 26.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOUND-20 | Every new hashed field of the milestone arrives in one world snapshot bump (v4 to v5) with pristine-omit hashing; inert populator, `INERT_POPULATION` and the frozen 20-seed inputs stay byte-identical, pinned by an epoch 1-20 hash test | Section 4 (field set, bounds, hash segments, snapshot/sanitize/spawn touch points), section 5 (isolation design and the measured epoch 1-20 baseline), section 7 (seams), Validation Architecture |
| DATA-17 | Catalogue 9 to 28 records on 18 models with bounty, roles, auto-AI, scoop, escorts, `counts_as_kill`, fuel injection, aft weapons; `aft_weapon_type` refusal lifted; `autoAImap`, `role-categories`, comms strings compiled | Section 1 (the verified 28-record roster), section 2 (converter/schema/test change list, `aft_weapon_type`), comms subset in section 2.4 |
| DATA-18 | New hull models and textures vendored from the local checkout via `scripts/vendor-oolite.sh` with `CHECKSUMS.sha256`, `ASSETS.md`, `NOTICE`; lazy load outside the first-load ceiling | Section 3 (vendor list, asset volume, checkout drift), section 8 (prefetch D-07, first-load mechanics) |
| QUAL-09 (staged) | Full-anarchy draw-call spike before the populator ships | Section 8 (baseline, worst-case arithmetic, hook, protocol) |
| CBT-11 pod clause (staged) | Pods carry commodity + amount from their own forked stream | Section 6 (pod identity, RNG purpose, re-pin) |
</phase_requirements>

## Project Constraints (from AGENTS.md / CLAUDE.local.md)

- **Docker only.** `docker compose run --rm test | lint | typecheck | assets`; host Node is not authoritative. Browser gates (`verify`, `verify-full`, `e2e`) run on the remote machine through `~/.claude/scripts/wegolite-remote-run.sh` (commit first; it syncs `HEAD`). Scratch scripts live under `/tmp` (or the session scratchpad) and mount via `-v <dir>:/scratch`.
- **Fidelity rule:** Oolite behaviour/data/text is the default; any divergence needs reviewer agreement and a `FIDELITY.md` row (E-173/E-179 are due an update, D-02).
- **Gate by change type:** pure `src/sim` plans need `test`, `lint`, `typecheck`; `src/app`, `src/render`, `src/input`, `src/ui`, `index.html` need `verify`; `verify-full` at the phase gate (remote, automatic).
- **QUAL-12 standing gate:** every plan touching `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json` is followed by the by-hand 20-seed run (`npm run test:acceptance`, `vitest.acceptance.config.ts`) on the remote machine, 21 of 21, recorded in its SUMMARY. Thresholds and detectors are frozen (`Detector-change-approved-by-owner` trailer).
- **Generated data is never hand-edited** (`docker compose run --rm assets`; drift gate `assets:check`). Every vendored/generated asset needs an `ASSETS.md` row; vendored bytes come only from `scripts/vendor-oolite.sh`.
- **No database, no OXP, GPL-2.0-or-later code, CC BY-NC-SA Oolite assets.** English documentation. `CHANGELOG.md` `[Unreleased]` entry for user-visible changes (this phase has one: debris and explosions drift with the ship).
- **Coverage floors apply** (`vitest.config.ts`: `src/sim/**` lines 93, statements 91, functions 97, branches 86): new sim code needs tests that keep the floors.
- **Reviewer/subagent brief** (AGENTS.md) must be pasted into every executor/reviewer prompt; read-only reviewers modify nothing.

## Summary

Phase 21 is a data-shape phase with one render measurement. It must (1) isolate the inert world from the catalogue growth *first*, (2) grow `ships-npc.json` from 9 to 28 records and vendor the 9 new models plus their textures, (3) land every new hashed field of the milestone in one snapshot bump (4 to 5) with pristine-omit segments, (4) build four seams with no ordinary-play consumer (priority-AI state shape, `retireShip`, ledger hit-reaction stage, per-facing weapon/fire-gate aft shape), (5) give pods a commodity and amount from their own forked stream and make debris inherit ship velocity in the same single re-pin, and (6) measure the draw calls of a full anarchy.

The decisive facts, all verified this session: the 28-record roster is exactly reproducible from the resolved catalogue (28 non-template records, 18 distinct models) and is stable without the medium/heavy hunter roles; the inert populator picks from *whatever records it is handed* with role weights, so the catalogue cannot grow before the nine-key isolation lands; the `aft_weapon_type` refusal is only one of five coupled places (converter refusal list, `WeaponComponent` single temperature, `attack.ts` aft/broadside/running-defence cut, fire-gate forward-only ray, `NpcFlightStats.forwardWeapon`); the first-load ceiling with traffic **on** has only roughly 150-250 KB of headroom left once the bigger NPC and hull chunks are counted (estimate, must be re-measured); the 28 records carry 54 render primitives, so a full anarchy worst case is about 73 calls, inside D-05's 80-call allowance, but per-hull primitive merging cannot help where primitives carry different textures.

**Primary recommendation:** Execute in this order: (1) measure and pin the inert world (epoch 1-20 golden, already measured below) and add `INERT_RECORD_KEYS`; (2) vendor + converter widening for 28 records; (3) the single v5 field-design plan with strip-and-rehash proofs; (4) seams; (5) pod identity + D-01/D-02 + the one re-pin; (6) the anarchy spike, prefetch (D-07) and the budget decision. Keep every new hashed value pristine in ordinary play so only the debris/pod pins move.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Catalogue compile (28 records, auto-AI map, role categories, comms subset) | Build tooling (`tools/oolite-ingest`) | Content schema (`src/content/schemas`) | Content is compiled at build time behind strict schemas; sim never reads plists |
| Record -> world data (bounty, role, cargo kind, injector, weapons) | Sim (`src/sim/world`) | App (`traffic.ts` supplies records) | State is plain hashed data; the app only builds the catalogue facts the sim receives |
| Inert-world isolation | Sim (`populate.ts` explicit key list) | App (`createInertPopulate`) | The weights live in `pickRecord`; the filter must sit where every caller (tests, Node replay, session) passes through |
| Snapshot v5 / hash segments / sanitize | Sim (`snapshot.ts`, `serialize.ts`, `sanitize.ts`) | - | One format authority; limits only in `limits.ts` |
| Player standing (bounty, kills) | Sim (`PlayerCombatState`) | - | Must be hashed and readable by AI within the tick; not a profile mirror (save v6 is Phase 24) |
| `retireShip` non-lethal removal | Sim (`world/retire.ts`) | - | Sibling of `killShip`, same total/idempotent contract |
| Hit-reaction stage | Sim (`combat/`) | - | Consumes applied ledger records; no event or UI consumer in this phase |
| Pod commodity draw | Sim (`debris.ts`, stateless fork) | App (supplies goods table via `DebrisContext`) | Draw order discipline lives in the release function |
| Explosion drift | Render (`render/bodies/explosions.ts`) | Sim event carries the velocity | Explosion layer is outside the world hash (Phase 20 D-01) |
| Model prefetch (D-07) | App (`npc-models.ts`, render driver) | Render asset cache | Sim never sees loading |
| Draw-call spike | Browser test (Playwright) + hook | Render (`npc-ships.ts` layer) | Counts come from `renderer.info`, published through the probe |

## Standard Stack

No new runtime or dev dependency. Everything is the existing toolchain.

### Core (all pinned in `package.json`)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 6.0.2 | strict sim/tools | existing |
| zod | 4.6.7 | strict catalogue schema (`NpcShipSchema`), new compiled-table schemas | existing strict-schema + golden + drift-gate pattern |
| three | 0.187.0 | render; `InstancedMesh` per (model, primitive) | existing; spike measures it |
| vitest 5.1.1 + fast-check 4.11.0 | | unit/property tests | existing |
| @playwright/test 1.65.1 | | anarchy spike spec | existing |
| @gltf-transform/core 4.5.1 | | GLB build | existing |
| cwebp 1.2.4 (inside the `assets` image) | | texture re-encode | `src/content/generated/texture-encodings.json` records `"encoder": "cwebp 1.2.4"` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| One GLB per record key (recommended) | One GLB per model + render-side texture override | Per-model needs a new material-swap path in the render layer; per-record reuses the converter's "GLB owned by one shipdata entry" rule and the texture closure unchanged |
| Hull octree per record key | Hull octree per model (variants share) | Per-key is simplest but the hull chunk grows about +175 KB vs about +72 KB per model; see section 8 |

**Installation:** none. **Version verification:** N/A (no package added).

## Package Legitimacy Audit

No external packages are installed or upgraded by this phase, so the `package-legitimacy` gate does not apply. Packages removed (SLOP): none. Packages flagged (SUS): none. The only new bytes are Oolite game assets (licence-audited, section 3).

## 1. The roster (DATA-17): 28 records on 18 models

`[VERIFIED: src/content/generated/ships.json (the resolved, like_ship-merged catalogue, 194 entries), python over `roles` tokens with probability suffixes stripped, `isTemplate == false`]`. Roles requested by `oolite-populator.js` for traders, pirates, police and hunters, plus the escort/wingman roles that `escort_roles` and the police wings reach: `trader`, `trader-courier`, `trader-smuggler`, `hunter`, `hunter-medium`, `hunter-heavy`, `pirate`, `pirate-{light,medium,heavy}-fighter`, `pirate-interceptor`, `pirate-{light,medium,heavy}-freighter`, `police`, `interceptor`, `wingman`, `escort`, `escort-medium`, `escort-heavy`. Result: **28 records, 18 distinct `.dat` models** (matches the roadmap).

Sensitivity (verified the same way): dropping `hunter-medium`/`hunter-heavy` removes no record (still 28); dropping also the escort/wingman roles leaves 26 (`sidewinder-escort` and `viper-pursuit` are reachable only through escort/wingman roles). Keep 28 (the owner decision D5 says about 28); this is the lever if scope must shrink (one model fewer).

| key | model (`oolite_<x>.dat`) | aft weapon | `has_scoop` | `has_fuel_injection` | bounty | missiles | in catalogue today |
|-----|-----------------|-----------|-------------|----------------------|--------|----------|--------------------|
| adder | adder | - | true | - | - | 1 | yes |
| anaconda | anaconda | WEAPON_PULSE_LASER | 0.95 | - | - | 7 | no |
| anaconda-pirate | anaconda | WEAPON_BEAM_LASER | 0.95 | - | - | 7 | no |
| asp | asp | - | 0.99 | 0.5 | - | 1 | no |
| boa | boa | WEAPON_BEAM_LASER | 0.75 | - | - | 4 | no |
| boa-mk2 | boa-mk2 | WEAPON_BEAM_LASER | true | - | - | 5 | no |
| boa-mk2-pirate | boa-mk2 | WEAPON_BEAM_LASER | true | - | - | 5 | no |
| boa-pirate | boa | WEAPON_BEAM_LASER | 0.75 | - | - | 4 | no |
| cobra3-alternate | cobra3 | - | 0.95 | - | - | 3 | no |
| cobra3-pirate | cobra3 | - | true | - | 50 | 1 | no |
| cobra3-trader | cobra3 | - | 0.95 | - | - | 3 | no |
| cobramk1 | cobramk1 | - | 0.95 | - | - | 1 | yes |
| cobramk1-alt | cobramk1 | - | 0.95 | 0.25 | - | 1 | no |
| ferdelance | ferdelance | - | true | 0.75 | - | 2 | no |
| gecko | gecko | - | true | - | - | 1 | yes |
| krait | krait | - | 0.95 | 0.65 | - | 0 | yes |
| mamba | mamba | - | 0.95 | - | - | 0 | yes |
| mamba-escort | mamba | - | 0.95 | - | - | 0 | no |
| moray | moray | - | true | - | - | 2 | yes |
| morayMED | moray | - | true | - | - | 2 | no |
| python | python | - | true | - | - | 2 | no |
| python-blackdog | python | - | true | - | - | 2 | no |
| python-trader | python_trader | - | true | - | - | 2 | no |
| sidewinder | sidewinder | - | - | - | - | 0 | yes |
| sidewinder-escort | sidewinder_escort | - | - | - | - | 0 | no |
| viper | viper | - | - | - | - | 1 | yes |
| viper-interceptor | viper_interceptor | - | - | true | - | 3 | no |
| viper-pursuit | viper | - | - | - | - | 1 | no |

(`shuttle` is in today's catalogue but is not in the 28: its only role is `shuttle`, which the roadmap defers. **The catalogue becomes 28 + `shuttle` = 29 if the shuttle stays**, because `INERT_POPULATION`'s shuttle and the `?test=1` flyer hook (`TEST_FLYER_KEYS.station: "shuttle"`) need it. Keep `shuttle` and say so in the plan: eight of the nine legacy keys (all but `shuttle`) are inside the 28, so there are **20 new records** and 29 compiled records (28 resolved + `shuttle`). `[ASSUMED]` A1: the roadmap's "about 28" tolerates this; if the owner wants exactly 28, `shuttle` must stay as a legacy-only record, which still makes 29 compiled.)

Authored-key facts for the 28 (`[VERIFIED: ships.json extras]`): `accuracy`, `reaction_time`, `scanner_range`, `port_weapon_type`, `starboard_weapon_type` are authored by **none** of the 28, so those refusals can stay (they remain tripwires); only `aft_weapon_type` is authored (six hulls: anaconda, anaconda-pirate, boa, boa-pirate, boa-mk2, boa-mk2-pirate). `bounty` is authored by one record (cobra3-pirate, 50). `counts_as_kill`, `escorts`, `escort_role`, `escort_ship` are authored by none; `escort_roles` (an array of `{min,max,role}` dictionaries, one role may be the empty string) by eight: anaconda, anaconda-pirate, boa, boa-mk2, boa-mk2-pirate, boa-pirate, python-blackdog, python-trader. `has_fuel_injection`: asp 0.5, cobramk1-alt 0.25, ferdelance 0.75, krait 0.65, viper-interceptor true. `auto_ai` is true on 25 and absent on the three viper variants (Oolite's default is YES: `ShipEntity.m:6915`, `oo_fuzzyBooleanForKey:@"auto_ai" defaultValue:YES`). `scan_class` is authored only by the three viper variants (`CLASS_POLICE`).

## 2. Converter, schema, pipeline and test change list (DATA-17)

### 2.1 Fields to compile (all behind `NpcShipSchema`, which is a `z.strictObject`)
Recommended new record fields (names are proposals, `[ASSUMED]`): `bounty` (uint, default 0, `ShipEntity.m:559`), `autoAi` (probability 0..1, default 1.0, mirrors how `fragmentChance` stores a fuzzy boolean as a float32 probability), `autoWeapons` (probability, default 0, `ShipEntity.m:6925`), `hasScoop` and `hasFuelInjection` (probabilities, default 0, `ShipEntity.m:338`, `:361`), `fuel` (uint16 default 0, `ShipEntity.m:555` reads `oo_unsignedShortForKey:@"fuel"`), `scoopPosition` (vector, `ShipEntity.m:483`), `countsAsKill` (bool default true, `ShipEntity.m:1529`), `escorts` (uint8 default 0, capped at `MAX_ESCORTS` 16, `ShipEntity.m:680`), `escortRoles` (array of `{min,max,role}` or null, `ShipEntity.m:1543, 1621`), `missiles` and `maxMissiles` (recorded only; the missiles/ECM todo wants a guard that fails when a compiled record with missiles reaches an AI), and `aiMapRole`-independent `aiType` stays as authored. Probability suffixes in `roles` are already kept verbatim.

Fuzzy booleans are rolled per ship at spawn in Oolite (`oo_fuzzyBooleanForKey` -> a `randf()` comparison). Store the probability in the record and roll at spawn from a stateless fork (see 4.3 and Assumption A5); do not roll at compile time.

### 2.2 Converter and pipeline edits (each verified to exist)
- `tools/oolite-ingest/convert/npc-ships.ts:240-247` `STEERING_ASSUMED_ABSENT_KEYS` quotes `"aft_weapon_type"`: drop only that entry (keep the other five as tripwires). `facingWeapon` already maps the aft key (`:337`), so no new mapping is needed.
- `NPC_SHIP_KEYS` (`npc-ships.ts:62-72`) becomes the code-unit-sorted 28 keys plus `shuttle`; `generate.ts:92` and `:198` consume it (`computeShipRadii(NPC_SHIP_KEYS, ...)`); `ship-hulls.ts:48` builds `HULL_SHIP_KEYS = [PLAYER_HULL_KEY, ...NPC_SHIP_KEYS]` from it.
- `tools/oolite-ingest/convert/ships.ts:55` `VENDORED_MODEL_FILES` needs the 9 new `.dat` names.
- **Hyphen bug (verified):** `convert/glb.ts:151` is `const SHIP_MODEL_PATTERN = /^oolite_([a-z0-9_]+)\.dat$/;` and `src/content/schemas/ship-npc.ts:69` is `model: z.string().regex(/^oolite_[a-z0-9_]+\.dat$/),`. The model `oolite_boa-mk2.dat` contains a hyphen, so both fail the build. Widen both to allow `-`. `NPC_GLB_PATH_PATTERN` (`src/content/npc-glb-path.ts:9`: `/^models\/[a-z0-9][a-z0-9_-]*\.glb$/`) already allows it but is **lower-case only**: a per-record GLB named after the key `morayMED` fails it, so the naming rule for per-record GLBs must lower-case (e.g. `moraymed.glb`) or the pattern must widen.
- `convert/glb.ts` `EMITTED_ENTRIES`, `MODEL_SOURCE_FILES`, `NPC_SHIP_GLBS` are explicit row tables "never inferred from the catalogue" (`:79-148`); `npc-ships.ts:480-496` (`owners.length !== 1` at `:485`) fails unless a record owns its GLB alone (`owners.length !== 1 || owners[0] !== key`). Under the recommended **one GLB per record** each of the 20 new records gets its own row; under one-GLB-per-model the `owners.length !== 1` rule has to change. The existing `cobra3.glb` row is owned by `cobra3-player`: per-record GLBs give the three cobra3 NPC variants their own files, while per-model GLBs would make them share `cobra3.glb`, which that owners rule forbids today.
- Hull octrees: `ship-hull.ts` caps (`MAX_HULLS = 16` at `:39`, `MAX_HULL_ARTIFACT_BYTES = 200_000` at `:47`) are below the new need (30 hull records per key, the player's Cobra plus 29 NPC keys; 19 to 20 per model). Both are schema constants to raise deliberately (`MAX_HULL_NODES = 16_384` at `:36` is per-hull and fine: measured octrees are small).
- Generated outputs that regenerate: `src/content/generated/ships-npc.json`, `ships-hulls.json`, `texture-encodings.json`, `manifest.json`, `public/models/*.glb`, `public/textures/*`; goldens `tests/golden/content/ships-npc.json`, `ships-hulls.json`.

### 2.3 Tests that hard-code the nine (must be updated, not worked around)
`tests/e2e/budget.spec.ts` (`expect(npc.glbs, ...).toHaveLength(9)` and `expect(npc.textures, ...).toHaveLength(43)`), `tests/e2e/npc-assets.spec.ts:126` (`"NPC model count").toHaveLength(9)`), `tests/content/ships-npc.test.ts`, `tests/content/ships-hulls.test.ts`, `tools/oolite-ingest/convert/npc-ships.test.ts`, `glb.test.ts`, `ship-mass.test.ts`, `ship-radius.test.ts`, `textures.test.ts`, `tests/sim/world/populate.test.ts` (via `laveInertRecords()` reading every record), `tests/helpers/{inert-world,traffic-fixture,npc-flight,npc-weapons,flyer-records,tick-script,debris-fixture}.ts` (about 35 test files read `ships-npc.json` directly). Give the helpers the explicit nine-key whitelist rather than reading "any record of role X".

### 2.4 Compiled tables
- `autoAImap.plist` (`[VERIFIED: third_party/oolite/Config/autoAImap.plist, identical to the checkout copy]`): 27 role -> AI-file entries, e.g. `"pirate" = "oolite-pirateAI.js"`, `"trader" = "oolite-traderAI.js"`, `"interceptor"`/`"police"`/`"wingman" = "oolite-policeAI.js"`, `"hunter" = "oolite-bountyHunterAI.js"`, `"hunter-medium"`/`"hunter-heavy" = "oolite-bountyHunterLeaderAI.js"`, `"escort" = "oolite-escortAI.js"`, `"pirate-interceptor"` = `oolite-pirateInterceptorAI.js`, the three `pirate-*-freighter` = `oolite-pirateFreighterAI.js`. The AI is chosen by the requested **role**, not the record's `ai_type` (`Universe.m:3638-3643`; a Cobra Mk I requested as `pirate` gets the pirate AI although its record says `oolite-traderAI.js`). Compile the whole file (27 keys is tiny) as a strict `Record<string,string>`-shaped array with a test pinning equality to the plist.
- `role-categories.plist` (`[VERIFIED]` identical to the checkout): about 16 named lists (`oolite-pirate-victim`, `oolite-bounty-hunter`, `oolite-pirate-enemy`, `oolite-pirate`, `oolite-pirate-leader`, `oolite-trader`, `oolite-courier`, `oolite-shuttle`, `oolite-assassin`, `oolite-escort`, `oolite-scavenger`, `oolite-police-like`, `oolite-police-dislike`, `oolite-trader-dislike`, `oolite-smuggler-dislike`, ...). Compile whole; entries contain `+` and uppercase (`trader-courier+`, `EQ_THARGON`), so the schema string pattern must allow them.
- **Comms strings are two sources.** `descriptions.plist` holds 10 keys named `oolite-comms-*` (`contractAttack`, `makePirateDemand`, `acceptPirateDemand`, `surrender`, `makeDistressCall`, `markForFines`, `distressResponseAggressor`, `offenceDetected`, `thanksForHelp`, `police-thanksForHelp`; lines 652-673) that expand through `[beg-for-mercy]`, `[distress-call]`, `[police-attack-warning]`, `[describe-pirate]`, `[describe-Pirate]` and `%H`/`%R`-style tokens; the role-to-key wiring (`generic`/`trader`/`police`/`pirate`/`assassin`) is a literal table in `oolite-priorityai.js:6681-6715` (`_setCommunications`), **not** in `descriptions.plist`. The minimum subset: the 10 keys, their transitive `[...]` references, and the five-role key table above (about 12 wiring entries). Expansion stays in the UI (research default: comms text never expands inside the sim).

## 3. Vendoring and asset volume (DATA-18)

`[VERIFIED: vendor-oolite.sh `FILES` list; checkout `Resources/{Models,Textures}`]`
- New `.dat` (9): `anaconda 256,563 B`, `asp 110,537`, `boa-mk2 210,783`, `boa 178,549`, `ferdelance 89,449`, `python 139,250`, `python_trader 194,872`, `sidewinder_escort 107,894`, `viper_interceptor 109,472`.
- New textures referenced by the 28 records' `materials` and absent from `third_party/oolite/Textures`: **51 PNGs, 56,967,800 bytes** (about 57 MB; the vendored textures today total 61 MB on disk). Variants bring their own maps (`oolite_cobra3_diffuse_pirate.png`, `_alt`, `oolite_cobramk1_diffuse_alt.png`, `oolite_mamba_diffuse_escort.png`, `oolite_moray_diffuse_med.png`, `oolite_python_diffuse_blackdog.png`, `..._trader`, `oolite_sidewinder_*_escort.png`, `oolite_viper_diffuse_pursuit.png`, `oolite_viper_interceptor_{diffuse,normal}.png`, plus the per-model `diffuse/normal/specular/subents(_normal,_specular)` sets).
- Generated side: today `public/textures` is 59 WebP files (18.7 MB) plus 17 baked `_emissive.png` (1.0 MB); expect about +16 MB of WebP (`[ASSUMED]` from the 317 KB average) and 20 new GLBs under one-GLB-per-record (about 2.4 MB at the existing 820 KB per 9 GLBs; 9 of them are new models, 11 are variants). `.git` is 105 MB today; this phase adds roughly 70-75 MB. **Owner-visible consequence; no decision needed, but record it in the plan.**
- Procedure (do not hand-edit): on the host `sh scripts/vendor-oolite.sh --export-pin /home/opencode/git/oolite <out-dir-outside-repo>`; then `docker compose run --rm -v <out-dir>:/oolite-pin:ro -e OOLITE_LOCAL=/oolite-pin/Resources -e OOLITE_PINNED_SHA256=/oolite-pin/pinned.sha256 assets sh scripts/vendor-oolite.sh`; then `docker compose run --rm lint npx prettier --write ASSETS.md`. The script refuses a vendored path with no `ASSETS.md` row, so the rows (both `third_party/oolite/...` inputs and the generated `public/models`/`public/textures` outputs) are added first. `tests/compliance-assets.test.ts` cross-checks filesystem, `ASSETS.md` and `CHECKSUMS.sha256`.
- **Checkout drift (verified):** `/home/opencode/git/oolite` HEAD is `21978c37b`, a descendant of the pin `7437f22` (`git merge-base --is-ancestor` true). Within the paths this phase reads only `Resources/Config/descriptions.plist` differs (+46 lines; `cmp` of the vendored copy against the checkout fails at byte 29168). `autoAImap.plist` and `role-categories.plist` are byte-identical. `--export-pin` exports the pinned blobs (never the working tree), so vendoring is safe; but **read Oolite behaviour for descriptions from the vendored copy or `git show 7437f22:...`**, and note `ShipEntity.m` is unchanged since the pin.

## 4. The one v5 field set (FOUND-20)

### 4.1 Mechanism (verified in code)
- Hash: `serializeEntity` (`serialize.ts:135-175`) builds the always-present segments through `steer:`, then appends the optional `vel:`, `wpn:`, `cargo:` only when non-pristine (`if (entity.cargo !== 0) segments.push(...)`). New per-entity segments append after `cargo:` in a fixed order. World-level pristine-omit lines are printed in `hashWorld` (`serialize.ts:268-292`) after the world section and the `staticHealth:`/`buoys:` lines and before the combat line, **including for a never-spawned world**; new `groups:`, `repop:`, `station:` lines follow the same rule, in that order after `buoys:`. The combat line prints only while `!isPristineCombat(combat)` (`state.ts:82`), so `PlayerStanding` extends `isPristineCombat`, `serializeCombat`, `sanitizeCombat`, and must be left untouched by `dockReset`/`launchReset`.
- Snapshot: `WORLD_SNAPSHOT_VERSION = 4;` (`snapshot.ts:99`); the parser is strict (`asObject` with an allow-list; unknown key refuses). `snapshotEntity` writes every v4 field unconditionally; optional world keys (`buoys`) are omitted when pristine. Follow the same split: new **entity** fields always present in the snapshot, new **world** records (`groups`, `populator`, `station`) optional and omitted when pristine. Version refusal tests to update: `tests/sim/world/snapshot-codec.test.ts:276` (`["version 5", set("version", 5), "version"]` becomes a version-6 refusal) and `:999-1001` (`expect(snapshot.version).toBe(4)`).
- Repair/totality: `sanitizeEntity` -> `cleanV4Fields` (`sanitize.ts:582`) is the template for a `cleanV5Fields`; `spawnEntity` needs `isMalformedInit` and `domainRefusal` branches for each new optional `SpawnInit` field (`world.ts:406-505`), and `SpawnInit`/`Entity` (`entity.ts`) the new members. All limits live in `limits.ts` only.
- Proof pattern (Phase 14/15 precedent, `PROJECT.md` rows at lines 303 and 309): **strip-and-rehash**: a v5 world that sets nothing new hashes identically to v4 (every golden, `flight-hash-pins.json`, `inert-lave-epoch1.json` unmoved); a world that sets each field prints exactly that segment, and stripping the segment reproduces the v4 text.

### 4.2 Proposed field set and bounds (all `[ASSUMED]` proposals unless a verbatim source is shown; bounds are format bounds that only keep corrupt values out of the hash)

| Field | Type / bound | Pristine | Hash segment | Basis |
|-------|-------------|----------|--------------|-------|
| `Entity.bounty` | uint, `MAX_BOUNTY` = 65535 | 0 | `;bty:n` | Oolite `OOCreditsQuantity` (`ShipEntity.h:289`); legal marks OR to <= 127 (`markAsOffender` 7/15/63/64); populator caps at 2 x cargo capacity (`oolite-populator.js:1541-1544`) |
| `Entity.role` | string, `MAX_ROLE_LENGTH` = 32, "" none | "" | `;role:"..."` | longest in-scope role is 24 chars (`police-witchpoint-patrol`); the AI branches on `primaryRole` (`"trader-smuggler"`, `"police-station-patrol"`) |
| `Entity.groupId` | uint32, 0 none | 0 | `;grp:n` | recommend group id = founding leader's entity id (no counter state) |
| `Entity.cargoKind` | closed index 0..7 into `CARGO_KINDS` | 0 | `;ck:n` | Oolite `OOCargoFlag`, `OOTypes.h:100-108`: `CARGO_FLAG_NONE = 400`, `FULL_PLENTIFUL = 501`, `FULL_SCARCE = 502`, `FULL_MEDICAL = 503`, `FULL_CONTRABAND = 504`, `PIRATE = 505`, `FULL_UNIFORM = 510`, `CANISTERS = 600`, `FULL_PASSENGERS = 700`; Wegolite stores a compact index (drop `CANISTERS`, never set by the populator) |
| `Entity.podCommodity` | commodity key string (<= 128), "" none | "" | `;pod:key,amount` when either is set | the event `cargoScooped` already carries `commodity: string` (`events.ts`); a key survives catalogue reordering, an index would not |
| `Entity.podAmount` | uint, `MAX_POD_AMOUNT` = 255 | 0 | (same segment) | Oolite's largest `getRandomAmountOfCommodity` result is 34 (grams: 4 + 15 + 10 + 5, `Universe.m:3990-3994`) |
| per-facing weapon temperature | `aft`, `port`, `starboard` temperatures each 0..`MAX_WEAPON_TEMPERATURE` (1e3, `limits.ts:133`) | 0 | `;wpf:aft,port,starboard` | Oolite keeps `forward_weapon_temp`, `aft_weapon_temp`, `port_weapon_temp`, `starboard_weapon_temp` (`ShipEntity.m:9930-9990`); `shot_time` is **one** timer, so `lastShotTick`/`missedShots` stay single |
| per-facing weapon type | `fore/aft/port/starboard`: mount key or null (null = the record's type) | all null | `;wty:...` | `oolite-populator.js:2217-2272` (`_setWeapons`) **assigns** forward and aft weapons per ship by tech level and may set `aftWeapon = null` on a hull that authors one, so the type is per-entity state |
| fuel injection | `injector: { fuel: uint 0..65535, accumulator: 0..1 } \| null` (null = none) | null | `;inj:fuel,acc` | `fuel` is `oo_unsignedShortForKey` (`ShipEntity.m:555`); `fuel_accumulator` starts at 1.0 (`:557`) and burns `delta_t * afterburner_rate` (0.25) per second while the afterburner runs (`:5845-5852`); `hasFuelInjection` is an equipment roll at setup (`:361`) |
| `World.groups` | `{ id, leader }[]`, ascending id, `MAX_WORLD_GROUPS` = 128 | `[]` | `groups:id,leader;...` | leader reappointment is data; membership is derived by scanning `groupId` |
| `World.populator` | `{ nextTick: uint32, rolls: uint32 }` | `{0,0}` | `repop:next,rolls` | repopulation clock + stateless-fork counter |
| `World.station` | `{ alert: 0..3, launched: uint 0..255, marks: EntityId[] <= MAX_STATION_MARKS (32) }` | green, 0, `[]` | `station:...` | Oolite `ALERT_CONDITION_DOCKED = 0, GREEN = 1, YELLOW = 2, RED = 3` (`ShipEntity.h:169-172`), `STATION_MAX_POLICE 8` (`StationEntity.h:41`); `being_fined` is per-ship in Oolite (`ShipEntity.m:253`, `12429-12439`) but D2 puts the marks in the station record |
| `PlayerCombatState.standing` | `{ bounty: 0..MAX_BOUNTY, kills: uint32 }` | `{0,0}` | appended `|std:bounty,kills` to the combat line when non-pristine | legal status and tally must be hashed and AI-readable in-tick; save v6 (Phase 24) adds only `legalStatus`, `shipKills` |

The priority-AI state needs **no** new hashed container. `AiComponent.params` already snapshots any key set within `MAX_AI_PARAMS_KEYS = 32` (`limits.ts:33`), arrays <= `MAX_SNAPSHOT_PARAM_LENGTH = 64` (`:30`) and strings <= `MAX_SNAPSHOT_STRING_LENGTH = 128` (`:27`); the parser's only closed vocabulary here is `AI_KEYS` (`ai/types.ts:19`: `export const AI_KEYS = ["test-pilot", "flight-script"] as const;`). So "the snapshot accepts Phase 23's state without a second bump" is satisfied by (a) adding `"priority"` to `AI_KEYS`, (b) keeping Phase 23's state inside the three limits, and (c) a unit test that pins the closed key list at or below 32.

### 4.3 What stays derived, never stored
`hasScoop` (and `hasFuelInjection`'s *has* bit) are rolled from stateless forks keyed `(worldSeed, entityId, purpose)`; groups are scanned from `groupId`; `being_fined` and `cargo_flag` effects come from `World.station.marks` and `cargoKind` (superseded for `being_fined` by the resolution of Open Question 7: it is the per-entity v5 field `markedForFines`, plan 21-03). Register the whole milestone's stateless purposes now in `rng.ts` (`RngPurpose`, `RNG_PURPOSE_CODES`: today `world 1, ai 2, combat 3, cargo 4, damage 5`; add `pod 6`, and optionally reserve `scoop 7`, `repop 8`, `inj 9` so later phases only add call sites). Codes are one-way: never renumber (`rng.ts:86-91`).

### 4.4 Priority-AI state key budget (roadmap: "about 24 under the 32-key limit")
`.planning/research/ARCHITECTURE.md` section 4.2 lists 26 keys: `tree, beh, hs, fire, tgtAlt, def, stn, pln, dock, dockPos, wpgen, wp, wpi, lead, cdm, cdd, cdp, cdmet, cs, ch, cr, cp, wsEntry, wsDest, lastOdds, notePlayerRole`. Cross-check against Oolite: `oolite-priorityai.js` writes **27 distinct persisted `oolite_*` parameters** via `setParameter` (`[VERIFIED: rg over oolite-priorityai.js]`): `waypointRange`, `waypoint`, `waypoints`, `witchspaceDestination`, `witchspaceWormhole`, `witchspaceEntry`, `selectedStation`, `dockingStation`, `selectedPlanet`, `scanResultSpecific`, `scanResults`, `rememberedTarget`, `lastFleeing`, `lastAssist`, `distressTimestamp`, `distressSender`, `distressAggressor`, `cargoDropped`, `cascadeDetected`, `groupPower`, `internal_ecmtimer`, `playerFriendlyFireAlready`, `pirateLurk`, `lastPirateVictim`, `interceptTarget`, `interceptCoordinates`, `flag_launchAdjustMissile`. ARCHITECTURE's 26 omit the distress trio, `lastFleeing`, `lastAssist`, `pirateLurk`, `lastPirateVictim`, `interceptTarget/Coordinates`, `cascadeDetected`. Adding them one by one exceeds 32. **Pack related values into flat numeric arrays** (for example `dist: [sender, aggressor, tick]`, `icpt: [target, x, y, z]`, `ts: [lastFleeing, lastAssist, lastPirateVictim]`), then pin the final key list with a unit test that fails above `MAX_AI_PARAMS_KEYS`. The ECM timer and `flag_launchAdjustMissile` are out of scope (ECM and missiles deferred).
`AI_EVENT_NAMES` (23 names today, `ai/types.ts:55-79`) lacks, relative to `responsesAddStandard`/`Docking`/`Escort`/`Scooping` (`oolite-priorityai.js:4888-4960`): `approachingPlanetSurface`, `cargoDumpedNearby`, `commsMessageReceived`, `escortAccepted`, `shipAcceptedEscort`, `shipAttackerDistracted`, `shipWillEnterWormhole`, `wormholeSuggested`, `playerWillEnterWitchspace`, `shipWitchspaceBlocked`, `stationWithdrewDockingClearance`, `escortDock`, `shipScoopedFuel`. Oolite's `shipBeingAttacked` is Wegolite's existing `shipAttacked` (used by `tests/sim/world/step.test.ts`): add names additively, do not rename. A `"priority"` entry in `AI_KEYS` forces an `AI_REGISTRY` entry (`registry.ts` is `Record<AiKey, AiModule>`): register an inert stub (no `onEvent`: the guard `tests/guards/on-event-handlers.test.ts:29` is `const MAX_ON_EVENT_HANDLERS = 1;` and `flight-script` already uses it) and a guard that nothing spawns with `aiKey: "priority"` before Phase 23. The AI lint zone forbids importing `world/limits` (allow-list: AI siblings, `math`, `world/ids|view|control`), so the 32-key test imports both sides from `tests/`.

## 5. Inert-world isolation and the epoch 1-20 pin (first plan)

**Why it must come first (verified):** `planInertPopulation` (`populate.ts:225-259`) filters records by scan class then `pickRecord(rng, eligible, entry.role)` walks the records in the order given with weights parsed from each record's `roles` tokens. `trafficContent` (`traffic.ts`) hands it **every** catalogue record, and ~35 tests/helpers read the committed JSON wholesale. The moment `ships-npc.json` holds 29 records, `trader`, `pirate`, `hunter` and `police` draws change their weighted target, the inert goldens move, and the frozen acceptance analysis (`thresholds.ts`: "trader slots (101 to 103) the Adder, Moray or Cobra Mk I"; "the only two records with the `scavenger` role") is evaluated on a different experiment.

**Recommended mechanism:** export a frozen `INERT_RECORD_KEYS = ["adder","cobramk1","gecko","krait","mamba","moray","shuttle","sidewinder","viper"]` from `populate.ts`; `planInertPopulation` first reduces `records` to those keys **in `INERT_RECORD_KEYS` order** (the original catalogue order: code-unit sorted), before the scan-class filter and before any draw. `populateInertWorld`, `INERT_POPULATION` and `createInertPopulate` otherwise stay as they are, so every caller (session, Node replay, tests) is protected and the roadmap's "read an explicit list of the nine existing record keys" holds. The nine records' own fields that the inert path reads (`roles`, `scanClass`, `radius`, `maxEnergy`, `energyRechargeRate`, `likelyCargo`, `maxCargo`) must not change when the converter widens (verify with a test comparing the nine against the Phase-20 golden values). Pin it with a test that fails if the filtered list differs from the nine.

**Measured baseline (this session, HEAD `9736e01b`, clean tree, run in the `test` container with `npx tsx`):** `laveInertWorld(epoch)` over the committed records, `fnv1a32(serializeWorldSection(world))` and `hashWorld(initFlightState(layout), world)`; the epoch-1 section fnv `ff6489bf` equals the committed golden (`tests/golden/world/inert-lave-epoch1.json`), which validates the method. All worlds hold 12 ships.

| epoch | worldSeed | section fnv | hashWorld fnv |
|------|-----------|-------------|---------------|
| 1 | 726532988 | ff6489bf | c5949d60 |
| 2 | 2358620270 | 0ef67b3a | e7e2eb3f |
| 3 | 1658048036 | 6e6d4311 | 7bb70d62 |
| 4 | 2874323896 | 3f81e315 | 8d5324ba |
| 5 | 2362479205 | d3d5b910 | b94703ad |
| 6 | 365507317 | 4a3e09e1 | d3176e9a |
| 7 | 15436524 | d1db14c9 | cce0f3de |
| 8 | 2944482225 | f72a4849 | 31b4648a |
| 9 | 3470242674 | f03e216e | 800ac33b |
| 10 | 2667883293 | 8e0e6386 | bbfc696f |
| 11 | 3655716072 | 88586be9 | f489cb02 |
| 12 | 2662853381 | b8a7ba66 | 87d3ca7b |
| 13 | 2149423861 | d930ee18 | 2f3713af |
| 14 | 2138280794 | 6ec0d08b | 9c988798 |
| 15 | 2607074892 | dcba3d46 | ab365617 |
| 16 | 20192838 | 503d539e | 2b5da771 |
| 17 | 2079961999 | 0c4585ca | ac9ba941 |
| 18 | 312477038 | 969b7225 | fbc35b7c |
| 19 | 3161095431 | b4c8645b | 2db8a23a |
| 20 | 2529836020 | 31186a2b | aaeb9e80 |

The executor must **re-measure on its own base commit** and commit the golden (`tests/golden/world/inert-lave-epochs-1-20.json`, both fnv columns, plus a test) *before* the isolation change, then show it green after. `hashWorld` must be in the pin (not only the section) so a stray new world-level line (`groups:`, `repop:`, `station:`) printed outside the section would also fail. This pin is one of the three items D-04 reserves for the owner: it never re-pins.

## 6. Pod identity, debris velocity and the one re-pin (CBT-11 clause, D-01..D-03)

- **Current draw order (verified, `debris.ts:897-1035`):** one local copy of the victim's `combat` stream: `canFragment` (1 draw), per capsule one survival draw and 13 per survivor (`POD_DRAWS_PER_SURVIVOR = 13`: box 3, jitter 3, kick 3, quaternion 4), wreckage, plates (13 each), then the blast. `scatter()` returns `velocity = kick + drift` where `drift = vecOrZero(victim.velocity)`; the module comment states pods use "the victim's drift `velocity`, never its flight `speed` (D-01)" (this is Phase 16's D-01, superseded by this phase's D-01).
- **D-01 implementation:** replace `drift` with the victim's total velocity: `drift + rotate(orientation, LOCAL_FORWARD) * speed` (Wegolite local forward is `-Z`; `behaviours/attack.ts` already has `velocityOf(orientation, speed)` for exactly `forward x flightSpeed`, and `ShipEntity.m:11158-11166` is `thrustVector = vector_multiply_scalar(v_forward, flightSpeed)` and `velocity = vector_add([super velocity], [self thrustVector])`). Apply to pods, plates **and wrecks** (wreck velocity is `drift + normal * pushSpeed`) and clamp with the existing `clampDebrisVelocity`. Add the guard test "debris velocity equals ship velocity plus kick" (the todo asks for it).
- **Which pins move:** the twin spawns are `spawnTestShooter` ships with `speed: 0` (`test-spawn.ts:108`), so D-01 alone moves **nothing** there; flyers spawned by `spawnTestFlyers` start at their compiled max speed (`:311`) and would move only if a twin kills one. What does move the twins is the pod identity (below). Measure which of `tick-parity.test.ts:840` (`const HASH_60_AFTER_KILL = "f6927215";`), `:1165` (`const DAMAGE_HASH_60_AFTER_KILL = "5028fc8f";`), `combat.spec.ts:101` (`const TWIN_HASH_60_AFTER_KILL = "f6927215";`), `:116` (`const TWIN_DAMAGE_HASH_60_AFTER_KILL = "5028fc8f";`), `tests/app/session/death-twin.test.ts`, `tests/sim/world/debris*.test.ts` and the debris cadence tests actually move; record the cause per pin. The damage twin's pods are 0 (`TWIN_DAMAGE_DEBRIS_AT_KILL = { pods: 0, plates: 0, wrecks: 1 }`) so it may not move at all.
- **Pod identity draw (the "own forked stream"):** add `"pod"` to `RngPurpose`/`RNG_PURPOSE_CODES` and derive `createRngState(forkSeed(world.worldSeed, victim.id, "pod"))` inside `releaseDebris`; the victim's `combat` stream order (and therefore every position/orientation/kick draw and the wreck draws after the pods) is unchanged, which is what keeps the move to "one re-pin". Port Oolite's per-capsule rule in distribution (`ShipEntity.m:7323-7373`, `Universe.m:3894-3955` `getContainersOfGoods`, `3977-3996` `getRandomAmountOfCommodity`): commodity per capsule in index order from the cargo-kind weights (plentiful: `quantity` clipped to 64 then `q*100/64`; scarce: `64 - q`; legal restricts export-legal goods with `q &= 1`; contraband allows illegal), then amounts for survivors only: tonnes 1; kilograms `1 + (Ranrot % 6) x3`; grams `4 + %16 + %11 + %6`. `getRandomAmountOfCommodity` units come from `commodities.json` (`unit: "t" | "kg" | "g"`, `legalityExport`). The count is statistically, not stream-equal, to Oolite (same standard as `cargoCountAtSpawn`).
- **Gap to decide (Open Question 1):** the inert ships and the `?test=1` hook ships have `cargo > 0` and `cargoKind = 0`. If kind 0 means "anonymous pod" the twins do not move in Phase 21 and the pod draw first shows up in Phase 22, contradicting roadmap success criterion 4 and the roadmap line "the loot phase moves no debris golden". Recommended: treat `cargoKind` 0 with `cargo > 0` as `fullPlentiful` (Oolite's trader default) for the pod draw, with a `FIDELITY.md` row; then the kill twin moves once, which D-04 sanctions.
- **Content the draw needs (`DebrisContext`):** a goods table (key, unit, `legalityExport`) and the system market quantities at the time of the draw. Market quantities exist (`src/sim/economy/market.ts`: `MarketGood`, `generateMarket`, `arrivalMarketSeed`); use the system's *generated* quantities (a pure function of the seed), not the live player-modified market, so the draw stays a pure function of `(worldSeed, victimId, table)` `[ASSUMED]`.
- **D-02 (render-only):** `shipDestroyed` (`events.ts:156-163`) gains a `velocity` field; `killPlayer` (`combat/death.ts`, `playerDestroyed` event) likewise. `render/bodies/explosions.ts` offsets each burst centre by `velocity x t`, 1x small, 0.85x big (`OOParticleSystem.m:274` `velocity:[entity velocity]` and `:324` `vector_multiply_scalar([entity velocity], 0.85)`, both verified). `killer` is a guarded word (`tests/guards/kill-credit-consumers.test.ts`): only `kill.ts`, `ledger.ts`, `combat/step.ts` and `events.ts` may name it.
- **FIDELITY:** FIDELITY.md rows E-173 (heading at line ~2882; table row at line 203) and E-179 (heading ~2994; table row ~211) both cite "the absent velocity drift" / the burst recession and must be updated; the debris and pod rows need new rows. `CHANGELOG.md [Unreleased] Changed`: debris and explosions now travel with the ship.

## 7. The seams (no ordinary-play consumer)

### 7.1 `retireShip`
Sibling of `killShip` (`world/kill.ts`): `retireShip(world, id, reason)` marks dead through `world.store.kill`, posts **no** `shipDestroyed`, releases **no** debris, credits no kill, posts `shipTargetLost` to holders (reuse the `notifyKill` loop minus the killer pair), is idempotent and total (missing/dead/non-ship id returns false); the normal commit emits `entityRemoved`. Avoid the identifier `killer` in the new file (guard). `reason` (`docked | jumped | landed | expired`) is test/telemetry only, never hashed. A guard: no non-kill departure may call `killShip`. `world.ts:688` `killEntity` stays a test-only primitive. Tests: no event of kind `shipDestroyed`, entity count and `nextId` unchanged except the removal, no debris spawned, targeters notified, second call returns false.

### 7.2 Ledger hit-reaction stage
`applyLedger` (`ledger.ts`) applies every record before lethality (module comment: "a ship already doomed by an earlier record of the same tick still receives `shipHit`"). Add a stage that consumes the **applied record** (not the `shipHit` event) and returns plain data per laser hit: `{ victim, aggressor, kind, lethal, energyRemaining }` in ledger order, including the lethal hit and excluding scrape records (collisions: `takeScrapeDamage` is not an offence, `ShipEntity.m:11640-11667`). Order of Oolite's `takeEnergyDamage` (`:11418-11590`): aggressor/found-target and `broadcastHitByLaserFrom` for every laser hit before the energy check; the `noteTakingDamage` evasive draw; `respondToAttackFrom` only if energy remains. Recommendation (Claude's discretion): **do not make this the first `shipHit` consumer.** Keep `shipHit` untouched so `tests/guards/ship-hit-consumers.test.ts` (it allows `shipHit` only in `events.ts` and `ledger.ts`) and the doomed-target todo stay parked for the audio/flash consumer. The stage posts **no AI event in this phase** (flight-script test flyers would otherwise receive new events and could change the frozen acceptance behaviour): it returns the list from `resolveShots`'s internals and is pinned by unit tests; Phases 23/25 add the posting, the `noteTakingDamage` draw (on the hit ship's stream) and `offence.ts` (`broadcastHitByLaserFrom`, `ShipEntity.m:12280-12310`, bounty-0 precondition at `:12284`). Test: a clean ship killed by two shots in one tick yields one `shipDestroyed`, both reaction records, and the lethal record flagged `lethal`.

### 7.3 Per-facing weapon state and the fire gate's aft branch
Verified shape facts: `WeaponComponent` is `{ temperature, lastShotTick, missedShots }` and its comment says lifting the refusal "needs per-facing temperatures and is a snapshot-format change" (`entity.ts:34-55`); `drainFireQueue` (`combat/step.ts:291`) reads `shooter.weapon.temperature`, the one `npcWeapons` row per spec key (`NpcWeapon { laser, offset }`, forward only, `aim.ts`), and `npcLaserRay` hardcodes `laserFrame(entity.orientation, "fore")`; `laserFrame(orientation, facing)` and `Facing` already support aft/port/starboard for the player (`aim.ts:63`, `laserFrame`); `world.fireQueue` is `EntityId[]` and is never hashed, so its shape can change freely (`requestFire(world, id)` -> `(world, id, facing)`); `ShipControl.fire(id)` is the actor-only seam. Oolite: `fireWeapon:direction:range:` reads the facing's own temperature (`ShipEntity.m:9921-9993`), the cutout test is `weapon_temp / NPC_MAX_WEAPON_TEMP >= WEAPON_COOLING_CUTOUT`, `onTarget:` (`:9851-9909`) flips `dq` to `-dot(urp, v_forward)` for aft, heat is added to the facing's own temperature (inside the same function, `:9933-9993`), and `shot_time` is a single timer reset by `resetShotTime` (`:10463`).
Shape for Phase 21: (a) `WeaponComponent` gains the per-facing temperatures (4.2); (b) `NpcWeapon` becomes a per-facing record (`fore/aft/port/starboard`, each `{laser, offset}` or none), compiled from the existing `aftWeapon`/`aftWeaponPosition` fields (already in the schema since Phase 15); (c) the fire queue carries a facing, and `drainFireQueue` selects temperature, ray (`npcLaserRay(entity, weapon, facing)`) and `onTarget` sign by facing; the heat write and cooling (`coolShips`, `combat/step.ts:409`) cover all four temperatures; (d) forward-only behaviour is byte-identical (a pristine aft temperature prints nothing). Aft firing by an AI is Phase 23.
**The coupled cut to keep honest:** `behaviours/attack.ts` documents "aft, port and starboard weapons are none for every compiled record ... RUNNING_DEFENSE (4131-4133, 4174-4176) and ATTACK_BROADSIDE (4134-4136, 4171-4173) are never selected". Six of the 28 hulls have an aft weapon, so Phase 21 must add a tripwire guard: a compiled record with a non-none aft/port/starboard weapon must not reach `behaviourAttackTarget` until Phase 23 ports those branches (same device as the missiles guard). `NpcFlightStats` (`npc/stats.ts:32-60`) carries only `forwardWeapon`; extend it with the aft type so the guard and Phase 23 can read it.

### 7.4 `WorldView` / `ShipControl` widening
`ARCHITECTURE.md` section 3.2 lists the proposed members. Both interfaces are pinned by exhaustive `Record<keyof ..., true>` tests (`tests/sim/world/view.test.ts`, `control.test.ts`) and the research warns of "Pitfall 19: a method is added only when a later phase needs it". Recommendation: widen **read** members that expose the new hashed fields (`ShipView` gains `bounty`, `groupId`, `role`, `energy`, `maxEnergy`, `cargo`, `accuracy`, `escortSlot`, `ownerId`; `WorldView.playerStanding()`, `groupLeader(id)`), and add a `ShipControl` write method only when it writes state that exists after this phase and has a total, domain-checked implementation plus a pin test. Everything else waits for Phase 23's first consumer. This is a judgement call for the plan (Open Question 5).

## 8. Draw calls, prefetch and first-load (QUAL-09, D-05, D-07)

### 8.1 Baseline and worst case (verified numbers)
`docs/PERFORMANCE.md`: Lave in flight 10 calls (traffic off), traffic on with 12 inert ships 17 calls (the NPC layer added 8 over 9), after a kill with debris and explosion live 21 calls. The NPC layer is one `InstancedMesh` per (model, primitive) (`render/bodies/npc-ships.ts:6-12`) with `frustumCulled = false`, so a present type always costs its calls. Over the 28 records, **54 primitives** (55 with `shuttle`) (counted from each record's `materials` keys; one primitive per material: Hull/Engine/Gun, e.g. anaconda 3, viper 2, adder 1; existing GLBs confirm 1:1: `adder.glb` 1 primitive/1 material, `moray.glb` 2/2). Debris adds at most 7 (seven stock debris models), explosions at most 2. **Worst case with all 28 keys present: about 10 + 54 + 7 + 2 = 73 calls** (plus the laser-shot layer, not measured here) `[ASSUMED]` arithmetic. This is inside D-05's 80-call allowance, so even with no build-time fix a full anarchy fits, *if* p95 frame time holds on the remote GPU. A typical anarchy (about 15 distinct types) is estimated at 45-55 calls; the spike turns that estimate into a number.
**Merging caveat (cited):** `BufferGeometry.groups` are "rendered in a separate draw call" `[CITED: three.js docs via Context7 /mrdoob/three.js, BufferGeometry.groups; mergeGeometries(useGroups) registers one group per input]`. Merging a hull's primitives into one draw call therefore only works where the primitives share one material; in the data, `Hull` and `Engine`/`Gun` carry different texture sets and parameters (viper: Hull has `normal_map`, Engine does not), so build-time merging saves little. The real reduction routes are an atlas or a texture array with a per-instance layer attribute (custom shader work) or accepting the D-05 raise. Do not plan the merge as a given; measure first, then pick.

### 8.2 The spike
No hook exists today to spawn an anarchy: the probe hooks are `spawnTestShooter`, `spawnTestFlyers`, `spawnTestAttacker` (`src/app/probe.ts:365-387`; `tests/fixtures/probe-shape.json` pins the shape). Add one hook-gated member, e.g. `spawnTestAnarchy()` (only under `?test=1&traffic=1`), that spawns one ship of every traffic record key spread around the player plus a hook shooter that kills one (so debris and an explosion are live), then a new spec reads `probe.calls` after the NPC models loaded (model readiness: wait on the loader/`probe.renders`). Mirror `traffic.spec.ts` (URL `/?test=1&traffic=1&clock=manual`, `runTickScript` Node twin). Call counts are deterministic and are measurable in the container (`renderer.info.render.calls`); **p95 frame time must be measured on the remote GPU Chromium** (`~/.claude/scripts/wegolite-remote-mcp.sh`, game at `http://192.168.178.5:5173/`) with the sampler in `docs/PERFORMANCE.md` during the fight (D-05, one-off; D-06). Record the numbers, the chosen fix and any new budget in `PROJECT.md` Key Decisions and `docs/PERFORMANCE.md`.
**`DRAW_CALL_BUDGET = 50` is duplicated in four specs** (`budget.spec.ts:56`, `traffic.spec.ts:48`, `npc-flight.spec.ts:51`, `combat.spec.ts:151`), and `FIRST_LOAD_BYTES_CEILING = 9 * MIB` in two (`budget.spec.ts:73`, `traffic.spec.ts:55`). CONTEXT names only `budget.spec.ts`; if the budget is raised all four move together. Consider a shared constant in `tests/e2e/helpers/` while there.

### 8.3 First-load mechanics with traffic on (tight)
Cold-start transfer measured in earlier phases: 8,866,124 B traffic off, 8,878,213 B traffic on (Phase 16); the Phase 18 estimate with the static-hull chunk (+205,628 B raw, the preview server does not compress) is 9,083,841 B (`docs/PERFORMANCE.md`). Ceiling `9,437,184` (9 MiB). Traffic-on boot loads, before the first in-flight frame (`start-session.ts:272-299`): the NPC catalogue, the hull chunk, the debris and explosion chunks and the static hulls. Growth from this phase (estimates `[ASSUMED]` from measured pieces): `ships-npc.json` 12,701 B -> about 45-55 KB; `ships-hulls.json` is 89,673 B for 10 hulls (compact octree roots measured this session: new models 4,645-11,627 B each, 70,923 B for the nine new, 92,690 B for twelve sampled models) so **+about 72 KB if hull octrees are keyed per model, +about 175 KB if per record key**. Result: roughly 9.19-9.30 MB against 9.437 MB, i.e. **about 140-250 KB of headroom, to be re-measured in the first plan that touches the chunks**. Prefer per-model octree sharing (or a `hullKey` indirection) and keep the compiled record fields lean.

### 8.4 Prefetch (D-07)
Today the loader is a latch closed until the first in-flight frame: `render-driver.ts:454` `if (currentState.mode === "inFlight") npcModels.open();`, requests happen per key on first appearance (`npc-models.ts`, `request`), and `budget.spec.ts`/`traffic.spec.ts` assert no NPC model/texture before that frame (`traffic.spec.ts` stamps `window.fetch` with the session mode). D-07 needs a second, separate entry: `prefetch(keys)` on `NpcModelLoader`, called once when traffic is on and the session first reaches the docked/menu idle state, with bounded concurrency; `request()`/`open()` and the draw path are unchanged, so a ship whose model has not arrived draws later and the sim never waits. Tests change accordingly: the "no NPC request before the first in-flight frame" assertion becomes "no NPC request before the prefetch trigger" for traffic on (traffic off must still request nothing, `budget.spec.ts`), and the ceiling is asserted on `total - bytes of requests in the NPC asset set` (the prefetch set is identified by path) so the prefetch stays "outside the ceiling" as D-07 states. Whole-catalogue prefetch moves about 30 MB of NPC assets (existing about 12.3 MB + about 16 MB WebP + about 2.4 MB GLB, `[ASSUMED]`); say so in the plan and, if the owner objects, prefetch only the keys the populator can place at the current system `[ASSUMED]`.

## 9. Suggested plan split (Claude's discretion; dependencies shown)

| Plan | Content | Gate | Depends on |
|------|---------|------|-----------|
| 21-01 | Measure + commit the epoch 1-20 golden, then `INERT_RECORD_KEYS` isolation; helper whitelists | test, lint, typecheck + by-hand 20-seed (QUAL-12) | - |
| 21-02 | Vendor the 9 `.dat` + 51 textures (export-pin, `ASSETS.md`, `CHECKSUMS`, `NOTICE`) | test (compliance), `assets:check` | 21-01 |
| 21-03 | Converter/schema widening to 28 (+shuttle) records, hyphen/case fixes, GLB rows, hull chunk caps, `ships-npc` golden, 20-seed run | test, lint, typecheck, `assets` + by-hand 20-seed | 21-02 |
| 21-04 | `autoAImap`, `role-categories`, comms subset compile + schemas + goldens | test, `assets:check` | 21-03 |
| 21-05 | The v5 field set: `limits.ts`, entity/world/standing fields, hash segments, snapshot v5, sanitize, spawn init, rng purposes, strip-and-rehash proofs, 30/60/144 Hz replay | test, lint, typecheck + 20-seed | 21-01 |
| 21-06 | Seams: `"priority"` key + inert stub + key-list pin, event names, `retireShip`, hit-reaction stage, per-facing weapons + aft fire shape, aft tripwire, view/control widening | test, lint, typecheck + 20-seed | 21-05 |
| 21-07 | Pod identity + D-01 debris velocity + D-02 render drift + FIDELITY/CHANGELOG + the one re-pin | `verify` (render touched) + 20-seed; remote twin equality | 21-05 |
| 21-08 | Anarchy spike hook + spec, prefetch (D-07), first-load and budget decisions, `PERFORMANCE.md`, `PROJECT.md` Key Decisions row, four-spec budget constants | `verify`, remote GPU p95; `verify-full` at the phase gate | 21-03, 21-07 |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Stateless per-purpose draws (pod, scoop, repop, injector roll) | a new RNG or per-entity stored stream | `forkSeed(worldSeed, id, purpose)` + `createRngState` with new `RngPurpose` codes | adding a draw to a feature must not move another stream (`rng.ts`, the `cargo` precedent) |
| Pristine-omit hashing | an ad hoc "has any new field" flag | the optional-segment pattern of `serializeEntity` and the `staticHealth:`/`buoys:` world lines, with strip-and-rehash tests | the repo's proven proof of "a world that uses none hashes as before" |
| Removal of a ship without a kill | `killShip` with `NO_ENTITY` | `retireShip` | `killShip` explodes, drops pods and credits kills |
| GLB/texture encoding | manual conversion | `tools/oolite-ingest` (`glb.ts`, `texture-encode.ts`) via `docker compose run --rm assets` | provenance, drift gate, deterministic bytes |
| Vendoring | copying files from the checkout | `scripts/vendor-oolite.sh --export-pin` | refuses unlisted paths, writes `CHECKSUMS.sha256`, `pin.json`, `ASSETS.md` digests |
| `like_ship` resolution and plist parsing | a new resolver | `tools/oolite-ingest/like-ship.ts`, `openstep/*` | verbatim port of `OOShipRegistry` rules |
| Closed-vocabulary membership | `in` operator or an object keyed by role | `Array.prototype.includes`/`===` over the frozen tuple | prototype-name safety (T-12-17 precedent) |
| Draw-call merging of unlike materials | `mergeGeometries(useGroups)` expecting one call | measure first; atlas/texture array or the D-05 raise | groups are separate draw calls |

**Key insight:** every Phase 21 artefact has a repo precedent (Phase 14/15 for hashing, Phase 16 for debris draws, Phase 9/12 for content and models); the risk is not invention but missing a coupled place (isolation order, hyphenated model name, hull caps, hard-coded counts, the attack-branch cut).

## Common Pitfalls

### Pitfall 1: Catalogue growth before isolation (C1)
**What goes wrong:** `pickRecord` weights change; `inert-lave-epoch1.json`, the 20-seed analysis and a dozen pins move. **How to avoid:** plan 21-01 first, measured-before/equal-after, `INERT_RECORD_KEYS` in `populate.ts`. **Warning signs:** a diff in `ships-npc.json` in a plan that does not list `populate.ts`.

### Pitfall 2: Piecemeal hashed fields (C2)
**What goes wrong:** a field added later means a second bump and golden churn. **How to avoid:** the one field-design plan (21-05) with the table in 4.2; any later phase needing a field stops and reports. **Warning signs:** "add a field to `Entity`" without a snapshot-version line.

### Pitfall 3: Hit-reaction stage skips the offence for the killing blow (C6)
**What goes wrong:** implementing the doomed-target todo as a single "skip lethal" `if`. **How to avoid:** the stage records every laser hit incl. lethal; only audio/flash `shipHit` consumers skip. **Warning signs:** a stage that reads the `shipHit` event.

### Pitfall 4: Content scope surprises (C9)
Hyphenated `oolite_boa-mk2.dat`, upper-case key `morayMED` vs the lower-case GLB path pattern, per-model vs per-record GLB ownership, `MAX_HULLS = 16`, `MAX_HULL_ARTIFACT_BYTES = 200_000`, missiles recorded but never simulated, the aft refusal and its three coupled sites. **How to avoid:** the change list in section 2; run the converter over all 29 keys early (a failing build is the cheapest discovery).

### Pitfall 5: No removal path (C11)
`killShip` is the only non-test removal. **How to avoid:** `retireShip` plus the guard in 7.1.

### Pitfall 6: Pod fields move more than intended (M6)
**What goes wrong:** drawing the commodity from the victim's `combat` stream shifts every later draw (wrecks, plates); `cargoKind` 0 pods stay anonymous and the re-pin happens late. **How to avoid:** the separate `"pod"` fork and the kind-0 default (Open Question 1); verify with a test that, for speed 0 and the same seed, pod positions, orientations and kicks equal the pre-change values.

### Pitfall 7: Existing guards fire on legitimate Phase 21 work
`on-event-handlers` (`MAX_ON_EVENT_HANDLERS = 1`): the `priority` stub must define no `onEvent`. `kill-credit-consumers`: only `kill.ts`, `ledger.ts`, `step.ts`, `events.ts` may say `killer`. `ship-hit-consumers`: no new file may name `shipHit`. `tests/guards/ai-zone.test.ts` and `eslint.config.js` (AI zone depth 1-2 allow-list). `hud-message-length`, `entity-id-scope` (nothing outside `src/sim` imports the id module or names `EntityId`: the app prefetch and the explosion event velocity must stay id-free).

### Pitfall 8: First-load ceiling with traffic on
See 8.3: re-measure after the catalogue and hull chunks grow; prefer per-model octree sharing. The D-07 prefetch must not be counted, and the traffic-off spec must still see zero NPC requests.

### Pitfall 9: Budget constants and counts duplicated across specs
Four `DRAW_CALL_BUDGET`s, two ceilings, `toHaveLength(9)`/`(43)`. Update all, and re-derive vacuity-guard counts from the committed files rather than typing numbers where possible.

### Pitfall 10: Reading the wrong Oolite tree
The checkout is ahead of the pin; `descriptions.plist` differs. Use the vendored copy / `git show 7437f22:`.

## Code Examples

Illustrative sketches (`[ASSUMED]` designs); verbatim repo values quoted are verified in the table below.

```typescript
// populate.ts: explicit nine-key isolation (21-01)
export const INERT_RECORD_KEYS: readonly string[] = Object.freeze([
  "adder", "cobramk1", "gecko", "krait", "mamba",
  "moray", "shuttle", "sidewinder", "viper",
]);
function inertRecords<T extends { readonly key: string }>(all: readonly T[]): T[] {
  // INERT_RECORD_KEYS order, not catalogue order: a later reorder cannot move a draw.
  return INERT_RECORD_KEYS.flatMap((key) => all.filter((r) => r.key === key));
}
// planInertPopulation: const eligible = inertRecords(records).filter(...scan class...)
```

```typescript
// serialize.ts: new entity segments, after `cargo:`, fixed order (21-05)
if (entity.bounty !== 0) segments.push(`bty:${int(entity.bounty)}`);
if (entity.role !== "") segments.push(`role:${encodeHashString(entity.role)}`);
if (entity.groupId !== 0) segments.push(`grp:${int(entity.groupId)}`);
if (entity.cargoKind !== 0) segments.push(`ck:${int(entity.cargoKind)}`);
if (entity.podCommodity !== "" || entity.podAmount !== 0) {
  segments.push(`pod:${encodeHashString(entity.podCommodity)},${int(entity.podAmount)}`);
}
```

```typescript
// debris.ts: total ship velocity as the kick base (21-07, D-01)
const total = shipVelocity(victim); // drift + rotate(orientation, vec(0,0,-1)) * speed
// scatter(stream, box, origin, total) already adds kick + total, then clampDebrisVelocity
const podStream = createRngState(forkSeed(world.worldSeed, victim.id, "pod"));
```

```typescript
// world/retire.ts (21-06): non-lethal removal, same contract as killShip
export function retireShip(world: World, id: EntityId, reason: RetireReason): boolean {
  const entity = world.store.get(id);
  if (entity === undefined || entity.kind !== "ship") return false;
  if (!world.store.kill(id)) return false;       // idempotent
  for (const holder of world.store.live) {        // shipTargetLost to holders only
    if (!holder.dead && holder.kind === "ship" && holder.id !== id && holder.nav.targetId === id) {
      postAiEvent(world, { to: holder.id, name: "shipTargetLost" });
    }
  }
  return true;                                    // no shipDestroyed, no debris, no credit
}
```

### Verified in-repo values (opened this session; quoted verbatim)
| Claim | Source and lines | Verbatim |
|-------|------------------|----------|
| snapshot version | `src/sim/world/snapshot.ts:99` | `export const WORLD_SNAPSHOT_VERSION = 4;` |
| AI params key cap | `src/sim/world/limits.ts:33` | `export const MAX_AI_PARAMS_KEYS = 32;` |
| param array / string caps | `limits.ts:30`, `:27` | `export const MAX_SNAPSHOT_PARAM_LENGTH = 64;`, `export const MAX_SNAPSHOT_STRING_LENGTH = 128;` |
| cargo / temperature / velocity caps | `limits.ts:140`, `:133`, `:126` | `export const MAX_ENTITY_CARGO = 200;`, `export const MAX_WEAPON_TEMPERATURE = 1e3;`, `export const MAX_ENTITY_VELOCITY = 1e4;` |
| entity cap | `src/sim/world/ids.ts:61` | `export const MAX_ENTITIES = 256;` |
| AI keys | `src/sim/ai/types.ts:19` | `export const AI_KEYS = ["test-pilot", "flight-script"] as const;` |
| hull caps | `src/content/schemas/ship-hull.ts:39`, `:47` | `export const MAX_HULLS = 16;`, `export const MAX_HULL_ARTIFACT_BYTES = 200_000;` |
| model patterns | `tools/oolite-ingest/convert/glb.ts:151`, `src/content/schemas/ship-npc.ts:69`, `src/content/npc-glb-path.ts:9` | `const SHIP_MODEL_PATTERN = /^oolite_([a-z0-9_]+)\.dat$/;`, `model: z.string().regex(/^oolite_[a-z0-9_]+\.dat$/),`, `export const NPC_GLB_PATH_PATTERN = /^models\/[a-z0-9][a-z0-9_-]*\.glb$/;` |
| refusal list | `tools/oolite-ingest/convert/npc-ships.ts:240-247` | `export const STEERING_ASSUMED_ABSENT_KEYS: readonly string[] = [ "accuracy", "reaction_time", "scanner_range", "aft_weapon_type", "port_weapon_type", "starboard_weapon_type", ];` |
| twin pins | `tests/app/session/tick-parity.test.ts:840`, `:1165`; `tests/e2e/combat.spec.ts:101`, `:116` | `const HASH_60_AFTER_KILL = "f6927215";`, `const DAMAGE_HASH_60_AFTER_KILL = "5028fc8f";`, `const TWIN_HASH_60_AFTER_KILL = "f6927215";`, `const TWIN_DAMAGE_HASH_60_AFTER_KILL = "5028fc8f";` |
| budgets | `tests/e2e/budget.spec.ts:56`, `:73` | `const DRAW_CALL_BUDGET = 50;`, `const FIRST_LOAD_BYTES_CEILING = 9 * MIB;` |
| loader latch | `src/app/session/render-driver.ts:454` | `if (currentState.mode === "inFlight") npcModels.open();` |
| onEvent cap | `tests/guards/on-event-handlers.test.ts:29` | `const MAX_ON_EVENT_HANDLERS = 1;` |
| RNG purposes | `src/sim/rng.ts:90-91` | `Object.freeze({ world: 1, ai: 2, combat: 3, cargo: 4, damage: 5 });` |
| save version | `src/persistence/save.ts:70` | `export const SAVE_VERSION = 5 as const;` |
| Oolite velocity | `ShipEntity.m:11158-11166` | `- (Vector)thrustVector { return vector_multiply_scalar(v_forward, flightSpeed); }` / `- (Vector)velocity { return vector_add([super velocity], [self thrustVector]); }` |
| Oolite bursts | `Core/Entities/OOParticleSystem.m:274`, `:324` | `velocity:[entity velocity]`, `velocity:vector_multiply_scalar([entity velocity], 0.85)` |
| Oolite cargo flags | `Core/OOTypes.h:100-108` | `CARGO_FLAG_NONE = 400, CARGO_FLAG_FULL_PLENTIFUL = 501, CARGO_FLAG_FULL_SCARCE = 502, CARGO_FLAG_FULL_MEDICAL = 503, CARGO_FLAG_FULL_CONTRABAND = 504, CARGO_FLAG_PIRATE = 505, CARGO_FLAG_FULL_UNIFORM = 510, CARGO_FLAG_CANISTERS = 600, CARGO_FLAG_FULL_PASSENGERS = 700` |
| Oolite alerts / police cap | `ShipEntity.h:169-172`, `StationEntity.h:41` | `ALERT_CONDITION_DOCKED = 0, ALERT_CONDITION_GREEN = 1, ALERT_CONDITION_YELLOW = 2, ALERT_CONDITION_RED = 3`; `#define STATION_MAX_POLICE 8` |
| Oolite injector | `ShipEntity.m:361`, `:555`, `:5845-5852` | `if ([shipDict oo_fuzzyBooleanForKey:@"has_fuel_injection"]) [self addEquipmentItem:@"EQ_FUEL_INJECTION" inContext:@"npc"];`, `fuel = [shipDict oo_unsignedShortForKey:@"fuel"];`, `fuel_accumulator -= delta_t * afterburner_rate;` |

## State of the Art

| Old approach | Current approach | When changed | Impact |
|--------------|------------------|--------------|--------|
| One flat `WeaponComponent` (forward only) | per-facing temperatures + types | this phase | the second snapshot bump Phase 15 predicted ("accepted like D-17's") |
| Anonymous pods (D16-24: no commodity draws) | pods carry commodity + amount from a forked stream | this phase | one measured re-pin |
| Debris keeps only the drift velocity (Phase 16 D-01) | debris inherits total ship velocity | this phase, owner D-01 | moves flyer kills; pods then drift with the ship (scooping geometry, Phase 24) |
| Latch-closed NPC model loading | background prefetch on menu/docked + draw-on-arrival | this phase, owner D-07 | tests and the cold-start measurement change |

**Deprecated/outdated:** the roadmap/ARCHITECTURE phrase "one GLB per model" for NPCs (variants need their own maps); ARCHITECTURE's "24-key" AI budget (27 persisted Oolite parameters, pack them).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The catalogue keeps `shuttle` (29 compiled, 28 resolved by the populator roles) | 1 | If exactly 28 compiled records are wanted, the inert shuttle and the `?test=1` flyer hook lose their record |
| A2 | One GLB per record key (20 new GLBs), lower-cased file names | 2.2, 3 | Per-model GLBs need a render-side texture swap instead; changes plan 21-03/21-08 |
| A3 | Field names, bounds and hash segment spellings in 4.2 (`MAX_BOUNTY` 65535, `MAX_ROLE_LENGTH` 32, `MAX_POD_AMOUNT` 255, `MAX_WORLD_GROUPS` 128, `MAX_STATION_MARKS` 32, role as string, commodity as key) | 4.2 | Any change after plan 21-05 is a second bump; settle in the field-design plan and have the reviewers confirm |
| A4 | `cargoKind` 0 with `cargo > 0` is drawn as `fullPlentiful` | 6 | If owner prefers anonymous pods, no twin moves in Phase 21 and the pod draw shows in Phase 22 (contradicts the roadmap success criterion 4) |
| A5 | `hasScoop` / `hasFuelInjection` / `autoAi` are rolled per ship from stateless forks at spawn (Phase 22), stored as probabilities in the record | 2.1, 4.3 | If a roll must persist, another hashed field (second bump) |
| A6 | Pod draws use the system's generated market quantities, not the live market | 6 | Draw would depend on player trades; hash/replay equality risk |
| A7 | Per-hull primitive merging saves little because primitives carry different textures; worst case about 73 calls | 8.1 | If merging works, the budget stays 50; if the laser-shot layer is large, worst case exceeds 80 and the owner must be brought in |
| A8 | Hull octree per model is about +72 KB and per record about +175 KB; NPC catalogue about 45-55 KB; first-load headroom 140-250 KB | 8.3 | Could exceed the 9,437,184-byte traffic-on ceiling; re-measure before committing a design |
| A9 | The hit-reaction stage posts no AI event in this phase | 7.2 | If it posts, flight-script flyers may react and the frozen acceptance could shift |
| A10 | WorldView/ShipControl widening limited to read members plus total write methods with tests | 7.4 | If the owner/planner wants the full ARCHITECTURE list now, more pin-test churn |
| A11 | Whole-catalogue prefetch (~30 MB) is acceptable | 8.4 | Bandwidth objection; fall back to per-system prefetch |
| A12 | New 57 MB PNG vendoring (plus about 16 MB WebP) is acceptable repo growth | 3 | Owner may want to trim variants (drop `sidewinder-escort`, `viper-pursuit`: 26 records) |

## Open Questions (RESOLVED)

All seven are settled in the plans; each line names its resolution and plan.

1. **(RESOLVED: plans 21-14 and 21-15) Kind-0 pods (A4).** The inert world's ships and hook ships have cargo but no cargo kind. Recommended: default `fullPlentiful`; needs a `FIDELITY.md` row and the planner's explicit acceptance, because it decides whether Phase 21 or Phase 22 moves the debris pins. Resolution (orchestrator decision 3): a commodity-less pod is never released; the kind is resolved at release from the dying ship's role with a scarce-legal fallback, the hook ship carries an explicit kind, a tripwire guards the fallback (21-14), and the FIDELITY row and the one re-pin land with the live wiring (21-15), all in Phase 21.
2. **(RESOLVED: plans 21-05 and 21-08) GLB ownership and naming (A2).** Per-record GLBs (recommended) versus per-model with a render-time texture swap; and the lower-case naming rule for `morayMED`. Decide in plan 21-03 before the converter edit. Resolution: one GLB per record, named after its key in lower case (`morayMED` -> `moraymed.glb`), the model pattern widened for `oolite_boa-mk2.dat` (21-05, 21-08); plans 21-17 and 21-18 then cut the draw calls inside that rule (merged primitives, variant families keyed from the loaded assets).
3. **(RESOLVED: plans 21-04, 21-08 and 21-11) Hull octree keying and first-load margin (A8).** Per model with a `hullKey` indirection (recommended) versus per key; measure the traffic-on cold start after the first catalogue regeneration. Resolution: one hull entry per model with `aliases` (21-04), the roster's cold start measured with traffic off and on (21-08) and recorded with the prefetch (21-11), re-measured after the atlas merge (21-17).
4. **(RESOLVED: plans 21-16 to 21-19) Anarchy hook scope.** What exactly does the spike spawn (one of each key, or a Lave-like mix with duplicates) and which fight/debris scene counts as "the full anarchy"? Recommend: one of every key plus a hook shooter killing a cargo-carrying ship; record both the worst-case and the typical-mix counts. Resolution: one ship of every catalogue key plus the cargo shooter killed by the player, counted before and after the kill (21-16); every D-05 step re-measured on it (21-17, 21-18) and the budget decided from it (21-19).
5. **(RESOLVED: plan 21-09) View/Control widening depth (A10).** Read-side now, write-side only where it writes existing state: confirm in the plan. Resolution: read members now; write members only for existing state (the fire facing, 21-12).
6. **(RESOLVED: plan 21-11) Prefetch trigger and set (A11).** Trigger on first `docked` idle with traffic on; whole catalogue or per-system; concurrency. Resolution: the first frame with traffic content while docked (or idle before launch), the whole catalogue, bounded concurrency (D-07).
7. **(RESOLVED: plans 21-03 and 21-06) `World.station` marks and `being_fined`.** The record shape in 4.2 puts the marks in the world record (D2); the per-ship `being_fined` flag stays out. Confirm when Phase 25's responder is designed (Phase 21 only freezes the shape). Resolution, decided on the merits under the one-bump rule: Oolite keeps `being_fined` per ship (`ShipEntity.h:248`), police set it through `markForFines` (`ShipEntity.m:12434-12439`), the police scan and the docking fine read it, and Phase 25 (LAW-02, AI-05) needs it for NPCs and the player; it is frozen in v5 now as the per-entity `markedForFines` (21-03), distinct from `World.station.marks`, the offenders the station itself saw (21-06, owner D2). A field still missing after Phase 21 goes to the owner as an amendment, never a quiet second bump (the v5 Key Decisions row).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker + Compose | every gate, `assets`, scratch scripts | yes | 29.9.3 (`docker info`) | - |
| Host Node | not authoritative | yes | v26.13.1 (project engine `^24.0.0`) | use containers only |
| Oolite checkout | vendoring, behaviour reads | yes | `/home/opencode/git/oolite` HEAD `21978c37b` (pin `7437f22` is an ancestor) | export pinned blobs with `--export-pin` |
| `git` on host | `vendor-oolite.sh --export-pin` | yes | - | - |
| cwebp 1.2.4 | texture re-encode | in the `assets` image (per `texture-encodings.json`) | 1.2.4 | - |
| Remote test machine `opencode@192.168.178.51` | verify, verify-full, e2e, 20-seed run | per memory note (WSL2, 16 CPUs, RTX 4060); not probed this session `[CITED: reference-remote-test-machine memory]` | Docker 29.9.3 | none for p95 GPU measurement |
| Remote GPU Chromium (Playwright MCP) | p95 frame time (D-05) | per CLAUDE.local.md `~/.claude/scripts/wegolite-remote-mcp.sh up` | - | none: p95 needs real GPU |
| `codebase-memory` MCP | exploration | index available; not required | - | `rg` |

Missing with no fallback: none. Context7 was used once (three.js groups); the `research-plan`/`research-store` seams were not run (one docs question, no web research, no cache entries stored).

## Validation Architecture

`workflow.nyquist_validation` is true. Framework: Vitest 5.1.1 (+ fast-check 4.11.0), config `vitest.config.ts` (project `unit`, v8 coverage floors) and `vitest.acceptance.config.ts` (frozen run); browser: `@playwright/test` 1.65.1 (`playwright.config.ts`).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.1.1 / Playwright 1.65.1 |
| Config file | `vitest.config.ts`, `vitest.acceptance.config.ts`, `playwright.config.ts` |
| Quick run command | `docker compose run --rm test npx vitest run <file>` |
| Full suite command | `docker compose run --rm test` (`npm test`, with coverage) plus `lint`, `typecheck`; browser: remote `verify` |

### Phase Requirements -> Test Map
| Req | Behaviour | Test type | Automated command | File exists? |
|-----|-----------|-----------|-------------------|--------------|
| FOUND-20 | inert world epochs 1-20 hash equal (section + `hashWorld`) before/after isolation and after v5 | golden + unit | `docker compose run --rm test npx vitest run tests/sim/world/inert-isolation.test.ts` | Wave 0 (new test + `tests/golden/world/inert-lave-epochs-1-20.json`) |
| FOUND-20 | pristine v5 world hashes as v4; each new field prints exactly one segment; stripping it reproduces v4 text | unit | `... vitest run tests/sim/world/v5-hash.test.ts` | Wave 0 |
| FOUND-20 | snapshot v5 round trip; v4/v6 refused; unknown key refused; each field bound refused by parser and repaired by sanitize | unit | `... vitest run tests/sim/world/snapshot-codec.test.ts tests/sim/world/sanitize.test.ts` | exists (update lines 276, 999-1001) |
| FOUND-20 | v5 fields populated, replayed at 30/60/144 Hz equal | cadence | `... vitest run tests/sim/world/v5-cadence.test.ts` (model: `debris-cadence.test.ts`) | Wave 0 |
| FOUND-20 | priority-AI key list is closed, <= 32 and importable by the snapshot; `"priority"` registered inert, no `onEvent`, nothing spawns with it | unit + guard | `... vitest run tests/sim/ai/priority-params.test.ts tests/guards/on-event-handlers.test.ts` | Wave 0 / exists |
| FOUND-20 | `retireShip`: no `shipDestroyed`, no debris, no credit, notifies targeters, idempotent, total | unit + property | `... vitest run tests/sim/world/retire.test.ts` | Wave 0 |
| FOUND-20 | hit-reaction stage: every laser hit incl. lethal recorded with aggressor; scrapes excluded; no event posted; `shipHit` guard untouched | unit | `... vitest run tests/sim/combat/hit-reaction.test.ts tests/guards/ship-hit-consumers.test.ts` | Wave 0 / exists |
| FOUND-20 | per-facing temperatures cool/heat independently; fire queue carries facing; forward behaviour byte-identical; aft tripwire fails for an aft record reaching `behaviourAttackTarget` | unit + guard | `... vitest run tests/sim/npc/fire-aft.test.ts tests/guards/aft-weapon-tripwire.test.ts` | Wave 0 |
| FOUND-20 | frozen 20-seed run 21/21 after every touching plan | acceptance (manual, remote) | `wegolite-remote-run.sh run --rm test npm run test:acceptance` (record in SUMMARY) | exists |
| DATA-17 | roster equals the `like_ship` resolution over the populator roles (28 + shuttle); fields compile; `aft_weapon_type` accepted, other five refusals kept; strict schema rejects extras | unit | `... vitest run tools/oolite-ingest/convert/npc-ships.test.ts tests/content/ships-npc.test.ts` | exists (widen) |
| DATA-17 | `autoAImap`, `role-categories`, comms subset equal the vendored plists | unit | `... vitest run tests/content/ai-map.test.ts` etc. | Wave 0 |
| DATA-17 | content drift gate and goldens | gate | `docker compose run --rm assets npm run assets:check` | exists |
| DATA-18 | every vendored/generated asset has an `ASSETS.md` row and checksum; GLBs decode in a browser | unit + e2e | `... vitest run tests/compliance-assets.test.ts`; `e2e ... npx playwright test tests/e2e/npc-assets.spec.ts` | exists (counts change) |
| DATA-18 | cold start under 9,437,184 B with traffic off and on; no NPC request before the prefetch trigger; prefetch outside the ceiling | e2e | remote `e2e ... budget.spec.ts traffic.spec.ts` | exists (assertions change) |
| CBT-11 clause | pod commodity + amount from the `"pod"` fork; no other draw moves; D-01 velocity = ship velocity + kick; pods drift | unit + property | `... vitest run tests/sim/world/debris.test.ts tests/sim/world/debris-pod.test.ts` | exists / Wave 0 |
| CBT-11 clause | twin hashes re-pinned once, Node equals browser | twin | `... vitest run tests/app/session/tick-parity.test.ts`; remote `e2e ... combat.spec.ts` | exists (re-pin, D-04) |
| QUAL-09 | full anarchy calls measured vs budget; p95 on GPU | e2e + manual | remote `e2e ... anarchy-budget.spec.ts`; MCP sampler | Wave 0 |

### Sampling Rate
- **Per task commit:** the targeted `vitest run <file>` for the touched module (plus `lint` and `typecheck` at task end).
- **Per plan merge:** `docker compose run --rm test`, `lint`, `typecheck`; `assets:check` when content changed; the by-hand 20-seed run for plans touching `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json`.
- **Render/app plans (21-07, 21-08):** remote `verify`.
- **Phase gate:** remote `verify-full` (automatic, no checkpoint) and the by-hand 20-seed run 21/21, before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/golden/world/inert-lave-epochs-1-20.json` + `tests/sim/world/inert-isolation.test.ts` (measure on the base commit first)
- [ ] `tests/sim/world/v5-hash.test.ts`, `v5-cadence.test.ts` (strip-and-rehash, 30/60/144 Hz)
- [ ] `tests/sim/ai/priority-params.test.ts`; `tests/sim/world/retire.test.ts`; `tests/sim/combat/hit-reaction.test.ts`; `tests/sim/npc/fire-aft.test.ts`; `tests/guards/aft-weapon-tripwire.test.ts` (and the missiles tripwire the missiles todo asks for)
- [ ] `tests/sim/world/debris-pod.test.ts` (pod fork independence, D-01 guard)
- [ ] content tests for the three compiled tables; `tests/e2e/anarchy-budget.spec.ts` + probe hook and an updated `tests/fixtures/probe-shape.json`
- [ ] shared e2e constants for the budget (four duplicates)
- Framework install: none.

## Security Domain

`security_enforcement` is not disabled in `.planning/config.json`.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication / V3 Session | no | static client, no accounts |
| V4 Access Control | no | - |
| V5 Input Validation | yes | strict zod schemas for every compiled artefact (loaded as untrusted `?raw` JSON), the strict snapshot parser and `sanitizeEntity` bounds from `limits.ts`; `FORBIDDEN_PARAM_KEYS` for AI params |
| V6 Cryptography | no | none (FNV hashes are determinism checks, not security) |
| V10/V12 Files and resources | yes | GLB paths pass `NPC_GLB_PATH_PATTERN` (re-checked in `loadNpcModel`); vendored bytes verified against `CHECKSUMS.sha256` |
| V14 Config / supply chain | yes | no new dependency; Oolite assets vendored only through the checksummed script; licence and provenance rows |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Hostile or oversized catalogue/hull chunk (DoS) | Denial of service | bounded schemas (`MAX_HULL_NODES`, raised `MAX_HULLS`/artifact cap, string and array caps), iterative tree walks |
| Prototype-name role/key lookups (`constructor`) | Tampering | `===`/`includes` over frozen tuples, `Object.hasOwn`, `Object.create(null)` params |
| Path traversal / fetch path injection via `glb` or texture URI | Tampering | path regex, GLB-relative URI check, no URL built from entity data |
| Unprovenanced asset (licence breach) | Repudiation/legal | `ASSETS.md`, `NOTICE`, `CHECKSUMS.sha256`, `tests/compliance-assets.test.ts` |
| Corrupt snapshot reaching `canon` | Tampering | sanitize before hash (`hashWorld` repairs first), parser refusal reasons |

## Sources

### Primary (HIGH confidence)
- Repo files read this session: `.planning/phases/21-roster-state-shape-and-seams/21-CONTEXT.md`, `.planning/{REQUIREMENTS,ROADMAP,PROJECT}.md` (Key Decisions rows at lines 289, 303, 309), `.planning/research/{SUMMARY,ARCHITECTURE,PITFALLS}.md`, `src/sim/world/{world,entity,limits,serialize,snapshot,sanitize,populate,debris,kill}.ts`, `src/sim/combat/{ledger,step,state,aim}.ts`, `src/sim/npc/{fire,stats}.ts`, `src/sim/npc/behaviours/attack.ts`, `src/sim/ai/{types,registry}.ts`, `src/sim/rng.ts`, `src/sim/events.ts`, `src/app/session/{traffic,start-session,test-flags}.ts`, `src/app/npc-models.ts`, `src/render/bodies/npc-ships.ts`, `src/content/{ships-npc,npc-glb-path}.ts`, `src/content/schemas/{ship-npc,ship-hull}.ts`, `tools/oolite-ingest/convert/{npc-ships,glb,ship-hulls}.ts`, `scripts/vendor-oolite.sh`, `docs/PERFORMANCE.md`, `tests/e2e/{budget,traffic}.spec.ts`, `tests/guards/*`, `compose.yaml`, `vitest*.config.ts`, `eslint.config.js` (AI zone), todos `2026-11-24-debris-inherits-ship-velocity.md` and `2026-11-17-skip-shiphit-for-a-doomed-target.md`.
- Oolite checkout (pin `7437f22`; HEAD `21978c37b`): `src/Core/Entities/{ShipEntity.m,ShipEntity.h,StationEntity.h,OOParticleSystem.m}`, `src/Core/{Universe.m,OOTypes.h}`, `Resources/Config/{autoAImap,role-categories,descriptions,shipdata}.plist`, `Resources/Scripts/{oolite-populator,oolite-priorityai}.js`.
- Measurements this session: resolved-catalogue roster query over `ships.json`; asset sizes from the checkout; compact octree root sizes of 12 models; `laveInertWorld` epochs 1-20 hashes (container, `npx tsx`, scratch under the session scratchpad; no tracked file modified).
- Context7 `/mrdoob/three.js`: `BufferGeometry.groups` "each of which will be rendered in a separate draw call"; `mergeGeometries(..., useGroups)` adds one group per geometry.

### Secondary (MEDIUM)
- `.planning/research/*` population/draw-call estimates; `docs/PERFORMANCE.md` historical byte counts (Phase 16/18 figures, not re-measured).

### Tertiary (LOW)
- None used as a basis for a recommendation without an `[ASSUMED]` tag.

## Metadata

**Confidence breakdown:**
- Roster, converter/schema change list, isolation mechanism, hash/snapshot mechanics: HIGH (read in code and data this session)
- Field bounds and segment spellings: MEDIUM (proposals backed by Oolite sources; reviewer confirmation advised)
- Draw-call and first-load numbers: MEDIUM (arithmetic from verified parts; the spike and a cold-start run are the real measurements)
- Pitfalls: HIGH

**Research date:** 2026-11-25
**Valid until:** 2026-12-25 for the repo facts (the tree changes with each plan); the Oolite pin facts do not expire.
