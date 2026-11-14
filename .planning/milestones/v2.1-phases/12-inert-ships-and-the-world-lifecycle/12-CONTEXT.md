# Phase 12: Inert Ships and the World Lifecycle - Context

**Gathered:** 2026-11-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Inert NPC ships of the six populator roles are placed deterministically, drawn and shown on the existing scanner within the draw-call budget, and mass-lock the torus and block jumps as in Oolite. The world keeps running behind the chart, is cleared at each jump commit, is repopulated on arrival and is regenerated from the save's leg anchor on reload. The world step contains a faulty AI module, and `spawnEntity` refuses malformed input. Scope is fixed by ROADMAP.md (FOUND-15, FOUND-16, WORLD-15, WORLD-10, WORLD-11, WORLD-14, WORLD-16, SAVE-08). No NPC flight, AI decisions or combat.

</domain>

<decisions>
## Implementation Decisions

### Entity id counter and the traffic flag
- **D-01:** D-05 of Phase 8 keeps its current reading. The world seed and each fresh world's starting counter (101) do not depend on the traffic flag. Once the populator spawns only with traffic on, the post-populate counter differs by mode, and populate does NOT burn ids with traffic off. A world with no NPC keeps hashing as the v1 flight hash. The Phase 12 plan records this as a Key Decisions row that amends the "D-05 as proven in Phase 8" wording. — **Reversibility:** costly — ids appear in world hashes, goldens and the regenerated-world check; burning ids with traffic off would change the counter every golden pins.

### Inert ship motion
- **D-02:** Inert ships hold their placement: no motion at all in Phase 12. The Phase 8 constant-speed placeholder integrator (Key Decision (d)) must not move them (speed 0, or the integrator skipped for inert ships). The Oolite thrust and attitude port stays in Phase 13/14. The world hash, the scanner and the blockage and mass-lock checks therefore see fixed positions. — **Reversibility:** reversible — the integrator is replaced wholesale when NPC flight lands; the one test pinning it is deleted with it.

### Frame rate below 24 fps
- **D-03:** No behaviour change. The slow-motion catch-up cap (`MAX_STEPS_PER_FRAME`) stays as the deliberate bound. Phase 12 only records the decision in Key Decisions and closes the todo. Evidence under load waits for the unscheduled performance phase (former Phase 23). No notice, no automatic quality drop. — **Reversibility:** reversible — a notice or an automatic High to Standard drop can be added later without touching saved data.

### Contained AI fault (FOUND-15)
- **D-04:** When an entity's AI module throws inside the world step, the step catches it, replaces that entity's AI with `nullAI` (the entity stays in the world and on the scanner, and keeps its id), records the reason (an event or log entry that does not enter the world hash beyond the AI change itself), and the step completes with a deterministic hash. The rule is recorded as a Key Decision. The plan proves it in Vitest before any populator code lands (success criterion 1). — **Reversibility:** costly — the replacement is observable in the world hash and in any later AI or event consumer.

### Claude's Discretion
- How a refused `spawnEntity` reports its reason (FOUND-16), provided the id counter is unchanged on refusal.
- How and where outside-world holders of entity ids (for example a render map keyed by id) are cleared at every world boundary; each needs a Key Decisions row (per-world id scope, plan 08-05 row).
- Placement for the first populator (where Oolite puts each role's ships), Oolite's mass-lock range with real ships, and instancing safety of the Cobra material path: researcher territory (ROADMAP research flag).

### Folded Todos
- `2026-11-10-keep-simulating-behind-the-chart.md` — closed by WORLD-11 (the F6 chart no longer pauses the flight).
- `2026-11-10-fix-torus-refusal-message-under-mass-lock.md` — closed by WORLD-10 (no "Torus disengaged" for a drive that never ran).
- `2026-11-10-decide-behaviour-below-24-fps.md` — decided here (D-03).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and decisions
- `.planning/ROADMAP.md` — Phase 12 goal, success criteria, research flag, pitfalls and decisions to settle
- `.planning/REQUIREMENTS.md` — FOUND-15, FOUND-16, WORLD-15, WORLD-10, WORLD-11, WORLD-14, WORLD-16, SAVE-08
- `.planning/PROJECT.md` — Key Decisions: rows for world lifecycle and epoch (D-05 reading), fixed entity ids, per-world id scope, placeholder integrator (d), the v3 save schema, scope rule "less, but better"
- `.planning/milestones/v2.0-phases/08-session-split-and-world-core/08-CONTEXT.md` — D-02, D-04, D-05, D-06 (seed policy, per-entity streams, id table and scope)
- `.planning/phases/11-minimal-save-schema-v3/` — leg-anchor semantics and `anchorNextEntityId` that regeneration (SAVE-08) checks against
- `.planning/phases/10-ship-mass/` — ship, Coriolis and buoy masses for mass lock and blockage
- `.planning/phases/09-npc-content/` — role ship records and lazily loaded models

### Todos
- `.planning/todos/pending/2026-11-10-keep-simulating-behind-the-chart.md`
- `.planning/todos/pending/2026-11-10-fix-torus-refusal-message-under-mass-lock.md`
- `.planning/todos/pending/2026-11-10-decide-behaviour-below-24-fps.md`
- `.planning/reviews/2026-11-09-logic-security-review.md` — finding I3 (below 24 fps)

### Oolite reference
- `/home/opencode/git/oolite/src/` — populator placement, mass-lock range, nullAI behaviour (read from the checkout; do not fetch)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- World lifecycle (`createWorldLifecycle`, `resetForRestore`, `resume`) from Phase 8 and 11: creates the world at launch and arrival, anchors the counter.
- Typed `WorldView`/`ShipControl` AI seam with a scripted test pilot: Phase 12 is its first real consumer (the containment rule).
- `advanceTicks`, `worldHash` and `probe.sim` test hooks; `&traffic=1` opt-in for browser specs.

### Established Patterns
- `src/sim/` is pure, deterministic TypeScript; rendering, input and UI sit downstream through commands and events.
- Per-entity streams forked from `(worldSeed, entityId, purpose)`; ids monotonic per world, refused spawn does not advance the counter.
- New behavioural assertions go to Vitest; a browser spec only asserts counts, never milliseconds.

### Integration Points
- World step (AI containment), `spawnEntity` (refusal), torus and jump code (mass lock, blockage), scanner, instanced NPC render path, the F6 chart overlay and `tests/e2e/hyperspace.spec.ts` (the one sanctioned inverted check).

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches within the "necessary technical minimum" scope rule.

</specifics>

<deferred>
## Deferred Ideas

### Reviewed Todos (not folded)
- `2026-11-10-add-planet-and-sun-collision.md` — former Phase 15, after shields exist.
- `2026-11-11-cargo-purchase-cost-basis-tracking.md` — adds a save field, needs its own ordered bump after v3.
- `2026-11-11-terminal-color-palette-setting.md` — UI setting with no requirement.

</deferred>

---

*Phase: 12-Inert Ships and the World Lifecycle*
*Context gathered: 2026-11-14*
