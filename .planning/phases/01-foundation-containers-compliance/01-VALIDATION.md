---
phase: "01"
slug: "foundation-containers-compliance"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-02"
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `5.0.5` (Node project `unit`) + `@playwright/test` `1.64.1` (Chromium, headless, baked into the `ci` image stage) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` (both created in this phase) |
| **Quick run command** | `docker compose run --rm test` |
| **Full suite command** | `docker compose run --rm verify` (lint → typecheck → unit → build → e2e) |
| **Estimated runtime** | ~4 s quick (6 tests); full chain includes image-native build + 1 e2e test |

---

## Sampling Rate

- **After every task commit:** Run `docker compose run --rm test`
- **After every plan wave:** Run `docker compose run --rm verify`
- **Before `/gsd-verify-work`:** Full suite must be green **in the container**
- **Max feedback latency:** 60 seconds (verify chain measured well under this on the reference machine)

---

## Per-Task Verification Map

Plan/task IDs are assigned by PLAN.md; this table maps requirements to the automated evidence each must
eventually carry. `❌ W0` marks a check that must be created before the requirement can be verified.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | FOUND-01 | — | Dev server reachable on documented port; no host Node | smoke | `docker compose up -d app && curl -fsS localhost:5173/ \| grep '@vite/client'` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | FOUND-02 | — | Preview serves the built bundle | smoke | `docker compose up -d preview && curl -fsS localhost:4173/ \| grep -q 'foundation build'` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | FOUND-03 | — | Verify chain is definition of done | integration | `docker compose run --rm verify` → exit 0 | ✅ (chain itself) | ⬜ pending |
| 01-01-04 | 01 | 1 | FOUND-09 | — | Documented commands work verbatim | integration | `verify` + dev/preview smoke scripts; command table matches `compose.yaml` service names | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 2 | FOUND-04 | T-01-01 | Base image pinned by digest; browsers baked, never downloaded | static assertion | `grep -q 'node:24-bookworm-slim@sha256:' Dockerfile` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 2 | FOUND-05 | — | `src/sim` cannot import Three.js or touch the DOM | unit + compiler/linter assertions | `docker compose run --rm typecheck` and `--rm lint` exit 0 clean; seeded violation exits ≠ 0 | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 3 | FOUND-07 | — | Identical state hash at 30/60/120/144 Hz | unit | `docker compose run --rm test npx vitest run src/sim/cadence.test.ts` | ✅ verified in probe | ⬜ pending |
| 01-03-02 | 03 | 3 | FOUND-07 | — | Golden fixture replay | unit | `docker compose run --rm test npx vitest run tests/golden/` | ❌ W0 | ⬜ pending |
| 01-04-01 | 04 | 4 | FOUND-08 | — | Camera-relative transform numerics (float64 subtraction, ULP bound) | unit | `docker compose run --rm test npx vitest run src/render/camera-relative.test.ts` | ✅ verified in probe | ⬜ pending |
| 01-04-02 | 04 | 4 | FOUND-08 | — | Shell renders precision scene, no console errors | e2e | `docker compose run --rm e2e` (`tests/e2e/precision.spec.ts`) | ✅ verified in probe | ⬜ pending |
| 01-05-01 | 05 | 5 | FOUND-06 | — | Licence/attribution artifacts and shipped disclaimer | unit (file + bundle assertion) | `docker compose run --rm test npx vitest run tests/compliance.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/golden/` — one scripted input log plus its expected FNV-1a hash, checked in (decision D-11).
- [ ] `tests/compliance.test.ts` — LICENSE text/hash, NOTICE terms, `dist/index.html` disclaimer, no trademark in `<title>`.
- [ ] `src/sim/__fixtures__/` — tiny deliberate violations for the import-purity guard, or a documented manual check if shelling out from Vitest is too slow.
- [ ] `scripts/smoke-dev.sh` / `scripts/smoke-preview.sh` (or Compose healthchecks) so FOUND-01/02 are machine-checked.
- [ ] No framework install needed — Vitest and Playwright are already baked into the `ci` image stage; new paths are covered by existing config includes.

*Existing infrastructure covers `src/sim` cadence and `src/render` camera-relative numerics once the configs land.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Hot reload on host file edit | FOUND-01 | File-event propagation into bind mounts is host-specific (macOS/WSL2); research could not test it here | Edit `index.html` in a running `docker compose up app`; confirm the browser updates without a restart. On macOS/WSL2 set `VITE_USE_POLLING=1` if no update appears. |
| Verify fails fast on a seeded lint error | FOUND-03 | Deliberately breaking the tree is not part of the green suite | Add an unused-variable lint error, run `docker compose run --rm verify`, confirm non-zero exit at the lint stage; revert. |
| Visual stability at 1.4e6 m on real GPU | FOUND-08 | SwiftShader proves the pipeline, not discrete-GPU rendering | Open the shell in a desktop browser; confirm the distant marker does not shimmer or z-fight against the ~100 km box. |
| Licence/trademark wording | FOUND-06 | Needs the professional legal read already flagged in STATE.md | Human review of `LICENSE`, `NOTICE`, `ASSETS.md` and the shell footer against Oolite's `LICENSE.md` and Frontier's trademark list. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
