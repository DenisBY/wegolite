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

import type { SimEvent } from "../../../src/sim/events.js";
import { RESERVED_EVENT_KINDS } from "../../../src/sim/events.js";
import { createTestPilotAi } from "../../../src/sim/ai/pilots/test-pilot.js";
import { AI_REGISTRY } from "../../../src/sim/ai/registry.js";
import type {
  AiComponent,
  AiContext,
  AiEvent,
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
import { createRngState, rngNext } from "../../../src/sim/rng.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT } from "../../../src/sim/time.js";
import type { SpawnInit } from "../../../src/sim/world/entity.js";
import { MAX_UINT32 } from "../../../src/sim/world/limits.js";
import {
  entityHashes,
  hashWorld,
  serializeEntity,
  serializeWorldSection,
} from "../../../src/sim/world/serialize.js";
import {
  MAX_AI_EVENT_PASSES,
  MAX_AI_EVENTS_PER_DRAIN,
  stepWorld,
} from "../../../src/sim/world/step.js";
import type { AiRegistry } from "../../../src/sim/world/step.js";
import {
  MAX_AI_QUEUE_LENGTH,
  createWorld,
  isNeverSpawned,
  killEntity,
  postAiEvent,
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
  const result = spawnEntity(world, init, tick);
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  const entity = result.entity;
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
  // D-02: only an entity with an AI moves; the moving case is a test pilot.
  it("advances an entity with an AI by forward times speed times dt (Phase 8 model)", () => {
    const world = createWorld(1);
    const player = initFlightState(layout);
    const entity = spawnOk(
      world,
      shipInit(vec(10, 20, 30), aiDueAt(MAX_UINT32), 60),
    );
    entity.nav.desiredSpeed = 60;
    player.tick = 1;
    stepWorld(world, player, layout, DT);
    expect(entity.speed).toBe(60);
    expect(entity.position.x).toBeCloseTo(10, 9);
    expect(entity.position.y).toBeCloseTo(20, 9);
    expect(entity.position.z).toBeCloseTo(30 - 60 * DT, 9);
  });

  it("holds an entity with no AI still, position and speed field alike (D-02)", () => {
    const world = createWorld(1);
    const player = initFlightState(layout);
    const entity = spawnOk(world, shipInit(vec(10, 20, 30), null, 60));
    entity.nav.desiredSpeed = 60;
    const before = serializeEntity(entity);
    for (let i = 1; i <= 120; i += 1) {
      player.tick = i;
      stepWorld(world, player, layout, DT);
    }
    expect(entity.position).toEqual(vec(10, 20, 30));
    expect(entity.speed).toBe(60);
    expect(serializeEntity(entity)).toBe(before);
  });
});

describe("contained AI faults (FOUND-15, D-04)", () => {
  /** Step the world one tick at `tick` and return that tick's events. */
  function stepAt(
    world: World,
    player: FlightState,
    tick: number,
    registry: AiRegistry,
  ): SimEvent[] {
    player.tick = tick;
    return stepWorld(world, player, layout, DT, registry);
  }

  const faulted = (events: readonly SimEvent[]) =>
    events.filter((event) => event.kind === "aiFaulted");

  it("contains a think that throws: nullAI, same id, one aiFaulted, no repair", () => {
    const world = createWorld(3);
    const player = initFlightState(layout);
    const entity = spawnOk(world, shipInit(vec(0, 0, 0), aiDueAt(0)));
    const registry = registryOf((ctx: AiContext) => {
      if (ctx.view.tick === 3) throw new Error("boom with secret text");
      ctx.ai.nextThinkTick = ctx.view.tick + 1;
    });
    for (let tick = 1; tick <= 5; tick += 1) {
      const events = stepAt(world, player, tick, registry);
      if (tick === 3) {
        expect(faulted(events)).toEqual([
          { kind: "aiFaulted", id: entity.id, site: "think" },
        ]);
      } else {
        expect(faulted(events)).toEqual([]);
      }
    }
    expect(world.store.get(entity.id)).toBe(entity);
    expect(entity.id).toBe(101);
    expect(entity.ai).toBeNull();
    expect(serializeEntity(entity)).toContain("ai:none");
    // After a fault the hash differs only by the AI change and the stream
    // draws: no repair is counted for it.
    expect(entity.repairs).toBe(0);
  });

  it("carries no exception text in any event", () => {
    const world = createWorld(3);
    const player = initFlightState(layout);
    spawnOk(world, shipInit(vec(0, 0, 0), aiDueAt(0)));
    const registry = registryOf(() => {
      throw new Error("secret-detail");
    });
    const events = stepAt(world, player, 1, registry);
    expect(JSON.stringify(events)).not.toContain("secret-detail");
    expect(JSON.stringify(events)).not.toContain("Error");
  });

  it("contains a thrown string the same way", () => {
    const world = createWorld(3);
    const player = initFlightState(layout);
    const entity = spawnOk(world, shipInit(vec(0, 0, 0), aiDueAt(0)));
    const registry = registryOf(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw "a plain string";
    });
    const events = stepAt(world, player, 1, registry);
    expect(faulted(events)).toEqual([
      { kind: "aiFaulted", id: entity.id, site: "think" },
    ]);
    expect(JSON.stringify(events)).not.toContain("plain string");
    expect(entity.ai).toBeNull();
  });

  it("contains an onEvent that throws, with site event", () => {
    const world = createWorld(3);
    const player = initFlightState(layout);
    const entity = spawnOk(world, shipInit(vec(0, 0, 0), aiDueAt(MAX_UINT32)));
    const registry: AiRegistry = {
      "test-pilot": {
        think: () => {},
        onEvent: () => {
          throw new Error("event boom");
        },
      },
    };
    postAiEvent(world, { to: entity.id, name: "shipAttacked" });
    const events = stepAt(world, player, 1, registry);
    expect(faulted(events)).toEqual([
      { kind: "aiFaulted", id: entity.id, site: "event" },
    ]);
    expect(entity.ai).toBeNull();
    expect(world.aiQueue).toHaveLength(0);
    // A later tick emits nothing more for this entity.
    expect(faulted(stepAt(world, player, 2, registry))).toEqual([]);
  });

  it("writes the stream back on the fault path: two draws then a throw advance rng.ai by two", () => {
    const world = createWorld(3);
    const player = initFlightState(layout);
    const entity = spawnOk(world, shipInit(vec(0, 0, 0), aiDueAt(0)));
    const start = entity.rng.ai;
    let draws: number[] = [];
    const registry = registryOf((ctx: AiContext) => {
      if (ctx.self === entity.id) {
        draws = [ctx.random(), ctx.random()];
        throw new Error("after two draws");
      }
    });
    stepAt(world, player, 1, registry);
    expect(draws).toHaveLength(2);
    // The same two draws taken by hand from the same starting state.
    const stream = createRngState(start);
    rngNext(stream);
    rngNext(stream);
    expect(entity.rng.ai).toBe(stream.s);
    expect(entity.rng.ai).not.toBe(start);
  });

  it("keeps a working neighbour thinking, and the faulted entity stays on the scanner", () => {
    const world = createWorld(3);
    const player = initFlightState(layout);
    const bad = spawnOk(world, shipInit(vec(0, 0, 0), aiDueAt(0)));
    const good = spawnOk(world, shipInit(vec(100, 0, 0), aiDueAt(0)));
    let goodThinks = 0;
    let scanSawBad = false;
    const registry = registryOf((ctx: AiContext) => {
      if (ctx.self === bad.id) throw new Error("bad");
      goodThinks += 1;
      ctx.ai.nextThinkTick = ctx.view.tick + 1;
      scanSawBad = ctx.view.scan(ctx.self, 1000).includes(bad.id);
    });
    for (let tick = 1; tick <= 4; tick += 1) {
      stepAt(world, player, tick, registry);
    }
    expect(goodThinks).toBe(4);
    expect(good.ai).not.toBeNull();
    expect(bad.ai).toBeNull();
    expect(scanSawBad).toBe(true);
  });

  it("hashes two identical faulting worlds identically on every tick of a 20-tick run", () => {
    const build = () => {
      const world = createWorld(11);
      const player = initFlightState(layout);
      spawnOk(world, shipInit(vec(0, 0, 0), aiDueAt(0)));
      spawnOk(world, shipInit(vec(50, 0, 0), aiDueAt(0)));
      return { world, player };
    };
    const registry = registryOf((ctx: AiContext) => {
      ctx.random();
      if (ctx.self === 101 && ctx.view.tick === 7) throw new Error("x");
      ctx.ai.nextThinkTick = ctx.view.tick + 1;
    });
    const a = build();
    const b = build();
    for (let tick = 1; tick <= 20; tick += 1) {
      stepAt(a.world, a.player, tick, registry);
      stepAt(b.world, b.player, tick, registry);
      expect(hashWorld(a.player, a.world)).toBe(hashWorld(b.player, b.world));
    }
    expect(a.world.store.get(101)?.ai).toBeNull();
  });

  it("does not guard the simulation itself: a bad dt still throws", () => {
    const world = createWorld(1);
    expect(() =>
      stepWorld(world, initFlightState(layout), layout, 0, {}),
    ).toThrow(RangeError);
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
    // D-02: a no-AI entity never moves, so the entity must carry an AI for
    // this check to be able to fail if the world were stepped while docked.
    const entity = spawnOk(
      world,
      shipInit(vec(0, 0, 0), aiDueAt(MAX_UINT32), 60),
    );
    entity.nav.desiredSpeed = 60;
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

describe("queued AI events", () => {
  const WELL_FORMED = { to: 101, name: "shipAttacked" } as const;

  function twoPilots() {
    const player = flyingPlayer();
    const world = createWorld(9);
    // Far-future timers: only events, never thinks, run in these tests.
    const a = spawnOk(world, shipInit(vec(0, 0, 0), aiDueAt(1e6)));
    const b = spawnOk(world, shipInit(vec(10, 0, 0), aiDueAt(1e6)));
    return { player, world, a, b };
  }

  it("ignores a malformed event without counting it", () => {
    const { world } = twoPilots();
    const bad: unknown[] = [
      { ...WELL_FORMED, to: 0 },
      { ...WELL_FORMED, to: -1 },
      { ...WELL_FORMED, to: 1.5 },
      { ...WELL_FORMED, to: 2 ** 32 },
      { ...WELL_FORMED, name: "noSuchEvent" },
      { ...WELL_FORMED, name: "constructor" },
      { ...WELL_FORMED, a: -1 },
      { ...WELL_FORMED, a: 1.5 },
      { ...WELL_FORMED, a: 2 ** 32 },
      { ...WELL_FORMED, b: -1 },
      { ...WELL_FORMED, b: 1.5 },
      { ...WELL_FORMED, b: 2 ** 32 },
      { ...WELL_FORMED, n: Number.NaN },
      { ...WELL_FORMED, n: Number.POSITIVE_INFINITY },
      { ...WELL_FORMED, n: 1e13 },
    ];
    for (const event of bad) postAiEvent(world, event as AiEvent);
    expect(world.aiQueue).toHaveLength(0);
    expect(world.aiDropped).toBe(0);
  });

  it("queues a copy holding only to, name and the present a, b and n", () => {
    const { world } = twoPilots();
    const event = { ...WELL_FORMED, a: 102, n: 2.5, extra: "x" };
    postAiEvent(world, event);
    expect(world.aiQueue).toHaveLength(1);
    const queued = world.aiQueue[0] as AiEvent;
    expect(queued).not.toBe(event);
    expect(Object.keys(queued).sort()).toEqual(["a", "n", "name", "to"]);
    expect(queued).toEqual({ to: 101, name: "shipAttacked", a: 102, n: 2.5 });
    postAiEvent(world, { to: 102, name: "shipCloseContact", b: 0 });
    expect(Object.keys(world.aiQueue[1] as AiEvent).sort()).toEqual([
      "b",
      "name",
      "to",
    ]);
  });

  it("delivers first in first out, never synchronously, and gives a handler only its own control", () => {
    const { player, world, a, b } = twoPilots();
    const seen: string[] = [];
    const registry: AiRegistry = {
      "test-pilot": {
        think: () => undefined,
        onEvent: (ctx, event) => {
          const other = world.store.get(ctx.self === a.id ? b.id : a.id);
          seen.push(
            `${ctx.self}:${event.name}:other-mark=${String(other?.ai?.params.mark)}`,
          );
          ctx.ai.params.mark = ctx.self;
          // A handler can steer only itself.
          ctx.ctl.setDesiredSpeed(ctx.self === a.id ? b.id : a.id, 77);
        },
      },
    };
    postAiEvent(world, { to: a.id, name: "shipAttacked" });
    postAiEvent(world, { to: b.id, name: "shipTargetLost" });
    // Posting changes no entity state until the AI phase.
    expect(a.ai?.params.mark).toBeUndefined();
    expect(world.aiQueue).toHaveLength(2);
    advance(player, world, registry);
    expect(seen).toEqual([
      `${a.id}:shipAttacked:other-mark=undefined`,
      `${b.id}:shipTargetLost:other-mark=${a.id}`,
    ]);
    expect(a.nav.desiredSpeed).toBe(0);
    expect(b.nav.desiredSpeed).toBe(0);
    expect(world.aiQueue).toHaveLength(0);
  });

  it("delivers an event posted in a handler in the next pass of the same tick", () => {
    const { player, world, a } = twoPilots();
    const order: string[] = [];
    const registry: AiRegistry = {
      "test-pilot": {
        think: () => undefined,
        onEvent: (_ctx, event) => {
          order.push(event.name);
          if (event.name === "shipAttacked") {
            postAiEvent(world, { to: a.id, name: "shipTargetLost" });
            expect(world.aiQueue).toHaveLength(1);
          }
        },
      },
    };
    postAiEvent(world, { to: a.id, name: "shipAttacked" });
    postAiEvent(world, { to: a.id, name: "shipCloseContact" });
    advance(player, world, registry);
    expect(order).toEqual([
      "shipAttacked",
      "shipCloseContact",
      "shipTargetLost",
    ]);
  });

  it("stops a handler that re-posts forever after the pass cap and counts the remainder", () => {
    const { player, world, a } = twoPilots();
    let delivered = 0;
    const registry: AiRegistry = {
      "test-pilot": {
        think: () => undefined,
        onEvent: () => {
          delivered += 1;
          postAiEvent(world, { to: a.id, name: "shipAttacked" });
        },
      },
    };
    postAiEvent(world, { to: a.id, name: "shipAttacked" });
    advance(player, world, registry);
    expect(delivered).toBe(MAX_AI_EVENT_PASSES);
    expect(MAX_AI_EVENT_PASSES).toBe(8);
    expect(world.aiDropped).toBe(1);
    expect(world.aiQueue).toHaveLength(0);
  });

  it("bounds a times-four fan-out by the delivery budget and the queue cap, with exact accounting", () => {
    const { player, world, a } = twoPilots();
    let calls = 0;
    let wellFormedPosts = 0;
    let maxQueue = 0;
    const registry: AiRegistry = {
      "test-pilot": {
        think: () => undefined,
        onEvent: () => {
          calls += 1;
          for (let k = 0; k < 4; k += 1) {
            wellFormedPosts += 1;
            postAiEvent(world, {
              to: k % 2 === 0 ? a.id : a.id + 1,
              name: "shipAttacked",
            });
            maxQueue = Math.max(maxQueue, world.aiQueue.length);
          }
        },
      },
    };
    postAiEvent(world, { to: a.id, name: "shipAttacked" });
    const queuedBefore = 1;
    advance(player, world, registry);
    expect(world.aiQueue).toHaveLength(0);
    expect(calls).toBe(MAX_AI_EVENTS_PER_DRAIN);
    expect(MAX_AI_EVENTS_PER_DRAIN).toBe(4096);
    expect(maxQueue).toBeLessThanOrEqual(MAX_AI_QUEUE_LENGTH);
    expect(maxQueue).toBe(MAX_AI_QUEUE_LENGTH);
    // Every well-formed event is either dequeued or counted as dropped.
    expect(world.aiDropped).toBe(queuedBefore + wellFormedPosts - calls);
    expect(world.aiDropped).toBeGreaterThan(0);
  });

  it("drops and counts a well-formed post while the queue is full, saturating at MAX_UINT32", () => {
    const { world, a } = twoPilots();
    expect(MAX_AI_QUEUE_LENGTH).toBe(4096);
    for (let i = 0; i < MAX_AI_QUEUE_LENGTH; i += 1) {
      postAiEvent(world, { to: a.id, name: "shipAttacked" });
    }
    expect(world.aiQueue).toHaveLength(MAX_AI_QUEUE_LENGTH);
    expect(world.aiDropped).toBe(0);
    postAiEvent(world, { to: a.id, name: "shipAttacked" });
    expect(world.aiQueue).toHaveLength(MAX_AI_QUEUE_LENGTH);
    expect(world.aiDropped).toBe(1);
    // A malformed event at the cap is still not counted.
    postAiEvent(world, { to: 0, name: "shipAttacked" });
    expect(world.aiDropped).toBe(1);
    world.aiDropped = MAX_UINT32 - 1;
    postAiEvent(world, { to: a.id, name: "shipAttacked" });
    postAiEvent(world, { to: a.id, name: "shipAttacked" });
    expect(world.aiDropped).toBe(MAX_UINT32);
  });

  it("counts no drop for events to a dead, missing, static, player or AI-less entity", () => {
    const { player, world, a } = twoPilots();
    const plain = spawnOk(world, shipInit(vec(20, 0, 0)));
    const dead = spawnOk(world, shipInit(vec(30, 0, 0), aiDueAt(1e6)));
    killEntity(world, dead.id);
    let delivered = 0;
    const registry: AiRegistry = {
      "test-pilot": {
        think: () => undefined,
        onEvent: () => {
          delivered += 1;
        },
      },
    };
    for (const to of [999, 1, 3, 100, plain.id, dead.id]) {
      postAiEvent(world, { to, name: "shipAttacked" });
    }
    postAiEvent(world, { to: a.id, name: "shipAttacked" });
    advance(player, world, registry);
    expect(delivered).toBe(1);
    expect(world.aiDropped).toBe(0);
    expect(world.aiQueue).toHaveLength(0);
  });

  it("skips an event for a corrupted aiKey without throwing, and the tick's sanitize nulls its ai", () => {
    const { player, world, a } = twoPilots();
    (a.ai as AiComponent).aiKey = "constructor" as AiKey;
    postAiEvent(world, { to: a.id, name: "shipAttacked" });
    expect(() =>
      stepWorld(world, player, layout, DT, AI_REGISTRY),
    ).not.toThrow();
    expect(a.ai).toBeNull();
    expect(a.repairs).toBe(1);
    postAiEvent(world, { to: a.id, name: "shipAttacked" });
    expect(() =>
      stepWorld(world, player, layout, DT, AI_REGISTRY),
    ).not.toThrow();
    expect(world.aiDropped).toBe(0);
  });

  it("flips isNeverSpawned and the hash for a world whose only state is a drop count", () => {
    const world = createWorld(21);
    const player = initFlightState(layout);
    expect(isNeverSpawned(world)).toBe(true);
    expect(hashWorld(player, world)).toBe(hashFlight(player));
    world.aiDropped = 5;
    expect(isNeverSpawned(world)).toBe(false);
    expect(hashWorld(player, world)).not.toBe(hashFlight(player));
    expect(serializeWorldSection(world)).toContain("aiDropped=5");
  });
});

describe("per-entity streams under stepping", () => {
  it("keeps an entity's draws identical whether another entity is spawned and killed or never exists", () => {
    function draws(withOther: boolean): number[] {
      const player = flyingPlayer();
      const world = createWorld(31);
      const subject = spawnOk(world, shipInit(vec(0, 0, 0), aiDueAt(0)));
      const log: number[] = [];
      const registry = registryOf((ctx: AiContext) => {
        const value = ctx.random();
        if (ctx.self === subject.id) log.push(value);
      });
      let otherId = 0;
      for (let i = 0; i < 200; i += 1) {
        if (withOther && i === 10) {
          otherId = spawnOk(world, shipInit(vec(5, 0, 0), aiDueAt(0))).id;
        }
        if (withOther && i === 50) killEntity(world, otherId);
        advance(player, world, registry);
      }
      return log;
    }
    const alone = draws(false);
    const accompanied = draws(true);
    expect(alone).toHaveLength(200);
    expect(accompanied).toEqual(alone);
  });
});

describe("per-tick sanitising", () => {
  it("repairs injected poison before the hash, so hashWorld never throws and repairs enter the hash", () => {
    const player = flyingPlayer();
    const world = createWorld(41);
    const entity = spawnOk(
      world,
      shipInit(vec(0, 0, 0), aiDueAt(player.tick + 1e6)),
    );
    // Spawn refuses poison, so it is injected after spawning (a hook, a bad
    // restore or an arithmetic error would do the same).
    const params = (entity.ai as AiComponent).params;
    params.list = Array.from({ length: 65 }, (_, i) => i);
    params.bad = Number.NaN;
    const nav = entity.nav;
    nav.desiredSpeed = Number.NaN;
    entity.speed = -5;
    entity.orientation = { w: 1e200, x: 0, y: 0, z: 0 };
    entity.repairs = 1e13;
    entity.specKey = "k".repeat(129);
    stepWorld(world, player, layout, DT, AI_REGISTRY);
    expect(() => hashWorld(player, world)).not.toThrow();
    expect(entity.repairs).toBe(1);
    expect(serializeEntity(entity)).toContain("repairs:1");
    expect(entity.specKey).toHaveLength(128);
    expect(entity.orientation).toEqual({ w: 1, x: 0, y: 0, z: 0 });
    expect((entity.ai?.params.list as number[]).length).toBe(64);
    expect(entity.ai?.params.bad).toBe(0);
    // A clean tick repairs nothing more.
    stepWorld(world, player, layout, DT, AI_REGISTRY);
    expect(entity.repairs).toBe(1);
  });

  it("repairs the world-level hashed scalars", () => {
    const player = flyingPlayer();
    const world = createWorld(41);
    world.rng.s = -5;
    world.aiDropped = Number.NaN;
    stepWorld(world, player, layout, DT);
    expect(world.rng.s).toBe(0);
    expect(world.aiDropped).toBe(0);
    world.aiDropped = 1e13;
    stepWorld(world, player, layout, DT);
    expect(world.aiDropped).toBe(MAX_UINT32);
    world.aiDropped = -3;
    stepWorld(world, player, layout, DT);
    expect(world.aiDropped).toBe(0);
    world.rng.s = 2 ** 32;
    stepWorld(world, player, layout, DT);
    expect(world.rng.s).toBe(0);
  });

  it("removes an entity of an unknown kind at the tick's commit", () => {
    const player = flyingPlayer();
    const world = createWorld(41);
    const entity = spawnOk(world, shipInit(vec(0, 0, 0)));
    (entity as unknown as { kind: string }).kind = "constructor";
    stepWorld(world, player, layout, DT);
    expect(world.store.live).toHaveLength(0);
  });
});

describe("entityRemoved and the reserved event kinds", () => {
  it("emits one entityRemoved per committed removal, ascending, and none the next tick", () => {
    const player = flyingPlayer();
    const world = createWorld(51);
    for (let i = 0; i < 4; i += 1) spawnOk(world, shipInit(vec(i, 0, 0)));
    killEntity(world, 103);
    killEntity(world, 101);
    expect(stepWorld(world, player, layout, DT)).toEqual([
      { kind: "entityRemoved", id: 101 },
      { kind: "entityRemoved", id: 103 },
    ]);
    expect(stepWorld(world, player, layout, DT)).toEqual([]);
  });

  it("emits entityRemoved through stepSim after the flight events", () => {
    const player = flyingPlayer();
    const world = createWorld(51);
    spawnOk(world, shipInit(vec(0, 0, 0)));
    killEntity(world, 101);
    const events = stepSim(player, world, layout, config, ZERO_INTENT, [], DT);
    expect(events.at(-1)).toEqual({ kind: "entityRemoved", id: 101 });
  });

  it("holds one literal of every reserved kind with the section 7.6 field names", () => {
    const origin = vec(0, 0, 0);
    // Object-literal excess-property checks make a renamed or extra field a
    // typecheck error, so these spellings are the pinned field names.
    const literals: SimEvent[] = [
      {
        kind: "laserFired",
        shooter: 101,
        playerShot: false,
        from: origin,
        to: origin,
        laserKind: "pulse",
      },
      { kind: "shipHit", target: 101, source: 102, amount: 5, shield: true },
      {
        kind: "shipDestroyed",
        id: 101,
        position: origin,
        radius: 50,
        specKey: "viper",
        killer: 0,
      },
      { kind: "entityRemoved", id: 101 },
      { kind: "commsMessage", from: 101, key: "greeting", params: {} },
      { kind: "missileLaunched", missile: 103, shooter: 101, target: 102 },
      { kind: "missileDetonated", missile: 103, position: origin },
      { kind: "ecmFired", source: 101, position: origin },
      { kind: "cargoScooped", scooper: 100, commodity: "food", amount: 1 },
      { kind: "shipSpawned", id: 101, specKey: "viper" },
      { kind: "legalStatusChanged", from: "clean", to: "offender" },
      { kind: "playerDestroyed", position: origin },
      { kind: "podEjected", pod: 104, owner: 101 },
      { kind: "proximityWarning", id: 101, other: 102 },
      { kind: "energyLow", id: 101 },
    ];
    const kinds = literals.map((event) => event.kind);
    expect(new Set(RESERVED_EVENT_KINDS).size).toBe(15);
    expect(RESERVED_EVENT_KINDS).toHaveLength(15);
    expect([...RESERVED_EVENT_KINDS].sort()).toEqual([...kinds].sort());
  });
});
