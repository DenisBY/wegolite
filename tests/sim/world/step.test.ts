// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The world step and its composition with the flight step (FOUND-11,
 * FOUND-13, D-04, D-08, D-14). Expected values come from the rules (ascending
 * id order over a length snapshot, integer timers, run-versus-run equality),
 * never from running the code under test. Exactly one test pins the Phase 8
 * placeholder integrator; every other test is relational so the Phase 12/13
 * thrust port can replace the integrator without touching them.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createTestPilotAi } from "../../../src/sim/ai/pilots/test-pilot.js";
import { AI_REGISTRY } from "../../../src/sim/ai/registry.js";
import type {
  AiComponent,
  AiContext,
  AiKey,
  AiModule,
} from "../../../src/sim/ai/types.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import type { ControlIntent } from "../../../src/sim/flight/controller.js";
import {
  hashFlight,
  initFlightState,
  serializeFlight,
} from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { stepFlight } from "../../../src/sim/flight/step.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import { HYPERSPACE_COUNTDOWN_STEPS } from "../../../src/sim/hyperspace/countdown.js";
import { identity, vec } from "../../../src/sim/math.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT } from "../../../src/sim/time.js";
import type { SpawnInit } from "../../../src/sim/world/entity.js";
import {
  entityHashes,
  hashWorld,
  serializeEntity,
} from "../../../src/sim/world/serialize.js";
import { stepWorld } from "../../../src/sim/world/step.js";
import type { AiRegistry } from "../../../src/sim/world/step.js";
import {
  createWorld,
  killEntity,
  spawnEntity,
} from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { laveFixture } from "../../helpers/lave.js";

const { layout, config } = laveFixture();

function shipInit(
  position = vec(0, 0, 0),
  ai: AiComponent | null = null,
  speed = 0,
): SpawnInit {
  return {
    kind: "ship",
    specKey: "test-ship",
    scanClass: "CLASS_NEUTRAL",
    position,
    orientation: identity(),
    radius: 50,
    speed,
    ai,
  };
}

function spawnOk(world: World, init: SpawnInit, tick = 0) {
  const entity = spawnEntity(world, init, tick);
  if (entity === undefined) throw new Error("spawn refused");
  return entity;
}

/** A pilot-style AI component due to think at `nextThinkTick`. */
function aiDueAt(nextThinkTick: number, aiKey: AiKey = "test-pilot") {
  return {
    aiKey,
    params: Object.create(null) as AiComponent["params"],
    wakeTick: 0,
    nextThinkTick,
  } satisfies AiComponent;
}

/** A player already launched and flying. */
function flyingPlayer(): FlightState {
  const state = initFlightState(layout);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "skipLaunch" }], DT);
  return state;
}

/** One composed step with an injected registry: the flight step, then the world. */
function advance(
  player: FlightState,
  world: World,
  registry: AiRegistry,
): void {
  stepFlight(player, layout, config, ZERO_INTENT, [], DT);
  stepWorld(world, player, layout, DT, registry);
}

/** A registry that runs `think` for the key "test-pilot". */
function registryOf(think: AiModule["think"]): AiRegistry {
  return { "test-pilot": { think } };
}

describe("stepWorld validation", () => {
  it("rejects a non-positive or non-finite dt with a RangeError naming stepWorld", () => {
    const world = createWorld(1);
    const player = initFlightState(layout);
    for (const dt of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => stepWorld(world, player, layout, dt)).toThrow(RangeError);
      expect(() => stepWorld(world, player, layout, dt)).toThrow(/stepWorld/);
    }
  });
});

describe("the Phase 8 placeholder integrator", () => {
  // The ONE test that pins the constant-speed model. Phase 12/13 replaces the
  // integrator with Oolite's thrust and attitude port and deletes this test.
  it("advances an entity by forward times speed times dt (Phase 8 model)", () => {
    const world = createWorld(1);
    const player = initFlightState(layout);
    const entity = spawnOk(world, shipInit(vec(10, 20, 30), null, 60));
    player.tick = 1;
    stepWorld(world, player, layout, DT);
    expect(entity.speed).toBe(60);
    expect(entity.position.x).toBeCloseTo(10, 9);
    expect(entity.position.y).toBeCloseTo(20, 9);
    expect(entity.position.z).toBeCloseTo(30 - 60 * DT, 9);
  });
});

describe("world step through stepSim", () => {
  it("moves a test pilot, spaces its thinks by at most 15 ticks and keeps timers integer", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    // Next to the player and the station, with a 1 m hold range, so the pilot
    // always has a target and never reaches it.
    const pilot = spawnOk(
      world,
      shipInit(
        vec(player.position.x + 500, player.position.y, player.position.z),
        createTestPilotAi(player.tick, {
          scanRange: 1e9,
          holdRange: 1,
          cruiseSpeed: 100,
        }),
      ),
      player.tick,
    );
    spawnOk(world, shipInit(vec(-700, 0, 0)), player.tick);
    const start = { ...pilot.position };
    const thinkTicks: number[] = [];
    let lastNext = pilot.ai?.nextThinkTick ?? -1;
    for (let i = 0; i < 300; i += 1) {
      stepSim(player, world, layout, config, ZERO_INTENT, [], DT);
      const ai = pilot.ai as AiComponent;
      if (ai.nextThinkTick !== lastNext) {
        thinkTicks.push(player.tick);
        lastNext = ai.nextThinkTick;
      }
      expect(Number.isInteger(ai.nextThinkTick)).toBe(true);
      expect(Number.isInteger(ai.wakeTick)).toBe(true);
    }
    expect(thinkTicks.length).toBeGreaterThan(300 / 15 - 1);
    for (let i = 1; i < thinkTicks.length; i += 1) {
      expect(
        (thinkTicks[i] as number) - (thinkTicks[i - 1] as number),
      ).toBeLessThanOrEqual(15);
    }
    expect(pilot.position).not.toEqual(start);
  });

  it("thinks on the wake tick, not at nextThinkTick, and clears the wake before the think", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const ai = aiDueAt(player.tick + 15);
    ai.wakeTick = player.tick + 2;
    const t0 = player.tick;
    const entity = spawnOk(world, shipInit(vec(0, 0, 0), ai), t0);
    const seen: { tick: number; wakeTick: number }[] = [];
    const registry = registryOf((ctx: AiContext) => {
      seen.push({ tick: ctx.view.tick, wakeTick: ctx.ai.wakeTick });
      ctx.ai.nextThinkTick = ctx.view.tick + 15;
      ctx.ctl.scheduleWake(ctx.self, 20);
    });
    advance(player, world, registry);
    expect(seen).toEqual([]);
    advance(player, world, registry);
    expect(seen).toEqual([{ tick: t0 + 2, wakeTick: 0 }]);
    const next = entity.ai as AiComponent;
    expect(next.nextThinkTick).toBe(t0 + 17);
    expect(next.wakeTick).toBe(t0 + 22);
    expect(Number.isInteger(next.wakeTick)).toBe(true);
  });

  it("matches stepFlight text tick for tick with no world, an empty world and a launched empty world", () => {
    const script: readonly ControlIntent[] = [
      { ...ZERO_INTENT, roll: 1, speed: 1 },
      { ...ZERO_INTENT, pitch: 0.5, speed: 1 },
      { ...ZERO_INTENT, pitch: -0.25, roll: -1 },
      { ...ZERO_INTENT, speed: -1 },
    ];
    const intentAt = (tick: number): ControlIntent =>
      script[tick % script.length] as ControlIntent;
    const flightOnly = initFlightState(layout);
    const noWorld = initFlightState(layout);
    const withWorld = initFlightState(layout);
    const world = createWorld(7);
    const launch = [{ kind: "launch" }] as const;
    const skip = [{ kind: "skipLaunch" }] as const;
    stepFlight(flightOnly, layout, config, ZERO_INTENT, launch, DT);
    stepSim(noWorld, undefined, layout, config, ZERO_INTENT, launch, DT);
    stepSim(withWorld, world, layout, config, ZERO_INTENT, launch, DT);
    stepFlight(flightOnly, layout, config, ZERO_INTENT, skip, DT);
    stepSim(noWorld, undefined, layout, config, ZERO_INTENT, skip, DT);
    stepSim(withWorld, world, layout, config, ZERO_INTENT, skip, DT);
    for (let i = 0; i < 300; i += 1) {
      const intent = intentAt(flightOnly.tick);
      stepFlight(flightOnly, layout, config, intent, [], DT);
      stepSim(noWorld, undefined, layout, config, intent, [], DT);
      stepSim(withWorld, world, layout, config, intent, [], DT);
      const text = serializeFlight(flightOnly);
      expect(serializeFlight(noWorld)).toBe(text);
      expect(serializeFlight(withWorld)).toBe(text);
      expect(hashWorld(withWorld, world)).toBe(hashFlight(withWorld));
    }
  });

  it("never steps the world while docked", () => {
    const player = initFlightState(layout);
    const world = createWorld(7);
    const entity = spawnOk(world, shipInit(vec(0, 0, 0), null, 60));
    const before = serializeEntity(entity);
    stepSim(player, world, layout, config, ZERO_INTENT, [], DT);
    expect(player.mode).toBe("docked");
    expect(serializeEntity(entity)).toBe(before);
  });
});

describe("id-ordered passes over a length snapshot", () => {
  it("thinks in ascending id order, skips a dead entity and defers a new spawn a tick", () => {
    const player = flyingPlayer();
    const world = createWorld(3);
    for (let i = 0; i < 3; i += 1) {
      spawnOk(world, shipInit(vec(i * 10, 0, 0), aiDueAt(0)));
    }
    killEntity(world, 102);
    const order: number[][] = [[]];
    let spawned = false;
    const registry = registryOf((ctx: AiContext) => {
      (order[order.length - 1] as number[]).push(ctx.self);
      if (!spawned) {
        spawned = true;
        spawnOk(world, shipInit(vec(0, 0, 0), aiDueAt(0)));
      }
    });
    advance(player, world, registry);
    expect(order[0]).toEqual([101, 103]);
    order.push([]);
    advance(player, world, registry);
    expect(order[1]).toEqual([101, 103, 104]);
  });

  it("skips an entity killed by an earlier think in the same tick", () => {
    const player = flyingPlayer();
    const world = createWorld(3);
    for (let i = 0; i < 3; i += 1) {
      spawnOk(world, shipInit(vec(i * 10, 0, 0), aiDueAt(0)));
    }
    const thought: number[] = [];
    const registry = registryOf((ctx: AiContext) => {
      thought.push(ctx.self);
      if (ctx.self === 101) killEntity(world, 103);
    });
    advance(player, world, registry);
    expect(thought).toEqual([101, 102]);
    expect(world.store.live.map((e) => e.id)).toEqual([101, 102]);
  });

  it("consults no registry entry and builds no view when nothing is due", () => {
    const player = flyingPlayer();
    const world = createWorld(3);
    // Due in the future: no think, so the registry is never consulted.
    spawnOk(world, shipInit(vec(0, 0, 0), aiDueAt(player.tick + 1000)));
    let touched = 0;
    const trap = new Proxy<AiRegistry>(
      {},
      {
        has() {
          touched += 1;
          return false;
        },
        getOwnPropertyDescriptor() {
          touched += 1;
          return undefined;
        },
        get() {
          touched += 1;
          return undefined;
        },
      },
    );
    advance(player, world, trap);
    expect(touched).toBe(0);
  });
});

describe("own-key AI dispatch", () => {
  it("never reads through the registry prototype", () => {
    const names = ["constructor", "toString", "__proto__", "hasOwnProperty"];
    for (const name of names) {
      const player = flyingPlayer();
      const world = createWorld(5);
      const bad = spawnOk(world, shipInit(vec(0, 0, 0), aiDueAt(0)));
      const good = spawnOk(world, shipInit(vec(5, 0, 0), aiDueAt(0)));
      (bad.ai as AiComponent).aiKey = name as AiKey;
      let thoughtBad = false;
      let thoughtGood = false;
      const registry: AiRegistry = {
        "test-pilot": {
          think: (ctx: AiContext) => {
            if (ctx.self === bad.id) thoughtBad = true;
            if (ctx.self === good.id) thoughtGood = true;
          },
        },
      };
      expect(() => advance(player, world, registry)).not.toThrow();
      expect(thoughtBad).toBe(false);
      expect(thoughtGood).toBe(true);
    }
  });

  it("does not throw with the real frozen registry either", () => {
    const player = flyingPlayer();
    const world = createWorld(5);
    const bad = spawnOk(world, shipInit(vec(0, 0, 0), aiDueAt(0)));
    (bad.ai as AiComponent).aiKey = "constructor" as AiKey;
    expect(() =>
      stepWorld(world, player, layout, DT, AI_REGISTRY),
    ).not.toThrow();
  });
});

describe("the hyperspace jump step", () => {
  interface ChartSystem {
    readonly id: string;
    readonly name: string;
    readonly chartX: number;
    readonly chartY: number;
  }
  const systems = JSON.parse(
    readFileSync(
      new URL(
        "../../../src/content/generated/systems/g0.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as ChartSystem[];
  const byName = (name: string): ChartSystem => {
    const found = systems.find((system) => system.name === name);
    if (found === undefined) throw new Error(`no system "${name}"`);
    return found;
  };
  const lave = byName("Lave");
  const diso = byName("Diso");
  const options: StepOptions = {
    hyperspace: {
      fuel: 70,
      origin: { id: lave.id, x: lave.chartX, y: lave.chartY },
      target: { id: diso.id, x: diso.chartX, y: diso.chartY },
    },
  };

  it("steps the world on every step before the jump and not on the jump step", () => {
    const player = initFlightState(layout);
    player.mode = "inFlight";
    player.dockArmed = false;
    const world = createWorld(11);
    // A huge scan range and a 1 m hold range keep the pilot moving on every
    // tick: it always finds a target and never reaches it.
    spawnOk(
      world,
      shipInit(
        vec(player.position.x + 500, player.position.y, player.position.z),
        createTestPilotAi(player.tick, {
          scanRange: 1e9,
          holdRange: 1,
          cruiseSpeed: 100,
        }),
        100,
      ),
      player.tick,
    );
    stepSim(
      player,
      world,
      layout,
      config,
      ZERO_INTENT,
      [{ kind: "beginHyperspace" }],
      DT,
      options,
    );
    let jumped = false;
    for (let i = 1; i <= HYPERSPACE_COUNTDOWN_STEPS; i += 1) {
      const hashesBefore = JSON.stringify(entityHashes(world));
      const nextIdBefore = world.store.nextId;
      const rngBefore = world.rng.s;
      const linesBefore = world.store.live.map(serializeEntity);
      const events = stepSim(
        player,
        world,
        layout,
        config,
        ZERO_INTENT,
        [],
        DT,
        options,
      );
      const jumpStep = events.some((e) => e.kind === "hyperspaceJumped");
      if (jumpStep) {
        jumped = true;
        expect(i).toBe(HYPERSPACE_COUNTDOWN_STEPS);
        expect(JSON.stringify(entityHashes(world))).toBe(hashesBefore);
        expect(world.store.nextId).toBe(nextIdBefore);
        expect(world.rng.s).toBe(rngBefore);
        expect(world.store.live.map(serializeEntity)).toEqual(linesBefore);
      } else {
        expect(JSON.stringify(entityHashes(world))).not.toBe(hashesBefore);
      }
    }
    expect(jumped).toBe(true);
  });
});
