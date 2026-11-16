# Phase 8 Plan Review, Round 5: Architecture lens (reviewer-architect-opus)

Commit reviewed: `afc4fe0`. Lens: module boundaries, layering (`src/sim` free of Three.js and the DOM), wave and dependency order, same-wave file ownership, contracts and signatures between plans, and whether the 16 plans together deliver the Phase 8 goal.

Method: I read the frontmatter (`must_haves`, artifacts, key_links), the `<interfaces>` blocks and the relevant task text of every plan. I then checked the claims against source: `eslint.config.js:67-160`, `src/sim/math.ts:227-237`, `src/sim/flight/step.ts:122-128`, `src/sim/flight/controller.ts:14-17`, `src/app/probe.ts:390-395`, `src/app/game-session.ts:1035,1167,1341,1490,2805-2840,3345`, `src/content/types.ts:20`, `src/sim/hyperspace/countdown.ts:63`, `src/sim/dock/geometry.ts:70`, `tests/helpers/lave.ts:13-54`, `compose.yaml:46,66` and `package.json:19-44`. I also confirmed that `5b189e4` is an ancestor of HEAD and that `src/`, `tests/`, `eslint.config.js` and `package.json` have no diff between `5b189e4` and `afc4fe0`, so every source anchor in the plans is still valid for Wave 1. No file in the repository was modified.

## Round 4 consensus items

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | NaN in `ai.params` cannot be rejected after JSON | **Resolved** | `08-13-PLAN.md:23`: `snapshotWorld` throws `SnapshotError("non-finite")` for any non-finite leaf, including a scalar param, *before* serialization. `08-13-PLAN.md:24`: the generator produces `null`/`boolean` scalars, and the converse is limited to where it can be decided. `08-05-PLAN.md:148`: one `ParamValue` domain (null/boolean legal, non-finite never legal), shared by all three validators. |
| 2 | `.store\b` gate can never pass | **Resolved** | `08-16-PLAN.md:146` narrows the gate to `sim/world/store\|world\??\.store\b\|\.store\??\.(live\|get\|allocate\|kill\|commit\|nextId)\b\|\bEntityStore\b`. I ran this regex against current `src/app`: it exits 1. The four `saveBoot.store` sites (`game-session.ts:1167,1341,1490,3345`) call `read`/`clear`/`dispose`/`queueAutosave(saveBoot.store…)`, and none of these is in the method list. |
| 3 | `advanceTicks` undefined outside the manual clock | **Resolved** | `08-16-PLAN.md:30,128`: a required member of `WegoliteSimTestHook`/`WegoliteTestHook`, always copied, and the driver refuses outside the manual clock. `08-16-PLAN.md:143`: the fixture check requires `"function"` in both hook states. `08-14-PLAN.md:274` records that 08-14 adds no hook member. |
| 4 | Shared limits defined three times | **Resolved** | `08-05-PLAN.md:31,45,146`: `src/sim/world/limits.ts` (no imports) is the single owner. Importers: `08-07-PLAN.md:90,175`, `08-11-PLAN.md:47,62,111,202`, `08-13-PLAN.md:34,45,91`. Each one gates "never declare or re-export". |
| 5 | Enum fields unchecked at spawn and sanitize; prototype dispatch | **Resolved** | Spawn: `08-05-PLAN.md:30,153` (`includes` over ENTITY_KINDS/SCAN_CLASSES/AI_KEYS). Sanitize: `08-11-PLAN.md:32,185` (unknown kind → dead, scanClass → CLASS_NOT_SET, behaviour → IDLE, aiKey → `ai = null`). Dispatch: `08-11-PLAN.md:35,62` (`Object.hasOwn(registry, aiKey)`). |
| 6 | Quaternions that pass spawn or sanitize but fail the parser | **Resolved** | `08-05-PLAN.md:146` (`MIN_QUAT_NORM_SQ = 1e-12`, `QUAT_UNIT_TOLERANCE = 1e-9`) and `:157` (spawn requires a unit quaternion). `08-11-PLAN.md:32,178` (degenerate → identity; renormalise then re-check). `08-13-PLAN.md:26` (the parser uses the same tolerance). |
| 7 | `worldSeed` never checked as uint32 | **Resolved** | `08-05-PLAN.md:32,151` (`createWorld` throws `RangeError` outside `0..MAX_UINT32`). `08-13-PLAN.md:26` (the parser rejects 1.5, -1, 2**32 and null). |
| 8 | `createEventRouter` signature contradicts itself | **Resolved** | `08-10-PLAN.md:40,158,219` and `08-15-PLAN.md:108,133` now all read `createEventRouter(ctx, subscribers)` with `ctx` required. |
| 9 | Lint guard gaps (alias of `createSeededRandom`, module state, eval/Intl/localeCompare, computed sort) | **Resolved** | `08-03-PLAN.md:139-142` (Round 4 selectors live inside `SIM_SYNTAX_BANS`, so the AI blocks, which spread that constant, inherit them; `no-eval`/`no-new-func`/`no-implied-eval` are separate rules that the AI blocks never redefine). `08-09-PLAN.md:30,192-194` (`paths`+`importNames` ban; `AI_MODULE_STATE_BANS`). `08-02-PLAN.md:29` (import-aware source scan). |
| 10 | Restore check is a rounded-hash comparison | **Resolved** | `08-13-PLAN.md:22`: exact `JSON.stringify(snapshotWorld(…))` equality plus `toStrictEqual` players at every checkpoint. |
| 11 | AI drain bounds passes, not deliveries | **Resolved** | `08-11-PLAN.md:30,43,171`: `MAX_AI_EVENTS_PER_DRAIN (4096)` and `MAX_AI_QUEUE_LENGTH (4096)`, with drops counted in `aiDropped`. |
| 12 | `ShipControl` accepts out-of-domain values | **Resolved** | `08-07-PLAN.md:30,117,175`: every write is checked against `limits.ts`; `perform` uses `includes`. |
| 13 | No Firefox run | **Resolved** | `08-12-PLAN.md:123,137` (step-9 worktree) and `08-15-PLAN.md:36,216,232`. Both are non-blocking and recorded in the SUMMARY. `compose.yaml:66` defines `e2e-cross`. |
| 14 | Deviations from a verbatim move, best-of-N, stale anchors | **Resolved** | `08-08-PLAN.md:146,260` and `08-12-PLAN.md:266` (deliberate-deviation SUMMARY sections). `08-15-PLAN.md:39,214` (best of 3 attempts, threshold unchanged). The executor briefs in 08-04/06/08/10/12 say to locate code by pattern (`08-04:262`, `08-06:260`, `08-08:261`, `08-10:280`, `08-12:267`). |

All 14 Round 4 consensus items are resolved in the plan text.

## Cross-cutting architecture verification

**Wave and dependency graph.** Each plan's wave is one more than the highest wave among its `depends_on`. Edges: 01→04, {02,03}→05, 04→06, 05→07, 06→08, {07,03}→09, 08→10, 09→11, 10→12, 11→13, 12→14, {14,11,13}→15, 15→16. The graph has no cycles. The split track (01→04→06→08→10→12→14) and the core track (02/03→05→07→09→11→13) join only at 08-15, as D-14 requires ("plugged in at one point … after split step 8").

**Same-wave file ownership.** I compared the `files_modified` sets wave by wave and found no overlap:

- W1: 01 = tests/, package.json; 02 = rng/math/PROJECT.md; 03 = eslint/guards.
- W2: 04 = app/session; 05 = sim/world, sim/ai/types, PROJECT.md.
- W3: 06 = app; 07 = sim/world view/control.
- W4: 08 = app; 09 = sim/ai, eslint, guards.
- W5: 10 = app; 11 = sim/world, sim.ts, events.ts, PROJECT.md.
- W6: 12 = app; 13 = snapshot.ts, tests.
- W7 to W9 each hold a single plan.

Shared files are always edited in different waves: `PROJECT.md` (W1, W2, W5, W8, W9), `eslint.config.js` (W1, W4), `context.ts`/`game-session.ts` (W2 through W9), `session-order.test.ts` (W5 through W8). The one same-wave semantic coupling is 08-10/08-11 over `SimEvent`. It is defused by the `RoutedKind` + `isRoutedKind` design (`08-10-PLAN.md:33`). I confirmed that no exhaustive `never` check over `SimEvent` exists in `src` (`rg ": never =|assertNever"` finds nothing), so widening the union cannot break `src/app`.

**Layering.**
- `src/sim` purity is enforced by the existing zone (`eslint.config.js:71-157`) plus 08-03's bans.
- The AI zone's `no-restricted-imports` *replaces* the sim block's list for AI files. The allow-list regex is strictly narrower (it rejects `three`, `**/app/**` and the other banned paths), so nothing is lost.
- Import directions:
  - `world/entity.ts` → `ai/types.ts` → `world/ids.ts` (no imports) plus type-only `world/view.ts`/`control.ts` → `ids`/`math`.
  - `world/step.ts` → `ai/registry.ts` → `pilots/test-pilot.ts` → type-only `world/view`/`control`.
  - None of these closes a cycle. `math.ts` → `rng.ts` is one-way, and 08-09's seal test (`08-09-PLAN.md:197`) pins it.
- In `src/app`, `world-lifecycle.ts` and `step-options.ts` stay Node-importable through a durable guard (`08-15-PLAN.md:38,136`). Their dependencies resolve inside `src/sim` or to a type-only `src/content/types.ts` (`witchspaceStationMass` at `src/sim/hyperspace/countdown.ts:63`, `DockGeometry` at `src/sim/dock/geometry.ts:70`, `System` re-exported at `src/content/types.ts:20`).
- `tests/helpers/tick-script.ts` needs `PlayerController`/`ScriptedLaunchController`, which are in `src/sim/flight/controller.ts:74,92` (imports only `../math.js`, `../state.js`, `./state.js`). The Playwright-import precondition holds.

**Contracts.**
- `createTestHook(state, scenes, onMutate, profile, sim)`: 08-16 rewrites `profile?` as `profile: … | undefined` (`08-16-PLAN.md:128`), which avoids TS1016 ("a required parameter cannot follow an optional parameter"). `rg -ln createTestHook src tests` finds only `probe.ts` and `game-session.ts`, so there is a single call site to update.
- `stepSim(player, world | undefined, …)` is the same in 08-11, 08-13 and 08-15.
- `launched` is pushed at the start of the launch (`src/sim/flight/step.ts:124-126`). The world is therefore created by the router *after* the launch step and first stepped on the next tick. 08-15 documents this ("one-tick latency", `08-15-PLAN.md:130,145`), and 08-16 requires the replay to mirror it.
- `SessionRuntime.testFlags` gets a default in `createSessionState` (`08-14-PLAN.md:119`), and `worldLifecycle` starts as `undefined` (`08-15-PLAN.md:131`). Test fakes built through `createSessionState` keep typechecking.

**Goal coverage.**
- SC1/FOUND-10: 08-01 (probe-shape snapshot, re-pointed scans) and 08-04/06/08/10/12 (steps 1-9 with verify-full at 3, 6 and 9).
- SC2/FOUND-11: 08-02 (pinned flight hashes), 08-05 (ids, store, hash identity) and 08-11 (id-order pass).
- SC3/FOUND-12: 08-03 (lint) and 08-13 (1,000-tick exact restore).
- SC4/FOUND-13: 08-07 (seam) and 08-09 (pilot plus AI zone).
- SC5/FOUND-14: 08-14 (manual clock), 08-15 (lifecycle, traffic flag) and 08-16 (hook, parity).

Every criterion has an owning plan and a gate.

## New findings (Round 5)

Every finding is LOW or LOW-MEDIUM. None blocks execution.

- **A5-1 (LOW-MEDIUM): the lifecycle reactions are written three times, and only one copy is checked against the real session.**
  - The world lifecycle reactions (launch → `begin`, dock → `end`, arrival → `begin` inside the install block, restore → `resetForRestore`/`resume`) live in:
    1. the real session: `event-router.ts`, `hyperspace-controller.ts`, `save-controller.ts` and `start-session.ts` (08-15);
    2. `tests/helpers/tick-script.ts` (08-16, `08-16-PLAN.md:163`);
    3. the test-local lifecycle in 08-13's `world-cadence.test.ts` (`08-13-PLAN.md:190`, "keeps its own lifecycle state in the test").
  - Only (2) is checked against (1), by `tick-parity.test.ts`, and only at a single cadence.
  - The populated-world cadence proof (08-13) never runs through the real driver/router path. 08-13 cannot import `createWorldLifecycle` (it is created two waves later), so this is a consequence of the ordering, not an error. The result is that, at Phase 8 exit, no test steps a non-empty world through the real `createSimDriver` → `stepSim` → router → lifecycle chain.
  - The `Populate` seam (`08-15-PLAN.md:130`, `createWorldLifecycle({ traffic, populate })`) makes this cheap to close.
  - **Suggestion (08-16 Task 2, optional):** add one Vitest case to `tick-parity.test.ts`:
    - inject a `populate` that spawns two or three test pilots;
    - drive the real driver once via `advanceTicks(601)` and once via `advanceFrame` at 30 Hz and 144 Hz frame deltas (manual clock off);
    - assert equal `hashWorld` and equal `snapshotWorld` JSON.
  - This would be the first proof through the session path that a populated world is deterministic, and it would retire the 08-13 mirror as the only cadence proof before Phase 12 relies on it.

- **A5-2 (LOW): the uint32 bound is still spelled as a literal outside the one-owner zone.** The Round 4 "single owner" rule (`08-05-PLAN.md:31`) gates only `src/sim/world` and `src/sim/ai`. The bound is still written as a literal in:
  - `src/sim/rng.ts` (08-02, `08-02-PLAN.md:193`). This is unavoidable, because 08-02 is in Wave 1 and `limits.ts` does not exist yet.
  - `src/app/session/world-lifecycle.ts` (`epoch < 0xffffffff`, `08-15-PLAN.md:130`).

  **Suggestion:** have `world-lifecycle.ts` import `MAX_UINT32` from `src/sim/world/limits.js`. The Node-importable guard allows `src/sim` imports, so this costs nothing and keeps the begin, restore and parser domains on one constant. Optionally add a comment in `limits.ts` noting that `rng.ts` predates it and uses the same literal.

- **A5-3 (LOW): a declared exception to the D-14 core ownership.** 08-15 lists `src/sim/world/step.ts` as conditionally modified (`08-15-PLAN.md:17`), which crosses D-14's core-track ownership of `src/sim/world/**`. It is harmless for ordering: Wave 8 holds one plan and the core track finished in Wave 6. However, the remedy (an empty-world fast path) would change `stepWorld` after 08-11/08-13 proved it.
  - verify-full reruns those unit tests, so correctness is covered.
  - **Suggestion:** if the remedy fires, require the SUMMARY to record it as a D-14 deviation and to name the 08-11/08-13 test files that passed on the edited tree.

- **A5-4 (LOW, informational): the test pilot ships in the production bundle.** `world/step.ts` imports `AI_REGISTRY` as its default registry (`08-11-PLAN.md:62`), so the scripted test pilot is in the production bundle even though only tests reach it (`08-09-PLAN.md:35`). This matches D-11 ("a real AI module", reused by Phase 13) and is structurally guarded (no `src` file outside `src/sim/ai` names it). No change needed; it is noted so that Phase 12's populator plan does not treat the registry's contents as spawnable roles.

## 08-01

**Summary:** Split safety nets: a six-state probe-shape snapshot added to `test:e2e:fast`, an order-independent session-source helper with the two text-reading tests re-pointed at it, and a verify-full baseline taken on a detached worktree of `5b189e4`.
**Strengths:**
- The probe-shape contract states that every `probe.test` member reads `"function"` (`08-01-PLAN.md:28`). 08-16 now honours this without revising it (R4-3).
- The baseline runs on an isolated worktree under its own Compose project (`:34`), so it is independent of Wave 1 siblings.
- `package.json:20` is the only script changed, and its contract test is in the same plan.

**Concerns:** None new.
**Suggestions:** None.
**Risk:** LOW.

## 08-02

**Summary:** Pinned v1 flight hashes and RNG vectors; `rng.ts` with a plain-integer `RngState`, `mix32`, `worldSeedFor` and `forkSeed`; `createSeededRandom` delegates to it with an identical sequence; an import-aware source scan.
**Strengths:**
- `math.ts` → `rng.ts` is one-way, and 08-09's seal test pins it.
- `arrival.ts` and the render callers stay byte-identical, which protects the arrival goldens. The closure at `src/sim/math.ts:227-237` matches the interface text exactly.
- `autonomous: false` with a blocking checkpoint correctly gates the one-way D-02 arithmetic before any consumer exists.

**Concerns:**
- LOW: the `0xffffffff` literal in `rng.ts` duplicates the later `MAX_UINT32`. This is unavoidable in Wave 1 (A5-2).

**Suggestions:** None required.
**Risk:** LOW (gated by the human checkpoint).

## 08-03

**Summary:** Determinism lint bans in `src/sim` (named constants spreadable by later blocks), probe infrastructure, the stronger `sim-purity` scan, and the entity-id-scope guard from Wave 1.
**Strengths:**
- All Round 4 selectors are placed inside `SIM_SYNTAX_BANS` (`08-03-PLAN.md:139-142`). Because ESLint *replaces* a redefined rule (Pattern 8), placing them anywhere else would have silently dropped them from 08-09's AI blocks.
- `no-eval`, `no-new-func` and `no-implied-eval` are separate rules that the AI blocks never redefine.
- The entity-id-scope guard is in place before `ids.ts` exists.

**Concerns:** None new.
**Suggestions:** None.
**Risk:** LOW.

## 08-04

**Summary:** Split steps 1-2: the typed `SessionState`/`createSessionState`, and the probe publisher.
**Strengths:**
- One context object with live reads at call time (G-8).
- An exact facade export set is pinned.
- No probe-publisher call site moves, which is gated by neighbouring statements.

**Concerns:** None new. Later plans (08-14, 08-15) add fields with defaults in `createSessionState`, so test fakes built through it stay valid.
**Suggestions:** None.
**Risk:** LOW.

## 08-05

**Summary:** World foundation: `ids.ts`, `limits.ts` (single owner), `ai/types.ts`, entity, store, world, and serialization/hash with empty-world identity to `hashFlight`.
**Strengths:**
- `limits.ts` has no imports and is the only definition site, so all four validators (spawn, control, sanitize, parser) share one domain.
- `ai/types.ts` imports only `world/ids.js` (`:148`), so `entity.ts` → `ai/types.ts` cannot form a cycle.
- `StaticEntity` holds `layoutKey` only, which keeps `SystemLayout` the single authority (D-07).
- The binary-search store has no Map or Set.

**Concerns:** None new.
**Suggestions:** None.
**Risk:** LOW-MEDIUM (130k estimate over budget, accepted by the owner).

## 08-06

**Summary:** Split steps 3-4: render driver, chart and settings controllers; verify-full at step 3.
**Strengths:**
- The single gated `renderFrame(alpha, shouldDraw())` call is preserved and pinned by the re-pointed redraw-gate scan.
- The listener totals are tied to `git grep` at the step SHA (R4 triage fix).

**Concerns:** None new.
**Suggestions:** None.
**Risk:** LOW.

## 08-07

**Summary:** AI seam: type-only `WorldView`/`ShipControl`, plus implementations that read static geometry from the layout at call time and validate writes against `limits.ts`.
**Strengths:**
- `view.ts` and `control.ts` take only type imports from `./ids.js` and `../math.js` (`:110-111`). That makes them safe items on the AI allow-list, and 08-09's seal test pins it.
- The world never holds the `FlightState` (the player is passed per call).
- Exhaustive `Record<keyof …>` literals keep the seam narrow.

**Concerns:** None new.
**Suggestions:** None.
**Risk:** LOW.

## 08-08

**Summary:** Split steps 5-6: station and save controllers; verify-full at step 6.
**Strengths:**
- The new `disposed` guards are recorded as deliberate deviations (R4-14).
- `saveBoot.store` is kept verbatim, and the narrowed 08-16 gate no longer matches it.

**Concerns:** None new.
**Suggestions:** None.
**Risk:** LOW.

## 08-09

**Summary:** AI types (`AiContext`, `AiModule`, `AiEvent`), integer tick timers, a frozen registry, the scripted test pilot, and the recursive AI lint zone with allow-list regexes, the closure-RNG import ban and the module-state ban.
**Strengths:**
- The AI blocks spread `SIM_SYNTAX_BANS` and do not redefine the global, property or eval rules. All 08-03 bans therefore still reach the zone, and probes prove it (`:196`).
- The allow-list table is read from `calculateConfigForFile`, which pins the effective config rather than the source text.
- The seal test stops `ids`/`math`/`view`/`control` from becoming re-export bridges.

**Concerns:**
- LOW (A5-4): the pilot ships in production through the default registry. This is consistent with D-11.

**Suggestions:** None required.
**Risk:** LOW-MEDIUM (135k estimate, accepted).

## 08-10

**Summary:** Split steps 7-8: hyperspace controller (moved as one atomic unit), ordered event router, sim driver with `stepOnce`, and the pure `buildStepOptions`.
**Strengths:**
- `RoutedKind`/`isRoutedKind` makes the commit order with 08-11 irrelevant. I verified that no exhaustive switch over `SimEvent` exists in `src`.
- `step-options.ts` reproduces `game-session.ts:2814-2836` exactly (checked against the source), and its imports resolve inside `src/sim` or to a type-only `content/types`.
- The signature is now consistent (R4-8).

**Concerns:** None new.
**Suggestions:** None.
**Risk:** LOW.

## 08-11

**Summary:** `stepWorld` and `stepSim` (flight first, then world, skipped on the jump tick), the bounded FIFO AI queue held by the world, field-complete idempotent sanitize, own-key dispatch, and reserved `SimEvent` kinds.
**Strengths:**
- `stepSim` never mutates `FlightState` from the world side.
- The queue lives on `World`, so events die with their world.
- Lazy `WorldView` construction keeps the NPC-free hot path free of allocation.
- The no-step-on-`hyperspaceJumped` rule fits cleanly with 08-15's begin-in-install-block.

**Concerns:**
- LOW: Key Decisions labels are local to each plan (`row (d)` means the placeholder integrator here, `08-11-PLAN.md:107`, but per-world id scope in 08-05). Every cross-plan reference I found qualifies the plan (`08-15:216`, `08-16:31`, `08-03:60`), so this is not a defect. Executors should not copy the bare letters into `PROJECT.md`.

**Suggestions:** None required.
**Risk:** MEDIUM (155k estimate, accepted; the largest core plan).

## 08-12

**Summary:** Split step 9: frame loop and start-up wiring; the facade builds every module's deps; verify-full plus a non-blocking `e2e-cross` on the step-9 worktree.
**Strengths:**
- The facade remains the only public entry point, and later plans (08-14, 08-16) add late-bound deps only there.
- The rAF tracking deviation is recorded.
- Firefox now runs where the listeners move.

**Concerns:** None new.
**Suggestions:** None.
**Risk:** LOW-MEDIUM (frame-loop rewrite; gated by verify-full).

## 08-13

**Summary:** Snapshot codec (`snapshotWorld`/`parseWorldSnapshot`/`restoreWorld`), the 1,000-tick exact live-versus-restored equality, and the cross-cadence world hash with launch and arrival.
**Strengths:**
- Refusing non-finite values before JSON, together with exact JSON equality, closes R4-1 and R4-10.
- `restoreWorld` goes through the parser.
- `restoreWorld` keeps the stored `nextId`, which is correct for per-world scope.

**Concerns:**
- LOW-MEDIUM (A5-1): the cadence test uses a test-local lifecycle that is never checked against 08-15's real one. This is unavoidable in Wave 6.

**Suggestions:** Cross-reference A5-1. A follow-up case in 08-16 closes the gap.
**Risk:** LOW-MEDIUM.

## 08-14

**Summary:** Test flags parsed once, a manual-clock frame-loop branch, and `advanceTicks` on the driver sharing one drain path with `advanceFrame`; the probe shape is unchanged.
**Strengths:**
- One drain path for both entry points.
- The refusal rule has one owner (the driver), which 08-16 inherits.
- `testFlags` gets a default in `createSessionState`.
- Late-bound `markHookMutation` breaks the construction-order coupling between the publisher and the driver.

**Concerns:** None new.
**Suggestions:** None.
**Risk:** LOW.

## 08-15

**Summary:** The single integration: `stepOnce` calls `stepSim` with the live world; the world lifecycle (epoch bump points, `resetForRestore`, `resume`) is wired through the router, hyperspace, save and start-up; the anchored-save proof; a Node-importable guard; a step-cost benchmark.
**Strengths:**
- The world is read live on each step (gated against a factory-level alias).
- The lifecycle has no per-world state beyond `world`/`epoch`, so no id can cross worlds.
- Warm Load and cold Continue are proven equivalent in Node.
- The durable purity guard protects the Playwright Node runner.
- It does not edit `game-session.ts` (the router receives `ctx`).

**Concerns:**
- LOW (A5-2): `0xffffffff` is written inline in `world-lifecycle.ts` instead of importing `MAX_UINT32`.
- LOW (A5-3): the conditional edit to `src/sim/world/step.ts` crosses D-14 ownership.

**Suggestions:** Import `MAX_UINT32`. If the fast-path remedy fires, record the D-14 deviation and the re-proven 08-11/08-13 tests in the SUMMARY.
**Risk:** MEDIUM (155k estimate; it changes the runtime path of every flight; gated by verify-full plus Firefox).

## 08-16

**Summary:** One deliberate probe commit (`probe.sim`, `worldHash`, an always-present `advanceTicks`), the Node replay `tick-script.ts`, Vitest parity, the tick-hook browser spec, and the SC1/D-13 reconciliation in `PROJECT.md`.
**Strengths:**
- The `createTestHook` signature avoids TS1016 (`profile: … | undefined`), and the call site is unique (`src/app/game-session.ts:1035`).
- The narrowed store gate is verified to exit 1 on the current tree.
- `probe.sim` exposes only primitives.
- The criterion-5 scope is stated honestly: the browser world is empty.

**Concerns:**
- LOW-MEDIUM (A5-1): the replay and the session share `buildStepOptions`/`createWorldLifecycle`, as the plan itself states (`:167`), and no populated world is stepped through the real session path.

**Suggestions:** Add the optional injected-populate cross-cadence case described in A5-1 to `tick-parity.test.ts`.
**Risk:** LOW-MEDIUM.

## Overall Risk Assessment

**LOW** on architecture.
- The wave graph has no cycles and matches D-12/D-14.
- No two plans in the same wave edit the same file.
- The `src/sim` purity boundary and the AI zone are structurally sound.
- The three Round 4 HIGH contract mismatches (the NaN/JSON domain, the `.store` gate, `advanceTicks`) and every other Round 4 consensus item are resolved in the plan text, with source-verified evidence.

The remaining findings are LOW or LOW-MEDIUM hardening suggestions. The main execution risk is size: 08-05, 08-09, 08-11 and 08-15 run 130k-155k tokens against a 100k budget. The owner has accepted this, and per-task commits limit the damage of a context reset.

**Verdict: READY**
