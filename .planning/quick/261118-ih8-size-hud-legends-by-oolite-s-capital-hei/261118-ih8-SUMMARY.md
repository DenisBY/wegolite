---
phase: quick
plan: 261118-ih8
subsystem: render/hud
status: complete
tags: [hud, fidelity, fonts, oolite]
requires: [quick-261118-cyn]
provides:
  - "src/render/hud/cap-text.ts: OOLITE_CAP_PER_CELL, capFontPx, measuredCapPerPx, drawCapText"
affects: [flight HUD legends, fuel and speed readouts, energy bank labels, compass witchpoint letter]
tech-stack:
  added: []
  patterns: ["HUD text sized by measured capital height (measureText actualBoundingBoxAscent, cached per context and family, 0.7 fallback)"]
key-files:
  created:
    - src/render/hud/cap-text.ts
    - tests/hud/cap-text.test.ts
  modified:
    - src/render/hud/draw.ts
    - CHANGELOG.md
    - FIDELITY.md
    - .planning/PROJECT.md
decisions:
  - "Size HUD legends by Oolite's capital height (owner option 1, 2026-11-18): every legend keeps its hud.plist cell and its capitals are 0.5625 of the cell; the readouts and the witchpoint W follow; message rows keep the width calibration and the clock its font"
  - "OOLITE_CAP_PER_CELL stays 0.5625 (texture value): all fourteen legends are within 1 px of Oolite at 1280x720, so no refit"
requirements: [FLGT-05]
metrics:
  duration: "22 min"
  completed: 2026-11-18
actuals:
  tokens: 7500
  tasks: 2
  commits: 2
plan_head_before: 40b02d7580299c249fe7bf6a008ef33472a43dd9
plan_head_after: 86cc9a9ec4de6f32c3814c172e5def48a56276b3
---

# Phase quick Plan 261118-ih8: Size HUD legends by Oolite's capital height Summary

The flight HUD's fourteen legends, the "7.0 LY" and "0.000 LS" readouts and the compass's witchpoint "W" are now
sized so that the browser font's measured capital height is 0.5625 of their Oolite cell (Oolite's font texture
value), which brings every legend's capital height within 1 px of Oolite's 1280x720 screenshot (it was 2 to 4 px
taller); the message rows and the clock are unchanged.

## What changed

- `src/render/hud/cap-text.ts` (new): `OOLITE_CAP_PER_CELL = 0.5625` with its sources (texture rows 13 to 48 of
  a 64 px cell in `Resources/Textures/oolite-font.png`; `drawCharacterQuad`, `HeadUpDisplay.m:3599-3619`, its
  1/8 lift at `3607`, at 7437f22), `capFontPx(cellPx, fontCapPerPx)`, `measuredCapPerPx(context, family)`
  ("H" ascent at 100 px, alphabetic baseline, restores font and baseline, WeakMap cache per context and family,
  0.7 fallback for a missing, non-finite or out-of-range ascent) and `drawCapText` (capitals centred 2/3 of the
  cell above its bottom; does not touch `textAlign` or `fillStyle`).
- `src/render/hud/draw.ts`: the width-sized legend constants (`LEGEND_14_PX`, `LEGEND_12_PX`, `LEGEND_10_PX`,
  `ENERGY_LABEL_PX`) are gone. `drawLegend(context, text, x, bottom, cell, sizeCell)` calls `drawCapText` with
  the cell bottom `bottom - 2/3 (cell - sizeCell) HUD_UNIT`, so the capitals stay centred 2/3 of `cell` above
  `bottom`. FWD, AFT, ROLL, PITCH and E1 to E4 use 12-unit cells, MISS and SPD 14, FUEL, CT, LT, ALT and the
  fuel readout 10; the speed readout is placed on the SPD cell (14) and sized by a 10-unit cell. The witchpoint
  "W" uses `drawCapText` with a cell of twice the blip whose bottom is 3 blips below the compass centre
  (`oo_drawHUDBeaconIconAt`, `HeadUpDisplay.m:4127`). `hudFont`/`advanceOf` remain for the message rows only.
- `CHANGELOG.md` `[Unreleased]` / `Changed`: one line for the smaller, Oolite-height labels.
- `FIDELITY.md` Constants ledger: new row after "HUD geometry" (pinned by `tests/hud/cap-text.test.ts`).
- `.planning/PROJECT.md` Key Decisions: "Size HUD legends by Oolite's capital height" row.

## Final ratio and its sources

`OOLITE_CAP_PER_CELL = 0.5625`, kept (no refit). Sources: the font texture's capitals cover 36 of 64 rows of the
glyph cell; Oolite's 1280x720 flight screenshot (one hud.plist unit = 1.5 screen px) gives mask heights of 8 to
9 px for 10-unit cells (15 px), 11 px for 12-unit cells (18 px) and 12 to 13 px for 14-unit cells (21 px), about
1 px of antialias above 0.5625 x cell. Per-legend raw screenshot ratios (mask height / cell px): FUEL and CT
8/15 = 0.533, LT and ALT 9/15 = 0.600, FWD, AFT, ROLL, PITCH, E1 to E4 11/18 = 0.611, MISS 12/21 = 0.571,
SPD 13/21 = 0.619.

## 1280x720 legend capital heights, Oolite vs Wegolite

Same "greenish" mask on both images (`/tmp/ih8-tools/table.py`, built on `/tmp/cyn-tools/measure.py`); Wegolite
windows shifted up by the capture's footer height (61.58 px, rounded to 62). Oolite: `/tmp/ooref-ui/oolite/screenshots/06-flight.png`
and `07-message.png`. Every window was checked on upscaled crops (`/tmp/ih8-tools/crops/`): one legend each, no
bar, surround or readout.

| Legend    | Oolite height | Before (261118-cyn run3) | Δ before | After (ih8 run1) | Δ after |
| --------- | ------------- | ------------------------ | -------- | ---------------- | ------- |
| FWD       | 11            | 14                       | +3       | 10               | -1      |
| AFT       | 11            | 14                       | +3       | 10               | -1      |
| FUEL      | 8             | 11                       | +3       | 8                | +0      |
| CT        | 8             | 11                       | +3       | 8                | +0      |
| LT        | 9             | 11                       | +2       | 8                | -1      |
| ALT       | 9             | 11                       | +2       | 8                | -1      |
| MISS      | 12            | 16                       | +4       | 12               | +0      |
| SPD       | 13            | 16                       | +3       | 12               | -1      |
| ROLL      | 11            | 14                       | +3       | 10               | -1      |
| PITCH     | 11            | 14                       | +3       | 10               | -1      |
| E1        | 11            | 11                       | +0       | 10               | -1      |
| E2        | 11            | 11                       | +0       | 10               | -1      |
| E3        | 11            | 11                       | +0       | 10               | -1      |
| E4        | 11            | 11                       | +0       | 10               | -1      |
| message H | 13            | 14                       | +1       | 14               | +1      |

`table.py` exits 0 on run1 ("misses: 0"). The "before" column re-measures the 261118-cyn capture with the same
"greenish" mask and these windows; it differs from the plan's planning figures (+3 to +6, e.g. SPD 19 and PITCH
16 px), which were taken with other masks and windows. The message "H" is unchanged at 14 px (rows 474 to 487).

Note for the owner: the remaining error leans one way (10 of 14 legends at -1, none above). A ratio of about
0.60 would centre it, but the plan keeps the texture value when every legend is already within 1 px.

## 1920x1080 look (not a gate)

Wegolite `flight-1080.png` heights against 1.5 x Oolite's 1280x720 heights (Oolite scales the HUD with the
window height; `/tmp/ih8-tools/table1080.py`, lift 44.78 px):

| Legend | Oolite 720 | x 1.5 | Wegolite 1080 | Δ    |
| ------ | ---------- | ----- | ------------- | ---- |
| FWD    | 11         | 16.5  | 15            | -1.5 |
| AFT    | 11         | 16.5  | 15            | -1.5 |
| FUEL   | 8          | 12.0  | 12            | +0.0 |
| CT     | 8          | 12.0  | 12            | +0.0 |
| LT     | 9          | 13.5  | 12            | -1.5 |
| ALT    | 9          | 13.5  | 12            | -1.5 |
| MISS   | 12         | 18.0  | 18            | +0.0 |
| SPD    | 13         | 19.5  | 18            | -1.5 |
| ROLL   | 11         | 16.5  | 15            | -1.5 |
| PITCH  | 11         | 16.5  | 15            | -1.5 |
| E1     | 11         | 16.5  | 15            | -1.5 |
| E2     | 11         | 16.5  | 15            | -1.5 |
| E3     | 11         | 16.5  | 15            | -1.5 |
| E4     | 11         | 16.5  | 15            | -1.5 |

(SPD re-measured with a window that excludes the readout and a nearby star: rows 812 to 829, 18 px.)

## Screenshots for the owner

- 1280x720 flight: `/tmp/ih8-capture/run1/flight.png`
- 1280x720 message: `/tmp/ih8-capture/run1/message.png`
- 1920x1080 flight: `/tmp/ih8-capture/run1/flight-1080.png`
- Readings: `/tmp/ih8-capture/run1/capture.json`
- Upscaled crops: `/tmp/ih8-tools/crops/we-left.png`, `we-right.png`, `we-msg.png`, `we1080-left.png`,
  `we1080-right.png`; Oolite: `oo-left.png`, `oo-right.png`
- Oolite reference: `/tmp/ooref-ui/oolite/screenshots/06-flight.png`, `07-message.png`

I looked at both captures: the legends sit on their bars' centre lines as before, are visibly shorter and
narrower than with the width sizing, and the "7.0 LY" and "0.000 LS" readouts are clear of their legends. The
compass target in the capture is the station, so the witchpoint "W" is covered by the unit test only.

## Tests

- New `tests/hud/cap-text.test.ts` (12 tests): seen red (module missing), then green. It pins
  `OOLITE_CAP_PER_CELL` at 0.5625 in one literal assertion and derives every other expectation from it.
- No existing test was re-pinned: `tests/hud/clock-lines.test.ts` and `tests/hud/projection.test.ts` pass
  unchanged (their mocks have no `measureText` and take the 0.7 fallback).

## Gate results

| Gate | Where | Result |
| ---- | ----- | ------ |
| `docker compose run --rm test npx vitest run tests/hud/cap-text.test.ts tests/hud/clock-lines.test.ts tests/hud/projection.test.ts` | local | 62 passed |
| `docker compose run --rm test` (full, coverage) | local | exit 0 |
| `docker compose run --rm lint` | local | first run: prettier flagged `draw.ts`; formatted, rerun exit 0 |
| `docker compose run --rm typecheck` | local | exit 0 |
| Plan grep checks (Task 1, 5 of 5) | local | pass |
| Remote scratch capture (`ih8-capture.spec.ts`) | remote | `exit=0 elapsed=15s snapshot=cf7db5f` (1 passed) |
| `python3 -I /tmp/ih8-tools/table.py /tmp/ih8-capture/run1/` | local | exit 0, misses 0 |
| `docker compose run --rm test npx vitest run tests/contract/fidelity.test.ts tests/hud/cap-text.test.ts` | local | 20 passed, 1 skipped (verbatim mode, no `OOLITE_SRC`) |
| `docker compose run --rm lint npx prettier --check FIDELITY.md .planning/PROJECT.md CHANGELOG.md` | local | pass |
| `docker compose run --rm verify-full` | remote | `exit=0 elapsed=610s snapshot=86cc9a9`: Vitest 221 files, 5782 passed, 10 skipped; Chromium e2e 140 passed (7.9 min); hyperspace-failure production-bundle step 2 passed |

The remote scratch directory was removed through a throwaway busybox container; the scratch spec never entered
the repository.

## Deviations from Plan

- **Oolite line for the energy labels:** the plan cited `HeadUpDisplay.m:2022`; at 7437f22 the label size and the
  `OODrawString` call are lines 2019 to 2021, so the ledger cites `2019-2021`.
- **Message "H" window:** the plan gave the Oolite window (x 728 to 742); in Wegolite's monospace line the "y"
  starts at x 736, so the Wegolite window is x 722 to 735 (otherwise the descender counts). The result is the
  planned 14 px (rows 474 to 487).

Otherwise the plan was executed as written; no refit was needed.

## Known Stubs

None.

## Threat Flags

None. No new network, file or storage surface; `measureText` input is range-checked with a fallback
(T-261118-ih8-04) and measured once per context (T-261118-ih8-03).

The final stray-file check passes: `git status` shows only this task's directory and the other in-progress task's
`.planning/quick/261118-ioj-*/` (not touched here), and no Oolite screenshot or capture is tracked.

## Self-Check: PASSED

- FOUND: `src/render/hud/cap-text.ts`, `tests/hud/cap-text.test.ts`, `/tmp/ih8-capture/run1/flight.png`,
  `/tmp/ih8-capture/run1/message.png`, `/tmp/ih8-capture/run1/flight-1080.png`
- FOUND commits: `cf7db5f` (feat), `86cc9a9` (docs)
