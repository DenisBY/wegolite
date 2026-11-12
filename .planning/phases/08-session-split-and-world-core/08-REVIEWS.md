---
phase: 8
reviewers: [reviewer-architect-opus, reviewer-correctness-opus, reviewer-algorithm-opus, reviewer-adversarial-opus, reviewer-context-sonnet, reviewer-triage-haiku]
reviewed_at: 2026-11-12T14:08:09Z
plans_reviewed: [08-01-PLAN.md, 08-02-PLAN.md, 08-03-PLAN.md, 08-04-PLAN.md, 08-05-PLAN.md, 08-06-PLAN.md, 08-07-PLAN.md, 08-08-PLAN.md, 08-09-PLAN.md, 08-10-PLAN.md, 08-11-PLAN.md, 08-12-PLAN.md, 08-13-PLAN.md, 08-14-PLAN.md, 08-15-PLAN.md, 08-16-PLAN.md]
models:
  reviewer-architect-opus: "claude-opus-5-5"
  reviewer-correctness-opus: "claude-opus-5-5"
  reviewer-algorithm-opus: "claude-opus-5-5"
  reviewer-adversarial-opus: "claude-opus-5-5"
  reviewer-context-sonnet: "claude-sonnet-5-5"
  reviewer-triage-haiku: "claude-haiku-5-5"
model_sources:
  reviewer-architect-opus: "config"
  reviewer-correctness-opus: "config"
  reviewer-algorithm-opus: "config"
  reviewer-adversarial-opus: "config"
  reviewer-context-sonnet: "config"
  reviewer-triage-haiku: "config"
skipped_reviewers:
  opencode: "Not run per user instruction (use Claude models as reviewers this round)"
---

# Cross-AI Plan Review — Phase 8 (Round 4)

Reviewed at commit `0aa747a` (Round 3 feedback incorporated). Reviewers ran as Claude Code subagents, one specialist lens each, read-only against the repository.

<!-- gsd:plan-revision-conflicts:begin -->
## Plan-Revision Conflicts
<!-- gsd:plan-revision-conflicts:end -->

## Architecture Review (reviewer-architect-opus)


Scope: module boundaries, layering (`src/sim` free of Three.js and the DOM), wave and dependency order, file ownership inside each wave, contracts between plans, and whether the 16 plans together deliver the Phase 8 goal. I checked the plans at commit `0aa747a` against the repository source. I used codebase-memory coverage on every source file cited below. It reported `no_recorded_issue` for all of them, with the usual best-effort caveat.

### Round 3 resolution check

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

### Wave and file-ownership audit

- **Wave 1** (08-01, 08-02, 08-03): no shared files. 08-01 touches `package.json`, 08-02 touches `src/sim/math.ts` and `PROJECT.md`, and 08-03 touches `eslint.config.js`. 08-03's new bans do not fire on current code. The only `.sort(` in `src/sim` is `src/sim/economy/market.ts:169`, which takes a comparator, and `Math.random` appears only in a comment at `src/sim/math.ts:225`.
- **Wave 2** (08-04 split, 08-05 core): no shared files.
- **Wave 3** (08-06, 08-07): no shared files.
- **Wave 4** (08-08, 08-09): no shared files. 08-09 changes `src/sim/ai/types.ts` after 08-05 created it, so the order is sequential.
- **Wave 5** (08-10, 08-11): no shared files. The two plans do have a type-level coupling: 08-11 widens `SimEvent` while 08-10 moves `handleEvent`. This is safe because `EVENT_KIND_SUBSCRIBER` is typed `Record<string, readonly string[]>` (`08-10-PLAN.md:155`) and the router has no `never` default.
- **Wave 6** (08-12, 08-13): no shared files.
- **Waves 7-9** each hold one plan.
- Import graph across the planned modules: `rng.ts` imports nothing, `math → rng`, `world/entity → ai/types → world/{ids,view,control}`, and `world/step → ai/registry, world/view-impl`. There is no cycle, and the `world → ai` direction agrees with the AI zone, which allows only `ids/view/control/math`.

### 08-01

**Summary:** Pins the probe shape in six states, adds the strict comparator, re-points the session scans at a helper that concatenates the session sources, and records the `verify-full` baseline.

**Strengths:** Building the safety net before step 1 is the right order for D-12/D-13. The comparator treats an empty array as matching only an empty array. The concatenating source helper makes the redraw-gate and economy scans independent of where code lives, which every later split step relies on.

**Concerns:** None at architecture level.

**Suggestions:** None.

**Risk:** LOW

### 08-02

**Summary:** Pins the v1 flight hashes and the `createSeededRandom` vectors, then adds `rng.ts`, a plain uint32 stream that can be serialised, together with the `mix32` derivation of world and fork seeds, which the owner confirms at a checkpoint.

**Strengths:** `rng.ts` imports nothing and `math.ts` imports `rng.ts`, so there is no cycle. `arrival.ts` stays byte-identical (`src/sim/hyperspace/arrival.ts:73` is the only call in `src/sim`). The "createSeededRandom( appears exactly twice" scan also covers a gap in the AI zone: `../math.js` is allowed there and still exports the closure RNG, so this scan is the only thing stopping an AI module from creating a stream nobody can serialise.

**Concerns:**
- LOW: That protection lives in a Vitest scan, not in lint. If a later phase legitimately adds another caller, someone will likely bump the count from 2 to 3, and the protection is gone.

**Suggestions:** Add a short comment in the test that `math.ts` is on the AI allow-list, so that raising the count needs an AI-zone review.

**Risk:** LOW

### 08-03

**Summary:** Adds the determinism lint bans and guard probes for `src/sim`.

**Strengths:** The rule constants (`SIM_SYNTAX_BANS`) can be reused, and 08-09 spreads them into the AI blocks, so redefining the rule there does not silently drop the sim bans (Pitfall 5). The Round 3 reflection residuals are either covered by probes or documented.

**Concerns:** None.

**Suggestions:** None.

**Risk:** LOW

### 08-04

**Summary:** Split steps 1-2: the typed session context and the probe publisher, with `withdrawProbe()` wired into `dispose()` straight away.

**Strengths:** The context type becomes the one shared seam that every later split step builds on. Wiring `withdrawProbe` into dispose immediately means 08-12 can move it as-is.

**Concerns:** None.

**Suggestions:** None.

**Risk:** MEDIUM. This is inherent to a 185k-token mechanical move, not a plan defect.

### 08-05

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

### 08-06

**Summary:** Split steps 3-4: the render driver, the chart and settings controllers, and the `verify-full` gate.

**Strengths:** The Round 3 note on when listeners are registered is folded in. Running `verify-full` at step 3 is as D-12 requires.

**Concerns:** None.

**Suggestions:** None.

**Risk:** MEDIUM. This comes from the size of the move, not from the plan.

### 08-07

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

### 08-08

**Summary:** Split steps 5-6: the station controller and the save controller, with the `verify-full` gate.

**Strengths:** `buildSnapshotInputs` moves unchanged (`src/app/game-session.ts:1131-1152`), and 08-15's anchored-save proof depends on exactly that.

**Concerns:** See 08-16 H-1. This plan moves `saveBoot.store` (`game-session.ts:1167,1341,1490,3345`) into `src/app/session/`, which 08-16's gate later trips over.

**Suggestions:** None for this plan.

**Risk:** MEDIUM. This comes from the size of the move.

### 08-09

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

### 08-10

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

### 08-11

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

### 08-12

**Summary:** Split step 9: `frame-loop`, `start-session`, the thin facade, the pinned frame-phase order, and the `verify-full` gate in a worktree.

**Strengths:**
- The facade still builds the router, so 08-15's "no `game-session.ts` edit" holds.
- Construction and teardown order are recorded and pinned.
- The listener `signal` invariant matches the source (`game-session.ts:2268-2293`).

**Concerns:** None new.

**Suggestions:** None.

**Risk:** MEDIUM. This comes from the size of the move.

### 08-13

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

### 08-14

**Summary:** Test flags read once, a manual-clock frame-loop branch, and `advanceTicks` sharing one drain path with `advanceFrame`.

**Strengths:** The shared private drain path stops the manual clock drifting from the realtime one (Pitfall 3). The hook is not touched until 08-16 (D-13).

**Concerns:** None.

**Suggestions:** None.

**Risk:** LOW

### 08-15

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

### 08-16

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

### Cross-plan summary

- **Layering:** sound. `src/sim` gets no Three or DOM import from any plan. The AI zone allows only type-only seams plus `ids` and `math`. `src/app` reaches the world only through `world.ts` (`liveEntityCount`, lifecycle), `serialize.ts` (`hashWorld`) and `sim.ts`.
- **Waves:** no file collisions inside any wave. Every `depends_on` edge needed for interface use is present, directly or transitively. The critical path is the 9-wave split track, as designed.
- **Contracts:** the validation domain has no single owner (A-1/A-2/A-3), one signature is stale (A-4), and one gate is broken (H-1). None of these changes wave structure or file ownership. The fixes are text edits to 08-05, 08-07, 08-10, 08-11, 08-13 and 08-16, and adding `limits.ts` to 08-05's `files_modified`.
- **Phase goal:** criteria 1 to 5 are each owned by a plan with an executable proof. Criterion 3's "restored equals live" depends on the sanitize/parse domain agreeing; A-2 is the remaining hole there, and it is latent until Phase 12 spawns entities from content data.

### Verdict: NEEDS REVISION

The change is small and targeted: fix the 08-16 `.store` gate (H-1); move the domain constants into one `src/sim/world/limits.ts` owned by 08-05 and imported by 08-11 and 08-13 (A-1); either validate the enum leaves at spawn or limit the sanitize/parse truth to the leaves it covers (A-2). A-3 to A-6 are optional hardening. Waves 1 to 4 can start once the 08-05 edits for A-1 and A-2 are in.

---

## Behavioral Correctness Review (reviewer-correctness-opus)


Round 4, plans at `0aa747a`. I checked the plans against the real source: `src/app/game-session.ts` (3365 lines), `src/app/probe.ts`, `src/persistence/{autosave,save}.ts`, `src/sim/{math,events,step}.ts`, `src/sim/flight/{state,launch}.ts`, `eslint.config.js`, `tests/app/redraw-gate.test.ts` and `tests/guards/economy-purity.test.ts`. I did not run the Docker gate, because this is a plan review.

### Round 3 resolution check

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

### 08-01
**Summary:** Adds the probe-shape freeze and re-points the text scans at a helper that concatenates the session sources.
**Strengths:**
- Strict empty-array matching. `PROBE_SHAPE_VOLATILE_EMPTY_ARRAY_PATHS` starts empty and is tested in both directions (08-01:142-143).
- The base commit `5b189e4` exists, and `git diff 5b189e4 HEAD -- src` is empty, so the `src/app`-unchanged gate (08-01:174) holds.
- The scans being re-pointed are exactly the regexes and counts in `tests/guards/economy-purity.test.ts:320-353` and `tests/app/redraw-gate.test.ts:112-140`.

**Concerns:** None new.

**Risk:** LOW

### 08-02
**Summary:** Pins the v1 flight hashes and RNG vectors, adds the serialisable mulberry32 stream and the `mix32` world and fork seeds.
**Strengths:**
- `createSeededRandom` (`src/sim/math.ts:227-235`) is a pure mulberry32 closure, so delegating it to `rngNext` over a plain `s` state is bit-exact.
- The only `src/sim` caller is `src/sim/hyperspace/arrival.ts:73`, as the plan's scan claims. The render callers sit outside `src/sim`.
- `hashFlight` returns a string (`src/sim/flight/state.ts:181`), which matches the `worldHash(): string` used later.

**Concerns:** None.

**Risk:** LOW (the owner checkpoint covers the one-way door).

### 08-03
**Summary:** Adds the determinism lint bans with probes.
**Strengths:**
- No `src/sim` file uses `Reflect`, `globalThis`, `self`, a bare `.sort()` or `toSorted()`, or a Math alias (rg over `src/sim`; the `= Math` hits are calls like `Math.trunc`, not aliases).
- The Reflect selectors (08-03:141) cover `Reflect["get"]` through `[computed=true]`.

**Concerns:**
- LOW: `MemberExpression[object.property.name=/^(sort|toSorted)$/][property.name=/^(call|apply|bind)$/]` misses the computed form `Array.prototype.sort["call"]`. Add it to the documented residuals or match `property.value` too.

**Risk:** LOW

### 08-04
**Summary:** Split steps 1-2: the typed context and the first controller.
**Strengths:** The `^  (const|let) … = ctx.` alias guard (08-04:119,131) is a sound textual check against closure-level captures of live fields.

**Concerns:** None new.

**Risk:** LOW

### 08-05
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

### 08-06
**Summary:** Split steps 3-4: the render driver and the chart and settings controllers.
**Strengths:** The alias guard on `render-driver.ts` (08-06:112,125).

**Concerns:** None new.

**Risk:** LOW

### 08-07
**Summary:** The AI seam: a read-only `WorldView` and a write-only `ShipControl`.
**Strengths:**
- The view takes the player per call (G-8).
- The `Record<keyof …>` member pins.
- The station orientation is cross-checked against `src/render/bodies/station.ts:210-215`.

**Concerns:** None new.

**Risk:** LOW

### 08-08
**Summary:** Split steps 5-6: the station and save controllers.
**Strengths:** The existing post-`await` guard `if (disposed || !saveScreenOpen) return;` is real (`src/app/game-session.ts:1341-1344`) and is kept.

**Concerns:**
- LOW: 08-08:144 items (ii) and (iii) add new `disposed` short-circuits after `await saveBoot.store.clear(...)` (`src/app/game-session.ts:1490`) and in `queueSnapshot`'s `.then`. Neither exists today, and both sit inside a commit described as a verbatim move. They are harmless to v1 play, because they only act after dispose. Record them as deliberate deviations in the SUMMARY so a bisect does not attribute them to the move.

**Risk:** LOW

### 08-09
**Summary:** AI types, integer tick timers, the registry, the scripted test pilot and the AI lint zone.
**Strengths:** Recursive zone globs, a sealed re-export surface, and inherited bans proven inside the zone.

**Concerns:**
- LOW: the zone lets AI modules import `sim math`, and `src/sim/math.ts:227` exports `createSeededRandom`, a closure-held random source. That contradicts the truth "the pilot … imports no random source" (08-09 truths). The 08-02 scan catches a `createSeededRandom(` call, but not an aliased import (`import { createSeededRandom as r }`). Add `importNames: ["createSeededRandom"]` to the zone's `no-restricted-imports` for `math.js`, with one probe.

**Risk:** LOW

### 08-10
**Summary:** Split steps 7-8: the hyperspace controller, the event router and the sim driver.
**Strengths:**
- The 14-kind `EVENT_KIND_SUBSCRIBER` map matches `src/sim/events.ts`.
- The step-option parity cases are written against `game-session.ts:2814-2836`.
- The pre-launch autosave cases match the real drain at `:2763-2781`.

**Concerns:** None new.

**Risk:** LOW

### 08-11
**Summary:** The world step, the AI queue, the sanitiser and the reserved events.
**Strengths:**
- `sanitizeEntity`'s output domain now matches the parser row for row: radius in `(0, 1e12]`, `specKey` of 1-128 characters, counters in `0..0xffffffff`, renormalisation outside 1e-9, and `repairs` saturating.
- The table test has a repairs-delta column.

**Concerns:** See 08-05 MEDIUM (the duplicated constants).

**Risk:** LOW

### 08-13
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

### 08-12
**Summary:** Split step 9: the frame loop, the start-up wiring and the thin facade.
**Strengths:**
- The pinned-literal audit counts match the source exactly.
- No timers in `src/app` today (rg returns nothing), so the gate at 08-12:141 can pass.
- Both listeners already pass `signal: uiController.signal`.

**Concerns:**
- LOW: the `swapSystem` change (08-12:117) tracks the settlement rAF and resolves it on abort, which goes beyond a verbatim move (`src/app/game-session.ts:3284-3294`). It is acceptable, but should be recorded as a deliberate deviation.

**Risk:** LOW

### 08-14
**Summary:** Test flags and the manual-clock sim driver with `advanceTicks`.
**Strengths:**
- `parseTestFlags` replaces the existing exact `get("test") === "1"` read (`src/app/game-session.ts:3185`).
- The manual branch keeps the station-action drain (`:2757-2760`), so a launch click lands in `pending` and the next `advanceTicks` drains it.
- The docked tick advances under the realtime clock, because `loop.advance` runs in every non-paused mode (`:2763-2795`). This supports 08-16 case (c).

**Concerns:** None new.

**Risk:** LOW

### 08-15
**Summary:** The single integration plan: world lifecycle, epoch bump points and the anchored-save check.
**Strengths:**
- The anchored-save test is now type-correct against `encodeSave(inputs: SaveInputs): string` (`src/persistence/save.ts:663`).
- The `stepFlight(` count in `src/app` goes from 1 to 0, and no existing test pins `stepFlight` in session source (the redraw-gate and economy-purity scans do not reference it).
- The empty-world performance bound is realistic: an empty `stepWorld` does no per-entity work.

**Concerns:** None new.

**Risk:** LOW

### 08-16
**Summary:** The one deliberate probe commit: `probe.sim`, `worldHash` and `advanceTicks`, plus browser/Vitest parity.
**Strengths:**
- `createTestHook` gets a required fifth parameter, and there is one call site today (`src/app/game-session.ts:1035`, which moves to `probe-publisher.ts`).
- `worldHash(): string` matches `hashFlight`'s string return.
- `probe.sim` is published only inside `if (currentState !== undefined)`.
- 600 ticks clear the 2 s (240-tick) launch (`src/sim/flight/launch.ts:23`, `src/sim/step.ts:8`).

**Concerns:**
- HIGH (an acceptance criterion that cannot pass): 08-16:143 requires `rg -n "world/store|\.store\b" src/app` to print nothing and exit 1. `\.store\b` already matches four lines of save-boot code: `saveBoot.store` at `src/app/game-session.ts:1167`, `:1341`, `:1490` and `:3345`. 08-08:144 moves that code into `src/app/session/save-controller.ts` while keeping `saveBoot.store.read()`, so the gate fails on the persistence store and has nothing to do with the world store. Narrow it to `rg -n "sim/world/store|world\.store\b|worldLifecycle[^;]*\.store\b" src/app`, or ban the import with an ESLint `no-restricted-imports` pattern `**/sim/world/store*` scoped to `src/app/**`.

**Risk:** MEDIUM. The fix is trivial, but an executor that hits the gate would either rename save code or weaken the gate on the spot.

### Overall

All Round 3 findings are resolved in the plan text, and the line anchors and literal counts are accurate against the current source. Three new correctness defects remain:
1. 08-16:143: the `\.store\b` gate collides with `saveBoot.store` and cannot pass.
2. 08-13:140: the converse-NaN check for a scalar `ai.params` value cannot pass, because a JSON-nulled NaN is a legal `null` `ParamValue`.
3. 08-05, 08-11 and 08-13: the domain caps are defined three times. They should come from one module to keep the Round 3 alignment from drifting.

There are also minor items: spawn-time quaternion normalisation (08-05), the `createSeededRandom` import in the AI zone (08-09), and deviations from the verbatim move to record (08-08, 08-12). None of this affects v1 play. The fixes are small text edits.

**Verdict: NEEDS REVISION** (targeted edits to 08-16 and 08-13, plus the 08-05 constants module; no architectural change).

---

## Algorithm & Determinism Review (reviewer-algorithm-opus)


Round 4 review of the Phase 8 plans at commit `0aa747a`. Lens: seeded RNG streams and forking, uint32 arithmetic, world hashing, fixed-timestep stepping, entity id allocation, numeric bounds and sanitising, and fast-check soundness.

Evidence base: every plan file was read from disk (the algorithm-heavy plans 08-02, 08-05, 08-11 and 08-13 in full; the split-track plans through their must-haves and tasks). The claims were checked against `src/sim/hash.ts:13-35` (fnv1a32, canon), `src/sim/math.ts:53-57` (quaternion `normalize`) and `:227-237` (mulberry32), `src/sim/flight/sanitize.ts:50-63`, `src/persistence/save.ts:123,301-320,663` and `src/persistence/autosave.ts:66-74`, and `src/app/game-session.ts:1131-1153`. Two arithmetic claims were checked in the test container: `docker compose run --rm -v <scratchpad>/algo:/scratch test node /scratch/q.mjs`. The output is quoted under 08-11 and 08-13.

### Round 3 consensus: resolution check

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

### 08-01

**Summary:** Split safety nets: the verify-full baseline, the probe-shape snapshot and order-independent session-source scans.
**Strengths:** Session sources are concatenated in code-unit path order and the gated `renderFrame` pair is compared as a sorted set. The verdict therefore cannot depend on file layout, which is the right kind of order-independence.
**Concerns:** None from the algorithm lens.
**Suggestions:** None.
**Risk:** LOW.

### 08-02

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

### 08-03

**Summary:** Lint bans in `src/sim` for Math.random, Date, wall clock, timers, `for..in`, bare and reflective sort, plus Math aliasing and computed access.
**Strengths:** `performance` is already in `DOM_GLOBALS` (`eslint.config.js:28`), so `performance.now` is covered, along with `globalThis`, `self`, `crypto` and `process`. Using shared rule constants prevents the flat-config override from silently dropping a ban.
**Concerns**
- LOW. The bans stop *argument-less* sort, but nothing checks that a comparator is a *total* order. For example, `(a,b) => a.d - b.d` with a NaN distance is not a consistent comparator, and its result is engine-defined. Phase 8 sorts only finite values (`scan` uses squared distances of sanitized positions, then ids), so this is a documentation item, not a gate.
**Suggestions:** In the documented-residuals comment, add: "comparators must be total; NaN keys must be impossible by construction (sanitize) or broken by id".
**Risk:** LOW.

### 08-04

**Summary:** Split steps 1-2: typed session context and the probe publisher.
**Strengths/Concerns:** No determinism-relevant arithmetic. The closure-alias scan protects live-read semantics, which the later hash reads depend on.
**Risk:** LOW.

### 08-05

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

### 08-06

**Summary:** Split steps 3-4: render driver, chart and settings controllers.
**Concerns:** None from this lens. The redraw gate keys on identity, which does not affect sim determinism.
**Risk:** LOW.

### 08-07

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

### 08-08

**Summary:** Split steps 5-6: station and save controllers.
**Concerns:** None from this lens. `buildSnapshotInputs` being unchanged keeps the save bytes and the market seed (a `worldSeedFor` input) stable.
**Risk:** LOW.

### 08-09

**Summary:** AI types, integer tick timers, the registry and the scripted test pilot.
**Strengths:** `ticks(s) = max(1, Math.round(s * 120))` uses round, not ceil. The container shows `0.1*120 === 12` and `Math.round` gives 12, and a ceil-based variant would have mis-rounded some decimal-second inputs upward. The pilot's randomness comes only from the context's per-entity stream, and its state round-trips through JSON.
**Concerns**
- INFO. Timers are absolute player ticks bounded to `0..0xffffffff` by sanitize and the parser. At 120 Hz that wraps the domain after about 414 days of cumulative ticks. This is irrelevant in practice but worth one comment in `time.ts`.
**Risk:** LOW.

### 08-10

**Summary:** Split steps 7-8: hyperspace controller, event router and sim driver (`stepOnce`, one input frame per frame).
**Strengths:** `stepOnce` is the single step call site, and commands reach only the first step of a frame. Together these make the fixed-step sequence independent of frame cadence, which 08-13 Task 3 then proves for the world. The arrival stays one synchronous install block.
**Concerns:** None from this lens.
**Risk:** LOW.

### 08-11

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

### 08-12

**Summary:** Split step 9: the frame loop, start-up wiring and the thin facade.
**Concerns:** None from this lens. The frame phase order is pinned, and the freeze branches clear `pending`, so no command fires on a later frame after an unpause. That keeps command-to-tick mapping deterministic.
**Risk:** LOW.

### 08-13

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

### 08-14

**Summary:** Test flags, the manual clock and `advanceTicks(n)`.
**Strengths:**
- `advanceTicks` reuses the realtime drain, so commands go on tick 1 only and one input frame is shared.
- It refuses non-integer, out-of-range, disposed, paused or overlay states without tainting.
- It stops early on a pause or overlay opened mid-run.

These make `advanceTicks(1)×601` and `advanceTicks(1); advanceTicks(600)` equivalent for idle input, and 08-16 relies on that.
**Concerns**
- LOW. "the same input frame object on every call" (Task 1 step 5) is safe only if `stepOnce` and the controllers never mutate the frame. Add one assertion in the sim-driver test that the frame object is deep-equal before and after `advanceTicks(3)`. Otherwise a future controller that writes into the frame (for example, edge latching) would make the n-tick call differ from n single-tick calls.
**Risk:** LOW.

### 08-15

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

### 08-16

**Summary:** The one probe commit (`probe.sim`, `worldHash`, `advanceTicks`) and browser/Vitest hash parity.
**Strengths**
- The parity check has three legs (browser, Vitest real driver, Node replay), each also checked against `hashFlight`. The first-diverging-tick trace and the V8-only scope (PITFALLS 4, 08-11 row (f)) are stated honestly.
**Concerns**
- LOW. Parity compares quantised `hashWorld` strings (see E1). For an NPC-free world that is just `hashFlight`, so the assertion matches the v1 cadence tests and is acceptable for success criterion 5. If the browser ever exposes a snapshot through the hook in Phase 12, prefer exact JSON equality there.
**Risk:** LOW.

### Cross-plan summary

| ID | Severity | Plans | Finding |
|---|---|---|---|
| D1 | HIGH | 08-13 (08-05 `ParamValue`) | A scalar NaN param becomes JSON `null`, which is a legal `ParamValue`. The converse "refused" check is false and `snapshotWorld` silently changes state. `snapshotWorld` should refuse non-finite leaves |
| A1 / A1-b | MEDIUM | 08-05, 08-11, 08-13 | Spawn accepts non-unit quaternions; sanitize's `normalize` of a subnormal `normSq` (e.g. `{w:1e-160}` gives normSq 1.0000111, measured) stays outside the parser's 1e-9 tolerance. The property has a real counterexample and sanitize is not idempotent. Add a minimum-norm guard or a post-normalise check |
| B1 | MEDIUM | 08-05, 08-13 | `worldSeed` is never validated as uint32. `canon(n,0)` rounds while `forkSeed` truncates, so worldSeed 1.5 and 2 hash identically but fork differently |
| C1 | MEDIUM | 08-11 | The AI event drain caps passes but not deliveries (N·f^8 growth). Add a per-drain event budget counted in `aiDropped` |
| E1 | MEDIUM | 08-13 (08-16) | The live-versus-restored proof compares `canon(·,6)`-quantised hashes. Add an exact `JSON.stringify(snapshotWorld(·))` equality and exact player equality |
| — | LOW | 08-05, 08-07, 08-11, 08-13, 08-14 | Type-tag and escape param and string encoding in the hash; align ShipControl caps with sanitize; saturate `aiDropped`; include `aiDropped` in `isNeverSpawned`; parser `nextId` up to 2**32; null-prototype params accepted by the parser; frame-object immutability in `advanceTicks` |

Dependency ordering is sound. All the MEDIUM and HIGH items fall in the core-track plans of waves 2, 5 and 6 (08-05, 08-11, 08-13) and change no wave boundary. Waves 1, 3 and 4 can start as planned.

### Overall verdict: NEEDS REVISION

The three headline findings are D1, A1-b and B1. They are small text edits to 08-05, 08-11 and 08-13, but each one makes a stated must-have false or untestable: "unsanitized non-finite is refused", "every sanitized world parses", and "the hash covers every field". They also sit on the snapshot format that Phase 11 freezes. Once they are applied, along with C1 and E1, the plan set is READY. Nothing else in the 16 plans needs to change.

---

## Adversarial & Trust-Boundary Review (reviewer-adversarial-opus)


Round 4 review of the 16 Phase 8 plans at `0aa747a`. Lens: untrusted input (snapshots now, IndexedDB saves in Phase 11, the `?test=1` window hook), prototype pollution, validators that disagree, guards that can be bypassed, lifecycle races, and tests that pass while the bug remains. Claims were checked against the source at HEAD (`src/sim/hash.ts`, `src/sim/math.ts`, `eslint.config.js`, `src/app/game-session.ts`, `src/app/probe.ts`, `src/persistence/{save,autosave}.ts`) and across the plans.

### Round 3 disposition check

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

### 08-01

**Summary.** Sets up the split's safety nets: a verify-full baseline, a strict probe-shape snapshot and order-independent session-source scans.

**Strengths.** The comparator treats `[]` as matching only `[]`, and `PROBE_SHAPE_VOLATILE_EMPTY_ARRAY_PATHS` starts empty. Optional keys are sorted into state-determined and timing-dependent, and the fixture must pass three assert-mode runs, which closes the "permissive fixture" bypass. The baseline runs on a detached worktree of `5b189e4` under its own Compose project, so another plan's edits cannot leak into the evidence.

**Concerns.**
- LOW: the probe-shape spec checks key sets and leaf types, not values. That is by design, but nothing in this plan stops a later plan from publishing a live object reference (an alias) under an existing key. 08-16 adds its own primitive-only check for `probe.sim`; the existing `probe.*` keys have none.

**Suggestions.** None blocking.

**Risk.** LOW.

### 08-02

**Summary.** Pins the v1 flight hashes and RNG vectors, adds a serialisable mulberry32 `RngState`, and defines the `mix32` world and fork seeds.

**Strengths.** The vectors are captured from the unmodified closure and compared with `toBe`. `forkSeed` and `worldSeedFor` throw `RangeError` at the boundary, and the fixed-step callers guard their inputs so the throw cannot be reached from the frame loop (`08-02-PLAN.md:197`).

**Concerns.**
- MEDIUM (feeds the 08-09 finding): the permanent guard against closure-held streams is a text scan for `createSeededRandom\(` (`08-02-PLAN.md:220`). An aliased import (`import { createSeededRandom as r } from "../math.js"`) or a namespace import (`m.createSeededRandom(...)` written through a variable) gets past it. `createSeededRandom` is still exported from `src/sim/math.ts:227`, and 08-09 lets AI modules import that file.
- LOW: `worldSeedFor`/`forkSeed` coerce `worldSeed` with `>>> 0` (`:197`), so `1.5`, `-1` and `2**32 + 7` all quietly become different but valid seeds. This matters only because the 08-13 parser does not require a `uint32` `worldSeed` (see 08-13).

**Suggestions.** Make the scan import-aware: fail on any `import` of `createSeededRandom` outside `arrival.ts`, whatever the local name. Better, move `createSeededRandom` out of `math.ts` into a module the AI zone cannot import.

**Risk.** LOW-MEDIUM.

### 08-03

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

### 08-04

**Summary.** Split steps 1 and 2: a typed session context and the probe publisher extraction.

**Strengths.** A closure-level-alias scan ensures no live field is copied at factory scope (G-8). Publisher call sites are pinned by count and position, and the hook's mutate callback keeps both its taint and its redraw (`src/app/game-session.ts:1035-1042`).

**Concerns.** None new. The taint flag survives an in-session Load: `loadFromSave` never resets `testTainted` (`game-session.ts:1326-1430`), which is the safe direction.

**Risk.** LOW.

### 08-05

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

### 08-06

**Summary.** Split steps 3 and 4: the render driver, and the chart and settings controllers.

**Strengths.** The redraw gate keys on live identities read at call time. Listener totals and registration sites are pinned. verify-full runs on a detached worktree of the step commit.

**Concerns.** None new. Resume is refused while the WebGL context is lost, and the chart preset is test-pinned.

**Risk.** LOW.

### 08-07

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

### 08-08

**Summary.** Split steps 5 and 6: the station controller and the save controller.

**Strengths.** The save guard order is pinned: recovering, then status, then tainted (`game-session.ts:1212-1228,1261`). After each `await` in Load, Clear and Write, the code re-checks `disposed` (and `saveScreenOpen` for Load) before going on. A failed parse changes no live field. `document` access is guarded for Node tests.

**Concerns.**
- LOW: the post-await re-check covers `disposed` and `!saveScreenOpen`. A Load that resolves after the player closed and reopened F2 still installs, because the check is a boolean and not a generation counter. This is pre-existing (`game-session.ts:1344`) and not a regression. Phase 11 will feed untrusted epochs through the same path, so a `saveScreenGeneration` token is worth recording as a follow-up.

**Risk.** LOW.

### 08-09

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

### 08-10

**Summary.** Split steps 7 and 8: the hyperspace controller, the event router and the sim driver.

**Strengths.**
- The arrival is one synchronous install block: everything that can throw runs before any live reference moves.
- The routing table is declarative.
- Frozen frames empty `pending`.
- `buildStepOptions` is pure, so the Node replay calls the same code.

**Concerns.** None new. The router passes unknown kinds through harmlessly.

**Risk.** LOW.

### 08-11

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

### 08-12

**Summary.** Split step 9: the frame loop, start-up wiring and the thin facade.

**Strengths.** Every `addEventListener` carries `uiController.signal`. No timers exist in `src/app/session`. `swapSystem`'s rAF continuation is guarded against `disposed`. Dispose is idempotent and its order is test-pinned. The pinned-literal audit runs before the gates.

**Concerns.** None new.

**Risk.** LOW.

### 08-13

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

### 08-14

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

### 08-15

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

### 08-16

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

### Cross-plan summary

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

### Overall verdict

**NEEDS REVISION.** All Round 3 findings are resolved and the architecture is sound. Finding 1 is a concrete contradiction between plans: whichever way the executor resolves it, the test suite stays green while the Phase 11 save boundary is wrong. Findings 2-7 are targeted text edits to 08-03, 08-05, 08-07, 08-09, 08-11 and 08-13, and none changes waves or dependencies. Waves 1-4 can start after the 08-03 lint additions and the 08-05 `ParamValue` decision.

---

## Broad-Context & Blast-Radius Review (reviewer-context-sonnet)


Scope: Round 4 review of Phase 8 plans 08-01..08-16 at commit 0aa747a, through the lens of existing callers, e2e tests, save format, CI/verify gate, CHANGELOG/NOTICE obligations, Docker workflow, and consistency with PROJECT.md / CONTEXT.md / REQUIREMENTS.

Method: I did not re-read all 4,500 plan lines line by line. I read CONTEXT in full, then traced the Round 3 consensus items and the cross-cutting blast-radius points against the repo source. Per-plan sections below are therefore brief where I found nothing in my lens. Coverage-index checks were not run (graph returned only planning symbols for the source files I relied on, so I read the files directly).

### Round 3 verification (all five consensus items)

1. Domain alignment spawnEntity / sanitizeEntity / parseWorldSnapshot (08-05, 08-11, 08-13): RESOLVED. 08-11-PLAN.md:165-169 now bounds ownerId/spawnTick/nav.targetId/rng/ai timers/repairs at `0..0xffffffff` with `repairs` saturating; 08-11-PLAN.md:162 clarifies 1e12 is a world-local cap wider than `MAX_SAVE_POSITION_MAGNITUDE = 1e9` (confirmed `src/persistence/save.ts:123` is 1e9); `MAX_AI_PARAMS_KEYS` is exported from 08-11 and 08-13 (08-13-PLAN.md:34,107); 08-05-PLAN.md:181 adds `specKey.repeat(129)`, `tick = 2**32`, `ownerId = 2**32` rows. Post-spawn in-place mutation is carried in the 08-13 R3-01 disposition (08-13-PLAN.md:258).
2. 08-15 anchored-save call shape: RESOLVED. 08-15-PLAN.md:206 now inspects `Object.keys(inputs)` / `JSON.stringify(inputs)` / `encodeSave(inputs)` on the `SaveInputs` object. I checked the key allow-list against `src/persistence/save.ts:301-320`: the 14 `SaveInputs` keys listed in the plan match the interface exactly (including optional `targetSystem`, `marketSeed`, `market`, `flight`).
3. 08-16 `createTestHook`: RESOLVED. 08-16-PLAN.md:125 makes `sim` a required fifth parameter; `createTestHook` has exactly one call site (`src/app/game-session.ts:1035`), so the blast radius is one line. NOTE: the Round 3 consensus text says `worldHash(): number`; the plan correctly uses `string` because `hashFlight`/`fnv1a32` return `string` (`src/sim/flight/state.ts:181`, `src/sim/hash.ts:13`). The consensus text was wrong, the plan is right.
4. MAX_SAVE_POSITION_MAGNITUDE citation: RESOLVED (see 1).
5. Guard precision: 08-03-PLAN.md:141,161 add `Reflect["get"]`, `Reflect.apply`, `.sort.apply/.bind`; line-anchor refresh recorded in 08-10/08-12 dispositions. I confirmed `pending.length = 0;` is at `src/app/game-session.ts:2738` today, matching the refreshed anchors (the old `:2744` citation was stale). Note: the plans' line anchors will drift again as soon as 08-04..08-10 land; they are only useful as pre-move references.

### 08-01
Summary: verify-full baseline, probe-shape snapshot, order-independent session-source scans for `tests/app/redraw-gate.test.ts` and `tests/guards/economy-purity.test.ts` (the only two tests that read `game-session.ts` as text; I confirmed with `rg`, plus two comment-only mentions in `tests/e2e/budget.spec.ts:15` and `hyperspace-failure.spec.ts:43` that need no change).
Strengths: `test:e2e:fast` change is paired with the pinned string in `tests/contract/container-contract.test.ts:336` (plan 08-01-PLAN.md:140,253). Strict `[]` comparator.
Concerns: LOW - the plan sits at the 10-file threshold (08-01-PLAN.md:75); acceptable.
Suggestions: none.
Risk: LOW.

### 08-02
Summary: pinned v1 flight hashes, serialisable RNG, `mix32` seeds.
Strengths: Does not regenerate goldens; respects CONTEXT discretion on `arrival.ts`.
Concerns: LOW - `src/sim/**` coverage floors (`vitest.config.ts:35-41`: lines 93, branches 86) apply to all new sim code; defensive-branch-heavy modules can dip. Plan relies on tests-first, which is fine.
Risk: LOW.

### 08-03
Summary: determinism bans in `src/sim` plus guard tests.
Strengths: Named constants spread by later blocks, so the AI-zone override does not silently drop bans (flat-config replace semantics). The bans partly pre-exist in `eslint.config.js:127-149` (Math.random, Date, wall clock), so the plan is additive rather than a rewrite.
Concerns: LOW - the guards write probe files under `src/sim` and run real `tsc` on `tsconfig.sim.json`; `withProbeLock` (`tests/guards/probe-lock.ts`) serialises them. New guard files in 08-03/08-09 must use it; the plan states `__purity_` prefix via `withSimProbe`. Fine.
Risk: LOW.

### 08-04
Summary: typed session context and probe-publisher extraction (split steps 1-2).
Strengths: Gate attribution rule for a shared tree; stale-capture audit.
Concerns: LOW - no CHANGELOG entry needed, matches AGENTS.md internal-only rule.
Risk: MEDIUM (inherent to a 3,365-line split; mitigated by probe-shape snapshot and goldens).

### 08-05
Summary: ids, entities, five static entities, store, world hash.
Strengths: Per-world id scope matches the 2026-11-12 D-06 amendment in CONTEXT, ROADMAP SC2 and REQUIREMENTS FOUND-11 (all three already worded consistently; I checked REQUIREMENTS.md:23). `liveEntityCount` exported for the app layer, which keeps `src/app` off `world.store`.
Concerns: LOW - `PROJECT.md` Key Decisions row 'Entity id uniqueness is per world' is a required edit in this plan; confirm the row lands in the same commit as the code (the plan says so).
Risk: LOW.

### 08-06
Summary: render driver, chart, settings controllers; verify-full gate.
Strengths: The gate runs in a clean worktree from a recorded SHA.
Concerns: MEDIUM - see cross-plan item C1 (Firefox).
Risk: MEDIUM.

### 08-07
Summary: read-only `WorldView`, write-only `ShipControl`.
Strengths: Explicitly pins coverage floors via `docker compose run --rm test`.
Concerns: LOW.
Risk: LOW.

### 08-08
Summary: station and save controllers; verify-full gate. Injects `SaveControllerDeps` so `loadFromSave` is Node-testable, which 08-15 then reuses.
Strengths: Save format untouched; Round 3 disposition says no findings.
Concerns: LOW - `src/persistence/idb-store.ts` is coverage-excluded (`vitest.config.ts:21`), so the doubles in 08-08 are the only unit proof of load order; the browser save-load specs in verify-full are the second proof, as the plan states.
Risk: MEDIUM (save path).

### 08-09
Summary: AI types, tick timers, registry, scripted test pilot, AI lint zone.
Strengths: Rule replacement is handled (`...SIM_SYNTAX_BANS` spread, 08-09-PLAN.md:185). Depth-3 catch-all rejects deeper nesting instead of leaving a bypass. The AI `no-restricted-imports` regex rejects `three` and `zod` as well, so replacing the sim-zone import rule loses nothing.
Concerns: LOW - `TEST_PILOT` and `AI_REGISTRY` ship in the production bundle (nothing imports them from `src/app` until 08-14/16, so Vite will tree-shake; if `AI_REGISTRY` is later imported by the session, the test pilot rides along). Informational only.
Risk: LOW.

### 08-10
Summary: hyperspace controller as one atomic unit, event router, sim driver.
Strengths: Declarative `EVENT_KIND_SUBSCRIBER` map with ordered fan-out.
Concerns: LOW - line anchors in the plan are stale again once earlier steps land; the executor must re-find sites by pattern, not line.
Risk: MEDIUM.

### 08-11
Summary: world step after the flight step, queued AI events, sanitizer.
Strengths: Domain table closed against 08-13.
Concerns: LOW - `sanitize` repair counts become hashed state (08-11-PLAN.md:34); acceptable and tested.
Risk: MEDIUM.

### 08-12
Summary: frame loop and start-up wiring, thin facade; verify-full gate.
Strengths: Construction/teardown order recorded as header comments; pinned-literal audit.
Concerns: MEDIUM - this is the step that rewrites rAF/frame timing and `window.addEventListener` registration (`game-session.ts:2268,2289` are the only two window listeners). The Firefox journey (`e2e-cross`) is outside `verify`/`verify-full` and no plan runs it (`rg e2e-cross` over all 16 plans: zero hits). See C1.
Risk: MEDIUM.

### 08-13
Summary: snapshot codec, 1,000-tick live-vs-restored equality, world cadence.
Strengths: Parser/restore share one validator; constants exported once.
Concerns: LOW.
Risk: LOW.

### 08-14
Summary: test flags and manual-clock sim driver with `advanceTicks`.
Strengths: URL flags read once at boot, no runtime toggle (D-09, D-10); matches CONTEXT.
Concerns: LOW - `?test=1&clock=manual` and `traffic=1` are new documented test surface; no README/docs mention is planned (AGENTS.md only requires CHANGELOG for user-visible changes, so this is optional).
Risk: LOW.

### 08-15
Summary: single integration plan; epoch bump points; anchored-save check; hot-path cost check.
Strengths: Warm `Load` and cold `Continue` produce identical epoch/worldSeed via `resetForRestore(0)`; Phase 11 hand-off recorded in PROJECT.md. This is consistent with CONTEXT D-02 ("reloading a save and launching reproduces the same world") and D-03 (epoch in memory only). Anchored-save test is now correctly shaped. Perf scratch script lives in `/tmp/wegolite-perf`, in line with AGENTS.md.
Concerns: LOW - the 1.2x + 2 us threshold is a wall-clock microbenchmark inside a container; flaky on a loaded runner. The plan says never relax the threshold; recommend a small re-run allowance (best of N) so a noisy host does not block the phase.
Risk: MEDIUM (first plan that changes the production runtime path).

### 08-16
Summary: one deliberate additive probe commit (D-13): `probe.sim`, `worldHash`, `advanceTicks`; browser/Vitest parity.
Strengths: `sim` required on `createTestHook`; `probe.sim` deleted on failure surface and dispose; `tests/helpers/tick-script.ts` limited to DOM-free modules, the same pattern `tests/helpers/lave.ts` already uses from the Playwright runner. Probe-shape snapshot and optional-key audit table updated in the same commit, so D-13 holds.
Concerns: LOW - parity depends on `runTickScript` mirroring the session's New-game setup (profile, market seed, dock geometry). The plan lists each mirrored value with its source line; any later change to New-game defaults will break parity, but it will do so loudly (hash mismatch), which is the desired behaviour.
Risk: LOW.

### Cross-plan items (new)

C1 (MEDIUM): No plan runs the Firefox suite (`docker compose run --rm e2e-cross`). AGENTS.md puts it outside `verify`, but 08-12 rewrites the frame loop and 08-14 adds a manual-clock mode that bypasses it, and the Firefox core-loop journey is the only second-engine check. Suggest one run at the step-9 gate (08-12) and one after 08-15, recorded in the SUMMARY; do not make it a blocking gate if Firefox is known flaky.

C2 (LOW): Coverage floors (`vitest.config.ts:35-41`, src/sim lines 93 / branches 86) are global to `src/sim/**`. 16 plans add a lot of defensive parsing code under `src/sim`; only 08-07 mentions floors. Suggest 08-13 and 08-15 each confirm `docker compose run --rm test` (with coverage) passes, which the verify gate already does, so this is a reminder rather than a gap.

C3 (LOW): CHANGELOG/NOTICE/ASSETS: every plan states "no entry", consistent with AGENTS.md (internal only, no new assets, no dependency change; `fast-check` 4.10.2 is already a devDependency per `package.json:37`). The only test-hook surface change (`probe.sim`, `advanceTicks`) is behind `?test=1`, so omitting it is defensible.

C4 (LOW): Several plans cite `game-session.ts` line numbers. They are accurate today (verified one) but each extraction commit invalidates the rest. Executors should locate by pattern.

C5 (INFO): Docker workflow is respected throughout: all commands use `docker compose run --rm ...`, scratch files in `/tmp`, no host installs, no new ports, no new packages.

### Overall verdict

READY. All five Round 3 consensus items are genuinely resolved in the plan text, and the ones I could check against source (SaveInputs keys, `MAX_SAVE_POSITION_MAGNITUDE`, `hashFlight` return type, `createTestHook` call site, `pending.length = 0` anchor, window listeners) match. Remaining items are advisory: run `e2e-cross` once around 08-12/08-15, tolerate benchmark noise in 08-15, and locate session code by pattern rather than line number.

---

## Fast Triage Review (reviewer-triage-haiku)


Scope: Phase 8 plans 08-01 to 08-16 at commit 0aa747a (Round 4). Read-only. Method: each plan's frontmatter, must_haves, task headers, acceptance criteria and Round 3 ledger were read; numeric constants, file names, symbols and line anchors were checked against the repo (`src/`, `tests/`, the Oolite checkout). Not read line by line: 08-05 Task 2 behaviour list, 08-02 Tasks 2-3 bodies, 08-15 Task 3 bodies beyond the anchored-save and lifecycle text. Those are triaged only for consistency.

Overall verdict: NEEDS REVISION. All nine Round 3 consensus items are present in the text, but three cross-plan contradictions remain (advanceTicks optional vs the probe-shape invariant; createEventRouter signature; constant ownership). They are text fixes, not architecture changes.

### Round 3 disposition check

| Round 3 finding | Status | Evidence |
|---|---|---|
| C1 08-13 post-spawn in-place mutation, counter/quat/string/key caps, restoreWorld via parser, anti-alias test | Resolved in text | 08-13-PLAN.md:133 (1+5e-10 accept row, underflow reject row, 257 entities, 101.5, 2**53), :138 (snapshot anti-alias test), :140 (sanitizer/parser agreement), :202 (restoreWorld validates through parseWorldSnapshot). Counter bounds match 08-11:166-169 and 08-05:137. |
| C2 08-15 anchored save uses SaveInputs object | Resolved | 08-15-PLAN.md:206 asserts `Object.keys(inputs).sort()` and `JSON.stringify(inputs)`. Allow-list of 14 keys equals SaveInputs (src/persistence/save.ts:301-320). Ledger at :297 still quotes the superseded `snapshotForSave(inputs)` wording (LOW). |
| C3 08-16 createTestHook sim required, probe.sim anti-mutation, liveEntityCount | Resolved in text, with a new conflict | 08-16-PLAN.md:38, :267 (required 5th param), :125 (liveEntityCount), :162 and :206 (typeof, no aliasing). New conflict on advanceTicks, see X1. |
| C4 MAX_SAVE_POSITION_MAGNITUDE 1e9 vs 1e12 | Resolved | 08-11-PLAN.md:162 and 08-05-PLAN.md:137 explain the world-local cap. src/persistence/save.ts:123 is 1e9. 08-13-PLAN.md:133 uses "(exceeding MAX_SNAPSHOT_MAGNITUDE (`1e12`))" with the 1e308 example. |
| C5 08-03 Reflect/apply/sort.call, 08-05 nextId 2**32, 08-12 addEventListener signal, stale anchors | Resolved | 08-03-PLAN.md:141-142; 08-05-PLAN.md:180 (2**32 allocate test) and :293; 08-12-PLAN.md acceptance (addEventListener count = uiController.signal count) and :250. Anchors 2738/2749/2773/2859 in 08-10-PLAN.md:258 match src/app/game-session.ts. |
| 08-13 `slices any param arrays` wording | Resolved | 08-13-PLAN.md:107 now says "copies (via `.slice()`) any param arrays". |

### Cross-plan findings

- **X1 (HIGH). advanceTicks optional vs the probe-shape invariant.** 08-16-PLAN.md:126 sets `advanceTicks: ctx.runtime.testFlags.manualClock ? ... : undefined`, and :221 calls it optional. But 08-01-PLAN.md:27 requires that in the docked `?test=1` state "every probe.test method reads as function", and 08-01-PLAN.md:153 checks the fixture keys. 08-16 step 4 also claims `test.advanceTicks` is an addition to the existing states. Under plain `?test=1` the key is absent, so the subtractive check and the comparator would fail or would silently record a missing key. Fix: either always publish a function (for example, one that refuses outside the manual clock), or restate the 08-01 must-have and the 08-16 subtractive check for the plain `testHookDocked` state.
- **X2 (MEDIUM). createEventRouter signature contradicts itself.** 08-10-PLAN.md:28 and :155 (and the ledger at :244) use `createEventRouter(ctx, subscribers)`. 08-10-PLAN.md:39 and :212 (the artifacts lists) still say `createEventRouter(subscribers)`. 08-15-PLAN.md:105 says `(subscribers)` and :130 says `(ctx, subscribers)`. Fix the three artifact and interface lines to match the body.
- **X3 (MEDIUM). Constant ownership is split and runs forward.** `MAX_ENTITY_MAGNITUDE` (1e12), `MAX_SNAPSHOT_STRING_LENGTH` (128), `MAX_SNAPSHOT_PARAM_LENGTH` (64) and `MAX_AI_PARAMS_KEYS` (32) are used by the wave-2 spawn validator in 08-05-PLAN.md:137 and 08-05 artifacts (:39-49 do not define them). They are provided by 08-11-PLAN.md:45 and :277 (src/sim/world/sanitize.ts) and by 08-13-PLAN.md:107 (src/sim/world/snapshot.ts, which also redefines the same names and `MAX_SNAPSHOT_MAGNITUDE = 1e12`). So 08-05 cannot import them when it runs, and two modules define the same constants. Fix: one owner, defined in 08-05 (for example in ids.ts or a constants module), imported by 08-11 and 08-13.
- **X4 (LOW). Dependency edges.** 08-11 depends_on lists only 08-09, but Task 1 calls `createWorldView` from 08-07. The dependency is transitive. Name 08-07 explicitly.

Verified in source (no findings): game-session.ts is 3365 lines with 77 closure `let`s (`^  let`), exports 9 names, `generateMarket(` 3 times, `case "docked":` once. Anchors: renderFrame 2577, drawKeys 2558, shouldDraw 2566, showHint 2680, frame 2699, refusalCopy 2044, handleHyperspaceJumped 2061, syncStatusOverlay 2160, closeSaveScreen 1899 (document access at 1906), loadFromSave 1326, clearSaveForNewGame 1482, enterSystemById 1768, onSubpanelKeyDown 2257, onLaunchKeyDown 2279-2292, pending.length sites 2738/2749/2773/2859. `createTestHook` at src/app/probe.ts:390 (4 params today). SimEvent has 14 kinds (src/sim/events.ts) and the 08-11 reserved list has 15. DT = 1/120 (src/sim/step.ts:8) and AI_THINK_INTERVAL 0.125 (src/Core/AI.h:31) give 15 ticks. `Math.round(0.1*120) = 12`, and `120*(1/120) === 1` holds. Oolite anchors OOTypes.h:168-170, Universe.m:4841-4846 and 1162, OOPlanetEntity.m:94 and OOSunEntity.m:131 match. `createSeededRandom` is defined once (src/sim/math.ts:227) and called once in src/sim (src/sim/hyperspace/arrival.ts:73). src/sim has no `Date`, timers, `process`, `Reflect`, `globalThis`, `for..in`, bare sort, or `Math.random`. market.ts:169 is a comparator sort and hash.ts:8 mentions crypto only in a comment. Files cited as existing exist (lave.ts, dock-pose.ts `laveDockGeometry`, redraw-gate.ts `IDLE_SETTLE_DRAWS`, `createMessageQueue`, `createLaunchSequence`, src/render/sync.ts:80, src/render/bodies/station.ts roll at 203-216). Files that do not exist yet (session-source.ts, context.ts, start-session.ts, tick-script.ts, rng.ts, recorded-flights.ts, world/ and ai/ trees, golden/world) are all created by the plan that cites them.

---

### 08-01

**Summary.** Split safety nets: the probe-shape comparator and spec, the fixture recorded from the monolith, and the re-pointed session-source scans.

**Strengths.** The comparator rules are explicit (empty array, null versus missing, function leaf). The fixture is recorded before any split. The fast gate gets the spec (`package.json` change, container-contract update).

**Concerns.**
- MEDIUM. Must-have at 08-01-PLAN.md:27 ("every probe.test method reads as function" in docked `?test=1`) conflicts with 08-16-PLAN.md:126 (advanceTicks undefined outside manual clock). See X1.
- LOW. 08-01-PLAN.md:153 hard-codes six state keys and `Object.keys(f).length===6`. That is correct for 08-01, but 08-16 adds a seventh state. Note it in 08-16's subtractive check.

**Suggestions.** Resolve X1 here (the state's `test` object shape is decided in this plan).

**Risk.** LOW.

### 08-02

**Summary.** Pinned v1 flight hashes and RNG vectors, serialisable stream state, mix32 world and fork seeds.

**Strengths.** Pins are captured from the unmodified closure before delegation. The single-caller invariant is checkable: `createSeededRandom` has one call in src/sim (arrival.ts:73). The render callers are left untouched, as the truth at 08-02-PLAN.md:34 requires.

**Concerns.**
- LOW. Must-have :27 mentions "a Lave to Leesti jump with the session's arrival draw". The fixture and helper (`tests/helpers/recorded-flights.ts`) do not exist yet. Check that the route is reachable with the existing scripted-flight helpers, or name the helper.
- LOW. Estimate 115k over the budget with `autonomous: false`. The accepted-risk note covers it.

**Suggestions.** Name the golden file path in one place (08-05 and 08-11 both cite `tests/golden/world/flight-hash-pins.json`, consistent so far).

**Risk.** MEDIUM (one-way D-02 arithmetic pinned literally; a mistake here propagates to every later plan).

### 08-03

**Summary.** Determinism lint bans in src/sim, with probes and positive controls.

**Strengths.** Every banned construct is backed by a probe and a positive control. The Round 3 Reflect/apply/sort.call/bind forms are present (08-03-PLAN.md:141-142). The repo has no current violations (I checked `.sort()`, `for..in`, `Date`, timers, `process`, `Reflect`, `globalThis`, `Math` aliasing in src/sim). `market.ts:169` is the comparator sort that must stay legal.

**Concerns.**
- LOW. Step 143 lets the executor "adjust the selector until its probe fails". The probe expectations are fixed, but the selector is not. Acceptable, but state that a selector change needs a review note.
- LOW. The `Reflect["get"]` and `.sort.apply` forms are in the acceptance count (≥31 failing cases, :161), which is a count, not a list. Consider listing the probe names.

**Suggestions.** Keep the message strings frozen as the plan says (they are reused by 08-09).

**Risk.** LOW.

### 08-04

**Summary.** Split steps 1-2: typed SessionState and extraction of the probe publisher.

**Strengths.** The anchors all match: 3365 lines, 77 lets, saveProbe 441, redrawGate 468, messages 480, launchSequence 483, commitProfile 1021, bindTestHook 1034, applyTestCredits 1050, applyTestEquipment 1055, syncSaveProbe 1067, updateProbe 2412. The pinned renderFrame signature matches game-session.ts:2577. The `withdrawProbe` wiring is explicit.

**Concerns.**
- LOW. The rejected R2-03 (narrow Pick facets) is a judgement call under D-12; it is recorded, so this is only a note.

**Suggestions.** None blocking.

**Risk.** MEDIUM (3.3k-line mechanical rewrite; guarded by the scans and the stale-capture audit).

### 08-05

**Summary.** World foundation: ids, entities, five static entities, store, world hash, D-08 proof.

**Strengths.** Fixed ids (1-5, 100, 101) are consistent with 08-07, 08-09, 08-13 and 08-15. The 256 cap counts non-dead entities. The `nextId <= 0xffffffff` guard is in the acceptance criteria. Oolite anchors OOTypes.h:168-170 and Universe.m:4841-4846 are correct.

**Concerns.**
- MEDIUM. Forward references (X3). 08-05-PLAN.md:137 validates `specKey` against `MAX_SNAPSHOT_STRING_LENGTH (128)`, `ai.params` against `MAX_AI_PARAMS_KEYS (32)`, and radius and pose against `MAX_ENTITY_MAGNITUDE (1e12)`. None of these is in the 08-05 artifacts list (:39-49). They are defined later, in 08-11 (sanitize.ts) and 08-13 (snapshot.ts). Define them in 08-05.
- LOW. The must-have at :28 is one very long clause. Split it so an executor can test each rule.

**Suggestions.** Put the caps in ids.ts (or a `limits.ts`) owned by 08-05.

**Risk.** MEDIUM.

### 08-06

**Summary.** Split steps 3-4: render driver, chart and settings controllers, with a verify-full gate on a detached worktree.

**Strengths.** The live-read rule is explicit. The redraw-gate literals are pinned. The verify-full step runs on the step's own commit.

**Concerns.**
- LOW. Worktree path `/tmp/wegolite-gate-08-06-step3` (Task 1 step 5). Acceptable under the AGENTS.md mount rule, but a worktree in the scratchpad would avoid a shared /tmp name collision.
- LOW. The listener totals (`addEventListener`/`removeEventListener`) are "recorded in the SUMMARY" rather than fixed numbers. That is intentional, but the acceptance is then self-referential.

**Suggestions.** None blocking.

**Risk.** MEDIUM.

### 08-07

**Summary.** The AI seam: type-only WorldView and ShipControl with implementations.

**Strengths.** Both interfaces are pinned by exhaustive `Record<keyof ...>` literals. The world holds no FlightState, so G-8 holds by construction. The station roll must match the renderer's base-then-roll composition, and `src/render/sync.ts:80` and `src/render/bodies/station.ts` (roll at 203-216) are the reference.

**Concerns.**
- LOW. Frontmatter depends_on lists only 08-05. This is correct for its own inputs.

**Suggestions.** None.

**Risk.** LOW.

### 08-08

**Summary.** Split steps 5-6: station controller and save controller, with a verify-full gate at step 6.

**Strengths.** The save guard order is pinned by a "loadFromSave order" test. `closeSaveScreen` (game-session.ts:1899) and its `document` access (:1906) match the plan. The loadFromSave, clearSaveForNewGame and renderStation anchors (1326, 1482, 889) match.

**Concerns.**
- LOW. The station block range "492-1020" in the interfaces section is approximate. The plan says to locate by name, so this is only a note.
- LOW. Worktree path `/tmp/wegolite-gate-08-08-step6`, as in 08-06.

**Suggestions.** None blocking.

**Risk.** MEDIUM (175k estimate; persistence-adjacent).

### 08-09

**Summary.** AI types, integer tick time base, registry, scripted test pilot, and the AI lint zone.

**Strengths.** Time constants are correct: `DT = 1/120` (src/sim/step.ts:8), `AI_THINK_INTERVAL 0.125` (src/Core/AI.h:31), so 15 ticks. `ticks(seconds) = max(1, round(seconds*120))` gives `ticks(0.1)=12`, `ticks(0.125)=15`, `ticks(0)=1`, which matches the behaviour list. The AI zone covers nested directories recursively.

**Concerns.**
- LOW. 08-09-PLAN.md:33 ("the populator never spawns the test pilot") cannot be tested in Phase 8, because the populator is Phase 12. The claim is only checkable by grep for `AI_REGISTRY` usage. State that.
- LOW. Frontmatter depends_on includes 08-07 and 08-03 but not 08-05, which the spawn-based tests use. It is transitive through 08-07.

**Suggestions.** Change :33 to a grep-based acceptance criterion.

**Risk.** LOW.

### 08-10

**Summary.** Split steps 7-8: hyperspace controller (atomic), event router, sim driver with `stepOnce`, and the pure step-options builder.

**Strengths.** The hyperspace install block is moved as one unit. `stepFlight` ends up with one call site. The 14 existing SimEvent kinds (src/sim/events.ts) match the `EVENT_KIND_SUBSCRIBER` map. The anchors (refusalCopy 2044, handleHyperspaceJumped 2061, syncStatusOverlay 2160, enterSystemById 1768) and the four `pending.length = 0` sites (2738/2749/2773/2859) are correct, so R3-01 is resolved.

**Concerns.**
- MEDIUM. Router signature contradicts itself (X2): :28 and :155 say `(ctx, subscribers)`, but :39 and :212 (artifacts) say `createEventRouter(subscribers)`.
- LOW. Two names for the order table (`EVENT_SUBSCRIBER_ORDER` and `EVENT_KIND_SUBSCRIBER`). Both are used, but the artifacts list only one of them with a clear purpose.

**Suggestions.** Fix the artifact lines. Use the same signature in 08-15.

**Risk.** MEDIUM (185k estimate; event order is a regression hazard, and the plan covers it with pinned tests).

### 08-11

**Summary.** The world step: stepWorld after stepFlight, id-ordered passes, queued AI events, per-tick sanitising, reserved SimEvent kinds.

**Strengths.** `git diff --quiet 5b189e4 -- src/sim/flight` keeps the flight step unchanged, and 5b189e4 exists in the repo. The reserved list has 15 kinds, consistent with the ARCHITECTURE §7.6 names in the plan. The `MAX_SAVE_POSITION_MAGNITUDE` clarification (:162) is present. Repair counting is pinned per field.

**Concerns.**
- MEDIUM. Duplicate constant ownership (X3): :45 and :277 (sanitize.ts) provide `MAX_SNAPSHOT_STRING_LENGTH`, `MAX_SNAPSHOT_PARAM_LENGTH` and `MAX_AI_PARAMS_KEYS`, and 08-13:107 exports the same names from snapshot.ts. Define them once.
- LOW. `MAX_ENTITY_MAGNITUDE` (1e12, here) and `MAX_SNAPSHOT_MAGNITUDE` (1e12, in 08-13) have the same value under two names. Make one an alias of the other.
- LOW. depends_on omits 08-07 (X4).

**Suggestions.** Single owner for all limits, imported by 08-13.

**Risk.** MEDIUM (140k estimate; field-complete sanitiser is wide).

### 08-12

**Summary.** Split step 9: frame loop, start-up wiring, and the facade; frame-order and dispose-order tests; verify-full on a worktree.

**Strengths.** The facade export set (9 names) matches game-session.ts:219-335. The listener registrations at game-session.ts:2268 and :2289 carry `signal: uiController.signal`, and the plan's acceptance checks that count against it, so R3-01 is resolved. The pinned-literal audit is a concrete gate.

**Concerns.**
- LOW. `wc -l < src/app/game-session.ts` below 600 is a target not tied to a rule. A facade that fails only on size would be a false failure. Keep it as a note, not a gate.
- LOW. Task 2 read_first (08-12-PLAN.md:153) points at `tests/app/dispose.test.ts` near line 687 "where codebase-memory reported parse_partial". That is a tool artifact, not a verified reference. Replace with a `rg` check.
- LOW. Worktree path, as in 08-06.

**Suggestions.** Drop the parse_partial reference.

**Risk.** MEDIUM (165k estimate; widest split step).

### 08-13

**Summary.** Snapshot codec with a 1,000-tick live-versus-restored equality, a rejection table, and edge cases.

**Strengths.** The round-trip equality is non-vacuous (the test asserts equality at the final tick). The Round 3 items are present: the quaternion tolerance rows (:133), the anti-alias test (:138), restoreWorld through parseWorldSnapshot (:202), and the `.slice()` wording at :107. The rejection table is large and each case has a named reason.

**Concerns.**
- MEDIUM. Duplicate constants (X3): :107 exports `MAX_SNAPSHOT_STRING_LENGTH`, `MAX_SNAPSHOT_PARAM_LENGTH`, `MAX_AI_PARAMS_KEYS` and `MAX_SNAPSHOT_MAGNITUDE`. Import them from the single owner instead.
- LOW. `structuredClone` is used in tests to clone the player (:22). That is fine under tsconfig.sim (src/sim is not affected), but state that it is test-only.

**Suggestions.** Import the caps.

**Risk.** MEDIUM (135k estimate; the codec must match the entity hash field for field).

### 08-14

**Summary.** `?test=1&clock=manual`: flags read once, manual frame loop, `advanceTicks(n)` on the driver.

**Strengths.** `MAX_ADVANCE_TICKS = 200_000` agrees with 08-16's "integer 1..200000". The prohibition (advanceTicks taints before the first step so no durable save is written) is explicit and tested.

**Concerns.**
- LOW. Task 1 step 6 says "game-session.ts (or wherever plan 08-12 builds the driver's deps)". Name the file. The same hedge appears in 08-16-PLAN.md:127.
- LOW. Estimate exactly at the 100k budget, so no accepted-risk note is needed.

**Suggestions.** Name the file.

**Risk.** LOW.

### 08-15

**Summary.** Integration: world lifecycle, the launch, arrival and Load bump points, the anchored-save check, and the decision record.

**Strengths.** The anchored-save test now uses the `SaveInputs` object, and its 14-key allow-list matches `SaveInputs` in src/persistence/save.ts:301-320 exactly, so R3-02 is resolved. `populateNothing` is explicit and scoped to Phase 8. The `begin` guards (`epoch < 0xffffffff`, finite marketSeed) keep `worldSeedFor` from throwing.

**Concerns.**
- MEDIUM. Router signature (X2): :105 says `createEventRouter(subscribers)`, but :130 says `createEventRouter(ctx, subscribers)`.
- LOW. The R2-04 ledger entry at :297 still quotes `snapshotForSave(inputs)`, which R3-01 superseded. Annotate it as superseded so the ledger does not contradict the body.
- LOW. The must-have at :33 ("populate runs ... in both traffic modes") depends on `populateNothing`. Say that it spawns nothing in both modes, so the statement is checkable.

**Suggestions.** Fix the router line. Annotate the superseded ledger line.

**Risk.** HIGH (integration across eight files in three layers, at wave 8, with a ten-line invariant set). The triage found only text issues.

### 08-16

**Summary.** The one deliberate probe commit: `probe.sim`, `worldHash`, `advanceTicks`, the fixture update, browser and Vitest hash parity, and the decision record.

**Strengths.** `probe.sim` is published only inside `if (currentState !== undefined)` and is a fresh plain object. Writes to `probe.sim` are tested not to affect the live world. `entities` is read through `liveEntityCount`, and there is no `.store` access from src/app. The subtractive diff check is documented with a script. Parity is asserted for the same ticks in browser and Vitest.

**Concerns.**
- HIGH. `advanceTicks` is optional and undefined outside the manual clock (X1; 08-16-PLAN.md:126, :221). This conflicts with 08-01-PLAN.md:27 and :153 and with the subtractive check, which expects `test.advanceTicks` added in `testHookDocked`. Choose one behaviour and update all three.
- LOW. Hedge "game-session.ts (or wherever plan 08-12 builds the publisher's deps)" at :127. Name the file.
- LOW. The fixture grows from six to seven states (`testHookManualDocked`, :128 and :140). That is an addition, so it is covered by D-13's "adds fields" rule, but the commit must name it, which the plan does.

**Suggestions.** Make `advanceTicks` always a function and make it throw or no-op when not under the manual clock. Then the fixture and the subtractive check hold without changes to 08-01.

**Risk.** MEDIUM.

---

### Overall

Verdict: NEEDS REVISION. Required text fixes before Wave 1 starts, or before Wave 8 for the items that touch its plans:
1. X1: make `advanceTicks` always a function (08-16:126, :221), or revise 08-01:27 and 08-16's subtractive check.
2. X2: one `createEventRouter` signature in 08-10 (:39, :212) and 08-15 (:105).
3. X3: one owner for the caps, defined in 08-05 and imported by 08-11 and 08-13.
4. Smaller items: X4 (08-11 depends_on), the superseded ledger line at 08-15:297, the file hedges in 08-14:123 and 08-16:127, and the tool-artifact reference in 08-12 Task 2.

---

## Consensus Summary

Six source-grounded specialist reviewers ran as Claude subagents at commit `0aa747a`: `reviewer-architect-opus`, `reviewer-correctness-opus`, `reviewer-algorithm-opus` and `reviewer-adversarial-opus` on Claude Opus 5.5, `reviewer-context-sonnet` on Claude Sonnet 5.5, and `reviewer-triage-haiku` on Claude Haiku 5.5. They reviewed all 16 Phase 8 plans (`08-01` through `08-16`). Every review has its own section for every plan id. `reviewer-context-sonnet` reports that it did not read all of the plan text in full; it traced the Round 3 items and cross-cutting concerns against source. Its READY verdict is weighted accordingly.

All six reviewers confirmed that **every Round 3 consensus item** (the `08-05`/`08-11`/`08-13` domain alignment, the `08-15` `snapshotForSave(inputs)` call, the `08-16` `createTestHook` signature, the `MAX_SAVE_POSITION_MAGNITUDE` citation, and the guard/test precision items) is resolved in the plan text of `0aa747a`. `reviewer-context-sonnet` additionally notes that the Round 3 consensus text described `worldHash` as returning `number`, while `hashFlight` returns a string. The `08-16` plan is correct and the consensus text was wrong.

Verdicts: five of six reviewers returned **NEEDS REVISION** (architect, correctness, algorithm, adversarial, triage); `reviewer-context-sonnet` returned **READY**. Every new finding is a targeted text edit to a plan. No reviewer found a wave-ordering problem, a same-wave file-ownership conflict, an import cycle, or a Three.js/DOM import into `src/sim`.

### Agreed Strengths

- **Round 3 is fully closed.** All six reviewers traced the Round 3 dispositions to concrete plan text and source anchors (e.g. the `SaveInputs` key allow-list against `src/persistence/save.ts:301-320`, `MAX_SAVE_POSITION_MAGNITUDE = 1e9` at `src/persistence/save.ts:123`, and the single `createTestHook` call site at `src/app/game-session.ts:1035`).
- **Sound wave graph and layering** (architect, context): disjoint same-wave file ownership, no cycles, and the `src/sim` purity boundary holds across all 16 plans.
- **Low blast radius on v1 play** (context, correctness): only two existing tests read `game-session.ts` as text, and both are re-pointed in `08-01`. The `test:e2e:fast` change is paired with its pinned contract test. `fast-check` is already a devDependency, so no CHANGELOG or NOTICE entry is needed.

### Agreed Concerns

#### Priority 1 — Acceptance criteria that cannot pass, or pass vacuously (fix before executing the owning plan)

1. **HIGH (`08-13` Task 2, `08-13-PLAN.md:140`; `08-05-PLAN.md:134`; `08-11-PLAN.md:167`) — NaN in `ai.params` cannot be "rejected after JSON"** *(correctness HIGH 2, algorithm HIGH 1, adversarial HIGH 1)*. `JSON.stringify` turns `NaN` into `null`, and `null` (and `boolean`) is a legal `ParamValue` that the sanitizer preserves. After a JSON round trip, a NaN scalar param and a legal `null` param are identical, so the converse test cannot pass as written. The `fast-check` generator never produces `null` or `boolean` params, so a codec that wrongly rejects valid worlds would also stay green. The algorithm reviewer confirmed this in the test container. **Fix:** make `snapshotWorld` refuse non-finite numbers itself (before serialization). Limit the post-JSON rejection row to a NaN inside a param array, or drop it. Add `null` and `boolean` params to the generator.

2. **HIGH (`08-16` Task 2, `08-16-PLAN.md:143`) — the `rg -n "world/store|\.store\b" src/app` gate can never print nothing** *(correctness HIGH 1, architect HIGH 1; verified by the orchestrator)*. `\.store\b` already matches the save store at `src/app/game-session.ts:1167`, `:1341`, `:1490` and `:3345` (`saveBoot.store`), and that code moves into the session modules in `08-08`/`08-12`. **Fix:** narrow the gate to `sim/world/store` imports and `world\.store` reads, or use an ESLint `no-restricted-imports` ban.

3. **HIGH (`08-16-PLAN.md:126` vs `08-01-PLAN.md:27`) — `test.advanceTicks` is `undefined` outside the manual clock** *(triage X1; verified by the orchestrator)*. `08-01`'s probe-shape spec requires every `probe.test` method to read as `"function"` in docked `?test=1`, and `08-16`'s subtractive fixture check builds on it. **Fix:** keep `advanceTicks` always a function (refusing or no-op outside manual-clock mode), or revise the `08-01` and `08-16` shape contracts together.

#### Priority 2 — Validator domain alignment (finish the Round 3 work)

4. **MEDIUM (`08-05`, `08-11`, `08-13`) — the shared limits are defined three times** *(architect MEDIUM 2, correctness MEDIUM 3, triage X3)*. `MAX_ENTITY_MAGNITUDE (1e12)`, `MAX_SNAPSHOT_STRING_LENGTH (128)`, `MAX_SNAPSHOT_PARAM_LENGTH (64)` and `MAX_AI_PARAMS_KEYS (32)` are written inline in `world.ts` (`08-05`, Wave 2) and exported again from `sanitize.ts` (`08-11`) and `snapshot.ts` (`08-13`). **Fix:** create one `src/sim/world/limits.ts` owned by `08-05`, imported by the other two.

5. **MEDIUM-HIGH (`08-05`, `08-11`, `08-11-PLAN.md:126`) — enum fields are neither checked at spawn nor repaired by the sanitizer** *(architect MEDIUM 3, adversarial MEDIUM-HIGH 2)*. `kind`, `scanClass`, `nav.behaviour` and `ai.aiKey` are rejected by `parseWorldSnapshot` when unknown, so `08-11`'s "every sanitized world parses" truth is overstated. AI dispatch `registry[ai.aiKey].think(ctx)` has no own-key check, so an `aiKey` such as `"constructor"` throws a `TypeError` inside the fixed step. **Fix:** validate these four at `spawnEntity`, repair or kill them in `sanitizeEntity`, and dispatch through `Object.hasOwn(registry, aiKey)`.

6. **MEDIUM (`08-05-PLAN.md:137`, `08-11-PLAN.md:163`, `08-13-PLAN.md:26,140`) — quaternions that pass spawn or sanitize can still fail the parser** *(algorithm MEDIUM 2, correctness LOW)*. `spawnEntity` accepts non-unit quaternions without normalizing them. The sanitizer's normalize of a tiny-norm quaternion is inaccurate: `{w: 1e-160}` comes out with `normSq ≈ 1.0000111`, measured with the real `normalize`, which is outside the parser's `1e-9` tolerance. This gives the 200-run property a real counterexample and makes sanitize non-idempotent. **Fix:** treat a norm below a threshold as degenerate (reset to identity), re-check after normalizing, and require unit quaternions at spawn.

7. **MEDIUM (`08-05-PLAN.md:137`, `08-13-PLAN.md:26`) — `worldSeed` is never checked as a uint32** *(algorithm MEDIUM 3, adversarial MEDIUM)*. The hash canonicalizes `1.5` to `"2"` while `forkSeed` truncates it to `1`, so seeds `1.5` and `2` hash identically but produce different streams. **Fix:** validate `worldSeed` as an integer in `0..0xffffffff` at world creation and in `parseWorldSnapshot`.

#### Priority 3 — Targeted warnings

8. **MEDIUM (`08-10-PLAN.md:28,212` vs `:155`; `08-15-PLAN.md:105,130`) — the `createEventRouter` signature contradicts itself** *(triage X2, architect LOW; verified by the orchestrator)*. The task body says `createEventRouter(ctx, subscribers)`, but the `provides`/artifact lines say `createEventRouter(subscribers)`. Align them on `(ctx, subscribers)`.

9. **MEDIUM (`08-09`, `08-02`, `08-03`) — lint guard gaps** *(adversarial MEDIUM, correctness LOW)*. The AI zone can import `createSeededRandom` from `src/sim/math.ts:227` under an alias, which defeats the text scan. Nothing bans module-level mutable state in AI modules. The `src/sim` lint lacks `no-eval`, `no-new-func` and the `localeCompare`/`Intl` bans that the generator zone already has (`eslint.config.js:208-241`). The computed `sort["call"]` form is not covered either. Use `no-restricted-imports` with `importNames` for the math seam, and copy the generator-zone rules.

10. **MEDIUM (`08-13`) — the restore check is a rounded-hash comparison** *(algorithm MEDIUM, adversarial MEDIUM)*. The 1,000-tick live-versus-restored check compares hashes rounded to `1e-6` (`src/sim/hash.ts`). Also compare `JSON.stringify(snapshotWorld(world))` exactly at each checkpoint.

11. **MEDIUM (`08-11`) — the AI event drain limits passes, not deliveries** *(algorithm MEDIUM)*. With a fan-out handler the work grows as `N·f^8`. Add a total-deliveries cap per tick.

12. **MEDIUM (`08-07-PLAN.md:113`) — `ShipControl` accepts values outside the shared limits**, which the sanitizer then silently zeroes *(adversarial MEDIUM, architect LOW)*. Clamp or refuse them at the control seam, using the shared limits from item 4.

13. **MEDIUM (`08-12`, `08-15`) — no Firefox run** *(context MEDIUM)*. `rg` finds no `e2e-cross` in any plan, although `08-12` rewrites the frame loop and the `window.addEventListener` wiring, and `08-14` adds a manual-clock path. Record a non-blocking `docker compose run --rm e2e-cross` run at the `08-12` gate and after `08-15` in the SUMMARY.

14. **LOW** — `08-08`/`08-12`: the new `disposed` guards and the `swapSystem` rAF tracking go beyond a verbatim move; record them as deliberate deviations (correctness). `08-15`: allow a best-of-N rerun for the microbenchmark threshold (1.2x plus 2 µs) (context). Plan line anchors into `game-session.ts` go stale after each extraction; executors should locate code by pattern (context).

### Divergent Views

- **READY vs NEEDS REVISION.** `reviewer-context-sonnet` judged the set READY; it did not read all plan text and did not examine the `ai.params`, `.store` gate or `advanceTicks` contracts. The other five returned NEEDS REVISION. Items 1–3 were each found by at least one Opus reviewer, and items 2 and 3 were checked directly against source by the orchestrator, so the NEEDS REVISION verdict stands.
- **How to fix the NaN `ai.params` contradiction.** The algorithm reviewer prefers `snapshotWorld` to refuse non-finite values. The correctness reviewer accepts either that or narrowing the test row to array elements. The adversarial reviewer stresses adding `null`/`boolean` to the generator. These are compatible: do all three.
- **Scope of the enum-field fix.** The architect allows narrowing `08-11`'s claim as an alternative. The adversarial reviewer treats the `registry[aiKey]` dispatch as a fixed-step crash, which needs the own-key check regardless.
- **Resolution.** None of the findings affect Wave 1 (`08-01`..`08-04`) except the `08-01`/`08-16` `advanceTicks` shape contract (item 3) and the `08-03` lint residuals (item 9). Items 1–13 are text edits to `08-05`, `08-07`, `08-09`, `08-10`, `08-11`, `08-12`, `08-13`, `08-15` and `08-16` and do not change any wave or dependency.
