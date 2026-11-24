---
phase: 20-player-death-and-game-over
plan: 09
subsystem: testing
tags: [playwright, e2e, death-twin, game-over, save-guard, untainted-session]

requires:
  - phase: 20-player-death-and-game-over
    provides: "20-01 killPlayer and the measured 350 m/s ram; 20-06 the advanceTicks refusal and frame-loop branch; 20-07 the game-over overlay wiring; 20-08 probe.death and the dead view"
provides:
  - "tests/app/session/death-twin.test.ts: the Node twin of the browser death (DEATH_TICK_OFFSET 1682, cause scrape by the nav buoy), on the real restore path"
  - "tests/e2e/death-and-reload.spec.ts: death at the twin's tick, fresh Space, Continue with the damaged item, dead-page DOM snapshot; the no-save variant exits by a click"
  - "tests/e2e/game-over-guard.spec.ts: the untainted real-time guard whose write count and blob checks can fail"
  - "inFlightSaveAt options (equipment, damagedEquipment), DEATH_RAM_POSE, DEATH_TARGET, DEATH_SEED_ITEMS, deleteRaw"
affects: [20-10]

actuals:
  tokens: 13200
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "a browser death route is confirmed by a Node twin that restores the same blob through parseSave and restoreFromSave before any spec is written"
    - "an untainted real-time guard spec: no hook member call (only the read-only tainted flag), probe-only waits, write count plus byte-equal blob"

key-files:
  created:
    - tests/app/session/death-twin.test.ts
    - tests/e2e/death-and-reload.spec.ts
    - tests/e2e/game-over-guard.spec.ts
  modified:
    - tests/e2e/helpers/save-fixtures.ts
    - tests/e2e/helpers/save-store.ts
    - .planning/todos/pending/2026-11-16-ci-e2e-timeout-margins.md

key-decisions:
  - "One death route, no fallback: the 350 m/s nose-on ram into the Lave nav buoy from 5,000 m out, lethal on the restore path (twin first, specs after)"
  - "The browser specs repeat the twin's literals (TWIN_DEATH_TICK_OFFSET 1682, TWIN_DEATH_CAUSE) and the real-time guard spec asserts the same tick, so manual-clock and real-time frame loops agree"
  - "The pre-death checkpoint of game-over-guard is one named snapshot (restore pose, untainted, in flight, tick below the twin's)"

patterns-established:
  - "Dead-page DOM snapshot: #game-over lines, computed visibility of #title and #status, and the #view computed filter, in one expect"

requirements-completed: [DEATH-01, DEATH-06]

duration: 45min
completed: 2026-11-23
status: complete
plan_head_before: 93be95fa68a575a65fee00ab5b9c63646781a3c6
plan_head_after: 9ce2658273dce0e603039221c5bce70e109628b6

coverage:
  - id: D1
    description: "The seeded 350 m/s nose-on ram into the Lave nav buoy kills the player restored from full shields and bank, at tick 1682 (14.02 s of sim time) with cause scrape by the buoy, through the real driver, router and restore path with traffic on"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/app/session/death-twin.test.ts#the ram kills the restored player at DEATH_TICK_OFFSET with DEATH_CAUSE, from full shields and bank"
        status: pass
      - kind: unit
        ref: "tests/app/session/death-twin.test.ts#the browser's call pattern lands on the same tick: chunks of advanceTicks stop at the death, and a further advanceTicks returns it"
        status: pass
    human_judgment: false
  - id: D2
    description: "In a real browser the seeded save dies at the twin's tick with the twin's cause, shows the game-over view in the real markup, and one fresh Space reloads to a title whose Continue resumes the save in flight with the damaged item and the stored blob byte-equal"
    requirement: DEATH-06
    verification:
      - kind: e2e
        ref: "tests/e2e/death-and-reload.spec.ts#a ram death at the twin's tick, one fresh Space, and Continue resumes the seeded save with its damaged item"
        status: pass
    human_judgment: false
  - id: D3
    description: "With the save removed before the exit, a click on the overlay reloads to a title that offers New game only"
    requirement: DEATH-06
    verification:
      - kind: e2e
        ref: "tests/e2e/death-and-reload.spec.ts#with the save removed before the exit, a click on the overlay reloads to a title that offers New game only"
        status: pass
    human_judgment: false
  - id: D4
    description: "In an untainted real-time session nothing after the death (held Space auto-repeat, H, F2, P, Escape, F5, F6, a held flight key, blur, a hidden tab) saves, pauses, opens the chart or F2 screen, starts a countdown, steps the sim or revives the player; the write count and the stored blob stay the seed's, also after the final reload"
    requirement: DEATH-06
    verification:
      - kind: e2e
        ref: "tests/e2e/game-over-guard.spec.ts#in an untainted session nothing after the death saves, pauses, reopens or revives the dead player"
        status: pass
    human_judgment: false
---

# Phase 20 Plan 09: Death twin and the two D-16 browser specs Summary

**The seeded 350 m/s ram into the Lave nav buoy kills a restored player at tick 1682 with cause scrape-by-buoy on the Node twin, and two Playwright specs prove the browser dies at that tick, reloads on Space or a click, offers Continue only with a save, and never saves, pauses or revives the dead player in an untainted real-time session.**

## Performance

- **Duration:** about 45 min (the full `test` run and the remote `verify` ran in the background at the end)
- **Tasks:** 2 (4 task commits)
- **Files changed:** 6 (3 created, 3 modified)

## Accomplishments

- The death route was measured before any spec existed: the Node twin restores `inFlightSaveAt("Lave", DEATH_RAM_POSE, "Diso", ...)` through `parseSave`, `restoreFromSave` and `restoreWorldAnchor` (the in-flight Continue path) with the traffic world and the real hull table, steps the manual clock with zero input, and the player dies. The route holds; the stop-and-report condition did not trigger.
- `death-and-reload` dies in a real browser at the twin's tick through the manual-clock hook, reads the dead page from the DOM in one snapshot, reloads on one fresh Space, Continues the same save in flight with the damaged item still damaged and the blob byte-equal; its second test removes the blob, exits by a click on `#game-over` and finds no Continue.
- `game-over-guard` flies the same seed in an untainted, hook-free, real-time session; the real-time loop dies at the same tick and cause as the manual clock, and every post-death key and event leaves the page, the tick, the write count and the blob untouched.

## Task Commits

1. **Task 1: fixtures and the Node twin** - `d0d57d0` (test)
2. **Task 1: death-and-reload spec, first test (tracer)** - `81307c2` (test)
3. **Task 2: no-save title test, `deleteRaw`, game-over-guard spec** - `11a4064` (test)
4. **Task 2: budgets as expressions, CI-margins status entry** - `9ce2658` (test)

**Plan metadata:** the commit that adds this SUMMARY (docs). Tests only, so no CHANGELOG entry (plan gate policy).

## The death route and the twin's measured rows

The seed: pose `[-43460.921469474, 53367.986762848275, -425704.12471183104]` (the layout's nav buoy at `[-43460.92, 53367.99, -430704.12]` plus 5,000 m on +Z), identity orientation (nose along -Z, at the buoy), speed 350, the committed target Diso, equipment `EQ_CARGO_BAY` installed and `EQ_DOCK_COMP` damaged, epoch 0.

| Row | Measured on the twin (restore path, traffic on) |
|-----|--------------------------------------------------|
| Restored tick | 0 |
| Contact and death tick | 1682 (`DEATH_TICK_OFFSET`), 14.02 s of sim time |
| Distance at the run-up | 5,000 m (asserted `>= 5000`); the player's centre is 94.17 m from the buoy's centre at the contact |
| Closing speed | 350 m/s |
| Forward shield / bank before | 128 / 256 (a combat state is not saved) |
| dam1 (the player's hit) | 1711.793 (past the shield 1583.793 against the 256 bank); same as 20-01's 350 m/s row at 400 m |
| dam2 (the buoy's hit) | 526.107 against its 250: the buoy is destroyed, credited to the player (one `shipDestroyed`) |
| Outcome | `playerDestroyed`, cause `{ damage: "scrape", culprit: "buoy" }`, mode `dead`, bank 0, aft shield 128, `gameOver` latched |
| NPC traffic | none crossed the path (12 inert ships); the culprit pin would show it |

20-01's 350 m/s row (contact tick 105 from 400 m, dam1 1711.793, dam2 526.107) is confirmed on the real restore path; the tick differs only because the run-up is 5 km.

## Browser evidence

| Run | Snapshot | exit / elapsed | Per-test remote time |
|-----|----------|----------------|----------------------|
| `death-and-reload` + `save-load` (Task 1) | `81307c2` | exit=0, 43 s | death-and-reload 6.4 s; the 9 `save-load` tests all pass, including "a damaged item stays damaged after Continue and after an in-session Load" (3.5 s, the D-14 docked half) |
| `death-and-reload` + `game-over-guard` + `probe-shape` (Task 2) | `11a4064` | exit=0, 32 s | no-save-title 5.1 s, death-and-reload 5.3 s, game-over-guard 20.7 s; the 7 `probe-shape` tests pass |
| remote `verify` at the plan boundary | `9ce2658` | exit=0, 204 s | 28 Chromium smoke tests passed (1.3 min), after lint, typecheck, content drift, unit tests and the build |

Both browser deaths landed on the twin's tick (1682) and cause with no edit to a literal. game-over-guard's real-time death is asserted at the same tick, so the manual-clock and real-time paths agree.

- **Pre-death checkpoint (game-over-guard):** one named snapshot after Continue and the held Space: `probe.restore` pose and speed equal the seed's, `probe.test.tainted` false, `probe.mode` `"inFlight"`, tick below 1682. It held on every run.
- **Dead-page DOM snapshot (death-and-reload):** `#game-over` shown with `Game Over`, `Collided with Navigation Buoy`, a `Score: ...₢` line and `Press Space`; `#title` and `#status` compute `visibility: hidden` (the `#hud[data-dead] ~ #overlay` rule matches the real markup); the computed `filter` of `#view` contains `saturate(`. The cause line names the buoy only because `traffic=1` loads the static names.
- **Untainted-session evidence (game-over-guard):** `probe.test.tainted` is `false` after Continue (baselines and checkpoint) and in the post-death snapshot before the final reload; `probe.save.writes` equals its post-Continue value; `readRaw` is byte-equal to the seed after the keys and again after the final fresh-Space reload; no member of the hook is called (the two gates below).
- **Gates on game-over-guard's non-comment lines:** `rg -P '\.test\??\.(?!tainted\b)'` prints nothing and `rg 'clock=manual'` prints nothing.

## Timeout budgets (the folded CI-margins todo)

| Test | Budget (expression in code) | Measured remote | 3 x measured | Share |
|------|------------------------------|-----------------|--------------|-------|
| death-and-reload, both tests | `4 * SLOW` = 120 s | 5.1 to 6.4 s | 19 s | 16 % |
| game-over-guard | `3 * SLOW + DEATH_WAIT_MS + 3 * SLOW`, `DEATH_WAIT_MS` = 1682 / 120 x 1000 x 10 = 140.2 s, about 320 s | 20.7 s | 62 s | 19 % |

Both are inside the 60 % rule. The todo `2026-11-16-ci-e2e-timeout-margins.md` gained `## Status (2026-11-23, Phase 20 plan 20-09)` and stays pending; game-over-guard's frame-bound real-time run is the first thing to re-measure after the next sharded CI run.

## D-16 assertion counts (plan boundary)

Counted over `git diff a5a03ce HEAD` with the two diffs written to `/tmp/d16` first:

- added `expect(` lines in the two specs (`death-and-reload`, `game-over-guard`): **23**
- added `expect(` lines under `tests/` since `a5a03ce` (all files, the two specs included): **827**
- browser share: **2.8 %** (23 / 827; at most 10 %: met)

Plan-boundary gates: `docker compose run --rm test` exit 0 (288 files, 7549 tests passed, 10 skipped, coverage thresholds met); `lint` and `typecheck` exit 0; the list-only check reports `Total: 3 tests in 2 files`; the Task 2 acceptance greps all print their expected counts, and the two negative gates on game-over-guard print nothing.

## Files Created/Modified

See `key-files`. No file outside the plan's `files_modified` changed and no file was deleted.

## Decisions Made

- The twin restores the blob through the production parser and restore (not a hand-built state), so the browser death is a determinism check; its death position, hits and cause are the rows above.
- game-over-guard asserts the death tick equals the twin's too (not only the cause), which holds in real time: the fixed-step loop is the same on both clocks when no input is held.
- The post-death key list is one snapshot with one `expect` per checkpoint (D-16's budget); F5 is in the list, Ctrl+R stays out (the review ledger's deferred item).

## Deviations from Plan

None - plan executed exactly as written. Process notes:

- **TDD gate.** Both tasks are `tdd="true"`, but the plan is tests only (no production code), so there is no `feat(...)` commit to follow a `test(...)` RED commit; every commit is `test(20-09)`. The Node twin was run with placeholder pins first (printed rows, then pinned), as the plan prescribes.
- **Worktree bookkeeping files.** The shared git directory is outside the worktree and the shell guard refused writing the `gsd-plan-head-before` ledger, so `plan_head_before` is the verified spawn base `93be95f` and `commits` is measured with `git rev-list --count 93be95f..HEAD` (4 task commits at SUMMARY time; the SUMMARY commit makes 5).
- **The twin's harness** is a trimmed copy of `tick-parity.test.ts`'s `session()` (that function is file-local and `tick-parity.test.ts` is not in this plan's files), with the router wrapped to record every event.

## Issues Encountered

None. Both specs passed on the first remote run.

## The orchestrator's live observation (idle launch and a teleported ram that touched nothing)

The orchestrator saw no collision in a live game: a teleported ship passed within about 5 m of the buoy's probe position, and an idle straight launch did not hit it within 57 s. The evidence from this plan:

- **The browser path registers the buoy contact.** With `?test=1&traffic=1` the seeded ram dies at the twin's tick in the real bundle, in both the manual-clock and the real-time session, so the sim buoy and the collision stage work end to end in the browser. No defect was found; nothing was worked around.
- **A likely explanation of the live observation is traffic off, not a defect.** `src/app/session/test-flags.ts` makes the effective traffic setting exactly `traffic=1` whenever `?test=1` is present (the build default applies only without the hook), and `src/app/session/step-options.ts` adds `combat.hulls` only when the traffic-on boot loaded the hull table; the collision stage is a no-op without a hull table. A live session under `?test=1` without `&traffic=1` therefore has no player collisions at all, so the ship passes through the buoy. This is a hypothesis about the URL used; I did not see the orchestrator's session.
- **The idle straight launch is lethal through the real session driver.** A scratch run (not committed) launched a docked Lave save through the real `createSimDriver`, router and traffic world, with zero input, and the player died at tick 6456 (53.8 s after the launch command) with dam1 427.948 (cause scrape by the buoy), which matches 20-01's stepSim-level 6450. So the 20-01 CHANGELOG sentence ("A ship that launches and flies straight on without steering rams the navigation buoy about a minute later and is destroyed") holds for a traffic-on session, which is the production default; it does not hold with `?test=1` and no `traffic=1`.
- **A second contributor to the 57 s miss:** the real-time launch adds the 1.5 s pre-roll and the launch view before the sim's launch command, and on a frame-bound runner the loop steps at most 5 ticks per frame, so 53.8 s of sim time can take more than 57 s of wall time. A 57 s watch is borderline either way.
- **Does it matter for the CHANGELOG?** No change is needed to the line itself. The wording is true for the production build; if the owner wants a manual check of it (20-10's UAT item), the URL must not carry `?test=1` without `&traffic=1`. The `probe.world.navBuoy` frame question the orchestrator raised is not an issue: the spec's contact is at the sim's pose and the probe's frame was never used.

## Known Stubs

None.

## Threat Flags

None. Tests only; no endpoint, auth path, file access or schema change.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

20-10 (docs, FIDELITY and the verify-full gate) can cite the two specs and the twin; `verify-full` and the one `e2e-cross` run are its to do. The pending todo's entry is written; the watch continues after the next sharded CI run.

---
*Phase: 20-player-death-and-game-over*
*Completed: 2026-11-23*

## Self-Check: PASSED

The five created or modified test and fixture files exist, the four task commits (`d0d57d0`, `81307c2`, `11a4064`, `9ce2658`) are in `git log 93be95f..HEAD`, the working tree held only this SUMMARY before its commit, and every acceptance criterion of Tasks 1 and 2 was run and passed.
