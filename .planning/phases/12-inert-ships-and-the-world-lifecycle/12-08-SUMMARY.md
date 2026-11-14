---
phase: 12-inert-ships-and-the-world-lifecycle
plan: 08
subsystem: app
tags: [session, populator, npc-catalogue, traffic-flag, d-01, step-options]
requires:
  - phase: 12-inert-ships-and-the-world-lifecycle
    provides: "plan 12-03 traffic build-time default; plan 12-05 StepOptionsInput.shipMasses; plan 12-07 populateInertWorld, InertShipRecord"
provides:
  - "src/app/session/traffic.ts: TrafficContent, trafficContent(catalogue), createInertPopulate(content, layout): the one populate and mass source for the session and the Node replay"
  - "ctx.core.npcTraffic: the NPC content loaded once at start-up, only with traffic on"
  - "start-up loads the NPC catalogue in the boot Promise.all behind the traffic flag; createWorldLifecycle receives the inert populate; every step carries hyperspace.shipMasses"
  - "a real session with traffic on holds 12 inert ships after a launch and after an arrival (leg anchor 113); traffic off places and draws nothing (anchor 101)"
affects: [12-09, 12-10, 12-11, 12-12, 12-14]
status: complete
actuals:
  tokens: 9700
  tasks: 3
  commits: 4
plan_head_before: 550d3723dae1a40661f28ab7ce54bf94fe25b7bc
plan_head_after: 2d650fe32685fe95f9b7eb538a12a1115d5034d6
tech-stack:
  added: []
  patterns:
    - "a populate closure reads its content and layout through getters at call time, so the lifecycle exists before the boot load finishes and begin/resume never await"
    - "an optional step-option key is added by a conditional spread, never as an explicit undefined (exactOptionalPropertyTypes)"
    - "a content-shaped string (scanClass) crosses src/app unchanged; the sim narrows it"
key-files:
  created:
    - src/app/session/traffic.ts
    - tests/app/session/traffic.test.ts
  modified:
    - src/app/session/context.ts
    - src/app/session/start-session.ts
    - src/app/session/sim-driver.ts
    - src/app/session/world-lifecycle.ts
    - src/app/session/hyperspace-controller.ts
    - src/content/ships-npc.ts
    - tests/app/session/world-lifecycle.test.ts
    - tests/app/session/sim-driver.test.ts
    - tests/content/ships-npc.test.ts
    - tests/e2e/tick-hook.spec.ts
    - .planning/PROJECT.md
    - CHANGELOG.md
key-decisions:
  - "NPC traffic content loads at start-up only with traffic on: the catalogue joins the boot Promise.all (one failure surface), the populate closure reads it and the layout at call time, the session and the Node replay share traffic.ts, and the boot-path isolation test admits start-session.ts as the loader's only importer."
requirements-completed: []
---

# Phase 12 Plan 08: Wire the inert populator into the session Summary

With traffic on, the `launched` event and a hyperspace arrival now create a world holding the 12 inert ships of plan 12-07, built from a catalogue that start-up loads once behind the traffic flag; every fixed step carries the compiled NPC masses. With traffic off nothing is loaded, placed or drawn. WORLD-15 is delivered in part (placement in a real session) and is not marked complete: the scanner, the render and the lifecycle proofs follow in plans 12-09 to 12-12.

## Accomplishments

- **Tracer (Task 1).** `traffic.ts` holds `TrafficContent`, `trafficContent` (frozen arrays in catalogue order; `scanClass` copied as the catalogue's plain string, no assertion) and `createInertPopulate` (does nothing unless traffic is on and both getters return a value, then `populateInertWorld`). `start-session.ts` loads the catalogue as the fourth entry of the boot `Promise.all` only behind `ctx.runtime.testFlags.traffic`, stores `ctx.core.npcTraffic`, and passes `populate: createInertPopulate(() => ctx.core.npcTraffic, () => ctx.core.layout)` to `createWorldLifecycle` with `traffic:` still the first property. `sim-driver.ts` adds `shipMasses` to `buildStepOptions` by a conditional spread. The tracer rows run the real router: after the launch step the lifecycle world holds 12 entities, `store.nextId` and `anchorNextEntityId` are 113; the same script with traffic off gives 0 entities, anchor 101, the untouched world stream and a world hash equal to the flight hash. Plan 12-07's code is untouched.
- **Boot-path isolation.** `tests/content/ships-npc.test.ts` now expects the loader plus `start-session.ts` (compared order-independently, because the directory walk order is filesystem-dependent). The loader's module comment names `start-session.ts` as the one importer, says the chunk is fetched only with traffic on, and says NPC models and textures stay outside the first-load set until the first in-flight frame has been presented (plan 12-11). No model prefetch was added anywhere.
- **Comments (Task 2).** `world-lifecycle.ts` rule (ii) names the total inert populator and rule (iii) records D-01 as decided (no ids burned with traffic off; counter 113 on, 101 off; an NPC-free world keeps the flight hash). The arrival comment in `hyperspace-controller.ts` says the inert populator is total.
- **Records (Task 3).** The Key Decisions row "NPC traffic content loads at start-up only with traffic on" (Phase 12 plan 12-08) and a CHANGELOG `### Added` entry for the inert ships under `## [Unreleased]`.

## Changed existing browser assertions

| File | Line | Old | New | Why it expired | Sanction |
| --- | --- | --- | --- | --- | --- |
| tests/e2e/tick-hook.spec.ts | 164 (test "traffic is off under ?test=1 and on only for a spec that opts in", now line 165) | `expect(flying.entities).toBe(0);` under the comment "No populator exists yet, so the opt-in changes only the flag." | `expect(flying.entities).toBe(12);` under "The opt-in populates the first populator's 12 inert ships (plan 12-07; sanctioned by WORLD-16)." | A populator now exists, so `?test=1&clock=manual&traffic=1` holds the 12 inert ships after a launch | REQUIREMENTS.md WORLD-16 (owner, 2026-11-14, commit 8d3639f). The WORLD-16 line was not edited: `git diff --name-only -G 'WORLD-16' 550d372 -- .planning/REQUIREMENTS.md` prints nothing. |

The parity test above it boots without `traffic=1` and still asserts 0 entities. The other two `entities).toBe(0)` rows in the file are unchanged (count 2, as the plan expects).

## Task Commits

| Task | Name | Commit |
| --- | --- | --- |
| 1 | populate the inert world at launch and arrival from the start-up catalogue (tracer) | 22b339f |
| 2 | expect the populated 12 entities under traffic=1 and name the inert populator in comments | 6e6c90e |
| 3 | record the start-up catalogue load and the inert ships in the changelog | 85e5801 |
| fix | hold the late content in an object so lint's prefer-const passes | 2d650fe |

Tracer gate: the automated-only `<verify>` (targeted Vitest and typecheck) was run after the commit's content was final and passed, so expansion proceeded with no checkpoint.

## Gates run (all in Docker, local; the remote wrapper was not usable)

| Gate | Result |
| --- | --- |
| Targeted Vitest traffic, world-lifecycle, ships-npc, sim-driver, entity-id-scope (Task 1) | 5 files, 121 passed |
| `docker compose run --rm typecheck` (Task 1) | exit 0, no output |
| `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/tick-hook.spec.ts"` (Task 2) | 5 passed, including the opt-in case at 12 entities |
| `docker compose run --rm test` (full, coverage), before the lint fix | exit 0, 148 files passed, no coverage error |
| `docker compose run --rm lint` | first run exit 1: `prefer-const` on `let current` in tests/app/session/traffic.test.ts (my test code); fixed in 2d650fe; second run exit 0 (ESLint and Prettier) |
| `docker compose run --rm verify` (after the fix, on HEAD 2d650fe) | exit 0: lint, typecheck, drift, Vitest 148 files, 2,925 passed, 2 skipped, build, e2e smoke subset 27 passed |

Acceptance greps (Task 1 and 2): `createInertPopulate(` 1 and `loadNpcCatalogue()` 1 in start-session.ts; `npcTraffic` 2 in context.ts; `shipMasses` 1 in sim-driver.ts; `src/app/session/traffic.ts` in the import guard 1; no `EntityId` or `world/ids` in traffic.ts; no type assertion outside comments; stale header sentence gone and `start-session` named in ships-npc.ts; `D-01` 3 in world-lifecycle.ts; `adds nothing` absent from hyperspace-controller.ts; `flying.entities).toBe(12)` 1. Task 3: the Key Decisions row 1 and the changelog entry 1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ESLint `prefer-const` in the new test**
- **Found during:** Task 3 gate (`docker compose run --rm lint`)
- **Issue:** `tests/app/session/traffic.test.ts` declared `let current` and assigned it once later.
- **Fix:** the late content is held in a `const held = { current }` object.
- **Files modified:** tests/app/session/traffic.test.ts
- **Commit:** 2d650fe

### Departures worth a reviewer's eye (no rule triggered)

- **Remote gate not used.** `remote-run.sh run --rm e2e ...` failed at its sync step (`rm: cannot remove '/home/opencode/wegolite-remote/dist/...': Permission denied`, `sync failed`, exit 70): the remote work directory holds root-owned build output the SSH user cannot delete. I did not clean it up on the remote. Every gate ran locally, which is authoritative, so there is no disagreement to report. The wrapper needs a one-off cleanup of that directory before it works again.
- **Test-first order.** The traffic test file was written first, but `traffic.ts` followed before any red run, so no red run was recorded; the tests ran green with the code. Each task is one commit (tests and code together).
- **An extra sim-driver row.** `tests/app/session/sim-driver.test.ts` (not in the plan's file list) gained one row and a second hook on its existing `stepFlight` mock, which is how "the next step receives `shipMasses` in its options" is observed without a second mock of `stepSim`. The row also checks the key is absent without traffic content.
- **PROJECT.md D-01 row.** The dispatch note said this plan amends the D-01 row; the plan text assigns the amendment of the row that says "D-05 as proven in Phase 8" to plan 12-09, and files_modified here only adds the new Key Decisions row. I followed the plan and left that row alone.
- **Commits.** The plan's brief says "do not commit"; the dispatch required per-task commits, so the tasks were committed. Nothing was pushed or tagged.
- **Size.** Actual diff is about 9.7k tokens (chars/4 over `git diff 550d372 HEAD`), well under the 65k estimate: the work was wiring over parts that already existed.

## Known Stubs

None.

## Threat Flags

None. T-12-20 (the populate closure never awaits, the populator is total, the catalogue loads in the boot `Promise.all` before any `begin`), T-12-21 (the existing strict zod schema; a failed load goes through `showBootFailure`) and T-12-23 (traffic.ts holds records and masses only; the entity-id-scope guard passes) are mitigated as the plan states; no new endpoint or trust boundary.

## Next

Ready for 12-09 (prove WORLD-14, SAVE-08 and the traffic-on variants of WORLD-16 in Vitest over this wiring, and amend the "D-05 as proven in Phase 8" row).

## Self-Check: PASSED

- FOUND: src/app/session/traffic.ts, tests/app/session/traffic.test.ts
- FOUND commits 22b339f, 6e6c90e, 85e5801 and 2d650fe on HEAD
