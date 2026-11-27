# Headless Oolite reference

A real Oolite to measure Wegolite against, for the todo
`.planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md`. It
runs one scripted Oolite session under Xvfb with Mesa llvmpipe on the remote
test machine and fetches screenshots and `Latest.log` back.

It is not a gate, not part of `compose.yaml` and not part of CI. OXP support
stays out of Wegolite's scope: an OXP is used here only as a throwaway
measurement probe kept outside the repository.

## Provenance and licence

- Oolite 1.93.1-255, deployment AppImage, x86_64, a GitHub pre-release.
- URL:
  `https://github.com/OoliteProject/oolite/releases/download/1.93.1-255/Oolite-1.93.1-255-deployment-x86_64.AppImage`
- Size: 278,534,648 bytes.
- SHA256: `4ec9ab5fc6743538c95b97b590674f5d386dd07c16565aa1389dc40f15bd66a8`,
  equal to the digest GitHub publishes for the asset. The image build checks it
  with `sha256sum -c`; a mismatch fails the build.
- Base image: `debian:bookworm-slim` at index digest
  `sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc`
  (from `docker buildx imagetools inspect debian:bookworm-slim`).
- The binary is GPL-2.0-or-later and the assets are CC BY-NC-SA 3.0. They are
  never committed, and the image is built only on the test machine under a local
  tag and never published. Screenshots and logs are Oolite output too, so they
  stay outside the repository; the wrapper refuses an output directory inside
  it.
- Version skew: `FIDELITY.md` pins Oolite 1.93.1-241 at `7437f22`. This build
  is 14 commits later. Those commits touch joystick and key mapping,
  load/save, a HUD distance-unit string and `descriptions.plist` text. None
  touches `ShipEntity`, `Octree`, `OOMesh` or `Universe`.

## Requirements

Passwordless ssh to the test machine (`opencode@192.168.178.51`, override with
`OOREF_HOST`) and Docker there. Nothing is installed on either host: every tool
is inside the image.

## Usage

```sh
tools/oolite-reference/run-remote.sh [--out DIR] [--steps FILE] [--timeout SECONDS] [--addons DIR] [--no-build]
```

- `--out DIR`: where the results go. Default `$CLAUDE_JOB_DIR/tmp/oolite-reference/<UTC stamp>`, or
  `/tmp/oolite-reference/<UTC stamp>` when that variable is unset. It must be
  empty or missing, and must not be inside the repository (exit 64).
- `--steps FILE`: the steps file. Default `steps/title.steps`.
- `--timeout SECONDS`: overall session deadline. Default 300. An integer from 1
  to 99999 with no leading zero; `0`, `08` or a longer number is refused (exit
  64).
- `--addons DIR`: a directory whose children are `*.oxp` folders. It is copied
  to the remote, mounted read-only at `/addons` and passed to Oolite through
  `OO_ADDITIONALADDONSDIRS`.
- `--no-build`: reuse the existing remote image.

The wrapper syncs the working-tree copy of this directory (no commit needed),
builds the image `wegolite-oolite-reference:<OOLITE_VERSION>` (the tag is read
from the Dockerfile's `ARG OOLITE_VERSION`), runs the container with
`--network none` as a non-root user whose uid and gid match the remote user, and
fetches the outputs whatever the exit code. After any non-zero run exit
(deadline, backstop, a dropped ssh, Ctrl-C) it removes the named container with
`docker rm -f`; if the container cannot be confirmed gone, the remote session
directory is kept and its path printed.

Output layout:

- `screenshots/NN-name.png`: one per `shot`, numbered in order.
- `logs/Latest.log`: Oolite's own log, written straight into the mount.
- `oolite-stdout.log`: stdout and stderr of the launcher and Oolite.
- `session.txt`: version, AppImage SHA256, UTC times, every step with its status
  and the exit code.
- `snapshots/`: Oolite's own snapshot directory (`OO_SNAPSHOTSDIR`), usually
  empty.
- `wrapper.txt`: local git short SHA and whether the tool tree was dirty, host,
  remote image ID, add-on folder names, container exit code, `fetch=ok` or
  `fetch=failed`, container name, elapsed seconds.
- `xvfb.log`, `import.log`, and `xwininfo.txt` when no window appeared.

Run one session at a time (one run at a time): concurrent runs share
`~/oolite-reference` and its `.tmp` sync directory on the remote, and can break
each other's sync or build.

Exit codes:

- `0`: ok, including when a last `sleep` is cut short by the deadline.
- `1`: a step failed or Oolite died. This includes a `window` or `waitlog` that
  runs out of the overall deadline (the step is capped to the remaining time and
  fails as a step) and a key xdotool could not send. The outputs are still
  fetched.
- `2`: a bad steps file or OOREF_TIMEOUT, refused before Oolite starts.
- `64`: a usage error, a bad `--timeout` or a refused output directory, before
  any ssh.
- `70`: a sync, build, session-setup or fetch failure. A failed fetch overrides
  the container's code, keeps the remote session directory and prints
  `fetch failed; remote outputs kept at HOST:PATH`; the last line still shows
  `container_exit=`.
- `124`: the runner found the overall deadline expired between steps, or the
  wrapper's outer backstop (`--timeout` + 120 s, then SIGKILL 15 s later) fired.
  In the backstop case `session.txt` may be missing.
- `125`: `docker run` itself failed (daemon error, or no image with
  `--no-build`).
- `255`: ssh failed during the run.
- `137`: the run's ssh was killed (for example by the backstop's SIGKILL).

The last stdout line is `exit=N container_exit=M elapsed=Ss out=DIR`.

## Steps file grammar

One verb per line. Blank lines and `#` comments are allowed. The whole file is
validated before anything starts.

- `window [TIMEOUT]`: wait (default 120 s) for the Oolite window and focus it.
  Must come before the first `key` or window `shot`. TIMEOUT is an integer from
  1 to 99999 with no leading zero.
- `sleep SECONDS`: an integer from 1 to 99999 with no leading zero.
- `key KEYSYM...`: xdotool keysyms matching `[A-Za-z0-9_+]+`, such as `Return`
  or `F5`. Each key is held for half a second, then released. The validator
  checks only the character set, so an unknown keysym or a failed xdotool call
  fails the session with exit 1 (xdotool prints `No such key name` for an
  unknown keysym).
- `waitlog TIMEOUT TEXT...`: wait up to TIMEOUT seconds (an integer from 1 to
  99999 with no leading zero) for a line containing the fixed string TEXT. Each
  `waitlog` searches only the lines after the line the previous successful
  `waitlog` matched; the first one searches from the top of `Latest.log`. A
  match consumes everything up to and including the matched line, so a line that
  satisfied one `waitlog` never satisfies a later one, and a marker logged twice
  satisfies two. A line flushed before the step started still counts if no
  earlier `waitlog` consumed it, because Oolite flushes its log only every 2 s.
  If Oolite exits during the wait, the runner checks the log once more before it
  fails the step. A miss fails the session with exit 1. `session.txt` records
  the matched line number.
- `shot NAME`: capture the window to `screenshots/NN-NAME.png`. NAME matches
  `[A-Za-z0-9_-]+`.

Shipped files:

- `steps/title.steps`: wait for the window, sleep 10 s, capture the title screen.
- `steps/docked.steps`: capture the title screen, press Return (scenario
  screen), capture, press Return again (Normal Start at Lave station), sleep
  10 s and capture the docked status screen. On llvmpipe at 1280x1024 the
  window is up within a few seconds, and 10 s after the start is enough; the
  full smoke run takes about 40 s with a cached image.
- `steps/census-anarchy.steps`, `steps/census-quiet.steps`: the population
  census spike (see the section on the population census spike below). They
  need a probe OXP that is not in the repository.
- `steps/stations-lave.steps`, `steps/stations-zaonce.steps`,
  `steps/stations-biarge.steps`: the Phase 22.1 station measurement (see the
  station section below). They need a probe OXP that is not in the repository.

## Writing a measurement OXP

Keep it outside the repository, as `<name>.oxp/Config/script.js`, and pass its
parent with `--addons`. It is a world script (`Config/script.js` is read when
there is no `world-scripts.plist`, `OOScript.m:54-66`). Set `this.name`,
`this.author` and `this.version`, and do the work in `this.startUp`.

Log with the two-argument form, `log(this.name, "text")`. The one-argument form
logs under `script.debug.message`, which inherits `$scriptDebugOn = no` in
`logcontrol.plist`, so it never reaches `Latest.log` (`OOJSGlobal.m:230-260`).
The two-argument form uses the first argument as the log class, and unknown
classes are on by default.

Oolite flushes its log asynchronously every 2.0 s and has no signal handler, so
end a steps file with `waitlog` on the line you need. The runner also waits 3 s
before it terminates Oolite.

At startup `Latest.log` records the `Resource paths` (the `/addons/<name>.oxp`
entry) and the loaded world scripts, which is the quickest check that the OXP
was found.

Do not add a `manifest.plist`. With one the folder is treated as an OXZ, a
missing `required_oolite_version` is logged (`oxp.noManifest`), and the OXP is
then absent from the `Resource paths`, so neither its scripts nor its
`Config/scenarios.plist` load. Without a manifest it loads as a classic OXP.

## Population census spike (Phase 22, D-07)

**The question.** Can headless Oolite in this container start in a chosen
system through a scenario save and dump a census of the ships the populator
placed, so that Phase 26 (QUAL-13) can compare Wegolite's initial population
with the real one? The roadmap rated this LOW; a "no" would have been a valid
answer.

**The answer: yes.** One run takes 37 to 43 s on the remote machine with a
cached image, ends with exit 0, and `Latest.log` holds one `CENSUS-SHIP` line
per ship. Six runs were made (three per system, galaxy 0).

### Mandatory first check (assumption A6)

`Resources/Scripts/oolite-populator.js` inside the AppImage has the same
SHA256 as the checkout's copy, `96a734a6cfc1ee39a7db7798716101640887e58d5fe947e56e2fcc4946e04df4`
(read with `docker run --rm --entrypoint sh wegolite-oolite-reference:1.93.1-255 -c "find /opt/oolite -name oolite-populator.js -exec sha256sum {} +"`;
the file is at `/opt/oolite/share/oolite/Resources/Scripts/`). The 14 commits
of version skew did not touch the populator, so a census comparison is a
comparison with the script Wegolite ported.

### Route

1. A throwaway OXP, `census-probe.oxp`, outside the repository (below), adds two
   scenarios through `Config/scenarios.plist`; they appear after the four
   built-ins. Each scenario is a copy of `oolite-standard.oolite-save` with the
   keys `galaxy_id` and `system_id` added (the current save format: the
   system is addressed by id, so no chart-coordinates-to-seed mapping is
   needed) plus `current_system_name`, `galaxy_coordinates` and
   `target_system_name`/`target_coordinates` rewritten to match.
2. The steps select the scenario on the "Start New Commander" screen and press
   Return. `loadPlayerFromFile` then calls `populateNormalSpace` during the
   load, so the system is populated while the player is docked
   (`PlayerEntityLoadSave.m:640-643`).
3. The probe's world script logs from `missionScreenOpportunity`, which fires
   right after the load, one `CENSUS-SHIP` line per entry of `system.allShips`
   and then `CENSUS-DONE`; the steps `waitlog` on the sentinel.

**Menu arithmetic (the one real obstacle).** The runner holds every key for
0.5 s, Oolite repeats a held arrow key, and one press therefore moves the
selection TWO rows. The seven selectable rows (Return to Menu, the four
built-ins, the two probe scenarios) wrap and start on the first built-in, so
two Down presses select the anarchy scenario and one Up press (which wraps to
the last row) selects the quiet one. Four Down presses landed on the second
row in two runs; 4 s pauses between presses did not change that. The probe logs
the system name and id, so a wrong landing shows in `Latest.log`.

### The probe (not committed)

`/home/opencode/oolite-probes/population-census/census-probe.oxp/` holds:

- `Config/script.js`: a world script (`this.name = "population-census"`).
  `this.missionScreenOpportunity` runs the census once (a 25 s `Timer` from
  `startUp` is the fallback). It logs, with the two-argument `log(this.name, ...)`:
  `CENSUS-BEGIN` (system name, id, galaxy, government, tech level, number of
  entries, docked), then per entry `CENSUS-SHIP` with `dataKey`, `primaryRole`,
  `roles`, `isStation`, `isCargo`, `isPolice`, `isPirate`, `isTrader`,
  `isThargoid`, `isDerelict`, `bounty`, `group.count` and `escortGroup.count`,
  then `CENSUS-NEIGHBOURHOOD` (`system.info.systemsInRange().length`,
  `systemsInRange(3.5).length`, and
  `worldScripts["oolite-populator"]._systemIsBottleneck(locals, seconds)`, with
  `seconds` rebuilt the way the populator builds it), then `CENSUS-DONE`.
- `Config/scenarios.plist`: two entries, "Census anarchy (Qudira)" and "Census
  quiet (Teanrebi)", each with `file`, `name`, `description` and
  `model = "cobra3-player"`.
- `Scenarios/census-anarchy.oolite-save` (galaxy 0, system id 116, Qudira,
  government 0) and `Scenarios/census-quiet.oolite-save` (galaxy 0, system id
  18, Teanrebi, government 7).

Any other system is a new copy of the save with another `system_id` (and
`galaxy_id`) and a new `scenarios.plist` row, plus the matching number of key
presses in a steps file. No file of the probe, no scenario save and no Oolite
output is committed.

### Repeat the run

```sh
tools/oolite-reference/run-remote.sh \
  --steps tools/oolite-reference/steps/census-anarchy.steps \
  --addons /home/opencode/oolite-probes/population-census \
  --out /tmp/oolite-census-anarchy-N --timeout 300
# the quiet system: --steps tools/oolite-reference/steps/census-quiet.steps
grep -c CENSUS-SHIP /tmp/oolite-census-anarchy-N/logs/Latest.log
```

The census differs from run to run (three runs of Qudira gave 64, 85 and 99
NPC ships), so each run is one sample; run it as often as the comparison
needs. Add `--no-build` after the first run. Exclude from the counts the
player, `asteroid`, `buoy`, `buoy-witchpoint` and every entry with
`station=true`.

### Result (three samples per system, NPC ships)

NPC ships exclude the player, the asteroids (34 in Qudira, 44 in Teanrebi), the
two buoys and the stations (the coriolis, a rock hermit and, in Qudira, a pirate
hermit). "Port" is Wegolite's `populateSystemWorld` for the same system, the
mean over census epochs 1 to 20 (`tests/helpers/population-census.ts`), with
epoch 1 (the docked-launch epoch) in brackets. The port has no assassins and
no medium or heavy hunters (WORLD-08b cuts, `FIDELITY.md`), so "hunter" is the
light `hunter` role only. Counts are a distribution: there is no pass
threshold here; QUAL-13 writes thresholds first in Phase 26.

| System                  | Source               | NPC ships | trader    | pirate    | hunter (light) | police    | escort    | assassin |
| ----------------------- | -------------------- | --------- | --------- | --------- | -------------- | --------- | --------- | -------- |
| Qudira (anarchy)        | Oolite run 1         | 99        | 8         | 57        | 8              | 1         | 17        | 6        |
| Qudira                  | Oolite run 2         | 85        | 6         | 58        | 4              | 1         | 16        | 0        |
| Qudira                  | Oolite run 3         | 64        | 9         | 32        | 16             | 1         | 0         | 4        |
| Qudira                  | Port, mean (epoch 1) | 77.2 (96) | 6.4 (7)   | 53.9 (68) | 2.7 (3)        | 1 (1)     | 13.3 (17) | 0 (cut)  |
| Teanrebi (government 7) | Oolite run 1         | 80        | 16        | 13        | 20             | 24        | 2         | 1        |
| Teanrebi                | Oolite run 2         | 83        | 11        | 16        | 29             | 22        | 0         | 0        |
| Teanrebi                | Oolite run 3         | 84        | 16        | 14        | 20             | 28        | 0         | 0        |
| Teanrebi                | Port, mean (epoch 1) | 67.0 (28) | 16.5 (11) | 12.4 (4)  | 8.7 (0)        | 28.9 (13) | 0.7 (0)   | 0 (cut)  |

The medium and heavy hunters the port cuts account for 0 to 6 more NPC ships per
Oolite run (Qudira 2, 0, 2; Teanrebi 4, 5, 6); they are in the NPC total but not
in the "hunter (light)" column.

Native neighbourhood facts (`system.info.systemsInRange()`, the 3.5 LY range
and `_systemIsBottleneck`) equal the port's `buildNeighbourhood` for both
systems: Qudira 8 / 3 / false and Teanrebi 8 / 3 / false in all six runs and in
the port.

What the numbers say, without a threshold: the totals, the pirates, the
traders, the police and the escorts sit inside the spread of the real samples
(NPC ships 64 to 99 against the port's 41 to 110 in Qudira, 80 to 84 against
28 to 86 in Teanrebi). The light hunters do not: 20, 29 and 20 in Teanrebi
against a port range of 0 to 15 (mean 8.7), and 8, 4 and 16 in Qudira against
0 to 6 (mean 2.7). Three samples are too few to call that a port bug, but it is
the first place QUAL-13 should look.

### What it means for Phase 26

Use the real-Oolite census; it does not have to fall back to the oracle only.
It costs about 40 s per sample per system and can address any system of any
galaxy by `galaxy_id` and `system_id`. A distribution needs many samples: the
anarchy's NPC count alone spread from 64 to 99 in three runs, so QUAL-13 should
plan on at least 20 runs per system (about 15 minutes) and compare
distributions, not single runs. The probe must be rebuilt outside the
repository, as described above.

## Station measurement (Phase 22.1)

**What and why.** Phase 22.1 (WORLD-20) gives each system the main station Oolite
builds from `planetinfo.plist`'s `station` key (`Universe.m:1550`): Coriolis,
Dodecahedron or Icosahedron. Plan 22.1-01 measured the three stations in this
container before any station code changed, so the content build is pinned to
Oolite's own numbers. The numbers are committed as
`tests/fixtures/oolite-reference/stations.json` (numbers only, every one the string
`String(value)` exactly as the probe logged it), and
`tests/content/stations-oracle.test.ts` compares them with the compiled records.

**Mismatch rule MS-2** (quick task 261117-jji): EQUAL is the same float32
string, ROUNDING a relative difference of at most 1e-6, anything else DIFFERS. A
DIFFERS stops the work and is investigated (decision O1); it is never committed
as a pass.

### The probe (not committed)

`/home/opencode/oolite-probes/station-measure/station-measure.oxp/` holds:

- `Config/script.js`: a world script (`wegolite-station-measure` 0.0.1). In Run A
  (Normal Start at Lave) it spawns each station 100 km or more from the player
  with `system.addShips("[<key>]", 1, position)` and logs, with the two-argument
  `log(this.name, ...)`, one `STATION` line (`name`, `mass`, `collisionRadius`,
  `boundingBox` and `station_roll` read from `Ship.shipDataForKey(key)`, not the
  live `ship.roll`), one `SUB` line per solid subentity (`dataKey`, `isDock`,
  `mass`, `collisionRadius`, `position`, `boundingBox`; the dock's bounding box is
  the port, `DockEntity.m:1044-1045`) and one `TUNNEL` line. It then launches the
  player and runs two blockage trials per station as quick task 261117-lka ran
  them: the station frozen with `oolite-nullAI.js`, the player 1 m inside and 1 m
  outside r = sqrt(0.1 x mass), `beginHyperspaceCountdown(5)`, and the
  `playerJumpFailed` reason logged as `BLOCK`. Last it holds the player on each
  station's dock axis 3 collision radii in front of the dock for 15 s and logs
  `POSE`, the cue for the exterior picture. `STATIONS-DONE` ends the session. In
  Run B (any other system) it logs `MAIN` for `system.mainStation` and
  `STATIONS-DONE`.
- `Config/scenarios.plist`: two scenarios, "Station measure (Zaonce)" and
  "Station measure (Biarge)", appended after the four built-ins.
- `Scenarios/station-zaonce.oolite-save` (galaxy 0, system id 129, an Icosahedron
  system) and `Scenarios/station-biarge.oolite-save` (system id 3, a Dodecahedron
  system): copies of the population census save with `system_id`,
  `current_system_name`, `galaxy_coordinates` and the `target_*` keys rewritten.
- `reference/`: the reference pictures (below).

No file of the probe, no scenario save, no log and no picture is committed. The
floats are copied from `Latest.log` by a scratch script, never retyped.

### Repeat the runs

```sh
tools/oolite-reference/run-remote.sh --steps tools/oolite-reference/steps/stations-lave.steps \
  --addons /home/opencode/oolite-probes/station-measure --out /tmp/oolite-stations-lave --timeout 300
tools/oolite-reference/run-remote.sh --steps tools/oolite-reference/steps/stations-zaonce.steps \
  --addons /home/opencode/oolite-probes/station-measure --out /tmp/oolite-stations-zaonce --timeout 300
tools/oolite-reference/run-remote.sh --steps tools/oolite-reference/steps/stations-biarge.steps \
  --addons /home/opencode/oolite-probes/station-measure --out /tmp/oolite-stations-biarge --timeout 300
```

Run A takes about two minutes, each Run B about 40 s. Add `--no-build` after the
first run. The Run B menu arithmetic is the census one (one key press moves the
selection two rows; the seven selectable rows start on Normal, so two Down
presses select Zaonce and one Up wraps to Biarge), and the logged system name
proves the landing: `MAIN system=Zaonce` and `MAIN system=Biarge`.

### Result (Oolite 1.93.1-255, measured 2026-11-27)

| Station                | Mass        | Collision radius  | Dock port (x, y, z, m)      | Blockage radius (m) | Verdict                                                                 |
| ---------------------- | ----------- | ----------------- | --------------------------- | ------------------- | ----------------------------------------------------------------------- |
| `coriolis-station`     | 515,483,904 | 779.3702392578125 | 103.412 x 241.888 x 250     | 7,179.72            | EQUAL to the compiled record (port ROUNDING)                            |
| `dodecahedron-station` | 912,357,312 | 832.2093505859375 | 210.362 x 81.0268 x 250     | 9,551.74            | EQUAL to the research preview (dock numbers ROUNDING); not compiled yet |
| `icosahedron-station`  | 826,313,024 | 940.7927856445312 | 82.1076 x 238.546 x 273.278 | 9,090.18            | EQUAL to the research preview (dock numbers ROUNDING); not compiled yet |

Every station blocked a jump 1 m inside its radius and not 1 m outside. The main
stations Oolite builds in Zaonce (g0-s129, `icosahedron`) and Biarge (g0-s3,
`dodecahedron`) have the spawned stations' name, mass, collision radius and
bounding box: the planetinfo key selects the same shipdata entry. Oolite builds
both from one template, so the run cannot reveal a separate "built" mass.

`tunnel_corners`, `tunnel_start_angle` and `tunnel_aspect_ratio` are recorded as
Oolite's defaults (4, 45, 2.67, `Universe.m:2897-2899`) because none of the three
stations authors them. They only shape the docking break pattern, which Wegolite
does not draw (D17); the dock port is the dock subentity's bounding box.

### Reference pictures

`/home/opencode/oolite-probes/station-measure/reference/` holds five pictures,
outside the repository and never committed (CC BY-NC-SA Oolite output), for plan
22.1-13's manual look:

- `exterior-coriolis.png`, `exterior-dodecahedron.png`,
  `exterior-icosahedron.png`: the player 3 collision radii in front of each
  station's dock, facing it (the pose of Run A).
- `launch-zaonce.png`, `launch-biarge.png`: the first moment of a launch from the
  main station of Zaonce (Icosahedron) and Biarge (Dodecahedron), looking out of
  the dock slot. The picture shows Oolite's launch tunnel, the break pattern that
  Wegolite does not draw (D17); the shot has to come right after the `F1` key
  (one 1.5 s later is a black tunnel, one 3 s later already shows the planet).

If the directory is gone, run the three commands above and copy the shots again
from the `screenshots/` of each `--out` directory (`exterior-*` from Run A,
`launch-*` from the two Run B directories). A shot under 100 KB is a probable
black frame and is retaken. If the reference container cannot run, plan 22.1-13
records its manual look as made without reference pictures.

## Headless notes and troubleshooting

- `LIBGL_ALWAYS_SOFTWARE=1`, `GALLIUM_DRIVER=llvmpipe`: software GL. The
  AppImage does not bundle Mesa (`DEPLOY_OPENGL=0`), so the image installs it.
  `Latest.log` reports the renderer as `llvmpipe` (OpenGL 4.5 compatibility).
- `SDL_AUDIODRIVER=dummy`, `SDL_AUDIO_DRIVER=dummy`, `ALSOFT_DRIVERS=null`:
  silence, for SDL2 and SDL3 names and for OpenAL. `-nosound` is the fallback if
  OpenAL blocks.
- `SDL_VIDEO_DRIVER=x11` on Xvfb, not SDL's offscreen driver, because xdotool
  needs a real X window. Oolite 1.93 uses SDL3.
- `-nosplash`: the spelling Oolite accepts (upstream's `--no-splash` is not
  recognised).
- The AppImage launcher only sets up its GNUstep configuration when it believes
  it runs inside an AppImage, so the runner sets `APPDIR`, `APPIMAGE` and
  `OO_DIRTYPE=xdg`. Game data then lives under `$HOME/.local/share/Oolite`,
  saves go to `$HOME/oolite-saves` (`OO_SAVEDIR`), and logs and snapshots go to
  `/out`. Everything outside `/out` is discarded with the container.
- Windows are found with `xdotool search --class oolite`. `--name` does not
  match, because the title is `_NET_WM_NAME`. There is no window manager, so the
  runner uses `windowfocus`, not `windowactivate`, and sends keys through XTEST
  (no `--window`, which would send synthetic events SDL may ignore).
- Keys are held for 0.5 s because Oolite polls key state once per frame and a
  press-and-release inside one frame is lost under llvmpipe. Menu selection is
  also debounced, so keep pauses between presses.
- The runner's TERM reaches only the launcher shell; the oolite process ends at
  container teardown, which relies on `docker run --init`. `run-remote.sh`
  always passes it, so a manual `docker run` of the entrypoint should pass it
  too.
- Upstream treats a snapshot PNG under 100 KB as a probable black frame.
- To debug inside the image, on the remote:
  `docker run --rm -it --entrypoint bash wegolite-oolite-reference:1.93.1-255`,
  then `Xvfb :99 &` and run `glxinfo -B`, with `LIBGL_DEBUG=verbose`, or `ldd`
  on `/opt/oolite/bin/oolite`.
- Building Oolite from source is not a fallback. It needs an owner decision.
- The remote clock may differ from the local one; the wrapper extracts with
  `tar -m` so that does not warn.

## Remote directories

- `~/oolite-reference`: the synced copy of this tool.
- `~/oolite-reference-runs/`: one directory per session. It is deleted after a
  successful fetch and kept, with its path printed, when the fetch fails. An
  interrupted run can also leave one behind, to remove by hand.

Both are separate from `~/wegolite-remote`, which the gate wrapper wipes on
every run. To remove the image:
`ssh opencode@192.168.178.51 docker rmi wegolite-oolite-reference:1.93.1-255`.
