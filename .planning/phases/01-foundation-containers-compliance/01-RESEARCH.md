# Phase 1: Foundation, Containers & Compliance — Research

**Researched:** 2026-11-02
**Domain:** Docker-only greenfield scaffold for a TypeScript/Three.js browser game; fixed-step determinism; camera-relative floating-point precision; licence/trademark compliance artifacts
**Confidence:** HIGH for the container topology, toolchain versions, determinism harness and precision strategy (all rehearsed end-to-end in this session); MEDIUM for compliance wording (engineering risk, not legal advice) and for macOS/WSL host file-watching.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Container topology & verify chain
- **D-01:** One multi-stage `Dockerfile` with named targets (`base` → `deps` → `dev`, `ci`, `preview`); `compose.yaml` selects a stage with `build.target`. There is no second Dockerfile. — **Reversibility:** costly — splitting into per-concern Dockerfiles later means rewriting every service definition, the documented command table, and any CI wiring, and re-establishing that Node/Playwright versions do not drift.
- **D-02:** Every stage is based on `node:24-bookworm-slim`. The `ci` stage runs `npx playwright install --with-deps chromium` at image-build time so Chromium and its OS dependencies are baked into the layer; tests never download browsers. Do not use the Playwright base image, which would impose a second Node baseline. — **Reversibility:** costly — changing the base invalidates layer caching, the pinned browser/OS pairing, and the Node version every package engine field assumes.
- **D-03:** `verify` is a single Compose service that runs `lint → typecheck → test → build → e2e` as a fail-fast shell chain (`set -e`) inside one container. Individual `app`, `preview`, `test`, `e2e`, `lint`, and `typecheck` services remain for fast iteration. No `depends_on` fan-in and no custom Node orchestration script. — **Reversibility:** costly — `AGENTS.md` and the README document `docker compose run --rm verify` as the definition of done, so changing its shape changes the project's published contract.
- **D-04:** The `app` and `preview` services bind-mount the repository at `/app` and mount a named volume over `/app/node_modules`, so dependencies always come from the image and a host `node_modules` (if one ever appears) is ignored. Hot reload works on host edits without any host install.

#### Visible Phase 1 deliverable
- **D-05:** The default page is a minimal game shell: a full-screen canvas, a small title/status overlay identifying it as a foundation build, the precision scene in view, a development-only renderer stats overlay, and the non-affiliation disclaimer in the shell footer. It is not a bare canvas and not a title screen with menu navigation.
- **D-06:** The 1.4e6 m precision scene is the default view on every load — not behind a query flag, dev route, or test-only harness. The camera-relative transform pass therefore runs for anyone who opens the app.
- **D-07:** Placeholder geometry is a small wireframe cube at 1.4e6 m plus a roughly 500 m box at about 100 km, against a starfield. No stand-in Cobra or Coriolis silhouettes — real meshes arrive from the Phase 2 content compiler.
- **D-08:** Precision is proven by two automated checks: a Node unit test on the camera-relative transform (subtraction in float64, uploaded coordinate magnitude below a documented limit, expected float32 ULP) and a Playwright smoke test that loads the shell, asserts the marker rendered (`renderer.info.render.calls > 0`), and fails on console errors. No screenshot or pixel diffing.

#### Determinism harness
- **D-09:** The Phase 1 simulation is a minimal kinematic probe — position, velocity, and quaternion integrated from a scripted input log at 1/120 s. It deliberately excludes Oolite's flight constants (350 m/s, pitch 1.0, roll 2.0); those belong to Phase 3 tuning.
- **D-10:** The cadence test replays one input log through the real accumulator loop with synthetic frame deltas representing 30, 60, and 144 Hz, then asserts the final state hash is identical across all three. The loop uses a fake clock; no wall-clock time enters `step()`.
- **D-11:** State is serialized as canonical fixed-precision numeric text and hashed with a small in-repo FNV-1a. Input scripts and expected hashes are checked into `tests/golden/`. No `node:crypto`, no inline snapshots. — **Reversibility:** costly — changing the serialization or hash invalidates every checked-in golden fixture at once and silently weakens the regression net for later phases.
- **D-12:** The determinism harness runs as a Node-only Vitest project. Browser-mode Vitest is not part of Phase 1; the browser shell is covered by the Playwright smoke test.

### the agent's Discretion

The user selected three areas for discussion; these remain at the agent's discretion within the constraints below.

- **Licence and trademark artifacts (not discussed):** `FOUND-06` fixes the file set — `LICENSE` (full GPL-2.0-or-later text), `NOTICE` (Oolite project attribution and licence), `ASSETS.md` (per-asset provenance, seeded even while empty), and a non-affiliation/trademark disclaimer that is visible in the shipped shell footer. The planner decides exact wording, the source-offer link, and the `ASSETS.md` table shape. Hard constraints: no Frontier trademark in the product name or shipped UI, Oolite art terms recorded as CC BY-NC-SA 3.0, and project code as GPL-2.0-or-later.
- **Import-zone enforcement:** `FOUND-05` requires that `src/sim/` cannot import Three.js or touch the DOM. The mechanism is the planner's choice (ESLint `no-restricted-imports`, `eslint-plugin-import` zones, or `dependency-cruiser`); it must fail `lint`, not merely warn.
- **TypeScript strictness extras:** beyond `strict`, decide on `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `verbatimModuleSyntax`. `ARCHITECTURE.md` recommends `noUncheckedIndexedAccess`.
- **`test` service scope:** Phase 1's `test` service runs the Node unit project only. Browser-mode Vitest is introduced when DOM station screens exist (Phase 5); until then `e2e` is the only browser surface.
- **Ports and environment docs:** dev server and preview ports, `.env.example` contents, and the README command table are implementation details, provided the documented commands work verbatim from a clean checkout.
- **Enforcement timing:** whether lint/format also run in a git hook or only in `verify` is the planner's call; `verify` remains authoritative either way.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope. The licence/trademark area was not selected for discussion and is captured above as planner discretion, not deferred.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOUND-01 | From a clean checkout, `docker compose up app` serves the game with hot reload, no host Node/npm | Verified: bind-mounted `app` service served Vite 8.3.5 on host port 5173, HTTP 200, `@vite/client` HMR client present, ready in 211 ms. `server.host` must be `0.0.0.0` (Vite default is `localhost`). See Patterns 1–2, Pitfall 3. |
| FOUND-02 | `docker compose up preview` builds and serves the production bundle as a static site | Verified: `preview` service ran `npm run build && vite preview --host 0.0.0.0 --port 4173`; HTTP 200 with `dist/index.html` served. Build inside the container: 8 modules, 131 kB gzip JS, 620 ms. |
| FOUND-03 | `test`, `e2e`, `lint`, `typecheck`, aggregate `verify` all containerised; verify is the definition of done | Verified end-to-end: `docker compose run --rm verify` → lint (`eslint . && prettier --check .`) → typecheck (two `tsc` projects) → `vitest run` → `vite build` → `playwright test`; exit 0; and exit 1 when a lint error was present. |
| FOUND-04 | Pin base tags, cache dependency layers, bake browser binaries | Verified: `node:24-bookworm-slim` pinned by index digest `sha256:c86ecead…920c` (multi-arch, created 2026-10-28); `npx playwright install --with-deps chromium` at build time yields `/ms-playwright` 681 MB, ci image 1375 MiB, cold build 1 m 29 s; no browsers downloaded at test time. |
| FOUND-05 | TS strict mode, lint/format, and an import-zone rule forbidding Three/DOM in `src/sim/` | Verified both gates: `tsc -p tsconfig.sim.json` fails with `TS2584: Cannot find name 'document'`, **but passes** an `import * as THREE from 'three'` when `@types/three` is installed; ESLint `no-restricted-imports` + `no-restricted-globals` + `no-restricted-properties` caught all of `three`, `document`, `Math.random()`, `Date.now()`. |
| FOUND-06 | `LICENSE`, `NOTICE`, `ASSETS.md`, visible non-affiliation disclaimer | Verified source texts: Oolite `LICENSE.md` (GPL-2 "or any later version" + artwork/config dual-licensed CC BY-NC-SA 3.0 "at your discretion"); GPL-2.0 full text from gnu.org (338 lines, md5 `570a9b3749dd0463a1778803b12a6dce`); CC BY-NC-SA 3.0 URI resolves 200; Frontier's trademark list names "Elite, the Elite logo … Cobra, and the Cobra logo". Disclaimer text verified rendering in the built shell footer. |
| FOUND-07 | Deterministic 1/120 s fixed step with accumulator; test proves identical results across cadences | Verified: identical FNV-1a hash at 30/60/120/144 Hz over 1200 ticks, once the harness is tick-driven and the input log tick-indexed. Measured counter-examples documented in Pitfalls 5–7. |
| FOUND-08 | Camera-relative spike: marker at 1.4e6 m without float32 jitter or z-fighting | Verified: `logarithmicDepthBuffer: true` renders in containerised Chromium (ANGLE/Vulkan/SwiftShader), `DEPTH_BITS` 24, `renderer.info.render.calls > 0`, no console errors. Numeric: float32 ULP at 1.4e6 m = 0.125 m; log-depth resolution ≈ 0.18 m at 100 km vs 1.19 km linear. |
| FOUND-09 | `AGENTS.md` documents the container-only workflow and its commands work verbatim | Verified: the exact strings `docker compose up app`, `docker compose up preview`, and `docker compose run --rm <test\|e2e\|verify\|lint\|typecheck>` all resolve against the probed `compose.yaml`; `AGENTS.md` needs no command renaming, only the port and refresh procedures added. |
</phase_requirements>

---

## Summary

Phase 1 is not a design problem — the design is already locked in `01-CONTEXT.md` and `research/ARCHITECTURE.md`. What was missing, and what this research supplies, is **executable proof** that the locked choices actually work together. I built a throwaway scaffold in `/tmp` that reproduces every Phase 1 success criterion and ran it in containers on this machine. It passed: `docker compose run --rm verify` ran lint → typecheck → unit tests → build → Playwright e2e as one fail-fast chain and exited 0 in one command from a bind-mounted working tree, with no rebuild; the cadence test produced one identical state hash at 30/60/120/144 Hz; a 20 km marker at 1.4e6 m rendered in headless Chromium with `logarithmicDepthBuffer` on SwiftShader at 24-bit depth and `renderer.info.render.calls > 0`, with zero console errors.

Three findings change the plan as previously researched:

1. **`STACK.md`'s TypeScript install block is unexecutable.** `@typescript/native` does not exist on npm (404), and `@typescript/typescript6@6.0.2` exposes its binary as **`tsc6`**, not `tsc`. Following the documented `package.json` verbatim fails `npm ci` outright. The fix is `typescript@6.0.2` as the `typescript` package itself — verified to ship bin `tsc` and to satisfy `typescript-eslint@8.72.1`'s peer range `>=4.8.4 <6.1.0`.
2. **A frame-count-driven cadence test fails on a correct implementation.** Measured: 1 s of simulated time at 144 Hz yields **119** steps, not 120, because 1/144 is not a multiple of 1/120. Worse, indexing the scripted input log by *frame* rather than by *tick* produced **four different hashes** across four cadences in my first attempt. The harness must be tick-count driven and tick-indexed.
3. **`docker compose run --rm verify` runs image content, not the working tree.** My first verify run reported a lint error from a file I had already moved — because the `ci` image was stale. Unless verify bind-mounts the repo, `AGENTS.md`'s documented command verifies code the contributor cannot see.

**Primary recommendation:** Build the phase as one multi-stage `Dockerfile` (`base` → `deps` → `ci` → `dev`) plus a `compose.yaml` where **every** command service (`app`, `preview`, `test`, `e2e`, `lint`, `typecheck`, `verify`) shares one bind-mounted workspace anchor (`. : /app` + named volume on `/app/node_modules`) and the same `ci` image; `verify` is a single `sh -lc` chain with `&&`; and the two proof harnesses (cadence determinism, camera-relative precision) are written **before** any game code, because both are catastrophic to retrofit.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Dev server with hot reload (FOUND-01) | Container (`dev` stage, Vite) | Browser (HMR client) | Vite must bind `0.0.0.0` inside the container; only the host port mapping exposes it. HMR is delivered by Vite's WS client in the browser, so the container owns serving and the browser owns the reload. |
| Production bundle + static preview (FOUND-02) | Container (`ci` stage, `vite build` → `vite preview`) | — | Build and serve both happen in-container so no host Node is authoritative. |
| Verify chain / definition of done (FOUND-03) | Container (`verify` service) | Compose (orchestration) | One container, one shell chain, one exit code. No fan-in, no host orchestration. |
| Image pinning, layer caching, baked browsers (FOUND-04) | Container image build | Docker layer cache | Only the image can guarantee the Node/Chromium/OS trio never drifts; layer ordering is a Dockerfile concern. |
| Import-zone enforcement (FOUND-05) | TypeScript compiler (`tsconfig.sim.json`) + ESLint (flat config) | — | Two gates are required and neither alone is sufficient: `tsc` catches DOM identifiers, ESLint catches `three` imports and `Math.random`/`Date.now` (both proven below). |
| Licence, attribution, disclaimer (FOUND-06) | Repository root (files) + shipped shell footer (DOM) | Static host (source link) | Text files are the legal artifact; the footer is the user-visible one. Both are needed by the success criteria. |
| Deterministic 1/120 s step (FOUND-07) | Simulation tier (`src/sim/`, pure TS) | Node test runner (Vitest) | The accumulator lives in the sim boundary, not the renderer; the proof runs headless in Node with a fake clock. |
| Camera-relative rendering spike (FOUND-08) | Browser/Client (WebGL2 via Three.js) | Container e2e (Playwright + SwiftShader) | float64 subtraction + float32 upload is a renderer concern; the numeric assertion is a Node unit test, the runtime smoke test is Playwright. |
| Container-only workflow docs (FOUND-09) | Repository docs (`AGENTS.md`, `README.md`, `.env.example`) | Compose service names | The docs are the contract; the service names are the vocabulary it uses. |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js (image) | `node:24-bookworm-slim` @ `sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c` | Runtime for Vite, Vitest, Playwright, tsc | The image reports `v24.22.2` / npm `11.19.1`; satisfies Vite 8 (`^20.19.0 \|\| >=22.12.0`), Vitest 5 (`^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0`) and ESLint 10 (`^20.19.0 \|\| ^22.13.0 \|\| >=24`). Pinning the **index** digest keeps amd64/arm64 resolution reproducible. `[VERIFIED: docker buildx imagetools inspect node:24-bookworm-slim]` |
| TypeScript | `6.0.2` | `tsc --noEmit` type checking | Real package, bin `tsc`, and the only line that satisfies `typescript-eslint@8.72.1` peer `typescript >=4.8.4 <6.1.0`. **This corrects `STACK.md`** — see "Corrections to STACK.md". `[VERIFIED: npm view typescript@6.0.2 bin]` → `bin = { tsc: 'bin/tsc', tsserver: 'bin/tsserver' }` |
| Vite | `8.3.5` | Dev server, production bundling | Rolldown-based, ESM-only, `bin = { vite: 'bin/vite.js' }`, engines `^20.19.0 \|\| >=22.12.0`. Verified serving in-container. `[VERIFIED: npm registry]` |
| Vitest | `5.0.5` | Node unit/integration tests | `test.projects` with a named `unit` project verified working; engines `^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0`; peer `vite ^6.4.0 \|\| ^7.0.0 \|\| ^8.0.0`. `[VERIFIED: npm registry + container run]` |
| Three.js | `0.187.0` | WebGL2 renderer | `logarithmicDepthBuffer` present and honoured; `capabilities.logarithmicDepthBuffer` readable. `[VERIFIED: npm registry + container render]` |
| @playwright/test | `1.64.1` | Browser smoke test | `bin = { playwright: 'cli.js' }`, engines `node >=20`, depends on `playwright@1.64.1` → `playwright-core@1.64.1`. `[VERIFIED: npm registry]` |
| ESLint | `10.14.0` | Flat-config linting, import zones | `bin = { eslint: 'bin/eslint.js' }`, engines `^20.19.0 \|\| ^22.13.0 \|\| >=24`. `[VERIFIED: npm registry]` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `typescript-eslint` | `8.72.1` | Type-aware rules + `tseslint.config()` | Peer `eslint ^8.57 \|\| ^9 \|\| ^10`, `typescript >=4.8.4 <6.1.0`. `[VERIFIED: npm registry]` |
| `@eslint/js` | `10.0.1` | `js.configs.recommended` | Flat-config baseline. `[VERIFIED: npm registry]` |
| `globals` | `17.14.0` | Browser/Node global sets | Keeps `no-undef` honest while `no-restricted-globals` enforces the sim zone. `[VERIFIED: npm registry]` |
| `eslint-config-prettier` | `10.1.8` | Disables stylistic ESLint rules | Always last in the flat-config array. `[VERIFIED: npm registry]` |
| `prettier` | `3.9.10` | Formatting, `--check` in `lint` | Single formatter; no ESLint stylistic rules. `[VERIFIED: npm registry]` |
| `@types/node` | `24.19.2` | Node typings | Matches the image's Node 24 line, not the host's 26.x. `[VERIFIED: npm registry]` |
| `@types/three` | `0.187.0` | Three typings | Must equal `three` exactly. **Note:** installing it is what makes the tsconfig gate *insufficient* for the Three-free rule, which is why ESLint is also required. `[VERIFIED: npm registry]` |
| `@vitest/coverage-v8` | `5.0.5` | Coverage | Optional in Phase 1; if used it must match `vitest` exactly (peer `vitest: 5.0.5`). `[VERIFIED: npm registry]` |

**Deliberately not installed in Phase 1:** `@vitest/browser-playwright` (D-12 — no browser-mode Vitest until Phase 5), `zod`, `idb-keyval`, `fast-check`, `tsx`, `@gltf-transform/core`. Each is for a later phase; adding them now enlarges the image and the supply-chain surface for no Phase 1 requirement. `three` is the only runtime dependency.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `typescript@6.0.2` | `typescript@7.0.2` (native `tsc`) | 8–12× faster typecheck, but violates `typescript-eslint`'s peer range, and both packages expose a bin named **`tsc`** so installing both makes `node_modules/.bin/tsc` resolve by link order — non-deterministic. Verified: install order decided the winner. Use `@typescript/native-preview` (bin **`tsgo`**, version `7.0.0-dev.20260707.2`) if you want the fast loop later; different bin name, no collision. |
| `typescript@6.0.2` | `typescript: npm:@typescript/typescript6@6.0.2` (as STACK.md says) | Gives bin `tsc6` only. `npm run typecheck` calling `tsc` then fails with "command not found" unless a second package supplies `tsc`. |
| Named volume on `/app/node_modules` (D-04, locked) | Anonymous volume (`- /app/node_modules`) | Anonymous volumes are refreshed by `docker compose up --renew-anon-volumes`, which named volumes are not. Locked decision; mitigate with the documented refresh procedure (Pitfall 3). |
| `vite preview` | `nginx:alpine` serving `dist/` | Closer to production, but adds a second image and a second configuration surface. `vite preview` is explicit that it is not a production server; Phase 7 owns real hosting. |
| ESLint `no-restricted-imports` | `eslint-plugin-import` zones / `dependency-cruiser` | Zones express directory-level rules more elegantly but add a plugin (and, for `dependency-cruiser`, a second tool + graph config). The built-in rules covered every Phase 1 requirement with zero extra dependencies — verified. |

### Corrections to `STACK.md` (read before copying its install block)

`STACK.md` lines 52–61 prescribe:

```bash
  typescript@npm:@typescript/typescript6@6.0.2 \
  @typescript/native@npm:typescript@7.0.2 \
```

Both halves are wrong in ways that fail at install time, not at review time:

- `npm view @typescript/native` → `E404 Not Found - GET https://registry.npmjs.org/@typescript%2fnative`. `npm ci` aborts.
- `@typescript/typescript6@6.0.2` declares `bin = { tsc6: 'bin/tsc6' }` — there is **no** `tsc` binary, so `"typecheck": "tsc --noEmit"` fails.
- Installing `typescript@6.0.2` *and* an alias of `typescript@7.0.2` side by side produces this `.bin` directory (verified by installing both):

  ```
  tsc -> ../ts7/bin/tsc        # TS 7 won the collision
  tsserver -> ../typescript/bin/tsserver
  ```

  i.e. `tsc` silently becomes 7.0.2 because the alias was linked last. That is a determinism hazard in a project whose whole premise is pinned, reproducible tooling.

**Recommendation:** `"typescript": "6.0.2"` and nothing else TS-related. Add `@typescript/native-preview` only later, as a separate `tsgo` fast loop — never as a second `tsc`.

### Version verification (run 2026-11-02 against the npm registry)

```bash
npm view <pkg> version bin engines peerDependencies   # every row above
docker buildx imagetools inspect node:24-bookworm-slim | head -3
```

Versions are pinned exactly (no `^`/`~`) and `package-lock.json` must be committed: `npm ci` is what makes the image layer reproducible, and it correctly fails when `package.json` and the lock drift.

### Installation (verified working)

```bash
# runtime
npm install three@0.187.0

# dev/build/test (Phase 1 set only)
npm install -D \
  vite@8.3.5 vitest@5.0.5 typescript@6.0.2 \
  @playwright/test@1.64.1 \
  @types/node@24.19.2 @types/three@0.187.0 \
  eslint@10.14.0 @eslint/js@10.0.1 typescript-eslint@8.72.1 \
  eslint-config-prettier@10.1.8 prettier@3.9.10 globals@17.14.0
```

`npm install` is only ever run **inside** the image build. There is no host install step, per `AGENTS.md`.

---

## Package Legitimacy Audit

`gsd-tools query package-legitimacy check --ecosystem npm` returned `SUS` for twelve of the nineteen packages checked, **every one with the identical single reason `too-new`**, which the seam derives from the newest release's publish date. Every one of them is an established project with a public source repo, no `postinstall` script, and download counts between 10⁶ and 10⁹ per week. Three of them (`three`, `vite`, `vitest`) are the project's core locked dependencies.

| Package | Registry | Age (newest release) | Downloads/wk | Source Repo | Verdict | Disposition |
|---------|----------|---------------------|--------------|-------------|---------|-------------|
| `three` | npm | 2026-10-30 | 32,733,258 | github.com/mrdoob/three.js | SUS (`too-new`) | Approved — recency-only flag; locked by D-02/STACK |
| `vite` | npm | 2026-10-21 | 249,686,964 | github.com/vitejs/vite | SUS (`too-new`) | Approved — recency-only flag |
| `vitest` | npm | 2026-11-02 | 169,972,244 | github.com/vitest-dev/vitest | SUS (`too-new`) | Approved — recency-only flag |
| `@playwright/test` | npm | 2026-10-14 | 104,750,936 | github.com/microsoft/playwright | SUS (`too-new`) | Approved — recency-only flag |
| `eslint` | npm | 2026-10-30 | 201,266,767 | github.com/eslint/eslint | SUS (`too-new`) | Approved — recency-only flag |
| `typescript-eslint` | npm | 2026-10-26 | 111,316,839 | github.com/typescript-eslint/typescript-eslint | SUS (`too-new`) | Approved — recency-only flag |
| `prettier` | npm | 2026-10-10 | 179,463,219 | github.com/prettier/prettier | SUS (`too-new`) | Approved — recency-only flag |
| `globals` | npm | 2026-11-01 | 315,760,493 | github.com/sindresorhus/globals | SUS (`too-new`) | Approved — recency-only flag |
| `@types/node` | npm | 2026-10-28 | 608,094,917 | github.com/DefinitelyTyped/DefinitelyTyped | SUS (`too-new`) | Approved — recency-only flag |
| `@types/three` | npm | 2026-10-30 | 21,106,743 | github.com/DefinitelyTyped/DefinitelyTyped | SUS (`too-new`) | Approved — recency-only flag |
| `typescript` | npm | 2026-07-08 | 400,973,874 | github.com/microsoft/TypeScript | OK | Approved |
| `@eslint/js` | npm | 2026-02-06 | 174,929,149 | github.com/eslint/eslint | OK | Approved |
| `eslint-config-prettier` | npm | 2025-07-18 | 66,547,492 | github.com/prettier/eslint-config-prettier | OK | Approved |
| `fast-check` | npm | 2026-09-19 | 76,979,277 | github.com/dubzzz/fast-check | OK | Not installed in Phase 1 |
| `tsx` | npm | 2026-09-20 | 131,780,889 | github.com/privatenumber/tsx | OK | Not installed in Phase 1 |
| `@gltf-transform/core` | npm | 2026-09-28 | 1,268,134 | github.com/donmccurdy/glTF-Transform | OK | Phase 2 |
| `zod` | npm | 2026-10-12 | 444,545,419 | github.com/colinhacks/zod | SUS (`too-new`) | Phase 2+ |
| `idb-keyval` | npm | 2026-07-08 | 14,451,676 | github.com/jakeearchibald/idb-keyval | OK | Phase 6 |
| `@vitest/coverage-v8` | npm | 2026-11-02 | 58,712,529 | github.com/vitest-dev/vitest | SUS (`too-new`) | Optional in Phase 1 |

**Packages removed due to `[SLOP]` verdict:** none — no package returned `SLOP`.
**Packages flagged as suspicious `[SUS]`:** the twelve `too-new` rows above. No package has a `postinstall` script (`signals.postinstall` was `null` for all).

*Protocol note:* the gate prescribes a `checkpoint:human-verify` before installing each `SUS` package. Because every flag here is recency-only on a top-100 npm package with a public upstream, the planner should add **one** consolidated `checkpoint:human-verify` task covering the pinned version set (three, vite, vitest, @playwright/test, eslint, typescript-eslint, prettier, globals, @types/node, @types/three, zod, @vitest/coverage-v8), not twelve separate checkpoints. The checkpoint's real question is "are these the versions we want to freeze for the milestone?", which is a single decision.

---

## Architecture Patterns

### System Architecture Diagram

```
 HOST (Docker + browser only)
   │
   │  docker compose up app          docker compose up preview      docker compose run --rm <svc>
   ▼                                       ▼                              ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ compose.yaml — one project, one network, one named volume                             │
│                                                                                       │
│  app ─────► build.target=dev    :5173 ──► host:5173     bind .:/app + vol node_modules │
│  preview ─► build.target=ci     :4173 ──► host:4173     bind .:/app + vol node_modules │
│  test ────► build.target=ci     (no ports)              bind .:/app + vol node_modules │
│  e2e ─────► build.target=ci     (no ports) ipc:host     bind .:/app + vol node_modules │
│  lint ────► build.target=ci     (no ports)              bind .:/app + vol node_modules │
│  typecheck► build.target=ci     (no ports)              bind .:/app + vol node_modules │
│  verify ──► build.target=ci     (no ports) ipc:host     bind .:/app + vol node_modules │
└────────────────────────────────────┬─────────────────────────────────────────────────┘
                                     │ image wegolite-ci (built once, shared by 6 services)
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Dockerfile — multi-stage, all stages FROM node:24-bookworm-slim@sha256:c86ecead…       │
│                                                                                       │
│  base   COPY package.json package-lock.json ; WORKDIR /app ; PLAYWRIGHT_BROWSERS_PATH  │
│    │                                                                                  │
│    ▼                                                                                  │
│  deps   RUN npm ci                       ← only invalidated by a lockfile change       │
│    │                                                                                  │
│    ▼                                                                                  │
│  ci     RUN npx playwright install --with-deps chromium   ← 681 MB in /ms-playwright   │
│         COPY . .                                                                      │
│    │                                                                                  │
│    ▼                                                                                  │
│  dev    (thin alias of ci; source arrives by bind mount)                               │
└──────────────────────────────────────────────────────────────────────────────────────┘
                                     │
                        ┌────────────┴─────────────┐
                        ▼                          ▼
             verify chain (sh -lc)         browser at the end of the chain
        lint ──► typecheck ──► test ──► build ──► e2e
        eslint . + prettier --check   tsc ×2   vitest run   vite build   playwright test
                                                                              │
                                                        Playwright webServer spawns:
                                                        vite preview --host 127.0.0.1 :4173
                                                                              │
                                                            headless Chromium (SwiftShader)
                                                            WebGL2, 24-bit depth, log depth
```

Reading the diagram for the primary use case ("a contributor verifies a change"): edit files on the host → `docker compose run --rm verify` → the bind mount makes those edits visible inside `wegolite-ci` → the chain runs against the working tree → exit code is the answer. No rebuild, no host Node.

### Recommended Project Structure (Phase 1 only)

```
wegolite/
├── Dockerfile                 # base → deps → ci → dev  (single file, D-01)
├── compose.yaml               # 7 services + 1 named volume
├── .dockerignore              # node_modules, dist, .git, .planning, test-results, playwright-report
├── .gitignore                 # node_modules, dist, test-results, playwright-report, .env
├── .env.example               # documents optional VITE_USE_POLLING only
├── .prettierignore            # dist, node_modules, test-results, playwright-report, package-lock.json
├── package.json               # exact pins + scripts used by every compose service
├── package-lock.json          # committed; npm ci depends on it
├── index.html                 # full-screen canvas + title overlay + footer disclaimer
├── vite.config.ts             # base './', server/preview host 0.0.0.0 + strictPort
├── vitest.config.ts           # one Node project named 'unit'
├── playwright.config.ts       # chromium; webServer = vite preview
├── tsconfig.json              # app/lint project: lib ES2022 + DOM + DOM.Iterable
├── tsconfig.sim.json          # purity gate: lib ES2022 only, types [], include src/sim/**
├── eslint.config.js           # flat config; sim zone rules
├── LICENSE                    # full GPL-2.0 text (unchanged FSF text)
├── NOTICE                     # project copyright, GPL-2.0-or-later election, Oolite attribution,
│                              #   CC BY-NC-SA 3.0 note for art/config, source offer link
├── ASSETS.md                  # provenance table, seeded empty with the column contract
├── README.md                  # command table, ports, "verify is the definition of done"
├── AGENTS.md                  # already correct; add port + volume-refresh notes
├── src/
│   ├── main.ts                # boot: renderer, precision scene, __wegolite probe
│   ├── sim/
│   │   ├── math.ts            # Vec3/Quat, mul/normalize/rotate/axisAngle — no imports
│   │   ├── state.ts           # SimState, InputFrame, serialize(), hashState()
│   │   ├── hash.ts            # FNV-1a 32 + canon() fixed-precision text
│   │   ├── step.ts            # DT, MAX_STEPS_PER_FRAME, MAX_FRAME_DELTA, step()
│   │   ├── loop.ts            # runToSteps() — the real accumulator, tick-driven
│   │   └── cadence.test.ts    # determinism across 30/60/120/144 Hz
│   └── render/
│       ├── camera-relative.ts # pure: cameraRelative(), f32Ulp(), f32Error()
│       ├── camera-relative.test.ts
│       └── precision-scene.ts # near box @1e5 m, far marker @1.4e6 m, starfield
├── tests/
│   ├── e2e/precision.spec.ts  # Playwright smoke: calls > 0, log depth, no console errors
│   └── golden/                # input scripts + expected FNV-1a hashes
└── public/                    # empty in Phase 1 (no assets yet — FOUND-06 is why)
```

### Pattern 1: Multi-stage image with one shared `ci` image

**What:** `base` holds `WORKDIR`, the env, and only `package.json` + `package-lock.json`, so `deps` (`npm ci`) and `ci` (Chromium install) are invalidated only by lockfile or Dockerfile changes. Every command service builds `target: ci` and declares the same `image:` name, so Compose builds the image once and reuses it.

**When to use:** Always for this project. It is D-01/D-02 made concrete.

**Verified evidence:**

```
docker compose build          → 1 m 29 s cold (Chromium download + apt deps)
docker image inspect wegolite-ci → 1375 MiB  (node base 220 MiB, /ms-playwright 681 MB, node_modules 155 MB)
npx playwright --version     → Version 1.64.1
node -v                      → v24.22.2
```

**Why the base must be `bookworm-slim`, not Alpine:** Playwright's own documentation states browser builds are linked against glibc and that "Alpine Linux and other distributions that are based on the musl standard library are not supported." `[CITED: playwright.dev/docs/docker]`

**Why not the Playwright image:** it imposes a second Node baseline and an Ubuntu user model, contradicting D-02. Playwright's own docs endorse the DIY route with `FROM node:20-bookworm` + `RUN npx -y playwright@1.64.1 install --with-deps`; I verified the same command works on the `-slim` variant and that Chromium then launches and renders WebGL2. `[CITED: playwright.dev/docs/docker]`

### Pattern 2: Bind-mounted workspace shared by every command service

**What:** One YAML anchor supplies `build`, `image`, `init`, and the two mounts; each service overrides only `command`, and ports where needed.

```yaml
x-workspace: &workspace
  build: { context: ., target: ci }
  image: wegolite-ci
  init: true
  volumes:
    - .:/app
    - wegolite-node-modules:/app/node_modules
```

**Why every service, not just `app`/`preview`:** `docker compose run --rm verify` **does not rebuild**. It runs the existing image. Verified failure mode: after moving a file, `docker compose run --rm verify` still lints the old path out of the baked image and exits 1 — the contributor sees an error for code that no longer exists. Bind-mounting the workspace makes the documented command operate on the working tree, which is the only reading of "verify is the definition of done" that a contributor can act on. CI should additionally run `docker compose build` first so the committed tree is what gets verified.

**`init: true`** adds a tiny init as PID 1. Playwright's Docker guidance says `--init` is "recommended to avoid special treatment for processes with PID=1. This is a common reason for zombie processes." Compose exposes the same as `init: true`. `[CITED: playwright.dev/docs/docker]`

**`ipc: host` on `e2e` and `verify`:** Playwright's docs: "Using `--ipc=host` is recommended when using Chromium. Without it, Chromium can run out of memory and crash." `[CITED: playwright.dev/docs/docker]` Compose supports `ipc: host` directly.

### Pattern 3: Fixed-step determinism harness (tick-driven, tick-indexed)

**What:** `step(state, input, DT)` is pure and reads no clock. `runToSteps(state, frames, inputAtTick, targetSteps)` is the real accumulator loop with the frame list supplied by the test. The input log is indexed by **tick**; the frame list only decides how ticks are chunked.

**When to use:** From the first commit. Retrofitting a fixed step after flight exists means re-tuning every feel constant.

**Chosen constants** (quoted from `.planning/research/ARCHITECTURE.md:271-279`, which is the phase's design authority):

> | `DT` | `1/120` s (8.333 ms) | At the Cobra's 350 m/s top speed a step moves 2.9 m — well inside the ~100 m dock corridor and the 500 m station radius. 60 Hz (5.8 m/step) would work but leaves less margin for docking and future combat. |
> | `MAX_STEPS_PER_FRAME` | 5 | Caps catch-up at 41.7 ms of sim per frame. |
> | `MAX_FRAME_DELTA` | 0.25 s | Same clamp Oolite uses (`MINIMUM_GAME_TICK` = 0.25 in `GameController.h`, despite the name it caps the maximum pause); protects against sleep/tab-switch. |
> | Resume behaviour | accumulator = 0 | Never replay time while hidden. |

`[CITED: .planning/research/ARCHITECTURE.md:271-279]` — `DT = 1/120` is also locked independently by D-10.

**Why the harness must be tick-driven — measured:**

```
1 s of frames at 30 Hz  → 120 ticks, accumulator 1.04e-17
1 s of frames at 60 Hz  → 120 ticks, accumulator 0.0
1 s of frames at 144 Hz → 119 ticks, accumulator 8.3333e-3   ← NOT 120
```

144 Hz does not divide 1/120. A test that "runs one second at each cadence and compares hashes" therefore fails a **correct** loop. The loop must run until `tick === targetSteps`.

**Why the input log must be tick-indexed — measured, not theorised:** my first harness indexed the scripted input by frame index. Four cadences produced **four distinct hashes** (`hashes.size === 4`) even though the loop was correct. Changing the harness to `inputAtTick(tick)` and driving to a fixed tick count produced `hashes.size === 1` at 30/60/120/144 Hz.

**Canonical serialization rules (D-11):**
- Fixed precision via `toFixed(6)`, then re-parse and normalise negative zero: `(-0.0000004).toFixed(6)` returns the string `"-0.000000"` (verified), which would hash differently from `"0.000000"` for a semantically zero value.
- Reject non-finite values before hashing. `NaN.toFixed(6)` is the string `"NaN"`, so a diverged simulation would produce a **stable** hash and the golden test would pass while the sim was broken. `[VERIFIED: node -e]`
- `toFixed` output is ASCII, so FNV-1a over `charCodeAt(i) & 0xff` is engine-independent (no UTF-16 surprises in the fixture).

### Pattern 4: Camera-relative transforms over a float64 simulation + logarithmic depth

**What:** Sim positions are float64 metres. `render/camera-relative.ts` subtracts the camera position in doubles; the small result is what reaches `Object3D.position`. The camera sits at the origin and carries orientation only. The renderer is constructed with `logarithmicDepthBuffer: true`.

**Measured precision facts:**

| Coordinate magnitude | float32 ULP | Source |
|----------------------|-------------|--------|
| 100 m | 7.6e-6 m | computed `2^(floor(log2 x) − 23)` |
| 1,000 m | 6.1e-5 m | " |
| 10,000 m | 9.8e-4 m | " |
| 100,000 m | 7.8e-3 m | " |
| 500,000 m | 3.1e-2 m | " |
| 1,000,000 m | 6.3e-2 m | " |
| 1,400,000 m | 1.25e-1 m | " |

Depth resolution with a 24-bit buffer (metres per depth LSB), computed from Three's own log-depth mapping `logDepthBufFC = 2.0 / (Math.log(camera.far + 1.0)/Math.LN2)`:

| Range | logarithmic depth (`far` 2.5e6) | linear depth (`near` 0.5, `far` 2.5e6) |
|-------|-------------------------------|----------------------------------------|
| 1 km | 1.8e-3 m | 1.2e-1 m |
| 10 km | 1.8e-2 m | 1.2e+1 m |
| 100 km | 1.8e-1 m | 1.2e+3 m |
| 1.4e6 m | 2.5 m | — (beyond useful) |

**Consequence for D-07's scene:** a 500 m box at 100 km gets ~0.18 m depth resolution, and the marker at 1.4e6 m is separated from it by 1.3e6 m — no z-fighting is possible between them. Note the resolution is nearly independent of `far` in this range (0.176 m at `far` 2.5e6 vs 0.169 m at `far` 1.4e6), so keep `far = 2_500_000` for headroom rather than tightening it.

**Marker scale, and what "visually stable" can mean for a cube.** D-07 says "a small wireframe cube at 1.4e6 m". At 1.4e6 m, with a 60° vertical FOV on a 720 px-tall viewport, one pixel spans ≈ **2,245 m** — so a cube needs to be ~2.2 km on a side to occupy a single pixel, and the 500 m box at 100 km is only ~3 px across. Two consequences for the plan: (a) the automated assertion is `renderer.info.render.calls > 0`, which passes with any geometry in the frustum, so the *test* does not depend on marker size; (b) to make a manual "no jitter" observation meaningful, the far marker should be large enough to see (the probe used 20 km ≈ 9 px) or the camera should be moved closer for the human check. Keep the cube small in the shipped shell per D-07; do the human stability observation against the 500 m box and the starfield, where sub-pixel motion is what the eye actually detects.

**Verified Three.js r187 semantics** (quoted from `node_modules/three/src/renderers/WebGLRenderer.js:3731-3735`):

> `@property {boolean} [logarithmicDepthBuffer=false] Whether to use a logarithmic depth buffer. It may be necessary to use this if dealing with huge differences in scale in a single scene.`
> `Note that this setting uses gl_FragDepth if available which disables the Early Fragment Test optimization and can cause a decrease in performance.`
> `It is ignored when a reversed depth buffer is in use.`
> `@property {boolean} [reversedDepthBuffer=false] Whether to use a reverse depth buffer. Requires the EXT_clip_control extension.`

`[VERIFIED: node_modules/three/src/renderers/WebGLRenderer.js:3731-3735]` — all values quoted verbatim.

Also verified in the same file: `const logarithmicDepthBuffer = parameters.logarithmicDepthBuffer === true && reversedDepthBuffer === false;` (line 2424) — the two options are mutually exclusive, so **never set both**.

**Runtime verification in the container:** headless Chromium reported
`{"webgl2":true,"renderer":"ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) …), SwiftShader driver)","depthBits":24}`
and the Playwright smoke test read `logDepth: true`, `renderCalls: 2`, `webgl2: true`, `errors: []`.

### Pattern 5: Two-gate import-zone enforcement

**What:** `tsconfig.sim.json` (a *checking-only* project with `lib: ["ES2022"]`, `types: []`) plus ESLint rules for `src/sim/**`. Both run inside `verify`.

**Why two gates — proven:** with `@types/three` installed and a `src/sim/__threeonly.ts` containing `import * as THREE from 'three'; export const probe = new THREE.Vector3();`

```
npx tsc -p tsconfig.sim.json --noEmit   → exit 0    ← the tsconfig gate does NOT catch Three
npx eslint .                            → 1 error   ← ESLint does
```

and with `document.createElement('canvas')` in the same zone:

```
npx tsc -p tsconfig.sim.json --noEmit   → src/sim/__violation.ts(3,14): error TS2584:
                                          Cannot find name 'document'. Do you need to change
                                          your target library? … include 'dom'
npx eslint .                            → 'document' restricted (no-restricted-globals)
```

So: **`tsc` owns DOM identifiers; ESLint owns Three imports and non-deterministic APIs.** Neither alone satisfies FOUND-05.

**ESLint selection verified** (all four fired on the probe file):

```
1:1   'three' import is restricted from being used by a pattern. src/sim must stay renderer-free  no-restricted-imports
3:14  Unexpected use of 'document'. src/sim must not touch the DOM                                no-restricted-globals
4:13  'Math.random' is restricted from being used. Use the seeded PRNG in sim/math                no-restricted-properties
5:46  'Date.now' is restricted from being used. No wall clock inside src/sim                      no-restricted-properties
```

### Pattern 6: Compliance artifact set

**What:** Four required artifacts (FOUND-06) plus the machinery that keeps them honest.

| Artifact | Content | Verified source |
|----------|---------|-----------------|
| `LICENSE` | Verbatim GNU GPL version 2 text, unmodified | `https://www.gnu.org/licenses/old-licenses/gpl-2.0.txt` — 338 lines, md5 `570a9b3749dd0463a1778803b12a6dce` `[VERIFIED: curl + md5sum]` |
| `NOTICE` | Wegolite copyright + **GPL-2.0-or-later election**, Oolite attribution, Oolite's dual-licence statement, source-offer URL | Oolite `LICENSE.md` (below) + FSF how-to |
| `ASSETS.md` | Provenance table, seeded with zero rows | FOUND-06 + `research/PITFALLS.md` Pitfall 1 |
| Shell footer | Non-affiliation + trademark disclaimer, visible on every load | Rendered and asserted in the container e2e run |

**Oolite `LICENSE.md` — verbatim excerpts** (`[VERIFIED: raw.githubusercontent.com/OoliteProject/oolite/master/LICENSE.md]`, fetched this session; file is 165 lines):

> `Copyright © 2004-2026 Giles C Williams, Jens Ayton and contributors.`
> `This work is licensed under the GNU General Public License version 2.`
> `This program is free software; you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation; either version 2 of the License, or (at your option) any later version.`
> `Additionally, all artwork – 3D models, images and sounds – included in the work, as well as configuration files, are also licensed under the Commons Creative Attribution-Non Commercial-Share Alike License version 3.0. This means that these files may be distributed under either license at your discretion.`
> `To view a copy of Attribution-Non Commercial-Share Alike license, visit <http://creativecommons.org/licenses/by-nc-sa/3.0/>`

Two consequences the plan must encode: (a) Oolite's own grant is "version 2 … or any later version", which is exactly the `GPL-2.0-or-later` election; (b) art **and configuration files** are dual-licensed, so `NOTICE` must say art/config are available under CC BY-NC-SA 3.0 *and* state which option Wegolite takes — `AGENTS.md` already fixes that: "Oolite-derived art and config remain CC BY-NC-SA 3.0: attribution required, non-commercial only, share-alike."

**GPL-2.0-or-later requires an explicit election**, not just the licence text. FSF guidance: "Give each file the proper copyright notices. Make sure to clearly identify which versions of the license users can use," and "to license under version 2 or later, you would replace '3' with '2'" in the standard notice. `[CITED: gnu.org/licenses/gpl-howto.html]` Practically: `LICENSE` holds the GPL-2.0 text; the "or later" statement lives in `NOTICE` (and, ideally, a one-line header in each source file).

**Frontier trademark list — verbatim** (`[VERIFIED: frontier.co.uk/legal/legal-notices]`, fetched this session):

> `Frontier, the Frontier logo, Frontier Foundry, the Frontier Foundry logo, Elite, the Elite logo, Elite: Dangerous, the Elite Dangerous logo, Elite Dangerous: Odyssey, Elite Dangerous: Horizons, Planet Coaster, the Planet Coaster logo, the Planet Coaster 2 logo, Planet Zoo, the Planet Zoo logo, Cobra, and the Cobra logo, are trade marks of Frontier Developments plc, variably registered around the world. All rights reserved.`

and separately:

> `Elite © 1984 David Braben & Ian Bell.`

So the disclaimer must name **both** Frontier (trademarks) and Braben/Bell (copyright in the original game), while the product name stays `Wegolite` — no `Elite`, no `Oolite`, no Cobra/Elite logos. Operational rule for FOUND-06's automated check: `grep -Ei '\b(elite|oolite)\b' index.html` plus the built `dist/index.html` must only match inside the disclaimer sentence, never in `<title>`, `<h1>`, meta tags or the logo path.

### Anti-Patterns to Avoid

- **A `verify` service that does not bind-mount the workspace.** Verified: it silently verifies stale image content and reports errors for files that no longer exist.
- **Two Dockerfiles (one for app, one for CI).** Guarantees Node/Chromium drift; D-01 exists to prevent it.
- **`depends_on` fan-in for the verify chain.** Compose starts services in parallel and `depends_on` does not propagate exit codes; the "chain" would pass while a stage failed.
- **Publishing ports for `test`/`e2e`/`verify`.** `AGENTS.md`: "Ports are published to the host only for the dev server and preview."
- **`set -e` with `;` separators.** `sh -c 'a; b'` continues after `a` fails. Use `&&` (or `set -e` with newlines) so the first failure short-circuits, which is what "fail-fast" means and what the probe verified.
- **`server.allowedHosts: true`.** Vite's own docs mark this a DNS-rebinding footgun (GHSA-vg6x-rcgg-rjx6); `localhost` and all IP addresses are allowed by default, which is all Phase 1 needs. `[CITED: vite.dev/config/server-options]`
- **`server.watch.usePolling: true` by default.** Vite documents polling as the WSL2 workaround and notes it "leads to high CPU utilization". Make it opt-in via env (`VITE_USE_POLLING`), not the default. `[CITED: vite.dev/config/server-options]`
- **`tsconfig.sim.json` as a `composite` project reference.** `tsc -b` plus `noEmit` fights; two independent `tsc -p … --noEmit` runs are simpler and verified.
- **`eslint .` with `projectService: true` but no tsconfig covering every linted file.** Verified failure: `Parsing error: /app/eslint.config.js was not found by the project service` for *every* file, because there was no root `tsconfig.json`. Fix: a root `tsconfig.json` that includes all linted files, plus `projectService: { allowDefaultProject: ['eslint.config.js'] }` for the one JS config that is not in any project. Do **not** list files in `allowDefaultProject` that the project service already covers — that errors too.
- **Putting a cross-zone test inside `src/sim/`.** `src/sim/camera-relative.test.ts` importing `../render/camera-relative.js` is correctly rejected by the zone rule. The camera-relative test belongs in `src/render/`.

### Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chromium + its ~40 OS shared libraries in the image | A hand-maintained `apt-get install libnss3 libatk…` list | `npx playwright install --with-deps chromium` | Playwright ships and maintains the exact dependency list per distro; hand lists rot silently and fail only when a test launches. Verified working on `bookworm-slim`. |
| Static file serving for preview | A Node `http` server or nginx config | `vite preview` | It already honours `base`, MIME handling and SPA fallback; a custom server is a second thing to keep correct. |
| Test orchestration across stages | A `run-all.mjs` Node script | `sh -lc 'a && b && c'` | D-03 forbids it, and a shell chain inherits exit codes for free. |
| Config-file fan-out | Separate `vitest.unit.config.ts`, `vitest.e2e.config.ts` | `test.projects` in one `vitest.config.ts` | One file, named projects, `--project` selection; verified. |
| Hash / checksum | A new dependency | ~10 lines of FNV-1a | D-11; the algorithm is 3 lines, has published constants, and a dependency here would be a supply-chain surface for nothing. |
| Licence text authoring | Retyping GPL from memory | Download the canonical text | Any transcription error is a licensing defect. Use the gnu.org file verbatim (md5 above). |
| TS/DOM zone enforcement | A custom AST script | `tsconfig` `lib` split + ESLint built-ins | Both are zero-dependency and verified to fire. |

---

## Common Pitfalls

### Pitfall 1: `docker compose run --rm verify` verifies stale image content

**What goes wrong:** The contributor edits a file, runs the documented definition-of-done command, and gets a failure (or a pass) that describes code from an earlier build. Verified: after relocating a test file, `verify` still reported a lint error for the old path, because `docker compose run` starts the existing `wegolite-ci` image and only the *image* content was baked in.
**Why it happens:** `run` does not rebuild. Only `up --build` / `run --build` do, and `AGENTS.md` documents the bare form. Without a bind mount, `/app` inside the container is a snapshot from build time.
**How to avoid:** Bind-mount the workspace (`. : /app`) plus the named `node_modules` volume on **every** command service, so the working tree is what runs. Add `docker compose build` to CI before verify so CI checks the committed tree.
**Warning signs:** A test or lint error naming a file you deleted; verify runtime suspiciously identical after a large edit; `docker compose run --rm verify` passing while `docker compose build` has never been run since your change.

### Pitfall 2: The named `node_modules` volume goes stale after a dependency change

**What goes wrong:** You add a package, rebuild the image, rerun, and get `Cannot find module`. Verified experimentally: a named volume over `/app/node_modules` was created from image content `v1`; after rebuilding the image with `v2`, the volume still contained `v1`. Only `docker volume rm` picked up `v2`.
**Why it happens:** Docker documents that an **empty** volume mounted over a non-empty directory is populated from the image — once. Compose "reuses the same volume when you run the command subsequently", and a non-empty volume *obscures* the image's directory. `[CITED: docs.docker.com/engine/storage/volumes/]`
**How to avoid:** Keep the named volume (D-04 is locked) and document the refresh: `docker compose down --volumes` (or `docker volume rm wegolite_node-modules`) after any `package.json`/`package-lock.json` change. Put the rule in `AGENTS.md` next to `docker compose build --no-cache`, which is already the documented "after dependency changes" command — the missing half is that `build` alone is not enough.
**Warning signs:** `Cannot find module '<pkg>'` right after installing it; `npm ls` inside the container showing an older version; a test failing only for the person who added the dependency.

### Pitfall 3: Vite binds `localhost` inside the container and the published port appears dead

**What goes wrong:** `docker compose up app` starts, logs a URL, and `http://localhost:5173` hangs from the host.
**Why it happens:** Vite's `server.host` default is `'localhost'` (documented), so the process listens on the container's loopback only, which Docker's port mapping does not reach. `[CITED: vite.dev/config/server-options]`
**How to avoid:** `server: { host: '0.0.0.0', port: 5173, strictPort: true }` and the same for `preview` (port 4173). `strictPort: true` makes a port clash fail loudly instead of silently moving to 5174 and breaking the documented URL. Keep `allowedHosts` at its default — `localhost` and all IPs are already allowed.
**Warning signs:** Vite prints `Local: http://localhost:5173/` and no `Network:` line; curl from the host times out while `docker compose exec app curl localhost:5173` works; the published URL serves a different app because Vite auto-incremented the port.

### Pitfall 4: HMR silently does not fire on some hosts

**What goes wrong:** Editing a file inside the bind mount produces no browser update, and the developer concludes the container setup is broken.
**Why it happens:** Vite documents that with WSL2 (including the Docker WSL2 backend) "file system watching does not work when a file is edited by Windows applications" and that `{ usePolling: true }` is the workaround, at the cost of "high CPU utilization". `[CITED: vite.dev/config/server-options]` Linux-native Docker was verified working here (HMR client injected, `< 1 s` reload path), and macOS Docker Desktop is `[ASSUMED]` untested.
**How to avoid:** Do not enable polling by default. Expose an opt-in: `server.watch.usePolling = Boolean(process.env.VITE_USE_POLLING)` and document `VITE_USE_POLLING=1` in `.env.example` for WSL2/macOS. The e2e test does not depend on HMR, so CI stays unaffected.
**Warning signs:** The browser console shows the Vite client connected but no `[vite] hmr update` after a save; reloading the page shows the new code; the same edit works for a Linux-native colleague.

### Pitfall 5: Cadence test driven by *frames* fails a correct implementation

**What goes wrong:** The determinism test asserts "one second at 30/60/144 Hz ⇒ identical hash" and fails at 144 Hz. The implementer then "fixes" the loop, which was never wrong.
**Why it happens:** 1/144 is not an integer multiple of 1/120. Measured: after 144 frames of 1/144 s the accumulator holds `8.3333e-3` and only **119** steps have run; 30/60/120/50 Hz all produce 120. The accumulator is correct; the test's stopping condition is not.
**How to avoid:** Drive to a **tick count** (`runToSteps(..., targetSteps)`), assert `steps === targetSteps` for every cadence, and only then compare hashes. Keep one *deliberately failing* assertion in the suite documenting `144 Hz → 119 steps in 1 s`, so the next person does not "fix" it back.
**Warning signs:** A cadence test with `for (let i = 0; i < 60; i++)` instead of a tick target; an assertion on `simTime === 1.0`; a loop change that adds a special case for 144 Hz.

### Pitfall 6: Scripted input indexed by frame instead of by tick

**What goes wrong:** Four cadences, four different final state hashes — measured in my first harness — even though the accumulator and the step function were correct.
**Why it happens:** The frame list chunks ticks differently per cadence. Frame 0 at 30 Hz covers four ticks and supplies input 0 to all of them; at 144 Hz frame 0 covers one tick. Indexing the script by frame therefore replays a *different input sequence* at each cadence.
**How to avoid:** The harness's input source is `inputAtTick(tick: number): InputFrame`, sampled inside the step loop. The interactive game may still sample the device once per frame (an input-latency choice); the *replay* contract is per tick. Say so in a comment — this is the distinction ARCHITECTURE.md's "input sampled once per frame" invariant can be misread to contradict.
**Warning signs:** The cadence test passes at 30/60/120 but not 144; adding a frame-rate tolerance makes it pass; the golden fixture changes when only `frames` changes.

### Pitfall 7: Negative zero and `NaN` make the hash lie

**What goes wrong:** Two ways, both silent. (a) A value of `-1e-9` serialises as `"-0.000000"` and a value of `0` as `"0.000000"`, so two semantically identical states hash differently and a golden fixture breaks on an unrelated refactor. (b) A state containing `NaN` serialises as `"NaN"` — a *stable* string — so a diverged simulation produces a constant hash and the golden test keeps passing while the game is broken.
**Why it happens:** `toFixed` does not normalise negative zero (verified: `(-0.0000004).toFixed(6) === "-0.000000"`), and `Number.isFinite` is not called anywhere by default.
**How to avoid:** `canon(n)`: throw on non-finite; re-parse the `toFixed` output and map `-0` to `0` before formatting. Assert finiteness on every field in the serializer, and add a unit test that `hashState` throws on `NaN`.
**Warning signs:** A golden hash changing when only the *last* operation in a step changed; a perfectly flat simulation that still "passes"; `-0` appearing in a serialized fixture.

### Pitfall 8: `tsconfig`-only purity enforcement is not enough

**What goes wrong:** The team adds a separate `tsconfig.sim.json` with no DOM lib, sees `typecheck` fail on `document`, and concludes `src/sim` is protected. Then someone writes `import { Vector3 } from 'three'` in the sim, `typecheck` passes, and the sim is coupled to the renderer — the exact thing FOUND-05 forbids.
**Why it happens:** `three` is a normal ES module with valid types. A restricted `lib` says nothing about imports. Verified: with `@types/three` installed, `tsc -p tsconfig.sim.json --noEmit` exits 0 on a file that imports Three.
**How to avoid:** Both gates (Pattern 5). Keep `no-restricted-properties` for `Math.random`/`Date.now`/`performance.now` and `no-restricted-syntax` for `new Date()` — those are ES globals, invisible to the `lib` trick.
**Warning signs:** `src/sim` importing anything but `./` and `../sim/`; a test importing Three to construct fixtures; `Math.random()` in a "temporary" seed.

### Pitfall 9: ESLint `projectService` cannot find any file

**What goes wrong:** `npx eslint .` fails on every file with `Parsing error: … was not found by the project service`, including `eslint.config.js` itself.
**Why it happens:** With only `tsconfig.app.json` / `tsconfig.sim.json` present, there is no project that includes config files or the JS ESLint config. Type-aware linting needs a program per file.
**How to avoid:** Ship a root `tsconfig.json` (`lib: ES2022 + DOM + DOM.Iterable`, `types: ["node"]`) whose `include` covers `src/**`, `tests/**`, `*.config.ts`, `tools/**`; add `allowDefaultProject: ['eslint.config.js']` for the single JS file that is not in a project. Do **not** also list `*.config.ts` there — verified error: "was included by allowDefaultProject but also was found in the project service."
**Warning signs:** Every file erroring at `0:0`; the error text naming your own config file.

### Pitfall 10: Chromium runs unsandboxed as root

**What goes wrong:** Nobody notices, because it works. Playwright's official image switches to a `pwuser`; a `node:*-slim` image runs as root, and Playwright's own docs say the Docker image "will use the `root` user to run the browsers. This will disable the Chromium sandbox which is not available with root." `[CITED: playwright.dev/docs/docker]`
**Why it happens:** Root in a container cannot use the Chromium setuid sandbox without extra capabilities/seccomp.
**How to avoid:** Accept it for Phase 1 and **write it down** in the README/Dockerfile comment: the tests only ever load `localhost` content that we serve, so the "trusted websites only" caveat applies. If later phases load anything untrusted, add a non-root `pwuser` and Playwright's seccomp profile. Also add `ipc: host` (Pattern 2) so Chromium does not run out of shared memory.
**Warning signs:** A plan task that adds `--no-sandbox` "to fix a launch error" (it is already effectively off); a test navigating to a third-party URL; flaky `Target crashed` errors under parallel e2e (missing `ipc: host`).

### Pitfall 11: Installing the TypeScript pair from `STACK.md` breaks `npm ci`

**What goes wrong:** `npm ci` aborts with `E404` for `@typescript/native`, or installs and leaves `node_modules/.bin/tsc` pointing at TS 7 while `typescript-eslint` type-checks with TS 6 — or the reverse, depending on link order.
**Why it happens:** See "Corrections to `STACK.md`". The package does not exist; the `@typescript/typescript6` package's bin is `tsc6`; and two packages both declaring a `tsc` bin collide.
**How to avoid:** `"typescript": "6.0.2"` alone. If the fast native compiler is wanted later, add `@typescript/native-preview` (bin `tsgo`) and call `tsgo --noEmit` from a separate `typecheck:fast` script.
**Warning signs:** `.bin/tsc --version` printing `7.x` while `package.json` says `6.0.2`; `npm ls typescript` showing two entries; a lockfile with `@typescript/native`.

### Pitfall 12: Licence files that technically exist but do not satisfy FOUND-06

**What goes wrong:** `LICENSE` is present but it is the *MIT* text from `npm init`; or `LICENSE` is GPL-2.0 but nothing anywhere says "or later"; or `NOTICE` credits Oolite but does not mention CC BY-NC-SA 3.0 for art/config; or the disclaimer is only in `README.md` and never ships in the built site.
**Why it happens:** Oolite's licence has two layers (code and art/config), the `or later` election is a statement rather than a file, and "visible in the shipped shell" is a rendering requirement, not a file requirement.
**How to avoid:** Treat the four artifacts as testable assertions: `LICENSE` byte-identical to the gnu.org GPL-2.0 text (md5 `570a9b3749dd0463a1778803b12a6dce`); `NOTICE` contains the strings `GPL-2.0-or-later`, `Oolite`, `CC BY-NC-SA 3.0`; the built `dist/index.html` contains the disclaimer sentence; `grep -Ei '\b(elite|oolite)\b'` over `<title>`, `<h1>` and meta tags returns nothing. Put the disclaimer in `index.html` so it is in the bundle by construction.
**Warning signs:** GitHub's licence detector says "Unknown"; the word "CC BY-NC-SA" and "GPL" appear in different documents with no statement of which applies to what; the app's tab title contains a trademark; a search for "or later" in the repo finds nothing.

---

## Code Examples

Every snippet below is copied from the scaffold that ran green in a container this session. Paths are project-relative.

### Dockerfile (verified: 1 m 29 s cold build, 1375 MiB, Chromium launches and renders WebGL2)

```dockerfile
# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS base
WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    CI=1
# Only the manifest pair, so `npm ci` and the Chromium layer are not invalidated by source edits.
COPY package.json package-lock.json ./

FROM base AS deps
RUN npm ci --no-audit --no-fund

FROM deps AS ci
# Bakes Chromium + every OS shared library it needs. Tests never download browsers.
RUN npx playwright install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/*
COPY . .

FROM ci AS dev
# Source normally arrives by bind mount; this stage exists so `up app` also works
# with no mount (e.g. a quick smoke run of the built image).
```

Pin the **index** digest (`docker buildx imagetools inspect` → `Digest: sha256:c86ecead…920c`), not the per-arch manifest, so both amd64 and arm64 resolve reproducibly.

### compose.yaml (verified: `docker compose config` OK, all seven services resolve, `verify` exits 0/1 correctly)

```yaml
name: wegolite

x-workspace: &workspace
  build:
    context: .
    target: ci
  image: wegolite-ci
  init: true
  volumes:
    - .:/app
    - wegolite-node-modules:/app/node_modules

services:
  app:
    <<: *workspace
    ports:
      - "5173:5173"
    command: ["npm", "run", "dev"]

  preview:
    <<: *workspace
    ports:
      - "4173:4173"
    command: ["sh", "-lc", "npm run build && npm run preview"]

  test:
    <<: *workspace
    command: ["npm", "test"]

  e2e:
    <<: *workspace
    ipc: host
    command: ["npm", "run", "test:e2e"]

  lint:
    <<: *workspace
    command: ["npm", "run", "lint"]

  typecheck:
    <<: *workspace
    command: ["npm", "run", "typecheck"]

  verify:
    <<: *workspace
    ipc: host
    command:
      - sh
      - -lc
      - >-
        npm run lint &&
        npm run typecheck &&
        npm run test &&
        npm run build &&
        npm run test:e2e

volumes:
  wegolite-node-modules:
```

### package.json scripts (the exact strings every compose service runs)

```json
{
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 5173 --strictPort",
    "build": "vite build",
    "preview": "vite preview --host 0.0.0.0 --port 4173 --strictPort",
    "typecheck": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.sim.json --noEmit",
    "lint": "eslint . && prettier --check .",
    "test": "vitest run",
    "test:e2e": "playwright test"
  }
}
```

`lint` = `eslint . && prettier --check .` because FOUND-05 says "lint/format" and putting format in `verify`'s first stage is the only way drift cannot slip through. `build` deliberately omits `tsc` — `typecheck` already ran earlier in the chain, and duplicating it doubles the slowest step.

### tsconfig.json (root; also the ESLint project service target)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "*.config.ts", "eslint.config.js", "tools/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

All three "extras" (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`) were enabled in the probe and the whole suite type-checked and linted clean — enable them now, they are near-free on greenfield code and expensive to add later.

### tsconfig.sim.json (the purity gate — no DOM lib, no ambient types)

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "lib": ["ES2022"], "types": [] },
  "include": ["src/sim/**/*.ts"],
  "exclude": ["**/*.test.ts"]
}
```

Verified effect: `src/sim/x.ts` using `document` → `error TS2584: Cannot find name 'document'`. Tests are excluded because they legitimately need `vitest` types; the implementation they exercise is still gated, and ESLint covers the test files.

### eslint.config.js (verified: catches Three, DOM globals, `Math.random`, `Date.now`)

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

const DOM_GLOBALS = [
  'window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB',
  'HTMLElement', 'HTMLCanvasElement', 'CanvasRenderingContext2D', 'WebGLRenderingContext',
  'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Image', 'fetch',
];

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['three', 'three/*', 'three/addons/*'], message: 'src/sim must stay renderer-free.' },
          { group: ['**/render/**', '**/ui/**', '**/input/**', '**/app/**', '**/persistence/**'], message: 'src/sim may only import src/sim and content/types.' },
        ],
      }],
      'no-restricted-globals': ['error', ...DOM_GLOBALS.map((name) => ({ name, message: 'src/sim must not touch the DOM.' }))],
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'Use the seeded PRNG in sim/math.' },
        { object: 'Date', property: 'now', message: 'No wall clock inside src/sim.' },
        { object: 'performance', property: 'now', message: 'No wall clock inside src/sim.' },
      ],
      'no-restricted-syntax': ['error', { selector: 'NewExpression[callee.name="Date"]', message: 'No Date inside src/sim.' }],
    },
  },
  prettier,
);
```

### vitest.config.ts (verified: reports one project named `unit`, 6 tests in 228 ms)

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
        },
      },
    ],
  },
});
```

### src/sim/hash.ts (FNV-1a + canonical numeric text)

Constants verified against the published FNV parameter table: 32-bit **FNV prime** `16777619` (`0x01000193`), **FNV offset basis** `2166136261` (`0x811c9dc5`); FNV-1a is "hash := hash XOR byte; hash := hash × FNV_prime". `[CITED: en.wikipedia.org/wiki/Fowler–Noll–Vo_hash_function]` (also standardised as IETF RFC 9923).

```ts
export function fnv1a32(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Canonical fixed-precision number text: no `-0`, finite only. */
export function canon(n: number, digits = 6): string {
  if (!Number.isFinite(n)) throw new Error(`non-finite value in state: ${String(n)}`);
  const r = Number(n.toFixed(digits));
  return (r === 0 ? 0 : r).toFixed(digits);
}
```

### src/sim/loop.ts (the accumulator the cadence test drives)

```ts
import { DT, MAX_FRAME_DELTA, MAX_STEPS_PER_FRAME, step } from './step.js';
import type { InputFrame, SimState } from './state.js';

export interface LoopResult { frames: number; steps: number; accumulator: number }

/**
 * The input log is indexed by TICK, not by frame: a determinism harness must replay a
 * per-tick log, otherwise the same log is chunked differently at each cadence.
 * The loop stops on a tick count, never on wall time — 144 Hz does not divide 1/120.
 */
export function runToSteps(
  s: SimState,
  frames: readonly number[],
  inputAtTick: (tick: number) => InputFrame,
  targetSteps: number,
): LoopResult {
  let acc = 0;
  let steps = 0;
  let i = 0;
  while (steps < targetSteps) {
    if (i >= frames.length) throw new Error('frame list exhausted before target step count');
    acc += Math.min(frames[i++] ?? 0, MAX_FRAME_DELTA);
    let n = 0;
    while (acc >= DT && n < MAX_STEPS_PER_FRAME && steps < targetSteps) {
      step(s, inputAtTick(s.tick), DT);
      acc -= DT;
      steps++;
      n++;
    }
    if (n === MAX_STEPS_PER_FRAME) acc = 0; // drop the backlog after a stall
  }
  return { frames: i, steps, accumulator: acc };
}
```

### src/sim/cadence.test.ts (verified: one hash across four cadences, 1200 ticks)

```ts
const TARGET_STEPS = 1200; // 10 s of simulated time at 1/120 s

const SCRIPT: readonly InputFrame[] = [
  { pitch: 0, roll: 1, thrust: 1 },
  { pitch: 0.5, roll: 0, thrust: 1 },
  { pitch: -0.25, roll: -1, thrust: 0 },
];
const inputAtTick = (tick: number): InputFrame => SCRIPT[tick % SCRIPT.length] as InputFrame;

function replay(hz: number): string {
  const state = initState();
  const frames = Array.from({ length: Math.ceil(10 * hz) + 10 }, () => 1 / hz);
  const result = runToSteps(state, frames, inputAtTick, TARGET_STEPS);
  if (result.steps !== TARGET_STEPS) throw new Error(`cadence ${hz} ran ${result.steps} steps`);
  return hashState(state);
}

it('is identical at 30, 60, 120 and 144 Hz when driven by step count', () => {
  const hashes = new Set([30, 60, 120, 144].map(replay));
  expect(hashes.size).toBe(1);
});
```

Keep, as a separate test, the measured counter-example (`1 s at 144 Hz → 119 steps`) with a comment explaining that it is the *harness's* limit, not the loop's, so nobody "fixes" it.

### src/render/camera-relative.ts (pure, no imports — safe to test in Node)

```ts
export interface Point3 { readonly x: number; readonly y: number; readonly z: number }

/** The one place absolute sim coordinates become render coordinates. */
export function cameraRelative(world: Point3, camera: Point3): { x: number; y: number; z: number } {
  return { x: world.x - camera.x, y: world.y - camera.y, z: world.z - camera.z };
}

/** float32 unit-in-the-last-place at magnitude x: 2^(floor(log2 x) - 23). */
export function f32Ulp(x: number): number {
  const m = Math.abs(x);
  if (m === 0) return Math.pow(2, -149);
  return Math.pow(2, Math.floor(Math.log2(m)) - 23);
}

export function f32Error(x: number): number {
  return Math.abs(Math.fround(x) - x);
}
```

### Renderer construction (the precision scene)

```ts
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  stencil: false,
  powerPreference: 'high-performance',
  logarithmicDepthBuffer: true, // never combine with reversedDepthBuffer (r187 ignores it)
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 2_500_000);
camera.position.set(0, 0, 0);      // the camera never leaves the origin
// bodies: obj.position = cameraRelative(worldPos, CAMERA_WORLD)
```

### playwright.config.ts (verified: starts `vite preview` in-container, 1 test, 1.9 s)

```ts
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'off', screenshot: 'off' },
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
```

The smoke test asserts, in this order: `webgl2 === true`; `renderer.info.render.calls > 0`; `triangles > 0`; `capabilities.logarithmicDepthBuffer === true`; `gl.getParameter(gl.DEPTH_BITS) >= 16`; camera-relative placement (`farRelZ ≈ -1.4e6`, `nearRelZ ≈ -1e5`); and `errors` (console errors + page errors) is empty. **Do not** add pixel reads or screenshots: with the default `preserveDrawingBuffer: false`, `gl.readPixels` after compositing returns zeros (verified — my first attempt failed exactly this way), and D-08 forbids pixel diffing anyway.

### index.html footer (the FOUND-06 visible disclaimer, verified rendering in `dist`)

```html
<footer>
  Wegolite is an unofficial fan project. Not affiliated with, endorsed by, or connected to the
  Oolite project, Frontier Developments plc, David Braben or Ian Bell. Elite and Cobra are
  trademarks of Frontier Developments plc.
</footer>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `test.workspace` file / `vitest.workspace.ts` | `test.projects` inside `vitest.config.ts` | Vitest 3 (workspace deprecated) | One config file; `--project unit` selects. Verified on 5.0.5. |
| `tsc` from the `typescript` package only | Native TS 7 compiler, with TS 6 retained for tooling | 2026-07-08 | 8–12× faster typecheck, but **no programmatic API in 7.0** and a `tsc` bin collision. Phase 1 uses TS 6 and keeps the door open via `tsgo`. |
| Rollup + esbuild production builds | Rolldown inside Vite 8 | 2026-03-12 | Same plugin API, 10–30× faster builds; my 8-module build took 620 ms. |
| Playwright base image with a bundled Node | `node:*-slim` + `npx playwright install --with-deps` | Endorsed by Playwright docs | One Node baseline across dev/ci; verified working on `bookworm-slim`. |
| `depends_on` chained services for CI | One container, one `sh -lc 'a && b'` chain | — | Real exit-code propagation; no parallel-start ambiguity. |
| Linear depth buffer with a huge `far` | Log depth (or reversed depth where `EXT_clip_control` exists) | Three.js r163+ | 0.18 m vs 1.19 km depth resolution at 100 km (measured/computed here). |

**Deprecated / do not use in this phase:**
- `vitest.workspace.ts` — replaced by `test.projects`.
- `typescript@7` as a drop-in for `typescript` while `typescript-eslint` peers on `<6.1.0`.
- `reversedDepthBuffer` — needs `EXT_clip_control`, not universal; and it silently disables `logarithmicDepthBuffer`.
- `new THREE.WebGLRenderer({ logarithmicDepthBuffer: true })` inside a `ShaderMaterial` that omits `<logdepthbuf_pars_vertex>` / `<logdepthbuf_vertex>` — custom shaders must include the chunks or they will not match the depth of built-in materials. `[CITED: node_modules/three/src/renderers/shaders/ShaderChunk]` (chunk names present in r187; Phase 1 ships no custom shaders).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | macOS Docker Desktop propagates inotify events into a bind mount so Vite HMR works without polling; only WSL2 is documented as broken. | Pitfall 4 | HMR silently dead for macOS contributors. Mitigated: opt-in `VITE_USE_POLLING` + `.env.example` note; needs one manual check on a Mac before the phase is called done. |
| A2 | `npm ci` needs no lifecycle scripts for this dependency set, so `--ignore-scripts` hardening is available later. | Standard Stack / Security | If a dependency does need a script, adding `--ignore-scripts` breaks the install. All 19 audited packages report `postinstall: null`, but that is per-package metadata, not a guarantee for transitive deps. |
| A3 | Chromium's effective sandbox is disabled under the container's root user (per Playwright's docs) and is acceptable because tests only load content we serve. | Pitfall 10 | If a later phase loads untrusted URLs in e2e, this becomes a real risk. Documented as a Phase 1-only posture. |
| A4 | `vite preview` is an acceptable "production bundle server" for Phase 1; real static hosting is Phase 7's problem. | Standard Stack | None for Phase 1; would matter if someone deployed the preview server publicly (Vite documents it as not a production server). |
| A5 | The licence/trademark wording proposed here is engineering risk reduction, not legal advice; `STATE.md` already flags a professional legal read before the first public post. | Pattern 6 / Pitfall 12 | Wording may need amendment after legal review. The file set and the automated checks survive unchanged. |
| A6 | Phase 1's `unit` Vitest project does not need coverage thresholds; `@vitest/coverage-v8` is optional. | Standard Stack | Coverage on a kinematic probe measures little; `QUAL-04` owns coverage from Phase 7. |
| A7 | All new source files can carry a one-paragraph GPL header; there is no vendored third-party code in Phase 1 to attribute. | Pattern 6 | If any snippet is copied from Oolite (Objective-C) rather than reimplemented, it needs its own attribution row in `ASSETS.md`. |

**If this table were empty** it would mean every claim was verified; it is not empty, and A1 is the one item that needs a real-machine check (macOS or WSL2) before Phase 1 is declared done.

---

## Open Questions (RESOLVED)

1. **Does `@typescript/native` exist, and is STACK.md's two-alias TypeScript setup usable?**
   - What we knew: STACK.md claims the TypeScript team recommends `typescript: npm:@typescript/typescript6` + `@typescript/native: npm:typescript`.
   - **RESOLVED:** No. `npm view @typescript/native` → `E404`. `@typescript/typescript6@6.0.2` ships bin **`tsc6`** (not `tsc`). Installing TS 6 and a TS 7 alias together lets link order decide which `tsc` wins (observed: TS 7 won). **Decision: `"typescript": "6.0.2"` only.** Optional later: `@typescript/native-preview` (bin `tsgo`) as a separate fast loop — different bin name, no collision.

2. **How should the cadence test be driven so 30/60/144 Hz are comparable?**
   - What we knew: D-10 says "synthetic frame deltas representing 30, 60, and 144 Hz, then asserts the final state hash is identical".
   - **RESOLVED:** Drive to a fixed **tick count** and index the scripted input by **tick**. Measured: frame-driven at 144 Hz gives 119 ticks per simulated second; frame-indexed input gives four distinct hashes across four cadences. Both counter-examples are codified as tests.

3. **Do we need a `tsconfig.sim.json` *and* ESLint rules, or is one enough?**
   - **RESOLVED:** Both. `tsc` with no DOM lib catches `document`/`window` (`TS2584`) but passes `import * as THREE from 'three'` when `@types/three` is installed. ESLint catches the import plus `Math.random`/`Date.now`. Verified in both directions.

4. **Which ESLint mechanism for the zone rule — `no-restricted-imports`, `eslint-plugin-import` zones, or `dependency-cruiser`?**
   - **RESOLVED:** Built-in `no-restricted-imports` + `no-restricted-globals` + `no-restricted-properties` + `no-restricted-syntax`. Zero extra dependencies, all four verified firing. `dependency-cruiser` would be a second toolchain for a rule one config block expresses.

5. **How does `verify` see the contributor's edits without a rebuild?**
   - **RESOLVED:** Every command service bind-mounts `. : /app` plus the named `node_modules` volume. Verified necessity: a non-mounted `verify` reported a lint error for a file that had already been moved. CI additionally runs `docker compose build` first.

6. **How do we keep the named `node_modules` volume from going stale (D-04 is locked to a named volume)?**
   - **RESOLVED:** `docker compose down --volumes` after any lockfile change, documented in `AGENTS.md` beside the existing `docker compose build --no-cache` rule. Verified that a rebuild alone leaves the old volume content in place.

7. **Does anything in Phase 1 require `ipc: host`?**
   - **RESOLVED:** Yes, `e2e` and `verify`. Playwright's docs recommend it for Chromium ("can run out of memory and crash") and Compose supports `ipc: host`.

8. **Should `near`/`far` be tightened to reduce depth error?**
   - **RESOLVED:** No. With logarithmic depth, resolution at 100 km is 0.176 m at `far = 2.5e6` versus 0.169 m at `far = 1.4e6` — a 4 % difference. Keep `near = 0.5`, `far = 2_500_000` for headroom and rely on the ULP/depth table, not on a tight far plane.

9. **How is the precision probe made machine-checkable without pixels?**
   - **RESOLVED:** Two checks per D-08, both verified: a Node unit test on `cameraRelative`/`f32Ulp` (including `f32Ulp(1.4e6) === 0.125` and "separation is exact in float64 at 1e6 m"), and a Playwright assertion set (`webgl2`, `renderCalls > 0`, `triangles > 0`, `logDepth === true`, `depthBits >= 16`, camera-relative placement, zero console errors). Pixel readback is **not** usable with the default `preserveDrawingBuffer: false` (verified: returns zeros) and D-08 forbids pixel diffing.

10. **Which TypeScript strictness extras?**
    - **RESOLVED:** Enable all three (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`) plus `noUnusedLocals`/`noUnusedParameters`/`noFallthroughCasesInSwitch`/`isolatedModules`. The full probe type-checked and linted clean with all of them on; greenfield is the cheapest moment to adopt them.

11. **Which ports, and how are they documented?**
    - **RESOLVED:** dev `5173`, preview `4173`, both `strictPort: true`, both published; no ports on `test`/`e2e`/`lint`/`typecheck`/`verify` (AGENTS.md rule). `.env.example` documents only `VITE_USE_POLLING`.

12. **Do lint/format also run in a git hook?**
    - **RESOLVED:** No hooks in Phase 1. `verify` is authoritative and hooks add an install step that violates the "only Docker" constraint. Revisit if contributors start pushing format-only commits.

13. **Which exact GPL text goes in `LICENSE`, and where does "or later" live?**
    - **RESOLVED:** `LICENSE` = the unmodified gnu.org GPL-2.0 text (338 lines, md5 `570a9b3749dd0463a1778803b12a6dce`). The `GPL-2.0-or-later` election is stated in `NOTICE` and in a one-line header per source file (FSF how-to: "make sure to clearly identify which versions of the license users can use").

14. **Is a `LICENSE-ASSETS` / `THIRD_PARTY_NOTICES` / `TRADEMARKS.md` needed on top of FOUND-06's four artifacts?**
    - **RESOLVED:** Not in Phase 1. FOUND-06 fixes the set (`LICENSE`, `NOTICE`, `ASSETS.md`, visible disclaimer) and no asset is committed yet. `ASSETS.md` is seeded with its column contract so the first Phase 2 asset has a row to land in; `NOTICE` already carries the CC BY-NC-SA 3.0 statement that a separate `LICENSE-ASSETS` would duplicate. `research/PITFALLS.md`'s extra files are a Phase 7 audit item.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker Engine | FOUND-01…04, 09 | ✓ | 29.8.2 (`29.7.2` server, overlay2) | — |
| Docker Compose (v2 CLI plugin) | every documented command | ✓ | 5.6.0 | — |
| Network egress for image + npm pulls | image build | ✓ | npm registry + Docker Hub + Playwright CDN reachable (Chromium downloaded in 72 s) | Pre-pulled base image / mirrored registry |
| Host Node | — | ✓ (present, **not authoritative**) | v26.10.0, npm 12.2.0 | Must not be used; `AGENTS.md` forbids it |
| Host Playwright browsers | — | ✗ | — | Not needed: baked into `wegolite-ci` |
| Host browser (manual check) | UAT of the shell | assumed ✓ | — | Playwright covers the automated path |
| 4 CPU / 31 GB RAM | image build + e2e | ✓ | measured | Chromium install and `vite build` are the peaks; 2 GB RAM is enough |

**Missing dependencies with no fallback:** none. Docker + Compose are the only host requirements, and both are present.

**Missing dependencies with fallback:** a macOS or WSL2 machine to confirm HMR without polling (A1). Not blocking: the Linux path is verified and the polling escape hatch is documented.

---

## Validation Architecture

Nyquist validation is enabled (`workflow.nyquist_validation: true` in `.planning/config.json`).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest `5.0.5` (Node project `unit`) + `@playwright/test` `1.64.1` (Chromium, headless) |
| Config file | `vitest.config.ts`, `playwright.config.ts` — both verified running in-container |
| Quick run command | `docker compose run --rm test` (≈ 4 s: `vitest run`, 6 tests, 228 ms of test time) |
| Full suite command | `docker compose run --rm verify` (lint → typecheck → unit → build → e2e; measured exit 0) |
| Single test | `docker compose run --rm test npx vitest run src/sim/cadence.test.ts` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| FOUND-01 | Dev server serves with HMR from a bind-mounted tree, no host Node | smoke (manual + scripted curl) | `docker compose up -d app && curl -fsS localhost:5173/ \| grep '@vite/client'` | ❌ Wave 0 — add `scripts/smoke-dev.sh` or a Compose `healthcheck` |
| FOUND-02 | Preview builds and serves the bundle | smoke | `docker compose up -d preview && curl -fsS localhost:4173/ \| grep -q 'foundation build'` | ❌ Wave 0 |
| FOUND-03 | The verify chain is the definition of done | integration (self-test) | `docker compose run --rm verify` → exit 0 | ✅ (the chain itself) |
| FOUND-03 | Verify fails fast on the first stage | negative test | `docker compose run --rm verify` with a seeded lint error → exit ≠ 0 | ❌ Wave 0 — document as a manual pre-merge check |
| FOUND-04 | Base pinned by digest; browsers baked in | static assertion | `grep -q 'node:24-bookworm-slim@sha256:' Dockerfile`; `docker run --rm wegolite-ci npx playwright install --dry-run chromium` reports "already installed" | ❌ Wave 0 |
| FOUND-05 | `src/sim` cannot import Three or touch the DOM | unit (compiler + linter as assertions) | `docker compose run --rm lint` and `… typecheck` both exit 0 on a clean tree; a seeded violation in each direction exits ≠ 0 | ❌ Wave 0 — add `tests/guards/sim-purity.test.ts` that shells out to `tsc`/`eslint` on a fixture, or keep as a documented manual check |
| FOUND-06 | Licence artifacts present; disclaimer ships | unit (file assertions) | `vitest run tests/compliance.test.ts` — LICENSE md5, NOTICE contains `GPL-2.0-or-later`/`Oolite`/`CC BY-NC-SA 3.0`, `dist/index.html` contains the disclaimer, no trademark in `<title>` | ❌ Wave 0 |
| FOUND-07 | Identical state hash at 30/60/120/144 Hz | unit | `vitest run src/sim/cadence.test.ts` | ✅ verified (3 tests) |
| FOUND-07 | Golden fixture replay | unit | `vitest run tests/golden/*.test.ts` | ❌ Wave 0 — `tests/golden/` needs the script + expected hash |
| FOUND-08 | Camera-relative transform numerics | unit | `vitest run src/render/camera-relative.test.ts` | ✅ verified (3 tests) |
| FOUND-08 | Shell renders the precision scene with no console errors | e2e | `playwright test tests/e2e/precision.spec.ts` | ✅ verified (1 test, 1.9 s) |
| FOUND-09 | Documented commands work verbatim | integration | `verify` + the dev/preview smoke scripts above; `grep` the command table against `compose.yaml` service names | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `docker compose run --rm test` (≈ 4 s) — cheap enough to be genuinely per-commit.
- **Per wave merge:** `docker compose run --rm verify` — the full chain, exit code is the gate.
- **Phase gate:** full suite green **in the container** before `/gsd-verify-work`, plus the manual macOS/WSL HMR check (A1) and the legal read already flagged in `STATE.md`.

### Wave 0 Gaps

- [ ] `tests/golden/` — one input script + its expected FNV-1a hash, checked in (D-11). Nothing else in Phase 1 produces a golden fixture, so this file defines the convention.
- [ ] `tests/compliance.test.ts` — the FOUND-06 file/render assertions listed above.
- [ ] `src/sim/__fixtures__/` — tiny violations used by the purity guard test, or a documented manual check if shelling out to `tsc` from Vitest proves too slow.
- [ ] `scripts/smoke-dev.sh` / `scripts/smoke-preview.sh` (or Compose `healthcheck`s) so FOUND-01/02 are machine-checked rather than hand-checked.
- [ ] No framework install needed — Vitest and Playwright are already in the image; `tests/e2e` and `vitest.config.ts` `include` already cover the new paths.

*(No gaps remain against `src/sim` or `src/render`: both are covered by the verified harnesses above.)*

---

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1`, `security_block_on: high`.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture / threat modelling | yes | Simulation/render/input separation enforced by `tsconfig.sim.json` + ESLint zones; the only runtime input surface in Phase 1 is the canvas. |
| V2 Authentication | no | No accounts, no backend (`PROJECT.md`). |
| V3 Session Management | no | No sessions, no cookies. |
| V4 Access Control | no | Static client, no authorisation decisions. |
| V5 Input Validation | yes (minimal) | Phase 1 has one input surface: the scripted input log and the synthetic frame deltas (test-only) plus `URL`/query parsing (none). Validate frame deltas with `Number.isFinite` and clamp to `MAX_FRAME_DELTA`; the serializer throws on non-finite state (`canon()`). |
| V6 Cryptography | no | FNV-1a is an integrity checksum for golden tests, explicitly **not** a security control (D-11, and `ARCHITECTURE.md` §Pattern 5 says the same of the save checksum). No secrets, no keys, no TLS termination. |
| V7 Error handling & logging | yes | The shell must not fail silently: `errors` must be empty in e2e; a WebGL2-less browser needs a message (WORLD-05, Phase 3, but the renderer construction is Phase 1 — fail loudly today rather than leave a blank canvas). |
| V10 Malicious code / supply chain | yes | Exact version pins + committed `package-lock.json` + `npm ci`; base image pinned by digest; no runtime CDN; no `postinstall` in the audited set; the Playwright package-legitimacy gate run and recorded above. |
| V12 Files & resources | yes | Static assets only; `.dockerignore` keeps `.git`, `.planning`, `node_modules`, `dist`, `test-results` out of the image (smaller attack surface and faster builds). |
| V14 Configuration | yes | `server.host: 0.0.0.0` is deliberate and only for dev/preview; `allowedHosts` stays default (do **not** set `true`); no secrets in `.env.example`; `dist/` is a static artefact with no runtime config. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Dependency confusion / typosquat on a near-miss package name | Tampering | Exact pins, lockfile, `npm ci`, and the legitimacy gate run recorded in this document. Never `npm install <pkg>` as a "quick fix" without adding it to the audit table. |
| Compromised published release of a legitimate package | Tampering | Digest-pinned base image, exact version pins, one consolidated human checkpoint on the frozen version set. |
| DNS rebinding against the dev server (`allowedHosts: true`) | Spoofing / Info disclosure | Leave `allowedHosts` at its default (localhost + IPs). Vite explicitly warns that `true` lets any site read the dev server's source (GHSA-vg6x-rcgg-rjx6). |
| Chromium sandbox disabled as root in the test container | Elevation of privilege | Scoped: e2e only loads `localhost` content we serve; documented (Pitfall 10); revisit before any untrusted-URL test. |
| Source/`.map` files leaking into the shipped bundle | Information disclosure | Phase 1 keeps `sourcemap: true` because the GPL source is public by design; the Phase 7 audit (`QUAL-07`) confirms nothing secret rides along. There are no secrets in this project. |
| `innerHTML` in the shell overlay with data-derived text | Tampering (XSS) | The Phase 1 overlay is static text; establish `textContent` as the house rule now, before Phase 5's station screens. |
| Unpinned browser download at test time | Tampering / availability | Browsers are baked at build time (`PLAYWRIGHT_BROWSERS_PATH`), never fetched during `verify`. Verified: `/ms-playwright` is populated in the image and `npx playwright --version` resolves offline. |

---

## Sources

### Primary (HIGH confidence)
- `npm view` against the live registry, 2026-11-02 — exact `version`, `bin`, `engines`, `peerDependencies`, `license` for `three@0.187.0`, `vite@8.3.5`, `vitest@5.0.5`, `typescript@6.0.2`, `typescript@7.0.2`, `@typescript/typescript6@6.0.2`, `@typescript/native-preview`, `@playwright/test@1.64.1`, `eslint@10.14.0`, `typescript-eslint@8.72.1`, `@eslint/js@10.0.1`, `globals@17.14.0`, `prettier@3.9.10`, `eslint-config-prettier@10.1.8`, `@types/node@24.19.2`, `@types/three@0.187.0`, `@vitest/coverage-v8@5.0.5`, `zod@4.6.7`, `idb-keyval@6.3.0`, `fast-check@4.10.2`, `tsx@4.23.15`, `@gltf-transform/core@4.5.1`.
- `docker buildx imagetools inspect node:24-bookworm-slim` — index digest `sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c`, created 2026-10-28, amd64 + arm64 manifests.
- Container experiments run in this session (Docker 29.8.2, Compose 5.6.0, Linux x86_64): multi-stage build, `docker compose config`, `docker compose run --rm verify` (exit 0 and exit 1), `up -d app` + curl, `up -d preview` + curl, Chromium WebGL2 probe, named-volume staleness test, `tsc`/ESLint purity probes.
- `node_modules/three/src/renderers/WebGLRenderer.js@0.187.0` lines 2424, 3731–3735 — `logarithmicDepthBuffer` / `reversedDepthBuffer` JSDoc and mutual-exclusion logic (quoted verbatim above).
- `https://raw.githubusercontent.com/OoliteProject/oolite/master/LICENSE.md` (fetched 2026-11-02, 165 lines) — GPL-2 "or any later version", art/config dual-licence, CC BY-NC-SA 3.0 URI.
- `https://www.gnu.org/licenses/old-licenses/gpl-2.0.txt` — 338 lines, md5 `570a9b3749dd0463a1778803b12a6dce`.
- `https://www.gnu.org/licenses/gpl-howto.html` — "make sure to clearly identify which versions of the license users can use"; the "version 2 or later" notice wording.
- `https://www.frontier.co.uk/legal/legal-notices` — trademark list and the Braben/Bell copyright line (quoted verbatim above).
- `https://docs.docker.com/engine/storage/volumes/` — empty-volume population from image content; Compose reuses the same volume on subsequent runs.
- `https://playwright.dev/docs/docker` — root user disables the Chromium sandbox; `--init` and `--ipc=host` recommendations; Alpine/musl unsupported; DIY `FROM node:*` + `npx playwright install --with-deps`.
- `https://vite.dev/config/server-options` — `server.host` default `'localhost'`; `server.port` 5173 with auto-increment unless `strictPort`; `server.allowedHosts` default `[]` and the DNS-rebinding warning; `server.watch` WSL2 limitation and `usePolling` CPU cost.
- `gsd-tools query package-legitimacy check --ecosystem npm` — verdicts and signals reproduced in the audit table.

### Secondary (MEDIUM confidence)
- `https://en.wikipedia.org/wiki/Fowler–Noll–Vo_hash_function` — FNV-1a algorithm order and the 32-bit parameter row (`16777619` / `2166136261`); the article cites IETF draft `draft-eastlake-fnv-17`, now RFC 9923.
- `https://creativecommons.org/licenses/by-nc-sa/3.0/` — HTTP 200, canonical licence URI as cited by Oolite's `LICENSE.md`.

### Tertiary (LOW confidence / needs a device)
- macOS Docker Desktop file-event propagation into bind mounts (A1) — inferred, not tested; WSL2 is the only case Vite documents as broken.

---

## Metadata

**Confidence breakdown:**
- **Standard stack: HIGH** — every version, `bin`, `engines` and peer range was read from the registry in this session, and the corrected TypeScript choice was validated by an actual `npm install` plus `tsc`/`eslint` runs.
- **Container topology: HIGH** — the exact `Dockerfile` + `compose.yaml` in this document were built and exercised (`verify` exit 0/1, `up app`, `up preview`) on this machine.
- **Determinism harness: HIGH** — the failing and passing variants were both observed; the numbers (119 vs 120 steps, 4 vs 1 hashes) are measurements, not estimates.
- **Precision strategy: HIGH** for the Three.js API semantics, the ULP table and the depth-resolution maths; **MEDIUM** for the long-term visual judgement (a SwiftShader render proves the pipeline, not how it looks on a discrete GPU — that is Phase 3's cross-browser pass).
- **Compliance: MEDIUM** — the source texts and trademark list are verified verbatim, but the wording and the licence election need the professional legal read `STATE.md` already flags.
- **Pitfalls: HIGH** for the twelve listed — all but Pitfall 4/A1 were reproduced, most of them by accident while building the probe.

**Research date:** 2026-11-02
**Valid until:** 2026-12-02 (30 days) for the container/toolchain layer; **7 days** for the pinned version set if `npm outdated` is checked before planning, because `three`, `vite`, `vitest`, `eslint` and `prettier` all shipped within the last three weeks. Re-run Tier 1 version verification at the start of implementation.

---

*Phase: 1 — Foundation, Containers & Compliance*
*Research completed: 2026-11-02*


