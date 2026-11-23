---
status: testing
phase: 20-player-death-and-game-over
source: [20-VERIFICATION.md]
started: 2026-11-23T21:00:00Z
updated: 2026-11-23T21:00:00Z
---

## Current Test

number: 1
name: Explosion, aft view and the 5 s fade to grey (Chromium and Firefox)
expected: |
  The explosion reads as an explosion (the bursts last about 1.5 s and were not captured in the live check). The one flash does not hide the bursts. The aft view and the fade look right. Earlier wreckage keeps drifting with no time limit.
awaiting: user response

## Tests

### 1. Explosion, aft view and the 5 s fade to grey (Chromium and Firefox)

Die in flight (hook-spawned Viper or a ram) and watch the explosion, the aft view and the 5 s fade to grey in Chromium and Firefox. Look for the player's eight bursts (four small, four big, one flash) and for wreckage from earlier kills still drifting and tumbling.

expected: The explosion reads as an explosion (the bursts last about 1.5 s and were not captured in the live check). The one flash does not hide the bursts. The aft view and the fade look right. Earlier wreckage keeps drifting with no time limit.
result: [pending]

### 2. Legibility and wording of the four game-over lines

Read the four game-over lines (Game Over, cause, Score, Press Space) over a bright station face and again at the end of the 5 s fade.

expected: All four lines stay legible, in particular the cause line and the Press Space prompt. The wording and layout are acceptable. (The live check showed "Destroyed by GalCop Viper" partly lost against a lit station; 20-UI-REVIEW.md scores 16/24 and suggests a dark translucent backing or text shadow, keeping the fade.)
result: [pending]

### 3. Idle launch rams the navigation buoy (traffic on)

With traffic on (the production default; a `?test=1` run needs `&traffic=1`), launch straight, touch nothing and wait about a minute.

expected: The ship rams the navigation buoy as 20-01 measured and pinned it, and the player dies. Both the idle-launch Vitest pin and the browser agree.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
