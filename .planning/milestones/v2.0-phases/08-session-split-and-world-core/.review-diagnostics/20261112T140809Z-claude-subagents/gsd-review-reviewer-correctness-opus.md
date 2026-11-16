# Behavioral Correctness Review (reviewer-correctness-opus)

Round 4, plans at `0aa747a`. I checked the plans against the real source: `src/app/game-session.ts` (3365 lines), `src/app/probe.ts`, `src/persistence/{autosave,save}.ts`, `src/sim/{math,events,step}.ts`, `src/sim/flight/{state,launch}.ts`, `eslint.config.js`, `tests/app/redraw-gate.test.ts` and `tests/guards/economy-purity.test.ts`. I did not run the Docker gate, because this is a plan review.

## Round 3 resolution check

| R3 finding | Status | Evidence |
|---|---|---|
| 1. Post-spawn in-place mutation in the 08-13 fast-check | Resolved | `.planning/phases/08-session-split-and-world-core/08-13-PLAN.md:140` spawns valid entities (`radius = 10`, `specKey = "ship"`), then mutates every leaf in place before `sanitizeEntity`. |
| 1. Counter, id and tick bounds aligned | Resolved | 08-05:137 (`tick`/`ownerId` in `0..0xffffffff`), 08-11:166-169 (saturating `repairs`), 08-13:26 (all counters in `0..0xffffffff`). |
| 1. Quaternion tolerance in the parser | Resolved | 08-13:26,107 use `Math.abs(normSq - 1) <= SANITIZE_QUAT_TOLERANCE`. The rows for `1 + 5e-10` (accept) and `1e-200` (reject) are at 08-13:133. |
| 1. String, array and key caps, nested arrays, proto keys on every object | Resolved | 08-13:26,133; 08-11:165,168; 08-05:137. |
| 1. `restoreWorld` validates its input; `snapshotWorld` anti-alias test | Resolved | 08-13:22,107,138. |
| 2. `snapshotForSave(inputs)` in the 08-15 anchored-save test | Resolved | 08-15:35,206 assert on `inputs` and `encodeSave(inputs)` directly. The Round 3 premise was partly wrong: `buildSnapshotInputs()` already returns the result of `snapshotForSave(...)` (`src/app/game-session.ts:1131-1152`), so `SaveInputs` is `{clockSeconds, credits, …}` (`src/persistence/save.ts:301-320`), not `{state, profile, …}`. The fix is right either way, and the 14-key allow-list at 08-15:206 matches `SaveInputs` exactly. |
| 3. `createTestHook` `sim` parameter required; `probe.sim` anti-alias | Resolved in the spec, but the new gate cannot pass (see 08-16 H1). | 08-16:125,162 |
| 4. `1e12` vs `1e9` wording, `1e308` and `.slice()` wording | Resolved | 08-11:162, 08-05:137, 08-13:107,133 |
| 5. Allocate row at `2 ** 32`; Reflect and `.sort.apply`/`.bind` probes; listener `signal`; line anchors | Resolved | 08-05:180,186; 08-03:141-143; 08-12:117,120. I checked the anchors against the source: the four `pending.length = 0;` sites are at `:2738/:2749/:2773/:2859`, the listeners at `:2268/:2289` (both already pass `signal: uiController.signal`), `onLaunchKeyDown` at `:2279`, `swapSystem` at `:3284`, `handleEvent` at `:2294`, `syncStatusOverlay`'s `getElementById` at `:2161`, and step options at `:2814`. There are exactly 14 `SimEvent` kinds (`src/sim/events.ts:28-54`). The literal counts at 08-12:120 match the source: `redrawGate.request();` ×5, `generateMarket(` ×3, `stepFlight(` ×1. |

All Round 3 findings are addressed in the plan text. New findings follow, per plan.

## 08-01
**Summary:** Adds the probe-shape freeze and re-points the text scans at a helper that concatenates the session sources.
**Strengths:**
- Strict empty-array matching. `PROBE_SHAPE_VOLATILE_EMPTY_ARRAY_PATHS` starts empty and is tested in both directions (08-01:142-143).
- The base commit `5b189e4` exists, and `git diff 5b189e4 HEAD -- src` is empty, so the `src/app`-unchanged gate (08-01:174) holds.
- The scans being re-pointed are exactly the regexes and counts in `tests/guards/economy-purity.test.ts:320-353` and `tests/app/redraw-gate.test.ts:112-140`.

**Concerns:** None new.

**Risk:** LOW

## 08-02
**Summary:** Pins the v1 flight hashes and RNG vectors, adds the serialisable mulberry32 stream and the `mix32` world and fork seeds.
**Strengths:**
- `createSeededRandom` (`src/sim/math.ts:227-235`) is a pure mulberry32 closure, so delegating it to `rngNext` over a plain `s` state is bit-exact.
- The only `src/sim` caller is `src/sim/hyperspace/arrival.ts:73`, as the plan's scan claims. The render callers sit outside `src/sim`.
- `hashFlight` returns a string (`src/sim/flight/state.ts:181`), which matches the `worldHash(): string` used later.

**Concerns:** None.

**Risk:** LOW (the owner checkpoint covers the one-way door).

## 08-03
**Summary:** Adds the determinism lint bans with probes.
**Strengths:**
- No `src/sim` file uses `Reflect`, `globalThis`, `self`, a bare `.sort()` or `toSorted()`, or a Math alias (rg over `src/sim`; the `= Math` hits are calls like `Math.trunc`, not aliases).
- The Reflect selectors (08-03:141) cover `Reflect["get"]` through `[computed=true]`.

**Concerns:**
- LOW: `MemberExpression[object.property.name=/^(sort|toSorted)$/][property.name=/^(call|apply|bind)$/]` misses the computed form `Array.prototype.sort["call"]`. Add it to the documented residuals or match `property.value` too.

**Risk:** LOW

## 08-04
**Summary:** Split steps 1-2: the typed context and the first controller.
**Strengths:** The `^  (const|let) … = ctx.` alias guard (08-04:119,131) is a sound textual check against closure-level captures of live fields.

**Concerns:** None new.

**Risk:** LOW

## 08-05
**Summary:** Builds the world foundation: ids, entities, the store, the five statics and the world hash.
**Strengths:**
- `hashWorld` is composed over the unchanged `serializeFlight`, with an empty section while `isNeverSpawned` holds, which keeps D-08.
- The allocate refusal at `2 ** 32` is unit-pinned (08-05:180).
- `liveEntityCount` is exported for 08-16 (08-05:137).

**Concerns:**
- MEDIUM (domain drift): the shared caps are defined in three places:
  - 08-05 hard-codes `128`, `1e12`, `32` and `64` inside `spawnEntity` (08-05:137);
  - 08-11 exports `MAX_ENTITY_MAGNITUDE` and `MAX_SNAPSHOT_*` from `sanitize.ts` (08-11:45,277);
  - 08-13 exports `MAX_SNAPSHOT_MAGNITUDE`, `MAX_SNAPSHOT_STRING_LENGTH`, `MAX_SNAPSHOT_PARAM_LENGTH` and `MAX_AI_PARAMS_KEYS` again from `snapshot.ts` (08-13:34,107).

  The Round 3 alignment holds today only because the literals happen to match. Define them once in 08-05 (for example in `src/sim/world/limits.ts` or `ids.ts`) and import them in `world.ts`, `sanitize.ts` and `snapshot.ts`. Gate this with `rg -c "= 128\b|= 1e12\b" src/sim/world/{sanitize,snapshot}.ts` printing nothing.
- LOW: `spawnEntity` checks that the orientation is finite and has `normSq > 0`, but not that it is a unit quaternion (08-05:137). `parseWorldSnapshot` requires `|normSq-1| <= 1e-9` (08-13:26). Two consequences:
  - An entity spawned with `{w:2,…}` and snapshotted before its first `stepWorld`/`sanitizeEntity` is refused by the parser.
  - The first update tick moves it by a non-unit forward axis.

  Normalise at spawn (`normalize(init.orientation)`), or reject outside the tolerance, so all three domains agree.

**Risk:** MEDIUM

## 08-06
**Summary:** Split steps 3-4: the render driver and the chart and settings controllers.
**Strengths:** The alias guard on `render-driver.ts` (08-06:112,125).

**Concerns:** None new.

**Risk:** LOW

## 08-07
**Summary:** The AI seam: a read-only `WorldView` and a write-only `ShipControl`.
**Strengths:**
- The view takes the player per call (G-8).
- The `Record<keyof …>` member pins.
- The station orientation is cross-checked against `src/render/bodies/station.ts:210-215`.

**Concerns:** None new.

**Risk:** LOW

## 08-08
**Summary:** Split steps 5-6: the station and save controllers.
**Strengths:** The existing post-`await` guard `if (disposed || !saveScreenOpen) return;` is real (`src/app/game-session.ts:1341-1344`) and is kept.

**Concerns:**
- LOW: 08-08:144 items (ii) and (iii) add new `disposed` short-circuits after `await saveBoot.store.clear(...)` (`src/app/game-session.ts:1490`) and in `queueSnapshot`'s `.then`. Neither exists today, and both sit inside a commit described as a verbatim move. They are harmless to v1 play, because they only act after dispose. Record them as deliberate deviations in the SUMMARY so a bisect does not attribute them to the move.

**Risk:** LOW

## 08-09
**Summary:** AI types, integer tick timers, the registry, the scripted test pilot and the AI lint zone.
**Strengths:** Recursive zone globs, a sealed re-export surface, and inherited bans proven inside the zone.

**Concerns:**
- LOW: the zone lets AI modules import `sim math`, and `src/sim/math.ts:227` exports `createSeededRandom`, a closure-held random source. That contradicts the truth "the pilot … imports no random source" (08-09 truths). The 08-02 scan catches a `createSeededRandom(` call, but not an aliased import (`import { createSeededRandom as r }`). Add `importNames: ["createSeededRandom"]` to the zone's `no-restricted-imports` for `math.js`, with one probe.

**Risk:** LOW

## 08-10
**Summary:** Split steps 7-8: the hyperspace controller, the event router and the sim driver.
**Strengths:**
- The 14-kind `EVENT_KIND_SUBSCRIBER` map matches `src/sim/events.ts`.
- The step-option parity cases are written against `game-session.ts:2814-2836`.
- The pre-launch autosave cases match the real drain at `:2763-2781`.

**Concerns:** None new.

**Risk:** LOW

## 08-11
**Summary:** The world step, the AI queue, the sanitiser and the reserved events.
**Strengths:**
- `sanitizeEntity`'s output domain now matches the parser row for row: radius in `(0, 1e12]`, `specKey` of 1-128 characters, counters in `0..0xffffffff`, renormalisation outside 1e-9, and `repairs` saturating.
- The table test has a repairs-delta column.

**Concerns:** See 08-05 MEDIUM (the duplicated constants).

**Risk:** LOW

## 08-13
**Summary:** The snapshot codec, the 1,000-tick live-versus-restored equality and the world cadence test.
**Strengths:**
- The Round 3 non-vacuity fix is in place.
- `restoreWorld` validates through `parseWorldSnapshot`.
- An exhaustive `ENTITY_FIELDS` table.
- `snapshot.rng === world.rng.s` is asserted.

**Concerns:**
- HIGH (an assertion that cannot pass as written): the converse check at 08-13:140 says that a NaN mutated into `position`, `radius` **or `ai.params`**, without sanitising, "is refused by `parseWorldSnapshot` after JSON (`null` in a number slot)". For a scalar `ai.params` value, `JSON.stringify(NaN)` gives `null`, and `null` is a legal `ParamValue` (`null | boolean | number | string | …[]`, 08-05:137 step 2). The parser does not reject it (08-13:26 lists no null-param rejection). So that variant either fails, or pushes the implementer to reject `null` params and break the `ParamValue` round trip. Fix one of two ways:
  - restrict the `ai.params` variant to a NaN element inside a param **array**, and state that a `null` array element is rejected, because elements are `number | string`;
  - or have `snapshotWorld` refuse non-finite numbers itself, with its own reason (`non-finite`), before JSON.
- LOW: the `ENTITY_FIELDS` row for `orientation` must use a mutation that stays unit within 1e-9, or "reproduce the mutated value exactly" fails at the parser. State this in the row guidance.
- LOW: the parser spec does not say whether `boolean` or `null` elements inside a param array are rejected. `sanitizeEntity` filters them out (08-11:168), so the parser should reject them, and a row should pin that.

**Risk:** MEDIUM

## 08-12
**Summary:** Split step 9: the frame loop, the start-up wiring and the thin facade.
**Strengths:**
- The pinned-literal audit counts match the source exactly.
- No timers in `src/app` today (rg returns nothing), so the gate at 08-12:141 can pass.
- Both listeners already pass `signal: uiController.signal`.

**Concerns:**
- LOW: the `swapSystem` change (08-12:117) tracks the settlement rAF and resolves it on abort, which goes beyond a verbatim move (`src/app/game-session.ts:3284-3294`). It is acceptable, but should be recorded as a deliberate deviation.

**Risk:** LOW

## 08-14
**Summary:** Test flags and the manual-clock sim driver with `advanceTicks`.
**Strengths:**
- `parseTestFlags` replaces the existing exact `get("test") === "1"` read (`src/app/game-session.ts:3185`).
- The manual branch keeps the station-action drain (`:2757-2760`), so a launch click lands in `pending` and the next `advanceTicks` drains it.
- The docked tick advances under the realtime clock, because `loop.advance` runs in every non-paused mode (`:2763-2795`). This supports 08-16 case (c).

**Concerns:** None new.

**Risk:** LOW

## 08-15
**Summary:** The single integration plan: world lifecycle, epoch bump points and the anchored-save check.
**Strengths:**
- The anchored-save test is now type-correct against `encodeSave(inputs: SaveInputs): string` (`src/persistence/save.ts:663`).
- The `stepFlight(` count in `src/app` goes from 1 to 0, and no existing test pins `stepFlight` in session source (the redraw-gate and economy-purity scans do not reference it).
- The empty-world performance bound is realistic: an empty `stepWorld` does no per-entity work.

**Concerns:** None new.

**Risk:** LOW

## 08-16
**Summary:** The one deliberate probe commit: `probe.sim`, `worldHash` and `advanceTicks`, plus browser/Vitest parity.
**Strengths:**
- `createTestHook` gets a required fifth parameter, and there is one call site today (`src/app/game-session.ts:1035`, which moves to `probe-publisher.ts`).
- `worldHash(): string` matches `hashFlight`'s string return.
- `probe.sim` is published only inside `if (currentState !== undefined)`.
- 600 ticks clear the 2 s (240-tick) launch (`src/sim/flight/launch.ts:23`, `src/sim/step.ts:8`).

**Concerns:**
- HIGH (an acceptance criterion that cannot pass): 08-16:143 requires `rg -n "world/store|\.store\b" src/app` to print nothing and exit 1. `\.store\b` already matches four lines of save-boot code: `saveBoot.store` at `src/app/game-session.ts:1167`, `:1341`, `:1490` and `:3345`. 08-08:144 moves that code into `src/app/session/save-controller.ts` while keeping `saveBoot.store.read()`, so the gate fails on the persistence store and has nothing to do with the world store. Narrow it to `rg -n "sim/world/store|world\.store\b|worldLifecycle[^;]*\.store\b" src/app`, or ban the import with an ESLint `no-restricted-imports` pattern `**/sim/world/store*` scoped to `src/app/**`.

**Risk:** MEDIUM. The fix is trivial, but an executor that hits the gate would either rename save code or weaken the gate on the spot.

## Overall

All Round 3 findings are resolved in the plan text, and the line anchors and literal counts are accurate against the current source. Three new correctness defects remain:
1. 08-16:143: the `\.store\b` gate collides with `saveBoot.store` and cannot pass.
2. 08-13:140: the converse-NaN check for a scalar `ai.params` value cannot pass, because a JSON-nulled NaN is a legal `null` `ParamValue`.
3. 08-05, 08-11 and 08-13: the domain caps are defined three times. They should come from one module to keep the Round 3 alignment from drifting.

There are also minor items: spawn-time quaternion normalisation (08-05), the `createSeededRandom` import in the AI zone (08-09), and deviations from the verbatim move to record (08-08, 08-12). None of this affects v1 play. The fixes are small text edits.

**Verdict: NEEDS REVISION** (targeted edits to 08-16 and 08-13, plus the 08-05 constants module; no architectural change).
