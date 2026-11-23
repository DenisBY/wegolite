---
status: complete
phase: 20-player-death-and-game-over
source: [20-VERIFICATION.md]
started: 2026-11-23T21:00:00Z
updated: 2026-11-23T21:31:37.645Z
---

## Current Test

[testing complete]

## Tests

### 1. Explosion, aft view and the 5 s fade to grey (Chromium and Firefox)

Die in flight (hook-spawned Viper or a ram) and watch the explosion, the aft view and the 5 s fade to grey in Chromium and Firefox. Look for the player's eight bursts (four small, four big, one flash) and for wreckage from earlier kills still drifting and tumbling.

expected: The explosion reads as an explosion (the bursts last about 1.5 s and were not captured in the live check). The one flash does not hide the bursts. The aft view and the fade look right. Earlier wreckage keeps drifting with no time limit.
result: issue
reported: "Shot down all 3 flyers (spawnTestFlyers), not one of them dropped a plate. On my death everything froze, even the space dust turned into streaks instead of dots." (translated from Russian; screenshot attached in chat showed the game-over lines over a starfield with frozen dust streaks. Earlier in the same session a spawnTestShooter Viper kill did drop one plate.)
note: "The flash at my death is quick and hard to make out, but it looks fine." (translated; the explosion itself is accepted, the issue is the frozen scene and dust, and the missing flyer wreckage)
severity: major

### 2. Legibility and wording of the four game-over lines

Read the four game-over lines (Game Over, cause, Score, Press Space) over a bright station face and again at the end of the 5 s fade.

expected: All four lines stay legible, in particular the cause line and the Press Space prompt. The wording and layout are acceptable. (The live check showed "Destroyed by GalCop Viper" partly lost against a lit station; 20-UI-REVIEW.md scores 16/24 and suggests a dark translucent backing or text shadow, keeping the fade.)
result: issue
reported: "Here it is against the sun" (translated; screenshot attached in chat: all four lines in light grey over the white sun disc are barely readable, especially the Score and Press Space lines. Over a black starfield, in the earlier screenshot, the lines read fine. In both screenshots the credits glyph after "100.0" looks clipped at the right edge.)
severity: minor

### 3. Idle launch rams the navigation buoy (traffic on)

With traffic on (the production default; a `?test=1` run needs `&traffic=1`), launch straight, touch nothing and wait about a minute.

expected: The ship rams the navigation buoy as 20-01 measured and pinned it, and the player dies. Both the idle-launch Vitest pin and the browser agree.
result: pass
note: "Screenshot showed the game-over view with the cause line 'Collided with Navigation Buoy' after an idle launch."

## Summary

total: 3
passed: 1
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-20-1
  truth: "On player death the explosion plays, the view turns aft and fades to grey over 5 s, and wreckage from earlier kills keeps drifting and tumbling with no time limit."
  status: failed
  reason: "User reported: shot down all 3 flyers, none dropped a plate; on death everything froze, even the space dust turned into streaks instead of dots."
  severity: major
  test: 1
  artifacts: []
  missing: []

- gap_id: G-20-2
  truth: "All four game-over lines stay legible over any background, including a bright sun or a lit station face, through the 5 s fade."
  status: failed
  reason: "User reported: against the sun the light-grey lines are barely readable (screenshot); the credits glyph after the score also looks clipped."
  severity: minor
  test: 2
  artifacts: []
  missing: []
