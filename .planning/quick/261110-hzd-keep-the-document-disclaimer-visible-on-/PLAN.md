---
phase: quick-261110-hzd
plan: 261110-hzd
type: execute
wave: 1
depends_on: []
files_modified:
  - index.html
  - src/main.ts
  - src/ui/save-load.ts
  - tests/ui/station-footer.test.ts
  - tests/e2e/station-tabs.spec.ts
  - .planning/PROJECT.md
  - CHANGELOG.md
autonomous: true
requirements: []
gap_closure: true
must_haves:
  truths:
    - "The document disclaimer is visible at the bottom of #docked, #chart and #save-load; its NOTICE, LICENSE and ASSETS.md links remain clickable."
    - "Each station footer's bottom edge ends within one CSS pixel of the document disclaimer's top edge at 1280x720."
    - "The reserved strip follows the disclaimer's real height (including wrapped text at narrow widths) rather than a hard-coded 6rem."
    - "The Save/Load overwrite dialog still covers the disclaimer and its links while it is open, so its focus trap stays authoritative."
    - "The document keeps exactly one <footer>; the station footers remain div.station-footer."
  artifacts:
    - "index.html defines --document-footer-height and pads all three station overlays with it."
    - "src/main.ts measures body > footer with a ResizeObserver and keeps the custom property exact."
    - "Unit tests pin the CSS contract; browser tests prove flush geometry and link hit-testing on all three overlays."
  key_links:
    - "body > footer -> ResizeObserver in main.ts -> --document-footer-height -> overlay padding-bottom -> station footer flush above the disclaimer"
    - "#save-load[data-confirming=true] -> z-index 16 -> disclaimer and links covered until setConfirming(false)"
---

# Quick task 261110-hzd: keep the document disclaimer visible on every station overlay

## Goal and why

The unified station footer made the three station overlays visually consistent, but it exposed a layering difference: the document disclaimer (the single `body > footer` with the version, `NOTICE`, `LICENSE`, `ASSETS.md` links and the unofficial-fan/trademark paragraph) painted above `#docked` and below `#chart`/`#save-load`. The two full-screen overlays therefore hid the only legal/attribution surface in the UI.

The disclaimer must stay. It is the only UI surface that carries the licence links and the trademark disclaimer. Instead, every station overlay reserves its measured height and ends its own footer exactly at the disclaimer's top edge.

## Locked design contract

- Keep one document `<footer>`; never turn a station footer into a second `<footer>`.
- Measure the disclaimer at runtime; the `:root` `6rem` value is only a no-script fallback.
- All three overlays reserve the same strip and place their in-flow footer flush above it.
- The overwrite dialog is modal: while open, `#save-load` rises above the disclaimer so the focus trap and pointer blocking stay authoritative.
- No new dependency, no `src/sim` change, no change to the unified footer template or hint builder.

## Tasks

### Task 1: Reserve the measured disclaimer height

- Add `--document-footer-height: 6rem` to `:root`.
- Replace `#docked`'s hard-coded `6rem` bottom padding with `var(--document-footer-height, 6rem)`.
- Add the same bottom padding to `#chart` and `#save-load`.
- Add `trackDocumentFooterHeight(signal)` in `src/main.ts`; observe `body > footer` with `ResizeObserver`, write the pixel height to the custom property, disconnect on the lifecycle abort, and call it once at boot.

### Task 2: Keep the modal above the disclaimer

- Raise `body > footer` to `z-index: 15` (above station overlays at 10, below `#pause` at 20).
- Set `overlay.dataset.confirming` in `save-load.ts`'s `setConfirming`.
- Add `#save-load[data-confirming="true"] { z-index: 16; }`.

### Task 3: Prove geometry and modality

- Unit: pin the CSS contract for all three overlays, the fallback, `z-index: 15` and the confirming rule.
- Browser: at 1280x720, assert each station footer's bottom edge is within 1px of the disclaimer's top edge, and hit-test the first disclaimer link with `elementFromPoint`.
- Browser: with the overwrite dialog open, assert `data-confirming="true"` and that the disclaimer link is not the top hit.
- Run targeted typecheck, Vitest, Chromium e2e and lint in Docker. Do not run `verify` or `verify-full`; the user asked to inspect first.

## Verification

```bash
docker compose run --rm typecheck
docker compose run --rm test npx vitest run tests/ui/station-footer.test.ts
docker compose run --rm e2e sh -lc "npm run build && npx playwright test --project=chromium tests/e2e/station-tabs.spec.ts"
docker compose run --rm lint
```

## Out of scope

- Removing or restyling the document disclaimer.
- Reworking the unified footer template or hint strings.
- `verify`, `verify-full` and `e2e-cross` until the user asks.
