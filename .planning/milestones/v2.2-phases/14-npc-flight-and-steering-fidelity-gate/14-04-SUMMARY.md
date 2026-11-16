---
phase: 14-npc-flight-and-steering-fidelity-gate
plan: 04
subsystem: tools
tags: [ai-harness, spike, node-vm, oolite-priorityai, differential-oracle, isolation-guard]
status: complete

requires:
  - phase: 14-npc-flight-and-steering-fidelity-gate
    provides: the RESEARCH and PATTERNS the spike scope (one role AI, three fixtures) came from
provides:
  - tools/ai-harness: the original oolite-priorityai.js and oolite-shuttleAI.js run unmodified in node:vm against a stub host, with ordered deterministic traces over three fixtures
  - AI_HARNESS_SENTINEL and tests/guards/harness-isolation.test.ts, the one-way dependency guard (src, public, index.html, every root vite*.config.ts)
  - 14-SPIKE.md, the transcript, host inventory, stub size, timeout coverage, wake mechanism, feasibility statement and the mount-or-vendor question for the owner
affects: [14-07, 14-19]

requirements-completed: []
requirements-advanced: [AI-11]

plan_head_before: f79955d9adff5f4d1e638b285fef4b5a4407ec05
plan_head_after: 8c1c99e0e6af8e7d9ba832c384da8c8233809afc

actuals:
  tokens: 15400
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "One node:vm context per Oolite script; every entry (load, aiStarted, aiAwoken, probes) through runInContext with a positive integer timeout, entries recorded per context"
    - "The engine's reconsider protocol modelled, not Timer: the AI writes ship.AIScriptWakeTime, the host clears it and calls aiAwoken when the adjusted clock is strictly past it, on a fixed power-of-two frame"
    - "A recording Proxy ship: every call and write is a trace entry, every unanswered read is an inventory 'missing' member"
    - "A scripted, counted Math.random installed in each context by a fixed one-line installer; the draw index is part of the trace"

key-files:
  created:
    - tools/ai-harness/load.ts
    - tools/ai-harness/host.ts
    - tools/ai-harness/spike.test.ts
    - tests/guards/harness-isolation.test.ts
    - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-SPIKE.md
  modified: []

key-decisions:
  - "The harness wakes the AI on the engine's strict comparison (clock > AIScriptWakeTime, ShipEntity.m:2480) on a 1/16 s frame, not on 'reaches' as the plan text worded it; the port's comparison must be on the written wake time, not the frame it landed on"
  - "Spike outcome is positive; the recommendation to the owner at the plan 14-19 gate is to keep the OOLITE_SRC mount (8 of 11 cases skip on the remote machine and in CI) and vendor the scripts only if the differential harness itself must run in CI"

patterns-established:
  - "Dev-only tooling that evaluates third-party JavaScript lives under tools/, is skipIf-gated on an operator-supplied path, and is fenced out of the shipped tree by a scanner guard with a non-vacuity case"

coverage:
  - id: D1
    description: "The pinned oolite-priorityai.js and oolite-shuttleAI.js load unmodified into separate node:vm contexts (library registered as worldScripts['oolite-libPriorityAI'], role AI attached as ship.AIScript), construct the PriorityAIController through aiStarted, and record an ordered trace; calm, hostile and reconsider-timing fixtures each produce a trace and two runs are identical with the same draws"
    verification:
      - kind: unit
        ref: "tools/ai-harness/spike.test.ts (11 cases, 8 need OOLITE_SRC; run with the pinned tree mounted)"
        status: pass
      - kind: command
        ref: "docker compose run --rm -v /tmp/oolite-7437f22:/oolite:ro -e OOLITE_SRC=/oolite test npx vitest run tools/ai-harness tests/guards/harness-isolation.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "The stub host wakes the AI the way the engine does (AIScriptWakeTime then aiAwoken), every entry into Oolite code runs through runInContext with a timeout, and a runaway loop in either context is terminated"
    verification:
      - kind: unit
        ref: "tools/ai-harness/spike.test.ts#reconsider: wakes only through AIScriptWakeTime and aiAwoken"
        status: pass
      - kind: unit
        ref: "tools/ai-harness/spike.test.ts#terminates a runaway entry with the vm timeout"
        status: pass
      - kind: unit
        ref: "tools/ai-harness/spike.test.ts#every entry into Oolite code ran through runInContext with a timeout"
        status: pass
    human_judgment: false
  - id: D3
    description: "No file under src/ or public/, index.html or any root vite*.config.ts (the three known configs asserted found) imports tools/ai-harness or contains the sentinel; the scanner refuses synthetic violations of each import form and the sentinel in text and binary"
    verification:
      - kind: unit
        ref: "tests/guards/harness-isolation.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "14-SPIKE.md records the box and time used, the pinned input and mount, the transcript of the three fixtures, host members touched and missing, stub size, timeout coverage and gaps, the wake mechanism, how startUp behaved, the perform-call to native-behaviour mapping, and a feasibility statement with risks and the owner's mount-or-vendor question"
    verification:
      - kind: command
        ref: "test -s 14-SPIKE.md && rg -c 'Feasibility|OOLITE_SRC|7437f22' 14-SPIKE.md (prints 10)"
        status: pass
    human_judgment: true
    rationale: "Whether the feasibility statement and its estimate are a fair reading of one role AI's worth of evidence is a judgment the owner makes at the Phase 14 gate."
  - id: D5
    description: "The spike never feeds node:vm anything but the two named pinned files and fixed expressions; no Oolite JavaScript or harness module enters src/, public/ or the bundle"
    verification: []
    human_judgment: true
    rationale: "A process and licensing prohibition: the guard proves the harness is not imported or sentinel-marked in the shipped tree, and the loader joins only two constant names, but whether Oolite JS could reach the bundle by another route is proven only by the post-build dist check of plan 14-07."

duration: 14min
completed: 2026-11-15
---

# Phase 14 Plan 04: AI-11 spike, the original shuttle AI in Node against a stub host Summary

**The unmodified `oolite-priorityai.js` and `oolite-shuttleAI.js` run in two `node:vm` contexts against a recording stub host, wake on the engine's real `AIScriptWakeTime` / `aiAwoken` protocol, and give deterministic traces over a calm, a hostile and a reconsider-timing fixture, with the harness fenced out of `src/` and `public/` by a guard.**

## Performance

- **Duration:** about 14 minutes of wall clock (2026-11-15 18:28Z to about 18:42Z)
- **Tasks:** 3 of 3
- **Files:** 5 created, 0 modified

## Accomplishments

- **Loader and stub host (tracer).** One `vm` context per script; the library's global is `worldScripts["oolite-libPriorityAI"]`, the role AI's global is the recording ship's `AIScript`; `Math.random` replaced per context by one counted scripted draw. The very first run produced a trace with no stub changes beyond the planned ones; the only unanswered read of the whole spike was `hostile.isWormhole`, added after the first hostile run.
- **Engine-faithful reconsider.** `advanceClock` clears `ship.AIScriptWakeTime` and calls `this.aiAwoken()` through `callInContext` once the adjusted clock is strictly past it (`ShipEntity.m:2480-2483`), on a 1/16 s frame. The trace holds no `Timer` schedule from the priority AI. The never-later rule is exercised: `reconsiderIn(500)` writes nothing, `reconsiderIn(0.5)` pulls the pending 20 s wake in.
- **Three fixtures, deterministic.** Calm: 9 entries, 3 draws (constructor draw, first-delay draw, destination draw; flies towards a stale destination at the first wake because the configuration only selects). Hostile: 7 entries, 2 draws (`performFlee`, `desiredRange` = scanner range). Reconsider: 50 entries, 3 draws, six wakes across the 1 s, 30 s and 20 s entries. Two runs of each give identical traces, wake times, draw counts and inventories.
- **Timeout coverage.** Every entry (loads, installer, `startUp`, `aiStarted`, each wake, the probes) runs through `runInContext` with `timeout: 2000`, recorded per context; a runaway `for (;;) {}` in either context throws the vm timeout error. No uncovered gap today; the latent one (host-held `Timer` callbacks, not reached) is named in 14-SPIKE.md.
- **Isolation guard.** `tests/guards/harness-isolation.test.ts` refuses imports resolving into `tools/ai-harness` and the sentinel (text or binary) in `src/`, `public/`, `index.html` and every root `vite*.config.ts`, asserts the three known configs including `vite.seams.config.ts` are walked, and proves the scanner refuses each synthetic violation.
- **14-SPIKE.md** with the transcript, inventory (40 read members, 4 calls, 4 writes), stub size (host.ts 533 non-blank lines, load.ts 116), mapping of `perform*` calls onto `FLY_RANGE_FROM_DESTINATION`, `FLEE_TARGET`, `ATTACK_TARGET`, `IDLE`, a feasibility statement for AI-07 and the mount-or-vendor question for the gate.

## Task Commits

1. **Task 1 (tracer): load the library and shuttle AI in vm, record traces** - `4a40f0f` (feat). The commit holds the loader, the host and the whole spike test file, including the hostile and reconsider fixtures, because the work and its verification were one unit.
2. **Task 2: isolation guard** - `f050a5f` (test). The fixtures, determinism, RNG count and inventory of Task 2's first paragraph were already in `4a40f0f` (see Deviations); this commit is the guard.
3. **Task 3: 14-SPIKE.md** - `8c1c99e` (docs)

Tracer feedback gate: auto mode is on, so the tracer's `<verify>` (mounted and unmounted vitest runs) was re-run end-to-end after the commit and again at Task 2; both passed, and the plan expanded.

## Verification

- `docker compose run --rm -v /tmp/oolite-7437f22:/oolite:ro -e OOLITE_SRC=/oolite test npx vitest run tools/ai-harness tests/guards/harness-isolation.test.ts`: 2 files, 18 tests passed, none skipped.
- `docker compose run --rm test npx vitest run tools/ai-harness` (no checkout): 11 tests, 3 passed, 8 skipped, exit 0.
- `docker compose run --rm lint` (eslint plus prettier): clean. `docker compose run --rm typecheck`: clean.
- `rg -c AI_HARNESS_SENTINEL tools/ai-harness/host.ts` prints 2 (acceptance asks for at least 1). `test -f tools/ai-harness/load.ts && test -f tools/ai-harness/host.ts` succeeds. 14-SPIKE.md `rg -c` count is 10 (asked for at least 3).
- Full `docker compose run --rm test` (coverage run, exit 0): 175 files passed, 3824 tests passed, 10 skipped (the 8 OOLITE_SRC cases of this spike and 2 others), coverage floors held.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Fidelity] Wake on the engine's strict `>` rather than "reaches"**
- **Found during:** Task 1, reading `ShipEntity.m` for the wake rule
- **Issue:** The plan says the harness wakes the AI when the clock "reaches" a non-zero `AIScriptWakeTime`. The engine (`ShipEntity.m:2480`) tests `clockTimeAdjusted > aiScriptWakeTime` in the per-frame `update`, so a clock landing exactly on the wake time does not wake it until the next frame.
- **Fix:** `advanceClock` steps a fixed 1/16 s frame and wakes on strict `>`, recording `at` and `wakeTime` in a `wake` entry; the reconsider case asserts the wake is never earlier than and never more than one frame later than the written time.
- **Files modified:** `tools/ai-harness/host.ts`, `tools/ai-harness/spike.test.ts`
- **Commit:** `4a40f0f`

**2. [Rule 3 - Sequencing] Fixtures landed in the tracer commit**
- **Found during:** Task 1
- **Issue:** The three fixtures, determinism, RNG-count and inventory cases fit in one test file and cost nothing extra once the loader ran, so Task 1's commit contains them; Task 2's commit therefore holds only the isolation guard.
- **Fix:** none needed; recorded for the audit trail.
- **Commit:** `4a40f0f`, `f050a5f`

**3. [Rule 3 - Fixture geometry] Station placed at (15000, 0, 45000)**
- **Found during:** Task 1, reconsider fixture
- **Issue:** `conditionHostileStationNearby` needs the nearest station within 51200 m for the 20 s entry to be reachable; a first guess at (20000, 0, 50000) is 53852 m away.
- **Fix:** station at 47434 m; it stays a candidate destination (farther than `mainPlanet.radius * 5`).
- **Files modified:** `tools/ai-harness/host.ts`
- **Commit:** `4a40f0f`

**4. [Rule 1 - Stub gap] `hostile.isWormhole`**
- **Found during:** Task 1, first hostile run
- **Issue:** `conditionInCombat` reads `this.ship.target.isWormhole`; the stub returned undefined and recorded it as a missing member.
- **Fix:** answered `false`; the final inventory has no missing members.
- **Commit:** `4a40f0f`

**Total deviations:** 4 (2 stub/fixture corrections, 1 engine-fidelity wording, 1 task sequencing). **Impact:** none on scope; the strict-`>` wake is the faithful reading and is recorded in 14-SPIKE.md for the later harness.

## Issues Encountered

None blocking. The Context7 lookup for the Node 24 `vm` API confirmed `timeout` (strictly positive integer), `microtaskMode: "afterEvaluate"` (not used: no promises in the shuttle AI) and that `createContext` contextifies the sandbox object so its accessors serve as global reads.

## Known Stubs

None in the shipped tree. The stub host itself is the deliverable; its absent members (`expandDescription`, `system.wormholes`, `Vector3D.random`, the docking API and others) are listed in 14-SPIKE.md as known-absent and unreached. No entry was added to `.planning/WINDOWS.md` (nothing in `src/` or `public/` was touched).

## Threat Flags

None. The surface added (a vm over two pinned files, read from an operator mount) is the one T-14-07, T-14-08 and T-14-09 cover.

## Next Phase Readiness

- Plan 14-07 can search the built `dist` for `AI_HARNESS_SENTINEL` (exported from `tools/ai-harness/host.ts`; value `wegolite-ai-harness-sentinel-3d8f61a2`).
- Plan 14-19's owner checkpoint has the mount-or-vendor question and the spike outcome ready in 14-SPIKE.md. AI-11 is **advanced, not completed**: the `dist` absence check (14-07), the fidelity report and the owner's oracle choice remain.

## Self-Check: PASSED

- Created files exist: `tools/ai-harness/load.ts`, `tools/ai-harness/host.ts`, `tools/ai-harness/spike.test.ts`, `tests/guards/harness-isolation.test.ts`, `14-SPIKE.md`.
- Commits exist on this branch: `4a40f0f`, `f050a5f`, `8c1c99e`; measured `commits: 3` from `plan_head_before` to `plan_head_after`.
- Task acceptance criteria re-run: pass (see Verification).
