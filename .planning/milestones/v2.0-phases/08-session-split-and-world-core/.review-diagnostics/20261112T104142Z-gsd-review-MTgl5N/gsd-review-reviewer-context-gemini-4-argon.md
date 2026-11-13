### Summary

Round 2 broad-context blast-radius and cross-plan review of `08-01-PLAN.md` through `08-16-PLAN.md` confirms that commit `83c9b5c` thoroughly resolved the Round 1 (`08-REVIEWS.md`) findings, with every plan carrying a traced disposition ledger, disjoint same-wave `files_modified` ownership under D-14, and worktree-isolated `verify-full` gates at baseline and split steps 3, 6, and 9. Whole-repository verification against the live codebase (`src/app/game-session.ts`, `src/app/probe.ts`, `src/sim/**`, `eslint.config.js`, and `tests/**`) uncovered no architectural blockers, four concrete cross-module boundary warnings (`__purity_` probe naming vs `tests/compliance.test.ts` and parallel `src/sim` directory walks; unguarded `document`/`window` globals in extracted session controllers tested under Node Vitest; `createEventRouter` wiring in `08-15` where `src/app/game-session.ts` is outside `files_modified`; and `sanitizeEntity` vs `parseWorldSnapshot` numeric domain alignment for `08-13`'s fast-check property), and two minor suggestions.

### Strengths

- **Complete Round 1 resolution (`83c9b5c`):** Every Round 1 concern in `08-REVIEWS.md` is addressed with concrete verification gates: the 21-key optional-probe audit table and `--repeat-each=3` check (`08-01`), same-commit independent scratch vectors and permanent `createSeededRandom` source scan (`08-02`), AST alias/computed-member/`globalThis` bans (`08-03`), closure/factory capture scans (`08-04`, `08-06`), single exported `isNeverSpawned` predicate and read-only `OOLITE_SRC` table verification (`08-05`), `THREE.Quaternion` station-roll parity and `Record<keyof ...>` narrow-seam pins (`08-07`), `loadFromSave` and `handleEvent` call-order characterization tests (`08-08`, `08-10`), `ESLint#calculateConfigForFile` regex allow/reject tables (`08-09`), explicit `sanitizeEntity`/`aiDropped` tables (`08-11`), `Record<keyof Entity, ...>` hash/codec field parity (`08-13`), test-title preservation diffs (`08-14`), `/tmp` hot-path step-cost benchmark (`08-15`), and per-tick trace + `hashFlight` parity checks (`08-16`).
- **Strict wave isolation and zero same-wave file collisions:** Across Waves 1–6, every parallel pair (`08-01`/`08-02`/`08-03`, `08-04`/`08-05`, `08-06`/`08-07`, `08-08`/`08-09`, `08-10`/`08-11`, `08-12`/`08-13`) has completely disjoint `files_modified` sets, respecting D-14's split-track (`src/app/**`) vs core-track (`src/sim/**`, `eslint.config.js`) boundary.
- **Caller blast radius preserved across all public and test seams:**
  - `createGameSession` (`src/app/game-session.ts:335-3365`, imported only by `src/main.ts:33-34`) keeps all 9 exported symbols and its exact 11-method `GameSession` return shape through `08-04`..`08-16`, shrinking `src/app/game-session.ts` from 3,365 lines to ~330 lines (< 600 gate in `08-12`).
  - `createSeededRandom` (`src/sim/math.ts:227-236`) keeps its signature and mulberry32 draw sequence via delegation to `rngNext`, leaving `src/sim/hyperspace/arrival.ts:73` (and its `FIDELITY.md` line pin at `:125`) plus all four render callers (`src/render/bodies/{nebulae,dust,starfield}.ts`, `src/render/break-pattern.ts`) byte-identical.
  - `stepFlight` (`src/sim/flight/step.ts:83-351`), `serializeFlight` (`src/sim/flight/state.ts:147-179`), and `hashFlight` (`src/sim/flight/state.ts:181-183`) remain untouched across all 17 existing `tests/sim/*.test.ts` callers while `stepSim` and `hashWorld` compose cleanly on top of them.
  - `CHANGELOG.md` and `src/persistence/**` are appropriately left untouched in Phase 8 (internal-only refactor and NPC-free foundation; save schema v3 is Phase 11).

### Issues Found

- **Severity**: WARNING
  - **Plan/Task**: `08-03` (Tasks 1–2), `08-09` (Task 3), and `08-02` (Task 3)
  - **Description**: Temporary ESLint probe files written under `src/sim/` by `withSimProbe` (`tests/guards/sim-probe.ts`) in `08-03` (`__ban_for_in.ts`, `__ok_for_of.ts`, etc. at `08-03-PLAN.md:102`) and `08-09` (`08-09-PLAN.md:186`) do not use the `__purity_` filename prefix. In the live codebase, `tests/compliance.test.ts:74` walks the entire repository during `docker compose run --rm test` and only skips `if (entry.name.startsWith("__purity_")) continue;` (as documented in `tests/guards/tools-determinism.test.ts:17-18`). Furthermore, `08-02` Task 3 (`08-02-PLAN.md:201`) adds a recursive `src/sim` file scan in `tests/sim/rng.test.ts` (`describe("only serialisable streams in src/sim")`), and `tests/guards/sim-purity.test.ts:254-292` also walks `src/sim` without `withProbeLock`. During parallel Vitest worker execution (`docker compose run --rm test`), `tests/compliance.test.ts` will either fail the SPDX header check (`tests/compliance.test.ts:259`) on `__ban_*`/`__ok_*` probes or throw `ENOENT` when a probe file or temporary subdirectory (such as `src/sim/world/` in Wave 1 before `08-05` lands) is removed in `finally` between `readdirSync` and `readFileSync`.
  - **Fix**: In `tests/guards/sim-probe.ts` (`08-03` Task 1), normalize every probe filename so its basename starts with `__purity_` (e.g., `__purity_ban_for_in.ts`) and prepend the two-line SPDX header automatically inside `withSimProbe`. In `tests/sim/rng.test.ts` (`08-02` Task 3), skip any file whose name starts with `__purity_` (or run the recursive `src/sim` scan inside `withProbeLock` from `tests/guards/probe-lock.ts`).

- **Severity**: WARNING
  - **Plan/Task**: `08-06` (Task 2), `08-08` (Tasks 1–2), `08-10` (Task 1), `08-12` (Task 1), and `08-15` (Task 3)
  - **Description**: All unit tests run in Node (`vitest.config.ts:73`, `environment: "node"`), where `window` and `document` are `undefined`. In `src/app/game-session.ts`, four places outside `startSession` touch `document` or `window` directly:
    1. `syncHeaderCredits()` (`src/app/game-session.ts:862`) calls `document.querySelector(...)` and is invoked synchronously by `syncStationNav()` (`:871`) <- `renderStation()` (`:976`) <- `stepAmount()`, `confirmTrade()`, `cancelTrade()`, and `commitProfile()`. When `08-08` Task 1 (`08-08-PLAN.md:106`) tests `confirmTrade()` and `cancelTrade()` in Node (`tests/app/session/station-controller.test.ts`), moving `syncHeaderCredits` verbatim will throw `ReferenceError: document is not defined`.
    2. `syncStatusOverlay()` (`src/app/game-session.ts:2161`) calls `document.getElementById("status")` and is invoked directly inside the install block of `handleHyperspaceJumped` (`:2148`). While `08-10` Task 1 only tests a *failed* arrival in Node, `08-15` Task 3 (`08-15-PLAN.md:204`) tests a *successful* `handleHyperspaceJumped` in Node (`tests/app/session/world-lifecycle.test.ts`), which reaches `:2148` and will throw `ReferenceError: document is not defined`.
    3. `closeSaveScreen()` (`src/app/game-session.ts:1906`) calls `document.getElementById("station-screen")`.
    4. `window.addEventListener("keydown", onSubpanelKeyDown, ...)` (`:2268`) and `window.addEventListener("keydown", onLaunchKeyDown, ...)` (`:2289`) currently sit at the top level of `createGameSession` (not inside `startSession`), and `onLaunchKeyDown` (`:2279-2292`) is not explicitly listed in `08-06` or `08-12`'s moved-function lists. Calling `window.addEventListener` inside `createSettingsController` on construction would break `tests/app/session/settings-controller.test.ts` in Node (`08-06-PLAN.md:152`).
  - **Fix**: Guard `document` access in `syncHeaderCredits`, `syncStatusOverlay`, and `closeSaveScreen` with `if (typeof document === "undefined") return;` (or inject a DOM lookup helper via `deps`); keep the `window.addEventListener` registrations out of `createSettingsController` construction (leaving them in `game-session.ts` during `08-06` and moving both `onSubpanelKeyDown` and `onLaunchKeyDown` listener registrations into `start-session.ts` in `08-12`); and explicitly list `onLaunchKeyDown` (`src/app/game-session.ts:2279-2292`) in `08-12` Task 1 (or `08-06` Task 2).

- **Severity**: WARNING
  - **Plan/Task**: `08-10` (Task 2), `08-12` (Task 1), and `08-15` (Task 1)
  - **Description**: `08-10` Task 2 (`08-10-PLAN.md:155`) defines `createEventRouter(subscribers)` taking the subscriber map (`stationFlow`, `hudMessages`, `dockFeedback`, `hyperspaceFlow`), and `08-12` Task 1 (`08-12-PLAN.md:119`) wires all session modules together inside `src/app/game-session.ts`. Then `08-15` Task 1 (`08-15-PLAN.md:130`) adds the 5th subscriber `worldLifecycle` (which needs `ctx.core.marketSeed` and `ctx.core.worldLifecycle`) in `src/app/session/event-router.ts`, but `src/app/game-session.ts` is **not** in `08-15-PLAN.md`'s `files_modified` (`08-15-PLAN.md:7-18`). If `createGameSession` in `src/app/game-session.ts` constructs the subscriber map without passing `ctx` into `event-router.ts`, `08-15` cannot wire `worldLifecycle` into the live session without editing `src/app/game-session.ts` (violating `08-15`'s `files_modified` gate-attribution check).
  - **Fix**: Either have `src/app/session/event-router.ts` in `08-10` accept `ctx` (or export a `createSessionEventRouter(ctx, deps)` factory called by `src/app/game-session.ts`) so `08-15` can wire the `worldLifecycle` subscriber inside `src/app/session/event-router.ts` without touching `src/app/game-session.ts`, or add `src/app/game-session.ts` to `08-15-PLAN.md`'s `files_modified`.

- **Severity**: WARNING
  - **Plan/Task**: `08-11` (Task 2) and `08-13` (Task 2)
  - **Description**: In `08-13` Task 2 (`08-13-PLAN.md:140`), the fast-check property draws per-tick numeric fields (`position`, `destination`, `orientation` components, `speed`, `desiredSpeed`, `desiredRange`, AI timers) from arbitrary `finite values, -0, NaN, Infinity and -Infinity`, runs `sanitizeEntity(entity)`, and asserts `parseWorldSnapshot` never throws. Two edge cases between `08-11`'s `sanitizeEntity` (`08-11-PLAN.md:160`) and `08-13`'s `parseWorldSnapshot` (`08-13-PLAN.md:133`) can cause this property to fail:
    1. When `fc.double()` generates large finite quaternion components (e.g. `1e200`), `w*w + x*x + y*y + z*z` overflows to `Infinity`, and `src/sim/math.ts:54` `normalize(q)` divides `1e200 / Infinity = 0`, producing an all-zero quaternion `{ w: 0, x: 0, y: 0, z: 0 }`.
    2. When `fc.double()` generates negative finite values for `speed`, `desiredSpeed`, or `desiredRange`, `08-11` Task 2 only specifies repairing *non-finite* `speed`/`desiredSpeed`/`desiredRange` to `0`, whereas `08-07` (`control-impl.ts`) and `src/sim/flight/sanitize.ts:96-99` require non-negative speeds/ranges. If `parseWorldSnapshot` rejects negative `speed`/`desiredSpeed`/`desiredRange` or zero-norm quaternions, the fast-check property will fail immediately.
  - **Fix**: In `08-11` Task 2 (`src/sim/world/sanitize.ts`), check `!Number.isFinite(normSq) || !(normSq > 0)` on the quaternion squared norm (matching `src/sim/flight/sanitize.ts:57-59`) to repair overflowed/underflowed quaternions to `identity()`, and repair negative `speed`, `desiredSpeed`, and `desiredRange` (`< 0`) to `0` so `sanitizeEntity` and `parseWorldSnapshot` enforce the exact same numeric domain.

- **Severity**: SUGGESTION
  - **Plan/Task**: `08-16` (Task 1 & Task 2)
  - **Description**: In `08-16` Task 1 step 1 (`08-16-PLAN.md:125`), `WegoliteProbe.sim` is optional (`absent on the failure surface and before the session starts`), while step 2 (`08-16-PLAN.md:126`) states `updateProbe publishes probe.sim each frame from ctx: tick = state.tick...`. Because `tests/app/session/probe-publisher.test.ts` (`08-04` Task 2, re-run by `08-16` Task 1's verify command) calls `updateProbe()` on a fresh `createSessionState` where `ctx.core.state` is `undefined`, reading `ctx.core.state.tick` outside the `if (currentState !== undefined)` guard would throw a `TypeError` and would publish `probe.sim` before a session starts. Additionally, `08-16` Task 2 step 3 case (c) (`08-16-PLAN.md:162`, `/?clock=manual&traffic=0`) reads `probe.sim.clock`, `probe.sim.traffic`, and `probe.sim.tick` advancing while docked, which requires calling `startNewGame(page)` first so the session leaves `"menu"` mode.
  - **Fix**: Publish `probe.sim` inside the `if (currentState !== undefined)` block of `updateProbe()` (and `delete probe.sim` in `dispose()` alongside `delete probe.test; delete probe.save; delete probe.saveScreen;` at `src/app/game-session.ts:3342-3344`), add the `| sim |` row to the optional-key audit comment table in `tests/e2e/probe-shape.spec.ts`, and call `startNewGame(page)` in `tests/e2e/tick-hook.spec.ts` case (c) before asserting `probe.sim` fields.

- **Severity**: SUGGESTION
  - **Plan/Task**: `08-05` (frontmatter) and `08-15` (frontmatter)
  - **Description**: `08-05-PLAN.md` (`wave: 2`) lists `depends_on: ["08-02"]` but relies on `08-03`'s determinism lint rules in its Task 2 verify block (`08-05-PLAN.md:195`), and `08-15-PLAN.md` (`wave: 8`) lists `depends_on: ["08-14", "08-11"]` but runs `08-13`'s `tests/sim/world` snapshot suite in Task 3 step 5 (`08-15-PLAN.md:208`).
  - **Fix**: Add `"08-03"` to `08-05-PLAN.md`'s `depends_on` (`["08-02", "08-03"]`) and `"08-13"` to `08-15-PLAN.md`'s `depends_on` (`["08-14", "08-11", "08-13"]`) so the frontmatter dependency graph is complete independently of wave numbers.

### Missing Coverage

- No requirement (`FOUND-10` through `FOUND-14`) or roadmap success criterion (SC1–SC5) lacks automated test coverage. The only uncovered runtime edge cases are the Node-environment `document`/`window` guards in extracted session controllers (`08-06`, `08-08`, `08-15`) and the `__purity_` probe-prefix exclusion in `tests/guards/sim-probe.ts` (`08-03`) when the full Vitest suite runs in parallel.

### Recommendations

1. **Prefix all `withSimProbe` temporary files with `__purity_` and include the SPDX header (`08-03`, `08-09`, `08-02`):** Ensure `withSimProbe` in `tests/guards/sim-probe.ts` automatically prefixes the probe filename with `__purity_` and prepends the two-line GPL-2.0-or-later header, and have `tests/sim/rng.test.ts`'s `src/sim` scan ignore `__purity_*` files so parallel runs with `tests/compliance.test.ts` and `tests/guards/*` never race or fail header checks.
2. **Guard `document`/`window` in extracted session modules (`08-06`, `08-08`, `08-10`, `08-12`, `08-15`):** Add `if (typeof document === "undefined") return;` in `syncHeaderCredits`, `syncStatusOverlay`, and `closeSaveScreen`, keep `window.addEventListener` registrations in the composition root (`game-session.ts` -> `start-session.ts`), and explicitly assign `onLaunchKeyDown` (`src/app/game-session.ts:2279-2292`) in the split plans.
3. **Align `createEventRouter` wiring (`08-10`, `08-15`) and `sanitizeEntity` / `parseWorldSnapshot` domains (`08-11`, `08-13`):** Pass `ctx` into `event-router.ts` in `08-10` (or add `src/app/game-session.ts` to `08-15`'s `files_modified`), and handle quaternion `normSq` overflow/underflow (`!Number.isFinite(normSq) || !(normSq > 0)`) and negative speeds/ranges in `sanitizeEntity` (`08-11`).

### Overall Assessment

READY

*(No blocking defects; the four warnings above are localized guard/wiring precautions that can be applied directly during plan execution or as a small pre-execution polish.)*

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
