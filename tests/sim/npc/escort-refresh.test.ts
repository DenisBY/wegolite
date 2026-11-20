// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Escort formation (AI-01, plan 14-15): the default V pattern, the formation
 * form-up behaviour and the leader refresh the world step runs. Expected values
 * are derived by hand from the cited lines (`oolite-global-prefix.js:165-193`,
 * `ShipEntity.m:2427-2436`, `5002-5047`, `ShipEntityAI.m:365-371`), never from
 * running the implementation. The independent escort fixtures run in
 * `avoid-escort.oracle.test.ts`.
 */

import { describe, expect, it } from "vitest";

import { identity, quat, vec } from "../../../src/sim/math.js";
import { behaviourFormationFormUp } from "../../../src/sim/npc/behaviours/formation.js";
import { enterBehaviour } from "../../../src/sim/npc/enter.js";
import {
  escortCoordinates,
  refreshEscorts,
} from "../../../src/sim/npc/escort.js";
import { DT } from "../../../src/sim/time.js";
import { killEntity } from "../../../src/sim/world/world.js";
import { createWorld } from "../../../src/sim/world/world.js";
import { realNpcFlightTable } from "../../helpers/npc-flight.js";
import { harness, other, ship, statsWith } from "./attack-support.js";
import {
  flyTo,
  hullRadius,
  playerAt,
  spawnShip,
  stepOnce,
} from "./world-support.js";

const VIPER = hullRadius("viper");
const FACTS = { flight: realNpcFlightTable() };

describe("escortCoordinates (oolite-global-prefix.js:165-193, ShipEntity.m:12029-12044)", () => {
  // Leader radius 50: spacing = 50 x 3 x highPart = 150 for slots 0-3. Oolite's
  // pattern vectors (-2,0,-1), (2,0,-1), (-3,0,-3), (3,0,-3) have the z
  // component negated for Wegolite (forward is local -Z, so "behind" is +Z).
  const level = { position: vec(100, 0, 0), orientation: identity() };

  it.each([
    [0, vec(100 - 300, 0, 150)],
    [1, vec(100 + 300, 0, 150)],
    [2, vec(100 - 450, 0, 450)],
    [3, vec(100 + 450, 0, 450)],
  ])(
    "slot %i of the first row sits 3 radii x the pattern behind the leader",
    (slot, expected) => {
      expect(escortCoordinates(level, 50, slot)).toEqual(expected);
    },
  );

  it("the second row doubles the spacing, the third triples it (highPart = floor(slot / 4) + 1)", () => {
    // slot 4: highPart 2, lowPart 0: spacing 300: (-2, -1) x 300
    expect(escortCoordinates(level, 50, 4)).toEqual(vec(100 - 600, 0, 300));
    expect(escortCoordinates(level, 50, 5)).toEqual(vec(100 + 600, 0, 300));
    // slot 8: highPart 3, lowPart 0: spacing 450
    expect(escortCoordinates(level, 50, 8)).toEqual(vec(100 - 900, 0, 450));
    // slot 15: highPart 4, lowPart 3: spacing 600: (3, -3) x 600
    expect(escortCoordinates(level, 50, 15)).toEqual(vec(100 + 1800, 0, 1800));
  });

  it("a slot above 15 takes the last position (ShipEntity.m:12031)", () => {
    expect(escortCoordinates(level, 50, 40)).toEqual(
      escortCoordinates(level, 50, 15),
    );
  });

  it("scales with the leader's collision radius", () => {
    expect(escortCoordinates(level, 10, 0)).toEqual(vec(100 - 60, 0, 30));
  });

  it("rotates the offset into the leader's frame", () => {
    // +90 degrees about Y: local -X (left) becomes world +Z and local +Z
    // (behind) becomes world +X. Slot 0 is (-300, 0, +150) in the local frame.
    const turned = {
      position: vec(100, 0, 0),
      orientation: quat(Math.SQRT1_2, 0, Math.SQRT1_2, 0),
    };
    const at = escortCoordinates(turned, 50, 0);
    expect(at.x).toBeCloseTo(100 + 150, 9);
    expect(at.y).toBeCloseTo(0, 9);
    expect(at.z).toBeCloseTo(300, 9);
  });
});

describe("performEscort (ShipEntityAI.m:365-371)", () => {
  it("sets the behaviour and resets the frustration when the behaviour changes", () => {
    const entity = ship(2);
    entity.nav.behaviour = "IDLE";
    entity.steer.frustration = 3;
    entity.steer.entryPending = true;
    enterBehaviour(entity, "FORMATION_FORM_UP");
    expect(entity.nav.behaviour).toBe("FORMATION_FORM_UP");
    expect(entity.steer.frustration).toBe(0);
    expect(entity.steer.entryPending).toBe(false);
  });

  it("is a no-op when the ship already flies in formation: the frustration stays", () => {
    const entity = ship(2);
    entity.nav.behaviour = "FORMATION_FORM_UP";
    entity.steer.frustration = 3;
    entity.steer.entryPending = true;
    enterBehaviour(entity, "FORMATION_FORM_UP");
    expect(entity.nav.behaviour).toBe("FORMATION_FORM_UP");
    expect(entity.steer.frustration).toBe(3);
    expect(entity.steer.entryPending).toBe(false);
  });
});

describe("behaviour_formation_form_up (ShipEntity.m:5002-5047)", () => {
  // stats: 160 m/s, roll 2, pitch 1, thrust 15 -> minTurnSpeedFactor 0.05 x 1 x
  // 2 = 0.1, so the slowdown needs flightSpeed above 16 m/s. A ship at 100 m/s
  // has slowdownTime = 100 / 15 = 6.667 s.
  const STATS = statsWith("EQ_WEAPON_NONE");

  /** A follower of leader 150 (speed 100) flying at 100 m/s toward `ahead` metres in front of it. */
  function follower(ahead: number, withLeader = true) {
    const entity = ship(2);
    entity.speed = 100;
    entity.nav.behaviour = "FORMATION_FORM_UP";
    entity.nav.destination = vec(0, 0, -ahead);
    entity.nav.desiredRange = 0;
    entity.ownerId = withLeader ? 150 : 0;
    const leader = { ...other(150, vec(5000, 0, 0), 50), speed: 100 };
    const h = harness(entity, withLeader ? [leader] : [], STATS);
    return { entity, h };
  }

  it("matches the leader's speed plus 5% per second of eta inside five seconds (no cut)", () => {
    // 400 m at 100 m/s: eta 4 s < 5; desired = 100 x (1 + 4 x 0.05) = 120;
    // eta / 0.51 = 7.84 s is not below slowdownTime 6.667: no 50% cut
    const { entity, h } = follower(400);
    behaviourFormationFormUp(entity, h.ctx);
    expect(entity.nav.desiredSpeed).toBeCloseTo(120, 9);
  });

  it("flies at the maximum speed when eta is five seconds or more (no cut)", () => {
    // 1000 m: eta 10; eta / 0.51 = 19.6 > 6.667
    const { entity, h } = follower(1000);
    behaviourFormationFormUp(entity, h.ctx);
    expect(entity.nav.desiredSpeed).toBe(160);
  });

  it("cuts the speed to half the current speed when the eta says it must slow down", () => {
    // 300 m: eta 3, desired 115, then eta / 0.51 = 5.88 < 6.667 and
    // 100 m/s > 160 x 0.1: desired = 100 x 0.5 = 50
    const { entity, h } = follower(300);
    behaviourFormationFormUp(entity, h.ctx);
    expect(entity.nav.desiredSpeed).toBe(50);
  });

  it("with no leader flies at the maximum speed, then cuts as above (5013)", () => {
    // 400 m, no leader: eta 4 is below 5 but there is no leader: desired is
    // maxFlightSpeed 160; eta / 0.51 = 7.84 is not below 6.667: stays
    const { entity, h } = follower(400, false);
    behaviourFormationFormUp(entity, h.ctx);
    expect(entity.nav.desiredSpeed).toBe(160);
  });

  it("an owner that is the ship itself counts as no leader", () => {
    const { entity, h } = follower(400);
    entity.ownerId = entity.id;
    behaviourFormationFormUp(entity, h.ctx);
    expect(entity.nav.desiredSpeed).toBe(160);
  });

  it("stores the distance as a float and counts a first update as no improvement", () => {
    const { entity, h } = follower(400);
    behaviourFormationFormUp(entity, h.ctx);
    expect(entity.steer.successFactor).toBe(Math.fround(400));
    // success_factor was 0, so 400 < 0 is false: the frustration grows by dt
    expect(entity.steer.frustration).toBe(Math.fround(DT));
  });

  it("relieves the frustration by 0.25 dt on an improvement, never below 0", () => {
    const { entity, h } = follower(400);
    entity.steer.successFactor = 500; // last distance
    entity.steer.frustration = 1;
    behaviourFormationFormUp(entity, h.ctx);
    expect(entity.steer.frustration).toBe(Math.fround(1 - 0.25 * (1 / 120)));
    const second = follower(400);
    second.entity.steer.successFactor = 500;
    second.entity.steer.frustration = 0.001;
    behaviourFormationFormUp(second.entity, second.h.ctx);
    expect(second.entity.steer.frustration).toBe(0);
  });

  it("past 15 s of frustration with a leader: pitches over when more than half the scanner range away, and resets", () => {
    // destination 20,000 m ahead: farther than 0.5 x 25,600 = 12,800 m
    const far = follower(20000);
    far.entity.steer.frustration = 14.999;
    behaviourFormationFormUp(far.entity, far.h.ctx);
    expect(far.entity.steer.pitchingOver).toBe(true);
    expect(far.entity.steer.frustration).toBe(0);
    expect(far.h.events).toEqual([]);
    // 5,000 m: close enough, only the reset
    const near = follower(5000);
    near.entity.steer.frustration = 14.999;
    behaviourFormationFormUp(near.entity, near.h.ctx);
    expect(near.entity.steer.pitchingOver).toBe(false);
    expect(near.entity.steer.frustration).toBe(0);
    expect(near.h.events).toEqual([]);
  });

  it("past 15 s of frustration with no leader: reports it once and resets", () => {
    const { entity, h } = follower(400, false);
    entity.steer.frustration = 14.999;
    behaviourFormationFormUp(entity, h.ctx);
    expect(h.events).toEqual([{ name: "shipAIFrustrated" }]);
    expect(entity.steer.frustration).toBe(0);
    expect(entity.steer.pitchingOver).toBe(false);
  });

  it("enters avoid collision on an alert, saving FORMATION_FORM_UP", () => {
    const { entity } = follower(400);
    const bodies = [
      { ...other(150, vec(5000, 0, 0), 50), speed: 100 },
      other(160, vec(0, 0, -100), 20),
    ];
    const h = harness(entity, bodies, STATS);
    entity.steer.proximityAlert = 160;
    behaviourFormationFormUp(entity, h.ctx);
    expect(entity.nav.behaviour).toBe("AVOID_COLLISION");
    expect(entity.steer.saved?.behaviour).toBe("FORMATION_FORM_UP");
  });

  it("draws nothing", () => {
    const { entity, h } = follower(400);
    behaviourFormationFormUp(entity, h.ctx);
    expect(h.used()).toBe(0);
  });
});

/* ---------------------------------------------------------------------------
 * The refresh in a live world
 * ------------------------------------------------------------------------- */

/** A steered leader flying level at 100 m/s along -Z, radius 50, with `followers` steered followers. */
function convoy(options: { leaderSteered?: boolean } = {}) {
  const world = createWorld(1);
  // PD-06: this scenario is not about the witchpoint beacon (owner decision 2026-11-20)
  world.staticHealth.witchpoint = 0;
  const player = playerAt();
  const leader = spawnShip(world, {
    specKey: "viper",
    position: vec(0, 0, 0),
    radius: 50,
    speed: 100,
    steered: options.leaderSteered ?? true,
  });
  flyTo(leader, vec(0, 0, -30000), 100);
  const first = spawnShip(world, {
    specKey: "viper",
    position: vec(-3000, 0, 4000),
    radius: VIPER,
    speed: 100,
    steered: true,
    ownerId: leader.id,
    escortSlot: 0,
  });
  first.nav.behaviour = "FORMATION_FORM_UP";
  const second = spawnShip(world, {
    specKey: "viper",
    position: vec(3000, 0, 4000),
    radius: VIPER,
    speed: 100,
    steered: true,
    ownerId: leader.id,
    escortSlot: 1,
  });
  // a follower in another behaviour still gets its destination
  second.nav.behaviour = "IDLE";
  return { world, player, leader, first, second };
}

describe("the leader refresh in the world step (ShipEntity.m:2427-2436)", () => {
  it("writes every follower's destination each tick, right after the leader's move", () => {
    const { world, player, leader, first, second } = convoy();
    for (let t = 1; t <= 5; t += 1) {
      stepOnce(world, player, FACTS);
      // the leader flies level at 100 m/s along -Z; after t ticks it is at
      // z = -100 t DT, and the slots sit (-300, +150) and (+300, +150) from it
      const z = -100 * DT * t;
      expect(leader.position.z).toBeCloseTo(z, 9);
      expect(first.nav.destination.x).toBeCloseTo(-300, 9);
      expect(first.nav.destination.z).toBeCloseTo(z + 150, 9);
      expect(second.nav.destination.x).toBeCloseTo(300, 9);
      expect(second.nav.destination.z).toBeCloseTo(z + 150, 9);
      expect(first.nav.destination.y).toBeCloseTo(0, 9);
    }
    expect(second.nav.behaviour).toBe("IDLE");
  });

  it("a follower of a higher id than its leader reads the fresh destination in the same tick", () => {
    const { world, player, leader, first } = convoy();
    const start = { ...first.position };
    stepOnce(world, player, FACTS);
    // the formation update stores the distance from where it started the tick
    // to the destination the refresh wrote this tick
    const z = leader.position.z + 150;
    const expected = Math.hypot(-300 - start.x, 0 - start.y, z - start.z);
    expect(first.steer.successFactor).toBe(Math.fround(expected));
  });

  it("a follower of a lower id than its leader reads the previous tick's destination", () => {
    // recorded divergence: it steers before the leader moves and refreshes it
    const world = createWorld(1);
    const player = playerAt();
    const follower = spawnShip(world, {
      specKey: "viper",
      position: vec(-3000, 0, 4000),
      radius: VIPER,
      speed: 100,
      steered: true,
      ownerId: 102,
      escortSlot: 0,
    });
    follower.nav.behaviour = "FORMATION_FORM_UP";
    follower.nav.destination = vec(0, 0, 0);
    const leader = spawnShip(world, {
      specKey: "viper",
      position: vec(0, 0, 0),
      radius: 50,
      speed: 100,
      steered: true,
    });
    flyTo(leader, vec(0, 0, -30000), 100);
    expect(leader.id).toBe(102);
    const start = { ...follower.position };
    stepOnce(world, player, FACTS);
    // the follower measured its distance to the destination it had before the
    // refresh, (0, 0, 0), and the refresh then wrote the new one
    expect(follower.steer.successFactor).toBe(
      Math.fround(Math.hypot(start.x, start.y, start.z)),
    );
    expect(follower.nav.destination.x).toBeCloseTo(-300, 9);
  });

  it("a removed leader leaves the followers on the no-leader path", () => {
    const { world, player, leader, first } = convoy();
    // 50 m ahead of the follower: eta below 5 s. With a leader its desired speed
    // would follow the leader's; with none it is the maximum speed, 320 m/s.
    first.speed = 60;
    first.position = vec(0, 0, 0);
    first.nav.destination = vec(0, 0, -50);
    killEntity(world, leader.id);
    stepOnce(world, player, FACTS);
    expect(first.nav.desiredSpeed).toBe(320);
    expect(first.nav.destination.z).toBeCloseTo(-50, 9);
  });

  it("an inert leader refreshes nobody", () => {
    const { world, player, first, second } = convoy({ leaderSteered: false });
    first.nav.destination = vec(7, 8, 9);
    second.nav.destination = vec(1, 2, 3);
    stepOnce(world, player, FACTS);
    expect(first.nav.destination).toEqual(vec(7, 8, 9));
    expect(second.nav.destination).toEqual(vec(1, 2, 3));
  });

  it("refreshEscorts writes only live steered followers of that leader", () => {
    const { world, leader, first, second } = convoy();
    const stranger = spawnShip(world, {
      specKey: "viper",
      position: vec(0, 0, 9000),
      radius: VIPER,
      steered: true,
      ownerId: 999,
    });
    const inertFollower = spawnShip(world, {
      specKey: "viper",
      position: vec(0, 0, 9000),
      radius: VIPER,
      ownerId: leader.id,
    });
    const before = {
      stranger: { ...stranger.nav.destination },
      inert: { ...inertFollower.nav.destination },
    };
    second.ai = null; // an inert follower is not refreshed either
    const secondBefore = { ...second.nav.destination };
    refreshEscorts(world, leader);
    expect(first.nav.destination.x).toBeCloseTo(-300, 9);
    expect(second.nav.destination).toEqual(secondBefore);
    expect(stranger.nav.destination).toEqual(before.stranger);
    expect(inertFollower.nav.destination).toEqual(before.inert);
    // the leader itself is never its own escort
    expect(leader.nav.destination).toEqual(vec(0, 0, -30000));
  });
});
