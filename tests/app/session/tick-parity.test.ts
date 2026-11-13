// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Tick parity and the sim hook (Phase 8, plan 08-16; D-09, D-13; FOUND-14;
 * success criterion 5).
 *
 * Node only. The real sim driver, router, hyperspace controller, world
 * lifecycle and probe publisher run over a fake session context, and the result
 * is compared with the pure Node replay of tests/helpers/tick-script.ts, which
 * the Playwright spec compares with the browser. The expected values are the
 * replay's and `hashFlight`'s, never the driver's own output run twice: with no
 * populator the world is empty, so `hashWorld` must equal `hashFlight` there (D-08)
 * and a pair of runs cannot agree on the same wrong value.
 *
 * Scope honesty (RESEARCH Pattern 10): this proves tick control, the shared
 * `StepOptions` and the lifecycle's epoch bumps and world creation, not the
 * determinism of a populated world; that is proven in plans 08-11 and 08-13.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type {
  WegoliteProbe,
  WegoliteSaveProbe,
} from "../../../src/app/probe.js";
import { createRedrawGate } from "../../../src/app/redraw-gate.js";
import type { RedrawGate } from "../../../src/app/redraw-gate.js";
import { createSessionState } from "../../../src/app/session/context.js";
import type { SessionState } from "../../../src/app/session/context.js";
import {
  createEventRouter,
  createHyperspaceFlow,
} from "../../../src/app/session/event-router.js";
import { createHyperspaceController } from "../../../src/app/session/hyperspace-controller.js";
import type { HyperspaceControllerDeps } from "../../../src/app/session/hyperspace-controller.js";
import { createProbePublisher } from "../../../src/app/session/probe-publisher.js";
import type { ProbePublisher } from "../../../src/app/session/probe-publisher.js";
import { createSimDriver } from "../../../src/app/session/sim-driver.js";
import type { SimDriver } from "../../../src/app/session/sim-driver.js";
import { parseTestFlags } from "../../../src/app/session/test-flags.js";
import { createWorldLifecycle } from "../../../src/app/session/world-lifecycle.js";
import type { WorldLifecycle } from "../../../src/app/session/world-lifecycle.js";
import type { System } from "../../../src/content/types.js";
import type { KeyboardInputSource } from "../../../src/input/keyboard.js";
import { createMessageQueue } from "../../../src/render/hud/messages.js";
import type { Command } from "../../../src/sim/commands.js";
import {
  arrivalMarketSeed,
  generateMarket,
  marketSeedForSystem,
} from "../../../src/sim/economy/market.js";
import {
  PlayerController,
  ScriptedLaunchController,
} from "../../../src/sim/flight/controller.js";
import { hashFlight, initFlightState } from "../../../src/sim/flight/state.js";
import { identity, vec } from "../../../src/sim/math.js";
import { worldSeedFor } from "../../../src/sim/rng.js";
import { hashWorld } from "../../../src/sim/world/serialize.js";
import { deriveSystemLayout } from "../../../src/sim/world/layout.js";
import { liveEntityCount, spawnEntity } from "../../../src/sim/world/world.js";
import { commoditiesFixture } from "../../helpers/commodities.js";
import { laveDockGeometry } from "../../helpers/dock-pose.js";
import { laveFixture } from "../../helpers/lave.js";
import { sessionSourceFiles } from "../../helpers/session-source.js";
import { runTickScript } from "../../helpers/tick-script.js";

const lave = laveFixture();
const catalogue = commoditiesFixture();
const LEESTI_ID = "g0-s55";

const galaxy = JSON.parse(
  readFileSync(
    new URL("../../../src/content/generated/systems/g0.json", import.meta.url),
    "utf8",
  ),
) as System[];
const galaxyById = new Map(galaxy.map((entry) => [entry.id, entry]));
const leesti = galaxyById.get(LEESTI_ID);
if (leesti === undefined) throw new Error(`the galaxy has no ${LEESTI_ID}`);

const launch: Command = { kind: "launch" };
const LAVE_SEED = marketSeedForSystem(lave.system.id);

interface Session {
  readonly ctx: SessionState;
  readonly driver: SimDriver;
  readonly pending: Command[];
  readonly lifecycle: WorldLifecycle;
  readonly probe: WegoliteProbe;
  readonly gate: RedrawGate;
  readonly publisher: ProbePublisher;
}

/**
 * A docked Lave New game over the real driver, router, lifecycle and probe
 * publisher; `search` is parsed exactly as the session parses the URL.
 */
function session(search: string): Session {
  const ctx = createSessionState({
    system: lave.system,
    saveStatus: "absent",
    saveSkipReason: "",
  });
  ctx.core.state = initFlightState(lave.layout);
  ctx.core.layout = lave.layout;
  ctx.core.config = lave.config;
  ctx.core.dockGeometry = laveDockGeometry();
  ctx.core.stationDef = lave.stationDef;
  ctx.core.commodities = catalogue;
  ctx.core.marketSeed = LAVE_SEED;
  ctx.core.market = generateMarket(lave.system, catalogue, LAVE_SEED);
  ctx.runtime.testFlags = parseTestFlags(search);
  const lifecycle = createWorldLifecycle({
    traffic: ctx.runtime.testFlags.traffic,
  });
  ctx.core.worldLifecycle = lifecycle;
  ctx.runtime.input = {
    drainCommands: () => [],
    frame: () => ({ pitch: 0, roll: 0, speed: 0, precision: false }),
  } as unknown as KeyboardInputSource;

  const pending: Command[] = [];
  const messages = createMessageQueue(4);
  const quiet = (): void => undefined;
  // The driver and the publisher need each other; bind late.
  const bound: { publisher?: ProbePublisher } = {};

  // The real hyperspace controller (for the scripted jump case); its scene
  // manager double installs the destination layout it is asked for.
  let entered: System = lave.system;
  const controllerDeps: HyperspaceControllerDeps = {
    scenes: {
      enterSystem: (system) => {
        entered = system;
        return {} as ReturnType<
          HyperspaceControllerDeps["scenes"]["enterSystem"]
        >;
      },
      layout: () => deriveSystemLayout(entered, lave.stationDef),
    },
    galaxyById,
    messages,
    faults: undefined,
    showBootFailure: quiet,
    publishFailure: quiet,
    autosave: quiet,
    syncEconomyProbe: quiet,
  };
  const controller = createHyperspaceController(ctx, controllerDeps);

  const driver = createSimDriver(ctx, {
    pending,
    player: new PlayerController(),
    scripted: new ScriptedLaunchController(),
    launchSequence: { advance: () => "flash" },
    router: createEventRouter(ctx, {
      stationFlow: quiet,
      hudMessages: quiet,
      dockFeedback: quiet,
      hyperspaceFlow: createHyperspaceFlow(ctx, {
        messages,
        refusalCopy: controller.refusalCopy,
        handleHyperspaceJumped: controller.handleHyperspaceJumped,
      }),
    }),
    equipmentSet: () => new Set(ctx.core.profile.equipment),
    targetSystem: () => controller.targetSystem(),
    autosave: quiet,
    markHookMutation: () => {
      bound.publisher?.markHookMutation();
    },
  });

  const probe = {} as WegoliteProbe;
  const gate = createRedrawGate();
  const saveProbe = {
    status: "absent",
    attempts: 0,
    writes: 0,
    committed: 0,
    revision: 0,
    lastClock: null,
    continueVisible: false,
    skipReason: "",
    unavailable: false,
  } satisfies WegoliteSaveProbe;
  const renderer = {
    info: {
      render: { calls: 0, triangles: 0, frame: 0 },
      memory: { geometries: 0, textures: 0 },
      programs: [],
    },
  };
  const publisher = createProbePublisher(ctx, {
    probe,
    renderer: renderer as never,
    scenes: { quality: () => "standard" },
    saveProbe,
    redrawGate: gate,
    messages,
    commitProfile: () => false,
    swapSystem: () => Promise.resolve(),
    disposeSystem: () => undefined,
    advanceTicks: (n) => driver.advanceTicks(n),
  });
  bound.publisher = publisher;
  return { ctx, driver, pending, lifecycle, probe, gate, publisher };
}

/** The state and the live world of a session, hashed the way the hook does. */
function sessionHash(s: Session): string {
  const state = s.ctx.core.state;
  if (state === undefined) throw new Error("the session has no state");
  return hashWorld(state, s.lifecycle.world);
}

/** The launch-and-fly script: a launch on the first tick, then 600 more. */
const LAUNCH_AND_FLY = [
  { commands: [launch], ticks: 1 },
  { commands: [], ticks: 600 },
] as const;

/** Let a gate settle on the current keys so its next decision is observable. */
function settle(gate: RedrawGate, keys: readonly unknown[]): void {
  while (gate.next(true, keys)) gate.drawn(keys);
}

describe("tick parity with the Node replay (success criterion 5)", () => {
  it("advanceTicks(1) then advanceTicks(600) gives the replay's hash, which is hashFlight (D-08)", () => {
    const s = session("?test=1&clock=manual");
    s.pending.push(launch);

    expect(s.driver.advanceTicks(1)).toBe(1);
    expect(s.ctx.core.state?.mode).toBe("launching");
    expect(s.driver.advanceTicks(600)).toBe(601);
    expect(s.ctx.core.state?.mode).toBe("inFlight");

    const replay = runTickScript(LAUNCH_AND_FLY);
    const state = s.ctx.core.state;
    if (state === undefined) throw new Error("no state");
    expect(replay.state.tick).toBe(state.tick);
    expect(replay.state.mode).toBe(state.mode);
    expect(sessionHash(s)).toBe(replay.hash);
    // No NPC exists, so the world hash is the flight hash on both sides.
    expect(replay.hash).toBe(hashFlight(replay.state));
    expect(sessionHash(s)).toBe(hashFlight(state));
    expect(s.lifecycle.epoch).toBe(1);
    expect(replay.epoch).toBe(1);
    const world = s.lifecycle.world;
    if (world === undefined) throw new Error("no world after the launch");
    expect(liveEntityCount(world)).toBe(0);
  });

  it("601 single-tick calls match the replay's per-tick trace, naming the first diverging tick", () => {
    const s = session("?test=1&clock=manual");
    s.pending.push(launch);
    const replay = runTickScript(LAUNCH_AND_FLY, { trace: true });
    const trace = replay.trace;
    if (trace === undefined) throw new Error("no trace");
    expect(trace).toHaveLength(601);

    const driven: string[] = [];
    for (let tick = 0; tick < 601; tick += 1) {
      s.driver.advanceTicks(1);
      driven.push(sessionHash(s));
    }
    const firstDivergence = driven.findIndex(
      (value, index) => value !== trace[index],
    );
    expect(
      firstDivergence,
      `the first diverging tick is ${String(firstDivergence + 1)}`,
    ).toBe(-1);
    // The final value equals the single-call result.
    const single = session("?test=1&clock=manual");
    single.pending.push(launch);
    single.driver.advanceTicks(1);
    single.driver.advanceTicks(600);
    expect(driven[600]).toBe(sessionHash(single));
  });

  it("a scripted jump under advanceTicks bumps the epoch on launch and arrival and recreates the world", () => {
    const s = session("?test=1&clock=manual");
    const state = s.ctx.core.state;
    if (state === undefined) throw new Error("no state");
    expect(s.lifecycle.epoch).toBe(0);
    expect(s.lifecycle.world).toBeUndefined();

    s.pending.push(launch);
    s.driver.advanceTicks(1);
    expect(s.lifecycle.epoch).toBe(1);
    expect(s.lifecycle.world?.worldSeed).toBe(worldSeedFor(LAVE_SEED, 1));

    s.pending.push({ kind: "skipLaunch" });
    s.driver.advanceTicks(1);
    expect(state.mode).toBe("inFlight");
    // Move clear of the station's mass lock (the blockage is checked at the
    // commit only), as the recorded hyperspace flight does.
    state.position = vec(1e7, 0, 0);
    s.driver.advanceTicks(30);

    s.ctx.core.hyperspaceTargetId = LEESTI_ID;
    s.pending.push({ kind: "beginHyperspace" });
    s.driver.advanceTicks(1);
    expect(state.hyperspaceCountdown).toBeGreaterThan(0);
    const worldBefore = s.lifecycle.world;
    expect(s.lifecycle.epoch).toBe(1);

    for (let guard = 0; guard < 2400 && s.ctx.core.lastJump === null;) {
      s.driver.advanceTicks(1);
      guard += 1;
    }
    expect(s.ctx.core.lastJump?.destinationId).toBe(LEESTI_ID);
    expect(s.ctx.core.system).toBe(leesti);

    const arrivalSeed = arrivalMarketSeed(LEESTI_ID, LAVE_SEED);
    expect(s.ctx.core.marketSeed).toBe(arrivalSeed);
    expect(s.lifecycle.epoch).toBe(2);
    expect(s.lifecycle.world).not.toBe(worldBefore);
    expect(s.lifecycle.world?.worldSeed).toBe(worldSeedFor(arrivalSeed, 2));
    expect(s.lifecycle.world?.store.nextId).toBe(101);
    expect(hashWorld(state, s.lifecycle.world)).toBe(hashFlight(state));
  });
});

describe("the sim hook reads live objects (G-8)", () => {
  function spawnInto(world: ReturnType<typeof liveWorld>): void {
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
      0,
    );
    expect(spawned?.id).toBe(101);
  }

  function liveWorld(lifecycle: WorldLifecycle) {
    const world = lifecycle.world;
    if (world === undefined) throw new Error("no world");
    return world;
  }

  it("worldHash hashes the replaced state and world, and neither taints nor requests a redraw", () => {
    const s = session("?test=1");
    const first = s.ctx.core.state;
    if (first === undefined) throw new Error("no state");
    s.lifecycle.begin(LAVE_SEED);
    s.publisher.bindTestHook(first);
    const hook = s.probe.test;
    if (hook === undefined) throw new Error("no hook");
    const oldHash = hook.worldHash();
    expect(oldHash).toBe(hashWorld(first, s.lifecycle.world));

    // Replace the state and the world, and spawn into the new world.
    const second = initFlightState(lave.layout);
    second.speed = 11;
    s.ctx.core.state = second;
    s.lifecycle.begin(LAVE_SEED);
    spawnInto(liveWorld(s.lifecycle));
    const keys = [second];
    settle(s.gate, keys);
    expect(s.gate.next(true, keys)).toBe(false);

    const next = hook.worldHash();

    expect(next).toBe(hashWorld(second, s.lifecycle.world));
    expect(next).not.toBe(oldHash);
    expect(s.ctx.runtime.testTainted).toBe(false);
    expect(s.gate.next(true, keys)).toBe(false);
  });

  it("a mutation still taints after createTestHook gained its sim parameter", () => {
    const s = session("?test=1");
    const state = s.ctx.core.state;
    if (state === undefined) throw new Error("no state");
    s.publisher.bindTestHook(state);
    const keys = [state];
    settle(s.gate, keys);

    s.probe.test?.setSpeed(42);

    expect(state.speed).toBe(42);
    expect(s.ctx.runtime.testTainted).toBe(true);
    expect(s.gate.next(true, keys)).toBe(true);
  });

  it("under plain ?test=1 advanceTicks is a function that refuses: no step, no taint, no redraw", () => {
    const s = session("?test=1");
    const state = s.ctx.core.state;
    if (state === undefined) throw new Error("no state");
    s.publisher.bindTestHook(state);
    const hook = s.probe.test;
    expect(typeof hook?.advanceTicks).toBe("function");
    expect(typeof hook?.worldHash).toBe("function");
    const keys = [state];
    settle(s.gate, keys);
    const tickBefore = state.tick;

    expect(hook?.advanceTicks(5)).toBe(tickBefore);
    expect(hook?.advanceTicks(100000)).toBe(tickBefore);

    expect(state.tick).toBe(tickBefore);
    expect(s.ctx.runtime.testTainted).toBe(false);
    expect(s.gate.next(true, keys)).toBe(false);
  });

  it("under the manual clock advanceTicks steps through the hook and taints", () => {
    const s = session("?test=1&clock=manual");
    const state = s.ctx.core.state;
    if (state === undefined) throw new Error("no state");
    s.publisher.bindTestHook(state);

    expect(s.probe.test?.advanceTicks(5)).toBe(5);

    expect(state.tick).toBe(5);
    expect(s.ctx.runtime.testTainted).toBe(true);
  });

  it("a retained hook returns the empty sentinel after dispose and without a state", () => {
    const s = session("?test=1");
    const state = s.ctx.core.state;
    if (state === undefined) throw new Error("no state");
    s.publisher.bindTestHook(state);
    const hook = s.probe.test;
    if (hook === undefined) throw new Error("no hook");
    expect(hook.worldHash()).toMatch(/^[0-9a-f]{8}$/);

    s.ctx.runtime.disposed = true;
    expect(() => hook.worldHash()).not.toThrow();
    expect(hook.worldHash()).toBe("");

    s.ctx.runtime.disposed = false;
    s.ctx.core.state = undefined;
    expect(() => hook.worldHash()).not.toThrow();
    expect(hook.worldHash()).toBe("");
  });
});

describe("probe.sim", () => {
  it("publishes primitives only, never a reference into the world, and is immune to mutation", () => {
    const s = session("?test=1&clock=manual&traffic=1");
    const state = s.ctx.core.state;
    if (state === undefined) throw new Error("no state");
    s.lifecycle.begin(LAVE_SEED);
    const world = s.lifecycle.world;
    if (world === undefined) throw new Error("no world");
    spawnEntity(
      world,
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
    s.publisher.bindTestHook(state);

    s.publisher.updateProbe();

    const sim = s.probe.sim;
    if (sim === undefined) throw new Error("no probe.sim");
    expect(sim).toEqual({
      tick: 0,
      epoch: 1,
      entities: 1,
      worldLive: true,
      traffic: true,
      clock: "manual",
    });
    expect(typeof sim.entities).toBe("number");
    for (const value of Object.values(sim)) {
      expect(["number", "boolean", "string"]).toContain(typeof value);
    }

    const hashBefore = s.probe.test?.worldHash();
    sim.entities = 999;
    expect(liveEntityCount(world)).toBe(1);
    expect(s.probe.test?.worldHash()).toBe(hashBefore);
    s.probe.sim = {
      tick: -1,
      epoch: -1,
      entities: -1,
      worldLive: false,
      traffic: false,
      clock: "realtime",
    };
    expect(liveEntityCount(world)).toBe(1);
    expect(s.probe.test?.worldHash()).toBe(hashBefore);
  });

  it("reports the flags, and no world while docked", () => {
    const s = session("?test=1");
    s.publisher.updateProbe();
    expect(s.probe.sim).toEqual({
      tick: 0,
      epoch: 0,
      entities: 0,
      worldLive: false,
      traffic: false,
      clock: "realtime",
    });

    const plain = session("?clock=manual&traffic=0");
    plain.publisher.updateProbe();
    expect(plain.probe.sim?.clock).toBe("realtime");
    expect(plain.probe.sim?.traffic).toBe(true);
  });

  it("is absent without a state and withdrawn by withdrawProbe", () => {
    const s = session("?test=1");
    s.publisher.updateProbe();
    expect(s.probe.sim).toBeDefined();

    s.ctx.core.state = undefined;
    s.publisher.updateProbe();
    expect(s.probe.sim).toBeUndefined();

    s.ctx.core.state = initFlightState(lave.layout);
    s.publisher.updateProbe();
    expect(s.probe.sim).toBeDefined();
    s.publisher.withdrawProbe();
    expect(s.probe.sim).toBeUndefined();
  });

  it("the session sources keep exactly five redraw requests", () => {
    let requests = 0;
    for (const file of sessionSourceFiles()) {
      const text = readFileSync(file, "utf8");
      requests += text.split("redrawGate.request();").length - 1;
    }
    expect(requests).toBe(5);
  });
});
