# Adversarial & Trust-Boundary Review (reviewer-adversarial-opus)

Round 4 review of the 16 Phase 8 plans at `0aa747a`. Lens: untrusted input (snapshots now, IndexedDB saves in Phase 11, the `?test=1` window hook), prototype pollution, validators that disagree, guards that can be bypassed, lifecycle races, and tests that pass while the bug remains. Claims were checked against the source at HEAD (`src/sim/hash.ts`, `src/sim/math.ts`, `eslint.config.js`, `src/app/game-session.ts`, `src/app/probe.ts`, `src/persistence/{save,autosave}.ts`) and across the plans.

## Round 3 disposition check

| Round 3 finding | Status | Evidence |
|---|---|---|
| 1a. fast-check must mutate in place after a valid spawn | Resolved | `08-13-PLAN.md:140` spawns with `radius = 10`, `tick = 0`, `specKey = "ship"`, then mutates leaves in place |
| 1b. Counter, id and tick bounds aligned | Resolved | `08-05-PLAN.md:137` (spawn), `08-11-PLAN.md:166-169` (sanitize), `08-13-PLAN.md:27` (parser): all `0..0xffffffff`, `repairs` saturating. `NO_ENTITY = 0` (`08-05:133`) makes the `-1` sentinel unnecessary |
| 1c. Quaternion tolerance pinned, underflow row | Resolved | `08-13-PLAN.md:27,107,133` |
| 1d. Caps, nested arrays, `__proto__`/`constructor`/`prototype` at every level | Resolved | `08-13-PLAN.md:27,133`; sanitizer `08-11-PLAN.md:167` |
| 1e. `restoreWorld` validates; `snapshotWorld` anti-alias test | Resolved | `08-13-PLAN.md:23,107,138` |
| 2. `snapshotForSave(inputs)` call shape | Resolved | `08-15-PLAN.md:35,206` inspects `inputs` and `encodeSave(inputs)` (`src/persistence/save.ts:663` takes one `SaveInputs`) |
| 3. `createTestHook` `sim` parameter required; `probe.sim` primitives | Resolved | `08-16-PLAN.md:125-126`, Task 2 step 2. `worldHash(): string` is correct: `hashFlight` returns a string (`src/sim/flight/state.ts:181`) |
| 4. `1e12` vs `1e9` citation | Resolved | `08-05-PLAN.md:137`, `08-11-PLAN.md:166` |
| 5. Store `2 ** 32` row, Reflect/sort residuals, listener signal, line anchors | Resolved | `08-05-PLAN.md:180`, `08-03-PLAN.md:141-145`, `08-12` truths; anchors `:2738/:2749/:2773/:2859` match HEAD |

All Round 3 findings are closed. The findings below are new.

## 08-01

**Summary.** Sets up the split's safety nets: a verify-full baseline, a strict probe-shape snapshot and order-independent session-source scans.

**Strengths.** The comparator treats `[]` as matching only `[]`, and `PROBE_SHAPE_VOLATILE_EMPTY_ARRAY_PATHS` starts empty. Optional keys are sorted into state-determined and timing-dependent, and the fixture must pass three assert-mode runs, which closes the "permissive fixture" bypass. The baseline runs on a detached worktree of `5b189e4` under its own Compose project, so another plan's edits cannot leak into the evidence.

**Concerns.**
- LOW: the probe-shape spec checks key sets and leaf types, not values. That is by design, but nothing in this plan stops a later plan from publishing a live object reference (an alias) under an existing key. 08-16 adds its own primitive-only check for `probe.sim`; the existing `probe.*` keys have none.

**Suggestions.** None blocking.

**Risk.** LOW.

## 08-02

**Summary.** Pins the v1 flight hashes and RNG vectors, adds a serialisable mulberry32 `RngState`, and defines the `mix32` world and fork seeds.

**Strengths.** The vectors are captured from the unmodified closure and compared with `toBe`. `forkSeed` and `worldSeedFor` throw `RangeError` at the boundary, and the fixed-step callers guard their inputs so the throw cannot be reached from the frame loop (`08-02-PLAN.md:197`).

**Concerns.**
- MEDIUM (feeds the 08-09 finding): the permanent guard against closure-held streams is a text scan for `createSeededRandom\(` (`08-02-PLAN.md:220`). An aliased import (`import { createSeededRandom as r } from "../math.js"`) or a namespace import (`m.createSeededRandom(...)` written through a variable) gets past it. `createSeededRandom` is still exported from `src/sim/math.ts:227`, and 08-09 lets AI modules import that file.
- LOW: `worldSeedFor`/`forkSeed` coerce `worldSeed` with `>>> 0` (`:197`), so `1.5`, `-1` and `2**32 + 7` all quietly become different but valid seeds. This matters only because the 08-13 parser does not require a `uint32` `worldSeed` (see 08-13).

**Suggestions.** Make the scan import-aware: fail on any `import` of `createSeededRandom` outside `arrival.ts`, whatever the local name. Better, move `createSeededRandom` out of `math.ts` into a module the AI zone cannot import.

**Risk.** LOW-MEDIUM.

## 08-03

**Summary.** Adds determinism lint bans in `src/sim` and proves each one with a probe.

**Strengths.** Every ban has a real-config probe and a positive control. Probes are written under a lock, prefixed `__purity_`, carry the SPDX header, and are cleaned up afterwards. The Reflect and `.sort.call/.apply/.bind` forms are now caught or documented as residual.

**Concerns.**
- MEDIUM: the `src/sim` block (`eslint.config.js:71-150`) has no `no-eval`, `no-new-func`, `localeCompare` or `Intl` ban. The repository already applies all four to the generator zone (`eslint.config.js:208-241`, `files: ["tools/oolite-ingest/**/*.ts"]`), and 08-03 does not carry them over. Each of these passes the planned rules:
  - `new Function("return Math.random()")()`
  - `(0, eval)("Date.now()")`
  - `xs.sort((a, b) => a.localeCompare(b))`, which is ICU- and locale-dependent and so breaks cross-machine replay. It has a comparator, so the bare-sort ban never fires.

  The globals ban on `globalThis` and `self` does not catch `Function` or `eval`.
- LOW: `.sort(undefined)` and `.toSorted(void 0)` behave exactly like a bare sort but pass the `arguments.length=0` selector. `Array.prototype["sort"].call(xs)` uses a computed `Literal` property, so `object.property.name` is undefined and the `.sort.call` selector misses it.

**Suggestions.**
- Add `no-eval`, `no-new-func`, `no-implied-eval`, `Intl` (global) and `CallExpression[callee.property.name="localeCompare"]` to `SIM_GLOBAL_BANS`/`SIM_SYNTAX_BANS`, each with a probe.
- Extend the sort selector to an `Identifier[name="undefined"]` argument or a `UnaryExpression[operator="void"]` argument, and add a `[property.value=/^(sort|toSorted)$/]` computed variant. Otherwise, list both forms as documented residuals.

**Risk.** MEDIUM. The determinism proof leans on lint for future AI ports.

## 08-04

**Summary.** Split steps 1 and 2: a typed session context and the probe publisher extraction.

**Strengths.** A closure-level-alias scan ensures no live field is copied at factory scope (G-8). Publisher call sites are pinned by count and position, and the hook's mutate callback keeps both its taint and its redraw (`src/app/game-session.ts:1035-1042`).

**Concerns.** None new. The taint flag survives an in-session Load: `loadFromSave` never resets `testTainted` (`game-session.ts:1326-1430`), which is the safe direction.

**Risk.** LOW.

## 08-05

**Summary.** The world foundation: ids, entities, the five static entities, the store and the world hash.

**Strengths.**
- `spawnEntity` validates against the shared domain before calling `allocate` (`08-05-PLAN.md:137`).
- `allocate` counts non-dead entities and refuses at `nextId > 0xffffffff`.
- `STATIC_ENTITIES` is frozen.
- `ai.params` is copied onto `Object.create(null)`.
- `isNeverSpawned` is one predicate, and a source scan stops the serializer from re-spelling it.

**Concerns.**
- HIGH (shared with 08-11 and 08-13, detailed under 08-13): `ParamValue = null | boolean | number | string | readonly (number | string)[]` (`08-05-PLAN.md:134`) makes `null` a legal param value. The parser plan treats `null` as "a NaN that went through JSON". The three plans disagree on whether `null` and `boolean` are valid.
- MEDIUM: the hash text can be ambiguous, and the hash is coarse, so equality proofs can pass while a bug is present.
  - `serializeEntity` emits strings (`specKey`, param keys, string params) into a labelled line with no escaping or type tags (`08-05-PLAN.md:138`). A param string containing `\n`, `=` or the field separator can produce the same text as a different entity. A number `1` and a string `"1"` (both legal `ParamValue`s) may print the same.
  - `fnv1a32` hashes only the low byte of each UTF-16 code unit (`src/sim/hash.ts:13-16`), so `"A"` and `"Ł"` (U+0141) hash identically.
  - `canon` rounds to 6 decimals (`src/sim/hash.ts:29-33`).

  As a result, the `ENTITY_FIELDS` table (`08-13:139`) and the 1,000-tick equality can pass for a codec that loses precision below 1e-6, splits or merges param strings, or drops the high byte of a character.
- LOW: `allocate` accepts `nextId = 0xffffffff`, hands out that id and leaves `nextId = 2**32`. `snapshotWorld` then emits a `nextId` that the 08-13 parser rejects (`101..0xffffffff`, `08-13-PLAN.md:27`). The two validators disagree at the edge. It cannot happen in practice, but it is exactly the kind of disagreement this lens looks for.

**Suggestions.**
- Emit every string leaf as `JSON.stringify(s)`, which is deterministic for strings, and give each param value a type tag (`n:`, `s:`, `b:`, `z:` for null, `a:[...]`).
- Either make `allocate` refuse at `nextId >= 0xffffffff`, or let the parser accept `nextId <= 2**32`.

**Risk.** MEDIUM.

## 08-06

**Summary.** Split steps 3 and 4: the render driver, and the chart and settings controllers.

**Strengths.** The redraw gate keys on live identities read at call time. Listener totals and registration sites are pinned. verify-full runs on a detached worktree of the step commit.

**Concerns.** None new. Resume is refused while the WebGL context is lost, and the chart preset is test-pinned.

**Risk.** LOW.

## 08-07

**Summary.** The AI seam: a read-only `WorldView` and a write-only `ShipControl`.

**Strengths.**
- Every returned vector and quaternion goes through one `copyVec`/`copyQuat` pair (`08-07-PLAN.md:112`).
- Calls are honoured only for the actor.
- The view takes the player on each call, so a Load or arrival cannot leave it reading a stale object (G-8).
- Member sets are pinned by `Record<keyof ...>` tests.

**Concerns.**
- MEDIUM: `ShipControl` accepts a wider domain than spawn, sanitize and parse (`08-07-PLAN.md:113`).
  - `setDesiredSpeed` and `setDesiredRange` accept any finite non-negative number, with no `1e12` cap.
  - `setDestination` accepts any finite vector, with no `1e12` cap.
  - `setTarget` accepts any safe integer up to `2**53`.
  - `scheduleWake` accepts any safe integer number of ticks, so `wakeTick` can exceed `0xffffffff`.

  These values are accepted, then silently rewritten to `0` by `sanitizeEntity` at the end of the tick (`08-11-PLAN.md:164-168`) and counted in `repairs`, which is hashed. An AI that calls `setDesiredSpeed(2e12)` stops dead, and a wake scheduled too far ahead silently disappears. In between, other thinkers on the same tick see positions near `1e298`. This is the "validators disagree" pattern: the seam meant to be narrow and validated lets in values the next layer treats as corruption.
- LOW: `perform` checks membership in `BEHAVIOUR_IDS`. Nothing says the check must be `includes` rather than `in`/indexing, and with `in`, `perform("constructor")` would pass.

**Suggestions.**
- Bound `ShipControl` to the shared domain and ignore out-of-range calls: speeds and ranges `<= MAX_ENTITY_MAGNITUDE`, destination components `<= 1e12`, `setTarget` within `0..0xffffffff`, and `tick + ticks <= 0xffffffff`.
- Add rows to the Task 2 table proving those calls are ignored.

**Risk.** MEDIUM.

## 08-08

**Summary.** Split steps 5 and 6: the station controller and the save controller.

**Strengths.** The save guard order is pinned: recovering, then status, then tainted (`game-session.ts:1212-1228,1261`). After each `await` in Load, Clear and Write, the code re-checks `disposed` (and `saveScreenOpen` for Load) before going on. A failed parse changes no live field. `document` access is guarded for Node tests.

**Concerns.**
- LOW: the post-await re-check covers `disposed` and `!saveScreenOpen`. A Load that resolves after the player closed and reopened F2 still installs, because the check is a boolean and not a generation counter. This is pre-existing (`game-session.ts:1344`) and not a regression. Phase 11 will feed untrusted epochs through the same path, so a `saveScreenGeneration` token is worth recording as a follow-up.

**Risk.** LOW.

## 08-09

**Summary.** AI types, integer tick timers, the registry, the scripted test pilot and the AI lint zone.

**Strengths.** The allow-list regexes are case-sensitive and pinned by a table read from `calculateConfigForFile`. A depth-3 catch-all rejects deeper files. Dynamic `import()` is banned. A seal test checks that the seam modules cannot re-export internals. The registry and modules are frozen.

**Concerns.**
- MEDIUM-HIGH: success criterion 4 ("state survives a JSON round trip") is proven for the test pilot only. The lint zone, which is meant to protect the 14-22 AI ports, leaves two holes for closure-held state:
  1. The zone allows `../math.js` (`08-09-PLAN.md:182`), and `src/sim/math.ts:227` exports `createSeededRandom(seed): () => number`, a closure-held stream. 08-02's text scan can be bypassed with an alias (see 08-02).
  2. Nothing bans module-level mutable state in `src/sim/ai/**`: a top-level `let`, or a top-level `const` holding an array, Map or object that a think mutates. Freezing `TEST_PILOT` (`:119`) does not freeze the module's other bindings.

  An AI can therefore keep hidden state that the snapshot does not carry, which is exactly why running Oolite JS was rejected. The 1,000-tick test would catch it only if that AI ran in the test.
- LOW: the seal test looks for `export ... from`. A two-step re-export (`import { x } from "./store.js"; export { x }`) in `math.ts`, `view.ts` or `control.ts` gets past it. The "imports only `./rng.js`" check on `math.ts` covers that file, but `view.ts`/`control.ts` are checked only for `import type`, which is enough. This is a minor gap.

**Suggestions.**
- In the AI blocks, add `no-restricted-imports` `paths` with `importNames: ["createSeededRandom"]` for `../math.js` and `../../math.js`. Alternatively, move the function out of `math.ts`.
- Add `no-restricted-syntax` selectors `Program > VariableDeclaration[kind=/^(let|var)$/]` and `Program > ExportNamedDeclaration > VariableDeclaration[kind=/^(let|var)$/]`, each with a probe.

**Risk.** MEDIUM.

## 08-10

**Summary.** Split steps 7 and 8: the hyperspace controller, the event router and the sim driver.

**Strengths.**
- The arrival is one synchronous install block: everything that can throw runs before any live reference moves.
- The routing table is declarative.
- Frozen frames empty `pending`.
- `buildStepOptions` is pure, so the Node replay calls the same code.

**Concerns.** None new. The router passes unknown kinds through harmlessly.

**Risk.** LOW.

## 08-11

**Summary.** The world step: an id-order pass after the flight step, queued AI events, per-tick sanitizing, and reserved `SimEvent` kinds.

**Strengths.**
- The pass length is snapshotted, so an entity spawned this tick does not think until the next tick.
- The event queue drains first-in first-out, at most 8 passes, and is empty at every tick boundary.
- The view is built lazily.
- `sanitizeEntity` is table-pinned with a repairs-delta column.
- Cross-engine equality is explicitly not claimed.

**Concerns.**
- HIGH (detailed under 08-13): the sanitizer keeps `null` and `boolean` params (`08-11-PLAN.md:167`, step 7). Its guarantee that "every sanitized world snapshots to JSON that `parseWorldSnapshot` accepts" (`:32`) therefore depends on the parser accepting both, which 08-13's converse test contradicts.
- MEDIUM: the sanitizer is not field-complete for the closed-vocabulary fields the parser rejects. It never checks `kind`, `scanClass`, `nav.behaviour` or `ai.aiKey`. `AiContext.ai` is the live, mutable component (`08-09-PLAN.md:116`), `aiKey` is not `readonly`, and dispatch is `registry[ai.aiKey].think(ctx)` (`08-11-PLAN.md:126`, and `.onEvent` at `:174`). A wrong `aiKey` therefore throws a `TypeError` inside the fixed step. That includes a prototype key such as `"constructor"` on the frozen plain-object registry, where the lookup resolves through the prototype to `Object` and `.think` is undefined. The sanitizer would not repair it, and the parser would reject the snapshot. TypeScript prevents this only for code that does not cast. The fast-check property in 08-13 never mutates these four fields, so the claim that "sanitizer and parser agree" is untested for them.
- LOW: `postAiEvent` validates `to` and `name` only. `a`, `b` and `n` are copied unchecked (`:174`). Per-pass queue size is unbounded: a buggy handler that posts many events in one pass grows the array without limit before the 8-pass cap applies.
- LOW: on the arrival tick, `stepSim` runs `stepWorld` on the old world with the post-jump player and the pre-jump `layout`, before the router replaces the world. This is deterministic and harmless with no NPCs, but Phase 12 NPCs would think once against the destination player and the origin layout. Document it, or skip `stepWorld` when `stepFlight` emitted `hyperspaceJumped`.

**Suggestions.**
- Dispatch through `Object.hasOwn(registry, key) ? registry[key] : undefined` and skip, or null the AI and count a repair, when the key is unknown.
- Have `sanitizeEntity` repair `nav.behaviour` to `"IDLE"` and an unknown `aiKey` to `ai = null`, and assert `kind`/`scanClass` membership.
- Add those four fields to the 08-13 fast-check mutation set.
- Cap the queue length per pass (for example 256) and count overflow in `aiDropped`.
- Validate `a`/`b` as safe-integer ids and `n` as finite.

**Risk.** MEDIUM-HIGH.

## 08-12

**Summary.** Split step 9: the frame loop, start-up wiring and the thin facade.

**Strengths.** Every `addEventListener` carries `uiController.signal`. No timers exist in `src/app/session`. `swapSystem`'s rAF continuation is guarded against `disposed`. Dispose is idempotent and its order is test-pinned. The pinned-literal audit runs before the gates.

**Concerns.** None new.

**Risk.** LOW.

## 08-13

**Summary.** The snapshot codec, the 1,000-tick live-versus-restored equality, and the world cadence test.

**Strengths.** The parser is strict on every object level, uses `Object.hasOwn`, and rejects proto keys. `restoreWorld` re-validates. There are bidirectional anti-alias tests. `ENTITY_FIELDS` is typecheck-enforced, and the fast-check property is non-vacuous.

**Concerns.**
- HIGH: `null` and `boolean` in `ai.params` contradict each other across three plans.
  - `ParamValue` includes `null` and `boolean` (`08-05:134`), and the sanitizer keeps both (`08-11:167`).
  - The converse check at `08-13-PLAN.md:140` requires that "mutating a `NaN` field in place (in … `ai.params`) without calling `sanitizeEntity` is refused by `parseWorldSnapshot` after JSON (`null` in a number slot)". `ai.params` values have no number slot: after JSON, a NaN and a legitimate `null` are the same bytes.

  If the executor rejects `null` in params to make the converse test pass, every world holding a legal `null` param (or a `boolean`, which the rejection table at `:133` never mentions as accepted) can no longer be snapshotted. The fast-check arbitrary generates only numbers, strings and arrays (`:140`), so the suite stays green while the codec rejects valid worlds. This is the "test passes while the bug remains" case, and Phase 11 will inherit it.
- MEDIUM: the parser does not validate `worldSeed`. The must-have list (`:27`) bounds `rng`, ids, counters and timers, but not `worldSeed`. A snapshot with `worldSeed: 1.5`, `-1`, `2**40` or `1e300` is accepted. `forkSeed` coerces it with `>>> 0` (`08-02:197`), so the restored world behaves like a different seed than the one recorded and hashed, and two distinct snapshots alias one world. A `null` (NaN) `worldSeed` must at least fail the non-finite check; the plan should say so explicitly.
- MEDIUM: hash equality is too coarse to prove a bit-exact restore (`src/sim/hash.ts:13-33`: 6-decimal `canon`, low-byte FNV, see 08-05). The 1,000-tick test compares only `hashWorld` and `entityHashes`, so a restore that perturbs a coordinate by less than 1e-6 passes until the drift grows.
- LOW: `restoreWorld` validates through `parseWorldSnapshot` and then copies from "the validated deep copy" (`:23`). The plan does not say that `parseWorldSnapshot` builds its output while it validates, reading each leaf once. If it validates the input and then copies, an in-process caller passing getters or a Proxy can pass validation and supply different values to the copy (a read-time race). Phase 11 input comes from `JSON.parse`, so this is low-risk, but the rule costs one sentence.

**Suggestions.**
- Pick one of these:
  - (a) Remove `null` from `ParamValue`. Change 08-05:134, the sanitizer list, and the converse test.
  - (b) Keep `null`, and limit the converse NaN check to typed number slots (position, radius, an element of a param array) instead of `ai.params` scalar values. Add `null`, `true`/`false` and mixed arrays to the fast-check arbitrary and to an acceptance row.
- Add a parser rule and a rejection row: `worldSeed` must be a safe integer in `0..0xffffffff` (`1.5`, `-1`, `2**32` rejected).
- At every 50th-tick checkpoint, also assert `JSON.stringify(snapshotWorld(live)) === JSON.stringify(snapshotWorld(restored))`. This compares bit-exactly and does not depend on the hash.
- State that `parseWorldSnapshot` returns a fresh tree built during validation, and add a test that a getter-backed input is read once.

**Risk.** MEDIUM-HIGH.

## 08-14

**Summary.** Test flags and a manual-clock sim driver with `advanceTicks`.

**Strengths.**
- Flags are parsed once, by exact string comparison, and are inert without `test=1`.
- `advanceTicks` checks `disposed` first, then bounds `n` and refuses while paused, behind an overlay, or without a state.
- It taints before the first drain or step, so the pre-launch autosave and every later autosave skip.
- It stops early when a step pauses, disposes or opens an overlay.
- The drain path is shared and title-preserving tests stop the realtime path from drifting.

**Concerns.**
- LOW: the hook is live in production builds whenever `?test=1` is in the URL (the threat model accepts this). Each `advanceTicks` call is capped at 200,000 ticks, but nothing limits how often it is called. Combined with Phase 12 populated worlds, a crafted page script can freeze the tab. The taint flag keeps saves safe, so this is a self-DoS only. The acceptance is reasonable; note it in T-08-29.
- LOW: `advanceTicks` does not catch an exception thrown inside `stepOnce`. If one throws partway through a call, the taint is already set (good), but `currentFrame` and `pending` stay in whatever state the drain left. Say whether that is acceptable.

**Risk.** LOW.

## 08-15

**Summary.** The single integration plan: world lifecycle, epoch bump points, and the anchored-save check.

**Strengths.**
- `resetForRestore(0)` runs inside the synchronous install block of both warm Load and cold Continue.
- `begin` refuses a non-finite seed or a saturated epoch.
- `dispose()` calls `end()` idempotently.
- The world is never in `SaveInputs`, and `src/persistence` is unchanged.
- The anchored-save test now inspects `inputs` and `encodeSave(inputs)` correctly.

**Concerns.**
- LOW: the epoch ranges disagree. `resetForRestore` and `resume` accept an epoch up to and including `0xffffffff`, but `begin` refuses at `>= 0xffffffff` (`08-15-PLAN.md:127`). In Phase 11, a save carrying `epoch = 0xffffffff` (untrusted IndexedDB data) restores, and then every later launch or arrival silently refuses to create a world, leaving the session NPC-free with no error. This cannot happen in Phase 8, but the API is being shaped for Phase 11 now.
- LOW: the anchored-save string check forbids "any epoch, worldSeed, nextId or entity field" (`:35`). "Entity field" is not a list of tokens, and `position`/`orientation` legitimately appear in `flight` (`src/persistence/autosave.ts:104-110`). Name the exact forbidden substrings (`"epoch"`, `"worldSeed"`, `"nextId"`, `"entities"`, `"specKey"`, `"aiDropped"`) so the check is neither vacuous nor falsely failing.

**Suggestions.**
- Make `resetForRestore` clamp to `< 0xffffffff`, the same domain as `begin`. Better, have it return a refusal that Phase 11 can surface to the player.

**Risk.** LOW.

## 08-16

**Summary.** The one deliberate probe commit: `probe.sim`, `worldHash` and `advanceTicks`, with browser/Vitest hash parity.

**Strengths.**
- The commit is purely additive, proven by a subtractive diff whose script is kept in the SUMMARY.
- `probe.sim` holds only primitives, has a mutation-isolation test, and is absent in menu mode.
- `worldHash` reads the live state and world and neither taints nor requests a redraw.
- Both sides of the parity test also check against `hashFlight`, so they cannot agree on the same wrong value.
- `advanceTicks` appears on the hook only under the manual clock.

**Concerns.**
- LOW: a spec that keeps a reference to an old `probe.test` after `dispose()`, or calls it during menu mode, gets `worldHash()` with `ctx.core.state === undefined`. That reaches `hashWorld(undefined, …)` and throws an untyped `TypeError`. Return a sentinel (for example `""`) or throw a named error when the state is absent or `disposed` is set, and add one Node row.
- LOW: the replay and the session share `buildStepOptions` and `createWorldLifecycle`, so a bug in either is invisible to the parity test. The extra `hashFlight` cross-check covers the flight half only; once entities exist (Phase 12), equality between the two sides proves less. Note this in the Key Decisions row.

**Risk.** LOW.

## Cross-plan summary

| # | Severity | Plans | Finding |
|---|---|---|---|
| 1 | HIGH | 08-05, 08-11, 08-13 | `null`/`boolean` `ParamValue` vs the "NaN becomes null in a number slot" converse check: the plans contradict each other, and the fast-check never generates `null`/`boolean`, so a codec that rejects valid worlds stays green |
| 2 | MEDIUM-HIGH | 08-11, 08-13 | The sanitizer skips `kind`/`scanClass`/`nav.behaviour`/`ai.aiKey`, which the parser rejects; `registry[ai.aiKey]` dispatch has no own-key guard and throws inside the fixed step |
| 3 | MEDIUM | 08-09, 08-02 | The AI zone lets `../math.js` import `createSeededRandom` (closure stream; the text-scan guard can be bypassed with an alias) and has no ban on module-level mutable state, so serialisable AI state is unenforced for Phases 14-22 |
| 4 | MEDIUM | 08-03 | The `src/sim` lint lacks `no-eval`/`no-new-func`/`localeCompare`/`Intl`, which already exist for `tools/oolite-ingest` (`eslint.config.js:208-241`) |
| 5 | MEDIUM | 08-05, 08-13 | Unescaped, untyped string leaves in the hash text, plus a low-byte FNV and 6-digit `canon`, mean the equality proofs can pass while precision or string splitting is broken; add a bit-exact snapshot-JSON comparison |
| 6 | MEDIUM | 08-07 | `ShipControl` accepts values outside the shared `1e12`/`uint32` domain, which the sanitizer then silently zeroes |
| 7 | MEDIUM | 08-13 | `worldSeed` is not validated as `uint32` by the parser |
| 8 | LOW | 08-05/13, 08-15, 08-11, 08-16 | Edge disagreements: `nextId = 2**32` after allocating id `0xffffffff`; `resetForRestore(0xffffffff)` vs `begin`; unbounded per-pass AI queue; arrival-tick world step against the old layout; `worldHash()` after dispose |

## Overall verdict

**NEEDS REVISION.** All Round 3 findings are resolved and the architecture is sound. Finding 1 is a concrete contradiction between plans: whichever way the executor resolves it, the test suite stays green while the Phase 11 save boundary is wrong. Findings 2-7 are targeted text edits to 08-03, 08-05, 08-07, 08-09, 08-11 and 08-13, and none changes waves or dependencies. Waves 1-4 can start after the 08-03 lint additions and the 08-05 `ParamValue` decision.
