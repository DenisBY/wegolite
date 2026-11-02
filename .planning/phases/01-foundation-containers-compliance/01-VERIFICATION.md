---
phase: "01"
status: human_needed
score: "35/35"
created: "2026-11-02"
verified: "2026-11-02T18:55:45Z"
behavior_unverified: 0
overrides_applied: 0
review_findings_open: 19
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
  - tests/golden/kinematic-probe.json
  - tests/golden/kinematic-probe.test.ts
  - tests/guards/sim-purity.test.ts
  - tsconfig.json
  - tsconfig.sim.json
  - vite.config.ts
  - vitest.config.ts
covered_digest: "v4:sha256:2e2a7516a977dad27a18228478cc81af6e5708617eb54c15f7e97276146ee281"
human_verification:
  - test: "Open the shell in a desktop browser with a real GPU at 1280x720 (docker compose up preview, http://localhost:4173). Confirm the starfield fills the frame and the 500 m near box at ~1e5 m renders as a small, crisp square with no z-fighting."
    expected: "A stable, recognisably 3D scene with no visible jitter or depth fighting; the 1.4e6 m marker is sub-pixel by design and is checked numerically."
    why_human: "The container runs headless Chromium on SwiftShader, which proves the WebGL pipeline and the numeric placement but not discrete-GPU rendering or what a human actually sees."
  - test: "With `docker compose up app` running, edit `index.html` (or any `src/` file) on the host and watch the browser."
    expected: "The page updates without restarting the container. On WSL2/macOS, repeat with the documented `VITE_USE_POLLING=1` opt-in."
    why_human: "Host-to-bind-mount file-event propagation is host-specific and cannot be observed from inside the test container. Note WR-01: the documented polling opt-in is currently inert (see Open Review Findings)."
  - test: "Give `LICENSE`, `NOTICE`, `ASSETS.md` and the shipped footer a legal/editorial read against Oolite's licence and Frontier's trademark guidance."
    expected: "The GPL-2.0-or-later election, Oolite attribution, CC BY-NC-SA 3.0 posture, source offer and non-affiliation wording are legally adequate (not merely present)."
    why_human: "Presence and token checks pass, but legal sufficiency is a professional judgment; NOTICE itself says it is not legal advice."
  - test: "After the page loads, resize the browser window and decide whether the Phase 1 shell may blank until the Phase 3 render loop lands (CR-01)."
    expected: "An explicit accept-or-fix decision. `src/main.ts:121-132` resizes the buffer and camera but never calls `renderer.render`; an in-container probe recorded canvas 1280x720 -> 900x600 with 0 draws and 0 clears afterwards."
    why_human: "This is an acceptance decision about a defect that lies outside the Phase 1 must-haves, not a check an automated gate can make for the maintainer."
---

# Phase 01: Foundation, Containers & Compliance — Verification Report

**Phase Goal:** A contributor with only Docker can serve, test, and verify the project from a clean checkout, on a deterministic fixed-step loop with a render strategy that survives system-scale distances — and the licence, attribution, and trademark posture is in place before any asset is committed.

**Verified:** 2026-11-02T18:55:45Z
**Status:** human_needed
**Score:** 35/35 must-have truths verified
**Mode:** Initial verification (no prior `01-VERIFICATION.md` existed in the phase directory)

## Goal Achievement

### Roadmap Success Criteria

| # | Criterion | Status | Evidence |
| - | --------- | ------ | -------- |
| 1 | Only Docker + one command serves the game with hot reload on a documented port; no host Node/npm | ✓ VERIFIED | `docker compose up app` / `sh scripts/smoke-dev.sh` exited 0 and served `@vite/client` on 5173 (`scripts/smoke-dev.sh:21-36`; `compose.yaml:29-33`; `package.json:10`; `vite.config.ts:9-22`). The HMR client is present; host-edit propagation itself is a human check. |
| 2 | `docker compose run --rm verify` chains lint, typecheck, unit and containerised browser tests, and is the documented definition of done | ✓ VERIFIED | Cold state: `docker compose down --volumes --remove-orphans && docker compose build && docker compose run --rm verify` exited 0. The chain is one `sh -lc` with `&&` at `compose.yaml:70-78`; README:38 and AGENTS:22,45 document it as the only definition of done. |
| 3 | The same scripted simulation at two frame cadences produces identical state hashes, proving the 1/120 s fixed step | ✓ VERIFIED | `src/sim/cadence.test.ts:53-56` hashes one 1200-tick replay at 30/60/120/144 Hz to a single hash; passed in `docker compose run --rm test` (35 tests). |
| 4 | A marker at 1.4e6 m stays visually stable, with no float32 jitter or depth fighting | ✓ VERIFIED | Exact float64 100 m separation at 1e6 m and exact `f32Ulp(1.4e6) === 0.125` (`src/render/camera-relative.test.ts:14-28`); log depth on, 24 depth bits, `farRelZ = -1.4e6`, `farUlp = 0.125` from the built shell. Real-GPU appearance is the human item below. |
| 5 | `LICENSE`, `NOTICE`, `ASSETS.md` and a visible non-affiliation disclaimer exist; no Frontier mark is used as product identity | ✓ VERIFIED | `LICENSE` md5 `570a9b3749dd0463a1778803b12a6dce`; `NOTICE` carries the election, attribution, CC BY-NC-SA 3.0 terms, source offer and disclaimer; `ASSETS.md` has the provenance table and no rows; `index.html:61-66` renders the disclaimer; `package.json` name and `<title>` are mark-free (`tests/compliance.test.ts:151-166`). See the wording note under SC5 below. |

**SC5 wording note:** the only occurrences of “Elite”/“Cobra” in the shipped UI are inside the required non-affiliation sentence (`index.html:62-66`), i.e. nominative trademark attribution, not product identity. The plan prohibition and `tests/compliance.test.ts` encode that reading. The human legal item includes confirming that reading against the roadmap's literal wording.

### Observable Truths (must-haves)

All truth statements below are copied from the six PLAN frontmatters; each was checked against the codebase, not against SUMMARY claims.

#### Plan 01-01 — walking skeleton

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | Clean-checkout `docker compose up app` serves the shell on 5173 with the Vite HMR client, no host Node/npm | ✓ VERIFIED | `sh scripts/smoke-dev.sh` exit 0, body contained `@vite/client`; `compose.yaml:29-33`; `Dockerfile` is the only toolchain. Host `node_modules/` is empty (0 entries) and untracked. |
| 2 | `docker compose run --rm e2e` builds, uses baked Chromium, reports WebGL2, log depth, calls > 0, zero console/page errors | ✓ VERIFIED | `docker compose run --rm e2e` exit 0, 1 test passed; probe `{webgl2:true, logDepth:true, calls:3, triangles:12}`; `tests/e2e/precision.spec.ts:26-43`. |
| 3 | The 1.4e6 m precision scene is the default view on every load (no flag or dev-only route) | ✓ VERIFIED | `src/main.ts:110-132` builds and renders unconditionally; no query/route branch exists. |
| 4 | Every Compose service bind-mounts the tree and the named `node_modules` volume | ✓ VERIFIED | `compose.yaml:18-26` anchor with `.:/app` + volume; all seven services inherit `<<: *workspace` (`:30,36,43,47,57,61,65`); `tests/contract/container-contract.test.ts:235-247`. |
| 5 | `preview` builds before serving the production bundle on 4173 | ✓ VERIFIED | `compose.yaml:35-40`; `sh scripts/smoke-preview.sh` exit 0 and served `foundation build`; e2e loads the built bundle through `vite preview`. |
| 6 | Every `.ts`/`.js` file plan 01 created carries the S-6 SPDX header | ✓ VERIFIED | `tests/compliance.test.ts:169-182` walks the tree and passed (10 compliance cases). |

#### Plan 01-02 — toolchain gates

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 7 | `docker compose run --rm typecheck` exits 0, running both TS projects | ✓ VERIFIED | `docker compose run --rm typecheck` exit 0; `package.json:13`; `tsconfig.json` + `tsconfig.sim.json`. |
| 8 | `docker compose run --rm lint` exits 0 clean and non-zero on a Three import or DOM global under `src/sim/` | ✓ VERIFIED | `docker compose run --rm lint` exit 0; guard tests pass; `sh scripts/check-verify-fails-fast.sh` printed `no-restricted-imports ... src/sim must stay renderer-free`. |
| 9 | A DOM identifier fails `tsc` with TS2584 and a Three import fails ESLint; neither gate alone is sufficient | ✓ VERIFIED | `tests/guards/sim-purity.test.ts:60-116` exercises both gates and passed (2 cases). |
| 10 | `docker compose run --rm test` runs one `unit` project in Node and reports the guard's two cases | ✓ VERIFIED | Test output: project `unit`, 6 files / 35 tests, guard 2/2. `vitest.config.ts:10-21` sets `environment: "node"`. |
| 11 | No sim-zone rule is a warning; every import-zone/DOM/non-determinism rule is `error` | ✓ VERIFIED | `eslint.config.js:63-118` — every rule entry is `"error"`. |
| 12 | Every file plan 02 created carries the S-6 SPDX header | ✓ VERIFIED | Same tree-wide compliance walk (`tests/compliance.test.ts:169-182`) passes. |

#### Plan 01-03 — determinism harness

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 13 | One per-tick input log replayed at 30/60/120/144 Hz to a fixed tick count gives exactly one final hash | ✓ VERIFIED | `src/sim/cadence.test.ts:53-56`; passed. |
| 14 | The loop stops on a step count, not elapsed time; the 144 Hz → 119-step counter-example is preserved with its comment | ✓ VERIFIED | `src/sim/loop.ts:20-24,38-58`; `src/sim/cadence.test.ts:58-65`. |
| 15 | `step()` reads no clock or randomness, takes `dt`, mutates in place, deterministic for `dt === DT` | ✓ VERIFIED | `src/sim/step.ts:35-58`; ESLint bans `Math.random`, `Date.now`, `performance.now`, `new Date` (`eslint.config.js:93-117`). |
| 16 | Canonical labelled fixed-precision serialization hashed with in-repo FNV-1a; non-finite throws; -0 normalizes | ✓ VERIFIED | `src/sim/hash.ts:13-35`, `src/sim/state.ts:43-54`; node probe inside the image returned `{"negzero":"0.000000","nonfinite":"non-finite value in state: NaN","fnv":"1a47e90b"}`; `cadence.test.ts:67-71` asserts the throw. |
| 17 | A checked-in golden fixture (input script + hash, `dt === DT`) replays to its recorded hash, generated in-container | ✓ VERIFIED | `tests/golden/kinematic-probe.json` (`dt: 0.008333333333333333`, hash `1c079894`, version 1); `tests/golden/kinematic-probe.test.ts:34-48` passed. |
| 18 | The Phase 1 probe uses placeholder kinematic constants, with a comment pointing at Phase 3 | ✓ VERIFIED | `src/sim/step.ts:17-24` says so explicitly; values 1/1/100/10, not Oolite constants. |
| 19 | Every file plan 03 created carries the S-6 SPDX header | ✓ VERIFIED | Same compliance walk passes. |

#### Plan 01-04 — precision proof

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 20 | Camera-relative subtraction is float64 before any float32 upload; 100 m at 1e6 m stays exactly 100 m, asserted with `toBe` | ✓ VERIFIED | `src/render/camera-relative.ts:28-34`; `src/render/camera-relative.test.ts:14-22` passed. |
| 21 | float32 ULP at 1.4e6 m is exactly 0.125, pinned by an exact assertion | ✓ VERIFIED | `src/render/camera-relative.test.ts:24-28`; e2e probe `farUlp: 0.125`. |
| 22 | The camera-relative test is actually collected; the run reports three passing tests for it | ✓ VERIFIED | `vitest.config.ts:18` includes `src/**/*.test.ts`; `docker compose run --rm test` lists `src/render/camera-relative.test.ts (3 tests)`. |
| 23 | The built shell, via headless Chromium + `vite preview`, reports WebGL2, log depth, 24-bit-or-better depth, `farRelZ -1.4e6`, `farUlp 0.125`, disclaimer, zero errors | ✓ VERIFIED | e2e exit 0; probe `{depthBits:24, farRelZ:-1400000, logDepth:true, webgl2:true}`; footer asserted; `tests/e2e/precision.spec.ts:26-43`. |
| 24 | No pixel comparison, screenshot baseline or `gl.readPixels` assertion exists anywhere | ✓ VERIFIED | `grep -rn "readPixels\|toMatchSnapshot\|toHaveScreenshot\|pixel" src tests scripts` matched only explanatory comments in `src/render/precision-scene.ts`; Playwright sets `screenshot: "off"` (`playwright.config.ts:20`). |

#### Plan 01-05 — compliance and command contract

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 25 | `LICENSE` is byte-for-byte GPL v2 (md5 `570a9b3749dd0463a1778803b12a6dce`) | ✓ VERIFIED | `md5sum LICENSE` → `570a9b3749dd0463a1778803b12a6dce`; `tests/compliance.test.ts:79-86` passed. |
| 26 | `NOTICE` states the GPL-2.0-or-later election, Oolite attribution, CC BY-NC-SA 3.0 posture, source offer and disclaimer | ✓ VERIFIED | `NOTICE:7-57` read directly; four NOTICE tests passed. |
| 27 | `ASSETS.md` has the provenance column contract and zero asset rows, and states no asset may be committed without a row | ✓ VERIFIED | `ASSETS.md:3-16`; `tests/compliance.test.ts:130-139` passed. |
| 28 | An automated compliance test fails on drift: wrong licence hash, missing NOTICE terms, missing ASSETS columns, absent disclaimer, trademark title, missing SPDX header | ✓ VERIFIED | `tests/compliance.test.ts` (10 cases) asserts each; all pass in `verify`. |
| 29 | `README.md` repeats the command table verbatim, documents 5173/4173, `verify` as definition of done, `down --volumes`, `VITE_USE_POLLING`, root-Chromium posture | ✓ VERIFIED | `README.md:23-42`; `tests/contract/container-contract.test.ts:286-301,390-446`. |
| 30 | `AGENTS.md` gains ports, volume refresh, polling opt-in, bind-mount note, while Docker-only/container-tests/licensing stay intact | ✓ VERIFIED | `AGENTS.md:21-25,62-65`; contract test asserts the same strings. |

#### Plan 01-06 — operational rehearsal

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 31 | `sh scripts/smoke-dev.sh` exits 0 only on a real HTTP body containing `@vite/client`, then tears down | ✓ VERIFIED | Ran it: exit 0, `dev smoke: 5173 served the HMR client`; container removed. |
| 32 | `sh scripts/smoke-preview.sh` exits 0 only when the served page contains `foundation build`, then tears down | ✓ VERIFIED | Ran it: exit 0, `preview smoke: 4173 served the production bundle`; container removed. |
| 33 | `sh scripts/check-verify-fails-fast.sh` seeds a lint error, proves non-zero at lint, removes the seed, exits 0 | ✓ VERIFIED | Ran it: exit 0, output names `no-restricted-imports` / `src/sim must stay renderer-free`, `src/sim/__verify_probe.ts` was gone afterwards. |
| 34 | `docker compose run --rm verify` exits 0 after `down --volumes` + `build`, proving the named volume repopulates and the chain runs in one container | ✓ VERIFIED | Cold-state run: down --volumes → build → verify exit 0; 35 unit + 1 e2e. |
| 35 | Chromium is baked into the image under `/ms-playwright` with no network access | ✓ VERIFIED | `docker run --rm --network none --entrypoint sh wegolite-ci -c 'ls /ms-playwright'` → `chromium-1248`, `chromium_headless_shell-1248`, `ffmpeg-1013`; exit 0. |

**Score:** 35/35 truths verified. No truth is `PRESENT_BEHAVIOR_UNVERIFIED` and no override is in play.

## Requirement Coverage

Every requirement ID declared in a PLAN frontmatter is accounted for. REQUIREMENTS.md maps exactly FOUND-01…FOUND-09 to Phase 1; no Phase 1 requirement is orphaned and no plan claims an ID outside that set.

| Requirement | Source plan(s) | Description | Status | Evidence |
| ----------- | -------------- | ----------- | ------ | -------- |
| FOUND-01 | 01-01, 01-06 | Clean-checkout `docker compose up app` with hot reload, no host Node/npm | ✓ SATISFIED (caveat) | `sh scripts/smoke-dev.sh` exit 0, `@vite/client` served on 5173; `compose.yaml:29-33`; host `node_modules/` empty. Caveat: WR-01 (below) makes the documented WSL2/macOS polling fallback inert; host-edit propagation itself is human-verified. |
| FOUND-02 | 01-01, 01-06 | `docker compose up preview` builds and serves the production bundle as a static site | ✓ SATISFIED | `compose.yaml:35-40`; `sh scripts/smoke-preview.sh` exit 0, body contains `foundation build`; e2e loads the built bundle. |
| FOUND-03 | 01-01, 01-02, 01-05, 01-06 | `test`/`e2e`/`lint`/`typecheck`/`verify` run in containers; `verify` is the documented definition of done | ✓ SATISFIED | Each service ran directly: `--rm lint` 0, `--rm typecheck` 0, `--rm test` 0 (35), `--rm e2e` 0 (1); cold-state `verify` 0; rehearsal proves fail-fast. `README.md:38`, `AGENTS.md:22`. |
| FOUND-04 | 01-01, 01-06 | Base tags pinned, dependency layers cached, browsers baked, never downloaded at test time | ✓ SATISFIED (caveat) | `Dockerfile:7` digest-pinned base; `:15` manifest copy before `npm ci`; `:29` install only at build; `/ms-playwright` present offline. Caveat: WR-08 (unpinned `# syntax` frontend and `--with-deps` apt drift). |
| FOUND-05 | 01-02 | Strict TS, lint/format, import-zone rule forbidding Three/DOM in `src/sim/` | ✓ SATISFIED | `tsconfig.json` strict flags; `tsconfig.sim.json:12-22`; `eslint.config.js:63-118` all `error`; guard test proves both gates can fail. Caveat: WR-03 (bare `Date()` is not banned). |
| FOUND-06 | 01-05 | `LICENSE`, `NOTICE`, `ASSETS.md`, non-affiliation disclaimer | ✓ SATISFIED | md5 match; `NOTICE:7-57`; `ASSETS.md:3-16`; `index.html:61-66`; 10 compliance cases pass. Legal adequacy is human. |
| FOUND-07 | 01-03 | Deterministic 1/120 s accumulator, identical results across frame cadences | ✓ SATISFIED | `src/sim/step.ts:35-58`, `loop.ts:28-60`; cadence test 30/60/120/144 → one hash; golden fixture `1c079894` replays. |
| FOUND-08 | 01-01, 01-04 | Camera-relative marker at 1.4e6 m without float32 jitter or z-fighting | ✓ SATISFIED | Numeric proofs (`camera-relative.test.ts`), log depth and 24-bit depth in the built shell; real-GPU appearance is human. |
| FOUND-09 | 01-05, 01-06 | `AGENTS.md` documents the container-only workflow; commands work verbatim | ✓ SATISFIED (caveat) | `AGENTS.md:21-65,85-93`; contract test requires command-target set equality with Compose and every named npm script; all commands ran. Caveat: the `VITE_USE_POLLING` note is inert (WR-01). |

**Orphaned requirements:** none. **Unclaimed Phase 1 IDs:** none.

## Automated Checks

All project commands ran in Docker. No host Node/npm/vitest/playwright was invoked.

| # | Command | Exit | Result |
| - | ------- | ---- | ------ |
| 1 | `docker compose down --volumes --remove-orphans && docker compose build && docker compose run --rm verify` | 0 | Cold-state chain: lint → typecheck → 35 unit tests (6 files) → build → 1 e2e. |
| 2 | `docker compose run --rm lint` | 0 | ESLint clean; Prettier clean. |
| 3 | `docker compose run --rm typecheck` | 0 | Both `tsc -p tsconfig.json` and `-p tsconfig.sim.json` pass. |
| 4 | `docker compose run --rm test` | 0 | 6 files / 35 tests passed. |
| 5 | `docker compose run --rm e2e` | 0 | 1 Playwright test passed; build-before-serve. |
| 6 | `sh scripts/smoke-dev.sh` | 0 | 5173 served `@vite/client`; teardown completed. |
| 7 | `sh scripts/smoke-preview.sh` | 0 | 4173 served `foundation build`; teardown completed. |
| 8 | `sh scripts/check-verify-fails-fast.sh` | 0 | Seeded Three import → verify exited non-zero with `no-restricted-imports`; probe removed. |
| 9 | `docker run --rm --network none --entrypoint sh wegolite-ci -c 'ls /ms-playwright'` | 0 | `chromium-1248`, `chromium_headless_shell-1248`, `ffmpeg-1013`. |
| 10 | `md5sum LICENSE` | 0 | `570a9b3749dd0463a1778803b12a6dce`. |
| 11 | `docker compose run --rm --entrypoint node test -e 'import("./src/sim/hash.ts")...'` | 0 | `canon(-0)` → `0.000000`; `canon(NaN)` throws `non-finite value in state: NaN`; FNV sane. |
| 12 | Inline Playwright probe inside the `e2e` image against `vite preview` | 0 | `{ready:true, calls:3, triangles:12, logDepth:true, depthBits:24, webgl2:true, nearRelZ:-100000, farRelZ:-1400000, farUlp:0.125}`. `canvas` 1280x720 → 900x600 after resize with **0 draws / 0 clears** (CR-01 evidence). |
| 13 | `VITE_USE_POLLING=1 docker compose run --rm --entrypoint sh app -c 'printf ...'` | 0 | `VITE_USE_POLLING=[]` — the opt-in does not reach the container (WR-01). |

## Human Verification

1. **Real-GPU visual stability at 1.4e6 m.** Open `docker compose up preview` (5173/4173) on a desktop GPU at 1280x720. Expect the starfield to fill the frame and the 500 m near box at ~1e5 m to be a crisp small square with no jitter or z-fighting. The 1.4e6 m marker is sub-pixel by design; its placement/ULP are numeric (`farRelZ`, `farUlp`). Headless SwiftShader cannot prove discrete-GPU appearance.
2. **Hot-reload propagation from a host edit.** Edit `index.html` with `docker compose up app` running and confirm the browser updates. On WSL2/macOS, repeat with `VITE_USE_POLLING=1`. The suite proves the HMR client is served, not that a host event reaches Vite. WR-01 means the polling opt-in currently does nothing.
3. **Legal/editorial adequacy of the licence and trademark posture.** Review `LICENSE`, `NOTICE`, `ASSETS.md` and the footer against Oolite's licence and Frontier's marks. Confirms legal sufficiency and the SC5 reading (Elite/Cobra only in the nominative disclaimer).
4. **Accept-or-fix decision on CR-01.** Resize the loaded shell and decide whether a blank canvas is acceptable for the Phase 1 walking skeleton. Evidence: `src/main.ts:121-132`; probe `0 draws / 0 clears` after resize.

## Gaps

**None against the Phase 1 must-haves.** Every truth in the six PLAN frontmatters is verified, every artifact is present and wired, and no key link is broken.

### Open Review Findings (escalated; not must-have gaps)

The phase's own review (`01-REVIEW.md`) reports 1 critical, 8 warning and 10 info findings; `01-REVIEW-DISPOSITION.md` records all 19 as `open`. These are real, reproducible defects. They do not fail a Phase 1 must-have as written, but they should not be silently carried forward.

| Finding | Severity | Evidence | Verdict against the must-haves |
| ------- | -------- | -------- | ------------------------------ |
| **CR-01** — resize resizes the drawing buffer but never repaints | critical | `src/main.ts:121-132` has no `renderer.render` in `resize()`; the only render is line 132. Independently reproduced in the `e2e` image: after 1280x720 → 900x600, `canvas` became 900x600 with 0 draw and 0 clear calls. Since `renderer.setSize` resets the WebGL drawing buffer, the page presents a cleared/black canvas after any window resize. | **Not a must-have gap.** No Phase 1 truth or roadmap SC requires repaint-on-resize; the plan explicitly specifies a single-render boot and no `requestAnimationFrame` loop (`01-01-PLAN.md:157`). It is a genuine user-visible defect in the served shell and should be fixed (one `renderer.render` in the handler plus a zero-size guard) or explicitly accepted before the shell is treated as user-facing. Phase 3's render loop will mask it, not excuse it. |
| **WR-01** — `VITE_USE_POLLING` never reaches the container | warning | `compose.yaml:18-26` has no `environment:`/`env_file:`; `vite.config.ts:18` reads `process.env`, which Compose does not forward. Confirmed: `VITE_USE_POLLING=1 docker compose run --rm --entrypoint sh app -c 'printf "[%s]" "$VITE_USE_POLLING"'` printed `[]`. | **Not a must-have gap**, but it makes the documented WSL2/macOS fallback inert. FOUND-01's reference-host hot reload works; the platform escape hatch needs the one-line `environment:` forward plus `=== "1"` comparison. |
| WR-02…WR-08, IN-01…IN-10 | warning/info | See `01-REVIEW.md` for file/line evidence. Includes latent `.env*` ignore gaps, a `Date()` hole in the sim-purity gate, Vitest 5 s default timeouts below the tests' own budgets, a rehearsal assertion that could be satisfied by typecheck, bare `docker compose up` starting all seven services, probe files written into the bind-mounted tree, an unpinned BuildKit `# syntax` frontend, and assorted info-level polish. | **Not must-have gaps.** They are quality/robustness debt. The security audit still records `threats_open: 0` (`01-SECURITY.md`) and the Nyquist validation is `status: validated`, `nyquist_compliant: true` (`01-VALIDATION.md`), but these open rows should be triaged before the review gate is treated as closed. |

## Notes on the verification boundary

- **Evidence source.** Every runtime claim above comes from a Docker command run during this verification, not from a SUMMARY. The SUMMARY files were read for intent only.
- **Determinism scope.** The cross-cadence equality is proven for synthetic frame lists on one Node engine inside the container; real `requestAnimationFrame` jitter, tab throttling and device sampling are explicitly deferred to Phase 3 (`01-03-PLAN.md:196`).
- **Security.** `01-SECURITY.md` reports 20 threats, 18 mitigated, 2 accepted, 0 open. Its evidence was spot-checked against the files (Dockerfile, compose, eslint, main.ts, tests) and matches.
- **Fingerprint.** `covered_digest: v4:sha256:2e2a7516a977dad27a18228478cc81af6e5708617eb54c15f7e97276146ee281` over the 52 files listed in the frontmatter (the six PLAN/SUMMARY pairs are auto-included by `verification.fingerprint`).

---

_Verified: 2026-11-02T18:55:45Z_
_Verifier: gsd-verifier_
