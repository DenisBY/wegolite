---
phase: 19-equipment-damage-and-repair
fixed_at: 2026-11-21T00:00:00Z
review_path: .planning/phases/19-equipment-damage-and-repair/19-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 19: Code Review Fix Report

**Fixed at:** 2026-11-21
**Source review:** .planning/phases/19-equipment-damage-and-repair/19-REVIEW.md
**Iteration:** 1

**Summary:**

- Findings in scope: 3 (CR-01, WR-01, IN-02, as set by the orchestrator)
- Fixed: 3
- Skipped: 0
- Not applied by decision: IN-01

## Fixed Issues

### CR-01: A zero-probability item inflates `damageableCounter`, so equipment is damaged too often

**Files modified:** `src/sim/combat/internal-damage.ts`, `src/app/session/step-options.ts`, `tests/sim/combat/internal-damage.test.ts`, `tests/sim/combat/internal-damage.property.test.ts`, `tests/app/session/step-options.test.ts`, `FIDELITY.md`
**Commit:** b7b9ae9
**Status:** fixed: requires human verification (logic change in the roll)
**Applied fix:** In `resolveInternalDamage`, `damageable` and `odds` now cover only items with `damageProbability > 0`, matching Oolite's `canBeDamaged` filter (`PlayerEntity.m:6119-6126`, `OOEquipmentType.m:512-520`). The pick loop is unchanged: it walks every item in order, uses the strict `>`, and a 0 adds nothing to it. The sanitiser is unchanged, so the module stays total on malformed input. The `step-options.ts` comment now says that a zero-probability key stays listed but never changes the roll. Test changes:

- The two tests that pinned the old behaviour now pin Oolite's: "odds of 0" now draws no pick, 2 draws instead of 3.
- New hand-derived cases with capacity 35 (considered 53). The bay with a docking computer is one slot: die 51 (reversed 1) makes no pick and does no damage in 2 draws, and die 52 (reversed 0) damages the docking computer in 3 draws. The bay alone makes no pick draw. These cases run as unit tests and again against the compiled catalogue in `step-options.test.ts`.
- A new seeded property (seed 20261923, 400 runs): removing every zero-probability item changes neither the events nor the draw count. Two counters keep it non-vacuous: runs that held zero-probability items (more than 50) and runs that also damaged something (more than 5).

All five new or changed cases fail on the pre-fix code and pass after the fix.

FIDELITY E-157: the row text now says the count and odds cover only `canBeDamaged` items, and its Wegolite line moved to `internal-damage.ts:201`. The upstream range 6123-6142 already quotes the `canBeDamaged` loop. The constants ledger has no slot-count text, so it needed no change. No twin literal moved: the CBT-08 fight and the cadence test grant no zero-probability item, and the tick-parity, cadence and remote combat spec all pass unchanged. No CHANGELOG change: the Unreleased "Added" entry already says the damage works "as in Oolite", and that is now accurate.

### WR-01: An in-flight damage commit rebuilds and renders the full station view for every event

**Files modified:** `src/app/session/station-controller.ts`, `tests/app/session/station-controller.test.ts`
**Commit:** 37fb48c
**Applied fix:** `commitProfile` calls `renderStation()` only when `ctx.core.state?.mode === "docked"`. In any other mode it calls only `syncEconomyProbe()`. I kept that call on purpose: `renderStation()` was the only in-flight path that published `economy.damagedEquipment`, and the CBT-08 e2e spec reads that field in flight. In flight, no model builder runs, so none can throw into `router.dispatch`, and a heavy scrape triggers no view rebuilds. Every other caller of `commitProfile` is either docked-only or calls `renderStation()` itself afterwards. New tests cover three cases. A docked commit renders. In flight and while launching, three commits publish three profiles and three probe syncs and never render. A refused commit calls nothing.

### IN-02: `MAX_SAVE_CHARS` comment states a bound that no saved blob can reach

**Files modified:** `src/persistence/save.ts`
**Commit:** e2f7fa3
**Applied fix:** The comment now calls 46,796 the schema-maxima bound that the limit is sized against, not a true upper bound of a parseable save. It also gives the reachable worst case under the combined 64-key rule: 40,605 characters (64 equipment, none damaged) or 40,604 (48 plus 16). I measured both with the test's own worst-case builder in a scratch Vitest under `/tmp`. This is a comment-only change.

## Not Applied

### IN-01: `internalDamageWork` guards states the compiled catalogue and the save validator already rule out

**File:** `src/sim/combat/internal-damage.ts:114-136`
**Reason:** Not applied, by decision: the sanitiser is deliberate totality. The module is kept total for fuzzing, and the property tests feed it hostile probabilities and duplicate keys.
**Original issue:** The dedupe and the probability sanitiser guard states that `profile.equipment` and the compiled catalogue already exclude.

## Verification

All gates ran in the main checkout (`/home/opencode/git/wegolite`, branch `main`, no worktree) or on the remote test machine against the committed snapshot `e2f7fa3`.

- Targeted Vitest after each fix (Docker): passed.
- `docker compose run --rm test` (full, with coverage floors): exit=0 elapsed=272s; 280 files, 7340 passed, 10 skipped.
- `docker compose run --rm typecheck`: exit=0 elapsed=17s.
- `docker compose run --rm lint`: exit=0 elapsed=64s.
- Remote `run --rm verify`: snapshot e2f7fa3, exit=0 elapsed=239s (Vitest 280 files / 7340 passed; e2e smoke 28 passed).
- Remote combat spec (`npm run build:e2e && npx playwright test tests/e2e/combat.spec.ts`): snapshot e2f7fa3, exit=0 elapsed=25s, 2 passed, including CBT-08 end to end. No twin literal moved, so nothing was re-pinned. I ran it because WR-01 touches the in-flight probe path.

---

_Fixed: 2026-11-21_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
