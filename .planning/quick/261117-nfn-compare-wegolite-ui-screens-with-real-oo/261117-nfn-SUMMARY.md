---
phase: quick
plan: 261117-nfn
subsystem: ui
status: complete
tags: [oolite-reference, ui, hud, fidelity, comparison]
requires:
  - tools/oolite-reference (quick task 261117-iuw)
  - the 261117-lka OXP pattern (traffic removal, stop, frozen NPC)
provides:
  - a ranked list of UI differences from a running Oolite (19 R1, 7 R2, 6 R3)
  - three pending todos, one per screen group
affects:
  - FIDELITY.md (Open items)
  - .planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md
tech-stack:
  added: []
  patterns:
    - scratch Playwright spec mounted with -v and copied into the remote synced tree's tests/e2e
key-files:
  created:
    - .planning/todos/pending/2026-11-17-ui-flight-hud-differences-from-oolite.md
    - .planning/todos/pending/2026-11-17-ui-station-screen-differences-from-oolite.md
    - .planning/todos/pending/2026-11-17-ui-chart-differences-from-oolite.md
  modified:
    - FIDELITY.md
    - .planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md
decisions:
  - "The F7 comparison target is the chart hover card for Lave, because commit c1c9897 removed F7."
  - "Market price and stock differences are a condition difference (two random market draws), not a UI difference."
metrics:
  duration: 25min
  completed: 2026-11-17
actuals:
  tokens: 6300
  tasks: 3
  commits: 1
plan_head_before: 5a4e4cd09cba539fd02f4d841af5211c3378f666
plan_head_after: 290cac9a30d5bd096a366cd7d7801469d946fa98
---

# Quick Task 261117-nfn: Compare Wegolite UI screens with a running Oolite Summary

Nine matched screenshot pairs from Oolite 1.93.1-255 and Wegolite 5a4e4cd, taken under the same conditions, gave 32 classified UI differences (19 R1, 7 R2, 6 R3). The largest are the late J reply on Wegolite's one-line message queue, the always-green condition light, and a forward-view FOV applied on the wrong axis that makes everything ahead about 1.78 times smaller at 16:9. The differences are recorded in FIDELITY.md Open items and in three pending todos.

## Conditions

- Oolite: 1.93.1-255 deployment AppImage, SHA256 `4ec9ab5fc6743538c95b97b590674f5d386dd07c16565aa1389dc40f15bd66a8`, image `wegolite-oolite-reference:1.93.1-255` (`--no-build`), Xvfb and llvmpipe, window 1280x720.
- Wegolite: commit `5a4e4cd`, browser-test bundle (`npm run build:e2e`, traffic off by default), headless Chromium in the `e2e` container, viewport 1280x720 (Desktop Chrome).
- Commander: a new Jameson at Lave, docked, 100.0 credits, 7.0 ly of fuel.
- Traffic: in Oolite, the throwaway OXP `wegolite-ui.oxp` removed every ship that was not the player, a station or a buoy at launch (`UI-REMOVED n=74`) and again at the stop (`removed2=0`). In Wegolite the bundle has no traffic; the scanner showed only the station and the nav buoy.
- Stop rule: in Oolite, `maxSpeed = 0` from the launch until `speed === 0`, then restored. In Wegolite, `setSpeed(0)` once the mode is `inFlight`, then a 3 s wait.
- Oolite stop line: `[wegolite-ui]: UI-STOPPED dist=1444.9874834211137 massLocked=true speed=0 removed2=0`. NPC line: `UI-NPC dist=1500.0000702029724 noseDot=0.9999999791141436 key=viper scanClass=CLASS_POLICE playerSpeed=0 stationDist=1529.0300772471403 massLocked=true`. The ship drifted about 84 m in the 15 s between the two lines, with speed 0.
- Wegolite station distance: 854.6 m at the flight and message shots (`massLocked=true`, contacts `station`, `navBuoy`), and 850.3 m in the NPC test. The planet's place on screen and the ALT bar differ because the stop points differ; that is a condition difference.

## Pairs

Captured, all at 1280x720:

- status (Oolite `01-status`, Wegolite `status`)
- manifest, an extra pair (Oolite tracer `01-status`, which is the Ship's Manifest; Wegolite `status-manifest`)
- market
- sysdata (Oolite F7 against the Wegolite Lave hover card, because commit `c1c9897` removed F7)
- chart-short against chart-local
- chart-galactic against chart-galaxy
- flight
- message
- npc

Dropped: none. Both NPC sides worked on the first attempt. Condition difference: Wegolite's test shooter fires (forward shield 128 to 70.2 within 1 s), while Oolite's Viper is frozen with `oolite-nullAI.js`. Before the spawn, under `?test=1&traffic=1`, no traffic ship was on the scanner (contacts `station`, `navBuoy`).

Side-by-side page: `/tmp/ooref-ui/compare.html`. It is local only, not committed and not published. Screenshots are under `/tmp/ooref-ui/oolite/`, `/tmp/ooref-ui/oolite-tracer/` and `/tmp/ooref-ui/wegolite/`, and the Wegolite readings are in `/tmp/ooref-ui/wegolite/capture.json` and `capture-npc.json`.

## Ranked differences

| # | Class | Pair | Oolite | Wegolite | Oolite source | Wegolite file | Todo |
|---|---|---|---|---|---|---|---|
| 1 | R1 | message | "Hyperspeed mass-locked." at once, 1.5 s, multi-row area | shown 14.7 s after J, behind "Mass locked" and two first-use hints; one FIFO line, 4 s each | `PlayerEntityControls.m:1166-1175`, `hud.plist` `message_gui` | `src/render/hud/messages.ts`, `src/app/session/event-router.ts` | flight-hud |
| 2 | R1 | flight | no message when the lock begins | extra "Mass locked" | `descriptions.plist` (only `jump-mass-locked`) | `src/app/session/event-router.ts:344-345` | flight-hud |
| 3 | R1 | flight | condition yellow while mass-locked, red with hostiles | always green | `PlayerEntity.m:5122-5144` | `src/app/hud-model.ts:206` | flight-hud |
| 4 | R1 | flight | clock starts 2084004:20:13:24 | starts 2084004:00:00:00 | `oolite-standard.oolite-save` `ship_clock` | `src/sim/flight/state.ts:89` | flight-hud |
| 5 | R1 | flight | fuel and speed shown as bars only | extra "7.0 LY" and "0.000 LS" readouts | `hud.plist` `drawFuelBar:`, `drawSpeedBar:` | `src/render/hud/draw.ts` | flight-hud |
| 6 | R1 | flight | "1:1" scanner zoom indicator | none (no scanner zoom) | `hud.plist` `drawScannerZoomIndicator:` | `src/render/hud/draw.ts` | flight-hud |
| 7 | R1 | flight/status | hyperspace target Lave for a new commander | "(Unknown)" | `PlayerEntity.m` (F5) | `src/ui/station-model.ts:324`, `src/render/hud/draw.ts:755` | flight-hud |
| 8 | R1 | market | "Legal:" column, "Im" for Slaves, Narcotics, Firearms | "Ex" column, "Ex" for the same goods (Oolite's opposite) | `PlayerEntity.m:9675-9690`, `descriptions.plist` `oolite-legality-*` | `src/ui/station-model.ts:147,261` | station |
| 9 | R1 | market | filter and sort line, "Cash … Load 0 of 20 t." | neither, no load line visible | `PlayerEntity.m` (F8) | `src/ui/station-model.ts`, `index.html` | station |
| 10 | R1 | status | "Harmless (0)" | "Harmless" | `PlayerEntity.m` (F5) | `src/ui/station-model.ts:366-367` | station |
| 11 | R1 | status | "Cobra Mark III" | "Cobra Mk III" | scenario `ship_class_name` | `src/ui/station-model.ts:323` | station |
| 12 | R1 | status/market | "₢" | "Cr" (the hover card prints "M₢") | `descriptions.plist` | `src/sim/player/profile.ts` (`formatDecicredits`) | station |
| 13 | R1 | manifest | "Cargo 0 t (20 t)", "Passenger Cabins 0 / 0", "No cargo carried." | table of 16 goods with "—", no capacity or cabin line visible | `PlayerEntity.m` (manifest) | `src/ui/station-model.ts`, `index.html:1858-1871` | station |
| 14 | R1 | station | dashboard under every docked screen | hidden by the station overlay | `hud.plist` | `index.html` (`#docked`) | station |
| 15 | R1 | chart | "Galactic Chart 1" | "Galactic chart" | chart title | `index.html:1880` | chart |
| 16 | R1 | chart | markers coloured by sun colour, sized by planet radius | uniform green dots | `GuiDisplayGen.m:1789-1865` | `src/ui/chart-draw.ts` | chart |
| 17 | R1 | chart-galactic | "Find planet:" search | none | `PlayerEntityControls.m` (chart search) | `src/ui/chart.ts` | chart |
| 18 | R1 | chart | no links outside route planning | extra 7 ly jump graph | `GuiDisplayGen.m` (chart) | `src/ui/chart-draw.ts:72-78` | chart |
| 19 | R1 | sysdata | "(Human Colonials)" under Population, no label | extra "Inhabitants" label | `PlayerEntity.m` (F7) | `src/ui/station-model.ts:534` | chart |
| 20 | R2 | flight/npc | 57.2° horizontal FOV when wider than 4:3; Viper about 40 px wide at 1,500 m | 57.2° vertical, about 88° across at 16:9; Viper about 22 px | `Universe.m:4440-4450`, `MyOpenGLView.m:1282-1290` | `src/render/system-scene.ts:59,262`, `src/render/hud/projection.ts`, `src/render/hud/draw.ts:52` | flight-hud |
| 21 | R2 | flight | clock under the scanner, condition light beside it, message right of centre above it | clock top-left, condition top-right, message centred below the scanner | `hud.plist` `drawClock:`, `drawStatusLight:`, `message_gui` | `src/render/hud/draw.ts:98-117` | flight-hud |
| 22 | R2 | flight | no page text in flight | `#overlay` ("Wegolite 0.4.0", "Wegolite — Lave") overprints the clock | none | `index.html:1301-1305`, `src/app/session/hyperspace-controller.ts:149-156` | flight-hud |
| 23 | R2 | flight | scanner 432x96 px, crosshair 96 px, compass 44 px | scanner 336x75 px, crosshair 46 px, compass 65 px, HUD about 40 px higher | `hud.plist` `drawScanner:` 288x64 on 640x480 | `src/render/hud/draw.ts:47-49` | flight-hud |
| 24 | R2 | market | 17 rows and both footer lines on one screen | 11 of 17 rows visible, the rest need scrolling | `PlayerEntity.m` (F8) | `index.html` (`#station-screen`) | station |
| 25 | R2 | status | equipment on the same screen | equipment list below the fold | `PlayerEntity.m` (F5) | `index.html:1854-1856` | station |
| 26 | R2 | chart-galactic | no labels at galaxy zoom | thinned labels overprint each other mid-galaxy | `GuiDisplayGen.m` | `src/ui/chart-model.ts` | chart |
| 27 | R3 | flight | buoy blip alternates green and yellow | steady yellow | `ShipEntity.m:5667-5671` | `src/render/hud/draw.ts:239-250` | flight-hud |
| 28 | R3 | message | yellow text | green text | `hud.plist` `message_gui` `text_color` | `src/render/hud/draw.ts` | flight-hud |
| 29 | R3 | flight | blue compass ring, red square marker | green ring, orange dot, "S" caption | `hud.plist` `drawCompass:` | `src/render/hud/draw.ts` | flight-hud |
| 30 | R3 | flight | green "S" aegis glyph | boxed square captioned "AEGIS" | `hud.plist` `drawAegis:` | `src/render/hud/draw.ts` | flight-hud |
| 31 | R3 | station | red centred title, yellow values, red selection bar | all green, left heading, green bar, dimmed empty rows | GUI defaults | `index.html` styles | station |
| 32 | R3 | chart | yellow labels, red and green cross cursor | green labels, white disc | `GuiDisplayGen.m` | `src/ui/chart-draw.ts` | chart |

Todo files:

- flight-hud: `.planning/todos/pending/2026-11-17-ui-flight-hud-differences-from-oolite.md` (items 1 to 7, 20 to 23 and 27 to 30)
- station: `.planning/todos/pending/2026-11-17-ui-station-screen-differences-from-oolite.md` (items 8 to 14, 24, 25 and 31)
- chart: `.planning/todos/pending/2026-11-17-ui-chart-differences-from-oolite.md` (items 15 to 19, 26 and 32)

No existing todo covered an item. The station todo links the palette todo for item 31.

## Decided

- The tab strip and the Home screen: PROJECT.md Key Decisions row "Add a clickable F-key-ordered tab strip and a live F4 Interfaces screen to the station computer".
- No F7 screen; the hover card replaces it, and Oolite's planet picture went with it: commit `c1c9897`.
- The chart presets, the local zoom (spanX 80, wider than Oolite's short-range chart), the full-width map instead of a framed panel, and the label thinning: row "Replace the F6 chart's Short/Long sub-tabs with one continuous camera and two presets". North-up: row "Keep the galactic chart north-up" (no visible effect around Lave).
- The hyperspace target as the clock's second line: row "Put the hyperspace target on the existing clock line (no twelfth HUD element)".
- The shared key-hint footer and the document disclaimer, also visible over the bottom of the flight view: rows "Unify the docked, chart and Save/Load footer on one two-line template with live key labels" and "Title the release Wegolite 0.1.0 from package.json" (D-06).
- The first-use flight hints: commit `89c3b41` (Phase 3, D-11). Their effect on the J reply is item 1.
- Market prices and stock differ in every row because both games draw a random market for a new commander (row "Stable market across reload: persist the seed"). This is a condition difference, not a UI one.

## Noise

llvmpipe against SwiftShader, font rasterisation, antialiasing, the star field, planet texture detail and the station roll phase, plus the Xvfb mouse pointer in Oolite's market and chart shots, are noise and were ignored.

## Run records

Oolite tracer run (Task 1), `/tmp/ooref-ui/oolite-tracer/session.txt`:

```
oolite_version=1.93.1-255
appimage_sha256=4ec9ab5fc6743538c95b97b590674f5d386dd07c16565aa1389dc40f15bd66a8
start_utc=2026-11-17T16:05:35Z
end_utc=2026-11-17T16:06:10Z
timeout_s=300
step 1: window ok id=4194323
step 2: sleep 10 ok
step 3: key Return ok
step 4: sleep 3 ok
step 5: key Return ok
step 6: sleep 10 ok
step 7: key F5 ok
step 8: sleep 3 ok
step 9: shot status ok 277841 bytes
exit=0
```

`wrapper.txt`:

```
git_sha=5a4e4cd
tool_tree=clean
host=opencode@192.168.178.51
image=wegolite-oolite-reference:1.93.1-255
image_id=sha256:f59a379015e8f9f48294756b04a0d92bf06cd70d8252dec06434034ab48fd69c
steps=tracer.steps
addons=
container_exit=0
fetch=ok
container=ooref-20261117T160409Z-4BmNRo
elapsed_s=38
```

Oolite full run (Task 2), `/tmp/ooref-ui/oolite/session.txt`:

```
oolite_version=1.93.1-255
appimage_sha256=4ec9ab5fc6743538c95b97b590674f5d386dd07c16565aa1389dc40f15bd66a8
start_utc=2026-11-17T16:07:43Z
end_utc=2026-11-17T16:09:09Z
timeout_s=600
step 1: window ok id=4194323
step 2: sleep 10 ok
step 3: key Return ok
step 4: sleep 3 ok
step 5: key Return ok
step 6: waitlog ok line=67
step 7: sleep 8 ok
step 8: key F8 ok
step 9: sleep 3 ok
step 10: key F5 ok
step 11: sleep 3 ok
step 12: shot status ok 307874 bytes
step 13: key F8 ok
step 14: sleep 3 ok
step 15: shot market ok 333407 bytes
step 16: key F7 ok
step 17: sleep 3 ok
step 18: shot sysdata ok 397788 bytes
step 19: key F6 ok
step 20: sleep 3 ok
step 21: shot chart-short ok 371374 bytes
step 22: key F6 ok
step 23: sleep 3 ok
step 24: shot chart-galactic ok 358806 bytes
step 25: key F5 ok
step 26: sleep 3 ok
step 27: key F1 ok
step 28: waitlog ok line=69
step 29: sleep 3 ok
step 30: shot flight ok 748269 bytes
step 31: key j ok
step 32: shot message ok 748662 bytes
step 33: waitlog ok line=70
step 34: sleep 3 ok
step 35: shot npc ok 738553 bytes
exit=0
```

`wrapper.txt`:

```
git_sha=5a4e4cd
tool_tree=clean
host=opencode@192.168.178.51
image=wegolite-oolite-reference:1.93.1-255
image_id=sha256:f59a379015e8f9f48294756b04a0d92bf06cd70d8252dec06434034ab48fd69c
steps=ui.steps
addons=wegolite-ui.oxp 
container_exit=0
fetch=ok
container=ooref-20261117T160617Z-341yeK
elapsed_s=89
```

`Latest.log` had no `[wegolite-ui]: ERROR` line. Its OXP lines were `UI-DOCKED system=Lave docked=true credits=100`, `UI-REMOVED n=74`, the `UI-STOPPED` line and the `UI-NPC` line quoted above.

Wegolite wrapper exit lines:

- Tracer (Task 1): `exit=0 elapsed=8s snapshot=5a4e4cd` (1 passed).
- Capture, first attempt (Task 2): `exit=1 elapsed=38s snapshot=5a4e4cd`. "npc" passed. "screens and flight" timed out after 10 s waiting for the J message (see the deviations).
- Capture, accepted run (Task 2): `exit=0 elapsed=44s snapshot=5a4e4cd` (2 passed).

The remote scratch directory `/tmp/ooref-ui-wego` was removed through a throwaway busybox container, and `~/oolite-reference-runs` is empty.

## Remote gates (Task 3, against the committed HEAD 290cac9)

- `wegolite-remote-run.sh run --rm test npx vitest run tests/contract/fidelity.test.ts`: 1 file passed, 8 tests passed and 1 skipped; `exit=0 elapsed=3s snapshot=290cac9`.
- `wegolite-remote-run.sh run --rm lint npx prettier --check FIDELITY.md`: "All matched files use Prettier code style!"; `exit=0 elapsed=2s snapshot=290cac9`.
- `verify`, `verify-full` and `e2e` were not run (UI-7). No file changed under `src/sim/npc/**` or `src/sim/world/**`, so the NPC acceptance run was not due.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 1 - Bug] Oolite's F5 toggles to the manifest when pressed on the status screen**
- **Found during:** Task 1
- **Issue:** A new Oolite commander already starts on the F5 status screen, so the tracer's F5 opened the Ship's Manifest instead.
- **Fix:** The Task 2 steps reach the status screen through F8 then F5. The tracer shot was kept as an extra manifest pair, paired with Wegolite's F5 page 2 (`status-manifest.png`, an extra shot in the spec).
- **Files modified:** `/tmp/ooref-ui/ui.steps`, `/tmp/ooref-ui/wego-src/ui-capture.spec.ts` (scratch only)

**2. [Rule 3 - Blocking] The Wegolite J message needed more than 10 s**
- **Found during:** Task 2, first Wegolite run
- **Issue:** "Hyperspeed mass-locked." waits behind "Mass locked" and two first-use hints on the FIFO message line, so the 10 s wait timed out.
- **Fix:** The scratch spec now waits up to 60 s and logs every message change with its wall time and clock (`msgLog` in `capture.json`). The first attempt's outputs are kept in `/tmp/ooref-ui/wegolite-attempt1/`. The delay itself is ranked item 1.
- **Files modified:** `/tmp/ooref-ui/wego-src/ui-capture.spec.ts` (scratch only)

**3. [Rule 3 - Blocking] No local image crop tool**
- **Found during:** Task 2
- **Issue:** The HUD details needed zoomed crops, and the host has neither ImageMagick nor Pillow. Installing either was out of scope.
- **Fix:** A zlib-only crop script at `/tmp/ooref-ui-tools/crop.py`, kept outside the output directory. The crops are in `/tmp/ooref-ui/zoom/`.

The remote Playwright path worked as planned: the compose `-v /tmp/ooref-ui-wego:/scratch` mount, then a copy into the remote tree's `tests/e2e/`. No Rule 3 path change was needed. The spec ran with `--workers=1`.

### Plan items adjusted

- The measurement todo's Open paragraph dropped the sentence about the 261117-mne station-boundary fix. That fix is still recorded in the todo's open-numbers list.

## Known Stubs

None. Only documentation changed.

## Self-Check: PASSED

- FOUND: FIDELITY.md (2 lines contain `261117-nfn`)
- FOUND: .planning/todos/pending/2026-11-17-ui-flight-hud-differences-from-oolite.md
- FOUND: .planning/todos/pending/2026-11-17-ui-station-screen-differences-from-oolite.md
- FOUND: .planning/todos/pending/2026-11-17-ui-chart-differences-from-oolite.md
- FOUND: .planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md (still in pending/)
- FOUND: commit 290cac9
- FOUND: /tmp/ooref-ui/compare.html (not tracked)
- No change under `src`, `tests`, `tools` or `index.html` since 5a4e4cd, and no Oolite or scratch artefact committed.
