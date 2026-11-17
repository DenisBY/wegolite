---
created: 2026-11-14T18:00:00.000Z
title: Run a real Oolite in a Docker image and measure masses, blockage distances and UI against it
area: tooling
severity: minor
files:
  - FIDELITY.md
  - tools/oolite-reference/README.md
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

Measured (quick task 261117-jji, 2026-11-17): the Coriolis, both buoys, the Cobra Mk III and the nine NPC
masses are all bit-exact equal to Wegolite's values in a running Oolite 1.93.1-255 (13 of 13 EQUAL), and so are
the nine NPC radii and the Cobra radius. The Coriolis and buoy collision radii differ from the layout constants
(779.37 against 500, 59.14 against 10): those are Wegolite's own values, left unchanged. Values and verdicts are
in the FIDELITY.md Constants ledger; the run evidence is in the quick task's SUMMARY. The mass-lock range and
the blockage with real ships stay open.

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
   **Done** (owner chose `tools/oolite-reference/`, outside `compose.yaml` and every gate; built and
   smoke-checked in quick task 261117-iuw on 2026-11-17). Oolite 1.93.1-255 AppImage, extracted at build time.
   Run it with `tools/oolite-reference/run-remote.sh --steps <file> --addons <dir>`; see
   `tools/oolite-reference/README.md`. The smoke check reached the docked status screen and read a throwaway
   OXP's `log()` line from `Latest.log`.
2. A throwaway OXP kept outside the repository (OXP support is out of scope for the project): at startup it
   creates a Coriolis station, the buoys and the NPC ships and writes `ship.mass` (and the radius) to
   `Latest.log`. No debug console needed.
3. Compare each value with the table above. If a value differs, change one constant and its pin and update
   FIDELITY.md (a cheap revert, as recorded in Phase 10).
   **Done for the masses** (quick task 261117-jji, 2026-11-17). The OXP is outside the repository
   (`/tmp/ooref-mass/addons/wegolite-mass.oxp`); it logged the 13 ships at `startUpComplete`. No constant
   changed: every mass and every NPC and player radius was equal.
4. UI comparison: screenshots of the scanner, HUD and messages from the xvfb display next to Wegolite's.
5. Provenance: do not commit the Oolite binary or its assets (code is GPL, assets CC BY-NC-SA); record what was
   used (version, source of the AppImage) in FIDELITY.md or the todo's SUMMARY.
   **Done for the reference build**: the version, URL and SHA256 are recorded in the README, in the FIDELITY.md
   Open items and in the 261117-iuw SUMMARY. Each measurement run records its own `session.txt` and
   `wrapper.txt` in its SUMMARY.

Open: the mass-lock range and real-ship blockage bullet, step 4 (UI comparison) and the Phase 16 wreck lifetime
and explosion items below. No mass difference is waiting for the owner. The reference build is 1.93.1-255, not the 1.93.1-241 pin; see
the FIDELITY.md Open items bullet "Reference Oolite for measurements".

Risks: audio and the OpenGL version Oolite demands under llvmpipe; software rendering may differ in small
visual details (does not affect the mass numbers). Estimate: half an hour to two hours, mostly the headless run.

Added by Phase 16 (plan 16-09), the debris and explosion items:
- Wreck lifetime (PROJECT.md Key Decisions row "Wreckage burns down by Oolite's heat damage, about E/1000
  seconds (LOW confidence)"; FIDELITY.md E-80). Wegolite drains a wreck's energy by `dt x (1000 - 10 x age)`
  while the temperature is above 256, so a wreck of energy E (50 to 675, half its lifetime) lasts
  `(1000 - sqrt(1e6 - 20 E)) / 10` seconds, 7 to 82 ticks at 120 Hz. Measure it: in the throwaway OXP, destroy
  a ship that can fragment and log each wreck's `energy` and `temperature` every frame from its creation to its
  removal; compare the lifetimes with the formula. If they differ, change `wreckHeatDrain` and its pins
  (`tests/sim/world/debris.test.ts`) and update the row.
- Explosion and debris look: screenshots of an explosion (the cloud of 10 particles, the white flash of 0.4 s)
  and of the pods, the alloy plate and the burning wrecks tumbling, next to Wegolite's, at the same distance.
  The tumble is a render rule from each piece's orientation (D16-10, OC-2), so compare the spin rates, not the
  exact attitudes.

Related: `.planning/todos/pending/2026-11-14-make-buoys-block-hyperspace-like-oolite.md` (the buoy blockage
decision can use the measured blockage distances).
