// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * DOCK-10 through `stepSim`: docking restores the ship, launching resets the
 * weapons.
 *
 * Expected values are the rules of `PlayerEntity.m:6321-6325` (dock) and
 * `:6439-6448` (launch): both shields and the energy banks refill, the four
 * laser temperatures and the cabin go to their floors, the weapon facing
 * returns to fore, and nothing cools or recharges while docked (F6), so the
 * restored values and the shot timers hold from the docked tick on.
 */

import { describe, expect, it } from "vitest";

import {
  BASELINE_SHIELD_LEVEL,
  COBRA_MAX_ENERGY,
  SHIP_MIN_CABIN_TEMP,
} from "../../../src/sim/combat/constants.js";
import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import { routeDamage } from "../../../src/sim/combat/shields.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import type { PlayerCombatState } from "../../../src/sim/combat/state.js";
import { DOCK_COMPUTER_KEY } from "../../../src/sim/dock/computer.js";
import type { SimEvent } from "../../../src/sim/events.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import type { ControlIntent } from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import { rotate, vec } from "../../../src/sim/math.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT } from "../../../src/sim/time.js";
import { NO_ENTITY } from "../../../src/sim/world/ids.js";
import { laveFixture } from "../../helpers/lave.js";

const { layout, config } = laveFixture();

const OPTIONS: StepOptions = {
  equipment: new Set([DOCK_COMPUTER_KEY]),
  combat: { mounts: DEFAULT_LASER_MOUNTS },
};

function step(
  player: FlightState,
  combat: PlayerCombatState,
  commands: Parameters<typeof stepSim>[5] = [],
  intent: ControlIntent = ZERO_INTENT,
): SimEvent[] {
  return stepSim(
    player,
    undefined,
    layout,
    config,
    intent,
    commands,
    DT,
    OPTIONS,
    combat,
  );
}

/** Launch, skip the launch, and fly 600 idle steps toward the station's aegis. */
function flyAfterLaunch(player: FlightState, combat: PlayerCombatState): void {
  step(player, combat, [{ kind: "launch" }]);
  step(player, combat, [{ kind: "skipLaunch" }]);
  for (let tick = 0; tick < 600; tick += 1) step(player, combat);
  expect(player.mode).toBe("inFlight");
}

describe("docking restores the ship (DOCK-10)", () => {
  it("refills shields and energy and resets temperatures, cabin and view from the docked tick on", () => {
    const player = initFlightState(layout);
    const combat = createPlayerCombatState();
    flyAfterLaunch(player, combat);

    // Damage through the real routing: 300 forward, 100 aft.
    const forward = rotate(player.orientation, vec(0, 0, -1));
    routeDamage(combat, 300, forward, forward);
    routeDamage(combat, 100, vec(-forward.x, -forward.y, -forward.z), forward);
    // A shot in a tick of its own (heat, timer), then a view change.
    step(player, combat, [{ kind: "setView" as const, view: "aft" }]);
    step(player, combat, [{ kind: "setView" as const, view: "fore" }], {
      ...ZERO_INTENT,
      fire: true,
    });
    combat.laserTemp.aft = 50;
    combat.view = "aft";

    expect(combat.fwdShield).toBeLessThan(BASELINE_SHIELD_LEVEL);
    expect(combat.aftShield).toBeLessThan(BASELINE_SHIELD_LEVEL);
    expect(combat.energy).toBeLessThan(COBRA_MAX_ENERGY);
    expect(combat.cabinTemp).toBeGreaterThan(SHIP_MIN_CABIN_TEMP);
    expect(combat.laserTemp.fore).toBeGreaterThan(0);
    const timers = { ...combat.shotTicks };
    expect(timers.fore).toBeLessThan(10);

    const events = step(player, combat, [{ kind: "dockingComputer" }]);

    expect(events.some((event) => event.kind === "docked")).toBe(true);
    expect(player.mode).toBe("docked");
    const restored = {
      fwdShield: BASELINE_SHIELD_LEVEL,
      aftShield: BASELINE_SHIELD_LEVEL,
      energy: COBRA_MAX_ENERGY,
      cabinTemp: SHIP_MIN_CABIN_TEMP,
    };
    // From the docked tick and for every tick after it, as nothing cools or
    // recharges docked.
    for (let tick = 0; tick < 30; tick += 1) {
      expect(combat).toMatchObject(restored);
      expect(combat.laserTemp).toEqual({
        fore: 0,
        aft: 0,
        port: 0,
        starboard: 0,
      });
      expect(combat.view).toBe("fore");
      expect(combat.identEngaged).toBe(false);
      expect(combat.identTarget).toBe(NO_ENTITY);
      // Shot timers are not reset by the dock (Oolite advances them in
      // bookkeeping only, which is skipped docked).
      expect(combat.shotTicks).toEqual(timers);
      step(player, combat);
    }
  });
});

describe("launching resets the weapons", () => {
  it("returns the view to fore, zeroes the temperatures and refills the shields", () => {
    const player = initFlightState(layout);
    const combat = createPlayerCombatState();
    combat.view = "aft";
    combat.fwdShield = 40;
    combat.aftShield = 10;
    combat.laserTemp.fore = 50;
    combat.laserTemp.starboard = 20;
    combat.energy = 100;

    const events = step(player, combat, [{ kind: "launch" }]);

    expect(events.some((event) => event.kind === "launched")).toBe(true);
    expect(player.mode).toBe("launching");
    expect(combat.view).toBe("fore");
    expect(combat.laserTemp).toEqual({
      fore: 0,
      aft: 0,
      port: 0,
      starboard: 0,
    });
    expect(combat.fwdShield).toBe(BASELINE_SHIELD_LEVEL);
    expect(combat.aftShield).toBe(BASELINE_SHIELD_LEVEL);
    // The launch routine does not refill the energy banks (only a dock does):
    // bookkeeping may add one tick of recharge, no more.
    expect(combat.energy).toBeGreaterThanOrEqual(100);
    expect(combat.energy).toBeLessThan(100 + 4 * DT + 1e-9);
  });
});
