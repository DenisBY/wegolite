---
phase: 12-inert-ships-and-the-world-lifecycle
plan: 04
subsystem: sim
tags: [mass-lock, hyperspace-blockage, ship-field, torus, fidelity]
requires:
  - phase: 12-inert-ships-and-the-world-lifecycle
    provides: "plan 12-02 containment and the ai === null integrator skip (inert hand-built ships); plan 12-03 build-time traffic default (no direct code dependency)"
provides:
  - "src/sim/world/ship-field.ts: ShipField, ShipMass, createShipField, NON_LOCKING_SCAN_CLASSES (allocation-free mass-lock and blockage queries over the live store)"
  - "stepSim builds one ShipField per tick and passes it as stepFlight's trailing parameter; stepTorus/engageTorus take it"
  - "StepOptions.hyperspace.shipMasses (read-only compiled masses keyed by specKey)"
  - "WitchspaceBlocker ('station' | 'ship') and the optional hyperspaceRefused.blocker field, present when reason is blocked"
  - "FIDELITY E-22 rewritten with the measured buoy evidence, E-31 (ship mass lock) and E-32 (torus factor divergence), with verbatim excerpts"
  - "PROJECT.md Key Decisions rows: WORLD-10 ships, buoys non-blocking (owner decision 2026-11-14, option A), torus factor ignores ships; row 181 amended"
affects: [12-05, 12-07, 12-08]
status: complete
actuals:
  tokens: 24800
  tasks: 3
  commits: 5
plan_head_before: d3036890e0050ec7f44355623391c5aec26d9bad
plan_head_after: 6d614e09f295c20cb89eaef98ec23a2d5749353d
tech-stack:
  added: []
  patterns:
    - "read-only world view passed into the flight step as a trailing optional parameter (like stationMass travels through StepOptions, never on Entity)"
    - "per-tick field object with inline squared-distance walks over world.store.live; no per-ship allocation"
key-files:
  created:
    - src/sim/world/ship-field.ts
    - tests/sim/world/ship-field.test.ts
  modified:
    - src/sim/flight/torus.ts
    - src/sim/flight/step.ts
    - src/sim/sim.ts
    - src/sim/events.ts
    - src/sim/hyperspace/countdown.ts
    - tests/sim/hyperspace-blockage.test.ts
    - FIDELITY.md
    - .planning/PROJECT.md
key-decisions:
  - "Ships lock the torus strictly inside 25,600 m by scan class and block a completing jump through isWitchspaceBlocked with the compiled mass; the station keeps its inclusive boundary and is checked first."
  - "hyperspaceRefused carries a payload-free blocker kind (station or ship), the planner's choice of research Open Question 4."
  - "Buoys stay non-blocking in Phase 12 (owner decision 2026-11-14, option A) on the measured 0 m witchpoint distance of tests/e2e/hyperspace-failure.spec.ts; revisit tracked in the todo make-buoys-block-hyperspace-like-oolite."
  - "The torus factor keeps reading the five bodies only; ships are a recorded divergence (E-32)."
requirements-completed: []
---

# Phase 12 Plan 04: Ship mass lock and jump blockage (simulation half) Summary

NPC ships now lock the torus and block a completing hyperspace jump inside the simulation through a read-only `ShipField` that `stepSim` builds once per tick, with Oolite's strict ranges, the compiled Phase 10 masses and a payload-free `blocker` on the refusal event.

WORLD-10 also needs plan 12-05 (the `torusRefused` event, the copies and the step-options builder), so `requirements-completed` is empty here and WORLD-10 was deliberately not marked complete.

## Performance

- **Duration:** about 13 min
- **Started:** 2026-11-14T17:19Z
- **Completed:** 2026-11-14T17:32Z
- **Tasks:** 3
- **Files modified:** 10 (2 created)

## Accomplishments

- **Tracer (Task 1).** `createShipField(world, masses).massLocked(position, range)` is true for a ship of a locking scan class strictly inside the range (25,599 m locks; exactly 25,600 m and 25,601 m do not), false for the seven exempt classes (CLASS_NO_DRAW, CLASS_PLAYER, CLASS_BUOY, CLASS_ROCK, CLASS_CARGO, CLASS_MINE, CLASS_VISUAL_EFFECT), dead ships and empty worlds. Through `stepSim`, a locking ship 10 km away leaves `torus.engaged` false with `torus.massLocked` true, the same ship at 30 km engages, and a running drive disengages with `torusDisengaged` reason `massLock` and `massLockChanged` locked true when a ship comes inside the range. With no world or an empty world the 30-step flight log is byte-identical. The frozen flight-hash pins and tick parity pass unedited. Tracer gate: the five targeted Vitest files re-run green (62 passed), so expansion proceeded.
- **Blockage (Task 2).** `blocks()` walks the live store and reuses `isWitchspaceBlocked` per ship with the mass found by a linear scan of `shipMasses` for the ship's `specKey`; a missing, non-finite or non-positive mass never blocks. A viper at 58.0 m blocks and at 58.5 m does not (0.1 x 34,040.6796875 = 3,404.07 m^2 against 3,364 and 3,422.25); a krait blocks at 96 m and not at 97 m; a huge synthetic mass still does not block at 25,600 m. Through `stepSim`, a countdown that completes with a viper 50 m away is refused with `{ reason: "blocked", blocker: "ship" }`, clears the target and spends no jump time; with the viper at 70 m the jump commits; with the station and a ship both inside their radii the refusal names `blocker: "station"`; the H press never refuses (a viper at 10 m still starts the countdown). The existing station pin in tests/sim/hyperspace-blockage.test.ts gained `blocker: "station"`; nothing else in that file changed.
- **Docs (Task 3).** FIDELITY.md: E-22 rewritten (station and ships block; buoys non-blocking by owner decision 2026-11-14, option A, with the 0 m witchpoint evidence and the revisit todo), E-31 and E-32 added with verbatim excerpts (PlayerEntity.m 3044-3061 and 2918-2934), and E-06, E-07, E-21, E-23 re-pointed to their moved lines (`torus.ts:79`, `torus.ts:99`, `step.ts:227`, `countdown.ts:63`; E-22 is `countdown.ts:81`). PROJECT.md: three new Key Decisions rows and row 181 amended, keeping the sentence the E-22 row quotes. The fidelity contract ran with `OOLITE_SRC` over a `git archive 7437f22` tree: 9 passed, the verbatim case not skipped.

## Gates run (all in Docker)

| Gate | Result |
| --- | --- |
| Task 1 targeted Vitest (ship-field, torus, mass-lock, flight-hash-pins, tick-parity) | 5 files, 62 tests passed |
| Task 2 targeted Vitest (ship-field, hyperspace-blockage, hyperspace, session-order, hyperspace-controller, flight-hash-pins) | 6 files, 122 tests passed |
| `docker compose run --rm typecheck` | exit 0 (after Tasks 1 and 2, and again at the end) |
| Fidelity contract with `OOLITE_SRC=/oolite` | 9 passed, not skipped |
| `docker compose run --rm test` (full, coverage) | exit 0, 144 files, 2,846 passed, 2 skipped, no coverage error; `ship-field.ts` 100 % |
| `docker compose run --rm lint` | exit 0 (ESLint and Prettier clean) |

No `verify` or `verify-full` was run, by the plan's gate policy (`src/sim/`, tests and docs only; plan 12-05 runs `verify` for the app half).

## Task commits

| Task | Commit | Note |
| --- | --- | --- |
| 1 RED | c396c1d | test(12-04): ship mass-lock rows through stepSim |
| 1 GREEN | b0be0dd | feat(12-04): NPC ships lock the torus through a read-only ship field |
| 2 RED | 42aa318 | test(12-04): ship jump blockage and blocker field |
| 2 GREEN | 2150476 | feat(12-04): jump inside a ship's blockage radius is refused |
| 3 | 6d614e0 | docs(12-04): FIDELITY E-22/E-31/E-32, Key Decisions |

`commits: 5` is measured from the persisted ledger (`git rev-list --count d303689..HEAD` before the SUMMARY commit).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Wording] PROJECT.md acceptance count for the WORLD-10 row title**
- **Found during:** Task 3 acceptance check
- **Issue:** `rg -c 'Mass lock and jump blockage by NPC ships \(WORLD-10\)'` printed 2 (expected 1) because the row 181 amendment quoted the new row's full title.
- **Fix:** the amendment now quotes `"Mass lock and jump blockage by NPC ships"` without the `(WORLD-10)` suffix.
- **Files modified:** `.planning/PROJECT.md`
- **Commit:** 6d614e0 (made before the commit)

**2. [Housekeeping] FIDELITY.md table realigned by Prettier**
- **Found during:** Task 3
- **Issue:** the E-22 text and the two new rows are wider than the old column, and the repository's Prettier check realigns the whole table, so the FIDELITY.md diff is about 110 lines for about 15 lines of content.
- **Fix:** none needed; content is unchanged apart from the rows named above.

### Plan notes

- **No CHANGELOG entry.** The behaviour is not user-visible until the populator (plan 12-07) places ships and traffic is on; AGENTS.md allows omitting internal-only changes. Plan 12-05 or a later plan adds the visible entry when a refusal message exists.
- **Redundant `tdd` commits.** Both tdd tasks were committed as a RED test commit then a GREEN feature commit, as in plan 12-03.

Total deviations: 1 wording fix, 1 formatting note. Impact: none on behaviour or scope.

## Known Stubs

None. `ShipField.blocks` is fully implemented; `shipMasses` is intentionally absent until plan 12-05's step-options builder supplies it, which means no ship blocks a jump in the running app yet (documented in the `shipMasses` doc comment and the Key Decisions row status).

## Threat Flags

None. No new endpoint, auth path, file access or schema change; the world enters the flight step read-only. T-12-09 (linear walks, no per-ship allocation), T-12-10 (invalid mass never blocks, covered by the "never blocks for a missing, non-finite or non-positive mass" row) and T-12-12 (frozen pins and tick parity pass unedited) are mitigated as planned.

## Notes for plan 12-05

- `hyperspaceRefused.blocker` is optional and present exactly when `reason` is `blocked`; the app router needs no change to keep compiling, and `refusalCopy(reason, blocker?)` is plan 12-05's.
- The refused torus toggle still emits `{ kind: "torusDisengaged", reason: "massLock" }` for every lock source (bodies and ships); plan 12-05 replaces it with `torusRefused`.
- `StepOptionsInput.shipMasses` must be built from the compiled NPC records (`ships-npc.json`) for the app to supply `StepOptions.hyperspace.shipMasses`.

## Self-Check: PASSED

- Files exist: `src/sim/world/ship-field.ts`, `tests/sim/world/ship-field.test.ts` (verified before this note).
- Commits c396c1d, b0be0dd, 42aa318, 2150476, 6d614e0 are ancestors of HEAD.
- `git diff d303689 -- src/app` and untracked `src/app` files: both empty.
- All task acceptance criteria re-run and passing (rg counts, pending-wording guard exit 1, no src/app change).
