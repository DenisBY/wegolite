# Logic and security review — 2026-11-09

Reviewed at commit `d685c25` (branch `main`).

## Status on 2026-11-10

This file is a dated review, not a live tracker. The findings below are kept as
written, with a note under each one that has since been acted on. Line numbers
are those of commit `d685c25` and no longer match `src/app/game-session.ts`,
which has changed since.

| ID  | Status                                                                        |
| --- | ----------------------------------------------------------------------------- |
| M1  | Open by decision D-11; lowered to Low                                         |
| M2  | Fixed, quick task 261110-d6m                                                  |
| M3  | Fixed, quick task 261110-d6m                                                  |
| M4  | Open; still unverified in a browser                                           |
| M5  | Accepted by the owner (local-network testing); see PROJECT.md Key Decisions   |
| M6  | Fixed, quick task 261110-d6m; not yet exercised on GitHub                     |
| L7  | Mostly fixed by quick task 261110-fnh (live footer hints); see the note at L7 |
| P1  | Done, quick task 261110-b7w                                                   |
| P2  | Done, quick task 261109-s8k                                                   |
| P3  | Measured and left; see `docs/PERFORMANCE.md`                                  |
| P4  | Done, quick task 261110-a3k                                                   |
| P6  | Partly: a quality setting exists (261109-q7h); no Low level for weak GPUs     |
| P7  | Equipment set cached (261109-s8k); the rest open                              |
| P8  | Colour done, quick task 261110-c4d; gloss open                                |

Section 4 (visual gaps): both gaps are closed at the High graphics quality
(quick tasks 261109-q7h and 261109-r4n); Standard is unchanged by design.

The gameplay suggestions of sections 2 and 3 were moved into the backlog on
2026-11-10: four files under `.planning/todos/pending/2026-11-10-*.md` (planet
and sun collision, the chart pausing the flight, the torus refusal message,
behaviour below 24 fps) and `REQUIREMENTS.md` (PRES-07 to PRES-09, notes on
PRES-04 and on the order of combat in v2).

Not re-checked against the current code: L1 to L6, L8 to L13, I1 to I4, P5,
and sections 2, 3 and 6. They were true at `d685c25`; the station footer, the
tab strip and the test tooling have been reworked since by other tasks, so
confirm each against the source before acting on it.

## Scope and method

Static read of the source; nothing was executed, so no finding here has been
reproduced in a browser or in the Docker test services. Each finding names the
lines it rests on. Findings marked **unverified** depend on browser behaviour
that needs a runtime check.

Read in full: `src/persistence/`, `src/settings/`, `src/sim/economy/`,
`src/sim/player/`, `src/sim/hyperspace/`, `src/sim/flight/`,
`src/sim/dock/step.ts`, `src/sim/dock/computer.ts`, `src/sim/world/aegis.ts`,
`src/app/game-session.ts`, `src/app/game-loop.ts`, `src/app/boot*.ts`,
`src/app/hints.ts`, `src/app/context-recovery.ts`, `src/main.ts`,
`src/input/keyboard.ts`, `src/input/bindings.ts`, `src/ui/controls.ts`,
`src/ui/title.ts`, `src/ui/save-load.ts`, `tools/oolite-ingest/cli.ts`,
`tools/oolite-ingest/generate.ts`, `scripts/vendor-oolite.sh`,
`scripts/audit-release.sh`, `compose.yaml`, `Dockerfile`, `vite.config.ts`,
`.github/workflows/`.

Not reviewed: `src/render/`, the dock corridor/hull/geometry maths
(`src/sim/dock/corridor.ts`, `hull.ts`, `geometry.ts`), `src/sim/world/layout.ts`,
`src/content/` loaders and schemas, the chart and station view models and DOM
shells, the ingest converters and OpenStep parser, and the test suites. Only
grep-level checks were made there.

## Summary

No exploitable security vulnerability was found in the shipped client. The
untrusted-input surface (IndexedDB save, `localStorage` settings, the URL) is
handled carefully. The security items below are about the development and
release tooling.

| ID  | Severity | Area        | Finding                                                             |
| --- | -------- | ----------- | ------------------------------------------------------------------- |
| M1  | Low      | Logic       | Three sold items still wait for effects planned for Phase 6         |
| M2  | Medium   | Logic       | A newer-version settings blob is overwritten on the first persist   |
| M3  | Medium   | Logic       | A failed `start()` leaves a dead title screen; New game clears first |
| M4  | Medium   | Logic       | `pagehide` tears the session down for good (unverified)             |
| M5  | Medium   | Security    | Dev and preview servers are published on every host interface       |
| M6  | Medium   | Release     | The Pages deploy is not gated on the verify workflow                |
| L1  | Low      | Persistence | The save store never recovers from a failed or closed connection    |
| L2  | Low      | Persistence | Two tabs overwrite each other's save                                |
| L3  | Low      | Persistence | A failed corrupt-save backup is invisible, then New game clears it  |
| L4  | Low      | Settings    | Settings have no size cap and an unbounded corrupt backup           |
| L5  | Low      | Logic       | Settings reset leaves hint and launch state half reset              |
| L6  | Low      | Input       | Pause can be unbound, which can lock the player out of the menus    |
| L7  | Low      | UI          | Key hints are hard-coded and ignore rebinding                       |
| L8  | Low      | Input       | The launch-skip handler swallows every unmodified key               |
| L9  | Low      | Logic       | A mass-locked torus attempt reports "Torus disengaged"              |
| L10 | Low      | Logic       | Top-level boot errors have no failure screen                        |
| L11 | Low      | Security    | Workflow permissions and action pins are broader than needed        |
| L12 | Low      | Security    | `.env` is not in `.dockerignore`                                    |
| L13 | Low      | Security    | The vendoring script pins a short SHA and re-blesses checksums      |
| I1  | Info     | Security    | The `?test=1` hook and the probe ship in production                 |
| I2  | Info     | Security    | CSP is meta-only                                                    |
| I3  | Info     | Logic       | Below 24 fps the simulation runs in slow motion                     |
| I4  | Info     | Logic       | Defensive gaps that are unreachable today                           |

## Medium

### M1 — Three sold items still wait for effects planned for Phase 6

Severity lowered to Low after checking the phase records: selling these items
is a recorded owner decision, not an oversight.

`05-CONTEXT.md` D-11 fixes the visible outfitting set as the "peaceful research
set": fuel, cargo bay, docking computer, Galactic Hyperdrive, Advanced Space
Compass, Advanced Navigational Array, missile, passenger berth and the removal
entries. `05-DISCUSSION-LOG.md:105-106` shows the alternative "only items with a
visible v1 effect" was offered and not chosen. Missiles and berths (D-14) are
therefore in the shop on purpose, ahead of combat and passenger contracts.

What remains open is narrower. `05-DISCUSSION-LOG.md:219` defers the *effects*
of the Galactic Hyperdrive, the Advanced Space Compass and the Advanced
Navigational Array to Phase 6. Phase 6 is complete and none of the three has an
effect: no code outside `src/sim/player/outfitting.ts` reads the keys, and
`REQUIREMENTS.md` now lists the galactic jump as PROG-04 and ANA route plotting
as PRES-06, both v2. The Galactic Hyperdrive costs 5,000 Cr.

Also, `README.md:5` says the game hyperspaces "across the eight galaxies"; v1
loads only galaxy 0 (`src/main.ts:170`, `:282`).

Suggested: record in `PROJECT.md` Key Decisions that the three effects moved
from Phase 6 to v2, mark the rows in the shop as not yet functional (a short
note in the row description is enough), and correct the README sentence.

### M2 — A newer-version settings blob is overwritten on the first persist

*Fixed in quick task 261110-d6m: `saveSettings` reads the stored blob at every
write and refuses to replace a newer one.*

`loadSettings` (`src/settings/store.ts`, the `isNewerSettingsVersion` branch)
returns defaults for a blob written by a newer build and logs that it is "using
defaults without overwriting it". `saveSettings` has no such guard, and the
session calls it through `persistSettings` (`src/app/game-session.ts:486-490`)
on the first hint seen (`:2994-3001`), the first completed launch
(`:2266-2269`), any rebind and the focus-loss toggle. The first hint fires
within seconds of starting, so the newer blob is replaced with a v1 blob almost
immediately.

The save path does this correctly: a `future` status blocks every write
(`canOverwrite`, `:1080`).

Fix: remember that the stored blob was newer and make `persistSettings` a no-op
for the session, as the save path does.

### M3 — A failed `start()` leaves a dead title screen, and New game clears the save first

*Fixed in quick task 261110-d6m: `start()` reports every throw on the failure
surface, and the clear runs after the last load that can fail.*

Two related problems in `start()` (`src/app/game-session.ts:2783`).

1. `starting = true` is set at `:2789` and never reset. `loadShipCatalogue()`
   (`:2821`), `playerShip`/`stationShip` (`:2849-2850`), `scenes.enterSystem`
   (`:2862`), the missing-layout throw (`:2864-2868`) and `restoreFromSave`
   (`:2888`) are outside any `try`. `src/main.ts:344-350` calls
   `void session.start(...)`. If any of those throw, the rejection is unhandled,
   no failure screen is shown, the title stays up and both buttons do nothing.
   The asset, equipment and dock-port loads in the same function do report
   through `showBootFailure`.
2. For a new game, `clearSaveForNewGame()` runs at `:2802`, before the asset
   preload at `:2807`. If the preload or any later step fails, the previous save
   is already deleted.

Fix: wrap the body of `start()` in one `try`/`catch` that calls
`showBootFailure` and `publishFailure`, and move the clear to after the session
is built (just before `title.hide()`).

### M4 — `pagehide` tears the session down for good (unverified)

`src/main.ts:448-457` disposes the session, aborts the lifecycle listeners and
closes the save store on every `pagehide`, without checking `event.persisted`.
There is no `pageshow` handler anywhere in `src/`. If the browser keeps the page
in the back/forward cache, returning to it restores a document whose render loop
is cancelled, whose input is detached and whose store is disposed: a frozen
page until a manual reload.

A second effect of the same teardown: `enqueue` in
`src/persistence/idb-store.ts:139-140` checks `disposed` when an operation
runs, so a write that is still queued behind another operation at `pagehide`
resolves as `"disposed"` and is dropped. The window is narrow (two writes within
one transaction's duration).

This needs a browser check for whether the page is bfcache-eligible in Chromium
and Firefox. Fix if confirmed: tear down only when `event.persisted` is false,
or reload on `pageshow` with `persisted === true`; and let already-queued writes
run before the store closes.

### M5 — Dev and preview servers are published on every host interface

*Accepted by the owner on 2026-11-10 and left as it is: the game is tested from
another machine on the local network. See PROJECT.md Key Decisions.*

`compose.yaml` publishes `"5173:5173"` and `"4173:4173"`, which Docker binds to
`0.0.0.0` on the host. Anyone on the same network can reach the Vite dev server,
which serves the bind-mounted working tree and has a history of file-read
advisories in its dev middleware. `allowedHosts` (kept at its default in
`vite.config.ts`) limits DNS rebinding, not direct access by IP.

Fix: publish on loopback only, `"127.0.0.1:5173:5173"` and
`"127.0.0.1:4173:4173"`. The in-container `host: "0.0.0.0"` stays as it is.

### M6 — The Pages deploy is not gated on the verify workflow

*Fixed in quick task 261110-d6m: `pages.yml` runs on a successful `verify` run
for a push to `main` and builds the commit that run checked. Not exercised on
GitHub yet.*

`.github/workflows/pages.yml` and `.github/workflows/verify.yml` both trigger on
a push to `main` and run independently. `pages.yml` only builds; it runs no
lint, test or compliance check. A commit that fails `verify-full` is still
published.

Fix: run the gate in the Pages build job, or trigger the deploy with
`workflow_run` on a successful `verify` run.

## Low

### L1 — The save store never recovers from a failed or closed connection

`getDatabase` (`src/persistence/idb-store.ts:123-128`) caches the open promise
for the life of the page, including a rejection. The `blocked` case rejects
(`:97-100`) although the request can still succeed later. No `onversionchange`
or `onclose` handler is registered on the connection, so a connection the
browser closes (site data cleared, storage pressure) leaves every later
transaction throwing. Saving then fails for the rest of the session. The only
signal is the station notice "Save failed — progress not saved"
(`src/app/game-session.ts:1166-1177`), which is not shown in flight, where the
arrival autosave runs.

Fix: drop the cached promise on `onclose`/`onversionchange` and on a transient
failure so the next write reopens; show a save failure on the HUD message queue
as well.

### L2 — Two tabs overwrite each other's save

`committedRevision` (`idb-store.ts:68`) and `saveRevision`
(`game-session.ts:425`) are per page. Two tabs of the game each write the single
`autosave` key, and the last writer wins without warning, so an idle older tab
can replace newer progress on its next dock or trade.

Fix: a `BroadcastChannel` or Web Locks guard that marks a second tab read-only,
or a stored revision compared inside the write transaction.

### L3 — A failed corrupt-save backup is invisible, then New game clears the blob

`backupCorrupt` (`idb-store.ts:265-275`) returns `void` and swallows every
failure. `src/main.ts:206` awaits it and continues. `canClear`
(`game-session.ts:1089-1091`) then lets New game delete a `corrupt` blob whether
or not the backup was written.

Fix: return a result from `backupCorrupt` and refuse the clear (treat the status
as `unreadable`) when the backup did not commit.

### L4 — Settings have no size cap and an unbounded corrupt backup

`loadSettings` parses the stored string with no length check, and the local
`backupCorrupt` (`src/settings/store.ts:28-31`) copies the whole raw string to
`wegolite.settings.corrupt`. The save path bounds both (`MAX_SAVE_CHARS`,
`boundCorruptBackup`). The browser's `localStorage` quota limits the impact to a
slow boot and a doubled blob; the two paths are just inconsistent.

### L5 — Settings reset leaves hint and launch state half reset

`resetAllSettings` (`game-session.ts:2191-2206`) replaces `settings` and sets
`launchSeen = false`, but the hint controller keeps its own `seen` set
(`src/app/hints.ts:73`) and `launchSequence` keeps its `seen` flag. After a
reset, hints do not reappear in the same session, and the next persisted
`hintsSeen` holds only hints seen after the reset. Separately, the Controls
panel's Reset button (`src/ui/controls.ts:238-246`) calls the same function, so
it also clears hints, `launchSeen` and the focus-loss toggle, not just bindings.

### L6 — Pause can be unbound, which can lock the player out of the menus

`onCaptureKeyDown` (`controls.ts:160-166`) clears any action with Backspace or
Delete, including `pause`. The Controls and Settings panels are reachable only
from the pause overlay. With `pause` unbound and "pause on focus loss" off,
nothing opens the overlay again; recovery needs `localStorage` to be cleared by
hand. An explicit empty array also survives a reload
(`mergeDefaults`, `src/settings/schema.ts`).

Fix: refuse to clear `pause`, or keep `Escape`/`KeyP` as a fixed fallback.

### L7 — Key hints are hard-coded and ignore rebinding

`keyHints` (`game-session.ts:825-838`), `KEY_HINTS`
(`src/ui/save-load.ts:92-93`), the outfitting prompt "`[Y/N]`" (`:938`) and
`CONTEXT_RESTORED_NOTICE` ("press P", `src/app/context-recovery.ts:29-30`) print
default key names. Only the launch hint uses `primaryKeyLabel`. After a rebind
the footer tells the player to press keys that no longer work.

*Mostly fixed by quick task 261110-fnh: `src/ui/station-hints.ts` builds the
footer hints from the live binding map. Still literal: the `[Y/N]` in the
confirmation prompts (`src/ui/station-model.ts`, `src/ui/save-load.ts`) and the
"press P" in `CONTEXT_RESTORED_NOTICE`.*

### L8 — The launch-skip handler swallows every unmodified key

`onLaunchKeyDown` (`game-session.ts:2230-2238`) runs in the capture phase and
calls `preventDefault()` for any key without Ctrl, Meta or Alt while a skippable
launch is playing. That includes `F5`, `F12` and `Tab` for those two seconds.
Limit it to keys that are not in `RESERVED_F_KEYS`.

### L9 — A mass-locked torus attempt reports "Torus disengaged"

When the player toggles the torus while mass-locked, `stepTorus`
(`src/sim/flight/torus.ts:218-222`) emits `torusDisengaged` with reason
`massLock` although the drive never engaged. `handleEvent`
(`game-session.ts:2317-2319`) prints "Torus disengaged" and ignores the reason.
Print a mass-lock refusal for that reason instead.

### L10 — Top-level boot errors have no failure screen

`src/main.ts` awaits `bootApp` at module top level (`:100`).
`assertContentManifest`, `requireCanvas`, `requireElement` and the Lave lookup
(`:143-146`) throw outside any handler, so the page shows the static title
markup with no message. These are build-time invariants, so the risk is small,
but a `try`/`catch` around the module body that calls `showBootFailure` would
make a bad deploy visible.

### L11 — Workflow permissions and action pins are broader than needed

`pages.yml:8-11` grants `pages: write` and `id-token: write` to the whole
workflow, so the build job, which runs the repository's npm dependencies, holds
them too. Move them to the `deploy` job. Both workflows pin actions by mutable
tag (`actions/checkout@v4`, `configure-pages@v5`, `upload-pages-artifact@v3`,
`deploy-pages@v4`); pin by commit SHA, as the Dockerfile already does for its
base image.

### L12 — `.env` is not in `.dockerignore`

`Dockerfile:30` runs `COPY . .` and `.dockerignore` does not list `.env`, so a
developer's local `.env` is baked into the `wegolite-ci` image. Today the file
holds only `VITE_USE_POLLING`. Add `.env` so that a later secret cannot leak
into an image layer.

### L13 — The vendoring script pins a short SHA and re-blesses checksums

`scripts/vendor-oolite.sh` fetches from
`raw.githubusercontent.com/OoliteProject/oolite/7437f22/...`, a seven-character
abbreviated commit, and then rewrites `CHECKSUMS.sha256` and the `ASSETS.md`
hashes from whatever it downloaded. It never compares against the committed
checksums, so a changed upstream file is accepted and only shows up in
`git diff`. Use the full 40-character SHA, and fail when a re-fetched file's
hash differs from the committed one unless an explicit update flag is passed.
`tests/compliance-assets.test.ts` does check the committed snapshot against
`CHECKSUMS.sha256`, which covers local tampering after the fetch.

## Informational

### I1 — The `?test=1` hook and the probe ship in production

`game-session.ts:3063-3065` enables `window.__wegolite.test` in any build when
the URL carries `?test=1`; it can set position, speed, credits and equipment.
Every mutation sets `testTainted`, which blocks all saving for the session
(`:1209`, `:1246`). `window.__wegolite` itself is always published
(`src/main.ts:333`). This is a local single-player game whose save the player
can already edit in dev tools, so nothing is exposed. If the hook should not be
reachable on the public site, gate it behind `__WEGOLITE_TEST_SEAMS__` the way
`readSessionFaults` is (`src/main.ts:270-272`); the e2e suite would then need
the seams build.

### I2 — CSP is meta-only

`index.html:5-8` sets a tight policy (`script-src 'self'`, `object-src 'none'`,
`base-uri 'none'`). A meta CSP cannot carry `frame-ancestors`, so the page can
be framed, and `style-src` allows `'unsafe-inline'`. There is no sensitive
action to clickjack and no HTML injection sink (no `innerHTML`, `eval` or
`document.write` anywhere in `src/`), so this is acceptable for static hosting.

### I3 — Below 24 fps the simulation runs in slow motion

`MAX_STEPS_PER_FRAME = 5` at `DT = 1/120` (`src/sim/step.ts:8-11`) caps a frame
at 41.7 ms of simulated time, and `createGameLoop`
(`src/app/game-loop.ts:45-54`) discards the remainder. This is a deliberate
spiral-of-death guard, but on a slow machine the clock, the hyperspace countdown
and flight all slow down with the frame rate.

### I4 — Defensive gaps that are unreachable today

- `canPurchase` (`src/sim/player/profile.ts:137-159`) does not check
  `MAX_EQUIPMENT_KEYS`, while `purchase` (`:176`) does. With 64 keys the row
  would show as confirmable and the purchase would fail with an empty notice
  (`game-session.ts:787-791`). Only five single-instance items exist.
- `handleHyperspaceJumped` (`game-session.ts:2031-2036`) returns "too far" for
  an unknown destination after the sim has already advanced the clock and
  cleared the countdown (`src/sim/flight/step.ts:293-303`). The target always
  comes from `galaxyById`, so this cannot happen now.

## Checked and found sound

- Save parsing (`src/persistence/save.ts`): size cap before `JSON.parse`,
  strict schemas, allow-lists for equipment, systems, stations and commodities,
  hold-capacity and market validation, and the same validator on the write path.
  A tampered save can only cheat within those bounds.
- Settings parsing builds a null-prototype binding map, allow-lists actions and
  hints, and skips `__proto__`.
- Trade and outfitting arithmetic checks safe-integer bounds on credits, stock,
  cost and cargo, and re-plans before applying.
- Hyperspace fuel, distance and blockage are re-checked at the end of the
  countdown, and docking clears a live countdown.
- All DOM output goes through `textContent`.
- The ingest tool confines input and output paths to their roots
  (`tools/oolite-ingest/generate.ts:65-94`).
- IndexedDB writes resolve on transaction commit and are serialized.

## Improvement suggestions for the current stage

These go beyond defects: they are product and engineering suggestions for a
project at the end of phase 7 (72 of 73 plans complete). Like the findings
above, they come from reading the code, not from playing the build.

### 1. Fix before the v1 release

The cheap items from the findings above, plus one that widens M1.

- **Tell the player which shop items are not functional yet.** Of the items in
  `VISIBLE_EQUIPMENT_KEYS` (`src/sim/player/outfitting.ts:51-62`), only fuel,
  the cargo bay and the docking computer have an effect in v1. Missiles,
  passenger berths, the Galactic Hyperdrive, the Advanced Space Compass and the
  Advanced Navigational Array are sold ahead of their mechanics by decision
  D-11, so they stay. A one-line note in the row description would stop a
  player from spending 5,000 Cr on the hyperdrive and reporting it as a bug
  (see M1).
- **The README promises "eight galaxies"** (`README.md:5`); one is playable.
- **A failed start leaves a dead title screen**, and New game clears the save
  before the game has loaded (M3).
- **A newer-version settings blob is overwritten** on the first hint (M2).
- **Dev and preview ports are open to the local network** (M5), and the Pages
  deploy does not wait for `verify-full` (M6).

### 2. What breaks the feel of the game

- **The player can fly through the planet and the sun.** `stepFlight`
  (`src/sim/flight/step.ts`) resolves contact with the station only. For a port
  of Elite this is the most visible gap. Destruction or a bounce at the planet
  radius would be enough.
- **Opening the chart in flight stops the simulation**, including the
  hyperspace countdown (`src/app/game-session.ts:2653-2661`). Oolite keeps
  running. Either keep stepping or show the pause explicitly.
- **Key hints are hard-coded** and are wrong after a rebind (L7).
- **Manual save writes the same single slot as the autosave**, so the
  "overwrite?" dialog protects nothing in practice.
- **A torus refusal under mass lock prints "Torus disengaged"** although the
  drive never engaged (L9).
- **Below 24 fps the game runs in slow motion** (I3).

### 3. Modernisation with the best return

- **JSON export and import of the save.** This matters more for a browser game
  than it looks: IndexedDB is wiped with the site data, and the save format is
  already strict and versioned. It also gives a way out of the two-tab problem
  (L2). This is part of PRES-04.
- **Sound.** There is none. A handful of effects (launch, docking, the jump
  countdown) would change the experience considerably (PRES-01).
- **Offline mode (PWA).** The shipped build already makes no runtime network
  calls (QUAL-08), so a service worker is nearly free.
- **Gamepad and mouse flight.** Input is keyboard only. Manual docking is far
  more comfortable on an analogue stick.
- **A guided first run.** Hints exist, but manual docking is the main barrier
  to entry. The step-by-step overlay (PRES-03, currently v2) is worth pulling
  forward.
- **Trading conveniences** that the original lacked and that do not change the
  rules: remembered prices of visited systems on the chart, and the profit on
  the cargo currently in the hold.

### 4. Visual gaps against Oolite

*Both gaps below are closed at the opt-in High graphics quality (quick tasks
261109-q7h and 261109-r4n). The text is kept as the reasoning behind them.*

Neither gap below is a WebGL2 limit. Both are recorded scope choices.

- **No nebulae in the sky.** Oolite draws `sky_n_blurs` textured nebula quads
  over the stars (`OOSkyDrawable.m`, textures from `nebulatextures.plist`).
  `src/render/bodies/starfield.ts:14-16` ignores `sky_n_blurs` on purpose and
  draws points only. The `oolite-nebula-*.png` textures are not in the vendored
  snapshot (`scripts/vendor-oolite.sh` lists none), so adding them needs new
  `third_party/oolite/` files with `ASSETS.md` rows and checksums. The drawing
  itself is a few hundred additive, camera-centred quads.
- **The planet looks flat.** Oolite renders the planet with a generated normal
  map and a separate atmosphere shell (`OOPlanetEntity.m:153-158`). Wegolite
  uses one sphere and one shader with no atmosphere or cloud shell (Phase 3
  D-02, `src/render/shaders/planet.glsl.ts:7-11`), chosen to keep one draw call
  and avoid transparent-depth interaction with the station. The noise budget is
  nine evaluations per pixel because the ten-evaluation build made the
  software-rasterised e2e suite too slow (`planet.glsl.ts`, header comment),
  not because of real GPUs. An atmosphere shell with limb scattering, stronger
  normal perturbation and a cloud layer are all feasible; a quality setting
  would let the tests keep the cheap path.

### 5. Performance and load size

Second pass, 2026-11-09. Additionally read: `src/render/asset-cache.ts`,
`src/render/sync.ts`, `src/render/hud/hud.ts`, `src/render/bodies/dust.ts`,
`src/sim/dock/corridor.ts`, `src/sim/world/layout.ts`, `src/app/hud-model.ts`,
`src/app/scene-manager.ts`, `src/ui/station.ts`, `src/content/ships.ts`,
`src/content/systems.ts` and `docs/PERFORMANCE.md`. No new logic defect was
found in those files. Nothing below was profiled; sizes come from the files on
disk and from `docs/PERFORMANCE.md`, and savings are estimates to be measured.

Draw calls and triangles are far inside budget (6-9 calls, under 39,000
triangles against 50 and 250,000), so geometry is not a concern. The cost is in
download size, fragment shading and work done when nothing changes.

- **P1 — Textures are almost the whole 20 MiB cold start.** *Done in quick
  task 261110-b7w: WebP through `EXT_texture_webp`, 19.7 MB to 6.3 MB, cold
  start 20.0 MiB to 7.1 MiB. GPU memory is unchanged.* `public/textures/`
  is 20 MB of PNG in 21 files, against 0.4 MB of models and a 1.6 MB entry
  chunk. Normal maps go up to 2048 x 2048 and most files are RGBA. Re-encoding
  in the content build to WebP or AVIF (lossy for diffuse and specular, high
  quality or lossless for normals) needs no loader change, because the browser
  decodes them, and should cut the download several times over. Uncompressed in
  GPU memory with mipmaps the set is roughly 100 MB; only GPU-compressed KTX2
  would reduce that, and its WebAssembly transcoder would need
  `'wasm-unsafe-eval'` in the CSP. Re-encoded files are derived assets and need
  `ASSETS.md` rows.
- **P2 — The ship catalogue ships 194 entries and uses two.** *Done in quick
  task 261109-s8k (`2bf8607`).*
  `src/content/generated/ships.json` builds to a 707 KB chunk that is parsed at
  boot. The game reads the player Cobra and the Coriolis station
  (`src/content/ships.ts:21-22`) and the list of keys that have a dock
  (`src/main.ts:171-179`). Emit a trimmed catalogue for the client and keep the
  full one for the compiler's tests.
- **P3 — The entry chunk is over its own target.** *Measured 2026-11-10 and
  left: 319 971 bytes gzip. Loading galaxy 0 lazily would meet the target on
  paper but a player still downloads it before the first flight, so it saves
  nothing; see `docs/PERFORMANCE.md`.* `docs/PERFORMANCE.md`
  records 312 KB gzip against a 250 KB target and defers it. Galaxy 0 is
  imported eagerly as a raw string (`src/content/systems.ts:55-59`), about
  700 KB before compression. The title screen needs none of it, so it can load
  like galaxies 1-7. `zod` is used for the save and content schemas only;
  `zod/mini` is the smaller build.
- **P4 — The scene is redrawn every frame while docked and while paused.**
  *Done in quick task 261110-a3k.*
  `frame()` always ends in `renderFrame()` (`src/app/game-session.ts:2680-2780`).
  While docked the station angle, flight time and pose do not advance
  (`src/sim/flight/step.ts:324-327`), and while paused nothing advances, so each
  frame repeats the same image, including the nine-evaluation planet shader,
  behind the station screen or the pause overlay. Render once on entering these
  states and again on resize, context restore and system change. This is the
  cheapest win for laptop battery and fan noise.
- **P5 — Test instrumentation runs every frame in production.** `updateProbe()`
  (`game-session.ts:2363-2498`) runs at the end of every `renderFrame`. It
  rebuilds about fifteen objects and arrays, reads `renderer.info` and walks the
  whole scene graph in `maxRelativeMagnitude` (`src/render/sync.ts:138-149`).
  Only the e2e suite reads the result. Update the cheap scalar fields each
  frame and compute the rest on demand (getters), or only under `?test=1`.
- **P6 — No quality control for weak GPUs.** *A quality setting exists since
  quick task 261109-q7h, but it raises quality (High) rather than lowering it;
  a pixel-ratio cap or a Low level for weak GPUs is still open.* The renderer uses MSAA and a pixel
  ratio of up to 2 (`src/app/boot.ts:50-57`, `:85`), and the planet shader runs
  nine noise evaluations per covered pixel. Near a planet on a 4K display that
  is a full-screen expensive shader, and below 24 fps the game runs in slow
  motion (I3). A quality setting (pixel-ratio cap, noise octaves) or automatic
  resolution scaling would cover both. The same switch would let the e2e suite
  keep a cheap path, so the test runtime stops dictating the shipped planet
  (the budget was cut from ten evaluations to nine for a test-time gate).
- **P7 — Small per-step allocations.** Each fixed step (120 Hz) builds a new
  `Set` from `profile.equipment` and a new hyperspace facts object
  (`game-session.ts:2731-2749`); both change only when the profile, system or
  target changes. `renderStation()` builds the market, outfitting and status
  models on every call whichever screen is open (`:889-923`) and is called twice
  on some paths (`commitProfile` then the caller). None of this is likely to
  show in a profile; fix it when the file is split.

- **P8 — The specular colour is shipped and not used.** *Colour done in quick
  task 261110-c4d (`specularColorTexture`); alpha as gloss is still open.* Found while choosing
  the texture encodings (2026-11-10). Oolite's shader multiplies the specular
  colour by the map's RGB and the gloss by its alpha
  (`oolite-default-shader.fragment:419-451`). The GLB writer puts the map in
  `KHR_materials_specular.specularTexture` only
  (`tools/oolite-ingest/convert/glb.ts`), and that slot reads alpha alone, so
  the client uses Oolite's gloss channel as specular strength and ignores the
  RGB. Adding `specularColorTexture` with the same image would use the colour
  at no download cost; whether alpha should drive strength or roughness is a
  fidelity question for the look pass. The four specular maps are 2.5 MB of
  the 6.3 MB of textures, about 1.1 MB of it the unused RGB.

### 6. Open items already on record

Two pending todos in `.planning/todos/pending/` are still true in the code and
are easy to lose now that phase 7 is closing.

- `serializeFlight` omits `compassMode` (`src/sim/flight/state.ts:147-176`
  writes only `compass=${compassTarget}`), so two states that behave
  differently on the next `cycleCompass` hash equal. `runToSteps`
  (`src/sim/loop.ts:42`) caps a frame delta above but not below zero.
- *Done in quick task 261110-e8p.* The Cobra's fourth missile pylon (`MAX_MISSILES = 3`,
  `src/sim/player/outfitting.ts:43`), filed as major. It changes the save bound
  `MAX_SAVE_MISSILES` too, so it is cheaper to decide before v1 saves exist in
  the wild.

`verify.yml` allows 120 minutes for `verify-full`. If the gate is close to that
figure, the software-rasterised e2e suite is the place to look first.

### The main content risk

Without combat, pirates or police, trading carries no risk: credits only grow
and there is nothing to spend them on. This cannot be fixed in v1, but it sets
the priority for v2. Minimal danger (pirates and a laser, CBT-01 and CBT-02)
should come before missions or the shipyard, because the rest of the
progression has no weight without it.

### Internal structure

`src/app/game-session.ts` has grown to about 3,200 lines and holds saving, the
station screens, the chart, hyperspace arrival and frame rendering in one
closure. It should be split before v2; combat will not fit into it as it is.
