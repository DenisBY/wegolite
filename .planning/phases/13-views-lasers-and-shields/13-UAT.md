---
status: testing
phase: 13-views-lasers-and-shields
source: [13-VERIFICATION.md]
started: 2026-11-15T00:00:00Z
updated: 2026-11-15T12:00:00Z
---

## Current Test

number: 2
name: Fire each laser type (buy at F3) and watch the shot
expected: |
  A 1-px line from the mount to the hit point or full range is visible for about 0.09 s, with a sensible colour per laser (pulse red, beam yellow, mining blue, military magenta)
awaiting: user response

## Tests

### 1. Fly in each of the four views (1/2/3/4) in a real WebGL session
expected: Fore, aft, port and starboard read correctly: not mirrored, not clipped by the Cobra hull or the near plane, correct cockpit offset
result: pass

### 2. Fire each laser type (buy at F3) and watch the shot
expected: A 1-px line from the mount to the hit point or full range is visible for about 0.09 s, with a sensible colour per laser (pulse red, beam yellow, mining blue, military magenta)
result: [pending]

### 3. Press R with a ship in the sights (traffic on) in several window shapes
expected: The ident frame sits on the locked ship and the message line reads 'Ident system locked onto <name>.'
result: [pending]

### 4. F3 > a laser: read the facing prompt
expected: The facing prompt appears on its own line (CSS white-space: pre-line)
result: [pending]

## Summary

total: 4
passed: 1
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
