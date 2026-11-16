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
- **Before `/gsd-verify-work`:** full suite green; `verify` once for the plan that edits `src/app/session/traffic.ts`; by-hand 20-seed acceptance run (21 of 21) for plans touching `src/sim/world/**` or `ships-npc.json`
- **Max feedback latency:** per-file vitest run

---

## Per-Task Verification Map

Filled by the planner from the requirement map in `15-RESEARCH.md` (FOUND-18, FOUND-19, DATA-14, QUAL-11).

| Requirement | Behaviour | Test Type | Automated Command | File Exists |
|-------------|-----------|-----------|-------------------|-------------|
| FOUND-18 | Strip-and-rehash to `c1068643`/`ab72eedf`/`b23d11d8`; pristine omit; v4 round trip; 30/60/144 Hz | unit, cadence | `docker compose run --rm test npx vitest run tests/sim/world/populate.test.ts tests/sim/world/hash.test.ts tests/sim/world/snapshot-codec.test.ts tests/sim/world/world-cadence.test.ts` | amend |
| FOUND-19 | Ledger, idempotent `killShip`, boundary invariants property test | unit, property | `docker compose run --rm test npx vitest run tests/sim/combat/ledger.test.ts tests/sim/world/kill.test.ts tests/sim/combat/kill.property.test.ts` | ❌ W0 |
| DATA-14 | Nine records carry new fields; drift gate | unit, drift | `docker compose run --rm test npx vitest run tests/content/ships-npc.test.ts` and `docker compose run --rm assets npm run assets:check` | amend |
| QUAL-11 | Frozen acceptance run 21 of 21 | by hand, remote | `npm run test:acceptance` (remote machine) | exists |

*Status: ⬜ pending*

---

## Wave 0 Requirements

- [ ] `tests/sim/combat/ledger.test.ts`, `tests/sim/world/kill.test.ts`, `tests/sim/combat/kill.property.test.ts` — new
- No new framework or fixtures.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 20-seed NPC acceptance run | QUAL-11 | In no gate by decision; remote machine only | `npm run test:acceptance` on the remote test machine, record 21 of 21 in the SUMMARY |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
