---
status: testing
phase: 04-manual-docking
source:
  - 04-VERIFICATION.md
started: 2026-11-05T11:18:00Z
updated: 2026-11-05T11:18:00Z
---

## Current Test

number: 1
name: Bounce feedback feel
expected: |
  Launch, fly off-axis into the Coriolis, and observe the contact. A clear
  message, camera shake and red HUD frame appear, all clear within about
  0.5 s, and a second attempt is possible immediately.
awaiting: user response

## Tests

### 1. Bounce feedback feel
expected: Launch, fly off-axis into the Coriolis, and observe the contact. A clear message, camera shake and red HUD frame appear, all clear within about 0.5 s, and a second attempt is possible immediately.
why_human: Shake amplitude and flash feel are qualitative. Automation proves presence and expiry on the sim clock, not whether the feedback reads clearly.
result: pending

### 2. Docking-computer line, disabled state and Shift+C affordance
expected: Dock at Lave and inspect the docking-computer line, the disabled Buy control and the Controls screen. The line reads "Docking Computers — 1500.0 Cr (TL 9)", the refusal reads "Requires TL 9", the disabled control is visually distinct, and Controls tells the player the chord is Shift+C.
why_human: Layout, colour and discoverability are visual judgements. The current UI review reports the Controls label renders "C" rather than "Shift+C", the disabled Buy control looks active, and the reason sits in the label column.
result: pending

### 3. New game save deletion decision
expected: With a committed save, click New game once. Either a confirmation or one-slot backup protects the only save, or the project records an explicit product decision that one-click deletion is intended.
why_human: This is a product/UX decision, not a DOCK-01..07 functional assertion. The current path deletes the only save with no confirmation, undo or backup; the UI review rates it a blocking UX defect.
result: pending

### 4. Committed regression test for the disarmed tunnel-end clamp
expected: Add and run a committed test that places a disarmed in-flight ship past the 250 m tunnel end, calls `stepDocking`, and asserts the positional clamp, no bounce/docked/scrape event, and mode still `inFlight`.
why_human: No committed test exercises this behaviour. An ad-hoc Docker check passed on the verified tree, so the gap is regression coverage, not an observed product failure.
result: pending

### 5. Committed regression test for orientation preservation through a bounce
expected: Add and run a committed test that captures the orientation quaternion, places a straddle or hull contact, calls `stepDocking`, and asserts exactly one bounce, unchanged orientation and mode still `inFlight`.
why_human: No committed assertion exists for orientation preservation. An ad-hoc Docker check observed `unchanged: true`, so the gap is regression coverage, not an observed product failure.
result: pending

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps

<!-- Populated by /gsd-verify-work 04 if a UAT test fails. -->
