---
phase: 10-ship-mass
plan: 03
subsystem: hyperspace-blockage
tags: [ship-mass, hyperspace, blockage, fidelity, owner-decision]

requires:
  - phase: 10-ship-mass
    provides: "Coriolis station mass 515,483,904 compiled into ships-client.json (plan 10-02)"
provides:
  - "CORIOLIS_STATION_MASS = 515_483_904 in src/sim/hyperspace/countdown.ts, pinned equal to the compiled coriolis-station mass"
  - "Jump blockage radius 7,179.7 m (was 6,747.0 m); blockage tests re-pinned to 7,100 m and 7,300 m"
  - "PROJECT.md Key Decisions row 'Coriolis blockage mass:' (D-04), FIDELITY.md E-23 divergence, CHANGELOG Changed entry, amended ROADMAP criterion 3"
  - "Owner answers for the buoy mass home (buoy-client) and criterion 2 (criterion2-accept)"
affects: [10-04, 12-npc-traffic]

actuals:
  tokens: 9000
  tasks: 2
  commits: 1

key-decisions:
  - "D-04: jump blockage uses Oolite's computed Coriolis mass 515,483,904 (coriolis-computed)"
  - "D-05 amendment: the buoy entry with its computed mass goes into ships-client.json (buoy-client); plan 10-04 implements it"
  - "Criterion 2 reading accepted (criterion2-accept), revisable; real-Oolite check is a deferred follow-up"

requirements-completed: [DATA-11]

duration: 12min
completed: 2026-11-14
status: complete
plan_head_before: 49e69bbb27c798cea788b6ee3420fb7c12e55c25
plan_head_after: 809dcbcac09832cad0f7714dca5b0041b5cda2f4
commits: 1
---

# Phase 10 Plan 03: Coriolis Blockage Mass Summary

**Jump blockage now uses Oolite's computed Coriolis mass 515,483,904 (radius 7,179.7 m instead of 6,747.0 m), pinned to the compiled record by a test, with the owner's three answers recorded.**

## Owner answers (Task 1, checkpoint:decision, resolved before execution)

Owner answers: coriolis-computed, buoy-client, criterion2-accept

Date of the answer: 2026-11-14. The owner (speaking Russian) answered, verbatim:

1. D-04 Coriolis mass: "let's go with computed" (translated) -> option id `coriolis-computed` (CORIOLIS_STATION_MASS = 515,483,904; blockage tests re-pinned to 7,100 m blocks and 7,300 m does not; CHANGELOG Changed entry; ROADMAP criterion 3 and the Key Decision wording amended).
2. Buoy mass home (D-02 against D-05): "let's do it on the client" (translated) -> option id `buoy-client` (the `buoy` entry with its mass goes into ships-client.json; this amends D-05, recorded in PROJECT.md).
3. Roadmap criterion 2 reading: "let's accept if it is easy to change later" (translated) -> option id `criterion2-accept`. Accepted on condition that it is easy to change later.

**Buoy id for plan 10-04: `buoy-client`.** Plan 10-04 adds the `buoy` entry, with its computed mass 698,691.1875, to ships-client.json.

Criterion 2 is revisable. A real-Oolite check (for example a tiny out-of-repo test script logging `ship.mass` of the Coriolis station and the buoy to Latest.log) is a deferred follow-up task after the phase. If it disagrees, only the `CORIOLIS_STATION_MASS` constant, its test pins and the FIDELITY.md ledger paragraph change. This is recorded in the PROJECT.md row and the ledger. No blocker for phase verification.

## Accomplishments

- `CORIOLIS_STATION_MASS` is 515_483_904 with a doc comment naming its source (ShipEntity.m:417-419, 2034-2041, ship-mass.ts) and the Key Decision; the header's outdated buoy sentences now say blockage stays Coriolis-only until Phase 12 and the dodecahedron and icosahedron stations have no mass (D-03).
- tests/sim/hyperspace-blockage.test.ts: mapping pin 515_483_904, a new case pinning the constant to the compiled `coriolis-station` mass in ships-client.json, and every distance re-pinned (7,100 m blocks, 7,300 m does not).
- PROJECT.md: new Key Decisions row "Coriolis blockage mass: ..." (both numbers, tolerance, owner choice, radius, missing runtime oracle, criterion 2 answer, pitfall 17 deferred to Phase 12, buoy amendment); one sentence appended to the 06-16 row's Outcome, Decision cell byte-identical.
- FIDELITY.md: E-23 becomes a divergence quoting the new title, E-22/E-23 line numbers updated (77 and 59), the ledger's blockage row holds the chosen value, and the criterion 2 paragraph carries the owner's answer. Prettier realigned the table padding, which accounts for most of the FIDELITY.md diff.
- CHANGELOG.md `Changed` entry; ROADMAP Phase 10 criterion 3 amended to "existing blockage tests pass after re-pinning to the chosen radius".

## Verification

- `docker compose run --rm test npx vitest run tests/sim/hyperspace-blockage.test.ts tests/sim/hyperspace.test.ts tests/sim/world tests/app/session tests/contract/fidelity.test.ts`: 27 files passed, 794 tests passed, 2 skipped (red before the constant change: 4 failed).
- `docker compose run --rm lint`: pass. `docker compose run --rm typecheck`: pass.
- All Task 2 acceptance greps for the coriolis-computed answer pass; src/sim imports nothing from content or tools (only a comment names tools/).

## Deviations from Plan

None - plan executed exactly as written. Task 1 was resolved by the owner before execution and was not re-asked.

## Issues Encountered

None. The browser fly-away margins and tests/e2e/hyperspace.spec.ts under the larger radius are plan 10-04's (T-10-12).

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

- Files modified exist; commit 809dcbc is an ancestor of HEAD.
