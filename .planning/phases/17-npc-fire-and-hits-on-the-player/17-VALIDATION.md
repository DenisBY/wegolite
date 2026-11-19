---
phase: "17"
slug: "npc-fire-and-hits-on-the-player"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: validated  # signed off by plan 17-10 on 2026-11-19; remote verify recorded in 17-10-SUMMARY.md
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-18"
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `17-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5 (unit, scenario, oracle consumers, guards, fast-check properties); Playwright 1.64.1 for the one browser spec |
| **Config file** | `vitest.config.ts`, `vitest.acceptance.config.ts`, Playwright configs |
| **Quick run command** | `docker compose run --rm test npx vitest run <file>` |
| **Full suite command** | `docker compose run --rm test`, then `docker compose run --rm lint` and `docker compose run --rm typecheck`; `verify` on the remote machine for the hook and browser-spec plan |
| **Standing gate (QUAL-11)** | `docker compose run --rm test npm run test:acceptance`, by hand on the remote machine, after every plan touching `src/sim/npc/**` or `src/sim/world/**`; 21 of 21, numbers unchanged, recorded in the SUMMARY |
| **Estimated runtime** | targeted ~30 s; full Vitest several minutes |

---

## Sampling Rate

- **After every task commit:** the targeted `vitest run <file>` for the touched module, then `lint` and `typecheck` for `src/sim/` tasks.
- **After every plan wave:** `docker compose run --rm test` (full, with coverage); the by-hand acceptance run where QUAL-11 applies.
- **Before `/gsd-verify-work`:** full `test`, `lint`, `typecheck` green; `verify` green on the remote machine.
- **Max feedback latency:** targeted run per task.

---

## Per-Task Verification Map

Requirement-level map, rewritten by plan 17-10 with the test files that exist at the end of the phase (each path checked with `test -f`). Status: ✅ green at the phase close.

| Req ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|-----------|-------------------|-------------|--------|
| CBT-15 | Gate refusals in Oolite order, one draw rule, rate of fire, cutout and cooling recover | oracle + unit + property | `docker compose run --rm test npx vitest run tests/oracles/npc/fire tests/sim/npc/fire.oracle.test.ts tests/sim/npc/fire.test.ts tests/sim/npc/fire.property.test.ts` | ✅ `tests/oracles/npc/fire/fire.self.test.ts`, `tests/sim/npc/fire.oracle.test.ts`, `tests/sim/npc/fire.test.ts`, `tests/sim/npc/fire.property.test.ts` | ✅ green |
| CBT-15 | Oolite fire sites and hot branches request fire / change behaviour | oracle + unit | `docker compose run --rm test npx vitest run tests/oracles/npc/fire-sites tests/sim/npc/fire-sites.oracle.test.ts tests/sim/npc/hot-weapon.test.ts tests/sim/npc/fire-route.test.ts tests/sim/npc/attack-dispatch.test.ts` | ✅ `tests/oracles/npc/fire-sites/fire-sites.self.test.ts`, `tests/sim/npc/fire-sites.oracle.test.ts` (55 fixtures), `tests/sim/npc/hot-weapon.test.ts`, `tests/sim/npc/fire-route.test.ts`, `tests/sim/npc/attack-dispatch.test.ts` | ✅ green |
| CBT-15 | `missedShots` feeds aim tolerance and `min_d` | oracle + unit | `docker compose run --rm test npx vitest run tests/sim/npc/target.test.ts tests/sim/npc/track.test.ts tests/sim/npc/fire-sites.oracle.test.ts` | ✅ `tests/sim/npc/target.test.ts`, `tests/sim/npc/track.test.ts`, `tests/sim/npc/fire-sites.oracle.test.ts` (aim-feedback fixtures) | ✅ green |
| CBT-15 | Rate identical at 30, 60, 144 Hz; replays after a snapshot | scenario | `docker compose run --rm test npx vitest run tests/sim/npc/fire-cadence.test.ts tests/sim/world/world-cadence.test.ts` | ✅ `tests/sim/npc/fire-cadence.test.ts`, `tests/sim/world/world-cadence.test.ts` | ✅ green |
| CBT-15 | Ordinary play never fires; decision-source guard | guard + scenario | `docker compose run --rm test npx vitest run tests/guards/fire-decision-source.test.ts tests/sim/world/populate.test.ts` | ✅ `tests/guards/fire-decision-source.test.ts`, `tests/sim/world/populate.test.ts` (every populated ship has `ai: null`) | ✅ green |
| CBT-15 | Hook shooter and attacker spawn, taint, refusals; the attacker fires through the gate | unit | `docker compose run --rm test npx vitest run tests/sim/ai/test-spawn.test.ts tests/app/session/probe-publisher.test.ts tests/app/probe-shape-compare.test.ts` | ✅ `tests/sim/ai/test-spawn.test.ts`, `tests/app/session/probe-publisher.test.ts`, `tests/app/probe-shape-compare.test.ts` (plan 17-10 adds the attacker cases) | ✅ green |
| CBT-16 | NPC hit on the player: facing shield, then energy, floor 0 | scenario | `docker compose run --rm test npx vitest run tests/sim/combat/npc-fire.test.ts` | ✅ `tests/sim/combat/npc-fire.test.ts` | ✅ green |
| CBT-16 | NPC-vs-NPC hit and kill through the kill path; mutual kill credit pinned (D-10) | scenario + property | `docker compose run --rm test npx vitest run tests/sim/combat/npc-vs-npc.scenario.test.ts tests/sim/combat/kill.property.test.ts` | ✅ `tests/sim/combat/npc-vs-npc.scenario.test.ts`, `tests/sim/combat/kill.property.test.ts` | ✅ green |
| CBT-15/16 | Whole route: hook shooter to shield and energy (the probe's combat values and `hud.drawn`; the HUD has no shield or energy element) | browser | `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/combat.spec.ts"` (remote) | ✅ `tests/e2e/combat.spec.ts` | ✅ green (remote, plan 17-05 snapshot `3d5e735`, `exit=0`; and the smoke subset of the remote `verify` of plan 17-10) |
| QUAL-11 | Frozen worlds byte-identical; hash equal across rates | golden + cadence + acceptance | `docker compose run --rm test npx vitest run tests/sim/world/flight-hash-pins.test.ts tests/sim/npc/npc-cadence.test.ts tests/sim/world/world-cadence.test.ts` | ✅ `tests/sim/world/flight-hash-pins.test.ts`, `tests/sim/npc/npc-cadence.test.ts`, `tests/sim/world/world-cadence.test.ts` | ✅ green (acceptance 21 of 21 remotely after every plan that changed `src/sim/npc/**`, see Manual-Only) |
| D-13 | Tripwires fail on the first consumer; each names its todo | guard | `docker compose run --rm test npx vitest run tests/guards` | ✅ `tests/guards/kill-credit-consumers.test.ts`, `tests/guards/ship-hit-consumers.test.ts`, `tests/guards/on-event-handlers.test.ts`, `tests/guards/fire-decision-source.test.ts` | ✅ green |
| Pitfall 16 | New functions total on malformed input | property | `docker compose run --rm test npx vitest run tests/sim/npc/fire.property.test.ts tests/sim/npc/steering.property.test.ts tests/sim/combat/kill.property.test.ts` | ✅ `tests/sim/npc/fire.property.test.ts`, `tests/sim/npc/steering.property.test.ts`, `tests/sim/combat/kill.property.test.ts` | ✅ green |
| Criterion 4 | New fixtures authored first, independent, in the manifest | oracle + guards | `docker compose run --rm test npx vitest run tests/guards/oracle-independence.test.ts tests/sim/npc/oracle-coverage.test.ts tests/oracles` | ✅ `tests/guards/oracle-independence.test.ts`, `tests/sim/npc/oracle-coverage.test.ts`, `tests/oracles/npc/fire`, `tests/oracles/npc/fire-sites` | ✅ green |

### Per-plan map (what each plan's automated verify proved)

| Plan | Wave | Proof | Remote result |
|------|------|-------|---------------|
| 17-01 | 1 | `tests/oracles/npc/fire/fire.self.test.ts` (33 gate, 23 on-target, 7 heat fixtures), `tests/oracles/npc/reference.self.test.ts` | none (no `src` change) |
| 17-02 | 1 | `tests/oracles/npc/fire-sites/fire-sites.self.test.ts` (72 fixtures) | none |
| 17-03 | 1 | the four guards under `tests/guards/` | none |
| 17-04 | 2 | `fire.test.ts`, `fire.oracle.test.ts`, `fire.property.test.ts`, `target.test.ts`, `track.test.ts` | acceptance 21 of 21 at `dc79f37` (baseline) and `198357e` |
| 17-05 | 3 | `npc-fire.test.ts`, `kill.test.ts`, `kill.property.test.ts`, `world-cadence.test.ts`, `tick-parity.test.ts`, `test-pilot.test.ts`, `combat.spec.ts` | combat spec `exit=0` and acceptance 21 of 21 at `3d5e735` |
| 17-06 | 4 | `fire-route.test.ts`, `flight-script.test.ts` | acceptance 21 of 21 at `3a403e0` |
| 17-07 | 5 | `hot-weapon.test.ts`, `attack-dispatch.test.ts`, `constants.test.ts` | acceptance 21 of 21 at `30f2a0c` |
| 17-08 | 6 | `fire-sites.oracle.test.ts` (55 fixtures against the port) | none (no `src` change) |
| 17-09 | 7 | `npc-vs-npc.scenario.test.ts`, `fire-cadence.test.ts`, the two new properties | none (no `src` change) |
| 17-10 | 8 | `test-spawn.test.ts`, `probe-publisher.test.ts`, `probe-shape-compare.test.ts`, the guards; remote `verify` (the phase's only full `verify`) | see `17-10-SUMMARY.md` |

---

## Wave 0 Requirements

- [x] `tests/oracles/npc/fire/` fixture family, schema, derivation module and self-test, authored by an agent with no access to `src/sim/npc`, the gate module or `tests/sim/npc` (plan 17-01; `tests/oracles/npc/fire-sites/` by plan 17-02)
- [x] `tests/sim/npc/fire.oracle.test.ts` consumer; rows in `oracle-groups.ts` / `oracle-coverage.test.ts`; `oracle-runner.ts` support for weapon temperature, `missedShots`, shot timer, energy and a `ctx.fire` recorder (plans 17-04 and 17-08)
- [x] `tests/sim/npc/fire.test.ts` and `tests/sim/npc/fire-cadence.test.ts` (plans 17-04 and 17-09)
- [x] `tests/guards/` tripwires plus the decision-source guard, and their todo files (plan 17-03)
- [x] NPC-vs-NPC scenario and spawned-shooter-fires scenario (`npc-vs-npc.scenario.test.ts`, plan 17-09; the shooter's firing in `npc-fire.test.ts` and `test-spawn.test.ts`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 20-seed NPC acceptance run unchanged | QUAL-11 | In no gate by decision (Phase 14 IN-04); runs on the remote machine | `docker compose run --rm test npm run test:acceptance` on the remote machine; expect 21 of 21 and the recorded numbers; record in SUMMARY |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency acceptable (targeted runs per task)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validation strategy signed off after plan 17-10 for every task's automated verify (each plan's targeted runs, the full suite, `lint` and `typecheck`, the remote QUAL-11 acceptance runs of plans 17-04 to 17-07 and the one remote `verify` of plan 17-10, which runs at a HEAD holding every Phase 17 change; its snapshot, exit code and elapsed time are in `17-10-SUMMARY.md`), 2026-11-19. The owner's non-blocking questions at sign-off are listed in `17-10-SUMMARY.md`.
