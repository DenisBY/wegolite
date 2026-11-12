# Adversarial / Trust-Boundary Review — Phase 8 Plans (Round 2)

Read-only review of plans `08-01` through `08-16` as revised by `83c9b5c` (`docs(08): replan phase 8 incorporating cross-AI review`), checked against the live session, probe, purity, and save paths. No Docker gate was run; host Node is not evidence. `tests/meta/sim-purity.test.ts` and `tests/meta/session-size.test.ts` are not in the tree and no plan adds them. The live purity gate is `tests/guards/sim-purity.test.ts`. Graph evidence was taken from the parent Tier-2 bundle; this review confirmed the cited paths by reading source.

### Summary

`83c9b5c` closed the Round 1 items that were actually specified as code: the simple `Math` alias selectors, the single `case "docked":` count, G-8 rebind-after-load, WorldView `copyVec`/`copyQuat`, spawn-time vector copies, the dispose-order Node test, and a large `parseWorldSnapshot` rejection table including a params `__proto__` row. It did not close the trust-boundary holes an executor will now implement on purpose. The probe-shape comparator is specified to treat an empty array as equal to any element set, which blinds the FOUND-10 freeze. The snapshot codec that Phase 11 is told to reuse still accepts non-integer `nextId`, unbounded strings, unknown keys, and shared nested objects after restore. Async teardown (`clearSaveForNewGame`, the autosave completion, `swapSystem`'s untracked frame) is not covered by the new dispose test, and `advanceTicks` never reads `disposed`.

### Strengths

- Round 1's one-way seed pin is now a same-commit literal-vector requirement (`08-02`), and a source scan forbids a second `createSeededRandom(` in `src/sim` outside `math.ts` and `arrival.ts`.
- `08-03` factors `SIM_SYNTAX_BANS` / `SIM_GLOBAL_BANS` / `SIM_RESTRICTED_PROPERTIES` so the AI zone cannot silently drop them, and it probes `const m = Math`, destructuring, computed `Math` members, and `globalThis`.
- `08-01` makes the docked-arm scan file-local and requires exactly one `case "docked":` across session sources, which closes the first-match `switchCaseBody` bypass (`tests/guards/economy-purity.test.ts:201-207`).
- `08-04` / `08-08` / `08-16` keep the hook on the live `FlightState`: rebind after Load is an identity assertion, and `worldHash()` is specified to read `ctx` at call time, with a replacement test.
- `08-05` says `spawnEntity` stores copied vectors; `08-07` requires `copyVec`/`copyQuat` at every view return and a mutation test for position, orientation, and destination; `08-09` passes AI an `EntityId`, not the live `Entity`.
- `08-11` keeps `stepFlight` unchanged, skips the world when it was never spawned, and defines `aiDropped` and repair-versus-normalise so those counters cannot drift silently into the hash.
- `08-13` rejects uncommitted dead entities and a non-empty AI queue as distinct reasons, rebuilds params with `Object.create(null)`, and ties the codec to `keyof Entity` so a new field fails typecheck.
- `08-14` taints before the first `advanceTicks` step, caps `n` at 200_000, and refuses non-integers, pause, and overlays. `08-16` exposes `advanceTicks` only under `?test=1&clock=manual` and does not put the live store on `probe.sim`.
- `08-15` keeps `src/persistence/**` unchanged, calls `begin` before the arrival autosave, and deep-equals `SaveInputs` with and without a live world.

### Issues Found

- **Severity**: BLOCKER
- **Plan/Task**: `08-01` Task 1
- **Description**: The FOUND-10 probe freeze is specified to ignore array drift. `compareProbeShapes` says an empty `"[]"` set on either side matches any element set, and the unit test requires an empty array versus a non-empty string array to report nothing (`08-01-PLAN.md` Task 1 steps 1-2). That contradicts the same step's claim that a new element type is reported. `window.__wegolite` publishes several arrays whose element types are the behaviour under test (`hud.elements`, `hud.contacts`, `bodies`, `hints`). A split that publishes `[]` for a fixture array, or that fills an array the fixture recorded empty, stays green. Preconditions: any later plan moves probe publishing (`08-04`, `08-12`, `08-16`) and the fast gate trusts this comparator. Impact: the safety net every split step gates on cannot see a dropped or invented array payload, so FOUND-10 can pass while the published probe lies.
- **Fix**: Empty matches empty only. A missing or added element shape is a difference in both directions. If one named path is genuinely timing-volatile, add it to an explicit allow-list with a reason, the same way `hint` is the only optional key. Delete the "empty versus non-empty string array reports nothing" case.

- **Severity**: WARNING
- **Plan/Task**: `08-03` Task 2; inherited by `08-09` Task 3 and not re-checked by `08-16`
- **Description**: `83c9b5c` closed `const m = Math` and `globalThis.Math.random()`, then marked T-08-38 mitigated. The selectors do not cover the forms a later sim file can still use: `Reflect.get(Math, "random")()`, `Array.prototype.sort.call(xs)` / `.apply` (callee property is `call`, so `arguments.length=0` on `sort` never matches), and `self.crypto.getRandomValues` (`crypto` is banned as an identifier, `self` is not in `DOM_GLOBALS`, `queueMicrotask` is not banned). The plan only documents "Math passed as an argument" and "a value laundered through another module". `tests/guards/sim-purity.test.ts` is not extended: `declaredFrameTypes` only inspects the next 24 lines and `withoutLineComments` only strips `//` lines (`tests/guards/sim-purity.test.ts:99-125`). Plans `08-04`, `08-06`, and `08-14` tell the executor not to name a type `Frame`, but the gate they run will not notice a `*Frame*` type whose `pitch`/`roll` sit past that window or inside a block comment. There is still no `tests/meta/session-size.test.ts`, so a facade that re-grows past the split is invisible to lint. Preconditions: a contributor (or a later phase) lands one of those forms under `src/sim` or `src/sim/ai`. Impact: FOUND-12's "lint rejects Math.random / bare sort / platform randomness" claim is false for those forms; the 1,000-tick proof does not run on every future file.
- **Fix**: Add probes for `Reflect.get(Math, "random")`, `Array.prototype.sort.call`, `queueMicrotask`, and `self.crypto.getRandomValues`, and either ban them or list them next to T-08-38 as accepted residuals with a behavioural test that fails if they appear under `src/sim`. Widen the Frame scan to the whole type body (brace-matched, block comments stripped), or drop the 24-line window. Do not call the alias gap closed.

- **Severity**: WARNING
- **Plan/Task**: `08-09` Task 3
- **Description**: The AI import zone is two non-recursive globs, `src/sim/ai/*.ts` and `src/sim/ai/pilots/*.ts`. A file at `src/sim/ai/framework/priority.ts` or `src/sim/ai/pilots/roles/trader.ts` still matches `src/sim/**/*.ts`, so the determinism bans apply, but the allow-list does not. It can import `../world/store.js` or `../../flight/step.js` and FOUND-13's lint proof stays green. Separately, the allow-list permits value imports of `world/ids.js` and `math.js`, and nothing seals those modules against `export * from "./store.js"`. The specifier table never imports through a re-export. Preconditions: Phase 14 adds a nested AI file, or a one-line re-export lands in an allowed module. Impact: hand-ported AI can read and write the store while the zone guard reports clean.
- **Fix**: Use recursive globs and a depth-independent check (or one block per real depth), and add a probe at `src/sim/ai/nested/probe.ts` that must fail. Add a guard that the export specifiers of `ids.ts`, `view.ts`, `control.ts`, and `math.ts` do not name store, world, entity, flight, or events modules.

- **Severity**: WARNING
- **Plan/Task**: `08-13` Task 1 and Task 2; consumed by `08-11` serialize and by Phase 11 as specified
- **Description**: T-08-24 calls `parseWorldSnapshot` a strict boundary for untrusted JSON and says Phase 11 reuses it. The rejection list does not match `parseSave` (`src/persistence/save.ts:390-407, 569-578`). Missing checks, each with a reachable input once a snapshot is parsed from a save or a test fixture: `nextId` may be a non-integer or an unsafe integer as long as it is greater than every id (`101.5`, `2**53+3`); position and radius have no magnitude cap (`1e308` is finite, then `canon` throws or the hash string explodes); `specKey`, param strings, and param arrays have no length cap; unknown own keys on the root, entity, nav, and ai objects are not rejected; `__proto__` is rejected only as a params key, not on the root or entity object that an `Object.assign` / spread restore would copy; a params value that is an object or an array of objects is not in the rejection table. `restoreWorld` is specified as "copied entities" but the anti-alias test only mutates the raw input after `parseWorldSnapshot`, not the parsed snapshot after `restoreWorld`. A shallow copy shares `position`, `orientation`, `nav.destination`, and `ai.params` with the caller. Preconditions: Phase 11 feeds a save blob, or any caller mutates the object `restoreWorld` just consumed. Impact: a crafted snapshot becomes live sim state (non-deterministic ids, hash DoS, prototype-key injection) or a later mutation of the parsed object changes the restored world and splits the 1,000-tick proof.
- **Fix**: Reject unless `nextId` is a safe integer `>= 101` and strictly greater than every id; reject unknown keys; cap string and array lengths and position/radius magnitude using the same idea as `MAX_SAVE_CHARS` / `MAX_SAVE_POSITION_MAGNITUDE`; reject `__proto__`, `constructor`, and `prototype` on every object, not only params; reject non-`ParamValue` nested values. `restoreWorld` must deep-copy every nested vector, quat, nav, rng, and params object. Add a test that mutates the parsed snapshot after restore and asserts the live world and `entityHashes` do not change. Keep `restoreWorld` from being a second, unchecked entry point: it should accept only a value `parseWorldSnapshot` just returned, or re-run the same validators.

- **Severity**: WARNING
- **Plan/Task**: `08-08` Task 2, `08-12` Task 2, `08-14` Task 1, `08-15` Task 2
- **Description**: `83c9b5c` added a sync "dispose order" test and an `addEventListener` / `removeEventListener` count. Neither sees the failure paths that already exist in `src/app/game-session.ts` and that the plans move verbatim. `loadFromSave` checks `disposed` only after its one await (`game-session.ts:1341-1344`); the new order test toggles `saveScreenOpen`, not `disposed`, so an executor can drop `disposed ||` and still pass. `clearSaveForNewGame` awaits `store.clear` and then writes `saveStatus` with no `disposed` check (`game-session.ts:1482-1497`). `queueSnapshot`'s completion handler updates save counters and calls `syncSaveProbe` after dispose; only `renderStation` is guarded (`game-session.ts:1167-1197`). `swapSystem` schedules a `requestAnimationFrame` that is not stored in `rafId` (`game-session.ts:3288-3293`), so `dispose`'s `cancelAnimationFrame(rafId)` does not cancel it, and the continuation calls `renderFrame(0)` with no `disposed` check. `advanceTicks` (`08-14`) refuses a missing `state` but never reads `ctx.runtime.disposed`. Dispose sets `disposed = true` before it clears `state` (`game-session.ts:3303-3340`); a hook closure captured before `delete probe.test` can still step mid-teardown. Listener totals are bypassable: a new `addEventListener` without `uiController.signal` plus a matching `removeEventListener` string keeps the counts equal. `08-15` adds `end()` inside dispose and does not say to extend the pinned teardown list, so the idempotence proof will not cover the world drop. Preconditions: F2 Load or New Game, then `pagehide` / `dispose` during the await; a scene swap overlapping dispose (the existing dispose e2e); `advanceTicks` invoked from a closure after dispose starts. Impact: a disposed session still clears or commits IndexedDB, draws a frame, or steps the world; a second `dispose` is idempotent only for the collaborators the Node double recorded.
- **Fix**: After every await in `loadFromSave` and `clearSaveForNewGame`, return before any install or status write if `disposed` is set, and pin that with a recording test. In the autosave completion and the `swapSystem` frame callback, return immediately when `disposed` is set; track that frame id and cancel it from `dispose`. `advanceTicks` must refuse when `disposed` is set, before taint and before drain. Replace the listener-count gate with an assertion that every `addEventListener` in `src/app/session` passes `signal: ctx` abort signal (the two window keydown sites at `game-session.ts:2268` and `2289` are the pattern). Extend the dispose-order list when `08-15` adds `end()`, and assert a second `end()` is a no-op.

- **Severity**: WARNING
- **Plan/Task**: `08-05` Task 1, `08-11` Task 1, `08-16` Task 1
- **Description**: Shared mutable tables are still the world's identity. `STATIC_ENTITIES` is one array assigned into every world (`statics = STATIC_ENTITIES`), described as a "frozen table" with no `Object.freeze`. `restoreWorld` points restored worlds at the same array. A write to `world.statics[0].scanClass` changes every live and restored world, and the snapshot cannot repair it because statics are not serialized. `AI_REGISTRY` is a mutable object typed `Readonly`. `stepWorld` reads `world.store.live` by index, which is correct only while `kill` does not splice before commit; the plan does not say `get` returns the live `Entity` and that no session module may hold that reference. `08-16` counts entities from the live store inside `updateProbe`. If that count is implemented as a filter that returns the array and the publisher assigns it, `window.__wegolite` becomes a mutation handle. The type says `number`, but no test mutates `probe.sim` and asserts the store is unchanged. Preconditions: any session or test code writes a static field, or `updateProbe` leaks `store.live`. Impact: cross-world hash coupling, or a page script under `?test=1` mutating entity position without taint.
- **Fix**: `Object.freeze` the static table and each record, and freeze `AI_REGISTRY`. State that `store.get` / `store.live` are sim-internal and that `src/app` must not import them (a guard, not a comment). In `08-16`, compute `entities` as a number local and add a test that replacing `probe.sim` or writing `probe.sim.entities` does not change `world.store`.

- **Severity**: SUGGESTION
- **Plan/Task**: `08-15` Task 3
- **Description**: The anchored-save check `JSON.stringify(snapshotForSave(inputs))` contains none of `"epoch"`, `"worldSeed"`, `"nextId"`, or `"entities"` is a substring search. A leak under another name passes; an incidental commodity or message containing those letters fails. The deep-equal of `SaveInputs` is the real gate, and only if both sides are built from the field list in `src/persistence`, not from two calls that share a buggy builder.
- **Fix**: Assert `Object.keys` of the encoded save against the v2 allow-list, and assert `buildSnapshotInputs` does not read `worldLifecycle`. Keep the substring check only as a backstop.

- **Severity**: SUGGESTION
- **Plan/Task**: `08-12` Task 1
- **Description**: The monolith has no `setTimeout` / `setInterval` (`rg` over `src/app/game-session.ts` shows only the two `addEventListener` sites). The split plans never forbid a new timer in `src/app/session`, and `dispose` has no timer-id list to clear. A helper added during extraction would survive `uiController.abort()`.
- **Fix**: Gate `rg` for `setTimeout` / `setInterval` / `queueMicrotask` under `src/app/session` at zero, or require each id to be cleared in the recorded teardown list.

### Missing Coverage

- No plan adds `tests/meta/sim-purity.test.ts` or `tests/meta/session-size.test.ts`. The Frame-window and comment-stripping holes in `tests/guards/sim-purity.test.ts` are untested. There is no budget gate that the facade stays a facade after step 9.
- `parseWorldSnapshot` has no fixture for extra keys, unsafe `nextId`, huge `specKey`, nested param objects, `__proto__` on the entity object, or post-restore mutation. Those are the cases `parseSave` already treats as untrusted.
- Dispose coverage does not include dispose during `loadFromSave`, during `clearSaveForNewGame`, during an in-flight `queueAutosave`, or during `swapSystem`'s second frame. `tests/app/dispose.test.ts` (parse gap at the `vi.mock` around line 687) is not extended by these plans.
- `advanceTicks` refusal table omits `disposed === true` and omits a hook closure invoked after `delete probe.test`.
- AI-zone proofs never place a file outside the two globs, and never prove the allowed modules' export surface.
- `08-16` parity does not include a jump inside `advanceTicks` (the plan flags this). A jump is also the path that bumps epoch and replaces the world; a stale `worldHash` closure would only show up there.
- No plan checks that `createTestHook`'s existing mutators (`setPosition`, `setSpeed`, `grantEquipment`) still taint when `advanceTicks` is absent (`?test=1` without `clock=manual`). `08-04` tests `setSpeed`; `08-16` should re-run that after the fifth parameter is added so the new argument cannot shift `onMutate`.

### Recommendations

1. Fix the `08-01` empty-array wildcard before any split step treats the probe-shape spec as evidence. That is the one change that invalidates later gates if left as written.
2. Tighten `parseWorldSnapshot` / `restoreWorld` to the `parseSave` standard (safe integers, magnitude and length caps, unknown-key rejection, deep copy, post-restore alias test) in `08-13`, not in Phase 11. The plan already says Phase 11 reuses this parser.
3. Add the `disposed` short-circuit tests to `08-08`, `08-12`, and `08-14` before the bodies are moved. Verbatim move will otherwise freeze the `clearSaveForNewGame` and `swapSystem` holes.
4. Make the AI zone recursive and seal the allowed modules' exports (`08-09`). Do not treat the `08-03` alias work as a complete determinism lint.
5. Freeze `STATIC_ENTITIES` and `AI_REGISTRY`, and keep `store.live` off the probe (`08-05`, `08-11`, `08-16`).

### Overall Assessment

NEEDS REVISION

The phase is executable after the probe-shape comparator is corrected and the snapshot and dispose gaps above are written into the plans. Round 1's guard, purity, disposal, and save notes were only partly resolved by `83c9b5c`: the simple alias and the Load rebind are specified; the empty-array wildcard, the incomplete snapshot boundary, and the async dispose paths are not. No plan should be treated as READY while the FOUND-10 comparator is defined to ignore array drift.

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
