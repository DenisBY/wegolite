---
phase: 08-session-split-and-world-core
plan: 09
subsystem: simulation
tags: [ai-seam, test-pilot, lint-zone, determinism, integer-ticks, registry]

requires:
  - phase: 08-session-split-and-world-core
    provides: 08-05 AiComponent and the world core; 08-07 WorldView, ShipControl and their implementations; 08-03 SIM_*_BANS and the sim-probe guard helpers
provides:
  - src/sim/ai/types.ts extended with AI_EVENT_NAMES, AiEventName, AiEvent, AiContext, AiModule
  - src/sim/ai/time.ts (TICKS_PER_SECOND, THINK_INTERVAL_TICKS, ticks)
  - src/sim/ai/registry.ts (frozen AI_REGISTRY)
  - src/sim/ai/pilots/test-pilot.ts (TEST_PILOT, createTestPilotAi)
  - the AI lint zone in eslint.config.js (three depth blocks, two case-sensitive allow-list regexes, createSeededRandom ban, module-level state bans, dynamic-import ban)
  - tests/guards/ai-zone.test.ts (106 tests), tests/sim/ai/test-pilot.test.ts (16), tests/sim/ai/time.test.ts (4)
affects: [08-11, 08-12, 08-13, 08-15, 08-16]

plan_head_before: 5697281b29d539b524498599c93f1ca17d3e18f7
plan_head_after: b040c392adc18ad091775abca8773ce0a067d5d1

actuals:
  tokens: 15000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "AI lint zone as an allow-list: a regex pattern that matches every specifier EXCEPT the allowed ones (negative lookahead), compiled case-sensitive, one regex per directory depth; depth >= 3 rejects every import"
    - "every AI block redefines no-restricted-syntax with the sim bans spread back in; globals, properties, no-eval, no-new-func and no-implied-eval stay inherited from the sim block"
    - "AI modules freeze module tables with Object.freeze at the declaration; a lint rule rejects top-level let/var and top-level array, object and new initialisers"
    - "a guard probe must use a fresh basename per call: the TypeScript project service remembers a probe path it has seen and fails with 'not found by the project service' when the same name is recreated"

key-files:
  created:
    - src/sim/ai/time.ts
    - src/sim/ai/registry.ts
    - src/sim/ai/pilots/test-pilot.ts
    - tests/sim/ai/test-pilot.test.ts
    - tests/sim/ai/time.test.ts
    - tests/guards/ai-zone.test.ts
  modified:
    - src/sim/ai/types.ts
    - eslint.config.js

key-decisions:
  - "A lost hold target makes the pilot clear targetId (and call setTarget(self, NO_ENTITY)) and return to seek, without acting further in that think; the next think seeks again. The plan said only 'returns to seek', so the cheapest deterministic reading was taken"
  - "The pilot draws exactly one random number per think, always for the wake delay, so its stream use is constant whichever phase it is in"
  - "Each AI block spells out its no-restricted-syntax list inline (sim bans, module-state bans, ImportExpression ban) instead of sharing a constant, to match the plan's per-block acceptance counts"

patterns-established:
  - "Pattern: an AI zone proof reads the effective config through ESLint#calculateConfigForFile and pins allow/reject specifier tables without running lint per specifier"
  - "Pattern: the seam modules (ids, math, view, control) are sealed against re-export bridges by a source scan"

requirements-completed: []

coverage:
  - id: D1
    description: "The test pilot reads the world only through WorldView and acts only through ShipControl: with a fake view and a recording control one think in each phase records exactly the documented calls (seek, hold switch at and just past holdRange, IDLE on an empty scan or unresolved bodies, hold keeps speed 0, target loss returns to seek)"
    requirement: FOUND-13
    verification:
      - kind: unit
        ref: "tests/sim/ai/test-pilot.test.ts#seek"
        status: pass
      - kind: unit
        ref: "tests/sim/ai/test-pilot.test.ts#hold"
        status: pass
    human_judgment: false
  - id: D2
    description: "The pilot's state is plain data: JSON round trip deep-equals after each of 200 thinks against a real world, nextThinkTick and wakeTick are safe integers, both phases are visited, and a pilot rebuilt from JSON makes identical calls for 20 thinks"
    requirement: FOUND-13
    verification:
      - kind: unit
        ref: "tests/sim/ai/test-pilot.test.ts#state is plain data"
        status: pass
    human_judgment: false
  - id: D3
    description: "A stored target id is an id of the pilot's own world: a view that never issued it (isValid false) sends a holding pilot back to seek"
    requirement: FOUND-13
    verification:
      - kind: unit
        ref: "tests/sim/ai/test-pilot.test.ts#hold (per-world target)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Time base: TICKS_PER_SECOND * DT === 1, ticks(0.125) === 15, ticks(0) === 1, ticks throws RangeError for negative, NaN and infinite input; a wake draw of 0 gives 12 ticks, 0.999 gives 192, and an early wake re-arms nextThinkTick 127 and an integer wakeTick 124 after a think on tick 112"
    requirement: FOUND-13
    verification:
      - kind: unit
        ref: "tests/sim/ai/time.test.ts"
        status: pass
      - kind: unit
        ref: "tests/sim/ai/test-pilot.test.ts#randomness and the wake"
        status: pass
    human_judgment: false
  - id: D5
    description: "Lint rejects, at depth 1, depth 2 (pilots and nested) and depth 3, value, type-only, re-export, dynamic and ./-climbing imports of flight, store, entity, world, content, three and zod, and accepts WorldView, ShipControl, world/ids, sim math and AI siblings"
    requirement: FOUND-13
    verification:
      - kind: unit
        ref: "tests/guards/ai-zone.test.ts#the AI zone rejects imports of simulation internals"
        status: pass
      - kind: unit
        ref: "tests/guards/ai-zone.test.ts#the AI zone accepts the seam"
        status: pass
    human_judgment: false
  - id: D6
    description: "The per-depth allow-list regexes are case-sensitive and pinned by an allow/reject table read from the effective config; each depth has exactly one createSeededRandom path ban"
    requirement: FOUND-13
    verification:
      - kind: unit
        ref: "tests/guards/ai-zone.test.ts#AI import allow-list table"
        status: pass
    human_judgment: false
  - id: D7
    description: "The sim determinism bans (for..in, Date.now, Math.random, bare sort, setTimeout, globalThis, Math alias, new Function, Intl, localeCompare) still fire inside the AI zone"
    requirement: FOUND-12
    verification:
      - kind: unit
        ref: "tests/guards/ai-zone.test.ts#the sim determinism bans stay active inside the AI zone"
        status: pass
    human_judgment: false
  - id: D8
    description: "AI code cannot reach the closure-held stream (aliased, namespace and depth-2 createSeededRandom imports rejected) and cannot hold module-level mutable state (let, var, array, object, new, object default export rejected; Object.freeze, numeric const, as const and function-local let accepted)"
    requirement: FOUND-13
    verification:
      - kind: unit
        ref: "tests/guards/ai-zone.test.ts#the AI zone cannot reach the closure-held random stream"
        status: pass
      - kind: unit
        ref: "tests/guards/ai-zone.test.ts#the AI zone bans module-level mutable state"
        status: pass
    human_judgment: false
  - id: D9
    description: "The real test-pilot, registry, types and time modules lint clean, and ids.ts, math.ts, view.ts and control.ts cannot become re-export bridges (no export-from, ids.ts no imports, math.ts imports only ./rng.js, view.ts and control.ts import type only from ./ids.js and ../math.js)"
    requirement: FOUND-13
    verification:
      - kind: unit
        ref: "tests/guards/ai-zone.test.ts#the real AI modules lint clean"
        status: pass
      - kind: unit
        ref: "tests/guards/ai-zone.test.ts#allowed AI seam modules do not re-export internals"
        status: pass
    human_judgment: false

duration: 70min
completed: 2026-11-13
status: complete
---

# Phase 8 Plan 09: AI Seam, Test Pilot and AI Lint Zone Summary

**A frozen-registry scripted test pilot that acts only through WorldView and ShipControl with plain-data state and integer-tick timers, plus an ESLint zone that confines every file under `src/sim/ai/**` to a case-sensitive per-depth import allow-list, bans the closure-held `createSeededRandom` stream and module-level mutable state, and keeps the sim determinism bans, all proven by 106 failing and passing probes.**

## Performance

- **Duration:** about 70 min
- **Tasks:** 3 (Task 1 tracer, Task 2 TDD, Task 3 auto)
- **Files:** 6 created, 2 modified (about 15000 tokens at chars/4 over the realised diff)

## Accomplishments

- Task 1 (tracer): `types.ts` gained the 21 event names, `AiEvent`, `AiContext` and `AiModule`; `time.ts` holds the one seconds-to-ticks conversion (think interval 15 ticks, Oolite `AI_THINK_INTERVAL` 0.125 s); `registry.ts` freezes `AI_REGISTRY` and the module it holds; the test pilot seeks the nearest scan hit, flies to it, holds inside `holdRange`, returns to seek on target loss and re-arms a 0.1 to 1.6 s wake each think. A tracer test drives one think through the real `createWorldView` and `createShipControl`. The tracer verify (pilot test, typecheck, lint) passed before expansion (`Tracer verified end-to-end -- expanding`).
- Task 2: 20 tests (16 pilot, 4 time). Expected values come from the pilot rules and Oolite constants. `src/sim/ai` reaches 100 percent statements, branches, functions and lines, so no src/sim floor moved.
- Task 3: three config blocks for `src/sim/ai/*.ts`, `src/sim/ai/pilots/*.ts` plus `src/sim/ai/*/*.ts`, and `src/sim/ai/*/*/**/*.ts`; `AI_ZONE_IMPORT_REGEX_DEPTH1` and `AI_ZONE_IMPORT_REGEX_DEPTH2` (negative-lookahead regexes, `caseSensitive: true`), `AI_ZONE_CLOSURE_RNG_MESSAGE` with `paths`/`importNames` bans at depths 1 and 2, `AI_MODULE_STATE_BANS` and an `ImportExpression` ban in every block. The guard test has 106 cases.
- Non-vacuity spot check: removing `...AI_MODULE_STATE_BANS` and flipping `caseSensitive` to false made 20 guard tests fail; the config was restored byte for byte.
- No file under `src` outside `src/sim/ai` names `TEST_PILOT` or `createTestPilotAi` (rg exits 1). No `src/app` file was touched. No CHANGELOG entry (internal).

## Task Commits

1. **Task 1: AI types, time base, registry and pilot (tracer)** - `87fc9463cc34928901c0b6358aa93db8006ad1a1` (feat), tree `03363e432a9d45c4c9e0c17cbe2252e4789f6cde`
2. **Task 2: the pilot's contract and the time base** - `3f9d5bd229b32fc6363f23b024cd7d9932945da9` (test), tree `ea61b4528f9c78cfb41d34c4f17a7fa2a3b3cec5`
3. **Task 3: the AI lint zone and its guard proofs** - `b040c392adc18ad091775abca8773ce0a067d5d1` (feat), tree `856dc33abb4fa35d1ea7a49ed0da12b48bbb568d`

**Plan metadata:** the docs commit that carries this SUMMARY, STATE.md and ROADMAP.md.

## Files Created/Modified

- `src/sim/ai/types.ts` - added the event names, `AiEvent`, `AiContext`, `AiModule`; a header comment records that `world/entity.ts` imports `AiComponent` from here
- `src/sim/ai/time.ts` - `TICKS_PER_SECOND`, `THINK_INTERVAL_TICKS`, `ticks()`; comment on the 414-day uint32 tick span
- `src/sim/ai/registry.ts` - `AI_REGISTRY`, frozen
- `src/sim/ai/pilots/test-pilot.ts` - `createTestPilotAi`, `TEST_PILOT = Object.freeze({ think })`
- `eslint.config.js` - the AI zone constants and three blocks
- `tests/sim/ai/test-pilot.test.ts`, `tests/sim/ai/time.test.ts`, `tests/guards/ai-zone.test.ts`

## Decisions Made

- On target loss in phase "hold" the pilot clears `params.targetId`, calls `setTarget(self, NO_ENTITY)` and returns to "seek" without acting further in that think; the next think seeks again. The plan said only that it returns to seek.
- The pilot draws exactly one random number per think, always for the wake delay, so its stream consumption is independent of its phase.
- Each AI block lists its `no-restricted-syntax` entries inline rather than through a shared constant, matching the plan's per-block acceptance counts (`...SIM_SYNTAX_BANS` 4, `ImportExpression` 3, `...AI_MODULE_STATE_BANS` 3).
- The seek phase targets the first scan hit, which may be the player or a static body, because `WorldView.scan` treats them as ordinary candidates (08-07 decision). The pilot is a test fixture, not Oolite behaviour.

## Gate evidence and attribution

All gates ran in the main tree; no detached worktree was used. Before each recorded gate `git status --porcelain --untracked-files=all` listed only this plan's files plus the untracked review-diagnostics directories under `.planning/`. The `docker ps` filter for the wegolite compose project printed 1 (the long-running `wegolite-preview-1` production preview, which only serves an existing `dist/` and writes nothing during a unit run), so the isolation condition is met in substance rather than literally, as in plans 08-02, 08-05 and 08-07. The other running containers belong to unrelated projects.

| Gate | Result | Commit / tree it ran on |
|------|--------|-------------------------|
| pilot test, `typecheck`, `lint` (Task 1 verify) | 1 test passed; both exit 0 | content of 87fc946 (run before the commit, after one Prettier rewrite and one test-type fix), main tree |
| `docker compose run --rm test` (full unit run with src/sim coverage floors) | exit 0, 123 files, 1799 passed, 2 skipped; src/sim/ai 100 percent on all four columns | content of 3f9d5bd, tree `ea61b4528f9c78cfb41d34c4f17a7fa2a3b3cec5` |
| `lint` and `typecheck` (Task 2) | both exit 0 | same content |
| `ai-zone.test.ts` and `sim-determinism-bans.test.ts` | 2 files, 159 passed | content of b040c39 |
| `lint`, `typecheck`, `docker compose run --rm test` (Task 3) | exit 0, 0, 0; 124 files, 1905 passed, 2 skipped | b040c39, tree `856dc33abb4fa35d1ea7a49ed0da12b48bbb568d` (the committed content; no edit after the run) |

The flaky `tools/oolite-ingest/convert/textures.test.ts` timeout did not occur. `verify` and `verify-full` were not run: the plan is pure src/sim logic, lint config and tests, and the gate policy for this plan excluded them. `git status --porcelain -- src/sim` listed no probe file after the guard runs.

## Acceptance criteria re-run

- Task 1: test-pilot.ts imports only `../../math.js`, `../../world/ids.js`, `../time.js`, `../types.js`; `THINK_INTERVAL_TICKS = 15` appears once in time.ts; `rg -l "TEST_PILOT|createTestPilotAi" src --glob '!src/sim/ai/**'` prints nothing (exit 1); `world/entity` appears once in types.ts. PASS.
- Task 2: `JSON.parse(JSON.stringify` 2, `isSafeInteger` 4, `per-world target` 1 in the test and `own world` 1 in the pilot. PASS.
- Task 3: `src/sim/ai/*.ts|src/sim/ai/pilots/*.ts` 6, `ImportExpression` 3, `...SIM_SYNTAX_BANS` 4, `importNames: ["createSeededRandom"]` 2, `const AI_MODULE_STATE_BANS =` 1, `...AI_MODULE_STATE_BANS` 3, `Program > ` 4, `const AI_ZONE_IMPORT_REGEX_DEPTH[12] =` 2, `caseSensitive: true` 3; guard test has `createSeededRandom` 7, `module-level mutable state` 3 and `calculateConfigForFile` 1. PASS.

## Deviations from Plan

None - plan executed exactly as written. Two incidental fixes inside the plan's own files: a typecheck error under `exactOptionalPropertyTypes` in the Task 1 test helper (parameter typed `AiComponent | null` instead of `SpawnInit["ai"]`), and the guard helper giving each probe a unique basename after the shared project service rejected a recreated path.

## Issues Encountered

- The first guard run failed 15 cases with "was not found by the project service" because every probe reused one basename; fixed in the helper with a per-call counter (a pattern recorded above).
- Prettier rewrote the new source and test files once through the lint container before the first commit of each.

## Known Stubs

None. Broken-windows ledger: nothing to record.

## Threat Flags

None. T-08-16, T-08-17, T-08-43 and T-08-52 are mitigated and proven as planned; the residual module-state forms lint cannot see are documented in `eslint.config.js` with the pilot's JSON round trip and plan 08-13's 1,000-tick equality as the behavioural backstop.

## Next Phase Readiness

Plan 08-11 (sanitize and step) can call `AI_REGISTRY[aiKey].think` through `AiContext` and clear `wakeTick` on the wake tick. Later AI ports (Phases 14 to 22) go under `src/sim/ai/` at depth 1 or 2, import only the seam, and each adds its own JSON round-trip test. A depth >= 3 AI module needs an explicit depth regex first. `FOUND-13` is not marked complete here: the requirement spans plans 08-11 to 08-13 as well.

## Self-Check: PASSED

- Files present: src/sim/ai/time.ts, registry.ts, pilots/test-pilot.ts, types.ts, tests/sim/ai/test-pilot.test.ts, time.test.ts, tests/guards/ai-zone.test.ts, eslint.config.js.
- Commits present on HEAD: 87fc946, 3f9d5bd, b040c39.
