# Sketch 001: Docked Home Screen (Variants 1 & 2) & Station Backgrounds (A & B)

**Date:** 2026-11-11
**Mood / Aesthetic:** Retro-futuristic GalCop CRT Terminal (`#000` / `#33ff66` / `#ffd966`, Oolite `screenbackgrounds.plist` + `demoShipMode` heritage)
**Target Area:** `#docked` station overlay (`index.html`, `src/ui/docked.ts`, `src/ui/station.ts`, `src/app/game-session.ts`)

## Combinations Explored

The prototype allows switching across all 4 combinations (`[1A]`, `[1B]`, `[2A]`, `[2B]`) plus 3D shading modes and terminal palettes:

### Station Backgrounds
- **Background A — 3D Rotating Cobra Mk III (`demoShipMode`):**
  - Renders the authentic 12-vertex, 20-face `cobra3_redux.dat` mesh rotating above a 3D landing pad ring under Oolite hangar lighting (`Hangar Lit + Wire`, `Pure Wireframe`, or `Oolite Shaded`).
  - Semi-transparent `#docked` cards (`backdrop-filter: blur(4px)`) and a peripheral `docked_overlay` bezel let the 3D bay show through across all station tabs.
- **Background B — Procedural SVG/CSS Coriolis Hangar Bay:**
  - Vector industrial hangar interior (`CORIOLIS BAY 04 // MAGCON APERTURE`) with perspective structural ribs, landing pad grid, hazard chevrons, and CRT scanlines.
  - Zero runtime GPU/WebGL cost while docked (`redrawGate` remains paused).

### Main Docked Screen (`Home`) Layouts
- **Variant 1 — Arrival Report & Ship Berth (`[1A]`, `[1B]`):**
  - Combines Oolite's `GUI_SCREEN_REPORT` arrival banner and `planetinfo.plist` system summary with a 3-column berth dashboard (without duplicating the top `.station-nav` hotkeys):
    - **Left:** Ship Service (interactive Quirium fuel bar with jump target marker, 1-click `Refuel`, cargo hold breakdown, fitted modules).
    - **Center:** Open Hangar Viewport framing the 3D Cobra Mk III or SVG hangar bay + in-place hyperspace beacon selector.
    - **Right:** GalCop Station Report & Local Market Radar (best exports/imports on Lave vs Galactic Average).
- **Variant 2 — Interactive Hangar Bay Overview / Ship Blueprint (`[2A]`, `[2B]`):**
  - Focuses on the docked Cobra Mk III with 4 interactive subsystem callouts (`[SYS-01] Witchspace Drive`, `[SYS-02] Cargo Hold`, `[SYS-03] Hardpoints & Avionics`, `[SYS-04] Arrival Report & Log`).
  - In `2A`, leader lines track the live 3D vertices of the rotating Cobra Mk III and highlight the selected hull faces; in `2B`, leader lines attach to an orthographic top-down CAD projection of `cobra3_redux.dat`.
  - Clicking any callout updates the right-hand Subsystem Inspector drawer with in-place telemetry and controls (Refuel, direct nearby beacon lock, cargo valuation, and weapon/pylon slot status).
