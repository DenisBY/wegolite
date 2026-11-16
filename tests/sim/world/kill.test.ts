// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `killShip`, the one idempotent kill path (FOUND-19, D-02, D-04, D-13), and
 * the notifications it posts (D-04) with the immediate drain that delivers them
 * (`drainAiEventsNow`, D-12). The plan-15-04 cases kill with ships that have no
 * AI, so none of them snapshots or asserts an empty queue after a kill with a
 * live NPC killer, and none needed an added drain.
 */

import { describe, expect, it } from "vitest";

import { createTestPilotAi } from "../../../src/sim/ai/pilots/test-pilot.js";
import type { AiContext, AiEvent } from "../../../src/sim/ai/types.js";
import { npcLaserRay } from "../../../src/sim/combat/aim.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import type { NpcWeapon } from "../../../src/sim/combat/aim.js";
import type { SimEvent } from "../../../src/sim/events.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import { stepFlight } from "../../../src/sim/flight/step.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import { identity, vec } from "../../../src/sim/math.js";
import type { Quat } from "../../../src/sim/math.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT } from "../../../src/sim/time.js";
import {
  MAIN_STATION_ID,
  NO_ENTITY,
  PLAYER_ID,
  STATION_NAV_BUOY_ID,
  WITCHPOINT_BUOY_ID,
} from "../../../src/sim/world/ids.js";
import { killShip } from "../../../src/sim/world/kill.js";
import { hashWorld } from "../../../src/sim/world/serialize.js";
import { snapshotWorld } from "../../../src/sim/world/snapshot.js";
import {
  MAX_AI_QUEUE_LENGTH,
  commitWorld,
  createWorld,
  spawnEntity,
} from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { resolveShots } from "../../../src/sim/combat/step.js";
import type { ShotRequest } from "../../../src/sim/combat/step.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { drainAiEventsNow, stepWorld } from "../../../src/sim/world/step.js";
import type { AiRegistry } from "../../../src/sim/world/step.js";
import { realHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";

const { layout, config } = laveFixture();

function spawn(
  world: World,
  kind: "ship" | "cargo" | "wreckage",
  ai: ReturnType<typeof createTestPilotAi> | null = null,
): number {
  const result = spawnEntity(
    world,
    {
      kind,
      specKey: kind === "ship" ? "adder" : "debris",
      scanClass: "CLASS_NEUTRAL",
      position: vec(100, 200, 300),
      orientation: identity(),
      radius: 30,
      maxEnergy: 85,
      ...(ai === null ? {} : { ai }),
    },
    0,
  );
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return result.entity.id;
}

function destroyed(
  events: readonly SimEvent[],
): Extract<SimEvent, { kind: "shipDestroyed" }>[] {
  return events.filter(
    (event): event is Extract<SimEvent, { kind: "shipDestroyed" }> =>
      event.kind === "shipDestroyed",
  );
}

function worldHash(world: World): string {
  return hashWorld(initFlightState(layout), world);
}

describe("killShip", () => {
  it("returns true once and false on the second call, with one shipDestroyed and one entityRemoved", () => {
    const world = createWorld(1);
    const id = spawn(world, "ship");
    const events: SimEvent[] = [];
    expect(killShip(world, id, PLAYER_ID, events)).toBe(true);
    expect(killShip(world, id, PLAYER_ID, events)).toBe(false);
    expect(destroyed(events)).toEqual([
      {
        kind: "shipDestroyed",
        id,
        position: { x: 100, y: 200, z: 300 },
        radius: 30,
        specKey: "adder",
        killer: PLAYER_ID,
      },
    ]);
    expect(world.store.get(id)).toBeUndefined();
    expect(commitWorld(world)).toEqual([id]);
    expect(commitWorld(world)).toEqual([]);
  });

  it("copies the position, so the event does not alias the entity", () => {
    const world = createWorld(1);
    const id = spawn(world, "ship");
    const entity = world.store.get(id);
    const events: SimEvent[] = [];
    killShip(world, id, PLAYER_ID, events);
    const [event] = destroyed(events);
    expect(event?.position).not.toBe(entity?.position);
  });

  it("marks a cargo or wreckage entity dead with no shipDestroyed", () => {
    const world = createWorld(1);
    const cargo = spawn(world, "cargo");
    const wreck = spawn(world, "wreckage");
    const events: SimEvent[] = [];
    expect(killShip(world, cargo, PLAYER_ID, events)).toBe(true);
    expect(killShip(world, wreck, PLAYER_ID, events)).toBe(true);
    expect(events).toEqual([]);
    expect(commitWorld(world)).toEqual([cargo, wreck]);
  });

  it.each([
    ["a missing id", 9999],
    ["NaN", Number.NaN],
    ["1.5", 1.5],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["the station", MAIN_STATION_ID],
    ["the witchpoint buoy", WITCHPOINT_BUOY_ID],
    ["the station buoy", STATION_NAV_BUOY_ID],
    ["the player", PLAYER_ID],
    ["NO_ENTITY", NO_ENTITY],
    ["a negative id", -1],
  ])("returns false for %s and leaves the world hash unchanged", (_, id) => {
    const world = createWorld(1);
    spawn(world, "ship");
    const before = worldHash(world);
    const events: SimEvent[] = [];
    expect(killShip(world, id, PLAYER_ID, events)).toBe(false);
    expect(events).toEqual([]);
    expect(worldHash(world)).toBe(before);
  });

  describe("the killer payload (D-04)", () => {
    function killerOf(
      killer: (world: World, victim: number) => number,
    ): number {
      const world = createWorld(1);
      const victim = spawn(world, "ship");
      const events: SimEvent[] = [];
      killShip(world, victim, killer(world, victim), events);
      const [event] = destroyed(events);
      if (event === undefined) throw new Error("no shipDestroyed");
      return event.killer;
    }

    it("keeps PLAYER_ID", () => {
      expect(killerOf(() => PLAYER_ID)).toBe(PLAYER_ID);
    });

    it("keeps a live ship", () => {
      let live = -1;
      const killer = killerOf((world) => {
        live = spawn(world, "ship");
        return live;
      });
      expect(killer).toBe(live);
    });

    it("records NO_ENTITY for NO_ENTITY, a missing id, a dead ship, the victim itself and a non-integer", () => {
      expect(killerOf(() => NO_ENTITY)).toBe(NO_ENTITY);
      expect(killerOf(() => 9999)).toBe(NO_ENTITY);
      expect(
        killerOf((world) => {
          const dead = spawn(world, "ship");
          world.store.kill(dead);
          return dead;
        }),
      ).toBe(NO_ENTITY);
      expect(killerOf((_, victim) => victim)).toBe(NO_ENTITY);
      expect(killerOf(() => 1.5)).toBe(NO_ENTITY);
      expect(killerOf(() => Number.NaN)).toBe(NO_ENTITY);
      expect(killerOf(() => -3)).toBe(NO_ENTITY);
      expect(killerOf(() => 2 ** 40)).toBe(NO_ENTITY);
    });

    it("records NO_ENTITY for a non-ship killer", () => {
      expect(killerOf((world) => spawn(world, "cargo"))).toBe(NO_ENTITY);
    });
  });

  describe("a same-tick mutual kill", () => {
    function mutual(order: "lowFirst" | "highFirst"): {
      low: number;
      high: number;
      killers: Map<number, number>;
    } {
      const world = createWorld(1);
      const low = spawn(world, "ship");
      const high = spawn(world, "ship");
      expect(low).toBeLessThan(high);
      const events: SimEvent[] = [];
      if (order === "lowFirst") {
        killShip(world, low, high, events);
        killShip(world, high, low, events);
      } else {
        killShip(world, high, low, events);
        killShip(world, low, high, events);
      }
      const killers = new Map(destroyed(events).map((e) => [e.id, e.killer]));
      return { low, high, killers };
    }

    it("credits the lower-id victim to the other ship and the higher-id victim NO_ENTITY when resolved in ascending victim id", () => {
      const { low, high, killers } = mutual("lowFirst");
      expect(killers.get(low)).toBe(high);
      expect(killers.get(high)).toBe(NO_ENTITY);
    });

    it("mirrors when the calls are made in the opposite order: the rule is 'killer alive at the call'", () => {
      const { low, high, killers } = mutual("highFirst");
      expect(killers.get(high)).toBe(low);
      expect(killers.get(low)).toBe(NO_ENTITY);
    });
  });
});

/** One event a recording module saw, with the id of the ship it was delivered to. */
interface Delivered {
  readonly to: number;
  readonly event: AiEvent;
}

/**
 * A registry whose "test-pilot" module only records the events it is delivered
 * (and runs `extra` for each, when given). It changes no behaviour of its own.
 */
function recorder(
  log: Delivered[],
  extra?: (ctx: AiContext, event: AiEvent) => void,
): AiRegistry {
  return {
    "test-pilot": {
      think: () => undefined,
      onEvent: (ctx, event) => {
        log.push({ to: ctx.self, event });
        extra?.(ctx, event);
      },
    },
  };
}

/** A ship whose AI is the recording module's key, never due to think. */
function spawnAi(world: World): number {
  const ai = createTestPilotAi(1_000_000);
  return spawn(world, "ship", ai);
}

function target(world: World, holder: number, victim: number): void {
  const entity = world.store.get(holder);
  if (entity === undefined) throw new Error(`no ship ${String(holder)}`);
  entity.nav.targetId = victim;
}

function drain(
  world: World,
  registry: AiRegistry,
  events: SimEvent[] = [],
): void {
  drainAiEventsNow(world, initFlightState(layout), layout, 0, events, registry);
}

describe("kill notifications (D-04)", () => {
  it("tells the holders of the victim and a live NPC killer, in order, and nobody else", () => {
    const world = createWorld(1);
    const bystander = spawnAi(world);
    const victim = spawnAi(world);
    const holderA = spawnAi(world);
    const holderB = spawnAi(world);
    const killer = spawnAi(world);
    target(world, holderB, victim);
    target(world, holderA, victim);
    target(world, bystander, holderA);
    const log: Delivered[] = [];
    const events: SimEvent[] = [];

    expect(killShip(world, victim, killer, events)).toBe(true);
    expect(world.aiQueue).toHaveLength(4);
    drain(world, recorder(log), events);

    expect(log).toEqual([
      { to: holderA, event: { to: holderA, name: "shipTargetLost" } },
      { to: holderB, event: { to: holderB, name: "shipTargetLost" } },
      {
        to: killer,
        event: { to: killer, name: "shipTargetDestroyed", a: victim },
      },
      {
        to: killer,
        event: { to: killer, name: "shipKilledOther", a: victim },
      },
    ]);
    expect(world.aiQueue).toEqual([]);
    expect(world.aiDropped).toBe(0);
  });

  it("tells a killer that also held the victim as its target all three events", () => {
    const world = createWorld(1);
    const victim = spawnAi(world);
    const killer = spawnAi(world);
    target(world, killer, victim);
    const log: Delivered[] = [];
    killShip(world, victim, killer, []);
    drain(world, recorder(log));
    expect(log.map((entry) => entry.event.name)).toEqual([
      "shipTargetLost",
      "shipTargetDestroyed",
      "shipKilledOther",
    ]);
  });

  it("tells nobody when the killer is the player, and the player is never notified", () => {
    const world = createWorld(1);
    const victim = spawnAi(world);
    spawnAi(world);
    const log: Delivered[] = [];
    killShip(world, victim, PLAYER_ID, []);
    expect(world.aiQueue).toEqual([]);
    drain(world, recorder(log));
    expect(log).toEqual([]);
  });

  it("posts nothing for a cargo or wreckage entity", () => {
    const world = createWorld(1);
    const cargo = spawn(world, "cargo");
    const holder = spawnAi(world);
    target(world, holder, cargo);
    killShip(world, cargo, holder, []);
    expect(world.aiQueue).toEqual([]);
  });

  it("tells nothing to a killer that was destroyed earlier in the pass (normalised to NO_ENTITY)", () => {
    const world = createWorld(1);
    const killer = spawnAi(world);
    const victim = spawnAi(world);
    const log: Delivered[] = [];
    const events: SimEvent[] = [];
    killShip(world, killer, PLAYER_ID, events);
    killShip(world, victim, killer, events);
    expect(destroyed(events).map((e) => e.killer)).toEqual([
      PLAYER_ID,
      NO_ENTITY,
    ]);
    expect(world.aiQueue).toEqual([]);
    drain(world, recorder(log));
    expect(log).toEqual([]);
  });

  it("delivers nothing to either dead ship of a mutual kill and spends no drop budget", () => {
    const world = createWorld(1);
    const low = spawnAi(world);
    const high = spawnAi(world);
    const log: Delivered[] = [];
    killShip(world, low, high, []);
    killShip(world, high, low, []);
    drain(world, recorder(log));
    expect(log).toEqual([]);
    expect(world.aiDropped).toBe(0);
    expect(world.aiQueue).toEqual([]);
  });

  it("changes nothing on an empty queue", () => {
    const world = createWorld(1);
    spawnAi(world);
    const before = worldHash(world);
    drain(world, recorder([]));
    expect(worldHash(world)).toBe(before);
  });

  it("leaves every other ship's nav and steer deep-equal", () => {
    const world = createWorld(1);
    const victim = spawnAi(world);
    const holder = spawnAi(world);
    const killer = spawnAi(world);
    const bystander = spawnAi(world);
    target(world, holder, victim);
    const others = [holder, killer, bystander];
    const before = others.map((id) => {
      const entity = world.store.get(id);
      return structuredClone({ nav: entity?.nav, steer: entity?.steer });
    });
    killShip(world, victim, killer, []);
    drain(world, recorder([]));
    commitWorld(world);
    const after = others.map((id) => {
      const entity = world.store.get(id);
      return structuredClone({ nav: entity?.nav, steer: entity?.steer });
    });
    expect(after).toEqual(before);
  });

  it("discards a fire request made by a handler during the drain, keeping the entry length", () => {
    const world = createWorld(1);
    const victim = spawnAi(world);
    const holder = spawnAi(world);
    const other = spawnAi(world);
    target(world, holder, victim);
    world.fireQueue.push(other);
    killShip(world, victim, PLAYER_ID, []);
    drain(
      world,
      recorder([], (ctx) => {
        ctx.ctl.fire(ctx.self);
      }),
    );
    expect(world.fireQueue).toEqual([other]);
    world.fireQueue.length = 0;
    commitWorld(world);
    expect(() => snapshotWorld(world)).not.toThrow();
  });

  it("counts a fan-out beyond the queue cap in aiDropped and does not throw", () => {
    const world = createWorld(1);
    const bystander = spawnAi(world);
    const victim = spawnAi(world);
    const killer = spawnAi(world);
    for (let i = 0; i < 5; i += 1) target(world, spawnAi(world), victim);
    for (let i = 0; i < MAX_AI_QUEUE_LENGTH - 1; i += 1) {
      world.aiQueue.push({ to: bystander, name: "shipAIFrustrated" });
    }
    expect(world.aiDropped).toBe(0);
    killShip(world, victim, killer, []);
    // Five holders and the killer's pair post 7 events; one fits.
    expect(world.aiQueue).toHaveLength(MAX_AI_QUEUE_LENGTH);
    expect(world.aiDropped).toBe(6);
    drain(world, recorder([]));
    expect(world.aiQueue).toEqual([]);
    expect(world.aiDropped).toBe(6);
  });

  it("gives a holder whose handler changes nothing shipTargetLost twice: at kill time, then from its own steering (Pitfall 9)", () => {
    const world = createWorld(1);
    const player = initFlightState(layout);
    const victim = spawnAi(world);
    const holder = spawnAi(world);
    const entity = world.store.get(holder);
    if (entity === undefined) throw new Error("no holder");
    entity.nav.targetId = victim;
    entity.nav.behaviour = "FLEE_TARGET";
    const log: Delivered[] = [];
    const registry = recorder(log);

    killShip(world, victim, PLAYER_ID, []);
    drainAiEventsNow(world, player, layout, 0, [], registry);
    commitWorld(world);
    expect(log.map((entry) => entry.event)).toEqual([
      { to: holder, name: "shipTargetLost" },
    ]);

    stepFlight(player, layout, config, ZERO_INTENT, [], DT);
    stepWorld(world, player, layout, DT, registry);
    expect(log.map((entry) => entry.event)).toEqual([
      { to: holder, name: "shipTargetLost" },
      { to: holder, name: "shipTargetLost" },
    ]);
    expect(world.store.get(holder)?.nav.targetId).toBe(0);
  });
});

const VIPER_BEAM: NpcWeapon = {
  laser: "EQ_WEAPON_BEAM_LASER",
  offset: vec(0, -0.15000000596046448, 35.034400939941406),
};
const FACING_PLUS_Z: Quat = { w: 0, x: 0, y: 1, z: 0 };

/** A player launched and flying, parked far from the station and the planet. */
function flyingPlayerAtFar(): FlightState {
  const player = initFlightState(layout);
  stepFlight(player, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
  stepFlight(player, layout, config, ZERO_INTENT, [{ kind: "skipLaunch" }], DT);
  player.position = vec(1e7, 0, 0);
  player.orientation = identity();
  player.speed = 0;
  return player;
}

/** A ship with the test-pilot AI (never due to think) at `position`. */
function spawnShipAt(
  world: World,
  specKey: string,
  position: ReturnType<typeof vec>,
  orientation: Quat,
): number {
  const result = spawnEntity(
    world,
    {
      kind: "ship",
      specKey,
      scanClass: "CLASS_NEUTRAL",
      position,
      orientation,
      radius: 30,
      maxEnergy: specKey === "adder" ? 85 : 180,
      ai: createTestPilotAi(1_000_000),
    },
    0,
  );
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return result.entity.id;
}

describe("the immediate drain inside resolveShots", () => {
  /** A viper at -1500 firing +Z, an energy-1 adder at -800 in its beam, a holder of the adder. */
  function lethalWorld(): {
    world: World;
    player: FlightState;
    victim: number;
    killer: number;
    holder: number;
    shots: ShotRequest[];
  } {
    const player = flyingPlayerAtFar();
    const world = createWorld(7);
    const victim = spawnShipAt(world, "adder", vec(1e7, 0, -800), identity());
    const killer = spawnShipAt(
      world,
      "viper",
      vec(1e7, 0, -1500),
      FACING_PLUS_Z,
    );
    const holder = spawnShipAt(
      world,
      "adder",
      vec(1e7, 5000, -800),
      identity(),
    );
    const victimEntity = world.store.get(victim);
    const killerEntity = world.store.get(killer);
    if (victimEntity === undefined || killerEntity === undefined) {
      throw new Error("spawn failed");
    }
    victimEntity.energy = 1;
    target(world, holder, victim);
    const ray = npcLaserRay(killerEntity, VIPER_BEAM);
    if (ray === null) throw new Error("no ray");
    return {
      world,
      player,
      victim,
      killer,
      holder,
      shots: [{ shooter: killer, ray, laser: "EQ_WEAPON_BEAM_LASER" }],
    };
  }

  const OPTIONS: StepOptions = {
    combat: {
      mounts: DEFAULT_LASER_MOUNTS,
      hulls: realHullTable(),
      npcWeapons: new Map([["viper", VIPER_BEAM]]),
    },
  };

  it("delivers the kill's events before the second commit, so the boundary holds no queued event or fire request", () => {
    const { world, player, victim, killer, holder, shots } = lethalWorld();
    const log: Delivered[] = [];
    const registry = recorder(log, (ctx) => {
      ctx.ctl.fire(ctx.self);
    });
    const events = resolveShots(
      world,
      true,
      player,
      undefined,
      shots,
      OPTIONS,
      DT,
      layout,
      registry,
    );
    expect(events.map((event) => event.kind)).toEqual([
      "laserFired",
      "shipHit",
      "shipDestroyed",
      "entityRemoved",
    ]);
    expect(log.map((entry) => [entry.to, entry.event.name])).toEqual([
      [holder, "shipTargetLost"],
      [killer, "shipTargetDestroyed"],
      [killer, "shipKilledOther"],
    ]);
    expect(world.aiQueue).toEqual([]);
    expect(world.fireQueue).toEqual([]);
    expect(world.store.get(victim)).toBeUndefined();
    expect(() => snapshotWorld(world)).not.toThrow();
  });

  it("puts an aiFaulted from the drain between shipDestroyed and entityRemoved", () => {
    const { world, player, shots } = lethalWorld();
    const registry = recorder([], (ctx, event) => {
      if (event.name === "shipTargetLost")
        throw new Error(`fault ${String(ctx.self)}`);
    });
    const events = resolveShots(
      world,
      true,
      player,
      undefined,
      shots,
      OPTIONS,
      DT,
      layout,
      registry,
    );
    expect(events.map((event) => event.kind)).toEqual([
      "laserFired",
      "shipHit",
      "shipDestroyed",
      "aiFaulted",
      "entityRemoved",
    ]);
  });
});

describe("a test shooter's lethal shot through stepSim", () => {
  it("ends the tick with empty queues and no dead entity", () => {
    const player = flyingPlayerAtFar();
    const world = createWorld(7);
    const victimSpawn = spawnEntity(
      world,
      {
        kind: "ship",
        specKey: "adder",
        scanClass: "CLASS_NEUTRAL",
        position: vec(1e7, 0, -800),
        orientation: identity(),
        radius: 30,
        maxEnergy: 85,
      },
      0,
    );
    if (!victimSpawn.ok) throw new Error("victim refused");
    const victim = victimSpawn.entity.id;
    victimSpawn.entity.energy = 1;
    const ai = createTestPilotAi(0, { fire: true });
    ai.params.phase = "hold";
    ai.params.targetId = victim;
    const shooterSpawn = spawnEntity(
      world,
      {
        kind: "ship",
        specKey: "viper",
        scanClass: "CLASS_NEUTRAL",
        position: vec(1e7, 0, -1500),
        orientation: FACING_PLUS_Z,
        radius: 30,
        maxEnergy: 180,
        ai,
      },
      0,
    );
    if (!shooterSpawn.ok) throw new Error("shooter refused");
    const shooter = shooterSpawn.entity.id;
    const options: StepOptions = {
      combat: {
        mounts: DEFAULT_LASER_MOUNTS,
        hulls: realHullTable(),
        npcWeapons: new Map([["viper", VIPER_BEAM]]),
      },
    };
    const combat = createPlayerCombatState();

    const events = stepSim(
      player,
      world,
      layout,
      config,
      ZERO_INTENT,
      [],
      DT,
      options,
      combat,
    );

    expect(destroyed(events)).toMatchObject([{ id: victim, killer: shooter }]);
    expect(
      events.some((e) => e.kind === "entityRemoved" && e.id === victim),
    ).toBe(true);
    expect(world.aiQueue).toEqual([]);
    expect(world.fireQueue).toEqual([]);
    expect(world.store.live.some((entity) => entity.dead)).toBe(false);
    expect(world.store.get(victim)).toBeUndefined();
    expect(() => snapshotWorld(world)).not.toThrow();
  });
});
