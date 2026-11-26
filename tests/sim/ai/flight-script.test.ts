// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The flight-script pilot (plan 14-16). The expected calls come from the script
 * table of the plan, never from running the pilot: a recording `ShipControl`
 * and a synthetic `WorldView` stand in for the world, so each case reads one
 * decision of the pilot.
 */

import { describe, expect, it } from "vitest";

import {
  createFlightScriptAi,
  FLIGHT_SCRIPT,
  scriptGoalMetric,
} from "../../../src/sim/ai/pilots/flight-script.js";
import { AI_REGISTRY } from "../../../src/sim/ai/registry.js";
import { THINK_INTERVAL_TICKS } from "../../../src/sim/ai/time.js";
import { AI_KEYS } from "../../../src/sim/ai/types.js";
import type {
  AiComponent,
  AiContext,
  AiEvent,
  AiEventName,
} from "../../../src/sim/ai/types.js";
import { identity, vec } from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";
import type { ShipControl } from "../../../src/sim/world/control.js";
import {
  MAIN_STATION_ID,
  NO_ENTITY,
  PLAYER_ID,
} from "../../../src/sim/world/ids.js";
import type { BehaviourId, EntityId } from "../../../src/sim/world/ids.js";
import type {
  BodyView,
  ShipView,
  WorldView,
} from "../../../src/sim/world/view.js";
import { laveInertWorld } from "../../helpers/traffic-fixture.js";

const SELF: EntityId = 113;
const STATION_AT = vec(10_000, 0, 0);
const PLAYER_AT = vec(0, 0, 0);

/** The calls a recording control saw, in order. */
type Call = readonly [string, ...unknown[]];

function recorder(): { ctl: ShipControl; calls: Call[] } {
  const calls: Call[] = [];
  const ctl: ShipControl = {
    setTarget: (id, target) => calls.push(["setTarget", id, target]),
    setDestination: (id, destination) =>
      calls.push(["setDestination", id, destination]),
    setDesiredRange: (id, range) => calls.push(["setDesiredRange", id, range]),
    setDesiredSpeed: (id, speed) => calls.push(["setDesiredSpeed", id, speed]),
    perform: (id, behaviour) => calls.push(["perform", id, behaviour]),
    scheduleWake: (id, ticks) => calls.push(["scheduleWake", id, ticks]),
    fire: (id) => calls.push(["fire", id]),
  };
  return { ctl, calls };
}

function body(
  id: EntityId,
  kind: BodyView["kind"],
  position: Vec3,
  radius: number,
): BodyView {
  return {
    id,
    kind,
    scanClass: "CLASS_NEUTRAL",
    position,
    orientation: identity(),
    speed: 0,
    radius,
  };
}

/** A synthetic view: the player, the station and the pilot's own ship. */
function view(options: {
  tick?: number;
  self?: Vec3;
  selfRadius?: number;
  behaviour?: BehaviourId;
  player?: boolean;
  station?: boolean;
}): WorldView {
  const bodies = new Map<EntityId, BodyView>();
  if (options.player !== false) {
    bodies.set(PLAYER_ID, body(PLAYER_ID, "player", PLAYER_AT, 70));
  }
  if (options.station !== false) {
    bodies.set(
      MAIN_STATION_ID,
      body(MAIN_STATION_ID, "station", STATION_AT, 500),
    );
  }
  const ship: ShipView = {
    ...body(
      SELF,
      "ship",
      options.self ?? vec(0, 3_000, 0),
      options.selfRadius ?? 30,
    ),
    behaviour: options.behaviour ?? "IDLE",
    targetId: NO_ENTITY,
    destination: vec(0, 0, 0),
    desiredRange: 0,
    desiredSpeed: 0,
    bounty: 0,
    role: "",
    groupId: NO_ENTITY,
    energy: 0,
    maxEnergy: 0,
    cargo: 0,
    accuracy: 0,
    escortSlot: 0,
    ownerId: NO_ENTITY,
  };
  bodies.set(SELF, ship);
  return {
    tick: options.tick ?? 100,
    playerId: PLAYER_ID,
    isValid: (id) => bodies.has(id),
    body: (id) => bodies.get(id),
    ship: (id) => (id === SELF ? ship : undefined),
    scan: () => [],
    mainStation: () => MAIN_STATION_ID,
    mainPlanet: () => 1,
    sun: () => 2,
    playerStanding: () => ({ legalStatus: 0, kills: 0 }),
    groupLeader: () => NO_ENTITY,
  };
}

function context(
  ai: AiComponent,
  world: WorldView,
  ctl: ShipControl,
): AiContext {
  return {
    self: SELF,
    view: world,
    ctl,
    ai,
    random: () => {
      throw new Error("the flight-script pilot draws no random number");
    },
  };
}

function event(name: AiEventName): AiEvent {
  return { to: SELF, name };
}

const SCRIPT_CALLS: readonly {
  script: Parameters<typeof createFlightScriptAi>[1]["script"];
  calls: readonly Call[];
}[] = [
  {
    script: "station",
    calls: [
      ["setDestination", SELF, STATION_AT],
      ["setDesiredRange", SELF, 2_500],
      ["setDesiredSpeed", SELF, 80],
      ["perform", SELF, "FLY_RANGE_FROM_DESTINATION"],
    ],
  },
  {
    script: "intercept",
    calls: [
      ["setTarget", SELF, PLAYER_ID],
      ["setDesiredRange", SELF, 2_500],
      ["setDesiredSpeed", SELF, 80],
      ["perform", SELF, "INTERCEPT_TARGET"],
    ],
  },
  {
    script: "flee",
    calls: [
      ["setTarget", SELF, PLAYER_ID],
      ["setDesiredRange", SELF, 2_500],
      ["perform", SELF, "FLEE_TARGET"],
    ],
  },
  {
    script: "attack",
    calls: [
      ["setTarget", SELF, PLAYER_ID],
      ["perform", SELF, "ATTACK_TARGET"],
    ],
  },
  {
    script: "escort",
    calls: [
      ["setDesiredRange", SELF, 2_500],
      ["perform", SELF, "FORMATION_FORM_UP"],
    ],
  },
  {
    script: "face",
    calls: [
      ["setDestination", SELF, STATION_AT],
      ["setDesiredRange", SELF, 2_500],
      ["perform", SELF, "FACE_DESTINATION"],
    ],
  },
];

function aiFor(script: (typeof SCRIPT_CALLS)[number]["script"]): AiComponent {
  return createFlightScriptAi(100, {
    script,
    targetId:
      script === "station" || script === "escort" || script === "face"
        ? NO_ENTITY
        : PLAYER_ID,
    range: 2_500,
    speed: 80,
  });
}

describe("createFlightScriptAi", () => {
  it("builds a start-phase state of strings and finite numbers whose first think is due at the tick", () => {
    const ai = createFlightScriptAi(42, {
      script: "intercept",
      targetId: PLAYER_ID,
      range: 1_500,
      speed: 320,
    });
    expect(ai.aiKey).toBe("flight-script");
    expect(ai.nextThinkTick).toBe(42);
    expect(ai.wakeTick).toBe(0);
    expect(ai.params).toEqual({
      script: "intercept",
      phase: "start",
      targetId: PLAYER_ID,
      range: 1_500,
      speed: 320,
      frustrated: 0,
    });
    for (const value of Object.values(ai.params)) {
      expect(typeof value === "string" || Number.isFinite(value)).toBe(true);
    }
    expect(JSON.parse(JSON.stringify(ai))).toEqual(ai);
  });

  it("defaults the optional params to no target, range 0 and speed 0", () => {
    const ai = createFlightScriptAi(0, { script: "face" });
    expect(ai.params["targetId"]).toBe(NO_ENTITY);
    expect(ai.params["range"]).toBe(0);
    expect(ai.params["speed"]).toBe(0);
  });
});

describe("the fire option (Phase 17, D-05)", () => {
  it("puts the key fire in params only when true, and nothing else changes", () => {
    const plain = createFlightScriptAi(7, { script: "attack", targetId: 120 });
    expect(Object.keys(plain.params)).not.toContain("fire");
    expect(
      Object.keys(
        createFlightScriptAi(7, {
          script: "attack",
          targetId: 120,
          fire: false,
        }).params,
      ),
    ).not.toContain("fire");
    const opted = createFlightScriptAi(7, {
      script: "attack",
      targetId: 120,
      fire: true,
    });
    expect(opted.params).toEqual({ ...plain.params, fire: true });
    expect(JSON.parse(JSON.stringify(opted))).toEqual(opted);
  });

  it("an opted-in pilot issues exactly the calls of its script, with no fire call, no draw and no wake", () => {
    for (const row of SCRIPT_CALLS) {
      const ai = createFlightScriptAi(100, {
        script: row.script,
        targetId:
          row.script === "station" ||
          row.script === "escort" ||
          row.script === "face"
            ? NO_ENTITY
            : PLAYER_ID,
        range: 2_500,
        speed: 80,
        fire: true,
      });
      const { ctl, calls } = recorder();
      // `random` throws, so a draw fails the case.
      FLIGHT_SCRIPT.think(context(ai, view({}), ctl));
      expect(calls).toEqual(row.calls);
      // later thinks and every goal event: still no fire call, no wake
      FLIGHT_SCRIPT.think(
        context(ai, view({ tick: 115, behaviour: "ATTACK_TARGET" }), ctl),
      );
      for (const name of [
        "shipAIFrustrated",
        "shipAchievedDesiredRange",
        "shipNowFacingDestination",
        "shipTargetLost",
      ] as const) {
        FLIGHT_SCRIPT.onEvent?.(context(ai, view({}), ctl), event(name));
      }
      expect(calls.some((call) => call[0] === "fire")).toBe(false);
      expect(calls.some((call) => call[0] === "scheduleWake")).toBe(false);
    }
  });
});

describe("the flight-script registration", () => {
  it("is a registered, frozen AI key", () => {
    expect(AI_KEYS).toContain("flight-script");
    expect(AI_REGISTRY["flight-script"]).toBe(FLIGHT_SCRIPT);
    expect(Object.isFrozen(AI_REGISTRY["flight-script"])).toBe(true);
    expect(Object.isFrozen(FLIGHT_SCRIPT)).toBe(true);
  });

  it("is never attached by the populator: every populated ship is inert", () => {
    const world = laveInertWorld(1);
    expect(world.store.live).toHaveLength(12);
    for (const entity of world.store.live) expect(entity.ai).toBeNull();
  });
});

describe("the first think of each script", () => {
  for (const row of SCRIPT_CALLS) {
    it(`issues exactly the ${row.script} calls once, then flies`, () => {
      const ai = aiFor(row.script);
      const { ctl, calls } = recorder();
      FLIGHT_SCRIPT.think(context(ai, view({}), ctl));
      expect(calls).toEqual(row.calls);
      expect(ai.params["phase"]).toBe("flying");
      expect(ai.nextThinkTick).toBe(100 + THINK_INTERVAL_TICKS);
    });
  }

  for (const row of SCRIPT_CALLS.filter((r) => r.script !== "flee")) {
    it(`issues nothing on a later think of the ${row.script} script`, () => {
      const ai = aiFor(row.script);
      const { ctl, calls } = recorder();
      FLIGHT_SCRIPT.think(context(ai, view({}), ctl));
      calls.length = 0;
      FLIGHT_SCRIPT.think(context(ai, view({ tick: 115 }), ctl));
      FLIGHT_SCRIPT.think(
        context(ai, view({ tick: 130, behaviour: "ATTACK_TARGET" }), ctl),
      );
      expect(calls).toEqual([]);
      expect(ai.params["phase"]).toBe("flying");
      expect(ai.nextThinkTick).toBe(130 + THINK_INTERVAL_TICKS);
    });
  }

  it("goes done at once for an unknown script and for a missing station", () => {
    const forged = aiFor("attack");
    forged.params["script"] = "teleport";
    const first = recorder();
    FLIGHT_SCRIPT.think(context(forged, view({}), first.ctl));
    expect(first.calls).toEqual([
      ["setDesiredSpeed", SELF, 0],
      ["perform", SELF, "IDLE"],
    ]);
    expect(forged.params["phase"]).toBe("done");

    for (const script of ["station", "face"] as const) {
      const ai = aiFor(script);
      const { ctl, calls } = recorder();
      FLIGHT_SCRIPT.think(context(ai, view({ station: false }), ctl));
      expect(calls).toEqual([
        ["setDesiredSpeed", SELF, 0],
        ["perform", SELF, "IDLE"],
      ]);
      expect(ai.params["phase"]).toBe("done");
    }
  });

  it("makes no call in the done phase", () => {
    const ai = aiFor("flee");
    ai.params["phase"] = "done";
    const { ctl, calls } = recorder();
    FLIGHT_SCRIPT.think(context(ai, view({ behaviour: "ATTACK_TARGET" }), ctl));
    expect(calls).toEqual([]);
  });

  it("never draws a random number and never schedules a wake", () => {
    for (const row of SCRIPT_CALLS) {
      const ai = aiFor(row.script);
      const { ctl, calls } = recorder();
      // `random` throws, so a draw fails the case.
      FLIGHT_SCRIPT.think(context(ai, view({}), ctl));
      expect(calls.some((call) => call[0] === "scheduleWake")).toBe(false);
    }
  });
});

describe("the flee script after its first think", () => {
  function flying(): AiComponent {
    const ai = aiFor("flee");
    ai.params["phase"] = "flying";
    ai.params["range"] = 25_600;
    return ai;
  }

  it("performs FLEE_TARGET again when the ship's behaviour left the flee family for attack", () => {
    for (const behaviour of [
      "ATTACK_TARGET",
      "ATTACK_FLY_TO_TARGET",
      "ATTACK_FLY_FROM_TARGET",
      "ATTACK_SLOW_DOGFIGHT",
      "ATTACK_BREAK_OFF_TARGET",
      "ATTACK_SNIPER",
    ] as const) {
      const ai = flying();
      const { ctl, calls } = recorder();
      FLIGHT_SCRIPT.think(context(ai, view({ behaviour }), ctl));
      expect(calls).toEqual([["perform", SELF, "FLEE_TARGET"]]);
      expect(ai.params["phase"]).toBe("flying");
    }
  });

  it("does not perform again while fleeing, evading or idle", () => {
    for (const behaviour of [
      "FLEE_TARGET",
      "FLEE_EVASIVE_ACTION",
      "EVASIVE_ACTION",
      "IDLE",
    ] as const) {
      const ai = flying();
      const { ctl, calls } = recorder();
      FLIGHT_SCRIPT.think(context(ai, view({ behaviour }), ctl));
      expect(calls).toEqual([]);
    }
  });

  it("goes done, IDLE at desired speed 0, once the range to the player exceeds the flee range", () => {
    // The player is 70 m wide, the ship 30 m: 25,700 m between centres is
    // 25,600 m of range, which is not beyond it; 25,701 m is.
    const edge = recorder();
    const atEdge = flying();
    FLIGHT_SCRIPT.think(
      context(atEdge, view({ self: vec(0, 25_700, 0) }), edge.ctl),
    );
    expect(atEdge.params["phase"]).toBe("flying");

    const past = recorder();
    const beyond = flying();
    FLIGHT_SCRIPT.think(
      context(
        beyond,
        view({ self: vec(0, 25_701, 0), behaviour: "ATTACK_TARGET" }),
        past.ctl,
      ),
    );
    expect(past.calls).toEqual([
      ["setDesiredSpeed", SELF, 0],
      ["perform", SELF, "IDLE"],
    ]);
    expect(beyond.params["phase"]).toBe("done");
  });

  it("stays flying when the player is not in the view", () => {
    const ai = flying();
    const { ctl, calls } = recorder();
    FLIGHT_SCRIPT.think(context(ai, view({ player: false }), ctl));
    expect(calls).toEqual([]);
    expect(ai.params["phase"]).toBe("flying");
  });
});

describe("the goal events", () => {
  const GOAL_EVENTS: readonly AiEventName[] = [
    "shipAchievedDesiredRange",
    "shipNowFacingDestination",
    "shipTargetLost",
  ];

  for (const name of GOAL_EVENTS) {
    it(`moves a flying pilot to done on ${name}, with IDLE at desired speed 0`, () => {
      const ai = aiFor("intercept");
      ai.params["phase"] = "flying";
      const { ctl, calls } = recorder();
      FLIGHT_SCRIPT.onEvent?.(context(ai, view({}), ctl), event(name));
      expect(calls).toEqual([
        ["setDesiredSpeed", SELF, 0],
        ["perform", SELF, "IDLE"],
      ]);
      expect(ai.params["phase"]).toBe("done");
    });

    it(`changes nothing on ${name} in the done phase`, () => {
      const ai = aiFor("intercept");
      ai.params["phase"] = "done";
      const before = JSON.stringify(ai);
      const { ctl, calls } = recorder();
      FLIGHT_SCRIPT.onEvent?.(context(ai, view({}), ctl), event(name));
      expect(calls).toEqual([]);
      expect(JSON.stringify(ai)).toBe(before);
    });
  }

  it("counts every shipAIFrustrated, in every phase, and makes no call for it", () => {
    const ai = aiFor("station");
    const { ctl, calls } = recorder();
    for (const phase of ["start", "flying", "done"]) {
      ai.params["phase"] = phase;
      FLIGHT_SCRIPT.onEvent?.(
        context(ai, view({}), ctl),
        event("shipAIFrustrated"),
      );
    }
    expect(ai.params["frustrated"]).toBe(3);
    expect(ai.params["phase"]).toBe("done");
    expect(calls).toEqual([]);
  });

  it("ignores the other event names", () => {
    const ai = aiFor("attack");
    ai.params["phase"] = "flying";
    const before = JSON.stringify(ai);
    const { ctl, calls } = recorder();
    for (const name of [
      "shipAttacked",
      "shipTargetDestroyed",
      "shipEnteredStationAegis",
    ] as const) {
      FLIGHT_SCRIPT.onEvent?.(context(ai, view({}), ctl), event(name));
    }
    expect(calls).toEqual([]);
    expect(JSON.stringify(ai)).toBe(before);
  });
});

describe("scriptGoalMetric", () => {
  it("is the centre distance to the station centre for the station script", () => {
    // The ship at (4,000, 3,000, 0) is 6,000 m left of the station at (10,000, 0, 0)
    // on x and 3,000 m on y: sqrt(6,000^2 + 3,000^2).
    const metric = scriptGoalMetric(
      view({ self: vec(4_000, 3_000, 0) }),
      SELF,
      "station",
      NO_ENTITY,
    );
    expect(metric).toBeCloseTo(Math.sqrt(6_000 * 6_000 + 3_000 * 3_000), 9);
  });

  it("is the centre distance minus both radii for intercept and flee", () => {
    // Ship 30 m, player 70 m, 3,000 m between centres: 2,900 m.
    for (const script of ["intercept", "flee"] as const) {
      expect(scriptGoalMetric(view({}), SELF, script, PLAYER_ID)).toBeCloseTo(
        2_900,
        9,
      );
    }
    // Overlapping hulls give a negative range, as rangeToPrimaryTarget does.
    expect(
      scriptGoalMetric(
        view({ self: vec(0, 50, 0) }),
        SELF,
        "intercept",
        PLAYER_ID,
      ),
    ).toBeCloseTo(-50, 9);
  });

  it("is undefined for a script with no metric or a body the view does not hold", () => {
    expect(
      scriptGoalMetric(view({}), SELF, "attack", PLAYER_ID),
    ).toBeUndefined();
    expect(
      scriptGoalMetric(view({}), SELF, "escort", PLAYER_ID),
    ).toBeUndefined();
    expect(
      scriptGoalMetric(view({}), SELF, "bogus", PLAYER_ID),
    ).toBeUndefined();
    expect(
      scriptGoalMetric(view({ player: false }), SELF, "flee", PLAYER_ID),
    ).toBeUndefined();
    expect(
      scriptGoalMetric(view({ station: false }), SELF, "station", NO_ENTITY),
    ).toBeUndefined();
    expect(
      scriptGoalMetric(view({}), 999, "station", NO_ENTITY),
    ).toBeUndefined();
  });
});
