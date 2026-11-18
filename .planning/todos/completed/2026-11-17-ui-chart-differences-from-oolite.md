---
created: 2026-11-17T18:00:00.000Z
title: Bring the F6 chart and its hover card closer to Oolite (UI comparison 261117-nfn)
area: ui
severity: normal
files:
  - src/ui/chart.ts
  - src/ui/chart-draw.ts
  - src/ui/chart-model.ts
  - src/ui/station-model.ts
  - index.html
---

## Problem

Quick task 261117-nfn compared Wegolite's F6 chart with a running Oolite 1.93.1-255 (new commander at Lave,
1280x720). The pairs are `chart-short` (Oolite's short-range chart against the local preset), `chart-galactic`
(Oolite's galactic chart against the galaxy preset) and `sysdata` (Oolite's F7 against the Lave hover card) in the
local `/tmp/ooref-ui/compare.html` (not committed: the screenshots are CC BY-NC-SA output). Differences, in rank
order:

- Done in quick task 261118-cyo: R1. No galaxy number in the title: Oolite "Galactic Chart 1", Wegolite "Galactic chart". Wegolite:
  `index.html:1880`.
- Done in quick task 261118-cyo: R1. The markers carry no information. Oolite colours each system by its sun colour and sizes it by planet
  radius (`src/Core/GuiDisplayGen.m:1789-1865`); Wegolite draws uniform green dots. Wegolite:
  `src/ui/chart-draw.ts`.
- Done in quick task 261118-cyo: R1. No planet search. Oolite's galactic chart has a "Find planet:" prompt. Wegolite: `src/ui/chart.ts`.
- Decided 2026-11-18, not to fix: (owner keeps it, PROJECT.md "Keep the 7 ly jump graph on both chart presets") R1. Extra: Wegolite draws the 7 ly jump graph (875 edges) on both presets; Oolite draws no links outside
  route planning. Wegolite: `src/ui/chart-draw.ts:72-78`. No recorded decision; owner call whether to keep it.
- Done in quick task 261118-cyo: R1, system data. The hover card adds an "Inhabitants" label; Oolite prints "(Human Colonials)" under Population
  with no label. Wegolite: `src/ui/station-model.ts:534`.
- Done in quick task 261118-cyo: R2. Galaxy preset: the thinned labels clump in the middle of the galaxy and overprint each other. Label
  thinning is decided; the overlap is not. Wegolite: `src/ui/chart-model.ts` (label selection).
- Decided 2026-11-18, not to fix: (the colours stay as they are for now) R3. Labels are green (Oolite yellow), and the current system is a white disc (Oolite a red and green cross
  cursor). Wegolite: `src/ui/chart-draw.ts`.

Matches: the neighbours and their orientation around Lave, the green 7 ly range circle, and every hover-card
value (economy, government, tech level, population, productivity, radius, distance, description). Decided, not
to fix: the presets, the local zoom (spanX 80, wider than Oolite's short-range chart), the full-width map instead
of Oolite's framed panel and the label thinning (PROJECT.md Key Decisions row "Replace the F6 chart's Short/Long
sub-tabs with one continuous camera and two presets"); north-up (row "Keep the galactic chart north-up"); the
removed F7 screen and its planet picture (commit `c1c9897`).

## Solution

Likely changes, one per bullet; every one is done or decided:

- Done in quick task 261118-cyo: Put the galaxy number in the chart header ("Galactic Chart 1").
- Done in quick task 261118-cyo: Colour the markers by sun colour and size them by planet radius, using Oolite's blob formula; check the
  content build carries the sun colour.
- Done in quick task 261118-cyo: a planet-name search (PROJECT.md "Find planet on the galactic chart through a text box").
- Decided 2026-11-18, not to fix: the 7 ly graph stays as a Wegolite aid.
- Done in quick task 261118-cyo: Drop the "Inhabitants" label and print the inhabitants under the population.
- Done in quick task 261118-cyo: Lay out the galaxy-zoom labels without collisions (skip a label that overlaps one already placed).
- Decided 2026-11-18, not to fix: yellow labels and Oolite's cross cursor; the colours stay as they are for now.
