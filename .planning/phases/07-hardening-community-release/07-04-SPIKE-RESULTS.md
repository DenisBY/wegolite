# Plan 07-04 Engine Spike Results (QUAL-02, D-07, D-09)

Planning record of the Task 2 spike. The spike ran `tests/e2e/engine.spec.ts`
(committed in Task 1) on Playwright Firefox and WebKit inside a scratch copy of
the `wegolite-ci` image. The scratch Dockerfile lived under
`/tmp/wegolite-engine-spike`; no source, config or test file was added by the
spike, and the scratch image was deleted after this record was written.

Engine evidence only. D-07 claims current stable Chrome and current stable
Firefox. The WebKit row is never Safari evidence.

## Image sizes

| Image | Size (bytes) | Size (`docker image ls`) |
| ----- | ------------ | ------------------------ |
| `wegolite-ci` (baseline) | 1469920507 | 1.47GB |
| `wegolite-engine-spike` (baseline + Firefox + WebKit + xvfb + xauth) | 2463892565 | 2.46GB |
| **Delta** | **+993972058 (about +0.99GB)** | |

## Playwright browsers in the scratch image (`ls /ms-playwright`)

```
chromium-1248
chromium_headless_shell-1248
ffmpeg-1013
firefox-1555
webkit-2370
```

## Result table

Cadence is the docked frame rate measured by the spec over a 5 s wall-clock
window at the config viewport (1280x720). Console errors are the count the spec
asserts as empty; a passing run means zero.

| engine | mode | exit | webgl2 | renderer string | docked cadence (fps) | console errors | notes |
| ------ | ---- | ---- | ------ | --------------- | -------------------- | -------------- | ----- |
| firefox | headless | 1 | false | not read (boot refused) | not measured | not asserted (test failed in `waitForReady` before the assertion) | App showed its own boot failure: "Wegolite could not start: Wegolite needs WebGL2." Mozilla bug 1375585 pattern (research A3 not met). |
| firefox | xvfb-headed (`xvfb-run -a --headed`) | 0 | true | `llvmpipe, or similar` | 11.72 | 0 | Passes. Firefox masks the unmasked renderer to this generic string. |
| webkit | headless | 0 | true | `Apple GPU` | 10.81 | 0 | Passes. This is the string the Playwright WebKit build reports on Linux; it is not an Apple GPU claim and not Safari evidence. |
| chromium (reference, Task 1) | headless | 0 | true | `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)` | 5.33 | 0 | Task 1 spec, same scene and window. Comparison row only. |

## Run commands (scratch image `wegolite-engine-spike`, repository mounted)

```
docker run --rm --ipc=host -v "$PWD":/app -v wegolite_wegolite-node-modules:/app/node_modules wegolite-engine-spike \
  sh -lc "npm run build && npx playwright test tests/e2e/engine.spec.ts --browser=firefox --reporter=list,json"
# same with --browser=webkit
docker run ... wegolite-engine-spike \
  sh -lc "npm run build && xvfb-run -a npx playwright test tests/e2e/engine.spec.ts --browser=firefox --headed --reporter=list,json"
```

`--browser` was honoured: the JSON report shows `browserName` `firefox` and
`webkit`, so the runs used those engines.

## Observations

- **Firefox headless has no WebGL2 context in this container.** The app refuses
  to start and shows its own message, so the `webgl2`, renderer and cadence
  fields are not available for that row. This is the case research A3 flagged.
- **Firefox under xvfb passes.** The plan's xvfb fallback applies and the row is
  green, so the `firefox-xvfb` option's stated condition is met.
- **WebKit headless passes** on the same spec, with a higher cadence than
  Firefox xvfb.
- **Cadences are software-raster numbers** (SwiftShader, llvmpipe, and the WebKit
  build's headless path). They are engine evidence only. QUAL-01 (60 fps at
  1080p on mid-range hardware) is a real-GPU measurement and is not claimed here.
- **Device descriptor caveat.** `playwright.config.ts` applies
  `devices["Desktop Chrome"]` to every engine, so the Firefox and WebKit runs
  inherit that descriptor's Chrome user agent and viewport. The config is unchanged
  by this plan. Only the rendering engine differs between rows.
- **Not tried:** A5 (`webgl.force-enabled`) needs a config file, so it was not
  tried. The headless Firefox failure is resolved by the xvfb row, so it is not
  needed for the decision.

## Deviations during the spike (scratch only)

- The first xvfb attempt failed with `xvfb-run: error: xauth command not found`
  (exit 3, no tests run). The scratch Dockerfile was changed to add `xauth` and
  the image was rebuilt. The repository was not changed.
- The first headless Firefox and WebKit runs wrote Playwright output
  (`test-results/`) into the repository mount as root. It is gitignored. It was
  removed through a container because the host user could not delete it.

## Cleanup

- Scratch image `wegolite-engine-spike` removed; `docker image ls` lists no match.
- The Dockerfile remains under `/tmp/wegolite-engine-spike`, outside the repository.
- No Dockerfile, `compose.yaml` or `playwright.config.ts` change was made.
