---
status: testing
phase: 14-npc-flight-and-steering-fidelity-gate
source: [14-VERIFICATION.md]
started: 2026-11-16T03:10:00Z
updated: 2026-11-16T03:10:00Z
---

## Current Test

number: 1
name: Owner ratifies or overturns the two panel-answered checkpoints (plans 14-17 and 14-19)
expected: |
  The owner reads 14-FIDELITY-REPORT.md (or accepts it on the panel's advice) and confirms the
  PROJECT.md row "Phase 14 oracle choice for the AI port". Ratified: the row becomes an owner decision
  and the phase status becomes passed. Overturned: the gaps the owner names become gap-closure plans
  and T-14-34 reopens.
awaiting: user response

## Tests

### 1. Owner ratifies or overturns the panel-answered checkpoints
expected: Plan 14-17 (acceptance, option-continue) and plan 14-19 (report accepted; oracle = dev-only differential harness with source-cited traces as per-role fallback; OOLITE_SRC mount kept; IN-02 and IN-04 stay todos) confirmed or overturned by the owner.
result: [pending]

### 2. Owner resolves or waives WINDOWS.md entry 3
expected: The vacuous stage-A assertion at tests/acceptance/detectors.test.ts:164-177 is fixed through option (c) (commit with the Detector-change-approved-by-owner trailer plus a full 20-epoch rerun) or waived explicitly. The entry blocks /gsd-ship while open.
result: [pending]

### 3. Owner triages the code review findings
expected: 14-REVIEW.md findings WR-01..WR-04 and IN-01..IN-06 (all open in 14-REVIEW-DISPOSITION.md) are fixed, deferred or waived. None blocks the phase goal.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
