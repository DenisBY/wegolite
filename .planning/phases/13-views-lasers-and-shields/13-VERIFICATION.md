---
phase: 13-views-lasers-and-shields
verified: 2026-11-15T09:00:00Z
status: human_needed
score: 5/5 must-haves verified
covered_files:
  - .planning/phases/13-views-lasers-and-shields/13-01-PLAN.md
  - .planning/phases/13-views-lasers-and-shields/13-01-SUMMARY.md
  - .planning/phases/13-views-lasers-and-shields/13-02-PLAN.md
  - .planning/phases/13-views-lasers-and-shields/13-02-SUMMARY.md
  - .planning/phases/13-views-lasers-and-shields/13-03-PLAN.md
  - .planning/phases/13-views-lasers-and-shields/13-03-SUMMARY.md
  - .planning/phases/13-views-lasers-and-shields/13-04-PLAN.md
  - .planning/phases/13-views-lasers-and-shields/13-04-SUMMARY.md
  - .planning/phases/13-views-lasers-and-shields/13-05-PLAN.md
  - .planning/phases/13-views-lasers-and-shields/13-05-SUMMARY.md
  - .planning/phases/13-views-lasers-and-shields/13-06-PLAN.md
  - .planning/phases/13-views-lasers-and-shields/13-06-SUMMARY.md
  - .planning/phases/13-views-lasers-and-shields/13-07-PLAN.md
  - .planning/phases/13-views-lasers-and-shields/13-07-SUMMARY.md
  - .planning/phases/13-views-lasers-and-shields/13-08-PLAN.md
  - .planning/phases/13-views-lasers-and-shields/13-08-SUMMARY.md
  - .planning/phases/13-views-lasers-and-shields/13-09-PLAN.md
  - .planning/phases/13-views-lasers-and-shields/13-09-SUMMARY.md
  - .planning/phases/13-views-lasers-and-shields/13-10-PLAN.md
  - .planning/phases/13-views-lasers-and-shields/13-10-SUMMARY.md
  - .planning/phases/13-views-lasers-and-shields/13-11-PLAN.md
  - .planning/phases/13-views-lasers-and-shields/13-11-SUMMARY.md
  - .planning/phases/13-views-lasers-and-shields/13-12-PLAN.md
  - .planning/phases/13-views-lasers-and-shields/13-12-SUMMARY.md
  - .planning/phases/13-views-lasers-and-shields/13-13-PLAN.md
  - .planning/phases/13-views-lasers-and-shields/13-13-SUMMARY.md
  - .planning/phases/13-views-lasers-and-shields/13-14-PLAN.md
  - .planning/phases/13-views-lasers-and-shields/13-14-SUMMARY.md
  - .planning/phases/13-views-lasers-and-shields/13-15-PLAN.md
  - .planning/phases/13-views-lasers-and-shields/13-15-SUMMARY.md
  - .planning/phases/13-views-lasers-and-shields/13-16-PLAN.md
  - .planning/phases/13-views-lasers-and-shields/13-16-SUMMARY.md
  - src/app/hud-model.ts
  - src/app/session/hyperspace-controller.ts
  - src/app/session/render-driver.ts
  - src/app/session/sim-driver.ts
  - src/app/session/start-session.ts
  - src/app/session/station-controller.ts
  - src/app/session/world-lifecycle.ts
  - src/content/generated/ships-hulls.json
  - src/content/generated/ships-npc.json
  - src/input/actions.ts
  - src/input/keyboard.ts
  - src/persistence/save.ts
  - src/render/bodies/laser-shots.ts
  - src/render/hud/draw.ts
  - src/render/launch-camera.ts
  - src/settings/schema.ts
  - src/sim/combat/aim.ts
  - src/sim/combat/constants.ts
  - src/sim/combat/hit.ts
  - src/sim/combat/ident.ts
  - src/sim/combat/mounts.ts
  - src/sim/combat/octree.ts
  - src/sim/combat/shields.ts
  - src/sim/combat/state.ts
  - src/sim/combat/step.ts
  - src/sim/combat/weapons.ts
  - src/sim/player/outfitting.ts
  - src/sim/sim.ts
  - src/sim/world/control-impl.ts
covered_digest: "v4:sha256:132acdf96a0d092792fc2903b2ac9c7e4e3f463b60dd720f56023b51c4ef5fad"
behavior_unverified: 0
overrides_applied: 0
re_verification: false
warnings:
  - id: WR-01
    file: src/input/keyboard.ts
    issue: "A keydown with Ctrl/Meta/Alt held is dropped unless the key is itself a modifier, so fire (A), ident (R), untarget (U) and the view keys cannot be pressed while precision (Ctrl) is held. Confirmed in code (lines 419-424); no test covers it. Not a roadmap success-criterion failure (every criterion is reachable without Ctrl); a usability finding for the combat loop."
owner_confirmation_items:
  - "D-03: ident message names the ship only (CONTEXT asks for name and class). One constant to change: IDENT_LOCKED_TEMPLATE."
  - "D-04: R while locked clears and re-acquires, U drops the lock (CONTEXT: R again clears the lock). One branch of stepIdent to change."
  - "OQ4: the station and the buoys are neither laser hit targets nor ident targets (Oolite lets both)."
open_gates:
  - "verify-full: open, awaiting owner decision. Not run, not marked passed."
human_verification:
  - test: "Fly in each of the four views (1/2/3/4) in a real WebGL session"
    expected: "Fore, aft, port and starboard read correctly: not mirrored, not clipped by the Cobra hull or the near plane, correct cockpit offset"
    why_human: "Camera maths is unit-tested in Node (tests/render/launch-camera.test.ts); how each view looks on screen needs a human eye"
  - test: "Fire each laser type (buy at F3) and watch the shot"
    expected: "A 1-px line from the mount to the hit point or full range is visible for about 0.09 s, with a sensible colour per laser (pulse red, beam yellow, mining blue, military magenta)"
    why_human: "A thin line along the view axis can read as a dot; headless Chromium cannot judge visibility"
  - test: "Press R with a ship in the sights (traffic on) in several window shapes"
    expected: "The ident frame sits on the locked ship and the message line reads 'Ident system locked onto <name>.'"
    why_human: "Frame placement is pinned numerically only (tests/hud/projection.test.ts)"
  - test: "F3 > a laser: read the facing prompt"
    expected: "The facing prompt appears on its own line (CSS white-space: pre-line)"
    why_human: "The model text is pinned; the CSS line break has no DOM or browser assertion"
---

# Phase 13: Views, Lasers and Shields Verification Report

**Phase Goal:** The player can look and fire in four directions: lasers bought per facing hit ships by their Oolite octree hulls, shields and energy banks absorb and recharge damage, docking restores them, and Oolite's keys for pause, ident and eject are in place; a refused arrival no longer leaves a stale world behind
**Verified:** 2026-11-15
**Status:** human_needed (all automated checks pass; four visual items and three owner confirmations remain; `verify-full` is open)
**Re-verification:** No, initial verification

## Evidence base

- `docker compose run --rm test` run by the verifier in this session: **169 test files passed, 3588 tests passed, 2 skipped, exit code 0** (coverage floors enforced by the same run). This matches the figure in 13-VALIDATION.md.
- Source was read directly; SUMMARY claims were not used as evidence. Oolite constants were compared with `/home/opencode/git/oolite/Resources/Config/equipment.plist` and `shipdata.plist`.
- `verify-full` was not run (owner decision pending). It is recorded as open, not as passed.

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1a | A refused arrival `begin()` leaves no origin ship in the destination (not drawn, not on the scanner, not mass-locking, not blocking a jump), proven at controller level | VERIFIED | `world-lifecycle.ts` `begin` sets `world = undefined` and clears the anchor on every refusal branch (WR-01 comment inline). `hyperspace-controller.ts:239` calls `begin(nextSeed)` in the arrival install block. `tests/app/session/hyperspace-controller.test.ts` "ends the origin world at the maximum live epoch" drives `handleHyperspaceJumped` with a real lifecycle and a populated origin world (13 contacts), then asserts `world` undefined, anchor undefined, no `npcContacts`, no torus mass lock through `stepSim`. Passed in the full run. |
| 1b | P alone pauses; Escape stays Back in station sections; Escape (double press) is bound to eject and does nothing; R is ident and locks the ship in the sights; target-station on a free key; all rebindable and in the controls panel; e2e specs migrated | VERIFIED | `actions.ts`: `pause: ["KeyP"]`, `eject: ["Escape"]` (flight only), `ident: ["KeyR"]`, `untarget: ["KeyU"]`, `targetStation: ["KeyQ"]`. `keyboard.ts` `EDGE_COMMANDS` has no `eject` entry (inert by construction, with the Oolite `hasEscapePod` rationale). `settings/schema.ts` migrates exact legacy tables. README controls table lists Ident, Untarget, Eject (double press), the four views and Fire. Remaining `Escape` presses in `tests/e2e` are chart/station/save Back; the pause presses use `KeyP`. `ident.ts` `updateIdentTarget` acquires the ship in the view axis. |
| 2 | Four views; F3 offers pulse, beam, military, mining per facing; new game and migrated save start with a pulse laser on the fore mount; purchase survives reload through ordered v3 to v4 bump; old build treats v4 as future-version; worst-case v4 under 65,536 chars | VERIFIED | `setView` edge commands for `viewFore/Aft/Port/Starboard`; `render-driver.ts` uses `computeViewCamera(..., combat.view)`. `outfitting.ts` `LASER_FIT_KEYS` x `FACINGS` allow-list; `station-controller.ts` `confirmLaserFit` runs `checkLaserFit` then `applyLaserFit`. `mounts.ts` `DEFAULT_LASER_MOUNTS` = pulse fore, none elsewhere; `save.ts` `SAVE_VERSION = 4`, `laserMounts` strict schema, migration adds the default. `tests/persistence/save-v4.test.ts` has the future-version cases (version 5 inert; oversized sniffing) and a worst-case v4 size test. All passed. |
| 3 | Fire on the current facing draws a shot with Oolite damage, range, recharge and heat; an overheated laser cuts out; a shot hits only inside the octree hull (sphere-but-not-hull misses); a hit drains target energy by the damage function; a scripted pilot through `ShipControl` hits player and ships by the same rule | VERIFIED | `constants.ts` `LASER_STATS` equal to `equipment.plist` (range 12500/15000/12500/30000, energy 0.8/0.5/1.4/1.1, damage 15/6/50/12, recharge 0.5/0.1/2.5/0.1, heat 7/3.2/10/4.25), checked by hand. `weapons.ts` `fireGate` (recharge, 0.85 cut-out, energy gate) and `applyShot`. `hit.ts` two-stage rule (sphere then `isHitByLine` octree descent); not-loaded hull table cannot hit (D-01). `ships-hulls.json` ships the Cobra and the nine NPC hulls as a separate lazy chunk (`ships-hulls.ts` `import.meta.glob`), loaded in `start-session.ts` and passed through `sim-driver.ts`. `step.ts` `resolveShotHits` drains the `ShipControl.fire` queue and player shots through one `firstShipHit`, queues all hits, applies after (NPC energy floors at 0). `tests/sim/combat/npc-fire.test.ts` covers the player hit, NPC-on-NPC hit and the "inside the sphere over the hull misses" case. Passed. |
| 4 | Hits on the player drain the facing shield then energy; both recharge at Oolite rates; HUD shows fore/aft shields, energy, laser temperature, cabin temperature; docking restores shields and energy and resets laser and cabin temperature | VERIFIED | `shields.ts` `routeDamage` (side test by attacker offset, overflow to energy, cabin heat), `rechargeEnergyAndShields`, `coolCabin`; `state.ts` `dockReset` (shields, energy to full, cabin 60, laser temps 0) triggered on the `docked` event in `step.ts`. `hud-model.ts` `buildBars` feeds `shieldFwd/Aft`, `energyBanks`, `laserTemp`, `cabinTemp` from the live combat state; `draw.ts` draws them from `model.bars` (lines 561-677). `tests/sim/combat/dock-reset.test.ts`, `shields.test.ts`, `tests/ui/hud-model.test.ts` passed. |
| 5 | At least 90 % of new behavioural assertions are Vitest scenarios; any added browser spec is opt-in smoke with traffic off by default | VERIFIED | One new browser spec (`tests/e2e/combat.spec.ts`, one `test`, opt-in via `?test=1&traffic=1&clock=manual`, no pixel assertions) against 208 `it` cases in `tests/sim/combat` alone plus the persistence, input, content, HUD and app suites. |

**Score:** 5/5 truths verified, 0 present-but-behavior-unverified. The behavior-dependent truths (cancel on overheat, damage queueing, dock reset, the arrival refusal) each have a passing behavioural test, confirmed in the full Vitest run.

### Deferred Items

None. Nothing identified as a gap is covered by a later phase. Autonomous NPC fire (CBT-15), destruction and the escape pod are out of scope by the ROADMAP scope note and are not gaps.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/sim/combat/{octree,hit,aim,constants,weapons,shields,state,step,ident,mounts}.ts` | Combat core | VERIFIED | Substantive (2,257 lines), imported by `sim.ts`; no debt markers |
| `src/content/generated/ships-hulls.json` | Octrees for Cobra + 9 NPC hulls | VERIFIED | 10 entries, keys match NPC spec keys and `PLAYER_HULL_KEY` |
| `src/content/generated/ships-npc.json` | Energy and recharge fields | VERIFIED | 9 records carry `maxEnergy` and `energyRechargeRate` |
| `src/persistence/save.ts` | v4 save with `laserMounts` | VERIFIED | `SAVE_VERSION = 4`, strict schema |
| `src/render/bodies/laser-shots.ts` | Shot layer | VERIFIED (wired) | Fed from `laserFired` through `createDockFeedbackFlow`, updated each frame in `render-driver.ts` |
| `src/render/launch-camera.ts` `computeViewCamera` | Four view cameras | VERIFIED (wired) | Used by `render-driver.ts` |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `hyperspace-controller.handleHyperspaceJumped` | `worldLifecycle.begin` | arrival install block | WIRED |
| `sim.ts stepSim` | `stepPlayerCombat` / `resolveShots` | combat state parameter | WIRED |
| `sim-driver.stepOnce` | `stepSim` | `ctx.core.combat`, `laserMounts` from the profile, `hulls`, `npcWeapons` | WIRED |
| `start-session` | `loadShipHulls` -> `ctx.core.hulls` | traffic-on boot | WIRED (see note) |
| `ShipControl.fire` | `world.fireQueue` -> `drainFireQueue` -> `firstShipHit` | same rule as the player | WIRED |
| `event-router` `laserFired` | `scene.shots.add` | dock-feedback subscriber | WIRED |
| `HudModel.bars` | `draw.ts` gauges | `buildHudModel` with `ctx.core.combat` | WIRED |
| `identTargetSnapshot` | `drawIdentFrame` | `identFrameFor` in `render-driver.ts` | WIRED |
| `station-controller.confirmLaserFit` | `checkLaserFit` / `applyLaserFit` | allow-listed F3 path | WIRED |

Note: hull data and NPC weapons load only with traffic on (WORLD-16), so in a traffic-off session shots are drawn but hit nothing. This is intended, matches D-01 and the roadmap ("traffic off by default" for the browser bundle), and has a Vitest pin; it is not a gap.

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| HUD gauges | `combat.fwdShield`, `energy`, `laserTemp`, `cabinTemp` | `stepPlayerCombat` / `routeDamage` mutate the live `PlayerCombatState` | Yes | FLOWING |
| Laser shot layer | `laserFired.from/to` | `resolveShotHits` from the ray and `firstShipHit` distance | Yes | FLOWING |
| Ident frame | position and radius | `identTargetSnapshot` over the live world | Yes | FLOWING |
| NPC energy | `entity.energy` | compiled record + `resolveShotHits` | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Whole unit suite incl. coverage floors | `docker compose run --rm test` | 169 files, 3588 passed, 2 skipped, exit 0 | PASS |
| Laser constants vs Oolite | read `equipment.plist` `weapon_info` | all four lasers equal | PASS |

Browser specs were not re-run by the verifier (slow gate; the validation file records `verify` green with 27 Chromium specs and the combat spec green). `verify-full` was deliberately not run.

### Probe Execution

Step 7c: SKIPPED. No probe scripts declared by the phase.

### Requirements Coverage

| Requirement | Source plans | Status | Evidence |
|-------------|--------------|--------|----------|
| FOUND-17 | 13-01 | SATISFIED | Truth 1a |
| INPUT-01 | 13-02, 13-12, 13-15 | SATISFIED (D-03, D-04 owner-pending) | Truth 1b |
| CBT-04 | 13-02, 13-08, 13-13 | SATISFIED (visuals need a human look) | Truth 2, human items 1 |
| CBT-05 | 13-05, 13-06, 13-09, 13-13 | SATISFIED (shot visibility needs a human look) | Truths 2, 3 |
| CBT-06 | 13-05, 13-08, 13-12 | SATISFIED | Truth 4 |
| CBT-07 | 13-03, 13-04, 13-07, 13-10, 13-16 | SATISFIED | Truth 3 |
| DOCK-10 | 13-05, 13-08 | SATISFIED | Truth 4 |

All seven IDs in the phase request map to `Complete` rows in REQUIREMENTS.md (lines 140-146), and no other requirement is mapped to Phase 13, so there are no orphans.

### Anti-Patterns Found

None blocking. A scan of the 69 non-test source files changed since `0a28a78` found no `TBD`, `FIXME`, `XXX`, `TODO`, `HACK` or `PLACEHOLDER` marker. The `MISS` HUD pylons remain a documented placeholder (no missiles this milestone, CONTEXT D-07).

### Code review cross-check (13-REVIEW.md)

0 critical, 1 warning, 6 info. WR-01 was confirmed in code and is reported below. IN-01 to IN-06 are maintainability notes (dead `computeCockpitCamera`, duplicated constants, `hashWorld` repairing in place, exact-match legacy migration, hook taint ordering, an unenforced hull size comment); none contradicts a success criterion.

### Findings

**WARNING WR-01 (confirmed, not a goal failure):** `src/input/keyboard.ts:419-424` returns early for any keydown whose `ctrlKey`, `metaKey` or `altKey` is set unless the code is a modifier code. Precision is bound to `ControlLeft/Right`, so a fresh press of `A` (fire), `R`, `U` or `1`-`4` while Ctrl is held is discarded, and the browser treats `A` as select-all. A key already held before Ctrl keeps working, so the failure is order-dependent. No test covers it (the only `ctrlKey` tests are for reserved F-keys). Every roadmap success criterion is reachable without Ctrl, so this does not fail the goal, but fine-aim-then-fire is the main combat gesture. Recommended before the milestone closes: apply the review's fix (let a bound key through when only Ctrl is held in the `flight` context) or move the default of `precision` or `fire`.

### Human Verification Required

1. **Four views.** Press 1, 2, 3, 4 in flight. Expected: not mirrored, not clipped by the hull or near plane. Why human: camera maths is unit-tested only.
2. **Shot visibility.** Fire each laser type. Expected: a visible line for about 0.09 s with the right colour. Why human: a 1-px line may read as a dot; headless Chromium cannot judge.
3. **Ident frame placement.** Press R with a ship ahead. Expected: the frame sits on the ship across window shapes, message "Ident system locked onto <name>.". Why human: placement is pinned numerically only.
4. **F3 facing prompt.** Open F3 and choose a laser. Expected: the facing prompt is on its own line. Why human: the CSS `white-space: pre-line` has no browser assertion.

### Owner-confirmation items (recorded deviations, not gaps)

- **D-03**: the ident message names the ship only; CONTEXT asks for name and class. Change `IDENT_LOCKED_TEMPLATE` in `src/app/session/event-router.ts` if the owner wants the literal reading.
- **D-04**: R while locked clears and re-acquires; U drops the lock. CONTEXT: R again clears the lock. One branch of `stepIdent` in `src/sim/combat/ident.ts`.
- **OQ4 (station/buoy no-hit divergence)**: Oolite lets a laser stop at a station hull and lets ident lock a station or buoy; Wegolite treats statics as neither (PROJECT.md Key Decisions, PENDING OWNER CONFIRMATION).

### Open gate

- `verify-full`: open, awaiting owner decision. Not run, not marked passed. (AGENTS.md assigns it to render, input and persistence changes, all of which this phase touches.)

### Gaps Summary

No gaps. All five roadmap success criteria and all seven requirement IDs are backed by code that exists, is wired and flows real data, and by Vitest scenarios that passed in the verifier's own containerised run. The status is `human_needed` because four judgements (view appearance, 1-px shot visibility, ident frame placement, the F3 prompt line break) can only be made by a person, and the owner still has three recorded deviations and the `verify-full` decision to settle.

---

_Verified: 2026-11-15_
_Verifier: Claude (gsd-verifier)_
