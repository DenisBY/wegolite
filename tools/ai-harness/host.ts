// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The stub host of the AI-11 spike: everything the original Oolite priority AI
 * reads from the engine, answered from a scripted world and recorded.
 *
 * Dev-only. Nothing under `src/` or `public/` may import this module, and the
 * sentinel below must never appear in a shipped file (guarded by
 * `tests/guards/harness-isolation.test.ts`, checked in the built bundle by a
 * later plan).
 *
 * What the host models:
 * - A recording `ship` (the shuttle). Every method call and every property
 *   write lands in `trace` in order; every read it cannot answer lands in
 *   `inventory.missing`.
 * - The reconsider wake the way Oolite's engine does it. The priority AI never
 *   uses `Timer` to reconsider: `_resetReconsideration` writes
 *   `ship.AIScriptWakeTime` (`oolite-priorityai.js:230-239`) and the engine's
 *   `ShipEntity.update` clears it and fires `aiAwoken` once the adjusted clock
 *   is strictly past it (`ShipEntity.m:2480-2483`). `advanceClock` does the
 *   same on a fixed frame.
 * - One counted, scripted replacement for `Math.random`.
 */

import type { AiContext } from "./load.js";
import { callInContext } from "./load.js";

/** Distinctive string a shipped bundle would contain if the harness leaked. */
export const AI_HARNESS_SENTINEL = "wegolite-ai-harness-sentinel-3d8f61a2";

/** One engine frame in seconds (a power of two, so clock sums stay exact). */
export const FRAME_SECONDS = 0.0625;

export type FixtureName = "calm" | "hostile" | "reconsider";

export interface HarnessFixture {
  readonly name: FixtureName;
  /** Adjusted clock at the start of the run, in seconds. */
  readonly startSeconds: number;
  /** A hostile ship inside scanner range, with the shuttle on red alert. */
  readonly hostileInRange: boolean;
}

export type TraceEntry =
  | {
      readonly kind: "call";
      readonly target: string;
      readonly member: string;
      readonly args: readonly unknown[];
    }
  | {
      readonly kind: "set";
      readonly target: string;
      readonly member: string;
      readonly value: unknown;
    }
  | { readonly kind: "draw"; readonly index: number; readonly value: number }
  | {
      readonly kind: "timer";
      readonly delay: number;
      readonly interval: number | null;
    }
  | { readonly kind: "wake"; readonly at: number; readonly wakeTime: number };

export interface HostInventory {
  /** Property reads answered, per `target.member`. */
  readonly reads: Map<string, number>;
  /** Method calls answered, per `target.member`. */
  readonly calls: Map<string, number>;
  /** Property writes, per `target.member`. */
  readonly sets: Map<string, number>;
  /** Reads the stub could not answer (returned undefined), per `target.member`. */
  readonly missing: Map<string, number>;
  /** Reads of each global the host injected into a context. */
  readonly globals: Map<string, number>;
}

/** A minimal stand-in for Oolite's `Vector3D`; only what the shuttle AI touched. */
export class StubVector3D {
  public x: number;
  public y: number;
  public z: number;

  public constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  public add(other: StubVector3D): StubVector3D {
    return new StubVector3D(
      this.x + other.x,
      this.y + other.y,
      this.z + other.z,
    );
  }

  public subtract(other: StubVector3D): StubVector3D {
    return new StubVector3D(
      this.x - other.x,
      this.y - other.y,
      this.z - other.z,
    );
  }

  public multiply(k: number): StubVector3D {
    return new StubVector3D(this.x * k, this.y * k, this.z * k);
  }

  public magnitude(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  public direction(): StubVector3D {
    const m = this.magnitude();
    return m === 0 ? new StubVector3D() : this.multiply(1 / m);
  }

  /** Oolite accepts a vector or an entity (anything with a position). */
  public distanceTo(other: unknown): number {
    const target = positionOf(other);
    return this.subtract(target).magnitude();
  }
}

function positionOf(value: unknown): StubVector3D {
  if (value instanceof StubVector3D) {
    return value;
  }
  if (typeof value === "object" && value !== null) {
    const position = (value as { position?: unknown }).position;
    if (position instanceof StubVector3D) {
      return position;
    }
  }
  throw new Error("StubVector3D.distanceTo: argument has no position");
}

/** Recording stand-in for Oolite's `Timer`: schedules are noted, never run. */
type TimerConstructor = new (
  owner: unknown,
  callback: unknown,
  delay: number,
  interval?: number,
) => { isRunning: boolean; start(): void; stop(): void };

export interface StubHost {
  readonly fixture: HarnessFixture;
  readonly trace: TraceEntry[];
  readonly inventory: HostInventory;
  readonly logs: string[];
  /** Every name injected as a global into a context, with its value. */
  readonly globals: Readonly<Record<string, unknown>>;
  readonly worldScripts: Record<string, unknown>;
  readonly clock: { adjustedSeconds: number; seconds: number };
  /** The recording shuttle; `ship.AIScript` is the role context's global. */
  readonly ship: Record<string, unknown>;
  /** The `Math.random` replacement every context gets. */
  readonly draw: () => number;
  drawCount(): number;
  /** Hand the host the role context so wakes can run through `callInContext`. */
  attach(role: AiContext): void;
  /** Advance the clock frame by frame, waking the AI as the engine would. */
  advanceClock(seconds: number): void;
  /** Wake times written so far, in order (the `AIScriptWakeTime` writes). */
  wakeTimesWritten(): number[];
  /** Make the nearest station shoot at the shuttle (or stop doing so). */
  setStationHostile(hostile: boolean): void;
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/** JSON-friendly form of a value crossing the host boundary, for the trace. */
export function describe(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value ?? null;
  }
  if (
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "function") {
    return "<function>";
  }
  if (value instanceof StubVector3D) {
    return { v: [value.x, value.y, value.z] };
  }
  if (Array.isArray(value)) {
    return (value as unknown[]).map(describe);
  }
  if (typeof value === "object") {
    const label = (value as { __label?: unknown }).__label;
    if (typeof label === "string") {
      return `@${label}`;
    }
  }
  return "<object>";
}

const OBJECT_MEMBERS = new Set([
  "toString",
  "valueOf",
  "constructor",
  "hasOwnProperty",
  "toJSON",
  "then",
  "__label",
]);

/**
 * Wrap a plain object so reads, calls and writes are inventoried. Members
 * named in `recordedMethods` (and every `perform*` on the ship) become
 * recording functions; members that exist return their value; anything else
 * is a missing read and returns `undefined`.
 */
function track(
  label: string,
  base: Record<string, unknown>,
  inventory: HostInventory,
  trace: TraceEntry[] | null,
  options: {
    readonly methods?: Readonly<
      Record<string, (...args: unknown[]) => unknown>
    >;
    readonly performPrefix?: boolean;
  },
): Record<string, unknown> {
  const methods = options.methods ?? {};
  return new Proxy(base, {
    get(target, key): unknown {
      if (typeof key === "symbol") {
        return Reflect.get(target, key) as unknown;
      }
      if (key === "__label") {
        return label;
      }
      const name = `${label}.${key}`;
      const method = Object.hasOwn(methods, key) ? methods[key] : undefined;
      if (
        method !== undefined ||
        (options.performPrefix === true && key.startsWith("perform"))
      ) {
        return (...args: unknown[]): unknown => {
          bump(inventory.calls, name);
          trace?.push({
            kind: "call",
            target: label,
            member: key,
            args: args.map(describe),
          });
          return method === undefined ? undefined : method(...args);
        };
      }
      if (key in target) {
        if (!OBJECT_MEMBERS.has(key)) {
          bump(inventory.reads, name);
        }
        return target[key];
      }
      if (!OBJECT_MEMBERS.has(key)) {
        bump(inventory.missing, name);
      }
      return undefined;
    },
    set(target, key, value: unknown): boolean {
      if (typeof key === "symbol") {
        return Reflect.set(target, key, value);
      }
      bump(inventory.sets, `${label}.${key}`);
      trace?.push({
        kind: "set",
        target: label,
        member: key,
        value: describe(value),
      });
      target[key] = value;
      return true;
    },
  });
}

function stationBase(position: StubVector3D): Record<string, unknown> {
  return {
    isShip: true,
    isStation: true,
    isMainStation: true,
    isPlanet: false,
    isValid: true,
    isInSpace: true,
    position,
    radius: 9000,
    collisionRadius: 9000,
    maxSpeed: 0,
    target: null,
    hasHostileTarget: false,
    allegiance: "galcop",
    scanClass: "CLASS_STATION",
    status: "STATUS_IN_FLIGHT",
  };
}

export function createStubHost(
  fixture: HarnessFixture,
  draws: readonly number[],
): StubHost {
  const trace: TraceEntry[] = [];
  const logs: string[] = [];
  const inventory: HostInventory = {
    reads: new Map(),
    calls: new Map(),
    sets: new Map(),
    missing: new Map(),
    globals: new Map(),
  };
  const clock = {
    adjustedSeconds: fixture.startSeconds,
    seconds: fixture.startSeconds,
  };
  const worldScripts: Record<string, unknown> = {};

  let drawn = 0;
  const draw = (): number => {
    const value = draws[drawn];
    if (value === undefined) {
      throw new Error(`scripted draws exhausted after ${String(drawn)} draws`);
    }
    trace.push({ kind: "draw", index: drawn, value });
    drawn += 1;
    return value;
  };

  // The world. Distances are in metres; the shuttle sits at the origin.
  const planetBase: Record<string, unknown> = {
    isShip: false,
    isStation: false,
    isPlanet: true,
    isSun: false,
    isValid: true,
    isInSpace: true,
    position: new StubVector3D(0, 0, 60000),
    radius: 6000,
    collisionRadius: 6000,
  };
  const planet = track("planet", planetBase, inventory, null, {});
  const stationState = stationBase(new StubVector3D(15000, 0, 45000));
  const station = track("station", stationState, inventory, null, {});
  const hostile = track(
    "hostile",
    {
      isShip: true,
      isStation: false,
      isPlanet: false,
      isPlayer: false,
      isValid: true,
      isInSpace: true,
      position: new StubVector3D(4000, 0, 0),
      scanClass: "CLASS_NEUTRAL",
      status: "STATUS_IN_FLIGHT",
      hasHostileTarget: true,
      isFleeing: false,
      isDerelict: false,
      isWormhole: false,
      target: null,
      group: null,
      speed: 350,
      maxSpeed: 350,
    },
    inventory,
    null,
    {},
  );

  const system: Record<string, unknown> = track(
    "system",
    {
      ID: 0,
      isInterstellarSpace: false,
      sun: null,
      mainPlanet: planet,
      mainStation: station,
      planets: [planet],
      stations: [station],
      info: { systemsInRange: (): unknown[] => [] },
    },
    inventory,
    null,
    {},
  );

  const player = track(
    "player",
    {
      roleWeights: ["trader", "trader-smuggler", "hunter", "pirate"],
      ship: null,
    },
    inventory,
    null,
    {},
  );

  const oolite = track("oolite", { version: "1.91" }, inventory, null, {});

  const shipBase: Record<string, unknown> = {
    isShip: true,
    isStation: false,
    isPlanet: false,
    isPlayer: false,
    isValid: true,
    isInSpace: true,
    position: new StubVector3D(0, 0, 0),
    scannerRange: 25600,
    maxSpeed: 300,
    speed: 0,
    maxEnergy: 100,
    energy: 100,
    accuracy: 5,
    alertCondition: fixture.hostileInRange ? 3 : 1,
    target: fixture.hostileInRange ? hostile : null,
    defenseTargets: fixture.hostileInRange ? [hostile] : [],
    AIPrimaryAggressor: fixture.hostileInRange ? hostile : null,
    primaryRole: "shuttle",
    scanClass: "CLASS_NEUTRAL",
    bounty: 0,
    isPirate: false,
    hasHyperspaceMotor: false,
    fuel: 0,
    homeSystem: 0,
    group: null,
    escortGroup: null,
    destination: new StubVector3D(0, 0, 0),
    desiredRange: 0,
    desiredSpeed: 0,
    AIScript: null,
    AIScriptWakeTime: 0,
    name: "shuttle",
  };
  const ship = track("ship", shipBase, inventory, trace, {
    performPrefix: true,
    methods: {
      findNearestStation: () => station,
      checkCourseToDestination: () => null,
    },
  });

  const timers: TimerConstructor = class StubTimer {
    public isRunning = true;

    public constructor(
      _owner: unknown,
      _callback: unknown,
      delay: number,
      interval?: number,
    ) {
      trace.push({ kind: "timer", delay, interval: interval ?? null });
    }

    public start(): void {
      this.isRunning = true;
    }

    public stop(): void {
      this.isRunning = false;
    }
  };

  const globals: Record<string, unknown> = {
    worldScripts,
    clock,
    system,
    player,
    oolite,
    Timer: timers,
    Vector3D: StubVector3D,
    log: (...args: unknown[]): void => {
      logs.push(args.map(String).join(" "));
    },
    __aiHarnessSentinel: AI_HARNESS_SENTINEL,
  };

  let role: AiContext | undefined;

  function wakeIfDue(): void {
    const wake = shipBase.AIScriptWakeTime;
    if (
      typeof wake !== "number" ||
      wake <= 0 ||
      clock.adjustedSeconds <= wake
    ) {
      return;
    }
    if (role === undefined) {
      throw new Error("advanceClock called before attach(role)");
    }
    // ShipEntity.update: clear first, then fire the event.
    shipBase.AIScriptWakeTime = 0;
    trace.push({ kind: "wake", at: clock.adjustedSeconds, wakeTime: wake });
    callInContext(role, "this.aiAwoken()");
  }

  return {
    fixture,
    trace,
    inventory,
    logs,
    globals,
    worldScripts,
    clock,
    ship,
    draw,
    drawCount: () => drawn,
    attach(attached: AiContext): void {
      role = attached;
      // Oolite attaches the AI script to its ship; written on the base so the
      // wiring is not a trace entry.
      shipBase.AIScript = attached.global;
    },
    advanceClock(seconds: number): void {
      const frames = Math.round(seconds / FRAME_SECONDS);
      for (let i = 0; i < frames; i += 1) {
        clock.adjustedSeconds += FRAME_SECONDS;
        clock.seconds = clock.adjustedSeconds;
        wakeIfDue();
      }
    },
    setStationHostile(hostileOn: boolean): void {
      stationState.target = hostileOn ? ship : null;
      stationState.hasHostileTarget = hostileOn;
    },
    wakeTimesWritten(): number[] {
      return trace.flatMap((entry) =>
        entry.kind === "set" &&
        entry.member === "AIScriptWakeTime" &&
        typeof entry.value === "number" &&
        entry.value > 0
          ? [entry.value]
          : [],
      );
    },
  };
}

/** One line per trace entry, for transcripts and equality checks. */
export function formatTrace(trace: readonly TraceEntry[]): string[] {
  return trace.map((entry) => JSON.stringify(entry));
}

export interface InventorySummary {
  readonly reads: readonly (readonly [string, number])[];
  readonly calls: readonly (readonly [string, number])[];
  readonly sets: readonly (readonly [string, number])[];
  readonly missing: readonly (readonly [string, number])[];
  readonly globals: readonly (readonly [string, number])[];
}

function sortedEntries(
  map: ReadonlyMap<string, number>,
): (readonly [string, number])[] {
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/** The host members a run touched, sorted so two runs compare equal. */
export function inventoryOf(host: StubHost): InventorySummary {
  return {
    reads: sortedEntries(host.inventory.reads),
    calls: sortedEntries(host.inventory.calls),
    sets: sortedEntries(host.inventory.sets),
    missing: sortedEntries(host.inventory.missing),
    globals: sortedEntries(host.inventory.globals),
  };
}
