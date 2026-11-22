---
phase: "20"
slug: "player-death-and-game-over"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-22"
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `20-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5 (unit project, Node), fast-check, Playwright 1.64.1 (two new browser specs) |
| **Config file** | `vitest.config.ts` (coverage floors: `src/sim/**` lines 93 / branches 86, `src/persistence/**`), `vitest.acceptance.config.ts`, `playwright.config.ts` |
| **Quick run command** | `docker compose run --rm test npx vitest run <file>` |
| **Full suite command** | `docker compose run --rm test`, then `docker compose run --rm lint` and `docker compose run --rm typecheck` |
| **Phase gate** | remote `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm verify-full`, then `... run --rm test npm run test:acceptance` (21 of 21) |
| **Estimated runtime** | targeted file ~30 s; full unit suite several minutes; verify-full remote ~30+ min |

---

## Sampling Rate

- **After every task commit:** `docker compose run --rm test npx vitest run <changed test files>`
- **After every plan:** full `test`, `lint`, `typecheck`; remote `verify` for any plan touching `src/app`, `src/render`, `src/input`, `src/ui`, `index.html`
- **Before `/gsd-verify-work`:** remote `verify-full` and the remote acceptance run green
- **Max feedback latency:** ~60 s for targeted runs

---

## Per-Task Verification Map

Filled by the planner per task; the requirement-level map is:

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| DEATH-01 | Lethal ledger record kills the player in flight on that tick; cause kind + culprit key | unit | `docker compose run --rm test npx vitest run tests/sim/combat/death.test.ts` | ❌ W0 | ⬜ pending |
| DEATH-01 | Lethal ram (ship, buoy); player destroyable, bank-only comparison, reversal, no nudge | unit | `... vitest run tests/sim/combat/collision-stage.test.ts tests/sim/combat/collision-buoy.test.ts` | ✅ update | ⬜ pending |
| DEATH-01 | Shields absorb → not lethal; first lethal record wins; internal-damage gates kept | unit + property | `... vitest run tests/sim/combat/ledger.test.ts tests/sim/combat/internal-damage.test.ts` | ✅ update | ⬜ pending |
| DEATH-01 | No death docked/launching/dock tick/jump tick; countdown and ident cleared; mutual kill both die | unit | `... vitest run tests/sim/combat/death.test.ts` | ❌ W0 | ⬜ pending |
| DEATH-01 | Dead state frozen: stepSim/stepFlight no-op, hash and tick unchanged | unit | `... vitest run tests/sim/death-freeze.test.ts` | ❌ W0 | ⬜ pending |
| DEATH-01 | Router `playerDestroyed` → deathFlow once; 25-kind table; guards in pause/focus/context-loss/chart/sim-driver | unit | `... vitest run tests/app/session-order.test.ts tests/app/session/death-flow.test.ts tests/app/session/settings-controller.test.ts tests/app/session/chart-controller.test.ts tests/app/session/sim-driver.test.ts` | partial | ⬜ pending |
| DEATH-01 | gameOver input context: fresh Space / click reload once; everything else ignored; game-over lines model | unit | `... vitest run tests/input/keyboard-gameover.test.ts tests/ui/game-over.test.ts tests/ui/game-over-model.test.ts` | ❌ W0 | ⬜ pending |
| DEATH-06 | autosave/manualSave/queueSnapshot/writeManualSave refuse while dead (skip reason `dead`); snapshotForSave throws on dead | unit | `... vitest run tests/app/session/save-controller.test.ts tests/persistence/autosave.test.ts` | ✅ extend | ⬜ pending |
| DEATH-06 | Death → Space → reload → title Continue → resumes save with damaged equipment | e2e | `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/death-and-reload.spec.ts"` | ❌ W0 | ⬜ pending |
| DEATH-06 | Autosave trigger, F2, P, Esc, F6, blur, visibilitychange never save or revive the dead | e2e | `... npx playwright test tests/e2e/game-over-guard.spec.ts` | ❌ W0 | ⬜ pending |
| DEATH-06 | No save → title offers New game only | unit | `... vitest run tests/app/boot.test.ts tests/app/title-confirm.test.ts` | ✅ extend | ⬜ pending |
| QUAL-11 | NPC-vs-NPC kill + collision kill + player death hash equal at 30/60/144 Hz; dead hash stable | unit | `docker compose run --rm test npx vitest run tests/sim/world/death-cadence.test.ts` | ❌ W0 | ⬜ pending |
| QUAL-11 | 20-seed acceptance 21 of 21 at phase HEAD | acceptance | `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm test npm run test:acceptance` | ✅ | ⬜ pending |
| Release | verify-full exits 0 with the two new specs | gate | `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm verify-full` | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/sim/combat/death.test.ts`
- [ ] `tests/sim/death-freeze.test.ts`
- [ ] `tests/sim/world/death-cadence.test.ts` (terminate by step count, not `state.tick`)
- [ ] `tests/app/session/death-flow.test.ts`
- [ ] `tests/ui/game-over-model.test.ts`, `tests/ui/game-over.test.ts`, `tests/input/keyboard-gameover.test.ts`
- [ ] `tests/e2e/death-and-reload.spec.ts`, `tests/e2e/game-over-guard.spec.ts`, `inFlightSaveAt(..., { damagedEquipment })` in `tests/e2e/helpers/save-fixtures.ts`
- [ ] Node twin pinning the `spawnTestAttacker` death tick
- [ ] Delete `tests/guards/collision-player-death.test.ts`; amend the "cannot die" pins listed in RESEARCH

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Explosion, aft view, B&W fade look | DEATH-01 | Visual | Die in flight; check aft view, explosion, 5 s fade to grey |
| Four-line layout and wording | DEATH-01 | Visual/copy | Read Game Over / cause / Score / Press Space |
| Straight launch into nav buoy kills an idle ship | DEATH-01 | Gameplay arithmetic (A4) | Launch, full throttle straight ahead, observe |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
