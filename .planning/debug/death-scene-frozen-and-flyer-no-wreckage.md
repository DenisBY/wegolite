---
status: diagnosed
trigger: "death-scene-frozen-and-flyer-no-wreckage: On player death the explosion plays, the view turns aft and fades to grey over 5 s, and wreckage from earlier kills keeps drifting and tumbling with no time limit."
created: 2026-11-23T22:00:00Z
updated: 2026-11-23T22:50:00Z
audit_acknowledged:
  milestone: v2.3
  at: 2026-11-24
  status: diagnosed
---

## Current Focus

bug_class: Bohrbug (deterministic; both symptoms follow from code paths with no timing dependence)
hypothesis_A (dust): CONFIRMED. The dead view passes a zero camera delta but the frozen death-tick `state.speed` to `dust.update`, so the dust takes its "stationary camera" branch (a random axis per mote) with a streak of speed x 0.02 m (up to 40 m): static dashes in random directions. In flight the segments lie along the camera's motion (radial on screen, alignment 1.0) and move; at speed 0 both are ~2 px dots.
hypothesis_B (frozen scene): CONFIRMED as design plus chance. The drift/tumble code works (unit-tested, 68/68). The dead camera, ships, station and dust stand still by recorded design (FIDELITY E-179). No debris was in view: the flyers dropped no plate, wrecks burn out in under 0.6 s, the hooks carry no cargo, and the earlier plate (r 5.15 m, ~10 m/s) was almost surely far away and outside the aft view.
hypothesis_C (flyer plates): CONFIRMED. Faithful random chance: P(plate) Shuttle 0.13, Viper 0.32, Adder 0.20, P(none of three) 0.48 (measured 0.481).
reasoning_checkpoint:
  hypothesis: "Dust streaks: the dead frame feeds a zero camera delta with the frozen non-zero speed, so dust.ts draws random-axis segments of speed x 0.02 m. Frozen look: the recorded frozen camera/world plus no debris in the aft view. No flyer plate: Oolite's plate odds."
  confirming_evidence:
    - "dust scratch test: dead frame at 100-350 m/s gives 8-31 px segments with random orientation (radial alignment 0.57-0.65); flight gives radial (1.0) moving segments; speed 0 gives 2 px dots"
    - "plates scratch test: 20,000 real releaseDebris calls per hull match the Oolite formula within 0.5 percentage points"
    - "render-driver tests 68/68 incl. the D-01c/D-01d drift block"
  falsification_test: "A dead view with a nearby moving pod (spawnTestShooter(5), kill it at close range, then die looking aft at the pods) that does not drift/tumble on screen would refute 1c; dust that stays dots after death at a non-zero speed would refute 1a."
  fix_rationale: "Not applied (diagnose-only). Dust: pass speed 0 (or a dead-specific streak) to dust.update while dead, or port Oolite's 160 m/s aft coast. Frozen look: an owner decision on E-179/DIV-7. Plates: none needed."
  blind_spots: "The owner's session geometry is unknown (no telemetry of where the shooter's plate was at the death). The player's speed at death is unknown (the streak length scales with it). Firefox was used; the dust math is renderer-independent."
  candidate_causes:
    - "code: dust.update speed argument in the dead view (render-driver.ts:428-434)"
    - "config/design: frozen dead camera and world (FIDELITY E-179, DIV-7)"
    - "data/chance: no plate from the flyers; plate far from the aft view"
  and_gate: "yes: the 'everything froze' perception needs the recorded frozen camera/world AND no debris in view; the dust shape change is an independent code cause."
next_action: return ROOT CAUSE FOUND to the caller (diagnose-only).

## Symptoms

expected: The explosion reads as an explosion (eight bursts, ~1.5 s, one flash). The aft view and the 5 s fade to grey look right. Wreckage from earlier kills keeps drifting and tumbling with no time limit (Phase 20 D-01c/D-01d: the dead scene keeps rendering drift/tumble of debris while the sim is frozen).
actual: Owner (translated): "Shot down all 3 flyers (window.__wegolite.test.spawnTestFlyers()), not one of them dropped a plate. On my death everything froze, even the space dust turned into streaks instead of dots." Screenshot: game-over lines over a starfield with many short static line segments (dust drawn as streaks), nothing moving. Earlier in the same session a spawnTestShooter Viper kill DID drop one plate. Explosion/flash accepted.
errors: None (console clean apart from an unrelated, already-fixed Vite deps cache issue).
reproduction: UAT test 1. Dev server http://192.168.178.5:5173/?test=1&traffic=1 (Firefox). New game, launch, spawnTestShooter() and kill it from the side (drops a plate) or spawnTestFlyers() and kill all three (no plate), then spawnTestAttacker() and let it kill you.
started: Discovered during Phase 20 UAT on 2026-11-23, after Phase 20 execution.

## Eliminated

- hypothesis: the dead-view debris drift or tumble stops after the death (render-side bug in driftedContact, effectTime or the redraw bound)
  evidence: render-driver.ts:457-493 advances position by velocity x gameOverSeconds and tumble by flightTime + gameOverSeconds every dead frame; frame-loop.ts:131-134 advances gameOverSeconds every frame; the redraw is held while a moving piece is inside the frustum within 7.5 km for a plate; 68/68 render-driver tests pass including the D-01c/D-01d drift block.
  timestamp: 2026-11-23T22:47:00Z

- hypothesis: flyer kills skip the debris path or use different per-ship data from the shooter kill
  evidence: shooter and interceptor are the same `viper` record; every NPC kill goes through killShip -> releaseDebris; Monte Carlo of the real releaseDebris reproduces Oolite's plate odds per hull.
  timestamp: 2026-11-23T22:40:00Z

## Evidence

- timestamp: 2026-11-23T22:05:00Z
  checked: .planning/debug/knowledge-base.md
  found: does not exist; no prior resolved sessions.
  implication: no known-pattern candidate.

- timestamp: 2026-11-23T22:10:00Z
  checked: src/app/session/frame-loop.ts:124-137 (dead branch) and src/app/session/render-driver.ts:293-302, 345-350, 397-409, 425-435, 454-507
  found: dead branch advances only `gameOverSeconds` and calls renderFrame(1, shouldDraw()). Dead camera = pose + 100 m along -Z, aft view, built from the frozen pose, so it never moves. On the first dead frame previousCameraWorld is cleared, so dust.update gets a zero delta on every dead frame, but `currentState.speed` (frozen at the death tick; killPlayer in src/sim/combat/death.ts:58-73 does not zero it) is passed as the streak speed. Debris is drawn at position + velocity x gameOverSeconds (driftedContact) and tumbled at effectTime = flightTime + gameOverSeconds. Redraw idles after 5 s unless a moving piece is in the dead frustum within sqrt(2) x 1024 x radius.
  implication: debris drift and tumble do run on screen while frames are drawn; dust and camera are static by construction.

- timestamp: 2026-11-23T22:12:00Z
  checked: src/render/bodies/dust.ts update()
  found: streak = clamp(speed x 0.02, 0.5, 40) m. With a non-zero camera delta each segment lies along the camera's motion direction; with a zero delta ("Stationary camera") each mote uses its own random unit axis. Dust is always THREE.LineSegments.
  implication: in the dead view (zero delta, frozen non-zero speed) the field is drawn as randomly oriented static segments of up to 40 m: the "streaks" in the owner's screenshot. In flight (fore/aft view, motion along the view axis) the segments lie along the line of sight and project to dots.

- timestamp: 2026-11-23T22:15:00Z
  checked: Oolite DustEntity.m drawImmediate (checkout HEAD, same file at pin) and PlayerEntity.m getDestroyedBy (pin 7437f22, lines 6187-6221), performInFlightUpdates (3367-3415), update (2421-2453)
  found: Oolite draws dust as GL_POINTS unless `[player atHyperspeed]` (then GL_LINES along the player velocity / HYPERSPEED_FACTOR). On death Oolite sets flightSpeed = 160, velocity = 0, roll/pitch/yaw = 0, and the dead player still runs performInFlightUpdates (not docked), so the aft camera keeps coasting at 160 m/s away from the explosion while the universe keeps running.
  implication: in Oolite the dead view's dust is moving points, never streaks. Wegolite's dust streaks after death have no Oolite counterpart; the static camera is a recorded divergence (FIDELITY.md row E-179, "Standing still: ships, buoys, the station and the dust"), but that row does not cover the dots-to-streaks change.

- timestamp: 2026-11-23T22:18:00Z
  checked: FIDELITY.md:209 (E-179)
  found: records that the dead camera stands still (Oolite coasts at flightSpeed 160), that ships, buoys, the station and the dust stand still, and that only explosions, shots, debris (drift + tumble) and the fade move.
  implication: "everything froze" is, apart from the dust shape and the debris, the recorded design; the owner's perception matches the divergence the row describes.

- timestamp: 2026-11-23T22:20:00Z
  checked: src/sim/world/debris.ts releaseDebris (897-1035) vs Oolite ShipEntity.m becomeExplosion (7891-8143) at the pin
  found: faithful port. canFragment = u < fragment_chance (0.9); n_alloys = sqrt(sqrt(mass/6000)); wrecks floor(u x (n_alloys+2)); n_alloys = u x n_alloys; plates = floor(n_alloys) only if canFragment. Compiled masses (ships-npc.json): shuttle 11317.6 kg (n 1.172), viper 34040.7 (n 1.543), adder 16045.5 (n 1.279). P(plate) = 0.9 x (1 - 1/n): shuttle 0.132, viper 0.317, adder 0.196. P(no plate from all three) = 0.868 x 0.683 x 0.804 = 0.477.
  implication: zero plates from the three flyers is a coin-flip outcome under Oolite's own rule; one plate from the shooter Viper is a 32 % outcome. Same hull (viper) for shooter and interceptor, so no per-hook difference.

- timestamp: 2026-11-23T22:22:00Z
  checked: src/sim/world/step.ts steerEntity (254-283), src/sim/world/world.ts:601-604
  found: each entity's combat stream is seeded forkSeed(worldSeed, id, "combat") and is drawn by every steering update of a flying NPC, so the stream state at the kill depends on how long the flyer flew.
  implication: per-kill outcomes are effectively random per kill (timing-dependent), not a fixed per-session result.

- timestamp: 2026-11-23T22:25:00Z
  checked: Oolite ShipEntity.m:11158-11171 at pin 7437f22 (`- (Vector)velocity` returns `[super velocity] + thrustVector`) vs src/sim/world/debris.ts module doc ("velocity is the drawn kick plus the victim's drift velocity, never its flight speed") and 16-RESEARCH.md:149 ("`[self velocity]` is the drift vector only")
  found: in Oolite, `[self velocity]` inside releaseCargoPodsDebris/becomeExplosion dispatches to ShipEntity's override, which adds v_forward x flightSpeed. Phase 16 research misread this; Wegolite debris inherits only the drift.
  implication: side finding (not the cause of either symptom): Wegolite debris from a fast ship stays near the kill point with only a ~10 m/s kick, where Oolite's debris carries the ship's flight velocity. This makes Wegolite debris drift slower (less visible motion in the dead view), not rarer. Entity.m `- (Vector)velocity` returns the ivar; ShipEntity.h:925 documents setTotalVelocity as "effectively setting the instantaneous velocity", confirming `[ship velocity]` is the instantaneous total. Universe.m addWreckageFrom (5497) also uses `[wreck setVelocity:[ship velocity]]`.

- timestamp: 2026-11-23T22:40:00Z
  checked: scratch Vitest /tmp/wegolite-debug-death/plates.test.ts (mounted at /scratch, run in the `test` container): 20,000 real `releaseDebris` calls per hull over the compiled content (debrisContentFrom(ships-npc.json, ships-debris.json)), random combat stream per trial
  found: P(plate) measured vs formula: shuttle 0.1325 vs 0.1320, viper 0.3146 vs 0.3168, adder 0.1918 vs 0.1962. P(any wreck) ~0.62-0.65 with ~1.0-1.2 wrecks on average. P(no plate from shuttle+viper+adder) = 0.481.
  implication: the port produces Oolite's plate odds; no plate from the three flyers is a ~48 % outcome. Confirms hypothesis_C.

- timestamp: 2026-11-23T22:42:00Z
  checked: wreck lifetime, src/sim/world/debris.ts wreckHeatDrain (331-338) and Oolite Universe.m addWreckageFrom (5497-5526: energy = lifetime/2, temperature 1000, "take 1000e heat damage per second")
  found: a wreck has 50..425 energy (+125 per extra wreck) and loses ~1000 per second, so it burns out in about 0.05-0.55 s, in Oolite and in Wegolite alike. The test hooks spawn with cargo 0 unless spawnTestShooter(cargo) is passed, so no pods.
  implication: from these kills the only debris that can still exist at the death is an alloy plate; the flyers left none.

- timestamp: 2026-11-23T22:45:00Z
  checked: scratch Vitest /tmp/wegolite-debug-death/dust.test.ts: the real createDust, 30 flight frames along the camera's -Z at 60 Hz, then one dead frame (zero delta, same speed), projected at 1920x1080 with the 57.2 deg flight fov, on-screen segments only
  found: speed 0: flight and dead both median 2.15 px (dots). Speed 100/200/350 m/s: flight median 6.4/13.3/26.0 px with radial alignment 1.000 (every segment points at the vanishing point and moves); dead median 8.5/19.1/31.3 px with radial alignment 0.57-0.65 (random orientations), static.
  implication: confirms hypothesis_A. At speed 0 the dust is dots; at a combat speed the dead frame turns the coherent, moving radial flow into static dashes in random directions, sized by the frozen death speed. This is the "streaks instead of dots" in the screenshot.

- timestamp: 2026-11-23T22:47:00Z
  checked: `docker compose run --rm test npx vitest run tests/app/session/render-driver.test.ts`
  found: 68/68 pass, including "renderFrame dead debris drift (D-01c, D-01d)" (drawn position = sim position + velocity x gameOverSeconds, tumble time = flightTime + gameOverSeconds, redraw held while a moving piece is in view) and "gives the dust a zero delta on the first dead frame" (the speed argument is not asserted).
  implication: the on-screen debris drift and tumble work as designed; nothing in them stops after death. The dust speed argument is untested.

## Resolution

root_cause: |
  Sub-question 1 (frozen scene, dust streaks). Three causes together (AND-gate):
  (1a, code bug) render-driver.ts:428-434 passes the frozen death-tick `currentState.speed` to dust.update while the dead camera never moves (zero delta from the first dead frame, :349). dust.ts then takes its stationary-camera branch: each mote gets its own random axis and a streak of clamp(speed x 0.02, 0.5, 40) m. The coherent, moving radial flow seen in flight becomes static dashes in random directions. Oolite draws dust as points except at hyperspeed (DustEntity.m drawImmediate), and its dead camera keeps coasting at flightSpeed 160 (PlayerEntity.m:6211), so it never shows this.
  (1b, recorded design) The dead camera, ships, station, buoys and dust stand still by decision (FIDELITY.md:209 E-179, PROJECT.md:349, DIV-7). Oolite's dead view moves: the camera coasts aft-looking at 160 m/s and the universe keeps running. The UAT verdict is on this recorded look.
  (1c, data/chance) There was nothing for the working debris drift to move on screen: the flyers dropped no plate (sub-question 2), wrecks burn out in under ~0.6 s (Oolite too), the hooks spawn ships without cargo (no pods), and the one plate from the earlier shooter kill (radius 5.15 m, ~10 m/s kick) was almost surely kilometres away and outside the aft frustum. The debris drift/tumble itself does not stop after death.
  Sub-question 2 (no flyer plate): not a bug. releaseDebris is a faithful port of Oolite's becomeExplosion: plates = floor(randf() x sqrt(sqrt(mass/6000))) only when canFragment (0.9). P(plate): shuttle 0.13, viper 0.32, adder 0.20; P(none of the three) = 0.48 (measured 0.481 over 20,000 real releaseDebris calls per hull). The shooter Viper's plate was a 32 % outcome.
  Side finding (separate fidelity defect, Phase 16): Oolite's `[ship velocity]` is drift + v_forward x flightSpeed (ShipEntity.m:11163-11166 at pin 7437f22); Wegolite gives debris only the drift (debris.ts module doc; 16-RESEARCH.md:149 misread). Debris of a fast ship should carry its flight velocity.
fix: (diagnose-only session; not applied)
verification: (diagnose-only session)
files_changed: []
