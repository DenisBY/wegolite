// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The scripted test pilot (D-11, FOUND-13). Expected values come from the pilot
 * rules of plan 08-09 and Oolite's constants (AI_THINK_INTERVAL 0.125 s,
 * reconsiderNow 0.1 to 1.6 s at 120 ticks per second), never from running the
 * pilot.
 */

import { describe, expect, it } from "vitest";

import { AI_REGISTRY } from "../../../src/sim/ai/registry.js";
import { createTestPilotAi } from "../../../src/sim/ai/pilots/test-pilot.js";
import type { AiComponent, AiContext } from "../../../src/sim/ai/types.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import { identity, vec } from "../../../src/sim/math.js";
import { createRngState, rngNext } from "../../../src/sim/rng.js";
import { createShipControl } from "../../../src/sim/world/control-impl.js";
import type { SpawnInit } from "../../../src/sim/world/entity.js";
import { createWorldView } from "../../../src/sim/world/view-impl.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import { laveFixture } from "../../helpers/lave.js";

const { layout } = laveFixture();

function playerAt(tick: number) {
  const state = initFlightState(layout);
  state.mode = "inFlight";
  state.tick = tick;
  state.position = vec(0, 0, 0);
  return state;
}

function shipInit(x: number, ai: AiComponent | null): SpawnInit {
  return {
    kind: "ship",
    specKey: "test-ship",
    scanClass: "CLASS_NEUTRAL",
    position: vec(x, 0, 0),
    orientation: identity(),
    radius: 50,
    speed: 0,
    ai,
  };
}

describe("a test pilot thinks once through the real seam (tracer)", () => {
  it("targets the nearer body and stores integer timers", () => {
    const world = createWorld(7);
    const player = playerAt(500);
    const actor = spawnEntity(
      world,
      shipInit(5000, createTestPilotAi(player.tick)),
      player.tick,
    );
    const near = spawnEntity(world, shipInit(5600, null), player.tick);
    const far = spawnEntity(world, shipInit(9000, null), player.tick);
    if (actor === undefined || near === undefined || far === undefined) {
      throw new Error("spawn refused");
    }
    // Keep the player and the static bodies out of the pilot's scan range.
    player.position = vec(1e9, 1e9, 1e9);
    if (actor.ai === null) throw new Error("no ai");

    const ctx: AiContext = {
      self: actor.id,
      view: createWorldView(world, player, layout),
      ctl: createShipControl(world, actor.id, player.tick),
      ai: actor.ai,
      random: () => {
        const state = createRngState(actor.rng.ai);
        const value = rngNext(state);
        actor.rng.ai = state.s;
        return value;
      },
    };
    AI_REGISTRY["test-pilot"].think(ctx);

    expect(actor.nav.targetId).toBe(near.id);
    // 600 m away is inside the 1000 m hold range, so the pilot holds.
    expect(actor.nav.behaviour).toBe("STOP_STILL");
    expect(actor.ai.nextThinkTick).toBe(player.tick + 15);
    expect(Number.isSafeInteger(actor.ai.wakeTick)).toBe(true);
    expect(actor.ai.wakeTick).toBeGreaterThan(player.tick);
  });
});
