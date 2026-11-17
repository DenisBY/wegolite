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

- R1. The reply to J comes late. Wegolite showed "Hyperspeed mass-locked." 14.7 s after the press, behind
  "Mass locked" and two first-use hints, because the message line is one FIFO line with 4 s per message. Oolite
  shows it at once, for 1.5 s, in a multi-row message area. Oolite: `src/Core/Entities/PlayerEntityControls.m:1166-1175`
  (`addMessage:forCount:1.5`), `Resources/Config/hud.plist` `message_gui` (252x140, 14 px rows). Wegolite:
  `src/render/hud/messages.ts`, `src/app/session/event-router.ts:339-343`.
- R1. Extra "Mass locked" message whenever the lock begins. Oolite has no such message; its only mass-lock string
  is `jump-mass-locked`. Wegolite: `src/app/session/event-router.ts:344-345`.
- R1. The condition light is always green. Oolite turns it yellow while any alert flag is set (the mass lock
  included) and red with hostiles. Oolite: `src/Core/Entities/PlayerEntity.m:5122-5144`. Wegolite:
  `src/app/hud-model.ts:206`.
- R1. Clock start. Wegolite starts at 2084004:00:00:00 (00:10:04 after the launch). Oolite's standard new
  commander starts at 2084004:20:13:24 (20:24:12 after the launch), from `ship_clock` 180058018403.9197 in
  `Resources/Scenarios/oolite-standard.oolite-save`; `PLAYER_SHIP_CLOCK_START` is only the fallback. Wegolite:
  `src/sim/flight/state.ts:89`.
- R1. Extra text readouts "7.0 LY" beside FUEL and "0.000 LS" beside SPD. Oolite's default HUD draws only the bars
  (`hud.plist` `drawFuelBar:`, `drawSpeedBar:`). Wegolite: `src/render/hud/draw.ts`. No recorded decision; owner
  call whether to keep them.
- R1. No scanner zoom indicator ("1:1", right of the scanner) and no scanner zoom. Oolite: `hud.plist`
  `drawScannerZoomIndicator:`. Wegolite: `src/render/hud/draw.ts`.
- R1. No default hyperspace target. Wegolite prints "(Unknown)" on the HUD clock line and on F5; Oolite shows
  Lave, the current system, for a new commander. Wegolite: `src/render/hud/draw.ts:755`,
  `src/ui/station-model.ts:324`.
- R2. Forward-view FOV axis. Wegolite gives `PerspectiveCamera` a vertical FOV of 57.2°; Oolite applies 57.2°
  horizontally whenever the window is wider than 4:3 (`Universe.m:4440-4450` builds the frustum as
  `±fov` in x and `±aspect·fov` in y with `aspect = height / width`; `MyOpenGLView.m:1282-1290`). At 16:9
  Wegolite sees about 88° across, and everything ahead looks about 1.78 times smaller: the Viper at 1,500 m was
  about 22 px wide against about 40 px. Wegolite: `src/render/system-scene.ts:59,262`, the HUD projections that
  take `fovY` (`src/render/hud/projection.ts`) and `SCANNER_FOV_DEG` (`src/render/hud/draw.ts:52`).
- R2. Element positions. The clock and the hyperspace line are at the top left (Oolite: centred under the
  scanner); the condition light is at the top right (Oolite: left of the clock, under the scanner); the message
  line is centred below the scanner (Oolite: right of centre above it, `message_gui` x=128, y=-60). Oolite:
  `hud.plist` `drawClock:`, `drawStatusLight:`, `message_gui`. Wegolite: `src/render/hud/draw.ts:98-117`.
- R2. The page overlay ("Wegolite 0.4.0", "Wegolite — Lave") stays visible in flight and overprints the clock
  and the hyperspace line. Wegolite: `index.html:1301-1305` (`#overlay`),
  `src/app/session/hyperspace-controller.ts:149-156`.
- R2. HUD scale. At 1280x720 the scanner is 336x75 px against Oolite's 432x96 (`hud.plist` `drawScanner:` 288x64
  on a 640x480 design, scaled by height), the crosshair about 46 px against 96 px and the compass about 65 px
  against 44 px; the HUD block sits about 40 px higher, above the document footer. Wegolite:
  `src/render/hud/draw.ts:47-49` (504x112 on a 1920x1080 design).
- R3. The buoy blip is steady yellow; Oolite alternates it between green and yellow
  (`src/Core/Entities/ShipEntity.m:5667-5671`). Wegolite: `src/render/hud/draw.ts:239-250`.
- R3. Message text is green; Oolite's is yellow (`message_gui` `text_color`). Wegolite: `src/render/hud/draw.ts`.
- R3. Compass: a green ring with an orange dot and an "S" caption; Oolite a blue ring (`drawCompass:`
  `rgb_color` 0,0,1) with a red square marker. Wegolite: `src/render/hud/draw.ts`.
- R3. Aegis indicator: a boxed square captioned "AEGIS"; Oolite a green "S" glyph (`drawAegis:`). Wegolite:
  `src/render/hud/draw.ts`.

Matches: the bar set and order (FWD, AFT, FUEL, CT, LT, ALT, MISS, SPD, ROLL, PITCH, E1-E4), three missiles and
one empty pylon, the red scanner grid, the station and police blip colours, the crosshair colour and the message
text. Decided, not to fix: the hyperspace target on the clock line (PROJECT.md Key Decisions row "Put the
hyperspace target on the existing clock line"), the document footer (rows "Unify the docked, chart and Save/Load
footer…" and "Title the release Wegolite 0.1.0 from package.json") and the first-use hints themselves
(commit `89c3b41`).

## Solution

Likely changes, one per bullet; none is implemented yet:

- Message area: show a refusal or failure at once (at least `enqueuePriority` for "Hyperspeed mass-locked."), and
  consider Oolite's multi-row area with per-message lifetimes (1.5 s for this one) instead of one FIFO line.
- Drop the "Mass locked" message, or keep it only if the owner wants it as a Wegolite hint.
- Derive the condition from the alert state: yellow while mass-locked (and the other yellow flags), red with
  hostiles, green otherwise.
- Start a new game's clock at the standard scenario's `ship_clock`; check the save and hash pins that read the
  clock.
- Owner call on the fuel and speed readouts.
- Add the scanner zoom indicator only together with scanner zoom (`key_scanner_zoom`), if it is wanted.
- Default the hyperspace target to the current system on a new game, as Oolite does.
- Apply the 57.2° FOV horizontally when the aspect is wider than 4:3, as Oolite's frustum does, and update the
  HUD projections and their tests (`tests/render/launch-camera.test.ts`, `tests/hud/projection.test.ts`).
- Move the clock, the condition light and the message line to Oolite's positions, and rescale the HUD
  to Oolite's height-based scale (a `HUD_LAYOUT` change that the pinned-layout tests must follow).
- Hide `#overlay` in flight, or move it away from the clock.
- Flash the buoy blip, colour the message text yellow, and match the compass and aegis symbols.
