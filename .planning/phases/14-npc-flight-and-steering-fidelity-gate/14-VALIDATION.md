---
phase: "14"
slug: npc-flight-and-steering-fidelity-gate
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-15"
---

# Phase 14 — Validation Strategy

> Per-phase validation contract. The full test map lives in `14-RESEARCH.md` § Validation Architecture; plans copy their rows into the per-task map below.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5, fast-check 4.10.2, Playwright 1.64.1 |
| **Config file** | `vitest.config.ts` (coverage floors on `src/sim/**`) |
| **Quick run command** | `docker compose run --rm test npx vitest run <file>` |
| **Full suite command** | `docker compose run --rm test` (+ `lint`, `typecheck`, `assets:check` when content changes) |
| **Estimated runtime** | targeted: tens of seconds; full: minutes |

---

## Sampling Rate

- **After every task commit:** targeted `vitest run` of touched files, plus `lint` and `typecheck` for pure `src/sim` and `tools` work
- **After every plan wave:** `docker compose run --rm test`
- **Before `/gsd-verify-work`:** full suite green; `verify` once on the remote machine (`wegolite-remote-run.sh run --rm verify`, committed HEAD) for the hook and browser spec; `verify-full` only on owner decision
- **Max feedback latency:** targeted runs under 60 s

---

## Per-Task Verification Map

Filled by the planner from `14-RESEARCH.md` § Phase Requirements to Test Map (AI-01, WORLD-07, AI-11).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | AI-01 | — | N/A | oracle | `docker compose run --rm test npx vitest run tests/oracles/npc` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/oracles/npc/` fixtures, reference maths and oracle tests (separate plan, separate agent, no `src/` imports)
- [ ] `tests/guards/oracle-independence.test.ts`, `tests/guards/harness-isolation.test.ts`
- [ ] `tests/acceptance/thresholds.ts` committed before the 20-seed run
- [ ] `tools/ai-harness/{load,host,dist-check}.ts` with tests; `check:dist` step in the `verify` chain
- [ ] `tests/e2e/npc-flight.spec.ts` (opt-in smoke), probe-shape hook row

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Owner accepts the fidelity report and picks the oracle (differential harness or source-cited traces) | AI-11 | Owner decision gate | Review the report; record the choice as a Key Decision |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
