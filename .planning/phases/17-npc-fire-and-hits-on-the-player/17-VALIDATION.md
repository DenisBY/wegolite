---
phase: "17"
slug: "npc-fire-and-hits-on-the-player"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
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

Filled in by the planner per task (each task's `<automated>` command). Requirement-level map:

| Req ID | Behavior | Test Type | Automated Command | File Exists |
|--------|----------|-----------|-------------------|-------------|
| CBT-15 | Gate refusals in Oolite order, one draw rule, rate of fire, cutout and cooling recover | oracle + unit + property | `docker compose run --rm test npx vitest run tests/sim/npc/fire.oracle.test.ts tests/sim/npc/fire.test.ts` | ❌ W0 |
| CBT-15 | Oolite fire sites and hot branches request fire / change behaviour | oracle + unit | `docker compose run --rm test npx vitest run tests/sim/npc/attack.oracle.test.ts` | extend |
| CBT-15 | `missedShots` feeds aim tolerance and `min_d` | oracle + unit | `docker compose run --rm test npx vitest run tests/sim/npc/target.test.ts tests/sim/npc/track.test.ts` | extend |
| CBT-15 | Rate identical at 30, 60, 144 Hz; replays after a snapshot | scenario | `docker compose run --rm test npx vitest run tests/sim/npc/fire-cadence.test.ts` | ❌ W0 |
| CBT-15 | Ordinary play never fires; decision-source guard | guard + scenario | `docker compose run --rm test npx vitest run tests/guards/fire-decision-source.test.ts tests/sim/world/populate.test.ts` | ❌ W0 (guard) |
| CBT-15 | Hook shooter and attacker spawn, taint, refusals | unit | `docker compose run --rm test npx vitest run tests/sim/ai/test-spawn.test.ts tests/app/session/probe-publisher.test.ts tests/app/probe-shape-compare.test.ts` | extend |
| CBT-16 | NPC hit on the player: facing shield, then energy, floor 0 | scenario | `docker compose run --rm test npx vitest run tests/sim/combat/npc-fire.test.ts` | amend |
| CBT-16 | NPC-vs-NPC hit and kill through the kill path; mutual kill credit pinned | scenario + property | `docker compose run --rm test npx vitest run tests/sim/combat/npc-fire.test.ts tests/sim/combat/kill.property.test.ts` | add |
| CBT-15/16 | Whole route: hook shooter to shield and energy on the HUD | browser | `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/combat.spec.ts"` (remote) | amend |
| QUAL-11 | Frozen worlds byte-identical; hash equal across rates | golden + cadence + acceptance | `docker compose run --rm test npx vitest run tests/sim/world/flight-hash-pins.test.ts tests/sim/npc/npc-cadence.test.ts tests/sim/world/world-cadence.test.ts` | exists |
| D-13 | Tripwires fail on the first consumer; each names its todo | guard | `docker compose run --rm test npx vitest run tests/guards` | ❌ W0 |
| Pitfall 16 | New functions total on malformed input | property | `docker compose run --rm test npx vitest run tests/sim/npc/steering.property.test.ts tests/sim/combat/kill.property.test.ts` | extend |
| Criterion 4 | New fixtures authored first, independent, in the manifest | oracle + guards | `docker compose run --rm test npx vitest run tests/guards/oracle-independence.test.ts tests/sim/npc/oracle-coverage.test.ts tests/oracles` | extend |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/oracles/npc/fire/` fixture family, schema, derivation module and self-test, authored by an agent with no access to `src/sim/npc`, the gate module or `tests/sim/npc`
- [ ] `tests/sim/npc/fire.oracle.test.ts` consumer; rows in `oracle-groups.ts` / `oracle-coverage.test.ts`; `oracle-runner.ts` support for weapon temperature, `missedShots`, shot timer, energy and a `ctx.fire` recorder
- [ ] `tests/sim/npc/fire.test.ts` and `tests/sim/npc/fire-cadence.test.ts`
- [ ] `tests/guards/` tripwires plus the decision-source guard, and their todo files
- [ ] NPC-vs-NPC scenario and spawned-shooter-fires scenario

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 20-seed NPC acceptance run unchanged | QUAL-11 | In no gate by decision (Phase 14 IN-04); runs on the remote machine | `docker compose run --rm test npm run test:acceptance` on the remote machine; expect 21 of 21 and the recorded numbers; record in SUMMARY |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency acceptable (targeted runs per task)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
