# Phase 7: Hardening & Community Release - Research

**Researched:** 2026-11-07
**Domain:** Browser WebGL2 release hardening: frame budget, cross-browser e2e, WebGL context loss, tab throttling, runtime network guard, licence distribution, documentation
**Confidence:** HIGH for in-repo state (read or measured this session); MEDIUM for browser-platform behaviour (cited, not run in the container); LOW for real-GPU frame rate (no GPU in this environment, nothing measured)

## Summary

Phase 7 is release hardening, and most of the machinery already exists. The fixed-step loop with a five-step catch-up cap and a backlog drop is in `src/sim/step.ts` and `src/app/game-loop.ts`. The page pauses on `visibilitychange` (`src/main.ts:329-335`). The Playwright suite has 16 spec files and 76 tests, and the Vitest suite has 90 files and 1,132 tests (`06-VERIFICATION.md`, gate evidence). Content goldens exist for commodities, equipment, ships, dock ports and three markets.

Three gaps are structural rather than cosmetic:

1. **The licence material does not reach the shipped site, and the public source offer currently points at nothing usable.** `dist/` contains `index.html`, `assets/`, `models/` and `textures/` only. `NOTICE` (section 4) offers source at `https://github.com/DenisBY/wegolite`, but the public `main` branch there holds only `.planning/` and `AGENTS.md` (`git ls-remote` HEAD is `df35afb`; local `main` is 441 commits ahead). The raw `LICENSE`, `NOTICE` and `src/sim` paths return HTTP 404.
2. **WebGL context loss is terminal by design.** `webglcontextlost` calls `stopSession()`, which calls `session.dispose()` and sets a one-way `stopped` flag (`src/main.ts:257-261`, `353-361`). QUAL-05 needs a real restore path that keeps simulation and save state intact.
3. **The cross-browser matrix has no engines.** The CI image bakes only Chromium, its headless shell and ffmpeg. Firefox and WebKit are absent, and headless WebGL2 under those two engines in a Linux container is unproven (Mozilla bug 1375585 is still open and reports a headless Firefox WebGL failure on Debian 12).

QUAL-01 cannot be proven as "60 fps at 1080p" inside this container. The recorded SwiftShader loaded frame is 369.4 ms (about 2.7 fps), and the planet fragment shader accounts for about 281 ms of it. The fixed-step loop advances simulated time at `fps x 5/120`, so every rendered-frame shortfall below 24 fps is also gameplay slow-motion. The defensible container proof is a deterministic budget (draw calls, triangles, noise-evaluation count) plus a documented real-GPU measurement that the owner runs on a named reference machine.

**Primary recommendation:** Land the container-verifiable items first (licence shipping, network and console guard, Phase 6 deferrals, unit and golden coverage). Run a Wave 0 browser spike to learn whether Firefox and WebKit expose WebGL2 in the container before committing to the cross-browser gate. Resolve the four blocking owner decisions (D1 source publication, D2 meaning of "Safari", D4 QUAL-01 proof method, D6 network-guard scope) before planning the waves that depend on them.

## Project Constraints (from AGENTS.md)

No `./CLAUDE.md` exists in the repository (`.claude/` contains only `worktrees/`). The project instruction file is `AGENTS.md`, and these directives bind this phase:

- Everything runs in Docker. `docker compose run --rm verify` is the only definition of done. A green host run is not evidence.
- No database and no server-side storage. Saves stay in IndexedDB.
- Project code is GPL-2.0-or-later. Oolite-derived art and config are CC BY-NC-SA 3.0. No asset is committed without a row in `ASSETS.md`, and `tests/compliance-assets.test.ts` enforces one row per `public/` file.
- The Oolite checkout at `/home/opencode/git/oolite` is read-only reference material. Do not fetch Oolite over the network or clone another copy.
- Pin base image tags. Browsers are baked into the image, never downloaded at test time. After any `package.json` or lock change run `docker compose build --no-cache` and `docker compose down --volumes`.
- `src/sim/` must not import Three.js or touch the DOM.
- Record significant decisions in `.planning/PROJECT.md` under Key Decisions.
- Use `rg`, not `grep`, on the host. Inside the `wegolite-ci` image `rg` is absent (verified this session), so container scripts must use `grep`.

## Inputs and Binding Decisions

- **No `07-CONTEXT.md` exists.** There are no user-locked decisions for this phase. The binding inputs are the Key Decisions in `.planning/PROJECT.md`. The most relevant rows are: "Accept the SwiftShader e2e cadence as a known issue" (line 89: "QUAL-01 (60 fps at 1080p, mid-range hardware) is measured separately on a real GPU in Phase 7"), "Oolite is the behavioural and data source of truth" (line 112), and the Phase 6 autosave and save-v2 rows (lines 123-126).
- **Phase 6 deferrals (owner accepted in `06-GAP-CLOSURE.md`):** WR-04 browser negative control for a throw in the destination build (`06-VERIFICATION.md` lines 19 and 27-28, "deferred to Phase 7 test-seam work, not owner-accepted"), WR-05 dead `onProfileChanged` wiring, IN-06 chart and Save/Load overlays not modal to focus or assistive tech, and UI visual debt (chart footer, contrast, typography). Source: `06-GAP-CLOSURE.md` lines 71-76, `06-REVIEW-DISPOSITION.md` frontmatter.
- **Phase 3 deferrals to Phase 7:** full context-loss recovery (`03-08-SUMMARY.md` line 140) and the real-GPU QUAL-01 measurement (`03-14-SUMMARY.md` lines 333-334).
- **Other deferred items:** KTX2/Meshopt texture compression, deferred by D-20 (`02-07-SUMMARY.md` line 258). Real static hosting and the FIDELITY document are owned by Phase 7 (`SKELETON.md` line 42).
- **SAVE-03 tolerance** remains an owner judgement (`06-VERIFICATION.md` human item 1). It is not a Phase 7 build item unless the owner asks for exact equality.

## Requirement Status (evidence)

| Req | State | Evidence in repo | Gap |
|-----|-------|------------------|-----|
| QUAL-01 | Not met (unmeasured) | 9-evaluation planet noise budget with a static gate (`src/render/shaders/planet.glsl.ts:45-49`, `tests/render/planet-budget.test.ts`). Probe publishes `calls` and `triangles` (`src/app/game-session.ts:2083-2085`). Recorded in-flight frame: 6 calls, 38,308 triangles, 369.4 ms on SwiftShader (quick 261104-oif). | No written budget in the repo. No real-GPU run. Docked and hyperspace scenes unmeasured. |
| QUAL-02 | Not met | `playwright.config.ts` has no `projects`; it uses `...devices["Desktop Chrome"]` (line 19). `Dockerfile:29` installs `chromium` only. | Firefox and WebKit absent from the image. Headless WebGL2 unproven. |
| QUAL-03 | Partial | Each step has a spec: `launch.spec.ts`, `station.spec.ts` (buys Food, autosave, reload), `hyperspace.spec.ts` (chart, countdown, arrival, reload), `save-load.spec.ts`, `docking.spec.ts`. No spec chains them. | Test hooks taint the profile and skip saves (`src/app/game-session.ts:1086-1088` autosave, `:1118` manual save), so the chain cannot use `?test=1` mutations at save-relevant steps. |
| QUAL-04 | Partial | Sim tests (`tests/sim/*.test.ts`, `tests/sim/economy/*`), save v1 to v2 migration (`tests/persistence/save.test.ts`, `save-v2.test.ts` with `migrateV1ToV2`), content goldens (`tests/golden/content/*.json`), market goldens (`tests/golden/market/{lave,leesti,zaonce}.json`). | No coverage tool (`@vitest/coverage-v8` absent from `package-lock.json`), no thresholds. The v1 save fixture is inline (`save.test.ts:69`), not a golden file. `src/persistence/idb-store.ts` has no direct unit test. `src/sim/flight/attitude.ts` and `speed.ts` have no direct importer by basename (may be covered indirectly; coverage will show). |
| QUAL-05 | Not met | `webglcontextlost` handler is terminal (`src/main.ts:353-361`). Visibility pause exists (`src/main.ts:329-335`). Keyboard clears on hidden (`src/input/keyboard.ts:435-437`). Frame clamp `MAX_FRAME_DELTA = 0.25` (`src/sim/step.ts:14`). | No `webglcontextrestored` listener. No restore state machine. No test for context loss or for a hidden-tab gap. |
| QUAL-06 | Not met | `README.md` has Commands, Content pipeline, Operational notes, Repository layout. Controls source data exists: `DEFAULT_BINDINGS` (`src/input/actions.ts:147-158`). 48 `src/` files already carry Oolite source citations (`rg -l`). | No Controls section, no fidelity section, no browser-support section, no `FIDELITY.md` (no such file). |
| QUAL-07 | Partial, blocked on publication | `NOTICE`, `LICENSE`, `ASSETS.md` exist at repo root. `compliance.test.ts` pins their content. Footer disclaimer ships: `index.html:843-848`, present in `dist/index.html`. | `dist/` has no `NOTICE`, `LICENSE` or `ASSETS.md`. No source link in the built footer. Public source repo contains no source (see Critical Finding 1). `.agents/` (nine third-party skills) and `skills-lock.json` are untracked and have no `ASSETS.md` rows. |
| QUAL-08 | Not met (no guard) | No cross-origin fetch, XHR, WebSocket or external link in `src/` or `index.html` (`rg`). Runtime loads are same-origin: GLB models reference `../textures/*.png` (`public/models/*.glb`, about 20.26 MB of PNG in `public/textures/`), and galaxy chunks g1-g7 are code-split. Console calls: `console.info` at boot (`src/app/boot.ts:105`), `console.warn` for a newer settings version (`src/settings/store.ts:61`), `console.error` on scene retire failure (`src/app/scene-manager.ts:125`, `:138`). | No request-origin guard in any spec (`rg 'page.on("request"'` in `tests/e2e` returns nothing). Existing specs assert console errors only, not warnings. |

## Critical Findings (read before planning)

1. **The public source offer is currently not honoured.** `NOTICE` section 4 reads "The complete corresponding source for every distributed build of Wegolite is available at: https://github.com/DenisBY/wegolite" (`NOTICE:67-72`). Verified this session: `git ls-remote https://github.com/DenisBY/wegolite.git` returns HEAD `df35afb11da9ba4787f0c41bd6faf947a3ed3b88` (`docs: create roadmap (7 phases)`), local `main` is 441 commits ahead of `origin/main`, and the GitHub contents API lists only `.planning` and `AGENTS.md`. `LICENSE`, `NOTICE` and `src/` return 404. PITFALLS.md line 25 states the requirement: "Publish the corresponding source for the deployed bundle ... If the repo is private, a written offer is not enough." Publishing is an owner action. This research did not push anything.
2. **The built site carries no licence documents and no source link.** `dist/` contents (observed): `index.html`, `assets/` (JS, sourcemaps), `models/`, `textures/`. The footer at `index.html:843-848` carries the non-affiliation sentence only.
3. **Context loss has no return path.** `stopSession` is one-way (`src/main.ts:257-261`). A restored context today is never used because the session is disposed and the failure surface is shown (`main.ts:358-360`).
4. **The Chromium-only image cannot run the cross-browser gate.** `docker run --rm wegolite-ci ls /ms-playwright` returned `chromium-1248`, `chromium_headless_shell-1248` and `ffmpeg-1013`. No Firefox, no WebKit.
5. **The sim slows when the frame rate falls.** `MAX_STEPS_PER_FRAME = 5` (`src/sim/step.ts:11`) caps simulated time at 41.7 ms per rendered frame. Measured sim rate equals `fps x 5/120` in every arm (`.planning/debug/e2e-message-expiry-timeout.md`, "sim rate = fps x 5/120" with 4.29 fps giving 0.179 and 1.91 to 1.96 fps giving 0.080 to 0.082). A 15-second hyperspace countdown (1,800 steps) therefore takes about 84 s of wall time solo and about 188 s with two pages competing, by arithmetic from those measured rates. At 60 fps the loop runs exactly two steps per frame.
6. **Hook-mutated sessions cannot save.** Any `?test=1` mutation sets `testTainted`, and autosave and manual Save then refuse with `saveSkipReason = "tainted"` (`src/app/game-session.ts:1086-1088`, `:1118`; PROJECT.md line 100 records that every hook mutation taints the profile and the autosave skips it). QUAL-03's save and reload steps must use IndexedDB fixtures, which is the pattern PROJECT.md line 125 describes for the dock-after-reload proof.

## Standard Stack (what exists, what to add)

### Installed and pinned (`package.json`, read this session)

| Package | Pin | Role in Phase 7 |
|---------|-----|-----------------|
| `three` | `0.187.0` | Renderer. `WebGLRenderer` owns context-restore handling (see Patterns). |
| `@playwright/test` | `1.64.1` | Browser gate. Registry lists `1.64.1` and newer `1.65.0`; do not upgrade mid-phase without need. |
| `vitest` | `5.0.5` | Unit gate. Config: `vitest.config.ts` `unit` project, includes `src/**/*.test.ts`, `tests/**/*.test.ts`, `tools/**/*.test.ts`. |
| `vite` | `8.3.5` | Build. `vite.config.ts` sets `base: "./"` (line 8), `target: "es2022"` (line 29), `sourcemap: true` (line 31). |
| `typescript` | `6.0.2` | Typecheck (two tsconfigs). |

### To add (verified this session)

| Package | Version | Purpose | Verification |
|---------|---------|---------|--------------|
| `@vitest/coverage-v8` | `5.0.5` (exact match to vitest) | QUAL-04 coverage and thresholds | `npm view @vitest/coverage-v8@5.0.5 version` returns `5.0.5`. Its `peerDependencies` are `{ vitest: '5.0.5', '@vitest/browser': '5.0.5' }`. Legitimacy seam returns **SUS, reason `too-new`**, published 2026-11-02, 61,712,508 weekly downloads, repo `git+https://github.com/vitest-dev/vitest.git`. Per the package-legitimacy rule, the planner must add a `checkpoint:human-verify` task before installing it. |
| Firefox binary | Playwright 1.64.1 build | QUAL-02 | Not an npm package. Install in the Dockerfile `ci` stage: `npx playwright install --with-deps firefox`. |
| WebKit binary | Playwright 1.64.1 build | QUAL-02 proxy for Safari | `npx playwright install --with-deps webkit`. Playwright docs: "running WebKit on Linux CI is usually the most affordable option" (CITED). This is Playwright's WebKit build, not Safari. |

### Optional (not recommended now)

| Package | Version | Use | Verification |
|---------|---------|-----|--------------|
| `fake-indexeddb` | `6.2.7` (latest) | Unit tests for `src/persistence/idb-store.ts` | Legitimacy seam returns **SUS, reason `too-new`**, published 2026-10-30. Prefer browser-only coverage first (see Owner Decision D16). |

### Alternatives considered

| Instead of | Could use | Trade-off |
|------------|-----------|-----------|
| `@vitest/coverage-v8` | `@vitest/coverage-istanbul` | Slower, and not needed for a Node-only project. Keep v8. |
| Playwright `projects` | Three separate config files | Projects share one `webServer` and one `testDir`. Use projects. |
| Playwright WebKit as Safari | Real Safari on macOS | Only real Safari exercises Apple's WebGL and storage stack. Requires owner macOS access. See D2. |

**Version verification command:** `npm view <pkg>@<ver> version` and `npm view <pkg>@<ver> peerDependencies`. The package legitimacy seam is `node ~/.claude/gsd-core/bin/gsd-tools.cjs query package-legitimacy check --ecosystem npm <pkg>`.

## Tool Inventory: installed or must add

| Need | Tool / API | Already in image or repo? | Action |
|------|-----------|---------------------------|--------|
| Frame timing harness | `tests/diag/frame-cost.spec.ts` with `playwright.diag.config.ts` | Yes (outside `verify` by design) | Reuse. Keep as diagnostic. Not a gate. |
| Draw-call and triangle budget | `probe.calls`, `probe.triangles` (`src/app/game-session.ts:2083-2085`) | Yes | Add a budget spec that asserts per scene. |
| Noise-budget gate | `tests/render/planet-budget.test.ts` | Yes | Keep. |
| Cross-browser projects | Playwright `projects` in `playwright.config.ts` | `@playwright/test` installed | Config change. |
| Firefox / WebKit binaries | `npx playwright install --with-deps firefox webkit` | **No** (`/ms-playwright` lacks them) | Dockerfile change in `ci` stage. |
| Headless WebGL2 under Firefox / WebKit | Browser engine plus Mesa or SwiftShader in the container | Unknown | Wave 0 spike. Do not assume. |
| WebGL context loss simulation | `WEBGL_lose_context` (`loseContext()`, `restoreContext()`) | Built into browsers (no install) | Use in `page.evaluate`. CITED: MDN. |
| Throttled-tab simulation | Playwright `page.clock` (`install`, `fastForward`, `runFor`, `pauseAt`) | Installed with `@playwright/test` | Use. CITED: Playwright clock docs list `requestAnimationFrame` among the faked globals. Interaction with this app's RAF loop unverified (A13). |
| Runtime network guard | Playwright `page.on("request")` (or `context.route`) | Installed | Write helper. |
| CSP | `<meta http-equiv="Content-Security-Policy">` in `index.html` | No install | Add. Header-based CSP only if the host allows (D8). |
| Licence audit | Node script or Vitest test over `dist/` and the repo | No install | Write. Do not add a licence scanner. |
| Bundle size | `node:zlib` gzip | Built into Node 24 | Use in a budget test. |
| Coverage | `@vitest/coverage-v8@5.0.5` | **No** (not in lock) | Add with human-verify checkpoint. |

## Architecture Patterns

### Pattern 1: Ship the licence documents from the build, not from `public/`

Copy `NOTICE`, `LICENSE` and `ASSETS.md` into `dist/` with a Vite plugin. Do not copy them into `public/`, because `tests/compliance-assets.test.ts` (lines 220-223) walks `public/` and requires one `ASSETS.md` row per file. Assumed API: a Rollup-style plugin using `generateBundle` with `this.emitFile({ type: "asset", fileName, source })` (A11; verify at implementation). Add a visible footer line with links to the three documents and to the source repository. Prove it with an e2e check on the preview server, for example `page.request.get("/NOTICE")` expecting status 200 and the footer links present. `compliance.test.ts` reads the source `index.html`, not `dist/`, so the shipped check must run after build (its own header says so).

### Pattern 2: Network guard plus CSP, with a stated scope

Two layers:

- **Browser-enforced:** a CSP meta tag, for example `default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'` (A6: verify that same-origin GLB, PNG and module loads pass in Chromium, Firefox and WebKit, and that `index.html`'s inline `<style>` is covered by `'unsafe-inline'` or a hash).
- **Test-enforced:** an e2e helper attached to each core-loop page that records every request whose origin differs from `baseURL` and fails the test on any entry. Allow same-origin GETs, because the game itself loads its own GLBs, textures and chunks at runtime. Add `<link rel="icon" href="data:,">` so the browser does not request `/favicon.ico` (A10).

Console guard: collect `console` messages of type `error` and `warning`, plus `pageerror`, across the whole core loop. Today's specs check errors only. The `console.warn` for a newer settings version (`src/settings/store.ts:61`) would be caught.

### Pattern 3: Context loss as a state machine that keeps sim and save state

Current behaviour (`src/main.ts:353-361`) is terminal. A recovery design:

- `webglcontextlost`: `event.preventDefault()`; mark the session paused; stop the RAF loop; suppress autosave while lost; keep the simulation object and the profile; do not write.
- `webglcontextrestored`: rebuild the active system scene through the existing swap path (`performSwap` / `scenes.enterSystem`, `src/app/game-session.ts`, `performSwap` and `swapSystem` around lines 2805-2840, the WORLD-04 pattern) and stay paused. Resume is a player action (P or Escape), consistent with the existing focus-loss pause (D-15 in `main.ts` comments).
- If restore does not arrive or the rebuild throws, show the failure surface as today.

three.js r187 `WebGLRenderer` on `webglcontextrestored` calls `initGLContext()`, which creates fresh `extensions`, `capabilities`, `state`, `info`, `properties`, `textures`, `attributes` and `programCache` managers, and restores only `info.autoReset` and shadow settings (CITED: three.js r187 `src/renderers/WebGLRenderer.js` via WebFetch; the fetched excerpt did not show re-upload code). Whether existing `Object3D` geometry and textures re-upload lazily into the fresh caches is unverified (A1). If not, the restore path must dispose the cached GLB geometries and rebuild the scene from `AssetCache`. Dispose on a lost context should be a no-op for GL objects (A12). Test it, do not assume it.

Sketch (API shape assumed; the listener form matches the existing code at `src/main.ts:353`):

```ts
// ASSUMED shape; verify against the live session API before use.
canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  session.enterRecovery(); // pauses, stops RAF, blocks writes; keeps sim state
});
canvas.addEventListener("webglcontextrestored", () => {
  session.rebuildRenderResources(); // scene swap via existing path; stays paused
});
```

### Pattern 4: Tab throttling as a deterministic test

Keep pause-on-hidden (`src/main.ts:329-335`). Test it with `page.clock`: `install()` before navigation, switch `document.visibilityState` to hidden through the real `visibilitychange` event, `fastForward` ten simulated minutes, return to visible, and assert that `probe.flightTime` advanced by at most one frame's clamped delta and that autosave wrote nothing extra. The clamp itself is `MAX_FRAME_DELTA = 0.25` (`src/sim/step.ts:14`) with the backlog reset in `src/app/game-loop.ts` (`if (steps === MAX_STEPS_PER_FRAME) accumulator = 0`).

### Pattern 5: Cross-browser as Playwright projects, with a narrow matrix

```ts
// ASSUMED shape; device names must be confirmed in the installed playwright-core.
projects: [
  { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  { name: "firefox", use: { ...devices["Desktop Firefox"] }, testMatch: /core-loop\.spec\.ts/ },
  { name: "webkit", use: { ...devices["Desktop Safari"] }, testMatch: /core-loop\.spec\.ts/ },
],
```

Keep the existing `baseURL`, `webServer`, `trace: "off"` and `screenshot: "off"` settings (`playwright.config.ts`). Run the full 76-test suite on Chromium only. Run the core-loop spec on Firefox and WebKit. If headless WebGL2 fails in either engine, the fallback is a headed run under `xvfb-run` (adds the `xvfb` package), a documented manual run, or dropping that engine from the claim (D2, D15). Firefox may need `firefoxUserPrefs: { "webgl.force-enabled": true }` (A5, unverified).

### Pattern 6: Journey spec (QUAL-03) with fixtures for the save-relevant dock step

One spec, `tests/e2e/core-loop.spec.ts`, in a single-worker project with `test.setTimeout(900_000)`:

1. Title: `startNewGame(page)` (`tests/e2e/helpers/title.ts`).
2. Launch (`launch` action, `Digit1` or `F1`, `src/input/actions.ts`).
3. Trade: `Digit8` opens the market, then buy Food as `station.spec.ts` does, with autosave verified by reading IndexedDB via `readRaw` (`tests/e2e/helpers/save-store.ts`).
4. Hyperspace: chart `F6`, select Leesti, `KeyH` (`hyperspace` action), 15-second countdown, arrival autosave (PROJECT.md line 126).
5. Dock: write a rewritten in-flight blob with the dock-mouth pose through `writeRaw`, reload, and dock without `?test=1` (PROJECT.md line 125 describes this as the Phase 6 pattern; `tests/helpers/dock-pose.ts` provides the aligned pose).
6. Save: F2 Save/Load, then reload, then assert the restored credits, cargo, market and pose.

Wall-time estimate (arithmetic from measured sim rates): each 15-second countdown takes about 84 s solo and about 188 s with two pages competing. Plan for 10 to 15 minutes end to end on SwiftShader.

### Pattern 7: Budget gates, not a 60 fps assertion, in the container

- **In `verify` (deterministic):** per-scene assertions on `probe.calls <= 50` and `probe.triangles <= 250000`. Those numbers are the STACK.md targets (`.planning/research/STACK.md` lines 442-443: "Draw calls | <= 50", "Triangles | <= 250k"), which are research targets, not measured values. The measured Lave flight scene is 6 calls and 38,308 triangles (quick 261104-oif §4). The planet is 36,480 triangles (`SURFACE_SEGMENTS = 192`, `RING_SEGMENTS = 96` at `src/render/bodies/planet.ts:42-43`, a `SphereGeometry`; the count follows from the three.js sphere construction, and the measured 38,308 minus 1,828 equals 36,480). Add a noise-evaluation gate (already present).
- **Outside `verify` (manual, owner-run):** a real-GPU protocol in `docs/PERFORMANCE.md`: named reference machine, OS, GPU driver, browser version, viewport 1920x1080 at device pixel ratio 1, scenarios (launch, flight, docked, hyperspace arrival), and recorded frame-time distribution. The existing `tests/diag/frame-cost.spec.ts` can supply the sampler, but it runs against SwiftShader here.

### Pattern 8: FIDELITY.md as a table with a consistency test

Columns: mechanic, Wegolite file and line, Oolite file and line (Oolite commit `7437f22`, `third_party/oolite/pin.json`), divergence, and the date verified. A docs contract test checks that each Wegolite path exists. Oolite `.m` sources are not vendored (only `Resources/Config`, `Resources/Models`, `Resources/Textures` are in `third_party/oolite/`), so Oolite citations cannot be checked inside the container. Check them against `/home/opencode/git/oolite` on the host, or vendor excerpts (D10). Oolite's code licence is GPL 2 or later (`/home/opencode/git/oolite/LICENSE.md` lines 5 and 17-19), and its artwork and config are CC BY-NC-SA 3.0, so short code excerpts can be vendored under GPL with attribution.

### Pattern 9: README controls generated from the default bindings

Controls table rows come from `DEFAULT_BINDINGS` (`src/input/actions.ts:147-158`), for example `pitchForward: ["ArrowUp"]`, `speedUp: ["KeyW"]`, `torus: ["KeyJ"]`, `pause: ["KeyP", "Escape"]`, `launch: ["Digit1", "F1"]`, `dockingComputer: ["KeyC"]`, `chart: ["F6"]`, `hyperspace: ["KeyH"]`. A contract test asserts that the README mentions each default code. Shift-chord actions (`dockingComputer` with Shift, per the comment at `src/input/actions.ts:253`) need explicit wording.

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Coverage | Your own instrumenter | `@vitest/coverage-v8@5.0.5` | Vitest's provider is the matched version. |
| Multi-browser runs | Shell loops over browsers | Playwright `projects` | Shares webServer, reporting, retries and filtering. |
| Context loss | Editing the canvas or killing the GPU | `WEBGL_lose_context.loseContext()` and `restoreContext()` | Standard, deterministic, available in every target engine. |
| Background-tab timing | `setTimeout` hacks | Playwright `page.clock` | Controls the faked time sources, including RAF. |
| Runtime network enforcement | Hand-written fetch wrappers | CSP plus a request listener | Enforced by the browser and observable in tests. |
| Licence checks | A new licence scanner | The existing `compliance.test.ts` and `compliance-assets.test.ts`, plus one dist test | Already pins the content and the one-row-per-file rule. |
| Frame budgeting | A custom profiler in `src/` | `renderer.info.render` via the existing probe | Three's counters are authoritative and already published. |

**Key insight:** The one thing no tool here can prove is real-GPU frame rate. Everything else (budgets, restore behaviour, network silence, licence presence) is deterministic and belongs in the container.

## Common Pitfalls

### Pitfall 1: Calling 60 fps a container test
**What goes wrong:** A gate that asserts frame time fails on SwiftShader (369.4 ms loaded) and any threshold tuned to it proves nothing about real hardware.
**Why it happens:** The only GL in the container is software rasterisation (`unmaskedRenderer` in quick 261104-oif reads "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device ...))").
**How to avoid:** Container gates assert budgets (calls, triangles, noise evaluations). The 60 fps claim comes from a documented real-GPU run (D4).
**Warning signs:** Assertions on `performance.now()` deltas inside `tests/e2e`.

### Pitfall 2: Simulated time slows below 24 fps
**What goes wrong:** On a slow machine the hyperspace countdown, message expiry and dock timers all run slow.
**Why it happens:** `MAX_STEPS_PER_FRAME = 5` (`src/sim/step.ts:11`) at `DT = 1 / 120` (line 8) caps simulated time at 41.7 ms per rendered frame.
**How to avoid:** Treat 24 fps as the functional floor. QUAL-01's value is gameplay speed, not only smoothness. Report the sim rate in the performance record.

### Pitfall 3: Test hooks taint the save path
**What goes wrong:** A journey test that teleports or grants credits with `?test=1` passes its steps but silently never saves.
**Why it happens:** `testTainted` makes autosave and manual Save return `tainted` (`src/app/game-session.ts:1086-1088`, `:1118`).
**How to avoid:** Inject saves as IndexedDB blobs (`writeRaw`, `readRaw`) for the save-relevant steps.

### Pitfall 4: Headless Firefox WebGL2
**What goes wrong:** `canvas.getContext("webgl2")` returns null in headless Firefox, and the app shows the WebGL2 fallback, so the Firefox project fails for an environment reason.
**Why it happens:** Mozilla bug 1375585 ("Support WebGL in headless mode") is open (status NEW, last updated about five months ago). Its comment 43 reports "headless Firefox 120 on Debian 12 still failed with a GFX1- error" (CITED: WebFetch of the bug page). This image is Debian 12 (`node:24-bookworm-slim`, `Dockerfile:7`), which Playwright lists as supported (CITED: intro page).
**How to avoid:** Wave 0 spike. Measure before committing (A3).

### Pitfall 5: WebKit on Linux is not Safari
**What goes wrong:** A green "Safari" project is taken as evidence about Apple's WebGL2 stack, storage and performance.
**Why it happens:** Playwright's WebKit is a separate build. Playwright itself calls WebKit on Linux CI "the most affordable option" (CITED).
**How to avoid:** Name the project "webkit (Playwright)" in docs, and record a manual Safari smoke run on macOS if the owner can supply one (D2).

### Pitfall 6: The release title is coupled to a smoke test
**What goes wrong:** Changing the title breaks `scripts/smoke-preview.sh` and the contract test.
**Why it happens:** The literal string "foundation build" appears in four places: `index.html:6` (`<title>Wegolite — foundation build</title>`), `index.html:624` (`<div id="title">Wegolite — foundation build</div>`), `scripts/smoke-preview.sh:33` (`grep -q 'foundation build'`), and `tests/contract/container-contract.test.ts:218` and `:229`.
**How to avoid:** Change all four together (D9). The compliance test forbids "elite" and "oolite" in `<title>` (`tests/compliance.test.ts` lines 161-170), so keep the new title brand-clean.

### Pitfall 7: Copying licence files into `public/`
**What goes wrong:** `compliance-assets.test.ts` demands an `ASSETS.md` row for every `public/` file, so `LICENSE` and `NOTICE` (not assets) fail the gate.
**How to avoid:** Use the build-time copy in Pattern 1.

### Pitfall 8: Publishing the repo without an audit
**What goes wrong:** Publishing `.agents/` puts third-party skill files in a GPL repo with no licence record. `skills-lock.json` lists nine GitHub sources (for example `currents-dev/playwright-best-practices-skill` and `backnotprop/pstack`). Those skills are not in `ASSETS.md`.
**Why it happens:** `.agents/` and `skills-lock.json` are untracked (`git status`), and `.planning/` is a candidate for publication.
**How to avoid:** Before publishing, decide what goes public (D1). Either add `.agents/` and `skills-lock.json` to `.gitignore`, or record each skill's licence in `ASSETS.md`. Check `.env` is not committed (`.gitignore` lists `.env`).

### Pitfall 9: Restore that writes a half-state
**What goes wrong:** A save written while the context is lost captures a scene-less or paused-mid-transition session.
**Why it happens:** Autosave is event-driven (launch, dock, arrival). Events can fire during recovery.
**How to avoid:** Block `autosave()` and `manualSave()` while in recovery. Add a test that the save bytes are unchanged across a loss and restore.

### Pitfall 10: `logarithmicDepthBuffer` cost and cross-engine depth
**What goes wrong:** Depth behaviour or performance differs across engines and GPUs.
**Why it happens:** `logarithmicDepthBuffer: true` (`src/app/boot.ts:56`) writes depth in the fragment shader. The `03-*` research already flagged log depth versus two-pass on Safari as an open question. Writing `gl_FragDepth` typically disables early depth culling on many GPUs (A8, general GPU knowledge, unmeasured here).
**How to avoid:** Measure on the reference GPU in the D4 run. Do not change depth strategy without evidence.

### Pitfall 11: Journey runtime and the verify chain
**What goes wrong:** Adding Firefox and WebKit to `verify` roughly triples e2e wall time. The current Chromium suite already takes 18.6 minutes for 76 tests (`06-VERIFICATION.md`).
**How to avoid:** Keep the full suite on Chromium in `verify`. Put the core-loop spec on the other engines in a separate service or a documented command (D15).

### Pitfall 12: Oolite citations that cannot be checked in CI
**What goes wrong:** FIDELITY.md cites `src/Core/...` `.m` lines that CI cannot open.
**Why it happens:** Only the Config, Models and Textures subset is vendored (`third_party/oolite/`).
**How to avoid:** D10.

### Pitfall 13: `rg` missing in the container
**What goes wrong:** A container script that uses `rg` exits with "not found" and, if it swallows the status, reports a false negative. The quick task hit this already.
**How to avoid:** Use `grep` in container scripts. Verified this session: `sh: 1: rg: not found` in `wegolite-ci`.

### Pitfall 14: Public source that is not the built source
**What goes wrong:** The offer points at a commit that does not match the deployed bundle.
**How to avoid:** Record the commit hash in the shipped footer or in `NOTICE`, and publish from the commit the build used.

## Code Examples

### Existing context-loss handler (verbatim, to be replaced)
```ts
// Source: src/main.ts:351-361 (read this session)
  // T-3-19: a lost context stops the loop and says so in plain text. Full
  // restoration is Phase 7's QUAL-05; this phase does not claim it.
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    lifecycle.abort();
    focusController.abort();
    stopSession();
    const reason = "The WebGL2 context was lost.";
    showBootFailure(`${reason} Reload the page to restart Wegolite.`);
    publishFailure(reason);
  });
```

### Existing visibility pause (verbatim)
```ts
// Source: src/main.ts:329-335 (read this session)
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "hidden") session.pause();
    },
    focusOptions,
  );
```

### Existing renderer creation (verbatim, relevant options)
```ts
// Source: src/app/boot.ts:50-57 (read this session)
    return new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      stencil: false,
      powerPreference: "high-performance",
      // Never combine with reversedDepthBuffer: r187 silently disables log depth.
      logarithmicDepthBuffer: true,
    });
```

### Existing DPR cap (verbatim)
```ts
// Source: src/app/boot.ts:85 (read this session)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
```

### Network guard helper (ASSUMED shape)
```ts
// ASSUMED: Playwright request event; verify origin semantics in the container.
export function watchNetwork(page: Page, origin: string): string[] {
  const offending: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol === "data:" || url.protocol === "blob:") return;
    if (url.origin !== origin) offending.push(request.url());
  });
  return offending;
}
```

### Compliance file copy at build (ASSUMED API)
```ts
// ASSUMED: Rollup plugin hook used by Vite; verify against the installed vite 8.3.5 types.
import { readFileSync } from "node:fs";
export function shipComplianceDocs(): Plugin {
  return {
    name: "wegolite-compliance-docs",
    generateBundle() {
      for (const name of ["NOTICE", "LICENSE", "ASSETS.md"]) {
        this.emitFile({ type: "asset", fileName: name, source: readFileSync(name) });
      }
    },
  };
}
```

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json` (the key is present and set to true). Include this section.

### Test Framework

| Property | Value |
|----------|-------|
| Unit | Vitest `5.0.5`, project `unit`, node environment (`vitest.config.ts` lines 10-24) |
| E2E | Playwright `1.64.1`, `testDir: ./tests/e2e`, `workers: 2`, `retries: 0` (`playwright.config.ts` lines 7-11) |
| Config files | `vitest.config.ts`, `playwright.config.ts`, `playwright.diag.config.ts` (diagnostic, not in `verify`) |
| Quick unit run | `docker compose run --rm test npx vitest run <file>` |
| Targeted e2e run | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test <spec>"` |
| Full gate | `docker compose run --rm verify` |

### Phase Requirements to Test Map

| Req | Behaviour | Test type | Command | File status |
|-----|-----------|-----------|---------|-------------|
| QUAL-01 | Calls and triangles within budget per scene (launch, flight, docked, hyperspace) | e2e | `npx playwright test tests/e2e/budget.spec.ts` | Missing (Wave 0) |
| QUAL-01 | Planet noise evaluations within budget | unit | `npx vitest run tests/render/planet-budget.test.ts` | Exists |
| QUAL-01 | 60 fps at 1920x1080 on reference GPU | manual | `docs/PERFORMANCE.md` procedure | Manual-only: no GPU in the container, so no automated proof is possible |
| QUAL-02 | Core loop on Firefox and WebKit | e2e | `npx playwright test --project=firefox tests/e2e/core-loop.spec.ts` | Missing (Wave 0 plus browser install) |
| QUAL-03 | New game to launch to trade to hyperspace to dock to save and reload | e2e | `npx playwright test tests/e2e/core-loop.spec.ts` | Missing |
| QUAL-04 | Coverage thresholds on `src/sim`, `src/persistence`, `src/content` | unit with coverage | `npx vitest run --coverage` | Missing (dependency and thresholds) |
| QUAL-04 | v1 golden save migrates to v2 byte-for-byte | unit | `npx vitest run tests/persistence/save-v2.test.ts` | Partial: inline fixture; golden file missing |
| QUAL-04 | Hyperspace fixtures (Lave to Diso, Lave to Zaonce) as golden data | unit | `npx vitest run tests/sim/hyperspace.test.ts` | Partial: inline fixtures |
| QUAL-05 | Context loss and restore keep sim state and save bytes | e2e | `npx playwright test tests/e2e/context-loss.spec.ts` | Missing |
| QUAL-05 | Hidden tab does not catch up simulated time or write a save | e2e | `npx playwright test tests/e2e/throttle.spec.ts` | Missing |
| QUAL-06 | README contains build, run, test, controls, browser support and fidelity pointer | contract | `npx vitest run tests/contract/docs.test.ts` | Missing |
| QUAL-06 | `FIDELITY.md` rows cite existing Wegolite paths | contract | same | Missing |
| QUAL-07 | Source-tree licence pins | unit | `npx vitest run tests/compliance.test.ts` | Exists |
| QUAL-07 | `NOTICE`, `LICENSE`, `ASSETS.md` and source link served by preview | e2e | `npx playwright test tests/e2e/compliance-shipped.spec.ts` | Missing |
| QUAL-08 | Zero cross-origin requests during the core loop | e2e | `npx playwright test tests/e2e/network-guard.spec.ts` | Missing |
| QUAL-08 | Zero console errors and warnings during the core loop | e2e | same | Partial: errors only, in 16 spec files |
| Phase 6 WR-04 | Destination-build throw leaves origin scene live, sim paused, failure copy visible | e2e | `npx playwright test tests/e2e/hyperspace.spec.ts` (new case) | Missing (needs a seam, D11) |

### Sampling Rate

- **Per task commit:** the single affected Vitest file.
- **Per wave merge:** the wave's Playwright spec on Chromium.
- **Phase gate:** `docker compose run --rm verify` green, plus the cross-browser core-loop command and the owner's manual performance sign-off.

### Wave 0 Gaps

- [ ] `tests/e2e/core-loop.spec.ts` (QUAL-03, QUAL-02 target).
- [ ] `tests/e2e/budget.spec.ts` (QUAL-01 per-scene assertions).
- [ ] `tests/e2e/context-loss.spec.ts` and `tests/e2e/throttle.spec.ts` (QUAL-05).
- [ ] `tests/e2e/network-guard.spec.ts` and `tests/e2e/compliance-shipped.spec.ts` (QUAL-07, QUAL-08).
- [ ] `tests/contract/docs.test.ts` (QUAL-06).
- [ ] `tests/golden/save/` with a checked-in v1 blob and its expected v2 (QUAL-04).
- [ ] Coverage thresholds in `vitest.config.ts` (after the dependency is installed).
- [ ] Dockerfile `ci` stage: `npx playwright install --with-deps firefox webkit` (after the Wave 0 spike).

## Security Domain

> `security_enforcement` is `true` (absent-from-config means enabled), `security_asvs_level` is `1`, and `security_block_on` is `high`.

### Applicable ASVS Categories (Level 1)

| ASVS | Applies | Standard control |
|------|---------|------------------|
| V5 Input validation | Yes | Existing strict save and settings schemas (`src/persistence/save.ts`, `src/settings/schema.ts`). Keep; do not loosen for the migration golden. |
| V8 Data protection | Yes | IndexedDB saves are local and contain no personal data. No change. |
| V9 Communication | Yes | Static site with no runtime network. Enforce with CSP and the request guard (QUAL-08). |
| V14 Configuration | Yes | Build config: `sourcemap: true` (`vite.config.ts:31`) is an accepted GPL-posture decision (T-01-12). Chromium runs with sandbox off as root in the container (`Dockerfile:25-28`, T-01-02, scoped to localhost content). |
| V6 Cryptography | No | None used. |

### Known Threat Patterns

| Pattern | STRIDE | Mitigation |
|---------|--------|------------|
| Secrets or private files published with the source | Information disclosure | Pre-publish audit (D1, Pitfall 8). `.env` stays ignored. |
| Third-party code shipped without licence record | Repudiation (licence) | Record licences for `.agents/` skills or exclude them (Pitfall 8). |
| Save written during context loss captures half-state | Tampering (save integrity) | Block writes during recovery (Pitfall 9). |
| New dependency compromise | Tampering (supply chain) | Human-verify `@vitest/coverage-v8` (legitimacy SUS). Pin exact version. |
| Trademark string reintroduced in title or shipped text | Spoofing (product identity) | Existing compliance test; keep the new title brand-clean. |
| Runtime call to a third-party origin | Information disclosure | CSP `connect-src 'self'` plus the request guard (Pattern 2). |

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Docker Engine | All container gates | Yes (sandbox) | 29.7.2 | None needed |
| `wegolite-ci` image | `test`, `e2e`, `verify` | Yes (local, created 4 days ago) | Node v24.22.2 (in image) | Rebuild after dependency changes |
| Chromium in image | `e2e` | Yes | `chromium-1248` (+ headless shell) | None needed |
| Firefox in image | QUAL-02 | **No** | - | Install in Dockerfile |
| WebKit in image | QUAL-02 | **No** | - | Install in Dockerfile |
| ffmpeg in image | Not needed | Yes (`ffmpeg-1013`, from Playwright) | - | - |
| `rg` in image | Container scripts | **No** (`sh: 1: rg: not found`) | - | Use `grep` |
| `@vitest/coverage-v8` | QUAL-04 | **No** (not in lock) | Would be `5.0.5` | Add with checkpoint |
| Host Node | Research only | Yes (v26.10.0) | - | Not authoritative for gates |
| Host `gh` CLI | Publication step | **No** (`gh: command not found`) | - | Use the GitHub web UI or `git push` |
| GitHub remote read | D1 verification | Yes (`git ls-remote` and HTTPS API) | - | - |
| npm registry read | Version checks | Yes (`npm view`) | - | - |
| Real GPU | QUAL-01 proof | **No** (none in container) | - | Owner's reference machine |
| Real Safari | QUAL-02 claim | **No** | - | Owner's macOS, or drop claim (D2) |

**Missing dependencies with no fallback:** a real GPU and a real Safari, both needed for the claims as worded in ROADMAP Phase 7 success criteria. These need owner action or wording change.

**Missing dependencies with fallback:** Firefox and WebKit (install in Dockerfile); coverage (add package with checkpoint).

## Owner Decisions

Decisions are listed in order of how much they block. Recommended defaults are given so the planner can proceed where the owner declines to decide.

**D1 (blocking, QUAL-07): publish the source.** Push local `main` to `DenisBY/wegolite` after an audit (Pitfall 8, Pitfall 14), or move the NOTICE offer to a repository that holds the source. *Recommendation:* publish, after the audit. This research did not push anything.

**D2 (blocking, QUAL-02): what "Safari" means.** (a) Playwright WebKit on Linux in CI, plus an owner-run manual smoke on macOS Safari; (b) drop Safari from the claim. *Recommendation:* (a), with the README stating exactly what was tested.

**D3 (QUAL-02): minimum browser versions.** Not set anywhere in the repo. The build target `es2022` (`vite.config.ts:29`) suggests Safari 15.4 or later, an inference not checked against the esbuild target table (A14). *Recommendation:* state "current stable Chrome and Firefox, and the two most recent Safari major versions", and record it in the README.

**D4 (blocking, QUAL-01): proof method.** (a) container budgets (calls, triangles, noise evaluations) plus (b) a manual real-GPU run on a named reference machine. *Recommendation:* both. Name the machine, the GPU, the browser build, 1920x1080 at DPR 1, and the pass criterion (for example a frame-time distribution, not only a mean, per scenario).

**D5 (QUAL-01): planet shader cost.** The loaded frame is planet-bound (about 281 ms of 369 ms on SwiftShader, quick 261104-oif). Options: keep the nine-evaluation budget and measure first; pursue a real fix (for example precomputed noise or a lower-cost surface model), which changes the look and needs sign-off; or change `antialias` (measured to cost about 135 ms in SwiftShader). *Recommendation:* measure on the reference GPU before changing the look. The Phase 3 known issue (G-03-3) belongs to this decision.

**D6 (blocking, QUAL-08): scope of "no runtime network calls".** Same-origin static loads (GLBs, textures, galaxy chunks) are required by the architecture; inlining about 20 MB of PNG and about 1.2 MB of GLB into JavaScript is impractical. *Recommendation:* forbid any request to another origin, and allow same-origin static GETs. Record this interpretation in PROJECT.md.

**D7 (QUAL-05): recovery policy.** *Recommendation:* rebuild render resources, stay paused, and let the player resume with P or Escape. Set a restore timeout after which the failure surface shows. The timeout value is the owner's.

**D8 (QUAL-07, QUAL-08): hosting and CSP method.** The host decides whether CSP can be a response header or must be a meta tag. *Recommendation:* a meta tag now (works on any static host) and a header later if the host supports it. Where the site will be hosted is an owner question.

**D9 (QUAL-07): release title.** "foundation build" is a development string in four coupled places (Pitfall 6). *Recommendation:* "Wegolite" with the package version (`package.json` version `0.1.0`), updating all four sites together.

**D10 (QUAL-06): Oolite excerpts for FIDELITY.md.** (a) vendor short quoted `.m` excerpts with line references, so citations are checkable in CI; (b) keep manual checking against the host checkout. *Recommendation:* (a), recorded in `ASSETS.md` under GPL-2.0-or-later for code excerpts, with the Oolite attribution.

**D11 (Phase 6 WR-04): test seam form.** Options: a constructor option consumed only by tests, or a `?test=1` URL hook. *Recommendation:* the constructor option, so no URL-reachable failure injection ships. Note the existing `?test=1` seam is for state mutation only (`src/app/game-session.ts:2749-2753`).

**D12 (QUAL-04): coverage thresholds and the SUS dependency.** Thresholds on which globs and at what level? Accept `@vitest/coverage-v8@5.0.5` after the human check (legitimacy SUS, too new). *Recommendation:* thresholds on `src/sim/**`, `src/persistence/**`, `src/content/**` set from the first measured baseline, not invented numbers.

**D13 (QUAL-03): journey fixture.** May the journey use an IndexedDB pose blob (no `?test=1`) for the dock step? *Recommendation:* yes, matching the Phase 6 pattern in PROJECT.md line 125.

**D14 (performance): texture compression and load budget.** The verbatim PNG set is about 20.26 MB (`du -cb`). KTX2 and Meshopt were deferred to Phase 7 (D-20). *Recommendation:* measure first-load time on the reference machine and defer compression unless a stated budget fails.

**D15 (QUAL-02): cross-browser gate placement.** In `verify` (slower) or a separate service or command. *Recommendation:* separate service, `e2e-cross`, plus a documented command, so `verify` stays Chromium-only.

**D16 (QUAL-04): IndexedDB unit testing.** Add `fake-indexeddb` (SUS, too new) or cover `idb-store.ts` in the browser only. *Recommendation:* browser-only for now.

## Recommended Ordering of Work

Dependencies are noted. "Blocked" items wait on the owner decision listed.

| Wave | Work | Requirements | Depends on |
|------|------|--------------|------------|
| 0 | Browser spike in the container: can Firefox and WebKit create a WebGL2 context under Playwright? Baseline draw calls and triangles for docked and hyperspace scenes via the existing probe. Owner decisions D1, D2, D4, D6. | QUAL-01, QUAL-02 | Owner input |
| 1 | Release shell and licence shipping: build plugin copies `NOTICE`, `LICENSE`, `ASSETS.md`; footer links; title change in four places (D9); favicon link; CSP meta (D8); dist test. | QUAL-07 | D1 for the source link, D9 for the title |
| 2 | Network and console guard across the core loop; fix any warnings found. | QUAL-08 | D6 |
| 3 | Context-loss state machine and tab-throttle test; save-bytes invariant across loss. | QUAL-05 | D7 |
| 4 | Phase 6 deferrals: WR-04 injection seam and browser negative control; delete WR-05 dead wiring; IN-06 `inert` and `aria-modal` on the chart and Save/Load overlays; UI visual debt list agreed with owner. | Phase 6 deferrals | D11 |
| 5 | Coverage tool and thresholds; v1 golden save file; hyperspace golden data moved out of inline fixtures; direct tests for `attitude.ts` and `speed.ts` if coverage shows gaps. | QUAL-04 | D12 (human check on the package) |
| 6 | Cross-browser: Dockerfile installs Firefox and WebKit; `playwright.config.ts` projects; core-loop spec on each engine. Rebuild with `--no-cache` and `docker compose down --volumes`. | QUAL-02 | Wave 0 result; D2, D3, D15 |
| 7 | Journey spec: single worker, IndexedDB pose blob for dock, `test.setTimeout` near 900 s. | QUAL-03 | D13 |
| 8 | Performance: per-scene budget spec in the container; `docs/PERFORMANCE.md`; planet shader decision; owner runs the reference-GPU protocol and records numbers. | QUAL-01 | D4, D5, D14 |
| 9 | Documentation: README sections (controls from `DEFAULT_BINDINGS`, browser support, fidelity pointer, WebGL2 and context-loss troubleshooting, licence and source offer); `FIDELITY.md`; docs contract test. | QUAL-06 | D10 |
| 10 | Release gate: full `verify`, cross-browser command, dist compliance check, PROJECT.md decisions recorded, owner sign-off, publication (owner action). | All | Waves 0-9 |

Waves 1 to 5 do not depend on the browser engines and can run while the Wave 0 spike is in progress.

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 | three.js re-creates GPU resources lazily after `webglcontextrestored`, so existing geometry and textures re-upload without app code | Patterns 3 | Restore shows a blank scene; the rebuild path must dispose and recreate cached GLBs |
| A2 | `WEBGL_lose_context` in headless Chromium fires `webglcontextlost` and `webglcontextrestored` in the expected order | Patterns 3, Validation | Context-loss test is wrong; use a different trigger |
| A3 | Headless Firefox in the container can create a WebGL2 context under Playwright | Pitfall 4, Wave 0 | Firefox project cannot run; fall back per D2 and D15 |
| A4 | Playwright WebKit on Linux exposes WebGL2 in the container | Pattern 5, Wave 0 | WebKit project cannot run; fall back per D2 |
| A5 | Firefox may need `webgl.force-enabled` to run WebGL headless | Pattern 5 | Extra config; remove if unnecessary |
| A6 | A CSP meta tag with `connect-src 'self'` does not block same-origin module, GLB or PNG loads in any target engine; `'unsafe-inline'` covers the inline style | Pattern 2 | CSP breaks the boot; adjust directives |
| A7 | The Lave flight scene on a mid-range GPU at 1080p meets the 16.7 ms budget | Pitfall 1, D4 | Frame rate target fails on reference hardware; this is the thing the manual run measures |
| A8 | `logarithmicDepthBuffer` reduces early depth culling on some GPUs | Pitfall 10 | Performance regression is undetected without the D4 run |
| A9 | Adding Firefox and WebKit to the image adds a few hundred MB | Environment, Wave 6 | Image size and build time larger than expected |
| A10 | Playwright does not report a favicon request as a page request | Pattern 2 | Guard fails on `/favicon.ico` (mitigated by the icon link) |
| A11 | A Vite plugin using `generateBundle` and `emitFile` copies the three documents into `dist/` | Pattern 1 | Different API shape; verify against installed Vite 8.3.5 types |
| A12 | Disposing GPU objects while the context is lost produces no errors | Pattern 3 | Console errors during recovery; guard the dispose path |
| A13 | `page.clock` faking RAF interacts with the app's RAF loop as the docs suggest | Pattern 4 | Throttle test needs a different driver |
| A14 | The ES2022 build target implies Safari 15.4 or later | D3 | Minimum version statement is wrong |

## Open Questions

1. **Hosting target.** Which static host, and will it allow response headers? (D8). Affects CSP and the source link.
2. **Reference machine.** Which mid-range desktop GPU and CPU will the owner use for the D4 run? Without it, QUAL-01 has no measured value.
3. **Real Safari access.** Does the owner have a macOS machine for the manual Safari smoke? (D2).
4. **Restore timeout and recovery copy.** The owner's wording and timeout for D7.
5. **Source repository state.** Does the owner want `.planning/` published? It is currently tracked and public on the remote (`.planning` appears in the public contents listing). (D1).

## Sources

### Primary (in-repo, read or measured this session)
- `AGENTS.md` (project constraints, read via the system-provided copy).
- `.planning/ROADMAP.md` (Phase 7 goal and success criteria), `.planning/REQUIREMENTS.md` (QUAL-01 to QUAL-08), `.planning/PROJECT.md` (Key Decisions, lines 89, 100, 112, 123-126, 134-139).
- `.planning/phases/06-hyperspace-navigation-persistence/06-VERIFICATION.md` (gate evidence, human items, deferrals), `06-REVIEW-DISPOSITION.md`, `06-GAP-CLOSURE.md` lines 71-76.
- `.planning/phases/03-flight-in-the-lave-system/03-08-SUMMARY.md` line 140, `03-14-SUMMARY.md` lines 333-334.
- `.planning/phases/02-data-pipeline-content-compiler/02-07-SUMMARY.md` line 258.
- `.planning/phases/01-foundation-containers-compliance/SKELETON.md` line 42.
- `.planning/quick/261104-oif-diagnose-the-loaded-per-frame-render-cos/261104-oif-SUMMARY.md` (frame-cost arms, GL readout, triangles).
- `.planning/debug/e2e-message-expiry-timeout.md` (sim rate equals `fps x 5/120`).
- `.planning/research/STACK.md` lines 433-443 (research budget targets), `.planning/research/PITFALLS.md` lines 25, 352-362.
- Code: `src/main.ts` (lines 255-265, 326-361), `src/sim/step.ts` (lines 1-25), `src/app/boot.ts` (lines 44-91), `src/render/shaders/planet.glsl.ts` (lines 40-53), `src/render/bodies/planet.ts` (lines 40-44), `src/input/actions.ts` (lines 147-158), `src/app/game-session.ts` (lines 1072-1080, 2746-2755), `src/settings/store.ts`, `src/persistence/*`.
- Config: `package.json` (read), `playwright.config.ts` (read), `vitest.config.ts` (read), `vite.config.ts` (read), `Dockerfile` (read), `compose.yaml` (read), `index.html` (lines 4-6, 621-625, 840-851), `NOTICE` (lines 58-72), `scripts/smoke-preview.sh` (lines 30-35), `tests/contract/container-contract.test.ts` (lines 207-230), `tests/compliance-assets.test.ts` (lines 218-223), `tests/diag/frame-cost.spec.ts` (read).
- Oolite checkout: `/home/opencode/git/oolite/LICENSE.md` (lines 1-30, read).
- Filesystem and image observations: `ls dist`, `du -cb public/textures`, `node` parse of `public/models/*.glb` (triangle counts, image URIs), `docker run --rm wegolite-ci ls /ms-playwright`, `docker image ls`.

### Registry and remote checks (this session)
- `npm view @vitest/coverage-v8@5.0.5 version` and `peerDependencies`; `npm view @playwright/test@1.64.1 version`; `npm view @playwright/test version` (returns `1.65.0`); `npm view vitest@5.0.5 version`; `npm view fake-indexeddb version` (returns `6.2.7`).
- Package legitimacy seam: `gsd-tools.cjs query package-legitimacy check --ecosystem npm @vitest/coverage-v8` (SUS, too-new) and `fake-indexeddb` (SUS, too-new).
- `git ls-remote https://github.com/DenisBY/wegolite.git` (HEAD `df35afb`); `git rev-list --count origin/main..main` (441); GitHub contents API listing (`.planning`, `AGENTS.md`); raw `LICENSE`, `NOTICE` and `src/sim` return HTTP 404.

### Web (CITED, fetched this session)
- Playwright browsers page, `https://playwright.dev/docs/browsers`: `npx playwright install --with-deps chromium`; "running WebKit on Linux CI is usually the most affordable option".
- Playwright intro page, `https://playwright.dev/docs/intro`: Linux support "Debian 12 / 13, Ubuntu 22.04 / 24.04 / 26.04 (x86-64 or arm64)".
- Playwright clock page, `https://playwright.dev/docs/clock`: `page.clock` controls `requestAnimationFrame` and `performance`; methods `install()`, `fastForward()`, `runFor()`, `pauseAt()`.
- MDN, `https://developer.mozilla.org/en-US/docs/Web/API/WEBGL_lose_context`: `loseContext()` simulates losing the context; `restoreContext()` simulates restoring it.
- Mozilla Bugzilla 1375585, `https://bugzilla.mozilla.org/show_bug.cgi?id=1375585`: status NEW; comment 43 reports headless Firefox 120 on Debian 12 failing with a GFX1- error.
- three.js r187 `src/renderers/WebGLRenderer.js`, `https://raw.githubusercontent.com/mrdoob/three.js/r187/src/renderers/WebGLRenderer.js` (WebFetch summary; `onContextRestore` calls `initGLContext()`; the excerpt did not include re-upload code). Confirm locally when the package is installed.
- WebSearch on headless WebKit and Firefox WebGL2 under Linux containers returned no confirming results (treated as unverified, A3 and A4).

## Metadata

**Confidence breakdown:**
- In-repo state and gaps: HIGH (read or measured this session).
- Tool installation status: HIGH (verified against `package-lock.json`, the Dockerfile, and `docker run` on `wegolite-ci`).
- Package versions and legitimacy: HIGH for existence and verdict; the SUS verdicts require the planner's human-verify checkpoint.
- Browser platform behaviour (headless WebGL2 in Firefox and WebKit, Playwright clock and RAF interaction, CSP compatibility): MEDIUM to LOW until the Wave 0 spike runs.
- Real-GPU frame rate: LOW (no GPU; nothing measured).

**Research date:** 2026-11-07
**Valid until:** about 30 days for browser and Playwright claims (Playwright ships monthly, and 1.65.0 is already on the registry). The in-repo findings stay valid until the next commit that touches `src/main.ts`, `src/app/game-session.ts`, `index.html`, `NOTICE` or `package.json`.
