---
phase: "19"
slug: "equipment-damage-and-repair"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-21"
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `19-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5 (unit project, Node), fast-check 4.10.2, Playwright (opt-in browser) |
| **Config file** | `vitest.config.ts` (coverage floors: `src/sim/**` lines 93, `src/persistence/**` lines 88, `src/content/**` lines 66) |
| **Quick run command** | `docker compose run --rm test npx vitest run <file>` |
| **Full suite command** | `docker compose run --rm test`, then `docker compose run --rm lint` and `docker compose run --rm typecheck` |
| **Phase gate** | `verify` and `verify-full` (persistence and money-path change) on the remote test machine via `/home/opencode/.claude/scripts/wegolite-remote-run.sh` |
| **Estimated runtime** | targeted file ~30 s; full unit suite several minutes |

---

## Sampling Rate

- **After every task commit:** the targeted `vitest run <file>` for the files touched
- **After every plan wave:** `docker compose run --rm test`, `lint`, `typecheck`
- **Before `/gsd-verify-work`:** `verify` and `verify-full` green on the remote machine
- **Not required:** the 20-seed NPC acceptance run (no change under `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json`)

---

## Per-Task Verification Map

Filled by the planner per task; the requirement-level map below is the floor every plan must cover.

| Req ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|-----------|-------------------|-------------|--------|
| CBT-08 (SC1) | Gate loop `(rand & 31) < amount`, `n_considered` (factor 95), die reversal, cargo branch, weighted pick, draw order, laser rolls only if energy > 0, scrape always | unit, hand-derived draws | `docker compose run --rm test npx vitest run tests/sim/combat/internal-damage.test.ts` | ❌ W0 | ⬜ pending |
| CBT-08 (SC1) | Ledger emits `equipmentDamaged` / `cargoDestroyed` after `shipHit`, in order; no facts → no event | unit | `docker compose run --rm test npx vitest run tests/sim/combat/ledger.test.ts` | ✅ extend | ⬜ pending |
| CBT-08 (SC1) | Same fight damages the same item at 30/60/144 Hz | cadence | `docker compose run --rm test npx vitest run tests/sim/combat/internal-damage-cadence.test.ts` | ❌ W0 | ⬜ pending |
| CBT-08 | Totality: NaN / negative / huge / empty / duplicate inputs | property | `docker compose run --rm test npx vitest run tests/sim/combat/internal-damage.property.test.ts` | ❌ W0 | ⬜ pending |
| CBT-08 | `holdPods` order and length match `holdPodsUsed` | unit + property | `docker compose run --rm test npx vitest run tests/sim/economy/` | ✅ extend | ⬜ pending |
| CBT-08 | Pinned constants (31, factor 95, mass term 21, `damage` purpose) | pinning | `docker compose run --rm test npx vitest run tests/sim/combat/constants.test.ts tests/sim/rng.test.ts` | ✅ extend | ⬜ pending |
| CBT-08 (SC5) | Hook-spawned fight: shooter destroyed with debris, player leaves with a damaged item | scenario twin | `docker compose run --rm test npx vitest run tests/app/session/tick-parity.test.ts` | ✅ extend | ⬜ pending |
| CBT-08 (SC5) | Same in a real browser session | browser (remote) | `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/combat.spec.ts"` | ✅ extend | ⬜ pending |
| CBT-12 (SC2) | Damaged key leaves the installed set; dock computer refuses; compass falls back | unit | `docker compose run --rm test npx vitest run tests/sim/dock-computer.test.ts tests/sim/flight-controller.test.ts` | ✅ extend | ⬜ pending |
| CBT-12 (SC2) | HUD `%@ damaged.` / `%@ destroyed.` 4.5 s after clear; length guard | unit | `docker compose run --rm test npx vitest run tests/app/session/event-router-damage.test.ts tests/guards/hud-message-length.test.ts` | ❌ W0 / ✅ extend | ⬜ pending |
| CBT-12 (SC2) | Router pins: kinds, table, `damageFlow` before `hudMessages` | pinned | `docker compose run --rm test npx vitest run tests/app/session-order.test.ts` | ✅ update | ⬜ pending |
| CBT-12 (SC2) | Atomic update: one `commitProfile` per event; identity on refusal | unit | `docker compose run --rm test npx vitest run tests/sim/player/damage.test.ts tests/app/session/station-controller.test.ts` | ❌ W0 / ✅ extend | ⬜ pending |
| CBT-12 (SC3) | Repair door: closed allow-list, forged keys, price `ceil(p/2)`, TL−1 rule, credits, no clock | unit | `docker compose run --rm test npx vitest run tests/sim/player/outfitting.test.ts` | ✅ extend | ⬜ pending |
| CBT-12 (SC3) | F3 rows: repair replaces buy row, verbatim copy, unaffordable refused with reason, confirm verb | view-model | `docker compose run --rm test npx vitest run tests/ui/station-outfitting.test.ts` | ✅ extend | ⬜ pending |
| CBT-12 | F5 lists damaged items first as `<name> (damaged)` | view-model | `docker compose run --rm test npx vitest run tests/ui/station-status.test.ts` | ✅ extend | ⬜ pending |
| CBT-12 | Normal play: buy → damage → repair through the real controller | integration | `docker compose run --rm test npx vitest run tests/app/session/station-controller.test.ts` | ✅ extend | ⬜ pending |
| SAVE-09 (SC4) | v5 schema strictness, `_DAMAGED` rejected, disjointness, combined cap, v1–v4 → `corrupt`, future version | unit | `docker compose run --rm test npx vitest run tests/persistence/save-v5.test.ts` | ❌ W0 | ⬜ pending |
| SAVE-09 (SC4) | Worst-case v5 save under `MAX_SAVE_CHARS` (65,536) at schema maxima | unit | same file | ❌ W0 | ⬜ pending |
| SAVE-09 (SC4) | Round trip and autosave bytes keep the damage | unit | `docker compose run --rm test npx vitest run tests/persistence/autosave.test.ts tests/persistence/restore-drift.test.ts` | ✅ update | ⬜ pending |
| SAVE-09 (SC4) | Continue/Load shows the damaged item (v5 fixture) | browser (remote) | `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/save-load.spec.ts"` | ✅ extend | ⬜ pending |
| D-03 | `damageProbability` compiled, golden, drift | ingest | `docker compose run --rm test npx vitest run tools/oolite-ingest/convert/equipment.test.ts`; `docker compose run --rm assets npm run assets:check` | ✅ extend | ⬜ pending |
| D-05/D-07/D-12 | FIDELITY rows and Key Decisions rows valid | contract | `docker compose run --rm test npx vitest run tests/contract/fidelity.test.ts` | ✅ extend | ⬜ pending |
| Purity | New sim files obey bans; economy file list pinned | guards | `docker compose run --rm test npx vitest run tests/guards/` | ✅ update | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/sim/combat/internal-damage.test.ts`, `internal-damage-cadence.test.ts`, `internal-damage.property.test.ts` — roll, cadence, totality
- [ ] `tests/sim/player/damage.test.ts` — pure profile operations
- [ ] `tests/persistence/save-v5.test.ts` — replaces the v2/v3/v4 and golden-chain tests
- [ ] `tests/app/session/event-router-damage.test.ts` — router rows, HUD copy, commit
- [ ] A TL ≥ 8 system fixture for repair tests (Lave is raw TL 4)
- Framework install: none

---

## Manual-Only Verifications

All phase behaviors have automated verification. Browser specs run on the remote test machine only.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60 s for targeted runs
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
