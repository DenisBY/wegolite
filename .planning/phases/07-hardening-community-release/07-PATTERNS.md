# Phase 7: Hardening & Community Release - Pattern Map

**Mapped:** 2026-11-07
**Files analyzed:** 27 new/modified
**Analogs found:** 24 / 27 (all analog paths verified git-tracked: `playwright.config.ts`, `vite.config.ts`, `tests/e2e/**`, `tests/helpers/**`, `tests/diag/**`, `src/**`)

Note: line numbers below were read this session from the working tree. Re-confirm before editing.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `vite.config.ts` (add compliance-docs plugin) | config/build plugin | file-I/O | `vite.config.ts` itself (no existing plugin) | partial (RESEARCH Pattern 1 snippet) |
| `index.html` (title, footer links, CSP meta, favicon) | config/markup | request-response | `index.html:6,624,843-848` | exact (self-edit) |
| `scripts/smoke-preview.sh`, `tests/contract/container-contract.test.ts` (title string) | test/script | request-response | same files, lines 33, 218, 229 | exact (self-edit) |
| `tests/e2e/compliance-shipped.spec.ts` | test (e2e) | request-response | `tests/e2e/precision.spec.ts` (loads built page via preview) + `tests/compliance.test.ts` | role-match |
| `tests/compliance.test.ts`, `tests/compliance-assets.test.ts` (extend; ASSETS.md rows for `.agents/`, `skills-lock.json`, FIDELITY excerpts) | test | batch/file scan | self (`compliance-assets.test.ts:218-223`) | exact |
| `ASSETS.md`, `NOTICE` | doc | n/a | existing rows | exact |
| `tests/e2e/network-guard.spec.ts` | test (e2e) | event-driven | `collectErrors` in `tests/e2e/hyperspace.spec.ts:46-53` / `station.spec.ts:73-79` | role-match |
| `tests/e2e/helpers/network-guard.ts` (new shared helper) | test helper | event-driven | `tests/e2e/helpers/probe.ts`, `title.ts` | role-match |
| `src/main.ts` (context-loss state machine, replaces 351-361) | controller/lifecycle | event-driven | `src/main.ts:314-361` (focus/visibility listeners) | exact (self) |
| `src/app/game-session.ts` (enterRecovery / rebuildRenderResources, block saves) | service | event-driven | `performSwap`/`swapSystem` (~2805-2840), save guards `:1083-1118` | exact (self) |
| `tests/e2e/context-loss.spec.ts` | test (e2e) | event-driven | `tests/e2e/dispose.spec.ts`, `fallback.spec.ts`, `hyperspace.spec.ts` waits | role-match |
| `tests/e2e/throttle.spec.ts` | test (e2e) | event-driven | `tests/e2e/helpers/probe.ts` + `hyperspace.spec.ts waitFrames` | partial |
| `tests/e2e/budget.spec.ts` | test (e2e) | request-response | `tests/diag/frame-cost.spec.ts` (probe `calls`/`triangles`) | role-match |
| `tests/render/planet-budget.test.ts` (keep; maybe extend) | test | transform | self | exact |
| `playwright.config.ts` (projects) | config | n/a | self | exact |
| `Dockerfile` (ci stage: firefox) / `compose.yaml` (`e2e-cross`) | config | n/a | `compose.yaml` `e2e` service, `Dockerfile:29` | exact |
| `tests/e2e/core-loop.spec.ts` | test (e2e) | request-response | `tests/e2e/station.spec.ts` + `hyperspace.spec.ts` + `save-load.spec.ts` | role-match (composite) |
| WR-04 seam: `GameSessionOptions` ctor option (`src/app/game-session.ts:222`) + `tests/e2e/hyperspace.spec.ts` new case | service/test | request-response | `GameSessionOptions` at `game-session.ts:222`, test hook at `:2749-2753` | role-match |
| `vitest.config.ts` (coverage thresholds) | config | n/a | self | exact |
| `tests/golden/save/` (v1 blob + expected v2) + test | test/golden | transform | `tests/golden/market/*.json` + `tests/persistence/save-v2.test.ts` | role-match |
| `tests/contract/docs.test.ts` | test | file scan | `tests/contract/container-contract.test.ts` | exact |
| `README.md`, `FIDELITY.md`, `docs/PERFORMANCE.md` | doc | n/a | `README.md` existing sections | role-match |
| `PROJECT.md` Key Decisions rows | doc | n/a | existing rows (lines ~89,112,123-128) | exact |
| `package.json` / lock (`@vitest/coverage-v8@5.0.5`) | config | n/a | n/a | none (human-verify checkpoint) |

## Pattern Assignments

### `vite.config.ts` plugin (build, file-I/O)

**Analog:** `vite.config.ts` has no plugin; reuse its header and `defineConfig` shape (lines 1-35, `base: "./"`, `sourcemap: true`). Use RESEARCH "Compliance file copy at build" snippet (`generateBundle` + `this.emitFile({type:"asset", fileName, source})`). Do NOT put docs in `public/` (compliance-assets rule, below). Plugin must pass `Plugin` type from `vite`. Verify A11 against vite 8.3.5 types.

### `index.html` edits

Four coupled "foundation build" sites: `index.html:6`, `:624`, `scripts/smoke-preview.sh:33`, `tests/contract/container-contract.test.ts:218,229`. Change together to `Wegolite 0.1.0`; compliance test forbids `elite`/`oolite` in `<title>`. Footer to extend (`index.html:843-848`):
```html
<footer>
  Wegolite is an unofficial fan project. Not affiliated with, endorsed by, ...
</footer>
```
Add links to `NOTICE`, `LICENSE`, `ASSETS.md`, and source repo. Head: add `<meta http-equiv="Content-Security-Policy" ...>` after `<meta charset>` and `<link rel="icon" href="data:,">`. The inline `<style>` (line 7) needs `'unsafe-inline'` or hash.

### `tests/compliance-assets.test.ts` (extend)

**Rule to respect** (lines 218-223): every `public/` file needs exactly one ASSETS.md row:
```ts
const PUBLIC_FILES = collectFiles("public").filter((file) => !file.split("/").pop()?.startsWith("."));
...
const matches = ROWS.filter((row) => row.cells[0] === file);
return matches.length === 1 ? [] : [`${file}: ${String(matches.length)} ASSETS.md rows`];
```
Header comment style (`compliance.test.ts:1-40`): SPDX header, `REPO_ROOT = process.cwd()`, `SKIP_DIRECTORIES` set (note `.planning` and harness skill dirs already skipped). New dist/shipped checks must be e2e (source tests must not read `dist/`).

### `tests/e2e/helpers/network-guard.ts` + `network-guard.spec.ts` (event-driven)

**Analog:** `collectErrors` (`hyperspace.spec.ts:46-53`):
```ts
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  return errors;
}
```
Extend to `type() === "error" || "warning"`, and add `watchNetwork` from RESEARCH (skip `data:`/`blob:`, compare `url.origin` to baseURL origin). Copy helper header style from `tests/e2e/helpers/probe.ts:1-12` (SPDX, doc comment, `import type { Page } from "@playwright/test"`). Note `collectErrors` is duplicated per spec by convention ("a spec must never import another spec"); put the new one in `helpers/`.

### `src/main.ts` context-loss state machine (event-driven)

**Analog (replace):** `src/main.ts:351-361`:
```ts
canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  lifecycle.abort(); focusController.abort(); stopSession();
  showBootFailure(`${reason} Reload the page to restart Wegolite.`);
  publishFailure(reason);
});
```
**Patterns to keep:** `AbortController` listener lifecycle (`lifecycle.signal`, `focusOptions = { signal }`, lines 314-349); idempotent `stopSession` (`:257-261`); pause on blur/visibility via `session.pause()` (`:322-335`); `renderActiveScene()` (`:263-270`) publishes `probe.calls/triangles`. New: add `webglcontextrestored` listener with same `{ signal: lifecycle.signal }`, a 10 s restore timer (D-16) that on expiry calls the existing `showBootFailure` + `publishFailure`; do not abort `lifecycle`/call `stopSession` on loss. Placeholder failure copy flagged for owner.

### `src/app/game-session.ts` recovery API + save guard

**Save guard pattern to extend** (`:1083-1094`, `:1113-1120`):
```ts
if (!canOverwrite(saveStatus)) { saveSkipReason = statusSkipReason(saveStatus); syncSaveProbe(); return; }
if (testTainted) { saveSkipReason = "tainted"; syncSaveProbe(); return; }
```
Add an equivalent `recovering` branch (skip reason e.g. `"recovering"`) in both autosave and manual save (Pitfall 9). Rebuild via existing swap path (`performSwap`/`swapSystem` ~2805-2840). Sim stays outside (no Three.js in `src/sim/`).

**WR-04 seam (D-18):** add an optional readonly field to `GameSessionOptions` (`game-session.ts:222`, which already uses optional `readonly galaxy?`), consumed only in the destination-build step. Do not read it from `URLSearchParams`; contrast with the `?test=1` hook (`:2749-2753`):
```ts
testHookEnabled = new URLSearchParams(window.location.search).get("test") === "1";
```
Test must reach the option without a URL (e.g. a build-time/test-only construction path); this is an open design point for the planner since e2e boots through `main.ts`.

### `tests/e2e/context-loss.spec.ts`, `throttle.spec.ts`, `budget.spec.ts`

**Imports/wait pattern** (`hyperspace.spec.ts:16-36`):
```ts
import { expect, test } from "@playwright/test";
import { getProbe, waitForReady } from "./helpers/probe.js";
import { readRaw } from "./helpers/save-store.js";
import { startNewGame } from "./helpers/title.js";
test.setTimeout(600_000);
async function waitForMode(page, mode) { await page.waitForFunction((expected) => { const probe = window.__wegolite; return probe !== undefined && probe.ready === true && probe.mode === expected; }, mode, { timeout: 60_000 }); }
```
Context loss: `page.evaluate` using `canvas.getContext("webgl2").getExtension("WEBGL_lose_context").loseContext()/restoreContext()`; assert `readRaw` bytes unchanged. Throttle: `page.clock.install()` before `goto`, dispatch real `visibilitychange`, `fastForward`; assert `probe.flightTime` bounded (clamp `MAX_FRAME_DELTA`, `src/sim/step.ts:14`). Budget: assert `probe.calls <= 50`, `probe.triangles <= 250000` per scene using `getProbe`; follow `tests/diag/frame-cost.spec.ts` for the launch-to-cockpit path (header lines 1-40). No `performance.now()` thresholds (Pitfall 1). Waits are probe-based; no pixels (D-08).

### `tests/e2e/core-loop.spec.ts` (composite journey)

**Compose from:** `station.spec.ts` (Digit8 market, buy Food, `waitForScreen`, `readRaw` autosave; `bootToHome` at top of file), `hyperspace.spec.ts` (chart via `chartScreenPoint`/`systemByName` from `helpers/chart.js`, `KeyH`, arrival autosave), `save-load.spec.ts` (`writeRaw` at lines 462, 635, 667; F2 overlay), `docking.spec.ts` (dock-after-reload pose; `tests/helpers/dock-pose.ts` supplies the aligned pose). `startNewGame` from `helpers/title.ts` accepts the confirm prompt. D-21: no `?test=1` at save-relevant steps. `test.setTimeout(900_000)`, single worker.

### `playwright.config.ts` projects + `compose.yaml` `e2e-cross`

**Analog:** current config (`playwright.config.ts:7-35`), spreading `...devices["Desktop Chrome"]` first inside `use`. Move to `projects: [{ name: "chromium", use: {...devices["Desktop Chrome"]} }, { name: "firefox", use: {...devices["Desktop Firefox"]}, testMatch: /core-loop\.spec\.ts/ }]` (no webkit, D-07). Keep `baseURL`, `webServer`, `trace/screenshot: "off"`, `workers: 2`. Because `verify` runs `npm run test:e2e` (all projects), the firefox project must be excluded from default runs (e.g. `e2e-cross` passes `--project=firefox` and the default script passes `--project=chromium`), otherwise verify requires Firefox. `compose.yaml` analog (`e2e` service):
```yaml
e2e:
  <<: *workspace
  ipc: host
  command: ["sh", "-lc", "npm run build && npm run test:e2e"]
```
Add `e2e-cross` the same way with a firefox command. Do not add it to `verify`'s chain (`compose.yaml` verify). `Dockerfile:29`: `RUN npx playwright install --with-deps chromium && rm -rf /var/lib/apt/lists/*` becomes `... chromium firefox`. Tests in `tests/contract/container-contract.test.ts` pin Compose services; extend them. Remember `docker compose build --no-cache` + `down --volumes`.

### `vitest.config.ts` coverage

**Analog:** current single `unit` project (lines 9-25). Add top-level `test.coverage: { provider: "v8", include: ["src/sim/**","src/persistence/**","src/content/**"], thresholds: {...} }` set from first measured baseline (D-19). Gated on human-verify of `@vitest/coverage-v8@5.0.5`.

### `tests/golden/save/` + test

**Analog:** goldens in `tests/golden/market/{lave,leesti,zaonce}.json` with generator `tests/helpers/write-market-goldens.ts`; migration test `tests/persistence/save-v2.test.ts` (`migrateV1ToV2`) and inline v1 fixture at `tests/persistence/save.test.ts:69`. Move the inline blob to a checked-in JSON file and assert byte-for-byte expected v2.

### `tests/contract/docs.test.ts` (README / FIDELITY)

**Analog:** `tests/contract/container-contract.test.ts` (`read(...)` helper then `expect(read("README.md")).toContain(...)`, e.g. lines 207-230). Import `DEFAULT_BINDINGS` from `src/input/actions.ts:147-158` and assert README mentions each code (Shift chords need explicit wording, comment at `actions.ts:~253`). FIDELITY test: each cited Wegolite path exists. Oolite excerpts are quoted in-file because `third_party/oolite/` has no `.m` sources.

## Shared Patterns

### File header
All TS files start with `// SPDX-License-Identifier: GPL-2.0-or-later` and `// Copyright (c) 2026 Wegolite contributors`, then a block comment explaining intent and requirement IDs.

### Probe-based waiting (e2e)
Source: `tests/e2e/helpers/probe.ts` (`waitForReady`, `getProbe`, `press`, `hold`). Never screenshots; generous timeouts for SwiftShader.

### Raw IndexedDB seam
Source: `tests/e2e/helpers/save-store.ts` (`readRaw`, `writeRaw`, `SAVE_DB="wegolite"`, `SAVE_STORE="saves"`, `AUTOSAVE_KEY="autosave"`). Use for save-bytes invariants and QUAL-03 fixtures.

### Test taint rule
Source: `src/app/game-session.ts:404, 911, 1087, 1117`. Any `?test=1` mutation sets `testTainted`; saves then skip with `"tainted"`.

### Docker-only commands
`docker compose run --rm test npx vitest run <file>`; `docker compose run --rm e2e sh -lc "npm run build && npx playwright test <spec>"`. Container scripts must use `grep` (no `rg` in image).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| Vite `generateBundle` plugin | build plugin | file-I/O | No Vite plugin exists in repo; use RESEARCH snippet, verify API (A11) |
| Restore state machine in `src/main.ts` | lifecycle | event-driven | No `webglcontextrestored` handling exists; Pattern 3 sketch + A1/A12 spikes |
| `page.clock` throttle test | test | event-driven | No existing clock-driven test; A13 unverified |
| Wave 0 Firefox WebGL2 spike | spike | n/a | No cross-engine tests exist |

## Metadata

**Analog search scope:** repo root configs, `src/main.ts`, `src/app/game-session.ts`, `tests/e2e/**`, `tests/helpers`, `tests/contract`, `tests/diag`, `tests/render`, `tests/golden`, `tests/persistence`.
**Files scanned:** about 25.
**Pattern extraction date:** 2026-11-07
