---
phase: "15"
slug: damage-ledger-and-kills
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| 15-01 T1 | 1 | DATA-14 | `likelyCargo`, `maxCargo` compiled, golden, drift gate | unit, drift | `<files> tools/oolite-ingest/convert/npc-ships.test.ts tests/content/ships-npc.test.ts tests/content/ships-hulls.test.ts`; `docker compose run --rm assets npm run assets:check` | amend | ⬜ |
| 15-01 T2 | 1 | DATA-14 | facings behind the mask, `fragmentChance`, `explosionType` (null), NOTICE | unit, drift | as T1, then `docker compose run --rm test`, `lint`, `typecheck` | amend | ⬜ |
| 15-02 T1 | 2 | FOUND-18 | velocity, weapon, cargo: pristine-omit segments, v4 round trip, v3/v5 refused, Lave golden unchanged | unit | `<files> tests/sim/world/hash.test.ts tests/sim/world/snapshot-codec.test.ts tests/sim/world/snapshot.test.ts tests/sim/world/populate.test.ts` | amend | ⬜ |
| 15-02 T2 | 2 | FOUND-18 | spawn cargo domain, sanitiser, sanitiser-parser agreement | unit, property | `<files> tests/sim/world/sanitize.test.ts tests/sim/world/spawn-refusal.test.ts tests/sim/world/snapshot-codec.test.ts tests/sim/world/populate.test.ts` | amend | ⬜ |
| 15-02 T3 | 2 | FOUND-18 | `staticHealth`, `staticHealth:` line, root key, repair, `-0` snapshot | unit, property | `<files> tests/sim/world/hash.test.ts tests/sim/world/snapshot-codec.test.ts tests/sim/world/sanitize.test.ts tests/sim/world/snapshot.test.ts tests/sim/world/populate.test.ts tests/sim/world/world-cadence.test.ts`, then full suite, `lint`, `typecheck` | amend | ⬜ |
| 15-03 T1 | 3 | FOUND-18 | cargo at spawn by role, stateless stream, session mapping | unit, property | `<files> tests/sim/rng.test.ts tests/sim/world/populate.test.ts tests/app/session/traffic.test.ts tests/app/session/traffic-variants.test.ts` | amend | ⬜ |
| 15-03 T2 | 3 | FOUND-18 | one golden regeneration; strip to `c1068643`, `ab72eedf`, `b23d11d8` | unit (golden) | `<files> tests/sim/world/populate.test.ts tests/ui/hud-model.test.ts`, then full suite, `lint`, `typecheck` | amend | ⬜ |
| 15-04 T1 | 4 | FOUND-19, QUAL-11 | ledger, `killShip` (D-04 killer normalisation, mutual-kill credit by id), second commit, N2 flipped, ident lost, contacts; cadence fight pins the Adder's kill in the same commit; straggler hits classified | unit, cadence | `<files> tests/sim/combat/ledger.test.ts tests/sim/world/kill.test.ts tests/sim/combat/step.test.ts tests/sim/combat/ident.test.ts tests/sim/combat/npc-fire.test.ts tests/sim/world/world-cadence.test.ts` | new + amend | ⬜ |
| 15-04 T2 | 4 | FOUND-19 | Vitest twin of the browser kill step (fire held from the spawn; kill tick, no `laserRefused` before the kill, bank floor 16); browser kill step (remote); stale comments; closing straggler sweep | integration, browser (remote) | `<files> tests/app/session/tick-parity.test.ts tests/sim/world/world-cadence.test.ts tests/sim/world/step.test.ts`, then full suite, `lint`, `typecheck` | amend | ⬜ |
| 15-05 T1 | 5 | FOUND-19 | D-04 notifications, `drainAiEventsNow`, fire-queue guard, closed sets unchanged (OD-2 pending) | unit | `<files> tests/sim/world/kill.test.ts tests/sim/world/step.test.ts tests/sim/combat/ledger.test.ts tests/sim/combat/step.test.ts tests/sim/combat/ident.test.ts tests/app/session-order.test.ts` | amend | ⬜ |
| 15-05 T2 | 5 | FOUND-19 | post-drain repair, dangling references over 120 ticks, import guard | unit, integration | `<files> tests/sim/world/kill.test.ts tests/sim/world/step.test.ts tests/sim/combat/step.test.ts`, then full suite, `lint`, `typecheck` | amend | ⬜ |
| 15-06 T1 | 6 | FOUND-19 | kill on the spawn tick, mutual kill, repeated kill: snapshot round trip | unit | `<files> tests/sim/combat/kill.property.test.ts` | new | ⬜ |
| 15-06 T2 | 6 | FOUND-19 | random fights with native-steered holders and non-vacuity floors (fixed seed): boundary invariants, event uniqueness, holders told, replay; totality incl. out-of-domain handler writes | property | `<files> tests/sim/combat/kill.property.test.ts` | new | ⬜ |
| 15-06 T3 | 6 | FOUND-18, QUAL-11 | kills, cargo, weapon, velocity equal at 30/60/144 Hz; 1,000-tick resume across a kill | cadence, unit | `<files> tests/sim/world/world-cadence.test.ts tests/sim/world/snapshot.test.ts tests/sim/combat/kill.property.test.ts`, then full suite, `lint`, `typecheck` | amend | ⬜ |

*Status: ⬜ pending*

---

## Wave 0 Requirements

- [ ] `tests/sim/combat/ledger.test.ts` (15-04 T1), `tests/sim/world/kill.test.ts` (15-04 T1, extended in 15-05 T1 and T2), `tests/sim/combat/kill.property.test.ts` (15-06 T1, T2) — new, each created by the task that introduces the code it tests, so no separate Wave 0 plan is needed
- No new framework or fixtures.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 20-seed NPC acceptance run | QUAL-11 | In no gate by decision; remote machine only | after plans 15-02 (one run covering 15-01's `ships-npc.json` change and 15-02), 15-03, 15-04 and 15-05: `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm test npm run test:acceptance` at the committed HEAD; record 21 of 21 (aiFaulted 0, aiDropped 0, repairs 0) and the HEAD in each SUMMARY |
| Remote `verify` | FOUND-18 (traffic mapping), FOUND-19 (kills in the live loop) | `src/app/session/traffic.ts` changes in 15-03; 15-04 makes kills happen; owner rule: verify runs only on the remote machine | after plans 15-03 and 15-04: `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm verify`; record the result and HEAD in each SUMMARY |
| Browser kill step | FOUND-19 (criterion 1: leaves the scanner, ident ends) | browser tests run only on the remote machine; `combat.spec.ts` is not in `verify`'s fast subset; its energy budget is proven first by the local Vitest twin (15-04 T2) | after plan 15-04: `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/combat.spec.ts"`; record the result and HEAD in 15-04-SUMMARY.md |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
