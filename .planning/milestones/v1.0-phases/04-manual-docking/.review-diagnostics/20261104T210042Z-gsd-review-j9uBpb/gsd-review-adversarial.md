Overall verdict: HIGH risk. The plans are structurally sound, but they leave a durable credit injection path, a post-launch docking deadlock, and contradictory future-save rules.

## 04-01

Summary: Measuring the aperture from `oolite_coriolis_dock.dat` and keeping numbers out of `src/sim/` is the right trust boundary. Schema guards against a zero aperture are real, but they do not make every positive float safe, and the golden/emitter precision contract is loose.

Strengths:
- Matches Oolite's bbox extents (`DockEntity.m:1044-1045`) and refuses to centre on the asymmetric mesh (x ∈ [-53.4118, 50.0005]).
- `eslint.config.js:106` already denies `src/sim` imports of `content/generated`. Drift registration in `generate.ts:133-139` is the existing gate.
- Player mesh is `oolite_cobra3.dat` (`ships.json:15036`), so the emitted bbox is the ship the sim flies.

Concerns:
- MEDIUM: `width > 0` still allows subnormals. `apertureHalfExtents` can grow `ww` to `Infinity` and make every finite pose "in lane". The hang/DoS mitigation is only one layer up, not in the loop (`04-01` T-04-02).
- LOW: Golden "4 decimals" versus canonical emitter bytes can fail `assets:check` or silently round the contract the corridor tests assume.
- LOW: Ship `min < max` per axis is not required, only hull `zMin < zMax`.

Suggestions:
- Cap expansion iterations inside the emitter and the runtime helper. Reject non-positive and non-finite results after `×1.25`.
- Pin the golden to the emitter's canonical JSON, not a hand-rounded copy.

Risk: LOW. Bad geometry is build-time data, and the schema plus drift check are the right controls if the loop itself is bounded.

## 04-02

Summary: The port frame matches the renderer (`station.ts:209-212`, `layout.ts:179`) and `dockMouthPosition` (`state.ts:119-124`), so a correct `k = local -Z` lines up with the visible slot. The arming flag, as written, can make that corridor unreachable after the first launch.

Strengths:
- Strict Oolite inequalities, symmetric y-guard (deviation from `DockEntity.m:752`), and no `0.08` roll literal. Real rate is `layout.ts:181`.
- Origin-equals-mouth test at angle 0 catches a flipped dock axis.
- `stepFlight` already applies commands before motion (`step.ts:58-110`) and rolls the station after (`step.ts:115-117`).

Concerns:
- HIGH: `stepDocking` "runs only when `dockArmed`" while `beginLaunch` sets `dockArmed = false` and arming requires `min.z >= 0` inside `stepDocking`. A single early return never arms. The launch test only requires `dockCount === 0`, which a permanently disarmed ship also satisfies. `launch.ts:43-56` is the only exit from `docked`.
- MEDIUM: `skipLaunch` (`launch.ts:60-64`) leaves wings across the slot with the tail inside and collision suppressed while `!dockArmed`. A 180° turn in that window clips through the hull with push-out off.
- LOW: Unit and e2e poses both come from `placeShipInPortFrame`, so a helper bug is invisible. The mouth-equality test is the only independent check.

Suggestions:
- Arm in a prefix that runs while `!dockArmed`. Add a test: launch, skip, fly clear, roll 90°, re-enter, expect `docked`.
- Place one e2e ship along `stationToPlanet` from the probe station position, not only via the helper.

Risk: HIGH. Manual docking can ship green and still be unreachable after launch.

## 04-03

Summary: Bounce-without-damage and app-side feedback match the phase boundary. The no-trap claim does not cover the inputs that actually poison state, and the one-tick push-out is stronger than the algorithm.

Strengths:
- Normal approach cannot torus-tunnel the hull. Mass lock is 25 600 m (`torus.ts:102`). At the boundary the factor is clamped to 32 (`torus.ts:83-86`). The speed is about 11 200 u/s and the mass-lock decel distance is about 4 km, against about 25 km of clearance. The 350 u/s claim holds after that.
- Message cap is 4 (`messages.ts:32-54`). Throttling scrape copy is necessary.
- Fixed strings via `textContent` (`docked.ts:9-10`). No `Math.random` in the sim clock path.

Concerns:
- HIGH: `setSpeed` and `setPosition` write through (`probe.ts:161-166`). `speed.ts:65-67` only rejects non-finite speed, then integrates a huge finite speed (`speed.ts:69-70`) to `Infinity`. The plan's "outside, no mutation" guard does not repair an already-poisoned pose. The property test's 1 500 m box never generates this.
- MEDIUM: One-tick "all corners outside" is not implied by a single-face push. Passing that test invites a teleport, which D-07 forbids, and may drop an unrolled ship back into a straddle loop.
- MEDIUM: Lane/band suppress hull contact. That is correct for the tunnel, but combined with `!dockArmed` there is no unstick at all.
- LOW: Straddle copy teaches the 90° roll, but a face bounce does not. Centred unrolled flight does straddle (130 m wings versus 103 m slot), so this is a hint gap, not a hard trap.

Suggestions:
- At the start of `stepFlight`, replace non-finite position, orientation, speed, and impulse. Clamp the hook. Assert the next tick's centre is outside the hull and the normal points outward.
- Keep the property test, and add one seeded case at `1e308` speed and a `NaN` hook pose.

Risk: HIGH. DOCK-06 is false for the production `?test` hook the plans extend.

## 04-04

Summary: The aegis check should reuse `aegisStatus` (`aegis.ts:34-41`), which fails closed on `NaN`. The purchase rule and the command plumbing do not. TL 9 is cosmetic, and the same tick can dock and relaunch.

Strengths:
- Lave raw TL is 4 (`g0.json:1009`, `techLevelRaw` 4). `EQ_DOCK_COMP` is 15 000 decicredits, TL 9 (`equipment.json:58-62`). A faithful gate really does refuse at Lave.
- Keyboard fails closed if the session forgets to set `installed` (the input layer emits `false`). `Ctrl`/`Alt`/`Meta` never reach `keyDown` (`keyboard.ts:170-175`).
- New game at 1 000 decicredits cannot pay. Boundary tests for 14 999 and 15 000 are the right purchase tests.

Concerns:
- HIGH: `canPurchase` ignores TL. The real Oolite gate is `PlayerEntity.m:8226-8295` (raw TL, bargain only within +3). `oolite-conditions.js:70-90` is only the military-jammer TL 99 hack. The research citation is wrong. The conclusion "Lave cannot sell it" is right. Dropping the gate contradicts D-10. The displayed "(TL 9)" is a lie, and Phase 5 will likely keep this API.
- MEDIUM: `launch` is bound to `Digit1` and `F1` (`actions.ts:63`). All commands hit the first step (`game-loop.ts:45-48`). `beginLaunch` checks the current mode (`launch.ts:43`), not `modeAtStart`. `Shift+C` then `1` docks and immediately relaunches, adding 1 200 plus 600 seconds, and skips the panel.
- MEDIUM: `EquipmentSchema.price` is any int (`equipment.ts:25`). `purchase` is specified as "subtract the injected price" and "invalid input unchanged", but negative and zero prices are not defined as invalid. A negative price mints credits.
- MEDIUM: `EDGE_COMMANDS` pushes one shared object (`keyboard.ts:29-34`, `90-91`). Mutating `installed` on that object sticks for the page lifetime.
- LOW: Step 5 still adds `dt` when the tick started in flight (`step.ts:115-117`). The unit test wants exactly 1 200 seconds. The e2e allows one frame. They disagree.

Suggestions:
- Keep a real `techLevelRaw` argument. Refuse at Lave. Let e2e call `grantEquipment` for `Shift+C` only.
- Apply the dock command only if `modeAtStart === "inFlight"`, and launch only if `modeAtStart === "docked"`.
- Look up the price by key from the validated catalogue. Reject `price <= 0`. Push a fresh command object every keydown.

Risk: HIGH. This is the economy bypass the phase writes down as a feature.

## 04-05

Summary: Versioned strict JSON, no pose floats, and no new dependency are the right save shape. The boot wiring drops the allow-lists the threat model relies on, and the future-version rules contradict each other and the settings precedent.

Strengths:
- Settings already refuse to overwrite a newer blob on load (`store.ts:58-65`) and parse with an explicit key allow-list plus an own-key `__proto__` skip (`schema.ts:97-104`).
- Storing a JSON string, not a structured clone, plus `zod` strict, is the right pollution boundary.
- Launch-only autosave matches DOCK-07. `launch.spec.ts:96-102` can keep clicking `#title-start` if that button stays New game. Today the label is "Start" (`index.html:272`).

Concerns:
- HIGH: Task 1 clears a future save on New game. Task 2 leaves it until the next launch, which then overwrites it. T-04-26 says never write or clear it. `resetSettings` (`store.ts:99-101`) already deletes blindly. An older client can destroy a Phase 6 save.
- HIGH: `parseSave` allow-lists are "caller-supplied", but Task 2's `main.ts` path never passes them. `findShip` throws on an unknown key (`ships.ts:56-62`). An unchecked `station.key` can crash boot, which the plan says never happens. The allow-list also does not stop a forged `EQ_DOCK_COMP` or `credits` up to `MAX_SAFE_INTEGER`. T-04-24 overclaims.
- MEDIUM: Fire-and-forget `put` has no revision. A slow launch write can commit after New game `clear`, resurrecting the save. Two skip-launches can reorder.
- MEDIUM: `JSON.parse` runs before the 64-by-64 caps. T-04-27 does not stop a multi-megabyte blob from hanging boot.
- MEDIUM: The buy button mutates credits, but only launch persists them. Reload undoes the only purchase this phase has.
- LOW: `clockSeconds` is finite and `>= CLOCK_START` only. `1e308` is accepted. `version > 1` is checked after `JSON.parse`, so it does not bound size.
- LOW: On `VersionError`, an implementer "fixing" `open(v1)` with `deleteDatabase` wipes a newer DB. That is not prohibited.

Suggestions:
- One rule, matching `store.ts:58-65`: a future blob is never cleared and never replaced by this build. Test the byte identity after New game and after launch.
- Chain writes on a monotonic revision. Ignore stale completions.
- Pass equipment, system, and station allow-lists at the boot call site. Cap `raw.length` before `parse`. Integer-cap the clock.
- Autosave after a successful purchase, or state that the deduction is ephemeral until launch.

Risk: HIGH. Hostile and newer saves are not inert under the instructions as written.

## Cross-Plan

- HIGH: Credit injection becomes durable. `game-session.ts:705` enables the hook for any `?test` query, not only `?test=1`. `probe.ts:16-17` and `game-session.ts:703-704` promise live mutation and no save. 04-04 adds `setCredits` and `grantEquipment`. 04-05 writes that live profile on `launched`. Reload without the query and Continue keeps the cheat. Taint the profile and refuse to autosave it, or strip the hook from production bundles.
- HIGH: Non-finite and huge hook poses are a trap 04-03's invariant does not cover, and 04-02 and 04-04 add more unvalidated setters (`setOrientation`, `setStationAngle`).
- HIGH: The TL gate, the aegis flag, and the save allow-list are three different trust decisions. The sim trusts an `installed` boolean. The UI trusts credits only. The save trusts any known equipment key. A player can sidestep TL at Lave, sidestep payment via the hook plus autosave, and sidestep both via IndexedDB. Aegis itself is sound if `dockWithComputer` calls `aegisStatus` and ignores the command's own idea of range.
- MEDIUM: `dockArmed` off plus lane/band collision suppression is the trap window. 04-02 creates it. 04-03's push-out explicitly does not run there.
- MEDIUM: Purchase durability, future-save overwrite, and unordered IDB puts are one persistence bug seen three ways. Phase 6 will inherit the schema.
- Normal torus approach is not a docking DoS. Do not spend the fix budget there. Spend it on hook clamps and output finite-checks.

## Risk Assessment

Overall: HIGH. Corridor math and the content boundary are in good shape. The phase as specified can persist cheated credits, leave manual docking disarmed, and destroy a newer save, and its tests do not catch those three.
