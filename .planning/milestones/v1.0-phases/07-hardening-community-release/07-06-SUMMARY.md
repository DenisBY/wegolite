---
phase: 07-hardening-community-release
plan: 06
subsystem: docs
tags: [fidelity, oolite, provenance, contract-test, QUAL-06, D-22]

# Dependency graph
requires:
  - phase: 06-hyperspace-navigation-persistence
    provides: the hyperspace, arrival, countdown, chart and outfitting modules that FIDELITY.md cites
provides:
  - "FIDELITY.md: mechanic-to-source table with 26 rows, each with a Wegolite line, an Oolite line range at 7437f22, a fidelity status and a verbatim excerpt"
  - "tests/contract/fidelity.test.ts: structural checks on every run, and a verbatim check against the pinned Oolite tree when OOLITE_SRC is set"
  - "ASSETS.md provenance row for the quoted Oolite excerpts under GPL-2.0-or-later"
affects: [07-10 README pointer to FIDELITY.md, phase 7 verify-work]

# Actuals (#2632) — chars/4 over the realized files at HEAD (FIDELITY.md, fidelity.test.ts, ASSETS.md; 79,990 chars)
actuals:
  tokens: 19997
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Oolite citations as quoted excerpts with ### E-NN path:start-end headings, each checkable against a pinned upstream tree"
    - "Divergence rows quote the PROJECT.md Key Decisions text, and the contract test checks that the quote exists in PROJECT.md"

key-files:
  created:
    - FIDELITY.md
    - tests/contract/fidelity.test.ts
  modified:
    - ASSETS.md

key-decisions:
  - "Every divergence row quotes its PROJECT.md Key Decisions text verbatim; the contract test requires each quote to appear in PROJECT.md (9 divergence rows)"
  - "The witchpoint exit offset is a divergence because it draws from the seeded PRNG, though its distribution follows Oolite (PROJECT.md row 'Draw the arrival pose from the seeded PRNG at jump commit')"
  - "The planet row covers only the PlanetMix colour thresholds; the planet noise budget has no PROJECT.md row and is listed as an open item rather than marked faithful"
  - "The three-row state is its own commit (46eaffe) so each task commits atomically; b91327e completes the table"

patterns-established:
  - "Pattern 1: an excerpt heading is '### E-NN src/Core/<path>:<start>-<end>' followed by an objc block of at most 20 lines equal to that range"
  - "Pattern 2: the verbatim case is it.skipIf(no OOLITE_SRC), so an unmounted run reports skipped, never passed"

requirements-completed: [QUAL-06]

# Metrics
duration: unknown (start time not captured)
completed: 2026-11-08
status: complete

# Plan commit ledger (#3968). Base recovered from git history: the parent of the first plan commit (46eaffe^).
plan_head_before: 2b2d6844358ec67ed61b0cb471b54e85093687ca
plan_head_after: b91327e94163d5fb42564d2cea110a424f946e55

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "FIDELITY.md maps 26 Wegolite mechanics to their Oolite source at 7437f22, each with a fidelity status and a verbatim excerpt"
    requirement: "QUAL-06"
    verification:
      - kind: unit
        ref: "tests/contract/fidelity.test.ts#FIDELITY.md contract (QUAL-06, D-22)"
        status: pass
      - kind: other
        ref: "docker compose run --rm -v <git archive 7437f22 src, extracted>:/oolite:ro -e OOLITE_SRC=/oolite test npx vitest run tests/contract/fidelity.test.ts"
        status: pass
    human_judgment: true
    rationale: "The tests prove the citations, the excerpt text and the decision quotes. They do not prove that a 'faithful' status correctly reads Oolite, so a reviewer must check the classification."
  - id: D2
    description: "The contract test guards the Wegolite side on every run and the Oolite side when the pinned tree is mounted; without the tree the Oolite case reports skipped"
    requirement: "QUAL-06"
    verification:
      - kind: unit
        ref: "tests/contract/fidelity.test.ts#reproduces every excerpt verbatim at its cited lines of the pinned tree (OOLITE_SRC)"
        status: pass
    human_judgment: false
  - id: D3
    description: "ASSETS.md carries one provenance row for FIDELITY.md under GPL-2.0-or-later with the Oolite copyright holders"
    requirement: "QUAL-06"
    verification:
      - kind: unit
        ref: "tests/contract/fidelity.test.ts#records FIDELITY.md once in ASSETS.md under GPL-2.0-or-later"
        status: pass
    human_judgment: false
---

# Phase 7 Plan 6: Oolite fidelity map (FIDELITY.md) Summary

**FIDELITY.md maps 26 Wegolite mechanics to pinned Oolite 7437f22 lines with verbatim excerpts, records 9 divergences against PROJECT.md decisions, and a contract test checks both repositories**

## Performance

- **Duration:** not recorded (the executor did not capture a start time)
- **Started:** not recorded
- **Completed:** 2026-11-08 (last task commit 09:25 +0100)
- **Tasks:** 2 of 2
- **Files:** 3 (2 created, 1 modified)

## Accomplishments

- FIDELITY.md has 26 mechanic rows: 17 `faithful` and 9 `divergence`. Each row gives a `src/` Wegolite path and line, an Oolite `src/Core/...` range at 7437f22, a fidelity status and an excerpt id E-01 to E-26.
- Each excerpt is a `### E-NN src/Core/<path>:<start>-<end>` heading over an `objc` block. The longest excerpt is 19 lines, under the 20-line limit.
- Every divergence quotes its PROJECT.md Key Decisions text. The contract test checks that each quote is present in `.planning/PROJECT.md`.
- `tests/contract/fidelity.test.ts` runs 8 structural cases on every unit run. The verbatim case runs only when `OOLITE_SRC` is set, and otherwise reports skipped.
- The verbatim case passed with the pinned tree (`git archive 7437f22 src`, mounted read-only). A negative control that changed one cited line (`PlayerEntity.m:6469`) made E-08 fail, so the case is live.
- ASSETS.md has one row for FIDELITY.md: code-excerpts, Oolite 1.93.1-241 @ 7437f22, GPL-2.0-or-later, with the Oolite copyright holders.

## Task Commits

1. **Task 1: end-to-end record with three mechanics, an ASSETS row and the contract test** - `46eaffe` (docs)
   - Rows: market quantity and price (E-01), chart distance (E-02), witchpoint exit offset (E-03).
   - Committed as the three-row state. The structural and verbatim runs both passed on it.
2. **Task 2: complete mechanics table with every divergence named** - `b91327e` (docs)
   - Adds 23 rows (E-04 to E-26) covering flight, torus, launch, aegis, layout, docking, cargo, trade, outfitting, hyperspace, countdown, blockage, chart and planet colour.

**Plan metadata:** committed in the completion commit that records this SUMMARY, STATE.md and ROADMAP.md.

## Files Created/Modified

- `FIDELITY.md` - the mechanic table, 26 excerpts, attribution, and an open-items list.
- `tests/contract/fidelity.test.ts` - SPDX header, doc comment on the two modes, 8 structural cases and 1 verbatim case.
- `ASSETS.md` - one new row for FIDELITY.md. Prettier realigned the whole table, which accounts for the large diff (181 lines changed, 90 removed).

## Verification

| Command | Result |
| --- | --- |
| `docker compose run --rm test npx vitest run tests/contract/fidelity.test.ts tests/compliance-assets.test.ts tests/compliance.test.ts` | pass: 36 passed, 1 skipped (verbatim, no OOLITE_SRC) |
| Same, with `-v <scratch archive of 7437f22 src>:/oolite:ro -e OOLITE_SRC=/oolite` | pass: 37 passed across the three files |
| Negative control: `launchRoll = -flightRoll` changed in the archive copy | fail, as intended: E-08 mismatch |
| `docker compose run --rm lint` (ESLint and `prettier --check .`) | pass, exit 0 |
| `docker compose run --rm test` (full unit suite) | pass: 93 files, 1163 passed, 1 skipped |
| `rg -c "^### E-" FIDELITY.md` | 26 (acceptance: at least 20) |
| `rg -c "\| divergence:" FIDELITY.md` | 9 (acceptance: at least 8) |
| `rg -ci "safari\|webkit" FIDELITY.md` | 0 (no match) |
| `rg -c "7437f22" FIDELITY.md` | 4 (acceptance: at least 2) |
| `rg -c "^\| FIDELITY\.md " ASSETS.md` | 1 |
| Task 1 state (3 rows) | 3 excerpt headings; structural and verbatim pass |

## Decisions Made

- Each divergence row quotes its PROJECT.md text, and the test checks the quote. This enforces the success criterion "every divergence names its PROJECT.md decision", which the plan did not otherwise check.
- The witchpoint offset is a divergence: the seeded PRNG replaces Oolite's Ranrot stream. The distribution follows Oolite.
- Rows the table marks `faithful` were checked against the cited Oolite lines and against the Wegolite line that implements the rule. Parts I did not confirm are qualified in Open Items rather than left as silent `faithful` claims.
- The planet row covers only the PlanetMix colour thresholds (E-26). The noise budget is an open item.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Divergence rows verified against PROJECT.md text**
- **Found during:** Task 1 (contract test design)
- **Issue:** The plan required that each divergence name its PROJECT.md row, but its test list checked only the `divergence:` prefix. A divergence could cite an invented decision.
- **Fix:** The test requires the quoted decision text to appear verbatim in `.planning/PROJECT.md`.
- **Files modified:** `tests/contract/fidelity.test.ts`
- **Verification:** all 9 divergence quotes pass; the test is part of the 8 structural cases.
- **Committed in:** `46eaffe` (test) and `b91327e` (table)

**2. [Process] Plan commit ledger was not written before the first commit**
- **Found during:** completion
- **Issue:** Protocol 0c asks for a ledger file before the first task commit. The executor did not write it.
- **Fix:** The base was recovered from git history as the parent of the first plan commit (`46eaffe^` = `2b2d684`). `commits: 2` is measured from that base.
- **Files modified:** none.

**3. [Environment] Verbatim archive path**
- **Issue:** The plan's verify commands use `/tmp/oolite-7437f22`. The session rule is to keep scratch files in the session scratchpad.
- **Fix:** The archive was extracted under the session scratchpad and mounted from there. The mount semantics and the test are unchanged.
- **Files modified:** none in the repo.

**4. [Expected side effect] Prettier realigned ASSETS.md**
- **Issue:** The new row's URL is wider than the existing columns, so Prettier rewrote the whole table.
- **Fix:** Accepted, because the plan asked for Prettier to realign the table. Only the new row is content.
- **Files modified:** `ASSETS.md`

**Total deviations:** 4 (1 Rule 2 addition, 3 process or environment notes). **Impact on plan:** none on the goals. The table, excerpts, test and ASSETS row are as specified.

## Oolite Citation Comments Found Off at 7437f22

The plan asked for corrected citations to be listed here. Source comments were not edited.

- `src/render/planet-noise.ts:111` cites `OOPlanetTextureGenerator.m:662` for "q can range between -2 to +2". At 7437f22 the statement is at line 672. Line 662 is an `else`. The correct citation is `OOPlanetTextureGenerator.m:672`, and E-26 quotes that line.
- `src/sim/hyperspace/arrival.ts` cites `OOQuaternion.m:81` for the all-zero forward fallback. At 7437f22, line 81 is a closing brace. The fallback line was not located, so this citation is still unverified.
- `src/sim/hyperspace/arrival.ts` cites `Universe.m:8785-8787` for the tilt draw. This was not checked and remains unverified.

Spot-checked and correct at 7437f22: `legacy_random.h:154-160`, `ShipEntity.h:109`, `OOCommodities.m:261-278` and `431-452`, `OOCommodities.h:29`, `Entity.h:49`, `PlayerEntity.m:6913-6928`, `DockEntity.m:727`, `DockEntity.m:752`, `DockEntity.m:691`, `DockEntity.m:711`, `PlayerEntity.h:1294-1297`, `PlayerEntity.m:9326-9330`, `PlayerEntity.m:9410`, `PlayerEntity.m:10074-10124`, `OOPlanetEntity.m:133`, `OOPlanetTextureGenerator.m:408`, `Universe.m:8776`.

## Issues Encountered

- **STATE position not advanced.** `state.advance-plan` was not run. Phase 7 has no SUMMARY for plan 07-05, and the counter reads plan 5. Advancing it now would move the counter to 6 and point the next run past the unexecuted 07-05. The orchestrator should decide the order.
- **Planet noise budget has no Key Decisions row.** `src/render/planet-noise.ts:40-48` fixes six surface octaves, one relief tap, one cloud octave and nine evaluations. No excerpt covers Oolite's noise generator, and no PROJECT.md row records the budget.
- **PROJECT.md row 117 misstates Oolite.** The row "Cap missiles at 3 and passenger berths at 7" says Oolite's Cobra allows four starting missiles, citing `PlayerEntity.h:284-286`. At 7437f22 the header gives `PLAYER_STARTING_MAX_MISSILES 4` (the pylon maximum) and `PLAYER_STARTING_MISSILES 3`. The divergence is the fourth pylon, not the starting count. The decision row needs correcting.
- **Tooling.** The codebase-memory MCP tools were not in this executor's tool set. Lookups used `rg` and `git grep` against the pinned Oolite tree.

## Open Items

Recorded in `FIDELITY.md` under "Open items":

- Planet noise budget (E-26 covers thresholds only).
- Aegis 500 m surface clause (E-09). It can change the result only for a planet radius below about 250 m, and the v1 layouts were not checked against all 2,048 systems.
- Torus mass lock, station branch (E-07 quotes the planet branch only).
- Docking computer TL station override (E-13). The pinned data gives no station an `equivalent_tech_level`, so the override never applies to the v1 Coriolis.
- Missile cap wording (E-18), as described above.
- Missile trade-in price factor (E-17). The Coriolis defaults to 1.0, so no scaling applies in v1.

## Known Stubs

None.

## Threat Flags

None. T-07-16 (attribution) is mitigated by the attribution paragraph and the ASSETS row. T-07-17 (citation drift) is mitigated by the verbatim check against the pinned tree.

## Self-Check: PASSED

- `FIDELITY.md`, `tests/contract/fidelity.test.ts` and `ASSETS.md` exist on disk.
- Commits `46eaffe` and `b91327e` exist on `main`. `git rev-list --count 2b2d684..HEAD` = 2.
- The test suite and lint results in the Verification table are from this session.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 07-10 adds the README pointer to FIDELITY.md.
- Before the planet and aegis rows can be claimed in full, the PROJECT.md row 117 correction and a Key Decisions entry for the planet noise budget are needed.
- Plan 07-05 has no SUMMARY and remains unexecuted; the STATE position was left unchanged for that reason.

---
*Phase: 07-hardening-community-release*
*Completed: 2026-11-08*
