---
phase: 07-hardening-community-release
plan: 09
subsystem: testing
tags: [playwright, firefox, xvfb, docker, compose, e2e, cross-browser, qual-02]

requires:
  - phase: 07-04
    provides: engine smoke spec and the owner's firefox-xvfb decision, with the Chromium and Firefox cadences
provides:
  - "cross Dockerfile stage (FROM ci) installing xvfb, xauth and Playwright Firefox at image-build time"
  - "e2e-cross Compose service (target cross, image wegolite-cross, no port, outside verify)"
  - "Playwright projects chromium (all specs) and firefox (engine and core-loop specs, headed)"
  - "test:e2e runs the chromium project only; test:e2e:cross runs the firefox project under xvfb-run with one worker"
  - "contract pins for the service, the stages, the scripts and the Chromium-only verify chain"
  - "documented docker compose run --rm e2e-cross command in README.md and AGENTS.md"
affects: [07-11, verify chain, QUAL-02]

actuals:
  tokens: 11458
  tasks: 3
  commits: 3
plan_head_before: 6ca8ce34d98a986821391a56b0954bc79b772b82
plan_head_after: 8df6a311c416fcf609fa2c036bb8cf38ddf3955b

tech-stack:
  added: ["Playwright Firefox 157.0 (firefox-1555) in the cross image only", "xvfb and xauth apt packages in the cross image only"]
  patterns: ["cross-browser gate as a separate Compose service outside verify (D-09)", "headed Firefox under xvfb-run, one worker"]

key-files:
  created: []
  modified:
    - Dockerfile
    - compose.yaml
    - playwright.config.ts
    - package.json
    - tests/contract/container-contract.test.ts
    - README.md
    - AGENTS.md

key-decisions:
  - "firefox-xvfb (owner decision, 07-04) implemented: xvfb and xauth in the cross stage, headed firefox project, xvfb-run -a in the script"
  - "test:e2e:cross passes --workers=1: two headed Firefox windows on one xvfb display starve the engine smoke's frame sampling"
  - "WEGOLITE_E2E_WAIT_SCALE is 1: the 07-04 Chromium/Firefox cadence ratio (5.33/11.72 = 0.45) rounds up to 1, and the journey needed no longer wait"
  - "No engine warning was emitted by Firefox during the journey, so ENGINE_WARNING_ALLOWLIST is unchanged; no src/app or guard change was needed"

patterns-established:
  - "Each Firefox-only dependency lives only in the cross stage; the contract test pins that Chromium is installed only in ci and Firefox only in cross"
  - "The contract test forbids Safari and WebKit text in README.md, AGENTS.md, compose.yaml and Dockerfile"

requirements-completed: [QUAL-02]

coverage:
  - id: D1
    description: "The engine smoke creates a WebGL2 context and renders advancing docked frames on Firefox through e2e-cross"
    requirement: "QUAL-02"
    verification:
      - kind: e2e
        ref: "tests/e2e/engine.spec.ts#the engine creates a WebGL2 context and renders advancing frames [firefox], docker compose run --rm e2e-cross"
        status: pass
    human_judgment: false
  - id: D2
    description: "The guarded core-loop journey passes on Firefox through e2e-cross with the same network and console guards as Chromium"
    requirement: "QUAL-02"
    verification:
      - kind: e2e
        ref: "tests/e2e/core-loop.spec.ts#new game to launch to trade to hyperspace to dock to save and reload [firefox], docker compose run --rm e2e-cross"
        status: pass
    human_judgment: false
  - id: D3
    description: "verify stays Chromium-only: test:e2e runs the chromium project, the verify chain string is unchanged, and the ci image still bakes Chromium only"
    requirement: "QUAL-02"
    verification:
      - kind: unit
        ref: "tests/contract/container-contract.test.ts#maps each service to its documented npm script"
        status: pass
      - kind: unit
        ref: "tests/contract/container-contract.test.ts#runs verify as one fail-fast chain in dependency order"
        status: pass
      - kind: e2e
        ref: "tests/e2e/engine.spec.ts and tests/e2e/compliance-shipped.spec.ts [chromium], docker compose run --rm e2e"
        status: pass
    human_judgment: false
  - id: D4
    description: "Firefox is installed only by the cross stage at image-build time; no script, Compose command or helper calls playwright install at test time"
    requirement: "QUAL-02"
    verification:
      - kind: unit
        ref: "tests/contract/container-contract.test.ts#installs Firefox only in the cross stage and Chromium only in ci"
        status: pass
      - kind: unit
        ref: "tests/contract/container-contract.test.ts#bakes Chromium and never downloads a browser at test time"
        status: pass
    human_judgment: false
  - id: D5
    description: "README.md and AGENTS.md document docker compose run --rm e2e-cross, the documented-service set equals the Compose service set, and no file claims Safari, WebKit or macOS browser support"
    requirement: "QUAL-02"
    verification:
      - kind: unit
        ref: "tests/contract/container-contract.test.ts#documents every declared service with a runnable command in both guides"
        status: pass
      - kind: unit
        ref: "tests/contract/container-contract.test.ts#names no browser beyond Chromium and Firefox in the files it writes"
        status: pass
    human_judgment: false

duration: ~60min (approximate; the plan start time was not recorded)
completed: 2026-11-08
status: complete
---

# Phase 07 Plan 09: Firefox cross-browser gate through e2e-cross, the engine smoke and core-loop journey green on Firefox

**`docker compose run --rm e2e-cross` builds a Firefox-capable cross image (xvfb, headed Firefox) and passes the engine smoke and the guarded core-loop journey on Firefox 157.0, while `verify` stays Chromium-only.**

## Performance

- **Duration:** ~60 min (approximate; start time not recorded at plan start)
- **Completed:** 2026-11-08
- **Tasks:** 3 (plus one fix commit inside Task 3)
- **Files modified:** 7

## Accomplishments

- Added a `cross` Dockerfile stage (`FROM ci AS cross`) that installs xvfb, xauth and Playwright's Firefox at image-build time. The `ci` stage is unchanged and still bakes Chromium only.
- Added the `e2e-cross` Compose service: `target: cross`, `image: wegolite-cross`, `ipc: host`, `WEGOLITE_E2E_WAIT_SCALE: "1"`, no port, deliberately absent from `verify`.
- Split Playwright into a `chromium` project (all specs) and a `firefox` project (engine and core-loop specs, headed).
- Pinned the new service, stage, scripts and Chromium-only verify chain in the container contract test, and documented the command in README.md and AGENTS.md.
- Ran the guarded core-loop journey on Firefox through `e2e-cross`: both specs pass. Wall time for the whole `docker compose run --rm e2e-cross` (container start, build, both specs) was 140 s; Playwright's own run was 2.3 min, with the core-loop journey at 2.0 min. Measured with `WEGOLITE_E2E_WAIT_SCALE` 1.

## Engine evidence (Firefox, through e2e-cross)

| Item | Value |
| ---- | ----- |
| Firefox build | 157.0 (`firefox-1555` in `/ms-playwright`) |
| Renderer string (engine annotation) | `llvmpipe, or similar` |
| Docked cadence (engine annotation, final JSON run) | 8.33 fps (07-04 spike recorded 11.72 fps; software raster varies between runs) |
| Engine console errors | 0 (asserted empty) |
| Engine warnings allowlisted | none emitted; `ENGINE_WARNING_ALLOWLIST` unchanged |
| Journey guards | network, console and page-error guards clean; no allowlist entry added |

## Task Commits

1. **Task 1: cross stage, e2e-cross service, firefox project** - `3bdce53` (feat)
2. **Task 2: contract pins and documented command** - `8eca42b` (test)
3. **Task 3: firefox project runs with one worker (fix found by the journey run)** - `8df6a31` (fix)

**Plan metadata:** recorded in the docs commit that adds this SUMMARY, STATE.md and ROADMAP.md.

## Files Created/Modified

- `Dockerfile` - `FROM ci AS cross` stage: apt install of `xvfb xauth`, `npx playwright install --with-deps firefox`, apt list cleanup
- `compose.yaml` - `e2e-cross` service (after `e2e`); `verify` untouched
- `playwright.config.ts` - `projects` chromium and firefox; `use` keeps baseURL, trace off, screenshot off
- `package.json` - `test:e2e` = `playwright test --project=chromium`; `test:e2e:cross` = `xvfb-run -a playwright test --project=firefox --workers=1`
- `tests/contract/container-contract.test.ts` - e2e-cross on the shared anchor and no-ports lists; only e2e-cross overrides `target`; verify excludes e2e-cross; six FROM stages; Firefox only in cross and Chromium only in ci; script pins; no Safari/WebKit text in the files written
- `README.md` - Commands row, ports list, Chromium posture note
- `AGENTS.md` - reviewer brief, Docker workflow block, Commands quick reference

## Decisions Made

- **firefox-xvfb implemented as the owner chose at 07-04.** The cross stage adds xvfb and xauth (xauth was needed in the spike too). The firefox project sets `headless: false`, and the script wraps the run in `xvfb-run -a`. The decision id was not re-decided.
- **One Firefox worker.** The first full run failed the engine smoke with 0 renders in its 5 s window while the core-loop ran on a second headed Firefox window on the same display (reproduced on two consecutive full runs). The engine smoke passes alone, and the serial run passes both specs. Playwright has no per-project worker setting, so the script passes `--workers=1`. Chromium keeps `workers: 2`.
- **WAIT_SCALE = 1.** The 07-04 cadences give 5.33 / 11.72 = 0.45, which rounds up to 1 (minimum 1). The journey passed without any extra wait.
- **No browser-guard change.** No Firefox warning or error appeared, so no allowlist pattern was added and no `src/app` change was needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Engine smoke could not launch headed Firefox with the plan's literal command**
- **Found during:** Task 1 verification
- **Issue:** The plan's literal check `npx playwright test --project=firefox tests/e2e/engine.spec.ts` fails with "headed browser without having a XServer running" (no DISPLAY). This is the firefox-xvfb branch the objective names.
- **Fix:** The script carries the `xvfb-run -a` wrapper, and verification runs `npm run test:e2e:cross -- tests/e2e/engine.spec.ts`.
- **Files modified:** package.json
- **Verification:** the engine smoke passes through the script (1 passed); the literal command without the wrapper fails as described.
- **Committed in:** `3bdce53`

**2. [Rule 1 - Bug] Firefox engine smoke starved when it shared the display with the core-loop journey**
- **Found during:** Task 3 (full `docker compose run --rm e2e-cross`)
- **Issue:** The engine smoke recorded 0 renders over its 5 s window in two consecutive full runs, failing `expect(frames).toBeGreaterThanOrEqual(2)`. The same spec passes alone and the serial run passes both specs.
- **Fix:** `test:e2e:cross` passes `--workers=1`; the playwright.config.ts comment records the reason; the contract pin is updated.
- **Files modified:** package.json, playwright.config.ts, tests/contract/container-contract.test.ts
- **Verification:** full `docker compose run --rm e2e-cross` exits 0 with 2 passed (wall 140 s); contract test 19/19; lint green.
- **Committed in:** `8df6a31`

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug). **Impact:** both are inside the owner's firefox-xvfb mode and the plan's test scope. No `src/`, guard, or allowlist change. The Firefox run is slower because it is serial.

## Verification Results

| Command | Result |
| ------- | ------ |
| `docker compose build e2e-cross` | pass (cross stage downloads only Firefox 157.0; the ci stage's Chromium download was a cache rebuild) |
| `docker compose run --rm e2e-cross` (final) | pass: exit 0, 2 passed, 140 s wall |
| `docker compose run --rm e2e sh -lc "npm run build && npx playwright test --project=chromium tests/e2e/engine.spec.ts tests/e2e/compliance-shipped.spec.ts"` | pass: 5 passed |
| `docker compose run --rm test npx vitest run tests/contract/container-contract.test.ts` | pass: 19/19 |
| `docker compose run --rm lint` | pass (eslint and prettier --check) |
| acceptance greps (Dockerfile cross stage count, chromium install count, e2e-cross service, verify excludes e2e-cross, script strings, README/AGENTS command counts, no safari/webkit, macOS counts unchanged) | pass as written in the plan |

The full `docker compose run --rm verify` is run by plan 07-11, as the plan states.

## Issues Encountered

- The first full e2e-cross run failed on the engine smoke (see Deviation 2). Diagnosed by running each spec alone and then serially.
- Commit `3bdce53` (Task 1) leaves the contract test red until `8eca42b` (Task 2) lands, because the FROM count and the service pins moved in Task 1. The plan sequences the tasks this way; the history is a two-step transition, not a broken tip.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The Firefox gate exists and passes. Plan 07-11 should run the full `verify` chain (Chromium-only) and record the Safari/WebKit conflict in PROJECT.md, as the plan says.
- Firefox runs serially, so the e2e-cross wall time is about 2.3 min for the Playwright portion. A real-GPU, or a multi-display, setup could lift the one-worker limit later; it is not claimed here.
- Cadences and the renderer string are software-raster numbers (llvmpipe). They are engine evidence only, not QUAL-01.

## Self-Check: PASSED

- Created files: none. Modified files exist on disk (`Dockerfile`, `compose.yaml`, `playwright.config.ts`, `package.json`, `tests/contract/container-contract.test.ts`, `README.md`, `AGENTS.md`).
- Commits exist: `3bdce53`, `8eca42b`, `8df6a31` are ancestors of HEAD.

---
*Phase: 07-hardening-community-release*
*Completed: 2026-11-08*
