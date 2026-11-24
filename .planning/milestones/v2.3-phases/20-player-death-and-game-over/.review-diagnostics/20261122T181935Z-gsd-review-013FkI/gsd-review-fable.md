# Phase 20 plan review (Fable 5.2)

Reviewer: Claude Fable 5.2. Read-only review; no build or test was run.
Wegolite at `791cec0`, Oolite at the pin `7437f22` (read with `git show 7437f22:<path>`).
Wegolite citations are `path:line` at that HEAD. Oolite citations are pin lines.

The overall verdict and the divergence verdicts follow the ten plan sections.

---

## 20-01

**Summary.** The death commit: `"dead"` mode, the ledger's lethal check with an out-parameter, `killPlayer`, the freeze in `stepSim` and `stepFlight`, the destroyable player, the producer guard, the `snapshotForSave` throw, and the restated pins.

**Strengths**

- The lethal predicate matches Oolite. Oolite decides in the damage function on `energy <= 0.0` (`PlayerEntity.m:5683-5689` for a laser; `ShipEntity.m:11651-11669` for a scrape, reached through `PlayerEntity.m:5744`). Wegolite's kernel floors the bank and returns `applied`, so the check has to use the value before the floor, as planned.
- The out-parameter is the right shape. `applyLedger` returns `LethalHit[]` (`src/sim/combat/ledger.ts:176-184`) and the trailing optional parameter leaves every existing caller unchanged.
- The insertion point is real. `resolveShots` runs kills, then `applyPlayerPush`, then `drainAiEventsNow`, `commitWorld` and `updateIdentTarget` (`src/sim/combat/step.ts:819-837`). The push is computed while the player is still `inFlight` (`step.ts:677`), so "push, then die" is a consistent rule to pin.
- The fail-open sites are real: the clock block's negative gate (`src/sim/flight/step.ts:442`, tick at `:478`) and the save mode mapping (`src/persistence/autosave.ts:114`).
- The intermediate-state audit holds. I checked every producer: `sim-driver.ts:289,331` (docked pre-launch), `event-router.ts:276` (`docked` event), `hyperspace-controller.ts:282` (synchronous arrival), `station-controller.ts:414,525,574,631` and `start-session.ts:904` (docked), `start-session.ts:713,719` and `save-controller.ts:641` (F2, docked only, `save-controller.ts:581`). `game-session.ts:261,295` are wrappers. No page-lifecycle handler saves (`src/main.ts:406-500`). `snapshotForSave` has one app caller (`save-controller.ts:173`).
- The collision change matches Oolite: `selfDestroyed = (dam1 > energy)` reads the bank (`ShipEntity.m:11111`; `src/sim/combat/response.ts:282`).

**Concerns**

- **MEDIUM. The idle straight departure is now lethal and nothing pins it.** `.planning/PROJECT.md:333` records "dam1 about 428 on the player" for the 175 m/s launch into the nav buoy, about 54 s after launch. The Cobra has 128 shield and 256 bank, so 428 kills. This is the most likely first death for a new player, and the 11 % margin depends on the exact closing speed. The plan treats it as a UAT note (20-10) and Task 3 lists it only as a candidate for fixture changes. The CHANGELOG line of item 12 does not mention it.
- **LOW. `killPlayer` sits inside the stepped-world branch.** `applyLedger` runs for every call (`step.ts:798-806`), but the kill would run only when `world !== undefined && worldStepped`. A lethal outcome on an unstepped world is dropped silently. It is unreachable today; it is still a fail-open shape.
- **LOW. `resolveShots` has no dead-mode return of its own.** 20-02's freeze table calls it directly on a dead state and expects empty events.
- **LOW. "A lethal scrape still rolls" is not what Oolite shows.** `getDestroyedBy:` calls `removeAllEquipment` (`PlayerEntity.m:6220`, comment "No scooping / equipment damage when dead") inside `[super takeScrapeDamage:]` (`:5744`), before the roll loop (`:5746-5752`). Oolite therefore cannot damage equipment on a lethal scrape. Wegolite's `equipmentDamaged` events on that tick are harmless (never saved, messages cleared) but should not be called faithful.
- **LOW. The suite is red between Task 1 and Task 3.** Task 1 verifies targeted files only. The `npc-fire` floor case and the 250 m/s buoy case fail until Tasks 2 and 3. Acceptable for unpushed commits; bisecting inside the plan will not work.
- **LOW. A grep trap.** Task 3's gate `rg "in Phase 20|is Phase 20|..." src/sim` also matches new comments. The new doc lines in `death.ts`, `state.ts` and `ledger.ts` must avoid those phrases.

**Suggestions**

- Add a Vitest scenario for the idle straight launch (in 20-02) and pin its outcome and tick. Measure the same ram on real Oolite with `tools/oolite-reference/run-remote.sh` before the CHANGELOG names it. Name the nav buoy in the CHANGELOG line.
- Call `killPlayer` after the stepped-world branch, or throw when `outcome.playerDeath` is set and the world was not stepped.
- Add `if (player.mode === "dead") return []` to `resolveShots` in this commit.
- Either skip the internal-damage roll once the record was lethal, or keep it and record in the DIV-8 row that it is a Wegolite artefact.

**Risk: MEDIUM** (a wide atomic commit with a low-confidence estimate; the design itself is low risk).

---

## 20-02

**Summary.** The edge ticks, the mutual kill, the lethal ram, the lethal boundary, the freeze table, a property test, two dead-mode returns and a tripwire for the next flight mode.

**Strengths**

- The two writers are fail-open today: `applyWitchpointArrival` writes `"inFlight"` with no mode check (`src/sim/hyperspace/arrival.ts:149`) and so does `completeLaunch` (`src/sim/flight/launch.ts:128-133`).
- The edge ticks are stated correctly against the code. `dockReset` returns before any recharge on the dock tick (`step.ts:211-214`). The jump tick skips the world step (`src/sim/sim.ts:114-118`). Recharge runs at the end of `stepPlayerCombat` (`step.ts:252-256`), before the ledger, so the launching case behaves as described.
- The bank-only case pins a real Oolite detail (`ShipEntity.m:11111-11121`).

**Concerns**

- **MEDIUM. The idle-launch scenario is missing** (see 20-01). This plan is the natural home.
- **LOW. The tripwire pins files, not sites.** Twenty-six files already compare a mode literal. Every FIX site of this phase is in a file already on that list (`flight/step.ts:442`, `autosave.ts:114`, `chart-controller.ts:124-126`, `render-driver.ts:368`). The guard would have caught none of them.
- **LOW. The `resolveShots` row is ambiguous.** A shot from an NPC emits `laserFired` whether or not it hits, so "empty events" needs a rule (see 20-01).

**Suggestions**

- Pin the count of negative comparisons (`!==` against a mode literal) per file, not only the file set.
- State in the freeze table what `resolveShots` is given and why its events are empty.

**Risk: LOW.**

---

## 20-03

**Summary.** One cadence scenario with three kills of three kinds, equal at 30, 60 and 144 Hz, ended by a step budget, with a stable dead hash.

**Strengths**

- The termination trap is real: a dead state's tick stops (`flight/step.ts:478` is never reached), so a tick-based end would hit the frame bound.
- Sampling by step index keeps post-death samples aligned.
- No source file changes, so no QUAL-11 trigger path is touched.

**Concerns**

- **LOW. Equality only across cadences.** A change that shifts all three cadences the same way passes. No literal pins the death step or the dead hash.
- **LOW. Scope of the proof.** The harness steps `stepSim` directly, so it cannot see cadence dependence in the app layer. That is the existing design (`collision-cadence.test.ts`); the twin in 20-09 covers the app path for one route.

**Suggestions**

- Pin the death step index and the cause as literals, as 20-09's twin does.

**Risk: LOW.**

---

## 20-04

**Summary.** The routed kind and `deathFlow`, the session latch, the save refusals in front of the persistence throw, the `gameOver` input context, and the player's explosion.

**Strengths**

- The latch is set synchronously. `stepOnce` dispatches each event right after `stepSim` returns (`src/app/session/sim-driver.ts:242`), so nothing asynchronous can run between the lethal tick and the latch.
- `loop.reset()` from inside a step is supported and stops the frame's remaining steps (`src/app/game-loop.ts:32-35, 56-65`).
- The default `deathFlow` follows the `worldLifecycle` precedent (`event-router.ts:731-734`), so no wiring can drop the latch.
- The guard order is as described (`save-controller.ts:243-271, 278-312`), and `writeManualSave` is reachable directly (`start-session.ts:719`), so the choke-point refusals are needed.
- The input context is fail closed: every action lists its contexts explicitly (`src/input/actions.ts:359-372`) and an unlisted context fires nothing (`src/input/keyboard.ts:161-164, 237-239`).

**Concerns**

- **MEDIUM. `PLAYER_EXPLOSION_SCALE = 4` as a radius multiplier (DIV-2).** In Oolite the factor is a loop count: `how_many = factor; while (how_many > 0.5f)` adds one small and one big burst per pass (`ShipEntity.m:8308-8320`). Each burst is sized from the collision radius itself (`OOParticleSystem.m:302-315`: speed `1 + size * 0.5` up to four times that, particle size `2 * size`). For the Cobra that is at most about 150 m/s for 1 s. The reused cloud computes `size = radius * settings.size` (`src/render/bodies/explosions.ts:392`, `size` 2.5). At four times 72.7 m the particle size is 727 m, the speeds are 582 to 872 m/s, and the flash starts at 291 m (`explosions.ts:403`). NPC ships explode at one times their radius (`event-router.ts:536-549`). The plan forbids tuning.
- **LOW. The latch does not cover two save-touching paths.** `loadFromSave` installs a state, sets the input context and unhides the HUD (`save-controller.ts:376, 440-495`); `clearSaveForNewGame` clears the store (`:542`). Neither is reachable while dead through the UI. The plan's own prohibition says the death must never clear or replace the save.
- **LOW. Hook mutators can still change a dead state** (`src/app/probe.ts:577-650`). They taint, so no save follows, but the "frozen hash" then depends on spec discipline.
- **LOW. The traffic-off explosion cannot fire in practice.** Collisions need the hull table and NPC fire needs the traffic content (`sim-driver.ts:214-217`). The restated nine-field constant and its drift pin serve an unreachable path. It is owner-approved; I only note the cost.
- **LOW. The first explosion of a session is often the death.** Textures load on the first `add` (`explosions.ts`, "Textures" in the header). A 1.5 s cloud can lose its start while the texture loads.
- **LOW. `hudCanvas.hidden = true` is undone on the next frame until 20-08.** The render driver recomputes it every frame (`render-driver.ts:368-369`). Interim only.
- **LOW. F5 is swallowed on the game-over view** (`actions.ts:335-341`), so the browser's own reload key does nothing on a screen whose only exit is a reload.

**Suggestions**

- Resolve DIV-2 before this plan runs (see the verdict).
- Add one-line latch refusals to `loadFromSave` and `clearSaveForNewGame`, and make the hook mutators refuse while latched.
- Request the explosion textures when the model loader opens on the first in-flight frame.

**Risk: MEDIUM** (because of DIV-2; the save and latch work is low risk).

---

## 20-05

**Summary.** The game-over line model and overlay shell, with markup and CSS.

**Strengths**

- `resolveCulpritName` returns `undefined` for an unknown key. `identName` falls back to the key (`event-router.ts:324-337`), so not reusing it is correct.
- The score line follows `showGameOver`, which prints the rating-and-kills string and the credits (`PlayerEntity.m:3630-3643`; strings at `third_party/oolite/Config/descriptions.plist:1991-1993`).
- `textContent` only, listeners only while shown, one-shot reload, injected doubles for Node.
- The `data-dead` rule is needed: the version and status lines are hidden only while the HUD shows or is marked (`index.html:58-63`).

**Concerns**

- **LOW. The text keeps its colour while the scene fades.** Oolite's saturation change applies to the whole view, messages included (`PlayerEntity.m:3566-3590`). The CSS filter is on `#view` only.
- **LOW. Line order.** Oolite's own cause line, for the escape-pod death, is printed before "Game Over" (`PlayerEntity.m:2733-2735`). The plan puts the cause after it. Either is defensible; the row should say which and why.

**Suggestions**

- Apply the same `saturate()` to `#game-over`, or record the difference in the fade row.

**Risk: LOW.**

---

## 20-06

**Summary.** The sim driver stops at the death, the frame loop takes a game-over branch, and pause, focus loss, context loss and the chart refuse while latched.

**Strengths**

- The branch position is right: after the pause toggle (`frame-loop.ts:107-110`) and before `handleChartActions` (`:129`), so no chart or save-screen action is applied.
- The `pause()` branch mirrors the existing no-state branch (`settings-controller.ts:65-69`) and covers `focusLost` and `enterContextLoss` (`:89-98, 121-125`).
- The `advanceTicks` refusal goes before `markHookMutation()` (`sim-driver.ts:423-438`), so it does not taint.
- Wall delta is clamped (`src/sim/loop.ts:23-29`, 0.25 s), so a hidden tab cannot jump the fade.

**Concerns**

- **LOW to MEDIUM. The "steps left in the lethal frame" test can pass vacuously.** After 20-04, `latchGameOver` resets the loop, and `advance` returns at once (`game-loop.ts:61-65`). In a real-time frame `stepOnce` is not called again, so its new early return is not exercised by the "death on step 2 of 5" case. Only `advanceTicks` reaches it (`sim-driver.ts:448-457`).
- **LOW. Wording.** `selectChartSystem` has no existing `paused` refusal (`chart-controller.ts:247-251`). All four non-open entry points already require `chartOpen`, so the new refusals are belt and braces.
- **LOW. The lethal frame is drawn by the normal path at alpha 0**, one tick behind, and not drawn at all when the death happens behind the chart (`frame-loop.ts:135-157`). The next frame corrects it.

**Suggestions**

- Prove the `stepOnce` early return through `advanceTicks` across the death and through a direct `stepOnce` call on a dead state.

**Risk: LOW.**

---

## 20-07

**Summary.** The `#game-over` root travels to the session, the overlay is created and disposed with it, the death flow shows the lines, and the CHANGELOG gets its entry.

**Strengths**

- It copies a proven path (the pause root).
- No in-session load path is added, which matches D-12. `rg "location\.reload|loadSavedGame" src` is empty at HEAD, so both gates start clean.
- Pods, plates, the station and the buoys resolve through `targetNames`; NPC ships through the catalogue.

**Concerns**

- **LOW. A reload needs the network.** There is no service worker (`rg serviceWorker src index.html` is empty). An offline player who dies gets the browser's error page; the save is intact. Oolite's direct load has no such failure. This belongs in the D-12 row.
- **LOW. The human check depends on 20-08** ("the version and system lines stay hidden"). It is end-of-phase UAT, so the order is fine; say so in the plan.

**Suggestions**

- Record the offline case in the D-12 Key Decisions row.

**Risk: LOW.**

---

## 20-08

**Summary.** The dead scene: aft camera 100 m ahead, effect clock, HUD hidden, CSS fade, settle rule, and `probe.death`.

**Strengths**

- The camera follows Oolite's order: the explosion at the old position, then `moveForward:100.0`, with `VIEW_AFT` (`PlayerEntity.m:6203-6209`).
- The effect clock solves a real freeze: every layer is driven by `flightTime` today (`render-driver.ts:299-319`).
- The fade is linear in Oolite too (`PlayerEntity.m:3566-3580`), and the CSS filter adds no draw call.
- `shown()` requests a redraw (`game-session.ts:588-590`), so a settled dead view repaints after a tab switch.

**Concerns**

- **MEDIUM. The camera sits inside the scaled cloud (DIV-2).** See 20-04 for the numbers. The UAT step says "observed, not tuned", so a bad look has no remedy inside the phase.
- **LOW. The dust gets a 100 m camera jump on the death frame.** `dust.update` takes `cameraWorld - previousCameraWorld` (`render-driver.ts:273-280`). The warm Load clears `previousCameraWorld` for this reason (`save-controller.ts:473`).
- **LOW. Debris tumbles on the effect clock while ships stand still.** The tumble is a function of the time passed in (`src/render/bodies/debris.ts:96-105, 255-256`). It is a choice; it should be a stated one.
- **LOW. Layering.** `render-driver.ts` would import `PLAYER_EXPLOSION_SETTINGS` from `event-router.ts`. There is no cycle today, but a small constants module would be cleaner.
- **LOW. Two fade differences are not recorded.** Oolite fades only at detail level shaders or above (`PlayerEntity.m:3569`), and fades the text too.

**Suggestions**

- Clear `ctx.core.previousCameraWorld` on the first dead frame.
- Pass the effect clock to explosions and shots only, or record the debris choice in the frozen-world row.

**Risk: MEDIUM** (visual outcome; the code is low risk).

---

## 20-09

**Summary.** The Node twin, the death-and-reload spec, the untainted game-over-guard spec, fixture options and CI margins.

**Strengths**

- The untainted design is correct. A tainted session returns before any snapshot (`save-controller.ts:259-263`), so a hooked guard spec could not fail.
- The route is lethal by a wide margin: about 1,712 damage at 350 m/s against 384 (`.planning/PROJECT.md:333`). The fallback text will not be needed.
- The fixture can carry the route: an in-flight save stores position, orientation and speed, and the restore applies them (`tests/e2e/helpers/save-fixtures.ts:33-37, 82-89`; `src/persistence/autosave.ts:273-285`).
- Comparing the blob after the final reload proves that `pagehide` writes nothing.

**Concerns**

- **MEDIUM. A wall-clock race in game-over-guard.** The spec must click Continue, read baselines, press Space and assert `inFlight` before a death that comes 1,500 m / 350 m/s = 4.3 s of sim time later (about 514 steps at `DT` 1/120). The real-time loop runs at wall speed on a fast machine. The plan's own prohibition says no assertion may depend on wall time.
- **LOW. The nose-on aim depends on the buoy's pose**, which is a function of the flight clock (`.planning/PROJECT.md:333`). The twin will show a miss, but the plan should say the pose is derived from the twin, not from `statics.spec.ts` alone.
- **LOW. F5 and Ctrl+R are not in the key list** of the guard spec. F5 is swallowed today; nothing pins that either way.

**Suggestions**

- Start at 5 km or more (about 14 s of sim time, still inside the 30 s wait class), or press Space before the first probe read.
- Drop the assertion "still `inFlight` right after the key-down", or make it a precondition that retries the test with a clear message.

**Risk: MEDIUM** (flake risk on CI).

---

## 20-10

**Summary.** Key Decisions, FIDELITY rows and excerpts, todos, the CHANGELOG check, remote `verify-full` and the acceptance run.

**Strengths**

- The agreement standard is explicit and silence is not agreement.
- Excerpts come from `git show 7437f22:` and the contract test runs in verbatim mode.
- The pin lines in the brief are correct. I checked `kDeadResetTime` (`PlayerEntity.m:99`), `performDeadUpdates` (`:3551`), `gameOverFadeToBW` (`:3566`), `showGameOver` (`:3630`), the laser death branch (`:5683-5689`), `getDestroyedBy:` (`:6187-6222`), `pollGameOverControls` (`PlayerEntityControls.m:4016-4027`) and `handleGameOver` (`Universe.m:2961`).

**Concerns**

- **MEDIUM. Task 1 breaks the contract test as written.** `FIDELITY.md:65` (the row "Overflow to the energy bank and cabin heat", E-45) ends with `PROJECT.md: "Floor the player's energy at 0 until a death phase exists"`. Task 1's acceptance gate requires that string to be gone from `PROJECT.md`. The contract test then fails (`tests/contract/fidelity.test.ts:264-270`). The row's reason ("because player death and ejection are outside this milestone") is also no longer true. The plan does not name this row.
- **MEDIUM. The constants ledger would record `PLAYER_EXPLOSION_SCALE` as Oolite's factor "applied to the collision radius".** Oolite applies it to a count (see DIV-2).
- **LOW. Line drift is silent.** 20-01 deletes lines in `collide.ts` and rewrites comments in `ledger.ts`, `shields.ts` and `response.ts`. The contract test checks only that a cited line exists. Rows such as `FIDELITY.md:65` (`shields.ts:152`), `:176` (`collide.ts:239`) and `:182-183` will point at other lines.
- **LOW. `e2e-cross` is in no gate.** Assumption A1 (the CSS filter on a WebGL canvas) matters most in Firefox and is checked only by a human.

**Suggestions**

- Add `FIDELITY.md:65` to Task 1: rewrite its reason and re-quote the amended title.
- Re-point the Wegolite cells of every row that cites a file 20-01 edited.
- Run `e2e-cross` once in Task 3 and record it.
- The DIV-1 row should cite `PlayerEntity.m:5606-5611` (no launch guard), `:6189-6190` (docked only) and `ShipEntity.m:11646-11649` (no scrape while launching).

**Risk: MEDIUM** (the gate itself is mechanical; the two MEDIUM items are documentation correctness).

---

## Overall verdict

The plans achieve the phase goal. The design is sound: one lethal check where the damage is applied, one death function, one session latch set inside the dispatch, and three save-refusal layers. I checked the cited integration points in the source and almost all of them are exact.

Overall risk: **MEDIUM**. No finding blocks execution. Four findings should be settled before or during execution:

1. **DIV-2, the explosion scale (20-04, 20-08, 20-10).** Oolite's `4.0` is a burst count, not a size. Used as a radius multiplier it draws a cloud about four times larger than Oolite's, with the camera 100 m from its centre. I object to that part (see "Divergence verdicts").
2. **The idle straight launch becomes lethal and no test pins it (20-01, 20-02).** By the project's own figures the nav-buoy ram at launch speed deals about 428 damage against 128 shield plus 256 bank. An idle new player dies about 54 s after the first launch. The margin is 11 % and the figure is arithmetic, not a measurement.
3. **20-10 Task 1 breaks the fidelity contract test as written.** `FIDELITY.md:65` quotes the Key Decisions title that Task 1 must delete.
4. **game-over-guard has a wall-clock race (20-09).** The spec must press Space before a death that comes 4.3 s of sim time after Continue.

## Cross-plan notes

- **Ordering and file ownership.** The waves are consistent. Plans of one wave share no file: 20-02, 20-03, 20-04 and 20-05 in wave 2; 20-06 and 20-07 in wave 3. 20-08 correctly waits for 20-07 because of `CHANGELOG.md`.
- **Guards.** The producer guard's allow-list (one app consumer, `event-router.ts`) is compatible with 20-08: the probe reads `gameOverCause`, not the event. At HEAD the token appears only at `src/sim/events.ts:179, 241` (and one comment at `:209`).
- **Late discovery.** `verify-full` first runs in 20-10 with ten plans stacked. The traffic-on specs do not fly long enough to reach the buoy (`traffic.spec.ts:291`, `tick-hook.spec.ts:122`), so I expect no surprise there.
- **Scope.** The only scope question is the traffic-off explosion (20-04). Everything else is within the roadmap's implied work.
- **Security.** Nothing to add. `textContent`, a closed name lookup and the taint rule cover the surface.

---

## Divergence verdicts

- DIV-1 (launching player never dies): ACCEPT — Oolite lets a laser kill a launching player (`takeEnergyDamage` returns only for dead, escape sequence or zero damage, `PlayerEntity.m:5606-5611`; `getDestroyedBy:` refuses only when docked, `:6189-6190`), but it already exempts a launching ship from scrape damage (`ShipEntity.m:11646-11649`). Extending the exemption to lasers removes death from inside the launch sequence, is unreachable in normal play, and is the owner's decision; the row must say that a launching bank can rest at 0.
- DIV-2 (explosion form, D-01): OBJECT — Reusing the Phase 16 cloud in place of fragment bursts is acceptable, but the radius multiplier is not: Oolite's `4.0` is a burst count (`ShipEntity.m:8308-8320`) and each burst is sized from the collision radius itself (`OOParticleSystem.m:302-315`), so four times the radius draws a cloud about four times larger than Oolite's with the camera 100 m from its centre. Resolved by adding the cloud at one times the radius (optionally several adds with distinct seeds), or by an owner decision that records the size as Wegolite's own choice and allows UAT to change it.
- DIV-3 (cause line, D-02): ACCEPT — The line is clearer and costs nothing, and Oolite itself prints a cause line above the same screen for the escape-pod death ("Life Support Failure!", `PlayerEntity.m:2733-2735`). Names come only from compiled content.
- DIV-4 (no 30 s auto-restart, D-06): ACCEPT — Oolite restarts after `kDeadResetTime` = 30 s (`PlayerEntity.m:99, 3559-3563`); in a browser tab an unattended reload is a surprise, and waiting for input loses nothing.
- DIV-5 (input rule, D-07): ACCEPT — Oolite's `spacePressed` is a static that only the report, mission and game-over polls update (`PlayerEntityControls.m:132, 2459-2472, 4016-4027`), so a Space held from flight restarts at once and skips the screen. The fresh-press rule fixes that, and the click is a natural browser input that cannot fire from a button held before the overlay appeared.
- DIV-6 (reload to title, D-12): ACCEPT — Oolite loads the save directly and falls back to the start screen when there is none (`Universe.m:2961-2968`). The reload gives a guaranteed clean session with no in-session load pipeline, at the cost of one click and a network dependency (no service worker) that the row should record.
- DIV-7 (frozen world): ACCEPT — Oolite keeps updating the universe while dead (`PlayerEntity.m:2450-2453, 3551-3564`). Freezing gives the deterministic dead hash and removes every post-death side effect; the visible cost is small and the row should state which layers still animate.
- DIV-8 (no equipment removal): ACCEPT — Oolite removes equipment so that nothing is scooped or damaged in the universe that keeps running (`PlayerEntity.m:6220`). With a frozen world and a reload there is nothing to protect; the row should add that Wegolite's lethal scrape can still emit `equipmentDamaged` on the death tick, which Oolite cannot, and that it is never saved.
