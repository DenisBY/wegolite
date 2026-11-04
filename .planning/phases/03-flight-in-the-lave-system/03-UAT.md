---
status: diagnosed
phase: 03-flight-in-the-lave-system
source:
  - 03-VERIFICATION.md
started: 2026-11-04T11:30:37Z
updated: 2026-11-04T15:22:32.000Z
---

## Current Test

number: 1
name: Lave visual fidelity after the gap closure
awaiting: user response

## Tests

### 1. Lave visual fidelity after the gap closure
expected: New game, launch, and fly toward Lave's planet and station at 1080p. The planet reads green/mauve (authored land bytes 92,150,31; sea 150,100,146) with polar ice and a terminator fixed relative to the sun; the sun is white with a thin corona; stars are sparse; the Coriolis lit faces read around 190/255 — not lime-green, not near-black, not an Earth-like blue marble.
why_human: Visual fidelity is a judgement; the phase deliberately forbids pixel evidence and GPU rasterisation varies.
result: [pending]
reported: "looking good" (1080p screenshot: mauve/green planet, polar ice, sun-relative terminator, white sun, sparse stars, lit Coriolis)
reopened: "the reduced relief (3 -> 1 octave) and cloud (4 -> 1 octave, the slow-run step) fields change the approved look; re-run on a real GPU before accepting (03-14-PLAN.md)"

### 2. Real-GPU aspect check
expected: At 2222x1000 (and an ultrawide window), launch and fly. The planet limb is a circle, the Coriolis is not squashed, and rotation traces circles. The e2e proves `probe.aspect` equals 2.222 numerically; this check confirms the rasterised result on a real GPU.
why_human: The numeric projection invariant is proven, but perceived circularity on the actual display remains a visual judgement.
result: pass
reported: "I have 4k monitor, don't know resolution. but looking good" (wide screenshot: circular limb, unsquashed Coriolis, circular star paths)

### 3. WR-08 sea-band decision
expected: Inspect the planet's deep-ocean and coastal-shelf bands. Oolite's `deepSeaColor = Blend(0.85, sea, black)` is 0.85 × sea (a dark mauve); `paleSeaColor` is 0.65 × (0.3 land + 0.7 sea) + 0.35 × polarSea. The current shader computes 0.15 × sea (near black) and a much whiter pale sea, so the deep band and the thin shelf/coast rings may read darker/whiter than Oolite. Decide whether that is visible enough to reopen G-03-1.
why_human: The plan's own must-have states "0.15× the sea colour", so the code matches the plan; only Oolite fidelity (and the UAT's "washed-out" truth) can decide whether the plan encoded the wrong expression.
result: pass
reported: "pass"

### 4. WR-09 polar-cap decision
expected: Inspect the polar cap edge at ~50° latitude. The ice cap currently begins at |lat| 49.59°; Oolite's `(latitude/90°)²` reading of the same threshold would begin nearer 68°. Confirm the cap does not encroach on temperate land enough to break the "reads as Oolite" truth; if it does, switch both the shader and the mirror to the latitude parameterisation.
why_human: The pinned measurement is internally consistent and tested, but its fidelity to Oolite's texture-row parameterisation is a judgement the tests cannot make.
result: pass
reported: "не знаю как должно быть, но выглядит нормально" (ice caps judged normal on two views)

### 5. Browser-gate decision (message-expiry timeout)
expected: Run `docker compose run --rm e2e` and decide whether the message-expiry timeout must be fixed before merge. The suite currently reports 28 passed / 1 failed: `tests/e2e/hud.spec.ts` "the message line is one clamped line and expires on flightTime" exceeds its 150 s simulated-time wait under parallel load. It passes when run alone and the pre-gap commit passes 26/26 under the same conditions, so this is a timing/performance regression from the heavier planet shader, not a broken feature.
why_human: Whether to reduce the shader cost, raise the wait, or serialise workers is a delivery decision; the functional behaviour is proven in isolation.
result: issue
reported: "исправь"
severity: major

### 6. Judgment-tier prohibitions
expected: Confirm the ten prohibitions recorded by plans 03-10..03-13: palette decoded once; terminator in one vector space; no per-machine randomness; no baked texture or second shell; one exposure contract; asset extras validated; one writer of `camera.aspect`; degenerate viewport never produces a non-finite projection. All were code-checked and none is violated; explicit human confirmation is requested because the plans marked them `verification: judgment`.
why_human: The prohibition tier is judgment, so an approving human resolution is required even when code inspection finds no violation.
result: pass
reported: "pass"

## Summary

total: 6
passed: 4
issues: 1
pending: 1
skipped: 0
blocked: 0

## Gaps

- gap_id: G-03-3
  truth: "The message line is one clamped line and expires on flightTime — the full browser suite passes under parallel load without exceeding its wait."
  status: failed
  reason: "User reported: исправь (fix the red browser gate)"
  severity: major
  test: 5
  root_cause: "Phase-03 gap closure raised the planet fragment shader from 7 to 16 value-noise evaluations per pixel (~2.3x cost). Under headless SwiftShader that is 4.3 fps solo and ~1.9 fps with a second Playwright worker competing. The game loop caps catch-up at MAX_STEPS_PER_FRAME=5 with DT=1/120, so simulated time advances at only fps*5/120 (0.08-0.18x wall). The launch/hint queue needs ~12.9 s simulated, i.e. ~161 s wall under load, past the test's fixed 150 s wait."
  artifacts:
    - path: "src/render/shaders/planet.glsl.ts"
      issue: "16 value-noise evaluations per pixel; the per-pixel cost driver"
    - path: "src/app/game-loop.ts"
      issue: "MAX_STEPS_PER_FRAME=5 with DT=1/120 converts low fps into slow simulated time (intentional cap)"
    - path: "src/render/hud/messages.ts"
      issue: "message expiry is driven by simulated flightTime, so it inherits the slowdown"
    - path: "tests/e2e/hud.spec.ts"
      issue: "fixed 150 s wait at line 229 is exceeded under load"
    - path: "playwright.config.ts"
      issue: "2 workers, fullyParallel false: parallel-load amplifier"
  missing:
    - "Reduce planet fragment-shader cost so rendered cadence returns to >=24 fps with headroom under SwiftShader"
    - "Prove it with the full 29-test e2e suite, not only scene+hud"
  debug_session: .planning/debug/e2e-message-expiry-timeout.md
  restatement: "missing[0] ('rendered cadence >= 24 fps') is restated as the drain arithmetic the loop actually obeys: sim rate = fps x 5/120, so the unchanged 150 s wait needs fps >= 12.92 x 24 / 115.4 = 2.69 for 1.3x headroom (drain <= 150/1.3 = 115.4 s), with the launch segment adding 48/fps. The shipped 9-evaluation build measured 152390 ms (fps 2.35, launch 20.4 s, drain 132.0 s, headroom 1.14x) on the JSON reporter, still above the 133 s / 2.69 fps gate; the 10-evaluation build measured 160362 ms (fps 2.23, launch 21.5 s, drain 139.0 s, headroom 1.08x). Both runs passed all 29 tests. G-03-3 stays failed: the cadence gate is NOT met."
