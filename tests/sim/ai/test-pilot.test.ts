// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The scripted test pilot (D-11, FOUND-13). Expected values come from the pilot
 * rules of plan 08-09 and Oolite's constants (AI_THINK_INTERVAL 0.125 s,
 * reconsiderNow 0.1 to 1.6 s at 120 ticks per second), never from running the
 * pilot.
 */

import { describe, expect, it } from "vitest";

import {
  createTestPilotAi,
  TEST_PILOT,
  TEST_PILOT_SCAN_KINDS,
} from "../../../src/sim/ai/pilots/test-pilot.js";
import { AI_REGISTRY } from "../../../src/sim/ai/registry.js";
import { ticks } from "../../../src/sim/ai/time.js";
import type { AiComponent, AiContext } from "../../../src/sim/ai/types.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import { identity, vec } from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";
import { createRngState, rngNext } from "../../../src/sim/rng.js";
import { createShipControl } from "../../../src/sim/world/control-impl.js";
import type { ShipControl } from "../../../src/sim/world/control.js";
import type { Entity, SpawnInit } from "../../../src/sim/world/entity.js";
import type { EntityId } from "../../../src/sim/world/ids.js";
import { BODY_KINDS } from "../../../src/sim/world/ids.js";
import type {
  BodyView,
  ScanFilter,
  ShipView,
  WorldView,
} from "../../../src/sim/world/view.js";
import { createWorldView } from "../../../src/sim/world/view-impl.js";
import {
  commitWorld,
  createWorld,
  killEntity,
  spawnEntity,
} from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
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

function spawnOk(world: World, init: SpawnInit, tick: number): Entity {
  const result = spawnEntity(world, init, tick);
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return result.entity;
}

describe("a test pilot thinks once through the real seam (tracer)", () => {
  it("targets the nearer body and stores integer timers", () => {
    const world = createWorld(7);
    const player = playerAt(500);
    const actor = spawnOk(
      world,
      shipInit(5000, createTestPilotAi(player.tick)),
      player.tick,
    );
    const near = spawnOk(world, shipInit(5600, null), player.tick);
    spawnOk(world, shipInit(9000, null), player.tick);
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

describe("debris is never a test pilot's target (D16-03, Pitfall 2)", () => {
  it("lists every body kind except cargo and wreckage", () => {
    expect([...TEST_PILOT_SCAN_KINDS].sort()).toEqual(
      BODY_KINDS.filter((k) => k !== "cargo" && k !== "wreckage").sort(),
    );
    expect(Object.isFrozen(TEST_PILOT_SCAN_KINDS)).toBe(true);
  });

  it("picks the ship beyond a field of 200 pods and wrecks", () => {
    const world = createWorld(16);
    const player = playerAt(500);
    const actor = spawnOk(
      world,
      shipInit(5000, createTestPilotAi(player.tick)),
      player.tick,
    );
    const ship = spawnOk(world, shipInit(9000, null), player.tick);
    // 200 debris pieces between 20 and 220 m around the pilot, all nearer than
    // the ship 4000 m away.
    for (let i = 0; i < 200; i += 1) {
      const wreck = i % 4 === 0;
      spawnOk(
        world,
        {
          kind: wreck ? "wreckage" : "cargo",
          specKey: wreck ? "wreckage-component" : "barrel",
          scanClass: wreck ? "CLASS_NO_DRAW" : "CLASS_CARGO",
          position: vec(5000 + 20 + i, (i % 7) - 3, (i % 5) - 2),
          orientation: identity(),
          radius: 5,
          speed: 0,
          ai: null,
          maxEnergy: 1,
          energyRechargeRate: 0,
        },
        player.tick,
      );
    }
    player.position = vec(1e9, 1e9, 1e9);
    if (actor.ai === null) throw new Error("no ai");
    const view = createWorldView(world, player, layout);
    // An unfiltered scan would have reported a piece first.
    const nearest = view.scan(actor.id, 25_600)[0];
    expect(
      nearest === undefined ? undefined : view.body(nearest)?.kind,
    ).not.toBe("ship");

    const ctx: AiContext = {
      self: actor.id,
      view,
      ctl: createShipControl(world, actor.id, player.tick),
      ai: actor.ai,
      random: () => 0,
    };
    AI_REGISTRY["test-pilot"].think(ctx);

    expect(actor.nav.targetId).toBe(ship.id);
    expect(actor.ai.params.targetId).toBe(ship.id);
    expect(actor.nav.behaviour).toBe("FLY_TO_DESTINATION");
  });
});

// ---------------------------------------------------------------------------
// A pure function over a fake view and a recording control.
// ---------------------------------------------------------------------------

type Call = readonly [string, ...unknown[]];

const SELF: EntityId = 101;
const FAR_ID: EntityId = 201;
const NEAR_ID: EntityId = 202;

interface FakeSpec {
  tick: number;
  own: Vec3 | undefined;
  /** Positions of the bodies the fake knows, by id. */
  bodies: Map<EntityId, Vec3>;
  /** What scan answers, nearest first. */
  scan: EntityId[];
  /** Ids isValid answers true for. */
  valid: Set<EntityId>;
  /** The nav target the pilot's own ship reports (`ShipView.targetId`). */
  ownTarget: EntityId;
  /** Every scan call, as [self, range, filter]. */
  scans: [EntityId, number, ScanFilter | undefined][];
}

function newSpec(overrides: Partial<FakeSpec> = {}): FakeSpec {
  return {
    tick: 1000,
    own: vec(0, 0, 0),
    bodies: new Map([
      [FAR_ID, vec(5000, 0, 0)],
      [NEAR_ID, vec(3000, 0, 0)],
    ]),
    scan: [NEAR_ID, FAR_ID],
    valid: new Set([FAR_ID, NEAR_ID]),
    ownTarget: 0,
    scans: [],
    ...overrides,
  };
}

function bodyView(id: EntityId, position: Vec3): BodyView {
  return Object.freeze({
    id,
    kind: "ship",
    scanClass: "CLASS_NEUTRAL",
    position: Object.freeze(position),
    orientation: Object.freeze(identity()),
    speed: 0,
    radius: 0,
  });
}

/** A hand-built WorldView; every returned object is frozen. */
function fakeView(spec: FakeSpec): WorldView {
  return {
    get tick() {
      return spec.tick;
    },
    playerId: 100,
    isValid: (id) => spec.valid.has(id),
    body: (id) => {
      const position = spec.bodies.get(id);
      return position === undefined ? undefined : bodyView(id, position);
    },
    ship: (id): ShipView | undefined => {
      if (id !== SELF || spec.own === undefined) return undefined;
      return Object.freeze({
        ...bodyView(SELF, spec.own),
        behaviour: "IDLE",
        targetId: spec.ownTarget,
        destination: Object.freeze(vec(0, 0, 0)),
        desiredRange: 0,
        desiredSpeed: 0,
      });
    },
    scan: (self, range, filter) => {
      spec.scans.push([self, range, filter]);
      return [...spec.scan];
    },
    mainStation: () => 3,
    mainPlanet: () => 1,
    sun: () => 2,
  };
}

/** A ShipControl that records `[method, ...args]` and does nothing else. */
function recordingControl(calls: Call[]): ShipControl {
  return {
    setTarget: (...args) => void calls.push(["setTarget", ...args]),
    setDestination: (...args) => void calls.push(["setDestination", ...args]),
    setDesiredRange: (...args) => void calls.push(["setDesiredRange", ...args]),
    setDesiredSpeed: (...args) => void calls.push(["setDesiredSpeed", ...args]),
    perform: (...args) => void calls.push(["perform", ...args]),
    scheduleWake: (...args) => void calls.push(["scheduleWake", ...args]),
    fire: (...args) => void calls.push(["fire", ...args]),
  };
}

function thinkOnce(
  spec: FakeSpec,
  ai: AiComponent,
  random: () => number,
): Call[] {
  const calls: Call[] = [];
  AI_REGISTRY["test-pilot"].think({
    self: SELF,
    view: fakeView(spec),
    ctl: recordingControl(calls),
    ai,
    random,
  });
  return calls;
}

describe("seek", () => {
  it("flies to the first scan hit with exactly the documented calls", () => {
    const spec = newSpec();
    const ai = createTestPilotAi(spec.tick);
    const calls = thinkOnce(spec, ai, () => 0);

    // The scan names its kinds (D16-03, Pitfall 2): cargo and wreckage are left
    // out so debris never becomes a target.
    expect(spec.scans).toEqual([
      [SELF, 25_600, { kinds: TEST_PILOT_SCAN_KINDS }],
    ]);
    expect(calls).toEqual([
      ["setTarget", SELF, NEAR_ID],
      ["setDestination", SELF, vec(3000, 0, 0)],
      ["setDesiredRange", SELF, 1000],
      ["setDesiredSpeed", SELF, 100],
      ["perform", SELF, "FLY_TO_DESTINATION"],
      ["scheduleWake", SELF, 12],
    ]);
    expect(ai.params.phase).toBe("seek");
    expect(ai.params.targetId).toBe(NEAR_ID);
    expect(ai.nextThinkTick).toBe(1000 + 15);
  });

  it("holds when the target is inside holdRange and still flies when it is not", () => {
    const hold = (distance: number): { calls: Call[]; ai: AiComponent } => {
      const spec = newSpec({
        bodies: new Map([[NEAR_ID, vec(distance, 0, 0)]]),
        scan: [NEAR_ID],
      });
      const ai = createTestPilotAi(spec.tick);
      return { calls: thinkOnce(spec, ai, () => 0), ai };
    };

    const inside = hold(800);
    expect(inside.calls).toEqual([
      ["setTarget", SELF, NEAR_ID],
      ["setDestination", SELF, vec(800, 0, 0)],
      ["setDesiredRange", SELF, 1000],
      ["setDesiredSpeed", SELF, 100],
      ["perform", SELF, "FLY_TO_DESTINATION"],
      ["setDesiredSpeed", SELF, 0],
      ["perform", SELF, "STOP_STILL"],
      ["scheduleWake", SELF, 12],
    ]);
    expect(inside.ai.params.phase).toBe("hold");

    // Exactly at holdRange counts as inside; a hair outside does not.
    expect(hold(1000).ai.params.phase).toBe("hold");
    expect(hold(1000.5).ai.params.phase).toBe("seek");
  });

  it("performs IDLE at speed 0 when the scan is empty", () => {
    const spec = newSpec({ scan: [] });
    const ai = createTestPilotAi(spec.tick);
    expect(thinkOnce(spec, ai, () => 0)).toEqual([
      ["setDesiredSpeed", SELF, 0],
      ["perform", SELF, "IDLE"],
      ["scheduleWake", SELF, 12],
    ]);
    expect(ai.params.phase).toBe("seek");
  });

  it("performs IDLE when the view cannot resolve its own ship or the target", () => {
    const idle: Call[] = [
      ["setDesiredSpeed", SELF, 0],
      ["perform", SELF, "IDLE"],
      ["scheduleWake", SELF, 12],
    ];
    const noOwn = newSpec({ own: undefined });
    expect(thinkOnce(noOwn, createTestPilotAi(noOwn.tick), () => 0)).toEqual(
      idle,
    );
    const noBody = newSpec({ bodies: new Map() });
    expect(thinkOnce(noBody, createTestPilotAi(noBody.tick), () => 0)).toEqual(
      idle,
    );
  });

  it("uses the parameter defaults when the params are missing or not numbers", () => {
    const spec = newSpec({ scan: [] });
    const ai: AiComponent = {
      aiKey: "test-pilot",
      params: { scanRange: "far", phase: 7 },
      wakeTick: 0,
      nextThinkTick: 0,
    };
    thinkOnce(spec, ai, () => 0);
    expect(spec.scans).toEqual([
      [SELF, 25_600, { kinds: TEST_PILOT_SCAN_KINDS }],
    ]);
  });

  it("takes scanRange, holdRange and cruiseSpeed from the options", () => {
    const ai = createTestPilotAi(5, {
      scanRange: 700,
      holdRange: 50,
      cruiseSpeed: 9,
    });
    expect(ai).toEqual({
      aiKey: "test-pilot",
      params: {
        phase: "seek",
        targetId: 0,
        scanRange: 700,
        holdRange: 50,
        cruiseSpeed: 9,
      },
      wakeTick: 0,
      nextThinkTick: 5,
    });
    const spec = newSpec();
    const calls = thinkOnce(spec, ai, () => 0);
    expect(spec.scans).toEqual([[SELF, 700, { kinds: TEST_PILOT_SCAN_KINDS }]]);
    expect(calls).toContainEqual(["setDesiredRange", SELF, 50]);
    expect(calls).toContainEqual(["setDesiredSpeed", SELF, 9]);
  });
});

describe("hold", () => {
  function holding(targetId: EntityId): AiComponent {
    const ai = createTestPilotAi(1000);
    ai.params.phase = "hold";
    ai.params.targetId = targetId;
    return ai;
  }

  it("keeps speed 0 while the target is valid", () => {
    const spec = newSpec();
    const ai = holding(NEAR_ID);
    expect(thinkOnce(spec, ai, () => 0)).toEqual([
      ["setDesiredSpeed", SELF, 0],
      ["scheduleWake", SELF, 12],
    ]);
    expect(ai.params.phase).toBe("hold");
    expect(ai.params.targetId).toBe(NEAR_ID);
  });

  it("returns to seek when the target is no longer valid", () => {
    const spec = newSpec({ valid: new Set() });
    const ai = holding(NEAR_ID);
    expect(thinkOnce(spec, ai, () => 0)).toEqual([
      ["setTarget", SELF, 0],
      ["scheduleWake", SELF, 12],
    ]);
    expect(ai.params.phase).toBe("seek");
    expect(ai.params.targetId).toBe(0);
  });

  it("per-world target: an id the view never issued sends the pilot back to seek", () => {
    // The view of a fresh world knows nothing of 101: a pilot whose AiComponent
    // were placed in another world cannot act on a stale id (CONTEXT D-06 as
    // amended 2026-11-12).
    const spec = newSpec({ valid: new Set([SELF]) });
    const ai = holding(101);
    const calls = thinkOnce(spec, ai, () => 0);
    expect(ai.params.phase).toBe("hold");
    expect(calls[0]).toEqual(["setDesiredSpeed", SELF, 0]);

    const fresh = newSpec({ valid: new Set() });
    const stale = holding(101);
    thinkOnce(fresh, stale, () => 0);
    expect(stale.params.phase).toBe("seek");
    expect(stale.params.targetId).toBe(0);
  });
});

describe("fire mode (CBT-07)", () => {
  function holdingWith(
    options: Parameters<typeof createTestPilotAi>[1],
    targetId: EntityId,
  ): AiComponent {
    const ai = createTestPilotAi(1000, options);
    ai.params.phase = "hold";
    ai.params.targetId = targetId;
    return ai;
  }

  it("sets its nav target once, then asks on a one-tick wake and fires, on a think in the hold phase while the target is valid (D-08, D-09)", () => {
    const spec = newSpec();
    const ai = holdingWith({ fire: true }, NEAR_ID);
    // The ship holds no nav target yet (the spawn sets only the param): the
    // gate's target is set once, then the ask, then the think's own wake.
    expect(thinkOnce(spec, ai, () => 0)).toEqual([
      ["setDesiredSpeed", SELF, 0],
      ["setTarget", SELF, NEAR_ID],
      ["scheduleWake", SELF, 1],
      ["fire", SELF],
      ["scheduleWake", SELF, 12],
    ]);
    expect(ai.params.fire).toBe(true);
  });

  it("never calls setTarget while the nav target already holds (setTarget restarts the tracking curve)", () => {
    const spec = newSpec({ ownTarget: NEAR_ID });
    const ai = holdingWith({ fire: true }, NEAR_ID);
    expect(thinkOnce(spec, ai, () => 0)).toEqual([
      ["setDesiredSpeed", SELF, 0],
      ["scheduleWake", SELF, 1],
      ["fire", SELF],
      ["scheduleWake", SELF, 12],
    ]);
  });

  it("asks on every think while it holds, once each, with the wake one tick away", () => {
    const spec = newSpec({ ownTarget: NEAR_ID });
    const ai = holdingWith({ fire: true }, NEAR_ID);
    for (let i = 0; i < 5; i += 1) {
      const calls = thinkOnce(spec, ai, () => 0);
      expect(calls.filter(([name]) => name === "fire")).toEqual([
        ["fire", SELF],
      ]);
      expect(calls.filter(([name]) => name === "setTarget")).toEqual([]);
      expect(calls.filter(([name]) => name === "scheduleWake")[0]).toEqual([
        "scheduleWake",
        SELF,
        1,
      ]);
    }
  });

  it("without fire the hold call list is unchanged: no target, no wake of one tick", () => {
    const spec = newSpec();
    const ai = holdingWith({}, NEAR_ID);
    expect(thinkOnce(spec, ai, () => 0)).toEqual([
      ["setDesiredSpeed", SELF, 0],
      ["scheduleWake", SELF, 12],
    ]);
  });

  it("does not fire when the target is no longer valid", () => {
    const spec = newSpec({ valid: new Set() });
    const ai = holdingWith({ fire: true }, NEAR_ID);
    const calls = thinkOnce(spec, ai, () => 0);
    expect(calls.some(([name]) => name === "fire")).toBe(false);
    expect(ai.params.phase).toBe("seek");
  });

  it("does not fire while it is still seeking", () => {
    const spec = newSpec();
    const ai = createTestPilotAi(spec.tick, { fire: true });
    const calls = thinkOnce(spec, ai, () => 0);
    expect(calls.some(([name]) => name === "fire")).toBe(false);
  });

  it("never fires without the option, and keeps the param set it had before", () => {
    const spec = newSpec();
    expect(createTestPilotAi(1000).params).toEqual({
      phase: "seek",
      targetId: 0,
      scanRange: 25_600,
      holdRange: 1_000,
      cruiseSpeed: 100,
    });
    expect(createTestPilotAi(1000, { fire: false }).params).not.toHaveProperty(
      "fire",
    );
    const ai = holdingWith({}, NEAR_ID);
    for (let i = 0; i < 3; i += 1) {
      const calls = thinkOnce(spec, ai, () => 0);
      expect(calls.some(([name]) => name === "fire")).toBe(false);
    }
  });
});

describe("randomness and the wake", () => {
  it("schedules a wake of ticks(0.1) for a draw of 0 and ticks(0.1 + 0.999 * 1.5) for 0.999", () => {
    const wakeFor = (draw: number): unknown => {
      const spec = newSpec({ scan: [] });
      const calls = thinkOnce(spec, createTestPilotAi(spec.tick), () => draw);
      return calls.find((call) => call[0] === "scheduleWake")?.[2];
    };
    expect(wakeFor(0)).toBe(ticks(0.1));
    expect(wakeFor(0)).toBe(12);
    expect(wakeFor(0.999)).toBe(ticks(0.1 + 0.999 * 1.5));
    expect(wakeFor(0.999)).toBe(192);
  });

  it("draws exactly once per think", () => {
    let draws = 0;
    const random = (): number => {
      draws += 1;
      return 0.5;
    };
    for (const spec of [
      newSpec(),
      newSpec({ scan: [] }),
      newSpec({ own: undefined }),
    ]) {
      draws = 0;
      thinkOnce(spec, createTestPilotAi(spec.tick), random);
      expect(draws).toBe(1);
    }
  });

  it("thinks on an early wake tick and re-arms both integer timers", () => {
    const world = createWorld(7);
    const player = playerAt(100);
    const actor = spawnOk(
      world,
      shipInit(5000, createTestPilotAi(player.tick)),
      player.tick,
    );
    if (actor.ai === null) throw new Error("spawned pilot has no AI");
    const ai = actor.ai;
    const run = (): void => {
      AI_REGISTRY["test-pilot"].think({
        self: actor.id,
        view: createWorldView(world, player, layout),
        ctl: createShipControl(world, actor.id, player.tick),
        ai,
        random: () => 0,
      });
    };

    run();
    expect(ai.wakeTick).toBe(112);
    expect(ai.nextThinkTick).toBe(115);

    // The scheduler clears the wake and calls think on tick 112, before 115.
    ai.wakeTick = 0;
    player.tick = 112;
    run();
    expect(ai.nextThinkTick).toBe(127);
    expect(Number.isSafeInteger(ai.wakeTick)).toBe(true);
    expect(ai.wakeTick).toBe(124);
    expect(ai.wakeTick).toBeGreaterThan(112);
  });
});

describe("state is plain data", () => {
  it("is frozen at the registry and survives JSON with integer timers over 200 thinks", () => {
    expect(Object.isFrozen(AI_REGISTRY)).toBe(true);
    expect(Object.isFrozen(TEST_PILOT)).toBe(true);

    const world = createWorld(11);
    const player = playerAt(0);
    const actor = spawnOk(
      world,
      shipInit(5000, createTestPilotAi(0)),
      player.tick,
    );
    const target = spawnOk(world, shipInit(5400, null), player.tick);
    spawnOk(world, shipInit(8000, null), player.tick);
    if (actor.ai === null) throw new Error("spawned pilot has no AI");
    player.position = vec(1e9, 1e9, 1e9);
    const ai = actor.ai;
    const rng = createRngState(actor.rng.ai);

    const phases = new Set<unknown>();
    for (let i = 0; i < 200; i += 1) {
      if (i === 100) {
        killEntity(world, target.id);
        commitWorld(world);
      }
      player.tick = i * 15;
      ai.wakeTick = 0;
      AI_REGISTRY["test-pilot"].think({
        self: actor.id,
        view: createWorldView(world, player, layout),
        ctl: createShipControl(world, actor.id, player.tick),
        ai,
        random: () => rngNext(rng),
      });
      phases.add(ai.params.phase);
      expect(JSON.parse(JSON.stringify(ai))).toEqual(ai);
      expect(Number.isSafeInteger(ai.nextThinkTick)).toBe(true);
      expect(Number.isSafeInteger(ai.wakeTick)).toBe(true);
      expect(ai.nextThinkTick).toBe(player.tick + 15);
    }
    // The run visited both phases, so both branches were round-tripped.
    expect(phases).toEqual(new Set(["seek", "hold"]));
  });

  it("a pilot rebuilt from JSON makes identical calls for the next 20 thinks", () => {
    const spec = newSpec({
      bodies: new Map([[NEAR_ID, vec(3000, 0, 0)]]),
      scan: [NEAR_ID],
    });
    const original = createTestPilotAi(spec.tick, { holdRange: 3500 });
    const rngA = createRngState(99);
    const advance = (i: number): void => {
      spec.tick += 15;
      // The target blinks in and out so both phases and the loss path run.
      if (i % 7 === 0) spec.valid.delete(NEAR_ID);
      else spec.valid.add(NEAR_ID);
    };
    for (let i = 0; i < 30; i += 1) {
      advance(i);
      thinkOnce(spec, original, () => rngNext(rngA));
    }

    const restored = JSON.parse(JSON.stringify(original)) as AiComponent;
    const rngB = { ...rngA };
    for (let i = 30; i < 50; i += 1) {
      advance(i);
      const expected = thinkOnce(spec, original, () => rngNext(rngA));
      const actual = thinkOnce(spec, restored, () => rngNext(rngB));
      expect(actual).toEqual(expected);
      expect(restored).toEqual(original);
    }
  });

  it("changes nothing but its own AiComponent", () => {
    // The fake view returns frozen objects; a write to any of them would throw
    // in strict mode, and the recording control records every action.
    const spec = newSpec();
    const ai = createTestPilotAi(spec.tick);
    const before = JSON.stringify([...spec.bodies]);
    thinkOnce(spec, ai, () => 0.25);
    expect(JSON.stringify([...spec.bodies])).toBe(before);
    expect(spec.valid).toEqual(new Set([FAR_ID, NEAR_ID]));
  });
});
