# Phase 10: Ship Mass - Context

**Gathered:** 2026-11-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Compute Oolite's ship mass (`density * 20 * octree volume`, `ShipEntity.m:417-419`) at build time from a hull octree for every ship the inert world uses (the Phase 9 role ships, the Cobra Mk III, the Coriolis station and the navigation buoy), store it in the compiled records, and settle one recorded Coriolis mass for jump blockage. The octree exists only at build time; runtime ray and hull queries (DATA-16) are not built.

Requirement: DATA-11 (completed together with the Phase 9 fields).

</domain>

<decisions>
## Implementation Decisions

### Hull set that gets a mass
- **D-01:** Compute a mass for every Phase 9 role ship, the Cobra Mk III and the Coriolis station (mandatory, from the roadmap).
- **D-02:** The navigation buoy (model vendored by quick task 261111-g5n) also gets an octree mass now. This closes the buoy data gap from plan 06-16 and avoids a duplicate later.
- **D-03:** The dodecahedron and icosahedron stations get no mass. They stay non-blocking (06-16 option (a), owner decision 2026-11-07); Phase 12 does not consume them. Revisit only if a later phase needs them.

### Coriolis blockage value
- **D-04:** Compare the computed Coriolis octree mass with 455,223,200 (`ShipEntity.m:12504`). If the difference is inside the spike's stated tolerance, use the octree value as `CORIOLIS_STATION_MASS`. If it is outside the tolerance, stop and ask the owner with both numbers. Either way record the result as a Key Decision in `.planning/PROJECT.md`. The existing Coriolis blockage tests must pass with the chosen value.

### Where the mass is stored
- **D-05:** Add a `mass` field to the compiled NPC records in `ships-npc.json`, next to roles, AI name, scan class and model. For the Cobra Mk III and the Coriolis (which live in `ships-client.json`), add the same single `mass` field there. No separate mass file; no octree data in any bundle. `src/sim` reads only the compiled number. The mass golden is the existing content golden and `assets:check` drift gate, which fail when a mesh or octree rule changes a mass. **Rationale:** the owner asked that mass not grow a shared catalogue file; NPC fields already live in the lazily loaded `ships-npc.json`, so a mass is one number per ship there and `ships-client.json` gains only two numbers.

### Claude's Discretion
- Octree depth, float32 versus float64 in the volume sum, and the stated tolerance for the worked examples (the spike decides, since Oolite stores mass as a `GLfloat`).
- Module layout of the octree port under `tools/oolite-ingest/` (only the construction and volume parts of `Octree.m` and `OOMeshToOctreeConverter.m` are ported).
- Density source per ship (default 1.0 when `shipdata.plist` has none, as in Oolite).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning
- `.planning/ROADMAP.md` §Phase 10 — goal, success criteria, research flag, pitfalls 14, 17, 4, 12
- `.planning/REQUIREMENTS.md` — DATA-11, DATA-16 deferred
- `.planning/PROJECT.md` — Key Decisions: the 06-16 Coriolis blockage row (data gaps, option (a)), the runtime-octree deferral (D4), the v2.1 minimum scope rule (2026-11-13)
- `.planning/phases/09-npc-content/09-CONTEXT.md` — Phase 9 ship set and record fields
- `AGENTS.md` — Docker-only verification, provenance rule, Oolite checkout at `/home/opencode/git/oolite`

### Oolite sources
- `/home/opencode/git/oolite/src/Core/Entities/ShipEntity.m` lines 417-419 (mass formula) and 12498-12531 (blockage, comment with 455,223,200 at 12504)
- `/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m` lines 6544-6565 (witch jump checklist)
- `/home/opencode/git/oolite/src/Core/Octree.m` and `/home/opencode/git/oolite/src/Core/OOMeshToOctreeConverter.m` — the construction and volume parts to port
- `third_party/oolite/` — vendored `.dat` meshes (consume data from here, read behaviour from the checkout)

### Pipeline and code
- `tools/oolite-ingest/` (`generate.ts`, `convert/npc-ships.ts`, `convert/dat.ts`, `convert/ships.ts`) — content build
- `src/content/generated/ships-npc.json`, `ships-client.json`, `ships.json` — compiled catalogues
- `src/content/schemas/ship.ts`, `src/content/ships.ts` — schema and loader
- `src/sim/hyperspace/countdown.ts` — `CORIOLIS_STATION_MASS` and the blockage predicate
- `tests/sim/hyperspace-blockage.test.ts` — existing blockage tests that must keep passing

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tools/oolite-ingest/convert/dat.ts`: the `.dat` mesh parser; the octree builder consumes its output.
- `tools/oolite-ingest/convert/npc-ships.ts`: builds `ships-npc.json`; the place to add `mass`.
- The constants ledger and worked-example convention from earlier phases (Pitfall 14).

### Established Patterns
- Generated data is never hand-edited; the drift gate (`assets:check`) and content golden catch changes.
- NPC data sits in the lazily loaded `ships-npc.json`, outside the first load; `ships-client.json` stays small (two entries).

### Integration Points
- `CORIOLIS_STATION_MASS` in `src/sim/hyperspace/countdown.ts` (replaced or confirmed per D-04).
- Phase 12 consumes `mass` for mass lock and jump blockage.

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond the decisions above; open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

- Octree mass for the dodecahedron and icosahedron stations: not needed by Phase 12; revisit if blockage is extended to those 224 systems.
- Runtime ray and hull queries (DATA-16): the combat phase.

</deferred>

---

*Phase: 10-Ship Mass*
*Context gathered: 2026-11-14*
