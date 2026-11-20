// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The probe publisher against a fake session context (Phase 8, D-12 step 2,
 * G-8).
 *
 * Node only, no DOM, no WebGL: a real `SessionState` from `createSessionState`,
 * a plain probe object, a renderer double that exposes the counters the
 * publisher reads, and the real redraw gate and message queue. The publisher
 * must read every live field through `ctx` at each call and must keep the
 * `?test=1` hook pointed at the live flight state.
 */

import { readFileSync } from "node:fs";

import type * as THREE from "three";
import { describe, expect, it } from "vitest";

import { buildHudModel } from "../../../src/app/hud-model.js";
import { createRedrawGate } from "../../../src/app/redraw-gate.js";
import type { RedrawGate } from "../../../src/app/redraw-gate.js";
import { createSessionState } from "../../../src/app/session/context.js";
import type { SessionState } from "../../../src/app/session/context.js";
import { createProbePublisher } from "../../../src/app/session/probe-publisher.js";
import type { ProbePublisher } from "../../../src/app/session/probe-publisher.js";
import type {
  WegoliteProbe,
  WegoliteSaveProbe,
} from "../../../src/app/probe.js";
import { trafficContent } from "../../../src/app/session/traffic.js";
import type { NpcShip } from "../../../src/content/types.js";
import {
  TEST_ATTACKER_DISTANCE,
  TEST_FLYER_DISTANCE,
} from "../../../src/sim/ai/test-spawn.js";
import { MAX_ENTITIES } from "../../../src/sim/world/ids.js";
import type { Hud } from "../../../src/render/hud/hud.js";
import { createMessageQueue } from "../../../src/render/hud/messages.js";
import type { MessageQueue } from "../../../src/render/hud/messages.js";
import type { WorldLifecycle } from "../../../src/app/session/world-lifecycle.js";
import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { stepFlight } from "../../../src/sim/flight/step.js";
import { identity, length, rotate, sub, vec } from "../../../src/sim/math.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT } from "../../../src/sim/time.js";
import { hashWorld } from "../../../src/sim/world/serialize.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { fullHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";
import { realNpcFlightTable } from "../../helpers/npc-flight.js";
import { realNpcWeapons } from "../../helpers/npc-weapons.js";

const { system, layout, config } = laveFixture();

interface Harness {
  readonly ctx: SessionState;
  readonly probe: WegoliteProbe;
  readonly saveProbe: WegoliteSaveProbe;
  readonly gate: RedrawGate;
  readonly messages: MessageQueue;
  readonly publisher: ProbePublisher;
  readonly renderer: { info: { render: { frame: number } } };
}

function harness(): Harness {
  const ctx = createSessionState({
    system,
    saveStatus: "absent",
    saveSkipReason: "",
  });
  // The publisher assigns probe fields and reads only `test`; a plain object
  // stands in for the page's probe.
  const probe = {} as WegoliteProbe;
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
      render: { calls: 3, triangles: 12, frame: 7 },
      memory: { geometries: 4, textures: 5 },
      programs: [{}, {}],
    },
  };
  const gate = createRedrawGate();
  const messages = createMessageQueue();
  const publisher = createProbePublisher(ctx, {
    probe,
    renderer: renderer as unknown as THREE.WebGLRenderer,
    scenes: { quality: () => "standard" },
    saveProbe,
    redrawGate: gate,
    messages,
    commitProfile: () => false,
    swapSystem: () => Promise.resolve(),
    disposeSystem: () => undefined,
    advanceTicks: () => 0,
    launchSequence: preRoll,
  });
  return { ctx, probe, saveProbe, gate, messages, publisher, renderer };
}

/** The launch pre-roll the publisher reads (quick 261118-os8); reset per test. */
const preRoll = { preRolling: false, preRollElapsed: 0 };

describe("launch pre-roll fields (quick 261118-os8)", () => {
  it("publishes preRolling and preRollElapsed, false and 0 when idle, with the sim mode unchanged", () => {
    preRoll.preRolling = false;
    preRoll.preRollElapsed = 0;
    const { ctx, probe, publisher } = harness();
    ctx.core.layout = layout;
    ctx.core.state = initFlightState(layout);
    publisher.updateProbe();
    expect(probe.launch.preRolling).toBe(false);
    expect(probe.launch.preRollElapsed).toBe(0);
    preRoll.preRolling = true;
    preRoll.preRollElapsed = 0.75;
    publisher.updateProbe();
    expect(probe.launch.preRolling).toBe(true);
    expect(probe.launch.preRollElapsed).toBe(0.75);
    expect(probe.mode).toBe("docked");
    preRoll.preRolling = false;
    preRoll.preRollElapsed = 0;
  });
});

describe("updateProbe", () => {
  it("publishes paused, the system id, the chart camera and the message depth", () => {
    const { ctx, probe, messages, publisher } = harness();
    ctx.runtime.paused = true;
    ctx.chart.chartOpen = true;
    const spanX = 56;
    ctx.chart.chartCamera = { centre: { x: 12, y: 34 }, spanX };
    messages.enqueue("first", 4);
    messages.enqueue("second", 4);

    publisher.updateProbe();

    expect(probe.paused).toBe(true);
    expect(probe.systemId).toBe(system.id);
    expect(probe.quality).toBe("standard");
    expect(probe.chart?.open).toBe(true);
    expect(probe.chart?.camera.centre).toEqual({ x: 12, y: 34 });
    expect(probe.chart?.camera.spanX).toBe(spanX);
    expect(probe.chart?.camera.spanY).toBe(2 * spanX);
    expect(probe.messages).toBe(2);
    expect(probe.calls).toBe(3);
    expect(probe.triangles).toBe(12);
    expect(probe.renders).toBe(7);
    expect(probe.memory).toEqual({ geometries: 4, textures: 5, programs: 2 });
  });

  it("reads the live context at every call, never a copy from construction", () => {
    const { ctx, probe, messages, publisher } = harness();
    publisher.updateProbe();
    expect(probe.paused).toBe(false);
    expect(probe.messages).toBe(0);
    expect(probe.chart?.targetId).toBeUndefined();

    ctx.runtime.paused = true;
    ctx.core.system = { ...system, id: "g0-s9" };
    ctx.core.hyperspaceTargetId = "g0-s3";
    ctx.core.state = initFlightState(layout);
    messages.enqueue("late", 4);
    publisher.updateProbe();

    expect(probe.paused).toBe(true);
    expect(probe.systemId).toBe("g0-s9");
    expect(probe.chart?.targetId).toBe("g0-s3");
    expect(probe.hyperspace?.targetId).toBe("g0-s3");
    expect(probe.mode).toBe("docked");
    expect(probe.messages).toBe(1);
  });

  it("withdrawProbe removes the hook, save and Save/Load screen probes", () => {
    const { probe, publisher, saveProbe } = harness();
    probe.save = saveProbe;
    publisher.updateProbe();
    publisher.bindTestHook(initFlightState(layout));
    expect(probe.test).toBeDefined();
    expect(probe.saveScreen).toBeDefined();

    publisher.withdrawProbe();

    expect(probe.test).toBeUndefined();
    expect(probe.save).toBeUndefined();
    expect(probe.saveScreen).toBeUndefined();
  });
});

describe("bindTestHook", () => {
  it("a hook rebound to a replaced FlightState mutates only the new object and taints", () => {
    const { ctx, probe, gate, publisher } = harness();
    const stateA = initFlightState(layout);
    const stateB = initFlightState(layout);
    const speedBefore = stateA.speed;
    expect(stateB.speed).toBe(speedBefore);

    publisher.bindTestHook(stateA);
    publisher.bindTestHook(stateB);
    expect(ctx.runtime.testTainted).toBe(false);

    // Let the gate settle, then prove the mutate callback asks for a redraw.
    const keys = [stateB];
    while (gate.next(true, keys)) gate.drawn(keys);
    expect(gate.next(true, keys)).toBe(false);

    probe.test?.setSpeed(42);

    expect(stateB.speed).toBe(42);
    expect(stateA.speed).toBe(speedBefore);
    expect(ctx.runtime.testTainted).toBe(true);
    expect(probe.test?.tainted).toBe(true);
    expect(gate.next(true, keys)).toBe(true);
  });

  it("updateProbe mirrors the session taint onto the hook", () => {
    const { ctx, probe, publisher } = harness();
    publisher.bindTestHook(initFlightState(layout));
    expect(probe.test?.tainted).toBe(false);

    ctx.runtime.testTainted = true;
    publisher.updateProbe();

    expect(probe.test?.tainted).toBe(true);
  });

  it("a rejected mutation changes nothing and does not taint", () => {
    const { ctx, probe, publisher } = harness();
    const state = initFlightState(layout);
    const speedBefore = state.speed;
    publisher.bindTestHook(state);

    probe.test?.setSpeed(Number.NaN);

    expect(state.speed).toBe(speedBefore);
    expect(ctx.runtime.testTainted).toBe(false);
    expect(probe.test?.tainted).toBe(false);
  });
});

describe("syncSaveProbe", () => {
  it("publishes the committed revision, never the requested one", () => {
    const { ctx, saveProbe, publisher } = harness();
    ctx.save.saveRevision = 9;
    ctx.save.saveCommittedRevision = 4;
    ctx.save.saveAttempts = 5;
    ctx.save.saveWrites = 3;
    ctx.save.saveCommitted = 2;
    ctx.save.saveScreenNotice = "Saved";

    publisher.syncSaveProbe();

    expect(saveProbe.revision).toBe(4);
    expect(saveProbe.attempts).toBe(5);
    expect(saveProbe.writes).toBe(3);
    expect(saveProbe.committed).toBe(2);
    expect(saveProbe.notice).toBe("Saved");
  });
});

describe("syncEconomyProbe", () => {
  it("publishes nothing until a market and its seed exist", () => {
    const { probe, publisher } = harness();
    publisher.syncEconomyProbe();
    expect(probe.economy).toBeUndefined();
    expect(probe.station).toBeUndefined();
  });
});

describe("worldHash and the combat state (plan 13-11)", () => {
  it("hashes the live combat state when it is not pristine, and as the flight hash while it is", () => {
    const { ctx, probe, publisher } = harness();
    const state = initFlightState(layout);
    ctx.core.state = state;
    publisher.bindTestHook(state);
    const hook = probe.test;
    if (hook === undefined) throw new Error("no hook");

    // No combat state yet, then a pristine one: both are the flight hash.
    expect(hook.worldHash()).toBe(hashWorld(state, undefined));
    ctx.core.combat = createPlayerCombatState();
    expect(hook.worldHash()).toBe(hashWorld(state, undefined));
    expect(hook.worldHash()).toBe(hashWorld(state, undefined, undefined));

    // A shot shield changes the hash, read live (nothing captured).
    ctx.core.combat.fwdShield = 100;
    const damaged = hook.worldHash();
    expect(damaged).toBe(hashWorld(state, undefined, ctx.core.combat));
    expect(damaged).not.toBe(hashWorld(state, undefined));
    expect(ctx.runtime.testTainted).toBe(false);

    // A Load installs a fresh state: the hook follows the live one.
    ctx.core.combat = createPlayerCombatState();
    expect(hook.worldHash()).toBe(hashWorld(state, undefined));
  });
});

/** A launched, parked player in flight (the hook works only in flight). */
function flyingState(): FlightState {
  const state = initFlightState(layout);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "skipLaunch" }], DT);
  state.position = vec(1e7, 0, 0);
  state.orientation = identity();
  state.speed = 0;
  return state;
}

/** The live lifecycle as far as the publisher reads it: its world. */
function lifecycleOf(world: World): WorldLifecycle {
  return { world, epoch: 1 } as unknown as WorldLifecycle;
}

const VIPER_RECORD = {
  key: "viper",
  roles: ["police"],
  scanClass: "CLASS_POLICE",
  radius: 30,
  maxEnergy: 100,
  energyRechargeRate: 2,
};

/** The traffic content as far as the hook reads it: the populator records. */
function trafficOf(
  records: readonly (typeof VIPER_RECORD)[],
): SessionState["core"]["npcTraffic"] {
  return {
    catalogue: [],
    records,
    masses: [],
    flight: [],
    weapons: new Map(),
    laserColors: new Map(),
  };
}

describe("probe.combat (plan 13-14)", () => {
  it("publishes the view, the banks and the current facing's laser temperature as values", () => {
    const { ctx, probe, publisher } = harness();
    ctx.core.state = initFlightState(layout);
    const combat = createPlayerCombatState();
    combat.view = "aft";
    combat.fwdShield = 100;
    combat.aftShield = 90;
    combat.energy = 200;
    combat.cabinTemp = 70;
    combat.laserTemp.fore = 3;
    combat.laserTemp.aft = 9;
    ctx.core.combat = combat;

    publisher.updateProbe();

    expect(probe.combat).toEqual({
      view: "aft",
      fwdShield: 100,
      aftShield: 90,
      energy: 200,
      laserTemp: 9,
      cabinTemp: 70,
      identLocked: false,
    });
  });

  it("reads the live combat state at every call and is absent without one", () => {
    const { ctx, probe, publisher } = harness();
    publisher.updateProbe();
    expect(probe.combat).toBeUndefined();

    ctx.core.combat = createPlayerCombatState();
    publisher.updateProbe();
    expect(probe.combat?.fwdShield).toBe(128);

    ctx.core.combat.fwdShield = 64;
    publisher.updateProbe();
    expect(probe.combat?.fwdShield).toBe(64);

    ctx.core.combat = undefined;
    publisher.updateProbe();
    expect(probe.combat).toBeUndefined();
  });

  it("flags a live lock without ever publishing the locked entity's id", () => {
    const { ctx, probe, publisher } = harness();
    // The snapshot reads the layout (plan 18-06: a static lock's live pose).
    ctx.core.layout = layout;
    ctx.core.state = initFlightState(layout);
    const world = createWorld(7);
    const spawned = spawnEntity(
      world,
      {
        kind: "ship",
        specKey: "viper",
        scanClass: "CLASS_POLICE",
        position: vec(0, 0, -1_000),
        orientation: identity(),
        radius: 30,
      },
      0,
    );
    if (!spawned.ok) throw new Error("spawn refused");
    ctx.core.worldLifecycle = lifecycleOf(world);
    const combat = createPlayerCombatState();
    combat.identTarget = spawned.entity.id;
    ctx.core.combat = combat;

    publisher.updateProbe();

    expect(probe.combat?.identLocked).toBe(true);
    expect(Object.keys(probe.combat ?? {}).sort()).toEqual([
      "aftShield",
      "cabinTemp",
      "energy",
      "fwdShield",
      "identLocked",
      "laserTemp",
      "view",
    ]);
    expect(JSON.stringify(probe.combat)).not.toContain(
      String(spawned.entity.id),
    );

    // A lock on a ship that is gone is no lock.
    spawned.entity.dead = true;
    publisher.updateProbe();
    expect(probe.combat?.identLocked).toBe(false);
  });

  it("withdrawProbe removes it with the rest of the test surface", () => {
    const { ctx, probe, publisher } = harness();
    ctx.core.combat = createPlayerCombatState();
    publisher.updateProbe();
    expect(probe.combat).toBeDefined();

    publisher.withdrawProbe();

    expect(probe.combat).toBeUndefined();
  });
});

describe("the spawnTestShooter hook (plan 13-14, T-13-27)", () => {
  function inFlightHarness() {
    const h = harness();
    const state = flyingState();
    const world = createWorld(7);
    h.ctx.core.state = state;
    h.ctx.core.worldLifecycle = lifecycleOf(world);
    h.ctx.core.npcTraffic = trafficOf([VIPER_RECORD]);
    h.publisher.bindTestHook(state);
    const hook = h.probe.test;
    if (hook === undefined) throw new Error("no hook");
    return { ...h, state, world, hook };
  }

  it("spawns one Viper 1,500 m ahead facing the player and taints the session", () => {
    const { ctx, state, world, hook } = inFlightHarness();
    expect(ctx.runtime.testTainted).toBe(false);

    expect(hook.spawnTestShooter()).toBe(true);

    expect(ctx.runtime.testTainted).toBe(true);
    expect(hook.tainted).toBe(true);
    expect(world.store.live).toHaveLength(1);
    const shooter = world.store.live[0];
    expect(shooter?.specKey).toBe("viper");
    expect(
      length(sub(shooter?.position ?? state.position, state.position)),
    ).toBeCloseTo(1_500, 6);
    const nose = rotate(shooter?.orientation ?? identity(), vec(0, 0, -1));
    expect(nose.z).toBeCloseTo(1, 9);
  });

  it("asks the redraw gate for a frame, as every other hook mutation does", () => {
    const { gate, state, hook } = inFlightHarness();
    const keys = [state];
    while (gate.next(true, keys)) gate.drawn(keys);
    expect(gate.next(true, keys)).toBe(false);

    hook.spawnTestShooter();

    expect(gate.next(true, keys)).toBe(true);
  });

  it("refuses without touching anything outside flight, a world, traffic content or a viper record", () => {
    const refusals: [
      string,
      (h: ReturnType<typeof inFlightHarness>) => void,
    ][] = [
      ["docked", (h) => void (h.state.mode = "docked")],
      ["launching", (h) => void (h.state.mode = "launching")],
      ["no world", (h) => void (h.ctx.core.worldLifecycle = undefined)],
      ["no traffic content", (h) => void (h.ctx.core.npcTraffic = undefined)],
      [
        "no viper record",
        (h) =>
          void (h.ctx.core.npcTraffic = trafficOf([
            { ...VIPER_RECORD, key: "adder" },
          ])),
      ],
      ["disposed", (h) => void (h.ctx.runtime.disposed = true)],
    ];
    for (const [name, arrange] of refusals) {
      const h = inFlightHarness();
      arrange(h);

      expect(h.hook.spawnTestShooter(), name).toBe(false);

      expect(h.ctx.runtime.testTainted, name).toBe(false);
      expect(h.hook.tainted, name).toBe(false);
      expect(h.world.store.live, name).toHaveLength(0);
    }
  });

  it("is refused once the session state is gone", () => {
    const { ctx, hook, world } = inFlightHarness();
    ctx.core.state = undefined;

    expect(hook.spawnTestShooter()).toBe(false);
    expect(world.store.live).toHaveLength(0);
  });
});

describe("the spawnTestFlyers hook (plan 14-18, T-14-29)", () => {
  const FLYER_CATALOGUE = JSON.parse(
    readFileSync("src/content/generated/ships-npc.json", "utf8"),
  ) as NpcShip[];

  function flyersHarness(catalogue: readonly NpcShip[] = FLYER_CATALOGUE) {
    const h = harness();
    const state = flyingState();
    const world = createWorld(7);
    h.ctx.core.state = state;
    h.ctx.core.layout = layout;
    h.ctx.core.worldLifecycle = lifecycleOf(world);
    h.ctx.core.npcTraffic = trafficContent(catalogue);
    h.publisher.bindTestHook(state);
    const hook = h.probe.test;
    if (hook === undefined) throw new Error("no hook");
    return { ...h, state, world, hook };
  }

  it("spawns the Shuttle, the Viper and the Adder with flight-script AIs, taints the session first and returns true", () => {
    const { ctx, state, world, hook } = flyersHarness();
    expect(ctx.runtime.testTainted).toBe(false);

    expect(hook.spawnTestFlyers()).toBe(true);

    expect(ctx.runtime.testTainted).toBe(true);
    expect(hook.tainted).toBe(true);
    expect(world.store.live.map((entity) => entity.specKey)).toEqual([
      "shuttle",
      "viper",
      "adder",
    ]);
    expect(
      world.store.live.map((entity) => entity.ai?.params["script"]),
    ).toEqual(["station", "intercept", "flee"]);
    for (const flyer of world.store.live) {
      expect(flyer.ai?.aiKey).toBe("flight-script");
      expect(length(sub(flyer.position, state.position))).toBeCloseTo(
        TEST_FLYER_DISTANCE,
        6,
      );
    }
  });

  it("hands the content's flight table to the spawner: each flyer starts at its compiled maximum speed", () => {
    const { world, hook } = flyersHarness();

    hook.spawnTestFlyers();

    const speeds = world.store.live.map((entity) => entity.speed);
    const compiled = ["shuttle", "viper", "adder"].map(
      (key) => FLYER_CATALOGUE.find((ship) => ship.key === key)?.maxFlightSpeed,
    );
    expect(speeds).toEqual(compiled);
  });

  it("points the station flyer's nose at the station centre of the live layout", () => {
    const { world, hook } = flyersHarness();

    hook.spawnTestFlyers();

    const shuttle = world.store.live[0];
    if (shuttle === undefined) throw new Error("no shuttle");
    const nose = rotate(shuttle.orientation, vec(0, 0, -1));
    const toStation = sub(layout.station.position, shuttle.position);
    const along = length(toStation);
    expect(
      nose.x * toStation.x + nose.y * toStation.y + nose.z * toStation.z,
    ).toBeCloseTo(along, 3);
  });

  it("asks the redraw gate for a frame, as every other hook mutation does", () => {
    const { gate, state, hook } = flyersHarness();
    const keys = [state];
    while (gate.next(true, keys)) gate.drawn(keys);
    expect(gate.next(true, keys)).toBe(false);

    hook.spawnTestFlyers();

    expect(gate.next(true, keys)).toBe(true);
  });

  it("refuses without touching anything outside flight, a world, a layout, traffic content, the three hulls or while disposed", () => {
    const refusals: [string, (h: ReturnType<typeof flyersHarness>) => void][] =
      [
        ["docked", (h) => void (h.state.mode = "docked")],
        ["launching", (h) => void (h.state.mode = "launching")],
        ["no world", (h) => void (h.ctx.core.worldLifecycle = undefined)],
        ["no layout", (h) => void (h.ctx.core.layout = undefined)],
        ["no traffic content", (h) => void (h.ctx.core.npcTraffic = undefined)],
        [
          "no adder record",
          (h) =>
            void (h.ctx.core.npcTraffic = trafficContent(
              FLYER_CATALOGUE.filter((ship) => ship.key !== "adder"),
            )),
        ],
        ["disposed", (h) => void (h.ctx.runtime.disposed = true)],
      ];
    for (const [name, arrange] of refusals) {
      const h = flyersHarness();
      arrange(h);

      expect(h.hook.spawnTestFlyers(), name).toBe(false);

      expect(h.ctx.runtime.testTainted, name).toBe(false);
      expect(h.hook.tainted, name).toBe(false);
      expect(h.world.store.live, name).toHaveLength(0);
    }
  });

  it("is refused once the session state is gone", () => {
    const { ctx, hook, world } = flyersHarness();
    ctx.core.state = undefined;

    expect(hook.spawnTestFlyers()).toBe(false);
    expect(world.store.live).toHaveLength(0);
  });

  it("returns false and leaves the session tainted when the world has no room for three, spawning nothing", () => {
    const h = flyersHarness();
    for (let i = 0; i < MAX_ENTITIES - 2; i += 1) {
      const filler = spawnEntity(
        h.world,
        {
          kind: "ship",
          specKey: "viper",
          scanClass: "CLASS_NEUTRAL",
          position: vec(0, 0, 0),
          orientation: identity(),
          radius: 30,
          maxEnergy: 100,
        },
        0,
      );
      if (!filler.ok) throw new Error(`filler refused: ${filler.reason}`);
    }
    const before = h.world.store.live.length;

    expect(h.hook.spawnTestFlyers()).toBe(false);

    expect(h.world.store.live).toHaveLength(before);
    expect(h.ctx.runtime.testTainted).toBe(true);
  });

  it("returns false after a partial spawn, keeps the earlier ship and leaves the session tainted (T-14-29)", () => {
    const broken = FLYER_CATALOGUE.map((ship) =>
      ship.key === "viper" ? { ...ship, maxEnergy: Number.NaN } : ship,
    );
    const h = flyersHarness(broken);

    expect(h.hook.spawnTestFlyers()).toBe(false);

    // The Shuttle spawned before the Viper was refused: a tainted state.
    expect(h.world.store.live.map((entity) => entity.specKey)).toEqual([
      "shuttle",
    ]);
    expect(h.ctx.runtime.testTainted).toBe(true);
    h.publisher.updateProbe();
    expect(h.hook.tainted).toBe(true);
  });

  it("publishes no entity id: the probe and the hook's return are values only", () => {
    const h = flyersHarness();

    const result = h.hook.spawnTestFlyers();
    h.publisher.updateProbe();

    expect(typeof result).toBe("boolean");
    expect(JSON.stringify(h.probe)).not.toMatch(/"(entityId|ids?)"\s*:/);
  });
});

describe("the spawnTestAttacker hook (plan 17-10, D-02, T-17-24)", () => {
  function attackerHarness() {
    const h = harness();
    const state = flyingState();
    const world = createWorld(7);
    h.ctx.core.state = state;
    h.ctx.core.worldLifecycle = lifecycleOf(world);
    h.ctx.core.npcTraffic = trafficOf([VIPER_RECORD]);
    h.publisher.bindTestHook(state);
    const hook = h.probe.test;
    if (hook === undefined) throw new Error("no hook");
    return { ...h, state, world, hook };
  }

  it("spawns one Viper 3,000 m ahead with the attack AI and the fire opt-in, taints the session and returns true", () => {
    const { ctx, state, world, hook } = attackerHarness();
    expect(ctx.runtime.testTainted).toBe(false);

    expect(hook.spawnTestAttacker()).toBe(true);

    expect(ctx.runtime.testTainted).toBe(true);
    expect(hook.tainted).toBe(true);
    expect(world.store.live).toHaveLength(1);
    const attacker = world.store.live[0];
    expect(attacker?.specKey).toBe("viper");
    expect(
      length(sub(attacker?.position ?? state.position, state.position)),
    ).toBeCloseTo(TEST_ATTACKER_DISTANCE, 6);
    expect(attacker?.ai?.aiKey).toBe("flight-script");
    expect(attacker?.ai?.params["script"]).toBe("attack");
    expect(attacker?.ai?.params["fire"]).toBe(true);
    const nose = rotate(attacker?.orientation ?? identity(), vec(0, 0, -1));
    expect(nose.z).toBeCloseTo(1, 9);
  });

  it("taints before it touches the world", () => {
    const { ctx, world, hook } = attackerHarness();
    let taintedAtSpawn: boolean | undefined;
    const original = world.store.live;
    Object.defineProperty(world.store, "live", {
      get() {
        taintedAtSpawn ??= ctx.runtime.testTainted;
        return original;
      },
    });

    hook.spawnTestAttacker();

    // The first read of the live list during the call sees the taint already set.
    expect(taintedAtSpawn).toBe(true);
  });

  it("asks the redraw gate for a frame, as every other hook mutation does", () => {
    const { gate, state, hook } = attackerHarness();
    const keys = [state];
    while (gate.next(true, keys)) gate.drawn(keys);
    expect(gate.next(true, keys)).toBe(false);

    hook.spawnTestAttacker();

    expect(gate.next(true, keys)).toBe(true);
  });

  it("refuses without touching anything outside flight, a world, traffic content or a viper record", () => {
    const refusals: [
      string,
      (h: ReturnType<typeof attackerHarness>) => void,
    ][] = [
      ["docked", (h) => void (h.state.mode = "docked")],
      ["launching", (h) => void (h.state.mode = "launching")],
      ["no world", (h) => void (h.ctx.core.worldLifecycle = undefined)],
      ["no traffic content", (h) => void (h.ctx.core.npcTraffic = undefined)],
      [
        "no viper record",
        (h) =>
          void (h.ctx.core.npcTraffic = trafficOf([
            { ...VIPER_RECORD, key: "adder" },
          ])),
      ],
      ["disposed", (h) => void (h.ctx.runtime.disposed = true)],
    ];
    for (const [name, arrange] of refusals) {
      const h = attackerHarness();
      arrange(h);

      expect(h.hook.spawnTestAttacker(), name).toBe(false);

      expect(h.ctx.runtime.testTainted, name).toBe(false);
      expect(h.hook.tainted, name).toBe(false);
      expect(h.world.store.live, name).toHaveLength(0);
    }
  });

  it("is refused once the session state is gone", () => {
    const { ctx, hook, world } = attackerHarness();
    ctx.core.state = undefined;

    expect(hook.spawnTestAttacker()).toBe(false);
    expect(world.store.live).toHaveLength(0);
  });

  it("publishes no entity id: the probe and the hook's return are values only", () => {
    const h = attackerHarness();

    const result = h.hook.spawnTestAttacker();
    h.publisher.updateProbe();

    expect(typeof result).toBe("boolean");
    expect(JSON.stringify(h.probe)).not.toMatch(/"(entityId|ids?)"\s*:/);
  });

  it("the hook-spawned attacker fires through the gate: its laser shots are at least a beam period (13 ticks) apart and the player's shield falls", () => {
    const { state, world, hook } = attackerHarness();
    const combat = createPlayerCombatState();
    expect(hook.spawnTestAttacker()).toBe(true);
    const attacker = world.store.live[0];
    if (attacker === undefined) throw new Error("no attacker");
    const options = {
      npcFlight: realNpcFlightTable(),
      combat: {
        mounts: DEFAULT_LASER_MOUNTS,
        hulls: fullHullTable(),
        npcWeapons: realNpcWeapons(),
      },
    };

    const shotTicks: number[] = [];
    let shieldFell = false;
    for (let i = 0; i < 3_600; i += 1) {
      const events = stepSim(
        state,
        world,
        layout,
        config,
        ZERO_INTENT,
        [],
        DT,
        options,
        combat,
      );
      for (const event of events) {
        if (event.kind === "laserFired" && event.shooter === attacker.id) {
          shotTicks.push(state.tick);
        }
      }
      if (combat.fwdShield < 128 || combat.aftShield < 128) shieldFell = true;
    }

    expect(shotTicks.length).toBeGreaterThan(1);
    for (let i = 1; i < shotTicks.length; i += 1) {
      expect(
        (shotTicks[i] as number) - (shotTicks[i - 1] as number),
      ).toBeGreaterThanOrEqual(13); // the literal beam period (D-07 revised)
    }
    expect(shieldFell).toBe(true);
  });
});

describe("the HUD gauge values (G-17-4)", () => {
  /** A HUD double with only what the probe's hud block reads. */
  const stubHud = {
    drawn: true,
    elements: [],
    designScale: 1,
    letterbox: [0, 0],
    lift: 0,
    bounds: {},
  } as unknown as Hud;

  it("publishes the drawn model's shield bars and energy banks, in the model's order", () => {
    const { ctx, probe, publisher } = harness();
    const combat = createPlayerCombatState();
    combat.fwdShield = 64;
    combat.aftShield = 128;
    combat.energy = 200;
    const model = buildHudModel(
      initFlightState(layout),
      layout,
      config,
      "",
      70,
      0,
      "",
      [],
      { combat },
    );
    ctx.runtime.hud = stubHud;
    ctx.core.lastModel = model;

    publisher.updateProbe();

    expect(probe.hud.shieldFwd).toBe(0.5);
    expect(probe.hud.shieldAft).toBe(1);
    // 200 / 256 of four banks: the bottom three full, the top one 0.125.
    expect(probe.hud.energyBanks).toEqual([0.125, 1, 1, 1]);
    expect(probe.hud.shieldFwd).toBe(model.bars.shieldFwd);
    expect(probe.hud.shieldAft).toBe(model.bars.shieldAft);
    expect(probe.hud.energyBanks).toEqual([...model.bars.energyBanks]);
  });

  it("copies the banks into a new array, never the model's own", () => {
    const { ctx, probe, publisher } = harness();
    const model = buildHudModel(
      initFlightState(layout),
      layout,
      config,
      "",
      70,
    );
    ctx.runtime.hud = stubHud;
    ctx.core.lastModel = model;

    publisher.updateProbe();

    expect(probe.hud.energyBanks).not.toBe(model.bars.energyBanks);
    const published = [...probe.hud.energyBanks];
    (model.bars.energyBanks as unknown as number[])[0] = 0;
    expect(probe.hud.energyBanks).toEqual(published);
  });

  it("reads the live drawn model at every call", () => {
    const { ctx, probe, publisher } = harness();
    ctx.runtime.hud = stubHud;
    const combat = createPlayerCombatState();
    ctx.core.lastModel = buildHudModel(
      initFlightState(layout),
      layout,
      config,
      "",
      70,
      0,
      "",
      [],
      { combat },
    );
    publisher.updateProbe();
    expect(probe.hud.shieldFwd).toBe(1);

    combat.fwdShield = 32;
    ctx.core.lastModel = buildHudModel(
      initFlightState(layout),
      layout,
      config,
      "",
      70,
      0,
      "",
      [],
      { combat },
    );
    publisher.updateProbe();
    expect(probe.hud.shieldFwd).toBe(0.25);
  });

  it("publishes 0, 0 and four zeros before the HUD has drawn a frame", () => {
    const { ctx, probe, publisher } = harness();
    ctx.runtime.hud = stubHud;
    expect(ctx.core.lastModel).toBeUndefined();

    publisher.updateProbe();

    expect(probe.hud.shieldFwd).toBe(0);
    expect(probe.hud.shieldAft).toBe(0);
    expect(probe.hud.energyBanks).toEqual([0, 0, 0, 0]);
  });
});
