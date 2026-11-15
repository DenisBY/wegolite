// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The reaction-time tracking curve against Oolite's rules (AI-01, plan 14-12;
 * `ShipEntity.m:5412-5489`, `8659-8665`). Expected values are derived by hand
 * from the cited lines and from the closed form of a quadratic through three
 * samples, never from running the implementation; the independent oracle's
 * aim-point fixture is run by `pursuit.oracle.test.ts`.
 *
 * The clock is the integer tick: the 1.5 s reaction time is 180 ticks, a sample
 * every 60.
 */

import { describe, expect, it } from "vitest";

import type { AiComponent } from "../../../src/sim/ai/types.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { identity, vec } from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";
import {
  calculateTargetPosition,
  startPendingTrackingCurves,
  startTrackingCurve,
  updateTrackingCurve,
} from "../../../src/sim/npc/tracking-curve.js";
import { DT } from "../../../src/sim/time.js";
import type { Entity, SpawnInit } from "../../../src/sim/world/entity.js";
import { sanitizeEntity } from "../../../src/sim/world/sanitize.js";
import { stepWorld } from "../../../src/sim/world/step.js";
import type { AiRegistry } from "../../../src/sim/world/step.js";
import { createWorldView } from "../../../src/sim/world/view-impl.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { laveFixture } from "../../helpers/lave.js";
import { createSyntheticView } from "./oracle-runner.js";
import type { RunnerBody } from "./oracle-runner.js";

const { layout } = laveFixture();
const TARGET_ID = 102;
const FAR_TICK = 1_000_000_000;

function ship(): Entity {
  const result = spawnEntity(
    createWorld(1),
    {
      kind: "ship",
      specKey: "t",
      scanClass: "CLASS_NEUTRAL",
      position: vec(0, 0, 0),
      orientation: identity(),
      radius: 10,
    },
    0,
  );
  if (!result.ok) throw new Error("spawn refused");
  return result.entity;
}

function target(position: Vec3): RunnerBody {
  return {
    id: TARGET_ID,
    kind: "ship",
    scanClass: "CLASS_NEUTRAL",
    radius: 50,
    mass: 0,
    position,
    orientation: identity(),
    speed: 0,
    behaviour: "IDLE",
    targetId: 0,
  };
}

function chaser(position: Vec3): {
  entity: Entity;
  body: RunnerBody;
  viewAt: (tick: number) => ReturnType<typeof createSyntheticView>;
} {
  const entity = ship();
  entity.nav.targetId = TARGET_ID;
  const body = target(position);
  return {
    entity,
    body,
    viewAt: (tick) => createSyntheticView([body], entity, tick),
  };
}

describe("startTrackingCurve (ShipEntity.m:5425-5442)", () => {
  it("writes four copies of the target position with the ticks now, now - 60, now - 120, now - 180", () => {
    const { entity, viewAt } = chaser(vec(100, 20, -1000));
    startTrackingCurve(entity, viewAt(300), 300);
    expect(entity.steer.trackingCount).toBe(4);
    expect(entity.steer.trackingTicks).toEqual([300, 240, 180, 120]);
    for (const p of entity.steer.trackingPositions) {
      expect(p).toEqual(vec(100, 20, -1000));
    }
    // four separate copies, not one shared object
    expect(entity.steer.trackingPositions[0]).not.toBe(
      entity.steer.trackingPositions[1],
    );
  });

  it("a start before tick 180 stores negative ticks, strictly decreasing, and repairs nothing", () => {
    const { entity, viewAt } = chaser(vec(0, 0, -500));
    startTrackingCurve(entity, viewAt(10), 10);
    expect(entity.steer.trackingTicks).toEqual([10, -50, -110, -170]);
    expect(sanitizeEntity(entity)).toBe(false);
    expect(entity.repairs).toBe(0);
    expect(entity.steer.trackingCount).toBe(4);
  });

  it("does nothing for a ship with no valid target", () => {
    const { entity, viewAt } = chaser(vec(0, 0, -500));
    entity.nav.targetId = 0;
    startTrackingCurve(entity, viewAt(10), 10);
    expect(entity.steer.trackingCount).toBe(0);
    entity.nav.targetId = entity.id; // addTarget: ignores the ship itself
    startTrackingCurve(entity, viewAt(10), 10);
    expect(entity.steer.trackingCount).toBe(0);
    entity.nav.targetId = 777;
    startTrackingCurve(entity, viewAt(10), 10);
    expect(entity.steer.trackingCount).toBe(0);
  });
});

describe("updateTrackingCurve (ShipEntity.m:5444-5470)", () => {
  it("samples at the first tick at least 60 after the previous sample, never at 59", () => {
    const { entity, body, viewAt } = chaser(vec(0, 0, -1000));
    startTrackingCurve(entity, viewAt(0), 0);
    body.position = vec(5, 0, -1000);
    updateTrackingCurve(entity, viewAt(59), 59);
    expect(entity.steer.trackingTicks).toEqual([0, -60, -120, -180]);
    updateTrackingCurve(entity, viewAt(60), 60);
    expect(entity.steer.trackingTicks).toEqual([60, 0, -60, -120]);
    expect(entity.steer.trackingPositions[0]).toEqual(vec(5, 0, -1000));
    expect(entity.steer.trackingPositions[1]).toEqual(vec(0, 0, -1000));
  });

  it("shifts the samples and waits another 60 ticks (119 no, 120 yes)", () => {
    const { entity, body, viewAt } = chaser(vec(0, 0, -1000));
    startTrackingCurve(entity, viewAt(0), 0);
    body.position = vec(1, 0, -1000);
    updateTrackingCurve(entity, viewAt(60), 60);
    body.position = vec(2, 0, -1000);
    updateTrackingCurve(entity, viewAt(119), 119);
    expect(entity.steer.trackingTicks).toEqual([60, 0, -60, -120]);
    updateTrackingCurve(entity, viewAt(120), 120);
    expect(entity.steer.trackingTicks).toEqual([120, 60, 0, -60]);
    expect(entity.steer.trackingPositions.map((p) => p.x)).toEqual([
      2, 1, 0, 0,
    ]);
  });

  it("does nothing with no valid target or no started curve", () => {
    const { entity, viewAt } = chaser(vec(0, 0, -1000));
    updateTrackingCurve(entity, viewAt(500), 500);
    expect(entity.steer.trackingCount).toBe(0);
    startTrackingCurve(entity, viewAt(0), 0);
    entity.nav.targetId = 777;
    updateTrackingCurve(entity, viewAt(500), 500);
    expect(entity.steer.trackingTicks).toEqual([0, -60, -120, -180]);
  });
});

describe("calculateTargetPosition (ShipEntity.m:5412-5423, 5471-5487)", () => {
  /**
   * A curve started by hand on x = 2 s^2, y = 10 s, z = -1000 (s in seconds):
   * the samples 1 to 3 are at ticks 120, 60 and 0 (s = 1, 0.5, 0), sample 0 at
   * tick 180 (s = 1.5). Three points fix a quadratic, so the fit is exact.
   */
  function fitted(): {
    entity: Entity;
    viewAt: (tick: number) => ReturnType<typeof createSyntheticView>;
  } {
    const { entity, viewAt } = chaser(vec(99, 99, -1000)); // the live target is elsewhere
    entity.steer.trackingCount = 4;
    entity.steer.trackingTicks = [180, 120, 60, 0];
    entity.steer.trackingPositions = [
      vec(4.5, 15, -1000),
      vec(2, 10, -1000),
      vec(0.5, 5, -1000),
      vec(0, 0, -1000),
    ];
    return { entity, viewAt };
  }

  it("evaluates the quadratic through samples 1 to 3, not the live target position", () => {
    const { entity, viewAt } = fitted();
    // now 180: t = (180 - 120) / 120 = 0.5 s after sample 1: s = 1.5.
    const at180 = calculateTargetPosition(entity, viewAt(180), 180);
    expect(at180.x).toBeCloseTo(2 * 1.5 * 1.5, 12);
    expect(at180.y).toBeCloseTo(15, 12);
    expect(at180.z).toBeCloseTo(-1000, 12);
    // now 240: s = 2 -> x = 8, y = 20.
    const at240 = calculateTargetPosition(entity, viewAt(240), 240);
    expect(at240.x).toBeCloseTo(8, 12);
    expect(at240.y).toBeCloseTo(20, 12);
  });

  it("is anchored at ticks[1]: at now = ticks[1] it returns the sample 1", () => {
    const { entity, viewAt } = fitted();
    const at = calculateTargetPosition(entity, viewAt(120), 120);
    expect(at).toEqual(vec(2, 10, -1000));
  });

  it("is the zero vector for no valid target", () => {
    const { entity, viewAt } = fitted();
    entity.nav.targetId = 0;
    expect(calculateTargetPosition(entity, viewAt(180), 180)).toEqual(
      vec(0, 0, 0),
    );
    entity.nav.targetId = entity.id;
    expect(calculateTargetPosition(entity, viewAt(180), 180)).toEqual(
      vec(0, 0, 0),
    );
  });

  it("is the target's own position before the curve is started", () => {
    const { entity, viewAt } = chaser(vec(7, 8, -9));
    expect(calculateTargetPosition(entity, viewAt(1), 1)).toEqual(
      vec(7, 8, -9),
    );
  });

  it("is finite for the smallest legal spacing of the signed ticks", () => {
    const { entity, viewAt } = chaser(vec(1e6, -1e6, 1e6));
    entity.steer.trackingCount = 4;
    entity.steer.trackingTicks = [3, 2, 1, 0]; // spacings of one tick
    entity.steer.trackingPositions = [
      vec(1, 0, 0),
      vec(2, 0, 0),
      vec(3, 0, 0),
      vec(4, 0, 0),
    ];
    const at = calculateTargetPosition(entity, viewAt(3), 3);
    expect(Number.isFinite(at.x + at.y + at.z)).toBe(true);
  });
});

describe("startPendingTrackingCurves", () => {
  function playerAt(tick: number): FlightState {
    const state = initFlightState(layout);
    state.mode = "inFlight";
    state.tick = tick;
    state.position = vec(1e9, 1e9, 1e9);
    return state;
  }

  function init(position: Vec3, ai: AiComponent | null): SpawnInit {
    return {
      kind: "ship",
      specKey: "t",
      scanClass: "CLASS_NEUTRAL",
      position,
      orientation: identity(),
      radius: 50,
      speed: 0,
      ai,
    };
  }

  function aiAt(nextThinkTick: number): AiComponent {
    return {
      aiKey: "test-pilot",
      params: Object.create(null) as AiComponent["params"],
      wakeTick: 0,
      nextThinkTick,
    };
  }

  function spawnOk(world: World, spawn: SpawnInit): Entity {
    const result = spawnEntity(world, spawn, 0);
    if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
    return result.entity;
  }

  it("starts a pending curve of a steered ship with a target and leaves the rest alone", () => {
    const world = createWorld(5);
    const player = playerAt(40);
    const victim = spawnOk(world, init(vec(0, 0, -800), null));
    const pending = spawnOk(world, init(vec(0, 0, 0), aiAt(FAR_TICK)));
    const noTarget = spawnOk(world, init(vec(0, 0, 0), aiAt(FAR_TICK)));
    const inert = spawnOk(world, init(vec(0, 0, 0), null));
    const started = spawnOk(world, init(vec(0, 0, 0), aiAt(FAR_TICK)));
    pending.nav.targetId = victim.id;
    inert.nav.targetId = victim.id;
    started.nav.targetId = victim.id;
    started.steer.trackingCount = 4;
    started.steer.trackingTicks = [9, 8, 7, 6];
    const view = createWorldView(world, player, layout);
    let views = 0;
    startPendingTrackingCurves(
      world,
      () => {
        views += 1;
        return view;
      },
      40,
    );
    expect(pending.steer.trackingTicks).toEqual([40, -20, -80, -140]);
    expect(pending.steer.trackingPositions[3]).toEqual(vec(0, 0, -800));
    expect(noTarget.steer.trackingCount).toBe(0);
    expect(inert.steer.trackingCount).toBe(0);
    expect(started.steer.trackingTicks).toEqual([9, 8, 7, 6]);
    expect(views).toBeGreaterThan(0);
  });

  it("builds no view when nothing is pending", () => {
    const world = createWorld(5);
    spawnOk(world, init(vec(0, 0, 0), aiAt(FAR_TICK)));
    startPendingTrackingCurves(
      world,
      () => {
        throw new Error("no view expected");
      },
      3,
    );
  });

  describe("through stepWorld (the think phase, then the samples)", () => {
    /** A pilot that points its ship at `targetId` once, at its own think tick. */
    function setup(targetOf: (world: World) => number): {
      world: World;
      player: FlightState;
      shooter: Entity;
      victim: Entity;
      registry: AiRegistry;
    } {
      const world = createWorld(5);
      const player = playerAt(0);
      // The victim flies at 50 m/s along its forward -Z, so it moves every tick.
      const victim = spawnOk(world, init(vec(0, 0, -5000), aiAt(FAR_TICK)));
      victim.nav.behaviour = "IDLE";
      victim.speed = 50;
      victim.nav.desiredSpeed = 50;
      const shooter = spawnOk(world, init(vec(0, 0, 0), aiAt(5)));
      const registry: AiRegistry = {
        "test-pilot": {
          think: (ctx) => {
            if (ctx.self === shooter.id) {
              ctx.ctl.setTarget(ctx.self, targetOf(world));
              ctx.ai.nextThinkTick = FAR_TICK;
            }
          },
        },
      };
      return { world, player, shooter, victim, registry };
    }

    function run(
      world: World,
      player: FlightState,
      ticks: number,
      registry: AiRegistry,
    ): void {
      for (let i = 0; i < ticks; i += 1) {
        player.tick += 1;
        stepWorld(world, player, layout, DT, registry);
      }
    }

    it("starts the curve at the think tick with the target's positions of that tick", () => {
      const s = setup(() => 101); // the victim is the first spawn: id 101
      run(s.world, s.player, 5, s.registry);
      expect(s.shooter.nav.targetId).toBe(s.victim.id);
      expect(s.shooter.steer.trackingTicks).toEqual([5, -55, -115, -175]);
      for (const p of s.shooter.steer.trackingPositions) {
        expect(p).toEqual(s.victim.position);
      }
      expect(sanitizeEntity(s.shooter)).toBe(false);
      expect(s.shooter.repairs).toBe(0);
    });

    it("takes the next samples at 65 and 125, never at 64 or 66", () => {
      const s = setup(() => 101);
      run(s.world, s.player, 5, s.registry);
      const first = s.victim.position.z;
      run(s.world, s.player, 59, s.registry); // tick 64
      expect(s.shooter.steer.trackingTicks).toEqual([5, -55, -115, -175]);
      run(s.world, s.player, 1, s.registry); // tick 65
      expect(s.shooter.steer.trackingTicks).toEqual([65, 5, -55, -115]);
      expect(s.shooter.steer.trackingPositions[0]).toEqual(s.victim.position);
      expect(s.shooter.steer.trackingPositions[1].z).toBe(first);
      expect(s.victim.position.z).toBeLessThan(first);
      run(s.world, s.player, 60, s.registry); // tick 125
      expect(s.shooter.steer.trackingTicks).toEqual([125, 65, 5, -55]);
    });

    it("a think that targets the ship itself changes nothing", () => {
      const s = setup(() => 102); // the shooter's own id
      run(s.world, s.player, 5, s.registry);
      expect(s.shooter.nav.targetId).toBe(0);
      expect(s.shooter.steer.trackingCount).toBe(0);
    });
  });
});
