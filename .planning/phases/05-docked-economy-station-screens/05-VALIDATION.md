---
phase: "5"
slug: "docked-economy-station-screens"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-05"
revised: "2026-11-05 (cross-AI review round 1 — dcedaa9); 2026-11-06 (plan-checker round 2 — owner amendment: persisted marketSeed, Oolite missile trade-in, no arrival counter); 2026-11-06 (validate-phase audit — all mapped tests green, full verify 82 files / 939 tests + 62 Playwright)"
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `05-RESEARCH.md` §Validation Architecture and revised after `05-REVIEWS.md` round 1 (dcedaa9).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5 (Node `unit` project) + Playwright 1.64.1 |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `docker compose run --rm test npx vitest run tests/sim/economy tests/sim/player tests/ui --passWithNoTests` |
| **Full suite command** | `docker compose run --rm test` |
| **Browser suite** | `docker compose run --rm e2e` (builds, then `npm run test:e2e`) |
| **Phase gate** | `docker compose run --rm verify` (lint → typecheck → assets:check → test → build → e2e) |
| **Estimated runtime** | ~unit suite minutes in-container; e2e/build adds several minutes |

---

## Sampling Rate

- **After every task commit:** run the touched unit file(s) in the container (e.g. `docker compose run --rm test npx vitest run tests/sim/economy/market.test.ts`).
- **After every plan wave:** `docker compose run --rm test` + `docker compose run --rm typecheck` + `docker compose run --rm lint` + `docker compose run --rm assets npm run assets:check`.
- **Before `/gsd-verify-work`:** `docker compose run --rm verify` must be green.
- **Max feedback latency:** one unit-file run per task commit.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | ECON-01, ECON-02, ECON-03, ECON-04, ECON-09 | T-05-01, T-05-02, T-05-19 | Tracer: regenerated content with peaks/names, exact pod math, buy path, shared reader/writer save semantics, bubble keyboard, F8 render and reload | unit + drift + e2e | `docker compose run --rm assets npm run assets:check` then `docker compose run --rm test npx vitest run tests/sim/economy tests/persistence tests/sim/player-profile.test.ts tests/input/station-actions.test.ts tests/input/bindings.test.ts tools/oolite-ingest/convert/commodities.test.ts tools/oolite-ingest/failure-contract.test.ts tests/guards/content-boundary.test.ts` then `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/station.spec.ts tests/e2e/docking.spec.ts tests/e2e/scene.spec.ts tests/e2e/launch.spec.ts tests/e2e/autosave.spec.ts tests/e2e/precision.spec.ts tests/e2e/fallback.spec.ts"` | ✅ | ✅ green |
| 05-01-02 | 01 | 1 | ECON-01, ECON-03, ECON-09 | T-05-19 | Independent Lave anchors, narcotics bias 0, RANROT vector, writer preserves previous blob, docked rebind, first-boot `marketSeed === marketSeedForSystem("g0-s7")` (no arrival counter) | unit + e2e | `docker compose run --rm test npx vitest run tests/sim/economy/market.test.ts tests/sim/economy/cargo.test.ts tests/sim/economy/trade.test.ts tests/persistence/autosave.test.ts tests/input/station-actions.test.ts` then `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/station.spec.ts tests/e2e/docking.spec.ts"` | ✅ | ✅ green |
| 05-02-01 | 02 | 2 | ECON-02, ECON-03 | T-05-17, T-05-20, T-05-21 | Exact kg/g capacity with the held pod, sell mirrors buy, sequential clamps, overflow refusal, no subtract-before-approval | unit + property | `docker compose run --rm test npx vitest run tests/sim/economy/trade.test.ts tests/sim/economy/cargo.test.ts` | ✅ | ✅ green |
| 05-02-02 | 02 | 2 | ECON-01 | T-05-18 | Regression goldens plus independent reference vectors; seed re-derived; economy-only determinism; PROJECT.md decisions | unit + golden + vectors | `docker compose run --rm test npx vitest run tests/sim/economy/market.test.ts tests/sim/economy/determinism.test.ts tests/sim/economy/reference-vectors.test.ts` | ✅ | ✅ green |
| 05-03-01 | 03 | 3 | ECON-05, ECON-08 | T-05-07, T-05-22, T-05-23 | TL/condition gating on the raw value; `notOffered`; fail-closed conditions; exact D-11 visible set; integer fuel | unit | `docker compose run --rm test npx vitest run tests/sim/player/outfitting.test.ts` | ✅ | ✅ green |
| 05-03-02 | 03 | 3 | ECON-05, ECON-08 | T-05-08, T-05-09 | Immediate effects at the catalogue price; 8250 dc berth; synthetic TL 9 install; Oolite missile trade-in (+700 dc at 3, no berth refund); 20 t/35 t berth boundaries; `canPurchase`/`purchase` delegation | unit + property | `docker compose run --rm test npx vitest run tests/sim/player/outfitting.test.ts tests/sim/economy/cargo.test.ts tests/sim/player-profile.test.ts` | ✅ | ✅ green |
| 05-04-01 | 04 | 4 | ECON-04, ECON-05, ECON-06, ECON-07 | T-05-10, T-05-24 | F5/F7 models: displayed TL is raw+1, 16-row manifest, 7 sysdata fields + inhabitants, one-pass replacer, exact formatter | unit | `docker compose run --rm test npx vitest run tests/ui/station-status.test.ts tests/ui/station-system-data.test.ts tests/content/labels.test.ts` | ✅ | ✅ green |
| 05-04-02 | 04 | 4 | ECON-05, ECON-08 | T-05-10, T-05-23 | D-11 row order, literal reasons, truthful removal copy, whole-credit removal labels, `confirmable` | unit | `docker compose run --rm test npx vitest run tests/ui/station-outfitting.test.ts tests/sim/player/outfitting.test.ts` | ✅ | ✅ green |
| 05-04-03 | 04 | 4 | ECON-04 | T-05-10, T-05-24 | F8 row cells, own units, `—` for zero, total-cost confirmation, separate clamp notice, single-period cash line | unit | `docker compose run --rm test npx vitest run tests/ui/station-market.test.ts` | ✅ | ✅ green |
| 05-05-01 | 05 | 5 | ECON-05, ECON-08, ECON-09 | T-05-25, T-05-26 | F3 two-state confirm, disabled-row KeyY no-op, second-Y no-op, non-focusable rows, complete probe, one autosave per accepted fit | unit + e2e | `docker compose run --rm test npx vitest run tests/ui/station-outfitting.test.ts tests/sim/player/outfitting.test.ts` then `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/station.spec.ts tests/e2e/docking.spec.ts"` | ✅ | ✅ green |
| 05-05-02 | 05 | 5 | ECON-06, ECON-07, ECON-09 | T-05-12, T-05-13, T-05-26 | F5/F7 keyboard-only; sentinel no-reload; Tab focus containment; `#title-confirm` keyboard start; single footer | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/station.spec.ts tests/e2e/scene.spec.ts tests/e2e/precision.spec.ts tests/e2e/fallback.spec.ts"` | ✅ | ✅ green |
| 05-06-01 | 06 | 6 | ECON-04, ECON-08 | T-05-14, T-05-27 | Canonical save, legacy normalisation, unclamped capacity, writer/reader parity, failed-write visibility, old/over-capacity browser cases | unit + e2e | `docker compose run --rm test npx vitest run tests/persistence/save.test.ts tests/persistence/autosave.test.ts tests/sim/economy/cargo.test.ts` then `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/autosave.spec.ts"` | ✅ | ✅ green |
| 05-06-02 | 06 | 6 | ECON-09 | T-05-15, T-05-16, T-05-26 | One continuous keyboard-only loop; `defaultPrevented` no-reload proof with negative control; pause inertness; disabled-row and second-Y no-ops; launch only home; reload and redock preserve the seed and all 17 prices | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/station.spec.ts tests/e2e/autosave.spec.ts tests/e2e/docking.spec.ts tests/e2e/launch.spec.ts tests/e2e/precision.spec.ts tests/e2e/fallback.spec.ts"` | ✅ | ✅ green |
| 05-06-03 | 06 | 6 | (content, purity) | T-05-28, T-05-SC | Economy/player modules stay DOM/Three/RNG/clock-free; module-path-aware guard; ESLint parity; evidence breadth; full gate | guard + lint + drift + phase gate | `docker compose run --rm test npx vitest run tests/guards/economy-purity.test.ts tests/guards/sim-purity.test.ts tests/guards/content-boundary.test.ts` then `docker compose run --rm lint` then `docker compose run --rm verify` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/sim/economy/market.test.ts` — formula, equal-peak bias, 127 cap, float32 truncation/division grouping, generation order, seed reproducibility, regression-fixture comparison, finite-safe-integer rows.
- [x] `tests/sim/economy/reference-vectors.test.ts` — independently authored full-row Lave vectors, per-system additional goods, narcotics, 126/127/128 and bias-rounding cases, with provenance; never regenerated from `generateMarket`.
- [x] `tests/sim/economy/determinism.test.ts` — same-seed equality, different-seed variation, economy-only invariance.
- [x] `tests/sim/economy/cargo.test.ts` — pod thresholds, unclamped capacity with cargo bay/berths, full-hold safe, 1,499 kg + free pods, 19 t + 600 kg.
- [x] `tests/sim/economy/trade.test.ts` — buy/sell clamps, sequential clamp order, exact capacity, refusal reasons, same price both ways, integer credits, overflow, never negative (fast-check property).
- [x] `tests/sim/player/outfitting.test.ts` — visible set, `notOffered`, TL gate, fail-closed conditions, multi-instance, removals, fuel price/integer guards, 20 t/35 t berth boundaries.
- [x] `tests/golden/market/{lave,zaonce,leesti}.json` — 17 rows each, `{version, systemId, marketSeed, goods}`; labelled regression snapshots, generated by the implementation, compared exactly.
- [x] `tests/helpers/commodities.ts` — Node `readFileSync(new URL(...))` helper so economy tests read committed content, not a `?raw` Vite import.
- [x] `tests/ui/station-market.test.ts`, `tests/ui/station-outfitting.test.ts`, `tests/ui/station-status.test.ts`, `tests/ui/station-system-data.test.ts` — pure view models, total-cost confirmation, truthful removal copy.
- [x] `tests/content/labels.test.ts` — label array lengths, required `sysdata-*` keys, malformed-record `LabelsError` cases (no UI import); unknown-token `StationModelError` rejection lives in `tests/ui/station-system-data.test.ts`.
- [x] `tests/input/station-actions.test.ts` — context filtering, Escape not double-firing, KeyP pause in `dockScreen`, Digit1 inert in `dockScreen`, Shift chords, context-aware rebind.
- [x] `tests/e2e/station.spec.ts` — keyboard-only loop, sentinel no-reload, pause inertness, disabled-row/second-Y no-ops, `#title-confirm`, probe assertions, console-error collection.
- [x] `src/content/commodities.ts` + parse test — no commodity loader exists today.
- [x] Extend `tests/persistence/save.test.ts` and `tests/persistence/autosave.test.ts` for optional fields, canonical cargo, legacy normalisation, negative capacity and writer-preserves-previous-blob.
- [x] Update `tools/oolite-ingest/convert/commodities.test.ts` + `tests/golden/content/commodities.json`.
- [x] Update `tests/e2e/docking.spec.ts` (`buy-dockcomp`) while preserving the Shift+C rebind at lines 451-470; verify `launch.spec.ts`, `precision.spec.ts` and `fallback.spec.ts` still pass.
- [x] Extend `src/app/probe.ts`: `probe.station` + `probe.economy`; optional `test.setFuel`/`test.setMissiles` (tainted, never persisted).
- [x] No framework install; Vitest/Playwright and their container images already exist.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Perceived "Oolite feel" of the terminal chrome (colors, spacing, key flow) | ECON-04, ECON-09 | Subjective visual/UX judgement; no pixel-diff evidence per project rule | `docker compose up app`, dock, then cycle F8/F3/F5/F7 with the keyboard and confirm the header/footer and layout read like Oolite's station computer |

*All numeric and state behaviors have automated verification; only perceived feel is manual.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency within one unit-file run
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** verified 2026-11-06

## Validation Audit 2026-11-06

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
