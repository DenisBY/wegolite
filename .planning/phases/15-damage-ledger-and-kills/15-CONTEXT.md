# Phase 15: Damage Ledger and Kills - Context

**Gathered:** 2026-11-16
**Status:** Ready for planning

<domain>
## Phase Boundary

A ship whose energy reaches zero is destroyed and removed through one damage ledger and one idempotent kill path. The world never holds a dead entity or a queued AI event at a tick boundary. The NPC records and entity state carry every field the rest of milestone v2.3 needs, arriving in one snapshot v4 bump with one regeneration of the inert Lave golden.

Nothing explodes yet: a destroyed ship simply disappears (explosion, alloy plates, pods and wreckage are Phase 16). No NPC fire (Phase 17). The station and the player are never removed by this path.

Requirements: FOUND-18, FOUND-19, DATA-14. Standing gate: QUAL-11.

</domain>

<decisions>
## Implementation Decisions

### Debris motion and lifetime (decided in the first plan's field design, so no later bump)
- **D-01:** Debris (cargo, wreckage) moves by a **velocity vector** held on the entity, independent of its orientation, as in Oolite (drift is separate from tumble). The vector is a new hashed field, pristine-omit (absent for every entity that has none). Bounds live in `limits.ts` only. — **Reversibility:** one-way — a hashed field in snapshot v4; changing it later is a second bump and golden regeneration.
- **D-02:** Wreckage and pod lifetime is held in the existing `Entity.energy` (it decreases per tick; at zero the entity leaves through the same kill path), as in Oolite. No separate lifetime field. — **Reversibility:** one-way — same reason; the field set is frozen by v4.
- **D-03:** Tumble stays a render-side cosmetic derived from entity id and flight time unless a later phase needs it in the sim; the orientation field is free for it.

### Events and AI notification
- **D-04:** On a kill, the killer gets `shipTargetDestroyed` (plus `shipKilledOther` when the killer is an NPC), and every ship that had the victim as its target gets `shipTargetLost`. Nobody else is notified. All are delivered by the immediate drain before the tick ends (`drainAiEventsNow`); the queue is empty at the boundary. A dead or missing killer is tolerated (`killer = NO_ENTITY`).
- **D-05:** The payloads stay as they are: `shipDestroyed { id, position, radius, specKey, killer }` unchanged, `identLost` without a payload (same message as leaving scanner range), `entityRemoved { id }` one per committed removal. No `cause`/`reason` fields now; Phase 20 adds `cause` to `playerDestroyed` when it needs it. The closed sets (event router table, probe shape) still change by design for the new emissions; amend them and say why.

### Entity fields and NPC record (one v4 bump)
- **D-06:** Cargo on an NPC is a **capsule count only** (one number, chosen at spawn from `likely_cargo`/`max_cargo`). The commodity of each capsule is drawn at the moment of the explosion from the ship's own `combat` stream (Phase 16).
- **D-07:** The weapon field holds **weapon temperature and the integer tick of the last shot** (the whole Oolite fire-gate state; `shot_time` is quantised to ticks, never frame time). It does not live in Phase 14's frozen steering record. Everything else the gate needs is derived from the current tick.
- **D-08:** Static health is a per-world `staticHealth` for the station and the buoys (buoy 250 energy, station 25000 that only absorbs), hashed only when non-pristine. Phase 15 introduces the field and its hash segment; Phase 18 consumes it.
- **D-09:** Worlds that never fire, carry cargo or take damage hash as before (pristine-omit). Proof: strip the new segment and the new golden re-hashes to the old one; the hash replays equal at 30, 60 and 144 Hz. Phase 14's frozen steering record gets its third owner-chosen regeneration, recorded in PROJECT.md Key Decisions.
- **D-10:** The NPC record gains weapon facings (forward, aft, port, starboard weapon and position, extending the existing `forwardWeapon`/`forwardWeaponPosition`), `likely_cargo`, `max_cargo`, `fragment_chance` and `explosion_type`, compiled from Oolite's `shipdata.plist` with `like_ship` resolved and with provenance, behind the strict schema, the golden and the content drift gate. Do not hand-edit generated data.

### Existing tests that encode "nothing is destroyed"
- **D-11:** The first plan lists every test and golden that encodes the old rule (energy floors at zero and the ship stays; known sites: `tests/sim/combat/{step,weapons,npc-fire,shields}.test.ts`, `tests/ui/hud-model.test.ts`, probe-shape fixtures, world step/cadence tests) with the reason for each amendment. Each is amended in the plan that changes the behaviour. No piecemeal fixing by red runs.

### Fixed by the roadmap and owner decisions (not re-asked)
- **D-12:** One damage ledger applied after the world step; second `commitWorld`; idempotent `killShip`; a property test over random fights proves a kill on the spawn tick, a mutual kill and a repeated kill request each leave a round-tripping snapshot.
- **D-13:** The player's energy still floors at zero until Phase 20; the station and the player are never removed by this path.
- **D-14:** NPC fire comes only from the engine and test pilots; the phase is verified with the player's laser and the test shooter.
- **D-15:** New code is total (outside AI fault containment): no function may throw on any world state.

- **D-16:** (plan-phase, owner-confirmed 2026-11-16) The weapon record gains a third token, `missedShots` (Oolite `_missed_shots`: +1 on a miss, -1 on a hit, floored at 0; it divides NPC aim accuracy in `onTarget`), inside the same v4 bump. Amends D-07. — **Reversibility:** one-way — hashed field of snapshot v4.
- **D-17:** (plan-phase, owner-confirmed 2026-11-16) No contact-guard field is added for Phase 18 collision rebounds; Phase 18 decides and bumps if it needs one.

### Claude's Discretion
- Exact field names, segment labels and bounds in `limits.ts`.
- Plan split, the exact ledger record shape and the order of ascending-id resolution.
- How the player's-target `shipTargetLost` interacts with the ident lock message wording (app owns wording).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project and milestone
- `.planning/PROJECT.md` — scope and Key Decisions (record the field set, the third steering-record regeneration, the superseded "nothing is destroyed" rows)
- `.planning/REQUIREMENTS.md` — FOUND-18, FOUND-19, DATA-14, QUAL-11
- `.planning/ROADMAP.md` §Phase 15 — goal, success criteria, pitfalls, owner decisions in force
- `.planning/research/SUMMARY.md` — OQ-7 (snapshot design), open questions
- `.planning/research/ARCHITECTURE.md` — tick order, `drainAiEventsNow`, kill path, debris, event table, snapshot section
- `.planning/research/PITFALLS.md` — pitfalls 3, 4, 5, 6, 16, 22
- `.planning/research/FEATURES.md`, `.planning/research/STACK.md` — rules and content-pipeline changes

### Code
- `src/sim/world/entity.ts`, `serialize.ts`, `snapshot.ts`, `limits.ts`, `sanitize.ts`, `store.ts`, `step.ts` — entity record, hash segments, snapshot codec, bounds, commit
- `src/sim/combat/step.ts` — `resolveShotHits` (current floor-at-zero rule, N2) and `resolveShots`
- `src/sim/combat/ident.ts` — ident lock update
- `src/sim/events.ts` — `shipDestroyed`, `entityRemoved`, `identLost`, reserved kinds
- `src/sim/ai/types.ts` — `AI_EVENT_NAMES` (`shipTargetDestroyed`, `shipKilledOther`, `shipTargetLost`)
- `src/app/session/event-router.ts`, `tests/app/session-order.test.ts` — closed router table
- `src/content/generated/ships-npc.json`, `tests/golden/content/ships-npc.json`, `tests/content/ships-npc.test.ts` — NPC record, golden, schema

### Oolite reference (read from the checkout, not the network)
- `/home/opencode/git/oolite/Resources/Config/shipdata.plist` — weapon facings, `likely_cargo`, `max_cargo`, `fragment_chance`, `explosion_type`, `like_ship`
- `/home/opencode/git/oolite/src/Core/Entities/ShipEntity.m` — `takeEnergyDamage`, `becomeExplosion`, `releaseCargoPodsDebris`
- `third_party/oolite/` — the vendored, licence-audited input for the content build (`CHECKSUMS.sha256` stays honest)

### Process
- `AGENTS.md` — Docker-only tests, gates, the by-hand 20-seed acceptance run (21 of 21) after any change under `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json`; detector changes need the owner's trailer

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `store.kill` / `commit` already mark and remove dead entities and emit `entityRemoved` in ascending order.
- `drainFireQueue`, `HitRecord` and `firstShipHit` in `combat/step.ts` already produce the damage records the ledger consumes.
- `RESERVED_EVENT_KINDS` already reserves `shipDestroyed`, `entityRemoved`; `identLost` exists.
- `Entity` already holds `energy`, `maxEnergy`, `energyRechargeRate`, per-entity `rng` streams (`ai`, `combat`).
- `ENTITY_KINDS` already contains `cargo` and `wreckage`.

### Established Patterns
- Hash and snapshot segments are labelled (`;steer:`); optional state is omitted while pristine.
- Bounds only in `limits.ts`; parsers repair via `sanitizeEntity`.
- Event router is table-driven and pinned by tests; an unrouted kind is ignored.
- Sim never imports Three.js or the DOM; ids do not leave the sim (`tests/guards/entity-id-scope.test.ts`).

### Integration Points
- `resolveShotHits` currently applies the damage inline and floors energy at 0 (N2); it becomes a producer of ledger records.
- `snapshotWorld` throws on an uncommitted dead entity and a non-empty AI queue; the second commit and the immediate drain make this hold at the boundary.
- `updateIdentTarget` runs last, after the second commit, so a destroyed target is dropped on the same tick.
- The acceptance harness throws on any flyer death; frozen worlds stay byte-identical because nothing fires in them.

</code_context>

<specifics>
## Specific Ideas

- Oolite fidelity rules where it is cheap: velocity independent of orientation, lifetime in `energy`, kill notifications to the killer and to those targeting the victim.
- Owner preference (memory): scope to the technical minimum; no new fields beyond what Phases 16 to 20 consume.

</specifics>

<deferred>
## Deferred Ideas

- Explosion, alloy plates, pods, wreckage, entity-cap policy, debris models: Phase 16.
- NPC fire gate, hits on the player: Phase 17.
- Station and buoy hits, collisions: Phase 18.
- `cause` on `playerDestroyed`: Phase 20.

### Reviewed Todos (not folded)
- `2026-11-15-lasers-and-ident-hit-stations-and-buoys`, `2026-11-14-make-buoys-block-hyperspace-like-oolite`: Phase 18.
- `2026-11-16-phase-14-review-followups`: acceptance-in-CI and detector changes need the owner's trailer; not this phase.
- `2026-11-10-add-planet-and-sun-collision`, terminal palette, cost-basis, CI timeout margins, measure-oolite-in-docker: unrelated or later.

</deferred>

---

*Phase: 15-Damage Ledger and Kills*
*Context gathered: 2026-11-16*
