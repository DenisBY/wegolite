---
phase: 8
reviewers: [reviewer-architect-opus, reviewer-correctness-opus, reviewer-algorithm-opus, reviewer-adversarial-opus, reviewer-context-sonnet, reviewer-triage-haiku]
reviewed_at: 2026-11-13T00:00:00Z
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
  opencode: "Not run per user instruction (use Claude models as reviewers)"
  claude-cli: "Skipped for independence: running inside Claude Code"
plan_coverage:
  reviewer-context-sonnet:
    note: "Read 08-12, 08-15, 08-16 and part of 08-01 in full; other plans at frontmatter, objective and Round 4 row level plus source cross-checks"
---

# Cross-AI Plan Review — Phase 8 (Round 5)

Reviewed at commit `afc4fe0` (plans revised against refreshed research). Reviewers ran as Claude Code subagents, one specialist lens each, read-only against the repository. The algorithm and correctness runs hit a usage limit mid-run; the correctness reviewer was resumed and finished, and the algorithm report on disk was complete. Raw reports: `.review-diagnostics/20261113T000000Z-claude-subagents-round5/`.

<!-- gsd:plan-revision-conflicts:begin -->
## Plan-Revision Conflicts
<!-- gsd:plan-revision-conflicts:end -->

## Architecture Review (reviewer-architect-opus)


Commit reviewed: `afc4fe0`. Lens: module boundaries, layering (`src/sim` free of Three.js and the DOM), wave and dependency order, same-wave file ownership, contracts and signatures between plans, and whether the 16 plans together deliver the Phase 8 goal.

Method: I read the frontmatter (`must_haves`, artifacts, key_links), the `<interfaces>` blocks and the relevant task text of every plan. I then checked the claims against source: `eslint.config.js:67-160`, `src/sim/math.ts:227-237`, `src/sim/flight/step.ts:122-128`, `src/sim/flight/controller.ts:14-17`, `src/app/probe.ts:390-395`, `src/app/game-session.ts:1035,1167,1341,1490,2805-2840,3345`, `src/content/types.ts:20`, `src/sim/hyperspace/countdown.ts:63`, `src/sim/dock/geometry.ts:70`, `tests/helpers/lave.ts:13-54`, `compose.yaml:46,66` and `package.json:19-44`. I also confirmed that `5b189e4` is an ancestor of HEAD and that `src/`, `tests/`, `eslint.config.js` and `package.json` have no diff between `5b189e4` and `afc4fe0`, so every source anchor in the plans is still valid for Wave 1. No file in the repository was modified.

### Round 4 consensus items

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

### Cross-cutting architecture verification

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

### New findings (Round 5)

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

### 08-01

**Summary:** Split safety nets: a six-state probe-shape snapshot added to `test:e2e:fast`, an order-independent session-source helper with the two text-reading tests re-pointed at it, and a verify-full baseline taken on a detached worktree of `5b189e4`.
**Strengths:**
- The probe-shape contract states that every `probe.test` member reads `"function"` (`08-01-PLAN.md:28`). 08-16 now honours this without revising it (R4-3).
- The baseline runs on an isolated worktree under its own Compose project (`:34`), so it is independent of Wave 1 siblings.
- `package.json:20` is the only script changed, and its contract test is in the same plan.

**Concerns:** None new.
**Suggestions:** None.
**Risk:** LOW.

### 08-02

**Summary:** Pinned v1 flight hashes and RNG vectors; `rng.ts` with a plain-integer `RngState`, `mix32`, `worldSeedFor` and `forkSeed`; `createSeededRandom` delegates to it with an identical sequence; an import-aware source scan.
**Strengths:**
- `math.ts` → `rng.ts` is one-way, and 08-09's seal test pins it.
- `arrival.ts` and the render callers stay byte-identical, which protects the arrival goldens. The closure at `src/sim/math.ts:227-237` matches the interface text exactly.
- `autonomous: false` with a blocking checkpoint correctly gates the one-way D-02 arithmetic before any consumer exists.

**Concerns:**
- LOW: the `0xffffffff` literal in `rng.ts` duplicates the later `MAX_UINT32`. This is unavoidable in Wave 1 (A5-2).

**Suggestions:** None required.
**Risk:** LOW (gated by the human checkpoint).

### 08-03

**Summary:** Determinism lint bans in `src/sim` (named constants spreadable by later blocks), probe infrastructure, the stronger `sim-purity` scan, and the entity-id-scope guard from Wave 1.
**Strengths:**
- All Round 4 selectors are placed inside `SIM_SYNTAX_BANS` (`08-03-PLAN.md:139-142`). Because ESLint *replaces* a redefined rule (Pattern 8), placing them anywhere else would have silently dropped them from 08-09's AI blocks.
- `no-eval`, `no-new-func` and `no-implied-eval` are separate rules that the AI blocks never redefine.
- The entity-id-scope guard is in place before `ids.ts` exists.

**Concerns:** None new.
**Suggestions:** None.
**Risk:** LOW.

### 08-04

**Summary:** Split steps 1-2: the typed `SessionState`/`createSessionState`, and the probe publisher.
**Strengths:**
- One context object with live reads at call time (G-8).
- An exact facade export set is pinned.
- No probe-publisher call site moves, which is gated by neighbouring statements.

**Concerns:** None new. Later plans (08-14, 08-15) add fields with defaults in `createSessionState`, so test fakes built through it stay valid.
**Suggestions:** None.
**Risk:** LOW.

### 08-05

**Summary:** World foundation: `ids.ts`, `limits.ts` (single owner), `ai/types.ts`, entity, store, world, and serialization/hash with empty-world identity to `hashFlight`.
**Strengths:**
- `limits.ts` has no imports and is the only definition site, so all four validators (spawn, control, sanitize, parser) share one domain.
- `ai/types.ts` imports only `world/ids.js` (`:148`), so `entity.ts` → `ai/types.ts` cannot form a cycle.
- `StaticEntity` holds `layoutKey` only, which keeps `SystemLayout` the single authority (D-07).
- The binary-search store has no Map or Set.

**Concerns:** None new.
**Suggestions:** None.
**Risk:** LOW-MEDIUM (130k estimate over budget, accepted by the owner).

### 08-06

**Summary:** Split steps 3-4: render driver, chart and settings controllers; verify-full at step 3.
**Strengths:**
- The single gated `renderFrame(alpha, shouldDraw())` call is preserved and pinned by the re-pointed redraw-gate scan.
- The listener totals are tied to `git grep` at the step SHA (R4 triage fix).

**Concerns:** None new.
**Suggestions:** None.
**Risk:** LOW.

### 08-07

**Summary:** AI seam: type-only `WorldView`/`ShipControl`, plus implementations that read static geometry from the layout at call time and validate writes against `limits.ts`.
**Strengths:**
- `view.ts` and `control.ts` take only type imports from `./ids.js` and `../math.js` (`:110-111`). That makes them safe items on the AI allow-list, and 08-09's seal test pins it.
- The world never holds the `FlightState` (the player is passed per call).
- Exhaustive `Record<keyof …>` literals keep the seam narrow.

**Concerns:** None new.
**Suggestions:** None.
**Risk:** LOW.

### 08-08

**Summary:** Split steps 5-6: station and save controllers; verify-full at step 6.
**Strengths:**
- The new `disposed` guards are recorded as deliberate deviations (R4-14).
- `saveBoot.store` is kept verbatim, and the narrowed 08-16 gate no longer matches it.

**Concerns:** None new.
**Suggestions:** None.
**Risk:** LOW.

### 08-09

**Summary:** AI types (`AiContext`, `AiModule`, `AiEvent`), integer tick timers, a frozen registry, the scripted test pilot, and the recursive AI lint zone with allow-list regexes, the closure-RNG import ban and the module-state ban.
**Strengths:**
- The AI blocks spread `SIM_SYNTAX_BANS` and do not redefine the global, property or eval rules. All 08-03 bans therefore still reach the zone, and probes prove it (`:196`).
- The allow-list table is read from `calculateConfigForFile`, which pins the effective config rather than the source text.
- The seal test stops `ids`/`math`/`view`/`control` from becoming re-export bridges.

**Concerns:**
- LOW (A5-4): the pilot ships in production through the default registry. This is consistent with D-11.

**Suggestions:** None required.
**Risk:** LOW-MEDIUM (135k estimate, accepted).

### 08-10

**Summary:** Split steps 7-8: hyperspace controller (moved as one atomic unit), ordered event router, sim driver with `stepOnce`, and the pure `buildStepOptions`.
**Strengths:**
- `RoutedKind`/`isRoutedKind` makes the commit order with 08-11 irrelevant. I verified that no exhaustive switch over `SimEvent` exists in `src`.
- `step-options.ts` reproduces `game-session.ts:2814-2836` exactly (checked against the source), and its imports resolve inside `src/sim` or to a type-only `content/types`.
- The signature is now consistent (R4-8).

**Concerns:** None new.
**Suggestions:** None.
**Risk:** LOW.

### 08-11

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

### 08-12

**Summary:** Split step 9: frame loop and start-up wiring; the facade builds every module's deps; verify-full plus a non-blocking `e2e-cross` on the step-9 worktree.
**Strengths:**
- The facade remains the only public entry point, and later plans (08-14, 08-16) add late-bound deps only there.
- The rAF tracking deviation is recorded.
- Firefox now runs where the listeners move.

**Concerns:** None new.
**Suggestions:** None.
**Risk:** LOW-MEDIUM (frame-loop rewrite; gated by verify-full).

### 08-13

**Summary:** Snapshot codec (`snapshotWorld`/`parseWorldSnapshot`/`restoreWorld`), the 1,000-tick exact live-versus-restored equality, and the cross-cadence world hash with launch and arrival.
**Strengths:**
- Refusing non-finite values before JSON, together with exact JSON equality, closes R4-1 and R4-10.
- `restoreWorld` goes through the parser.
- `restoreWorld` keeps the stored `nextId`, which is correct for per-world scope.

**Concerns:**
- LOW-MEDIUM (A5-1): the cadence test uses a test-local lifecycle that is never checked against 08-15's real one. This is unavoidable in Wave 6.

**Suggestions:** Cross-reference A5-1. A follow-up case in 08-16 closes the gap.
**Risk:** LOW-MEDIUM.

### 08-14

**Summary:** Test flags parsed once, a manual-clock frame-loop branch, and `advanceTicks` on the driver sharing one drain path with `advanceFrame`; the probe shape is unchanged.
**Strengths:**
- One drain path for both entry points.
- The refusal rule has one owner (the driver), which 08-16 inherits.
- `testFlags` gets a default in `createSessionState`.
- Late-bound `markHookMutation` breaks the construction-order coupling between the publisher and the driver.

**Concerns:** None new.
**Suggestions:** None.
**Risk:** LOW.

### 08-15

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

### 08-16

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

### Overall Risk Assessment

**LOW** on architecture.
- The wave graph has no cycles and matches D-12/D-14.
- No two plans in the same wave edit the same file.
- The `src/sim` purity boundary and the AI zone are structurally sound.
- The three Round 4 HIGH contract mismatches (the NaN/JSON domain, the `.store` gate, `advanceTicks`) and every other Round 4 consensus item are resolved in the plan text, with source-verified evidence.

The remaining findings are LOW or LOW-MEDIUM hardening suggestions. The main execution risk is size: 08-05, 08-09, 08-11 and 08-15 run 130k-155k tokens against a 100k budget. The owner has accepted this, and per-task commits limit the damage of a context reset.

**Verdict: READY**

---

## Behavioral Correctness Review (reviewer-correctness-opus)


Lens: behavioural correctness. I checked whether the acceptance criteria, grep gates and tests can pass or fail as each plan claims, whether the game-session extraction preserves the current behaviour of `src/app/game-session.ts` (3365 lines at afc4fe0), and whether the "verbatim move" claims are true.

All evidence was read from source at afc4fe0. I ran nothing in Docker. Every `rg` baseline below was run read-only against the tree.

### Round 4 consensus check

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | NaN in `ai.params` cannot be "rejected after JSON" | **Resolved** | `08-13-PLAN.md:115`: `snapshotWorld` walks every number leaf and throws `SnapshotError("non-finite")`. `:151`: refusal rows. `:155`: post-JSON rows limited to number slots and array elements; a scalar `null` is accepted. `:154`: the generator yields `null`/`true`/`false`. `:172`: gate `fc\.(constant\|constantFrom\|boolean)\(`. `08-05-PLAN.md:148`: the `ParamValue` domain doc. |
| 2 | The `\.store\b` gate can never print nothing | **Resolved** | `08-16-PLAN.md` Task 1 acceptance: the new regex `sim/world/store\|world\??\.store\b\|\.store\??\.(live\|get\|allocate\|kill\|commit\|nextId)\b\|\bEntityStore\b`. I ran it against `src/app` and it prints nothing. The save-store uses at `game-session.ts:1167,1341,1490,3345` are `.read/.clear/.dispose` or a bare `saveBoot.store` argument, so none matches. |
| 3 | `advanceTicks` is undefined outside the manual clock | **Resolved** | `08-16-PLAN.md:126` (Task 1 step 1): both members are required and always present, and outside the manual clock the call refuses. `08-01-PLAN.md:138`: the standing contract is written into the spec header. Fixture gate: `testHookDocked.test.advanceTicks === "function"`. |
| 4 | Shared limits defined three times | **Resolved** | `08-05-PLAN.md:146` adds `limits.ts`. `:185`: the redefinition gate. I checked its baseline: no match today, and `src/sim/ai` is absent. `08-11` Task 2 acceptance and `08-13` Task 1 acceptance repeat the gate. The planned constants (`MAX_ENTITIES = 256`, `MAX_AI_QUEUE_LENGTH = 4096`, `THINK_INTERVAL_TICKS = 15`, `TICKS_PER_SECOND = 120`) do not collide with its `\b` alternation. |
| 5 | Enum leaves not checked or repaired; `registry[aiKey]` | **Resolved** | Spawn: `08-05-PLAN.md:30,211`. Sanitize rule 9: `08-11-PLAN.md` Task 2 behaviour item 9. `aiModuleFor` with `Object.hasOwn`, plus the gate `registry\[[^\]]+\]\.(think\|onEvent)`: `08-11` Task 1 acceptance. Case (d) uses four prototype names. |
| 6 | Quaternions that pass spawn or sanitize can fail the parser | **Resolved** | `MIN_QUAT_NORM_SQ = 1e-12`, plus a re-check after normalising (`08-11` rule 2). Spawn requires a unit quaternion (`08-05-PLAN.md:157`). I checked the arithmetic: `{w:7e-158}` gives normSq ≈ 4.9e-315, which is below 1e-12, so it becomes identity. `{w:1e-5}` normalises to exactly `w = 1` (`src/sim/math.ts:53-57`). `{w:1+2.5e-10}` has \|normSq−1\| = 5e-10, which is inside the 1e-9 tolerance. |
| 7 | `worldSeed` never checked as uint32 | **Resolved** | `08-05-PLAN.md:212` (`createWorld` throws RangeError). The parser half is at `08-13-PLAN.md:26,143`. |
| 8 | `createEventRouter` signature contradiction | **Resolved** | `08-10-PLAN.md:40,158`, `08-15-PLAN.md:108,133`: every mention reads `(ctx, subscribers)`. Gate: `ctx\?: SessionState` must not appear. |
| 9 | Lint guard gaps | **Resolved** | `08-03` Task 2 adds `no-eval`, `no-new-func`, `no-implied-eval`, `Intl`, `localeCompare`, the computed sort/call forms, and `sort(undefined)`. The baselines it states (`no-eval`/`no-new-func`/`localeCompare`/`Intl` = 1; `property.value=` and `no-implied-eval` = 0) match `eslint.config.js` today. `08-09` Task 3 adds `importNames` and `AI_MODULE_STATE_BANS`. `08-02` Task 3 adds the import-aware scan; `arrival.ts:30` matches its regex. |
| 10 | Restore check uses a rounded hash | **Resolved** | `08-13-PLAN.md:116`: exact `JSON.stringify(snapshotWorld(...))` and `toStrictEqual` at every checkpoint, with a gate. |
| 11 | AI event drain limits passes, not deliveries | **Resolved** | `08-11` Task 2: `MAX_AI_EVENTS_PER_DRAIN = 4096` and `MAX_AI_QUEUE_LENGTH = 4096`, with a conservation-law test row. |
| 12 | `ShipControl` accepts out-of-domain values | **Resolved** | `08-07-PLAN.md:117`: the seam ignores values outside the domain, using `limits.js`. Task 2 has the domain rows. |
| 13 | No Firefox run | **Resolved** | `08-12-PLAN.md:123,137`; `08-15-PLAN.md:216,232`. |
| 14 | Verbatim deviations, best-of-N, stale anchors | **Resolved** | `08-08-PLAN.md:146,165`; `08-12-PLAN.md:118,137`; `08-15-PLAN.md:214` (best of 3); `08-04` executor brief ("locate every site by name"). |

All 14 are resolved in the plan text.

### New findings (summary)

1. **MEDIUM (`08-15` Task 1 step 4 vs `08-01` Task 2 step 4 and `tests/guards/economy-purity.test.ts:201-207,350-352`): the `worldLifecycle` subscriber can land inside the cut of the economy-purity "docked arm".**
   - `switchCaseBody` cuts from `case "docked":` to the next `\n\s*case\s+["']` in that file, or to the end of the file.
   - In 08-10's `event-router.ts`, `docked` is the last case of the stationFlow switch (source order is launched, launchComplete, docked; see `game-session.ts:2296-2353`). The cut therefore runs into whatever code follows, up to the first `case` label of the next switch.
   - 08-15 places the `worldLifecycle` subscriber "right after `stationFlow`" and calls `begin(ctx.core.marketSeed)` only "when `ctx.core.marketSeed` is a number". The natural spelling, `typeof ctx.core.marketSeed === "number"`, matches the guard's `/\bmarketSeed\s*=/`, because `\s*=` matches the first `=` of `===`. So does `const marketSeed = ctx.core.marketSeed`.
   - If that code sits physically between the stationFlow switch and the hudMessages switch, `docked).not.toMatch(/\bmarketSeed\s*=/)` fails. It is a false failure: the docked arm itself never re-seeds.
   - The executor may not edit the scan (FOUND-10 prohibition), so they must find the cause.
   - **Fix:** in 08-15, require the `worldLifecycle` subscriber to be declared after every other subscriber's `case` labels (or before the stationFlow switch). Alternatively, read the seed with a spelling that cannot match, for example `const seed = ctx.core.marketSeed; if (seed !== undefined) …begin(seed)`. Add an acceptance line: `docker compose run --rm test npx vitest run tests/guards/economy-purity.test.ts` passes, and the SUMMARY names where the subscriber sits relative to the `case "docked":` arm.

2. **MEDIUM (`08-06` Task 2 step 5 and `must_haves` truth 4): "closing the chart requests a redraw" is false for the function being moved.**
   - `closeChart` (`game-session.ts:1851-1860`) never calls `redrawGate.request()`.
   - The five request sites are `:1041` (hook taint), `:2740` (chart-open freeze branch in `frame()`), `:2751` (save-screen freeze), `:3255` (`resize`) and `:3361` (`shown`). The comment in `tests/app/redraw-gate.test.ts:139-141` confirms this list.
   - The redraw after the chart closes comes from the freeze branch requesting on every open-chart frame.
   - The planned unit test therefore has two possible outcomes:
     - (a) It passes vacuously. A fresh `createRedrawGate` returns `true` on its first `next()`, because `seen === undefined` (`src/app/redraw-gate.ts`).
     - (b) If the test first settles the gate, it fails against the verbatim body.
   - An executor who "fixes" this by adding a request in `closeChart` breaks the pinned count of five.
   - **Fix:** rewrite the row as "`closeChart` sets `chartOpen` false, restores the input context and resets the loop". Move the redraw property to `08-12`'s frame-order test: a chart-open frame calls `redrawGate.request()`, so the first frame after closing draws.

3. **LOW (`08-04` Task 1 step 1 and the interfaces block): the context field list misses two closure-level `let`s.**
   - The list of 75 names omits `equipmentSetSource` and `equipmentSetCache` (`game-session.ts:576-577`).
   - The interfaces block says "77 closure-level lets 365-490", but 75 are in 356-490 and two are at 576-577.
   - The `! rg -q "^  let "` gate (baseline 77, confirmed) forces both to move. The plan's fallback ("if a let is missing, add it") covers this, so the risk is low.
   - **Fix:** name both, in the core group (or as a memo inside the station controller, which 08-08 says "keeps its caching"), and correct the anchor text.

4. **LOW (`08-04` Task 1): a local `ctx` shadows the new session `ctx`.**
   - `confirmFit` (`game-session.ts:769`) and the `onRefuel` callback (`:3232`) declare `const ctx = fitContext();` after reads of session fields in the same block (`stationScreen`, `equipmentCatalogue`, `profile`, `stationPending`).
   - After the rewrite to `ctx.station.*` and `ctx.core.*`, those reads refer to the block-scoped FitContext and hit the TDZ, so typecheck fails with TS2448/TS2339. The plan does not name the collision.
   - This is a forced rename inside a "verbatim" body.
   - **Fix:** tell the executor to rename the local (for example `fit`) and list it in the SUMMARY.

5. **LOW (`08-04` Task 2 step 2): the order wording is reversed relative to the source.**
   - The plan says the hook callback "keeps `redrawGate.request();` and the taint assignment in that order".
   - The source order is the taint first (`testTainted = true`, `:1039`) and then the request (`:1041`).
   - **Fix:** say "the taint assignment, then `redrawGate.request();`".

6. **LOW (`08-12` Task 1 acceptance, last bullet): the listener gate counts every mention of `uiController.signal`.**
   - The gate requires the count of `addEventListener(` to equal the count of `uiController\.signal` across the facade and the session modules.
   - Today both counts are 2 (`:2268-2271`, `:2289-2292`). Any doc comment, or any extra use of `uiController.signal` (for example passing it to a sub-panel), breaks the equality even though every listener is correct.
   - **Fix:** count `signal: (deps\.|ctx\.runtime\.)?uiController\.signal` and compare that with `addEventListener(`.

7. **LOW (`08-14` Task 2, the "manual-clock frame" row): the "no drainCommands" assertion is vacuous.**
   - At frame-loop level, `drainCommands` is called only by the sim driver (since 08-10) and by the paused or freeze branches. With a sim-driver double, a normal realtime frame records no `drainCommands` either.
   - The meaningful assertion is "no `advanceFrame`".
   - **Fix:** keep the `advanceFrame` and alpha-1 assertions and drop the `drainCommands` claim. Alternatively, drive the real sim driver in that row.

8. **Note (`08-08` Task 2 guard iii, no change needed):** the new `disposed` early return at the top of `queueSnapshot`'s `.then` skips `manualSavePending = false` and the committed counters after dispose. Today those still update (`game-session.ts:1168-1194`), and only `renderStation` is guarded. Nothing reads them after dispose (`probe.save` is deleted at `:3343`). The plan already records this as a deliberate deviation, which is correct.

---

### 08-01

**Summary:** The probe-shape pin and the session-source helper (step 0).

**Strengths:**
- Every scan baseline holds:
  - `readFileSync("src/app/game-session.ts"` occurs once in `redraw-gate.test.ts` (`:113`).
  - `"src", "app", "game-session.ts"` occurs twice in `economy-purity.test.ts` (`:312`, `:322`).
  - `case "docked":` occurs once (`:2321`).
  - `renderFrame(alpha, shouldDraw())` occurs once (`:2863`).
- The 21 optional `WegoliteProbe` keys in the audit gate match `src/app/probe.ts` exactly.
- Cutting the docked arm from the one file that holds the label is correct for the step-0 tree.

**Concerns:**
- LOW: the economy-purity scan of `sessionSource()` and the redraw-gate scan do not strip comments. A later module doc comment that mentions `performance.now`, `renderFrame(alpha, …)` or `generateMarket(` changes the verdict. This is pre-existing behaviour, but the split adds about ten new files.

**Suggestions:** Add one line to the executor brief of each split plan: "do not quote pinned literals in comments".

**Risk:** LOW.

### 08-02

**Summary:** Flight-hash pins, `RngState`, mix32, and the `createSeededRandom` delegation.

**Strengths:**
- The interfaces quote `createSeededRandom` exactly (`src/sim/math.ts:227-237`).
- `arrival.ts:73` is the only call outside `math.ts`, and `arrival.ts:15` has no parenthesis, so the gate prints one line.
- The "1,000 distinct" rows are guaranteed, not probabilistic: `mix32` is a bijection in each argument, and the composition of bijections in epoch, then id, then purpose is a bijection.
- `LAUNCH_DURATION = 2` (240 steps) and `"g0-s55"` (Leesti) are confirmed.

**Concerns:** None new.

**Risk:** LOW.

### 08-03

**Summary:** Determinism lint bans and the entity-id scope guard.

**Strengths:**
- The stated baselines hold, and no file in `src/sim` uses `globalThis`, `self`, `process`, timers, `for..in`, bare sort, `Date` or `Reflect` (rg confirms). The new bans therefore cannot fail on existing code.
- My count of the listed probes is 43, which meets the ≥ 42 floor.
- The real-tree floor of 50 is met: there are 90 `.ts` files outside `src/sim`, and none names `EntityId`.

**Concerns:** None new.

**Risk:** LOW.

### 08-04

**Summary:** Split steps 1 and 2 (context and probe publisher).

**Strengths:**
- The export baseline of 9 and the closure-level `let` baseline of 77 are confirmed.
- `updateProbe` publishes `spanY: 2 * chartCamera.spanX` (`:2427`) and `probe.test.tainted = testTainted` (`:2487`), so the publisher unit-test rows are satisfiable.
- `setSpeed(NaN)` returns before tainting (`probe.ts:407`).

**Concerns:** Findings 3 and 4 (LOW: missing `let`s, `ctx` shadowing) and finding 5 (LOW: reversed order wording).

**Suggestions:** As in those findings.

**Risk:** LOW.

### 08-05

**Summary:** The world core: ids, limits, store, world, serialize.

**Strengths:**
- `OOBehaviour.tbl` has 39 entries and `OOScanClass.tbl` has 16 (checked in the Oolite checkout).
- The limit redefinition gate has a clean baseline.
- The spawn rows agree with sanitize and the parser.

**Concerns:** None new.

**Risk:** LOW.

### 08-06

**Summary:** Split steps 3 and 4 (render driver, chart and settings controllers).

**Strengths:**
- The render-driver unit rows match the real gate semantics (`redraw-gate.ts` `next`/`drawn`/`request`).
- There are two `addEventListener` sites today, both at closure level, and they correctly stay in place.

**Concerns:**
- MEDIUM, finding 2: the `closeChart` redraw row is vacuous or impossible.
- LOW: the `focusLost` row ("pauses only when pauseOnFocusLoss is on") omits that `settings === undefined` also pauses (`:1527`). A test that leaves `settings` undefined will see a pause.

**Suggestions:** As in finding 2. Set `ctx.runtime.settings` explicitly in the `focusLost` row.

**Risk:** MEDIUM until reworded.

### 08-07

**Summary:** The `WorldView` and `ShipControl` seam.

**Strengths:**
- `mul` and `axisAngle` exist in `math.ts`.
- The renderer composes base and roll in that order (`src/render/bodies/station.ts:211-214`).
- Using three.js in tests has precedent (`tests/sim/aegis.test.ts`).

**Concerns:** None new.

**Risk:** LOW.

### 08-08

**Summary:** Split steps 5 and 6 (station and save controllers).

**Strengths:**
- The guard order in `autosave` (`:1208-1236`) is attempts, then contextLost, then canOverwrite, then tainted. This matches the truth.
- The post-read `disposed || !saveScreenOpen` check exists (`:1344`).
- The deviations are recorded.

**Concerns:**
- LOW: the "tainted" row needs a fake `saveStatus` for which `canOverwrite` is true. Otherwise the skip reason is the status reason, not "tainted".
- Finding 8 is a note only.

**Risk:** LOW.

### 08-09

**Summary:** The AI zone and the test pilot.

**Strengths:**
- `AI_THINK_INTERVAL 0.125` (`oolite/src/Core/AI.h:31`) × 120 = 15.
- The positive control `as const` arrays parse as `TSAsExpression` and escape the state-ban selectors as intended.
- The depth-3 glob `src/sim/ai/*/*/**/*.ts` matches depth 3 and deeper only.

**Concerns:** None new.

**Risk:** LOW.

### 08-10

**Summary:** Split steps 7 and 8 (hyperspace controller, router, sim driver, step-options).

**Strengths:**
- The 14 kinds and the four subscriber groups match the `handleEvent` arms (`:2294-2410`).
- The `pending.length = 0;` count of 4 is right (`:2738`, `:2749`, `:2773`, `:2859`).
- `stepFlight(` has one call site (`:2837`).
- The arrival failure path leaves profile, market, seed and target untouched (`:2105-2124`).

**Concerns:**
- Finding 1 originates here. Because `docked` ends up last in the stationFlow switch, any code placed after that switch falls into the economy-purity cut until the next `case` label. 08-10 itself is safe, since nothing market-related lives there yet.

**Suggestions:** Pin in 08-10 that the stationFlow switch is followed directly by a subscriber that has `case` labels, or note the constraint for 08-15.

**Risk:** LOW.

### 08-11

**Summary:** `stepWorld`, AI events, sanitize, and the reserved events.

**Strengths:**
- The sanitize table rows agree with the parser domain in every leaf I traced (magnitude, tolerance, enums, timers).
- The wake case arithmetic (T+2 → `nextThinkTick` T+17) is consistent with 08-09's re-arm rule.

**Concerns:** None new.

**Risk:** LOW.

### 08-12

**Summary:** Split step 9 (frame loop, start-session, facade).

**Strengths:**
- The frame-order assertions match `frame()` (`:2699-2864`): pause toggle, chart drain, save drain, freeze branches with `pending.length = 0`, station actions, sim, then render. The paused branch does render.
- After `dispose`, `swapSystem`'s second `renderFrame(0)` is already a no-op (`state = undefined`, `:3337`), so the guard is safe.

**Concerns:**
- LOW, finding 6: the `uiController.signal` count equality.

**Risk:** LOW.

### 08-13

**Summary:** The snapshot codec and the cadence test.

**Strengths:**
- The parser, sanitize and spawn domains are mutually consistent, including the acceptance of `nextId = 2**32` and the tolerance row.
- The cadence replay follows the tick-indexed precedent (`tests/sim/flight-cadence.test.ts:3-10`).

**Concerns:** None new.

**Risk:** LOW.

### 08-14

**Summary:** Test flags, the manual clock and `advanceTicks`.

**Strengths:**
- There is exactly one `new URLSearchParams` today (`:3185`).
- Moving the flag read earlier is behaviour-neutral, because `testHookEnabled` is otherwise read only in `loadFromSave` (`:1418`).
- Taint equivalence holds through `updateProbe`'s `probe.test.tainted = testTainted`.

**Concerns:**
- LOW, finding 7: the `drainCommands` assertion is vacuous.

**Risk:** LOW.

### 08-15

**Summary:** World lifecycle integration.

**Strengths:**
- The epoch sequence `[1,1,2,3,3]` and the reset-on-load semantics are internally consistent.
- `marketSeed` is always set at boot (`:3026`).

**Concerns:**
- MEDIUM, finding 1: placing the subscriber against the economy-purity docked-arm cut.

**Risk:** MEDIUM until the placement or spelling rule is added.

### 08-16

**Summary:** The deliberate probe commit and tick parity.

**Strengths:**
- The narrowed store gate is clean at HEAD.
- The flag inertness row matches the 08-14 table (`?clock=manual&traffic=0` gives `{false, false, true}`).
- The `advanceTicks` contract is consistent with 08-01.

**Concerns:** None new.

**Risk:** LOW.

---

### Overall Risk Assessment: LOW-MEDIUM

All 14 Round 4 items are resolved. Two new MEDIUM findings are targeted text edits:
- 08-15/08-10: the subscriber placement can trigger a false failure of a frozen scan.
- 08-06: the `closeChart` redraw test is vacuous or impossible.

Five LOW wording and gate-precision items remain. There are no wave, ownership or layering problems.

**Verdict: NEEDS REVISION** (minor: two text edits before 08-06 and 08-15 execute).

---

## Algorithm & Determinism Review (reviewer-algorithm-opus)


Commit reviewed: `afc4fe0`. Lens: fixed-timestep determinism, seeded RNG and forking, hashing and canonicalization, numeric edge cases (NaN, -0, quaternions, float rounding, bounds), snapshot and restore equivalence, complexity bounds.

Method: I read 08-05, 08-11 and 08-13 in full, and the algorithm-bearing parts of 08-02, 08-03, 08-07, 08-09, 08-14, 08-15 and 08-16. For the split plans (08-01, 08-04, 08-06, 08-08, 08-10, 08-12) I read the objectives and the Round 4 disposition rows. I traced each claim to source: `src/sim/hash.ts:13-35` (fnv1a32 low byte, canon), `src/sim/math.ts:53-57` (normalize), `src/sim/math.ts:227-236` (mulberry32), `src/sim/loop.ts` (accumulator) and the four `saveBoot.store` sites in `src/app/game-session.ts`. I ran one scratch check in the test container: `docker compose run --rm -v /tmp/r5algo:/scratch test node /scratch/k.mjs`. Its output is quoted under 08-13. I modified nothing in the repository.

---

### Round 4 consensus items: status

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | NaN in `ai.params` cannot be rejected after JSON | **Resolved** | `08-05-PLAN.md:148` fixes the ParamValue domain: null and boolean scalars are legal, array elements are finite numbers or strings, and no number is non-finite. `08-13-PLAN.md:23` and `:115`: `snapshotWorld` walks every number leaf and throws `SnapshotError("non-finite")` before it builds output. `08-13-PLAN.md:154-155`: the post-JSON converse is narrowed to number slots and array elements (ii), a scalar null is accepted (iii), and the generator now emits null and boolean params (gated on `fc.constant/constantFrom/boolean`). |
| 2 | `\.store\b` gate can never print nothing | **Resolved** | `08-16-PLAN.md:146` narrows the regex to `sim/world/store\|world\??\.store\b\|\.store\??\.(live\|get\|allocate\|kill\|commit\|nextId)\b\|\bEntityStore\b`. I ran it on the current tree: it exits 1, and the four `saveBoot.store` uses (`read`, `clear`, `dispose`, `queueAutosave(saveBoot.store, …)`) do not match. |
| 3 | `test.advanceTicks` undefined outside the manual clock | **Resolved** | `08-16-PLAN.md:30` and `:128-129` keep it always a function that delegates to the driver, which refuses (`08-14-PLAN.md:29`). The fixture check at `08-16-PLAN.md:143` asserts `"function"` in both hook states. |
| 4 | Shared limits defined three times | **Resolved** | `08-05-PLAN.md:31` and `:146` define one `limits.ts` with no imports. The redefinition gate appears at `08-05-PLAN.md:185`, `08-11-PLAN.md:205-206` and `08-13-PLAN.md:193`, and `sanitize.ts` and `snapshot.ts` import every limit and export none. |
| 5 | Enum leaves unchecked; `registry[aiKey]` prototype dispatch | **Resolved** | Spawn uses `includes` (`08-05-PLAN.md:153`). Sanitize rule 9 (`08-11-PLAN.md:185`) kills on an unknown kind and resets an unknown scanClass, behaviour or aiKey. Dispatch goes through `aiModuleFor` with `Object.hasOwn` (`08-11-PLAN.md:35`, `:139`), and the gate `registry\[[^\]]+\]\.(think\|onEvent)` must print nothing (`:152`). The parser rejects unknown vocab (`08-13-PLAN.md:26`). |
| 6 | Quaternions that pass spawn or sanitize fail the parser | **Resolved** | Spawn requires `\|normSq-1\| <= QUAT_UNIT_TOLERANCE` (`08-05-PLAN.md:157`). Sanitize rule 2 (`08-11-PLAN.md:178`) treats non-finite components, or `normSq` non-finite or `< MIN_QUAT_NORM_SQ`, as identity. It renormalises, re-checks, and falls back to identity. The table includes `1e-160`, `3e-161`, `7e-158` and `1e200`. I checked the 1e-12 floor: for `normSq >= 1e-12`, `length >= 1e-6`, so correctly rounded `sqrt` and division give a result `normSq` within a few ulp of 1, far inside 1e-9. Sanitize, spawn and the parser now share one domain. |
| 7 | `worldSeed` never checked as uint32 | **Resolved** | `createWorld` throws a RangeError (`08-05-PLAN.md:32`, `:151`; rows at `:212`). The parser rejects 1.5, -1, 2**32 and null (`08-13-PLAN.md:26`, `:152`). |
| 8 | `createEventRouter` signature contradiction | **Resolved** | `08-10-PLAN.md:40`, `:158` and `:177` (gate `createEventRouter\(ctx,`), and `08-15-PLAN.md:108`. `rg "createEventRouter\((subscribers\|\))"` finds only the R4 ledger row. |
| 9 | Lint guard gaps (alias import, module state, eval/Intl/localeCompare, computed sort) | **Resolved** | `08-03-PLAN.md:27`, `:150`, `:170` (eval, new Function, Intl, localeCompare, `sort(undefined)`, computed `["sort"]`/`sort["call"]`). `08-09-PLAN.md:30-31`, `:192-194`, `:211` (`importNames: ["createSeededRandom"]` at depth 1 and depth 2; `AI_MODULE_STATE_BANS`). Residual forms are documented, with the 1,000-tick equality as the behavioural backstop. |
| 10 | Restore check compared only rounded hashes | **Resolved in intent, but the new exact check has a defect** | `08-13-PLAN.md:22` and `:116` add `JSON.stringify(snapshotWorld(live)) === JSON.stringify(snapshotWorld(restored))` and `toStrictEqual` on players. The exact comparison as specified is order-sensitive and fails on test-pilot params. See NEW finding A1 under 08-13. |
| 11 | AI drain limits passes, not deliveries | **Resolved** | `08-11-PLAN.md:30`, `:171`, `:191`: `MAX_AI_EVENTS_PER_DRAIN = 4096` per drain, `MAX_AI_QUEUE_LENGTH = 4096` at post, saturating `aiDropped`, and an exact conservation-law test. I checked the conservation identity: Δ`aiDropped` = capped-at-post + (pre + accepted − dequeued), with the queue empty at return. |
| 12 | `ShipControl` accepts out-of-domain values | **Resolved** | `08-07-PLAN.md:30` and `:117`: every argument is checked against `limits.ts`, and out-of-domain calls are ignored rather than clamped. `perform` uses `includes`. `scheduleWake` requires `tick + ticks <= MAX_UINT32`. |
| 13 | No Firefox run | **Resolved** | `08-12-PLAN.md:137` and `08-15-PLAN.md:36`, `:216`, `:232` record a non-blocking `e2e-cross` run. |
| 14 | Deviations, benchmark rerun, stale anchors | **Resolved** | `08-08-PLAN.md:165` and `08-12-PLAN.md:137` record the deliberate deviations. `08-15-PLAN.md:233` and `:334` allow best of three. `08-08-PLAN.md:80`, `08-10-PLAN.md:95` and `08-12-PLAN.md:91` tell the executor to locate code by name or pattern. |

All 14 Round 4 items are addressed in the plan text. Item 10's new exact comparison has a defect of its own, reported as finding A1.

---

### 08-01

**Summary.** Pins the safety nets for the split: the probe-shape fixture, session-source helpers and the `test:e2e:fast` contract.

**Strengths.** The probe-shape contract that every `probe.test` member reads `"function"` is what 08-16 now honours for `advanceTicks` (Round 4 item 3), so the two plans agree.

**Concerns.** No new algorithmic concerns. This plan has no simulation arithmetic.

**Suggestions.** None.

**Risk.** LOW.

### 08-02

**Summary.** Records flight-hash pins from the unmodified tree, then makes the stream state plain data (mulberry32 with `RngState`) and adds the D-02/D-04 `mix32` derivation behind an owner checkpoint.

**Strengths.**
- `mix32(a, b) = fmix32((a>>>0) ^ fmix32((b + 0x9e3779b9)>>>0))` (`08-02-PLAN.md:160`, `:191`) is a bijection in each argument, because `fmix32`, XOR with a constant and `+C mod 2^32` are each bijections on uint32. The 1,000-epoch and "id 101 across worlds" distinctness rows (`:195`) are therefore guaranteed by construction rather than probabilistic. `forkSeed = mix32(mix32(ws, id), code)` is injective in `ws` for fixed `(id, code)` and in `id` for fixed `(ws, code)`.
- Pinning vectors from an independent scratch re-implementation in the same commit as `rng.ts` (`:196`, gate `:214`) is the right control for a one-way format.
- The Weyl-cycle caveat is recorded (`:198`).

**Concerns.**
- **LOW (B1): the "safe at Phase 8-12 draw rates" claim is not quantified** (`08-02-PLAN.md:198`). Every mulberry32 stream walks the single cycle `s += 0x6d2b79f5`, which has an odd step and so full period. Two streams overlap as shifted copies when `(s_B − s_A)·G⁻¹ mod 2^32` falls within the draw count D. For M streams that each draw D values in one world, P(any overlap) ≈ M²·D / 2³². With the test pilot's rate of about 8 draws/s, D ≈ 4,800 in a 10-minute visit, and with M = 256 the probability is about 7%. This does not affect determinism, but it is a real statistical correlation that later phases (Monte-Carlo damage, Phase 13+) should be able to check against a stated budget.
- **LOW (B2):** `RNG_PURPOSE_CODES[purpose]` is a plain-object lookup (`:192`). An untyped caller passing `"constructor"` would get a function, and `(fn + C) >>> 0` is 0, a silent degenerate fork instead of a RangeError. Today only typed internal callers reach it.

**Suggestions.** In the Key Decisions row, state the bound `M²·D/2³² ≪ 1` with the Phase 8 figures, so a later phase raising D or M must re-check it. Make `RNG_PURPOSE_CODES` a frozen null-prototype object, or look it up with `Object.hasOwn` and throw RangeError otherwise, matching the other `forkSeed` argument checks.

**Risk.** LOW.

### 08-03

**Summary.** Mechanical determinism bans in `src/sim` (Math.random, Date, timers, for..in, bare sort, Math aliasing, eval, Intl, localeCompare, computed sort forms), each proven by a probe.

**Strengths.** The Round 4 additions (`08-03-PLAN.md:27`, `:150`, `:170`) close the computed-member and `undefined`-argument sort bypasses. Comparator totality is listed as a documented residual (T-08-48, `:228`). `Array.prototype.sort` has been stable since ES2019, so a total comparator is deterministic across engines.

**Concerns.** No new findings. A comparator that can return NaN (for example `(a, b) => a.d - b.d` with a NaN distance) makes the sort order implementation-defined. This is already a documented residual, and 08-07's scan guards against NaN by refusing a non-finite range and only ever sees finite positions.

**Suggestions.** None beyond the existing residual note.

**Risk.** LOW.

### 08-04

**Summary.** Split steps 1-2: typed session context and the read-only probe publisher.

**Concerns.** None in this lens.

**Risk.** LOW.

### 08-05

**Summary.** Ids, vocabularies, `limits.ts`, entity and static records, the binary-search store, per-entity forked streams, the injective world hash line, and the D-08 empty-world identity.

**Strengths.**
- Store complexity is sound: append-only allocation (new id > max), O(log n) `get` by binary search, O(n) in-place `commit`, and no Map or Set whose iteration order could decide anything (`08-05-PLAN.md:150`).
- The hash line is now injective over printed fields. `encodeHashString` = `JSON.stringify` plus `\uXXXX` for code units above 0x7e (`:161`). A literal backslash in the input is emitted as `\\`, so an escape sequence cannot be forged by input text. Well-formed `JSON.stringify` already escapes lone surrogates in lower case, so the output is ASCII and fnv1a32's low-byte hashing (`src/sim/hash.ts:16`) loses nothing. The type tags `z`/`b:`/`n:`/`s:`/`a[...]` (`:162`) separate `1`, `"1"` and `true`.
- `isNeverSpawned` includes the world-stream state and, after 08-11, `aiDropped`, so D-08 holds exactly when nothing observable has happened.
- `createWorld` rejects non-uint32 seeds (`:151`), which removes the `canon(n,0)` rounding versus `>>> 0` truncation ambiguity.

**Concerns.**
- **LOW (C1): `spawnEntity` copies `ai.params` "onto `Object.create(null)`" (`08-05-PLAN.md:159`) without fixing the key insertion order.** The hash is unaffected because it sorts (`:160`). However, the unsorted order propagates into `snapshotWorld`'s output and causes finding A1 under 08-13. Inserting in code-unit sorted order at spawn would be one of the two possible fixes; the more robust fix is in 08-13.
- **LOW (C2):** canon's six-decimal rounding makes the entity line non-injective over values below 1e-6. For example, radius `5e-324` and `1e-7` print identically. This is acknowledged and deferred to 08-13's exact JSON comparison, which is correct as long as A1 is fixed.

**Suggestions.** Optionally insert `ai.params` keys in code-unit sorted order at spawn, so live and restored params objects have the same shape. This complements the 08-13 fix but does not replace it.

**Risk.** LOW.

### 08-06

**Summary.** Split steps 3-4: render driver, chart and settings controllers.

**Concerns.** None in this lens.

**Risk.** LOW.

### 08-07

**Summary.** `WorldView` (read-only, fresh copies) and `ShipControl` (write-only, actor-only, domain-checked), with scan ordered by squared distance and then id.

**Strengths.**
- Scan uses squared distances against `range²` with an explicit comparator (distance, then id) (`08-07-PLAN.md:28`), so the order is total and deterministic. Positions are bounded by 1e12, so squared distances stay below about 1.2e25, with no overflow and no NaN. A non-finite or negative range returns `[]` (`:150`).
- `ShipControl` refuses out-of-domain writes instead of clamping (`:30`, `:117`), so there is no hashed repair noise.
- Station orientation uses the renderer's `mul(base, axisAngle)` composition, checked against three.js within 1e-12 (`:26`, `:147`).

**Concerns.**
- **LOW (D1): scan cost.** Each call is O(N log N) over up to 262 bodies. With 08-11's per-tick bounds (up to 256 thinks plus 2 × 4,096 deliveries, each of which may scan), the worst case is about 8.4k scans × 262·log 262, roughly 2×10⁷ comparisons per tick. That is not reachable in Phase 8, because the test pilot has no `onEvent`, but it is the actual per-tick bound the queue caps permit.

**Suggestions.** Record the worst-case per-tick scan cost next to the queue bounds, so Phase 12's populator and real AI modules have a stated budget.

**Risk.** LOW.

### 08-08

**Summary.** Split steps 5-6: station and save controllers.

**Concerns.** None in this lens. The deliberate `disposed` guards are recorded (`08-08-PLAN.md:165`).

**Risk.** LOW.

### 08-09

**Summary.** AI types, integer-tick time, the frozen registry, the test pilot, and the AI lint zone.

**Strengths.**
- `ticks(s) = max(1, round(s·120))` keeps every timer an integer. The wake draw `ticks(0.1 + random()·1.5)` is in [12, 192] (`08-09-PLAN.md:122`, `:156`).
- All pilot state lives in `AiComponent.params`, with a JSON round-trip test (`:26`). The closure-stream import ban and the module-state ban (`:30-31`) close the two ways hidden state could escape the snapshot.

**Concerns.**
- **LOW (E1):** the test pilot targets the first scan result and then flies straight, because Phase 8's integrator never changes orientation (08-11 `:139`). Its distance only shrinks if it already faces the target, so "hold" is rarely reached in the 1,000-tick scenario. That is harmless for determinism, but the 08-13 equality then exercises mostly the "seek" branch plus wake draws. This was a deliberate scoping choice (A3), noted here only so nobody reads the 1,000-tick test as covering the hold transition.

**Suggestions.** Optionally, in 08-13's scenario, spawn one pilot within `holdRange` of a body so that both phases and the target-lost path run inside the compared window.

**Risk.** LOW.

### 08-10

**Summary.** Split steps 7-8: atomic hyperspace controller, ordered event router, sim driver with `stepOnce`, and the pure step-options builder.

**Concerns.** None in this lens. The signature is aligned (Round 4 item 8). The fixed-step accumulator stays in `src/sim/loop.ts`, which these plans do not touch.

**Risk.** LOW.

### 08-11

**Summary.** `stepWorld` (update, think, sanitize, commit), `stepSim` composition with the jump-step rule, the bounded AI event queue, field-complete idempotent `sanitizeEntity`, and the reserved event kinds.

**Strengths.**
- Id order over a length snapshot, with spawns this tick first visited next tick (`08-11-PLAN.md:29`, gate `:151`).
- The jump-step and dock-step rules make stepping independent of cadence. `stepSim` checks `player.mode` after `stepFlight`, so the docking step and the `hyperspaceJumped` step never step a world against the wrong layout (`:36`, `:140`).
- Sanitize rule 2 (`:178`) now gives one domain with spawn and the parser. The "second call" column with `Object.is` (`:186`) makes idempotence falsifiable at the ulp and -0 level.
- The queue bounds turn the earlier `N·f^8` into O(8,192) deliveries per tick, with exact accounting (`:171-172`).
- The transcendental gate covers `hypot`, `cbrt`, `pow` and the rest (`:250`).

**Concerns.**
- **LOW (F1): queue drain cost depends on the dequeue primitive.** The plan says the queue "drains first-in first-out" (`:191`) but does not say how. A naive `aiQueue.shift()` is O(n) per dequeue in V8 once the array leaves the fast path, so one 4,096-event drain costs up to about 8×10⁶ element moves. Swapping in a fresh buffer per pass (`const batch = world.aiQueue; world.aiQueue = []`) also gives exactly the plan's "posted during a pass arrive in the next pass" semantics.
- **LOW (F2): the transcendental gate misses the `**` operator** (`:250`). Its semantics are `Math.pow` (implementation-approximated), so `x ** 0.5` in a world-core module would pass the gate and break the cross-engine promise of row (f) once Firefox replay is claimed.
- **LOW (F3): sanitize normalises -0 only at the end of the tick.** During the think phase, before sanitize, a -0 injected between ticks (as the 08-13 variant does) is visible to AI code. The test pilot uses only squared distances, so this is safe today. A future AI using `Math.atan2`, `Math.sign`, `1/x` or `Object.is` on a coordinate could diverge between a live world holding -0 and a restored world holding +0, because JSON cannot carry -0. In normal stepping no -0 survives a tick boundary, so the risk exists only with external mutation.

**Suggestions.**
- F1: specify per-pass buffer swapping in `step.ts` and add one sentence on the drain's complexity.
- F2: extend the gate with `\*\*` (for example `rg -n "\*\*\s*[^*/ ]" src/sim/world/*.ts src/sim/ai src/sim/sim.ts src/sim/rng.ts`, excluding comment lines), or note the operator in row (f).
- F3: either document in `sanitize.ts` and row (f) that AI code must not branch on the sign of zero, or have `snapshotWorld` refuse -0 so external injection is caught at the boundary, as it already is for non-finite values.

**Risk.** LOW.

### 08-12

**Summary.** Split step 9: frame loop and session start-up, with `game-session.ts` left as a facade.

**Concerns.** None in this lens. The Firefox run and the deviations are recorded (`08-12-PLAN.md:137`).

**Risk.** LOW.

### 08-13

**Summary.** The strict snapshot codec, the 1,000-tick live-versus-restored equality (hash plus exact JSON plus `toStrictEqual`), the parser rejection table, the sanitizer and parser agreement property, and cross-cadence world hashes with a launch and an arrival.

**Strengths.**
- The non-finite refusal in `snapshotWorld` (`08-13-PLAN.md:23`, `:115`) and the decidable converse (`:155`) resolve the Round 4 contradiction cleanly.
- `nextId` is accepted up to `2**32`, so the codec accepts every state `allocate` can reach (`:26`, `:152`).
- The parser reads each property once into a checked local (`:26`, `:153`), which is the correct anti-TOCTOU design.
- The property test spawns valid entities and then mutates fields in place, so `spawnEntity` validation never makes it vacuous (`:154`).
- The cross-cadence test pins the jump-step rule (`:205`).

**Concerns.**
- **HIGH (A1): the exact checkpoint comparison `JSON.stringify(snapshotWorld(live)) === JSON.stringify(snapshotWorld(restored))` (`08-13-PLAN.md:22`, `:116`, gate `:191`) fails for any test-pilot world under the behaviour the plans specify.** The mechanism has three parts:
  - The live params object keeps the insertion order of `createTestPilotAi`'s literal `{ phase, targetId, scanRange, holdRange, cruiseSpeed }` (`08-09-PLAN.md:122`). Spawn copies it onto `Object.create(null)` without sorting (`08-05-PLAN.md:159`), and sanitize re-sorts only when it repairs (`08-11-PLAN.md:184`).
  - `parseWorldSnapshot` "copies keys in code-unit sorted order" (`08-13-PLAN.md:115`), and `restoreWorld` deep-copies that order.
  - `snapshotWorld` is specified only to "deep-copy every value" (`:115`). It is not told to emit keys in a canonical order, and `JSON.stringify` follows insertion order for string keys.

  So the two strings differ at the very first checkpoint, even though the states are identical. Container evidence from the scratch script described in the Method section:
  ```
  live   {"params":{"phase":"seek","targetId":0,"scanRange":25600,"holdRange":1000,"cruiseSpeed":100}}
  parsed {"params":{"cruiseSpeed":100,"holdRange":1000,"phase":"seek","scanRange":25600,"targetId":0}}
  equal? false
  ```
  The same hazard applies to entity field order if `snapshotWorld` copies entities generically (for example by spreading) rather than with one fixed literal, because `spawnEntity` and `restoreWorld` each build entities with their own literal order. The must-have "Edge (FOUND-12, ordering): … snapshot, hash and restore never depend on object key order" (`08-13-PLAN.md:28`) is therefore false for `snapshotWorld`'s bytes as specified. I rate this HIGH under the Round 4 Priority-1 criterion: it is an acceptance check that fails deterministically under the plans' own specified behaviour. The obvious executor "fix" is to drop or weaken the exact comparison, which would reopen Round 4 item 10. A non-canonical byte form would also become Phase 11's save format (SAVE-07/08).
- **LOW (A2):** integer-like param keys such as `"9"` and `"10"` are enumerated in ascending numeric order whatever the insertion order (container output `{"9":3,"10":2,"b":1}`). Both sides of the comparison go through the same emitter, so equality holds once A1 is fixed. The "code-unit sorted" wording should still not be read as a promise about JSON byte order for such keys. Phase 11 should know this if it hashes save bytes.
- **LOW (A3):** the -0 variant (`:116`) holds for the test pilot but depends on 08-11 F3, because the live world holds -0 during the first post-restore think phase.

**Suggestions.**
- A1, the fix: in Task 1 step 1, make `snapshotWorld` emit a canonical form. Build every object (root, entity, vectors, quaternion, rng, nav, ai) as one fixed literal in a documented field order, and insert `ai.params` keys in code-unit sorted order, the same comparator the parser and the hash use. State that `snapshotWorld(restoreWorld(parseWorldSnapshot(JSON.parse(t))))` stringifies back to `t` for any `t = JSON.stringify(snapshotWorld(w))` (canonical fixpoint), and add that as a Task 2 row taken at tick 0, before the 1,000-tick run. It fails fast with a clear message instead of failing at checkpoint 50. Add to the ordering edge (`:28`) that the snapshot's JSON bytes are canonical, not merely that the hashes agree.
- Optionally pair this with 08-05 C1 (sorted insertion at spawn). Do not rely on that alone, because sanitize and AI writes can add keys later.

**Risk.** MEDIUM until A1 is fixed. LOW after a one-paragraph text edit.

### 08-14

**Summary.** Test flags read once, the manual-clock frame branch, and `advanceTicks(n)` with refusals, taint first and a shared drain path.

**Strengths.**
- `MAX_ADVANCE_TICKS = 200000` bounds a synchronous call. Commands go on the first tick only, and one immutable input frame is shared (structuredClone row, `08-14-PLAN.md:159`), which makes `advanceTicks(n)` equivalent to n single steps.
- The row for a step that throws (`:160`) defines the partial state precisely.

**Concerns.** None new. Worst-case cost with an empty world is negligible. With a populated world it is bounded by 200,000 × the per-tick bound noted under 08-07 D1, which only matters from Phase 12.

**Risk.** LOW.

### 08-15

**Summary.** The world lifecycle (bump-then-derive epochs, fresh worlds at 101, resume on Continue or Load), `stepSim` plugged into `stepOnce`, the no-save-leak checks, the step-cost benchmark, and the Firefox run.

**Strengths.**
- Every world is a pure function of `(marketSeed, epoch)` with ids restarting at 101 (`08-15-PLAN.md:31-32`). Warm and cold restores reset to epoch 0 identically (`:30`, `:39`), which is the right determinism shape before Phase 11 persists epoch.
- `begin` refuses `epoch >= 0xffffffff` and a non-finite `marketSeed` without throwing (`:31`), so `worldSeedFor`'s RangeError cannot fire in the frame loop. `resetForRestore` accepts exactly `0..0xfffffffe` (`:38`).
- The benchmark threshold is unchanged and best of three is allowed (`:37`, `:233`).

**Concerns.**
- **LOW (G1):** an in-flight resume derives its world from epoch 0 (`:30`), while the save was taken in some world at epoch k ≥ 1. So in Phase 8 a resumed in-flight world is never the world that was saved. This is acknowledged as the Phase 8 baseline, with Phase 11 passing `save.epoch`, and it is harmless while worlds are empty. Recording it explicitly in the lifecycle header would help Phase 11 avoid an off-by-one, since `resume(seed)` must derive from the restored epoch without bumping while `begin` bumps first.

**Suggestions.** In the `world-lifecycle.ts` header, state that `resume` uses `worldSeedFor(marketSeed, epoch)` without bumping, and why (it regenerates the anchored world), so Phase 11 keeps the leg-anchor semantics.

**Risk.** LOW.

### 08-16

**Summary.** The one deliberate probe commit (`probe.sim`, `worldHash`, `advanceTicks`), the Node replay helper, Vitest and browser tick parity, and the narrowed store gate.

**Strengths.**
- `worldHash` reads live state on demand and returns `""` when stale (`08-16-PLAN.md:35`). `""` cannot collide with an eight-hex fnv1a32 value.
- The parity claim is honestly scoped to one engine family and to an empty browser world (`:31-32`). The replay-equals-`hashFlight` cross-check (`:166`) stops both sides agreeing on the same wrong hash.
- The narrowed gate passes on the current tree, as verified above.

**Concerns.** None new in this lens.

**Risk.** LOW.

---

### Overall Risk Assessment

**LOW-MEDIUM.** All 14 Round 4 consensus items are resolved in the plan text with verifiable anchors, and the determinism architecture holds up:
- per-entity bijective forks
- plain uint32 stream state
- id-ordered passes over a length snapshot
- a bounded FIFO queue with exact accounting
- one shared numeric domain across spawn, control, sanitize and parse
- an injective ASCII hash line
- exact-JSON restore checks

One new finding blocks an acceptance criterion: **A1 (HIGH, 08-13)**. `snapshotWorld` does not emit a canonical key order, so the exact live-versus-restored JSON comparison fails on the first checkpoint for test-pilot params, which I demonstrated in the container. It needs a one-paragraph edit to 08-13 Task 1 step 1, plus a canonical-fixpoint row in Task 2, with an optional supporting edit in 08-05. Everything else is LOW: an unquantified Weyl-overlap bound, the drain primitive's complexity, the `**` gate gap, -0 visibility during think, the purpose-code lookup, scan cost bounds, and resume-epoch documentation.

**Verdict: NEEDS REVISION.** The revision is limited to 08-13 (A1). No wave, dependency or file-ownership change is needed. The other plans are ready as written.

---

## Adversarial & Trust-Boundary Review (reviewer-adversarial-opus)


Lens: adversarial input and trust boundaries. That covers hostile or corrupt snapshot and save input, prototype keys, caps, validators versus sanitizers, lint-guard evasion, ways determinism can escape, test hooks reaching production, and persistence and security risks.

Commit reviewed: `afc4fe0`. I read all of 08-05 and 08-13 in full. For 08-07, 08-09, 08-11, 08-14, 08-15 and 08-16 I read the must_haves and the tasks this lens touches. For 08-01, 08-02, 08-03, 08-04, 08-06, 08-08, 08-10 and 08-12 I read the objectives plus targeted `rg` sections. I checked source anchors in `src/app/game-session.ts`, `src/app/probe.ts`, `src/persistence/save.ts`, `src/persistence/autosave.ts` and `src/sim/math.ts`; codebase-memory coverage reports `no_recorded_issue` for all five. I ran no container. Every finding below comes from reading plan text against source.

### Round 4 consensus check (items 1-14)

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

### New findings (summary)

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

### 08-01

**Summary:** Step 0: a concatenating source helper, the probe-shape pin and the local verify-full baseline on a worktree.

**Strengths:** The probe-shape snapshot is the trust anchor for every later hook change. `08-16-PLAN.md:143` builds a subtractive check on it. `advanceTicks` stays a function, so the Round 4 contract holds.

**Concerns:** None new under this lens.

**Suggestions:** None.

**Risk:** LOW.

### 08-02

**Summary:** A serialisable mulberry32 `RngState`, mix32/fmix32, `worldSeedFor`/`forkSeed`, and `createSeededRandom` delegating to it.

**Strengths:** Literal vectors land in the same commit as `rng.ts` (`08-02-PLAN.md:196,214`). `forkSeed` throws `RangeError` on a bad epoch or entityId, and the fixed-step callers pre-guard (`08-02-PLAN.md:193`). mulberry32 has no zero fixed point (`src/sim/math.ts:227-235`), so an arbitrary uint32 state from a snapshot is safe. The ledger correctly notes that every stream walks the same Weyl cycle (`08-02-PLAN.md:198`).

**Concerns:** None new.

**Suggestions:** None.

**Risk:** LOW.

### 08-03

**Summary:** The src/sim determinism bans, the reflection and alias selectors, and the `entity-id-scope` source-scan guard.

**Strengths:** The Round 4 additions close the eval, Function, Intl, localeCompare and computed-sort gaps, each with a probe (`08-03-PLAN.md:27,150,170`). The guard lands in wave 1, before `ids.ts` exists (`08-03-PLAN.md:32,60`).

**Concerns:**
- **LOW (N8):** `findEntityIdLeaks` (`08-03-PLAN.md:194`) reports only imports that resolve to `src/sim/world/ids` and the `EntityId` token. In Phase 8, ids already cross into `src/app` as plain numbers in two ways. First, `SimEvent` payloads such as `entityRemoved {id}` and `shipDestroyed {id, killer}` (`08-11-PLAN.md:39`) pass through the app's event router. Second, `Entity["id"]` or `WorldView`-derived types can name an id without the token. The rule "consumers never store the id" (`08-11-PLAN.md:39`) is documentation only. The plan documents residuals for the lint guards (T-08-38) but not for this guard.

**Suggestions:** Add a residual note to the guard header and to Key Decisions row (d). The guard is "necessary, not sufficient": ids arrive as `number` through `SimEvent` payloads, and the first app subscriber that stores one (a Phase 12 HUD target) must arrive with the boundary-clearing row that `08-05-PLAN.md:224` already requires.

**Risk:** LOW.

### 08-04

**Summary:** Split steps 1 and 2. The closure state moves into a typed `SessionState` ctx, and the probe publisher is extracted.

**Strengths:** The probe publisher builds fresh plain objects, and `withdrawProbe` deletes the test, save and saveScreen fields (`08-04-PLAN.md:154`).

**Concerns:**
- **LOW (N7):** Before the split, `testTainted` is a closure `let` (`src/app/game-session.ts:475`). Its only writes are the initializer and `= true` in the hook callback (`:1039`), so the taint latches by construction. After step 1 it becomes the field `ctx.runtime.testTainted`, writable by every module that receives `ctx` (station, save, hyperspace, sim driver, frame loop). Every durable-save guard (`src/app/game-session.ts:1224,1261`) depends on it never going back to false. No plan gates that.

**Suggestions:** Add a cheap gate to 08-04, re-asserted in 08-08 and 08-12. `rg -n "testTainted\s*=\s*false" src/app` must print nothing; the initial value is set only in `createSessionState`'s object literal. Alternatively, expose a setter that latches only (`markTainted()`).

**Risk:** LOW.

### 08-05

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

### 08-06

**Summary:** Split steps 3 and 4: the render driver, then the chart and settings controllers.

**Strengths:** These are UI-only moves. No new trust boundary, and the redraw-gate count is pinned.

**Concerns:** None under this lens.

**Suggestions:** None.

**Risk:** LOW.

### 08-07

**Summary:** A read-only `WorldView` and a write-only `ShipControl` over the world, the layout and the live player.

**Strengths:** The view returns fresh plain copies (`08-07-PLAN.md:24`). Control writes are limited to the actor and validated against `limits.ts`. `scheduleWake` requires a safe integer of at least 1 that cannot overflow uint32 (`:117,153-154`). Ids are world-scoped, with a cross-world negative test (`:32`).

**Concerns:**
- **LOW (residual, feeds N6):** The seam's validation covers only `ShipControl`. `AiContext.ai` is the actor's live, mutable `AiComponent` (`08-09-PLAN.md:120`), so an AI can write NaN, a nested object or an over-long string straight into `ai.params` and the timers. That bypasses the item 12 guarantee ("a legitimate AI write is never turned into hashed sanitize repair noise") and lands as a `repairs` increment one tick later. This is acceptable by design, but it is not stated.

**Suggestions:** State in `control.ts` or `types.ts` that writes to `ai.params` and the timers through `ctx.ai` are trusted, and that sanitize repairs them (counted in `repairs`). Alternatively, offer a `ctl.setParam` that validates.

**Risk:** LOW.

### 08-08

**Summary:** Split steps 5 and 6: the station controller, then the save controller with the in-session Load.

**Strengths:** The order of the save guards is unit-proven: `recovering` first, then `tainted`, with the attempt counter incremented first (`08-08-PLAN.md:26,150`). `src/persistence` is unchanged (T-08-14). The added `disposed` guards are recorded as deliberate deviations (`:146,165`).

**Concerns:**
- **LOW (N7, continued):** The save controller is the main reader of `ctx.runtime.testTainted`. Nothing proves the move adds no `testTainted = false` (for example an in-session Load that "resets" state). Today the taint latches across a Load (`06-REVIEW` IN-01).

**Suggestions:** Re-run the N7 gate at step 6. Add one Node row: after a Load on a tainted session, `ctx.runtime.testTainted` is still true.

**Risk:** LOW.

### 08-09

**Summary:** The AI types, the time base, the frozen registry, the scripted test pilot and the AI lint zone.

**Strengths:** Exact `paths`/`importNames` bans on `createSeededRandom`, covering the alias and namespace-import forms (`08-09-PLAN.md:192`). A depth-3 catch-all rejects every import (`:191`). Case-sensitive allow-list regexes are pinned by a table read from the effective config (`:198`). `AI_MODULE_STATE_BANS` is spread into every block, and its residuals are documented (`:193`). The re-export surface of the four seam modules is sealed (`:197`).

**Concerns:**
- **LOW (N9):** Function-object properties are module-level state the lint cannot see: `function think(ctx) { think.calls = (think.calls ?? 0) + 1 }`, or `TEST_PILOT`-adjacent helpers carrying expando fields. They are not in the documented residual list (`:193` lists IIFE, `as const`, shallow freeze and class statics). `Object.freeze(TEST_PILOT)` freezes the module object, not the function objects it references.
- **Cross-ref (N1):** The pilot's params insertion order (`:122`) is the concrete trigger for the 08-13 failure.

**Suggestions:** Add "properties assigned on function objects" to the residual comment. Optionally add a selector, `AssignmentExpression[left.type="MemberExpression"][left.object.type="Identifier"]`, restricted to identifiers bound to top-level function declarations. Or freeze the functions that `TEST_PILOT` references.

**Risk:** LOW.

### 08-10

**Summary:** Split steps 7 and 8: the atomic hyperspace move, the ordered event router and the sim driver with `stepOnce` and the step-options builder.

**Strengths:** `isRoutedKind` rejects `"constructor"` and `"toString"` (`08-10-PLAN.md:165`), so the routing table cannot be read through the prototype. The signature is aligned.

**Concerns:** None new.

**Suggestions:** None.

**Risk:** LOW.

### 08-11

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

### 08-12

**Summary:** Split step 9: the frame loop and session start-up wiring, with game-session.ts left as a facade.

**Strengths:** Firefox is run (non-blocking). The deviations are recorded. The facade export set is pinned.

**Concerns:** The N7 gate should hold after step 9 (start-session now builds `ctx`).

**Suggestions:** Include the `testTainted = false` gate in the step-9 pinned-literal audit (`08-12-PLAN.md:121`).

**Risk:** LOW.

### 08-13

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

### 08-14

**Summary:** `parseTestFlags`, the manual-clock frame branch, `advanceTicks` with `MAX_ADVANCE_TICKS`, and the shared drain path.

**Strengths:** The flags are exact-match and inert without `test=1` (`08-14-PLAN.md:27,118,152`). `advanceTicks` taints before its first step, so the pre-launch autosave inside the shared drain skips (`:58,125`). Refusals do not taint (`:153`). A throw mid-run leaves the session tainted with the tick advanced by exactly one (`:160`). The self-DoS residual is documented (T-08-29).

**Concerns:** None new. The synchronous arrival install (see 08-11) means `advanceTicks` across a jump steps the new world with the destination layout, so no mid-call mismatch arises.

**Suggestions:** None.

**Risk:** LOW.

### 08-15

**Summary:** The world lifecycle (begin, resume, end, `resetForRestore`), the `stepSim` plug-in at `stepOnce`, the save allow-list proof and the Firefox run.

**Strengths:**
- The world is read live on every step, and a gate forbids caching it (`08-15-PLAN.md:132,149`).
- `begin` refuses `epoch >= 0xffffffff` and a non-finite seed. `resetForRestore` accepts only `0..0xfffffffe` (`:31,39`). That is good preparation for a corrupt Phase 11 epoch.
- `resume(marketSeed)` receives a seed already validated as an integer in `0..0xffffffff` by the save schema (`src/persistence/save.ts:169,255`).
- The no-world-in-save proof checks both the top-level allow-list and the key substrings (`:35`).

**Concerns:** None new under this lens. N2 and N3 are Phase 11 inheritances; this plan writes no world state to the save.

**Suggestions:** Add a forward note to the Key Decisions row: before Phase 11 persists a world snapshot, N2 (aggregate budget) and N3 (`snapshotWorld` self-validation) must be closed.

**Risk:** LOW.

### 08-16

**Summary:** The one deliberate probe commit (`probe.sim`, `worldHash`, `advanceTicks`), the Node replay, Vitest parity and the tick-hook browser spec.

**Strengths:** `worldHash` returns `""` without a state or after dispose (`08-16-PLAN.md:129,212`). `probe.sim` is a fresh plain object with no references, and the test proves it (`:165`). The store gate is now correct (`:146`). Hook growth is limited to two methods (T-08-32). `probe.sim` is also published in production, because the probe is always installed (`src/app/probe.ts:368`), but it carries only scalars, so nothing writable reaches page script.

**Concerns:**
- **LOW (N2, continued):** `worldHash()` is a synchronous `hashWorld`. With a cap-filled world it can throw `RangeError` (string length). Phase 8 has no populator, so this is latent.

**Suggestions:** None beyond N2.

**Risk:** LOW.

### Overall Risk Assessment

**MEDIUM.** All 14 Round 4 consensus items are resolved with concrete plan text. The trust boundaries (parser, sanitizer, spawn, control and dispatch) are now aligned on one limits module and use own-key, `includes`-based membership throughout.

One new HIGH (N1) remains, and it is an acceptance criterion that cannot pass as written. 08-13's exact snapshot-JSON checkpoint compares a live world whose test-pilot params keep insertion order with a restored world whose params the parser rebuilds in sorted order. The same gap is a latent determinism escape for any AI that iterates its params. The fix is a few sentences in 08-05, 08-11 and 08-13: canonical sorted params order at spawn, at sanitize and in `snapshotWorld`.

The two MEDIUMs (N2 aggregate world size, N3 `snapshotWorld` emitting what its parser rejects) matter mainly at the Phase 11 save boundary, which this codec explicitly feeds. They should be fixed now while the format is version 1. The LOWs are documentation or one-line gates.

**Verdict: NEEDS REVISION.** These are targeted text edits to 08-05, 08-11 and 08-13 (N1 required; N2 and N3 strongly recommended), plus optional LOW gates in 08-03, 08-04, 08-08, 08-09 and 08-12. No wave, dependency or ownership change is needed.

---

## Broad-Context & Blast-Radius Review (reviewer-context-sonnet)


Commit under review: `afc4fe0`. Lens: what existing code, tests, e2e specs, docs, CHANGELOG/NOTICE and Docker gates the 16 plans touch or break; requirement and roadmap coverage; scope creep; executor ergonomics.

### Coverage statement (read this first)

The 16 plans total about 1.05 MB of text (`08-05` and `08-11` alone are 73-75 KB). I did **not** read every line of every plan. What I did read:

- The frontmatter (`files_modified`, `depends_on`, `wave`, `requirements`, `estimate`, `must_haves.artifacts`, `key_links`) and objective of all 16 plans.
- Every Round 4 disposition row (`| R4-nn |`) in all 16 plans, each followed up with an `rg -n` into the current plan text for the claimed edit.
- The full `<action>`, acceptance and verify text of `08-15` (all three tasks) and `08-16` (both tasks), and `08-12` Task 1 steps 2 to 6 and Task 2, plus `08-01` Task 1 step 6.
- `08-VALIDATION.md` (first 60 lines), the ROADMAP Phase 8 section (goal, success criteria, wave list) and PROJECT.md lines 1-80.

Plans `08-02`, `08-04`, `08-05`, `08-06`, `08-07`, `08-08`, `08-09`, `08-10`, `08-11`, `08-13` and `08-14` were read at frontmatter, objective and Round 4 row level only; their verdicts below rest on those rows, on source checks of their cited claims, and on the cross-plan checks listed. Treat their "Strengths" as source-verified claims, not a line-by-line audit.

### Round 4 consensus items (1-14) against the current plan text

| # | Item | Status | Evidence (current plan text) |
|---|------|--------|------------------------------|
| 1 | NaN in `ai.params` cannot be "rejected after JSON"; generator lacks null/boolean | **Resolved** | `08-13-PLAN.md:25` (`non-finite` is a third `SnapshotError` reason thrown by `snapshotWorld` before serialization), `:35`, `:154`; domain half at `08-05-PLAN.md:351` (R4-05: `ParamValue` null/boolean legal scalars, no non-finite anywhere); `08-13-PLAN.md:290` (R4-01) lists all three parts. |
| 2 | `rg "world/store\|\.store\b" src/app` can never print nothing | **Resolved** | Gate narrowed at `08-16-PLAN.md:146` to `sim/world/store\|world\??\.store\b\|\.store\??\.(live\|get\|allocate\|kill\|commit\|nextId)\b\|\bEntityStore\b`. I ran it against current `src/app`: no match, exit 1 (baseline holds). The `SaveStore` interface (`src/persistence/store.ts:34-45`) has only `read/write/clear/backupCorrupt/dispose`, so `saveBoot.store.*` (`src/app/game-session.ts:1167,1341,1490,3345`) can never match `.store.(live\|get\|...)`. `08-08-PLAN.md:262` records the no-change disposition. |
| 3 | `advanceTicks` must be an always-present function | **Resolved** | `08-16-PLAN.md:128` (`WegoliteSimTestHook.advanceTicks` required; refuses by returning the current tick, never `undefined`), `:146` (fixture check: `advanceTicks === "function"` in both `testHookDocked` and the new `testHookManualDocked`), `08-01-PLAN.md:138` (standing contract recorded in the spec header), `08-14-PLAN.md:274`. Source check: `createTestHook` has exactly one call site (`src/app/game-session.ts:1035`) and is referenced nowhere in `tests/`, so the new required 5th parameter breaks nothing else. |
| 4 | Shared limits defined three times | **Resolved** | `08-05-PLAN.md` frontmatter lists `src/sim/world/limits.ts` (single definition site); `08-11-PLAN.md:202` and `08-13-PLAN.md:129` gate `from "./limits.js"` and forbid `^export const` in `sanitize.ts`/`snapshot.ts`. |
| 5 | Enum fields unchecked at spawn / not repaired / `registry[aiKey]` | **Resolved** | `08-05-PLAN.md:348` (spawn `includes` over closed vocabularies); `08-11-PLAN.md:35` and `:355` (`Object.hasOwn` own-key lookup via `aiModuleFor`, sanitize rule 9); `08-13-PLAN.md:295` (property mutates all four leaves with `"constructor"`, `"__proto__"`). |
| 6 | Non-unit quaternions pass spawn/sanitize but fail the parser | **Resolved** | `08-05-PLAN.md:349` (spawn refuses `abs(normSq-1) > QUAT_UNIT_TOLERANCE`, `MIN_QUAT_NORM_SQ` defined), `08-11-PLAN.md:178` and `:356` (degenerate-norm rule plus re-check), `08-13-PLAN.md:292` (`{w:1e-160}`, `{w:3e-161}` rows). |
| 7 | `worldSeed` never checked as uint32 | **Resolved** | `08-05-PLAN.md:350` (`createWorld` throws `RangeError` outside `0..MAX_UINT32`), `08-13-PLAN.md:293` (parser integer in `0..MAX_UINT32`, rows 1.5, -1, 2**32, null). |
| 8 | `createEventRouter` signature contradicts itself | **Resolved** | `08-10-PLAN.md:40` and `:277` (`createEventRouter(ctx, subscribers)`, ctx required), `08-15-PLAN.md:133` and `:332`. No `createEventRouter(subscribers)` form remains in either plan. |
| 9 | Lint guard gaps | **Resolved** | `08-03-PLAN.md:27,152,170,300-301` (`no-eval`, `no-new-func`, `Intl`, `localeCompare`, computed `sort["call"]`); `08-09-PLAN.md:303-308` (`importNames` ban on `createSeededRandom`, `AI_MODULE_STATE_BANS`, inherited bans re-proved inside the zone); `08-02-PLAN.md:315` (text scan covers aliases). Existing `src/sim` has no violators of the new bans (I searched `src/sim` for `.sort(`, `for..in`, `localeCompare`, `Intl`, `Date`, `performance.now`, `setTimeout`: only a comparator sort at `src/sim/economy/market.ts:169`, which passes). |
| 10 | Restore check is a rounded-hash comparison | **Resolved** | `08-13-PLAN.md:22`, `:116`, `:294` (exact `JSON.stringify(snapshotWorld(...))` equality at every checkpoint plus `toStrictEqual` on players). |
| 11 | AI drain limits passes, not deliveries | **Resolved** | `08-11-PLAN.md:43` (`MAX_AI_EVENTS_PER_DRAIN = 4096`), `:171`, `:358` (`MAX_AI_QUEUE_LENGTH`, `postAiEvent` validates `a`, `b`, `n`). |
| 12 | `ShipControl` accepts out-of-domain values | **Resolved** | `08-07-PLAN.md:154` ("control domain" row: 1e13 ignored) and `:268` (checked against `limits.ts`; ignored, not clamped). |
| 13 | No Firefox run | **Resolved** | `08-12-PLAN.md:123,137` (non-blocking `e2e-cross` on the step-9 worktree), `08-15-PLAN.md:216,232` (repeated after verify-full). Source check: `compose.yaml:66-77` `e2e-cross` builds then runs `npm run test:e2e:cross`; `playwright.config.ts` Firefox project matches only `engine` and `core-loop` specs, so the run costs little and is correctly kept out of the gates (`tests/contract/container-contract.test.ts:273-293` pins that). |
| 14 | Deliberate deviations, best-of-N benchmark, stale anchors | **Resolved** | `08-08-PLAN.md:260-261`, `08-12-PLAN.md:118,266-267` (SUMMARY section "Deliberate deviations from a verbatim move"), `08-15-PLAN.md:214` (best of 3 attempts, unchanged threshold), "locate by name or pattern" in the executor briefs of `08-04`, `08-06`, `08-08`, `08-10`, `08-12`. Anchors checked and accurate at HEAD: `pending.length = 0;` x4 at `game-session.ts:2738,2749,2773,2859`; `redrawGate.request();` x5; `generateMarket(` x3; `swapSystem` at `:3284`; the two `window.addEventListener` sites at `:2268,2289`. |

All 14 are closed in the plan text. I found no regression of a Round 3 item.

### 08-01

**Summary.** Test-only safety nets (probe-shape spec, fixture, comparator, `sessionSource()` helper, re-pointed scans, `test:e2e:fast` gets the new spec, D-01 baseline on a detached worktree). No `src/` change.

**Strengths.**
- The blast radius on text-reading tests is exactly as claimed: only `tests/guards/economy-purity.test.ts:312,322` and `tests/app/redraw-gate.test.ts:113` read `game-session.ts`; `tests/e2e/budget.spec.ts:15` and `tests/e2e/hyperspace-failure.spec.ts:43` only mention it in comments. Both real readers are re-pointed here.
- The `test:e2e:fast` edit is paired with its pin: `tests/contract/container-contract.test.ts:336-343` pins the exact script string and spec count 3, and the plan names that file in `files_modified`. The new spec name `probe-shape.spec.ts` matches that test's regex `tests/e2e/[a-z-]+\.spec\.ts`.
- Baseline-worktree route (`-p wegolite-baseline`, no `--build`) is sound against `compose.yaml:1-30`: `name: wegolite` is overridden by `-p`, the named `node_modules` volume becomes project-scoped, and the `image: wegolite-ci` tag is reused. `5b189e4` is a docs-only commit; `git diff --stat 5b189e4 HEAD -- src tests package.json compose.yaml eslint.config.js` is empty, so the baseline is the current code.

**Concerns.**
- LOW: ROADMAP.md (Phase 8 "Todos" line) still says the Shift+C docking flake "is settled before the split starts", while CONTEXT `D-01` (`08-CONTEXT.md:26,128`) says the owner chose to ignore it and the todo stays untouched (`todos/pending/2026-11-11-check-ci-after-0-2-0-and-the-shift-c-docking-timeout.md` still carries `resolves_phase: 8`). `08-01` follows D-01 correctly (one rerun, recorded), but nothing reconciles the ROADMAP wording or the todo's `resolves_phase`. A later `/gsd-verify-work` could flag the todo as unresolved for Phase 8.
- LOW (unverified): the objective says "25 browser specs read `window.__wegolite`"; `rg -l "__wegolite|getProbe" tests/e2e/*.spec.ts` finds 24 of 25 spec files. Probably a counting nuance; not load-bearing.

**Suggestions.** Add one sentence to the `08-01` SUMMARY requirements (or edit the ROADMAP todo line) saying the Shift+C todo is deliberately carried past Phase 8 under D-01.

**Risk:** LOW.

### 08-02

**Summary.** Pins pre-phase flight hashes and RNG vectors, makes `createSeededRandom` delegate to `rngNext`, adds `mix32`/`worldSeedFor`/`forkSeed`, scan test banning closure-held streams.

**Strengths.**
- Golden policy respected: `tests/golden/world/` is a new directory; no existing golden is regenerated (`08-02-PLAN.md:90`). `.prettierignore` does not cover `tests/golden/world`, and the plan runs `npx prettier --write tests/golden/world` (`:132`), so `npm run lint` (`prettier --check .`) stays green.
- Edits `src/sim/math.ts` only through delegation with an identical sequence, pinned by the new goldens taken against the unmodified file.

**Concerns.** None new. (Frontmatter: `autonomous: false`, three tasks, estimate 115k accepted by the owner.)

**Suggestions.** None.

**Risk:** LOW.

### 08-03

**Summary.** Determinism lint bans in `src/sim`, shared probe helper `withSimProbe`, entity-id scope guard.

**Strengths.**
- Existing helpers the plan builds on exist: `tests/guards/eslint-gate.ts`, `tests/guards/probe-lock.ts`, and `__purity_` is the prefix `tests/compliance.test.ts` already skips.
- The new bans do not break current code (see item 9 above), and `Date`/wall-clock bans already existed at `eslint.config.js:137-149`, so the new work is additive.

**Concerns.**
- **MEDIUM: transient probe directories race with `tests/compliance.test.ts`, which no plan edits.** `withSimProbe` creates and then removes "every missing directory on the way" (`08-03-PLAN.md:112`), and `08-09-PLAN.md:196,235` adds nested probes at `src/sim/ai/nested/` and `src/sim/ai/pilots/roles/`. The `__purity_` prefix protects only *files*. `tests/compliance.test.ts:66-77` (`collectSourceFiles`) walks the whole repo with an unguarded `readdirSync` recursion: it skips only `.planning`, `node_modules`, etc., and has no `try/catch`. If a parallel Vitest worker removes `src/sim/ai/nested/` between the compliance walk's `readdirSync(parent)` and its `readdirSync(nested)`, the compliance test throws `ENOENT`. `withProbeLock` (`tests/guards/probe-lock.ts`) serialises only guard tests that call it, and Vitest runs files in parallel (`vitest.config.ts` sets no `fileParallelism`). The plan fixes the same hazard for `sim-purity.test.ts` `listTsFiles` (`:114`) and `entity-id-scope` (`:195`) but not for compliance. The `.probe-lock` directory at the repo root already carries the same latent race today, so this widens an existing flake class rather than creating one; with dozens of probes it becomes visible in `docker compose run --rm test`, the very command that is the source of truth.
- LOW: the sub-task count is three tasks and about 90k tokens, within budget, but `eslint.config.js` is later edited again by `08-09`; both plans say so explicitly, so this is only an executor note.

**Suggestions.** Either add `tests/compliance.test.ts` to `08-03` `files_modified` and make `collectSourceFiles` tolerate `ENOENT` (and skip `__purity_*` directories), or have `withSimProbe` take the same lock around nothing but create probe files into directories that already exist (pre-create `src/sim/ai/nested`-style fixtures permanently, or use a single flat probe directory).

**Risk:** LOW-MEDIUM (one flake source, easy edit).

### 08-04

**Summary.** Split steps 1-2: typed `SessionState` context and the probe publisher out of `game-session.ts`; first use of `createSessionState`.

**Strengths.**
- Source anchors verified (see Round 4 item 14). Coverage thresholds are checked: `vitest.config.ts:19-61` covers only `src/sim`, `src/persistence`, `src/content`, so new `src/app/session/**` files cannot fail a threshold; `08-04-PLAN.md:237` already records that check (R2-01).
- Prohibition block (`08-04-PLAN.md` frontmatter) forbids editing `probe.ts`, the fixture, the two re-pointed tests or any golden to make a step pass.

**Concerns.** None new. Estimate 185k tokens against a 100k smart zone is an accepted risk (owner, 2026-11-12), noted below under scope.

**Suggestions.** None.

**Risk:** LOW-MEDIUM (3k-line mechanical rewrite; the guard set is strong).

### 08-05

**Summary.** World foundation: `ids.ts`, `limits.ts`, `ai/types.ts`, entity, store, world, serialize/hash; PROJECT.md decision rows.

**Strengths.**
- Round 4 items 4-7 are all landed here (see table). `liveEntityCount` is exported as a primitive count so `src/app` never needs the store (feeds `08-16`).
- Existing `src/sim/world/` already holds `layout.ts` and `aegis.ts`; the new files do not collide with them, and `src/sim/flight/sanitize.ts` has a different name from the planned `src/sim/world/sanitize.ts`.

**Concerns.** None new; the 75 KB plan is the largest in the set (executor ergonomics note below).

**Suggestions.** None.

**Risk:** LOW-MEDIUM.

### 08-06

**Summary.** Split steps 3-4: render driver, chart controller, settings controller; `verify-full` gate on a worktree.

**Strengths.**
- Keeps the single pinned `renderFrame(alpha, shouldDraw())` call and redraw-gate literals; R4-02/R4-03 dispositions explain why no Firefox run is added at this step (rAF and window listeners do not move until step 9).

**Concerns.** None new.

**Suggestions.** None.

**Risk:** LOW-MEDIUM.

### 08-07

**Summary.** `WorldView`/`ShipControl` types and implementations, control-domain checks against `limits.ts`.

**Strengths.** Pure `src/sim`, no new dependency; ignore-not-clamp semantics are stated and tested (`08-07-PLAN.md:154,268`).

**Concerns.** None new.

**Suggestions.** None.

**Risk:** LOW.

### 08-08

**Summary.** Split steps 5-6: station and save controllers, `verify-full` gate.

**Strengths.** Moves `saveBoot.store` verbatim, which the narrowed `08-16` gate now tolerates; deliberate `disposed` guards are recorded as deviations (`:260`).

**Concerns.** None new.

**Suggestions.** None.

**Risk:** LOW-MEDIUM.

### 08-09

**Summary.** AI types, integer-tick time, registry, scripted test pilot, AI lint zone with `importNames` and module-state bans.

**Strengths.** Probe basenames use `__purity_` (`08-09-PLAN.md:196`) and re-prove inherited bans inside the zone.

**Concerns.** MEDIUM (shared with `08-03`): the nested probe directories named at `:196,235` are the ones that can race `tests/compliance.test.ts` (see `08-03`). Resolve in `08-03`; nothing else to change here.

**Suggestions.** None beyond the `08-03` fix.

**Risk:** LOW-MEDIUM.

### 08-10

**Summary.** Split steps 7-8: hyperspace controller, event router, sim driver, step options.

**Strengths.** One `createEventRouter(ctx, subscribers)` signature (`:40,:277`); declared no-edge same-wave ordering with `08-11` is argued in the plan and in `08-VALIDATION.md`.

**Concerns.** None new.

**Suggestions.** None.

**Risk:** LOW-MEDIUM.

### 08-11

**Summary.** `stepWorld`, `stepSim`, `sanitizeEntity`, reserved `SimEvent` kinds, AI event drain with delivery and queue caps.

**Strengths.**
- `src/sim/sim.ts` does not exist today (verified), so `stepSim` is a new symbol and no existing caller or test needs a signature change; the "v1 goldens untouched" claim is not endangered by it.
- Widening `SimEvent` in `src/sim/events.ts` is safe against current consumers: only `src/sim/{flight,dock}/*`, `src/app/game-session.ts` and three tests reference it, and the router keys on `RoutedKind` (`08-10`), so no exhaustive switch breaks.

**Concerns.** None new.

**Suggestions.** None.

**Risk:** LOW-MEDIUM.

### 08-12

**Summary.** Split step 9: frame loop, `start-session.ts`, thin facade; step-9 `verify-full` plus non-blocking Firefox run.

**Strengths.**
- `window.addEventListener` sites and the unguarded `swapSystem` (`game-session.ts:3284-3294`) match the plan's description exactly, so "deliberate deviation" bookkeeping is accurate.
- Worktree gate cleanup is spelled out (worktree, volumes, containers).

**Concerns.**
- LOW: the acceptance check "`rg -c "addEventListener\("` equals `rg -c "uiController\.signal"` at the listener sites" compares per-file counts across several files; today both are 2 in one file (`game-session.ts:2268,2270,2289,2291`), but `uiController.signal` is also passed to other modules after the split, so a naive equality can fail or pass by accident. State it as "every `addEventListener(` call site has `signal: ...uiController.signal` in the same call" and check call by call.

**Suggestions.** Reword that acceptance line as above.

**Risk:** LOW-MEDIUM.

### 08-13

**Summary.** Snapshot codec with `non-finite` refusal, exact 1,000-tick live-vs-restored equality, cross-cadence world hash.

**Strengths.** Closes Round 4 items 1, 4, 5, 6, 7, 10 in text (see table). Uses the existing `fast-check` devDependency (`package.json`), so no CHANGELOG, NOTICE or `ASSETS.md` entry is needed.

**Concerns.** None new.

**Suggestions.** None.

**Risk:** LOW-MEDIUM.

### 08-14

**Summary.** `parseTestFlags`, manual-clock frame branch, `advanceTicks` in the driver, no probe change.

**Strengths.** Driver-level refusal is the single owner of the refusal rule that `08-16` inherits; ten-file scope note is explicit.

**Concerns.** None new. (CHANGELOG: query flags behind `?test=1`, no player-visible change; the stated "no entry" matches the AGENTS.md rule.)

**Suggestions.** None.

**Risk:** LOW.

### 08-15

**Summary.** The one integration plan: lifecycle module, epoch bump points, `stepSim` in the driver, anchored-save proof, step-cost check, `verify-full`, Firefox run.

**Strengths.**
- Anchored-save test uses an exact key allow-list rather than a vacuous substring check, and the plan states the six forbidden keys were checked absent in `src/persistence` at planning time.
- The hot-path benchmark lives in `/tmp/wegolite-perf` and is mounted with `-v` (AGENTS.md scratch rule), best of 3, threshold unchanged (Round 4 item 14).
- Durable purity guard for the two Node-importable session files lives in a Vitest file, so it runs in every `docker compose run --rm test`.

**Concerns.**
- LOW: the benchmark verdict is recorded only in the SUMMARY; `docs/PERFORMANCE.md` (exists) is the project's frame-budget document, and QUAL-01 is still open. A one-line pointer there would keep Phase 23's budget work from rediscovering the numbers. Optional.

**Suggestions.** Optional pointer in `docs/PERFORMANCE.md`; otherwise no change.

**Risk:** MEDIUM (it changes the runtime path of every flight, but it is the most heavily gated plan: lifecycle unit tests, `verify-full`, Firefox, benchmark, hash identity).

### 08-16

**Summary.** The one deliberate probe commit: `probe.sim`, `worldHash`, `advanceTicks`, fixture update, tick-hook spec, browser/Node parity.

**Strengths.**
- Round 4 items 2 and 3 both land here with source-consistent regex and a defined refusal contract (`:128,:146`). Five tests are enumerated in `tick-hook.spec.ts` and the verify line demands at least five passes (`Task 2 <verify>`), consistent.
- Precedent for a Playwright spec importing pure `src` modules with `.js` specifiers exists (`tests/e2e/helpers/chart.ts:16-17`, `tests/e2e/hud.spec.ts:16`, `tests/e2e/throttle.spec.ts:19`), and A7 has a fixture fallback.
- The new JSON fixtures live under `tests/fixtures`, formatted by Prettier in the plan; `tests/compliance.test.ts` only walks `.ts/.js/.sh`, so JSON needs no SPDX header.

**Concerns.** None new.

**Suggestions.** None.

**Risk:** LOW-MEDIUM.

### New findings (summary, severity ordered)

1. **MEDIUM (`08-03-PLAN.md:112`, `08-09-PLAN.md:196,235`; `tests/compliance.test.ts:66-77`)**: transient probe *directories* under `src/sim` race the unguarded repo walk in `tests/compliance.test.ts`; `__purity_` protects files only and compliance is in no plan's `files_modified`. Fix by making `collectSourceFiles` ENOENT-tolerant and `__purity_`-directory-aware, or by not creating transient directories.
2. **LOW (`08-01`, ROADMAP Phase 8 Todos line, `todos/pending/...shift-c...`)**: ROADMAP says the Shift+C flake is "settled before the split"; CONTEXT D-01 says ignore it and the todo (`resolves_phase: 8`) stays open. Reconcile the wording.
3. **LOW (`08-12-PLAN.md` Task 1 acceptance)**: per-file `rg -c` equality between `addEventListener(` and `uiController.signal` counts is fragile after the split; check per call site instead.
4. **LOW (`08-15` Task 3 step 5)**: optional pointer from the benchmark result into `docs/PERFORMANCE.md`.

### Blast radius, requirements and ergonomics (cross-cutting)

- **Existing tests and specs.** Only two Vitest files read `game-session.ts` as text, both re-pointed in `08-01`. No test imports `createTestHook`. `tests/app/*.test.ts` import individual modules, not session internals, so the public facade staying unchanged (`08-12`) protects them. The 25 e2e specs read the probe, which is frozen by `08-01` until the single additive commit in `08-16`.
- **Docker gates.** `verify` (`compose.yaml:92-109`) and `verify-full` are untouched; `container-contract.test.ts` pins both chains and the Firefox exclusion, and `08-01` updates the one script pin it must. Using `-p wegolite-gate-<id>` worktrees works with `compose.yaml` (`name: wegolite` overridden, tagged `wegolite-ci` image reused, no published ports on test services). New scratch scripts (`/tmp/wegolite-perf`, `/tmp/wegolite-baseline`) respect the AGENTS.md rule that nothing scratch enters the repository.
- **Coverage thresholds.** Only `src/sim`, `src/persistence`, `src/content` are gated (`vitest.config.ts:19-61`, `src/sim/**` floors lines 93, branches 86). `08-05`, `08-07`, `08-09`, `08-11`, `08-13` all list a coverage-failure line in their verify; the large defensive-branch surface in `sanitize.ts`/`snapshot.ts` is covered by the table-driven rows. No plan touches the thresholds, correctly.
- **CHANGELOG / NOTICE / ASSETS.** No user-visible change and no new asset or dependency (`fast-check` already a devDependency); each plan states "no entry", consistent with AGENTS.md. Documentation language is English throughout the sampled plans.
- **Requirements and roadmap.** FOUND-10..14 each map to at least one plan (`08-01`/`04`/`06`/`08`/`10`/`12`/`16` for -10; `05`/`11`/`13`/`15` for -11; `02`/`03`/`05`/`11`/`13` for -12; `07`/`09`/`11` for -13; `14`/`15`/`16` for -14). The ROADMAP wave list and each plan's `wave:`/`depends_on:` agree (checked wave by wave). Success criterion 1's "one deliberate probe commit" is reconciled in `08-16` Task 2 step 4 and in PROJECT.md. No same-wave `files_modified` overlap: waves 4, 5 and 6 pair a session plan with a sim plan; `PROJECT.md` is edited by `08-02`, `08-05`, `08-11`, `08-15`, `08-16`, always in different waves.
- **Scope creep.** Every addition this round (limits module, drain caps, enum validation, module-state lint, restore-domain checks) is tied to a Round 4 finding and to a success criterion, but the plan set grew by 769 insertions this round and ten of 16 plans exceed the 100k smart-zone estimate (`08-04` 185k, `08-10` 185k, `08-08` 175k, `08-12` 165k, `08-06` 160k, `08-11` 155k, `08-15` 155k, `08-13` 150k, `08-09` 135k, `08-05` 130k), accepted by the owner on 2026-11-12. Much of the defensive validation (AI queue caps, sanitizer, snapshot parser limits) has no consumer until Phases 12 to 14; it is justified by FOUND-12/13 and the Phase 11 save work, but further hardening rounds should stop adding scope and be treated as executor-time concerns.
- **Executor ergonomics.** Single bullets in `<action>` run to several thousand characters and are saturated with review back-references (`Round 2 review 820a435 L...`), which hides the instruction in the citation. This is workable (the Round 4 table rows and "locate by name or pattern" briefs help) but an executor should be told to treat the back-references as provenance, not requirements. The 75 KB plans (`08-05`, `08-11`) are the highest risk of context overrun; the estimate already acknowledges it.

### Overall Risk Assessment

**LOW-MEDIUM.** All 14 Round 4 consensus items are closed in the current plan text, verified by `path:line` and, where a gate is a regex, by running it against source. No wave-ordering, same-wave ownership, import-cycle or purity problem found. The only new item that could change a green `docker compose run --rm test` is the compliance directory race (MEDIUM, one-file fix); the rest are LOW wording or ergonomics.

### Verdict

**READY**, with one recommended targeted edit before execution of Wave 1: make `tests/compliance.test.ts` tolerant of transient `src/sim` probe directories (or avoid creating them) in `08-03`. Caveat: I did not read all plan text in full (see the coverage statement), so for `08-02`, `08-04` to `08-11`, `08-13` and `08-14` this verdict rests on frontmatter, Round 4 rows and source cross-checks rather than a line-by-line read.

---

## Fast Triage Review (reviewer-triage-haiku)


Reviewer: reviewer-triage-haiku (fast cross-plan consistency lens)
Commit reviewed: afc4fe0
Scope: 08-01 .. 08-16 plans, cross-checked against 08-REVIEWS.md Consensus Summary (Round 4, items 1-14), ROADMAP.md Phase 8, REQUIREMENTS.md FOUND-10..14, 08-CONTEXT.md D-01..D-14, and source at HEAD.

Method and limits: I read the frontmatter of all 16 plans, the Round 4 consensus, and the ROADMAP and REQUIREMENTS entries. I then grepped every named contract (constants, factory signatures, ShipControl and WorldView members, event kinds, Key Decisions row letters, requirement ids, file ownership, wave and depends_on edges, and file:line anchors) across all 16 plans. I verified anchors and identifiers against src/ and eslint.config.js at HEAD. I did not read every plan line end to end (the plans total roughly 800 KB), so an absence of a finding is not proof of absence. Items I could not fully trace are marked as open questions.

Tests and builds: none were run. This is a text-consistency review, and no Docker gate applies to it.

---

### Round 4 consensus status (items 1-14)

| # | Item | Status | Evidence (current plan text and source) |
|---|------|--------|------------------------------------------|
| 1 | NaN in ai.params cannot be rejected after JSON | Resolved | 08-13-PLAN.md:151 (snapshotWorld throws SnapshotError "non-finite" before output), 08-13-PLAN.md:155 (converse limited to decidable slots), 08-05-PLAN.md:148 (ParamValue doc: null and boolean scalars legal), 08-13-PLAN.md:290 (R4-01 row: generator to cover null/boolean params). |
| 2 | `rg "world/store\|\.store\b" src/app` gate can never pass | Resolved | 08-16-PLAN.md:146 narrows the gate to `sim/world/store\|world\??\.store\b\|\.store\??\.(live\|get\|allocate\|kill\|commit\|nextId)\b\|\bEntityStore\b`. Checked: src/app/game-session.ts:1341, :1490, :3345 use only `saveBoot.store.read/clear/dispose`, which the narrowed pattern does not match. |
| 3 | `test.advanceTicks` undefined outside manual clock | Resolved | 08-01-PLAN.md:27 keeps the "every probe.test member reads function" contract. 08-16-PLAN.md:30 makes advanceTicks always a function that refuses outside `clock=manual`. 08-14-PLAN.md:32 adds no hook member. |
| 4 | Shared limits defined three times | Partial | Single definition site now 08-05-PLAN.md:31 and :146 (src/sim/world/limits.ts). Consumers import it at 08-07-PLAN.md:90, 08-11-PLAN.md:111, 08-13-PLAN.md:92. Residual problems: literal `1e12` still used at 08-11-PLAN.md:177 and :180 and 08-07-PLAN.md:200 (see L-2); the meaning of MAX_SNAPSHOT_PARAM_LENGTH is described inconsistently (see M-2). |
| 5 | Enum fields unchecked and registry prototype dispatch | Resolved | 08-05-PLAN.md:211 (spawn refuses kind, scanClass, ai.aiKey outside closed vocabularies), 08-11-PLAN.md:35 (Object.hasOwn dispatch), 08-11-PLAN.md:185 (sanitize rule 9), 08-11-PLAN.md:152 (grep gate forbids `registry[...].think`). |
| 6 | Quaternion normalisation and tolerance | Resolved | 08-05-PLAN.md:157 (spawn requires unit quaternion, does not normalise), 08-11-PLAN.md:178 (below MIN_QUAT_NORM_SQ treated as degenerate), 08-13-PLAN.md:143 (rejects {w:1e-160} and {w:3e-161}). |
| 7 | worldSeed not a uint32 | Resolved | 08-05-PLAN.md:212 (createWorld throws RangeError for 1.5, -1, 2**32, NaN), 08-13-PLAN.md:26 and :143 (parser rejects the same). |
| 8 | createEventRouter signature contradicts itself | Resolved | 08-10-PLAN.md:158 and :40 (`createEventRouter(ctx, subscribers)`), 08-15-PLAN.md:108 and :133 (same). No `createEventRouter(subscribers)` remains (grep over all 16 plans). |
| 9 | Lint guard gaps in src/sim and AI zone | Resolved | 08-09-PLAN.md:30, :192, :211 (`importNames: ["createSeededRandom"]` in both depth zones), 08-09-PLAN.md:193 (module-level mutable state ban), 08-03-PLAN.md:27 and :150 (no-eval, no-new-func, Intl, localeCompare, computed sort forms). |
| 10 | Restore check compared rounded hashes | Resolved | 08-13-PLAN.md:22 (checkpoint every 50th tick plus 1,000 ticks), 08-13-PLAN.md:128 (`JSON.stringify(snapshotWorld(` compared with toStrictEqual at each checkpoint). |
| 11 | AI event drain bounded by passes only | Resolved | 08-11-PLAN.md:191 (MAX_AI_EVENT_PASSES = 8 and MAX_AI_EVENTS_PER_DRAIN = 4096, remaining events dropped and counted), 08-11-PLAN.md:172 (aiDropped accounting). |
| 12 | ShipControl accepts out-of-domain values | Resolved | 08-07-PLAN.md:30 and :117 (arguments checked against limits.ts and ignored), 08-07-PLAN.md:154 (1e13 ignored, 1e12 accepted, 2**32 ignored). |
| 13 | No Firefox run | Resolved | 08-12-PLAN.md:123 and :137 (non-blocking e2e-cross at step 9), 08-15-PLAN.md:216 and :232 (non-blocking e2e-cross after verify-full). |
| 14 | LOW items (deviations recorded, flaky benchmark, stale anchors) | Partial | Deviations recorded: 08-12-PLAN.md:137. Best-of-N benchmark: 08-15-PLAN.md:334 (R4-03 row). Stale anchors: 26 `game-session.ts:NNNN` anchors remain across 08-02, 04, 06, 08, 10, 11, 12, 16. I spot-checked 19 of them against HEAD and all match today (e.g. 08-12-PLAN.md:28 onLaunchKeyDown 2279-2292, 08-10-PLAN.md:158 2814-2836, 08-08-PLAN.md:1490). They will go stale as the split proceeds. |

Round 4 verdict from this lens: 13 of 14 items resolved in plan text, one partial (item 4, residual literal and naming, carried below) and one partial (item 14, anchors). No Round 4 item is Open.

---

### Summary of new findings (this round)

| ID | Severity | Plans | Finding |
|----|----------|-------|---------|
| M-1 | MEDIUM | 08-05, 08-11, 08-03, 08-15 | Key Decisions row letter (d) is claimed for two different rows. |
| M-2 | MEDIUM | 08-05, 08-11, 08-13, FOUND-10 (REQUIREMENTS.md) | REQUIREMENTS.md:22 (FOUND-10) says the probe shape is unchanged, but 08-16 (which carries FOUND-10) deliberately adds probe fields. 08-16 does not list REQUIREMENTS.md in files_modified. |
| M-3 | MEDIUM | 08-16, 08-14, ROADMAP SC5 | ROADMAP Phase 8 success criterion 5 (browser hash equals Vitest hash for N ticks, with traffic off) is narrowed by 08-16 to an empty-world parity claim. The plan flags this itself as unresolved. |
| L-1 | LOW | 08-05, 08-13 | MAX_SNAPSHOT_PARAM_LENGTH is documented as a per-element limit in one place and as an array-length limit in others (naming and doc drift). |
| L-2 | LOW | 08-11, 08-07 | Literal 1e12 used where the shared limit is required. |
| L-3 | LOW | 08-13, 08-05, 08-11 | MIN_QUAT_NORM_SQ is in the import list of 08-05 and 08-11 but not in 08-13's list. The parser test still holds because QUAT_UNIT_TOLERANCE rejects the subnormal cases. |
| L-4 | LOW | 08-15 | A superseded `snapshotForSave(inputs)` call is quoted in a Round 2 row (08-15-PLAN.md:308). Line 341 supersedes it, but a reader could copy the stale form. |
| L-5 | LOW | 08-15, CONTEXT D-14 | The single integration plan conditionally edits a core-track file (08-15-PLAN.md:18, src/sim/world/step.ts). D-14 allows one integration plan, so this is probably intended, but it should be stated. |
| L-6 | LOW | 08-02, 04, 06, 08, 10, 11, 12, 16 | Pre-split game-session.ts line anchors (26 occurrences) will go stale as extraction proceeds (Round 4 item 14, still open in part). |

---

### 08-01

**Summary.** Split safety nets: verify-full baseline, probe-shape snapshot, session-source scans. Wave 1, no dependencies.

**Strengths.**
- Its probe.test contract (08-01-PLAN.md:27, "six states", every probe.test member a function) is the anchor that 08-16 now honours (08-16-PLAN.md:30, :143). Round 4 item 3 is closed by keeping this plan's text unchanged.
- The frontmatter requirement id (FOUND-10) matches ROADMAP Phase 8.

**Concerns.**
- MEDIUM: REQUIREMENTS.md:22 (FOUND-10) still reads "the probe shape is unchanged". This plan carries FOUND-10 in its frontmatter. Once 08-16 adds probe fields (M-2), the requirement text and the plan that claims it disagree. This plan is the earliest place to note the planned reconciliation, but it does not need to change.
- LOW: 08-01-PLAN.md:184 names the verify-full run after 08-02 and 08-03. Consistent with wave 1 ordering. No issue.

**Suggestions.** Leave as is. M-2 is fixed in 08-16 by also editing REQUIREMENTS.md.

**Risk.** LOW.

---

### 08-02

**Summary.** Pinned v1 flight hashes, RNG vectors, serialisable seeded stream, mix32 world and fork seeds. Wave 1, autonomous false.

**Strengths.**
- Identifiers are consistent with later plans: `worldSeedFor(marketSeed, epoch)`, `forkSeed(worldSeed, entityId, purpose)`, `RngPurpose = "world" | "ai" | "combat"` (08-02-PLAN.md:192-193) match the uses in 08-05-PLAN.md:118 and 08-13-PLAN.md:93 and the NO_ENTITY "world" call in 08-05-PLAN.md:38.
- File anchors I checked hold at HEAD: stepFlight at src/sim/flight/step.ts:83 (08-02-PLAN.md:116), hashFlight at src/sim/flight/state.ts:181, createSeededRandom at src/sim/math.ts:227 (08-02-PLAN.md:31), game-session.ts:2084-2133 and 2814-2836 (08-02-PLAN.md:120, :131).

**Concerns.**
- LOW: 08-02 modifies `.planning/PROJECT.md` in wave 1, and 08-05 modifies it in wave 2 (08-05-PLAN.md:17), both adding Key Decisions rows. The lettering collision (M-1) starts with rows written by these plans; 08-02 uses unlettered rows, so no collision here, but the row-letter convention should be fixed in one place.
- LOW: 08-02-PLAN.md:31 forbids any createSeededRandom( call outside math.ts and arrival.ts. This matches 08-09's zone rule (08-09-PLAN.md:192). No contradiction.

**Suggestions.** Keep unlettered Key Decisions rows here and cite them by title in later plans (see M-1).

**Risk.** LOW.

---

### 08-03

**Summary.** Determinism lint bans in src/sim and entity-id scope guard. Wave 1, autonomous true.

**Strengths.**
- Round 4 item 9 is closed: the src/sim zone gains no-eval, no-new-func, Intl and localeCompare bans (08-03-PLAN.md:27, :150, :170), mirroring eslint.config.js:208-241 (the generator zone; line anchor verified).
- The entity-id guard (08-03-PLAN.md:32, tests/guards/entity-id-scope.test.ts) is consistent with 08-15-PLAN.md:148, which forbids EntityId in world-lifecycle.ts.
- tests/guards/eslint-gate.ts exists at HEAD (checked), so the reuse claim at 08-03-PLAN.md:99 is valid.

**Concerns.**
- MEDIUM (M-1): 08-03-PLAN.md:60 says "plan 08-05's Key Decisions row (d) cites it". Row (d) is also claimed by 08-11 for a different decision (see M-1 under 08-05 and 08-11). Cross-reference is ambiguous until the letters are fixed.
- LOW: the guard prohibits `src/sim/world/ids` imports outside src/sim. 08-15 and 08-16 do not import it (checked), so no conflict.

**Suggestions.** Cite Key Decisions rows by title, not by letter.

**Risk.** LOW.

---

### 08-04

**Summary.** Split steps 1-2: typed session context and first controller extraction (probe publisher). Wave 2, depends on 08-01.

**Strengths.**
- Declared depends_on (08-01) matches the text. File ownership is disjoint from wave 2 peer 08-05 (08-05 owns src/sim/world/**).
- `createProbePublisher(ctx: SessionState, deps: ProbePublisherDeps)` (08-04-PLAN.md:154) is the same name and shape that 08-14 and 08-16 extend.

**Concerns.**
- LOW (L-6): game-session.ts:356-490 (08-04-PLAN.md) is a pre-split anchor. Anchors are checked at HEAD and match, but they will go stale after this plan commits.

**Suggestions.** Keep "locate by name" wording alongside line anchors (as 08-08 already does).

**Risk.** LOW.

---

### 08-05

**Summary.** World foundation: ids, entities, five static entities, store, world hash, and the shared limits module src/sim/world/limits.ts. Wave 2, depends on 08-02 and 08-03.

**Strengths.**
- Round 4 items 4, 6, 7 are closed here: limits.ts has one definition site with no imports (08-05-PLAN.md:31, :146); spawnEntity refuses non-unit quaternions (08-05-PLAN.md:157); createWorld refuses invalid worldSeed (08-05-PLAN.md:212).
- Id table is consistent with CONTEXT D-06: NO_ENTITY 0, statics 1-5, ids 6-99 reserved, PLAYER_ID 100, FIRST_DYNAMIC_ID 101 (08-05-PLAN.md:28, :147; CONTEXT D-06 at 08-CONTEXT.md:35).
- nextId bounds are consistent with 08-13. The store refuses allocate at nextId > MAX_UINT32 (08-05-PLAN.md:150) but may be constructed with nextId = 2**32 (08-05-PLAN.md:209), and the parser accepts 2**32 (08-13-PLAN.md:143, :299). These agree because the parser accepts a state the store can hold without allocating.

**Concerns.**
- MEDIUM (M-1): Key Decisions row (d) collision. 08-05-PLAN.md:34 and :224 record per-world entity id uniqueness as "row (d)". 08-11-PLAN.md:234 writes a different "(d)" row ("Phase 8 moves dynamic entities at their desired speed along their facing"). Plans 08-03-PLAN.md:60 and 08-15-PLAN.md (the row (d) citations) rely on the 08-05 meaning.
- LOW (L-1): 08-05-PLAN.md:146 defines `MAX_SNAPSHOT_PARAM_LENGTH = 64` as "(param array elements)". The same plan at 08-05-PLAN.md:158 and :210 uses it as an array-length cap ("a 65-element param array"), and 08-11-PLAN.md:111 and :191 call it "param array lengths", and 08-13-PLAN.md:115 calls it "param array exceeding MAX_SNAPSHOT_PARAM_LENGTH". The doc comment should say maximum array length.
- LOW (L-3): 08-05-PLAN.md:31 and :146 list MIN_QUAT_NORM_SQ as a shared limit, and 08-11-PLAN.md:111 imports it. 08-13-PLAN.md:92 and :115 do not list it.

**Suggestions.** Rename the 08-05 row to "(d) per-world entity ids" and have 08-11 use a distinct letter or title. Replace "(param array elements)" with "maximum array length (elements)" at 08-05-PLAN.md:146.

**Risk.** LOW (text-only).

---

### 08-06

**Summary.** Split steps 3-4: render driver, chart and settings controllers. Wave 3, depends on 08-04.

**Strengths.**
- Factory signatures match the 08-04 pattern: `createRenderDriver(ctx, deps)`, `createChartController(ctx, deps)`, `createSettingsController(ctx, deps)` (08-06-PLAN.md:35-39, :110, :149-150).
- The window keydown anchor at game-session.ts:2268 matches HEAD (`window.addEventListener("keydown", onSubpanelKeyDown, ...`).
- Firefox run is placed at 08-12 per the consensus (08-06-PLAN.md:265).

**Concerns.**
- LOW: 08-06-PLAN.md:90 says pre-split anchors "before plan 08-04". Consistent. No new issue.

**Suggestions.** None beyond L-6.

**Risk.** LOW.

---

### 08-07

**Summary.** AI seam: read-only WorldView and write-only ShipControl. Wave 3, depends on 08-05.

**Strengths.**
- ShipControl method set is consistent across 08-07 and its consumers: `setTarget, setDestination, setDesiredRange, setDesiredSpeed, perform(id, behaviour), scheduleWake(id, ticks)` (08-07-PLAN.md:115, :29); 08-09-PLAN.md:96 and :150-156 use the same names. Round 4 item 12 closed (08-07-PLAN.md:30, :117, :154).
- Imports from ./limits.js (08-07-PLAN.md:90) match 08-05's single definition site.
- Per-world id scope is stated consistently (08-07-PLAN.md:32, :152).

**Concerns.**
- LOW (L-2): 08-07-PLAN.md:200 (T-08-51) says "magnitudes at most 1e12" as a literal rather than MAX_ENTITY_MAGNITUDE. Same value, but the plan's own rule (08-07-PLAN.md:90) says import, never redefine.

**Suggestions.** Replace the literal with `MAX_ENTITY_MAGNITUDE` in the threat row.

**Risk.** LOW.

---

### 08-08

**Summary.** Split steps 5-6: station controller and save controller. Wave 4, depends on 08-06.

**Strengths.**
- Named export set matches HEAD and later plans: saveBoot.store read/clear at game-session.ts:1341 and :1490, `buildSnapshotInputs` (game-session.ts:1131), `snapshotForSave` imported from src/persistence/autosave.ts (game-session.ts:63-65 and autosave.ts:66) and `parseSave` from save.ts (game-session.ts:69). The 08-08 references to these modules are correct.
- Anchors 825, 862, 1344, 1906 match HEAD (outfittingModel at 825, data-field query at 862, saveScreenOpen check at 1344, station-screen lookup at 1906).

**Concerns.**
- LOW (L-6): five game-session.ts line anchors remain in 08-08-PLAN.md. They match HEAD today, but they go stale once 08-08 itself moves the code. The plan already says "pre-split anchors; locate by name" (08-08-PLAN.md:87), so this is handled.

**Suggestions.** None.

**Risk.** LOW.

---

### 08-09

**Summary.** AI types, integer tick timers, registry, scripted test pilot, AI lint zone. Wave 4, depends on 08-07 and 08-03.

**Strengths.**
- Round 4 item 9 is closed for the AI zone: depth-1 and depth-2 import rules forbid createSeededRandom under alias (08-09-PLAN.md:192, :211), and module-level mutable state is banned (08-09-PLAN.md:193).
- The transitive edge claim is correct: 08-09 depends on 08-07, which depends on 08-05, so 08-05's limits are available (08-09-PLAN.md:314).
- Oolite comment for the scanner range (src/Core/Entities/ShipEntity.m:12161, "25600 km") supports the default scanRange 25600 in 08-09-PLAN.md:122.

**Concerns.**
- MEDIUM (M-1): 08-03-PLAN.md:60 cites "row (d)" of 08-05 (see M-1 under 08-05), and this plan does not state its own row letter.
- LOW: the AI module type is `AiModule { think, onEvent? }` (08-09-PLAN.md:120), and 08-11-PLAN.md:114 uses the same. Consistent. No issue.

**Suggestions.** Give the AI zone rule a title in PROJECT.md rather than a letter.

**Risk.** LOW.

---

### 08-10

**Summary.** Split steps 7-8: hyperspace controller, event router, sim driver, step options. Wave 5, depends on 08-08. Declared no edge to 08-11 (same wave).

**Strengths.**
- Round 4 item 8 closed: `createEventRouter(ctx, subscribers)` at 08-10-PLAN.md:40 and :158; 08-15 uses the same at 08-15-PLAN.md:108 and :133. No `(subscribers)`-only form remains.
- "14 routed kinds" matches HEAD: src/sim/events.ts has 14 `kind:` members in the SimEvent union (checked, lines 27-59).
- Order independence with 08-11 is stated and justified (08-10-PLAN.md:34, :159; 08-11-PLAN.md:366). The RoutedKind table is literal over 14 kinds, so 08-11's 15 reserved kinds do not change it.

**Concerns.**
- LOW: game-session.ts:2161 (`document.getElementById("status")`, cited in 08-10-PLAN.md) is a pre-split anchor and will move (L-6).

**Suggestions.** None beyond L-6.

**Risk.** LOW.

---

### 08-11

**Summary.** World step: id-order pass, queued AI events with bounds, sanitize, reserved SimEvents, sim.ts stepSim. Wave 5, depends on 08-09.

**Strengths.**
- Round 4 items 1 (sanitizer side), 5, 6, 11 are closed here: own-key dispatch and enum repair (08-11-PLAN.md:35, :185), degenerate quaternion rule (08-11-PLAN.md:178), event budgets MAX_AI_EVENT_PASSES = 8 and MAX_AI_EVENTS_PER_DRAIN = 4096 (08-11-PLAN.md:191).
- Limits are imported from limits.ts and not redeclared (08-11-PLAN.md:111, :191), matching 08-05.
- The reserved SimEvent set is consistent with 08-10 (see above) and with ARCHITECTURE.md:450 section 7.6.

**Concerns.**
- MEDIUM (M-1): 08-11-PLAN.md:234 writes Key Decisions rows (a)-(h) into PROJECT.md. Its row (d) ("Phase 8 moves dynamic entities at their desired speed along their facing") collides with 08-05's row (d) (per-world entity ids, 08-05-PLAN.md:34, :224). Two rows with the same letter in one PROJECT.md is a direct contradiction in the identifiers the plans rely on.
- LOW (L-2): 08-11-PLAN.md:177 uses `Math.abs(c) > 1e12` and 08-11-PLAN.md:180 uses `entity.radius > 1e12` as literals, while 08-11-PLAN.md:111 says the limits are imported. Same value as MAX_ENTITY_MAGNITUDE, so no behaviour gap, but it breaks the single-source rule.
- LOW: 08-11-PLAN.md:230 says "these 15 kinds" for RESERVED_EVENT_KINDS. I did not count the ARCHITECTURE section 7.6 list to the end, so I cannot confirm 15 from the source (open question, not a contradiction).

**Suggestions.** Rename 08-11's row to a title-based reference, or re-letter it (for example (i)). Replace the literal 1e12 with MAX_ENTITY_MAGNITUDE at :177 and :180.

**Risk.** LOW (text-only), but M-1 must be fixed before PROJECT.md rows are written.

---

### 08-12

**Summary.** Split step 9: frame loop and start-up wiring, thin facade. Wave 6, depends on 08-10.

**Strengths.**
- Anchors hold at HEAD: onLaunchKeyDown at game-session.ts:2279-2292 (08-12-PLAN.md:28), swapSystem at :3284-3294 (08-12-PLAN.md:27), pending.length at :2738.
- Non-blocking Firefox run is recorded at step 9 (08-12-PLAN.md:123, :137), per Round 4 item 13.
- Deliberate deviations (disposed guards, swapSystem rAF tracking) are recorded in the SUMMARY (08-12-PLAN.md:137), per Round 4 item 14.

**Concerns.**
- LOW (L-6): 08-12 holds four game-session.ts anchors, all accurate today, to be used before step 9 commits.
- LOW: 08-12-PLAN.md:123 uses `git worktree add --detach /tmp/wegolite-gate-08-12-step9`. It creates a worktree outside the repository, which is acceptable under the scratch rule, but it writes metadata into .git. Not a plan contradiction.

**Suggestions.** None beyond the above.

**Risk.** LOW.

---

### 08-13

**Summary.** Snapshot codec, 1,000-tick live-versus-restored equality, cadence test. Wave 6, depends on 08-11.

**Strengths.**
- Round 4 items 1, 7, 10 are closed here: non-finite refusal (08-13-PLAN.md:151), worldSeed bound (08-13-PLAN.md:26, :143), exact JSON equality at checkpoints (08-13-PLAN.md:128).
- nextId handling agrees with 08-05: parser accepts up to 2**32 (08-13-PLAN.md:143, :299), and the store refuses allocate beyond MAX_UINT32 (08-05-PLAN.md:150).
- Imports from ./limits.js and no constant re-export (08-13-PLAN.md:115, :92).

**Concerns.**
- LOW (L-3): 08-13-PLAN.md:92 and :115 list the imported limits without MIN_QUAT_NORM_SQ, which 08-05-PLAN.md:31 and 08-11-PLAN.md:111 include. The subnormal-norm rows at 08-13-PLAN.md:143 still hold because the tolerance check rejects them, so this is a list omission, not a behaviour gap.
- LOW (M-2 partial): the 08-13 snapshot `rng` field is pinned as "a plain uint32 number equal to world.rng.s" (08-13-PLAN.md:23). Consistent with 08-05. No issue.

**Suggestions.** Add MIN_QUAT_NORM_SQ to the list at 08-13-PLAN.md:92 and :115 so that the import list matches 08-05.

**Risk.** LOW.

---

### 08-14

**Summary.** Test flags and manual-clock sim driver with advanceTicks. Wave 7, depends on 08-12.

**Strengths.**
- advanceTicks contract is consistent with 08-16: refuses outside the manual clock, refuses while disposed, taints first (08-14-PLAN.md:29, :153-160). 08-16 delegates to it (08-16-PLAN.md:30, :58).
- MAX_ADVANCE_TICKS = 200_000 is stated at 08-14-PLAN.md:135 and is the bound used by the refusal rows at 08-14-PLAN.md:153. 08-16 inherits it through the driver and adds no value of its own.
- "No change in this plan" for the hook (08-14-PLAN.md:274, R4-05) is consistent with 08-16 owning the one probe commit (D-13).

**Concerns.**
- LOW: 08-14-PLAN.md:98 states a "D-10 refinement" (`traffic: hook && traffic === "1"` vs "true without the hook"). CONTEXT D-10 (08-CONTEXT.md:42) says production always has traffic once a populator exists. The refinement is consistent with D-10 but it changes what `testFlags.traffic` means for production; 08-15-PLAN.md:177 relies on the production meaning. Stated, but worth one sentence in the header comment.

**Suggestions.** Make the production meaning of `testFlags.traffic` explicit in the 08-14 doc comment.

**Risk.** LOW.

---

### 08-15

**Summary.** Single integration plan (D-14): world lifecycle, epoch bump points, anchored-save check, step-cost benchmark, Firefox run. Wave 8, depends on 08-14, 08-11, 08-13.

**Strengths.**
- Declared depends_on now includes 08-13 (08-15-PLAN.md:6), matching the R2-04 request.
- snapshotForSave signature at 08-15-PLAN.md:109 (`snapshotForSave(state, profile, system, station, market, commodities, targetSystemId?)`) matches source (game-session.ts:1144-1152 and autosave.ts:66). createEventRouter(ctx, subscribers) and createSimDriver(ctx, deps) match 08-10.
- EntityId is kept out of world-lifecycle.ts (08-15-PLAN.md:148), consistent with the 08-03 guard.

**Concerns.**
- LOW (L-4): 08-15-PLAN.md:308 quotes the superseded `snapshotForSave(inputs)` call in an R2-04 row. Line 341 (R4-10) supersedes it and says so, so it is not a live contradiction, but the stale form is still in the plan.
- LOW (L-5): 08-15-PLAN.md:18 lists src/sim/world/step.ts as a conditional edit. This is a core-track file under CONTEXT D-14 (08-CONTEXT.md:50). 08-15 is the integration plan, so this is probably permitted, but D-14 does not say so and the wording should.
- MEDIUM (M-1): 08-15-PLAN.md:213 (and the row-(d) references at 08-15-PLAN.md:35 and :308) cite "Key Decisions row (d)" for the per-world id rule. That is the 08-05 meaning, which 08-11 contradicts (see M-1).
- LOW: 08-15-PLAN.md:208-213 and 08-16-PLAN.md:28 both rely on the claim that plans 08-04 to 08-15 leave probe.ts untouched. Verified: none of 08-04 to 08-15 lists src/app/probe.ts in files_modified.

**Suggestions.** Remove the stale snapshotForSave(inputs) quote from the R2-04 row. State in D-14 or in 08-15 that the integration plan may edit core files only for the conditional step-cost fast path.

**Risk.** LOW.

---

### 08-16

**Summary.** One deliberate probe commit (D-13): probe.sim, worldHash, advanceTicks, browser and Vitest hash parity. Wave 9, depends on 08-15.

**Strengths.**
- Round 4 items 2 and 3 are closed here: narrowed gate (08-16-PLAN.md:146, verified against src/app), always-present advanceTicks (08-16-PLAN.md:30, :143).
- Fixture state count is consistent with 08-01: six states before, seven after adding testHookManualDocked (08-01-PLAN.md:27; 08-16-PLAN.md:143).
- createTestHook gains a fifth parameter (08-16-PLAN.md:40, :227). Current source is `createTestHook(state, scenes, onMutate, profile?)` (src/app/probe.ts:390). The new call site at game-session.ts:1035 matches the consensus anchor.
- Transitive dependency on 08-14 is valid (08-16 depends on 08-15, which depends on 08-14).

**Concerns.**
- MEDIUM (M-2): REQUIREMENTS.md:22 (FOUND-10) says "the probe shape is unchanged". The 08-16 frontmatter (08-16-PLAN.md:19) lists FOUND-10 for this plan, and 08-16-PLAN.md:183 records the SC1/D-13 reconciliation only in PROJECT.md. REQUIREMENTS.md is not in files_modified. The requirement text and the plan's own deliverable contradict each other until someone edits REQUIREMENTS.md. ROADMAP SC1 (08-16-PLAN.md:28 quotes it) already states the reconciliation, so the fix is a one-line REQUIREMENTS.md edit.
- MEDIUM (M-3): ROADMAP Phase 8 success criterion 5 says a browser spec "reads the same hash as a Vitest run of the same N ticks". 08-16-PLAN.md:32 claims parity "at its honest Phase 8 scope" (empty world, entities 0). 08-16-PLAN.md:195 states this as "FOUND-14 (unclassified, unresolved)" and asks for confirmation at verification. The plan is open about it, but the roadmap wording is not amended and the requirement is not formally narrowed.
- LOW: 08-16-PLAN.md:146 and :211 quote the gate regex. Checked: `\.store\??\.(live|get|allocate|kill|commit|nextId)\b` does not match the IndexedDB calls at game-session.ts:1341, :1490, :3345 today. Correct, but the pattern will need re-checking after 08-08 moves those calls.

**Suggestions.** Add REQUIREMENTS.md to files_modified and change FOUND-10 text to "the probe shape changes only by the one additive commit of D-13". Either amend ROADMAP SC5 or record the narrowing in REQUIREMENTS.md with a classification (this is the unresolved FOUND-14 question).

**Risk.** MEDIUM (requirement text and roadmap wording, not code).

---

### Overall Risk Assessment

**MEDIUM.**

- No HIGH cross-plan contradiction was found. The wave graph, depends_on edges, file ownership within each wave, requirement coverage (FOUND-10..14 each claimed by at least one plan, and every plan's requirements match its text), and the central contracts (createEventRouter, createTestHook, advanceTicks, shared limits, ShipControl and WorldView members, createSeededRandom ban) are consistent at the text level.
- Three MEDIUM items need text edits before execution:
  1. M-1: Key Decisions row letter (d) is claimed for two different rows (08-05-PLAN.md:34, :224 vs 08-11-PLAN.md:234). Fix by titles or re-lettering.
  2. M-2: REQUIREMENTS.md:22 (FOUND-10) contradicts 08-16's probe change. 08-16 must also edit REQUIREMENTS.md.
  3. M-3: ROADMAP SC5 is narrowed by 08-16 without an amendment or classification (08-16-PLAN.md:32, :195).
- The LOW items are naming and doc-comment drift (MAX_SNAPSHOT_PARAM_LENGTH, MIN_QUAT_NORM_SQ import list, literal 1e12), one stale superseded quote (08-15-PLAN.md:308), and advisory stale anchors.
- Round 4: 13 of 14 consensus items resolved in plan text; items 4 and 14 partial. None open.

### Verdict

**NEEDS REVISION** (text-only; no wave, dependency or file-ownership change is required). The three MEDIUM items are small edits: rename or re-letter one Key Decisions row, add REQUIREMENTS.md to 08-16 and amend FOUND-10, and either amend ROADMAP SC5 or classify the FOUND-14 narrowing.

### Open questions (not verified)

- Whether ARCHITECTURE.md section 7.6 lists exactly the 15 reserved kinds named at 08-11-PLAN.md:230 (I did not count to the end of the list).
- Whether 08-15's conditional src/sim/world/step.ts edit (L-5) is intended under D-14. Probably yes, as the single integration plan; the plans do not say so.
- Whether the 26 game-session.ts anchors (L-6) survive each wave; I checked only HEAD.

---

## Consensus Summary

Six source-grounded specialist reviewers ran as Claude subagents at commit `afc4fe0`: `reviewer-architect-opus`, `reviewer-correctness-opus`, `reviewer-algorithm-opus` and `reviewer-adversarial-opus` on Claude Opus 5.5, `reviewer-context-sonnet` on Claude Sonnet 5.5, and `reviewer-triage-haiku` on Claude Haiku 5.5. They reviewed all 16 plans (`08-01` through `08-16`); `reviewer-context-sonnet` read only part of the plan text in full (see its coverage statement), so its READY carries less weight.

All six confirmed that **every Round 4 consensus item (1-14) is resolved or closed** in the current plan text. Verdicts: **READY** (architect, context), **NEEDS REVISION** (correctness, algorithm, adversarial, triage). Overall risk is LOW-MEDIUM. No reviewer found a wave-ordering problem, a same-wave file-ownership conflict, an import cycle, or a Three.js/DOM import into `src/sim`. Every new finding is a targeted text edit; none changes a wave or dependency.

### Agreed Strengths

- **Round 4 is closed**: the NaN/`null` `ai.params` contract, the `.store` gate, the always-a-function `advanceTicks`, the shared limits module, enum checks, quaternion/`worldSeed` domains and the `createEventRouter(ctx, subscribers)` signature all trace to concrete plan text (all six).
- **Sound layering and ordering**: disjoint same-wave ownership, no cycles, `src/sim` purity intact (architect, context, triage).
- **Exact-JSON restore checks, injective ASCII hash line and bounded event queue** are now specified (algorithm, adversarial).

### Agreed Concerns

#### Priority 1 — Acceptance criteria that cannot pass as written (fix before executing the owning plan)

1. **HIGH (`08-13-PLAN.md:22,116,191`; `08-05-PLAN.md:159`) — live vs restored `snapshotWorld` JSON is not byte-identical** *(algorithm A1 HIGH, adversarial N1 HIGH; algorithm reproduced it in the container)*. `ai.params` keys keep insertion order in the live world but come back sorted after `restoreWorld`, so the exact checkpoint comparison fails on the first checkpoint, and an AI using `Object.keys(params)` is a determinism escape. **Fix:** make `snapshotWorld` emit one canonical field order and code-unit-sorted `ai.params` keys (the comparator the parser and hash use), state the canonical fixpoint `snapshotWorld(restoreWorld(parseWorldSnapshot(JSON.parse(t)))) === t`, and add it as a Task 2 row. Optionally insert params in sorted order at spawn (algorithm C1).
2. **MEDIUM (`08-15` Task 1 step 4; `tests/guards/economy-purity.test.ts:201-207,350-352`) — the lifecycle subscriber can fall inside the economy-purity "docked arm" cut** *(correctness)*. `typeof ctx.core.marketSeed === "number"` matches that guard's `/\bmarketSeed\s*=/`, a false failure the executor may not fix by editing the scan. **Fix:** place the subscriber after every other `case` label, or read the seed as `const seed = ctx.core.marketSeed`; add `vitest run tests/guards/economy-purity.test.ts` to the acceptance list.
3. **MEDIUM (`08-06` Task 2 step 5, `must_haves` truth 4) — "closeChart requests a redraw" is vacuous or fails** *(correctness)*. `closeChart` (`game-session.ts:1851-1860`) never calls `redrawGate.request()`; a fresh gate returns `true` on first `next()`. **Fix:** reword to "sets `chartOpen` false, restores input context, resets the loop"; move the redraw property to `08-12`'s frame-order test. Do not add a sixth request site.
4. **MEDIUM (`08-03-PLAN.md:112`, `08-09-PLAN.md:196,235`; `tests/compliance.test.ts:66-77`) — transient probe directories race the unguarded repo walk** *(context)*. `__purity_` protects files only. **Fix:** make `collectSourceFiles` ENOENT-tolerant and `__purity_`-directory-aware (add the file to `files_modified`), or avoid transient directories.

#### Priority 2 — Domain and trust-boundary gaps

5. **MEDIUM (`08-05`, `08-11`, `08-13`) — no cap on total world size, and `snapshotWorld` refuses only non-finite values** *(adversarial N2, N3)*. Per-field caps allow ~67 M param chars, and a finite out-of-domain world yields a snapshot its own parser rejects (an unloadable Phase 11 save). **Fix:** add a world-level budget, and have `snapshotWorld` validate against the parser's domain.
6. **MEDIUM (`08-05` D-key letter (d), `08-11`, `08-03`, `08-15`) — Key Decisions row letter (d) is claimed twice** *(triage M-1)*, and **FOUND-10 (`REQUIREMENTS.md:22`) says the probe shape is unchanged while `08-16` adds fields** without listing `REQUIREMENTS.md` in `files_modified` (triage M-2).
7. **MEDIUM (`08-16`, `08-14`, ROADMAP SC5) — ROADMAP success criterion 5 is narrowed to an empty-world parity claim**, which the plan flags as unresolved *(triage M-3)*. Record an explicit decision or amend the criterion.

#### Priority 3 — Targeted warnings and wording

8. **LOW-MEDIUM (`08-13`, `08-15`, `08-16`) — the lifecycle reactions exist in three copies and only one is checked against the real session** *(architect A5-1)*. Optional: add a `tick-parity.test.ts` case with an injected `populate` spawning 2-3 test pilots, comparing `hashWorld` and `snapshotWorld` JSON through the real driver at 30 Hz and 144 Hz.
9. **LOW (`08-04` Task 1) — the context list omits `equipmentSetSource`/`equipmentSetCache` (`game-session.ts:576-577`); local `const ctx = fitContext()` shadows the session `ctx` at `:769` and `:3232`; the hook "taint then request" order is reversed in the plan** *(correctness)*.
10. **LOW (`08-12` Task 1) — the listener gate equating `addEventListener(` and `uiController.signal` counts is fragile** *(correctness, context)*. Count `signal: (deps\.|ctx\.runtime\.)?uiController\.signal` instead.
11. **LOW (`08-14` Task 2) — the "no drainCommands" assertion is vacuous**; assert "no `advanceFrame`" instead *(correctness)*.
12. **LOW — uint32 bound spelled as a literal in `world-lifecycle.ts` (`08-15-PLAN.md:130`) instead of importing `MAX_UINT32`** (architect A5-2); `08-15` conditionally edits `src/sim/world/step.ts`, a D-14 core-track file, so record any use as a deviation (architect A5-3, triage L-5); literal `1e12` in `08-11`/`08-07` and `MIN_QUAT_NORM_SQ` import-list drift (triage L-2, L-3).
13. **LOW — adversarial residuals**: sparse param arrays and non-object `ai.params` unspecified (N4); `spawnEntity` double-reads getters (N5); live `params` prototype not canonicalized (N6); `testTainted` writable on shared `ctx` (N7); entity-id guard is a token scan (N8); function-object properties as module state (N9).
14. **LOW — stale text and anchors**: superseded `snapshotForSave(inputs)` quote at `08-15-PLAN.md:308` (triage L-4); 26 pre-split `game-session.ts` line anchors will go stale (triage L-6; locate by pattern); ROADMAP "Shift+C settled before the split" vs CONTEXT D-01 (context); optional `docs/PERFORMANCE.md` pointer from the `08-15` benchmark (context); `MAX_SNAPSHOT_PARAM_LENGTH` naming drift (triage L-1).

### Divergent Views

- **READY vs NEEDS REVISION.** The two READY verdicts (architect, context) did not examine the `snapshotWorld` canonical-order contract, which algorithm demonstrated in the container and adversarial found independently. Item 1 blocks an acceptance criterion in `08-13`, so the NEEDS REVISION verdict stands for that plan; the other 15 plans are ready after the text edits above.
- **Where to fix item 1.** Algorithm prefers canonical emission in `snapshotWorld` (more robust); a spawn-time sorted insert alone would not cover AI code that replaces `ctx.ai.params`. Do the `snapshotWorld` fix; the spawn-time sort is optional.
- **Severity of the 08-15 purity-scan collision (item 2).** Raised by one reviewer only, but it is a false test failure the executor is forbidden to fix at the source, so it is worth the one-line plan edit.

To incorporate feedback into planning: `/gsd-plan-phase 8 --reviews`
