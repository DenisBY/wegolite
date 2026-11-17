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
- `--timeout SECONDS`: overall session deadline. Default 300.
- `--addons DIR`: a directory whose children are `*.oxp` folders. It is copied
  to the remote, mounted read-only at `/addons` and passed to Oolite through
  `OO_ADDITIONALADDONSDIRS`.
- `--no-build`: reuse the existing remote image.

The wrapper syncs the working-tree copy of this directory (no commit needed),
builds the image `wegolite-oolite-reference:1.93.1-255`, runs the container
with `--network none` as a non-root user whose uid and gid match the remote
user, and fetches the outputs whatever the exit code.

Output layout:

- `screenshots/NN-name.png`: one per `shot`, numbered in order.
- `logs/Latest.log`: Oolite's own log, written straight into the mount.
- `oolite-stdout.log`: stdout and stderr of the launcher and Oolite.
- `session.txt`: version, AppImage SHA256, UTC times, every step with its status
  and the exit code.
- `wrapper.txt`: local git short SHA and whether the tool tree was dirty, host,
  remote image ID, add-on folder names, container exit code, elapsed seconds.
- `xvfb.log`, `import.log`, and `xwininfo.txt` when no window appeared.

Exit codes: 0 ok; 1 a step failed or Oolite died (a failed wait still fetches
the outputs); 2 bad steps file (refused before Oolite starts); 124 the overall
deadline expired; 64 usage error or refused output directory; 70 sync or build
failure.

## Steps file grammar

One verb per line. Blank lines and `#` comments are allowed. The whole file is
validated before anything starts.

- `window [TIMEOUT]`: wait (default 120 s) for the Oolite window and focus it.
  Must come before the first `key` or window `shot`.
- `sleep SECONDS`: integer seconds.
- `key KEYSYM...`: xdotool keysyms matching `[A-Za-z0-9_+]+`, such as `Return`
  or `F5`. Each key is held for half a second, then released.
- `waitlog TIMEOUT TEXT...`: wait up to TIMEOUT seconds for the fixed string
  TEXT to appear in `Latest.log`. A timeout fails the session with exit 1.
- `shot NAME`: capture the window to `screenshots/NN-NAME.png`. NAME matches
  `[A-Za-z0-9_-]+`.

Shipped files:

- `steps/title.steps`: wait for the window, sleep 10 s, capture the title screen.
- `steps/docked.steps`: capture the title screen, press Return (scenario
  screen), capture, press Return again (Normal Start at Lave station), sleep
  10 s and capture the docked status screen. On llvmpipe at 1280x1024 the
  window is up within a few seconds, and 10 s after the start is enough; the
  full smoke run takes about 40 s with a cached image.

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
  `OO_DIRTYPE=xdg`. All game data then lives under `$HOME/.local/share/Oolite`
  in the container.
- Windows are found with `xdotool search --class oolite`. `--name` does not
  match, because the title is `_NET_WM_NAME`. There is no window manager, so the
  runner uses `windowfocus`, not `windowactivate`, and sends keys through XTEST
  (no `--window`, which would send synthetic events SDL may ignore).
- Keys are held for 0.5 s because Oolite polls key state once per frame and a
  press-and-release inside one frame is lost under llvmpipe. Menu selection is
  also debounced, so keep pauses between presses.
- Upstream treats a snapshot PNG under 100 KB as a probable black frame.
- To debug inside the image, on the remote:
  `docker run --rm --entrypoint bash wegolite-oolite-reference:1.93.1-255`,
  then `Xvfb :99 &` and run `glxinfo -B`, with `LIBGL_DEBUG=verbose`, or `ldd`
  on `/opt/oolite/bin/oolite`.
- Building Oolite from source is not a fallback. It needs an owner decision.
- The remote clock may differ from the local one; the wrapper extracts with
  `tar -m` so that does not warn.

## Remote directories

- `~/oolite-reference`: the synced copy of this tool.
- `~/oolite-reference-runs/`: one directory per session, deleted after the
  fetch.

Both are separate from `~/wegolite-remote`, which the gate wrapper wipes on
every run. To remove the image:
`ssh opencode@192.168.178.51 docker rmi wegolite-oolite-reference:1.93.1-255`.
