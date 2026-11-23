---
phase: 20-player-death-and-game-over
verified: 2026-11-23T20:45:00Z
status: human_needed
score: 5/5 must-haves verified
covered_files:
  - ".planning/phases/20-player-death-and-game-over/20-01-PLAN.md"
  - ".planning/phases/20-player-death-and-game-over/20-01-SUMMARY.md"
  - ".planning/phases/20-player-death-and-game-over/20-02-PLAN.md"
  - ".planning/phases/20-player-death-and-game-over/20-02-SUMMARY.md"
  - ".planning/phases/20-player-death-and-game-over/20-03-PLAN.md"
  - ".planning/phases/20-player-death-and-game-over/20-03-SUMMARY.md"
  - ".planning/phases/20-player-death-and-game-over/20-04-PLAN.md"
  - ".planning/phases/20-player-death-and-game-over/20-04-SUMMARY.md"
  - ".planning/phases/20-player-death-and-game-over/20-05-PLAN.md"
  - ".planning/phases/20-player-death-and-game-over/20-05-SUMMARY.md"
  - ".planning/phases/20-player-death-and-game-over/20-06-PLAN.md"
  - ".planning/phases/20-player-death-and-game-over/20-06-SUMMARY.md"
  - ".planning/phases/20-player-death-and-game-over/20-07-PLAN.md"
  - ".planning/phases/20-player-death-and-game-over/20-07-SUMMARY.md"
  - ".planning/phases/20-player-death-and-game-over/20-08-PLAN.md"
  - ".planning/phases/20-player-death-and-game-over/20-08-SUMMARY.md"
  - ".planning/phases/20-player-death-and-game-over/20-09-PLAN.md"
  - ".planning/phases/20-player-death-and-game-over/20-09-SUMMARY.md"
  - ".planning/phases/20-player-death-and-game-over/20-10-PLAN.md"
  - ".planning/phases/20-player-death-and-game-over/20-10-SUMMARY.md"
  - ".planning/phases/20-player-death-and-game-over/20-11-PLAN.md"
  - ".planning/phases/20-player-death-and-game-over/20-11-SUMMARY.md"
  - "src/app/session/event-router.ts"
  - "src/app/session/frame-loop.ts"
  - "src/app/session/save-controller.ts"
  - "src/app/session/settings-controller.ts"
  - "src/app/session/sim-driver.ts"
  - "src/persistence/autosave.ts"
  - "src/sim/combat/death.ts"
  - "src/sim/combat/ledger.ts"
  - "src/sim/combat/step.ts"
  - "src/ui/game-over.ts"
  - "tests/e2e/death-and-reload.spec.ts"
  - "tests/e2e/game-over-guard.spec.ts"
  - "tests/sim/world/death-cadence.test.ts"
covered_digest: "v4:sha256:ce3981efeb7a0feb0d41ba26eb6e51357f170f3464b930a8a41f398e28b46f60"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Die in flight (hook-spawned Viper or a ram) and watch the explosion, the aft view and the 5 s fade to grey in Chromium and Firefox. Look for the player's eight bursts (four small, four big, one flash) and for wreckage from earlier kills still drifting and tumbling."
    expected: "The explosion reads as an explosion (the bursts last about 1.5 s and were not captured in the live check). The one flash does not hide the bursts. The aft view and the fade look right. Earlier wreckage keeps drifting with no time limit."
    why_human: "Visual and timing feel. Vitest and the Playwright specs prove the bursts are added, the camera, the filter and the redraw bound, but not how the effect looks."
  - test: "Read the four game-over lines (Game Over, cause, Score, Press Space) over a bright station face and again at the end of the 5 s fade."
    expected: "All four lines stay legible, in particular the cause line and the Press Space prompt. The wording and layout are acceptable."
    why_human: "Legibility and copy are a judgement. The live check showed 'Destroyed by GalCop Viper' partly lost against a lit station, and 20-UI-REVIEW.md scores the phase 16/24 on this."
  - test: "With traffic on (the production default), launch straight, touch nothing and wait about a minute."
    expected: "The ship rams the navigation buoy as 20-01 measured and pinned it, and the player dies. Both the idle-launch Vitest pin and the browser agree."
    why_human: "A browser confirmation of a Vitest pin that needs about a minute of real flight with traffic on. It is listed in 20-VALIDATION.md under Manual-Only."
---

# Phase 20: Player Death and Game Over Verification Report

**Phase Goal:** The player can die: at zero energy from any cause, in flight, the game is over and the page reloads to offer Continue from the last save, through one death path that autosave, pause and the title flow respect; the milestone's determinism and release gates close here.
**Verified:** 2026-11-23T20:45:00Z
**Status:** human_needed
**Re-verification:** No, initial verification

The phase goal is achieved in the code. Every roadmap success criterion is backed by source I read and by tests I ran or by cited remote evidence. There are no gaps and no blockers. The status is `human_needed` only because the visual items in 20-VALIDATION.md's Manual-Only section need a person.

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A player in flight whose energy reaches zero from any ledger damage dies on that tick: `mode` is `"dead"`, one `playerDestroyed`, the ship explodes, the flight freezes and a game-over screen replaces the view. A docked or launching player is never killed. | ✓ VERIFIED | `src/sim/combat/ledger.ts:206-235`: the lethal check sits in the ledger at the damage point. A dead or already-killed player takes no record, and a record is lethal only when `player.mode === "inFlight"`, the damage past the shield is above 0 and the bank minus it is at or below 0. `src/sim/combat/step.ts:851-852` calls `killPlayer` once. `src/sim/combat/death.ts:killPlayer` returns unless `mode === "inFlight"`, sets `"dead"`, clears the hyperspace attempt and the ident lock, zeroes the energy and posts one `playerDestroyed` with the cause. `src/sim/sim.ts:83-84` returns `[]` for a dead player, so no field, tick or hash moves. `src/app/session/event-router.ts:826-870` (`createDeathFlow`): latch, close the chart and F2, `gameOver` input context, clear the messages, reset the launch sequence, hide the HUD canvas, show the four lines and add eight explosion bursts with one flash. Tests I ran: `death.test.ts` (32), `death.property.test.ts` (4), `death-freeze.test.ts` (10), `death-flow.test.ts` (21), all passed. The orchestrator's live check showed `mode: "dead"`, `death: {damage: "laser", culprit: "viper"}`, the four lines, the HUD hidden and a frozen sim tick. There is no escape pod. |
| 2 | A dead player is never saved or revived. No autosave, manual save or pending write replaces the last save, including on the death frame, with the chart or F2 open, while paused, during a hyperspace countdown, after a focus loss or a context loss. Pause, held keys and the ident lock cannot revive or repeat the death. | ✓ VERIFIED | Four layers. (a) `latchGameOver` (`event-router.ts:755-767`) runs synchronously inside the `playerDestroyed` dispatch and is idempotent, so a second event repeats nothing. (b) `src/app/session/save-controller.ts` refuses on `ctx.runtime.gameOver` or `state.mode === "dead"` in `buildSnapshotInputs` (:162), `queueSnapshot` (:198, with skip reason `"dead"` at :217), `autosave` (:259), `manualSave` (:298), `writeManualSave` (:341), `loadFromSave` (:394) and `clearSaveForNewGame` (:573). (c) `src/persistence/autosave.ts:105-106` throws on a dead state, and `snapshotForSave` cannot encode it. (d) `pause()` (`settings-controller.ts:70-76`) only clears input while `gameOver`, so focus loss, P, the public pause and context loss never open a pause overlay, and `resume()` (:110) returns on `gameOver`. `frame-loop.ts:124-137` drains every input queue and runs no fixed step while latched. `sim-driver.ts:438,462` `advanceTicks` refuses while `gameOver`. The chart controller refuses at `chart-controller.ts:60,75,127,206,255`, and `keyboard.ts:152` limits the `gameOver` context to reserved F keys. `killPlayer` clears the hyperspace attempt and the ident lock. `applyWitchpointArrival` and `completeLaunch` refuse a dead player (commit 1c73c5f). Tests passed: `save-controller.test.ts` (37), `settings-controller.test.ts` (27), `chart-controller.test.ts` (34), `sim-driver.test.ts` (87). The remote `tests/e2e/game-over-guard.spec.ts` passed. In the live check P, F2, Escape and H did nothing and `save.writes` stayed unchanged. |
| 3 | After game over the page reloads and the title offers Continue only when a loadable save exists. Continue resumes that save with its damaged equipment. A browser with no save offers only New game. | ✓ VERIFIED | `src/ui/game-over.ts`: a fresh Space (`event.repeat` ignored) or a click calls one guarded trigger that runs `window.location.reload()`, with no timer. `src/main.ts:381-395`: `title.setContinueVisible(bootSave !== undefined)` and Continue starts `restore: continueSave`, so Continue is shown only for a validated save. Remote `tests/e2e/death-and-reload.spec.ts` has two tests: a ram death at the twin's tick, one fresh Space, and Continue resumes the seeded save with its damaged item; and, with the save removed before the exit, a click reloads to a title that offers New game only. Both passed in remote `verify-full`. In the live check Space reloaded to the title with Continue. |
| 4 | Kills are deterministic: one scenario with an NPC-against-NPC kill, a collision kill and the player's death hashes the same at 30, 60 and 144 Hz. The frozen 20-seed acceptance run is 21 of 21 after the last plan that touches `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json`. | ✓ VERIFIED | `tests/sim/world/death-cadence.test.ts` (16 tests) passed. It uses `CADENCES = [30, 60, 144]` and pins literals with a stable dead hash. `tests/app/session/death-twin.test.ts` (4) passed. The last commit touching those paths is 5cf9a57 (20-08, `src/sim/world/contacts.ts`, a read-only copied velocity, checked with `git log -- src/sim/npc src/sim/world src/content/generated/ships-npc.json`). The acceptance run is recorded after it: 20-08 SUMMARY at snapshot fa58baf (21 passed) and 20-10 SUMMARY at snapshot 6de2dbc (`exit=0`, 21 of 21, thresholds and detectors untouched). No later commit touches those paths. |
| 5 | The release gate holds: `verify-full` exits 0 on the remote test machine with the death-and-reload and game-over-guard specs in it. | ✓ VERIFIED | Cited, not rerun (the project runs it on the remote machine only). Remote `verify-full` at 6de2dbc exited 0 with Vitest 7549 passed and Playwright 150+2 passed, including `death-and-reload.spec.ts` and `game-over-guard.spec.ts`. Firefox `e2e-cross` exited 0. The commits after 6de2dbc touch only `.planning/`. I confirmed the spec files exist with the stated tests. Local re-checks on HEAD: `docker compose run --rm typecheck` exited 0, and my targeted Vitest run (24 files, 570 tests) passed. |

**Score:** 5/5 truths verified (0 present but behavior-unverified).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/sim/combat/death.ts` | `killPlayer` and `playerDeathCause`, the only `playerDestroyed` producer | ✓ VERIFIED | Substantive and wired from `step.ts:852`. `tests/guards/player-death-producer.test.ts` passed and guards the single producer. |
| `src/sim/combat/ledger.ts` | The lethal decision at the damage point | ✓ VERIFIED | `outcome.playerDeath` is set in the ledger. The dead early-return mirrors Oolite. |
| `src/app/session/event-router.ts` | `latchGameOver` and `createDeathFlow` | ✓ VERIFIED | Wired as the router's `deathFlow` subscriber. The latch-only default exists. |
| `src/app/session/save-controller.ts` and `src/persistence/autosave.ts` | Every save path refuses a dead player | ✓ VERIFIED | Seven session guards plus a thrown error in `snapshotForSave`. |
| `src/ui/game-over.ts` and the `#game-over` markup in `index.html` | Four lines, reload on a fresh Space or click | ✓ VERIFIED | Wired in `start-session.ts:788`, built in `main.ts:162`, disposed in `start-session.ts:1025`. |
| `src/app/session/frame-loop.ts`, `sim-driver.ts`, `render-driver.ts` | Frozen dead session, dead scene, fade | ✓ VERIFIED | The branch at `frame-loop.ts:124` and the fade and drift in `render-driver.ts:298-520`. |
| `tests/e2e/death-and-reload.spec.ts` and `tests/e2e/game-over-guard.spec.ts` | Browser journeys | ✓ VERIFIED | Present with 2 and 1 tests, passed in remote `verify-full`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| ledger lethal record | `killPlayer` | `outcome.playerDeath` read in `step.ts:851` | ✓ WIRED | One call per `resolveShots`. |
| `playerDestroyed` event | session latch and death flow | router `deathFlow` subscriber | ✓ WIRED | Synchronous latch, so nothing runs between the death and the latch. |
| death flow | overlay | `gameOverOverlay.show(buildGameOverLines(...))` | ✓ WIRED | The culprit name comes from compiled content only. |
| overlay | page reload | Space or click, then `window.location.reload()` | ✓ WIRED | One guarded trigger. |
| reload | Continue | `main.ts` `bootSave` validation | ✓ WIRED | Pre-existing title flow, now exercised by the e2e spec. |

### Data-Flow Trace (Level 4)

| Artifact | Data variable | Source | Real data | Status |
|----------|---------------|--------|-----------|--------|
| Game-over cause line | `event.cause.culprit` | The lethal ledger record's source resolved to a spec key or ident key, then the compiled catalogue name | Yes | ✓ FLOWING |
| Game-over score line | `ctx.core.profile.credits` and the rating label | The live profile | Yes | ✓ FLOWING |
| Explosion | `event.position` | A copy of the player's position at the lethal tick | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Death path, freeze, flow, save refusals, pause and chart refusals, game-over view, twin | `docker compose run --rm test npx vitest run` over 24 files (death, death.property, death-freeze, death-cadence, death-flow, death-twin, player-death-producer, save-controller, sim-driver, settings-controller, chart-controller, tests/ui) | 24 files, 570 tests passed | ✓ PASS |
| Typecheck on HEAD | `docker compose run --rm typecheck` | exit 0 | ✓ PASS |
| Full local suite at the merged HEAD | cited from the orchestrator | 288 files, 7549 passed | ✓ PASS (cited) |
| Remote `verify-full`, acceptance 21/21, Firefox `e2e-cross` | cited from the orchestrator and the 20-10 SUMMARY | exit 0 for all three | ✓ PASS (cited) |

### Probe Execution

SKIPPED. No phase-declared probe scripts (`scripts/*/tests/probe-*.sh`).

### Requirements Coverage

Every ID in the plans' `requirements` frontmatter is DEATH-01, DEATH-06 or QUAL-11. REQUIREMENTS.md maps exactly those three to Phase 20 (lines 91-93 and the "Phase 20: 3" count at line 99). There are no orphans.

| Requirement | Source plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| DEATH-01 | 20-01, 20-02, 20-04 to 20-11 | Death at zero energy while `inFlight`, game over reloads to the title through one death path | ✓ SATISFIED | Truths 1 and 3, the death path and the death flow above |
| DEATH-06 | 20-01, 20-04 to 20-07, 20-09, 20-10 | A dead player is never autosaved. After the reload, Continue shows only for a loadable save. | ✓ SATISFIED | Truths 2 and 3 |
| QUAL-11 | 20-01, 20-02, 20-03, 20-10 | Equal hash at 30, 60 and 144 Hz and a 21/21 acceptance run | ✓ SATISFIED | Truth 4 |

### Anti-Patterns Found

No `TBD`, `FIXME` or `XXX` in any file added or modified by the phase under `src/`, `tests/` or `index.html` (`rg` over `git diff --diff-filter=AM fb26c43^..HEAD`). `20-REVIEW.md` has 0 critical, 1 warning and 6 info findings, all recorded in `20-REVIEW-DISPOSITION.md` as open.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/app/session/event-router.ts` and `src/ui/game-over.ts` | n/a (WR-01) | The overlay's exit is armed only inside `show()`. A throw from `buildGameOverLines` on a `formatDecicredits` format change would leave a latched, frozen session with no exit. | ⚠️ Warning | Not reachable today. It needs a future format change or a harness. It does not block the goal. A candidate fix is recorded. |
| `src/ui/game-over.ts` | n/a (IN-03) | The Space handler accepts modifier chords. | ℹ️ Info | Harmless. A one-line fix is recorded. |
| `src/app/session/event-router.ts` | n/a (IN-05) | `PLAYER_EXPLOSION_SETTINGS` duplicates generated data (a unit test pins it). With traffic off the particle textures are first requested at the death. | ℹ️ Info | The production default is traffic on. |
| `src/app/probe.ts` | n/a (IN-06) | `probe.dock.outcome` reports a dead player as `"inFlight"`. | ℹ️ Info | Probe only. |
| `src/app/session/save-controller.ts` | n/a (T-20-41) | The `saveSkipReason` overwrite in `queueSnapshot`'s failure branches is tracked in `20-SECURITY.md`. | ℹ️ Info | Diagnostic only. No save is written. |

`20-SECURITY.md` has `threats_open: 0`. `20-VALIDATION.md` records a Nyquist audit with no gaps. `20-UI-REVIEW.md` scores the phase 16/24, with legibility, grey-on-grey after the fade and no live region as the top fixes. These feed the human items below and are not gaps against the roadmap criteria.

### Human Verification Required

#### 1. Explosion, aft view and black-and-white fade

**Test:** Die in flight in Chromium and Firefox, for example with a hook-spawned Viper's laser or a ram. Watch the aft view, the eight bursts with one flash, the 5 s fade to grey, and the earlier wreckage drifting.
**Expected:** The explosion reads as an explosion. The flash does not hide the bursts. The fade and the drift look right.
**Why human:** Visual and timing feel. The bursts last about 1.5 s and were not captured in the orchestrator's live check.

#### 2. Four-line layout, wording and legibility

**Test:** Read Game Over, the cause line, the Score line and Press Space over a bright station face and at the end of the fade.
**Expected:** All four lines are legible, especially the cause line and the Press Space prompt.
**Why human:** Legibility and copy are a judgement. The live check found the cause line poorly legible over a lit station, and `20-UI-REVIEW.md` lists a backing panel and a live region as its top fixes. If the owner wants this fixed it is a follow-up, not a closure of this verification.

#### 3. The idle launch meets the navigation buoy

**Test:** With traffic on (production default), launch straight and touch nothing for about a minute.
**Expected:** The ram on the navigation buoy and the death match 20-01's pinned idle-launch scenario.
**Why human:** A browser confirmation of a Vitest pin that needs a minute of real flight.

### Gaps Summary

There are no gaps. All five roadmap success criteria hold in the code and in the tests. I read the source for the lethal check, the kill, the latch, the death flow, every save refusal, the frozen frame loop, the pause and resume refusals, the overlay and the title's Continue rule. I also ran 570 tests across 24 relevant files and the typecheck. The remote gate (`verify-full`, acceptance 21/21, Firefox) is taken from the orchestrator's evidence and I confirmed that the specs it names exist and that no `src/sim/npc`, `src/sim/world` or `ships-npc.json` change follows the acceptance snapshot. The only open items are the three human-judgement checks above and the non-blocking review findings WR-01 and IN-01 to IN-06.

---

_Verified: 2026-11-23T20:45:00Z_
_Verifier: Claude (gsd-verifier)_
