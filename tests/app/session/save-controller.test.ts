// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The save controller against a fake session context (Phase 8, D-12 step 6,
 * G-8, T-08-14, T-08-15, T-08-42).
 *
 * Node only, no DOM: a real `SessionState`, a recording `SaveStore` double and
 * recording doubles for every collaborator `loadFromSave` calls. The expected
 * values are written from the fakes' own fields and from the pre-move
 * sequence of `loadFromSave`, never by running the code under test twice.
 */

import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { StationSpec, System } from "../../../src/content/types.js";
import { STATION_KINDS } from "../../../src/content/stations.js";
import { createSessionState } from "../../../src/app/session/context.js";
import type { SessionState } from "../../../src/app/session/context.js";
import { latchGameOver } from "../../../src/app/session/event-router.js";
import {
  canClear,
  canOverwrite,
  createSaveController,
  statusSkipReason,
} from "../../../src/app/session/save-controller.js";
import type { SaveController } from "../../../src/app/session/save-controller.js";
import { createWorldLifecycle } from "../../../src/app/session/world-lifecycle.js";
import { createHyperspaceController } from "../../../src/app/session/hyperspace-controller.js";
import type { HyperspaceControllerDeps } from "../../../src/app/session/hyperspace-controller.js";
import { deriveSystemLayout } from "../../../src/sim/world/layout.js";
import { snapshotForSave } from "../../../src/persistence/autosave.js";
import { encodeSave } from "../../../src/persistence/save.js";
import type { SaveInputs } from "../../../src/persistence/save.js";
import type {
  SaveReadResult,
  SaveStatus,
  SaveStore,
  WriteResult,
} from "../../../src/persistence/store.js";
import { killPlayer } from "../../../src/sim/combat/death.js";
import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import {
  createPlayerCombatState,
  isPristineCombat,
} from "../../../src/sim/combat/state.js";
import { generateMarket } from "../../../src/sim/economy/market.js";
import { setCargo } from "../../../src/sim/economy/cargo.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { newProfile } from "../../../src/sim/player/profile.js";
import type { KeyboardInputSource } from "../../../src/input/keyboard.js";
import type { InputContext } from "../../../src/input/actions.js";
import type { GameLoop } from "../../../src/app/game-loop.js";
import type { WegoliteProbe } from "../../../src/app/probe.js";
import type { SaveLoadScreen } from "../../../src/ui/save-load.js";
import {
  commoditiesFixture,
  commodityUnits,
} from "../../helpers/commodities.js";
import { laveFixture } from "../../helpers/lave.js";
import {
  clientCatalogue,
  dockGeometryOf,
  stationRecordsOf,
  stationSpecOf,
} from "../../helpers/stations.js";
import { saveAllowLists, saveInputs } from "../../helpers/save-builders.js";
import { hullTable } from "../../../src/app/session/traffic.js";
import { StaticHullArtifactSchema } from "../../../src/content/schemas/ship-static-hull.js";
import type { StaticHullArtifact } from "../../../src/content/schemas/ship-static-hull.js";
import type * as StaticHullsModule from "../../../src/content/ships-static-hulls.js";
import type { StationKind } from "../../../src/content/stations.js";
import type { ShipHullCatalogue } from "../../../src/content/types.js";

/**
 * A hand on the station hull loader the session uses. With no override set the
 * real loader runs (the Coriolis tests and every traffic-off test never ask
 * for it); a test sets `override` to hold a load open or to reject it.
 */
const hullLoader = vi.hoisted(() => ({
  override: undefined as
    ((kind: string) => Promise<StaticHullArtifact>) | undefined,
  calls: [] as string[],
}));

vi.mock(
  "../../../src/content/ships-static-hulls.js",
  async (importOriginal) => {
    const actual = await importOriginal<typeof StaticHullsModule>();
    return {
      ...actual,
      loadStationHulls: (kind: StationKind) => {
        hullLoader.calls.push(kind);
        return hullLoader.override === undefined
          ? actual.loadStationHulls(kind)
          : hullLoader.override(kind);
      },
    };
  },
);

afterEach(() => {
  hullLoader.override = undefined;
  hullLoader.calls.length = 0;
});

const lave = laveFixture();
const { system, layout, stationDef } = lave;
const catalogue = commoditiesFixture();
const MARKET_SEED = 0x12345678;
const market = generateMarket(system, catalogue, MARKET_SEED);

const ALLOW = saveAllowLists({
  equipment: new Set(["EQ_DOCK_COMP"]),
  systems: new Set([system.id]),
  stations: new Set(["coriolis-station"]),
  commodities: new Map(
    catalogue
      .filter((commodity) => commodity.tradeable)
      .map((commodity) => [commodity.key, commodity.unit]),
  ),
});

/**
 * The inputs the controller is expected to build, from the shared builder. The
 * controller supplies the market snapshot, never the seed-only encoding the
 * builder defaults to, so the seed is dropped from the expectation.
 */
function expectedInputs(overrides: Partial<SaveInputs>): SaveInputs {
  const { marketSeed: _seed, ...rest } = saveInputs(overrides);
  void _seed;
  return rest;
}

/** A promise the test resolves by hand, to hold an `await` open. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function flush(): Promise<void> {
  return new Promise((done) => setTimeout(done, 0));
}

/** The in-flight state the persistence layer saves: moved, turning, flying. */
function flyingState(): FlightState {
  const state = initFlightState(layout);
  state.mode = "inFlight";
  state.position = { x: 1200.5, y: -40.25, z: 8000.75 };
  state.speed = 123.5;
  state.pitchRate = 0.25;
  state.rollRate = -0.125;
  return state;
}

interface Harness {
  readonly ctx: SessionState;
  readonly controller: SaveController;
  /** One shared log of every collaborator call, in call order. */
  readonly log: string[];
  readonly writes: { json: string; revision: number }[];
  readonly bound: FlightState[];
  readonly probe: { restore?: unknown };
  readonly hud: { hidden: boolean };
  readonly contexts: InputContext[];
  readonly readResult: { current: Promise<SaveReadResult> };
  readonly writeResult: { current: Promise<WriteResult> };
  readonly clearResult: { current: Promise<WriteResult> };
}

interface HarnessOptions {
  readonly status?: SaveStatus;
  readonly docked?: boolean;
  readonly hook?: boolean;
}

/** Observe assignments to one field of a plain object, in order, in `log`. */
function observe(
  target: object,
  key: string,
  label: string,
  log: string[],
): void {
  let value = (target as Record<string, unknown>)[key];
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    get: () => value,
    set: (next: unknown) => {
      log.push(`install ${label}`);
      value = next;
    },
  });
}

function harness(options: HarnessOptions = {}): Harness {
  const status = options.status ?? "valid";
  const ctx = createSessionState({
    system,
    saveStatus: status,
    saveSkipReason: statusSkipReason(status),
  });
  const log: string[] = [];
  const writes: { json: string; revision: number }[] = [];
  const bound: FlightState[] = [];
  const probe: { restore?: unknown } = {};
  Object.defineProperty(probe, "restore", {
    configurable: true,
    enumerable: true,
    get: () => undefined,
    set: () => {
      log.push("probe.restore");
    },
  });
  const hud = { hidden: false };
  const contexts: InputContext[] = [];
  const readResult = {
    current: Promise.resolve<SaveReadResult>({ kind: "absent" }),
  };
  const writeResult = {
    current: Promise.resolve<WriteResult>({ committed: true, revision: 1 }),
  };
  const clearResult = {
    current: Promise.resolve<WriteResult>({ committed: true, revision: 1 }),
  };

  // A session creates its lifecycle before its state; the writer needs it.
  ctx.core.worldLifecycle = createWorldLifecycle({ traffic: false });
  ctx.core.state = initFlightState(layout);
  ctx.core.stationDef = stationDef;
  ctx.core.stationRecords = stationRecordsOf();
  ctx.core.stationKey = "coriolis-station";
  ctx.core.commodities = catalogue;
  ctx.core.commodityUnits = commodityUnits(catalogue);
  ctx.core.market = market;
  ctx.core.marketSeed = market.seed;
  ctx.core.layout = layout;
  ctx.core.hyperspaceTargetId = undefined;
  ctx.runtime.testHookEnabled = options.hook === true;

  let current: InputContext = "dockScreen";
  ctx.runtime.input = {
    getContext: () => current,
    setContext: (next: InputContext) => {
      current = next;
      contexts.push(next);
      log.push(`input.setContext ${next}`);
    },
  } as unknown as KeyboardInputSource;
  ctx.runtime.loop = {
    reset: () => log.push("loop.reset"),
  } as unknown as GameLoop;
  ctx.save.saveLoad = {
    show: (slot: string) => log.push(`saveLoad.show ${slot}`),
    hide: () => log.push("saveLoad.hide"),
    setSlot: (text: string) => log.push(`saveLoad.setSlot ${text}`),
    setNotice: (text: string) => log.push(`saveLoad.setNotice ${text}`),
    cancelOverwrite: () => log.push("saveLoad.cancelOverwrite"),
    isConfirming: () => false,
  } as unknown as SaveLoadScreen;
  ctx.save.saveScreenOpen = true;
  ctx.save.contextBeforeSaveScreen = "dockHome";

  const store: SaveStore = {
    read: () => {
      log.push("store.read");
      return readResult.current;
    },
    write: (json, revision) => {
      log.push(`store.write ${String(revision)}`);
      writes.push({ json, revision });
      return writeResult.current;
    },
    clear: (revision) => {
      log.push(`store.clear ${String(revision)}`);
      return clearResult.current;
    },
    backupCorrupt: () => Promise.resolve(),
    dispose: () => undefined,
  };

  const controller = createSaveController(ctx, {
    saveBoot: { store, status, allow: ALLOW },
    galaxyById: new Map([[system.id, system]]),
    docked: {
      show: (name: string) => log.push(`docked.show ${name}`),
      hide: () => log.push("docked.hide"),
    },
    hudCanvas: hud,
    probe: probe as unknown as Pick<WegoliteProbe, "restore">,
    messages: { clear: () => log.push("messages.clear") },
    enterSystemById: (id: string) => {
      log.push(`enterSystemById ${id}`);
      return layout;
    },
    syncStatusOverlay: () => log.push("syncStatusOverlay"),
    renderFrame: (alpha: number) => log.push(`renderFrame ${String(alpha)}`),
    renderStation: () => log.push("renderStation"),
    syncStationNav: () => log.push("syncStationNav"),
    ensureSelection: () => log.push("ensureSelection"),
    updateProbe: () => log.push("updateProbe"),
    syncSaveProbe: () => log.push("syncSaveProbe"),
    syncEconomyProbe: () => log.push("syncEconomyProbe"),
    bindTestHook: (active: FlightState) => {
      log.push("bindTestHook");
      bound.push(active);
    },
  });
  return {
    ctx,
    controller,
    log,
    writes,
    bound,
    probe,
    hud,
    contexts,
    readResult,
    writeResult,
    clearResult,
  };
}

/** The blob a docked Lave save of 4321 decicredits holds, from the fakes' own values. */
function dockedBlob(): { raw: string; inputs: SaveInputs } {
  const profile = { ...newProfile(), credits: 4321 };
  const inputs = snapshotForSave(
    initFlightState(layout),
    profile,
    system,
    { key: "coriolis-station" },
    market,
    catalogue,
    { epoch: 0, anchorNextEntityId: undefined },
    undefined,
  );
  return { raw: encodeSave(inputs), inputs };
}

function flyingBlob(): { raw: string; inputs: SaveInputs } {
  const profile = { ...newProfile(), credits: 987 };
  const inputs = snapshotForSave(
    flyingState(),
    profile,
    system,
    { key: "coriolis-station" },
    market,
    catalogue,
    { epoch: 0, anchorNextEntityId: undefined },
    undefined,
  );
  return { raw: encodeSave(inputs), inputs };
}

describe("the status helpers", () => {
  it("only an absent or valid slot may be overwritten, only a known one cleared", () => {
    const statuses: SaveStatus[] = [
      "absent",
      "valid",
      "corrupt",
      "future",
      "unreadable",
      "unavailable",
    ];
    expect(statuses.filter(canOverwrite)).toEqual(["absent", "valid"]);
    expect(statuses.filter(canClear)).toEqual(["absent", "valid", "corrupt"]);
    expect(statusSkipReason("future")).toBe("future");
    expect(statusSkipReason("corrupt")).toBe("corrupt");
    expect(statusSkipReason("valid")).toBe("");
  });
});

describe("autosave guards", () => {
  it("skips with reason recovering before any other guard and queues nothing", () => {
    const { ctx, controller, writes, log } = harness({ status: "future" });
    ctx.runtime.contextLost = true;
    ctx.runtime.testTainted = true;

    controller.autosave();

    expect(ctx.save.saveAttempts).toBe(1);
    expect(ctx.save.saveSkipReason).toBe("recovering");
    expect(ctx.save.saveWrites).toBe(0);
    expect(writes).toEqual([]);
    expect(log).toEqual(["syncSaveProbe"]);
  });

  it("skips a tainted profile with reason tainted and queues nothing", () => {
    const { ctx, controller, writes } = harness({ status: "valid" });
    ctx.runtime.testTainted = true;

    controller.autosave();

    expect(ctx.save.saveAttempts).toBe(1);
    expect(ctx.save.saveSkipReason).toBe("tainted");
    expect(ctx.save.saveRevision).toBe(0);
    expect(writes).toEqual([]);
  });

  it("skips a read-only status with its own reason before the taint guard", () => {
    const { ctx, controller, writes } = harness({ status: "future" });
    ctx.runtime.testTainted = true;
    controller.autosave();
    expect(ctx.save.saveSkipReason).toBe("future");
    expect(writes).toEqual([]);
  });

  it("increments the attempt counter first on every trigger, skipped or not", () => {
    const { ctx, controller } = harness({ status: "valid" });
    ctx.runtime.contextLost = true;
    controller.autosave();
    controller.manualSave();
    ctx.runtime.contextLost = false;
    ctx.runtime.testTainted = true;
    controller.autosave();
    controller.manualSave();
    expect(ctx.save.saveAttempts).toBe(4);
    expect(ctx.save.saveWrites).toBe(0);
  });

  it("reports not-ready when the session has no state yet", () => {
    const { ctx, controller, writes } = harness({ status: "absent" });
    ctx.core.state = undefined;
    controller.autosave();
    expect(ctx.save.saveSkipReason).toBe("not-ready");
    expect(writes).toEqual([]);
  });

  it("a ready docked session writes once and publishes the committed revision", async () => {
    const { ctx, controller, writes, log } = harness({ status: "absent" });
    ctx.core.profile = { ...newProfile(), credits: 555 };

    controller.autosave();
    await flush();

    expect(writes).toHaveLength(1);
    expect(writes[0]?.revision).toBe(1);
    expect(JSON.parse(writes[0]?.json ?? "{}")).toMatchObject({ credits: 555 });
    expect(ctx.save.saveWrites).toBe(1);
    expect(ctx.save.saveCommitted).toBe(1);
    expect(ctx.save.saveCommittedRevision).toBe(1);
    expect(ctx.save.saveStatus).toBe("valid");
    expect(ctx.save.saveSkipReason).toBe("");
    expect(log).toContain("renderStation");
  });
});

describe("a dead state is never written (DEATH-06)", () => {
  /** Run `call`; it either returns or throws the snapshot refusal, nothing else. */
  function refusedOrReturned(call: () => void): void {
    try {
      call();
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/a dead player is never saved/);
    }
  }

  it("a dead state never queues a write, through autosave or the manual save", async () => {
    const { ctx, controller, writes, log } = harness({ status: "absent" });
    const state = flyingState();
    // The dead state comes from the one death path, never from an assignment.
    killPlayer(state, createPlayerCombatState(), { damage: "laser" }, []);
    expect(state.mode).toBe("dead");
    ctx.core.state = state;
    expect(ctx.runtime.contextLost).toBe(false);
    expect(ctx.runtime.testTainted).toBe(false);

    refusedOrReturned(() => controller.autosave());
    refusedOrReturned(() => controller.manualSave());
    await flush();

    // Nothing reached the store, and no write was counted or marked pending.
    expect(writes).toEqual([]);
    expect(log.some((entry) => entry.startsWith("store.write"))).toBe(false);
    expect(ctx.save.saveWrites).toBe(0);
    expect(ctx.save.manualSavePending).toBe(false);
    expect(ctx.save.saveRevision).toBe(0);
  });
});

describe("a latched session refuses every save path (DEATH-06, D-12)", () => {
  /** Latch the session as the death flow does, with a scrape cause. */
  function latch(ctx: SessionState): void {
    // The harness's input double has no clearAll (the latch calls it).
    const input = ctx.runtime.input as unknown as { clearAll?: () => void };
    input.clearAll ??= () => undefined;
    expect(latchGameOver(ctx, { damage: "scrape", culprit: "buoy" })).toBe(
      true,
    );
  }

  it("writeManualSave writes nothing, reports dead and leaves the overwrite dialog alone", () => {
    const { ctx, controller, writes, log } = harness({ status: "absent" });
    latch(ctx);
    log.length = 0;

    controller.writeManualSave();

    expect(writes).toEqual([]);
    expect(ctx.save.saveSkipReason).toBe("dead");
    expect(ctx.save.manualSavePending).toBe(false);
    expect(ctx.save.saveRevision).toBe(0);
    expect(log).not.toContain("saveLoad.cancelOverwrite");
    expect(log.some((entry) => entry.startsWith("store.write"))).toBe(false);
  });

  it("buildSnapshotInputs returns undefined for a latched session", () => {
    const { ctx, controller } = harness({ status: "absent" });
    expect(controller.buildSnapshotInputs()).toBeDefined();
    latch(ctx);
    expect(controller.buildSnapshotInputs()).toBeUndefined();
  });

  it("buildSnapshotInputs returns undefined for a dead state even with the latch unset", () => {
    const { ctx, controller } = harness({ status: "absent" });
    const state = flyingState();
    killPlayer(state, createPlayerCombatState(), { damage: "laser" }, []);
    ctx.core.state = state;
    expect(ctx.runtime.gameOver).toBe(false);
    // The snapshot refusal of 20-01 is never reached: no throw, just undefined.
    expect(() => controller.buildSnapshotInputs()).not.toThrow();
    expect(controller.buildSnapshotInputs()).toBeUndefined();
  });

  it("queueSnapshot called directly counts and queues nothing for a latched session or a dead state", () => {
    const { ctx, controller, writes } = harness({ status: "absent" });
    const inputs = controller.buildSnapshotInputs();
    if (inputs === undefined) throw new Error("no inputs");

    latch(ctx);
    controller.queueSnapshot(inputs, false);
    controller.queueSnapshot(inputs, true);
    expect(ctx.save.saveRevision).toBe(0);
    expect(ctx.save.saveWrites).toBe(0);
    expect(ctx.save.manualSavePending).toBe(false);

    const other = harness({ status: "absent" });
    const state = flyingState();
    killPlayer(state, createPlayerCombatState(), { damage: "laser" }, []);
    other.ctx.core.state = state;
    other.controller.queueSnapshot(inputs, false);
    expect(other.ctx.save.saveRevision).toBe(0);
    expect(other.ctx.save.saveWrites).toBe(0);
    expect(writes).toEqual([]);
    expect(other.writes).toEqual([]);
  });

  it("loadFromSave returns before reading the store and installs nothing", async () => {
    const h = harness({ status: "valid" });
    h.readResult.current = Promise.resolve<SaveReadResult>({
      kind: "ok",
      raw: dockedBlob().raw,
    });
    latch(h.ctx);
    h.log.length = 0;

    await h.controller.loadFromSave();

    expect(h.log).toEqual(["syncSaveProbe"]);
    expect(h.log).not.toContain("store.read");
    expect(h.ctx.save.saveSkipReason).toBe("dead");
    expect(h.ctx.save.loadingSave).toBe(false);
    expect(h.bound).toEqual([]);
  });

  it("clearSaveForNewGame returns before clearing the store", async () => {
    const h = harness({ status: "valid" });
    latch(h.ctx);
    h.log.length = 0;

    await h.controller.clearSaveForNewGame();

    expect(h.log).toEqual(["syncSaveProbe"]);
    expect(h.log.some((entry) => entry.startsWith("store.clear"))).toBe(false);
    expect(h.ctx.save.saveRevision).toBe(0);
    expect(h.ctx.save.saveSkipReason).toBe("dead");
    expect(h.ctx.save.saveStatus).toBe("valid");
  });

  it("same frame: an anchor queued before the lethal step commits, every later attempt is refused", async () => {
    const { ctx, controller, writes } = harness({ status: "absent" });
    controller.autosave();
    const anchor = writes[0]?.json;
    expect(writes).toHaveLength(1);

    latch(ctx);
    controller.autosave();
    controller.autosave();
    controller.manualSave();
    await flush();

    expect(writes).toHaveLength(1);
    expect(writes[0]?.json).toBe(anchor);
    expect(ctx.save.saveStatus).toBe("valid");
    expect(ctx.save.saveAttempts).toBe(4);
    expect(ctx.save.saveSkipReason).toBe("dead");
  });

  it("a write pending at the death completes as the anchor and leaves the dead reason in place", async () => {
    const { ctx, controller, writes, writeResult } = harness({
      status: "absent",
    });
    const held = deferred<WriteResult>();
    writeResult.current = held.promise;
    controller.autosave();
    expect(writes).toHaveLength(1);

    latch(ctx);
    controller.autosave();
    expect(ctx.save.saveSkipReason).toBe("dead");

    held.resolve({ committed: true, revision: 1 });
    await flush();

    expect(ctx.runtime.gameOver).toBe(true);
    expect(ctx.save.saveStatus).toBe("valid");
    expect(ctx.save.saveCommitted).toBe(1);
    expect(ctx.save.saveCommittedRevision).toBe(1);
    // The completion clears the reason only while unlatched (review round 1).
    expect(ctx.save.saveSkipReason).toBe("dead");
    controller.autosave();
    expect(writes).toHaveLength(1);
    expect(ctx.save.saveSkipReason).toBe("dead");
  });

  it("a write that commits after the latch with no later attempt reports dead, not blank", async () => {
    const { ctx, controller, writeResult } = harness({ status: "absent" });
    const held = deferred<WriteResult>();
    writeResult.current = held.promise;
    controller.autosave();
    latch(ctx);

    held.resolve({ committed: true, revision: 1 });
    await flush();

    expect(ctx.save.saveSkipReason).toBe("dead");
  });
});

describe("buildSnapshotInputs", () => {
  it("returns the docked SaveInputs from the fake state's own fields", () => {
    const { ctx, controller } = harness();
    const state = initFlightState(layout);
    ctx.core.state = state;
    ctx.core.profile = {
      ...newProfile(),
      credits: 777,
      cargo: setCargo(newProfile().cargo, "food", 3),
    };
    ctx.core.hyperspaceTargetId = "g0-s3";

    expect(controller.buildSnapshotInputs()).toEqual(
      expectedInputs({
        clockSeconds: Math.floor(state.clockSeconds),
        credits: 777,
        equipment: [],
        cargo: [{ key: "food", quantity: 3 }],
        fuel: ctx.core.profile.fuel,
        missiles: ctx.core.profile.missiles,
        passengerBerths: ctx.core.profile.passengerBerths,
        laserMounts: DEFAULT_LASER_MOUNTS,
        mode: "docked",
        targetSystem: "g0-s3",
        market,
        systemId: system.id,
        stationKey: "coriolis-station",
        epoch: 0,
        nextEntityId: 101,
      }),
    );
  });

  it("returns the in-flight SaveInputs with the pose the persistence layer saves", () => {
    const { ctx, controller } = harness();
    const state = flyingState();
    ctx.core.state = state;
    ctx.core.profile = { ...newProfile(), credits: 321 };

    expect(controller.buildSnapshotInputs()).toEqual(
      expectedInputs({
        clockSeconds: Math.floor(state.clockSeconds),
        credits: 321,
        equipment: [],
        cargo: [],
        fuel: ctx.core.profile.fuel,
        missiles: ctx.core.profile.missiles,
        passengerBerths: ctx.core.profile.passengerBerths,
        laserMounts: DEFAULT_LASER_MOUNTS,
        mode: "inFlight",
        market,
        flight: {
          position: [1200.5, -40.25, 8000.75],
          orientation: [
            state.orientation.w,
            state.orientation.x,
            state.orientation.y,
            state.orientation.z,
          ],
          speed: 123.5,
          pitchRate: 0.25,
          rollRate: -0.125,
          torus: false,
        },
        systemId: system.id,
        stationKey: "coriolis-station",
        epoch: 0,
        nextEntityId: 101,
      }),
    );
  });

  it("returns nothing until the state, station, market and catalogue exist", () => {
    const { ctx, controller } = harness();
    ctx.core.market = undefined;
    expect(controller.buildSnapshotInputs()).toBeUndefined();
  });

  it("returns nothing without a world lifecycle", () => {
    const { ctx, controller, writes } = harness({ status: "absent" });
    ctx.core.worldLifecycle = undefined;
    expect(controller.buildSnapshotInputs()).toBeUndefined();

    controller.autosave();
    expect(ctx.save.saveSkipReason).toBe("not-ready");
    expect(writes).toEqual([]);
  });

  it("records the lifecycle epoch and, in flight, the anchor counter", () => {
    const { ctx, controller } = harness();
    ctx.core.state = flyingState();
    ctx.core.worldLifecycle?.begin(market.seed);

    const inputs = controller.buildSnapshotInputs();
    expect(inputs?.mode).toBe("inFlight");
    expect(inputs?.epoch).toBe(1);
    expect(inputs?.nextEntityId).toBe(101);
  });
});

describe("closeSaveScreen", () => {
  it("restores the recorded context without a document", () => {
    const { ctx, controller, contexts } = harness();
    expect(typeof document).toBe("undefined");
    controller.closeSaveScreen();
    expect(ctx.save.saveScreenOpen).toBe(false);
    expect(contexts).toEqual(["dockHome"]);
  });
});

describe("loadFromSave order", () => {
  /**
   * The pre-move order of a successful docked Load (08-08 SUMMARY, "loadFromSave
   * sequence"): the read, the scene entry, the six installs, the status
   * overlay, the message clear and the dock-feedback replacement, the hook
   * rebind (only when enabled), the F2 teardown, the input context, the shell,
   * the selection and station render, the nav, the probe restore and save
   * probe, the loop reset and the one frame.
   */
  const DOCKED_SEQUENCE = [
    "store.read",
    "enterSystemById g0-s7",
    "install state",
    "install layout",
    "install profile",
    "install market",
    "install marketSeed",
    "install hyperspaceTargetId",
    "syncStatusOverlay",
    "messages.clear",
    "install dockFeedback",
    "saveLoad.cancelOverwrite",
    "saveLoad.hide",
    "input.setContext dockHome",
    "docked.show Lave",
    "ensureSelection",
    "renderStation",
    "syncStationNav",
    "probe.restore",
    "syncSaveProbe",
    "loop.reset",
    "renderFrame 0",
  ];

  function watched(h: Harness): void {
    observe(h.ctx.core, "state", "state", h.log);
    observe(h.ctx.core, "layout", "layout", h.log);
    observe(h.ctx.core, "profile", "profile", h.log);
    observe(h.ctx.core, "market", "market", h.log);
    observe(h.ctx.core, "marketSeed", "marketSeed", h.log);
    observe(h.ctx.core, "hyperspaceTargetId", "hyperspaceTargetId", h.log);
    observe(h.ctx.core, "dockFeedback", "dockFeedback", h.log);
  }

  it("(a) a successful docked Load records exactly the pre-move sequence", async () => {
    const h = harness();
    watched(h);
    h.readResult.current = Promise.resolve({
      kind: "ok",
      raw: dockedBlob().raw,
    });
    const feedbackBefore = h.ctx.core.dockFeedback;

    await h.controller.loadFromSave();

    expect(h.log).toEqual(DOCKED_SEQUENCE);
    expect(h.ctx.core.profile.credits).toBe(4321);
    expect(h.ctx.core.dockFeedback).not.toBe(feedbackBefore);
    expect(h.ctx.save.saveScreenOpen).toBe(false);
    expect(h.ctx.save.saveStatus).toBe("valid");
    expect(h.ctx.save.loadingSave).toBe(false);
    expect(h.hud.hidden).toBe(true);
  });

  it("(a) a successful in-flight Load takes the flight branch of the same order", async () => {
    const h = harness();
    watched(h);
    h.readResult.current = Promise.resolve({
      kind: "ok",
      raw: flyingBlob().raw,
    });

    await h.controller.loadFromSave();

    expect(h.log).toEqual([
      "store.read",
      "enterSystemById g0-s7",
      "install state",
      "install layout",
      "install profile",
      "install market",
      "install marketSeed",
      "install hyperspaceTargetId",
      "syncStatusOverlay",
      "messages.clear",
      "install dockFeedback",
      "saveLoad.cancelOverwrite",
      "saveLoad.hide",
      "input.setContext flight",
      "docked.hide",
      "syncEconomyProbe",
      "syncStationNav",
      "probe.restore",
      "syncSaveProbe",
      "loop.reset",
      "renderFrame 0",
    ]);
    expect(h.ctx.core.state?.mode).toBe("inFlight");
    expect(h.hud.hidden).toBe(false);
  });

  it("(b) rebinds the test hook once, after the state install, with the restored object", async () => {
    const h = harness({ hook: true });
    watched(h);
    h.readResult.current = Promise.resolve({
      kind: "ok",
      raw: dockedBlob().raw,
    });
    const before = h.ctx.core.state;

    await h.controller.loadFromSave();

    expect(h.bound).toHaveLength(1);
    expect(h.bound[0]).toBe(h.ctx.core.state);
    expect(h.bound[0]).not.toBe(before);
    expect(h.log.indexOf("bindTestHook")).toBeGreaterThan(
      h.log.indexOf("install state"),
    );
    expect(h.log.filter((entry) => entry === "bindTestHook")).toHaveLength(1);
  });

  it("(b) does not bind the hook when it is not enabled", async () => {
    const h = harness({ hook: false });
    h.readResult.current = Promise.resolve({
      kind: "ok",
      raw: dockedBlob().raw,
    });
    await h.controller.loadFromSave();
    expect(h.bound).toEqual([]);
    expect(h.log).not.toContain("bindTestHook");
  });

  it("(f) a docked or in-flight Load installs a fresh pristine combat state, whatever the replaced session had (plan 13-11)", async () => {
    for (const blob of [dockedBlob, flyingBlob]) {
      const h = harness();
      const worn = createPlayerCombatState();
      worn.fwdShield = 3;
      worn.aftShield = 0;
      worn.energy = 10;
      worn.cabinTemp = 200;
      worn.view = "port";
      worn.laserTemp.fore = 40;
      worn.identEngaged = true;
      h.ctx.core.combat = worn;
      expect(isPristineCombat(worn)).toBe(false);
      watched(h);
      observe(h.ctx.core, "combat", "combat", h.log);
      h.readResult.current = Promise.resolve({ kind: "ok", raw: blob().raw });

      await h.controller.loadFromSave();

      const fresh = h.ctx.core.combat;
      if (fresh === undefined) throw new Error("the Load left no combat state");
      expect(fresh).not.toBe(worn);
      expect(isPristineCombat(fresh)).toBe(true);
      // Installed inside the one synchronous block, right after the state.
      expect(h.log.indexOf("install combat")).toBe(
        h.log.indexOf("install state") + 1,
      );
    }
  });

  it("(g) a Load clears the combat and ident message gates so the first message shows at once (plan 13-12)", async () => {
    const h = harness();
    h.ctx.core.lastCombatMessageTimes.overheat = 99;
    h.ctx.core.lastCombatMessageTimes.identLocked = 99;
    h.readResult.current = Promise.resolve({
      kind: "ok",
      raw: dockedBlob().raw,
    });

    await h.controller.loadFromSave();

    expect(h.ctx.core.lastCombatMessageTimes).toEqual({
      overheat: null,
      noEnergy: null,
      identEngaged: null,
      identLocked: null,
      identLost: null,
      identOff: null,
    });
  });

  it("(h) a docked or in-flight Load resets the market column sort to the catalogue order (quick 261118-n7z)", async () => {
    for (const blob of [dockedBlob, flyingBlob]) {
      const h = harness();
      h.ctx.station.marketSort = { column: "price", direction: "descending" };
      h.readResult.current = Promise.resolve({ kind: "ok", raw: blob().raw });

      await h.controller.loadFromSave();

      expect(h.ctx.station.marketSort).toBeNull();
    }
  });

  it("(h) a Load that fails to parse keeps the market sort", async () => {
    const h = harness();
    const sort = { column: "name", direction: "ascending" } as const;
    h.ctx.station.marketSort = sort;
    h.readResult.current = Promise.resolve({ kind: "ok", raw: "{not json" });

    await h.controller.loadFromSave();

    expect(h.ctx.station.marketSort).toBe(sort);
  });

  it("(c) a read that resolves after F2 was closed installs nothing and stays silent", async () => {
    const h = harness();
    watched(h);
    const pending = deferred<SaveReadResult>();
    h.readResult.current = pending.promise;
    const before = {
      state: h.ctx.core.state,
      profile: h.ctx.core.profile,
      market: h.ctx.core.market,
    };

    const loading = h.controller.loadFromSave();
    expect(h.ctx.save.loadingSave).toBe(true);
    h.ctx.save.saveScreenOpen = false;
    pending.resolve({ kind: "ok", raw: dockedBlob().raw });
    await loading;

    // The pre-move outcome: a bare return, neither a failure notice nor an install.
    expect(h.log).toEqual(["store.read"]);
    expect(h.ctx.core.state).toBe(before.state);
    expect(h.ctx.core.profile).toBe(before.profile);
    expect(h.ctx.core.market).toBe(before.market);
    expect(h.ctx.save.loadingSave).toBe(false);
  });

  it("(c) closing an open F2 screen bumps the screen generation once; a closed one does not", () => {
    const h = harness();
    h.ctx.save.saveScreenOpen = true;
    const start = h.ctx.save.saveScreenGeneration;
    h.controller.closeSaveScreen();
    expect(h.ctx.save.saveScreenGeneration).toBe(start + 1);
    h.controller.closeSaveScreen();
    expect(h.ctx.save.saveScreenGeneration).toBe(start + 1);
  });

  it("(c) a read that resolves after F2 was closed and reopened installs nothing (quick 261124-pze F5)", async () => {
    const h = harness();
    const pending = deferred<SaveReadResult>();
    h.readResult.current = pending.promise;
    const before = {
      state: h.ctx.core.state,
      profile: h.ctx.core.profile,
      market: h.ctx.core.market,
    };

    const loading = h.controller.loadFromSave();
    expect(h.ctx.save.loadingSave).toBe(true);
    h.controller.closeSaveScreen();
    // The player opens F2 again before the IndexedDB read resolves.
    h.ctx.save.saveScreenOpen = true;
    pending.resolve({ kind: "ok", raw: dockedBlob().raw });
    await loading;

    expect(h.ctx.core.state).toBe(before.state);
    expect(h.ctx.core.profile).toBe(before.profile);
    expect(h.ctx.core.market).toBe(before.market);
    expect(h.ctx.save.saveScreenOpen).toBe(true);
    expect(h.ctx.save.loadingSave).toBe(false);
  });

  it("(d) a blob that fails to parse calls the failure path once and changes no live field", async () => {
    const h = harness();
    watched(h);
    h.readResult.current = Promise.resolve({ kind: "ok", raw: "not a save" });
    const before = {
      state: h.ctx.core.state,
      layout: h.ctx.core.layout,
      profile: h.ctx.core.profile,
      market: h.ctx.core.market,
      marketSeed: h.ctx.core.marketSeed,
    };

    await h.controller.loadFromSave();

    expect(h.log).toEqual([
      "store.read",
      "saveLoad.setNotice Save could not be read",
      "syncSaveProbe",
      "updateProbe",
    ]);
    expect(h.ctx.core.state).toBe(before.state);
    expect(h.ctx.core.layout).toBe(before.layout);
    expect(h.ctx.core.profile).toBe(before.profile);
    expect(h.ctx.core.market).toBe(before.market);
    expect(h.ctx.core.marketSeed).toBe(before.marketSeed);
    expect(h.ctx.save.saveScreenOpen).toBe(true);
  });

  it("(e) a session disposed during the read installs nothing and calls nothing after read", async () => {
    const h = harness();
    watched(h);
    const pending = deferred<SaveReadResult>();
    h.readResult.current = pending.promise;
    const before = {
      state: h.ctx.core.state,
      layout: h.ctx.core.layout,
      profile: h.ctx.core.profile,
      market: h.ctx.core.market,
      marketSeed: h.ctx.core.marketSeed,
    };

    const loading = h.controller.loadFromSave();
    h.ctx.runtime.disposed = true;
    pending.resolve({ kind: "ok", raw: dockedBlob().raw });
    await loading;

    expect(h.log).toEqual(["store.read"]);
    expect(h.ctx.core.state).toBe(before.state);
    expect(h.ctx.core.layout).toBe(before.layout);
    expect(h.ctx.core.profile).toBe(before.profile);
    expect(h.ctx.core.market).toBe(before.market);
    expect(h.ctx.core.marketSeed).toBe(before.marketSeed);
  });

  it("(e) a session disposed while clearSaveForNewGame's clear is pending touches no save state", async () => {
    const h = harness({ status: "valid" });
    const pending = deferred<WriteResult>();
    h.clearResult.current = pending.promise;

    const clearing = h.controller.clearSaveForNewGame();
    expect(h.ctx.save.saveRevision).toBe(1);
    h.ctx.runtime.disposed = true;
    pending.resolve({ committed: true, revision: 1 });
    await clearing;

    expect(h.log).toEqual(["store.clear 1"]);
    expect(h.ctx.save.saveStatus).toBe("valid");
    expect(h.ctx.save.saveSkipReason).toBe("");
    expect(h.ctx.save.saveUnavailable).toBe(false);
  });

  it("(e) a session disposed while an autosave write is pending touches no save state", async () => {
    const h = harness({ status: "absent" });
    const pending = deferred<WriteResult>();
    h.writeResult.current = pending.promise;

    h.controller.autosave();
    expect(h.ctx.save.saveWrites).toBe(1);
    const logAfterQueue = [...h.log];
    h.ctx.runtime.disposed = true;
    pending.resolve({ committed: true, revision: 1 });
    await flush();

    expect(h.log).toEqual(logAfterQueue);
    expect(h.ctx.save.saveCommitted).toBe(0);
    expect(h.ctx.save.saveCommittedRevision).toBe(0);
    expect(h.ctx.save.saveLastClock).toBeNull();
    expect(h.ctx.save.saveStatus).toBe("absent");
  });

  it("clearSaveForNewGame commits a clear for a known blob and refuses an unknown one", async () => {
    const known = harness({ status: "valid" });
    await known.controller.clearSaveForNewGame();
    expect(known.ctx.save.saveStatus).toBe("absent");
    expect(known.log).toEqual(["store.clear 1", "syncSaveProbe"]);

    const future = harness({ status: "future" });
    await future.controller.clearSaveForNewGame();
    expect(future.ctx.save.saveSkipReason).toBe("future");
    expect(future.log).toEqual(["syncSaveProbe"]);
    expect(future.ctx.save.saveRevision).toBe(0);
  });
});

describe("the station follows the saved system (Phase 22.1, WORLD-20)", () => {
  const galaxy = JSON.parse(
    readFileSync(
      new URL(
        "../../../src/content/generated/systems/g0.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as System[];
  const galaxyById = new Map(galaxy.map((entry) => [entry.id, entry]));

  function systemNamed(name: string): System {
    const found = galaxy.find((entry) => entry.name === name);
    if (found === undefined) throw new Error(`no system named ${name}`);
    return found;
  }

  const allowEveryStation = saveAllowLists({
    equipment: new Set(["EQ_DOCK_COMP"]),
    systems: new Set(galaxy.map((entry) => entry.id)),
    stations: new Set(STATION_KINDS.map((kind) => stationSpecOf(kind).key)),
    commodities: new Map(
      catalogue
        .filter((commodity) => commodity.tradeable)
        .map((commodity) => [commodity.key, commodity.unit]),
    ),
  });

  interface RealHarness {
    readonly ctx: SessionState;
    readonly controller: SaveController;
    readonly read: { current: SaveReadResult };
    readonly entered: string[];
    /** Whether the hull table held the entered system's station, per entry. */
    readonly hullHeldAtEnter: (boolean | undefined)[];
  }

  /**
   * A session at Lave whose Load goes through the real hyperspace controller's
   * `enterSystemById`, the one that installs the station, over a scene manager
   * double that derives the layout of what it was last asked to enter.
   */
  function realHarness(failEnter = false, traffic = false): RealHarness {
    const ctx = createSessionState({
      system,
      saveStatus: "valid",
      saveSkipReason: "",
    });
    const entered: string[] = [];
    const hullHeldAtEnter: (boolean | undefined)[] = [];
    if (traffic) {
      // As the boot leaves a traffic-on session: the ship hulls and the
      // shared static hulls merged, their names installed.
      ctx.runtime.testFlags = { ...ctx.runtime.testFlags, traffic: true };
      ctx.core.hulls = hullTable(SHIP_HULLS, SHARED_STATICS.hulls);
      ctx.core.targetNames = new Map(
        SHARED_STATICS.names.map((entry) => [entry.key, entry.name]),
      );
    }
    let last: { system: System; spec: StationSpec } | undefined;
    ctx.core.worldLifecycle = createWorldLifecycle({ traffic: false });
    ctx.core.state = initFlightState(layout);
    ctx.core.stationDef = stationDef;
    ctx.core.stationKey = stationDef.key;
    ctx.core.dockGeometry = dockGeometryOf("coriolis");
    ctx.core.stationRecords = stationRecordsOf();
    ctx.core.commodities = catalogue;
    ctx.core.commodityUnits = commodityUnits(catalogue);
    ctx.core.market = market;
    ctx.core.marketSeed = market.seed;
    ctx.core.layout = layout;
    ctx.runtime.input = {
      getContext: () => "dockScreen",
      setContext: () => undefined,
    } as unknown as KeyboardInputSource;
    ctx.runtime.loop = { reset: () => undefined } as unknown as GameLoop;
    ctx.save.saveLoad = {
      show: () => undefined,
      hide: () => undefined,
      setSlot: () => undefined,
      setNotice: () => undefined,
      cancelOverwrite: () => undefined,
      isConfirming: () => false,
    } as unknown as SaveLoadScreen;
    ctx.save.saveScreenOpen = true;
    ctx.save.contextBeforeSaveScreen = "dockHome";

    const quiet = (): void => undefined;
    const hyperspace = createHyperspaceController(ctx, {
      scenes: {
        enterSystem: (target, spec) => {
          if (failEnter) throw new Error("scene build failed");
          entered.push(target.id);
          hullHeldAtEnter.push(ctx.core.hulls?.has(spec.key));
          last = { system: target, spec };
          return {} as ReturnType<
            HyperspaceControllerDeps["scenes"]["enterSystem"]
          >;
        },
        layout: () =>
          last === undefined
            ? undefined
            : deriveSystemLayout(last.system, last.spec),
      },
      galaxyById,
      messages: { enqueue: quiet, clearPrevious: quiet },
      faults: undefined,
      showBootFailure: quiet,
      publishFailure: quiet,
      autosave: quiet,
      syncEconomyProbe: quiet,
      closeChart: quiet,
    });
    const read: { current: SaveReadResult } = {
      current: { kind: "absent" },
    };
    const store: SaveStore = {
      read: () => Promise.resolve(read.current),
      write: () => Promise.resolve({ committed: true, revision: 1 }),
      clear: () => Promise.resolve({ committed: true, revision: 1 }),
      backupCorrupt: () => Promise.resolve(),
      dispose: () => undefined,
    };
    const controller = createSaveController(ctx, {
      saveBoot: { store, status: "valid", allow: allowEveryStation },
      galaxyById,
      docked: { show: quiet, hide: quiet },
      hudCanvas: { hidden: false },
      probe: {},
      messages: { clear: quiet },
      enterSystemById: hyperspace.enterSystemById,
      syncStatusOverlay: quiet,
      renderFrame: quiet,
      renderStation: quiet,
      syncStationNav: quiet,
      ensureSelection: quiet,
      updateProbe: quiet,
      syncSaveProbe: quiet,
      syncEconomyProbe: quiet,
      bindTestHook: quiet,
    });
    return { ctx, controller, read, entered, hullHeldAtEnter };
  }

  const SHIP_HULLS = JSON.parse(
    readFileSync("src/content/generated/ships-hulls.json", "utf8"),
  ) as ShipHullCatalogue;
  const generatedStatics = (file: string): StaticHullArtifact =>
    StaticHullArtifactSchema.parse(
      JSON.parse(readFileSync(`src/content/generated/${file}`, "utf8")),
    );
  const SHARED_STATICS = generatedStatics("ships-static-hulls.json");

  /** A docked save at `target`, naming `stationKey` (the saved label). */
  function dockedSaveAt(target: System, stationKey: string): SaveReadResult {
    const spec = stationSpecOf(target.station);
    const state = initFlightState(deriveSystemLayout(target, spec));
    const targetMarket = generateMarket(target, catalogue, MARKET_SEED);
    const inputs = snapshotForSave(
      state,
      { ...newProfile(), credits: 4321 },
      target,
      { key: stationKey },
      targetMarket,
      catalogue,
      { epoch: 0, anchorNextEntityId: undefined },
      undefined,
    );
    return { kind: "ok", raw: encodeSave(inputs) };
  }

  it("an F2 Load of a docked save at Zaonce from a Lave session installs the Icosahedron spec, layout and dock geometry", async () => {
    const h = realHarness();
    const zaonce = systemNamed("Zaonce");
    h.read.current = dockedSaveAt(zaonce, "icosahedron-station");

    await h.controller.loadFromSave();

    expect(h.ctx.core.system).toBe(zaonce);
    expect(h.ctx.core.stationDef).toEqual(stationSpecOf("icosahedron"));
    expect(h.ctx.core.stationKey).toBe("icosahedron-station");
    expect(h.ctx.core.layout?.stationKey).toBe("icosahedron-station");
    expect(h.ctx.core.dockGeometry).toEqual(dockGeometryOf("icosahedron"));
  });

  it("the layout the Load derived for the saved pose equals the layout the install derives for the same system (review L240)", async () => {
    const h = realHarness();
    const zaonce = systemNamed("Zaonce");
    h.read.current = dockedSaveAt(zaonce, "icosahedron-station");

    await h.controller.loadFromSave();

    const installed = h.ctx.core.layout;
    if (installed === undefined)
      throw new Error("expected an installed layout");
    expect(installed).toEqual(
      deriveSystemLayout(zaonce, stationSpecOf("icosahedron")),
    );
    // A docked restore rebuilds the dock pose from the layout the Load
    // pre-derived; it is that of the installed layout only if the two agree.
    expect(h.ctx.core.state?.position).toEqual(
      initFlightState(installed).position,
    );
    expect(h.ctx.core.state?.orientation).toEqual(
      initFlightState(installed).orientation,
    );
  });

  it("a failed Load leaves the Lave station, layout and dock geometry in place", async () => {
    const h = realHarness(true);
    const before = {
      system: h.ctx.core.system,
      stationDef: h.ctx.core.stationDef,
      stationKey: h.ctx.core.stationKey,
      layout: h.ctx.core.layout,
      dockGeometry: h.ctx.core.dockGeometry,
    };
    h.read.current = dockedSaveAt(systemNamed("Zaonce"), "icosahedron-station");

    await h.controller.loadFromSave();

    expect(h.ctx.core.system).toBe(before.system);
    expect(h.ctx.core.stationDef).toBe(before.stationDef);
    expect(h.ctx.core.stationKey).toBe(before.stationKey);
    expect(h.ctx.core.layout).toBe(before.layout);
    expect(h.ctx.core.dockGeometry).toBe(before.dockGeometry);
  });

  it("an old save at a Dodecahedron system that carries coriolis-station loads the Dodecahedron, and the next save writes dodecahedron-station (the key is only a label)", async () => {
    const h = realHarness();
    const biarge = systemNamed("Biarge");
    h.read.current = dockedSaveAt(biarge, "coriolis-station");

    await h.controller.loadFromSave();

    expect(h.ctx.core.system).toBe(biarge);
    expect(h.ctx.core.stationDef?.kind).toBe("dodecahedron");
    expect(h.ctx.core.stationKey).toBe("dodecahedron-station");
    expect(h.ctx.core.layout?.stationKey).toBe("dodecahedron-station");
    expect(h.ctx.core.dockGeometry).toEqual(dockGeometryOf("dodecahedron"));
    expect(h.controller.buildSnapshotInputs()?.stationKey).toBe(
      "dodecahedron-station",
    );
  });

  it("a Save at Zaonce writes icosahedron-station", async () => {
    const h = realHarness();
    h.read.current = dockedSaveAt(systemNamed("Zaonce"), "icosahedron-station");
    await h.controller.loadFromSave();

    const inputs = h.controller.buildSnapshotInputs();

    expect(inputs?.systemId).toBe("g0-s129");
    expect(inputs?.stationKey).toBe("icosahedron-station");
  });

  describe("the station hulls of a traffic-on Load (Phase 22.1, O3, T-22.1-33)", () => {
    it("a traffic-on Load of a save at Biarge holds the Dodecahedron hull and name before the station is installed", async () => {
      const h = realHarness(false, true);
      const biarge = systemNamed("Biarge");
      h.read.current = dockedSaveAt(biarge, "dodecahedron-station");
      expect(h.ctx.core.hulls?.has("dodecahedron-station")).toBe(false);

      await h.controller.loadFromSave();

      expect(h.ctx.core.system).toBe(biarge);
      expect(h.ctx.core.hulls?.has("dodecahedron-station")).toBe(true);
      expect(h.ctx.core.targetNames?.has("dodecahedron-station")).toBe(true);
      // The merge preceded the install, so no step ever ran without it.
      expect(h.hullHeldAtEnter).toEqual([true]);
    });

    it("a Load at Zaonce awaits the Icosahedron artifact: nothing is installed until it lands", async () => {
      const h = realHarness(false, true);
      const gate = deferred<StaticHullArtifact>();
      hullLoader.override = () => gate.promise;
      h.read.current = dockedSaveAt(
        systemNamed("Zaonce"),
        "icosahedron-station",
      );

      const loading = h.controller.loadFromSave();
      await flush();
      expect(hullLoader.calls).toEqual(["icosahedron"]);
      expect(h.entered).toEqual([]);
      expect(h.ctx.core.system).toBe(system);

      gate.resolve(generatedStatics("ships-static-hulls-icosahedron.json"));
      await loading;

      expect(h.entered).toEqual(["g0-s129"]);
      expect(h.ctx.core.hulls?.has("icosahedron-station")).toBe(true);
      expect(h.hullHeldAtEnter).toEqual([true]);
    });

    it("a save screen closed during the await receives no Load (G-8)", async () => {
      const h = realHarness(false, true);
      const gate = deferred<StaticHullArtifact>();
      hullLoader.override = () => gate.promise;
      h.read.current = dockedSaveAt(
        systemNamed("Zaonce"),
        "icosahedron-station",
      );

      const loading = h.controller.loadFromSave();
      await flush();
      h.ctx.save.saveScreenOpen = false;
      gate.resolve(generatedStatics("ships-static-hulls-icosahedron.json"));
      await loading;

      expect(h.entered).toEqual([]);
      expect(h.ctx.core.system).toBe(system);
    });

    it("a save screen closed and reopened during the await receives no Load (G-8)", async () => {
      const h = realHarness(false, true);
      const gate = deferred<StaticHullArtifact>();
      hullLoader.override = () => gate.promise;
      h.read.current = dockedSaveAt(
        systemNamed("Zaonce"),
        "icosahedron-station",
      );

      const loading = h.controller.loadFromSave();
      await flush();
      h.ctx.save.saveScreenGeneration += 1;
      gate.resolve(generatedStatics("ships-static-hulls-icosahedron.json"));
      await loading;

      expect(h.entered).toEqual([]);
      expect(h.ctx.core.system).toBe(system);
    });

    it("a session disposed during the await receives no Load", async () => {
      const h = realHarness(false, true);
      const gate = deferred<StaticHullArtifact>();
      hullLoader.override = () => gate.promise;
      h.read.current = dockedSaveAt(
        systemNamed("Zaonce"),
        "icosahedron-station",
      );

      const loading = h.controller.loadFromSave();
      await flush();
      h.ctx.runtime.disposed = true;
      gate.resolve(generatedStatics("ships-static-hulls-icosahedron.json"));
      await loading;

      expect(h.entered).toEqual([]);
      expect(h.ctx.core.hulls?.has("icosahedron-station")).toBe(false);
    });

    it("a rejected artifact load fails the Load with the existing copy and leaves the Lave session as it was", async () => {
      const h = realHarness(false, true);
      hullLoader.override = () => Promise.reject(new Error("artifact lost"));
      h.read.current = dockedSaveAt(
        systemNamed("Zaonce"),
        "icosahedron-station",
      );
      const before = {
        stationDef: h.ctx.core.stationDef,
        layout: h.ctx.core.layout,
        dockGeometry: h.ctx.core.dockGeometry,
        hulls: h.ctx.core.hulls,
        state: h.ctx.core.state,
      };

      await h.controller.loadFromSave();

      expect(h.ctx.save.saveScreenNotice).toBe("Save could not be loaded");
      expect(h.entered).toEqual([]);
      expect(h.ctx.core.system).toBe(system);
      expect(h.ctx.core.stationDef).toBe(before.stationDef);
      expect(h.ctx.core.layout).toBe(before.layout);
      expect(h.ctx.core.dockGeometry).toBe(before.dockGeometry);
      expect(h.ctx.core.hulls).toBe(before.hulls);
      expect(h.ctx.core.state).toBe(before.state);
      // The Load is over: a later Load is not refused as still running.
      expect(h.ctx.save.loadingSave).toBe(false);
    });

    it("a Load at a Coriolis system and a traffic-off Load ask for no artifact", async () => {
      const coriolis = realHarness(false, true);
      coriolis.read.current = dockedSaveAt(
        systemNamed("Leesti"),
        "coriolis-station",
      );
      await coriolis.controller.loadFromSave();
      expect(coriolis.ctx.core.system.name).toBe("Leesti");

      const off = realHarness();
      off.read.current = dockedSaveAt(
        systemNamed("Zaonce"),
        "icosahedron-station",
      );
      await off.controller.loadFromSave();
      expect(off.ctx.core.system.name).toBe("Zaonce");
      expect(off.ctx.core.hulls).toBeUndefined();

      expect(hullLoader.calls).toEqual([]);
    });
  });

  it("the allow-list built from the catalogue (main.ts) holds the three station keys", () => {
    // The rule main.ts applies: every client catalogue entry with a dock
    // subentity. The catalogue grew in plan 22.1-02; the logic did not move.
    const keys = clientCatalogue()
      .filter((entry) =>
        entry.shipDef.subentities.some(
          (subentity) => subentity.isDock === true,
        ),
      )
      .map((entry) => entry.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "coriolis-station",
        "dodecahedron-station",
        "icosahedron-station",
      ]),
    );
    expect(readFileSync("src/main.ts", "utf8")).toContain(
      "subentity.isDock === true",
    );
  });
});
