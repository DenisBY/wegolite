---
phase: 20-player-death-and-game-over
verified: 2026-11-24T10:40:00Z
status: passed
score: 5/5 must-haves verified
covered_files:
  - ".planning/phases/20-player-death-and-game-over/20-01-PLAN.md"
  - ".planning/phases/20-player-death-and-game-over/20-01-SUMMARY.md"
  - ".planning/phases/20-player-death-and-game-over/20-02-PLAN.md"
  - ".planning/phases/20-player-death-and-game-over/20-02-SUMMARY.md"
  - ".planning/phases/20-player-death-and-game-over/20-03-PLAN.md"
  - ".planning/phases/20-player-death-and-game-over/20-03-SUMMARY.md"
  - ".planning/phases/20-player-death-and-game-over/20-04-PLAN.md"
  - ".planning/phases/20-player-death-and-game-over/20-04-SUMMARY.md"
  - ".planning/phases/20-player-death-and-game-over/20-05-PLAN.md"
  - ".planning/phases/20-player-death-and-game-over/20-05-SUMMARY.md"
  - ".planning/phases/20-player-death-and-game-over/20-06-PLAN.md"
  - ".planning/phases/20-player-death-and-game-over/20-06-SUMMARY.md"
  - ".planning/phases/20-player-death-and-game-over/20-07-PLAN.md"
  - ".planning/phases/20-player-death-and-game-over/20-07-SUMMARY.md"
  - ".planning/phases/20-player-death-and-game-over/20-08-PLAN.md"
  - ".planning/phases/20-player-death-and-game-over/20-08-SUMMARY.md"
  - ".planning/phases/20-player-death-and-game-over/20-09-PLAN.md"
  - ".planning/phases/20-player-death-and-game-over/20-09-SUMMARY.md"
  - ".planning/phases/20-player-death-and-game-over/20-10-PLAN.md"
  - ".planning/phases/20-player-death-and-game-over/20-10-SUMMARY.md"
  - ".planning/phases/20-player-death-and-game-over/20-11-PLAN.md"
  - ".planning/phases/20-player-death-and-game-over/20-11-SUMMARY.md"
  - ".planning/phases/20-player-death-and-game-over/20-12-PLAN.md"
  - ".planning/phases/20-player-death-and-game-over/20-12-SUMMARY.md"
  - ".planning/phases/20-player-death-and-game-over/20-13-PLAN.md"
  - ".planning/phases/20-player-death-and-game-over/20-13-SUMMARY.md"
  - "index.html"
  - "src/app/session/event-router.ts"
  - "src/app/session/frame-loop.ts"
  - "src/app/session/render-driver.ts"
  - "src/app/session/save-controller.ts"
  - "src/app/session/settings-controller.ts"
  - "src/app/session/sim-driver.ts"
  - "src/persistence/autosave.ts"
  - "src/sim/combat/death.ts"
  - "src/sim/combat/ledger.ts"
  - "src/sim/combat/step.ts"
  - "src/ui/game-over.ts"
  - "tests/app/redraw-gate.test.ts"
  - "tests/app/session/render-driver.test.ts"
  - "tests/e2e/death-and-reload.spec.ts"
  - "tests/e2e/game-over-guard.spec.ts"
  - "tests/sim/world/death-cadence.test.ts"
  - "tests/ui/game-over.test.ts"
covered_digest: "v4:sha256:f0c00fed4e2a11c4713c0aabe6967ca460eba8e379ec9405d98ee343dc470e7d"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 5/5
  gaps_closed:
    - "G-20-1: the dead camera and dust looked frozen and wrong (closed by 20-12 in code and tests; the look needs a human)"
    - "G-20-2: the game-over lines were illegible over a bright sun (closed by 20-13 in code and tests; legibility needs a human)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Die in flight in Chromium and Firefox (a hook-spawned Viper's laser or a ram) and watch the dead view for the full 5 s fade and after it. Also die on the docking approach."
    expected: "The view looks aft and drifts away from the explosion at 160 m/s. The eight bursts and the flash read as an explosion. The dust streams as short lines toward the centre and never as still random dashes. Wreckage from earlier kills keeps drifting. The frame stays smooth (it now draws every frame). On the docking approach the camera passes through the station, as Oolite's does."
    why_human: "The look and timing of the coasting camera, the dust and the explosion are a visual judgement. Vitest pins the camera pose, the dust arguments and the frozen hash, not how it looks. This re-tests G-20-1."
  - test: "Die with the sun behind the text, and again with a lit station face behind it, in Chromium and Firefox. Read all four lines at the start of the fade and at the end of the 5 s fade."
    expected: "Game Over, the cause line, Score and Press Space read clearly in yellow on the dark panel, also after the fade to grey. Over black space the panel is barely visible. The credits sign after the score is a known, separately tracked glyph issue (todo 2026-11-24-credits-glyph-legibility), not a failure here."
    why_human: "Legibility is a judgement of contrast and look. This re-tests G-20-2."
  - test: "Judge the receding explosion seen through the 60 % black panel at the centre of the aft view (Round 3 condition 6 of the DIV-10 review)."
    expected: "The owner accepts the dimmed explosion or asks for different panel values. The values were deliberately not tuned."
    why_human: "An aesthetic decision the review reserved for the owner at UAT."
---

# Phase 20: Player Death and Game Over Verification Report

**Phase Goal:** The player can die: at zero energy from any cause, in flight, the game is over and the page reloads to offer Continue from the last save, through one death path that autosave, pause and the title flow respect; the milestone's determinism and release gates close here.
**Verified:** 2026-11-24T10:40:00Z
**Status:** human_needed
**Re-verification:** Yes, after gap closure (plans 20-12 and 20-13 ran after the first report)

The phase goal is achieved in the code. Both UAT gaps are closed in source and in tests, the five roadmap success criteria still hold, and no gap or blocker remains. The status is `human_needed` only because the three items the UAT reserved for a person (the look of the coasting dead view, legibility of the four lines over the sun and a lit station, and the explosion seen through the panel) can only be judged by looking.

## Re-verification Scope

- **Failed items from the previous round (G-20-1, G-20-2):** full verification (exists, substantive, wired, data flows), below.
- **Passed items (truths 1 to 5):** regression check. `git diff --name-only 6de2dbc HEAD -- src tests index.html` lists exactly six files: `index.html`, `render-driver.ts`, `game-over.ts`, `redraw-gate.test.ts`, `render-driver.test.ts`, `game-over.test.ts`. No file under `src/sim`, `src/persistence`, `save-controller.ts`, `settings-controller.ts`, `sim-driver.ts`, `event-router.ts`, `frame-loop.ts` or `tests/e2e` changed after the first verification, so the sim, the save refusals, the latch, the frame loop and the browser journeys are byte-identical to what was verified and gated. `git diff --name-only 3a8f923 HEAD` outside `.planning/` is empty, so the remote gate on 3a8f923 covers HEAD.

## Gap Closure

### G-20-1: the dead camera and the dust (plan 20-12)

| Check | Evidence | Status |
|-------|----------|--------|
| The dead camera coasts at 160 m/s looking aft, render-only | `src/app/session/render-driver.ts:93` `DEAD_CAMERA_SETBACK_M = 100`, `:106` `DEAD_COAST_SPEED_MPS = 160`. In the `else if (dead)` branch (`:319-338`) the camera is `computeViewCamera(pose.position + forward x (100 + 160 x ctx.runtime.gameOverSeconds), pose.orientation, "aft", zero shake)`, a float64 local. It is never written to `ctx.core.state` or the world. The presentation clock `gameOverSeconds` is advanced only by `frame-loop.ts:132` (wall delta, finite and positive). | ✓ VERIFIED |
| Dust no longer takes the frozen death-tick speed | `render-driver.ts:372-376` passes `dead ? (cameraMoved ? DEAD_COAST_SPEED_MPS : 0) : currentState.speed` and `dead ? 1 : currentState.torus.factor`. The old defect (frozen 350 m/s with a zero delta, which drew random-axis streaks up to 40 m) is gone. The moving branch of `dust.ts` draws along the camera motion, and a zero-delta frame draws the 0.5 m minimum streaks. | ✓ VERIFIED |
| The dead view draws every frame while shown (D-01e) | `shouldDraw()` (`render-driver.ts:219-224`) now returns `redrawGate.next(paused \|\| frozenDocked, drawKeys())`. A dead session is neither paused (pause refuses while `gameOver`) nor docked, so `idle` is false and `next` always returns true (`src/app/redraw-gate.ts`, `if (!idle ...) owed = settle`). The `isDebrisInDeadView` bound, `NO_DRAW_DISTANCE_FACTOR`, `DEAD_SETTLE_SECONDS` and `deadSettled` are gone from `src` (`rg` finds none). | ✓ VERIFIED |
| The sim, tick and hashes stay frozen | The coast touches locals and the scene only. `tests/app/session/render-driver.test.ts:1874-1888` runs the dead frames out to 600 s and asserts `hashWorld`, `hashFlight`, the state pose and every debris entity unchanged. | ✓ VERIFIED |
| Tests pin the behaviour | `render-driver.test.ts` (61 tests, passed): coast pose at t = 0, 2.5 and 30 s (`:1518`); dust arguments at five presentation times with the speed 160 or 0 and torus 1 against a frozen 350 m/s and torus 6 state (`:1621`, `:1634-1665`); alive dust arguments 210 and 4 (`:1674`); dead view draws on 20/20 frames at 4.9, 6, 60 and 600 s; `redraw-gate.test.ts` (20) pins the new `shouldDraw` argument. | ✓ VERIFIED |
| The record matches | `FIDELITY.md` row E-181 (the camera motion, faithful, `PlayerEntity.m:6209-6215`), the rewritten E-179 row (no distance cap, dust streak form as a divergence, torus 1, every-frame redraw, D-01e authority with the Round 3 verdicts) and excerpts E-181 and E-179 exist. `tests/contract/fidelity.test.ts` passed (9 tests, 1 skipped without the Oolite pin tree). CHANGELOG carries the coast sentence. | ✓ VERIFIED |
| Flyer kills dropping no plate (UAT root cause 1c) | Not a code defect: the diagnosis shows Oolite's own odds (no plate from three flyers is a 0.48 outcome) and `20-12-SUMMARY.md` made no change. I did not re-derive the odds; I accept the recorded Monte Carlo of 20,000 calls per hull and the code reading in `20-UAT.md`. | ✓ ACCEPTED as non-bug |

The explosion bursts still stay at the death position (E-173) and so recede from a coasting camera, where Oolite's carry the ship's velocity. This is a recorded divergence with its own todo (`2026-11-24-debris-inherits-ship-velocity.md`), not part of the gap.

### G-20-2: the game-over legibility (plan 20-13)

| Check | Evidence | Status |
|-------|----------|--------|
| A dark translucent panel sits behind the four lines, inside the faded root | `index.html:2146-2158`: `#game-over` holds `<div data-game-over-panel>` with the four `data-game-over-line` paragraphs. `index.html:1318-1321`: the panel rule has `padding: 0.6em 1.4em` and `background: rgba(0, 0, 0, 0.6)`. `#game-over` itself keeps `background: transparent`. Because the panel is a descendant of the root, the render driver's `setFilter` (`render-driver.ts:432-441`, root filter) fades it with the text, and a black panel stays black under `saturate(0)`. | ✓ VERIFIED |
| The text is Oolite's message yellow | `index.html:1301-1316`: `color: rgb(255, 255, 0)` on `#game-over`; no `#33ff66` remains in that rule (pinned by a test). | ✓ VERIFIED |
| Fail closed on a missing panel | `src/ui/game-over.ts:160-191`: `requirePanel(root)` throws `Wegolite: the game-over overlay is missing its backing panel.` and the four `requireLine(panel, name)` lookups. `textContent` writes, the Space or click exit and the filter on the root are unchanged. The real `index.html` is exercised by the remote Chromium specs. | ✓ VERIFIED |
| The `nth-child` spacing still applies | `#game-over p:nth-child(2)` and `:nth-child(3)` count within the panel, whose children are the four `<p>`, so the gaps after the cause and score lines are kept. | ✓ VERIFIED |
| Tests pin it | `tests/ui/game-over.test.ts` (25, passed): panel holds the four lines in order, a missing-panel case, the root carries yellow and `background: transparent`, the panel carries `rgba(0, 0, 0, 0.6)` and `0.6em 1.4em`. `death-flow.test.ts` (21) passed. | ✓ VERIFIED |
| The divergence is recorded and reviewed first | `FIDELITY.md` row E-182 (divergence, `GuiDisplayGen.m:1344-1349`, with the Round 3 conditions: the panel dims the receding explosion, Oolite's comm-log backing precedent, the unmodelled 0.75 HUD alpha) and excerpt E-182; PROJECT.md Key Decision "The game-over lines are Oolite's yellow on a dark translucent panel (Phase 20, G-20-2)". `20-REVIEWS.md` Round 3 has three ACCEPT verdicts at d7d91e9 and the fidelity contract test passes. | ✓ VERIFIED |

The credits glyph after the score (UAT side note) is deferred by the owner to a todo and is a global presentation decision, not part of G-20-2.

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A player in flight whose energy reaches zero from any ledger damage dies on that tick: `mode` is `"dead"`, one `playerDestroyed`, the ship explodes, the flight freezes and a game-over screen replaces the view. A docked or launching player is never killed. | ✓ VERIFIED | Regression check. The lethal check (`ledger.ts`), `killPlayer` (`death.ts`), the `step.ts` call and the freeze in `sim.ts` are unchanged since the first verification. The producer-scope guard `tests/guards/player-death-producer.test.ts` (11), `death-flow.test.ts` (21) and the death twin `death-twin.test.ts` (4) pass on HEAD. The game-over view now additionally shows the lines on the panel (G-20-2) and the explosion is seen from the coasting camera (G-20-1). |
| 2 | A dead player is never saved or revived. No autosave, manual save or pending write replaces the last save, with the chart or F2 open, while paused, during a hyperspace countdown, after a focus loss or a context loss. Pause, held keys and the ident lock cannot revive or repeat the death. | ✓ VERIFIED | Regression check. `save-controller.ts`, `autosave.ts`, `settings-controller.ts`, `sim-driver.ts`, `event-router.ts`, `frame-loop.ts` are untouched since the first verification (git diff above). The frame-loop game-over branch (`frame-loop.ts:124-137`) still drains every queue and runs no fixed step, and the only addition from 20-12 is that it keeps calling `renderFrame(1, shouldDraw())`. The remote `game-over-guard.spec.ts` passed on 3a8f923. |
| 3 | After game over the page reloads and the title offers Continue only when a loadable save exists. Continue resumes that save with its damaged equipment. No save offers only New game. | ✓ VERIFIED | Regression check. `main.ts`, the overlay exit (Space or click to `window.location.reload()`) and `tests/e2e/death-and-reload.spec.ts` (2 tests) are unchanged in behaviour; the spec passed against the new markup in remote `verify-full` (8.0 s and 6.3 s of the 120 s budget). The panel wraps the lines without touching the listeners on the root. |
| 4 | Kills are deterministic: one scenario with an NPC-against-NPC kill, a collision kill and the player's death hashes the same at 30, 60 and 144 Hz. The frozen 20-seed acceptance run is 21 of 21 after the last plan touching `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json`. | ✓ VERIFIED | `death-cadence.test.ts` (16) passed on HEAD. No later commit touches `src/sim/npc`, `src/sim/world` or `ships-npc.json` (20-12 and 20-13 changed none; `git diff --name-only 6de2dbc HEAD -- src` lists only `render-driver.ts` and `game-over.ts`). The last acceptance run is 21 of 21 (20-10 SUMMARY, snapshot 6de2dbc, thresholds and detectors untouched), still the last after the last touching plan. The coast adds no hashed state (test above). |
| 5 | The release gate holds: `verify-full` exits 0 on the remote machine with the death-and-reload and game-over-guard specs in it. | ✓ VERIFIED | Cited, not rerun (the project runs it remotely only). `20-13-SUMMARY.md`: remote `verify` at 3a8f923 `exit=0` (288 files, 7546 passed, 10 skipped, 28 Chromium smoke), remote `verify-full` at 3a8f923 `exit=0`, 949 s (Vitest 7546 passed, Chromium 150 passed plus the 2 closing specs). I confirmed 3a8f923 is an ancestor of HEAD and HEAD differs from it only in `.planning/` files, and `e3efe20` (20-12) is an ancestor of 3a8f923, so the gate covers both gap plans. Firefox `e2e-cross` remains the 20-10 record at 6de2dbc, which predates the render and markup change (see human item 1 and 2: Firefox is part of the manual re-test). |

**Score:** 5/5 truths verified (0 present but behavior-unverified).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/app/session/render-driver.ts` | Coasting dead camera, dead dust arguments, every-frame dead redraw | ✓ VERIFIED | Substantive and wired: `renderFrame` and `shouldDraw` are consumed in `game-session.ts:376,514` and `frame-loop.ts:134,220`. |
| `index.html` (`#game-over`) | Panel, yellow text, four lines | ✓ VERIFIED | Lines 1291-1340 and 2146-2158. |
| `src/ui/game-over.ts` | Panel lookup that fails closed, four lines, Space or click reload | ✓ VERIFIED | Wired in `start-session.ts` and `main.ts` (unchanged since the first report). |
| `tests/app/session/render-driver.test.ts`, `tests/app/redraw-gate.test.ts`, `tests/ui/game-over.test.ts` | Pins for the coast, the dust arguments, the every-frame redraw and the panel | ✓ VERIFIED | 61, 20 and 25 tests, all pass on HEAD in the container. |
| `FIDELITY.md` E-179, E-181, E-182 and PROJECT.md Key Decisions | The divergences and the reviewed record | ✓ VERIFIED | Present; `fidelity.test.ts` 9 tests (1 skipped without the pin tree). |
| All first-round artifacts (`death.ts`, `ledger.ts`, save refusals, `frame-loop.ts`, the two e2e specs) | Unchanged | ✓ VERIFIED | Unchanged since 6de2dbc. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `gameOverSeconds` (frame loop) | dead camera pose | `render-driver.ts:325-327` | ✓ WIRED | Wall delta, clamped, only while latched. |
| dead camera | dust | `cameraWorld` minus `previousCameraWorld`, speed 160 or 0, torus 1 | ✓ WIRED | `render-driver.ts:363-376`. |
| root filter | panel | `ctx.runtime.gameOverOverlay?.setFilter(filter)` on `#game-over`, the panel is its child | ✓ WIRED | `render-driver.ts:439-441`, `index.html:2153`. |
| frame loop game-over branch | draw | `renderFrame(1, shouldDraw())`, `shouldDraw` never idle while dead | ✓ WIRED | `frame-loop.ts:134`, `render-driver.ts:219-224`. |
| `playerDestroyed` to latch, overlay, reload, Continue | unchanged | see the first-round links | ✓ WIRED | Unchanged. |

### Data-Flow Trace (Level 4)

| Artifact | Data variable | Source | Real data | Status |
|----------|---------------|--------|-----------|--------|
| Dead camera position | `coastDistance` | `gameOverSeconds` (wall clock) and the frozen pose | Yes | ✓ FLOWING |
| Dead dust | delta, speed, torus | the coasting `cameraWorld` and constants | Yes | ✓ FLOWING |
| Game-over lines | `GameOverLines` | the death event cause and the profile | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Coast pose, dust arguments, every-frame redraw, frozen hashes, panel markup and CSS, death flow, twin, cadence, producer guard, FIDELITY contract | `docker compose run --rm test npx vitest run tests/app/session/render-driver.test.ts tests/app/redraw-gate.test.ts tests/ui/game-over.test.ts tests/app/session/death-flow.test.ts tests/sim/world/death-cadence.test.ts tests/app/session/death-twin.test.ts tests/guards/player-death-producer.test.ts tests/contract/fidelity.test.ts` | 8 files, 166 passed, 1 skipped (the FIDELITY pin-tree case, which needs `OOLITE_SRC`) | ✓ PASS |
| Full gate on HEAD | cited from `20-13-SUMMARY.md` (remote `verify` and `verify-full` at 3a8f923, exit 0) | HEAD differs only in `.planning/` | ✓ PASS (cited) |

### Probe Execution

SKIPPED. No phase-declared probe scripts (`scripts/*/tests/probe-*.sh`).

### Requirements Coverage

Every ID in the plans' `requirements` frontmatter is DEATH-01, DEATH-06 or QUAL-11 (20-12 declares DEATH-01, 20-13 declares DEATH-01 and DEATH-06, per their SUMMARYs). `REQUIREMENTS.md` marks exactly DEATH-01 (line 32) and DEATH-06 (line 33) done, and `ROADMAP.md` maps DEATH-01, DEATH-06 and QUAL-11 to Phase 20 ("Phase 20: 3" at line 496). No orphans.

| Requirement | Source plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| DEATH-01 | 20-01, 20-02, 20-04 to 20-13 | Death at zero energy while `inFlight`; game over reloads to the title through one death path | ✓ SATISFIED | Truths 1 to 3; the dead view and the legible lines closed under G-20-1 and G-20-2 |
| DEATH-06 | 20-01, 20-04 to 20-07, 20-09, 20-10, 20-13 | A dead player is never autosaved; after the reload Continue shows only for a loadable save | ✓ SATISFIED | Truths 2 and 3 |
| QUAL-11 | 20-01, 20-02, 20-03, 20-10 | Equal hash at 30, 60 and 144 Hz and a 21/21 acceptance run after the last touching plan | ✓ SATISFIED | Truth 4 |

### Anti-Patterns Found

No `TBD`, `FIXME` or `XXX` in any `src`, `tests` or `index.html` file added or modified after the first verification (`rg` over the changed files). No stubs: the coast, the dust arguments and the panel flow to the scene and the DOM.

The incremental review (`20-REVIEW.md`, dispositions in `20-REVIEW-DISPOSITION.md`) found 0 critical findings. The open items are non-blocking:

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/app/session/event-router.ts`, `src/ui/game-over.ts` | n/a (WR-01) | The overlay exit is armed only inside `show()`; a throw from `buildGameOverLines` would leave a latched session without an exit | ⚠️ Warning | Not reachable today (needs a `formatDecicredits` format change). Carried from round one. |
| `vite.config.ts` and lint config | n/a (WR-02) | The dev watcher ignores `.claude/**` but `prettier --check .` and ESLint do not ignore `.claude/worktrees`, so local `lint` can fail while an agent worktree exists | ⚠️ Warning | A tooling gap from 841f562, pre-existing and not from 20-12 or 20-13. Not a phase-goal issue. |
| `src/ui/game-over.ts:20`, `FIDELITY.md:207` | n/a (IN-07) | Cites `HeadUpDisplay.m:440` for the message yellow; the colour is at `:443` | ℹ️ Info | Citation only. |
| `src/app/session/render-driver.ts:372-376` | n/a (IN-08) | Dead dust speed is the constant 160 or 0, not derived from the delta | ℹ️ Info | Correct for the fixed-speed coast; revisit if the coast ever varies. |
| IN-01 to IN-06 | n/a | Carried from round one (defence-in-depth guards, one-frame camera offset, modifier chords on Space, import style, texture preload with traffic off, probe `dock.outcome`) | ℹ️ Info | Recorded in the disposition; none blocks the goal. |

### Human Verification Required

#### 1. The coasting dead view in Chromium and Firefox (re-test of G-20-1)

**Test:** Die in flight and watch the dead view through the 5 s fade and beyond; also die on the docking approach.
**Expected:** The view looks aft and drifts away from the explosion, the dust streams as short lines toward the centre (never still random dashes), earlier wreckage drifts, the frame stays smooth, and the camera passes through the station on the approach.
**Why human:** The look and the timing of a render-only effect; tests pin the pose, the dust arguments and the frozen hash, not the picture.

#### 2. Legibility of the four lines over the sun and a lit station (re-test of G-20-2)

**Test:** Die with the sun behind the text and again with a lit station face; read the four lines at the start and at the end of the fade, in Chromium and Firefox.
**Expected:** All four lines read clearly in yellow on the dark panel, also greyed at the end of the fade; over black space the panel is barely visible.
**Why human:** Legibility is a contrast and look judgement. The measured contrast on the old transparent overlay was 1.34 to 1.67:1 on the sun; the new panel was rendered legible in the diagnosis scratch run, but the real page needs a person.

#### 3. The explosion seen through the 60 % panel

**Test:** Look at the receding explosion at the centre of the aft view behind the panel.
**Expected:** The owner accepts the dimming, or asks for different panel values. The values were deliberately not tuned (Round 3 condition 6).
**Why human:** An aesthetic decision reserved for the owner.

### Gaps Summary

There are no gaps. Both UAT gaps are closed in the code and pinned by tests that pass on HEAD in the container: the dead camera coasts render-only at 160 m/s looking aft with the dust fed the coast's delta and speed (never the frozen death speed) and the dead view drawn every frame, with the sim, tick and hashes proven unchanged; the four lines sit on a `rgba(0, 0, 0, 0.6)` panel inside the faded `#game-over` root, in Oolite's yellow, with a fail-closed panel lookup and the divergence recorded and reviewed (FIDELITY E-182, PROJECT.md Key Decision). The five roadmap criteria still hold: nothing outside the render driver, the overlay, `index.html` and their tests changed since the first verification, the remote `verify` and `verify-full` at 3a8f923 exited 0 with HEAD differing only in `.planning/`, and QUAL-11's last acceptance run (21 of 21) is still the last after the last touching plan. The remaining items are the three visual judgements above and the non-blocking review findings WR-01, WR-02 and IN-01 to IN-08.

---

_Verified: 2026-11-24T10:40:00Z_
_Verifier: Claude (gsd-verifier)_
