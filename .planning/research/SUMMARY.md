# Project Research Summary: v2.0 Foundation & Combat

**Project:** Wegolite
**Milestone:** v2.0 Foundation & Combat (subsequent milestone; v1 flight, docking, trading, outfitting, hyperspace and saves already ship)
**Domain:** Faithful browser port of Oolite's multi-entity space combat: NPC traffic, priority AI, combat, legal status, death and escape pod, planet and sun collision, and Web Audio, on a new deterministic multi-entity world
**Researched:** 2026-11-11
**Confidence:** HIGH for the foundation and integration decisions; MEDIUM for AI fidelity volume, render batching under traffic, and audio behaviour in headless browsers
**Supersedes:** the v1 SUMMARY.md dated 2026-11-02

Inputs: `STACK.md`, `FEATURES.md`, `ARCHITECTURE.md`, `PITFALLS.md` in this directory, and `.planning/PROJECT.md`. The synthesis also spot-checked several claims against the Oolite checkout at `/home/opencode/git/oolite`.

---

## Executive Summary

Wegolite v2.0 turns an empty system into a populated one. The work is a deterministic, fixed-step simulation of many entities (ships, missiles, cargo pods, wreckage) with stable ids, hashed and golden-tested like the v1 flight model, and rendered through a Three.js layer that never writes sim state. Oolite's own rules and numbers are the specification. Oolite's gameplay logic is JavaScript (the AILib priority AI, role AIs and populator) plus native Objective-C behaviours in `ShipEntity.m`. The research recommends porting that logic by hand to typed TypeScript and treating the Oolite files as reference only. Closure-held AI state cannot be saved or hashed, so runtime JavaScript is rejected.

The stack decision is the least controversial part: add zero runtime and zero dev dependencies. The entity store, sweep-and-prune broadphase, and the octree narrowphase are hand-written. Sound is the raw Web Audio API, with Oolite's `.ogg` files shipped unchanged (verified to decode in Chromium and Firefox). Effects and NPC hulls use pooled `InstancedMesh` objects to stay inside the 50-draw-call budget. The sim stays on the main thread. The real risks are not technical novelty. They are: (1) a hand-port of about 12,000 lines of AI JavaScript plus about 2,500 lines of native steering that cannot be checked against the original except by building a differential harness; (2) determinism bugs from iteration order, shared random streams, and non-serialisable state; (3) a fight-and-traffic load that the existing browser suite and SwiftShader cannot exercise in real time.

The recommended approach is an ordered, test-gated build. First, split `game-session.ts` behind a probe-shape snapshot and add the world core (ids, store, object-state RNG, a hash composed so that an empty world hashes exactly like today's `hashFlight`). Build NPC content in parallel. Make one save schema bump to v3 with a seed-and-epoch world policy, not an entity snapshot. Put inert ships on screen before any AI moves, then player weapons against inert targets, then AI motion, then the legal and death loop, then missiles and equipment damage, then the full populator, audio, and hardening. The critical path is session split, world core, inert world, weapons, AI motion, legal and death, and the performance gate. Owner decisions gate this work (listed below); several were answered at milestone start (see "Owner decisions recorded").

---

## Key Findings

### Recommended Stack (from STACK.md)

Zero new packages. Every new capability is covered by existing dependencies (Three.js 0.187.0, zod 4.6.7, Vite 8.3.5, Vitest 5.0.5, fast-check 4.10.2, Playwright 1.64.1) and platform APIs.

- **Entity store, hand-rolled (`src/sim/world/entity-store.ts`).** Rejected bitecs (recycles ids immediately, so dangling targets alias to new ships), miniplex (no ids, no serialisation, unmaintained since 2023), and koota (pre-1.0, unordered queries). Monotonic ids never reused, a persisted `nextId`, id-ascending iteration.
- **Broadphase, hand-rolled.** Sweep-and-prune behind an interface with a brute-force reference; a fast-check property test asserts identical pair sets. Planet and sun are tested directly per ship, not inserted.
- **Narrowphase, ported Oolite octrees.** `Octree.m` ported to `src/sim/collision/octree.ts`; octrees built at build time from `.dat` meshes in `tools/oolite-ingest`. Needed anyway: ship mass is `density * 20 * octree volume` (`ShipEntity.m:417-419`).
- **Audio, raw Web Audio.** Reject howler.js (last release 2023) and Tone.js (5.4 MB). Decode SFX to `AudioBuffer` (~5.2 MB decoded). Stream the two music tracks through `<audio loop>` plus `createMediaElementSource` (decoding would cost ~190 MB PCM).
- **Effects, pooled `InstancedMesh`** with `MeshBasicMaterial` and additive blending: about 4 to 5 draw calls total. Rejected `Sprite` and `Points`.
- **No Web Worker in v2.0.** Only if measured sim cost exceeds ~4 ms p95 on the reference desktop.
- **Rejected for the CSP reason:** Rapier/any WASM (`'wasm-unsafe-eval'`), `blob:` workers, `media-src` changes.

Corrections not to carry forward from STACK.md: the "world PRNG state persisted in the save" claim conflicts with the anchored-save design, and its first-load figure predates WebP. Current cold start: 7,490,424 bytes against a 9,437,184-byte ceiling (quick task 261110-b7w).

### Expected Features (from FEATURES.md)

12 table-stakes areas (TS-1 to TS-12) with Oolite source lines and complexity:

- **Lasers.** Pulse, beam, military, mining. Pulse: 15 damage, 12,500 m, 0.5 s recharge, heat 7.0 per shot, cutout at 217.6 (`equipment.plist:126-205`). Hit-scan along the facing axis; planets and suns never block it.
- **Energy and shields.** Cobra `max_energy` 256, recharge 4/s; fore and aft shields 128 each at 2.0/s. NPCs have no shield pools.
- **Damage.** Internal damage rolls, equipment damage with F3 repair at 50 %, collision damage `otherMass * closingSpeed^2 / 50 000 000`, wreckage and cargo pods.
- **Missiles and ECM.** Missile AI, blast `dealEnergyDamage(180, 32.5, 0.1)`, ECM pulses at 6.4, 12.8, 19.2, 25.6 km.
- **Legal status.** Bit-flag integer combined with OR (`PlayerEntity.m:6024-6040`). 0 Clean, 1–50 Offender, 51+ Fugitive. Kills and rating separate.
- **Death.** No automatic eject; Escape double press before energy reaches zero. Pod: clock +12 h to 8.2 days, legal status 0, cargo wiped, ship and equipment kept.
- **Populator.** Rates from government, economy, tech level, neighbours within 7 LY and 3.5 LY; repopulation every 20 s with probability `rate/180`.
- **Sound.** 26 player-bound `.ogg` (412 KB), two music tracks (7.9 MB). No NPC combat sounds in core Oolite.

**Anti-features:** missions and contracts; thargoids, witchspace interception, cascade weapons; cloaking, military jammer; trumbles; trade-in renovation; docking-clearance protocol; target memory; custom views; joystick/touch fire; NPC combat sounds; real-time simulation while docked.

**Differentiators (deferred unless they fall out of main slices):** hardened missile, energy unit, shield booster, heat shield, weapons toggle, pirate demands, NPC pods and rescue, smuggling check, asteroids and hermits, mining laser, sun-skimming, docking music.

**Asset gap.** 17 of 194 ship records have a vendored model; ~37 more needed, including `viper` and `viper-interceptor` before the legal loop.

### Architecture Approach (from ARCHITECTURE.md)

- **Layers.** `src/sim` stays pure; new `src/sim/world`, `src/sim/ship`, `src/sim/ai`, `src/sim/collision`, `src/sim/populator`; `src/audio` subscribes to events; `src/render/entities` batches.
- **One tick.** `stepSim` runs `stepFlight` unchanged for the player, then W0 commands, W1 update (snapshot length, id order), W2 AI event drain then think, W3 collide, W4 spawn/populator, W5 commit. The world does not exist while docked.
- **Ids and iteration.** Monotonic integer ids; iterate a `live` array in id order, never a `Map`/`Set`, for sim decisions.
- **Player.** Has an id and a read-only `Body` view; storage stays `FlightState`; player combat state moves into the world.
- **AI.** Plain-data `AiComponent`, static priority trees as typed literals, integer tick timers, typed `WorldView`/`ShipControl`. Handlers queue events, never call other entities.
- **Save.** One bump to v3; anchors carry seed and epoch; snapshot codec for hashing/tests only.
- **Render.** `EntitySync` per-model `InstancedMesh`, batch cap 12, `FarMarks` `Points`, batched effects, `no_draw_distance`. Worst case ~38 draw calls.

**Critical path:** A session split → B world core → E inert world → F AI motion → G combat. Parallel: C content, D save v3, H octree runtime, I audio, J performance gate. Do not start F before E.

### Critical Pitfalls (from PITFALLS.md)

1. **Iteration order and PRNG shifts.** Live vs restored world hash equality after 1,000 ticks; forked object-state streams per `(worldSeed, entityId, purpose)`; lint bans on `for..in` and bare `.sort()` in `src/sim`.
2. **AILib hand-port drift.** Coverage manifest (`port`/`stub`/`notPorted`), priority-tree structural diff, differential trace harness in Node `vm`, scenario goldens per role.
3. **Native steering fidelity.** `trackDestination`, frustration counters, `delta_t`-dependent overshoot limiter. Port per behaviour with oracle tests and 20-seed acceptance tests.
4. **Save growth and migration.** v2 worst case ~38.9 KB of 65,536; anchors carry seed and counters only.
5. **SwiftShader test runtime.** Browser sim at ~0.1x real time; ≥90 % of new behavioural assertions in Vitest scenarios; `advanceTicks` hook; populator off in e2e by default.
6. **Static bodies and collision deferral.** Bodies stay in `SystemLayout`, exposed with fixed ids; planet/sun contact after shields.

Also: split `game-session.ts` first behind a probe-shape snapshot, re-pointing `tests/app/redraw-gate.test.ts` and `tests/guards/economy-purity.test.ts` (they read the file as text); keep `hashFlight` identical for an empty world; decide NPC docking before traders dock.

---

## Where the Research Disagrees

| Topic | Verdict | Evidence |
|---|---|---|
| Positional audio | Non-positional (STACK) | `OOOpenALController.m:75` `AL_NONE`; `PlayerEntitySound.m:59-97` |
| Save contents | Seed/epoch/counters (ARCHITECTURE, PITFALLS) | `Universe.m:5155` `removeAllEntitiesExceptPlayer` |
| PRNG persistence | Object-state `RngState` twin | `math.ts:227` closure |
| Per-ship streams | Per `(seed, entity, purpose)` (PITFALLS) | AI draws must not shift damage rolls |
| Save v3 timing | One bump in phase 3, fields defaulted | Strict v2 objects reject additive fields |
| Planet/sun contact | After shields (owner todo); heat early | Pending todo |
| Hit geometry | Open (D4); rec. octree for lasers, OBB for proximity | Octree needed for mass anyway |
| Broadphase | SAP with brute-force oracle | Test clarity |
| AI scheduling | Oolite wake times only, no extra stagger | Cadence hashes |
| Event latency | Same-tick FIFO drain, recorded divergence | Deterministic |
| Static ids | Fixed table (decide in phase 1) | Avoids creation-order coupling |
| Legal field | Bit-flag `legalStatus`, kills, bounty separate | `PlayerEntity.m:6024-6040` |
| First-load | 7,490,424 B, ~1.95 MB headroom | Quick task 261110-b7w |

---

## Implications for Roadmap

| # | Phase | Depends on | Delivers | Research flag |
|---|---|---|---|---|
| 1 | Foundation: session split and world core | — | Re-pointed text-scan tests; probe-shape snapshot; `src/app/session/` controllers; `EntityStore`; `RngState`; `hashWorld` with empty-world identity; tick scheduler; sanitiser; `stepSim`; `ShipControl`/`WorldView`; fixed ids; lint probes; `advanceTicks`; audio events reserved | Low |
| 2 | NPC content and build pipeline | with 1 | Vendored NPC models, textures, sounds with provenance; ship specs; build-time octrees and mass; `sounds.json`; lazy loading; drift gate | Medium |
| 3 | Save v3 schema | 1 | Single bump with `world.epoch`, `legalStatus`, kills, pylons, mounts; ordered migration; goldens | Low |
| 4 | Inert world on screen | 1, 2 | Populator v0 with `nullAI` ships (off in e2e); instanced rendering + batch cap; scanner from `WorldView`; sphere/OBB collisions; cabin temperature; populated budget row | Medium |
| 5 | Player weapons and survivability vs inert targets | 4, D4 | Views; lasers and heat; energy/shields; shared damage; HUD gauges; player sounds; planet/sun contact death; game over | Medium |
| 6 | NPC motion and AI runtime, traders first | 4, 5 | NPC motion; `BEHAVIOUR_*` steering; `AiComponent`; event queue; manifest; tree diff; trace harness; trader/shuttle goldens | High |
| 7 | Legal loop, scooping, death and pod | 3, 6 | Pirate/police/station AIs; offences and witnesses; bounty, kills, rating; fines; fugitive refusal; pods and wreckage; escape pod and insurance; hyperspace halving | High |
| 8 | Missiles, ECM, equipment damage and repair | 5, 6 | Missile AI; lock/fire; blast falloff; ECM; hardened missile; equipment damage; F3 repair | Medium |
| 9 | Full populator and traffic | 6, 7 | Rate tables; neighbour graph; repopulation; station launches; mass lock and jump blockage with ships | Medium |
| 10 | Audio and music | 5 | `AudioDirector`; gesture-created context; suspend rules; music streaming; volume settings; `probe.audio` | Medium |
| 11 | Hardening and performance gate | 4–10 | Traffic budget scenes; lazy role loading; QUAL-01; sim cost test | Low |

Track H (octree runtime) after 2 and 4; gates phase 5 if octrees are chosen for hits.

**Critical path:** 1 → 4 → 5 → 6 → 7 → 9 → 11. Phase 8 after 6 (may overlap 7). Content feeds 4, 6, 7, 9. Save v3 before 7. Audio events reserved in 1, player sounds in 5, music in 10. Budget scene created in 4.

**Pitfall-to-phase:** 1/2/3/4/7/8/9/19 → phase 1; 20/29 → 2; 10 → 1, 3, 7; 12/21/23 → 4, 11; 14 → 5, 7, 8; 5/6/15 → 6; 16/24/25 → 9 (decision before 6); 17 → 1, 5; 18 → 7; 13 → 10; 11 → every phase; 22 → decision before 5.

**Research flags:** phase 6 (native behaviours, harness budget), 7 (police rules, offence flags), 5 (hit geometry), 2/H (octrees), 9 (location generators), 4 (instancing), 10 (headless audio, music provenance). Standard patterns: 1, 3, 8, 11.

---

## Open Decisions for the Owner

- **D1. World seed policy.** Rec.: `worldSeed = mix32(marketSeed, epoch)`, saved `epoch`.
- **D3. Chart in flight: simulate or freeze.** Rec.: simulate, as Oolite. Before phase 5.
- **D4. Hit geometry.** Rec.: octree for lasers and ship contact; OBB for missile/pod proximity.
- **D7. Planet/sun contact timing.** Rec.: after shields (phase 5); heat in 4.
- **D9. Positional audio.** Rec.: non-positional.
- **D10. Licensing.** Military laser CC0; mining and beam lasers CC BY 3.0 need attribution (`LICENSE.md` 149-157). Music has no per-file provenance; ship only after it is resolved. `OoliteDocked.ogg` does not exist in Oolite.
- **D11. First-load ceiling.** Lazy role loading; raise only with a recorded measurement.
- **D12–D16.** One save bump in phase 3; no mid-leg snapshots; defer player/NPC storage unification; decide low-fps slow motion in phase 4; record every deliberate divergence in `FIDELITY.md`.

### Owner decisions recorded at milestone start (2026-11-11)

- **D2:** NPCs are not saved. Saves carry the world seed, counters and `nextEntityId`; traffic is regenerated deterministically; a save taken mid-fight resumes at the leg anchor.
- **D5:** Follow Oolite: Escape (double press) ejects the escape pod; pause is P only; R becomes ident; target-station moves to another key. Bindings stay rebindable.
- **D6:** Oolite's meaning of insurance: the pod keeps ship and equipment; cargo and legal status are wiped; the clock jumps forward; no cash payout. Without a pod, death is game over and the last save is loaded.
- **D8:** Simplified NPC docking and launching in v2.0, recorded as a divergence; a faithful `StationEntity`/`DockEntity` port is a later milestone.

---

## Confidence Assessment

| Area | Confidence | Notes |
|---|---|---|
| Stack | HIGH | Zero-dependency verdict and 28/28 audio decode test observed; Worker verdict depends on unmeasured sim cost |
| Features | HIGH (cited) / MEDIUM (derived) | Pin `7437f22`; wreckage lifetime LOW |
| Architecture | HIGH / MEDIUM | AI port volume, batching limits, audio layer MEDIUM |
| Pitfalls | HIGH / MEDIUM | Browser audio and perf projections MEDIUM |

### Gaps to Address

Octree size and reproduction; native behaviour read-through (`ShipEntity.m:3700-5136`); trace harness budget (fallback: scenario goldens); populator location generators; wreckage lifetime; headless audio state; music provenance; clock jumps vs the v1 clock model; ship mass from octree volume; buoy collision radius; mass lock and jump blockage with ships; cross-engine float determinism is not a gate.

---

## Sources

- `STACK.md`, `FEATURES.md`, `ARCHITECTURE.md`, `PITFALLS.md` (2026-11-11); `.planning/PROJECT.md`.
- Oolite `/home/opencode/git/oolite` (HEAD `4bb1f53de`, pin `7437f22`): `OOOpenALController.m:75`, `PlayerEntitySound.m:59-97`, `OOSoundSource.m:207-235`, `OOTrumble.m:957,967`, `Universe.m:1050,1119,5155,9387`, `Resources/Sounds/`, `Resources/Music/`, `LICENSE.md:149-157`.
- MDN Autoplay guide; Chrome Web Audio autoplay notes (MEDIUM).

---
*Research completed: 2026-11-11. Synthesised by gsd-research-synthesizer; persisted by the orchestrator after the runtime refused the subagent's write (#222 self-heal), condensed, with owner decisions D2, D5, D6, D8 appended.*
