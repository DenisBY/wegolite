# Phase 5: Docked Economy & Station Screens - Pattern Map

**Mapped:** 2026-11-05
**Files analysed:** 36 plan targets (17 new-file rows, 19 modified/regenerated rows), excluding generated JSON payloads
**Analogs found:** 34 / 36 strong matches; 2 partial (`src/app/station-controller.ts`, `tests/ui/*`), both called out in the No-Analog table

**Source gate:** every analog path below was checked with `git ls-files` and is tracked repository source. No `.gsd/capabilities/**` mirror paths are used.

> **Owner amendment (2026-11-05) — supersedes the seed/market patterns below.** The market is seeded by one persisted `marketSeed` (`marketSeedForSystem(systemId) = Number.parseInt(fnv1a32("<systemId>:0"), 16) >>> 0`), written through `snapshotForSave`; there is no `arrivalCounter` and a `docked` event never re-seeds. The missile-removal entry charges 200 dc then refunds the full catalogue value of every mounted missile; berth removal stays 1000 dc with no refund. Market goldens are `{ version, systemId, marketSeed, goods }`. Read the patterns below with those four corrections; see `05-CONTEXT.md` D-10/D-15/D-17/D-18/D-19.

---

## File Classification

### New files

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/sim/economy/ranrot.ts` | utility | generator / transform | `src/sim/math.ts` (`createSeededRandom`) + `src/sim/hash.ts` (`fnv1a32`) | role-match |
| `src/sim/economy/market.ts` | domain service | transform (pure generation) | `src/sim/world/layout.ts` (`deriveSystemLayout`) | exact for purity, partial for domain |
| `src/sim/economy/cargo.ts` | domain utility | transform (integer arithmetic) | `src/sim/player/profile.ts` (bounds/integer rules) | role-match |
| `src/sim/economy/trade.ts` | domain service | CRUD / transactional state transition | `src/sim/player/profile.ts` (`canPurchase`/`purchase`) | exact for trust shape |
| `src/sim/player/outfitting.ts` | domain service | request-response (availability + transaction) | `src/sim/player/profile.ts` (`canPurchase`) | role-match |
| `src/content/commodities.ts` | loader | file-I/O (build artifact) | `src/content/equipment.ts` | exact |
| `src/content/labels.ts` | loader | file-I/O (build artifact) | `src/content/equipment.ts` | exact |
| `src/ui/station.ts` | controller / component | event-driven + request-response | `src/ui/docked.ts` + `src/ui/pause.ts` | role-match |
| `src/ui/station-model.ts` | view-model utility | transform | `src/app/hud-model.ts` | exact |
| `src/app/station-controller.ts` (optional) | controller | event-driven state machine | `src/app/game-session.ts` event switch | partial / optional split |
| `tests/golden/market/{lave,zaonce,leesti}.json` | fixture | data | `tests/golden/content/commodities.json` | exact |
| `tests/helpers/commodities.ts` | test helper | file-I/O | `tests/helpers/lave.ts` | exact |
| `tests/sim/economy/{market,cargo,trade}.test.ts` | test | unit | `tests/sim/player-profile.test.ts` | exact |
| `tests/sim/player/outfitting.test.ts` | test | unit | `tests/sim/player-profile.test.ts` | exact |
| `tests/ui/station-{market,outfitting,status,system-data}.test.ts` | test | unit (view models) | `tests/hud/format.test.ts` / `tests/app/*.test.ts` | role-match (new `tests/ui/` dir) |
| `tests/input/station-actions.test.ts` | test | unit (state machine) | `tests/input/bindings.test.ts` | exact |
| `tests/e2e/station.spec.ts` | test | browser / probe | `tests/e2e/docking.spec.ts` | exact |

### Modified files

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `src/content/schemas/commodity.ts` | schema | transform | itself (add `peakExport`/`peakImport`, resolve `name`) | exact |
| `tools/oolite-ingest/convert/commodities.ts` | build converter | transform | itself (add peaks + description resolution) | exact |
| `tools/oolite-ingest/generate.ts` | build wiring | file-I/O | itself (pass parsed descriptions) | exact |
| `src/sim/player/profile.ts` | domain model | CRUD | itself (extend `PlayerProfile`, keep unique `equipment`) | exact |
| `src/persistence/save.ts` | persistence schema | transform / validation | itself (optional additive fields + commodity allow-list) | exact |
| `src/persistence/autosave.ts` | persistence adapter | file-I/O | itself (`snapshotForSave`/`restoreFromSave`) | exact |
| `src/input/actions.ts` | config / action map | event dispatch | itself (add actions + `ACTION_CONTEXTS`) | exact |
| `src/input/keyboard.ts` | input adapter | event-driven | itself (add `setContext`, shift variants) | exact |
| `src/app/game-session.ts` | composition root | orchestration | itself (market lifetime, trades, station wiring) | exact |
| `src/app/probe.ts` | observability | transform | itself (additive `station`/`economy`) | exact |
| `src/main.ts` | composition root | bootstrap | itself (`createDockedPanel` call site) | exact |
| `index.html` | markup + CSS | DOM | itself (`#docked` root and terminal CSS) | exact |
| `src/ui/docked.ts` | component | DOM | itself (superseded by/grown into `station.ts`) | exact |
| `tests/e2e/docking.spec.ts` | test | browser | itself (remove `buy-dockcomp` assertions → F3) | exact |
| `tests/persistence/{save,autosave}.test.ts` | test | unit | themselves (extend for new fields) | exact |
| `tests/sim/player-profile.test.ts` | test | unit | itself (mechanical `PlayerProfile` literal sweep) | exact |
| `tools/oolite-ingest/convert/commodities.test.ts` | test | golden | itself (add `name`/peaks anchors) | exact |
| `src/content/generated/commodities.json` + `manifest.json` | generated content | data | regenerate only | exact |
| `tests/golden/content/commodities.json` | golden content | data | regenerate only | exact |

---

## Pattern Assignments

### `src/sim/economy/ranrot.ts` (utility, generator)

**Analogs:** `src/sim/math.ts` (seeded PRNG), `src/sim/hash.ts` (seed derivation)

**Module/export shape** (`src/sim/math.ts:224-236`):

```ts
/**
 * Seeded PRNG (mulberry32). The ESLint zone already promises "the seeded PRNG
 * in sim/math", so the promise lives here: render code that needs a stable
 * starfield/dust layout takes a seed from content and never calls Math.random.
 */
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

**Seed hash pattern** (`src/sim/hash.ts:12-21`):

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

**Rules to copy for the new module**
- Named export only; no default export.
- File begins with `// SPDX-License-Identifier: GPL-2.0-or-later` and copyright.
- Return an object/closure (`{ randf(): number }`), not a class.
- Use `>>> 0` after every 32-bit add/shift; `Math.imul` for multiplies.
- Seed from the persisted `marketSeed`; a new game derives it with `marketSeedForSystem(systemId) = Number.parseInt(fnv1a32("<systemId>:0"), 16) >>> 0`.
- Document the RANROT `MakeRanrotSeed` three-mix-round initialisation and that `randf()` is 16-bit granular.

**Do not:** import `Math.random`, `Date`, `performance`, Three.js, or content runtime modules. Lint forbids them under `src/sim` (`eslint.config.js:120-126`).

---

### `src/sim/economy/market.ts` (domain service, pure transform)

**Analog:** `src/sim/world/layout.ts` (`deriveSystemLayout`, lines 122-135)

**Pure derivation shape** (`src/sim/world/layout.ts:122-135`):

```ts
export function deriveSystemLayout(
  system: System,
  stationDef: ShipDef,
): SystemLayout {
  const planetRadius = system.radiusKm * 10;
  const planet = vec(0, 0, -system.planetDistance);

  // Positions use the authored vector verbatim; only directions are normalised.
  const stationVector = toWegolite(system.stationVector);
  const station = sub(planet, scale(stationVector, 2 * planetRadius));
  const stationToPlanet = normalizeVec(sub(planet, station));
  ...
}
```

**In-repo content boundary** (`src/content/types.ts:4-25`): `src/sim` may import **types only** from `src/content/types.js`. `market.ts` must therefore take `readonly Commodity[]` as an argument, never call `loadCommodities()`.

**Rules to copy**
- Signature `generateMarket(system, commodities, seed): Market` with plain-data inputs.
- Return a new immutable value (`readonly` fields; `readonly goods: readonly MarketGood[]`).
- Put constants at module top with doc comments (`export const MARKET_LIMIT = 127`).
- Include the Oolite provenance comment (`OOCommodities.m:383-411`, `MAIN_SYSTEM_MARKET_LIMIT`).
- Formula implementation follows RESEARCH §Economy Formula exactly: `Math.fround` in C grouping, quantity before price, four `randf()` calls per good, truncation toward zero, stock-only 127 cap.

**Test analog:** `tests/sim/player-profile.test.ts:18-42` shows Node tests reading committed JSON with `readFileSync`, not Vite `?raw`.

---

### `src/sim/economy/cargo.ts` (domain utility, integer transform)

**Analog:** `src/sim/player/profile.ts` (validated integer rules and refusal returns)

**Validation/return shape** (`src/sim/player/profile.ts:70-86, 98-120`):

```ts
function isValidPrice(price: number): boolean {
  return (
    Number.isSafeInteger(price) && price > 0 && price <= MAX_EQUIPMENT_PRICE
  );
}

export function canPurchase(
  profile: PlayerProfile,
  item: EquipmentRecord,
  techLevelRaw: number,
): PurchaseCheck {
  if (
    !isValidTechLevel(item.techLevel) ||
    !Number.isSafeInteger(techLevelRaw) ||
    techLevelRaw < item.techLevel
  ) {
    return { ok: false, reason: "techLevel" };
  }
  ...
}
```

**Rules to copy**
- Small pure named functions; no state, no throw for expected refusals.
- Constants documented with the Oolite source line: `KILOGRAMS_PER_POD = 1000`, `MAX_KILOGRAMS_IN_SAFE = 499`, `GRAMS_PER_POD = 1_000_000`, `MAX_GRAMS_IN_SAFE = 499_999`.
- Capacity function takes the profile/equipment, not a DOM or catalogue:
  `capacityPods = 20 + (has cargo bay ? 15 : 0) - 5 * passengerBerths`.
- Pod arithmetic uses exactly `floor((podSize - safe - 1 + quantity) / podSize)`, not plain division.
- Every numeric input validated with `Number.isSafeInteger` before arithmetic.

---

### `src/sim/economy/trade.ts` (domain service, CRUD/transaction)

**Analog:** `src/sim/player/profile.ts` — the trusted transaction pattern.

**Re-check + immutable return** (`src/sim/player/profile.ts:131-145`):

```ts
export function purchase(
  profile: PlayerProfile,
  item: EquipmentRecord,
): PlayerProfile {
  if (!isValidKey(item.key) || !isValidPrice(item.price)) return profile;
  if (profile.equipment.includes(item.key)) return profile;
  if (profile.equipment.length >= MAX_EQUIPMENT_KEYS) return profile;
  if (!isSafeCredits(profile.credits) || profile.credits < item.price) {
    return profile;
  }

  const credits = profile.credits - item.price;
  if (!isSafeCredits(credits)) return profile;
  return { credits, equipment: [...profile.equipment, item.key] };
}
```

**Session-side defence-in-depth** (`src/app/game-session.ts:354-364`):

```ts
function buyDockComputer(): void {
  const item = dockComputer;
  if (item === undefined) return;
  // The gate is re-checked here, not trusted from the disabled button: the
  // click path and the panel state share one rule (T-04-43).
  if (!canPurchase(profile, item, system.techLevelRaw).ok) {
    refreshDockedProfile();
    return;
  }
  if (commitProfile(purchase(profile, item))) autosave();
}
```

**Rules to copy**
- Export `planBuy`, `planSell`, `applyBuy`, `applySell` as named functions.
- `apply*` must re-run the plan and return the input objects unchanged on refusal; never trust the UI.
- Return a discriminated result with fixed refusal enum values (UI owns copy).
- Never subtract before approval; never return negative or non-safe credits.
- Return a **new** `Market` with only the traded good's stock changed; price never changes.
- Use `readonly` interfaces exactly as RESEARCH §Trading sketches.

---

### `src/sim/player/outfitting.ts` (domain service, availability + transaction)

**Analog:** `src/sim/player/profile.ts` (`canPurchase`, ownership/tech-level order)

**Rules to copy**
- Availability is a pure function of `(profile, item, context)`; context carries `techLevelRaw`, `fuelCapacity`, `missileCapacity`, `availablePods`.
- Follow `canPurchase`'s check order: tech level → owned → invalid price → credits.
- Add only the five v1 condition rules from RESEARCH §Outfitting. Do **not** build a condition-script evaluator.
- Refusal is a string union; UI maps each to literal copy (`Requires TL N`, `Already installed`, `Not enough credits`, `Pylons full`, `No cargo space`, `Full tank`).
- Fuel price: `(70 - profile.fuel) * 2` integer decicredits.
- Missile/berth instances are **counts**, not duplicate equipment keys.

---

### `src/content/commodities.ts` and `src/content/labels.ts` (loaders, file-I/O)

**Analog:** `src/content/equipment.ts` — copy this file almost verbatim.

**Imports + error class + parser** (`src/content/equipment.ts:18-73`):

```ts
import { EquipmentSchema } from "./schemas/equipment.js";
import type { Equipment } from "./schemas/equipment.js";

const EQUIPMENT_PATH = "./generated/equipment.json";

const lazyEquipment = import.meta.glob("./generated/equipment.json", {
  query: "?raw",
  import: "default",
});

export class EquipmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EquipmentError";
  }
}

export function parseEquipment(value: unknown): readonly Equipment[] {
  if (!Array.isArray(value)) {
    throw new EquipmentError(
      "Wegolite: the equipment catalogue is not an entry array.",
    );
  }

  const seen = new Set<string>();
  const records: Equipment[] = [];
  for (const [index, candidate] of value.entries()) {
    const result = EquipmentSchema.safeParse(candidate);
    if (!result.success) {
      const issue = result.error.issues[0];
      const where =
        issue === undefined || issue.path.length === 0
          ? "record"
          : issue.path.join(".");
      throw new EquipmentError(
        `Wegolite: equipment entry ${String(index)} is invalid at ${where}: ${
          issue === undefined ? "unknown issue" : issue.message
        }.`,
      );
    }
    if (seen.has(result.data.key)) {
      throw new EquipmentError(
        `Wegolite: the equipment catalogue repeats key "${result.data.key}".`,
      );
    }
    seen.add(result.data.key);
    records.push(result.data);
  }
  return records;
}
```

**Cached loader + lookup** (`src/content/equipment.ts:75-109`):

```ts
let cachedEquipment: Promise<readonly Equipment[]> | undefined;

export function loadEquipment(): Promise<readonly Equipment[]> {
  cachedEquipment ??= (async () => {
    const load = lazyEquipment[EQUIPMENT_PATH];
    if (load === undefined) {
      throw new EquipmentError(
        `Wegolite: expected the equipment catalogue at ${EQUIPMENT_PATH}, but it is missing.`,
      );
    }
    const parsed: unknown = JSON.parse(await load()) as unknown;
    return parseEquipment(parsed);
  })();
  return cachedEquipment;
}

export function findEquipment(
  catalogue: readonly Equipment[],
  key: string,
): Equipment {
  const entry = catalogue.find((candidate) => candidate.key === key);
  if (entry === undefined) {
    throw new EquipmentError(
      `Wegolite: the equipment catalogue has no entry with key "${key}".`,
    );
  }
  return entry;
}
```

**Rules to copy**
- `*_PATH` constant, `import.meta.glob(..., { query: "?raw", import: "default" })`.
- Export `parseX` separately so Node tests can exercise committed bytes.
- Named error class; throw, never warn or return `[]`.
- Cache the promise once (`??=`).
- Duplicate keys are a hard error for equipment/commodities; labels is a record, so validate its arrays/templates through `LabelsSchema`.
- **Naming:** `CommoditiesError`/`parseCommodities`/`loadCommodities`/`findCommodity`; `LabelsError`/`parseLabels`/`loadLabels`.

**Note:** `src/content/labels.ts` does **not** exist today. It is required by F7/D-05. This is a new loader, not a modification.

---

### `src/ui/station.ts` (controller/component, event-driven)

**Analogs:** `src/ui/docked.ts` (docked root ownership) and `src/ui/pause.ts` (show/hide/focus/lifecycle).

**API + require helpers + lifecycle** (`src/ui/docked.ts:30-42, 44-77`):

```ts
export interface DockedPanel {
  show(systemName: string): void;
  hide(): void;
  setMessage(text: string): void;
  setCredits(text: string): void;
  setDockComputer(view: DockComputerView): void;
  onLaunch(handler: () => void): void;
  onBuyDockComputer(handler: () => void): void;
  dispose(): void;
}

function requireField(root: HTMLElement, field: string): HTMLElement {
  const element = root.querySelector(`[data-field="${field}"]`);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Wegolite: the docked panel is missing "${field}".`);
  }
  return element;
}

export function createDockedPanel(root: HTMLElement): DockedPanel {
  const systemField = requireField(root, "system");
  ...
  const controller = new AbortController();
  ...
}
```

**Show/hide/focus/dispose shape** (`src/ui/pause.ts:42-48, 82-105`):

```ts
export function createPauseOverlay(options: PauseOverlayOptions): PauseOverlay {
  const { root, gameRoot, onResume, onControls, onSettings } = options;
  ...
  const controller = new AbortController();
  let open = false;
  ...
  window.addEventListener("keydown", onKeyDown, { signal: controller.signal });

  return {
    show(): void {
      open = true;
      root.hidden = false;
      resume.focus();
    },
    hide(): void {
      open = false;
      root.hidden = true;
      gameRoot.focus();
    },
    isOpen(): boolean {
      return !root.hidden;
    },
    dispose(): void {
      controller.abort();
    },
  };
}
```

**Concrete patterns the planner must require**
- Keep the root id `#docked` so existing e2e visibility assertions survive.
- One `AbortController` owns every listener; `dispose()` calls `abort()`.
- `root.hidden` is the single visibility switch.
- Every dynamic string is `element.textContent = ...`; forbid `innerHTML`.
- `requireField`/`requireButton` throw a named `Wegolite: ... is missing` error at construction.
- `show()` takes the system and refreshes the header; `setMessage` writes `[data-field="message"]` inside `#docked`.
- On opening a section, set focus to the active `<section>` (`tabindex="-1"`, `.focus({ preventScroll: true })`) but keep activation in the action layer.
- Expose a query-free API (e.g. `renderStation(view)`, `setScreen(name)`, `onAction(handler)`) rather than letting the session read DOM nodes.
- Remove `setDockComputer`/`onBuyDockComputer` from the public API; the F3 screen replaces the Phase 4 line.

**File placement decision for the planner:** RESEARCH recommends a new `src/ui/station.ts`. Either (a) move the shell to `station.ts` and reduce `docked.ts` to a home-screen builder/re-export, or (b) rewrite `docked.ts` in place while exporting `createStationShell`. Pick one and state it; `src/main.ts:101` must switch constructors in the same plan. Do not keep two live controllers.

---

### `src/ui/station-model.ts` (view-model utility, pure transform)

**Analog:** `src/app/hud-model.ts` — pure, Node-testable projection returning strings/flags.

**Shape** (`src/app/hud-model.ts:114-141`):

```ts
export function buildHudModel(
  state: FlightState,
  layout: SystemLayout,
  config: FlightConfig,
  message: string,
  flashAlpha = 0,
): HudModel {
  const aegis: AegisStatus = aegisStatus(state.position, layout);

  return {
    speed: state.speed,
    clockSeconds: state.clockSeconds,
    message: clampMessage(message, MAX_MESSAGE_CHARS),
    ...
    speedText: formatSpeed(state.speed),
    fuelText: formatFuel(config.maxFuel),
    clockText: formatClock(state.clockSeconds),
  };
}
```

**Rules to copy**
- Named `build*Model` functions; one file, four exports:
  `buildMarketModel`, `buildOutfittingModel`, `buildStatusModel`, `buildSystemDataModel`.
- Inputs are plain data/types; no DOM, no Three.js, no content loaders.
- Output contains only strings, numbers, booleans, and `readonly` arrays of row objects.
- Formatting helpers live beside the builders and are exported for direct unit tests.
- Keep integer decicredits (`priceDc`) in the model; format only with the integer formatter:
  `${Math.trunc(dc / 10)}.${dc % 10} Cr` (or reuse `formatCredits`).
- Never use `toFixed` for money arithmetic. `formatCredits` (`profile.ts:66-68`) is already exact for safe integers.

---

### `src/app/station-controller.ts` (optional controller, event-driven)

**Analog:** the `handleEvent` switch in `src/app/game-session.ts:600-640`.

**Event switch shape** (`src/app/game-session.ts:600-640`):

```ts
function handleEvent(event: SimEvent): void {
  switch (event.kind) {
    case "launched":
      launchSequence.reset();
      docked.hide();
      ...
      autosave();
      break;
    ...
    case "docked": {
      lastDockClockDelta = event.clockDelta;
      launchSequence.reset();
      docked.show(system.name);
      refreshDockedProfile();
      ...
    }
  }
}
```

**Guidance**
- There is no existing standalone controller analog. The simplest faithful route is to keep screen/selection/pending state **inside `game-session.ts`** beside `profile` and `market`, and keep `src/ui/station.ts` purely presentational.
- If the planner splits it out, follow session conventions: a `createX(options)` factory returning an interface, all mutable state in closure locals, no DOM reads, and injected callbacks for `onTrade`/`onPurchase`/`onBack`.
- Either way, the session is the only owner of `market`, `marketSeed`, `profile`, `commitProfile`, and `autosave`.

---

### `src/persistence/save.ts` (schema, validation) — modified

**Analog:** itself; extend without changing the trust order.

**Current strict object** (`src/persistence/save.ts:78-96`):

```ts
export const SaveV1Schema = z.strictObject({
  version: z.literal(SAVE_VERSION),
  mode: z.literal("docked"),
  clockSeconds: z
    .number()
    .int()
    .min(CLOCK_START)
    .max(CLOCK_START + MAX_SAVE_CLOCK_DELTA),
  credits: z.number().int().min(0).max(MAX_SAVE_CREDITS),
  equipment: z
    .array(z.string().min(1).max(MAX_SAVE_EQUIPMENT_KEY_CHARS))
    .max(MAX_SAVE_EQUIPMENT),
  system: z.strictObject({
    id: z.string().min(1).max(MAX_SAVE_SYSTEM_ID_CHARS),
  }),
  station: z.strictObject({
    key: z.string().min(1).max(MAX_SAVE_STATION_KEY_CHARS),
  }),
});
```

**Allow-list + duplicate rejection** (`src/persistence/save.ts:206-222`):

```ts
  // The schema proves the shape; the allow-lists prove the referents exist. A
  // duplicate key is corrupt because it would restore an ambiguous profile.
  const seen = new Set<string>();
  for (const key of save.equipment) {
    if (seen.has(key) || !allow.equipment.has(key)) {
      return { ok: false, reason: "corrupt" };
    }
    seen.add(key);
  }
  if (!allow.systems.has(save.system.id)) {
    return { ok: false, reason: "corrupt" };
  }
  if (!allow.stations.has(save.station.key)) {
    return { ok: false, reason: "corrupt" };
  }

  return { ok: true, save };
```

**Canonical writer** (`src/persistence/save.ts:269-280`):

```ts
export function encodeSave(inputs: SaveInputs): string {
  const save: SaveV1 = {
    version: SAVE_VERSION,
    mode: "docked",
    clockSeconds: inputs.clockSeconds,
    credits: inputs.credits,
    equipment: [...inputs.equipment],
    system: { id: inputs.systemId },
    station: { key: inputs.stationKey },
  };
  return JSON.stringify(save);
}
```

**Rules the planner must state**
- Add new fields as **optional** on the existing `z.strictObject` (no version bump).
- Cargo is an **entry array** (`{ key, quantity }`), bounded `MAX_SAVE_CARGO_ENTRIES = 17`; never a keyed object.
- Add `commodities: ReadonlyMap<string, CommodityUnit>` to `SaveAllowLists` (the unit map is needed by `podsFor`/`holdPodsUsed`); reject unknown/duplicate/zero/non-tradeable cargo keys as `corrupt`.
- Validate `holdPodsUsed(cargo) <= capacityPods(equipment, passengerBerths)` inside `parseSave`; over-capacity is `corrupt`, not clamped.
- Keep `equipment` unique; encode missiles/berths as counts (`MAX_SAVE_MISSILES = 3`, `MAX_SAVE_BERTHS = 7`, `MAX_SAVE_FUEL = 70`).
- Update `SaveInputs`/`encodeSave`/`snapshotForSave` together.
- Preserve the exact parse order: size cap → parse → future version → shape family → schema → allow-lists.
- Update `MAX_SAVE_CHARS` derivation comment for 17 cargo entries; keep the cap.

---

### `src/persistence/autosave.ts` (adapter, file-I/O) — modified

**Analog:** itself.

**Snapshot** (`src/persistence/autosave.ts:38-55`):

```ts
export function snapshotForSave(
  state: FlightState,
  profile: PlayerProfile,
  system: { readonly id: string },
  station: { readonly key: string },
): SaveInputs {
  return {
    clockSeconds: Math.floor(state.clockSeconds),
    credits: profile.credits,
    equipment: [...profile.equipment],
    systemId: system.id,
    stationKey: station.key,
  };
}
```

**Restore factory signature** (`src/persistence/autosave.ts:91-106`):

```ts
export function restoreFromSave(
  save: SaveV1,
  layout: SystemLayout,
  profileFactory: (
    credits: number,
    equipment: readonly string[],
  ) => PlayerProfile,
): RestoredGame {
  ...
  return {
    state,
    profile: profileFactory(save.credits, [...save.equipment]),
  };
}
```

**Rules to copy**
- Extend `snapshotForSave` to project `cargo` sorted by commodity `sortOrder`, plus `fuel`, `missiles`, `passengerBerths`.
- Change the restore factory to `profileFromSave(save)` (single trusted object), because the current two-argument factory cannot carry cargo/fuel/counts.
- Defaults for a missing Phase 4 blob: `cargo: {}`, `fuel: 70`, `missiles: 3`, `passengerBerths: 0`.
- Update `game-session.ts:1054-1059` and the persistence tests in the same plan.
- Do not change `queueAutosave`'s failure semantics.

---

### `src/input/actions.ts` (action map) — modified

**Analog:** itself.

**Action ids + defaults + shift metadata** (`src/input/actions.ts:13-26, 55-70, 97-99`):

```ts
export type ActionId =
  | "pitchForward"
  ...
  | "precision";

export const DEFAULT_BINDINGS: Readonly<Record<ActionId, readonly string[]>> =
  Object.freeze({
    ...
    pause: Object.freeze(["KeyP", "Escape"]),
    launch: Object.freeze(["Digit1", "F1"]),
    ...
  });

export const SHIFT_REQUIRED_ACTIONS: ReadonlySet<ActionId> = new Set<ActionId>([
  "dockingComputer",
]);
```

**Rules to copy**
- Add station actions to `ActionId`, `ACTION_IDS`, `DEFAULT_BINDINGS`, `ACTION_LABELS`.
- Add `InputContext` and `ACTION_CONTEXTS` metadata in this file.
- Keep `SHIFT_REQUIRED_ACTIONS` for "only valid with Shift"; add `SHIFT_VARIANT_ACTIONS` for plain/shift pairs (`stationLeft → stationSellMax`, `stationRight → stationBuyMax`).
- Defaults: `stationMarket ["F8","Digit8"]`, `stationOutfitting ["F3","Digit3"]`, `stationStatus ["F5","Digit5"]`, `stationSystemData ["F7","Digit7"]`, `stationBack ["Escape","Backspace"]`, arrows, `Enter`/`KeyY`, `KeyN`, `Tab`/`PageDown`/`PageUp`.
- `pause`/`launch` fire only in `flight` + `dockHome`; station screens only `dockHome` + `dockScreen`; row actions only `dockScreen`.

---

### `src/input/keyboard.ts` (input adapter) — modified

**Analog:** itself.

**Code-to-action index** (`src/input/keyboard.ts:51-61`):

```ts
function buildCodeToActions(map: BindingMap): Map<string, ActionId[]> {
  const result = new Map<string, ActionId[]>();
  for (const action of ACTION_IDS) {
    for (const code of map[action] ?? []) {
      const existing = result.get(code);
      if (existing === undefined) result.set(code, [action]);
      else existing.push(action);
    }
  }
  return result;
}
```

**Chord resolution to extend** (`src/input/keyboard.ts:95-125`):

```ts
keyDown(code, repeat = false, mods) {
  const actions = codeToActions.get(code);
  if (actions === undefined) return false;
  if (repeat) return true;

  const shiftRequired = actions.filter((action) =>
    SHIFT_REQUIRED_ACTIONS.has(action),
  );
  const useShift = mods?.shift === true && shiftRequired.length > 0;
  const firing = useShift
    ? shiftRequired
    : actions.filter((action) => !SHIFT_REQUIRED_ACTIONS.has(action));
  if (!useShift) held.add(code);

  for (const action of firing) {
    if (action === "pause") {
      pauseToggle = true;
      continue;
    }
    const command = EDGE_COMMANDS[action];
    if (command !== undefined) pending.push({ ...command });
  }
  return true;
}
```

**Frame + listener** (`src/input/keyboard.ts:129-138, 196-210`):

```ts
frame(): InputFrame {
  return {
    pitch:
      (pressed("pitchBack") ? 1 : 0) - (pressed("pitchForward") ? 1 : 0),
    roll: (pressed("rollRight") ? 1 : 0) - (pressed("rollLeft") ? 1 : 0),
    speed: (pressed("speedUp") ? 1 : 0) - (pressed("speedDown") ? 1 : 0),
    precision: pressed("precision"),
  };
},
```

```ts
function onKeyDown(event: KeyboardEvent): void {
  if (isTextTarget(event.target)) return;
  if (
    (event.ctrlKey || event.metaKey || event.altKey) &&
    !MODIFIER_CODES.has(event.code)
  ) {
    return;
  }
  if (state.keyDown(event.code, event.repeat, { shift: event.shiftKey })) {
    event.preventDefault();
  }
}
```

**Rules to copy**
- Add `context` closure state and `setContext()`/`getContext()` to `InputState`.
- Filter `firing` by `ACTION_CONTEXTS[action].includes(context)` before the shift/chord logic.
- Return a zero axis frame when context is not `"flight"`.
- Resolve shift variants explicitly; do not add plain arrow actions to `SHIFT_REQUIRED_ACTIONS`.
- `preventDefault()` stays in the listener for any bound code. Browser-reserved F-keys must be bound now so `event.preventDefault()` runs; `Digit*` remain the advertised path.
- Keep `event.code`, never `event.key`.

---

### `src/app/game-session.ts` (composition root) — modified

**Analog:** itself.

**Economy state beside flight state** (`src/app/game-session.ts:218-226`):

```ts
  let equipmentCatalogue: readonly Equipment[] | undefined;
  let dockComputer: Equipment | undefined;
  let stationKey: string | undefined;
  // Economy state lives beside the flight state, never inside it (D-10).
  let profile: PlayerProfile = newProfile();
  let lastDockClockDelta = 0;
```

**Commit + autosave** (`src/app/game-session.ts:336-364`):

```ts
  function refreshDockedProfile(): void {
    docked.setCredits(formatCredits(profile.credits));
    docked.setDockComputer(dockComputerView());
  }

  function commitProfile(next: PlayerProfile): boolean {
    if (next === profile) return false;
    profile = next;
    onProfileChanged(profile);
    refreshDockedProfile();
    return true;
  }

  function buyDockComputer(): void {
    ...
    if (commitProfile(purchase(profile, item))) autosave();
  }
```

**Autosave trigger shape** (`src/app/game-session.ts:436-477`): record `saveAttempts` first; skip on status/taint; `snapshotForSave(...)`; increment revision/writes; `void queueAutosave(...).then(...)`; never await in the frame loop.

**Docked event + launch** (`src/app/game-session.ts:600-640`, `1156-1164`):

```ts
      case "docked": {
        lastDockClockDelta = event.clockDelta;
        launchSequence.reset();
        docked.show(system.name);
        refreshDockedProfile();
        ...
        input?.clearAll();
        ...
        break;
      }
```

```ts
    title.hide();
    docked.show(system.name);
    refreshDockedProfile();
    docked.onLaunch(() => {
      pending.push({ kind: "launch" });
    });
    docked.onBuyDockComputer(() => {
      buyDockComputer();
    });
```

**Rules to copy**
- Add session locals: `let market: Market | undefined`, `let marketSeed: number | undefined`, `let commodities: readonly Commodity[] | undefined`, `let labels: Labels | undefined`.
- Load commodities/labels where equipment is loaded (`src/app/game-session.ts:1010-1016`): `const equipment = await loadEquipment();` and set the local. Extend the same `Promise.all`/try-catch.
- Generate the market once at session start (while docked) from `marketSeed = restore.marketSeed ?? marketSeedForSystem(system.id)`; a `docked` event reuses the in-memory market and never re-seeds or regenerates.
- Trade/purchase path: shell action → `plan*`/`canFit` → footer text → confirm → session method → `apply*` → `commitProfile(next)` → `autosave()`.
- Do **not** autosave on market generation, screen navigation, rejected actions, or selection changes.
- Keep `Command` payload-free: trade requests are session calls, not new `Command` variants.
- Dispose order: add the station shell's `dispose()` beside `docked.dispose()` (`src/app/game-session.ts:1219-1253`).
- `Esc` handling must not rely on the capture-phase workaround at `543-577`; the context filter is the owner.

---

### `src/app/probe.ts` (observability) — modified

**Analog:** itself; additive contract.

**Additive optional fields** (`src/app/probe.ts:148-195`):

```ts
export interface WegoliteProbe {
  ...
  /** Live docking counters; plan 04-03 extends this with bounce/shake/flash. */
  dock?: WegoliteDockProbe;
  /** Live autosave state; absent on the failure surface. */
  save?: WegoliteSaveProbe;
  ...
  /** Present only under `?test=1`. */
  test?: WegoliteTestHook;
}
```

**Rules to copy**
- Add `station?: WegoliteStationProbe` and `economy?: WegoliteEconomyProbe`; never rename/remove existing fields.
- Publish the object once (`publishProbe`, `src/app/probe.ts:203-206`); mutate the same object from the session.
- Probe shapes exactly as RESEARCH §Evidence shapes.
- Add `setFuel`/`setMissiles` to `WegoliteProfileTestHook` only if needed; they must mark taint via `onMutate` and never persist (see `setCredits`, `src/app/probe.ts:278-284`).
- Update `publishFailure` with any non-optional new top-level field; optional fields can stay absent.

---

### `index.html` (markup + CSS) — modified

**Analog:** itself.

**Current root/CSS** (`index.html:122-131`):

```css
      #docked {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 8, 3, 0.88);
        color: #33ff66;
        font: 18px/1.7 monospace;
      }
```

**Current markup** (`index.html:359-389`):

```html
    <div id="docked" hidden>
      <section class="panel" aria-labelledby="docked-title">
        ...
        <p class="docked-message" data-field="message" role="status"></p>
        <div class="docked-actions">
          <button type="button" data-action="buy-dockcomp">
            Buy docking computer
          </button>
          <button type="button" data-action="launch">Launch</button>
        </div>
      </section>
    </div>
```

**Rules to copy**
- Keep `id="docked"` and `data-field="message"` (Phase 4 e2e depends on them).
- Replace the single `.panel` with `header` / `nav` / `<section data-screen="...">` / `footer`.
- Keep black/green monospace tokens (`#33ff66` on black, `18px/1.7`).
- Screens fully cover the canvas (`position: absolute; inset: 0`); pause stays above (`z-index: 20`).
- Use semantic landmarks (`header`, `nav`, `section`, `footer`) and `role="status"` on the message line.
- Remove the `buy-dockcomp` button and its `dockcomp-message` span; F3 replaces them.

---

### `src/content/schemas/commodity.ts` (schema) — modified

**Analog:** itself.

**Current strict record** (`src/content/schemas/commodity.ts:25-42`):

```ts
export const CommoditySchema = z.strictObject({
  key: z.string(),
  name: z.string(),
  classes: z.array(z.string()),
  unit: CommodityUnitSchema,
  podConversion: PodConversionSchema,
  priceAverage: z.number().int(),
  priceEconomic: z.number(),
  priceRandom: z.number(),
  quantityAverage: z.number(),
  quantityEconomic: z.number(),
  quantityRandom: z.number(),
  legalityExport: z.number().int(),
  legalityImport: z.number().int(),
  trumbleOpinion: z.number(),
  sortOrder: z.number().int(),
  tradeable: z.boolean(),
});
```

**Rules**
- Add `peakExport: z.number().int().min(0).max(7)` and `peakImport` (same bounds). Strict object: both are required once emitted.
- `name` becomes the resolved display string; `key` remains identity.
- Update the module doc that currently says the five ratios are the only reals.
- Keep `podConversion` carried metadata; do not derive pod rules in the schema.

---

### `tools/oolite-ingest/convert/commodities.ts` (build converter) — modified

**Analog:** itself.

**Projection** (`tools/oolite-ingest/convert/commodities.ts:159-238`): `project()` builds the `candidate`, validates with `CommoditySchema.safeParse`, and throws `contentError("SCHEMA", ...)` on a missing/invalid field. Quote the existing pattern:

```ts
  const candidate = {
    key: entryKey,
    name: readString(dict, "name", `${construct}.name`),
    ...
  };

  const result = CommoditySchema.safeParse(candidate);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw contentError(
      "SCHEMA",
      FILE,
      issue === undefined ? construct : `${construct}.${issue.path.join(".")}`,
      {
        excerpt:
          issue === undefined ? "invalid commodity record" : issue.message,
      },
    );
  }
  return result.data;
```

**Emit** (`tools/oolite-ingest/convert/commodities.ts:287-317`): explicit field-by-field canonical JSON mapping. Add `peakExport`/`peakImport` and emit the resolved `name`.

**Rules**
- `compileCommodities(parsed, descriptions)` gains a second parameter; resolve `commodity-name ${key}` from the parsed descriptions dictionary.
- A missing description key is a build `SCHEMA` failure; never fall back to the token.
- Keep the sort and duplicate `sortOrder` validation (`241-284`).
- `emitCommodities(parsed, descriptions)` passes both to `compileCommodities`.
- `tools/oolite-ingest/generate.ts:139-145` already has `descriptions` parsed from `descriptions.plist`; pass it into `emitCommodities`.

---

### `tests/` (unit, golden, e2e)

**Analog:** `tests/sim/player-profile.test.ts`, `tests/persistence/save.test.ts`, `tests/persistence/autosave.test.ts`, `tests/input/bindings.test.ts`, `tests/e2e/docking.spec.ts`.

**Node JSON fixture helper** (`tests/helpers/lave.ts:27-30, 44-72`):

```ts
function readJson<T>(relativePath: string): T {
  const raw = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  return JSON.parse(raw) as T;
}
```

**Save accept/reject table** (`tests/persistence/save.test.ts:20-44`):

```ts
const ALLOW: SaveAllowLists = {
  equipment: new Set(["EQ_DOCK_COMP", "EQ_FUEL"]),
  systems: new Set(["g0-s7"]),
  stations: new Set(["coriolis-station"]),
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
```

**Input state test style** (`tests/input/bindings.test.ts:18-40`): drive `createInputState` directly, no synthetic `KeyboardEvent`; assert exact tables and chord resolution.

**E2E probe style** (`tests/e2e/docking.spec.ts:371-401`, `tests/e2e/helpers/probe.ts`): collect `console`/`pageerror`, assert `probe` values and `locator.textContent()`, never screenshots.

**Golden content comparison** (`tools/oolite-ingest/convert/commodities.test.ts:35-58`): parse committed golden with `readFileSync`, deep-equal against compiled records.

**Rules to copy**
- Unit tests live under `tests/<layer>/`; view-model tests go in the new `tests/ui/` directory.
- Golden JSON goes under `tests/golden/market/`, versioned `{ version, systemId, marketSeed, goods }`, compared exactly.
- Each economy test reads the committed `commodities.json` through a `tests/helpers/commodities.ts` helper rather than a Vite import.
- Extend the existing reject table for new save failures: unknown commodity key, duplicate cargo key, over-capacity hold.
- E2E specs must boot through `startNewGame` / the existing probe helpers and assert `console.error` is empty.
- Container commands only: `docker compose run --rm test`, `docker compose run --rm e2e`, `docker compose run --rm verify`.

---

## Shared Patterns

### Determinism and `src/sim` purity
**Sources:** `src/sim/hash.ts:12-21`, `src/sim/math.ts:224-236`, `eslint.config.js` sim zone.
**Apply to:** `src/sim/economy/**`, `src/sim/player/outfitting.ts`.
- No DOM, no Three.js, no `Math.random`, no `Date.now`, no `performance.now`.
- Import content **types only** from `src/content/types.js`.
- Seed from the persisted `marketSeed` through `fnv1a32`; never a wall clock and never an arrival counter.

### Content trust boundary
**Source:** `src/content/equipment.ts:41-73`.
**Apply to:** `src/content/commodities.ts`, `src/content/labels.ts`, session content loads.
- `?raw` + `JSON.parse` + strict zod schema.
- Export the parser for Node tests.
- Named error classes; throw on missing/invalid/repeated keys.
- Do not hand-edit `src/content/generated/**`; regenerate with `docker compose run --rm assets` and gate with `assets:check`.

### Trusted transaction path
**Sources:** `src/sim/player/profile.ts:131-145`; `src/app/game-session.ts:354-364`.
**Apply to:** buy/sell/fit/remove.
- UI shows a plan; session re-runs the plan before applying.
- Refusal returns the same object; no partial mutation.
- Commit is `commitProfile(next)` then `autosave()`.
- Money stays integer decicredits; never subtract before approval.

### DOM safety and lifecycle
**Sources:** `src/ui/docked.ts:44-124`, `src/ui/pause.ts:42-105`.
**Apply to:** `src/ui/station.ts`, any new screen module.
- `textContent` only; `innerHTML` forbidden.
- One `AbortController` per controller; `dispose()` aborts it.
- `hidden` toggles visibility; `requireField`/`requireButton` throw at construction.
- Focus moves on show but activation stays in the action layer.
- Re-render on state change only, never per animation frame.

### Additive probe contract
**Source:** `src/app/probe.ts:148-195`.
**Apply to:** `src/app/probe.ts` + e2e.
- Add fields; never rename/remove.
- Mutate one live object.
- Evidence is numeric/state assertions plus console errors, never pixels.

### Save schema discipline
**Sources:** `src/persistence/save.ts:78-96, 160-223`; `src/persistence/autosave.ts:38-55`.
**Apply to:** cargo/fuel/missiles/berths persistence.
- Optional additive fields on strict v1; old blobs keep parsing.
- Entry arrays, never keyed objects.
- Allow-list every commodity/equipment key.
- Capacity validation is part of `parseSave`.
- `queueAutosave` never throws and never replaces a good blob with an invalid one.

### Naming, placement, and export shape
- Files: lowercase kebab where needed (`station-model.ts`, `station-controller.ts`); modules otherwise single nouns (`market.ts`, `cargo.ts`).
- Exports: named only; `createX` for controllers, `buildXModel` for view models, `deriveX`/`generateX` for pure derivations, `loadX`/`parseX` for content, `planX`/`applyX` for transactions.
- Types/interfaces: `readonly` fields; discriminated unions for refusals (`{ ok: true } | { ok: false; reason: ... }`).
- Errors: named `class XError extends Error` with `this.name = "XError"`.
- Tests mirror source: `tests/sim/economy/*.test.ts`, `tests/sim/player/outfitting.test.ts`, `tests/ui/*.test.ts`, `tests/input/*.test.ts`, `tests/e2e/*.spec.ts`.
- Package imports use `.js` extensions; relative imports from `src/sim` to content use `../content/types.js` type-only.

---

## No Analog Found / Planner Must Specify

| File | Role | Data Flow | Reason | Planner action |
|------|------|-----------|--------|----------------|
| `src/content/labels.ts` | loader | file-I/O | No labels loader exists today; only the `LabelsSchema` type and generated JSON. | Follow `src/content/equipment.ts` exactly; export `parseLabels`/`loadLabels` and a `LabelsError`. |
| `src/app/station-controller.ts` | controller | event-driven | No standalone UI state-machine module exists; the only event switch is inside `game-session.ts`. | Prefer keeping screen/selection/pending state in `game-session.ts`; only split if the file becomes unwieldy, and then follow the `createX(options)` closure/factory shape. |
| `tests/ui/*` | test | unit (view models) | `tests/ui/` does not exist yet. | Create the directory; follow `tests/hud/format.test.ts` + `tests/sim/player-profile.test.ts` imports and `describe`/`it` style. |
| `src/sim/economy/*` (as a family) | domain modules | pure transforms | No economy package exists; closest purity analog is `src/sim/world/layout.ts`. | Take plain data in, return plain data; no content loader; use only `src/content/types.js` type imports. |
| `tests/golden/market/*.json` | fixture | data | No market goldens exist. | Generate from the implementation, commit `{ version, systemId, marketSeed, goods }`, compare exactly; never hard-code RESEARCH's computed table. |
| `src/ui/station.ts` DOM structure | controller | DOM | No multi-screen/terminal shell exists; only single panels. | Follow RESEARCH §Station Screens shell and the `docked.ts`/`pause.ts` lifecycle; keep `#docked` and `data-field="message"`. |
| `index.html` station shell markup | markup | DOM | No full-screen terminal shell exists. | Build from RESEARCH §Station Screens and existing terminal tokens; do not add a CSS framework. |

---

## Planner Checklist (copy into plan actions)

1. **Content first:** schema fields → converter → `generate.ts` → regenerate → content golden → drift check.
2. **Pure core second:** `ranrot.ts` → `market.ts` → `cargo.ts` → `trade.ts` → `outfitting.ts`, each with its Node test and market goldens.
3. **Profile + persistence third:** extend `PlayerProfile` (cargo/fuel/missiles/berths), `SaveV1Schema`, `snapshotForSave`/`restoreFromSave`, then sweep every `PlayerProfile` literal in tests.
4. **Input fourth:** `actions.ts` (`ActionId`, defaults, contexts, shift variants) → `keyboard.ts` (`setContext`, filtering, zero frame) → `tests/input/station-actions.test.ts`.
5. **View models fifth:** `station-model.ts` + `tests/ui/*` before any DOM.
6. **Shell sixth:** `index.html` → `station.ts` → `main.ts`/`game-session.ts` wiring → remove `buy-dockcomp`.
7. **Probe + e2e last:** `probe.station`/`probe.economy` → `tests/e2e/station.spec.ts` → update `tests/e2e/docking.spec.ts`.
8. **Gate:** `docker compose run --rm verify` green; no host Node/npm; no dependency changes.

---

## Metadata

**Analog search scope:** `src/sim/**`, `src/content/**`, `src/ui/**`, `src/input/**`, `src/app/**`, `src/persistence/**`, `tests/**`, `tools/oolite-ingest/**`, `index.html`.
**Files read:** 21 tracked analog sources plus RESEARCH/CONTEXT/AGENTS.
**Analog selection rule:** same role + same data flow first; then same role; then same purity/DOM boundary. Recent Phase 3/4 modules preferred over legacy.
**Pattern extraction date:** 2026-11-05.
**Tracked-source verification:** all named analog paths pass `git ls-files` (21/21).
