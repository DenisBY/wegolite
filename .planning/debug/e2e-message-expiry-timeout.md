---
status: diagnosed
trigger: "Investigate issue: e2e-message-expiry-timeout — Playwright message-expiry test times out in full e2e suite (28 passed / 1 failed); passes alone; regression appeared after phase-03 gap closure (heavier planet shader)."
created: 2026-11-04T00:00:00Z
updated: 2026-11-04T15:10:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED. The gap closure raised the planet fragment shader from 7 to 16 value-noise evaluations per pixel (~2.3x). Under headless SwiftShader each page now renders at 4.3 fps solo and ~1.9 fps with a second worker's page competing. `createGameLoop` advances simulated time at most 5 x (1/120 s) = 41.7 ms per rendered frame, so simulated time advances at `fps x 5/120` = 0.18x wall solo and 0.08x wall under load. The message queue needs ~12.9 s of simulated time to drain; at 0.08x that is ~161 s, exceeding the test's fixed 150 s wall wait.
test: "Measured `probe.renders` and `probe.flightTime` over 20 s wall, solo and with two concurrent pages, then confirmed the formula simRate = fps x 5/120 exactly."
expecting: "Confirmed: solo 4.29 fps/0.179 sim rate, two pages 1.91-1.96 fps/0.080-0.082 sim rate, predicted drain 161.5 s > 150 s. Full suite reproduced 28 passed / 1 failed."
next_action: "None — root cause found (diagnose-only mode). Report ROOT CAUSE FOUND; no code changes."

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: `docker compose run --rm e2e` passes all 29 tests. The HUD message test observes the message line clamped to one line and expiring on flightTime within its wait.
actual: 28 passed / 1 failed. The message-expiry test exceeds its 150 s simulated-time wait under parallel load; it passes alone (~1.7 min).
errors: Playwright test timeout waiting for message expiry / flightTime progression (confirm exact error by reproducing).
reproduction: From /home/opencode/git/wegolite: `docker compose run --rm e2e` (full suite). Compare with `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/hud.spec.ts"` (passes alone).
started: Discovered during Phase 03 UAT after the G-03-1 planet-surface/exposure work (commits 166c5b4..bc5be97).

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: "The message line is refilled forever by a logic bug (e.g. a hint or compass message re-enqueued every frame), so it can never become empty."
  evidence: "HintController.announced/seen makes every hint fire at most once; the only message producers are launched, launchComplete, torus, massLockChanged, compassTargetChanged and one-shot hints. Measured live: solo the same message sequence drained to empty in 72.2 s of wall time, and the queue progressed Launching -> Arrows exactly as designed. No unbounded refill."
  timestamp: 2026-11-04T15:05Z

- hypothesis: "The test harness or configuration regressed (shorter wait, more workers, different Compose command)."
  evidence: "`git diff b7e5761..HEAD -- tests/e2e/hud.spec.ts playwright.config.ts compose.yaml` is empty; 150 s wait, 180 s test timeout, 2-worker default and the e2e command are unchanged. The live full suite also reports 'Running 29 tests using 2 workers'."
  timestamp: 2026-11-04T15:05Z

- hypothesis: "Simulated time is completely stalled (rAF stopped, game paused, or an exception), so flightTime never advances."
  evidence: "Probe sampling shows rendered frames and flightTime advancing monotonically: 86 frames / +3.58 s sim in 20 s solo, 39-40 frames / +1.62-1.67 s sim in 20 s loaded. The cadence matches the 5-step cap exactly (fps x 5/120), i.e. the loop is healthy but throughput-limited."
  timestamp: 2026-11-04T15:05Z

- hypothesis: "The game-loop timestep/catch-up constants changed in the gap closure."
  evidence: "`git diff --stat b7e5761..HEAD` for src/app/game-loop.ts, src/sim/time.ts, src/sim/step.ts, src/render/hud/messages.ts, src/app/hints.ts, src/app/launch-sequence.ts and src/sim/flight/launch.ts is empty. DT=1/120, MAX_STEPS_PER_FRAME=5 and MAX_FRAME_DELTA=0.25 are the same pre and post gap."
  timestamp: 2026-11-04T15:05Z

- hypothesis: "The station/exposure changes (plan 03-12), not the planet shader, are the added per-frame cost."
  evidence: "Plan 03-12 changes light calibration, tone mapping and station emissive values, not per-pixel loop count; the planet is a custom ShaderMaterial independent of scene lights. The measured solo 4.3 fps vs the documented pre-gap ~8 fps is ~1.9x, matching the planet noise budget's 7->16 (~2.3x) far better than any station-lighting delta; the shader's own header names the 16-evaluation budget as the instrument the e2e suite measures by timing out."
  timestamp: 2026-11-04T15:05Z

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-11-04T14:30Z
  checked: test-results/hud-the-message-line-is-on-f4de2-e-and-expires-on-flightTime/error-context.md
  found: `TimeoutError: page.waitForFunction: Timeout 150000ms exceeded` at tests/e2e/hud.spec.ts:229 (waiting for `window.__wegolite.hud.message === ""`). The test itself times out at 180 s; the wait budget is 150 s.
  implication: Failure is a bounded-wait exhaustion, not a wrong value — the message line never becomes empty within 150 s wall time.

- timestamp: 2026-11-04T14:30Z
  checked: playwright.config.ts, compose.yaml, nproc
  found: `fullyParallel: false`, no `workers` override (Playwright default = half logical cores); host has 4 CPUs, so 2 workers run 11 spec files concurrently (2 browser pages + SwiftShader at once). `docker compose run --rm e2e` = `npm run build && playwright test` (2 workers).
  implication: Under the full suite two software-rasterised WebGL pages compete for 4 CPUs.

- timestamp: 2026-11-04T14:30Z
  checked: src/app/game-loop.ts, src/sim/step.ts, src/sim/flight/step.ts, src/render/hud/messages.ts
  found: The app loop clamps each frame delta to MAX_FRAME_DELTA=0.25 s and runs at most MAX_STEPS_PER_FRAME=5 fixed DT=1/120 s steps per rendered frame (41.7 ms simulated per frame); when the cap is hit the remaining accumulator is discarded (`if (steps === MAX_STEPS_PER_FRAME) accumulator = 0`). `flightTime += DT` once per fixed step; message expiry = flightTime + MESSAGE_DURATION_SECONDS (4 s).
  implication: Simulated time can only advance at `max 41.7 ms per rendered frame`. If rendered cadence falls below 24 fps, simulated time (and message expiry) advances slower than wall time, and the deficit is never recovered.

- timestamp: 2026-11-04T14:30Z
  checked: src/app/game-session.ts, src/app/hints.ts, src/app/launch-sequence.ts
  found: Message enqueues are bounded per session: "Launching — stand by" (launched), "Arrows pitch and roll…" (launchComplete), plus at most one `speed` and one `pitchRoll` hint (HintController.announced/seen). Queue cap is 4 and each message lasts 4 s of simulated time, so draining the line needs roughly 8–20 s of simulated time, never an unbounded refill.
  implication: Rules out a logic bug where a message is re-enqueued forever; the only variable is how fast simulated time advances.

- timestamp: 2026-11-04T14:30Z
  checked: `git diff b7e5761..HEAD -- tests/e2e/hud.spec.ts playwright.config.ts compose.yaml`
  found: Empty — the test, the 150 s wait, the 180 s test timeout, the worker policy and the Compose command are byte-identical before and after the gap closure.
  implication: The regression is not in the test harness/configuration; it is in the workload the page renders.

- timestamp: 2026-11-04T14:30Z
  checked: planet shader at b7e5761 vs HEAD
  found: Pre-gap fragment shader = 7 value-noise evaluations per pixel (surface fbm 4 octaves + cloud fbm 3 octaves). HEAD = 16 evaluations per pixel (surface 6 + relief tap 3 + relief tap 3 + clouds 4), plus the PlanetMix band branches, two extra `normalize`, and the relief gradient. The new shader's own header says "The per-pixel noise budget is 16 value-noise evaluations … The software-rasterised end-to-end suite measures the budget by timing out if it grows (T-3-31)."
  implication: Per-pixel fragment work rose ~2.3×; with SwiftShader (CPU rasterisation) this directly lowers rendered frame rate, which is exactly the quantity that gates simulated-time advance via the 5-step cap.

- timestamp: 2026-11-04T14:30Z
  checked: docker compose run --rm e2e (full suite reproduction)
  found: Running 29 tests using 2 workers confirmed in the live log; results pending (in progress).
  implication: Confirms the parallel-load configuration used for the failure.

- timestamp: 2026-11-04T14:40Z
  checked: .planning/phases/03-flight-in-the-lave-system/03-03-SUMMARY.md (pre-gap plan)
  found: The pre-gap shader (7 noise evals) was already measured at "~8 fps on headless SwiftShader", and the summary records the exact mechanism: "the fixed-step loop caps at five 1/120 s steps per frame, so two simulated launch seconds take ~8 s of wall time" (03-03-SUMMARY.md:79, 244, 279, 316). tests/e2e/flight.spec.ts:127 also records "SwiftShader frames are ~8 fps"; flight.spec.ts:23-27 records that under two-worker load the simulated-time waits exceed 30 s and raises the bound to 90 s.
  implication: Pre-gap, 8 fps gives a simulated-time rate of 8 × (1/24) = 0.33× wall. The message drain (~16 s simulated) took ~48 s, comfortably inside 150 s. The gap closure raised per-pixel cost ~2.3×, so the same page now runs at roughly 8/2.3 ≈ 3.5 fps solo (sim rate ≈0.146 → ~110 s, matching the observed ~1.7 min solo pass) and lower still with a second page competing, which pushes the same drain past 150 s.

- timestamp: 2026-11-04T14:40Z
  checked: .planning/phases/03-flight-in-the-lave-system/03-11-SUMMARY.md (D6 verification)
  found: The gap-closure claim "the 16-evaluation fragment budget leaves the software-rasterised browser suite green" was verified with only `npx playwright test tests/e2e/scene.spec.ts tests/e2e/hud.spec.ts` (6 passed, 2.5 min) — a subset that does not reproduce the full suite's scheduling/CPU contention.
  implication: The 16-eval budget was accepted on a near-miss measurement; the full 29-test suite is the failing gate. This is why the regression escaped phase verification.

- timestamp: 2026-11-04T14:55Z
  checked: docker compose run --rm e2e (full suite reproduction, completed)
  found: `28 passed (5.8m)`, `1 failed`; the message test took `2.9m` (174 s) and failed with `TimeoutError: page.waitForFunction: Timeout 150000ms exceeded` at hud.spec.ts:229. All other 28 tests passed in the same run.
  implication: Reproduces the reported symptom exactly and gives the failing test's real duration (150 s wait + ~24 s launch/setup).

- timestamp: 2026-11-04T15:05Z
  checked: probe cadence diagnostic in the e2e container (temporary untracked script, deleted after): 20 s wall samples of `probe.renders` and `probe.flightTime`, solo and with two concurrent pages at the same preview URL; then waited for the message line to empty solo.
  found: |
    solo (1 page):          4.29 fps, 3.58 sim s / 20.03 wall s  -> sim rate 0.179x; message line drained in 72.2 s wall; simulated time actually needed = 12.92 s.
    loaded (2 pages):       1.91-1.96 fps each, 1.62-1.67 sim s / 20.4 wall s -> sim rate 0.080-0.082x.
    predicted drain at loaded rate = 12.92 / 0.080 = 161.5 s, versus the test's 150 s wait budget.
  implication: The measured rates obey the loop cap exactly: sim rate = fps x 5/120 (4.29 x 0.04167 = 0.179; 1.91 x 0.04167 = 0.0796). Under two-worker load the message drain needs ~161 s of wall time, so the fixed 150 s wait is guaranteed to expire. Solo it needs ~72 s, which is why the test passes alone (~1.7 min including launch/boot).

- timestamp: 2026-11-04T15:05Z
  checked: relation between measured cadence and the pre-gap baseline documented in 03-03-SUMMARY.md (~8 fps)
  found: Pre-gap 7-eval shader at ~8 fps -> sim rate ~0.33x -> 12.92 s sim in ~39 s wall, with ~3.8x headroom under the 150 s budget. Post-gap 16-eval shader measures 4.3 fps solo (~1.9x slower, matching the ~2.3x noise-budget increase) and ~1.9 fps with a second page. The exact loop-cap equation and the shader budget's own documented role as the e2e timeout instrument tie the regression to fragment-shader cost.
  implication: The regression is explained quantitatively: same test budget, same loop, same message logic; only the per-pixel shader cost changed, moving the drain time from ~39 s pre-gap to ~161 s under load post-gap.


## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: "The phase-03 gap closure took the planet fragment shader from 7 to 16 value-noise evaluations per pixel (~2.3x fragment cost), which drops the page from the documented pre-gap ~8 fps to 4.3 fps solo and 1.9 fps with a second Playwright worker's page competing (headless SwiftShader, 4 CPUs, default 2 workers). The game loop's deliberate catch-up cap (5 x 1/120 s = 41.7 ms simulated per rendered frame; src/app/game-loop.ts + MAX_STEPS_PER_FRAME=5) makes simulated time advance at exactly fps x 5/120: 0.179x wall solo, 0.080-0.082x wall under load. Message expiry is driven purely by simulated flightTime, and the launch/compass/hint queue needs ~12.9 s of simulated time to drain. At 0.08x that drain needs ~161 s of wall time, so the test's fixed 150 s wait expires. The test/config/message logic/timestep are unchanged pre/post gap; only per-pixel shader cost moved, turning a ~39 s pre-gap drain into a ~161 s loaded drain."
fix: "Not applied (goal: find_root_cause_only)."
verification: "Root cause proven by (1) full-suite reproduction 28 passed / 1 failed with the exact 150 s TimeoutError; (2) measured sim rate = fps x 5/120 exactly, solo (4.29 fps -> 0.179) and loaded (1.91-1.96 fps -> 0.080-0.082); (3) measured solo drain 72.2 s vs predicted loaded 161.5 s > 150 s; (4) byte-identical test/config/loop/message sources pre/post gap and 7->16 noise-eval shader diff."
files_changed: []
