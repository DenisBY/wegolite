// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The NPC fire gate on a real entity and a real world view (CBT-15, plan 17-04).
 * Expected values are derived by hand from the cited `ShipEntity.m` lines
 * (pin 7437f22), never from running the implementation. This file holds only
 * what the independent oracle cannot express: the tracer through a real world
 * view, the refusal order and draw count on a real entity, the unresolved
 * sentinel, `npcFireBlocked`, `-0` and pristine writes and malformed input.
 * Every boundary value (cutout, energy, timer, range, cone, aim tolerance) is
 * pinned by the fixtures `fire.oracle.test.ts` runs.
 *
 * Frame: Wegolite's local forward is -Z; a half turn about +Y faces +Z.
 */

import { describe, expect, it } from "vitest";

import { identity, vec } from "../../../src/sim/math.js";
import { NO_LASER } from "../../../src/sim/combat/mounts.js";
import type { MountKey } from "../../../src/sim/combat/mounts.js";
import {
  adjustMissedShots,
  coolWeapon,
  heatWeapon,
  npcFireBlocked,
  npcFireGate,
  npcOnTarget,
  npcRechargeTicks,
  onTargetCone,
} from "../../../src/sim/npc/fire.js";
import type { NpcFireGateInput } from "../../../src/sim/npc/fire.js";
import { ACCURACY_UNRESOLVED } from "../../../src/sim/npc/state.js";
import { PLAYER_COLLISION_RADIUS_M } from "../../../src/sim/npc/stats.js";
import { rangeToTargetIn } from "../../../src/sim/npc/target.js";
import type { Entity } from "../../../src/sim/world/entity.js";
import { PLAYER_ID } from "../../../src/sim/world/ids.js";
import { MAX_UINT32 } from "../../../src/sim/world/limits.js";
import { createWorld } from "../../../src/sim/world/world.js";
import { createWorldView } from "../../../src/sim/world/view-impl.js";
import { FACING_PLUS_Z, layout, playerAt, spawnShip } from "./world-support.js";

const BEAM: MountKey = "EQ_WEAPON_BEAM_LASER";
const SHIP_RADIUS = 40;

/** A draw stub that counts its calls and returns scripted values. */
function counting(values: readonly number[]): {
  draw: () => number;
  count: () => number;
} {
  let calls = 0;
  return {
    draw: () => {
      const value = values[calls] ?? 0.9;
      calls += 1;
      return value;
    },
    count: () => calls,
  };
}

/**
 * A Viper-like steered ship (beam, accuracy 3, energy 180, weapon pristine)
 * 1500 m from the player, which sits at the origin. `faces` picks the
 * orientation: toward the player (+Z) or away from it (identity, -Z).
 */
function viperAndView(faces: "player" | "away" = "player") {
  const world = createWorld(1);
  const player = playerAt();
  player.position = vec(0, 0, 0);
  const viper = spawnShip(world, {
    specKey: "viper",
    position: vec(0, 0, -1500),
    ...(faces === "player" ? { orientation: FACING_PLUS_Z } : {}),
    radius: SHIP_RADIUS,
    steered: true,
  });
  viper.steer.accuracy = 3;
  viper.energy = 180;
  viper.nav.targetId = PLAYER_ID;
  const view = createWorldView(
    world,
    player,
    layout,
    PLAYER_COLLISION_RADIUS_M,
  );
  return { world, viper, view };
}

function gateInput(
  viper: Entity,
  view: ReturnType<typeof createWorldView>,
  tick: number,
  overrides: Partial<NpcFireGateInput> = {},
): NpcFireGateInput {
  return {
    temperature: viper.weapon.temperature,
    energy: viper.energy,
    tick,
    lastShotTick: viper.weapon.lastShotTick,
    laser: BEAM,
    accuracy: viper.steer.accuracy,
    range: rangeToTargetIn(viper, view),
    onTarget: () => npcOnTarget(viper, view, tick),
    ...overrides,
  };
}

describe("the tracer: a Viper-like beam ship through a real world view", () => {
  it("the range is the centre distance less both radii (9718-9733)", () => {
    const { viper, view } = viperAndView();
    // 1500 - 72.69734954833984 (the player's compiled radius) - 40
    expect(rangeToTargetIn(viper, view)).toBeCloseTo(1387.30265045166, 9);
  });

  it("fires once with one draw, refuses at the timer with no draw until 12 ticks pass", () => {
    const { viper, view } = viperAndView();
    const stub = counting([0.5, 0.25]);

    // Tick 1000, never fired (lastShotTick 0): roll threshold 0.5 x 15000 x
    // (3 + 7.5) = 78750 > range 1387; in range; dead ahead is on target.
    const first = npcFireGate(gateInput(viper, view, 1000), stub.draw);
    expect(first).toEqual({ kind: "fired" });
    expect(stub.count()).toBe(1);

    // The caller applies cost, heat and the timer (9968-9973): beam energy 0.5,
    // shot temperature 3.2 (float32), lastShotTick = the tick.
    viper.energy -= 0.5;
    viper.weapon.temperature = heatWeapon(viper.weapon.temperature, 3.2);
    viper.weapon.lastShotTick = 1000;
    expect(viper.weapon.temperature).toBe(3.200000047683716);

    // Same tick: 0 ticks since the shot, 0 >= 12 is false: timer, no draw.
    const same = npcFireGate(gateInput(viper, view, 1000), stub.draw);
    expect(same).toEqual({ kind: "refused", reason: "timer", drew: false });
    expect(stub.count()).toBe(1);

    // 11 ticks: still refuses; 12 ticks fires (NPC >=, 9946).
    const eleven = npcFireGate(gateInput(viper, view, 1011), stub.draw);
    expect(eleven).toEqual({ kind: "refused", reason: "timer", drew: false });
    expect(stub.count()).toBe(1);
    const twelve = npcFireGate(gateInput(viper, view, 1012), stub.draw);
    expect(twelve).toEqual({ kind: "fired" });
    expect(stub.count()).toBe(2);
  });
});

describe("the refusal order and the draw count on a real entity (9933-9958)", () => {
  it("a hot weapon with no energy refuses at heat, not energy, with no draw", () => {
    const { viper, view } = viperAndView();
    viper.energy = 0;
    const stub = counting([0.5]);
    const result = npcFireGate(
      gateInput(viper, view, 1000, { temperature: 250 }),
      stub.draw,
    );
    expect(result).toEqual({ kind: "refused", reason: "heat", drew: false });
    expect(stub.count()).toBe(0);
  });

  it("energy equal to the beam's cost of 0.5 refuses at energy, ahead of the running timer, with no draw", () => {
    const { viper, view } = viperAndView();
    viper.energy = 0.5;
    viper.weapon.lastShotTick = 1000;
    const stub = counting([0.5]);
    const result = npcFireGate(gateInput(viper, view, 1001), stub.draw);
    expect(result).toEqual({ kind: "refused", reason: "energy", drew: false });
    expect(stub.count()).toBe(0);
  });

  it("a draw of 0.001 refuses at the roll: 0.001 x 15000 x 10.5 = 157.5 is below the range", () => {
    const { viper, view } = viperAndView();
    const stub = counting([0.001]);
    const result = npcFireGate(gateInput(viper, view, 1000), stub.draw);
    expect(result).toEqual({ kind: "refused", reason: "roll", drew: true });
    expect(stub.count()).toBe(1);
  });

  it("turned away refuses at onTarget after one draw", () => {
    const { viper, view } = viperAndView("away");
    const stub = counting([0.5]);
    const result = npcFireGate(gateInput(viper, view, 1000), stub.draw);
    expect(result).toEqual({
      kind: "refused",
      reason: "onTarget",
      drew: true,
    });
    expect(stub.count()).toBe(1);
  });

  it("EQ_WEAPON_NONE takes the one draw, passes every check and refuses at noWeapon, never firing", () => {
    // 17-01: the unarmed object has energy use 0, range 32000, recharge 100 s;
    // with positive energy and the target dead ahead only isWeaponNone refuses.
    const { viper, view } = viperAndView();
    const stub = counting([0.5]);
    const result = npcFireGate(
      gateInput(viper, view, 1000, { laser: NO_LASER }),
      stub.draw,
    );
    expect(result).toEqual({
      kind: "refused",
      reason: "noWeapon",
      drew: true,
    });
    expect(stub.count()).toBe(1);
  });

  it("EQ_WEAPON_NONE with no energy refuses at energy, no draw (energy <= 0, 9944)", () => {
    const { viper, view } = viperAndView();
    viper.energy = 0;
    const stub = counting([0.5]);
    const result = npcFireGate(
      gateInput(viper, view, 1000, { laser: NO_LASER }),
      stub.draw,
    );
    expect(result).toEqual({ kind: "refused", reason: "energy", drew: false });
    expect(stub.count()).toBe(0);
  });
});

describe("the unresolved accuracy sentinel", () => {
  it("refuses with no draw, whatever else holds", () => {
    const { viper, view } = viperAndView();
    viper.steer.accuracy = ACCURACY_UNRESOLVED;
    const stub = counting([0.5]);
    const result = npcFireGate(gateInput(viper, view, 1000), stub.draw);
    expect(result).toEqual({
      kind: "refused",
      reason: "unresolved",
      drew: false,
    });
    expect(stub.count()).toBe(0);
  });
});

describe("npcFireBlocked (the Wegolite-only refusal, Pitfall 16)", () => {
  it("is null for a steered ship with a valid target", () => {
    const { viper } = viperAndView();
    expect(npcFireBlocked(viper)).toBeNull();
  });

  it("is noAi for a ship whose ai is null", () => {
    const { viper } = viperAndView();
    viper.ai = null;
    expect(npcFireBlocked(viper)).toBe("noAi");
  });

  it("is selfTarget for a ship whose nav target is its own id", () => {
    const { viper } = viperAndView();
    viper.nav.targetId = viper.id;
    expect(npcFireBlocked(viper)).toBe("selfTarget");
  });

  it("a self target has range 0 and is off target, and neither throws", () => {
    const { viper, view } = viperAndView();
    viper.nav.targetId = viper.id;
    expect(rangeToTargetIn(viper, view)).toBe(0);
    expect(npcOnTarget(viper, view, 1000)).toBe(false);
  });

  it("no target at all is off target with range 0", () => {
    const { viper, view } = viperAndView();
    viper.nav.targetId = 0;
    expect(rangeToTargetIn(viper, view)).toBe(0);
    expect(npcOnTarget(viper, view, 1000)).toBe(false);
  });
});

describe("npcRechargeTicks, the one home of the shot period (D-07)", () => {
  it.each([
    ["EQ_WEAPON_PULSE_LASER", 60], // round(0.5 x 120)
    ["EQ_WEAPON_BEAM_LASER", 12], // round(0.1 x 120)
    ["EQ_WEAPON_MINING_LASER", 300], // round(2.5 x 120)
    ["EQ_WEAPON_MILITARY_LASER", 12], // round(0.1 x 120)
    [NO_LASER, 12000], // the unarmed 100 s
  ] as const)("%s is %d ticks", (laser, ticks) => {
    expect(npcRechargeTicks(laser)).toBe(ticks);
  });
});

describe("onTargetCone on malformed input", () => {
  it("answers false and never throws for a non-finite aim point or radius", () => {
    const origin = vec(0, 0, 0);
    const facing = identity();
    expect(onTargetCone(origin, facing, vec(Number.NaN, 0, 0), 10, 0.99)).toBe(
      false,
    );
    expect(onTargetCone(origin, facing, vec(0, 0, -100), Number.NaN, 0.5)).toBe(
      true,
    ); // dq 1 > 0.25: the radius is not reached
    expect(onTargetCone(origin, facing, vec(0, 0, -100), Number.NaN, 2)).toBe(
      false,
    ); // dq 1 <= 4: the cone test reads the NaN radius and refuses
  });

  it("a zero offset points along Oolite's world +Z, which is behind an identity ship", () => {
    // vector_normal_or_zbasis of 0 is (0, 0, 1) in Oolite, (0, 0, -1) here: the
    // identity ship faces -Z, so dq = 1 and a generous tolerance accepts it.
    const origin = vec(0, 0, 0);
    expect(onTargetCone(origin, identity(), origin, 10, 0.5)).toBe(true);
    // Turned half a turn it faces +Z: dq = -1, off target.
    expect(onTargetCone(origin, FACING_PLUS_Z, origin, 10, 0.5)).toBe(false);
  });
});

describe("the weapon-state updates (2214-2218, 9972, 10468-10477)", () => {
  it("coolWeapon of 0 is 0, never -0", () => {
    expect(Object.is(coolWeapon(0, 1 / 120), 0)).toBe(true);
    // 0.01 - 6 / 120 is negative: fmaxf gives +0.
    expect(Object.is(coolWeapon(0.01, 1 / 120), 0)).toBe(true);
  });

  it("coolWeapon takes fround(6 dt) off in float32: 10 gives 9.95f", () => {
    // 6 / 120 = 0.05 -> 0.05f = 0.05000000074505806; 10 - that = 9.94999999925...,
    // nearest float32 (ulp 2^-20) is 9.949999809265137 (the float32 of 9.95).
    expect(coolWeapon(10, 1 / 120)).toBe(9.949999809265137);
  });

  it("coolWeapon returns 0 for NaN and infinities", () => {
    expect(coolWeapon(Number.NaN, 1 / 120)).toBe(0);
    expect(coolWeapon(Number.POSITIVE_INFINITY, 1 / 120)).toBe(0);
    expect(coolWeapon(Number.NEGATIVE_INFINITY, 1 / 120)).toBe(0);
  });

  it("heatWeapon adds the shot temperature in float32: the beam's 3.2 is 3.2f", () => {
    // 3.2f = 3.2000000476837158 (nearest float32 to 3.2)
    const heated = heatWeapon(0, 3.2);
    expect(heated).toBe(3.200000047683716);
    expect(Math.fround(heated)).toBe(heated);
  });

  it("heatWeapon clamps to the stored bound and never returns a negative or NaN", () => {
    expect(heatWeapon(999, 7)).toBe(1000);
    expect(heatWeapon(0, Number.NaN)).toBe(0);
    expect(Object.is(heatWeapon(0, 0), 0)).toBe(true);
  });

  it("adjustMissedShots adds the delta, floors at 0 without -0 and saturates at MAX_UINT32", () => {
    expect(adjustMissedShots(0, 1)).toBe(1);
    expect(adjustMissedShots(5, 1)).toBe(6);
    expect(adjustMissedShots(5, -1)).toBe(4);
    expect(Object.is(adjustMissedShots(0, -1), 0)).toBe(true);
    expect(Object.is(adjustMissedShots(1, -1), 0)).toBe(true);
    expect(adjustMissedShots(MAX_UINT32, 1)).toBe(MAX_UINT32);
  });
});
