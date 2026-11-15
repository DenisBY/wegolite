// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The player's combat through the composed step (CBT-04 to CBT-07, DOCK-10).
 *
 * Expected values are derived by hand from the rules the plan cites: the
 * laser's mount offset and damage from the ledger (`shipdata.plist`,
 * `equipment.plist`), the hit rule from `Universe.m:5549-5640`, the
 * resolution order from RESEARCH A6. The hull data is the committed
 * `ships-hulls.json`, so the real-hull case runs against the shipped octrees.
 */

import { describe, expect, it } from "vitest";

import {
  COBRA_WEAPON_OFFSETS,
  LASER_STATS,
  toWegoliteLocal,
} from "../../../src/sim/combat/constants.js";
import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import {
  createPlayerCombatState,
  isPristineCombat,
} from "../../../src/sim/combat/state.js";
import type { PlayerCombatState } from "../../../src/sim/combat/state.js";
import type { SimEvent } from "../../../src/sim/events.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import type { ControlIntent } from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { stepFlight } from "../../../src/sim/flight/step.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import {
  identity,
  normalizeVec,
  quatFromUnitVectors,
  scale,
  sub,
  vec,
} from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT } from "../../../src/sim/time.js";
import { PLAYER_ID } from "../../../src/sim/world/ids.js";
import { hashWorld } from "../../../src/sim/world/serialize.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { realHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";

const { layout, config } = laveFixture();
const HULLS = realHullTable();

/** Far from the station and the planet, so nothing mass-locks the player. */
const FAR = vec(1e7, 0, 0);

const FIRE: ControlIntent = { ...ZERO_INTENT, fire: true };

/** A player launched, skipped to flight, parked at `FAR` and facing -Z. */
function flyingPlayer(): FlightState {
  const state = initFlightState(layout);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "skipLaunch" }], DT);
  state.position = FAR;
  state.orientation = identity();
  state.speed = 0;
  return state;
}

/** The stock fit and, unless `hulls` is false, the real hull table. */
function stockOptions(hulls = true): StepOptions {
  return {
    combat: {
      mounts: DEFAULT_LASER_MOUNTS,
      ...(hulls ? { hulls: HULLS } : {}),
    },
  };
}

/** A world with one ship of `specKey` at `position`, energy `maxEnergy`. */
function worldWithShip(
  position: Vec3,
  specKey = "adder",
  maxEnergy = 85,
): { world: World; id: number } {
  const world = createWorld(7);
  const result = spawnEntity(
    world,
    {
      kind: "ship",
      specKey,
      scanClass: "CLASS_NEUTRAL",
      position,
      orientation: identity(),
      radius: 30,
      maxEnergy,
    },
    0,
  );
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return { world, id: result.entity.id };
}

function energyOf(world: World, id: number): number {
  const entity = world.store.get(id);
  if (entity === undefined) throw new Error(`no entity ${id}`);
  return entity.energy;
}

function stepOnce(
  player: FlightState,
  world: World | undefined,
  combat: PlayerCombatState,
  intent: ControlIntent,
  options: StepOptions | undefined,
  commands: Parameters<typeof stepSim>[5] = [],
): SimEvent[] {
  return stepSim(
    player,
    world,
    layout,
    config,
    intent,
    commands,
    DT,
    options,
    combat,
  );
}

function ofKind<K extends SimEvent["kind"]>(
  events: readonly SimEvent[],
  kind: K,
): Extract<SimEvent, { kind: K }>[] {
  return events.filter(
    (event): event is Extract<SimEvent, { kind: K }> => event.kind === kind,
  );
}

/** The Cobra's fore mount in world space with an identity orientation. */
function foreMount(): Vec3 {
  const local = toWegoliteLocal(COBRA_WEAPON_OFFSETS.fore);
  return vec(FAR.x + local.x, FAR.y + local.y, FAR.z + local.z);
}

describe("a held fire key through stepSim (tracer)", () => {
  it("fires the fore pulse laser at an Adder 2,000 m ahead and drains it by 15", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const { world, id } = worldWithShip(vec(FAR.x, FAR.y, FAR.z - 2000));
    expect(energyOf(world, id)).toBe(85);

    const events = stepOnce(player, world, combat, FIRE, stockOptions());

    const fired = ofKind(events, "laserFired");
    expect(fired).toHaveLength(1);
    const shot = fired[0];
    if (shot === undefined) throw new Error("no laserFired");
    expect(shot.shooter).toBe(PLAYER_ID);
    expect(shot.laserKind).toBe("pulse");
    // The beam starts at the Cobra's nose mount, not at the ship's centre.
    const mount = foreMount();
    expect(shot.from.x).toBeCloseTo(mount.x, 6);
    expect(shot.from.y).toBeCloseTo(mount.y, 6);
    expect(shot.from.z).toBeCloseTo(mount.z, 6);
    // It ends on the Adder, near its centre, well short of the 12,500 m range.
    const length = mount.z - shot.to.z;
    expect(length).toBeGreaterThan(1900);
    expect(length).toBeLessThan(2000);

    const hits = ofKind(events, "shipHit");
    expect(hits).toEqual([
      {
        kind: "shipHit",
        target: id,
        source: PLAYER_ID,
        amount: 15,
        shield: false,
      },
    ]);
    expect(energyOf(world, id)).toBe(70);
  });

  it("pays for the shot: the facing heats and its recharge timer restarts", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const { world } = worldWithShip(vec(FAR.x, FAR.y, FAR.z - 2000));
    stepOnce(player, world, combat, FIRE, stockOptions());
    // 7 degrees of heat, then one tick of 6 / s cooling (bookkeeping follows fire).
    expect(combat.laserTemp.fore).toBeCloseTo(7 - 6 * DT, 9);
    expect(combat.shotTicks.fore).toBe(1);
  });

  it("does not fire without the key", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const { world, id } = worldWithShip(vec(FAR.x, FAR.y, FAR.z - 2000));
    const events = stepOnce(player, world, combat, ZERO_INTENT, stockOptions());
    expect(ofKind(events, "laserFired")).toHaveLength(0);
    expect(energyOf(world, id)).toBe(85);
  });

  it("passes through the bounding sphere beside the hull and misses, with real hull data", () => {
    // 20 m above the Adder's centre: inside its 29.03 m collision sphere, so
    // stage A passes, but above the flat hull, so the octree descent misses.
    const offsetY = 20;
    expect(offsetY).toBeLessThan(HULLS.get("adder")?.collisionRadius ?? 0);
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const { world, id } = worldWithShip(
      vec(FAR.x, FAR.y + offsetY, FAR.z - 2000),
    );

    const events = stepOnce(player, world, combat, FIRE, stockOptions());

    const fired = ofKind(events, "laserFired");
    expect(fired).toHaveLength(1);
    // A miss draws the beam to the laser's full range.
    expect(fired[0]?.to.z).toBeCloseTo(
      foreMount().z - LASER_STATS.EQ_WEAPON_PULSE_LASER.range,
      6,
    );
    expect(ofKind(events, "shipHit")).toHaveLength(0);
    expect(energyOf(world, id)).toBe(85);
  });

  it("never hits the station or a buoy: only dynamic ships are candidates", () => {
    for (const body of [layout.station, layout.navBuoy]) {
      const player = flyingPlayer();
      const combat = createPlayerCombatState();
      // 5 km short of the body, nose on it, with an empty world.
      const toward = normalizeVec(sub(body.position, FAR));
      player.position = sub(body.position, scale(toward, 5000));
      player.orientation = quatFromUnitVectors(vec(0, 0, -1), toward);
      const events = stepOnce(
        player,
        createWorld(3),
        combat,
        FIRE,
        stockOptions(),
      );
      expect(ofKind(events, "laserFired")).toHaveLength(1);
      expect(ofKind(events, "shipHit")).toHaveLength(0);
    }
  });
});

describe("callers without a combat state", () => {
  it("behave exactly as before: no combat events, no fire", () => {
    const player = flyingPlayer();
    const { world, id } = worldWithShip(vec(FAR.x, FAR.y, FAR.z - 2000));
    const events = stepSim(
      player,
      world,
      layout,
      config,
      FIRE,
      [],
      DT,
      stockOptions(),
    );
    expect(ofKind(events, "laserFired")).toHaveLength(0);
    expect(energyOf(world, id)).toBe(85);
  });
});

describe("views and facing (CBT-04)", () => {
  it("setView port in flight switches the view; with no port laser nothing fires and nothing is refused", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const { world, id } = worldWithShip(vec(FAR.x - 3000, FAR.y, FAR.z));

    const events = stepOnce(player, world, combat, FIRE, stockOptions(), [
      { kind: "setView", view: "port" },
    ]);

    expect(combat.view).toBe("port");
    expect(ofKind(events, "laserFired")).toHaveLength(0);
    expect(ofKind(events, "laserRefused")).toHaveLength(0);
    expect(ofKind(events, "shipHit")).toHaveLength(0);
    expect(energyOf(world, id)).toBe(85);
    // An empty mount costs nothing and heats nothing.
    expect(combat.laserTemp.port).toBe(0);
  });

  it("fires the port laser along the port axis once one is fitted", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    // 3 km to the player's left (-X), level with the port mount at y = -2.3.
    const { world, id } = worldWithShip(vec(FAR.x - 3000, FAR.y - 2.3, FAR.z));
    const options: StepOptions = {
      combat: {
        mounts: { ...DEFAULT_LASER_MOUNTS, port: "EQ_WEAPON_BEAM_LASER" },
        hulls: HULLS,
      },
    };

    const events = stepOnce(player, world, combat, FIRE, options, [
      { kind: "setView", view: "port" },
    ]);

    const fired = ofKind(events, "laserFired");
    expect(fired).toHaveLength(1);
    expect(fired[0]?.laserKind).toBe("beam");
    // From the port wing (x - 47.4), straight left.
    expect(fired[0]?.from.x).toBeCloseTo(FAR.x - 47.4, 6);
    expect(fired[0]?.to.y).toBeCloseTo(fired[0]?.from.y ?? NaN, 6);
    expect(ofKind(events, "shipHit")).toEqual([
      {
        kind: "shipHit",
        target: id,
        source: PLAYER_ID,
        amount: 6,
        shield: false,
      },
    ]);
    expect(energyOf(world, id)).toBe(79);
    // Only the port facing paid for the shot.
    expect(combat.laserTemp.fore).toBe(0);
    expect(combat.laserTemp.port).toBeGreaterThan(0);
  });

  it("the fore laser is silent while the view is aft", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const { world, id } = worldWithShip(vec(FAR.x, FAR.y, FAR.z - 2000));
    const events = stepOnce(player, world, combat, FIRE, stockOptions(), [
      { kind: "setView", view: "aft" },
    ]);
    expect(combat.view).toBe("aft");
    expect(ofKind(events, "laserFired")).toHaveLength(0);
    expect(energyOf(world, id)).toBe(85);
  });

  it("ignores setView while docked", () => {
    const player = initFlightState(layout);
    const combat = createPlayerCombatState();
    stepOnce(player, undefined, combat, ZERO_INTENT, stockOptions(), [
      { kind: "setView", view: "aft" },
    ]);
    expect(player.mode).toBe("docked");
    expect(combat.view).toBe("fore");
  });

  it("ignores setView while launching", () => {
    const player = initFlightState(layout);
    const combat = createPlayerCombatState();
    stepOnce(player, undefined, combat, ZERO_INTENT, stockOptions(), [
      { kind: "launch" },
    ]);
    expect(player.mode).toBe("launching");
    stepOnce(player, undefined, combat, ZERO_INTENT, stockOptions(), [
      { kind: "setView", view: "starboard" },
    ]);
    expect(player.mode).toBe("launching");
    expect(combat.view).toBe("fore");
  });

  it("ignores a setView drained on the tick that completes the launch", () => {
    const player = initFlightState(layout);
    const combat = createPlayerCombatState();
    stepOnce(player, undefined, combat, ZERO_INTENT, stockOptions(), [
      { kind: "launch" },
    ]);
    const events = stepOnce(
      player,
      undefined,
      combat,
      ZERO_INTENT,
      stockOptions(),
      [{ kind: "skipLaunch" }, { kind: "setView", view: "aft" }],
    );
    expect(ofKind(events, "launchComplete")).toHaveLength(1);
    expect(player.mode).toBe("inFlight");
    expect(combat.view).toBe("fore");
    // The next tick is in flight at both ends, so the command now counts.
    stepOnce(player, undefined, combat, ZERO_INTENT, stockOptions(), [
      { kind: "setView", view: "aft" },
    ]);
    expect(combat.view).toBe("aft");
  });

  it("ignores a forged view payload (T-13-16)", () => {
    for (const forged of ["up", "constructor", "__proto__", "", "FORE"]) {
      const player = flyingPlayer();
      const combat = createPlayerCombatState();
      stepOnce(player, undefined, combat, ZERO_INTENT, stockOptions(), [
        { kind: "setView", view: forged as never },
      ]);
      expect(combat.view).toBe("fore");
    }
  });

  it("applies the last valid setView of a frame, in command order", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    stepOnce(player, undefined, combat, ZERO_INTENT, stockOptions(), [
      { kind: "setView", view: "aft" },
      { kind: "setView", view: "bogus" as never },
      { kind: "setView", view: "starboard" },
    ]);
    expect(combat.view).toBe("starboard");
  });
});

describe("bookkeeping runs only outside the dock (F6)", () => {
  /** A combat state worn by damage, heat and a held shot timer. */
  function worn(): PlayerCombatState {
    const combat = createPlayerCombatState();
    combat.fwdShield = 40;
    combat.aftShield = 10;
    combat.energy = 100;
    combat.cabinTemp = 120;
    combat.laserTemp.fore = 50;
    combat.shotTicks.fore = 3;
    return combat;
  }

  it("changes nothing while docked", () => {
    const player = initFlightState(layout);
    const combat = worn();
    const before = structuredClone(combat);
    for (let tick = 0; tick < 60; tick += 1) {
      stepOnce(player, undefined, combat, ZERO_INTENT, stockOptions());
    }
    expect(player.mode).toBe("docked");
    expect(combat).toEqual(before);
  });

  it("cools, recharges and advances the timers while launching", () => {
    const player = initFlightState(layout);
    const combat = createPlayerCombatState();
    stepOnce(player, undefined, combat, ZERO_INTENT, stockOptions(), [
      { kind: "launch" },
    ]);
    expect(player.mode).toBe("launching");
    Object.assign(combat, worn());
    stepOnce(player, undefined, combat, ZERO_INTENT, stockOptions());
    expect(player.mode).toBe("launching");
    expect(combat.laserTemp.fore).toBeCloseTo(50 - 6 * DT, 9);
    expect(combat.shotTicks.fore).toBe(4);
    expect(combat.cabinTemp).toBeLessThan(120);
    expect(combat.fwdShield + combat.aftShield).toBeGreaterThan(50);
  });

  it("cools, recharges and advances the timers in flight", () => {
    const player = flyingPlayer();
    const combat = worn();
    stepOnce(player, undefined, combat, ZERO_INTENT, stockOptions());
    expect(combat.laserTemp.fore).toBeCloseTo(50 - 6 * DT, 9);
    expect(combat.shotTicks.fore).toBe(4);
    // Cabin cooling: (0 - 100 - 120) * 0.1 * dt = -22 / 120 per tick.
    expect(combat.cabinTemp).toBeCloseTo(120 - (220 * 0.1) / 120, 9);
    // The aft shield is below a quarter, so it may spend all the energy: it
    // gains 2 / 120 and the banks pay for it.
    expect(combat.aftShield).toBeCloseTo(10 + 2 / 120, 9);
  });
});

describe("a refused laser (CBT-05)", () => {
  it("emits laserRefused overheat at the cut-out, with no shot", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    // 0.85 * 256 = 217.6 is the cut-out; bookkeeping follows the gate.
    combat.laserTemp.fore = 218;
    const { world, id } = worldWithShip(vec(FAR.x, FAR.y, FAR.z - 2000));
    const events = stepOnce(player, world, combat, FIRE, stockOptions());
    expect(ofKind(events, "laserRefused")).toEqual([
      { kind: "laserRefused", reason: "overheat" },
    ]);
    expect(ofKind(events, "laserFired")).toHaveLength(0);
    expect(energyOf(world, id)).toBe(85);
  });

  it("emits laserRefused noEnergy when the banks cannot pay", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    combat.energy = 0.8;
    const events = stepOnce(player, undefined, combat, FIRE, stockOptions());
    expect(ofKind(events, "laserRefused")).toEqual([
      { kind: "laserRefused", reason: "noEnergy" },
    ]);
  });
});

describe("hull data not loaded (D-01)", () => {
  it("fires without hull data: the beam runs to full range, nothing is hit", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const { world, id } = worldWithShip(vec(FAR.x, FAR.y, FAR.z - 2000));

    const events = stepOnce(player, world, combat, FIRE, stockOptions(false));

    const fired = ofKind(events, "laserFired");
    expect(fired).toHaveLength(1);
    expect(fired[0]?.to.z).toBeCloseTo(
      foreMount().z - LASER_STATS.EQ_WEAPON_PULSE_LASER.range,
      6,
    );
    expect(ofKind(events, "shipHit")).toHaveLength(0);
    expect(energyOf(world, id)).toBe(85);
    // The shot was paid for all the same.
    expect(combat.shotTicks.fore).toBe(1);
  });

  it("fires without any combat options at all: the stock fit, no hull data, no hit", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const { world, id } = worldWithShip(vec(FAR.x, FAR.y, FAR.z - 2000));
    const events = stepOnce(player, world, combat, FIRE, undefined);
    expect(ofKind(events, "laserFired")).toHaveLength(1);
    expect(ofKind(events, "shipHit")).toHaveLength(0);
    expect(energyOf(world, id)).toBe(85);
  });

  it("cannot hit a target whose spec key has no hull entry, while another target does", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const { world, id: unknownId } = worldWithShip(
      vec(FAR.x, FAR.y, FAR.z - 1000),
      "no-such-hull",
    );
    const behind = spawnEntity(
      world,
      {
        kind: "ship",
        specKey: "adder",
        scanClass: "CLASS_NEUTRAL",
        position: vec(FAR.x, FAR.y, FAR.z - 3000),
        orientation: identity(),
        radius: 30,
        maxEnergy: 85,
      },
      0,
    );
    if (!behind.ok) throw new Error("spawn refused");

    const events = stepOnce(player, world, combat, FIRE, stockOptions());

    // The hull-less ship in front is transparent to the beam; the Adder behind
    // it is hit.
    expect(ofKind(events, "shipHit").map((hit) => hit.target)).toEqual([
      behind.entity.id,
    ]);
    expect(energyOf(world, unknownId)).toBe(85);
    expect(energyOf(world, behind.entity.id)).toBe(70);
  });
});

describe("hit resolution order (A6, Pitfall 7)", () => {
  it("applies the hit after stepWorld on the same tick, in one write", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const { world, id } = worldWithShip(vec(FAR.x, FAR.y, FAR.z - 2000));
    const entity = world.store.get(id);
    if (entity === undefined) throw new Error("no entity");

    // Log every read and write of the target's energy through an accessor.
    const log: string[] = [];
    let energy = entity.energy;
    Object.defineProperty(entity, "energy", {
      configurable: true,
      enumerable: true,
      get: () => {
        log.push(`read:${energy}`);
        return energy;
      },
      set: (value: number) => {
        log.push(`write:${value}`);
        energy = value;
      },
    });

    const events = stepOnce(player, world, combat, FIRE, stockOptions());

    // stepWorld's sanitiser reads the energy and writes the same value back;
    // the hit is the only write of a different value, and it is the last
    // access of the tick: nothing observed 70 before it.
    expect(log.length).toBeGreaterThan(1);
    expect(log.at(-1)).toBe("write:70");
    expect(log.filter((line) => line === "write:70")).toHaveLength(1);
    expect(
      log
        .slice(0, -1)
        .every((line) => line === "read:85" || line === "write:85"),
    ).toBe(true);
    expect(energy).toBe(70);

    // Events: the beam, then the hit, after anything the world step emitted.
    const kinds = events.map((event) => event.kind);
    expect(kinds.at(-2)).toBe("laserFired");
    expect(kinds.at(-1)).toBe("shipHit");
  });

  it("hits only the nearest of two ships on the line", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const { world, id: near } = worldWithShip(vec(FAR.x, FAR.y, FAR.z - 1500));
    const far = spawnEntity(
      world,
      {
        kind: "ship",
        specKey: "adder",
        scanClass: "CLASS_NEUTRAL",
        position: vec(FAR.x, FAR.y, FAR.z - 4000),
        orientation: identity(),
        radius: 30,
        maxEnergy: 85,
      },
      0,
    );
    if (!far.ok) throw new Error("spawn refused");

    const events = stepOnce(player, world, combat, FIRE, stockOptions());

    expect(ofKind(events, "shipHit").map((hit) => hit.target)).toEqual([near]);
    expect(energyOf(world, near)).toBe(70);
    expect(energyOf(world, far.entity.id)).toBe(85);
  });

  it("floors a target's energy at 0 and never destroys it (N2)", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const { world, id } = worldWithShip(
      vec(FAR.x, FAR.y, FAR.z - 2000),
      "adder",
      10,
    );
    const events = stepOnce(player, world, combat, FIRE, stockOptions());
    expect(energyOf(world, id)).toBe(0);
    expect(ofKind(events, "shipHit")).toHaveLength(1);
    expect(ofKind(events, "shipDestroyed")).toHaveLength(0);
    expect(world.store.get(id)).toBeDefined();
  });

  it("two runs of the same scenario give identical events and hashes", () => {
    const run = (): { events: SimEvent[][]; hashes: string[] } => {
      const player = flyingPlayer();
      const combat = createPlayerCombatState();
      const { world } = worldWithShip(vec(FAR.x, FAR.y, FAR.z - 2000));
      const events: SimEvent[][] = [];
      const hashes: string[] = [];
      for (let tick = 0; tick < 200; tick += 1) {
        // Hold fire throughout: shots, refusals and recharge gaps all occur.
        events.push(stepOnce(player, world, combat, FIRE, stockOptions()));
        hashes.push(hashWorld(player, world, combat));
      }
      return { events, hashes };
    };
    const first = run();
    const second = run();
    expect(second.events).toEqual(first.events);
    expect(second.hashes).toEqual(first.hashes);
    // Not vacuous: more than one shot landed and the hash moved.
    const hits = first.events.flat().filter((e) => e.kind === "shipHit");
    expect(hits.length).toBeGreaterThan(1);
    expect(new Set(first.hashes).size).toBeGreaterThan(10);
  });
});

describe("combat in the world hash", () => {
  it("is absent while pristine and present once the view changes", () => {
    const base = (): { player: FlightState; combat: PlayerCombatState } => ({
      player: flyingPlayer(),
      combat: createPlayerCombatState(),
    });
    const quiet = base();
    stepOnce(
      quiet.player,
      undefined,
      quiet.combat,
      ZERO_INTENT,
      stockOptions(),
    );
    const turned = base();
    stepOnce(
      turned.player,
      undefined,
      turned.combat,
      ZERO_INTENT,
      stockOptions(),
      [{ kind: "setView", view: "aft" }],
    );

    expect(isPristineCombat(quiet.combat)).toBe(true);
    expect(isPristineCombat(turned.combat)).toBe(false);
    // Same flight state, so only the combat line can make them differ.
    expect(hashWorld(turned.player, undefined, turned.combat)).not.toBe(
      hashWorld(quiet.player, undefined, quiet.combat),
    );
    // A pristine state hashes as no combat state at all.
    expect(hashWorld(quiet.player, undefined, quiet.combat)).toBe(
      hashWorld(quiet.player, undefined),
    );
  });

  it("returns to the pristine hash when the view returns to fore and nothing else moved", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    stepOnce(player, undefined, combat, ZERO_INTENT, stockOptions(), [
      { kind: "setView", view: "aft" },
    ]);
    expect(isPristineCombat(combat)).toBe(false);
    stepOnce(player, undefined, combat, ZERO_INTENT, stockOptions(), [
      { kind: "setView", view: "fore" },
    ]);
    expect(isPristineCombat(combat)).toBe(true);
    expect(hashWorld(player, undefined, combat)).toBe(
      hashWorld(player, undefined),
    );
  });

  it("repairs a poisoned combat state before hashing instead of throwing (T-13-15)", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    combat.energy = Number.NaN;
    combat.laserTemp.aft = Number.POSITIVE_INFINITY;
    expect(() => hashWorld(player, undefined, combat)).not.toThrow();
    // The repair puts a poisoned-but-otherwise-fresh state back to pristine.
    expect(isPristineCombat(combat)).toBe(true);
  });
});
