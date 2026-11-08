---
phase: 07-hardening-community-release
plan: 04
subsystem: testing
tags: [playwright, webgl2, firefox, webkit, xvfb, e2e, docker, cross-browser]

# Dependency graph
requires:
  - phase: 06-hyperspace-navigation-persistence
    provides: the docked Lave scene and the window.__wegolite probe the engine smoke reads
provides:
  - tests/e2e/engine.spec.ts, a kept engine smoke (WebGL2 context, ready probe, advancing docked frames, renderer and cadence annotations)
  - Firefox and WebKit engine evidence measured inside a copy of the wegolite-ci image
  - The owner's Firefox mode for the e2e-cross service (firefox-xvfb), recorded before plan 07-09
affects: [07-09 (Dockerfile cross stage and compose e2e-cross), 07-11 (PROJECT.md browser-claim record)]

# Actuals (#2632) — chars/4 over the realized changed files; the plan estimate was 45000 tokens.
actuals:
  tokens: 3400
  tasks: 3
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Engine smoke asserts WebGL2, readiness and advancing frames, and reports renderer and cadence as test annotations (no pixels, D-08)"
    - "Engine spikes run in a throwaway image layered on wegolite-ci under /tmp; nothing scratch enters the repository"

key-files:
  created:
    - tests/e2e/engine.spec.ts
    - .planning/phases/07-hardening-community-release/07-04-SPIKE-RESULTS.md
    - .planning/phases/07-hardening-community-release/07-04-SUMMARY.md
  modified: []

key-decisions:
  - "Owner chose firefox-xvfb for the e2e-cross service: Firefox headed under xvfb-run, because headless Firefox has no WebGL2 in this container and the xvfb row is green"
  - "No Dockerfile, compose.yaml or playwright.config.ts change in this plan; the image edits belong to plan 07-09"
  - "WebKit is recorded as engine evidence only, labelled webkit (Playwright); it is never Safari evidence (D-07)"

patterns-established:
  - "Cross-engine evidence is a measured table (exit, webgl2, renderer, cadence, console errors, image delta) before any image layout decision"

requirements-completed: [QUAL-02]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Kept engine smoke proves WebGL2 context, ready probe, advancing docked frames and a clean console on Chromium"
    requirement: "QUAL-02"
    verification:
      - kind: e2e
        ref: "tests/e2e/engine.spec.ts#the engine creates a WebGL2 context and renders advancing frames"
        status: pass
    human_judgment: false
  - id: D2
    description: "Firefox and WebKit engine evidence from a copy of the CI image, recorded in 07-04-SPIKE-RESULTS.md with image size delta and /ms-playwright listing"
    requirement: "QUAL-02"
    verification:
      - kind: e2e
        ref: "docker run wegolite-engine-spike sh -lc 'npx playwright test tests/e2e/engine.spec.ts --browser=firefox --headed' under xvfb-run -a (pass); --browser=webkit (pass); --browser=firefox headless (fail, no WebGL2)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Owner chose the Firefox mode for e2e-cross (firefox-xvfb) with the spike evidence in front of them"
    requirement: "QUAL-02"
    verification: []
    human_judgment: true
    rationale: "Choice of browser execution mode and its cost trade-off is an owner decision (D-09), not a test outcome"

# Metrics
duration: ~60min (approximate; start time was not recorded at plan start)
completed: 2026-11-08
status: complete
---

# Phase 07 Plan 04: Engine smoke and Firefox spike, owner chose xvfb-headed Firefox for e2e-cross

**A kept WebGL2 engine smoke runs green on Chromium, and the measured spike shows headless Firefox has no WebGL2 here while Firefox under xvfb renders the docked scene, so the owner chose `firefox-xvfb` for e2e-cross.**

## Performance

- **Duration:** ~60 min (approximate)
- **Started:** not recorded at plan start
- **Completed:** 2026-11-08
- **Tasks:** 3 (2 automated, 1 owner decision)
- **Files modified:** 3 created, 0 modified

## Accomplishments

- `tests/e2e/engine.spec.ts` asserts the WebGL2 context, the ready probe, at least two advancing docked frames over 5 s, and a clean console. It records the renderer string and the cadence as annotations. Chromium passes.
- Spike evidence measured in a scratch copy of `wegolite-ci`: Firefox headless fails to get WebGL2; Firefox under xvfb passes; WebKit headless passes. The table is in `07-04-SPIKE-RESULTS.md` and copied below.
- Owner decision recorded: `firefox-xvfb`. Plan 07-09 reads this id before any Dockerfile or compose edit.
- No Dockerfile, `compose.yaml` or `playwright.config.ts` change was made. The scratch image was deleted after measurement.

## Spike result table

Cadence is docked frames per second over a 5 s wall-clock window at 1280x720. Console errors are the count the spec asserts as empty; a pass means zero.

| engine | mode | exit | webgl2 | renderer string | docked cadence (fps) | console errors | notes |
| ------ | ---- | ---- | ------ | --------------- | -------------------- | -------------- | ----- |
| firefox | headless | 1 | false | not read (app refused to boot: "Wegolite needs WebGL2") | not measured | not asserted (failed before the check) | Mozilla bug 1375585 pattern; research A3 not met |
| firefox | xvfb-headed (`xvfb-run -a --headed`) | 0 | true | `llvmpipe, or similar` | 11.72 | 0 | Passes; the row that justified `firefox-xvfb` |
| webkit | headless | 0 | true | `Apple GPU` | 10.81 | 0 | Engine evidence only; the string is the Playwright WebKit build's Linux report, not an Apple GPU claim and not Safari evidence |
| chromium (Task 1 reference) | headless | 0 | true | `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)` | 5.33 | 0 | Same spec and scene; comparison row |

Cadences are software-raster numbers (SwiftShader, llvmpipe, WebKit headless). They are engine evidence only, not QUAL-01 (60 fps on a real GPU).

## Image sizes

| Image | Bytes | `docker image ls` |
| ----- | ----- | ----------------- |
| `wegolite-ci` (baseline) | 1469920507 | 1.47GB |
| `wegolite-engine-spike` (baseline + Firefox + WebKit + xvfb + xauth) | 2463892565 | 2.46GB |
| **Delta** | **+993972058** | **about +0.99GB** |

The delta is the cost the `cross` stage in plan 07-09 adds to the image layer that e2e-cross uses. It is re-downloaded after source-layer rebuilds, as D-09 describes.

## `/ms-playwright` listing (scratch image)

```
chromium-1248
chromium_headless_shell-1248
ffmpeg-1013
firefox-1555
webkit-2370
```

## Owner decision

- **Option id:** `firefox-xvfb`
- **Option:** Firefox headed under `xvfb-run` in the `cross` stage.
- **Justifying row:** `firefox | xvfb-headed | exit 0 | webgl2 true | llvmpipe, or similar | 11.72 fps | 0 console errors`. The headless Firefox row (exit 1, no WebGL2) rules out `firefox-headless`.
- **Consequence for plan 07-09:** add the xvfb and xauth packages and an `xvfb-run -a` wrapper to the e2e-cross command. Headed runs are slower.
- **Not chosen:** `firefox-headless` (its condition is not met), `firefox-headless-plus-webkit-engine` (adds evidence D-07 does not claim), `escalate-no-container-firefox` (not triggered, because the xvfb row is green).

## Task Commits

1. **Task 1: Engine smoke spec** - `a7325fa` (test)
2. **Task 2: Scratch spike and results record** - `70ff782` (docs)
3. **Task 3: Owner decision** - recorded in this SUMMARY and the STATE decision entry (no code change)

**Plan metadata:** recorded in the final docs commit that adds this SUMMARY, STATE.md and ROADMAP.md.

## Files Created/Modified

- `tests/e2e/engine.spec.ts` - kept engine smoke (new)
- `.planning/phases/07-hardening-community-release/07-04-SPIKE-RESULTS.md` - spike results record (new)
- `.planning/phases/07-hardening-community-release/07-04-SUMMARY.md` - this summary (new)

## Decisions Made

- The owner chose `firefox-xvfb` for the e2e-cross service, based on the spike row above.
- No image, compose or Playwright config change in this plan; those are plan 07-09's.
- WebKit is engine evidence only, labelled `webkit (Playwright)`. D-07 still claims only current stable Chrome and Firefox. The ROADMAP criterion 2 and QUAL-02 "Safari" wording conflict is recorded for plan 07-11.

## Deviations from Plan

- **Scratch Dockerfile needed `xauth`.** The first xvfb attempt failed with `xvfb-run: error: xauth command not found` (exit 3, no tests run). `xauth` was added to the scratch Dockerfile in `/tmp` and the image was rebuilt. The repository was not changed. Plan text listed only xvfb.
- **Playwright output written as root into the repository mount.** `test-results/` was gitignored and was removed through a container, because the host user could not delete it.
- **Device descriptor applies to every engine.** `playwright.config.ts` applies `devices["Desktop Chrome"]` to all engines, so the Firefox and WebKit runs inherit that Chrome user agent and viewport. The config is unchanged. Only the rendering engine differs between rows.

**Total deviations:** 3 (1 scratch-only fix, 1 cleanup, 1 documented config caveat). **Impact on plan:** none on the decision; the xauth fix only affected the throwaway image.

## Verification

- `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/engine.spec.ts"`: PASS (Chromium, 1 passed).
- `docker compose run --rm lint` on the spec and the record (eslint and prettier): PASS.
- `docker compose run --rm typecheck` (both tsconfigs): PASS.
- Spike runs (scratch image, see table): Firefox headless FAIL (exit 1); Firefox xvfb PASS (exit 0); WebKit headless PASS (exit 0).
- Acceptance greps: `engine-cadence-fps` appears once in the spec; `safari` appears once, in the doc-comment sentence; the record has two `| firefox ` rows and one `| webkit ` row; `git status` shows nothing outside `.planning/` and the spec.

## Issues Encountered

- Headless Firefox cannot create a WebGL2 context in this container. The spec failed at the ready probe, and the app showed its own "needs WebGL2" message. This is the documented case that the xvfb fallback addresses.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 07-09 can now edit the Dockerfile and `compose.yaml` for e2e-cross using `firefox-xvfb` (headed Firefox under `xvfb-run -a`, with xvfb and xauth packages).
- Not yet done: the full `docker compose run --rm verify` gate, which is not part of this plan's verification section and is left to phase verification.

---
*Phase: 07-hardening-community-release*
*Completed: 2026-11-08*

## Self-Check: PASSED
