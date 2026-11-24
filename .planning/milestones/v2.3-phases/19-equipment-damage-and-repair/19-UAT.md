---
status: complete
phase: 19-equipment-damage-and-repair
source: [19-VERIFICATION.md]
started: 2026-11-21T19:50:00Z
updated: 2026-11-22T14:20:39.250Z
---

## Current Test

[testing complete]

## Tests

### 1. Equipment damage in play, then F5 and the F3 repair
Fly a fight in the browser (hook-spawned shooter, `?test=1`) with the four damageable F3 items granted, take hits until the HUD prints `<item> damaged.`, then dock and open F3 and F5.
expected: The HUD message reads naturally and clears the previous one; F5 lists `<name> (damaged)` before the working items; F3 shows `Repair: <name>` at half price in the station palette; repairing it makes F5 list the item as working again.
result: pass

## Summary

total: 1
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
