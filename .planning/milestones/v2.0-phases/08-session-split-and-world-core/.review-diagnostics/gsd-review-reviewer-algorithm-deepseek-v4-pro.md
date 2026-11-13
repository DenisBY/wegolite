### Summary

Commit `45c689b` adds a per-plan **"Round 2 — 820a435" disposition ledger** to all 16 plans and materially rewrites the four plans at the core of the determinism contract (`08-05`, `08-11`, `08-13`, `08-15`). Every Round 2 finding in the algorithm/determinism focus area is genuinely addressed with executable plan text, test cases, and threat rows — not prose. The two Round 2 BLOCKERs (field-complete `sanitizeEntity` numeric domain; warm-Load vs cold-Continue epoch divergence) are both resolved with concrete mechanisms (`sanitizeEntity` field-complete table; `resetForRestore(0)`). The three HIGH items (uint32 `RangeError` totality, `isNeverSpawned`/world-rng co-commitment, non-dead `MAX_ENTITIES` cap) are resolved. I found **no BLOCKER and no HIGH**. One **WARNING** remains: the coordinate/radius magnitude clamp is specified as `1e12` while the plan claims it "matches `MAX_SAVE_POSITION_MAGNITUDE`", which is actually `1e9` (`src/persistence/save.ts:123`). A few INFO-level numeric-precision notes round out the review.

### Round 2 Resolution Verification

**1. Quaternion `normSq` / coordinate clamp / non-negative speeds / `ai.params` recursive sanitization (`08-11`, `08-13`, `08-05`) — RESOLVED, one residual WARNING.**

- Quaternion norm check now reads `!Number.isFinite(normSq) || !(normSq > 0)` (`08-11-PLAN.md:163`), which catches `normSq === 0` (underflow) and `normSq === Infinity` (the `1e200` overflow case) and matches `src/sim/flight/sanitize.ts:57-59` (`!(orientationLengthSquared > 0) || !Number.isFinite(orientationLengthSquared)`). Near-unit quaternions renormalize under `SANITIZE_QUAT_TOLERANCE = 1e-9` (`08-11-PLAN.md:163`).
- Non-negative speed/desiredSpeed/desiredRange enforced: `!Number.isFinite(v) || v < 0 || v > 1e12 → 0` (`08-11-PLAN.md:164`).
- `ai.params` recursive finite sanitization added (numbers and number-array elements, copy-on-write) (`08-11-PLAN.md:168`), plus `radius`/`ownerId`/`spawnTick`/`rng`/`repairs` repair rules (`08-11-PLAN.md:165-168`).
- `spawnEntity` constructor-boundary validation added (`08-05-PLAN.md:137`, threat `T-08-41`).
- **WARNING:** the magnitude bound is `1e12`, but the plan parenthetical `(MAX_ENTITY_MAGNITUDE = 1e12, matching MAX_SAVE_POSITION_MAGNITUDE)` is factually wrong — see Issues #1.

**2. Warm Load vs cold Continue epoch reset (`08-15`, tested in `08-15`) — RESOLVED.**

- `resetForRestore(epoch = 0)` added to the `WorldLifecycle` interface (`08-15-PLAN.md` Task 1 step 1); `loadFromSave` calls `resetForRestore(0)` inside the synchronous install block before `resume(nextSeed)`/`end()` (`08-15-PLAN.md` Task 3 step 2).
- Cold-boot-Continue equivalence tested: the `load` describe now starts from `epoch === 2` and asserts warm Load produces `epoch === 0` then `epoch === 1` on the next launch/arrival, *identical to a cold Continue* (`08-15-PLAN.md` Task 3 step 3 case (i)/(ii)).

**3. `worldSeedFor`/`forkSeed` uint32 `RangeError` + `begin` epoch saturation + `nextId` safe-integer bound (`08-02`, `08-05`, `08-15`) — RESOLVED.**

- `08-02` documents that fixed-step callers guard before calling (`08-02-PLAN.md` Task 3 step 1).
- `08-05` `store.allocate` refuses `nextId > 0xffffffff`; property test asserts `nextId < FIRST_DYNAMIC_ID + 65536` (`08-05-PLAN.md` Task 2 `<behavior>`, threat `T-08-41`).
- `08-15` `begin` guards `epoch < 0xffffffff` before `epoch += 1`, and `resetForRestore(0xffffffff)` + `begin` refusal is a tested row (`08-15-PLAN.md` Task 1 step 1, Task 2 `<behavior>`).

**4. `isNeverSpawned` & `world.rng.s === forkSeed(world.worldSeed, NO_ENTITY, "world")` co-commitment + plain `uint32` rng encoding (`08-05`, `08-11`, `08-13`) — RESOLVED.**

- `isNeverSpawned(world)` now includes `world.rng.s === forkSeed(world.worldSeed, NO_ENTITY, "world")` (`08-05-PLAN.md:137`), and the doc comment states the co-commitment invariant.
- A test explicitly asserts that drawing `world.rng` on an empty world flips `isNeverSpawned` and emits the section (`08-05-PLAN.md` Task 2 `<behavior>`).
- `WorldSnapshot.rng` pinned to plain `uint32` `number` = `world.rng.s`, with `snapshot.rng === world.rng.s` asserted (`08-13-PLAN.md:107`, `08-13-PLAN.md` Task 2 `<behavior>`); `serializeWorldSection` emits `rng=<uint32>`.

**5. `MAX_ENTITIES = 256` counting non-dead entities (`08-05`, `08-11`, `08-13`) — RESOLVED.**

- `08-05` Task 2 `<behavior>` now tests that killing 3 entities in a world at 256 non-dead before `commit()` frees 3 slots so 3 new spawns succeed in the same tick (bringing `live.length` to 259 and non-dead count to 256); property test asserts non-dead count `live.filter(e => !e.dead).length` never exceeds `MAX_ENTITIES`.

**6. Hot-path allocations + `canon`/`-0`/NaN/Infinity across `stepWorld` — RESOLVED.**

- Lazy `createWorldView` is now the **default** (`08-11-PLAN.md` Task 1 step 1, must_haves truth), not gated behind a benchmark failure.
- `canon` (`src/sim/hash.ts:29-35`) throws on non-finite and normalizes `-0 → 0`; the field-complete sanitizer guarantees every hashed/snapshotted leaf is finite before `canon` runs.
- `08-13`'s 1,000-tick reporter checks `hashFlight(livePlayer)` vs `hashFlight(restoredPlayer)` **before** `entityHashes` (`08-13-PLAN.md` Task 1 step 2).

### Plan-by-Plan Assessment (08-01 through 08-16)

| Plan | Round 2 algorithm/determinism/numeric findings | Resolved at `45c689b`? | Residual note |
|------|-----------------------------------------------|------------------------|---------------|
| **08-01** | probe-shape empty-array wildcard (adversarial BLOCKER) + optional-key audit | ✅ ADOPTED (`T-08-40`, `PROBE_SHAPE_VOLATILE_EMPTY_ARRAY_PATHS = []`, SUMMARY justification) | Not in numeric focus; no residual |
| **08-02** | RNG draw count (9→8), `__purity_` scan race, `RangeError` doc, stream-independence (deferred) | ✅ ADOPTED (draw count, `__purity_` skip + `ENOENT`, `RangeError` guard docs); independence REJECTED as non-blocker | none material |
| **08-03** | `Reflect.get`, `.sort.call/.apply`, `queueMicrotask`, `self`, Frame-scan widen, `__purity_` | ✅ ADOPTED (`SIM_GLOBAL_BANS`/`SIM_SYNTAX_BANS` extended, block-comment strip, full brace-matched `*Frame*` scan) | none material |
| **08-04** | coverage floors; `withdrawProbe`; Pick-facet (deferred per D-12) | ✅ ADOPTED (coverage check recorded; `withdrawProbe`); facet REJECTED per D-12 | none material |
| **08-05** | spawn validation, `isNeverSpawned` rng check, `nextId` bound, `Object.freeze`, `depends_on` | ✅ ADOPTED (all) | residual WARNING #1 (`radius <= 1e12` at `:137`) |
| **08-06** | `window.addEventListener` out of controller factories | ✅ ADOPTED | none material |
| **08-07** | (none) — `scan` O(n²) forward note deferred | ✅ RECORDED (explicit "No action for Phase 8") | none (correct deferral) |
| **08-08** | `document` guards; post-`await` `disposed` short-circuits | ✅ ADOPTED (`syncHeaderCredits`, `closeSaveScreen`, `loadFromSave`/`clearSaveForNewGame`/`queueSnapshot`) | none material |
| **08-09** | recursive AI-zone globs, seal allowed-module exports, `Object.freeze` registry, wake-before-think | ✅ ADOPTED (depth-1/2/3 blocks, `__purity_` probes, export-surface scan, frozen registry, wake test) | none material |
| **08-10** | `ctx` into `createEventRouter`, `syncStatusOverlay` document guard, `pending.length = 0` ×4 | ✅ ADOPTED (all) | none material |
| **08-11** | field-complete sanitize, lazy `createWorldView` default, wake-before-think | ✅ ADOPTED (all) | residual WARNING #1 (`MAX_ENTITY_MAGNITUDE = 1e12` at `:162`) |
| **08-12** | `pending` ×4 audit, `onLaunchKeyDown`/window listeners, `swapSystem` raf + no timers, read `dispose.test.ts:687` | ✅ ADOPTED (all) | none material |
| **08-13** | numeric-domain alignment + all-leaf `fc` injection, parser hardening + deep copy, `rng` uint32 + player-first reporter | ✅ ADOPTED (all) | residual WARNING #1 (`MAX_SNAPSHOT_MAGNITUDE = 1e12` at `:107`) + INFO #2 |
| **08-14** | `disposed` refusal in `advanceTicks`; chart-open early-stop test | ✅ ADOPTED (all) | none material |
| **08-15** | `resetForRestore(0)`, `ctx` router wiring, `begin` epoch guard, dispose `end()` idempotent, v2 key allow-list, `depends_on`; traffic parity deferred | ✅ ADOPTED (all; traffic parity DEFERRED to Phase 12) | none material |
| **08-16** | `probe.sim` guard + `startNewGame`, store-import ban + probe immutability + taint, frame-wait + jump-parity + supersede note | ✅ ADOPTED (all) | jump browser-parity deferred to Phase 12 (recorded in `PROJECT.md`) |

### Strengths

- **The two Round 2 BLOCKERs are closed with real mechanisms, not assertions.** `sanitizeEntity` is now *field-complete* — it names `radius`, `ownerId`, `spawnTick`, `targetId`, `rng.ai`/`rng.combat`, `repairs`, AI timers, and `ai.params` numbers **and number-array elements** with exact repair values and repair-count semantics (`08-11-PLAN.md:162-168`). `resetForRestore(0)` is a dedicated lifecycle operation with warm/cold equivalence tests that start from `epoch === 2` (`08-15-PLAN.md` Task 3 step 3).
- **The quaternion overflow fix is numerically correct.** `!Number.isFinite(normSq) || !(normSq > 0)` is the v1 flight sanitizer's shape (`src/sim/flight/sanitize.ts:57-59`), distinguishing degenerate (`0`) from overflow (`Infinity`) without an epsilon, and the `1e200` injection is explicitly named as the overflow case.
- **Totality of the fixed-step path is now end-to-end.** `store.allocate` (`nextId > 0xffffffff`), `spawnEntity` (safe-integer `tick`/`ownerId`, finite pose/norm), and `begin` (`epoch < 0xffffffff`) together make the `worldSeedFor`/`forkSeed` `RangeError` structurally unreachable inside `stepSim`, and each guard has a test row.
- **The `isNeverSpawned`/world-rng co-commitment is both documented and mechanically enforced** via `world.rng.s === forkSeed(world.worldSeed, NO_ENTITY, "world")`, with a direct "draw rng on empty world flips the predicate" test.
- **The non-dead `MAX_ENTITIES` semantics are pinned with the exact trap case** (256 non-dead + 3 killed-uncommitted ⇒ 3 same-tick spawns succeed, `live.length` 259, non-dead 256, 4th refused).
- **Lazy `createWorldView` is now the default**, not a benchmark-failure fallback; the NPC-free hot path allocates zero `WorldView`/`ShipControl` closures per tick.

### Issues Found

#### 1. **Severity: WARNING** — World coordinate/radius magnitude bound is `1e12`, but the plan claims it "matches `MAX_SAVE_POSITION_MAGNITUDE`", which is `1e9`

- **Plan/Task:** `08-11` Task 2 (`08-11-PLAN.md:162-168`), `08-05` Task 1 (`08-05-PLAN.md:137`), `08-13` Task 1 (`08-13-PLAN.md:107`).
- **Description:** `08-11-PLAN.md:162` writes: `(MAX_ENTITY_MAGNITUDE = 1e12, matching MAX_SAVE_POSITION_MAGNITUDE)`. The live constant is `MAX_SAVE_POSITION_MAGNITUDE = 1e9` (`src/persistence/save.ts:123`). `1e12` is 1000× looser.
- **Direction:** Either (a) align all three to `MAX_SAVE_POSITION_MAGNITUDE` (`1e9`, imported or re-stated), or (b) correct the parenthetical to record an explicit decision: "a world-local cap, chosen 1e12 (> `MAX_SAVE_POSITION_MAGNITUDE` = 1e9, which governs only the player's `FlightState` position in the save, not NPC entity coordinates)".

#### 2. **Severity: INFO** — `08-13` rejection-test parenthetical conflates the threshold with the injected value

- **Plan/Task:** `08-13` Task 2 `<behavior>` (`08-13-PLAN.md:133`).
- **Description:** "a position or radius exceeding `MAX_SNAPSHOT_MAGNITUDE` (`1e308`)" reads as if `1e308` is the threshold; the threshold is `1e12` (`08-13-PLAN.md:107`) and `1e308` is the *injected test value*.
- **Direction:** Reword to "a position or radius of `1e308` (exceeding `MAX_SNAPSHOT_MAGNITUDE` = `1e12`)".

#### 3. **Severity: INFO** — Update-phase `speed = max(0, nav.desiredSpeed)` is not a NaN defense (`Math.max(0, NaN) === NaN`)

- **Plan/Task:** `08-11` Task 1 step 1 (Update phase).
- **Description:** The placeholder integrator's `max(0, nav.desiredSpeed)` clamps negatives but passes `NaN` through. Safe because `spawnEntity` validation (`08-05`), `parseWorldSnapshot` (`08-13`), and `sanitizeEntity` exclude/repair NaN, but worth a one-line comment noting the real NaN/range defense is spawn validation + sanitize.

#### 4. **Severity: INFO** — `repairs` self-repair yields a counter of `1` for a call that only repaired `repairs`

- **Plan/Task:** `08-11` Task 2 `<behavior>` step 8 (`08-11-PLAN.md`).
- **Description:** "if `!Number.isSafeInteger(entity.repairs) || entity.repairs < 0`, reset base to 0 and mark repaired; then repairs grows by exactly 1 per call that made at least one repair". Ensure the sanitize table test's repairs-delta column states the expected value (`1`) explicitly.

### Recommendations

1. **(Before execution, WARNING #1)** Reconcile the `1e12` vs `1e9` coordinate/radius magnitude bound in `08-05`/`08-11`/`08-13`: either align to `MAX_SAVE_POSITION_MAGNITUDE = 1e9` or replace the "matching `MAX_SAVE_POSITION_MAGNITUDE`" parenthetical with a recorded decision that `1e12` is an intentional world-local cap for NPC coordinates.
2. **(Trivial)** Fix the `08-13-PLAN.md:133` "(1e308)" parenthetical to avoid an executor misreading the threshold as `1e308`.
3. **(Trivial)** Add a comment at the `08-11` Update-phase clamp noting the real NaN/range defense is spawn validation + sanitize, not `max(0, …)`.
4. **(No change needed, but verify at execution)** Confirm the sanitize-table repairs-delta column pins the `repairs`-self-repair row to `1` (not `0`).

### Overall Assessment

**READY** for the algorithm, determinism, numeric stability, and performance focus area. Commit `45c689b` absorbs the Round 2 algorithm/determinism findings: the field-complete sanitizer, `resetForRestore(0)` warm/cold epoch equivalence, `RangeError` totality, `isNeverSpawned`/world-rng co-commitment, non-dead `MAX_ENTITIES` semantics, and lazy view construction are all specified with concrete, testable mechanisms and test rows. The single WARNING — the `1e12` vs `1e9` magnitude-bound citation mismatch — is a documentation/consistency defect with no Phase 8 functional impact, and should be corrected before execution.
