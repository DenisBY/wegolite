---
phase: quick
plan: 261117-pij
type: execute
wave: 1
depends_on: []
files_modified:
  - src/render/hud/messages.ts
  - src/render/hud/draw.ts
  - src/app/hud-model.ts
  - src/sim/combat/alert.ts
  - src/app/session/render-driver.ts
  - src/app/session/event-router.ts
  - src/app/session/hyperspace-controller.ts
  - src/app/game-session.ts
  - src/ui/station-model.ts
  - src/ui/station.ts
  - src/sim/player/profile.ts
  - src/sim/flight/state.ts
  - src/app/session/start-session.ts
  - tests/hud/messages.test.ts
  - tests/hud/format.test.ts
  - tests/hud/clock-lines.test.ts
  - tests/sim/combat/alert.test.ts
  - tests/ui/hud-model.test.ts
  - tests/app/session-order.test.ts
  - tests/app/session/hyperspace-controller.test.ts
  - tests/app/session/render-driver.test.ts
  - tests/app/session/probe-publisher.test.ts
  - tests/app/session/sim-driver.test.ts
  - tests/app/session/tick-parity.test.ts
  - tests/app/session/world-lifecycle.test.ts
  - tests/app/session/start-session.test.ts
  - tests/app/session/station-controller.test.ts
  - tests/app/launch-sequence.test.ts
  - tests/ui/station-market.test.ts
  - tests/ui/station-status.test.ts
  - tests/ui/station-outfitting.test.ts
  - tests/ui/station-footer.test.ts
  - tests/sim/player-profile.test.ts
  - tests/e2e/station.spec.ts
  - tests/e2e/core-loop.spec.ts
  - tests/e2e/docking.spec.ts
  - tests/e2e/autosave.spec.ts
  - tests/e2e/scene.spec.ts
  - tests/e2e/probe-shape.spec.ts
  - tests/fixtures/probe-shape.json
  - CHANGELOG.md
  - FIDELITY.md
  - .planning/PROJECT.md
  - .planning/todos/pending/2026-11-17-ui-flight-hud-differences-from-oolite.md
  - .planning/todos/pending/2026-11-17-ui-station-screen-differences-from-oolite.md
autonomous: true
requirements: [FLGT-05, DOCK-08, ECON-04, ECON-06, NAV-02]

estimate:
  tokens: 160000
  raw_tokens: 160000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "Pressing J while mass-locked puts 'Hyperspeed mass-locked.' on the bottom HUD message row on the next drawn frame, even when first-use hints were posted just before it; the row lasts 1.5 s of flight time and fades over its last second (PlayerEntityControls.m:1166-1175, GuiDisplayGen.m:1327-1336) (MSG-1)."
    - "Every HUD message keeps its own row and its own duration: a new message scrolls the area up one row and takes the bottom row; ten rows are kept (hud.plist message_gui 140/14) and the bottom two are drawn inside the existing message rectangle; an expired row goes blank and is never compacted; a message equal to the last shown one within 6 s of it is dropped unless the last message was cleared, which every hyperspace refusal does first (GuiDisplayGen.m:736-766, Universe.m:6235-6240, 6340-6355) (MSG-2)."
    - "Each message that has an Oolite counterpart uses Oolite's duration (J refusal 1.5 s, torus stopped by mass lock 4.5 s, laser refusals 3 s, ident on/off 2 s, ident lock 4.5 s, target lost 3 s, hyperspace refusals 4.5 s, countdown abort 3 s, docking computer 4.5 s); Wegolite-only messages and hints keep 4 s; nothing is posted when a mass lock begins (MSG-3)."
    - "In flight the condition light is red when hostiles target the player within scanner range, energy is below 64 (and below 0.8 of maximum), the heat level is above 0.9 or the altitude dial is below 0.1 (4,000 m above the nearest planet or sun surface); otherwise yellow while mass-locked; otherwise green (PlayerEntity.m:5122-5144, 2935-2993) (COND-1)."
    - "The F8 legality column is headed Legal and prints Oolite's values from both legality fields: Im for Slaves, Narcotics and Firearms (legal to import only), Ex for export-only, Re for neither, an em dash for both (PlayerEntity.m:9675-9690, descriptions.plist oolite-legality-*) (STN-1)."
    - "F5 names the ship Cobra Mark III, shows the rating with its kill count in Oolite's format (OOConstToString.m:399-402), and every credit amount Wegolite prints uses the unit ₢ (descriptions.plist credits-format '[value] ₢') (STN-2)."
    - "A new commander's ship clock starts at 180058018403.9197 s, shown 2084004:20:13:23, the standard scenario's ship_clock, while CLOCK_START stays Oolite's PLAYER_SHIP_CLOCK_START and keeps bounding saved clocks; a new commander's hyperspace target is the start system (Lave), so the HUD clock line and F5 name Lave (oolite-standard.oolite-save ship_clock, target_system_name) (SIM-1)."
    - "FIDELITY.md gains faithful rows E-92 to E-98, the 261117-nfn Open items bullet and both UI todos mark rows 1-4, 7, 8 and 10-12 done, CHANGELOG [Unreleased] describes each change, PROJECT.md gains the two Key Decisions rows this plan revises, and remote test, lint, typecheck, verify and the targeted e2e run pass on the committed HEAD (DOC-1)."
  artifacts:
    - path: "src/render/hud/messages.ts"
      provides: "Oolite's message rows: enqueue(text, seconds), clearPrevious, rows(flightTime, count), current, clear, size, MESSAGE_ROWS, MESSAGE_REPEAT_SECONDS"
      contains: "clearPrevious"
    - path: "src/sim/combat/alert.ts"
      provides: "Oolite's alert flags and flight condition: alertFlags, flightAlertCondition, dialAltitude, hostilesNearPlayer, isBehaviourHostile"
      contains: "ALERT_FLAG_YELLOW_LIMIT"
    - path: "src/app/hud-model.ts"
      provides: "condition from the alert rule and messageRows passed to the HUD"
      contains: "flightAlertCondition"
    - path: "src/ui/station-model.ts"
      provides: "legalText with Oolite's four values, Cobra Mark III, rating with kill count, ₢ amounts"
      contains: "Cobra Mark III"
    - path: "src/sim/player/profile.ts"
      provides: "formatDecicredits and formatCredits with the ₢ unit"
      contains: "₢"
    - path: "src/sim/flight/state.ts"
      provides: "NEW_GAME_CLOCK_SECONDS used by initFlightState; CLOCK_START unchanged"
      contains: "NEW_GAME_CLOCK_SECONDS"
    - path: "FIDELITY.md"
      provides: "faithful rows with excerpts E-92 to E-98"
      contains: "### E-92"
  key_links:
    - from: "src/app/session/event-router.ts"
      to: "src/render/hud/messages.ts"
      via: "the torusRefused case posts the J refusal with Oolite's 1.5 s"
      pattern: "1\\.5"
    - from: "src/app/session/render-driver.ts"
      to: "src/render/hud/messages.ts"
      via: "the frame reads messages.rows(flightTime, HUD_MESSAGE_ROWS) and passes them as options.messageRows"
      pattern: "\\.rows\\("
    - from: "src/app/hud-model.ts"
      to: "src/sim/combat/alert.ts"
      via: "buildHudModel computes condition = flightAlertCondition(alertFlags(...)) in flight"
      pattern: "flightAlertCondition\\("
    - from: "src/app/session/render-driver.ts"
      to: "src/sim/combat/alert.ts"
      via: "options.hostiles = hostilesNearPlayer(world, state.position)"
      pattern: "hostilesNearPlayer\\("
    - from: "src/ui/station.ts"
      to: "src/ui/station-model.ts"
      via: "the market table cell reads row.legalText"
      pattern: "legalText"
    - from: "src/app/session/start-session.ts"
      to: "src/app/session/context.ts"
      via: "a new game installs the start system as ctx.core.hyperspaceTargetId"
      pattern: "hyperspaceTargetId"
---

<objective>
Fix six UI differences from Oolite found by quick task 261117-nfn (ranked rows 1, 2, 3, 4, 7, 8, 10, 11, 12), each matched to Oolite's source in the local checkout. Owner decision 2026-11-17: fix these, matching Oolite.

Purpose: the J reply came 14.7 s late behind a one-line FIFO, the condition light never left green, the clock and the default target differed from a new Oolite commander, and the market legality column said the opposite of Oolite.

Oolite facts, verified by the planner at the pin `7437f22` (`git -C /home/opencode/git/oolite show 7437f22:<path>`; line numbers below are at the pin):
- Messages. `Universe.m:6340-6355` `addMessage:forCount:forceDisplay:` shows a message unless it equals the last shown message (`currentMessage`) and less than 6 s have passed (`messageRepeatTime = universal_time + 6.0`); `clearPreviousMessage` (`Universe.m:6235-6240`) forgets the last message, and `witchJumpChecklist` calls it before every refusal (`PlayerEntity.m:6552, 6571, 6585, 6599`). `showGUIMessage` (`Universe.m:6400-6407`) calls `printLongText` (`GuiDisplayGen.m:736-795`): `currentRow` starts at the last row (`:214`), so every message scrolls the area up one row (`:754-755`, `scrollUp` `:863-880`) and takes the bottom row with `rowFadeTime` = its duration. `drawGUI` (`:1327-1336`) counts each row's time down by the frame delta while it is drawn, blanks the row at 0 (rows are never compacted), and multiplies the row's alpha by the time left during the last second. `hud.plist` `message_gui` is 252x140 with 14 px rows, so 10 rows. `displayCountdownMessage` (`Universe.m:6258-6267`) writes the countdown into the bottom row without scrolling.
- Durations. J refusal 1.5 s (`PlayerEntityControls.m:1166-1175`), torus stopped by mass lock 4.5 s (`PlayerEntity.m:2757`), laser overheat and no energy 3 s (`:5462`, `:5479`), ident on 2 s (`PlayerEntityControls.m:4768`), ident off and missiles safe 2 s (`:1412`, `:1415`), ident lock 4.5 s (`PlayerEntity.m:10917`), target lost 3 s (`:2838`), hyperspace blocked, no target, too far, no fuel 4.5 s (`:6554, 6572, 6586, 6600`), countdown abort 3 s (`PlayerEntityControls.m:1527`), docking computer messages 4.5 s (`:4754`). Oolite prints nothing when the mass lock begins; its only mass-lock string is `jump-mass-locked`.
- Condition. `PlayerEntity.h:223-229` flags: DOCKED 0x010, MASS_LOCK 0x020, YELLOW_LIMIT 0x03f, TEMP 0x040, ALT 0x080, ENERGY 0x100, HOSTILES 0x200. `PlayerEntity.m:5122-5144` `alertCondition`: docked gives DOCKED; else any flag gives YELLOW and flags above 0x03f give RED, so mass lock alone is yellow and each of the other four alone is red. `PlayerEntity.m:2935-2950` hostiles: an entity within scanner range (or not a ship), not CLASS_NO_DRAW, that is CLASS_THARGOID or a cascade weapon, or a ship whose `hasHostileTarget` holds and whose primary target is the player; `ShipEntity.m:6430-6444` `hasHostileTarget` (missiles always, AVOID_COLLISION uses the saved behaviour, else `IsBehaviourHostile`, `:6398-6428`, ATTACK_MINING_TARGET excluded). `PlayerEntity.m:2976-2993`: energy flag `energy < 64 && energy < maxEnergy * 0.8`, TEMP `hullHeatLevel > .90` (`ShipEntity.m:8399-8403`, clamped temperature over 256), ALT `dialAltitude < .10` (`PlayerEntity.m:4330-4347`: nearest stellar body by surface distance, `ShipEntity.m:6619-6631`, `(distance - collision radius) / PLAYER_DIAL_MAX_ALTITUDE` 40,000, `PlayerEntity.h:287`, clamped to 0..1). `updateAlertConditionForNearbyEntities` clears every flag outside space (`PlayerEntity.m:2894-2899`).
- Legality. `PlayerEntity.m:9675-9690`: import 0 and export 0 give `oolite-legality-clear` "—"; import 0 and export non-zero give `oolite-legality-import` "Im" ("legal to import"); import non-zero and export 0 give "Ex"; both give "Re". Column title `oolite-legality-column-title` "Legal:". Wegolite's compiled commodities: slaves export 1, narcotics export 2, firearms export 1, every import 0, so those three print "Im", as Oolite's screenshot does. (The owner's note says "Im" for goods whose import is illegal; Oolite's code and plist comment mean "legal to import, illegal to export". This plan follows Oolite's code.)
- Labels. `OOConstToString.m:399-402` `KillCountToRatingAndKillString` is `"%@   (%u)"` (three spaces). `descriptions.plist:476` `credits-format` = "[value] ₢". `Resources/Scenarios/oolite-standard.oolite-save:566-575, 813-814`: `ship_class_name` and `ship_name` "Cobra Mark III", `ship_clock` 180058018403.9197, `ship_kills` 0, `target_system_name` "Lave". `ClockToString` floors (`OOStringParsing.m:402-413`), so the start reads 2084004:20:13:23.
- Target. Wegolite's hyperspace target is session state (`ctx.core.hyperspaceTargetId`, saved as the optional `targetSystem`), not sim state. `canStartJump` already refuses the current system as "no target" (`src/sim/hyperspace/countdown.ts:172-174`), as Oolite's `witchJumpChecklist` does (`PlayerEntity.m:6570-6580`), so a Lave target needs no sim change.

Output: the message rows and the alert rule (Task 1), the station labels (Task 2), the clock, the default target, the docs and the remote gates (Task 3).

Discretion choices (record each in the SUMMARY):
- Two of Oolite's ten rows are drawn, in the existing 40-unit `HUD_LAYOUT.message` rectangle (two 20 px rows of `HUD_SMALL_FONT`). Moving or enlarging the area is ranked item 21 (R2, position), which stays open. The queue keeps all ten rows so a later layout change only changes the drawn count.
- A row's countdown starts at its first read by the HUD, as now: Oolite counts a row down only while `drawGUI` draws it. The 6 s repeat window is measured on the queue's clock, the flight time of its latest read.
- Long messages keep the existing `MAX_MESSAGE_CHARS` clamp; Oolite's word wrap into extra rows is not ported.
- The condition light's pulse (`HeadUpDisplay.m:2560`) and Oolite's exact colours are style (R3) and are not ported. Cascade weapons do not exist in Wegolite, so that clause has nothing to see; the CLASS_THARGOID clause is ported.
- The legality column heading is "Legal": Wegolite's market headings drop Oolite's trailing colons ("Commodity:" is "Commodity"). Owner call if the colon is wanted.
- Wegolite keeps no player kill count (the combat rating is in the LAW backlog), so the rating prints the new commander's count, 0, through a formatter that takes the count as a parameter.
- `CLOCK_START` stays as Oolite's `PLAYER_SHIP_CLOCK_START` because the save schemas use it as the lower bound of a saved clock; only the new-game start moves. Old saves keep loading and no save version changes.
- The final browser gate is `verify` (owner instruction) plus one targeted remote e2e run of the specs this plan edits or whose assertions read the changed messages, labels or target and that verify's fast subset (`scene`, `docking`, `save-load`, `probe-shape`) does not run.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@AGENTS.md
@.planning/quick/261117-nfn-compare-wegolite-ui-screens-with-real-oo/261117-nfn-SUMMARY.md
@.planning/todos/pending/2026-11-17-ui-flight-hud-differences-from-oolite.md
@.planning/todos/pending/2026-11-17-ui-station-screen-differences-from-oolite.md
@src/render/hud/messages.ts
@src/app/hud-model.ts

Reviewer and subagent brief (AGENTS.md, quoted; include it in any subagent prompt):

- **Tests and builds run in Docker only.** Host Node/npm/Playwright are not authoritative, and a green host run is not evidence.
- Commands: `docker compose run --rm test` (Vitest), `docker compose run --rm test npx vitest run <file>` (targeted), `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test <spec>"` (browser), `docker compose run --rm e2e-cross` (Firefox browser tests, outside verify), `docker compose run --rm typecheck`, `docker compose run --rm lint`, `docker compose run --rm verify` (full gate).
- A reproduction that needs a scratch script or test must live under `/tmp` and be mounted into the container: `docker compose run --rm -v /tmp/<dir>:/scratch test ...`. Never add scratch files to the repository.
- Read-only reviewers must not modify tracked files; report findings instead.

Working rules for this plan:
- Use the codebase-memory MCP index (project `wegolite`) before grepping (`search_graph`, `trace_path`, `get_code_snippet`); fall back to `rg` (never `grep`) for literals and non-code files. Include both instructions in any subagent prompt.
- Read Oolite behaviour from the local checkout `/home/opencode/git/oolite`; quote FIDELITY excerpts from the pin with `git -C /home/opencode/git/oolite show 7437f22:<path>`. Never fetch Oolite files over the network.
- Targeted Vitest, typecheck and lint may run in local Docker during the work. The final gates and every browser run happen ONLY on the remote machine through `/home/opencode/.claude/scripts/wegolite-remote-run.sh <docker compose args>`. It syncs the COMMITTED HEAD and wipes the remote tree on every run, so commit first and run the wrapper calls one after the other, never concurrently.
- Known flakes (rerun once before treating as real): `tools/oolite-ingest/convert/textures.test.ts` (5000 ms), e2e `launch.spec.ts:129` and `save-load.spec.ts:634`.
- The NPC acceptance run is not due: no file under `src/sim/npc/**` or `src/sim/world/**` and not `ships-npc.json` changes. `src/sim/combat/alert.ts` only reads the world. The clock feeds no NPC rule (`rg -n clockSeconds src/sim` shows only writes). State this in the SUMMARY.
- Pins that move (hashes, goldens, fixtures, expected strings) are re-pinned only with the traced cause written in the commit message and the SUMMARY.
- Commit each task separately (code, tests, CHANGELOG entry and that task's doc lines together, per AGENTS.md). Commit messages in English, ending with the attribution lines from the system reminder.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Oolite's message rows with per-message durations, and the condition light from Oolite's alert rule</name>
  <files>src/render/hud/messages.ts, src/render/hud/draw.ts, src/app/hud-model.ts, src/sim/combat/alert.ts, src/app/session/render-driver.ts, src/app/session/event-router.ts, src/app/session/hyperspace-controller.ts, src/app/game-session.ts, tests/hud/messages.test.ts, tests/hud/format.test.ts, tests/hud/clock-lines.test.ts, tests/sim/combat/alert.test.ts, tests/ui/hud-model.test.ts, tests/app/session-order.test.ts, tests/app/session/hyperspace-controller.test.ts, tests/app/session/render-driver.test.ts, tests/app/session/probe-publisher.test.ts, tests/app/session/sim-driver.test.ts, tests/app/session/tick-parity.test.ts, tests/app/session/world-lifecycle.test.ts, CHANGELOG.md, FIDELITY.md, .planning/PROJECT.md, .planning/todos/pending/2026-11-17-ui-flight-hud-differences-from-oolite.md</files>
  <read_first>src/render/hud/messages.ts, src/render/hud/draw.ts (lines 55-180 and 685-778), src/app/hud-model.ts, src/app/session/render-driver.ts (lines 230-325), src/app/session/event-router.ts (lines 140-525), src/app/session/hyperspace-controller.ts (lines 40-60, 115-140, 175-185, 255-265), src/app/game-session.ts (line 237), src/app/hints.ts (lines 1-60), src/sim/combat/shields.ts (cabinTempGauge, energyBanks), src/sim/combat/constants.ts (COBRA_MAX_ENERGY, SCANNER_MAX_RANGE, SHIP_MAX_CABIN_TEMP), src/sim/combat/state.ts, src/sim/world/entity.ts, src/sim/world/contacts.ts, src/sim/world/ids.ts (BEHAVIOUR_IDS, SCAN_CLASSES, PLAYER_ID), src/sim/npc/avoid.ts (steer.saved), src/sim/world/layout.ts (Body, SystemLayout), tests/hud/format.test.ts (lines 80-135), tests/app/session-order.test.ts (lines 265-285 and 540-610), tests/hud/clock-lines.test.ts, tests/contract/fidelity.test.ts (lines 40-50), FIDELITY.md (lines 1-20, the last Mechanics rows and E-90), and at the pin: Universe.m 6235-6240, 6258-6267, 6340-6355, 6400-6407; GuiDisplayGen.m 214, 736-766, 863-880, 1318-1340; PlayerEntityControls.m 1166-1175; PlayerEntity.h 220-230, 287; PlayerEntity.m 2894-2899, 2935-2993, 4330-4347, 5122-5144; ShipEntity.m 6398-6444, 6558-6631, 8399-8403; /home/opencode/git/oolite/Resources/Config/hud.plist (message_gui)</read_first>
  <behavior>
    - messages: with two hints posted (4 s each) and then "Hyperspeed mass-locked." (1.5 s), the first rows(t0, 2) returns the second hint on the upper slot and the J reply on the lower slot, both alpha 1, and current(t0) is the J reply.
    - messages: the J reply row has alpha 1 at t0 + 0.5, alpha 0.5 within 1e-9 at t0 + 1.0, is blank at t0 + 1.5, and then current() is the newest live row (the second hint); the blank slot stays in place (no compaction).
    - messages: an eleventh message scrolls the oldest out of the ten rows; size never exceeds ten and counts live rows only.
    - messages: the same text posted again less than 6 s (queue clock) after it was last shown adds no row; at 6 s it adds a row; after clearPrevious() it adds a row at once; a different text in between makes the repeat show (Oolite compares with the last shown message only).
    - messages: without a read (pause) no row expires; empty text and a non-finite or non-positive duration add nothing; clear() blanks every row and forgets the last shown message.
    - alert: no flags gives green; mass lock alone gives yellow; each of energy, heat, altitude and hostiles alone gives red; mass lock plus any of them gives red. Energy 63 sets the energy flag and 64 does not (max 256); heat level 0.9 does not and 0.9001 does; altitude dial 0.0999 does and 0.1 does not.
    - alert: dialAltitude picks the body with the smaller surface distance (the sun when it is nearer), returns (distance - radius) / 40000 clamped to 0..1, and returns 0 inside a body.
    - alert: hostilesNearPlayer is true for a live ship with an ATTACK_TARGET (or ATTACK_FLY_TO_TARGET_SIX, FLEE_TARGET, any listed hostile behaviour) whose target id is PLAYER_ID within 25,600 m; false beyond the range, for a target other than the player, for ATTACK_MINING_TARGET, for a dead entity and for an undefined world; true for AVOID_COLLISION whose saved behaviour is hostile; true for a CLASS_THARGOID entity in range.
    - hud-model: in flight, massLocked gives yellow, massLocked with options.hostiles gives red, combat energy 63 gives red, a position 3,000 m above the planet surface gives red, a pristine ship far from everything gives green; mode launching or docked gives green. messageRows passes through clamped to MAX_MESSAGE_CHARS; absent, a non-empty message gives one row with alpha 1.
    - session-order: the J refusal is posted with 1.5 s, the torus mass-lock stop with 4.5 s, the hyperspace refusals with 4.5 s after a clearPrevious, and a massLockChanged event posts nothing.
  </behavior>
  <action>
Write the failing tests first (tests/hud/messages.test.ts and tests/sim/combat/alert.test.ts are new; extend tests/ui/hud-model.test.ts and tests/app/session-order.test.ts), run them red in local Docker, then implement.

Messages (owner item 1, ranked row 1). Rewrite src/render/hud/messages.ts as Oolite's message rows, keeping it free of Date and performance (expiry runs on the flight clock passed in). Export MESSAGE_ROWS = 10 (hud.plist message_gui height 140 over row_height 14), MESSAGE_REPEAT_SECONDS = 6 (Universe.m:6353), keep MESSAGE_DURATION_SECONDS = 4 documented as Wegolite's duration for messages Oolite does not have, and export interface MessageRow with readonly text and alpha. createMessageQueue(rows = MESSAGE_ROWS) keeps a fixed array of row slots plus the last shown text, its repeat deadline and the queue clock. The MessageQueue interface becomes: enqueue(text, seconds) posts a message (ignored for empty text or a non-finite or non-positive duration; dropped when the text equals the last shown text and the queue clock is below the repeat deadline; otherwise every slot moves up one, the top slot falls off, the bottom slot takes the text with its duration and an unstarted countdown, and the last shown text and deadline update); clearPrevious() forgets the last shown text (Universe.m:6235-6240); advance(flightTime) sets the queue clock, starts the countdown of every unstarted live row and blanks rows whose time has run out; rows(flightTime, count) advances and returns the bottom count slots top to bottom, a blank slot as empty text with alpha 0 and a live row with alpha min(1, time left) (GuiDisplayGen.m:1334-1336); current(flightTime) advances and returns the text of the lowest live row or empty; clear() blanks all slots and forgets the last shown text; size counts live rows. Remove the old priority enqueue method entirely: in the row model every message shows at once. No comment may name the removed method. Rewrite the module doc comment around Oolite's model, citing the pin lines from the objective and stating the first-read countdown choice.

HUD drawing. In src/render/hud/draw.ts export HUD_MESSAGE_ROWS = 2 and add readonly messageRows: readonly MessageRow[] to HudModel (type import from ./messages.js); keep message (the newest text, published by the probe as hud.message). Replace the single message fillText with a loop over messageRows: slot i of HUD_MESSAGE_ROWS is centred at HUD_LAYOUT.message.y + HUD_LAYOUT.message.height x (2i + 1) / (2 x HUD_MESSAGE_ROWS), centred horizontally as now, HUD_COLOR, globalAlpha set to the row alpha and restored to 1 after the loop; blank rows draw nothing. HUD_LAYOUT and HUD_ELEMENTS stay unchanged.

Session wiring. src/app/game-session.ts creates the queue with the default row count. src/app/session/render-driver.ts: read rows = messages.rows(flightTime, HUD_MESSAGE_ROWS); during a countdown the bottom row is replaced by the countdown text at alpha 1 and message is the countdown text (Universe.m:6258-6267 writes the bottom row without scrolling); otherwise message is messages.current(flightTime). Pass rows as options.messageRows and options.hostiles = hostilesNearPlayer(ctx.core.worldLifecycle?.world, currentState.position). Hints post with MESSAGE_DURATION_SECONDS; a hint posted before a J press can no longer delay the reply, which keeps the first-use hints of commit 89c3b41 unchanged in content. src/app/session/event-router.ts and src/app/session/hyperspace-controller.ts: change the Pick types to enqueue and clearPrevious, and give every post its duration with a one-line pin citation: torusRefused 1.5 (PlayerEntityControls.m:1172), torusDisengaged by mass lock 4.5 (PlayerEntity.m:2757), weapon overheat and no energy 3 (5462, 5479), ident engaged 2 (PlayerEntityControls.m:4768), ident off and missiles safe 2 (1412, 1415), ident lock 4.5 (PlayerEntity.m:10917), target lost 3 (2838), hyperspace countdown cancelled 3 (PlayerEntityControls.m:1527), both dockDenied copies and the docking-computer engaged message 4.5 (PlayerEntityControls.m:4754), and every hyperspace refusal (the hyperspace flow and the unknown-destination refusal in hyperspace-controller.ts:181) calls clearPrevious() and then posts with 4.5 (PlayerEntity.m:6552-6600). Every other message (launching, the arrows hint, torus engaged and its input stop, compass target, the countdown start line, arrival, bounce and scrape copy) posts with MESSAGE_DURATION_SECONDS. The per-kind one-second throttles stay. Owner item 2 (ranked row 2): delete the massLockChanged case of createHudMessages that posts the lock-onset message (event-router.ts:344-345); Oolite posts nothing then. Update the stale doc comments that describe priority or a one-line FIFO.

Condition light (owner item 3, ranked row 3). Create src/sim/combat/alert.ts (pure, deterministic, no Three.js, no DOM, no content import): the ALERT_FLAG_* values and PLAYER_DIAL_MAX_ALTITUDE = 40_000 with header citations; HOSTILE_BEHAVIOURS as the BehaviourId list of IsBehaviourHostile (ATTACK_MINING_TARGET excluded) and isBehaviourHostile; AlertInputs { massLocked, energy, maxEnergy, heatLevel, altitudeDial, hostiles }; alertFlags(inputs) per PlayerEntity.m:2976-2993 (a non-finite number never sets its flag); flightAlertCondition(flags) returning "green" | "yellow" | "red" per the in-space branch of PlayerEntity.m:5129-5137 (docked is the F5 "Docked" string, `DOCKED_CONDITION` in src/ui/station-model.ts, and never reaches the HUD, which is hidden while docked); dialAltitude(position, layout) over layout.planet and layout.sun per PlayerEntity.m:4330-4347 and ShipEntity.m:6619-6631; hostilesNearPlayer(world, playerPosition) over the live, non-dead entities of the world store per PlayerEntity.m:2935-2950 and ShipEntity.m:6430-6444, reading the entity's behaviour, its saved condition (src/sim/npc/avoid.ts) and its nav target, with SCANNER_MAX_RANGE from src/sim/combat/constants.ts and PLAYER_ID from src/sim/world/ids.ts; a missile entity counts as hostile when it targets the player. Port only what Wegolite can evaluate; cascade weapons do not exist (say so in the header). In src/app/hud-model.ts replace the hard-coded green condition (line 222): in mode inFlight, condition = flightAlertCondition(alertFlags({ massLocked: state.torus.massLocked, energy: combat.energy, maxEnergy: COBRA_MAX_ENERGY, heatLevel: cabinTempGauge(combat), altitudeDial: dialAltitude(state.position, layout), hostiles: options.hostiles === true })); any other mode is green, because Oolite clears the flags outside space (PlayerEntity.m:2894-2899). Add messageRows and hostiles to HudModelOptions with doc comments.

Tests. Move the FIFO tests out of tests/hud/format.test.ts into the new row tests. Update the fakes and expectations in tests/app/session-order.test.ts (log each post as its text plus its duration, log clearPrevious, drop the two lock-onset entries), tests/app/session/hyperspace-controller.test.ts, render-driver.test.ts, probe-publisher.test.ts, sim-driver.test.ts, tick-parity.test.ts, world-lifecycle.test.ts and tests/hud/clock-lines.test.ts (new row positions), each with the traced cause.

Docs in this commit. CHANGELOG.md [Unreleased]: under Changed, messages now appear at once, each for its own time as in Oolite (the J reply when mass-locked shows at once for 1.5 s instead of waiting behind first-use hints), up to two lines with the newest at the bottom, fading out over their last second, and the same message repeated within 6 s shows once; the extra notice when a mass lock begins is gone. Under Fixed, the condition light: yellow while mass-locked, red when a ship attacks you, energy runs low, the cabin overheats or you fly within 4 km of a planet or sun surface, green otherwise. FIDELITY.md: add faithful Mechanics rows and verbatim pin excerpts E-92 GuiDisplayGen.m:751-766 (new message on the bottom row, scrolling up), E-93 GuiDisplayGen.m:1327-1336 (per-row countdown and last-second fade), E-94 Universe.m:6340-6355 (6 s repeat rule), E-95 PlayerEntityControls.m:1166-1175 (J reply 1.5 s), E-96 PlayerEntity.m:5122-5144 (condition from flags) and E-97 PlayerEntity.m:2976-2993 (flags), each pointing at the Wegolite line that implements it, at most 20 lines per excerpt, the table kept Prettier-formatted. The excerpt id pattern has two digits (tests/contract/fidelity.test.ts:45); do not widen it. .planning/PROJECT.md Key Decisions: add two rows, (a) "Replace the one-line FIFO HUD message line with Oolite's message rows, two drawn (owner decision 2026-11-17, quick 261117-pij)" with the rationale and the first-read and two-row choices, and (b) "Show Oolite's alert condition on the HUD now; the docking computer's red-alert refusal stays with DOCK-08 in the backlog (owner decision 2026-11-17, quick 261117-pij)", noting the unported pulse and cascade clause. In the flight-HUD todo prefix ranked items 1, 2 and 3 (and their Solution bullets) with "Done in quick task 261117-pij:" as item 20 was marked.
  </action>
  <verify>
    <automated>cd /home/opencode/git/wegolite && docker compose run --rm test npx vitest run tests/hud/messages.test.ts tests/hud/format.test.ts tests/hud/clock-lines.test.ts tests/sim/combat/alert.test.ts tests/ui/hud-model.test.ts tests/app/session-order.test.ts tests/app/session/hyperspace-controller.test.ts tests/app/session/render-driver.test.ts tests/app/session/probe-publisher.test.ts tests/app/session/sim-driver.test.ts tests/app/session/tick-parity.test.ts tests/app/session/world-lifecycle.test.ts tests/contract/fidelity.test.ts && docker compose run --rm typecheck && docker compose run --rm lint && test "$(rg -l 'Mass locked' src tests | wc -l)" -eq 0 && test "$(rg -l 'enqueuePriority' src tests | wc -l)" -eq 0 && test "$(rg -c 'condition: "green"' src/app/hud-model.ts || echo 0)" -eq 0 && test "$(rg --files src/sim/combat | rg -c 'alert\.ts$' || echo 0)" -eq 1 && test "$(rg -c '1\.5' src/app/session/event-router.ts || echo 0)" -ge 1 && test "$(rg -c '^### E-9[2-7] ' FIDELITY.md || echo 0)" -eq 6 && test "$(rg -c -i 'condition light' CHANGELOG.md || echo 0)" -ge 1  # gates: files with the lock-onset literal [HEAD=2 EXPECT==0]; files with the priority method [HEAD=6 EXPECT==0]; hard-coded green [HEAD=1 EXPECT==0]; alert.ts file count [HEAD=0 EXPECT==1]; 1.5 in event-router [HEAD=0 EXPECT>=1]; E-92..E-97 headings [HEAD=0 EXPECT==6]; 'condition light' in CHANGELOG [HEAD=0 EXPECT>=1]</automated>
  </verify>
  <done>The J reply shows at once for 1.5 s on the bottom row whatever was posted before it, every message has its own row and Oolite duration, the lock-onset message is gone, the condition light follows Oolite's flags in flight, the targeted tests, typecheck, lint and the FIDELITY contract pass in Docker, and the commit carries the CHANGELOG, FIDELITY E-92..E-97, the two PROJECT.md rows and the todo marks.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Station screens: Oolite's legality column, Cobra Mark III, rating with kill count, and ₢</name>
  <files>src/ui/station-model.ts, src/ui/station.ts, src/sim/player/profile.ts, tests/ui/station-market.test.ts, tests/ui/station-status.test.ts, tests/ui/station-outfitting.test.ts, tests/ui/station-footer.test.ts, tests/app/session/station-controller.test.ts, tests/sim/player-profile.test.ts, tests/e2e/station.spec.ts, tests/e2e/core-loop.spec.ts, tests/e2e/docking.spec.ts, tests/e2e/autosave.spec.ts, tests/e2e/scene.spec.ts, CHANGELOG.md, FIDELITY.md, .planning/todos/pending/2026-11-17-ui-station-screen-differences-from-oolite.md</files>
  <read_first>src/ui/station-model.ts (lines 70-150, 240-270, 300-375, 1020-1040), src/ui/station.ts (lines 220-245), src/sim/player/profile.ts (lines 1-40 and 90-110), src/content/schemas/commodity.ts (lines 35-50), tests/ui/station-market.test.ts, tests/ui/station-status.test.ts (lines 55-80, 210-250, 325-345), index.html (the font declarations at lines 40-150), and at the pin: PlayerEntity.m 9645-9692 and 7040-7085; OOConstToString.m 399-402; Resources/Config/descriptions.plist 476, 1624-1634; Resources/Scenarios/oolite-standard.oolite-save 560-580</read_first>
  <behavior>
    - Market: the column list ends with key legal and label Legal; slaves, narcotics and firearms print Im; food prints the em dash; a synthetic commodity with import 1 and export 0 prints Ex, and with both non-zero prints Re.
    - Status page 1: Ship is Cobra Mark III; Rating is the first rating label, three spaces, then (0), that is Harmless   (0); Cash is 100.0 ₢.
    - formatDecicredits(0), (1), (38), (123456789) give 0.0 ₢, 0.1 ₢, 3.8 ₢, 12345678.9 ₢; formatCredits(15000) gives 1500.0 ₢; the whole-credit removal label gives Remove Missile — 20 ₢; the market price difference uses ₢; confirmations read Buy 1 t Food for 3.8 ₢? [Y/N].
  </behavior>
  <action>
Tests first (the unit files above), red in local Docker, then implement.

Legality (owner item 5, ranked row 8). In src/ui/station-model.ts rename the market row's legality field (station-model.ts:108 and 261, read by station.ts:238) to legalText and the column key to legal with the label Legal (the table drops Oolite's trailing colon, as its other headings do). Compute legalText from both compiled fields exactly as PlayerEntity.m:9675-9690: import 0 and export 0 give the em dash "—" (oolite-legality-clear), import 0 and export non-zero give "Im" (oolite-legality-import, legal to import), import non-zero and export 0 give "Ex" (oolite-legality-export), both non-zero give "Re" (oolite-legality-neither); keep the four strings as named constants with descriptions.plist:1631-1634 citations. Update src/ui/station.ts to read legalText.

Labels (owner item 6, ranked rows 10, 11, 12). SHIP_NAME becomes "Cobra Mark III" (scenario ship_name and ship_class_name, oolite-standard.oolite-save:566-575). Add an exported formatRating(rating, kills) that returns Oolite's KillCountToRatingAndKillString format, the rating, three spaces and the count in parentheses (OOConstToString.m:401); the Rating field passes the first rating label and 0, with a comment that the profile has no kill count yet because the combat rating is in the LAW backlog (REQUIREMENTS.md LAW-01..LAW-07) and a new commander's ship_kills is 0. In src/sim/player/profile.ts change the unit of formatDecicredits and formatCredits to " ₢" (descriptions.plist:476 credits-format "[value] ₢") and update the doc comments that name the old unit; this is formatting only, no sim state changes. In src/ui/station-model.ts switch the whole-credit removal label helper (line 78) and the market price-difference text (lines 1031-1037) to ₢ and fix their comments. Every credit amount Wegolite prints then uses ₢, as Oolite's credits-format does. Font check: confirm with rg that the docked screens and the chart hover card use the same generic monospace stack in index.html; the hover card already renders M₢ in the 261117-nfn Wegolite screenshots, so record that in the SUMMARY (no font asset is added).

Tests and specs. Update the unit expectations listed in files and the e2e literals in tests/e2e/station.spec.ts (the cash, removal, confirmation, Ship and Rating expectations), core-loop.spec.ts (the sell confirmation regex), docking.spec.ts, autosave.spec.ts and scene.spec.ts (the 100.0 cash text), each to ₢ or the new label. Keep Playwright string matchers (they collapse whitespace) for the rating.

Docs in this commit. CHANGELOG.md [Unreleased]: under Changed, credits show as ₢ as in Oolite, the status screen names the ship Cobra Mark III and shows the kill count after the rating; under Fixed, the market's legality column is now Oolite's Legal column: Im marks goods that may be imported but not exported (slaves, narcotics, firearms), where Wegolite printed Ex, which in Oolite means the opposite. FIDELITY.md: add the faithful row E-98 PlayerEntity.m:9675-9690 (legality values) with its verbatim pin excerpt and the Wegolite line of the legalText computation. In the station todo prefix ranked items market legality, status rating, status ship name and currency (and their Solution bullets) with "Done in quick task 261117-pij:".
  </action>
  <verify>
    <automated>cd /home/opencode/git/wegolite && docker compose run --rm test npx vitest run tests/ui/station-market.test.ts tests/ui/station-status.test.ts tests/ui/station-outfitting.test.ts tests/ui/station-footer.test.ts tests/ui/station-system-data.test.ts tests/app/session/station-controller.test.ts tests/sim/player-profile.test.ts tests/contract/fidelity.test.ts && docker compose run --rm typecheck && docker compose run --rm lint && test "$(rg -n '[0-9}+] Cr\b|Cr vs avg' src tests | wc -l)" -eq 0 && test "$(rg -n 'exText' src tests | wc -l)" -eq 0 && test "$(rg -c 'Cobra Mark III' src/ui/station-model.ts || echo 0)" -ge 1 && test "$(rg -c '"Im"' src/ui/station-model.ts || echo 0)" -ge 1 && test "$(rg -c '₢' src/sim/player/profile.ts || echo 0)" -ge 1 && test "$(rg -c '^### E-98 ' FIDELITY.md || echo 0)" -eq 1  # gates: Cr amounts in src+tests [HEAD=61 EXPECT==0]; old legality field [HEAD=8 EXPECT==0]; Cobra Mark III in station-model [HEAD=0 EXPECT>=1]; Im value [HEAD=0 EXPECT>=1]; ₢ in profile.ts [HEAD=0 EXPECT>=1]; E-98 heading [HEAD=0 EXPECT==1]</automated>
  </verify>
  <done>The market's Legal column prints Oolite's values (Im for slaves, narcotics and firearms), F5 shows Cobra Mark III and the rating with its count, every credit amount uses ₢, the unit tests, typecheck, lint and the FIDELITY contract pass in Docker, and the e2e literals are updated for the remote run in Task 3.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: New-commander clock and hyperspace target, docs, and the remote gates</name>
  <files>src/sim/flight/state.ts, src/app/session/start-session.ts, tests/app/launch-sequence.test.ts, tests/app/session/start-session.test.ts, tests/hud/format.test.ts, tests/e2e/station.spec.ts, tests/e2e/probe-shape.spec.ts, tests/fixtures/probe-shape.json, CHANGELOG.md, FIDELITY.md, .planning/todos/pending/2026-11-17-ui-flight-hud-differences-from-oolite.md</files>
  <read_first>src/sim/flight/state.ts (lines 35-110), src/persistence/save.ts (lines 185-200 and 274-285), src/persistence/autosave.ts (lines 95-135 and 260-270), src/app/session/start-session.ts (lines 340-360 and 465-515), src/app/session/hyperspace-controller.ts (lines 115-121), src/sim/hyperspace/countdown.ts (lines 157-175), src/app/session/probe-publisher.ts (lines 325-345), tests/app/launch-sequence.test.ts (lines 130-180), tests/app/session/start-session.test.ts (lines 1-60), tests/e2e/station.spec.ts (lines 520-545), tests/e2e/probe-shape.spec.ts (lines 55-80), FIDELITY.md (the 261117-nfn Open items bullet), and at the pin: Resources/Scenarios/oolite-standard.oolite-save 560-580 and 810-816; OOStringParsing.m 402-413; PlayerEntity.m 6544-6580</read_first>
  <behavior>
    - initFlightState(layout).clockSeconds is 180058018403.9197 (NEW_GAME_CLOCK_SECONDS) and formatClock of it is 2084004:20:13:23; after the launch it is that plus 600; CLOCK_START is still 2084004 x 86400 and still the lower bound of a saved clock (a v4 save at CLOCK_START + 600 still validates).
    - The start-target rule: a new game gets the start system id; a restore keeps a saved target the catalogue knows; a restore without a target, or with an unknown one, has none.
  </behavior>
  <action>
Tests first, red, then implement.

Clock (owner item 4, ranked row 4). In src/sim/flight/state.ts add NEW_GAME_CLOCK_SECONDS = 180_058_018_403.9197 with a doc comment citing oolite-standard.oolite-save ship_clock (the clock a new standard commander loads, 2084004:20:13:23 after ClockToString's floor); initFlightState uses it. Keep CLOCK_START as Oolite's PLAYER_SHIP_CLOCK_START, and rewrite its doc comment: it is the floor the save schemas accept (save.ts SaveV1Schema onwards), not the new-game start. Saves floor the clock (autosave.ts:121), so the fractional start fits the integer schema; confirm every save path floors, and record in the SUMMARY that no save version changes and old saves still load. Update tests/app/launch-sequence.test.ts to the new start and add the start and format cases to tests/hud/format.test.ts. Then run the full unit suite once in local Docker (docker compose run --rm test npm run test:fast) and re-pin anything else the new start moves, each with its traced cause.

Hyperspace target (owner item 6, ranked row 7). The target is session state, not sim state. In src/app/session/start-session.ts extract and export a pure helper (for example resolveStartTarget(restoring, savedTarget, startSystemId, galaxyById)) implementing the behaviour above, and use it at the install site (lines 505-512): a new game installs ctx.core.system.id, as Oolite's standard scenario sets target_system_name to the start system Lave; restores keep the existing T-06-12 allow-list rule. Jumping to the current system is already refused as no target by canStartJump (countdown.ts:172-174), matching witchJumpChecklist (PlayerEntity.m:6570-6580), so no sim change. Test the helper in tests/app/session/start-session.test.ts. Update the new-game Hyperspace System expectation in tests/e2e/station.spec.ts (near line 530) to Lave. The probe now publishes chart.targetId and hyperspace.targetId in every New-game session sample: add those two string keys to the six session states of tests/fixtures/probe-shape.json and update the header comment of tests/e2e/probe-shape.spec.ts (lines 59-62) with the traced cause. Confirm the hand edit against the browser on the remote with one write-mode run that prints the fixture, run --rm e2e sh -lc "npm run build:e2e && WEGOLITE_PROBE_SHAPE_WRITE=1 npx playwright test --project=chromium tests/e2e/probe-shape.spec.ts && cat tests/fixtures/probe-shape.json" (after committing); copy nothing else from it without a traced cause.

Docs in this commit. CHANGELOG.md [Unreleased] Changed: a new commander's clock starts at 2084004:20:13:23 and the hyperspace target starts at Lave, as in Oolite; the hyperspace line on the HUD and on the status screen now names Lave instead of an unknown system. In the flight-HUD todo prefix ranked items 4 and 7 (and their Solution bullets) with "Done in quick task 261117-pij:". In FIDELITY.md's 261117-nfn Open items bullet, mark the fixed items as the 261117-o8q FOV item is marked: the J reply, the extra mass-lock message, the condition light, the clock start, the default hyperspace target, the legality column, the kill count, the ship name and the currency unit (fixed in quick task 261117-pij). The clock, the default target, the ship name and the currency come from Resources files, not src/Core, so they get no Mechanics row (the row pattern requires src/Core); say so in the SUMMARY.

Remote gates, after committing, one wrapper call at a time, each exit line quoted in the SUMMARY: /home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm test; then run --rm lint; then run --rm typecheck; then the probe-shape write-mode run above; then run --rm verify; then run --rm e2e sh -lc "npm run build:e2e && npx playwright test --project=chromium tests/e2e/station.spec.ts tests/e2e/autosave.spec.ts tests/e2e/core-loop.spec.ts tests/e2e/hud.spec.ts tests/e2e/hyperspace.spec.ts tests/e2e/combat.spec.ts" (the edited or message-reading specs outside verify's fast subset). A failure is fixed in a new commit and its gate rerun; a known flake is rerun once.
  </action>
  <verify>
    <automated>cd /home/opencode/git/wegolite && docker compose run --rm test npx vitest run tests/hud/format.test.ts tests/app/launch-sequence.test.ts tests/app/session/start-session.test.ts tests/persistence/save.test.ts tests/persistence/save-v4.test.ts tests/contract/fidelity.test.ts && docker compose run --rm typecheck && test "$(rg -c 'NEW_GAME_CLOCK_SECONDS = 180_058_018_403\.9197' src/sim/flight/state.ts || echo 0)" -eq 1 && test "$(rg -c 'export const CLOCK_START = 2_084_004 \* 86_400' src/sim/flight/state.ts || echo 0)" -eq 1 && test "$(rg -c '\(Unknown\)' tests/e2e/station.spec.ts || echo 0)" -eq 0 && test "$(rg -c '"targetId"' tests/fixtures/probe-shape.json || echo 0)" -eq 12 && test "$(rg -c '261117-pij' FIDELITY.md || echo 0)" -ge 1  # gates: new start constant [HEAD=0 EXPECT==1]; CLOCK_START line kept (GUARD MUTATION: it must stay the save-schema floor, src/persistence/save.ts:191-195); station.spec new-game unknown target [HEAD=1 EXPECT==0]; fixture targetId keys [HEAD=0 EXPECT==12]; 261117-pij in FIDELITY [HEAD=0 EXPECT>=1]. Then the remote chain in the action: test, lint, typecheck, probe-shape write run, verify, targeted e2e, each exit=0.</automated>
  </verify>
  <done>A new commander starts at 2084004:20:13:23 with Lave as the hyperspace target, old saves still load, the moved pins carry traced causes, the docs and todos are updated, and remote test, lint, typecheck, verify and the targeted e2e run are green on the committed HEAD with their exit lines in the SUMMARY.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| simulation events → HUD message rows | event payloads and hint text become drawn rows; a burst of events must not grow memory or block the reply |
| world entities → alert rule | the alert reads NPC behaviour, targets and positions each frame; malformed numbers must not break the HUD |
| saved blob → session target | a restored `targetSystem` comes from IndexedDB; the new-game default comes from the validated catalogue |
| local host → remote test machine (ssh) | the wrapper syncs only the committed HEAD and wipes the remote tree per run |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-pij-01 | Denial of service | `src/render/hud/messages.ts` | medium | mitigate | fixed ten row slots (oldest scrolls out), empty text and non-finite or non-positive durations rejected, the 6 s repeat rule drops identical floods; tests pin each case |
| T-pij-02 | Denial of service | `src/sim/combat/alert.ts`, `src/app/hud-model.ts` | low | mitigate | a non-finite energy, heat or altitude never sets a flag, an undefined world means no hostiles, dead entities are skipped; tests pin them |
| T-pij-03 | Tampering | `src/app/session/start-session.ts` target install | low | mitigate | a new game takes `ctx.core.system.id` from the validated catalogue; a restored target keeps the existing allow-list check (T-06-12); the helper's tests pin unknown and missing ids |
| T-pij-04 | Tampering | repository contents | low | mitigate | no scratch file, screenshot or Oolite output is committed; the probe-shape write run happens only in the remote tree and its printed output is compared, not copied wholesale |
| T-pij-05 | Repudiation | gate evidence | low | mitigate | the SUMMARY quotes every wrapper exit line with its snapshot SHA and the traced cause of every re-pinned value |
| T-pij-SC | Tampering | npm/pip/cargo installs | low | accept | this plan installs no packages; the existing images are used as they are |
</threat_model>

<verification>
- Tasks 1 and 2 verify commands pass in local Docker (targeted Vitest, typecheck, lint, FIDELITY contract).
- Task 3: the local targeted tests and the full local unit run pass; remote, against the committed HEAD, `test`, `lint`, `typecheck`, the probe-shape write run, `verify` and the targeted e2e run exit 0.
- No file under `src/sim/npc/**`, `src/sim/world/**` or `src/content/generated/ships-npc.json` changed (`git diff --stat <plan-start>..HEAD -- src/sim/npc src/sim/world src/content/generated/ships-npc.json` is empty), so the NPC acceptance run is not due.
</verification>

<success_criteria>
- The J reply shows at once for Oolite's 1.5 s on a two-row area of Oolite's message rows, every message uses Oolite's duration where it has one, hints never delay a reply, and the lock-onset message is gone.
- The condition light is green, yellow or red by Oolite's flags for every flag Wegolite can evaluate (mass lock, energy, heat, altitude, hostiles); the unported pulse and cascade clause are listed.
- The market Legal column, Cobra Mark III, the rating with its count and the ₢ unit match Oolite.
- A new commander starts at 2084004:20:13:23 with Lave targeted; saves keep loading.
- FIDELITY E-92..E-98, the Open items bullet, both todos, CHANGELOG and the two PROJECT.md rows are updated; remote gates are green.
</success_criteria>

<output>
Create `.planning/quick/261117-pij-fix-flight-hud-messages-condition-light-/261117-pij-SUMMARY.md` when done
</output>
