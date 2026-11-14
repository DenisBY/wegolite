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
import {
  createEventRouter,
  createHyperspaceFlow,
} from "../../../src/app/session/event-router.js";
import { createHyperspaceController } from "../../../src/app/session/hyperspace-controller.js";
import type { HyperspaceControllerDeps } from "../../../src/app/session/hyperspace-controller.js";
import { createSaveController } from "../../../src/app/session/save-controller.js";
import type { SaveController } from "../../../src/app/session/save-controller.js";
import { createSimDriver } from "../../../src/app/session/sim-driver.js";
import {
  createInertPopulate,
  trafficContent,
} from "../../../src/app/session/traffic.js";
import { createSessionLifecycle } from "../../../src/app/session/start-session.js";
import type { LifecycleDeps } from "../../../src/app/session/start-session.js";
import {
  createWorldLifecycle,
  restoreWorldAnchor,
} from "../../../src/app/session/world-lifecycle.js";
import type {
  Populate,
  WorldLifecycle,
} from "../../../src/app/session/world-lifecycle.js";
import type { NpcShip, System } from "../../../src/content/types.js";
import type { InputContext } from "../../../src/input/actions.js";
import type { KeyboardInputSource } from "../../../src/input/keyboard.js";
import { snapshotForSave } from "../../../src/persistence/autosave.js";
import type { SaveWorldCounters } from "../../../src/persistence/autosave.js";
import {
  MAX_SAVE_EPOCH,
  encodeSave,
  parseSave,
} from "../../../src/persistence/save.js";
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
import type { SimEvent } from "../../../src/sim/events.js";
import { createTestPilotAi } from "../../../src/sim/ai/pilots/test-pilot.js";
import { HYPERSPACE_COUNTDOWN_STEPS } from "../../../src/sim/hyperspace/countdown.js";
import { identity, vec } from "../../../src/sim/math.js";
import { newProfile } from "../../../src/sim/player/profile.js";
import { stepSim } from "../../../src/sim/sim.js";
import { worldSeedFor } from "../../../src/sim/rng.js";
import {
  STATIC_ENTITIES,
  createWorld,
  liveEntityCount,
  spawnEntity,
} from "../../../src/sim/world/world.js";
import { createShipField } from "../../../src/sim/world/ship-field.js";
import {
  PlayerController,
  ScriptedLaunchController,
  ZERO_INTENT,
} from "../../../src/sim/flight/controller.js";
import { hashFlight, initFlightState } from "../../../src/sim/flight/state.js";
import { DT } from "../../../src/sim/time.js";
import { deriveSystemLayout } from "../../../src/sim/world/layout.js";
import {
  hashWorld,
  serializeEntity,
  serializeWorldSection,
} from "../../../src/sim/world/serialize.js";
import { snapshotWorld } from "../../../src/sim/world/snapshot.js";
import {
  commoditiesFixture,
  commodityUnits,
} from "../../helpers/commodities.js";
import { laveFixture } from "../../helpers/lave.js";

const lave = laveFixture();
const MARKET_SEED = 0x12345678;

/** The committed NPC catalogue as the session loads it (traffic on). */
function committedTraffic(): ReturnType<typeof trafficContent> {
  return trafficContent(
    JSON.parse(
      readFileSync("src/content/generated/ships-npc.json", "utf8"),
    ) as NpcShip[],
  );
}
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
function tracer(options: { readonly traffic?: boolean } = {}): Tracer {
  const traffic = options.traffic === true;
  const ctx = createSessionState({
    system: lave.system,
    saveStatus: "absent",
    saveSkipReason: "",
  });
  ctx.core.state = initFlightState(lave.layout);
  ctx.core.layout = lave.layout;
  ctx.core.config = lave.config;
  ctx.core.marketSeed = MARKET_SEED;
  // Traffic on wires the real inert populate over the committed NPC records,
  // as start-up does; traffic off keeps the default populator.
  if (traffic) {
    ctx.core.npcTraffic = committedTraffic();
  }
  const lifecycle = createWorldLifecycle({
    traffic,
    ...(traffic
      ? {
          populate: createInertPopulate(
            () => ctx.core.npcTraffic,
            () => ctx.core.layout,
          ),
        }
      : {}),
  });
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

describe("the launched event populates the world with traffic on (plan 12-08, tracer)", () => {
  it("holds twelve inert ships after the launch step, with the anchor at 113", () => {
    const { ctx, lifecycle, queue, step } = tracer({ traffic: true });
    queue.push(launch);
    step();
    expect(ctx.core.state?.mode).toBe("launching");
    const world = lifecycle.world;
    expect(world).toBeDefined();
    if (world === undefined) return;
    expect(liveEntityCount(world)).toBe(12);
    expect(world.store.nextId).toBe(113);
    expect(lifecycle.anchorNextEntityId).toBe(113);
  });

  it("keeps the twelve ships byte for byte across the launch and the flight that follows", () => {
    const { ctx, lifecycle, queue, step } = tracer({ traffic: true });
    queue.push(launch);
    step();
    const world = lifecycle.world;
    if (world === undefined) throw new Error("expected a world after launch");
    const section = snapshotWorld(world);
    for (let tick = 0; tick < 300; tick += 1) step();
    expect(ctx.core.state?.mode).toBe("inFlight");
    expect(lifecycle.world).toBe(world);
    expect(liveEntityCount(world)).toBe(12);
    expect(snapshotWorld(world)).toEqual(section);
  });

  it("gives the same script no entity, anchor 101 and an untouched world stream with traffic off", () => {
    const off = tracer();
    off.queue.push(launch);
    off.step();
    const world = off.lifecycle.world;
    const state = off.ctx.core.state;
    if (world === undefined || state === undefined) {
      throw new Error("expected a world and a state after launch");
    }
    expect(liveEntityCount(world)).toBe(0);
    expect(off.lifecycle.anchorNextEntityId).toBe(101);
    expect(world.rng.s).toBe(createWorld(worldSeedFor(MARKET_SEED, 1)).rng.s);
    expect(hashWorld(state, world)).toBe(hashFlight(state));
  });

  it("rebuilds the same twelve ships for the same script, and the epoch does not depend on traffic", () => {
    const on = tracer({ traffic: true });
    const again = tracer({ traffic: true });
    const off = tracer();
    for (const run of [on, again, off]) {
      run.queue.push(launch);
      run.step();
    }
    expect(on.lifecycle.epoch).toBe(off.lifecycle.epoch);
    const first = on.lifecycle.world;
    const second = again.lifecycle.world;
    if (first === undefined || second === undefined) {
      throw new Error("expected worlds after launch");
    }
    expect(snapshotWorld(second)).toEqual(snapshotWorld(first));
  });
});

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
      expect(spawned.ok && spawned.entity.id).toBe(101);
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

  it("refuses a non-finite seed without a RangeError: begin ends the world (WR-01), resume changes nothing", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -Infinity]) {
      const lifecycle = createWorldLifecycle({ traffic: false });
      lifecycle.begin(SEED_A);
      const world = lifecycle.world;
      expect(world).toBeDefined();
      // A refused resume leaves the installed world and the epoch alone.
      expect(() => {
        lifecycle.resume(bad);
      }).not.toThrow();
      expect(lifecycle.epoch).toBe(1);
      expect(lifecycle.world).toBe(world);
      // A refused begin ends the world and keeps the epoch (FOUND-17).
      expect(() => {
        lifecycle.begin(bad);
      }).not.toThrow();
      expect(lifecycle.epoch).toBe(1);
      expect(lifecycle.world).toBeUndefined();
      expect(lifecycle.anchorNextEntityId).toBeUndefined();
    }
  });

  it("saturates at the top of the saved epoch domain: one last begin succeeds, the next keeps the epoch and ends the world", () => {
    const lifecycle = createWorldLifecycle({ traffic: false });
    expect(lifecycle.resetForRestore(MAX_SAVE_EPOCH - 1)).toBe(true);
    lifecycle.begin(SEED_A);
    expect(lifecycle.epoch).toBe(MAX_SAVE_EPOCH);
    const world = lifecycle.world;
    expect(world?.worldSeed).toBe(worldSeedFor(SEED_A, MAX_SAVE_EPOCH));
    expect(() => {
      lifecycle.begin(SEED_A);
    }).not.toThrow();
    // The refused begin keeps the epoch and ends the world (FOUND-17).
    expect(lifecycle.epoch).toBe(MAX_SAVE_EPOCH);
    expect(lifecycle.world).toBeUndefined();
    expect(lifecycle.anchorNextEntityId).toBeUndefined();
  });

  it("a begin from the largest saved epoch refuses, so no live epoch is unwritable", () => {
    const lifecycle = createWorldLifecycle({ traffic: false });
    expect(lifecycle.resetForRestore(MAX_SAVE_EPOCH)).toBe(true);
    lifecycle.begin(SEED_A);
    expect(lifecycle.epoch).toBe(MAX_SAVE_EPOCH);
    expect(lifecycle.world).toBeUndefined();
    // Every epoch the lifecycle can hold is a legal v3 epoch (D-04).
    expect(lifecycle.epoch).toBeLessThanOrEqual(MAX_SAVE_EPOCH);
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

  it("restoreWorldAnchor sets the saved epoch and, in flight, rebuilds the anchor world without a bump", () => {
    const docked = createWorldLifecycle({ traffic: false });
    docked.begin(SEED_A);
    restoreWorldAnchor(docked, 5, SEED_A, false);
    expect(docked.epoch).toBe(5);
    expect(docked.world).toBeUndefined();
    docked.begin(SEED_A);
    expect(docked.epoch).toBe(6);

    const inFlight = createWorldLifecycle({ traffic: false });
    restoreWorldAnchor(inFlight, 5, SEED_A, true);
    expect(inFlight.epoch).toBe(5);
    expect(inFlight.world?.worldSeed).toBe(worldSeedFor(SEED_A, 5));

    // An in-flight restore without a resolved seed keeps no world.
    const unseeded = createWorldLifecycle({ traffic: false });
    restoreWorldAnchor(unseeded, 5, undefined, true);
    expect(unseeded.epoch).toBe(5);
    expect(unseeded.world).toBeUndefined();

    expect(() => {
      restoreWorldAnchor(undefined, 5, SEED_A, true);
    }).not.toThrow();
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
    expect(spawned.ok && spawned.entity.id).toBe(104);
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

  it("a refused resume leaves the anchor unchanged; a refused begin clears it (WR-01)", () => {
    const lifecycle = createWorldLifecycle({
      traffic: false,
      populate: populateThree,
    });
    lifecycle.begin(SEED);
    expect(lifecycle.anchorNextEntityId).toBe(104);
    lifecycle.resume(Number.NaN);
    expect(lifecycle.anchorNextEntityId).toBe(104);
    lifecycle.begin(Number.NaN);
    expect(lifecycle.anchorNextEntityId).toBeUndefined();
  });

  it("a saturated begin clears the anchor and the world and keeps the epoch (WR-01)", () => {
    const lifecycle = createWorldLifecycle({
      traffic: false,
      populate: populateThree,
    });
    expect(lifecycle.resetForRestore(MAX_SAVE_EPOCH - 1)).toBe(true);
    lifecycle.begin(SEED);
    expect(lifecycle.epoch).toBe(MAX_SAVE_EPOCH);
    expect(lifecycle.anchorNextEntityId).toBe(104);
    lifecycle.begin(SEED);
    expect(lifecycle.epoch).toBe(MAX_SAVE_EPOCH);
    expect(lifecycle.anchorNextEntityId).toBeUndefined();
    expect(lifecycle.world).toBeUndefined();
  });

  it("a begin refused at the maximum epoch ends a populated world and its anchor (FOUND-17)", () => {
    const lifecycle = createWorldLifecycle({
      traffic: false,
      populate: populateThree,
    });
    expect(lifecycle.resetForRestore(MAX_SAVE_EPOCH)).toBe(true);
    lifecycle.resume(SEED);
    expect(lifecycle.world).toBeDefined();
    expect(liveEntityCount(lifecycle.world ?? createWorld(0))).toBe(3);
    expect(lifecycle.anchorNextEntityId).toBe(104);
    lifecycle.begin(SEED);
    expect(lifecycle.world).toBeUndefined();
    expect(lifecycle.anchorNextEntityId).toBeUndefined();
    expect(lifecycle.epoch).toBe(MAX_SAVE_EPOCH);
  });

  it("a begin refused for a non-finite seed ends a populated world at a normal epoch (FOUND-17)", () => {
    const lifecycle = createWorldLifecycle({
      traffic: false,
      populate: populateThree,
    });
    lifecycle.begin(SEED);
    expect(lifecycle.world).toBeDefined();
    expect(lifecycle.epoch).toBe(1);
    lifecycle.begin(Number.NaN);
    expect(lifecycle.world).toBeUndefined();
    expect(lifecycle.anchorNextEntityId).toBeUndefined();
    expect(lifecycle.epoch).toBe(1);
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

  it("start-up creates the lifecycle from the parsed traffic flag before the restore branch, re-anchors at the saved epoch and then resumes an in-flight restore", () => {
    // startSession has no Node harness (it builds the renderer, HUD and
    // input), so its lifecycle points are pinned as ordered source facts; the
    // save-load browser specs exercise the in-flight Continue end to end.
    const source = readFileSync("src/app/session/start-session.ts", "utf8");
    const at = (needle: string, from = 0): number =>
      source.indexOf(needle, from);
    const parsed = at("ctx.runtime.testFlags = parseTestFlags(");
    const created = at("createWorldLifecycle({");
    const restoreBranch = at("if (restoring && restore !== undefined) {");
    const seed = at("ctx.core.marketSeed =\n");
    const reanchor = at("restoreWorldAnchor(");
    expect(parsed).toBeGreaterThan(-1);
    expect(created).toBeGreaterThan(parsed);
    expect(restoreBranch).toBeGreaterThan(created);
    expect(source.slice(created, created + 120)).toContain(
      "traffic: ctx.runtime.testFlags.traffic",
    );
    expect(seed).toBeGreaterThan(restoreBranch);
    expect(reanchor).toBeGreaterThan(seed);
    // The behaviour lives in restoreWorldAnchor (unit-tested below and shared
    // with the warm Load); here only the wiring is pinned.
    expect(source.slice(reanchor, reanchor + 160)).toContain("restore.epoch");
    expect(source.slice(reanchor, reanchor + 160)).toContain(
      "restoredInFlight",
    );
    expect(source.match(/createWorldLifecycle\(/g)).toHaveLength(1);
    expect(source.match(/restoreWorldAnchor\(/g)).toHaveLength(1);
    expect(source).not.toMatch(/worldLifecycle\?\.(resetForRestore|resume)\(/);
    expect(source).not.toContain("resetForRestore(0)");
  });
});

describe("session wiring of the inert populator (plan 12-08)", () => {
  const source = readFileSync("src/app/session/start-session.ts", "utf8");

  it("hands the lifecycle the traffic flag first and the inert populate second", () => {
    const created = source.indexOf("createWorldLifecycle({");
    expect(created).toBeGreaterThan(-1);
    const call = source.slice(created, created + 300);
    const traffic = call.indexOf("traffic: ctx.runtime.testFlags.traffic");
    const populate = call.indexOf("populate: createInertPopulate(");
    expect(traffic).toBeGreaterThan(-1);
    expect(populate).toBeGreaterThan(traffic);
    expect(source.match(/createInertPopulate\(/g)).toHaveLength(1);
    expect(call).toContain("() => ctx.core.npcTraffic");
    expect(call).toContain("() => ctx.core.layout");
  });

  it("loads the NPC catalogue once, only behind the traffic flag, in the boot Promise.all", () => {
    expect(source.match(/loadNpcCatalogue\(\)/g)).toHaveLength(1);
    const load = source.indexOf("loadNpcCatalogue()");
    expect(
      source.slice(Math.max(0, load - 80), load).replace(/\s+/g, " "),
    ).toContain("ctx.runtime.testFlags.traffic ?");
    const all = source.indexOf("await Promise.all([");
    const closed = source.indexOf("]);", all);
    expect(all).toBeGreaterThan(-1);
    expect(load).toBeGreaterThan(all);
    expect(load).toBeLessThan(closed);
    // The same failure surface as the other catalogues.
    expect(source.slice(closed, closed + 900)).toContain("showBootFailure");
    expect(source).toContain("ctx.core.npcTraffic =");
  });

  it("installs the layout before the anchor world is rebuilt", () => {
    const layout = source.indexOf("ctx.core.layout = systemLayout");
    const reanchor = source.indexOf("restoreWorldAnchor(");
    expect(layout).toBeGreaterThan(-1);
    expect(reanchor).toBeGreaterThan(layout);
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
  function arrivalHarness(
    failDestinationBuild = false,
    traffic = false,
  ): ArrivalHarness {
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
    // A world that exists at epoch 1, as after a launch from Lave. Traffic on
    // wires the real inert populate over the committed records, as start-up does.
    if (traffic) ctx.core.npcTraffic = committedTraffic();
    const real = createWorldLifecycle({
      traffic,
      ...(traffic
        ? {
            populate: createInertPopulate(
              () => ctx.core.npcTraffic,
              () => ctx.core.layout,
            ),
          }
        : {}),
    });
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
      closeChart: () => calls.push("closeChart"),
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

  const LIVE_IDS = Array.from({ length: 12 }, (_unused, index) => 101 + index);

  it("with traffic on an arrival repopulates the destination from id 101 with the same ships for the same route, seed and epoch (WORLD-14)", () => {
    const first = arrivalHarness(false, true);
    const second = arrivalHarness(false, true);
    const previousSeed = first.ctx.core.marketSeed ?? 0;
    const origin = first.lifecycle.world;
    if (origin === undefined) throw new Error("expected the Lave world");
    // The origin world holds its own 12 ships from the launch (leg anchor 113).
    expect(liveEntityCount(origin)).toBe(12);
    expect(first.lifecycle.anchorNextEntityId).toBe(113);

    first.controller.handleHyperspaceJumped(jumped);
    second.controller.handleHyperspaceJumped(jumped);

    const nextSeed = arrivalMarketSeed(destination?.id ?? "", previousSeed);
    const world = first.lifecycle.world;
    const twin = second.lifecycle.world;
    if (world === undefined || twin === undefined) {
      throw new Error("expected an arrival world");
    }
    expect(first.lifecycle.epoch).toBe(2);
    expect(world).not.toBe(origin);
    expect(world.worldSeed).toBe(worldSeedFor(nextSeed, 2));
    // The decisions: 12 ships, ids 101 to 112, counter 113 on both paths.
    expect(liveEntityCount(world)).toBe(12);
    expect(world.store.live.map((entity) => entity.id)).toEqual(LIVE_IDS);
    expect(world.store.nextId).toBe(113);
    expect(first.lifecycle.anchorNextEntityId).toBe(113);
    // Two identical sessions give the same world section, ships and ids.
    expect(serializeWorldSection(world)).toBe(serializeWorldSection(twin));
    // The world is the seed's world populated over the destination layout.
    const content = first.ctx.core.npcTraffic;
    if (content === undefined) throw new Error("expected traffic content");
    const expected = createWorld(worldSeedFor(nextSeed, 2));
    createInertPopulate(
      () => content,
      () => deriveSystemLayout(destination ?? lave.system, lave.stationDef),
    )(expected, { traffic: true });
    expect(serializeWorldSection(world)).toBe(serializeWorldSection(expected));
    // Not vacuous: the origin's ships are not the destination's.
    expect(serializeWorldSection(world)).not.toBe(
      serializeWorldSection(origin),
    );
  });

  it("with traffic off an arrival leaves an empty world, the counter at 101 and the world hash equal to the flight hash", () => {
    const { ctx, controller, lifecycle } = arrivalHarness();
    controller.handleHyperspaceJumped(jumped);
    const world = lifecycle.world;
    const state = ctx.core.state;
    if (world === undefined || state === undefined) {
      throw new Error("expected an arrival world and a state");
    }
    expect(liveEntityCount(world)).toBe(0);
    expect(lifecycle.anchorNextEntityId).toBe(101);
    expect(hashWorld(state, world)).toBe(hashFlight(state));
  });

  it("static bodies keep fixed ids and no second buoy is added (Pitfall 17)", () => {
    const { controller, lifecycle } = arrivalHarness(false, true);
    controller.handleHyperspaceJumped(jumped);
    const world = lifecycle.world;
    if (world === undefined) throw new Error("expected an arrival world");
    // The five static bodies are the fixed table, ids 1 to 5, the two buoys at 4 and 5.
    expect(world.statics).toBe(STATIC_ENTITIES);
    expect(world.statics.map((entry) => entry.id)).toEqual([1, 2, 3, 4, 5]);
    expect(
      world.statics
        .filter((entry) => entry.scanClass === "CLASS_BUOY")
        .map((entry) => [entry.id, entry.kind]),
    ).toEqual([
      [4, "buoy"],
      [5, "buoy"],
    ]);
    // Every dynamic entity lives at 101 or more, and none is a buoy.
    expect(liveEntityCount(world)).toBe(12);
    for (const entity of world.store.live) {
      expect(entity.id).toBeGreaterThanOrEqual(101);
      expect(entity.kind).not.toBe("buoy");
      expect(entity.scanClass).not.toBe("CLASS_BUOY");
    }
  });
});

/** The Diso chart row (the route of the jump-commit rows: dist 9, 36 fuel). */
const disoFound = galaxy.find((entry) => entry.name === "Diso");
if (disoFound === undefined) throw new Error("the galaxy has no Diso");
const diso: System = disoFound;

/**
 * Lave flight, 20 km from the station on +X: outside the station's blockage
 * radius (about 7,180 m) and, asserted per row, outside every placed ship's.
 */
const JUMP_POSITION = vec(
  lave.layout.station.position.x + 20_000,
  lave.layout.station.position.y,
  lave.layout.station.position.z,
);

/** The step options of a Lave jump to Diso, as the session builds them. */
const JUMP_OPTIONS = {
  hyperspace: {
    fuel: 70,
    origin: {
      id: lave.system.id,
      x: lave.system.chartX,
      y: lave.system.chartY,
    },
    target: { id: diso.id, x: diso.chartX, y: diso.chartY },
  },
} as const;

describe("jump commit clears the world on the same tick (WORLD-14)", () => {
  /** A pilot that keeps moving for the whole 1,800-step countdown. */
  function spawnPilot(
    world: ReturnType<typeof createWorld>,
    tick: number,
  ): ReturnType<typeof createWorld>["store"]["live"][number] {
    const result = spawnEntity(
      world,
      {
        kind: "ship",
        specKey: "test-ship",
        scanClass: "CLASS_NEUTRAL",
        position: vec(
          JUMP_POSITION.x + 100_000,
          JUMP_POSITION.y,
          JUMP_POSITION.z,
        ),
        orientation: identity(),
        radius: 50,
        speed: 100,
        ai: createTestPilotAi(tick, {
          scanRange: 1e9,
          holdRange: 1,
          cruiseSpeed: 100,
        }),
      },
      tick,
    );
    if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
    return result.entity;
  }

  function flyingAtJumpPosition(): ReturnType<typeof initFlightState> {
    const state = initFlightState(lave.layout);
    state.mode = "inFlight";
    state.dockArmed = false;
    state.position = JUMP_POSITION;
    return state;
  }

  it("does not step the old world on the step that emits hyperspaceJumped (same tick, sim level)", () => {
    const content = committedTraffic();
    const world = createWorld(worldSeedFor(MARKET_SEED, 1));
    createInertPopulate(
      () => content,
      () => lave.layout,
    )(world, { traffic: true });
    expect(liveEntityCount(world)).toBe(12);
    const pilot = spawnPilot(world, 0);
    expect(pilot.id).toBe(113);
    // The jump is not blocked by a placed ship (the field reads the same world).
    expect(
      createShipField(world, content.masses).blocks(
        JUMP_POSITION,
        lave.layout.scannerRange,
      ),
    ).toBe(false);

    const player = flyingAtJumpPosition();
    const options = {
      hyperspace: { ...JUMP_OPTIONS.hyperspace, shipMasses: content.masses },
    };
    const run = (commands: readonly Command[]): SimEvent[] =>
      stepSim(
        player,
        world,
        lave.layout,
        lave.config,
        ZERO_INTENT,
        commands,
        DT,
        options,
      );

    run([{ kind: "beginHyperspace" }]);
    expect(player.hyperspaceCountdown).toBe(HYPERSPACE_COUNTDOWN_STEPS);
    let jumpSteps = 0;
    for (let step = 1; step <= HYPERSPACE_COUNTDOWN_STEPS; step += 1) {
      const before = serializeEntity(pilot);
      const sectionBefore = serializeWorldSection(world);
      const events = run([]);
      const jumped = events.some((event) => event.kind === "hyperspaceJumped");
      if (jumped) {
        jumpSteps += 1;
        expect(step).toBe(HYPERSPACE_COUNTDOWN_STEPS);
        // The entity that would move is unchanged by the commit step, and so
        // is the whole world section.
        expect(serializeEntity(pilot)).toBe(before);
        expect(serializeWorldSection(world)).toBe(sectionBefore);
      } else {
        // Before the commit the pilot does move: the row is not vacuous.
        expect(serializeEntity(pilot)).not.toBe(before);
      }
    }
    expect(jumpSteps).toBe(1);
  });

  /**
   * The session path of one jump: the real sim driver (`stepOnce`), the real
   * router with the real hyperspace flow, and the real hyperspace controller
   * over a scene double, so the `hyperspaceJumped` handler runs in the same
   * `stepOnce` pass that emitted the event (sim-driver.ts: step, then dispatch).
   */
  function jumpSession(traffic: boolean) {
    const ctx = createSessionState({
      system: lave.system,
      saveStatus: "absent",
      saveSkipReason: "",
    });
    const state = flyingAtJumpPosition();
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
    ctx.core.hyperspaceTargetId = diso.id;
    if (traffic) ctx.core.npcTraffic = committedTraffic();
    const lifecycle = createWorldLifecycle({
      traffic,
      ...(traffic
        ? {
            populate: createInertPopulate(
              () => ctx.core.npcTraffic,
              () => ctx.core.layout,
            ),
          }
        : {}),
    });
    ctx.core.worldLifecycle = lifecycle;
    // The launch from Lave: epoch 1 and its world.
    lifecycle.begin(ctx.core.marketSeed);

    const quiet = (): void => undefined;
    const controller = createHyperspaceController(ctx, {
      scenes: {
        enterSystem: () =>
          ({}) as ReturnType<HyperspaceControllerDeps["scenes"]["enterSystem"]>,
        layout: () => deriveSystemLayout(diso, lave.stationDef),
      },
      galaxyById: new Map(galaxy.map((entry) => [entry.id, entry])),
      messages: { enqueue: quiet, enqueuePriority: quiet },
      faults: undefined,
      showBootFailure: quiet,
      publishFailure: quiet,
      autosave: quiet,
      syncEconomyProbe: quiet,
      closeChart: quiet,
    });
    const events: SimEvent[] = [];
    const real = createEventRouter(ctx, {
      stationFlow: quiet,
      hudMessages: quiet,
      dockFeedback: quiet,
      hyperspaceFlow: createHyperspaceFlow(ctx, {
        messages: { enqueuePriority: quiet },
        refusalCopy: controller.refusalCopy,
        handleHyperspaceJumped: controller.handleHyperspaceJumped,
      }),
    });
    const driver = createSimDriver(ctx, {
      pending: [],
      player: new PlayerController(),
      scripted: new ScriptedLaunchController(),
      launchSequence: { advance: () => "flash" },
      router: {
        dispatch: (event) => {
          events.push(event);
          real.dispatch(event);
        },
      },
      equipmentSet: () => new Set([DOCK_COMPUTER_KEY]),
      targetSystem: () => diso,
      autosave: quiet,
      markHookMutation: quiet,
    });
    const frame = { pitch: 0, roll: 0, speed: 0, precision: false };
    return {
      ctx,
      lifecycle,
      events,
      /** One fixed step through the driver, then the events it emitted. */
      step: (commands: readonly Command[] = []): SimEvent[] => {
        events.length = 0;
        driver.stepOnce(commands, frame);
        return [...events];
      },
    };
  }

  it("replaces the world in the same stepOnce pass: the old world is unreachable afterwards and the new one holds 101 to 112 (same tick, session level)", () => {
    const session = jumpSession(true);
    const { ctx, lifecycle, step } = session;
    const oldWorld = lifecycle.world;
    if (oldWorld === undefined) throw new Error("expected the Lave world");
    const pilot = spawnPilot(oldWorld, 0);
    const oldEntities = [...oldWorld.store.live];
    expect(oldEntities).toHaveLength(13);
    expect(
      createShipField(oldWorld, ctx.core.npcTraffic?.masses).blocks(
        JUMP_POSITION,
        lave.layout.scannerRange,
      ),
    ).toBe(false);

    step([{ kind: "beginHyperspace" }]);
    expect(ctx.core.state?.hyperspaceCountdown).toBe(
      HYPERSPACE_COUNTDOWN_STEPS,
    );
    // Up to the step before the commit the old world is the live one and moves.
    for (let count = 1; count < HYPERSPACE_COUNTDOWN_STEPS; count += 1) {
      const events = step();
      expect(events.some((event) => event.kind === "hyperspaceJumped")).toBe(
        false,
      );
    }
    expect(lifecycle.world).toBe(oldWorld);
    expect(lifecycle.epoch).toBe(1);
    const pilotBefore = serializeEntity(pilot);
    const sectionBefore = serializeWorldSection(oldWorld);

    // The commit step: one stepOnce pass emits the event and handles it.
    const commit = step();
    expect(commit.filter((event) => event.kind === "hyperspaceJumped")).toEqual(
      [
        {
          kind: "hyperspaceJumped",
          destinationId: diso.id,
          clockDeltaSeconds: 46_656,
          fuelCost: 36,
        },
      ],
    );
    // The old world was not stepped on the commit tick.
    expect(serializeEntity(pilot)).toBe(pilotBefore);
    expect(serializeWorldSection(oldWorld)).toBe(sectionBefore);

    // After that one step the session holds only the new world.
    const next = lifecycle.world;
    if (next === undefined) throw new Error("expected the arrival world");
    expect(next).not.toBe(oldWorld);
    expect(lifecycle.epoch).toBe(2);
    for (const entity of next.store.live) {
      expect(oldEntities).not.toContain(entity);
    }
    expect(next.store.live.map((entity) => entity.id)).toEqual(
      Array.from({ length: 12 }, (_unused, index) => 101 + index),
    );
    expect(lifecycle.anchorNextEntityId).toBe(113);
    expect(ctx.core.system.id).toBe(diso.id);

    // The next step steps only the new world: the old one never changes again.
    step();
    expect(lifecycle.world).toBe(next);
    expect(serializeEntity(pilot)).toBe(pilotBefore);
    expect(serializeWorldSection(oldWorld)).toBe(sectionBefore);
  });

  it("with traffic off the commit step leaves an empty world at 101 whose hash is the flight hash", () => {
    const { ctx, lifecycle, step } = jumpSession(false);
    const oldWorld = lifecycle.world;
    step([{ kind: "beginHyperspace" }]);
    for (let count = 1; count < HYPERSPACE_COUNTDOWN_STEPS; count += 1) step();
    expect(lifecycle.world).toBe(oldWorld);
    step();
    const next = lifecycle.world;
    const state = ctx.core.state;
    if (next === undefined || state === undefined) {
      throw new Error("expected an arrival world and a state");
    }
    expect(next).not.toBe(oldWorld);
    expect(lifecycle.epoch).toBe(2);
    expect(liveEntityCount(next)).toBe(0);
    expect(lifecycle.anchorNextEntityId).toBe(101);
    expect(hashWorld(state, next)).toBe(hashFlight(state));
  });
});

/** A populator that spawns one ship (init shape as the leg-anchor cases). */
const spawnOne: Populate = (world) => {
  spawnEntity(
    world,
    {
      kind: "ship",
      specKey: "viper",
      scanClass: "CLASS_POLICE",
      position: vec(10, 0, 0),
      orientation: identity(),
      radius: 1,
    },
    0,
  );
};

/** Counters of a save written with no world lifecycle behind it (epoch 0). */
const NO_COUNTERS: SaveWorldCounters = {
  epoch: 0,
  anchorNextEntityId: undefined,
};

/** The blob of a Lave save, docked or in flight, with the fixture market. */
function laveBlob(
  mode: "docked" | "inFlight",
  counters: SaveWorldCounters,
): string {
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
      counters,
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
function loadHarness(
  options: {
    readonly hook?: boolean;
    readonly populate?: Populate;
    /** Traffic on: the real inert populate over the committed NPC records. */
    readonly traffic?: boolean;
  } = {},
): LoadHarness {
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

  const traffic = options.traffic === true;
  if (traffic) ctx.core.npcTraffic = committedTraffic();
  const real = createWorldLifecycle({
    traffic,
    ...(traffic
      ? {
          populate: createInertPopulate(
            () => ctx.core.npcTraffic,
            () => ctx.core.layout,
          ),
        }
      : options.populate === undefined
        ? {}
        : { populate: options.populate }),
  });
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

  /**
   * The session that wrote the save: epoch 4 after earlier legs, then a fresh
   * Lave arrival (begin bumps to epoch 5 and builds the anchor world).
   */
  function arrivalAtEpoch5(populate?: Populate): WorldLifecycle {
    const writer = createWorldLifecycle({
      traffic: false,
      ...(populate === undefined ? {} : { populate }),
    });
    expect(writer.resetForRestore(4)).toBe(true);
    writer.begin(MARKET_SEED_LAVE);
    expect(writer.epoch).toBe(5);
    return writer;
  }

  /** The cold Continue of start-session.ts for a parsed save (shared function). */
  function coldContinue(raw: string, populate?: Populate): WorldLifecycle {
    const parsed = parseSave(raw, SAVE_ALLOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("the save did not parse");
    const cold = createWorldLifecycle({
      traffic: false,
      ...(populate === undefined ? {} : { populate }),
    });
    // The same function start-session.ts calls for the cold Continue.
    restoreWorldAnchor(
      cold,
      parsed.save.epoch,
      MARKET_SEED_LAVE,
      parsed.save.mode !== "docked",
    );
    return cold;
  }

  it("an in-flight Load of a save written at epoch 5 restores the fresh arrival's world: seed, snapshot, hash and counter", async () => {
    const arrival = arrivalAtEpoch5();
    const raw = laveBlob("inFlight", arrival);
    expect(raw).toContain('"epoch":5');
    expect(raw).toContain('"nextEntityId":101');
    const h = loadHarness();
    h.read.current = { kind: "ok", raw };
    const before = h.lifecycle.world;

    await h.controller.loadFromSave();

    // The call order: installs first, then the re-anchor, then the resume.
    const reset = h.log.indexOf("worldLifecycle.resetForRestore 5");
    const resume = h.log.indexOf(
      `worldLifecycle.resume ${String(MARKET_SEED_LAVE)}`,
    );
    expect(h.log.indexOf("install marketSeed")).toBeGreaterThan(-1);
    expect(reset).toBeGreaterThan(h.log.indexOf("install marketSeed"));
    expect(resume).toBe(reset + 1);
    expect(h.log.filter((entry) => entry.startsWith("worldLifecycle"))).toEqual(
      [
        "worldLifecycle.resetForRestore 5",
        `worldLifecycle.resume ${String(MARKET_SEED_LAVE)}`,
      ],
    );

    const warm = h.lifecycle;
    expect(warm.epoch).toBe(5);
    expect(warm.world).toBeDefined();
    expect(warm.world).not.toBe(before);
    expect(warm.world?.worldSeed).toBe(worldSeedFor(MARKET_SEED_LAVE, 5));
    expect(warm.world?.worldSeed).toBe(arrival.world?.worldSeed);
    expect(warm.anchorNextEntityId).toBe(101);

    const warmWorld = warm.world;
    const arrivalWorld = arrival.world;
    if (warmWorld === undefined || arrivalWorld === undefined) return;
    expect(snapshotWorld(warmWorld)).toEqual(snapshotWorld(arrivalWorld));
    const state = h.ctx.core.state;
    if (state === undefined) return;
    expect(hashWorld(state, warmWorld)).toBe(hashWorld(state, arrivalWorld));

    // The cold Continue of the same blob gives the same epoch, seed, snapshot.
    const cold = coldContinue(raw);
    expect(cold.epoch).toBe(5);
    expect(cold.world?.worldSeed).toBe(warmWorld.worldSeed);
    expect(cold.anchorNextEntityId).toBe(101);
    if (cold.world === undefined) return;
    expect(snapshotWorld(cold.world)).toEqual(snapshotWorld(warmWorld));

    // The next arrival gives epoch 6 and one seed on every path.
    warm.begin(ARRIVAL_SEED);
    cold.begin(ARRIVAL_SEED);
    arrival.begin(ARRIVAL_SEED);
    expect(warm.epoch).toBe(6);
    expect(cold.epoch).toBe(6);
    expect(arrival.epoch).toBe(6);
    expect(warm.world?.worldSeed).toBe(worldSeedFor(ARRIVAL_SEED, 6));
    expect(cold.world?.worldSeed).toBe(warm.world?.worldSeed);
    expect(arrival.world?.worldSeed).toBe(warm.world?.worldSeed);
  });

  it("with a populator that spawns one ship the saved counter is 102 and the restored world hash differs from the flight hash", async () => {
    const arrival = arrivalAtEpoch5(spawnOne);
    const raw = laveBlob("inFlight", arrival);
    expect(raw).toContain('"nextEntityId":102');
    const h = loadHarness({ populate: spawnOne });
    h.read.current = { kind: "ok", raw };

    await h.controller.loadFromSave();

    const warm = h.lifecycle;
    expect(warm.epoch).toBe(5);
    expect(warm.anchorNextEntityId).toBe(102);
    expect(warm.world?.store.nextId).toBe(102);
    const warmWorld = warm.world;
    const arrivalWorld = arrival.world;
    const state = h.ctx.core.state;
    if (
      warmWorld === undefined ||
      arrivalWorld === undefined ||
      state === undefined
    )
      return;
    const restoredHash = hashWorld(state, warmWorld);
    // Not vacuous: the world section is part of the hash.
    expect(restoredHash).not.toBe(hashFlight(state));
    expect(restoredHash).toBe(hashWorld(state, arrivalWorld));
    expect(snapshotWorld(warmWorld)).toEqual(snapshotWorld(arrivalWorld));

    const cold = coldContinue(raw, spawnOne);
    expect(cold.epoch).toBe(5);
    expect(cold.anchorNextEntityId).toBe(102);
    expect(cold.world?.worldSeed).toBe(warmWorld.worldSeed);
    if (cold.world === undefined) return;
    expect(hashWorld(state, cold.world)).toBe(restoredHash);
  });

  it("regenerates the same world after resetForRestore and resume as begin built, with anchor 113 (SAVE-08)", () => {
    const content = committedTraffic();
    const lifecycle = createWorldLifecycle({
      traffic: true,
      populate: createInertPopulate(
        () => content,
        () => lave.layout,
      ),
    });
    expect(lifecycle.resetForRestore(4)).toBe(true);
    lifecycle.begin(MARKET_SEED_LAVE);
    expect(lifecycle.epoch).toBe(5);
    const built = lifecycle.world;
    if (built === undefined) throw new Error("expected the built world");
    // The text of A is taken before B exists: the rebuild must equal it.
    const builtSection = serializeWorldSection(built);
    expect(lifecycle.anchorNextEntityId).toBe(113);

    expect(lifecycle.resetForRestore(5)).toBe(true);
    expect(lifecycle.world).toBeUndefined();
    lifecycle.resume(MARKET_SEED_LAVE);
    const rebuilt = lifecycle.world;
    if (rebuilt === undefined) throw new Error("expected the rebuilt world");
    expect(rebuilt).not.toBe(built);
    expect(lifecycle.epoch).toBe(5);
    expect(lifecycle.anchorNextEntityId).toBe(113);
    expect(liveEntityCount(rebuilt)).toBe(12);
    expect(serializeWorldSection(rebuilt)).toBe(builtSection);
  });

  it("an in-flight Load of a traffic-on save restores the fresh arrival's twelve ships, and the cold Continue agrees", async () => {
    const content = committedTraffic();
    const populate = createInertPopulate(
      () => content,
      () => lave.layout,
    );
    const arrival = createWorldLifecycle({ traffic: true, populate });
    expect(arrival.resetForRestore(4)).toBe(true);
    arrival.begin(MARKET_SEED_LAVE);
    const raw = laveBlob("inFlight", arrival);
    expect(raw).toContain('"epoch":5');
    expect(raw).toContain('"nextEntityId":113');
    const h = loadHarness({ traffic: true });
    h.read.current = { kind: "ok", raw };

    await h.controller.loadFromSave();

    const warm = h.lifecycle;
    expect(warm.epoch).toBe(5);
    expect(warm.anchorNextEntityId).toBe(113);
    const warmWorld = warm.world;
    const arrivalWorld = arrival.world;
    if (warmWorld === undefined || arrivalWorld === undefined) {
      throw new Error("expected warm and arrival worlds");
    }
    expect(liveEntityCount(warmWorld)).toBe(12);
    expect(serializeWorldSection(warmWorld)).toBe(
      serializeWorldSection(arrivalWorld),
    );

    // The cold Continue of the same blob (the shared re-anchor function).
    const parsed = parseSave(raw, SAVE_ALLOW);
    if (!parsed.ok) throw new Error("the save did not parse");
    const cold = createWorldLifecycle({ traffic: true, populate });
    restoreWorldAnchor(cold, parsed.save.epoch, MARKET_SEED_LAVE, true);
    expect(cold.anchorNextEntityId).toBe(parsed.save.nextEntityId);
    if (cold.world === undefined) throw new Error("expected a cold world");
    expect(serializeWorldSection(cold.world)).toBe(
      serializeWorldSection(warmWorld),
    );
  });

  it("a counter that differs never blocks a Load: a traffic-off save loads with traffic on and regenerates 113", async () => {
    // Written by a session with traffic off: the leg anchor is 101.
    const raw = laveBlob("inFlight", arrivalAtEpoch5());
    expect(raw).toContain('"nextEntityId":101');
    const h = loadHarness({ traffic: true });
    h.read.current = { kind: "ok", raw };

    await h.controller.loadFromSave();

    expect(h.lifecycle.epoch).toBe(5);
    expect(h.lifecycle.world).toBeDefined();
    expect(h.lifecycle.world && liveEntityCount(h.lifecycle.world)).toBe(12);
    expect(h.lifecycle.anchorNextEntityId).toBe(113);
  });

  it("a docked Load of a save written at epoch 5 restores epoch 5 with no world, and the next launch gives epoch 6", async () => {
    const writer = arrivalAtEpoch5();
    writer.end();
    const raw = laveBlob("docked", writer);
    expect(raw).toContain('"epoch":5');
    const h = loadHarness();
    h.read.current = { kind: "ok", raw };

    await h.controller.loadFromSave();

    expect(h.log.filter((entry) => entry.startsWith("worldLifecycle"))).toEqual(
      ["worldLifecycle.resetForRestore 5"],
    );
    expect(h.lifecycle.epoch).toBe(5);
    expect(h.lifecycle.world).toBeUndefined();
    expect(h.lifecycle.anchorNextEntityId).toBeUndefined();

    const cold = coldContinue(raw);
    expect(cold.epoch).toBe(5);
    expect(cold.world).toBeUndefined();
    expect(cold.anchorNextEntityId).toBeUndefined();

    // The next launch: epoch 6 and one seed on warm, cold and the writer.
    h.lifecycle.begin(MARKET_SEED_LAVE);
    cold.begin(MARKET_SEED_LAVE);
    writer.begin(MARKET_SEED_LAVE);
    expect(h.lifecycle.epoch).toBe(6);
    expect(cold.epoch).toBe(6);
    expect(writer.epoch).toBe(6);
    expect(h.lifecycle.world?.worldSeed).toBe(
      worldSeedFor(MARKET_SEED_LAVE, 6),
    );
    expect(cold.world?.worldSeed).toBe(h.lifecycle.world?.worldSeed);
    expect(writer.world?.worldSeed).toBe(h.lifecycle.world?.worldSeed);
    expect(h.lifecycle.world?.store.nextId).toBe(101);
  });

  it("a v2 save, which has no epoch, restores at epoch 0 and launches at epoch 1", async () => {
    const v2 = JSON.parse(laveBlob("docked", NO_COUNTERS)) as Record<
      string,
      unknown
    >;
    v2.version = 2;
    delete v2.epoch;
    delete v2.nextEntityId;
    const h = loadHarness();
    h.read.current = { kind: "ok", raw: JSON.stringify(v2) };

    await h.controller.loadFromSave();

    expect(h.log.filter((entry) => entry.startsWith("worldLifecycle"))).toEqual(
      ["worldLifecycle.resetForRestore 0"],
    );
    expect(h.lifecycle.epoch).toBe(0);
    expect(h.lifecycle.world).toBeUndefined();

    h.lifecycle.begin(MARKET_SEED_LAVE);
    expect(h.lifecycle.epoch).toBe(1);
    expect(h.lifecycle.world?.worldSeed).toBe(
      worldSeedFor(MARKET_SEED_LAVE, 1),
    );
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
    h.read.current = {
      kind: "ok",
      raw: laveBlob("inFlight", NO_COUNTERS),
    };

    await h.controller.loadFromSave();

    expect(h.log.indexOf("bindTestHook")).toBeGreaterThan(
      h.log.indexOf("install state"),
    );
  });
});

describe("anchored save: only the epoch and the anchor counter of the world enter the save", () => {
  /** The exact v3 allow-lists (SaveInputs and the encoded SaveV3). */
  const INPUT_KEYS = [
    "cargo",
    "clockSeconds",
    "credits",
    "epoch",
    "equipment",
    "flight",
    "fuel",
    "market",
    "marketSeed",
    "missiles",
    "mode",
    "nextEntityId",
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
    "epoch",
    "nextEntityId",
    "market",
    "marketSeed",
    "targetSystem",
    "flight",
  ];
  const WORLD_KEYS = [
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
    expect(pilot.ok && pilot.entity.id).toBe(101);
    expect(world.store.nextId).toBe(102);
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
    // The epoch of the lifecycle and the anchor counter, not the live counter.
    expect(withWorld.epoch).toBe(3);
    expect(withWorld.nextEntityId).toBe(101);
    expect(encoded).toContain('"epoch":3');
    expect(encoded).toContain('"nextEntityId":101');

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
    "src/app/session/traffic.ts",
  ];

  it("every import of world-lifecycle.ts, step-options.ts and traffic.ts resolves under src/sim or is an import type from src/content/types", () => {
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
