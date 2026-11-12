### Summary

Commit `45c689b` writes the Round 2 adversarial fixes into the plans, not only into disposition tables. The empty-array wildcard is gone. `sanitizeEntity` now matches `sanitizeFlightState`'s quaternion rule and rejects negative speeds. `nextId` must be a safe integer. Async dispose paths and `advanceTicks` check `disposed`. `STATIC_ENTITIES` and `AI_REGISTRY` are frozen. The probe-shape freeze can see a dropped array.

What is not closed is the boundary those fixes were meant to make safe. `parseWorldSnapshot`'s rejection table is narrower than its must_haves. `restoreWorld` still accepts a typed object without re-running the parser. The named caps `MAX_AI_PARAMS_KEYS`, `MAX_AI_PARAMS_DEPTH`, and an `Object.prototype.hasOwnProperty` / `Object.hasOwn` check are absent. The `probe.sim` immutability test does not fail if `entities` is the live array. The listener-count gate Round 2 asked to replace is still the gate.

### Round 2 Resolution Verification

| Round 2 item | Plans | Status |
|---|---|---|
| `compareProbeShapes` empty-array wildcard (BLOCKER, L369) | `08-01` | **Resolved.** Empty matches empty only. `PROBE_SHAPE_VOLATILE_EMPTY_ARRAY_PATHS` starts empty. Both directions are unit-tested (`08-01-PLAN.md:28`, `:132`, `:136`). |
| Quaternion overflow/underflow, negative speed/range, field-complete numeric sanitize (BLOCKER, L61 / L491) | `08-11`, `08-13` | **Resolved for numerics.** `!Number.isFinite(normSq) \|\| !(normSq > 0)`, negative or `> 1e12` speeds/ranges, radius, ids-as-counters, rng, repairs, and numeric `ai.params` leaves (`08-11-PLAN.md:161-170`). Fast-check injects `1e200`, `NaN`, and negatives (`08-13-PLAN.md:140`). |
| `Number.isSafeInteger(nextId)` plus `> maxId` | `08-13` | **Resolved.** `101.5` and `2 ** 53 + 3` are rejection rows (`08-13-PLAN.md:26`, `:133`). |
| String/array length caps, magnitude cap, unknown keys, `__proto__` | `08-13` | **Partial.** Caps exist under other names (`MAX_SNAPSHOT_STRING_LENGTH = 128`, `MAX_SNAPSHOT_PARAM_LENGTH = 64`, `MAX_SNAPSHOT_MAGNITUDE = 1e12`). `MAX_AI_PARAMS_KEYS` and `MAX_AI_PARAMS_DEPTH` do not. `__proto__` rejection is specified for "any object" in must_haves and tested only on entity and `ai.params`. |
| `Object.prototype.hasOwnProperty` | `08-13` | **Not adopted.** No plan names `Object.hasOwn` or `Object.prototype.hasOwnProperty.call`. |
| `world.rng.s === world.seed` when `entities.length === 0` | `08-05` | **Resolved, with the correct predicate.** `isNeverSpawned` requires `world.rng.s === forkSeed(world.worldSeed, NO_ENTITY, "world")` plus `nextId === 101` plus an empty live list (`08-05-PLAN.md:33`, `:137`). |
| Deep copy in `restoreWorld` and `serializeWorld` / `snapshotWorld` | `08-13` | **Partial.** `restoreWorld` deep-copy is specified and the post-restore mutation test is real (`08-13-PLAN.md:107`, `:138`). `snapshotWorld` is told to deep-copy, but no test mutates that object and reads the live world. |
| `restoreWorld` must not be a second unchecked entry | `08-13` | **Not adopted.** Round 2 L387 asked for re-validation or "parser output only". The function takes `WorldSnapshot` and copies it (`08-13-PLAN.md:107`). |
| `Reflect.get`, `sort.call/apply/bind`, `queueMicrotask`, `self`, `declaredFrameTypes` | `08-03`, `08-09` | **Mostly resolved.** Direct forms are banned and `.call` is probed (`08-03-PLAN.md:141-145`). `.apply`/`.bind` are in the selector and not in the probe list. `Reflect["get"]` and `Reflect.apply(Array.prototype.sort, …)` are unbanned and not listed as residuals. AI-zone globs are recursive and fail-closed at depth ≥ 3 (`08-09-PLAN.md:181-184`). |
| `__purity_` probe prefix | `08-02`, `08-03`, `08-09` | **Resolved.** |
| Post-`await` dispose on load / clear / autosave | `08-08` | **Resolved.** (`08-08-PLAN.md:144`, `:149`) |
| `swapSystem` rAF | `08-12` | **Resolved.** Id tracked, cancelled, callback checks `disposed` (`08-12-PLAN.md:27`, `:117`, `:160`). |
| `advanceTicks` refuses when `disposed` | `08-14` | **Resolved.** Checked first, before taint and drain (`08-14-PLAN.md:29`, `:122`). |
| `dispose` calls `worldLifecycle.end()` idempotently | `08-15` | **Resolved** in `08-15`'s own test (`08-15-PLAN.md:38`, `:163`). |
| Replace listener-count gate with a `signal` assertion | `08-12` | **Not adopted.** Counts remain the gate (`08-12-PLAN.md:118`, `:142`). |
| `Object.freeze` on `STATIC_ENTITIES` and `AI_REGISTRY` | `08-05`, `08-09` | **Resolved.** Records are primitives, so shallow freeze is enough (`08-05-PLAN.md:34`, `:137`, `:183`; `08-09-PLAN.md:31`, `:119`). |
| `probe.sim` must not be a mutation handle | `08-16` | **Partial.** Action text says a local number (`08-16-PLAN.md:126`). The test assigns over the property (`08-16-PLAN.md:162`), which passes even if the previous value was `store.live`. |
| Anchored-save substring check | `08-15` | **Resolved as specified.** `Object.keys` allow-list is the gate; the substring check is a backstop (`08-15-PLAN.md:206`). |
| `setTimeout` / `setInterval` / `queueMicrotask` in `src/app/session` | `08-12` | **Resolved** as an `rg` gate (`08-12-PLAN.md:141`). |

### Plan-by-Plan Assessment (08-01 through 08-16)

| Plan | Trust-boundary verdict |
|---|---|
| `08-01` | Closed. Empty-array wildcard removed. `sim` is state-determined, not optional, so a dropped `probe.sim` still fails the shape spec. |
| `08-02` | No new untrusted parser. `__purity_` skip and `ENOENT` tolerance close the parallel-probe race. `forkSeed` `RangeError` is documented and guarded by later callers. |
| `08-03` | Direct bans landed. Computed `Reflect["get"]` and `Reflect.apply(sort)` remain. See WARNING 1. |
| `08-04` | No new untrusted input. `SessionRuntime.disposed` is the flag later plans check. Context is a typed bag of existing `let`s. |
| `08-05` | Freeze and `isNeverSpawned` rng check are real. `createEntityStore(init)` accepts a caller-supplied entity list with no validation (`08-05-PLAN.md:136`). That is the sink `restoreWorld` uses. |
| `08-06` | Verbatim extraction. No new boundary. Window listeners are pinned later in `08-12`. |
| `08-07` | `copyVec` / `copyQuat` at every view return closes the AI seam. Session code is outside that seam and still holds `World`. |
| `08-08` | Post-`await` `disposed` checks on `loadFromSave`, `clearSaveForNewGame`, and `queueSnapshot` are specified and test-backed. |
| `08-09` | `AI_REGISTRY` and `TEST_PILOT` frozen. Nested AI imports fail closed at depth ≥ 3. Export-surface scan covers the four allowed modules. |
| `08-10` | No new untrusted parser. Router ignores unknown kinds. Reserved payloads are not emitted here. |
| `08-11` | Numeric sanitize contract matches the flight sanitizer and the fast-check. Structural `ai.params` (key count, nested arrays, prototype keys, long strings) are not repaired, so the "every sanitized world parses" sentence is false outside the numeric generator. |
| `08-12` | `swapSystem` rAF hole is closed. Listener-count gate is not. See WARNING 2. |
| `08-13` | Main remaining hole. Parser must_haves over-claim the TDD table. `restoreWorld` does not re-validate. See HIGH 1. |
| `08-14` | `advanceTicks` refuses `disposed` first, caps `n` at 200_000, read-once URL flags, exact `"1"` / `"manual"`. |
| `08-15` | Warm Load resets epoch to 0 before `resume`. `end()` is on the dispose path and a second `dispose` is idempotent. Save keys are an allow-list. `src/persistence` stays unchanged. |
| `08-16` | `probe.sim` is specified as numbers and booleans, deleted on dispose, absent in menu. The anti-mutation test does not lock that. See WARNING 3. |

### Strengths

- The FOUND-10 comparator no longer treats `[]` as equal to a populated array. That was the Round 2 blocker, and the replacement is testable in both directions.
- Numeric domain alignment between `sanitizeEntity` and `parseWorldSnapshot` is now explicit, including the `1e200` quaternion case that overflows `normSq` to `Infinity`, matching `src/sim/flight/sanitize.ts:56-59`.
- Dispose continuations that already exist in `game-session.ts:1167-1197` and `:3284-3294` are named, not left to a verbatim move. `advanceTicks` checks `disposed` before taint.
- `isNeverSpawned` includes the world-stream seed, so an empty entity list cannot hide a drawn `world.rng`.
- Static records are primitives and are frozen at runtime. A write to `world.statics[0].scanClass` throws in module strict mode. Restored worlds share that frozen table, which is safe.
- AI import zone is fail-closed below depth 2, and the allowed modules are sealed against `export … from`.
- Phase 8 saves still cannot carry a world snapshot. The anchored-save check is now `Object.keys` against the v2 allow-list, not only a substring search.

### Issues Found

#### HIGH

**1. `parseWorldSnapshot` / `restoreWorld` still admit tampered snapshots the rejection table does not name**

- Plans: `08-13` Task 1–2 (`08-13-PLAN.md:26`, `:107`, `:133`, `:138`, `:202-203`); sink in `08-05` (`08-05-PLAN.md:136`); structural gap in `08-11` (`08-11-PLAN.md:168`).
- What the TDD table actually rejects: bad `nextId`, magnitude, negative speeds, the all-zero quaternion, string length 128, array length 64, one nested object, unknown keys on root/entity/nav/ai, and `__proto__` on an entity or `ai.params`.
- What a faithful executor can therefore accept:
  - Entity id `101.5` or `2 ** 53`. "Below 101" and "strictly ascending" do not require a safe integer. `forkSeed` throws `RangeError` on a non-integer id (`08-02-PLAN.md:197`).
  - Unbounded `ai.params` key cardinality (`MAX_AI_PARAMS_KEYS` is absent).
  - Nested arrays (`[[1]]`). The rejection row is a nested object `{ a: 1 }`, not `[[1]]`. `sanitizeEntity` only repairs number elements one level down (`08-11-PLAN.md:168`).
  - Underflow quaternion `{ w: 1e-200, x: 1e-200, y: 1e-200, z: 1e-200 }` where components are finite and under `1e12` and `normSq` underflows to `0`.
  - `__proto__` / `constructor` / `prototype` on `position`, `orientation`, `rng`, `nav`, or the root, and no requirement to use `Object.hasOwn` / `Object.prototype.hasOwnProperty.call`.
  - `restoreWorld(crafted)` skips re-validation and only deep-copies (`08-13-PLAN.md:107`).
  - `snapshotWorld` alias in the other direction: mutating `snapshotWorld(world).entities[0].position` is not tested against the live world.
- Mitigation: extend the rejection table with non-integer entity ids, a key-count cap (`MAX_AI_PARAMS_KEYS`), nested arrays, an underflow quat, and `__proto__` on every nested object including vectors. Pin enumeration to `Object.hasOwn`. Make `restoreWorld` call the same validators or accept only a value the parser just returned. Add a test that mutates the object `snapshotWorld` returns and asserts `entityHashes(live)` is unchanged. Update T-08-24.

#### WARNING

**1. The new determinism selectors are bypassed by forms `08-03` already knows how to ban**

- Plans: `08-03` Task 2 (`08-03-PLAN.md:141-145`); inherited by `08-09` and not re-probed.
- `MemberExpression[object.name="Reflect"][property.name="get"]` does not match a computed `Reflect["get"]`, and `Reflect.apply(Array.prototype.sort, xs, [])` is not `sort.call`. The probe list includes `Array.prototype.sort.call` and not `.apply` or `.bind`.
- Mitigation: ban computed `Reflect["get"]` the same way computed `Math` is banned, ban `Reflect.apply`, and add failing probes for `.apply`, `.bind`, `Reflect["get"]`, and `Reflect.apply(Array.prototype.sort, …)` — or list those forms next to the accepted residual.

**2. The listener-count gate still cannot see an unpaired abort signal**

- Plan: `08-12` Task 1 (`08-12-PLAN.md:28`, `:118`, `:142`).
- Mitigation: assert every `addEventListener` under `src/app/session` is passed an abort signal, or record each site in the teardown list by identity, not by count.

**3. `probe.sim` anti-mutation test does not catch a leaked store, and `World.store` is reachable without importing `store.js`**

- Plans: `08-16` Task 1–2 (`08-16-PLAN.md:33`, `:126`, `:162`); `08-05` (`08-05-PLAN.md:136-137`).
- Mitigation: assert `typeof probe.sim.entities === "number"` and that no `probe.sim` property is object-identical to `store.live` or any entity.

#### INFO

- `world.rng.s === world.seed` is the wrong check; the plan's `forkSeed(world.worldSeed, NO_ENTITY, "world")` predicate is the right one.
- `MAX_DESIRED_HEADING_ID_LENGTH` has no field to apply to in Phase 8.
- `08-15` has a substring backstop for `"epoch"` / `"entities"`; the `Object.keys` allow-list is the real gate.
- Depth ≥ 3 AI files cannot import the legal seam (`08-09-PLAN.md:184`), which is fail-closed.
- Reserved event strings (`specKey`, `commodity`, `commsMessage.params`) have no length cap (`08-11-PLAN.md:207-210`); nothing emits or renders them in Phase 8.

### Recommendations

1. Before `08-13` is executed, widen the rejection table until it matches the must_haves, add `MAX_AI_PARAMS_KEYS` and a nested-array rejection, pin `Object.hasOwn`, and make `restoreWorld` re-validate. Add the `snapshotWorld` anti-alias test. Update T-08-24 so the threat row is not the old contract.
2. In `08-03`, probe `Reflect["get"]`, `Reflect.apply(Array.prototype.sort, …)`, `.apply`, and `.bind`, or list them as accepted residuals in the same comment as the Math-alias residual.
3. In `08-12`, replace the listener-count equality check with a signal assertion.
4. In `08-16`, assert `typeof probe.sim.entities === "number"` and that the published object shares no identity with `store.live`.

### Overall Assessment

**NEEDS REVISION** before `08-13` and `08-16` execute. Waves 1–4 are not blocked by these findings.

Round 2's blocker (the probe-shape wildcard) and the numeric sanitize/parser mismatch are genuinely fixed in the plan text, with tests an executor cannot satisfy by accident. The remaining gaps are in `08-13`'s TDD rejection table (`restoreWorld` re-validation, non-integer entity ids, `MAX_AI_PARAMS_KEYS`, nested arrays, `Object.hasOwn`, `snapshotWorld` anti-alias test) and `08-16`'s `typeof probe.sim.entities === "number"` check.
