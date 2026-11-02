# Stack Research

**Domain:** Browser-based 3D space-trading game (faithful Oolite core port)
**Researched:** 2026-11-02
**Confidence:** HIGH for versions and the core stack; MEDIUM for the Oolite ingestion pipeline effort

**Verdict on the leading candidate:** TypeScript + Three.js on WebGL2 + Vite + Vitest is the correct stack for this project. The pressure test changes three details: use Three's `WebGLRenderer`, not `WebGPURenderer`; do not parse Oolite's OpenStep plists with an XML plist package; and convert `.dat`/`.plist` assets to GLB/JSON at build time rather than at runtime. Add Playwright for the browser/WebGL test seam and IndexedDB for saves. The only tooling wrinkle is TypeScript 7's missing compiler API, which the TypeScript team solves with a two-alias setup documented below.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TypeScript (CLI) | 7.0.2 | Type-checking (`tsc --noEmit`) | Native Go compiler released 2026-07-08; 8-12x faster than TS 6 on real codebases. Use it for the fast feedback loop. **Confidence: HIGH** |
| TypeScript (tooling API) | 6.0.2 (`npm:@typescript/typescript6`) | API surface for typescript-eslint | TS 7.0 ships **no programmatic API**, and typescript-eslint's peer range is `>=4.8.4 <6.1.0`. The TypeScript team explicitly recommends this dual-alias setup. **Confidence: HIGH** |
| Three.js | 0.187.0 | WebGL2 renderer, scene graph, math, GLTFLoader | Released 2026-10-30. It is a renderer, not an engine: you keep ownership of the loop, simulation, and scene composition. MIT. 129 KB gzip for `three.module.js` (measured 2026-11-02). **Confidence: HIGH** |
| WebGL2 via `WebGLRenderer` | Browser API | GPU rendering baseline | Universal on the target browsers: Chrome 56+, Firefox 51+, Safari 15+ (MDN BCD). Three's own manual calls `WebGLRenderer` "the recommended choice for pure WebGL 2 applications" as of r187. **Confidence: HIGH** |
| Vite | 8.3.5 | Dev server and production bundling | Vite 8 (2026-03-12) replaced esbuild+Rollup with Rolldown, is 10-30x faster on production builds, and keeps the Rollup plugin API. It is the current stable default, not a beta. **Confidence: HIGH** |
| Vitest | 5.0.5 | Unit and browser tests | Released 2026-09-03. Same Vite pipeline, fast Node projects, and first-class Browser Mode with Playwright. Requires Vite >=6.4 and Node >=22.12. **Confidence: HIGH** |
| Node.js | 24.x LTS (or 26.x) | Build/test tooling | Vite 8 requires 20.19+/22.12+; Vitest 5 requires 22.12+/24/26. Node 24 LTS is the safest team baseline. Avoid Node 25 (not in Vitest's supported range). **Confidence: HIGH** |
| glTF 2.0 binary (`.glb`) | 2.0 | Runtime model format | Standard, loader already in `three/addons`, validates in external tools, supports PBR materials and embedded textures. Generated at build time, never authored by hand. **Confidence: HIGH** |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | 4.6.7 | Runtime schema validation and typed parsing | At every trust boundary: generated Oolite JSON, the asset manifest, and loaded save files. Do not use it in the per-frame simulation loop. **Confidence: HIGH** |
| idb-keyval | 6.3.0 | Promise-based IndexedDB wrapper | Save slots and autosave. ~600 bytes, no schema layer, structured-clone values. Apache-2.0; compatible with this project because GPL-2.0-or-later can be distributed as GPLv3. **Confidence: HIGH** |
| @gltf-transform/core | 4.5.1 | Build-time GLB authoring and validation | Used only by `tools/oolite-ingest` to emit one `.glb` per ship/station with materials, textures, and `extras`. Not a runtime dependency. MIT. **Confidence: HIGH** |
| @playwright/test | 1.64.1 | End-to-end browser tests | One critical-path test: load, launch, fly, dock, save, reload. Also the browser provider underneath Vitest Browser Mode. **Confidence: HIGH** |
| fast-check | 4.10.2 | Property-based tests | Quaternion/vector invariants, market price monotonicity, save round-trips. Use selectively; it complements example-based Vitest tests, it does not replace them. **Confidence: HIGH** |
| @vitest/coverage-v8 | 5.0.5 | Coverage | Must match the Vitest version exactly. Enforce high coverage on `src/sim/**`, not on rendering glue. **Confidence: HIGH** |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| ESLint | 10.14.0 | Flat config. Pair with `typescript-eslint` 8.72.1 (supports ESLint 10) and `eslint-config-prettier` 10.1.8. **Confidence: HIGH** |
| typescript-eslint | 8.72.1 | Type-aware linting | Peer range is `typescript >=4.8.4 <6.1.0`, which is why the `typescript` package must resolve to 6.0.2. **Confidence: HIGH** |
| Prettier | 3.9.10 | Formatting | Single formatter; no ESLint stylistic rules. **Confidence: HIGH** |
| tsx | 4.23.15 | Run the build-time TypeScript converter | Avoids depending on Node's type-stripping edge cases while the converter grows. **Confidence: HIGH** |
| @types/node | 24.19.2 | Node typings | Match the Node 24 LTS baseline, not the newest 26.x typings. **Confidence: HIGH** |
| @types/three | 0.187.0 | Three typings | Must match `three` exactly; Three does not follow semver, so a mismatched minor will produce wrong types. **Confidence: HIGH** |

## Installation

```bash
# Runtime
npm install three@0.187.0 zod@4.6.7 idb-keyval@6.3.0

# Dev/build/test
npm install -D \
  vite@8.3.5 vitest@5.0.5 @vitest/coverage-v8@5.0.5 \
  @vitest/browser-playwright@5.0.5 @playwright/test@1.64.1 \
  typescript@npm:@typescript/typescript6@6.0.2 \
  @typescript/native@npm:typescript@7.0.2 \
  @types/three@0.187.0 @types/node@24.19.2 \
  eslint@10.14.0 @eslint/js@10.0.1 typescript-eslint@8.72.1 \
  eslint-config-prettier@10.1.8 prettier@3.9.10 globals@17.14.0 \
  @gltf-transform/core@4.5.1 tsx@4.23.15 fast-check@4.10.2

# One-time browser install
npx playwright install chromium
```

### Recommended `package.json`

```json
{
  "name": "wegolite",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "engines": { "node": "^24.0.0 || ^26.0.0" },
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:browser": "vitest run --project browser",
    "test:e2e": "playwright test",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "assets:build": "tsx tools/oolite-ingest/cli.ts",
    "assets:verify": "tsx tools/oolite-ingest/cli.ts --check"
  },
  "dependencies": {
    "idb-keyval": "6.3.0",
    "three": "0.187.0",
    "zod": "4.6.7"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "@gltf-transform/core": "4.5.1",
    "@playwright/test": "1.64.1",
    "@types/node": "24.19.2",
    "@types/three": "0.187.0",
    "@typescript/native": "npm:typescript@7.0.2",
    "@vitest/browser-playwright": "5.0.5",
    "@vitest/coverage-v8": "5.0.5",
    "eslint": "10.14.0",
    "eslint-config-prettier": "10.1.8",
    "fast-check": "4.10.2",
    "globals": "17.14.0",
    "prettier": "3.9.10",
    "tsx": "4.23.15",
    "typescript": "npm:@typescript/typescript6@6.0.2",
    "typescript-eslint": "8.72.1",
    "vite": "8.3.5",
    "vitest": "5.0.5"
  }
}
```

Pin every version exactly and commit `package-lock.json`. Three.js ships a minor every 4-6 weeks and removes deprecated APIs on a schedule; upgrade deliberately after reading its migration guide, not on a floating range.

### Do Not Add Yet

| Package | Why Not Yet | Revisit When |
|---------|-------------|--------------|
| React / Preact / React Three Fiber | Reconciliation and a component tree add indirection to a canvas app that has 4-6 static station screens. R3F is specifically the wrong layer for a hand-written fixed-step simulation. | Station screens exceed roughly 8 and manual DOM updates become tangled; then add Preact for the DOM layer only. |
| Babylon.js / PlayCanvas | Full engines with their own loop, scene ownership, GUI, physics, and audio. That is the abstraction the project constraints explicitly reject, and `@babylonjs/core` is 73 MB unpacked versus Three's 21 MB. | You decide you want an editor-driven pipeline and are willing to let the engine own the frame loop. |
| `WebGPURenderer` | Three's r187 manual still calls it "experimental"; it requires TSL/node materials and drops `ShaderMaterial`/`onBeforeCompile`. WebGPU is still missing on Firefox Linux and Intel Macs, and v1 has no compute workload. | You need compute shaders or many dynamic lights, and you can drop Firefox-on-Linux support. |
| Physics engine (Rapier, Cannon, Ammo) | v1 needs a custom Elite flight model and one docking-port overlap test, not rigid-body dynamics. A physics engine would fight the flight model and add a WASM download. | v2 combat/collisions require debris, impulses, or complex collision shapes. |
| Howler / Tone.js | Audio is out of scope in v1. Howler's value is format fallback and unlock handling; on desktop the native Web Audio API covers a handful of one-shots. | Audio phase starts; prefer native Web Audio, and only add Howler if sprite/format fallback becomes a real problem. |
| `plist` (npm) | It parses XML/binary plists. Oolite's config files are OpenStep/NeXTSTEP plists with `//` and `/* */` comments, unquoted keys, and `yes`/`no`; this package will fail on them. | Never for Oolite data. Use the in-repo OpenStep parser. |
| `three-stdlib` | A third-party grab bag of addons that duplicates `three/addons`. Version skew with Three is a recurring source of type/runtime bugs. | Never as a default; import from `three/addons/*`. |
| Draco / Meshopt / KTX2 | Oolite ship models are small (Cobra Mk III: 1,548 vertices, 1,076 faces) and textures are already PNG. Compression adds decoder WASM and pipeline complexity for no measurable v1 win. | Model/texture payload exceeds roughly 20 MB or load time exceeds 2 s on a mid-range laptop. |
| Zustand / Redux / XState | The simulation is the source of truth. A UI store library encourages duplicating simulation state into the UI and then synchronizing it. | The station UI genuinely needs cross-screen derived state; then use `zustand/vanilla` 5.0.16, not React bindings. |
| Tailwind / CSS-in-JS | Four station screens and one HUD do not justify a build-time CSS framework. Plain CSS with custom properties is smaller and easier to theme like Oolite's UI. | The UI grows into a design system with many contributors. |
| `uuid`, `lodash`, `date-fns` | `crypto.randomUUID()`, native array/object methods, and `performance.now()` cover the needs. Each dependency is permanent surface area. | A concrete missing primitive appears. |
| PWA / service worker | Static hosting already gives zero-install access. Offline caching adds cache-invalidation bugs before the game loop is stable. | v1 is playable and offline install becomes a real user request. |

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Three.js 0.187.0 (`WebGLRenderer`) | Babylon.js 9.33.1 | You want a batteries-included engine: GUI, audio, physics, inspector, and a scene graph with an engine-owned render loop. It is a legitimate choice for a game, but it conflicts with "simulation separable from rendering" and adds a large dependency surface. **Confidence: HIGH** |
| Three.js `WebGLRenderer` | Three.js `WebGPURenderer` | You specifically need compute shaders, TSL node materials, or WebGPU-only features, and you accept that Firefox on Linux/Intel Mac is unsupported. The automatic WebGL2 fallback is real, but it is a second renderer with its own material constraints, not a free upgrade. **Confidence: HIGH** |
| Three.js | Raw WebGL2 | You want a sub-50 KB renderer and are prepared to write shader compilation, buffer layouts, matrix stacks, texture upload, and a glTF loader yourself. Not justified for roughly ten ship/station meshes. **Confidence: HIGH** |
| Three.js | PlayCanvas | You want a browser editor and collaborative scene workflow. It is editor-first; the runtime is an engine, not a thin renderer. **Confidence: MEDIUM** |
| In-repo simulation math (`Vec3`, `Quat`, `Mat3`) | gl-matrix 3.4.4 | The simulation grows into heavy matrix work or you need typed-array math for thousands of entities. Today the sim needs roughly 200 lines of math; importing Three's `Vector3`/`Quaternion` would couple the sim to the renderer and pull Three into unit tests. **Confidence: HIGH** |
| Plain DOM + CSS for station screens | Preact + signals | The station UI grows past ~8 screens with shared derived state. Preact is preferable to React here: ~4 KB, no synthetic-event layer, and no incentive to wrap the canvas. **Confidence: MEDIUM** |
| IndexedDB via idb-keyval | `localStorage` | The save is a single small JSON blob and you want synchronous simplicity. Do not choose it for the main save: it is synchronous on the main thread, string-only, and typically capped near 5 MB. **Confidence: HIGH** |
| IndexedDB via idb-keyval | `idb` 8.0.4 / Dexie 4.4.7 | You need multi-store transactions, indexes, or schema migrations at the database level. `idb` is ISC (GPL-2.0 compatibility is simpler than Apache-2.0); Dexie is Apache-2.0 and heavier. **Confidence: HIGH** |
| Build-time `.dat` -> `.glb` | Runtime `.dat` parser | You want to ship Oolite assets byte-for-byte and support a model-viewer/debug mode. Runtime parsing also means parsing, winding repair, and normal generation on the player's main thread. **Confidence: MEDIUM** |
| In-repo OpenStep plist parser | `@plist/openstep.parse` 1.1.1 | You want to avoid writing a parser and accept a small, low-traffic dependency (BSD-3-Clause-Clear). Verify it handles Oolite's comments, trailing commas, and `yes`/`no` before relying on it. **Confidence: MEDIUM** |
| Vitest 5.0.5 | Jest 30 + ts-jest | You have an existing Jest suite. For greenfield TypeScript with Vite, Jest adds ESM/transform configuration and a second module pipeline for no benefit. **Confidence: HIGH** |
| Playwright 1.64.1 | Cypress | Your team already knows Cypress. Playwright has better multi-browser support, is the provider for Vitest Browser Mode, and handles WebGL/headless Chromium well. **Confidence: HIGH** |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `WebGPURenderer` for v1 | Three's r187 manual (2026-10-30) says it is "still in an experimental state" and that you may hit missing features or better performance with `WebGLRenderer`. It also requires TSL for custom materials. | `WebGLRenderer` behind a `RendererPort` interface; migrate later if a concrete need appears. |
| `plist@5.0.0` | XML/binary plist parser; Oolite uses OpenStep syntax. It will throw on the first `"oolite_template_adder" = { ... };` block. | In-repo `tools/oolite-ingest/openstep.ts`, with fixtures copied from Oolite. |
| Parsing `.dat` or `.plist` at runtime | Moves format quirks, validation, and normal generation into the browser; makes startup slower and CI unable to catch bad assets. | Build-time converter to GLB/JSON, validated in CI. |
| Three's `Vector3`/`Quaternion` inside `src/sim/**` | Couples the simulation to a rendering library; makes pure Node tests import the renderer; encourages mutable shared state. | In-repo math module. Enforce with ESLint `no-restricted-imports`. |
| A physics engine for flight/docking | Elite flight is a hand-tuned kinematic model, not rigid-body physics. A solver will fight the constants you port from Oolite. | Fixed-step kinematics plus explicit docking-port overlap tests. |
| Canvas-rendered station UI | You would need a font atlas, text layout, hit testing, focus management, and accessibility from scratch. It also competes with the 3D scene for GPU/CPU budget. | DOM tables/forms over the canvas, with CSS. |
| `localStorage` for the main save | Synchronous main-thread writes, ~5 MB cap, string serialization, and easy to clear accidentally. | IndexedDB (`idb-keyval`). |
| Floating versions (`^`, `~`) for Three/Vitest | Three has no semver and removes deprecated APIs; Vitest browser packages peer-pin exact versions. Floating ranges create unreproducible builds. | Exact pins plus a lockfile and deliberate upgrades. |
| `@types/three` at a different minor than `three` | Three's type surface tracks internals closely; a mismatch produces plausible-looking but wrong types. | Keep both at `0.187.0`. |
| React Three Fiber for the flight view | Declarative reconciliation per frame is the wrong tool for a fixed-step sim with a single camera and a handful of meshes. | Imperative Three scene driven by a render adapter. |
| `gl-matrix` by default | It is fast and MIT, but its mutable out-parameter API makes the flight model harder to read and test than a small immutable `Vec3`/`Quat` module. | In-repo math; adopt gl-matrix only if profiling demands it. |
| `three-stdlib` / `drei` | Duplicates or wraps `three/addons`; version skew and extra abstraction. | `three/addons/loaders/GLTFLoader.js`. |

## Stack Patterns by Variant

**If you need WebGPU later (compute, many lights, TSL effects):**
- Keep the simulation untouched and swap only the render adapter: `WebGLRenderer` -> `WebGPURenderer` from `three/webgpu`.
- Because `ShaderMaterial`/`onBeforeCompile` are unsupported there, keep v1 materials to `MeshStandardMaterial`/`MeshPhongMaterial` and avoid custom GLSL until the port is justified.
- Budget a real migration: TSL materials, `renderAsync`, and a different post-processing stack. Do not assume "automatic fallback" means zero code changes.

**If the station UI outgrows plain DOM:**
- Add Preact 10 + `@preact/signals-core` for the DOM layer only. The canvas remains outside the component tree.
- Keep the command boundary: UI dispatches `Buy`, `Sell`, `Launch`, `Hyperspace`; it never mutates simulation objects directly.

**If saves outgrow idb-keyval:**
- Move to `idb@8.0.4` (ISC) for explicit transactions and indexes. Keep the same versioned save schema and zod validation at the boundary.
- Store one record per slot plus a small `meta` record; write the new save before deleting the old one.

**If asset payload grows:**
- Add Meshopt or Draco for geometry and KTX2/Basis for textures, in that order. Measure first: the v1 core set is small.
- Keep the raw Oolite files and the converter in-repo so the generated assets remain reproducible.

**If mobile/touch is added:**
- Keep the existing `InputSource` and `Screen` interfaces; add a touch source and responsive CSS.
- Lower the DPR cap and disable MSAA on low-end devices; do not fork the simulation.

## Asset Pipeline

The pipeline is **build-time, deterministic, and validated in CI**. Runtime only loads JSON and GLB.

```
Oolite Resources/                 tools/oolite-ingest/                 public/
  Config/*.plist        ---->      openstep.ts  (parser)      ---->  data/*.json
  Models/*.dat          ---->      dat.ts       (parser)      ---->  models/*.glb
  Textures/*.png        ---->      gltf.ts      (writer)      ---->  textures/*.png
  Sounds/*.ogg          ---->      audio.ts     (later)       ---->  audio/*.m4a
```

### 1. OpenStep plist parsing (build time)

Oolite's `shipdata.plist` is not XML. It is an OpenStep/NeXTSTEP property list:

```text
"oolite_template_cobra3" =
{
    max_flight_pitch = 1;
    max_flight_roll = 2;
    model = "oolite_cobra3.dat";
    materials = { "Hull" = { diffuse_map = "oolite_cobra3_diffuse.png"; }; };
    like_ship = "oolite_template_adder";
};
```

The parser must handle:
- `//` line comments and `/* ... */` block comments (Oolite uses both).
- Unquoted keys and values, quoted strings with escapes, `yes`/`no`, numbers, and `<hex>` data.
- Dictionaries `{ key = value; }`, arrays `( a, b, c )`, and trailing commas (present in Oolite files).
- Duplicate keys and later-file overrides (`shipdata-overrides.plist`).
- `like_ship` inheritance, resolved **after** parsing, with cycle detection. Do not resolve during parse.
- Oolite's loose typing: `station_roll = "0.08";` is a string; `specular_color = (0.2, 0.2, 0.2);` is an array; colors can be `{ hue = 60; }`. Normalize with zod at the boundary, keep the raw value in `extras`.

Do not use `plist@5.0.0`. If you want a library, `@plist/openstep.parse@1.1.1` is the closest fit, but a ~250-line in-repo recursive-descent parser is easy to test and avoids a low-traffic dependency in a GPL project.

### 2. Oolite `.dat` parsing (build time)

The format is ASCII and is parsed by Oolite's `OOMesh.m`. The exact grammar is:

```text
NVERTS 1548
NFACES 1076

VERTEX
x y z            (NVERTS lines)

FACES
smoothGroup nx ny nz vertexCount i0 i1 i2 ...   (NFACES lines)

TEXTURES
materialName maxX maxY s0 t0 s1 t1 s2 t2       (NFACES lines, optional)
```

Critical fidelity details:
- The first three integers on a `FACES` line are a color/smooth group; Oolite stores the first as `smoothGroup`. The next three floats are the face normal (normalized by Oolite). Then the vertex count and 0-based indices.
- If `vertexCount > 3`, **Oolite uses only the first three vertices**; it does not fan-triangulate. Mirror that behavior, or you will render geometry the original game does not.
- `TEXTURES` is optional. When absent, Oolite assigns a placeholder material and the UVs are not meaningful. Detect this and use a solid material or generate UVs; do not emit garbage UVs.
- Optional `NAMES`, `NORMALS`, and `TANGENTS` sections may follow (`OOMesh.m` parses them). Handle or explicitly reject them, and do not let them silently shift the scanner position.
- `TEXTURES` stores per-face `s,t` divided by `maxX`/`maxY`. A face's three vertices share one material but have three UV pairs.
- `smooth` in `shipdata.plist` selects per-vertex normals; otherwise Oolite uses per-face normals. Smooth groups decide which faces share vertices. Flat shading is the default look and should be preserved.
- Validate: `indices < NVERTS`, counts match headers, no NaNs, and face winding agrees with the supplied normal. Fix winding in the converter, not at runtime with `DoubleSide`.

### 3. GLB authoring (build time)

Use `@gltf-transform/core` 4.5.1 to write one `.glb` per ship/station:
- Split vertices per face for flat shading, or merge by smooth group when `smooth = yes`.
- Emit one primitive per Oolite material (`Hull`, `Gun`, `Engine`), with `baseColorTexture` and `emissiveTexture`.
- Convert Oolite's `gloss`/`shininess`/`specular_color` approximately to glTF metallic-roughness (`metalness: 0`, `roughness = f(gloss)`), and keep the original values in `extras.oolite` for a later custom material.
- Oolite's `emission_map` often extracts the **alpha channel** of the diffuse texture (`extract_channel = "a"`). glTF has no channel-extract concept. Either bake a separate emissive PNG at build time or omit emission in v1. Do not silently use the diffuse alpha as an emissive map; it will look wrong.
- Preserve Oolite axes and units. Oolite's `shipdata.plist` places forward view offsets on +Z and up on +Y; glTF/Three cameras look down -Z. Pick one convention in the converter, document it, and verify with the Cobra Mk III and the Coriolis docking port. Do not let the loader silently rotate models.
- Write `public/models/manifest.json` mapping `shipKey -> { glb, materials, bounds, dockingPort }`. Validate it with zod at startup and fail loudly if a key is missing.

### 4. Textures and licensing

- Copy PNGs to `public/textures/` with content hashes. At load, set `texture.colorSpace = THREE.SRGBColorSpace` for base color and emissive; leave normal/specular maps in linear space.
- Keep original filenames in `extras` so provenance is traceable.
- Oolite art is CC BY-NC-SA 3.0. The generated GLBs are derivative works and must carry the same license and attribution. Keep them in a clearly separated `public/models/` tree with `LICENSE-oolite.txt`; do not relicense them as MIT. The NC clause makes the combined distribution non-commercial.
- Pin the Oolite source revision in `assets/oolite/SOURCE.md` (repo tag/commit). Record that the current tree calls the commodity file `trade-goods.plist`, not `commodities.plist`.

### 5. CI asset verification

- `npm run assets:build` must be deterministic: same inputs -> byte-identical outputs.
- `npm run assets:verify` re-runs the converter and fails if `git diff --exit-code` finds drift.
- Golden tests: Cobra Mk III face/vertex counts from the `.dat` header, Coriolis bounding box, and a sample of commodity prices. This catches parser regressions before they reach the renderer.

## Application Layers

### Simulation / render boundary

The simulation is pure TypeScript with no DOM, Three, or browser APIs. It emits a plain snapshot; the renderer consumes it.

```ts
// src/sim/loop.ts
export const STEP = 1 / 60;

export interface Sim {
  step(dt: number): void;
  snapshot(alpha: number): WorldSnapshot;
}

// src/main.ts
let acc = 0;
let last = performance.now();

function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  acc += dt;

  let steps = 0;
  while (acc >= STEP && steps++ < 5) {
    sim.step(STEP);
    acc -= STEP;
  }

  renderer.render(sim.snapshot(acc / STEP));
  requestAnimationFrame(frame);
}
```

- No allocations in `step()` or `snapshot()`: reuse scratch vectors and preallocate the snapshot.
- Use a seeded PRNG (e.g. mulberry32) for any simulation randomness; never `Math.random()`.
- Enforce the boundary with ESLint: `no-restricted-imports` forbids `three` and `three/*` under `src/sim/**`.
- The renderer gets an interface (`RendererPort`) with `resize`, `render`, `dispose`. This is also the seam for a future WebGPU backend.

### Station screens: DOM, not canvas

- Use one `<canvas>` for the flight view and a DOM overlay for HUD and station screens.
- Station screens are real `<table>`, `<button>`, and `<form>` elements. This gives you text layout, focus rings, keyboard navigation, and accessibility for free, and keeps GPU budget for the scene.
- In-flight HUD is also DOM: absolutely positioned, `pointer-events: none`, updated with `transform: translate3d()` for the reticle and at 10-20 Hz for numeric text. Do not re-render the whole HUD at 60 Hz.
- Screen contract:

```ts
export interface Screen {
  mount(root: HTMLElement): void;
  update(state: UiState): void;
  unmount(): void;
}
```

- No UI framework in v1. A typed event bus plus explicit `mount/update/unmount` is enough for market, equipment, chart, and status screens. If it grows, add Preact to the DOM layer only.

### Save persistence

- IndexedDB via `idb-keyval` 6.3.0, one key per slot (`save:slot:0..2`) plus `save:meta`.
- Store a versioned envelope and validate with zod on load:

```ts
const SaveV1 = z.object({
  version: z.literal(1),
  savedAt: z.number(),
  commander: CommanderSchema,
  galaxy: z.number().int().min(0).max(7),
  system: z.number().int(),
  market: MarketSchema,
});

type Save = z.infer<typeof SaveV1>;
```

- Migrate explicitly (`migrate(raw): Save`), one version at a time; never mutate a loaded object in place.
- Keep a previous-slot backup; write the new value before deleting the old one.
- `localStorage` is only for `settings.v1` (volume, keybinds, last slot). If IndexedDB is unavailable (private mode), fall back to an in-memory store and warn; do not silently lose the save.
- Add JSON export/import later for portability; no backend is needed.

### Audio (deferred, but design the seam now)

- v1 ships `NullAudio` behind an `AudioPort`; no audio dependency.
- When audio starts, use the native Web Audio API: one `AudioContext` created on first user gesture, gain nodes for master/effects/music, `AudioBufferSourceNode` for one-shots.
- Oolite's sounds are Ogg Vorbis. Safari's Ogg support is not a safe assumption across the desktop baseline, so transcode short one-shots to AAC/M4A at build time (or use WAV for tiny effects) and keep Ogg as an optional source.
- Do not add Howler until format fallback or sprite management is demonstrably needed. Positional audio is unnecessary in v1 and can use `PannerNode` later.

### Testing strategy

Use two Vitest projects plus Playwright, with a strict split by what can be tested deterministically:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'browser',
          include: ['src/ui/**/*.browser.test.ts'],
          browser: {
            enabled: true,
            provider: 'playwright',
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
```

- **Node/Vitest (`unit`)**: flight integration, quaternion/vector invariants, market formula, hyperspace range/fuel, docking-port geometry, OpenStep parser, `.dat` parser, save migrations. These must not import Three or touch the DOM.
- **Browser/Vitest (`browser`)**: station screen mount/update/unmount, keyboard focus, HUD formatting, and a WebGL smoke test that constructs the renderer, loads one GLB, renders one frame, and asserts `renderer.info.render.calls > 0` with no console errors.
- **Playwright (`e2e`)**: the user story end to end. Expose a dev/test-only `window.__wegolite` command API to place the ship near the docking port, set credits, and select a target system; then assert DOM-visible outcomes. Do not use pixel snapshots of the 3D scene; GPU/driver differences make them flaky.
- **Golden tests**: the full 2,048-system market matrix hashed as one fixture, plus per-system price snapshots for a small sample. This catches economy regressions without 2,048 brittle assertions.
- **Coverage**: 90% lines/branches on `src/sim/**` and `tools/oolite-ingest/**`; no threshold on renderer glue. Coverage must not drive you to test Three.js itself.
- **CI**: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npx playwright test`. Cache npm and Playwright browsers. Add Firefox/WebKit smoke runs only after the Chromium path is stable.

### Build and static hosting

```ts
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',                 // subpath-safe; use '/' for a root domain
  build: {
    target: 'es2022',
    sourcemap: true,
    assetsInlineLimit: 4096,
  },
});
```

- `base: './'` works on GitHub Pages project sites and any subpath host. There is no client-side router, so relative asset URLs are safe.
- Emit content-hashed files under `dist/assets/`; serve them with `Cache-Control: public, max-age=31536000, immutable`. Serve `index.html` with `no-cache`.
- GLB and PNG are already compressed; do not gzip/Brotli them again at the origin. Brotli the JS/CSS/HTML.
- No COOP/COEP headers are required: there is no `SharedArrayBuffer`, WASM threads, or worker requirement in v1.
- GitHub Pages, Cloudflare Pages, or Netlify all work. Cloudflare/Netlify support a `_headers` file for the cache policy; GitHub Pages does not, so accept its defaults or front it with a CDN.
- Build output is fully static. No environment variables at runtime, no API calls, no accounts, no telemetry.

## Performance Budget (60 fps)

Target frame: 16.67 ms at 60 fps. Aim for 8 ms CPU + 8 ms GPU at 1080p on integrated graphics, leaving headroom for 120/144 Hz on capable displays.

| Budget | Target | Notes |
|--------|--------|-------|
| Simulation step | <= 2 ms | One ship, one station, no NPCs. If it exceeds 2 ms, something is allocating or iterating the galaxy. |
| Render CPU submission | <= 4 ms | Draw calls, matrix updates, HUD updates. |
| GPU frame | <= 8 ms | No shadows, no post-processing, one directional + ambient/hemisphere light. |
| Draw calls | <= 50 | Ship, station, planet, sun, starfield, a few subentities, HUD. |
| Triangles | <= 250k | Coriolis plus Cobra Mk III is far below this; the budget covers later v2 traffic. |
| Materials | <= 20 | One per Oolite material group; share across instances. |
| VRAM textures | <= 64 MB | Oolite PNGs are modest; use content-hashed copies, mipmaps on. |
| Initial JS | <= 250 KB gzip | Measured Three baseline: 129 KB gzip for `three.module.js`; add app + loader. |
| JS heap | <= 250 MB | Avoid per-frame allocation; pool snapshots and scratch vectors. |
| Pixel ratio | <= 2 | `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`; lower on 4K. |

Implementation rules:
- `WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false })`; no shadow map.
- `renderer.outputColorSpace = THREE.SRGBColorSpace`; choose tone mapping deliberately (Oolite's look is closer to `NoToneMapping`/`LinearToneMapping` than ACES).
- Starfield is one `THREE.Points` object, not thousands of meshes.
- Reuse `Vector3`, `Quaternion`, `Matrix4`, and arrays; no `new` in the frame loop.
- Clamp `dt` and cap catch-up steps (5) to avoid a death spiral after tab restore.
- Pause rendering and simulation on `document.visibilitychange`.
- While docked, render the station background at 30 Hz or pause it; the DOM screens do not need 60 fps.
- Add a dev-only overlay driven by `renderer.info.render` (calls, triangles, geometries, textures) and `performance.now()`; gate it behind `import.meta.env.DEV`.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `three@0.187.0` | `@types/three@0.187.0` | Exact match required. Three's versioning is `0.x`; do not use `^`. |
| `vite@8.3.5` | `vitest@5.0.5` | Vitest 5 requires Vite >=6.4 and supports Vite 8. |
| `vitest@5.0.5` | `@vitest/browser-playwright@5.0.5` | Exact peer pin. The current npm `latest` for the browser package is 5.1.0 and peers `vitest@5.1.0`; do not let it float ahead. |
| `vitest@5.0.5` | `@vitest/coverage-v8@5.0.5` | Exact version match. |
| `vitest@5.0.5` | Node `^22.12.0 || ^24.0.0 || >=26.0.0` | Node 25 is not supported. Use Node 24 LTS or 26 current. |
| `vite@8.3.5` | Node `^20.19.0 || >=22.12.0` | Vite 8 is ESM-only. |
| `typescript-eslint@8.72.1` | `typescript@6.0.2` | Peer range `>=4.8.4 <6.1.0`. This is why `typescript` is aliased to `@typescript/typescript6`. |
| `typescript-eslint@8.72.1` | `eslint@10.14.0` | Peer supports `^8.57 || ^9 || ^10`. |
| `typescript@7.0.2` (as `@typescript/native`) | Tooling via `typescript@6.0.2` | TS 7 has no programmatic API. The aliases give you `tsc` (7) and `tsc6` (6) side by side. |
| `@playwright/test@1.64.1` | Node >=20 | Playwright browsers are installed separately (`npx playwright install chromium`). |
| `three@0.187.0` | WebGL2 | Chrome 56+, Firefox 51+, Safari 15+. WebGPU would require Chrome 144+, Safari 26+, and Firefox 141+ with no Linux or Intel-Mac support (MDN BCD, 2026-11-02). |
| `idb-keyval@6.3.0` (Apache-2.0) | GPL-2.0-or-later project | Apache-2.0 is compatible with GPLv3, and GPL-2.0-or-later permits GPLv3 distribution. If you ever pin the project to GPL-2.0-only, replace it with `idb@8.0.4` (ISC). |
| Oolite art (CC BY-NC-SA 3.0) | Project code (GPL-2.0-or-later) | Keep them as separate works with separate license files. Generated GLBs are derivatives under CC BY-NC-SA 3.0; the combined distribution is non-commercial. |

## Open Questions

- **Oolite revision pin:** choose a specific Oolite release tag/commit and record it in `assets/oolite/SOURCE.md`. The config filenames have drifted (`trade-goods.plist` now, not `commodities.plist`), so "latest master" is not a reproducible input.
- **Material fidelity:** decide whether v1 ships approximate metallic-roughness materials or a custom Oolite-style Phong material. The converter can preserve `gloss`, `shininess`, `specular_color`, and `emission_modulate_color` in `extras` either way; the runtime decision affects visual fidelity, not the pipeline.
- **Safari GPU performance:** WebGL2 is supported, but integrated-GPU performance on older Intel Macs has not been measured. The empty-space v1 scene should be far below budget; verify on the oldest supported machine before adding v2 traffic.
- **Docking tolerance:** the manual docking test needs playtesting to tune the port overlap and alignment thresholds. Keep them as data, not hard-coded constants.

## Sources

- Three.js r187 release notes (2026-10-30) — https://github.com/mrdoob/three.js/releases/tag/r187 — version and API changes. **HIGH**
- Three.js r187 manual, "WebGPURenderer" — https://github.com/mrdoob/three.js/blob/r187/manual/pages/webgpurenderer.html — exact wording: WebGPURenderer "still in an experimental state"; WebGLRenderer "recommended choice for pure WebGL 2 applications"; no large new features planned for WebGLRenderer. **HIGH**
- Three.js r187 `docs/pages/WebGLRenderer.html.md` — WebGL 2 only since r163. **HIGH**
- MDN browser-compat-data, `api/WebGL2RenderingContext.json` and `api/GPU.json` (retrieved 2026-11-02) — WebGL2 Chrome 56 / Firefox 51 / Safari 15; WebGPU Chrome 144, Firefox 141 partial (no Linux, no Intel Mac), Safari 26. **HIGH**
- Vite 8 announcement (2026-03-12) — https://vite.dev/blog/announcing-vite8 — Rolldown default, 10-30x faster builds, Node requirements. **HIGH**
- Vitest 5 announcement (2026-09-03) — https://vitest.dev/blog/vitest-5 — Vite >=6.4, Node >=22.12, Browser Mode, trace view, exact peer versions. **HIGH**
- TypeScript 7.0 announcement (2026-07-08) — https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/ — native compiler, no API in 7.0, official `@typescript/typescript6` + `@typescript/native` alias recipe. **HIGH**
- npm registry queries (2026-11-02) — exact versions for `three`, `@types/three`, `vite`, `vitest`, `typescript`, `eslint`, `typescript-eslint`, `@playwright/test`, `@gltf-transform/core`, `zod`, `idb-keyval`, `fast-check`; licenses; package sizes. **HIGH**
- Three.js `three.module.js@0.187.0` measured via unpkg/gzip (2026-11-02) — 658,900 bytes raw, 129,337 bytes gzip. **HIGH**
- Oolite `src/Core/OOMesh.m` (master) — exact `.dat` grammar: `NVERTS`, `NFACES`, `VERTEX`, `FACES` (smooth group, normal, count, indices; >3 vertices truncated to first three), optional `TEXTURES` (material, maxX/maxY, per-vertex s/t). **HIGH**
- Oolite `Resources/Config/shipdata.plist` (master) — confirms OpenStep syntax, comments, `like_ship`, `materials`, `smooth`, model/texture keys. **HIGH**
- Oolite `Resources/Config/planetinfo.plist` (master) — 2,050 system entries with names, economy, government, coordinates; the eight-galaxy data is present. **HIGH**
- Oolite `Resources/Config/trade-goods.plist` (master) — current commodity filename; `commodities.plist` is not present in the current tree. **HIGH**
- Oolite `Resources/Sounds/*.ogg` (master) — audio assets are Ogg Vorbis; plan a Safari transcode when audio starts. **HIGH**
- npm `@babylonjs/core@9.33.1` unpacked size 73,335,492 bytes vs `three@0.187.0` 21,030,536 bytes (2026-11-02) — engine footprint comparison, not runtime bundle size. **HIGH**

---
*Stack research for: Wegolite, a browser-based faithful Oolite core port*
*Researched: 2026-11-02*
