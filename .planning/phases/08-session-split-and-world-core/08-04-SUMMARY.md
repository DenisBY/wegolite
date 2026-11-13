---
phase: 08-session-split-and-world-core
plan: 04
subsystem: app
tags: [session-split, typed-context, probe-publisher, refactor, g-8, probe-freeze]

requires:
  - phase: 08-session-split-and-world-core
    provides: 08-01 probe-shape freeze, session-source reader and the re-pointed scans (the safety net this refactor runs under)
provides:
  - src/app/session/context.ts, SessionCore, SessionStationState, SessionChartState, SessionSaveState, SessionRuntime, SessionState, SessionDeps, SessionStateInit and createSessionState
  - src/app/session/probe-publisher.ts, createProbePublisher(ctx, deps) returning updateProbe, bindTestHook, syncEconomyProbe, syncSaveProbe and withdrawProbe, plus ProbePublisherDeps and the shared toTuple
  - tests/app/session/probe-publisher.test.ts, the first session-level unit test (fake context, no DOM, no WebGL)
affects: [08-06, 08-08, 08-10, 08-12, 08-14, 08-15, 08-16]

actuals:
  tokens: 41897
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "every mutable session field lives in one SessionState read through ctx.<group>.<name>; a block may alias a field for one call and never keeps the alias (G-8)"
    - "a session module is createX(ctx, deps) returning an object of functions; deps carry only what the bodies call outside ctx, and interface members are declared as function-typed properties so call-count scans over the source do not count the signature"
    - "a mechanical rewrite of a large closure is done with the TypeScript checker (symbol resolution handles shadowing and shorthand properties), then prettier and tsc, never with regexes"

key-files:
  created:
    - src/app/session/context.ts
    - src/app/session/probe-publisher.ts
    - tests/app/session/probe-publisher.test.ts
  modified:
    - src/app/game-session.ts
    - tests/app/session-source.test.ts

key-decisions:
  - "equipmentSetSource and equipmentSetCache (the two closure lets declared mid-file at the old line 576, outside the plan's list) went into the core group because the cache is keyed on profile.equipment; the plan's list named 75 of the 77 lets"
  - "SessionDeps is a declared type only: createGameSession keeps its immutable consts where they are, because constructing a deps object nothing reads would be an unused local; the publisher takes its own narrower ProbePublisherDeps and later split plans build their deps from the same consts"
  - "ProbePublisherDeps has no hints accessor and no equipment-catalogue accessor (the plan listed both): the bodies read ctx.runtime.hints and ctx.core.equipmentCatalogue at call time, which is the G-8 rule"
  - "toTuple moved to probe-publisher.ts and is exported, because both updateProbe and the in-flight restore probe in startSession use it and a second copy would drift"
  - "the publisher's interface members are function-typed properties (updateProbe: () => void), not method signatures, so the plan's call-count gate (occurrences of name( minus the one function declaration) holds literally"

patterns-established:
  - "a split step is one commit with the fast gate green, the frozen files byte-identical to the plan base, and the pinned scan literals kept by block-local aliases"

requirements-completed: [FOUND-10]

coverage:
  - id: D1
    description: "Split step 1: all 77 closure-level lets of createGameSession live in one typed SessionState built by createSessionState, every use reads and writes through ctx, and no live field is aliased at the closure level"
    requirement: FOUND-10
    verification:
      - kind: other
        ref: "rg -n \"^  let \" src/app/game-session.ts (no match); rg -n \"^  (const|let) [^=]*= ctx\\.(core|station|chart|save|runtime)\" src/app/game-session.ts (no match); rg -c \"createSessionState\\(\" src/app/game-session.ts (1)"
        status: pass
      - kind: e2e
        ref: "docker compose run --rm verify at 49e775e (tree 54eeaf8c): probe-shape.spec.ts (6 specs), save-load.spec.ts, docking.spec.ts, scene.spec.ts, 26 passed"
        status: pass
    human_judgment: false
  - id: D2
    description: "Split step 2: the probe and test-hook publishing lives in probe-publisher.ts with the identical field set, and the four publisher functions keep their call counts (15, 2, 5, 11), enclosing functions and neighbouring statements"
    requirement: FOUND-10
    verification:
      - kind: unit
        ref: "tests/app/session/probe-publisher.test.ts (8 tests)"
        status: pass
      - kind: e2e
        ref: "docker compose run --rm verify at 2a061db (tree db8832a2): probe-shape.spec.ts, 26 passed"
        status: pass
    human_judgment: false
  - id: D3
    description: "A hook rebound to a replaced FlightState mutates only the new object and taints the session; a rejected mutation changes nothing and does not taint (T-08-07)"
    requirement: FOUND-10
    verification:
      - kind: unit
        ref: "tests/app/session/probe-publisher.test.ts#a hook rebound to a replaced FlightState mutates only the new object and taints"
        status: pass
    human_judgment: false
  - id: D4
    description: "The frozen files (probe.ts, probe-shape.json, redraw-gate and economy-purity tests, goldens) are untouched and createGameSession is still the only public entry (9 exports)"
    requirement: FOUND-10
    verification:
      - kind: other
        ref: "git diff --quiet d2df18f -- src/app/probe.ts tests/fixtures/probe-shape.json tests/app/redraw-gate.test.ts tests/guards/economy-purity.test.ts tests/golden (exit 0); rg -c \"^export\" src/app/game-session.ts (9)"
        status: pass
    human_judgment: false

duration: 18min
completed: 2026-11-13
status: complete
plan_head_before: d2df18f815a32ae682dc199d6418cf8e0facee18
plan_head_after: 2a061db82378c195c2b04cd976dcb1c08098fed7
---

# Phase 8 Plan 04: Session split steps 1 and 2 Summary

**All 77 closure-level lets of `createGameSession` now live in one typed `SessionState` (core, station, chart, save, runtime) built by `createSessionState`, and the probe and test-hook publishing is extracted to `createProbePublisher(ctx, deps)` with the same call sites, the identical probe field set and a fake-context unit test; two commits, each with the fast gate green.**

## Performance

- **Duration:** about 18 min (the start time was not captured at spawn; estimated from tool timestamps, first work about 09:22Z, last task commit 09:30Z plus the second gate run and this SUMMARY)
- **Tasks:** 2 (Task 1 tracer, Task 2 auto)
- **Files modified:** 5 (3 created, 2 modified)
- **Diff size:** 1713 insertions, 1054 deletions over the plan base; `actuals.tokens` is chars/4 over the `src` and `tests` diff (167,587 chars)
- **game-session.ts:** 3,365 lines to 3,108

## Accomplishments

- **Step 1, the typed context (49e775e).** `src/app/session/context.ts` declares the five groups with the same field names and types as the old lets, `SessionDeps` (the immutable wiring) and `createSessionState`, which returns today's initial values including the save status, skip reason and unavailable flag derived from the boot status. `game-session.ts` has no closure-level `let` left; 764 identifier uses were rewritten to `ctx.<group>.<name>` by a script driven by the TypeScript checker (so shadowed names and shorthand properties such as `{ profile }` were resolved by symbol, not by text), then `prettier` and `tsc` were run after the pass. The typecheck needed only unused-import removals.
- **Step 2, the probe publisher (2a061db).** `updateProbe`, `bindTestHook`, `applyTestCredits`, `applyTestEquipment`, `syncEconomyProbe` and `syncSaveProbe` moved verbatim (reading through `ctx`) into `src/app/session/probe-publisher.ts`, with `withdrawProbe()` replacing the three inline `delete probe.*` statements in `dispose()`. `probe.renders = renderer.info.render.frame;` and the hook's `redrawGate.request();` plus taint assignment moved with them, in the same order.
- **A fake-context proof (8 tests, Node only).** `updateProbe` publishes `paused`, `systemId`, the chart camera with `spanY = 2 * spanX` and the message depth; it reads the live context at each call; a hook rebound from `stateA` to `stateB` mutates only `stateB`, taints the session, and the mutate callback re-arms the redraw gate; a `NaN` mutation changes nothing and does not taint; `withdrawProbe`, `syncSaveProbe` (committed revision, never the requested one) and `syncEconomyProbe` (no output before a market exists) are covered.

## Task Commits

1. **Task 1: Split step 1, the typed session context** - `49e775e` (refactor)
2. **Task 2: Split step 2, the probe publisher** - `2a061db` (refactor)

**Plan metadata:** the docs commit that carries this SUMMARY (see `git log`).

## Files Created/Modified

- `src/app/session/context.ts` - the five state groups, `SessionState`, `SessionDeps`, `createSessionState`
- `src/app/session/probe-publisher.ts` - `createProbePublisher`, `ProbePublisherDeps`, `ProbePublisher`, `toTuple`
- `tests/app/session/probe-publisher.test.ts` - the fake-context proof
- `src/app/game-session.ts` - the let block replaced by one `ctx`, every use rewritten, the publisher functions removed and wired through `probePublisher`
- `tests/app/session-source.test.ts` - the one test that asserted "exactly the facade" now asserts the facade first and only `src/app/session/**` after it (see Deviations)

## Publisher call sites

Recorded before the move (pre-move line numbers in the Task 1 commit 49e775e, enclosing function, neighbouring statements). Every call kept its enclosing function and its neighbours; the after-move comparison of (function, previous statement, next statement) for all 37 calls differs in exactly one place, where prettier wrapped `if (ctx.runtime.testHookEnabled)` and the call onto two lines in `loadFromSave` (same statement, same order).

| Function | Call sites (enclosing function: lines) | Before | After |
| --- | --- | --- | --- |
| `updateProbe` | manualSave 1167, writeManualSave 1177, failLoad 1208, setChartCamera 1659, toggleChartPreset 1679, openChart 1768, closeChart 1779, openSaveScreen 1819, closeSaveScreen 1833, applySaveScreenAction 1851 and 1885, renderFrame 2627, frame 2694 and 2705, startSession 3057 (the overwrite-cancel callback) | 15 | 15 |
| `bindTestHook` | loadFromSave 1313 (after `dockFeedback` is replaced, before `previousPose`), startSession 3160 (after the `?test=1` read) | 2 | 2 |
| `syncEconomyProbe` | renderStation 865, loadFromSave 1344, handleHyperspaceJumped 2080, handleEvent 2241, startSession 3171 | 5 | 5 |
| `syncSaveProbe` | setSaveNotice 1016, queueSnapshot 1057 and 1087, autosave 1111, 1116, 1121 and 1127, manualSave 1144, loadFromSave 1362, clearSaveForNewGame 1380 and 1392 | 11 | 11 |

Counts after the move are occurrences of `<name>(` over `src/app/game-session.ts` and `src/app/session/*.ts` minus the single `function <name>(` declaration: 16-1, 3-1, 6-1, 12-1 = 15, 2, 5, 11. The sum of `redrawGate.request();` over those files is 5 (baseline 5): four in `game-session.ts`, one in the hook's mutate callback in the publisher. `rg -c "^export" src/app/game-session.ts` prints 9.

## Step-1 stale-capture audit

- **Closure-level aliases (acceptance gate):** `rg -n "^  (const|let) [^=]*= ctx\.(core|station|chart|save|runtime)" src/app/game-session.ts` prints nothing. Every alias in the file sits inside a function body (four spaces or more) and is a one-call copy that existed before the rewrite (for example `const currentState = ctx.core.state;`).
- **drawKeys and shouldDraw:** each declares its alias on the line before its return (`const { state, scene } = ctx.core;`, `const { paused } = ctx.runtime; const { state } = ctx.core;`), so the state, scene and nebula revision are read at each call and the keys keep comparing the live objects by identity. The market-seed fallback in `startSession` uses a block-local `const { system } = ctx.core;` for the pinned `restoredMarketSeed ?? marketSeedForSystem(system.id)` literal; it is read once and not used after.
- **Long-lived registrations (each reads the live field through `ctx` at call time):**
  - chart view builder: `buildChartView(galaxy, ctx.core.system.id, ctx.core.hyperspaceTargetId, ctx.chart.chartCamera, ctx.core.profile.fuel, viewport, ctx.chart.chartSelectedId)` evaluated per call
  - chart tooltip builder: reads `ctx.core.labels` and `ctx.core.system` per call
  - chart `onSelect` / `onCamera`, Save/Load `onReturn` / `onSave` / `onLoad` / `onOverwriteConfirmed` / `onOverwriteCancelled`, station nav `onNavigate` / `onStatusPage`, the keyboard source's station-screen handler, the pause overlay, controls panel and settings panel callbacks: closures that call session functions, which read `ctx`
  - hint controller `onSeen`: reads `ctx.runtime.settings` per call; controls `onChange`: reads `ctx.runtime.input` per call; settings panel callbacks read `ctx.runtime.settings` per call
  - `docked.onLaunch` / `docked.onRefuel`: read `ctx.core.state`, `ctx.station.stationScreen`, `ctx.core.profile` and `ctx.core.equipmentCatalogue` per call
  - the game loop's step callback: re-reads `ctx.core.state`, `layout` and `config` for every fixed step (a jump can commit mid-frame)
  - the two window `keydown` listeners (`onSubpanelKeyDown`, `onLaunchKeyDown`): session functions reading `ctx`
  - the `?test=1` hook: bound to the flight state passed to `bindTestHook` at boot and again after every in-session Load (the one deliberate hold of a live object, rebinding proven by the unit test); its mutate callback sets `ctx.runtime.testTainted` and requests a redraw
  - captured by design, unchanged from before the split: `bindingMap` (passed to the input source, controls panel and hints) and the `flightState` local that feeds the one-shot `probe.restore`
- **Coverage contract (Round 2 review 820a435 L597, L604):** `vitest.config.ts` `coverage.include` is `src/sim/**`, `src/persistence/**` and `src/content/**`, and every threshold block is keyed to one of those globs. `src/app/**`, and so `src/app/session/**`, is not in the coverage `include` and carries no floor. Later split plans add no coverage obligation unless the config is changed on purpose; their unit tests run in the `unit` project (`tests/**/*.test.ts`) as normal.

## Gate record

| Gate | Commit | Tree SHA | Where it ran |
| --- | --- | --- | --- |
| scan tests (redraw-gate, economy-purity, sim-purity, session-source), 47 passed; `docker compose run --rm verify` green (lint, typecheck, assets:check, 111 unit files, build, 26 e2e incl. 6 probe-shape specs) | `49e775e` | `54eeaf8c0a4e953619b8feabdb785c8d1f7a8d8f` | main tree, before the commit, on the content the commit then recorded (porcelain listed only this plan's files and `.planning/`) |
| scan tests plus the new publisher test, 55 passed; `docker compose run --rm verify` green on the second run (112 unit files, 26 e2e incl. 6 probe-shape specs) | `2a061db` | `db8832a2e7037e2f877c3fa623538fec1acc9b16` | main tree, before the commit, same condition |

Gate attribution: no other run was writing `dist/` or `coverage/` (plan 08-05 did not run beside this plan). One container labelled `com.docker.compose.project=wegolite` was up throughout, an idle `wegolite-preview-1` serving the existing `dist/` for 37 hours (it was there before this plan started; it writes nothing), so the "prints nothing" `docker ps` condition did not hold literally; the preview publishes host port 4173 only, and the e2e web server runs inside the verify container's own network, so neither collides. I judged a detached-worktree gate unnecessary for that reason.

## Decisions Made

See `key-decisions` in the frontmatter: the two equipment-set lets went into `core`; `SessionDeps` is a type only; `ProbePublisherDeps` drops the two accessors the plan listed; `toTuple` is exported from the publisher; the publisher interface uses function-typed properties.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The session-source test asserted "exactly the facade" against the real tree**
- **Found during:** Task 1 (the targeted scan run before verify)
- **Issue:** `tests/app/session-source.test.ts` ("lists exactly the facade before the split has started") reads the real working tree; creating `src/app/session/context.ts` made it fail by design of 08-01. The plan's own Task 1 verify runs this file, so the first split commit had to change it.
- **Fix:** the test now asserts the facade is first and every later file is under `src/app/session/`; the temp-root ordering tests are untouched.
- **Files modified:** `tests/app/session-source.test.ts`
- **Verification:** 4 tests pass; the frozen scan tests (`redraw-gate`, `economy-purity`) were not edited
- **Committed in:** `49e775e`

**2. [Rule 3 - Blocking] Two local `const ctx = fitContext()` would shadow the session context**
- **Found during:** Task 1 (before the rewrite; `confirmFit` and the `onRefuel` callback)
- **Issue:** a local named `ctx` inside those two bodies would capture every rewritten `ctx.core.profile` use after it.
- **Fix:** renamed the two locals to `fitCtx` (pure rename, behaviour unchanged) before running the rewrite.
- **Files modified:** `src/app/game-session.ts`
- **Committed in:** `49e775e`

**3. [Rule 2 - Missing critical] Two closure lets outside the plan's list**
- **Found during:** Task 1
- **Issue:** the plan's group list names 75 variables; `equipmentSetSource` and `equipmentSetCache` (declared at the old line 576) are the other two of the 77 and the acceptance gate demands no `^  let ` at all.
- **Fix:** added both to `SessionCore`.
- **Committed in:** `49e775e`

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 missing field list entry)
**Impact on plan:** none on scope; the first two were unavoidable consequences of the split step and the third completed the plan's own acceptance criterion.

## Issues Encountered

- **Flaky unit test under the fast gate (not caused by this plan).** The first `verify` run of Task 2 failed on `tools/oolite-ingest/convert/textures.test.ts` "writes the committed baked files byte-for-byte" with `Test timed out in 5000ms` (it reported 5161 ms; it is a CPU-bound texture bake). Nothing it reads changed; the rerun was green with every unit file passing. Logged here rather than in `deferred-items.md` because it did not reproduce; if it recurs on an idle machine it needs a larger per-test timeout in a later hygiene plan.
- The 08-01 follow-up listed in `deferred-items.md` (D-1, the stale docked-home assertions) was already fixed by 033b8bb; both gates ran on a base where `verify` is green.

## Known Stubs

None. No placeholder, empty-data or TODO value was introduced; `createSessionState` initial values are the old initial values.

## Threat Flags

None. No new endpoint, auth path, file access or schema change; the `?test=1` hook binding, taint and rebind behaviour is unchanged and now unit-proven (T-08-07 mitigated), and the probe-shape spec, save-load and docking e2e in the fast gate ran green on both commits (T-08-08 mitigated).

## Next Phase Readiness

- Plan 08-06 can extract the frame-loop pieces against `SessionState`; `drawKeys` and `shouldDraw` already read the live state per call, ready for its identity unit test.
- Plan 08-12 moves `dispose()` with the `probePublisher.withdrawProbe()` call; plan 08-16 adds `delete probe.sim` inside `withdrawProbe()` in `src/app/session/probe-publisher.ts`.
- No blocker.

## Self-Check: PASSED

- `src/app/session/context.ts`, `src/app/session/probe-publisher.ts`, `tests/app/session/probe-publisher.test.ts`: present on disk.
- Commits `49e775e` and `2a061db` are ancestors of HEAD; `git rev-list --count d2df18f..HEAD` was 2 at the end of Task 2.
- Acceptance greps re-run after Task 2: no closure-level `let`, one `createSessionState(`, no closure-level alias, 9 exports, frozen files identical to the plan base, one `function updateProbe` in the publisher and none in the facade, call counts 15/2/5/11.

---
*Phase: 08-session-split-and-world-core*
*Completed: 2026-11-13*
