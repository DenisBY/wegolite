---
phase: quick
plan: 261117-pij
subsystem: hud, ui, sim
status: complete
tags: [hud, messages, alert, condition-light, station, market, legality, currency, clock, hyperspace-target, fidelity]
requires: []
provides:
  - "Oolite's message rows (src/render/hud/messages.ts): enqueue(text, seconds), clearPrevious, rows, current, clear, size, MESSAGE_ROWS 10, MESSAGE_REPEAT_SECONDS 6"
  - "HUD_MESSAGE_ROWS = 2 drawn rows in the existing message rectangle; HudModel.messageRows; probe hud.messageRows"
  - "src/sim/combat/alert.ts: alertFlags, flightAlertCondition, dialAltitude, hostilesNearPlayer, isBehaviourHostile, ALERT_FLAG_*"
  - "Condition light from Oolite's alert rule in flight (hud-model)"
  - "legalityText (Im/Ex/Re/em dash), formatRating, Cobra Mark III, ₢ unit"
  - "NEW_GAME_CLOCK_SECONDS; resolveStartTarget (a new game targets the start system)"
affects: [src/render/hud, src/app, src/app/session, src/ui, src/sim/combat, src/sim/flight, src/sim/player, index.html]
tech-stack:
  added: []
  patterns:
    - "Every HUD message carries its own duration; Oolite's where it has one, MESSAGE_DURATION_SECONDS otherwise"
    - "The alert rule is pure sim code that only reads the world; the render driver passes hostiles into the HUD model"
key-files:
  created:
    - src/sim/combat/alert.ts
    - tests/hud/messages.test.ts
    - tests/sim/combat/alert.test.ts
  modified:
    - src/render/hud/messages.ts
    - src/render/hud/draw.ts
    - src/app/hud-model.ts
    - src/app/session/render-driver.ts
    - src/app/session/event-router.ts
    - src/app/session/hyperspace-controller.ts
    - src/app/session/start-session.ts
    - src/app/session/probe-publisher.ts
    - src/app/probe.ts
    - src/app/game-session.ts
    - src/main.ts
    - src/ui/station-model.ts
    - src/ui/station.ts
    - src/ui/docked.ts
    - src/sim/player/profile.ts
    - src/sim/flight/state.ts
    - index.html
    - tests/fixtures/probe-shape.json
    - tests/helpers/recorded-flights.ts
    - CHANGELOG.md
    - FIDELITY.md
    - .planning/PROJECT.md
    - .planning/todos/pending/2026-11-17-ui-flight-hud-differences-from-oolite.md
    - .planning/todos/pending/2026-11-17-ui-station-screen-differences-from-oolite.md
decisions:
  - "Two of Oolite's ten message rows are drawn, inside the existing 40-unit HUD_LAYOUT.message rectangle; the queue keeps all ten"
  - "A message row's countdown starts at its first read by the HUD; the 6 s repeat window runs on the flight time of the queue's latest read"
  - "Long messages keep the MAX_MESSAGE_CHARS clamp; Oolite's word wrap into extra rows is not ported"
  - "The condition light's pulse, Oolite's exact colours and the cascade-weapon hostiles clause are not ported"
  - "The legality column heading is Legal (no colon); Im means legal to import only, as Oolite's code does"
  - "The rating prints the new commander's kill count 0 through formatRating(rating, kills); no kill count is kept yet (LAW backlog)"
  - "CLOCK_START stays Oolite's PLAYER_SHIP_CLOCK_START as the save-schema floor; only the new-game start moves; no save version changes"
  - "The frozen v1 flight-hash golden is not regenerated: the recorded flights start at CLOCK_START, the clock the baseline was captured with"
  - "The probe publishes hud.messageRows so a browser spec can see a message on either drawn row"
metrics:
  duration: "about 1 h 15 min"
  completed: 2026-11-17
  tasks: 3
  files: 53
estimate:
  tokens: 160000
  tasks: 3
actuals:
  tokens: 21750
  tasks: 3
  commits: 5
plan_head_before: a7df81e258c5634b29f015a32c47dde1f73bdcac
plan_head_after: e66c1dcb4b5901852e7ab9c7da153536827838e3
---

# Phase quick Plan 261117-pij: Oolite's HUD message rows, alert condition light, station labels, clock and start target Summary

The J reply under mass lock now shows at once for Oolite's 1.5 s on Oolite's scrolling message rows (two drawn, ten kept, per-row duration and fade, 6 s repeat rule), the condition light follows Oolite's alert flags, the market prints Oolite's Legal column (Im for slaves, narcotics and firearms), F5 and the docked home name the Cobra Mark III with the rating's kill count and ₢ amounts, and a new commander starts at 2084004:20:13:23 with Lave targeted.

## Commits

| Task | Commit | Description |
| ---- | ------ | ----------- |
| 1 | cc05bf7 | Message rows, per-message durations, alert.ts and the condition light; FIDELITY E-92..E-97; two PROJECT.md rows |
| 2 | dc14f7a | Legal column, Cobra Mark III, rating with kill count, ₢; FIDELITY E-98 |
| 3 | 55ff9dd | NEW_GAME_CLOCK_SECONDS, resolveStartTarget, probe fixture, re-pins, docs |
| gate fix | 9769d6a | Docked home ship name; hud.messageRows in the probe; bounce spec reads the drawn rows |
| gate fix | e66c1dc | Bounce spec comment no longer names the unobserved later message |

## What changed

**Messages (Task 1).** `src/render/hud/messages.ts` is now Oolite's message area: ten row slots (`hud.plist` `message_gui` 140/14), a new message scrolls the rows up and takes the bottom slot with its own duration (`GuiDisplayGen.m:736-766`), each row counts down from its first read, blanks at zero without compaction and fades over its last second (`GuiDisplayGen.m:1327-1336`), and a repeat of the last shown message within 6 s is dropped unless `clearPrevious()` ran (`Universe.m:6235-6240`, `6340-6355`). The priority method is gone. The HUD draws the bottom two rows (`HUD_MESSAGE_ROWS = 2`) at their alpha; a hyperspace countdown replaces the bottom row without scrolling (`Universe.m:6258-6267`). Durations: J refusal 1.5 s, torus stopped by mass lock 4.5 s, laser refusals 3 s, ident on/off and missiles safe 2 s, ident lock 4.5 s, target lost 3 s, countdown cancelled 3 s, docking-computer messages 4.5 s, hyperspace refusals 4.5 s after `clearPrevious()`; every Wegolite-only message and hint keeps 4 s. The lock-onset "Mass locked" message is gone.

**Condition light (Task 1).** `src/sim/combat/alert.ts` ports the flags and the in-space condition (mass lock yellow; hostiles, energy below 64 and below 0.8 of maximum, heat level above 0.9, altitude dial below 0.1 red). `buildHudModel` uses it in `inFlight` and is green in every other mode. The render driver passes `hostilesNearPlayer(world, position)`.

**Station screens (Task 2).** Legal column (`legalityText`, Im/Ex/Re/—), `index.html` header `Legal`, "Cobra Mark III" on F5 and on the docked home, `formatRating` ("Harmless   (0)"), and ₢ for every credit amount (`formatDecicredits`, `formatWholeCredits`, the manifest's "vs avg" text).

**Clock and target (Task 3).** `NEW_GAME_CLOCK_SECONDS = 180_058_018_403.9197` feeds `initFlightState`; `CLOCK_START` is unchanged and still the save-schema floor. Every save path goes through `snapshotForSave`, which floors the clock (`src/persistence/autosave.ts:121`), so the fractional start fits the integer schema; no save version changes and old saves still load (save, save-v2..v4 tests green). `resolveStartTarget` installs the start system as a new game's target; restores keep the T-06-12 allow-list rule. Jumping to the current system is still refused as "no target" by `canStartJump` (no sim change).

## Discretion choices (as planned)

- Two of the ten rows drawn, in the existing 40-unit message rectangle; moving or enlarging the area is ranked item 21 (R2), still open.
- A row's countdown starts at its first HUD read; the 6 s window runs on the flight time of the queue's latest read.
- `MAX_MESSAGE_CHARS` clamp kept; Oolite's word wrap not ported.
- Not ported: the condition light's pulse (`HeadUpDisplay.m:2560`), Oolite's exact colours (R3), and the cascade-weapon hostiles clause (Wegolite has no cascade weapon). The Thargoid clause and missiles are ported.
- Heading "Legal" without the colon; "Im" follows Oolite's code (legal to import only), as the orchestrator accepted.
- Rating count 0 through `formatRating(rating, kills)`; no kill count is kept (LAW backlog). In the DOM the three spaces render collapsed (HTML whitespace), which is style.
- Font check: the docked screens (`#docked`, `index.html:145`) and the chart hover card (`#chart-tooltip`, `index.html:1007`) both use the generic `monospace` family; the hover card already rendered "M₢" in the 261117-nfn screenshots, so no font asset was added.

## Re-pinned values and their causes

| Pin | Old | New | Cause |
| --- | --- | --- | --- |
| Session-order, hyperspace-controller and world-lifecycle message fakes | `messages.enqueue X` / `messages.enqueuePriority X` | `messages.enqueue X for N`, plus `messages.clearPrevious` before each refusal | The queue API now takes a duration and has `clearPrevious`; the lock-onset entries are gone because the message was removed |
| FIFO tests in `tests/hud/format.test.ts` | one-line FIFO cases | moved to `tests/hud/messages.test.ts` as row cases | The FIFO no longer exists |
| Unit and e2e money literals (profile, outfitting, footer, station-controller, status, market tests; station, core-loop, docking, autosave, scene specs) | `... Cr` | `... ₢` | Unit changed to Oolite's `credits-format` |
| F5 Ship / docked home ship (status test; station, docking, scene specs) | `Cobra Mk III` | `Cobra Mark III` | Scenario `ship_name` |
| F5 Rating (status test; station spec) | `Harmless` | `Harmless   (0)` (spec: `Harmless (0)`, whitespace-normalised) | `KillCountToRatingAndKillString` format |
| Market legality (market test) | `exText` "Ex" for slaves, narcotics, firearms | `legalText` "Im" | Oolite's `PlayerEntity.m:9675-9690` |
| `tests/app/launch-sequence.test.ts` | `CLOCK_START + 600` | `NEW_GAME_CLOCK_SECONDS + 600` | New-game clock start |
| `tests/persistence/autosave.test.ts` new-game snapshot clock | `CLOCK_START`, `CLOCK_START + 600` | `floor(NEW_GAME_CLOCK_SECONDS)`, `floor(NEW_GAME_CLOCK_SECONDS + 600)` | New-game clock start, floored by `snapshotForSave` |
| `tests/e2e/autosave.spec.ts` new-game saved clock (3 places) | `CLOCK_START` | `NEW_GAME_START_SAVED = floor(NEW_GAME_CLOCK_SECONDS)` | Same |
| Debris twin hash `HASH_60_AFTER_KILL` (tick-parity) and `TWIN_HASH_60_AFTER_KILL` (combat.spec) | `a10b2dfc` | `ca59f800` | `hashFlight` includes `clock=`; reverting only the new-game start made every moved hash pass again (local check). The browser twin reproduced `ca59f800` on the remote (combat.spec green) |
| Frozen v1 flight-hash golden (`flight-hash-pins.test.ts`, `hash.test.ts`) | moved by the clock | not regenerated | The recorded flights now start at `CLOCK_START` (`baselineFlightState` in `tests/helpers/recorded-flights.ts`), the clock the baseline was captured with; the golden file is untouched, as its header requires |
| `tests/fixtures/probe-shape.json` | no `chart.targetId` / `hyperspace.targetId`; no `hud.messageRows` | `"targetId": "string"` in `chart` and `hyperspace` of the six session states (12 keys); `hud.messageRows` `[]` before a HUD frame, `["string"]` in flight | A New game now targets Lave, so the probe publishes both target ids; the probe gained `hud.messageRows`. Both hand edits equal the remote write-mode output exactly (snapshots `55ff9dd` and `e66c1dc`) |
| `tests/e2e/station.spec.ts` new-game Hyperspace System | `(Unknown)` | `Lave` (plus an exact `dt + dd` check) | New-game target |
| `tests/e2e/docking.spec.ts:285` bounce message | `hud.message` includes "Too wide for the slot" | any of `hud.messageRows` includes it | With rows, a later message takes the bottom row and the bounce message moves up one drawn row, still on screen; under the FIFO it returned to the head after the later message expired |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The docked home panel still said "Cobra Mk III"**
- Found during: remote verify-full on `55ff9dd` (docking.spec:371, scene.spec:111 failed).
- Issue: `src/ui/docked.ts` has its own `DOCKED_SHIP` constant, which Task 2 missed.
- Fix: `DOCKED_SHIP = "Cobra Mark III"`; CHANGELOG names the home screen too.
- Commit: 9769d6a.

**2. [Rule 1 - Bug] The bounce spec assumed a one-line FIFO**
- Found during: remote verify-full on `55ff9dd` (docking.spec:215 timed out waiting for `hud.message`).
- Fix: the probe publishes `hud.messageRows` (drawn rows' text) and the spec checks any drawn row; fixture updated and confirmed by a remote write run. Which later message hid it was not captured, so the spec comment does not name it (e66c1dc).
- Files: `src/app/probe.ts`, `src/main.ts`, `src/app/session/probe-publisher.ts`, `tests/e2e/docking.spec.ts`, `tests/fixtures/probe-shape.json`.
- Commits: 9769d6a, e66c1dc.

**3. [Rule 3 - Blocking] Files outside the plan's lists**
- `index.html` (static market header `Ex` -> `Legal`), `tests/persistence/autosave.test.ts`, `tests/helpers/recorded-flights.ts`, `tests/e2e/combat.spec.ts` (twin hash), and `tests/e2e/autosave.spec.ts` clock checks: each changed with the cause in the table above.

**4. FIDELITY E-96 range.** The plan named `PlayerEntity.m:5122-5144` (23 lines); the contract allows at most 20, so E-96 quotes `5122-5138`, which holds the whole flag-to-condition branch.

**5. Gate change (orchestrator decision).** The final browser gate is one remote `verify-full` instead of `verify` plus a targeted e2e run.

**6. Hyperspace refusal order.** `clearPrevious()` runs before the refusal copy is built, as `witchJumpChecklist` does; the session-order expectation follows that order.

## Gate results (remote, `/home/opencode/.claude/scripts/wegolite-remote-run.sh`, one at a time)

| Gate | Snapshot | Exit line |
| ---- | -------- | --------- |
| `run --rm test` | 55ff9dd | `exit=0 elapsed=69s snapshot=55ff9dd` (220 files, 5666 passed, 10 skipped) |
| `run --rm lint` | 55ff9dd | `exit=0 elapsed=27s snapshot=55ff9dd` |
| `run --rm typecheck` | 55ff9dd | `exit=0 elapsed=8s snapshot=55ff9dd` |
| probe-shape write run (`build:e2e`, `WEGOLITE_PROBE_SHAPE_WRITE=1`, chromium) | 55ff9dd | `exit=0 elapsed=16s snapshot=55ff9dd`; printed fixture equal to the hand edit |
| `run --rm verify-full` | 55ff9dd | `exit=1 elapsed=591s snapshot=55ff9dd`: 3 failed, 134 passed (deviations 1 and 2) |
| probe-shape write run | e66c1dc | `exit=0 elapsed=15s snapshot=e66c1dc`; printed fixture equal to the hand edit |
| `run --rm verify-full` | e66c1dc | `exit=1 elapsed=103s snapshot=e66c1dc`: unit stage, 1 failed: `tests/content/explosions.test.ts` "is imported outside src/content by the session boot only" saw `src/sim/__purity_explosions_probe.ts`, the temporary probe that `tests/guards/content-boundary.test.ts:150` writes while it runs; a cross-test race, no file of this plan involved; rerun once |
| `run --rm verify-full` (rerun) | e66c1dc | `exit=0 elapsed=600s snapshot=e66c1dc`: lint, typecheck, `assets:check: no differences`, 220 unit files passed, Chromium e2e 137 passed, fault-seam 2 passed |

Local Docker (targeted, during the work): each task's verify command passed; full `npm run test:fast` passed (220 files, 5666 passed); the FIDELITY contract passed with `OOLITE_SRC` pointing at an export of the pin `7437f22` (every excerpt verbatim, E-92..E-98 included).

The new explosions-test race is not in the known-flake list; it is reported here for the orchestrator to record (not fixed: outside this plan's scope).

## NPC acceptance run

Not due. `git diff --stat a7df81e..HEAD -- src/sim/npc src/sim/world src/content/generated/ships-npc.json` is empty. `src/sim/combat/alert.ts` only reads the world, and no NPC or world rule reads `clockSeconds` (`rg -n clockSeconds src/sim/ai src/sim/npc src/sim/world src/sim/combat` is empty).

## Docs

FIDELITY rows and verbatim excerpts E-92..E-98; the 261117-nfn Open items bullet marks the J reply, the extra mass-lock message, the condition light, the clock start, the default target, the legality column, the kill count, the ship name and the currency unit as fixed in 261117-pij. The clock, the default target, the ship name and the currency come from `Resources` files, not `src/Core`, so they have no Mechanics row (the row pattern requires `src/Core`). PROJECT.md gains the two Key Decisions rows; both UI todos mark ranked rows 1-4, 7, 8 and 10-12 done; CHANGELOG [Unreleased] describes every change.

## Known Stubs

None.

## Threat Flags

None. The new probe field `hud.messageRows` publishes HUD text already shown on screen.

## TDD Gate Compliance

The plan is `type: execute` with task-level `tdd="true"`. Tests were written with each task's code, not committed red first: the new row and alert tests were written against the new modules in the same pass, and the first local run failed only on a test that misjudged a row's expiry (fixed in the test). No plan-level RED/GREEN commits were required.

## Self-Check: PASSED
