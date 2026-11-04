---
phase: "4"
slug: "manual-docking"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-04"
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5 (unit/integration, node env) + Playwright 1.64.1 (browser) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `docker compose run --rm test npx vitest run <new test files>` |
| **Full suite command** | `docker compose run --rm verify` |
| **Estimated runtime** | ~120–300 seconds (container) |

> Evidence rule: a host Node/npm run is **not** evidence (AGENTS.md). All commands run in Docker.

---

## Sampling Rate

- **After every task commit:** Run the task's scoped `docker compose run --rm test npx vitest run …` command
- **After every plan wave:** Run `docker compose run --rm test` + `docker compose run --rm typecheck` + `docker compose run --rm lint`
- **Before `/gsd-verify-work`:** `docker compose run --rm verify` must be green
- **Max feedback latency:** ~120 seconds (scoped unit run)

---

## Per-Task Verification Map

Plan/task IDs are assigned by PLAN.md; this table is requirement-anchored and must be kept in sync during execution.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | DOCK-01 | T-4-01 | Aperture comes from generated, drift-checked content; no hand-typed sim constants | unit + drift | `docker compose run --rm assets npm run assets:check`; `docker compose run --rm test npx vitest run tests/sim/dock-corridor.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DOCK-02 | — | Port frame follows station roll without racing state; deterministic replay | unit (property) | `docker compose run --rm test npx vitest run tests/sim/dock-corridor.test.ts tests/sim/dock-cadence.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DOCK-03 | T-4-02 | Bounce never leaves a trap state; orientation preserved; impulse finite | unit | `docker compose run --rm test npx vitest run tests/sim/dock-hull.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DOCK-04 | — | Capture is exactly the 90/10 past-plane test; docked pose is derived | unit | `docker compose run --rm test npx vitest run tests/sim/dock-capture.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DOCK-05 | T-4-03 | Purchase requires credits; Shift chord gated; aegis gate; save cannot forge equipment | unit + e2e | `docker compose run --rm test npx vitest run tests/sim/dock-computer.test.ts tests/sim/player-profile.test.ts tests/input/bindings.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DOCK-06 | T-4-04 | Malformed save / tampered values rejected by strict schema | unit + e2e | `docker compose run --rm test npx vitest run tests/sim/dock-no-trap.test.ts tests/persistence/save.test.ts`; `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/docking.spec.ts"` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DOCK-07 | T-4-05 | IndexedDB blob validated; future version never overwritten; write failure non-fatal | unit + e2e | `docker compose run --rm test npx vitest run tests/persistence/save.test.ts`; `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/autosave.spec.ts"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/sim/dock-corridor.test.ts` — aperture, port frame, lane/band, capture boundary
- [ ] `tests/sim/dock-cadence.test.ts` — replay equality across 60/120/144 Hz sampling
- [ ] `tests/sim/dock-hull.test.ts` — box hull contact + bounce, orientation preserved
- [ ] `tests/sim/dock-capture.test.ts` — 90/10 capture and docked pose
- [ ] `tests/sim/dock-computer.test.ts` — aegis gate, +1200 s, no-op without equipment
- [ ] `tests/sim/dock-no-trap.test.ts` — fuzzed approaches always end `inFlight` or `docked`
- [ ] `tests/sim/player-profile.test.ts` — credits/equipment purchase maths
- [ ] `tests/persistence/save.test.ts` — `parseSave` accept/reject table
- [ ] `tests/e2e/docking.spec.ts` — probes for capture, bounce feedback, Shift+C
- [ ] `tests/e2e/autosave.spec.ts` — real IndexedDB reload → Continue
- [ ] Port-frame pose helper for tests (states "nose N m past plane, rolled 90°")
- [ ] Generated-data golden for `dock-port.json`
- [ ] `?test=1` hook extensions: `setOrientation`, `setStationAngle`, `grantEquipment`, `setCredits`, `probe.dock`
- [ ] Guards stay green: `tests/guards/sim-purity.test.ts`, `tests/guards/content-boundary.test.ts`

*Existing infrastructure covers the runner; all listed files are new.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Camera shake and red frame flash read as clear feedback rather than visual noise | DOCK-03 / DOCK-06 | Amplitude/timing feel is qualitative; automated probes only assert presence and expiry | Launch, fly off-axis into the Coriolis, confirm shake + flash + message; confirm they clear within ~0.5 s and a second attempt is possible immediately |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
