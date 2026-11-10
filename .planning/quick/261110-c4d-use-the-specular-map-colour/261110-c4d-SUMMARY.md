---
phase: quick-261110-c4d
plan: 261110-c4d
subsystem: content
tags: [fidelity, materials]
status: complete
---

# Quick task 261110-c4d: use the specular map colour

## What changed

`writeGlb` emits `specularColorTexture` (same texture index as
`specularTexture`) and `specularColorFactor: [1, 1, 1]` for every material that
authors a specular map. Both GLBs were regenerated; their `ASSETS.md` hashes
and the manifest follow. No texture file changed and none was added.

Three.js applies the sRGB transfer to a specular colour map, which matches
Oolite's own gamma correction of the map's RGB. The alpha channel is not
affected by that transfer, so the strength read by `specularTexture` is
unchanged.

## Visible effect

Highlights on the Cobra and the Coriolis are tinted and attenuated by the map
instead of being uniformly white. In a software-rendered screenshot of the
station from the sun side the change is slight. It applies at both graphics
qualities.

## Verification

Run in Docker on the tree that also holds the footer and test-speed changes
merged after quick task 261110-b7w:

- `docker compose run --rm verify-full`: lint, typecheck, `assets:check`, 103
  unit files and 1367 tests passed; Chromium browser suite 113 passed, 1
  failed.
- The failure was `station.spec.ts` "F3 is a two-pane keyboard outfitting
  screen": after the footer refactor it expected an empty status line after Y
  on a disabled row, which only held when the read beat the loop frame that
  applies the key. The row's reason is shown there by design. The assertion now
  waits two loop frames and checks that no `[Y/N]` prompt and no pending
  purchase exist. Fixed in a separate commit.
- After the fix: `station` and `models` specs with `--repeat-each=3`: 33
  passed; `lint` and `assets:check` passed.

Not run again after the fix: the whole gate, and `e2e-cross` (Firefox).

## Still open

Alpha as gloss rather than strength (review item P8, second half).
