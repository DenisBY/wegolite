---
phase: 8
reviewers: [opencode]
reviewed_at: 2026-11-12T08:53:31Z
plans_reviewed: [08-01-PLAN.md, 08-02-PLAN.md, 08-03-PLAN.md, 08-04-PLAN.md, 08-05-PLAN.md, 08-06-PLAN.md, 08-07-PLAN.md, 08-08-PLAN.md, 08-09-PLAN.md, 08-10-PLAN.md, 08-11-PLAN.md, 08-12-PLAN.md, 08-13-PLAN.md, 08-14-PLAN.md, 08-15-PLAN.md, 08-16-PLAN.md]
models:
  opencode: "unknown"
model_sources:
  opencode: "unknown"
---

# Cross-AI Plan Review — Phase 8

<!-- gsd:plan-revision-conflicts:begin -->
## Plan-Revision Conflicts
<!-- gsd:plan-revision-conflicts:end -->

## OpenCode Review

# Cross-AI Plan Review: Phase 8 (Session Split and World Core)

**Verification note:** I reviewed the 16 plans against the current source in `/home/opencode/git/wegolite` as a read-only reviewer (no tracked files modified). Evidence is cited as `path:line`. I did not run Docker builds/tests (host Node/npm is not authoritative per AGENTS.md); where I assert a gate outcome is plausible I base it on source/test contracts visible in the repo.

## 08-01

### Summary
Plan 08-01 correctly front-loads the two safety nets the split needs: a frozen browser-observable probe shape and order/vacuity-safe text scans over the session source, plus a recorded clean verify-full baseline on an uncontaminated worktree. It is well grounded in the current monolith and guard contracts.

### Strengths
- Correctly targets the real source-scan hazards: `tests/app/redraw-gate.test.ts:113-126` reads only `src/app/game-session.ts` and asserts an ordered pair of comma-containing `renderFrame(...)` matches, while `tests/guards/economy-purity.test.ts:201-207,312,322-353` uses `switchCaseBody` on the first `case "docked":` and scans the single session file twice. Making these helpers order-independent and vacuous-failure-safe is necessary before any extraction.
- Freezing `window.__wegolite` before step 1 matches the current probe surface (`src/app/probe.ts:276-358`, hook factory `390-460`, failure surface `469-509`) and the fact that many e2e specs consume it; adding the spec to `test:e2e:fast` (`package.json:20`, currently 3 specs) and updating the exact pinned string in `tests/contract/container-contract.test.ts:336-344` is the right mechanical coupling.
- Baseline isolation is strong: running `verify-full` on a detached worktree of `5b189e4` under a separate Compose project avoids contamination from parallel wave-1 plans and shared bind-mount side effects, consistent with the repo’s Docker-only evidence rule.
- Scope note is reasonable: the 10-file bundle is cohesive (probe pin + step-0 re-point) and avoids renumbering the rest of the chain.

### Concerns
- **MEDIUM:** The probe-shape capture plan must be careful about timing-volatile/optional fields (`hint`, `restore`, `dust`, `world`, `shipVisible` per `src/app/probe.ts:314-322,338`) and about sampling states deterministically; under-specifying the optional-key/record-path policy could make the “frozen shape” either flaky or too permissive. The plan names `hint` and record paths, which is good, but fixture generation must be done against the unmodified monolith in the stated states to be trustworthy.
- **MEDIUM:** `test:e2e:fast` is currently a fixed 3-spec list (`package.json:20`) and `tests/contract/container-contract.test.ts:336-344` asserts count `3` and the exact string; 08-01 plans to change both, which is correct, but any split step that forgets this coupling will break `verify`/contract tests. The plan acknowledges it; execution must keep them in lockstep.
- **LOW:** The baseline allows a documented fallback if worktree gating is infeasible in-repo; that is pragmatic (D-01), but it weakens attribution compared to the primary path and must be recorded clearly in the SUMMARY.

### Suggestions
- In `probeShapeOf`/`compareProbeShapes`, explicitly document and test treatment of arrays, function-valued leaves (`probe.test` methods in `src/app/probe.ts:251-267`), and `null` vs missing to avoid ambiguous diffs.
- Make `tests/helpers/session-source.ts` fail if it finds duplicate `case "docked":` labels across concatenated sources (only one exists today at `src/app/game-session.ts:2321`), since `switchCaseBody` in `tests/guards/economy-purity.test.ts:201-207` always scans the first match.
- Record the exact `verify-full` command, worktree path/project name, commit/tree SHA, duration, and any docking-spec rerun in the SUMMARY as specified.

### Risk Assessment
**LOW.** The plan adds tests/helpers and a script-string update without touching `src/`; risks are mostly fixture precision and gate bookkeeping, which are explicitly called out.

## 08-02

### Summary
Plan 08-02 is a high-value determinism pin: it captures pre-change flight hashes and RNG vectors, then introduces a serialisable RNG and the locked `mix32`-based world/fork seed derivation with owner confirmation. It is mostly sound, but it carries a real one-way decision and a subtle contract about where sim randomness lives.

### Strengths
- Pins evidence from the unmodified implementation first: `createSeededRandom` is currently a closure over mulberry32 state (`src/sim/math.ts:227-236`) and the only sim caller is `drawWitchpointExit` (`src/sim/hyperspace/arrival.ts:73`), whose exact draw sequence matters to existing arrival/golden behavior.
- Correctly preserves the call sites and FIDELITY-sensitive files by delegating inside `src/sim/math.ts` rather than editing `src/sim/hyperspace/arrival.ts` (and render callers remain untouched), aligning with RESEARCH/CONTEXT.
- Uses the existing hash primitives correctly: `hashFlight` is `fnv1a32(serializeFlight(state))` and `serializeFlight` is fixed-order labelled text ending at `repairCount` (`src/sim/flight/state.ts:147-183`, `src/sim/hash.ts:13-35`), so “v1 flight hash” is a concrete, replayable concept.
- The Task 2 checkpoint makes the D-02 one-way seed format explicit and records vectors before Phase 11 persistence, which is the right governance for a save-migration boundary.
- Good adjacency/edge coverage intent: distinct forks for adjacent ids/purposes, 1000 distinct epochs, JSON round-trip of stream state, and keeping existing goldens/tests green.

### Concerns
- **HIGH:** Seed derivation is a locked, one-way contract (D-02). If the implemented `fmix32/mix32/worldSeedFor/forkSeed` arithmetic or purpose codes diverge from what Phase 11 later assumes (or from the owner-confirmed option), worlds become unrecoverable without migration. Task 2 mitigates this, but execution must pin exact literal vectors immediately.
- **MEDIUM:** FOUND-12 states “All simulation randomness comes from serialisable seeded streams…”; after delegation only `drawWitchpointExit` in `src/sim` is shown to use `createSeededRandom` (`src/sim/hyperspace/arrival.ts:73`) and it holds state for one jump-commit call (not across ticks), which the plan explicitly records. This is a reasonable interpretation, but later phases must not introduce other closure-held or untracked sim draws.
- **MEDIUM:** The recorded-flight helper replays session/arrival behavior in Node and must mirror session semantics (e.g. arrival draw uses `drawWitchpointExit(previousSeed)` at `src/app/game-session.ts:2084-2133` and applies `applyWitchpointArrival` in `src/sim/hyperspace/arrival.ts:118-162`). Any mismatch in StepOptions/layout/config/dock geometry would pin the wrong “v1” hashes.
- **LOW:** `tests/golden/world/` is new/additive (fine), but the plan must keep `tests/golden/content|hyperspace|market|save|kinematic-probe.json` untouched as stated.

### Suggestions
- In Task 3, include explicit literal vectors for `fmix32/mix32` and for `worldSeedFor/forkSeed` on representative inputs (including the Lave market seed and epochs 0/1/2) and assert them in `tests/sim/rng.test.ts` as the canonical contract.
- Add a small assertion that `rngNext` state remains a uint32 (`>>> 0`) across many draws and that `createSeededRandom`’s first-N outputs for several seeds match the pre-delegation capture exactly (bit-for-bit), not approximately.
- Document in the Key Decisions row that render-side closure RNGs remain allowed outside `src/sim` (they already exist in render code) while `src/sim` randomness is serialisable by construction.

### Risk Assessment
**MEDIUM.** Technically straightforward, but it establishes irreversible seed semantics and new “golden” evidence that future phases depend on.

## 08-03

### Summary
Plan 08-03 is a necessary determinism hardening step: it extends the sim lint zone with bans for `Date` value use, timers/process/crypto, `for..in`, and bare `sort/toSorted`, while factoring rule lists to survive later AI-zone overrides. The approach matches ESLint’s replace-not-merge behavior and current repo tooling.

### Strengths
- Correctly identifies the current gap: `eslint.config.js:71-152` bans `Math.random`, `Date.now`, `performance.now`, and `new Date` in `src/sim`, but does not ban `Date` as a value/global broadly, `for..in`, bare `.sort()`, timers, `process`, or `crypto`.
- Factoring `SIM_SYNTAX_BANS`, `SIM_GLOBAL_BANS`, `SIM_RESTRICTED_PROPERTIES` is the right fix for ESLint’s later-block replacement semantics (critical for 08-09’s AI zone), and aligns with RESEARCH Pattern 8.
- Using the existing guard infrastructure (`tests/guards/eslint-gate.ts:41-68`, `tests/guards/probe-lock.ts:36-66`) and writing probes under `src/sim` with cleanup is consistent with established negative-proof patterns (cf. `tests/guards/sim-purity.test.ts:64-83`).
- Positive controls (comparator sort/toSorted, for..of, `Date` as type-only) reduce over-broad enforcement risk.

### Concerns
- **MEDIUM:** Banning `Date`/`process`/`crypto`/timers globally in `src/sim` can produce false positives if any existing or future sim code legitimately references them as types or in ways not intended (plan allows type refs; probes should prove it). A quick scan motivation is stated, but execution must verify the full tree still lints.
- **MEDIUM:** The known alias gap (`const m = Math; m.random()`) remains; `Math["random"]` is covered, but aliasing is not. That’s acceptable for this phase but means lint is necessary, not sufficient, for determinism.
- **LOW:** Probes under `src/sim` interact with parallel `tsc`/guard runs; the shared lock pattern is correct, but tests must be careful to always clean up directories created for nested probes.

### Suggestions
- Add a guard case ensuring a comparator `[].sort((a,b)=>a-b)` and `[].toSorted(...)` remain allowed (market code already sorts with comparators elsewhere in the repo style), and that `new Map().forEach`/`Object.keys(...).sort(cmp)` patterns remain viable.
- Include a probe in a subdirectory (`src/sim/world/__ban_probe.ts`) for each class of ban to prove glob coverage, as the plan states.
- Keep rule messages actionable and stable because guard tests assert message fragments.

### Risk Assessment
**LOW.** This is localized tooling hardening with strong negative/positive tests; main risk is over-restriction caught by running lint on the repo.

## 08-04

### Summary
Plan 08-04 starts the mechanical split correctly by introducing a typed session context (step 1) and extracting the probe publisher (step 2) behind the frozen probe contract. It is high-effort but low-conceptual-risk if done as a pure rewrite with live-field access through `ctx`.

### Strengths
- Addresses the core monolith reality: `src/app/game-session.ts` is 3365 lines with `createGameSession` at `335`, a large closure state (`356+`), and many subsystems; centralizing live state into `SessionState` is the prerequisite for safe extraction (G-8).
- Preserves the probe’s behavioral contract: `updateProbe` currently publishes counters, chart/save/hud/world/dock/economy state and queue depth (`src/app/game-session.ts:2412-2550`, `probe.messages` set at `2521`), and `bindTestHook`/taint semantics (`1034-1064`, hook created via `src/app/probe.ts:390-460`) are critical for test isolation and autosave skipping.
- Correctly insists on keeping pinned literals verbatim (e.g. `renderFrame(alpha, shouldDraw())` at `2863`, gate key/condition at `2567`, draw keys at `2558-2564`, 5 `redrawGate.request()` sites at `1041,2740,2751,3255,3361`, `probe.frames += 1` at `2701`, `probe.renders = renderer.info.render.frame;` at `2415`) so scan tests and redraw/probe semantics remain intact.
- Splitting into two commits, each `verify`-green, matches D-12 and makes bisection feasible.

### Concerns
- **HIGH:** Step 1 is a large mechanical rewrite across 3k+ lines; a missed `ctx.<group>` indirection, accidental capture of a stale value, or changed object identity (important for `drawKeys()` at `src/app/game-session.ts:2558-2564` and redraw gate behavior in `tests/app/redraw-gate.test.ts:63-103`) can introduce subtle regressions. The plan’s aliasing guidance helps, but review discipline is essential.
- **MEDIUM:** Probe publisher extraction must preserve call ordering/positions (boot bind at `3184-3186`, load rebind behavior elsewhere in session) and taint side effects (`redrawGate.request()` in the mutate callback at `1041`). Moving functions can accidentally change when `syncEconomyProbe`/`syncSaveProbe` run.
- **MEDIUM:** `tests/guards/sim-purity.test.ts` also scans `src/app` for “frame-like” type declarations containing `pitch` and `roll` (`tests/guards/sim-purity.test.ts:108-125,269-279` context); introducing poorly named types during extraction could trip unrelated guards.
- **LOW:** Running `verify` in a shared tree with parallel 08-05 requires careful staging/gate attribution as the plan states.

### Suggestions
- Perform step 1 in small internal passes (group-by-group) with `typecheck` between, and avoid renaming locals used in pinned string literals except via block-local aliases exactly as planned.
- Add/keep a unit test that proves `bindTestHook` rebound mutates only the new `FlightState` and taints (G-8), since this is easy to regress during extraction.
- After each commit, run the targeted scan tests (`tests/app/redraw-gate.test.ts`, `tests/guards/economy-purity.test.ts`) before the full `verify` to catch literal drift early.

### Risk Assessment
**MEDIUM.** Pure refactor in intent, but breadth of edits in the session monolith creates regression risk despite strong gates.

## 08-05

### Summary
Plan 08-05 lays the world-core foundation (ids, vocabularies, entities/store, static body records, forked streams, and composed hash) with the right determinism invariants. It is conceptually solid, but it introduces several contracts (id scope, hash composition, static handling) that must be implemented exactly.

### Strengths
- Aligns with locked decisions: fixed ids and static bodies (`D-06/D-07`), forked per-entity RNG streams (`D-04`), and empty-world hash identity with `hashFlight` (`D-08`). The building blocks exist in-repo (`src/sim/hash.ts:13-35`, `src/sim/flight/state.ts:147-183`, `src/sim/world/layout.ts:47-68`).
- Good store semantics: monotonic never-reused dynamic ids within a world, id-order iteration, snapshot-length/update discipline, and no `Map`/`Set` iteration for sim decisions are all appropriate for deterministic replay and snapshot equality.
- Treating statics as layout-referencing records (not copied geometry, not hashed/stored in dynamic store) correctly reconciles D-07 visibility with D-08 hash stability.
- Property-test intent (fast-check is available in `package.json:37` and used in the repo ecosystem) is the right tool for spawn/kill/commit/id invariants.

### Concerns
- **HIGH:** Hash composition is fragile: `hashWorld` must equal `hashFlight` for absent/never-spawned worlds (including static-only worlds) and only append a section after first spawn; including `worldSeed/epoch/nextId/statics` too early will break D-08 and recorded pins (08-02). `canon` throws on non-finite (`src/sim/hash.ts:29-35`), so sanitize discipline later matters, but the serializer must also be careful now.
- **MEDIUM:** The “per-world id scope” clarification (restart at 101 each world, ids never outlive world) is sensible for reproducibility, but it must be consistently enforced by `createWorld` and documented so downstream code never persists/transports ids across worlds. Misinterpretation could leak into later save/HUD logic.
- **MEDIUM:** Closed vocabularies (39 behaviours, 16 scan classes) are cited from Oolite; if arrays/types drift from upstream tables, later ports and registries will mismatch. The plan’s optional OOLITE_SRC re-read test is good but conditional.
- **LOW:** `src/sim` coverage floors are high (`vitest.config.ts:36-41`), so new world modules need thorough tests (including error branches) to avoid threshold regressions.

### Suggestions
- Make “never spawned” an explicit predicate in serializer/hash code/tests (`nextId === FIRST_DYNAMIC_ID` and no live entities) and test it across epoch bumps/launch-like scenarios as the plan notes.
- Assert `world.statics` are the exact constant records (ids 1-5, kinds/scan classes/layout keys) and that they never appear in serialized world sections or entity hashes.
- Add a test that `get()`/lookups never return dead or static ids from the dynamic store and that spawn refusal at cap leaves `nextId` unchanged (as specified).

### Risk Assessment
**MEDIUM.** Foundational and mostly pure, but small mistakes in hashing/id/store semantics would cascade into many downstream proofs.

## 08-06

### Summary
Plan 08-06 continues the split with the render driver (step 3) and chart/settings controllers (step 4), which is a sensible extraction order. It correctly treats the redraw gate and probe-visible rendering behavior as invariants and adds worktree-attributed `verify-full` for the render-touching step.

### Strengths
- Preserves the exact redraw/render contract the repo already pins: single gated call `renderFrame(alpha, shouldDraw())` at `src/app/game-session.ts:2863`, gate condition `redrawGate.next(paused || state?.mode === "docked", drawKeys())` at `2567`, draw keys `[state, scene, scene?.nebulae?.revision() ?? 0]` at `2558-2564`, and the 5 `redrawGate.request()` sites (`1041,2740,2751,3255,3361`) checked by `tests/app/redraw-gate.test.ts:116-147`.
- Extracting render/chart/settings is lower coupling than station/save/hyperspace and fits ARCHITECTURE’s order; keeping `probe.frames`/`probe.renders` semantics intact matters (`2701`, `2415`, `tests/app/redraw-gate.test.ts:149-152`).
- Step-3 `verify-full` on a detached worktree of the step commit (with cleanup) is good evidence hygiene under parallel core-track work.
- Fake-context unit tests for idle settle, identity-based redraw keys, context-loss resume refusal, focus-loss pause, and chart preset/close behavior target real session rules.

### Concerns
- **MEDIUM:** The render driver must keep reading live `ctx` fields (state/scene/nebula revision identity) rather than snapshots; any caching/capture would break redraw correctness after load/jump/quality changes, a class of bug the redraw gate explicitly guards (`tests/app/redraw-gate.test.ts:79-103`).
- **MEDIUM:** Moving chart/settings code risks disturbing freeze-branch behavior in `frame()` (`src/app/game-session.ts:2735-2761` drains/returns with redraw requests) and overlay/input context transitions; unit tests help, but e2e in `verify-full` is the real backstop.
- **LOW:** Keeping the comma-containing `renderFrame(...)` declaration/call texts identical after extraction can be fiddly with TypeScript types/interfaces; the plan’s `ReturnType` guidance is appropriate.

### Suggestions
- Ensure `renderFrame(alpha: number, draw = true)` remains the only two-parameter signature text in session sources so `tests/app/redraw-gate.test.ts:120-126` continues to pass without edits.
- In chart/settings tests, assert `redrawGate.request()` effects through observable gate behavior rather than counting source text only, to complement the string-scan guards.
- Keep listener registration/cleanup ordering for settings/pause panels identical to today to avoid duplicate handlers after start/dispose.

### Risk Assessment
**MEDIUM.** Behavior-neutral in goal, but render/overlay code is user-visible and sensitive to ordering and object identity.

## 08-07

### Summary
Plan 08-07 defines and implements the AI seam (`WorldView`/`ShipControl`) as read-only/write-only, type-constrained interfaces over the live world/layout/player. It is a clean design for FOUND-13 and correctly emphasizes copies, actor-only writes, and live reads.

### Strengths
- Correctly separates type-only seam modules from implementations so later lint zoning (08-09) can allow exactly the intended imports, supporting FOUND-13’s boundary.
- Resolves statics/player visibility coherently with 08-05 and D-06/D-07: static bodies 1-5 come from `world.statics` + `SystemLayout` (`src/sim/world/layout.ts:47-52`) at call time, player 100 is an adapter over live `FlightState` (no stored player), and ids 6-99/0 are invalid.
- Enforces key safety invariants: returned vectors/quats are fresh copies, scan ordering is total and deterministic `(distanceSquared, id)`, invalid inputs yield empty/no-op behavior, and `ShipControl` is actor-bound with never-later wake semantics.
- Avoids holding `FlightState` inside the world/view (G-8), which is important across load/arrival replacements.

### Concerns
- **MEDIUM:** Station orientation must match the renderer’s composition using `FlightState.stationAngle` and `layout.stationBaseQuat` (`src/sim/world/layout.ts:56-58`); a small math mismatch will break view correctness/tests and later AI assumptions. The plan calls for reproducing renderer composition in sim math, which is right but must be verified carefully.
- **MEDIUM:** Scan/filter behavior over mixed static/player/dynamic entities (and exclusion of `self`) needs precise handling; off-by-one range checks (`<= range^2`) and invalid-range/self cases are easy to get subtly wrong.
- **LOW:** The seam is intentionally narrow now (deferred methods for missiles/ECM/etc.), which is good, but 08-09’s pilot and later phases will pressure it; interface growth must stay disciplined (Pitfall 19).

### Suggestions
- Add tests that mutate every returned nested object from `body/ship/scan`-derived views and assert no mutation of layout, player state, or stored entities.
- Include tests for `isValid` across missing, dead, static, reserved, and player ids, and for scan with a `kinds` filter and equal-distance tie-break by ascending id.
- Implement a single internal “copy vec/quat” helper to avoid accidental reference leaks.

### Risk Assessment
**LOW.** Pure sim/types work with clear invariants and good unit-testability; main risk is geometric/orientation fidelity.

## 08-08

### Summary
Plan 08-08 extracts the station and save controllers (steps 5 and 6), which are the most stateful UI/session subsystems after render. The plan is appropriately cautious: it preserves save/persistence invariants, hook rebind behavior, and runs `verify-full` after the persistence-touching step.

### Strengths
- Correctly targets critical persistence seams: `loadFromSave` must reinstall live state/layout/scene/market/profile and rebind the test hook when enabled (G-8; boot bind at `src/app/game-session.ts:3184-3186`), and `autosave` guards must preserve order (context-lost/tainted/unavailable/attempt counting) as encoded in session behavior and probe fields (`src/app/probe.ts:167-190`).
- Preserves economy seed/market invariants guarded by `tests/guards/economy-purity.test.ts:320-353` (exactly 3 `generateMarket(` producers, arrival chaining via `arrivalMarketSeed(destination.id, previousSeed)`, load fallback `restoredMarketSeed ?? marketSeedForSystem(system.id)`, no market regen in docked arm at `2321+`).
- Keeping `src/persistence/**` unchanged and proving save behavior via `verify-full` (save-load/autosave/core-loop) is the right risk control for step 6.
- Unit tests for trade refusal/acceptance and autosave guard ordering against fake contexts provide fast feedback independent of DOM/WebGL.

### Concerns
- **HIGH:** `loadFromSave` ordering is delicate (async read/parse/restore, scene/system/market reinstall, message/reset behavior, F2 re-check after await, hook rebind). A small reorder can break G-8, save correctness, or probe/UI state while still compiling.
- **MEDIUM:** Station controller extraction moves many cross-cutting functions (`commitProfile`, selection, rendering, actions) used by event handling and start-up callbacks; missing a call-site reroute can cause stale UI or broken flows not fully covered by unit tests.
- **MEDIUM:** Step-6 `verify-full` in a worktree is good, but the plan depends on earlier step-0/step-3 gate conventions; inconsistent cleanup/project naming would leave stray volumes/containers and confuse attribution.

### Suggestions
- Write characterization-like unit tests for `buildSnapshotInputs` equivalence on representative docked/in-flight states (derived from existing persistence test patterns) to ensure no save bytes/fields change.
- Explicitly test that a tainted profile or lost context increments attempts and records the expected skip reason without queuing a write (matching `WegoliteSaveProbe` semantics in `src/app/probe.ts:167-190`).
- During extraction, keep all three `generateMarket(` call-site texts/regex shapes intact (`src/app/game-session.ts` currently contains 3 per grep) to satisfy the guard scan.

### Risk Assessment
**MEDIUM-HIGH.** Functionally sensitive refactor touching persistence-adjacent session logic and in-session restore; mitigated by strong existing guards and planned `verify-full`.

## 08-09

### Summary
Plan 08-09 adds the AI runtime scaffolding (types/time/registry/test pilot) and enforces the AI import seam in ESLint. It is a strong fit for FOUND-13: it proves the seam with a real, serialisable pilot and mechanically confines future AI code.

### Strengths
- Makes the seam real, not aspirational: the scripted pilot lives under `src/sim/ai/`, uses only `WorldView`/`ShipControl` plus allowed constants/math/types, and is registry-driven—exactly what FOUND-13 needs.
- Integer-tick timing (`TICKS_PER_SECOND`, `THINK_INTERVAL_TICKS = 15`) and JSON-round-trippable `AiComponent` state align with determinism/snapshot goals; the plan’s 200-think and restore-then-continue checks are good.
- AI lint zoning is designed correctly around ESLint replace-not-merge behavior: depth-specific allow-lists, `ImportExpression` ban, and spreading `SIM_SYNTAX_BANS` so bans like `for..in`/bare sort remain active (08-03 baseline in `eslint.config.js:145-151` currently only bans `new Date` syntax in sim).
- Reusing `tests/guards/eslint-gate.ts` and probe-lock patterns for negative proofs is consistent with repo practice.

### Concerns
- **MEDIUM:** Regex allow-lists per depth are easy to get slightly wrong (allowing an unintended climb like `./../...` or rejecting valid sibling forms). The plan constrains names and includes positive/negative probes, which is necessary.
- **MEDIUM:** Because AI blocks redefine rules, forgetting to keep inherited/required restrictions (especially syntax bans) would silently weaken determinism in `src/sim/ai/**` (Pitfall 5). The shared-const spread and explicit probes mitigate this.
- **LOW:** The pilot’s behavior is intentionally simple/placeholder; tests must be specified against the pilot’s own rules/constants (not implementation accidents) to remain stable.

### Risk Assessment
**LOW-MEDIUM.** Contained to new sim/guard/tooling code with clear proofs; main risk is lint-rule configuration correctness.

## 08-10

### Summary
Plan 08-10 performs the riskiest split steps (7 and 8): hyperspace controller extraction, ordered event routing, and the sim driver/step-options seam. It is well planned because it preserves atomicity/ordering and creates the single stepping integration point needed for the world core.

### Strengths
- Keeps `handleHyperspaceJumped` as one synchronous install block (currently `src/app/game-session.ts:2061-2153`), preserving G-7: failure before commit must not mutate live session/profile/market/seed/target, and arrival autosave remains last. This is crucial for correctness and for later world lifecycle insertion.
- Creates a single `stepFlight` call site in `sim-driver` (today called in the frame step callback at `src/app/game-session.ts:2827-2835`) and a pure `buildStepOptions` function, which is exactly the seam D-14/08-15/08-16 need.
- Pins event handling order explicitly (subscriber order and one-kind-to-one-subscriber mapping) and centralizes the only `case "docked":` in stationFlow (currently only at `2321`), protecting `tests/guards/economy-purity.test.ts:201-207,348-353`.
- Preserves frame/command semantics from the current loop: commands to first step only, launch filter, pre-launch autosave before applying launch, shared per-frame input, and launch timeline advance rules (`src/app/game-session.ts:2763-2864`, `src/app/game-loop.ts:40-57`).

### Concerns
- **HIGH:** Event dispatch order and side-effect sequencing are behaviorally significant (messages, screen transitions, autosaves, system swaps). Any reordering or duplicate handling can break gameplay flow and persistence timing even if types compile.
- **HIGH:** The pre-launch autosave and command-drain semantics are easy to regress when introducing `advanceFrame`/`stepOnce` (especially “one autosave per accepted launch drain before first step”). Browser/manual-clock behavior later depends on this being exact.
- **MEDIUM:** `buildStepOptions` must remain pure and Node-importable (no DOM/Three/Vite-only imports) while matching current option construction (`src/app/game-session.ts:2814-2836`, including dock geometry, equipment set, hyperspace facts/target/station mass). Drift would break replay/parity work in 08-16.
- **MEDIUM:** Moving the arrival’s `generateMarket(destination, catalogue, nextSeed)` and `nextSeed = arrivalMarketSeed(...)` texts (currently in the arrival block around `2084-2133`) must satisfy the economy-purity regex/count contract (`tests/guards/economy-purity.test.ts:330-339`).

### Suggestions
- In `tests/app/session-order.test.ts`, assert the full fixed subscriber list and an explicit kind-to-subscriber table for all currently handled 14 kinds so accidental reclassification is caught.
- Add a unit test that a failed destination build path leaves profile/market/marketSeed/target unchanged and triggers failure handling without autosave (mirroring the current catch/paused behavior at `src/app/game-session.ts:2116-2133`).
- Verify `stepFlight` appears exactly once in `src/app` after the step (currently once at `src/app/game-session.ts:2827`).

### Risk Assessment
**HIGH.** This plan reorganizes core runtime control flow and side effects; strong tests/gates are planned, but regression impact would be broad.

## 08-11

### Summary
Plan 08-11 implements the world stepping model (after flight), queued AI events, sanitization, and reserved presentation events, creating `stepSim` as the composition seam. It is ambitious but largely well-reasoned for deterministic multi-entity simulation.

### Strengths
- Correct composition: `stepSim` calls unchanged `stepFlight` first (`src/sim/flight/step.ts:83-351`), then `stepWorld` only for active flight modes, preserving existing flight behavior and enabling empty-world hash identity (D-08).
- Deterministic update rules are appropriate: id-order iteration over a length snapshot, spawned-this-tick deferred to next tick, queued FIFO AI events with bounded passes, per-actor RNG streams, and commit/sanitize before hashing (canon throws on non-finite at `src/sim/hash.ts:29-33`).
- Reserving event kinds in `src/sim/events.ts` (currently 14 kinds at `27-59`) with self-contained payloads and no UI copy is forward-compatible and aligns with ARCHITECTURE §7.6/Phase 13+ needs.
- Recording explicit divergences (id order vs Oolite distance order, queued events, skip killed-in-tick, placeholder motion, transcendental scope) in Key Decisions is good engineering hygiene.

### Concerns
- **MEDIUM:** `src/sim/events.ts` is currently a closed union consumed by app/session handlers (`src/app/game-session.ts:2294-2410` and the router to be built in 08-10). Adding many reserved kinds is fine if all handlers ignore unknowns, but any exhaustive `switch` without a safe default in app code/tests/types could break compilation or behavior.
- **MEDIUM:** Placeholder motion (`position += forward * speed * dt`) and AI-driven nav writes make the 1,000-tick equality meaningful, but they also define temporary semantics that later phases will replace; tests must not overfit to placeholder physics beyond what Phase 8 needs.
- **MEDIUM:** Queue cap/overflow accounting (`aiDropped`) and sanitizer repair counting become part of hashed/snapshotted state; underspecified edge behavior (e.g. what constitutes a repair vs normalization) can cause brittle hashes.
- **LOW:** `Math` transcendentals remain in sim helpers (`src/sim/math.ts:72-81,184-196`) and are used by flight/layout math; the plan’s “within one engine family” scope is reasonable but must be stated consistently (as proposed).

### Suggestions
- Ensure every new event payload follows the discriminant rule (`kind` remains the union tag; e.g. `laserKind` not `kind`) and add compile-time assignment tests as planned.
- Add tests proving `stepSim` with `world === undefined` and with an empty/never-spawned world produces identical `serializeFlight`/`hashFlight` traces over scripted ticks (extending D-08 under stepping).
- Keep `sanitizeEntity` deterministic and total: define repair increments precisely and include `aiDropped`/queue-empty invariants at tick boundaries in tests.

### Risk Assessment
**MEDIUM.** Core simulation semantics are introduced correctly on paper, but event/type ripple and determinism edge cases require careful implementation and tests.

## 08-12

### Summary
Plan 08-12 completes the structural split (step 9) by extracting the frame loop and startup/lifecycle wiring into session modules and shrinking `game-session.ts` to a facade. It is the right end-state for FOUND-10, with strong verification (worktree `verify-full`) and order pinning.

### Strengths
- Preserves the session’s observable contracts: `createGameSession` remains the only public entry (currently `src/app/game-session.ts:335`, returns object at `3348-3364`), `src/main.ts` can keep importing from the facade, and the export set stays unchanged.
- Pins the critical runtime phase order from the current `frame()` (`src/app/game-session.ts:2699-2864`): RAF/frame count, pause toggle, chart/save drains, freeze branches, station actions gating, sim advance vs paused drain, and the single gated render.
- Worktree-based `verify-full` for step 9, plus checks that no golden/probe/scan evidence was weakened, provides strong end-of-split assurance.
- Adding frame-order and scene-swap regression tests addresses common extraction hazards (lost redraw requests, broken freeze branches, stale layout after swap).

### Concerns
- **HIGH:** Step 9 is a wide integration of all prior extracted modules; dependency wiring/order in `createSessionLifecycle` and `createFrameLoop` can break startup, overlays, hook binding, disposal, or rendering even when individual modules are correct.
- **MEDIUM:** The facade must keep exact pinned literals and counts (`renderFrame(alpha, shouldDraw())`, 5 redraw requests total, single `probe.frames += 1`, etc.) across moved files to satisfy `tests/app/redraw-gate.test.ts` and `tests/guards/economy-purity.test.ts` once re-pointed in 08-01.
- **MEDIUM:** `dispose`/listener teardown ordering is easy to regress in a rewrite; leaks or double-frees may only appear in browser specs or long runs.

### Suggestions
- Add an explicit assertion that `game-session.ts` exports only the 9 intended names and that no non-`src/app` module imports `src/app/session/*`, as planned.
- Keep construction and teardown order documented in code comments mirroring today’s sequence (`startSession` currently ~`2884-3250`, dispose ~`3303+`) to aid future maintenance.
- After Task 1, run a quick targeted grep audit for the pinned literals/counts before the worktree `verify-full` to catch mechanical misses early.

### Risk Assessment
**MEDIUM-HIGH.** This is the final structural integration of the split; correctness depends on composition/wiring as much as module logic.

## 08-13

### Summary
Plan 08-13 delivers the snapshot codec and the 1,000-tick live-vs-restored equality/cadence proofs, which are central to FOUND-12. The design is appropriately strict (boundary parsing, typed errors) and targets the right determinism pitfalls.

### Strengths
- Directly proves the strongest determinism claim: snapshot + JSON round-trip + restore produces identical hashes over long runs, including id gaps, killed-highest-id behavior, and tick continuity (no repeat/skip).
- Treats snapshot parsing as a boundary with typed `SnapshotError` and exhaustive validation (shape, versions, ids/order/uniqueness/cap, finite numbers, integer timers, uint32 streams, closed vocabularies, `__proto__` handling), which is good preparation for Phase 11 save reuse.
- Correctly excludes non-persisted/transient runtime artifacts from snapshot semantics (e.g. AI queue empty at boundaries, statics derived from layout/constant table not serialized as geometry) consistent with 08-05/08-11.
- Cross-cadence world-hash test extending the existing cadence discipline (flight cadence tests exist; `src/sim/loop.ts` and app loop semantics are established) is valuable and aligned with project determinism decisions.

### Concerns
- **MEDIUM:** Snapshot format choices (fields, key ordering in emitted records, how params/timers/streams are encoded) become a de facto contract; 08-11’s serializer/hash and 08-13’s codec must agree exactly, or equality proofs will be flaky/brittle.
- **MEDIUM:** `src/sim` cannot use `structuredClone` (`tsconfig.sim.json` has no DOM; tests can), and JSON cannot represent `-0/NaN/Infinity`; the plan accounts for this, but sanitizer behavior and parser rejection rules must be perfectly aligned to avoid hidden divergence.
- **LOW:** High `src/sim` coverage floors (`vitest.config.ts:36-41`) mean the parser needs many rejection-branch tests (planned as 20+ cases), which is good but adds implementation burden.

### Suggestions
- Include explicit tests for “uncommitted dead entity” and “non-empty AI queue” snapshot refusal reasons, since both indicate invalid boundaries.
- In cadence tests, assert the world is actually live/populated at compared ticks (as planned) so equal hashes are not vacuously equal to flight-only traces.
- Keep snapshot version/format constants centralized and documented for Phase 11 reuse.

### Risk Assessment
**MEDIUM.** Pure-sim and well-specified, but correctness hinges on exact data-shape and validation parity across multiple modules.

## 08-14

### Summary
Plan 08-14 introduces the test-only manual clock and exact tick stepping on the driver side (flags parsed once, frame-loop branch, `advanceTicks` with bounds/refusals/taint) without changing the probe shape yet. It is a careful, incremental step toward FOUND-14.

### Strengths
- Correctly parses flags once at startup and replaces the inline `test=1` read (currently at `src/app/game-session.ts:3184-3186`), enforcing D-09/D-10 semantics and preventing runtime toggles.
- Reuses/extends the existing stepping architecture: `createGameLoop` already drains commands to the first step only (`src/app/game-loop.ts:40-57`), and the plan’s shared drain path for realtime/manual modes is the right way to avoid divergence (Pitfall 3).
- Strong safety posture: `advanceTicks` bounds (`MAX_ADVANCE_TICKS`), refusal conditions (not manual, paused, overlays, invalid n), early stop on pause/overlay transitions, and taint-before-first-step to prevent durable saves from hooked/manual runs.
- Keeps D-13 intact by deferring hook/probe surface changes to 08-16 and explicitly gating on probe-shape/scan invariants.

### Concerns
- **MEDIUM:** Factoring the drain/filter/pre-launch-autosave/hyperspace-edge/input-frame logic out of the current `frame()` (`src/app/game-session.ts:2763-2855`) is behavior-critical; any change in order (especially pre-launch autosave while still docked) can break save anchors and later parity.
- **MEDIUM:** `markHookMutation`/taint wiring must remain equivalent to the current hook mutate callback behavior (`src/app/game-session.ts:1041-1048` requests redraw and sets taint) so autosave skip rules stay effective.
- **LOW:** Manual-clock rendering at fixed alpha and not self-stepping can affect visual smoothness in test mode, but that is acceptable given the stated purpose.

### Suggestions
- Unit-test `advanceTicks` with a recording log proving: `markHookMutation` before autosave, autosave before first step, commands only on first step, one drain for the whole call, and identical input frame object passed per step (or the specified sharing contract).
- Add refusal-table tests for all named cases (0, -1, 1.5, NaN, Infinity, cap+1, paused, chart/save open, non-manual flag, no state) asserting no taint and unchanged tick.
- Keep the manual branch in `frame-loop` structurally close to the existing code (pause toggle, overlay drains, freeze branches, single render) to minimize regression surface.

### Risk Assessment
**MEDIUM.** Driver-level refactor of stepping control flow, but scoped to test-mode behavior and backed by clear unit contracts.

## 08-15

### Summary
Plan 08-15 is the D-14 integration: it swaps the session to `stepSim`, adds world lifecycle/epoch bump points and traffic-seam plumbing, and explicitly keeps the world out of saves. It is the phase’s key runtime convergence point and is mostly well specified.

### Strengths
- Single integration point is respected: replace the only `stepFlight` call in the sim driver (post-08-10/08-12 structure) with `stepSim(liveState, world, ...)`, leaving all other modules as callers through the driver.
- Lifecycle rules are coherent with D-02/D-03/D-05/D-08 and the anchored-save decision: world exists only in launching/inFlight, bumped/recreated at launch and arrival (arrival inside install block before autosave, `src/app/game-session.ts:2061-2153` shows current ordering), resumed without bump on in-flight continue/load, dropped on dock/dispose, and never written to saves.
- Correctly handles failure safety: failed arrival must not bump epoch or replace world, and lifecycle methods must not throw inside fixed-step execution.
- Good parity discipline: D-05 requires epoch/ids independent of traffic flag in this phase; plan 08-15 wires `traffic` from `ctx.runtime.testFlags` (08-14) and uses `populateNothing`.
- Keeps `src/persistence/**` unchanged and adds anchored-save assertions (no `epoch/worldSeed/nextId/entities` leakage), which is important before Phase 11.

### Concerns
- **HIGH:** Integrating world stepping into the live session can affect runtime performance and timing behavior even if hashes/logic are correct; the plan relies on `verify-full` and existing gates but does not add a perf measurement. Phase goal includes no NPCs now, so risk is limited, but the path becomes hot every tick.
- **MEDIUM:** Event-router insertion of a `worldLifecycle` subscriber must not create a second `case "docked":` label and must preserve subscriber order semantics; plan 08-10/08-12 pinned this, but 08-15 modifies it (and updates tests) so regressions are possible.
- **MEDIUM:** In-session load handling is subtle (resume vs end depending on restored mode) and interacts with hook rebinding and installed state; if the save-controller doubles in tests diverge from real behavior, the browser save-load specs become the only proof.
- **LOW:** The Oolite comparison for launch repopulation is noted as a deliberate divergence; documenting it (as planned) is important to avoid later “fixes” that break D-02/hash reproducibility.

### Suggestions
- Add an explicit test that on arrival, `begin(nextSeed)` happens before `autosave()` in the hyperspace controller install path (call-order recording), as planned.
- In the sim driver, read `ctx.core.worldLifecycle?.world` live per step (not cached) so launch/arrival/load changes take effect exactly on the intended boundaries.
- Ensure router “unknown kind ignored” behavior remains intact after subscriber refactors, since 08-11 adds reserved event kinds to `src/sim/events.ts`.

### Risk Assessment
**HIGH.** This plan changes the live stepping and session lifecycle at the core integration seam; correctness and ordering are critical even though feature-visible behavior should remain unchanged.

## 08-16

### Summary
Plan 08-16 finishes FOUND-14 by exposing the manual-clock/world-hash surface in one additive probe commit, proving browser/Vitest tick-hash parity, and validating traffic flag behavior and inertness without `test=1`. It is a strong closing plan with good reconciliation of the probe-shape freeze.

### Strengths
- Correctly reconciles ROADMAP success criterion 1 with D-13: probe shape frozen through 08-15, then one additive commit updates `src/app/probe.ts` (current interfaces at `276-358`, hook at `251-267`, factory at `390-460`) and the shape fixture/spec together.
- Reuses the 08-14 driver primitives rather than reimplementing stepping logic: hook `advanceTicks` delegates to the driver’s bounded/tainting/refusing method, and `worldHash` is computed on demand from live state/world (no per-frame hashing, consistent with ARCHITECTURE §16).
- Parity strategy is pragmatic: a pure Node replay helper shared by Vitest and Playwright (or a documented fallback fixture) can compare hashes computed through the same sim/session stepping rules and `buildStepOptions`.
- Covers important flag semantics: manual clock does not self-step, `advanceTicks` exactness/refusals, traffic opt-in default/off behavior under `?test=1`, and inertness of `clock/manual` and `traffic` without `test=1`.

### Concerns
- **MEDIUM:** Extending `createTestHook` and probe publishing must preserve G-8 (read live state/world at call time, no captured references) and avoid adding redraw/request side effects beyond existing taint behavior; 5 `redrawGate.request()` sites are currently pinned (`src/app/game-session.ts:1041,2740,2751,3255,3361`).
- **MEDIUM:** Browser/Vitest parity depends on identical setup (New game, Lave layout/config/dock geometry, launch sequence, input frame, StepOptions, lifecycle reactions). `tests/helpers/lave.ts:40-72` and session `buildStepOptions` help, but any mismatch (especially dock geometry/equipment/hyperspace facts or controller choice while launching) will cause false failures.
- **LOW:** Re-recording the probe-shape fixture is inherently sensitive; the required subtractive diff check (only `sim`, `worldHash`, `advanceTicks` additions) is essential and must be automated/documented in the commit evidence.
- **LOW:** Tick-hook e2e under SwiftShader/manual clock should wait on probe fields (`sim.tick`, `frames`, `mode`) and not wall time (plan states this), consistent with existing e2e style.

### Suggestions
- In parity tests, assert both equality to the Node replay hash and (for the no-NPC launch/fly case) equality to `hashFlight`/expected D-08 behavior to catch “same wrong hash” comparisons.
- Add a spec assertion that `probe.test.worldHash` exists under plain `?test=1` but `probe.test.advanceTicks` exists only under `?test=1&clock=manual`, as planned.
- Ensure `probe.sim.entities` counts only live dynamic/non-dead entities (excluding statics) if that is the chosen contract, and document it in the probe type/comment to avoid ambiguity for future specs.

### Risk Assessment
**MEDIUM.** Additive test surface on top of completed integration, but parity setup and probe-contract changes must be exact to avoid flaky or misleading end-of-phase proof.

---

## Consensus Summary

Only one external reviewer ran (OpenCode). Claude was skipped because the review ran inside Claude Code, and no other reviewer CLIs (codex, qwen, cursor, agy, coderabbit, kimi, local model servers) are installed. So there is no multi-reviewer consensus. The points below are OpenCode's highest-priority findings. Its review is source-grounded: findings cite `path:line` evidence throughout, and it covered all 16 plans. It found no blocking design defects. The risk sits in execution ordering at the integration seams.

### Agreed Strengths
(single reviewer; no cross-reviewer agreement possible)
- 08-01 sets up order-independent and vacuity-safe source-scan guards, a frozen `window.__wegolite` probe shape and a clean verify-full baseline before any extraction starts.
- 08-02 pins flight hashes and RNG vectors before the determinism changes.
- 08-13 gives a strong snapshot round-trip proof: id gaps, killed highest id, tick continuity.
- 08-16 adds probe fields in one commit after the freeze (D-13) and reuses the 08-14 driver for browser/Vitest parity.

### Agreed Concerns
(single reviewer; highest-severity items)
- **HIGH: 08-10 event dispatch and side-effect order.** Pre-launch autosave semantics ("one autosave per accepted launch drain before first step") and the order of messages, screen transitions and system swaps can regress while types still compile.
- **HIGH: 08-15 live world stepping in the session.** This path now runs every tick, and no perf measurement is planned. The reviewer suggests one.
- **HIGH: 08-05 hash composition.** `hashWorld` must equal `hashFlight` for absent or never-spawned worlds. Including world fields too early breaks D-08 and the 08-02 pins.
- **HIGH: 08-04 and 08-12 wide mechanical rewrite and final composition.** Watch for stale captures and object-identity changes (`drawKeys()`, redraw gate), and for wiring order in `createSessionLifecycle` and `createFrameLoop`. Literal pins must survive the moves: 5 `redrawGate.request()` sites, `renderFrame(alpha, shouldDraw())` and a single `probe.frames += 1`.
- **HIGH: 08-08 `loadFromSave` ordering.** This covers the async read/parse/restore, reinstall, the F2 re-check after await, and hook rebind.
- **HIGH: 08-02 one-way seed derivation (D-02).** Pin exact literal vectors for `fmix32/mix32/worldSeedFor/forkSeed` immediately.
- **MEDIUM: 08-11 adds reserved event kinds.** Any exhaustive `switch` in app code without a safe default breaks.
- **MEDIUM: 08-11 and 08-13 must agree exactly on the snapshot format.** The sanitizer must handle `-0`, NaN and Infinity, and the parser's rejection rules must match it.
- **MEDIUM: 08-03 lint has a known alias gap.** `const m = Math; m.random()` gets past the lint, so lint alone cannot prove determinism.

### Divergent Views
None, since only one reviewer ran. To get real cross-model consensus, install another reviewer CLI (e.g. codex) and run `/gsd-review --phase 8` again.
