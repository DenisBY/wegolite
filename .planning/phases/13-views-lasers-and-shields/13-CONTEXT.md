# Phase 13: Views, Lasers and Shields - Context

**Gathered:** 2026-11-14
**Status:** Ready for planning

<domain>
## Phase Boundary

The player can look and fire in four directions. Lasers bought per facing hit ships by their Oolite octree hulls, shields and energy banks absorb and recharge damage, docking restores them, and Oolite's keys for pause, ident and eject are in place. A refused hyperspace arrival no longer leaves a stale world. Scope is fixed by ROADMAP.md Phase 13 (FOUND-17, INPUT-01, CBT-04 to CBT-07, DOCK-10). Nothing is destroyed in this milestone: a ship's energy floors at zero.

</domain>

<decisions>
## Implementation Decisions

### Octree hit data (CBT-07)
- **D-01:** Octree data for the Cobra and the nine NPC hulls ships as a separate lazily loaded file, not in the first-load set. The 9,437,184-byte ceiling stays untouched (D11); traffic-on cold start is 8,839,791 bytes. The planner must define the "data not loaded yet" state: a shot fired before the load completes cannot hit, and a Vitest scenario pins that.
- **D-02:** The ray test is two-stage, as in Oolite: a cheap bounding-sphere check first, then a descent into the octree only on a sphere hit. A shot inside the sphere but outside the hull misses (success criterion 3).

### Ident lock (INPUT-01)
- **D-03:** With no missiles in this milestone, R (ident) shows a frame around the locked target in the 3D view plus one message-line entry with the target's name and class. The message goes through the existing message-line throttle (pitfall 26). The frame is the only new HUD drawing; the planner decides whether it fits inside the pinned eleven-element set (as the hyperspace target did, PROJECT.md Key Decisions) or needs a recorded revision (pitfall 21).
- **D-04:** Lock lifecycle follows Oolite: pressing R again clears the lock, and the target leaving range clears it. The researcher confirms the exact rule against `/home/opencode/git/oolite/src/Core/Entities/PlayerEntity*.m`.

### Cabin temperature (CBT-06)
- **D-05:** The only heat input in this phase is energy damage (`PlayerEntity.m:5673`). Sun and atmosphere heating stay out (DEATH-03, DEATH-05, unscheduled).
- **D-06:** The `CT` gauge is already drawn as a static placeholder; this phase wires it to live data and it stays always visible, as CBT-06 states. It cools at Oolite's rate; the researcher reads the cooling constant from source into the constants ledger (pitfall 14). Docking resets it (DOCK-10).

### HUD gauges are wired, not added
- **D-07:** `src/render/hud/draw.ts` (`drawLeftGauges`, `drawRightGauges`, lines ~489-550) already draws placeholders for `FWD`/`AFT` shields, `CT`, `LT`, the energy banks `E1`..`E4` and the `MISS` pylons, with fixed fill values (shields 1, CT 0.22, LT 0). The work is feeding these from `HudModel` (`model.bars`), not new layout. The eleven-element contract (`HUD_ELEMENTS`, `tests/ui/hud-model.test.ts`, `tests/e2e/hud.spec.ts`) and every `HUD_LAYOUT` rectangle stay untouched. `MISS` stays a placeholder (no missiles in this milestone).

### Claude's Discretion
- IN-01 of the WR-01 todo (torus message wording when mass lock stops a running drive): not discussed. Default: fold it into the FOUND-17 plan if the change is one line, otherwise leave it as a todo.
- The free key for target-station (R moves to ident): not discussed. Pick Oolite's own binding if one exists, else the nearest free key, and list it in the controls panel.
- Port and starboard view cameras, HUD layout beyond the ident frame, and the combat constants ledger values: research and plan-phase decide, sourcing from the Oolite checkout.

### Folded Todos
- `2026-11-14-clear-world-when-arrival-begin-is-refused.md` — closed by FOUND-17, the first plan (WR-01).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning
- `.planning/ROADMAP.md` — Phase 13 details, ordering rules, pitfalls to address, decisions to settle
- `.planning/REQUIREMENTS.md` — FOUND-17, INPUT-01, CBT-04 to CBT-07, DOCK-10
- `.planning/PROJECT.md` — Key Decisions (money-path boundary, combat save fields land with their consumer, D11 first-load ceiling)
- `.planning/todos/pending/2026-11-14-clear-world-when-arrival-begin-is-refused.md` — WR-01 and review item IN-01

### Oolite reference (read from the checkout, consume data from `third_party/oolite/`)
- `/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m` — shields, energy, cabin temperature (`:5673`), ident, laser fire
- `/home/opencode/git/oolite/Resources/Config/` — `shipdata.plist`, `equipment.plist`, `hud.plist`, `keyconfig.plist`

### Prior phases
- `.planning/milestones/v2.1-phases/10-ship-mass/` — build-time hull octrees and masses
- `.planning/milestones/v2.1-phases/11-minimal-save-schema-v3/` — the ordered save chain the v3 to v4 bump extends
- `.planning/milestones/v2.1-phases/12-inert-ships-and-the-world-lifecycle/` — world lifecycle and the AI seam

</canonical_refs>

<code_context>
## Existing Code Insights

Not scouted in depth during discussion; the researcher maps these.

### Reusable Assets
- `src/render/hud/draw.ts` gauge placeholders (FWD, AFT, CT, LT, E1..E4) and `drawFillGauge`; `model.bars` in `src/render/hud/hud.ts`
- `ShipControl` — fire is a command shared by player and NPC (pitfall 19)
- Existing message-line throttle, the F3 equipment browser, the save v3 chain, the build-time octree compiler (Phase 10)

### Established Patterns
- Simulation under `src/sim/` is pure and deterministic; damage events are queued, never synchronous (pitfall 7)
- Compiled content sits behind a strict schema, golden and drift gate; never hand-edit generated data

### Integration Points
- Save v3 to v4 bump (laser mounts), HUD layout, key bindings and the browser specs that pressed Escape or R

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond Oolite fidelity and the scope minimum.

</specifics>

<deferred>
## Deferred Ideas

- Sun and atmosphere cabin heating: DEATH-03, DEATH-05 (unscheduled)
- Autonomous NPC fire: CBT-15 (unscheduled)

### Reviewed Todos (not folded)
- Terminal color palette switcher, cargo cost basis, planet/sun/buoy collision, buoys blocking hyperspace, Oolite-in-Docker measurement: keyword matches only, outside Phase 13 scope.

</deferred>

---

*Phase: 13-Views, Lasers and Shields*
*Context gathered: 2026-11-14*
