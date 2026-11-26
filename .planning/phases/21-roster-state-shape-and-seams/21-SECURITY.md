---
phase: "21"
slug: "roster-state-shape-and-seams"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-26"
---

# Phase 21 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| compiled catalogue -> inert populator | catalogue records (29 from Phase 21) feed the weighted pick of the frozen inert world | game state (no personal data) |
| local Oolite checkout -> repository | third-party bytes enter the licence-audited tree | third-party assets (no personal data) |
| snapshot text -> world | a stored or test-supplied snapshot is parsed into entity and world-record state (untrusted shape) | game state (no personal data) |
| SpawnInit -> world | spawn callers (hooks, later populators) supply the new v5 field values | game state (no personal data) |
| in-memory world -> hash text | a corrupt value must be repaired before it prints | game state (no personal data) |
| generated hull chunk -> browser | `ships-hulls.json` is fetched lazily and validated before `hullTable` builds the lookup | build-time content (no personal data) |
| vendored plists, `.dat` and textures -> converter | Oolite data compiled into shipped JSON, GLBs and atlases | build-time content (no personal data) |
| compiled catalogue -> sim spawn paths | record fields that later phases read at spawn | game state (no personal data) |
| AI params -> snapshot | priority params are open-keyed data bounded by the existing limits | game state (no personal data) |
| generated JSON -> browser | `ships-npc.json` and `ships-hulls.json` are fetched as `?raw` and validated at load | build-time content (no personal data) |
| AI and stand-in code -> world removal | a later caller decides that a ship leaves | game state (no personal data) |
| ledger records -> reaction list | hit records (possibly from hook-spawned sources) become reaction data later read by the law | game state (no personal data) |
| compiled catalogue -> network fetches | GLB paths from the catalogue drive background same-origin requests | static assets (no personal data) |
| AI and hook code -> fire queue | actors request shots through `ShipControl.fire` | game state (no personal data) |
| sim event -> app and render | the destroy events cross into presentation code | game state (no personal data) |
| debris content / app builders -> sim draw | goods and market quantities cross from content into the simulation | game state (no personal data) |
| `?test=1` hook -> world | the shooter and anarchy hooks spawn entities | game state (no personal data) |
| test literals -> re-pin | a moved hash is accepted only with a measured cause | test artefacts (no personal data) |
| converter output -> NPC render layer | merged GLBs and per-hull atlases replace multi-primitive hulls in every NPC draw | build-time content (no personal data) |
| measured counts -> recorded budget | the budget Phase 22's populator ships into is set from plan 21-19's numbers | planning record (no personal data) |
| loaded GLB assets -> NPC layer; variant material -> GPU | plan 21-18 (deferred): not built | n/a |

---

## Threat Register

Register authored at plan time (the `<threat_model>` block of each plan); evidence verified at HEAD `0b694864` (code identical to `f7ded029`; phase base `2060884c`) by gsd-security-auditor on 2026-11-26.

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-21-01 | Tampering | `planInertPopulation` fed a grown or reordered catalogue, moving the frozen experiment | high | mitigate | Plan 21-01; evidence: populate.ts:210 (`INERT_RECORD_KEYS`, frozen), :231-245 (`===` reduction), :278 (before any draw); inert-isolation.test.ts (39 tests: epoch 1-20 golden, synthetic growth, totality property) green | closed |
| T-21-02 | Repudiation | a later plan regenerating the pin to make its tests pass | medium | mitigate | Plan 21-01; evidence: inert-isolation.test.ts:8-14 and tests/helpers/write-inert-epochs-golden.ts:17-18 (owner-reserved, D-04); `git log` of tests/golden/world/inert-lave-epochs-1-20.json shows only creation commit 411f7e00; later plans run the full `docker compose run --rm test` | closed |
| T-21-03 | Tampering | a vendored byte from the checkout's working tree instead of the pinned blob | high | mitigate | Plan 21-02; evidence: scripts/vendor-oolite.sh:291 (`git cat-file blob` at FULL_COMMIT), :297 (pinned.sha256), :383-386 (byte verify), :392-393 (refuses a changed committed digest); auditor re-check: all 60 new files equal the 7437f22 blobs and CHECKSUMS | closed |
| T-21-04 | Repudiation | an unprovenanced asset (licence breach) | high | mitigate | Plan 21-02; evidence: vendor-oolite.sh:502-505 (no ASSETS.md row -> exit 1); compliance-assets.test.ts:111, :124, :155 green; NOTICE §3 (general clause; extended in 0b694864) | closed |
| T-21-05 | Denial of service | an oversized or malformed image entering the build | low | accept | Plan 21-02; see AR-21-01 | closed |
| T-21-06 | Tampering | strict v5 entity parser fed an out-of-range, non-finite or prototype-named value | high | mitigate | Plan 21-03; evidence: snapshot.ts:368-372 (FORBIDDEN_KEYS), :789-807 (`asObject` allow-list), :1521-1555 (entity allow-list), :1617-1640 (role, cargoKind by `CARGO_KINDS.length - 1`, podCommodity), limits.ts:207-220 (anchored patterns) | closed (audit note 2) |
| T-21-07 | Tampering | a corrupt in-memory value reaching `canon` or reading as pristine | medium | mitigate | Plan 21-03; evidence: sanitize.ts:737 (`cleanV5Fields`, per-leaf), :937 (called by `sanitizeEntity`); step.ts:185 (per-tick pass before any hash); serialize.ts:372-399 (`hashWorld` repairs the world records); v5-hash.test.ts:508 (idempotence) | closed (audit note 1) |
| T-21-08 | Denial of service | an oversized role or commodity string inflating hash text | low | mitigate | Plan 21-03; evidence: limits.ts:207 (32), :217 (64); world.ts:473-485, :688, :702-706 (spawn refusal); snapshot.ts:1617-1635 (parser); sanitize.ts:746, :758-764 (repair) | closed |
| T-21-11 | Tampering | a prototype-named or repeated alias key in the hull lookup | medium | mitigate | Plan 21-04; evidence: ship-hull.ts:116-120 (strict, `min(1)`, `max(MAX_HULL_ALIASES)`), :144-160 (catalogue repeat check); traffic.ts:346-371 (`Map`, throws on repeat) | closed |
| T-21-33 | Tampering | a malformed record value compiled as a default instead of failing | medium | mitigate | Plan 21-05; evidence: npc-ships.ts:370-386 (`floatExtra`), :393-408, :450-470 (`fuzzyExtra` 0..1), :495-503, :515-545 (`escort_roles`); ship-npc.ts:199, :215, :220-228, :233-234 (bounded zod) | closed |
| T-21-34 | Elevation of privilege | compiled missile counts reaching an NPC before missiles are ported | medium | mitigate | Plan 21-05; evidence: no `missiles`/`maxMissiles` in entity.ts or traffic.ts, no read under src/sim outside player/ (rg); tests/guards/npc-missiles-tripwire.test.ts green; FIDELITY.md E-194 (:228, :3253) | closed |
| T-21-12 | Tampering | world-record parser fed duplicates, unsorted lists, out-of-range or prototype-named keys | high | mitigate | Plan 21-06; evidence: snapshot.ts:1391-1415 (strictly ascending ids), :1418-1435 (station), :1438-1470 (groups, ascending, allow-list); sanitize.ts:1115-1135 (sort, de-duplicate, bound), :1187-1219; step.ts:297-311 and serialize.ts:381-385 (repair before print); sanitize.test.ts:2327 (totality) | closed |
| T-21-13 | Denial of service | oversized groups or marks inflating hash text | medium | mitigate | Plan 21-06; evidence: limits.ts:290 (`MAX_STATION_MARKS` 32), :298 (`MAX_WORLD_GROUPS` 128); snapshot.ts:1399, :1441 (refused); sanitize.ts:1129, :1206 (truncated) | closed |
| T-21-14 | Elevation of privilege | a priority AI reaching play before its port, or a second `onEvent` handler | medium | mitigate | Plan 21-07; evidence: priority.ts:46-48 (`think` only, no `onEvent`); tests/guards/priority-ai-unspawned.test.ts green; tests/guards/on-event-handlers.test.ts unchanged 2060884c..HEAD and green | closed |
| T-21-35 | Denial of service | oversized priority params inflating hash text | medium | mitigate | Plan 21-07; evidence: snapshot.ts:922, :939, :945 (existing caps); priority.ts:48 (reads no param); priority-params.test.ts:240, :257, :274 (largest shape, one over refused) | closed |
| T-21-09 | Tampering | GLB path or texture URI built from a record key reaching a fetch outside `models/` | high | mitigate | Plan 21-08; evidence: src/content/npc-glb-path.ts:9 (anchored lower-case pattern); glb.ts:251-253 (build); asset-cache.ts:136 (load refusal); ship-npc.ts:97, ship-debris.ts:35 (schema); glb.ts:1691 (URI prefix, unchanged); committed GLB URIs all `../textures/` with no `..` | closed |
| T-21-10 | Denial of service | an oversized hull chunk or catalogue at boot | medium | mitigate | Plan 21-08; evidence: ship-hull.ts:47 (`MAX_HULLS` 24), :56, :67 (200,000 B; 162,546 measured), :80-92 (iterative `checkHullTree`); traffic.ts:362 (alias shares HullData); 21-08-SUMMARY "First-load measurement" | closed |
| T-21-17 | Elevation of privilege | a departure routed through `killShip` crediting a kill or paying a bounty | high | mitigate | Plan 21-09; evidence: retire.ts:45-62 (`store.kill` + `shipTargetLost` only; no credit, no `shipDestroyed`); tests/guards/departure-path.test.ts:34-41 green | closed |
| T-21-18 | Repudiation | the lethal hit's offence dropped | high | mitigate | Plan 21-09; evidence: ledger.ts:241-256 (every applied laser record pushed, lethal flagged once per victim), :297, :368, :400; hit-reaction.test.ts:163, :474 green | closed |
| T-21-19 | Information disclosure | the view leaking a mutable reference to combat or world state | low | mitigate | Plan 21-09; evidence: view-impl.ts:252-257 (fresh object of scalars); view.ts:80-83 (readonly) | closed |
| T-21-15 | Tampering | a prototype-named role or category becoming an object key | medium | mitigate | Plan 21-10; evidence: plist-value.ts:65-68 (`Map`), :93 (`Object.create(null)`); entry-array schemas role-categories.ts:33-48, auto-ai-map.ts:30-43, comms.ts:57-86 (anchored; refuse `__proto__`) | closed (audit note 2) |
| T-21-16 | Denial of service | a reference cycle or an oversized closure in the comms converter | low | mitigate | Plan 21-10; evidence: comms.ts:110-120, :169 (iterative queue, visited set); comms schema :62-102 (bounded counts and lengths); comms.test.ts green | closed |
| T-21-20 | Tampering | a prefetch URL built from data outside the validated catalogue | medium | mitigate | Plan 21-11; evidence: npc-models.ts:64 (keys only), :117, :159 (path only from `glbFor`); asset-cache.ts:136 (pattern re-check); render-driver.ts:263-268 | closed |
| T-21-21 | Denial of service | unbounded parallel downloads starving the docked UI or the first frame | low | mitigate | Plan 21-11; evidence: npc-models.ts:94 (`NPC_PREFETCH_CONCURRENCY` 2), :112; render-driver.ts:266 (one-shot latch); docs/PERFORMANCE.md (cold start 8,933,194 B traffic on, under 9,437,184) | closed |
| T-21-22 | Tampering | determinism broken by load timing | medium | mitigate | Plan 21-11; evidence: commits d17c00db, c83a3de5, dee26196, b51c2224 touch no src/sim; no src/sim read of the loader; tick-parity.test.ts green | closed |
| T-21-23 | Elevation of privilege | a non-actor or repeated fire request | medium | mitigate | Plan 21-12; evidence: control-impl.ts:124-130 (actor-only); world.ts:367-378 (`MAX_FIRE_REQUESTS` bound, (id, facing) de-duplication); combat/step.ts:301 (sorted drain); fire-decision-source guard green | closed |
| T-21-24 | Tampering | an unknown facing or weapon key reaching the ray or the laser table | medium | mitigate | Plan 21-12; evidence: world.ts:371 (`isFacing`, safe-integer id); combat/step.ts:309, :318 (`isMountKey` before any ray), :342, :410; limits.ts:253 (`WEAPON_TYPE_PATTERN`) | closed |
| T-21-25 | Information disclosure | an entity id or a live sim object leaking through the event's velocity | low | mitigate | Plan 21-13; evidence: drift.ts:122-157 (fresh `vec`); kill.ts:184; combat/death.ts:74; entity-id-scope and player-death-producer guards green | closed |
| T-21-26 | Denial of service | a non-finite or huge velocity producing NaN positions in the render layer | low | mitigate | Plan 21-13; evidence: drift.ts:127-139 (`finiteOr0` on every term); limits.ts:126 (`MAX_ENTITY_VELOCITY`, sanitised per tick); explosions.ts:329-334; explosion-layer.test.ts green | closed |
| T-21-28 | Tampering | a content draw consuming the combat stream and moving unrelated draws | high | mitigate | Plan 21-14; evidence: debris.ts:1212 (stateless `forkSeed(..., "pod")`), :1232 (placements stay on `victim.rng.combat`); rng.ts:79, :168-171; debris-pod.test.ts:175 (identical with and without contents) | closed |
| T-21-36 | Tampering | malformed goods, market or counts making the draw throw or emit out-of-range contents | medium | mitigate | Plan 21-14; evidence: debris.ts:628, :777, :1207-1211 (guards); debris-pod.test.ts:542, :600 (fast-check totality); world.ts:702-712 (spawn refusal); sanitize.ts:758-767 | closed |
| T-21-37 | Repudiation | a live spawn path relying on the scarce-legal fallback unnoticed | medium | mitigate | Plan 21-14; evidence: tests/guards/pod-kind-fallback.test.ts:32-38 (inert path allow-listed) green; todo 2026-11-25-pod-kind-live-populator.md present | closed |
| T-21-27 | Tampering | pod contents depending on player trades, breaking replay equality | high | mitigate | Plan 21-15; evidence: market.ts:73-78 (`firstGenerationMarket`, seed only); step-options.ts:150-176 (one shared builder, frozen, keyed `id:economy`); step-options.test.ts:326 green | closed |
| T-21-29 | Repudiation | a re-pin hiding an unintended move | medium | mitigate | Plan 21-15; evidence: 21-15-SUMMARY.md:76-99 (printed segment diff, two lines); tick-parity.test.ts:842 and combat.spec.ts:102 (comments name 21-15); inert golden unmoved; tests/acceptance unchanged 2060884c..HEAD | closed |
| T-21-30 | Elevation of privilege | the anarchy hook reachable in the production bundle | high | mitigate | Plan 21-16; evidence: test-flags.ts:34 (`test === "1"`); start-session.ts:510, :863 (hook bound only when enabled); probe-publisher.ts:336-345; probe.ts:684-688 (taints); tools/ai-harness/dist-check.ts unchanged; probe-publisher.test.ts:1032 green | closed |
| T-21-31 | Denial of service | 29 extra entities hitting the 256 cap or the debris gates | low | mitigate | Plan 21-16; evidence: test-spawn.ts:428 (free room), :455 (refuses before any spawn), :458-463 (id range); probe-publisher.test.ts:1032 suite green | closed |
| T-21-39 | Tampering | an atlas that silently changes a hull's look | medium | mitigate | Plan 21-17; evidence: atlas.ts:60-87 (conditions (a)-(e), recorded refusal), :181; atlas.test.ts:701 (every corner), :1215 and the per-GLB mip-5 cases (TOOLS-WR-01 gutter) green | closed |
| T-21-40 | Repudiation | a derived atlas shipped without provenance | medium | mitigate | Plan 21-17; evidence: 65 atlas rows in ASSETS.md; compliance-assets.test.ts:225, :236 green; NOTICE atlas clause (0b694864) | closed |
| T-21-41 | Denial of service | atlases growing texture memory or first-load bytes past the ceiling | medium | mitigate | Plan 21-17; evidence: atlas.ts:98 (`MAX_HULL_ATLAS_SIDE` 2048); atlas.test.ts:360, :524; docs/PERFORMANCE.md (re-measured after the gutter: cold start unchanged, texture memory 1,200.1 MiB summed); todo 2026-11-26-npc-atlas-texture-memory (audit note 3) | closed |
| T-21-38 | Tampering | two hulls or paint schemes aliased to one mesh set or texture | medium | mitigate | Plan 21-18 deferred (21-18-SUMMARY, 2026-11-26): no `renderKey`, `variantKey` or `gl_InstanceID` under src (rg); todo 2026-11-26-npc-variant-family-instancing runs 21-18-PLAN.md (with this register) as written | deferred: no code shipped |
| T-21-42 | Denial of service | a variant shader that fails to compile or exceeds the texture units | medium | mitigate | Plan 21-18 deferred: no variant material or shader exists; same todo | deferred: no code shipped |
| T-21-32 | Repudiation | a budget raised before both D-05 fixes are measured, or past the envelope unannounced | medium | mitigate | Plan 21-19; evidence: budgets.ts:24 (`DRAW_CALL_BUDGET` 50, unchanged); 21-19-SUMMARY.md:91; PROJECT.md:371 and 21-CONTEXT.md:34 ("flagged for owner review", no raise while 21-18 is deferred) | closed |
| T-21-43 | Tampering | a duplicated spec constant drifting from the recorded budget | low | mitigate | Plan 21-19; evidence: tests/e2e/helpers/budgets.ts:24, :27, :43 are the only declarations (rg over tests and src); tests/app/e2e-budgets.test.ts green | closed |
| T-21-SC | Tampering | npm/pip/cargo installs | low | accept | all 19 plans; see AR-21-02 | closed |

*Status: open · closed · open — below high threshold (non-blocking) · deferred: no code shipped*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

**Audit note 1 (non-blocking, T-21-07):**
- `hashWorld` does not call `sanitizeEntity` itself. The entity repair is the per-tick pass in `stepWorld` (src/sim/world/step.ts:185); `hashWorld` repairs only the world records (src/sim/world/serialize.ts:381-385). 21-03-SUMMARY.md:163 records this deviation from the plan's key link.
- If an entity's v5 integer were made non-finite outside a step, `canon` would throw (it fails loudly; it does not print a pristine value).
- Only a code defect can cause that: spawn and the parser both refuse such values.

**Audit note 2 (non-blocking, T-21-06 and T-21-15):**
- `COMMODITY_KEY_PATTERN` (`^[a-z0-9_]*$`, src/sim/world/limits.ts:220) accepts `__proto__` as a `podCommodity` value. The plan's "no `__proto__` can pass" holds for the role pattern only.
- No consumer at HEAD indexes an object by `podCommodity`. It is stored, quoted by `encodeHashString` and snapshotted.
- Likewise, the content patterns `ROLE_PATTERN` and `COMMS_KEY_PATTERN` accept `constructor`. The primary mitigation still holds: entry arrays, `Map` and `Object.create(null)`. No src module reads those JSON files yet.
- The first consumers (Phase 22 scooping, the comms reader) should look values up with `Map` or `Object.hasOwn`.

Resolved by the orchestrator, 2026-11-26: `COMMODITY_KEY_PATTERN` now refuses `__proto__` (src/sim/world/limits.ts). Spawn, the snapshot parser, the sanitiser and the pod draw share that pattern; the test is in tests/sim/world/v5-hash.test.ts. `ROLE_PATTERN` admits no underscore, so `__proto__` cannot pass it. `constructor` remains a valid role or comms key by design. The first consumers of the content tables must look keys up with `Map` or `Object.hasOwn`, which the entry-array schemas already require.

**Audit note 3 (non-blocking, T-21-41):**
- Texture memory has no cap; it is measured only.
- After the TOOLS-WR-01 gutter it is 1,200.1 MiB summed over the 29 records, and 828.3 MiB counting each file once.
- Tracked by todo 2026-11-26-npc-atlas-texture-memory.

**Audit note 4 (informational, T-21-03 and T-21-04):**
- In local mode, scripts/vendor-oolite.sh writes `pin.json` and `CHECKSUMS.sha256` (:482-490) before it checks the ASSETS.md rows (:502-505). A missing-row refusal therefore leaves those two files rewritten.
- This ordering predates Phase 21 (Phases 2 and 16). compliance-assets.test.ts catches the mismatch.

**Audit note 5 (informational, T-21-30):**
- src/sim/ai/test-spawn.ts:414-416 says the hook "taints the session before it calls this". In fact src/app/probe.ts:684-688 taints after the spawn succeeds, as the other three spawn hooks do.
- The call is synchronous, so no save can run in between. Only the doc comment was wrong; the orchestrator corrected it on 2026-11-26.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-21-01 | T-21-05 | The 60 new images are Oolite's own pinned textures (byte-identical to the 7437f22 blobs, verified by the auditor). The PNG decoder keeps `MAX_TEXTURE_DIMENSION` 8192 (tools/oolite-ingest/convert/textures.ts:532, :595-601) and its colour-type check (:614) | Plan 21-02 threat register, confirmed by gsd-security-auditor | 2026-11-26 |
| AR-21-02 | T-21-SC | Supply chain (npm installs): Phase 21 installs or changes no package. package.json, package-lock.json, the Dockerfiles and the Compose files are unchanged 2060884c..HEAD; the 21-17 PNG encoder uses `node:zlib` | Plan threat registers (all 19 plans), confirmed by gsd-security-auditor | 2026-11-26 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-26 | 44 | 42 | 0 | gsd-security-auditor (opus), ASVS L1, block_on high; 2 deferred with plan 21-18 (no code shipped); Docker Vitest: 41 files, 2,135 tests green |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-26
