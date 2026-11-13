# Phase 8: Session Split and World Core - Pattern Map

**Mapped:** 2026-11-11
**Files analyzed:** 36 new/modified (grouped)
**Analogs found:** 31 / 36 (the rest are greenfield, see "No Analog Found")

All analog paths below were checked as git-tracked source (`git ls-files`). None is a gitignored mirror.
Note: only part of 08-RESEARCH.md (lines 1-282 of 634) was read; the sections on the pattern list from Pattern 8 onward (Code Examples, Pitfalls, Pattern 9/10) were taken from the summary and the section index, so the planner should consult RESEARCH.md Pattern 9 (AI seam) and Pattern 10 (manual clock) directly for details this map does not duplicate.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/sim/rng.ts` | utility | transform | `src/sim/math.ts:227-237` (`createSeededRandom`) | exact (same algorithm) |
| `src/sim/math.ts` (modify: delegate to rng.ts) | utility | transform | itself | n/a |
| `src/sim/events.ts` (modify: reserve audio types) | model | event-driven | itself (`SimEvent` union, lines 29-60) | exact |
| `src/sim/sim.ts` (`stepSim`) | service | request-response | `src/sim/flight/step.ts` (`stepFlight`), `src/sim/step.ts` | role-match |
| `src/sim/world/ids.ts` | config/constants | n/a | `src/sim/time.ts` (constants-only module) | role-match |
| `src/sim/world/entity.ts` | model | CRUD | `src/sim/flight/state.ts` (`FlightState` plain-data) | role-match |
| `src/sim/world/store.ts` | service | CRUD | none in repo; ARCH §5 | no analog |
| `src/sim/world/world.ts` (`createWorld`; consumes `worldSeedFor`/`forkSeed` from `src/sim/rng.ts`) | service | transform | `src/sim/rng.ts` `mix32` (plan 08-02, locked D-02); `src/sim/economy/market.ts:41-43` is the uint32 `marketSeed` input only, not the seed-mixing pattern (its string-FNV form is superseded for world seeds, see the rng.ts entry) | role-match |
| `src/sim/world/view.ts`, `control.ts` (types only) | model | request-response | `src/sim/world/layout.ts` (interfaces) | role-match |
| `src/sim/world/view-impl.ts`, `control-impl.ts` | service | request-response | `src/sim/world/layout.ts` (`Body`/`SystemLayout` consumption) | partial |
| `src/sim/world/serialize.ts` (`hashWorld`) | utility | transform | `src/sim/flight/state.ts:147-181` (`serializeFlight`/`hashFlight`) | exact |
| `src/sim/world/snapshot.ts`, `sanitize.ts` | utility | transform | `src/sim/hash.ts` + boundary parse in `src/persistence` | partial |
| `src/sim/world/step.ts` (`stepWorld`) | service | batch | `src/sim/flight/step.ts` | role-match |
| `src/sim/ai/types.ts`, `time.ts`, `registry.ts`, `pilots/test-pilot.ts` | service | event-driven | none (new zone); controller pattern in `src/sim/flight/` | no analog |
| `eslint.config.js` (modify: bans + AI zone) | config | n/a | itself, lines 71-160 | exact |
| `tests/guards/*` (new ban + AI zone probes) | test | request-response | `tests/guards/sim-purity.test.ts` + `eslint-gate.ts` | exact |
| `tests/sim/world/*.test.ts`, `tests/sim/ai/*.test.ts` | test | CRUD/transform | `tests/sim/flight-cadence.test.ts`, `tests/helpers/lave.ts` | role-match |
| `tests/helpers/session-source.ts` | utility | file-I/O | `tests/guards/economy-purity.test.ts` source reads | role-match |
| `tests/app/redraw-gate.test.ts`, `tests/guards/economy-purity.test.ts` (modify) | test | file-I/O | themselves | exact |
| `tests/e2e/probe-shape.spec.ts`, `tests/e2e/tick-hook.spec.ts` | test | request-response | `tests/e2e/scene.spec.ts` | role-match |
| `src/app/session/*.ts` (context, probe-publisher, render-driver, chart/settings/station/save/hyperspace controllers, event-router, sim-driver, frame-loop, start-session, test-flags) | service | event-driven | `src/app/game-session.ts` (the source being extracted) | exact (extraction) |
| `src/app/game-session.ts` (shrink to facade) | controller | event-driven | itself | n/a |
| `src/app/probe.ts` (modify post-split: `sim` fields, `advanceTicks`, `worldHash`) | provider | request-response | itself, `createTestHook` at line 390 | exact |

## Pattern Assignments

### `src/sim/rng.ts` (utility, transform)

**Analog:** `src/sim/math.ts:227-237` (mulberry32 closure). The new `rngNext(state)` must be bit-identical so `arrival.ts` goldens do not move (RESEARCH Pattern 6; leave `arrival.ts:73` untouched, it calls `createSeededRandom(seed)`).

**Algorithm to copy:**
```typescript
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
```
**Seed mixing (superseded guidance, revised 2026-11-12):** an earlier draft of this map pointed `worldSeedFor` and `forkSeed` at the string-FNV style of `marketSeedForSystem` (`src/sim/economy/market.ts:41-43`). That guidance is superseded: locked decision D-02 fixes `worldSeed = mix32(marketSeed, epoch)`, and plan 08-02 (option-a, the default the owner confirms at its Task 2 checkpoint) implements it in `src/sim/rng.ts` with integer arithmetic only: `fmix32` (the MurmurHash3 finaliser), `mix32(a, b) = fmix32((a >>> 0) ^ fmix32((b + 0x9e3779b9) >>> 0))`, `worldSeedFor(marketSeed, epoch) = mix32(marketSeed, epoch)` and `forkSeed(worldSeed, entityId, purpose) = mix32(mix32(worldSeed, entityId), RNG_PURPOSE_CODES[purpose])` with fixed purpose codes world 1, ai 2, combat 3 (D-04). `marketSeedForSystem` stays the producer of the uint32 `marketSeed` input; a string-FNV world seed would need a revision of the settled D-02 through /gsd-discuss-phase 8; plan 08-02's checkpoint does not offer it (revised at plan-checker iteration 1, 2026-11-12). Pin the `createSeededRandom` vectors from the unmodified closure, and pin `fmix32`, `mix32`, `worldSeedFor` and `forkSeed` with literal vectors (plan 08-02 Task 3).

### `src/sim/world/serialize.ts` (utility, transform) — `hashWorld`

**Analog:** `src/sim/flight/state.ts:147-181`; hashing primitives `src/sim/hash.ts:14-35`.

**Core pattern:**
```typescript
export function serializeFlight(state: FlightState): string {
  return [
    `mode=${state.mode}`,
    `tick=${canon(state.tick, 0)}`,
    ...
    `repairCount=${canon(state.repairCount, 0)}`,
  ].join("\n");
}
export function hashFlight(state: FlightState): string {
  return fnv1a32(serializeFlight(state));
}
```
Compose per D-08: `fnv1a32(serializeFlight(player) + section)`, where `section === ""` while `world.nextId === FIRST_DYNAMIC_ID`; else `"\n" + lines.join("\n")`. Labelled lines, every number via `canon(n, digits)` (it throws on non-finite and normalises `-0`), never `JSON.stringify`, never `Object.keys` order.

### `src/sim/events.ts` (modify)

**Analog:** itself, `SimEvent` union lines 29-60. Add the reserved audio/presentation kinds as more `| { kind: "..." }` members; no UI copy (file header, lines 5-9). Imports use `.js` suffix and `import type`.

### `src/sim/world/ids.ts`, `world.ts`, `view.ts`, `control.ts`

**Analog for types:** `src/sim/world/layout.ts:30-52` (readonly interfaces, `Body {position, radius}`; `SystemLayout` has `planet, sun, station, navBuoy, witchpoint`). `WorldView.body(id)` maps 1 planet, 2 sun, 3 station, 4 witchpoint, 5 navBuoy. Imports from `../math.js` with `.js` suffix; SPDX/Copyright header on every file:
```typescript
// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors
```
`view.ts`/`control.ts` must be type-only and free of imports of sim internals, so they are the only world files the AI zone may import (`ids.ts` too, import-free).

### `src/sim/world/store.ts` (no analog)
Use ARCH §5 and RESEARCH Pattern 4: dense ascending array, `Map` for lookup only, `kill` then `commit`, snapshot-length iteration, `MAX_ENTITIES = 256`, never-reused monotonic id from 101.

### `src/sim/world/step.ts`, `src/sim/sim.ts`
**Analog:** `src/sim/flight/step.ts` (stepFlight, returns events) and `src/sim/time.ts` (`DT`, `MAX_STEPS_PER_FRAME`, `MAX_FRAME_DELTA`). `stepSim` calls `stepFlight` first, then `stepWorld`; keep `stepFlight` unchanged.

### `eslint.config.js` (modify; core track owns it)

**Analog:** itself. The `src/sim/**/*.ts` block (lines 71-160) sets four rules whose later definitions REPLACE earlier ones for the same key (RESEARCH Pattern 8, verified), so the AI-zone block must restate what it needs. Excerpts to extend:
```javascript
"no-restricted-syntax": [
  "error",
  { selector: 'NewExpression[callee.name="Date"]', message: "No Date inside src/sim." },
],
"no-restricted-properties": [
  "error",
  { object: "Math", property: "random", message: "Use the seeded PRNG in sim/math." },
  { object: "Date", property: "now", message: "No wall clock inside src/sim." },
  ...
],
"no-restricted-globals": ["error", ...DOM_GLOBALS.map((name) => ({ name, message: "src/sim must not touch the DOM." }))],
```
Add `ForInStatement` and bare `.sort()`/`.toSorted()` selectors to the same `no-restricted-syntax` array (the experiment showed selectors on argument-less `sort` work), add `"Date"` to `no-restricted-globals` (covers `Date.UTC`, `Date()`), and add a `src/sim/ai/**` block with `no-restricted-imports` regex allow-list (type-only `world/view`, `world/control`, `world/ids`, `ai/*`, `math`).

### `tests/guards/` (new ban + AI zone probes)

**Analog:** `tests/guards/sim-purity.test.ts` and `tests/guards/eslint-gate.ts`. Pattern: generate a probe file under `src/sim/`, serialise via `withProbeLock`, lint through the shared ESLint Node API, assert the rule message, delete in `finally`.
```typescript
import { lintProbe } from "./eslint-gate.js";
import { withProbeLock } from "./probe-lock.js";
// withProbe(name, source, async (file) => { const run = await lintProbe(file); expect(run.output).toContain(...) })
```
Existing source scans in that file reject any sim import specifier containing `input` and any declared type name containing `Frame` (RESEARCH Pitfall 4): avoid both in new sim files.

### `tests/helpers/session-source.ts` (utility, file-I/O)

**Analog:** the text reads in `tests/guards/economy-purity.test.ts` (e.g. `switchCaseBody` lines 201-207, picks the first `case "docked":`). Helper concatenates `src/app/game-session.ts` + `src/app/session/**/*.ts` in a fixed comparator order. `tests/app/redraw-gate.test.ts:112-155` currently asserts an ordered two-element `renderFrame(` list with `toEqual`, plus exactly five `redrawGate.request();`; make that order-independent. Keep a single `case "docked":` across the concatenation. Must be green against the unmodified monolith.

### `src/app/session/*` (split track)

**Analog:** `src/app/game-session.ts` itself. Follow ARCH §4.1/§4.2 table. Anchors (RESEARCH Pattern 1): `handleEvent` 2294, `updateProbe` 2412, `frame` 2699-2864, `handleHyperspaceJumped` 2061-2158, `startSession` 2884, `performSwap` 3265, `dispose` 3303, public return 3348-3364, `bindTestHook` boot at ~1034-1048, re-bound after Load (1418, 3184-3186). Rules: `createGameSession` stays the only public export; live fields (`state`, `layout`, `config`) re-read on every step through a context, never captured; one `currentInput.frame()` per rendered frame; pre-launch `autosave()` before the launch filter; five `redrawGate.request()` calls and a single gated `renderFrame(alpha, shouldDraw())`.

### `src/app/probe.ts` (modify, post-split only)

**Analog:** itself. `WegoliteTestHook` at line 251, `createTestHook` at 390, `publishProbe` 367. Probe shape frozen until the single deliberate post-split commit (D-13) that adds `sim` fields and `advanceTicks`/`worldHash`; hook mutations taint the profile as existing hook methods do (`applyTestCredits`/`applyTestEquipment` pattern near game-session 1040-1050, each followed by `redrawGate.request()`).

### Frame/tick driving (`sim-driver`, `advanceTicks`, manual clock)

**Analog:** `src/app/game-loop.ts` (`createGameLoop().advance(delta, commands, step)`, lines 17-40; constants from `src/sim/time.ts`) and the replay loop `src/sim/loop.ts` (`runToSteps`, `clampFrameDelta`, stops on step count not time). Manual clock: skip `advance`, call the step callback exactly n times synchronously.

### `tests/e2e/probe-shape.spec.ts`, `tick-hook.spec.ts`

**Analog:** `tests/e2e/scene.spec.ts` (read `window.__wegolite`, wait on `probe.frames` increments, not wall time). Add the probe-shape spec to the `test:e2e:fast` script in `package.json` (RESEARCH Pattern 3).

### `tests/sim/world/*`, `tests/sim/ai/*`

**Analog:** `tests/sim/flight-cadence.test.ts` for tick-based determinism; `tests/helpers/lave.ts` (`laveFixture`, reads committed generated JSON via `readFileSync`, derives layout through real modules) for any `SystemLayout`. fast-check is available for store invariants.

## Shared Patterns

### File header and import style
**Apply to:** every new `.ts` file. SPDX + Copyright header (above), relative imports with `.js` suffix, `import type` for types.

### Purity zone
**Source:** `eslint.config.js:71-160`. **Apply to:** all `src/sim/**`: no DOM globals, no `Math.random`/`Date`/`performance`, no imports of `three`, `render`, `ui`, `input`, `app`, `persistence`, content loaders.

### Canonical numbers
**Source:** `src/sim/hash.ts:29-35` (`canon`). **Apply to:** every hashed or serialised number; run a `sanitizeEntity` pass before hashing since `canon` throws on NaN.

### Fixed-order iteration
**Apply to:** store, hash, snapshot: ascending id; closed `const` arrays for purposes; comparator-sorted keys; no `for..in`, no bare `.sort()`.

### Golden policy
**Apply to:** all plans: no regeneration of existing goldens; new pins are additive files (e.g. `tests/golden/world/flight-v1-hashes.json`, RNG vectors).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/sim/world/store.ts` | service | CRUD | No entity store exists; use ARCH §5 and RESEARCH Pattern 4 |
| `src/sim/world/snapshot.ts`, `sanitize.ts` | utility | transform | No world snapshot exists; boundary-validation style from principle-boundary-discipline |
| `src/sim/ai/**` (`registry`, `types`, `time`, `pilots/test-pilot.ts`) | service | event-driven | No AI code or import zone exists; ARCH §7.2-7.3 |
| `src/sim/world/view-impl.ts`, `control-impl.ts` | service | request-response | No multi-entity view exists; synthesise ids 1-5 from `SystemLayout`, 100 from `FlightState` |
| `src/app/session/test-flags.ts` | utility | request-response | Only precedent is the inline `new URLSearchParams(window.location.search).get("test") === "1"` in game-session (~1034); extract to a pure parser, read once |

## Metadata

**Analog search scope:** `src/sim`, `src/app`, `eslint.config.js`, `tests/guards`, `tests/helpers`, `tests/sim`, `tests/app`
**Files scanned:** about 25 read or grepped
**Pattern extraction date:** 2026-11-11
