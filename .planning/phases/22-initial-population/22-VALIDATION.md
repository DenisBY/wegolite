---
phase: "22"
slug: "initial-population"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
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
| WORLD-08 | Fixture schema strict, header hash, draw accounting, cut table complete | oracle self-test | `docker compose run --rm test npx vitest run tests/oracles/population` | ✅ | ✅ green |
| WORLD-08 | Recorder reproduces committed fixtures byte for byte (skips without `OOLITE_SRC`) | recorder test | `docker compose run --rm -v /tmp/oolite-7437f22:/oolite:ro -e OOLITE_SRC=/oolite test npx vitest run tools/ai-harness/populator-record.test.ts` | ✅ | ✅ green |
| WORLD-08 | Planned counts and groups equal recorded ones for every entry, system and seed | oracle replay | `docker compose run --rm test npx vitest run tests/sim/world/population/plan.oracle.test.ts tests/sim/world/population/traders.oracle.test.ts tests/sim/world/population/groups.oracle.test.ts` | ✅ | ✅ green |
| WORLD-08 | `systemsInRange(7/3.5/25)` and `bottleneck` equal the recorded table for all 2,048 systems | table test | `docker compose run --rm test npx vitest run tests/sim/world/neighbourhood.test.ts` | ✅ | ✅ green |
| WORLD-08 | Placement, determinism, per-group streams, atomic groups, totality | unit + property | `docker compose run --rm test npx vitest run tests/sim/world/population/spawn.test.ts tests/sim/world/placement.test.ts` | ✅ | ✅ green |
| WORLD-08 | No placed ship has `cargo > 0` with `cargoKind` 0; each kind matches its builder; the guard's allow-list unchanged | runtime + guard | `docker compose run --rm test npx vitest run tests/sim/world/population/cargo-kind.test.ts tests/guards/pod-kind-fallback.test.ts` | ✅ | ✅ green |
| WORLD-08 | Zero missiles on every NPC | guard | `docker compose run --rm test npx vitest run tests/guards/npc-missiles-tripwire.test.ts` | ✅ | ✅ green |
| WORLD-08 / QUAL-09 | 2,048-system census: mean, peak, anarchy tail, peak groups, no skipped group, corridor hits, triangle sum | census test | `docker compose run --rm test npx vitest run tests/sim/world/population/census.test.ts tests/sim/world/population/launch-corridor.test.ts` | ✅ | ✅ green |
| WORLD-08 | Populated world hashes equal at 30/60/144 Hz | cadence | `docker compose run --rm test npx vitest run tests/sim/world/population/cadence.test.ts` | ✅ | ✅ green |
| C1 | Inert epochs 1-20 byte-identical; `INERT_POPULATION` untouched | golden | `docker compose run --rm test npx vitest run tests/sim/world/inert-isolation.test.ts` | ✅ | ✅ green |
| QUAL-09 | Largest anarchy + fight + debris within draw-call and triangle budgets | e2e (remote) | `~/.claude/scripts/wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/population-anarchy.spec.ts"` | ✅ | ✅ green |
| QUAL-12 | 20-seed acceptance 21 of 21 | acceptance (remote, by hand) | `~/.claude/scripts/wegolite-remote-run.sh run --rm test npm run test:acceptance` | ✅ | ✅ green |

Test paths (plan revision 1): the plans keep every population test under `tests/sim/world/population/`. `22-RESEARCH.md` uses earlier names (as `22-PATTERNS.md` did until plan revision 2), mapped as follows: `tests/sim/world/populate-system.oracle.test.ts` -> `tests/sim/world/population/{plan,traders,groups}.oracle.test.ts` (split by builder family); `tests/sim/world/populate-system.test.ts` -> `tests/sim/world/population/spawn.test.ts`; `tests/sim/world/census.test.ts` -> `tests/sim/world/population/census.test.ts`; `tests/sim/world/population-cadence.test.ts` and `tests/sim/world/populate-system-cadence.test.ts` -> `tests/sim/world/population/cadence.test.ts`. `tests/sim/world/neighbourhood.test.ts` keeps its name.

Task-level map (from the plans' `<verify>` blocks; each `<automated>` command has a `<fails_when>` in its plan; "gates" = `docker compose run --rm test`, `lint`, `typecheck`; "remote 20-seed" = `~/.claude/scripts/wegolite-remote-run.sh run --rm test npm run test:acceptance`, run after the task's commit because the wrapper sends the committed HEAD):

| Plan / Task | Requirement | Automated Command | Status |
|-------------|-------------|-------------------|--------|
| 22-01 T1 | WORLD-08 | `docker compose run --rm test npx vitest run tests/oracles/population tests/guards/oracle-independence.test.ts` | ✅ green |
| 22-01 T2 | WORLD-08 | `docker compose run --rm -v /tmp/oolite-7437f22:/oolite:ro -e OOLITE_SRC=/oolite test npx vitest run tools/ai-harness/populator-record.test.ts`; gates | ✅ green |
| 22-02 T1, T2 | WORLD-08 | `docker compose run --rm test npx vitest run tests/oracles/population tests/guards/oracle-independence.test.ts` | ✅ green |
| 22-02 T3 | WORLD-08 | `docker compose run --rm -v /tmp/oolite-7437f22:/oolite:ro -e OOLITE_SRC=/oolite test npx vitest run tools/ai-harness/populator-record.test.ts tests/oracles/population tests/guards/oracle-independence.test.ts tests/guards/harness-isolation.test.ts`; gates | ✅ green |
| 22-03 T1, T2 | WORLD-08 | `docker compose run --rm test npx vitest run tests/sim/world/groups-prune.test.ts tests/sim/world/snapshot-codec.test.ts tests/sim/world/sanitize.test.ts tests/sim/world/v5-hash.test.ts tests/sim/world/inert-isolation.test.ts`; gates; remote 20-seed | ✅ green |
| 22-04 T1, T2 | WORLD-08 | `docker compose run --rm test npx vitest run tests/sim/world/neighbourhood.test.ts tests/sim/world/inert-isolation.test.ts`; gates; remote 20-seed | ✅ green |
| 22-05 T1, T2 | WORLD-08 | `docker compose run --rm test npx vitest run tools/oolite-ingest/convert/npc-ships.test.ts tests/content/ships-npc.test.ts tests/sim/world/inert-isolation.test.ts tests/compliance-assets.test.ts`; `assets:check`; gates; remote 20-seed | ✅ green |
| 22-06 T1, T2 | WORLD-08 | `docker compose run --rm test npx vitest run tests/sim/world/population/plan.oracle.test.ts tests/sim/rng.test.ts tests/sim/world/inert-isolation.test.ts` | ✅ green |
| 22-06 T3 | WORLD-08 | `docker compose run --rm test npx vitest run tests/contract/fidelity.test.ts` (with and without `OOLITE_SRC`); gates; remote 20-seed | ✅ green |
| 22-07 T1 | WORLD-08 | `docker compose run --rm test npx vitest run tests/sim/world/population/traders.oracle.test.ts tests/guards/npc-missiles-tripwire.test.ts` | ✅ green |
| 22-07 T2 | WORLD-08 | `docker compose run --rm test npx vitest run tests/sim/world/population/traders.oracle.test.ts tests/sim/world/population/kit.test.ts tests/guards/npc-missiles-tripwire.test.ts tests/sim/world/inert-isolation.test.ts`; gates; remote 20-seed | ✅ green |
| 22-08 T1 | WORLD-08 | `docker compose run --rm test npx vitest run tests/sim/world/population/traders.oracle.test.ts tests/sim/world/population/kit.test.ts tests/guards/npc-missiles-tripwire.test.ts` | ✅ green |
| 22-08 T2 | WORLD-08 | `docker compose run --rm test npx vitest run tests/sim/world/population/traders.oracle.test.ts tests/sim/world/population/kit.test.ts tests/contract/fidelity.test.ts tests/guards/npc-missiles-tripwire.test.ts tests/sim/world/inert-isolation.test.ts`; `tests/contract/fidelity.test.ts` with `OOLITE_SRC`; gates; remote 20-seed | ✅ green |
| 22-09 T1-T3 | WORLD-08 | `docker compose run --rm test npx vitest run tests/sim/world/population tests/contract/fidelity.test.ts tests/guards/npc-missiles-tripwire.test.ts tests/sim/world/inert-isolation.test.ts`; gates; remote 20-seed | ✅ green |
| 22-10 T1 | WORLD-08 | `docker compose run --rm test npx vitest run tests/sim/world/population/spawn.test.ts tests/sim/world/placement.test.ts tests/sim/world/populate.test.ts tests/sim/world/inert-isolation.test.ts tests/guards/pod-kind-fallback.test.ts` | ✅ green |
| 22-10 T2 | WORLD-08 | `docker compose run --rm test npx vitest run tests/sim/world/population/spawn.test.ts tests/sim/world/population/debris-reserve.test.ts tests/sim/world/placement.test.ts tests/sim/world/inert-isolation.test.ts tests/guards/pod-kind-fallback.test.ts tests/guards/npc-missiles-tripwire.test.ts`; gates; remote 20-seed | ✅ green |
| 22-11 T1 | WORLD-08 | `docker compose run --rm test npx vitest run tests/sim/world/population/cargo-kind.test.ts tests/guards/pod-kind-fallback.test.ts tests/sim/world/inert-isolation.test.ts` | ✅ green |
| 22-11 T2 | WORLD-08 | `docker compose run --rm test npx vitest run tests/contract/fidelity.test.ts tests/sim/world/population tests/guards/pod-kind-fallback.test.ts tests/guards/npc-missiles-tripwire.test.ts tests/sim/world/inert-isolation.test.ts`; `tests/contract/fidelity.test.ts` with `OOLITE_SRC`; gates; remote 20-seed | ✅ green |
| 22-12 T1-T3 | WORLD-08, QUAL-09 | `docker compose run --rm test npx vitest run tests/sim/world/population/census.test.ts tests/sim/world/population/launch-corridor.test.ts`; full census with `POPULATION_CENSUS_FULL=1`; gates | ✅ green |
| 22-13 T1-T3 | WORLD-08 | `docker compose run --rm test npx vitest run tests/app/session tests/sim/world/population/cadence.test.ts`; gates; remote `verify` | ✅ green |
| 22-14 T1-T3 | WORLD-08 | remote `e2e` on the eight traffic-on specs; `docker compose run --rm test npx vitest run tests/app/session/world-lifecycle.test.ts`; gates; remote `verify` | ✅ green |
| 22-15 T1, T2 | QUAL-09 | `~/.claude/scripts/wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/population-anarchy.spec.ts"`; phase gate: remote `verify-full` and the 20-seed run | ✅ green |
| 22-16 T1, T2 | WORLD-08 (QUAL-13 groundwork) | `tools/oolite-reference/run-remote.sh --steps tools/oolite-reference/steps/census-anarchy.steps --addons /home/opencode/oolite-probes/population-census --out /tmp/oolite-census-anarchy --timeout 300` (an obstacle is a recorded answer) | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tools/ai-harness/populator-host.ts`, `populator-record.ts` and the recorder test (skips without `OOLITE_SRC`) (plan 22-01); `population-systems.ts` (plan 22-02)
- [x] `tests/oracles/population/{schema.ts, population.self.test.ts, fixtures/}` (plans 22-01 and 22-02)
- [x] `tests/sim/world/neighbourhood.test.ts` and `tests/sim/world/population/{plan.oracle, traders.oracle, groups.oracle, kit, spawn, debris-reserve, cargo-kind, census, launch-corridor, cadence}.test.ts`
- [x] `tests/e2e/population-anarchy.spec.ts`
- [x] `tests/guards/harness-isolation.test.ts` scope and `dist-check` markers confirmed for the new tool files (no new marker by design)
- [x] a literal vector for each new RNG purpose in `tests/sim/rng.test.ts`
- [x] Framework install: none

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real-Oolite census spike (D-07) | QUAL-13 groundwork | Needs headless Oolite in the reference container on the remote machine | `tools/oolite-reference/run-remote.sh --addons <dir> --steps <file>`; record success or where it stuck |
| 20-seed acceptance run | QUAL-12 | Outside every gate by decision; remote only | run by hand, record 21 of 21 in the plan SUMMARY |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-11-26 by /gsd-validate-phase 22: every mapped test exists and ran green in the remote phase-gate `verify-full` at 2d7dee83 (322 unit files, 10,453 tests, 168 Chromium specs) and the 20-seed run (21 of 21). The real-Oolite spike (22-16) succeeded and stays manual-only.

## Validation Audit 2026-11-26

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
