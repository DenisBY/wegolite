---
status: testing
phase: 08-session-split-and-world-core
source: [08-VERIFICATION.md]
started: 2026-11-13T17:42:00Z
updated: 2026-11-13T17:42:00Z
---

## Current Test

number: 1
name: Manual play check queued by plan 08-12
expected: |
  Everything behaves as in release 0.3.0: the split and the world integration are behaviour-neutral (FOUND-10).
awaiting: user response

## Tests

### 1. Manual play check queued by plan 08-12
expected: Run `docker compose up preview`, open http://localhost:4173, start a New game, launch, fly, dock at Lave, buy and sell a good, open the chart and target Leesti, launch, jump, then F2 save, reload and Continue. Everything behaves as in release 0.3.0.
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
