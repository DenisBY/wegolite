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
import { npcLaserRay, playerLaserRay } from "../../../src/sim/combat/aim.js";
import type { NpcWeapon } from "../../../src/sim/combat/aim.js";
import type { HullTable } from "../../../src/sim/combat/hit.js";
import { applyLedger } from "../../../src/sim/combat/ledger.js";
import type { HitRecord } from "../../../src/sim/combat/ledger.js";
import { resolveShots } from "../../../src/sim/combat/step.js";
import type { ShotRequest } from "../../../src/sim/combat/step.js";
import {
  add,
  dot,
  identity,
  normalizeVec,
  quatFromUnitVectors,
  rotate,
  scale,
  sub,
  vec,
} from "../../../src/sim/math.js";
import type { Quat, Vec3 } from "../../../src/sim/math.js";
import { clampFrameDelta } from "../../../src/sim/loop.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT, MAX_STEPS_PER_FRAME } from "../../../src/sim/time.js";
import {
  MAIN_STATION_ID,
  NAV_BUOY_SUBENTITY_ID,
  NO_ENTITY,
  PLAYER_ID,
  STATION_NAV_BUOY_ID,
  WITCHPOINT_BUOY_ID,
  WITCHPOINT_BUOY_SUBENTITY_ID,
} from "../../../src/sim/world/ids.js";
import {
  BUOY_SUBENTITY_TARGETS,
  FRANGIBLE_BLEED_THROUGH,
  STATIC_TARGETS,
  stationPose,
} from "../../../src/sim/world/statics.js";
import { npcContacts } from "../../../src/sim/world/contacts.js";
import { DEBRIS_MAX_ENERGY } from "../../../src/sim/world/debris.js";
import {
  hashWorld,
  serializeStaticHealth,
} from "../../../src/sim/world/serialize.js";
import { snapshotWorld } from "../../../src/sim/world/snapshot.js";
import {
  createStaticHealth,
  createWorld,
  spawnEntity,
} from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { fullHullTable, realHullTable } from "../../helpers/hull-table.js";
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
    // The player's shot carries no spec key: it keeps its laser's colour.
    expect(shot).not.toHaveProperty("specKey");
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

  it("destroys a target whose energy reaches 0 on that tick (FOUND-19, supersedes N2)", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const position = vec(FAR.x, FAR.y, FAR.z - 2000);
    const { world, id } = worldWithShip(position, "adder", 10);
    const before = npcContacts(world).length;
    const events = stepOnce(player, world, combat, FIRE, stockOptions());

    // The event tail: the beam, the hit, the destruction, the removal.
    expect(events.slice(-4).map((event) => event.kind)).toEqual([
      "laserFired",
      "shipHit",
      "shipDestroyed",
      "entityRemoved",
    ]);
    const destroyed = ofKind(events, "shipDestroyed");
    expect(destroyed).toEqual([
      {
        kind: "shipDestroyed",
        id,
        killer: PLAYER_ID,
        specKey: "adder",
        radius: 30,
        position,
      },
    ]);
    expect(ofKind(events, "entityRemoved").map((event) => event.id)).toEqual([
      id,
    ]);
    expect(ofKind(events, "shipHit")).toHaveLength(1);
    expect(world.store.get(id)).toBeUndefined();

    // Gone from the scanner and from the snapshot path.
    const contacts = npcContacts(world);
    expect(contacts).toHaveLength(before - 1);
    expect(contacts.some((contact) => contact.position.z === position.z)).toBe(
      false,
    );
    expect(() => snapshotWorld(world)).not.toThrow();
  });

  it("ends an engaged ident lock on the destroyed ship with identLost, after entityRemoved", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const { world, id } = worldWithShip(
      vec(FAR.x, FAR.y, FAR.z - 2000),
      "adder",
      10,
    );
    combat.identEngaged = true;
    combat.identTarget = id;
    const events = stepOnce(player, world, combat, FIRE, stockOptions());

    const kinds = events.map((event) => event.kind);
    expect(kinds.indexOf("identLost")).toBeGreaterThan(
      kinds.indexOf("entityRemoved"),
    );
    expect(ofKind(events, "identLost")).toHaveLength(1);
    expect(combat.identTarget).toBe(NO_ENTITY);
    expect(combat.identEngaged).toBe(true);
  });

  it("ends a lock on the destroyed ship silently when ident is not engaged", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const { world, id } = worldWithShip(
      vec(FAR.x, FAR.y, FAR.z - 2000),
      "adder",
      10,
    );
    combat.identEngaged = false;
    combat.identTarget = id;
    const events = stepOnce(player, world, combat, FIRE, stockOptions());

    expect(ofKind(events, "shipDestroyed")).toHaveLength(1);
    expect(ofKind(events, "identLost")).toHaveLength(0);
    expect(combat.identTarget).toBe(NO_ENTITY);
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

/*
 * The station as a laser target (CBT-17, plan 18-04).
 *
 * The scene is laid along the station's back axis: Wegolite local +Z of the
 * base pose, which is Oolite model -z (away from the dock and the planet). The
 * station's roll is about that axis, so the scene does not depend on the
 * station angle. The player sits 1,500 m behind the centre facing it, an Adder
 * 1,500 m in front of the dock, so the centre is on the 3,000 m line between
 * them. The Coriolis hull has its back face at Oolite z = -500 (18-02 SUMMARY,
 * "the hull's runner-up is its back face at z = -500"), so a beam from the
 * back stops 500 m short of the centre. `isHitByLine` reports the distance to
 * the centre of the first solid leaf, so the tolerance is 18-02's for the hull
 * at normal incidence: sqrt(3) h + 2 h with the hull leaf h = 7.8203125
 * (depth 6, root 500.5), 29.186 m.
 */
const FULL = fullHullTable();
const STATION = layout.station.position;
const BACK = rotate(layout.stationBaseQuat, vec(0, 0, 1));
const TOWARD_STATION = scale(BACK, -1);
const FACING_STATION = quatFromUnitVectors(vec(0, 0, -1), TOWARD_STATION);
const STATION_BACK_FACE = 500;
const HULL_LEAF = 7.8203125;
const HULL_TOLERANCE = Math.sqrt(3) * HULL_LEAF + 2 * HULL_LEAF;
const PULSE = LASER_STATS.EQ_WEAPON_PULSE_LASER;

/** The Viper's forward weapon as `ships-npc.json` carries it. */
const VIPER_BEAM: NpcWeapon = {
  laser: "EQ_WEAPON_BEAM_LASER",
  offset: vec(0, -0.15000000596046448, 35.034400939941406),
};

function hullOptions(hulls: HullTable): StepOptions {
  return { combat: { mounts: DEFAULT_LASER_MOUNTS, hulls } };
}

/** The flying player 1,500 m behind the station centre, facing it. */
function playerBehindStation(): FlightState {
  const state = flyingPlayer();
  state.position = add(STATION, scale(BACK, 1500));
  state.orientation = FACING_STATION;
  return state;
}

/** An Adder 1,500 m in front of the dock, on the player's line. */
function shipBeyondStation(): { world: World; id: number } {
  return worldWithShip(add(STATION, scale(TOWARD_STATION, 1500)));
}

/** A ship of `specKey` spawned into `world`. */
function spawnInto(
  world: World,
  specKey: string,
  position: Vec3,
  orientation = identity(),
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
    },
    0,
  );
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return result.entity.id;
}

function viperShot(world: World, id: number): ShotRequest {
  const entity = world.store.get(id);
  if (entity === undefined) throw new Error(`no entity ${id}`);
  const ray = npcLaserRay(entity, VIPER_BEAM);
  if (ray === null) throw new Error("no ray");
  return { shooter: id, ray, laser: "EQ_WEAPON_BEAM_LASER" };
}

function playerShot(player: FlightState): ShotRequest {
  return {
    shooter: PLAYER_ID,
    ray: playerLaserRay(
      player.position,
      player.orientation,
      "fore",
      "EQ_WEAPON_PULSE_LASER",
    ),
    laser: "EQ_WEAPON_PULSE_LASER",
  };
}

function stationRecord(player: FlightState, amount: number): HitRecord {
  return {
    target: MAIN_STATION_ID,
    source: PLAYER_ID,
    amount,
    sourcePosition: player.position,
  };
}

describe("a laser stops at the station (tracer, CBT-17)", () => {
  it("a shot at a ship behind the station ends on the station's back face; the ship takes nothing", () => {
    const player = playerBehindStation();
    const combat = createPlayerCombatState();
    const { world, id } = shipBeyondStation();

    const events = stepOnce(player, world, combat, FIRE, hullOptions(FULL));

    const fired = ofKind(events, "laserFired");
    expect(fired).toHaveLength(1);
    const shot = fired[0];
    if (shot === undefined) throw new Error("no laserFired");
    // The beam length along the line, and the distance from the mount to the
    // station's back face plane.
    const length = dot(sub(shot.to, shot.from), TOWARD_STATION);
    const toBackFace = dot(sub(shot.from, STATION), BACK) - STATION_BACK_FACE;
    expect(Math.abs(length - toBackFace)).toBeLessThanOrEqual(HULL_TOLERANCE);
    // Far short of the Adder, about 2,000 m further on.
    expect(length).toBeLessThan(1100);

    expect(ofKind(events, "shipHit")).toEqual([
      {
        kind: "shipHit",
        target: MAIN_STATION_ID,
        source: PLAYER_ID,
        amount: PULSE.damage,
        shield: false,
      },
    ]);
    expect(energyOf(world, id)).toBe(85);
    expect(world.staticHealth).toEqual(createStaticHealth());
  });

  it("without the static hulls (realHullTable) the same shot hits the ship as before", () => {
    const player = playerBehindStation();
    const combat = createPlayerCombatState();
    const { world, id } = shipBeyondStation();

    const events = stepOnce(player, world, combat, FIRE, hullOptions(HULLS));

    const shot = ofKind(events, "laserFired")[0];
    if (shot === undefined) throw new Error("no laserFired");
    const length = dot(sub(shot.to, shot.from), TOWARD_STATION);
    const toShipCentre = dot(
      sub(world.store.get(id)?.position ?? STATION, shot.from),
      TOWARD_STATION,
    );
    expect(length).toBeLessThan(toShipCentre);
    expect(length).toBeGreaterThan(toShipCentre - 100);
    expect(ofKind(events, "shipHit")).toEqual([
      {
        kind: "shipHit",
        target: id,
        source: PLAYER_ID,
        amount: PULSE.damage,
        shield: false,
      },
    ]);
    expect(energyOf(world, id)).toBe(85 - PULSE.damage);
  });

  it("a tick that did not step the world has no station candidate: the beam runs to full range", () => {
    const player = playerBehindStation();
    const combat = createPlayerCombatState();
    const { world } = shipBeyondStation();
    const shot = playerShot(player);

    const unstepped = resolveShots(
      world,
      false,
      player,
      combat,
      [shot],
      hullOptions(FULL),
      DT,
      layout,
    );
    const beam = ofKind(unstepped, "laserFired")[0];
    if (beam === undefined) throw new Error("no laserFired");
    expect(dot(sub(beam.to, beam.from), shot.ray.forward)).toBeCloseTo(
      shot.ray.range,
      6,
    );
    expect(ofKind(unstepped, "shipHit")).toEqual([]);

    // The same shot on a stepped tick ends on the station.
    const stepped = resolveShots(
      world,
      true,
      player,
      combat,
      [shot],
      hullOptions(FULL),
      DT,
      layout,
    );
    expect(ofKind(stepped, "shipHit").map((hit) => hit.target)).toEqual([
      MAIN_STATION_ID,
    ]);
  });
});

describe("the station only absorbs (A6, StationEntity.m:1110-1160)", () => {
  it("1,000 hits and one huge hit change no hashed state and are never lethal", () => {
    const player = playerBehindStation();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const before = hashWorld(player, world, combat);
    const neverHit = hashWorld(player, createWorld(7), combat);

    const records = Array.from({ length: 1000 }, () =>
      stationRecord(player, PULSE.damage),
    );
    records.push(stationRecord(player, 1e12));
    const events: SimEvent[] = [];
    const lethal = applyLedger(world, true, player, combat, records, events);

    expect(lethal).toEqual([]);
    expect(events).toHaveLength(1001);
    for (const event of events) {
      expect(event).toMatchObject({
        kind: "shipHit",
        target: MAIN_STATION_ID,
        source: PLAYER_ID,
        shield: false,
      });
    }
    expect(world.staticHealth).toEqual(createStaticHealth());
    expect(hashWorld(player, world, combat)).toBe(before);
    expect(hashWorld(player, world, combat)).toBe(neverHit);
  });

  it("skips NaN, Infinity, 0 and negative amounts, and any record on an unstepped world", () => {
    const player = playerBehindStation();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const events: SimEvent[] = [];
    const bad = [Number.NaN, Infinity, -Infinity, 0, -5].map((amount) =>
      stationRecord(player, amount),
    );
    expect(applyLedger(world, true, player, combat, bad, events)).toEqual([]);
    expect(events).toEqual([]);
    expect(
      applyLedger(
        world,
        false,
        player,
        combat,
        [stationRecord(player, 15)],
        events,
      ),
    ).toEqual([]);
    expect(
      applyLedger(
        undefined,
        true,
        player,
        combat,
        [stationRecord(player, 15)],
        events,
      ),
    ).toEqual([]);
    expect(events).toEqual([]);
    expect(world.staticHealth).toEqual(createStaticHealth());
  });
});

describe("an NPC shot that ends on the station is a hit (ShipEntity.m:10396)", () => {
  it("moves the shooter's missedShots by -1 with the static hulls, +1 without them", () => {
    for (const [hulls, expected, targets] of [
      [FULL, 1, [MAIN_STATION_ID]],
      [HULLS, 3, []],
    ] as const) {
      const player = flyingPlayer();
      const world = createWorld(7);
      const viper = spawnInto(
        world,
        "viper",
        add(STATION, scale(BACK, 1500)),
        FACING_STATION,
      );
      const shooter = world.store.get(viper);
      if (shooter === undefined) throw new Error("no viper");
      shooter.weapon.missedShots = 2;

      const events = resolveShots(
        world,
        true,
        player,
        createPlayerCombatState(),
        [viperShot(world, viper)],
        hullOptions(hulls),
        DT,
        layout,
      );
      expect(shooter.weapon.missedShots).toBe(expected);
      expect(ofKind(events, "shipHit").map((hit) => hit.target)).toEqual(
        targets,
      );
    }
  });
});

describe("the hit-record target invariant (assumption delta, plan 18-04)", () => {
  it("every queued target is the player, a static target or a store id live at queue time", () => {
    const player = playerBehindStation();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    // A Viper behind the player, nose at it: its beam meets the player first.
    const behind = spawnInto(
      world,
      "viper",
      add(STATION, scale(BACK, 3000)),
      FACING_STATION,
    );
    // A Viper far out with an Adder dead ahead of its nose (-Z).
    const far = spawnInto(world, "viper", vec(FAR.x + 50_000, 0, 0));
    const adder = spawnInto(world, "adder", vec(FAR.x + 50_000, 0, -1500));
    // A Viper 2,035 m short of the nav buoy, nose along +Z: its mount sits on
    // the subentity line (plan 18-15), so its beam is split 1 % and 100 %.
    const onSub = spawnInto(
      world,
      "viper",
      add(layout.navBuoy.position, vec(0, -4, -2035)),
      quatFromUnitVectors(vec(0, 0, -1), vec(0, 0, 1)),
    );
    const live = new Set(
      [...world.store.live].filter((e) => !e.dead).map((e) => e.id),
    );
    const statics = new Set([
      ...STATIC_TARGETS.map((row) => row.id),
      ...BUOY_SUBENTITY_TARGETS.map((row) => row.id),
    ]);

    const events = resolveShots(
      world,
      true,
      player,
      combat,
      [
        playerShot(player),
        viperShot(world, behind),
        viperShot(world, far),
        viperShot(world, onSub),
      ],
      hullOptions(FULL),
      DT,
      layout,
    );

    const targets = ofKind(events, "shipHit").map((hit) => hit.target);
    for (const target of targets) {
      expect(
        target === PLAYER_ID || statics.has(target) || live.has(target),
      ).toBe(true);
    }
    // Not vacuous: one of each kind, the buoy subentity included.
    expect([...targets].sort((a, b) => a - b)).toEqual(
      [
        MAIN_STATION_ID,
        STATION_NAV_BUOY_ID,
        NAV_BUOY_SUBENTITY_ID,
        PLAYER_ID,
        adder,
      ].sort((a, b) => a - b),
    );
  });
});

/*
 * The buoys as laser targets (CBT-17, plan 18-05, D-04, D-05, PD-02).
 *
 * The beam runs along world +X through (y 9, z 14) of the buoy centre, the line
 * of the 18-02 fixture `dock-buoy-hull-alone-from-minus-x` (identity pose):
 * the hull stops it about 1,950.87 m from a start 2,000 m out, and the
 * subentity is missed by 4 m, so the hit stays a hull hit once plan 18-15
 * routes subentity hits. The buoy leaf is 58.228 / 16 m (depth 5), so 8 m
 * covers the fixture's own tolerance (7.36 m). The flight clock is 0 for a
 * direct `resolveShots`, so the buoy sits at its identity pose; through
 * `stepSim` it advances by one tick (a 0.0008 rad roll, far inside the 4 m
 * clearance).
 */
const PLUS_X = quatFromUnitVectors(vec(0, 0, -1), vec(1, 0, 0));
const PLUS_Z = quatFromUnitVectors(vec(0, 0, -1), vec(0, 0, 1));
const HULL_LINE = vec(-2000, 9, 14);
const HULL_LINE_DISTANCE = 1950.87;
const BUOY_TOLERANCE = 8;

/** A player whose fore pulse starts exactly at `origin`, facing `orientation`. */
function playerAt(origin: Vec3, orientation: Quat): FlightState {
  const state = flyingPlayer();
  state.flightTime = 0;
  state.orientation = orientation;
  state.position = sub(
    origin,
    rotate(orientation, toWegoliteLocal(COBRA_WEAPON_OFFSETS.fore)),
  );
  return state;
}

/** The player's fore pulse, which starts at its mount. */
function pulseOf(player: FlightState): ShotRequest {
  return playerShot(player);
}

function buoyRecord(target: number, amount: number): HitRecord {
  return {
    target,
    source: PLAYER_ID,
    amount,
    sourcePosition: vec(0, 0, 0),
  };
}

function beamLength(events: readonly SimEvent[]): number {
  const beam = ofKind(events, "laserFired")[0];
  if (beam === undefined) throw new Error("no laserFired");
  return Math.hypot(
    beam.to.x - beam.from.x,
    beam.to.y - beam.from.y,
    beam.to.z - beam.from.z,
  );
}

describe("the nav buoy shot to destruction at its live pose (tracer, CBT-17)", () => {
  it("a pulse on the nav buoy's hull through stepSim leaves it at 235 and adds a staticHealth: line", () => {
    const player = playerAt(add(layout.navBuoy.position, HULL_LINE), PLUS_X);
    const combat = createPlayerCombatState();
    const world = createWorld(7);

    const events = stepOnce(player, world, combat, FIRE, hullOptions(FULL));

    expect(world.staticHealth.navBuoy).toBe(235);
    expect(ofKind(events, "shipHit")).toEqual([
      {
        kind: "shipHit",
        target: STATION_NAV_BUOY_ID,
        source: PLAYER_ID,
        amount: PULSE.damage,
        shield: false,
      },
    ]);
    expect(
      Math.abs(beamLength(events) - HULL_LINE_DISTANCE),
    ).toBeLessThanOrEqual(BUOY_TOLERANCE);
    // The hash gains the staticHealth: line: the same state with the buoy
    // restored hashes differently, and the line reads the 235.
    expect(serializeStaticHealth(world.staticHealth)).toBe(
      "staticHealth:25000.000000,250.000000,235.000000",
    );
    const damaged = hashWorld(player, world, combat);
    world.staticHealth.navBuoy = 250;
    const pristine = hashWorld(player, world, combat);
    world.staticHealth.navBuoy = 235;
    expect(damaged).not.toBe(pristine);
    expect(hashWorld(player, world, combat)).toBe(damaged);
  });

  it("17 hull hits destroy it once; a further beam passes and the health stays exactly 0", () => {
    const player = playerAt(add(layout.navBuoy.position, HULL_LINE), PLUS_X);
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    // 16 hits on consecutive ticks, applied directly (no recharge between).
    for (let i = 1; i <= 16; i += 1) {
      const events: SimEvent[] = [];
      expect(
        applyLedger(
          world,
          true,
          player,
          combat,
          [buoyRecord(STATION_NAV_BUOY_ID, PULSE.damage)],
          events,
        ),
      ).toEqual([]);
      expect(world.staticHealth.navBuoy).toBe(250 - 15 * i);
    }

    // The 17th, a real shot.
    const killing = resolveShots(
      world,
      true,
      player,
      combat,
      [pulseOf(player)],
      hullOptions(FULL),
      DT,
      layout,
    );
    expect(ofKind(killing, "shipDestroyed")).toEqual([
      {
        kind: "shipDestroyed",
        id: STATION_NAV_BUOY_ID,
        position: { ...layout.navBuoy.position },
        radius: layout.navBuoy.radius,
        specKey: "buoy",
        killer: PLAYER_ID,
      },
    ]);
    expect(Object.is(world.staticHealth.navBuoy, 0)).toBe(true);
    expect(world.store.get(STATION_NAV_BUOY_ID)).toBeUndefined();
    expect(ofKind(killing, "entityRemoved")).toEqual([]);

    const after = resolveShots(
      world,
      true,
      player,
      combat,
      [pulseOf(player)],
      hullOptions(FULL),
      DT,
      layout,
    );
    expect(
      ofKind(after, "shipHit").filter((h) => h.target === STATION_NAV_BUOY_ID),
    ).toEqual([]);
    expect(ofKind(after, "shipDestroyed")).toEqual([]);
    expect(beamLength(after)).toBeGreaterThan(HULL_LINE_DISTANCE + 100);
    expect(Object.is(world.staticHealth.navBuoy, 0)).toBe(true);
  });

  it("the witchpoint buoy dies the same way; two lethal records in one tick destroy it once", () => {
    const player = playerAt(add(layout.witchpoint.position, HULL_LINE), PLUS_X);
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    world.staticHealth.witchpoint = 10;

    const events = resolveShots(
      world,
      true,
      player,
      combat,
      [pulseOf(player), pulseOf(player)],
      hullOptions(FULL),
      DT,
      layout,
    );

    expect(ofKind(events, "shipHit").map((h) => h.target)).toEqual([
      WITCHPOINT_BUOY_ID,
      WITCHPOINT_BUOY_ID,
    ]);
    expect(ofKind(events, "shipDestroyed")).toEqual([
      {
        kind: "shipDestroyed",
        id: WITCHPOINT_BUOY_ID,
        position: { ...layout.witchpoint.position },
        radius: layout.witchpoint.radius,
        specKey: "buoy-witchpoint",
        killer: PLAYER_ID,
      },
    ]);
    expect(world.staticHealth.witchpoint).toBe(0);
    expect(world.staticHealth.navBuoy).toBe(250);
  });

  it("is hit where it is: with a (50, 0, 0) offset the beam must aim at the moved buoy", () => {
    // Along world +Z, 60 m to the side of the layout centre: 10 m from the
    // moved centre (a hull hit) and outside the unmoved hull (its edge is
    // under 60 m out).
    const origin = add(layout.navBuoy.position, vec(60, 9, -2000));
    const player = playerAt(origin, PLUS_Z);
    const combat = createPlayerCombatState();

    const moved = createWorld(7);
    moved.buoys.navBuoy.offset = { x: 50, y: 0, z: 0 };
    const hit = resolveShots(
      moved,
      true,
      player,
      combat,
      [pulseOf(player)],
      hullOptions(FULL),
      DT,
      layout,
    );
    expect(ofKind(hit, "shipHit").map((h) => h.target)).toEqual([
      STATION_NAV_BUOY_ID,
    ]);
    expect(moved.staticHealth.navBuoy).toBe(235);
    expect(beamLength(hit)).toBeLessThan(2000);

    const unmoved = createWorld(7);
    const miss = resolveShots(
      unmoved,
      true,
      player,
      combat,
      [pulseOf(player)],
      hullOptions(FULL),
      DT,
      layout,
    );
    expect(
      ofKind(miss, "shipHit").filter((h) => h.target === STATION_NAV_BUOY_ID),
    ).toEqual([]);
    expect(unmoved.staticHealth.navBuoy).toBe(250);
  });

  it("is no candidate without the buoy hull (realHullTable): nothing changes", () => {
    const player = playerAt(add(layout.navBuoy.position, HULL_LINE), PLUS_X);
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const before = hashWorld(player, world, combat);
    const events = resolveShots(
      world,
      true,
      player,
      combat,
      [pulseOf(player)],
      hullOptions(HULLS),
      DT,
      layout,
    );
    expect(ofKind(events, "shipHit")).toEqual([]);
    expect(hashWorld(player, world, combat)).toBe(before);
  });
});

describe("buoy records in the ledger are total (probe CBT-17)", () => {
  it("skips NaN, Infinity, 0 and negative amounts and a record on a destroyed buoy", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    world.staticHealth.witchpoint = 0;
    const events: SimEvent[] = [];
    const records = [Number.NaN, Infinity, -Infinity, 0, -5].map((amount) =>
      buoyRecord(STATION_NAV_BUOY_ID, amount),
    );
    records.push(buoyRecord(WITCHPOINT_BUOY_ID, 15));
    records.push(buoyRecord(WITCHPOINT_BUOY_ID, 1e12));
    expect(applyLedger(world, true, player, combat, records, events)).toEqual(
      [],
    );
    expect(events).toEqual([]);
    expect(world.staticHealth.navBuoy).toBe(250);
    expect(Object.is(world.staticHealth.witchpoint, 0)).toBe(true);
  });

  it("a huge hit floors at exactly 0 and is collected once with its credit", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const events: SimEvent[] = [];
    const lethal = applyLedger(
      world,
      true,
      player,
      combat,
      [
        buoyRecord(STATION_NAV_BUOY_ID, 1e12),
        buoyRecord(STATION_NAV_BUOY_ID, 15),
      ],
      events,
    );
    expect(lethal).toEqual([
      { victim: STATION_NAV_BUOY_ID, killer: PLAYER_ID },
    ]);
    expect(Object.is(world.staticHealth.navBuoy, 0)).toBe(true);
    // As for a ship doomed earlier in the same tick, the later record still
    // shows as a hit.
    expect(ofKind(events, "shipHit")).toHaveLength(2);
  });
});

describe("buoy recharge (energy_recharge_rate 2, research Pitfall 9)", () => {
  function tick(world: World, player: FlightState, stepped = true): void {
    resolveShots(world, stepped, player, undefined, [], undefined, DT, layout);
  }

  it("a buoy at 200 recharges 2 x (1/120) per stepped tick to exactly 250 and hashes pristine again", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    world.staticHealth.navBuoy = 200;

    tick(world, player);
    expect(world.staticHealth.navBuoy).toBe(200 + 2 * DT);
    // An unstepped tick (the jump step) recharges nothing.
    tick(world, player, false);
    expect(world.staticHealth.navBuoy).toBe(200 + 2 * DT);

    let ticks = 1;
    while (world.staticHealth.navBuoy < 250 && ticks < 4000) {
      tick(world, player);
      ticks += 1;
    }
    expect(world.staticHealth.navBuoy).toBe(250);
    // 50 / (2 / 120) = 3,000 ticks, give or take the rounding of the sum.
    expect(Math.abs(ticks - 3000)).toBeLessThanOrEqual(1);
    expect(world.staticHealth).toEqual(createStaticHealth());
    expect(hashWorld(player, world)).toBe(hashWorld(player, createWorld(7)));
  });

  it("a destroyed buoy stays 0 through 10,000 stepped ticks; the station is never written", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    world.staticHealth.witchpoint = 0;
    world.staticHealth.navBuoy = 249;
    world.staticHealth.station = 24000;
    for (let i = 0; i < 10_000; i += 1) tick(world, player);
    expect(Object.is(world.staticHealth.witchpoint, 0)).toBe(true);
    expect(world.staticHealth.navBuoy).toBe(250);
    expect(world.staticHealth.station).toBe(24000);
  });
});

/*
 * The buoy's frangible subentity (CBT-17, plan 18-15, PD-01).
 *
 * The subentity line runs along world +Z through (0, -4) of the buoy centre:
 * at the identity pose (flight clock 0) the buoy's rear opening exposes the
 * subentity there, so it wins about 1,979.46 m from a start 2,000 m out (a
 * probe of the shipped octrees found the subentity winning at every point of
 * x -2..2, y -6..-2 on this line, so the Viper's 0.15 m mount offset stays on
 * it). Oolite's firing code reads the parent's sticky `subEntityTakingDamage`
 * (`ShipEntity.m:10202-10209`, `10409-10416`): 1 % of the damage on the buoy
 * (frangible), the full damage on the subentity.
 */
const SUB_LINE = vec(0, -4, -2000);
const SUB_LINE_DISTANCE = 1979.46;
const SUB_ENERGY = 200;

function splitHits(target: number, sub: number): SimEvent[] {
  return [
    {
      kind: "shipHit",
      target,
      source: PLAYER_ID,
      amount: FRANGIBLE_BLEED_THROUGH * PULSE.damage,
      shield: false,
    },
    {
      kind: "shipHit",
      target: sub,
      source: PLAYER_ID,
      amount: PULSE.damage,
      shield: false,
    },
  ];
}

function fullHit(target: number): SimEvent[] {
  return [
    {
      kind: "shipHit",
      target,
      source: PLAYER_ID,
      amount: PULSE.damage,
      shield: false,
    },
  ];
}

function shoot(
  world: World,
  player: FlightState,
  hulls: HullTable = FULL,
): SimEvent[] {
  return resolveShots(
    world,
    true,
    player,
    createPlayerCombatState(),
    [pulseOf(player)],
    hullOptions(hulls),
    DT,
    layout,
  );
}

describe("the buoy's frangible subentity (tracer, PD-01, plan 18-15)", () => {
  const subPlayer = (): FlightState =>
    playerAt(add(layout.navBuoy.position, SUB_LINE), PLUS_Z);
  const hullPlayer = (): FlightState =>
    playerAt(add(layout.navBuoy.position, HULL_LINE), PLUS_X);

  it("a pulse whose winning part is the subentity queues the buoy at 1 % then the subentity at 15", () => {
    const world = createWorld(7);
    const events = shoot(world, subPlayer());

    expect(ofKind(events, "shipHit")).toEqual(
      splitHits(STATION_NAV_BUOY_ID, NAV_BUOY_SUBENTITY_ID),
    );
    expect(world.staticHealth.navBuoy).toBe(250 - 0.01 * 15);
    expect(world.staticHealth.navBuoy).toBeCloseTo(249.85, 12);
    expect(world.buoys.navBuoy.subentityEnergy).toBe(185);
    expect(world.buoys.navBuoy.subentityTakingDamage).toBe(true);
    expect(world.buoys.witchpoint.subentityEnergy).toBe(SUB_ENERGY);
    expect(world.buoys.witchpoint.subentityTakingDamage).toBe(false);
    expect(
      Math.abs(beamLength(events) - SUB_LINE_DISTANCE),
    ).toBeLessThanOrEqual(BUOY_TOLERANCE);
    expect(ofKind(events, "shipDestroyed")).toEqual([]);
  });

  it("the witchpoint buoy's subentity is target 6", () => {
    const world = createWorld(7);
    const player = playerAt(add(layout.witchpoint.position, SUB_LINE), PLUS_Z);
    const events = shoot(world, player);
    expect(ofKind(events, "shipHit")).toEqual(
      splitHits(WITCHPOINT_BUOY_ID, WITCHPOINT_BUOY_SUBENTITY_ID),
    );
    expect(world.buoys.witchpoint.subentityEnergy).toBe(185);
    expect(world.buoys.navBuoy.subentityEnergy).toBe(SUB_ENERGY);
  });

  it("is sticky: after one subentity hit a hull beam is split too; on a fresh world a hull beam is one full record", () => {
    const fresh = createWorld(7);
    const hull = shoot(fresh, hullPlayer());
    expect(ofKind(hull, "shipHit")).toEqual(fullHit(STATION_NAV_BUOY_ID));
    expect(fresh.staticHealth.navBuoy).toBe(235);
    expect(fresh.buoys.navBuoy.subentityTakingDamage).toBe(false);
    expect(fresh.buoys.navBuoy.subentityEnergy).toBe(SUB_ENERGY);

    const world = createWorld(7);
    shoot(world, subPlayer());
    const routed = shoot(world, hullPlayer());
    expect(ofKind(routed, "shipHit")).toEqual(
      splitHits(STATION_NAV_BUOY_ID, NAV_BUOY_SUBENTITY_ID),
    );
    // The beam still ends on the hull: only the damage is routed.
    expect(
      Math.abs(beamLength(routed) - HULL_LINE_DISTANCE),
    ).toBeLessThanOrEqual(BUOY_TOLERANCE);
    expect(world.buoys.navBuoy.subentityEnergy).toBe(170);
    expect(world.buoys.navBuoy.subentityTakingDamage).toBe(true);
  });

  it("an NPC shot reads the same flag: a Viper's hull hit after the player's subentity hit is split", () => {
    const world = createWorld(7);
    shoot(world, subPlayer());
    const viper = spawnInto(
      world,
      "viper",
      add(layout.navBuoy.position, vec(-2035, 9, 14)),
      PLUS_X,
    );
    const events = resolveShots(
      world,
      true,
      flyingPlayer(),
      createPlayerCombatState(),
      [viperShot(world, viper)],
      hullOptions(FULL),
      DT,
      layout,
    );
    const beam = LASER_STATS.EQ_WEAPON_BEAM_LASER.damage;
    expect(ofKind(events, "shipHit")).toEqual([
      {
        kind: "shipHit",
        target: STATION_NAV_BUOY_ID,
        source: viper,
        amount: FRANGIBLE_BLEED_THROUGH * beam,
        shield: false,
      },
      {
        kind: "shipHit",
        target: NAV_BUOY_SUBENTITY_ID,
        source: viper,
        amount: beam,
        shield: false,
      },
    ]);
    expect(world.buoys.navBuoy.subentityEnergy).toBe(185 - beam);
  });

  it("14 routed hits detach it at exactly 0 and clear the flag; then the beam no longer meets it and a hull hit is full", () => {
    const player = subPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    // The first hit is a real shot (it sets the flag); 12 more are applied
    // directly, as their records (no recharge between).
    shoot(world, player);
    for (let i = 2; i <= 13; i += 1) {
      const events: SimEvent[] = [];
      applyLedger(
        world,
        true,
        player,
        combat,
        [
          buoyRecord(STATION_NAV_BUOY_ID, FRANGIBLE_BLEED_THROUGH * 15),
          buoyRecord(NAV_BUOY_SUBENTITY_ID, 15),
        ],
        events,
      );
      expect(world.buoys.navBuoy.subentityEnergy).toBe(SUB_ENERGY - 15 * i);
      expect(world.buoys.navBuoy.subentityTakingDamage).toBe(true);
    }
    // The 14th, a real shot: 5 (plus at most one tick of recharge) - 15.
    const detaching = shoot(world, player);
    expect(ofKind(detaching, "shipHit")).toEqual(
      splitHits(STATION_NAV_BUOY_ID, NAV_BUOY_SUBENTITY_ID),
    );
    expect(Object.is(world.buoys.navBuoy.subentityEnergy, 0)).toBe(true);
    expect(world.buoys.navBuoy.subentityTakingDamage).toBe(false);
    expect(ofKind(detaching, "shipDestroyed")).toEqual([]);
    const health = world.staticHealth.navBuoy;
    expect(health).toBeGreaterThan(247.8);
    expect(health).toBeLessThan(250);

    // The 15th on the same line: the subentity is no beam part any more.
    const after = shoot(world, player);
    const hits = ofKind(after, "shipHit");
    expect(hits.filter((h) => h.target === NAV_BUOY_SUBENTITY_ID)).toEqual([]);
    for (const hit of hits) {
      expect(hit).toEqual(fullHit(STATION_NAV_BUOY_ID)[0]);
    }
    expect(beamLength(after)).toBeGreaterThan(SUB_LINE_DISTANCE + 1);
    expect(Object.is(world.buoys.navBuoy.subentityEnergy, 0)).toBe(true);

    // A hull beam is one full record again.
    const before = world.staticHealth.navBuoy;
    const hull = shoot(world, hullPlayer());
    expect(ofKind(hull, "shipHit")).toEqual(fullHit(STATION_NAV_BUOY_ID));
    expect(world.staticHealth.navBuoy).toBeCloseTo(before + 2 * DT - 15, 9);
    expect(world.buoys.navBuoy.subentityTakingDamage).toBe(false);
  });

  it("a Coriolis dock-subentity win queues one full record on the station (not frangible)", () => {
    // The 18-02 fixture `dock-slot-through-dock-back-wall`, 1,500 m out: model
    // start (11, 19, 1500) along model -z, through the slot to the dock's back
    // wall about 1,249.74 m on (the fixture's 2,749.74 from 3,000).
    const player = flyingPlayer();
    const pose = stationPose(layout, player.stationAngle);
    const origin = add(
      pose.position,
      rotate(pose.orientation, vec(11, 19, -1500)),
    );
    const forward = rotate(pose.orientation, vec(0, 0, 1));
    const shooter = playerAt(
      origin,
      quatFromUnitVectors(vec(0, 0, -1), forward),
    );
    shooter.stationAngle = player.stationAngle;
    const world = createWorld(7);
    const events = shoot(world, shooter);
    expect(ofKind(events, "shipHit")).toEqual(fullHit(MAIN_STATION_ID));
    expect(Math.abs(beamLength(events) - 1249.7439)).toBeLessThanOrEqual(
      HULL_TOLERANCE,
    );
    expect(world.staticHealth).toEqual(createStaticHealth());
    expect(hashWorld(shooter, world)).toBe(hashWorld(shooter, createWorld(7)));
  });

  it("without the static hulls (realHullTable) the subentity line hits nothing and changes nothing", () => {
    const world = createWorld(7);
    const player = subPlayer();
    const before = hashWorld(player, world);
    const events = shoot(world, player, HULLS);
    expect(ofKind(events, "shipHit")).toEqual([]);
    expect(hashWorld(player, world)).toBe(before);
  });
});

describe("subentity records in the ledger are total (PD-01)", () => {
  it("skips NaN, Infinity, 0 and negative amounts, a detached subentity and a destroyed buoy's", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    world.buoys.witchpoint.subentityEnergy = 0;
    world.staticHealth.navBuoy = 0;
    const events: SimEvent[] = [];
    const records = [Number.NaN, Infinity, -Infinity, 0, -5].map((amount) =>
      buoyRecord(NAV_BUOY_SUBENTITY_ID, amount),
    );
    records.push(buoyRecord(WITCHPOINT_BUOY_SUBENTITY_ID, 15));
    records.push(buoyRecord(NAV_BUOY_SUBENTITY_ID, 15));
    expect(applyLedger(world, true, player, combat, records, events)).toEqual(
      [],
    );
    expect(events).toEqual([]);
    expect(Object.is(world.buoys.witchpoint.subentityEnergy, 0)).toBe(true);
    expect(world.buoys.navBuoy.subentityEnergy).toBe(SUB_ENERGY);
    expect(world.buoys.navBuoy.subentityTakingDamage).toBe(false);
  });

  it("a huge record floors at exactly 0, is never lethal and clears the flag; an unstepped world is untouched", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    world.buoys.navBuoy.subentityTakingDamage = true;
    const unstepped: SimEvent[] = [];
    applyLedger(
      world,
      false,
      player,
      combat,
      [buoyRecord(NAV_BUOY_SUBENTITY_ID, 15)],
      unstepped,
    );
    expect(unstepped).toEqual([]);
    expect(world.buoys.navBuoy.subentityEnergy).toBe(SUB_ENERGY);

    const events: SimEvent[] = [];
    expect(
      applyLedger(
        world,
        true,
        player,
        combat,
        [
          buoyRecord(NAV_BUOY_SUBENTITY_ID, 1e12),
          buoyRecord(NAV_BUOY_SUBENTITY_ID, 15),
        ],
        events,
      ),
    ).toEqual([]);
    expect(Object.is(world.buoys.navBuoy.subentityEnergy, 0)).toBe(true);
    expect(world.buoys.navBuoy.subentityTakingDamage).toBe(false);
    // The second record meets a detached subentity: nothing.
    expect(ofKind(events, "shipHit").map((h) => h.target)).toEqual([
      NAV_BUOY_SUBENTITY_ID,
    ]);
    expect(world.staticHealth.navBuoy).toBe(250);
  });
});

describe("buoy subentity recharge (energy_recharge_rate 1, ShipEntity.m:292)", () => {
  function tick(world: World, player: FlightState, stepped = true): void {
    resolveShots(world, stepped, player, undefined, [], undefined, DT, layout);
  }

  it("a subentity at 150 recharges 1/120 per stepped tick to exactly 200 and hashes pristine again", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    world.buoys.navBuoy.subentityEnergy = 150;

    tick(world, player);
    expect(world.buoys.navBuoy.subentityEnergy).toBe(150 + DT);
    // An unstepped tick (the jump step) recharges nothing.
    tick(world, player, false);
    expect(world.buoys.navBuoy.subentityEnergy).toBe(150 + DT);

    let ticks = 1;
    while (world.buoys.navBuoy.subentityEnergy < 200 && ticks < 7000) {
      tick(world, player);
      ticks += 1;
    }
    expect(world.buoys.navBuoy.subentityEnergy).toBe(200);
    // 50 / (1 / 120) = 6,000 ticks, give or take the rounding of the sum.
    expect(Math.abs(ticks - 6000)).toBeLessThanOrEqual(1);
    expect(world.buoys.witchpoint.subentityEnergy).toBe(SUB_ENERGY);
    expect(hashWorld(player, world)).toBe(hashWorld(player, createWorld(7)));
  });

  it("a full subentity whose flag is still set does not hash pristine until the flag clears", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    world.buoys.navBuoy.subentityTakingDamage = true;
    tick(world, player);
    expect(world.buoys.navBuoy.subentityEnergy).toBe(SUB_ENERGY);
    expect(hashWorld(player, world)).not.toBe(
      hashWorld(player, createWorld(7)),
    );
  });

  it("a detached subentity stays 0 through 10,000 stepped ticks; a destroyed buoy's never recharges", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    world.buoys.witchpoint.subentityEnergy = 0;
    world.staticHealth.navBuoy = 0;
    world.buoys.navBuoy.subentityEnergy = 100;
    for (let i = 0; i < 10_000; i += 1) tick(world, player);
    expect(Object.is(world.buoys.witchpoint.subentityEnergy, 0)).toBe(true);
    expect(world.buoys.navBuoy.subentityEnergy).toBe(100);
    expect(world.staticHealth.witchpoint).toBe(250);
  });

  it("mid-recharge, the hash is the same at 30, 60 and 144 Hz at every common time until it is full", () => {
    const CADENCES = [30, 60, 144] as const;
    /** Hashes after each frame, keyed by tick, until 120 ticks past full. */
    function run(hz: number): Map<number, string> {
      const player = flyingPlayer();
      player.tick = 0;
      const world = createWorld(7);
      world.buoys.navBuoy.subentityEnergy = 150;
      const combat = createPlayerCombatState();
      const hashes = new Map<number, string>();
      let accumulator = 0;
      let fullAt = -1;
      // Bounded: without recharge the subentity is never full.
      while (fullAt < 0 ? player.tick < 6200 : player.tick < fullAt + 120) {
        accumulator += clampFrameDelta(1 / hz);
        let steps = 0;
        while (accumulator >= DT && steps < MAX_STEPS_PER_FRAME) {
          stepOnce(player, world, combat, ZERO_INTENT, hullOptions(FULL));
          accumulator -= DT;
          steps += 1;
        }
        if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;
        if (fullAt < 0 && world.buoys.navBuoy.subentityEnergy === 200) {
          fullAt = player.tick;
        }
        hashes.set(player.tick, hashWorld(player, world, combat));
      }
      expect(fullAt).toBeGreaterThan(0);
      return hashes;
    }
    const runs = CADENCES.map(run);
    const [first, ...rest] = runs;
    if (first === undefined) throw new Error("no run");
    let common = 0;
    for (const [tick, hash] of first) {
      if (!rest.every((other) => other.has(tick))) continue;
      common += 1;
      for (const other of rest) expect(other.get(tick)).toBe(hash);
    }
    // 30 Hz frames are 4 ticks, 144 Hz frames 5 or 6 every 6 frames: the
    // common times recur every 20 ticks over about 6,000.
    expect(common).toBeGreaterThan(250);
  });
});

/*
 * Pods and plates as laser targets (D-07, plan 18-15): a `cargo` entity whose
 * spec key has a hull (`barrel`, `alloy` in the merged table) is a candidate
 * after the ships in the same ascending pass; a wreck never is
 * (`canCollide`, `ShipEntity.m:1858-1868`). Energy 1, so one pulse kills it,
 * through `killShip`, silently.
 */
describe("pods and plates are shot; wrecks are not (D-07)", () => {
  function spawnDebris(
    world: World,
    kind: "cargo" | "wreckage",
    specKey: string,
    position: Vec3,
  ): number {
    const result = spawnEntity(
      world,
      {
        kind,
        specKey,
        scanClass: kind === "cargo" ? "CLASS_CARGO" : "CLASS_NO_DRAW",
        position,
        orientation: identity(),
        radius: 5.8,
        speed: 0,
        ai: null,
        maxEnergy: DEBRIS_MAX_ENERGY,
        energyRechargeRate: 0,
      },
      0,
    );
    if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
    return result.entity.id;
  }

  /** A Viper 50 km from the player, nose -Z, and the point 1,500 m down its line. */
  const VIPER_AT = vec(FAR.x + 50_000, 0, 0);
  const VIPER_LINE = vec(VIPER_AT.x, -0.15, -1500);

  it("one tick: the player's pulse kills a pod and a Viper's beam a plate, removed at the second commit, silently", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const pod = spawnDebris(
      world,
      "cargo",
      "barrel",
      add(foreMount(), vec(0, 0, -1500)),
    );
    const plate = spawnDebris(world, "cargo", "alloy", VIPER_LINE);
    const viper = spawnInto(world, "viper", VIPER_AT);
    const shooter = world.store.get(viper);
    if (shooter === undefined) throw new Error("no viper");
    shooter.weapon.missedShots = 2;
    const liveBefore = world.store.live.length;

    const events = resolveShots(
      world,
      true,
      player,
      createPlayerCombatState(),
      [playerShot(player), viperShot(world, viper)],
      hullOptions(FULL),
      DT,
      layout,
    );

    expect(ofKind(events, "shipHit").map((h) => [h.target, h.source])).toEqual([
      [pod, PLAYER_ID],
      [plate, viper],
    ]);
    expect(ofKind(events, "shipDestroyed")).toEqual([]);
    expect(ofKind(events, "entityRemoved")).toEqual([
      { kind: "entityRemoved", id: pod },
      { kind: "entityRemoved", id: plate },
    ]);
    expect(world.store.get(pod)).toBeUndefined();
    expect(world.store.get(plate)).toBeUndefined();
    // No debris: only the two pieces left.
    expect(world.store.live.length).toBe(liveBefore - 2);
    // The Viper's shot that ended on the plate is a hit (ShipEntity.m:10396).
    expect(shooter.weapon.missedShots).toBe(1);
  });

  it("a wreck in the line of fire is no candidate, even with a hull under its key", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    // A probe: the plate's hull key on a wreck, so only the kind filter
    // keeps it out.
    const wreck = spawnDebris(
      world,
      "wreckage",
      "alloy",
      add(foreMount(), vec(0, 0, -1500)),
    );
    const events = resolveShots(
      world,
      true,
      player,
      createPlayerCombatState(),
      [playerShot(player)],
      hullOptions(FULL),
      DT,
      layout,
    );
    expect(ofKind(events, "shipHit")).toEqual([]);
    expect(beamLength(events)).toBeGreaterThan(1600);
    expect(energyOf(world, wreck)).toBe(DEBRIS_MAX_ENERGY);
  });

  it("with realHullTable no pod or plate is a candidate: the same shots change nothing", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const pod = spawnDebris(
      world,
      "cargo",
      "barrel",
      add(foreMount(), vec(0, 0, -1500)),
    );
    const viper = spawnInto(world, "viper", VIPER_AT);
    const plate = spawnDebris(world, "cargo", "alloy", VIPER_LINE);
    const combat = createPlayerCombatState();
    const events = resolveShots(
      world,
      true,
      player,
      combat,
      [playerShot(player), viperShot(world, viper)],
      hullOptions(HULLS),
      DT,
      layout,
    );
    expect(ofKind(events, "shipHit")).toEqual([]);
    expect(energyOf(world, pod)).toBe(DEBRIS_MAX_ENERGY);
    expect(energyOf(world, plate)).toBe(DEBRIS_MAX_ENERGY);
  });
});
