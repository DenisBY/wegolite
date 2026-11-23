---
phase: "20"
slug: "player-death-and-game-over"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
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
| DEATH-01 | Lethal ledger record kills the player in flight on that tick; cause kind + culprit key | unit | `docker compose run --rm test npx vitest run tests/sim/combat/death.test.ts` | ✅ | ✅ green |
| DEATH-01 | Lethal ram (ship, buoy); player destroyable, bank-only comparison, reversal, no nudge | unit | `... vitest run tests/sim/combat/collision-stage.test.ts tests/sim/combat/collision-buoy.test.ts` | ✅ | ✅ green |
| DEATH-01 | Shields absorb → not lethal; first lethal record wins; internal-damage gates kept | unit + property | `... vitest run tests/sim/combat/ledger.test.ts tests/sim/combat/internal-damage.test.ts` | ✅ | ✅ green |
| DEATH-01 | No death docked/launching/dock tick/jump tick; countdown and ident cleared; mutual kill both die | unit | `... vitest run tests/sim/combat/death.test.ts` | ✅ | ✅ green |
| DEATH-01 | Dead state frozen: stepSim/stepFlight no-op, hash and tick unchanged | unit | `... vitest run tests/sim/death-freeze.test.ts` | ✅ | ✅ green |
| DEATH-01 | Router `playerDestroyed` → deathFlow once; 25-kind table; guards in pause/focus/context-loss/chart/sim-driver | unit | `... vitest run tests/app/session-order.test.ts tests/app/session/death-flow.test.ts tests/app/session/settings-controller.test.ts tests/app/session/chart-controller.test.ts tests/app/session/sim-driver.test.ts` | ✅ | ✅ green |
| DEATH-01 | gameOver input context: fresh Space / click reload once; everything else ignored; game-over lines model | unit | `... vitest run tests/input/station-actions.test.ts tests/ui/game-over.test.ts` | ✅ | ✅ green |
| DEATH-01 | Player explosion (D-01a, D-01b): the layer (20-11) draws four small and four big bursts with Oolite's speed range, lifetime and start size per kind (constants pinned with `src/Core/Entities/OOParticleSystem.m` lines, full path), an add without its flash, a pool of 16, and no option keeps every Phase 16 pin; the death flow (20-04) adds the eight with one flash in total, `flash: false` explicit on the seven other adds | unit | `... vitest run tests/render/explosion-layer.test.ts tests/app/session/death-flow.test.ts` | ✅ | ✅ green |
| DEATH-01 | Dead view (D-01c, D-01d): debris drawn at last sim pose + velocity x `gameOverSeconds` and tumbling on the effect time with no time limit (pose still advancing at 30 s and 45 s); past the settle time the redraw gate idles once no moving piece is in the dead camera's view (`isDebrisInDeadView`: the frustum's side planes and Oolite's no-draw distance, `NO_DRAW_DISTANCE_FACTOR` 1024) and resumes when one drifts in; `hashWorld`/`hashFlight` and debris entities unchanged; the contact copies the velocity | unit | `... vitest run tests/app/session/render-driver.test.ts tests/sim/world/contacts.test.ts` | ✅ | ✅ green |
| DEATH-06 | autosave/manualSave/queueSnapshot/writeManualSave refuse while dead (skip reason `dead`); snapshotForSave throws on dead | unit | `... vitest run tests/app/session/save-controller.test.ts tests/persistence/autosave.test.ts` | ✅ | ✅ green |
| DEATH-06 | Death → Space → reload → title Continue → resumes save with damaged equipment | e2e | `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/death-and-reload.spec.ts"` | ✅ | ✅ green |
| DEATH-06 | Autosave trigger, F2, P, Esc, F6, blur, visibilitychange never save or revive the dead | e2e | `... npx playwright test tests/e2e/game-over-guard.spec.ts` | ✅ | ✅ green |
| DEATH-06 | No save → title offers New game only | e2e (primary), unit (secondary) | `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/death-and-reload.spec.ts"`; secondary: `... vitest run tests/app/title-confirm.test.ts` | ✅ | ✅ green |
| QUAL-11 | NPC-vs-NPC kill + collision kill + player death hash equal at 30/60/144 Hz; dead hash stable | unit | `docker compose run --rm test npx vitest run tests/sim/world/death-cadence.test.ts` | ✅ | ✅ green |
| QUAL-11 | 20-seed acceptance 21 of 21 at phase HEAD | acceptance | `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm test npm run test:acceptance` | ✅ | ✅ green |
| Release | verify-full exits 0 with the two new specs | gate | `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm verify-full` | — | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Additional coverage beyond the map:** `tests/sim/combat/death.property.test.ts`, `tests/guards/player-death-producer.test.ts`, `tests/guards/dead-mode-gates.test.ts`, `tests/contract/fidelity.test.ts`.

---

## Wave 0 Requirements

- [x] `tests/sim/combat/death.test.ts`
- [x] `tests/sim/death-freeze.test.ts`
- [x] `tests/sim/world/death-cadence.test.ts` (terminate by step count, not `state.tick`)
- [x] `tests/app/session/death-flow.test.ts`
- [x] `tests/ui/game-over.test.ts`, `tests/input/station-actions.test.ts`
- [x] `tests/e2e/death-and-reload.spec.ts`, `tests/e2e/game-over-guard.spec.ts`, `inFlightSaveAt(..., { damagedEquipment })` in `tests/e2e/helpers/save-fixtures.ts`
- [x] Node twin `tests/app/session/death-twin.test.ts` pinning the death tick of the seeded nav-buoy ram (`DEATH_RAM_POSE`)
- [x] Delete `tests/guards/collision-player-death.test.ts`; amend the "cannot die" pins listed in RESEARCH (done in 20-01; replaced by `tests/guards/player-death-producer.test.ts`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Explosion, aft view, B&W fade look | DEATH-01 | Visual | Die in flight; check aft view, explosion (four small, four big bursts, one flash), wreckage from earlier kills still drifting and tumbling with no time limit (D-01c, D-01d), 5 s fade to grey in Chromium and Firefox; judge whether the one flash (1x r seen from 100 m, about 10.9 km/s growth, 0.4 s, alpha 0.5) fills the view and hides the bursts, and whether the small bursts read as sparks (review round 2) |
| Four-line layout, wording and legibility | DEATH-01 | Visual/copy | Read Game Over / cause / Score / Press Space; check that the four lines stay legible over a bright station face (a live check showed "Destroyed by GalCop Viper" partly lost against a lit station), and judge wording and layout |
| The idle launch meets the nav buoy as 20-01 measured and pinned it | DEATH-01 | Browser confirmation of the Vitest pin (A4, measured in 20-01) | Launch straight and touch nothing, with traffic on (the production default; a `?test=1` run needs `&traffic=1`, never `?test=1` without `&traffic=1`); expect the ram on the nav buoy about a minute after launch, matching 20-01's idle-launch scenario and the CHANGELOG line |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-23 (Nyquist audit: no gaps)

## Validation Audit 2026-11-23

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
