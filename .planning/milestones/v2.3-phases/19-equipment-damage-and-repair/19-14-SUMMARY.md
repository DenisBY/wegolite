---
phase: 19-equipment-damage-and-repair
plan: 14
subsystem: docs
tags: [fidelity, key-decisions, contract-test, phase-gate, oolite-fidelity]
requires:
  - phase: 19-equipment-damage-and-repair
    provides: "19-02 stream, factor and cap rows; 19-12 repair and F5 rows; 19-13 CBT-08 twin; 19-15 in-use tripwire; 19-06 legacy-alias tripwire"
provides:
  - "FIDELITY.md rows and verbatim excerpts E-154 to E-170 (ten divergence rows, seven faithful rows)"
  - "eight constants-ledger rows and five Open items for Phase 19"
  - "the station-palette Key Decisions row (owner decision 2026-11-18) and the corrected divergence-rule outcome cell"
  - "the Phase 19 release gate record: remote verify-full green"
affects: [phase-19-verification, phase-19-code-review]
key-files:
  created: []
  modified:
    - FIDELITY.md
    - .planning/PROJECT.md
    - tests/e2e/station.spec.ts
key-decisions:
  - "Keep Wegolite's station and chart colours instead of Oolite's GUI palette (owner decision 2026-11-18, quick 261118-cyo): recorded as a Key Decisions row, quoted by FIDELITY E-166"
requirements-completed: [CBT-08, CBT-12, SAVE-09]
status: complete
actuals:
  tokens: 38000
  tasks: 3
  commits: 3
plan_head_before: c0b6428098021cce95d34fac337b725b641c91e0
plan_head_after: 75de63c689fd69544e505aafb5e435807f93c5ac
completed: 2026-11-21
---

# Phase 19 Plan 14: FIDELITY rows, Key Decisions and the phase gate Summary

Every Phase 19 mechanic is now mapped to the Oolite lines it follows, each excerpt copied from the pinned `7437f22` tree, ten divergences are recorded with their Key Decisions quote and the reviewers' agreement, and the phase passes the remote `verify-full` gate.

## What was built

- **FIDELITY.md rows and excerpts E-154 to E-170** (17 rows, 17 excerpts, none over 20 lines, each excerpt generated from the pinned tree by script, never typed). The new rows fit the table's existing column widths, so the diff is insertions only.

| Id | Mechanic | Verdict |
| --- | --- | --- |
| E-154 | laser hit's internal-damage loop (`PlayerEntity.m:5683-5698`) | divergence: stateless per-tick stream |
| E-155 | collision scrape's loop (`:5746-5752`) | divergence: the stream |
| E-156 | `n_considered`, the die, the cargo branch (`:6097-6116`) | divergence: the stream |
| E-157 | damageable count, odds, weighted pick (`:6123-6142`) | divergence: the stream, float64 sums |
| E-158 | damaged item leaves the installed list, 4.5 s message (`:6154-6171`) | faithful (representation note in the Mechanic cell) |
| E-159 | cosmetic branch and `ship_trade_in_factor` (`:6179-6184`) | divergence: not ported, constant 95 |
| E-160 | damage probability and `canBeDamaged` (`OOEquipmentType.m:503-521`) | faithful |
| E-161 | repair price, half (`:9115-9119`) | faithful |
| E-162 | repair one tech level lower (`:8270-8272`) | faithful |
| E-163 | F3 repair row, repair time (`:8403-8410`) | divergence: no repair time |
| E-164 | F3 repair detail (`:8568-8572`) | faithful |
| E-165 | F5 text for a damaged item (`:7200-7212`) | divergence: `(damaged)` for `(N/A)` |
| E-166 | F3 repair-row colour (`:8411-8411`) | divergence: station palette |
| E-167 | the loop's iteration cap (`:5746-5752`) | divergence: at most 256 iterations |
| E-168 | F5 damaged first (`:7238-7240`) | faithful |
| E-169 | order within F5's damaged group (`:7156-7156`) | divergence: damage order |
| E-170 | the F3 label's `" %@ "` wrapper (`:8377-8377`) | faithful |

- Every one of the ten divergence cells quotes an exact Key Decisions substring as its first double-quoted string, followed by `Reviewers: Fable, Kimi K3.1 Pro and Qwen4 Max agree (19-REVIEWS.md)` (the Consensus Summary of `19-REVIEWS.md`, verdict table D1 to D5, all AGREE, the cap recorded as D1's condition). E-163's quote rests only on the install-delay row, with the colour split out into E-166, as the plan requires.
- **Constants ledger** (8 rows): the gate mask 31, the factor 95, the mass term 21, `n_considered` 38 and 53, the repair price (50 %, rounded up) and tech level (minus 1), the 4.5 s HUD messages, `MAX_INTERNAL_DAMAGE_ROLLS` 256 (Oolite: uncapped, divergence E-167) and the damage purpose code 5 (no Oolite counterpart), each with its pinning test file.
- **Open items** (5): the D-06 in-use clauses (todo and tripwire named), hull wear (todo and tripwire), the unported misjump caller `PlayerEntity.m:6796`, the repair-row colour (points at E-166 and the palette todo without repeating the quote), and the `_DAMAGED`-key and script-event representation, with a note that the code review re-checks the stream and the cap.
- **`.planning/PROJECT.md`**: a new Key Decisions row `Keep Wegolite's station and chart colours instead of Oolite's GUI palette (owner decision 2026-11-18, quick 261118-cyo)` with the `Reviewers:` field; the divergence-rule row's outcome cell now ends with the single first instance (F5 `(damaged)` with damage order, FIDELITY E-165 and E-169) and says `Repair: X` is Oolite's own rendered text, not a divergence (owner, 2026-11-21, after the Phase 19 plan check). Decision text and first column untouched.

## Verification

- `tests/contract/fidelity.test.ts`, both modes, run after Task 1 and after Task 2: always-on mode 8 passed, 1 skipped (the verbatim case); verbatim mode (`OOLITE_SRC` at `git archive 7437f22 src` extracted to `/tmp/oolite-7437f22`) 9 passed, 0 skipped.
- All plan acceptance greps met: 17 excerpt headings, E-166 once, E-167 to E-170 four, both F5 rows quote the concrete F5 decision, E-167's cap quote, `MAX_INTERNAL_DAMAGE_ROLLS` in two lines, the outcome-cell phrases, the palette row once, `Reviewers:` on 10 FIDELITY and 6 Key Decisions rows, no `Reviewers: PENDING`, `"Repair: X" with a space` absent, no Cyrillic.
- `docker compose run --rm lint`: clean (eslint and prettier). `docker compose run --rm test npx vitest run tests/guards tests/contract`: 23 files, 363 passed, 1 skipped (always-on contract mode; the hull-wear, in-use, legacy-alias, damageable-equipment, collision-player-death, sim-purity and determinism-ban guards are in that set).
- `docker compose run --rm test` (full, coverage on): 280 files, 7,332 passed, 10 skipped, exit 0, no coverage-threshold error.
- NPC scope check: `git diff --name-only bba4068..HEAD -- src/sim/npc src/sim/world src/content/generated/ships-npc.json` prints nothing, so the 20-seed acceptance run is not required.
- **Phase gate, remote `verify-full`:**
  - Run 1 (snapshot `047eaa4`): `exit=1 elapsed=903s snapshot=047eaa4`. 146 Playwright specs passed, 1 failed: `tests/e2e/station.spec.ts:285` (see Deviations). All unit, typecheck, lint, drift and build steps before the browser suite passed (280 files, 7,332 tests).
  - Run 2 (after the fix, snapshot equals HEAD `75de63c`): `exit=0 elapsed=929s snapshot=75de63c`. 280 files, 7,332 passed, 10 skipped; 147 Playwright specs passed (13.0 min), plus the 2 `hyperspace-failure` specs of the second Playwright project. None of the known flakes (`launch.spec.ts:129`, `save-load.spec.ts:634`, `textures.test.ts`) occurred.
- No twin hash or literal moved in this plan (it changes no code).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The station spec's expected economy-probe key list was stale**
- **Found during:** the phase gate (remote `verify-full` run 1)
- **Issue:** `tests/e2e/station.spec.ts:340` asserts the exact key set of `after.economy`. Plan 19-09 added `WegoliteEconomyProbe.damagedEquipment`, and this assertion was not updated there, so the release gate failed with `+ "damagedEquipment"` as the only difference. It is not a known flake; it fails deterministically.
- **Fix:** added `"damagedEquipment"` to the expected list (one line, the probe is correct). This file is outside the plan's declared `files_modified`, which is why it is flagged here: the gate could not pass without it, and the fix belongs to Phase 19's own change.
- **Files modified:** `tests/e2e/station.spec.ts`
- **Commit:** `75de63c`

Otherwise the plan executed as written. The tracer (Task 1) was run end to end in both contract modes before Task 2 expanded it.

## Findings for the reviewers

- Phase 19 earlier waves ran only the fast `verify` subset (the station spec runs in `verify-full` only), which is how the stale probe-key list in `tests/e2e/station.spec.ts` reached the phase gate. Worth a look in the phase verification whether other full-suite-only assertions pin a probe shape.
- E-154 and E-155 share the one ledger call site `src/sim/combat/ledger.ts:221` (the table allows one Wegolite cell per row); E-163 and E-170 point at the repair label template and its wrapper in `src/ui/station-model.ts`.
- The phase code review (`19-REVIEW.md`) should re-check the 256-iteration cap in particular, as `19-REVIEWS.md` records Kimi's agreement on D1 as conditional on the cap's own record (E-167, the cap Key Decisions row and the ledger row now exist).

## Known Stubs

None.

## Threat Flags

None. T-19-23 (a silent divergence or an excerpt that is not Oolite's text) is mitigated: the contract test passes in both modes, every divergence quotes an exact Key Decisions substring, and the open items list what is not ported.

## Self-Check: PASSED

- `FIDELITY.md`, `.planning/PROJECT.md` and `tests/e2e/station.spec.ts` exist and carry the changes above.
- Commits `e861c4e`, `047eaa4` and `75de63c` are ancestors of HEAD; `commits: 3` is measured from the ledger (`rev-list c0b6428..75de63c`), the SUMMARY commit follows.
