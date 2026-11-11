# Changelog

All notable changes to Wegolite are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Visual placeholders on the flight HUD for the remaining Oolite dashboard
  gauges (`FWD`, `AFT`, `CT`, `LT`, `ALT`, `MISS` missile pylons, and `E1`–`E4`
  energy banks) alongside the live `FUEL`, `SPD`, `ROLL`, and `PITCH` gauges.

### Fixed

- The flight scanner and dashboard instruments now match Oolite's layout and
  projection: red oval grid with 5 km range graduation ticks and forward
  field-of-view cone lines, forward contacts plotted in the upper half of the
  disc, lollipop markers with translucent vertical stalks and solid rectangular
  caps at the contact's elevation (green for the station, yellow for the
  navigation buoy and witchpoint beacon), and `FUEL`, `AEGIS`, `COMPASS`, and
  `SPD` / `ROLL` / `PITCH` (with yellow diamond indicators) aligned on the
  scanner's horizontal band.

### Changed

- The navigation buoy in front of the station and the beacon at the witchpoint
  are now Oolite's own buoy model with its flashing lights, slowly tumbling.
  They were a plain turquoise marker before. The first load grows by about
  1.6 MB.

## [0.2.0] - 2026-11-10

Two changes in this release are not backward compatible:

- The ship and station models now need a browser that decodes WebP. Every
  current Chrome, Firefox and Safari does.
- A save that holds four missiles cannot be read by 0.1.0, which allowed
  three. Saves written by 0.1.0 load in this release unchanged.

### Added

- A system information card when hovering a marker on the F6 galactic chart,
  including the planet description and distance from the current system.
- Mouse-wheel zoom and drag-to-pan on the F6 chart.
- A clickable, F-key-ordered station tab strip with an Interfaces screen.
- A "High-quality graphics" setting, off by default. It follows Oolite's
  rendering more closely: sun-angle shading that makes the planet read as a
  sphere, muted colours, soft layered clouds, an atmosphere haze with a thin
  coloured rim, and nebulae in the sky. The default rendering is unchanged.
- A coverage-free `npm run test:fast` script for quick local unit runs;
  `npm run test`, the one `verify` uses, keeps the measured coverage thresholds.

### Changed

- The docked station, F6 chart and F2 Save/Load screens share one two-line
  footer: live key hints above a single status line. The footer height no
  longer changes when a confirmation or save notice appears, and every key
  label follows a rebound key.
- The F6 chart and F2 Save/Load headers show the live credit balance instead of
  a static key label.
- The station footer no longer repeats the screen-switch key list already shown
  in the tab strip.
- The game downloads about 0.7 MB less at start: it now loads only the two
  ship records it uses instead of the whole ship catalogue.
- The first load is about 13 MB smaller: the ship and station textures are
  served as WebP (6.3 MB) instead of PNG (19.7 MB). The diffuse and specular
  maps are lossy at quality 90 and the normal maps are near-lossless, so the
  picture is not exactly the previous one, but no difference is visible in
  side-by-side screenshots. A browser without WebP support can no longer load
  the models; every current Chrome, Firefox and Safari has it.
- The Cobra has four missile pylons, as in Oolite and the original Elite. A new
  commander still starts with three missiles and can buy the fourth on the F3
  screen. Existing saves are unaffected.
- For contributors: the GitHub Pages deploy now runs only after the `verify`
  workflow passes on `main`, and publishes the commit that run checked. It used
  to publish every push, passing or not.
- Highlights on the Cobra and the station now take their colour from Oolite's
  specular maps, as Oolite does. Before, only the map's strength channel was
  used and every highlight was white.
- The game no longer redraws the scene while docked or paused. The image does
  not change in those states, so it is drawn once and the GPU is left idle,
  which lowers power use and fan noise on the station screens.
- The e2e loop is faster: the WR-04 fault-seam spec now runs from its own
  `playwright.seams.config.ts` via `npm run test:e2e:seams`, so ordinary and
  targeted Playwright runs (including the `verify` fast gate) no longer build
  the test-only Vite bundle. Set `WEGOLITE_REUSE_PREVIEW=1` to reuse a long-lived
  preview in the local loop; CI keeps preview reuse off.
- Guard tests now lint their probes through one shared ESLint Node API instance
  instead of spawning `npx eslint` for each assertion, removing most of the unit
  stage's repeated ESLint program builds. Assertions and coverage are unchanged.

### Removed

- The redundant F7 system-data screen. The F6 hover card now carries the same
  fields and planet description.

### Fixed

- Starting a New game no longer deletes the previous save when the game then
  fails to load. The old save is replaced only once the new game has started.
- A failure while starting a game always shows the error screen. Some failures
  used to leave the title screen up with buttons that did nothing.
- Settings saved by a newer version of the game are no longer overwritten by
  an older version opened in the same browser.
- The fixed document disclaimer now stays visible and clickable under the F6
  chart and F2 Save/Load screens, not only under the docked station. Every
  station footer ends exactly at the disclaimer's top edge, with the reserved
  height measured at runtime instead of a fixed gap.
- The F6 chart plot is no longer partly hidden under the footer; the canvas and
  the station and Save/Load content end above it at 1280x720.
- The station footer no longer covers the bottom of long Market and Manifest
  lists; the screen scrolls above it.
- The docked shell now covers the full viewport, so the planet no longer shows
  through the strip reserved for the document disclaimer.
- The F6 hover card now places its description and distance beside the pointer
  without clipping at the overlay edges.

## [0.1.0] - 2026-11-08

The first public release: launch from Lave, manual docking, the docked market
and outfitting screens, hyperspace within the first galaxy, and saves. This
file was started after it, so its changes are not itemised here.
