// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `killShip`, the one idempotent kill path (FOUND-19, D-02, D-04, D-13), and
 * the notifications it posts (D-04) with the immediate drain that delivers them
 * (`drainAiEventsNow`, D-12). The plan-15-04 cases kill with ships that have no
 * AI, so none of them snapshots or asserts an empty queue after a kill with a
 * live NPC killer, and none needed an added drain.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createFlightScriptAi } from "../../../src/sim/ai/pilots/flight-script.js";
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
import {
  NAV_BUOY_HULL_MASS,
  NAV_BUOY_MASS,
} from "../../../src/sim/hyperspace/countdown.js";
import { identity, vec } from "../../../src/sim/math.js";
import type { Quat, Vec3 } from "../../../src/sim/math.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT } from "../../../src/sim/time.js";
import {
  MAIN_STATION_ID,
  NO_ENTITY,
  PLAYER_ID,
  STATION_NAV_BUOY_ID,
  WITCHPOINT_BUOY_ID,
} from "../../../src/sim/world/ids.js";
import { createRngState, rngNext } from "../../../src/sim/rng.js";
import { clampDebrisVelocity } from "../../../src/sim/world/debris.js";
import type {
  BlastPush,
  DebrisContent,
  DebrisHull,
} from "../../../src/sim/world/debris.js";
import { MAX_ENTITY_VELOCITY } from "../../../src/sim/world/limits.js";
import type { Entity } from "../../../src/sim/world/entity.js";
import { destroyBuoy, killShip } from "../../../src/sim/world/kill.js";
import { staticTargetById } from "../../../src/sim/world/statics.js";
import type { StaticTarget } from "../../../src/sim/world/statics.js";
import { sanitizeEntity } from "../../../src/sim/world/sanitize.js";
import { hashWorld } from "../../../src/sim/world/serialize.js";
import { snapshotWorld } from "../../../src/sim/world/snapshot.js";
import {
  MAX_AI_QUEUE_LENGTH,
  commitWorld,
  createWorld,
  isPristineBuoyStates,
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
import { debrisFixture } from "../../helpers/debris-fixture.js";
import { laveFixture } from "../../helpers/lave.js";
import { realNpcFlightTable } from "../../helpers/npc-flight.js";
import { realNpcWeapons } from "../../helpers/npc-weapons.js";
import {
  BLAST_FIXTURE_FILE,
  BlastFileSchema,
  withinTolerance,
} from "../../oracles/combat/response/schema.js";
import type { BlastFixture } from "../../oracles/combat/response/schema.js";

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

/**
 * Bound on the tick of a freshly spawned shooter's first shot, counted from the
 * spawn. A new ship has lastShotTick 0 and the NPC gate skips the shot timer
 * for 0 (src/sim/npc/fire.ts), so the first shot comes on the first tick whose
 * range roll passes: this is a roll bound, and the beam period plays no part.
 */
const FIRST_SHOT_BOUND_TICKS = 13;

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

    // D-08: the shooter's shot is the gate's, so the kill comes on the first
    // tick whose range roll passes, within FIRST_SHOT_BOUND_TICKS of the spawn
    // (a roll bound, not the beam period); every tick before it also ends with
    // empty queues and no dead entity.
    let events: SimEvent[] = [];
    for (
      let i = 0;
      i < FIRST_SHOT_BOUND_TICKS && destroyed(events).length === 0;
      i += 1
    ) {
      events = stepSim(
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
      expect(world.aiQueue).toEqual([]);
      expect(world.fireQueue).toEqual([]);
      expect(world.store.live.some((entity) => entity.dead)).toBe(false);
    }

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

describe("the post-drain repair (T-15-20)", () => {
  it("repairs an out-of-domain write by a handler before the boundary and counts it once", () => {
    const world = createWorld(1);
    const victim = spawnAi(world);
    const bad = spawnAi(world);
    const good = spawn(
      world,
      "ship",
      createFlightScriptAi(1_000_000, { script: "face" }),
    );
    target(world, bad, victim);
    target(world, good, victim);
    const registry: AiRegistry = {
      "test-pilot": {
        think: () => undefined,
        onEvent: (ctx) => {
          ctx.ai.params.x = Number.NaN;
        },
      },
      "flight-script": {
        think: () => undefined,
        onEvent: (ctx) => {
          ctx.ai.params.y = 5;
        },
      },
    };
    const repairsOf = (id: number): number =>
      world.store.get(id)?.repairs ?? -1;
    const badBefore = repairsOf(bad);
    const goodBefore = repairsOf(good);

    killShip(world, victim, PLAYER_ID, []);
    drain(world, registry);
    commitWorld(world);

    expect(() => snapshotWorld(world)).not.toThrow();
    expect(() => worldHash(world)).not.toThrow();
    expect(repairsOf(bad)).toBe(badBefore + 1);
    expect(repairsOf(good)).toBe(goodBefore);
  });
});

describe("survivors holding the dead ship's id (T-15-21)", () => {
  it("keep flying under stepSim for 120 ticks with no throw, fault or repair", () => {
    const player = flyingPlayerAtFar();
    const world = createWorld(7);
    const flight = realNpcFlightTable();
    const options: StepOptions = {
      npcFlight: flight,
      combat: {
        mounts: DEFAULT_LASER_MOUNTS,
        hulls: realHullTable(),
        npcWeapons: realNpcWeapons(),
      },
    };
    const at = (x: number, y: number, z: number) =>
      vec(player.position.x + x, player.position.y + y, player.position.z + z);
    const place = (
      specKey: string,
      position: ReturnType<typeof vec>,
      ai: ReturnType<typeof createTestPilotAi>,
      extra: { ownerId?: number; escortSlot?: number } = {},
    ): number => {
      const result = spawnEntity(
        world,
        {
          kind: "ship",
          specKey,
          scanClass: "CLASS_NEUTRAL",
          position,
          orientation: identity(),
          radius: 30,
          speed: 0,
          ai,
          ...extra,
        },
        0,
      );
      if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
      return result.entity.id;
    };

    const victim = place(
      "viper",
      at(0, 0, -3000),
      createFlightScriptAi(0, { script: "face" }),
    );
    const follower = place(
      "adder",
      at(400, 0, -3300),
      createFlightScriptAi(0, { script: "escort", range: 300 }),
      { ownerId: victim, escortSlot: 1 },
    );
    const attacker = place(
      "adder",
      at(-600, 0, -3500),
      createFlightScriptAi(0, {
        script: "attack",
        targetId: victim,
        range: 1000,
      }),
    );
    const stationShip = place(
      "adder",
      at(900, 300, -3600),
      createFlightScriptAi(0, { script: "station", range: 2500, speed: 100 }),
    );
    // Created with a scan range below its distance to every other body, so after
    // it drops the dead id its seek finds nothing and it stays in seek.
    const pilotAi = createTestPilotAi(0, { scanRange: 100 });
    pilotAi.params.phase = "hold";
    pilotAi.params.targetId = victim;
    const pilot = place("adder", at(30_000, 0, -3000), pilotAi);
    const survivors = [follower, attacker, stationShip, pilot];

    const run = (): SimEvent[] =>
      stepSim(
        player,
        world,
        layout,
        config,
        ZERO_INTENT,
        [],
        DT,
        options,
        undefined,
      );
    const entity = (id: number) => {
      const found = world.store.get(id);
      if (found === undefined) throw new Error(`ship ${String(id)} is gone`);
      return found;
    };

    // Warm up until the attacker's first think has set its target.
    for (
      let i = 0;
      i < 30 && entity(attacker).nav.targetId !== victim;
      i += 1
    ) {
      run();
    }
    expect(entity(attacker).nav.targetId).toBe(victim);
    expect(entity(follower).ownerId).toBe(victim);

    // Set after the warm-up: `runProximityPass` rewrites alerts every tick.
    const holder = entity(stationShip);
    holder.steer.proximityAlert = victim;
    holder.steer.saved = {
      behaviour: "FLY_TO_DESTINATION",
      targetId: victim,
      desiredRange: 0,
      desiredSpeed: 100,
      destination: at(0, 0, -5000),
    };
    holder.nav.behaviour = "AVOID_COLLISION";
    const repairsBefore = survivors.map((id) => entity(id).repairs);

    // The tail `resolveShots` runs: kill, immediate drain, commit.
    const tail: SimEvent[] = [];
    expect(killShip(world, victim, PLAYER_ID, tail)).toBe(true);
    drainAiEventsNow(world, player, layout, player.tick, tail);
    commitWorld(world);
    expect(world.store.get(victim)).toBeUndefined();
    expect(entity(attacker).ai?.params.phase).toBe("done");

    const boundaryHolds = (): void => {
      expect(world.store.live.some((e) => e.dead)).toBe(false);
      expect(world.aiQueue).toEqual([]);
      expect(world.fireQueue).toEqual([]);
      expect(() => snapshotWorld(world)).not.toThrow();
    };
    boundaryHolds();

    const phases: string[] = [];
    let heldAgain = false;
    for (let i = 0; i < 120; i += 1) {
      const events = run();
      expect(events.some((event) => event.kind === "aiFaulted")).toBe(false);
      const params = entity(pilot).ai?.params;
      phases.push(String(params?.phase));
      if (params?.phase === "hold" && params.targetId === victim && i >= 15) {
        heldAgain = true;
      }
      if (params?.phase === "seek") expect(params.targetId).toBe(NO_ENTITY);
      boundaryHolds();
    }

    expect(survivors.map((id) => entity(id).repairs)).toEqual(repairsBefore);
    expect(survivors.every((id) => entity(id).ai !== null)).toBe(true);
    // The pilot left hold within one think interval of the kill (15 ticks),
    // never held the victim's id again, and is still in seek at the end.
    expect(phases.indexOf("seek")).toBeGreaterThanOrEqual(0);
    expect(phases.indexOf("seek")).toBeLessThan(15);
    expect(heldAgain).toBe(false);
    expect(
      phases.slice(phases.indexOf("seek")).every((p) => p === "seek"),
    ).toBe(true);
    expect(entity(pilot).ai?.params.targetId).toBe(NO_ENTITY);
    expect(entity(attacker).ai?.params.phase).toBe("done");
  });
});

describe("killShip with a debris context: totality and idempotence (D-15, plan 16-02)", () => {
  const CONTENT = debrisFixture();

  function shipWith(
    seed: number,
    specKey = "adder",
    cargo = 20,
  ): { world: World; victim: Entity } {
    const world = createWorld(seed);
    const result = spawnEntity(
      world,
      {
        kind: "ship",
        specKey,
        scanClass: "CLASS_NEUTRAL",
        position: vec(100, 200, 300),
        orientation: identity(),
        radius: 30,
        maxEnergy: 85,
        cargo,
      },
      0,
    );
    if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
    return { world, victim: result.entity };
  }

  function pods(world: World): Entity[] {
    return world.store.live.filter(
      (e) => !e.dead && e.kind === "cargo" && e.specKey === "barrel",
    );
  }

  /** Every live debris piece other than a pod (wrecks, from plan 16-04 plates). */
  function otherDebris(world: World): Entity[] {
    return world.store.live.filter(
      (e) =>
        !e.dead &&
        (e.kind === "wreckage" ||
          (e.kind === "cargo" && e.specKey !== "barrel")),
    );
  }

  /** Kill with `content`; assert no throw, no repair needed, at most 15 pods. */
  function killTotal(
    world: World,
    victim: Entity,
    content: DebrisContent,
  ): number {
    let killed = false;
    expect(() => {
      killed = killShip(world, victim.id, PLAYER_ID, [], { tick: 1, content });
    }).not.toThrow();
    expect(killed).toBe(true);
    for (const entity of world.store.live) {
      if (!entity.dead) expect(sanitizeEntity(entity)).toBe(false);
    }
    expect(pods(world).length).toBeLessThanOrEqual(15);
    return victim.rng.combat;
  }

  function withHull(hull: Partial<DebrisHull>): DebrisContent {
    const base = CONTENT.hulls.get("adder");
    if (base === undefined) throw new Error("no adder hull");
    const hulls = new Map(CONTENT.hulls);
    hulls.set("adder", { ...base, ...hull });
    return { ...CONTENT, hulls };
  }

  it("tolerates an unknown spec key, bad masses, a NaN box and no wrecks", () => {
    const unknown = shipWith(3, "nonesuch");
    killTotal(unknown.world, unknown.victim, CONTENT);
    expect(pods(unknown.world).length).toBeGreaterThan(0);

    const nanBox = {
      min: vec(Number.NaN, Number.NaN, Number.NaN),
      max: vec(Number.POSITIVE_INFINITY, 0, Number.NaN),
    };
    const variants: DebrisContent[] = [
      withHull({ mass: Number.NaN }),
      withHull({ mass: -1 }),
      withHull({ fragmentChance: Number.NaN }),
      withHull({ boundingBox: nanBox }),
      { ...CONTENT, wrecks: [] },
      { ...CONTENT, plate: { key: "alloy", mass: Number.NaN, radius: -1 } },
      { ...CONTENT, hulls: null as unknown as DebrisContent["hulls"] },
    ];
    for (const content of variants) {
      const { world, victim } = shipWith(3);
      killTotal(world, victim, content);
      expect(pods(world).length).toBeGreaterThan(0);
    }
  });

  it("a bad pod model refuses every pod but takes the same draws", () => {
    const reference = shipWith(4, "adder", 200);
    const finalStream = killTotal(reference.world, reference.victim, CONTENT);
    expect(pods(reference.world).length).toBeGreaterThan(0);
    const badPods: DebrisContent[] = [
      { ...CONTENT, pod: { key: "barrel", mass: 993, radius: 0 } },
      { ...CONTENT, pod: { key: "barrel", mass: 993, radius: Number.NaN } },
      { ...CONTENT, pod: { key: "", mass: 993, radius: 5 } },
      { ...CONTENT, pod: null as unknown as DebrisContent["pod"] },
    ];
    for (const content of badPods) {
      const { world, victim } = shipWith(4, "adder", 200);
      const nextId = world.store.nextId;
      expect(killTotal(world, victim, content)).toBe(finalStream);
      expect(pods(world)).toHaveLength(0);
      // Only the pieces after the pods (wrecks, plates) took ids.
      expect(world.store.nextId).toBe(nextId + otherDebris(world).length);
      expect(otherDebris(world)).toHaveLength(
        otherDebris(reference.world).length,
      );
    }
  });

  it("a cargo count outside the domain examines no capsule", () => {
    for (const cargo of [-1, 1.5, Number.NaN, 1e9]) {
      const { world, victim } = shipWith(6);
      victim.cargo = cargo;
      const start = victim.rng.combat;
      killTotal(world, victim, CONTENT);
      expect(pods(world)).toHaveLength(0);
      // Only the canFragment draw was taken.
      const probe = createRngState(start);
      rngNext(probe);
      expect(victim.rng.combat).toBe(probe.s);
    }
  });

  it("released pods are in the domain with no repair, even at the velocity bound", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { world, victim } = shipWith(seed, "adder", 200);
      victim.velocity = vec(1e4, -1e4, 9999.5);
      killTotal(world, victim, CONTENT);
      const released = pods(world);
      expect(released.length).toBeGreaterThan(0);
      for (const pod of released) {
        expect(Math.abs(pod.velocity.x)).toBeLessThanOrEqual(1e4);
        expect(Math.abs(pod.velocity.y)).toBeLessThanOrEqual(1e4);
        expect(Math.abs(pod.velocity.z)).toBeLessThanOrEqual(1e4);
        expect(pod.energy).toBe(1);
        expect(pod.maxEnergy).toBe(1);
        expect(pod.repairs).toBe(0);
      }
    }
  });

  it("clampDebrisVelocity zeroes non-finite and -0 and clamps to the bound", () => {
    const v = clampDebrisVelocity(vec(Number.NaN, 2e4, -2e4));
    expect(v).toEqual(vec(0, 1e4, -1e4));
    const z = clampDebrisVelocity(vec(-0, Number.NEGATIVE_INFINITY, -5));
    expect(Object.is(z.x, 0)).toBe(true);
    expect(z.y).toBe(0);
    expect(z.z).toBe(-5);
  });

  it("a second kill of the same victim returns false and releases nothing", () => {
    const { world, victim } = shipWith(8, "adder", 200);
    killTotal(world, victim, CONTENT);
    const nextId = world.store.nextId;
    const count = pods(world).length;
    const stream = victim.rng.combat;
    expect(
      killShip(world, victim.id, PLAYER_ID, [], { tick: 2, content: CONTENT }),
    ).toBe(false);
    expect(world.store.nextId).toBe(nextId);
    expect(pods(world)).toHaveLength(count);
    expect(victim.rng.combat).toBe(stream);
  });
});

/*
 * `destroyBuoy` (CBT-17, plan 18-05, D-04, D-13): a buoy brought to 0 energy is
 * announced once with its live position and stays in `world.statics`; it never
 * enters the store.
 */
describe("destroyBuoy (D-04, D-13)", () => {
  function buoyRow(id: number): StaticTarget {
    const row = staticTargetById(id);
    if (row === undefined) throw new Error(`no static row ${id}`);
    return row;
  }

  it("emits one shipDestroyed with the live position, the layout radius and the ident key", () => {
    const world = createWorld(1);
    const statics = world.statics;
    world.buoys.navBuoy.offset = { x: 50, y: 0, z: -2 };
    world.staticHealth.navBuoy = 0;
    const nextId = world.store.nextId;
    const events: SimEvent[] = [];

    expect(
      destroyBuoy(
        world,
        buoyRow(STATION_NAV_BUOY_ID),
        PLAYER_ID,
        events,
        layout,
      ),
    ).toBe(true);

    const base = layout.navBuoy.position;
    expect(events).toEqual([
      {
        kind: "shipDestroyed",
        id: STATION_NAV_BUOY_ID,
        position: { x: base.x + 50, y: base.y, z: base.z - 2 },
        radius: layout.navBuoy.radius,
        specKey: "buoy",
        killer: PLAYER_ID,
      },
    ]);
    // The event's position is a copy, not the world's offset or the layout's.
    const event = events[0];
    if (event?.kind !== "shipDestroyed") throw new Error("no event");
    expect(event.position).not.toBe(layout.navBuoy.position);
    // Never in the store, never out of the statics (D-13).
    expect(world.statics).toBe(statics);
    expect(world.statics.map((s) => s.id)).toContain(STATION_NAV_BUOY_ID);
    expect(world.store.get(STATION_NAV_BUOY_ID)).toBeUndefined();
    expect(world.store.nextId).toBe(nextId);
    expect(world.staticHealth.navBuoy).toBe(0);
  });

  it("names the witchpoint buoy by its own ident key", () => {
    const world = createWorld(1);
    world.staticHealth.witchpoint = 0;
    const events: SimEvent[] = [];
    destroyBuoy(world, buoyRow(WITCHPOINT_BUOY_ID), PLAYER_ID, events, layout);
    expect(events).toEqual([
      {
        kind: "shipDestroyed",
        id: WITCHPOINT_BUOY_ID,
        position: { ...layout.witchpoint.position },
        radius: layout.witchpoint.radius,
        specKey: "buoy-witchpoint",
        killer: PLAYER_ID,
      },
    ]);
  });

  it("does nothing unless the health is 0, and never for the station", () => {
    const world = createWorld(1);
    const before = worldHash(world);
    const events: SimEvent[] = [];
    world.staticHealth.navBuoy = 1e-9;
    expect(
      destroyBuoy(
        world,
        buoyRow(STATION_NAV_BUOY_ID),
        PLAYER_ID,
        events,
        layout,
      ),
    ).toBe(false);
    world.staticHealth.navBuoy = 250;
    world.staticHealth.station = 0;
    expect(
      destroyBuoy(world, buoyRow(MAIN_STATION_ID), PLAYER_ID, events, layout),
    ).toBe(false);
    world.staticHealth.station = 25000;
    expect(events).toEqual([]);
    expect(worldHash(world)).toBe(before);
  });

  it("normalises the killer as killShip does (D-04)", () => {
    const world = createWorld(1);
    const live = spawn(world, "ship");
    const dead = spawn(world, "ship");
    world.store.kill(dead);
    const killers: number[] = [];
    for (const killer of [
      PLAYER_ID,
      live,
      dead,
      9999,
      Number.NaN,
      STATION_NAV_BUOY_ID,
      NO_ENTITY,
    ]) {
      world.staticHealth.navBuoy = 0;
      const events: SimEvent[] = [];
      destroyBuoy(world, buoyRow(STATION_NAV_BUOY_ID), killer, events, layout);
      const event = events[0];
      if (event?.kind !== "shipDestroyed") throw new Error("no event");
      killers.push(event.killer);
    }
    expect(killers).toEqual([
      PLAYER_ID,
      live,
      NO_ENTITY,
      NO_ENTITY,
      NO_ENTITY,
      NO_ENTITY,
      NO_ENTITY,
    ]);
  });
});

/**
 * The blast's sources and receivers (Phase 18, D-03, PD-02): every exploding
 * body pushes every movable body in range by `ShipEntity.m:7680-7698` and
 * `11178-11181`. The expectations are written from the C (`amount = 0.125 x
 * mass`, `desired_range = 2.5 x radius`, `d2 = |p|^2 - r_receiver^2` floored
 * at 0.1, `dv = amount x desired_range / d2 / receiver mass` along the unit
 * vector from the source) or read from the 18-03 fixtures.
 */
describe("the blast's sources and receivers (D-03, PD-02)", () => {
  const KRAIT = { mass: 93291.40625, radius: 50.196590423583984 };
  const SHUTTLE = { mass: 11317.5634765625, radius: 22.7517147064209 };

  /** The C's push magnitude, by hand (no port call). */
  function push(
    source: { readonly mass: number; readonly radius: number },
    distance: number,
    receiverRadius: number,
    receiverMass: number,
  ): number {
    const amount = 0.125 * source.mass;
    const range = 2.5 * source.radius;
    const d2 = Math.max(0.1, distance * distance - receiverRadius ** 2);
    return (amount * range) / d2 / receiverMass;
  }

  function relClose(actual: number, expected: number): void {
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(
      1e-12 * Math.abs(expected),
    );
  }

  function readBlast(id: string): BlastFixture {
    const fixtures = BlastFileSchema.parse(
      JSON.parse(
        readFileSync(
          new URL(
            `../../oracles/combat/response/${BLAST_FIXTURE_FILE}`,
            import.meta.url,
          ),
          "utf8",
        ),
      ) as unknown,
    );
    const fixture = fixtures.find((f) => f.id === id);
    if (fixture === undefined) throw new Error(`no fixture ${id}`);
    return fixture;
  }

  /** The Krait victim's content: no fragment, so the blast is all it releases. */
  function kraitContent(extra: Record<string, number> = {}): DebrisContent {
    const hulls = new Map<string, DebrisHull>();
    const box = { min: vec(0, 0, 0), max: vec(0, 0, 0) };
    hulls.set("krait", {
      mass: KRAIT.mass,
      fragmentChance: 0,
      boundingBox: box,
    });
    hulls.set("shuttle", {
      mass: SHUTTLE.mass,
      fragmentChance: 0,
      boundingBox: box,
    });
    for (const [key, mass] of Object.entries(extra)) {
      hulls.set(key, { mass, fragmentChance: 0, boundingBox: box });
    }
    return { ...debrisFixture(), hulls };
  }

  function ship(
    world: World,
    specKey: string,
    position: Vec3,
    radius: number,
  ): Entity {
    const result = spawnEntity(
      world,
      {
        kind: "ship",
        specKey,
        scanClass: "CLASS_NEUTRAL",
        position,
        orientation: identity(),
        radius,
        maxEnergy: 85,
        cargo: 0,
      },
      0,
    );
    if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
    return result.entity;
  }

  function piece(
    world: World,
    specKey: string,
    position: Vec3,
    radius: number,
  ): Entity {
    const result = spawnEntity(
      world,
      {
        kind: "cargo",
        specKey,
        scanClass: "CLASS_CARGO",
        position,
        orientation: identity(),
        radius,
        speed: 0,
        ai: null,
        maxEnergy: 1,
        energyRechargeRate: 0,
      },
      0,
    );
    if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
    return result.entity;
  }

  const at = (base: Vec3, x: number, y: number, z: number): Vec3 =>
    vec(base.x + x, base.y + y, base.z + z);

  it("a Krait's blast pushes a live NPC in range by its hull mass; a ship with no mass entry, one out of range and the victim are not pushed", () => {
    const world = createWorld(1);
    const centre = vec(100, 200, 300);
    const victim = ship(world, "krait", centre, KRAIT.radius);
    victim.velocity = vec(1, 2, 3);
    const shuttle = ship(
      world,
      "shuttle",
      at(centre, 60, 0, 0),
      SHUTTLE.radius,
    );
    const unknown = ship(world, "nonesuch", at(centre, 0, 60, 0), 20);
    const far = ship(world, "shuttle", at(centre, 0, 0, 149), SHUTTLE.radius);
    killShip(world, victim.id, PLAYER_ID, [], {
      tick: 1,
      content: kraitContent(),
    });
    relClose(shuttle.velocity.x, push(KRAIT, 60, SHUTTLE.radius, SHUTTLE.mass));
    expect(shuttle.velocity.y).toBe(0);
    expect(shuttle.velocity.z).toBe(0);
    expect(unknown.velocity).toEqual(vec(0, 0, 0));
    // 149 m is beyond 125.491 + 22.752 = 148.243 m.
    expect(far.velocity).toEqual(vec(0, 0, 0));
    expect(victim.velocity).toEqual(vec(1, 2, 3));
  });

  it("a live buoy in range is pushed with its live mass and layout radius; detached, with the hull-only mass; a destroyed buoy and the station never move", () => {
    const run = (prepare: (world: World) => void, near: Vec3): World => {
      const world = createWorld(1);
      prepare(world);
      const victim = ship(world, "krait", near, KRAIT.radius);
      killShip(world, victim.id, PLAYER_ID, [], {
        tick: 1,
        content: kraitContent(),
        layout,
      });
      return world;
    };
    const buoy = layout.navBuoy;
    // 150 m out along +z, inside 125.491 + 59.136 = 184.627 m.
    const near = at(buoy.position, 0, 0, 150);
    const attached = run(() => undefined, near);
    relClose(
      attached.buoys.navBuoy.velocity.z,
      -push(KRAIT, 150, buoy.radius, NAV_BUOY_MASS),
    );
    expect(attached.buoys.navBuoy.velocity.x).toBe(0);
    expect(attached.buoys.navBuoy.offset).toEqual(vec(0, 0, 0));
    expect(attached.buoys.witchpoint.velocity).toEqual(vec(0, 0, 0));

    const detached = run((w) => {
      w.buoys.navBuoy.subentityEnergy = 0;
    }, near);
    relClose(
      detached.buoys.navBuoy.velocity.z,
      -push(KRAIT, 150, buoy.radius, NAV_BUOY_HULL_MASS),
    );

    const destroyedBuoy = run((w) => {
      w.staticHealth.navBuoy = 0;
    }, near);
    expect(destroyedBuoy.buoys.navBuoy.velocity).toEqual(vec(0, 0, 0));

    // Without the layout in the context no buoy is a receiver.
    const world = createWorld(1);
    const victim = ship(world, "krait", near, KRAIT.radius);
    killShip(world, victim.id, PLAYER_ID, [], {
      tick: 1,
      content: kraitContent(),
    });
    expect(isPristineBuoyStates(world.buoys)).toBe(true);

    // The station is never a receiver: a kill touching its sphere moves
    // nothing (it has no velocity state; T-18-32).
    const station = run(
      () => undefined,
      at(layout.station.position, 0, 0, layout.station.radius + 10),
    );
    expect(isPristineBuoyStates(station.buoys)).toBe(true);
    expect(station.staticHealth.station).toBe(
      createWorld(1).staticHealth.station,
    );
  });

  it("a pod killed with debris content blasts its neighbours by the 18-03 fixtures: 8 m, and 5 m inside the receiver's radius (the floor)", () => {
    for (const id of ["blast-pod-pod-8m", "blast-pod-pod-5m-floor"]) {
      const fixture = readBlast(id);
      const victim = fixture.victims[0];
      const receiver = fixture.receivers[0];
      const expected = fixture.expected.receivers[0]?.dv;
      if (victim === undefined || receiver === undefined || !expected) {
        throw new Error("fixture shape");
      }
      const content: DebrisContent = {
        ...debrisFixture(),
        pod: { key: "barrel", mass: victim.mass, radius: victim.radius },
      };
      const world = createWorld(1);
      const base = vec(100, 200, 300);
      const dying = piece(world, "barrel", base, victim.radius);
      const offset = receiver.position;
      const neighbour = piece(
        world,
        "barrel",
        at(base, offset[0], offset[1], offset[2]),
        receiver.radius,
      );
      const events: SimEvent[] = [];
      expect(
        killShip(world, dying.id, PLAYER_ID, events, { tick: 1, content }),
      ).toBe(true);
      expect(events).toEqual([]);
      const v = neighbour.velocity;
      const got = [v.x, v.y, v.z];
      for (let i = 0; i < 3; i += 1) {
        expect(
          withinTolerance(
            got[i] ?? Number.NaN,
            expected[i] ?? 0,
            fixture.tolerance,
          ),
          `${id}[${String(i)}] ${String(got[i])} vs ${String(expected[i])}`,
        ).toBe(true);
      }
      expect(dying.velocity).toEqual(vec(0, 0, 0));
    }
    // Without a context a pod's death pushes nothing.
    const world = createWorld(1);
    const dying = piece(world, "barrel", vec(0, 0, 0), 5.8);
    const neighbour = piece(world, "barrel", vec(0, 0, 8), 5.8);
    killShip(world, dying.id, PLAYER_ID, []);
    expect(neighbour.velocity).toEqual(vec(0, 0, 0));
  });

  it("a destroyed buoy blasts twice in the C's order, the subentity then the hull: a pod and the player 100 m away get the fixture's sums; detached, only the hull fires", () => {
    const fixture = readBlast("blast-buoy-dying-with-subentity");
    const [sub, hull] = fixture.victims;
    const [podBody, playerBody] = fixture.receivers;
    const [podExpected, playerExpected] = fixture.expected.receivers;
    if (
      sub === undefined ||
      hull === undefined ||
      podBody === undefined ||
      playerBody === undefined ||
      podExpected?.dv == null ||
      playerExpected?.dv == null
    ) {
      throw new Error("fixture shape");
    }
    const offsetOf = (p: readonly number[]): Vec3 =>
      vec(
        (p[0] ?? 0) - sub.position[0],
        (p[1] ?? 0) - sub.position[1],
        (p[2] ?? 0) - sub.position[2],
      );
    const run = (
      attached: boolean,
    ): {
      readonly pod: Entity;
      readonly push: BlastPush;
      readonly world: World;
    } => {
      const world = createWorld(1);
      world.staticHealth.navBuoy = 0;
      if (!attached) world.buoys.navBuoy.subentityEnergy = 0;
      const base = layout.navBuoy.position;
      const po = offsetOf(podBody.position);
      const pod = piece(
        world,
        "barrel",
        at(base, po.x, po.y, po.z),
        podBody.radius,
      );
      const pl = offsetOf(playerBody.position);
      const blastPush: BlastPush = { x: 0, y: 0, z: 0 };
      const content: DebrisContent = {
        ...debrisFixture(),
        pod: { key: "barrel", mass: podBody.mass, radius: podBody.radius },
      };
      const events: SimEvent[] = [];
      const row = staticTargetById(STATION_NAV_BUOY_ID);
      if (row === undefined) throw new Error("no row");
      expect(
        destroyBuoy(world, row, PLAYER_ID, events, layout, {
          tick: 1,
          content,
          layout,
          player: {
            position: at(base, pl.x, pl.y, pl.z),
            radius: playerBody.radius,
            mass: playerBody.mass,
          },
          playerPush: blastPush,
        }),
      ).toBe(true);
      expect(destroyed(events)).toHaveLength(1);
      return { pod, push: blastPush, world };
    };
    const close = (actual: Vec3, expected: readonly number[]): void => {
      const got = [actual.x, actual.y, actual.z];
      for (let i = 0; i < 3; i += 1) {
        expect(
          withinTolerance(
            got[i] ?? Number.NaN,
            expected[i] ?? 0,
            fixture.tolerance,
          ),
          `[${String(i)}] ${String(got[i])} vs ${String(expected[i])}`,
        ).toBe(true);
      }
    };
    const both = run(true);
    close(both.pod.velocity, podExpected.dv);
    close(vec(both.push.x, both.push.y, both.push.z), playerExpected.dv);
    // The destroyed buoy itself never moves.
    expect(both.world.buoys.navBuoy.velocity).toEqual(vec(0, 0, 0));

    const hullOnly = run(false);
    const podHull = podExpected.contributions[1]?.dv;
    const playerHull = playerExpected.contributions[1]?.dv;
    if (!podHull || !playerHull) throw new Error("fixture shape");
    close(hullOnly.pod.velocity, podHull);
    close(vec(hullOnly.push.x, hullOnly.push.y, hullOnly.push.z), playerHull);
  });

  it("clamps every component at MAX_ENTITY_VELOCITY: a pod beside a dying buoy's hull takes the floor", () => {
    const world = createWorld(1);
    world.staticHealth.navBuoy = 0;
    world.buoys.navBuoy.subentityEnergy = 0;
    const base = layout.navBuoy.position;
    const pod = piece(world, "barrel", at(base, 1, 0, 0), 5.7986);
    const row = staticTargetById(STATION_NAV_BUOY_ID);
    if (row === undefined) throw new Error("no row");
    destroyBuoy(world, row, PLAYER_ID, [], layout, {
      tick: 1,
      content: debrisFixture(),
      layout,
    });
    // 0.125 x 691,044.375 x 147.84 / 0.1 / 993.37: far beyond 1e4.
    expect(
      push(
        { mass: NAV_BUOY_HULL_MASS, radius: layout.navBuoy.radius },
        1,
        5.7986,
        993.37,
      ),
    ).toBeGreaterThan(1e4);
    expect(pod.velocity.x).toBe(MAX_ENTITY_VELOCITY);
    expect(pod.velocity.y).toBe(0);
    expect(sanitizeEntity(pod)).toBe(false);
  });

  it("a kill with nothing movable in range hashes exactly as with no receivers in the context", () => {
    const run = (withReceivers: boolean): string => {
      const world = createWorld(1);
      const player = initFlightState(layout);
      const victim = ship(world, "krait", vec(1e7, 0, 0), KRAIT.radius);
      const blastPush: BlastPush = { x: 0, y: 0, z: 0 };
      killShip(world, victim.id, PLAYER_ID, [], {
        tick: 1,
        content: kraitContent(),
        ...(withReceivers
          ? {
              layout,
              player: {
                position: vec(1e7, 0, 400),
                radius: 72.7,
                mass: 214737.6875,
              },
              playerPush: blastPush,
            }
          : {}),
      });
      expect(blastPush).toEqual({ x: 0, y: 0, z: 0 });
      return hashWorld(player, world);
    };
    expect(run(true)).toBe(run(false));
  });
});
