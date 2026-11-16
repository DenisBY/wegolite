# Phase 8 Plan Review, Round 5: algorithms and determinism lens (reviewer-algorithm-opus)

Commit reviewed: `afc4fe0`. Lens: fixed-timestep determinism, seeded RNG and forking, hashing and canonicalization, numeric edge cases (NaN, -0, quaternions, float rounding, bounds), snapshot and restore equivalence, complexity bounds.

Method: I read 08-05, 08-11 and 08-13 in full, and the algorithm-bearing parts of 08-02, 08-03, 08-07, 08-09, 08-14, 08-15 and 08-16. For the split plans (08-01, 08-04, 08-06, 08-08, 08-10, 08-12) I read the objectives and the Round 4 disposition rows. I traced each claim to source: `src/sim/hash.ts:13-35` (fnv1a32 low byte, canon), `src/sim/math.ts:53-57` (normalize), `src/sim/math.ts:227-236` (mulberry32), `src/sim/loop.ts` (accumulator) and the four `saveBoot.store` sites in `src/app/game-session.ts`. I ran one scratch check in the test container: `docker compose run --rm -v /tmp/r5algo:/scratch test node /scratch/k.mjs`. Its output is quoted under 08-13. I modified nothing in the repository.

---

## Round 4 consensus items: status

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | NaN in `ai.params` cannot be rejected after JSON | **Resolved** | `08-05-PLAN.md:148` fixes the ParamValue domain: null and boolean scalars are legal, array elements are finite numbers or strings, and no number is non-finite. `08-13-PLAN.md:23` and `:115`: `snapshotWorld` walks every number leaf and throws `SnapshotError("non-finite")` before it builds output. `08-13-PLAN.md:154-155`: the post-JSON converse is narrowed to number slots and array elements (ii), a scalar null is accepted (iii), and the generator now emits null and boolean params (gated on `fc.constant/constantFrom/boolean`). |
| 2 | `\.store\b` gate can never print nothing | **Resolved** | `08-16-PLAN.md:146` narrows the regex to `sim/world/store\|world\??\.store\b\|\.store\??\.(live\|get\|allocate\|kill\|commit\|nextId)\b\|\bEntityStore\b`. I ran it on the current tree: it exits 1, and the four `saveBoot.store` uses (`read`, `clear`, `dispose`, `queueAutosave(saveBoot.store, …)`) do not match. |
| 3 | `test.advanceTicks` undefined outside the manual clock | **Resolved** | `08-16-PLAN.md:30` and `:128-129` keep it always a function that delegates to the driver, which refuses (`08-14-PLAN.md:29`). The fixture check at `08-16-PLAN.md:143` asserts `"function"` in both hook states. |
| 4 | Shared limits defined three times | **Resolved** | `08-05-PLAN.md:31` and `:146` define one `limits.ts` with no imports. The redefinition gate appears at `08-05-PLAN.md:185`, `08-11-PLAN.md:205-206` and `08-13-PLAN.md:193`, and `sanitize.ts` and `snapshot.ts` import every limit and export none. |
| 5 | Enum leaves unchecked; `registry[aiKey]` prototype dispatch | **Resolved** | Spawn uses `includes` (`08-05-PLAN.md:153`). Sanitize rule 9 (`08-11-PLAN.md:185`) kills on an unknown kind and resets an unknown scanClass, behaviour or aiKey. Dispatch goes through `aiModuleFor` with `Object.hasOwn` (`08-11-PLAN.md:35`, `:139`), and the gate `registry\[[^\]]+\]\.(think\|onEvent)` must print nothing (`:152`). The parser rejects unknown vocab (`08-13-PLAN.md:26`). |
| 6 | Quaternions that pass spawn or sanitize fail the parser | **Resolved** | Spawn requires `\|normSq-1\| <= QUAT_UNIT_TOLERANCE` (`08-05-PLAN.md:157`). Sanitize rule 2 (`08-11-PLAN.md:178`) treats non-finite components, or `normSq` non-finite or `< MIN_QUAT_NORM_SQ`, as identity. It renormalises, re-checks, and falls back to identity. The table includes `1e-160`, `3e-161`, `7e-158` and `1e200`. I checked the 1e-12 floor: for `normSq >= 1e-12`, `length >= 1e-6`, so correctly rounded `sqrt` and division give a result `normSq` within a few ulp of 1, far inside 1e-9. Sanitize, spawn and the parser now share one domain. |
| 7 | `worldSeed` never checked as uint32 | **Resolved** | `createWorld` throws a RangeError (`08-05-PLAN.md:32`, `:151`; rows at `:212`). The parser rejects 1.5, -1, 2**32 and null (`08-13-PLAN.md:26`, `:152`). |
| 8 | `createEventRouter` signature contradiction | **Resolved** | `08-10-PLAN.md:40`, `:158` and `:177` (gate `createEventRouter\(ctx,`), and `08-15-PLAN.md:108`. `rg "createEventRouter\((subscribers\|\))"` finds only the R4 ledger row. |
| 9 | Lint guard gaps (alias import, module state, eval/Intl/localeCompare, computed sort) | **Resolved** | `08-03-PLAN.md:27`, `:150`, `:170` (eval, new Function, Intl, localeCompare, `sort(undefined)`, computed `["sort"]`/`sort["call"]`). `08-09-PLAN.md:30-31`, `:192-194`, `:211` (`importNames: ["createSeededRandom"]` at depth 1 and depth 2; `AI_MODULE_STATE_BANS`). Residual forms are documented, with the 1,000-tick equality as the behavioural backstop. |
| 10 | Restore check compared only rounded hashes | **Resolved in intent, but the new exact check has a defect** | `08-13-PLAN.md:22` and `:116` add `JSON.stringify(snapshotWorld(live)) === JSON.stringify(snapshotWorld(restored))` and `toStrictEqual` on players. The exact comparison as specified is order-sensitive and fails on test-pilot params. See NEW finding A1 under 08-13. |
| 11 | AI drain limits passes, not deliveries | **Resolved** | `08-11-PLAN.md:30`, `:171`, `:191`: `MAX_AI_EVENTS_PER_DRAIN = 4096` per drain, `MAX_AI_QUEUE_LENGTH = 4096` at post, saturating `aiDropped`, and an exact conservation-law test. I checked the conservation identity: Δ`aiDropped` = capped-at-post + (pre + accepted − dequeued), with the queue empty at return. |
| 12 | `ShipControl` accepts out-of-domain values | **Resolved** | `08-07-PLAN.md:30` and `:117`: every argument is checked against `limits.ts`, and out-of-domain calls are ignored rather than clamped. `perform` uses `includes`. `scheduleWake` requires `tick + ticks <= MAX_UINT32`. |
| 13 | No Firefox run | **Resolved** | `08-12-PLAN.md:137` and `08-15-PLAN.md:36`, `:216`, `:232` record a non-blocking `e2e-cross` run. |
| 14 | Deviations, benchmark rerun, stale anchors | **Resolved** | `08-08-PLAN.md:165` and `08-12-PLAN.md:137` record the deliberate deviations. `08-15-PLAN.md:233` and `:334` allow best of three. `08-08-PLAN.md:80`, `08-10-PLAN.md:95` and `08-12-PLAN.md:91` tell the executor to locate code by name or pattern. |

All 14 Round 4 items are addressed in the plan text. Item 10's new exact comparison has a defect of its own, reported as finding A1.

---

## 08-01

**Summary.** Pins the safety nets for the split: the probe-shape fixture, session-source helpers and the `test:e2e:fast` contract.

**Strengths.** The probe-shape contract that every `probe.test` member reads `"function"` is what 08-16 now honours for `advanceTicks` (Round 4 item 3), so the two plans agree.

**Concerns.** No new algorithmic concerns. This plan has no simulation arithmetic.

**Suggestions.** None.

**Risk.** LOW.

## 08-02

**Summary.** Records flight-hash pins from the unmodified tree, then makes the stream state plain data (mulberry32 with `RngState`) and adds the D-02/D-04 `mix32` derivation behind an owner checkpoint.

**Strengths.**
- `mix32(a, b) = fmix32((a>>>0) ^ fmix32((b + 0x9e3779b9)>>>0))` (`08-02-PLAN.md:160`, `:191`) is a bijection in each argument, because `fmix32`, XOR with a constant and `+C mod 2^32` are each bijections on uint32. The 1,000-epoch and "id 101 across worlds" distinctness rows (`:195`) are therefore guaranteed by construction rather than probabilistic. `forkSeed = mix32(mix32(ws, id), code)` is injective in `ws` for fixed `(id, code)` and in `id` for fixed `(ws, code)`.
- Pinning vectors from an independent scratch re-implementation in the same commit as `rng.ts` (`:196`, gate `:214`) is the right control for a one-way format.
- The Weyl-cycle caveat is recorded (`:198`).

**Concerns.**
- **LOW (B1): the "safe at Phase 8-12 draw rates" claim is not quantified** (`08-02-PLAN.md:198`). Every mulberry32 stream walks the single cycle `s += 0x6d2b79f5`, which has an odd step and so full period. Two streams overlap as shifted copies when `(s_B − s_A)·G⁻¹ mod 2^32` falls within the draw count D. For M streams that each draw D values in one world, P(any overlap) ≈ M²·D / 2³². With the test pilot's rate of about 8 draws/s, D ≈ 4,800 in a 10-minute visit, and with M = 256 the probability is about 7%. This does not affect determinism, but it is a real statistical correlation that later phases (Monte-Carlo damage, Phase 13+) should be able to check against a stated budget.
- **LOW (B2):** `RNG_PURPOSE_CODES[purpose]` is a plain-object lookup (`:192`). An untyped caller passing `"constructor"` would get a function, and `(fn + C) >>> 0` is 0, a silent degenerate fork instead of a RangeError. Today only typed internal callers reach it.

**Suggestions.** In the Key Decisions row, state the bound `M²·D/2³² ≪ 1` with the Phase 8 figures, so a later phase raising D or M must re-check it. Make `RNG_PURPOSE_CODES` a frozen null-prototype object, or look it up with `Object.hasOwn` and throw RangeError otherwise, matching the other `forkSeed` argument checks.

**Risk.** LOW.

## 08-03

**Summary.** Mechanical determinism bans in `src/sim` (Math.random, Date, timers, for..in, bare sort, Math aliasing, eval, Intl, localeCompare, computed sort forms), each proven by a probe.

**Strengths.** The Round 4 additions (`08-03-PLAN.md:27`, `:150`, `:170`) close the computed-member and `undefined`-argument sort bypasses. Comparator totality is listed as a documented residual (T-08-48, `:228`). `Array.prototype.sort` has been stable since ES2019, so a total comparator is deterministic across engines.

**Concerns.** No new findings. A comparator that can return NaN (for example `(a, b) => a.d - b.d` with a NaN distance) makes the sort order implementation-defined. This is already a documented residual, and 08-07's scan guards against NaN by refusing a non-finite range and only ever sees finite positions.

**Suggestions.** None beyond the existing residual note.

**Risk.** LOW.

## 08-04

**Summary.** Split steps 1-2: typed session context and the read-only probe publisher.

**Concerns.** None in this lens.

**Risk.** LOW.

## 08-05

**Summary.** Ids, vocabularies, `limits.ts`, entity and static records, the binary-search store, per-entity forked streams, the injective world hash line, and the D-08 empty-world identity.

**Strengths.**
- Store complexity is sound: append-only allocation (new id > max), O(log n) `get` by binary search, O(n) in-place `commit`, and no Map or Set whose iteration order could decide anything (`08-05-PLAN.md:150`).
- The hash line is now injective over printed fields. `encodeHashString` = `JSON.stringify` plus `\uXXXX` for code units above 0x7e (`:161`). A literal backslash in the input is emitted as `\\`, so an escape sequence cannot be forged by input text. Well-formed `JSON.stringify` already escapes lone surrogates in lower case, so the output is ASCII and fnv1a32's low-byte hashing (`src/sim/hash.ts:16`) loses nothing. The type tags `z`/`b:`/`n:`/`s:`/`a[...]` (`:162`) separate `1`, `"1"` and `true`.
- `isNeverSpawned` includes the world-stream state and, after 08-11, `aiDropped`, so D-08 holds exactly when nothing observable has happened.
- `createWorld` rejects non-uint32 seeds (`:151`), which removes the `canon(n,0)` rounding versus `>>> 0` truncation ambiguity.

**Concerns.**
- **LOW (C1): `spawnEntity` copies `ai.params` "onto `Object.create(null)`" (`08-05-PLAN.md:159`) without fixing the key insertion order.** The hash is unaffected because it sorts (`:160`). However, the unsorted order propagates into `snapshotWorld`'s output and causes finding A1 under 08-13. Inserting in code-unit sorted order at spawn would be one of the two possible fixes; the more robust fix is in 08-13.
- **LOW (C2):** canon's six-decimal rounding makes the entity line non-injective over values below 1e-6. For example, radius `5e-324` and `1e-7` print identically. This is acknowledged and deferred to 08-13's exact JSON comparison, which is correct as long as A1 is fixed.

**Suggestions.** Optionally insert `ai.params` keys in code-unit sorted order at spawn, so live and restored params objects have the same shape. This complements the 08-13 fix but does not replace it.

**Risk.** LOW.

## 08-06

**Summary.** Split steps 3-4: render driver, chart and settings controllers.

**Concerns.** None in this lens.

**Risk.** LOW.

## 08-07

**Summary.** `WorldView` (read-only, fresh copies) and `ShipControl` (write-only, actor-only, domain-checked), with scan ordered by squared distance and then id.

**Strengths.**
- Scan uses squared distances against `range²` with an explicit comparator (distance, then id) (`08-07-PLAN.md:28`), so the order is total and deterministic. Positions are bounded by 1e12, so squared distances stay below about 1.2e25, with no overflow and no NaN. A non-finite or negative range returns `[]` (`:150`).
- `ShipControl` refuses out-of-domain writes instead of clamping (`:30`, `:117`), so there is no hashed repair noise.
- Station orientation uses the renderer's `mul(base, axisAngle)` composition, checked against three.js within 1e-12 (`:26`, `:147`).

**Concerns.**
- **LOW (D1): scan cost.** Each call is O(N log N) over up to 262 bodies. With 08-11's per-tick bounds (up to 256 thinks plus 2 × 4,096 deliveries, each of which may scan), the worst case is about 8.4k scans × 262·log 262, roughly 2×10⁷ comparisons per tick. That is not reachable in Phase 8, because the test pilot has no `onEvent`, but it is the actual per-tick bound the queue caps permit.

**Suggestions.** Record the worst-case per-tick scan cost next to the queue bounds, so Phase 12's populator and real AI modules have a stated budget.

**Risk.** LOW.

## 08-08

**Summary.** Split steps 5-6: station and save controllers.

**Concerns.** None in this lens. The deliberate `disposed` guards are recorded (`08-08-PLAN.md:165`).

**Risk.** LOW.

## 08-09

**Summary.** AI types, integer-tick time, the frozen registry, the test pilot, and the AI lint zone.

**Strengths.**
- `ticks(s) = max(1, round(s·120))` keeps every timer an integer. The wake draw `ticks(0.1 + random()·1.5)` is in [12, 192] (`08-09-PLAN.md:122`, `:156`).
- All pilot state lives in `AiComponent.params`, with a JSON round-trip test (`:26`). The closure-stream import ban and the module-state ban (`:30-31`) close the two ways hidden state could escape the snapshot.

**Concerns.**
- **LOW (E1):** the test pilot targets the first scan result and then flies straight, because Phase 8's integrator never changes orientation (08-11 `:139`). Its distance only shrinks if it already faces the target, so "hold" is rarely reached in the 1,000-tick scenario. That is harmless for determinism, but the 08-13 equality then exercises mostly the "seek" branch plus wake draws. This was a deliberate scoping choice (A3), noted here only so nobody reads the 1,000-tick test as covering the hold transition.

**Suggestions.** Optionally, in 08-13's scenario, spawn one pilot within `holdRange` of a body so that both phases and the target-lost path run inside the compared window.

**Risk.** LOW.

## 08-10

**Summary.** Split steps 7-8: atomic hyperspace controller, ordered event router, sim driver with `stepOnce`, and the pure step-options builder.

**Concerns.** None in this lens. The signature is aligned (Round 4 item 8). The fixed-step accumulator stays in `src/sim/loop.ts`, which these plans do not touch.

**Risk.** LOW.

## 08-11

**Summary.** `stepWorld` (update, think, sanitize, commit), `stepSim` composition with the jump-step rule, the bounded AI event queue, field-complete idempotent `sanitizeEntity`, and the reserved event kinds.

**Strengths.**
- Id order over a length snapshot, with spawns this tick first visited next tick (`08-11-PLAN.md:29`, gate `:151`).
- The jump-step and dock-step rules make stepping independent of cadence. `stepSim` checks `player.mode` after `stepFlight`, so the docking step and the `hyperspaceJumped` step never step a world against the wrong layout (`:36`, `:140`).
- Sanitize rule 2 (`:178`) now gives one domain with spawn and the parser. The "second call" column with `Object.is` (`:186`) makes idempotence falsifiable at the ulp and -0 level.
- The queue bounds turn the earlier `N·f^8` into O(8,192) deliveries per tick, with exact accounting (`:171-172`).
- The transcendental gate covers `hypot`, `cbrt`, `pow` and the rest (`:250`).

**Concerns.**
- **LOW (F1): queue drain cost depends on the dequeue primitive.** The plan says the queue "drains first-in first-out" (`:191`) but does not say how. A naive `aiQueue.shift()` is O(n) per dequeue in V8 once the array leaves the fast path, so one 4,096-event drain costs up to about 8×10⁶ element moves. Swapping in a fresh buffer per pass (`const batch = world.aiQueue; world.aiQueue = []`) also gives exactly the plan's "posted during a pass arrive in the next pass" semantics.
- **LOW (F2): the transcendental gate misses the `**` operator** (`:250`). Its semantics are `Math.pow` (implementation-approximated), so `x ** 0.5` in a world-core module would pass the gate and break the cross-engine promise of row (f) once Firefox replay is claimed.
- **LOW (F3): sanitize normalises -0 only at the end of the tick.** During the think phase, before sanitize, a -0 injected between ticks (as the 08-13 variant does) is visible to AI code. The test pilot uses only squared distances, so this is safe today. A future AI using `Math.atan2`, `Math.sign`, `1/x` or `Object.is` on a coordinate could diverge between a live world holding -0 and a restored world holding +0, because JSON cannot carry -0. In normal stepping no -0 survives a tick boundary, so the risk exists only with external mutation.

**Suggestions.**
- F1: specify per-pass buffer swapping in `step.ts` and add one sentence on the drain's complexity.
- F2: extend the gate with `\*\*` (for example `rg -n "\*\*\s*[^*/ ]" src/sim/world/*.ts src/sim/ai src/sim/sim.ts src/sim/rng.ts`, excluding comment lines), or note the operator in row (f).
- F3: either document in `sanitize.ts` and row (f) that AI code must not branch on the sign of zero, or have `snapshotWorld` refuse -0 so external injection is caught at the boundary, as it already is for non-finite values.

**Risk.** LOW.

## 08-12

**Summary.** Split step 9: frame loop and session start-up, with `game-session.ts` left as a facade.

**Concerns.** None in this lens. The Firefox run and the deviations are recorded (`08-12-PLAN.md:137`).

**Risk.** LOW.

## 08-13

**Summary.** The strict snapshot codec, the 1,000-tick live-versus-restored equality (hash plus exact JSON plus `toStrictEqual`), the parser rejection table, the sanitizer and parser agreement property, and cross-cadence world hashes with a launch and an arrival.

**Strengths.**
- The non-finite refusal in `snapshotWorld` (`08-13-PLAN.md:23`, `:115`) and the decidable converse (`:155`) resolve the Round 4 contradiction cleanly.
- `nextId` is accepted up to `2**32`, so the codec accepts every state `allocate` can reach (`:26`, `:152`).
- The parser reads each property once into a checked local (`:26`, `:153`), which is the correct anti-TOCTOU design.
- The property test spawns valid entities and then mutates fields in place, so `spawnEntity` validation never makes it vacuous (`:154`).
- The cross-cadence test pins the jump-step rule (`:205`).

**Concerns.**
- **HIGH (A1): the exact checkpoint comparison `JSON.stringify(snapshotWorld(live)) === JSON.stringify(snapshotWorld(restored))` (`08-13-PLAN.md:22`, `:116`, gate `:191`) fails for any test-pilot world under the behaviour the plans specify.** The mechanism has three parts:
  - The live params object keeps the insertion order of `createTestPilotAi`'s literal `{ phase, targetId, scanRange, holdRange, cruiseSpeed }` (`08-09-PLAN.md:122`). Spawn copies it onto `Object.create(null)` without sorting (`08-05-PLAN.md:159`), and sanitize re-sorts only when it repairs (`08-11-PLAN.md:184`).
  - `parseWorldSnapshot` "copies keys in code-unit sorted order" (`08-13-PLAN.md:115`), and `restoreWorld` deep-copies that order.
  - `snapshotWorld` is specified only to "deep-copy every value" (`:115`). It is not told to emit keys in a canonical order, and `JSON.stringify` follows insertion order for string keys.

  So the two strings differ at the very first checkpoint, even though the states are identical. Container evidence from the scratch script described in the Method section:
  ```
  live   {"params":{"phase":"seek","targetId":0,"scanRange":25600,"holdRange":1000,"cruiseSpeed":100}}
  parsed {"params":{"cruiseSpeed":100,"holdRange":1000,"phase":"seek","scanRange":25600,"targetId":0}}
  equal? false
  ```
  The same hazard applies to entity field order if `snapshotWorld` copies entities generically (for example by spreading) rather than with one fixed literal, because `spawnEntity` and `restoreWorld` each build entities with their own literal order. The must-have "Edge (FOUND-12, ordering): … snapshot, hash and restore never depend on object key order" (`08-13-PLAN.md:28`) is therefore false for `snapshotWorld`'s bytes as specified. I rate this HIGH under the Round 4 Priority-1 criterion: it is an acceptance check that fails deterministically under the plans' own specified behaviour. The obvious executor "fix" is to drop or weaken the exact comparison, which would reopen Round 4 item 10. A non-canonical byte form would also become Phase 11's save format (SAVE-07/08).
- **LOW (A2):** integer-like param keys such as `"9"` and `"10"` are enumerated in ascending numeric order whatever the insertion order (container output `{"9":3,"10":2,"b":1}`). Both sides of the comparison go through the same emitter, so equality holds once A1 is fixed. The "code-unit sorted" wording should still not be read as a promise about JSON byte order for such keys. Phase 11 should know this if it hashes save bytes.
- **LOW (A3):** the -0 variant (`:116`) holds for the test pilot but depends on 08-11 F3, because the live world holds -0 during the first post-restore think phase.

**Suggestions.**
- A1, the fix: in Task 1 step 1, make `snapshotWorld` emit a canonical form. Build every object (root, entity, vectors, quaternion, rng, nav, ai) as one fixed literal in a documented field order, and insert `ai.params` keys in code-unit sorted order, the same comparator the parser and the hash use. State that `snapshotWorld(restoreWorld(parseWorldSnapshot(JSON.parse(t))))` stringifies back to `t` for any `t = JSON.stringify(snapshotWorld(w))` (canonical fixpoint), and add that as a Task 2 row taken at tick 0, before the 1,000-tick run. It fails fast with a clear message instead of failing at checkpoint 50. Add to the ordering edge (`:28`) that the snapshot's JSON bytes are canonical, not merely that the hashes agree.
- Optionally pair this with 08-05 C1 (sorted insertion at spawn). Do not rely on that alone, because sanitize and AI writes can add keys later.

**Risk.** MEDIUM until A1 is fixed. LOW after a one-paragraph text edit.

## 08-14

**Summary.** Test flags read once, the manual-clock frame branch, and `advanceTicks(n)` with refusals, taint first and a shared drain path.

**Strengths.**
- `MAX_ADVANCE_TICKS = 200000` bounds a synchronous call. Commands go on the first tick only, and one immutable input frame is shared (structuredClone row, `08-14-PLAN.md:159`), which makes `advanceTicks(n)` equivalent to n single steps.
- The row for a step that throws (`:160`) defines the partial state precisely.

**Concerns.** None new. Worst-case cost with an empty world is negligible. With a populated world it is bounded by 200,000 × the per-tick bound noted under 08-07 D1, which only matters from Phase 12.

**Risk.** LOW.

## 08-15

**Summary.** The world lifecycle (bump-then-derive epochs, fresh worlds at 101, resume on Continue or Load), `stepSim` plugged into `stepOnce`, the no-save-leak checks, the step-cost benchmark, and the Firefox run.

**Strengths.**
- Every world is a pure function of `(marketSeed, epoch)` with ids restarting at 101 (`08-15-PLAN.md:31-32`). Warm and cold restores reset to epoch 0 identically (`:30`, `:39`), which is the right determinism shape before Phase 11 persists epoch.
- `begin` refuses `epoch >= 0xffffffff` and a non-finite `marketSeed` without throwing (`:31`), so `worldSeedFor`'s RangeError cannot fire in the frame loop. `resetForRestore` accepts exactly `0..0xfffffffe` (`:38`).
- The benchmark threshold is unchanged and best of three is allowed (`:37`, `:233`).

**Concerns.**
- **LOW (G1):** an in-flight resume derives its world from epoch 0 (`:30`), while the save was taken in some world at epoch k ≥ 1. So in Phase 8 a resumed in-flight world is never the world that was saved. This is acknowledged as the Phase 8 baseline, with Phase 11 passing `save.epoch`, and it is harmless while worlds are empty. Recording it explicitly in the lifecycle header would help Phase 11 avoid an off-by-one, since `resume(seed)` must derive from the restored epoch without bumping while `begin` bumps first.

**Suggestions.** In the `world-lifecycle.ts` header, state that `resume` uses `worldSeedFor(marketSeed, epoch)` without bumping, and why (it regenerates the anchored world), so Phase 11 keeps the leg-anchor semantics.

**Risk.** LOW.

## 08-16

**Summary.** The one deliberate probe commit (`probe.sim`, `worldHash`, `advanceTicks`), the Node replay helper, Vitest and browser tick parity, and the narrowed store gate.

**Strengths.**
- `worldHash` reads live state on demand and returns `""` when stale (`08-16-PLAN.md:35`). `""` cannot collide with an eight-hex fnv1a32 value.
- The parity claim is honestly scoped to one engine family and to an empty browser world (`:31-32`). The replay-equals-`hashFlight` cross-check (`:166`) stops both sides agreeing on the same wrong hash.
- The narrowed gate passes on the current tree, as verified above.

**Concerns.** None new in this lens.

**Risk.** LOW.

---

## Overall Risk Assessment

**LOW-MEDIUM.** All 14 Round 4 consensus items are resolved in the plan text with verifiable anchors, and the determinism architecture holds up:
- per-entity bijective forks
- plain uint32 stream state
- id-ordered passes over a length snapshot
- a bounded FIFO queue with exact accounting
- one shared numeric domain across spawn, control, sanitize and parse
- an injective ASCII hash line
- exact-JSON restore checks

One new finding blocks an acceptance criterion: **A1 (HIGH, 08-13)**. `snapshotWorld` does not emit a canonical key order, so the exact live-versus-restored JSON comparison fails on the first checkpoint for test-pilot params, which I demonstrated in the container. It needs a one-paragraph edit to 08-13 Task 1 step 1, plus a canonical-fixpoint row in Task 2, with an optional supporting edit in 08-05. Everything else is LOW: an unquantified Weyl-overlap bound, the drain primitive's complexity, the `**` gate gap, -0 visibility during think, the purpose-code lookup, scan cost bounds, and resume-epoch documentation.

**Verdict: NEEDS REVISION.** The revision is limited to 08-13 (A1). No wave, dependency or file-ownership change is needed. The other plans are ready as written.
