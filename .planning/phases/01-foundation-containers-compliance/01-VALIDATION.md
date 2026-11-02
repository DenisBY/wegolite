---
phase: "01"
slug: "foundation-containers-compliance"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-02"
validated: "2026-11-02"
---

# Phase 01 — Validation Strategy

> Per-requirement validation contract for feedback sampling during execution.
> Refreshed by `validate-phase` on 2026-11-02 against the committed tree; every
> row below names evidence that exists on disk and was executed in the container.
> 01-07 re-measured the suite inventory against the committed tree on 2026-11-02;
> the current totals are 35 unit tests and 2 browser tests.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `5.0.5` (Node project `unit`) + `@playwright/test` `1.64.1` (Chromium, headless, baked into the `ci` image stage) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `docker compose run --rm test` — 6 files, 35 tests, ~7 s |
| **Full suite command** | `docker compose run --rm verify` (lint → typecheck → unit → build → e2e) — ~20 s, 35 unit + 2 e2e |
| **Live infrastructure checks** | `sh scripts/smoke-dev.sh`, `sh scripts/smoke-preview.sh`, `sh scripts/check-verify-fails-fast.sh` (need a Docker daemon on the host; not nested inside `verify`) |

---

## Sampling Rate

- **After every task commit:** Run `docker compose run --rm test`
- **After every plan wave:** Run `docker compose run --rm verify`
- **Before `/gsd-verify-work`:** Full suite must be green **in the container**
- **Max feedback latency:** 60 seconds (measured ~7 s quick, ~20 s full on the reference machine)

---

## Per-Requirement Verification Map

Every requirement now has automated evidence inside `docker compose run --rm test`
or `docker compose run --rm verify`. Where live behaviour needs a Docker daemon
that the test container does not have, the in-suite contract test pins the
compose/script/docs contract and the live script is named alongside it.

| Requirement | Threat Ref | Secure / required behavior | Test Type | Automated Evidence | Status |
|-------------|------------|----------------------------|-----------|--------------------|--------|
| **FOUND-01** | — | Dev server serves the HMR client on 5173; no host Node/npm | unit (runtime) + contract; live smoke | `tests/contract/container-contract.test.ts` boots the real Vite dev server from the test container and asserts the served body contains `@vite/client`; the same file pins `app` → `5173:5173` → `npm run dev`. Live wrapper: `sh scripts/smoke-dev.sh`. | ✅ green |
| **FOUND-02** | — | Preview builds then serves the production bundle on 4173 | contract + e2e; live smoke | `tests/contract/container-contract.test.ts` pins build-before-serve ordering, `4173:4173`, the `foundation build` marker and the preview npm script; `tests/e2e/precision.spec.ts` loads the built bundle through `vite preview` during `verify`. Live wrapper: `sh scripts/smoke-preview.sh`. | ✅ green |
| **FOUND-03** | — | `test`, `e2e`, `lint`, `typecheck`, `verify` run in containers; `verify` is the fail-fast definition of done | integration + contract | `docker compose run --rm verify` is itself the gate. `tests/contract/container-contract.test.ts` pins the exact `npm run lint && npm run typecheck && npm run test && npm run build && npm run test:e2e` chain, the shared `target: ci`, the absence of `depends_on`, and the fail-fast rehearsal's assertions. `scripts/check-verify-fails-fast.sh` performs the live seeded-failure rehearsal. | ✅ green |
| **FOUND-04** | T-01-01, T-01-03 | Base image digest-pinned; dependency layer cached; Chromium baked, never downloaded at test time | unit (runtime + static contract) | `tests/contract/container-contract.test.ts` asserts exactly one external `FROM` pinned `node:24-bookworm-slim@sha256:<64 hex>`, no `:latest`, manifest copy before `COPY . .`, `npm ci`, exact package pins, no `playwright install` on any runtime surface, and that `/ms-playwright` in the running test image contains `chromium-*` and `chromium_headless_shell-*`. | ✅ green |
| **FOUND-05** | T-01-04, T-01-05, T-01-06 | Strict TS + a `src/sim/` zone that rejects Three imports and DOM globals; gates can actually fail | unit + compiler/linter | `tests/guards/sim-purity.test.ts` writes probes at runtime and proves ESLint `no-restricted-imports` / `no-restricted-globals` and `tsc -p tsconfig.sim.json` `TS2584` fire. Clean-tree `docker compose run --rm lint` and `--rm typecheck` are green in `verify`. | ✅ green |
| **FOUND-06** | — | `LICENSE`, `NOTICE`, `ASSETS.md`, and a shipped non-affiliation/trademark disclaimer | unit + e2e | `tests/compliance.test.ts` (10 cases: canonical GPL text hash, NOTICE election/attribution/CC terms/source offer/disclaimer, ASSETS columns, title and package-name trademark check, tree-wide SPDX walk with vacuity guard); the e2e spec asserts the footer text in the built shell. | ✅ green |
| **FOUND-07** | T-01-07, T-01-08 | Deterministic 1/120 s fixed step; identical state hash across cadences | unit | `src/sim/cadence.test.ts` (one hash at 30/60/120/144 Hz to 1200 steps; measured 144 Hz one-second counter-example; non-finite rejection) and `tests/golden/kinematic-probe.test.ts` (versioned fixture replays to `1c079894`). | ✅ green |
| **FOUND-08** | — | Camera-relative marker at 1.4e6 m without float32 jitter or z-fighting | unit + e2e | `src/render/camera-relative.test.ts` (exact 100 m separation at 1e6 m; `f32Ulp(1.4e6) === 0.125`; half-ULP bound proving no `Math.fround`); `tests/e2e/precision.spec.ts` asserts WebGL2, log depth, depth bits, `nearRelZ`/`farRelZ`/`farUlp`, and zero console/page errors; `tests/e2e/resize.spec.ts` proves a repaint after resizing and after restoring the window (render-counter advance plus drawing-buffer size). | ✅ green |
| **FOUND-09** | — | `AGENTS.md` documents the container-only workflow; commands work verbatim | unit (contract) + live rehearsal | `tests/contract/container-contract.test.ts` requires the set of `docker compose run --rm` / `up` targets in both `AGENTS.md` and `README.md` to equal the declared Compose services exactly, and every referenced `npm run <script>` to exist in `package.json`. The scripts and cold-state `verify` rehearsal execute the commands verbatim. | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Validation Audit (validate-phase, 2026-11-02)

### Baseline measured

- `docker compose run --rm test`: **5 files / 19 tests** green.
- `docker compose run --rm verify`: green end to end.
- Requirements with no in-suite evidence: **FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-09**. Their evidence existed as shell scripts (`scripts/smoke-*.sh`, `scripts/check-verify-fails-fast.sh`), Compose/Dockerfile configuration, and prose in `README.md`/`AGENTS.md` — all correct, but never sampled by the `test` stage.

### Gap closure

Added `tests/contract/container-contract.test.ts` (16 tests), committed as `b953747`:

- FOUND-01: boots the real Vite dev server in the container and asserts the HMR client is served on 5173; pins the `app` service/port/script wiring and the polling escape hatch.
- FOUND-02: pins build-before-serve ordering, the 4173 mapping, the served marker, and the preview script.
- FOUND-03: pins the five command services, the shared `ci` target, the exact fail-fast `&&` chain, and the rehearsal script's non-zero/output requirements.
- FOUND-04: pins the single digest-pinned external base, stage graph, cached dependency layer, exact package pins, absence of test-time browser downloads, and asserts the baked Chromium directory from inside the running image.
- FOUND-09: pins exact service/command-set equality across `compose.yaml`, `AGENTS.md` and `README.md`, plus the container-only rule and operational traps.

### Result after closure

- `docker compose run --rm test`: **6 files / 35 tests** green.
- `docker compose run --rm verify`: green (lint → typecheck → 35 unit → build → 2 e2e).

### Defects found

None. No production behaviour was changed; the two failures during authoring were corrected test expectations (YAML argv renders as `- sh` / `- -lc`; the Dockerfile legitimately has five stages from one pinned external image), not implementation bugs.

---

## Wave 0 Requirements

- [x] `tests/golden/kinematic-probe.json` + `kinematic-probe.test.ts` — versioned input log pinned to the in-container FNV-1a hash `1c079894` (D-11).
- [x] `tests/compliance.test.ts` — LICENSE text/hash, NOTICE terms, `ASSETS.md` contract, `index.html` disclaimer, trademark-free title/name, and the tree-wide S-6 SPDX walk. Built-bundle disclaimer is covered by `tests/e2e/precision.spec.ts`.
- [x] `src/sim/` purity probes — generated and deleted at test time inside `tests/guards/sim-purity.test.ts`, rather than committed fixtures (a committed Three import inside the zone would fail the clean-tree lint).
- [x] `scripts/smoke-dev.sh` / `scripts/smoke-preview.sh` — machine checks for FOUND-01/02, with `trap` teardown and body assertions.
- [x] `tests/contract/container-contract.test.ts` — **added by this audit** to bring FOUND-01/02/03/04/09 into the sampled suite.
- [x] No framework install needed — Vitest, Playwright and Chromium are in the `ci` image stage.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Hot reload on host file edit | FOUND-01 | File-event propagation into bind mounts is host-specific (macOS/WSL2); the suite proves the HMR client is served, not that a host edit triggers a reload | Edit `index.html` in a running `docker compose up app`; confirm the browser updates without a restart. On macOS/WSL2 set `VITE_USE_POLLING=1` if no update appears. |
| Verify fails fast on a seeded lint error | FOUND-03 | Deliberately breaking the tree and spawning a nested `verify` needs a host Docker daemon | Run `sh scripts/check-verify-fails-fast.sh`; confirm a non-zero exit whose output names `no-restricted-imports` or `src/sim/__verify_probe.ts`, then confirm the probe is gone. The in-suite contract test pins the script's required assertions. |
| Visual stability at 1.4e6 m on real GPU | FOUND-08 | SwiftShader proves the pipeline, not discrete-GPU rendering | Open the shell in a desktop browser at 1280x720. Confirm the starfield fills the frame and the 500 m box at ~100 km renders as a small crisp square, with no z-fighting. The 1.4e6 m marker is sub-pixel; its placement and float32 ULP are asserted numerically by `tests/e2e/precision.spec.ts`. System-scale visual confirmation arrives with Phase 3. |
| Licence/trademark wording | FOUND-06 | Needs the professional legal read already flagged in STATE.md | Human review of `LICENSE`, `NOTICE`, `ASSETS.md` and the shell footer against Oolite's `LICENSE.md` and Frontier's trademark list. |

---

## Residual Limitations (explicit, not hidden)

1. **FOUND-01 HMR propagation** — only host-side observation can prove a bind-mount file event triggers a reload; the suite proves the HMR client is served.
2. **FOUND-02 "production"** — `vite preview` is a local static server, not the eventual hosting environment; that belongs to Phase 7.
3. **FOUND-03 fail-fast at later stages** — the rehearsal injects a lint failure only; the same `&&` chain governs typecheck/test/build/e2e, but only the first stage is rehearsed live.
4. **FOUND-04 arm64 resolution** — the digest is the multi-arch index digest, but only the build host architecture is exercised.
5. **FOUND-08 real-GPU stability** — numeric evidence only under SwiftShader.
6. **FOUND-06 legal adequacy** — presence and trademark absence are asserted, not legal sufficiency.

---

## Validation Sign-Off

- [x] All requirements have automated evidence in the suite or in a named live script
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60 s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-11-02 (validate-phase); live-Docker and host-GPU halves remain manual-only as listed above.
