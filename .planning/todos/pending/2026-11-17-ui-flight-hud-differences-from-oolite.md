---
created: 2026-11-17T18:00:00.000Z
title: Bring the flight HUD and its messages closer to Oolite (UI comparison 261117-nfn)
area: ui
severity: normal
files:
  - src/render/hud/draw.ts
  - src/render/hud/messages.ts
  - src/render/hud/projection.ts
  - src/render/system-scene.ts
  - src/app/hud-model.ts
  - src/app/session/event-router.ts
  - src/app/session/hyperspace-controller.ts
  - src/sim/flight/state.ts
  - src/ui/station-model.ts
  - index.html
---

## Problem

Quick task 261117-nfn compared Wegolite's flight HUD with a running Oolite 1.93.1-255 (new commander at Lave,
1280x720, no traffic, the ship stopped just after the launch, J pressed while mass-locked). The pairs are
`flight`, `message` and `npc` in the local `/tmp/ooref-ui/compare.html` (not committed: the screenshots are
CC BY-NC-SA output). Differences, in rank order:

- Done in quick task 261117-pij: R1. The reply to J comes late. Wegolite showed "Hyperspeed mass-locked." 14.7 s after the press, behind
  "Mass locked" and two first-use hints, because the message line is one FIFO line with 4 s per message. Oolite
  shows it at once, for 1.5 s, in a multi-row message area. Oolite: `src/Core/Entities/PlayerEntityControls.m:1166-1175`
  (`addMessage:forCount:1.5`), `Resources/Config/hud.plist` `message_gui` (252x140, 14 px rows). Wegolite:
  `src/render/hud/messages.ts`, `src/app/session/event-router.ts:339-343`.
- Done in quick task 261117-pij: R1. Extra "Mass locked" message whenever the lock begins. Oolite has no such message; its only mass-lock string
  is `jump-mass-locked`. Wegolite: `src/app/session/event-router.ts:344-345`.
- Done in quick task 261117-pij: R1. The condition light is always green. Oolite turns it yellow while any alert flag is set (the mass lock
  included) and red with hostiles. Oolite: `src/Core/Entities/PlayerEntity.m:5122-5144`. Wegolite:
  `src/app/hud-model.ts:206`.
- Done in quick task 261117-pij: R1. Clock start. Wegolite starts at 2084004:00:00:00 (00:10:04 after the launch). Oolite's standard new
  commander starts at 2084004:20:13:24 (20:24:12 after the launch), from `ship_clock` 180058018403.9197 in
  `Resources/Scenarios/oolite-standard.oolite-save`; `PLAYER_SHIP_CLOCK_START` is only the fallback. Wegolite:
  `src/sim/flight/state.ts:89`.
- Done in quick task 261118-cyn: the hyperspace countdown is an overlay, not a message row (now Oolite's "Witchspace to Diso in 15 s." written into the bottom row each second with a 1 s row time; FIDELITY E-109). Since
  261117-u3m the countdown start clears the last message and scrolls nothing, as in Oolite, and the render driver
  draws the countdown text in place over the bottom drawn row every frame (owner instruction to keep the overlay).
  Oolite instead writes the countdown into the message rows with `displayCountdownMessage` and a 1 s row time,
  rewritten each second (`Universe.m:6258-6267`, `PlayerEntity.m:3443-3450`, through `printLineNoScroll`,
  `GuiDisplayGen.m:797-812`; rows count down in `GuiDisplayGen.m:1327-1336`). Differences: (1) Oolite's countdown
  row fades over each second, Wegolite's is at full alpha; (2) a message posted during the countdown shows in
  Oolite for at most a second before the next rewrite overwrites it, in Wegolite it takes the bottom row, which the
  overlay hides, and moves the older row up into view, so it is seen only if it outlives the countdown; (3) the message on the bottom row at the start is overwritten in Oolite, in
  Wegolite it is only hidden by the overlay and reappears after a cancel if it is still live; (4) after a cancel
  Oolite's last countdown text fades out above the abort over at most 1 s, Wegolite's overlay disappears at
  once. Wegolite: `src/app/session/render-driver.ts` (the countdown overlay),
  `src/app/session/event-router.ts` (`hyperspaceCountdownStarted`).
- Decided 2026-11-18 (owner): keep. R1. Extra text readouts "7.0 LY" beside FUEL and "0.000 LS" beside SPD. Oolite's default HUD draws only the bars
  (`hud.plist` `drawFuelBar:`, `drawSpeedBar:`). Wegolite: `src/render/hud/draw.ts`. No recorded decision; owner
  call whether to keep them.
- Open (later, owner 2026-11-18): R1. No scanner zoom indicator ("1:1", right of the scanner) and no scanner zoom. Oolite: `hud.plist`
  `drawScannerZoomIndicator:`. Wegolite: `src/render/hud/draw.ts`.
- Done in quick task 261117-pij: R1. No default hyperspace target. Wegolite prints "(Unknown)" on the HUD clock line and on F5; Oolite shows
  Lave, the current system, for a new commander. Wegolite: `src/render/hud/draw.ts:755`,
  `src/ui/station-model.ts:324`.
- Done in quick task 261117-o8q (commits a6aa69a, 130d109): R2. Forward-view FOV axis. Wegolite gave `PerspectiveCamera` a vertical FOV of 57.2°; Oolite applies 57.2°
  horizontally whenever the window is wider than 4:3 (`Universe.m:4440-4450` builds the frustum as
  `±fov` in x and `±aspect·fov` in y with `aspect = height / width`; `MyOpenGLView.m:1282-1290`). At 16:9
  Wegolite sees about 88° across, and everything ahead looks about 1.78 times smaller: the Viper at 1,500 m was
  about 22 px wide against about 40 px. Wegolite: `src/render/system-scene.ts:59,262`, the HUD projections that
  take `fovY` (`src/render/hud/projection.ts`) and `SCANNER_FOV_DEG` (`src/render/hud/draw.ts:52`).
  Measured after the fix at 1280x720, all three by one script: the Viper 1,500 m ahead is 40 px wide in Oolite,
  22 px in Wegolite before (`5a4e4cd`) and 40 px after (`e759fd2`), so after/Oolite is 1.00 and after/before 1.82.
- Done in quick task 261118-cyn (condition light and message area); clock decided 2026-11-18 (owner): stays at the top left. R2. Element positions. The clock and the hyperspace line are at the top left (Oolite: centred under the
  scanner); the condition light is at the top right (Oolite: left of the clock, under the scanner); the message
  line is centred below the scanner (Oolite: right of centre above it, `message_gui` x=128, y=-60). Oolite:
  `hud.plist` `drawClock:`, `drawStatusLight:`, `message_gui`. Wegolite: `src/render/hud/draw.ts:98-117`.
- Done in quick task 261118-cyn (the version text is hidden in flight; the system line stays by owner decision 2026-11-18): R2. The page overlay ("Wegolite 0.4.0", "Wegolite — Lave") stays visible in flight and overprints the clock
  and the hyperspace line. Wegolite: `index.html:1301-1305` (`#overlay`),
  `src/app/session/hyperspace-controller.ts:149-156`.
- Done in quick task 261118-cyn (Oolite's sizes at 2.25 design px per unit, the block resting on the disclaimer, HUD-ANCHOR option B): R2. HUD scale. At 1280x720 the scanner is 336x75 px against Oolite's 432x96 (`hud.plist` `drawScanner:` 288x64
  on a 640x480 design, scaled by height), the crosshair about 46 px against 96 px and the compass about 65 px
  against 44 px; the HUD block sits about 40 px higher, above the document footer. Wegolite:
  `src/render/hud/draw.ts:47-49` (504x112 on a 1920x1080 design).
- Done in quick task 261118-cyn: R3. The buoy blip is steady yellow; Oolite alternates it between green and yellow
  (`src/Core/Entities/ShipEntity.m:5667-5671`). Wegolite: `src/render/hud/draw.ts:239-250`.
- Done in quick task 261118-cyn: R3. Message text is green; Oolite's is yellow (`message_gui` `text_color`). Wegolite: `src/render/hud/draw.ts`.
- Done in quick task 261118-cyn: R3. Compass: a green ring with an orange dot and an "S" caption; Oolite a blue ring (`drawCompass:`
  `rgb_color` 0,0,1) with a red square marker. Wegolite: `src/render/hud/draw.ts`.
- Done in quick task 261118-cyn (plus a one-time safe-zone hint): R3. Aegis indicator: a boxed square captioned "AEGIS"; Oolite a green "S" glyph (`drawAegis:`). Wegolite:
  `src/render/hud/draw.ts`.

Matches: the bar set and order (FWD, AFT, FUEL, CT, LT, ALT, MISS, SPD, ROLL, PITCH, E1-E4), three missiles and
one empty pylon, the red scanner grid, the station and police blip colours, the crosshair colour and the message
text. Decided, not to fix: the hyperspace target on the clock line (PROJECT.md Key Decisions row "Put the
hyperspace target on the existing clock line"), the document footer (rows "Unify the docked, chart and Save/Load
footer…" and "Title the release Wegolite 0.1.0 from package.json") and the first-use hints themselves
(commit `89c3b41`).

## Solution

Likely changes, one per bullet:

- Done in quick task 261117-pij: Message area: show a refusal or failure at once (at least `enqueuePriority` for "Hyperspeed mass-locked."), and
  consider Oolite's multi-row area with per-message lifetimes (1.5 s for this one) instead of one FIFO line.
- Done in quick task 261117-pij: Drop the "Mass locked" message, or keep it only if the owner wants it as a Wegolite hint.
- Done in quick task 261117-pij: Derive the condition from the alert state: yellow while mass-locked (and the other yellow flags), red with
  hostiles, green otherwise.
- Done in quick task 261117-pij: Start a new game's clock at the standard scenario's `ship_clock`; check the save and hash pins that read the
  clock.
- Done in quick task 261118-cyn: Owner call on porting the countdown into the message rows (a no-scroll write of the bottom row with a 1 s row
  time each second) instead of the per-frame overlay (recorded in quick task 261117-u3m).
- Decided 2026-11-18 (owner): keep. Owner call on the fuel and speed readouts.
- Open (later, owner 2026-11-18): Add the scanner zoom indicator only together with scanner zoom (`key_scanner_zoom`), if it is wanted.
- Done in quick task 261117-pij: Default the hyperspace target to the current system on a new game, as Oolite does.
- Done in quick task 261117-o8q (commits a6aa69a, 130d109; Viper 40 px against Oolite's 40 px, was 22 px): Apply the 57.2° FOV horizontally when the aspect is wider than 4:3, as Oolite's frustum does, and update the
  HUD projections and their tests (`tests/render/launch-camera.test.ts`, `tests/hud/projection.test.ts`).
- Done in quick task 261118-cyn (the clock stays at the top left, decided 2026-11-18 by the owner): Move the clock, the condition light and the message line to Oolite's positions, and rescale the HUD
  to Oolite's height-based scale (a `HUD_LAYOUT` change that the pinned-layout tests must follow).
- Done in quick task 261118-cyn (only the version text, owner decision D-02): Hide `#overlay` in flight, or move it away from the clock.
- Done in quick task 261118-cyn: Flash the buoy blip, colour the message text yellow, and match the compass and aegis symbols.

## Open items found in quick task 261118-cyn

- The condition light's alpha pulse: Oolite draws the light at
  `0.333 * (2 + sin(time * 2.5 * alertCondition))` (`src/Core/HeadUpDisplay.m:2560` at 7437f22); Wegolite's is
  steady.
- Oolite's word wrap of a long message into a second row (`printLongText`, `GuiDisplayGen.m:736-766`); Wegolite
  clamps a long line to `MAX_MESSAGE_CHARS`.
- Below 16:9 the HUD letterboxes by width (the 1920x1080 design scaled by `min(width, height)`), where Oolite
  stays scaled by the window height down to 4:3 (`src/SDL/MyOpenGLView.m:498-505`).
- The scanner zoom and its "1:1" indicator stay open (later, owner 2026-11-18). The todo stays in `pending/`
  for them.
- Still visible at 1280x720: the overlay's system line ("Wegolite — Lave") overprints the clock's hyperspace
  line at the top left. Both stay by owner decision (D-01, D-02); recorded, not fixed.
