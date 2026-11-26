---
phase: 22-initial-population
plan: 05
subsystem: content-pipeline
tags: [content, npc-catalogue, converter, schema, hyperspace_motor, WORLD-08]

requires:
  - phase: 22-initial-population
    provides: "plan 22-02: tests/oracles/population/fixtures/ship-facts.json (29 keys, hasHyperspaceMotor, accuracy, cargoCarried)"
provides:
  - "NpcShip.hyperspaceMotor (z.boolean) in src/content/schemas/ship-npc.ts, with its Oolite citation"
  - "DEFAULT_HYPERSPACE_MOTOR (true) and the hyperspaceMotor compile line in tools/oolite-ingest/convert/npc-ships.ts"
  - "src/content/generated/ships-npc.json: 29 records, each with hyperspaceMotor (9 false)"
  - "a content test that compares the compiled field with the recorder's independent facts"
affects: [22-09, 22-13]

actuals:
  tokens: 5600
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "A plain Oolite boolean key compiles through boolExtra with a DEFAULT_* constant pinned to the hand-written golden"

key-files:
  created: []
  modified:
    - src/content/schemas/ship-npc.ts
    - tools/oolite-ingest/convert/npc-ships.ts
    - tools/oolite-ingest/convert/npc-ships.test.ts
    - tests/golden/content/ships-npc.json
    - src/content/generated/ships-npc.json
    - src/content/generated/manifest.json
    - tests/content/ships-npc.test.ts

key-decisions:
  - "hyperspaceMotor is a boolean, not a fuzzy probability: Oolite reads hyperspace_motor with oo_boolForKey (default YES, ShipEntity.m:382), never oo_fuzzyBooleanForKey"
  - "The 22-02 facts accuracy and cargoCarried need no compile step: both are null for all 29 keys (no catalogue ship authors them), so there is nothing to carry; the plan's stop-for-report clause does not fire"

requirements-completed: [WORLD-08]

plan_head_before: 4eebadfbf75771afb32280badeca367c72fd7ae8
plan_head_after: 664947f7 (task commits; the SUMMARY commit follows)

completed: 2026-11-26
status: complete
---

# Phase 22 Plan 05: hyperspace_motor in the NPC catalogue Summary

**Every NPC record now carries `hyperspaceMotor`, compiled from Oolite's `hyperspace_motor` (default yes) through `like_ship`, and it equals the recorder's independent `hasHyperspaceMotor` for all 29 keys; the nine records that author no motor compile `false`.**

## Per-key values

False (9): gecko, krait, mamba, mamba-escort, shuttle, sidewinder, sidewinder-escort, viper, viper-pursuit. True (20): the other 20 keys, viper-interceptor included (its template has no `like_ship` and authors no `hyperspace_motor`, so it takes the default).

The authored `hyperspace_motor = no` lines are on the gecko (shipdata.plist 2287), krait (2525), mamba (2599), shuttle (3512), sidewinder (3569) and viper (3846) templates (also escape-capsule, tharglet, transporter and worm, outside the roster). The escort and pursuit hulls inherit it through `like_ship` (`oolite_template_mamba-escort` and `-sidewinder-escort` and `-viper-pursuit` like-ship their base templates). The plan text named five templates; the shuttle also authors `no`, and the recorder's facts agree.

The golden's 15 worked examples and its `defaults` were written by hand from these plist lines (values read off the plist, not copied from the generated file); the content test then compares all 29 compiled records with `ship-facts.json`.

## Further ship facts (22-02)

`ship-facts.json` also records `accuracy` and `cargoCarried`. Both are `null` for all 29 keys: no catalogue hull authors `accuracy` or a carried cargo, so there is no record value to compile. Nothing was added for them. If a later plan finds the populator needs a non-null value, that is a new decision, not a gap in this plan.

## Tasks

| Task | Commit | What |
|---|---|---|
| 1 (tracer) | b236e076 | schema field, `DEFAULT_HYPERSPACE_MOTOR`, converter line, golden (fields list 41 to 42, defaults, 15 examples), regenerated `ships-npc.json` and `manifest.json` hash, content-test field list and the ship-facts cross-check |
| 2 | 664947f7 | default pinned to the golden; per-key values through `like_ship`; absent key compiles true; a string, number, null or list value fails `compileNpcShips` with code SCHEMA naming the record (`viper`) and the key (`hyperspace_motor`) |

TDD note: the converter and schema landed in Task 1 with their tests; Task 2's tests pin behaviour that already existed, so they passed on first run (no RED commit). They are guards, not drivers: the refusal cases and the default pin fail if `boolExtra` or the default regress.

Tracer gate: Task 1's verify (npc-ships, ships-npc, inert-isolation, compliance-assets: 4 files, 195 tests) passed before expanding.

## Gates

- Targeted (local, Docker): `npc-ships.test.ts` 94 passed; `tests/content/ships-npc.test.ts` 50 passed; `inert-isolation.test.ts` 39 passed unchanged; `compliance-assets.test.ts` 14 passed.
- `docker compose run --rm assets npm run assets:check`: no differences. Regeneration changed only `ships-npc.json` (+29 lines) and its `manifest.json` entry (bytes 52028 to 52878).
- `docker compose run --rm lint`: clean. `docker compose run --rm typecheck`: clean.
- Full `test` suite ran **remotely** (orchestrator instruction: the local machine is slow), snapshot 664947f7, via `wegolite-remote-run.sh run --rm test`: exit 0, 311 test files passed, 1 skipped, 309 s. An earlier full local run (1,040 s, under load from the parallel executor) had 3 timeouts in `tools/oolite-ingest/drift.test.ts` and one more file (180 s drift-build tests, a known load flake class); the remote run, which covers those files, is green, and that is the result of record.
- Inert pins: `git diff --stat 4eebadfb..HEAD -- tests/golden/world` prints nothing; `tests/sim/world/inert-isolation.test.ts` is green unchanged.

## Remote 20-seed acceptance run (QUAL-12, `ships-npc.json` changed)

`wegolite-remote-run.sh run --rm test npm run test:acceptance`: **exit 0, 21 passed of 21** (20 epochs plus the run-minimums test), 85.05 s Vitest duration (wrapper elapsed 88 s), snapshot **664947f7**. Totals: stationArrivals 40, interceptArrivals 40, fleeArrivals 40, avoidCollisionEntries 23, stuckWindowsEvaluated 175, frozenWindowsEvaluated 293, hullCrossingsUnexcused 0 in every epoch. Thresholds and detectors untouched.

## Deviations from Plan

**1. [Rule 3 - Blocking] Task 1 touched `tools/oolite-ingest/convert/npc-ships.test.ts` (the plan lists it under Task 2 only).** The existing test asserts the golden has exactly 41 fields and the Golden type; with the golden at 42 fields, Task 1's own verify command would fail. The count, the type field and the file header moved in Task 1; the default pin and refusal cases stayed in Task 2.

**2. [Rule 3 - Blocking] `src/content/generated/manifest.json` also changed** (the sha256 and byte count of `ships-npc.json`), as the content build does for any generated file. Committed with Task 1; it is generated, not hand-edited.

**3. Local full suite not repeated.** Per the orchestrator's mid-plan instruction, the full `test` run of record is the remote one; the one local full run that was in progress finished and its three timeouts are described above.

No other deviations. `hyperspaceMotor` was not added to the fuzzy-probability key list in `tests/content/ships-npc.test.ts` (it is boolean); a dedicated test covers it instead.

## Threat Flags

None. The new field is a compile-time boolean from vendored data; `boolExtra` and `z.boolean()` refuse any other value (T-22-05, tested); the inert path and its pins did not move (T-22-06).

## Known Stubs

None.

## Self-Check: PASSED

Created and modified files exist and match the key-files list; commits b236e076 and 664947f7 are ancestors of HEAD; `rg -c '"hyperspaceMotor"' src/content/generated/ships-npc.json` = 29; `rg -c hyperspace_motor tools/oolite-ingest/convert/npc-ships.ts` >= 1; `rg -c DEFAULT_HYPERSPACE_MOTOR tools/oolite-ingest/convert/npc-ships.test.ts` >= 1; STATE.md and ROADMAP.md untouched.
