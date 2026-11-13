---
phase: "01"
phase_name: Foundation, Containers & Compliance
status: secured
threats_total: 22
threats_mitigated: 19
threats_open: 0
threats_accepted: 3
asvs_level: 1
block_on: high
created: "2026-11-02"
auditor: gsd-security-auditor
---

# Phase 01 — Security Verification

Retroactive verification of the threat register declared across `01-01-PLAN.md`
through `01-07-PLAN.md`. ASVS level 1: the standard applied is that each
declared mitigation is **present in the cited file at the cited location**, not
that a plan intended it. Behavioural claims are accepted only where a committed
test or script in this repository asserts them; recorded run output from a
SUMMARY is cited as corroboration, not as the primary evidence.

- Threats declared: **22** (T-01-01 … T-01-21 plus the supply-chain row `T-01-SC`, which every plan declares).
- Threats mitigated: **19**. Threats accepted (T-01-12, T-01-16, T-01-21): **3**. Total closed: **22**.
- Open threats: **0** (`block_on: high`).
- Gap-closure plan `01-07` added the browser-supplied resize boundary (T-01-20)
  and the additive `renders` probe field (T-01-21); both were re-verified against
  the committed `src/main.ts`, not against the plan prose. Summary `## Threat
  Flags` in `01-01` … `01-06` read "None"; `01-07` states "None" while naming
  the two new threats. The audit found three unregistered low-severity
  observations in the first pass, recorded at the end; the probe one is now
  registered as T-01-21.

## Threat register

| ID | Description | Severity | Disposition | Mitigation (declared) | Evidence | Verdict |
|----|-------------|----------|-------------|-----------------------|----------|---------|
| T-01-01 | Tampering of the `package.json` / `package-lock.json` dependency tree | high | mitigate | Exact pins, committed in-container lockfile, `npm ci` only, human legitimacy checkpoint before first install | `package.json:18-33` (every dependency an exact version, no `^`/`~`), `package-lock.json:1-5` (lockfileVersion 3, 168 `integrity` entries), lockfile tracked (`git ls-files`), `Dockerfile:18` (`npm ci --no-audit --no-fund`), no `npm install` in any script/test (`package.json:9-17`; grep across tree finds only the prohibition in `AGENTS.md:58`), checkpoint gate `01-01-PLAN.md:110-129` approved out of band (`01-01-SUMMARY.md:156`), only commit `602d091` ever touched the manifest pair | CLOSED |
| T-01-02 | Elevation of privilege via Chromium in the `e2e` / `verify` container | medium | mitigate | Sandbox-disabled-as-root posture documented and scoped to localhost content; console errors asserted empty | `Dockerfile:25-28` (explicit accepted-posture comment naming `e2e`/`verify`, localhost-only, revisit clause), `playwright.config.ts:17` (`baseURL: http://127.0.0.1:4173`), `tests/e2e/precision.spec.ts:9-13,43` (console `error` and `pageerror` collected and asserted `toEqual([])`), `README.md:41` (posture restated) | CLOSED |
| T-01-03 | Tampering via the `ci` stage browser install | high | mitigate | Browsers baked at image-build time via a fixed `PLAYWRIGHT_BROWSERS_PATH`; no download at test time | `Dockerfile:11` (`ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright` in `base`, inherited by every stage), `Dockerfile:29-30` (install only in the `ci` build stage), no `playwright install` anywhere else (grep: only `Dockerfile:23` comment and `Dockerfile:29`), recorded offline check `01-06-SUMMARY.md:136` (`docker run --network none … ls /ms-playwright` → chromium present) | CLOSED |
| T-01-SC | Tampering via npm/pip/cargo installs and base-image pulls (declared in all six plans) | high | mitigate | Legitimacy gate + digest-pinned base + exact pins + `npm ci` + committed lockfile; no plan adds a dependency | `Dockerfile:7` (single `FROM node:24-bookworm-slim@sha256:c86ecead…920c`, index digest, no `:latest`; `grep -nE ':latest'` returns nothing), `Dockerfile:15,18` (manifest pair copied, `npm ci`), `package.json:18-33`, `package-lock.json`, `git log -- package.json package-lock.json` shows a single manifest commit across waves 1–6, so plans 02–06 added nothing; `Dockerfile:21-30` is the only OS-package fetch (`playwright install --with-deps`) and it is build-time only | CLOSED |
| T-01-04 | Tampering of the sim/render boundary via `eslint.config.js` | high | mitigate | Every zone rule at `error`, ignore list free of `src/**`, guard test proves the rules fire | `eslint.config.js:37-42` (fixed four-entry ignore list: `dist`, `node_modules`, `playwright-report`, `test-results`), `eslint.config.js:63-118` (zone scoped to `src/sim/**/*.ts`; `no-restricted-imports`, `no-restricted-globals`, `no-restricted-properties`, `no-restricted-syntax` all `"error"`), `tests/guards/sim-purity.test.ts:60-75,99-103` (asserts `no-restricted-imports` and `no-restricted-globals` diagnostics on generated probes, cleaned in `finally`), no `eslint-disable` / `@ts-ignore` / `@ts-expect-error` in the tree (`git grep` → none) | CLOSED |
| T-01-05 | Tampering of lint coverage via `parserOptions.projectService` | medium | mitigate | Root tsconfig covers `src`, `tests`, `*.config.ts`; `allowDefaultProject` names only `eslint.config.js`; `eslint .` runs from a clean tree | `tsconfig.json:19-26` (`src/**/*.ts`, `tests/**/*.ts`, `*.config.ts`), `eslint.config.js:49-57` (`projectService.allowDefaultProject: ["eslint.config.js"]` only), `package.json:14` (`lint` = `eslint . && prettier --check .`), `compose.yaml:74` (lint is the first link of the `verify` chain) | CLOSED |
| T-01-06 | Tampering of the `tsconfig.sim.json` purity gate coverage | medium | mitigate | `lib: ["ES2022"]` + `types: []` strip DOM identifiers; tests excluded only from the purity project; guard test asserts the gate fails | `tsconfig.sim.json:12-13` (`lib: ["ES2022"]`, `types: []`), `tsconfig.sim.json:19` (`include: ["src/sim/**/*.ts", "src/render/camera-relative.ts"]`), `tsconfig.sim.json:22` (excludes only `**/*.test.ts`; `eslint.config.js:63` still covers test files), `tests/guards/sim-purity.test.ts:85-95` (asserts `TS2584` on a `document` probe). **Deviation:** the register also claims the guard test asserts the *include list* itself; it does not — it proves the gate fails behaviourally, which is the stronger property, and the include list is present as configured | CLOSED (deviation noted) |
| T-01-07 | Tampering of the golden hash via non-finite state in `canon()` | high | mitigate | `canon` throws on any non-finite value; the cadence suite forces `NaN` | `src/sim/hash.ts:29-35` (`if (!Number.isFinite(n)) throw new Error(...)` before formatting), `src/sim/state.ts:43-54` (every numeric field routed through `canon`), `src/sim/cadence.test.ts:67-71` (assigns `Number.NaN`, expects `throw /non-finite/`) | CLOSED |
| T-01-08 | Tampering of determinism in `step()` | high | mitigate | `dt` is a parameter, no clock or randomness read, ESLint bans the sources at `error`, four cadences hash identically | `src/sim/step.ts:35` (`step(state, input, dt)` — `dt` explicit; body lines 36-57 uses only `dt` and state), `src/sim/loop.ts:50` (caller passes `DT`), `eslint.config.js:93-117` (`Math.random`, `Date.now`, `performance.now`, `new Date` all `"error"`), `src/sim/cadence.test.ts:53-56` (30/60/120/144 Hz → one hash), `src/sim/step.ts:30-33` documents the contract | CLOSED |
| T-01-09 | Tampering of the golden fixture `tests/golden/kinematic-probe.json` | medium | mitigate | Versioned fixture, in-container generation, replay test asserts version and 8-hex shape | `tests/golden/kinematic-probe.json:2` (`"version": 1`), `:12` (`"hash": "1c079894"`), `tests/golden/kinematic-probe.test.ts:35` (version asserted), `:40` (`/^[0-9a-f]{8}$/` asserted), `:44-47` (replay equals recorded hash) | CLOSED |
| T-01-10 | Denial of service from silent renderer failure in `src/main.ts` | high | mitigate | Missing canvas or absent WebGL2 throws a readable error; e2e asserts real WebGL2 and empty error list | `src/main.ts:59-67` (`requireCanvas` throws with the expected markup named), `:80-86` (renderer construction failure rethrown with cause), `:89-96` (non-WebGL2 context throws), `tests/e2e/precision.spec.ts:26` (`webgl2 === true`), `:30` (`depthBits >= 16`), `:43` (`errors` empty) | CLOSED |
| T-01-11 | Tampering via overlay text injection in `src/main.ts` | medium | mitigate | `textContent` only; no `innerHTML` anywhere in `src/` | `src/main.ts:149-150,154-159` (both overlay writes are `textContent` from constant strings), `grep -rn "innerHTML\|outerHTML\|insertAdjacentHTML\|dangerouslySet" src/ tests/ index.html` → no matches | CLOSED |
| T-01-12 | Information disclosure via `sourcemap: true` in `vite.config.ts` | low | accept | Accepted: the source is GPL and public; Phase 7 licensing audit re-checks | `vite.config.ts:28-32` (`sourcemap: true` with the deliberate rationale comment) — accepted risk recorded in this document; no secrets exist in the tree (`grep` for key/secret/token/password/private-key across source, config, scripts, `Dockerfile`, `compose.yaml` → no matches; `git ls-files` shows only `.env.example`) | CLOSED (accepted) |
| T-01-13 | Spoofing via product identity in `index.html`, `package.json`, README | high | mitigate | Title and package name checked against Elite/Oolite tokens; footer and NOTICE carry the non-affiliation sentence | `tests/compliance.test.ts:151-166` (extracts `<title>` and asserts no `/\b(elite\|oolite)\b/i`; asserts `name === "wegolite"`), `index.html:6` (clean title), `:61-66` (visible disclaimer), `NOTICE:51-55` (repeats it), `README.md:7-9`, e2e `tests/e2e/precision.spec.ts:38-40` (rendered footer asserted) | CLOSED |
| T-01-14 | Tampering of `LICENSE` | medium | mitigate | Canonical GPL-2 text pinned by md5 and re-checked every run | `tests/compliance.test.ts:27` (`CANONICAL_GPL2_MD5 = "570a9b3749dd0463a1778803b12a6dce"`), `:79-86` (md5 recomputed and asserted); local verification `md5sum LICENSE` → `570a9b3749dd0463a1778803b12a6dce` (matches) | CLOSED |
| T-01-15 | Repudiation of asset provenance via `ASSETS.md` | medium | mitigate | Provenance table and column contract exist before the first asset; header row asserted | `ASSETS.md:3-5` ("No asset may be committed … without a row"), `:13-14` (header row and separator), `tests/compliance.test.ts:130-139` (asserts the exact header row and the policy sentence) | CLOSED |
| T-01-16 | Information disclosure via `NOTICE` / `README.md` | low | accept | Accepted: both are public documents about a GPL project with no secrets or personal data | `NOTICE:1-59`, `README.md:1-60` — reviewed; no credentials, tokens, internal hostnames or personal data; accepted risk recorded in this document | CLOSED (accepted) |
| T-01-17 | Repudiation of the `verify` result via the `compose.yaml` verify service | high | mitigate | One `&&` chain with no `depends_on` fan-in; a script proves the chain fails at the first stage and names the seeded fault | `compose.yaml:67-78` (single `sh -lc` chain: lint `&&` typecheck `&&` test `&&` build `&&` test:e2e), no `depends_on` in the file, `scripts/check-verify-fails-fast.sh:26-37,41-58` (seeds a sim-zone Three import, requires both non-zero status *and* output naming `no-restricted-imports`/`__verify_probe`, `trap … EXIT` cleanup at `:31`) | CLOSED |
| T-01-18 | Tampering via stale bind mount + named `node_modules` volume | high | mitigate | Every service carries `.:/app` and the named volume; refresh rule documented; cold-state run proves repopulation | `compose.yaml:18-26` (shared `x-workspace` anchor with both mounts and `init: true`), all seven services inherit via `<<: *workspace` (`compose.yaml:30,36,43,47,57,61,65`), `README.md:39` and `AGENTS.md:47-52,63` (refresh rule), cold-state evidence `01-06-SUMMARY.md:135` (`down --volumes` → `build` → `verify` exit 0) | CLOSED |
| T-01-19 | Tampering via stale services left by the smoke scripts | low | mitigate | Scripts assert HTTP body content and tear down on every exit path | `scripts/smoke-dev.sh:22` (`trap 'docker compose down' EXIT`), `:29-34` (body must contain `@vite/client`), `scripts/smoke-preview.sh:24` (`trap … EXIT`), `:31-36` (body must contain `foundation build`) | CLOSED |
| T-01-20 | Denial of service via the `src/main.ts` resize handler (browser-supplied viewport dimensions) | medium | mitigate | Zero-size guard ordered before the first `renderer.setSize`/`camera.aspect` write; exactly one synchronous render per resize event; no queue, timer or loop | `src/main.ts:133-143` — reads `window.innerWidth`/`innerHeight` at `:134-135`, early-returns at `:138` when either is `0`, `renderer.setSize` at `:139`, `camera.aspect` at `:140`, single `renderFrame()` as the final statement at `:142`. Ordering gate: guard line 138 < setSize 139 < aspect 140 (awk assertion in `01-07-PLAN.md:127`). `renderFrame()` is the only render path and `grep -rn 'renderer.render(' src/` returns only `src/main.ts:123`; `resize` is bound once at `:145` with one boot call at `:146`, so each event renders once and nothing accumulates. No `requestAnimationFrame`, `setAnimationLoop`, `setInterval`, `setTimeout`, `ResizeObserver`, `queueMicrotask` or `requestIdleCallback` anywhere in `src/` (grep → none), matching the plan's `! grep -rq 'requestAnimationFrame\|setAnimationLoop' src/` gate. Runtime corroboration: `docker compose run --rm e2e` → 2 passed, including `tests/e2e/resize.spec.ts:48-60,64-75` (resize and restore each advance `renders` and reallocate the buffer). The zero-size failure mode itself is proven statically only — Playwright cannot request a 0×0 viewport — which the plan records at `01-07-PLAN.md:214` | CLOSED |
| T-01-21 | Information disclosure via `window.__wegolite.renders` | low | accept | Accepted: render-derived integer, additive to an already-unconditional public probe; carries no simulation, input or user data | `src/main.ts:29` (`renders: number` added to `WegoliteProbe`), `:129` (value copied from `renderer.info.render.frame`, three's own counter), `:165-176` (probe published unconditionally next to the pre-existing `calls`, `triangles`, depth and scene constants), only consumer is `tests/e2e/resize.spec.ts:29-32,43`; accepted risk recorded below | CLOSED (accepted) |

## Open threats

None. `threats_open: 0` with `block_on: high` — no high or critical threat is
unmitigated, and no open threat sits below the threshold either.

## Accepted risks (recorded, not open)

| ID | Severity | Risk | Rationale / owner |
|----|----------|------|-------------------|
| T-01-12 | low | Production bundle ships sourcemaps (`vite.config.ts:31`), exposing implementation internals. | Deliberate: the project is GPL-2.0-or-later and ships corresponding source. No secret is compiled into the bundle. Re-checked by QUAL-07 in Phase 7. |
| T-01-16 | low | `NOTICE` and `README.md` are public and describe the project's provenance and licence chain. | No secrets, source code, hostnames or personal data. Reviewed line by line this phase. |
| T-01-21 | low | `window.__wegolite.renders` publishes a render-derived integer in the production bundle. | It reveals only that a frame was drawn, which the canvas already shows. No simulation state, input or user data is reachable from the probe. Registered by `01-07`; revisit if the probe gains richer fields or is gated on `DEV`. |

Accepted posture carried inside T-01-02: Chromium runs as root inside the test
containers with its sandbox disabled. Scoped to `localhost` content served by
this repository (`playwright.config.ts:17`); must be revisited before any test
navigates to an untrusted URL (`Dockerfile:28`).

## Unregistered attack surface observed (non-blocking)

These are not registered threats, so they do not affect `threats_open`. They are
recorded because the SUMMARY files claim "Threat Flags: None".

| Observation | Evidence | Why it is non-blocking |
|-------------|----------|------------------------|
| `.env` is gitignored but **not** in `.dockerignore`, and `ci` runs `COPY . .`, so a developer's local `.env` would be baked into the image. | `.gitignore:5`, `.dockerignore:1-7` (no `.env`), `Dockerfile:31` | No `.env` exists in the tree today and the only documented variable is a non-secret polling flag (`.env.example:10`). Recommend adding `.env*` to `.dockerignore` before Phase 2 introduces build-time config. |
| No `USER` directive in the image; `app`, `preview`, `test` and `lint` also run as root inside the container (only Chromium's sandbox posture is registered). | `Dockerfile` (no `USER`), `compose.yaml:18-26` (no `user:`) | Container-scoped root behind a bind mount of the working tree; no privileged flag, no host mount beyond the repo, no published port for test services. Register a low threat when a non-root image becomes feasible. |
| The debug probe object `window.__wegolite` is published unconditionally, including in the production bundle. | `src/main.ts:165-176` (`window.__wegolite = { ... }`, outside the `import.meta.env.DEV` guard at `:153`) | **Now registered as T-01-21** after `01-07` added `renders`. It exposes only renderer statistics already visible in the page and DevTools; no state, credentials or input. It is the assertion surface for `tests/e2e/precision.spec.ts` and `tests/e2e/resize.spec.ts`. Consider gating on `DEV` when the probe becomes richer. |

## Verification basis

- Register extracted from `<threat_model>` in `01-01-PLAN.md:211-228`,
  `01-02-PLAN.md:172-188`, `01-03-PLAN.md:161-177`, `01-04-PLAN.md:136-152`,
  `01-05-PLAN.md:188-206`, `01-06-PLAN.md:142-158`, and `01-07-PLAN.md:189-205`.
  `01-07` is the phase's final gap-closure plan and its threat table adds
  T-01-20 (mitigated) and T-01-21 (accepted); T-01-SC is declared again and
  remains closed on the same evidence because `01-07` adds no dependency or image.
- Every claim above was confirmed against the working tree at commit `b6d2ade`;
  no claim rests solely on a SUMMARY narrative. Recorded run output is cited only
  as corroboration for behaviour that a committed test or script already asserts.
- Re-verification for `01-07` ran `docker compose run --rm e2e` in the container:
  2 passed (`precision.spec.ts`, `resize.spec.ts`), which is the runtime half of
  T-01-20. The static half was checked directly: guard at `src/main.ts:138`
  precedes `setSize` at `:139` and `camera.aspect` at `:140`, `renderFrame()` is
  the sole render path and runs once per event, and no loop/timer/observer token
  exists under `src/`.
- No implementation file was modified by this audit. This document is the only
  file written.

## Residual risk

Phase 1 ships a static browser client with no backend, no authentication, no
user data and no persistence (IndexedDB arrives in Phase 6), so the realistic
attack surface is the build chain, not the running app. The only runtime input
added by `01-07` is the browser's own viewport size on the resize path, and it is
bounded to one synchronous render per event behind a zero-size guard (T-01-20).
The remaining exposure is supply-chain and provenance: the base image and the
fourteen pinned packages
are trusted because a human approved that exact set once (`01-01-SUMMARY.md:156`)
and the lockfile plus `npm ci` freeze it thereafter — a future dependency change
reshapes that trust decision and must repeat the checkpoint. The other standing
risk is licensing, not security: `ASSETS.md` is empty, so nothing is committed
under CC BY-NC-SA 3.0 yet, and the non-affiliation wording still awaits the
professional legal read recorded in `NOTICE:57-60`. Neither weakens a declared
mitigation in this phase.

## Security Audit 2026-11-02

| Metric | Count |
|---|---|
| Threats found | 22 |
| Closed | 22 |
| Open | 0 |
