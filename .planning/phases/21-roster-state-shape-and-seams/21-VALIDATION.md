---
phase: "21"
slug: "roster-state-shape-and-seams"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-25"
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `21-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.1.1 (+ fast-check 4.11.0); Playwright 1.65.1 for browser specs |
| **Config file** | `vitest.config.ts`, `vitest.acceptance.config.ts`, `playwright.config.ts` |
| **Quick run command** | `docker compose run --rm test npx vitest run <file>` |
| **Full suite command** | `docker compose run --rm test` plus `docker compose run --rm lint` and `docker compose run --rm typecheck`; browser plans: remote `verify` |
| **Estimated runtime** | ~30 s targeted; several minutes for the full unit suite |

---

## Sampling Rate

- **After every task commit:** the targeted `vitest run <file>` for the touched module (plus `lint` and `typecheck` at task end).
- **After every plan:** `docker compose run --rm test`, `lint`, `typecheck`; `docker compose run --rm assets npm run assets:check` when content changed; the by-hand 20-seed acceptance run (21 of 21, remote) for plans touching `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json` (QUAL-12).
- **Render/app plans:** remote `verify`.
- **Before `/gsd-verify-work`:** remote `verify-full` (automatic, no checkpoint) and the 20-seed run 21 of 21.
- **Max feedback latency:** a targeted Vitest file per task.

---

## Per-Task Verification Map

Filled by the planner per task (`<automated>` + `<fails_when>`). Requirement-level map:

| Req | Behaviour | Test Type | Automated Command | File Exists | Status |
|-----|-----------|-----------|-------------------|-------------|--------|
| FOUND-20 | inert world epochs 1-20 hash equal before/after isolation and after v5 | golden + unit | `docker compose run --rm test npx vitest run tests/sim/world/inert-isolation.test.ts` | ❌ W0 | ⬜ pending |
| FOUND-20 | pristine v5 world hashes as v4; each new field prints one segment | unit | `... vitest run tests/sim/world/v5-hash.test.ts` | ❌ W0 | ⬜ pending |
| FOUND-20 | snapshot v5 round trip; v4/v6 and unknown keys refused; bounds refused and sanitized | unit | `... vitest run tests/sim/world/snapshot-codec.test.ts tests/sim/world/sanitize.test.ts` | ✅ (update) | ⬜ pending |
| FOUND-20 | v5 fields replay equal at 30/60/144 Hz | cadence | `... vitest run tests/sim/world/v5-cadence.test.ts` | ❌ W0 | ⬜ pending |
| FOUND-20 | priority-AI key list closed, <= 32; `"priority"` registered inert | unit + guard | `... vitest run tests/sim/ai/priority-params.test.ts tests/guards/on-event-handlers.test.ts` | ❌ W0 / ✅ | ⬜ pending |
| FOUND-20 | `retireShip` non-lethal removal | unit + property | `... vitest run tests/sim/world/retire.test.ts` | ❌ W0 | ⬜ pending |
| FOUND-20 | hit-reaction stage records every laser hit incl. lethal | unit | `... vitest run tests/sim/combat/hit-reaction.test.ts tests/guards/ship-hit-consumers.test.ts` | ❌ W0 / ✅ | ⬜ pending |
| FOUND-20 | per-facing weapon state; forward behaviour byte-identical; aft tripwire | unit + guard | `... vitest run tests/sim/npc/fire-aft.test.ts tests/guards/aft-weapon-tripwire.test.ts` | ❌ W0 | ⬜ pending |
| FOUND-20 | frozen 20-seed run 21/21 | acceptance (remote, by hand) | `wegolite-remote-run.sh run --rm test npm run test:acceptance` | ✅ | ⬜ pending |
| DATA-17 | roster equals `like_ship` resolution (28 + shuttle); fields compile; strict schema | unit | `... vitest run tools/oolite-ingest/convert/npc-ships.test.ts tests/content/ships-npc.test.ts` | ✅ (widen) | ⬜ pending |
| DATA-17 | autoAImap, role-categories, comms subset compiled | unit | `... vitest run tests/content/ai-map.test.ts` | ❌ W0 | ⬜ pending |
| DATA-17 | content drift gate | gate | `docker compose run --rm assets npm run assets:check` | ✅ | ⬜ pending |
| DATA-18 | provenance rows and checksums; GLBs decode | unit + e2e | `... vitest run tests/compliance-assets.test.ts`; e2e `npc-assets.spec.ts` | ✅ (counts) | ⬜ pending |
| DATA-18 | cold start < 9,437,184 B traffic on and off | e2e (remote) | e2e `budget.spec.ts traffic.spec.ts` | ✅ (update) | ⬜ pending |
| CBT-11 clause | pod commodity + amount from `"pod"` fork | unit + property | `... vitest run tests/sim/world/debris.test.ts tests/sim/world/debris-pod.test.ts` | ✅ / ❌ W0 | ⬜ pending |
| CBT-11 clause | twin hashes re-pinned once, Node equals browser | twin | `... vitest run tests/app/session/tick-parity.test.ts`; remote e2e `combat.spec.ts` | ✅ (re-pin) | ⬜ pending |
| QUAL-09 (staged) | full anarchy draw calls measured vs budget | e2e (remote) | e2e `anarchy-budget.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/golden/world/inert-lave-epochs-1-20.json` + `tests/sim/world/inert-isolation.test.ts` (measured on the base commit first)
- [ ] `tests/sim/world/v5-hash.test.ts`, `tests/sim/world/v5-cadence.test.ts`
- [ ] `tests/sim/ai/priority-params.test.ts`, `tests/sim/world/retire.test.ts`, `tests/sim/combat/hit-reaction.test.ts`, `tests/sim/npc/fire-aft.test.ts`, `tests/guards/aft-weapon-tripwire.test.ts`
- [ ] `tests/sim/world/debris-pod.test.ts`
- [ ] content tests for the three compiled tables
- [ ] `tests/e2e/anarchy-budget.spec.ts` + probe hook + updated `tests/fixtures/probe-shape.json`
- [ ] shared e2e budget constants (four duplicates of `DRAW_CALL_BUDGET`)

Framework install: none.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Frozen 20-seed acceptance run 21/21 | FOUND-20 / QUAL-12 | In no gate by decision (Phase 14 IN-04); runs on the remote test machine | Run on remote via wrapper script after each touching plan; record result in SUMMARY |
| Anarchy p95 frame time on GPU | QUAL-09 (staged) | Needs the remote GPU browser | Remote Playwright MCP sampler; record in SUMMARY and `docs/PERFORMANCE.md` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency: one targeted file per task
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
