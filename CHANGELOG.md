# Changelog

All notable changes to Wegolite are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Navigation buoys take laser damage (250 energy, recharging 2 per second)
  and can be destroyed. A destroyed buoy explodes, no longer stops a laser and
  stays destroyed until your next launch, jump or load, which restores both
  buoys.
- A destroyed buoy disappears from the view and the scanner, a rammed buoy is
  shown where it drifts, and the compass turns from a destroyed witchpoint
  beacon to the planet.
- Cargo pods and alloy plates can be shot; a navigation buoy's inner assembly
  takes damage and can be shot away.
- Ident locks the Coriolis station, the navigation buoys, cargo pods and alloy
  plates, and names them. A lock on a buoy ends when the buoy is destroyed;
  wrecks are never locked.
- Ships, cargo pods and alloy plates now collide: both sides take damage by
  Oolite's mass and closing-speed rule and rebound. Touching the station hull
  stays harmless.
- Navigation buoys collide too: a rammed buoy takes damage and is pushed away,
  as in Oolite.
- In a test session (`?test=1&traffic=1`) a new test hook member,
  `spawnTestAttacker()`, puts a Viper 3,000 m ahead of you that attacks you
  with Oolite's attack manoeuvres and fires through the NPC fire gate. It marks
  the session as test-tainted, so nothing is saved. In normal play NPC ships
  still never fire.

### Changed

- A witchspace jump that completes within about 264 m of a navigation buoy is
  now aborted, as in Oolite. A destroyed buoy no longer blocks.
- A laser shot now stops at the Coriolis station, which absorbs it. The station
  takes no damage, and a shot through the docking slot stops where Oolite's
  stops: on the dock, the faceplate or the hull.
- The flight HUD now shows during the launch from the docking slot, as in
  Oolite. Until you leave the slot the compass shows no target and the roll
  indicator stays centred.
- Launching now shows the view from your cockpit, starting at the far end of
  the station's docking slot, gliding out through it and on toward the planet,
  instead of the abstract tunnel animation. The first moments in the slot pass
  no game time, and after your first launch any key still skips the whole
  sequence.
- Without the Advanced Space Compass the compass works as in Oolite: it points
  at the main station when you are near the planet or the station and at the
  planet otherwise, and the cycle-compass and target-station keys do nothing
  until you fit the Advanced Space Compass.
- In a test session (`?test=1&traffic=1`) the test shooter now fires through
  Oolite's NPC fire gate (heat, energy, the shot timer, a range roll and aim),
  so it fires its beam at Oolite's own rate, about nine shots a second (one
  every 13 ticks, the same as your beam), instead of once per AI think, and its
  hits drain your shields and then your energy. In normal play NPC
  ships still never fire.

### Fixed

- In a test session (`?test=1&traffic=1`) an NPC ship whose Oolite ship data
  sets a laser colour now fires in that colour, as in Oolite, so a GalCop
  Viper's shots are magenta, not yellow. Other ships and your own shots keep
  their laser's colour. In normal play NPC ships still never fire.
- Your ship now leaves the station along the docking slot, wings along its
  long side, as in Oolite. Before, it left turned 90 degrees, across the slot.
- Starting a new game or loading a save shows the market in its usual order
  again; a column sort no longer carries over.
- In a test session (`?test=1&traffic=1`) an NPC's range roll now multiplies
  its draw by the weapon range in single precision, as Oolite does, so a shot
  at the very edge of the roll (a fraction of a millimetre) is refused or
  allowed as in Oolite. In normal play NPC ships still never fire.

## [0.6.0] - 2026-11-18

### Added

- Clicking a market column heading sorts the goods by name, unit, price,
  stock or the amount in the hold; a second click reverses the order and a
  third restores the usual order. The arrow keys and buying and selling follow
  the sorted list.
- Find planet on the galactic chart: press `/`, type the start of a system's
  name, use Down and Up for the next match, Enter to set it as the
  destination and Esc to clear the search. Every match is boxed in green.
- The first time you fly inside a station's safe zone, a one-time hint
  explains the green "S" on the HUD: "S: you are inside the station's safe
  zone".
- The HUD keeps Oolite's abbreviations, and a one-time hint explains each
  gauge the first time it matters: LT when the laser heats up, FWD/AFT when a
  shield is first hit, E1-E4 when the energy banks run low, CT when the cabin
  heats, and FUEL after the first jump.

### Changed

- Credit amounts of 10 000 ₢ and more are grouped in threes, as in Oolite
  (with a non-breaking space: "10 000.0 ₢").
- The market shows all 17 goods and Oolite's line "Cash: 100.0 ₢. Load 0 of
  20 t." under the table at 1280x720 without scrolling.
- The manifest (Status page 2) shows Oolite's lines: "Cargo 0 t (20 t)",
  "Passenger Cabins 0 / 0", then only the goods carried ("3 t × Food"), or
  "No cargo carried.".
- The Status page shows the equipment list beside the commander's details, so
  it is visible without scrolling.
- The galactic chart's title names the galaxy: "Galactic Chart 1".
- The system card on the chart prints the inhabitants under the population
  without a label, as Oolite does.
- Chart systems are drawn in their star's colour and sized by their planet's
  radius, as in Oolite; the current system, the destination and the
  selection are marked with rings.
- Chart labels no longer overlap at any zoom.
- Outfitting (F3) now lists only the equipment you can buy or fit at this
  station, as in Oolite. Items above the system's tech level, already fitted,
  or with no room (full pylons, a full tank, no cargo space) are no longer
  shown. Items you cannot afford stay listed, dimmed, with "Not enough
  credits". When nothing can be offered the screen reads
  "No equipment available for purchase.".
- The hyperspace countdown reads like Oolite ("Witchspace to Diso in 15 s.")
  in the message area and pulses once a second. A message posted during the
  countdown shows only until the next count replaces it, and after a cancel
  the last count fades out within a second.
- The flight HUD follows Oolite's size and layout: a larger scanner,
  crosshair and compass; messages in yellow above the scanner, right of
  centre, up to ten rows; the condition light under the scanner beside the
  aegis indicator. Oolite's HUD reaches the bottom edge of the window, so the
  HUD sits on top of the disclaimer strip instead, keeping Oolite's sizes and
  spacing.
- The version text and the "Wegolite — system" line no longer show in flight,
  so they never cover the clock.
- Buoys flash green and yellow on the scanner, as in Oolite.
- The compass is Oolite's blue ring; its marker moves to the centre as the
  target comes dead ahead (it used to stay on a fixed circle), the planet is
  a filled dot, the station a square and the witchpoint a diamond with its
  "W". The letter under the compass is gone.
- The aegis indicator is Oolite's green "S", without a caption.
- The flight HUD's gauge labels (FWD, AFT, FUEL, CT, LT, ALT, MISS, SPD,
  ROLL, PITCH, E1 to E4), the "7.0 LY" and "0.000 LS" readouts and the
  compass's "W" are smaller: their capitals are as tall as Oolite's. They are
  narrower than Oolite's because the HUD font is monospace.
- The "0.000 LS" speed readout is now the same size as its SPD label; the
  "7.0 LY" readout keeps the size of its FUEL label.

## [0.5.0] - 2026-11-17

### Added

- A ship destroyed in flight now explodes: a white flash and a cloud of fire
  mark where it was. The explosion leaves a metal plate and burning wreckage
  that burns out within a second, and a ship that carried cargo spills
  cargo containers. The pieces drift away and tumble; nothing can be picked
  up yet.
- The pause menu's Settings panel has a "Show FPS counter" option, off by
  default. When it is on, the game's frame rate appears as "FPS: 60" at the
  right end of the bottom strip, in flight and while docked, refreshed twice a
  second. The choice is stored with your other settings, and Reset all
  settings turns it off.

### Changed

- The Coriolis station and both buoys now use Oolite's collision sizes, about
  779 m and 59 m instead of 500 m and 10 m. As a result, NPC ships keep further
  from the station, ships placed near the station appear a little further out,
  an arrival very close to the witchpoint lands slightly further from the
  buoy, and the station and buoys reach the scanner edge a little sooner.
- A ship your lasers bring to zero energy is now destroyed: it disappears from
  the view and the scanner, and an ident lock on it ends with "Target lost.".
- The ship's clock at the top left of the flight view is now drawn at the same
  smaller size as the Hyperspace line beneath it, closer to Oolite, and the
  two lines now fit together in the top-left corner.
- Laser shots are now drawn as glowing beams instead of a thin line. Each has
  a white-hot core inside a soft halo in the laser's colour (red pulse, yellow
  beam, blue mining, magenta military), half as wide and half as bright as
  Oolite's beam. A shot
  shimmers and fades over its brief life and looks like one beam from every
  angle, and a distant shot stays visible as a thin line.
- Flight messages now appear at once, each for its own time as in Oolite. The
  "Hyperspeed mass-locked." reply to J shows at once for 1.5 s instead of
  waiting behind first-use hints. Up to two message lines are shown with the
  newest at the bottom, each fades out over its last second, and the same
  message repeated within 6 s is shown once. The extra "Mass locked" notice
  when a mass lock begins is gone; Oolite has none.
- Credits are now shown as ₢, Oolite's credit sign, everywhere (for example
  "100.0 ₢"). The status and home screens name the ship "Cobra Mark III", as
  Oolite does, and the status screen shows the kill count after the rating
  ("Harmless (0)").
- A new commander now starts as in Oolite: the ship's clock reads
  2084004:20:13:23 and the hyperspace target is Lave, the start system, so
  the Hyperspace line on the flight view and the status screen name Lave
  instead of "(Unknown)". Jumping to the system you are in is still refused.

### Fixed

- The station's mass lock now ends strictly inside the scanner range, as in
  Oolite: a ship exactly 25,600 m from the station centre is no longer
  mass-locked, so the torus drive engages there.
- The forward view now has Oolite's field of view. Oolite spreads its 57.2°
  view across the width of any window wider than 4:3; Wegolite spread it from
  top to bottom, so at 16:9 it showed about 88° across and everything ahead
  looked about 1.78 times smaller than in Oolite. Ships, stations and planets
  ahead now appear at Oolite's size. In a window narrower than 4:3 the view
  keeps the height it has at 4:3, and the scanner's forward-view lines narrow
  with the view, as in Oolite. The menu scene's camera now uses Oolite's
  framing for menu screens (not visible yet: the title screen covers it).
- The condition light now follows Oolite's alert rule from the launch on
  instead of staying green: it is yellow while mass-locked, including during
  the launch while the station mass-locks the ship, and red when a ship
  attacks you, your energy runs low, the cabin overheats or you fly within
  4 km of a planet or sun surface; otherwise it is green. It is green only
  while docked.
- Starting a hyperspace countdown no longer pushes the older messages up a
  line: the countdown is shown in place on the bottom line, as in Oolite. After
  you cancel the countdown, no out-of-date countdown line is left on screen.
- A message shown when you dock, such as "Docking computers engaged", now
  times out while docked, as in Oolite, instead of waiting and appearing after
  your next launch.
- The market's legality column is now Oolite's Legal column. Slaves, narcotics
  and firearms show "Im", Oolite's mark for goods that may be imported but not
  exported; Wegolite showed "Ex", which in Oolite means the opposite.

## [0.4.0] - 2026-11-16

This release changes the save format (version 4, laser mounts) and the default
keys; see **Compatibility** under Changed. Saves from 0.3.0 are upgraded on
load, but 0.3.0 cannot load a save written by 0.4.0.

### Added

- In a test session (`?test=1&traffic=1`) NPC ships can now fly with Oolite's
  flight model and native steering (idle, tumble, fly to destination, face,
  intercept, attack, flee, escort and avoid collision). A new test hook member,
  `spawnTestFlyers()`, puts a Shuttle flying to the station, a Viper
  intercepting you and an Adder fleeing you into the world, and marks the
  session as test-tainted so nothing is saved. In normal play the ships still
  stay where they are placed.
- Contributors can run the 20-seed NPC flight acceptance run with
  `npm run test:acceptance` (inside the test container). It is a separate Vitest
  config, outside `npm test`, `verify` and `verify-full`, and checks twelve
  scripted ships per seed for stuck or frozen ships, hull and station-sphere
  crossings, repairs and AI faults against the thresholds committed before the
  flight port. Its detectors are unit-tested in the default suite.
- The content build now compiles nine Oolite NPC ships for the six traffic
  roles (Viper, Adder, Moray, Cobra Mk I, Sidewinder, Mamba, Krait, Gecko and
  Shuttle), with their models, WebP textures and role records. They are loaded
  only on demand, so the first load is unchanged, and they do not appear in the
  game until ships are placed in space.
- Inert NPC ships of the six roles (traders, pirates, police Vipers, hunters,
  shuttles and scavengers) now sit in each system after a launch and after a
  hyperspace arrival. They do not move yet, and they show on the scanner
  (police Vipers in purple, others in yellow). Like Oolite's ships they lock the
  torus drive within 25.6 km and block a hyperspace jump that completes right
  beside them. They are not saved, and loading a game rebuilds the same ships.
- The inert NPC ships are drawn with their Oolite models. A ship type's model
  downloads only when a system needs it and only once your ship is in flight, so
  the first load stays as small as before; until a model arrives the ship still
  shows on the scanner.
- Lasers can be bought at the F3 outfitting screen for each of the four mounts
  (forward, aft, port and starboard): pulse, beam, mining and military, with
  Oolite's prices, tech levels and trade-in. Choosing a laser opens the facing
  selection, which shows what is fitted on each facing; a replaced laser is
  refunded at its full price, and Remove Laser frees a facing and refunds the
  laser. The F5 status screen lists each fitted laser ("Forward Pulse Laser").
- The flight HUD's shield, energy-bank, laser-temperature and cabin-temperature
  gauges now show live values: the forward and aft shields, the four energy
  banks (the bottom bank fills first), the laser temperature of the current
  facing and the cabin temperature, which reads 60/256 on a new game.
- A refused shot now shows Oolite's "Weapon system overheated." or "Weapon
  system inactive (no energy left)." on the message line, and the ident system
  shows "Ident system active.", "Ident system locked onto" the ship's name,
  "Target lost.", "Ident system deactivated." and "Missiles on safety.". Each
  message appears at most once per second, so a held fire key cannot flood the
  line.
- Four cockpit views: 1 or F1 looks fore, 2 or F2 aft, 3 or F3 port and 4 or F4
  starboard, each from Oolite's view position on the Cobra. Lasers fire with A
  from the mount of the view you are looking along, with a drawn shot (red for a
  pulse laser, yellow for a beam laser, blue for a mining laser and magenta for
  a military laser), Oolite's heat cut-out and its messages. R engages the ident
  system, which frames the ship in your sights and names it on the message line;
  U drops the lock, and Q targets the station.

### Changed

- `p` alone pauses now: Escape no longer pauses (it stays Back in the station
  screens, the galactic chart and the save screen). `r` no longer targets the
  station, which moves to `q`. Saved key settings at the old defaults are
  updated automatically and customised keys are kept.
- A torus jump (`j`) refused under mass lock now shows "Hyperspeed mass-locked."
  as Oolite does, instead of "Torus disengaged". "Torus disengaged" is shown
  when you stop a running torus drive, and a running drive that mass lock stops
  shows "Hyperspeed mass-locked." as in Oolite.
- A hyperspace jump that completes within about 7.18 km of a Coriolis station
  is now refused as blocked (it was about 6.75 km). The station's mass is now
  the one Oolite computes from its model, including the faceplate, tris and dock
  parts, instead of an older figure from an Oolite source comment.
- Saves now use a new save format that records where the game is in its
  sequence of local worlds, so a loaded game continues exactly as the session
  that saved it would have. Saves from earlier versions are upgraded when they
  are loaded, and the next save uses the new save format. **Compatibility:** an
  older version of Wegolite keeps a save written by this version untouched but
  cannot load it.
- Saves now record the laser fitted to each of the four mounts (fore, aft, port
  and starboard). A new game starts with the Cobra's standard pulse laser on
  the fore mount and nothing on the other three. **Compatibility:** saves from
  earlier versions are upgraded when they are loaded and get the Cobra's
  standard fore pulse laser, so nothing is gained or lost against the stock
  ship; an older version of Wegolite keeps a save written by this version
  untouched but cannot load it.
- Opening the galactic chart (F6) in flight no longer pauses the game: the
  ship, the other ships and a running hyperspace countdown keep going behind the
  chart, as in Oolite, and docking or arriving behind the chart closes it.
  Opened while docked, the chart behaves as before.
- For contributors: `docker compose run --rm verify`, `verify-full` and the
  Pages build now check the built bundle (`npm run check:dist`) for the
  dev-only AI harness and the Oolite AI library, and fail when one is present
  or when no build output exists.

### Fixed

- A hyperspace arrival whose new local world cannot be created (only a
  hand-edited save at the maximum world epoch can cause this) no longer leaves
  the previous system's ships in the destination, drawn, on the scanner, locking
  the torus drive or blocking a jump.
- The first-use hint "Torus drive: press J to engage" is no longer spent right
  after a launch while the ship is still inside the station's mass lock. Before,
  on some launches (depending on how the frames fell) it appeared too early and
  never came back; now it waits until the lock has been checked in flight.

## [0.3.0] - 2026-11-11

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

- The docked `Home` screen is now a three-column station berth and arrival
  report dashboard (`Service & Berth — Bay 04` with one-click fuel top-up and
  jump range readout, `Cargo Hold Manifest` with local price deltas against
  the galactic average, a vector Coriolis Docking Bay 04 viewport, `System
Arrival Report`, and `Local Market Highlights`).
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
