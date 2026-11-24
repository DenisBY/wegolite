---
phase: "18"
slug: "stations-buoys-and-collisions"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-20"
---

# Phase 18 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Scope: the changes from the phase base commit `76229f5` to HEAD `0e3700f`. The app is a static client with IndexedDB saves and no backend. The register is the union of the `<threat_model>` blocks in the 22 plans; it was written when the plans were authored. No SUMMARY has a `## Threat Flags` section.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| generated JSON -> loader | the static-hull chunk is parsed at runtime as untrusted input | same-origin build output (meshes, octrees, names) |
| vendored models -> content build | the build reads `.dat` meshes and shipdata from `third_party/oolite/` | CC BY-NC-SA config and mesh data |
| oracle -> port | the port is held to fixtures it did not write | fixture numbers, C line derivations |
| hull table -> hit and octree tests | subentity positions and octrees come from the loaded artifacts | geometry |
| hit records -> ledger, static health, buoy state | a record may name any id, including a static | damage amounts, hashed per-world fields |
| sim -> app, render and HUD | locks, buoy queries and poses cross as spec or layout keys, never as ids | positions, radii, names |
| app -> sim | the buoy mass and the collision opt-in arrive as read-only step options | numbers, flags |
| hook or restore -> flight and world state | a malformed drift or buoy state could arrive through the `?test=1` hook or a snapshot | untrusted JSON |
| stage and kill path -> movable bodies | collisions and blasts write velocities, offsets and the player's drift | hashed vectors |
| world buoy state -> NPC steering | the buoy offset and destruction now steer nearby NPCs | positions |
| reference container -> repository | measurement results cross into FIDELITY.md as text only | text (no Oolite output files) |
| test URL -> session | specs opt into traffic only through `?test=1&traffic=1` | flags |
| phase -> release | the phase is declared done on gate evidence | gate logs |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-18-01 | DoS | `loadStaticHulls` on a corrupt chunk | medium | mitigate | strict `StaticHullArtifactSchema` with subentity, per-octree and total node caps (`src/content/schemas/ship-static-hull.ts:50-170`), iterative walker (`ship-hull.ts:60-93`), `safeParse` in `src/content/ships-static-hulls.ts:59`; rejection cases in `tests/content/ships-static-hulls.test.ts:383-505` | closed |
| T-18-02 | Tampering | committed artifact drifting from the vendored pin | medium | mitigate | `assets:check` in the gates (`compose.yaml`), `emitStaticHulls` in `tools/oolite-ingest/generate.ts:233`, digest golden in `tests/content/ships-static-hulls.test.ts:360-367` | closed |
| T-18-04 | Tampering | oracle self-validation | high | mitigate | `tests/guards/oracle-independence.test.ts` scans every oracle file for Wegolite imports and `src` paths; record in 18-02-SUMMARY | closed |
| T-18-05 | DoS | malformed `.dat` hanging the oracle | low | mitigate | reader bounded by NVERTS/NFACES and fails loudly (`tests/oracles/combat/geometry/dat.ts:86-140`); throw case in `geometry.self.test.ts:149` | closed |
| T-18-06 | Tampering | fixture from the wrong half of the collision rule or a quoted figure | high | mitigate | required `derivation` field (`tests/oracles/combat/response/schema.ts:107`) with C line citations in every fixture; negative grep for `takeEnergyDamage\|canScoop` empty at HEAD; quoted figures only as a SUMMARY cross-check | closed |
| T-18-07 | Tampering | oracle copying the port's numbers | high | mitigate | the independence guard (T-18-04); only 18-02 and 18-03 commits touch `tests/oracles/combat` | closed |
| T-18-08 | DoS | `firstShipHit` on a malformed subentity | high | mitigate | finiteness guards in `src/sim/combat/hit.ts:132-141,155`; non-finite endpoint and over-deep node are a miss (`octree.ts:371,440-443`); NaN case in `tests/sim/combat/hit.test.ts:508-523` | closed |
| T-18-09 | Tampering | static id reaching the store path or a hashed field | high | mitigate | `staticTargetById` before `store.get` (`src/sim/combat/ledger.ts:202,243`), station branch writes nothing; 1,000-hit hash-equality case in `tests/sim/combat/step.test.ts:1033-1060` | closed |
| T-18-10 | Tampering | frozen acceptance worlds changing | high | mitigate | statics without a hull are skipped (`hit.ts:152`); harness uses `realHullTable()`; `tests/acceptance` unchanged; acceptance 21/21 (18-12-SUMMARY) | closed |
| T-18-11 | Tampering | `staticHealth` out of `[0, max]` | high | mitigate | non-finite or non-positive amounts skipped (`ledger.ts:159`), `before > 0` guard and `Math.max(0, …)` (`ledger.ts:206-222`), `sanitizeStaticHealth` backstop (`src/sim/world/sanitize.ts:763`) | closed |
| T-18-12 | Tampering | recharge reviving a destroyed buoy | medium | mitigate | `rechargeStatics` skips `value <= 0` (`src/sim/combat/step.ts:369-389`); 10,000-tick case in `tests/sim/combat/step.test.ts:1524` | closed |
| T-18-13 | Tampering | hit pose and drawn pose diverging | medium | mitigate | one `buoyOrientation` / `buoyPosition` (`src/sim/world/statics.ts`) used by the hit test and the render; pin test in `tests/render/buoy.test.ts:286` | closed |
| T-18-14 | Info disclosure | static or store id leaking into app code | medium | mitigate | `identLocked` carries `{specKey}` only (`src/sim/events.ts:133`); snapshot is `{position, radius}`; `tests/guards/entity-id-scope.test.ts` | closed |
| T-18-15 | Tampering | hostile name string reaching the HUD | low | mitigate | 64-character `StaticNameSchema`; `clampMessage` in `src/app/hud-model.ts`; `tests/guards/hud-message-length.test.ts` | closed |
| T-18-16 | Tampering | non-finite or non-positive `buoyMass` | medium | mitigate | finite positive check (`src/sim/flight/step.ts:509`); NaN, -1 and 0 cases in `tests/sim/hyperspace-blockage.test.ts:426-427` | closed |
| T-18-17 | DoS | refused jump that can never complete | medium | mitigate | 2,048-layout sweep and pristine-world clause (`tests/sim/world/buoy-clearance.test.ts:79-134`); arrival property (`tests/sim/hyperspace-arrival.test.ts:194`) | closed |
| T-18-18 | Tampering | compass left on a destroyed beacon | low | mitigate | fallback before `resolveCompassTarget` (`src/sim/flight/step.ts:447-463`); cases in `tests/sim/compass-beacon.test.ts` | closed |
| T-18-19 | Info disclosure | static id through buoy queries | low | mitigate | queries take `BuoyKey` (`statics.ts`, `src/app/session/render-driver.ts:114-125`); entity-id-scope guard | closed |
| T-18-20 | DoS | `isHitByOctree` on a hostile tree | high | mitigate | `isEnterable` bounds depth on both trees and rejects malformed nodes (`src/sim/combat/octree.ts:567-593`); cases in `tests/sim/combat/collide.property.test.ts:418-457` | closed |
| T-18-21 | Tampering | NaN or Infinity from coincident centres or zero mass | high | mitigate | `normalOrZBasis`, mass guard and finiteness gate (`src/sim/combat/response.ts:217-235,346-357`); `tests/sim/combat/response.property.test.ts` | closed |
| T-18-22 | Tampering | collision damage through the heating laser path | medium | mitigate | `routeScrapeDamage` leaves `cabinTemp` alone (`src/sim/combat/shields.ts:199-212`); no `routeDamage` in `response.ts`; scrape fixtures assert zero heat | closed |
| T-18-23 | Tampering | non-finite or huge drift | high | mitigate | repair and clamp in `src/sim/flight/sanitize.ts:86-103` before integration; NaN and 1e9 cases in `tests/sim/flight-drift.test.ts` | closed |
| T-18-24 | Tampering | drift pass writing non-finite values | high | mitigate | `clampVelocity` and `advance` (`src/sim/world/drift.ts:77-176`); sanitiser after the update (`src/sim/world/step.ts:298-299`); NaN cases in `tests/sim/world/drift.test.ts` | closed |
| T-18-25 | Tampering | drift changing pinned flights | high | mitigate | zero drift omitted (`src/sim/flight/state.ts:202-206`); flight goldens unchanged | closed |
| T-18-26 | DoS | quadratic pair loop at the entity cap | high | mitigate | sorted sweep with sphere prefilter (`src/sim/combat/collide.ts:680-735`); counter guard at `MAX_ENTITIES` (`tests/sim/combat/collision-cost.test.ts:160-185`) | closed |
| T-18-27 | Tampering | non-finite response written to a velocity, drift or position | high | mitigate | response totality (`response.ts:346-357`), `boundVec` clamps (`collide.ts:640-661`), bad masses skipped (`collide.ts:495`) | closed |
| T-18-28 | Tampering | damage applied twice for one contact | high | mitigate | one resolution per pair (`collide.ts:331-366`), separating early return; 600-tick case in `tests/sim/combat/collision-stage.test.ts:297` | closed |
| T-18-29 | Tampering | frozen acceptance worlds changing | high | mitigate | `collisions === true` opt-in (`src/sim/combat/step.ts:767-772`) set only by the app; `tests/acceptance` unchanged; acceptance 21/21 | closed |
| T-18-30 | EoP | collision killing the player before Phase 20 | medium | mitigate | `PLAYER_NOT_DESTROYABLE_UNTIL_PHASE_20` (`collide.ts:240,451`), energy floor (`shields.ts:208`), tripwire `tests/guards/collision-player-death.test.ts` | closed |
| T-18-31 | Tampering | blast writing a huge or non-finite velocity | high | mitigate | `clampDebrisVelocity` and mass guards (`src/sim/world/debris.ts`), `applyPlayerPush` clamp (`src/sim/combat/step.ts:685-693`); floor cases in `tests/sim/world/kill.test.ts` | closed |
| T-18-32 | Tampering | station moved by a blast | medium | mitigate | `blastFrom` never receives the station (`debris.ts:724-792`); station-in-range test in `kill.test.ts:1410-1456` | closed |
| T-18-33 | Tampering | goldens regenerated to hide a behaviour change | medium | mitigate | world, hyperspace, save and kinematic goldens unchanged; the two moved kill-hash pins carry cause comments (18-19-SUMMARY) | closed |
| T-18-35 | Tampering | buoy pushed beyond snapshot bounds | medium | mitigate | `MAX_BUOY_OFFSET` at the writes (`collide.ts:657`, `drift.ts:175`), `cleanBuoyVector` in `sanitize.ts`, bounded parse in `snapshot.ts:1099-1106` | closed |
| T-18-36 | Repudiation | phase declared complete on a red gate | medium | mitigate | remote `verify-full` exit 0 and acceptance 21/21 at `5b3cc96` recorded in 18-12-SUMMARY; only `.planning` changed after it | closed |
| T-18-37 | Tampering | Node twins drifting from the app | medium | mitigate | equality case in `tests/app/session/traffic.test.ts:406` pins `fullHullTable()` to `hullTable` | closed |
| T-18-39 | Tampering | hostile snapshot planting buoy state into the hash | high | mitigate | strict `parseBuoy` with limits (`src/sim/world/snapshot.ts:1099-1150`); `sanitizeBuoyStates` in `hashWorld` and `repairWorldFields`; rejection and hash-without-step cases | closed |
| T-18-40 | Tampering | pristine worlds changing hash | high | mitigate | pristine-omit in hash and snapshot (`serialize.ts:279-284`, `snapshot.ts:571-572`); world goldens unchanged; acceptance 21/21 | closed |
| T-18-41 | Tampering | subentity energy out of `[0, 200]` or revived | high | mitigate | floored write with `before > 0` (`ledger.ts:186-192`), recharge only above 0, sanitiser bound (`sanitize.ts:840-851`); 10,000-tick case | closed |
| T-18-42 | Info disclosure | static ids 6 and 7 leaking outside `src/sim` | low | mitigate | ids in `src/sim/world/ids.ts:49-50`, unreferenced outside `src/sim`; entity-id-scope guard | closed |
| T-18-44 | Tampering | buoy offset or velocity non-finite or out of bounds | high | mitigate | clamps at `MAX_ENTITY_VELOCITY` / `MAX_BUOY_OFFSET` (`collide.ts:643,657`), sanitiser before every hash; `tests/sim/combat/collision-stage.property.test.ts` | closed |
| T-18-45 | Tampering | pair order depending on iteration order | high | mitigate | `compareKeys` / `colliderRank` total order (`collide.ts:263-303`); 30/60/144 Hz case in `tests/sim/world/collision-cadence.test.ts` | closed |
| T-18-46 | Info disclosure | Oolite output or the probe OXP committed | medium | mitigate | `tools/oolite-reference/run-remote.sh:59-67` refuses an in-repo `--out`; no `.oxp`, `Latest.log`, `.png` or new `.steps` added since `76229f5` | closed |
| T-18-47 | Tampering | fixture or tolerance changed to match a measurement | high | mitigate | no 18-20 commit touches `tests/oracles` or `src` | closed |
| T-18-48 | DoS | message line flooded by bounces | low | mitigate | inward drift reflected in `src/sim/dock/step.ts`; 68 m/s and 350 m/s cases in `tests/sim/flight-drift.test.ts` | closed |
| T-18-49 | DoS | non-total comparator on NaN keys | low | mitigate | non-finite key sorts last with ties by id (`collide.ts:263-274`); NaN poses in the stage property suite | closed |
| T-18-50 | DoS | rejected static chunk silently dropping statics | low | mitigate | load inside the boot `Promise.all` (`src/app/session/start-session.ts:275-293`); rejecting-loader test; browser abort in `tests/e2e/statics.spec.ts` | closed |
| T-18-51 | Tampering | sticky routing flag on a detached subentity | low | mitigate | parser rejects it at energy 0 (`snapshot.ts:1134-1140`); sanitiser clears it (`sanitize.ts:853-861`) | closed |
| T-18-52 | Tampering | tripwire guard red on day one or evadable | medium | mitigate | synthetic positive cases in `tests/guards/collision-player-death.test.ts:179-315`, re-run at close (18-12-SUMMARY) | closed |
| T-18-53 | Tampering | acceptance worlds changing because NPCs see buoys | high | mitigate | zero offset returns the layout position (`statics.ts:218`, `view-impl.ts:126-128`); remote QUAL-11 21/21 with identical seeds (18-21-SUMMARY); acceptance and world goldens unchanged | closed |
| T-18-54 | DoS | proximity pass growth | low | mitigate | bounded sorts computed once per pass (`src/sim/npc/collision-chain.ts`, `proximity.ts:305-308`) | closed |
| T-18-55 | DoS | browser spec that never ends | low | mitigate | derived `BUOY_KILL_BOUND_TICKS` and bounded loop that fails with diagnostics (`tests/e2e/statics.spec.ts`) | closed |
| T-18-56 | Tampering | pins or goldens silently re-pinned | medium | mitigate | 18-21-SUMMARY records no re-pin; the edited Phase 14/17 tests gained only setup lines citing the owner decision of 2026-11-20 | closed |
| T-18-SC | Tampering | npm/pip/cargo installs | low | accept | `package.json`, `package-lock.json`, `Dockerfile`, `compose.yaml` unchanged since `76229f5`; base images digest-pinned | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-18-01 | T-18-SC | No package or base image was installed or changed in Phase 18 (verified by an empty diff of the manifests and Docker files since `76229f5`); supply-chain exposure is unchanged from the previous phase. | plan-time disposition (all 22 plans) | 2026-11-20 |

*Accepted risks do not resurface in future audit runs.*

---

## Audit Observations (non-blocking)

These do not reopen any threat; they are defence-in-depth notes for later phases.

1. T-18-27: the collision stage writes `player.position` (`src/sim/combat/collide.ts:663`) without a clamp, unlike the entity and buoy writes. The displacement is finite through the response gate, and `sanitizeFlightState` repairs a non-finite position before the next step.
2. T-18-26: the sweep does not allocate per pair, but overlapping-sphere pairs allocate in the narrow phase (`compareZOrder` literals, `poseOf`). The cost guard bounds the number of such pairs.
3. T-18-06: the negative grep for `takeEnergyDamage|canScoop` is a plan acceptance check, not a CI guard; nothing re-checks it on future edits.
4. `sanitizeBuoyStates` heals a non-finite `subentityEnergy` to 200, not 0 (`src/sim/world/sanitize.ts:841-843`). The choice is documented in code and reachable only from corrupt input; the normal path cannot revive a detached subentity.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-20 | 54 | 54 | 0 | gsd-secure-phase (gsd-security-auditor, ASVS L1, block_on high; static read at `0e3700f`, no tests run) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-20
