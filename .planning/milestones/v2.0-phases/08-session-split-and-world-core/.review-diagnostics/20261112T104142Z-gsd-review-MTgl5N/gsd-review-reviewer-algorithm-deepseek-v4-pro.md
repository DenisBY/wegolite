# Phase 8 — Algorithms, Determinism & Performance Peer Review (Round 2)

**Reviewer:** subagent (independent, read-only). **Scope:** all 16 plans `08-01`..`08-16` in `.planning/phases/08-session-split-and-world-core/`. **Evidence:** plan files at HEAD `83c9b5c` ("docs(08): replan phase 8 incorporating cross-AI review"), the Round 1 review `08-REVIEWS.md` (commit `10b4108`), and live source (`src/sim/math.ts`, `src/sim/hash.ts`, `src/sim/flight/state.ts`, `src/sim/hyperspace/arrival.ts`). Live `src/sim/rng.ts`, `src/sim/ai/`, `src/sim/world/` and `src/app/session/` do **not** exist yet — this phase has not been implemented, so the review is of the plan contracts.

**Round 1 resolution check:** the four Round 1 concerns named in the brief are resolved in `83c9b5c`:

- **RNG (L61/L62 @10b4108):** `08-02` Task 3 now lands `src/sim/rng.ts` and its literal `fmix32/mix32/worldSeedFor/forkSeed` vectors in one commit, expected values from an independent scratch re-implementation, plus a permanent "only serialisable streams in src/sim" source-scan guard. Resolved.
- **Spatial index / Map-order (Pitfall 7, L136):** `08-05` replaces the RESEARCH Pattern 4 lookup `Map` with binary search over the ascending `live` array (`rg "new (Map|Set)"` gate), so no container iteration order can ever decide anything. Stronger than Round 1 asked. Resolved.
- **Hashing (L135 @10b4108, consensus HIGH):** `08-05` introduces one exported `isNeverSpawned` predicate used by the serializer (re-spelled conditions gated out), epoch 0/1/2 worlds, and the spawn-kill-commit boundary case. Resolved.
- **Determinism lint (L87):** `08-03` adds Math-alias/computed-member/`globalThis` bans with positive controls. Resolved. **Hot path (L374):** `08-15` adds the `step-cost` benchmark with a hard bound. Resolved.

I verified the delegation arithmetic is bit-exact: `src/sim/math.ts:227-236` and `rngNext` (RESEARCH Code Example 1) share the identical mulberry32 sequence (`+0x6d2b79f5`, `imul(t^t>>>15, t|1)`, `t ^= t + imul(t^t>>>7, t|61)`, `(t^t>>>14)>>>0 / 2^32`). `fnv1a32`, `canon` (`-0`→`0`, throws on non-finite), `hashFlight`/`serializeFlight` all match the plans' descriptions.

---

### Summary

The 16 plans form a coherent, unusually well-specified deterministic-simulation design: a bit-exact serialisable mulberry32 stream, monotonic per-world entity ids with binary-search lookup (no Map/Set ordering), a composed world hash that is byte-identical to `hashFlight` while no NPC has ever spawned, a strict snapshot codec, and a narrow AI seam. Round 1's determinism, RNG, spatial-index and hashing findings are all addressed with concrete gates. I found **no blockers**; the remaining findings are execution-time pitfalls and forward-looking performance notes, the most material being a latent determinism hole around drawing the *world* stream before the first spawn, and an unconditional per-tick `createWorldView` allocation on the NPC-free hot path.

### Strengths

- **Bit-exact RNG delegation** (`08-02`): `createSeededRandom` re-implemented on `rngNext` inside `math.ts`, `arrival.ts` byte-identical (FIDELITY pin), and the sequence pinned with literal vectors captured *before* the edit. The `mix32` bijection claim is correct — `fmix32` is invertible and `b ↦ (b + 0x9e3779b9)>>>0`, the XOR, and `fmix32` are each bijections, so fixed `a` gives injective `mix32(a, ·)` and vice-versa.
- **Correct withdrawal of FNV-1a seed derivation** (`08-02`, RESEARCH Pattern 6): fork seeds use integer `mix32` per locked D-02, not string FNV-1a; `fnv1a32` remains only as the integrity checksum, cleanly separated from seed mixing. Purpose codes are fixed integers (world 1, ai 2, combat 3), never derived from array order.
- **Deterministic ordering is structural, not just tested** (`08-05`, `08-07`, `08-11`): id-ascending dense array + binary search (no Map/Set), `scan` sorted by `(distance², id)` — a *total* order, so the result is stable under any (even unstable) sort; bare `.sort()` is lint-banned while comparator sort stays legal; `for..in` banned; `Object.keys(...).sort(cmp)` blessed as the positive control.
- **Monotonic never-reused ids** (`08-05`): `nextId` is stored state that only increments; `commit` never recomputes `max(live)+1`; the per-world restart at `FIRST_DYNAMIC_ID=101` is documented in `ids.ts`, enforced by `createWorld`, and gated (`EntityId` scan of `world-lifecycle.ts` must be empty).
- **`isNeverSpawned` as the single D-08 predicate** (`08-05`): serializer may not re-spell the condition; epoch bumps (launch/arrival) proven hash-neutral; a spawn-then-kill-all world correctly *not* never-spawned.
- **Strict boundary parser** (`08-13`): 20+ typed `SnapshotError` reasons, `__proto__`/`Object.create(null)` params, and the `ENTITY_FIELDS` `Record<keyof Entity, …>` table forcing hash↔codec agreement at typecheck.
- **Hot-path cost is a hard gate** (`08-15`): `step-cost` scratch benchmark with `STEP-COST FAIL` exit, plus a conditional hash-neutral fast path, and `verify-full` wall-time comparison against the split baseline.
- **Parity is diagnosable** (`08-16`): shared `runTickScript` with per-tick `trace`, both sides also checked against `hashFlight`, and the "same wrong hash" failure mode explicitly closed.

### Issues Found

- **Severity**: WARNING
  - **Plan/Task**: `08-05` (Task 1 `createWorld`/`world.rng`), `08-11` (Task 2 `aiDropped` section), `08-13` (snapshot `rng` field)
  - **Description**: The world-level stream `world.rng` is initialised at `createWorld` (`createRngState(forkSeed(worldSeed, NO_ENTITY, "world"))`) but is **excluded from the hash and section while `isNeverSpawned` holds**. The invariant that keeps this safe is that the world stream is only drawn *at or after* the first spawn (which flips `isNeverSpawned` in the same tick). Phase 8 is safe only because `populateNothing` never draws. If Phase 12's populator draws `world.rng` and then fails to spawn (or runs with `traffic:false` while still drawing), the stream state diverges **without changing the hash** — a genuine determinism hole. This implicit co-commitment ("draw `world.rng` ⟹ first spawn in the same tick") is nowhere stated or tested.
  - **Fix**: Document the invariant in `world.ts`/`serialize.ts` (world stream draws are co-committed with the first spawn), and add a test asserting that any world whose `world.rng` state advanced but `isNeverSpawned` is still true is either unreachable by construction or reflected in `serializeWorldSection`. Alternatively, include `rng` in the section the moment the stream state differs from its seed value.

- **Severity**: WARNING
  - **Plan/Task**: `08-11` (Task 1 `stepWorld` think phase), `08-15` (Task 3 step 5 fast path)
  - **Description**: `stepWorld`'s think phase unconditionally builds `createWorldView(world, player, layout)` "for the tick", even when the length snapshot `n === 0` (the NPC-free Phase 8 production path for every flight). Each call allocates the view closure plus layout references. The remedy ("build the per-tick WorldView only when an entity with an AI component is due") is gated **behind a benchmark failure** rather than being the default, so the shipped path allocates a view object every tick it will never use. This is precisely the hot-path allocation the focus area flags.
  - **Fix**: Make the lazy construction the default: build the view (and per-actor `createShipControl`) only when `n > 0` and at least one live entity has an AI component whose wake/think is due; keep the benchmark as verification, not as the trigger for the fast path.

- **Severity**: WARNING
  - **Plan/Task**: `08-13` (Task 1 step 2 mismatch reporting)
  - **Description**: The 1,000-tick equality reports "the first diverging id from `entityHashes`" on a `hashWorld` mismatch. `entityHashes` covers only world entities. If the divergence is in the **player** (`serializeFlight(player)`), all per-entity hashes match and the diagnostic reports nothing, misleading the failing test. Since `hashWorld = fnv1a32(serializeFlight(player) + section)`, a player-only drift is the single most likely Phase 8 divergence (the world is NPC-free and empty).
  - **Fix**: On mismatch, also compare `hashFlight(player)` / the `serializeFlight` text of live vs restored before consulting `entityHashes`, and report "player diverged" vs "entity <id> diverged" explicitly.

- **Severity**: WARNING
  - **Plan/Task**: `08-05` (Task 1 `allocate` cap), `08-13` (snapshot `MAX_ENTITIES` check)
  - **Description**: `allocate` refuses "when the count of **non-dead** stored entities is already MAX_ENTITIES", but `live` includes killed-not-yet-committed entities. A naive `live.length >= MAX_ENTITIES` check would refuse spawns prematurely for a world at 256 live + several dead-uncommitted, and (worse) the property test "the live count never exceeds MAX_ENTITIES" must count non-dead, not `live.length`. The spec is correct but the trap is subtle and the words "257th live spawn" could be read either way.
  - **Fix**: In `store.ts` maintain/derive an explicit non-dead count (or count during `allocate`), and make the property test's cap assertion operate on non-dead count; add a dedicated case: 256 non-dead + 3 killed-uncommitted ⇒ spawn still refuses only after a `commit`, then succeeds.

- **Severity**: WARNING
  - **Plan/Task**: `08-13` (world-level fields vs `ENTITY_FIELDS`), `08-05` (`World.rng: RngState`)
  - **Description**: `World.rng` is an `RngState { s }` **object** while per-entity streams are plain `uint32` **numbers** (`EntityStreams { ai, combat }`). The snapshot's `rng` field and `serializeWorldSection`'s `rng=` line must encode the world stream consistently. The `ENTITY_FIELDS` table pins entity fields but the world-level fields only get "the same two checks against `serializeWorldSection`" — the *shape* of `rng` (is it `{s:123}` or `123`?) is left to executor discretion, which is a latent Phase 11 format-contract divergence.
  - **Fix**: Pin the world stream to the same primitive form as entity streams (a plain `uint32` `s` value) in `snapshotWorld`/`serializeWorldSection`, and add an explicit world-level-field row to the codec agreement test asserting `snapshot.rng === world.rng.s`.

- **Severity**: SUGGESTION
  - **Plan/Task**: `08-02` (Task 1 step 1)
  - **Description**: The plan states `drawWitchpointExit` "draws nine values". The source (`src/sim/hyperspace/arrival.ts:72-103`) draws **eight** (radial, w, x, y, z, tiltX, tiltY, tiltZ). Harmless (delegation preserves the sequence regardless), but the pinned documentation should be exact.
  - **Fix**: Correct the count to eight in the plan prose and any SUMMARY/comment that repeats it.

- **Severity**: SUGGESTION
  - **Plan/Task**: `08-07` (`scan`), forward-looking
  - **Description**: `scan(self, range)` is O(n) per call and the test pilot calls it every think; with n pilots this is O(n²) per think tick. Fine for Phase 8 (0–8 entities; `MAX_ENTITIES=256` keeps even the worst case at ~65k distance² per 15-tick interval), but there is deliberately no spatial index — broadphase is Phase 10. The "spatial index query invariants" in the focus are, in Phase 8, the binary-search id store plus the linear `scan`; no `queryRadius`/`nearest` primitive exists yet, which is correct scope.
  - **Fix**: No action for Phase 8. Note for Phase 10/12 that the copy-on-read `WorldView` contract (fresh vectors/quats) will need a scratch-buffer or results-reuse API if profiling shows allocation pressure, without relaxing the no-reference-leak contract.

- **Severity**: SUGGESTION
  - **Plan/Task**: `08-03` (Task 2 alias selectors)
  - **Description**: The Math-alias bans (`VariableDeclarator[init.name="Math"]`, etc.) also reject benign destructuring such as `const { floor } = Math`, forcing `Math.floor(...)` everywhere in `src/sim`. This is a deliberate, documented over-breadth (no current file trips it) but a future contributor may be surprised.
  - **Fix**: Already mitigated by the rule message and the positive-control for direct `Math.floor`; optionally note in the config comment that destructuring is intentionally disallowed to keep the `Math.random` ban visible.

- **Severity**: SUGGESTION
  - **Plan/Task**: `08-16` ("Flagged assumptions")
  - **Description**: The browser/Vitest parity fixture covers only a New-game launch-and-fly script; a hyperspace jump inside `advanceTicks` (which draws randomness via `drawWitchpointExit` and re-derives the world from `arrivalMarketSeed`) has no parity fixture this phase. Explicitly acknowledged, so not a defect, but it leaves the arrival stream untested end-to-end in the tick hook.
  - **Fix**: Defer as planned; when the jump parity is added, reuse `recorded-flights.ts`'s Leesti arrival sequence and assert against `hashFlight` too, matching the existing pattern.

- **Severity**: SUGGESTION
  - **Plan/Task**: `08-02` (Task 3), assumption A2
  - **Description**: The `mix32` seed tests prove *distinctness* (adjacent ids/purposes, 1,000 epochs) but not stream *independence/quality*. For a game this is sufficient and A2 already records the risk; no blocker.
  - **Fix**: Keep the assumption; optionally add one long-range check (e.g., first 16 draws of fork id 101 vs id 102 have no visible period/lockstep) if cheap, purely as a tripwire.

### Missing Coverage

- **World-stream draw ⟹ first-spawn co-commitment** — the single most important unstated invariant (see WARNING #1). Not covered by any test.
- **Player-divergence isolation in the 1,000-tick reporter** — `entityHashes` alone cannot name a player-side drift (WARNING #3).
- **Non-dead vs `live.length` cap semantics** — the property test asserts a cap but the wording does not force the non-dead interpretation (WARNING #4).
- **World-stream shape (`{s}` vs `s`) in snapshot/hash** — world-level fields are only "same two checks", not a pinned encoding (WARNING #5).
- **`advanceTicks` crossing a hyperspace jump** — no parity fixture (acknowledged in `08-16`).
- **Cross-engine determinism** — correctly deferred (PITFALLS 4, row (f)); the claim is V8-only, which is the right and documented scope.

### Recommendations

1. Default the `stepWorld` empty/`AI-due`-only fast path (do not gate it behind a benchmark failure), then keep the benchmark as verification — eliminates the per-tick `createWorldView` allocation in the NPC-free hot path (WARNING #2).
2. Document and test the world-stream/`isNeverSpawned` co-commitment invariant before Phase 12 introduces a real populator (WARNING #1).
3. Make the equality-test reporter isolate player-vs-entity divergence via `hashFlight`/`serializeFlight` (WARNING #3).
4. Pin the world `rng` snapshot/hash encoding to a plain `uint32` and cover it with a world-level-field codec row (WARNING #5).
5. Clarify the store cap as non-dead-count with an explicit 256-non-dead-plus-dead-uncommitted case (WARNING #4).

### Overall Assessment

**READY** — the plan set is coherent, deterministic-by-construction, and Round 1 is fully absorbed. The five WARNINGs are execution-time pitfalls (not design defects) that the existing gates will catch at build/test time if the executor follows the letter of the plans; the two most valuable to act on before Phase 12 are the world-stream/`isNeverSpawned` invariant and the hot-path view allocation.

### Reviewed Plans

- 08-01
- 08-02
- 08-03
- 08-04
- 08-05
- 08-06
- 08-07
- 08-08
- 08-09
- 08-10
- 08-11
- 08-12
- 08-13
- 08-14
- 08-15
- 08-16
