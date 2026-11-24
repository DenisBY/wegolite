---
phase: 19-equipment-damage-and-repair
plan: 09
subsystem: persistence
tags: [save, probe, damaged-equipment, e2e, continue, load, contract-table]
requires:
  - phase: 19-equipment-damage-and-repair
    provides: "19-03 PlayerProfile.damagedEquipment and applyEquipmentDamaged, 19-08 save schema v5, equipmentAllowLists and the shared builders"
provides:
  - "economy.damagedEquipment on the probe: a fresh copy of the profile's damaged list"
  - "dockedSaveAt(systemName, { equipment?, damagedEquipment? }) through the production encodeSave"
  - "a browser proof that a damaged item stays damaged after Continue and after an in-session Load from a different state"
  - "the damaged-list contract table in save-v5.test.ts: every forged list is corrupt on read and refused by the writer gate"
affects: [19-10, 19-12, 19-13, 19-14]
requirements-completed: [SAVE-09]
actuals:
  tokens: 6000
  tasks: 2
  commits: 2
plan_head_before: f574b577a802162552bf58571f748f6f1c8ef961
plan_head_after: 1aa5884e0afa33a539cc46f365fea84a759bf2c4
tech-stack:
  added: []
  patterns:
    - "A browser durability proof starts from an untainted production-encoded fixture and writes the second blob with writeRaw, never through the ?test=1 hook"
    - "A refusal table asserts the reader (corrupt) and the writer gate (false) on the same bytes, after a control that is accepted"
key-files:
  created: []
  modified:
    - src/app/probe.ts
    - src/app/session/probe-publisher.ts
    - tests/app/session/probe-publisher.test.ts
    - tests/fixtures/probe-shape.json
    - tests/e2e/helpers/save-fixtures.ts
    - tests/e2e/save-load.spec.ts
    - tests/persistence/save-v5.test.ts
key-decisions:
  - "The probe gains one additive key, economy.damagedEquipment, hand-edited into the six economy blocks of the probe-shape fixture (the sanctioned change of the plan); write mode was not run"
  - "No validator bug was found: src/persistence/save.ts is unchanged"
status: complete
---

# Phase 19 Plan 09: Damaged equipment through Continue, Load and the save contract Summary

**The probe now publishes `economy.damagedEquipment` as a copy of the profile's list; a v5 fixture written through the production `encodeSave` boots damaged after Continue, and an in-session Load from an undamaged session turns the list into `["EQ_DOCK_COMP"]`; every malformed damaged list is corrupt on read and refused on write.**

## Performance

- **Tasks:** 2 of 2 (Task 1 the tracer: one damaged docking computer from a fixture through boot, Continue and Load to the probe)
- **Commits:** two code commits, measured from the plan base `f574b57` (`git rev-list --count`); the SUMMARY commit follows.
- **Estimate vs actual:** about 6,000 tokens (chars/4 over the realized diff) against an estimate of 65,000.

## Task Commits

| Task | Commit  | Files |
| ---- | ------- | ----- |
| 1    | 8ee6e5b | `src/app/probe.ts`, `src/app/session/probe-publisher.ts`, `tests/app/session/probe-publisher.test.ts`, `tests/fixtures/probe-shape.json`, `tests/e2e/helpers/save-fixtures.ts`, `tests/e2e/save-load.spec.ts` |
| 2    | 1aa5884 | `tests/persistence/save-v5.test.ts` |

## What was built

- **Probe (T-19-14):** `WegoliteEconomyProbe.damagedEquipment: string[]`, published as `[...ctx.core.profile.damagedEquipment]` by `syncEconomyProbe`. A Node case mutates the probe's array and checks the profile's list is unchanged, and that an undamaged profile publishes a fresh empty array.
- **Probe-shape fixture:** `"damagedEquipment": { "[]": [] }` hand-edited into each of the six `economy` blocks after `credits` (6 matches); write mode was not run. The remote probe-shape spec passes unmodified.
- **Fixture option (T-19-15):** `dockedSaveAt(systemName, { equipment?, damagedEquipment? })` flows into the shared `saveInputs` and the production `encodeSave`; the output is unchanged when the options are omitted. No hand-written JSON and no hook.
- **Browser test "a damaged item stays damaged after Continue and after an in-session Load":** Continue from `dockedSaveAt("Lave", { damagedEquipment: ["EQ_DOCK_COMP"] })` reads `["EQ_DOCK_COMP"]` and `save.status` "valid". The Load step first continues a session from `dockedSaveAt("Lave", { equipment: ["EQ_DOCK_COMP"] })` and asserts the probe reads `[]` (the precondition), then stores the damaged blob with `writeRaw`, opens F2, presses L, and the probe reads `["EQ_DOCK_COMP"]`. The stored bytes equal the damaged blob after the Load and the page never reloaded (marker). The session stays untainted (no `?test=1`).
- **Contract table (`describe("the damaged-list contract (SAVE-09, D-11)")`):** under the production `equipmentAllowLists` over the compiled catalogue. Controls are accepted first (non-vacuous). 17 forged rows (17 keys, a key in both lists, a duplicate, `EQ_DOCK_COMP_DAMAGED` in either field, `EQ_CARGO_BAY` in the damaged list, `EQ_ECM` and `EQ_WEAPON_PULSE_LASER` in each field (D-03), unknown key, empty string, 65-character key, non-string entry, `null`, string, object) plus the missing field: each is `corrupt` from `parseSave` and `false` from `isEncodedSaveValid` on the same bytes. A premise test shows the two D-03 keys have `damageProbability > 0` and are outside the damageable set. Bounds over synthetic lists: 16 keys accepted and 17 corrupt, combined 64 accepted and 65 corrupt. A blob padded to exactly `MAX_SAVE_CHARS` parses and one more character is exactly `{ ok: false, reason: "unreadable" }`. Versions 0, -1, 1, 2, 3, 4 and 4.5 are corrupt on read and refused on write, the current version is accepted, the next is `future-version`, a relabelled version 4 and an extra key are corrupt, and every checked-in older golden stays corrupt under the production lists.
- **Durability (Pitfall 13):** `snapshotForSave` after `applyEquipmentDamaged` carries the damaged key and drops it from `equipment`, docked and in flight (with a hyperspace target); the bytes pass the writer gate, parse and round-trip. The docked profile before the damage is asserted as installed first. There is no write on the damage step (a refused key returns the same profile); the event-router source assertion belongs to 19-10.

## Deviations from Plan

None - plan executed as written. No validator bug was exposed, so `src/persistence/save.ts` is unchanged. The probe and test surface is not user-visible, so there is no CHANGELOG entry (as the plan says).

## Verification records

- Task 1: `tests/app/session/probe-publisher.test.ts` (40 tests), `typecheck`, and the list-only Playwright check (`Total: 1 test in 1 file`) all green. Acceptance greps: `"damagedEquipment"` 6 times in the fixture, 1 hit each in `probe.ts` and `probe-publisher.ts`, one "stays damaged after Continue", one `equipment: ["EQ_DOCK_COMP"]`.
- Task 2: `docker compose run --rm test npx vitest run tests/persistence` (6 files, 282 tests) and `typecheck` green on the first run; one `describe("the damaged-list contract`.
- Plan boundary `docker compose run --rm test`: 7284 passed, 2 failed on 30 s/5 s timeouts in files this plan did not touch (`tests/guards/tools-determinism.test.ts`, `tools/oolite-ingest/convert/textures.test.ts`) while other executors ran containers on the same machine. An earlier full run also timed out in `tests/sim/combat/kill.property.test.ts` and `tests/sim/npc/attack-dispatch.test.ts`. Each rerun alone passes (2 files 78 tests; 2 files 25 tests). Coverage floors raised no threshold error line.
- `docker compose run --rm lint`: clean.
- Remote e2e (`save-load.spec.ts`, `probe-shape.spec.ts`): `snapshot=1aa5884`, 16 passed (including the new test at `save-load.spec.ts:651` and all seven probe-shape states), `exit=0 elapsed=53s`.
- Remote `verify` (lint, typecheck, content drift, unit tests, build, e2e smoke subset): `snapshot=1aa5884`, 28 e2e passed, `exit=0 elapsed=253s`.

## Known Stubs

None.

## Threat Flags

None. The only new surface is the read-only probe key, which the register already covers (T-19-14).

## Self-Check

- Files exist: `src/app/probe.ts`, `src/app/session/probe-publisher.ts`, `tests/persistence/save-v5.test.ts`, `tests/e2e/save-load.spec.ts`, `tests/e2e/helpers/save-fixtures.ts`, `tests/fixtures/probe-shape.json`, `tests/app/session/probe-publisher.test.ts`: FOUND.
- Commits `8ee6e5b` and `1aa5884` are ancestors of HEAD: FOUND.
- STATE.md and ROADMAP.md untouched (the orchestrator owns them): FOUND.

## Self-Check: PASSED
