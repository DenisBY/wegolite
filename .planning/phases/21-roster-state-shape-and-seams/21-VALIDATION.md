---
phase: "21"
slug: "roster-state-shape-and-seams"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
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
| FOUND-20 | inert world epochs 1-20 hash equal before/after isolation and after v5 | golden + unit | `docker compose run --rm test npx vitest run tests/sim/world/inert-isolation.test.ts` | ✅ | ✅ green |
| FOUND-20 | pristine v5 world hashes as v4; each new field prints one segment | unit | `... vitest run tests/sim/world/v5-hash.test.ts` | ✅ | ✅ green |
| FOUND-20 | snapshot v5 round trip; v4/v6 and unknown keys refused; bounds refused and sanitized | unit | `... vitest run tests/sim/world/snapshot-codec.test.ts tests/sim/world/sanitize.test.ts` | ✅ | ✅ green |
| FOUND-20 | v5 fields replay equal at 30/60/144 Hz | cadence | `... vitest run tests/sim/world/v5-cadence.test.ts` | ✅ | ✅ green |
| FOUND-20 | priority-AI key list closed, <= 32; `"priority"` registered inert | unit + guard | `... vitest run tests/sim/ai/priority-params.test.ts tests/guards/on-event-handlers.test.ts` | ✅ | ✅ green |
| FOUND-20 | `retireShip` non-lethal removal | unit + property | `... vitest run tests/sim/world/retire.test.ts` | ✅ | ✅ green |
| FOUND-20 | hit-reaction stage records every laser hit incl. lethal | unit | `... vitest run tests/sim/combat/hit-reaction.test.ts tests/guards/ship-hit-consumers.test.ts` | ✅ | ✅ green |
| FOUND-20 | per-facing weapon state; forward behaviour byte-identical; aft tripwire | unit + guard | `... vitest run tests/sim/npc/fire-aft.test.ts tests/guards/aft-weapon-tripwire.test.ts` | ✅ | ✅ green |
| FOUND-20 | every new sim function total on malformed input (milestone rule) | property (fast-check) | the per-plan property files: `inert-isolation` (`inertRecords`), `sanitize`, `state`, `priority-params`, `hit-reaction`, `view`, `fire-aft`, `drift`, `death`, `debris-pod`, `debris`, `test-spawn` | ✅ | ✅ green |
| FOUND-20 | frozen 20-seed run 21/21 | acceptance (remote, by hand) | `wegolite-remote-run.sh run --rm test npm run test:acceptance` | ✅ | ✅ green at 390a8fcc; ✅ re-run green after the review fixes (remote verify-full exit 0 at f7ded029; acceptance 21 of 21 at 73e43eff) |
| DATA-17 | roster equals `like_ship` resolution (28 + shuttle); fields compile; strict schema | unit | `... vitest run tools/oolite-ingest/convert/npc-ships.test.ts tests/content/ships-npc.test.ts` | ✅ | ✅ green |
| DATA-17 | autoAImap, role-categories, comms subset compiled | unit | `... vitest run tests/content/ai-map.test.ts` | ✅ | ✅ green |
| DATA-17 | zero NPC missiles guarded; missiles, escape-pod and NPC heat defaults recorded (FIDELITY E-194, E-195, E-196) | guard + contract | `... vitest run tests/guards/npc-missiles-tripwire.test.ts tests/contract/fidelity.test.ts` | ✅ | ✅ green |
| DATA-18 | hull octrees shared per model (`aliases`); roster counts derived | unit | `... vitest run tools/oolite-ingest/convert/ship-hulls.test.ts tests/content/ships-hulls.test.ts tests/app/session/traffic.test.ts` | ✅ | ✅ green |
| DATA-17 | content drift gate | gate | `docker compose run --rm assets npm run assets:check` | ✅ | ✅ re-run green after the review fixes (remote verify-full exit 0 at f7ded029; acceptance 21 of 21 at 73e43eff) |
| DATA-18 | provenance rows and checksums; GLBs decode | unit + e2e | `... vitest run tests/compliance-assets.test.ts`; e2e `npc-assets.spec.ts` | ✅ | ✅ green (unit); e2e green at 390a8fcc, ✅ re-run green after the review fixes (remote verify-full exit 0 at f7ded029; acceptance 21 of 21 at 73e43eff) |
| DATA-18 | cold start < 9,437,184 B traffic on and off | e2e (remote) | e2e `budget.spec.ts traffic.spec.ts` | ✅ (update) | ✅ green at 390a8fcc; ✅ re-run green after the review fixes (remote verify-full exit 0 at f7ded029; acceptance 21 of 21 at 73e43eff) |
| CBT-11 clause | pod commodity + amount from `"pod"` fork | unit + property | `... vitest run tests/sim/world/debris.test.ts tests/sim/world/debris-pod.test.ts` | ✅ | ✅ green |
| CBT-11 clause | twin hashes re-pinned once, Node equals browser | twin | `... vitest run tests/app/session/tick-parity.test.ts`; remote e2e `combat.spec.ts` | ✅ (re-pin) | ✅ green at 390a8fcc; ✅ re-run green after the review fixes (remote verify-full exit 0 at f7ded029; acceptance 21 of 21 at 73e43eff) |
| QUAL-09 (staged) | full anarchy draw calls and triangles measured vs budget, before and after each D-05 fix | e2e (remote) | e2e `anarchy.spec.ts` | ❌ W0 | ✅ green at 390a8fcc; ✅ re-run green after the review fixes (remote verify-full exit 0 at f7ded029; acceptance 21 of 21 at 73e43eff) |
| DATA-18 (D-05 fix 1) | NPC hull primitives merged per hull, texel-exact atlases, validity conditions | unit | `... vitest run tools/oolite-ingest/convert/atlas.test.ts tools/oolite-ingest/convert/glb.test.ts`; `assets:check` | ✅ | ✅ green |
| DATA-18 (D-05 fix 2) | variant hulls share one instanced mesh set; keys derived from loaded assets | unit | `... vitest run tests/render/npc-ships.test.ts tests/render/npc-variant-material.test.ts` | ✅ / ❌ (21-18 deferred) | ⚠️ partial: `npc-ships` green; fix (2) deferred with 21-18 |
| DATA-18 (budget) | inclusive budget boundary (budget passes, budget + 1 and 0 fail) | unit | `... vitest run tests/app/e2e-budgets.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Additional coverage beyond the map:** `tests/sim/combat/death.property.test.ts`, `tests/guards/{departure-path,kill-credit-consumers,world-record-repair,dead-mode-gates,player-death-producer}.test.ts`, `tests/sim/world/{debris-cadence,debris-cap,spawn-refusal}.test.ts`, `tools/oolite-ingest/convert/{auto-ai-map,role-categories,comms}.test.ts`.

### Per-task map (from the plans' `<automated>` commands; each has a `<fails_when>` in its plan)

Local commands run as `docker compose run --rm test npx vitest run <files>`; "remote" means `~/.claude/scripts/wegolite-remote-run.sh run --rm <service ...>`. Every plan's last task also runs the full `test`, `lint` and `typecheck`.

| Task | Wave | Req | Automated command (files or service) | Creates |
|------|------|-----|--------------------------------------|---------|
| 21-01 T1 (tracer) | 1 | FOUND-20 | `tests/sim/world/inert-isolation.test.ts tests/sim/world/populate.test.ts` | the epoch 1-20 golden and test |
| 21-01 T2 | 1 | FOUND-20 | `tests/sim/world/inert-isolation.test.ts tests/sim/world/populate.test.ts tests/app/session/traffic.test.ts` | nine-record pin |
| 21-01 T3 | 1 | FOUND-20 | full suite, lint, typecheck; remote `test npm run test:acceptance` | — |
| 21-02 T1 (tracer) | 2 | DATA-18 | `tests/compliance-assets.test.ts` | — |
| 21-02 T2 | 2 | DATA-18 | `tests/compliance-assets.test.ts tools/oolite-ingest/convert/textures.test.ts tests/sim/world/inert-isolation.test.ts`; `assets npm run assets:check`; full suite, lint | — |
| 21-03 T1 (tracer) | 2 | FOUND-20 | `tests/sim/world/{v5-hash,snapshot-codec,sanitize,spawn-refusal,inert-isolation,flight-hash-pins,hash}.test.ts`; typecheck | `v5-hash.test.ts` |
| 21-03 T2 | 2 | FOUND-20 | `tests/sim/world/{v5-hash,snapshot-codec,sanitize,spawn-refusal,inert-isolation}.test.ts`; typecheck | — |
| 21-03 T3 | 2 | FOUND-20 | `tests/sim/world/{v5-hash,snapshot-codec,sanitize}.test.ts tests/sim/rng.test.ts tests/sim/world/inert-isolation.test.ts`; full suite, lint, typecheck; remote acceptance | — |
| 21-04 T1 (tracer) | 2 | DATA-18 | `tools/oolite-ingest/convert/ship-hulls.test.ts tests/content/ships-hulls.test.ts tests/app/session/traffic.test.ts tests/sim/world/inert-isolation.test.ts`; `assets:check` | — |
| 21-04 T2 | 2 | DATA-18 | full suite, lint, typecheck; remote `verify`; remote e2e `budget.spec.ts npc-assets.spec.ts` | — |
| 21-05 T1 (tracer) | 3 | DATA-17 | `tools/oolite-ingest/convert/npc-ships.test.ts tests/content/ships-npc.test.ts tests/sim/world/inert-isolation.test.ts tests/compliance-assets.test.ts`; `assets:check` | — |
| 21-05 T2 | 3 | DATA-17 | `tools/oolite-ingest/convert/npc-ships.test.ts tests/content/ships-npc.test.ts`; `assets:check` | — |
| 21-05 T3 | 3 | DATA-17 | `tests/guards/npc-missiles-tripwire.test.ts tests/contract/fidelity.test.ts tests/content/ships-npc.test.ts`; full suite, lint, typecheck, `assets:check`; remote acceptance | `npc-missiles-tripwire.test.ts` |
| 21-06 T1 (tracer) | 3 | FOUND-20 | `tests/sim/world/{v5-hash,snapshot-codec,sanitize,inert-isolation,hash}.test.ts` | — |
| 21-06 T2 | 3 | FOUND-20 | `tests/sim/world/{v5-hash,v5-cadence,snapshot-codec,sanitize}.test.ts tests/sim/combat/state.test.ts tests/sim/world/inert-isolation.test.ts tests/app/session/tick-parity.test.ts`; full suite, lint, typecheck; remote acceptance | `v5-cadence.test.ts` |
| 21-07 T1 (tracer) | 3 | FOUND-20 | `tests/sim/ai/priority-params.test.ts tests/guards/{on-event-handlers,ai-zone}.test.ts tests/sim/world/snapshot-codec.test.ts`; typecheck | `priority-params.test.ts` |
| 21-07 T2 | 3 | FOUND-20 | `tests/guards/{priority-ai-unspawned,on-event-handlers}.test.ts tests/sim/combat/kill.property.test.ts tests/sim/npc/steering.property.test.ts`; full suite, lint, typecheck | `priority-ai-unspawned.test.ts` |
| 21-08 T1 (tracer) | 4 | DATA-17, DATA-18 | `tools/oolite-ingest/convert/{npc-ships,ship-mass,ship-radius}.test.ts tests/content/{ships-npc,ships-hulls}.test.ts tests/sim/world/inert-isolation.test.ts tests/compliance-assets.test.ts`; `assets:check` | — |
| 21-08 T2 | 4 | DATA-17, DATA-18 | `tools/oolite-ingest tests/content tests/app/session/traffic.test.ts tests/sim/world/inert-isolation.test.ts tests/app/session/tick-parity.test.ts tests/compliance-assets.test.ts`; `assets:check`; full suite, lint, typecheck; remote `verify`; remote e2e `budget.spec.ts traffic.spec.ts npc-assets.spec.ts`; remote acceptance | — |
| 21-09 T1 (tracer) | 4 | FOUND-20 | `tests/sim/world/retire.test.ts tests/guards/departure-path.test.ts tests/guards/kill-credit-consumers.test.ts tests/sim/world/kill.test.ts` | `retire.test.ts`, `departure-path.test.ts` |
| 21-09 T2 | 4 | FOUND-20 | `tests/sim/combat/{hit-reaction,ledger,step}.test.ts tests/guards/{ship-hit-consumers,kill-credit-consumers}.test.ts tests/app/session/tick-parity.test.ts` | `hit-reaction.test.ts` |
| 21-09 T3 | 4 | FOUND-20 | `tests/sim/world/{view,control}.test.ts`; full suite, lint, typecheck; remote acceptance | — |
| 21-10 T1 (tracer) | 5 | DATA-17 | `tools/oolite-ingest/convert/auto-ai-map.test.ts tests/content/ai-map.test.ts tests/compliance-assets.test.ts`; `assets:check` | `ai-map.test.ts` |
| 21-10 T2 | 5 | DATA-17 | `tools/oolite-ingest/convert/{role-categories,comms}.test.ts tests/content/ai-map.test.ts tests/compliance-assets.test.ts`; `assets:check`; full suite, lint, typecheck; remote `verify` | — |
| 21-11 T1 (tracer) | 5 | DATA-18 | `tests/app/npc-models.test.ts tests/app/session/render-driver.test.ts tests/guards/entity-id-scope.test.ts tests/app/session/tick-parity.test.ts` | — |
| 21-11 T2 | 5 | DATA-18 | full suite, lint, typecheck; remote `verify`; remote e2e `budget.spec.ts traffic.spec.ts` | — |
| 21-12 T1 (tracer) | 5 | FOUND-20 | `tests/sim/npc/{fire-aft,fire,fire.oracle,fire-cadence}.test.ts tests/sim/world/control.test.ts tests/app/session/{traffic,tick-parity}.test.ts`; typecheck | `fire-aft.test.ts` |
| 21-12 T2 | 5 | FOUND-20 | `tests/sim/npc/fire-aft.test.ts tests/sim/npc tests/sim/combat tests/app/session/tick-parity.test.ts tests/sim/world/inert-isolation.test.ts` | — |
| 21-12 T3 | 5 | FOUND-20 | `tests/guards/{aft-weapon-tripwire,fire-decision-source}.test.ts`; full suite, lint, typecheck; remote `verify`; remote acceptance | `aft-weapon-tripwire.test.ts` |
| 21-13 T1 (tracer) | 6 | FOUND-20 | `tests/sim/world/{drift,kill,step}.test.ts tests/render/explosion-layer.test.ts tests/app/session-order.test.ts tests/app/session/tick-parity.test.ts tests/guards/{entity-id-scope,kill-credit-consumers}.test.ts` | — |
| 21-13 T2 | 6 | FOUND-20 | `tests/sim/combat/death.test.ts tests/render/explosion-layer.test.ts tests/contract/fidelity.test.ts tests/guards/player-death-producer.test.ts`; full suite, lint, typecheck; remote `verify`; remote acceptance | — |
| 21-14 T1 (tracer) | 6 | FOUND-20 (CBT-11 clause) | `tests/sim/world/{debris-pod,debris,debris-cadence,debris-cap}.test.ts tests/app/session/tick-parity.test.ts` | `debris-pod.test.ts` |
| 21-14 T2 | 6 | FOUND-20 (CBT-11 clause) | `tests/sim/ai/test-spawn.test.ts tests/guards/pod-kind-fallback.test.ts tests/app/session/tick-parity.test.ts tests/sim/world/inert-isolation.test.ts`; full suite, lint, typecheck; remote acceptance | `pod-kind-fallback.test.ts` |
| 21-15 T1 (tracer) | 7 | FOUND-20 (D-01) | `tests/sim/world/{debris,debris-pod,debris-cadence,inert-isolation,flight-hash-pins}.test.ts tests/app/session/tick-parity.test.ts` | — |
| 21-15 T2 | 7 | FOUND-20 (CBT-11 clause) | `tests/app/session/{tick-parity,step-options,traffic}.test.ts tests/sim/world/{inert-isolation,debris-pod}.test.ts`; remote e2e `combat.spec.ts` | — |
| 21-15 T3 | 7 | FOUND-20 | `tests/contract/fidelity.test.ts`; full suite, lint, typecheck; remote `verify`; remote acceptance | — |
| 21-16 T1 (tracer) | 7 | DATA-18 (QUAL-09 staged) | `tests/sim/ai/test-spawn.test.ts tests/app/session/probe-publisher.test.ts tests/guards/{aft-weapon-tripwire,fire-decision-source}.test.ts`; remote e2e `anarchy.spec.ts probe-shape.spec.ts` | `anarchy.spec.ts` |
| 21-16 T2 | 7 | DATA-18 (QUAL-09 staged) | `tests/sim/ai/test-spawn.test.ts`; full suite, lint, typecheck; remote `verify` | — |
| 21-17 T1 (tracer) | 8 | DATA-18 (D-05 fix 1) | `tools/oolite-ingest/convert/{atlas,glb,textures,texture-encode}.test.ts tests/compliance-assets.test.ts`; `assets:check`; remote e2e `anarchy.spec.ts npc-assets.spec.ts` | `atlas.ts`, `atlas.test.ts` |
| 21-17 T2 | 8 | DATA-18 (D-05 fix 1) | `tools/oolite-ingest tests/content tests/compliance-assets.test.ts tests/render/npc-ships.test.ts`; `assets:check`; remote e2e `budget traffic npc-assets models` specs | — |
| 21-17 T3 | 8 | DATA-18 (D-05 fix 1) | full suite, lint, typecheck, `assets:check`; remote `verify`; remote e2e `anarchy budget traffic` specs | — |
| 21-18 T1 (tracer) | 9 | DATA-18 (D-05 fix 2) | `tests/render/npc-ships.test.ts`; remote e2e `anarchy.spec.ts traffic.spec.ts` | — |
| 21-18 T2 | 9 | DATA-18 (D-05 fix 2) | `tests/render/{npc-variant-material,npc-ships}.test.ts`; full suite, lint, typecheck; remote `verify`; remote e2e `anarchy traffic combat` specs | `npc-variant-material.ts`, its test |
| 21-19 T1 (tracer) | 10 | DATA-18 (QUAL-09 staged) | `tests/app/e2e-budgets.test.ts`; remote e2e `anarchy.spec.ts` | `tests/e2e/helpers/budgets.ts`, `tests/app/e2e-budgets.test.ts` |
| 21-19 T2 | 10 | DATA-18 (QUAL-09 staged) | remote e2e `anarchy.spec.ts`; remote GPU p95 (manual-only row) | — |
| 21-19 T3 | 10 | DATA-18 (QUAL-09 staged) | full suite, lint, typecheck; remote e2e `anarchy budget traffic npc-flight combat` specs; remote `verify-full` (phase gate); remote acceptance | — |

Sampling continuity: every task has an automated command; no three consecutive tasks lack one.

---

## Wave 0 Requirements

- [x] `tests/golden/world/inert-lave-epochs-1-20.json` + `tests/sim/world/inert-isolation.test.ts` (measured on the base commit first)
- [x] `tests/sim/world/v5-hash.test.ts`, `tests/sim/world/v5-cadence.test.ts`
- [x] `tests/sim/ai/priority-params.test.ts`, `tests/sim/world/retire.test.ts`, `tests/sim/combat/hit-reaction.test.ts`, `tests/sim/npc/fire-aft.test.ts`, `tests/guards/aft-weapon-tripwire.test.ts`
- [x] `tests/sim/world/debris-pod.test.ts`
- [x] `tests/guards/npc-missiles-tripwire.test.ts`, `tests/guards/pod-kind-fallback.test.ts`
- [x] content tests for the three compiled tables
- [x] `tests/e2e/anarchy.spec.ts` + probe hook + updated `tests/fixtures/probe-shape.json`
- [x] `tools/oolite-ingest/convert/atlas.test.ts` (21-17); `tests/render/npc-variant-material.test.ts` not created: plan 21-18 (D-05 fix 2) deferred, owner item in 21-VERIFICATION.md
- [x] shared e2e budget constants `tests/e2e/helpers/budgets.ts` (four `DRAW_CALL_BUDGET`, one `TRIANGLE_BUDGET`, two `FIRST_LOAD_BYTES_CEILING` declarations) and the Vitest boundary check `tests/app/e2e-budgets.test.ts` (21-19; not under `tests/e2e/`, where Playwright would collect a `*.test.ts`)

Framework install: none.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Frozen 20-seed acceptance run 21/21 | FOUND-20 / QUAL-12 | In no gate by decision (Phase 14 IN-04); runs on the remote test machine | Run on remote via wrapper script after each touching plan; record result in SUMMARY |
| Anarchy p95 frame time on GPU | QUAL-09 (staged) | Needs the remote GPU browser | Remote Playwright MCP sampler (plan 21-19, after both D-05 fixes); record in SUMMARY and `docs/PERFORMANCE.md` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency: one targeted file per task
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-26 (Nyquist audit: no gaps; 21-18 deferred out of scope)

## Validation Audit 2026-11-26

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Audited at HEAD 73e43eff. Every test file named in both maps exists, except `tests/render/npc-variant-material.test.ts`, which belongs to the deferred plan 21-18. The 36 mapped Vitest files pass in Docker (2028 passed, 1 skipped), and so do the full `test:fast` suite, `lint` and `typecheck`. Each property row has a fast-check file. The rows for remote e2e, `assets:check` and acceptance were green at 390a8fcc (21-19 SUMMARY). The review fixes landed after that commit, so the orchestrator's remote gate at HEAD has to confirm those rows. No tests were added.
