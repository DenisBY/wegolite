---
phase: "02"
slug: "data-pipeline-content-compiler"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-03"
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `02-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5, single project `unit`, `environment: "node"` |
| **Config file** | `vitest.config.ts` — include globs `["src/**/*.test.ts", "tests/**/*.test.ts"]`; add `"tools/**/*.test.ts"` |
| **Quick run command** | `docker compose run --rm test` |
| **Full suite command** | `docker compose run --rm verify` (lint → typecheck → assets:check → test → build → e2e) |
| **Drift command** | `docker compose run --rm assets npm run assets:check` |
| **Property tests** | `fast-check@4.10.2`, same node project |
| **Estimated runtime** | quick ~15 s; full verify ~2–4 min |

---

## Sampling Rate

- **After every task commit:** `docker compose run --rm test`
- **After every plan wave:** `docker compose run --rm verify`
- **Before `/gsd-verify-work`:** Full suite green in-container, plus the arm64/amd64 determinism script run once and its result recorded
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

Task IDs are assigned when the planner writes `02-*-PLAN.md`; this table binds each requirement to its mandatory automated evidence. Every task must carry an `<automated>` command and a `<fails_when>` sibling.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | DATA-01 | T-02-01 | Parser rejects malformed input with code/file/line; no `eval`/`new Function`; recursion capped | unit + integration | `docker compose run --rm test npm test -- tools/oolite-ingest/openstep/parser.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DATA-02 | T-02-02 | Merge is shallow, non-inheritable keys respected; cycle prints full chain | golden + property | `docker compose run --rm test npm test -- tools/oolite-ingest/like-ship.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DATA-03 | T-02-03 | `.dat` parser rejects traversal paths, caps NVERTS/NFACES | unit + golden | `docker compose run --rm test npm test -- tools/oolite-ingest/convert/dat.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DATA-04 | T-02-04 | GLB bytes identical across runs; dock transform `(0,0,-500.2561)`; letterbox not mirrored | unit + independent reader | `docker compose run --rm test npm test -- tools/oolite-ingest/convert/glb.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DATA-05 | T-02-05 | All 2,048 systems, stable `g{galaxy}-s{index}` ids, Lave pinned | golden | `docker compose run --rm test npm test -- tools/oolite-ingest/convert/systems.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DATA-06 | T-02-06 | 17 commodities, integer decicredits, unit tags, Alien Items `tradeable === false` | golden | `docker compose run --rm test npm test -- tools/oolite-ingest/convert/commodities.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DATA-07 | T-02-07 | Equipment metadata preserved; Cobra + Coriolis resolved and converted | golden | `docker compose run --rm test npm test -- tools/oolite-ingest/convert/{equipment,ships}.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DATA-08 | T-02-08 | Drift gate fails on one mutated byte, a missing file, an extra file — no override | integration | `docker compose run --rm verify` (assets:check stage) + `docker compose run --rm test npm test -- tools/oolite-ingest/drift.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DATA-09 | T-02-09 | `SOURCE.md` pins `1.93.1-241` / `7437f22`; every `third_party` file has an `ASSETS.md` row and matching SHA-256 | unit (contract) | `docker compose run --rm test npm test -- tests/compliance-assets.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | QUAL-06 (partial) | — | README/AGENTS document new commands; Compose service-set equality holds | contract | `docker compose run --rm test npm test -- tests/contract/container-contract.test.ts` | ✅ exists, must update | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/fixtures/plist/` — malformed plist, comment-only array, empty dict, octal escapes, duplicate keys, quoted-key-with-space.
- [ ] `tests/fixtures/shipdata/` — 4-entry synthetic file with a cycle and a dangling reference.
- [ ] `tests/fixtures/dat/` — a 3-face quad `.dat` (truncation), a comma-free `.dat`, a truncated/broken `.dat`.
- [ ] `tests/fixtures/textures/` — the 8×8 asymmetric PNG for the UV/V-flip test.
- [ ] `tests/golden/content/lave.json`, `commodities.json`, `equipment.json`, `ship-bounds.json` — pinned expected values.
- [ ] `src/content/schemas/*.ts` + `src/content/types.ts` — the zod surface the goldens validate against.
- [ ] `"tools/**/*.test.ts"` added to `vitest.config.ts` include array.
- [ ] `assets` Compose service + `assets:build` / `assets:check` npm scripts + updated `verify` chain + updated contract assertion + `AGENTS.md`/`README.md` rows.
- [ ] `src/content/generated` and `third_party` added to `.prettierignore`.
- [ ] No framework install needed — Vitest/Playwright are already in the `ci` stage.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| arm64 ↔ amd64 byte-identical generated output | DATA-08 (D-06) | `docker compose run` cannot select a platform per invocation; the host is x86_64 | Run `scripts/check-arch-determinism.sh` (buildx/QEMU arm64 vs amd64), diff output trees and manifests, record the result in the phase notes. Any exclusion must be listed in the script header. |
| Visual read of the Coriolis letterbox / texture orientation | DATA-04 | The automated fixture proves handedness and signed UV area; a human still confirms the dock opening reads correctly | Load the converted Coriolis in the preview, look through the dock opening, compare against the raw diffuse texture. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
