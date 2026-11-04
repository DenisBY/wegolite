# Phase 3: Flight in the Lave System — Pattern Map

**Mapped:** 2026-11-03
**Inputs:** `03-CONTEXT.md` (D-01..D-15), `03-RESEARCH.md`, `PROJECT.md`, `ROADMAP.md`, `STATE.md`, `AGENTS.md`
**Existing source examined:** 34 tracked files under `src/`, `tests/`, `tools/`, plus `index.html`, `package.json`, `compose.yaml`, and all TS/ESLint/Vitest/Playwright config
**Analogue coverage:** 57 mapping rows covering ~62 paths; 12 rows have no direct analogue (grouped in § No-Analogue Register), the rest copy an established pattern. 28 test rows mapped.

> **Read this first.** Phase 3 is a composition phase. Almost every "new" module is a *second instance* of a pattern that already exists in a thinner form. The repository currently has **no** `src/app/`, `src/input/`, `src/ui/`, `src/settings/`, `src/render/hud/`, no `GLTFLoader`, no `Canvas2D`, no `localStorage`, and no `dispose()` anywhere in `src/`. Those are the genuine gaps. Everything else — the fixed step, canonical hash, camera-relative transform, named errors, manifest schema, `?raw` content loader, probe contract, Docker verify chain — must be copied, not reinvented.

---

## Existing Conventions Snapshot

### Layering (enforced, non-negotiable)

```
content (build-time JSON + zod schemas)
   │ type-only door: src/content/types.ts
   ▼
sim (pure TS: no Three, no DOM, no clock, no randomness)
   │ read-only state / commands / events
   ▼
render (Three.js, camera-relative only)
input/ui/app (DOM + composition; may import sim + render)
```

- `src/sim/**/*.ts` is denied `three`, `three/*`, `three/addons/*`, `**/render/**`, `**/ui/**`, `**/input/**`, `**/app/**`, `**/persistence/**`, `**/content/index*`, `**/content/schemas/**`, `**/content/generated/**` (`eslint.config.js:71-100`).
- `src/sim/**` also runs under `tsconfig.sim.json` with `lib: ["ES2022"]`, `types: []`, so DOM identifiers fail `typecheck` (`tsconfig.sim.json:1-25`). `src/render/camera-relative.ts` is deliberately included in that project.
- The sim may import `src/content/types.ts` and nothing else from content. Proven positively and negatively by `tests/guards/content-boundary.test.ts:61-116`.
- **Recently discovered guard gap (Phase 3 should close it):** the deny list has no `**/settings/**` and no `**/content/ships*`. A new `src/content/ships.ts` runtime loader and `src/settings/**` would both be importable from `src/sim` today. Extend `eslint.config.js:82-95` with those two groups (or a single `**/content/*` group with an explicit `content/types` exception).

### Module and naming conventions

- Every `.ts`/`.js`/`.sh` file starts with:
  ```ts
  // SPDX-License-Identifier: GPL-2.0-or-later
  // Copyright (c) 2026 Wegolite contributors
  ```
  Enforced by `tests/compliance.test.ts:169-182`. A missing header fails `verify`.
- Relative imports always carry the `.js` extension, even from `.ts`: `import { step } from "./step.js";` (`src/sim/loop.ts:4`). Do this for every new module.
- **Named exports only.** No default exports anywhere in `src/`.
- Interfaces and types are `interface`/`type` with `readonly` fields for data records (`src/sim/math.ts:18-29`); mutable simulation state is a plain interface with non-readonly fields (`src/sim/state.ts:12-17`).
- Modules carry a block comment that explains *why* the module exists and cites the decision ID (`D-xx`), not just what it does. Example: `src/render/camera-relative.ts:4-13`, `src/content/systems.ts:4-21`, `src/sim/state.ts:38-42`.
- Pure geometry/math helpers live in `src/sim/math.ts`; they return new objects and never mutate inputs. Only `step()` mutates state.
- Factory functions return a named interface object rather than a tuple: `createPrecisionScene(): PrecisionScene` (`src/render/precision-scene.ts:80-115`).
- `const` module-level constants are uppercase with units in the name: `STARFIELD_RADIUS_M`, `NEAR_M`, `FAR_M` (`src/render/precision-scene.ts:8-14`), `DT`, `MAX_STEPS_PER_FRAME`, `MAX_FRAME_DELTA` (`src/sim/step.ts:8-14`).
- Data shapers use `vec()`/`quat()` constructors, never object literals with a `type` annotation, so property order and shape stay consistent (`src/sim/math.ts:31-37`).

### Error handling

- Runtime boundary failures are **thrown**, never warned/defaulted. Two established forms:
  1. Plain `Error` with a `Wegolite:` prefix and a cause, at the app boot boundary (`src/main.ts:54-72`, `86-101`).
  2. A named `Error` subclass for a contract boundary: `ContentBoundaryError` with `this.name` set (`src/content/index.ts:24-29`).
- The content compiler uses a structured `ContentError` with `code`, repository-relative `file`, `construct`, optional `line`/`column`, and a bounded 120-char excerpt (`tools/oolite-ingest/content-error.ts:77-118`). This is the model if Phase 3 wants a `FlightConfigError`/`LayoutError` with a stable code.
- Optional fields are assigned conditionally because `exactOptionalPropertyTypes` is on (`tools/oolite-ingest/content-error.ts:101-107`). Never set an optional property to `undefined`.
- Tests assert the *message contents*, not just `toThrow()`; the helper `messageOf(call)` is the established shape (`src/content/index.test.ts:37-45`).

### Determinism

- Fixed step is `DT = 1/120`, max 5 steps/frame, 0.25 s frame-delta clamp (`src/sim/step.ts:8-14`, `src/sim/loop.ts:42-57`).
- State is serialized as labelled canonical text with `canon(value, 6)` and hashed with `fnv1a32`; never `JSON.stringify` (`src/sim/state.ts:38-54`, `src/sim/hash.ts:13-35`).
- `Math.random`, `Date.now`, `performance.now`, and `new Date` are lint errors inside `src/sim` (`eslint.config.js:108-132`).
- Deterministic geometry uses the golden angle, not randomness: `GOLDEN_ANGLE_RAD = Math.PI * (3 - Math.sqrt(5))` (`src/render/precision-scene.ts:16-45`).
- ⚠️ The lint message for `Math.random` says "Use the seeded PRNG in sim/math", but **no seeded PRNG exists** in `src/sim/math.ts`. Phase 3's starfield/dust/planet seeds must either hash `random_seed` with `fnv1a32` (already available) or add the missing seeded PRNG to `math.ts`. Do not call `Math.random` in render either, because it breaks the e2e/probe repeatability contract.

### Raw units and the presentation boundary

- Generated content stores authored Oolite values. `SystemSchema` documents the rule explicitly: `radiusKm` is km (no ×10), `techLevelRaw` is the plist value (no +1), `station` keeps the role fragment (`src/content/schemas/system.ts:19-22`).
- Conversion happens **once**, at a named boundary:
  - `radiusKm * 10` → game units, inside `SystemLayout`.
  - `techLevelRaw + 1` → displayed tech level, inside HUD formatting.
  - `fuel / 10` → LY, `speed / 1000` → LS, inside HUD formatting.
  - Oolite `+Z` → Wegolite `−Z` by negating Z, at content/layout conversion.
- The renderer performs exactly one further conversion: world float64 → camera-relative float32, through `cameraRelative()` (`src/render/camera-relative.ts:28-34`). Nothing else may write `Object3D.position`.

### Test layout and tooling

- One Node-only Vitest project; includes `src/**/*.test.ts`, `tests/**/*.test.ts`, `tools/**/*.test.ts` (`vitest.config.ts:8-30`). Unit tests may be colocated (`src/render/camera-relative.test.ts`) or under `tests/<domain>/` (`tests/golden/`, `tests/guards/`, `tests/contract/`). **Use `.test.ts` for Vitest and `.spec.ts` only under `tests/e2e/` for Playwright** — that is what the two configs select.
- Playwright: `testDir: "./tests/e2e"`, Desktop Chrome 1280×720, `trace: "off"`, `screenshot: "off"` (D-08) (`playwright.config.ts:5-27`).
- E2E specs collect `console` errors and `pageerror`, assert `window.__wegolite?.ready === true` with a 20 s timeout, then assert probe values; console errors are asserted **last** (`tests/e2e/precision.spec.ts:6-43`).
- Golden fixtures are read with `readFileSync(new URL("./fixture.json", import.meta.url))` + `JSON.parse`, never a JSON module import (`tests/golden/kinematic-probe.test.ts:18-28`).
- Container commands are the only evidence: `docker compose run --rm test` (Vitest), `--rm e2e` (build + Playwright), `--rm verify` (lint → typecheck → assets:check → test → build → e2e), `--rm typecheck`, `--rm lint` (`compose.yaml:74-82`, `README.md` Commands table).

---

## File Mapping

Paths in the left column are the research's proposed layout (`03-RESEARCH.md` § Recommended Project Structure); the planner may rename but must keep the same layering. "Match" is encoded at the start of the Notes cell: **exact** / **role** / **partial** / **none**.

### Content access

| New/Changed Path | Purpose | Closest Analogue | Patterns to Copy | Notes/Divergence |
|---|---|---|---|---|
| `src/content/ships.ts` (new) | Lazy runtime loader for `generated/ships.json`; `loadShipCatalogue`, `findShip`, `playerShip`, `stationShip` | `src/content/systems.ts:25-117` | Lazy `import.meta.glob("./generated/ships.json", { query: "?raw", import: "default" })` (not eager), module-level promise cache, `JSON.parse` of the raw string, named error if the chunk is missing, `import type { ShipCatalogue }` from `./schemas/ship.js` | **role**. `systems.ts` uses eager g0 + lazy g1-7; ships has one 706 KB chunk, so use a single lazy entry and cache the promise. This is deliberately `?raw` + `JSON.parse` to avoid `tsc` inferring a 706 KB literal type and to keep it out of the main chunk (RESEARCH Pitfall 12). Never a static `import ships from "./generated/ships.json"`. |
| `src/content/types.ts` (changed) | Add `ShipDef`/`Subentity` to the sim-facing type door | `src/content/types.ts:19-24` | `export type { … } from "./schemas/ship.js";` — type-only, no runtime import | **exact**. The file already exports `CatalogEntry`/`ShipCatalogue` (line 23) but **not** `ShipDef`; add it. Do not add any `export const` here; the content-boundary guard proves the door stays type-only. |
| `src/sim/world/layout.ts` (new) | Derive `SystemLayout` (planet/sun/station/buoys, radii, aegis, station quat, roll) from a `System` | `src/sim/step.ts:35-58` (pure derive/integrate) + `src/content/index.ts:54-76` (named boundary error) | Pure function, no Three/DOM; `Vec3`/`Quat` from `math.ts`; `toWegolite(v) = vec(v[0], v[1], -v[2])`; raw `stationVector`/`sunVector` for positions, normalised only for directions; named error if `stationRoll` or the dock subentity is missing | **role**. No existing layout module. Follow the RESEARCH code sketch § 1 exactly for the Lave numbers. Keep the sim input numeric (`System` type only); do not import `content/systems`. |
| `src/sim/world/aegis.ts` (new) | Aegis status and compass-target rules | `src/sim/step.ts` (pure predicate style) | Pure functions over `Vec3` + layout; named string union return; no I/O | **partial**. No existing predicate module; keep it small and table-tested like `torus.ts`. |

### Simulation core (`src/sim`)

| New/Changed Path | Purpose | Closest Analogue | Patterns to Copy | Notes/Divergence |
|---|---|---|---|---|
| `src/sim/time.ts` (new) | Re-export/move `DT`, `MAX_STEPS_PER_FRAME`, `MAX_FRAME_DELTA` | `src/sim/step.ts:7-14` | Same named constants and comments; import from one place in both `loop.ts` and the new app loop | **exact**. Keep `src/sim/step.ts`'s Phase 1 exports working (re-export or leave them) so `tests/golden/kinematic-probe.test.ts` and `cadence.test.ts` do not change. |
| `src/sim/math.ts` (changed) | Add `sub/add/scale/lengthSquared/length/normalizeVec/quatFromUnitVectors/conjugate/rotateInverse/nlerp/slerp/clamp/moveToward/sign` + seeded PRNG | `src/sim/math.ts:18-81` | Same readonly `Vec3`/`Quat`, same pure-function style, same block-comment rationale; `quatFromUnitVectors` needs the antiparallel fallback (RESEARCH § 2) | **exact extension**. Do not overload `normalize` (already the quaternion normaliser at line 53) — name the vector version `normalizeVec`. Do not import Three. Add the seeded PRNG the ESLint message already promises. |
| `src/sim/flight/config.ts` (new) | `FlightConfig` + `deriveFlightConfig(shipDef)` from the Cobra player entry | `src/content/schemas/ship.ts:63-79` (typed inputs) + `src/sim/step.ts:16-24` (constants, as the anti-example) | Derive every number: `maxSpeed`, `thrustAccel = 5.0 * thrust`, `pitchAccel = 2 * maxPitch`, `rollAccel = 2 * maxRoll`, `damping = 1`, `launchSpeed = 0.5 * maxSpeed`; throw a named error for a missing required field | **role**. The existing `PROBE_*` constants are explicitly placeholders and "nothing here may be copied into the flight model" (`src/sim/step.ts:16-24`). The ship schema marks flight fields `.optional()`; assert presence for the player entry rather than defaulting to 0. |
| `src/sim/flight/state.ts` (new) | `FlightMode`, `FlightState`, `initFlightState`, `serializeFlight`, `hashFlight` | `src/sim/state.ts:8-54` (near-exact) | Plain data interface; `init*()` factory; labelled `serialize` with `canon(n, 6)`; `hash*` via `fnv1a32`; never `JSON.stringify` | **exact**. Duplicate the *shape* of `state.ts`, not its fields. Keep Phase 1 `SimState` untouched so its golden hash does not change. `paused` belongs to the app session, not this state (RESEARCH § Step 2). |
| `src/sim/flight/attitude.ts` (new) | `slew()` ramp/clamp/damp, no yaw, roll-then-pitch composition | `src/sim/step.ts:35-38` (quaternion composition) | `axisAngle`, `mul`, `normalize` from `math.ts`; `dt` as a parameter; no clock/randomness; pure except for the supplied state | **role**. Copy the composition order from `step.ts` (roll then pitch). Add the mandatory roll-sign unit test (RESEARCH § Step 2). |
| `src/sim/flight/speed.ts` (new) | Aristotelian scalar speed + position integration | `src/sim/step.ts:40-56` (near-exact) | `FORWARD = vec(0,0,-1)` module constant; `forward = rotate(orientation, FORWARD)`; `position += forward * speed * dt`; `clamp`/`moveToward` | **exact**. The probe's velocity-vector logic is replaced by a scalar; do not keep `SimState.velocity` semantics. Torus deceleration lives in `torus.ts`/`speed.ts` per RESEARCH § Step 2. |
| `src/sim/flight/torus.ts` (new) | `nearestSurfaceDistance`, `torusFactor`, `massLocked`, engage/disengage | `src/sim/step.ts` (pure step helper) + `src/sim/math.ts` | Pure functions with explicit constants `32`, `1024`, `25_600`; squared-distance comparisons; return structured booleans/reasons | **partial**. No predicate module exists; keep it dependency-free and table-test every boundary (25,600/25,601 etc.). |
| `src/sim/flight/launch.ts` (new) | Dock-mouth pose, +600 clock once, 2 s scripted exit, skip | `src/sim/state.ts` (state transitions) + `src/sim/step.ts` (pure step) | Mutate only the supplied `FlightState`; `dt` parameter; `launchCount` guard; no `Date`/`performance` | **role**. No mode machine exists yet. Illegal transitions are ignored, not thrown (RESEARCH § Step 3). |
| `src/sim/flight/controller.ts` (new) | `ControlIntent`, `ShipController`, `PlayerController`, `ScriptedLaunchController` | `src/sim/state.ts:19-27` (`InputFrame` type-only seam) | Plain readonly interfaces; controller `update(view, frame)` is pure; no `window`/DOM; no `if (isPlayer)` in the step | **partial**. There is no strategy-interface precedent; the *type-only* style of `InputFrame` is the thing to copy. |
| `src/sim/flight/step.ts` (new) | `stepFlight(state, layout, config, intent, commands, dt)` | `src/sim/step.ts:35-58` (**exact structural analogue**) | One exported `step(state, …, dt)`; doc comment states "pure with respect to everything except the state it is handed"; `dt` is a parameter; no clock/randomness; caller passes `DT` | **exact**. Keep the Phase 1 `step()` and its golden untouched. The new flight step is a sibling, not a mutation of the probe. |
| `src/sim/commands.ts` (new) | Tagged `Command` union | `src/sim/state.ts:19-27` (plain tagged data) | `type Command = { kind: "launch" } \| …`; no classes; no methods | **partial**. No tagged-union precedent exists; keep it data-only so sim can apply and UI can emit it. |
| `src/sim/events.ts` (new) | Tagged `SimEvent` union | Same as above | Same tagged-union style; no UI copy in the sim | **partial**. HUD strings are app-owned; events carry only kind + numeric payload. |

### App shell (`src/app`)

| New/Changed Path | Purpose | Closest Analogue | Patterns to Copy | Notes/Divergence |
|---|---|---|---|---|
| `src/main.ts` (rewritten) | Boot: manifest assert → renderer/WebGL2 fallback → app session → RAF | `src/main.ts:108-193` (current boot) | Keep `assertContentManifest` **before** renderer creation (`112-115`); keep `requireCanvas`/`requireElement` (`54-72`); keep `buildRenderer` DPR cap and log-depth settings (`74-106`); publish probe after first render (`178-193`) | **exact**. Evolve, do not restart. Preserve the `footer` text so `precision.spec.ts:38-40` and `compliance.test.ts:141-149` keep passing. Add the DOM fallback before the renderer is constructed (RESEARCH § Step 4). |
| `src/app/game-loop.ts` (new) | Real-time accumulator, interpolation alpha, snapshot poses | `src/sim/loop.ts:28-61` | Same accumulator logic: `+= min(delta, MAX_FRAME_DELTA)`, `while acc >= DT && n < MAX_STEPS_PER_FRAME`, drop backlog after 5, `alpha = acc/DT` | **role**. `loop.ts` is the *deterministic replay* harness; keep it unchanged. The app loop is the interactive sibling that samples devices and stores `prev`/`curr` poses. Do not change `loop.ts` semantics (its tests pin the exhaustion error). |
| `src/app/game-session.ts` (new) | Composition root wiring state/scenes/input/HUD/settings | `src/main.ts:108-193` (composition root) | One module that owns the singletons and wires layers; no business logic; named factories; explicit teardown | **partial**. `main.ts` currently does this inline; extract it rather than copying the whole file. |
| `src/app/mode.ts` (new) | `docked → launching → inFlight` transition table; paused is orthogonal | `src/sim/state.ts` (labels) | Exported string-union type; pure transition function; illegal transitions return the same state/ignore | **none**. No state-machine precedent. Keep `paused` out of the mode union (RESEARCH § Step 3). |
| `src/app/scene-manager.ts` (new) | `enterMenu` / `enterSystem` / `dispose`, swap + `renderLists.dispose()` | `src/render/precision-scene.ts:96-115` (factory ownership) | Factory modules return named objects; the manager owns the active scene and calls its `dispose()` | **role**. **No `dispose()` exists anywhere in `src/` today** — this is the single biggest new convention. Follow the RESEARCH § Pattern 3 disposal contract (AssetCache vs per-scene registry, never dispose cached GLBs). |
| `src/app/probe.ts` (new) | Additive `WegoliteProbe` fields + `?test=1` hooks | `src/main.ts:22-41` + `178-193` | Keep the `export interface WegoliteProbe` + `declare global { interface Window { __wegolite?: WegoliteProbe } }`; assign once after the first render; additive fields only | **exact**. Do not rename/remove `ready`, `calls`, `triangles`, `logDepth`, `depthBits`, `webgl2`, `renders`, `homeSystems`, `codeSplitGalaxies` — e2e specs assert them. The three Phase 1 precision-probe fields `nearRelZ`, `farRelZ`, `farUlp` are **retired** (03-01 task 2 step 4) together with their `precision.spec.ts` assertions; their numeric replacement is `world.maxRelativeMagnitude` from `src/render/sync.ts` plus the `f32Ulp` assertion at the real sun distance in `tests/sim/precision.test.ts` (03-04). Do not reintroduce them. |
| `src/app/hud-model.ts` (new) | `buildHudModel(state, layout, settings)` read-only view model | `src/sim/state.ts` (plain data) + `src/content/types.ts` (read-only view types) | Plain readonly interface; pure function; no canvas/DOM | **partial**. No view-model precedent; keep it Node-testable so HUD projection/format tests need no browser. |
| `src/app/launch-sequence.ts` (new) | 2 s scripted launch state machine and handover | `src/sim/cadence.test.ts` (scripted tick progression) | Explicit elapsed accumulator in the fixed step; no wall clock; deterministic seed from `launchCount` | **none** beyond that. Skip only after `launchSeen`; +600 exactly once. |
| `src/app/fallback` (inside `main.ts` or `src/app/fallback.ts`) | Replace canvas with accessible `<div role="alert">`, publish `ready:false, webgl2:false` | `src/main.ts:74-101` (WebGL2 detection) | Keep the existing `try/catch` + `instanceof WebGL2RenderingContext` check; set probe instead of throwing to a blank page | **role**. The current code throws into the console; Phase 3 must render a visible message and not start RAF. |

### Rendering (`src/render`)

| New/Changed Path | Purpose | Closest Analogue | Patterns to Copy | Notes/Divergence |
|---|---|---|---|---|
| `src/render/camera-relative.ts` (unchanged) | The one world→render transform | itself: `28-34` | `cameraRelative(world, camera)` float64 subtraction; add a camera argument at call sites only | **exact**. Do **not** add a second transform or a `placeAbsolute()` helper. |
| `src/render/sync.ts` (new) | Interpolate pose, derive camera world pose, place every body | `src/main.ts:45-52` (`place()`) | Camera stays at `(0,0,0)`; only quaternion changes; every body `position = cameraRelative(bodyWorld, cameraWorld)` | **exact pattern, new call site**. `place()` currently uses the fixed `CAMERA_WORLD`; replace with `placeRelative(obj, world, cameraWorld)` but keep `cameraRelative` pure. |
| `src/render/system-scene.ts` (new) | Build/sync/dispose one system | `src/render/precision-scene.ts:80-115` | `createSystemScene(): SystemScene` factory returning named `{ scene, camera, planet, sun, station, ship, … }`; named meshes (`obj.name = "planet"` like `starfield`/`far-marker`) | **role**. `precision-scene.ts` never disposes; add the disposal registry from RESEARCH § Pattern 3. |
| `src/render/menu-scene.ts` (new) | Starfield + slow Cobra for the title screen | `src/render/precision-scene.ts:96-115` | Same factory shape; reuse `createStarfield`; clone the cached Cobra | **role**. Do not duplicate the golden-angle star algorithm. |
| `src/render/asset-cache.ts` (new) | Load Cobra/Coriolis GLBs + textures once; owned disposal | No analogue — `models.spec.ts:16-24` documents that `GLTFLoader` is not used anywhere | Use `GLTFLoader` from `three/addons/loaders/GLTFLoader.js`; resolve URLs relative to `base: "./"` (`vite.config.ts:5`); cache `Promise<GLTF>`; expose `dispose()` | **none**. Follow the delivery contract already proven by `tests/e2e/models.spec.ts:102-149` (paths `./models/cobra3.glb`, `./models/coriolis.glb`, textures under `/textures/`). |
| `src/render/bodies/planet.ts` + `src/render/shaders/planet.glsl.ts` (new) | Sphere + one `ShaderMaterial` (surface/clouds/rim/terminator) | `src/render/precision-scene.ts:32-60` (deterministic geometry factory) | Named mesh, typed uniforms, deterministic seed; no `Math.random`; no world-space noise | **none for the shader**. The RESEARCH § 7 header is mandatory: `<common>`, `<logdepthbuf_pars_vertex>`, `<logdepthbuf_vertex>`, `<logdepthbuf_pars_fragment>`, `<logdepthbuf_fragment>`, `<tonemapping_fragment>`, `<colorspace_fragment>`. Add a source-string guard test modelled on `src/content/systems.test.ts:64-78`. |
| `src/render/bodies/sun.ts` (new) | Emissive sphere + additive `CanvasTexture` corona | `src/render/precision-scene.ts:71-78` (`MeshBasicMaterial` marker) | `SphereGeometry`, `MeshBasicMaterial({ toneMapped:false })`, `depthWrite:false` for corona, camera-facing plane | **role**. Use the real `corona_*` semantics from RESEARCH § Step 5 (flare = radius, hues = blend, shimmer = speed). |
| `src/render/bodies/starfield.ts` (new) | `sky_n_stars` point field, seeded, tinted | `src/render/precision-scene.ts:32-60` (**exact algorithm analogue**) | Golden-angle spiral in a `Float32Array`, `BufferGeometry` + `BufferAttribute`, `PointsMaterial({ size: 2, sizeAttenuation:false, depthWrite:false })`, `name = "starfield"` | **exact**. Either generalise `createStarfield(count, radius, tint)` or add a sibling that reuses the same loop. Do not use `Math.random`; do not create thousands of meshes. |
| `src/render/bodies/station.ts` (new) | Assemble the four Coriolis nodes; roll about local Z; z-fight control | `tests/e2e/models.spec.ts:134-143` (node/translation contract) + `precision-scene.ts` factory | Clone cached GLB; do **not** re-add the dock transform (`translation = [0,0,-500.2561]`); `polygonOffset` on hull; explicit `renderOrder` | **none in src** (no GLB code). The node contract is pinned in e2e; never assume `lookAt()` orients local `+Z`. |
| `src/render/bodies/ship.ts` (new) | Cobra clone; hidden in cockpit, shown in launch cinematic | `tests/e2e/models.spec.ts:145-149` (mesh/material shape) | `visible` toggle, never rebuild; `quaternion = state.orientation`; camera offset `(0, 7.25, -31)` | **none in src**. Copy the `name`/material expectations from the e2e contract. |
| `src/render/bodies/beacon.ts` (new) | Procedural nav buoy + witchpoint markers | `src/render/precision-scene.ts:71-78` | `OctahedronGeometry` + emissive `MeshBasicMaterial` + `Points` dot; named mesh | **partial**. No buoy GLB is vendored; procedural is required. |
| `src/render/bodies/dust.ts` (new) | Camera-local line/point motes, wrapped modulo a box | `precision-scene.ts:32-60` (typed-array geometry) | Preallocated `Float32Array`; `BufferAttribute`; no per-frame allocation; no `Math.random`; `depthWrite:false` | **none for motion**, role-match for buffer construction. Keep positions camera-local and wrap; never store absolute camera coordinates. |
| `src/render/launch-camera.ts` (new) | Cinematic pose for the 2 s exit | `src/main.ts:125-128` (camera construction) | `PerspectiveCamera(57.2, 1, 0.5, 2_500_000)` (Oolite's `fov-value` default, adopted by 03-01), camera at origin in steady state; explicit handover | **partial**. The cinematic moves a *world* pose that is then camera-relative; do not introduce a second camera-relative path. |
| `src/render/hud/hud.ts` (new) | Canvas2D overlay, DPR cap, 1920×1080 letterbox transform | `src/main.ts:103` (DPR cap) + `src/main.ts:147-157` (zero-size resize guard) | `dpr = Math.min(devicePixelRatio, 2)`; backing size = CSS × dpr; `scale = min(w/1920, h/1080)`; centred offsets; `ctx.setTransform`; guard 0 dimensions | **none for Canvas2D**. The DPR/resize *policy* is the analogue; there is no `<canvas id="hud">` or 2D context anywhere. |
| `src/render/hud/projection.ts` (new) | Pure scanner/compass math | `src/sim/math.ts` (pure math) + `src/render/camera-relative.ts` (pure, DOM-free render helper) | Pure functions over `Quat`/`Vec3`; no canvas; Node-testable; exact numeric tests | **partial**. `camera-relative.ts` is the precedent for a DOM-free render module; keep `projection.ts` free of `CanvasRenderingContext2D` so Vitest can import it. |
| `src/render/hud/draw.ts` (new) | Draw primitives in design units | No analogue | Take a `CanvasRenderingContext2D`, draw only; no state reads | **none**. Keep all arithmetic in `projection.ts`/`format.ts`, leaving `draw.ts` untestable-by-design and thin. |
| `src/render/hud/format.ts` (new) | Clock/speed/fuel/LS/LY strings | `src/sim/hash.ts:29-35` (`canon` formatting discipline) | Pure `format*` functions returning strings; no locale/`Intl`; fixed widths | **partial**. `canon` is the only pure formatter in the repo; copy its explicit-formatting discipline, not its code. |
| `src/render/hud/messages.ts` (new) | FIFO message queue with `flightTime` expiry | `src/sim/state.ts` (plain data + pure ops) | Small class/closure with explicit cap and expiry; time passed in, never read from a clock | **none**. Pause freezes expiry because time is a parameter. |
| `src/render/color.ts` (new, gap-closure 03-10) | The one sRGB transfer: `srgbToLinear`, `linearToSrgb`, `srgbByteToLinear`, `decodeColor3` | `src/render/camera-relative.ts:28-34` (**exact analogue**: pure, Three-free, DOM-free render helper imported directly by a Node test) | Named exports only, block comment citing the decision (`D-01`) and the Oolite source line for the contract, no Three import, unit-testable in Node with exact numeric pins | **exact pattern, new module**. Do **not** let a second transfer (`pow(x, 2.2)`, `THREE.ColorManagement`) appear anywhere; every decode goes through this file. |
| `src/render/planet-noise.ts` (new, gap-closure 03-11) | CPU mirror of the planet noise plus the quantile calibration and the measurement helpers | `src/render/camera-relative.ts` (pure, DOM-free, Node-testable render helper) + `src/render/precision-scene.ts:16-45` (deterministic golden-angle sampling, no `Math.random`) | Deterministic Fibonacci sampling instead of randomness; pure functions returning new objects; module comment states the mirror measures, never renders | **partial**. The noise functions are line-for-line mirrors of GLSL; only the *distribution* is guaranteed, so every test is a share/quantile tolerance, never a per-sample equality. |
| `src/render/exposure.ts` (new, gap-closure 03-12) | The one renderer-level exposure contract and its derived constants | `src/render/camera-relative.ts` (small typed render helper, one responsibility, Node-testable) + `src/render/precision-scene.ts:8-14` (uppercase, unit-suffixed module constants) | Uppercase constants with units in the name; pure derived functions (`displayedByteFor`, `clippingAlbedoByteFor`); one mutator (`applyOutputContract`) taking a structural type so a plain object satisfies it | **exact pattern, new module**. The renderer state write happens once; no caller may set `toneMapping` or `outputColorSpace` again. |
| `src/render/viewport.ts` (new, gap-closure 03-13) | The only writer of `camera.aspect`; guarded projection update | `src/render/camera-relative.ts:28-34` (**exact analogue**) + `src/main.ts:147-157` (zero-size guard policy) | Pure guard-then-write helper; Three **type-only** import so no `window`/DOM access; returns a boolean so callers cannot mistake a rejected write for an applied one | **exact pattern, new module**. Do not add constructor-time aspect writers; the manager and `resize()` both delegate here. |

### Input, settings, UI

| New/Changed Path | Purpose | Closest Analogue | Patterns to Copy | Notes/Divergence |
|---|---|---|---|---|
| `src/input/input-frame.ts` (**do not create**) | No device-frame type: `src/input/**` imports the sim-owned `InputFrame` | `src/sim/state.ts:19-27` (**exact type**) | Return/consume `InputFrame` from `src/sim/state.ts`; all axes dimensionless `[-1,1]`; no classes | **forbidden**. `InputFrame` is declared exactly once, in `src/sim/state.ts` (03-01 task 1 step 3). A duplicate frame type under `src/input/` fails `tests/guards/sim-purity.test.ts` (03-02) and the ESLint `**/input/**` deny keeps the sim from importing it. |
| `src/input/actions.ts` (new) | `ActionId` union, defaults, labels | `src/sim/state.ts` (string unions) | `type ActionId = "pitchForward" \| …`; `const DEFAULT_BINDINGS` as a frozen table; text labels in one place | **partial**. No action-map precedent. |
| `src/input/bindings.ts` (new) | Semantic map, conflict detection, reset | `src/content/systems.ts` (typed map, named errors) | Store `KeyboardEvent.code`; cap arrays at 4; reject duplicates with a message naming the other action; never throw on user input | **none** for the behaviour; role-match for the typed map. |
| `src/input/keyboard.ts` (new) | `KeyboardInputSource`, held set, edge commands, `clearAll()` | `src/main.ts:159-160` (the only listener precedent) | Named handler function; `window.addEventListener("keydown", handler)`; clear on `blur`/`visibilitychange`/pause/launch; use `AbortController` + `{ signal }` | **partial**. Only a `resize` listener exists today. Add `.js` imports, named functions, and an explicit `clearAll()`. |
| `src/settings/schema.ts` (new) | Versioned `SettingsV1` + validation/migration | `src/content/schemas/manifest.ts:22-40` + `src/content/index.ts:54-76` (**exact structural analogue**) | `z.strictObject` with literal `version`/key checks; reject unknown keys; `safeParse`; named error or defaults; never merge arbitrary JSON into a prototype — use `Object.create(null)` | **role**, different storage. Zod is already a dependency; do not add another validator. |
| `src/settings/store.ts` (new) | `localStorage` read/write, corrupt backup, injectable `Storage` | `src/content/systems.ts` (cache + named error) | Inject `storage: Storage = localStorage`; try/catch with best-effort `.corrupt` backup; return defaults at boot, never throw | **none** for persistence. Keep `src/sim` unable to import this module (see guard gap above). |
| `src/ui/title.ts`, `docked.ts`, `pause.ts`, `controls.ts`, `settings-panel.ts` (new) | DOM overlays, keyboard navigation, pause/resume, rebinding capture | `src/main.ts:54-72, 162-176` + `index.html` inline styles | Create/populate with `textContent` only (never `innerHTML`); named `requireElement`; keep the footer visible above overlays; keyboard-focus management | **partial**. The shell is currently static DOM in `index.html`; there is no DOM-building precedent beyond `textContent`. The pause overlay is new. |

### Build, config, markup

| New/Changed Path | Purpose | Closest Analogue | Patterns to Copy | Notes/Divergence |
|---|---|---|---|---|
| `index.html` (changed) | Add `<canvas id="hud">`, menu/docked/pause roots, fallback `<div role="alert">`, HUD CSS | `index.html:1-69` | Inline `<style>` with monospace green palette; absolutely positioned full-screen canvas; `pointer-events:none` for non-interactive layers; footer last and fixed | **exact style**. Keep the title free of `Elite`/`Oolite`; keep the footer wording intact (`tests/compliance.test.ts:141-166`). |
| `eslint.config.js` (changed) | Close the sim-import gaps for the new runtime loaders | `eslint.config.js:71-133` | Add two **dedicated** `no-restricted-imports` patterns before the broad group: `**/settings/**` → `src/sim must not import the settings layer`, `**/content/ships*` → `src/sim must not import the ship catalogue`; keep every rule `"error"` | **exact extension**. The messages are asserted verbatim by `tests/guards/content-boundary.test.ts` (03-02), so they are contract rather than copy. Without the rule, `src/sim/world/layout.ts` could import `content/ships` and bypass the type-only content door. |
| `package.json` / `compose.yaml` / configs (unchanged) | No new dependencies or services | `package.json`, `compose.yaml` | — | **none needed**. Phase 3 adds no npm packages (RESEARCH § Standard Stack). Do not add a `settings`/`hud` service. |

---

## Pattern Excerpts to Copy Verbatim

### A. File header and relative-import form

```ts
// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

import { axisAngle, mul, normalize, rotate, vec } from "./math.js";
import type { InputFrame, SimState } from "./state.js";
```

Source: `src/sim/step.ts:1-5`. Every new `.ts` file needs this header (compliance test) and the `.js` suffix (all existing imports).

### B. The pure fixed step (the model for `sim/flight/step.ts`)

```ts
export function step(state: SimState, input: InputFrame, dt: number): void {
  const roll = axisAngle(0, 0, 1, input.roll * PROBE_ROLL_RATE * dt);
  const pitch = axisAngle(1, 0, 0, input.pitch * PROBE_PITCH_RATE * dt);
  state.orientation = normalize(mul(mul(state.orientation, roll), pitch));
  const forward = rotate(state.orientation, FORWARD);
  state.position = vec(
    state.position.x + forward.x * speed * dt,
    /* … */,
  );
  state.tick += 1;
}
```

Source: `src/sim/step.ts:35-58`. Copy the contract: `dt` is a parameter, only the supplied state mutates, no clock/randomness/DOM/Three. Do **not** edit this probe function; create `src/sim/flight/step.ts` alongside it.

### C. Canonical state serialization and hash (the model for `flight/state.ts`)

```ts
export function serialize(state: SimState): string {
  return [
    `tick=${canon(state.tick, 0)}`,
    `p=${canon(state.position.x)},${canon(state.position.y)},${canon(state.position.z)}`,
    `q=${canon(state.orientation.w)},${canon(state.orientation.x)},${canon(state.orientation.y)},${canon(state.orientation.z)}`,
  ].join("\n");
}

export function hashState(state: SimState): string {
  return fnv1a32(serialize(state));
}
```

Source: `src/sim/state.ts:43-54`. Reuse `canon` and `fnv1a32`; do not write a second hash. Keep the Phase 1 fixture (`tests/golden/kinematic-probe.json`) untouched.

### D. The camera-relative placement contract

```ts
export function cameraRelative(world: Point3, camera: Point3): Point3Delta {
  return {
    x: world.x - camera.x,
    y: world.y - camera.y,
    z: world.z - camera.z,
  };
}
```

Source: `src/render/camera-relative.ts:28-34`.

```ts
/** Only the camera-relative subtraction is allowed to touch Object3D.position. */
function place(obj: THREE.Object3D, world: Point3): void {
  const relative = cameraRelative(world, CAMERA_WORLD);
  obj.position.set(relative.x, relative.y, relative.z);
}
```

Source: `src/main.ts:48-52`. Phase 3 replaces `CAMERA_WORLD` with the interpolated camera world pose, but the camera object stays at `(0,0,0)` and no other module writes `.position`.

### E. Lazy raw content loading (the model for `content/ships.ts`)

```ts
const lazyGalaxies = import.meta.glob(["./generated/systems/g1.json", /* … */], {
  query: "?raw",
  import: "default",
});

export async function loadGalaxy(galaxy: GalaxyIndex): Promise<SystemChunk> {
  const path = GALAXY_CHUNK_PATHS[galaxy];
  const load = lazyGalaxies[path];
  if (load === undefined) {
    throw new Error(`Wegolite: expected a dynamic chunk for galaxy ${String(galaxy)} at ${path}, but it is missing.`);
  }
  return parseChunk(await load(), galaxy);
}
```

Source: `src/content/systems.ts:61-72, 107-117`. For ships, use one lazy entry + a module-level `Promise<ShipCatalogue>` cache. Never a static JSON import (706 KB; RESEARCH Pitfall 12).

### F. Named boundary error

```ts
export class ContentBoundaryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ContentBoundaryError";
  }
}
```

Source: `src/content/index.ts:24-29`. Use the same shape for a `LayoutError` / `FlightConfigError`; set `this.name`, pass `{ cause }`, and put the failing field name in the message.

### G. Deterministic geometry (the model for starfield/dust/planet seeds)

```ts
const GOLDEN_ANGLE_RAD = Math.PI * (3 - Math.sqrt(5));

for (let i = 0; i < count; i += 1) {
  const y = 1 - (2 * (i + 0.5)) / count;
  const ring = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = i * GOLDEN_ANGLE_RAD;
  positions[i * 3] = Math.cos(theta) * ring * STARFIELD_RADIUS_M;
  /* … */
}
```

Source: `src/render/precision-scene.ts:16-45`. Reuse this for `sky_n_stars` (vary count/radius/tint) instead of `Math.random`. The `random_seed` string can be hashed to a 32-bit value with `fnv1a32` (import from `src/sim/hash.ts`; render may import sim, not vice versa).

### H. Probe contract

```ts
export interface WegoliteProbe {
  ready: boolean;
  calls: number;
  /* …existing fields… */
}

declare global {
  interface Window {
    __wegolite?: WegoliteProbe;
  }
}
```

Source: `src/main.ts:22-41`; published after the first render at `178-193`. Extend additively; never republish a second object.

### I. Scene factory ownership

```ts
export interface PrecisionScene {
  scene: THREE.Scene;
  nearBox: THREE.Mesh;
  farMarker: THREE.Mesh;
  starfield: THREE.Points;
}

export function createPrecisionScene(): PrecisionScene {
  const scene = new THREE.Scene();
  /* … */
  scene.add(nearBox, farMarker, starfield);
  return { scene, nearBox, farMarker, starfield };
}
```

Source: `src/render/precision-scene.ts:80-115`. Copy this "named factory returns its own resources" shape for `SystemScene`/`MenuScene`, then add a `dispose()` that tracks only those resources.

### J. Test shape — exact numeric pin + fixture reader

```ts
const fixture = JSON.parse(
  readFileSync(new URL("./kinematic-probe.json", import.meta.url), "utf8"),
) as Fixture;

expect(fixture.dt).toBe(DT);
expect(hashState(state)).toBe(fixture.expected.hash);
```

Source: `tests/golden/kinematic-probe.test.ts:26-47`. Pair this with `toBe` on exact derived numbers (`src/render/camera-relative.test.ts:24-28`) rather than `toBeCloseTo` wherever the arithmetic order is pinned.

---

## Test Mapping

All new Vitest files are `*.test.ts`; Playwright files are `*.spec.ts` under `tests/e2e/`. The Vitest `include` glob already covers `tests/**/*.test.ts`, so no config change is needed.

| Test file | Covers | Closest existing test | Conventions to copy |
|---|---|---|---|
| `tests/sim/layout.test.ts` | Exact Lave positions/distances, station quat, roll rate, dock offset | `tests/golden/kinematic-probe.test.ts:18-48` | `readFileSync` + `JSON.parse` the generated JSON (not a JSON import); `toBe`/`toBeCloseTo` on pinned numbers; assert `g0-s7` by id |
| `tests/content/player-ship.test.ts` | `oolite_template_cobra3-player` = 350/32/1/2/20/70; `coriolis-station` = roll 0.08, dock at `[0,0,500.2561]` | `src/content/systems.test.ts:27-41` | Load the committed artefact, assert named fields; named lookup helper that throws on absence |
| `tests/sim/flight-attitude.test.ts` | Ramp/clamp/damp, reversal zero-then-ramp, no yaw, roll sign | `src/sim/cadence.test.ts:12-34` + `src/render/camera-relative.test.ts:24-28` | Tick-indexed script; exact `toBe` on rates; one explicit sign-probe assertion |
| `tests/sim/flight-speed.test.ts` | 160 u/s², 350 cap, forward-only motion, turn changes direction | same | Scripted steps through the real `stepFlight`; assert position deltas per step |
| `tests/sim/torus.test.ts` | Factor at boundary distances, mass-lock predicates, buoy no-lock, input disengage, deceleration | `src/sim/cadence.test.ts` (table-driven) | Table of input → expected finite numbers; no wall clock |
| `tests/sim/launch.test.ts` | +600 exactly once, dock-mouth pose, 175 speed, 2 s handover, second launch ignored, skip gating | `src/sim/cadence.test.ts:26-34` | Run the real step until elapsed; assert `launchCount`/`clockSeconds` |
| `tests/sim/flight-cadence.test.ts` | Same hash at 30/60/120/144 Hz | `src/sim/cadence.test.ts:52-65` (**exact analogue**) | `Set(hashes).size === 1`; keep the 144 Hz counter-example documented; use a new `runFlightToSteps`, do not change `runToSteps` |
| `tests/sim/mode.test.ts` | Legal/illegal transitions; paused orthogonal | `src/sim/cadence.test.ts` (state assertions) | Pure transition function, no DOM |
| `tests/sim/controller.test.ts` | `PlayerController` mapping; `ScriptedLaunchController` zeros | `src/sim/state.ts` type-seam | Pure functions; assert intents, not device state |
| `tests/render/planet-shader.test.ts` | All log-depth chunks + `colorspace_fragment` present | `src/content/systems.test.ts:64-78` (**source-string regex analogue**) | `readFileSync` the shader source; assert each required chunk; add a vacuity length guard |
| `tests/render/starfield.test.ts` | Count = `sky_n_stars`, unit-length × shell radius, same seed ⇒ same positions | `src/render/camera-relative.test.ts:13-40` | Pure math assertions; deterministic repeat build; no screenshot |
| `tests/render/station.test.ts` | Node names, dock translation, half-extent | `tools/oolite-ingest/convert/glb.test.ts:789-808` + `tests/e2e/models.spec.ts:134-143` | Read the GLB JSON chunk in Node; assert names/translation exactly |
| `tests/render/dust.test.ts` | Wrap keeps coordinates inside ±box/2; camera delta shifts correctly; no `Math.random` | `src/render/camera-relative.test.ts` | Pure numeric assertions; assert finite values |
| `tests/hud/projection.test.ts` | Dead-ahead base at bottom-centre, tail up, behind above centre, rim clamp, planets excluded | `src/render/camera-relative.test.ts:13-40` | Pure Node import (keep `projection.ts` DOM-free); exact numeric cases |
| `tests/hud/format.test.ts` | Clock `%07d:%02d:%02d:%02d`, `0.350 LS`, `7.0 LY`, FIFO/expiry | `src/sim/hash.ts` formatting discipline | Pure functions; assert exact strings; pass time in |
| `tests/settings/schema.test.ts` | Defaults, unknown action rejected, >4 capped, corrupt → defaults + backup, v2 not downgraded, reset | `src/content/index.test.ts:29-90` (**exact style**) | `committedCopy()` mutation, `messageOf()` helper, assert field names in messages |
| `tests/input/bindings.test.ts` | Default map, edge once per keydown, `clearAll`, conflict | `src/content/systems.test.ts:43-78` | Typed map/table assertions; no real keyboard needed |
| `tests/app/launch-sequence.test.ts` | 2 s timer, skip only after first viewing, +600 once | `src/sim/cadence.test.ts:26-34` | Scripted ticks; assert elapsed/count |
| `tests/e2e/flight.spec.ts` | Launch → `inFlight`, speed/pitch/roll probe changes, torus/mass-lock | `tests/e2e/precision.spec.ts:6-43` | Collect console errors; `waitForFunction` on `ready`; assert probe, not pixels |
| `tests/e2e/hud.spec.ts` | Canvas backing size, element set, ultrawide letterbox | `tests/e2e/resize.spec.ts:11-78` | Read canvas + probe in one `evaluate`; assert scale/letterbox numerically |
| `tests/e2e/settings.spec.ts` | Pause freezes clock; rebind survives reload; reset; blur auto-pause | `tests/e2e/resize.spec.ts` | Keyboard `press`, reload, probe assertions; no screenshots |
| `tests/e2e/fallback.spec.ts` | `getContext("webgl2")` override ⇒ visible fallback + `ready:false` | `tests/e2e/precision.spec.ts:6-24` | `page.addInitScript`; assert no `pageerror`; assert footer still visible |
| `tests/e2e/dispose.spec.ts` | Repeated system swaps do not grow `renderer.info.memory` | `tests/e2e/models.spec.ts` (delivery path) | Use `?test=1` probe hooks; assert counters, not pixels |
| `tests/e2e/scene.spec.ts` | Draw calls/triangles > 0; body names present; no console errors | `tests/e2e/precision.spec.ts:24-43` | Probe counters; console errors last |
| `tests/e2e/launch.spec.ts` | Click Launch → `launching` → 2 s → `inFlight`; clock +600; skip on second launch | `tests/e2e/resize.spec.ts` (wait-for-change) | `waitForFunction` on probe mode/clock |
| `tests/e2e/helpers/probe.ts` | `waitForReady`, `getProbe`, `press`, `hold` | **No helper dir exists** — inline patterns at `tests/e2e/precision.spec.ts:15-24` | Extract the duplicated `waitForFunction`/`evaluate` pattern; typed return; no screenshot helpers |
| `tests/guards/sim-purity.test.ts` (extend) | New `src/sim/flight/**` and `world/**` still deny Three/DOM | itself: `42-57, 62-106` | `withProbe` + real ESLint/tsc run; assert exact rule names; `finally` cleanup |
| `tests/guards/content-boundary.test.ts` (extend) | `content/ships`/`settings` denied to sim; `content/types` still allowed | itself: `44-116` | Same probe pattern; add the new deny patterns after updating `eslint.config.js` |

---

## Reuse Candidates (do not reimplement)

| Symbol / file | Why reuse | Where |
|---|---|---|
| `cameraRelative(world, camera)` | The only legal world→render transform; a second path reintroduces float32 jitter | `src/render/camera-relative.ts:28-34` |
| `f32Ulp`, `f32Error` | Probe/test evidence for precision; already pinned by tests | `src/render/camera-relative.ts:40-49` |
| `DT`, `MAX_STEPS_PER_FRAME`, `MAX_FRAME_DELTA` | One fixed-step contract; three tests pin the semantics | `src/sim/step.ts:8-14` |
| `runToSteps` | Deterministic replay harness; do not change its stop-on-step-count semantics | `src/sim/loop.ts:28-61` |
| `fnv1a32`, `canon` | One hash/format pair; a second one invalidates goldens | `src/sim/hash.ts:13-35` |
| `vec`, `quat`, `identity`, `mul`, `normalize`, `rotate`, `axisAngle` | The sim's entire math vocabulary; extend here | `src/sim/math.ts:31-81` |
| `galaxy0()` | Lave is already eager and typed; no new content-loading path needed | `src/content/systems.ts:92-105` |
| `assertContentManifest` | Boot must validate the manifest before the renderer exists | `src/content/index.ts:60-76` |
| `System`, `SystemChunk`, `CatalogEntry`, `ShipCatalogue`, `ShipDef` | The only sim-facing content types; add `ShipDef` to the door | `src/content/types.ts:19-24` |
| `createStarfield` golden-angle loop | Deterministic star placement already proven; generalise for `sky_n_stars` | `src/render/precision-scene.ts:32-60` |
| `buildRenderer` + `requireCanvas` + `requireElement` | Existing WebGL2 detection, DPR cap, sRGB, log-depth settings; move/extend, don't duplicate | `src/main.ts:54-106` |
| `WegoliteProbe` + global declaration | Three e2e specs assert these fields; extend additively | `src/main.ts:22-41, 178-193` |
| `place()` convention | One place writes `Object3D.position` | `src/main.ts:45-52` |
| `ContentBoundaryError` shape | Named error with `this.name` + `{ cause }` | `src/content/index.ts:24-29` |
| `messageOf(call)` | Established assertion helper for thrown boundary errors | `src/content/index.test.ts:37-45` |
| `tests/golden/content/lave.json` | Do not weaken; it is the content golden | `tests/golden/content/lave.json` |
| Coriolis node contract (`hull`, `faceplate`, `tris`, `dock`; dock `[0,0,-500.2561]`) | Already pinned; station assembly must satisfy it | `tests/e2e/models.spec.ts:134-143` |
| `random_seed` string | Hash it with `fnv1a32` for planet/star seed; do not invent a new seed source | `src/content/generated/systems/g0.json` (Lave record) |

---

## No-Analogue Register

| Area | Files | Why no analogue | Start from |
|---|---|---|---|
| WebGL2 fallback UI | `src/app/fallback` | Current boot throws; no visible fallback DOM | `src/main.ts:74-101` detection + `index.html` footer/CSS |
| Scene disposal | `scene-manager.ts`, `system-scene.ts`, `asset-cache.ts` | **No `dispose()` call exists in `src/`** | RESEARCH § Pattern 3; `renderer.info.memory` probe |
| GLTF loading | `asset-cache.ts`, `station.ts`, `ship.ts` | No runtime loader; `models.spec.ts` explicitly avoids `GLTFLoader` | `tests/e2e/models.spec.ts:102-149` delivery contract; `three/addons/loaders/GLTFLoader.js` |
| Custom GLSL | `planet.glsl.ts`, `planet.ts` | No `ShaderMaterial` anywhere; only built-in materials | RESEARCH § 7 chunk list + source-string guard test |
| Canvas2D HUD | `render/hud/*` | No 2D context, no `<canvas id="hud">` | DPR/resize policy at `src/main.ts:103, 147-157`; `index.html` CSS |
| DOM UI modules | `src/ui/*` | No dynamic DOM creation beyond `textContent` | `src/main.ts:162-176`, `index.html:1-69` |
| `localStorage` settings | `settings/store.ts` | No persistence code at all | `src/content/systems.ts` cache/error shape; `content/schemas/manifest.ts` versioned schema |
| Keyboard input source | `input/keyboard.ts`, `bindings.ts` | Only a `resize` listener exists | `src/main.ts:159-160`; D-15 focus-loss rules in RESEARCH |
| Mode/command/event unions | `app/mode.ts`, `sim/commands.ts`, `sim/events.ts` | No tagged-union or state-machine precedent | `src/sim/state.ts:19-27` plain-data style |
| E2E probe helper | `tests/e2e/helpers/probe.ts` | No `helpers/` directory | Inline pattern at `tests/e2e/precision.spec.ts:15-24` |

---

## Anti-Patterns to Avoid (with repo evidence)

1. **Do not import Three or touch the DOM in `src/sim`.** `eslint.config.js:71-107` and `tsconfig.sim.json` are two independent gates; `tests/guards/sim-purity.test.ts:62-106` proves both fail. A flight module that imports `THREE.Quaternion` breaks `verify`.
2. **Do not import runtime content into the sim.** Only `src/content/types.ts` is allowed (`eslint.config.js:82-95`; positive proof at `tests/guards/content-boundary.test.ts:96-116`). Pass a numeric `FlightConfig`/`SystemLayout` instead.
3. **Do not use `Math.random`, `Date.now`, `performance.now`, or `new Date` in `src/sim`.** Lint bans them (`eslint.config.js:108-132`); the probe/cadence tests depend on determinism (`src/sim/cadence.test.ts:52-65`).
4. **Do not use `JSON.stringify` for canonical state.** `src/sim/state.ts:38-42` explains property-order/float-format drift; use `canon` + labelled lines.
5. **Do not static-import `generated/ships.json`.** 706,617 bytes; it would land in the main chunk. Use the lazy `?raw` glob shape from `src/content/systems.ts:61-72` (RESEARCH Pitfall 12).
6. **Do not hand-edit `src/content/generated/**`, `public/models/**`, or `public/textures/**`.** README content pipeline; `assets:check` runs inside `verify` and fails on drift.
7. **Do not add npm dependencies.** `package.json` pins the stack exactly; RESEARCH § Standard Stack says no new packages (no `simplex-noise`, `three-stdlib`, physics engine, HUD library).
8. **Do not use absolute positions in `Object3D.position`.** `src/render/camera-relative.ts:4-13` is the contract; the camera stays at the origin (`src/main.ts:45-52`). A value > 1e5 in `.position` is a bug.
9. **Do not use `Object3D.lookAt()` to orient the station.** The Phase 2 conversion put the dock at local `−Z`; `models.spec.ts:141` pins `[0,0,-500.2561]`. Use `quatFromUnitVectors((0,0,−1), stationToPlanet)` (RESEARCH Fidelity correction 3).
10. **Do not normalise `stationVector`/`sunVector` before positioning.** `systems.test.ts`/`g0.json` store them as authored non-unit vectors; normalise only for directions (RESEARCH Fidelity correction 1).
11. **Do not copy `PROBE_*` constants into the flight model.** `src/sim/step.ts:16-24` says they are placeholders and "nothing here may be copied into the flight model."
12. **Do not use the wrong Cobra entry.** `cobra3-trader`/`cobra3-alternate` are 300-speed variants; the player entry is `oolite_template_cobra3-player` (350/32/20 t), pinned at `ships.json:15032-15090`.
13. **Do not treat `station_roll` as rad/s.** It is right-angles/s; `0.08 * π/2 = 0.1256637` rad/s (RESEARCH Fidelity correction 2).
14. **Do not screenshot or pixel-diff.** `playwright.config.ts:20-23` sets `trace/screenshot: "off"`; D-08 and `precision.spec.ts` assert probes/counters, not images.
15. **Do not inject HTML.** `src/main.ts:163` writes with `textContent` ("S-7"); use the same for all new UI.
16. **Do not break the footer or title.** `tests/e2e/precision.spec.ts:38-40` and `tests/compliance.test.ts:141-166` assert the disclaimer text and a trademark-free `<title>`.
17. **Do not create a second canonical hash or a second world→render transform.** One of each exists; duplicate implementations silently diverge from the goldens.
18. **Do not let a scene dispose shared GLB resources.** `Object3D.clone()` shares geometry/material/texture; `AssetCache` owns them (RESEARCH Pitfall 11). There is no current code to copy, so make the ownership split explicit in `asset-cache.ts`.
19. **Do not add `paused` to `FlightState`.** It is app state (RESEARCH § Step 2); putting it in the hash makes replay depend on UI.
20. **Do not rename or remove existing probe fields.** `precision.spec.ts`, `resize.spec.ts`, and the Phase 1/2 contracts read them; only add.

### Build-order implications for the planner

- Do not edit `src/sim/step.ts`, `src/sim/state.ts`, `src/sim/loop.ts`, or `tests/golden/kinematic-probe.json`; add siblings under `src/sim/flight/` and `src/sim/world/` so the Phase 1 golden and cadence tests stay green.
- Update `eslint.config.js` (sim deny list) **in the same wave** that adds `content/ships.ts` and `settings/**`, then extend `tests/guards/content-boundary.test.ts` to prove the new denial. Otherwise the guard is green but blind.
- `src/content/types.ts` needs `ShipDef`/`Subentity` added before `deriveFlightConfig` can be typed without importing a schema into `src/sim`.
- All new files need the SPDX header; otherwise `verify` fails at `tests/compliance.test.ts:169-182` before any behavioural test runs.

---

## Metadata

**Analog search scope:** `src/` (sim, render, content), `tests/` (e2e, guards, golden, contract, compliance), `tools/oolite-ingest/` (error/determinism patterns), `index.html`, `eslint.config.js`, `tsconfig*.json`, `vitest.config.ts`, `playwright.config.ts`, `vite.config.ts`, `compose.yaml`, `package.json`.
**Files read:** 34 tracked source/test files plus 6 config/markup files; all cited analogue paths verified with `git ls-files`.
**Deliberately not read whole:** `src/content/generated/ships.json` (706 KB) and `g0.json` — targeted line ranges only.
**Pattern extraction date:** 2026-11-03.

---

## PATTERN MAPPING COMPLETE

**Phase:** 3 — Flight in the Lave System
**Files classified:** 53 mapping rows (~58 paths) + 28 test rows
**Analogs found:** 41 rows with an exact/role/partial analogue; 12 no-analogue rows

### Coverage
- Exact / near-exact analogue: 13 (flight state/step/speed, content loader, math, hash, camera-relative, probe, test harnesses)
- Role-match / partial analogue: 28 (layout, config, torus, launch, app loop, scene factories, settings schema, input types, HUD projection/format, body factories)
- No analogue: 12 (GLTF asset cache, scene disposal, Canvas2D HUD/draw, DOM UI modules, localStorage store, keyboard source, mode/command/event unions, e2e helper, planet shader, message queue)
- Guard gaps found: 2 (`src/sim` deny list lacks `**/settings/**` and `**/content/ships*`; no seeded PRNG exists despite the lint message)

### File written
`.planning/phases/03-flight-in-the-lave-system/03-PATTERNS.md`

The planner can now write tasks that copy `src/sim/step.ts`/`state.ts` for the flight core, `src/content/systems.ts` for the ships loader, `src/render/camera-relative.ts` + `main.ts:place()` for all body placement, `precision-scene.ts` factories for new scenes, `content/index.ts`/`schemas/manifest.ts` for versioned settings, and the existing e2e probe/console-error shape for browser proofs.
