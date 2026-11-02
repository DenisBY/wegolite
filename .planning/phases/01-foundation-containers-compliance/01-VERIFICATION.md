---
phase: "01"
status: passed
score: "43/43"
created: "2026-11-02"
verified: "2026-11-02T22:08:28Z"
behavior_unverified: 0
overrides_applied: 0
review_findings_open: 23
covered_files:
  - .dockerignore
  - .env.example
  - .gitignore
  - .planning/phases/01-foundation-containers-compliance/01-01-PLAN.md
  - .planning/phases/01-foundation-containers-compliance/01-01-SUMMARY.md
  - .planning/phases/01-foundation-containers-compliance/01-02-PLAN.md
  - .planning/phases/01-foundation-containers-compliance/01-02-SUMMARY.md
  - .planning/phases/01-foundation-containers-compliance/01-03-PLAN.md
  - .planning/phases/01-foundation-containers-compliance/01-03-SUMMARY.md
  - .planning/phases/01-foundation-containers-compliance/01-04-PLAN.md
  - .planning/phases/01-foundation-containers-compliance/01-04-SUMMARY.md
  - .planning/phases/01-foundation-containers-compliance/01-05-PLAN.md
  - .planning/phases/01-foundation-containers-compliance/01-05-SUMMARY.md
  - .planning/phases/01-foundation-containers-compliance/01-06-PLAN.md
  - .planning/phases/01-foundation-containers-compliance/01-06-SUMMARY.md
  - .planning/phases/01-foundation-containers-compliance/01-07-PLAN.md
  - .planning/phases/01-foundation-containers-compliance/01-07-SUMMARY.md
  - .prettierignore
  - AGENTS.md
  - ASSETS.md
  - Dockerfile
  - LICENSE
  - NOTICE
  - README.md
  - compose.yaml
  - eslint.config.js
  - index.html
  - package-lock.json
  - package.json
  - playwright.config.ts
  - public/.gitkeep
  - scripts/check-verify-fails-fast.sh
  - scripts/smoke-dev.sh
  - scripts/smoke-preview.sh
  - src/main.ts
  - src/render/camera-relative.test.ts
  - src/render/camera-relative.ts
  - src/render/precision-scene.ts
  - src/sim/cadence.test.ts
  - src/sim/hash.ts
  - src/sim/loop.ts
  - src/sim/math.ts
  - src/sim/state.ts
  - src/sim/step.ts
  - tests/compliance.test.ts
  - tests/contract/container-contract.test.ts
  - tests/e2e/precision.spec.ts
  - tests/e2e/resize.spec.ts
  - tests/golden/kinematic-probe.json
  - tests/golden/kinematic-probe.test.ts
  - tests/guards/sim-purity.test.ts
  - tsconfig.json
  - tsconfig.sim.json
  - vite.config.ts
  - vitest.config.ts
covered_digest: "v4:sha256:056ff6ad328e6862ae91cdfa6aeec57c151e41e814fa9eb28b6e42550d41b068"
re_verification:
  previous_status: human_needed
  previous_score: "35/35"
  gaps_closed:
    - "G-01-4 / CR-01 — window resize resized the drawing buffer but never repainted; resize() now calls renderFrame() once behind a zero-size guard, proven by a discriminating Playwright regression (tests/e2e/resize.spec.ts)."
  gaps_remaining: []
  regressions: []
---

# Phase 01: Foundation, Containers & Compliance — Verification Report

**Phase Goal:** A contributor with only Docker can serve, test, and verify the project from a clean checkout, on a deterministic fixed-step loop with a render strategy that survives system-scale distances — and the licence, attribution, and trademark posture is in place before any asset is committed.

**Verified:** 2026-11-02T22:08:28Z
**Status:** passed
**Score:** 43/43 must-have truths verified
**Re-verification:** Yes — after gap closure (01-07 / G-01-4 / CR-01)

## Goal Achievement

### Roadmap Success Criteria

| # | Criterion | Status | Evidence |
| - | --------- | ------ | -------- |
| 1 | Only Docker + one command serves the game with hot reload on a documented port; no host Node/npm | ✓ VERIFIED | `sh scripts/smoke-dev.sh` exit 0, served `@vite/client` on 5173; `compose.yaml:29-33`; `tests/contract/container-contract.test.ts` boots the real Vite server from the test container and passes. UAT test 2 confirms host-edit HMR against `up app`. |
| 2 | `docker compose run --rm verify` chains lint, typecheck, unit and containerised browser tests, and is the documented definition of done | ✓ VERIFIED | Cold state `down --volumes --remove-orphans && build && run --rm verify` exit 0: lint → typecheck → 35 unit → build → 2 e2e. One `sh -lc` `&&` chain at `compose.yaml:70-78`; `README.md:38`, `AGENTS.md:45`. |
| 3 | The same scripted simulation at two frame cadences produces identical state hashes, proving the 1/120 s fixed step | ✓ VERIFIED | `src/sim/cadence.test.ts:53-56` hashes one 1200-tick replay at 30/60/120/144 Hz to one hash; 3 tests pass in the cold verify. |
| 4 | A rendered marker at 1.4e6 m stays visually stable, with no float32 jitter and no depth fighting against nearer geometry | ✓ VERIFIED | Exact float64 100 m separation at 1e6 m and exact `f32Ulp(1.4e6) === 0.125` (`src/render/camera-relative.test.ts`); live probe `{farRelZ:-1400000, farUlp:0.125, logDepth:true, depthBits:24, calls:3, triangles:12}`. Real-GPU appearance was accepted by UAT test 1 (screenshot). |
| 5 | `LICENSE`, `NOTICE`, `ASSETS.md` and a visible non-affiliation disclaimer exist; no Frontier mark is used as product identity | ✓ VERIFIED | `LICENSE` md5 `570a9b3749dd0463a1778803b12a6dce`; `NOTICE` §1-§6 carry election, attribution, CC BY-NC-SA 3.0, source offer and disclaimer; `ASSETS.md` provenance contract with zero rows; `index.html:61-66` renders the disclaimer; `package.json` name and `<title>` are mark-free. UAT test 3 accepted the wording. |

### Observable Truths (must-haves)

All truth statements are those declared in the seven PLAN frontmatters, checked against the code and the current container run, not against SUMMARY claims. **43/43 verified; 0 present-but-behavior-unverified.**

#### Plan 01-01 — walking skeleton (6/6)

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | Clean-checkout `docker compose up app` serves the shell on 5173 with the Vite HMR client, no host Node/npm | ✓ VERIFIED | `sh scripts/smoke-dev.sh` exit 0, body contained `@vite/client`; `compose.yaml:29-33`. |
| 2 | `docker compose run --rm e2e` builds, uses baked Chromium, reports WebGL2, log depth, `calls > 0`, zero console/page errors | ✓ VERIFIED | Cold verify `e2e` 2 passed; live probe `{webgl2:true, logDepth:true, calls:3}`; `tests/e2e/precision.spec.ts` asserts all of it. |
| 3 | The 1.4e6 m precision scene is the default view on every load (no flag, no dev-only route) | ✓ VERIFIED | `src/main.ts:110-135` runs unconditionally; no query/route branch exists. |
| 4 | Every Compose service bind-mounts the tree and the named `node_modules` volume | ✓ VERIFIED | `compose.yaml:18-26` anchor (`.:/app` + volume) inherited by all seven services (`:30,36,43,47,57,61,65`); contract tests pass. |
| 5 | `preview` builds before serving the production bundle on 4173 | ✓ VERIFIED | `compose.yaml:35-40`; `sh scripts/smoke-preview.sh` exit 0, body contained `foundation build`. |
| 6 | Every `.ts`/`.js` file plan 01 created carries the S-6 SPDX header | ✓ VERIFIED | `tests/compliance.test.ts` tree-wide header walk passes (10 compliance cases). |

#### Plan 01-02 — toolchain gates (6/6)

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 7 | `docker compose run --rm typecheck` exits 0 running both TS projects | ✓ VERIFIED | Cold verify log: `tsc -p tsconfig.json --noEmit && tsc -p tsconfig.sim.json --noEmit`, exit 0. |
| 8 | `docker compose run --rm lint` exits 0 clean and non-zero on a Three import or DOM global under `src/sim/` | ✓ VERIFIED | Clean lint passes; `sh scripts/check-verify-fails-fast.sh` exit 0 and the captured output names `no-restricted-imports … src/sim must stay renderer-free`. |
| 9 | A DOM identifier fails `tsc` with TS2584 and a Three import fails ESLint; neither gate alone is sufficient | ✓ VERIFIED | `tests/guards/sim-purity.test.ts` (2 cases) passes in the 35-test run; `tsconfig.sim.json` drops DOM lib/types, `eslint.config.js` owns imports. |
| 10 | `docker compose run --rm test` runs one `unit` project in Node and reports the guard's two cases | ✓ VERIFIED | Output: project `unit`, 6 files / 35 tests, guard 2/2; `vitest.config.ts:10-21`. |
| 11 | No sim-zone rule is a warning; every import-zone/DOM/non-determinism rule is `error` | ✓ VERIFIED | `eslint.config.js:62-119` — every rule severity is `"error"`; no `"warn"` in the file. |
| 12 | Every file plan 02 created carries the S-6 SPDX header | ✓ VERIFIED | Same compliance walk passes. |

#### Plan 01-03 — determinism harness (7/7)

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 13 | One per-tick input log replayed at 30/60/120/144 Hz to a fixed tick count gives exactly one final hash | ✓ VERIFIED | `src/sim/cadence.test.ts:53-56`; passes. |
| 14 | The loop stops on a step count, not elapsed time; the 144 Hz → 119-step counter-example is preserved | ✓ VERIFIED | `src/sim/loop.ts:28-60`; `src/sim/cadence.test.ts:67-78` asserts 30/60→120 and 144→119. |
| 15 | `step()` reads no clock or randomness, takes `dt`, mutates in place, deterministic for `dt === DT` | ✓ VERIFIED | `src/sim/step.ts:37-68`; ESLint bans `Math.random`, `Date.now`, `performance.now`, `new Date`. |
| 16 | Canonical labelled fixed-precision serialization hashed with in-repo FNV-1a; non-finite throws; -0 normalizes | ✓ VERIFIED | `src/sim/hash.ts:14-36` (`Number.isFinite` throw, `r === 0 ? 0` normalization); `cadence.test.ts` non-finite rejection passes. |
| 17 | A checked-in golden fixture replays to its recorded hash and its `dt` equals `1/120` | ✓ VERIFIED | `tests/golden/kinematic-probe.json` (`dt 0.008333333333333333`, hash `1c079894`); test passes in the cold verify. |
| 18 | The Phase 1 probe uses placeholder kinematic constants and says so, pointing at Phase 3 | ✓ VERIFIED | `src/sim/step.ts:17-25` names them probe scales, not Oolite constants. |
| 19 | Every file plan 03 created carries the S-6 SPDX header | ✓ VERIFIED | Compliance walk passes. |

#### Plan 01-04 — precision proof (5/5)

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 20 | Camera-relative subtraction is float64 before upload; 100 m at 1e6 m stays exactly 100 m, asserted with `toBe` | ✓ VERIFIED | `src/render/camera-relative.ts:28-34`; `camera-relative.test.ts:14-22` (`toBe(100)`), 3/3 pass. |
| 21 | float32 ULP at 1.4e6 m is exactly 0.125, pinned exactly | ✓ VERIFIED | `camera-relative.test.ts:24-28`; live probe `farUlp: 0.125`. |
| 22 | The camera-relative test is actually collected and reports three passing tests | ✓ VERIFIED | Test output lists `src/render/camera-relative.test.ts (3 tests)`. |
| 23 | The built shell reports WebGL2, log depth, 24-bit-or-better depth, `farRelZ -1.4e6`, `farUlp 0.125`, disclaimer, zero errors | ✓ VERIFIED | Live in-container probe `{depthBits:24, farRelZ:-1400000, farUlp:0.125, logDepth:true, webgl2:true}`; spec asserts the rest and errors `[]`. |
| 24 | No pixel comparison, screenshot baseline or `gl.readPixels` assertion exists | ✓ VERIFIED | `grep -rn "readPixels\|toMatchSnapshot\|toHaveScreenshot\|pixel"` matches only explanatory comments in `src/render/precision-scene.ts`; `playwright.config.ts` sets `screenshot: "off"`. |

#### Plan 01-05 — compliance and command contract (6/6)

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 25 | `LICENSE` is byte-for-byte GPL v2 (md5 `570a9b3749dd0463a1778803b12a6dce`) | ✓ VERIFIED | `md5sum LICENSE` matches; compliance test passes. |
| 26 | `NOTICE` states election, attribution, CC BY-NC-SA 3.0 posture, source offer and disclaimer | ✓ VERIFIED | `NOTICE` §1-§6 read directly; four NOTICE tests pass. |
| 27 | `ASSETS.md` has the provenance column contract, zero asset rows, and the no-asset-without-a-row rule | ✓ VERIFIED | `ASSETS.md:1-17`; compliance test passes. |
| 28 | A compliance test fails on drift: licence hash, NOTICE terms, ASSETS columns, disclaimer, trademark title, SPDX header | ✓ VERIFIED | `tests/compliance.test.ts` (10 cases) — each condition has an assertion; all pass. |
| 29 | `README.md` repeats the command table, ports, `verify` as definition of done, volume refresh, polling opt-in, root-Chromium posture | ✓ VERIFIED | `README.md:23-42`; `tests/contract/container-contract.test.ts` (16 tests) passes. |
| 30 | `AGENTS.md` gains ports, volume refresh, polling opt-in, bind-mount note while Docker-only/container-tests/licensing stay intact | ✓ VERIFIED | `AGENTS.md:21-25,62-65,85-93`; contract test asserts command-set equality with Compose. |

#### Plan 01-06 — operational rehearsal (5/5)

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 31 | `sh scripts/smoke-dev.sh` exits 0 only on a real HTTP body containing `@vite/client`, then tears down | ✓ VERIFIED | Ran it: exit 0, `dev smoke: 5173 served the HMR client`; container removed. |
| 32 | `sh scripts/smoke-preview.sh` exits 0 only when the served page contains `foundation build`, then tears down | ✓ VERIFIED | Ran it: exit 0, `preview smoke: 4173 served the production bundle`; container removed. |
| 33 | `sh scripts/check-verify-fails-fast.sh` seeds a lint error, proves a non-zero verify at the lint stage, removes the seed, exits 0 | ✓ VERIFIED | Ran it: exit 0; captured output shows the ESLint `no-restricted-imports` error on `src/sim/__verify_probe.ts`; probe gone afterwards. |
| 34 | `docker compose run --rm verify` exits 0 after `down --volumes` + `build`, proving the named volume repopulates | ✓ VERIFIED | Cold-state run: down --volumes → build → verify exit 0 (35 unit + 2 e2e). |
| 35 | Chromium is baked into the image under `/ms-playwright` with no network access | ✓ VERIFIED | `docker run --rm --network none --entrypoint sh wegolite-ci -c 'ls /ms-playwright'` → `chromium-1248`, `chromium_headless_shell-1248`, `ffmpeg-1013`; exit 0. |

#### Plan 01-07 — resize repaint gap closure (8/8)

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 36 | Resizing 1280x720 → 900x600 leaves the scene visible: buffer takes the new size and a fresh render follows | ✓ VERIFIED | `src/main.ts:120-139` (`setSize` → aspect → `renderFrame()`); `tests/e2e/resize.spec.ts` observes `renderer.info.render.frame` advance and `canvas.width/height` become `floor(900 × min(dpr,2))`. Passed in the cold verify. |
| 37 | Restoring 1280x720 triggers another repaint; the canvas never stays black | ✓ VERIFIED | Same spec asserts a second counter advance and `floor(1280 × min(dpr,2))` buffer after restore. Passed. |
| 38 | A zero-width/height resize is ignored before the first `setSize`/`aspect` write; no render; `camera.aspect` cannot be `Infinity` | ✓ VERIFIED (static, as the plan specifies) | `src/main.ts:127-132`: `if (width === 0 \|\| height === 0) return;` sits after both reads and before `setSize`/`aspect`/`renderFrame`. Playwright cannot request a 0×0 viewport, so the plan declares this path proven statically; the branch is observable in the file. |
| 39 | A Playwright regression resizes, waits for the counter to advance, asserts the scaled buffer size, repeats after restore, and reports no console/page errors | ✓ VERIFIED | `tests/e2e/resize.spec.ts:11-78` read directly; passes in `docker compose run --rm e2e` (2 tests). |
| 40 | The regression is discriminating: the pre-fix build publishes no `renders`, and a field-without-repaint build leaves it at boot | ✓ VERIFIED | Two red runs in the `e2e` image: (A) pre-fix `src/main.ts` → `expect(bootRenders).toBeGreaterThan(0)` received 0, exit 1; (B) pre-fix plus a published `renders` field → `waitForFunction` timeout after resize, exit 1. Source restored clean afterwards. |
| 41 | No `requestAnimationFrame`/`setAnimationLoop`/interval/timer/observer; each resize event renders exactly once | ✓ VERIFIED | `grep -rn "requestAnimationFrame\|setAnimationLoop\|setInterval\|setTimeout\|ResizeObserver\|MutationObserver" src` → no matches. `renderer.render` appears only at `src/main.ts:123` inside `renderFrame()`, called once at the end of `resize()`. |
| 42 | `tests/e2e/precision.spec.ts` passes unchanged; probe fields keep name/meaning; `renders` is additive and comes from `renderer.info.render.frame` | ✓ VERIFIED | `git show --stat 5a5925f` touches no precision spec; cold verify shows precision passing; `src/main.ts:158` reads `renderer.info.render.frame`; three r187 increments it at `WebGLRenderer.js:1710` while `WebGLInfo.reset()` clears only calls/triangles/points/lines. Live probe includes `renders: 1`. |
| 43 | `01-VALIDATION.md` documents 35 unit + 2 browser tests and FOUND-08 evidence names both specs | ✓ VERIFIED | `01-VALIDATION.md` header and table say 35 unit + 2 e2e and name `precision.spec.ts` + `resize.spec.ts`; cold verify measured exactly 35 unit and 2 e2e. |

**Score:** 43/43 truths verified. No truth is `PRESENT_BEHAVIOR_UNVERIFIED`; no override is in play. Truth 38 is the plan's explicitly static path (no runtime harness can request a 0×0 viewport).

### Deferred Items

None. No gap identified in this verification is deferred to a later phase.

### Advisory (New Scope, Unevidenced)

None. This re-verification's own scan produced no new-scope findings; the 23 open review rows are pre-existing and are recorded under Open Review Findings below.

## Required Artifacts

`gsd_run query verify.artifacts` returned `all_passed: true` for every plan (35/35 artifacts, exit 0, no issues). Level 2 (substantive) and Level 3 (wired) were checked against the real files and the passing suite.

| Plan | Artifact | Status | Details |
| ---- | -------- | ------ | ------- |
| 01-01 | `Dockerfile` | ✓ VERIFIED | digest-pinned `node:24-bookworm-slim@sha256:c86ece…`; manifest copied before `npm ci`; Chromium installed only at build. Used by every Compose service. |
| 01-01 | `compose.yaml` | ✓ VERIFIED | seven services, one anchor, bind mount + named `node_modules` volume; verify chain. |
| 01-01 | `package.json` | ✓ VERIFIED | exact version pins; seven scripts every service invokes. |
| 01-01 | `package-lock.json` | ✓ VERIFIED | `npm ci` succeeds in the cold build. |
| 01-01 | `src/render/camera-relative.ts` | ✓ VERIFIED | `cameraRelative` imported and used by `src/main.ts:place()`. |
| 01-01 | `src/render/precision-scene.ts` | ✓ VERIFIED | scene/near/far/starfield constructed and mounted in `src/main.ts`. |
| 01-01 | `src/main.ts` | ✓ VERIFIED | boot, probe, resize repaint; live probe matches. |
| 01-01 | `tests/e2e/precision.spec.ts` | ✓ VERIFIED | passes in the cold verify. |
| 01-02 | `tsconfig.json` | ✓ VERIFIED | strict flags verified in file; typecheck passes. |
| 01-02 | `tsconfig.sim.json` | ✓ VERIFIED | `lib:["ES2022"]`, `types:[]`; used by `npm run typecheck`. |
| 01-02 | `eslint.config.js` | ✓ VERIFIED | flat config, sim zone all `error`; used by lint and guard tests. |
| 01-02 | `vitest.config.ts` | ✓ VERIFIED | one `unit` project, Node env, include globs collected 6 files. |
| 01-02 | `tests/guards/sim-purity.test.ts` | ✓ VERIFIED | 2 cases pass and prove both gates fire. |
| 01-03 | `src/sim/math.ts` | ✓ VERIFIED | used by `step.ts`; typecheck/lint pass. |
| 01-03 | `src/sim/hash.ts` | ✓ VERIFIED | used by `state.ts`/tests. |
| 01-03 | `src/sim/state.ts` | ✓ VERIFIED | used by loop/tests. |
| 01-03 | `src/sim/step.ts` | ✓ VERIFIED | used by `loop.ts`; fixed step. |
| 01-03 | `src/sim/loop.ts` | ✓ VERIFIED | used by cadence and golden tests. |
| 01-03 | `src/sim/cadence.test.ts` | ✓ VERIFIED | 3 tests pass. |
| 01-03 | `tests/golden/kinematic-probe.json` | ✓ VERIFIED | replayed by the golden test. |
| 01-03 | `tests/golden/kinematic-probe.test.ts` | ✓ VERIFIED | 1 test passes. |
| 01-04 | `src/render/camera-relative.test.ts` | ✓ VERIFIED | 3 tests pass, collected by the unit project. |
| 01-04 | `tests/e2e/precision.spec.ts` | ✓ VERIFIED | passes; asserts probe + disclaimer + no errors. |
| 01-05 | `LICENSE` | ✓ VERIFIED | md5 match, compliance test. |
| 01-05 | `NOTICE` | ✓ VERIFIED | §1-§6 read; four tests pass. |
| 01-05 | `ASSETS.md` | ✓ VERIFIED | contract + empty table; compliance test. |
| 01-05 | `tests/compliance.test.ts` | ✓ VERIFIED | 10 tests pass. |
| 01-05 | `README.md` | ✓ VERIFIED | command table pinned by the contract test. |
| 01-06 | `scripts/smoke-dev.sh` | ✓ VERIFIED | ran, exit 0, tears down. |
| 01-06 | `scripts/smoke-preview.sh` | ✓ VERIFIED | ran, exit 0, tears down. |
| 01-06 | `scripts/check-verify-fails-fast.sh` | ✓ VERIFIED | ran, exit 0, seed cleaned. |
| 01-07 | `src/main.ts` | ✓ VERIFIED | repaint + guard + additive `renders`; see truths 36-42. |
| 01-07 | `tests/e2e/resize.spec.ts` | ✓ VERIFIED | passes; red-run discrimination proven. |
| 01-07 | `01-REVIEW-DISPOSITION.md` | ✓ VERIFIED | `CR-01` row is `fixed` with `01-07-PLAN.md` as source. |
| 01-07 | `01-VALIDATION.md` | ✓ VERIFIED | 35 unit + 2 e2e; FOUND-08 row names both specs. |

## Key Link Verification

`gsd_run query verify.key-links` could not evaluate these plans because their `key_links` are prose strings rather than `{from,to,via}` objects (`total: 0`, exit 1). Every link was therefore verified by reading the connecting code and by the passing command that traverses it.

| # | From → To | Via | Status | Details |
| - | --------- | --- | ------ | ------- |
| 1 | `compose.yaml` verify | one `sh -lc` `&&` chain | ✓ WIRED | `compose.yaml:70-78`; no `depends_on`, no `;`. |
| 2 | `src/main.ts` → camera-relative transform | `cameraRelative(world, CAMERA_WORLD)` → `Object3D.position` | ✓ WIRED | `place()` is the only position writer (`src/main.ts:46-49`); live probe `nearRelZ`/`farRelZ` match. |
| 3 | Playwright webServer → built bundle | `npx vite preview` on 127.0.0.1:4173 ← `npm run build` in e2e | ✓ WIRED | `playwright.config.ts:20-28`; e2e 2 passed. |
| 4 | Dockerfile base stage → dependency cache | manifest copy before `npm ci` | ✓ WIRED | `Dockerfile:11-16`; cold `down --volumes` + build repopulated the volume. |
| 5 | `package.json` typecheck → two projects | two independent `tsc -p … --noEmit` | ✓ WIRED | `package.json:13`; verify log. |
| 6 | ESLint project service → `tsconfig.json` | `parserOptions.projectService` | ✓ WIRED | `eslint.config.js:44-52`; lint passes on every included file. |
| 7 | Vitest include → render test | `src/**/*.test.ts` | ✓ WIRED | `vitest.config.ts:18`; 3 render tests reported. |
| 8 | cadence test → loop → `step` | tick-indexed input, `DT` | ✓ WIRED | `cadence.test.ts:33-46`; one hash across four cadences. |
| 9 | `hashState` → `serialize` → `canon` | non-finite throw | ✓ WIRED | `hash.ts:31-35`; rejection test passes. |
| 10 | golden test → fixture → hash | `readFileSync` + `JSON.parse` | ✓ WIRED | `kinematic-probe.test.ts:28-48`; hash `1c079894` replays. |
| 11 | `window.__wegolite` → precision spec | `page.evaluate` | ✓ WIRED | `precision.spec.ts:24`; probe read successfully. |
| 12 | Vitest include → camera-relative test | `src/**/*.test.ts` | ✓ WIRED | 3 tests reported. |
| 13 | Playwright webServer → `dist/` | build in the e2e service command | ✓ WIRED | `compose.yaml:53-56`; e2e passes. |
| 14 | `index.html` footer → NOTICE/README wording | one non-affiliation sentence | ✓ WIRED | `index.html:61-66`, `NOTICE:51-56`, `README.md:6`; compliance test. |
| 15 | compliance test → shipped artifacts | reads LICENSE/NOTICE/ASSETS/index/package | ✓ WIRED | `tests/compliance.test.ts`; 10 cases pass. |
| 16 | README command table → Compose services | exact set equality | ✓ WIRED | contract test (16 tests) passes. |
| 17 | scripts → documented Compose commands | `docker compose up -d` / `run --rm` | ✓ WIRED | all three scripts ran successfully. |
| 18 | fail-fast rehearsal → seeded probe → lint | bind-mounted `src/sim/__verify_probe.ts` | ✓ WIRED | ran: lint error names the probe/rule; probe removed. |
| 19 | e2e command → dist → preview → baked Chromium | `npm run build && npm run test:e2e` | ✓ WIRED | cold verify; offline `/ms-playwright` listing. |
| 20 | `resize()` → `renderFrame()` → `renderer.render` | single call site | ✓ WIRED | `src/main.ts:120-139`; only `renderer.render` site is `:123`. |
| 21 | `renderer.info.render.frame` → probe → resize spec | `waitForFunction` | ✓ WIRED | `src/main.ts:158`; three `WebGLRenderer.js:1710`; spec line 49; live probe `renders: 1`. |
| 22 | `playwright.config.ts` testDir → `docker compose run --rm e2e` | baked Chromium | ✓ WIRED | 2 tests ran in the container. |
| 23 | `01-VALIDATION.md` totals → verify output | re-measured inventory | ✓ WIRED | Both say 35 unit + 2 e2e. |

## Data-Flow Trace (Level 4)

The Phase 1 shell is a deliberately static precision scene; there is no database or network data source to trace.

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `src/main.ts` | `farMarker.position.z` | `cameraRelative(FAR_WORLD, CAMERA_WORLD)` from `FAR_M = 1.4e6` | Yes — live probe `farRelZ: -1400000` | ✓ FLOWING |
| `src/main.ts` | `nearBox.position.z` | `cameraRelative(NEAR_WORLD, CAMERA_WORLD)` | Yes — live probe `nearRelZ: -100000` | ✓ FLOWING |
| `src/main.ts` | `renders` | `renderer.info.render.frame` after `renderer.render()` | Yes — increments on each real render (boot 1; resize advances) | ✓ FLOWING |
| `src/main.ts` | `calls` / `triangles` | `renderer.info.render` after the boot render | Yes — live probe `3` / `12`, never zero | ✓ FLOWING |
| `src/main.ts` | overlay text (`status`, `stats`) | literal strings / renderer stats | Static by design (D-05); no hollow prop | ✓ VERIFIED (static) |

## Behavioral Spot-Checks

All project commands were run in Docker. No host Node/npm/Playwright was used to execute project code.

| # | Behavior | Command | Result | Status |
| - | -------- | ------- | ------ | ------ |
| 1 | Cold-state full chain from a clean volume | `docker compose down --volumes --remove-orphans && docker compose build && docker compose run --rm verify` | exit 0; 35 unit + 2 e2e | ✓ PASS |
| 2 | Unit suite | `docker compose run --rm test` | 6 files / 35 tests pass | ✓ PASS |
| 3 | Browser suite | inside verify | 2 tests pass (precision + resize) | ✓ PASS |
| 4 | Dev server serves the HMR client | `sh scripts/smoke-dev.sh` | exit 0, `@vite/client` | ✓ PASS |
| 5 | Preview serves the built bundle | `sh scripts/smoke-preview.sh` | exit 0, `foundation build` | ✓ PASS |
| 6 | Verify fails fast at lint | `sh scripts/check-verify-fails-fast.sh` | exit 0; `no-restricted-imports` on the probe; probe removed | ✓ PASS |
| 7 | Chromium baked, usable offline | `docker run --rm --network none --entrypoint sh wegolite-ci -c 'ls /ms-playwright'` | chromium + headless shell + ffmpeg | ✓ PASS |
| 8 | CR-01 regression is discriminating (pre-fix build) | pre-fix `src/main.ts` → `docker compose run --rm e2e` | exit 1, `bootRenders` received 0 | ✓ PASS |
| 9 | CR-01 regression is discriminating (field without repaint) | pre-fix `src/main.ts` + `renders` field → `docker compose run --rm e2e` | exit 1, `waitForFunction` timeout after 900×600 | ✓ PASS |
| 10 | Live probe values | temporary Playwright spec in the e2e image | `{ready:true, calls:3, triangles:12, logDepth:true, depthBits:24, webgl2:true, nearRelZ:-100000, farRelZ:-1400000, farUlp:0.125, renders:1}` | ✓ PASS |
| 11 | Licence fixture | `md5sum LICENSE` | `570a9b3749dd0463a1778803b12a6dce` | ✓ PASS |

The working tree was restored and `git status` showed no source change after the red runs (only the pre-existing `.planning/config.json` modification and untracked `.planning/state.json`).

### Probe Execution

No `scripts/*/tests/probe-*.sh` exists and no PLAN or SUMMARY declares a probe. Step 7c is not applicable to this phase; `check-verify-fails-fast.sh` is a rehearsal script, run above as a behavioral spot-check.

## Requirements Coverage

Every requirement ID declared across the seven PLAN frontmatters is accounted for. REQUIREMENTS.md maps exactly FOUND-01…FOUND-09 to Phase 1; no Phase 1 ID is orphaned and no plan claims an ID outside that set.

| Requirement | Source Plan(s) | Description | Status | Evidence |
| ----------- | -------------- | ----------- | ------ | -------- |
| FOUND-01 | 01-01, 01-06, 01-07 | Clean-checkout `docker compose up app` with hot reload, no host Node/npm | ✓ SATISFIED (caveat) | smoke-dev exit 0; contract test boots Vite in-container; UAT test 2 confirms host-edit HMR. Caveat: WR-01 makes the documented WSL2/macOS polling fallback inert — a reliability warning, not the reference path. |
| FOUND-02 | 01-01, 01-06 | `docker compose up preview` builds and serves the production bundle | ✓ SATISFIED | compose build-before-serve; smoke-preview exit 0; e2e loads the built bundle. |
| FOUND-03 | 01-01, 01-02, 01-05, 01-06 | `test`/`e2e`/`lint`/`typecheck`/`verify` run in containers; `verify` is definition of done | ✓ SATISFIED | Cold verify exit 0; fail-fast rehearsal proves a red chain is red; README/AGENTS document it. |
| FOUND-04 | 01-01, 01-06 | Base tags pinned, dependency layers cached, browsers baked, never downloaded at test time | ✓ SATISFIED (caveat) | digest-pinned base; manifest-before-ci; offline `/ms-playwright`. Caveat: WR-08 (unpinned `# syntax` frontend and `--with-deps` apt drift) is build-time drift, not a test-time download. |
| FOUND-05 | 01-02 | Strict TS, lint/format, import-zone rule forbidding Three/DOM in `src/sim/` | ✓ SATISFIED (caveat) | strict flags; sim tsconfig; all ESLint rules `error`; guard test proves both gates fire. Caveat: WR-03 (bare `Date()` is not banned) is a rule-coverage gap, not a violation of the stated boundary. |
| FOUND-06 | 01-05 | `LICENSE`, `NOTICE`, `ASSETS.md`, non-affiliation disclaimer | ✓ SATISFIED | md5 match; NOTICE terms; ASSETS contract; footer; 10 compliance cases pass; UAT test 3 accepted the wording. |
| FOUND-07 | 01-03 | Deterministic 1/120 s accumulator, identical results across frame cadences | ✓ SATISFIED | cadence test one hash at four cadences; golden fixture `1c079894`. |
| FOUND-08 | 01-01, 01-04, 01-07 | Camera-relative marker at 1.4e6 m without float32 jitter or z-fighting | ✓ SATISFIED | numeric proofs; live probe log depth + 24-bit depth; resize repaint regression; UAT test 1 accepted visual stability. |
| FOUND-09 | 01-05, 01-06 | `AGENTS.md` documents the container-only workflow; commands work verbatim | ✓ SATISFIED (caveat) | contract test requires command-set equality with Compose and npm scripts; all commands ran. Caveat: the `VITE_USE_POLLING` note is inert (WR-01). |

**Orphaned requirements:** none. **Unclaimed Phase 1 IDs:** none.

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | `TBD`/`FIXME`/`XXX` in files modified by this phase | — | None found (grep over `src`, `tests`, `scripts`, Compose, Dockerfile, configs). |
| — | — | `TODO`/`HACK`/`PLACEHOLDER`/“not yet implemented”/“coming soon” | — | None found. |
| — | — | empty `return null` / `return {}` / `=> {}` stubs in `src` | — | None found. |

No debt marker in a modified file is unresolved or unreferenced, so the debt-marker gate does not fire.

### Open Review Findings (context, not must-have gaps)

`01-REVIEW.md` now records 23 findings (0 critical, 11 warning, 12 info) and `01-REVIEW-DISPOSITION.md` records `open: 23`, `total: 24`; **CR-01 is the only fixed row**. These were treated as context, not evidence, and re-checked only where they could touch a must-have:

- **WR-01** (inert `VITE_USE_POLLING`) affects the documented WSL2/macOS hot-reload escape hatch, not the reference-host path FOUND-01 requires — warning.
- **WR-05** (fail-fast rehearsal could be satisfied by a later-stage failure) affects the rehearsal's discrimination, not today's result: the run failed at lint and named `no-restricted-imports` — warning.
- **WR-06/WR-07** (bare `docker compose up` races, probe files in the bind mount) are single-run/serialization risks; the cold verify is sequential and green — warning.
- **WR-08** (unpinned BuildKit frontend, apt drift) is build-time reproducibility — warning.
- **WR-09** (zero-size boot publishes `ready:true`, `renders:0`) leaves the plan's static zero-size guard intact; it is a probe-semantics warning.
- **WR-10/WR-11/IN-11/IN-12** concern the resize test's strength (counter monotonicity under context restore, ≥1 vs exactly 1, DPR sampling), not whether the fix repaints — warning/info.

None of these falsifies a Phase 1 truth or roadmap success criterion. They remain quality debt tracked by the review gate.

## Human Verification

None outstanding. The previous report's four human items are closed:

1. Real-GPU visual stability at 1.4e6 m — UAT test 1 `pass` (user screenshot: starfield fills the frame, crisp near box).
2. Hot-reload propagation from a host edit — UAT test 2 `pass` (`up app` on 5173 updates; the earlier non-update was a stale `preview` dist).
3. Legal/editorial adequacy of the licence and trademark posture — UAT test 3 `pass`.
4. Accept-or-fix decision on CR-01 — resolved by fixing it: the resize regression passes and, in two red runs against the pre-fix build, fails exactly as designed.

Bookkeeping note: `01-UAT.md` still records test 4 as `issue`/`diagnosed` because it predates the 01-07 fix (updated 21:16, fix committed 22:45). The gap is closed in code and by a discriminating regression; reconciling the UAT record is a tracking step, not a code gap.

## Gaps Summary

**None against the Phase 1 must-haves.** All 43 truths declared by the seven plans are verified against the current tree, all 35 declared artifacts exist and are substantive and wired, every key link was traced through the code or the command that exercises it, and no anti-pattern or debt marker was found. The gap-closure plan 01-07 is real: it repaints once per non-zero resize, guards the zero-size path before any size/aspect write, exposes an additive render count sourced from three's own counter, and ships a regression proven to fail against both pre-fix variants without regressing `precision.spec.ts` or any earlier must-have. The 23 open review findings are non-blocking quality debt, recorded here and in the review disposition.

---

_Verified: 2026-11-02T22:08:28Z_
_Verifier: gsd-verifier_
