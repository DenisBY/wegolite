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
- **Before `/gsd-verify-work`:** full suite green; plan 14-17's freeze check and exact-content gate pass at HEAD (plan 14-19 reruns both); `npm run test:acceptance` green, meaning every threshold and run minimum holds with the committed `tests/acceptance/accepted-crossings.ts` applied (plan 14-17's final run; plan 14-19 reruns it only when `src/sim`, `src/content/generated`, `tests/acceptance`, the acceptance config or an imported helper changed since plan 14-17's summary commit, and otherwise cites that run); `verify` once on the remote machine at the phase end (plan 14-19; `wegolite-remote-run.sh run --rm verify`, committed HEAD), besides plan 14-07's own run after its chain change; the targeted opt-in browser specs run remotely in plan 14-18; `verify-full` only on owner decision
- **Max feedback latency:** targeted runs under 60 s

## Acceptance Frozen Set

The one definition plans 14-07, 14-17 and 14-19 use (round 3 review): `tests/acceptance/thresholds.ts` has exactly one commit, plan 14-07's, and is never edited again by any option, not even for formatting; the harness files `tests/acceptance/detectors.ts`, `tests/acceptance/detectors.test.ts`, `tests/acceptance/npc-flight.acceptance.ts`, `src/sim/ai/pilots/flight-script.ts` and `src/sim/ai/test-spawn.ts` are frozen from the harness commit onward (the commit of plan 14-17's Task 1 that adds `detectors.ts`; `flight-script.ts` and `test-spawn.ts` are committed earlier, by plan 14-16, and the freeze check counts their commits after the harness commit) and change afterwards only in a commit whose message carries the trailer line `Detector-change-approved-by-owner: <date> <reason>` citing the owner's answer recorded in the plan 14-17 summary (option (c)). `tests/acceptance/accepted-crossings.ts` lies outside the frozen set and changes only on the owner's recorded option (a) answer, one entry per crossing episode of any class (owner-delegated decision, round 3; `MAX_HULL_CROSSINGS` stays 0). The freeze check is an execution-time `git rev-list --count` check (Tasks 2 and 4 of plan 14-17, Task 2 of plan 14-19), never a CI test; plans 14-18 and 14-19 touch no frozen file. The escalation options are those plan 14-07 commits: a crossing episode has (a) accept, (b) port defect and (c) harness defect; every other breach has (b) and (c).

---

## Per-Task Verification Map

Filled by the planner from `14-RESEARCH.md` § Phase Requirements to Test Map (AI-01, WORLD-07, AI-11).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | AI-01 | T-14-01, T-14-02 | oracle tree imports nothing from `src/` | oracle self-test + guard | `docker compose run --rm test npx vitest run tests/oracles/npc tests/guards/oracle-independence.test.ts` | ❌ W0 | ⬜ pending |
| 14-01-02 | 01 | 1 | AI-01 | T-14-01 | N/A | oracle self-test (navigation: fly to, face) | `docker compose run --rm test npx vitest run tests/oracles/npc tests/guards/oracle-independence.test.ts`, then `docker compose run --rm lint` and `docker compose run --rm typecheck` | ❌ W0 | ⬜ pending |
| 14-02-01 | 02 | 1 | AI-01 | T-14-03, T-14-36 | N/A | oracle self-test (intercept, flee; closed-form check rule) | `docker compose run --rm test npx vitest run tests/oracles/npc/pursuit` | ❌ W0 | ⬜ pending |
| 14-02-02 | 02 | 1 | AI-01 | T-14-04 | N/A | oracle self-test (attack dispatch, perform entries) + RESEARCH correction | `docker compose run --rm test npx vitest run tests/oracles/npc/pursuit` and `rg -c 'ShipEntityAI.m:383-389' .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-RESEARCH.md` | ❌ W0 | ⬜ pending |
| 14-02-03 | 02 | 1 | AI-01 | T-14-03, T-14-36 | N/A | oracle self-test (attack sub-behaviours) | `docker compose run --rm test npx vitest run tests/oracles/npc/pursuit` | ❌ W0 | ⬜ pending |
| 14-03-01 | 03 | 1 | AI-01 | T-14-05 | strict schema, finite flight fields | content + drift | `docker compose run --rm assets npm run assets:check` and `docker compose run --rm test npx vitest run tests/content/ships-npc.test.ts tools/oolite-ingest/convert/npc-ships.test.ts` | extend | ⬜ pending |
| 14-03-02 | 03 | 1 | AI-01 | T-14-06 | build refuses the assumption keys | unit | `docker compose run --rm test npx vitest run tools/oolite-ingest/convert/npc-ships.test.ts tests/content/ships-npc.test.ts` | extend | ⬜ pending |
| 14-04-01 | 04 | 1 | AI-11 | T-14-07, T-14-08 | `vm` runs only the fixed pinned files, with a timeout | spike (`skipIf` without `OOLITE_SRC`) | `docker compose run --rm -v /tmp/oolite-7437f22:/oolite:ro -e OOLITE_SRC=/oolite test npx vitest run tools/ai-harness` | ❌ W0 | ⬜ pending |
| 14-04-02 | 04 | 1 | AI-11 | T-14-09 | no harness import or sentinel in `src/`, `public/` | spike + guard | `docker compose run --rm -v /tmp/oolite-7437f22:/oolite:ro -e OOLITE_SRC=/oolite test npx vitest run tools/ai-harness tests/guards/harness-isolation.test.ts` | ❌ W0 | ⬜ pending |
| 14-04-03 | 04 | 1 | AI-11 | — | N/A | spike report | `test -s .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-SPIKE.md` | ❌ W0 | ⬜ pending |
| 14-05-01 | 05 | 1 | AI-01 | T-14-20 | `BodyView.radius` from entity, layout or player argument, as a copy | typecheck + unit | `docker compose run --rm typecheck` and `docker compose run --rm test npx vitest run tests/sim/world/view.test.ts tests/sim/ai/test-pilot.test.ts` | extend | ⬜ pending |
| 14-05-02 | 05 | 1 | AI-01 | T-14-20 | writing a returned radius changes nothing | unit (radius per body kind, copy case) | `docker compose run --rm test npx vitest run tests/sim/world/view.test.ts` | extend | ⬜ pending |
| 14-06-01 | 06 | 2 | AI-01 | T-14-01, T-14-41 | `crossDtTolerance` written before any rate fixture is replayed | oracle self-test (frame-rate rule ledger, 1/60 versus 1/120 grid) | `docker compose run --rm test npx vitest run tests/oracles/npc tests/guards/oracle-independence.test.ts` | ❌ W0 | ⬜ pending |
| 14-06-02 | 06 | 2 | AI-01 | T-14-01, T-14-02 | oracle tree imports nothing from `src/` | oracle self-test (avoid, proximity, escort) | `docker compose run --rm test npx vitest run tests/oracles/npc tests/guards/oracle-independence.test.ts`, then `docker compose run --rm lint` and `docker compose run --rm typecheck` | ❌ W0 | ⬜ pending |
| 14-07-01 | 07 | 2 | AI-11 | T-14-10, T-14-37 | `dist` free of the harness and AILib (three markers, `*.map` skipped, non-vacuous, clean on a real bundle) | unit + real-bundle check + post-build | `docker compose run --rm test npx vitest run tools/ai-harness/dist-check.test.ts tests/contract/container-contract.test.ts`, then `docker compose run --rm test sh -lc "npx vite build --config vite.e2e.config.ts --outDir /tmp/dist-check --emptyOutDir && npx tsx tools/ai-harness/dist-check.ts /tmp/dist-check"`, then `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm verify` | ❌ W0 | ⬜ pending |
| 14-07-02 | 07 | 2 | AI-01 | T-14-11, T-14-42, T-14-43 | thresholds, sampling and window definitions, start placement with the designed near pass, run minimums (avoidance entries and the re-derived attack floor among them), parking rule, three hull-crossing classes with the episode rule, the frozen-set definition, the pre-declared escalation and the empty accepted-crossings list committed before the run | static | `docker compose run --rm typecheck` and `docker compose run --rm lint` | ❌ W0 | ⬜ pending |
| 14-08-01 | 08 | 3 | AI-01 | — | owner decides the hash policy | checkpoint (blocking-human) | — | n/a | ⬜ pending |
| 14-08-02 | 08 | 3 | AI-01 | T-14-13, T-14-45 | NaN steering state repaired before every hash; signed, strictly decreasing tracking ticks (count 0 or 4); green intermediate commit | unit + typecheck | `docker compose run --rm test npx vitest run tests/sim/world/sanitize.test.ts tests/sim/world/store.test.ts tests/sim/world/hash.test.ts tests/sim/world/flight-hash-pins.test.ts tests/sim/world/populate.test.ts tests/sim/world/snapshot-codec.test.ts tests/sim/world/snapshot.test.ts` and `docker compose run --rm typecheck` | extend | ⬜ pending |
| 14-08-03 | 08 | 3 | AI-01 | T-14-12 | strict snapshot v3 parse; Key Decisions row written | unit + record | `docker compose run --rm test npx vitest run tests/sim/world/snapshot-codec.test.ts tests/sim/world/snapshot.test.ts tests/sim/world/sanitize.test.ts` and `rg -c 'Phase 14 plan 14-08' .planning/PROJECT.md` | extend | ⬜ pending |
| 14-09-01 | 09 | 4 | AI-01 | T-14-14 | N/A | oracle (flight model) + physical turn direction | `docker compose run --rm test npx vitest run tests/sim/npc/flight.oracle.test.ts` | ❌ W0 | ⬜ pending |
| 14-09-02 | 09 | 4 | AI-01 | T-14-15 | perform membership check before entry effects | oracle + unit | `docker compose run --rm test npx vitest run tests/sim/npc/flight.oracle.test.ts tests/sim/world/control.test.ts tests/sim/ai/test-pilot.test.ts` | extend | ⬜ pending |
| 14-09-03 | 09 | 4 | AI-01 | T-14-14 | steering total (no throw, finite, unit quaternion) | property + table + coverage floors | `docker compose run --rm test npx vitest run tests/sim/npc`, then `docker compose run --rm test` | ❌ W0 | ⬜ pending |
| 14-10-01 | 10 | 5 | AI-01 | T-14-17 | events queued, never synchronous | oracle (fly to destination) | `docker compose run --rm test npx vitest run tests/sim/npc/navigation.oracle.test.ts tests/sim/npc/flight.oracle.test.ts` | ❌ W0 | ⬜ pending |
| 14-10-02 | 10 | 5 | AI-01 | — | N/A | oracle (face) | `docker compose run --rm test npx vitest run tests/sim/npc/navigation.oracle.test.ts` | ❌ W0 | ⬜ pending |
| 14-10-03 | 10 | 5 | AI-01 | T-14-16 | no NaN from degenerate geometry | oracle (rate rule, static manifest) + property + coverage floors | `docker compose run --rm test npx vitest run tests/sim/npc`, then `docker compose run --rm test` | ❌ W0 | ⬜ pending |
| 14-11-01 | 11 | 6 | AI-01, WORLD-07 | T-14-18, T-14-19 | per-entity combat stream; flight table only through `StepOptions` | scenario | `docker compose run --rm test npx vitest run tests/sim/npc/step-integration.test.ts tests/sim/world/flight-hash-pins.test.ts` | ❌ W0 | ⬜ pending |
| 14-11-02 | 11 | 6 | AI-01 | — | N/A | re-pin | `docker compose run --rm test npx vitest run tests/sim` | extend | ⬜ pending |
| 14-11-03 | 11 | 6 | AI-01 | — | N/A | full suite | `docker compose run --rm test` | extend | ⬜ pending |
| 14-12-01 | 12 | 7 | AI-01 | T-14-21 | stale target ids take the lost-target path | oracle (intercept, target loss) + unit | `docker compose run --rm test npx vitest run tests/sim/npc/pursuit.oracle.test.ts tests/sim/world/view.test.ts tests/sim/world/step.test.ts` and `docker compose run --rm typecheck` | ❌ W0 | ⬜ pending |
| 14-12-02 | 12 | 7 | AI-01 | T-14-38, T-14-46 | tracking curve started by `setTarget`, signed ticks, no NaN or repair; a self target changes nothing | oracle (tracking curve, 60-tick gate) + unit + property | `docker compose run --rm test npx vitest run tests/sim/npc tests/sim/world`, `docker compose run --rm lint` and `docker compose run --rm typecheck` | ❌ W0 | ⬜ pending |
| 14-13-01 | 13 | 8 | AI-01 | T-14-21 | avoid entry and exit with the radius and the curve; an unknown alert counts as none; steering total | unit (avoid) + oracle + property | `docker compose run --rm test npx vitest run tests/sim/npc tests/sim/world` and `docker compose run --rm typecheck` | ❌ W0 | ⬜ pending |
| 14-13-02 | 13 | 8 | AI-01 | T-14-22 | draws only from the actor's stream | oracle (flee) | `docker compose run --rm test npx vitest run tests/sim/npc/pursuit.oracle.test.ts` | ❌ W0 | ⬜ pending |
| 14-13-03 | 13 | 8 | AI-01 | — | N/A | oracle (evasive) + property | `docker compose run --rm test npx vitest run tests/sim/npc tests/sim/world` | ❌ W0 | ⬜ pending |
| 14-14-01 | 14 | 9 | AI-01 | — | N/A | oracle (attack dispatch, fly-to, fly-from) | `docker compose run --rm test npx vitest run tests/sim/npc/attack.oracle.test.ts` | ❌ W0 | ⬜ pending |
| 14-14-02 | 14 | 9 | AI-01 | — | N/A | oracle (six, twelve, sniper, break-off, slow dogfight) | `docker compose run --rm test npx vitest run tests/sim/npc/attack.oracle.test.ts` | ❌ W0 | ⬜ pending |
| 14-14-03 | 14 | 9 | AI-01 | T-14-23, T-14-24 | steering never fires; forced accuracy bounded | table + property + coverage floors | `docker compose run --rm test` | ❌ W0 | ⬜ pending |
| 14-15-01 | 15 | 10 | AI-01 | T-14-25 | proximity pass bounded by `MAX_ENTITIES`; alerts only on steered ships | oracle (avoid) + world scenario | `docker compose run --rm test npx vitest run tests/sim/npc/avoid-escort.oracle.test.ts tests/sim/npc/proximity.test.ts tests/sim/npc/avoid.test.ts` | ❌ W0 | ⬜ pending |
| 14-15-02 | 15 | 10 | AI-01 | T-14-26, T-14-39 | stale leader id takes the no-leader path; the refresh writes only followers | oracle (escort) + world escort refresh | `docker compose run --rm test npx vitest run tests/sim/npc/avoid-escort.oracle.test.ts tests/sim/npc/escort-refresh.test.ts` | ❌ W0 | ⬜ pending |
| 14-15-03 | 15 | 10 | AI-01 | — | N/A | oracle coverage (static manifest) + property | `docker compose run --rm test npx vitest run tests/sim tests/app` | ❌ W0 | ⬜ pending |
| 14-16-01 | 16 | 11 | WORLD-07, AI-01 | T-14-28, T-14-40 | flight-script pilot test-only; spawner validates before spawning | scenario (station, intercept, flee) | `docker compose run --rm test npx vitest run tests/sim/npc/flyers.scenario.test.ts` | ❌ W0 | ⬜ pending |
| 14-16-02 | 16 | 11 | WORLD-07 | T-14-27 | params stay in the `ParamValue` domain | unit | `docker compose run --rm test npx vitest run tests/sim/ai` | ❌ W0 | ⬜ pending |
| 14-16-03 | 16 | 11 | WORLD-07 | — | N/A | cadence (30/60/144 Hz) | `docker compose run --rm test npx vitest run tests/sim/npc/npc-cadence.test.ts tests/sim/world/world-cadence.test.ts` | ❌ W0 | ⬜ pending |
| 14-17-01 | 17 | 12 | AI-01 | T-14-31, T-14-32, T-14-42 | seed set-up, detectors and run registration frozen in one commit after a run of epoch 1 only; hull crossings classified `own-target`, `other-alert-ignored` or `other` and grouped into episodes; the no-AI control misses the floors that catch a run where nothing flies; the acceptance file is byte for byte its ten pinned lines | detector non-vacuity + byte-for-byte exact-content gate with its `/tmp` scratch proof + one seed end to end (a red epoch 1 is recorded and carried to Task 2; the pass requirement is Task 4's) | `docker compose run --rm test npx vitest run tests/acceptance`, the exact-content gate (`printf '%s\n'` of the ten pinned lines into `cmp -s -`) passing on `npc-flight.acceptance.ts` and failing on five scratch copies under `/tmp` (sliced list, swapped import, extra line, code after a block comment on a `*`-prefixed line, code after a one-line block comment), and `docker compose run --rm test sh -lc 'npm run test:acceptance -- -t "^epoch 1\$"; echo "acceptance-exit=$?"'` | ❌ W0 | ⬜ pending |
| 14-17-02 | 17 | 12 | AI-01 | T-14-31, T-14-44 | thresholds have one commit and no harness file of the frozen set has a commit without the trailer since the harness commit; every breach recorded for the checkpoint | 20-seed run (all cases executed) | the execution-time freeze check (`git rev-list --count` over the frozen set) and the byte-for-byte exact-content gate (`cmp` against plan 14-17's ten pinned lines; no regex filter, since any filter of comment-shaped lines admits code after a comment closes), `docker compose run --rm test sh -lc 'npm run test:acceptance; echo "acceptance-exit=$?"'` and `docker compose run --rm test` | ❌ W0 | ⬜ pending |
| 14-17-03 | 17 | 12 | AI-01 | T-14-43 | only the owner resolves a breach, with the options pre-declared in `thresholds.ts` (a crossing episode of any class: accept, port defect or harness defect; every other breach: port or harness defect) | checkpoint (blocking-human) | — | n/a | ⬜ pending |
| 14-17-04 | 17 | 12 | AI-01 | T-14-31, T-14-43, T-14-44 | final run green with the committed accepted-crossings list applied; each entry one episode the owner accepted in the recorded answer, any class | 20-seed acceptance (recorded run) | the execution-time freeze check and exact-content gate, `docker compose run --rm test npm run test:acceptance`, `docker compose run --rm test`, `lint`, `typecheck` | ❌ W0 | ⬜ pending |
| 14-18-01 | 18 | 13 | WORLD-07 | — | N/A | unit + parity | `docker compose run --rm test npx vitest run tests/app/session/traffic.test.ts tests/app/session/sim-driver.test.ts tests/app/session/tick-parity.test.ts tests/app/session/traffic-variants.test.ts tests/app/session/probe-publisher.test.ts` and `docker compose run --rm typecheck` | extend | ⬜ pending |
| 14-18-02 | 18 | 13 | WORLD-07 | T-14-29, T-14-30 | hook taints before mutating, also on a refused spawn; no id in the probe | unit | `docker compose run --rm test npx vitest run tests/app/session/probe-publisher.test.ts tests/app/probe-shape-compare.test.ts tests/app/session/tick-parity.test.ts` | extend | ⬜ pending |
| 14-18-03 | 18 | 13 | WORLD-07 | — | N/A | opt-in e2e smoke (remote) | `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/npc-flight.spec.ts tests/e2e/combat.spec.ts tests/e2e/traffic.spec.ts"` | ❌ W0 | ⬜ pending |
| 14-19-01 | 19 | 14 | AI-01, WORLD-07, AI-11 | T-14-33 | N/A | contract (both modes, tree re-created) | `docker compose run --rm test npx vitest run tests/contract/fidelity.test.ts`, then the mounted run after re-creating `/tmp/oolite-7437f22` | extend | ⬜ pending |
| 14-19-02 | 19 | 14 | AI-11, AI-01, WORLD-07 | T-14-35 | the frozen set untouched since plan 14-17 | full gates + freeze check + conditional acceptance rerun + the phase's single remote verify | `docker compose run --rm test`, plan 14-17's freeze check and exact-content gate at HEAD, the conditional `npm run test:acceptance` (run only when the simulation or acceptance code changed since plan 14-17's summary commit) and `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm verify` | extend | ⬜ pending |
| 14-19-03 | 19 | 14 | AI-11 | T-14-34 | only the owner chooses the oracle | checkpoint (blocking-human) | — | n/a | ⬜ pending |
| 14-19-04 | 19 | 14 | AI-11, AI-01, WORLD-07 | — | N/A | record + requirement status | `rg 'Phase 14 oracle choice for the AI port' .planning/PROJECT.md \| rg -c '14-FIDELITY-REPORT'` | extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/oracles/npc/` fixtures, reference maths, the frame-rate rule and oracle tests (plans 14-01, 14-02 and 14-06; separate agents, no `src/` imports, all before the first `src/sim/npc` plan 14-08)
- [ ] `tests/guards/oracle-independence.test.ts`, `tests/guards/harness-isolation.test.ts`
- [ ] `tests/acceptance/thresholds.ts` (with the start placement, the designed near pass and the run minimums) and the empty `tests/acceptance/accepted-crossings.ts`, outside the frozen set, committed before the port (plan 14-07); `tests/acceptance/detectors.ts` with the seed set-up and the run registration, `detectors.test.ts` and `npc-flight.acceptance.ts` committed in one commit after a run of epoch 1 only (plan 14-17); the 20-seed run is `npm run test:acceptance`, outside the default suite
- [ ] `tools/ai-harness/{load,host,dist-check}.ts` with tests; `check:dist` step in the `verify` and `verify-full` chains and the Pages build
- [ ] `tests/sim/npc/oracle-groups.ts` (static oracle manifest) with `oracle-runner.ts` (plan 14-09)
- [ ] `tests/e2e/npc-flight.spec.ts` (opt-in smoke), probe-shape hook row

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Owner accepts the fidelity report and picks the oracle (differential harness or source-cited traces); optionally watches the flyers in a `?test=1&traffic=1` session | AI-11 | Owner decision gate | Review the report; record the choice as a Key Decision (plan 14-19, checkpoint and Task 4) |
| Owner picks the world-hash policy for the steering record (append and regenerate once, or omit when pristine) | AI-01 | One-way decision gate | Answer the checkpoint of plan 14-08 before the seam is built; plan 14-08 records it in PROJECT.md (Task 2) |
| Owner reviews the 20-seed result and resolves any breach of an oracle-clean port | AI-01 | Threshold decisions belong to the owner | Plan 14-17, Task 3 (`checkpoint:decision`, blocking-human): the result per seed, the run minimums and each breach with its class and Oolite lines, offered exactly the options plan 14-07 pre-declared in `thresholds.ts` ((a) accept crossing episodes of any class into `accepted-crossings.ts`, (b) port defect, (c) harness defect; a non-crossing breach has (b) and (c)); Task 4 applies and records the answer |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
