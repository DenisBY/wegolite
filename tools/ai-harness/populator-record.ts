// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The population recorder (Phase 22, plan 22-01, ROADMAP "First plan"): run
 * Oolite's own `Resources/Scripts/oolite-populator.js` (pin 7437f22), unmodified,
 * in `node:vm` against the stub host of `populator-host.ts`, and write what it
 * did as a strict fixture under `tests/oracles/population/fixtures/`.
 *
 * `vm` is not a security boundary. It is used here only on the one fixed,
 * pinned, GPL-licensed file named by `POPULATOR_FILE`, read from the
 * operator-supplied `OOLITE_SRC` directory. Unlike the AI-11 loader, this one
 * checks the file against a recorded digest before running it
 * (`PopulatorPinError`), so a tampered or moved checkout never produces a
 * fixture. Every entry into Oolite code (loading the file, `startUp`,
 * `systemWillPopulate`, every group callback) goes through `runInContext` with
 * a positive integer `timeout`. Dev-only: nothing under `src/` or `public/`
 * imports this module, and the harness sentinel rides on every vm global.
 *
 * Usage (the pinned tree: `git -C <oolite checkout> archive 7437f22 src
 * Resources | tar -x -C /tmp/oolite-7437f22`):
 *
 *   OOLITE_SRC=/oolite npx tsx tools/ai-harness/populator-record.ts \
 *     --out tests/oracles/population/fixtures --system g0-s7 --seed 1
 *
 * The output is JSON with sorted object keys, formatted by `prettier`, so a
 * rerun with the same `OOLITE_SRC` is byte-identical.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createContext, runInContext } from "node:vm";

import type { ShipDef, System } from "../../src/content/types.js";
import { deriveSystemLayout } from "../../src/sim/world/layout.js";
import {
  decodePopulationFixture,
  encodePopulationFixture,
  POPULATION_STARTUP,
} from "../../tests/oracles/population/codec.js";
import {
  EdgeDrawsSchema,
  NeighbourhoodTableSchema,
  ShipFactsSchema,
  POPULATION_ENTRY_NAMES,
  POPULATION_GALAXIES,
  POPULATION_OOLITE_PIN,
  POPULATION_SCRIPT_FILE,
  POPULATION_SCRIPT_SHA256,
  POPULATION_SYSTEMS_PER_GALAXY,
  PopulationFixtureSchema,
  type EdgeCase,
  type EdgeDraws,
  type NeighbourhoodTable,
  type PopulationDrawTag,
  type PopulationEntry,
  type PopulationEntryName,
  type PopulationFixture,
  type PopulationGroup,
  type PopulationNeighbour,
  type PopulationShip,
  type ShipFacts,
} from "../../tests/oracles/population/schema.js";
import { parseOpenStep } from "../oolite-ingest/openstep/parser.js";
import type {
  PlistDict,
  PlistValue,
} from "../oolite-ingest/openstep/plist-value.js";
import { getString } from "../oolite-ingest/openstep/plist-value.js";
import { resolveAll } from "../oolite-ingest/like-ship.js";
import { callInContext, ENTRY_TIMEOUT_MS, type AiContext } from "./load.js";
import {
  createPopulatorHost,
  type GroupCapture,
  type PopulatorCatalogueRecord,
  type PopulatorHost,
  type PopulatorShipFact,
  type PopulatorSystemRow,
  type PopulatorVec,
} from "./populator-host.js";
import {
  POPULATION_SYSTEMS,
  selectPopulationSystems,
  type PopulationCandidate,
  type PopulationSelection,
} from "./population-systems.js";

/** The one script path, relative to the Oolite tree. */
export const POPULATOR_FILE = POPULATION_SCRIPT_FILE;

/** The Oolite commit the script was read at. */
export const POPULATOR_PIN = POPULATION_OOLITE_PIN;

/** `sha256sum` of `oolite-populator.js` at the pin. */
export const POPULATOR_SCRIPT_SHA256 =
  "96a734a6cfc1ee39a7db7798716101640887e58d5fe947e56e2fcc4946e04df4";

/** Thrown when the script on disk is not the pinned one. */
export class PopulatorPinError extends Error {
  public readonly expected: string;
  public readonly actual: string;

  public constructor(expected: string, actual: string) {
    super(
      `oolite-populator.js is not the pinned file: expected sha256 ${expected} (Oolite ${POPULATOR_PIN}), found ${actual}`,
    );
    this.name = "PopulatorPinError";
    this.expected = expected;
    this.actual = actual;
  }
}

/**
 * Host members answered by a stub default because only a cut path reads them.
 * A member the script reads that the stub does not answer and that is not
 * listed here stops the recorder.
 */
const CUT_READS: readonly string[] = ["system.pseudoRandomNumber"];

/**
 * Per entry: whether `groupCount` comes from `randomise` (three `count`
 * draws) and whether the port cuts it (D-09: the interceptors are kept; the
 * buoys, asteroids, hermit, medium and heavy hunters, assassins and Thargoids
 * are cut and their callbacks are not run).
 */
const ENTRY_META: Readonly<
  Record<PopulationEntryName, { counted: boolean; cut: boolean }>
> = {
  "oolite-nav-buoy": { counted: false, cut: true },
  "oolite-witch-buoy": { counted: false, cut: true },
  "oolite-route1-asteroids": { counted: false, cut: true },
  "oolite-route2-asteroids": { counted: false, cut: true },
  "oolite-offlane-hermit": { counted: false, cut: true },
  "oolite-freighters": { counted: true, cut: false },
  "oolite-freighters-docking": { counted: true, cut: false },
  "oolite-couriers-route1": { counted: true, cut: false },
  "oolite-couriers-route3": { counted: true, cut: false },
  "oolite-smugglers": { counted: true, cut: false },
  "oolite-hunters-triangle": { counted: true, cut: false },
  "oolite-hunters-route1": { counted: true, cut: false },
  "oolite-hunters-medium-route1": { counted: true, cut: true },
  "oolite-hunters-medium-route3": { counted: true, cut: true },
  "oolite-hunters-heavy-route1": { counted: true, cut: true },
  "oolite-hunters-heavy-route3": { counted: true, cut: true },
  "oolite-pirate-independent-route1": { counted: true, cut: false },
  "oolite-pirate-independent-route2": { counted: true, cut: false },
  "oolite-pirate-independent-route3": { counted: true, cut: false },
  "oolite-pirate-light-route1": { counted: true, cut: false },
  "oolite-pirate-light-triangle": { counted: true, cut: false },
  "oolite-pirate-light-remote": { counted: true, cut: false },
  "oolite-pirate-medium-route1": { counted: true, cut: false },
  "oolite-pirate-medium-triangle": { counted: true, cut: false },
  "oolite-pirate-medium-remote": { counted: true, cut: false },
  "oolite-pirate-heavy-route1": { counted: true, cut: false },
  "oolite-pirate-heavy-triangle": { counted: true, cut: false },
  "oolite-pirate-heavy-remote": { counted: true, cut: false },
  "oolite-assassins": { counted: true, cut: true },
  "oolite-police-route1": { counted: true, cut: false },
  "oolite-police-triangle": { counted: true, cut: false },
  "oolite-police-stationpatrol": { counted: false, cut: false },
  "oolite-interceptors-route1": { counted: true, cut: false },
  "oolite-interceptors-witchpoint": { counted: true, cut: false },
  "oolite-thargoid-scouts": { counted: true, cut: true },
  "oolite-thargoid-strike": { counted: true, cut: true },
};

/** The script helpers whose draws carry their own tag. */
const TAGGED_HELPERS: readonly (readonly [string, PopulationDrawTag])[] = [
  ["_setWeapons", "weapons"],
  ["_setEscortWeapons", "weapons"],
  ["_setSkill", "skill"],
  ["_setMissiles", "missiles"],
  ["_nearbySystem", "system"],
  ["_nearbyDangerousSystem", "system"],
  ["_nearbySafeSystem", "system"],
  ["_weightedNearbyTradeSystem", "system"],
];

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

function readJson<T>(relative: string): T {
  return JSON.parse(readFileSync(join(REPO_ROOT, relative), "utf8")) as T;
}

/** One system record of `src/content/generated/systems/g<G>.json`. */
interface GalaxySystem extends System {
  readonly systemIndex: number;
  readonly chartX: number;
  readonly chartY: number;
  readonly techLevelRaw: number;
}

interface CatalogueShip {
  readonly key: string;
  readonly shipDef: ShipDef;
}

let stationDefCache: ShipDef | undefined;
let catalogueCache: readonly PopulatorCatalogueRecord[] | undefined;

function stationDef(): ShipDef {
  if (stationDefCache === undefined) {
    const ships = readJson<CatalogueShip[]>("src/content/generated/ships.json");
    const station = ships.find((ship) => ship.key === "coriolis-station");
    if (station === undefined) {
      throw new Error("ships.json has no coriolis-station record");
    }
    stationDefCache = station.shipDef;
  }
  return stationDefCache;
}

function npcCatalogue(): readonly PopulatorCatalogueRecord[] {
  catalogueCache ??= readJson<PopulatorCatalogueRecord[]>(
    "src/content/generated/ships-npc.json",
  );
  return catalogueCache;
}

/** Parse `g<galaxy>-s<index>`. */
function parseSystemId(systemId: string): { galaxy: number; index: number } {
  const match = /^g([0-7])-s(\d{1,3})$/.exec(systemId);
  if (match === null) {
    throw new Error(`bad system id ${systemId} (expected g<0-7>-s<0-255>)`);
  }
  const index = Number(match[2]);
  if (index > 255) {
    throw new Error(`bad system id ${systemId}`);
  }
  return { galaxy: Number(match[1]), index };
}

/** Negate z: Wegolite's frame has the planet at -z, Oolite's at +z. */
function oolite(vector: { x: number; y: number; z: number }): PopulatorVec {
  return { x: vector.x, y: vector.y, z: -vector.z };
}

/** `oo_boolForKey`-style truth of a plist value, with a default. */
function plistBool(value: PlistValue | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  switch (value.kind) {
    case "bool":
      return value.value;
    case "integer":
    case "real":
      return value.value !== 0;
    case "string": {
      const text = value.value.trim().toLowerCase();
      if (text === "yes" || text === "true" || text === "on") {
        return true;
      }
      if (text === "no" || text === "false" || text === "off" || text === "") {
        return false;
      }
      return Number.parseFloat(text) !== 0;
    }
    default:
      return fallback;
  }
}

function plistNumber(value: PlistValue | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  if (value.kind === "integer" || value.kind === "real") {
    return value.value;
  }
  if (value.kind === "string") {
    const parsed = Number.parseFloat(value.value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseDict(source: string, file: string): PlistDict {
  const root = parseOpenStep(source, file);
  if (root.kind !== "dict") {
    throw new Error(`${file}: the root is not a dictionary`);
  }
  return root;
}

const shipFactCache = new Map<string, Map<string, PopulatorShipFact>>();

/**
 * The ship facts the committed catalogue does not carry (plan 22-05 compiles
 * them): `hyperspace_motor` (default YES, `ShipEntity.m:382`), an authored
 * `accuracy` (else the engine rolls one) and `cargo_carried`, resolved through
 * `like_ship` with the content ingester's own parser and resolver.
 */
function readShipFacts(
  oolitesrc: string,
): ReadonlyMap<string, PopulatorShipFact> {
  const cached = shipFactCache.get(oolitesrc);
  if (cached !== undefined) {
    return cached;
  }
  const base = "Resources/Config/shipdata.plist";
  const overridesFile = "Resources/Config/shipdata-overrides.plist";
  const root = parseDict(readFileSync(join(oolitesrc, base), "utf8"), base);
  const overrides = parseDict(
    readFileSync(join(oolitesrc, overridesFile), "utf8"),
    overridesFile,
  );
  const resolved = resolveAll(root, { file: base, overrides });
  const facts = new Map<string, PopulatorShipFact>();
  for (const record of npcCatalogue()) {
    const fields = resolved.entries.get(record.key);
    if (fields === undefined) {
      throw new Error(`shipdata.plist has no ship ${record.key}`);
    }
    const cargo = fields.get("cargo_carried");
    facts.set(record.key, {
      hyperspaceMotor: plistBool(fields.get("hyperspace_motor"), true),
      accuracy: plistNumber(fields.get("accuracy")),
      cargoCarried: cargo?.kind === "string" ? cargo.value : null,
    });
  }
  shipFactCache.set(oolitesrc, facts);
  return facts;
}

/** `descriptions.plist` `medical-word`, which `startUp` turns into a pattern. */
function readMedicalWord(oolitesrc: string): string {
  const file = "Resources/Config/descriptions.plist";
  const root = parseDict(readFileSync(join(oolitesrc, file), "utf8"), file);
  const word = getString(root, "medical-word");
  if (word === undefined) {
    throw new Error(`${file} has no medical-word`);
  }
  return word;
}

/**
 * One context for the populator script: the host members are getters whose
 * reads are counted, exactly as in the AI-11 loader (`load.ts`).
 */
function createPopulatorContext(
  host: PopulatorHost,
  extra: Readonly<Record<string, unknown>>,
): AiContext {
  const sandbox: Record<string, unknown> = {};
  const members: Record<string, unknown> = { ...host.globals, ...extra };
  for (const [key, value] of Object.entries(members)) {
    Object.defineProperty(sandbox, key, {
      configurable: true,
      enumerable: true,
      get(): unknown {
        host.globalReads.set(key, (host.globalReads.get(key) ?? 0) + 1);
        return value;
      },
    });
  }
  const name = "populator";
  const context = createContext(sandbox, { name });
  const run = (source: string, label: string): unknown =>
    runInContext(source, context, {
      filename: `harness:${label}`,
      timeout: ENTRY_TIMEOUT_MS,
    });
  run(
    "Math.random = __harnessDraw; delete globalThis.__harnessDraw;",
    "install Math.random",
  );
  const global = run("this", "global") as Record<string, unknown>;
  return { name, context, global, entries: [] };
}

/** Stable sort by priority, equal priorities in insertion order (A5). */
function engineOrderOf(
  entries: readonly { ordinal: number; priority: number }[],
): number[] {
  return [...entries]
    .sort((a, b) => a.priority - b.priority || a.ordinal - b.ordinal)
    .map((entry) => entry.ordinal);
}

function sortedCodeUnits(values: Iterable<string>): string[] {
  return [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** The galaxy files, read once. */
const galaxyCache = new Map<number, readonly GalaxySystem[]>();

function galaxySystemsOf(galaxy: number): readonly GalaxySystem[] {
  let systems = galaxyCache.get(galaxy);
  if (systems === undefined) {
    systems = readJson<GalaxySystem[]>(
      `src/content/generated/systems/g${String(galaxy)}.json`,
    );
    if (systems.length !== 256) {
      throw new Error(
        `galaxy ${String(galaxy)} has ${String(systems.length)} systems`,
      );
    }
    galaxyCache.set(galaxy, systems);
  }
  return systems;
}

/** The system rows of one galaxy as the stub host reads them. */
function systemRowsOf(galaxy: number): PopulatorSystemRow[] {
  return galaxySystemsOf(galaxy).map((system, at) => {
    if (system.systemIndex !== at) {
      throw new Error(
        `galaxy ${String(galaxy)} is not in system order at ${String(at)}`,
      );
    }
    return {
      id: system.systemIndex,
      name: system.name,
      x: system.chartX,
      y: system.chartY,
      economy: system.economy,
      government: system.government,
      techLevel: system.techLevelRaw,
    };
  });
}

/** The pinned script, loaded in its own context for one (system, seed). */
interface PopulatorBoot {
  readonly galaxy: number;
  readonly index: number;
  readonly rows: readonly PopulatorSystemRow[];
  readonly host: PopulatorHost;
  readonly ai: AiContext;
  readonly harnessCall: { definition: unknown; position: unknown };
  readonly planet: PopulatorVec;
  readonly sun: PopulatorVec;
  readonly script: Buffer;
}

/**
 * Check the pin, build the stub host for one system and load the script into
 * a fresh context (no entry point has run yet).
 *
 * @throws {PopulatorPinError} when `oolite-populator.js` under `oolitesrc` is
 * not the pinned file.
 */
function loadPopulator(
  oolitesrc: string,
  systemId: string,
  seed: number,
): PopulatorBoot {
  const script = readFileSync(join(oolitesrc, POPULATOR_FILE));
  const digest = createHash("sha256").update(script).digest("hex");
  if (digest !== POPULATOR_SCRIPT_SHA256) {
    throw new PopulatorPinError(POPULATOR_SCRIPT_SHA256, digest);
  }

  const { galaxy, index } = parseSystemId(systemId);
  const galaxySystems = galaxySystemsOf(galaxy);
  const rows = systemRowsOf(galaxy);
  const system = galaxySystems[index];
  if (system === undefined) {
    throw new Error(`no system ${systemId}`);
  }
  const layout = deriveSystemLayout(system, stationDef());
  const planet = oolite(layout.planet.position);
  const sun = oolite(layout.sun.position);
  const station = oolite(layout.station.position);
  const toPlanet = oolite(layout.stationToPlanet);

  const host = createPopulatorHost({
    galaxy,
    systems: rows,
    systemId: index,
    planet,
    planetRadius: layout.planet.radius,
    sun,
    sunRadius: layout.sun.radius,
    station,
    stationForward: toPlanet,
    catalogue: npcCatalogue(),
    shipFacts: readShipFacts(oolitesrc),
    medicalWord: readMedicalWord(oolitesrc),
    drawKey: `${systemId}|${String(seed)}`,
  });

  const harnessCall = {
    definition: undefined as unknown,
    position: undefined as unknown,
  };
  const ai = createPopulatorContext(host, { __harnessCall: harnessCall });
  runInContext(script.toString("utf8"), ai.context, {
    filename: POPULATOR_FILE,
    timeout: ENTRY_TIMEOUT_MS,
  });

  // Tag the draws of the script's own helpers with their site.
  for (const [name, tag] of TAGGED_HELPERS) {
    Reflect.set(ai.global, name, host.wrapHelper(tag, ai.global[name]));
  }
  return { galaxy, index, rows, host, ai, harnessCall, planet, sun, script };
}

/** A neighbour without its `seconds` (the table holds them). */
function leanNeighbour(neighbour: PopulationNeighbour): {
  id: number;
  government: number;
  economy: number;
  techLevel: number;
} {
  return {
    id: neighbour.id,
    government: neighbour.government,
    economy: neighbour.economy,
    techLevel: neighbour.techLevel,
  };
}

/** `_systemIsBottleneck` over a set of locals and their seconds, in the vm. */
const BOTTLENECK_EXPRESSION =
  "this._systemIsBottleneck(this.$populatorLocals, this.$populatorLocals.map(function (local) { return local.systemsInRange(); }))";

/**
 * Record the population Oolite's own script produces for one system and seed.
 *
 * @throws {PopulatorPinError} when `oolite-populator.js` under `oolitesrc` is
 * not the pinned file.
 */
export function recordPopulation(
  oolitesrc: string,
  systemId: string,
  seed: number,
): PopulationFixture {
  const { galaxy, index, rows, host, ai, harnessCall, planet, sun } =
    loadPopulator(oolitesrc, systemId, seed);

  callInContext(ai, "this.startUp()");
  const startUp = {
    medicalPattern: callInContext(ai, "this.$medicalReg.source") as string,
    medicalFlags: callInContext(ai, "this.$medicalReg.flags") as string,
    weaponLevelBias: callInContext(ai, "this.$weaponLevelBias") as number,
    skillLevelBias: callInContext(ai, "this.$skillLevelBias") as number,
    skillLevelMaximum: callInContext(ai, "this.$skillLevelMaximum") as number,
  };

  if (JSON.stringify(startUp) !== JSON.stringify(POPULATION_STARTUP)) {
    throw new Error(
      `startUp left ${JSON.stringify(startUp)}, expected POPULATION_STARTUP ${JSON.stringify(POPULATION_STARTUP)}`,
    );
  }

  callInContext(ai, "this.systemWillPopulate()");
  const bottleneck = callInContext(ai, BOTTLENECK_EXPRESSION);
  if (typeof bottleneck !== "boolean") {
    throw new Error("_systemIsBottleneck did not return a boolean");
  }

  // The registration log: names in order, then the count and setup draws.
  if (host.registered.length !== POPULATION_ENTRY_NAMES.length) {
    throw new Error(
      `the script registered ${String(host.registered.length)} entries, expected ${String(POPULATION_ENTRY_NAMES.length)}`,
    );
  }
  let setupSeen = false;
  const entries: PopulationEntry[] = host.registered.map((registered, at) => {
    const expected = POPULATION_ENTRY_NAMES[at];
    if (registered.name !== expected) {
      throw new Error(
        `entry ${String(at)} is ${registered.name}, expected ${String(expected)}`,
      );
    }
    const meta = ENTRY_META[POPULATION_ENTRY_NAMES[at] as PopulationEntryName];
    const window = registered.window;
    let countDraws: number[] = [];
    let setupDraws: number[] = [];
    if (meta.counted) {
      if (registered.groupCount === null) {
        throw new Error(`${registered.name} is counted but has no groupCount`);
      }
      const expectedLength = setupSeen ? 3 : 5;
      if (window.length !== expectedLength) {
        throw new Error(
          `${registered.name}: ${String(window.length)} draws before its registration, expected ${String(expectedLength)}`,
        );
      }
      host.retag(window, 0, window.length - 3, "setup");
      host.retag(window, window.length - 3, window.length, "count");
      setupDraws = window.slice(0, window.length - 3).map((draw) => draw.u);
      countDraws = window.slice(window.length - 3).map((draw) => draw.u);
      setupSeen = true;
    } else if (window.length !== 0) {
      throw new Error(
        `${registered.name}: ${String(window.length)} draws before an uncounted registration`,
      );
    }
    return {
      ordinal: registered.ordinal,
      name: registered.name,
      priority: registered.priority,
      location: registered.location,
      groupCount: registered.groupCount,
      count: registered.groupCount ?? 1,
      counted: meta.counted,
      cut: meta.cut,
      countDraws,
      setupDraws,
    };
  });
  if (host.trailingDraws() !== 0) {
    throw new Error(
      `${String(host.trailingDraws())} draws were taken after the last registration`,
    );
  }

  // Run the kept entries the way the engine does: priority order, then each
  // entry `count` times, handing the callback a plain position vector.
  const order = engineOrderOf(entries);
  const groups: PopulationGroup[] = [];
  for (const ordinal of order) {
    const entry = entries[ordinal];
    const registered = host.registered[ordinal];
    if (entry === undefined || registered === undefined) {
      throw new Error(`no entry ${String(ordinal)}`);
    }
    if (entry.cut) {
      continue;
    }
    for (let i = 0; i < entry.count; i += 1) {
      host.beginGroup();
      const position = host.makePosition(entry.location);
      const posInZ = position.z;
      harnessCall.definition = registered.definition;
      harnessCall.position = position;
      callInContext(
        ai,
        "__harnessCall.definition.callback(__harnessCall.position)",
      );
      const capture = host.endGroup();
      groups.push({
        entry: ordinal,
        index: i,
        location: entry.location,
        posInZ,
        posOutZ: position.z,
        draws: capture.draws,
        calls: [...capture.calls],
        ships: capture.ships.map((ship) => ({
          ...ship,
          writes: ship.writes.filter((write) => write.cut === true),
        })),
        shipGroups: [...capture.shipGroups],
      });
    }
  }

  const missing = sortedCodeUnits(host.missing.keys());
  const unexplained = missing.filter((name) => !CUT_READS.includes(name));
  if (unexplained.length > 0) {
    throw new Error(
      `the script read host members the stub does not answer: ${unexplained.join(", ")}`,
    );
  }

  const neighbourhood = host.neighbourhood();
  const magnitude = (v: PopulatorVec): number =>
    Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  const here = rows[index];
  if (here === undefined) {
    throw new Error(`no system row ${String(index)}`);
  }

  const fixture: PopulationFixture = {
    header: {
      oolitePin: POPULATION_OOLITE_PIN,
      scriptFile: POPULATION_SCRIPT_FILE,
      scriptSha256: POPULATOR_SCRIPT_SHA256,
      system: systemId,
      galaxy,
      systemIndex: index,
      seed,
      startUp,
    },
    inputs: {
      name: here.name,
      government: here.government,
      economy: here.economy,
      techLevel: here.techLevel,
      laneLengths: {
        l1: magnitude(planet),
        l2: magnitude({
          x: planet.x - sun.x,
          y: planet.y - sun.y,
          z: planet.z - sun.z,
        }),
        l3: magnitude(sun),
      },
      locals: neighbourhood.locals.map(leanNeighbour),
      verylocals: neighbourhood.verylocals.map(leanNeighbour),
      within25Count: neighbourhood.within25.length,
      bottleneck,
    },
    entries,
    engineOrder: order,
    groups,
    inventory: { missing, cutReads: [...CUT_READS] },
  };
  return PopulationFixtureSchema.parse(fixture);
}

/** `JSON.stringify` with object keys in code-unit order, arrays untouched. */
function stableJson(value: unknown): string {
  const sortKeys = (input: unknown): unknown => {
    if (Array.isArray(input)) {
      return (input as unknown[]).map(sortKeys);
    }
    if (typeof input === "object" && input !== null) {
      const record = input as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const key of sortedCodeUnits(Object.keys(record))) {
        sorted[key] = sortKeys(record[key]);
      }
      return sorted;
    }
    return input;
  };
  return JSON.stringify(sortKeys(value));
}

/**
 * The exact bytes a fixture file holds: the compact file form of
 * `tests/oracles/population/codec.ts`, one line of JSON with sorted object
 * keys and a final newline (the directory is in `.prettierignore`: Prettier's
 * array wrapping would multiply the size). The fixture must decode back to
 * itself, so nothing is lost by the encoding.
 */
export function fixtureText(fixture: PopulationFixture): string {
  const text = `${stableJson(encodePopulationFixture(fixture))}\n`;
  const back = decodePopulationFixture(JSON.parse(text) as unknown);
  if (stableJson(back) !== stableJson(fixture)) {
    throw new Error(
      `${fixture.header.system} seed ${String(fixture.header.seed)}: the file form does not decode to the recorded fixture`,
    );
  }
  return text;
}

/** The file name of one (system, seed) fixture. */
export function fixtureFileName(systemId: string, seed: number): string {
  return `${systemId}-seed${String(seed)}.json`;
}

/** Record one (system, seed) and write it into `outDir`; returns the path. */
export function writeFixture(
  oolitesrc: string,
  outDir: string,
  systemId: string,
  seed: number,
): string {
  const fixture = recordPopulation(oolitesrc, systemId, seed);
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, fixtureFileName(systemId, seed));
  writeFileSync(path, fixtureText(fixture));
  return path;
}

/** The exact bytes of a widened file (table, edge draws, ship facts). */
export function widenedText(value: unknown): string {
  return `${stableJson(value)}\n`;
}

/** `_systemIsBottleneck` over the stub's own locals and their seconds. */
const TABLE_BOTTLENECK_EXPRESSION =
  "this._systemIsBottleneck(system.info.systemsInRange(), system.info.systemsInRange().map(function (local) { return local.systemsInRange(); }))";

/**
 * The neighbourhood of every one of the 2,048 systems: the ids within 7 LY and
 * within 3.5 LY (system-id order) and the count within 25 LY, all from the
 * stub's own transliteration of `legacy_random.h:154-160` (no import of
 * `src/sim/hyperspace/jump.ts`), and the bottleneck value from the script's
 * own `_systemIsBottleneck(locals, seconds)` run in the vm after the pinned
 * hash check.
 */
export function recordNeighbourhoodTable(
  oolitesrc: string,
): NeighbourhoodTable {
  const galaxies: NeighbourhoodTable["galaxies"] = [];
  for (let galaxy = 0; galaxy < POPULATION_GALAXIES; galaxy += 1) {
    const locals: number[][] = [];
    const verylocals: number[][] = [];
    const within25: number[] = [];
    const bottleneck: number[] = [];
    for (let index = 0; index < POPULATION_SYSTEMS_PER_GALAXY; index += 1) {
      const { host, ai } = loadPopulator(
        oolitesrc,
        `g${String(galaxy)}-s${String(index)}`,
        1,
      );
      const near = host.neighbourhood();
      const value = callInContext(ai, TABLE_BOTTLENECK_EXPRESSION);
      if (typeof value !== "boolean") {
        throw new Error("_systemIsBottleneck did not return a boolean");
      }
      locals.push(near.locals.map((neighbour) => neighbour.id));
      verylocals.push(near.verylocals.map((neighbour) => neighbour.id));
      within25.push(near.within25.length);
      if (value) {
        bottleneck.push(index);
      }
    }
    galaxies.push({ galaxy, locals, verylocals, within25, bottleneck });
  }
  return NeighbourhoodTableSchema.parse({
    header: widenedHeader(),
    ranges: { local: 7, veryLocal: 3.5, far: 25 },
    galaxies,
  });
}

// ---------------------------------------------------------------------------
// Boundary draws (plan 22-02): crafted doubles at the comparison boundaries
// of the script, run through the script's own code.
// ---------------------------------------------------------------------------

/** The largest double below 1. */
const BELOW_ONE = 1 - 2 ** -53;

const bitView = new DataView(new ArrayBuffer(8));

function bitsOf(value: number): bigint {
  bitView.setFloat64(0, value);
  return bitView.getBigUint64(0);
}

function fromBits(bits: bigint): number {
  bitView.setBigUint64(0, bits);
  return bitView.getFloat64(0);
}

/** The next double above a finite non-negative `value`. */
function nextUp(value: number): number {
  return fromBits(bitsOf(value) + 1n);
}

/** The next double below a positive `value`. */
function nextDown(value: number): number {
  return fromBits(bitsOf(value) - 1n);
}

/** One draw slot of a case: the nth call to `Math.random` on a script line. */
interface EdgeSlotSpec {
  readonly label: string;
  readonly line: number;
  readonly occurrence: number;
}

/** What one crafted run observed. */
interface CraftedRun {
  readonly counts: readonly (number | null)[];
  readonly capture: GroupCapture | null;
}

/** How one case is run and what it observes. */
interface EdgeSpec {
  readonly id: string;
  readonly site: string;
  readonly boundary: string;
  readonly observes: string;
  readonly system: string;
  readonly entry: PopulationEntryName | null;
  /** Seeds tried in order until the case's extreme probes differ. */
  readonly seeds: readonly number[];
  readonly slots: readonly EdgeSlotSpec[];
  /** Values of the slots other than the one the search moves. */
  readonly pinned: readonly number[];
  /** The index of the slot the search moves. */
  readonly moving: number;
  readonly observe: (run: CraftedRun) => EdgeResult;
  /** Extra facts to record from the observed boundary draw. */
  readonly inputs?: (
    boundary: number,
    observe: (draw: number) => EdgeResult,
  ) => Record<string, number | string>;
}

type EdgeResult = number | string | boolean | number[];

const FIXED_DRAW = 0.5;

/**
 * Run the script with every `Math.random` call at `values[i]` when it is the
 * `slots[i].occurrence`th call made from `slots[i].line` (counted from the
 * start of the callback when an entry is run, else from the start of
 * `systemWillPopulate`) and `FIXED_DRAW` otherwise. The engine's own draws
 * (record pick, escort set-up, positions) stay the seeded stream.
 */
function runCrafted(
  oolitesrc: string,
  spec: EdgeSpec,
  seed: number,
  values: readonly number[],
): CraftedRun {
  const boot = loadPopulator(oolitesrc, spec.system, seed);
  const counters = new Map<number, number>();
  const random = (): number => {
    const stack = new Error().stack ?? "";
    const match = /oolite-populator\.js:(\d+):\d+/.exec(stack);
    const line = match === null ? -1 : Number(match[1]);
    const occurrence = counters.get(line) ?? 0;
    counters.set(line, occurrence + 1);
    const at = spec.slots.findIndex(
      (slot) => slot.line === line && slot.occurrence === occurrence,
    );
    return at >= 0 ? (values[at] ?? FIXED_DRAW) : FIXED_DRAW;
  };
  Reflect.set(boot.ai.global.Math as object, "random", random);
  callInContext(boot.ai, "this.startUp()");
  callInContext(boot.ai, "this.systemWillPopulate()");
  const counts = boot.host.registered.map(
    (registered) => registered.groupCount,
  );
  if (spec.entry === null) {
    return { counts, capture: null };
  }
  const ordinal = POPULATION_ENTRY_NAMES.indexOf(spec.entry);
  const registered = boot.host.registered[ordinal];
  if (registered === undefined) {
    throw new Error(`no entry ${spec.entry}`);
  }
  counters.clear();
  boot.host.beginGroup();
  boot.harnessCall.definition = registered.definition;
  boot.harnessCall.position = boot.host.makePosition(registered.location);
  callInContext(
    boot.ai,
    "__harnessCall.definition.callback(__harnessCall.position)",
  );
  return { counts, capture: boot.host.endGroup() };
}

/** The observation is the same at both extremes: the seed does not exercise the branch. */
class NoThresholdError extends Error {
  public constructor() {
    super("the observation does not change between the extremes");
    this.name = "NoThresholdError";
  }
}

function resultKey(result: EdgeResult): string {
  return JSON.stringify(result);
}

/**
 * The adjacent pair of doubles (below, at) in [lo, hi] where the observation
 * changes from `observe(lo)` to `observe(hi)`; the observation must change
 * once, at a threshold.
 */
function findThreshold(
  observe: (draw: number) => EdgeResult,
  lo: number,
  hi: number,
): { below: number; at: number } {
  const first = resultKey(observe(lo));
  if (first === resultKey(observe(hi))) {
    throw new NoThresholdError();
  }
  let low = bitsOf(lo);
  let high = bitsOf(hi);
  while (high - low > 1n) {
    const middle = (low + high) / 2n;
    if (resultKey(observe(fromBits(middle))) === first) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return { below: fromBits(low), at: fromBits(high) };
}

/** The ordinal of the freighters entry (the first `randomise` call). */
const FREIGHTERS = POPULATION_ENTRY_NAMES.indexOf("oolite-freighters");

function shipOne(run: CraftedRun): PopulationShip {
  const ship = run.capture?.ships[0];
  if (ship === undefined) {
    throw new Error("the crafted run produced no ship");
  }
  return ship;
}

const EDGE_SPECS: readonly EdgeSpec[] = [
  {
    id: "randomise-third-draw",
    site: `${POPULATOR_FILE}:648`,
    boundary:
      "randomise: `Math.random() < count - floor(count)` is strict; the first two draws are 0.5 so the count is the rate itself",
    observes:
      "the groupCount of oolite-freighters (the first randomise call), g0-s7",
    system: "g0-s7",
    entry: null,
    seeds: [1],
    slots: [
      {
        label: "randomise third draw of oolite-freighters",
        line: 648,
        occurrence: 0,
      },
    ],
    pinned: [],
    moving: 0,
    observe: (run) => run.counts[FREIGHTERS] ?? -1,
    inputs: (boundary, observe) => {
      const floor = observe(boundary);
      if (typeof floor !== "number") {
        throw new Error("the freighters count is not a number");
      }
      return { floor, count: floor + boundary, pinnedDraws: "0.5, 0.5" };
    },
  },
  {
    id: "freighter-offender-test",
    site: `${POPULATOR_FILE}:1418`,
    boundary:
      "_addFreighter: the offender test `Math.random() < 0.05` is strict; an offender's bounty is `ceil(Math.random() * 20)` (10 for the fixed 0.5)",
    observes: "bounty of the first ship of oolite-freighters group 0, g0-s7",
    system: "g0-s7",
    entry: "oolite-freighters",
    seeds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    slots: [{ label: "offender test", line: 1418, occurrence: 0 }],
    pinned: [],
    moving: 0,
    observe: (run) => shipOne(run).bounty,
  },
  {
    id: "freighter-opportunist-test",
    site: `${POPULATOR_FILE}:1423`,
    boundary:
      "_addFreighter: the opportunist test `Math.random() < 0.5 && autoAI` is strict, with the offender test forced true",
    observes:
      "cargo kind of the first ship of oolite-freighters group 0 (pirate when it switches to the opportunist AI), g0-s7",
    system: "g0-s7",
    entry: "oolite-freighters",
    seeds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    slots: [
      { label: "offender test (forced true)", line: 1418, occurrence: 0 },
      { label: "opportunist test", line: 1423, occurrence: 0 },
    ],
    pinned: [0],
    moving: 1,
    observe: (run) => shipOne(run).cargoKind,
  },
  {
    id: "police-patrol-interceptor-role",
    site: `${POPULATOR_FILE}:2055`,
    boundary:
      "_addPolicePatrol: `9 + Math.random() * 6 < techlevel` is strict (tech level 12: equality at 0.5 before rounding)",
    observes:
      "the role requested from the engine by oolite-police-route1 group 0, a tech level 12 system",
    system: "TECH12",
    entry: "oolite-police-route1",
    seeds: [1],
    slots: [{ label: "role draw", line: 2055, occurrence: 0 }],
    pinned: [],
    moving: 0,
    observe: (run) => run.capture?.calls[0]?.role ?? "",
  },
  {
    id: "station-patrol-interceptor-role",
    site: `${POPULATOR_FILE}:2082`,
    boundary:
      "_addPoliceStationPatrol: `9 + Math.random() * 6 < techlevel` is strict (tech level 12)",
    observes:
      "the role requested from the engine by oolite-police-stationpatrol, a tech level 12 system",
    system: "TECH12",
    entry: "oolite-police-stationpatrol",
    seeds: [1],
    slots: [{ label: "role draw", line: 2082, occurrence: 0 }],
    pinned: [],
    moving: 0,
    observe: (run) => run.capture?.calls[0]?.role ?? "",
  },
  {
    id: "set-weapons-level-one-and-a-half",
    site: `${POPULATOR_FILE}:2242`,
    boundary:
      "_setWeapons: `level - floor(level) > Math.random()` is strict; _addLightHunter calls it with level 1.5 (equality at 0.5)",
    observes:
      "forward and aft weapon of the first ship of oolite-hunters-route1 group 0, g0-s7",
    system: "g0-s7",
    entry: "oolite-hunters-route1",
    seeds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    slots: [{ label: "_setWeapons draw of ship 0", line: 2242, occurrence: 0 }],
    pinned: [],
    moving: 0,
    observe: (run) => `${shipOne(run).forwardWeapon}/${shipOne(run).aftWeapon}`,
  },
];

/** `[r1, r2]` pairs probed for the pack class boundary `floor(k + 0.5 + r1 - r2)`. */
const PACK_PROBES: readonly (readonly [number, number])[] = [
  [0.75, 0.25],
  [nextDown(0.75), 0.25],
  [0.25, 0.75],
  [0.25, nextUp(0.75)],
  [0, 0],
  [BELOW_ONE, 0],
  [0, BELOW_ONE],
  [BELOW_ONE, BELOW_ONE],
];

function packLightFighters(run: CraftedRun): number {
  return (
    run.capture?.ships.filter((ship) => ship.role === "pirate-light-fighter")
      .length ?? -1
  );
}

/** The first system of any galaxy whose plist tech level is 12 and government >= 2. */
function techLevelTwelveSystem(): string {
  for (let galaxy = 0; galaxy < POPULATION_GALAXIES; galaxy += 1) {
    for (const system of galaxySystemsOf(galaxy)) {
      if (system.techLevelRaw === 12 && system.government >= 2) {
        return `g${String(galaxy)}-s${String(system.systemIndex)}`;
      }
    }
  }
  throw new Error("no system has tech level 12 and government 2 or more");
}

/**
 * The boundary-draw cases, each run through the script's own functions with
 * crafted doubles (`runCrafted`): the `randomise` third draw at
 * `count - floor(count)`, the offender test at 0.05, the opportunist test at
 * 0.5, `9 + r * 6 < TL` at its threshold, the pack class
 * `floor(k + 0.5 + r1 - r2)` at +-0.5, `_setWeapons`' `level - floor(level) > r`
 * at equality, and the draws 0 and the largest double below 1 in every case.
 */
export function recordEdgeDraws(oolitesrc: string): EdgeDraws {
  const cases: EdgeCase[] = [];
  for (const base of EDGE_SPECS) {
    const system =
      base.system === "TECH12" ? techLevelTwelveSystem() : base.system;
    const spec: EdgeSpec = { ...base, system };
    let chosen: { seed: number; below: number; at: number } | undefined;
    for (const seed of spec.seeds) {
      const observe = (draw: number): EdgeResult => {
        const values = spec.slots.map((_slot, at) =>
          at === spec.moving ? draw : (spec.pinned[at] ?? FIXED_DRAW),
        );
        return spec.observe(runCrafted(oolitesrc, spec, seed, values));
      };
      try {
        const found = findThreshold(observe, 0, BELOW_ONE);
        chosen = { seed, ...found };
        break;
      } catch (error: unknown) {
        // This seed's ship does not exercise the branch; try the next.
        if (!(error instanceof NoThresholdError)) {
          throw error;
        }
      }
    }
    if (chosen === undefined) {
      throw new Error(`edge case ${spec.id}: no seed exercises the boundary`);
    }
    const { seed, below, at } = chosen;
    const observe = (draw: number): EdgeResult => {
      const values = spec.slots.map((_slot, index) =>
        index === spec.moving ? draw : (spec.pinned[index] ?? FIXED_DRAW),
      );
      return spec.observe(runCrafted(oolitesrc, spec, seed, values));
    };
    const draws = [...new Set([0, below, at, BELOW_ONE])].sort((a, b) => a - b);
    cases.push({
      id: spec.id,
      site: spec.site,
      boundary: spec.boundary,
      observes: spec.observes,
      system,
      seed,
      entry: spec.entry,
      inputs: spec.inputs === undefined ? {} : spec.inputs(at, observe),
      fixedDraw: FIXED_DRAW,
      slots: spec.slots.map((slot) => ({ ...slot })),
      probes: draws.map((draw) => ({
        draws: spec.slots.map((_slot, index) =>
          index === spec.moving ? draw : (spec.pinned[index] ?? FIXED_DRAW),
        ),
        result: observe(draw),
      })),
    });
  }

  const packSpec: EdgeSpec = {
    id: "pirate-pack-class-count",
    site: `${POPULATOR_FILE}:1813`,
    boundary:
      "_addPiratePack: the light fighter count is `floor(2 + (0.5 + r1 - r2))`; r1 - r2 = +-0.5 puts the argument on an integer",
    observes:
      "the number of pirate-light-fighter ships of oolite-pirate-light-route1 group 0, g0-s7",
    system: "g0-s7",
    entry: "oolite-pirate-light-route1",
    seeds: [1],
    slots: [
      { label: "r1 of the light class", line: 1813, occurrence: 0 },
      { label: "r2 of the light class", line: 1813, occurrence: 1 },
    ],
    pinned: [],
    moving: 0,
    observe: packLightFighters,
  };
  cases.push({
    id: packSpec.id,
    site: packSpec.site,
    boundary: packSpec.boundary,
    observes: packSpec.observes,
    system: packSpec.system,
    seed: 1,
    entry: packSpec.entry,
    inputs: { k: 2 },
    fixedDraw: FIXED_DRAW,
    slots: packSpec.slots.map((slot) => ({ ...slot })),
    probes: PACK_PROBES.map(([r1, r2]) => ({
      draws: [r1, r2],
      result: packSpec.observe(runCrafted(oolitesrc, packSpec, 1, [r1, r2])),
    })),
  });

  return EdgeDrawsSchema.parse({
    header: widenedHeader(),
    cases,
    unreachable: [
      {
        id: "randomise-equality-on-the-port-stream",
        site: `${POPULATOR_FILE}:648`,
        boundary:
          "randomise: the third draw equal to count - floor(count) for a count whose fraction is not a multiple of 2^-32",
        reason:
          "the recorded draws and the port's streams are u32 values over 2^32, so a fraction that is not a multiple of 2^-32 (for example 0.123) is never drawn exactly; the boundary is exercised on `randomise` itself with the recorded doubles above, not through a stream",
      },
    ],
  });
}

/**
 * Per catalogue key the ship facts `shipdata.plist` carries that
 * `ships-npc.json` lacks (plan 22-05 compiles them): `hyperspace_motor`
 * (`ShipEntity.m:382`, default YES), an authored `accuracy` and
 * `cargo_carried`, resolved through `like_ship`.
 */
export function recordShipFacts(oolitesrc: string): ShipFacts {
  loadPopulator(oolitesrc, "g0-s7", 1);
  const facts = readShipFacts(oolitesrc);
  const ships = sortedCodeUnits(npcCatalogue().map((record) => record.key)).map(
    (key) => {
      const fact = facts.get(key);
      if (fact === undefined) {
        throw new Error(`no ship facts for ${key}`);
      }
      return {
        key,
        hasHyperspaceMotor: fact.hyperspaceMotor,
        accuracy: fact.accuracy,
        cargoCarried: fact.cargoCarried,
      };
    },
  );
  return ShipFactsSchema.parse({ header: widenedHeader(), ships });
}

/**
 * The selector's proxy population of one system: the sum of the `groupCount`
 * values of every entry the script registers when every draw is 0.5 (so
 * `randomise` returns the rounded rate), the stub host answering the rest. It
 * ranks systems for `selectPopulationSystems`; it is not a fixture value.
 */
export function proxyPopulation(oolitesrc: string, systemId: string): number {
  const { host, ai } = loadPopulator(oolitesrc, systemId, 1);
  Reflect.set(ai.global.Math as object, "random", () => 0.5);
  callInContext(ai, "this.startUp()");
  callInContext(ai, "this.systemWillPopulate()");
  return host.registered.reduce(
    (total, registered) => total + (registered.groupCount ?? 0),
    0,
  );
}

/**
 * Every system of the eight galaxies as the selector sees it: the content
 * facts, the proxy population and the neighbourhood of `table`.
 */
export function collectCandidates(
  oolitesrc: string,
  table: NeighbourhoodTable,
): PopulationCandidate[] {
  const candidates: PopulationCandidate[] = [];
  for (let galaxy = 0; galaxy < POPULATION_GALAXIES; galaxy += 1) {
    const row = table.galaxies[galaxy];
    if (row === undefined) {
      throw new Error(`the table has no galaxy ${String(galaxy)}`);
    }
    for (const system of galaxySystemsOf(galaxy)) {
      const index = system.systemIndex;
      const id = `g${String(galaxy)}-s${String(index)}`;
      candidates.push({
        id,
        galaxy,
        index,
        name: system.name,
        government: system.government,
        economy: system.economy,
        techLevel: system.techLevelRaw,
        proxy: proxyPopulation(oolitesrc, id),
        locals: row.locals[index]?.length ?? 0,
        verylocals: row.verylocals[index]?.length ?? 0,
        bottleneck: row.bottleneck.includes(index),
      });
    }
  }
  return candidates;
}

/** Re-run the selector from the pinned script (the gated rerun compares it). */
export function recomputeSelection(oolitesrc: string): PopulationSelection {
  return selectPopulationSystems(
    collectCandidates(oolitesrc, recordNeighbourhoodTable(oolitesrc)),
  );
}

function widenedHeader(): {
  oolitePin: typeof POPULATION_OOLITE_PIN;
  scriptFile: typeof POPULATION_SCRIPT_FILE;
  scriptSha256: typeof POPULATION_SCRIPT_SHA256;
} {
  return {
    oolitePin: POPULATION_OOLITE_PIN,
    scriptFile: POPULATION_SCRIPT_FILE,
    scriptSha256: POPULATION_SCRIPT_SHA256,
  };
}

/** The file names of the widened files next to the fixtures. */
export const NEIGHBOURHOOD_FILE = "neighbourhood-all.json";
export const EDGE_DRAWS_FILE = "edge-draws.json";
export const SHIP_FACTS_FILE = "ship-facts.json";

/**
 * Record everything the widened oracle holds into `outDir`: every
 * `POPULATION_SYSTEMS` x `POPULATION_SEEDS` fixture and the table. Returns the
 * written paths.
 */
export function writeAll(oolitesrc: string, outDir: string): string[] {
  mkdirSync(outDir, { recursive: true });
  const written: string[] = [];
  for (const { id, seeds } of POPULATION_SYSTEMS) {
    for (const seed of seeds) {
      written.push(writeFixture(oolitesrc, outDir, id, seed));
    }
  }
  const tablePath = join(outDir, NEIGHBOURHOOD_FILE);
  writeFileSync(tablePath, widenedText(recordNeighbourhoodTable(oolitesrc)));
  written.push(tablePath);
  const edgePath = join(outDir, EDGE_DRAWS_FILE);
  writeFileSync(edgePath, widenedText(recordEdgeDraws(oolitesrc)));
  written.push(edgePath);
  const factsPath = join(outDir, SHIP_FACTS_FILE);
  writeFileSync(factsPath, widenedText(recordShipFacts(oolitesrc)));
  written.push(factsPath);
  return written;
}

function argument(args: readonly string[], flag: string): string | undefined {
  const at = args.indexOf(flag);
  return at >= 0 ? args[at + 1] : undefined;
}

function main(args: readonly string[]): void {
  const oolitesrc = process.env.OOLITE_SRC ?? "";
  if (oolitesrc === "") {
    throw new Error("OOLITE_SRC must name a tree built from Oolite 7437f22");
  }
  if (args.includes("--select")) {
    process.stdout.write(
      `${JSON.stringify(recomputeSelection(oolitesrc), null, 2)}\n`,
    );
    return;
  }
  const out = argument(args, "--out");
  if (out === undefined) {
    throw new Error("--out <dir> is required");
  }
  if (args.includes("--all")) {
    for (const path of writeAll(oolitesrc, resolve(out))) {
      process.stdout.write(`${path}\n`);
    }
    return;
  }
  const systemId = argument(args, "--system") ?? "g0-s7";
  const seed = Number(argument(args, "--seed") ?? "1");
  if (!Number.isInteger(seed) || seed < 0) {
    throw new Error("--seed must be a non-negative integer");
  }
  const path = writeFixture(oolitesrc, resolve(out), systemId, seed);
  process.stdout.write(`${path}\n`);
}

const invoked = process.argv[1];
if (invoked !== undefined && import.meta.url === pathToFileURL(invoked).href) {
  try {
    main(process.argv.slice(2));
  } catch (error: unknown) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
