# Phase 6: Hyperspace, Navigation & Persistence - Pattern Map

**Mapped:** 2026-11-06
**Files analyzed:** 31 (12 new, 19 modified)
**Analogs found:** 29 / 31 (2 conditional files have no new pattern to copy)
**Analog paths verified tracked:** every path below returned by `git ls-files -- <path>` (no `.gsd/capabilities` mirrors used)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/sim/hyperspace/jump.ts` | utility (pure sim) | transform | `src/sim/world/layout.ts` | role+flow |
| `src/sim/hyperspace/countdown.ts` | sim module (state machine) | fixed-step | `src/sim/flight/launch.ts` | exact |
| `src/sim/hyperspace/arrival.ts` | utility (pure sim) | transform | `src/sim/flight/launch.ts` | role+flow (partial: no hash-derived pose precedent) |
| `src/ui/chart-model.ts` | view model (pure UI) | transform | `src/ui/station-model.ts` | exact |
| `src/ui/chart.ts` | component (DOM + Canvas2D) | render-on-change | `src/ui/station.ts` + `src/render/hud/hud.ts` | role-match (two analogs) |
| `src/ui/save-load.ts` | component (overlay controller) | request-response | `src/ui/title.ts` + `src/ui/station.ts` | role-match (two analogs) |
| `tests/sim/hyperspace.test.ts` | test (unit) | fixed-step | `tests/sim/launch.test.ts` | exact |
| `tests/sim/hyperspace-arrival.test.ts` | test (unit) | transform | `tests/sim/launch.test.ts` | role+flow |
| `tests/ui/chart-model.test.ts` | test (unit) | transform | `tests/ui/station-market.test.ts` | exact |
| `tests/persistence/save-v2.test.ts` | test (unit) | CRUD/parse | `tests/persistence/save.test.ts` | exact |
| `tests/e2e/hyperspace.spec.ts` | test (e2e) | request-response | `tests/e2e/autosave.spec.ts` | exact |
| `tests/e2e/save-load.spec.ts` | test (e2e) | request-response | `tests/e2e/autosave.spec.ts` | exact |
| `src/sim/commands.ts` | boundary type | event-driven | itself (union extension) | n/a |
| `src/sim/events.ts` | boundary type | event-driven | itself (union extension) | n/a |
| `src/sim/flight/state.ts` | model | fixed-step | itself + `src/sim/flight/launch.ts` | n/a |
| `src/sim/flight/step.ts` | service (sim step) | fixed-step | itself + `src/sim/flight/launch.ts` | n/a |
| `src/sim/flight/sanitize.ts` | utility | transform | itself | conditional |
| `src/sim/economy/market.ts` | utility | transform | itself (`marketSeedForSystem`) | n/a |
| `src/persistence/save.ts` | schema/validator | CRUD/parse | itself | n/a |
| `src/persistence/autosave.ts` | service | CRUD | itself | n/a |
| `src/app/game-session.ts` | composition root | event-driven | itself + `src/app/scene-manager.ts` | n/a |
| `src/app/probe.ts` | config/observability | request-response | itself (optional groups) | n/a |
| `src/app/mode.ts` | state machine | request-response | itself | conditional |
| `src/input/actions.ts` | config (action table) | event-driven | itself | n/a |
| `src/input/keyboard.ts` | service (input) | event-driven | itself | n/a |
| `src/ui/station-model.ts` | view model | transform | itself (`buildStatusModel`) | n/a |
| `src/main.ts` | composition root (boot) | request-response | itself | n/a |
| `index.html` | config (markup) | render-on-change | `#docked` / `#pause` markup | n/a |
| `tests/persistence/save.test.ts` | test (unit) | CRUD/parse | itself | n/a |
| `tests/persistence/autosave.test.ts` | test (unit) | CRUD | itself | n/a |
| `tests/e2e/autosave.spec.ts` | test (e2e) | request-response | itself (future version 2 → 3) | n/a |

---

## Pattern Assignments

### `src/sim/hyperspace/jump.ts` (utility, transform)

**Analog:** `src/sim/world/layout.ts`

**Module conventions — copy this header/constant/guard shape** (`layout.ts:4-27`, `:70-98`):

```ts
// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * ...why this module is the ONLY definition of the formula, and which
 * fidelity rules are deliberate rather than incidental...
 */

import { ... } from "../math.js";

/** A named constant with its Oolite source in the comment. */
const STATION_RADIUS = 500;
```

`layout.ts` also shows the "throw, never silently clamp" derivation guard (`layout.ts:80-113`):

```ts
export class LayoutError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LayoutError";
  }
}

function assertFinite(label: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new LayoutError(
      `Wegolite: the system layout derived a non-finite ${label} (${String(value)}).`,
    );
  }
}
```

**Integer-truncation idiom — copy from `market.ts`, not from `Math.floor`** (`market.ts:98-99`, `:115`, `:130-134`):

```ts
if (total < 0) return 0;
return Math.trunc(total);
...
if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) {
  throw new Error(
    `Wegolite: market seed must be a uint32, received ${String(seed)}.`,
  );
}
```

**What to copy into `jump.ts`:**
- The header comment must name the Oolite source and say *why* `Math.trunc` is required (C integer division truncates toward zero; `Math.floor` changes the graph).
- Export `CHART_LY_PER_UNIT`, `MAX_JUMP_RANGE_LY`, `MAX_JUMP_DIST`, and a single `jumpBetween()` returning a frozen-shaped `JumpMath`.
- `fuelCost = dist === 0 ? 1 : 4 * dist` and `jumpTimeSeconds = 576 * dist * dist` — never derive through `0.4 * dist` (RESEARCH Pitfall 1/2).
- Do **not** import `content/`, `three`, or any DOM identifier (`tests/guards/sim-purity.test.ts:145-193` proves the zone is live).

---

### `src/sim/hyperspace/countdown.ts` (sim module, fixed-step)

**Analog:** `src/sim/flight/launch.ts` — exact role + flow match (a timed, begin/step/complete transition driven only by `dt`).

**Imports and module doc** (`launch.ts:17-31`):

```ts
import { add, axisAngle, mul, normalize, rotate, scale, vec } from "../math.js";
import type { FlightConfig } from "./config.js";
import { dockMouthPosition, type FlightState } from "./state.js";
import type { SystemLayout } from "../world/layout.js";

/** D-10: "about two seconds". */
export const LAUNCH_DURATION = 2;
```

**Core begin/step/complete shape with "ignore, never throw"** (`launch.ts:38-103`):

```ts
export function beginLaunch(
  state: FlightState,
  layout: SystemLayout,
  config: FlightConfig,
): boolean {
  if (state.mode !== "docked") return false;

  state.mode = "launching";
  state.launchElapsed = 0;
  state.launchCount += 1;
  state.clockSeconds += 600;
  ...
  return true;
}

export function stepLaunch(
  state: FlightState,
  layout: SystemLayout,
  config: FlightConfig,
  dt: number,
): boolean {
  ...
  state.launchElapsed += dt;
  if (state.launchElapsed >= LAUNCH_DURATION - LAUNCH_EPSILON) {
    completeLaunch(state);
    return true;
  }
  return false;
}
```

**What to copy:**
- One module-level constant `HYPERSPACE_COUNTDOWN_STEPS = 1800` with a comment naming 15 s at 1/120 s.
- Pure predicates for start (`target`, `different system`, `dist <= 17`, `fuel >= cost`) and a refusal-reason union (`"no target" | "too far" | "insufficient fuel"`). The sim never emits UI strings — the app owns copy (`src/sim/events.ts:4-9`).
- `begin` returns `boolean`; a second begin while active is ignored, never thrown.
- Countdown progress is **integer steps remaining**, decremented in `stepFlight` (see `step.ts` below), not a float seconds accumulator. This removes the `LAUNCH_EPSILON` class of problem entirely.
- Use `src/sim/time.js` `DT` only in the app/test layer; the sim receives `dt`.

---

### `src/sim/hyperspace/arrival.ts` (utility, transform)

**Analog:** `src/sim/flight/launch.ts` (the only existing "set a whole pose atomically" function) + `src/sim/hash.ts` (the only deterministic hash).

**Pose-assignment shape to copy** (`launch.ts:43-63`):

```ts
if (state.mode !== "docked") return false;

state.mode = "launching";
state.launchElapsed = 0;
state.launchCount += 1;
state.clockSeconds += 600;
state.position = dockMouthPosition(layout);
state.orientation = layout.stationBaseQuat;
state.speed = config.launchSpeed;
state.pitchRate = 0;
state.rollRate = 0;
state.torus = ...;
state.stationAngle = 0;
state.dockArmed = false;
```

**Deterministic hash + normalisation helpers** (`src/sim/hash.ts:12-21`, `src/sim/math.ts:31-57`, `:129-150`):

```ts
export function fnv1a32(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
```

`vec`, `quat`, `normalize`, `lengthSquared`, `normalizeVec`, `add`, `scale` all already exist; do not add vector math.

**What to copy:**
- Signature `applyWitchpointArrival(state, layout, config, originId, destinationId): void`.
- Seed with `Number.parseInt(fnv1a32(...), 16) >>> 0`; slice the word into independent 16-bit halves.
- Set `mode`, `dockArmed = false`, `speed = Math.min(config.maxSpeed, 50)`, zero rates, torus disengaged. `launch.ts` is the checklist of "every field a pose change must touch".
- Clamp the offset with `layout.witchpoint.radius + 750` and `layout.scannerRange * 0.5` — those fields already exist on `SystemLayout` (`layout.ts:42-68`, `:71-77`).
- Never call `Math.random` or `Date.now`; the whole sim zone is deterministic (`AGENTS.md`; RESEARCH Pitfall).

---

### `src/ui/chart-model.ts` (view model, transform)

**Analog:** `src/ui/station-model.ts` — DOM-free model builder. Note the imports are types plus pure sim helpers; no DOM, no Three.

**Pure-model preamble to copy** (`station-model.ts:4-50`):

```ts
/**
 * The pure market view model (ECON-04, D-06, D-08, D-09).
 *
 * One function projects a `Market`, the profile and the catalogue into the
 * fixed Oolite-style columns and the footer copy. It returns strings, numbers,
 * booleans and readonly rows only; the shell writes every one with
 * `textContent`. No DOM and no loader runs here.
 */

import type { System } from "../content/types.js";

/** A pure view model was asked to read a record it cannot describe. */
export class StationModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StationModelError";
  }
}
```

**Model-builder shape** (`station-model.ts:308-340`):

```ts
/**
 * Build the F5 status and manifest model (ECON-06, D-04).
 * ...
 */
export function buildStatusModel(
  profile: PlayerProfile,
  system: System,
  labels: Labels,
  equipmentCatalogue: readonly Equipment[],
  commodities: readonly Commodity[],
  page: number,
): StatusModel {
  ...
  const fields: LabelledField[] = [
    { label: "Commander", value: COMMANDER_NAME },
    ...
  ];
  ...
  return { page: active, fields, equipment, manifest, loadText };
}
```

**Typed model interfaces are declared beside the builder** (`station-model.ts:81-117`, `:275-296`). Follow that: declare `ChartMarker`, `ChartEdge`, `ChartView`, `ChartSelection` in `chart-model.ts`, not in `chart.ts`.

**What to copy:**
- Inputs are plain data: `readonly System[]`, ids, range mode, fuel, viewport size. The module must not call `galaxy0()` itself.
- Deterministic iteration: sort by `systemIndex` for labels/ties, never by array order alone.
- Pure helpers `nearestInDirection` and `hitTest` return values, not DOM events.
- Unit-testable without a canvas; `tests/ui/station-market.test.ts` is the test precedent.

---

### `src/ui/chart.ts` (component, DOM + Canvas2D, paint-on-change)

**Analogs:** `src/ui/station.ts` (DOM shell conventions) + `src/render/hud/hud.ts` (Canvas2D lifecycle).

**Revision note (plan 06-03 Task 3):** the painting is split out into `src/ui/chart-draw.ts`
(`drawChart(context, view, size)` + `needsChartRepaint(previous, next)`), following the
`src/render/hud/draw.ts` convention of pure draw functions that receive a ready context. That is
what makes paint-on-change, draw order and the 0x0 skip unit-testable in the Node-only Vitest
project; `chart.ts` keeps only the DOM shell, sizing, listeners and the `data-paints` counter.

**DOM shell conventions** (`station.ts:61-84`, `:309-320`, `:364-367`):

```ts
function requireElement<T extends HTMLElement>(
  root: HTMLElement,
  selector: string,
  description: string,
): T {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Wegolite: the station shell is missing ${description}.`);
  }
  return element as T;
}

function cell(text: string): HTMLTableCellElement {
  const element = document.createElement("td");
  element.textContent = text;
  return element;
}
...
function applyScreen(screen: StationScreen): void {
  section.dataset.screen = screen;
  homePanel.hidden = screen !== "home";
  ...
}
```

```ts
return {
  ...
  dispose(): void {
    controller.abort();
    home.dispose();
  },
};
```

**Canvas lifecycle conventions** (`hud.ts:47-55`, `:87-117`):

```ts
function requireContext2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error(
      "Wegolite: the HUD canvas has no 2D rendering context; the flight HUD cannot be drawn.",
    );
  }
  return context;
}
...
function resize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (width === 0 || height === 0) return;
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ...
}

function draw(model: HudModel): void {
  if (canvas.width === 0 || canvas.height === 0) return;
  ...
}
```

**What to copy:**
- `createChart(root: HTMLElement): ChartOverlay` with `show/view/hide/dispose`; `requireElement` for `#chart`, `#chart-canvas`, and `[data-field="chart-*"]`.
- Every dynamic string via `textContent` (never `innerHTML`); no `<footer>` inside the new overlay.
- `AbortController` owns all pointer listeners and is aborted in `dispose()`.
- Canvas backing store: CSS size × DPR capped at 2, skip 0×0, repaint only on open / selection / range / resize (never per RAF frame). This is the load-bearing anti-cost pattern (RESEARCH Pitfall 10; `hud.ts:87-117`).
- Pointer handling maps client coordinates through the same pure projection `chart-model.ts` exposes.

---

### `src/ui/save-load.ts` (component, overlay controller)

**Analog:** `src/ui/title.ts` (confirmation dialog + focus trap) with the field/shell style of `src/ui/station.ts`.

**Overlay + confirmation + focus-trap pattern** (`title.ts:72-154`):

```ts
function focusables(): HTMLElement[] {
  return Array.from(
    confirm.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter(
    (element) =>
      element.closest("[hidden]") === null &&
      !element.hasAttribute("disabled"),
  );
}

function openConfirmation(): void {
  confirming = true;
  confirm.hidden = false;
  // The safe action takes focus, so a stray Enter cannot delete the save.
  cancel.focus();
}

function onKeyDown(event: KeyboardEvent): void {
  if (!confirming) return;
  if (event.code === "Escape") {
    event.preventDefault();
    closeConfirmation(true);
    return;
  }
  if (event.code !== "Tab") return;
  ...
}

window.addEventListener("keydown", onKeyDown, { signal: controller.signal });
...
dispose(): void {
  controller.abort();
}
```

**What to copy:**
- `createSaveLoadScreen(root)` with `show/hide/setSlot/setNotice/onSave/onLoad/onReturn/dispose`.
- Three semantic controls rendered as non-focusable rows or as buttons with `data-action`; keyboard operation comes from the session's action layer, not from native Enter on a chart row. The one exception is the `[Y/N]` overwrite confirm, which follows `title.ts`'s `alertdialog` + focus-trap shape.
- `textContent` only; one writer per footer-style field (keys / confirm / notice), mirroring `station.ts:11-16`, `:358-362`.
- The confirm copy is app-owned static markup or a literal in the module; no save data inside `innerHTML`.

---

### `tests/sim/hyperspace.test.ts` (unit, fixed-step)

**Analog:** `tests/sim/launch.test.ts`

**Fixture + stepping pattern** (`launch.test.ts:25-77`, `:140-155`):

```ts
import { describe, expect, it } from "vitest";

import { ZERO_INTENT } from "../../src/sim/flight/controller.js";
import { initFlightState } from "../../src/sim/flight/state.js";
import { stepFlight } from "../../src/sim/flight/step.js";
import { DT } from "../../src/sim/time.js";
import { laveFixture } from "../helpers/lave.js";

describe("scripted launch", () => {
  const fixture = laveFixture();

  it("advances the clock by exactly 600 seconds ...", () => {
    const state = initFlightState(fixture.layout);
    const events = stepFlight(
      state, fixture.layout, fixture.config, ZERO_INTENT,
      [{ kind: "launch" }], DT,
    );
    expect(state.clockSeconds - clockBefore).toBe(600);
  });
});
```

**What to copy:**
- Build systems with `laveFixture()` for Lave and read other systems from `src/content/generated/systems/g0.json`; tests may read generated JSON, `src/sim` may not.
- Table-driven fixtures: Lave→Diso `{3.6 LY, 36, 46656}`, Leesti, Zaonce `{5.6, 56, 112896}`, Riedquat `{6.8, 68, 166464}`, Tibedied `too far`.
- Discriminators: `Legees→Laeden` must be `{dist: 0, fuelCost: 1, jumpTimeSeconds: 0}`; galaxy-0 edge count `875` (not 866).
- Countdown invariants: exactly `1800` steps from the draining step, `hyperspaceCountdown === 0` on commit, never negative, and `clockSeconds` delta excluding the step's `DT` (`terminalTransition`).
- Assert `Number.isSafeInteger(fuel - cost)` for every `dist` in `0..17`.

---

### `tests/sim/hyperspace-arrival.test.ts` (unit, transform)

**Analog:** `tests/sim/launch.test.ts` (pose assertions + `expectVecClose`) with a determinism scan.

**Pose assertion helper** (`launch.test.ts:51-74`):

```ts
function expectVecClose(actual: Vec3, expected: Vec3, digits: number): void {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
  expect(actual.z).toBeCloseTo(expected.z, digits);
}
```

**What to copy:**
- Call `applyWitchpointArrival` twice with the same ids and deep-equal the results; call with reversed ids and assert they differ.
- Assert the offset magnitude is within `[witchpoint.radius + 750, scannerRange * 0.5]` and orientation length is 1.
- Source-scan `src/sim/hyperspace/arrival.ts` for `Math.random`/`Date.now` using the comment-stripping style from `tests/guards/sim-purity.test.ts:97-103`.

---

### `tests/ui/chart-model.test.ts` (unit, transform)

**Analog:** `tests/ui/station-market.test.ts`

**Model test shape** (`station-market.test.ts:15-66`):

```ts
import { describe, expect, it } from "vitest";

import { laveFixture } from "../helpers/lave.js";

function row(model: Model, key: string) {
  const found = model.rows.find((candidate) => candidate.key === key);
  if (found === undefined) throw new Error(`no row "${key}"`);
  return found;
}

describe("F8 rows", () => {
  it("emits 17 rows in sortOrder ...", () => {
    const model = build();
    expect(model.rows).toHaveLength(17);
    ...
  });
});
```

**What to copy:**
- Load real galaxy 0 (read the generated JSON in the test) and assert 256 markers, 875 edges, both projections, and the short-range window covering every ≤ 17-unit neighbour.
- Pin Lave's neighbours exactly (Leesti 3.6, Diso 3.6, Reorte 4.4, Zaonce 5.6, Riedquat 6.8, Orerve 6.8; Quator 7.2 out).
- Test selection: click hit-test, nearest-in-direction for each arrow, ties resolved by `systemIndex`, target line drawn, unreachable marker still has a label.

---

### `tests/persistence/save-v2.test.ts` (unit, parse/CRUD)

**Analog:** `tests/persistence/save.test.ts`

**Allow-list + overrides + reject-table shape** (`save.test.ts:25-59`, `:91-120`):

```ts
const ALLOW: SaveAllowLists = {
  equipment: new Set(["EQ_CARGO_BAY", "EQ_DOCK_COMP", ...]),
  systems: new Set(["g0-s7"]),
  stations: new Set(["coriolis-station"]),
  commodities: new Map([["food", "t"], ["gold", "kg"], ["gem_stones", "g"]]),
};

function validSave(overrides: Record<string, unknown> = {}): SaveV1 {
  return {
    version: 1,
    mode: "docked",
    clockSeconds: CLOCK_START + 600,
    credits: 1000,
    equipment: [],
    system: { id: "g0-s7" },
    station: { key: "coriolis-station" },
    ...overrides,
  };
}

const rows: ReadonlyArray<{
  readonly name: string;
  readonly raw: string;
  readonly reason: "corrupt" | "future-version" | "unreadable";
}> = [ ... ];
```

**What to copy:**
- Add a 17-key `marketGoods` set to the test allow-lists and to `SaveAllowLists`; do not reuse the 16-key cargo map (RESEARCH Pitfall 3).
- Accept path: v2 docked, v2 inFlight, v2 with `targetSystem`, v2 with market snapshot; assert `parseSave(JSON.stringify(save), ALLOW).ok`.
- Reject table: future `version: 3`, unknown top-level key, market `systemId` mismatch, unknown/duplicate goods key, stock > 127, non-integer price, non-finite pose, zero-length orientation, missing pose for `inFlight`, pose present for `docked`, `marketSeed` + `market` together.
- Migration: `migrateV1ToV2(v1)` sets `version: 2`, `mode: "docked"`, keeps credits/equipment/cargo/fuel/marketSeed, and leaves `market`/`flight` absent.
- Oversize row must still assert `JSON.parse` is not reached.

---

### `tests/e2e/hyperspace.spec.ts` and `tests/e2e/save-load.spec.ts` (e2e)

**Analog:** `tests/e2e/autosave.spec.ts`

**Harness + probe-wait conventions** (`autosave.spec.ts:23-90`, `:440-520`):

```ts
import { expect, test } from "@playwright/test";

import { CLOCK_START } from "../../src/sim/flight/state.js";
import { MAX_SAVE_CHARS } from "../../src/persistence/save.js";
import { getProbe, waitForReady } from "./helpers/probe.js";

test.setTimeout(240_000);

async function boot(page: Page, query = "/"): Promise<void> {
  await page.goto(query);
  await waitForReady(page);
}

async function waitForMode(page: Page, mode: string): Promise<void> {
  await page.waitForFunction(
    (expected) => {
      const probe = window.__wegolite;
      return probe !== undefined && probe.ready === true && probe.mode === expected;
    },
    mode,
    { timeout: 60_000 },
  );
}
```

**What to copy:**
- `test.setTimeout(240_000)`; every wait is a `page.waitForFunction` on `window.__wegolite` — never a fixed sleep, never a screenshot.
- Boot → click `#title-start` → assert `#docked` → drive keys (`page.keyboard.press("F6")`, `"KeyH"`, `"F2"`) → assert probe fields.
- Countdown proof: wait on `probe.hyperspace.countdown`/`probe.hyperspace.lastJump`, with the 360-frame/133 s SwiftShader budget in mind; do not assume real-time 15 s.
- Reload proof for the arrival autosave: `page.reload()`, `waitForReady`, assert `probe.mode === "inFlight"`, `probe.position`, `probe.economy.market`, `probe.hyperspace.target`.
- F2 proof: overwrite confirmation, failed-load isolation (bytes unchanged), and docked-only gating (F2 inert in flight).
- `collectErrors(page)` and final `expect(errors).toEqual([])` in every test.

---

### `src/sim/commands.ts` and `src/sim/events.ts` (boundary types)

**Analog:** themselves — extend the existing unions.

**Command union style** (`commands.ts:4-25`):

```ts
/**
 * The command boundary (D-09, FLGT-07, Pattern 4).
 * ...
 */
export type Command =
  | { kind: "launch" }
  | { kind: "skipLaunch" }
  | { kind: "toggleTorus" }
  | { kind: "setPaused"; paused: boolean }
  | { kind: "cycleCompass" }
  | { kind: "targetStation" }
  /**
   * D-11/D-12: Shift+C. Deliberately payload-free — equipment ownership travels
   * through `StepOptions.equipment`, ...
   */
  | { kind: "dockingComputer" };
```

**Event union style** (`events.ts:4-40`):

```ts
export type DockDeniedReason = "notInstalled" | "outsideAegis";

export type SimEvent =
  | { kind: "launched" }
  | { kind: "docked"; via: "manual" | "computer"; clockDelta: number }
  | { kind: "dockDenied"; reason: DockDeniedReason }
  | { kind: "bounce"; speed: number; cause: BounceCause; axis: BounceAxis };
```

**What to copy:**
- Add `{ kind: "beginHyperspace" }` / `{ kind: "cancelHyperspace" }` **payload-free**; the facts come through `StepOptions` (same rationale as `dockingComputer`).
- Add `hyperspaceCountdownStarted`, `hyperspaceCountdownCancelled`, `hyperspaceJumped` (with `destinationId`, `clockDeltaSeconds`, `fuelCost`), `hyperspaceRefused` (with a reason enum). No UI copy.
- Export the refusal-reason union beside the event type, as `DockDeniedReason` is (`events.ts:21-22`).

---

### `src/sim/flight/state.ts` (model)

**Analog:** itself; use `launch.ts` for field-transition discipline.

**Fields + hash serializer** (`state.ts:29-67`, `:114-145`):

```ts
export interface FlightState {
  tick: number;
  mode: FlightMode;
  clockSeconds: number;
  ...
}

export function serializeFlight(state: FlightState): string {
  return [
    `mode=${state.mode}`,
    `tick=${canon(state.tick, 0)}`,
    ...
  ].join("\n");
}

export function hashFlight(state: FlightState): string {
  return fnv1a32(serializeFlight(state));
}
```

**What to copy:**
- Add `hyperspaceCountdown: number` (steps remaining, 0 = idle) and `hyperspaceTarget: { id, dist } | null` (snapshot at countdown start). Fixed key order in `serializeFlight`; every new number through `canon`.
- `initFlightState` must initialise them (`countdown: 0`, `target: null`) so the docked restore is complete.
- Do **not** add fuel, target selection, or market state to `FlightState` (`D-07`, `D-12`; anti-pattern in RESEARCH § Anti-Patterns).

---

### `src/sim/flight/step.ts` (sim step)

**Analog:** itself.

**Command drain + terminal-transition pattern** (`step.ts:72-79`, `:85-119`, `:152-165`):

```ts
const events: SimEvent[] = [];
const modeAtStart = state.mode;
let skipLaunch = false;
let launchedThisStep = false;
// A command-phase transition that ends the tick: ...
let terminalTransition = false;
let torusToggle = false;

for (const command of commands) {
  switch (command.kind) {
    case "launch":
      if (modeAtStart === "docked" && beginLaunch(state, layout, config)) {
        events.push({ kind: "launched" });
        launchedThisStep = true;
        terminalTransition = true;
      }
      break;
    ...
  }
}
...
if (modeAtStart !== "docked" && !terminalTransition) {
  state.stationAngle += layout.stationRollRadPerSec * dt;
  state.flightTime += dt;
  state.clockSeconds += dt;
  ...
}
```

**StepOptions extension point** (`step.ts:35-44`):

```ts
export interface StepOptions {
  readonly dock?: DockGeometry;
  readonly equipment?: ReadonlySet<string>;
}
```

**What to copy:**
- Extend `StepOptions` with `readonly hyperspace?: { fuel; origin: {id,x,y}; target?: {id,x,y} }` — read-only facts, like `equipment`.
- Drain `beginHyperspace` / `cancelHyperspace` in step 1; gate on `modeAtStart === "inFlight"` (RESEARCH A1).
- Add step 4b after speed/position: decrement only when `inFlight && countdown > 0`; on zero, revalidate, add `jumpTimeSeconds` to `clockSeconds`, emit `hyperspaceJumped`, set `terminalTransition = true`.
- The `terminalTransition` flag is load-bearing: without it step 5 adds `dt` and the fixture clock is off by 1/120 (RESEARCH Pitfall 5).
- Keep the existing 1→7 order; do not reorder.

---

### `src/sim/flight/sanitize.ts` (conditional)

**Analog:** itself.

Existing contract (`sanitize.ts:33-48`, `:90-101`):

```ts
export function sanitizeFlightState(
  state: FlightState,
  layout: SystemLayout,
  config: FlightConfig,
): boolean {
  let repaired = false;

  if (!finiteVec(state.position)) {
    state.position = dockMouthPosition(layout);
    repaired = true;
  }
  ...
  if (repaired) state.repairCount += 1;
  return repaired;
}
```

**Expected change:** none, unless `FlightState` gains a numeric field that could arrive non-finite from a restore/test seam (then clamp `hyperspaceCountdown` to `0..1800` and clear `hyperspaceTarget`). Pose magnitudes are bounded in the **save schema/validator**, not here (RESEARCH Pitfall 8: `sanitizeFlightState` only repairs non-finite values).

---

### `src/sim/economy/market.ts` (utility)

**Analog:** itself.

**Seed derivation to sit beside** (`market.ts:40-43`):

```ts
/** The stable uint32 seed for a system's first generation (D-18). */
export function marketSeedForSystem(systemId: string): number {
  return Number.parseInt(fnv1a32(`${systemId}:0`), 16) >>> 0;
}
```

**What to copy:**
- Add `arrivalMarketSeed(targetId: string, previousSeed: number): number` next to `marketSeedForSystem`, using `fnv1a32(`${targetId}:${String(previousSeed)}:arrival`)` and the same `>>> 0` + uint32 guard style.
- Do not add a second generator; `generateMarket(system, commodities, seed)` is reused verbatim (RESEARCH Pattern D/E).
- Keep the module pure: no content import, only `Pick<System, "id" | "economy">`.

---

### `src/persistence/save.ts` (schema/validator)

**Analog:** itself. This is the one pipeline; extend it in place.

**Current version/schema/bounds** (`save.ts:43-59`, `:100-142`):

```ts
export const SAVE_VERSION = 1;

export const MAX_SAVE_CHARS = 32_768;
export const MAX_SAVE_EQUIPMENT = 64;
export const MAX_SAVE_FUEL = 70;
...
export const SaveV1Schema = z.strictObject({
  version: z.literal(SAVE_VERSION),
  mode: z.literal("docked"),
  clockSeconds: z.number().int().min(CLOCK_START).max(CLOCK_START + MAX_SAVE_CLOCK_DELTA),
  credits: z.number().int().min(0).max(MAX_SAVE_CREDITS),
  equipment: z.array(z.string().min(1).max(MAX_SAVE_EQUIPMENT_KEY_CHARS)).max(MAX_SAVE_EQUIPMENT),
  system: z.strictObject({ id: z.string().min(1).max(MAX_SAVE_SYSTEM_ID_CHARS) }),
  station: z.strictObject({ key: z.string().min(1).max(MAX_SAVE_STATION_KEY_CHARS) }),
  cargo: z.array(CargoEntrySchema).max(MAX_SAVE_CARGO_ENTRIES).optional(),
  fuel: z.number().int().min(0).max(MAX_SAVE_FUEL).optional(),
  missiles: z.number().int().min(0).max(MAX_SAVE_MISSILES).optional(),
  passengerBerths: z.number().int().min(0).max(MAX_SAVE_BERTHS).optional(),
  marketSeed: z.number().int().min(0).max(0xffffffff).optional(),
});
```

**Parse order and classification** (`save.ts:215-284`):

```ts
export function parseSave(raw: string | null, allow: SaveAllowLists): SaveParseResult {
  if (raw === null) return { ok: false, reason: "absent" };

  if (raw.length > MAX_SAVE_CHARS) {
    const version = sniffVersion(raw);
    if (version !== null && version > SAVE_VERSION) {
      return { ok: false, reason: "future-version" };
    }
    return { ok: false, reason: "unreadable" };
  }

  let parsed: unknown;
  try { parsed = JSON.parse(raw) as unknown; }
  catch { return { ok: false, reason: "unreadable" }; }

  if (isRecord(parsed)) {
    const version = parsed["version"];
    if (typeof version === "number" && version > SAVE_VERSION) {
      return { ok: false, reason: "future-version" };
    }
  }

  const result = SaveV1Schema.safeParse(parsed);
  if (!result.success) {
    if (!isRecord(parsed) || typeof parsed["version"] !== "number") {
      return { ok: false, reason: "unreadable" };
    }
    return { ok: false, reason: "corrupt" };
  }
  const save = result.data;
  try {
    if (!validateSaveSemantics(save, allow, "read")) return { ok: false, reason: "corrupt" };
  } catch { return { ok: false, reason: "corrupt" }; }
  if (!allow.systems.has(save.system.id)) return { ok: false, reason: "corrupt" };
  if (!allow.stations.has(save.station.key)) return { ok: false, reason: "corrupt" };
  return { ok: true, save };
}
```

**Semantic validator + write gate** (`save.ts:295-371`):

```ts
export function validateSaveSemantics(
  save: SaveV1,
  allow: SaveAllowLists,
  mode: "read" | "write",
): boolean { ... }

export function isEncodedSaveValid(raw: string, allow: SaveAllowLists): boolean {
  if (raw.length > MAX_SAVE_CHARS) return false;
  let parsed: unknown;
  try { parsed = JSON.parse(raw) as unknown; } catch { return false; }
  const result = SaveV1Schema.safeParse(parsed);
  if (!result.success) return false;
  try { return validateSaveSemantics(result.data, allow, "write"); } catch { return false; }
}
```

**What to copy / change:**
- `SAVE_VERSION = 2`; keep `SaveV1Schema` exported as the migration input; add `SaveV2Schema` and `export type SaveV2`.
- `SaveAllowLists` gains `marketGoods: ReadonlySet<string>` (17 keys). Keep `commodities` (16) for cargo/pods. Build it in `main.ts` from `loadCommodities()` without the tradeable filter (RESEARCH Pitfall 3).
- Add `migrateV1ToV2` in this module as a pure total function; `parseSave` dispatches `version === 1 → migrate → SaveV2Schema` and `version === 2 → SaveV2Schema`.
- Extend `validateSaveSemantics` in the **same** function: market `systemId` equality, goods allow-list/no duplicates, pose finiteness, orientation length in `(0, 4]`, speed/rate bounds, `targetSystem` allow-list, `mode`/pose presence. Return `false`, never throw.
- Extend `encodeSave` to emit v2 (mode, target, market or marketSeed, optional pose). The single-seed rule: migration emits `marketSeed` with no `market`; the canonical writer emits `market` with no `marketSeed` (RESEARCH Pitfall 9).
- Raise `MAX_SAVE_CHARS` to `65_536` and update the doc comment arithmetic (`save.ts:46-58`).
- Preserve the exact order/classification strings; `isEncodedSaveValid` must validate the **v2** schema, or the arrival autosave fails closed.

---

### `src/persistence/autosave.ts` (service)

**Analog:** itself.

**Snapshot builder** (`autosave.ts:52-91`):

```ts
export function snapshotForSave(
  state: FlightState,
  profile: PlayerProfile,
  system: { readonly id: string },
  station: { readonly key: string },
  marketSeed: number,
  commodities: readonly Commodity[],
): SaveInputs {
  ...
  return {
    clockSeconds: Math.floor(state.clockSeconds),
    credits: profile.credits,
    equipment: [...profile.equipment],
    cargo,
    fuel: profile.fuel,
    missiles: profile.missiles,
    passengerBerths: profile.passengerBerths,
    marketSeed,
    systemId: system.id,
    stationKey: station.key,
  };
}
```

**Write pipeline** (`autosave.ts:102-124`):

```ts
export async function queueAutosave(
  store: SaveStore,
  revision: number,
  inputs: SaveInputs,
  allow: SaveAllowLists,
): Promise<WriteResult> {
  try {
    const encoded = encodeSave(inputs);
    if (!isEncodedSaveValid(encoded, allow)) {
      return { committed: false, revision, reason: "invalid-save" };
    }
    return await store.write(encoded, revision);
  } catch (error) {
    return { committed: false, revision, reason: error instanceof Error ? error.message : String(error) };
  }
}
```

**Restore shape** (`autosave.ts:41-50`, `:144-192`):

```ts
export interface RestoredGame {
  readonly state: FlightState;
  readonly profile: PlayerProfile;
  readonly marketSeed?: number;
}

export function profileFromSave(save: SaveV1): PlayerProfile { ... }

export function restoreFromSave(
  save: SaveV1,
  layout: SystemLayout,
  profileFactory: (save: SaveV1) => PlayerProfile,
): RestoredGame {
  const state = initFlightState(layout);
  state.mode = "docked";
  state.clockSeconds = save.clockSeconds;
  return {
    state,
    profile: profileFactory(save),
    ...(save.marketSeed === undefined ? {} : { marketSeed: save.marketSeed }),
  };
}
```

**What to copy / change:**
- Inputs gain `mode`, optional `targetSystem`, current `market` snapshot, optional `flight` pose. Keep `clockSeconds: Math.floor(...)` at the writer boundary.
- `snapshotForSave` takes the live market (`Market | undefined`) and the committed target id; it must never rebuild prices.
- `restoreFromSave` branches on `save.mode`: docked → `initFlightState` + saved clock; in-flight → `initFlightState`, then apply normalised pose, `speed`, rates, torus, `clockSeconds`, `mode = "inFlight"`, `dockArmed = false`, `launchElapsed = LAUNCH_DURATION`, `impulse = 0`, `compassMode = "auto"` (RESEARCH Pitfall 7).
- Return the market snapshot / seed beside the state so `GameSession.start()` installs the same market on Continue and F2 Load.
- No second validator, no second store; `queueAutosave` stays non-throwing.

---

### `src/app/game-session.ts` (composition root)

**Analog:** itself + `src/app/scene-manager.ts` for the swap.

**Mutable system + swap path to copy** (`scene-manager.ts:126-139`):

```ts
enterSystem(system, stationDef): SystemScene {
  const layout = deriveSystemLayout(system, stationDef);
  const next = createSystemScene(layout, assets, system);
  // `start()` and the `?test=1` swap both arrive here; applying the
  // viewport before the install is what makes the swap path safe too.
  applyViewport(next.camera, rendererSize(renderer));
  const previousSystem = current;
  const previousMenu = menu;
  current = next;
  currentLayout = layout;
  menu = undefined;
  retire(previousSystem, previousMenu);
  return next;
}
```

**Current session state + autosave** (`game-session.ts:279-296`, `:898-963`):

```ts
// Economy state lives beside the flight state, never inside it (D-10).
let profile: PlayerProfile = newProfile();
...
let market: Market | undefined;
let marketSeed: number | undefined;

// The station computer's own state; the UI is purely presentational.
let stationScreen: StationScreen = "home";
```

```ts
function autosave(): void {
  saveAttempts += 1;
  if (!canOverwrite(saveStatus)) { ... return; }
  if (testTainted) { ... return; }
  const inputs = snapshotForSave(
    currentState, profile, system, { key: currentStationKey },
    currentMarketSeed, catalogue,
  );
  saveRevision += 1;
  ...
  void queueAutosave(saveBoot.store, revision, inputs, saveBoot.allow).then(...);
}
```

**Synchronous screen-open sink** (`game-session.ts:1041-1077`) and **frame step options** (`:1557-1602`):

```ts
function openStationScreen(action: ActionId): void {
  const currentState = state;
  const currentInput = input;
  if (currentState?.mode !== "docked" || currentInput === undefined) return;
  ...
  currentInput.setContext("dockScreen");
  renderStation();
}
```

```ts
const stepOptions: StepOptions =
  dockGeometry === undefined
    ? { equipment }
    : { dock: dockGeometry, equipment };
const events = stepFlight(
  currentState, currentLayout, currentConfig, intent, stepCommands, DT, stepOptions,
);
for (const event of events) handleEvent(event);
```

**HUD model build (countdown override point)** (`game-session.ts:1489-1498`):

```ts
const model = buildHudModel(
  currentState,
  currentLayout,
  currentConfig,
  messages.current(currentState.flightTime),
  dockFeedback.flashAlpha(currentState.flightTime),
);
currentHud.draw(model);
```

**What to copy / change:**
- Change `system` from a captured option to `let`; add one `enterSystemById(id)` helper that resolves from a `Map` built at `start()`, calls `scenes.enterSystem`, asserts `scenes.layout()`, updates `system/scene/layout`, and resets `previousCameraWorld`.
- Add chart suspension: a `chartOpen` flag checked at the top of `frame()`; drain/skip `advance` and `renderFrame` while open. Reset the loop on close. F6 gated on `state.mode !== "launching"` (RESEARCH Pitfall 13).
- Add the **pre-launch** autosave inside `frame()` before `currentLoop.advance(...)` when the drained commands contain `launch`, `mode === "docked"`, `stationScreen === "home"`; delete the `autosave()` from the `launched` case (`:1214-1228`) (RESEARCH Pitfall 6).
- In `handleEvent`, add the hyperspace cases: countdown copy via `messages.enqueue`/`enqueuePriority`, and `hyperspaceJumped` → resolve system → `enterSystemById` → chained market seed → `generateMarket` → `applyWitchpointArrival` → poses → autosave → resume.
- Build `stepOptions` with `hyperspace: { fuel: profile.fuel, origin, target }` each frame/step.
- Countdown line: override the `message` argument to `buildHudModel` (do **not** enqueue every step; the 4-message queue expires after 4 sim seconds). Use `Math.round(state.hyperspaceCountdown * DT)`.
- F2 Load: validate with `parseSave`, build the scene **after** validation, then install state/profile/market in one synchronous block; failed load leaves the session untouched (RESEARCH Pitfall 14).
- Keep `renderStation()`/`syncEconomyProbe()` as the single UI/probe writers.

---

### `src/app/probe.ts` (observability)

**Analog:** itself; the existing optional groups are the template.

**Optional groups and failure surface** (`probe.ts:233-251`, `:362-398`):

```ts
export interface WegoliteProbe {
  ...
  /** Present once a system scene exists. */
  world?: WegoliteWorldProbe;
  /** Live docking counters; plan 04-03 extends this with bounce/shake/flash. */
  dock?: WegoliteDockProbe;
  /** Live autosave state; absent on the failure surface. */
  save?: WegoliteSaveProbe;
  /** The station computer's screen state (ECON-04/ECON-09). */
  station?: WegoliteStationProbe;
  /** The live market and hold (ECON-01/ECON-02). */
  economy?: WegoliteEconomyProbe;
  ...
}
```

**What to copy:**
- Add `chart?: { open; range; targetId; selectedId }` and `hyperspace?: { targetId; countdown; lastJump; lastRefusal }` as **optional** groups.
- Do not add required fields to `WegoliteProbe`; `publishFailure` (`probe.ts:362-398`) must keep compiling without them.
- Publish from `updateProbe()`/`syncEconomyProbe()` only when a session exists; mirror `probe.economy` assignment (`game-session.ts:789-812`).
- Keep counters monotonic as documented (`save.attempts`/`writes`/`committed`, `:159-180`); add `hyperspace.jumps` the same way if a count is needed.

---

### `src/app/mode.ts` (conditional)

**Analog:** itself. The chart freeze may become a screen/mode variant (CONTEXT discretion).

Current table (`mode.ts:16-39`):

```ts
export type ModeTransition = "launch" | "launchComplete" | "dock";
export type AppScreen = "docked" | "flight";

export function advanceMode(mode: FlightMode, transition: ModeTransition): FlightMode { ... }

export function screenForMode(mode: FlightMode): AppScreen {
  return mode === "docked" ? "docked" : "flight";
}
```

If the chart/save-load screens are modelled as `AppScreen` values, extend `screenForMode`; otherwise leave this module untouched and keep the flags in `GameSession`. Do not add a `paused` mode — `paused` is orthogonal by design (`mode.ts:4-14`).

---

### `src/input/actions.ts` and `src/input/keyboard.ts` (input)

**Analog:** themselves.

**Action table, defaults, reserved keys, contexts** (`actions.ts:13-45`, `:88-120`, `:180-230`):

```ts
export type ActionId = ... | "stationSellMax" | "stationBuyMax";

export type InputContext = "flight" | "dockHome" | "dockScreen";

export const DEFAULT_BINDINGS: Readonly<Record<ActionId, readonly string[]>> =
  Object.freeze({
    ...
    stationConfirm: Object.freeze(["Enter", "KeyY"]),
    stationCancel: Object.freeze(["KeyN"]),
  });

/** F-keys the browser would otherwise reload or open on. */
export const RESERVED_F_KEYS: ReadonlySet<string> = new Set([
  "F3", "F5", "F7", "F8",
]);
```

```ts
export const ACTION_CONTEXTS: Readonly<Record<ActionId, readonly InputContext[]>> =
  Object.freeze({
    pause: contexts("flight", "dockHome", "dockScreen"),
    launch: contexts("flight", "dockHome"),
    stationBack: contexts("dockScreen"),
    ...
  });
```

**Keyboard dispatch** (`keyboard.ts:40-46`, `:122-144`, `:175-196`, `:245-253`):

```ts
const EDGE_COMMANDS: Readonly<Partial<Record<ActionId, Command>>> = {
  torus: { kind: "toggleTorus" },
  launch: { kind: "launch" },
  dockingComputer: { kind: "dockingComputer" },
  compassCycle: { kind: "cycleCompass" },
  targetStation: { kind: "targetStation" },
};
```

```ts
function inContext(action: ActionId): boolean {
  return ACTION_CONTEXTS[action]?.includes(context) === true;
}
...
if (action === "pause") {
  if (context === "dockScreen" && code === "Escape") continue;
  pauseToggle = true;
  continue;
}
```

```ts
setContext(next) {
  if (next === context) return;
  context = next;
  held.clear();
  pending.length = 0;
  stationActions.length = 0;
}
```

**What to copy:**
- Add actions: `chart` (F6), `hyperspace` (KeyH), `saveLoad` (F2), `chartUp/Down/Left/Right` (arrows), `chartConfirm` (Enter), `chartRange` (Tab), `chartBack` (Escape), `saveScreenSave/Load/Return/Confirm/Cancel` (KeyY/KeyN etc.).
- Add them to `ACTION_IDS`, `DEFAULT_BINDINGS`, `ACTION_LABELS`, `ACTION_CONTEXTS`, and add `"F2"`/`"F6"` to `RESERVED_F_KEYS`.
- Add `InputContext` values `"chart"` and `"saveScreen"`; every new action is scoped to exactly one of them.
- Generalise the Escape exception (`keyboard.ts:178`) to the panel contexts (e.g. `context !== "flight"`) so Escape closes the chart/F2 instead of toggling pause; keep `KeyP` universal (RESEARCH Pitfall 12).
- Extend `EDGE_COMMANDS` only with `hyperspace: { kind: "beginHyperspace" }`; chart/save-screen navigation is drained via a screen-action queue like `stationActions`, or handled synchronously by the open sink.
- `setContext` already clears queues; no change needed to that mechanism.

---

### `src/ui/station-model.ts` (view model)

**Analog:** itself — `buildStatusModel` already renders the F5 line.

**Current placeholder** (`station-model.ts:300`, `:330-340`):

```ts
const UNKNOWN_HYPERSPACE_SYSTEM = "(Unknown)";
...
const fields: LabelledField[] = [
  { label: "Commander", value: COMMANDER_NAME },
  { label: "Ship", value: SHIP_NAME },
  { label: "Present System", value: system.name },
  { label: "Hyperspace System", value: UNKNOWN_HYPERSPACE_SYSTEM },
  ...
];
```

**What to copy:**
- Add a `targetSystemName: string | undefined` parameter (or a `hyperspaceTarget` field on the model) and use `UNKNOWN_HYPERSPACE_SYSTEM` only when no target is committed.
- Keep the model pure and text-only; the name comes from the same system catalogue, never from the save string.
- Update `tests/ui/station-status.test.ts` expectations accordingly.

---

### `src/main.ts` (boot composition root)

**Analog:** itself.

**Allow-list construction + parse/backup order** (`main.ts:114-189`):

```ts
const saveStore = createIndexedDbSaveStore();
let saveStatus: SaveStatus;
let bootSave: SaveV1 | undefined;
let allowLists: SaveAllowLists = {
  equipment: new Set(),
  systems: new Set(),
  stations: new Set(),
  commodities: new Map(),
};
try {
  const [equipment, catalogue, commodities] = await Promise.all([...]);
  allowLists = {
    equipment: new Set(equipment.map((item) => item.key)),
    systems: new Set(galaxy0().map((system) => system.id)),
    stations: new Set(
      catalogue
        .filter((entry) => entry.shipDef.subentities.some((s) => s.isDock === true))
        .map((entry) => entry.key),
    ),
    // Only tradeable goods can be persisted; Alien Items is visible but
    // never held, so it is deliberately absent from the allow-list.
    commodities: new Map(
      commodities
        .filter((item) => item.tradeable && item.key !== "alien_items")
        .map((item) => [item.key, item.unit]),
    ),
  };
  const read = await saveStore.read();
  if (read.kind === "ok") {
    const parsed = parseSave(read.raw, allowLists);
    if (parsed.ok) { saveStatus = "valid"; bootSave = parsed.save; }
    else if (parsed.reason === "future-version") { saveStatus = "future"; }
    else if (parsed.reason === "corrupt") {
      saveStatus = "corrupt";
      await saveStore.backupCorrupt(read.raw).catch(() => undefined);
    }
    else if (parsed.reason === "unreadable") { saveStatus = "unreadable"; }
    else { saveStatus = "absent"; }
  } else if (read.kind === "absent") { saveStatus = "absent"; }
  else { saveStatus = "unavailable"; }
} catch {
  saveStatus = "unavailable";
}
```

**What to copy:**
- Add `marketGoods: new Set(commodities.map((item) => item.key))` (all 17) beside `commodities` (16 tradeable). Do not derive it from `commodities`.
- Change the `SaveV1` type import to `SaveV2`; `parseSave` now returns v2 after migration.
- Keep the read → parse → classify → backup order verbatim. The Continue path (`main.ts:295-303`) must pass the same parsed save; F2 Load shares the same `parseSave`.
- Keep allow-lists derived only from validated content; never hardcode system ids.

---

### `index.html` (markup)

**Analog:** existing `#docked` / `#pause` markup.

**Station shell + footer ownership** (`index.html:487-573`, `:617-624`):

```html
<div id="docked" hidden>
  <header class="station-header">
    <span class="station-header-system" data-field="system"></span>
    <span class="station-header-credits" data-field="credits"></span>
  </header>
  <section id="station-screen" data-screen="home" tabindex="-1">
    ...
  </section>
  <div class="station-footer">
    <p data-field="station-keys"></p>
    <p data-field="station-confirm" role="status"></p>
    <p data-field="station-notice"></p>
    <p data-field="station-save"></p>
  </div>
</div>
...
<footer>Wegolite is an unofficial fan project. ...</footer>
```

**What to copy:**
- Add `<div id="chart" hidden>` and `<div id="save-load" hidden>` as siblings of `#docked`, before `#pause`.
- Reuse `station-header` and a `<div class="station-footer">` for footer-style text. **Never add a second `<footer>`** — the global disclaimer is the only one (`station.ts:4-11`).
- `#chart` holds one `<canvas id="chart-canvas">` plus `[data-field="chart-target"]`, `chart-distance`, `chart-fuel`, `chart-keys`.
- `#save-load` holds a slot line and controls with `data-save-action="save|load|return"`, plus a hidden `[Y/N]` confirmation line.
- Keep `hidden` on both; the session toggles them. Pause stays `z-index: 20`; new overlays at the station layer.

---

### `tests/persistence/save.test.ts` and `tests/persistence/autosave.test.ts` (existing tests)

**Analog:** themselves.

**What to copy / change:**
- `save.test.ts`: the v1 accept table becomes a **migration** table. Keep `version: 1` blobs expecting `ok: true` with `version: 2` output. Move the "future" fixture to `version: 3` and add v2-with-unknown-key as `corrupt`.
- `autosave.test.ts`: update `SaveInputs` construction for `mode`/`market`/pose; add round-trip cases for docked and in-flight; assert the restored pose/clock/mode exactly. Reuse `MemorySaveStore` and `laveFixture()` (`autosave.test.ts:15-57`).
- Keep the real `stepFlight` usage; do not mock the sim.

---

### `tests/e2e/autosave.spec.ts` (existing e2e)

**Analog:** itself.

**Two fixtures to move** (`autosave.spec.ts:479`, `:684`):

```ts
const future = JSON.stringify({
  version: 2,
  mode: "docked",
  clockSeconds: CLOCK_START + 600,
  credits: 999_999,
  equipment: [],
  system: { id: "g0-s7" },
  station: { key: "coriolis-station" },
  futureBuild: "leave this alone",
});
```

**What to copy / change:**
- Both `version: 2` future fixtures become `version: 3`; keep the `futureBuild` unknown key as the assertion that future blobs are untouched.
- The oversized-future case at `:684` still pads with `MAX_SAVE_CHARS`; re-read the import so it uses the new 65,536 bound.
- Add a new *corrupt v2* case (e.g. `market` with an unknown goods key) to prove v2 classification.
- Do not weaken any byte-identity assertion.

---

## Shared Patterns

### Pure-sim boundary
**Source:** `tests/guards/sim-purity.test.ts:145-193`, `eslint` zone + `tsconfig.sim.json`
**Apply to:** `src/sim/hyperspace/*.ts`, `src/sim/flight/state.ts`, `src/sim/flight/step.ts`, `src/sim/economy/market.ts`

```ts
// The gate proves: a `three` import in src/sim fails lint; `document` fails typecheck + lint.
// New sim files must import only ../math.js, ../hash.js and type-only content types.
```

### Deterministic time and randomness
**Source:** `src/sim/time.ts:1-13`, `src/sim/hash.ts:12-21`, `src/sim/math.ts:227`
**Apply to:** countdown, arrival, market reseed, chart ordering

```ts
export { DT, MAX_FRAME_DELTA, MAX_STEPS_PER_FRAME } from "./step.js";
// use fnv1a32(...) >>> 0 and createSeededRandom; never Math.random/Date.now in src/sim
```

### Command/event boundary
**Source:** `src/sim/commands.ts:13-25`, `src/sim/events.ts:24-40`
**Apply to:** hyperspace start/cancel, countdown/jump/refusal events

Rule: commands are payload-free tagged values; facts travel via read-only `StepOptions`; events carry data, never UI strings.

### One save pipeline, one validator
**Source:** `src/persistence/save.ts:215-371`
**Apply to:** boot reader, autosave writer, migration output, F2 Load

```ts
parseSave → (migrateV1ToV2) → SaveV2Schema → validateSaveSemantics → allow-lists
encodeSave → isEncodedSaveValid (same validator, "write") → store.write
```

Never create a parallel parser, validator or store. Invalid snapshots leave the previous bytes untouched.

### Build-before-swap scene install
**Source:** `src/app/scene-manager.ts:95-139`
**Apply to:** hyperspace arrival, F2 Load, Continue

```ts
const layout = deriveSystemLayout(system, stationDef);
const next = createSystemScene(layout, assets, system);
applyViewport(next.camera, rendererSize(renderer));
// install next; only then retire the previous scene
```

### DOM overlay shell
**Source:** `src/ui/station.ts:4-20`, `:61-84`, `:309-320`; `src/ui/title.ts:72-154`
**Apply to:** `chart.ts`, `save-load.ts`, `index.html`

- `textContent` only; `requireElement` for every queried node.
- Non-focusable rows for selectable lists; buttons only for real controls.
- One writer per footer field; one `<footer>` in the document.
- `AbortController` owns listeners; `dispose()` aborts.

### Canvas lifecycle / paint-on-change
**Source:** `src/render/hud/hud.ts:87-125`
**Apply to:** `chart.ts`

- Backing store = CSS size × min(DPR, 2); skip 0×0.
- Repaint on open/selection/range/resize only; skip `renderFrame` while the overlay is open.

### Probe as the only browser proof
**Source:** `src/app/probe.ts:200-251`, `:362-398`
**Apply to:** chart, hyperspace, save/load

Add optional groups; publish from the session; every e2e wait reads `window.__wegolite`, never a screenshot or a fixed sleep.

### Bounded restore / hostile input
**Source:** `src/persistence/save.ts:46-59`, `:215-284`; `src/sim/flight/sanitize.ts:33-103`
**Apply to:** v2 pose and market fields

Size cap before `JSON.parse`; strict schema bounds; semantic allow-lists; normalise orientation; `sanitizeFlightState` as defence in depth, not the primary bound.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/sim/hyperspace/arrival.ts` | utility | transform | No existing module derives a pose from a hash; nearest is `launch.ts` for pose assignment + `hash.ts` for determinism. Use RESEARCH § "Deterministic witchpoint arrival" for the hash-to-offset mapping. |
| `src/ui/chart.ts` | component | render-on-change | No existing DOM+Canvas overlay; it combines `station.ts` (DOM shell) and `hud.ts` (canvas lifecycle). No single analog covers both. |
| `src/ui/save-load.ts` | component | request-response | No existing standalone non-pause overlay with Save/Load/Return; `title.ts` supplies the confirmation/focus pattern only. |
| `src/app/mode.ts` | state machine | request-response | Conditional: only touched if the chart freeze is modelled as a new `AppScreen`. The flag-in-session option needs no change. |
| `src/sim/flight/sanitize.ts` | utility | transform | Conditional: no change expected unless a new numeric `FlightState` field can arrive non-finite. |

---

## Metadata

**Analog search scope:** `src/sim/**`, `src/ui/**`, `src/persistence/**`, `src/app/**`, `src/input/**`, `src/render/hud/**`, `tests/**`, `index.html`
**Files scanned:** 40+ (graph index + targeted reads; every cited analog opened against the working tree)
**Pattern extraction date:** 2026-11-06
**Tracked-source check:** `git ls-files --` run for every analog path; all are tracked source, none under `.gsd/capabilities/**`
**Notable integration facts for the planner:**
- `src/persistence/save.ts:44` currently pins `SAVE_VERSION = 1`; `main.ts:120` and `game-session.ts:62` import `SaveV1` directly.
- `src/app/game-session.ts:244` still destructures `system` from options; Phase 6 must make it mutable.
- `src/ui/station-model.ts:300` holds the only `"(Unknown)"` hyperspace placeholder.
- `tests/e2e/autosave.spec.ts:479` and `:684` are the two `version: 2` future fixtures (move to 3).
- `tests/guards/sim-purity.test.ts` will automatically cover `src/sim/hyperspace/**` via the `src/sim` glob; no guard edit is needed.
