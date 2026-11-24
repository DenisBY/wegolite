# Phase 20: Player Death and Game Over - Context

**Gathered:** 2026-11-22
**Status:** Ready for planning

<domain>
## Phase Boundary

The player can die. A player in flight (`inFlight` only) whose energy reaches zero from any ledger damage source (NPC laser, a ram into a ship or buoy, anything else routed through the damage ledger) dies on that tick through one death path: the ship explodes, the simulation freezes, the game-over view shows, and on the player's input the page reloads to the title, which offers Continue only when a loadable save exists. A dead player is never saved. The milestone's determinism gate (QUAL-11: the kill scenario hash at 30/60/144 Hz and the 20-seed acceptance run, 21 of 21) and release gate (`verify-full` on the remote machine) close here, together with the documentation close-out.

Requirements: DEATH-01, DEATH-06, QUAL-11.

Locked before this discussion (owner, 2026-11-16, ROADMAP "Owner decisions in force"): game over is a page reload; death happens only while `inFlight` (a launching or docked player never dies); no escape pod; the world is frozen with a deterministic dead hash during the game-over window; no save is ever written on death.

</domain>

<decisions>
## Implementation Decisions

### Death presentation (what the player sees)
- **D-01:** Follow Oolite's death presentation (`PlayerEntity.m` `getDestroyedBy:` ~6190-6222, `performDeadUpdates` ~3552, `gameOverFadeToBW` ~3566). The camera switches to the aft view and is set back 100 m (`moveForward:100.0`). The player's large explosion plays, reusing the Phase 16 explosion effect the way Oolite's `becomeLargeExplosion:4.0` builds it (`ShipEntity.m:8308-8320`). The 4.0 is a burst count, not a size. So the explosion is eight adds of the Phase 16 cloud on the death tick, four "small" and four "big" with distinct seeds (mirroring Oolite's two burst loops). Each is sized at **1×** the player's collision radius (as NPC explosions are), never ×4. This is the owner's decision of 2026-11-22, resolving Fable's DIV-2 objection in `20-REVIEWS.md`. It replaces the earlier "radius ×4" reading, which was the orchestrator's error. The only remaining divergence is the particle form (a Phase 16 cloud per burst instead of Oolite's particle systems). Check the draw-call budget.
  - **D-01a (owner, 2026-11-22, after the reviews revision):** the four small and four big bursts **differ** as in Oolite. Each kind takes its speed range, lifetime and start size straight from `OOParticleSystem.m` at pin 7437f22: small 100–400 m/s for 1.5 s, no growth (fast sparks); big `1 + 0.5r` up to 4× that, about 37–149 m/s at the player's r = 72.7 m, 1.0 s, starting at 2r and growing (Oolite's "slow clouds", a swelling fireball). An earlier draft of this bullet said "big faster". That was the orchestrator's misreading; Oolite's values rule. The values are not hand-tuned. They are not eight identical adds that differ only by seed.
  - **D-01b (owner, 2026-11-22):** **one** flash for the whole player explosion, not one per burst and not none. This is a new divergence (DIV-9): Oolite's `becomeLargeExplosion:` adds no flash. It needs a FIDELITY row and explicit reviewer acceptance in `20-REVIEWS.md` before 20-10 records it.
  - **D-01c (owner, 2026-11-22):** NPC debris already in flight when the player dies keeps moving **on screen only**: a render-side extrapolation on the presentation clock. The sim stays frozen and the dead hash is unchanged. This brings the dead view closer to Oolite, where the universe keeps running. The DIV-7 row says which layers still move: explosions, shots, debris and the fade.
  - **D-01d (owner, 2026-11-23):** the on-screen debris drift has **no time limit**: a piece keeps moving for as long as the game-over view is shown. The redraw is bounded instead: the dead view idles its redraw once no moving debris piece is inside the camera's view, after the fade and bursts have settled. The orchestrator's earlier 30 s stop (`DEAD_DRIFT_LIMIT_SECONDS`) is withdrawn; it was never an owner decision. (Its redraw half is withdrawn by D-01e; the no-time-limit drift stands.)
  - **D-01e (owner, 2026-11-24, after the UAT, gap G-20-1 in `20-UAT.md`):** follow Oolite: after the death the camera coasts render-only at Oolite's 160 m/s (`getDestroyedBy:` sets `flightSpeed = 160`, `PlayerEntity.m:6211`), looking aft, on the presentation clock (`gameOverSeconds`); the sim, its tick and the world hash stay frozen and nothing new is saved; the explosion, the debris and the dust move relative to the coasting camera, and the dust never draws as still random-axis dashes (a test pins the arguments passed to `dust.update` while dead). FIDELITY E-179 and the PROJECT.md DIV-7 decision are revised to match. **Derived consequence, owner-confirmed 2026-11-24 before execution:** the redraw half of D-01d is withdrawn. A coasting camera changes the image on every frame, so the dead view redraws every frame while it is shown, at the cost of a flight frame, until Space or a click (D-07); the visibility bound D-01d gave a camera at rest is removed. **Range, owner-confirmed 2026-11-24 (answering the Round 3 reviewers' range question in `20-REVIEWS.md`):** the dead camera coasts WITHOUT a distance cap. Recorded consequence: Oolite's camera stops about 4.9 km out at the 30 s reset (100 m setback plus 160 m/s x 30 s; `kDeadResetTime`, `PlayerEntity.m:99`, `:3559-3563`), while Wegolite's keeps going at 576 km per hour of open view and passes through the station, the planet and the sun. The pass-through is faithful (`canCollide` returns NO while dead, `PlayerEntity.m:2242-2249`); only the range is new, and it follows from the missing 30 s restart (D-06, E-176). Implemented by plan 20-12.
  - **20-04 split (owner, 2026-11-23):** split 20-04 into two plans. One holds the session latch and save refusal; the other holds the explosion layer (`src/render/bodies/explosions.ts` and its tests), which does not depend on 20-01.
  - **Accepted planner calls (2026-11-22):** the explosion pool grows from 8 to 16, so the player's bursts never overwrite an NPC's explosion on a mutual-kill tick. In the QUAL-11 scenario, the nav buoy destroyed by the same ram that kills the player counts as criterion 4's "collision kill". The image fades to black and white over 5 s (`gameover-seconds-to-bw-fadeout` default 5.0). The HUD is hidden (`setDisplayText:NO`), and the message queue and target-lost messages are cleared. The simulation is frozen: the explosion and the fade are render-only effects, outside the sim and the hash.
- **D-02:** The game-over text keeps Oolite's three lines, from `descriptions.plist` (`gameoverscreen-game-over` "Game Over", `gameoverscreen-score-@` "Score: %@, [credits_number] ₢", `gameoverscreen-press-space` "Press Space"), **plus one added cause-of-death line** (owner choice; a divergence that needs a `FIDELITY.md` row and reviewer agreement, per the fidelity rule).
- **D-03:** The cause line names the damage type and the culprit's ship name: for example "Destroyed by Krait" for an NPC laser, and "Collided with Navigation Buoy" or "Collided with Krait" for a ram. Names come from the compiled ship data. The exact English wording is the planner's choice within this shape.
- **D-04:** The culprit is the source of the ledger record on which the player's energy reached zero (Oolite's `getDestroyedBy:whom`), with deterministic ledger order. If the culprit was also destroyed on the same tick, the line still names it. The `playerDestroyed` payload therefore carries the cause kind and the culprit's ship type/name, not a live entity id (respect the entity-id-scope guard). This does not read or change NPC kill credit (`.killer`), so `tests/guards/kill-credit-consumers.test.ts` stays as it is.
- **D-05:** Score line = `formatRating(rating, kills)` (`src/ui/station-model.ts:537`) with the current values, and credits. The kill tally (`ship_kills`) is not modelled and stays deferred with LAW-* (see Deferred), so today this shows "Harmless   (0)". It comes alive by itself when LAW-* adds the tally.
- **D-06:** The game over ends only on player input (owner choice). There is **no 30 s auto-restart** (Oolite's `kDeadResetTime`); this is a divergence and needs a `FIDELITY.md` row.
- **D-07:** Accepted inputs: a fresh **Space** press (fixed key code, not rebindable, like Oolite's `pollGameOverControls` `isDown:32` with the `spacePressed` edge latch) **or a mouse click** (owner choice; a small divergence, so add a `FIDELITY.md` row). Both work right away, with no delay for the fade, but a Space held from flight does not count; it needs a new press. Esc, F-keys, pause and every flight binding are ignored on the game-over view, and no pause overlay ever opens over it.
- **D-08:** Death with the chart (F6) or another screen (F2 etc.) open: close it and show the explosion. Oolite switches to `VIEW_AFT` regardless.

### Same-tick and edge cases
- **D-09:** Player and NPC killing each other on one tick (lasers or a ram): **both die**. The NPC goes through the ordinary kill path (explosion, debris), and the player dies on the same tick. This is deterministic and independent of entity order. It matches the 18-20 measurement (a player against a nav buoy at 350 m/s: both destroyed). This settles the Phase 15 carry-over.
- **D-10 (from research, not asked):** No death on the docking tick (`dockReset` refills energy before the combat step; assert it). No damage on the `hyperspaceJumped` tick. A death during a hyperspace countdown cancels the countdown. A launching player's energy cannot reach death (it clamps; the death check requires `inFlight`).
- **D-11:** Folded todo "collision reversal": the player becomes `destroyable` in `gatherColliders`, and `PLAYER_NOT_DESTROYABLE_UNTIL_PHASE_20` is removed in the same commit that adds the death. Keep Oolite's detail that `selfDestroyed` compares the ram damage with the **energy bank only** (`ShipEntity.m:11111`), not shields plus energy, even though shields absorb the scrape first in `takeScrapeDamage`. Do not "correct" it.

### After game over
- **D-12:** Space or click → `window.location.reload()` → the ordinary title, with Continue only when the boot read finds a loadable save (the existing `main.ts` boot path; no new title logic). Oolite instead loads the last save directly (`handleGameOver` → `loadPlayerIfRequired`). That is a recorded divergence: a `FIDELITY.md` row (the owner's 2026-11-16 decision, reaffirmed).
- **D-13:** With no save, or a corrupt, future, unreadable or unavailable one: nothing special on the game-over view. After the reload the title shows only New game (plus its existing corrupt-save messaging).
- **D-14:** Continue after a death resumes the save exactly as stored (docked or in flight, with damaged equipment, save v5).

### Milestone close-out and tests
- **D-15:** Phase 20 does the documentation close-out: the `FIDELITY.md` rows (the energy floor plus the death check, and divergences D-02/D-06/D-07/D-12), the Key Decisions amendments (the energy floor rule and the `playerDestroyed` payload), the `CHANGELOG.md` entries under `## [Unreleased]`, the `NOTICE`/`ASSETS.md` provenance for anything new, the CI e2e timeout margins, `verify-full` on the remote machine, and the by-hand 20-seed acceptance run. **The version bump, the move of Unreleased under a version, and the tag are not in this phase**: they happen in `/gsd-complete-milestone`.
- **D-16:** Exactly two new browser specs: **death-and-reload** (death via a test hook → Space → title with Continue → resume the save with damaged equipment) and **game-over-guard** (autosave, manual save, pause, the chart and focus loss never save or revive a dead player). All race and edge cases (an autosave on the death frame, a pending write, a context loss, the hyperspace countdown, held keys, the ident lock) are Vitest. At least 90 % of the new behavioural assertions are Vitest.

### Claude's Discretion
- The exact English wording of the cause line (within D-03's shape) and the visual layout of the four text lines (Oolite shows them as HUD messages, centred).
- How the B&W fade is implemented (post-process pass or CSS filter), within the render budget.
- The `FlightMode "dead"` design and the fail-closed inventory of the roughly 48 mode sites and 15 `paused` sites, the session latch ahead of the save guards, and whether `store.read()` waits for queued writes (research ARCHITECTURE §7).
- The deterministic dead-hash scheme during the game-over window.

### Folded Todos
- **`2026-11-19-collision-reversal-on-player-death.md`**: Oolite's inelastic collision reversal once the player can die (D-11). The commit that adds the death removes `PLAYER_NOT_DESTROYABLE_UNTIL_PHASE_20`, which retires `tests/guards/collision-player-death.test.ts` and closes the todo.
- **`2026-11-16-ci-e2e-timeout-margins.md`**: apply its 60 % rule to the two new specs in the same change (D-16).
- **`2026-11-18-mutual-kill-credit-symmetry.md`**: reviewed for the player-versus-NPC mutual kill (D-09). Phase 20 adds **no** consumer of NPC kill credit (the cause line uses the lethal ledger record's source, D-04, and the score uses no kill tally, D-05), so the todo's trigger does not fire. The todo and its guard stay open for LAW-*. Record in the plan that this was checked.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and decisions
- `.planning/ROADMAP.md` — Phase 20 section (success criteria, implied work, pitfalls, decisions to settle), "Owner decisions in force", ordering rules
- `.planning/REQUIREMENTS.md` — DEATH-01, DEATH-06, QUAL-11; LAW-01..07 (deferred kill tally / rating)
- `.planning/PROJECT.md` — Key Decisions (the energy floor rule to amend; the fidelity rule)
- `FIDELITY.md` — the divergence register; new rows for D-02, D-06, D-07, D-12 and the energy floor

### Research
- `.planning/research/ARCHITECTURE.md` §7 (the single death path, the guards that must test the dead mode first, the load pipeline, the title flow) and §11 (Q5, Q6)
- `.planning/research/PITFALLS.md`: pitfalls 4, 6, 7, 10, 19, 21, 22, 25, 26

### Folded todos
- `.planning/todos/pending/2026-11-19-collision-reversal-on-player-death.md`
- `.planning/todos/pending/2026-11-16-ci-e2e-timeout-margins.md`
- `.planning/todos/pending/2026-11-18-mutual-kill-credit-symmetry.md`

### Oolite reference (checkout at `/home/opencode/git/oolite`)
- `src/Core/Entities/PlayerEntity.m`: `getDestroyedBy:damageType:` (~6190-6222), `performDeadUpdates` (~3552), `gameOverFadeToBW` (~3566), `showGameOver` (~3630), `kDeadResetTime` (line 99)
- `src/Core/Entities/PlayerEntityControls.m`: `pollGameOverControls` (4032)
- `src/Core/Universe.m`: `handleGameOver` (2961)
- `src/Core/Entities/ShipEntity.m`: collision `selfDestroyed`/`otherDestroyed` (11020-11149, especially 11111)
- `Resources/Config/descriptions.plist`: `gameoverscreen-*` (2035-2038)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/render/bodies/explosions.ts`: the Phase 16 explosion effect, reused for the player's large explosion.
- `src/ui/station-model.ts` `formatRating`: the score line.
- `src/ui/title.ts` + `src/main.ts:379` `setContinueVisible(bootSave !== undefined)`: the title after reload already offers Continue only for a valid save.
- `src/sim/events.ts:179`: `playerDestroyed` is already a reserved event kind (`{ position }`); its payload widens to carry the cause (D-04).

### Established Patterns
- One kill path / damage ledger (`src/sim/combat/ledger.ts`, `src/sim/world/kill.ts`): the player's death routes through it (FOUND-19).
- Fail-closed modes (research Pattern 5): `FlightMode` in `src/sim/flight/state.ts:18` gains `"dead"`, and every mode/paused site must refuse it.
- Closed sets (event router table, probe shape, HUD) widen by design when the event or mode changes.
- Guards as tripwires: `tests/guards/collision-player-death.test.ts` retires with this phase; `tests/guards/kill-credit-consumers.test.ts` must stay green.

### Integration Points
- `src/sim/combat/collide.ts:240,451`: `PLAYER_NOT_DESTROYABLE_UNTIL_PHASE_20`, to remove.
- `src/sim/combat/ledger.ts`: the player's energy floor is replaced by the death check (update the marker sentence).
- `src/app/session/save-controller.ts`, `src/persistence/save.ts` / `autosave.ts` (`snapshotForSave` must refuse `dead`), `src/app/session/frame-loop.ts`, `settings-controller.ts`, `chart-controller.ts`, `sim-driver.ts`, `event-router.ts`, `probe-publisher.ts`, `src/app/game-session.ts`.

</code_context>

<specifics>
## Specific Ideas

- The owner wants Oolite's look (aft view, explosion, B&W fade), with a clearer cause-of-death line and no auto-timeout.
- Space works on a fresh press only; a mouse click also works, for the browser.

</specifics>

<deferred>
## Deferred Ideas

- **The player kill tally (`ship_kills`) and combat rating**: deferred with LAW-01..07 (legal status, police, bounties, combat rating, scooping escape capsules) to a later milestone that has no roadmap phase yet. When it lands, it is the first consumer of kill credit and must settle `2026-11-18-mutual-kill-credit-symmetry.md`. It also needs a save field after v5.
- **Release (version bump, Unreleased → version, tag)**: `/gsd-complete-milestone`, not Phase 20.

### Reviewed Todos (not folded)
- The todo matcher listed about 34 other todos by keyword overlap (HUD, chart F-key bugs, buoys, divergences E-126/E-131/E-135/E-138/E-147/E-150, D-08, the station types, and so on). None is part of the death path; they stay in the backlog.

</deferred>

---

*Phase: 20-player-death-and-game-over*
*Context gathered: 2026-11-22*
