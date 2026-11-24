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
