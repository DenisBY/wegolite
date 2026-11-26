---
status: testing
phase: 21-roster-state-shape-and-seams
source: [21-VERIFICATION.md]
started: 2026-11-26T08:17:31Z
updated: 2026-11-26T08:17:31Z
---

## Current Test

number: 1
name: Owner review of the 21-18 deferral (D-05 fix (2), variant-family instancing, skipped on 2026-11-26 by orchestrator decision while the owner was offline)
expected: |
  The owner either accepts that fix (1) alone meets D-05 (39 calls, 42 after a kill, upper bound 49, budget 50 unchanged) or asks for 21-18 to run. Either way, the tripwire (the withinBudget assertions in anarchy.spec.ts) and the todo 2026-11-26-npc-variant-family-instancing stay.
awaiting: user response

## Tests

### 1. Owner review of the 21-18 deferral (D-05 fix (2), variant-family instancing, skipped on 2026-11-26 by orchestrator decision while the owner was offline)
expected: The owner either accepts that fix (1) alone meets D-05 (39 calls, 42 after a kill, upper bound 49, budget 50 unchanged) or asks for 21-18 to run. Either way, the tripwire (the withinBudget assertions in anarchy.spec.ts) and the todo 2026-11-26-npc-variant-family-instancing stay. Note that the 60 Hz paced p95 cannot tell the fight from the baseline (16.70 ms for both); unpaced, the fight's p95 is 3.4 ms and the baseline's is 1.7 ms.
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
