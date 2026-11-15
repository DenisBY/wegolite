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
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
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
