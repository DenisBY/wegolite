# Phase 18: Stations, Buoys and Collisions - Context

**Gathered:** 2026-11-19
**Status:** Ready for planning

<domain>
## Phase Boundary

The Coriolis station, the two navigation buoys, cargo pods and alloy plates become real targets and obstacles. Lasers stop at what they hit. Ident locks the station, the buoys, pods and plates. Buoys hold damage (250 energy) and can be destroyed. Ships, buoys, pods and plates that touch octree against octree take damage by Oolite's `collideWithShip` mass and closing-speed rule, once per contact, and get pushed apart by Oolite's velocity response. The player is included. Contact with the station hull stays damage-free (DOCK-09). The buoys also block a completing witchspace jump as in Oolite (folded todo). Requirements: DATA-15, CBT-17, CBT-18.

Not in this phase: planet and sun collision, scooping, the player's death (Phase 20), equipment damage (Phase 19), per-system station types.

</domain>

<decisions>
## Implementation Decisions

### Carried forward (already decided, do not re-ask)
- Statics are hit by porting Oolite's subentity rule. The merged-hull shortcut is not taken (owner, 2026-11-16).
- The station only absorbs hits and is never destroyed. Only buoys hold damage, in `World.staticHealth` (Phase 15, FOUND-18, D-08/D-09).
- Contact with the station hull stays damage-free until DOCK-09. Docking is unchanged.
- Station and buoy collision radii are Oolite's: 779.37 m and 59.14 m (quick task 261117-k1l).
- The first plan measures the Coriolis octree, with its subentities, against the hull caps (16,384 nodes, 200,000 bytes) in the `assets` container.
- The player's energy stays floored at 0 until Phase 20. A collision cannot kill the player in this phase.
- Phase 18 supersedes the Key Decisions row "Statics are neither laser nor ident targets", in the same commit as the rule change.

### Collision response (the push)
- **D-01:** Port Oolite's collision velocity response in full, for NPC ships, debris and the player. `collideWithShip` (`ShipEntity.m:11020-11140`) gives each party its elastic change along the line of centres (`adjustVelocity`). This includes the "moving apart at over 1 m/s" early return, the 1 m/s anti-conjoin push and the reversal when one party dies ("inelastic! - take explosion velocity damage instead"). Port the damage formula from the same function: `dam = m_other * v2b^2 / 50000000`, applied through `takeScrapeDamage`. Do not port it from the wrong half (PITFALLS 12). — **Reversibility:** costly — the drift velocity becomes hashed simulation state that every collision replay and golden depends on.
- **D-02:** Drift is a separate velocity vector beside the engine speed, as in Oolite. NPCs reuse `Entity.velocity` from snapshot v4 (Phase 15, D-01). The player gets a drift vector in its flight state. Each tick, power braking removes the drift: the player by `thrust` (`PlayerEntity.m:3372-3405`, with the `VELOCITY_CLEANUP_*` terms), an NPC by `SHIP_THRUST_FACTOR * thrust` (`ShipEntity.m:5810-5823`). Worlds and flights that never collide must hash as before (pristine-omit, success criterion 5).
- **D-03:** The explosion blast push is ported onto ships and the player, not only debris. This supersedes the Phase 16 Key Decisions row "The explosion's blast pushes debris only" (D16-04 / OC-4). Use `dealMomentumWithinDesiredRange:0.125 * mass` with `desired_range = 2.5 * collision_radius` (`ShipEntity.m:7680-7698`, `8123-8126`, `addImpactMoment` at `11178`). Owner decision 2026-11-19, after an independent check. The push is invisible for an ordinary kill at non-overlapping range (at most 0.09 m/s on an NPC and 0.003 m/s on the player, braked within one frame). It is large for a ramming or point-blank kill: a Krait dying inside the player's sphere gives the player 68 m/s, about 72 m of drift. Oolite relies on it as the survivor's rebound after a lethal collision, because `collideWithShip` reverses the normal rebound in that case.

### Destroyed buoy
- **D-04:** A destroyed buoy stays destroyed for the life of the current `World`, and a new world brings it back at full energy. A new world is created by a jump arrival, a save load and, by the existing lifecycle, every launch. Saves are unchanged: a save never carries world state. In Oolite a buoy stays destroyed through a dock and relaunch within the same system visit. Wegolite rebuilds the world on every launch, which is the existing world-lifecycle divergence that NPCs share (`src/app/session/world-lifecycle.ts`). It is not changed here. Record it in FIDELITY.
- **D-05:** A destroyed buoy leaves the 3D view and the scanner, ends any ident lock on it, and stops blocking jumps (D-09). The compass follows Oolite's rule for a destroyed beacon. The researcher must port the exact rule, with citations, for the "witchpoint" compass mode (`src/sim/world/aegis.ts` cycle: auto -> planet -> station -> witchpoint), both when that mode is selected and when the buoy dies while it is selected.
- **D-06:** Owner sanction to change the fixture pose in `tests/e2e/hyperspace-failure.spec.ts` (it parks the player at 0 m from the witchpoint buoy). Move it outside the buoy hull and outside the 264.3 m blockage radius, with a Key Decisions row. Add a unit test that no arrival or launch pose overlaps a buoy hull. This is the one sanctioned edit to an existing browser spec in this phase.

### Debris as targets
- **D-07:** Follow Oolite's `canCollide` rule exactly. Laser hits (`Universe.m:5578`) and ident (`Universe.m:5691`) both require it.
  - Cargo pods and alloy plates get hulls (DATA-15). They can be shot, rammed and ident-locked, and are destroyed at zero energy.
  - Wrecks get no hull. They never collide and are neither laser nor ident targets (`ShipEntity.m:1858-1868`).
- **D-08:** Pods, plates and buoys do not mass-lock (`PlayerEntity.m:3045-3051`, CLASS_CARGO and CLASS_BUOY). Pods and plates do not block jumps. Debris stays off the scanner until scooping (D16-26 unchanged).

### Buoys block the jump (folded todo)
- **D-09:** Fold in `2026-11-14-make-buoys-block-hyperspace-like-oolite.md`. Both live buoys join the existing `isWitchspaceBlocked` path with their compiled mass of 698,691.1875, giving a blockage radius of about 264.3 m, as observed in Oolite 1.93.1 by quick task 261117-lka. A destroyed buoy does not block. Update FIDELITY E-22 and the Key Decisions row "Keep the buoys non-blocking in Phase 12". The researcher must confirm against Oolite whether an immediate re-jump after arrival next to the witchpoint buoy is refused, and how Oolite places the arrival relative to the buoy. Wegolite must match.

### Claude's Discretion
- Whether the Coriolis hull fits the existing hull artifact or ships as its own lazily loaded file. The measurement decides; record the result as a Key Decision.
- How the player's collision damage passes through shields and energy: follow Oolite's `takeScrapeDamage` for the player, and reuse the Phase 17 shield path where it matches.
- The broad phase and pair-cost strategy (PITFALLS 17), the launching exemption and once-per-pair resolution order, all within the determinism rules (ascending id, 30/60/144 Hz equality).
- How the station's subentities answer hits at the dock mouth: port Oolite's rule, proven by octree fixtures written independently of the port.

### Folded Todos
- `2026-11-15-lasers-and-ident-hit-stations-and-buoys.md`: closed by CBT-17 (success criterion 3).
- `2026-11-14-make-buoys-block-hyperspace-like-oolite.md`: folded by owner decision (D-09). It touches the same fixture as D-06, so the browser spec is edited once.
- `2026-11-10-add-planet-and-sun-collision.md`: its buoy half is delivered by CBT-18. Planet and sun stay unscheduled, and the todo stays open for them.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and decisions
- `.planning/ROADMAP.md` § Phase 18: goal, success criteria, carry-overs (Phase 15 `sourcePosition` copy, OC-3, OC-4), implied work, pitfalls, first plan
- `.planning/REQUIREMENTS.md`: DATA-15, CBT-17, CBT-18, DOCK-09
- `.planning/PROJECT.md` Key Decisions rows to supersede or amend: "Statics are neither laser nor ident targets", "The explosion's blast pushes debris only", "Debris is not a target in Phase 16", "Keep the buoys non-blocking in Phase 12", "Station and buoy collision radii follow Oolite", "Static bodies are world entities with fixed ids 1-5", "World snapshot version 4", "Destroy a ship at zero energy through one damage ledger"
- `.planning/research/ARCHITECTURE.md` §4 (the damage ledger, collision records), §6 (determinism, hash, snapshot and save)
- `.planning/research/PITFALLS.md`: pitfalls 4, 9, 11, 12, 17
- `FIDELITY.md` E-22 and the statics laser/ident divergence rows
- `.planning/todos/pending/2026-11-14-make-buoys-block-hyperspace-like-oolite.md`, `.planning/todos/pending/2026-11-15-lasers-and-ident-hit-stations-and-buoys.md`, `.planning/todos/pending/2026-11-10-add-planet-and-sun-collision.md`

### Oolite source (checkout at /home/opencode/git/oolite; read directly, never fetch)
- `src/Core/Entities/ShipEntity.m:11020-11140` (`collideWithShip`), `11173-11181` (`adjustVelocity`, `addImpactMoment`), `1858-1872` (`canCollide`), `7680-7698` and `8123-8126` (blast push), `5810-5823` (NPC velocity braking), `2028-2044` (subentity radius and mass), `12498-12531` (mass blockage)
- `src/Core/Entities/PlayerEntity.m:3372-3405` (player drift braking), `3035-3060` (mass-lock classes), player `takeScrapeDamage`
- `src/Core/Universe.m:5549-5600` (`firstShipHitByLaserFromShip`), `5649-5722` (`firstEntityTargetedByPlayer`), `5862-5868` (entities in range)
- Vendored data for the content build: `third_party/oolite/` (keep `CHECKSUMS.sha256` honest; record provenance in `NOTICE`/`ASSETS.md`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/sim/combat/hit.ts`, `octree.ts`, `aim.ts`, `ident.ts`: laser hit resolution and ident against octree hulls. Extend the candidate set with the statics and debris.
- `src/sim/combat/ledger.ts`, `src/sim/world/kill.ts`: the one damage ledger and kill path (ascending shooter id, apply-all-then-decide-lethality). Collision records join the ledger; keep `HitRecord.sourcePosition` a copy at queue time.
- `src/sim/world/debris.ts`: debris release and the blast push (debris only today; D-03 extends it to ships and the player).
- `src/sim/world/layout.ts`, `ids.ts`: statics (ids 1-5) referenced by layout key; positions and radii stay in `SystemLayout`.
- `World.staticHealth` with serialize, sanitize and snapshot support (`src/sim/world/serialize.ts:174-249`, `sanitize.ts:753`, `snapshot.ts:503`): already hashed pristine-omit.
- `src/sim/hyperspace/countdown.ts` and `src/sim/world/ship-field.ts`: the `isWitchspaceBlocked` path and the ship mass field (D-09).
- `tools/oolite-ingest/convert/ship-hulls.ts`, `octree.ts`, `ship-mass.ts`, `ship-radius.ts`, `debris.ts`: the hull, mass and radius build (DATA-15 extends it to the Coriolis, the buoy, the barrel and the plate).
- `src/sim/world/aegis.ts`: compass mode cycle and target resolution (D-05).

### Established Patterns
- Pure, deterministic `src/sim/` with no Three.js. Fixed timestep; equality at 30, 60 and 144 Hz.
- Pristine-omit hashing: new state prints only when non-default, so worlds that never collide hash as before.
- Oracle fixtures are written independently of the port, with file:line citations into the Oolite checkout.
- QUAL-11 standing gate after plans that touch `src/sim/world/**` or the hull content. Rerun the 20-seed acceptance run by hand on the remote machine after `src/sim/npc/**` or `src/sim/world/**` changes.

### Integration Points
- The world step (`src/sim/world/step.ts`): a collision stage after movement, before the ledger applies.
- Player flight (`src/sim/flight/step.ts`): drift integration and braking; the station contact path stays damage-free.
- Render, scanner and HUD: remove a destroyed buoy; show ident names for the station, buoys, pods and plates.

</code_context>

<specifics>
## Specific Ideas

- The owner asked for an independent model check before accepting "the blast push is invisible". The check (2026-11-19, recorded in D-03) showed it is visible in the ramming-kill case, which reversed the recommendation. Apply the same skepticism to any other "negligible, leave it out" claim in this phase: verify it with numbers before recording it.

</specifics>

<deferred>
## Deferred Ideas

- Keep a destroyed buoy destroyed across dock and relaunch within one system visit, as in Oolite. This needs world state to outlive the docked period, which is a world-lifecycle change, not this phase.

### Reviewed Todos (not folded)
- `2026-11-18-per-system-main-station-types.md`: a new capability (Dodecahedron, Icosahedron); its own phase. The hull work here should not preclude it.
- `2026-11-17-ui-flight-hud-differences-from-oolite.md`, `2026-11-11-terminal-color-palette-setting.md`: UI work outside this phase.
- `2026-11-18-mutual-kill-credit-symmetry.md`, `2026-11-18-narrow-kill-time-ship-target-lost.md`, `2026-11-17-skip-shiphit-for-a-doomed-target.md`, `2026-11-19-player-ident-lock-in-target-targets-self.md`: tripwire todos tied to their first consumer. If collision kills become that consumer, the planner must honour the tripwire.
- `2026-11-14-measure-oolite-reference-in-docker.md`: tooling; may be used to verify D-09 but not folded.
- Others matched by keyword only (cargo cost basis, CI margins, review follow-ups, bargain tech days, ALT bar, guard scanner): unrelated.

</deferred>

---

*Phase: 18-stations-buoys-and-collisions*

## Owner decisions at plan time (2026-11-19, locked)

Taken after the first plan-check pass; they override any conflicting draft plan content.

- **PD-01 — Buoy subentity ported (minimal B).** A laser hit or ram that ends on the buoy's frangible subentity puts `0.01 * damage` on the buoy body **and** the full damage on the subentity, as Oolite does (`ShipEntity.m:10202-10209`, `10409-10416`; collision routing `11123-11128`). The subentity has its own energy (Oolite default 200, recharge 1/s, `ShipEntity.m:291-292`) tracked per world in the world snapshot (same amendment as PD-02; saves never carry world state, D-04). At zero it is detached: dropped from hit tests and colliders, the buoy's mass drops by the subentity mass (about 7,646.79), and its mesh is hidden. No explosion entity or debris for the detached subentity — a recorded FIDELITY divergence, like the buoy's own no-debris row. Advisors (fable, opus) favoured this; sonnet favoured a recorded divergence. Supersedes the draft "1 % only" treatment.
- **PD-02 — Buoys move when rammed, as in Oolite.** The collision response applies to the buoy side too (Oolite carries a buoy about 10 m after a 100 m/s ram, about 122 m after 350 m/s). Buoy pose and velocity become per-world state (snapshot, sanitiser, hash pristine-omit); scanner, beacon/compass, render and jump blockage read the live pose. Supersedes the draft "buoys are immovable".
- **PD-03 — Measure on real Oolite.** All three research claims are checked in the reference container (`tools/oolite-reference/run-remote.sh` on the remote machine): the dock-mouth hit distances, the buoy ram numbers, and the pod/plate jump-blockage radius. Results are recorded and either confirm the fixtures or open a fix.
- **PD-04 — `verify-full` only at phase close (18-12).** Other plans that touch browser-facing code run the fast `verify` remotely.
- **PD-05 — Rammed pods take damage (scooping deferred).** Oolite returns from `collideWithShip` before damage when `canScoop` holds (`ShipEntity.m:11022-11027`, `11183-11197`); scooping is out of phase, so rammed pods are damaged here. Record as a FIDELITY row and Key Decision.
- **PD-06 — Buoys join the NPC proximity pass (owner, 2026-11-19, after the cross-AI review).** Buoys are colliders from this phase, so they become proximity candidates as in Oolite (`CollisionRegion.m:308-311`, `ShipEntity.m:6107`: any ship over 2,000 kg raises the alert), and NPCs steer around them instead of ramming. This amends the Phase 14 participant list in `src/sim/npc/proximity.ts` ("planet, sun and buoys are not candidates"); worlds with an NPC near a buoy may hash differently, and the QUAL-11 acceptance run must be rerun after the change.
