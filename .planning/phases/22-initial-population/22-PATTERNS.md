# Phase 22: Initial Population - Pattern Map

**Mapped:** 2026-11-26
**Files analyzed:** 31 new or modified (27 at mapping time; the `traders.ts`, `pirates.ts`, `police.ts` and `streams.ts` rows were added at plan revision 2)
**Analogs found:** 29 / 31 (all analog paths verified git-tracked: `tools/ai-harness/*`, `tests/oracles/npc/*`, `src/sim/**`, `tests/**`)

Line numbers below were read this session; verify with `rg -n` before quoting in a plan, since small edits may shift them.

**Test path note (plan revisions 1 and 2):** the plans place every population test under `tests/sim/world/population/`, and `22-VALIDATION.md` uses the same paths; since plan revision 2 the rows and sections below use them too. `22-RESEARCH.md` keeps the names used at mapping time: `tests/sim/world/populate-system.oracle.test.ts` is now `tests/sim/world/population/{plan,traders,groups}.oracle.test.ts` (one replay per builder family), `tests/sim/world/populate-system.test.ts` is `tests/sim/world/population/spawn.test.ts`, `tests/sim/world/census.test.ts` is `tests/sim/world/population/census.test.ts`, and `tests/sim/world/population-cadence.test.ts` is `tests/sim/world/population/cadence.test.ts`; `tests/sim/world/neighbourhood.test.ts` keeps its name. The analogs are unchanged.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `tools/ai-harness/populator-host.ts` | utility (stub host, recorder) | event-driven (script callbacks) | `tools/ai-harness/host.ts` | exact |
| `tools/ai-harness/populator-record.ts` | utility (driver, CLI) | batch / file-I/O | `tools/ai-harness/load.ts` + `spike.test.ts` | role-match |
| `tools/ai-harness/population-systems.ts` | utility (selector) | transform | `tools/ai-harness/dist-check.ts` (tool-style module) | partial |
| `tests/oracles/population/schema.ts` | model (zod contract) | transform | `tests/oracles/npc/schema.ts` | exact |
| `tests/oracles/population/population.self.test.ts` | test | request-response | `tests/oracles/npc/reference.self.test.ts` | exact |
| `tests/oracles/population/fixtures/*.json` | config (committed fixtures) | file-I/O | `tests/oracles/npc/fixtures/*.json` | exact (shape differs) |
| `tests/guards/harness-isolation.test.ts` (modify) | test (guard) | file-I/O | itself | exact |
| `src/sim/world/neighbourhood.ts` | utility (pure) | transform | `src/sim/hyperspace/jump.ts` `chartDistance` | role-match |
| `src/sim/world/population/table.ts` | config (frozen table) | transform | `src/sim/world/populate.ts` `INERT_POPULATION` (:108) | role-match |
| `src/sim/world/population/plan.ts` | service (pure planner) | transform | `src/sim/world/populate.ts` `planInertPopulation` (:273) | role-match |
| `src/sim/world/population/groups.ts` | service (builders) | transform | `populate.ts` `planInertPopulation` + `pickRecord` (:179) | role-match |
| `src/sim/world/population/traders.ts` | service (builders: freighters, couriers, smugglers) | transform | `populate.ts` `planInertPopulation` + `pickRecord` (:179); section "plan.ts and groups.ts" | role-match |
| `src/sim/world/population/pirates.ts` | service (builders: independent pirates, pirate packs) | transform | `populate.ts` `planInertPopulation` + `pickRecord` (:179); section "plan.ts and groups.ts" (its draw discipline) and the shared pattern "Determinism bans" | role-match |
| `src/sim/world/population/police.ts` | service (builders: light hunters, police patrols, interceptors) | transform | `populate.ts` `planInertPopulation` + `pickRecord` (:179); section "plan.ts and groups.ts" | role-match |
| `src/sim/world/population/streams.ts` | utility (per-group forked draw streams) | transform | `src/sim/rng.ts` `forkSeed` (:161-171); the shared pattern "Forked stateless streams" | role-match |
| `src/sim/world/population/kit.ts` | utility | transform | none in repo for float32 clamp; see No Analog | partial |
| `src/sim/world/population/escorts.ts` | utility | transform | `src/sim/npc/escort.ts` `escortCoordinates` (:46) | role-match |
| `src/sim/world/population/spawn.ts` | service (atomic spawn) | CRUD | `populate.ts` `populateInertWorld` (:374); `src/sim/ai/test-spawn.ts` (rollback) | role-match |
| `src/sim/world/placement.ts` (modify: WITCHPOINT) | utility | transform | itself (`locationByCode` :177) | exact |
| `src/sim/world/limits.ts` (modify: reserve, maybe `MAX_WORLD_GROUPS`) | config | n/a | itself (:290-309) | exact |
| `src/sim/rng.ts` (modify: purpose `pop`) | utility | transform | itself (`RNG_PURPOSE_CODES` :107) | exact |
| `src/sim/world/step.ts` `repairWorldFields` (modify) | utility | transform | itself (older records) | exact |
| `src/content/schemas/ship-npc.ts` (modify: `hyperspaceMotor`) | model | transform | `autoWeapons` / `hasScoop` fields (:204-211) | exact |
| `tools/oolite-ingest/convert/npc-ships.ts` (+ test) | service (converter) | transform | `fuzzyExtra(... "auto_weapons")` (:889) | exact |
| `tests/content/ships-npc.test.ts` (modify) | test | transform | its `autoWeapons` key lists (:545, :564) | exact |
| `src/app/session/traffic.ts` (`createSystemPopulate`, record bridge) | service | request-response | `createInertPopulate` in same file | exact |
| `src/app/session/start-session.ts:519`, `tests/helpers/tick-script.ts:264` (modify) | provider / test helper | request-response | `createInertPopulate(` call sites | exact |
| `tests/sim/world/population/{plan,traders,groups}.oracle.test.ts` (replay) | test | transform | `tests/sim/world/blast.oracle.test.ts` | role-match |
| `tests/sim/world/neighbourhood.test.ts`, `tests/sim/world/population/census.test.ts` | test | batch | `tests/sim/world/populate.test.ts:845-897` galaxy sweep | exact |
| `tests/sim/world/population/cadence.test.ts` | test | event-driven | `tests/sim/world/v5-cadence.test.ts` | exact |
| `tests/e2e/anarchy.spec.ts` (modify) / new QUAL-09 spec | test (browser) | request-response | `tests/e2e/anarchy.spec.ts`, `tests/e2e/helpers/budgets.ts` | exact |
| Spike: throwaway OXP + `tools/oolite-reference/steps/*.steps` | utility | batch | `tools/oolite-reference/steps/docked.steps` | role-match |

## Pattern Assignments

### `tools/ai-harness/populator-host.ts` (stub host; event-driven)

**Analog:** `tools/ai-harness/host.ts` (576 lines), `tools/ai-harness/load.ts` (134 lines).

**Sentinel and one-way isolation** (`host.ts:30-31`): every harness file must carry or import the sentinel so the `check:dist` scan and the `harness-isolation` guard cover it.
```typescript
/** Distinctive string a shipped bundle would contain if the harness leaked. */
export const AI_HARNESS_SENTINEL = "wegolite-ai-harness-sentinel-3d8f61a2";
```

**Counted read, missing-member inventory** (`host.ts:74`, `:267`, `:317-318`): the host exposes `inventory.missing: Map<string, number>`; any member the script reads that the stub cannot answer is bumped there and returns `undefined`. Use it in the first recorder run to find the exact set of host APIs the populator needs (RESEARCH "Host APIs the stub must provide"; assumption A11).

**Scripted draw** (`host.ts:327-336`): one counted replacement for `Math.random`; throws when exhausted.
```typescript
const draw = (): number => {
  const value = draws[drawn];
  // throws `scripted draws exhausted after N draws` when undefined
  trace.push({ kind: "draw", index: drawn, value });
  drawn += 1;
  return value;
};
```
Extend, do not copy blindly: the populator recorder needs a per-site tag on every draw (RESEARCH Pattern 1). Wrap the script's helper properties (`_setWeapons`, `_setSkill`, `_setMissiles`, `_setFuel`, `_nearby*System`, `_weightedNearbyTradeSystem`) as plain properties of the loaded `worldScripts["oolite-populator"]` global and set a "current tag" around each call.

**Context creation, getters that count reads** (`load.ts:75-105`):
```typescript
const sandbox: Record<string, unknown> = {};
const members = { ...host.globals, ...extra, __harnessDraw: host.draw };
for (const [key, value] of Object.entries(members)) {
  Object.defineProperty(sandbox, key, {
    configurable: true, enumerable: true,
    get(): unknown { /* bump host.inventory.globals */ return value; },
  });
}
const context = createContext(sandbox, { name });
enter(target, RANDOM_INSTALLER, "install Math.random", `harness:${name}`);
```
`RANDOM_INSTALLER` is `"Math.random = __harnessDraw; delete globalThis.__harnessDraw;"` (`load.ts:35-36`).

**Entry timeout** (`load.ts:30`, `:46-56`): every entry into Oolite code goes through `runInContext(source, context, { filename, timeout: ENTRY_TIMEOUT_MS })`. Copy the `enter()` helper, including its file-header comment that `vm` is not a security boundary and only pinned operator files are read.

**Pinned file read**: `readPinned(root, relative)` joins only a fixed relative name. For the populator use one constant `POPULATOR_FILE = "Resources/Scripts/oolite-populator.js"` (and `oolite-global-prefix.js` only if the stub does not supply `scrambledPseudoRandomNumber`). Record sha256 of the file (begins `96a734a6cfc1ee39`) and pin `7437f22` in the fixture header.

**Cross-check independence:** the stub's `systemsInRange` / `distanceToSystem` must be a separate transliteration of `legacy_random.h:154-160` (RESEARCH "Neighbourhood facts"). Do not import `src/sim/hyperspace/jump.ts` from `tools/` for this.

**Tests-skipped-without-checkout pattern:** `tools/ai-harness/spike.test.ts` skips unless `OOLITE_SRC` is set. Copy that gating for any test that re-runs the vm; CI replays committed fixtures only.

---

### `tools/ai-harness/populator-record.ts` (driver; batch, file-I/O)

**Analog:** `tools/ai-harness/load.ts` (`loadAiLibrary`) and `tools/ai-harness/spike.test.ts` (driving a loaded context).

Pattern to copy: `loadAiLibrary` builds the context, runs the file, stores the global in `host.worldScripts[...]`; the driver then calls `callInContext(ctx, "this.systemWillPopulate()")`, runs each registered entry callback `groupCount` times with a plain vector position, and serialises the trace. Write via `node:fs` to `--out`. Run command (RESEARCH, Docker only):
```bash
docker compose run --rm -v /home/opencode/git/oolite:/oolite:ro -e OOLITE_SRC=/oolite test \
  npx tsx tools/ai-harness/populator-record.ts --out tests/oracles/population/fixtures
```

---

### `tests/oracles/population/schema.ts` (zod contract)

**Analog:** `tests/oracles/npc/schema.ts` (532 lines).

**Rules to copy** (`schema.ts:1-27`): header documents conventions; the file imports `zod` only (guard `tests/guards/oracle-independence.test.ts` forbids any other import under `tests/oracles/**` except `node:*`, `vitest`, and relative paths inside `tests/oracles`). Use `z.object({...}).strict()`; closed vocabulary arrays with `as const`; vectors as `[x, y, z]`.
```typescript
import { z } from "zod";
export const ORACLE_FRAME_TOLERANCE = 1e-9;
export const ORACLE_FIELDS = [ /* closed list */ ] as const;
```
The population schema adds: header with `scriptSha256`, `oolitePin`, per-entry `{ordinal, name, location, countDraws, count}`, per-group tagged draw arrays (u32 integers, `value = u / 2^32`), recorded property writes, engine-model calls, and `posIn.z`/`posOut.z` for the `% 100000` tweak.

---

### `tests/oracles/population/population.self.test.ts`

**Analog:** `tests/oracles/npc/reference.self.test.ts`.

**Structure to copy** (`:1-60`): header states the oracle must be correct before the port; reads fixtures with `readdirSync` over `fileURLToPath(new URL("./fixtures/", import.meta.url))`; helper `readJson`; every fixture parses with the strict schema; internal invariants only (draw accounting, "sum of group sizes equals recorded ship list"); no `src/` import.
```typescript
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
const FIXTURE_DIR = fileURLToPath(new URL("./fixtures/", import.meta.url));
function readJson(path: string): unknown { return JSON.parse(readFileSync(path, "utf8")) as unknown; }
```
Add the `OOLITE_SRC`-gated sha256 re-hash case (pattern: `tests/contract/fidelity.test.ts` "checks each excerpt when OOLITE_SRC points at a tree at commit 7437f22").

---

### `tests/guards/harness-isolation.test.ts` (modify)

**Analog:** itself (`:1-40`). It already forbids imports of `tools/ai-harness` from `src/`, `public/`, `index.html`, root `vite*.config.ts`, and any file containing `AI_HARNESS_SENTINEL`. New files in `tools/ai-harness/` are covered by the directory scope; add a case only if the guard enumerates file names. Also confirm `tools/ai-harness/dist-check.ts` scanning needs no new marker (new markers: `populator-host`, `oolite-populator`).

---

### `src/sim/world/neighbourhood.ts` (pure; transform)

**Analog:** `src/sim/hyperspace/jump.ts` (`chartDistance`, `MAX_JUMP_DIST = 17`, lines ~43 and 87-90).
```typescript
const dx = from.x - to.x;
// Math.trunc, never Math.floor: C integer division truncates toward zero.
const dy = Math.trunc((from.y - to.y) / 2);
const dist = Math.trunc(Math.sqrt(dx * dx + dy * dy));
```
Use integer thresholds (7 LY = `dist <= 17`, 3.5 LY = `dist <= 8`, 25 LY = `dist <= 62`), never `0.4 * dist <= range`. Result in system-id order, same galaxy only. Port `_systemIsBottleneck` (`oolite-populator.js:2542-2583`) as written. Input is plain `{ id, systemIndex, x, y, government, economy, techLevelRaw }[]` (no content import; `techLevelRaw` is plist `techlevel` with no +1, `src/content/schemas/system.ts:20`). The app supplies `ctx.core.galaxy` (`src/app/session/context.ts:380`, `readonly galaxy: readonly System[]`).

**Test:** recorded all-2,048 table asserts equality (ids within 7 and 3.5 LY and bottleneck), following the sweep shape in `tests/sim/world/populate.test.ts:845-872` (read `src/content/generated/systems/g0.json`..`g7.json` with `readFileSync(new URL(..., import.meta.url))`).

---

### `src/sim/world/population/table.ts` (frozen entry table)

**Analog:** `src/sim/world/populate.ts` `INERT_POPULATION` (`:108`, `Object.freeze([...])` of `PopulationEntry`). Copy the freeze idiom and the "append-only ordinals" note. Entries carry: ordinal, script name, `LocationCode`, builder id, status keep/cut. The cut table (medium and heavy hunters, assassins, Thargoids, asteroids, hermits, buoys, aegis raiders, and only the `switchAI` write of opportunists) lives next to it and the replay test asserts every cut against the fixture's entry list.

---

### `src/sim/world/population/plan.ts` and `groups.ts`

**Analog:** `src/sim/world/populate.ts` `planInertPopulation` (`:273`), `pickRecord` (`:179`), `parseRoleToken` (`:135`), `isScanClass` (`:125`). These are exported; import them, do not edit `populate.ts` (frozen, RESEARCH anti-patterns).

**Imports** (`populate.ts:50-60` conventions: `.js` suffixes on relative imports, `import type` separated):
```typescript
import type { Quat, Vec3 } from "../math.js";
import { createRngState, forkSeed, rngNext } from "../rng.js";
import type { RngState } from "../rng.js";
import type { SpawnInit } from "./entity.js";
import { locationByCode, randomQuaternion } from "./placement.js";
```
(from the `population/` subdirectory the relative prefix gains one `../`).

**Totality** (`populate.ts` header lines ~38-44): a record whose scan class is outside `SCAN_CLASSES` is dropped before planning; a `spawnEntity` refusal is skipped; every rejection loop is capped. Role matching by `===` over arrays only, never objects keyed by role names (T-12-17).

**Draw discipline:** per-site tagged forks (RESEARCH Pattern 1 and "Per-group forked streams"). `randomise` always takes 3 draws; `_setWeapons` 1 draw even for an integer level; pack class loops 2 draws even when the count is <= 0; `couriers *= 1.5` ported as written (Pitfall 1). Use `Math.sqrt(x*x+y*y+z*z)`, never `Math.hypot`.

---

### `src/sim/world/population/escorts.ts`

**Analog:** `src/sim/npc/escort.ts` `escortCoordinates(leaderPose, leaderRadius, slot)` (`:46`). Reuse it for formation positions; escort role overwritten to `escort`; spawn with `ownerId` and `steer.escortSlot`; trader escort removal with probability `gov/7`; `Ranrot() % 11 < gov + 2` per slot (stub models, port uses its own forked "escort" tag).

---

### `src/sim/world/population/spawn.ts` (atomic group spawn)

**Analog:** `src/sim/world/populate.ts` `populateInertWorld` (`:374`) for the `spawnEntity` loop and refusal handling; `src/sim/ai/test-spawn.ts` (`spawnTestAnarchy`) for scratch-world trial spawn and rollback.

Rules: pre-count the whole group (leader + followers + escorts) against `MAX_ENTITIES - POPULATION_DEBRIS_RESERVE - live` and `World.groups.length < MAX_WORLD_GROUPS`; skip whole group when it does not fit; spawn leader first; `groupId` = leader id; write `World.groups` ascending. After `spawnEntity`, set `steer.accuracy` (not in `SpawnInit`; the `-100` sentinel must not remain). Cargo count: add a kind-keyed sibling of `cargoCountAtSpawn` (`populate.ts:344`, frozen, role-keyed); stored `cargoKind` from `CARGO_KINDS` (`entity.ts:105-113`).

**Guard to satisfy:** `tests/guards/pod-kind-fallback.test.ts` scans comment-stripped `src/sim/**` and requires every `spawnEntity(...)` call or `SpawnInit` literal with `cargo` to also name `cargoKind`, except the allow-listed inert file. Do not widen the allow-list. Also respect `npc-missiles-tripwire` (no `.missiles` / `.maxMissiles` read outside `src/sim/player/` and `traffic.ts`).

---

### `src/sim/world/placement.ts` (modify: add `WITCHPOINT`)

**Analog:** itself. `export type LocationCode = "LANE_WP" | "LANE_WS" | "LANE_PS" | "LANE_WPS" | "STATION_AEGIS";` (`:42-43`), `locationByCode(rng, code, layout)` is a `switch` (`:177-250`). Add one `case "WITCHPOINT"` returning `randomSpatial(rng, layout.scannerRange)` (`Universe.m:1786-1788`). Pin that existing codes' outputs are unchanged with a test (`tests/sim/world/placement.test.ts`), and that `Sample.fallback` semantics hold.

---

### `src/sim/rng.ts` (modify: purpose `pop`)

**Analog:** itself, `RNG_PURPOSE_CODES` (`:107-118`): `world:1, ai:2, combat:3, cargo:4, damage:5, pod:6, scoop:7, repop:8, inj:9`. Add `pop: 10` additively (comment at `:103-106`: adding a purpose cannot renumber another) and add a literal vector to `tests/sim/rng.test.ts`. `forkSeed(worldSeed, entityId, purpose)` is `mix32(mix32(worldSeed, entityId), RNG_PURPOSE_CODES[purpose])` (`:161-171`); here the "entityId" slot carries the entry ordinal, then `mix32(entrySeed, groupIndex)` and a tag code, so no stream depends on entity ids.

---

### `src/sim/world/limits.ts` (modify)

**Analog:** itself. `MAX_WORLD_GROUPS = 128` (`:303`) with its doc comment; add `POPULATION_DEBRIS_RESERVE` (measured; D-06) beside it with a comment citing the measurement. If the census exceeds 128, raise `MAX_WORLD_GROUPS` (D-11) and re-pin v5 hash and snapshot bound together; the bound is also enforced in `snapshot.ts:1441` and `sanitize.ts:1206`, `view-impl.ts:259`.

---

### `src/sim/world/step.ts` `repairWorldFields` (modify)

**Analog:** itself (the repair of older records). Add `World.groups` (21-06 recorded this as owed to Phase 22; keep the sanitizer idempotence property; `sanitize.ts:1184-1206` already sorts ascending and truncates to `MAX_WORLD_GROUPS`).

---

### NPC record field `hyperspaceMotor` (schema, converter, content tests)

Chain analog = how `autoWeapons` / `hasScoop` travel.

1. **Schema** `src/content/schemas/ship-npc.ts:204-211`:
```typescript
  autoAi: z.number().min(0).max(1),
  autoWeapons: z.number().min(0).max(1),
  hasScoop: z.number().min(0).max(1),
  hasFuelInjection: z.number().min(0).max(1),
```
Add the new field with a comment citing the script read (`oolite-populator.js:1714`, `hasHyperspaceMotor`). Check Oolite's default (`ShipEntity.m` `has_hyperspace_motor`, default yes) before choosing a type (fuzzy 0..1 or boolean).
2. **Converter** `tools/oolite-ingest/convert/npc-ships.ts:889`:
```typescript
      autoWeapons: fuzzyExtra(key, entry.extras, "auto_weapons", DEFAULT_AUTO_WEAPONS),
```
with `DEFAULT_AUTO_WEAPONS` at `:232` beside its Oolite source line. Add a `DEFAULT_HAS_HYPERSPACE_MOTOR` constant in the same style; extend `npc-ships.test.ts` (key lists near `:144`, `:308`, `:1576-1592`, `:1671` where `auto_weapons` is enumerated) and `tests/content/ships-npc.test.ts` (`:545`, `:564` key lists).
3. **Regenerate:** `docker compose run --rm assets`, then `assets:check` for drift. This is a QUAL-12 trigger path (`ships-npc.json`): re-run the epoch 1-20 pin and the 20-seed acceptance (by hand on the remote machine).

---

### `src/app/session/traffic.ts` (`createSystemPopulate`) and call sites

**Analog:** `createInertPopulate` in the same file (closure reads `ctx.core` at call time; shared by session and Node replay, see the file header "Pitfall 11 of Phase 12"). Build `createSystemPopulate` beside it; do not edit `createInertPopulate`. Switch only `src/app/session/start-session.ts:519` and `tests/helpers/tick-script.ts:264`. Traffic-off path unchanged (D-01: no draw, no id burn). Record bridge adds `hyperspaceMotor` while keeping `INERT_RECORD_KEYS` frozen (inert isolation).

---

### `tests/sim/world/population/{plan,traders,groups}.oracle.test.ts` (replay)

**Analog:** `tests/sim/world/blast.oracle.test.ts` and `ship-braking.oracle.test.ts` (Phase 14/17 ports replay oracle fixtures from outside the oracle tree and import `src/`). Replay skeleton in RESEARCH "Replay skeleton"; plus the edge-draw fixture set (draws exactly at 0.05, 0.5, `count - floor(count)`, 0, `1 - 2^-53`).

### `tests/sim/world/population/census.test.ts` (2,048-system census)

**Analog:** `tests/sim/world/populate.test.ts:845-897` ("every galaxy-0 system populates without a fallback"). Extend to all 8 galaxies (`src/content/generated/systems/g0..g7.json`), many world seeds (epochs 1-20), assert: no group skipped, `fallbacks === 0`, peak group count vs `MAX_WORLD_GROUPS`, realised triangle sum under `TRIANGLE_BUDGET` minus scene, corridor-hit count using `src/sim/dock/corridor.ts` (D-02), no placed ship with `cargo > 0` and `cargoKind` 0 and kind matches context (folded pod-kind todo).

### `tests/sim/world/population/cadence.test.ts`

**Analog:** `tests/sim/world/v5-cadence.test.ts`: scenario replayed at frame deltas 1/30, 1/60, 1/144 through the fixed-step accumulator, `hashWorld` equal at sampled ticks, log indexed by tick, with non-vacuity cases. Use a populated Lave and the largest anarchy for 600 ticks (Pitfall 10).

### Re-pins (tick-parity, death-twin, tick-flyers, render-driver, world-lifecycle, e2e specs)

**Analog:** the 21-CONTEXT D-04 standing approval; method: `rg -n "runTickScript|createInertPopulate|traffic=1|traffic: true" tests`, classify own-lifecycle (no change) vs session/twin path (re-pin once, record measured cause, Node = browser). Stay-inert list in RESEARCH "Re-pin inventory".

### `tests/e2e/anarchy.spec.ts` / QUAL-09 spec

**Analog:** `tests/e2e/anarchy.spec.ts` (410 lines; tripwire for 21-18 asserting counts against `DRAW_CALL_BUDGET`) and `tests/e2e/helpers/budgets.ts`:
```typescript
export const DRAW_CALL_BUDGET = 50;
export const TRIANGLE_BUDGET = 250_000;
export function withinBudget(count: number, budget: number): boolean {
  return Number.isFinite(count) && count > 0 && count <= budget;
}
```
Boot with `dockedSaveAt(systemName)` from `tests/e2e/helpers/save-fixtures.ts` (galaxy-0 systems only; production `encodeSave`) and launch with `?test=1&traffic=1`; read `probe.calls` and `probe.triangles` after render. Choose the system by distinct hull keys in the realised population plus the fight (Onisqu g0-s219 per scratch model; the census decides). Run via `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test <spec>"` (remote machine for real runs).

### Spike (real-Oolite census)

**Analog:** `tools/oolite-reference/steps/docked.steps` and `run-remote.sh --steps FILE --addons DIR --timeout S`; OXP kept outside the repo; outputs outside the repo (CC BY-NC-SA; wrapper refuses an in-repo output dir). First step: compare the AppImage's `oolite-populator.js` sha256 with `96a734a6...`.

## Shared Patterns

### Determinism bans in `src/sim/`
**Source:** `sim-determinism-bans` guard, `src/sim/rng.ts`.
**Apply to:** every file under `src/sim/world/population/` and `neighbourhood.ts`. No `Math.random`, `Date`, `Math.hypot`, `for..in`, `Object.keys` order, default `Array.prototype.sort`; JS `%` keeps dividend sign (correct for the `pos.z % 100000` tweak in Wegolite's negated-Z frame); `Math.fround` for accuracy; `Math.trunc` for C-style division.

### Forked stateless streams
**Source:** `src/sim/rng.ts:161-171`, `populate.ts` per-spawn `forkSeed(world.worldSeed, id, "cargo")`.
**Apply to:** all planner and builder draws. Key by entry ordinal, group index and site tag, never by entity id (ids shift when a group is skipped; C4).

### Totality and bounds
**Source:** `populate.ts` header (totality rule ii), `src/sim/world/limits.ts`.
**Apply to:** every new sim function: malformed input is dropped or skipped, never thrown inside the arrival's synchronous install block; every new bound lives in `limits.ts`; add a fast-check property per function.

### Oracle independence
**Source:** `tests/guards/oracle-independence.test.ts`.
**Apply to:** `tests/oracles/population/**` (imports `zod`, `vitest`, `node:*`, relative-in-tree only). The replay test that imports `src/` lives outside the oracle tree.

### Harness isolation
**Source:** `tests/guards/harness-isolation.test.ts`, `tools/ai-harness/dist-check.ts`.
**Apply to:** all new `tools/ai-harness/*` files. Never imported by `src/`, `public/`, root Vite configs; sentinel never in a bundle.

### Frozen inert path
**Source:** `src/sim/world/populate.ts`, `tests/golden/world/inert-lave-epochs-1-20.json`, `tests/sim/world/inert-isolation.test.ts`.
**Apply to:** every commit. Do not edit `populate.ts`, `INERT_POPULATION`, `createInertPopulate`, `INERT_RECORD_KEYS`; keep the 20-seed run 21 of 21 after any plan touching `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json`.

### FIDELITY rows
**Source:** `FIDELITY.md` (E-78, E-197, E-198 and new rows).
**Apply to:** cap rule (never triggers for any committed system), `couriers *= 1.5` port, `thug = 0` extra interceptors, third `randomise` draw, equal-priority order (A5), group-id merge (A10), the cuts table, E-197/E-78 text now "inert path only".

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `tools/ai-harness/populator-record.ts` (the recording aspect) | utility | batch | No prior harness records Oolite output; Phase 14/17 fixtures were hand-derived transliterations. Use the loader and host patterns above and RESEARCH "Recorder design". |
| `src/sim/world/population/kit.ts` (`setSkill`, `setWeapons`, `setFuel` float32 and clamp semantics) | utility | transform | No existing helper clamps and `Math.fround`s an accuracy or writes `lround(clamp(v,0,7)*10)` fuel; use RESEARCH Pattern 1 example and `ShipEntity.m:1126-1143`, `OOJSShip.m:1315-1320`. |

## Metadata

**Analog search scope:** `tools/ai-harness/`, `tests/oracles/`, `tests/guards/`, `src/sim/world/`, `src/sim/rng.ts`, `src/sim/hyperspace/jump.ts`, `src/content/schemas/`, `tools/oolite-ingest/convert/`, `tests/sim/world/`, `tests/e2e/`, `src/app/session/`.
**Files scanned:** about 45 (directory listings plus targeted reads).
**Pattern extraction date:** 2026-11-26
