// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The world lifecycle (Phase 8, plan 08-15; D-02, D-03, D-05, D-06 as amended
 * 2026-11-12, D-08, D-14).
 *
 * Node only. Expected values come from the decisions (the bump-then-derive rule,
 * epoch starting at 0, ids restarting at 101 in every new world, the world hash
 * equal to the flight hash while no NPC exists), never from running the code
 * under test twice.
 */

import { readFileSync } from "node:fs";
import { dirname, posix } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { GameLoop } from "../../../src/app/game-loop.js";
import { createSessionState } from "../../../src/app/session/context.js";
import type { SessionState } from "../../../src/app/session/context.js";
import { createEventRouter } from "../../../src/app/session/event-router.js";
import { createHyperspaceController } from "../../../src/app/session/hyperspace-controller.js";
import type { HyperspaceControllerDeps } from "../../../src/app/session/hyperspace-controller.js";
import { createSaveController } from "../../../src/app/session/save-controller.js";
import type { SaveController } from "../../../src/app/session/save-controller.js";
import { createSimDriver } from "../../../src/app/session/sim-driver.js";
import { createSessionLifecycle } from "../../../src/app/session/start-session.js";
import type { LifecycleDeps } from "../../../src/app/session/start-session.js";
import { createWorldLifecycle } from "../../../src/app/session/world-lifecycle.js";
import type {
  Populate,
  WorldLifecycle,
} from "../../../src/app/session/world-lifecycle.js";
import type { System } from "../../../src/content/types.js";
import type { InputContext } from "../../../src/input/actions.js";
import type { KeyboardInputSource } from "../../../src/input/keyboard.js";
import { snapshotForSave } from "../../../src/persistence/autosave.js";
import { encodeSave } from "../../../src/persistence/save.js";
import type { SaveAllowLists } from "../../../src/persistence/save.js";
import type {
  SaveReadResult,
  SaveStore,
} from "../../../src/persistence/store.js";
import type { SaveLoadScreen } from "../../../src/ui/save-load.js";
import type { Command } from "../../../src/sim/commands.js";
import { DOCK_COMPUTER_KEY } from "../../../src/sim/dock/computer.js";
import {
  arrivalMarketSeed,
  generateMarket,
  marketSeedForSystem,
} from "../../../src/sim/economy/market.js";
import { identity, vec } from "../../../src/sim/math.js";
import { newProfile } from "../../../src/sim/player/profile.js";
import { stepSim } from "../../../src/sim/sim.js";
import { worldSeedFor } from "../../../src/sim/rng.js";
import { liveEntityCount, spawnEntity } from "../../../src/sim/world/world.js";
import {
  PlayerController,
  ScriptedLaunchController,
  ZERO_INTENT,
} from "../../../src/sim/flight/controller.js";
import { hashFlight, initFlightState } from "../../../src/sim/flight/state.js";
import { DT } from "../../../src/sim/time.js";
import { deriveSystemLayout } from "../../../src/sim/world/layout.js";
import { hashWorld } from "../../../src/sim/world/serialize.js";
import {
  commoditiesFixture,
  commodityUnits,
} from "../../helpers/commodities.js";
import { laveFixture } from "../../helpers/lave.js";

const lave = laveFixture();
const MARKET_SEED = 0x12345678;
const launch: Command = { kind: "launch" };

interface Tracer {
  readonly ctx: SessionState;
  readonly lifecycle: WorldLifecycle;
  readonly queue: Command[];
  readonly step: () => void;
}

/**
 * A docked Lave session over the real sim driver, the real router (with the
 * real lifecycle subscriber) and a real lifecycle. The input double drains the
 * `queue`; the loop double runs exactly one fixed step per frame.
 */
function tracer(): Tracer {
  const ctx = createSessionState({
    system: lave.system,
    saveStatus: "absent",
    saveSkipReason: "",
  });
  ctx.core.state = initFlightState(lave.layout);
  ctx.core.layout = lave.layout;
  ctx.core.config = lave.config;
  ctx.core.marketSeed = MARKET_SEED;
  const lifecycle = createWorldLifecycle({ traffic: false });
  ctx.core.worldLifecycle = lifecycle;
  const queue: Command[] = [];
  ctx.runtime.input = {
    drainCommands: () => queue.splice(0),
    frame: () => ({ pitch: 0, roll: 0, speed: 0, precision: false }),
  } as unknown as KeyboardInputSource;
  ctx.runtime.loop = {
    advance: (
      _delta: number,
      commands: readonly Command[],
      stepOnce: (commands: readonly Command[]) => void,
    ) => {
      stepOnce(commands);
      return 0;
    },
  } as unknown as GameLoop;
  const quiet = (): void => undefined;
  const driver = createSimDriver(ctx, {
    pending: [],
    player: new PlayerController(),
    scripted: new ScriptedLaunchController(),
    launchSequence: { advance: () => "flash" },
    router: createEventRouter(ctx, {
      stationFlow: quiet,
      hudMessages: quiet,
      dockFeedback: quiet,
      hyperspaceFlow: quiet,
    }),
    equipmentSet: () => new Set([DOCK_COMPUTER_KEY]),
    targetSystem: () => undefined,
    autosave: quiet,
    markHookMutation: quiet,
  });
  return {
    ctx,
    lifecycle,
    queue,
    step: () => {
      driver.advanceFrame(DT);
    },
  };
}

describe("launch creates a world that steps through stepSim; docking drops it (tracer)", () => {
  it("has no world while docked and epoch 0 before the first launch", () => {
    const { ctx, lifecycle, step } = tracer();
    step();
    expect(ctx.core.state?.mode).toBe("docked");
    expect(lifecycle.world).toBeUndefined();
    expect(lifecycle.epoch).toBe(0);
  });

  it("the launched event bumps epoch to 1 and creates a world from worldSeedFor(marketSeed, 1)", () => {
    const { ctx, lifecycle, queue, step } = tracer();
    queue.push(launch);
    step();
    expect(ctx.core.state?.mode).toBe("launching");
    expect(lifecycle.epoch).toBe(1);
    const world = lifecycle.world;
    expect(world).toBeDefined();
    if (world === undefined) return;
    expect(world.store.nextId).toBe(101);
    expect(world.statics).toHaveLength(5);
    expect(lifecycle.anchorNextEntityId).toBe(101);
  });

  it("keeps the world hash equal to the flight hash at every step of a launch and flight", () => {
    const { ctx, lifecycle, queue, step } = tracer();
    queue.push(launch);
    step();
    const world = lifecycle.world;
    expect(world).toBeDefined();
    for (let tick = 0; tick < 300; tick += 1) {
      step();
      const state = ctx.core.state;
      expect(state).toBeDefined();
      if (state === undefined) return;
      expect(hashWorld(state, lifecycle.world)).toBe(hashFlight(state));
      // One world for the whole flight: nothing recreated it.
      expect(lifecycle.world).toBe(world);
    }
    expect(ctx.core.state?.mode).toBe("inFlight");
  });

  it("drops the world on the docked event but keeps the epoch, so the next launch advances it", () => {
    const { ctx, lifecycle, queue, step } = tracer();
    queue.push(launch);
    for (let tick = 0; tick < 300; tick += 1) step();
    expect(ctx.core.state?.mode).toBe("inFlight");
    expect(lifecycle.epoch).toBe(1);

    queue.push({ kind: "dockingComputer" });
    step();
    expect(ctx.core.state?.mode).toBe("docked");
    expect(lifecycle.world).toBeUndefined();
    expect(lifecycle.epoch).toBe(1);
    expect(lifecycle.anchorNextEntityId).toBeUndefined();

    queue.push(launch);
    step();
    expect(lifecycle.epoch).toBe(2);
    expect(lifecycle.world).toBeDefined();
    expect(lifecycle.world?.store.nextId).toBe(101);
    expect(lifecycle.anchorNextEntityId).toBe(101);
  });
});

describe("lifecycle rules (D-02, D-03, D-05)", () => {
  const SEED_A = 0x00c0ffee;
  const SEED_B = 0xdeadbeef;

  /** begin(a), end(), begin(a), begin(b), resume(b): the plan's driven sequence. */
  function drive(traffic: boolean, populate?: Populate) {
    const lifecycle = createWorldLifecycle(
      populate === undefined ? { traffic } : { traffic, populate },
    );
    const epochs: number[] = [];
    const seeds: (number | undefined)[] = [];
    const nextIds: (number | undefined)[] = [];
    const anchors: (number | undefined)[] = [];
    const worlds: unknown[] = [];
    const record = (): void => {
      epochs.push(lifecycle.epoch);
      seeds.push(lifecycle.world?.worldSeed);
      nextIds.push(lifecycle.world?.store.nextId);
      anchors.push(lifecycle.anchorNextEntityId);
      worlds.push(lifecycle.world);
    };
    lifecycle.begin(SEED_A);
    record();
    lifecycle.end();
    record();
    lifecycle.begin(SEED_A);
    record();
    lifecycle.begin(SEED_B);
    record();
    lifecycle.resume(SEED_B);
    record();
    return { lifecycle, epochs, seeds, nextIds, anchors, worlds };
  }

  it("starts at epoch 0 with no world", () => {
    const lifecycle = createWorldLifecycle({ traffic: true });
    expect(lifecycle.epoch).toBe(0);
    expect(lifecycle.world).toBeUndefined();
  });

  it("reports the same epochs, seeds and starting counters with traffic on and off (D-05)", () => {
    const off = drive(false);
    const on = drive(true);
    expect(off.epochs).toEqual([1, 1, 2, 3, 3]);
    expect(on.epochs).toEqual(off.epochs);
    expect(off.seeds).toEqual([
      worldSeedFor(SEED_A, 1),
      undefined,
      worldSeedFor(SEED_A, 2),
      worldSeedFor(SEED_B, 3),
      worldSeedFor(SEED_B, 3),
    ]);
    expect(on.seeds).toEqual(off.seeds);
    expect(off.nextIds).toEqual([101, undefined, 101, 101, 101]);
    expect(on.nextIds).toEqual(off.nextIds);
    expect(off.anchors).toEqual([101, undefined, 101, 101, 101]);
    expect(on.anchors).toEqual(off.anchors);
  });

  it("runs populate at every creation (four times) with the mode's traffic value", () => {
    for (const traffic of [true, false]) {
      const calls: { traffic: boolean; nextId: number }[] = [];
      drive(traffic, (world, options) => {
        calls.push({ traffic: options.traffic, nextId: world.store.nextId });
      });
      expect(calls).toHaveLength(4);
      for (const call of calls) {
        expect(call).toEqual({ traffic, nextId: 101 });
      }
    }
  });

  it("leaves every world empty with the default populator, in both modes", () => {
    for (const traffic of [true, false]) {
      const lifecycle = createWorldLifecycle({ traffic });
      for (const create of [
        () => {
          lifecycle.begin(SEED_A);
        },
        () => {
          lifecycle.resume(SEED_A);
        },
      ]) {
        create();
        const world = lifecycle.world;
        expect(world).toBeDefined();
        if (world === undefined) return;
        expect(liveEntityCount(world)).toBe(0);
        expect(world.store.nextId).toBe(101);
      }
    }
  });

  it("builds a new world with ids restarting at 101 at every begin and every resume", () => {
    const lifecycle = createWorldLifecycle({ traffic: false });
    lifecycle.begin(SEED_A);
    let previous = lifecycle.world;
    expect(previous).toBeDefined();
    for (const create of [
      () => {
        lifecycle.begin(SEED_A);
      },
      () => {
        lifecycle.resume(SEED_A);
      },
      () => {
        lifecycle.begin(SEED_B);
      },
    ]) {
      const old = previous;
      if (old === undefined) return;
      // Dirty the old world: spawn one entity so its counter moves on.
      const spawned = spawnEntity(
        old,
        {
          kind: "ship",
          specKey: "viper",
          scanClass: "CLASS_POLICE",
          position: vec(0, 0, 0),
          orientation: identity(),
          radius: 1,
        },
        0,
      );
      expect(spawned?.id).toBe(101);
      expect(old.store.nextId).toBe(102);
      create();
      const fresh = lifecycle.world;
      expect(fresh).toBeDefined();
      expect(fresh).not.toBe(old);
      expect(fresh?.store.nextId).toBe(101);
      expect(liveEntityCount(fresh ?? old)).toBe(0);
      previous = fresh;
    }
  });

  it("resume and end leave the epoch unchanged", () => {
    const lifecycle = createWorldLifecycle({ traffic: false });
    lifecycle.begin(SEED_A);
    lifecycle.begin(SEED_A);
    expect(lifecycle.epoch).toBe(2);
    lifecycle.resume(SEED_A);
    expect(lifecycle.epoch).toBe(2);
    expect(lifecycle.world?.worldSeed).toBe(worldSeedFor(SEED_A, 2));
    lifecycle.end();
    expect(lifecycle.epoch).toBe(2);
    expect(lifecycle.world).toBeUndefined();
  });

  it("resetForRestore(0) sets epoch 0 and drops the world", () => {
    const lifecycle = createWorldLifecycle({ traffic: false });
    lifecycle.begin(SEED_A);
    lifecycle.begin(SEED_A);
    expect(lifecycle.resetForRestore(0)).toBe(true);
    expect(lifecycle.epoch).toBe(0);
    expect(lifecycle.world).toBeUndefined();
    lifecycle.begin(SEED_A);
    expect(lifecycle.epoch).toBe(1);
  });

  it("refuses a non-finite seed without a change and without a RangeError", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -Infinity]) {
      const lifecycle = createWorldLifecycle({ traffic: false });
      lifecycle.begin(SEED_A);
      const world = lifecycle.world;
      expect(() => {
        lifecycle.begin(bad);
      }).not.toThrow();
      expect(lifecycle.epoch).toBe(1);
      expect(lifecycle.world).toBe(world);
      expect(() => {
        lifecycle.resume(bad);
      }).not.toThrow();
      expect(lifecycle.epoch).toBe(1);
      expect(lifecycle.world).toBe(world);
    }
  });

  it("saturates at the top of the epoch domain: one last begin succeeds, the next changes nothing", () => {
    const lifecycle = createWorldLifecycle({ traffic: false });
    expect(lifecycle.resetForRestore(0xfffffffe)).toBe(true);
    lifecycle.begin(SEED_A);
    expect(lifecycle.epoch).toBe(0xffffffff);
    const world = lifecycle.world;
    expect(world?.worldSeed).toBe(worldSeedFor(SEED_A, 0xffffffff));
    expect(() => {
      lifecycle.begin(SEED_A);
    }).not.toThrow();
    expect(lifecycle.epoch).toBe(0xffffffff);
    expect(lifecycle.world).toBe(world);
  });

  it("accepts exactly the restore epochs from which begin can still bump", () => {
    const lifecycle = createWorldLifecycle({ traffic: false });
    expect(lifecycle.resetForRestore(0)).toBe(true);
    expect(lifecycle.epoch).toBe(0);
    expect(lifecycle.resetForRestore(7)).toBe(true);
    expect(lifecycle.epoch).toBe(7);
    for (const bad of [0xffffffff, -1, 1.5, Number.NaN, 0x100000000]) {
      lifecycle.begin(SEED_A);
      expect(lifecycle.world).toBeDefined();
      expect(lifecycle.resetForRestore(bad)).toBe(false);
      expect(lifecycle.epoch).toBe(0);
      expect(lifecycle.world).toBeUndefined();
      // A refused restore still leaves a session that can create its next world.
      lifecycle.begin(SEED_A);
      expect(lifecycle.epoch).toBe(1);
      lifecycle.end();
      lifecycle.resetForRestore(0);
    }
  });
});

/** A populator that spawns three ships, as a later phase's real one will. */
const populateThree: Populate = (world) => {
  for (let index = 0; index < 3; index += 1) {
    spawnEntity(
      world,
      {
        kind: "ship",
        specKey: "viper",
        scanClass: "CLASS_POLICE",
        position: vec(index * 10, 0, 0),
        orientation: identity(),
        radius: 1,
      },
      0,
    );
  }
};

describe("leg-anchor counter (Phase 11, D-01, D-05)", () => {
  const SEED = 0x00c0ffee;

  it("is undefined on a fresh lifecycle", () => {
    expect(
      createWorldLifecycle({ traffic: false }).anchorNextEntityId,
    ).toBeUndefined();
  });

  it("is the post-populate counter after begin: 101 with the default populator, 104 with three spawns", () => {
    const empty = createWorldLifecycle({ traffic: false });
    empty.begin(SEED);
    expect(empty.anchorNextEntityId).toBe(101);
    expect(empty.world?.store.nextId).toBe(101);

    const busy = createWorldLifecycle({
      traffic: false,
      populate: populateThree,
    });
    busy.begin(SEED);
    expect(busy.anchorNextEntityId).toBe(104);
    expect(busy.world?.store.nextId).toBe(104);
  });

  it("a spawn later in the leg moves the live counter to 105 but leaves the anchor at 104", () => {
    const lifecycle = createWorldLifecycle({
      traffic: false,
      populate: populateThree,
    });
    lifecycle.begin(SEED);
    const world = lifecycle.world;
    expect(world).toBeDefined();
    if (world === undefined) return;
    const spawned = spawnEntity(
      world,
      {
        kind: "ship",
        specKey: "viper",
        scanClass: "CLASS_POLICE",
        position: vec(0, 0, 0),
        orientation: identity(),
        radius: 1,
      },
      7,
    );
    expect(spawned?.id).toBe(104);
    expect(world.store.nextId).toBe(105);
    expect(lifecycle.anchorNextEntityId).toBe(104);
  });

  it("resume builds a new world and sets the anchor again", () => {
    const lifecycle = createWorldLifecycle({
      traffic: false,
      populate: populateThree,
    });
    lifecycle.begin(SEED);
    const old = lifecycle.world;
    if (old === undefined) return;
    spawnEntity(
      old,
      {
        kind: "ship",
        specKey: "viper",
        scanClass: "CLASS_POLICE",
        position: vec(0, 0, 0),
        orientation: identity(),
        radius: 1,
      },
      7,
    );
    expect(old.store.nextId).toBe(105);
    lifecycle.resume(SEED);
    expect(lifecycle.world).not.toBe(old);
    expect(lifecycle.world?.store.nextId).toBe(104);
    expect(lifecycle.anchorNextEntityId).toBe(104);
  });

  it("end clears the anchor and keeps the epoch; resetForRestore clears it on both branches", () => {
    const lifecycle = createWorldLifecycle({ traffic: false });
    lifecycle.begin(SEED);
    expect(lifecycle.anchorNextEntityId).toBe(101);
    lifecycle.end();
    expect(lifecycle.anchorNextEntityId).toBeUndefined();
    expect(lifecycle.epoch).toBe(1);

    lifecycle.begin(SEED);
    expect(lifecycle.anchorNextEntityId).toBe(101);
    expect(lifecycle.resetForRestore(5)).toBe(true);
    expect(lifecycle.anchorNextEntityId).toBeUndefined();
    expect(lifecycle.world).toBeUndefined();

    lifecycle.begin(SEED);
    expect(lifecycle.anchorNextEntityId).toBe(101);
    expect(lifecycle.resetForRestore(0xffffffff)).toBe(false);
    expect(lifecycle.anchorNextEntityId).toBeUndefined();
    expect(lifecycle.world).toBeUndefined();
  });

  it("a refused begin or resume leaves the anchor unchanged", () => {
    const lifecycle = createWorldLifecycle({
      traffic: false,
      populate: populateThree,
    });
    lifecycle.begin(SEED);
    expect(lifecycle.anchorNextEntityId).toBe(104);
    lifecycle.begin(Number.NaN);
    lifecycle.resume(Number.NaN);
    expect(lifecycle.anchorNextEntityId).toBe(104);
  });

  it("a saturated begin leaves the anchor unchanged", () => {
    const lifecycle = createWorldLifecycle({
      traffic: false,
      populate: populateThree,
    });
    expect(lifecycle.resetForRestore(0xfffffffe)).toBe(true);
    lifecycle.begin(SEED);
    expect(lifecycle.epoch).toBe(0xffffffff);
    expect(lifecycle.anchorNextEntityId).toBe(104);
    lifecycle.begin(SEED);
    expect(lifecycle.epoch).toBe(0xffffffff);
    expect(lifecycle.anchorNextEntityId).toBe(104);
  });

  it("a begin whose populator throws rethrows and leaves epoch, world and anchor unchanged", () => {
    let fail = false;
    const lifecycle = createWorldLifecycle({
      traffic: false,
      populate: (world, options) => {
        if (fail) throw new Error("populate failed");
        populateThree(world, options);
      },
    });
    lifecycle.begin(SEED);
    const world = lifecycle.world;
    expect(lifecycle.anchorNextEntityId).toBe(104);
    fail = true;
    expect(() => {
      lifecycle.begin(SEED);
    }).toThrow("populate failed");
    expect(lifecycle.epoch).toBe(1);
    expect(lifecycle.world).toBe(world);
    expect(lifecycle.anchorNextEntityId).toBe(104);
  });
});

describe("session wiring (start-up and dispose)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** A lifecycle whose collaborators are never reached except by dispose. */
  function disposeHarness(): {
    readonly ctx: SessionState;
    readonly dispose: () => void;
    readonly calls: string[];
  } {
    const ctx = createSessionState({
      system: lave.system,
      saveStatus: "absent",
      saveSkipReason: "",
    });
    ctx.core.state = initFlightState(lave.layout);
    const calls: string[] = [];
    const none = { dispose: () => undefined };
    const deps = {
      assets: none,
      scenes: { disposeSystem: () => undefined, dispose: () => undefined },
      title: none,
      docked: none,
      saveBoot: { store: none },
      pending: [],
      launchSequence: {},
      uiController: new AbortController(),
      redrawGate: { request: () => undefined },
      renderFrame: () => undefined,
      probePublisher: { withdrawProbe: () => undefined },
      onSubpanelKeyDown: () => undefined,
    } as unknown as LifecycleDeps;
    ctx.core.worldLifecycle = {
      world: undefined,
      epoch: 0,
      anchorNextEntityId: undefined,
      begin: () => undefined,
      resume: () => undefined,
      end: () => {
        calls.push("end");
      },
      resetForRestore: () => true,
    };
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    return { ctx, dispose: createSessionLifecycle(ctx, deps).dispose, calls };
  }

  it("dispose ends the world, and a second dispose does it no more", () => {
    const { dispose, calls } = disposeHarness();
    dispose();
    expect(calls).toEqual(["end"]);
    dispose();
    expect(calls).toEqual(["end"]);
  });

  it("dispose on the real lifecycle drops the world and keeps the epoch", () => {
    const { ctx, dispose } = disposeHarness();
    const real = createWorldLifecycle({ traffic: false });
    real.begin(MARKET_SEED);
    ctx.core.worldLifecycle = real;
    dispose();
    expect(real.world).toBeUndefined();
    expect(real.epoch).toBe(1);
    expect(() => {
      dispose();
    }).not.toThrow();
  });

  it("start-up creates the lifecycle from the parsed traffic flag before the restore branch and resumes an in-flight restore", () => {
    // startSession has no Node harness (it builds the renderer, HUD and
    // input), so its three lifecycle points are pinned as ordered source facts;
    // the save-load browser specs exercise the in-flight Continue end to end.
    const source = readFileSync("src/app/session/start-session.ts", "utf8");
    const at = (needle: string, from = 0): number =>
      source.indexOf(needle, from);
    const parsed = at("ctx.runtime.testFlags = parseTestFlags(");
    const created = at("createWorldLifecycle({");
    const restoreBranch = at("if (restoring && restore !== undefined) {");
    const seed = at("ctx.core.marketSeed =\n");
    const resumed = at("worldLifecycle?.resume(");
    expect(parsed).toBeGreaterThan(-1);
    expect(created).toBeGreaterThan(parsed);
    expect(restoreBranch).toBeGreaterThan(created);
    expect(source.slice(created, created + 120)).toContain(
      "traffic: ctx.runtime.testFlags.traffic",
    );
    expect(seed).toBeGreaterThan(restoreBranch);
    expect(resumed).toBeGreaterThan(seed);
    expect(source.slice(seed, resumed)).toContain("restoredInFlight");
    expect(source.match(/createWorldLifecycle\(/g)).toHaveLength(1);
  });
});

/** The Lave save fixtures the Load and anchored-save cases share. */
const catalogue = commoditiesFixture();
const MARKET_SEED_LAVE = 0x12345678;
const laveMarket = generateMarket(lave.system, catalogue, MARKET_SEED_LAVE);

const galaxy = JSON.parse(
  readFileSync(
    new URL("../../../src/content/generated/systems/g0.json", import.meta.url),
    "utf8",
  ),
) as System[];
const destination = galaxy.find((entry) => entry.id !== lave.system.id);
if (destination === undefined) throw new Error("the galaxy has one system");

/** The lifecycle plus a log of every call that reached it, in call order. */
function logged(
  real: WorldLifecycle,
  log: string[],
): WorldLifecycle & { readonly real: WorldLifecycle } {
  return {
    real,
    get world() {
      return real.world;
    },
    get epoch() {
      return real.epoch;
    },
    get anchorNextEntityId() {
      return real.anchorNextEntityId;
    },
    begin: (seed) => {
      log.push(`worldLifecycle.begin ${String(seed)}`);
      real.begin(seed);
    },
    resume: (seed) => {
      log.push(`worldLifecycle.resume ${String(seed)}`);
      real.resume(seed);
    },
    end: () => {
      log.push("worldLifecycle.end");
      real.end();
    },
    resetForRestore: (epoch) => {
      log.push(`worldLifecycle.resetForRestore ${String(epoch)}`);
      return real.resetForRestore(epoch);
    },
  };
}

describe("arrival", () => {
  interface ArrivalHarness {
    readonly ctx: SessionState;
    readonly controller: ReturnType<typeof createHyperspaceController>;
    readonly calls: string[];
    readonly lifecycle: WorldLifecycle;
  }

  /** Doubles copied from tests/app/session/hyperspace-controller.test.ts. */
  function arrivalHarness(failDestinationBuild = false): ArrivalHarness {
    const ctx = createSessionState({
      system: lave.system,
      saveStatus: "absent",
      saveSkipReason: "",
    });
    const calls: string[] = [];
    const state = initFlightState(lave.layout);
    state.mode = "inFlight";
    ctx.core.state = state;
    ctx.core.layout = lave.layout;
    ctx.core.config = lave.config;
    ctx.core.stationDef = lave.stationDef;
    ctx.core.commodities = catalogue;
    ctx.core.marketSeed = marketSeedForSystem(lave.system.id);
    ctx.core.market = generateMarket(
      lave.system,
      catalogue,
      ctx.core.marketSeed,
    );
    ctx.core.hyperspaceTargetId = destination?.id;
    // A world that exists at epoch 1, as after a launch from Lave.
    const real = createWorldLifecycle({ traffic: false });
    real.begin(ctx.core.marketSeed);
    const lifecycle = logged(real, calls);
    ctx.core.worldLifecycle = lifecycle;

    const deps: HyperspaceControllerDeps = {
      scenes: {
        enterSystem: (system) => {
          calls.push(`enterSystem ${system.id}`);
          return {} as ReturnType<
            HyperspaceControllerDeps["scenes"]["enterSystem"]
          >;
        },
        layout: () =>
          deriveSystemLayout(destination ?? lave.system, lave.stationDef),
      },
      galaxyById: new Map(galaxy.map((entry) => [entry.id, entry])),
      messages: {
        enqueue: (text) => calls.push(`enqueue ${text}`),
        enqueuePriority: (text) => calls.push(`enqueuePriority ${text}`),
      },
      faults: failDestinationBuild ? { failDestinationBuild: true } : undefined,
      showBootFailure: () => calls.push("showBootFailure"),
      publishFailure: () => calls.push("publishFailure"),
      autosave: () => calls.push("autosave"),
      syncEconomyProbe: () => calls.push("syncEconomyProbe"),
    };
    return {
      ctx,
      controller: createHyperspaceController(ctx, deps),
      calls,
      lifecycle,
    };
  }

  const jumped = {
    destinationId: destination?.id ?? "",
    clockDeltaSeconds: 576,
    fuelCost: 10,
  };

  it("a successful arrival bumps the epoch, replaces the world from the destination seed and begins before the autosave", () => {
    const { ctx, controller, calls, lifecycle } = arrivalHarness();
    const previousSeed = ctx.core.marketSeed ?? 0;
    const before = lifecycle.world;
    expect(lifecycle.epoch).toBe(1);
    calls.length = 0;

    controller.handleHyperspaceJumped(jumped);

    const nextSeed = arrivalMarketSeed(destination?.id ?? "", previousSeed);
    expect(ctx.core.marketSeed).toBe(nextSeed);
    expect(lifecycle.epoch).toBe(2);
    expect(lifecycle.world).toBeDefined();
    expect(lifecycle.world).not.toBe(before);
    expect(lifecycle.world?.worldSeed).toBe(worldSeedFor(nextSeed, 2));
    expect(lifecycle.world?.store.nextId).toBe(101);
    expect(lifecycle.anchorNextEntityId).toBe(101);
    expect(calls).toEqual([
      `enterSystem ${destination?.id ?? ""}`,
      `worldLifecycle.begin ${String(nextSeed)}`,
      `enqueue Arrived at ${destination?.name ?? ""}`,
      "autosave",
      "syncEconomyProbe",
    ]);
  });

  it("a failed arrival leaves the epoch and the world unchanged and writes no autosave", () => {
    const { controller, calls, lifecycle } = arrivalHarness(true);
    const before = lifecycle.world;
    expect(before).toBeDefined();
    calls.length = 0;

    controller.handleHyperspaceJumped(jumped);

    expect(lifecycle.epoch).toBe(1);
    expect(lifecycle.world).toBe(before);
    expect(lifecycle.anchorNextEntityId).toBe(101);
    expect(calls).not.toContain("autosave");
    expect(calls.some((entry) => entry.startsWith("worldLifecycle"))).toBe(
      false,
    );
  });
});

/** The blob of a Lave save, docked or in flight, with the fixture market. */
function laveBlob(mode: "docked" | "inFlight"): string {
  const state = initFlightState(lave.layout);
  if (mode === "inFlight") {
    state.mode = "inFlight";
    state.position = { x: 1200.5, y: -40.25, z: 8000.75 };
    state.speed = 123.5;
  }
  return encodeSave(
    snapshotForSave(
      state,
      { ...newProfile(), credits: 987 },
      lave.system,
      { key: "coriolis-station" },
      laveMarket,
      catalogue,
      undefined,
    ),
  );
}

const SAVE_ALLOW: SaveAllowLists = {
  equipment: new Set(["EQ_DOCK_COMP"]),
  systems: new Set([lave.system.id]),
  stations: new Set(["coriolis-station"]),
  commodities: new Map(
    catalogue
      .filter((commodity) => commodity.tradeable)
      .map((commodity) => [commodity.key, commodity.unit]),
  ),
  marketGoods: new Set(catalogue.map((commodity) => commodity.key)),
};

interface LoadHarness {
  readonly ctx: SessionState;
  readonly controller: SaveController;
  readonly log: string[];
  readonly lifecycle: WorldLifecycle;
  readonly read: { current: SaveReadResult };
}

/**
 * A save controller over doubles copied from tests/app/session/save-controller.test.ts,
 * with a real lifecycle (wrapped to log) that has already launched (epoch 1)
 * and arrived (epoch 2).
 */
function loadHarness(options: { readonly hook?: boolean } = {}): LoadHarness {
  const ctx = createSessionState({
    system: lave.system,
    saveStatus: "valid",
    saveSkipReason: "",
  });
  const log: string[] = [];
  const read = { current: { kind: "absent" } as SaveReadResult };
  ctx.core.state = initFlightState(lave.layout);
  ctx.core.stationDef = lave.stationDef;
  ctx.core.stationKey = "coriolis-station";
  ctx.core.commodities = catalogue;
  ctx.core.commodityUnits = commodityUnits(catalogue);
  ctx.core.market = laveMarket;
  ctx.core.marketSeed = laveMarket.seed;
  ctx.core.layout = lave.layout;
  ctx.runtime.testHookEnabled = options.hook === true;
  for (const key of ["state", "layout", "marketSeed"] as const) {
    let value: unknown = ctx.core[key];
    Object.defineProperty(ctx.core, key, {
      configurable: true,
      enumerable: true,
      get: () => value,
      set: (next: unknown) => {
        log.push(`install ${key}`);
        value = next;
      },
    });
  }

  const real = createWorldLifecycle({ traffic: false });
  real.begin(MARKET_SEED_LAVE);
  real.begin(0x0badf00d);
  expect(real.epoch).toBe(2);
  const lifecycle = logged(real, log);
  ctx.core.worldLifecycle = lifecycle;

  let current: InputContext = "dockScreen";
  ctx.runtime.input = {
    getContext: () => current,
    setContext: (next: InputContext) => {
      current = next;
    },
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

  const store: SaveStore = {
    read: () => Promise.resolve(read.current),
    write: () => Promise.resolve({ committed: true, revision: 1 }),
    clear: () => Promise.resolve({ committed: true, revision: 1 }),
    backupCorrupt: () => Promise.resolve(),
    dispose: () => undefined,
  };
  const controller = createSaveController(ctx, {
    saveBoot: { store, status: "valid", allow: SAVE_ALLOW },
    galaxyById: new Map([[lave.system.id, lave.system]]),
    docked: { show: () => undefined, hide: () => undefined },
    hudCanvas: { hidden: false },
    probe: {},
    messages: { clear: () => undefined },
    enterSystemById: () => lave.layout,
    syncStatusOverlay: () => undefined,
    renderFrame: () => undefined,
    renderStation: () => undefined,
    syncStationNav: () => undefined,
    ensureSelection: () => undefined,
    updateProbe: () => undefined,
    syncSaveProbe: () => undefined,
    syncEconomyProbe: () => undefined,
    bindTestHook: () => {
      log.push("bindTestHook");
    },
  });
  return { ctx, controller, log, lifecycle, read };
}

describe("load", () => {
  const ARRIVAL_SEED = 0x0badf00d;

  it("an in-flight Load re-anchors at epoch 0 and resumes after the seed install, like a cold Continue", async () => {
    const h = loadHarness();
    h.read.current = { kind: "ok", raw: laveBlob("inFlight") };
    const before = h.lifecycle.world;

    await h.controller.loadFromSave();

    // The call order: installs first, then the re-anchor, then the resume.
    const reset = h.log.indexOf("worldLifecycle.resetForRestore 0");
    const resume = h.log.indexOf(
      `worldLifecycle.resume ${String(MARKET_SEED_LAVE)}`,
    );
    expect(h.log.indexOf("install marketSeed")).toBeGreaterThan(-1);
    expect(reset).toBeGreaterThan(h.log.indexOf("install marketSeed"));
    expect(resume).toBe(reset + 1);
    expect(h.log.filter((entry) => entry.startsWith("worldLifecycle"))).toEqual(
      [
        "worldLifecycle.resetForRestore 0",
        `worldLifecycle.resume ${String(MARKET_SEED_LAVE)}`,
      ],
    );

    // The cold boot Continue of the same save: a fresh lifecycle, then resume.
    const cold = createWorldLifecycle({ traffic: false });
    cold.resume(MARKET_SEED_LAVE);
    expect(h.lifecycle.epoch).toBe(0);
    expect(cold.epoch).toBe(0);
    expect(h.lifecycle.world).toBeDefined();
    expect(h.lifecycle.world).not.toBe(before);
    expect(h.lifecycle.world?.worldSeed).toBe(
      worldSeedFor(MARKET_SEED_LAVE, 0),
    );
    expect(h.lifecycle.world?.worldSeed).toBe(cold.world?.worldSeed);
    expect(h.lifecycle.world?.store.nextId).toBe(101);

    // A subsequent arrival gives epoch 1 and the same seed on both paths.
    h.lifecycle.begin(ARRIVAL_SEED);
    cold.begin(ARRIVAL_SEED);
    expect(h.lifecycle.epoch).toBe(1);
    expect(cold.epoch).toBe(1);
    expect(h.lifecycle.world?.worldSeed).toBe(worldSeedFor(ARRIVAL_SEED, 1));
    expect(h.lifecycle.world?.worldSeed).toBe(cold.world?.worldSeed);
  });

  it("a docked Load re-anchors at epoch 0 and ends the world, like a cold Continue", async () => {
    const h = loadHarness();
    h.read.current = { kind: "ok", raw: laveBlob("docked") };

    await h.controller.loadFromSave();

    expect(h.log.filter((entry) => entry.startsWith("worldLifecycle"))).toEqual(
      ["worldLifecycle.resetForRestore 0"],
    );
    expect(h.lifecycle.epoch).toBe(0);
    expect(h.lifecycle.world).toBeUndefined();

    // The next launch: epoch 1 and the launch seed, ids from 101, as cold.
    const cold = createWorldLifecycle({ traffic: false });
    h.lifecycle.begin(MARKET_SEED_LAVE);
    cold.begin(MARKET_SEED_LAVE);
    expect(h.lifecycle.epoch).toBe(1);
    expect(cold.epoch).toBe(1);
    expect(h.lifecycle.world?.worldSeed).toBe(
      worldSeedFor(MARKET_SEED_LAVE, 1),
    );
    expect(h.lifecycle.world?.worldSeed).toBe(cold.world?.worldSeed);
    expect(h.lifecycle.world?.store.nextId).toBe(101);
  });

  it("a failed parse touches neither the epoch nor the world", async () => {
    const h = loadHarness({ hook: true });
    const before = h.lifecycle.world;
    h.read.current = { kind: "ok", raw: "{ not a save" };

    await h.controller.loadFromSave();

    expect(h.lifecycle.epoch).toBe(2);
    expect(h.lifecycle.world).toBe(before);
    expect(h.log).toEqual([]);
  });

  it("an absent slot touches neither the epoch nor the world", async () => {
    const h = loadHarness();
    const before = h.lifecycle.world;
    h.read.current = { kind: "absent" };

    await h.controller.loadFromSave();

    expect(h.lifecycle.epoch).toBe(2);
    expect(h.lifecycle.world).toBe(before);
    expect(h.log).toEqual([]);
  });

  it("with the hook enabled the rebind still follows the state install", async () => {
    const h = loadHarness({ hook: true });
    h.read.current = { kind: "ok", raw: laveBlob("inFlight") };

    await h.controller.loadFromSave();

    expect(h.log.indexOf("bindTestHook")).toBeGreaterThan(
      h.log.indexOf("install state"),
    );
  });
});

describe("anchored save: the world never enters the save", () => {
  /** The exact v2 allow-lists the plan names (SaveInputs and the encoded SaveV2). */
  const INPUT_KEYS = [
    "cargo",
    "clockSeconds",
    "credits",
    "equipment",
    "flight",
    "fuel",
    "market",
    "marketSeed",
    "missiles",
    "mode",
    "passengerBerths",
    "stationKey",
    "systemId",
    "targetSystem",
  ];
  const SAVE_KEYS = [
    "version",
    "mode",
    "clockSeconds",
    "credits",
    "equipment",
    "cargo",
    "fuel",
    "missiles",
    "passengerBerths",
    "system",
    "station",
    "market",
    "marketSeed",
    "targetSystem",
    "flight",
  ];
  const WORLD_KEYS = [
    '"epoch":',
    '"worldSeed":',
    '"nextId":',
    '"entities":',
    '"specKey":',
    '"aiDropped":',
  ];

  it("SaveInputs and the encoded save are identical with and without a live world", () => {
    const h = loadHarness();
    const state = initFlightState(lave.layout);
    state.mode = "inFlight";
    state.position = { x: 1200.5, y: -40.25, z: 8000.75 };
    state.speed = 123.5;
    h.ctx.core.state = state;
    h.ctx.core.hyperspaceTargetId = destination?.id;

    // A live world that has been stepped, with an NPC in it.
    h.lifecycle.begin(MARKET_SEED_LAVE);
    const world = h.lifecycle.world;
    expect(world).toBeDefined();
    if (world === undefined) return;
    const pilot = spawnEntity(
      world,
      {
        kind: "ship",
        specKey: "test-pilot",
        scanClass: "CLASS_NEUTRAL",
        position: vec(state.position.x + 400, state.position.y, 0),
        orientation: identity(),
        radius: 40,
        speed: 0,
      },
      state.tick,
    );
    expect(pilot?.id).toBe(101);
    for (let tick = 0; tick < 50; tick += 1) {
      stepSim(state, world, lave.layout, lave.config, ZERO_INTENT, [], DT);
    }

    const withWorld = h.controller.buildSnapshotInputs();
    expect(withWorld).toBeDefined();
    if (withWorld === undefined) return;
    expect(Object.keys(withWorld).sort()).toEqual(
      expect.arrayContaining(["flight", "market", "mode", "systemId"]),
    );
    for (const key of Object.keys(withWorld)) {
      expect(INPUT_KEYS).toContain(key);
    }
    const encoded = encodeSave(withWorld);
    for (const key of Object.keys(JSON.parse(encoded) as object)) {
      expect(SAVE_KEYS).toContain(key);
    }
    for (const needle of WORLD_KEYS) {
      expect(JSON.stringify(withWorld)).not.toContain(needle);
      expect(encoded).not.toContain(needle);
    }

    h.lifecycle.end();
    const withoutWorld = h.controller.buildSnapshotInputs();
    expect(withWorld).toEqual(withoutWorld);
    expect(encoded).toBe(encodeSave(withoutWorld ?? withWorld));
  });
});

/**
 * The static imports, `export ... from`, side-effect imports and dynamic
 * `import(` specifiers of a source text, each flagged when it is an
 * `import type`. Comments never count.
 */
function importSpecifiers(
  text: string,
): { specifier: string; typeOnly: boolean }[] {
  const code = text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
  const found: { specifier: string; typeOnly: boolean }[] = [];
  const named =
    /\b(?:import|export)\s+(type\s+)?[^"';]*?\bfrom\s+["']([^"']+)["']/g;
  for (const match of code.matchAll(named)) {
    found.push({
      specifier: match[2] ?? "",
      typeOnly: match[1] !== undefined && /^import/.test(match[0]),
    });
  }
  for (const match of code.matchAll(/\bimport\s+["']([^"']+)["']/g)) {
    found.push({ specifier: match[1] ?? "", typeOnly: false });
  }
  for (const match of code.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    found.push({ specifier: match[1] ?? "", typeOnly: false });
  }
  return found;
}

/** The offending specifiers of one file, named as `<path>: <specifier>`. */
function nodeImportViolations(path: string, text: string): string[] {
  const offenders: string[] = [];
  for (const { specifier, typeOnly } of importSpecifiers(text)) {
    if (!specifier.startsWith(".")) {
      offenders.push(`${path}: ${specifier}`);
      continue;
    }
    const resolved = posix
      .normalize(posix.join(dirname(path), specifier))
      .replace(/\.(?:js|ts)$/, "");
    const underSim = resolved === "src/sim" || resolved.startsWith("src/sim/");
    const contentTypes = typeOnly && resolved === "src/content/types";
    if (!underSim && !contentTypes) offenders.push(`${path}: ${specifier}`);
  }
  return offenders;
}

describe("Node-importable session modules", () => {
  const FILES = [
    "src/app/session/world-lifecycle.ts",
    "src/app/session/step-options.ts",
  ];

  it("every import of world-lifecycle.ts and step-options.ts resolves under src/sim or is an import type from src/content/types", () => {
    for (const file of FILES) {
      const text = readFileSync(file, "utf8");
      expect(importSpecifiers(text).length).toBeGreaterThan(0);
      expect(nodeImportViolations(file, text)).toEqual([]);
    }
  });

  it("names the offending file and specifier for a DOM, Three, UI or value-content import", () => {
    const path = "src/app/session/world-lifecycle.ts";
    const text = [
      'import { a } from "../../sim/rng.js";',
      'import type { System } from "../../content/types.js";',
      'import { b } from "../../content/types.js";',
      'import * as THREE from "three";',
      'import { c } from "../../ui/station.js";',
      'export { d } from "../probe.js";',
      'import "../../render/hud/hud.js";',
      'const lazy = () => import("../../render/system-scene.js");',
      '// import { ignored } from "../../ui/ignored.js";',
      '/* import { alsoIgnored } from "three"; */',
    ].join("\n");
    expect(nodeImportViolations(path, text)).toEqual([
      `${path}: ../../content/types.js`,
      `${path}: three`,
      `${path}: ../../ui/station.js`,
      `${path}: ../probe.js`,
      `${path}: ../../render/hud/hud.js`,
      `${path}: ../../render/system-scene.js`,
    ]);
  });
});
