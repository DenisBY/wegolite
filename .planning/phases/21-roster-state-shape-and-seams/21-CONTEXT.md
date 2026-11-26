# Phase 21: Roster, State Shape and Seams - Context

**Gathered:** 2026-11-25
**Status:** Ready for planning

<domain>
## Phase Boundary

The NPC catalogue grows to the about 28 records (18 models) that the populator's trader, pirate, police and light-hunter roles resolve to. Each record carries Oolite's bounty, roles, auto-AI, scoop, escorts, `counts_as_kill`, fuel injection and fore and aft weapons. `autoAImap.plist`, `role-categories.plist` and the comms strings of `descriptions.plist` are compiled, and the new hulls are vendored with provenance and load lazily. Every new hashed field of milestone v2.4 arrives in one world snapshot bump, v4 to v5, with pristine-omit hashing. The inert world, `INERT_POPULATION` and the frozen 20-seed acceptance inputs stay byte-identical. Pods gain a commodity and an amount. A render spike measures the draw calls of a full anarchy before any populator ships. The seams are built here, pinned by tests, with no consumer in ordinary play: the priority-AI state shape and vocabularies, `retireShip`, the ledger's hit-reaction stage, and per-facing weapon state.

Nothing plays differently yet, with one exception folded in by owner decision: debris now inherits the dying ship's velocity (D-01).

Requirements: FOUND-20, DATA-17, DATA-18. Staged here: QUAL-09 (the spike), the pod clause of CBT-11. The full scope, success criteria, implied work, pitfalls and the first plan are in ROADMAP.md, Phase 21; this file does not restate them.

</domain>

<decisions>
## Implementation Decisions

### Debris and explosion velocity (todo folded)
- **D-01:** The todo `2026-11-24-debris-inherits-ship-velocity.md` is in scope for Phase 21. Debris released by a dying ship (cargo pods, alloy plates, wrecks) inherits the ship's total velocity: drift plus forward times flight speed, as `ShipEntity -velocity` returns it (ShipEntity.m:11158-11166 at pin 7437f22). The kick is added on top of that velocity. This moves the hashed debris velocities. The move lands in the same single re-pin as the pod commodity and amount fields, with the measured cause recorded. A guard test pins debris velocity as ship velocity plus kick. — **Reversibility:** costly — reverting moves the debris goldens and twin hashes a second time.
- **D-02:** The explosion bursts take the same velocity in the same change. The small burst moves at 1x, the big burst at 0.85x (`OOParticleSystem.m:274`, `:324`). The dying ship's velocity is carried in the explosion event from `killPlayer` and `killShip`, and the render layer offsets each burst centre by `velocity × t`. The explosion layer is render-only and outside the world hash (Phase 20 D-01), so it needs no re-pin. Update or retire FIDELITY E-173 ("the absent velocity drift") and E-179 to match.
- **D-03:** Pods drift with their source ship from this phase on. This is what Phase 24's scooping builds on.

### Hash re-pin authority
- **D-04:** The Phase 18 standing approval extends to all of milestone v2.4 (Phases 21 to 26). An executor may re-pin the tick-parity twin hash (`tests/app/session/tick-parity.test.ts`), its browser twin (`tests/e2e/combat.spec.ts`), the matching kill-twin assertions and debris goldens without a checkpoint, under two conditions:
  1. The cause is measured and is an intended effect of the plan.
  2. Node and the browser produce the same new value.

  Each re-pin is recorded in the plan SUMMARY as owner-sanctioned, with a comment in each file naming the plan. Three things still need the owner: the frozen acceptance thresholds and detectors, the inert-world epoch 1-20 pin, and any hash move with an unexplained cause. This answers the roadmap's "ask the owner once, in the first plan"; the first plan need not ask again.

### Draw-call budget
- **D-05:** The spike follows D6's order of fixes: merge primitives per hull at build time, then share textures across variants. If a full anarchy with a fight and its debris still exceeds 50 calls after both fixes, the budget may be raised to at most about 80 without a further owner checkpoint. The condition is that the measured frame time holds on the remote GPU test machine, read as p95 frame time ≤ 16.7 ms during the fight. Record the measurement, the new budget and the reason in PROJECT.md Key Decisions and `docs/PERFORMANCE.md`, and update `DRAW_CALL_BUDGET` in `tests/e2e/budget.spec.ts`. Above 80, or when p95 misses 16.7 ms, stop and bring the numbers to the owner. Lowering traffic is never the fix. — **Reversibility:** reversible.
  - *Note (2026-11-26, plan 21-19; records the outcome, D-05 itself unchanged):* fix (1) was applied (plan 21-17, every NPC hull merged to one primitive, none refused) and measured at 39 calls worst case and 42 after a kill (65 and 68 before), triangles 77,934 and 78,598; the bound with all seven debris models present is 49. Fix (2) (plan 21-18) was **deferred** by the orchestrator on 2026-11-26, owner offline, on an independent reviewer's advice, because the anarchy is already within 50 and no raise is needed. `DRAW_CALL_BUDGET` stays **50**; the owner's 2026-11-25 raise authorisation was not used, and no raise is allowed while 21-18 is deferred (tripwire: the calls assertion in `tests/e2e/anarchy.spec.ts`; todo `2026-11-26-npc-variant-family-instancing`). The one-off remote RTX 4060 reading (D-06) gives the fight p95 16.70 ms at 60 Hz pacing, the same as the baseline, and 3.4 ms unpaced against the baseline's 1.7 ms. Skipping fix (2) departs from the order this decision sets, so it is **flagged for owner review** (PROJECT.md Key Decisions, "Draw-call budget and NPC model loading for the v2.4 roster").
- **D-06:** The p95 measurement is a one-off number that informs this decision. It is not QUAL-01's 60 fps evidence, which stays deferred.

### New model loading
- **D-07:** The new hull GLBs are prefetched in the background after first load, while the player is on the menu or docked, so they are ready before launch. They stay outside the 9,437,184-byte first-load ceiling, with traffic on and off. If a ship appears before its model has arrived, it draws once the model loads. The simulation never waits on or reads model loading, and determinism is unaffected.

### Claude's Discretion
- How large a comms-string subset of `descriptions.plist` to compile: the minimum the in-scope roles use, behind the strict schema.
- The exact bounds of new fields in `src/sim/world/limits.ts` (a roadmap "decision to settle" left to research and planning).
- The plan split, inside the roadmap's fixed first plan (inert-world isolation and the epoch 1-20 hash pin before any catalogue or field change).
- Whether the hit-reaction stage becomes the first `shipHit` consumer. If it does, the `skip-shiphit-for-a-doomed-target` todo comes with it, the offence broadcast is never skipped, and the `ship-hit-consumers` guard covers it (roadmap todo note).

### Folded Todos
- `2026-11-24-debris-inherits-ship-velocity.md`: debris and explosion bursts inherit the dying ship's velocity (D-01 to D-03). It moves the same debris pins as the pod fields, so it joins this phase's one re-pin instead of forcing a second one later.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and decisions
- `.planning/ROADMAP.md` § Phase 21: goal, success criteria, implied work, first plan, pitfalls, decisions to settle, todos.
- `.planning/REQUIREMENTS.md`: FOUND-20, DATA-17, DATA-18, QUAL-09, CBT-11; "Scope decisions (owner, 2026-11-25)" D1-D13; Out of Scope.
- `.planning/PROJECT.md` Key Decisions: the fidelity rule, pristine-omit hashing, the leg-anchor rule.
- `FIDELITY.md`: E-173 and E-179 (explosion drift, to update per D-02); new rows for any divergence.

### Research (v2.4)
- `.planning/research/SUMMARY.md`: § Phase 21, D2, D5, D6, D7, D13.
- `.planning/research/PITFALLS.md`: C1, C2, C6, C9, C11, M6.
- `.planning/research/ARCHITECTURE.md`: priority-AI state shape, `World.populator`, `World.station`, player standing in combat state, `retireShip`, hit-reaction stage.
- `.planning/research/STACK.md`: draw calls and InstancedMesh per (model, primitive).
- `.planning/research/FEATURES.md`: roster and role resolution.

### Todos
- `.planning/todos/pending/2026-11-24-debris-inherits-ship-velocity.md`: folded (D-01 to D-03).
- `.planning/todos/pending/2026-11-17-skip-shiphit-for-a-doomed-target.md`: applies if the hit-reaction stage becomes the first `shipHit` consumer.

### Oolite reference (local checkout, do not fetch)
- `/home/opencode/git/oolite/Resources/Config/shipdata.plist`, `autoAImap.plist`, `role-categories.plist`, `descriptions.plist`.
- `/home/opencode/git/oolite/src/Core/Entities/ShipEntity.m` (velocity 11158-11166, becomeExplosion, addWreckageFrom).
- `/home/opencode/git/oolite/src/Core/OOParticleSystem.m` (274, 324: burst velocity factors).
- Vendored, licence-audited input: `third_party/oolite/` with `CHECKSUMS.sha256`; `ASSETS.md`, `NOTICE`.

### Performance
- `docs/PERFORMANCE.md`: first-load ceiling and draw-call budget records.
- `tests/e2e/budget.spec.ts`: `DRAW_CALL_BUDGET = 50`, `FIRST_LOAD_BYTES_CEILING`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/vendor-oolite.sh`: vendoring with checksums for the new GLBs and textures.
- `src/content/schemas/ship-npc.ts` and `src/content/generated/ships-npc.json` (9 records today): the strict schema and the converter output to widen. The `aft_weapon_type` refusal lives in the converter and schema path.
- `src/app/npc-models.ts`, `src/content/npc-glb-path.ts`, `src/render/asset-cache.ts`: the existing NPC model loading path, the place to add background prefetch (D-07).
- `src/sim/world/debris.ts`: debris release (D-01). `src/render/bodies/explosions.ts`: burst layer (D-02).
- `src/sim/world/snapshot.ts`, `src/sim/world/limits.ts`, `src/sim/npc/state.ts`: snapshot version, field bounds, NPC state shape.

### Established Patterns
- Pristine-omit hashing (Phase 15): a field at its pristine value is left out of the hash, so a world that uses none of the new fields hashes as before.
- Forked RNG streams per purpose: the pod commodity and amount draw uses its own `"pod"` fork, so it moves no other draw.
- Content compiled at build time behind a strict schema, a golden and the `assets:check` drift gate; generated data is never hand-edited.
- `src/sim/` stays pure: no Three.js, no DOM.

### Integration Points
- `src/sim/world/populate.ts` (`populateInertWorld`, `INERT_POPULATION`, `createInertPopulate`), `src/app/session/start-session.ts`, `world-lifecycle.ts`, `traffic.ts`: inert-world isolation (first plan).
- `tests/app/session/tick-parity.test.ts`, `tests/e2e/combat.spec.ts`: twin hashes (D-04).
- `tests/e2e/traffic.spec.ts`, `tests/e2e/budget.spec.ts`: first-load ceiling with traffic on and off.

</code_context>

<specifics>
## Specific Ideas

- Gate per change type (owner memory): pure `src/sim/` plans need `test`, `lint` and `typecheck` only. Render, input and persistence plans need `verify`. `verify-full` runs on the remote machine at the phase gate. Every plan that touches `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json` gets the by-hand 20-seed run on the remote test machine, 21 of 21, recorded in its SUMMARY (QUAL-12).
- The draw-call spike and the p95 frame-time number are measured on the remote GPU Chromium (`~/.claude/scripts/wegolite-remote-mcp.sh`).

</specifics>

<deferred>
## Deferred Ideas

None came up in the discussion; it stayed within the phase scope.

### Reviewed Todos (not folded)
- The automatic todo match returned 41 keyword hits. Apart from the two todos named in the roadmap, none belong to this phase. Phase-tagged ones stay where they are tagged: `narrow-kill-time-ship-target-lost`, `player-ident-lock-in-target-targets-self` and `skip-shiphit-for-a-doomed-target` in Phase 23 (the last can move earlier, see Claude's Discretion); `mutual-kill-credit-symmetry` in Phase 25; `acceptance-run-with-collisions-on` in Phase 26.

</deferred>

---

*Phase: 21-roster-state-shape-and-seams*
*Context gathered: 2026-11-25*
