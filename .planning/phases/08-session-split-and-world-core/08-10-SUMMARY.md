---
phase: 08-session-split-and-world-core
plan: 10
subsystem: app
tags: [session-split, hyperspace-controller, event-router, sim-driver, step-options, refactor, g-7, d-14]

requires:
  - phase: 08-session-split-and-world-core
    provides: 08-04 typed SessionState and the probe publisher; 08-06 render driver and the controller-factory pattern; 08-08 station and save controllers (autosave, renderStation, ensureSelection reached through deps)
provides:
  - src/app/session/hyperspace-controller.ts, createHyperspaceController(ctx, deps) returning refusalCopy, handleHyperspaceJumped, enterSystemById, targetSystem and syncStatusOverlay, plus DESTINATION_BUILD_FAULT_MESSAGE (re-exported from the facade)
  - src/app/session/event-router.ts, createEventRouter(ctx, subscribers), EVENT_SUBSCRIBER_ORDER, ROUTED_EVENT_KINDS, RoutedKind, SubscriberName, isRoutedKind, EVENT_KIND_SUBSCRIBER and the four subscriber factories (createStationFlow, createHudMessages, createDockFeedbackFlow, createHyperspaceFlow)
  - src/app/session/sim-driver.ts, createSimDriver(ctx, deps) returning advanceFrame(delta) and stepOnce(commands, frameInput), the only flight-step call site in the session
  - src/app/session/step-options.ts, the pure buildStepOptions(input) (Node-importable)
  - tests/app/session/hyperspace-controller.test.ts (6), tests/app/session/sim-driver.test.ts (18), tests/app/session-order.test.ts (20)
affects: [08-11, 08-12, 08-14, 08-15, 08-16]

actuals:
  tokens: 24822
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "an event router keyed to its own literal RoutedKind union and read through an isRoutedKind guard, so a parallel plan widening SimEvent cannot break typecheck in either commit order"
    - "a declarative kind-to-ordered-subscriber table beside the global dispatch order; the router offers an event to each name in the global order that the kind's table entry lists"
    - "a controller needed by two earlier-built controllers (targetSystem) is built first, and the owners that come later (autosave, economy probe) are reached through call-time wrappers"
    - "a test wraps, not replaces, the real flight step with vi.mock plus importOriginal, so it sees each step's commands and the autosave position relative to the first step"

key-files:
  created:
    - src/app/session/hyperspace-controller.ts
    - src/app/session/event-router.ts
    - src/app/session/sim-driver.ts
    - src/app/session/step-options.ts
    - tests/app/session/hyperspace-controller.test.ts
    - tests/app/session/sim-driver.test.ts
    - tests/app/session-order.test.ts
  modified:
    - src/app/game-session.ts

key-decisions:
  - "the hyperspace controller is built before the station controller and the render driver, because both take targetSystem; its autosave and economy-probe dependencies are call-time wrappers over the save controller and the probe publisher built later"
  - "DESTINATION_BUILD_FAULT_MESSAGE moved with the arrival into hyperspace-controller.ts and the facade re-exports it with one `export { ... } from` line, so the facade keeps its 9 export lines and no value import cycle appears (the controller only type-imports the facade)"
  - "the router dispatches by walking EVENT_SUBSCRIBER_ORDER and offering the event to each name its table entry lists; an unrouted kind returns before any table read, through isRoutedKind (Object.hasOwn), so 'constructor' and a reserved kind read as unrouted"
  - "createEventRouter holds ctx with an explicit `void ctx` (noUnusedParameters) until plan 08-15 wires worldLifecycle inside the router; the four gameplay subscribers close over ctx themselves"
  - "advanceFrame re-reads state, input and loop from ctx instead of taking the frame()'s captured copies; this is equivalent because a Load installs its state only after an await, never inside frame()"

patterns-established:
  - "a split step that moves event or frame code is pinned by recording-double tests whose expected logs are written out literally from the pre-move source, not derived from the code under test"

requirements-completed: []

coverage:
  - id: D1
    description: "Split step 7: the hyperspace controller owns refusalCopy, handleHyperspaceJumped, enterSystemById, targetSystem and a document-guarded syncStatusOverlay; the arrival keeps its atomic order, and a failed destination build freezes the session and leaves profile, market, seed and target untouched with no autosave"
    requirement: FOUND-10
    verification:
      - kind: unit
        ref: "tests/app/session/hyperspace-controller.test.ts (failed build freezes and leaves economy and target identical, unknown destination refuses and changes nothing, committed arrival order enterSystem, announce, autosave, probe, refusal copy, target resolution, no document)"
        status: pass
      - kind: other
        ref: "rg acceptance: one `function handleHyperspaceJumped` in the controller and none in the facade; both economy-purity producer texts once in the controller; frozen files identical to the plan base"
        status: pass
    human_judgment: false
  - id: D2
    description: "Split step 8, router: handleEvent is four ordered subscribers behind createEventRouter(ctx, subscribers); EVENT_KIND_SUBSCRIBER maps the 14 kinds to single-subscriber tuples keyed to RoutedKind and read through isRoutedKind; one `case \"docked\":` in the stationFlow switch; no exhaustive check and no throwing default"
    requirement: FOUND-10
    verification:
      - kind: unit
        ref: "tests/app/session-order.test.ts (20 tests: pinned order, literal 14-kind table, tuple subsequence, offered subscribers per kind, eight characterized arm sequences plus launchComplete no-persist, computer dock and the HUD message copy, emission order of launched, launchComplete, massLockChanged, docked, unknown and inherited kinds pass through, isRoutedKind)"
        status: pass
      - kind: other
        ref: "tests/guards/economy-purity.test.ts (docked arm has no market generation or re-seed) and the acceptance greps: one `case \"docked\":` in src/app, `kind is RoutedKind` once, SimEvent[\"kind\"] only in the satisfies line, no `: never`"
        status: pass
    human_judgment: false
  - id: D3
    description: "Split step 8, driver: sim-driver owns the drain, launch filter, one pre-launch autosave taken while docked and before the first step, the hyperspace edge mapping, one shared input frame per rendered frame, and stepOnce, the single flight-step call site; buildStepOptions is pure and omits absent optional keys"
    requirement: FOUND-10
    verification:
      - kind: unit
        ref: "tests/app/session/sim-driver.test.ts (commands reach step one only, autosave once while docked and before the first step, launch filtered off the home screen, once across two frames, once for a double launch, none in flight, one keyboard drain per frame with pending emptied, one input frame shared by all steps, timeline advance only after a step that started in launching, four `pending.length = 0;` sites, four buildStepOptions cases)"
        status: pass
      - kind: e2e
        ref: "docker compose run --rm verify on 329b9f8 (127 unit files / 1,949 tests, 26 Chromium specs including both probe-shape specs): exit 0"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-11-13
status: complete
plan_head_before: f81d4f834ff86ef135fcd58968a7d0685cfcec45
plan_head_after: 329b9f88c8db21222c933440166ef7e6f231fefa
---

# Phase 8 Plan 10: Session split steps 7 and 8 Summary

**The hyperspace arrival moves out of game-session.ts as one atomic unit with its failure freeze unit-proven, then handleEvent becomes a pinned four-subscriber router and the frame's drain-to-step path becomes a sim driver whose stepOnce is the session's only flight-step call site, with the per-step options built by a pure Node-importable function; two commits, verify green on each, no probe, golden or sim file touched.**

## Performance

- **Duration:** about 20 min of active work by the commit clock (plan base `f81d4f8` at 14:00 local, Task 2 commit at 14:19 local), plus two 5.5-minute verify runs inside that window
- **Tasks:** 2 (Task 1 tracer, Task 2 auto)
- **Files modified:** 8 (7 created, 1 modified)
- **Diff size:** 2,112 insertions and 416 deletions over `src` and `tests` (99,290 chars, so `actuals.tokens` is 24,822 at chars/4)
- **game-session.ts:** 1,433 lines to 1,091

## Accomplishments

- **Step 7, the hyperspace controller (18aba4b).** `createHyperspaceController(ctx, deps)` carries `refusalCopy`, `handleHyperspaceJumped`, `enterSystemById`, `targetSystem` and `syncStatusOverlay`, bodies moved verbatim: destination resolved through the validated galaxy, previous and next seeds, the pure exit draw, the try block (market build, the injected fault, scene entry), the catch that shows the failure and sets `paused`, then the install block ending with the autosave and the economy probe. `syncStatusOverlay` gains an `if (typeof document === "undefined") return;` guard. The failure surface, autosave, economy probe, scene manager and faults reach it through deps.
- **Step 8, the router and the driver (329b9f8).** `createEventRouter(ctx, subscribers)` offers each event to the four subscribers in `EVENT_SUBSCRIBER_ORDER`, filtered by the declarative `EVENT_KIND_SUBSCRIBER` table. `createSimDriver(ctx, deps)` holds the drain, filter, pre-launch autosave, edge mapping, the single `frame()` input take and `loop.advance`, and `stepOnce` holds the step callback. `buildStepOptions` holds the options construction. The facade's `frame()` now calls `simDriver.advanceFrame(delta)` in the not-paused branch and keeps its other phases, including three of the four `pending.length = 0;` sites.
- **Proofs.** The arrival's failure freeze, the autosave position and count, the one-drain and shared-frame rules, the timeline gate, the step-options rules, the routing table and eight arm sequences are all asserted in Node with recording doubles (44 new tests).

## Task Commits

1. **Task 1: Split step 7, the hyperspace controller** - `18aba4b` (refactor)
2. **Task 2: Split step 8, the event router, sim driver and step options** - `329b9f8` (refactor)

**Plan metadata:** the docs commit that carries this SUMMARY (see `git log`). The measured `commits: 2` is `git rev-list --count f81d4f8..329b9f8`.

## Event arm sequences

The pre-move side-effect order of every `handleEvent` arm, recorded from `game-session.ts` at `f81d4f8` before the move. `ctx` writes are listed where they sit among collaborator calls. The router tests assert the first eight sequences (the `docked` arm for both `via` values) as full ordered logs.

| Kind | Side effects in order |
| --- | --- |
| launched | `launchSequence.reset()`; station reset (screen "home", pending null, notice "", message "", page 1); `input.setContext("flight")`; `docked.hide()`; `syncStationNav()`; `hudCanvas.hidden = false`; `messages.enqueue("Launching — stand by")`; `syncEconomyProbe()`. No save here (D-17). |
| launchComplete | `launchSequence.markSeen()`; `ctx.core.launchSeen = true`; if settings exist and `launchSeen` is false: `settings.launchSeen = true`, then `persistSettings()`; `messages.enqueue("Arrows pitch and roll · W and S change speed")`. |
| docked | `ctx.core.lastDockClockDelta = event.clockDelta`; `launchSequence.reset()`; station reset (as above); `input.setContext("dockHome")`; `docked.show(system name)`; `ensureSelection()`; `renderStation()`; `syncStationNav()`; for `via` "computer": `messages.enqueuePriority("Docking computers engaged")`, `stationMessage = "Docking computers engaged"`, `renderStation()` again; `input.clearAll()`; `previousPose` and `currentPose` set to the docked pose; `autosave()` last. |
| dockDenied | `messages.enqueuePriority` of "No docking computer fitted" (notInstalled) or "Too far from the station to engage docking computer". |
| torusEngaged | `messages.enqueue("Torus engaged at <factor to 1 place>×")`. |
| torusDisengaged | `messages.enqueue("Torus disengaged")`. |
| massLockChanged | When `locked`: `messages.enqueue("Mass locked")`; otherwise nothing. |
| bounce | `ctx.core.dockFeedback.trigger("bounce", flightTime or 0)`; `messages.enqueuePriority(bounceMessage(event))`. |
| scrape | `dockFeedback.trigger("scrape", now)`; when `shouldEmitScrapeMessage(lastScrapeMessageTime, now)`: `messages.enqueuePriority("Scrape - ease toward the centre of the slot")` then `lastScrapeMessageTime = now`. |
| compassTargetChanged | `messages.enqueue("Compass target: <target>")`. |
| hyperspaceCountdownStarted | Resolve the name through the galaxy (or "(Unknown)"); `messages.enqueue("Hyperspace to <name> in <seconds> seconds")`. |
| hyperspaceCountdownCancelled | `messages.enqueue("Hyperspace countdown cancelled")`. |
| hyperspaceRefused | `ctx.core.lastRefusal = { reason }`; `messages.enqueuePriority(refusalCopy(reason))`. |
| hyperspaceJumped | `handleHyperspaceJumped(event)` only. |

## Ordering with plan 08-11

Plan 08-11's `src/sim/events.ts` commit has **not** landed at this plan's Task 2 commit: `git log -- src/sim/events.ts` still ends at `28d2c71`, so this plan committed first and typecheck passed against the 14-kind union (`docker compose run --rm typecheck` and the typecheck stage of `verify`). The router is keyed to `RoutedKind` and the only mention of the full union's kind type is the `satisfies` line, so 08-11 widening the union later cannot break `src/app`; I did not run a second typecheck against a widened union because the plan forbids touching `src/sim/events.ts` here.

## Gates

| Gate | Commit | Tree SHA | Where it ran |
| --- | --- | --- | --- |
| `tests/app/session` + economy-purity + redraw-gate, then `docker compose run --rm verify`: 125 unit files / 1,911 tests (2 skipped), 26 Chromium specs incl. both probe-shape specs, exit 0 | `18aba4b` | `a96c78c4b6f56ce791dd57a1033487cabef9551e` | main tree before the commit. Porcelain listed only this plan's files and untracked `.planning/` review diagnostics; the only running `wegolite`-labelled container was the idle `wegolite-preview-1`. Caveat: I created the three Task 2 source files (not yet imported by any module) while that run was in its e2e stage, after its unit stage had finished, so no stage read them |
| `tests/app/session` + `session-order` + economy-purity + redraw-gate + sim-purity + compliance, 183 passed; `docker compose run --rm verify`: 127 unit files / 1,949 tests (2 skipped), 26 Chromium specs incl. both probe-shape specs, exit 0 | `329b9f8` | `f98f473aaa8c166ed24fa3ce89cce702909f534b` | main tree before the commit, same condition (porcelain: this plan's files plus untracked `.planning/`; idle preview container only) |

`verify-full` is not required by this plan (D-12 requires it at split steps 3, 6 and 9; the plan text names only `verify`, and T-08-19 defers the save-load and autosave specs to step 9), so it was not run.

## Acceptance checks (re-run at HEAD before the SUMMARY)

- Step 7: `function handleHyperspaceJumped` once in the controller, none in the facade; `generateMarket(destination, catalogue, nextSeed)` and `nextSeed = arrivalMarketSeed(destination.id, previousSeed)` once each in the controller; `^export` count of the facade is 9; frozen files (`src/app/probe.ts`, `tests/fixtures/probe-shape.json`, `tests/app/redraw-gate.test.ts`, `tests/guards/economy-purity.test.ts`, `tests/golden`) identical to `f81d4f8` (exit 0).
- Step 8: the sum of `stepFlight(` over the facade and `src/app/session` is 1, in `sim-driver.ts`; one `case "docked":` in `src/app`, in `event-router.ts`; `createEventRouter(ctx,` once in the facade; no `ctx?: SessionState`; one `Record<RoutedKind, readonly SubscriberName[]>`; one `kind is RoutedKind`; `SimEvent["kind"]` appears once outside comments, on the `satisfies` line; `step-options.ts` imports only `src/sim` modules and `import type` from `content/types`; no `: never` in the router; no src/sim file in either commit.

## Files Created/Modified

- `src/app/session/hyperspace-controller.ts` - `createHyperspaceController`, `HyperspaceControllerDeps`, `HyperspaceController`, `DESTINATION_BUILD_FAULT_MESSAGE`
- `src/app/session/event-router.ts` - the router, the order and table, `isRoutedKind`, `bounceMessage` and the four subscriber factories with their deps interfaces
- `src/app/session/sim-driver.ts` - `createSimDriver`, `SimDriverDeps`, `SimDriver`
- `src/app/session/step-options.ts` - `buildStepOptions`, `StepOptionsInput`
- `tests/app/session/hyperspace-controller.test.ts`, `tests/app/session/sim-driver.test.ts`, `tests/app/session-order.test.ts` - the proofs
- `src/app/game-session.ts` - the moved bodies removed, the controller, router and driver wired, unused imports dropped

## Decisions Made

See `key-decisions` in the frontmatter: the construction order and call-time wrappers, the constant's re-export, the table-filtered dispatch, the held `ctx`, and the ctx re-read in `advanceFrame`.

## Deviations from Plan

### Auto-fixed Issues

None. Three small points of detail the plan did not spell out:

- The plan lists `src/app/session/context.ts` in `files_modified`; it needed no change, because the new controllers take their collaborators through deps and the facade already held every field they read, so it is untouched.
- The plan says `createEventRouter` returns `dispatch` and the subscribers are exported; I exported them as four factories (`createStationFlow`, `createHudMessages`, `createDockFeedbackFlow`, `createHyperspaceFlow`) so the order test can drive the real arms, and `bounceMessage` moved with the bounce arm into the router module.
- `tests/app/session/sim-driver.test.ts` wraps the real `stepFlight` with `vi.mock` plus `importOriginal` rather than using a stepFlight double, so the real sim still runs and the test sees each step's commands.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** none.

## Issues Encountered

- Two lint findings in my own new code, fixed before the commit: a `noUnusedParameters` error on the router's `ctx` (resolved with an explicit `void ctx;` and a comment) and an `@typescript-eslint/no-base-to-string` on a template in the order test (resolved by printing `null` or `set`).
- No flaky test from deferred-items D-2 (`launch.spec.ts:129`, `save-load.spec.ts:634`) failed in either verify run, so no rerun was needed.

## Known Stubs

None. No placeholder, empty-data or TODO value was introduced.

## Threat Flags

None. No new endpoint, auth path, file access or schema change. T-08-18 is mitigated: the arrival moved as one unit with its statement order unchanged and the unit test proves a failed build freezes the session and leaves profile, market, seed and target untouched with no save. T-08-19 is mitigated: the drain, filter and autosave moved verbatim into `advanceFrame`, and unit tests prove one autosave per accepted launch drain, taken while docked and before the first step, none on the next frame, none for a launch drained in flight, and one keyboard drain per frame; the save-load and autosave e2e specs run in `verify-full` at step 9.

## Next Phase Readiness

- Plan 08-11 can widen `SimEvent` in either commit order. Plan 08-15 can replace the one `stepFlight(` call in `sim-driver.ts` `stepOnce` with the world step and wire `worldLifecycle` inside `event-router.ts` (extend `EVENT_SUBSCRIBER_ORDER`, `SubscriberName`, the table entries for `launched` and `docked`, and `EventRouterSubscribers`), without editing `game-session.ts` beyond what the new subscriber's deps need. Plans 08-14 and 08-16 can call `buildStepOptions` from Node.
- Plan 08-12 (step 9) still has the two window `keydown` registrations and the rest of `frame()` to move; the three remaining `pending.length = 0;` sites are in the facade's `frame()` and move with it, and plan 08-12 adds the frame-level behavioural test.
- `FOUND-10` is not marked complete: `requirements.ready-ids` reports it blocked by the other plans of the phase that declare it.
- No blocker.

## Self-Check: PASSED

- Created files present on disk: `src/app/session/hyperspace-controller.ts`, `src/app/session/event-router.ts`, `src/app/session/sim-driver.ts`, `src/app/session/step-options.ts`, `tests/app/session/hyperspace-controller.test.ts`, `tests/app/session/sim-driver.test.ts`, `tests/app/session-order.test.ts`.
- Commits `18aba4b` and `329b9f8` are ancestors of HEAD; `git rev-list --count f81d4f8..329b9f8` is 2.
- All Task 1 and Task 2 acceptance criteria re-run at HEAD (listed above); `verify` exit 0 on both task commits.

---
*Phase: 08-session-split-and-world-core*
*Completed: 2026-11-13*
