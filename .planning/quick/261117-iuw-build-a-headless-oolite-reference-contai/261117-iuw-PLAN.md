---
phase: quick
plan: 261117-iuw
type: execute
wave: 1
depends_on: []
files_modified:
  - tools/oolite-reference/Dockerfile
  - tools/oolite-reference/entrypoint.sh
  - tools/oolite-reference/run-remote.sh
  - tools/oolite-reference/steps/title.steps
  - tools/oolite-reference/steps/docked.steps
  - tools/oolite-reference/README.md
  - FIDELITY.md
  - .planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md
autonomous: true
requirements: []

estimate:
  tokens: 90000
  raw_tokens: 90000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "Running `tools/oolite-reference/run-remote.sh` from the local checkout syncs the tool to opencode@192.168.178.51, builds the image there, runs one headless Oolite 1.93.1-255 session under Xvfb with Mesa llvmpipe, and fetches the screenshots and Latest.log into a local directory outside the repository (OD-1, OD-4, OD-7)."
    - "The image is built from the pinned AppImage URL and SHA256 `4ec9ab5fc6743538c95b97b590674f5d386dd07c16565aa1389dc40f15bd66a8`. A byte mismatch fails the build. The AppImage is extracted at build time, so it runs without FUSE (OD-3)."
    - "A steps file drives the session. It can wait for the Oolite window, sleep, send keys through xdotool, wait for a fixed log line, and take named screenshots. A bad steps file is refused before Oolite starts, and a failed wait still fetches the outputs."
    - "An AddOns directory passed with `--addons` is mounted read-only and loaded by Oolite. In the smoke check, a throwaway OXP kept under /tmp writes a hello line that appears in the fetched Latest.log (OD-2)."
    - "The smoke check reaches the docked status screen after a new commander starts, and a screenshot of it is captured and recorded in the SUMMARY."
    - "Nothing Oolite-derived is committed. compose.yaml, the root Dockerfile, every gate, NOTICE, ASSETS.md and CHANGELOG.md are unchanged, and the wrapper refuses an output directory inside the repository (OD-1, OD-2, OD-5, OD-8)."
    - "The Oolite version, AppImage URL and SHA256 are recorded in the README, in FIDELITY.md Open items and in the SUMMARY. The measurement todo marks steps 1 and 5 done and stays in `pending/` (OD-8)."
  artifacts:
    - path: "tools/oolite-reference/Dockerfile"
      provides: "Two-stage image: fetch and verify the pinned AppImage and extract it, then a runtime with Xvfb, Mesa llvmpipe, xdotool and ImageMagick, running as a non-root user"
      contains: "4ec9ab5fc6743538c95b97b590674f5d386dd07c16565aa1389dc40f15bd66a8"
    - path: "tools/oolite-reference/entrypoint.sh"
      provides: "In-container session runner: validates the steps file, starts Xvfb, launches Oolite, runs the steps (window, sleep, key, waitlog, shot), shuts down cleanly, writes session.txt"
      contains: "SPDX-License-Identifier: GPL-2.0-or-later"
    - path: "tools/oolite-reference/run-remote.sh"
      provides: "Host wrapper: output-dir guard, tar-over-ssh sync, remote build, docker run with mounts, fetch back, exit code and elapsed time"
      contains: "SPDX-License-Identifier: GPL-2.0-or-later"
    - path: "tools/oolite-reference/steps/title.steps"
      provides: "Default steps: wait for the window and capture the title screen"
      contains: "shot title"
    - path: "tools/oolite-reference/steps/docked.steps"
      provides: "Start a new commander from the title screen and capture the docked status screen"
      contains: "shot docked"
    - path: "tools/oolite-reference/README.md"
      provides: "Purpose, provenance and licence, usage, steps grammar, output layout, exit codes, how to write a measurement OXP, troubleshooting"
      contains: "1.93.1-255"
    - path: "FIDELITY.md"
      provides: "Open items bullet pointing at the reference tool and stating the 1.93.1-241 pin vs the 1.93.1-255 reference build"
      contains: "tools/oolite-reference"
  key_links:
    - from: "tools/oolite-reference/run-remote.sh"
      to: "tools/oolite-reference/Dockerfile"
      via: "tar-over-ssh sync to ~/oolite-reference, then `docker build` there with tag wegolite-oolite-reference:1.93.1-255 and build args OOREF_UID/OOREF_GID"
      pattern: "wegolite-oolite-reference:1\\.93\\.1-255"
    - from: "tools/oolite-reference/run-remote.sh"
      to: "tools/oolite-reference/entrypoint.sh"
      via: "docker run with /out (rw), /session/steps.txt (ro) and the optional /addons (ro) mounts, and --network none"
      pattern: "--network none"
    - from: "tools/oolite-reference/entrypoint.sh"
      to: "Oolite AppRun (extracted AppImage)"
      via: "OO_LOGSDIR=/out/logs and OO_ADDITIONALADDONSDIRS=/addons environment, -nosplash argument"
      pattern: "OO_ADDITIONALADDONSDIRS"
    - from: "FIDELITY.md"
      to: "tools/oolite-reference/README.md"
      via: "Open items bullet link"
      pattern: "tools/oolite-reference/README\\.md"
---

<objective>
Build a headless Oolite reference container on the remote test machine. This is infrastructure only: no measurement is taken here.

This covers steps 1 and 5 of `.planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md`. Step 1 is the image and how it runs; step 5 is provenance. Steps 2 to 4 (the measurement OXP, the comparisons and the UI screenshots) stay open in that todo.

Owner decisions (OD), cited where they are implemented:
- OD-1: the Dockerfile lives in the repo at `tools/oolite-reference/`. It is outside the project `compose.yaml` and is part of no gate (`verify`, `verify-full`, CI).
- OD-2: never commit the Oolite binary, its assets, screenshots or logs. The throwaway smoke OXP lives outside the repo, under `/tmp`.
- OD-3: pin Oolite 1.93.1-255. That matches the local checkout's tag. Use the AppImage at `https://github.com/OoliteProject/oolite/releases/download/1.93.1-255/Oolite-1.93.1-255-deployment-x86_64.AppImage` (278,534,648 bytes, pre-release). Pin its SHA256. Extract it at build time; FUSE is not needed. GitHub's release API publishes the asset digest as `sha256:4ec9ab5fc6743538c95b97b590674f5d386dd07c16565aa1389dc40f15bd66a8` (the planner queried it on 2026-11-17). The `sha256sum -c` in the image build is the proof that the bytes match.
- OD-4: all Docker work runs on the remote machine (opencode@192.168.178.51) over ssh. Nothing is installed on the remote host or on the local host. If anything on the remote host would need installing, STOP and report it, because the owner asked to be told.
- OD-5: run no gates (`verify`, `verify-full`, `e2e`). No app code changes. The only repo checks are the targeted ones in Task 3, and they guard CI against the new files.
- OD-6: the fallback order is fixed. If the AppImage fails under Xvfb/llvmpipe, investigate first: the OpenGL version, missing libraries, SDL driver selection. Building Oolite from source is a STOP-and-report point. Do not do it silently.
- OD-7: the default output goes under `$CLAUDE_JOB_DIR/tmp`, or `/tmp` when that is unset. It never goes inside the repo.
- OD-8: provenance goes in the README, the SUMMARY and a FIDELITY.md pointer. NOTICE and ASSETS.md stay untouched, because nothing Oolite-derived is committed. CHANGELOG is omitted (internal tooling, per AGENTS.md). Update the todo.

Planner discretion (document each choice in the README):
- The sync uses tar over ssh, as `wegolite-remote-run.sh` does, so rsync is not needed on either end. It sends the working-tree copy of `tools/oolite-reference/`, so tool iteration needs no commit. The local git short SHA and a dirty flag are recorded in `wrapper.txt`.
- Steps travel as a file mounted read-only, never as text spliced into a remote shell command.
- Latest.log is written straight into the output mount through `OO_LOGSDIR`, so it survives a crash or a timeout with no copy step.
- The container runs with `--network none` and as a non-root user whose uid and gid match the remote user, so the outputs on the remote are not root-owned.
- The remote directories `~/oolite-reference` and `~/oolite-reference-runs/` are separate from `~/wegolite-remote`, which `wegolite-remote-run.sh` wipes on every run.
- PROJECT.md Key Decisions is not touched. This is test tooling, not a product decision. The fidelity-relevant fact, that the reference build is newer than the pin, goes in FIDELITY.md Open items.

Purpose: give the measurement todo a reproducible real Oolite to measure against, with screenshots and log output fetched back automatically.
Output: `tools/oolite-reference/` (Dockerfile, entrypoint.sh, run-remote.sh, two steps files, README.md), one FIDELITY.md Open items bullet, an updated todo, and a SUMMARY with the smoke evidence.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@AGENTS.md
@.planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md
@/home/opencode/.claude/scripts/wegolite-remote-run.sh

Reviewer and subagent brief (from AGENTS.md, include it verbatim in any subagent prompt):
- Tests and builds run in Docker only. Host Node, npm and Playwright are not authoritative, and a green host run is not evidence.
- Commands: `docker compose run --rm test` (Vitest), `docker compose run --rm test npx vitest run <file>` (targeted), `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test <spec>"` (browser), `docker compose run --rm e2e-cross` (Firefox browser tests, outside verify), `docker compose run --rm typecheck`, `docker compose run --rm lint`, `docker compose run --rm verify` (full gate).
- A reproduction that needs a scratch script or test must live under `/tmp` and be mounted into the container: `docker compose run --rm -v /tmp/<dir>:/scratch test ...`. Never add scratch files to the repository.
- Read-only reviewers must not modify tracked files; report findings instead.
- For this task: Docker work runs only on the remote test machine. The new tool runs it over ssh, and the repo checks go through `/home/opencode/.claude/scripts/wegolite-remote-run.sh <compose args>`, which syncs the COMMITTED HEAD, so commit first. Do NOT run `verify`, `verify-full` or `e2e`. Use the codebase-memory MCP index (project `wegolite`) before grepping repo code, and prefer `rg` over `grep`.
- Oolite reference checkout: `/home/opencode/git/oolite` (tag 1.93.1-255). Read Oolite behaviour and source there, and never fetch Oolite source or configs over the network. The single network fetch is the pinned AppImage, inside the remote image build, by owner decision (OD-3).

Facts verified by the planner in the Oolite checkout (cite them, do not re-derive):
- Logs: `src/Core/OOLogOutputHandler.m:551-580`. With `OO_LOGSDIR` set, Latest.log is written directly into that directory. Otherwise it goes to `~/.Oolite/Logs/` on Linux. Upstream's CI test relies on this (`tests/launch_snapshot.py:135-137`). Logging is asynchronous with a flush interval of 2.0 s (`OOLogOutputHandler.m:82`), and there is no signal handler. A line the session needs must be confirmed with `waitlog`, or Oolite must be given at least 3 s before it is terminated.
- Upstream headless recipe: `tests/launch_snapshot.py:125-139` sets `LIBGL_ALWAYS_SOFTWARE=1`, `GALLIUM_DRIVER=llvmpipe`, `SDL_AUDIODRIVER=dummy`, `ALSOFT_DRIVERS=null` (OpenAL), `OO_SNAPSHOTSDIR` and `OO_LOGSDIR`. Upstream also uses SDL's offscreen video driver. This tool must not: xdotool needs a real X window, so use Xvfb with SDL's x11 driver. Oolite 1.93 is on SDL3 (`src/SDL/MyOpenGLView.m:156`, `SDL_CreateWindowWithProperties`), so also set the SDL3 names `SDL_AUDIO_DRIVER=dummy` and `SDL_VIDEO_DRIVER=x11`. The upstream script passes `--no-splash`, which Oolite does not recognise. The accepted spellings are `-nosplash` and `--nosplash` (`MyOpenGLView.m:332-338`). `-nosound` exists as a fallback (`src/Core/OOOpenALController.m:53`).
- The AppImage is built with sharun, and `DEPLOY_OPENGL=0` (`installers/appimage/create_appimage_fn.sh:35-45`). Mesa is NOT bundled, so the image must provide libGL and Mesa (libgl1, libglx-mesa0, libgl1-mesa-dri, libegl1). Oolite changes directory to its executable's directory and resolves `Resources` from there (`src/SDL/main.m:145-166`, `src/Core/ResourceManager.m` builtInPath). Launch it through the extracted `AppRun`.
- Add-ons: `OO_ADDITIONALADDONSDIRS` is a comma-separated list of AddOns root directories. Each root holds `*.oxp` folders. They are prepended to the search paths (`src/Core/OOOXZManager.m:266-275`, `ResourceManager.m:163-189`). The default user root is `~/.Oolite/AddOns` (`OOOXZManager.m:244-262`). At startup Oolite logs `Resource paths: ...` (`ResourceManager.m:1985`, class `searchPaths.dumpAll`, on by default per `Resources/Config/logcontrol.plist:330`). It also lists the loaded world scripts (`script.load.world.listAll`, `logcontrol.plist:311`).
- OXP world script: `Config/world-scripts.plist`, or else `Config/script.js` (`src/Core/Scripting/OOScript.m:54-66`). JavaScript `log()` (`src/Core/Scripting/OOJSGlobal.m:230-260`): the one-argument form logs under class `script.debug.message`, which inherits `$scriptDebugOn = no` (`logcontrol.plist:35, 255-256`), so it never reaches Latest.log. The two-argument form `log(this.name, "...")` uses the first argument as the class, and unknown classes are on (`logcontrol.plist:26`, `_default = yes`).
- Useful default log lines: `Opening log for Oolite <version> ...` (`src/Core/OOLogHeader.m:169`) and `OpenGL renderer version: ... Renderer: "<name>"` (`src/Core/OOOpenGLExtensionManager.m:240`, class `rendering.opengl.version`, on by default per `logcontrol.plist:221`). Under llvmpipe the renderer name contains `llvmpipe`.
- Start flow: the title screen offers six options. The default selected row is "Start New Commander" (`src/Core/Entities/PlayerEntity.m:8755-8810`). Return (`n_key_gui_select`) on it opens the scenario screen (`src/Core/Entities/PlayerEntityControls.m:4228-4230`). Return there starts the selected scenario (`PlayerEntityControls.m:4345-4350`). The first scenario is `oolite-standard` (`Resources/Config/scenarios.plist:2-7`). Loading it docks the player at the main station (`src/Core/Entities/PlayerEntityLoadSave.m:598`). Selection is debounced through `selectPressed`, so send separate key presses with pauses. F5 is the status screen (`Resources/Config/keyconfig.plist:14`).
- Upstream's black-frame heuristic: a snapshot PNG under 100 KB is probably a black frame (`tests/launch_snapshot.py:28, 216-220`).
- Version skew: FIDELITY.md pins Oolite 1.93.1-241 at `7437f22`. The reference build is 1.93.1-255, 14 commits later. `git -C /home/opencode/git/oolite diff --stat 7437f22..1.93.1-255 -- src Resources/Config` touches only joystick and key mapping (PlayerEntityControls, PlayerEntityKeyMapper, PlayerEntityStickMapper, OOJoystickManager, OOSDLJoystickManager), PlayerEntityLoadSave, a HUD distance-unit string that now comes from descriptions.plist (HeadUpDisplay.m, 7 lines), descriptions.plist text, and src/meson.build. None of them touches ShipEntity, Octree, OOMesh or Universe.

Repo facts verified by the planner (HEAD cb5262f):
- `tests/compliance.test.ts:45, 247-260` requires `SPDX-License-Identifier: GPL-2.0-or-later` within the first 3 lines of every `.sh`, `.ts` and `.js` file outside `.planning`, `.agents` and the build dirs. Copy the header of `scripts/smoke-dev.sh`: line 1 the shebang, line 2 the SPDX line, line 3 `# Copyright (c) 2026 Wegolite contributors`.
- `npm run lint` is `eslint . && prettier --check .`, and `.prettierignore` does not exclude `tools/`. So `tools/oolite-reference/README.md` and the FIDELITY.md edit must be Prettier-clean. Prettier skips `.sh`, Dockerfile and `.steps` files (it has no parser for them).
- `tests/contract/fidelity.test.ts` parses only the `## Mechanics` and `## Excerpts` sections of FIDELITY.md. A bullet under `## Open items` does not touch the row contract.
- Root `Dockerfile` style: `# syntax=docker/dockerfile:1`, with the base pinned by tag plus index digest as reported by `docker buildx imagetools inspect` (`Dockerfile:1-7`).
</context>

<tasks>

<task type="tracer">
  <name>Task 1: Tracer: build the image on the remote, launch Oolite under Xvfb, fetch a title-screen screenshot and Latest.log (OD-1, OD-3, OD-4, OD-6, OD-7)</name>
  <files>tools/oolite-reference/Dockerfile, tools/oolite-reference/entrypoint.sh, tools/oolite-reference/run-remote.sh, tools/oolite-reference/steps/title.steps</files>
  <precondition>`ssh -o BatchMode=yes opencode@192.168.178.51 docker version --format '{{.Server.Version}}'` prints a server version; if ssh or Docker is unavailable, halt and report.</precondition>
  <read_first>
    - /home/opencode/.claude/scripts/wegolite-remote-run.sh (all 19 lines: the ssh host, the atomic `.tmp` then `mv` sync, the `printf %q` quoting and the exit/elapsed line to mirror)
    - Dockerfile lines 1-7 and 53-66 (base pinning by index digest; the existing xvfb install pattern)
    - scripts/smoke-dev.sh lines 1-3 (the SPDX header form)
    - /home/opencode/git/oolite/tests/launch_snapshot.py lines 115-147 (upstream's headless environment)
    - /home/opencode/git/oolite/installers/appimage/create_appimage_fn.sh lines 35-50 (sharun, Mesa not bundled)
  </read_first>
  <action>
Create the four files so that one path works end to end: local wrapper, then remote build, then a container session, then a local fetch.

Dockerfile (per OD-1 and OD-3):
- Start with `# syntax=docker/dockerfile:1`, then a comment header. The header holds the SPDX line and these points: the image contains Oolite's GPL-2.0-or-later binary and its CC BY-NC-SA 3.0 assets; it is built on the test machine for reference measurements only; it is never published to a registry; it is not part of compose.yaml or any gate.
- Base: `debian:bookworm-slim`, pinned by tag plus index digest. Resolve the digest on the remote with `docker buildx imagetools inspect debian:bookworm-slim` and record that command in the comment, as the root Dockerfile does.
- Stage `fetch`: install curl and ca-certificates. Download with ARGs `OOLITE_VERSION=1.93.1-255`, `APPIMAGE_URL` (the OD-3 URL) and `APPIMAGE_SHA256=4ec9ab5fc6743538c95b97b590674f5d386dd07c16565aa1389dc40f15bd66a8`, then verify with `sha256sum -c`. Make it executable and run `--appimage-extract` in a work directory. Move the extracted root (normally `squashfs-root`; confirm the name with `ls`) to `/opt/oolite` and delete the AppImage file.
- Stage `runtime`: same pinned base. With `--no-install-recommends`, install xvfb, x11-utils, xdotool, imagemagick, libgl1, libglx-mesa0, libgl1-mesa-dri, libegl1, mesa-utils and procps, then clean the apt lists. `COPY --from=fetch /opt/oolite /opt/oolite`. Pre-create `/tmp/.X11-unix` with mode 1777.
- Create user `oolite` from ARGs `OOREF_UID` and `OOREF_GID` (default 1000). Do not name these ARGs UID or GID: UID is a read-only variable in bash.
- ENV: `LIBGL_ALWAYS_SOFTWARE=1`, `GALLIUM_DRIVER=llvmpipe`, `SDL_AUDIODRIVER=dummy`, `SDL_AUDIO_DRIVER=dummy`, `SDL_VIDEO_DRIVER=x11`, `ALSOFT_DRIVERS=null`, `DISPLAY=:99`, `OOREF_OOLITE_VERSION` and `OOREF_APPIMAGE_SHA256`, both carried from the ARGs.
- COPY `entrypoint.sh` LAST with `--chmod=0755`, so editing it rebuilds only one small layer. Then `USER oolite`, `WORKDIR /home/oolite` and `ENTRYPOINT ["/usr/local/bin/oolite-ref-session"]`, or whatever path you copy it to.

entrypoint.sh (bash, SPDX header):
- Read the steps file `/session/steps.txt`. Validate the WHOLE file before starting anything, and exit 2 on any bad line. Blank lines and `#` comments are allowed. For this task implement the verbs `window [TIMEOUT]`, `sleep SECONDS` and `shot NAME`: integers only, and NAME matching `^[A-Za-z0-9_-]+$`. Reject unknown verbs. Task 2 adds `key` and `waitlog`.
- Create `/out/logs`, `/out/screenshots` and `/out/snapshots`. Start `Xvfb :99 -screen 0 1280x1024x24 -nolisten tcp -noreset`, and wait until `xdpyinfo` answers (bounded wait).
- Launch `/opt/oolite/AppRun -nosplash` in the background. Set `OO_LOGSDIR=/out/logs`, `OO_SNAPSHOTSDIR=/out/snapshots` and `OO_SAVEDIR=$HOME/oolite-saves`. Send its stdout and stderr to `/out/oolite-stdout.log`.
- `window`: wait (default 120 s) with `xdotool search --sync --onlyvisible --name Oolite`. Confirm the title substring once from `xwininfo -root -tree` and adjust it if needed. Then `xdotool windowfocus --sync` on the id. Use windowfocus, not windowactivate, because there is no EWMH window manager. Remember the id.
- `shot NAME`: `import -window <id>` when a window id is known, otherwise `import -window root`. Write `/out/screenshots/NN-NAME.png`, where NN is a two-digit sequence, so order is kept.
- Before every step, check that Oolite is still alive. If it died, record that and exit 1.
- Enforce an overall deadline from `OOREF_TIMEOUT` (default 300 s). Every wait is bounded by the remaining time, and expiry ends the session with exit 124.
- Shutdown on every path, using a trap: wait 3 s for the log flush (above the 2.0 s flush interval), send SIGTERM to Oolite, wait up to 10 s, then SIGKILL, then stop Xvfb.
- Write `/out/session.txt` with the Oolite version, the AppImage SHA256, the start and end times in UTC, each step with its status, and the exit code.

run-remote.sh (bash, SPDX header, mirroring wegolite-remote-run.sh style):
- Options: `--out DIR`, `--steps FILE` (default `tools/oolite-reference/steps/title.steps`, resolved relative to the script directory), `--timeout SECONDS` (integer, default 300) and `--no-build`. Task 2 adds `--addons DIR`. Host from `OOREF_HOST`, default `opencode@192.168.178.51`.
- Output guard (OD-7), checked before any ssh. Resolve the out dir with `realpath -m`. Refuse with exit 64 if it is inside `git -C <script dir> rev-parse --show-toplevel`, or if it exists and is not empty. The default is `${CLAUDE_JOB_DIR:+$CLAUDE_JOB_DIR/tmp}`, falling back to `/tmp`, followed by `/oolite-reference/<UTC yyyymmddThhmmssZ>`.
- Sync: tar only `Dockerfile`, `entrypoint.sh` and `steps/` from the script directory over ssh into `~/oolite-reference.tmp`, then swap it into `~/oolite-reference` (the same atomic pattern). Exit 70 with "sync failed" on error. Never touch `~/wegolite-remote`.
- Build, unless `--no-build`: read the remote `id -u` and `id -g`, then run `docker build --build-arg OOREF_UID=... --build-arg OOREF_GID=... -t wegolite-oolite-reference:1.93.1-255 ~/oolite-reference` on the remote. Exit 70 on failure.
- Session: create `~/oolite-reference-runs/<stamp>-<random>/` on the remote, with `out/` and the steps file copied in through tar over ssh. Run `docker run --rm --init --network none -e OOREF_TIMEOUT=<n> -v <session>/out:/out -v <session>/steps.txt:/session/steps.txt:ro wegolite-oolite-reference:1.93.1-255`. Every value in a remote command string is generated by the script or validated (an integer timeout) and quoted with `printf %q`. Step text is never spliced into a remote command.
- Fetch: `ssh tar -C <session>/out -cf - .`, piped into a local `tar -x` into the out dir, whatever the container's exit code. Then delete the remote session dir. Write a local `wrapper.txt` with the git short SHA and dirty flag, the host, the remote image ID (`docker image inspect --format '{{.Id}}'`), the container exit code and the elapsed seconds.
- Print `exit=<rc> elapsed=<s>s out=<dir>` and exit with the container's code.

steps/title.steps: comment lines saying what it does, then `window 120`, `sleep 10`, `shot title`.

Commit both scripts with the executable bit (git mode 100755).

Iterate on the remote until the verify passes. If Oolite does not render (a black frame, a crash, or no GL context), investigate per OD-6:
- the `OpenGL renderer version` line in Latest.log;
- `glxinfo -B` run inside the image with `DISPLAY` on a manually started Xvfb, through `docker run --rm --entrypoint bash ...`;
- `LIBGL_DEBUG=verbose`;
- `ldd` on the binary under `/opt/oolite`;
- stdout in `/out/oolite-stdout.log`;
- `-nosound` if OpenAL blocks.
If a missing library can be added from Debian packages to the image, add it. If the only way forward is a source build, or installing something on the remote host, STOP and report with the evidence.

Commit: `feat(quick-261117-iuw): add a headless Oolite reference image and remote runner`.
  </action>
  <verify>
    <automated>bash -n tools/oolite-reference/run-remote.sh && bash -n tools/oolite-reference/entrypoint.sh && { tools/oolite-reference/run-remote.sh --out "$(git rev-parse --show-toplevel)/tools/oolite-reference/out"; test $? -eq 64; } && test ! -e tools/oolite-reference/out && rm -rf /tmp/ooref-t1 && tools/oolite-reference/run-remote.sh --out /tmp/ooref-t1 && test -n "$(find /tmp/ooref-t1/screenshots -name '*title.png' -size +100k)" && rg -q 'Opening log for Oolite 1\.93\.1' /tmp/ooref-t1/logs/Latest.log && rg -qi 'renderer.*llvmpipe' /tmp/ooref-t1/logs/Latest.log && rg -q 'exit' /tmp/ooref-t1/session.txt && for f in run-remote.sh entrypoint.sh; do head -3 tools/oolite-reference/$f | rg -q 'SPDX-License-Identifier: GPL-2.0-or-later' || exit 1; done && rg -c '4ec9ab5fc6743538c95b97b590674f5d386dd07c16565aa1389dc40f15bd66a8' tools/oolite-reference/Dockerfile  # [HEAD=absent EXPECT>=1]</automated>
  </verify>
  <done>
- `run-remote.sh` refuses an output dir inside the repo with exit 64, before any ssh.
- One full run builds the image on the remote and fetches `/tmp/ooref-t1/screenshots/01-title.png`. The file is over 100 KB, and the executor viewed it with the Read tool and confirmed it shows the Oolite title screen.
- The run also fetches `logs/Latest.log`, with the 1.93.1 header and an llvmpipe renderer line, and `session.txt`.
- The image build log shows the `sha256sum -c` OK line for the pinned digest.
- Both scripts carry the SPDX header and git mode 100755.
  </done>
</task>

<task type="auto">
  <name>Task 2: Expand: keys, log waits and a mounted AddOns directory; smoke check to the docked status screen with a throwaway OXP outside the repo (OD-2, OD-4)</name>
  <files>tools/oolite-reference/entrypoint.sh, tools/oolite-reference/run-remote.sh, tools/oolite-reference/steps/docked.steps</files>
  <read_first>
    - tools/oolite-reference/entrypoint.sh and tools/oolite-reference/run-remote.sh (as written in Task 1)
    - /home/opencode/git/oolite/src/Core/Scripting/OOJSGlobal.m lines 230-260 (two-argument log)
    - /home/opencode/git/oolite/src/Core/OOOXZManager.m lines 244-275 (AddOns roots)
    - /home/opencode/git/oolite/src/Core/Entities/PlayerEntityControls.m lines 4213-4245 and 4320-4355 (title and scenario screen keys)
  </read_first>
  <action>
Extend entrypoint.sh with two verbs. Validate them up front like the others.
- `key KEYSYM...`: each keysym matches `^[A-Za-z0-9_+]+$`. Run `xdotool key --delay 150` on them through XTEST to the focused window. Do NOT pass `--window`: that sends XSendEvent synthetic events, which SDL may ignore. Re-focus the remembered window first.
- `waitlog TIMEOUT TEXT...`: the rest of the line is a fixed string. Poll `/out/logs/Latest.log` once a second with a fixed-string match until it appears or TIMEOUT expires. A timeout fails the session with exit 1 after the normal shutdown, so the outputs are still fetched.

Extend run-remote.sh with `--addons DIR`: a local directory whose children are `*.oxp` folders. Refuse a missing directory, or one with no `*.oxp` child, with exit 64. Copy it into `<session>/addons` through tar over ssh. Mount it read-only at `/addons`, and set `OO_ADDITIONALADDONSDIRS=/addons` on `docker run`. Record the add-on folder names in `wrapper.txt`.

Create steps/docked.steps:
- comment lines describing the flow;
- `window 120`, `sleep 10`, `shot title`;
- `key Return`, `sleep 3`, `shot scenarios`;
- `key Return`, `sleep 20`, `shot docked`.
Tune the sleeps to what llvmpipe actually needs and record the timings in the SUMMARY. If the screen after the start is not the status screen, add `key F5` and `sleep 2` before `shot docked`.

Smoke check (OD-2). Every throwaway file lives under `/tmp/oolite-ref-smoke/`, never in the repo:
- Create `/tmp/oolite-ref-smoke/addons/wegolite-smoke.oxp/Config/script.js`. It is a world script: set `this.name = "wegolite-smoke"`, `this.author` and `this.version = "0.0.1"`. In `this.startUp`, call the two-argument form `log(this.name, "wegolite-smoke: hello from startUp")`. Do not use the one-argument form; it is filtered out by default (see context).
- Create `/tmp/oolite-ref-smoke/smoke.steps`: the content of `steps/docked.steps` plus the final line `waitlog 60 wegolite-smoke: hello`.
- Create `/tmp/oolite-ref-smoke/never.steps` with `window 120` and `waitlog 5 this line never appears`.

Run the verify. View `NN-title.png`, `NN-scenarios.png` and `NN-docked.png` with the Read tool, and confirm the docked one shows the docked status screen (commander status at the station). Then copy these into `/tmp/oolite-ref-smoke/evidence/` for the SUMMARY:
- the screenshots;
- the matching Latest.log lines: the `Resource paths` entry with `/addons`, the world-script list entry for `wegolite-smoke`, the hello line, and the OpenGL renderer line.
Do not commit any of them.

Commit: `feat(quick-261117-iuw): drive the reference session with keys, log waits and an AddOns mount`.
  </action>
  <verify>
    <automated>test -f /tmp/oolite-ref-smoke/addons/wegolite-smoke.oxp/Config/script.js && rm -rf /tmp/ooref-t2 /tmp/ooref-neg && tools/oolite-reference/run-remote.sh --out /tmp/ooref-t2 --steps /tmp/oolite-ref-smoke/smoke.steps --addons /tmp/oolite-ref-smoke/addons && rg -q 'wegolite-smoke: hello' /tmp/ooref-t2/logs/Latest.log && rg -q 'wegolite-smoke\.oxp' /tmp/ooref-t2/logs/Latest.log && test -n "$(find /tmp/ooref-t2/screenshots -name '*docked.png' -size +100k)" && { tools/oolite-reference/run-remote.sh --no-build --out /tmp/ooref-neg --steps /tmp/oolite-ref-smoke/never.steps; test $? -eq 1; } && test -s /tmp/ooref-neg/logs/Latest.log && ST="$(git status --porcelain --untracked-files=all)" && test -z "$(printf '%s\n' "$ST" | rg -v '^.. (tools/oolite-reference/|\.planning/)')"</automated>
  </verify>
  <done>
- The smoke run exits 0. The fetched Latest.log contains the hello line and the `wegolite-smoke.oxp` add-on path.
- `NN-docked.png` is over 100 KB, and the executor viewed it and confirmed the docked status screen.
- The negative run exits 1 and still fetches a non-empty Latest.log.
- The OXP, the steps under /tmp and the evidence stay out of the repo. Only `tools/oolite-reference/` changed in the working tree.
  </done>
</task>

<task type="auto">
  <name>Task 3: Provenance and docs: README, FIDELITY.md Open items pointer, todo update, targeted repo checks (OD-5, OD-8)</name>
  <files>tools/oolite-reference/README.md, FIDELITY.md, .planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md</files>
  <read_first>
    - FIDELITY.md lines 1-12 and 1531-1551 (the pin statement and the Open items section style)
    - .planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md (all 70 lines)
    - tools/oolite-reference/run-remote.sh and tools/oolite-reference/entrypoint.sh (final options, verbs and exit codes to document)
  </read_first>
  <action>
Write tools/oolite-reference/README.md in English. Keep it short and Prettier-clean. Sections:

1. Purpose: a real Oolite to measure Wegolite against, for the measurement todo. It is not a gate, not in compose.yaml and not part of CI. OXP support stays out of Wegolite's scope: OXPs are used here only as throwaway measurement probes kept outside the repo.
2. Provenance and licence:
   - Oolite 1.93.1-255, deployment AppImage, x86_64, a pre-release;
   - the URL;
   - the size, 278,534,648 bytes;
   - the SHA256 `4ec9ab5fc6743538c95b97b590674f5d386dd07c16565aa1389dc40f15bd66a8`, matching GitHub's published asset digest;
   - the base image tag and digest;
   - the binary and assets are GPL-2.0-or-later and CC BY-NC-SA 3.0, are never committed, and the image is built only on the test machine and never published;
   - screenshots and logs are Oolite output and stay outside the repo;
   - the version skew: FIDELITY.md pins 1.93.1-241 at 7437f22, this build is 14 commits later, and the context lists what those commits touch.
3. Requirements: ssh to the test machine with Docker there. Nothing is installed on either host.
4. Usage:
   - every wrapper option and its default;
   - the output layout (`screenshots/NN-name.png`, `logs/Latest.log`, `oolite-stdout.log`, `session.txt`, `wrapper.txt`);
   - the exit codes (0, 1, 2, 64, 70, 124).
5. Steps file grammar: one verb per line with its argument rules (window, sleep, key, waitlog, shot), plus the two shipped steps files.
6. Writing a measurement OXP: a folder `<name>.oxp/Config/script.js` kept outside the repo and passed with `--addons`. Use the two-argument `log(this.name, ...)`, because the one-argument form is filtered out, with the OOJSGlobal.m and logcontrol.plist citations. Use `waitlog` to wait for the lines you need, because of the 2 s asynchronous log flush.
7. Headless notes and troubleshooting: the environment variables and why each one is set, `-nosplash`, focusing with XTEST and windowfocus, `glxinfo -B`, `LIBGL_DEBUG`, `ldd`. A source build is a decision for the owner, not a fallback.
8. Remote directories (`~/oolite-reference`, `~/oolite-reference-runs/`), and how to remove the image.

Use the actual values from the Task 1 and 2 implementation: the base digest and the tuned sleeps.

FIDELITY.md: add ONE bullet at the end of `## Open items`, in the existing bold-lead style. Leave every other line unchanged. It says:
- `**Reference Oolite for measurements.**` A headless Oolite 1.93.1-255 (AppImage SHA256 `4ec9ab5fc6743538c95b97b590674f5d386dd07c16565aa1389dc40f15bd66a8`) now runs on the test machine from `[tools/oolite-reference/README.md](./tools/oolite-reference/README.md)`.
- It is 14 commits after the 1.93.1-241 pin (`7437f22`). Those commits touch joystick and key mapping, load/save, a HUD distance-unit string and descriptions.plist text, and none touches ShipEntity, Octree, OOMesh or Universe. A measured difference therefore applies to the pinned excerpts, unless it lands in one of those files.
- No value has been measured yet. The comparisons stay open in `.planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md`.

Todo update (it stays in `pending/`):
- Add `tools/oolite-reference/README.md` to the frontmatter `files` list.
- In `## Solution` -> Plan, mark step 1 done: owner chose `tools/oolite-reference/`, outside compose.yaml and all gates; built and smoke-checked in quick task 261117-iuw on 2026-11-17; Oolite 1.93.1-255 AppImage; how to run it.
- Mark step 5 done for the reference build: the version, URL and SHA256 are recorded in the README, FIDELITY.md Open items and the 261117-iuw SUMMARY. Each measurement run records its own session.txt and wrapper.txt in its SUMMARY.
- Add one line under the open items saying the reference build is 1.93.1-255, not the 1.93.1-241 pin, with a pointer to the FIDELITY bullet.
- Leave steps 2 to 4 and the Phase 16 items as open work.

Commit (`docs(quick-261117-iuw): record the Oolite reference image provenance and update the measurement todo`). THEN run the targeted remote checks in the verify. They sync the committed HEAD.
  </action>
  <verify>
    <automated>rg -c '4ec9ab5fc6743538c95b97b590674f5d386dd07c16565aa1389dc40f15bd66a8' tools/oolite-reference/README.md FIDELITY.md && rg -c 'tools/oolite-reference/README\.md' FIDELITY.md && rg -c '1\.93\.1-255' FIDELITY.md && rg -c '261117-iuw' .planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md && test -f .planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md && LS="$(git ls-files tools/oolite-reference)" && test -n "$LS" && test -z "$(printf '%s\n' "$LS" | rg -i '\.(appimage|png|log|oxp)$')" && MODES="$(git ls-files -s tools/oolite-reference/run-remote.sh tools/oolite-reference/entrypoint.sh)" && test "$(printf '%s\n' "$MODES" | rg -c '^100755')" -eq 2 && ! { cat tools/oolite-reference/run-remote.sh tools/oolite-reference/entrypoint.sh | rg -v '^\s*#' | rg -q 'docker +push'; } && git diff --quiet cb5262f -- compose.yaml Dockerfile NOTICE ASSETS.md CHANGELOG.md package.json src tests && /home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm test npx vitest run tests/compliance.test.ts tests/contract/fidelity.test.ts && /home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm lint npx prettier --check tools/oolite-reference/README.md FIDELITY.md  # gates: README sha [HEAD=absent EXPECT>=1]; FIDELITY sha [HEAD=0 EXPECT>=1]; FIDELITY README link [HEAD=0 EXPECT>=1]; FIDELITY 1.93.1-255 [HEAD=0 EXPECT>=1]; todo 261117-iuw [HEAD=0 EXPECT>=1]; docker push in scripts [HEAD=absent EXPECT==0]</automated>
  </verify>
  <done>
- The README documents purpose, provenance and licence, usage, the steps grammar, the output layout, exit codes, how to write a measurement OXP, and troubleshooting, using the real pinned values.
- FIDELITY.md has exactly one new Open items bullet with the version, SHA256, skew note and link.
- The todo marks steps 1 and 5 done and stays in pending/.
- No binary, screenshot, log or OXP is tracked. compose.yaml, the root Dockerfile, NOTICE, ASSETS.md, CHANGELOG.md, package.json, src/ and tests/ are unchanged since cb5262f.
- The remote targeted vitest run (compliance and fidelity contract) and the Prettier check both exit 0.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| GitHub release -> image build | Untrusted binary bytes enter the image at build time on the remote |
| Local workstation -> remote host (ssh) | The wrapper builds remote shell commands and ships files |
| Container -> remote host | Bind mounts (/out rw, /session/steps.txt ro, /addons ro) and network access |
| OXP JavaScript -> Oolite | Add-on scripts run inside the Oolite process in the container |
| Oolite output -> repository | Screenshots and logs are Oolite-derived (CC BY-NC-SA) and must not be committed |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-iuw-01 | Tampering | Dockerfile `fetch` stage (AppImage download) | high | mitigate | The pinned URL and the ARG `APPIMAGE_SHA256` are checked with `sha256sum -c` before extraction. The value equals GitHub's published asset digest. A mismatch fails the build, and the executor stops and reports instead of re-pinning. |
| T-iuw-02 | Elevation of privilege | `run-remote.sh` remote command strings | medium | mitigate | Steps and add-ons travel as files through tar and are never spliced into a remote shell. The only interpolated values are script-generated paths and a validated integer timeout, quoted with `printf %q`. The steps verbs, keysyms and shot names are validated against fixed patterns before Oolite starts (exit 2). |
| T-iuw-03 | Information disclosure (licence posture) | Output dir, git index, image distribution | high | mitigate | The output guard refuses any `--out` inside the git top level (exit 64, proven in Task 1's verify). Task 3 gates `git ls-files tools/oolite-reference` against binary, image, log and OXP extensions. The image keeps a local tag only, and no script publishes it (Task 3 gate). The README and the Dockerfile header state the licence terms. |
| T-iuw-04 | Elevation of privilege | `docker run` session | medium | mitigate | A non-root user with uid and gid matching the remote user. No `--privileged`, no devices and no FUSE (the AppImage is extracted at build time). `--network none` at run time, so neither Oolite's expansion manager nor an OXP can reach the network. `--rm --init`. |
| T-iuw-05 | Denial of service | Shared remote test machine | low | mitigate | An overall session deadline (default 300 s, exit 124) and a SIGTERM-then-SIGKILL shutdown on every path. The remote session dir is deleted after the fetch. The tool uses `~/oolite-reference*` only, so it never collides with `~/wegolite-remote`, which the gate wrapper wipes. |
| T-iuw-06 | Tampering | Remote host state | low | mitigate | Nothing is installed on the remote host (OD-4: stop and report if that becomes necessary). All tooling is inside the image. |
| T-iuw-SC | Tampering | npm/pip/cargo installs | high | accept | No npm, pip or cargo package is installed. The apt packages come from the Debian archive, signature-checked by apt, inside a base image pinned by digest. The single third-party binary is covered by T-iuw-01. No package-legitimacy checkpoint is needed. |
</threat_model>

<verification>
- Task 1 and Task 2 verifies run real sessions on the remote through the new wrapper: a build, a title screenshot, the llvmpipe log line, the AddOns hello line, the docked screenshot, and the negative waitlog exit 1.
- Task 3 runs the targeted repo checks on the remote via `/home/opencode/.claude/scripts/wegolite-remote-run.sh` after the commit: `run --rm test npx vitest run tests/compliance.test.ts tests/contract/fidelity.test.ts` and `run --rm lint npx prettier --check tools/oolite-reference/README.md FIDELITY.md`. No `verify`, `verify-full` or `e2e` run (OD-5).
- `git diff --quiet cb5262f -- compose.yaml Dockerfile NOTICE ASSETS.md CHANGELOG.md package.json src tests` exits 0.
- The SUMMARY records:
  - the Oolite version, AppImage URL, SHA256 and base image digest;
  - the remote image ID;
  - the smoke evidence: screenshot names and sizes, the four Latest.log lines and the tuned step timings;
  - any stop-and-report events.
</verification>

<success_criteria>
- One command from the local checkout builds the pinned Oolite 1.93.1-255 reference image on the remote, runs a scripted headless session and brings back the screenshots and Latest.log, outside the repo.
- The smoke check reached the docked status screen, and a throwaway OXP's two-argument `log()` line appeared in Latest.log.
- Provenance (version, URL, SHA256) is in the README, FIDELITY.md Open items and the SUMMARY. The todo marks steps 1 and 5 done and stays open for the measurements.
- No Oolite binary, asset, screenshot, log or OXP is committed. No gate, compose service or app code changed.
</success_criteria>

<output>
Create `.planning/quick/261117-iuw-build-a-headless-oolite-reference-contai/261117-iuw-SUMMARY.md` when done
</output>
