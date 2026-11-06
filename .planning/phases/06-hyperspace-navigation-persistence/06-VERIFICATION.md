---
phase: 06-hyperspace-navigation-persistence
verified: 2026-11-06T22:55:17Z
status: gaps_found
score: 40/49 must-haves verified
verified_at: 2026-11-06T22:55:17Z
counts:
  truths_total: 49
  truths_verified: 40
  truths_failed: 9
  requirements_total: 13
  requirements_verified: 9
  roadmap_success_criteria_total: 5
  roadmap_success_criteria_verified: 2
behavior_unverified: 0
overrides_applied: 0
covered_files: [.planning/phases/06-hyperspace-navigation-persistence/06-01-PLAN.md, .planning/phases/06-hyperspace-navigation-persistence/06-01-SUMMARY.md, .planning/phases/06-hyperspace-navigation-persistence/06-02-PLAN.md, .planning/phases/06-hyperspace-navigation-persistence/06-02-SUMMARY.md, .planning/phases/06-hyperspace-navigation-persistence/06-03-PLAN.md, .planning/phases/06-hyperspace-navigation-persistence/06-03-SUMMARY.md, .planning/phases/06-hyperspace-navigation-persistence/06-04-PLAN.md, .planning/phases/06-hyperspace-navigation-persistence/06-04-SUMMARY.md, .planning/phases/06-hyperspace-navigation-persistence/06-05-PLAN.md, .planning/phases/06-hyperspace-navigation-persistence/06-05-SUMMARY.md, .planning/phases/06-hyperspace-navigation-persistence/06-06-PLAN.md, .planning/phases/06-hyperspace-navigation-persistence/06-06-SUMMARY.md, index.html, src/app/game-session.ts, src/app/hud-model.ts, src/app/probe.ts, src/input/actions.ts, src/input/bindings.ts, src/input/keyboard.ts, src/main.ts, src/persistence/autosave.ts, src/persistence/save.ts, src/render/hud/draw.ts, src/sim/commands.ts, src/sim/economy/market.ts, src/sim/events.ts, src/sim/flight/state.ts, src/sim/flight/step.ts, src/sim/hyperspace/arrival.ts, src/sim/hyperspace/countdown.ts, src/sim/hyperspace/jump.ts, src/ui/chart-draw.ts, src/ui/chart-model.ts, src/ui/chart.ts, src/ui/save-load.ts, src/ui/station-model.ts, tests/e2e/autosave.spec.ts, tests/e2e/docking.spec.ts, tests/e2e/helpers/chart.ts, tests/e2e/helpers/save-store.ts, tests/e2e/hyperspace.spec.ts, tests/e2e/save-load.spec.ts, tests/e2e/station.spec.ts, tests/guards/economy-purity.test.ts, tests/input/bindings.test.ts, tests/persistence/autosave.test.ts, tests/persistence/save-v2.test.ts, tests/persistence/save.test.ts, tests/sim/economy/market.test.ts, tests/sim/hyperspace-arrival.test.ts, tests/sim/hyperspace.test.ts, tests/ui/chart-draw.test.ts, tests/ui/chart-model.test.ts, tests/ui/hud-model.test.ts, tests/ui/station-status.test.ts]
covered_digest: "v4:sha256:a6ca003b2553ea441ca21eaf1b84738a424ad85778e90b2e2a787418a28ce14a"
gaps:
  - truth: "Arrival and in-flight restore leave the ship at the saved witchpoint pose, so NAV-05 and SAVE-03 are observable in play."
    status: failed
    severity: blocker
    requirements: [NAV-05, SAVE-03]
    reason: "arrival.ts sets dockArmed=false and autosave.ts sets dockArmed=false on restore; dock/step.ts then clamps any unarmed box past the tunnel-end plane with no x/y bound. A Docker scratch-sim reproduction of Lave to Diso moved the ship 240,434.96 m on the first zero-dt docking step; the independent browser review measured the same 240.4 km snap and a 73% galaxy-0 route incidence."
    artifacts:
      - path: "src/sim/hyperspace/arrival.ts"
        issue: "line 92 sets dockArmed=false on every witchpoint arrival"
      - path: "src/persistence/autosave.ts"
        issue: "line 257 sets dockArmed=false on every in-flight restore"
      - path: "src/sim/dock/step.ts"
        issue: "lines 150-157 clamp on the port-frame z plane alone while disarmed, acting as an infinite wall"
    missing:
      - "Arm the latch on both producers (dockArmed=true) or gate the tunnel-end clamp to an armed/inside-station regime"
      - "Update the arrival and restore unit expectations and add a stepped every-route regression that asserts zero displacement and no dock events"
      - "Re-run the reload-after-arrival browser proof against the live pose after at least one fixed step"
  - truth: "A 15-second countdown belongs to one jump attempt: docking or aborting ends it, and a relaunch cannot commit a jump the player did not restart."
    status: failed
    severity: blocker
    requirements: [NAV-04]
    reason: "Neither dock path clears hyperspaceCountdown or hyperspaceTarget. A Docker scratch-sim reproduction started a countdown, docked with the computer, observed countdown=1798 after the dock, then relaunched and saw exactly one hyperspaceJumped event with clockDeltaSeconds=46,656."
    artifacts:
      - path: "src/sim/dock/step.ts"
        issue: "the manual capture branch (lines 169-185) sets mode=docked but leaves the countdown and target live"
      - path: "src/sim/dock/computer.ts"
        issue: "dockWithComputer (lines 55-79) sets mode=docked but leaves the countdown and target live"
      - path: "src/sim/flight/step.ts"
        issue: "the tick gate uses modeAtStart (lines 238-242), so it runs on the command-phase dock tick and resumes after relaunch"
      - path: "src/app/game-session.ts"
        issue: "the docked handler (lines 1879-1910) does not clear the countdown either"
    missing:
      - "Clear hyperspaceCountdown and hyperspaceTarget in both dock paths (one site if the dock transition is centralised)"
      - "Gate the countdown tick on the live state.mode as well as modeAtStart"
      - "Add unit cases: begin, dock, step 1800 with no jump; timer at 1 plus computer dock emits docked only; record the D-06 amendment in PROJECT.md"
  - truth: "The F2 Save flow asks before overwriting, the safe action cannot be bypassed, and cancelling restores a working Save."
    status: failed
    severity: blocker
    requirements: [SAVE-05]
    reason: "The dialog's mouse Cancel handler only clears module-local confirming and never notifies the session, so overwritePending stays true and every later Save silently returns. Separately, Enter is bound to saveScreenConfirm and calls writeManualSave while Cancel owns focus, so a stray Enter confirms the overwrite."
    artifacts:
      - path: "src/ui/save-load.ts"
        issue: "mouse Cancel at lines 210-219 deliberately does not invoke the session; confirmOverwrite focuses Cancel at lines 276-280 but Enter is not focus-following"
      - path: "src/app/game-session.ts"
        issue: "manualSave returns silently when overwritePending is stuck (lines 1089-1097); saveScreenConfirm writes whenever isConfirming (lines 1575-1578)"
      - path: "src/input/actions.ts"
        issue: "line 191 binds Enter to saveScreenConfirm regardless of the focused control"
    missing:
      - "Add an onOverwriteCancelled session callback that clears overwritePending and updates the probe"
      - "Make Enter follow the focused control or accept KeyY only"
      - "Add browser cases for mouse Cancel then KeyS, and Enter while Cancel is focused"
  - truth: "The flight HUD reports the live fuel tank after a jump."
    status: partial
    severity: warning
    requirements: [NAV-03]
    reason: "buildBars hard-codes fuel: 1 and fuelText is formatFuel(config.maxFuel); profile.fuel is never passed. After Lave to Diso the tank is 34 while the HUD paints full and 7.0 LY, so the only in-flight fuel readout lies about the gate on every jump."
    artifacts:
      - path: "src/app/hud-model.ts"
        issue: "lines 109-110 and 139 hard-code the full tank; no test asserts fuelText or bars.fuel"
    missing:
      - "Pass profile.fuel (tenths) through buildHudModel and derive both the bar and text from it"
      - "Add a half-tank unit case and a browser HUD fuel assertion after a jump"
  - truth: "Short-range chart arrow selection selects a system the player can see."
    status: partial
    severity: warning
    requirements: [NAV-02]
    reason: "nearestInDirection searches all 256 systems and scores lateral*1000+forward, while drawChart and selectLabels paint or label only visible, current and target markers. Right from Lave selects Ermaso at 47.6 LY, off-window and unpainted; the independent review measured 42% of first presses landing off-window."
    artifacts:
      - path: "src/ui/chart-model.ts"
        issue: "lines 420-442 score every system with no visible constraint"
      - path: "src/ui/chart-draw.ts"
        issue: "line 124 skips a marker unless visible, current or target; the selected marker is not forced"
      - path: "src/ui/chart-model.ts"
        issue: "selectLabels line 508 forces only current and target names"
    missing:
      - "Constrain short-range arrow search to visible systems, or force the selected marker into the painted and labelled set"
      - "Add a short-range one-step arrow test asserting the selection is visible or forced"
  - truth: "Two hyperspace key presses in one frame start then abort, leaving no countdown."
    status: partial
    severity: warning
    requirements: [NAV-04]
    reason: "The app rewrites beginHyperspace to cancelHyperspace only when the countdown was already live at frame start. When both edges drain into the same commands array the pre-state is 0, so neither is rewritten and the sim starts on the first edge and ignores the second."
    artifacts:
      - path: "src/app/game-session.ts"
        issue: "lines 2299-2305 decide the mapping from currentState.hyperspaceCountdown only"
      - path: "src/sim/flight/step.ts"
        issue: "lines 147-153 ignore a begin while a countdown is live"
    missing:
      - "Track countdown liveness across the drained command array before deciding each edge"
      - "Add a two-edge drain test"
  - truth: "A committed jump cannot leave the session half-swapped if the destination scene build fails."
    status: partial
    severity: warning
    requirements: [NAV-05]
    reason: "handleHyperspaceJumped runs enterSystemById after the sim has already advanced the clock by up to 166,464 s and cleared the target; the live path is unguarded while loadFromSave guards the identical call. A throw leaves the origin scene installed with a jumped clock and an uncaught page error."
    artifacts:
      - path: "src/app/game-session.ts"
        issue: "line 1699 calls enterSystemById with no try/catch or failure surface"
    missing:
      - "Wrap the destination scene build, publish a visible failure and add a negative control that stubs a throw"
  - truth: "An in-session Load restores a coherent UI, not stale messages or dock feedback from the replaced session."
    status: partial
    severity: warning
    requirements: [SAVE-03, SAVE-05]
    reason: "The install block resets station/chart/F2 fields but not the message queue or the dock shake/flash timer; both are keyed on flightTime, which the restored state resets, so a stale message can outlive the load. The independent review reproduced a message lasting 904 simulated seconds."
    artifacts:
      - path: "src/app/game-session.ts"
        issue: "the install block (lines 1221-1260) does not clear messages or dock feedback"
    missing:
      - "Clear the message queue and dock feedback in the synchronous install block"
      - "Add a Load case asserting no pre-load message survives"
  - truth: "The chart's vertical orientation matches Oolite or records a deliberate decision."
    status: partial
    severity: warning
    requirements: [NAV-01]
    reason: "The independent review found the chart vertically mirrored relative to Oolite's display and no recorded decision. Connectivity is unaffected, but the fidelity posture requires either a flip or a PROJECT.md decision row."
    artifacts:
      - path: "src/ui/chart-model.ts"
        issue: "screenY inversion is implemented without a recorded Oolite comparison"
      - path: ".planning/PROJECT.md"
        issue: "no decision row covers chart vertical orientation"
    missing:
      - "Check Oolite's chart draw orientation and either flip the projection or record the divergence"
---

# Phase 6: Hyperspace, Navigation & Persistence Verification Report

**Phase Goal:** The player can pick a target on the galactic chart, jump to a second market, and reload the page into exactly the state they left.
**Verified:** 2026-11-06T22:55:17Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

The phase builds a genuine second-market loop: the chart is a real 256-system, 875-edge model; the jump math is Oolite-exact integer algebra; the v2 save pipeline is strict and well tested; the arrival market is persisted and cannot reroll. But the phase goal is **not achieved** because the player-visible end state is wrong on most routes. Arrival and every in-flight restore set `dockArmed = false`; the next docking step treats the station's tunnel-end plane as an infinite wall and teleports the ship (240.4 km on Lave→Diso). A reload therefore restores the persisted numbers and then immediately moves the ship. Separately, a dock never clears a live hyperspace countdown, so a relaunch can commit a jump the player never restarted, and the F2 overwrite dialog can silently disable Save or overwrite on Enter while Cancel is focused.

### Observable Truths

#### Plan 06-01 — Hyperspace core

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Integer distance fixtures (Lave→Diso/Leesti/Zaonce/Riedquat/Tibedied) | ✓ VERIFIED | `src/sim/hyperspace/jump.ts:81-121`; `tests/sim/hyperspace.test.ts` (Docker run: 107 targeted tests pass) |
| 2 | Zero-distance Legees→Laeden is dist 0, fuel 1, time 0 | ✓ VERIFIED | `jump.ts:89-90,116`; trunc discriminator test |
| 3 | One integer fuel identity, never negative | ✓ VERIFIED | `jump.ts:115-118`; fuel table 0..17 test |
| 4 | Start requires committed/different/in-range target and fuel ≥ cost; refusal names one reason | ✓ VERIFIED | `countdown.ts:77-110`; refusal table tests |
| 5 | Countdown is exactly 1800 steps, commit adds exactly jump time | ✓ VERIFIED | `step.ts:238-277`; countdown tests |
| 6 | A second hyperspace press aborts at no cost, ordinary input does not, a different target cancels | ✗ FAILED | Same-frame pair starts instead of cancels: `game-session.ts:2299-2305` + `step.ts:147-153` (WR-03) |
| 7 | Deterministic per-route arrival pose, bounds, unit orientation, speed 50, torus off, `dockArmed` false | ✓ VERIFIED | `arrival.ts:42-99`; `tests/sim/hyperspace-arrival.test.ts`. The required `dockArmed=false` is the proximate cause of G-1 |
| 8 | `src/sim/hyperspace/**` pure: no Three, DOM, content runtime import, clock or global random | ✓ VERIFIED | Module imports; `tests/guards/sim-purity.test.ts` |

#### Plan 06-02 — Save schema v2

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | v1 migrates to v2, docked, preserves all fields, adds only the seed | ✓ VERIFIED | `save.ts:357-365`; `tests/persistence/save-v2.test.ts` (43 tests) |
| 2 | v2 is one strict object: mode, target allow-list, 17-good market, bounded pose, docked has no pose | ✓ VERIFIED | `save.ts:133-260,500-579`; save-v2 accept/reject table |
| 3 | 17-key market allow-list includes alien_items while cargo stays 16 tradeables | ✓ VERIFIED | `save.ts:123,528-547`; `main.ts` builds marketGoods from all commodities |
| 4 | `MAX_SAVE_CHARS` 65,536 checked before parse; oversized classification | ✓ VERIFIED | `save.ts:65,391-397`; size-bound tests |
| 5 | Future >2 untouched; positively recognised corrupt backed up; previous good never replaced | ✓ VERIFIED | `save.ts:381-450,622-664`; autosave tests and v3/corrupt-v2 browser cases |
| 6 | Snapshot writes market verbatim + target; restore installs docked or in-flight hook | ✓ VERIFIED | `autosave.ts:226-272`; round-trip tests. The required `dockArmed=false` is the cause of G-1 |
| 7 | Exactly one seed per encoding | ✓ VERIFIED | `save.ts:521-526`; encoder projection tests |
| 8 | Browser future fixtures moved to v3; corrupt-v2 market key rejected | ✓ VERIFIED | `tests/e2e/autosave.spec.ts:726,949,1016`; reported green phase gate |

#### Plan 06-03 — Galactic chart

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 256 systems with stable id/name/coords/systemIndex/economy, ordered | ✓ VERIFIED | `chart-model.ts:279-315`; chart-model test (19 tests) |
| 2 | Exactly 875 edges at the trunc rule; Lave neighbourhood pinned | ✓ VERIFIED | `chart-model.ts`; test asserts 875 vs floor 866 |
| 3 | Isotropic 2:1 letterbox, equal distances equal, true fuel circle | ✓ VERIFIED | `chart-model.ts:chartProjection`; projection/circle tests |
| 4 | Fixed short window, full long range, Tab toggles without mutation | ✓ VERIFIED | `chart-model.ts:279-315`; `actions.ts:181`; `game-session.ts:1625-1627` |
| 5 | Click/arrows select deterministically, Enter commits, current/target distinct | ✗ FAILED | Arrow search reaches unpainted off-window systems: `chart-model.ts:420-442`, `chart-draw.ts:124`, `chart-model.ts:508` (WR-02) |
| 6 | Every system keeps a name and stays selectable; unreachable stays dimmed; labels stable | ✓ VERIFIED | All 256 markers retained; reachability/label tests |
| 7 | Paint only on open/selection/range/resize, 0x0 skip, textContent, no second footer | ✓ VERIFIED | `chart-draw.ts:needsChartRepaint`; `chart.ts`; chart-draw tests (7) |
| 8 | Pure painter order and repaint policy unit-tested | ✓ VERIFIED | `tests/ui/chart-draw.test.ts` |

#### Plan 06-04 — End-to-end session wiring

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | F6 opens in flight/docked, freezes sim without pause, returns; ignored while launching | ✓ VERIFIED | `tests/e2e/hyperspace.spec.ts`; chart tests |
| 2 | Enter commits target; survives close/reopen/reload; F5 shows it | ✓ VERIFIED | Hyperspace e2e; `station-status`/`hud-model` tests |
| 3 | H starts only from in-flight with committed/different/in-range target and fuel; docked inert; refusal copy | ✓ VERIFIED | `step.ts:147-177`; e2e refusal cases |
| 4 | Countdown line, second H aborts at no cost, ordinary input does not, different target cancels | ✗ FAILED | Same-frame pair (WR-03) and dock survival (G-2) |
| 5 | Fuel deducted exactly by the event cost, never negative, cancelled/refused deduct nothing | ✓ VERIFIED | `game-session.ts:1695,1700`; e2e fuel assertion |
| 6 | Commit resolves system/market, builds before swap, chains seed, applies arrival pose, hides station UI, resumes | ✗ FAILED | Pose is applied then immediately clamped 240.4 km (G-1); `arrival.ts:92` + `dock/step.ts:150-157` |
| 7 | Arrival autosave after install; reload returns to witchpoint with same market and target | ✗ FAILED | Market/target restore, but the live pose teleports on the first step (G-1); sim reproduction 240,434.96 m |
| 8 | Docked event writes once; pre-launch anchor before +600; no post-launch write; reload clocks correct | ✓ VERIFIED | `game-session.ts:1879-1910,2287-2295`; autosave e2e |
| 9 | In-flight restore installs system/pose/market/target, hides station UI; docked restore station; failure safe | ✗ FAILED | Install works, then the same unarmed clamp teleports the restored pose (G-1) |
| 10 | HUD element set stays eleven; target is a second clock line | ✓ VERIFIED | `draw.ts:56-65,414-426`; e2e asserts 11 elements and target |
| 11 | Chart/hyperspace/restore probes published once | ✓ VERIFIED | `probe.ts`; e2e reads each group |

#### Plan 06-05 — F2 Save/Load

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | F2 opens only docked, ignored in flight/launch; standalone overlay | ✓ VERIFIED | `tests/e2e/save-load.spec.ts`; bindings tests |
| 2 | Save/Load/Return keyboard-operable; Return restores context | ✓ VERIFIED | Save-load e2e; action context tests |
| 3 | One slot; Save writes it and confirms before overwrite; no manual key | ✗ FAILED | Mouse Cancel latches `overwritePending`, after which Save silently no-ops: `save-load.ts:210-219`, `game-session.ts:1089-1097` (G-3) |
| 4 | Committed manual Save updates footer/probe revision and clock | ✓ VERIFIED | `game-session.ts:writeManualSave`; save-load e2e |
| 5 | Load uses the same parse/migrate/validate, builds before swap, installs in one block, no reload | ✓ VERIFIED | `game-session.ts:1180-1260`; save-load e2e. In-flight load inherits G-1 after install |
| 6 | Failed Load shows an error and leaves session/scene/bytes untouched; future never overwritten | ✓ VERIFIED | `game-session.ts:failLoad`; save-load e2e |
| 7 | textContent only, no second footer, alertdialog/focus trap; safe action takes focus so Enter cannot overwrite | ✗ FAILED | Enter is globally bound to `saveScreenConfirm` and writes while Cancel is focused: `actions.ts:191`, `game-session.ts:1575-1578`, `save-load.ts:276-280` (G-3) |
| 8 | F2 reserved; saveScreen context cannot leak | ✓ VERIFIED | `bindings.test.ts` (41 tests); action contexts |

#### Plan 06-06 — Reload fidelity and phase gate

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Reload reproduces every market price/stock; never regenerates while the snapshot exists | ✓ VERIFIED | Snapshot stored verbatim; `tests/e2e/hyperspace.spec.ts` compares all 17 goods before/after and after a second reload |
| 2 | Reload restores exact in-flight state including position, orientation, velocity; docked/HUD/F5 target | ✗ FAILED | The blob and `probe.restore` match, but the live ship teleports 240 km on the first step (G-1); e2e samples the probe before that step |
| 3 | Autosave matrix: dock, pre-launch, arrival, trade/fit, manual Save, one revision each; no countdown/mid-leg/frame writes | ✓ VERIFIED | `tests/e2e/autosave.spec.ts:395`; code anchors at 652, 721, 1726, 1909, 2294 |
| 4 | v3 future byte-identical, oversized future recognised, corrupt v2 backed up, good blob never replaced | ✓ VERIFIED | `autosave.spec.ts:726,949,1016`; `save.ts` classification |
| 5 | Full container gate green: lint, typecheck, drift, Vitest, build, Playwright | ✓ VERIFIED | Reported `docker compose run --rm verify` exit 0 at `f94cdfa` (73/73 e2e, 1,082 unit); `git diff f94cdfa..HEAD` is docs-only. This verification re-ran 178 targeted unit tests green |
| 6 | PROJECT.md records the phase decisions and supersession | ✓ VERIFIED | `.planning/PROJECT.md:123-132` |

**Score:** 40/49 truths verified (9 failed, 0 present-but-behavior-unverified)

### Roadmap Success Criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | F6 plots 256 systems, both ranges, 7 LY lines; target distance/fuel; unreachable refused | ✓ VERIFIED | Chart tests + hyperspace e2e. Arrow-selection usability is a warning (G-5) |
| 2 | Jump needs fuel, 15 s countdown with abort, clock distance², arrival at destination witchpoint with fresh market | ✗ FAILED | Arrival is teleported (G-1) and a countdown survives docking (G-2) |
| 3 | Fuel is exactly 10 × max(0.1, distance), never negative, fixtures exact | ✓ VERIFIED | `jump.ts:115-118`; fixture tests |
| 4 | Reload restores exact docked/in-flight state including pose and velocity; market keeps stock/prices | ✗ FAILED | Market exact; in-flight position is not (G-1) |
| 5 | Older save migrates, corrupt fails safely, F2 saves/loads docked, autosave on launch and arrival | ✗ FAILED | Migration/corrupt/autosave pass; F2 overwrite confirmation can lose the save or silently disable Save (G-3) |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/sim/hyperspace/jump.ts` | Exact integer chart math | ✓ VERIFIED | 121 lines; all identities and fixtures |
| `src/sim/hyperspace/countdown.ts` | 1800-step gate and refusal union | ✓ VERIFIED | 121 lines; guards never throw |
| `src/sim/hyperspace/arrival.ts` | Deterministic witchpoint pose | ⚠️ PRESENT (defect) | Deterministic, but `dockArmed=false` triggers G-1 |
| `src/sim/flight/step.ts` | Countdown tick/commit | ⚠️ PRESENT (defect) | Tick gate does not see the live mode; G-2 |
| `src/sim/dock/step.ts` | Dock state machine and latch | ⚠️ PRESENT (defect) | Infinite-plane clamp while unarmed; G-1 |
| `src/persistence/save.ts` | Strict v2 schema and migration | ✓ VERIFIED | Bounds, allow-lists, single seed, classification |
| `src/persistence/autosave.ts` | Snapshot/restore both modes | ⚠️ PRESENT (defect) | Correct projection; `dockArmed=false` causes G-1 |
| `src/ui/chart-model.ts` | 256 markers, 875 edges, projection, selection | ⚠️ PRESENT (defect) | Model correct; arrow search reaches unpainted systems (G-5) |
| `src/ui/chart-draw.ts` | Pure painter and repaint policy | ✓ VERIFIED | Draw order and 0x0 skip tested |
| `src/ui/chart.ts` | Canvas shell, DPR, resize, pointer | ✓ VERIFIED | Paint counter and textContent |
| `src/ui/save-load.ts` | F2 overlay and overwrite dialog | ⚠️ PRESENT (defect) | Mouse Cancel and Enter focus path broken (G-3) |
| `src/app/game-session.ts` | Session wiring for all of the above | ⚠️ PRESENT (defect) | Wiring exists; G-1/G-2/G-3 live here or reach through it |
| `index.html` | `#chart` and `#save-load` overlays | ✓ VERIFIED | One document footer; textContent fields |
| `src/input/actions.ts`, `src/input/keyboard.ts` | Chart/hyperspace/save-screen contexts | ✓ VERIFIED | 41 bindings tests; leak proofs |
| `tests/e2e/hyperspace.spec.ts`, `autosave.spec.ts`, `save-load.spec.ts` | Browser proofs | ⚠️ PARTIAL | All green, but they sample before the first resumed step and cover keyboard Cancel only |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Chart selection | Committed target | Enter → `hyperspaceTargetId` → snapshot/F5/HUD | WIRED | Proven by hyperspace e2e and unit models |
| H key | Countdown | `beginHyperspace` → `canStartJump` → 1800 steps | WIRED | Except same-frame double press (G-6) and dock survival (G-2) |
| `hyperspaceJumped` | Fuel deduction and scene/market swap | Event cost → profile → `enterSystemById` → market seed | WIRED | Fuel/market/target correct |
| Arrival pose | Flight loop | `applyWitchpointArrival` → `stepDocking` | BROKEN | Disarmed clamp moves the ship 240.4 km (G-1) |
| IndexedDB blob | Restored in-flight state | `parseSave` → `restoreFromSave` → install block | BROKEN | Numbers install correctly; first step teleports (G-1) |
| F2 Save | Overwrite dialog → committed write | `manualSave` → `overwritePending` → `writeManualSave` | BROKEN | Mouse Cancel latches; Enter confirms on Cancel focus (G-3) |
| docked event | Docked autosave | `handleEvent("docked")` → `autosave()` | WIRED | Exactly one write after the station state is ready |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| Flight HUD fuel bar/text | `bars.fuel`, `fuelText` | `profile.fuel` is never passed; hard-coded 1 / `config.maxFuel` | No | ✗ HOLLOW (G-4) |
| HUD/F5 hyperspace target | `hyperspaceTarget` | Committed target id → galaxy name → snapshot | Yes | ✓ FLOWING |
| Chart markers/readout | markers, distance, fuel | `galaxy0()`, current id, target id, `profile.fuel` | Yes | ✓ FLOWING |
| Market after reload | 17 goods | IndexedDB snapshot → validated save → `market` | Yes | ✓ FLOWING |
| In-flight position | `state.position` | Saved blob → restore → then dock clamp | Yes, then overwritten | ✗ BROKEN (G-1) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Jump math, arrival determinism, chart model, v2 schema | `docker compose run --rm test npx vitest run tests/sim/hyperspace.test.ts tests/sim/hyperspace-arrival.test.ts tests/ui/chart-model.test.ts tests/persistence/save-v2.test.ts` | 4 files, 107 tests passed | ✓ PASS |
| Chart painter, autosave round trips, bindings, HUD model | `docker compose run --rm test npx vitest run tests/ui/chart-draw.test.ts tests/persistence/autosave.test.ts tests/input/bindings.test.ts tests/ui/hud-model.test.ts` | 4 files, 71 tests passed | ✓ PASS |
| Arrival pose survives one docking step | Docker scratch sim, Lave→Diso, `applyWitchpointArrival` then `stepDocking(..., 0)` | shifted 240,434.96 m; `dockArmed=false` | ✗ FAIL (G-1) |
| Docking clears a live countdown | Docker scratch sim: begin countdown, two ticks, `dockWithComputer`, relaunch, step 1800 | countdown 1798 after dock; relaunch emitted one `hyperspaceJumped`, clockDelta 46,656 s | ✗ FAIL (G-2) |
| F2 mouse Cancel restores Save | Code trace: `save-load.ts:210-219` and `game-session.ts:1089-1097` | no session call; `overwritePending` remains true; later Save returns | ✗ FAIL (G-3) |
| F2 Enter while Cancel focused | Code trace: `actions.ts:191` → `game-session.ts:1575-1578` | `writeManualSave()` runs while Cancel is focused | ✗ FAIL (G-3) |

### Probe Execution

No `scripts/**/tests/probe-*.sh` probes are declared or present in this phase; the phase's "probe" is the in-page `window.__wegolite` debug surface, which the browser specs assert. Probe step: N/A.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| NAV-01 | 06-01, 06-03, 06-04, 06-06 | F6 chart 256 systems, ranges, 7 LY lines | ✓ VERIFIED | 256/875 tests; e2e; G-5 warning |
| NAV-02 | 06-03, 06-04, 06-06 | Select target, see distance/fuel, unreachable blocked | ✓ VERIFIED | Chart readout and refusals; G-5 warning |
| NAV-03 | 06-01, 06-04, 06-06 | Fuel ≥ cost, 70 tank, 7.0 LY max | ✓ VERIFIED | `countdown.ts`; fixtures; G-4 HUD feedback warning |
| NAV-04 | 06-01, 06-04, 06-06 | 15 s abortable countdown; clock distance² | ✗ FAILED | Countdown survives docking and commits after relaunch (G-2); same-frame pair (G-6) |
| NAV-05 | 06-01, 06-04, 06-06 | Arrival at destination witchpoint, fresh market, new scene | ✗ FAILED | Pose teleports 240.4 km on most routes (G-1); market/scene correct |
| NAV-06 | 06-01, 06-04, 06-06 | Fuel exactly 10 × max(0.1, distance), never negative | ✓ VERIFIED | `jump.ts:115-118`; commit clamp |
| SAVE-01 | 06-02, 06-05, 06-06 | Versioned strict JSON, ordered migration, future untouched, corrupt backed up | ✓ VERIFIED | `save.ts`; 43 save-v2 tests |
| SAVE-02 | 06-02, 06-04, 06-06 | IndexedDB persists credits, cargo, fuel, equipment, location, clock, RNG, market snapshots | ✓ VERIFIED | v2 schema and snapshot; market seed/snapshot is the only RNG state |
| SAVE-03 | 06-02, 06-04, 06-06 | Loading restores exact docked/in-flight state incl. orientation and velocity | ✗ FAILED | Persisted pose exact, live pose teleports (G-1) |
| SAVE-04 | 06-02, 06-05, 06-06 | Ordered migrations; corrupt fails safely without wiping good data | ✓ VERIFIED | Classification and backup tests |
| SAVE-05 | 06-04, 06-05, 06-06 | F2 save/load docked; autosaves on launch and arrival | ✗ FAILED | Autosaves work; overwrite dialog latch and Enter-on-Cancel can lose/disable the save (G-3) |
| SAVE-06 | 06-02, 06-06 | Reloaded market keeps stock and prices | ✓ VERIFIED | Snapshot verbatim; 17-good e2e equality |
| WORLD-06 | 06-01, 06-06 | Pure hyperspace math, Lave→Diso/Zaonce fixtures | ✓ VERIFIED | `jump.ts`; fixture tests |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/sim/hyperspace/arrival.ts` | 92 | `state.dockArmed = false` on arrival | 🛑 Blocker | Infinite-plane clamp teleports the ship (G-1) |
| `src/persistence/autosave.ts` | 257 | `state.dockArmed = false` on restore | 🛑 Blocker | Same teleport after every in-flight reload (G-1) |
| `src/sim/dock/step.ts` | 150-157 | Unarmed clamp uses z only, no x/y footprint | 🛑 Blocker | Turns the tunnel end into an infinite wall (G-1) |
| `src/sim/dock/step.ts`, `computer.ts` | 169-185, 55-79 | Docked transition does not clear countdown/target | 🛑 Blocker | Jump resumes after relaunch (G-2) |
| `src/ui/save-load.ts` | 210-219 | Mouse Cancel only clears module-local state | 🛑 Blocker | Save silently stops working (G-3) |
| `src/input/actions.ts` | 191 | Enter always maps to `saveScreenConfirm` | 🛑 Blocker | Enter on Cancel overwrites the save (G-3) |
| `src/app/hud-model.ts` | 109-110, 139 | Hard-coded `fuel: 1` / full `fuelText` | ⚠️ Warning | HUD lies about fuel after every jump (G-4) |
| `src/ui/chart-model.ts` | 420-442 | Arrow search over all systems with alignment-dominant score | ⚠️ Warning | Selection lands off-window and unpainted (G-5) |
| `src/app/game-session.ts` | 2299-2305 | Countdown mapping from frame-start state only | ⚠️ Warning | Double H in one frame starts instead of cancels (G-6) |
| `src/app/game-session.ts` | 1699 | Unguarded scene build after commit | ⚠️ Warning | Half-applied jump on a build throw (G-7) |
| `src/app/game-session.ts` | 1221-1260 | Load install omits message/feedback reset | ⚠️ Warning | Stale message outlives an in-session Load (G-8) |
| `src/ui/chart-model.ts` | projection | No recorded Oolite vertical-orientation decision | ⚠️ Warning | Fidelity ambiguity (G-9) |

No `TBD`/`FIXME`/`XXX` markers were found in the phase files. No hard-coded empty-array stubs were found in the new modules; the `fuel: 1` constant is the one hollow data flow.

### Other Review Findings (not individually scored)

- WR-05: `onProfileChanged` has no producer; durability comes from the explicit trade/fit autosaves. Dead wiring, low risk.
- WR-06: `destination === undefined` is an impossible-state guard; if it ever ran it would half-apply. Low risk.
- IN-01: an in-session Load leaves the `?test=1` taint latched; test-only reachability.
- IN-02: the global `#status` overlay still says "new game: Lave" after Continue or a jump.
- IN-03/IN-04/IN-07: stale test/comment wording (post-launch clock, 17 cargo entries, "four" reserved F-keys).
- IN-05: dead public surface (`SaveLoadScreen.isOpen`, `ChartOverlay.paintCount`, `MAX_VERSION_SNIFF_CHARS` export).
- IN-06: chart and save-load overlays are not modal to focus/assistive tech.
- Oolite mass-blockage check is absent, but v1 space has no blocker; out of scope.

### Human Verification Required

None are required to reach this verdict; the three blockers were reproduced from source and two of them by direct simulation. The only manual-only item from `06-VALIDATION.md` remains chart visual legibility, which the chart-graph tests and browser paint accounting cannot fully judge.

### Gaps Summary

The phase's foundation is strong: the integer jump math, the v2 save contract, the 256/875 chart model, the autosave trigger matrix, and the future/corrupt save safety all survive code inspection and targeted container tests. The phase nevertheless fails because its central promise — arrive at the destination witchpoint and reload into exactly that state — is broken by the interaction between two otherwise-correct modules. `arrival.ts` and `restoreFromSave` both mark the dock latch disarmed, and `stepDocking` treats the tunnel-end plane as an infinite wall, so 73% of routes snap the ship by a median ~180 km (240.4 km for Lave→Diso). The same root cause breaks the reload proof: the blob is exact, `probe.restore` is exact, and the first resumed fixed step moves the live ship far away. The existing e2e proof samples before that step, which is why the gate is green.

Two independent state-machine defects compound the failure. A dock does not clear a live countdown, so a relaunch resumes it and commits a full jump with no player input; the commit-tick computer dock can also leave the station overlay over an in-flight state. And the new F2 overwrite dialog is not session-owned on the mouse-Cancel path, while Enter is globally bound to confirm, so a player can either silently lose the ability to save or overwrite while Cancel is focused. These are small, local fixes with clear tests, but they are not safe to ship as-is.

**Closure order:** fix G-1 (arrival/restore latch and clamp boundary) with an every-route stepped regression; fix G-2 (clear the countdown on both dock paths and gate the tick on the live mode) with a dock-then-1800-steps case; fix G-3 (session-owned overwrite cancel and focus-correct Enter) with mouse and keyboard browser cases. Then clear the warnings (G-4..G-9), re-run the full Docker gate, and re-verify with probes sampled after at least one resumed fixed step.

---

_Verified: 2026-11-06T22:55:17Z_
_Verifier: the agent (gsd-verifier)_
