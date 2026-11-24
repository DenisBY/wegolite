---
created: 2026-11-24T00:00:00.000Z
title: The credits sign (₢) is hard to read at 16 px in the browser's generic monospace font
area: ui
severity: cosmetic
files:
  - index.html
  - src/ui/game-over.ts
---

## Problem

The credits sign U+20A2 (₢) is drawn from the browser's generic monospace font
at 16 px. It looks like a C cut off on the right, and the small "r" of the Cr
ligature does not resolve. This is not a clipping bug: the ink fits the advance
in Consolas, Courier New and DejaVu Sans Mono. It shows on the game-over score
line and on every station price screen.

Oolite draws its own bitmap glyph (`Resources/Config/oolite-font.plist`, line 29,
and `Resources/Textures/oolite-font.png`). Source:
`.planning/debug/game-over-lines-illegible-on-bright-background.md`.

## Solution direction

This is a global presentation decision, so choose one of these and record it:

- Accept the system glyph as it is.
- Render ₢ in a font, size or weight where the "r" resolves.
- Ship a small glyph modelled on Oolite's. This needs provenance recorded in
  `NOTICE` and `ASSETS.md`, and the asset is CC BY-NC-SA 3.0.
