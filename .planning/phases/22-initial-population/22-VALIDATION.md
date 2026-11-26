---
phase: "22"
slug: "initial-population"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-26"
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `22-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.1.1 + fast-check 4.11.0; Playwright 1.65.1 (browser) |
| **Config file** | `vitest.config.ts`, `vitest.acceptance.config.ts`, `playwright.config.ts` |
| **Quick run command** | `docker compose run --rm test npx vitest run <file>` |
| **Full suite command** | `docker compose run --rm test` plus `docker compose run --rm lint` and `docker compose run --rm typecheck`; browser plans: remote `verify` (`~/.claude/scripts/wegolite-remote-run.sh run --rm verify`) |
| **Estimated runtime** | ~60 seconds targeted; full suite several minutes |

---

## Sampling Rate

- **After every task commit:** the targeted `vitest run <file>` for the touched module; `lint` and `typecheck` at task end.
- **After every plan:** `docker compose run --rm test`, `lint`, `typecheck`; `docker compose run --rm assets npm run assets:check` when `ships-npc.json` or its schema changed; the by-hand 20-seed acceptance run (21 of 21, remote) after every plan touching `src/sim/world/**`, `src/sim/npc/**` or `ships-npc.json` (QUAL-12).
- **Browser-facing plans (live switch, QUAL-09 spec):** remote `verify`; `verify-full` at the phase gate (automatic, no owner checkpoint).
- **Pure-logic plans (recorder, neighbourhood, planner):** `test`, `lint`, `typecheck` only.
- **Before `/gsd-verify-work`:** full suite green.
- **Max feedback latency:** ~120 seconds for a targeted run.

---

## Per-Task Verification Map

Filled by the planner per task; requirement-level map:

| Requirement | Behaviour | Test Type | Automated Command | File Exists | Status |
|-------------|-----------|-----------|-------------------|-------------|--------|
| WORLD-08 | Fixture schema strict, header hash, draw accounting, cut table complete | oracle self-test | `docker compose run --rm test npx vitest run tests/oracles/population` | ❌ W0 | ⬜ pending |
| WORLD-08 | Recorder reproduces committed fixtures byte for byte (skips without `OOLITE_SRC`) | recorder test | `docker compose run --rm -v /home/opencode/git/oolite:/oolite:ro -e OOLITE_SRC=/oolite test npx vitest run tools/ai-harness/populator-record.test.ts` | ❌ W0 | ⬜ pending |
| WORLD-08 | Planned groups equal recorded groups for every entry, system and seed | oracle replay | `docker compose run --rm test npx vitest run tests/sim/world/populate-system.oracle.test.ts` | ❌ W0 | ⬜ pending |
| WORLD-08 | `systemsInRange(7/3.5/25)` and `bottleneck` equal the recorded table for all 2,048 systems | table test | `docker compose run --rm test npx vitest run tests/sim/world/neighbourhood.test.ts` | ❌ W0 | ⬜ pending |
| WORLD-08 | Placement, determinism, per-group streams, atomic groups, totality | unit + property | `docker compose run --rm test npx vitest run tests/sim/world/populate-system.test.ts` | ❌ W0 | ⬜ pending |
| WORLD-08 | Zero missiles on every NPC | guard | `docker compose run --rm test npx vitest run tests/guards/npc-missiles-tripwire.test.ts` | ✅ | ⬜ pending |
| WORLD-08 / QUAL-09 | 2,048-system census: mean, peak, anarchy tail, peak groups, no skipped group, corridor hits, triangle sum | census test | `docker compose run --rm test npx vitest run tests/sim/world/census.test.ts` | ❌ W0 | ⬜ pending |
| WORLD-08 | Populated world hashes equal at 30/60/144 Hz | cadence | `docker compose run --rm test npx vitest run tests/sim/world/populate-system-cadence.test.ts` | ❌ W0 | ⬜ pending |
| C1 | Inert epochs 1-20 byte-identical; `INERT_POPULATION` untouched | golden | `docker compose run --rm test npx vitest run tests/sim/world/inert-isolation.test.ts` | ✅ | ⬜ pending |
| QUAL-09 | Largest anarchy + fight + debris within draw-call and triangle budgets | e2e (remote) | `~/.claude/scripts/wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/population-anarchy.spec.ts"` | ❌ W0 | ⬜ pending |
| QUAL-12 | 20-seed acceptance 21 of 21 | acceptance (remote, by hand) | `~/.claude/scripts/wegolite-remote-run.sh run --rm test npm run test:acceptance` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tools/ai-harness/populator-host.ts`, `populator-record.ts`, `population-systems.ts` and a recorder test (skips without `OOLITE_SRC`)
- [ ] `tests/oracles/population/{schema.ts, population.self.test.ts, fixtures/}`
- [ ] `tests/sim/world/{populate-system.oracle.test.ts, neighbourhood.test.ts, populate-system.test.ts, census.test.ts, populate-system-cadence.test.ts}`
- [ ] `tests/e2e/population-anarchy.spec.ts`
- [ ] `tests/guards/harness-isolation.test.ts` scope and `dist-check` markers extended to the new tool files
- [ ] a literal vector for each new RNG purpose in `tests/sim/rng.test.ts`
- [ ] Framework install: none

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real-Oolite census spike (D-07) | QUAL-13 groundwork | Needs headless Oolite in the reference container on the remote machine | `tools/oolite-reference/run-remote.sh --addons <dir> --steps <file>`; record success or where it stuck |
| 20-seed acceptance run | QUAL-12 | Outside every gate by decision; remote only | run by hand, record 21 of 21 in the plan SUMMARY |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
