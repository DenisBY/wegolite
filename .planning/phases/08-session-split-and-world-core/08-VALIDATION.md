---
phase: "08"
slug: "session-split-and-world-core"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-11"
---

# Phase 08 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5 (unit/integration, Node env) and Playwright 1.64.1 (Chromium) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `docker compose run --rm test npx vitest run <file>` |
| **Full suite command** | `docker compose run --rm verify` (per commit/wave); `docker compose run --rm verify-full` (phase gate and split steps 3, 6, 9) |
| **Estimated runtime** | targeted Vitest ~30 s; `verify` several minutes (baseline recorded in Wave 0, D-01) |

---

## Sampling Rate

- **After every task commit:** Run the targeted `docker compose run --rm test npx vitest run <file>` for the files touched; session-split steps run `docker compose run --rm verify` (D-12).
- **After every plan wave:** Run `docker compose run --rm verify`; `verify-full` at split steps 3, 6, 9 and after the integration plan.
- **Gate attribution (waves 1-6, two plans share one working tree):** a gate recorded as a plan's evidence runs in the main tree only when `git status --porcelain --untracked-files=all` lists nothing but that plan's own files (or `.planning/`) and no other `wegolite` Compose container is running; otherwise, and always for the split-step verify-full at steps 3, 6 and 9, it runs in a detached git worktree of the plan's commit under its own Compose project name (`-p wegolite-gate-...`), never with `--build`, and the SUMMARY records the commit and tree SHA.
- **Before `/gsd-verify-work`:** `docker compose run --rm verify-full` green and `git diff --exit-code -- tests/golden` clean.
- **Max feedback latency:** targeted run under ~60 s; each new browser spec under ~60 s with `workers: 2`.

---

## Per-Task Verification Map

Task IDs reference the plans of this phase (`08-NN-Tn` = plan 08-NN, task n). Requirement → test map:

| Task ID | Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|---------|-------------|----------|-----------|-------------------|-------------|--------|
| 08-01-T1 (created); every split step and plans 08-14, 08-15 via `verify`; 08-16-T1 (the one deliberate D-13 update) | FOUND-10 | Probe shape unchanged across the split (SC1); one additive post-split commit | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/probe-shape.spec.ts"` | ❌ W0 (08-01) | ⬜ pending |
| 08-01-T1 | FOUND-10 | Shape comparator catches added, removed and renamed keys | unit | `docker compose run --rm test npx vitest run tests/app/probe-shape-compare.test.ts` | ❌ W0 (08-01) | ⬜ pending |
| 08-01-T2 | FOUND-10 | Redraw-gate and economy-purity scans hold across session sources; helper vacuity guard | unit | `docker compose run --rm test npx vitest run tests/app/redraw-gate.test.ts tests/guards/economy-purity.test.ts tests/app/session-source.test.ts` | ✅ (re-point W0) | ⬜ pending |
| 08-04..08-16 (acceptance) | FOUND-10 | No pre-existing golden changed | process | `git diff --quiet 5b189e4 -- tests/golden/content tests/golden/hyperspace tests/golden/market tests/golden/save tests/golden/kinematic-probe.json` | n/a | ⬜ pending |
| 08-01-T2 (baseline on a 5b189e4 worktree, `docker compose -p wegolite-baseline run --rm verify-full`), 08-06-T1 (step 3), 08-08-T2 (step 6), 08-12-T1 (step 9), 08-15-T3, 08-16-T2 | FOUND-10 | Release gate green at the D-12 checkpoints, after the integration and at the phase end; each split-step gate is attributable to its own committed tree | gate | Split steps 3, 6, 9: from a detached worktree of the step commit, `docker compose -p wegolite-gate-08-06-step3 run --rm verify-full` (likewise `wegolite-gate-08-08-step6`, `wegolite-gate-08-12-step9`), commit and tree SHA in the SUMMARY, worktree and volume removed afterwards; 08-15-T3 and 08-16-T2 run alone in their waves: `docker compose run --rm verify-full` | ✅ | ⬜ pending |
| 08-10-T2 (router), 08-12-T2 (frame), 08-14-T2 (manual frame), 08-15-T1 (lifecycle subscriber) | FOUND-10 | Frame phase order and event-router subscriber order pinned | unit | `docker compose run --rm test npx vitest run tests/app/session-order.test.ts` | ❌ (08-10) | ⬜ pending |
| 08-04-T2, 08-06-T1, 08-06-T2, 08-08-T1, 08-08-T2, 08-10-T1, 08-10-T2, 08-12-T2 | FOUND-10 | Per-controller fake-context unit tests | unit | `docker compose run --rm test npx vitest run tests/app/session` | ❌ per split step | ⬜ pending |
| 08-05-T2, 08-15-T2 | FOUND-11 | Ids monotonic and never reused within a world; every new world (createWorld, and each lifecycle begin or resume) restarts dynamic ids at 101 (per-world id scope, CONTEXT D-06 as amended 2026-11-12, 08-05 Key Decisions row (d)); ascending iteration; cap | unit + property | `docker compose run --rm test npx vitest run tests/sim/world/store.test.ts tests/app/session/world-lifecycle.test.ts` | ❌ (08-05, 08-15) | ⬜ pending |
| 08-05-T1, 08-05-T2, 08-07-T1, 08-07-T2 | FOUND-11 | Fixed id table; both buoys and the other statics stored as fixed-id entities referencing SystemLayout (D-07) and never hashed (D-08); static and player views | unit | `docker compose run --rm test npx vitest run tests/sim/world/hash.test.ts tests/sim/world/view.test.ts` | ❌ (08-05, 08-07) | ⬜ pending |
| 08-02-T1 (pins), 08-05-T1, 08-11-T1, 08-15-T1 | FOUND-11 | `hashWorld === hashFlight` on recorded flights and in stepping; pinned pre-phase values | unit/golden | `docker compose run --rm test npx vitest run tests/sim/world/flight-hash-pins.test.ts tests/sim/world/hash.test.ts tests/sim/world/step.test.ts` | ❌ W0 (08-02) | ⬜ pending |
| 08-11-T1 | FOUND-11 | Every pass visits entities in id order; this tick's spawns wait a tick | unit | `docker compose run --rm test npx vitest run tests/sim/world/step.test.ts` | ❌ (08-11) | ⬜ pending |
| 08-02-T1, 08-02-T3, 08-05-T2, 08-11-T2 | FOUND-12 | RNG vectors unchanged; D-02 mix32 world-seed and fork vectors; fork isolation; serialisable state | unit | `docker compose run --rm test npx vitest run tests/sim/rng.test.ts tests/sim/world/store.test.ts` | ❌ W0 (08-02) | ⬜ pending |
| 08-02-T3 | FOUND-12 | Arrival goldens unchanged | unit | `docker compose run --rm test npx vitest run tests/sim/hyperspace-arrival.test.ts tests/persistence/autosave.test.ts` | ✅ | ⬜ pending |
| 08-13-T1, 08-13-T2 | FOUND-12 | Live vs restored world hash equal over 1,000 ticks; strict snapshot parser | unit | `docker compose run --rm test npx vitest run tests/sim/world/snapshot.test.ts tests/sim/world/snapshot-codec.test.ts` | ❌ (08-13) | ⬜ pending |
| 08-03-T1, 08-03-T2 | FOUND-12 | Lint rejects `Math.random`, `Date`, wall clock, timers, `for..in`, bare `.sort()` | guard | `docker compose run --rm test npx vitest run tests/guards/sim-determinism-bans.test.ts` | ❌ W0 (08-03) | ⬜ pending |
| 08-13-T3 | FOUND-12 | Same world hash at 30/60/144 Hz with a launch and an arrival | unit | `docker compose run --rm test npx vitest run tests/sim/world/world-cadence.test.ts` | ❌ (08-13) | ⬜ pending |
| 08-09-T1, 08-09-T2 | FOUND-13 | Test pilot via `WorldView`/`ShipControl`; JSON round trip; integer timers | unit | `docker compose run --rm test npx vitest run tests/sim/ai/test-pilot.test.ts tests/sim/ai/time.test.ts` | ❌ (08-09) | ⬜ pending |
| 08-07-T1, 08-07-T2 | FOUND-13 | WorldView read-only copies, scan order and bounds; actor-only ShipControl | unit | `docker compose run --rm test npx vitest run tests/sim/world/view.test.ts tests/sim/world/control.test.ts` | ❌ (08-07) | ⬜ pending |
| 08-09-T3 | FOUND-13 | AI zone rejects simulation-internal imports; sim bans still apply | guard | `docker compose run --rm test npx vitest run tests/guards/ai-zone.test.ts` | ❌ (08-09) | ⬜ pending |
| 08-11-T2 | FOUND-13 | Cross-entity AI events queued FIFO with an 8-pass cap | unit | `docker compose run --rm test npx vitest run tests/sim/world/step.test.ts` | ❌ (08-11) | ⬜ pending |
| 08-14-T2 | FOUND-14 | `parseTestFlags` exact and inert without `test=1` | unit | `docker compose run --rm test npx vitest run tests/app/session/test-flags.test.ts` | ❌ (08-14) | ⬜ pending |
| 08-15-T2 | FOUND-14 | Traffic parity of epoch and ids (D-05); Continue resumes without a bump | unit | `docker compose run --rm test npx vitest run tests/app/session/world-lifecycle.test.ts` | ❌ (08-15) | ⬜ pending |
| 08-15-T3 | FOUND-11 | Arrival bump before autosave; failed arrival unchanged; no world state in SaveInputs or the encoded save (anchored-save decision, pitfall 10) | unit | `docker compose run --rm test npx vitest run tests/app/session/world-lifecycle.test.ts` | ❌ (08-15) | ⬜ pending |
| 08-14-T1, 08-14-T2 | FOUND-14 | `advanceTicks` contract (bounds, first-step commands, taint, overlay and pause refusal, manual frame never steps) | unit | `docker compose run --rm test npx vitest run tests/app/session/sim-driver.test.ts tests/app/session-order.test.ts` | ❌ (08-14) | ⬜ pending |
| 08-16-T2 | FOUND-14 | Vitest sim-driver run of N ticks equals the Node replay hash | unit | `docker compose run --rm test npx vitest run tests/app/session/tick-parity.test.ts` | ❌ (08-16) | ⬜ pending |
| 08-16-T1, 08-16-T2 | FOUND-14 | Browser `advanceTicks(N)` hash equals the Node replay; manual clock never self-steps; traffic off by default, opt-in with `&traffic=1` | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/tick-hook.spec.ts"` | ❌ (08-16) | ⬜ pending |
| 08-11-T3 | FOUND-11 | Reserved SimEvent payloads use the ARCHITECTURE §7.6 field names (one recorded deviation, `laserKind`, Key Decisions row g); object literals of all 15 reserved kinds typecheck against SimEvent | unit + typecheck | `docker compose run --rm test npx vitest run tests/sim/world/step.test.ts` and `docker compose run --rm typecheck` | ❌ (08-11) | ⬜ pending |
| 08-11-T3 | FOUND-12 | PITFALLS 4: no direct Math transcendental in the new world-core modules; within-one-engine claim recorded (row f) | process | `rg -n "Math\.(sin\|cos\|tan\|asin\|acos\|atan\|atan2\|exp\|log\|pow\|cbrt\|hypot)\(" src/sim/world src/sim/ai src/sim/sim.ts src/sim/rng.ts` prints nothing | n/a | ⬜ pending |
| 08-01-T1 (review round 1) | FOUND-10 | Recorded probe shape is stable across repeated runs (optional-key audit) | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/probe-shape.spec.ts --repeat-each=3"` | ❌ W0 (08-01) | ⬜ pending |
| 08-02-T3 (review round 1) | FOUND-12 | Only serialisable streams in src/sim (durable createSeededRandom source scan) | unit | `docker compose run --rm test npx vitest run tests/sim/rng.test.ts` | ❌ W0 (08-02) | ⬜ pending |
| 08-05-T1 (review round 1) | FOUND-11 | Closed vocabularies equal the Oolite tables (reference checkout mounted read-only) | unit | `docker compose run --rm -v /home/opencode/git/oolite:/oolite:ro -e OOLITE_SRC=/oolite test npx vitest run tests/sim/world/hash.test.ts` | ❌ (08-05) | ⬜ pending |
| 08-06-T2 (review round 1) | FOUND-10 | Chart, settings and context-loss flows after split step 4 | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/chart-gestures.spec.ts tests/e2e/settings.spec.ts tests/e2e/context-loss.spec.ts"` | ✅ | ⬜ pending |
| 08-08-T1 (review round 1) | FOUND-10 | Station trade, fitting and tabs after split step 5 | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/station.spec.ts tests/e2e/station-tabs.spec.ts"` | ✅ | ⬜ pending |
| 08-08-T2 (review round 1) | FOUND-10 | loadFromSave keeps its recorded order (characterization through injected doubles) | unit | `docker compose run --rm test npx vitest run tests/app/session/save-controller.test.ts` | ❌ (08-08) | ⬜ pending |
| 08-15-T3 (review round 1) | FOUND-11 | NPC-free world step cost bounded (median at most 1.2 times stepFlight plus 2 µs per tick) | perf (scratch, evidence in SUMMARY) | `docker compose run --rm -v /tmp/wegolite-perf:/scratch test npx tsx /scratch/step-cost.ts` | n/a (scratch under /tmp) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Local `verify-full` baseline run with duration recorded (D-01), on a detached worktree of 5b189e4 so the concurrent wave-1 plans cannot touch it — 08-01-T2
- [ ] `tests/e2e/probe-shape.spec.ts` plus `tests/fixtures/probe-shape.json`, added to `test:e2e:fast` — 08-01-T1
- [ ] `tests/helpers/session-source.ts`; `redraw-gate.test.ts` and `economy-purity.test.ts` re-pointed and order-independent — 08-01-T2
- [ ] Recorded pre-phase `hashFlight` pins (`tests/golden/world/flight-hash-pins.json`) and current RNG vectors, captured before any `math.ts` edit — 08-02-T1
- [ ] Determinism lint bans and their guard — 08-03
- [ ] `tests/sim/world/*` (08-05, 08-07, 08-11, 08-13), `tests/sim/ai/*` (08-09), `tests/sim/rng.test.ts` (08-02), `tests/guards/ai-zone.test.ts` (08-09), `tests/app/session/test-flags.test.ts` (08-14), `tests/app/session/world-lifecycle.test.ts` (08-15), `tests/helpers/tick-script.ts` and `tests/e2e/tick-hook.spec.ts` (08-16)
- [ ] Framework install: none (all tools present)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Game plays exactly as before | FOUND-10 | Feel/regression sanity beyond the automated core-loop suite | `docker compose up preview`; start, launch, fly, dock, trade, hyperspace, save and reload |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s for targeted runs
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
