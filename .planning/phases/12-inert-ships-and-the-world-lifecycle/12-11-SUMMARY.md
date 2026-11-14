---
phase: 12-inert-ships-and-the-world-lifecycle
plan: 11
subsystem: render
tags: [npc-ships, instanced-mesh, lazy-model-loading, data-13, draw-calls, id-scope]
requires:
  - phase: 12-inert-ships-and-the-world-lifecycle
    provides: "plan 12-08 ctx.core.npcTraffic and the populated world; plan 12-10 npcContacts(world), the id-free contact snapshots the render driver already reads each frame"
provides:
  - "src/render/bodies/npc-ships.ts: NpcLayer, createNpcLayer, NPC_INSTANCE_CAPACITY (256): one InstancedMesh per (model, primitive) sharing the cached geometry and material, camera-relative, frustumCulled false, DynamicDrawUsage"
  - "SystemScene.npcs: the layer is built by createSystemScene (injectable factory npcs), its root is added to the scene and its dispose is registered, so a jump clears it"
  - "src/app/npc-models.ts: NpcModelLoader, createNpcModelLoader: per-key loading/loaded/failed states, closed to requests until open(), no retry, no console output"
  - "RenderDriverDeps.npcModels: the driver requests the frame's contact keys every frame, updates the layer before rendering, and calls the latch right after rendering a frame whose state is inFlight"
  - "three Key Decisions rows and the changelog line"
affects: [12-12, 12-14]
status: complete
actuals:
  tokens: 17500
  tasks: 2
  commits: 2
plan_head_before: 9c0a765c55427d06522f150064f9083b8575ee6d
plan_head_after: 1fa5869eb80242ceeb8ec09a3509f9c3a7683ef1
tech-stack:
  added: []
  patterns:
    - "instance by model: one InstancedMesh per primitive over the asset cache's shared geometry and material, never cloned, only the instance buffers disposed"
    - "a one-way latch on a per-session loader (open()) with a single opener, pinned by an rg -l acceptance check"
    - "the render layer declares its own capacity constant and a test pins it equal to the sim's MAX_ENTITIES, so no render file imports the id module"
key-files:
  created:
    - src/render/bodies/npc-ships.ts
    - src/app/npc-models.ts
    - tests/render/npc-ships.test.ts
    - tests/app/npc-models.test.ts
  modified:
    - src/render/system-scene.ts
    - src/app/session/render-driver.ts
    - src/app/game-session.ts
    - tests/app/dispose.test.ts
    - tests/app/session/render-driver.test.ts
    - .planning/PROJECT.md
    - CHANGELOG.md
key-decisions:
  - "No entity id holder outside the world in Phase 12: contacts are id-free per-frame snapshots, the NPC layer is index-addressed and scene-owned, the loader is keyed by ship key."
  - "Request NPC models when a ship first appears (Open Question 5): per key, draw only loaded keys, a failed key is never retried, the scanner still shows the ship."
  - "Defer NPC model requests until the first in-flight frame (DATA-13 kept; owner decision 2026-11-14, option A); option B (raising the ceiling) only on measured evidence."
requirements-completed: []
coverage:
  - id: D1
    description: "With traffic on, loaded NPC models are drawn through one InstancedMesh per (model, primitive) that shares the cached geometry and material, camera-relative, with a fixed capacity of 256 and only the instance buffers disposed"
    requirement: "WORLD-15"
    verification:
      - kind: unit
        ref: "tests/render/npc-ships.test.ts"
        status: pass
      - kind: unit
        ref: "tests/app/dispose.test.ts#owns the NPC layer: exposes it, adds its root and disposes it, also when half built (WORLD-15)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The loader is closed until open(), does not remember a closed request, fetches a key once, marks a failure without retry or console output, and drops a late resolution after dispose"
    requirement: "WORLD-15"
    verification:
      - kind: unit
        ref: "tests/app/npc-models.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "No NPC model is requested in a docked or launching frame or during the first in-flight frame: the driver renders, then opens, and the first fetch happens in the next frame; a frame the redraw gate skipped never opens the loader"
    requirement: "WORLD-15"
    verification:
      - kind: unit
        ref: "tests/app/session/render-driver.test.ts#renderFrame NPC models (WORLD-15, DATA-13)"
        status: pass
      - kind: e2e
        ref: "tests/e2e/budget.spec.ts (unchanged, traffic off) and tests/e2e/npc-assets.spec.ts (unchanged)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The populated browser scene stays within the 50 draw-call budget, the traffic-on cold start stays under the 9,437,184-byte ceiling, and the models appear on screen: not asserted here; plan 12-12's opt-in tests/e2e/traffic.spec.ts measures them and verify-full (plan 12-14) runs it"
    requirement: "WORLD-15"
    verification: []
    human_judgment: true
    rationale: "Needs a real WebGL context and a populated browser session; the Node rows prove the structure (at most 13 calls by construction) but not the measured count or the picture"
---

# Phase 12 Plan 11: The inert ships drawn Summary

The inert ships are now drawn with their Oolite models through one scene-owned `InstancedMesh` per (model, primitive) over the asset cache's shared geometry and material, and every NPC model request waits until the render driver has drawn the first in-flight frame, so DATA-13 and ROADMAP Phase 9 criterion 3 hold unchanged. WORLD-15's drawing half is delivered; the requirement is not marked complete because plan 12-12 (browser proof) and later plans follow.

## Accomplishments

- **Tracer (Task 1).** `createNpcLayer()` builds, the first time a key has a loaded model in the contact list, one `InstancedMesh(geometry, material, 256)` per Mesh of `gltf.scene` (traversal order), keeping each primitive's matrix relative to the model root. Each update groups contacts by key in input order, composes `translation(contact - camera) x rotation(orientation) x primitiveLocal` in reusable scratch matrices (the float64 subtraction happens before the float32 write), sets `count`, `visible` and `needsUpdate`, and drops contacts past `NPC_INSTANCE_CAPACITY`. `frustumCulled` is false so a present type always costs its calls (at most 13 across the nine types). `dispose()` frees only the InstancedMeshes; spies prove the shared geometry and material are never disposed. `createSystemScene` gets an injectable `npcs` factory, adds the layer root to the scene and registers its dispose, including on the half-built path.
- **Loader and driver.** `createNpcModelLoader(assets, glbFor)` keeps per-key `loading`, `loaded` and `failed` states behind a closed-until-`open()` latch. The render driver now computes `npcContacts(...)` once per frame (moved out of the HUD branch), calls `npcModels.request(keys)` and `currentScene.npcs.update(contacts, cameraWorld, npcModels.loaded())` before rendering, and, inside `if (draw)` right after `renderer.render` and `redrawGate.drawn`, calls `npcModels.open()` when `currentState.mode === "inFlight"`. `createGameSession` builds one loader per session over `assets` and the catalogue of `ctx.core.npcTraffic` (read at call time) and never opens it.
- **Records (Task 2).** Three Key Decisions rows (id holder, request on first appearance, deferral as the owner's decision of 2026-11-14, option A, with option B left to measured evidence), a pointer sentence in the entity-id-uniqueness row, and a CHANGELOG line saying the ships are drawn with their Oolite models, downloaded only when a system needs them and only once the ship is in flight.

### The deferral as implemented

The only `open()` call site is `src/app/session/render-driver.ts` line 197 (`rg -l '\.open\(\)' src` prints that one path). In `renderFrame(alpha, draw)` the order is: `npcModels.request(...)` (a no-op while closed), `npcs.update`, then, with `draw` true, `renderer.render`, `redrawGate.drawn`, and only then `npcModels.open()` if the state is `inFlight`; the same call ends with `updateProbe()`, which publishes `probe.mode = "inFlight"`. The first fetch therefore starts in the next `renderFrame` call, normally the next animation frame. A skipped (`draw` false) frame never opens the loader. The loader is disposed with the asset cache on every teardown path.

## Task Commits

| Task | Name | Commit |
| --- | --- | --- |
| 1 | draw the inert ships through scene-owned instanced meshes, loading models after the first in-flight frame (tracer) | bf86f94 |
| 2 | record the id-holder, model-loading and deferral decisions and the changelog entry | 1fa5869 |

Tracer gate: the automated-only `<verify>` (targeted Vitest, typecheck) passed after the commit's content was final, so expansion proceeded with no checkpoint.

## Gates run (all in Docker)

This plan's browser-facing gate is `verify` (fast). The render gate for the NPC draw path is the phase-end `verify-full` in plan 12-14 (owner's gate decision of 2026-11-13). The populated-scene 50-draw-call assertion and the traffic-on cold start (DATA-13) live in the opt-in `tests/e2e/traffic.spec.ts` (plan 12-12), which `verify-full` runs, not in `tests/e2e/budget.spec.ts`, which stays traffic off.

| Gate | Result |
| --- | --- |
| Targeted Vitest npc-ships, npc-models, dispose, render-driver, asset-cache-npc, entity-id-scope (local) | 6 files, 71 passed |
| Mutation check: `npcModels.open()` called without the `inFlight` condition | 2 render-driver rows failed as intended; reverted |
| `docker compose run --rm typecheck` (local) | exit 0 |
| `docker compose run --rm lint` (local, ESLint and Prettier) | exit 0 after two test-file lint fixes (an unnecessary assertion, an `async` without `await`) |
| `remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test tick-hook budget npc-assets"` on committed HEAD 1fa5869 | 9 passed, exit 0; `tests/e2e/budget.spec.ts` and `tests/e2e/npc-assets.spec.ts` byte-unchanged |
| `docker compose run --rm test` (full, local, with coverage) | exit 0: 152 files passed, no coverage error |
| `remote-run.sh run --rm verify` on committed HEAD 1fa5869 | exit 0 in 123 s: Vitest 152 files, 2,990 passed, 2 skipped; e2e smoke subset 27 passed. Not re-run locally; there was no disagreement to arbitrate |

Acceptance greps (Task 1): `InstancedMesh` in npc-ships.ts 4; `frustumCulled = false` 1; `cloneMaterials|.clone(` absent; `createNpcLayer(` in system-scene.ts 1; `loadNpcModel(` in npc-models.ts 1; `npcs.update(` in render-driver.ts 1; `npcModels.open()` 1; `open(): void` in npc-models.ts 1; `rg -l '.open()' src` prints only render-driver.ts; `EntityId|world/ids` absent from npc-ships.ts and npc-models.ts. Task 2: the three rows 1 each, `Oolite models` in CHANGELOG.md 1, `git diff --name-only 9c0a765 -- tests/e2e/budget.spec.ts tests/e2e/npc-assets.spec.ts` empty.

## Deviations from Plan

### Departures worth a reviewer's eye (no rule triggered)

- **Test-first order.** The behaviour rows for the layer and the loader were written to disk before the code, but the first run happened after the code existed, so no separate red run was recorded. The one load-bearing row (render, then open, then fetch in the next frame) was instead mutation-checked: removing the `inFlight` condition fails two rows.
- **Loader disposal path.** The plan says to dispose the loader in the session's dispose path. `pagehide` and context loss call the lifecycle's own `dispose`, not the facade's, so `createGameSession` passes the lifecycle a thin `assets` wrapper (`preload` delegating, `dispose` freeing the loader and then the cache). `start-session.ts` is unchanged and every teardown path reaches the loader.
- **The `open` method of the loader object** is written without a return-type annotation (the interface types it) so the plan's acceptance grep `open(): void` matches exactly once; likewise `npcs: () => createNpcLayer()` keeps `createNpcLayer(` greppable in system-scene.ts.
- **Test-double edits beyond the file list.** `tests/app/session/render-driver.test.ts` gained a harness option for the loader and an `npcs` double on `flyableScene`; `tests/app/dispose.test.ts` feeds the layer a cached synthetic model in `buildParts` and asserts the cache-owned counts stay zero.
- **Commits.** The plan's brief says "do not commit"; the dispatch required per-task commits. Nothing was pushed or tagged.

**Total deviations:** 0 rule-triggered. **Impact:** none.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-12-24 (GLB path only from the validated catalogue, `loadNpcModel` re-checks the pattern, unknown key ignored), T-12-25 (fixed capacity 256, extras dropped in order, no per-instance allocation), T-12-26 (spies: shared geometry and material never disposed), T-12-28 (failed key never retried, silent) and T-12-36 (closed until `open()`, one opener, order pinned by Vitest rows) are mitigated as stated. T-12-36's browser measurement is plan 12-12's.

## Next Phase Readiness

Plan 12-12 can measure the populated scene (at most 13 extra calls against the 50-call budget), the traffic-on cold start with no NPC request before the first in-flight frame, and the models appearing within a fixed frame window after it. `tests/e2e/budget.spec.ts` and `tests/e2e/npc-assets.spec.ts` must stay byte-unchanged for it as well.

## Self-Check: PASSED

Created files exist (src/render/bodies/npc-ships.ts, src/app/npc-models.ts, tests/render/npc-ships.test.ts, tests/app/npc-models.test.ts); commits bf86f94 and 1fa5869 are ancestors of HEAD.
