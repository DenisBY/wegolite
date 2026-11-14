---
phase: "10"
slug: ship-mass
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-14"
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: `10-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5 (Docker only) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `docker compose run --rm test npx vitest run tools/oolite-ingest/convert/octree.test.ts tools/oolite-ingest/convert/ship-mass.test.ts tools/oolite-ingest/convert/npc-ships.test.ts tests/content tests/sim/hyperspace-blockage.test.ts tests/contract/fidelity.test.ts` |
| **Full suite command** | `docker compose run --rm test` |
| **Drift gate** | `docker compose run --rm assets npm run assets:check` |
| **Estimated runtime** | slow machine; quick run ~1–2 min, full suite several minutes |

---

## Sampling Rate

- **After every task commit:** the quick run command (or the single new test file)
- **After every plan wave:** `test`, `typecheck`, `lint`, `assets:check`
- **Before `/gsd-verify-work`:** the four above green, plus the branch-dependent targeted browser specs of plan 10-04 (`budget.spec.ts` under buoy-client, `hyperspace.spec.ts` under coriolis-computed); no `verify`/`verify-full` (owner gate policy)
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | DATA-11 SC1 | T-10-01, T-10-02, T-10-03 | Octree port: depth rule, radius, synthetic volumes, y-plane quirk, Viper/Cobra/Coriolis-hull pins, NaN and all-degenerate meshes throw DAT_MESH | unit | `docker compose run --rm test npx vitest run tools/oolite-ingest/convert/octree.test.ts` | ✅ | ✅ green |
| 10-01-02 | 01 | 1 | DATA-11 SC1/SC2 | T-10-03, T-10-04 | 16-mesh float32 table; Coriolis and buoy composites; float64 worked examples (Cobra, Viper, Coriolis) within 1e-6; community tonne check; scale, density, missing-key and cycle guards | unit | `docker compose run --rm test npx vitest run tools/oolite-ingest/convert/octree.test.ts tools/oolite-ingest/convert/ship-mass.test.ts` | ✅ | ✅ green |
| 10-02-01 | 02 | 2 | DATA-11 SC1/SC4 | T-10-05, T-10-08 | NPC records carry `mass`; strict schema rejects missing, zero, negative, non-finite; hand-written golden; byte-identical regeneration | unit + gate | `docker compose run --rm test npx vitest run tools/oolite-ingest/convert/npc-ships.test.ts tests/content/ships-npc.test.ts tools/oolite-ingest/convert/ship-mass.test.ts tools/oolite-ingest/drift.test.ts` and `docker compose run --rm assets npm run assets:check` | ✅ edit | ✅ green |
| 10-02-02 | 02 | 2 | DATA-11 SC1/SC4 | T-10-05, T-10-06 | Cobra and Coriolis client entries carry `mass`; client file validates against the strict schema; ships.json carries none | unit + gate | `docker compose run --rm test npx vitest run tests/content/ships-client.test.ts tools/oolite-ingest/convert/ships.test.ts tools/oolite-ingest/drift.test.ts` and `assets:check` | ✅ edit | ✅ green |
| 10-02-03 | 02 | 2 | DATA-11 SC2 | T-10-07 | Ledger rows E-27 to E-30 with verbatim excerpts; constants ledger with the three worked masses and tolerances; NOTICE provenance | contract | `docker compose run --rm test npx vitest run tests/contract/fidelity.test.ts tests/compliance.test.ts` | ✅ edit | ✅ green |
| 10-03-01 | 03 | 3 | DATA-11 SC2/SC3 | T-10-11 | Owner decision: Coriolis blockage mass (D-04, re-pinning accepted as its reading under coriolis-computed), buoy mass home (a D-05 amendment), acceptance of the criterion 2 reading | manual | `checkpoint:decision` (gate blocking-human) | — | manual (decision recorded) |
| 10-03-02 | 03 | 3 | DATA-11 SC3/SC4 | T-10-10, T-10-12 | `CORIOLIS_STATION_MASS` pinned to the compiled Coriolis `mass` (or to the recorded divergence); blockage pins pass with the chosen value (re-pinned under coriolis-computed, as before under coriolis-comment); the jump-completing suites pass | unit | `docker compose run --rm test npx vitest run tests/sim/hyperspace-blockage.test.ts tests/sim/hyperspace.test.ts tests/sim/world tests/app/session tests/contract/fidelity.test.ts` | ✅ edit | ✅ green |
| 10-04-01 | 04 | 4 | DATA-11 SC1 (D-02) | T-10-13, T-10-14, T-10-16 | Buoy mass 698,691.1875 in the owner-chosen file; pinned; drift-gated; first-load bytes measured under buoy-client | unit + gate + e2e | `docker compose run --rm test npx vitest run tests/content tools/oolite-ingest/convert/ships.test.ts tools/oolite-ingest/convert/ship-mass.test.ts tools/oolite-ingest/drift.test.ts tests/compliance.test.ts`, `assets:check`, and on buoy-client `docker compose run --rm e2e sh -lc "npm run build && PLAYWRIGHT_JSON_OUTPUT_NAME=test-results/budget-10-04.json npx playwright test tests/e2e/budget.spec.ts --reporter=list,json"` | ✅ edit | ✅ green (vitest and assets:check re-run; browser specs from SUMMARY only) |
| 10-04-02 | 04 | 4 | DATA-11 SC3/SC4 | T-10-15 | Records and comments agree with the answers; blocked and fly-away jumps under the new radius (coriolis-computed); phase gate (full suite includes `tests/guards`: no octree code in src/sim, content boundary) | contract + gate + e2e | `docker compose run --rm test`, `docker compose run --rm assets npm run assets:check`, and on coriolis-computed `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/hyperspace.spec.ts"` | ✅ | ✅ green (vitest and assets:check re-run; browser specs from SUMMARY only) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tools/oolite-ingest/convert/octree.test.ts` — depth rule, synthetic volumes, y-plane quirk, guards (written first in 10-01 Task 1). The float32-against-float64 structure comparison stays a research result: the deliverable is float32 only, and the float64 worked examples in `ship-mass.test.ts` bound the precision claim at 1e-6.
- [x] `tools/oolite-ingest/convert/ship-mass.test.ts` — 16-mesh table, composite masses, float64 worked examples, wiki tonne check (written first in 10-01 Task 2)
- [x] `tests/golden/content/ships-npc.json` — `fields` gains `mass`, examples carry mass (10-02 Task 1)

*Framework install: none.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real-Oolite ship.mass runtime comparison (Cobra, Viper, Coriolis) | DATA-11 SC2 | No Oolite runtime available; deferred, criterion 2 accepted as algorithm-faithful port plus float64 re-derivation (override, revisable) | Run Oolite, read `ship.mass` for the three ships, compare with the constants ledger in FIDELITY.md |
| Coriolis blockage value (computed vs 455,223,200), the buoy mass home (D-05 amendment) and the criterion 2 reading | DATA-11 SC2, SC3, D-02 | Owner decision (D-04) | 10-03 Task 1 `checkpoint:decision` (blocking-human) with all numbers; recorded as Key Decisions in 10-03 and 10-04 and in the FIDELITY.md ledger |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 180s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-11-14

## Validation Audit 2026-11-14

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
