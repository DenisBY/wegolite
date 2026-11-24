---
status: complete
phase: 20-player-death-and-game-over
source: [20-VERIFICATION.md]
started: 2026-11-23T21:00:00Z
updated: 2026-11-24T11:03:23.526Z
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

### 4. Re-test G-20-1: the coasting dead view (Chromium and Firefox)

Die in flight in Chromium and Firefox (a hook-spawned Viper's laser or a ram) and watch the dead view for the full 5 s fade and after it. Also die on the docking approach.

expected: The view looks aft and drifts away from the explosion at 160 m/s. The eight bursts and the flash read as an explosion. The dust streams as short lines toward the centre and never as still random dashes. Wreckage from earlier kills keeps drifting. The frame stays smooth (it now draws every frame). On the docking approach the camera passes through the station, as Oolite's does.
result: pass

### 5. Re-test G-20-2: the four lines over the sun and a lit station (Chromium and Firefox)

Die with the sun behind the text, and again with a lit station face behind it, in Chromium and Firefox. Read all four lines at the start of the fade and at the end of the 5 s fade.

expected: Game Over, the cause line, Score and Press Space read clearly in yellow on the dark panel, also after the fade to grey. Over black space the panel is barely visible. The credits sign after the score is a known, separately tracked glyph issue (todo 2026-11-24-credits-glyph-legibility), not a failure here.
result: pass
note: "Owner sent two screenshots without comment, both after the fade to grey: all four lines legible on the dark panel over a lit Coriolis station and over the white sun disc; the panel is visible as a grey box over the sun. The credits glyph still renders as a clipped-looking symbol (tracked separately)."

### 6. Owner judgement: the explosion seen through the 60 % panel

Judge the receding explosion seen through the 60 % black panel at the centre of the aft view (Round 3 condition 6 of the DIV-10 review).

expected: The owner accepts the dimmed explosion or asks for different panel values. The values were deliberately not tuned.
result: pass

## Summary

total: 6
passed: 4
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-20-1
  truth: "On player death the explosion plays, the view turns aft and fades to grey over 5 s, and wreckage from earlier kills keeps drifting and tumbling with no time limit."
  status: resolved
  resolved_by: 20-12-PLAN.md
  resolved_at: 2026-11-24
  reason: "User reported: shot down all 3 flyers, none dropped a plate; on death everything froze, even the space dust turned into streaks instead of dots."
  severity: major
  test: 1
  root_cause: "Three parts. (1a, bug) While dead, render-driver.ts passes dust.update a zero camera delta (previousCameraWorld cleared, dead camera never moves) together with the speed frozen at the death tick (killPlayer does not zero it), so dust.ts takes its stationary branch and draws each mote as a still, randomly oriented streak of clamp(speed*0.02, 0.5, 40) m instead of a dot; Oolite draws dust as GL_POINTS except at hyperspeed. (1b, recorded design) The frozen dead camera and world are the recorded divergence E-179 / DIV-7 (FIDELITY.md:209, PROJECT.md:349); Oolite's dead camera coasts at flightSpeed 160 (PlayerEntity.m getDestroyedBy:) while the universe keeps running; PROJECT.md defers the look to this UAT, which judged it frozen. (1c, chance) Debris drift and tumble do keep running (render-driver tests D-01c/D-01d pass) but nothing was in the aft view: flyer kills dropped no plate (faithful Oolite odds), wrecks burn out in 0.05-0.55 s as in Oolite, test hulls carry no cargo, and the single shooter plate was small, slow and likely kilometres away. Flyer plates: releaseDebris faithfully ports becomeExplosion; plate chance per kill is 0.13 Shuttle, 0.32 Viper, 0.20 Adder, so no plate from all three is a 0.48 outcome (Monte Carlo of 20,000 calls per hull matches the formula). Not a bug."
  artifacts:
    - path: "src/app/session/render-driver.ts"
      issue: "lines 428-434 pass the frozen death-tick speed to dust.update while the dead camera has a zero delta"
    - path: "src/render/bodies/dust.ts"
      issue: "update() stationary branch assumes a still camera means speed 0; draws random-axis speed-scaled streaks"
    - path: "FIDELITY.md"
      issue: "row E-179 records the frozen dead camera and world (Oolite coasts at 160 m/s); owner judged the frozen look at UAT"
  missing:
    - "While dead, dust renders as dots (speed 0 to dust.update), with a test on the speed argument"
    - "Dead camera coasts render-only at Oolite's 160 m/s looking aft on the presentation clock (sim, tick and world hash stay frozen); explosion, debris and dust move relative to it"
    - "Revise FIDELITY.md E-179 and the PROJECT.md DIV-7 decision to match (owner decision 2026-11-24)"
    - "Dust while dead renders as Oolite-like points or motion consistent with the coasting camera, never still random-axis dashes; test pins the speed/delta passed to dust.update while dead"
  owner_decision: "2026-11-24: follow Oolite: the dead camera coasts at 160 m/s looking aft, render-only; revises E-179/DIV-7."
  side_findings:
    - "Phase 16 debris velocity diverges from Oolite: ShipEntity velocity includes thrustVector, so Oolite debris carries the dying ship's flight speed; debris.ts uses drift only (16-RESEARCH.md:149). Separate todo/decision; changes hashed debris velocities."
    - "Pause likely shows the same random dust dashes (zero delta, non-zero speed); inferred from code, not observed."
    - "Dust as streaks in normal flight may be an unrecorded divergence (Oolite draws points except at hyperspeed)."
  debug_session: ".planning/debug/death-scene-frozen-and-flyer-no-wreckage.md"

- gap_id: G-20-2
  truth: "All four game-over lines stay legible over any background, including a bright sun or a lit station face, through the 5 s fade."
  status: resolved
  resolved_by: 20-13-PLAN.md
  resolved_at: 2026-11-24
  reason: "User reported: against the sun the light-grey lines are barely readable (screenshot); the credits glyph after the score also looks clipped."
  severity: minor
  test: 2
  root_cause: "Legibility: #game-over (index.html:1296-1311) is transparent with no backing, text-shadow or stroke, and the text is very light (#33ff66, luminance ~0.73; ~rgb(200,200,200) after the saturate fade). Contrast is 1.34:1 to 1.67:1 on the white sun, ~2:1 on a lit grey hull, 12-15:1 on black space (WCAG 4.5:1). Every other overlay over the scene (#title-confirm, #pause, .home-card) uses a dark translucent panel; #game-over is the only transparent one. A dark panel rgba(0,0,0,.6) inside the filtered root was legible on all three backgrounds at both saturations in a Firefox scratch render and keeps the E-174 fade. Oolite also draws no backing while STATUS_DEAD (GuiDisplayGen.m:1347-1349), so a backing is a fidelity divergence needing a FIDELITY row; Oolite's game-over text is yellow, Wegolite's green is an unrecorded difference. Credits glyph: not clipped; the system monospace font's U+20A2 'Cr' glyph does not resolve its r at 16 px (ink fits its advance in Consolas, Courier New, DejaVu Sans Mono; same on station price screens). Oolite draws its own bitmap glyph (oolite-font.plist:29)."
  artifacts:
    - path: "index.html"
      issue: "#game-over CSS (lines 1291-1325) has no backing behind the four lines"
    - path: "src/ui/game-over.ts"
      issue: "lines 210-212 setFilter applies the fade to the root; the backing must sit inside it"
  missing:
    - "Dark translucent backing panel behind the four lines inside the filtered #game-over root, matching other overlays"
    - "Game-over text colour changes from green to Oolite's yellow (showGameOver resets to yellow, PlayerEntity.m:3630-3644)"
    - "FIDELITY.md row for the backing divergence (Oolite draws no backing while STATUS_DEAD; reason: legibility over a bright sun or lit station)"
  owner_decision: "2026-11-24: dark translucent backing panel inside the filtered root, plus Oolite yellow text; record the backing in FIDELITY.md."
  deferred:
    - "Credits glyph rendering at 16 px is a global presentation decision (station screens too), not part of this gap"
  debug_session: ".planning/debug/game-over-lines-illegible-on-bright-background.md"
