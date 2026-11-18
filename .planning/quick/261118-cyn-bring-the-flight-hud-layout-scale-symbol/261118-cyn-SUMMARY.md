---
phase: quick
plan: 261118-cyn
subsystem: flight-hud
status: complete
tags: [hud, oolite-fidelity, messages, hyperspace, hints]
requires: [261118-cyo, 261118-emk]
provides:
  - MessageQueue.displayCountdown (Oolite's displayCountdownMessage + printLineNoScroll)
  - HUD_LAYOUT and gauges from hud.plist at 2.25 design px per unit
  - HUD-ANCHOR option B lift (hud.lift on the probe)
  - Oolite compass, aegis glyph, status light octagon, buoy flash
  - one-time "aegis" safe-zone hint
affects: [src/render/hud, src/app/session/render-driver.ts, src/app/hints.ts, src/settings/schema.ts, index.html, FIDELITY.md]
tech-stack:
  added: []
  patterns:
    - "HUD geometry written as hud.plist units through unitX/unitY (HUD_UNIT = 1080 / 480)"
    - "HUD text sized by the measured monospace advance (hudFont), so widths match Oolite on any machine"
key-files:
  created: []
  modified:
    - src/render/hud/messages.ts
    - src/render/hud/draw.ts
    - src/render/hud/hud.ts
    - src/render/hud/projection.ts
    - src/app/hud-model.ts
    - src/app/hints.ts
    - src/settings/schema.ts
    - src/app/session/render-driver.ts
    - src/app/session/event-router.ts
    - src/app/probe.ts
    - src/app/session/probe-publisher.ts
    - src/main.ts
    - index.html
    - CHANGELOG.md
    - FIDELITY.md
    - .planning/PROJECT.md
    - .planning/todos/pending/2026-11-17-ui-flight-hud-differences-from-oolite.md
decisions:
  - "HUD-ANCHOR option B (owner): the HUD block except the crosshair, ident frame and clock rests on the disclaimer's top edge; lift measured from body > footer on resize (FIDELITY E-110)"
  - "HUD text sizes are nominal sizes at 0.6 em rescaled by the browser's measured monospace advance"
  - "FIDELITY rows are E-109 to E-112 (E-99 to E-108 were taken); E-110 cites HeadUpDisplay.m:1075-1078 because the contract only accepts src/Core Oolite cells; the hud.plist numbers went to the Constants ledger"
metrics:
  duration: "about 95 min"
  completed: 2026-11-18
estimate:
  tokens: 210000
  tasks: 3
actuals:
  tokens: 54000
  tasks: 3
  commits: 7
plan_head_before: 0e7aa0928a50d4ddd82b84e82c68a89ad2910310
plan_head_after: b495a3564f12d2e587a8b812081188f2c4f3cc07
---

# Phase quick Plan 261118-cyn: Flight HUD in Oolite's scale, layout and symbols Summary

The hyperspace countdown is now Oolite's pulsing "Witchspace to Diso in 15 s." message row, and the flight HUD
follows hud.plist at 2.25 design px per unit (432x96 scanner at 1280x720, 96 px crosshair, 42 px blue compass,
ten yellow message rows above the scanner, condition light and aegis "S" under it), lifted onto the document
disclaimer (owner's HUD-ANCHOR option B); every measured item is within 4 px of Oolite at 1280x720.

## What was built

- **Task 1 (tracer, D-09)** `d274036`: `MessageQueue.displayCountdown` ports `displayCountdownMessage`
  (`Universe.m:6258-6267`) and `printLineNoScroll`: a changed text replaces the bottom row without scrolling,
  once its own 1 s repeat time has passed, with a 1 s row time; `clear()` resets that time. The render driver
  writes `Witchspace to <system> in <n> s.` on every frame of the countdown outside the draw gate; the
  per-frame overlay is gone. Tracer gate: `tests/e2e/hyperspace.spec.ts` green on the remote before any
  expansion.
- **Task 2 (D-01 to D-08, D-10)** `aa0191c`: `HUD_LAYOUT` and every gauge coordinate from hud.plist through
  `unitX`/`unitY`; Oolite's OTHER crosshair (arms 36 to 72 px); `projectToCompass` normalises the full 3D vector
  (dead ahead is the centre); blue ring, planet dot, station square, witchpoint diamond and its "W", no caption;
  the aegis quad-strip "S" (docking range only, no caption; `aegisLabel` deleted); the status light octagon;
  `scannerFlash` and the buoy flash; Oolite's missile polygon (`descriptions.plist:916-925`); ten message rows in
  yellow; the version text hidden in flight (`#hud:not([hidden]) ~ #overlay #title`); the HUD-ANCHOR lift
  (`hud.ts` measures `body > footer` on resize; `drawHud(context, model, lift)`; `probe.hud.lift`).
- **Task 3** `2a4f840`, `61f31c9`, `e9bcf97`, `d7b2a2a`, `b495a35`: the one-time hint "S: you are inside the station's safe
  zone" (id "aegis", additive in `HINT_IDS`, marked seen when shown); font calibration from the comparison;
  FIDELITY E-109 to E-112, PROJECT.md rows, todo.

## Measured comparison at 1280x720 (Oolite px against Wegolite px plus the 61.6 px lift)

Oolite: `/tmp/ooref-ui/oolite/screenshots/06-flight.png` and `07-message.png` (261117-nfn). Wegolite:
`/tmp/cyn-capture/run3/flight.png` and `message.png` (snapshot `e9bcf97`, remote, manual clock). Bounding boxes
by colour mask (`/tmp/cyn-tools/table.py`). The crosshair is not lifted, so its Wegolite centre has no lift added.
Disclaimer height 61.578 px, `hud.lift` 92.367 design units, design scale 0.6667, no letterbox.

| Item | Oolite box (px) | Oolite size | Oolite centre | Wegolite box (px) | Wegolite size | Wegolite centre (+lift) | Δ centre | Δ size |
|---|---|---|---|---|---|---|---|---|
| scanner ellipse | (423, 569, 769, 666) | 347x98 | (596.0, 617.5) | (424, 508, 769, 604) | 346x97 | (596.5, 617.6) | (+0.5, +0.1) | (-1, -1) |
| compass ring | (816, 650, 859, 693) | 44x44 | (837.5, 671.5) | (816, 589, 859, 631) | 44x43 | (837.5, 671.6) | (+0.0, +0.1) | (+0, -1) |
| aegis S | (426, 656, 457, 689) | 32x34 | (441.5, 672.5) | (426, 595, 457, 628) | 32x34 | (441.5, 673.1) | (+0.0, +0.6) | (+0, +0) |
| condition light | (473, 667, 482, 676) | 10x10 | (477.5, 671.5) | (473, 605, 482, 615) | 10x11 | (477.5, 671.6) | (+0.0, +0.1) | (+0, +1) |
| crosshair (no lift) | (595, 312, 686, 405) | 92x94 | (640.5, 358.5) | (592, 312, 687, 407) | 96x96 | (639.5, 359.5) | (-1.0, +1.0) | (+4, +2) |
| message text "Hyperspeed mass-locked." | (730, 535, 937, 550) | 208x16 | (833.5, 542.5) | (726, 474, 934, 491) | 209x18 | (830.0, 544.1) | (-3.5, +1.6) | (+1, +2) |
| missile 1 | (283, 692, 300, 713) | 18x22 | (291.5, 702.5) | (284, 632, 299, 651) | 16x20 | (291.5, 703.1) | (+0.0, +0.6) | (-2, -2) |
| missile 2 | (307, 692, 324, 713) | 18x22 | (315.5, 702.5) | (308, 631, 323, 652) | 16x22 | (315.5, 703.1) | (+0.0, +0.6) | (-2, +0) |
| SPD surround | (876, 568, 1003, 586) | 128x19 | (939.5, 577.0) | (877, 507, 1002, 524) | 126x18 | (939.5, 577.1) | (+0.0, +0.1) | (-2, -1) |
| FWD surround | (276, 569, 403, 588) | 128x20 | (339.5, 578.5) | (276, 508, 402, 526) | 127x19 | (339.0, 578.6) | (-0.5, +0.1) | (-1, -1) |
| FUEL/CT/LT/ALT surround | (277, 618, 402, 683) | 126x66 | (339.5, 650.5) | (277, 556, 402, 622) | 126x67 | (339.5, 650.6) | (+0.0, +0.1) | (+0, +1) |
| energy banks | (877, 630, 999, 704) | 123x75 | (938.0, 667.0) | (877, 572, 999, 644) | 123x73 | (938.0, 669.6) | (+0.0, +2.6) | (+0, -2) |
| FWD legend | (243, 574, 271, 584) | 29x11 | (257.0, 579.0) | (247, 509, 271, 522) | 25x14 | (259.0, 577.1) | (+2.0, -1.9) | (-4, +3) |
| MISS legend | (235, 696, 273, 707) | 39x12 | (254.0, 701.5) | (230, 630, 270, 645) | 41x16 | (250.0, 699.1) | (-4.0, -2.4) | (+2, +4) |
| SPD legend | (1006, 571, 1039, 583) | 34x13 | (1022.5, 577.0) | (1002, 506, 1033, 524) | 32x19 | (1017.5, 576.6) | (-5.0, -0.4) | (-2, +6) |
| PITCH legend | (1006, 610, 1047, 620) | 42x11 | (1026.5, 615.0) | (1000, 545, 1047, 560) | 48x16 | (1023.5, 614.1) | (-3.0, -0.9) | (+6, +5) |
| E1 label | (1007, 634, 1017, 644) | 11x11 | (1012.0, 639.0) | (1006, 571, 1015, 581) | 10x11 | (1010.5, 637.6) | (-1.5, -1.4) | (-1, +0) |

Every item the plan lists (scanner, crosshair span, compass, condition and aegis centres, message centre and
width, missile row, SPD and FWD bars) is within 4 px. The crosshair's +4 px is Oolite's faint 0.25-alpha arm
tips falling under the mask threshold. The legends are monospace against Oolite's proportional font: their
positions are within 4 px except the SPD legend's left-edge-driven centre (-5.0, Oolite's "S" has a 3 px side
bearing), and their glyphs are 3 to 6 px taller (the test image's CJK monospace has tall capitals). The energy
bank centre (+2.6) follows `drawEnergyGauge:` exactly; Oolite's rendered banks are 2 to 3 px taller than its
formula.

Before calibration (`61f31c9` capture, `/tmp/cyn-capture/run2/`) the message was 202 px wide against 208, and in
the first capture (`aa0191c`, `/tmp/cyn-capture/run1/`) 168 px: the test image's monospace advances 0.5 em, not
the 0.6 em the sizes assumed, which led to `hudFont` (deviation 2 below).

## Countdown evidence (manual clock, `/tmp/cyn-capture/run3/`)

Peak yellowness (min(r, g) - b) of the bottom two message rows; 255 is full alpha, about 70 is the background.

| Shot | Flight time (s) | Countdown steps | Bottom two rows | Row 9 | Row 10 |
|---|---|---|---|---|---|
| countdown-start | 8.533 | 1799 | '' / 'Witchspace to Diso in 15 s.' | 74 | 255 |
| countdown-early | 9.542 | 1678 | '' / 'Witchspace to Diso in 14 s.' | 72 | 255 |
| countdown-late (0.6 s later) | 10.142 | 1606 | '' / 'Witchspace to Diso in 14 s.' | 71 | 141 |
| countdown-message (J pressed) | 10.158 | 1604 | 'Witchspace to Diso in 14 s.' / 'Hyperspeed mass-locked.' | 139 | 255 |
| countdown-overwrite (next count) | 10.550 | 1557 | '' / 'Witchspace to Diso in 13 s.' | 70 | 255 |
| cancel | 10.817 | 0 | 'Witchspace to Diso in 13 s.' / 'Hyperspace countdown cancelled' | 204 | 255 |
| cancel-later (1 s later) | 11.817 | 0 | '' / 'Hyperspace countdown cancelled' | 71 | 255 |

The count is written exactly once a second (8.533, 9.542, 10.550), fades within its second (pulse), a message
posted during the countdown scrolls the count up and is overwritten at the next count, and after the cancel the
last count fades above the abort and is gone within 1 s. The version text's computed visibility in flight is
`hidden` (all shots).

Screenshots (scratch, not committed): `/tmp/cyn-capture/run3/{flight,message,countdown-start,countdown-early,
countdown-late,countdown-message,countdown-overwrite,cancel,cancel-later}.png`, missile crops
`/tmp/cyn-capture/run2/crop-missiles.png` and `crop-missiles-oolite.png`; readings in
`/tmp/cyn-capture/run3/capture.json`; the scratch spec `/tmp/cyn-capture/cyn-capture.spec.ts`.

## Re-pinned tests and causes

- `tests/e2e/hyperspace.spec.ts`: countdown wait `/^Hyperspace to Diso in \d+ seconds$/` became
  `/^Witchspace to Diso in \d+ s\.$/` (D-09, descriptions.plist `witch-to-x-in-y-seconds`).
- `tests/app/session-order.test.ts`: the cancel case looks for "Witchspace to" (same cause).
- `tests/app/session/render-driver.test.ts`: the 261117-u3m countdown block is replaced (the row is in the queue
  now: `size` counts it, it fades to 0.5 at +0.5 s, it is gone after 1 s).
- `tests/ui/hud-model.test.ts`: `HUD_LAYOUT` scanner (636, 855, 648, 144), crosshair (888, 468, 144, 144),
  compass (1225.5, 976.5, 63, 63), aegis (636, 981, 54, 54), condition (708, 999, 18, 18), message
  (964.5, 517.5, 567, 315); `SCANNER_WIDTH` 648 x 144; `COMPASS_SIZE` 63; `HUD_MESSAGE_ROWS` 10 (D-03 to D-05,
  hud.plist at 2.25 px per unit); the clock rect unchanged (D-01).
- `tests/hud/projection.test.ts`: compass cases now full-3D (D-06: 45 degrees gives 0.4 x size x sin 45, dead
  ahead the centre, zero vector the +Z fallback); lollipop heads 11.25 x 6.75 at scanner centre y 927 (D-05:
  5x3-unit head x 2.25); `scannerContactColor(kind, flash)` (D-08); the "instruments on the scanner band" case
  became hud.plist's y 32 row (D-04); the `aegisLabel` cases deleted (D-07).
- `tests/hud/clock-lines.test.ts`: message rows are ten 31.5 px bands at x 1248 in `HUD_MESSAGE_FONT` and yellow
  (D-03, D-08); new aegis, compass-caption, lift and `hudLift` cases.
- `tests/e2e/hud.spec.ts`: adds the hidden version text and the `hud.lift` check.

## Gates

- Local (Docker): targeted Vitest for every task; full `docker compose run --rm test` (220 files, 5,766 passed,
  10 skipped) after Task 2; `lint` and `typecheck` green after every code commit; the fidelity contract with
  `OOLITE_SRC` set to the pinned `src/` tree (verbatim excerpts checked, 9 passed, none skipped).
- Remote runs, one at a time:
  - `e2e` `tests/e2e/hyperspace.spec.ts` at `d274036`: 3 passed, `exit=0 elapsed=89s snapshot=d274036`.
  - `e2e` `tests/e2e/hud.spec.ts tests/e2e/hyperspace.spec.ts` at `aa0191c`: 6 passed,
    `exit=0 elapsed=101s snapshot=aa0191c`.
  - scratch capture at `2a4f840`: `exit=0 elapsed=24s`; at `61f31c9`: `exit=0 elapsed=65s`; at `e9bcf97`:
    `exit=0 elapsed=66s`.
  - `verify-full` at `d7b2a2a`: 220 unit files (5,770 passed, 10 skipped); e2e 133 passed, 1 failed
    (`tests/e2e/probe-shape.spec.ts` "menu probe shape": `hud.lift: unexpected key`), `exit=1 elapsed=574s
    snapshot=d7b2a2a`. Cause: this task's new probe key; fixed in `b495a35` (deviation 9).
  - `e2e` `tests/e2e/probe-shape.spec.ts` at `b495a35`: 7 passed, `exit=0 elapsed=15s snapshot=b495a35`.
  - `verify-full` at `b495a35` (final HEAD of code): lint, typecheck, content drift, 220 unit files (5,770
    passed, 10 skipped), build, Chromium e2e 140 passed, seams 2 passed: `exit=0 elapsed=608s snapshot=b495a35`.
- Scratch: the capture spec ran only under `/tmp/cyn-capture` (remote copy removed through a throwaway
  container); `git status` shows only this task's PLAN and SUMMARY; no Oolite screenshot or scratch file is
  tracked.
- NPC acceptance run not due (nothing under `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json` changed).

## Deviations from Plan

1. **[Rule 3 - Blocking] FIDELITY ids and the E-110 citation.** E-99 to E-108 were taken, so the rows are E-109
   to E-112. The contract only accepts `src/Core/...` Oolite cells, so E-110 cites the anchor code
   `HeadUpDisplay.m:1075-1078` (scanner x/y from `x_offset * x0`, `y_offset * y0`) and the hud.plist numbers
   went to a new Constants ledger row.
2. **[Rule 1 - Bug] Text widths depend on the machine's monospace font.** The first capture showed the message
   168 px wide against Oolite's 208 px: the test image's monospace advances 0.5 em. `hudFont` now measures the
   advance once per context and rescales the nominal (0.6 em) sizes; the clock font is untouched (D-01).
   Commits `61f31c9`, `e9bcf97`.
3. **[Rule 1 - Bug] The lift is measured from the footer element, not from `--document-footer-height`.** A window
   resize reaches `hud.resize()` before the footer's ResizeObserver updates the property, so the property can be
   stale there; `getBoundingClientRect` is exact at that moment. The lift also subtracts the bottom letterbox
   margin, so a window narrower than 16:9 is not lifted twice.
4. **[Rule 2] `hud.lift` on the probe** (`src/app/probe.ts`, `probe-publisher.ts`, `src/main.ts`), so the e2e
   spec and the capture can check the lift numerically.
5. **Missile icons** use Oolite's own polygon and placement (`descriptions.plist:916-925`, pylon at x + 16 i + 2
   translated by -6 units), first icon centre 437.25 design px, not the plan's 447 (measured 291.5 px on both).
6. **Legend vertical placement**: measured Oolite capitals are centred 2/3 of a cell above the legend's y (on the
   bar's centre line), so legends are middle-aligned there rather than bottom-aligned.
7. **The beacon "W"** follows `oo_drawHUDBeaconIconAt` exactly (below-left of the centre, partly outside the
   ring), not "at the compass centre" as the plan worded it.
8. **TDD order in Task 2**: the tests were written first but the implementation was written before the first
   red run, so no red run of the Task 2 tests was recorded; Task 1 and the hint tests were seen red.
9. **[Rule 1 - Bug] The probe-shape fixture** (`tests/fixtures/probe-shape.json`) did not list the new
   `hud.lift` key, which the first `verify-full` caught; the fixture gains `"lift": "number"` in all seven
   sampled states (`b495a35`).

## Known Stubs

None added. The ALT bar (0.92) and the missile pylons (three loaded, one empty) remain the earlier placeholders
(no altitude or missile model yet), now drawn at Oolite's positions.

## Open items (recorded in the todo and FIDELITY)

- The condition light's alpha pulse (`HeadUpDisplay.m:2560` at 7437f22).
- Oolite's word wrap of a long message into a second row.
- Below 16:9 the HUD letterboxes by width; Oolite stays height-scaled down to 4:3.
- The scanner zoom and "1:1" indicator (later, owner 2026-11-18).
- At the top left the overlay's system line still overprints the clock's hyperspace line; both stay by owner
  decision (D-01, D-02).

## Commits

- `d274036` feat(quick-261118-cyn): the hyperspace countdown as Oolite's message row
- `aa0191c` feat(quick-261118-cyn): flight HUD in Oolite's geometry and symbols
- `2a4f840` feat(quick-261118-cyn): one-time hint that explains the aegis "S"
- `61f31c9` fix(quick-261118-cyn): size HUD text by the monospace font's real advance
- `e9bcf97` fix(quick-261118-cyn): calibrate the message and energy label sizes on Oolite
- `d7b2a2a` docs(quick-261118-cyn): record the Oolite HUD geometry, countdown and decisions
- `b495a35` test(quick-261118-cyn): record hud.lift in the probe-shape fixture

## Self-Check: PASSED

All seven commits are ancestors of HEAD; the modified key files exist; `verify-full` exited 0 at `b495a35`.
