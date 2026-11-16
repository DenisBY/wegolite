---
phase: "15"
slug: damage-ledger-and-kills
status: complete
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-16"
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. The full design is in `15-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5, fast-check 4.10.2 |
| **Config file** | `vitest.config.ts`, `vitest.acceptance.config.ts` |
| **Quick run command** | `docker compose run --rm test npx vitest run <file>` |
| **Full suite command** | `docker compose run --rm test` (plus `lint`, `typecheck`; `assets:check` for the content plan) |
| **Estimated runtime** | minutes (slow machine; see gate policy) |

---

## Sampling Rate

- **After every task commit:** the targeted `npx vitest run <file>`
- **After every plan wave:** `docker compose run --rm test`, `lint`, `typecheck` (and `assets:check` for the content plan)
- **Before `/gsd-verify-work`:** full suite green; remote `verify` after plan 15-03 (it edits `src/app/session/traffic.ts`) and after plan 15-04 (kills now happen in the live loop); the remote browser kill step of `tests/e2e/combat.spec.ts` after plan 15-04; by-hand 20-seed acceptance run (21 of 21) after plans 15-02 (covering 15-01), 15-03, 15-04 and 15-05
- **Max feedback latency:** per-file vitest run

---

## Per-Task Verification Map

Filled by the planner from the requirement map in `15-RESEARCH.md` (FOUND-18, FOUND-19, DATA-14, QUAL-11) and the six plans. Every command runs in the container; `<files>` below abbreviates `docker compose run --rm test npx vitest run`.

| Task | Wave | Requirement | Behaviour | Test Type | Automated Command | File Exists | Status |
|------|------|-------------|-----------|-----------|-------------------|-------------|--------|
| 15-01 T1 | 1 | DATA-14 | `likelyCargo`, `maxCargo` compiled, golden, drift gate | unit, drift | `<files> tools/oolite-ingest/convert/npc-ships.test.ts tests/content/ships-npc.test.ts tests/content/ships-hulls.test.ts`; `docker compose run --rm assets npm run assets:check` | amend | ✅ |
| 15-01 T2 | 1 | DATA-14 | facings behind the mask, `fragmentChance`, `explosionType` (null), NOTICE | unit, drift | as T1, then `docker compose run --rm test`, `lint`, `typecheck` | amend | ✅ |
| 15-02 T1 | 2 | FOUND-18 | velocity, weapon, cargo: pristine-omit segments, v4 round trip, v3/v5 refused, Lave golden unchanged | unit | `<files> tests/sim/world/hash.test.ts tests/sim/world/snapshot-codec.test.ts tests/sim/world/snapshot.test.ts tests/sim/world/populate.test.ts` | amend | ✅ |
| 15-02 T2 | 2 | FOUND-18 | spawn cargo domain, sanitiser, sanitiser-parser agreement | unit, property | `<files> tests/sim/world/sanitize.test.ts tests/sim/world/spawn-refusal.test.ts tests/sim/world/snapshot-codec.test.ts tests/sim/world/populate.test.ts` | amend | ✅ |
| 15-02 T3 | 2 | FOUND-18 | `staticHealth`, `staticHealth:` line, root key, repair, `-0` snapshot | unit, property | `<files> tests/sim/world/hash.test.ts tests/sim/world/snapshot-codec.test.ts tests/sim/world/sanitize.test.ts tests/sim/world/snapshot.test.ts tests/sim/world/populate.test.ts tests/sim/world/world-cadence.test.ts`, then full suite, `lint`, `typecheck` | amend | ✅ |
| 15-03 T1 | 3 | FOUND-18 | cargo at spawn by role, stateless stream, session mapping | unit, property | `<files> tests/sim/rng.test.ts tests/sim/world/populate.test.ts tests/app/session/traffic.test.ts tests/app/session/traffic-variants.test.ts` | amend | ✅ |
| 15-03 T2 | 3 | FOUND-18 | one golden regeneration; strip to `c1068643`, `ab72eedf`, `b23d11d8` | unit (golden) | `<files> tests/sim/world/populate.test.ts tests/ui/hud-model.test.ts`, then full suite, `lint`, `typecheck` | amend | ✅ |
| 15-04 T1 | 4 | FOUND-19, QUAL-11 | ledger, `killShip` (D-04 killer normalisation, mutual-kill credit by id), second commit, N2 flipped, ident lost, contacts; cadence fight pins the Adder's kill in the same commit; straggler hits classified | unit, cadence | `<files> tests/sim/combat/ledger.test.ts tests/sim/world/kill.test.ts tests/sim/combat/step.test.ts tests/sim/combat/ident.test.ts tests/sim/combat/npc-fire.test.ts tests/sim/world/world-cadence.test.ts` | new + amend | ✅ |
| 15-04 T2 | 4 | FOUND-19 | Vitest twin of the browser kill step (fire held from the spawn; kill tick, no `laserRefused` before the kill, bank floor 16); browser kill step (remote); stale comments; closing straggler sweep | integration, browser (remote) | `<files> tests/app/session/tick-parity.test.ts tests/sim/world/world-cadence.test.ts tests/sim/world/step.test.ts`, then full suite, `lint`, `typecheck` | amend | ✅ |
| 15-05 T1 | 5 | FOUND-19 | D-04 notifications, `drainAiEventsNow`, fire-queue guard, closed sets unchanged (OD-2 pending) | unit | `<files> tests/sim/world/kill.test.ts tests/sim/world/step.test.ts tests/sim/combat/ledger.test.ts tests/sim/combat/step.test.ts tests/sim/combat/ident.test.ts tests/app/session-order.test.ts` | amend | ✅ |
| 15-05 T2 | 5 | FOUND-19 | post-drain repair, dangling references over 120 ticks, import guard | unit, integration | `<files> tests/sim/world/kill.test.ts tests/sim/world/step.test.ts tests/sim/combat/step.test.ts`, then full suite, `lint`, `typecheck` | amend | ✅ |
| 15-06 T1 | 6 | FOUND-19 | kill on the spawn tick, mutual kill, repeated kill: snapshot round trip | unit | `<files> tests/sim/combat/kill.property.test.ts` | new | ✅ |
| 15-06 T2 | 6 | FOUND-19 | random fights with native-steered holders and non-vacuity floors (fixed seed): boundary invariants, event uniqueness, holders told, replay; totality incl. out-of-domain handler writes | property | `<files> tests/sim/combat/kill.property.test.ts` | new | ✅ |
| 15-06 T3 | 6 | FOUND-18, QUAL-11 | kills, cargo, weapon, velocity equal at 30/60/144 Hz; 1,000-tick resume across a kill | cadence, unit | `<files> tests/sim/world/world-cadence.test.ts tests/sim/world/snapshot.test.ts tests/sim/combat/kill.property.test.ts`, then full suite, `lint`, `typecheck` | amend | ✅ |

*Status: ✅ automated verify passed (every task of plans 15-01 to 15-06); the six plans ran in six sequential waves, 15-01 in wave 1 to 15-06 in wave 6.*

---

## Wave 0 Requirements

- [x] `tests/sim/combat/ledger.test.ts` (15-04 T1), `tests/sim/world/kill.test.ts` (15-04 T1, extended in 15-05 T1 and T2), `tests/sim/combat/kill.property.test.ts` (15-06 T1, T2) — new, each created by the task that introduces the code it tests, so no separate Wave 0 plan is needed
- No new framework or fixtures.

---

## Manual-Only Verifications

All four rows ran by hand on the remote machine against the committed HEAD named in the last column and are recorded in the plan's SUMMARY.

| Behavior | Requirement | Why Manual | Result | HEAD |
|----------|-------------|------------|--------|------|
| 20-seed NPC acceptance run after 15-02 (one run covering 15-01's `ships-npc.json` change and 15-02) | QUAL-11 | In no gate by decision; remote machine only | 21 of 21; aiFaulted 0, aiDropped 0, repairs 0, hashFailures 0 | `67339cd` |
| 20-seed acceptance run after 15-03 | QUAL-11 | as above | 21 of 21, same counts and `ACCEPTANCE-TOTALS` | `f6eb1bd` |
| 20-seed acceptance run after 15-04 | QUAL-11 | as above | 21 of 21, same counts and totals | `ed6b9f2` |
| 20-seed acceptance run after 15-05 | QUAL-11 | as above | 21 of 21, same counts and totals | `fa47bfb` |
| Remote `verify` after 15-03 (`src/app/session/traffic.ts`) | FOUND-18 (traffic mapping) | owner rule: verify runs only on the remote machine | exit 0, Playwright 27 passed, 145 s | `f6eb1bd` |
| Remote `verify` after 15-04 (kills happen in the live loop) | FOUND-19 | as above | exit 0, 27 passed, 144 s | `ed6b9f2` |
| Browser kill step (`tests/e2e/combat.spec.ts`) after 15-04 | FOUND-19 (criterion 1: leaves the scanner, ident ends) | browser tests run only on the remote machine; not in `verify`'s fast subset; energy budget proven first by the local Vitest twin (15-04 T2) | exit 0, 1 passed (7.2 s) | `ed6b9f2` |
| Full `test` after 15-06 (plan changes tests and planning docs only, so no acceptance run) | FOUND-18, FOUND-19, QUAL-11 | the local full run can time out in `tests/guards/tools-determinism.test.ts` under load | exit 0, 207 files, 5245 passed, 10 skipped, coverage thresholds met, 66 s | `d3a69c9` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validation strategy signed off after plan 15-06 (every task's automated verify passed, 2026-11-16). This is not an owner decision: OD-1 (golden regeneration order) and OD-2 (D-05 narrowing) stay pending owner acknowledgement.
