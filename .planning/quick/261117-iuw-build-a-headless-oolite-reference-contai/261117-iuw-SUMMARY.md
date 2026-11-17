---
phase: quick
plan: 261117-iuw
subsystem: tooling
tags: [oolite, docker, xvfb, llvmpipe, fidelity, reference]
requires: []
provides:
  - tools/oolite-reference/ headless Oolite 1.93.1-255 reference image and remote runner
affects:
  - FIDELITY.md (one Open items bullet)
  - .planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md (steps 1 and 5 marked done)
tech-stack:
  added: [debian:bookworm-slim base, Xvfb, Mesa llvmpipe, xdotool, ImageMagick]
  patterns:
    [tar-over-ssh sync, steps-file driven session, outputs written into a bind mount]
key-files:
  created:
    - tools/oolite-reference/Dockerfile
    - tools/oolite-reference/entrypoint.sh
    - tools/oolite-reference/run-remote.sh
    - tools/oolite-reference/steps/title.steps
    - tools/oolite-reference/steps/docked.steps
    - tools/oolite-reference/README.md
  modified:
    - FIDELITY.md
    - .planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md
decisions:
  - "Windows are found with xdotool --class oolite, not --name (the title is _NET_WM_NAME)"
  - "Keys are held 0.5 s so Oolite's per-frame key poll sees them under llvmpipe"
  - "The runner sets APPDIR, APPIMAGE and OO_DIRTYPE=xdg so the AppImage launcher builds its GNUstep config"
metrics:
  duration: about 25 min
  completed: 2026-11-17
status: complete
actuals:
  tokens: 40000
  tasks: 3
  commits: 3
plan_head_before: cb5262ff6f7b170d66c55721df1b823ad1a34523
plan_head_after: 7f479a8d32fc05a0663d8196607e7dc00c07ea82
---

# Phase quick Plan 261117-iuw: Headless Oolite reference container Summary

One command, `tools/oolite-reference/run-remote.sh`, builds a pinned Oolite 1.93.1-255 image on the remote test machine, runs a scripted headless session (Xvfb, Mesa llvmpipe, xdotool) and fetches screenshots and `Latest.log` back outside the repository.

This is infrastructure only; nothing was measured. It covers steps 1 and 5 of the measurement todo.

## Provenance

- Oolite 1.93.1-255, deployment AppImage, x86_64, GitHub pre-release.
- URL: `https://github.com/OoliteProject/oolite/releases/download/1.93.1-255/Oolite-1.93.1-255-deployment-x86_64.AppImage`
- SHA256: `4ec9ab5fc6743538c95b97b590674f5d386dd07c16565aa1389dc40f15bd66a8`. The build log shows `oolite.AppImage: OK` from `sha256sum -c`; no mismatch occurred.
- Base image: `debian:bookworm-slim@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc` (index digest from `docker buildx imagetools inspect`).
- Final remote image ID: `sha256:dc38033d6928c84b49ab8bbd16302e4d66a82b97442465ec691c88f7057ab68a` (739,543,671 bytes), tag `wegolite-oolite-reference:1.93.1-255`.
- Reference build is 14 commits after the 1.93.1-241 pin recorded in FIDELITY.md (see the Open items bullet).
- Nothing Oolite-derived is committed. compose.yaml, the root Dockerfile, NOTICE, ASSETS.md, CHANGELOG.md, package.json, src and tests are unchanged since cb5262f.

## Commits

- `bb587ee` feat: add the image, entrypoint, wrapper and title steps (Task 1)
- `eab41e2` feat: key hold fix, `--class` window match, docked steps (Task 2)
- `7f479a8` docs: README, FIDELITY.md Open items bullet, todo update (Task 3)

## Smoke-check evidence

Fetched outputs (local, outside the repo):

- Task 1 title run: `/tmp/ooref-t1/` (`screenshots/01-title.png`, 381,177 bytes; `logs/Latest.log`; `session.txt`; `wrapper.txt`). Exit 0, 20 s with a cached build.
- Task 2 smoke run: `/tmp/ooref-t2/`, with a copy of the evidence in `/tmp/oolite-ref-smoke/evidence/`. Exit 0, 40 s elapsed.
  - `01-title.png` 382,032 bytes (title screen, "Start New Commander" selected).
  - `02-scenarios.png` 301,400 bytes (Normal Start, Easy Start, Tutorial, Strict Mode).
  - `03-docked.png` 293,848 bytes. Viewed: the docked status screen, "Commander Jameson", Present System Lave, Condition Docked, Cash 100.0, Equipment Forward Pulse Laser. No F5 was needed.
- Negative run `/tmp/ooref-neg/`: `waitlog 5 this line never appears` exits 1 and still fetches a non-empty `logs/Latest.log` (11,231 bytes).
- Bad steps file (`bogus 1`): refused with exit 2 before Oolite starts.
- Output guard: `--out` inside the repository exits 64 before any ssh.

Latest.log lines from the smoke run:

```
1:Opening log for Oolite version 1.93.1-255 by OoliteProject (x86-64) under Linux 5.15.167.4-microsoft-standard-WSL2 at 2026-11-17 13:02:05 +0000.
23:13:02:05.677 [rendering.opengl.version]: OpenGL renderer version: 4.5.0 ("4.5 (Compatibility Profile) Mesa 22.3.6"). Vendor: "Mesa/X.org". Renderer: "llvmpipe (LLVM 15.0.6, 256 bits)".
Resource paths: ... /addons  ...  /addons/wegolite-smoke.oxp  ...
49:[script.load.world.listAll]: Loaded 17 world scripts: ... wegolite-smoke 0.0.1
67:13:02:22.538 [wegolite-smoke]: wegolite-smoke: hello from startUp
```

The throwaway OXP (`/tmp/oolite-ref-smoke/addons/wegolite-smoke.oxp/Config/script.js`) uses the two-argument `log(this.name, ...)`. It, the steps under `/tmp/oolite-ref-smoke/` and all evidence stay outside the repo.

Tuned timings (llvmpipe, 1280x720 window on a 1280x1024 Xvfb): the window appears within a few seconds of launch; 10 s of settling is enough before the title shot; 3 s after Return for the scenario screen; 10 s after the second Return for the docked screen (first tried 20 s, 10 s also passed). The world scripts are loaded and `startUp` runs at about 17 s into the session.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 3 - Blocking] AppImage extraction left directories mode 700**

- **Found during:** Task 1 first run. The non-root user got `Permission denied` on `/opt/oolite/bin/run_oolite.sh`.
- **Fix:** `chmod -R a+rX /opt/oolite` in the fetch stage.
- **Commit:** bb587ee

**2. [Rule 3 - Blocking] The AppImage launcher needs an AppImage environment**

- **Found during:** Task 1. Run outside an AppImage, `run_oolite.sh` expects `GNUstep.conf.orig` and writes to `bin/GameData`.
- **Fix:** the entrypoint sets `APPDIR=/opt/oolite`, `APPIMAGE=/opt/oolite/Oolite.AppImage` and `OO_DIRTYPE=xdg`, and pre-creates `$HOME/.local/share` (its `readlink -f` needs the parent to exist). All game data lands under `$HOME` in the container.
- **Commit:** bb587ee

**3. [Rule 1 - Bug] Window search by name never matched**

- **Found during:** Task 1. `xdotool search --name Oolite` found nothing although the window existed (title `Oolite v1.93.1-255 by OoliteProject ...`).
- **Fix:** `xdotool search --sync --onlyvisible --class oolite`. Verified interactively: the window is IsViewable at 1280x720, `windowfocus` works with no window manager.
- **Commit:** bb587ee

**4. [Rule 1 - Bug] Second Return on the scenario screen was lost**

- **Found during:** Task 2. `xdotool key` press-and-release landed inside one Oolite frame, so the scenario screen never started the game.
- **Fix:** the `key` verb now does `keydown`, sleep 0.5 s, `keyup`, sleep 0.3 s per key.
- **Commit:** eab41e2

**5. [Rule 3 - Blocking] Remote/local clock skew warnings in tar**

- The remote clock is about 84 s ahead, so the fetch `tar -x` warned for every file. Added `tar -m` (bb587ee).

**6. Task split (not a rule deviation)**

- The `key` and `waitlog` verbs and the `--addons` option were written into the first version of entrypoint.sh and run-remote.sh, so they shipped in the Task 1 commit instead of the Task 2 commit. Task 2 verified them. Task 1's own verify did not depend on them.

### Stop-and-report events

None. Nothing was installed on the remote host, the AppImage SHA256 matched, and no source build was needed.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model: the container runs with `--network none`, as a non-root user, with only `/out` writable.

## Self-Check: PASSED

- Files present: `tools/oolite-reference/{Dockerfile,entrypoint.sh,run-remote.sh,README.md,steps/title.steps,steps/docked.steps}`.
- Commits `bb587ee`, `eab41e2`, `7f479a8` are ancestors of HEAD.
- Remote `vitest run tests/compliance.test.ts tests/contract/fidelity.test.ts` passed (24 passed, 1 skipped). `prettier --check` on the README, FIDELITY.md and the todo passed. No `verify`, `verify-full` or `e2e` was run (OD-5).
