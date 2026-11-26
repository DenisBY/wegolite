---
phase: 22-initial-population
plan: 08
subsystem: sim-world
tags: [populator, couriers, smugglers, trade-groups, escorts, fidelity, WORLD-08]

requires:
  - phase: 22-initial-population
    provides: "plan 22-07: buildGroup, the ship kit, setUpEscorts, buildFreighter, the replay helpers"
  - phase: 22-initial-population
    provides: "plan 22-06: POPULATOR_ENTRIES, POPULATOR_CUTS, SystemFacts, PopulationDraws, the FIDELITY contract for script excerpts"
provides:
  - "src/sim/world/population/traders.ts: buildCourierShort, buildCourierLong, buildSmuggler beside buildFreighter"
  - "src/sim/world/population/groups.ts: buildGroup dispatches the courierShort, courierLong and smuggler builders"
  - "tests/sim/world/population/traders.oracle.test.ts: the replay of every trade-entry group of the 66 fixtures (801 groups)"
  - "FIDELITY.md rows and excerpts E-204 (opportunist, divergence), E-205 (trader escort removal, faithful), E-206 (escort group model, divergence)"
  - ".planning/PROJECT.md Key Decisions row 'Engine escorts spawn with the initial population (D-08)'"
affects: [22-09, 22-10, 22-11, 22-12]

actuals:
  tokens: 19000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "A trade builder asks for its role through addTradeShip: _roleExists falls back to the exact role trader, which is the only role the engine's escort removal applies to"
    - "Untrusted neighbourhood facts are read through total readers (nearbySystem, chartDistance): a missing function or a malformed list gives this system, no draw, no throw"

key-files:
  created: []
  modified:
    - src/sim/world/population/traders.ts
    - src/sim/world/population/groups.ts
    - tests/sim/world/population/traders.oracle.test.ts
    - FIDELITY.md
    - .planning/PROJECT.md

key-decisions:
  - "The courier's escort loop (`oolite-populator.js:1468-1476`) never runs: it tests `t.escortGroup` on the array `_addShips` returns, not on a ship, so couriers' escorts keep the engine's bounty and no heat insulation is written (ported as written, recorded in the Key Decisions row)"
  - "FIDELITY E-206 cites ShipEntity.m:1634-1638 (the leader's group and escort group assignment); the primary role (:1720) and the escort's group and owner (:1748-1749) are named in the row text, because no range of 20 lines or fewer holds all three"
  - "chartDistance and nearbySystem read the facts through total readers; the freighter now uses chartDistance as well (identical behaviour on valid facts)"

requirements-completed: [WORLD-08]

plan_head_before: d46c1142b1a89cc328ac01c8c0851da324edfb04
plan_head_after: 025723ce (task commits 4c94c575, 025723ce; the SUMMARY commit follows)

duration: 40min
completed: 2026-11-26
status: complete
---

# Phase 22 Plan 08: Couriers, smugglers and the trade-side records Summary

**`buildGroup` now plans every recorded trade group of the 66 Oolite fixtures exactly, 801 groups in all (505 freighter, 84 route-1 and 178 route-3 courier, 34 smuggler), draw counts included, and FIDELITY and Key Decisions record the opportunist (D-10), the trader escort removal and the merged escort group (D-08).**

## Performance

- **Duration:** about 40 min
- **Tasks:** 2 (2 commits)
- **Files:** 5 modified, 0 created

## Accomplishments

- **Couriers (Task 1, tracer).** `buildCourierShort` and `buildCourierLong` are `_addCourier`, `_addCourierShort` and `_addCourierLong` (`oolite-populator.js:1455-1525`): role `trader-courier` (`_roleExists` falls back to `trader`), bounty 0, scarce cargo, home from the systems within 7 LY with the chart fuel, destination this system (short) or a system within 25 LY (long; the home draw comes first). The tracer replayed the first short-courier group ship for ship and draw for draw before the replay widened to every courier group. `heatInsulation = 6` stays a cut: every recorded courier leader carries it as a cut write, `POPULATOR_CUTS` lists it, and no planned ship has such a member.
- **Smugglers (Task 2).** `buildSmuggler` is `_addSmuggler` (`:1528-1575`): bounty `min(ceil(r * 20), 2 * cargoSpaceCapacity)`, contraband cargo, the fuel injector forced on for a ship with `auto_weapons`, `_setWeapons(1.2)`, `_setEscortWeapons`, then `bounty |= 3 + floor(r * 12)` on every escort. The station branch (Phase 26) stays a parameter on all three builders.
- **Records.** FIDELITY E-204 (opportunist keeps its data effects, only `switchAI` cut, divergence quoting "Initial population port (WORLD-08, Phase 22)"), E-205 (trader escort removal, `Universe.m:2657-2665`, faithful), E-206 (escort group model, `ShipEntity.m:1634-1638`, divergence quoting the new D-08 row), and the Key Decisions row "Engine escorts spawn with the initial population (D-08)" (model, removal and bounty rules, merged group A10, `escortCheckMother` is Phase 23's; reversible).

## Replay result

All 66 fixtures: every group of the five trade entries is reproduced field by field and the port takes the recorded number of draws on each compared site. Counts: freighters 505, couriers route 1 84 and route 3 178, smugglers 34, together 801. No fixture, recorder or stub change. Facts the replay pins beyond the ships:

- `_addCourierLong` draws its destination from the 25 LY list: at least one recorded long courier ends outside the 7 LY list.
- Every courier leader has role and primary role `trader-courier`, bounty 0 and scarce cargo; home is this system or within 7 LY.
- Every smuggler has bounty 1 to `min(20, 2 * maxCargo)`, contraband cargo and the injector when its record has `auto_weapons`.
- **No recorded smuggler has an escort** (the shipped hulls author no `escort_roles`), so the smuggler escort bonus is covered by a unit case on a record that has one: a clean escort of a smuggler whose draws are 0.5 gets bounty 9 (`3 + floor(0.5 * 12)`).
- The courier's `bounty = 0` write is invisible against the shipped records (they author no bounty); a unit case with a record that authors bounty 9 pins it.
- Missile counts are never read on any trade path (a proxy record whose `missiles` and `maxMissiles` getters throw), and a total-function case hands every trade builder non-finite and prototype-named facts.

Mutation checks (each restored): long courier range 25 to 24 (21 failures), smuggler injector removed (32), smuggler bounty clamp removed (11). The courier `bounty = 0` mutant survived the oracle (equivalent on the shipped catalogue) and is why the unit case exists.

## Task Commits

1. **Task 1 (tracer): short and long couriers through the dispatcher, every courier group replayed** - `4c94c575` (feat)
2. **Task 2: smugglers, every trade group, FIDELITY E-204 to E-206, the D-08 Key Decisions row** - `025723ce` (feat)

Tracer gate: the first short-courier group replayed ship for ship and draw for draw before the other courier groups were added; passed.

## Files Created/Modified

- `src/sim/world/population/traders.ts` - `buildCourierShort`, `buildCourierLong`, `buildSmuggler`, `roleExists`, `nearbySystem`, `chartDistance`, `addTradeShip`, `addCourier`
- `src/sim/world/population/groups.ts` - three dispatch cases
- `tests/sim/world/population/traders.oracle.test.ts` - courier, smuggler and every-trade-entry replays
- `FIDELITY.md` - rows and excerpts E-204 to E-206
- `.planning/PROJECT.md` - the D-08 Key Decisions row

## Decisions Made

See `key-decisions`. None revises a recorded Key Decisions row.

## Deviations from Plan

**1. [Rule 2 - Missing critical] `chartDistance` and `nearbySystem` read facts through total readers.** The plan's builders read `facts.neighbourhood.distanceTo` directly; a malformed fact would throw a TypeError. Both are read through `readField`, as `weightedNearbyTradeSystem` does, and the freighter uses `chartDistance` too (valid facts behave identically; the 505-group replay is unchanged). Commit `025723ce`.

**2. [Plan detail] E-206 cites ShipEntity.m:1634-1638, not a range that shows the primary role.** No range of at most 20 lines holds the leader's group assignment (`:1634-1638`), the primary role (`:1720`) and the escort's group and owner (`:1748-1749`). The cited range is the one that carries the divergence (the escort group set only when the leader has no group); the other two lines are named in the row. Commit `025723ce`.

**3. Test-first order.** Both tasks are `tdd="true"`, but as in plans 22-06 and 22-07 the recorded fixtures are the oracle: the builders and the replay were written together, the replay was green on the first run, and each guarded value was mutation-checked afterwards (see above).

**Total deviations:** 3 (1 missing-critical, 2 plan details). **Impact:** none on the outcome.

## Gates

- Targeted (Docker, snapshot `025723ce`): `traders.oracle.test.ts`, `kit.test.ts`, `tests/contract/fidelity.test.ts`, `tests/guards/npc-missiles-tripwire.test.ts`, `tests/sim/world/inert-isolation.test.ts`: 5 files, 322 passed, 1 skipped (the verbatim excerpt case when `OOLITE_SRC` is unset).
- `tests/contract/fidelity.test.ts` with `OOLITE_SRC=/oolite` (the pinned `git archive 7437f22 src Resources`, mounted read-only): **10 passed, the verbatim case ran** over all excerpts including E-204 to E-206.
- `docker compose run --rm lint`: clean. `docker compose run --rm typecheck`: clean.
- Acceptance greps: `export function buildSmuggler|buildCourierShort|buildCourierLong` 3; `Engine escorts spawn with the initial population (D-08)` once in PROJECT.md; `oolite-populator.js:1418-1430` and `Universe.m:2657-2665` in FIDELITY.md (row and excerpt); no `.missiles`, `.maxMissiles`, `Math.random` or `heatInsulation` in the non-comment lines of `traders.ts`; `populate.ts` untouched.

## Remote runs (snapshot 025723ce, the plan's last code commit)

- **Frozen 20-seed run (QUAL-12, `src/sim/world/population/` gained code):** `~/.claude/scripts/wegolite-remote-run.sh run --rm test npm run test:acceptance`: **exit 0, 89 s, 21 passed of 21** (epochs 1 to 20 each about 4.3 s, plus the pin). No change to the frozen thresholds or detectors. The new code is imported by no runtime path yet, so the run could not move; it is recorded because the plan asks for it.
- **Full Vitest suite (remote):** `~/.claude/scripts/wegolite-remote-run.sh run --rm test` (with coverage): **exit 0, 305 s, 315 test files passed and 1 skipped, 10,326 tests passed and 15 skipped**, the coverage thresholds held (`traders.ts` 99.1 % lines, `groups.ts` 92.3 %).

## Threat Flags

None. The builders are pure arithmetic over injected facts and records. T-22-30 mitigated: the courier's `heatInsulation` and the opportunist's `switchAI` live only in `POPULATOR_CUTS`; `PlannedPopShip` has no such member (asserted on every courier group) and the recorded courier leaders carry the write as a cut. T-22-31 mitigated: the contract test compares every new excerpt verbatim with the pinned tree. T-22-SC: no package installed.

## Known Stubs

`buildGroup` still returns an empty plan for the builders plan 22-09 adds (hunters, pirates, police); nothing imports `src/sim/world/population/` from a runtime path yet (plans 22-10 to 22-13 wire it). The station-launch branch of the three builders is parameter-only and unused by initial population (Phase 26). No `.planning/WINDOWS.md` entry was written: the file is shared across parallel executors and the stub closes in the next plan.

## Notes for the next plans

- `addTradeShip(role, facts, records, draws)` in `traders.ts` is the trade-side `_addShips(role, 1, pos, 0)`; plan 22-09's pirate and police builders need their own role handling (the pirate bounty roll, the police `wingman` role).
- The shipped smuggler hulls author no `escort_roles`; if a later catalogue gives one, the unit case in `traders.oracle.test.ts` already covers the bonus and the replay will cover the rest.
- CHANGELOG.md: no entry, the change is not user-visible (nothing imports the new modules yet).

## Self-Check: PASSED

Commits 4c94c575 and 025723ce are ancestors of HEAD (2 commits since the plan base d46c1142, measured with `git rev-list --count`); `git diff --name-only d46c1142..HEAD` lists only `traders.ts`, `groups.ts`, `traders.oracle.test.ts`, `FIDELITY.md` and `PROJECT.md` (before this SUMMARY), so `populate.ts`, `tests/oracles/`, STATE.md and ROADMAP.md are untouched. The plan-commit ledger file in the git dir could not be written from the worktree guard, so `plan_head_before` is the base the orchestrator named in the dispatch.
