---
phase: quick
plan: 261118-cyn
type: execute
wave: 1
depends_on: []
files_modified:
  - src/render/hud/messages.ts
  - src/app/session/render-driver.ts
  - src/app/session/event-router.ts
  - src/render/hud/draw.ts
  - src/render/hud/hud.ts
  - src/render/hud/projection.ts
  - src/app/hud-model.ts
  - src/app/hints.ts
  - src/settings/schema.ts
  - index.html
  - tests/hud/messages.test.ts
  - tests/app/session/render-driver.test.ts
  - tests/hud/clock-lines.test.ts
  - tests/hud/projection.test.ts
  - tests/ui/hud-model.test.ts
  - tests/app/hints.test.ts
  - tests/e2e/hyperspace.spec.ts
  - tests/e2e/hud.spec.ts
  - CHANGELOG.md
  - FIDELITY.md
  - .planning/PROJECT.md
  - .planning/todos/pending/2026-11-17-ui-flight-hud-differences-from-oolite.md
autonomous: true
requirements: [FLGT-05]

estimate:
  tokens: 210000
  raw_tokens: 210000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "During a hyperspace countdown the bottom HUD message row reads Oolite's 'Witchspace to <destination> in <n> s.', written into the bottom row without scrolling once per second with a 1 s row time, so it pulses; a message posted during the countdown is overwritten at the next write; after a cancel the last count fades out within 1 s; the per-frame overlay is gone (D-09)"
    - "At 1280x720 the scanner is 432x96 px, the crosshair arms span 96 px and the compass ring is about 42 px across; the message area (ten rows, newest at the bottom, rows moving upward) sits above the scanner right of centre and the condition light sits under the scanner on the left beside the aegis glyph, at Oolite's hud.plist positions, within 4 px of Oolite's screenshots after the HUD-ANCHOR offset (D-03, D-04, D-05)"
    - "The clock and the hyperspace line stay at the top left where they are today (D-01)"
    - "In flight the version text 'Wegolite x.y.z' of the page overlay is not shown; the system line and every other overlay behaviour are unchanged (D-02)"
    - "The compass is Oolite's: a blue ring, the blip placed by the full 3D direction (a target dead ahead sits at the centre), a filled circle for the planet, a square for the station, Oolite's beacon diamond for the witchpoint, green in front and red behind, and no caption letter under the ring (D-06)"
    - "The aegis indicator is Oolite's green 'S' glyph, drawn only in docking range, with no AEGIS or PLANET caption; the first time the player is in docking range in flight a one-time hint explains it (D-07)"
    - "Buoy blips alternate green and yellow every 0.25 s, and message text is yellow (D-08)"
    - "The '7.0 LY' and '0.000 LS' readouts and the other colours stay; there is no scanner zoom or '1:1' indicator (D-10)"
  artifacts:
    - path: src/render/hud/messages.ts
      provides: "MessageQueue.displayCountdown: Oolite's displayCountdownMessage plus printLineNoScroll"
      contains: "displayCountdown"
    - path: src/render/hud/draw.ts
      provides: "HUD_LAYOUT and gauge geometry from hud.plist at 2.25 design px per unit; Oolite's compass, aegis and status-light drawings"
      contains: "HUD_LAYOUT"
    - path: src/render/hud/projection.ts
      provides: "projectToCompass normalising the full 3D direction (HeadUpDisplay.m drawCompass:)"
      contains: "projectToCompass"
    - path: src/app/hints.ts
      provides: "the one-time aegis safe-zone hint"
      contains: "aegis"
    - path: index.html
      provides: "the rule that hides the overlay's version line while the HUD canvas is shown"
      contains: "#hud:not([hidden]) ~ #overlay #title"
    - path: FIDELITY.md
      provides: "rows E-99 (countdown message), E-100 (HUD scale and anchor), E-101 (compass blip projection), E-102 (buoy flash)"
      contains: "E-99"
  key_links:
    - from: src/app/session/render-driver.ts
      to: src/render/hud/messages.ts
      via: "messages.displayCountdown(text, 1) on every frame while hyperspaceCountdown > 0"
      pattern: "displayCountdown\\("
    - from: src/app/hud-model.ts
      to: src/render/hud/projection.ts
      via: "buildCompass passes COMPASS_SIZE to projectToCompass"
      pattern: "COMPASS_SIZE"
    - from: src/app/hud-model.ts
      to: src/render/hud/draw.ts
      via: "scannerFlash in HudModel picks the buoy colour"
      pattern: "scannerFlash"
    - from: src/app/session/render-driver.ts
      to: src/app/hints.ts
      via: "showHint passes the docking-range flag in HintContext"
      pattern: "inDockingRange"
    - from: index.html
      to: src/app/session/render-driver.ts
      via: "the hidden attribute the driver sets on #hud drives the #title CSS rule"
      pattern: "hud:not\\(\\[hidden\\]\\)"
---

<objective>
Bring Wegolite's flight HUD to Oolite's scale, layout and symbols, and turn the hyperspace countdown into an
Oolite message row, as the owner finally decided on 2026-11-18 (locked decisions D-01 to D-10 below; they
replace the first brief where they differ). Source: the open items of
`.planning/todos/pending/2026-11-17-ui-flight-hud-differences-from-oolite.md` (comparison 261117-nfn).

Purpose: the HUD is the screen a player sees most; the comparison found it smaller, laid out differently and
with different symbols, and the countdown is a per-frame overlay that hides messages instead of Oolite's
pulsing message row.

Output: the countdown as a queue row (tracer, Task 1); the HUD in Oolite's geometry and symbols with the
version text hidden in flight (Task 2); the aegis hint, a measured visual comparison, docs and the remote
`verify-full` gate (Task 3).

Execution order: this plan EXECUTES AFTER quick task 261118-cyo (station screens and chart). Start by pulling
its commits, and re-read every file before editing it: `index.html`, `CHANGELOG.md`, `FIDELITY.md`,
`.planning/PROJECT.md`, the document footer and line numbers may have moved. Do not touch station or chart
files (`src/ui/station*`, `src/ui/chart*`, the station and chart parts of `index.html`).

Owner decisions 2026-11-18 (final, locked; every task cites them):

- D-01: the clock and its hyperspace line STAY at the top left (`HUD_LAYOUT.clock` unchanged). Do not move
  them.
- D-02: in flight hide only the version text ("Wegolite x.y.z", `#title` inside `#overlay`); the rest of the
  overlay keeps its behaviour.
- D-03: the message area moves ABOVE the scanner to Oolite's position (`hud.plist` `message_gui` x 128,
  y −60, 252x140, rows of 14), rows moving upward as new messages arrive, at the new scale.
- D-04: the condition light moves under the scanner on the left to Oolite's position (`drawStatusLight:`
  x −108, y 32), beside the aegis glyph (x −132, y 32); the compass is at x 132, y 32.
- D-05: the HUD takes Oolite's height-based scale: hud.plist is a 640x480 design scaled by window height
  (scanner 288x64 becomes 432x96 at 720 px, crosshair about 96 px, compass and the rest to match).
- D-06: the compass exactly as Oolite (`HeadUpDisplay.m:1455-1611`): blue ring; normalise the FULL 3D relative
  vector and take x, y times 0.4 x size, so a target dead ahead sits at the centre (Wegolite's
  `projectToCompass` normalises only x and y and keeps the blip on the 0.4 ring: a bug); blip shape by mode,
  green when in front (z ≥ 0), red behind; remove the caption letter under the compass.
- D-07: the aegis indicator is Oolite's green "S" glyph, drawn only in docking range
  (`HeadUpDisplay.m:1641-1644`); drop Wegolite's AEGIS and PLANET captions; ADD a one-time first-use hint
  when the player first enters docking range, "S: you are inside the station's safe zone", through the
  existing first-use hint system (commit `89c3b41`), recorded as a Wegolite-only addition.
- D-08: buoy blips alternate friendly and neutral colours as Oolite's (`ShipEntity.m:5667-5671`); message
  text yellow (`message_gui` `text_color`).
- D-09: the countdown becomes an Oolite message row: text "Witchspace to [destination] in [seconds] s."
  (`descriptions.plist` `witch-to-x-in-y-seconds`), written into the bottom row without scrolling once per
  second with a 1 s row time, so it pulses each second, through the queue (`Universe.m:6258-6267`
  `displayCountdownMessage`, `PlayerEntity.m:3443-3450`, `GuiDisplayGen.m:797-812` `printLineNoScroll`, row
  fade `GuiDisplayGen.m:1327-1336`); a message posted during the countdown is overwritten at the next tick;
  after a cancel the last countdown text fades out over at most 1 s; the per-frame overlay in the render
  driver is removed.
- D-10 (keep, record as decided): the "7.0 LY" and "0.000 LS" readouts and the current colours elsewhere; the
  scanner zoom and "1:1" indicator are later work (the open item in the todo).

Out of scope: moving the clock or hiding the system line (D-01, D-02); the abort text "Hyperspace countdown
cancelled" (Oolite's `witch-user-abort` differs; not in the owner's list); the sun and target compass modes,
which Wegolite does not have (`CompassMode` is auto, planet, station, witchpoint); the scanner zoom.
</objective>

<open_decision id="HUD-ANCHOR">
Found during planning and not covered by the owner's decisions; it needs the owner before Task 2 starts (the
orchestrator asks, then edits the `Chosen:` line below).

The document disclaimer (`body > footer` in `index.html`, `position: fixed; bottom: 0`, 80 % black) is about
62 px tall at 1280x720 (the links line and the disclaimer wrapped in two lines) and about 45 px at 1920x1080.
It is a recorded decision (PROJECT.md rows "Title the release Wegolite 0.1.0 from package.json" and "Unify
the docked, chart and Save/Load footer…"; 261117-nfn lists it as decided, "visible over the bottom of the
flight view"), and `tests/e2e/hud.spec.ts` asserts it stays visible in flight. Oolite's HUD reaches the
bottom edge: at 1280x720 the condition light, aegis glyph and compass centres sit at y 672, the missile icons
at 696 to 714, the MISS legend at 715, and the energy gauge ends at 707 (`/tmp/ooref-ui/oolite/screenshots/06-flight.png`).
At Oolite's exact positions the disclaimer (y 658 to 720) covers all of those; at 1920x1080 it still covers
the missile row, the MISS legend and the bottom of E4. Today's HUD avoids this by sitting about 40 px higher.

Options:

- A. Oolite's exact positions; accept that the disclaimer covers the bottom of the HUD.
- B (recommended). Oolite's sizes, spacing and horizontal positions; every HUD element except the crosshair,
  the ident frame and the top-left clock is drawn as one block whose bottom edge rests on the disclaimer's top
  edge instead of the window's bottom edge: a vertical lift equal to the measured disclaimer height (about
  62 px at 1280x720). Both recorded decisions hold; the comparison check is "Oolite's y minus the lift,
  within 4 px". FIDELITY records it as a divergence with a new PROJECT.md row.
- C. Shrink the HUD to fit above the disclaimer (scale = (height − disclaimer) / 480): the scanner becomes
  about 395x88 px at 1280x720 instead of 432x96. Contradicts D-05.
- D. Move the disclaimer to the top edge while the flight HUD is shown; the HUD sits exactly at Oolite's
  positions. Revises the recorded footer placement, collides with the top-left clock and overlay, and the
  chart overlay opened in flight reserves the bottom strip (chart files belong to 261118-cyo).

Chosen: B (owner, 2026-11-18): Oolite sizes and horizontal positions; the HUD block except the crosshair and the clock sits on the disclaimer strip's top edge; recorded as a divergence in FIDELITY and a PROJECT.md row.
</open_decision>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@AGENTS.md
@.planning/todos/pending/2026-11-17-ui-flight-hud-differences-from-oolite.md
@.planning/quick/261117-nfn-compare-wegolite-ui-screens-with-real-oo/261117-nfn-SUMMARY.md
@src/render/hud/draw.ts
@src/render/hud/messages.ts
@src/render/hud/hud.ts
@src/app/session/render-driver.ts

Reviewer and subagent brief (AGENTS.md, include verbatim in any subagent prompt):

- **Tests and builds run in Docker only.** Host Node/npm/Playwright are not authoritative, and a green host run
  is not evidence.
- Commands: `docker compose run --rm test` (Vitest), `docker compose run --rm test npx vitest run <file>`
  (targeted), `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test <spec>"` (browser),
  `docker compose run --rm e2e-cross` (Firefox browser tests, outside verify), `docker compose run --rm
  typecheck`, `docker compose run --rm lint`, `docker compose run --rm verify` (full gate).
- A reproduction that needs a scratch script or test must live under `/tmp` and be mounted into the container:
  `docker compose run --rm -v /tmp/<dir>:/scratch test ...`. Never add scratch files to the repository.
- Read-only reviewers must not modify tracked files; report findings instead.

Owner policy for this task:

- `test`, `lint`, `typecheck` and targeted Vitest run locally in Docker. `verify`, `verify-full` and every
  Playwright run go to the remote machine only, through
  `/home/opencode/.claude/scripts/wegolite-remote-run.sh <docker compose args>`, which syncs the COMMITTED
  HEAD (commit first; uncommitted edits are not sent). One remote run at a time. This is a render change, so
  the final gate is `verify-full` on the remote.
- Oolite reference: read behaviour and values from the local checkout `/home/opencode/git/oolite` (never fetch
  Oolite files, never clone another copy). FIDELITY excerpts come from the pinned commit,
  `git -C /home/opencode/git/oolite show 7437f22:<path>`; its line numbers can differ from the checkout's
  working tree (for example the scanner flash line is `HeadUpDisplay.m:1110` at 7437f22 and 1113 in the
  working tree).
- Use the codebase-memory MCP index (project `wegolite`) before grepping; prefer `rg` over `grep`.
- Documentation, commit messages and SUMMARY in English. Every user-visible change goes under
  `## [Unreleased]` in `CHANGELOG.md` in the same commit as the change.
- No file under `src/sim/npc/**` or `src/sim/world/**` changes, so the NPC acceptance run is not due.

Oolite HUD geometry (verified during planning against `/home/opencode/git/oolite`; re-read each source line
before using it). Oolite's HUD space wider than 4:3 is 480 units high, scaled by window height
(`src/SDL/MyOpenGLView.m:498-505`: `y_offset = 240`, `x_offset = 240 * width / height`); x is from the
centre, `y_origin = -1` measures y up from the bottom edge, no `y_origin` measures from the centre
(`src/Core/HeadUpDisplay.m:969-970`). Wegolite's design space stays 1920x1080, so one hud.plist unit is
1080 / 480 = 2.25 design px: design x = 960 + 2.25·x; design y = 1080 − 2.25·y for `y_origin = -1`, and
540 − 2.25·y for centre-anchored items. Bars are centred on (x, y) (`hudDrawBarAt`, `HeadUpDisplay.m:3181-3184`)
and `draw_surround` adds 2 units on each side. Working-tree line numbers below.

| Element | Source | Oolite (x, y, w, h) | Design centre | Design size / rect |
|---|---|---|---|---|
| scanner | `hud.plist:19-28` | 0, 68, 288, 64 | 960, 927 | rect 636, 855, 648, 144 |
| crosshair | `hud.plist:2-3`, `crosshairs.plist:45-51` (OTHER) | scale 32, arms 0.5 to 1.0 | 960, 540 | arms from 36 to 72 px out; rect 888, 468, 144, 144 |
| compass | `hud.plist:45-52`, `HeadUpDisplay.h:56-57`, `HeadUpDisplay.m:1455-1611` | 132, 32, siz 28 | 1257, 1008 | ring diameter 63 (`GLDrawOval` draws `siz` as the full size, `OOOpenGL.m:132-146`); rect 1225.5, 976.5, 63, 63 |
| aegis | `hud.plist:53-59`, `HeadUpDisplay.h:66-67`, `HeadUpDisplay.m:1638-1675` | −132, 32, 24, 24 | 663, 1008 | rect 636, 981, 54, 54 |
| condition | `hud.plist:191-198`, `HeadUpDisplay.m:2545-2595`, `3220-3234` | −108, 32, 8, 8 | 717, 1008 | rect 708, 999, 18, 18 |
| message | `hud.plist:368-380`, `GuiDisplayGen.m:1234` | 128, −60, 252, 140, rows 14 | 1248, 675 | rect 964.5, 517.5, 567, 315; ten rows of 31.5, centred text |
| SPD | `hud.plist:67-75` | 200, 95, 80, 8 | 1410, 866.25 | bar 180 x 18 |
| ROLL | `hud.plist:76-84` | 200, 80, 80, 6 | 1410, 900 | bar 180 x 13.5 |
| PITCH | `hud.plist:85-93` | 200, 70, 80, 6 | 1410, 922.5 | bar 180 x 13.5 |
| energy E1-E4 | `hud.plist:103-112` | 200, 35, 80, 48 | 1410, 1001.25 | 180 x 108 |
| FWD | `hud.plist:113-121` | −200, 94, 80, 8 | 510, 868.5 | 180 x 18 |
| AFT | `hud.plist:122-130` | −200, 78, 80, 8 | 510, 904.5 | 180 x 18 |
| yellow surround | `hud.plist:131-139` | −200, 46, 80, 40 | 510, 976.5 | 180 x 90 |
| FUEL, CT, LT, ALT | `hud.plist:140-181` | −200; 61, 51, 41, 31; 80 x 8 | 510; 942.75, 965.25, 987.75, 1010.25 | 180 x 18 each |
| missiles | `hud.plist:182-190` | −228, 16, 12 x 12, spacing 16 | first 447, 1044 | icon 27, spacing 36 |
| legends | `hud.plist:244-351` | LHS right-aligned at x −245, RHS left at x 242 | LHS right edge 408.75, RHS left 1504.5 | baselines: FWD 886.5, AFT 922.5, FUEL 956.25, CT 978.75, LT 1003.5, ALT 1026, MISS 1073.25, SPD 886.5, ROLL 918, PITCH 940.5 |

The clock is not in the table: it stays at `HUD_LAYOUT.clock` (D-01).

Text size: Oolite's glyphs advance about 0.42 of their cell ("Hyperspeed mass-locked." at cell 14 is 208 px
wide at 1280x720), so a monospace web font (advance 0.6 em) matches at about 1.6 x the hud.plist character
size in design px (12-unit legends near 19 px, 10-unit legends near 16 px, 14-unit legends and messages near
22 px). Task 3 calibrates against the Oolite screenshots and records the final sizes.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Tracer: the hyperspace countdown as an Oolite message row, queue to probe</name>
  <files>src/render/hud/messages.ts, src/app/session/render-driver.ts, src/app/session/event-router.ts, tests/hud/messages.test.ts, tests/app/session/render-driver.test.ts, tests/e2e/hyperspace.spec.ts, CHANGELOG.md</files>
  <read_first>
    - src/render/hud/messages.ts (the whole queue; `enqueue`, `advance`, `alphaOf`, `clear`)
    - src/app/session/render-driver.ts, the message-clock block and the HUD branch (about lines 241-310 at planning time)
    - src/app/session/event-router.ts, the countdown started and cancelled handlers (about lines 365-379)
    - tests/app/session/render-driver.test.ts, the describe block "renderFrame hyperspace countdown row (quick task 261117-u3m)"
    - tests/e2e/hyperspace.spec.ts, the countdown text wait (about lines 286-320)
    - /home/opencode/git/oolite/src/Core/Universe.m lines 6235-6267 (`clearPreviousMessage`, `displayMessage`, `displayCountdownMessage`)
    - /home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m lines 3426-3450 and src/Core/Entities/PlayerEntityControls.m lines 830-862, 1515-1530
    - /home/opencode/git/oolite/src/Core/GuiDisplayGen.m lines 797-812 (`printLineNoScroll`) and 1308-1336 (row fade)
    - /home/opencode/git/oolite/Resources/Config/descriptions.plist line 502 (`witch-to-x-in-y-seconds`)
  </read_first>
  <behavior>
    - displayCountdown("W 15", 1) on a queue whose bottom row holds "A" replaces that bottom row without scrolling: the row above is unchanged and "A" is gone (D-09).
    - A second displayCountdown with a different text less than 1 s (queue clock) after the last write is ignored; the same text after 1 s is ignored (equal to the last shown); a different text at or after 1 s writes the bottom row again.
    - The written row has a 1 s row time: rows(now + 0.5) gives it alpha 0.5 and it blanks at now + 1 (the pulse).
    - A message enqueued during the countdown scrolls the countdown row up one; the next countdown write overwrites the enqueued message on the bottom row while the scrolled countdown row keeps fading (D-09).
    - After the writes stop, clearPrevious then enqueue("Hyperspace countdown cancelled", 3) scrolls the last countdown row up, where it fades and blanks within 1 s (D-09).
    - clear() also resets the countdown repeat gate, so the first write after a Load always shows.
    - Render driver: with hyperspaceCountdown > 0 and a target, one renderFrame leaves the bottom model row equal to "Witchspace to <system name> in <countdownSecondsRemaining> s." at alpha 1, `model.message` equal to it, and the queue holding it (size counts it); a frame 0.5 s later on the message clock shows the same text at alpha 0.5; once the countdown is 0 no write happens and after more than 1 s no row starts with "Witchspace to".
  </behavior>
  <action>
Implements D-09. Start red: write the behaviour tests above in `tests/hud/messages.test.ts` and replace the
describe block "renderFrame hyperspace countdown row (quick task 261117-u3m)" in
`tests/app/session/render-driver.test.ts` with tests for the new behaviour (same `counting()` harness, titled
for quick task 261118-cyn). Run them and see them fail.

Queue (`src/render/hud/messages.ts`): add `displayCountdown(text: string, seconds: number): void` to the
`MessageQueue` interface and implementation, porting `displayCountdownMessage` (`Universe.m:6258-6267`) and
`printLineNoScroll` (`GuiDisplayGen.m:797-812`). Keep a second deadline, `countdownRepeatDeadline` (starts at
negative infinity), separate from the 6 s `repeatDeadline` of `enqueue`, as Oolite keeps
`countdown_messageRepeatTime` apart from `messageRepeatTime`. Ignore empty text and a non-finite or
non-positive duration. Write only when `text` differs from `lastShown` AND the queue clock is at or past
`countdownRepeatDeadline`; then set `lastShown = text`, `countdownRepeatDeadline = clock + seconds`, and
replace the LAST slot (the bottom row, Oolite's `currentRow`) with a fresh slot of that text and duration and
`expiresAt` null, without shifting the other slots. `clear()` also resets `countdownRepeatDeadline`. Document
the method in the header comment and the interface JSDoc with the Oolite citations; note that the shared
`lastShown` is Oolite's shared `currentMessage`.

Render driver (`src/app/session/render-driver.ts`): right after `messages.advance(messageClock)` and outside
the draw and docked gates (Oolite calls it from the update, not the draw, `PlayerEntity.m:3443-3450`), when
`currentState.hyperspaceCountdown > 0` and `currentState.hyperspaceTarget` is not null, call
`messages.displayCountdown` with the text of Oolite's `witch-to-x-in-y-seconds`: "Witchspace to ", the target
name from `galaxyById` (fallback "(Unknown)" as today), " in ", the seconds from `countdownSecondsRemaining`
(already Oolite's `round`), and " s.", with a row time of 1. In the HUD branch delete the countdown special
case: build `rows` from `messages.rows(messageClock, HUD_MESSAGE_ROWS)` and `message` from
`messages.current(messageClock)` unconditionally, and drop the comment about in-place drawing. Remove
now-unused locals or imports.

Event router (`src/app/session/event-router.ts`): keep `clearPrevious()` in both handlers; rewrite the
countdown-started comment to say the render driver writes the countdown into the queue each frame. Behaviour
unchanged.

e2e (`tests/e2e/hyperspace.spec.ts`): the countdown wait matches Oolite's text with the regex
`^Witchspace to Diso in \d+ s\.$` against `hud.message`. Re-pin only what this change moves and record each
moved assertion's cause in the commit message.

CHANGELOG `## [Unreleased]` `### Changed`: the countdown now reads like Oolite ("Witchspace to Diso in 15 s.")
in the message area, pulses once a second, gives way to other messages only until the next count, and fades
out after a cancel.

Run the targeted Vitest locally until green, then `docker compose run --rm lint` and `docker compose run --rm
typecheck`. Commit (`feat(quick-261118-cyn): ...`), then run the browser check on the remote.
  </action>
  <verify>
    <automated>docker compose run --rm test npx vitest run tests/hud/messages.test.ts tests/app/session/render-driver.test.ts</automated>
    <automated>/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/hyperspace.spec.ts"</automated>
    <automated>test "$(rg -l 'Hyperspace to \$\{' src | wc -l)" -eq 0   # files in src [HEAD=1 EXPECT==0]</automated>
    <automated>test "$(rg -c 'rows\[rows.length - 1\] =' src/app/session/render-driver.ts || echo 0)" -eq 0   # [HEAD=1 EXPECT==0]</automated>
    <automated>test "$(rg -c 'Witchspace to|displayCountdown\(' src/app/session/render-driver.ts || echo 0)" -ge 2   # [HEAD=0 EXPECT>=2]</automated>
  </verify>
  <done>
The countdown is a queue row with Oolite's text, a 1 s row time and a no-scroll write; the per-frame overlay
is gone; both unit files pass locally and `tests/e2e/hyperspace.spec.ts` passes on the remote against the
committed HEAD; lint and typecheck are green; the CHANGELOG entry is in the same commit.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: HUD in Oolite's geometry and symbols: scale, message area, condition light, compass, aegis, buoy flash, version text hidden in flight</name>
  <files>src/render/hud/draw.ts, src/render/hud/hud.ts, src/render/hud/projection.ts, src/app/hud-model.ts, index.html, tests/ui/hud-model.test.ts, tests/hud/projection.test.ts, tests/hud/clock-lines.test.ts, tests/e2e/hud.spec.ts, CHANGELOG.md</files>
  <precondition>The `Chosen:` line of the HUD-ANCHOR block in this plan names A, B, C or D (not PENDING); if it still reads PENDING, stop and return a checkpoint with the HUD-ANCHOR options for the owner.</precondition>
  <read_first>
    - this plan's HUD-ANCHOR block and the Oolite HUD geometry table in `<context>`
    - src/render/hud/draw.ts and src/render/hud/hud.ts (whole files)
    - src/render/hud/projection.ts, `projectToCompass` and the aegis caption helper below it
    - src/app/hud-model.ts, `buildCompass` and `buildHudModel` (scanner projection, model fields)
    - tests/ui/hud-model.test.ts, tests/hud/projection.test.ts, tests/hud/clock-lines.test.ts, tests/e2e/hud.spec.ts (every assertion on HUD_LAYOUT, the compass, the aegis and the message rows)
    - index.html, the `#overlay` CSS and markup (re-read: 261118-cyo ran before this)
    - /home/opencode/git/oolite/Resources/Config/hud.plist lines 1-392 and Resources/Config/crosshairs.plist lines 44-51
    - /home/opencode/git/oolite/src/Core/HeadUpDisplay.m lines 1108-1120 (scanner flash), 1455-1611 (compass and blips), 1638-1675 (aegis), 2545-2595 and 3220-3234 (status light)
    - /home/opencode/git/oolite/src/Core/Entities/ShipEntity.m lines 5655-5672 (buoy colours)
  </read_first>
  <behavior>
    - HUD_LAYOUT equals the geometry table's rects for scanner, crosshair, compass, aegis, condition and message; speed, roll, pitch and fuel cover their Oolite bar, legend and (speed, fuel) the kept readout; the clock rect is unchanged (D-01, D-03, D-04, D-05, D-10).
    - SCANNER_WIDTH x SCANNER_HEIGHT is 648 x 144, and the lollipop sizes are Oolite's 5 x 3 head, 3 left offset and 2 stalk units times 2.25 (D-05).
    - HUD_MESSAGE_ROWS equals MESSAGE_ROWS (10); a lone message is drawn centred on x 1248 in the tenth 31.5 px band of the message rect, in yellow (D-03, D-08).
    - projectToCompass with a target dead ahead returns (0, 0) and forward true; a target 90° to the right returns x = 0.4 x size, y = 0; a target 45° right and ahead returns x = 0.4 x size x sin 45°; a target behind returns forward false; a zero vector falls back to Oolite's +Z basis (0, 0, forward true) (D-06).
    - buildCompass passes COMPASS_SIZE 63, so a sideways target lands 25.2 design px from the compass centre (D-06).
    - scannerContactColor gives a "buoy" or "beacon" contact the friendly green when scannerFlash is true and the neutral yellow otherwise; other kinds ignore the flag (D-08).
    - The aegis glyph is drawn only for the "dockingRange" status and draws no text (D-07).
    - With a HUD-ANCHOR lift (option B) the crosshair, ident frame and clock stay where they are and every other element moves up by the lift; with a lift of 0 the drawing is the plain table (D-05).
  </behavior>
  <action>
Implements D-01 (no clock change), D-02, D-03, D-04, D-05, D-06, D-07 (glyph), D-08 and keeps D-10. First
re-pin the layout, compass, aegis and message tests to the values below and see them fail, then change the
code. Every re-pinned assertion gets its traced cause in the commit message (for example "D-05: hud.plist
scanner 288x64 at 2.25 px per unit").

Geometry (`src/render/hud/draw.ts`), D-03 to D-05: keep the 1920x1080 design space and the uniform letterbox
in `src/render/hud/hud.ts` (at 16:9 and wider it equals Oolite's height scale; Task 3 records narrower windows
as an open item). Replace the header's 1.75x story with the hud.plist unit rule (one unit is 2.25 design px,
the formulas in `<context>`). Set `SCANNER_WIDTH` 648, `SCANNER_HEIGHT` 144, the lollipop constants from
`HeadUpDisplay.m:1265-1275` times 2.25, and rewrite `HUD_LAYOUT` (all but `clock`) and every hard-coded gauge
coordinate (the left surround x, bar and legend y values, the energy surround, the missile row) from the
geometry table: bars 180 wide, Oolite heights, surrounds 4.5 px out, legends right-aligned at 408.75 on the
left and left-aligned at 1504.5 on the right at the table's baselines, energy banks inside the 180x108 gauge
as Oolite's `drawEnergyGauge:` splits them, missiles at 447 + 36·i on y 1044 with a 27 px icon. Name derived
values as constants with their hud.plist line in a comment. Keep the "7.0 LY" readout right-aligned left of
the FUEL legend and the "0.000 LS" readout right of the SPD legend (D-10). Give the gauge legends and the
message rows their own fonts sized per the `<context>` text-size note (Task 3 calibrates); the clock keeps
`HUD_SMALL_FONT` (D-01).

Crosshair (D-05): Oolite's `OTHER` crosshair, four arms from 36 to 72 design px out (scale 32, points 0.5 to
1.0), same colour and stroke as today.

Condition light (D-04): Oolite's octagon from `hudDrawStatusIconAt` (corners cut at a quarter of the 18 px
size) centred at 717, 1008, filled with today's green, amber or red (D-10 keeps the colours), outlined in grey
rgb(64, 64, 64). Oolite's alpha pulse is not ported; Task 3 records it as an open item.

Message area (D-03, D-08): `HUD_MESSAGE_ROWS = MESSAGE_ROWS` (imported from `./messages.js`); draw the rows
top to bottom in the ten 31.5 px bands of the message rect, newest in the bottom band, centred on x 1248, each
at its alpha, in a new `HUD_MESSAGE_COLOR` yellow rgb(255, 255, 0) (`message_gui` `text_color =
"yellowColor"`). Update the `HUD_MESSAGE_ROWS` doc comment.

Buoy flash (D-08): add `scannerFlash: boolean` to `HudModel`, computed in `buildHudModel`
(`src/app/hud-model.ts`) from the flight time as Oolite's `((int)(time * 4)) & 1` (`HeadUpDisplay.m:1113`).
`scannerContactColor(kind, flash)` returns `HUD_COLOR` (friendly) for "buoy" and "beacon" (both Oolite
CLASS_BUOY: the nav buoy and the witchpoint buoy) when the flag is set and the neutral yellow otherwise
(`ShipEntity.m:5667-5671`). Update every HudModel fixture in tests.

Compass (D-06): in `src/render/hud/projection.ts` make `projectToCompass` follow `drawCompass:`
(`HeadUpDisplay.m:1500-1509` in the working tree): rotate the relative vector into the ship frame, normalise
the full 3D vector (falling back to Oolite's +Z basis for a zero vector, `vector_normal_or_fallback`), then
x = nx·0.4·size and y = −ny·0.4·size in canvas coordinates; forward means Oolite's z ≥ 0 (Wegolite's −local.z
≥ 0). Rename the third parameter to `size` and fix its JSDoc. In `draw.ts` export `COMPASS_SIZE = 63`
(Oolite's `siz` of 28 units, `HeadUpDisplay.h:57`) in place of the radius constant, and `buildCompass` passes
it. Draw the ring with radius `COMPASS_SIZE / 2` in blue rgb(0, 0, 255) at twice the line width, the four cross
ticks from 0.125 to 0.375 of the size at half alpha, and the blip at the projected point with blip size
0.2 x 63 = 12.6: planet, a filled circle at 0.75 alpha plus outline in green when in front, a red outline only
when behind (`drawCompassPlanetBlipAt`); station, a square outline (`drawCompassStationBlipAt`); witchpoint,
Oolite's beacon diamond, lines at 0.6 of the blip size (`drawCompassBeaconBlipAt`), plus the beacon letter "W"
at the compass centre as `oo_drawHUDBeaconIconAt` draws the witchpoint buoy's beacon (code
"W0100 Navigation Buoy (Witchpoint)", `shipdata.plist:1113`). Colours green rgb(0, 255, 0) in front and red
rgb(255, 0, 0) behind (`SetCompassBlipColor`). Remove the caption letter under the ring. Wegolite has no sun
or target compass mode, so those blips are not added.

Aegis (D-07): drawn only for "dockingRange" (`HeadUpDisplay.m:1640-1641`). Replace the boxed squares and the
caption by Oolite's quad strip (the 32-number `strip` in `drawAegis:`), w = h = 54 / 16, vertex i at
(663 + w·strip[2i], 1008 + h·strip[2i+1]) because canvas y points down where Oolite's points up, filled as
consecutive quads in green rgb(0, 255, 0) at alpha 0.5 (Wegolite's overall alpha is 1). Delete the aegis
caption helper in `src/render/hud/projection.ts` (the function returning the AEGIS and PLANET strings), its
import in `draw.ts` and its test cases in `tests/hud/projection.test.ts`.

Anchor (HUD-ANCHOR): A, no lift. B, `hud.ts` reads the disclaimer height on each `resize()` (the
`--document-footer-height` custom property that `trackDocumentFooterHeight` in `src/main.ts` keeps exact, in
CSS px), converts it to design units (CSS px x DPR / scale) and passes it to `drawHud` as a lift; `drawHud`
draws the crosshair, ident frame, clock lines and flash unshifted and everything else inside one
`context.translate(0, -lift)`; `HUD_LAYOUT` and the probe bounds stay the plain table; add unit tests for lift
0 and a positive lift. C, compute the scale from the height above the disclaimer and anchor the block on its
top edge (same split). D, stop and report that it needs 261118-cyo's chart files. Every element stays inside
0..1920 x 0..1080 for `tests/e2e/hud.spec.ts`.

Version text (D-02, `index.html`): add one CSS rule right after the `#overlay` block,
`#hud:not([hidden]) ~ #overlay #title { visibility: hidden; }` (the HUD canvas precedes `#overlay` as a
sibling; the render driver sets `hidden` on `#hud` while docked). `visibility` keeps the system line where it
is. Touch nothing else in `index.html`.

CHANGELOG `## [Unreleased]` `### Changed`: the flight HUD now follows Oolite's size and layout (larger scanner,
crosshair and compass; messages in yellow above the scanner, right of centre, up to ten rows; the condition
light under the scanner beside the aegis indicator); the version text no longer shows in flight; buoys flash
green and yellow on the scanner; the compass is a blue ring whose marker moves to the centre as the target
comes dead ahead (it used to stay on a fixed circle); the aegis indicator is Oolite's "S". Mention the anchor
choice if it is B or C.

Run the targeted Vitest files, the full `docker compose run --rm test`, lint and typecheck locally; commit;
then run `tests/e2e/hud.spec.ts` and `tests/e2e/hyperspace.spec.ts` on the remote. If another e2e spec reads a
HUD pixel, rect or compass value that moved, re-pin it with the traced cause.
  </action>
  <verify>
    <automated>docker compose run --rm test npx vitest run tests/ui/hud-model.test.ts tests/hud/projection.test.ts tests/hud/clock-lines.test.ts tests/hud/messages.test.ts tests/app/session/render-driver.test.ts</automated>
    <automated>docker compose run --rm test && docker compose run --rm lint && docker compose run --rm typecheck</automated>
    <automated>/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/hud.spec.ts tests/e2e/hyperspace.spec.ts"</automated>
    <automated>test "$(rg -c '#hud:not\(\[hidden\]\) ~ #overlay #title' index.html || echo 0)" -eq 1   # [HEAD=0 EXPECT==1]</automated>
    <automated>test "$(rg -l 'aegisLabel' src tests | wc -l)" -eq 0   # files: projection.ts, draw.ts, projection.test.ts [HEAD=3 EXPECT==0]</automated>
    <automated>test "$(cat src/render/hud/draw.ts src/app/hud-model.ts | rg -c 'SCANNER_WIDTH = 648|COMPASS_SIZE|scannerFlash' || echo 0)" -ge 4   # [HEAD=0 EXPECT>=4]</automated>
  </verify>
  <done>
`HUD_LAYOUT` (all but the clock) and every gauge coordinate follow the hud.plist table at 2.25 px per unit with
the chosen anchor; ten yellow message rows sit above the scanner; the condition light sits beside the aegis
glyph; the compass projects the full 3D direction with Oolite's ring and blips and no caption; the aegis glyph
has no caption; buoys flash; the version text is hidden in flight; readouts and other colours are unchanged;
local test, lint and typecheck and the remote `hud.spec.ts` and `hyperspace.spec.ts` are green against the
committed HEAD.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Aegis safe-zone hint, measured comparison with Oolite at 1280x720, docs, and verify-full on the remote</name>
  <files>src/app/hints.ts, src/settings/schema.ts, src/app/session/render-driver.ts, tests/app/hints.test.ts, src/render/hud/draw.ts, tests/hud/clock-lines.test.ts, CHANGELOG.md, FIDELITY.md, .planning/PROJECT.md, .planning/todos/pending/2026-11-17-ui-flight-hud-differences-from-oolite.md</files>
  <read_first>
    - src/app/hints.ts (whole file), src/settings/schema.ts (`HintId`, `HINT_IDS`), tests/app/hints.test.ts, tests/settings/schema.test.ts
    - src/app/session/render-driver.ts, `showHint`
    - src/sim/world/aegis.ts (`aegisStatus`)
    - .planning/quick/261117-nfn-compare-wegolite-ui-screens-with-real-oo/261117-nfn-SUMMARY.md sections "Conditions", "Deviations from Plan" and "Remote gates" (the scratch-spec method)
    - /tmp/ooref-ui/wego-src/ui-capture.spec.ts (the capture spec to adapt) and /tmp/ooref-ui-tools/crop.py
    - /tmp/ooref-ui/oolite/screenshots/06-flight.png and 07-message.png
    - FIDELITY.md: "How to check a row", rows E-91 to E-94, the last excerpt (E-98 at planning time), the "Open items" bullet for 261117-nfn; tests/contract/fidelity.test.ts
  </read_first>
  <behavior>
    - maybeShow returns "S: you are inside the station's safe zone" once, the first time the context is inFlight with inDockingRange true and no earlier hint is due; never while docked, never again in the session, and never once the id is in the seen list (D-07).
    - The new hint id is in HINT_IDS, so a stored settings blob listing it validates and an older blob without it still validates (tests/settings/schema.test.ts stays green).
    - The existing hints keep their order and texts; the aegis hint comes after them.
  </behavior>
  <action>
Aegis hint (D-07, Wegolite-only): add the id "aegis" to `HintId` and `HINT_IDS` in `src/settings/schema.ts`
(additive: old settings stay valid; unknown ids are already filtered). In `src/app/hints.ts` add
`inDockingRange: boolean` to `HintContext`, the text "S: you are inside the station's safe zone" in
`hintText`, and take it in `maybeShow` after the pitch-and-roll hint when the mode is inFlight and
`inDockingRange` is true; it teaches a fact, not a control, so mark it seen when it is shown. In
`showHint` (`src/app/session/render-driver.ts`) set `inDockingRange` from `aegisStatus(currentState.position,
ctx.core.layout) === "dockingRange"` (`src/sim/world/aegis.ts`; the same rule that draws the glyph). Tests first
in `tests/app/hints.test.ts`. Grep `tests/e2e` for hard-coded hint lists or hint-count assertions
(`hintsSeen`, `probe.hint`); where a spec suppresses hints by listing ids rather than `HINT_IDS`, add the new
id, and record the cause. CHANGELOG `### Added`: the safe-zone hint. Run the targeted Vitest, test, lint,
typecheck; commit.

Visual comparison (D-03 to D-09): write a scratch Playwright spec under `/tmp/cyn-capture/` (never in the
repository), adapted from `/tmp/ooref-ui/wego-src/ui-capture.spec.ts`: a new commander at Lave, viewport
1280x720, launch, stop as 261117-nfn did, then `flight.png`; press J and shoot `message.png`; commit Diso as
the target (as `commitTarget` in `tests/e2e/hyperspace.spec.ts` does), press H and shoot `countdown-early.png`
just after a count changes and `countdown-late.png` about 0.7 s later; log `hud.messageRows` with the message
clock for 3 s of countdown. Run it on the remote as 261117-nfn did (copy the scratch directory to the remote
`/tmp`, mount it with `-v <dir>:/scratch` on the `e2e` service, copy the spec into the synced tree's
`tests/e2e/` inside the container, `npm run build:e2e && npx playwright test <spec> --workers=1`, fetch the
PNGs, remove the remote scratch directory through a throwaway container). Measure with
`/tmp/ooref-ui-tools/crop.py` and by viewing the images: scanner ellipse width, height and centre; crosshair arm
span; compass ring diameter and centre; condition light and aegis centres; message text centre and width
("Hyperspeed mass-locked."); missile row y; SPD and FWD bar rects. Compare with `06-flight.png` and
`07-message.png` (subtract the HUD-ANCHOR lift from Wegolite's y under option B). Every position and size must
be within 4 px; where only a text size misses (message 208 px wide in Oolite), adjust the font constants in
`src/render/hud/draw.ts`, re-pin `tests/hud/clock-lines.test.ts`, re-run the targeted Vitest, commit and
recapture. Confirm the countdown shots show the pulse (alpha near 1 early, lower late) and that the version
text is absent in flight. Record a table of Oolite px, Wegolite px and difference in the SUMMARY. The Oolite
screenshots stay in `/tmp` (CC BY-NC-SA output, never committed).

FIDELITY.md: add rows, each with its excerpt copied verbatim from the pinned commit (`git -C
/home/opencode/git/oolite show 7437f22:<path>`, at most 20 lines, numbered after the last existing excerpt):
E-99 "HUD hyperspace countdown: Oolite's text written into the bottom message row without scrolling, only when
it changed and its 1 s repeat time has passed, with a 1 s row time (FLGT-05)", Wegolite cell the
`displayCountdown` line in `src/render/hud/messages.ts`, Oolite `src/Core/Universe.m:6258-6267`, faithful;
E-100 "HUD scale and anchor: hud.plist's 480-unit height scaled to the window height at 16:9 and wider, x from
the centre, y from the bottom edge (FLGT-05)", Wegolite the `HUD_LAYOUT` line in `src/render/hud/draw.ts`,
Oolite `Resources/Config/hud.plist:19-28`, faithful under option A, otherwise a divergence naming a new
PROJECT.md Key Decisions row that records the owner's HUD-ANCHOR choice of 2026-11-18 and its reason, and
noting the top-left clock (D-01, owner 2026-11-18) in the same row; E-101 "Compass blip: the 3D direction to
the target in the ship frame, normalised, x and y times 0.4 of the compass size (FLGT-05)", Wegolite the
`projectToCompass` line, Oolite `src/Core/HeadUpDisplay.m:1500-1507` at 7437f22, faithful; E-102 "Scanner buoy
colour alternates friendly and neutral on a 0.25 s flash (FLGT-05)", Wegolite the `scannerContactColor` line,
Oolite `src/Core/Entities/ShipEntity.m:5667-5671`, faithful. Update E-92's mechanic text (ten rows kept and
drawn) and every Wegolite line cell that moved (E-91 to E-94 and any row pointing into the changed files). In
the 261117-nfn Open-items bullet append "(fixed in quick task 261118-cyn)" after the condition-light and
message positions and the scale, state that the version text is hidden in flight and the clock stays by owner
decision, that the buoy, message colour, compass and aegis items are fixed, and that the readouts are decided
(D-10). Add a PROJECT.md Key Decisions row for the Wegolite-only safe-zone hint and one for the top-left clock
(owner 2026-11-18). Run `docker compose run --rm test npx vitest run tests/contract/fidelity.test.ts` and the
prettier check below.

Todo (D-10): in `.planning/todos/pending/2026-11-17-ui-flight-hud-differences-from-oolite.md` prefix the done
items and their Solution bullets with "Done in quick task 261118-cyn:" (countdown row, message and condition
positions, scale, version text, buoy, message colour, compass, aegis); mark the clock position "Decided
2026-11-18 (owner): stays at the top left" and the readouts "Decided 2026-11-18 (owner): keep"; keep the
scanner zoom and "1:1" indicator as the open item ("later, owner 2026-11-18"). Add the open items found here:
the condition light's alpha pulse (`HeadUpDisplay.m:2562`), Oolite's word wrap of a long message into a second
row, and the HUD letterbox for windows narrower than 16:9 (Oolite stays height-scaled down to 4:3,
`MyOpenGLView.m:498-505`). The todo stays in `pending/` because the zoom item is open.

Commit the docs (`docs(quick-261118-cyn): ...`). Then run `verify-full` on the remote against that commit (one
remote run at a time; run it in the background and wait for its exit line). If it fails, fix, commit and rerun;
record every run's exit line and elapsed time in the SUMMARY. Finally confirm `git status` shows no scratch
file and that no Oolite screenshot is tracked.
  </action>
  <verify>
    <automated>docker compose run --rm test npx vitest run tests/app/hints.test.ts tests/settings/schema.test.ts tests/contract/fidelity.test.ts tests/hud/clock-lines.test.ts</automated>
    <automated>docker compose run --rm lint npx prettier --check FIDELITY.md .planning/PROJECT.md CHANGELOG.md</automated>
    <automated>/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm verify-full</automated>
    <automated>test "$(rg -c '^### E-99 src/Core/Universe.m:6258-6267' FIDELITY.md || echo 0)" -eq 1   # [HEAD=0 EXPECT==1]</automated>
    <automated>test "$(cat src/app/hints.ts src/settings/schema.ts | rg -c 'safe zone|"aegis"' || echo 0)" -ge 2   # [HEAD=0 EXPECT>=2]</automated>
    <automated>S=$(git status --porcelain --untracked-files=all) && L=$(git ls-files) && test -z "$(printf '%s\n' "$S" | rg -v '261118-cyn')" && test "$(printf '%s\n' "$L" | rg -c 'ooref|cyn-capture' || echo 0)" -eq 0   # stray scratch or Oolite captures [HEAD=0 EXPECT==0 GUARD MUTATION: copying /tmp/cyn-capture/flight.png into tests/e2e/ turns it red]</automated>
  </verify>
  <done>
The safe-zone hint shows once in docking range and is recorded as Wegolite-only; the SUMMARY holds the
1280x720 measurement table (every item within 4 px of Oolite, after the HUD-ANCHOR lift when one applies) and
the countdown pulse evidence; FIDELITY.md has E-99 to E-102 and passes its contract test; PROJECT.md has the
new Key Decisions rows; the todo marks the done, decided and open items; the CHANGELOG entries are in their
change commits; the remote `verify-full` exits 0 against the final committed HEAD; no scratch or Oolite
artefact is tracked.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| repository ← /tmp scratch | scratch specs and Oolite screenshots (CC BY-NC-SA output) live next to the working tree |
| Oolite source → Wegolite code | geometry numbers, the compass projection and the aegis strip are transcribed from Oolite files |
| stored settings → hint controller | the persisted seen-hint list gains one allowlisted id |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261118-cyn-01 | Tampering | repository contents | medium | mitigate | Task 3 checks `git status` and `git ls-files` for stray scratch files and captures before the final commit; scratch lives only under `/tmp` and the remote scratch directory is removed |
| T-261118-cyn-02 | Repudiation | provenance of transcribed values | low | mitigate | every Oolite number carries its file and line in a code comment; FIDELITY rows E-99 to E-102 quote the pinned commit verbatim and pass `tests/contract/fidelity.test.ts` (the Oolite source is GPL-2.0-or-later, as the project) |
| T-261118-cyn-03 | Tampering | settings `hintsSeen` | low | mitigate | the new id joins `HINT_IDS`, the existing allowlist that `validateSettings` already filters against; `tests/settings/schema.test.ts` keeps an old blob valid |
| T-261118-cyn-04 | Denial of service | HUD draw loop | low | mitigate | the anchor lift is read in `resize()`, not per frame, so no per-frame style recalculation is added |
| T-261118-cyn-SC | Tampering | npm installs | low | accept | no package is installed or upgraded in this task |
</threat_model>

<verification>
- Task 1: the countdown is a queue row (unit tests; `tests/e2e/hyperspace.spec.ts` on the remote).
- Task 2: HUD geometry, compass projection, symbols and the version-text rule (unit tests;
  `tests/e2e/hud.spec.ts` on the remote).
- Task 3: the safe-zone hint (unit tests), the 1280x720 measurement table against
  `/tmp/ooref-ui/oolite/screenshots/06-flight.png` and `07-message.png`, the fidelity contract test, and
  `verify-full` on the remote against the final HEAD.
- Local gates after every code commit: `docker compose run --rm test`, `docker compose run --rm lint`,
  `docker compose run --rm typecheck`.
</verification>

<success_criteria>
- D-01 to D-09 implemented as the owner decided, D-10 kept, HUD-ANCHOR answered by the owner and applied.
- Every moved HUD position and size within 4 px of Oolite at 1280x720 (after the lift when one applies),
  recorded in the SUMMARY; the clock unchanged.
- The countdown pulses once a second, nothing hides it for longer than a second, and it fades out after a
  cancel.
- `verify-full` on the remote exits 0 against the final committed HEAD; no scratch or Oolite artefact tracked.
</success_criteria>

<output>
Create `.planning/quick/261118-cyn-bring-the-flight-hud-layout-scale-symbol/261118-cyn-SUMMARY.md` when done,
with the HUD-ANCHOR choice, the measurement table, the countdown evidence, every re-pinned test with its cause,
and every remote run's exit line.
</output>
