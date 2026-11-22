---
phase: 20
reviewers: [fable, sonnet, kimi]
reviewed_at: 2026-11-22T18:19:35Z
plans_reviewed: [20-01-PLAN.md, 20-02-PLAN.md, 20-03-PLAN.md, 20-04-PLAN.md, 20-05-PLAN.md, 20-06-PLAN.md, 20-07-PLAN.md, 20-08-PLAN.md, 20-09-PLAN.md, 20-10-PLAN.md]
models:
  fable: "fable (Claude Agent subagent)"
  sonnet: "sonnet (Claude Agent subagent)"
  kimi: "opencode-go/kimi-k3.1-pro"
model_sources:
  fable: "agent-model-alias"
  sonnet: "agent-model-alias"
  kimi: "opencode -m flag"
---

# Cross-AI Plan Review — Phase 20

Reviewers run per the owner's standing rule (own Agent subagents by default, opencode models allowed): Fable and Sonnet as Claude subagents, Kimi K3.1 Pro through opencode. Each received the same prompt (project context, roadmap section, requirements, CONTEXT, RESEARCH, all ten plans, a plan coverage manifest, and an explicit per-divergence ACCEPT/OBJECT section). All three covered every plan id.

<!-- gsd:plan-revision-conflicts:begin -->
## Plan-Revision Conflicts
<!-- gsd:plan-revision-conflicts:end -->

## Fable Review

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

---

## Sonnet Review

# Cross-AI Plan Review: Phase 20 (Player Death and Game Over)

Reviewer: Sonnet 5.5. Read-only review. Repository HEAD 791cec0; Oolite pinned at 7437f22.
Method: I read the CONTEXT, the RESEARCH sections that matter, and all ten plans (objectives, behaviours, actions, acceptance rules). I checked the load-bearing claims against the repo and Oolite. I did not run builds or tests. I did not use the codebase-memory MCP; I used `rg` and file reads.

Claims I verified:
- `src/sim/combat/ledger.ts:192-229` is the player branch. The internal-damage gate is `(record.kind === "scrape" || combat.energy > 0)` at `:212-215`.
- `src/sim/combat/shields.ts:159-179` and `:199-212` floor the bank and return `applied`, as RESEARCH says.
- `src/sim/combat/step.ts:769-838` has the order `applyLedger` (`:798`), NPC kills, `applyPlayerPush` (`:832`), `drainAiEventsNow`, `commitWorld`, `updateIdentTarget`. The place for `killPlayer` is correct.
- `src/sim/combat/collide.ts:232-240` and `:451` hold the tripwire marker. `destroyable: true` is at `:467` and `:501`, so the "2 to 3" acceptance count is right.
- `src/sim/sim.ts:111-120` gates the world step on `launching || inFlight` and skips it on the jump tick.
- `src/persistence/autosave.ts:114` is `state.mode === "inFlight" ? "inFlight" : "docked"`. A dead state would be saved as docked, so the refusal is needed.
- `src/app/session/save-controller.ts:243-271` has the guard order the plans describe. `snapshotForSave` has exactly one app caller, at `save-controller.ts:173`.
- Oolite agrees with the ledger rule. `PlayerEntity.m:5683-5689` (laser) and `ShipEntity.m:11669` (scrape) both die on `energy <= 0.0` after the shield. The internal-damage loop of a lethal scrape still rolls (`PlayerEntity.m:5744-5752`), and a lethal laser does not roll (the `else` at 5690).

## 20-01

**Summary.** The death commit. It adds `FlightMode "dead"`, the ledger's lethal check, `killPlayer` (called once from `resolveShots`), the freeze in `stepSim` and `stepFlight`, `destroyable: true` for the player, a producer-scope guard replacing the retired tripwire, the `snapshotForSave` refusal, a caller audit for the unlatched window, and the CHANGELOG line. Pin maintenance follows in Tasks 2 and 3.

**Strengths**
- The lethal predicate sits at the damage point, before the floor hides it (`ledger.ts:192-229`, `shields.ts:171`). It matches Oolite's `energy <= 0.0` after shields. The `applied > 0` condition keeps a fully absorbed hit from killing.
- The optional trailing `outcome` parameter avoids breaking about 20 `applyLedger` tests that `toEqual` the array.
- The culprit is resolved to a spec or ident key before `killShip` runs (`step.ts:818-830`). A culprit destroyed on the same tick is still named, and no entity id or kill-credit field is read. This respects both consumer guards.
- Putting `killPlayer` in `src/sim/combat/` keeps the change out of the `world/**` and `npc/**` QUAL-11 trigger paths.
- The freeze early return is placed before `sanitizeFlightState`. This matters because the clock block in `flight/step.ts:442` is a negative gate (`modeAtStart !== "docked"`) and would keep a dead clock running.
- Replacing the guard instead of only deleting it keeps the single-producer rule machine-checked, with a vacuity floor and synthetic cases.
- The save safety for the window before 20-04 is handled by the `snapshotForSave` throw. The plan checks that only one app caller exists, and it adds a controller-level no-write test in Task 3.
- The 250 m/s stop-and-report clause is an explicit must-have. No outcome is pinned before it is measured.

**Concerns**
- MEDIUM, scope and context. Task 1 is a 13-item atomic change over about 15 source and test files, with `tokens: 95000` and `confidence: low` in the frontmatter. The atomicity argument is sound: the retired guard fails on any partial change. But a lost thread in the middle is expensive, because every file must be consistent before the suite is green. Suggest recording an explicit internal ordering in the plan: the types and events, then death.ts and the ledger, then step.ts and collide.ts, then the freeze, then the guards and tests. Also tell the executor to run `tsc` after each group, since nothing is committed until the end.
- MEDIUM, a laser-only death in the window between 20-01 and 20-06. In the real app with traffic on, a ram into the nav buoy can now kill the player. Until 20-06 and 20-07 land, `stepOnce` is not guarded (`sim-driver.ts:175-232`), `render-driver` has no dead branch, and the router does not handle `playerDestroyed`. This is owner-accepted and not pushed. But the plan relies on `stepSim` returning `[]` and on the `snapshotForSave` throw as the only protection. The throw surfaces as an uncaught exception in whatever frame or event handler called `autosave`. The audit argues no trigger is reachable, which is correct for the current call sites. Keep the "stop and report if a trigger is reachable" instruction.
- LOW, `outcome.playerDeath` is only consumed inside `if (world !== undefined && worldStepped)`. Player records only exist with a stepped world, so this is fine. A one-line comment saying why would prevent a future reader from "fixing" it.
- LOW, the order of `applyPlayerPush` then `killPlayer` is chosen but the plan's own text says "pick one and pin it". The plan does pick it (push, then die). Make sure the 20-02 or 20-03 hash test fails if the order flips, because `drift` appears in the hash.
- LOW, after `killPlayer`, `drainAiEventsNow` still runs with `player.mode === "dead"`. AI handlers that read `player.mode` (for example `npc/proximity.ts:357`, where `!== "docked"` pushes the player body) will see a dead player for one drain. This is harmless because the world freezes next. Say so in the plan or pin that the events after `playerDestroyed` are only `aiFaulted`, `entityRemoved` and ident events.

**Suggestions**
- Add the internal edit order and a `tsc` checkpoint to Task 1.
- Add a test that the lethal-tick event order is unchanged by a second `resolveShots` call on the dead state (already partly covered by "second `resolve` on the dead player emits no hit event").

**Risk: MEDIUM** (size, not design).

## 20-02

**Summary.** Sim-level edge proofs. The dock, jump, launching, countdown and ident ticks, the mutual kill, two lethal shooters, the lethal ram with Oolite's reversal and the bank-only comparison, the ledger's boundary and its internal-damage gates, a freeze table over every sim entry point, a lethal-predicate property test, and two early returns (`applyWitchpointArrival`, `completeLaunch`).

**Strengths**
- The bank-only case is the right trap to pin. It needs a ram whose damage exceeds the bank but not shield plus bank. `selfDestroyed` is then true and the response reverses the player, but the ledger leaves the player alive. This shows both Oolite details together (`ShipEntity.m:11111` and the shield-first scrape in `PlayerEntity.m:5726-5740`).
- Both internal-damage gates are pinned (lethal scrape still rolls, lethal laser rolls nothing). This is faithful to `PlayerEntity.m:5683-5697` against `:5744-5752`.
- The freeze table drives real entry points and compares hashes before and after, never internal call counts.
- The two early returns are narrow. The plan explicitly refuses a broader mode check in `completeLaunch`, because existing tests call it from a docked state.
- Fixes are restricted to `src/sim/combat/`, with a stop-and-report if a trigger path would need an edit.

**Concerns**
- MEDIUM, brittleness of `tests/guards/dead-mode-gates.test.ts`. It pins the exact set of files that compare a mode against a `FlightMode` literal (about 26 files today). The list is measured at wave 2. Later waves (20-04, 20-06, 20-08) edit gating files. If any of them adds a mode comparison in a file not yet in the set, for example `settings-controller.ts` (which has none today) or `event-router.ts` if an executor writes `mode === "dead"` there, the guard fails in a later plan. The plan says "no other plan of the phase adds a new comparing file" but gives no instruction to the later executors. Suggest either (a) naming this constraint in 20-04, 20-06 and 20-08, or (b) making the guard require only that the pinned set is a superset and report additions as a review prompt. If left as is, the failure mode is a spurious red in wave 3 or 4.
- LOW, "Jump tick: a player at bank 0 with an NPC shooter in range" builds an inFlight player at bank 0. After this phase such a state cannot occur naturally. It is a valid fixture, but name it as a constructed state so nobody reads it as reachable.
- LOW, "Two lethal shooters: the culprit is the lower shooter id's spec key" depends on the record order. Records are in shot order, then collisions (`step.ts:769-790`). Say what orders the shots (NPC iteration order by id), so the test is not accidentally order-dependent on spawn order. The mutual-kill case already has a "swapped spawn order" variant; add the same to this one.

**Suggestions**
- Add the later-plan constraint to the guard's header and to 20-04, 20-06 and 20-08.

**Risk: LOW-MEDIUM.**

## 20-03

**Summary.** QUAL-11's determinism half. One Vitest scenario with an NPC-against-NPC kill, a collision kill and the player's death. It is replayed at 30, 60 and 144 Hz and sampled by step index, then checked for 240 steps after the death.

**Strengths**
- It copies the frame runner and the cap handling of `collision-cadence.test.ts`. Sampling by step counter (not by tick or wall time) lines samples up across cadences.
- It has a non-vacuity guard: each kill must be observed once per cadence at the same step index, and every wait must end on its event, not its bound.
- The stable dead hash is asserted over 240 steps, tied to the freeze.
- It never calls the death function directly, so it proves the real path.
- The stop-and-report rule for a needed `src/` change keeps the QUAL-11 trigger paths untouched.

**Concerns**
- MEDIUM, arrangement risk. The timeline needs three kills in one scenario: an NPC beam kill far from the player, a player collision kill that the player survives, then a lethal contact. The player's 350 m/s ram of a Krait leaves it alive (about 228.6 damage, below the 256 bank, per 20-01 Task 2), so a second contact for the death is needed. The geometry, spawn positions and pilot setup can take several iterations. The plan allows "stop and report" but gives no fallback. Suggest allowing the collision kill to be a buoy or a static (not a ship) if a ship ram is hard to arrange, and say so now.
- LOW, "hard step budget that the test asserts was not reached before the death" is fine, but also assert the death step index is identical across cadences, not only the hashes (the plan lists this; keep it as a separate assertion for a clearer failure message).

**Suggestions**
- State the fallback arrangement.

**Risk: LOW-MEDIUM.**

## 20-04

**Summary.** The app half of the single death path. It routes `playerDestroyed` to a seventh subscriber `deathFlow`, sets the session latch inside the dispatch, puts refusals at `autosave`, `manualSave`, `writeManualSave`, `buildSnapshotInputs` and `queueSnapshot`, adds the `gameOver` input context, and adds the player's explosion at Oolite's factor 4.0.

**Strengths**
- The latch is set synchronously inside `stepOnce`'s dispatch loop (`sim-driver.ts:~230`: `for (const event of events) router.dispatch(event)`), so nothing asynchronous can run between the lethal tick and the latch. This is the key property for DEATH-06.
- The latch is checked before `contextLost` (the guard that is first today), so a dead player never gets "recovering" or "tainted" instead of "dead".
- `writeManualSave()` is reached directly from `start-session.ts:719` (overwrite dialog), bypassing `manualSave`. The plan covers it, which many designs would miss.
- Three layers (controller, choke points, `snapshotForSave`) with the same-frame and pending-write races as Vitest cases.
- The pending-write analysis is correct: a queued write is a valid pre-death anchor, never a dead snapshot. Phase 20 adds no in-session read after D-12, so "does `store.read()` wait" is only a boot question.
- The routed-kind pin, the subscriber order, the 25-kind count and the reserved pass-through loop are all listed for update.

**Concerns**
- MEDIUM, a hand-copied constant for no reachable benefit. Task 2 adds `PLAYER_EXPLOSION_SETTINGS`, a frozen copy of the nine fields of the `oolite-default-ship-explosion` record. It exists so the explosion plays with traffic off ("owner revision 2026-11-22"). But with traffic off the player cannot die at all. `ctx.core.hulls` is built only when `testFlags.traffic` is on (`start-session.ts:269-293`, `ctx.core.hulls = hulls` at `:309`), and the collision stage needs `options.combat.hulls` (`step.ts:781-786`). NPC weapons also load only with traffic (`:285-287`). So no ledger record for the player can exist with traffic off, and the traffic-off explosion branch is unreachable in the app. The cost is a duplicated content constant plus a drift test, which is the very hand-copying that "content is compiled" discourages. Suggest reading `ctx.core.npcTraffic?.explosion` and doing nothing when it is absent, or loading the explosion catalogue only for the death. If the owner insists, record in the plan that the branch is defensive.
- LOW, the `closeSaveScreen` dep is a no-op in flight (the save screen opens only when docked, `save-controller.ts:579`). Harmless; keep for safety or drop to shrink the dependency surface.
- LOW, events after `playerDestroyed` in the same dispatch (`aiFaulted`, `entityRemoved`, ident events) reach subscribers after `messages.clear()`. A subscriber that enqueues a message for those events would put text back on a hidden HUD. The HUD is hidden, so this is harmless; add a test that no message is shown after the death on the lethal tick.
- LOW, "twenty-three kinds have one subscriber" comment and loop edits in `session-order.test.ts` are error-prone; the plan lists them well. No change needed.

**Suggestions**
- Drop or justify the traffic-off explosion constant.

**Risk: LOW-MEDIUM.**

## 20-05

**Summary.** A self-contained game-over view: a pure line model (Oolite's three lines plus the cause line) and a thin DOM shell that reloads on a fresh Space or a click, plus its markup and CSS.

**Strengths**
- It needs no session wiring, so it can be built and proven in Node.
- The overlay attaches its listeners only at `show`, so a Space held during flight cannot trigger it, and `event.repeat` is checked. A held Space (first keydown has `repeat: false`, auto-repeats have `repeat: true`) cannot dismiss it.
- It writes through `textContent` only. The reload happens at most once (guarded), and `dispose` aborts the listeners.
- No raw key can reach the screen: `resolveCulpritName` returns `undefined` for an unknown key and the cause falls back to "Destroyed".
- The score line reuses `formatRating` and `formatDecicredits`, with an explicit check that the " ₢" suffix exists before cutting it.

**Concerns**
- LOW, the fresh-Space rule has one hole: a user who has Space rebound to a flight action (bindings are rebindable; the default for fire is `KeyA`, `actions.ts:214`) and who taps it during the death frame will skip the screen at once. This matches Oolite (a Space press in the dead state restarts immediately, `PlayerEntityControls.m:4016-4027`). It is an accepted trade-off under D-07, but the first-frame instant dismissal is worth one line in the FIDELITY row.
- LOW, a click dismisses with no delay. There is no mouse flight in the game (the only click handlers are in menus, `rg` found none in flight), so an accidental dismissal needs a deliberate click. Fine.
- LOW, the CSS selector extension `#hud[data-dead] ~ #overlay #title` depends on the DOM order of `index.html`. The plan says 20-08 sets `data-dead`; there is no test that the sibling combinator matches in the real markup. Add a `tests/ui` or e2e assertion that the title and status lines are hidden after the death (the UAT note covers it by eye only).

**Suggestions**
- Add one DOM-order assertion for the `data-dead` selector.

**Risk: LOW.**

## 20-06

**Summary.** The app stops moving a dead session: `stepOnce` returns early, `advanceTicks` refuses, the frame loop takes a game-over branch that only draws and advances the presentation clock, and `pause`, focus loss, context loss and every chart entry point refuse while latched.

**Strengths**
- The refusal in `advanceTicks` comes before `markHookMutation()`, so a refused call does not taint. This matters for the untainted guard spec in 20-09.
- The presentation clock uses wall time, also under the manual clock, so a test that steps manually still sees the fade and explosion progress.
- No frame count or timer ends the game-over branch (D-06), and a test runs 1,000 frames.
- `pause()` clears held input and returns, which covers `focusLost()`, the `P` toggle, `enterContextLoss()` and the public pause in one place.
- `exitContextLoss` calling `renderFrame(0)` on a dead state is anticipated.

**Concerns**
- MEDIUM, the frame-loop branch placement. The plan says the branch goes "right after the pause-toggle block and before the docked message-seconds block". In the lethal frame itself the earlier part of the frame (`advanceFrame` of up to 5 steps) has already run, and the code after it still executes for that frame (HUD updates, hints, the render call). Verify that nothing in the post-advance part of the lethal frame touches a dead state in a way the `renderFrame` dead branch (20-08, wave 4) does not expect. Between 20-06 and 20-08 `render-driver` still has the cockpit-from-pose camera path for `dead` (RESEARCH Inventory 1: `render-driver.ts:245`). This is only an intermediate-commit visual issue, not a correctness one.
- LOW, `advanceTicks(n)` "across the death returns the death tick (the loop broke on the lethal step)". The break condition reads `ctx.runtime.gameOver`, which is set by dispatch inside `stepOnce`. Confirm `stepFixed` returns the control to the loop right after the dispatch and does not run a pre-launch `autosave()` (`sim-driver.ts:289, 331`) after the lethal step. Those anchors are conditioned on docked pre-roll, so they cannot fire. Keep the test that no `autosave` attempt happens after the lethal step.
- LOW, `settings-controller` `pause()` on a latched session also needs to stop the focus-loss path from showing the overlay when `pauseOnFocusLoss` is off; it does not matter (it returns early in both cases).

**Suggestions**
- None blocking.

**Risk: LOW.**

## 20-07

**Summary.** Wires the overlay into the session: the `#game-over` root travels from `main.ts` to the session, the overlay is created and disposed with the session, `createDeathFlow` shows the four lines in the latching dispatch, and the CHANGELOG entry ships.

**Strengths**
- The root travels the same way as the pause root, so the wiring is the least surprising possible.
- The overlay is optional in the death flow (no overlay: still latches, does not throw), so unit harnesses without a DOM keep working.
- D-13 is tested as "identical `show` arguments for every save status", which proves no special game-over behaviour for a missing or bad save.
- The CHANGELOG sentence is in the same commit as the view, as AGENTS.md requires.
- The plan states explicitly that no `loadSavedGame` or in-session load pipeline is built, closing a ROADMAP implied-work item by the owner's page-reload decision.

**Concerns**
- LOW, the traffic-off wording case ("Destroyed" for a laser, "Destroyed in a collision" for a ram, never the key) cannot occur in the app, for the reason given in 20-04 (no death with traffic off). Keep it as a defensive unit case, but do not describe it as a user-visible state.
- LOW, the nav-buoy ram culprit name needs `ctx.core.targetNames`, which is built from `staticArtifact?.names`, loaded only with traffic (`start-session.ts:290-292, 547`). With traffic on it works. The e2e death route uses `traffic=1` (20-09), so the browser spec sees "Collided with Navigation Buoy". Note this in the spec so a future default change does not silently turn the line into "Destroyed in a collision".
- LOW, `ctx.core.labels?.rating[0] ?? ""` gives an empty rating if labels failed to load. `formatRating("", 0)` would print "   (0)" with an empty label. Labels load on the same failure surface as boot, so this cannot happen after a successful boot. No action.

**Suggestions**
- Mention in the e2e spec that the cause line depends on `traffic=1`.

**Risk: LOW.**

## 20-08

**Summary.** The dead scene: the aft view 100 m ahead of the explosion point, the explosion on a presentation clock (the sim clock is frozen), the HUD hidden, a five-second CSS saturate fade, plus the probe `death` key and the CHANGELOG sentence in the same commit.

**Strengths**
- The presentation clock (`flightTime + gameOverSeconds`) fixes the real trap: with `flightTime` frozen the explosion, shots and debris would freeze on the death frame.
- It is faithful to Oolite's camera. `getDestroyedBy:` sets `VIEW_AFT` and calls `moveForward:100.0` (`PlayerEntity.m:6200-6209`), so the camera sits 100 m ahead of the explosion looking back. The plan computes `position + forward*100` with the aft view.
- The fade is linear over 5 s from `gameover-seconds-to-bw-fadeout` (`PlayerEntity.m:3566-3568`, `3575`), written only when the string changes.
- The draw gate keeps drawing until the larger of the fade and the explosion duration has passed, then idles like a paused view.
- The probe key is optional, deleted when not latched (not `undefined`), and the fixture `probe-shape.json` is untouched, enforced by a guard-mutation acceptance row.

**Concerns**
- MEDIUM (unverified assumption A1), the CSS `filter: saturate()` on the WebGL canvas element. It generally works in Chromium and Firefox on the canvas element, but it is an extra compositing cost and was not measured. The plan marks it as a UAT item for both browsers, which is right. If it fails in one browser, there is no fallback in the plan. Suggest naming the fallback now (a full-screen overlay with `backdrop-filter` or `mix-blend-mode: saturation`, or a post pass), so the executor does not have to invent it mid-wave. Oolite itself applies the fade only at shader detail levels (`PlayerEntity.m:3568`), so a failed fade is a cosmetic divergence rather than a blocker.
- LOW, the explosion is "one Phase 16 cloud and flash" at 4x the player's radius, about 290 m for the Cobra's 72.7 m radius. The camera is 100 m from the origin, inside that radius. The cloud will fill the screen and may look like a flat wash. The plan says "observed, not tuned". Fine, but record the observation in the UAT row so the owner can decide.
- LOW, Oolite's `becomeLargeExplosion:` also calls `releaseCargoPodsDebris` after the bursts (`ShipEntity.m:8322` onward). The player's cargo is not released as pods here. This is invisible after the reload, but the FIDELITY row for the explosion should mention it (see DIV-2 and DIV-8).
- LOW, `hudHidden` for `"dead"` plus `data-dead` is set in the render driver, so the version and system text hide only once a frame has rendered after the death. That is the very next frame.

**Suggestions**
- Name the saturate fallback. Add the cargo-pod release to the explosion row.

**Risk: LOW-MEDIUM** (rendering only, outside the sim and the hash).

## 20-09

**Summary.** The two D-16 browser specs and the Node twin they rest on. death-and-reload steps a seeded in-flight save to the death through the manual-clock hook, presses Space, checks the title offers Continue, and resumes the save with its damaged equipment (plus a no-save variant). game-over-guard flies the same ram in an unhooked, untainted real-time session, so its save checks can fail if a dead player is saved. CI timeout margins are applied.

**Strengths**
- The route is single and consistent: a full-speed ram into the Lave nav buoy from a seeded pose, proven lethal by a Node twin before either spec is written.
- The guard spec runs untainted. A tainted session never writes (`save-controller.ts:258-262` and `:301`), so a tainted guard spec would be vacuous. The plan reads `probe.test.tainted` as false and compares `probe.save.writes` and the stored blob byte by byte.
- It covers the real races: held Space auto-repeat, `KeyH` (the in-flight autosave trigger via the countdown), F2, P, Escape, F6, a held `KeyW`, blur and a hidden-tab event, with a `requestAnimationFrame` loop in the page for 30 frames and not a sleep.
- It proves the blob is unchanged after the reload, which catches a write on the way out.
- The fallback decision (hooked route, and the Vitest coverage of criterion 2) is written down.
- The CI margins rule is applied (three times the remote time below 60 % of the timeout).

**Concerns**
- HIGH-to-MEDIUM, lethality of the chosen route is unproven. The whole plan rests on a 350 m/s ram into the nav buoy killing a player at full shields and bank. The CONTEXT says the 18-20 measurement found "both destroyed" at 350 m/s, but that was measured when the player was not destroyable, and 20-01 itself notes the Krait ram at 350 m/s leaves the player alive (228.6 damage against a 256 bank). The buoy's mass and the response kernel decide the player's `dam1`; the 20-01 plan says RESEARCH "puts dam1 far above shield plus bank" but calls it unmeasured at 250 m/s. The twin and the stop-and-report rule handle this properly, and the objective names the fallback. Because 20-01 Task 2 (250 m/s) and 20-09 (350 m/s) are separate measurements, I recommend running the 350 m/s buoy twin at the start of wave 1 (read-only, no commit) so a negative result surfaces before waves 2 to 4 are written on top of it, not at wave 5. A negative result changes 20-01 Task 2, 20-02 Task 2 (the buoy cases) and 20-09 together.
- MEDIUM, the real-time untainted spec depends on a deterministic tick count at the death but only reads `probe.death`. Fine. But a real-time ram run can differ in frame pacing. The sim steps at fixed dt, so the tick is deterministic, but the plan waits "a few seconds" and relies on `probe` waits. Make sure the wait has an explicit timeout that is an expression of the ram time, as the plan says for `setTimeout`.
- LOW, `DEATH_RAM_POSE` places the player 1,500 m out at 350 m/s (about 4.3 s). With `traffic=1`, NPC traffic is live in a real-time session and could cross the path (collision with a ship, a different cause). The twin runs the same session options, so it would show it. Pin the culprit in the twin and keep the spec assertion on the cause.
- LOW, Firefox is outside `verify` (`e2e-cross`). The reload and keyboard behaviour is only covered in Chromium by the gate. The UAT mentions both browsers. Acceptable.

**Suggestions**
- Run the 350 m/s twin first (see above).

**Risk: MEDIUM** (the route precondition).

## 20-10

**Summary.** Close-out: Key Decisions rows and amendments, the DEATH-01 wording, FIDELITY rows and pinned excerpts (E-171 on), todo moves, the CHANGELOG check, then remote `verify-full` and the by-hand 20-seed acceptance run. A phase prerequisite is `20-REVIEWS.md`, with an explicit accepting comment per divergence.

**Strengths**
- The agreement standard is explicit and halts the plan if a divergence lacks an accepting comment ("silence is not agreement"). This matches the fidelity rule in AGENTS.md.
- No version bump, no tag, no Unreleased move (D-15), enforced by a guard-mutation acceptance row on `package.json`.
- The acceptance run is safe. `tests/acceptance/npc-flight.acceptance.ts` passes no combat options (no `collisions`, no `npcWeapons`; `rg` found none), so the player cannot die in it, and the trigger-path check (`src/sim/npc`, `src/sim/world`, `ships-npc.json`) is an empty diff for the whole phase.
- The collision-reversal todo is closed and the mutual-kill todo is annotated as checked.
- The old interim FIDELITY row for the collision exemption is rewritten to faithful, so no stale row remains.

**Concerns**
- MEDIUM, the FIDELITY rows must quote exact Key Decisions substrings (`tests/contract/fidelity.test.ts`, verbatim mode). Many rows (about 10) quoting four new Key Decisions titles is fragile. The plan tells the executor to check both contract-test runs, which is the right control. Write the four Key Decisions titles first and copy them into the rows, never retype.
- LOW, the explosion row should record that Oolite also releases cargo pods (`ShipEntity.m:8322` onward, `releaseCargoPodsDebris`) and that the player's `becomeLargeExplosion` also calls `noteKilledBy:` first (script events). Neither is modelled; neither matters after the reload.
- LOW, the acceptance run is first run at the very end. It is safe by construction (no combat options), so an early failure is unlikely. If it did fail, the fix would be in files the phase promises not to touch.
- LOW, `verify-full` runs once at the phase HEAD. The two new specs' first remote run is in 20-09. Fine.

**Suggestions**
- Add the cargo-pod note. Copy the Key Decisions titles programmatically or by paste.

**Risk: LOW.**

## Cross-plan summary

**Coverage of the phase goal.** Every success criterion has a plan: death at zero energy while `inFlight` (20-01, 20-02), a dead player never saved with the latch and three layers (20-01, 20-04, 20-06, 20-09), reload and Continue (20-05, 20-07, 20-09), determinism (20-03), and the release gate (20-09, 20-10). The dependency order is sound. The waves isolate the sim, the app, the UI and the render, and the intermediate state is owner-accepted.

**Top concerns**
1. (20-09, also 20-01 Task 2 and 20-02 Task 2) Lethality of the buoy ram at 250 and 350 m/s is unmeasured for a destroyable player. Measure it at the start of wave 1, because three plans pin it.
2. (20-04, 20-07) The traffic-off explosion constant and wording branches are unreachable in the app, because collisions and NPC weapons need traffic (`start-session.ts:269-293`, `step.ts:781-786`). Remove the hand-copied nine-field constant or mark it defensive.
3. (20-01) Task 1 is very large for one atomic commit. Add an internal order and `tsc` checkpoints.
4. (20-02) The `dead-mode-gates` file-set guard can go red in a later wave because of a legitimate edit. Tell the wave 3 and 4 executors.
5. (20-08) The CSS saturate fade has no named fallback if it fails in one browser.
6. (20-03) The three-kills arrangement may take iterations; state a fallback.
7. (FIDELITY, 20-10) The explosion and death rows should mention the unmodelled cargo-pod release and the script event.

**Security and performance.** No new trust boundary beyond text written with `textContent` and a reload. No performance concern: one extra branch per frame while dead, a single CSS filter.

## Divergence verdicts

- DIV-1 (launching player never dies): ACCEPT — Oolite's `takeEnergyDamage` has no launching check (`PlayerEntity.m:5599-5612`) but its collision path ignores a launching player (`ShipEntity.m` `takeScrapeDamage:` "no collisions during launches"); the owner's `inFlight`-only rule is simpler and safer, and the ledger still floors the bank. The row must say this is a known Oolite difference and pin that a launching hit floors and never emits `playerDestroyed`.
- DIV-2 (explosion form, D-01): ACCEPT — the factor 4.0 is Oolite's own (`PlayerEntity.m:6208`) and one reused Phase 16 cloud at 4x the radius is a reasonable form difference from the four small plus four big fragment bursts (`ShipEntity.m:8308-8320`). The row should also say that `becomeLargeExplosion:` releases cargo pods afterwards (`ShipEntity.m:8322` onward) and that this is not modelled.
- DIV-3 (cause line, D-02): ACCEPT — an extra line that names the cause is additive, not a change to Oolite's three `gameoverscreen-*` lines (`PlayerEntity.m:3636-3642`), and it comes from compiled names, not from kill credit.
- DIV-4 (no 30 s auto-restart, D-06): ACCEPT — `kDeadResetTime = 30` (`PlayerEntity.m:99`, `3559`) restarts a native app, while an unattended browser tab that reloads itself and then offers Continue is worse than waiting, and input still ends the view as in Oolite.
- DIV-5 (input rule, D-07): ACCEPT — Oolite's latch (`spacePressed`, `PlayerEntityControls.m:4016-4027`) lets a Space held from flight restart the game at once; requiring a fresh press (`event.repeat` false) is clearly better, and adding a click suits a browser. A tap on a Space-bound flight action still skips the view, as in Oolite.
- DIV-6 (reload to title, D-12): ACCEPT — Oolite's `handleGameOver` (`Universe.m:2961-2968`) loads the last save directly, while the reload reaches the same save through the existing boot read and title Continue and removes the in-session load pipeline and its race surface. The row must record the one visible difference (the title screen in between).
- DIV-7 (frozen world): ACCEPT — Oolite keeps the universe running in the dead window (`performDeadUpdates`, `PlayerEntity.m:3552-3562`), but nothing in the milestone can use that time, and a frozen world gives the owner's deterministic dead hash and avoids a second save-path hazard.
- DIV-8 (no equipment removal): ACCEPT — `removeAllEquipment` (`PlayerEntity.m:6220`) exists to stop scooping and equipment damage while dead; the world is frozen, no save is written and the reload restores the last save, so skipping it has no observable effect. The row should say the profile is untouched at death.

---

## Kimi Review

# Phase 20 Plan Review

Review basis: repository source at `791cec0` and Oolite source at pin `7437f22`. No builds or tests were run, as requested.

## 20-01

**Summary**

This plan establishes the simulation’s single death path: the ledger detects the lethal record, `killPlayer` performs the one mode transition, the player becomes collision-destroyable, the simulation freezes, and persistence refuses to encode a dead player. It also retires the old tripwire and introduces a producer-scope guard.

**Strengths**

- The lethal decision is placed where the damage is actually applied, using the pre-floor bank. `routeDamage` and `routeScrapeDamage` floor energy and return `applied` at `src/sim/combat/shields.ts:159-179` and `src/sim/combat/shields.ts:199-212`, so the proposed `energyBefore - applied <= 0` test avoids the next-tick recharge trap.
- The call placement fits the real combat pipeline. `resolveShots` applies the ledger, performs NPC kills, applies the player push, drains AI events, commits removals, and updates ident at `src/sim/combat/step.ts:798-837`. Inserting `killPlayer` after `applyPlayerPush` gives the required event order and allows a culprit destroyed on the same tick to remain nameable.
- Culprit resolution is compatible with actual collision records. Collision records carry the other collider’s id as `source` at `src/sim/combat/collide.ts:804-824`, while static ids resolve to `"buoy"`, `"buoy-witchpoint"`, or `"coriolis-station"` through `src/sim/world/statics.ts:79-100,167-172`.
- The freeze addresses a genuine fail-open site: the current clock block advances whenever the mode is not `"docked"` and then increments the tick at `src/sim/flight/step.ts:442-478`.
- The persistence backstop targets real danger: `snapshotForSave` currently maps every non-`inFlight` mode to `"docked"` at `src/persistence/autosave.ts:114`. Its only production app caller is `buildSnapshotInputs` at `src/app/session/save-controller.ts:158-182`, and the throw occurs before `queueSnapshot`.
- The stop-and-report requirement for the unmeasured 250 m/s case is appropriately cautious; it prevents fixture or kernel manipulation merely to obtain the expected death.

**Concerns**

- **MEDIUM — Pin maintenance could conceal regressions.** Task 3 generally instructs the executor to alter scenarios that now end in death so that they keep the player alive. Existing scenarios include non-vacuity-sensitive collision and hash work such as `tests/sim/world/collision-cadence.test.ts:130-205` and tightly pinned combat twins at `tests/app/session/tick-parity.test.ts:714-840`. Slowing or re-shielding every newly lethal scenario is not automatically the smallest correct response: for some, the new correct assertion is that the player dies.
- **LOW — The atomic commit is large.** It spans combat, flight, events, persistence, guards, and many tests. The atomicity is justified by the retired tripwire and the save invariant, but it increases the importance of recording every post-full-suite fixture change and its reason in the SUMMARY.

**Suggestions**

- Require every changed legacy scenario to assert its intended final mode (`"inFlight"` or `"dead"`) and to retain its original non-vacuity evidence. If a scenario’s subject is a lethal ram, prefer converting it into an explicit death case rather than weakening the contact until it survives.
- If any twin literal changes, halt the affected fixture work and report it before claiming a green suite, rather than treating “full suite green” and “never re-pin” as independently achievable.

**Risk Assessment: MEDIUM**

The core design is well matched to the source, but the breadth of the pin sweep carries regression-masking risk.

## 20-02

**Summary**

This plan covers the death contract’s edge cases: safe dock/jump/launch ticks, countdown and ident cleanup, mutual kills, lethal rams and bank-only comparisons, ledger boundaries, malformed-input properties, and fail-closed behavior at every exported sim entry point.

**Strengths**

- The planned tests follow actual transition ordering. Docking emits `docked` before `stepPlayerCombat`, which then performs `dockReset` and returns at `src/sim/combat/step.ts:198-215`; the hyperspace tick skips the world through `src/sim/sim.ts:114-131`. These are meaningful tests, not assumptions about mode names.
- The two live-mode writers warrant explicit guards: `applyWitchpointArrival` writes `"inFlight"` at `src/sim/hyperspace/arrival.ts:118-150`, and `completeLaunch` writes it without a mode check at `src/sim/flight/launch.ts:127-133`.
- The bank-only test exercises the actual distinction between response reversal and ledger lethality. `selfDestroyed` compares raw ram damage against bank energy at `src/sim/combat/response.ts:281-310`, while shield absorption happens later in the ledger.
- Mutual-kill coverage is compatible with the ledger’s apply-before-kill architecture, and swapping spawn order tests outcome stability without incorrectly demanding identical entity ids or hashes.
- The internal-damage gates are preserved exactly where they currently exist at `src/sim/combat/ledger.ts:211-227`, matching Oolite’s different laser and scrape behavior at `PlayerEntity.m:5683-5697` and `PlayerEntity.m:5744-5752`.

**Concerns**

- **MEDIUM — One necessary freeze edit is known but left to discovery.** The freeze table explicitly includes direct `resolveShots` calls, yet neither 20-01 nor the planned file list gives `resolveShots` a dead-state guard. Today `resolveShotHits` drains NPC fire, recharges ships/statics, and cools ships at `src/sim/combat/step.ts:471-493`; `resolveShots` can then run collisions, the ledger, kills, and world commits at `src/sim/combat/step.ts:758-838`. A direct call on a dead state therefore need not be hash-preserving even though `stepSim` and `stepFlight` return early.
- **LOW — The repair license is broader than the task file declarations.** Task 1 permits fixes anywhere under `src/sim/combat/`, although its `<files>` list contains only `death.test.ts`. That makes the test a useful detector but weakens execution predictability and file-budget checks.

**Suggestions**

- Add an explicit first-statement dead-state return to `resolveShots` in the plan, including `src/sim/combat/step.ts` in the modified-file list and a test proving no NPC recharge, fire-queue drain, collision, or event emission occurs for a dead player.
- Keep the generic fail-open repair clause as a backstop, not as the primary mechanism for this already-identified path.

**Risk Assessment: MEDIUM**

Production entry through `stepSim` is covered, but the advertised “every exported entry point” guarantee needs the direct `resolveShots` guard to be made explicit.

## 20-03

**Summary**

This plan supplies QUAL-11’s combined determinism scenario: an NPC-on-NPC kill, a collision kill, and the player’s death, replayed at 30, 60, and 144 Hz with a stable post-death hash.

**Strengths**

- Step-indexed sampling directly solves the frozen-tick termination problem. The existing runner uses the fixed-step accumulator, frame clamp, and five-step cap at `tests/sim/world/collision-cadence.test.ts:209-229`; replacing its tick-based completion with a step budget is the correct adaptation.
- The non-vacuity assertions are essential: all three kill kinds must be observed at each cadence, at equal step indices, before declaring hash equivalence.
- The scenario reuses meaningful existing building blocks: full hulls and collisions from `tests/sim/world/collision-cadence.test.ts:45-67`, NPC fight fixtures, and real death through `stepSim`, rather than calling `killPlayer` directly.
- No source or frozen acceptance files need to change, limiting the determinism test’s blast radius.

**Concerns**

- **MEDIUM — Scenario construction is the main feasibility risk.** Arranging two independent NPC and collision kills before one player death, with no source changes and identical timelines at three cadences, can become a lengthy fixture search. The plan’s “stop and report” fallback would leave QUAL-11 incomplete if the events cannot be arranged reliably.
- **LOW — Diagnosing cross-cadence divergence could be cumbersome without a compact per-step event timeline alongside the hash logs.**

**Suggestions**

- Prove the combined timeline in a `/tmp` scratch scenario before writing the final test, recording each kill’s step index and the player’s death step.
- Log a cadence-independent trace of `{step, event kind, victim kind, cause}` for every kill and include it in assertion failures, so a timing difference is distinguishable from a missing kill or an accumulator defect.

**Risk Assessment: MEDIUM**

The design is correct and isolated, but constructing a non-vacuous three-kill timeline is more delicate than the file count suggests.

## 20-04

**Summary**

This plan adds the application’s death latch, routed `deathFlow`, `gameOver` input context, traffic-independent player explosion, and layered save refusals. It is the central DEATH-06 implementation.

**Strengths**

- The latch is synchronous inside event dispatch, ahead of timers, later animation frames, and subsequent save attempts. The real router dispatches synchronously at `src/app/session/event-router.ts:734-742`, and the sim driver calls it directly after each step at `src/app/session/sim-driver.ts:229-243`.
- Defaulting a missing `deathFlow` to `createDeathFlow(ctx)` follows the existing `worldLifecycle` fallback at `src/app/session/event-router.ts:726-733` and prevents an omitted test or construction dependency from disabling the latch.
- The refusal layers address the real producers. `autosave`, `manualSave`, and direct `writeManualSave` all converge on `buildSnapshotInputs` and `queueSnapshot` at `src/app/session/save-controller.ts:158-235,243-325`.
- The pending-write reasoning is sound: a write queued before death is a valid pre-death anchor and may commit; only later producers are refused.
- `PLAYER_EXPLOSION_SETTINGS` avoids unconditional content loading while preserving the traffic-off explosion. The compiled record’s duration and other fields exist at `src/content/generated/explosions.json`, and the drift test correctly compares the restated constant against it.
- The `gameOver` context is fail-closed in the actual keyboard implementation: no contextual action means only reserved F-keys are swallowed at `src/input/keyboard.ts:161-165`, and non-flight contexts return the zero input frame at `src/input/keyboard.ts:234-249`.
- Closing the chart/save screen before setting the final input context correctly handles their context-restoring side effects.

**Concerns**

- **LOW — A pending pre-death write can erase the visible `"dead"` skip reason.** The completion callback clears `saveSkipReason` on a successful commit at `src/app/session/save-controller.ts:197-212`. If death and a later refused save occur while that write is pending, the callback can leave the probe showing a successful status and an empty skip reason even though the latch remains set. Save integrity is unaffected, but post-death diagnostics can become misleading.
- **LOW — The default no-deps flow only guarantees the latch, not the full shutdown.** That is acceptable for test construction, but it should remain clear that production must always use the facade-wired deps; otherwise chart/HUD/message cleanup and the explosion are absent.

**Suggestions**

- Preserve valid completion fields for a pre-death write, but when `ctx.runtime.gameOver` is set, either retain `saveSkipReason = "dead"` or reassert it after the completion callback rather than clearing it.
- Add an integration assertion that the facade-created router includes the fully wired death flow, so the default minimal path cannot silently become the production behavior.

**Risk Assessment: MEDIUM**

The save-safety architecture is strong; remaining risk is chiefly integration and diagnostic consistency rather than dead-state persistence.

## 20-05

**Summary**

This plan implements a self-contained game-over model and DOM overlay: title, cause, score, prompt, fresh-Space or click reload, safe text rendering, and the required HTML/CSS.

**Strengths**

- Reusing `formatRating` at `src/ui/station-model.ts:537-540` preserves Oolite’s rating shape, and the kill count remains correctly deferred rather than introducing LAW scope.
- The name resolver deliberately differs from `identName`: unlike the raw-key fallback at `src/app/session/event-router.ts:324-337`, it returns `undefined`, ensuring no spec key or entity id reaches the screen.
- The fresh-press rule uses the browser’s real `event.repeat` edge semantics and works with the input context introduced in 20-04. Listeners existing only while shown and a one-shot reload guard prevent early or repeated reloads.
- `textContent`-only rendering, injected reload/key targets, and disposal through one `AbortController` are appropriate for Node tests and avoid HTML injection.
- A separate DOM overlay avoids the pinned eleven-element HUD surface and leaves the scene visible.

**Concerns**

- **LOW — The score template is not byte-faithful to Oolite.** The planned literal at `.planning/phases/20-player-death-and-game-over/20-05-PLAN.md:146` uses an ordinary space before `₢`. Oolite’s `third_party/oolite/Config/descriptions.plist:1991` contains U+00A0 between `[credits_number]` and `₢` (bytes `c2 a0`). The proposed expected strings also use an ordinary space, so the tests would enshrine rather than detect that difference.
- **LOW — No planned browser journey uses the mouse-click exit.** The shell test covers it with doubles, but the two browser specs in 20-09 describe fresh-Space interaction. A real overlay-root click would additionally cover markup, focus, stacking, and listener wiring together.

**Suggestions**

- Copy the exact U+00A0 character into `GAME_OVER_SCORE_TEMPLATE` and add a code-point assertion for the separator before `₢`.
- Use a mouse click instead of Space in the no-save variant of `death-and-reload.spec.ts`. This covers both accepted inputs without adding a third spec or violating D-16.

**Risk Assessment: LOW**

The module is localized and well tested; the main issue is one subtle text-fidelity discrepancy.

## 20-06

**Summary**

This plan freezes the runtime around a dead session: remaining fixed steps become no-ops, the manual hook refuses to advance the world, the frame loop only drains input and renders presentation, and pause/focus/context/chart routes refuse to reopen anything.

**Strengths**

- The frame branch is placed before the current chart and save-screen handlers at `src/app/session/frame-loop.ts:127-168`, preventing those queues from reopening overlays or running in-flight world advancement behind the chart.
- `stepOnce` has an identified mutation-free insertion point before `previousPose`, controller updates, option construction, and the sim call at `src/app/session/sim-driver.ts:173-249`.
- The `advanceTicks` design preserves its existing refusal contract: return before `markHookMutation` and break on the latch in the loop at `src/app/session/sim-driver.ts:420-459`.
- The pause guard covers the real fan-out: `focusLost`, the P toggle, and `enterContextLoss` all use `pause()` at `src/app/session/settings-controller.ts:63-98,121-125`.
- Wall-time `gameOverSeconds` remains independent of the frozen simulation clock and works under both real and manual clock modes.
- Testing death on step two of a five-step frame addresses the most consequential same-frame race directly.

**Concerns**

- **LOW — This plan depends heavily on final integration order rather than isolated guards alone.** The crucial proof is that the death flow, chart closure, loop reset, and frame branch all execute after one real lethal `stepOnce`; the proposed real-router test is therefore more important than the individual refusal cases and should not be reduced to mocks.
- No HIGH or MEDIUM correctness issue was found in the specified branch placement or refusal inventory.

**Suggestions**

- Keep the full lethal-frame integration case as the tracer’s primary assertion: lethal on step two, no later steps, no later autosave/docked/launch activity, then only presentation on subsequent frames.
- Include a visibility-change/focus-loss sequence followed by a chart and pause attempt in the same test session to detect latch state leaking between refusal routes.

**Risk Assessment: LOW**

The changes are broad but mechanical, and the planned real-frame integration test addresses the principal ordering risk.

## 20-07

**Summary**

This plan wires the game-over overlay from `main.ts` through session construction and displays the four lines synchronously in the death flow. It relies on page reload and the existing boot/title behavior rather than adding an in-session load path.

**Strengths**

- The root plumbing follows a proven lifecycle: the pause overlay is created at `src/app/session/start-session.ts:769-781` and disposed at `src/app/session/start-session.ts:1007-1018`.
- Showing the lines after the latch ensures an absent overlay cannot weaken save safety; the no-DOM no-overlay test preserves that priority.
- The cause text is sourced from live compiled tables through `ctx.core.npcTraffic?.catalogue` and `ctx.core.targetNames`, whose ownership and traffic dependency are explicit at `src/app/session/context.ts:188-217`.
- The no-new-title-logic decision matches actual boot behavior: `title.setContinueVisible(bootSave !== undefined)` and the ordinary Continue callback already exist at `src/main.ts:379-393`.
- Avoiding a new in-session load pipeline removes substantial complexity and is consistent with D-12.
- Identical lines across absent/corrupt/future/unreadable/unavailable save statuses correctly keeps game-over presentation independent of persistence state.

**Concerns**

- **LOW — Most success evidence is necessarily deferred.** Node tests can prove line construction and overlay invocation, but only 20-09 can prove reload, boot-read, Continue, and save restoration. This is a reasonable dependency split, but 20-07 should not be treated as independently satisfying criterion 3.
- No scope or architectural defect was found in the root lifecycle or reload-only exit.

**Suggestions**

- Keep 20-07’s claimed completion wording limited to “overlay wired and shown”; reserve the end-to-end title/Continue criterion for 20-09 and the phase gate.
- Add a disposal assertion that the overlay hides and its listeners are removed before the scene and input are disposed.

**Risk Assessment: LOW**

The work is primarily established-pattern plumbing, with end-to-end coverage explicitly scheduled afterward.

## 20-08

**Summary**

This plan supplies the dead presentation: aft camera with the 100 m displacement, animated explosion/shots/debris on a presentation clock, hidden HUD, five-second saturation fade, redraw settling, and `probe.death`.

**Strengths**

- `computeViewCamera` already provides the ship-relative view offset and orientation at `src/render/launch-camera.ts:121-145`. Moving the ship pose along local forward before requesting the aft view is consistent with Oolite’s `VIEW_AFT` plus `moveForward:100.0` at `PlayerEntity.m:6203-6209`.
- The presentation clock fixes a real defect: `stepSim` freezes `flightTime`, while explosion particles are evaluated from `flightTime - start` at `src/render/bodies/explosions.ts:452-476`. Adding `gameOverSeconds` only to visual layers leaves simulation and hashes untouched.
- Using `PLAYER_EXPLOSION_SETTINGS.duration` with the five-second fade yields the correct settle time of five seconds; the generated record’s duration is only 1.5 seconds.
- The redraw strategy is efficient: draw continuously during the effect, then let `RedrawGate.next` settle and idle using its existing behavior at `src/app/redraw-gate.ts:56-79`.
- The CSS filter adds no draw calls, and the death probe is absent unless latched, preserving the sampled probe-shape fixture.

**Concerns**

- **MEDIUM — Cross-browser acceptance of the visual effect remains manual.** The current Firefox project is restricted to `engine` and `core-loop` specs at `playwright.config.ts:43-50`, so the two new Chromium-oriented specs will not exercise the fade in Firefox. The planned UAT addresses this, but an incorrect canvas-filter assumption could otherwise survive every automated gate.
- **LOW — Filter cleanup is not explicit in session disposal.** The plan writes `renderer.domElement.style.filter` in the render driver, while session disposal currently tears down scenes and HUD without a render-driver cleanup hook at `src/app/session/start-session.ts:1020-1045`. Page reload makes this mostly harmless, but same-page test/session replacement can inherit a stale filter until another render resets it.

**Suggestions**

- Add a non-pixel computed-style assertion to one of the already-planned browser specs, and retain the explicit manual Firefox UAT for actual canvas rendering; do not add a third spec.
- Clear the canvas filter and `data-dead` attribute through an explicit render-driver cleanup called from session `dispose()`, rather than relying on the next render or page reload.

**Risk Assessment: MEDIUM**

The camera and clocks are well reasoned; the remaining risk is browser rendering behavior and lifecycle cleanup.

## 20-09

**Summary**

This plan adds the Node death twin and the two permitted browser specs: manual-clock death/reload/Continue plus an untainted real-time game-over guard. It also covers no-save title behavior and CI timeout margins.

**Strengths**

- The route is deterministic and uses production data and restore semantics. `FixturePose` already includes speed at `tests/e2e/helpers/save-fixtures.ts:32-37,78-91`, and `restoreFromSave` restores it at `src/persistence/autosave.ts:272-295`; there is no hidden need to accelerate through input in the Node twin.
- Requiring the Node twin to prove lethality from the restored full shields and bank before writing browser assertions is the right precondition. Existing recorded collision analysis also supports the route: `.planning/PROJECT.md:333` records approximately 1,712 player damage at 350 m/s against the nav buoy.
- The untainted guard is meaningful. `createTestHook.advanceTicks` and spawn methods taint at `src/app/probe.ts:637-653`; avoiding every hook member means `save.writes` and the raw blob can actually change if the death protection fails.
- Seed production uses the real writer and strict boot reader, and docked damaged-equipment Continue coverage already exists at `tests/e2e/save-load.spec.ts:651-728`.
- Probe-only waits, Node-twin tick pins, explicit timeout budgets, and the 60% CI-margin rule address timing and CI-flake risk without pixel or wall-clock assertions.
- The no-save case correctly deletes the raw blob outside the app rather than using a tainting session mechanism.

**Concerns**

- **MEDIUM — D-16’s 90% Vitest ratio is not controlled during design.** The guard spec describes many post-death invariants across Space repeat, H, F2, P, Escape, F6, held W, blur, and visibility change. Depending on Assertion granularity, browser assertions could approach the extensive new Vitest inventory. The SUMMARY merely reports the ratio after implementation rather than making it a design budget.
- **MEDIUM — The untainted real-time death is the phase’s most fragile test.** It combines asynchronous content loading, real animation frames, a physical ram, held-key handling, visibility events, and IndexedDB verification. Probe waits and the twin reduce timing guesswork, but they do not remove environment-dependent frame scheduling or real-time input races.
- **LOW — The fallback reduces browser-level DEATH-06 evidence.** If the ram is not lethal, the hooked fallback cannot prove the untainted save refusal because a hooked session never writes. The plan records this honestly, but owner visibility is essential.

**Suggestions**

- Budget assertions before implementing: aggregate per-trigger probe snapshots into a small number of browser assertions, and record the Vitest/browser totals in an acceptance criterion rather than only in the retrospective SUMMARY.
- Assert a firm pre-death checkpoint in the guard: restored pose and speed equal the seed, `probe.test.tainted` is false, and Space is still held before the first fatal contact. This prevents a missed ram from becoming a misleading guard failure.
- Use a mouse click for one reload path to cover D-07’s second input without expanding the suite.

**Risk Assessment: MEDIUM**

The design deliberately addresses taint and determinism, but runtime complexity and assertion budgeting remain material execution risks.

## 20-10

**Summary**

This plan performs documentation and milestone close-out: Key Decisions, requirement wording, FIDELITY rows and pinned excerpts, todo resolution, CHANGLEOG verification, remote `verify-full`, and the frozen 20-seed acceptance run.

**Strengths**

- The reviewer-agreement precondition is unusually strong and correctly rejects silence, inferred consent, or generic plan approval as evidence for a specific divergence. Requiring named accepting comments and citation locations implements the project’s fidelity rule faithfully.
- The contract test genuinely verifies Wegolite paths, citation/excerpt correspondence, excerpt lengths, Key Decisions quotations, and optional verbatim Oolite source at `tests/contract/fidelity.test.ts:1-21`.
- Excerpt extraction from `git show 7437f22:` avoids the documented checkout-versus-pin drift. The planned Oolite sites are consistent with the pin: `getDestroyedBy:` at `PlayerEntity.m:6187-6221`, the game-over methods around `PlayerEntity.m:3551-3566,3630`, game-over controls at `PlayerEntityControls.m:4016-4027`, and direct loading at `Universe.m:2961-2967`.
- Rewriting DEATH-01 without checking off requirements preserves the verification workflow’s ownership of completion state.
- QUAL-11 is closed with both independent artifacts: cross-cadence evidence from 20-03 and the by-hand 21/21 acceptance run at the actual phase HEAD, with trigger-path and frozen-detector diff checks.
- No version bump, Unreleased move, tag, acceptance-threshold edit, or unneeded asset provenance is introduced.

**Concerns**

- **MEDIUM — Close-out can legitimately halt on evidence rather than code.** Every divergence needs an explicit accepting comment, all FIDELITY links must resolve to post-implementation lines, the verbatim contract must pass, and remote release gates must be green. Any one can block completion despite the implementation itself being correct.
- **LOW — Plist citation handling needs care.** The FIDELITY row parser expects Oolite row cells under `src/Core/...`, and excerpt headings under `src/...` at `tests/contract/fidelity.test.ts:40-49`; `Resources/Config/descriptions.plist` does not fit those patterns. A dedicated plist row/excerpt written mechanically like the other rows would fail validation.

**Suggestions**

- For the game-over strings, use `showGameOver` as the FIDELITY Oolite cell and retain an inline citation to the already-vendored `third_party/oolite/Config/descriptions.plist:1991-1993`; do not invent an unsupported `Resources/...` excerpt row.
- Before Task 1, create a checklist mapping every FIDELITY divergence to its named reviewer comment and its eventual Key Decisions substring. After Tasks 1–2, run both contract modes before attempting the expensive remote gate.
- Keep the conditional fallback and any non-green 20-seed or browser results prominent in the SUMMARY rather than burying them under a successful final rerun.

**Risk Assessment: MEDIUM**

This is low-code work but high process risk, concentrated in review evidence, source citations, and remote gate completion.

## Cross-plan assessment

- **Coverage:** DEATH-01, DEATH-06, and QUAL-11 are each addressed through simulation, application, presentation, persistence, and integration layers without introducing escape pods, kill tallies, LAW behavior, version release work, or other backlog scope.
- **Dependency ordering:** The wave graph is coherent. Notably, 20-08 correctly depends on 20-04 for the explosion settings and 20-07 for the CHANGELOG entry; 20-09 depends on both the runtime guards and probe; 20-10 transitively depends on all implementation plans.
- **Security:** The principal controls are well targeted: no entity ids in payloads, no HTML parsing of names, fresh-only restart input, no hooked untainted-save false confidence, and three layers preventing a dead save.
- **Performance:** Freezing the sim bounds ongoing work; the redraw loop settles after five seconds; and the CSS fade adds no WebGL draw calls.
- **Principal residual risks:** the direct `resolveShots` freeze guard should be made explicit; collision-pin edits must not mask intended new deaths; the combined QUAL-11 scenario needs early feasibility proof; and the real-time untainted browser guard needs careful assertion and timeout budgeting.
- **Overall risk: MEDIUM.** The plans are detailed and source-aware, with no identified phase-blocking architectural defect. Execution risk is dominated by integration breadth and verification discipline rather than conceptual uncertainty.

## Divergence verdicts

- DIV-1 (launching player never dies): ACCEPT — Oolite’s death check excludes only docked players (`PlayerEntity.m:6189`) and its laser death branch is at `PlayerEntity.m:5683-5689`, so restricting Wegolite death to `inFlight` is a real divergence. It prevents an unsc可控 launch cinematic from entering a partially implemented death flow and consistently preserves the owner’s dock/launch safety boundary.
- DIV-2 (explosion form, D-01): ACCEPT — Oolite’s `becomeLargeExplosion:4.0` emits four small and four big fragment bursts (`PlayerEntity.m:6208`, `ShipEntity.m:8308-8320`), whereas this uses one pooled cloud at the corresponding scale. The reuse preserves a legible large explosion without adding particle systems or draw calls; the UAT should confirm the visual result remains convincing.
- DIV-3 (cause line, D-02): ACCEPT — Oolite’s `showGameOver` displays only game-over, score, and prompt lines (`PlayerEntity.m:3630`, `descriptions.plist:1991-1993`). A concise cause line provides useful browser-game feedback, does not alter simulation or save behavior, and safely uses compiled names with name-free fallbacks.
- DIV-4 (no 30 s auto-restart, D-06): ACCEPT — Oolite restarts after `kDeadResetTime` in `performDeadUpdates` (`PlayerEntity.m:99,3551-3562`). Waiting for explicit input avoids racing the player through the cause and score, while fresh Space and click provide a reliable exit with or without a loadable save.
- DIV-5 (input rule, D-07): ACCEPT — Oolite’s Space latch is in `pollGameOverControls` at `PlayerEntityControls.m:4016-4027`. Requiring a fresh press prevents a key held during combat from accidentally reloading, and click support is appropriate for a browser UI; both exits reach the same guarded one-shot path.
- DIV-6 (reload to title, D-12): ACCEPT — Oolite directly invokes `loadPlayerIfRequired` at `Universe.m:2961-2967`, but Wegolite already has a boot path that validates saves and exposes Continue only when appropriate (`src/main.ts:379-393`). Reloading reuses that boundary, avoids a second in-session restore implementation, and preserves the “never save a dead player” invariant.
- DIV-7 (frozen world): ACCEPT — Oolite continues dead-window updates while `performDeadUpdates` handles fade/reset (`PlayerEntity.m:3551-3562`), whereas the owner explicitly requires a deterministic dead hash. Freezing sim state while advancing only presentation clocks gives a stable replay surface and keeps all further kills, saves, and AI effects out of the death window.
- DIV-8 (no equipment removal): ACCEPT — Oolite calls `removeAllEquipment` at `PlayerEntity.m:6220`, but Wegolite restores the stored save after reload rather than continuing with the dead entity. Since the profile and equipment are never mutated by `killPlayer`, skipping this transient teardown has no durable effect and avoids unnecessary destructive work.

---

## Consensus Summary

All three reviewers find that the plans achieve the phase goal, with overall risk MEDIUM and no blocking defect.

### Divergence verdicts (for 20-10's agreement standard)

| Divergence | Fable | Sonnet | Kimi | Status |
|---|---|---|---|---|
| DIV-1 launching player never dies | ACCEPT | ACCEPT | ACCEPT | agreed |
| DIV-2 explosion form (D-01) | **OBJECT** (4x radius misreads Oolite's 4.0, a burst count) | ACCEPT | ACCEPT | **objection resolved by owner decision 2026-11-22** (20-CONTEXT.md D-01): 8 adds (4 small + 4 big, distinct seeds) at 1× the collision radius, mirroring Oolite's two burst loops; the remaining divergence is the particle form only |
| DIV-3 cause line (D-02) | ACCEPT | ACCEPT | ACCEPT | agreed |
| DIV-4 no 30 s auto-restart (D-06) | ACCEPT | ACCEPT | ACCEPT | agreed |
| DIV-5 fresh Space + click (D-07) | ACCEPT | ACCEPT | ACCEPT | agreed |
| DIV-6 reload to title (D-12) | ACCEPT (row should note the network dependency) | ACCEPT | ACCEPT | agreed |
| DIV-7 frozen world | ACCEPT (row should state which layers still animate) | ACCEPT | ACCEPT | agreed |
| DIV-8 no equipment removal | ACCEPT (row should note a lethal scrape can still emit equipmentDamaged) | ACCEPT | ACCEPT | agreed |

### Agreed Strengths
- One lethal check where damage is applied, one death function, a synchronous session latch, three save-refusal layers (all three).
- Wave ordering and file ownership are consistent; the intermediate-state save audit holds (Fable, Kimi).
- No new trust boundary: `textContent`, closed name lookup, taint rule (all three).

### Agreed Concerns
1. **Nav-buoy ram lethality is unmeasured but pinned by three plans** (Fable, Sonnet, Kimi). The 250/350 m/s and the idle 175 m/s launch outcomes rest on arithmetic (~428 damage vs 128 shield + 256 bank, 11 % margin). Measure in a Node scenario at the start of wave 1, not in wave 5; Fable adds that an idle new player would die ~54 s after launch and no test or CHANGELOG line names it.
2. **The QUAL-11 three-kill scenario needs early feasibility proof and a fallback** (Sonnet, Kimi).
3. **20-01 Task 1 is very large for one atomic commit** (Sonnet; Kimi notes collision-pin edits must not mask intended new deaths) — give an internal edit order with `tsc` checkpoints.

### Divergent Views
- **Explosion scale (DIV-2):** Fable objects (4x radius → ~727 m particles, camera at 100 m; NPCs use 1x); Sonnet and Kimi accept. Open until resolved.
- **Traffic-off explosion constant (20-04):** Sonnet says the branch is unreachable (no hulls/weapons with traffic off) and the nine-field constant should be dropped or marked defensive; the plan-checker had asked for it. Worth a decision.
- **Single-reviewer findings worth acting on (Fable):** 20-10 Task 1 deletes a Key Decisions title still quoted by `FIDELITY.md:65` (E-45), which breaks `tests/contract/fidelity.test.ts`; game-over-guard has a wall-clock race (death 4.3 s after Continue — use a ≥5 km run-up); a 20-06 test case may be vacuous (`latchGameOver` stops the loop before `stepOnce`'s early return).
