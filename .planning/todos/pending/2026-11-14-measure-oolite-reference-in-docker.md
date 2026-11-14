---
created: 2026-11-14T18:00:00.000Z
title: Run a real Oolite in a Docker image and measure masses, blockage distances and UI against it
area: tooling
severity: minor
files:
  - FIDELITY.md
  - .planning/phases/10-ship-mass/
  - src/sim/hyperspace/countdown.ts
audit_acknowledged:
  milestone: v2.1
  at: 2026-11-14
---

## Problem

Wegolite computes ship masses and the jump-blockage radii from the vendored Oolite models with Oolite's own
algorithm, but nothing has been compared with a running Oolite. In Phase 10 the owner accepted the reading
"algorithm reproduced and cross-checked in float64, nine hulls match the community VariableMasslock table"
for ROADMAP Phase 10 criterion 2 (`criterion2-accept`, 2026-11-14) on the condition that a check against a real
Oolite follows as a separate task. This is that task.

Open numbers (our value, what to confirm):
- Coriolis station: 515,483,904 computed (hull 228,650,880 + faceplate, tris and dock) against the historical
  455,223,200 from the comment at `ShipEntity.m:12504`. Blockage radius 7,180 m against 6,747 m (a +13.2% gap).
- Buoy and witchpoint buoy: 698,691.1875 each (blockage radius about 264.3 m).
- Cobra Mk III player ship: 214,737.6875. The nine NPC role ships: adder 16045.49, cobramk1 52291.84,
  gecko 24669.996, krait 93291.41, mamba 35806.99, moray 51203.44, shuttle 11317.56, sidewinder 25087.62,
  viper 34040.68.
- Mass-lock range (strict d^2 < 25,600^2 for ships) and blockage with real ships (Phase 12).

## Solution

Owner decision (2026-11-14): do this after Phase 12 finishes its gates, not during it (the slow machine would
slow the execution and the timing-sensitive browser tests).

Plan:
1. A separate Docker image outside the project `docker-compose.yml` (its own directory, for example
   `tools/oolite-reference/`, or outside the repository; the owner picks). Contents: the ready-made Oolite
   AppImage run with `--appimage-extract-and-run` (the owner says AppImage and Flatpak builds exist; AppImage is
   preferred because Flatpak inside Docker needs bubblewrap), `xvfb`, Mesa llvmpipe, `xdotool` and ImageMagick
   `import`. Audio: `SDL_AUDIODRIVER=dummy`. Fall back to building from `/home/opencode/git/oolite` (GNUstep) only
   if the AppImage does not run.
2. A throwaway OXP kept outside the repository (OXP support is out of scope for the project): at startup it
   creates a Coriolis station, the buoys and the NPC ships and writes `ship.mass` (and the radius) to
   `Latest.log`. No debug console needed.
3. Compare each value with the table above. If a value differs, change one constant and its pin and update
   FIDELITY.md (a cheap revert, as recorded in Phase 10).
4. UI comparison: screenshots of the scanner, HUD and messages from the xvfb display next to Wegolite's.
5. Provenance: do not commit the Oolite binary or its assets (code is GPL, assets CC BY-NC-SA); record what was
   used (version, source of the AppImage) in FIDELITY.md or the todo's SUMMARY.

Risks: audio and the OpenGL version Oolite demands under llvmpipe; software rendering may differ in small
visual details (does not affect the mass numbers). Estimate: half an hour to two hours, mostly the headless run.

Related: `.planning/todos/pending/2026-11-14-make-buoys-block-hyperspace-like-oolite.md` (the buoy blockage
decision can use the measured blockage distances).
