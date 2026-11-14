---
phase: 12-inert-ships-and-the-world-lifecycle
plan: 12
subsystem: e2e
tags: [playwright, traffic, draw-calls, data-13, cold-start, populated-parity, scanner, save-08]
requires:
  - phase: 12-inert-ships-and-the-world-lifecycle
    provides: "plan 12-09 runTickScript(..., { traffic: true }); plan 12-10 tests/helpers/traffic-fixture.ts (laveInertWorld, poseNearFirstShip) and the id-free scanner contacts; plan 12-11 the instanced NPC layer and the NpcModelLoader closed until the first in-flight frame"
provides:
  - "tests/e2e/traffic.spec.ts: the one opt-in traffic browser spec of Phase 12, three tests, opted in by URL (?test=1&traffic=1&clock=manual), runs unchanged against the browser-test bundle and the production bundle"
  - "populated browser/Node parity: 12 entities and a world hash equal to the Node replay of a launch and 600 ticks (Phase 8 deferral closed)"
  - "the traffic-on cold start measured in Chromium: no NPC GLB or texture before the first in-flight frame (page-side fetch stamps), 8,839,791 bytes against the unchanged 9,437,184 ceiling, present models and textures finished within 600 loop frames"
  - "a reload 5 km from a regenerated ship shows it on the scanner (SAVE-08 in the browser)"
  - "docs/PERFORMANCE.md: the Lave in flight traffic-on row, the traffic-on cold-start transfer and the deferral note; PROJECT.md row 237 records the populated browser parity"
affects: [12-14]
status: complete
actuals:
  tokens: 11700
  tasks: 3
  commits: 4
plan_head_before: dcfe47611a4134038b2810ec014cead0d860375c
plan_head_after: 207a70e4cf58b7da4b87a9e5003ffd3729df38ee
tech-stack:
  added: []
  patterns:
    - "an init script wraps window.fetch to stamp each same-origin path with probe.mode at the call, so the ordering of requests against the first in-flight frame is proven in the page and cross-checked against the Playwright request log"
    - "GLB requests held with page.route until released in a finally, so a held-versus-loaded draw-call comparison is made in one session"
    - "a window counted in loop frames (probe.frames) with a separate, larger wait timeout as the correctness bound; assertions are counts, never milliseconds"
key-files:
  created:
    - tests/e2e/traffic.spec.ts
  modified:
    - docs/PERFORMANCE.md
    - .planning/PROJECT.md
key-decisions:
  - "The traffic-on cold start is measured in the opt-in spec, not in budget.spec.ts (which stays traffic off, byte-unchanged): DATA-13 and ROADMAP Phase 9 criterion 3 are enforced unchanged with traffic on (owner decision 2026-11-14, option A)."
requirements-completed: [WORLD-15, SAVE-08]
coverage:
  - id: D1
    description: "A traffic-on launch holds 12 inert ships from the launch tick, requests no NPC GLB while launching, then requests exactly the GLBs of the ship keys present in the replay world; draw calls rise once the models load, stay within 50, and the scanner ship count is the same with the models held and loaded"
    requirement: "WORLD-15"
    verification:
      - kind: e2e
        ref: "tests/e2e/traffic.spec.ts#a launch populates the world, draws the ships within budget and matches the Node replay"
        status: pass
    human_judgment: false
  - id: D2
    description: "Populated browser/Node parity: test.worldHash() equals runTickScript(launch + 600 ticks, { traffic: true }).hash, which differs from hashFlight of the replay state"
    requirement: "WORLD-16"
    verification:
      - kind: e2e
        ref: "tests/e2e/traffic.spec.ts#a launch populates the world, draws the ships within budget and matches the Node replay"
        status: pass
    human_judgment: false
  - id: D3
    description: "A traffic-on cold start requests no NPC GLB or texture before the first in-flight frame, transfers at most 9,437,184 bytes to it, and the present models and their textures finish within 600 loop frames with no failed request, drawn within 50 calls"
    requirement: "WORLD-15"
    verification:
      - kind: e2e
        ref: "tests/e2e/traffic.spec.ts#a traffic-on cold start requests no NPC model before the first in-flight frame, stays under the first-load ceiling and loads the present models within a fixed frame window"
        status: pass
    human_judgment: false
  - id: D4
    description: "A reload with an in-flight save 5 km from the first ship of the regenerated Lave world holds 12 entities and lists as many ship contacts on the scanner as the Node computation, and at least one; the id-counter mismatch (101 vs 113) does not fail the load"
    requirement: "SAVE-08"
    verification:
      - kind: e2e
        ref: "tests/e2e/traffic.spec.ts#a reload next to a regenerated ship shows it on the scanner"
        status: pass
    human_judgment: false
  - id: D5
    description: "docs/PERFORMANCE.md records the measured traffic-on draw calls and triangles and the traffic-on cold-start transfer with the deferral note; PROJECT.md row 237 records the populated browser parity"
    verification: []
    human_judgment: true
    rationale: "Documentation wording; verified by the acceptance greps, not by a test"
---

# Phase 12 Plan 12: The populated session in Chromium Summary

One opt-in browser spec (`tests/e2e/traffic.spec.ts`, three tests) now proves the populated session in Chromium: 12 inert ships drawn within the 50-call budget once their models load, a traffic-on cold start that requests no NPC model before the first in-flight frame and stays under the unchanged 9 MiB ceiling, browser/Node world-hash parity for a populated launch, and a reload that puts a regenerated ship on the scanner.

## Requirements and gates

- **Requirements.** WORLD-15 (drawn within the draw-call budget, models on demand, scanner contacts) and SAVE-08 (the reload regenerates the inert world, seen on the scanner) are delivered by this plan; every other plan declaring them already has its summary, so they are ready to mark complete. WORLD-16 stays pending (plan 12-14 also declares it), as does WORLD-11 (plans 12-13 and 12-14).
- **Render gate.** The render gate for the NPC draw path (plans 12-11 and 12-12) is the phase-end `verify-full` of plan 12-14 (owner's gate decision of 2026-11-13), whose full Chromium suite runs this spec; the Firefox project matches only engine and core-loop specs, so `e2e-cross` does not run it.
- **Where the assertions live.** The populated-scene 50-draw-call assertion and the traffic-on cold start (DATA-13, owner decision 2026-11-14, option A) live in this opt-in `tests/e2e/traffic.spec.ts`, which `verify-full` runs, not in `tests/e2e/budget.spec.ts`, which stays traffic off and byte-unchanged (as do `tests/e2e/tick-hook.spec.ts` and `tests/e2e/npc-assets.spec.ts`; the 34 plain `goto("/")` sessions are unchanged).

## Measured values

| Quantity | Value |
| --- | --- |
| Task 1: calls and triangles with the NPC models held (after a launch and 600 ticks) | 9 calls, 39,192 triangles |
| Task 1: calls and triangles with the models loaded | 17 calls, 49,095 triangles (budget 50) |
| Task 2: `first-load-bytes-traffic-on`, browser-test bundle | 8,839,791 bytes (ceiling 9,437,184) |
| Task 2: `first-load-bytes-traffic-on`, production bundle (`npm run build`, cold-start test only) | 8,839,791 bytes (ceiling 9,437,184) |
| Task 2: NPC requests after the first in-flight frame | 6 GLBs, 26 textures (the ship types present in the replay world); none before it |
| Task 2: calls at the first in-flight frame (base) and after the 600-frame window (loaded) | 9 and 17 |

The two bundles transfer the same bytes because they differ only in the traffic default, which `?test=1&traffic=1` overrides. Traffic on adds 4,579 bytes to the traffic-off baseline of 8,835,212 (headroom 597,393). The local Docker run reproduced every figure exactly.

## Task Commits

| Task | Name | Commit |
| --- | --- | --- |
| 1 | the opt-in traffic spec: populated launch, draw calls within budget, Node replay parity (tracer) | a018b6a |
| 2 | the traffic-on cold-start test: no NPC request before the first in-flight frame, ceiling, model-load window | 8a84d41 |
| 3a | the reload scanner check | 90a87f2 |
| 3b | PERFORMANCE rows and note, PROJECT row 237 | 207a70e |

Tracer gate: the automated-only `<verify>` (targeted spec, typecheck) passed after commit a018b6a, so expansion proceeded with no checkpoint.

## Gates run (all in Docker)

| Gate | Result |
| --- | --- |
| `remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/traffic.spec.ts"` (committed HEADs a018b6a, 8a84d41, 90a87f2) | 1, 2 and 3 tests passed, exit 0 |
| Same command, run locally with the JSON reporter on committed HEAD 90a87f2 | 3 passed, 0 unexpected; annotations identical to the remote run |
| `remote-run.sh run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/traffic.spec.ts -g 'cold start'"` (production bundle, HEAD 8a84d41) | 1 passed, exit 0 |
| `docker compose run --rm typecheck` (local) | exit 0 |
| `docker compose run --rm lint` (local, ESLint and Prettier, after formatting PERFORMANCE.md) | exit 0 |
| `docker compose run --rm test npx vitest run tests/contract/readme.test.ts` (local) | 21 passed |

Neither `verify` nor `verify-full` was run (the plan's gate policy). No wall-clock value is asserted anywhere in the spec.

Acceptance greps: `traffic=1` 2, `runTickScript(` 2, `poseNearFirstShip(` 1, `FIRST_LOAD_BYTES_CEILING` 3, `MODEL_LOAD_WINDOW_FRAMES` 2, `addInitScript` 1; no import from a sibling spec module (exit 1); `goto("/")` total 34; `git diff --name-only dcfe476 -- tick-hook budget npc-assets` empty; PERFORMANCE: `traffic on (opt-in)` 1, `traffic on (production build)` 1, `Defer NPC model requests until the first in-flight frame` 1; PROJECT: `browser parity now covers a populated launch world` 1.

## Deviations from Plan

### Departures worth a reviewer's eye (no rule triggered)

- **Commit-then-run.** The remote wrapper syncs only the committed HEAD, so each task was committed before its browser gate ran (the plan's brief says the orchestrator commits; the dispatch required per-task commits). Nothing needed a fix after a run, so there are no fixup commits.
- **First-in-flight read.** `page.waitForFunction` returns `false | { frames, calls }`; the spec narrows it with an explicit throw instead of a cast.
- **Loaded-scene wait.** Task 1 waits (240 s correctness bound) for `probe.calls` to exceed the held value after the GLBs finish, then 10 more frames, because the models are drawn from the first frame that sees them; the assertion itself is a count.
- **PERFORMANCE row figures.** The traffic-on row records the loaded scene (17 calls, 49,095 triangles); the held-scene figures (9 and 39,192) sit in the note below the table. The held figure is one call below the 10 of the traffic-off in-flight row because the pose after launch and 600 ticks is not the traffic-off row's pose. Prettier reflowed the two PERFORMANCE tables when the wider rows were added.

**Total deviations:** 0 rule-triggered. **Impact:** none.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-12-34 (held routes released in a `finally`, every wait has a timeout), T-12-35 (opt-in by URL only, the unchanged specs and the 34-session guard) and T-12-37 (zero NPC requests before the first in-flight frame, ceiling asserted in both bundles) are mitigated as stated.

## Next Phase Readiness

Plan 12-13 (chart close and loop guard) and plan 12-14 (`advanceBehind` and the phase-end `verify-full`, which runs this spec in the full Chromium suite) follow. The spec adds no probe key and changes no source under `src/`.

## Self-Check: PASSED

`tests/e2e/traffic.spec.ts` exists; commits a018b6a, 8a84d41, 90a87f2 and 207a70e are ancestors of HEAD; `git rev-list --count dcfe476..HEAD` was 4 before this summary.
