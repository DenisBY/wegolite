# Architecture Research

**Domain:** Browser reimplementation of a 3D space trading/flight game (Oolite / Elite lineage)
**Researched:** 2026-11-02
**Confidence:** HIGH

> Evidence basis: Oolite source at `github.com/OoliteProject/oolite` (`src/Core/**`, `Resources/Config/**`, `Resources/Models/**`) was cloned and read directly; Three.js r187 renderer source was read; loop design cross-checked against Gaffer On Games. Numeric claims below are taken from that source, not from memory. See [Sources](#sources).

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ HOST / APP SHELL                                                              │
│  app/GameSession   app/GameLoop   app/ModeMachine   app/SaveSlots             │
│  (the only module allowed to wire sim ↔ render ↔ ui ↔ persistence)            │
├───────────────────────────────────┬──────────────────────────────────────────┤
│ PRESENTATION (impure)             │ SIMULATION (pure TypeScript, no DOM)      │
│                                   │                                          │
│  ┌──────────────┐ ┌────────────┐  │  ┌──────────┐ ┌────────┐ ┌────────────┐  │
│  │ render/      │ │ ui/        │  │  │ math/    │ │ time/  │ │ state/     │  │
│  │ Three.js     │ │ DOM screens│  │  │ Vec3 Quat│ │Fixed   │ │ GameState  │  │
│  │ camera-      │ │ market,    │  │  │ PRNG     │ │Step    │ │ PlayerState│  │
│  │ relative     │ │ chart, HUD │  │  └────┬─────┘ └───┬────┘ └─────┬──────┘  │
│  │ scene mgr    │ │            │  │       │           │            │         │
│  └──────┬───────┘ └─────┬──────┘  │  ┌────▼───────────▼────────────▼──────┐  │
│         │               │         │  │ flight/  navigation/  economy/     │  │
│  ┌──────▼───────┐ ┌─────▼──────┐  │  │ docking/ commands/    events/      │  │
│  │ input/       │ │ persistence│  │  │ save/                              │  │
│  │ keyboard →   │ │ IndexedDB  │  │  └────────────────┬───────────────────┘  │
│  │ InputFrame   │ │ + JSON I/O │  │                   │ reads types only     │
│  └──────────────┘ └────────────┘  │  ┌────────────────▼───────────────────┐  │
│                                   │  │ content/  (generated, typed, const)│  │
├───────────────────────────────────┴──┴────────────────────────────────────┴──┤
│ BUILD TIME (Node, not shipped)                                                │
│  tools/oolite-data: plist parser → ships/commodities/equipment/systems JSON;   │
│  .dat parser → mesh JSON; texture copy; manifest with Oolite commit hash      │
└──────────────────────────────────────────────────────────────────────────────┘

Dependency direction (enforced):
  content ← sim ← app → render / ui / input / persistence
  render and ui may READ sim types; they may never mutate sim state.
```

### Component Responsibilities

| Component | Responsibility / owns | Typical Implementation |
|-----------|----------------------|------------------------|
| `app/GameSession` | Composition root. Owns the single `GameState`, the command queue, the scene controller, and save slots. Only place that knows about all layers. | Plain class, constructed once in `main.ts`; no globals. |
| `app/GameLoop` | `requestAnimationFrame` → accumulator → N fixed steps → interpolated render → event drain. Frame clamp and step cap. | ~80 lines, fully unit-testable with a fake clock. |
| `app/ModeMachine` | Legal mode transitions and their side effects (launch timer, docked UI, jump countdown, scene swap). Mirrors Oolite's entity status enum. | Explicit transition table, no ad-hoc booleans. |
| `sim/math` | `Vec3`/`Quat`/`Mat3` on JS `number` (float64), seeded PRNG (mulberry32 or xorshift128+), angle helpers. | Hand-written, ~250 lines, property-tested. No Three.js import. |
| `sim/time` | Fixed-step clock, accumulator, step budget, paused state. | Deterministic; never reads wall clock inside `step()`. |
| `sim/state` | `GameState` (mode, tick, simTime, rngState), `PlayerState`, `SystemState`, `MarketState`. | Plain interfaces + factory functions; integer credits/cargo. |
| `sim/flight` | Attitude rate slewing, quaternion integration, speed slewing, forward integration, launch/dock kinematics. | Pure functions `stepFlight(state, input, dt)`. |
| `sim/navigation` | Galaxy chart model, system layout, hyperspace distance/fuel rules, jump resolution. | Pure math over generated `SystemDef[]`. |
| `sim/economy` | Market generation from `(commodityDef, economy, rng)`, buy/sell validation, price/stock updates. | Integer decicredits; no floats in stored values. |
| `sim/docking` | Dock corridor test in station-local space, docking-computer control law, launch/dock hand-off. | Pure geometry + a controller that writes normal flight intents. |
| `sim/commands` | Discrete command types (`Buy`, `Sell`, `Launch`, `RequestDock`, `Jump`, `Save`) and their reducers. | Tagged unions + `applyCommand(state, cmd, events)`. |
| `sim/events` | `SimEvent` union emitted by the step; drained once per frame. | Data-only; no object references, no callbacks. |
| `sim/save` | Save envelope, serializers, migrations, validator. | Explicit `toSave`/`fromSave` mappers; Zod (or hand-rolled) schema. |
| `content/` | Generated, typed game data + meshes + textures + manifest. Read-only at runtime. | JSON modules imported by Vite; assets fingerprinted. |
| `render/` | Three.js scene graph, camera-relative transform pass, materials, scene lifecycle (build/dispose), HUD 3D projections. | One `SystemScene` per system, pooled resources. |
| `ui/` | DOM screens (market, equipment, chart, status), focus/keyboard nav, toasts. Re-renders on state version/events, not per frame. | Plain DOM + small render functions; no React needed for v1. |
| `input/` | Device adapters → `InputFrame { axes, buttons }` + discrete action queue. Touch can be added later without touching sim. | Keyboard/mouse first; `InputSource` interface. |
| `persistence/` | IndexedDB slots, autosave, export/import JSON. Migrations live in `sim/save`, storage here. | `idb-keyval`-style thin wrapper (~60 lines) or `idb`. |
| `tools/oolite-data` | Build-time conversion and validation of Oolite assets. Fails CI on drift. | Node scripts + Vitest; invoked from `prebuild` / `pnpm data:build`. |

### Game Mode State Machine

Oolite encodes player state as an entity status (`src/Core/Tables/OOEntityStatus.tbl`). Copying those names keeps behaviour legible and makes fidelity reviews cheap.

```
 boot ──► mainMenu ──(new / continue)──► docked
                                           │ launch
                                           ▼
                                       launching ──(2 s)──► inFlight ◄──────────────┐
                                                              │  │  │               │
                              requestDock ────────────────────┘  │  │               │
                                   │                            │  │               │
                                   ▼                            │  │               │
                                docking ──(success)──► docked   │  │               │
                                   │                            │  │               │
                                   └──(abort)──► inFlight       │  │               │
                                                                │  │               │
                              jump ──► jumpCountdown ──► witchspace ──► arriving ──┘
                                                                │  │
                              pause ──► paused ──► inFlight ◄───┘  │
                                                                   │
                              (docking computer = an autopilot input source inside
                               inFlight/docking, not a separate mode)
```

Rules:

- `docking` is a *flight* sub-mode: manual docking keeps normal controls; the docking computer replaces input with a controller. No teleporting.
- `witchspace` is a timed sim mode that emits `JumpCompleted`; the renderer swaps scenes on that event, while the screen is fully obscured by the tunnel effect.
- `docked` freezes the flight step and switches the renderer to a static/off state; the UI owns input.
- `paused` (tab hidden, Escape) stops accumulation entirely; on resume the accumulator is **reset to 0**, not replayed.
- Any transition that touches persistence (`docked`) triggers autosave after the UI acknowledges.

### Scene Management

| Scene | When active | Contents | Lifecycle |
|-------|-------------|----------|-----------|
| `MenuScene` | boot, mainMenu | starfield background, slowly rotating Cobra | built once, never disposed |
| `SystemScene` | inFlight, launching, docking, paused | sky/starfield, sun, planet, station (+ dock subentity), player ship exterior (optional), dust | built on system entry from `SystemDef`, disposed on exit |
| `HyperspaceScene` | jumpCountdown tail, witchspace | tunnel/streak effect, no world bodies | reused for every jump |
| `StationScene` | docked | empty scene or last frame frozen; DOM UI covers the screen | renderer may be idled |

Scene swap protocol (prevents hitching and GPU leaks):

1. On `JumpCompleted`, build the destination `SystemScene` while `HyperspaceScene` still covers the screen (all geometry comes from build-time JSON; no network, no parsing at runtime).
2. Add it to the renderer with `visible = false`.
3. On the "arrival" frame, hide/dispose the old scene, show the new one, reset the floating origin.
4. `dispose()` walks every geometry/material/texture created for that system; shared assets live in a `ResourceCache` keyed by asset id and are never disposed per-system.

There is no 3D station interior in v1 — neither is there one in Oolite. Docking transitions to DOM screens over a static backdrop, exactly as Oolite transitions to its GUI screens.

## Recommended Project Structure

```
wegolite/
├── index.html
├── vite.config.ts                  # base: './', asset hashing, glsl raw imports
├── vitest.config.ts                # node env for sim; jsdom project for ui
├── playwright.config.ts            # chromium only in CI; firefox/safari nightly
├── tsconfig.json                   # strict, noUncheckedIndexedAccess
├── eslint.config.js                # import/no-restricted-paths rules (see below)
├── content/
│   └── oolite/                     # vendored upstream data, pinned (submodule or copy)
│       ├── Config/*.plist          # shipdata, planetinfo, trade-goods, equipment, ...
│       └── Models/*.dat            # only the meshes actually converted
├── tools/
│   └── oolite-data/
│       ├── plist/                  # OpenStep-ASCII plist tokenizer + parser
│       ├── dat/                    # legacy .dat mesh parser
│       ├── convert-systems.ts      # planetinfo.plist → systems.g0..g7.json
│       ├── convert-ships.ts        # shipdata (+ like_ship resolution) → ships.json
│       ├── convert-commodities.ts  # trade-goods.plist → commodities.json
│       ├── convert-equipment.ts    # equipment.plist → equipment.json
│       ├── convert-meshes.ts       # .dat → meshes/*.json (+ texture copy)
│       ├── manifest.ts             # Oolite commit, generator version, hashes
│       └── __tests__/fixtures/     # tiny hand-written .plist/.dat samples
├── src/
│   ├── main.ts                     # constructs GameSession, starts loop
│   ├── app/
│   │   ├── game-session.ts
│   │   ├── game-loop.ts
│   │   ├── mode-machine.ts
│   │   └── save-slots.ts
│   ├── sim/
│   │   ├── math/                   # vec3.ts quat.ts prng.ts angles.ts
│   │   ├── time/                   # fixed-step.ts clock.ts
│   │   ├── state/                  # game-state.ts player-state.ts world-state.ts ids.ts
│   │   ├── flight/                 # attitude.ts thrust.ts flight-step.ts
│   │   ├── navigation/             # galaxy.ts system.ts hyperspace.ts jump.ts
│   │   ├── economy/                # market.ts pricing.ts trade.ts
│   │   ├── docking/                # corridor.ts docking-computer.ts
│   │   ├── commands/               # command.ts apply.ts
│   │   ├── events/                 # events.ts drain.ts
│   │   ├── save/                   # schema.ts serialize.ts migrate.ts
│   │   └── step.ts                 # the single fixed-step entry point
│   ├── content/
│   │   ├── generated/              # checked-in JSON output (do not hand-edit)
│   │   ├── types.ts                # ShipDef, SystemDef, CommodityDef, EquipmentDef
│   │   └── index.ts                # typed accessors + integrity assertions
│   ├── render/
│   │   ├── renderer.ts             # WebGLRenderer config (log depth, colour space)
│   │   ├── camera-rig.ts           # floating origin + view offsets
│   │   ├── sync.ts                 # sim snapshot → camera-relative transforms
│   │   ├── scene-manager.ts        # Menu/System/Hyperspace scenes
│   │   ├── system-scene.ts
│   │   ├── bodies/                 # planet.ts sun.ts station.ts ship.ts dust.ts starfield.ts
│   │   ├── materials/              # material factory from ShipDef.materials
│   │   └── hud/                    # compass, speed/status bars, 3D-projected markers
│   ├── ui/
│   │   ├── screens/                # market screen.ts equipment.ts chart.ts status.ts
│   │   ├── components/             # table.ts menu.ts toast.ts
│   │   └── ui-root.ts
│   ├── input/
│   │   ├── input-frame.ts
│   │   ├── keyboard.ts
│   │   └── bindings.ts
│   └── persistence/
│       ├── indexed-db.ts
│       └── transfer.ts             # export/import .wegolite-save.json
└── tests/
    ├── golden/                     # scripted replays + expected state hashes
    └── e2e/                        # Playwright specs
```

### Structure Rationale

- **`sim/` is a standalone library.** It imports only `sim/` and `content/types`. That is what lets every rule be unit-tested in Node in milliseconds and what makes future Web Worker offload or headless replay possible. It is also the single biggest protection against "renderer as source of truth".
- **`content/generated/` is checked in.** Generated data is a build artifact *and* a reviewable diff. CI regenerates and fails if the working tree changes (`data:check`), so upstream data updates are explicit and reviewable rather than a silent build step.
- **`render/` is flat and shallow.** One system scene, a handful of bodies. Deep scene-graph nesting is avoided because every transform is recomputed camera-relative each frame anyway.
- **`ui/` is DOM, not canvas.** Oolite's station screens are text tables and menus. DOM gives keyboard navigation, focus, zoom, and accessibility for free, and keeps UI out of the render loop. HUD elements that must track 3D positions are the exception: they live in `render/hud` and project world points with `camera.project`.
- **`app/` is the only composer.** Enforce with `eslint-plugin-import` zones (or `dependency-cruiser`):
  - `sim/**` may not import `three`, `render/**`, `ui/**`, `input/**`, `persistence/**`, or `app/**`.
  - `render/**` may not import `app/**` or `ui/**`.
  - `ui/**` may not import `three` or `render/**` (it talks in commands/events/plain view models).
  This one lint rule prevents the most common architectural decay in game projects.

## Architectural Patterns

### Pattern 1: Camera-Relative Rendering over a Float64 Simulation

**What:** The simulation stores positions as JS `number` (float64) in metres. Every frame, the renderer computes each body's transform as `worldPos - cameraPos` *in doubles* and writes the small result into the Three.js object. The camera itself sits at the origin and only carries orientation.

**When to use:** Always, from the first frame. This is not an optimisation to add later; retrofitting it means touching every entity, effect, and shader.

**Trade-offs:** One extra subtraction and one transform pass per visible body (trivial at v1's entity count); requires discipline that nothing writes absolute coordinates into `Object3D.position` (except bodies intentionally placed far away, which still work).

**Why the numbers force this.** Oolite's units are metres, with planets scaled 1/100 from reality:
`collision_radius = radius_km * 10` (`PlanetEntity.m`). Lave is `radius = 4116` km → **41,160 units**; `planet_distance = 452,760`; `sun_distance = 905,520`; `sun_radius = 84,449`; the station sits `2 × planet_radius` from the planet centre. Worst-case |coordinate| in normal space is ~`1.4e6` m.

Float32 relative precision (`ULP = 2^(floor(log2 x) - 23)`):

| Coordinate magnitude | float32 ULP | Consequence |
|----------------------|-------------|-------------|
| 100 m | 7.6 µm | fine |
| 1,000 m | 61 µm | fine |
| 10,000 m | 0.98 mm | fine |
| 100,000 m | 7.8 mm | visible shimmer on a 500 m station |
| 500,000 m (planet distance) | 3.1 cm | visible vertex jitter on ships/stations |
| 1,400,000 m (sun) | 12.5 cm | unusable for anything near the camera |

Camera-relative rendering keeps every *uploaded* coordinate below ~10 km in the common case (ULP ≤ 1 mm) and below ~100 m in the cockpit (ULP ≤ 10 µm). The simulation never loses precision because JS numbers are doubles; only the GPU upload is float32.

```ts
// render/sync.ts — runs once per rendered frame, after the sim steps.
const shipPose = interpolatePose(prevPose, state.ship, alpha);   // position + slerped quat
const cam = addVec(
  shipPose.position,
  rotateVec(shipPose.orientation, state.ship.viewOffset)         // Oolite view_position_forward
);                                                // float64, sim space (metres)

function place(obj: THREE.Object3D, p: Vec3): void {
  // Subtraction happens in double precision, THEN the small result is uploaded.
  obj.position.set(p.x - cam.x, p.y - cam.y, p.z - cam.z);
}

place(station.mesh, world.station.position);     // e.g. (100, 0, -60) — ULP ~1e-5 m
place(planet.mesh, world.planet.position);       // e.g. (0, 0, -452760) — ULP 3 cm, but the
                                                 // object is 82 km across: 4e-7 relative error
camera.position.set(0, 0, 0);
camera.quaternion.copy(shipPose.orientation);    // sim already uses the same basis as Three
```

- **Near/far planes:** `near = 0.5`, `far = 2_500_000`. At 24-bit depth this range destroys depth precision: with a conventional projection, error is ≈ `z² / (near · 2^24)` — 12 cm at 1 km, 12 m at 10 km, **1.2 km at 100 km**. A station at 100 km would z-fight through the planet.
- **Fix:** `new THREE.WebGLRenderer({ logarithmicDepthBuffer: true })` (Three.js r187, verified in `src/renderers/WebGLRenderer.js`). Log depth redistributes precision logarithmically, giving sub-metre resolution at 100 km instead of 1.2 km. `reversedDepthBuffer` also exists in r187 but requires `EXT_clip_control`, which is not universal — do not depend on it.
- **Fallback if a target browser shows log-depth artefacts:** render distant bodies (planet, sun) in a second pass at 1/1000 scale with its own camera and cleared depth, after the near scene. Keep this behind a `RenderStrategy` interface so it is a swap, not a rewrite.

**Non-negotiables:**
- Never scale the world down globally to "fit" float32 — it silently changes every Oolite-derived number (speeds, radii, docking corridor, market distances).
- Never write camera-relative positions back into sim state; the transform pass is read-only.
- Never let an `Object3D` accumulate absolute position through parent transforms; bodies are flat children of the scene root with explicit camera-relative positions.
- **Sky, dust and particles need their own treatment.** The starfield/skybox is camera-locked (position always 0, orientation only). Dust motes are a fixed-size cloud that must be *re-seeded around the camera* whenever the camera moves more than the cloud radius, or they will be left behind at the old origin and the sense of speed disappears. Lights are directional or positioned relative to the camera, never at absolute coordinates.
- **Interpolation and the origin use the same camera.** Compute `alpha`-interpolated ship pose first, derive the camera from it, then subtract that camera from every body. Mixing "current ship" for the camera with "interpolated ship" for the hull produces sub-metre shimmer at speed.

### Pattern 2: Fixed-Timestep Simulation with Rendered Interpolation

**What:** Real frame time is accumulated; the sim advances in whole `DT` steps; the renderer draws at `alpha = accumulator / DT` between the previous and current sim snapshots.

**When to use:** Always for the flight/docking sim. Docked/economy updates can run on the same tick loop (they are cheap) so there is exactly one clock.

**Trade-offs:** Adds up to one `DT` of input latency (8.3 ms at 120 Hz — imperceptible); requires keeping a previous snapshot for interpolation; requires clamping so a background tab cannot replay thousands of steps.

**Chosen constants:**

| Constant | Value | Rationale |
|----------|-------|-----------|
| `DT` | `1/120` s (8.333 ms) | At the Cobra's 350 m/s top speed a step moves 2.9 m — well inside the ~100 m dock corridor and the 500 m station radius. 60 Hz (5.8 m/step) would work but leaves less margin for docking and future combat. |
| `MAX_STEPS_PER_FRAME` | 5 | Caps catch-up at 41.7 ms of sim per frame. |
| `MAX_FRAME_DELTA` | 0.25 s | Same clamp Oolite uses (`MINIMUM_GAME_TICK` = 0.25 in `GameController.h`, despite the name it caps the maximum pause); protects against sleep/tab-switch. |
| Resume behaviour | accumulator = 0 | Never replay time while hidden. |

**Deliberate deviation from Oolite:** v1 ignores `max_flight_yaw` (Oolite defaults yaw to pitch). PROJECT.md locks pitch/roll only; the flight step therefore integrates two axes. Keep the third axis out of the input mapping but leave the quaternion helper general so v2 can add yaw without re-deriving the integration.

```ts
// app/game-loop.ts
frame(nowMs: number): void {
  const delta = Math.min((nowMs - this.lastMs) / 1000, MAX_FRAME_DELTA);
  this.lastMs = nowMs;
  if (this.paused) { this.accumulator = 0; return; }

  this.accumulator += delta;
  const input = this.input.poll();          // ONE immutable snapshot per frame
  let pending: readonly Command[] = this.commands.drain();  // drained once
  let steps = 0;
  while (this.accumulator >= DT && steps < MAX_STEPS_PER_FRAME) {
    this.prev = snapshotPose(this.state);   // for interpolation
    step(this.state, input, pending, DT, this.events);
    pending = EMPTY_COMMANDS;               // commands apply exactly once
    this.accumulator -= DT;
    steps++;
  }
  if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;   // drop the backlog

  const alpha = this.accumulator / DT;
  this.scene.sync(this.prev, this.state, alpha);
  this.renderer.render(...);
  this.events.drainInto(this.ui, this.state);
}
```

**Determinism guarantees (and their limits):**
- All randomness comes from a PRNG whose state lives inside `GameState` and is serialized. No `Math.random()` in `sim/`.
- No `Date.now()`, `performance.now()`, `setTimeout`, DOM, or Three.js inside `step()`.
- Input is sampled once per frame; discrete actions are queued so a keypress cannot be lost or double-applied when a frame contains 0 or 3 steps.
- Rotation is integrated by quaternion multiplication (`q = q_delta * q`), which is exact for a constant angular rate at any `dt` — this is also how Oolite does it (`PlayerEntity applyRoll:andClimb:`), so behaviour is frame-rate stable by construction.
- **Honest limit:** bit-identical results are guaranteed within one JS engine. `Math.sin/cos/pow` are not specified to be bit-identical across engines, so keep transcendentals out of `sim/` (only `+ - * /` and `Math.sqrt` are needed). This gives reproducible saves/replays and solid golden tests; it does not claim cross-browser lockstep (irrelevant for single-player).

### Pattern 3: Build-Time Content Compilation (plist + .dat → typed JSON)

**What:** Never ship Oolite's data formats or a runtime parser. A Node toolchain converts them once, validates them, and emits typed JSON plus a manifest. The game imports plain objects.

**When to use:** From the first phase that needs real content. This is also the answer to "how do we stay faithful": the numbers are generated from upstream, not retyped.

**Trade-offs:** A build step and ~600 lines of parser code; upstream format changes surface as build failures (which is the point). Generated files must be committed for reviewability.

**Source formats, as actually parsed by Oolite:**

1. **Config plists are GNUstep/OpenStep ASCII**, not XML: `{ key = value; }`, `( a, b, c )`, `//` and `/* */` comments, unquoted tokens, `yes`/`no`, quoted strings with escapes, nested dicts/arrays. Example: `equipment.plist` is an array of `(techlevel, price, name, key, description, conditions)` tuples, with **price in decicredits** (1 Cr = 10). `shipdata.plist` uses `like_ship` inheritance chains and `is_template = 1`.
2. **`planetinfo.plist` is the entire universe.** 2.7 MB, exactly **2,048 entries** keyed `"<galaxy> <systemIndex>"` (8 × 256), each with `name`, `coordinates`, `economy`, `government`, `techlevel`, `population`, `productivity`, `radius`, `planet_distance`, `sun_distance`, `sun_radius`, `station_vector`, `sun_vector`, and more. Verified: 256 keys per galaxy, none missing. **Do not reimplement Elite's galaxy generator for base data** — convert this file. (Keep the deterministic generator only for procedural planet surfaces, which v1 can skip.)
3. **`.dat` meshes** are ASCII: `NVERTS n`, `NFACES m`, `VERTEX` block (`x,y,z` per line), `FACES` block (`smoothGroup, legacyG, legacyB, nx,ny,nz, nVerts, i0,i1,i2` — the three leading ints are legacy colour fields, only the first is used as a smoothing group; Oolite truncates any face to its first 3 vertices, so treat all faces as triangles), `TEXTURES` block (one line per face: `material maxX maxY s0 t0 s1 t1 s2 t2`, UV = `s/maxX`, `t/maxY`), optional `NAMES`, optional `NORMALS`, terminated by `END`. Oolite renders with `GL_CCW` front faces.

**Pipeline rules:**
- Resolve `like_ship` at build time with cycle detection; drop `is_template` entries unless referenced.
- Keep a **whitelist of consumed keys** and fail the build on unknown keys in files we depend on — this is how upstream drift is noticed instead of silently ignored.
- Apply one coordinate conversion here, not at runtime: Oolite is `+Z` forward; our sim and Three.js are `-Z` forward. The mesh converter **negates Z on positions and normals and reverses triangle winding** (so `FrontSide` stays correct). Consequence: `oolite_coriolis_dock.dat`, authored at `z = +500.2561`, lands at `z = -500.2561` — i.e. the dock faces the same direction a Three.js camera looks, which is exactly what an approaching pilot sees.
- Apply `model_scale_factor` from `shipdata` during conversion.
- Verify UV orientation once with a textured reference model (the `TEXTURES` block is in Oolite's top-left convention; Three.js `Texture.flipY` defaults to `true`, which matches OpenGL-style uploads). Bake the flip into the converter if a render comparison disagrees.
- Emit `manifest.json` with the Oolite commit/tag, generator version, per-file hashes, and the CC BY-NC-SA attribution text. `data:check` regenerates into a temp dir and diffs.

```ts
// content/types.ts — units are explicit in the name; no ambient ambiguity.
export interface SystemDef {
  readonly galaxy: 0|1|2|3|4|5|6|7;
  readonly index: number;          // 0..255
  readonly name: string;
  readonly chartX: number;         // 0..255, from planetinfo "coordinates"
  readonly chartY: number;         // 0..255
  readonly economy: number;        // 0..7
  readonly government: number;     // 0..7
  readonly techLevel: number;
  readonly radiusKm: number;
  readonly planetDistance: number; // metres (Oolite units)
  readonly sunDistance: number;    // metres
  readonly sunRadius: number;      // metres
  readonly stationVector: readonly [number, number, number]; // unit vector, planet → station
  readonly sunVector: readonly [number, number, number];     // unit vector, planet → sun
}

// Derived in sim/navigation/system.ts, never stored:
//   planetRadius = radiusKm * 10
//   stationPosition = planetPos - stationVector * (2 * planetRadius)
export interface ShipDef {
  readonly key: string;
  readonly name: string;
  readonly modelId: string;
  readonly lengthM: number; readonly widthM: number; readonly heightM: number;
  readonly maxSpeed: number;       // m/s (Cobra Mk III: 350)
  readonly thrust: number;         // Cobra Mk III: 32; accel = 5 * thrust m/s²
  readonly maxPitchRate: number;   // rad/s (1.0)
  readonly maxRollRate: number;    // rad/s (2.0)
  readonly maxCargo: number;       // tons (20)
  readonly materials: Readonly<Record<string, MaterialDef>>;
}
```

### Pattern 4: Command / Event Boundary (sim never calls out)

**What:** The UI and input layers never mutate state. They enqueue `Command` values. The sim applies them at a tick boundary and emits `SimEvent` values. The UI re-renders from state + events.

**When to use:** Every interaction, including flight axes (as an `InputFrame`), trading, docking requests, jumps, and save requests.

**Trade-offs:** Slightly more code than calling a method on a store; buys testability, replay, and a guaranteed one-way dependency.

```ts
export type Command =
  | { kind: 'buy'; good: CommodityId; qty: number }
  | { kind: 'sell'; good: CommodityId; qty: number }
  | { kind: 'launch' }
  | { kind: 'requestDock' }
  | { kind: 'engageDockingComputer' }
  | { kind: 'jump'; targetSystem: number }
  | { kind: 'save'; slot: string };

export type SimEvent =
  | { kind: 'tradeCompleted'; good: CommodityId; qty: number; unitPrice: number; credits: number }
  | { kind: 'launched' }
  | { kind: 'docked'; station: string }
  | { kind: 'jumpCountdownStarted'; targetSystem: number; fuelCost: number }
  | { kind: 'systemChanged'; galaxy: number; system: number }
  | { kind: 'commandRejected'; reason: RejectReason };

export type RejectReason =
  | 'insufficientCredits' | 'cargoFull' | 'noStock' | 'outOfRange'
  | 'insufficientFuel' | 'notDocked' | 'noDockingComputer' | 'invalidTarget';
```

### Pattern 5: Versioned Save Envelope with Ordered Migrations

**What:** A small envelope carries `format`, `schemaVersion`, app version, timestamp, and a plain `payload`. Loaders run migrations in order, then validate strictly.

**When to use:** From the first save. The schema will change (equipment, markets, ship upgrades), and ad-hoc `JSON.parse` + defaults becomes unmaintainable fast.

**Trade-offs:** A migration file per schema bump; negligible. Oolite itself has no explicit version and instead relies on tolerant readers plus key aliases (`galaxy_seed` vs `galaxy_id`, `galaxy_coordinates` vs `system_id`) — that works but makes old saves ambiguous. We can do better while keeping Oolite's field vocabulary for a future `.oolite-save` importer.

```ts
export const SAVE_FORMAT = 'wegolite-save' as const;
export const CURRENT_SCHEMA = 1;

export interface SaveEnvelope {
  format: typeof SAVE_FORMAT;
  schemaVersion: number;
  appVersion: string;        // semver, for diagnostics only
  savedAt: string;           // ISO-8601
  payload: unknown;          // validated after migration
}

export interface SavePayloadV1 {
  commander: {
    name: string;
    credits: number;                 // decicredits (integer)
    fuel: number;                    // 0..70 (0.1 ly units)
    galaxy: number;                  // 0..7
    system: number;                  // 0..255
    shipKey: string;                 // e.g. "cobra3-player"
    equipment: string[];             // e.g. ["EQ_DOCK_COMP"]
    cargo: Record<string, number>;   // commodity id → tons
  };
  markets: Record<string, { prices: number[]; quantities: number[] }>; // key "g:s"
  clock: number;                     // sim seconds since new game
  rng: [number, number, number, number];  // PRNG state, for deterministic continuation
  dockedAt?: { galaxy: number; system: number; stationKey: string };
  settings: { invertPitch: boolean; fov: number };
}
```

Rules:
- Serialize with explicit mappers (`toSavePayload(state)` / `fromSavePayload(payload)`), never `JSON.stringify(gameState)`. Object graph shape is an implementation detail; the save format is a contract.
- Integers only for money and cargo. Oolite prices are decicredits; store them that way.
- `rng` is part of the save so a reloaded game continues the same deterministic stream.
- Migrations are `Record<number, (payload: any) => any>` applied ascending; each version gets a frozen fixture and a test.
- If `schemaVersion > CURRENT_SCHEMA`, refuse to load with a clear message rather than guessing.
- Storage: IndexedDB (structured clone, ~MBs) with one record per slot plus an `autosave` slot; `navigator.storage.persist()` requested after the first manual save. Export/import is a downloadable JSON file so players are never trapped by a cleared browser profile.
- A non-cryptographic `checksum` (e.g. FNV-1a over canonical JSON) is optional and only used to detect truncation; it is not a security control.

## Data Flow

### Request Flow: One Frame

```
requestAnimationFrame(t)
        │
        ▼
app/GameLoop.frame(t)
        │  delta = clamp(t - last, 0, 0.25s)
        │  accumulator += delta
        ▼
input.poll() ──────────────► InputFrame (immutable, one per frame)
        │
        ▼
commandQueue.drain() ──────► Command[] (discrete; applied in order)
        │
        ▼
while accumulator >= DT (max 5):
    sim/step.ts:  step(state, inputFrame, commands, DT, events)
        │            ├─ commands (first step only) → economy/docking/navigation reducers
        │            ├─ flight: attitude rates → quaternion; speed → position
        │            ├─ docking corridor test / docking computer control
        │            ├─ clock, RNG state, mode timers
        │            └─ emit SimEvent[]
        ▼
eventBus.drain() ──────────► ui.apply(events), app (autosave, scene swap)
        │
        ▼
render/sync.ts:  camera-relative transforms (double subtract → float32 upload)
        │
        ▼
WebGLRenderer.render(SystemScene, cameraAtOrigin)
```

Invariants:
- `input.poll()` runs **once per frame**, before any step, so every step in that frame sees the same axes.
- `events` are drained **after** the step loop, so the UI sees one coherent batch.
- The renderer may only read `state` and `prevPose`; it never writes to them.
- If zero steps ran this frame, the renderer still draws with the previous state and a larger `alpha` (interpolation), so a 144 Hz display is smooth on a 120 Hz sim.

### State Management

```
GameState (single instance, owned by app/GameSession)
  ├─ mode: Mode
  ├─ tick, simTime (the accumulator lives in GameLoop, never in state)
  ├─ rng: [u32, u32, u32, u32]
  ├─ player: PlayerState   (position: Vec3, orientation: Quat, speed, fuel, credits, cargo, equipment)
  ├─ world:  SystemState   (systemDef, station pose, planet pose, sun pose, dustSeed)
  └─ market: MarketState   (current system's prices[]/quantities[] — integers;
                             other visited markets live in the save payload)

        │  read-only snapshots
        ├──────────────► render/sync.ts  (poses only, converted to camera-relative)
        ├──────────────► ui/screens      (view models, re-rendered on version change)
        └──────────────► sim/save        (explicit mappers → SavePayload)
```

There is **no store library and no observer graph**. `GameState.version` increments once per tick; the UI's `apply()` compares it and re-renders only when needed (station screens are static between ticks anyway). This is deliberate: a reactive framework would tempt components to mutate state, breaking the one-way rule and determinism.

### Key Data Flows

**1. Trade transaction (buy 3 t of Food at Lave, docked)**

```
DOM row click "Buy 3"
   → ui changes no state; pushes Command{buy, food, 3}
   → GameLoop drains commands on the next tick
   → sim/economy/trade.ts applyBuy(state, cmd):
        unitPrice = market.prices.food            // integer decicredits
        costs     = unitPrice * 3
        guard: credits >= costs && cargoUsed + 3 <= maxCargo && stock >= 3
        credits  -= costs
        cargo.food += 3
        market.quantities.food -= 3
        emit TradeCompleted{food, 3, unitPrice, credits}
   → ui.apply(event): re-render credits + food row from state
   → (no async, no network, no floating point money)
```

Initial prices are themselves pure: `generatePriceForGood` = `average + average*economic*(-bias) + average*random*(randf()-randf())`, truncated to integer decicredits, where `bias` comes from `peak_export`/`peak_import` vs the system economy (`OOCommodities.m`). Lave (`economy = 5`, tech level 4) buys Food at ≈3.8 Cr; that is a good fidelity fixture.

**2. Launch → flight**

```
Command{launch} (docked only)
  → guard: mode === docked, system station exists
  → mode = launching, set station-relative spawn pose at the dock mouth,
    forward = station.dockNormal (outward, away from the station), speed 0
  → 2 s scripted exit → mode = inFlight, emit Launched
  → renderer swaps from StationScene to live SystemScene (already built while docked)
```

**3. Manual docking / docking computer**

```
inFlight + station within ~30 km
  → each tick, sim/docking/corridor.ts transforms ship pose into dock space:
       |x| < portWidth/2, |y| < portHeight/2, z >= -corridorLength, facing >= 0.9
  → on overlap: mode = docking → docked, emit Docked{stationKey}; autosave
  → Command{engageDockingComputer} (requires EQ_DOCK_COMP):
       replaces InputFrame with a controller that computes pitch/roll error to the
       dock axis and a speed profile (slower near the mouth), then feeds the
       *normal* flight step — no teleport, no animation shortcut
```

**4. Hyperspace jump**

```
Command{jump, targetSystem}
  → guard: docked? no. distance <= 7 ly, fuel >= 10*distance
  → distance = 0.4 * trunc(sqrt(dx² + (dy/2)²))      // Oolite's integer truncation is intentional
  → fuel -= 10 * max(0.1, distance)
  → mode = jumpCountdown (5 s) → witchspace (N s) → arriving
  → emit JumpCompleted on arrival
  → app: build destination SystemScene during the tunnel, swap on arrival,
         reset camera/interpolation snapshots, emit SystemChanged
```

Fixtures: Lave `(20,173)` → Diso `(11,174)` = 3.6 ly / 36 fuel; Lave → Zaonce `(33,185)` = 5.6 ly / 56 fuel.

**5. Save / resume**

```
Command{save} (docked) or autosave on Docked
  → sim/save/toSavePayload(state)  (explicit mapping, integers)
  → envelope { format, schemaVersion, appVersion, savedAt, payload }
  → persistence/indexed-db.put(slot, envelope)
Reload
  → read envelope → migrations ascending → validate → fromSavePayload
  → rebuild SystemScene from SystemDef (no world state is serialized)
```

Only player/economy state is saved. The world (planet, sun, station positions) is derived from `SystemDef`, and markets are stored per visited system, so saves stay a few kilobytes.

## Scaling Considerations

This is a single-player static client; "scale" means world extent and entity count, not users.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| v1 (1 ship, planet, sun, station, dust) | Naive per-frame transform pass, one draw call per body, no culling beyond frustum. Sim step is microseconds. |
| v2 combat (50–200 ships + projectiles) | Instanced projectiles/explosions, spatial hash for broadphase, LOD meshes for ships, shared materials. Sim still on the main thread. |
| 1,000+ entities (hypothetical beyond v2) | Move `sim/` into a Web Worker; transfer two pose buffers per frame (double-buffered snapshots); structure-of-arrays for hot loops. The pure-sim boundary already permits this. |
| Multi-user | Out of scope by project definition. No server, no accounts, no runtime network. |

### Scaling Priorities

1. **First bottleneck: shader compilation and first-draw stalls on scene swap.** Fix by pre-warming materials during the hyperspace tunnel (render off-screen for one frame), and by sharing `Material` instances across bodies of the same type.
2. **Second bottleneck: depth precision at long range.** Already addressed by camera-relative transforms + logarithmic depth; if a browser misbehaves, switch to the scaled far-pass strategy behind `RenderStrategy`.
3. **Third bottleneck: allocation churn during scene rebuild.** Reuse typed arrays and geometries from `ResourceCache`; never allocate per-frame objects in `sync.ts`.
4. **Fourth: sim cost.** Irrelevant until NPCs exist (v1 sim is O(1) per tick). Do not optimise it early; do keep it allocation-light so a future Worker move is a lift-and-shift.

## Anti-Patterns

### Anti-Pattern 1: Renderer as the source of truth

**What people do:** Keep ship position on the `THREE.Object3D`, read `mesh.position` back into gameplay code, or run collision against scene-graph transforms.
**Why it's wrong:** Ties game rules to frame rate, GPU float32, and Three.js internals; makes headless tests impossible; silently breaks determinism.
**Do this instead:** `sim/state` is authoritative; `render/sync.ts` is a one-way projection.

### Anti-Pattern 2: Float32 or typed-array state in the simulation

**What people do:** Store positions in `Float32Array` "for performance" or use Three.js vectors everywhere.
**Why it's wrong:** Introduces 0.03–0.12 m error at Oolite distances *before* rendering, and makes quaternion normalisation and docking tests noisy.
**Do this instead:** float64 (`number`) in sim; convert only at the GPU boundary.

### Anti-Pattern 3: Variable-dt flight physics

**What people do:** `position += velocity * (now - last)` in the render loop.
**Why it's wrong:** Docking behaviour, thrust curves, and replays change with refresh rate; a 30 fps machine handles differently from a 144 Hz one.
**Do this instead:** fixed `DT = 1/120`, accumulator, input snapshot per frame, interpolation for display.

### Anti-Pattern 4: Globally rescaling the world to fit float32

**What people do:** Multiply all Oolite distances by 1/1000 (or use "1 unit = 1 km") so coordinates fit.
**Why it's wrong:** Every ported number (speed, radius, dock corridor, scanner range, market distances) must be rescaled, and any missed constant silently changes gameplay. It also doesn't fix depth precision.
**Do this instead:** keep metres and Oolite's numbers; use camera-relative rendering + log depth.

### Anti-Pattern 5: Floating origin implemented as sim teleportation

**What people do:** When the player travels far, subtract an offset from every entity's *simulation* position.
**Why it's wrong:** Mutates authoritative state for a rendering concern; breaks save coordinates, relative distances, and determinism.
**Do this instead:** the origin is always the camera, applied only in `render/sync.ts`.

### Anti-Pattern 6: Parsing Oolite formats at runtime

**What people do:** Ship a plist parser and `.dat` loader to the browser and parse 2.7 MB of config on boot.
**Why it's wrong:** Slow startup, untestable string parsing in the hot path, no type safety, and stale-data bugs that only appear at runtime.
**Do this instead:** convert at build time, validate in CI, import typed JSON.

### Anti-Pattern 7: `JSON.stringify(state)` as the save format

**What people do:** Dump the live object graph and `JSON.parse` it back.
**Why it's wrong:** Every internal rename becomes a save break; references, `Map`s, and class instances don't round-trip; no migration path.
**Do this instead:** explicit payload interface + versioned envelope + ordered migrations.

### Anti-Pattern 8: Interdependent mode booleans

**What people do:** `isDocked`, `isJumping`, `isDocking`, `isPaused` as independent flags.
**Why it's wrong:** Impossible states (`isDocked && isJumping`) appear after a missed transition, and the renderer/UI disagree about what is happening.
**Do this instead:** one `mode` discriminant, explicit transition table, side effects in one place.

## Build Order

Architecture-derived order. Each phase is independently demoable and leaves the repo in a testable state.

| # | Phase | Depends on | Why here | Exit criterion |
|---|-------|-----------|----------|----------------|
| 1 | **Walking skeleton**: repo, TS/Vite/Vitest, `sim/math`, `sim/time`, `GameLoop`, camera-relative renderer, starfield + one cube, determinism harness | — | The loop and coordinate strategy are the two things that are catastrophic to retrofit. Proving them with a cube costs a day. | 60 fps; identical state hash for a recorded 10k-tick replay; cube shows no jitter at 1.4e6 m |
| 2 | **Content compiler**: plist parser, `.dat` parser, systems/ships/commodities/equipment/mesh generators, manifest, `data:check` in CI | 1 (types) | Every later phase reads real numbers; retyping Oolite values by hand is where fidelity dies. | 2,048 systems and the Cobra + Coriolis meshes generate deterministically; Lave fixtures pass |
| 3 | **System model + scene**: galaxy chart data, `SystemDef` → layout, `SystemScene` (planet/sun/station/dust), scene manager, hyperspace math (pure) | 1, 2 | Validates the coordinate strategy against real distances (planet at 452 km, sun at 905 km) before flight feel is tuned. | Fly the camera from witchpoint to Lave station; no depth artefacts; scene dispose leaves zero geometries |
| 4 | **Flight + input + launch**: attitude slewing, quaternion integration, speed control, keyboard binding, HUD, `launching` mode | 3 | The core feel; needs a real scene to be judged. | Launch from Lave and fly; pitch/roll rates match Oolite constants; recorded-input replay is identical and feel is unchanged from 30–144 Hz |
| 5 | **Docking**: station rotation, dock-space corridor test, manual docking, docking-computer controller | 4 | Only meaningful once flight is stable; depends on the station pose and corridor dimensions from phase 2. | Manual dock succeeds; computer docks reliably from 30 km; failed approach does not teleport |
| 6 | **Docked mode + economy + screens**: mode machine, market generation, trade commands/events, DOM screens (market, equipment, chart, status), equipment purchase | 2, 5 | The loop closes here: launch → dock → trade. Save schema can now be designed against settled state. | Buy/sell at Lave; buy the docking computer; all four screens navigate by keyboard |
| 7 | **Hyperspace + persistence + full loop**: countdown/tunnel/arrival, scene swap, save envelope v1, IndexedDB, autosave, export/import, Playwright loop test | 3, 5, 6 | Requires stable state shape and both scenes. Save is last because its schema should describe a finished v1. | Lave → Diso run, dock, reload page, continue with correct credits/fuel/cargo/market |

**Ordering rationale (non-obvious parts):**
- *Loop before content*: content types are shaped by how the sim consumes them; building the compiler first tends to produce a schema that mirrors the plist instead of the game.
- *Renderer before flight*: flight tuning is subjective and requires a correct scene; also, the floating-origin pass must exist before anyone writes a shader that assumes world-space positions.
- *Save last*: schema v1 should describe settled state. Do design the envelope early (phase 1 can serialize a trivial state) but finalise fields after economy is done.
- *Hyperspace math early, hyperspace presentation late*: the distance/fuel rule is pure and needed by the chart screen in phase 6; the tunnel/scene swap is presentation and depends on the scene manager.

## Testing Strategy

| Layer | Tool | What is tested | Notes |
|-------|------|----------------|-------|
| `sim/math` | Vitest (node) | vec/quat algebra, normalisation, rotate-vector, PRNG reproducibility | Property tests (fast-check) for `normalize`, `q * q⁻¹ = identity`, angle wrap |
| `sim/flight` | Vitest | Rate slew at 120 Hz; quaternion integration; speed accel (`5 * thrust`); no yaw; a recorded per-tick input log reproduces the same state regardless of frame pacing | Golden fixtures with expected numeric poses at t=1 s, 5 s |
| `sim/economy` | Vitest | Price/quantity formula against hand-computed Lave values; buy/sell guards; integer-only money | Include the `trunc` behaviour; assert no floats in stored credits |
| `sim/navigation` | Vitest | Hyperspace distance table (Lave→Diso 3.6 ly, Lave→Zaonce 5.6 ly), fuel cost, range guard | Table-driven fixtures generated from `planetinfo` once and frozen |
| `sim/docking` | Vitest | Corridor inclusion/exclusion cases, rotated station, approach from behind, oversized ship | Pure geometry; no renderer |
| `sim/save` | Vitest | Round-trip, every migration fixture, unknown-version refusal, corrupted JSON | One fixture per historical schema version, never deleted |
| `tools/oolite-data` | Vitest | Parser fixtures (comments, escapes, nested arrays, `like_ship` cycle), `.dat` triangle truncation, UV normalisation | Also runs the full upstream files once in CI |
| Determinism | Vitest | Record `(tick, InputFrame, Command[])`; replay and hash state; replay with shuffled frame pacing using the same tick log | Fails loudly on any `Math.random`/`Date` leak (lint rule + test) |
| UI wiring | Vitest + jsdom | Command emission, view-model derivation, keyboard navigation | No WebGL needed |
| Persistence | Vitest + `fake-indexeddb` | Slot write/read, autosave overwrite, quota error path | |
| Render + end-to-end | Playwright (Chromium; Firefox/Safari nightly) | Boot, launch, dock, trade, jump, save, reload; screenshot smoke at a fixed seed; console/WebGL error capture; `renderer.info.memory` returns to baseline after scene swap | Keep the suite small and deterministic; run WebGL with SwiftShader in CI |

**What must not need a browser:** every rule in `sim/`. If a test needs WebGL to verify a game rule, the rule has leaked into the renderer.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Oolite upstream data | Build-time only: pinned submodule/tarball under `content/oolite/` | GPL-2.0-or-later code, CC BY-NC-SA assets; record commit + attribution in `manifest.json` |
| npm registry | Build-time dependencies | `three`, `vite`, `vitest`, `playwright`, `fake-indexeddb`; no runtime CDN |
| WebGL2 / WebGLRenderer | Runtime, local | Requires `logarithmicDepthBuffer`; no compute shaders, no WebGPU dependency |
| IndexedDB | Runtime, local | No network; export/import file is the portability escape hatch |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `sim` → `app` | Return values + `SimEvent[]` | Sim has no callbacks, no promises, no imports from outside `sim`/`content` |
| `app` → `sim` | `step(state, inputFrame, commands, DT, events)` | One entry point; commands are plain data |
| `ui` → `app` | `Command` objects only | UI never mutates `GameState`; view models are derived copies |
| `app` → `render` | `scene.sync(prevPose, state, alpha)` + lifecycle calls | Renderer may read state; never writes |
| `input` → `app` | `InputFrame` + discrete actions | Abstraction allows a future touch/gamepad source without sim changes |
| `app` → `persistence` | `SaveEnvelope` in/out | Migrations live in `sim/save`; storage knows nothing about game types |
| `content` → `sim` | Frozen typed objects | Generated at build; validated by `content/index.ts` integrity assertions at startup |

## Sources

- Oolite source, `github.com/OoliteProject/oolite` (read at `master`):
  - `src/Core/Entities/Entity.h` — `SCANNER_MAX_RANGE 25600.0`
  - `src/Core/Entities/PlanetEntity.m` — `collision_radius = radius_km * 10.0` ("scale down by a factor of 100")
  - `src/Core/Universe.m` — `planet_distance` default 500,000; sun distance `planet_radius * 20`; station at `planet - station_vector * 2 * planet_radius`
  - `src/Core/Entities/ShipEntity.m`, `ShipEntity.h` — `SHIP_THRUST_FACTOR 5.0`; `applyThrust:`; `applyRoll:andClimb:`
  - `src/Core/Entities/PlayerEntityControls.m` — rate slewing with `roll_delta = 2 * max_flight_roll`, `ROLL_DAMPING_FACTOR 1.0`
  - `src/Core/Entities/PlayerEntity.m` — `fuelRequiredForJump = 10 * max(0.1, distance)`; save dictionary + checksum
  - `src/Core/legacy_random.h` — `distanceBetweenPlanetPositions = 0.4 * (int)sqrt(dx² + (dy/2)²)`
  - `src/Core/OOCommodities.m` — `generatePriceForGood`, `generateQuantityForGood`, `economicBiasForGood`, `MAIN_SYSTEM_MARKET_LIMIT 127`
  - `src/Core/Entities/DockEntity.m` — `shipIsInDockingCorridor:` (AABB in dock space, port dimensions, facing test)
  - `src/Core/OOMesh.m` — `.dat` grammar (`NVERTS/NFACES/VERTEX/FACES/TEXTURES/NAMES/NORMALS/END`), triangle truncation, UV normalisation
  - `src/Core/Tables/OOEntityStatus.tbl` — player status enum mirrored by the mode machine
  - `Resources/Config/planetinfo.plist` — 2,048 system entries (8 × 256), including Lave (galaxy 0, system 7)
  - `Resources/Config/shipdata.plist` — Cobra Mk III (350 m/s, thrust 32, pitch 1.0, roll 2.0, cargo 20), Coriolis station + dock subentity
  - `Resources/Config/equipment.plist` — Docking Computers `EQ_DOCK_COMP`, tech level 9, 15,000 decicredits
  - `Resources/Models/cobra3_redux.dat`, `oolite_coriolis.dat`, `oolite_coriolis_dock.dat` — real mesh fixtures
  - `Resources/Scenarios/*.oolite-save` — real save files
- Three.js r187: `src/renderers/WebGLRenderer.js` (`logarithmicDepthBuffer`, `reversedDepthBuffer` via `EXT_clip_control`); `src/core/Object3D.js` (float64 `matrixWorld` computed in JS before float32 upload).
- Gaffer On Games, "Fix Your Timestep!" — accumulator loop, step clamping, interpolation alpha. <https://gafferongames.com/post/fix_your_timestep/>
- Oolite wiki (background/flight feel), used only to corroborate source reading, never as the primary numeric source.

---

*Architecture research for: Wegolite (browser Oolite port)*
*Researched: 2026-11-02*


