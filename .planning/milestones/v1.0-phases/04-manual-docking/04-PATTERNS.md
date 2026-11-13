# Phase 4: Manual Docking - Pattern Map

**Mapped:** 2026-11-04  
**Files analyzed:** 46 planned new/modified files (including the generated dock-port artifact and its golden)  
**Analogs found:** 45 / 46 (one novel collision module has no close in-repo analog)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/sim/dock/geometry.ts` (new) | utility | transform | `src/sim/world/layout.ts` | role-match |
| `src/sim/dock/port-frame.ts` (new) | utility | transform | `src/render/bodies/station.ts`, `src/sim/math.ts` | role-match |
| `src/sim/dock/corridor.ts` (new) | utility | transform | `src/sim/math.ts`, `src/sim/flight/step.ts` | partial |
| `src/sim/dock/hull.ts` (new) | utility | transform | `src/sim/math.ts` | no close analog |
| `src/sim/dock/step.ts` (new) | controller | event-driven | `src/sim/flight/step.ts` | role-match |
| `src/sim/dock/computer.ts` (new) | service | request-response | `src/sim/world/aegis.ts`, `src/sim/flight/launch.ts` | role-match |
| `src/sim/player/profile.ts` (new) | model | CRUD | `src/sim/flight/state.ts`, `src/content/schemas/equipment.ts` | partial |
| `src/sim/flight/state.ts` (modify) | model | transform | same file (`initFlightState`, `serializeFlight`, `hashFlight`) | exact |
| `src/sim/flight/step.ts` (modify) | controller | event-driven | same file (`stepFlight`) | exact |
| `src/sim/commands.ts` (modify) | model | event-driven | same file (`Command`) | exact |
| `src/sim/events.ts` (modify) | model | event-driven | same file (`SimEvent`) | exact |
| `src/persistence/save.ts` (new) | model / utility | transform | `src/settings/schema.ts`, `src/content/schemas/system.ts` | role-match |
| `src/persistence/idb-store.ts` (new) | service | file-I/O | `src/settings/store.ts` | partial (localStorage only; no IDB precedent) |
| `src/persistence/memory-store.ts` (new) | service | file-I/O | `tests/settings/schema.test.ts` `FakeStorage` | role-match |
| `src/content/dock-port.ts` (new) | service | request-response | `src/content/ships.ts` | role-match |
| `src/content/equipment.ts` (new) | service | request-response | `src/content/ships.ts`, `src/content/schemas/equipment.ts` | role-match |
| `tools/oolite-ingest/convert/dock-port.ts` (new) | utility | transform | `tools/oolite-ingest/convert/dat.ts`, `convert/equipment.ts` | role-match |
| `tools/oolite-ingest/generate.ts` (modify) | config / generator | batch | same file (`generateContent`, `readModels`) | exact |
| `src/content/generated/dock-port.json` (generated) | config / data | batch | `src/content/generated/ships.json` | role-match; regenerate only |
| `src/app/dock-feedback.ts` (new) | service | event-driven | `src/app/game-session.ts`, `src/render/hud/messages.ts` | partial |
| `src/app/game-session.ts` (modify) | controller | event-driven | same file (`handleEvent`, `frame`, `renderFrame`) | exact |
| `src/app/mode.ts` (modify) | controller | event-driven | same file (`advanceMode`) | exact |
| `src/app/probe.ts` (modify) | utility | request-response | same file (`WegoliteProbe`, `createTestHook`) | exact |
| `src/app/hud-model.ts` (modify) | utility | transform | same file (`buildHudModel`) | exact |
| `src/render/hud/draw.ts` (modify) | component | transform | same file (`drawHud`) | exact |
| `src/render/launch-camera.ts` (modify) | utility | transform | same file (`computeCockpitCamera`) | exact |
| `src/ui/docked.ts` (modify) | component | request-response | same file (`createDockedPanel`) | exact |
| `src/ui/title.ts` (modify) | component | request-response | same file (`createTitleScreen`) | exact |
| `src/input/actions.ts` (modify) | config | transform | same file (`ActionId`, `DEFAULT_BINDINGS`) | exact |
| `src/input/keyboard.ts` (modify) | controller | event-driven | same file (`createInputState`, `onKeyDown`) | exact |
| `src/main.ts` (modify) | controller / composition root | event-driven | same file (`title.onStart`) | exact |
| `index.html` (modify) | config / component markup | request-response | same file (`#title-screen`, `#docked`) | exact |
| `tests/sim/dock-corridor.test.ts` (new) | test | transform | `tests/sim/aegis.test.ts`, `tests/sim/launch.test.ts` | role-match |
| `tests/sim/dock-cadence.test.ts` (new) | test | transform | `tests/sim/flight-cadence.test.ts` | exact |
| `tests/sim/dock-hull.test.ts` (new) | test | transform | `tests/sim/launch.test.ts` | partial |
| `tests/sim/dock-capture.test.ts` (new) | test | event-driven | `tests/sim/launch.test.ts` | role-match |
| `tests/sim/dock-computer.test.ts` (new) | test | request-response | `tests/sim/aegis.test.ts`, `tests/sim/launch.test.ts` | role-match |
| `tests/sim/dock-no-trap.test.ts` (new) | test | transform | `tests/sim/flight-cadence.test.ts` | partial |
| `tests/sim/player-profile.test.ts` (new) | test | CRUD | `tests/content/player-ship.test.ts` | role-match |
| `tests/persistence/save.test.ts` (new) | test | file-I/O | `tests/settings/schema.test.ts` | role-match |
| `tests/e2e/docking.spec.ts` (new) | test | event-driven | `tests/e2e/launch.spec.ts`, `tests/e2e/flight.spec.ts` | role-match |
| `tests/e2e/autosave.spec.ts` (new) | test | file-I/O | `tests/e2e/launch.spec.ts`, `tests/e2e/helpers/probe.ts` | partial |
| `tests/input/bindings.test.ts` (modify) | test | event-driven | same file (`createInputState`) | exact |
| `tests/settings/schema.test.ts` (modify) | test | CRUD | same file (`mergeDefaults`, fake storage) | exact |
| `tests/helpers/lave.ts` (modify if docking fixture is centralized) | test utility | transform | same file (`laveFixture`) | exact |
| `tests/golden/content/dock-port.json` (new) | test fixture / config | batch | `tests/golden/content/ship-bounds.json` | role-match |

## Pattern Assignments

### `src/sim/dock/*`, `src/sim/flight/{state,step}.ts`, `src/sim/{commands,events}.ts`

**Analog:** `src/sim/flight/step.ts`, `src/sim/flight/launch.ts`, `src/sim/world/aegis.ts`, `src/sim/math.ts`, `src/sim/flight/state.ts`, `src/sim/commands.ts`, `src/sim/events.ts`.

Use the existing pure-simulation style: plain TS values, helper functions return new vectors, state is mutated only by the sim step, and events carry tagged data rather than UI copy. Keep `src/sim/` free of Three.js, DOM, renderer, and generated-content imports; pass a validated `DockGeometry` value from the app/content layer into the step. Keep all state advancement deterministic at the fixed 1/120 s cadence.

**Reusable vector and quaternion vocabulary** (`src/sim/math.ts:31-33, 43-51, 59-68, 92-106`):
```typescript
export function vec(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}
/** Hamilton product `a * b`. */
export function mul(a: Quat, b: Quat): Quat {
  return quat(
    a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  );
}
/** Rotate `v` by the unit quaternion `q`. */
export function rotate(q: Quat, v: Vec3): Vec3 {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return vec(
    v.x + q.w * tx + (q.y * tz - q.z * ty),
    v.y + q.w * ty + (q.z * tx - q.x * tz),
    v.z + q.w * tz + (q.x * ty - q.y * tx),
  );
}
export function add(a: Vec3, b: Vec3): Vec3 { return vec(a.x + b.x, a.y + b.y, a.z + b.z); }
export function sub(a: Vec3, b: Vec3): Vec3 { return vec(a.x - b.x, a.y - b.y, a.z - b.z); }
export function dot(a: Vec3, b: Vec3): number { return a.x * b.x + a.y * b.y + a.z * b.z; }
```
Use these existing helpers rather than importing Three math or introducing duplicate vector APIs. `src/sim/world/layout.ts:92-104` is the validation pattern: throw a named `LayoutError` when a numeric field is not finite; geometry construction must additionally reject non-positive aperture dimensions (the expansion loop otherwise cannot terminate).

**Sim import convention** (`src/sim/flight/step.ts:19-29`):
```typescript
import type { Command } from "../commands.js";
import type { SimEvent } from "../events.js";
import { nextCompassMode, resolveCompassTarget } from "../world/aegis.js";
import type { SystemLayout } from "../world/layout.js";
import { beginLaunch, completeLaunch, stepLaunch } from "./launch.js";
import type { FlightState } from "./state.js";
```
Retain `.js` import specifiers in TS source and use `import type` for erased-only dependencies; no `src/content`, `src/render`, or `src/ui` runtime import belongs in sim.

**Station port frame** (`src/render/bodies/station.ts:201-214` and `src/sim/flight/state.ts:119-124`): renderer roll is `mul(layout.stationBaseQuat, axisAngle(0, 0, 1, stationAngle))`; derive port axes using the same quaternion, with outward normal along Wegolite local `-Z`. Build the origin from station position plus the rotated dock offset (equivalent to `dockMouthPosition`). Compute corners relative to that origin to avoid large-world precision loss. Use `layout.stationRollRadPerSec` (actual converted rate `0.125663706...`); do not substitute the authored `station_roll = 0.08` as radians/sec.

**Step ordering and command handling** (`src/sim/flight/step.ts:51-84, 92-130`):
```typescript
const events: SimEvent[] = [];
const modeAtStart = state.mode;
// Commands are drained once at the fixed-step boundary.
for (const command of commands) {
  switch (command.kind) {
    case "launch":
      if (beginLaunch(state, layout, config)) events.push({ kind: "launched" });
      break;
    // extend this tagged union/switch for dockingComputer
  }
}
// motion runs for inFlight; stationAngle/flightTime/clock update afterward.
if (modeAtStart !== "docked") {
  state.stationAngle += layout.stationRollRadPerSec * dt;
  state.flightTime += dt;
  state.clockSeconds += dt;
}
```
Integrate docking after the station-angle update, using the post-update angle, and only while in flight (not on the launch-entering tick). Capture/bounce state mutations belong in this sim step, not in `game-session.ts`. For a capture, follow the `beginLaunch` conventions (`src/sim/flight/launch.ts:38-57`): guarded mode transition, canonical dock-mouth position, speed/rates reset and exact clock changes only where specified. Add causal transient motion fields (e.g. bounce impulse) to `FlightState` and its init/serialization/hash path if they affect future flight; append canonical fields to `serializeFlight` (`src/sim/flight/state.ts:91-116`). Keep profile credits/equipment outside `FlightState` so economy additions do not churn flight replay hashes.

`Command` and `SimEvent` are intentionally minimal tagged unions (`src/sim/commands.ts:5-19`, `src/sim/events.ts:4-21`). Add `dockingComputer` as a command and `docked`/`scrape`/`bounce`/`dockDenied` events with finite structured payloads and reason enums; presentation strings stay app-owned. `src/sim/world/aegis.ts:34-52` is the exact range predicate to reuse for the computer's aegis gate (inclusive squared-distance comparison); do not duplicate the 51,200-unit radius.

### `src/sim/player/profile.ts`

**Analog:** `src/sim/flight/state.ts:29-51, 63-84, 95-116` for plain state / canonical data; `src/content/schemas/equipment.ts:16-32` for the equipment record and decicredit unit.

Keep `PlayerProfile` pure and separate from flight physics: integer decicredits, allowlisted equipment keys, `canPurchase` and `purchase` as deterministic functions. The generated catalogue says `EQ_DOCK_COMP` costs 15,000 decicredits and requires TL 9. Avoid encoding formatted Cr text in the profile; format only at the UI boundary. CONTEXT requires the TL/credit checks. RESEARCH notes Lave raw TL is 4, so the normal Lave purchase is unavailable; planner should preserve that gate and use only the test seam to exercise an installed computer unless upstream phase decisions resolve otherwise.

### `src/persistence/{save,idb-store,memory-store}.ts`

**Analog:** `src/settings/schema.ts:68-169, 181-210`, `src/settings/store.ts:28-34, 41-73, 75-106`, and the fake-storage test `tests/settings/schema.test.ts:33-65`.

The settings implementation demonstrates versioning, unknown/corrupt-input rejection, best-effort failure behavior, and preservation of a newer version. The save itself differs: use a strict Zod schema with a literal version and the explicitly docked-only v1 fields; keep the parser pure and test it without browser globals. `src/content/schemas/system.ts:25-36` demonstrates schema-owned types (`z.infer`) and strict/open schema choice. `src/settings/store.ts:91-95` establishes the key resilience rule:
```typescript
try {
  storage.setItem(SETTINGS_KEY, JSON.stringify(blob));
} catch {
  // Quota or security denial: the in-memory settings still work.
}
```
The IndexedDB adapter must apply the same non-fatal rule to open/read/write/clear errors and must not block a frame. There is **no IndexedDB or game-save adapter in the current source tree**: treat `SaveStore` as a small injected async port and use `MemorySaveStore` for unit tests, not a new dependency. Keep localStorage settings and IndexedDB saves separate. Future-version data must remain untouched; New game clears only the save.

### `src/content/{dock-port,equipment}.ts`, `tools/oolite-ingest/convert/dock-port.ts`, generator registration

**Analog:** `src/content/ships.ts:19-48, 56-74`, `src/content/schemas/equipment.ts:16-32`, `tools/oolite-ingest/convert/dat.ts:114-124, 708-775`, `tools/oolite-ingest/convert/equipment.ts:180-211, 245-265`, `tools/oolite-ingest/generate.ts:133-158, 166-188`, and `tools/oolite-ingest/manifest.ts:47-80`.

`ships.ts` provides the lazy `?raw` JSON loader and missing-data errors; follow its cached promise and explicit path convention. Validate the new record with Zod (unlike the legacy ship loader's cast). `dat.ts` already exports `boundingBox`, `assertBounds`, and `modelBounds`, and its tracked `MODEL_BOUNDS` already pins the dock mesh at `103.4123 × 241.888 × 250`; reuse those APIs rather than hand-typing sim constants or inspecting GLB at runtime. `convert/equipment.ts` is the closest emitter pattern: validate projection, create canonical JSON bytes, and return `{path, bytes}`. Add the emitter to the `emitted` array in `generateContent`; `buildManifest` hashes/sorts every returned emitted file automatically, so no separate hand-maintained manifest registration is required. Regenerate `src/content/generated/dock-port.json` with the container asset workflow; do not edit generated JSON manually. Golden-test its measured result after axis conversion.

Loader import pattern (`src/content/ships.ts:19-28`):
```typescript
import type { CatalogEntry, ShipCatalogue } from "./schemas/ship.js";
const lazyShips = import.meta.glob("./generated/ships.json", {
  query: "?raw",
  import: "default",
});
```
For the new port/equipment loaders, parse JSON as `unknown`, validate with the matching Zod schema, and report a named missing-file/schema error rather than trusting a cast. The build-side projection's validation/error pattern (`tools/oolite-ingest/convert/equipment.ts:198-211`) is:
```typescript
const result = EquipmentSchema.safeParse(candidate);
if (!result.success) {
  const issue = result.error.issues[0];
  throw contentError("SCHEMA", FILE, issue === undefined ? tuple.key : `${tuple.key}.${issue.path.join(".")}`, {
    excerpt: issue === undefined ? "invalid equipment record" : issue.message,
  });
}
return result.data;
```

### `src/app/dock-feedback.ts`, app session / mode / probe, HUD and camera

**Analog:** `src/app/game-session.ts:291-320, 323-414, 416-501, 549-577`, `src/app/mode.ts:11-35`, `src/app/probe.ts:81-124, 151-172`, `src/render/hud/messages.ts:7-24, 32-66`, `src/app/hud-model.ts:114-137`, `src/render/hud/draw.ts:352-401`, and `src/render/launch-camera.ts:106-118`.

The existing event-to-message boundary is:
```typescript
case "torusEngaged":
  messages.enqueue(`Torus engaged at ${event.factor.toFixed(1)}×`);
  break;
case "massLockChanged":
  if (event.locked) messages.enqueue("Mass locked");
  break;
```
Map new event payloads to fixed app-owned copy here. Scrape can be emitted every correction tick, but throttle its human-readable message against simulation `flightTime` (the queue caps at four; do not flood it at 120 Hz). Keep shake/flash envelopes app-side, clocked by `flightTime`, deterministic and random-free. Add camera offset at the cockpit-pose boundary (`computeCockpitCamera` currently returns ship position plus rotated `COCKPIT_OFFSET`); add a HUD model value and draw its frame overlay in `drawHud`. Expose measured feedback in an additive optional probe field. The probe is published live and its `?test=1` hook is restricted to live state mutation; do not let the hook write saves or arbitrary data.

On `docked`, let `handleEvent` own presentation reactions: show/hide the dock panel, hide HUD, clear held input, reset launch presentation and synchronize interpolated poses to avoid blending across a dock teleport. `FlightState.mode` is the authority. Extend `ModeTransition`/`advanceMode` explicitly: the current two-way implementation handles `launch` then assumes every other transition is `launchComplete`, so simply extending the string union would mis-handle `dock`.

### `src/ui/docked.ts`, `src/ui/title.ts`, `index.html`, `src/main.ts`

**Analog:** `src/ui/docked.ts:17-78`, `src/ui/title.ts:12-51`, `index.html:270-289`, `src/main.ts:191-197`.

Follow the panel's required-field and `data-action` pattern; button handlers use an `AbortController` signal and all dynamic DOM strings go through `textContent` only. Add the single purchase line with the same data-field/action conventions. For title restore, retain `#title-start` as New game for existing specs, add a Continue control only when a validated save exists, and extend the title API with independently registered callbacks. Wire callbacks in the composition root (`main.ts` currently connects `title.onStart(() => { void session.start(); })`). No new screen framework is needed.

### `src/input/actions.ts`, `src/input/keyboard.ts`

**Analog:** `src/input/actions.ts:13-25, 27-40, 53-82`, `src/input/keyboard.ts:29-34, 48-63, 79-94, 152-177`, and `tests/input/bindings.test.ts:146-200`.

Add the semantic action consistently to the ID union, ID list, defaults, labels, and keyboard edge-command map; settings `mergeDefaults` fills absent actions for older settings blobs. Existing `keyDown(code, repeat?)` has no modifier parameter and `onKeyDown` currently filters Ctrl/Meta/Alt but not Shift. Implement Shift+C as a targeted required-modifier action, so plain C does not fire and Shift does not break other bindings. Preserve edge semantics: repeat keydowns do not enqueue another command; test with the DOM-free `createInputState` API.

### Tests: sim, persistence, generator golden, and browser

**Analogs:** `tests/sim/launch.test.ts:25-47, 76-115`, `tests/sim/flight-cadence.test.ts:14-31, 44-50, 52-101`, `tests/sim/aegis.test.ts:14-52`, `tests/helpers/lave.ts:5-20, 32-72`, `tests/content/player-ship.test.ts:15-35`, `tests/e2e/launch.spec.ts:18-44, 46-82`, `tests/e2e/flight.spec.ts:18-53, 87-107`, `tests/e2e/helpers/probe.ts:16-40`, and `tests/golden/content/ship-bounds.json:1-13, 34-88`.

Use `laveFixture()` for real layout/config and add a helper that expresses test poses in port-frame coordinates rather than opaque world positions. Follow launch tests' exact state/event/clock assertions and cadence tests' tick-indexed replay approach. Pin corridor strict boundaries, rotated station frames, weighted 90% capture, no speed gate, symmetric auto-centering, and bounce orientation/recovery. Persistence unit tests should table-test the pure parser and use an in-memory store; only Playwright proves real IndexedDB across reload. Browser tests should wait on `window.__wegolite`, assert values/messages/mode/clock and console errors, and avoid screenshots/pixel diffs. The existing Lave e2e boot helper clicks `#title-start`; preserve its New game behavior so fresh-context specs remain valid.

## Shared Patterns

### Simulation boundary, timing, and deterministic hashing
**Sources:** `src/sim/flight/step.ts:7-16, 37-49, 51-84, 112-130`; `src/sim/flight/state.ts:4-16, 91-116`; `src/sim/math.ts:4-16`.  
**Apply to:** all `src/sim/dock/*`, `src/sim/player/profile.ts`, and modified sim state/command/event files.

No Three.js, DOM, wall clock, randomness, or generated imports in `src/sim/`. Step at 1/120 s; consume commands once at step boundary; keep geometry injected as plain finite numbers. Include any new field that causally affects future flight in canonical simulation serialization/hash; keep player credits/equipment and presentation effects outside `FlightState`.

### Event → presentation → probe
**Sources:** `src/sim/events.ts:4-21`, `src/app/game-session.ts:291-320`, `src/render/hud/messages.ts:7-24, 32-66`, `src/app/probe.ts:81-124`.  
**Apply to:** dock events, game-session reactions, dock feedback, HUD and probe.

Simulation events describe facts, never display strings. App maps facts to messages; message expiry and feedback envelopes use simulated time. Probe additions are additive and numeric/observable; e2e asserts probes instead of pixels.

### Persistence validation and resilience
**Sources:** `src/settings/schema.ts:68-169, 204-210`, `src/settings/store.ts:28-34, 41-73, 80-95`.  
**Apply to:** save parsing, IndexedDB adapter, memory fake, boot restore and New game.

Strictly validate untrusted save JSON, distinguish corrupt from future-version data, do not overwrite unknown newer saves, catch storage failures, and keep IndexedDB saves separate from localStorage settings. A failed autosave must not break the simulation/frame loop.

### DOM and test execution
**Sources:** `src/ui/docked.ts:8-10, 26-78`; `tests/e2e/helpers/probe.ts:7-10, 16-40`; `AGENTS.md:30-35, 49-56, 87-91`.  
**Apply to:** all UI and tests.

Render all dynamic text only with `textContent`. Run unit/e2e/verify evidence in Docker (`docker compose run --rm test`, `e2e`, `verify`); host test runs are not authoritative. Preserve the no-screenshot rule and existing tests' stable selectors.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/sim/dock/hull.ts` | utility | transform | No existing collision response or OBB-vs-box hull module; borrow vector primitives, but derive/test this response as new code. |

## Planning Notes / Constraints

- `src/sim/` remains pure TS and fixed-step; geometry comes from a typed content value supplied by the app, never imported from `src/content/generated`.
- Docking capture uses the port-frame bbox and the existing aperture semantics; not a trigger sphere. Capture at `0.90 * max.z + 0.10 * min.z < 0`; no independent speed threshold. A failed approach returns to `inFlight` on the same tick and does not add damage/health state.
- The app mode transition is a presentation mirror; sim state remains authoritative. `Shift+C` uses existing `stationAegisRange`; instant computer docking adds exactly 1,200 s. Launch autosave is attached to the existing `launched` event, after the launch's +600 s clock effect, without blocking the frame.
- Leave Phase 3 launch orientation untouched unless the upstream decision explicitly changes it. Research finds the Cobra has to roll into alignment with the tall dock opening.
- Not in this phase: market/economy screen, general outfitting, in-flight saves, migrations, F2 save/load, damage/shields, OXPs, sound, or autopilot fly-in.
- All named source analog paths above were checked with `git ls-files`; they are tracked repository sources, not ignored `.gsd` mirrors. `.claude/skills/` and `.agents/skills/` contain no `SKILL.md` files.

## Metadata

**Analog search scope:** `src/sim`, `src/app`, `src/content`, `src/settings`, `src/input`, `src/ui`, `src/render`, `tools/oolite-ingest`, `tests/sim`, `tests/settings`, `tests/input`, `tests/content`, `tests/e2e`, and `tests/golden/content`.  
**Files scanned:** 28 principal implementation/test analogs plus related schemas, renderer, helpers, and fixtures.  
**Pattern extraction date:** 2026-11-04
