# Algorithm & Determinism Review (reviewer-algorithm-opus)

Round 4 review of the Phase 8 plans at commit `0aa747a`. Lens: seeded RNG streams and forking, uint32 arithmetic, world hashing, fixed-timestep stepping, entity id allocation, numeric bounds and sanitising, and fast-check soundness.

Evidence base: every plan file was read from disk (the algorithm-heavy plans 08-02, 08-05, 08-11 and 08-13 in full; the split-track plans through their must-haves and tasks). The claims were checked against `src/sim/hash.ts:13-35` (fnv1a32, canon), `src/sim/math.ts:53-57` (quaternion `normalize`) and `:227-237` (mulberry32), `src/sim/flight/sanitize.ts:50-63`, `src/persistence/save.ts:123,301-320,663` and `src/persistence/autosave.ts:66-74`, and `src/app/game-session.ts:1131-1153`. Two arithmetic claims were checked in the test container: `docker compose run --rm -v <scratchpad>/algo:/scratch test node /scratch/q.mjs`. The output is quoted under 08-11 and 08-13.

## Round 3 consensus: resolution check

| R3 item | Status | Evidence |
|---|---|---|
| 1a. fast-check property spawns valid entities, then mutates them in place | Resolved | `08-13-PLAN.md:140` |
| 1b. Counter, tick and ownerId bounds aligned (`0..0xffffffff`, `repairs` saturates) | Resolved | `08-05-PLAN.md:137`, `08-11-PLAN.md:166-169`, `08-13-PLAN.md:26` |
| 1c. Parser quaternion tolerance tied to `SANITIZE_QUAT_TOLERANCE`, with an accept row (1+5e-10) and an underflow reject row | Resolved for the parser. A residual gap remains in sanitize and spawn; see new finding A1 |
| 1d. String, array and key caps; forbidden keys at every object level; non-integer ids | Resolved | `08-13-PLAN.md:26,133`, `08-11-PLAN.md:168` |
| 1e. `restoreWorld` validates through the parser; anti-alias tests | Resolved | `08-13-PLAN.md:23,107,138` |
| 2. `snapshotForSave(inputs)` call shape | Resolved: 08-15 now asserts on the `SaveInputs` object and `encodeSave(inputs)`. `encodeSave(inputs: SaveInputs)` is at `src/persistence/save.ts:663`, and `buildSnapshotInputs` returns `SaveInputs` at `game-session.ts:1131`. The key allow-list matches `save.ts:301-320` |
| 3. `createTestHook` `sim` parameter required; `probe.sim` holds primitives only | Resolved | 08-16 Task 1 step 1, Task 2 step 2 |
| 4. 1e12 versus 1e9 wording | Resolved | `08-05-PLAN.md:137`, `08-11-PLAN.md:163` |
| 5. Store `nextId = 2**32` test row; Reflect and `.sort.call` selectors; listener `signal` | Resolved | `08-05-PLAN.md:180,186`; 08-03 Task 2 step 1 |

All Round 3 items are closed. The new findings below come from following the arithmetic itself, not the plan text.

## 08-01

**Summary:** Split safety nets: the verify-full baseline, the probe-shape snapshot and order-independent session-source scans.
**Strengths:** Session sources are concatenated in code-unit path order and the gated `renderFrame` pair is compared as a sorted set. The verdict therefore cannot depend on file layout, which is the right kind of order-independence.
**Concerns:** None from the algorithm lens.
**Suggestions:** None.
**Risk:** LOW.

## 08-02

**Summary:** Pins v1 flight hashes and the mulberry32 vectors. Adds `RngState`, `fmix32`, `mix32`, `worldSeedFor` and `forkSeed`.

**Strengths**
- The bijection argument is correct. `mix32(a,b) = fmix32(a ^ fmix32((b+0x9e3779b9)>>>0))` is a composition of bijections in each argument. So for one market seed, epochs 0 to 999 cannot collide, and for one world seed and purpose, entity ids cannot collide. The "1,000 distinct seeds" test is guaranteed by construction, which makes it a regression pin rather than a statistical claim. That is fine.
- `(b + 0x9e3779b9)` is at most about 2^33, which is exact in a double before `>>> 0`. Only `Math.imul` and unsigned shifts are used, so results are identical across engines.
- The vectors come from an independent scratch implementation and land in the same commit as `rng.ts` (`08-02-PLAN.md:200,217`). This is exactly what a one-way format needs.
- The delegated `createSeededRandom` preserves the closure arithmetic (`src/sim/math.ts:227-237`) and is pinned with `toBe` literals before the edit.

**Concerns**
- LOW / INFO. All mulberry32 streams lie on a single Weyl cycle of period 2^32 (state += 0x6d2b79f5). Two forked streams are therefore the same sequence at different offsets. The streams overlap only if one entity consumes on the order of (offset distance) draws. At Phase 8 and 12 draw rates, roughly a few draws per 15-tick think, this is negligible. It should still be stated in the Key Decisions rationale, so that Phase 13+ does not treat per-entity streams as statistically independent generators for, for example, Monte-Carlo damage.
- LOW. `worldSeedFor` and `forkSeed` coerce `marketSeed` and `worldSeed` with `>>> 0` (`08-02-PLAN.md:197`): a finite non-integer such as 1.5 silently becomes 1. That is acceptable inside the module, but it interacts with 08-05 and 08-13; see B1.

**Suggestions:** Add one sentence to the D-02/D-04 Key Decisions row: the forked streams are offsets on one 2^32 cycle, not independent generators.
**Risk:** LOW.

## 08-03

**Summary:** Lint bans in `src/sim` for Math.random, Date, wall clock, timers, `for..in`, bare and reflective sort, plus Math aliasing and computed access.
**Strengths:** `performance` is already in `DOM_GLOBALS` (`eslint.config.js:28`), so `performance.now` is covered, along with `globalThis`, `self`, `crypto` and `process`. Using shared rule constants prevents the flat-config override from silently dropping a ban.
**Concerns**
- LOW. The bans stop *argument-less* sort, but nothing checks that a comparator is a *total* order. For example, `(a,b) => a.d - b.d` with a NaN distance is not a consistent comparator, and its result is engine-defined. Phase 8 sorts only finite values (`scan` uses squared distances of sanitized positions, then ids), so this is a documentation item, not a gate.
**Suggestions:** In the documented-residuals comment, add: "comparators must be total; NaN keys must be impossible by construction (sanitize) or broken by id".
**Risk:** LOW.

## 08-04

**Summary:** Split steps 1-2: typed session context and the probe publisher.
**Strengths/Concerns:** No determinism-relevant arithmetic. The closure-alias scan protects live-read semantics, which the later hash reads depend on.
**Risk:** LOW.

## 08-05

**Summary:** Ids, entity records, static entities, the monotonic store, forked streams, `isNeverSpawned` and `hashWorld`.

**Strengths**
- The monotonic counter with a per-world restart at 101, plus binary search over an ascending array, gives no Map/Set iteration order. Ids are unique per world, and the fast-check bound `nextId <= 101 + commands.length` is tight and correct (`08-05-PLAN.md:186`).
- The cap counts non-dead entities and refuses at `nextId > 0xffffffff` without advancing the counter. `forkSeed` can therefore never throw inside a step.
- `isNeverSpawned` includes the `world.rng.s` initial-state check, so a draw from the world stream with no spawn is not hash-invisible.

**Concerns**

- **MEDIUM (A1, shared with 08-11 and 08-13). The quaternion domain is still misaligned at spawn.** `spawnEntity` accepts any orientation with finite `normSq > 0` (`08-05-PLAN.md:137`). It does not require unit length and does not normalise. `parseWorldSnapshot` requires `|normSq − 1| ≤ 1e-9` (`08-13-PLAN.md:26`). Sanitize runs only inside `stepWorld`, after think (`08-11-PLAN.md:170`). As a result:
  - A world snapshotted after a spawn but before a step is not accepted by its own parser if the spawn quaternion was non-unit. Examples: an `advanceTicks`-free test, or 08-13's "kill the highest id, snapshot, restore" case if it spawns with `{w:2,…}`.
  - The first update after the spawn moves the entity with a non-unit `rotate`, so the forward vector is scaled by |q|².

  Fix: `spawnEntity` should either refuse `|normSq − 1| > SANITIZE_QUAT_TOLERANCE` or normalise deterministically (via `normalize`, whose `Math.sqrt` is correctly rounded) and then re-check. It also needs the low-norm guard in A1-b under 08-11.

- **MEDIUM (B1). `worldSeed` is never validated as uint32, and the hash disagrees with the fork derivation for non-integer seeds.**
  - `createWorld(worldSeed)` stores the argument as given (`08-05-PLAN.md:137`).
  - `serializeWorldSection` prints it with `canon(n, 0)`, which *rounds*: `canon(1.5, 0)` is `"2"` (`src/sim/hash.ts:33-34`).
  - `forkSeed` *truncates* with `>>> 0`, so 1.5 forks from 1.

  So worldSeed 1.5 and worldSeed 2 produce identical `worldSeed=` hash lines but different entity streams: the hash is blind to a real state difference. Conversely, worldSeed −1 and 0xffffffff behave identically but hash differently.
  - 08-13's parser lists no worldSeed check (`08-13-PLAN.md:26` covers counters and stream states, not `worldSeed`).
  - The lifecycle always passes a `worldSeedFor` output, so production is safe today. `restoreWorld` is the Phase 11 save boundary, though.

  Fix: `createWorld` throws a RangeError or coerces with `>>> 0` *before* storing. `parseWorldSnapshot` requires `worldSeed` to be a safe integer in `0..0xffffffff`, with a rejection row for 1.5, −1 and 2**32.

- **LOW (B2). The param-value and string encoding in `serializeEntity` is under-specified.** `ParamValue = null | boolean | number | string | (number|string)[]` (`08-05-PLAN.md:134`). Step 6 says only "AI params emitted in code-unit sorted key order". As written, an implementation could emit number 1, string "1" and boolean `true`/"true" identically, or emit a raw string containing `\n` or `e101=` that forges another line. `fnv1a32` also hashes only the low byte of each code unit (`src/sim/hash.ts:16`), so `"Ā"` (U+0100) and `"\0"` collide.
  - None of this breaks determinism, because identical states still hash identically.
  - It does weaken the hash as a divergence detector, and the `ENTITY_FIELDS` "every field changes its hash" test would not catch it.

  Fix: type-tag param values (`n:`, `s:`, `b:`, `z`, `a[…]`) and emit strings, including `specKey`, through `JSON.stringify`, so the line grammar is injective.

- LOW. `isNeverSpawned` ignores `aiDropped`, which 08-11 adds. A parsed snapshot `{entities: [], nextId: 101, rng: initial, aiDropped: 5}` restores to a world that hashes as `hashFlight` but is not equal to `createWorld`. Either add `aiDropped === 0` to the predicate (08-11 extends `world.ts` anyway), or have the parser reject `aiDropped ≠ 0` when `nextId === 101`.

**Suggestions:** A1 and B1 above; B2 as a one-line serializer rule plus one `ENTITY_FIELDS` row that changes a param's *type* without changing its printed value.
**Risk:** MEDIUM. B1 and A1 are cheap to fix now and expensive once Phase 11 freezes the snapshot format.

## 08-06

**Summary:** Split steps 3-4: render driver, chart and settings controllers.
**Concerns:** None from this lens. The redraw gate keys on identity, which does not affect sim determinism.
**Risk:** LOW.

## 08-07

**Summary:** Read-only `WorldView`, write-only `ShipControl`.
**Strengths:** `scan` orders by squared distance, then id, with an explicit comparator, so ties resolve totally. It needs no `Math.sqrt`. `scheduleWake` treats 0 as "none pending" before taking the minimum (`08-07-PLAN.md:113`), which avoids the min(0, x) trap.
**Concerns**
- LOW (domain alignment). `ShipControl` accepts values that 08-11's sanitize then counts as corruption:
  - `setDesiredSpeed` and `setDesiredRange` accept any finite non-negative number, with no 1e12 cap.
  - `setDestination` accepts any finite vector, with no 1e12 cap.
  - `setTarget` accepts any non-negative safe integer, with no 0xffffffff cap.
  - `scheduleWake` sets `tick + ticks` with no upper bound (`08-07-PLAN.md:113`).

  A legitimate AI write of, say, speed 1e13 is turned into 0 by sanitize and increments the hashed `repairs` counter. That is deterministic, but `repairs` stops meaning "corruption was repaired". An overflowing `scheduleWake` silently cancels the wake: it is repaired to 0, which means none.

**Suggestions:** Clamp or ignore in `createShipControl` with the same constants (`MAX_ENTITY_MAGNITUDE`, `0xffffffff`). Ignore `scheduleWake` when `tick + ticks > 0xffffffff`.
**Risk:** LOW.

## 08-08

**Summary:** Split steps 5-6: station and save controllers.
**Concerns:** None from this lens. `buildSnapshotInputs` being unchanged keeps the save bytes and the market seed (a `worldSeedFor` input) stable.
**Risk:** LOW.

## 08-09

**Summary:** AI types, integer tick timers, the registry and the scripted test pilot.
**Strengths:** `ticks(s) = max(1, Math.round(s * 120))` uses round, not ceil. The container shows `0.1*120 === 12` and `Math.round` gives 12, and a ceil-based variant would have mis-rounded some decimal-second inputs upward. The pilot's randomness comes only from the context's per-entity stream, and its state round-trips through JSON.
**Concerns**
- INFO. Timers are absolute player ticks bounded to `0..0xffffffff` by sanitize and the parser. At 120 Hz that wraps the domain after about 414 days of cumulative ticks. This is irrelevant in practice but worth one comment in `time.ts`.
**Risk:** LOW.

## 08-10

**Summary:** Split steps 7-8: hyperspace controller, event router and sim driver (`stepOnce`, one input frame per frame).
**Strengths:** `stepOnce` is the single step call site, and commands reach only the first step of a frame. Together these make the fixed-step sequence independent of frame cadence, which 08-13 Task 3 then proves for the world. The arrival stays one synchronous install block.
**Concerns:** None from this lens.
**Risk:** LOW.

## 08-11

**Summary:** `stepWorld` (an id-order update and think over a length snapshot, then commit), the queued AI events, `sanitizeEntity`, and the reserved SimEvents.

**Strengths**
- The length snapshot plus index iteration gives a precise "spawned this tick acts next tick" rule, and the acceptance grep bans `for…of world.store.live` (`08-11-PLAN.md:125`).
- Each think gets a local `RngState` seeded from `entity.rng.ai`, which is written back afterwards. Stream isolation therefore holds by construction, and the 200-tick spawn/kill test proves it.
- `-0` is normalised in sanitize, so the JSON `-0 → 0` loss cannot split live and restored runs once a tick has run. The container confirms `JSON.stringify({a:-0}) === '{"a":0}'`.
- `repairs` saturates and the clean-entity bit-identity rule is pinned by a repairs-delta table.

**Concerns**

- **MEDIUM (A1-b). Renormalisation is not guaranteed to land inside the tolerance the parser enforces.** Sanitize treats only `normSq` that is non-finite or ≤ 0 as degenerate, and otherwise calls `normalize(orientation)` (`08-11-PLAN.md:163`). For a subnormal `normSq`, `Math.sqrt` of an imprecise subnormal gives a length with only a few significant bits, and the "normalised" quaternion stays far from unit length. Measured in the test container with the exact `normalize` arithmetic of `src/sim/math.ts:53-57`:

  ```
  {w:1e-160}  normSq 1e-320  -> after normalize 1.0000111329412578  (dev 1.1e-5, rejected at 1e-9)
  {w:3e-161}  normSq 9e-322  -> after normalize 1.00089026360758    (dev 8.9e-4, rejected)
  {w:7e-158}  normSq 4.9e-315 -> 1.00000000020753 (accepted, barely)
  ```

  The consequences:
  - This breaks 08-11's must-have "every sanitized world snapshots to JSON that `parseWorldSnapshot` accepts" (`08-11-PLAN.md:32`).
  - It is a valid counterexample for 08-13's 200-run property, because the plan explicitly mutates orientation components with arbitrary `fc.double()`.
  - It makes sanitize non-idempotent: a second call renormalises again and changes bits, contradicting "a clean entity is left bit-identical" on the following tick.

  Fix (pick one and apply it in spawn, sanitize and the parser):
  - (a) Treat `normSq < MIN_QUAT_NORM_SQ` (e.g. 1e-12) as degenerate, which means repair to identity, counted, and refusal at spawn. Add rows `{w:1e-160,…}` and `{w:3e-161,…}` to the sanitize table and to the parser rejection table.
  - (b) After `normalize`, re-check `|normSq − 1| ≤ tol` and fall back to identity.

- **MEDIUM (C1). The AI event drain is bounded in passes but not in work.** `postAiEvent` only appends, and a drain runs at most 8 passes (`08-11-PLAN.md:30,174`), but no per-pass or per-drain event cap exists. A handler that posts *f* events per delivered event produces about N·f^8 deliveries before the drop: with 256 entities and f = 10, that is 2.6×10^10. The claim "overflow is dropped and counted" covers only what is left after pass 8, not the cost of passes 1-8. This is not a Phase 8 production risk, because the test pilot has no fan-out. It is the Pitfall 7 mechanism, though, and Phase 12+ AIs (group broadcasts such as `helpRequestReceived` to escorts, or police) do fan out.

  Fix: add `MAX_AI_EVENTS_PER_DRAIN` (e.g. 4096). Events posted beyond it are dropped and counted in `aiDropped`. Add a test with a handler that fans out ×4 forever.

- LOW. `aiDropped` above 0xffffffff is *reset* to 0 by `stepWorld` (`08-11-PLAN.md:170`), whereas `repairs` saturates. A counter that silently wraps to 0 is a worse diagnostic than one that saturates. Saturate `aiDropped` at 0xffffffff for consistency.
- LOW. Sanitize does not cover the enum-typed fields (`kind`, `scanClass`, `nav.behaviour`, `ai.aiKey`), yet the must-have calls it "field-complete" and the parser rejects unknown values. Either scope the claim to "numeric, string-length and structural leaves" or add an enum repair (for example, an unknown behaviour becomes "IDLE", counted). Today only a cast can produce a bad enum, because ShipControl validates `perform`.

**Suggestions:** A1-b and C1 above. Also state in the sanitize doc comment that sanitize is idempotent: `sanitizeEntity(e)` twice returns false the second time with no bit change. Add that idempotence as a fast-check property in 08-13, since the subnormal case above is precisely what it would catch.
**Risk:** MEDIUM.

## 08-12

**Summary:** Split step 9: the frame loop, start-up wiring and the thin facade.
**Concerns:** None from this lens. The frame phase order is pinned, and the freeze branches clear `pending`, so no command fires on a later frame after an unpause. That keeps command-to-tick mapping deterministic.
**Risk:** LOW.

## 08-13

**Summary:** Snapshot codec, the strict parser, the 1,000-tick live-versus-restored equality, and world cadence.

**Strengths**
- Restore goes through the parser, and every level is deep-copied in both directions.
- The `Record<keyof Entity, …>` table makes field coverage a typecheck obligation.
- The cadence test includes both epoch bumps and asserts the world is non-empty at the compared ticks.
- The mismatch reporter checks the player before the entities.

**Concerns**

- **HIGH (D1). The converse NaN check is false for scalar `ai.params` values, and the must-have it backs is unsound as written.** `08-13-PLAN.md:140` requires that a NaN mutated in place "in `position`, `radius`, or `ai.params`" without sanitize "is refused by `parseWorldSnapshot` after JSON (`null` in a number slot) with the non-finite reason, never silently accepted". `ParamValue` includes `null` (`08-05-PLAN.md:134`), and `JSON.stringify` turns a NaN param into `null`; the container shows `JSON.parse(JSON.stringify({p:{n:NaN}}))` gives `{ p: { n: null } }`. The parser must accept that `null` as a legal param. So:
  - the test row as specified fails, or invites a parser special-case that rejects legitimate `null` params; and
  - more importantly, `snapshotWorld` silently changes the state (NaN becomes null) on its way out. The live world would throw in `canon` while the restored world hashes cleanly.

  NaN *inside a param array* is rejected correctly, because arrays hold number or string only. Fix:
  - make `snapshotWorld` itself refuse any non-finite number leaf, with a new reason such as `"non-finite"`, since it is the only point that still sees the NaN; and
  - restrict the converse parse check to number-only slots (position, radius, param *array* elements); and
  - add a scalar-param NaN row asserting that `snapshotWorld` throws.

- **MEDIUM (A1, A1-b).** The 200-run property mutates orientation components with `fc.double()`. With the sanitize as specified, `{w:1e-160, x:0, y:0, z:0}` is a real counterexample: it sanitises to normSq 1.0000111, which the parser rejects. See 08-11. Snapshots taken before any step can also carry spawn-time non-unit quaternions (see 08-05). Add both rows to Task 2's tables once 08-05 and 08-11 are fixed.

- **MEDIUM (B1). `worldSeed` is missing from the parser's checks.** Add `worldSeed` to be a safe integer in `0..0xffffffff`, with rejection rows for 1.5, −1 and 2**32. Without this, `restoreWorld` can build a world whose hash line (rounded by `canon`) and whose fork derivation (`>>> 0` truncation) disagree. See 08-05.

- **MEDIUM (E1). The 1,000-tick equality compares quantised hashes only.** `hashWorld` formats every non-integer with `canon(n, 6)`, which rounds to 1e-6. So "live and restored hash identically" proves agreement to 6 decimals, not bit equality. A 1-ulp divergence from a lost or extra operation in the restored path stays invisible until it grows past 1e-6, and Phase 8's constant-speed integrator never amplifies it. JSON round-trips doubles exactly, so a strictly stronger, essentially free check is available.

  Fix: at every 50th tick and at the end, also assert `JSON.stringify(snapshotWorld(live)) === JSON.stringify(snapshotWorld(restored))`, and `serializeFlight`-independent exact equality of the player (for example, `expect(restoredPlayer).toStrictEqual(livePlayer)`, or `Object.is` per numeric leaf). The same reasoning applies to the `ENTITY_FIELDS` table: mutations must differ by more than 1e-6 to "change the entity hash", or a row such as `+1e-9` will appear to fail coverage.

- LOW. The domain end-point is off by one. `store.allocate` may issue id 0xffffffff, after which `nextId` is 2**32. `snapshotWorld` then emits `nextId = 2**32`, which the parser rejects (`nextId in 101..0xffffffff`, `08-13-PLAN.md:26,107`). This is unreachable in practice, but the codec should accept any state the store can reach. Use the parser range `nextId ∈ 101..2**32`.

- LOW. `restoreWorld(parseWorldSnapshot(x))` (Task 2's anti-alias row) feeds the parser a value with null-prototype `ai.params`, the parser's own output. Pin in the parser doc comment that an object check uses `typeof === "object" && !Array.isArray` plus `Object.hasOwn`, and never `Object.getPrototypeOf(o) === Object.prototype`. Otherwise `restoreWorld` rejects its own validated input.

**Suggestions:** D1, B1, E1 and the A1 rows. Also add a fast-check idempotence property: `sanitizeEntity(e)` then `sanitizeEntity(e)` returns false and changes no bit.
**Risk:** MEDIUM. The codec is the de facto Phase 11 format (`08-13-PLAN.md:107`), so tightening it now is cheap.

## 08-14

**Summary:** Test flags, the manual clock and `advanceTicks(n)`.
**Strengths:**
- `advanceTicks` reuses the realtime drain, so commands go on tick 1 only and one input frame is shared.
- It refuses non-integer, out-of-range, disposed, paused or overlay states without tainting.
- It stops early on a pause or overlay opened mid-run.

These make `advanceTicks(1)×601` and `advanceTicks(1); advanceTicks(600)` equivalent for idle input, and 08-16 relies on that.
**Concerns**
- LOW. "the same input frame object on every call" (Task 1 step 5) is safe only if `stepOnce` and the controllers never mutate the frame. Add one assertion in the sim-driver test that the frame object is deep-equal before and after `advanceTicks(3)`. Otherwise a future controller that writes into the frame (for example, edge latching) would make the n-tick call differ from n single-tick calls.
**Risk:** LOW.

## 08-15

**Summary:** World lifecycle, the epoch bump points, warm/cold restore equivalence and the anchored-save check.
**Strengths**
- Bump-then-derive is placed correctly: `begin` checks `epoch < 0xffffffff` before `epoch += 1`, so `worldSeedFor` is total.
- `resetForRestore(0)` aligns warm Load and cold Continue.
- The D-05 parity sequence `[1,1,2,3,3]` with identical seeds is the right shape.
- The Round 3 `SaveInputs` fix is verified against `src/persistence/save.ts:301-320,663`.
**Concerns**
- LOW. The world is created in the router reaction to `launched`, so it first steps on the tick *after* the launch step. 08-13 Task 3 and 08-16's `tick-script.ts` must mirror that exactly. Both already say "launched begins". State the one-tick latency once in the lifecycle doc comment, because it is the parity-critical detail.
- INFO. `resume` uses `worldSeedFor(seed, 0)`, a seed that no `begin` ever produces (`begin` yields epoch ≥ 1). This is consistent with D-03 and needs no change; noting it for Phase 11, where `resetForRestore(save.epoch)` replaces it.
**Risk:** LOW.

## 08-16

**Summary:** The one probe commit (`probe.sim`, `worldHash`, `advanceTicks`) and browser/Vitest hash parity.
**Strengths**
- The parity check has three legs (browser, Vitest real driver, Node replay), each also checked against `hashFlight`. The first-diverging-tick trace and the V8-only scope (PITFALLS 4, 08-11 row (f)) are stated honestly.
**Concerns**
- LOW. Parity compares quantised `hashWorld` strings (see E1). For an NPC-free world that is just `hashFlight`, so the assertion matches the v1 cadence tests and is acceptable for success criterion 5. If the browser ever exposes a snapshot through the hook in Phase 12, prefer exact JSON equality there.
**Risk:** LOW.

## Cross-plan summary

| ID | Severity | Plans | Finding |
|---|---|---|---|
| D1 | HIGH | 08-13 (08-05 `ParamValue`) | A scalar NaN param becomes JSON `null`, which is a legal `ParamValue`. The converse "refused" check is false and `snapshotWorld` silently changes state. `snapshotWorld` should refuse non-finite leaves |
| A1 / A1-b | MEDIUM | 08-05, 08-11, 08-13 | Spawn accepts non-unit quaternions; sanitize's `normalize` of a subnormal `normSq` (e.g. `{w:1e-160}` gives normSq 1.0000111, measured) stays outside the parser's 1e-9 tolerance. The property has a real counterexample and sanitize is not idempotent. Add a minimum-norm guard or a post-normalise check |
| B1 | MEDIUM | 08-05, 08-13 | `worldSeed` is never validated as uint32. `canon(n,0)` rounds while `forkSeed` truncates, so worldSeed 1.5 and 2 hash identically but fork differently |
| C1 | MEDIUM | 08-11 | The AI event drain caps passes but not deliveries (N·f^8 growth). Add a per-drain event budget counted in `aiDropped` |
| E1 | MEDIUM | 08-13 (08-16) | The live-versus-restored proof compares `canon(·,6)`-quantised hashes. Add an exact `JSON.stringify(snapshotWorld(·))` equality and exact player equality |
| — | LOW | 08-05, 08-07, 08-11, 08-13, 08-14 | Type-tag and escape param and string encoding in the hash; align ShipControl caps with sanitize; saturate `aiDropped`; include `aiDropped` in `isNeverSpawned`; parser `nextId` up to 2**32; null-prototype params accepted by the parser; frame-object immutability in `advanceTicks` |

Dependency ordering is sound. All the MEDIUM and HIGH items fall in the core-track plans of waves 2, 5 and 6 (08-05, 08-11, 08-13) and change no wave boundary. Waves 1, 3 and 4 can start as planned.

## Overall verdict: NEEDS REVISION

The three headline findings are D1, A1-b and B1. They are small text edits to 08-05, 08-11 and 08-13, but each one makes a stated must-have false or untestable: "unsanitized non-finite is refused", "every sanitized world parses", and "the hash covers every field". They also sit on the snapshot format that Phase 11 freezes. Once they are applied, along with C1 and E1, the plan set is READY. Nothing else in the 16 plans needs to change.
