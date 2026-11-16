# Architecture Review (reviewer-architect-opus)

Scope: module boundaries, layering (`src/sim` free of Three.js and the DOM), wave and dependency order, file ownership inside each wave, contracts between plans, and whether the 16 plans together deliver the Phase 8 goal. I checked the plans at commit `0aa747a` against the repository source. I used codebase-memory coverage on every source file cited below. It reported `no_recorded_issue` for all of them, with the usual best-effort caveat.

## Round 3 resolution check

| Round 3 finding | Status at 0aa747a | Evidence |
|---|---|---|
| 1. Fast-check post-spawn mutation (08-13) | Resolved | `08-13-PLAN.md:23` and the Task 2 behaviour bullet "first spawns 1..4 entities with valid constructor arguments … then mutates … in place" |
| 1. Counter, tick and owner bounds aligned (08-05/11/13) | Resolved | `08-05-PLAN.md:137` (tick, ownerId ≤ 0xffffffff; specKey 1..128), `08-11-PLAN.md:166-169` (rules 5-8 with saturating `repairs`), `08-13-PLAN.md:26` |
| 1. Quaternion tolerance plus underflow row | Resolved | `08-13-PLAN.md:26` (accepts `1 + 5e-10`, rejects `{1e-200 ×4}`), and the Task 2 rejection table |
| 1. Caps, nested arrays and proto keys at every level | Resolved | `08-13-PLAN.md:26`, Task 2 table; `08-11-PLAN.md:168` |
| 1. `restoreWorld` validates through the parser; anti-alias test | Resolved | `08-13-PLAN.md:23` and the Task 2 "shares no nested object" bullet |
| 2. `snapshotForSave(inputs)` call shape (08-15) | Resolved | `08-15-PLAN.md:35,106,206` now inspect `inputs` directly plus `encodeSave(inputs)`. `encodeSave(inputs: SaveInputs)` exists at `src/persistence/save.ts:663`, and the `SaveInputs` keys at `save.ts:301-320` match the allow-list at `08-15-PLAN.md:206` |
| 3. `createTestHook` 5th parameter required; `probe.sim` holds only primitives | Resolved, but the new gate is broken (see 08-16 H-1) | `08-16-PLAN.md` Task 1 steps 1-2. The only call site is `src/app/game-session.ts:1035` |
| 4. Citation of 1e12 versus 1e9 | Resolved | `08-11-PLAN.md:162`, `08-05-PLAN.md:137` |
| 5. Store `2**32` row, reflection residuals in 08-03, listener `signal`, stale anchors | Resolved | `08-05-PLAN.md:180`; 08-03 Round 3 row; 08-12 truths. The four `pending.length = 0` sites match `src/app/game-session.ts:2738/2749/2773/2859`. Both keydown listeners carry `signal` (`game-session.ts:2268-2293`) |

Every Round 3 finding has been dealt with. Two new architectural issues stand out: one acceptance gate that cannot pass, and duplicated ownership of the validation domain.

## Wave and file-ownership audit

- **Wave 1** (08-01, 08-02, 08-03): no shared files. 08-01 touches `package.json`, 08-02 touches `src/sim/math.ts` and `PROJECT.md`, and 08-03 touches `eslint.config.js`. 08-03's new bans do not fire on current code. The only `.sort(` in `src/sim` is `src/sim/economy/market.ts:169`, which takes a comparator, and `Math.random` appears only in a comment at `src/sim/math.ts:225`.
- **Wave 2** (08-04 split, 08-05 core): no shared files.
- **Wave 3** (08-06, 08-07): no shared files.
- **Wave 4** (08-08, 08-09): no shared files. 08-09 changes `src/sim/ai/types.ts` after 08-05 created it, so the order is sequential.
- **Wave 5** (08-10, 08-11): no shared files. The two plans do have a type-level coupling: 08-11 widens `SimEvent` while 08-10 moves `handleEvent`. This is safe because `EVENT_KIND_SUBSCRIBER` is typed `Record<string, readonly string[]>` (`08-10-PLAN.md:155`) and the router has no `never` default.
- **Wave 6** (08-12, 08-13): no shared files.
- **Waves 7-9** each hold one plan.
- Import graph across the planned modules: `rng.ts` imports nothing, `math → rng`, `world/entity → ai/types → world/{ids,view,control}`, and `world/step → ai/registry, world/view-impl`. There is no cycle, and the `world → ai` direction agrees with the AI zone, which allows only `ids/view/control/math`.

## 08-01

**Summary:** Pins the probe shape in six states, adds the strict comparator, re-points the session scans at a helper that concatenates the session sources, and records the `verify-full` baseline.

**Strengths:** Building the safety net before step 1 is the right order for D-12/D-13. The comparator treats an empty array as matching only an empty array. The concatenating source helper makes the redraw-gate and economy scans independent of where code lives, which every later split step relies on.

**Concerns:** None at architecture level.

**Suggestions:** None.

**Risk:** LOW

## 08-02

**Summary:** Pins the v1 flight hashes and the `createSeededRandom` vectors, then adds `rng.ts`, a plain uint32 stream that can be serialised, together with the `mix32` derivation of world and fork seeds, which the owner confirms at a checkpoint.

**Strengths:** `rng.ts` imports nothing and `math.ts` imports `rng.ts`, so there is no cycle. `arrival.ts` stays byte-identical (`src/sim/hyperspace/arrival.ts:73` is the only call in `src/sim`). The "createSeededRandom( appears exactly twice" scan also covers a gap in the AI zone: `../math.js` is allowed there and still exports the closure RNG, so this scan is the only thing stopping an AI module from creating a stream nobody can serialise.

**Concerns:**
- LOW: That protection lives in a Vitest scan, not in lint. If a later phase legitimately adds another caller, someone will likely bump the count from 2 to 3, and the protection is gone.

**Suggestions:** Add a short comment in the test that `math.ts` is on the AI allow-list, so that raising the count needs an AI-zone review.

**Risk:** LOW

## 08-03

**Summary:** Adds the determinism lint bans and guard probes for `src/sim`.

**Strengths:** The rule constants (`SIM_SYNTAX_BANS`) can be reused, and 08-09 spreads them into the AI blocks, so redefining the rule there does not silently drop the sim bans (Pitfall 5). The Round 3 reflection residuals are either covered by probes or documented.

**Concerns:** None.

**Suggestions:** None.

**Risk:** LOW

## 08-04

**Summary:** Split steps 1-2: the typed session context and the probe publisher, with `withdrawProbe()` wired into `dispose()` straight away.

**Strengths:** The context type becomes the one shared seam that every later split step builds on. Wiring `withdrawProbe` into dispose immediately means 08-12 can move it as-is.

**Concerns:** None.

**Suggestions:** None.

**Risk:** MEDIUM. This is inherent to a 185k-token mechanical move, not a plan defect.

## 08-05

**Summary:** Fixed ids, closed vocabularies, entity and static records, a store with binary-search lookup, `createWorld`, `isNeverSpawned`, `liveEntityCount`, a validating `spawnEntity`, and a serializer whose hash equals `hashFlight` while nothing has spawned.

**Strengths:**
- Static bodies hold only `layoutKey` references and never reach the hash (`08-05-PLAN.md:35`). This is a clean way to satisfy D-07 and D-08 together.
- There is one never-spawned predicate, and the serializer is gated from re-spelling it.
- The ban on `Map`/`Set` in the store removes any lookup whose iteration order could change after a restore.
- `liveEntityCount` gives `src/app` a primitive read, so the app never sees the store.

**Concerns:**
- **MEDIUM (A-1): no single owner for the validation domain.** `spawnEntity` writes the domain as inline literals: `MAX_SNAPSHOT_STRING_LENGTH = 128`, `1e12`, `32` keys, `64` elements (`08-05-PLAN.md:137`). Plan 08-11 then exports `MAX_ENTITY_MAGNITUDE`, `MAX_SNAPSHOT_STRING_LENGTH`, `MAX_SNAPSHOT_PARAM_LENGTH` and `MAX_AI_PARAMS_KEYS` from `sanitize.ts` (`08-11-PLAN.md:45,277`). Plan 08-13 exports the same three names again, plus `MAX_SNAPSHOT_MAGNITUDE`, from `snapshot.ts` (`08-13-PLAN.md:34,107`). So one domain is defined in three files by three plans in three waves, two modules export identically named constants, and the 1e12 cap has two names. Round 3 fixed the values, but nothing structural keeps them equal: a later change to one copy (for example Phase 11 raising the string cap for save reuse) passes every test of the other two modules. 08-05 is the first consumer, so it should own the constants.
- **MEDIUM (A-2): enum leaves are unchecked at spawn.** `spawnEntity` checks numbers, strings, timers and params, but not whether `kind` is in `ENTITY_KINDS`, `scanClass` is in `SCAN_CLASSES`, or `ai.aiKey` is in `AI_KEYS`. `parseWorldSnapshot` rejects all three (`08-13-PLAN.md:26`, rows "kind planet / CLASS_FOO / aiKey trader"). Callers that compile in TypeScript are protected, but Phase 12 will spawn from `shipdata.plist` strings (`scan_class`), which come in through a cast. A world spawned that way hashes fine but refuses to snapshot.

**Suggestions:**
- A-1: Create `src/sim/world/limits.ts` in this plan, with no imports: `MAX_ENTITY_MAGNITUDE`, `MAX_SNAPSHOT_STRING_LENGTH`, `MAX_SNAPSHOT_PARAM_LENGTH`, `MAX_AI_PARAMS_KEYS`, `MAX_UINT32`, and optionally a pure `isValidParamValue`/`isValidParams` predicate. `world.ts` imports it now. Change 08-11 and 08-13 to import (and, if wanted, re-export) these constants instead of declaring them, and alias `MAX_SNAPSHOT_MAGNITUDE = MAX_ENTITY_MAGNITUDE`. Add an acceptance gate: `rg -c "= 128\b|= 1e12\b" src/sim/world/{world,sanitize,snapshot}.ts` prints 0.
- A-2: Add membership checks for `kind`, `scanClass` and `ai.aiKey` to the refusal list, using `includes` over the const arrays from `ids.ts`/`ai/types.ts`. Add three refusal rows to Task 2.

**Risk:** MEDIUM

## 08-06

**Summary:** Split steps 3-4: the render driver, the chart and settings controllers, and the `verify-full` gate.

**Strengths:** The Round 3 note on when listeners are registered is folded in. Running `verify-full` at step 3 is as D-12 requires.

**Concerns:** None.

**Suggestions:** None.

**Risk:** MEDIUM. This comes from the size of the move, not from the plan.

## 08-07

**Summary:** Adds the type-only `WorldView`/`ShipControl` and their implementations over the world, the layout and the live player.

**Strengths:**
- `view.ts` and `control.ts` are type-only and import only `ids` and `math` (`08-07-PLAN.md` Task 1 acceptance). That is what makes the 08-09 allow-list sound.
- The `Record<keyof …, true>` member pins make any growth of the seam a deliberate act (Pitfall 19).
- The player is passed per call, so the world never holds `FlightState` (G-8).
- The station orientation is checked against an independent three.js computation in tests only, so `src/sim` stays free of Three.

**Concerns:**
- **LOW-MEDIUM (A-3): `ShipControl` is a fourth write boundary that does not share the aligned domain.** `setTarget` accepts any non-negative safe integer, so values up to 2^53 pass. `setDestination`, `setDesiredRange` and `setDesiredSpeed` accept any finite non-negative number with no 1e12 cap (`08-07-PLAN.md:113`). The 08-11 sanitizer (rules 1, 3 and 5) then quietly repairs those values and increments `repairs`. The result: a buggy AI write is not refused at the seam; it becomes hashed repair noise one tick later. That runs against the seam's own rule that invalid arguments are ignored.

**Suggestions:** Bound `setTarget` to `0..0xffffffff` and the magnitudes to `≤ MAX_ENTITY_MAGNITUDE` (from `limits.ts`, see A-1), and add rows for `1e13` and `2**32` to the Task 2 control tests.

**Risk:** LOW

## 08-08

**Summary:** Split steps 5-6: the station controller and the save controller, with the `verify-full` gate.

**Strengths:** `buildSnapshotInputs` moves unchanged (`src/app/game-session.ts:1131-1152`), and 08-15's anchored-save proof depends on exactly that.

**Concerns:** See 08-16 H-1. This plan moves `saveBoot.store` (`game-session.ts:1167,1341,1490,3345`) into `src/app/session/`, which 08-16's gate later trips over.

**Suggestions:** None for this plan.

**Risk:** MEDIUM. This comes from the size of the move.

## 08-09

**Summary:** Adds the AI types, the integer tick time base, a frozen registry, the scripted test pilot, and recursive AI-zone lint with a table-driven regex check.

**Strengths:**
- The zone covers every depth, including a reject-all catch-all at depth 3 and below.
- Reading the regexes back through `calculateConfigForFile` tests the effective config rather than a copy.
- The "allowed seam modules do not re-export" scan closes the bridge-module hole.
- The real modules act as the positive control (D-11).

**Concerns:**
- LOW: `src/sim/ai/types.ts` is changed by two plans in two waves (08-05 creates it, 08-09 extends it). The order is correct, but `entity.ts` (08-05) imports `AiComponent` from the AI zone. The world model therefore depends on an AI-zone file, and the AI-zone lint (08-09) later constrains that file's imports. This works because `types.ts` imports only `world/ids`, `view` and `control`.

**Suggestions:** Add a one-line comment in `types.ts` that `world/entity.ts` depends on it, so it must stay free of anything outside the allow-list.

**Risk:** LOW

## 08-10

**Summary:** Split steps 7-8: the hyperspace controller with its atomic install block, the event router with a declarative routing table, `sim-driver` holding the single `stepFlight` call, and a pure `step-options`.

**Strengths:**
- Putting the only step call in `stepOnce` creates exactly the single D-14 plug-in point that 08-15 swaps.
- `buildStepOptions` is pure, so the Node replay in 08-16 can reuse it rather than re-derive it.
- The router ignores unknown kinds, so 08-11's widening of `SimEvent` in the same wave is safe.

**Concerns:**
- **LOW (A-4): the router signature is still ambiguous.** Step 2 says `createEventRouter(ctx: SessionState, subscribers)` "or an optional `ctx?: SessionState`" (`08-10-PLAN.md:155`). The artifacts list (`:39`), the Artifacts section (`:212`) and 08-15's interfaces block (`08-15-PLAN.md:105`) still say `createEventRouter(subscribers)`. 08-15 Task 1 step 4 needs `ctx` to be passed. If the executor picks the optional form and the facade omits it, `ctx.core.worldLifecycle?.begin` turns into a silent no-op.
- LOW: `Record<string, readonly string[]>` gives up compile-time completeness of the routing table.

**Suggestions:** Make `ctx` required and fix the three stale signatures. Type the table as `Readonly<Record<RoutedKind, readonly SubscriberName[]>>`, where `SubscriberName` is `typeof EVENT_SUBSCRIBER_ORDER[number]` and `RoutedKind` is a literal union of the 14 kinds, so it does not depend on 08-11's wider union.

**Risk:** MEDIUM

## 08-11

**Summary:** Adds `stepWorld` (update, think and commit in id order), `stepSim` wrapping the unchanged `stepFlight`, the queued AI events, `sanitizeEntity`, and the reserved `SimEvent` kinds.

**Strengths:**
- `stepSim` runs `stepFlight` first and never passes the world in, so the flight step stays byte-identical.
- Iterating over a length snapshot, with a grep gate that forbids a `for…of` over `live`, enforces the id-order rule.
- `WorldView` is built lazily, so the hot path without NPCs stays allocation-free.
- Reserved events use only ids, vectors and keys.

**Concerns:**
- **MEDIUM (A-1, continued):** `sanitize.ts` declares and exports the shared constants (`08-11-PLAN.md:45,277`) instead of importing them.
- **MEDIUM (A-2, continued): the truth overstates coverage.** The truth at `08-11-PLAN.md:32` says sanitize is "field-complete across every numeric, string, array, and structural value that … `parseWorldSnapshot` read[s]" and that "every sanitized world snapshots to JSON that `parseWorldSnapshot` accepts". Rules 1-8 (`:162-169`) never check `kind`, `scanClass`, `nav.behaviour` or `ai.aiKey`, and the parser rejects unknown values of all four. The 08-13 property never mutates those leaves, so the claim is only true for numeric and length leaves.

**Suggestions:** Either add rule 9 (unknown `nav.behaviour` becomes `"IDLE"`; unknown `ai.aiKey` sets `ai = null`, counted as a repair; `kind` and `scanClass` are guaranteed at spawn per A-2), or limit the truth to "numeric, string-length and structural leaves; enum leaves are guaranteed at spawn and by `ShipControl.perform`". Import the constants from `limits.ts`.

**Risk:** MEDIUM

## 08-12

**Summary:** Split step 9: `frame-loop`, `start-session`, the thin facade, the pinned frame-phase order, and the `verify-full` gate in a worktree.

**Strengths:**
- The facade still builds the router, so 08-15's "no `game-session.ts` edit" holds.
- Construction and teardown order are recorded and pinned.
- The listener `signal` invariant matches the source (`game-session.ts:2268-2293`).

**Concerns:** None new.

**Suggestions:** None.

**Risk:** MEDIUM. This comes from the size of the move.

## 08-13

**Summary:** Snapshot codec, a strict parser, a validating `restoreWorld`, equality of live and restored worlds over 1,000 ticks, and world-hash equality across frame cadences.

**Strengths:**
- The `Record<keyof Entity, …>` table ties the serializer and the codec together at compile time.
- `restoreWorld` goes through the parser, so there is only one entry point.
- Importing `SANITIZE_QUAT_TOLERANCE` from `./sanitize.js` already shows the right pattern for sharing a constant.

**Concerns:**
- **MEDIUM (A-1, continued):** `snapshot.ts` exports `MAX_SNAPSHOT_STRING_LENGTH`, `MAX_SNAPSHOT_PARAM_LENGTH` and `MAX_AI_PARAMS_KEYS` again (`08-13-PLAN.md:34,107`), the same names `sanitize.ts` exports. This is the third copy of the same domain, and auto-import can bind either one.
- LOW: The cadence test (Task 3) carries its own lifecycle (bump-then-derive). That is unavoidable in wave 6, because `createWorldLifecycle` only arrives in 08-15. It is a second copy of the lifecycle rule, after the real lifecycle and before `tick-script.ts`.

**Suggestions:** Import the constants (and re-export them if Phase 11 should see a single "snapshot contract" module). Note in Task 3 that 08-16's tick-parity test is what checks the real lifecycle against a replay.

**Risk:** MEDIUM

## 08-14

**Summary:** Test flags read once, a manual-clock frame-loop branch, and `advanceTicks` sharing one drain path with `advanceFrame`.

**Strengths:** The shared private drain path stops the manual clock drifting from the realtime one (Pitfall 3). The hook is not touched until 08-16 (D-13).

**Concerns:** None.

**Suggestions:** None.

**Risk:** LOW

## 08-15

**Summary:** The single integration plan: a pure `world-lifecycle` module, the `stepSim` swap in `stepOnce`, a lifecycle subscriber on `launched`/`docked`, the arrival and restore bump points, D-05 parity, the anchored-save proof, and a hot-path cost check.

**Strengths:**
- There is exactly one call to `stepSim` (D-14).
- Equivalence of a warm Load and a cold Continue through `resetForRestore(0)` is proven in Node.
- The no-`EntityId` gate on the lifecycle enforces the per-world id scope.
- The anchored-save test now uses the real API (`save.ts:301,663`).

**Concerns:**
- LOW (A-5): Lifecycle changes are spread across five modules: the router (`begin`/`end`), the hyperspace controller (`begin` inside the install block), `start-session` (create, `resume`, dispose `end`), the save controller (`resetForRestore` + `resume`/`end`), and the duplicate reaction in `tick-script.ts`. In addition, `begin` runs `populate` inside the arrival install block. In Phase 8 `populateNothing` cannot throw, but the Phase 12 populator can. If it throws after live references have moved, the "everything that can throw runs first" invariant of 08-10 breaks.
- LOW (A-6): The purity of `world-lifecycle.ts` and `step-options.ts` matters because the Playwright Node runner imports them. It is enforced only by one-time `rg` acceptance gates (`08-15-PLAN.md:143`, `08-10-PLAN.md:173`). A later DOM import would only show up as a confusing Playwright import failure.

**Suggestions:** Document in `world-lifecycle.ts` that a future populator must be split into a fallible prepare step that runs before the install block and a commit that cannot fail. Add a durable guard test, or an ESLint `files` block that reuses the sim import restrictions, for these two `src/app/session` files.

**Risk:** MEDIUM

## 08-16

**Summary:** The one additive probe commit (`probe.sim`, `worldHash`, `advanceTicks`) and hash parity between the browser and Vitest through `tick-script.ts`.

**Strengths:**
- Every value in `probe.sim` is a primitive, read through `liveEntityCount`.
- The hash is computed on demand.
- The subtractive fixture diff proves the commit is additive.
- The triangulation is sound: the real-driver Vitest run matches the replay, and the browser matches the replay, so the duplicated replay logic is checked.

**Concerns:**
- **HIGH (H-1): the acceptance gate `rg -n "world/store|\.store\b" src/app` cannot pass** (`08-16-PLAN.md:143`, Task 1 acceptance). `\.store\b` matches the IndexedDB save store `saveBoot.store`, which exists today at `src/app/game-session.ts:1167`, `:1341`, `:1490` and `:3345`, and which 08-08 and 08-12 move into `src/app/session/save-controller.ts` and `start-session.ts`. The gate fails on unrelated persistence code. An executor will either record a failed criterion or rename working save code to satisfy it, which goes beyond this plan's `files_modified`.

**Suggestions:** Narrow the gate to what the rule means: `rg -n "sim/world/store(\.js)?\"|world\.store\b|\.store\.(live|get|allocate|kill|commit|nextId)\b" src/app` prints nothing. `saveBoot.store.read()` and similar calls do not match it. Mirror the corrected regex in threat `T-08-46` and in the Round 3 disposition row.

**Risk:** MEDIUM

## Cross-plan summary

- **Layering:** sound. `src/sim` gets no Three or DOM import from any plan. The AI zone allows only type-only seams plus `ids` and `math`. `src/app` reaches the world only through `world.ts` (`liveEntityCount`, lifecycle), `serialize.ts` (`hashWorld`) and `sim.ts`.
- **Waves:** no file collisions inside any wave. Every `depends_on` edge needed for interface use is present, directly or transitively. The critical path is the 9-wave split track, as designed.
- **Contracts:** the validation domain has no single owner (A-1/A-2/A-3), one signature is stale (A-4), and one gate is broken (H-1). None of these changes wave structure or file ownership. The fixes are text edits to 08-05, 08-07, 08-10, 08-11, 08-13 and 08-16, and adding `limits.ts` to 08-05's `files_modified`.
- **Phase goal:** criteria 1 to 5 are each owned by a plan with an executable proof. Criterion 3's "restored equals live" depends on the sanitize/parse domain agreeing; A-2 is the remaining hole there, and it is latent until Phase 12 spawns entities from content data.

## Verdict: NEEDS REVISION

The change is small and targeted: fix the 08-16 `.store` gate (H-1); move the domain constants into one `src/sim/world/limits.ts` owned by 08-05 and imported by 08-11 and 08-13 (A-1); either validate the enum leaves at spawn or limit the sanitize/parse truth to the leaves it covers (A-2). A-3 to A-6 are optional hardening. Waves 1 to 4 can start once the 08-05 edits for A-1 and A-2 are in.
