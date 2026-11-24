# Phase 20: Player Death and Game Over - Research

**Researched:** 2026-11-22
**Domain:** one deterministic player-death path in a fixed-step TypeScript simulation, its app-side freeze (autosave, pause, chart, input, render), a page-reload game-over flow, and the milestone's determinism and release gates
**Confidence:** HIGH for the inventory and integration points (every claim below was read in the repository at `main` / `8fe16b3` or in the Oolite checkout this session); MEDIUM for the presentation choices (explosion scale, CSS fade) which are discretion items; two browser-platform facts are `[ASSUMED]` (see the Assumptions Log)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

Locked before the discussion (owner, 2026-11-16, ROADMAP "Owner decisions in force"): game over is a page reload; death happens only while `inFlight` (a launching or docked player never dies); no escape pod; the world is frozen with a deterministic dead hash during the game-over window; no save is ever written on death.

- **D-01:** Follow Oolite's death presentation (`PlayerEntity.m` `getDestroyedBy:` ~6190-6222, `performDeadUpdates` ~3552, `gameOverFadeToBW` ~3566). The camera switches to the aft view and is set back 100 m (`moveForward:100.0`). The player's large explosion plays (reuse the Phase 16 explosion effect, scaled as Oolite's `becomeLargeExplosion:4.0`). The image fades to black and white over 5 s (`gameover-seconds-to-bw-fadeout` default 5.0). The HUD is hidden (`setDisplayText:NO`), and the message queue and target-lost messages are cleared. The simulation is frozen: the explosion and the fade are render-only effects, outside the sim and the hash.
- **D-02:** The game-over text keeps Oolite's three lines, from `descriptions.plist` (`gameoverscreen-game-over` "Game Over", `gameoverscreen-score-@` "Score: %@, [credits_number] ₢", `gameoverscreen-press-space` "Press Space"), **plus one added cause-of-death line** (owner choice; a divergence that needs a `FIDELITY.md` row and reviewer agreement, per the fidelity rule).
- **D-03:** The cause line names the damage type and the culprit's ship name: for example "Destroyed by Krait" for an NPC laser, and "Collided with Navigation Buoy" or "Collided with Krait" for a ram. Names come from the compiled ship data. The exact English wording is the planner's choice within this shape.
- **D-04:** The culprit is the source of the ledger record on which the player's energy reached zero (Oolite's `getDestroyedBy:whom`), with deterministic ledger order. If the culprit was also destroyed on the same tick, the line still names it. The `playerDestroyed` payload therefore carries the cause kind and the culprit's ship type/name, not a live entity id (respect the entity-id-scope guard). This does not read or change NPC kill credit (`.killer`), so `tests/guards/kill-credit-consumers.test.ts` stays as it is.
- **D-05:** Score line = `formatRating(rating, kills)` (`src/ui/station-model.ts:537`) with the current values, and credits. The kill tally (`ship_kills`) is not modelled and stays deferred with LAW-* (see Deferred), so today this shows "Harmless   (0)". It comes alive by itself when LAW-* adds the tally.
- **D-06:** The game over ends only on player input (owner choice). There is **no 30 s auto-restart** (Oolite's `kDeadResetTime`); this is a divergence and needs a `FIDELITY.md` row.
- **D-07:** Accepted inputs: a fresh **Space** press (fixed key code, not rebindable, like Oolite's `pollGameOverControls` `isDown:32` with the `spacePressed` edge latch) **or a mouse click** (owner choice; a small divergence, so add a `FIDELITY.md` row). Both work right away, with no delay for the fade, but a Space held from flight does not count; it needs a new press. Esc, F-keys, pause and every flight binding are ignored on the game-over view, and no pause overlay ever opens over it.
- **D-08:** Death with the chart (F6) or another screen (F2 etc.) open: close it and show the explosion. Oolite switches to `VIEW_AFT` regardless.
- **D-09:** Player and NPC killing each other on one tick (lasers or a ram): **both die**. The NPC goes through the ordinary kill path (explosion, debris), and the player dies on the same tick. This is deterministic and independent of entity order. It matches the 18-20 measurement (a player against a nav buoy at 350 m/s: both destroyed). This settles the Phase 15 carry-over.
- **D-10 (from research, not asked):** No death on the docking tick (`dockReset` refills energy before the combat step; assert it). No damage on the `hyperspaceJumped` tick. A death during a hyperspace countdown cancels the countdown. A launching player's energy cannot reach death (it clamps; the death check requires `inFlight`).
- **D-11:** Folded todo "collision reversal": the player becomes `destroyable` in `gatherColliders`, and `PLAYER_NOT_DESTROYABLE_UNTIL_PHASE_20` is removed in the same commit that adds the death. Keep Oolite's detail that `selfDestroyed` compares the ram damage with the **energy bank only** (`ShipEntity.m:11111`), not shields plus energy, even though shields absorb the scrape first in `takeScrapeDamage`. Do not "correct" it.
- **D-12:** Space or click → `window.location.reload()` → the ordinary title, with Continue only when the boot read finds a loadable save (the existing `main.ts` boot path; no new title logic). Oolite instead loads the last save directly (`handleGameOver` → `loadPlayerIfRequired`). That is a recorded divergence: a `FIDELITY.md` row (the owner's 2026-11-16 decision, reaffirmed).
- **D-13:** With no save, or a corrupt, future, unreadable or unavailable one: nothing special on the game-over view. After the reload the title shows only New game (plus its existing corrupt-save messaging).
- **D-14:** Continue after a death resumes the save exactly as stored (docked or in flight, with damaged equipment, save v5).
- **D-15:** Phase 20 does the documentation close-out: the `FIDELITY.md` rows (the energy floor plus the death check, and divergences D-02/D-06/D-07/D-12), the Key Decisions amendments (the energy floor rule and the `playerDestroyed` payload), the `CHANGELOG.md` entries under `## [Unreleased]`, the `NOTICE`/`ASSETS.md` provenance for anything new, the CI e2e timeout margins, `verify-full` on the remote machine, and the by-hand 20-seed acceptance run. **The version bump, the move of Unreleased under a version, and the tag are not in this phase**: they happen in `/gsd-complete-milestone`.
- **D-16:** Exactly two new browser specs: **death-and-reload** (death via a test hook → Space → title with Continue → resume the save with damaged equipment) and **game-over-guard** (autosave, manual save, pause, the chart and focus loss never save or revive a dead player). All race and edge cases (an autosave on the death frame, a pending write, a context loss, the hyperspace countdown, held keys, the ident lock) are Vitest. At least 90 % of the new behavioural assertions are Vitest.

### Claude's Discretion

- The exact English wording of the cause line (within D-03's shape) and the visual layout of the four text lines (Oolite shows them as HUD messages, centred).
- How the B&W fade is implemented (post-process pass or CSS filter), within the render budget.
- The `FlightMode "dead"` design and the fail-closed inventory of the roughly 48 mode sites and 15 `paused` sites, the session latch ahead of the save guards, and whether `store.read()` waits for queued writes (research ARCHITECTURE §7).
- The deterministic dead-hash scheme during the game-over window.

### Deferred Ideas (OUT OF SCOPE)

- **The player kill tally (`ship_kills`) and combat rating**: deferred with LAW-01..07 (legal status, police, bounties, combat rating, scooping escape capsules) to a later milestone that has no roadmap phase yet. When it lands, it is the first consumer of kill credit and must settle `2026-11-18-mutual-kill-credit-symmetry.md`. It also needs a save field after v5.
- **Release (version bump, Unreleased → version, tag)**: `/gsd-complete-milestone`, not Phase 20.
- Reviewed todos not folded (about 34 keyword matches: HUD, chart F-key bugs, buoys, divergences E-126/E-131/E-135/E-138/E-147/E-150, D-08, the station types, and so on): none is part of the death path; they stay in the backlog.

Folded todos: `2026-11-19-collision-reversal-on-player-death.md` (D-11), `2026-11-16-ci-e2e-timeout-margins.md` (D-16, the 60 % rule), `2026-11-18-mutual-kill-credit-symmetry.md` (reviewed only: Phase 20 adds no consumer of NPC kill credit, so the todo and its guard stay open; record in the plan that this was checked).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEATH-01 | The player dies at zero energy from any cause (only while `inFlight`); without an escape pod the game is over and the last save is loaded, through one death path that autosave, pause and the title flow respect. | Sections "Inventory 1 and 2" (every mode and paused site, the save latch), "Ledger death point" (the single lethal check), "Death flow" (one subscriber, one latch). The "last save is loaded" clause is met by the reload (D-12), not by an in-session load. |
| DEATH-06 | A dead player is never autosaved; after game over the page reloads and offers Continue only when a loadable save exists. | "Save path" (latch placement, `snapshotForSave` refusal, `queueSnapshot` choke point, store ordering) and "Reload and title flow". |
| QUAL-11 | Kills are deterministic: the world hash is equal at 30, 60 and 144 Hz; the frozen 20-seed acceptance run stays 21 of 21 after every plan touching `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json`. | "Determinism and the dead hash" (the new cadence scenario and its termination trap) and "Close-out" (the by-hand acceptance run). |
</phase_requirements>

## Summary

The work is wide, not uncertain. The sim side is small and local: one new `FlightMode` member `"dead"`, one lethal check inside the ledger's player branch (decided at the moment the damage is applied, before the floor hides it), one `killPlayer` function called once per tick from `resolveShots` after the NPC kills, and a freeze (`stepSim` and `stepFlight` become no-ops while dead). Everything else is the fail-closed sweep of the app: the session needs one latch (`ctx.runtime.gameOver`) set synchronously by one router subscriber, checked first by every save guard, by `pause()`, by the chart opener, by `advanceTicks` and by a new top-of-frame branch in the frame loop that replaces the whole normal frame while the game-over view is up.

Two findings change the plan against the older research. First, **D-12 (page reload) removes the whole in-session load pipeline** that ARCHITECTURE §7.3, PITFALLS 10 and the ROADMAP "Implied work" describe (`loadSavedGame`, taking `loadFromSave` out of F2 gating, a death-load that waits for queued writes). Phase 20 adds no in-session read, so "does `store.read()` wait for queued writes" is only a boot-after-reload question, and the answer is benign: a write that was queued is a valid pre-death anchor, and the latch guarantees that no dead snapshot is ever produced. Second, **the frozen sim clock is a trap for the render side**: `flightTime` stops while dead, so the explosion layer, the laser shots and the 5 s fade need a presentation clock (wall time since death) or they would freeze mid-frame.

**Primary recommendation:** Build it in this order: (1) one sim commit that adds `"dead"`, the ledger death check, `killPlayer`, the freeze, the `playerDestroyed` payload, `destroyable: true` for the player, deletes `tests/guards/collision-player-death.test.ts` and updates every pin listed under "Existing pins"; (2) the QUAL-11 cadence scenario; (3) the app latch, router subscriber, input context, save/pause/chart/sim-driver/frame-loop guards; (4) the game-over overlay and the dead-scene render (aft camera 100 m forward, explosion on a presentation clock, CSS `saturate()` fade, HUD hidden); (5) the two browser specs; (6) the close-out (FIDELITY, PROJECT.md, CHANGELOG, todo moves, remote `verify-full`, remote acceptance run).

## Project Constraints (from AGENTS.md)

- **Everything runs in Docker.** Tests and builds only via `docker compose run --rm test | test npx vitest run <file> | typecheck | lint | e2e sh -lc "npm run build:e2e && npx playwright test <spec>" | verify | verify-full`. A host run is not evidence. [CITED: /home/opencode/git/wegolite/AGENTS.md]
- Heavy gates (`verify`, `verify-full`, browser specs) run only on the remote machine through `/home/opencode/.claude/scripts/wegolite-remote-run.sh <docker compose args>`; it syncs the COMMITTED HEAD, so commit first. Acceptance: `wegolite-remote-run.sh run --rm test npm run test:acceptance` (used verbatim in Phase 18 SUMMARYs, 21 of 21 in about 80 s). [CITED: memory reference-remote-test-machine; .planning/phases/18-stations-buoys-and-collisions/18-14-SUMMARY.md:169] Local Docker and the remote were both reachable in this session (`docker --version` 29.8.2, `ssh opencode@192.168.178.51` returned ok).
- Gate by change type: pure `src/sim` plus tests/guards need `test`, `lint`, `typecheck`; browser-facing code (`src/app/`, `src/render/`, `src/input/`, `src/ui/`, `index.html`) needs `verify`; `verify-full` for render, input, persistence or network-guard changes and at the phase gate (runs automatically on the remote, no owner checkpoint). [CITED: AGENTS.md; memory feedback-gate-policy-slow-machine]
- The simulation core under `src/sim/` imports no Three.js and touches no DOM; deterministic and fixed-step. No database. New content data is compiled, never hand-edited. Every new asset needs `NOTICE`/`ASSETS.md` provenance (Phase 20 adds no asset).
- Fidelity rule: Oolite's behaviour is the default; every divergence needs a `FIDELITY.md` row, reviewer agreement, and (contract test `tests/contract/fidelity.test.ts`) a divergence cell that quotes a PROJECT.md Key Decisions row. Cite Oolite lines at the **pin 7437f22**, not at the checkout HEAD (see Pitfall 9).
- Documentation, commit messages, planning artifacts: English only, never Russian. `CHANGELOG.md` entries under `## [Unreleased]` in the same commit as the change; no version bump in this phase.
- Reviewers/executors must not modify tracked files from scratch repros; scratch work lives under `/tmp` and is mounted into the container.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Lethal decision (energy reaches 0 from a ledger record), cause capture | Sim (`src/sim/combat/ledger.ts`) | — | Pitfall 6: decide at the moment damage is applied, before the floor; one place. |
| `FlightMode "dead"`, freeze of the step, `playerDestroyed` event, hyperspace attempt cleared | Sim (`src/sim/combat/death.ts`, `src/sim/sim.ts`, `src/sim/flight/step.ts`) | — | Deterministic and hashed (`mode=dead`); the render and app only react. |
| Collision reversal for a lethal ram on the player | Sim (`src/sim/combat/collide.ts`) | — | `destroyable: true` for the player collider (D-11). |
| Session latch, save refusal, pause/chart/advanceTicks refusal, input context | App (`src/app/session/*`, `src/input/*`) | Persistence (`snapshotForSave`) | Session event, not a sim event (PITFALLS 10). |
| Game-over text lines (title, cause, score, press-space) and cause wording | App model (pure function) + DOM shell (`src/ui/game-over.ts`) | Content (compiled ship names) | Events carry no strings; names come from the compiled catalogue and `targetNames`. |
| Aft camera 100 m forward, explosion, B&W fade, HUD hidden | Render (`render-driver.ts`, `explosions.ts`, CSS filter) | App (presentation clock) | Render-only, outside the hash; clock is wall time because `flightTime` is frozen. |
| Reload to the title, Continue only for a loadable save | Browser (`window.location.reload()`) + existing `main.ts` boot read | Persistence (IndexedDB read) | D-12; no new title logic. |
| Milestone gates (cadence hash, acceptance run, `verify-full`) | Test infrastructure (Vitest, remote machine) | — | QUAL-11. |

## Standard Stack

No new external package is needed. Every piece is existing project code. [VERIFIED: /home/opencode/git/wegolite/package.json, read this session]

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 6.0.2 | all code; `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` (the payload's optional culprit must be omitted, not `undefined`) | project standard |
| three | 0.187.0 | the explosion layer is reused as is (`src/render/bodies/explosions.ts`) | project standard |
| vitest | 5.0.5 | Node-only unit project (`environment: "node"`); no jsdom, so DOM shells are tested through injected doubles | project standard |
| @playwright/test | 1.64.1 | the two new browser specs | project standard |
| fast-check | 4.10.2 | optional property test for the lethal predicate | already used in `tests/sim/combat/*.property.test.ts` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| CSS `filter: saturate()` on `#view` for the fade | a Three.js post-process pass / full-screen shader | Adds an `EffectComposer` or a second render target and draw calls inside the 50-call budget; CSS costs no draw call. Recommended: CSS. |
| New DOM overlay `#game-over` | a twelfth HUD element or HUD message rows | The HUD has exactly eleven pinned elements (Key Decisions "no twelfth HUD element", PITFALLS 22), and the HUD is hidden while dead. Recommended: DOM overlay like the pause menu. |
| `snapshotForSave` returns `SaveInputs \| undefined` for dead | throw on dead and guard in `buildSnapshotInputs` | Changing the return type touches about 28 test call sites in 6 files. Recommended: throw (defence in depth) plus `buildSnapshotInputs` returning `undefined` for dead, which is already `SaveInputs \| undefined`. |

**Installation:** none.

**Version verification:** not applicable (no package is added or upgraded). The three gates use the existing Docker images.

## Package Legitimacy Audit

No external package is installed or changed by this phase. **Packages removed due to [SLOP] verdict:** none. **Packages flagged as suspicious [SUS]:** none. The `gsd-tools package-legitimacy` seam was not run because there is nothing to check.

## Architecture Patterns

### System Architecture Diagram

```
 fixed step (sim-driver.stepOnce, up to 5 per frame)
   |
   v
 stepSim(player, world, ...)                                   [mode "dead" -> return [] untouched]
   stepFlight -> stepPlayerCombat -> stepWorld
   resolveShots:
     resolveShotHits (laser records) -> resolveCollisions (scrape records; player destroyable)
        |
        v
     applyLedger  --- player branch: energyBefore, route(), applied
        |               lethal iff mode "inFlight" && applied > 0 && energyBefore - applied <= 0
        |               first lethal record -> outcome.playerDeath = { damage, culprit specKey }
        |               later player records of the call: skipped (Oolite STATUS_DEAD early return)
        v
     NPC kills (killShip / destroyBuoy), applyPlayerPush
        |
        v
     killPlayer(player, combat, cause, events)      <- the ONE death function, once per tick
        mode = "dead"; clearHyperspaceAttempt; combat.energy = 0; ident cleared
        events.push(playerDestroyed {position, cause})   (after every shipDestroyed, before aiFaulted/entityRemoved/ident)
        |
        v
     drainAiEventsNow -> commitWorld -> (updateIdentTarget skipped: mode no longer inFlight)

 events -> router.dispatch (still inside stepOnce, synchronous)
   playerDestroyed -> deathFlow subscriber  (NEW, one owner)
        ctx.runtime.gameOver = true          <- the session latch, set before anything async can run
        closeChart(); messages.clear(); input.clearAll(); input.setContext("gameOver")
        launchSequence.reset(); loop.reset(); hudCanvas.hidden = true
        scene.explosions.add(position, radius, setting, flightTime)   (presentation)
        gameOver.show(lines); redrawGate.request(); probe.death published
   remaining steps of the frame: stepOnce returns at once (mode "dead")

 each later frame (frame-loop top branch while gameOver)
   drain every input queue; presentationSeconds += clamped delta
   Space keydown (event.repeat false) or click on #game-over -> window.location.reload()
   renderFrame(alpha 1): aft camera at position + forward*100, effect clock = flightTime + presentationSeconds,
                         CSS saturate(1 - min(1, t/5)) on #view, HUD hidden

 reload -> main.ts boot read -> title.setContinueVisible(bootSave !== undefined)  [existing, unchanged]
```

### Recommended Project Structure
```
src/sim/combat/death.ts          # NEW: PlayerDeathCause, killPlayer (the one death function)
src/sim/combat/ledger.ts         # player branch: lethal check + outcome out-parameter
src/sim/combat/step.ts           # resolveShots: call killPlayer after the NPC kills
src/sim/combat/collide.ts        # destroyable: true; marker removed
src/sim/flight/state.ts          # FlightMode gains "dead"
src/sim/flight/step.ts           # early return for "dead" (defence in depth)
src/sim/sim.ts                   # stepSim returns [] for "dead"
src/sim/events.ts                # playerDestroyed payload widened
src/persistence/autosave.ts      # snapshotForSave refuses "dead"
src/input/actions.ts             # InputContext gains "gameOver" (no action lists it)
src/input/keyboard.ts            # (optional) nothing: Space is handled by the overlay
src/ui/game-over.ts              # NEW: pure line model + thin DOM shell (Node-safe)
src/app/session/event-router.ts  # playerDestroyed routed to a new deathFlow subscriber
src/app/session/context.ts       # SessionRuntime.gameOver + gameOverSeconds
src/app/session/{save,settings,chart}-controller.ts, sim-driver.ts, frame-loop.ts,
  render-driver.ts, probe-publisher.ts, start-session.ts, game-session.ts, main.ts, index.html
tests/sim/world/death-cadence.test.ts        # NEW: QUAL-11 scenario
tests/e2e/death-and-reload.spec.ts, tests/e2e/game-over-guard.spec.ts   # NEW
```

### Pattern 1: Decide the death where the damage is applied (Pitfall 6)
**What:** the lethal predicate lives in the ledger's player branch, using the pre-floor value. `routeDamage` returns `applied` (the damage past the shield) and floors the bank; the check must run on `energyBefore - applied`.
**Source for the kernel:** `routeDamage` does `state.energy = Math.max(0, state.energy - remaining)` and returns `{ shieldAbsorbed: remaining === 0, applied: remaining }` [VERIFIED: src/sim/combat/shields.ts:159-179]. Oolite decides in the damage function: `if (energy <= 0.0)` then `getDestroyedBy` [VERIFIED: git show 7437f22:src/Core/Entities/PlayerEntity.m:5683-5689] and for a scrape `[super takeScrapeDamage:amount from:ent]` then, in `ShipEntity`, `if (energy <= 0.0)` ... `getDestroyedBy:ent damageType:kOODamageTypeScrape` [VERIFIED: git show 7437f22:src/Core/Entities/PlayerEntity.m:5744 and ShipEntity.m:11669].
**Proposal sketch (new names are recommendations, not repo values):**
```typescript
// ledger.ts player branch, inside the existing `if (record.target === PLAYER_ID)`
if (outcome?.playerDeath !== undefined) continue;         // Oolite STATUS_DEAD early return (PlayerEntity.m:5607, 5707)
const energyBefore = combat.energy;
const result = route(combat, record.amount, /* offset */, /* forward */);
events.push({ kind: "shipHit", /* ...unchanged... */ });
if (
  outcome !== undefined &&
  player.mode === "inFlight" &&
  result.applied > 0 &&
  Number.isFinite(energyBefore) &&
  energyBefore - result.applied <= 0
) {
  outcome.playerDeath = { damage: record.kind, ...culpritOf(world, record.source) };
}
// then the existing internal-damage roll, UNCHANGED (laser: only while combat.energy > 0; scrape: always)
```
Keep both existing internal-damage gates exactly: [VERIFIED: src/sim/combat/ledger.ts:211-215] `(record.kind === "scrape" || combat.energy > 0)`. The ledger's own module comment says "Phase 20 must keep both gates" (ledger.ts:39-41); Oolite matches (a lethal laser skips the loop in the `else` of `energy <= 0.0`, a scrape rolls after `[super takeScrapeDamage:]` with no dead check, PlayerEntity.m:5744-5752 at the pin).

### Pattern 2: One out-parameter, not a new return type
`applyLedger` returns `LethalHit[]` and about 20 test call sites compare that array with `toEqual` [VERIFIED: tests/sim/combat/ledger.test.ts `run()` uses `ReturnType<typeof applyLedger>`; applyLedger( occurs 7x in ledger.test.ts, 11x in step.test.ts, 1x in kill.property.test.ts]. Add an optional trailing `outcome?: { playerDeath?: PlayerDeathCause }` that only `resolveShots` passes. Existing "never lethal" player tests then keep their exact meaning when they omit it (see "Existing pins" for the ones that must change anyway).

### Pattern 3: Fail closed with an explicit refusal, not with `=== "docked"` luck
A mode the old code never saw must make every old gate false. Most gates are positive (`=== "docked"`, `=== "inFlight"`) and already fail closed. The **negative** gates (`!== "docked"`, `!== "launching"`, "any other mode maps to X") do not. Section "Inventory 1" lists all of them.

### Pattern 4: The latch before the guards (Pitfall 7)
`ctx.runtime.gameOver` is set in the `deathFlow` subscriber, which runs inside `stepOnce` synchronously after `stepSim` returns, so no autosave, key handler or timer can run between the lethal tick and the latch. It is checked **first** in `autosave()` and `manualSave()` (before `contextLost`, as that guard is first today) and again at the choke points `queueSnapshot` and `buildSnapshotInputs`, because `writeManualSave()` is also reachable directly from the overwrite dialog [VERIFIED: src/app/session/start-session.ts:719 calls `writeManualSave()` without `manualSave()`].

### Anti-Patterns to Avoid
- **Checking `combat.energy === 0` on a later tick.** `rechargeEnergyAndShields` runs at the start of the next tick and would lift 0 to above 0 (PITFALLS 6). Decide in the ledger.
- **Using `killer`, `shipHit` or `shipTargetDestroyed` in new app or sim files.** Two guards forbid it: the word `killer` is allowed only in `src/sim/world/kill.ts`, `src/sim/combat/ledger.ts`, `src/sim/combat/step.ts`, `src/sim/events.ts` [VERIFIED: tests/guards/kill-credit-consumers.test.ts:47-52] and `shipHit` only in `events.ts` and `ledger.ts` [VERIFIED: tests/guards/ship-hit-consumers.test.ts:30-33 as read]. Name the payload field `culprit`, and never derive the cause line from `shipHit` events.
- **Putting `killPlayer` in `src/sim/world/kill.ts`.** That touches a QUAL-11 trigger path (`src/sim/world/**`) for no benefit. Keep it in `src/sim/combat/death.ts`.
- **Running the dead frame through `simDriver.advanceFrame`.** The frame loop must take a separate branch; the sim driver has no abort besides `loop.reset()`.
- **Reusing `flightTime` as the presentation clock while dead.** It is frozen (see Pitfall 2).

## Inventory 1: every `FlightMode` reference and how it treats `"dead"`

The union today: `export type FlightMode = "docked" | "launching" | "inFlight";` [VERIFIED: src/sim/flight/state.ts:18]. No `Record<FlightMode, ...>` or exhaustive `switch` exists (`FlightMode` appears only as a type in `controller.ts:17,41`, `station-tabs.ts:23,134`, `mode.ts:16,23,25,37`, `probe.ts:30,456`, `hints.ts:26,93`), so TypeScript will not flag any site; the sweep below is manual. Method: `rg -n '\.mode\b|mode ===|mode !==|\bmode:|"inFlight"|"launching"|"docked"' src` (143 raw lines, about 48 real FlightMode comparisons).

**Legend:** OK = positive gate, `"dead"` is refused with no change; FIX = must be changed; WRITER = assigns the mode; TYPE = type only.

### Sim
| Site | What it does | Treatment of `"dead"` |
|------|--------------|-----------------------|
| `src/sim/sim.ts:117` | `(player.mode === "launching" \|\| player.mode === "inFlight")` gates `stepWorld` | OK, but add an early `return []` at the top of `stepSim` for `"dead"` (the freeze). |
| `src/sim/flight/step.ts:153` `modeAtStart`, `:186` (`=== "docked"`), `:195` (`=== "launching"`), `:198` and `:237` (`!== "inFlight"` break) | command phase | OK (refuse), but unreachable once `stepFlight` returns early. |
| **`src/sim/flight/step.ts:442`** `if (modeAtStart !== "docked" && !terminalTransition)` | advances `stationAngle`, `flightTime`, `clockSeconds`, compass | **FIX. Not fail closed:** `"dead"` is not `"docked"`, so a stepped dead state would keep the clock and the station roll running. Add `if (state.mode === "dead") return [];` as the first statement of `stepFlight` (before `sanitizeFlightState`) and `stepSim`. Also `state.tick += 1` at `:478` must not run. |
| `src/sim/flight/step.ts:298,308,312,349,350` | mode transitions and countdown tick | OK (positive gates). |
| `src/sim/flight/controller.ts:86` | `if (view.mode !== "inFlight") return ZERO_INTENT;` | OK (a dead ship gets zero intent). |
| `src/sim/flight/launch.ts:101` | `if (state.mode !== "docked") return false;` | OK. WRITER `:103` (`"launching"`), `:129` (`"inFlight"`). |
| `src/sim/dock/step.ts:162` and `src/sim/dock/computer.ts:47` | `if (state.mode !== "inFlight") return [];` | OK. WRITER `dock/step.ts:193`, `computer.ts:55` (`"docked"`). |
| `src/sim/hyperspace/arrival.ts:149` | WRITER `state.mode = "inFlight"` after a jump | OK in practice (only reached from a `hyperspaceJumped` event, which a frozen state cannot emit). Add a one-line test that a dead state is not revived by `applyWitchpointArrival`'s caller path, or a defensive `if (state.mode === "dead") return;`. |
| `src/sim/combat/step.ts:211,218,250,530,677` | recharge/cool, fire, hit targets, blast receiver | OK (`inFlight` or `launching\|\|inFlight` only). |
| `src/sim/combat/collide.ts:444` | player collider only `mode === "inFlight"` | OK; the `destroyable` flag at `:451` is the D-11 change. |
| `src/sim/combat/ident.ts:229,279` | `inFlight` only | OK; `killPlayer` before `updateIdentTarget` means no `identLocked` after the death. |
| `src/sim/npc/proximity.ts:357` | `if (player.mode !== "docked")` pushes the player body | Harmless (the world is frozen), listed because it is negative. |
| `src/sim/flight/state.ts:117,172` | initial `"docked"`, `serializeFlight` prints `mode=${state.mode}` | OK: the hash already carries the mode (`mode=dead` needs no new segment). |
| `src/sim/events.ts:56` | `docked` event | unrelated. |

### Persistence
| Site | Treatment |
|------|-----------|
| **`src/persistence/autosave.ts:114`** `const mode = state.mode === "inFlight" ? "inFlight" : "docked";` [VERIFIED: autosave.ts:114] | **FIX. Not fail closed:** a dead state would be written as a docked save. Refuse `"dead"` (see "Save path"). |
| `src/persistence/autosave.ts:294,303` | restore writers `"inFlight"` / `"docked"` | OK. |
| `src/persistence/save.ts:290,382,686,798,828` | the stored `mode` is `z.enum(["docked", "inFlight"])`; `SaveInputs.mode` is `"docked" \| "inFlight"` | OK: `"dead"` is unrepresentable in a save by type and by schema. |

### App
| Site | Treatment |
|------|-----------|
| `app/mode.ts:28-38` `advanceMode` (every transition returns `mode` unchanged for an unknown mode) | OK, absorbing. `screenForMode` returns `"flight"` for dead; it has no caller in `src`. |
| `app/hints.ts:93,217,227,230,231` | OK: dead is not `docked` and not `inFlight`, so no hint is returned; `markSeen("launch")` runs (harmless). |
| `app/hud-model.ts:204,283,321` | not reached: the HUD is hidden while dead (see render-driver). |
| `app/probe.ts:456` (`mode: "menu" \| FlightMode`) | widens automatically; the probe `mode` leaf stays a string. `probe.dock.outcome` (`probe-publisher.ts:445`, `docked ? "docked" : "inFlight"`) reports `"inFlight"` for dead: leave it, document it. |
| `app/session/probe-publisher.ts:159,214,245,275` | station-open and the three hook seams: all require `docked` / `inFlight`: OK. `:411` copies the mode into the probe. |
| `app/session/sim-driver.ts:188,189,246,247` (`stepOnce`) | **FIX:** `if (liveState.mode === "dead") return;` at the top of `stepOnce` (skips `buildStepOptions`, `controller.update`, `launchSequence.advance`). |
| `sim-driver.ts:277,311,316` (pre-roll and launch filter) | OK (docked only). |
| **`sim-driver.ts:430`** `advanceTicks` refusal list `(ctx.chart.chartOpen && currentState?.mode !== "inFlight")` | **FIX:** refuse when `ctx.runtime.gameOver` (or `mode === "dead"`) and add it to the loop's `break` condition at `:450-457` so a manual-clock spec cannot step a dead world; the refusal must not taint (existing rule). |
| `app/session/frame-loop.ts:118,148,173` | positive gates; superseded by the new top-of-frame branch (see "Frame loop"). |
| `app/session/chart-controller.ts:126` | **FIX:** `openChart` refuses only `mode === "launching"`; a dead state would open the chart. Add `ctx.runtime.gameOver \|\| mode === "dead"` to the refusal. |
| `app/session/station-controller.ts:649-652,697,820,836,940,965,985` | all `docked`-gated: OK. `currentNavState` forwards the mode to `station-tabs`. |
| `ui/station-tabs.ts:134,151` (`nav.mode !== "docked" \|\| nav.paused` disables), `ui/station-nav.ts:166,194` (`chartNav.element.hidden = state.mode !== "docked"`) | OK. |
| `app/session/save-controller.ts:459,491,581` | warm-Load install and `openSaveScreen` (`mode !== "docked"` return): OK. |
| `app/session/start-session.ts:395-396` (launch skip key) | OK (`!preRolling && mode !== "launching"` returns). `:617,848,874,887` boot/restore and docked-only button handlers: OK. |
| **`app/session/render-driver.ts:163,202,206,245,328,368,461,478`** | **FIX (several):** `:245` the camera branch is `inFlight` only, so a dead state falls to the cockpit-from-pose path (wrong view); `:368` `hudHidden = currentState.mode === "docked" && !preRolling` draws the HUD while dead; `:163` `shouldDraw` has no dead idle rule; `:328` `npcModels.open()` is `inFlight` only (fine); `:461` hints read the live mode (fine). |

### Writers of `state.mode` (all behind a mode check): `launch.ts:103,129`, `dock/step.ts:193`, `dock/computer.ts:55`, `hyperspace/arrival.ts:149`, `autosave.ts:294,303`. The new writer is `killPlayer` only.

## Inventory 2: every `paused` site and the session latch

`ctx.runtime.paused` readers/writers [VERIFIED: rg this session] and the treatment while `gameOver`:

| Site | Treatment |
|------|-----------|
| `settings-controller.ts:70-77` `pause()` (sets `paused`, shows the overlay) | **FIX:** first line `if (ctx.runtime.gameOver) { ctx.runtime.input?.clearAll(); return; }`, the same shape as the existing `currentState === undefined` branch. Covers `focusLost()` (which calls `pause()`), the `P` toggle, `enterContextLoss()` (which sets `contextLost` then `pause()`), and the public `GameSession.pause`. |
| `settings-controller.ts:101-109` `resume()` | OK (`if (!paused) return`), add `if (ctx.runtime.gameOver) return` so no route can restart a dead session. |
| `settings-controller.ts:115-118` `enterContextLoss` / `exitContextLoss` | `contextLost` is still set and Load/resume stay blocked; `exitContextLoss` calls `renderFrame(0)` when a state exists, so `renderFrame` must draw the dead scene correctly. The pause notice is written to a hidden overlay: harmless. |
| `frame-loop.ts:107-110` pause toggle | unreachable in the `gameOver` context (no action lists it); the new top branch consumes the toggle anyway. |
| `frame-loop.ts:119,149,173,178` | superseded by the top branch. |
| `sim-driver.ts:429,452` | see Inventory 1 (`advanceTicks`). |
| `chart-controller.ts:60,74,124,202` | `setChartCamera`, `toggleChartPreset`, `openChart`, `handleFind`: add `gameOver` to each refusal (a chart must never open over the game-over view). |
| `station-controller.ts:653,895,938,963,986` | already `docked`-gated: fail closed. |
| `save-controller.ts:579` `openSaveScreen` | docked-gated: fail closed. |
| `hyperspace-controller.ts:237` | sets `paused = true` on a failed arrival build: unrelated to death. |
| `start-session.ts:397,762` | launch-skip key and boot `setPaused(false)`: unrelated. |
| `probe-publisher.ts:372` | `probe.paused = ctx.runtime.paused`: the guard spec asserts it stays `false` while dead. |
| `game-session.ts:581` `isPaused` | public surface, unchanged. |
| `input/keyboard.ts:114,304-312` `setPaused` | not used by the dead flow: while dead, input is gated by the `"gameOver"` context, not by the paused flag. |

**Where the latch sits:** a new `ctx.runtime.gameOver: boolean` (plus `gameOverSeconds: number` for the presentation clock) in `SessionRuntime` [VERIFIED: context.ts defines `SessionRuntime` with `paused`, `contextLost`, `testTainted`, `disposed`; `createSessionState` builds it]. Default `false`, so every test that builds a `ctx` through `createSessionState` needs no edit. It is the app mirror of `state.mode === "dead"`; the two are set in the same synchronous dispatch, and guards that have no `ctx` use the mode.

## Save path (item 2)

**Producers of a write** [VERIFIED: rg this session]: `autosave()` is called from `game-session.ts:261,295`, `sim-driver.ts:289,331` (pre-launch anchors), `hyperspace-controller.ts:282` (arrival anchor), `station-controller.ts:414,525,574,631` (purchases), `event-router.ts:276` (dock). `manualSave()` from `start-session.ts:713`, `save-controller.ts:641`. `writeManualSave()` directly from `start-session.ts:719`. All of them end in `queueSnapshot` -> `queueAutosave` -> `store.write`.

**Guard order today** (`autosave`): `saveAttempts += 1`, then `contextLost` -> `"recovering"`, then `canOverwrite(saveStatus)`, then `testTainted` -> `"tainted"`, then `buildSnapshotInputs()` undefined -> `"not-ready"` [VERIFIED: src/app/session/save-controller.ts:243-271]. `manualSave` has the same order plus `manualSavePending` [VERIFIED: :278-312].

**Recommendation (one rule, three layers):**
1. `autosave()` and `manualSave()`: after `saveAttempts += 1`, **before** the `contextLost` check: `if (ctx.runtime.gameOver) { ctx.save.saveSkipReason = "dead"; syncSaveProbe(); return; }` (the probe skip-reason vocabulary today is `"recovering"`, `"tainted"`, `"not-ready"`, plus the status reasons `future`/`unreadable`/`unavailable`/`corrupt`).
2. `queueSnapshot()` and `buildSnapshotInputs()`: refuse (return / return `undefined`) when `gameOver` or `state.mode === "dead"`. This covers `writeManualSave()` and any future producer.
3. `snapshotForSave()` (persistence layer, no `ctx`): throw an `Error` for `state.mode === "dead"` ("a dead player is never saved"). It is unreachable behind layers 1-2 and is the last line. A unit test pins that `snapshotForSave` of a dead state throws and that the encoded modes are only `docked`/`inFlight`.

**Does `store.read()` wait for queued writes?** Yes, inside one store instance. `createIdbStore` serialises `read`, `write`, `clear` and `backupCorrupt` through one promise chain: [VERIFIED: src/persistence/idb-store.ts `enqueue`: `const result = queue.then(async () => { if (disposed) return fallback("disposed"); try { return await run(); } ...` and `read()`/`write()` both go through `enqueue`]. `MemorySaveStore` is synchronous (`write` stores at call time). `queueAutosave` reaches `store.write` synchronously (`encodeSave` and `isEncodedSaveValid` are not awaited) [VERIFIED: src/persistence/autosave.ts `queueAutosave`: `const encoded = encodeSave(inputs); if (!isEncodedSaveValid(...)) ...; return await store.write(encoded, revision);`], so the write is queued in the same call that built the snapshot.
**But Phase 20 adds no in-session read** (D-12). The only read after a death is the boot read of the reloaded page. Across the reload: `pagehide` runs `session.dispose()`, which ends in `saveBoot.store.dispose()`, which sets `disposed` so an op that had not yet started returns `fallback("disposed")` (a dropped write), and closes the connection [VERIFIED: idb-store.ts `dispose()`, start-session.ts:1045]. A write already in a started transaction is outside this guard. Either way the stored blob is a valid earlier anchor (the pre-death arrival, dock or launch anchor), never a dead snapshot, so the player loads "the last committed save". The IndexedDB scheduling rule (a read-only transaction waits for earlier-created overlapping read/write transactions) is a spec fact [CITED: https://w3c.github.io/IndexedDB/ transaction scheduling]; what a started transaction does at unload is not stated in the part read, so treat the "commit completes at unload" detail as `[ASSUMED]` (A2) and assert only the invariant "never a dead save", not "the newest anchor survives".

**Death on the same frame as an autosave:** a snapshot built **before** `stepSim` of the lethal tick (for example the pre-launch anchor in `stepFixed`, `sim-driver.ts:289`, or a purchase) is a legitimate pre-death anchor; one requested **after** the death hits the latch. The Vitest case: queue an arrival autosave, then die in the same frame, assert `store.writes` holds exactly the pre-death blob and `saveSkipReason === "dead"` for every later attempt.

**`?test=1` taint:** a tainted session never writes (`testTainted`), so a death-and-reload browser spec with no seeded blob would have no save. The spec must seed IndexedDB (`writeRaw` in `tests/e2e/helpers/save-store.ts`, fixtures in `tests/e2e/helpers/save-fixtures.ts`), never rely on the hook.

## The death point in the ledger and the culprit (item 3)

**Where the check sits and what it reads.** The player branch is `if (record.target === PLAYER_ID) { if (combat === undefined) continue; const route = record.kind === "scrape" ? routeScrapeDamage : routeDamage; ... }` [VERIFIED: ledger.ts:192-229]. Add the lethal predicate right after `route()` (see Pattern 1). `routeScrapeDamage` has the same `applied` contract (`shields.ts:199-212`). The collision stage reads the bank **before** the ledger (`energyOf` returns `combat?.energy ?? 0` as of before this tick's ledger, `collide.ts:635-637`), which is exactly the "energy bank only" comparison D-11 wants kept: `const selfDestroyed = self.destroyable && dam1 > self.energy;` [VERIFIED: src/sim/combat/response.ts:282]. Do not add shields to `energyOf`.

**The culprit without touching kill credit (D-04).** The record already carries `source: EntityId`. At the lethal record, resolve a **name key** (a string), never an id:
- a ship or pod: `world.store.get(record.source)?.specKey` (still in the store, because `killShip` runs after the ledger; this is why "culprit destroyed the same tick" still works);
- a static: `staticTargetById(record.source)?.identKey` [VERIFIED: statics.ts:84,91,98: `identKey: "coriolis-station"`, `identKey: "buoy-witchpoint"`, `identKey: "buoy"`]; collision records use the collider id (4 or 5 for a buoy, also when the contact was the buoy's subentity), because `records.push({ kind: "scrape", target: cs.id, source: co.id, ... })` [VERIFIED: collide.ts, `response.applied1` block];
- otherwise omit the key (fallback line "Destroyed").
The compiled names are `coriolis-station` -> "Coriolis Station", `buoy` -> "Navigation Buoy", `buoy-witchpoint` -> "Witchpoint Beacon", `barrel` -> "Cargo container", `alloy` -> "Metal fragment" [VERIFIED: parsed `names` of src/content/generated/ships-static-hulls.json this session]. The app already resolves a spec key to a display name with `identName(specKey, catalogue, targetNames)` (`catalogue` = `ctx.core.npcTraffic?.catalogue`, `targetNames` = `ctx.core.targetNames`) [VERIFIED: src/app/session/event-router.ts `identName`], so "Collided with Navigation Buoy" and "Destroyed by Krait" need no new content, only reuse.

The word `killer` must not appear in the new code (kill-credit guard allowlist), and the app must not read `shipHit` (ship-hit guard). The payload field is `culprit` (a string, a spec/ident key).

**Proposed event shape** (replaces `| { kind: "playerDestroyed"; position: Vec3 }` [VERIFIED: events.ts:179]): `{ kind: "playerDestroyed"; position: Vec3; cause: { damage: "laser" | "scrape"; culprit?: string } }` with `culprit` omitted when unknown (`exactOptionalPropertyTypes`). `RESERVED_EVENT_KINDS` still lists `"playerDestroyed"` [VERIFIED: events.ts:241]; the kind-count pin (15) is unchanged.

**The same tick, both die (D-09).** `resolveShots` order [VERIFIED: src/sim/combat/step.ts:769-838]: shots -> collisions -> `applyLedger` -> NPC kills (`killShip` / `destroyBuoy`) -> `applyPlayerPush` -> `drainAiEventsNow` -> `commitWorld` -> `updateIdentTarget`. Place `killPlayer` after `applyPlayerPush` and before `drainAiEventsNow`: the dead player is not pushed (`debrisContext` includes the player only when `player.mode === "inFlight"`, `step.ts:677`, and the push is already computed into `playerPush` before the kills, so write order matters: apply the push, then die, or skip the push when dying; pick one and pin it in a test, because a non-zero `drift` appears in the hash), and `playerDestroyed` follows every `shipDestroyed` of the tick, so the router's `messages.clear()` runs after the `equipmentDamaged`/`cargoDestroyed` messages a lethal scrape can still roll.

**Hyperspace jump tick / dock tick (D-10):** on the `hyperspaceJumped` tick `stepWorld` is skipped (`sim.ts:117`'s `!flightEvents.some(... "hyperspaceJumped")`), so no record can exist; on the dock tick `mode` is `docked` and `dockReset` refills the bank before the combat step (`combat/step.ts:211-214`). Both are assertions in the new unit test, as D-10 asks.

## Death flow in the app (item 3 and 4)

**Routing.** Today `ROUTED_EVENT_KINDS` has 24 kinds and `EVENT_SUBSCRIBER_ORDER` is `"stationFlow", "worldLifecycle", "damageFlow", "hudMessages", "dockFeedback", "hyperspaceFlow"` [VERIFIED: src/app/session/event-router.ts:62-69 and tests/app/session-order.test.ts:134-141]. Add `"playerDestroyed"` to the routed list and a seventh subscriber `deathFlow` (Phase 19 added `damageFlow` the same way). Pinned tests to edit: `tests/app/session-order.test.ts` (order at `:134`, the 24-kind table and count at `:144-173`, the loops at `:742` and `:1219`, and the `playerDestroyed` literal at `:1186`), `tests/sim/world/step.test.ts:1058` (the literal `{ kind: "playerDestroyed", position: origin }` must gain `cause`).

**`deathFlow` does exactly this, once** (guard against a second event: if `ctx.runtime.gameOver` is already true, return):
1. `ctx.runtime.gameOver = true`; `ctx.runtime.gameOverSeconds = 0`.
2. If `ctx.chart.chartOpen` call `closeChart()` (D-08; `closeChart` restores the saved input context, so set the game-over context **after** it).
3. `messages.clear()` (Oolite "No messages for the dead"); `launchSequence.reset()`; `ctx.runtime.loop?.reset()` (the seam `pause()` uses to stop `advance`); `ctx.runtime.input?.clearAll()` then `setContext("gameOver")`.
4. `hudCanvas.hidden = true`.
5. Explosion: `scene.explosions.add(event.position, radius, setting, ctx.core.state.flightTime)` reading the live scene and `ctx.core.npcTraffic?.explosion` at call time (G-8), exactly like the `shipDestroyed` arm of `createDockFeedbackFlow`. With traffic off there is no setting and nothing is drawn (the death scenarios need traffic on anyway, because the hull table loads only then).
6. Show the overlay with the model built from `event.cause`, the profile credits and the rating label; `redrawGate.request()`; publish `probe.death`.

**Input.** `InputContext` is `"flight" | "dockHome" | "dockScreen" | "chart" | "saveScreen"` [VERIFIED: src/input/actions.ts:71-72]. Add `"gameOver"`. No action lists it in `ACTION_CONTEXTS`, so `keyDown` takes `if (contextual.length === 0) return RESERVED_F_KEYS.has(code);` [VERIFIED: keyboard.ts:164] (F1..F8 are swallowed, every other key falls through), and `frame()` returns the zero frame when `context !== "flight"` [VERIFIED: keyboard.ts:237-239]. Tests that enumerate contexts: `tests/input/station-actions.test.ts:236-237` and `tests/input/bindings.test.ts`.
**Space and click.** Space is not bound by default (`fire` defaults to `KeyA`, actions.ts:214) but is rebindable, so the dead flow must not use the action table (D-07: fixed key). Put the listener in the overlay shell: `window.addEventListener("keydown", ...)`, active only while shown, `event.code === "Space" && !event.repeat`, then `preventDefault()` and reload. `event.repeat` is true for every auto-repeat of a key held from flight, so "a held Space does not count" is the browser's own edge; a new press after a keyup counts. The click handler is on `#game-over` (it covers the viewport; `#hud` has `pointer-events: none`). Inject `reload: () => void` (default `() => window.location.reload()`) so Node tests assert it. Oolite's own latch starts false, so a held Space *does* restart there (`pollGameOverControls`, `PlayerEntityControls.m:4016-4027` at the pin): the fresh-press rule is a Wegolite divergence for the D-07 row.

**Frame loop.** Add a branch right after the pause-toggle consumption and the `currentState` guards, before `handleChartActions`: `if (ctx.runtime.gameOver) { drain commands, station actions, chart actions, save-screen actions; pending.length = 0; ctx.runtime.gameOverSeconds += clamped delta; renderFrame(1, shouldDraw()); updateProbe(); return; }`. Use wall `delta` even under `?clock=manual` (the manual clock freezes the sim, not the presentation). `clampFrameDelta` already exists in `src/sim/loop.ts` [VERIFIED: imported in tests/sim/world/collision-cadence.test.ts].

**Probe.** Publish `probe.death = { dead: true, cause: { damage, culprit? } }` only while dead (absent otherwise), like `restore`. The shape spec compares seven sampled states against `tests/fixtures/probe-shape.json`; a key absent in all seven needs no fixture change, but the optional-key audit table in `tests/e2e/probe-shape.spec.ts` should gain a row. The skip reason `"dead"` rides the existing `save.skipReason`. `probe.mode` becomes `"dead"` with no shape change (string leaf).

## Render (item 6)

- **Explosion.** `explosions.add(position, radius, settings, flightTime)`; `update(cameraWorld, cameraQuaternion, flightTime)` evaluates every particle as a closed function of `t = flightTime - start` [VERIFIED: src/render/bodies/explosions.ts, header and the `ExplosionLayer` interface]. The pool is 8 (`EXPLOSION_POOL`), 10 particles per cloud, two draw calls while any explosion is live. The random particles are seeded from `fnv1a32` of the position and radius, so **several `add` calls with the same position and radius draw identical clouds**: vary the radius if you add more than one. Oolite's `becomeLargeExplosion:4.0` is four small fragment bursts plus four big ones (`ShipEntity.m` `becomeLargeExplosion:` loops `how_many = factor; while (how_many > 0.5f)` twice), which has no counterpart in this layer; recommend ONE `add` with `PLAYER_COLLISION_RADIUS_M` (72.69734954833984 [VERIFIED: src/sim/npc/stats.ts:128]) times a constant chosen by eye in UAT, and a FIDELITY note (A5).
- **Presentation clock (Pitfall 2).** `flightTime` stands still while dead, so pass `currentState.flightTime + ctx.runtime.gameOverSeconds` as the effect time to `scene.explosions.update`, `scene.shots.update` (a beam in flight at death would otherwise freeze on screen) and `scene.debris.update`. Alive, `gameOverSeconds` is 0, so nothing else changes.
- **Camera.** Oolite sets `VIEW_AFT` and `moveForward:100.0` (PlayerEntity.m `getDestroyedBy:` at the pin 6187-6221). The helper `computeViewCamera(position, orientation, view, shakeOffset)` already builds the aft pose (`yaw pi`, aft cockpit offset) [VERIFIED: src/render/launch-camera.ts:129-145]; pass `add(position, scale(forward, 100))` with `forward = rotate(orientation, vec(0, 0, -1))` (local forward is -Z, `ledger.ts:138`). This is a new `else if (currentState.mode === "dead")` branch next to the `inFlight` one at `render-driver.ts:245`; the player's own hull stays hidden (`currentScene.ship.visible = false`).
- **HUD.** `hudHidden` must include dead (render-driver.ts:368). The page overlay's `#title`/`#status` lines are hidden by CSS only while the HUD canvas is shown or marked `data-launching` [VERIFIED: index.html:58-61 `#hud:not([hidden]) ~ #overlay #title, ... #hud[data-launching] ~ #overlay #status { visibility: hidden; }`]. Hiding the HUD would make "Wegolite 0.7.0" and the system name reappear on the game-over screen; set `data-launching` (or add a `data-dead` rule) while dead.
- **B&W fade.** `#view` is a plain `<canvas>`; set `element.style.filter = "saturate(<1 - min(1, t/5)>)"` per frame from `gameOverSeconds`. `saturate(0)` is completely unsaturated and the function takes a number or percentage [CITED: https://developer.mozilla.org/en-US/docs/Web/CSS/filter-function/saturate]; the MDN page does not mention `<canvas>`, so "the filter applies to a WebGL canvas in Chromium and Firefox" is `[ASSUMED]` (A1) and a one-line UAT/`e2e-cross` check. The CSP allows it (`style-src 'self' 'unsafe-inline'`; a CSSOM write is not an inline attribute anyway) [VERIFIED: index.html:7]. No draw call is added, so the 50-call budget is untouched. Oolite fades the colour saturation linearly over `gameover-seconds-to-bw-fadeout` = 5 s while `shotTime < 5` (`gameOverFadeToBW`, PlayerEntity.m:3566 at the pin), so a linear `saturate(1 - t/5)` is the equivalent.
- **Draw gating.** `redrawGate.next(paused || frozenDocked, keys)` [VERIFIED: render-driver.ts:160-165]: add `|| deadSettled` where `deadSettled` is `gameOver && gameOverSeconds >= FADE_SECONDS + explosion duration`; until then draw every frame. Restore the filter (`style.filter = ""`) on `dispose`.
- **Context loss during game over:** `exitContextLoss()` calls `renderFrame(0)`; the dead branch must read only live fields, so this works without a special case.

## Game-over text (D-02, D-03, D-05)

Oolite's lines are `"gameoverscreen-game-over" = "Game Over"`, `"gameoverscreen-score-@" = "Score: %@, [credits_number] ₢"`, `"gameoverscreen-press-space" = "Press Space"` [VERIFIED: third_party/oolite/Config/descriptions.plist:1991-1993, the vendored copy; the same keys are at 2036-2038 in the checkout HEAD, so cite the vendored/pin lines]. Oolite shows them as message rows: "Game Over", blank, score, blank, "Press Space" (`showGameOver`, PlayerEntity.m:3630 at the pin). Recommended layout, four lines plus spacing: `Game Over` / cause / blank / `Score: Harmless   (0), 100.0 ₢` / blank / `Press Space`. Build the lines in a pure function (`buildGameOverLines(cause, creditsDecicredits, rating, names)`) so Vitest asserts the strings. Use `formatRating(rating, kills)` [VERIFIED: station-model.ts:537-540: `` `${rating}   (${String(count)})` ``] with `labels.rating[0] ?? ""` and kills `0`, as F5 does (`station-model.ts:592`). **Credits:** `formatCredits` appends `" ₢"` (`profile.ts:137-142`), and the Oolite template already ends in `₢`; format the number part only, or the line reads "100.0 ₢ ₢". Inline constants with the plist citation are the established pattern (`EQUIPMENT_DAMAGED_TEMPLATE`, `event-router.ts`); no content-compiler change.

## Determinism and the dead hash (item 5)

- **Dead hash scheme: none beyond the freeze.** `serializeFlight` already prints `mode=${state.mode}` and `hashWorld(player, world, combat)` hashes flight, world section and the non-pristine combat line [VERIFIED: state.ts:172, serialize.ts:268-292]; no pinned flight golden contains `dead` (ARCHITECTURE 6.2 states this; `tests/golden/flight-hash-pins.json` is untouched). The dead hash is therefore the hash at the death tick, constant while nothing steps. Pin it: after the death, N extra `stepSim` calls leave `hashWorld` and `hashFlight` byte-equal; `stepSim` returns `[]`.
- **QUAL-11 scenario (new file `tests/sim/world/death-cadence.test.ts`).** Copy the harness of `tests/sim/world/collision-cadence.test.ts` (the `replay(hz)` frame runner over `[30, 60, 144]`, `clampFrameDelta`, `MAX_STEPS_PER_FRAME`, per-tick sampling) [VERIFIED: that file, read this session]. One scenario holds: an NPC-versus-NPC kill (a firing test pilot or flight-script ship kills an Adder, see `tests/sim/combat/npc-vs-npc.scenario.test.ts` for the fixtures), a collision kill (the player rams a Krait to zero; `collision-stage.test.ts` shows 350 m/s kills a Krait), and the player's death (a laser from an NPC, or the 350 m/s buoy ram where PROJECT.md/18-20 measured both destroyed). Assert equal `hashWorld` and `hashFlight` at every sampled tick across cadences, equal death tick, equal cause, and non-vacuity (all three kills happened).
- **Termination trap.** In that harness `done` is decided from `state.tick >= END_TICK`. A dead state's `tick` stops advancing, so the loop would run to its `frame > 200_000` throw. Count `step()` calls (or sample a tick index that survives death) and end N steps after the death, so the post-death no-op steps are inside the compared window. This is also what proves that steps 2..5 of the lethal frame change nothing.
- **Acceptance run.** The 20-seed harness passes `combat: undefined` and never sets `collisions`, so the player branch of the ledger never runs there (QUAL-11's "inert for the frozen worlds" design, PITFALLS 4). If the sim work stays in `src/sim/combat/**`, `src/sim/flight/**`, `src/sim/sim.ts`, `src/sim/events.ts` and no plan touches `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json`, no plan triggers the standing rerun, but criterion 4 and D-15 ask for the 21-of-21 run at the phase HEAD anyway: `wegolite-remote-run.sh run --rm test npm run test:acceptance` (about 80 s). Record it in the phase's last SUMMARY with the snapshot hash. Do not touch `tests/acceptance/**` (thresholds and detectors are frozen; a change needs the owner's `Detector-change-approved-by-owner` trailer).

## Existing pins that encode "the player cannot die" (item 7, Pitfall 6)

Found by grep and by reading the cited tests this session. Update each in the same plan that changes the rule; run the whole `docker compose run --rm test` once right after the rule flips to catch the ones not listed (the list is a strong lead, not a proof of completeness).

| Pin | Where | What changes |
|-----|-------|--------------|
| The tripwire itself | `tests/guards/collision-player-death.test.ts` (whole file; its first case asserts the marker is still in `collide.ts`) | **Delete the file** with the marker (retired by design). |
| "never lethal" player kernel cases | `tests/sim/combat/ledger.test.ts:195-215` ("routes a player record through the shields, floors energy at 0 and is never lethal"), `:238-275` (the 1,000-damage scrape, `lethal2` `toEqual([])`) | Become death cases: pass the `outcome`, assert `playerDeath` and the cause, keep the floor assertion (`combat.energy` 0) and the no-heat scrape assertion. |
| The doc comment "The player ... never a lethal one" | `src/sim/combat/ledger.ts:24-28`, `:39-41`; `shields.ts:151,191`; `response.ts:25-27`; `collide.ts:225-240,557` | Update the sentences; the guard's marker sentence ("the energy floors at 0 until the player's death in Phase 20") goes with the guard. |
| NPC laser floors the bank | `tests/sim/combat/npc-fire.test.ts:782-810` (second `resolve` after energy 0) | The `energy = 3` shot is now lethal; the "stays 0 on a later shot" half becomes "a dead player takes no further record". |
| A ram that leaves the player alive | `tests/sim/combat/collision-stage.test.ts:563-566` (`"The player is never destroyable: 228.6 damage, energy floored, alive."`, `expect(player.mode).toBe("inFlight")`) | At 350 m/s the player's bank (shield 128 + energy 256 against 228.6 as asserted) may now be lethal depending on the Krait's side; recompute with the response oracle numbers, assert the actual outcome. |
| Player-versus-buoy at 350 m/s | `tests/sim/combat/collision-buoy.test.ts` (`:289` "at 250 m/s the buoy is destroyed", fixtures with `destroyable: false` for the player at `:482`) and the oracle fixtures `tests/oracles/combat/response/*` (player rows set `destroyable` false; reference comment "the player's death is Phase 20's") | Add the player-`destroyable` fixtures (bank-only comparison, reversal, no nudge); keep the existing rows, which still pin the kernel with an explicit flag. |
| Internal-damage gates | `tests/sim/combat/internal-damage*.test.ts` and `ledger.test.ts` "internal damage" describe | Keep both gates; add the lethal-scrape-still-rolls and lethal-laser-does-not-roll cases. |
| Station/static records "never lethal" | `tests/sim/combat/step.test.ts:1033-1052` | Unchanged (it is about the station), just re-run. |
| Reserved-kind literal | `tests/sim/world/step.test.ts:1058`, `tests/app/session-order.test.ts:1186` | New `cause` field; the second also moves from "unrouted" to routed (see "Death flow"). |
| FlightMode/ledger-floor tripwire references | `FIDELITY.md:176` (E-132 row), `.planning/PROJECT.md:333` (the Phase 18 collisions row ends with the tripwire sentence), `.planning/PROJECT.md:280` (the floor row) | Doc updates in the close-out. |
| Tests that fly a real launch into the nav buoy | `tests/app/session/tick-parity.test.ts`, `tick-flyers.test.ts`, `sim-driver.test.ts`, `tests/sim/combat/collision-traffic.scenario.test.ts`, `tests/sim/world/collision-cadence.test.ts` (100 m/s into the buoy) | Re-run; most stay below the lethal threshold. The straight departure rams the buoy about 54 s after launch (dam1 about 428) [CITED: .planning/PROJECT.md Key Decisions row "Collisions follow Oolite's collideWithShip..."]; with shield 128 and energy 256 that is lethal, so any long idle-flight unit scenario with `collisions: true` now ends in death. |

**Browser specs:** the default e2e bundle has traffic off, so no hull table loads and no collision or NPC fire exists; only the `?traffic=1` specs (`combat.spec.ts`, `traffic.spec.ts`, `npc-flight.spec.ts`, `tick-hook.spec.ts`) can reach a death. `combat.spec.ts` pins the player's energy to the Node twin at spawn+360 and at the kill (`ENERGY_AFTER_SHOOTING`, `ENERGY_AT_KILL`), both far above 0, so it should stay green. `tests/sim/ai/test-spawn.test.ts:494-533` runs the hook attacker for 3,600 ticks and asserts only that shield and energy fell; with the attacker able to kill the player that run may now end in death mid-loop, which is still green because a dead `stepSim` returns `[]`, but re-read it.

## Close-out inventory (item 8)

- **FIDELITY.md.** Last excerpt id is E-170 [VERIFIED: `grep -o "^### E-[0-9]*"` this session]; new excerpts start at E-171. Row format: `| Mechanic | `src/...:line` | `src/Core/...:start-end` | faithful or divergence quoting a PROJECT.md Key Decisions row | E-nnn |`, and each excerpt block is `### E-nnn <oolite path>:<start>-<end>` with at most 20 lines, verbatim from `git show 7437f22:<path>`; the contract test rejects an unquoted divergence cell, a missing excerpt and a Wegolite path/line outside the file (header of `tests/contract/fidelity.test.ts`). **Cite pin lines, not checkout lines** (Pitfall 9). Pin lines this session: `getDestroyedBy:` PlayerEntity.m:6187-6221, `takeEnergyDamage` death branch :5683-5689, scrape :5744, `performDeadUpdates` :3551, `gameOverFadeToBW` :3566, `showGameOver` :3630, `kDeadResetTime` :99, `pollGameOverControls` PlayerEntityControls.m:4016-4027, `selfDestroyed` ShipEntity.m:11111-11112 (existing E-132), scrape death ShipEntity.m:11669, `handleGameOver` Universe.m:2961, descriptions.plist:1990-1993. Rows to add or change: **rewrite the E-132 row** (currently "divergence: interim until Phase 20", `FIDELITY.md:176`; its Wegolite cell `src/sim/combat/collide.ts:239` must still resolve) to faithful; **death rule** (energy <= 0 from the ledger, only while `inFlight`, divergence: launching player never dies); **game-over cause line** (D-02); **no 30 s auto-restart** (D-06, `kDeadResetTime`); **click as input and fresh-press rule** (D-07); **reload instead of loading the save** (D-12); and, recommended, **the frozen world** (Oolite keeps the universe running for the 30 s dead window; the owner decision 2026-11-16 already records it, the row makes it visible), **one explosion instead of `becomeLargeExplosion:4.0`**, **CSS saturate fade**, **no equipment removal on death** (`removeAllEquipment`, pointless because the reload restores the save). The energy-floor row (PROJECT.md:280) needs "the floor stays; the death check is added".
- **PROJECT.md Key Decisions.** Amend `:280` ("Floor the player's energy at 0 until a death phase exists"): the floor stays for display, the lethal check is the ledger's `energyBefore - applied <= 0`. Amend `:333` (remove "The player is never `destroyable` before Phase 20" and the tripwire sentence). Add a row for the `playerDestroyed` payload (`cause.damage`, `cause.culprit` string key, no id) and for "game over is a reload, no in-session load pipeline, the latch ahead of every save path". The row for N2 was amended in Phase 15.
- **CHANGELOG.md** under `## [Unreleased]`: the 0.7.0 section still says "the player cannot die yet" (that is released history, do not rewrite). Add **Added** (death and game over, the cause line, Space or click to restart at the title), **Changed** (**Breaking behaviour:** a ram or a hit that empties your energy now ends the game; "in normal play NPC ships still never fire", so a collision is the realistic cause; the straight launch into the nav buoy kills an idle ship), no version edit.
- **NOTICE / ASSETS.** No new asset: the explosion textures and `explosions.json` already have rows. The game-over strings are Oolite text (CC BY-NC-SA data) cited from the already-listed vendored `third_party/oolite/Config/descriptions.plist` (ASSETS.md:25); no new row unless a new file is added.
- **Todos.** Move `.planning/todos/pending/2026-11-19-collision-reversal-on-player-death.md` to `completed/`; keep `2026-11-18-mutual-kill-credit-symmetry.md` pending with a line "checked in Phase 20: no kill-credit consumer added"; apply the CI-margins todo (below).
- **CI e2e timeout margins** (`.planning/todos/pending/2026-11-16-ci-e2e-timeout-margins.md`): the rule is "when a spec uses 60 % or more of its timeout on CI, raise the timeout (or fix the wait) in the same change"; a spec that spans an unskipped launch budgets one `FIRST_LAUNCH_WAIT_MS` (180,000 ms, `tests/e2e/helpers/probe.ts:33`) per launch, written as an expression. Both new specs should boot `?test=1&traffic=1&clock=manual` from a seeded in-flight save (no launch), so their waits are the `SLOW` (30 s) class; the budget is non-launch work only. Give each new test an explicit timeout with the worst-case SwiftShader margin (CI runs Chromium 2.5-3x slower than the remote), and re-measure after the next sharded run. The repository CI splits Chromium into four `--shard=N/4` jobs; new specs land in whichever shard holds their file.
- **Gates.** Remote `verify-full` at the phase gate (automatic, no checkpoint), plus the by-hand acceptance run. Per-plan: sim-only plans `test`, `lint`, `typecheck`; app/render/input/ui plans `verify` (remote).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Name of the culprit | a new name table | `identName(specKey, catalogue, targetNames)` (`event-router.ts`) | already resolves NPC, buoy, station, pod and plate names from compiled content |
| Rating text | a new formatter | `formatRating` (`station-model.ts:537`) with `labels.rating[0]` | F5 already prints "Harmless   (0)" |
| Credits text | a new grouping routine | `formatDecicredits` / `formatCredits` logic in `src/sim/player/profile.ts:137-148`, minus the trailing `₢` | integer-exact grouping |
| Stopping the step loop mid-frame | a new abort flag in the loop | `loop.reset()` plus the `stepOnce` early return | the seam `pause()` uses (`game-loop.ts`) |
| Explosion drawing | a particle system | the existing `ExplosionLayer.add/update` | two draw calls, pooled, already in budget |
| Camera for the aft view | new camera math | `computeViewCamera(..., "aft")` | the four views are already ported |
| Fade | a render target / shader | CSS `filter: saturate()` | zero draw calls |
| Overlay chrome | a new focus-trap library | follow `src/ui/pause.ts` (`createPauseOverlay`) shape with an injected root | consistent focus handling, Node-testable factory |
| Store ordering across a death | a custom write queue | the existing serialised store queue + the latch | the store already serialises; the latch removes the producer |
| Cross-cadence harness | a new runner | copy the `replay(hz)` runner of `collision-cadence.test.ts` | the accumulator and clamp are the thing under test |

**Key insight:** the sim needs one new function and one flag; the risk is the number of places that must say "no" to a mode they have never seen.

## Common Pitfalls

### Pitfall 1: `stepFlight` is not fail closed for an unknown mode
**What goes wrong:** the clock block is `if (modeAtStart !== "docked" && !terminalTransition)` (`step.ts:442`) and `state.tick += 1` follows at `:478`; a dead state stepped by any caller (a hook, a test, a stray `advanceTicks`) keeps `flightTime`, `clockSeconds` and `stationAngle` running, so the "frozen" hash drifts.
**How to avoid:** early return in both `stepFlight` and `stepSim`; a table test that calls each sim entry point with a dead state and asserts the hash is unchanged.
**Warning signs:** `probe.sim.tick` or `flightTime` advancing while `probe.mode === "dead"`.

### Pitfall 2: the presentation freezes with the clock
**What goes wrong:** the explosion, shots and any fade driven by `flightTime` stop at death (the sim clock stands still), so the explosion is a still frame and the fade never starts.
**How to avoid:** a wall-time `gameOverSeconds` added to the effect time only for the layers that animate; pass it for explosions, shots, debris.
**Warning signs:** a UAT where the explosion never grows.

### Pitfall 3: death while the session believes it is still running its frame
**What goes wrong:** `loop.advance` may run up to `MAX_STEPS_PER_FRAME` (5) steps after the lethal one in the same frame; they must not emit `docked`, `autosave()` or station UI (PITFALLS 7.3).
**How to avoid:** `stepOnce` early return + `loop.reset()` + `gameOver` latch set synchronously in the dispatch.

### Pitfall 4: the old pins pass vacuously
**What goes wrong:** a fight test that asserts "energy 0, still inFlight" now fails, but one that only asserts the energy value keeps passing while the player is dead, and later steps no-op (a dead `stepSim` returns `[]`), hiding real behaviour.
**How to avoid:** every changed pin asserts `mode` and the event, and the cadence scenario asserts the death tick.

### Pitfall 5: closed sets
**What goes wrong:** `ROUTED_EVENT_KINDS` (24), the subscriber order, the `session-order` tests, the 15-kind reserved pin, the probe shape, the HUD's eleven elements. Adding the subscriber, the context or a probe key in the obvious way breaks a pinned test.
**How to avoid:** edit the tables and the pinned tests together (list under "Death flow"); keep the game-over view a DOM overlay (no twelfth HUD element); publish `probe.death` only while dead.

### Pitfall 6: the kill-credit and ship-hit guards
**What goes wrong:** naming the culprit `killer`, or reading `shipHit` in the app to learn the cause, fails two guards and violates D-04.
**How to avoid:** `culprit`, resolved in the ledger from `record.source`; nothing in `src/app` reads `shipHit`.

### Pitfall 7: `?test=1` taint hides a missing save
**What goes wrong:** a death-and-reload spec that boots a fresh game under `?test=1` has no save to load (tainted sessions never write); the Continue assertion can only be satisfied by a seeded blob.
**How to avoid:** seed with `writeRaw` before the first load, extend `inFlightSaveAt` with `damagedEquipment` (today only `dockedSaveAt` accepts it, `save-fixtures.ts:36-70`; `inFlightSaveAt` does not).

### Pitfall 8: `launching` clamp edge
**What goes wrong:** a laser can bring a launching player to energy 0 (floor); the first lethal record after `launchComplete` then kills. That is consistent with D-10 and Oolite's rule that lasers hurt a launching player, but it is a divergence from Oolite (which kills a launching player on the hit itself) and needs its row.
**How to avoid:** assert both halves in a unit test (launching: energy 0, alive, no event; inFlight next hit: dead).

### Pitfall 9: Oolite line numbers drift between the checkout and the pin
**What goes wrong:** the checkout HEAD is `21978c37b`, FIDELITY and `third_party/oolite/pin.json` cite `7437f22`. `pollGameOverControls` is at 4016 in the pin and 4032 in the checkout; `gameoverscreen-*` is at 1990-1993 in the pin (and in the vendored copy) and 2035-2038 in the checkout. The CONTEXT.md line numbers are the checkout's.
**How to avoid:** take every FIDELITY citation and excerpt from `git -C /home/opencode/git/oolite show 7437f22:<path>`; the verbatim contract test only runs with `OOLITE_SRC` set, so a wrong line can pass CI and still be wrong.

### Pitfall 10: Space is a browser key
**What goes wrong:** without `preventDefault`, Space scrolls the page or activates a focused control; a focused pause or title button could consume the press.
**How to avoid:** the overlay takes focus (`tabindex="-1"`, `gameRoot.focus()` pattern of `pause.ts`) and calls `preventDefault()` on the Space it consumes.

## Code Examples

### The death function (proposal sketch)
```typescript
// src/sim/combat/death.ts  -- new names are recommendations
import { clearHyperspaceAttempt } from "../flight/state.js";
export function killPlayer(
  player: FlightState,
  combat: PlayerCombatState,
  cause: PlayerDeathCause,
  events: SimEvent[],
): void {
  if (player.mode !== "inFlight") return; // fail closed; one death only
  player.mode = "dead";
  clearHyperspaceAttempt(player); // D-10: the countdown dies with the ship, no cancelled event
  combat.energy = 0;
  combat.identEngaged = false;
  combat.identTarget = NO_ENTITY;
  events.push({ kind: "playerDestroyed", position: { ...player.position }, cause });
}
```
`clearHyperspaceAttempt` clears the countdown and the target together [VERIFIED: src/sim/flight/state.ts, "The single owner of the hyperspace attempt"]. Do not emit `hyperspaceCountdownCancelled` (the HUD would print after the message queue is cleared).

### The frame-loop branch (proposal sketch)
```typescript
if (ctx.runtime.gameOver) {
  currentInput.drainCommands();
  currentInput.drainStationActions();
  currentInput.drainChartActions();
  currentInput.drainSaveScreenActions();
  pending.length = 0;
  if (Number.isFinite(delta) && delta > 0) ctx.runtime.gameOverSeconds += delta;
  renderFrame(1, shouldDraw());
  updateProbe();
  return;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Player energy floors at 0 and nothing happens | The ledger decides death at the damage point | Phase 20 | Pitfall 6 rule; the floor stays for display |
| Death returns the last save in-session (ARCHITECTURE §7.1/7.3, ROADMAP implied work) | Page reload to the title (owner 2026-11-16, D-12) | CONTEXT 2026-11-22 | No `loadSavedGame` refactor, no `store.read()` ordering requirement in session |
| Tripwire guard `collision-player-death` | Retired with `PLAYER_NOT_DESTROYABLE_UNTIL_PHASE_20` | Phase 20 | Delete the file |

**Deprecated/outdated:** the ARCHITECTURE §7.3 "load pipeline" and §7.1 step "Load -> loadSavedGame" are superseded by D-12 for this phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A CSS `filter: saturate()` applied to the WebGL `<canvas id="view">` renders correctly and cheaply in Chromium and Firefox (MDN's saturate page does not mention canvas) | Render | The fade would not show; fall back to a full-screen overlay `div` with `backdrop-filter: grayscale()` or a mix-blend layer. Check in UAT and `e2e-cross`. |
| A2 | An IndexedDB read/write transaction already started when the page unloads still commits | Save path | The reloaded title may offer the previous anchor instead of the newest; the invariant "never a dead save" still holds, so only the wording of an assertion changes. |
| A3 | Hook-spawned `spawnTestAttacker` kills the player within a few thousand manual ticks at full shields (the 3,600-tick run in `test-spawn.test.ts` drains shields then energy but its end state was not measured for death) | Validation | The death-and-reload spec needs a measured Node twin of the death tick before pinning it (as `combat.spec.ts` pins its twin). |
| A4 | The nav buoy straight-departure ram is lethal to an idle player at 175 m/s (dam1 about 428 against shield 128 + bank 256) | Existing pins | Arithmetic on the PROJECT.md figures, not a run; a real-time UAT should confirm it before it is written into the CHANGELOG as a known cause. |
| A5 | One explosion `add` with `PLAYER_COLLISION_RADIUS_M` times a tuned factor is an acceptable stand-in for `becomeLargeExplosion:4.0` | Render | Owner may want the "large" look; needs the UAT look and a FIDELITY row. |
| A6 | `snapshotForSave` throwing for a dead state is preferable to returning `undefined` | Save path | If the owner or a reviewer prefers the type-level refusal, about 28 test call sites in 6 files change. |

## Open Questions (RESOLVED)

1. **How large should the player's explosion be?**
   - What we know: Oolite adds four small and four big fragment bursts; this layer draws one cloud plus a flash per `add`, seeded by position and radius (identical for equal inputs).
   - What's unclear: the owner's "scaled as Oolite's becomeLargeExplosion:4.0".
   - Recommendation: one `add`, radius = player collision radius times a constant tuned in UAT (record the constant and the divergence); two adds with distinct radii only if one looks thin.
   - **RESOLVED:** D-01 is locked (orchestrator ruling, 2026-11-22): `PLAYER_EXPLOSION_SCALE = 4`, Oolite's `becomeLargeExplosion:4.0` factor (`PlayerEntity.m:6208` at the pin), not tuned in UAT. 20-04 Task 2 adds the Phase 16 cloud once at `PLAYER_COLLISION_RADIUS_M * 4`. Oolite's factor counts four small and four big fragment bursts, each sized from the collision radius (`ShipEntity.m:8308-8320`, `src/Core/Entities/OOParticleSystem.m:272-274` and `322-324`); the reused layer has no fragment bursts, so the factor scales the cloud's radius. 20-10 records that difference of form (the owner's D-01 choice) in a FIDELITY row and the factor in the constants ledger; there is no tuned-scale row.
   - **SUPERSEDED (owner decision 2026-11-22, `20-CONTEXT.md` D-01 as amended; review round 1, DIV-2):** the resolution above misread Oolite's 4.0 as a size. It is a burst count: the death adds eight Phase 16 clouds (four for the small-burst loop, four for the big-burst loop) at 1x the collision radius, with distinct seed variants and no flash; no radius multiplier exists. See 20-04 Task 3.
   - **AMENDED AGAIN (owner decisions 2026-11-22, `20-CONTEXT.md` D-01a and D-01b):** the small and big bursts differ as in Oolite, each kind taking its speed range, lifetime and start size from `src/Core/Entities/OOParticleSystem.m` (`ExplosionAddOptions.kind`, plan 20-04), and the whole player explosion carries one flash (a new divergence, DIV-9), not none.
2. **Wording of the fallback line when the culprit is unknown.**
   - Recommendation: "Destroyed" (no "by"), so the four-line layout never prints an empty name.
   - **RESOLVED:** "Destroyed" for a laser and "Destroyed in a collision" for a ram when no name resolves (20-05 Task 2, `CAUSE_DESTROYED` and `CAUSE_DESTROYED_IN_COLLISION`); a raw key or an id is never shown.
3. **Should the frozen world and the missing equipment removal get FIDELITY rows?**
   - Recommendation: yes (cheap, makes the owner decisions visible to reviewers); they need reviewer agreement like the others.
   - **RESOLVED:** yes. 20-10 Task 2 adds both rows (`performDeadUpdates` from 3551, `removeAllEquipment` at 6220), each with reviewer agreement under the standard stated in 20-10's objective (`20-REVIEWS.md`, from `/gsd-review --phase 20` before execution).
4. **`snapshotForSave` refusal style** (A6): throw plus guards (recommended) versus `SaveInputs | undefined`.
   - **RESOLVED:** throw plus guards. `snapshotForSave` throws for a dead state in 20-01's death commit (Task 1), and 20-04 puts the session latch and the `buildSnapshotInputs`/`queueSnapshot` guards in front of it, so the throw is never reached from the save controller.
5. **Where the death-and-reload spec gets a lethal attacker quickly.** `spawnTestAttacker` exists (hook, `?test=1&traffic=1`); the death tick needs a Node twin (like `tick-parity.test.ts`'s kill twin) before the browser pin is written.
   - **RESOLVED:** a ram, not `spawnTestAttacker`. 20-09 seeds an in-flight save at `DEATH_RAM_POSE` near the Lave nav buoy (`inFlightSaveAt`), dies under `?test=1&traffic=1&clock=manual`, and pins the death tick and cause with the Node twin `tests/app/session/death-twin.test.ts` before the browser asserts them.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker (local) | every test/lint/typecheck command | yes | 29.8.2 | none; AGENTS.md forbids host runs |
| Remote test machine `opencode@192.168.178.51` | `verify`, `verify-full`, browser specs, acceptance run | yes (ssh returned `ok`) | WSL2, Docker 29.9.3 (per memory) | none (owner rule: run there only) |
| Oolite checkout `/home/opencode/git/oolite` | FIDELITY excerpts at the pin | yes, HEAD `21978c37b`, pin `7437f22` present (`git cat-file -t 7437f22` = commit) | — | `git show 7437f22:<path>` |
| Playwright browsers | e2e | in the Playwright image | 1.64.1 | do not download at test time |

**Missing dependencies with no fallback:** none. **Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.5 (Node project `unit`, coverage thresholds on `src/sim/**`, `src/persistence/**`), Playwright 1.64.1 for browser specs |
| Config file | `vitest.config.ts`, `vitest.acceptance.config.ts`, `playwright.config.ts` |
| Quick run command | `docker compose run --rm test npx vitest run <file>` |
| Full suite command | `docker compose run --rm test` (local `npm run test:fast` skips coverage); `docker compose run --rm typecheck`; `docker compose run --rm lint` |
| Phase gate | remote `wegolite-remote-run.sh run --rm verify-full`, then `... run --rm test npm run test:acceptance` |

New sim code must keep `src/sim/**` coverage thresholds (lines 93, branches 86): cover every branch of the lethal predicate and `killPlayer`.

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEATH-01 | Lethal laser from an NPC kills in the same tick; cause kind and culprit key correct | unit | `docker compose run --rm test npx vitest run tests/sim/combat/death.test.ts` | Wave 0 (new) |
| DEATH-01 | Lethal ram on a ship, on a buoy (key `buoy`) and on a buoy subentity contact; `destroyable` player: bank-only comparison, reversal, no nudge | unit | `... vitest run tests/sim/combat/collision-stage.test.ts tests/sim/combat/collision-buoy.test.ts` | exists, update |
| DEATH-01 | Shields absorbing everything is not lethal; energy 0 with `applied` 0 is not lethal; first lethal record wins; later player records skipped; internal-damage gates kept | unit + property | `... vitest run tests/sim/combat/ledger.test.ts tests/sim/combat/internal-damage.test.ts` | exists, update |
| DEATH-01 | No death while docked/launching, none on the dock tick (`dockReset` first) or the `hyperspaceJumped` tick; hyperspace attempt cleared; ident cleared | unit | `... vitest run tests/sim/combat/death.test.ts` | Wave 0 |
| DEATH-01 | Same-tick mutual kill: both die, NPC debris released, one `playerDestroyed`, order after `shipDestroyed` | unit | `... vitest run tests/sim/combat/death.test.ts tests/sim/combat/npc-vs-npc.scenario.test.ts` | Wave 0 / exists |
| DEATH-01 | Dead state: `stepSim` returns `[]`, `stepFlight` returns `[]`, hash and tick unchanged across N calls; `applyWitchpointArrival`/`advanceMode` do not revive | unit | `... vitest run tests/sim/death-freeze.test.ts` | Wave 0 |
| DEATH-01 | Router: `playerDestroyed` -> `deathFlow` once (latch, chart closed, messages cleared, input cleared + `"gameOver"` context, HUD hidden, explosion added, overlay shown); a second event does nothing; the 24-kind table now 25 | unit | `... vitest run tests/app/session-order.test.ts tests/app/session/death-flow.test.ts` | exists / Wave 0 |
| DEATH-01 | `pause`, `focusLost`, `enterContextLoss`, `resume` cannot open or restart anything while `gameOver`; `openChart`, `setChartCamera`, `handleFind` refuse; `advanceTicks` refuses without taint and breaks the loop; remaining steps of the lethal frame no-op | unit | `... vitest run tests/app/session/settings-controller.test.ts tests/app/session/chart-controller.test.ts tests/app/session/sim-driver.test.ts` | exist, extend |
| DEATH-01 | Frame loop: dead branch drains every queue, advances `gameOverSeconds`, never calls the sim driver, draws, and ignores held keys | unit | `... vitest run tests/app/session/frame-loop.test.ts` (add) / `tests/app/session-order.test.ts` frame-phase block | Wave 0 / exists |
| DEATH-01 | Input: `"gameOver"` context fires no action (F1-F8 swallowed); Space `repeat: true` ignored, fresh Space and click call `reload` once; Esc, P, F-keys, bound flight keys ignored | unit | `... vitest run tests/input/keyboard-gameover.test.ts tests/ui/game-over.test.ts` | Wave 0 |
| DEATH-01 | Game-over lines: "Game Over", cause ("Destroyed by Krait", "Collided with Navigation Buoy", fallback), score "Score: Harmless   (0), 100.0 ₢" (one `₢`) | unit (pure model) | `... vitest run tests/ui/game-over-model.test.ts` | Wave 0 |
| DEATH-06 | `autosave`/`manualSave`/`queueSnapshot`/`writeManualSave` refuse while dead with skip reason `"dead"` ahead of `"recovering"`; an arrival autosave queued the frame before death commits the pre-death blob and nothing after | unit | `... vitest run tests/app/session/save-controller.test.ts` | exists, extend |
| DEATH-06 | `snapshotForSave` of a dead state throws; encoded modes only `docked`/`inFlight`; existing launching-as-docked case unchanged | unit | `... vitest run tests/persistence/autosave.test.ts` | exists, extend |
| DEATH-06 | Probe: `probe.death` only while dead; `save.skipReason` `"dead"`; probe shape spec unchanged | unit + e2e | `... vitest run tests/app/session/probe-publisher.test.ts tests/app/probe-shape-compare.test.ts` | exist, extend |
| DEATH-06 | Death -> Space -> reload -> title offers Continue (seeded blob) -> resumes the save with damaged equipment; no write between death and reload | e2e | `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/death-and-reload.spec.ts"` | Wave 0 (new) |
| DEATH-06 | Autosave trigger, manual save attempt (F2 refused), `P`, Esc, F6, focus loss (`blur`), `visibilitychange` never save, never open overlays, never revive | e2e | `... playwright test tests/e2e/game-over-guard.spec.ts` | Wave 0 (new) |
| DEATH-06 | No seeded save: after reload the title offers New game only | unit (boot/title) | `... vitest run tests/app/boot.test.ts tests/app/title-confirm.test.ts` | exist (assert `setContinueVisible(false)`), extend if absent |
| QUAL-11 | One scenario (NPC-vs-NPC kill + collision kill + player death) hashes equal at 30/60/144 Hz at every sampled step, equal death tick | unit | `docker compose run --rm test npx vitest run tests/sim/world/death-cadence.test.ts` | Wave 0 (new) |
| QUAL-11 | Dead hash stable after the death for N steps and equal across cadences | unit | same file | Wave 0 |
| QUAL-11 | 20-seed acceptance 21 of 21 at the phase HEAD | acceptance | `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm test npm run test:acceptance` | exists (no edit) |
| Release | `verify-full` exits 0 with the two new specs included | gate | `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm verify-full` | — |

### Sampling Rate
- **Per task commit:** `docker compose run --rm test npx vitest run <changed files>`; at the end of each commit `test`, `lint`, `typecheck` once.
- **Per wave merge:** `docker compose run --rm test` (full) for sim plans; remote `verify` for any plan touching `src/app`, `src/render`, `src/input`, `src/ui`, `index.html`.
- **Phase gate:** remote `verify-full` and the remote acceptance run green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/sim/combat/death.test.ts` — lethal predicate, causes, mutual kill, docked/launching/dock-tick/jump-tick, ident and countdown cleared (DEATH-01)
- [ ] `tests/sim/death-freeze.test.ts` — dead state frozen across entry points (DEATH-01, QUAL-11)
- [ ] `tests/sim/world/death-cadence.test.ts` — QUAL-11 scenario, termination by step count (QUAL-11)
- [ ] `tests/app/session/death-flow.test.ts` — subscriber, latch, guards (DEATH-01/06)
- [ ] `tests/ui/game-over-model.test.ts`, `tests/ui/game-over.test.ts` (Node double for the DOM shell), `tests/input/keyboard-gameover.test.ts`
- [ ] `tests/e2e/death-and-reload.spec.ts`, `tests/e2e/game-over-guard.spec.ts`, and `inFlightSaveAt(..., { damagedEquipment })` in `tests/e2e/helpers/save-fixtures.ts`
- [ ] A Node twin `tests/app/session/death-twin.test.ts` pinning the death tick and cause of the seeded nav-buoy ram from `DEATH_RAM_POSE` (Open Question 5, RESOLVED), modelled on `tests/app/session/tick-parity.test.ts`
- [ ] Delete `tests/guards/collision-player-death.test.ts`; edit the pins in "Existing pins"
- [ ] Optional guard `tests/guards/dead-mode-gates.test.ts`: a source scan that every `src/` file comparing a `FlightMode` literal is in the reviewed list from Inventory 1 (a tripwire for the next mode)
- Framework install: none.

Per D-16 at least 90 % of the new behavioural assertions are Vitest: the two specs keep to integration lines (death, reload, Continue, inertness) and read probe fields, never wall time. Manual UAT (human): the explosion and fade look, the four-line layout, wording, and that a straight launch into the nav buoy kills an idle ship (A4).

## Security Domain

`security_enforcement` is on (ASVS level 1, block on high) [VERIFIED: .planning/config.json]. The attack surface of this phase is small: no network, no new storage, no parsing of untrusted input beyond what exists.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | static client, no accounts |
| V3 Session Management | no (browser session only) | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | the only new inputs are a keydown code and a click; accept exactly `event.code === "Space"` and `!event.repeat`; the payload `cause.culprit` is an app-internal string looked up in a closed map with a fallback, never interpolated into HTML (use `textContent`) |
| V6 Cryptography | no | no secrets |
| V12 / data integrity | yes | a dead state must never be written as a save: three-layer refusal (latch, `buildSnapshotInputs`/`queueSnapshot`, `snapshotForSave` throw); the save schema cannot encode `dead` (`z.enum(["docked", "inFlight"])`) |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Page script (`?test=1` hook) forcing a dead save or advancing a dead world | Tampering | hook mutations taint the session (no writes); `advanceTicks` refuses while `gameOver`; `worldHash` is read-only |
| HTML injection through the culprit name | Tampering | names come from compiled content; render with `textContent`, not `innerHTML` |
| Repeat death or revive through pause / resume / context loss | Elevation of state | the latch plus the `pause()`/`resume()` refusal; the guard spec asserts `probe.paused === false` and `probe.mode === "dead"` after each trigger |
| Overwriting a good save with a worse state | Tampering | the latch and `snapshotForSave` refusal; a pending pre-death write is itself a valid anchor |

## Sources

### Primary (HIGH confidence, files read this session)
- `/home/opencode/git/wegolite/.planning/phases/20-player-death-and-game-over/20-CONTEXT.md`, `.planning/ROADMAP.md` (Phase 20 and ordering rules), `.planning/REQUIREMENTS.md`, `.planning/research/ARCHITECTURE.md` §4, §6, §7, `.planning/research/PITFALLS.md` 4, 6, 7, 10, 19, 21, 22, 25, 26, `AGENTS.md`
- `src/sim/sim.ts`, `src/sim/combat/{ledger,step,collide,response,shields,state,ident}.ts`, `src/sim/flight/{state,step}.ts`, `src/sim/events.ts`, `src/sim/world/statics.ts`, `src/persistence/{autosave,idb-store,memory-store}.ts`
- `src/app/session/{context,event-router,save-controller,settings-controller,chart-controller,sim-driver,frame-loop,render-driver,probe-publisher,hyperspace-controller,start-session}.ts`, `src/app/{mode,game-session,probe,redraw-gate}.ts`, `src/input/{keyboard,actions,bindings}.ts`, `src/render/bodies/explosions.ts`, `src/render/launch-camera.ts`, `src/render/sync.ts`, `index.html`, `src/main.ts`, `src/ui/{pause,station-model}.ts`
- Tests/guards: `tests/guards/{collision-player-death,kill-credit-consumers,ship-hit-consumers,entity-id-scope}.test.ts`, `tests/sim/world/collision-cadence.test.ts`, `tests/sim/combat/{ledger,npc-fire,collision-stage,collision-buoy,step}.test.ts`, `tests/app/session-order.test.ts`, `tests/e2e/{probe-shape,combat}.spec.ts`, `tests/e2e/helpers/{save-fixtures,save-store}.ts`
- Oolite (pin `7437f22` via `git show`, and checkout HEAD `21978c37b`): `PlayerEntity.m` (`takeEnergyDamage`, `takeScrapeDamage`, `getDestroyedBy:`, `performDeadUpdates`, `gameOverFadeToBW`, `showGameOver`), `PlayerEntityControls.m` (`pollGameOverControls`), `Universe.m` (`handleGameOver`, HUD skip when dead), `ShipEntity.m` (`becomeLargeExplosion:`, `takeScrapeDamage`, collision `selfDestroyed`), `Resources/Config/descriptions.plist` and the vendored copy
- `FIDELITY.md`, `.planning/PROJECT.md` Key Decisions rows (280, 333), `CHANGELOG.md`, `.planning/todos/pending/2026-11-19-collision-reversal-on-player-death.md`, `.planning/todos/pending/2026-11-16-ci-e2e-timeout-margins.md`, `.planning/config.json`, `package.json`

### Secondary (MEDIUM confidence)
- MDN `saturate()` filter function: https://developer.mozilla.org/en-US/docs/Web/CSS/filter-function/saturate (fetched; canvas not mentioned)
- W3C IndexedDB, transaction scheduling: https://w3c.github.io/IndexedDB/ (fetched, first 100,000 characters only; unload behaviour not covered)

### Tertiary (LOW confidence)
- none beyond the `[ASSUMED]` rows in the Assumptions Log

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, no new dependency
- Architecture: HIGH, every integration point read in source; the order of calls in `resolveShots` and the guard order in `autosave()` are quoted from the files
- Pitfalls: HIGH for the repository-specific ones (1, 3-7, 9), MEDIUM for the presentation ones (2, 10)
- Existing-pin list: MEDIUM (strong leads from grep and reading; the full suite run after the rule flips is the completeness check)

**Research date:** 2026-11-22
**Valid until:** about 30 days; the inventory is only as fresh as `8fe16b3`, so re-run the `rg` sweep from Inventory 1 if another phase lands first
