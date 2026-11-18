---
phase: quick
plan: 261118-ioj
subsystem: app/hints
tags: [hud, hints, first-use, settings-schema]
requires: [261118-cyn (aegis hint plumbing), 261118-ih8]
provides: [gauge hints for LT, FWD/AFT, E1-E4, CT, FUEL]
affects: [src/app/hints.ts, src/settings/schema.ts, src/app/session/render-driver.ts]
key-files:
  modified:
    - src/settings/schema.ts
    - src/app/hints.ts
    - src/app/session/render-driver.ts
    - tests/app/hints.test.ts
    - tests/settings/schema.test.ts
    - CHANGELOG.md
    - .planning/PROJECT.md
decisions: [D-01 to D-08 of the plan, unchanged]
requirements: [FLGT-05]
status: complete
commits: 3
plan_head_before: 20a820703d6a7945a5ee6413b3e8aacd1468b6b6
plan_head_after: d2a91259bf57831fff9f5c5c731db36080bc128f
actuals:
  tasks: 2
  commits: 3
completed: 2026-11-18
---

# Quick 261118-ioj: First-use hints that explain the HUD gauges Summary

One-time Wegolite-only hints explain LT, FWD/AFT, E1-E4, CT and FUEL the first time each drawn gauge crosses a fixed threshold. They are read from the bars the HUD drew this frame and persisted in `hintsSeen`.

BASE (starting commit): `20a8207`.

## The five hints

| Id | Legend | Threshold (drawn gauge) | Text |
|----|--------|-------------------------|------|
| laserTemp | LT | `>= 0.25` (about 8 s of pulse fire) | LT: laser temperature — ease off before it overheats |
| shields | FWD/AFT | lower shield `< 1` | FWD/AFT: forward and aft shields — they recharge |
| energy | E1-E4 | mean of the four banks `< 0.9` | E1-E4: energy banks — they recharge over time |
| cabinTemp | CT | `>= 0.3` (new game reads 0.234) | CT: cabin temperature — hits past the shields heat it |
| fuel | FUEL | tank `< 1` in flight (new game: first frame after the first jump) | FUEL: hyperspace fuel — refuel when docked |

Offer order when two trigger on the same frame (one per frame): laserTemp, shields, energy, cabinTemp, fuel. Every predicate is false for NaN. Hints are shown in flight only, never docked or launching, are marked seen when shown, and post through the existing `messages.enqueue(hint, MESSAGE_DURATION_SECONDS)` path.

## Skipped and refined

- ALT and MISS: no hint. Both gauges are fixed placeholders in `drawHud` (ALT 0.92, pylons always three loaded) (D-02). Recorded in PROJECT.md.
- D-06: the CT text does not say "keep away from the sun" (owner's proposal); Wegolite has no sun heat, only energy damage past the shields heats the cabin.
- D-07: energy threshold 0.9 instead of "below full" (a pulse shot is 0.3 % of the banks and refills in 0.2 s).
- D-08: the FUEL moment is the first in-flight frame with the gauge below 1.
- No show-hints toggle exists, so the persisted `hintsSeen` list is the off switch. 11 of 16 ids used (`MAX_HINTS_SEEN` unchanged); a stored blob with only the six earlier ids still validates.

## Reachability note

The FWD/AFT and CT hints, and E1-E4 with the default pulse laser, fire only when the player takes damage. Nothing damages the player in ordinary play yet (Phase 17 keeps NPCs peaceful, Phase 18 adds collisions). The hints are live now and fire when damage first arrives. Unit tests drive the controller directly.

## Commits

- `f690e77` feat(quick-261118-ioj): one-time hint that explains the LT gauge (tracer: schema, `HintGauges`/`hintGauges`, render driver wiring, LT hint, tests)
- `68ba214` feat(quick-261118-ioj): one-time hints for the FWD/AFT, E1-E4, CT and FUEL gauges
- `d2a9125` docs(quick-261118-ioj): record the HUD gauge hints (CHANGELOG `[Unreleased]` Added, PROJECT.md Key Decisions row)

Tracer gate: the Task 1 automated verify (hints + schema tests, typecheck) passed end to end before the Task 2 expansion.

## Gate results

| Gate | Where | Result |
|------|-------|--------|
| `docker compose run --rm test` | local Docker | green (exit 0, no failures) |
| `docker compose run --rm lint` | local Docker | green (eslint + prettier) |
| `docker compose run --rm typecheck` | local Docker | green |
| `run --rm verify` | remote, snapshot `d2a9125` | exit=0, elapsed 148 s, 27 e2e smoke specs passed |
| `run --rm e2e` hyperspace.spec.ts + combat.spec.ts (extra run) | remote, snapshot `d2a9125` | exit=0, elapsed 95 s, 4 passed |

No spec needed a change: no gauge hint displaced an expected message row. `git diff --name-only 20a8207 -- src/render/hud` is empty.

## Deviations from Plan

None - plan executed exactly as written. The Task 1 and Task 2 hint tests were written first and confirmed RED (4 and 12 failures) before the implementation.

## Known Stubs

None added. (ALT and MISS placeholders in `drawHud` pre-date this task; a pending todo for wiring the ALT bar already exists.)

## Threat Flags

None. New ids enter only through the `HintId` union and `HINT_IDS` allowlist (T-ioj-01); predicates are NaN-safe, covered by tests (T-ioj-02).

## Self-Check: PASSED

- `hintGauges(` appears once in `src/app/session/render-driver.ts`; commits f690e77, 68ba214, d2a9125 are ancestors of HEAD.
