---
created: 2026-11-17T18:00:00.000Z
title: Bring the docked status, manifest and market screens closer to Oolite (UI comparison 261117-nfn)
area: ui
severity: normal
files:
  - src/ui/station-model.ts
  - src/ui/station.ts
  - src/sim/player/profile.ts
  - index.html
---

## Problem

Quick task 261117-nfn compared Wegolite's docked screens with a running Oolite 1.93.1-255 (new commander at
Lave, 1280x720). The pairs are `market`, `status` and `manifest` in the local `/tmp/ooref-ui/compare.html` (not
committed: the screenshots are CC BY-NC-SA output). Differences, in rank order:

- R1, market. Legality column. Oolite's column is "Legal:" and prints "Im" (import legal, export not) for Slaves,
  Narcotics and Firearms; "Ex" would mean export legal only, "Re" neither, "—" both. Wegolite's column is "Ex" and
  prints "Ex" for the same goods, which reads as Oolite's opposite. Oolite: `src/Core/Entities/PlayerEntity.m:9675-9690`,
  `Resources/Config/descriptions.plist` `oolite-legality-*`. Wegolite: `src/ui/station-model.ts:147,261`.
- R1, market. Oolite shows "Filter: All goods" and "Sort: Default" under the table and then
  "Cash: 100.0 ₢. Load 0 of 20 t."; Wegolite has no filter or sort and no load line in the visible area. Oolite:
  the F8 screen in `src/Core/Entities/PlayerEntity.m`. Wegolite: `src/ui/station-model.ts`, `index.html`.
- R1, status. The rating has no kill count: Oolite "Harmless (0)", Wegolite "Harmless". Wegolite:
  `src/ui/station-model.ts:366-367`.
- R1, status. Ship name "Cobra Mk III"; Oolite "Cobra Mark III" (the scenario's `ship_class_name`). Wegolite:
  `src/ui/station-model.ts:323`.
- R1, status and market. Currency: Wegolite prints "Cr"; Oolite 1.93 prints "₢". Wegolite's own hover card already
  prints "M₢". Wegolite: `formatDecicredits` in `src/sim/player/profile.ts`.
- R1, manifest. Oolite shows "Cargo 0 t (20 t)", "Passenger Cabins 0 / 0" and "No cargo carried."; Wegolite lists
  all 16 goods with "—" and shows no capacity or cabin line in the visible area. Wegolite: `src/ui/station-model.ts`
  (manifest rows), `index.html:1858-1871`.
- R1, all docked screens. Oolite draws the dashboard (shields, fuel, scanner, missiles, clock) under every docked
  screen; Wegolite's station overlay hides it. Oolite: `Resources/Config/hud.plist`. Wegolite: `index.html`
  (`#docked`). Low play value; owner call.
- R2, market. Only 11 of 17 rows fit at 1280x720 (Machinery to Alien Items need scrolling); Oolite fits all 17
  rows and both footer lines. Wegolite: `index.html` (`#station-screen` `overflow-y: auto`, row height and
  padding).
- R2, status. The equipment list ("Missile ×3", "Forward Pulse Laser") is below the fold on page 1, under Rating;
  Oolite shows "Equipment: Forward Pulse Laser" on the same screen. Wegolite: `index.html:1854-1856`.
- R3, all docked screens. Oolite: a red centred title over a rule, yellow values, green column headers and a red
  selection bar, out-of-stock rows drawn normally. Wegolite: all green, a left-aligned heading, a green selection
  bar, and dimmed out-of-stock rows. Wegolite: `index.html` styles. Related:
  `.planning/todos/pending/2026-11-11-terminal-color-palette-setting.md` (palette switching; an Oolite palette
  could be one option).

Matches: the status field set and order (Present System, Hyperspace System, Condition, Fuel, Cash, Legal Status,
Rating) and values, and the market row order. The "(Unknown)" hyperspace target is in
`2026-11-17-ui-flight-hud-differences-from-oolite.md`. Not a UI difference: the prices and stock differ in every
row because both games draw a random market for a new commander (PROJECT.md row "Stable market across reload:
persist the seed"). Decided, not to fix: the tab strip, the Home screen and the Status/Manifest sub-tabs (row
"Add a clickable F-key-ordered tab strip…"), and the shared key-hint footer (row "Unify the docked, chart and
Save/Load footer…").

## Solution

Likely changes, one per bullet; none is implemented yet:

- Rename the column "Legal" and print Oolite's four values from both legality fields.
- Add Oolite's load line ("Load 0 of 20 t."); owner call on the filter and sort.
- Print the kill count after the rating.
- Use "Cobra Mark III".
- Switch the credit unit to "₢" everywhere (check the font has the glyph; the hover card shows it does), or record
  "Cr" as a decision.
- Replace the manifest table with Oolite's capacity, cabins and cargo lines (list only the goods held).
- Owner call on a docked dashboard strip.
- Make all 17 market rows and the status equipment list fit at 1280x720 (tighter rows or a two-column status
  page).
- Owner call on an Oolite-like palette (red titles, yellow values) through the palette todo.
