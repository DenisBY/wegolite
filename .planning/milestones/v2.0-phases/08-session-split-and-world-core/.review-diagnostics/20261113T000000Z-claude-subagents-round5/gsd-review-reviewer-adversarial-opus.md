# Phase 8 Plan Review, Round 5: reviewer-adversarial-opus

Lens: adversarial input and trust boundaries. That covers hostile or corrupt snapshot and save input, prototype keys, caps, validators versus sanitizers, lint-guard evasion, ways determinism can escape, test hooks reaching production, and persistence and security risks.

Commit reviewed: `afc4fe0`. I read all of 08-05 and 08-13 in full. For 08-07, 08-09, 08-11, 08-14, 08-15 and 08-16 I read the must_haves and the tasks this lens touches. For 08-01, 08-02, 08-03, 08-04, 08-06, 08-08, 08-10 and 08-12 I read the objectives plus targeted `rg` sections. I checked source anchors in `src/app/game-session.ts`, `src/app/probe.ts`, `src/persistence/save.ts`, `src/persistence/autosave.ts` and `src/sim/math.ts`; codebase-memory coverage reports `no_recorded_issue` for all five. I ran no container. Every finding below comes from reading plan text against source.

## Round 4 consensus check (items 1-14)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | NaN in `ai.params` cannot be rejected after JSON | **Resolved** | `08-05-PLAN.md:148` defines the ParamValue domain: null and boolean are legal, a non-finite number never is. `08-13-PLAN.md:23,115` makes `snapshotWorld` throw `SnapshotError("non-finite")` before it serializes anything. `08-13-PLAN.md:154-155` adds null and boolean to the generator, and the converse is checked only where it is decidable: (i) refusal before JSON, (ii) a null inside an array or a number slot, (iii) a scalar null is accepted. |
| 2 | `\.store\b` gate can never pass | **Resolved** | `08-16-PLAN.md:146` narrows the regex to `sim/world/store`, `world\??\.store\b`, store method calls and `EntityStore`. The IndexedDB `saveBoot.store` sites no longer match. |
| 3 | `advanceTicks` undefined outside the manual clock | **Resolved** | `08-16-PLAN.md:30,143,212`: the method is always present and refuses outside `clock=manual`. The fixture check asserts `"function"` in both hook states. |
| 4 | Shared limits defined three times | **Resolved** | `08-05-PLAN.md:31,146,184-185`: a single `limits.ts` with seven exact-value gates and a redefinition regex. `08-13-PLAN.md:115,129` imports and never re-exports. `08-11-PLAN.md:32` imports from `./limits.js`. |
| 5 | Enum leaves unchecked; `registry[aiKey]` throws | **Resolved** | Spawn checks with `includes` (`08-05-PLAN.md:153`). Sanitize repairs or kills (`08-11-PLAN.md:183` rule 9). Dispatch goes through `Object.hasOwn(registry, …)` with a gate (`08-11-PLAN.md:35,136,152`). The parser checks all four (`08-13-PLAN.md:26`). |
| 6 | Quaternions passing spawn or sanitize but failing the parser | **Resolved** | Spawn requires a unit quaternion (`08-05-PLAN.md:157`). Sanitize resets a norm below `MIN_QUAT_NORM_SQ` to identity and re-checks after normalizing (`08-11-PLAN.md:177`, rule 2). The property includes `{w:1e-160}` and `{w:3e-161}` as constants (`08-13-PLAN.md:154`). |
| 7 | `worldSeed` never checked as uint32 | **Resolved** | `createWorld` throws `RangeError` (`08-05-PLAN.md:32,151,212`). The parser rejects 1.5, -1, 2^32 and null (`08-13-PLAN.md:26,143`). |
| 8 | `createEventRouter` signature contradiction | **Resolved** | `08-10-PLAN.md:40,158` and `08-15-PLAN.md:108,133` both use `(ctx, subscribers)`. `rg "createEventRouter\(subscribers"` finds only the ledger row. |
| 9 | Lint guard gaps | **Resolved** | 08-03 adds `no-eval`, `no-new-func`, `no-implied-eval`, `Intl` and `localeCompare` bans plus the computed sort/call forms (`08-03-PLAN.md:27,150,170`). 08-09 adds `importNames: ["createSeededRandom"]` at depths 1 and 2 and `AI_MODULE_STATE_BANS` (`08-09-PLAN.md:30-31,192-194,211`). |
| 10 | Restore check relies on a rounded hash | **Resolved** | Exact `JSON.stringify(snapshotWorld(…))` comparison plus `toStrictEqual` on the player (`08-13-PLAN.md:22,116,128`). See the new finding N1, which shows this exact check fails as specified. |
| 11 | Drain caps passes, not deliveries | **Resolved** | `MAX_AI_EVENTS_PER_DRAIN = 4096`, `MAX_AI_QUEUE_LENGTH = 4096`, validated `a`/`b`/`n`, and a conservation-law test (`08-11-PLAN.md:30,168,171-172,191`). |
| 12 | ShipControl accepts out-of-domain values | **Resolved** | `08-07-PLAN.md:30,117,154`: every argument is checked against `limits.ts`, and `perform` uses `includes`. |
| 13 | No Firefox run | **Resolved** | A non-blocking `e2e-cross` run at step 9 (`08-12-PLAN.md:137`) and after verify-full (`08-15-PLAN.md:36,216,232`). |
| 14 | LOW items (deviation records, best-of-N, stale anchors) | **Resolved** | Deviations are recorded at `08-08-PLAN.md:146,165` and `08-12-PLAN.md:137,266`. Best of three: `08-15-PLAN.md:39`. Locate by pattern: `08-08-PLAN.md:80`, `08-12-PLAN.md:91`. |

All 14 Round 4 consensus items are resolved in the plan text.

## New findings (summary)

| ID | Severity | Plans | Finding |
|----|----------|-------|---------|
| N1 | **HIGH** | 08-13 (08-05) | The order of `ai.params` keys differs between the live and restored worlds. The exact snapshot-JSON checkpoint check fails as written, and an AI that uses `Object.keys` on its params is a determinism escape. |
| N2 | MEDIUM | 08-05, 08-13, 08-11 (Phase 11 boundary) | Nothing caps the total size of a world. The per-field caps allow about 67 M string chars of params, so a legal world can produce a snapshot or hash text near V8's string limit, which makes the save fail. |
| N3 | MEDIUM | 08-13 | `snapshotWorld` refuses only non-finite values. A finite but out-of-domain world produces a snapshot its own parser rejects, which would be an unloadable save in Phase 11. |
| N4 | LOW | 08-05, 08-11, 08-13 | Sparse param arrays (holes) and a non-object `ai.params` are not specified. Iterating with `every` or `filter` skips holes, and `Object.keys(null)` throws. |
| N5 | LOW | 08-05 | `spawnEntity` validates, then copies, reading getters twice (TOCTOU). The parser already pins single-read. |
| N6 | LOW | 08-11, 08-13 | The live `params` prototype is not canonicalized. An AI that replaces `ctx.ai.params` with a literal keeps `Object.prototype` live, while the restored object has a null prototype. |
| N7 | LOW | 08-04, 08-08 | `testTainted` is now a writable field on the shared `ctx`. No gate keeps it monotonic. |
| N8 | LOW | 08-03, 08-11 | The entity-id-scope guard is a token scan. Ids reach `src/app` as plain numbers through `SimEvent` payloads and `Entity["id"]`. That residual is not documented. |
| N9 | LOW | 08-09 | Function-object properties (`think.count = …`) are a form of module-level state that neither the module-state lint nor its documented residual list mentions. |

## 08-01

**Summary:** Step 0: a concatenating source helper, the probe-shape pin and the local verify-full baseline on a worktree.

**Strengths:** The probe-shape snapshot is the trust anchor for every later hook change. `08-16-PLAN.md:143` builds a subtractive check on it. `advanceTicks` stays a function, so the Round 4 contract holds.

**Concerns:** None new under this lens.

**Suggestions:** None.

**Risk:** LOW.

## 08-02

**Summary:** A serialisable mulberry32 `RngState`, mix32/fmix32, `worldSeedFor`/`forkSeed`, and `createSeededRandom` delegating to it.

**Strengths:** Literal vectors land in the same commit as `rng.ts` (`08-02-PLAN.md:196,214`). `forkSeed` throws `RangeError` on a bad epoch or entityId, and the fixed-step callers pre-guard (`08-02-PLAN.md:193`). mulberry32 has no zero fixed point (`src/sim/math.ts:227-235`), so an arbitrary uint32 state from a snapshot is safe. The ledger correctly notes that every stream walks the same Weyl cycle (`08-02-PLAN.md:198`).

**Concerns:** None new.

**Suggestions:** None.

**Risk:** LOW.

## 08-03

**Summary:** The src/sim determinism bans, the reflection and alias selectors, and the `entity-id-scope` source-scan guard.

**Strengths:** The Round 4 additions close the eval, Function, Intl, localeCompare and computed-sort gaps, each with a probe (`08-03-PLAN.md:27,150,170`). The guard lands in wave 1, before `ids.ts` exists (`08-03-PLAN.md:32,60`).

**Concerns:**
- **LOW (N8):** `findEntityIdLeaks` (`08-03-PLAN.md:194`) reports only imports that resolve to `src/sim/world/ids` and the `EntityId` token. In Phase 8, ids already cross into `src/app` as plain numbers in two ways. First, `SimEvent` payloads such as `entityRemoved {id}` and `shipDestroyed {id, killer}` (`08-11-PLAN.md:39`) pass through the app's event router. Second, `Entity["id"]` or `WorldView`-derived types can name an id without the token. The rule "consumers never store the id" (`08-11-PLAN.md:39`) is documentation only. The plan documents residuals for the lint guards (T-08-38) but not for this guard.

**Suggestions:** Add a residual note to the guard header and to Key Decisions row (d). The guard is "necessary, not sufficient": ids arrive as `number` through `SimEvent` payloads, and the first app subscriber that stores one (a Phase 12 HUD target) must arrive with the boundary-clearing row that `08-05-PLAN.md:224` already requires.

**Risk:** LOW.

## 08-04

**Summary:** Split steps 1 and 2. The closure state moves into a typed `SessionState` ctx, and the probe publisher is extracted.

**Strengths:** The probe publisher builds fresh plain objects, and `withdrawProbe` deletes the test, save and saveScreen fields (`08-04-PLAN.md:154`).

**Concerns:**
- **LOW (N7):** Before the split, `testTainted` is a closure `let` (`src/app/game-session.ts:475`). Its only writes are the initializer and `= true` in the hook callback (`:1039`), so the taint latches by construction. After step 1 it becomes the field `ctx.runtime.testTainted`, writable by every module that receives `ctx` (station, save, hyperspace, sim driver, frame loop). Every durable-save guard (`src/app/game-session.ts:1224,1261`) depends on it never going back to false. No plan gates that.

**Suggestions:** Add a cheap gate to 08-04, re-asserted in 08-08 and 08-12. `rg -n "testTainted\s*=\s*false" src/app` must print nothing; the initial value is set only in `createSessionState`'s object literal. Alternatively, expose a setter that latches only (`markTainted()`).

**Risk:** LOW.

## 08-05

**Summary:** Ids, `limits.ts`, the vocabularies, the entity and static records, the store, `createWorld`, `spawnEntity` validation and the injective world hash.

**Strengths:** One limits module, with redefinition gated (`08-05-PLAN.md:184-185`). Enum membership always uses `includes`, never `in` or indexing (`:153`). Params are enumerated with `Object.keys` plus `hasOwn`, forbidden keys are refused, and params are copied onto `Object.create(null)` (`:158-159`). `encodeHashString` keeps the hash text ASCII and injective: JSON escapes the backslash, so the literal text `Ł` and the character `Ł` stay distinct, and lone surrogates are escaped by well-formed `JSON.stringify`. Type tags separate `1`, `"1"` and `true` (`:160-162`). A refused spawn never advances `nextId` (`:29`).

**Concerns:**
- **HIGH via 08-13 (N1, root cause here):** `spawnEntity` copies `ai.params` "onto `Object.create(null)`" with no key order specified (`08-05-PLAN.md:159`), so live params keep insertion order. `createTestPilotAi` inserts `phase, targetId, scanRange, holdRange, cruiseSpeed` (`08-09-PLAN.md:122`), which is not code-unit sorted. The parser rebuilds params in sorted order (`08-13-PLAN.md:115`). See 08-13.
- **MEDIUM (N2):** The caps apply per field only. One entity can carry 32 keys × 64 elements × 128 chars, about 262 k chars of params. With 256 entities that is about 67 M chars. `encodeHashString` writes each code unit above 0x7e as six characters, so `hashWorld` text for a legal world can reach about 400 M chars, close to V8's maximum string length (about 2^29). The snapshot JSON (lone surrogates are escaped as six characters) can do the same. A legal, sanitize-clean world (AI code may write params up to the caps) can therefore make `worldHash()` or a Phase 11 save throw `RangeError: Invalid string length`, or write a blob of hundreds of MB to IndexedDB.
- **LOW (N4):** Holes and container shape are unspecified. A param array such as `[1, , 2]` built in process passes a validator written with `Array.prototype.every`, because `every` skips holes. `.slice()` keeps the hole, `JSON.stringify` writes `null` there, and the parser then rejects the element. Separately, `init.ai.params` set to `null` throws a `TypeError` from `Object.keys`, and an array value is accepted and stored as index keys. Spawn runs inside the fixed step once the Phase 12 populator exists.
- **LOW (N5):** Spawn validates a field, then copies it, reading accessor properties twice. The parser explicitly pins single-read (`08-13-PLAN.md:26,144`). Spawn callers are trusted code, so this is LOW.

**Suggestions:**
- Copy params in code-unit sorted key order at spawn, the same order the parser uses, and say so in the step 5 text.
- Add an aggregate budget to `limits.ts`, for example `MAX_AI_PARAMS_CHARS` per entity (total chars across keys, strings and string elements, around 4 k), enforced at spawn, in sanitize and in the parser. Or lower the string-array caps. Record that changing it bumps `WORLD_SNAPSHOT_VERSION`.
- Require `ai.params` to be a non-array, non-null object. Validate arrays with index loops (`for (let i = 0; i < a.length; i++)`), and add a hole row (`[1, , 2]`) to the refusal table.
- Read each init leaf once into a local, then validate and copy that local.

**Risk:** MEDIUM.

## 08-06

**Summary:** Split steps 3 and 4: the render driver, then the chart and settings controllers.

**Strengths:** These are UI-only moves. No new trust boundary, and the redraw-gate count is pinned.

**Concerns:** None under this lens.

**Suggestions:** None.

**Risk:** LOW.

## 08-07

**Summary:** A read-only `WorldView` and a write-only `ShipControl` over the world, the layout and the live player.

**Strengths:** The view returns fresh plain copies (`08-07-PLAN.md:24`). Control writes are limited to the actor and validated against `limits.ts`. `scheduleWake` requires a safe integer of at least 1 that cannot overflow uint32 (`:117,153-154`). Ids are world-scoped, with a cross-world negative test (`:32`).

**Concerns:**
- **LOW (residual, feeds N6):** The seam's validation covers only `ShipControl`. `AiContext.ai` is the actor's live, mutable `AiComponent` (`08-09-PLAN.md:120`), so an AI can write NaN, a nested object or an over-long string straight into `ai.params` and the timers. That bypasses the item 12 guarantee ("a legitimate AI write is never turned into hashed sanitize repair noise") and lands as a `repairs` increment one tick later. This is acceptable by design, but it is not stated.

**Suggestions:** State in `control.ts` or `types.ts` that writes to `ai.params` and the timers through `ctx.ai` are trusted, and that sanitize repairs them (counted in `repairs`). Alternatively, offer a `ctl.setParam` that validates.

**Risk:** LOW.

## 08-08

**Summary:** Split steps 5 and 6: the station controller, then the save controller with the in-session Load.

**Strengths:** The order of the save guards is unit-proven: `recovering` first, then `tainted`, with the attempt counter incremented first (`08-08-PLAN.md:26,150`). `src/persistence` is unchanged (T-08-14). The added `disposed` guards are recorded as deliberate deviations (`:146,165`).

**Concerns:**
- **LOW (N7, continued):** The save controller is the main reader of `ctx.runtime.testTainted`. Nothing proves the move adds no `testTainted = false` (for example an in-session Load that "resets" state). Today the taint latches across a Load (`06-REVIEW` IN-01).

**Suggestions:** Re-run the N7 gate at step 6. Add one Node row: after a Load on a tainted session, `ctx.runtime.testTainted` is still true.

**Risk:** LOW.

## 08-09

**Summary:** The AI types, the time base, the frozen registry, the scripted test pilot and the AI lint zone.

**Strengths:** Exact `paths`/`importNames` bans on `createSeededRandom`, covering the alias and namespace-import forms (`08-09-PLAN.md:192`). A depth-3 catch-all rejects every import (`:191`). Case-sensitive allow-list regexes are pinned by a table read from the effective config (`:198`). `AI_MODULE_STATE_BANS` is spread into every block, and its residuals are documented (`:193`). The re-export surface of the four seam modules is sealed (`:197`).

**Concerns:**
- **LOW (N9):** Function-object properties are module-level state the lint cannot see: `function think(ctx) { think.calls = (think.calls ?? 0) + 1 }`, or `TEST_PILOT`-adjacent helpers carrying expando fields. They are not in the documented residual list (`:193` lists IIFE, `as const`, shallow freeze and class statics). `Object.freeze(TEST_PILOT)` freezes the module object, not the function objects it references.
- **Cross-ref (N1):** The pilot's params insertion order (`:122`) is the concrete trigger for the 08-13 failure.

**Suggestions:** Add "properties assigned on function objects" to the residual comment. Optionally add a selector, `AssignmentExpression[left.type="MemberExpression"][left.object.type="Identifier"]`, restricted to identifiers bound to top-level function declarations. Or freeze the functions that `TEST_PILOT` references.

**Risk:** LOW.

## 08-10

**Summary:** Split steps 7 and 8: the atomic hyperspace move, the ordered event router and the sim driver with `stepOnce` and the step-options builder.

**Strengths:** `isRoutedKind` rejects `"constructor"` and `"toString"` (`08-10-PLAN.md:165`), so the routing table cannot be read through the prototype. The signature is aligned.

**Concerns:** None new.

**Suggestions:** None.

**Risk:** LOW.

## 08-11

**Summary:** `stepWorld`/`stepSim`, the bounded AI event queue, field-complete idempotent `sanitizeEntity`, own-key dispatch and the reserved events.

**Strengths:** Own-key dispatch with a gate (`08-11-PLAN.md:35,152`). Validated, copy-only `postAiEvent` with a three-bound drop accounting (`:30,168-172,191`). Sanitize rules 1-9 take every bound from `limits.ts` and are idempotent (`:177-185`). The jump-step rule skips the world on the step that emits `hyperspaceJumped` (`:36,140`). That step is sound because the arrival installs synchronously inside `handleEvent` (`src/app/game-session.ts:2406-2407,2061-2112`) and each step reads the live layout (`:2797-2800`).

**Concerns:**
- **LOW (N6):** Rule 7 rebuilds params onto `Object.create(null)` in sorted order "when repairing" only (`:183`). A clean params object that an AI replaced through `ctx.ai.params = { … }` keeps `Object.prototype` and insertion order in the live world. The restored world has a null prototype and sorted keys (`08-13-PLAN.md:115`). If an AI reads an inherited name (`params.constructor`, `"toString" in params`) or iterates `Object.keys(params)`, live and restored worlds diverge. The exact-JSON check cannot see the prototype difference.
- **LOW (N4):** Rule 7's "filtered out of the copied array" step, done with `Array.prototype.filter`, silently drops holes. Whether that counts as a repair is unspecified, so idempotence and repair accounting depend on the implementation. Sanitize also does not handle structural replacement: if a cast sets `position`, `nav`, `rng` or `ai.params` to null or a non-object, sanitize throws a `TypeError` inside the fixed step, although the truth at `:32` claims totality.

**Suggestions:**
- Make the params rebuild unconditional when `Object.getPrototypeOf(params) !== null` or the keys are out of sorted order, and treat that as a normalisation (not counted), the same way `-0` is handled.
- Specify index loops for arrays and add a hole row.
- Either narrow "total" to "total over typed shapes" or add structural rows (a null `position`, `nav` or `params`) that repair to defaults or kill the entity.

**Risk:** LOW-MEDIUM.

## 08-12

**Summary:** Split step 9: the frame loop and session start-up wiring, with game-session.ts left as a facade.

**Strengths:** Firefox is run (non-blocking). The deviations are recorded. The facade export set is pinned.

**Concerns:** The N7 gate should hold after step 9 (start-session now builds `ctx`).

**Suggestions:** Include the `testTainted = false` gate in the step-9 pinned-literal audit (`08-12-PLAN.md:121`).

**Risk:** LOW.

## 08-13

**Summary:** The strict snapshot codec, the 1,000-tick live-versus-restored equality, the rejection table and cross-cadence world hashes.

**Strengths:** This is the strongest boundary in the phase. `parseWorldSnapshot` uses `Object.hasOwn`, never compares prototypes, reads each property once into a fresh tree, rejects unknown keys and `__proto__`/`constructor`/`prototype` at every level, bounds every counter, and applies every cap from `limits.ts` (`08-13-PLAN.md:26,115,143-144`). `restoreWorld` validates through the parser and shares no references (`:23,152`). Three distinct `snapshotWorld` refusals (`:25,150-151`). Correct use of JSON.parse semantics: an own `__proto__` key is caught.

**Concerns:**
- **HIGH (N1):** The must-have at `:22` and the Task 1 step at `:116`/`:128` require `JSON.stringify(snapshotWorld(live)) === JSON.stringify(snapshotWorld(restored))` at every checkpoint, in a scenario where four entities run `createTestPilotAi`. With the plans as written:
  - `spawnEntity` keeps the insertion order `phase, targetId, scanRange, holdRange, cruiseSpeed` (`08-05-PLAN.md:159`, `08-09-PLAN.md:122`);
  - `snapshotWorld` "deep-copies … `ai.params` on `Object.create(null)`" without specifying an order (`08-13-PLAN.md:115`);
  - `parseWorldSnapshot`, and therefore `restoreWorld`, "copies keys in code-unit sorted order" (`:115`).

  So the live JSON lists `"phase"` first and the restored JSON lists `"cruiseSpeed"` first. The strings differ while every value is equal, and the exact check fails on the first checkpoint. The key-order edge test (`:147`) compares only `entityHashes`, which sort keys, so it cannot reveal this. The underlying issue is also a real determinism escape. Nothing in the src/sim or AI lint bans `Object.keys`, `Object.entries` or `Object.values` order dependence (only `for..in`; `08-03-PLAN.md:23` keeps a "comparator-sorted Object.keys" positive control but does not require the sort). A future AI that iterates its params would behave differently after a restore, and a sorted `snapshotWorld` would then hide it.
- **MEDIUM (N3):** `snapshotWorld` refuses `uncommitted`, `queue-not-empty` and `non-finite` only (`:23,115`). A finite but out-of-domain world (radius -1, a 200-char specKey, aiKey `"trader"`, position 1e13, a nested param object, a sparse array) is emitted, and the plan's own parser rejects it. In Phase 8 this is test-only. For Phase 11 (SAVE-07/08), whose snapshot this codec "is the de facto contract" for (`:115`), it means the codec can write a save it cannot load: a save-loss path. The sanitize-then-snapshot property (`:154`) proves only that sanitized worlds parse.
- **MEDIUM (N2, continued):** The parser has no aggregate size bound (see 08-05). A hostile or legal Phase 11 blob of 256 entities at full caps is accepted, then every `hashWorld` and every save re-stringifies it.

**Suggestions:**
- Specify that `snapshotWorld` emits `ai.params` in code-unit sorted key order. Make `spawnEntity` (08-05) and the sanitize rebuild (08-11) store params in the same canonical order, so the live and restored objects are identical, not just their serializations.
- Add a test row: two worlds whose params differ only in insertion order give byte-equal `JSON.stringify(snapshotWorld(…))`, and a pilot restored from a snapshot sees the same `Object.keys(ctx.ai.params)` as the live one.
- Add `Object.keys`/`Object.entries`/`Object.values` without a following comparator `sort` to the documented AI-zone residuals, or ban them in the AI zone.
- Make `snapshotWorld` end with `parseWorldSnapshot(out)` (at most 256 entities, so it is cheap) and add an "out-of-domain" refusal reason, so the codec never emits what it cannot read. Add rows: an unsanitized radius -1 and an unsanitized aiKey `"trader"` both make `snapshotWorld` throw.

**Risk:** MEDIUM-HIGH. The fix is small, but the acceptance criterion fails as written.

## 08-14

**Summary:** `parseTestFlags`, the manual-clock frame branch, `advanceTicks` with `MAX_ADVANCE_TICKS`, and the shared drain path.

**Strengths:** The flags are exact-match and inert without `test=1` (`08-14-PLAN.md:27,118,152`). `advanceTicks` taints before its first step, so the pre-launch autosave inside the shared drain skips (`:58,125`). Refusals do not taint (`:153`). A throw mid-run leaves the session tainted with the tick advanced by exactly one (`:160`). The self-DoS residual is documented (T-08-29).

**Concerns:** None new. The synchronous arrival install (see 08-11) means `advanceTicks` across a jump steps the new world with the destination layout, so no mid-call mismatch arises.

**Suggestions:** None.

**Risk:** LOW.

## 08-15

**Summary:** The world lifecycle (begin, resume, end, `resetForRestore`), the `stepSim` plug-in at `stepOnce`, the save allow-list proof and the Firefox run.

**Strengths:**
- The world is read live on every step, and a gate forbids caching it (`08-15-PLAN.md:132,149`).
- `begin` refuses `epoch >= 0xffffffff` and a non-finite seed. `resetForRestore` accepts only `0..0xfffffffe` (`:31,39`). That is good preparation for a corrupt Phase 11 epoch.
- `resume(marketSeed)` receives a seed already validated as an integer in `0..0xffffffff` by the save schema (`src/persistence/save.ts:169,255`).
- The no-world-in-save proof checks both the top-level allow-list and the key substrings (`:35`).

**Concerns:** None new under this lens. N2 and N3 are Phase 11 inheritances; this plan writes no world state to the save.

**Suggestions:** Add a forward note to the Key Decisions row: before Phase 11 persists a world snapshot, N2 (aggregate budget) and N3 (`snapshotWorld` self-validation) must be closed.

**Risk:** LOW.

## 08-16

**Summary:** The one deliberate probe commit (`probe.sim`, `worldHash`, `advanceTicks`), the Node replay, Vitest parity and the tick-hook browser spec.

**Strengths:** `worldHash` returns `""` without a state or after dispose (`08-16-PLAN.md:129,212`). `probe.sim` is a fresh plain object with no references, and the test proves it (`:165`). The store gate is now correct (`:146`). Hook growth is limited to two methods (T-08-32). `probe.sim` is also published in production, because the probe is always installed (`src/app/probe.ts:368`), but it carries only scalars, so nothing writable reaches page script.

**Concerns:**
- **LOW (N2, continued):** `worldHash()` is a synchronous `hashWorld`. With a cap-filled world it can throw `RangeError` (string length). Phase 8 has no populator, so this is latent.

**Suggestions:** None beyond N2.

**Risk:** LOW.

## Overall Risk Assessment

**MEDIUM.** All 14 Round 4 consensus items are resolved with concrete plan text. The trust boundaries (parser, sanitizer, spawn, control and dispatch) are now aligned on one limits module and use own-key, `includes`-based membership throughout.

One new HIGH (N1) remains, and it is an acceptance criterion that cannot pass as written. 08-13's exact snapshot-JSON checkpoint compares a live world whose test-pilot params keep insertion order with a restored world whose params the parser rebuilds in sorted order. The same gap is a latent determinism escape for any AI that iterates its params. The fix is a few sentences in 08-05, 08-11 and 08-13: canonical sorted params order at spawn, at sanitize and in `snapshotWorld`.

The two MEDIUMs (N2 aggregate world size, N3 `snapshotWorld` emitting what its parser rejects) matter mainly at the Phase 11 save boundary, which this codec explicitly feeds. They should be fixed now while the format is version 1. The LOWs are documentation or one-line gates.

**Verdict: NEEDS REVISION.** These are targeted text edits to 08-05, 08-11 and 08-13 (N1 required; N2 and N3 strongly recommended), plus optional LOW gates in 08-03, 08-04, 08-08, 08-09 and 08-12. No wave, dependency or ownership change is needed.
