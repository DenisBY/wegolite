# Phase 11: Minimal Save Schema v3 - Context

**Gathered:** 2026-11-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Save schema v3 adds only the world epoch and the next entity id (the "world counters", see D-01) of the save's leg anchor. v1 and v2 saves migrate in order v1 → v2 → v3. A v3 save opened by an older build stays an inert future-version save. Cold Continue and warm Load pass the persisted epoch to `resetForRestore(save.epoch)`. No entity is saved, and no combat, law or cargo cost-basis field is added (Key Decision 2026-11-13). Regenerating the inert world is Phase 12 (SAVE-08 completes there).

</domain>

<decisions>
## Implementation Decisions

### World counters
- **D-01:** v3 adds exactly two fields: `epoch` and `nextEntityId`. "World counters" means the issuing world's own `nextId` at the leg anchor, which is 101 today and larger once Phase 12's populator spawns. No extra jump or arrival counter, no speculative field. It serves as a check that regeneration rebuilt the same world, and it names no entity (per-world id scope, plan 08-05 row). — **Reversibility:** one-way — a field added later costs another ordered schema bump and migration.

### Migration
- **D-02:** A v1 or v2 save migrates to `epoch = 0` and `nextEntityId = 101` (`FIRST_DYNAMIC_ID`). This equals today's `resetForRestore(0)` behaviour, so an old save loads into the same world as before. — **Reversibility:** one-way — the migrated value is written into the next autosave.
- **D-03:** In v3 both fields are required (not optional), so the writer cannot forget them. The chain stays ordered v1 → v2 → v3 with no skipping, and each step has a golden blob.

### Leg-anchor semantics
- **D-04:** The schema bounds `epoch` to 0..0xfffffffe. A blob with any other value (including saturated 0xffffffff) is corrupt: it goes to `autosave.corrupt` and is never read back, as today. There is no new UI branch. `resetForRestore` returning false therefore cannot be reached from a valid save, and the restore path may still treat it as a defect.
- **D-05:** The docked save writes the epoch of the last world; the next launch bumps it, as the session would have. The in-flight save writes the epoch of the world at the leg anchor, and it resumes there, never mid-leg. `nextEntityId` is the anchor world's counter.
- **D-06:** Cold Continue and warm Load both call `resetForRestore(save.epoch)`, replacing `resetForRestore(0)` (`src/app/session/world-lifecycle.ts`, `src/app/session/start-session.ts`, `src/app/session/save-controller.ts`). The two must give identical epoch and world seed.

### Gate and size
- **D-07:** A Vitest test in `tests/persistence` pins `worldSeedFor(marketSeedForSystem("g0-s7"), 1) = 0x2b4e037c` (Lave market seed 3545325333) before the first v3 write and checks that a v3 round trip yields the same world seed. No browser spec.
- **D-08:** A worst-case v3 blob, with every field at its bound (epoch 0xfffffffe, 64 equipment, 17 cargo, 17 market goods, 7 berths and the rest), is built in a test and encodes under `MAX_SAVE_CHARS` = 65,536.
- **D-09:** Gate choice per AGENTS.md: the change is in `src/persistence/` and `src/app/session/`; a phase of pure save logic needs `test`, `lint`, `typecheck`. Session wiring touches `src/app/`, so the planner decides whether `verify` is warranted (owner prefers skipping heavy gates for pure-logic plans on this slow machine).

### Claude's Discretion
- Field naming inside the schema, golden blob layout and test file split follow the existing `save-v2` / `save-golden` pattern.
- Whether `SAVE_VERSION` literal handling needs a `SaveV3Schema` alongside `SaveV2Schema` or a rename, following how v1 → v2 was done.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and decisions
- `.planning/ROADMAP.md` — Phase 11 goal, success criteria 1-4, "Decisions to settle"
- `.planning/REQUIREMENTS.md` — SAVE-07 (this phase), SAVE-08 stage 1, SAVE-09 and SAVE-10 deferred
- `.planning/PROJECT.md` Key Decisions — "Derive the world seed as mix32(marketSeed, epoch)" (D-02, the one-way derivation and the cross-check vector); "World lifecycle and epoch bump points" (plan 08-15); "Entity id uniqueness is per world" (plan 08-05); "Make save schema v3 minimal" (2026-11-13); "Narrow v2.0 to Phase 8 alone"
- `.planning/phases/10-ship-mass/` and `.planning/milestones/v2.0-phases/08-session-split-and-world-core/` — prior context

### Code
- `src/persistence/save.ts` — `SAVE_VERSION`, `SaveV1Schema`, `SaveV2Schema`, `MAX_SAVE_CHARS`, the ordered migration, the shared validator
- `src/persistence/autosave.ts`, `src/persistence/idb-store.ts`, `src/persistence/memory-store.ts` — future-version handling, `autosave.corrupt`
- `src/app/session/world-lifecycle.ts` — `resetForRestore(epoch)`, `begin`, `resume`, `MAX_EPOCH`
- `src/app/session/save-controller.ts`, `src/app/session/start-session.ts` — `snapshotForSave`, restore at cold Continue and warm Load
- `src/sim/rng.ts` — `worldSeedFor`, `mix32`; `src/sim/world/store.ts` — `nextId`, `FIRST_DYNAMIC_ID`
- `tests/persistence/save-v2.test.ts`, `save-golden.test.ts`, `save.test.ts`, `autosave.test.ts`, `tests/sim/rng.test.ts` — existing patterns and vectors

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Ordered v1 → v2 migration chain, strict schema, shared validator and golden blobs already exist (research flag: Low).
- `resetForRestore(epoch)` already accepts 0..0xfffffffe and was written for Phase 11 to pass `save.epoch`.

### Established Patterns
- Version is a literal, sniffed before the schema runs, so a future-version blob is recognised before any destructive step.
- `MAX_SAVE_CHARS` is checked before `JSON.parse`.

### Integration Points
- `snapshotForSave` / `SaveInputs` must carry the lifecycle epoch and the world `nextId`; the world is not saved (the "Do not save NPCs" row).
- Cold boot Continue and warm in-session Load both re-anchor the lifecycle.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

- Combat and law fields (SAVE-09) and cargo cost-basis (todo `2026-11-11-cargo-purchase-cost-basis-tracking.md`): each in its own later ordered bump.
- Full-traffic world regeneration at the anchor (SAVE-10) and the regenerated inert world (SAVE-08 completion): Phase 12.

### Reviewed Todos (not folded)
- `2026-11-11-cargo-purchase-cost-basis-tracking.md` — its own later bump (Key Decision 2026-11-13).

</deferred>

---

*Phase: 11-Minimal Save Schema v3*
*Context gathered: 2026-11-14*
