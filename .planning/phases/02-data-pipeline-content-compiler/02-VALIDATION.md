---
phase: "02"
slug: "data-pipeline-content-compiler"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-03"
updated: "2026-11-03"
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `02-RESEARCH.md` § Validation Architecture; audited against the executed
> plans and summaries by `/gsd-validate-phase 02`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5, single project `unit`, `environment: "node"` |
| **Config file** | `vitest.config.ts` — include globs `["src/**/*.test.ts", "tests/**/*.test.ts", "tools/**/*.test.ts"]` |
| **Quick run command** | `docker compose run --rm test` |
| **Full suite command** | `docker compose run --rm verify` (lint → typecheck → assets:check → test → build → e2e) |
| **Drift command** | `docker compose run --rm assets npm run assets:check` |
| **Property tests** | `fast-check@4.10.2`, same node project |
| **Browser tests** | Playwright 3/3 (`precision`, `models`, `resize`) |
| **Estimated runtime** | quick ~15 s; full verify ~2–4 min |

---

## Sampling Rate

- **After every task commit:** `docker compose run --rm test`
- **After every plan wave:** `docker compose run --rm verify`
- **Before `/gsd-verify-work`:** Full suite green in-container, plus the arm64/amd64 determinism script run once and its result recorded
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-T2, 02-T1 | 02-01, 02-02 | 1, 2 | DATA-01 | T-02-01 | Parser rejects malformed input with code/file/line; no `eval`/`new Function`; recursion capped | unit + integration | `docker compose run --rm test npx vitest run tools/oolite-ingest/openstep/parser.test.ts tools/oolite-ingest/failure-contract.test.ts` | ✅ | ✅ green |
| 05-T1 | 02-05 | 5 | DATA-02 | T-02-02 | Merge is shallow, non-inheritable keys respected; cycle prints full chain | golden + property | `docker compose run --rm test npx vitest run tools/oolite-ingest/like-ship.test.ts` | ✅ | ✅ green |
| 04-T2 | 02-04 | 4 | DATA-03 | T-02-03 | `.dat` parser rejects traversal paths, caps NVERTS/NFACES | unit + golden | `docker compose run --rm test npx vitest run tools/oolite-ingest/convert/dat.test.ts` | ✅ | ✅ green |
| 06-T1, 06-T2 | 02-06 | 6 | DATA-04 | T-02-04 | GLB bytes identical across runs; dock transform `(0,0,-500.2561)`; letterbox not mirrored | unit + independent reader + e2e | `docker compose run --rm test npx vitest run tools/oolite-ingest/convert/glb.test.ts` | ✅ | ✅ green (visual check manual) |
| 03-T1 | 02-03 | 3 | DATA-05 | T-02-05 | All 2,048 systems, stable `g{galaxy}-s{index}` ids, Lave pinned | golden | `docker compose run --rm test npx vitest run tools/oolite-ingest/convert/systems.test.ts src/content/systems.test.ts` | ✅ | ✅ green |
| 01-T3 | 02-01 | 1 | DATA-06 | T-02-06 | 17 commodities, integer decicredits, unit tags, Alien Items `tradeable === false` | golden | `docker compose run --rm test npx vitest run tools/oolite-ingest/convert/commodities.test.ts` | ✅ | ✅ green |
| 03-T2, 05-T2 | 02-03, 02-05 | 3, 5 | DATA-07 | T-02-07 | Equipment metadata preserved; Cobra + Coriolis resolved and converted | golden | `docker compose run --rm test npx vitest run tools/oolite-ingest/convert/equipment.test.ts tools/oolite-ingest/convert/ships.test.ts` | ✅ | ✅ green |
| 01-T3, 07-T2 | 02-01, 02-07, 02-08 | 1, 7, 8 | DATA-08 | T-02-08 | Drift gate fails on one mutated byte, a missing file, an extra file — no override | integration + unit | `docker compose run --rm verify` (assets:check stage) + `docker compose run --rm test npx vitest run tools/oolite-ingest/drift.test.ts tools/oolite-ingest/convert/textures.test.ts tests/guards/tools-determinism.test.ts` | ✅ | ✅ green (arch matrix manual) |
| 09-T3 | 02-09 | 9 | DATA-09 | T-02-09 | `SOURCE.md` pins `1.93.1-241` / `7437f22`; every `third_party` file has an `ASSETS.md` row and matching SHA-256 | unit (contract) | `docker compose run --rm test npx vitest run tests/compliance-assets.test.ts` | ✅ | ✅ green |
| 01-T2 | 02-01 | 1 | QUAL-06 (partial) | — | README/AGENTS document new commands; Compose service-set equality holds | contract | `docker compose run --rm test npx vitest run tests/contract/container-contract.test.ts` | ✅ | ✅ green |
| 03-T3, 09-T2 | 02-03, 02-09 | 3, 9 | DATA-05/09 (guards) | — | Generated-content boundary holds; `src/sim` cannot import runtime content | unit (guard) | `docker compose run --rm test npx vitest run tests/guards/content-boundary.test.ts tests/guards/sim-purity.test.ts tests/compliance.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/fixtures/plist/` — malformed plist, comment-only array, empty dict, octal escapes, duplicate keys, quoted-key-with-space.
- [x] `tests/fixtures/shipdata/` — synthetic cycles, dangling reference, overrides-adds-entry.
- [x] `tests/fixtures/dat/` — quad-face, quad-face-comma, truncated/broken, face underflow, oversize NVERTS.
- [x] `tests/fixtures/textures/` — the 8×8 asymmetric PNG for the UV/V-flip test.
- [x] `tests/golden/content/lave.json`, `commodities.json`, `equipment.json`, `ships.json`, `ship-bounds.json` — pinned expected values.
- [x] `src/content/schemas/*.ts` + `src/content/types.ts` — the zod surface the goldens validate against.
- [x] `"tools/**/*.test.ts"` added to `vitest.config.ts` include array.
- [x] `assets` Compose service + `assets:build` / `assets:check` npm scripts + updated `verify` chain + updated contract assertion + `AGENTS.md`/`README.md` rows.
- [x] `src/content/generated`, `third_party`, and `public/models`/`public/textures` added to `.prettierignore` / drift roots.
- [x] No framework install needed — Vitest/Playwright are already in the `ci` stage; `fast-check` and `@gltf-transform/core` pinned in `package.json`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| arm64 ↔ amd64 byte-identical generated output | DATA-08 (D-06) | The local host is x86_64 with no QEMU binfmt, so `scripts/check-arch-determinism.sh` exits 2 (`linux/arm64 execution is unavailable`) rather than passing vacuously | Run `scripts/check-arch-determinism.sh` on the CI arm64 runner; diff output trees and manifests, record the result in the phase notes. Exit 2 is never a pass. |
| Visual read of the Coriolis letterbox / texture orientation | DATA-04 | The automated fixture proves handedness and signed UV area; a human still confirms the dock opening reads correctly | Load the converted Coriolis in the preview, look through the dock opening, compare against the raw diffuse texture. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-11-03 — 12 evidence rows mapped, 0 gaps, 2 manual-only items.

## Validation Audit 2026-11-03

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 2 |
