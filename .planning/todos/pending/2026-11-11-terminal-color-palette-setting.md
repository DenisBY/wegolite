---
created: 2026-11-11T12:00:00.000Z
title: Add terminal color palette switcher in game settings
area: ui
severity: normal
files:
  - src/settings/schema.ts
  - src/ui/settings-panel.ts
  - src/app/game-session.ts
  - index.html
---

## Problem

The docked station terminal and UI overlays currently use a fixed phosphor-green (`#33ff66`) palette. During the docked home screen sketch exploration (`.planning/sketches/001-docked-home-and-backgrounds/`), three retro CRT / Oolite-inspired terminal color palettes were prototyped in `.planning/sketches/themes/default.css`:

1. **Phosphor Green (default)** — classic `#33ff66` phosphor green on `#000000` with `#2f8a47` control borders and `#ffd966` highlights.
2. **Amber CRT** — classic 80s monochrome amber monitor (`#ffb000` primary, `#ffd27d` secondary, `#9e6b00` control borders, `#050300` background).
3. **XenonUI Cyan** — modern Oolite XenonUI/BGS-inspired cool cyan terminal (`#38e8ff` primary, `#9befff` secondary, `#1f7a8c` control borders, `#01060a` background).

Players cannot currently switch between these palettes in the in-game Settings panel.

## Solution

- Extend `SettingsV1` in `src/settings/schema.ts` (preserving backwards-compatible defaults when loading existing saves/settings) with a terminal palette option (`"phosphor" | "amber" | "cyan"`, defaulting to `"phosphor"`).
- Expose a palette selector control in `src/ui/settings-panel.ts` alongside the existing pause-on-focus-loss and graphics-quality controls.
- Apply the chosen palette via `data-theme` (or CSS custom properties on `document.documentElement` / `#docked` / station overlays) in `index.html` and `src/app/game-session.ts`, ensuring all palettes maintain the 3:1 control-boundary contrast requirement.
