// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The stub host of the population recorder (Phase 22, plan 22-01): everything
 * Oolite's own `oolite-populator.js` reads from the engine, answered from a
 * modelled world and recorded.
 *
 * Dev-only. Nothing under `src/` or `public/` may import this module, and the
 * harness sentinel rides on every vm global as in `host.ts` (guarded by
 * `tests/guards/harness-isolation.test.ts`). `node:vm` is not a security
 * boundary: the only script run through this host is the pinned,
 * operator-supplied `oolite-populator.js` (see `populator-record.ts`).
 *
 * What the host models, each with its own tagged draws (D-08):
 *
 * - The script-facing world: `system` (ID, `info`, `setPopulator`,
 *   `populatorSettings`, `sun`, `mainPlanet`, `mainStation`, `addShips`,
 *   `addGroup`), `SystemInfo` (`systemsInRange`, `distanceToSystem`, a
 *   transliteration of `legacy_random.h:154-160` and
 *   `oolite-global-prefix.js:80-91` that shares no code with
 *   `src/sim/hyperspace/jump.ts`), `Ship`, `ShipGroup`, `Vector3D`.
 * - The engine pieces the script relies on: the weighted record pick
 *   (`OOProbabilitySet`, written here from the Oolite source), the initial
 *   accuracy and the `has_fuel_injection` roll of a new ship, the trader's
 *   random initial cargo flag and the trader escort removal
 *   (`Universe.m:2650-2665`), and the engine escorts `setUpMixedEscorts` /
 *   `setUpOneEscort` (`ShipEntity.m:1532-1760`).
 *
 * Not modelled, by decision and recorded as such in the fixtures: ship
 * positions and orientations, the witchpoint arrival effects of ships spawned
 * inside scanner range of the witchpoint, crew, AI, plain (non-`escort_roles`)
 * escorts (a catalogue record that needs them makes the host throw), and every
 * path the port cuts (buoys, asteroids, hermits, medium and heavy hunters,
 * assassins, Thargoids), whose callbacks are never run.
 */

import {
  POPULATION_CARGO_KINDS,
  POPULATION_DRAW_TAGS,
  type PopulationDraws,
  type PopulationDrawTag,
  type PopulationEngineCall,
  type PopulationNeighbour,
  type PopulationShip,
  type PopulationShipGroup,
  type PopulationShipWrite,
} from "../../tests/oracles/population/schema.js";
import { AI_HARNESS_SENTINEL } from "./host.js";

const TWO_32 = 4294967296;
const MAX_ESCORTS = 16;
/** `MAX_JUMP_RANGE` of the fuel property setter (`OOJSShip.m:1315-1320`). */
const MAX_FUEL_LY = 7;
/** `SCANNER_MAX_RANGE` metres. */
const SCANNER_RANGE = 25600;

type CargoKind = (typeof POPULATION_CARGO_KINDS)[number];

/** One record of `src/content/generated/ships-npc.json`, the fields the host reads. */
export interface PopulatorCatalogueRecord {
  readonly key: string;
  readonly name: string;
  readonly roles: readonly string[];
  readonly autoAi: number;
  readonly autoWeapons: number;
  readonly hasFuelInjection: number;
  readonly escorts: number;
  readonly escortRoles:
    | readonly {
        readonly min: number;
        readonly max: number;
        readonly role: string;
      }[]
    | null;
  readonly likelyCargo: number;
  readonly maxCargo: number;
  readonly missiles: number;
  readonly maxMissiles: number;
  readonly forwardWeapon: string;
  readonly aftWeapon: string;
  readonly scanClass: string;
  readonly fuel: number;
  readonly bounty: number;
}

/** Ship facts the committed catalogue does not carry, read from `shipdata.plist`. */
export interface PopulatorShipFact {
  readonly hyperspaceMotor: boolean;
  readonly accuracy: number | null;
  readonly cargoCarried: string | null;
}

/** One system of the galaxy: planetinfo values the script reads. */
export interface PopulatorSystemRow {
  readonly id: number;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly economy: number;
  readonly government: number;
  /** The plist `techlevel`, no +1. */
  readonly techLevel: number;
}

/** A vector in Oolite's frame (the planet is at +z). */
export interface PopulatorVec {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PopulatorHostOptions {
  readonly galaxy: number;
  /** Every system of the galaxy, in id order. */
  readonly systems: readonly PopulatorSystemRow[];
  readonly systemId: number;
  readonly planet: PopulatorVec;
  readonly planetRadius: number;
  readonly sun: PopulatorVec;
  readonly sunRadius: number;
  readonly station: PopulatorVec;
  readonly stationForward: PopulatorVec;
  readonly catalogue: readonly PopulatorCatalogueRecord[];
  readonly shipFacts: ReadonlyMap<string, PopulatorShipFact>;
  /** The description the script expands `[medical-word]` to. */
  readonly medicalWord: string;
  /** Seed text of the local draw generator (system id and seed). */
  readonly drawKey: string;
}

/** The registered definition of one `setPopulator` call. */
export interface RegisteredPopulator {
  readonly ordinal: number;
  readonly name: string;
  readonly priority: number;
  readonly location: string;
  readonly groupCount: number | null;
  /** The draws taken since the previous `setPopulator` call. */
  readonly window: readonly { tag: PopulationDrawTag; readonly u: number }[];
  /** The definition object; its `callback` runs inside the vm. */
  readonly definition: unknown;
}

/** What one callback produced. */
export interface GroupCapture {
  readonly draws: PopulationDraws;
  readonly calls: readonly PopulationEngineCall[];
  readonly ships: readonly PopulationShip[];
  readonly shipGroups: readonly PopulationShipGroup[];
}

export interface PopulatorHost {
  /** Values injected into the vm context as globals. */
  readonly globals: Readonly<Record<string, unknown>>;
  /** Registered `setPopulator` calls, in registration order. */
  readonly registered: RegisteredPopulator[];
  /** Host members read but not answered, per `target.member`. */
  readonly missing: ReadonlyMap<string, number>;
  /** Reads of each injected global. */
  readonly globalReads: Map<string, number>;
  /** Logged `log(...)` lines. */
  readonly logs: string[];
  /** Pass the script's own helpers to the host so their draws are tagged. */
  wrapHelper(tag: PopulationDrawTag, helper: unknown): unknown;
  /** Relabel the draws of a `setPopulator` window (count and setup draws). */
  retag(
    window: readonly { tag: PopulationDrawTag }[],
    from: number,
    to: number,
    tag: PopulationDrawTag,
  ): void;
  /** The position handed to a callback for a location code. */
  makePosition(location: string): PopulatorVec3;
  /** Start recording one group (one callback run). */
  beginGroup(): void;
  /** Finish the group: the draws, engine calls, ships and ship groups. */
  endGroup(): GroupCapture;
  /** Locals and very locals as the script saw them, with the 25 LY list. */
  neighbourhood(): {
    readonly locals: PopulationNeighbour[];
    readonly verylocals: PopulationNeighbour[];
    readonly within25: number[];
  };
  /** Catalogue keys of the ships created so far in this host. */
  usedKeys(): ReadonlySet<string>;
  /** Draws taken since the last `setPopulator` call. */
  trailingDraws(): number;
}

/** The vector class the script sees (`Vector3D`). */
export class PopulatorVec3 {
  public x: number;
  public y: number;
  public z: number;

  public constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  public add(other: PopulatorVec3): PopulatorVec3 {
    return new PopulatorVec3(
      this.x + other.x,
      this.y + other.y,
      this.z + other.z,
    );
  }

  public subtract(other: PopulatorVec3): PopulatorVec3 {
    return new PopulatorVec3(
      this.x - other.x,
      this.y - other.y,
      this.z - other.z,
    );
  }

  public multiply(factor: number): PopulatorVec3 {
    return new PopulatorVec3(this.x * factor, this.y * factor, this.z * factor);
  }

  /** `Math.sqrt(x*x + y*y + z*z)`, not `Math.hypot`. */
  public magnitude(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  public static randomDirection(): PopulatorVec3 {
    throw new Error(
      "Vector3D.randomDirection is not modelled: a kept path reached a launch or wormhole position",
    );
  }
}

/** Seed text hash (FNV-1a, 32 bit). */
function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * The local seeded u32 generator (splitmix32). It is the recorder's own and
 * never imports `src/sim/rng.ts`; the draws of a fixture are whatever this
 * stream yields for (system id, seed).
 */
export function createDrawSource(key: string): () => number {
  let state = fnv1a32(key) | 0;
  return (): number => {
    state = (state + 0x9e3779b9) | 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return (z ^ (z >>> 15)) >>> 0;
  };
}

/** One entry of the draw log; `tag` is relabelled for count and setup draws. */
interface LoggedDraw {
  tag: PopulationDrawTag;
  readonly u: number;
}

/** `JS_ValueToInt32`. */
function toInt32(value: unknown): number {
  return Number(value) | 0;
}

/** C `lround` for a non-negative argument. */
function lround(value: number): number {
  return Math.floor(value + 0.5);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Members a missing-read tracker never reports (JS object protocol). */
const OBJECT_PROTOCOL = new Set([
  "toString",
  "valueOf",
  "constructor",
  "hasOwnProperty",
  "toJSON",
  "then",
  "inspect",
  "asymmetricMatch",
  "nodeType",
  "length",
]);

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/** Wrap `target` so a read of a member it lacks is counted in `missing`. */
function tracked<T extends object>(
  label: string,
  target: T,
  missing: Map<string, number>,
): T {
  return new Proxy(target, {
    get(object, key): unknown {
      if (
        typeof key === "string" &&
        !(key in object) &&
        !OBJECT_PROTOCOL.has(key)
      ) {
        bump(missing, `${label}.${key}`);
      }
      return Reflect.get(object, key, object);
    },
  });
}

/** Cargo flag of the engine (`OOTypes.h:99-109`), named by the cargo kind it gives. */
type CargoFlag = CargoKind;

const CUT_EQUIPMENT = new Set([
  "EQ_ECM",
  "EQ_SHIELD_BOOSTER",
  "EQ_MISSILE",
  "EQ_HARDENED_MISSILE",
  "EQ_ESCAPE_POD",
]);

/**
 * One ship. Script-visible members are accessors that apply the engine's
 * setter semantics and log the write; engine bookkeeping lives in fields whose
 * names start with an underscore.
 */
class PopulatorShip {
  public readonly _index: number;
  public readonly _record: PopulatorCatalogueRecord;
  public readonly _role: string;
  public readonly _writes: PopulationShipWrite[] = [];
  public readonly _awarded = new Set<string>();
  public _primaryRole: string;
  public _bounty: number;
  public _accuracy: number;
  public _fuel: number;
  public _home: number;
  public _destination: number;
  public _forward: string;
  public _aft: string;
  public _injector: boolean;
  public _heat = 1;
  public _maxEscorts = 0;
  public _cargoFlag: CargoFlag = "unset";
  public _cargoCount = 0;
  public _group: PopulatorGroup | null = null;
  public _escortGroup: PopulatorGroup | null = null;
  public _owner: PopulatorShip | null = null;
  public _slot: number | null = null;
  public _pendingEscorts: number;
  public _maxEscortCount: number;
  public _missiles: string[];
  public readonly _proxy: PopulatorShip;
  private readonly _world: PopulatorWorld;
  private readonly _intership: Record<string, unknown>;
  private readonly _aiScript: Record<string, unknown>;

  public constructor(
    world: PopulatorWorld,
    index: number,
    record: PopulatorCatalogueRecord,
    role: string,
    fact: PopulatorShipFact,
  ) {
    this._world = world;
    this._index = index;
    this._record = record;
    this._role = role;
    // `newShipWithRole`: the role becomes the primary role, and an
    // `interceptor` is a `police` ship from then on (`Universe.m:3652-3655`).
    this._primaryRole = role === "interceptor" ? "police" : role;
    this._bounty = record.bounty;
    this._fuel = record.fuel;
    this._home = world.systemId;
    this._destination = world.systemId;
    this._forward = record.forwardWeapon;
    this._aft = record.aftWeapon;
    this._injector = false;
    this._accuracy = fact.accuracy ?? 0;
    this._maxEscortCount = Math.min(record.escorts, MAX_ESCORTS);
    this._pendingEscorts = this._maxEscortCount;
    if (this._pendingEscorts === 0 && record.escortRoles !== null) {
      // `ShipEntity.m:681-686`: high enough that governmental reductions do
      // not end at zero; `_maxEscortCount` stays 0.
      this._pendingEscorts = MAX_ESCORTS;
    }
    this._missiles = Array.from(
      { length: Math.min(record.missiles, record.maxMissiles) },
      () => "EQ_MISSILE",
    );
    this._intership = new Proxy(
      {},
      {
        set: (object, key, value: unknown): boolean => {
          if (typeof key === "string") {
            this._log(
              `AIScript.oolite_intership.${key}`,
              typeof value === "number" ||
                typeof value === "string" ||
                typeof value === "boolean"
                ? value
                : null,
              true,
            );
          }
          return Reflect.set(object, key, value);
        },
      },
    );
    this._aiScript = { oolite_intership: this._intership };
    this._proxy = world.proxyShip(this);
  }

  public _log(
    member: string,
    value: PopulationShipWrite["value"],
    cut = false,
  ): void {
    this._writes.push(cut ? { member, value, cut: true } : { member, value });
  }

  /** `ShipEntity setCargoFlag:` (`ShipEntity.m:7323-7375`). */
  public _setCargoFlag(flag: CargoFlag): void {
    if (this._cargoFlag === flag) {
      return;
    }
    this._cargoFlag = flag;
    let num: number;
    if (this._record.likelyCargo > 0) {
      num = Math.floor(
        this._record.likelyCargo * (0.5 + this._world.engineFloat("cargo")),
      );
      if (num > this._record.maxCargo) {
        num = this._record.maxCargo;
      }
    } else {
      num = this._record.maxCargo;
    }
    if (num > 200) {
      num = 200;
    }
    if (num > 0 && flag === "pirate") {
      this._cargoCount =
        this._world.engineUint("cargo") % (1 + Math.floor(num / 2));
    } else if (num > 0 && flag !== "unset") {
      this._cargoCount = num;
    } else {
      this._cargoCount = 0;
    }
  }

  /** `ShipEntity setGroup:` (`ShipEntity.m:5975-5989`). */
  public _setGroup(group: PopulatorGroup | null): void {
    if (group === this._group) {
      return;
    }
    if (this._group !== null && this._escortGroup !== this._group) {
      if (this._group._leader === this) {
        this._group._leader = null;
      }
      this._group._remove(this);
    }
    group?._add(this);
    this._group = group;
  }

  // ----- script-visible members -----

  public get name(): string {
    return this._record.name;
  }

  public get primaryRole(): string {
    return this._primaryRole;
  }

  public set primaryRole(value: string) {
    this._primaryRole = String(value);
    this._log("primaryRole", this._primaryRole);
  }

  public get bounty(): number {
    return this._bounty;
  }

  public set bounty(value: unknown) {
    let amount = toInt32(value);
    if (amount < 0) {
      amount = 0;
    }
    this._log("bounty", amount);
    if (this._record.scanClass === "CLASS_POLICE" && amount !== 0) {
      return;
    }
    this._bounty = amount;
  }

  public get autoAI(): boolean {
    return this._record.autoAi > 0;
  }

  public get autoWeapons(): boolean {
    return this._record.autoWeapons > 0;
  }

  public get hasHyperspaceMotor(): boolean {
    return this._world.hyperspaceMotor(this._record.key);
  }

  public get cargoSpaceCapacity(): number {
    return this._record.maxCargo;
  }

  public get accuracy(): number {
    return this._accuracy;
  }

  public set accuracy(value: unknown) {
    this._accuracy = clampAccuracy(Number(value), this._record.scanClass);
    this._log("accuracy", this._accuracy);
  }

  public get forwardWeapon(): string | null {
    return this._forward === "EQ_WEAPON_NONE" ? null : this._forward;
  }

  public set forwardWeapon(value: unknown) {
    this._forward = typeof value === "string" ? value : "EQ_WEAPON_NONE";
    this._log("forwardWeapon", this._forward);
  }

  public get aftWeapon(): string | null {
    return this._aft === "EQ_WEAPON_NONE" ? null : this._aft;
  }

  public set aftWeapon(value: unknown) {
    this._aft = typeof value === "string" ? value : "EQ_WEAPON_NONE";
    this._log("aftWeapon", this._aft);
  }

  public get subEntities(): unknown[] {
    return [];
  }

  public get missiles(): { equipmentKey: string }[] {
    return this._missiles.map((equipmentKey) => ({ equipmentKey }));
  }

  /** Tenths on the way in; the getter divides as `kShip_fuel` does. */
  public get fuel(): number {
    return this._fuel / 10;
  }

  public set fuel(value: unknown) {
    const clamped = Math.min(Math.max(Number(value), 0), MAX_FUEL_LY);
    this._fuel = lround(clamped * 10);
    this._log("fuel", this._fuel);
  }

  public get homeSystem(): number {
    return this._home;
  }

  public set homeSystem(value: unknown) {
    this._home = toInt32(value);
    this._log("homeSystem", this._home);
  }

  public get destinationSystem(): number {
    return this._destination;
  }

  public set destinationSystem(value: unknown) {
    this._destination = toInt32(value);
    this._log("destinationSystem", this._destination);
  }

  public get group(): unknown {
    return this._group?._proxy ?? null;
  }

  public set group(value: unknown) {
    this._setGroup(this._world.groupOf(value));
  }

  /** `escortGroup` is created on first use, with the ship as leader and member. */
  public _escortGroupObject(): PopulatorGroup {
    if (this._escortGroup === null) {
      this._escortGroup = new PopulatorGroup(this._world, "escort group");
      this._escortGroup._setLeader(this);
    }
    return this._escortGroup;
  }

  public get escortGroup(): unknown {
    return this._escortGroupObject()._proxy;
  }

  public get scanClass(): string {
    return this._record.scanClass;
  }

  public get heatInsulation(): number {
    return this._heat;
  }

  public set heatInsulation(value: unknown) {
    this._heat = Math.max(Number(value), 0.125);
    this._log("heatInsulation", this._heat, true);
  }

  public get maxEscorts(): number {
    return this._maxEscorts;
  }

  public set maxEscorts(value: unknown) {
    this._maxEscorts = toInt32(value);
    this._log("maxEscorts", this._maxEscorts, true);
  }

  public get AIScript(): Record<string, unknown> {
    return this._aiScript;
  }

  public setBounty(amount: unknown, reason: unknown): void {
    const value = toInt32(amount);
    if (typeof reason !== "string" || value < 0) {
      throw new Error("Ship.setBounty: bad arguments");
    }
    this._bounty = value;
    this._log("setBounty", value);
  }

  public setCargoType(kind: unknown): boolean {
    const flags: Readonly<Record<string, CargoFlag>> = {
      SCARCE_GOODS: "scarce",
      PLENTIFUL_GOODS: "plentiful",
      MEDICAL_GOODS: "medical",
      ILLEGAL_GOODS: "contraband",
      PIRATE_GOODS: "pirate",
    };
    const flag = typeof kind === "string" ? flags[kind] : undefined;
    this._log("setCargoType", typeof kind === "string" ? kind : null);
    if (flag === undefined) {
      return false;
    }
    this._setCargoFlag(flag);
    return true;
  }

  public awardEquipment(key: unknown): boolean {
    const equipment = String(key);
    this._log("awardEquipment", equipment, CUT_EQUIPMENT.has(equipment));
    if (equipment === "EQ_HARDENED_MISSILE") {
      this._missiles.push(equipment);
      return true;
    }
    this._awarded.add(equipment);
    if (equipment === "EQ_FUEL_INJECTION") {
      this._injector = true;
    }
    return true;
  }

  public removeEquipment(key: unknown): boolean {
    const equipment = String(key);
    this._log("removeEquipment", equipment, CUT_EQUIPMENT.has(equipment));
    if (equipment === "EQ_MISSILE") {
      const at = this._missiles.indexOf("EQ_MISSILE");
      if (at >= 0) {
        this._missiles.splice(at, 1);
      }
      return at >= 0;
    }
    return this._awarded.delete(equipment);
  }

  public switchAI(name: unknown): boolean {
    this._log("switchAI", String(name), true);
    return true;
  }
}

/** `setAccuracy:` (`ShipEntity.m:1126-1143`) on a float32 property. */
function clampAccuracy(value: number, scanClass: string): number {
  let accuracy = value;
  if (accuracy < 0 && scanClass === "CLASS_MISSILE") {
    accuracy = 0;
  } else if (accuracy < -5) {
    accuracy = -5;
  } else if (accuracy > 10) {
    accuracy = 10;
  }
  return Math.fround(accuracy);
}

/** `OOShipGroup`: an ordered member list with an optional leader. */
class PopulatorGroup {
  public readonly _name: string;
  public _leader: PopulatorShip | null = null;
  public readonly _members: PopulatorShip[] = [];
  public readonly _proxy: PopulatorGroup;
  private readonly _world: PopulatorWorld;

  public constructor(world: PopulatorWorld, name: string) {
    this._world = world;
    this._name = name;
    this._proxy = world.proxyGroup(this);
  }

  public _add(ship: PopulatorShip): void {
    if (!this._members.includes(ship)) {
      this._members.push(ship);
    }
  }

  public _remove(ship: PopulatorShip): void {
    const at = this._members.indexOf(ship);
    if (at >= 0) {
      this._members.splice(at, 1);
    }
    if (this._leader === ship) {
      this._leader = null;
    }
  }

  /** `setLeader:` adds the leader as a member (`OOShipGroup.m:159-168`). */
  public _setLeader(ship: PopulatorShip | null): void {
    if (ship !== null && ship !== this._leader) {
      this._add(ship);
    }
    this._leader = ship;
  }

  public get name(): string {
    return this._name;
  }

  public get ships(): unknown[] {
    return this._members.map((ship) => ship._proxy);
  }

  public get count(): number {
    return this._members.length;
  }

  public get leader(): unknown {
    return this._leader?._proxy ?? null;
  }

  public addShip(ship: unknown): void {
    const member = this._world.shipOf(ship);
    if (member === null) {
      return;
    }
    if (this._members.includes(member)) {
      return;
    }
    member._setGroup(this);
  }
}

/** `SystemInfo`: one system's planetinfo values and its galaxy neighbourhood. */
class PopulatorSystemInfo {
  private readonly _world: PopulatorWorld;
  private readonly _row: PopulatorSystemRow;

  public constructor(world: PopulatorWorld, row: PopulatorSystemRow) {
    this._world = world;
    this._row = row;
  }

  public get systemID(): number {
    return this._row.id;
  }

  public get government(): number {
    return this._row.government;
  }

  public get economy(): number {
    return this._row.economy;
  }

  public get techlevel(): number {
    return this._row.techLevel;
  }

  public get name(): string {
    return this._row.name;
  }

  /**
   * `distanceBetweenPlanetPositions` (`legacy_random.h:154-160`): C int
   * division and truncation, then 0.4 per unit.
   */
  public distanceToSystem(other: unknown): number {
    if (!(other instanceof PopulatorSystemInfo)) {
      throw new Error(
        "SystemInfo.distanceToSystem: argument is not a SystemInfo",
      );
    }
    const dx = this._row.x - other._row.x;
    const dy = Math.trunc((this._row.y - other._row.y) / 2);
    const dist = Math.trunc(Math.sqrt(dx * dx + dy * dy));
    return 0.4 * dist;
  }

  /**
   * `SystemInfo.prototype.systemsInRange` (`oolite-global-prefix.js:80-91`):
   * every other system of the galaxy, in id order, within `range`.
   */
  public systemsInRange(range?: number): PopulatorSystemInfo[] {
    const limit = range === undefined ? 7 : range;
    return this._world
      .allInfos()
      .filter(
        (other) =>
          other._row.id !== this._row.id &&
          this.distanceToSystem(other) <= limit,
      );
  }
}

/** The world the script runs against; one per recorded (system, seed). */
class PopulatorWorld {
  public readonly systemId: number;
  public readonly options: PopulatorHostOptions;
  public readonly missing = new Map<string, number>();
  public readonly drawLog: LoggedDraw[] = [];
  public readonly registered: RegisteredPopulator[] = [];
  public readonly logs: string[] = [];
  private readonly _source: () => number;
  private readonly _tagStack: PopulationDrawTag[] = [];
  private readonly _byKey = new Map<string, PopulatorCatalogueRecord>();
  private readonly _infos: PopulatorSystemInfo[];
  private readonly _shipsByProxy = new WeakMap<object, PopulatorShip>();
  private readonly _groupsByProxy = new WeakMap<object, PopulatorGroup>();
  private readonly _used = new Set<string>();
  private _windowStart = 0;
  private _groupStart = 0;
  private _ships: PopulatorShip[] = [];
  private _calls: PopulationEngineCall[] = [];
  public readonly stationGroup: PopulatorGroup;

  public constructor(options: PopulatorHostOptions) {
    this.options = options;
    this.systemId = options.systemId;
    this._source = createDrawSource(options.drawKey);
    this._infos = options.systems.map(
      (row) => new PopulatorSystemInfo(this, row),
    );
    for (const record of options.catalogue) {
      this._byKey.set(record.key, record);
    }
    this.stationGroup = new PopulatorGroup(this, "station group");
  }

  // ----- draws -----

  /** The draw tag the script's own `Math.random()` currently carries. */
  private currentTag(): PopulationDrawTag {
    return this._tagStack[this._tagStack.length - 1] ?? "body";
  }

  private take(tag: PopulationDrawTag): number {
    const u = this._source();
    this.drawLog.push({ tag, u });
    return u;
  }

  /** `Math.random` of the vm: u / 2^32 in [0, 1). */
  public readonly scriptRandom = (): number =>
    this.take(this.currentTag()) / TWO_32;

  public engineUint(tag: PopulationDrawTag): number {
    return this.take(tag);
  }

  public engineFloat(tag: PopulationDrawTag): number {
    return this.take(tag) / TWO_32;
  }

  public wrapHelper(tag: PopulationDrawTag, helper: unknown): unknown {
    if (typeof helper !== "function") {
      throw new Error("wrapHelper: the script helper is missing");
    }
    const original = helper as (...args: unknown[]) => unknown;
    const stack = this._tagStack;
    return function wrapped(this: unknown, ...args: unknown[]): unknown {
      stack.push(tag);
      try {
        return Reflect.apply(original, this, args);
      } finally {
        stack.pop();
      }
    };
  }

  // ----- the world -----

  public allInfos(): PopulatorSystemInfo[] {
    return this._infos;
  }

  public infoOf(id: number): PopulatorSystemInfo {
    const info = this._infos[id];
    if (info === undefined) {
      throw new Error(`System.infoForSystem: no system ${String(id)}`);
    }
    return info;
  }

  public hyperspaceMotor(key: string): boolean {
    return this.options.shipFacts.get(key)?.hyperspaceMotor ?? true;
  }

  public proxyShip(ship: PopulatorShip): PopulatorShip {
    const proxy = new Proxy(ship, {
      get: (object, key): unknown => {
        if (
          typeof key === "string" &&
          !(key in object) &&
          !OBJECT_PROTOCOL.has(key)
        ) {
          bump(this.missing, `ship.${key}`);
        }
        const value = Reflect.get(object, key, object) as unknown;
        return typeof value === "function"
          ? (value as (...args: unknown[]) => unknown).bind(object)
          : value;
      },
      set: (object, key, value: unknown): boolean => {
        if (typeof key === "string" && !(key in object)) {
          bump(this.missing, `ship.${key} (write)`);
        }
        return Reflect.set(object, key, value, object);
      },
    });
    this._shipsByProxy.set(proxy, ship);
    return proxy;
  }

  public proxyGroup(group: PopulatorGroup): PopulatorGroup {
    const proxy = new Proxy(group, {
      get: (object, key): unknown => {
        if (
          typeof key === "string" &&
          !(key in object) &&
          !OBJECT_PROTOCOL.has(key)
        ) {
          bump(this.missing, `group.${key}`);
        }
        const value = Reflect.get(object, key, object) as unknown;
        return typeof value === "function"
          ? (value as (...args: unknown[]) => unknown).bind(object)
          : value;
      },
      set: (object, key, value: unknown): boolean => {
        if (typeof key === "string" && !(key in object)) {
          bump(this.missing, `group.${key} (write)`);
        }
        return Reflect.set(object, key, value, object);
      },
    });
    this._groupsByProxy.set(proxy, group);
    return proxy;
  }

  public shipOf(value: unknown): PopulatorShip | null {
    return isRecord(value) ? (this._shipsByProxy.get(value) ?? null) : null;
  }

  public groupOf(value: unknown): PopulatorGroup | null {
    return isRecord(value) ? (this._groupsByProxy.get(value) ?? null) : null;
  }

  // ----- ships -----

  /** Role tokens of a record: `name` (weight 1) or `name(p)`. */
  private weightOf(record: PopulatorCatalogueRecord, role: string): number {
    for (const token of record.roles) {
      const open = token.indexOf("(");
      const name = open < 0 ? token : token.slice(0, open);
      if (name !== role) {
        continue;
      }
      if (open < 0) {
        return 1;
      }
      const close = token.indexOf(")", open);
      const weight = Number(
        close < 0 ? token.slice(open + 1) : token.slice(open + 1, close),
      );
      return Number.isFinite(weight) && weight > 0 ? weight : 0;
    }
    return -1;
  }

  /** `Ship.keysForRole`: every record carrying the role token. */
  public keysForRole(role: string): string[] {
    return this.options.catalogue
      .filter((record) => this.weightOf(record, role) >= 0)
      .map((record) => record.key);
  }

  /**
   * The weighted record pick of `OOProbabilitySet` (`OOProbabilitySet.m:
   * 449-575`): a one-record set returns it with no draw; otherwise one draw
   * scales the float32 cumulative weights and a binary search finds the
   * leftmost record whose cumulative weight reaches the target.
   */
  private pickRecord(role: string): PopulatorCatalogueRecord | null {
    const candidates: { record: PopulatorCatalogueRecord; weight: number }[] =
      [];
    for (const record of this.options.catalogue) {
      const weight = this.weightOf(record, role);
      if (weight > 0) {
        candidates.push({ record, weight: Math.fround(weight) });
      }
    }
    const first = candidates[0];
    if (first === undefined) {
      return null;
    }
    if (candidates.length === 1) {
      return first.record;
    }
    const cumulative: number[] = [];
    let total = 0;
    for (const candidate of candidates) {
      total = Math.fround(total + candidate.weight);
      cumulative.push(total);
    }
    const draw = Math.fround(this.engineFloat("pick"));
    const target = Math.fround(draw * total);
    let low = 0;
    let high = candidates.length - 1;
    let index = 0;
    let weight = 0;
    while (low < high) {
      index = Math.floor((low + high) / 2);
      weight = cumulative[index] ?? 0;
      if (weight > target) {
        if (index === 0) {
          break;
        }
        high = index - 1;
      } else if (weight < target) {
        low = index + 1;
      } else {
        break;
      }
    }
    if (weight > target) {
      while (index > 0 && (cumulative[index - 1] ?? 0) >= target) {
        index -= 1;
      }
    } else {
      while (
        index < candidates.length - 1 &&
        (cumulative[index] ?? 0) < target
      ) {
        index += 1;
      }
    }
    return candidates[index]?.record ?? null;
  }

  /** `newShipWithRole:` plus the set-up draws of `setUpShipFromDictionary`. */
  private createShip(role: string): PopulatorShip | null {
    const record = this.pickRecord(role);
    if (record === null) {
      return null;
    }
    const fact = this.options.shipFacts.get(record.key);
    if (fact === undefined) {
      throw new Error(`no ship facts for catalogue record ${record.key}`);
    }
    if (fact.cargoCarried !== null) {
      throw new Error(
        `record ${record.key} carries cargo_carried: the stub does not model it`,
      );
    }
    if (record.escorts > 0 && record.escortRoles === null) {
      throw new Error(
        `record ${record.key} has plain escorts: the stub does not model them`,
      );
    }
    this._used.add(record.key);
    const ship = new PopulatorShip(
      this,
      this._ships.length,
      record,
      role,
      fact,
    );
    this._ships.push(ship);
    // `has_fuel_injection` is a fuzzy boolean: one draw, `randf() < p`.
    ship._injector = this.engineFloat("injector") < record.hasFuelInjection;
    // Accuracy (`ShipEntity.m:658-676`): authored, else `randf() * 10 - 5`,
    // positive for police and military pilots.
    if (fact.accuracy === null) {
      let accuracy = Math.fround(this.engineFloat("accuracy") * 10 - 5);
      if (
        accuracy < 0 &&
        (record.scanClass === "CLASS_POLICE" ||
          record.scanClass === "CLASS_MILITARY")
      ) {
        accuracy = -accuracy;
      }
      ship._accuracy = clampAccuracy(accuracy, record.scanClass);
    }
    if (record.autoAi > 0) {
      if (role === "pirate") {
        // `[ship setBounty:20 + randf() * 50]`, overwritten by the builder.
        ship._bounty = Math.floor(20 + this.engineFloat("bounty") * 50);
      } else if (role === "trader") {
        ship._bounty = 0;
      }
    }
    return ship;
  }

  /** `Universe addShipAt:withRole:` (`Universe.m:2608-2692`) without placement. */
  private addShipAt(role: string): PopulatorShip | null {
    const ship = this.createShip(role);
    if (ship === null) {
      return null;
    }
    if (role === "trader") {
      if (this.engineFloat("cargo") > 0.5) {
        ship._setCargoFlag(
          this.engineFloat("cargo") < 0.66 ? "plentiful" : "scarce",
        );
      }
      if (ship._pendingEscorts > 0) {
        const government = this.government();
        if (this.engineUint("escort") % 7 < government) {
          const nx =
            ship._pendingEscorts - 2 * (1 + (this.engineUint("escort") & 3));
          // `setPendingEscortCount:` clamps to the maximum (`ShipEntity.m:6061-6064`).
          ship._pendingEscorts = Math.min(
            nx > 0 ? nx : 0,
            ship._maxEscortCount,
          );
        }
      }
    }
    // `wasAddedToUniverse`: a ship that pops into existence with pending
    // escorts sets them up (`ShipEntity.m:1371-1379`).
    if (ship._pendingEscorts !== 0) {
      this.setUpMixedEscorts(ship);
    }
    ship._pendingEscorts = 0;
    return ship;
  }

  private government(): number {
    return this.infoOf(this.systemId).government;
  }

  /** `setUpMixedEscorts` (`ShipEntity.m:1625-1683`). */
  private setUpMixedEscorts(mother: PopulatorShip): void {
    const roles = mother._record.escortRoles;
    if (roles === null) {
      return;
    }
    const group = mother._escortGroupObject();
    if (mother._group === null) {
      mother._setGroup(group);
    }
    group._setLeader(mother);
    const government = this.government();
    let current = group._members.length - 1;
    for (const definition of roles) {
      if (current >= MAX_ESCORTS) {
        break;
      }
      const min = definition.min;
      const max = definition.max;
      let desired = max;
      if (min < desired) {
        for (let i = min; i < max; i += 1) {
          if (this.engineUint("escort") % 11 < government + 2) {
            desired -= 1;
          }
        }
      }
      for (let i = 0; i < desired; i += 1) {
        if (current >= MAX_ESCORTS) {
          break;
        }
        if (definition.role !== "") {
          const escort = this.createShip(definition.role);
          if (escort === null) {
            break;
          }
          this.setUpOneEscort(mother, escort, group, current);
        }
        current += 1;
      }
    }
  }

  /** `setUpOneEscort` (`ShipEntity.m:1686-1763`). */
  private setUpOneEscort(
    mother: PopulatorShip,
    escort: PopulatorShip,
    group: PopulatorGroup,
    slot: number,
  ): void {
    // Position spread: three `randf()` draws (not compared).
    this.engineFloat("scatter");
    this.engineFloat("scatter");
    this.engineFloat("scatter");
    escort._primaryRole = "escort";
    escort._setGroup(group);
    escort._owner = mother;
    escort._slot = slot;
    if (mother._bounty !== 0) {
      // `1 | (ranrot_rand() & 15)`, then `markAsOffender`: `bounty |= extra`.
      const extra = 1 | (this.engineUint("escort") & 15);
      escort._bounty |= extra;
    } else {
      escort._bounty = 0;
    }
  }

  /** `system.addShips` / `system.addGroup`. */
  public addShips(
    asGroup: boolean,
    role: unknown,
    count: unknown,
    _position: unknown,
    spread: unknown,
  ): unknown {
    const fn = asGroup ? "addGroup" : "addShips";
    const roleName = typeof role === "string" ? role : "";
    const num = toInt32(count);
    if (roleName === "" || num < 1 || num > 64) {
      throw new Error(
        `System.${fn}: bad arguments (${String(role)}, ${String(count)})`,
      );
    }
    const created: PopulatorShip[] = [];
    const group = asGroup
      ? new PopulatorGroup(this, `${roleName} group`)
      : null;
    for (let i = 0; i < num; i += 1) {
      const ship = this.addShipAt(roleName);
      if (ship !== null) {
        if (group !== null) {
          ship._setGroup(group);
        }
        created.push(ship);
      }
    }
    this._calls.push({
      fn,
      role: roleName,
      count: num,
      spread: typeof spread === "number" ? spread : SCANNER_RANGE,
      ships: created.map((ship) => ship._index),
    });
    if (created.length === 0) {
      return null;
    }
    if (asGroup) {
      return created[0]?._group?._proxy ?? null;
    }
    return created.map((ship) => ship._proxy);
  }

  public countShipsWithPrimaryRole(role: unknown): number {
    return this._ships.filter((ship) => ship._primaryRole === role).length;
  }

  // ----- registration -----

  public setPopulator(name: unknown, definition: unknown): void {
    if (typeof name !== "string" || !isRecord(definition)) {
      throw new Error("System.setPopulator: bad arguments");
    }
    const priority = definition.priority;
    const location = definition.location;
    const groupCount = definition.groupCount;
    if (typeof priority !== "number" || typeof location !== "string") {
      throw new Error(
        `setPopulator(${name}): priority and location are required`,
      );
    }
    if (typeof definition.callback !== "function") {
      throw new Error(`setPopulator(${name}): the callback is missing`);
    }
    if (groupCount !== undefined && typeof groupCount !== "number") {
      throw new Error(`setPopulator(${name}): groupCount is not a number`);
    }
    this.registered.push({
      ordinal: this.registered.length,
      name,
      priority,
      location,
      groupCount: groupCount ?? null,
      window: this.drawLog.slice(this._windowStart),
      definition,
    });
    this._windowStart = this.drawLog.length;
  }

  // ----- group capture -----

  public beginGroup(): void {
    this._groupStart = this.drawLog.length;
    this._ships = [];
    this._calls = [];
  }

  public endGroup(): GroupCapture {
    const draws: Partial<Record<PopulationDrawTag, number[]>> = {};
    for (const logged of this.drawLog.slice(this._groupStart)) {
      const list = draws[logged.tag] ?? [];
      list.push(logged.u);
      draws[logged.tag] = list;
    }
    const ordered: PopulationDraws = {};
    for (const tag of POPULATION_DRAW_TAGS) {
      const list = draws[tag];
      if (list !== undefined) {
        ordered[tag] = list;
      }
    }

    // Distinct ship groups, in order of first appearance by ship index.
    const groups: PopulatorGroup[] = [];
    for (const ship of this._ships) {
      const group = ship._group;
      if (group !== null && group !== this.stationGroup) {
        if (!groups.includes(group)) {
          groups.push(group);
        }
      }
    }
    const indexOfShip = (ship: PopulatorShip | null): number | null =>
      ship === null ? null : this._ships.indexOf(ship);
    const shipGroups: PopulationShipGroup[] = groups.map((group) => ({
      name: group._name,
      leader: indexOfShip(group._leader),
      members: group._members
        .map((member) => this._ships.indexOf(member))
        .filter((at) => at >= 0),
    }));

    const ships: PopulationShip[] = this._ships.map((ship) => {
      const group = ship._group;
      let groupRef: number | "station" | null = null;
      let leader: number | null = null;
      if (group === this.stationGroup) {
        groupRef = "station";
      } else if (group !== null) {
        groupRef = groups.indexOf(group);
        leader = indexOfShip(group._leader);
      }
      return {
        index: ship._index,
        key: ship._record.key,
        role: ship._role,
        primaryRole: ship._primaryRole,
        bounty: ship._bounty,
        cargoKind: ship._cargoFlag,
        cargoCount: ship._cargoCount,
        forwardWeapon: ship._forward,
        aftWeapon: ship._aft,
        accuracy: ship._accuracy,
        fuel: ship._fuel,
        homeSystem: ship._home,
        destinationSystem: ship._destination,
        injector: ship._injector,
        group: groupRef,
        leader,
        owner: indexOfShip(ship._owner),
        escortSlot: ship._slot,
        equipment: [...ship._awarded].sort(),
        writes: ship._writes,
      };
    });
    return { draws: ordered, calls: this._calls, ships, shipGroups };
  }

  public neighbourhood(): ReturnType<PopulatorHost["neighbourhood"]> {
    const here = this.infoOf(this.systemId);
    const describe = (
      info: PopulatorSystemInfo,
      range: number,
    ): PopulationNeighbour => ({
      id: info.systemID,
      government: info.government,
      economy: info.economy,
      techLevel: info.techlevel,
      seconds: info.systemsInRange(range).map((other) => other.systemID),
    });
    return {
      locals: here.systemsInRange(7).map((info) => describe(info, 7)),
      verylocals: here.systemsInRange(3.5).map((info) => describe(info, 3.5)),
      within25: here.systemsInRange(25).map((info) => info.systemID),
    };
  }

  public usedKeys(): ReadonlySet<string> {
    return this._used;
  }

  public trailingDraws(): number {
    return this.drawLog.length - this._windowStart;
  }
}

/** Build the host: the globals, the registration log and the group capture. */
export function createPopulatorHost(
  options: PopulatorHostOptions,
): PopulatorHost {
  const world = new PopulatorWorld(options);
  const missing = world.missing;
  const here = world.infoOf(options.systemId);

  const sun = tracked(
    "system.sun",
    {
      position: new PopulatorVec3(options.sun.x, options.sun.y, options.sun.z),
      radius: options.sunRadius,
      isGoingNova: false,
    },
    missing,
  );
  const mainPlanet = tracked(
    "system.mainPlanet",
    {
      position: new PopulatorVec3(
        options.planet.x,
        options.planet.y,
        options.planet.z,
      ),
      radius: options.planetRadius,
    },
    missing,
  );
  const mainStation = tracked(
    "system.mainStation",
    {
      position: new PopulatorVec3(
        options.station.x,
        options.station.y,
        options.station.z,
      ),
      vectorForward: new PopulatorVec3(
        options.stationForward.x,
        options.stationForward.y,
        options.stationForward.z,
      ),
      group: world.stationGroup._proxy,
    },
    missing,
  );

  const populatorSettings: Record<string, unknown> = {};
  const system = tracked(
    "system",
    {
      ID: options.systemId,
      government: here.government,
      economy: here.economy,
      techLevel: here.techlevel,
      name: here.name,
      isInterstellarSpace: false,
      info: tracked("system.info", here, missing),
      sun,
      mainPlanet,
      mainStation,
      // Only the cut asteroid and hermit registration reads the pseudo-random
      // number; the stub answers 0 (listed under `cutReads`).
      pseudoRandomNumber: 0,
      populatorSettings,
      setPopulator: (name: unknown, definition: unknown): void => {
        world.setPopulator(name, definition);
        if (typeof name === "string") {
          populatorSettings[name] = definition;
        }
      },
      addShips: (...args: unknown[]): unknown =>
        world.addShips(false, args[0], args[1], args[2], args[3]),
      addGroup: (...args: unknown[]): unknown =>
        world.addShips(true, args[0], args[1], args[2], args[3]),
      countShipsWithPrimaryRole: (role: unknown): number =>
        world.countShipsWithPrimaryRole(role),
      /**
       * `oolite-global-prefix.js:118-133`: scramble `pseudoRandomNumber` with
       * a salt through three LCG steps.
       */
      scrambledPseudoRandomNumber: (salt: unknown): number => {
        let n = Math.floor(0 * 16777216.0);
        n += Number(salt);
        n = (214013 * n + 2531011) & 0xffffffff;
        n = (214013 * n + 2531011) & 0xffffffff;
        n = (214013 * n + 2531011) & 0xffffffff;
        return n / 4294967296.0 + 0.5;
      },
    },
    missing,
  );

  const parcels: unknown[] = [];
  const passengers: unknown[] = [];
  const player = tracked(
    "player",
    { ship: tracked("player.ship", { parcels, passengers }, missing) },
    missing,
  );

  // `new ShipGroup(name, leader)`: a plain function, so `new` yields the
  // group object the function returns.
  const shipGroupConstructor = function (
    name?: unknown,
    leader?: unknown,
  ): unknown {
    const group = new PopulatorGroup(
      world,
      typeof name === "string" ? name : "",
    );
    group._setLeader(world.shipOf(leader));
    return group._proxy;
  };

  const globals: Record<string, unknown> = {
    system,
    player,
    galaxyNumber: options.galaxy,
    worldScripts: {},
    log: (...args: unknown[]): void => {
      world.logs.push(args.map(String).join(" "));
    },
    Vector3D: PopulatorVec3,
    ShipGroup: shipGroupConstructor,
    Ship: {
      keysForRole: (role: unknown): string[] =>
        typeof role === "string" ? world.keysForRole(role) : [],
    },
    System: {
      infoForSystem: (galaxy: unknown, id: unknown): PopulatorSystemInfo => {
        if (galaxy !== options.galaxy) {
          throw new Error(
            "System.infoForSystem: only the current galaxy is modelled",
          );
        }
        return world.infoOf(toInt32(id));
      },
    },
    expandDescription: (text: unknown): string => {
      if (text === "[medical-word]") {
        return options.medicalWord;
      }
      throw new Error(`expandDescription: unmodelled key ${String(text)}`);
    },
    __harnessDraw: world.scriptRandom,
    __aiHarnessSentinel: AI_HARNESS_SENTINEL,
  };

  const globalReads = new Map<string, number>();

  return {
    globals,
    registered: world.registered,
    missing,
    globalReads,
    logs: world.logs,
    wrapHelper: (tag, helper) => world.wrapHelper(tag, helper),
    retag(window, from, to, tag): void {
      for (let i = from; i < to; i += 1) {
        const entry = window[i];
        if (entry !== undefined) {
          entry.tag = tag;
        }
      }
    },
    makePosition: (location) => positionFor(world, location),
    beginGroup: () => {
      world.beginGroup();
    },
    endGroup: () => world.endGroup(),
    neighbourhood: () => world.neighbourhood(),
    usedKeys: () => world.usedKeys(),
    trailingDraws: () => world.trailingDraws(),
  };
}

/**
 * A callback position for a location code: a point on the lane or around the
 * station, in Oolite's frame, from `scatter` draws (`Universe.m:1783-1815`).
 * Placement is not stream-compared; the script reads only `pos.z` (the remote
 * pack tweak `pos.z % 100000`, which keeps the dividend's sign).
 */
function positionFor(world: PopulatorWorld, location: string): PopulatorVec3 {
  const o = world.options;
  const lane = (
    from: PopulatorVec,
    to: PopulatorVec,
    toRadius: number,
  ): PopulatorVec3 => {
    const length = Math.sqrt(
      (to.x - from.x) ** 2 + (to.y - from.y) ** 2 + (to.z - from.z) ** 2,
    );
    const lo = Math.min(0.45, SCANNER_RANGE / length);
    const hi = Math.max(lo, 1 - (toRadius * 3) / length);
    const t = lo + world.engineFloat("scatter") * (hi - lo);
    return new PopulatorVec3(
      from.x + (to.x - from.x) * t,
      from.y + (to.y - from.y) * t,
      from.z + (to.z - from.z) * t,
    );
  };
  const origin: PopulatorVec = { x: 0, y: 0, z: 0 };
  switch (location) {
    case "LANE_WP":
      return lane(origin, o.planet, o.planetRadius);
    case "LANE_WS":
      return lane(origin, o.sun, o.sunRadius);
    case "LANE_PS":
      return lane(o.planet, o.sun, o.sunRadius);
    case "LANE_WPS": {
      const l1 = Math.sqrt(o.planet.x ** 2 + o.planet.y ** 2 + o.planet.z ** 2);
      const l2 = Math.sqrt(
        (o.sun.x - o.planet.x) ** 2 +
          (o.sun.y - o.planet.y) ** 2 +
          (o.sun.z - o.planet.z) ** 2,
      );
      const l3 = Math.sqrt(o.sun.x ** 2 + o.sun.y ** 2 + o.sun.z ** 2);
      const total = l1 + l2 + l3;
      const choice = world.engineFloat("scatter");
      if (choice < l1 / total) {
        return positionFor(world, "LANE_WP");
      }
      if (choice < (l1 + l2) / total) {
        return positionFor(world, "LANE_PS");
      }
      return positionFor(world, "LANE_WS");
    }
    case "STATION_AEGIS":
    case "WITCHPOINT": {
      const centre = location === "WITCHPOINT" ? origin : o.station;
      const range =
        location === "WITCHPOINT" ? SCANNER_RANGE : 2 * SCANNER_RANGE;
      const spread = (): number =>
        (world.engineFloat("scatter") * 2 - 1) * range;
      return new PopulatorVec3(
        centre.x + spread(),
        centre.y + spread(),
        centre.z + spread(),
      );
    }
    default:
      throw new Error(`unmodelled location code ${location}`);
  }
}
