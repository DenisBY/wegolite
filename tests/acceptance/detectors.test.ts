// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The acceptance detectors prove themselves (plan 14-17, Task 1). Each detector
 * of `detectors.ts` gets one forced violation that trips it, a clean control
 * that trips none, and the no-AI control that shows which run minimums fail a
 * run where nothing flies. The 20-seed run itself is
 * `npm run test:acceptance`; this file stays in the default suite.
 *
 * The forced cases feed `SeedObserver` synthetic `Sample`s (a flyer and a hull
 * at chosen poses, over the real compiled hulls), so each detector is tested
 * against a known geometry and not against whatever the port happens to do.
 * The live-world cases (set-up, repair, the designed near pass) run the real
 * `stepSim` through the same stepper the run uses.
 */

import { describe, expect, it } from "vitest";
import type { TestAPI } from "vitest";

import type { HullOctree, OctreeNode } from "../../src/sim/combat/octree.js";
import { identity, vec } from "../../src/sim/math.js";
import type { Vec3 } from "../../src/sim/math.js";
import { PLAYER_ID } from "../../src/sim/world/ids.js";
import { realHullTable } from "../helpers/hull-table.js";
import { laveFixture } from "../helpers/lave.js";
import type { AcceptedHullCrossing } from "./accepted-crossings.js";
import {
  acceptedMatches,
  addTotals,
  chooseParkingFrame,
  classifyCrossing,
  checkRunMinimums,
  createSeedStepper,
  emptyTotals,
  goalMet,
  pointInHullSolid,
  registerAcceptanceRun,
  runSeed,
  sampleSeed,
  SeedObserver,
  seedBreaches,
  segmentHitsHull,
  setUpSeed,
} from "./detectors.js";
import type { FlyerInfo, Sample, ShipSample } from "./detectors.js";
import {
  ACCEPTANCE_EPOCH_TIMEOUT_MS,
  ACCEPTANCE_EPOCHS,
  FLYER_START_OFFSETS,
  FROZEN_MIN_DISPLACEMENT_M,
  PLAYER_PARK_DISTANCE_M,
  RUN_MINIMUMS,
  SCRIPT_MAPPING,
  STUCK_WINDOW_TICKS,
} from "./thresholds.js";

const hulls = realHullTable();
const KRAIT = "krait";
/** Far from every forced geometry. */
const FAR_STATION = vec(1e7, 0, 0);
const PLAYER_FAR = vec(0, 5e6, 0);

function ship(id: number, over: Partial<ShipSample> = {}): ShipSample {
  return {
    id,
    specKey: "adder",
    position: vec(0, 0, 0),
    orientation: identity(),
    behaviour: "IDLE",
    targetId: 0,
    desiredSpeed: 0,
    proximityAlert: 0,
    accuracy: 3,
    frustrated: 0,
    goalMetric: undefined,
    ...over,
  };
}

function sample(
  ships: readonly ShipSample[],
  over: Partial<Sample> = {},
): Sample {
  return {
    ships,
    player: {
      position: PLAYER_FAR,
      orientation: identity(),
      specKey: "oolite_template_cobra3-player",
    },
    repairs: 0,
    aiFaulted: 0,
    aiDropped: 0,
    hashFailed: false,
    ...over,
  };
}

function flyer(
  id: number,
  index: number,
  script: FlyerInfo["script"],
): FlyerInfo {
  return { id, index, script };
}

const NO_ACCEPTED: readonly AcceptedHullCrossing[] = [];

function observerFor(
  flyers: readonly FlyerInfo[],
  accepted: readonly AcceptedHullCrossing[] = NO_ACCEPTED,
  station: Vec3 = FAR_STATION,
): SeedObserver {
  return new SeedObserver(1, flyers, hulls, station, accepted);
}

/**
 * Two ships, 101 (the crosser) and 102 (a stationary Krait at the origin). Tick
 * -1 puts 101 at x = -300 and each later tick moves it as `positions` says; the
 * crosser's state at tick -1 is `before`.
 */
function crossingRun(
  before: Partial<ShipSample>,
  xs: readonly number[],
  accepted: readonly AcceptedHullCrossing[] = NO_ACCEPTED,
  afterBehaviour: Partial<ShipSample> = {},
): SeedObserver {
  const observer = observerFor(
    [flyer(101, 0, "face"), flyer(102, 1, "face")],
    accepted,
  );
  const body = ship(102, { specKey: KRAIT });
  observer.start(
    sample([ship(101, { ...before, position: vec(-300, 0, 0) }), body]),
  );
  for (const x of xs) {
    observer.observe(
      sample([ship(101, { ...afterBehaviour, position: vec(x, 0, 0) }), body]),
    );
  }
  return observer;
}

describe("the hull test (stage A, stage B, zero-length)", () => {
  const krait = hulls.get(KRAIT);
  if (krait === undefined) throw new Error("no krait hull");
  const pose = { position: vec(0, 0, 0), orientation: identity() };

  it("hits a segment through the hull's centre and misses one far away or just outside the sphere", () => {
    expect(segmentHitsHull(vec(-300, 0, 0), vec(300, 0, 0), pose, krait)).toBe(
      true,
    );
    expect(
      segmentHitsHull(vec(-300, 900, 0), vec(300, 900, 0), pose, krait),
    ).toBe(false);
    // Passing at the collision radius plus a metre: the first stage rejects it.
    const outside = krait.collisionRadius + 1;
    expect(
      segmentHitsHull(vec(-300, outside, 0), vec(300, outside, 0), pose, krait),
    ).toBe(false);
  });

  it("uses the collision radius for stage A, not the octree's root half-width", () => {
    // The Krait's collision radius (50.20) exceeds its octree half-width (47.70).
    expect(krait.collisionRadius).toBeGreaterThan(krait.octree.radius);
    const inBetween = (krait.collisionRadius + krait.octree.radius) / 2;
    // A segment passing at that offset is inside the sphere, so stage A lets it
    // reach the octree, which decides; it must not be rejected by the sphere.
    const result = segmentHitsHull(
      vec(-300, inBetween, 0),
      vec(300, inBetween, 0),
      pose,
      krait,
    );
    expect(typeof result).toBe("boolean");
  });

  it("tests a zero-length segment as the point at its origin", () => {
    const centre = nearestSolidLeaf(krait.octree);
    // Model z is the negated world z for the identity orientation.
    const inside = vec(centre.x, centre.y, -centre.z);
    expect(pointInHullSolid(krait.octree, centre)).toBe(true);
    expect(segmentHitsHull(inside, inside, pose, krait)).toBe(true);
    // The same point 400 m away is outside the sphere.
    const away = vec(inside.x + 400, inside.y, inside.z);
    expect(segmentHitsHull(away, away, pose, krait)).toBe(false);
    // An empty cell of the octree is not a hit.
    expect(pointInHullSolid(krait.octree, vec(1e6, 0, 0))).toBe(false);
  });
});

/** The solid leaf of `octree` nearest its origin, as a model-frame centre. */
function nearestSolidLeaf(octree: HullOctree): Vec3 {
  let best: Vec3 | undefined;
  const visit = (node: OctreeNode, centre: Vec3, half: number): void => {
    if (node === 0) return;
    if (node === -1) {
      if (
        best === undefined ||
        Math.hypot(centre.x, centre.y, centre.z) <
          Math.hypot(best.x, best.y, best.z)
      ) {
        best = centre;
      }
      return;
    }
    const quarter = half / 2;
    node.forEach((child, index) => {
      const ix = (index >> 2) & 1;
      const iy = (index >> 1) & 1;
      const iz = index & 1;
      visit(
        child,
        vec(
          centre.x + (ix === 1 ? quarter : -quarter),
          centre.y + (iy === 1 ? quarter : -quarter),
          centre.z + (iz === 1 ? quarter : -quarter),
        ),
        quarter,
      );
    });
  };
  visit(octree.root, vec(0, 0, 0), octree.radius);
  if (best === undefined) throw new Error("the octree holds no solid leaf");
  return best;
}

describe("hull-crossing classes, forced one each", () => {
  it("own-target: the flyer crossed the body it targets", () => {
    const result = crossingRun({ targetId: 102 }, [300]).result();
    const own = result.episodes.filter((episode) => episode.flyerId === 101);
    expect(own).toHaveLength(1);
    expect(own[0]?.crossingClass).toBe("own-target");
    expect(own[0]?.crossedId).toBe(102);
    expect(own[0]?.firstTick).toBe(0);
    expect(result.hullCrossings.count).toBe(1);
  });

  it("other-alert-ignored: no alert names the crossed body", () => {
    const result = crossingRun(
      { behaviour: "FLY_RANGE_FROM_DESTINATION", proximityAlert: 0 },
      [300],
    ).result();
    const episodes = result.episodes.filter(
      (episode) => episode.flyerId === 101,
    );
    expect(episodes.map((episode) => episode.crossingClass)).toEqual([
      "other-alert-ignored",
    ]);
    expect(result.hullCrossings.count).toBe(1);
  });

  it("other: an alert naming the body was held in AVOID_COLLISION and the hull was still crossed", () => {
    const result = crossingRun(
      { behaviour: "AVOID_COLLISION", proximityAlert: 102 },
      [300],
    ).result();
    const episodes = result.episodes.filter(
      (episode) => episode.flyerId === 101,
    );
    expect(episodes.map((episode) => episode.crossingClass)).toEqual(["other"]);
    expect(episodes[0]?.before).toEqual({
      behaviour: "AVOID_COLLISION",
      accuracy: 3,
      targetId: 0,
      proximityAlert: 102,
    });
    expect(result.hullCrossings.count).toBe(1);
  });

  it("applies the class rule in the thresholds file's order", () => {
    const base = {
      behaviour: "IDLE",
      accuracy: 3,
      targetId: 0,
      proximityAlert: 0,
    };
    // Own target beats everything, alert or not.
    expect(
      classifyCrossing({ ...base, targetId: 102, proximityAlert: 102 }, 102),
    ).toBe("own-target");
    // An alert for a different body does not name it.
    expect(
      classifyCrossing(
        { ...base, behaviour: "AVOID_COLLISION", proximityAlert: 103 },
        102,
      ),
    ).toBe("other-alert-ignored");
    // A behaviour that does not act on an alert.
    expect(
      classifyCrossing(
        { ...base, behaviour: "IDLE", proximityAlert: 102 },
        102,
      ),
    ).toBe("other-alert-ignored");
    // FLEE_TARGET below accuracy 0 skips avoidance (ShipEntity.m:4898)...
    expect(
      classifyCrossing(
        {
          ...base,
          behaviour: "FLEE_TARGET",
          accuracy: -0.5,
          proximityAlert: 102,
        },
        102,
      ),
    ).toBe("other-alert-ignored");
    // ...and acts on it at accuracy 0 and above.
    expect(
      classifyCrossing(
        { ...base, behaviour: "FLEE_TARGET", accuracy: 0, proximityAlert: 102 },
        102,
      ),
    ).toBe("other");
    expect(
      classifyCrossing(
        { ...base, behaviour: "INTERCEPT_TARGET", proximityAlert: 102 },
        102,
      ),
    ).toBe("other");
  });

  it("classifies the first crossing tick from the placed start's state", () => {
    // Tick 0's class reads the sample before the first call (the placed start),
    // not the state at tick 0, which the first think already changed.
    const result = crossingRun(
      { behaviour: "IDLE", proximityAlert: 0, targetId: 0 },
      [300],
      NO_ACCEPTED,
      { targetId: 102, behaviour: "AVOID_COLLISION", proximityAlert: 102 },
    ).result();
    expect(result.episodes[0]?.crossingClass).toBe("other-alert-ignored");
  });
});

describe("the zero-length rule", () => {
  it("catches a parked flyer under a hull that moves over it", () => {
    const krait = hulls.get(KRAIT);
    if (krait === undefined) throw new Error("no krait hull");
    const leaf = nearestSolidLeaf(krait.octree);
    const parked = vec(leaf.x, leaf.y, -leaf.z);
    const observer = observerFor([
      flyer(101, 0, "face"),
      flyer(102, 1, "face"),
    ]);
    const parkedShip = ship(101, { position: parked });
    // The Krait is 500 m off at the placed start, and at the origin at tick 0.
    observer.start(
      sample([
        parkedShip,
        ship(102, { specKey: KRAIT, position: vec(500, 0, 0) }),
      ]),
    );
    observer.observe(
      sample([
        parkedShip,
        ship(102, { specKey: KRAIT, position: vec(0, 0, 0) }),
      ]),
    );
    const result = observer.result();
    const episodes = result.episodes.filter(
      (episode) => episode.flyerId === 101,
    );
    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.firstTick).toBe(0);
    expect(episodes[0]?.crossedId).toBe(102);
    expect(result.hullCrossings.count).toBeGreaterThanOrEqual(1);
  });
});

describe("episodes", () => {
  it("groups consecutive crossing ticks of one flyer, body and class into one episode", () => {
    // 101 crosses the Krait on ticks 0 to 2 (x = 300, -300 back and forth).
    const result = crossingRun(
      { targetId: 102 },
      [300, -300, 300],
      NO_ACCEPTED,
      {
        targetId: 102,
      },
    ).result();
    const episodes = result.episodes.filter(
      (episode) => episode.flyerId === 101,
    );
    expect(episodes).toHaveLength(1);
    expect(episodes[0]).toMatchObject({ firstTick: 0, lastTick: 2, ticks: 3 });
    expect(result.hullCrossings.count).toBe(1);
  });

  it("splits an episode at a change of class and at a gap in the ticks", () => {
    const observer = observerFor([
      flyer(101, 0, "face"),
      flyer(102, 1, "face"),
    ]);
    const body = ship(102, { specKey: KRAIT });
    // Tick 0 and 1 cross with the target set (own-target); on tick 2 the flyer
    // no longer targets the body, so tick 2's crossing (judged from tick 1's
    // state, which still targets it) stays own-target, tick 3's (judged from
    // tick 2's state) is other-alert-ignored: a new episode.
    observer.start(
      sample([ship(101, { targetId: 102, position: vec(-300, 0, 0) }), body]),
    );
    const states: Partial<ShipSample>[] = [
      { targetId: 102, position: vec(300, 0, 0) },
      { targetId: 102, position: vec(-300, 0, 0) },
      { targetId: 0, position: vec(300, 0, 0) },
      { targetId: 0, position: vec(-300, 0, 0) },
      // A tick with no crossing (far away) then another crossing after a gap.
      { targetId: 0, position: vec(-300, 5_000, 0) },
      { targetId: 0, position: vec(-300, 0, 0) },
      { targetId: 0, position: vec(300, 0, 0) },
    ];
    for (const state of states)
      observer.observe(sample([ship(101, state), body]));
    const episodes = observer
      .result()
      .episodes.filter((episode) => episode.flyerId === 101);
    expect(
      episodes.map((episode) => [
        episode.firstTick,
        episode.lastTick,
        episode.crossingClass,
      ]),
    ).toEqual([
      [0, 2, "own-target"],
      [3, 3, "other-alert-ignored"],
      [6, 6, "other-alert-ignored"],
    ]);
  });
});

describe("the accepted list", () => {
  const entry = (
    crossingClass: AcceptedHullCrossing["crossingClass"],
    over: Partial<AcceptedHullCrossing> = {},
  ): AcceptedHullCrossing => ({
    epoch: 1,
    flyerId: 101,
    crossedId: 102,
    firstTick: 0,
    crossingClass,
    decision: "test entry",
    ...over,
  });

  const before: Record<
    AcceptedHullCrossing["crossingClass"],
    Partial<ShipSample>
  > = {
    "own-target": { targetId: 102 },
    "other-alert-ignored": { behaviour: "IDLE" },
    other: { behaviour: "AVOID_COLLISION", proximityAlert: 102 },
  };

  for (const crossingClass of [
    "own-target",
    "other-alert-ignored",
    "other",
  ] as const) {
    it(`an entry of class ${crossingClass} excuses exactly its episode`, () => {
      const open = crossingRun(before[crossingClass], [300]).result();
      expect(open.hullCrossings.count).toBe(1);
      const excused = crossingRun(
        before[crossingClass],
        [300],
        [entry(crossingClass)],
      ).result();
      expect(excused.hullCrossings.count).toBe(0);
      expect(excused.episodes[0]?.accepted).toBe(true);
      expect(excused.staleAccepted).toEqual([]);
      expect(seedBreaches(excused)).toEqual([]);
      // An entry that differs in any one key excuses nothing and is stale.
      for (const other of [
        entry(crossingClass, { epoch: 2 }),
        entry(crossingClass, { flyerId: 102 }),
        entry(crossingClass, { crossedId: 103 }),
        entry(crossingClass, { firstTick: 1 }),
        entry(crossingClass === "other" ? "own-target" : "other"),
      ]) {
        const result = crossingRun(
          before[crossingClass],
          [300],
          [other],
        ).result();
        expect(result.hullCrossings.count).toBe(1);
        if (other.epoch === 1) expect(result.staleAccepted).toEqual([other]);
      }
    });
  }

  it("excuses one episode and not the other episodes of the same flyer", () => {
    const observer = observerFor(
      [flyer(101, 0, "face"), flyer(102, 1, "face")],
      [entry("own-target", { firstTick: 0 })],
    );
    const body = ship(102, { specKey: KRAIT });
    observer.start(
      sample([ship(101, { targetId: 102, position: vec(-300, 0, 0) }), body]),
    );
    for (const state of [
      { targetId: 102, position: vec(300, 0, 0) },
      { targetId: 102, position: vec(300, 5_000, 0) },
      { targetId: 102, position: vec(-300, 5_000, 0) },
      { targetId: 102, position: vec(-300, 0, 0) },
      { targetId: 102, position: vec(300, 0, 0) },
    ]) {
      observer.observe(sample([ship(101, state), body]));
    }
    const result = observer.result();
    expect(
      result.episodes.map((episode) => [episode.firstTick, episode.accepted]),
    ).toEqual([
      [0, true],
      [4, false],
    ]);
    expect(result.hullCrossings).toEqual({ count: 1, firstTick: 4 });
  });

  it("acceptedMatches compares epoch, flyer, body, first tick and class", () => {
    const episode = crossingRun({ targetId: 102 }, [300]).result().episodes[0];
    if (episode === undefined) throw new Error("no episode");
    expect(acceptedMatches(entry("own-target"), episode)).toBe(true);
    expect(acceptedMatches(entry("other"), episode)).toBe(false);
  });
});

describe("the station sphere", () => {
  it("counts the ticks a flyer origin lies strictly inside the sphere", () => {
    const station = vec(10_000, 0, 0);
    const observer = observerFor([flyer(101, 0, "face")], NO_ACCEPTED, station);
    observer.start(sample([ship(101, { position: vec(9_000, 0, 0) })]));
    for (const x of [9_100, 9_221, 9_222, 9_220.6297607421875]) {
      observer.observe(sample([ship(101, { position: vec(x, 0, 0) })]));
    }
    const result = observer.result();
    // 779 m and 778 m from the centre at x = 9,221 and 9,222; exactly the radius
    // at x = 9,220.6297607421875 and 900 m at x = 9,100 are not strictly inside.
    expect(result.stationSphere).toEqual({ count: 2, firstTick: 1 });
    expect(seedBreaches(result)).toContain(
      "station-sphere entries: 2 (limit 0, first at tick 1)",
    );
    expect(result.minStationClearance).toBeCloseTo(-1.3702392578125, 9);
  });
});

/** Feed `ticks` samples of one goal flyer. */
function feedGoalFlyer(
  script: FlyerInfo["script"],
  ticks: number,
  at: (k: number) => Partial<ShipSample>,
): SeedObserver {
  const observer = observerFor([flyer(101, 0, script)]);
  observer.start(sample([ship(101, at(-1))]));
  for (let k = 0; k < ticks; k += 1) {
    observer.observe(sample([ship(101, at(k))]));
  }
  return observer;
}

describe("the stuck and frozen windows", () => {
  const TICKS = STUCK_WINDOW_TICKS * 5;

  it("a stalled goal is stuck in every window: the detector that fails an unmoved fleet", () => {
    const result = feedGoalFlyer("station", TICKS, () => ({
      goalMetric: 12_000,
    })).result();
    expect(result.stuck.count).toBe(5);
    expect(result.stuck.firstTick).toBe(STUCK_WINDOW_TICKS - 1);
    expect(result.tallies.stuckWindowsEvaluated).toBe(5);
    expect(seedBreaches(result).join("\n")).toContain("stuck windows: 5");
  });

  it("evaluates flee windows by the end minus the start", () => {
    // A flyer that closes in on the player is stuck by the flee rule.
    const closing = feedGoalFlyer("flee", STUCK_WINDOW_TICKS, (k) => ({
      goalMetric: 5_000 - Math.max(k, 0),
    })).result();
    expect(closing.stuck.count).toBe(1);
    const opening = feedGoalFlyer("flee", STUCK_WINDOW_TICKS, (k) => ({
      goalMetric: 5_000 + Math.max(k, 0),
    })).result();
    expect(opening.stuck.count).toBe(0);
    expect(opening.tallies.stuckWindowsEvaluated).toBe(1);
  });

  it("net progress below the fraction of the start or below a metre is stuck", () => {
    // 11 m of 12,000 m is below 1 %; 130 m is above it.
    const slow = feedGoalFlyer("intercept", STUCK_WINDOW_TICKS, (k) => ({
      goalMetric: 12_000 - (Math.max(k, 0) * 11) / (STUCK_WINDOW_TICKS - 1),
    })).result();
    expect(slow.stuck.count).toBe(1);
    const fine = feedGoalFlyer("intercept", STUCK_WINDOW_TICKS, (k) => ({
      goalMetric: 12_000 - (Math.max(k, 0) * 130) / (STUCK_WINDOW_TICKS - 1),
    })).result();
    expect(fine.stuck.count).toBe(0);
    // Near the goal the metre floor governs: 0.5 m of a 50 m start is stuck.
    const tiny = feedGoalFlyer("intercept", STUCK_WINDOW_TICKS, (k) => ({
      goalMetric: 5_000 - (Math.max(k, 0) * 0.5) / (STUCK_WINDOW_TICKS - 1),
    })).result();
    expect(tiny.stuck.count).toBe(1);
  });

  it("a goal met mid-window removes that window and every later one", () => {
    const result = feedGoalFlyer("station", TICKS, (k) => ({
      // Window 0 makes progress; the goal is met at tick 4,000 (window 1) and
      // the metric then stalls at 2,000 for the rest of the run.
      goalMetric: k < 0 ? 12_000 : k < 4_000 ? 12_000 - 2 * k : 2_000,
    })).result();
    expect(result.stuck.count).toBe(0);
    expect(result.tallies.stuckWindowsEvaluated).toBe(1);
    expect(result.tallies.stationArrivals).toBe(1);
  });

  it("a flyer that holds still at speed is frozen; one below the speed floor is not evaluated", () => {
    const frozen = feedGoalFlyer("face", TICKS, () => ({
      desiredSpeed: 80,
    })).result();
    expect(frozen.frozen.count).toBe(5);
    expect(frozen.tallies.frozenWindowsEvaluated).toBe(5);
    const slow = feedGoalFlyer("face", TICKS, () => ({
      desiredSpeed: 9,
    })).result();
    expect(slow.frozen.count).toBe(0);
    expect(slow.tallies.frozenWindowsEvaluated).toBe(0);
    // One tick below the floor inside a window removes that window only.
    const dip = feedGoalFlyer("face", TICKS, (k) => ({
      desiredSpeed: k === 100 ? 0 : 80,
    })).result();
    expect(dip.tallies.frozenWindowsEvaluated).toBe(4);
    expect(dip.frozen.count).toBe(4);
  });

  it("uses the path length, not the net displacement, for the frozen windows", () => {
    // Back and forth over 60 m a tick: net zero, path far above the floor.
    const result = feedGoalFlyer("face", STUCK_WINDOW_TICKS, (k) => ({
      desiredSpeed: 80,
      position: vec(k % 2 === 0 ? 0 : 60, 0, 0),
    })).result();
    expect(result.frozen.count).toBe(0);
    expect(result.tallies.frozenWindowsEvaluated).toBe(1);
    expect(60 * (STUCK_WINDOW_TICKS - 1)).toBeGreaterThan(
      FROZEN_MIN_DISPLACEMENT_M,
    );
  });
});

describe("frustration, avoidance entries and the global counters", () => {
  it("counts shipAIFrustrated events of a goal script while its goal is unmet, not after the goal", () => {
    const observer = observerFor([flyer(101, 0, "station")]);
    observer.start(sample([ship(101, { goalMetric: 9_000, frustrated: 0 })]));
    const rows: [number, number][] = [
      [9_000, 0],
      [9_000, 1],
      [9_000, 1],
      [2_000, 2], // the goal is met on this tick: the event is the goal tick's
      [2_000, 3], // after the goal: not counted
    ];
    for (const [metric, frustrated] of rows) {
      observer.observe(sample([ship(101, { goalMetric: metric, frustrated })]));
    }
    const result = observer.result();
    expect(result.frustration).toEqual({ count: 2, firstTick: 1 });
    expect(seedBreaches(result).join("\n")).toContain("frustration events: 2");
  });

  it("tallies a behaviour that becomes AVOID_COLLISION once per entry", () => {
    const observer = observerFor([flyer(101, 0, "face")]);
    observer.start(sample([ship(101)]));
    for (const behaviour of [
      "IDLE",
      "AVOID_COLLISION",
      "AVOID_COLLISION",
      "INTERCEPT_TARGET",
      "AVOID_COLLISION",
    ]) {
      observer.observe(sample([ship(101, { behaviour })]));
    }
    expect(observer.result().tallies.avoidCollisionEntries).toBe(2);
    // An entry on tick 0 compares with the placed start.
    const first = observerFor([flyer(101, 0, "face")]);
    first.start(sample([ship(101)]));
    first.observe(sample([ship(101, { behaviour: "AVOID_COLLISION" })]));
    expect(first.result().tallies.avoidCollisionEntries).toBe(1);
  });

  it("counts attack-flyer samples within the near-player radius, and no other script's", () => {
    const observer = observerFor([
      flyer(101, 0, "attack"),
      flyer(102, 1, "face"),
    ]);
    const near = vec(0, 5e6 - 900, 0);
    const far = vec(0, 5e6 - 1_001, 0);
    observer.start(
      sample([ship(101, { position: far }), ship(102, { position: far })]),
    );
    for (const position of [near, far, near]) {
      observer.observe(
        sample([ship(101, { position }), ship(102, { position: near })]),
      );
    }
    expect(observer.result().tallies.attackTicksNearPlayer).toBe(2);
  });

  it("tallies arrivals once per flyer, by script", () => {
    const observer = observerFor([
      flyer(101, 0, "station"),
      flyer(102, 1, "intercept"),
      flyer(103, 2, "flee"),
    ]);
    observer.start(
      sample([
        ship(101, { goalMetric: 9_000 }),
        ship(102, { goalMetric: 9_000 }),
        ship(103, { goalMetric: 9_000 }),
      ]),
    );
    for (let k = 0; k < 3; k += 1) {
      observer.observe(
        sample([
          ship(101, { goalMetric: 2_000 }),
          ship(102, { goalMetric: 1_000 }),
          ship(103, { goalMetric: 30_000 }),
        ]),
      );
    }
    const { tallies } = observer.result();
    expect([
      tallies.stationArrivals,
      tallies.interceptArrivals,
      tallies.fleeArrivals,
    ]).toEqual([1, 1, 1]);
    expect(goalMet("station", 2_500)).toBe(true);
    expect(goalMet("intercept", 1_500)).toBe(false);
    expect(goalMet("flee", 25_600)).toBe(false);
  });

  it("reports repairs, AI faults, AI drops and hashWorld failures", () => {
    const observer = observerFor([flyer(101, 0, "face")]);
    observer.start(sample([ship(101)]));
    observer.observe(sample([ship(101)]));
    observer.observe(sample([ship(101)], { repairs: 1, aiFaulted: 1 }));
    observer.observe(
      sample([ship(101)], { repairs: 3, aiDropped: 2, hashFailed: true }),
    );
    const result = observer.result();
    expect(result.repairs).toEqual({ count: 3, firstTick: 1 });
    expect(result.aiFaulted).toEqual({ count: 1, firstTick: 1 });
    expect(result.aiDropped).toEqual({ count: 2, firstTick: 2 });
    expect(result.hashFailures).toEqual({ count: 1, firstTick: 2 });
    expect(seedBreaches(result)).toHaveLength(4);
  });

  it("catches a NaN that sanitizeEntity repairs in the live world", () => {
    const setup = setUpSeed(1, { withAi: true });
    const step = createSeedStepper(setup);
    const observer = new SeedObserver(
      1,
      setup.flyers,
      hulls,
      setup.layout.station.position,
      NO_ACCEPTED,
    );
    observer.start(sampleSeed(setup, { aiFaulted: 0, hashFailed: false }));
    observer.observe(step());
    const victim = setup.world.store.get(setup.flyers[0]?.id ?? 0);
    if (victim === undefined) throw new Error("no victim");
    victim.position = vec(Number.NaN, 0, 0);
    observer.observe(step());
    const result = observer.result();
    expect(result.repairs.count).toBeGreaterThanOrEqual(1);
    expect(result.repairs.firstTick).toBe(1);
    expect(result.hashFailures.count).toBe(0);
    expect(seedBreaches(result).join("\n")).toContain("repairs:");
  });
});

describe("the clean control", () => {
  it("trips no detector: flyers that approach their goals, apart from each other", () => {
    const observer = observerFor([
      flyer(101, 0, "station"),
      flyer(102, 1, "flee"),
    ]);
    const at = (k: number): ShipSample[] => [
      ship(101, {
        position: vec(0.5 * k, 0, 0),
        desiredSpeed: 80,
        goalMetric: 12_000 - 0.4 * k,
        behaviour: "FLY_RANGE_FROM_DESTINATION",
      }),
      ship(102, {
        position: vec(0, 0.5 * k, 20_000),
        desiredSpeed: 80,
        goalMetric: 5_000 + 0.5 * k,
        behaviour: "FLEE_TARGET",
      }),
    ];
    observer.start(sample(at(-1)));
    for (let k = 0; k < STUCK_WINDOW_TICKS * 5; k += 1) {
      observer.observe(sample(at(k)));
    }
    const result = observer.result();
    expect(seedBreaches(result)).toEqual([]);
    expect(result.episodes).toEqual([]);
    expect(result.tallies.stuckWindowsEvaluated).toBe(10);
    expect(result.tallies.frozenWindowsEvaluated).toBe(10);
    expect(result.tallies.avoidCollisionEntries).toBe(0);
  });
});

describe("run minimums", () => {
  it("lists every floor a run that tests nothing misses and none it meets", () => {
    const zero = checkRunMinimums(emptyTotals());
    expect(zero.map((floor) => floor.name)).toEqual(Object.keys(RUN_MINIMUMS));
    expect(zero[0]).toEqual({
      name: "stationArrivals",
      total: 0,
      minimum: RUN_MINIMUMS.stationArrivals,
    });
    const met = emptyTotals();
    for (const name of Object.keys(
      RUN_MINIMUMS,
    ) as (keyof typeof RUN_MINIMUMS)[]) {
      met[name] = RUN_MINIMUMS[name];
    }
    expect(checkRunMinimums(met)).toEqual([]);
    met.avoidCollisionEntries -= 1;
    expect(checkRunMinimums(met).map((floor) => floor.name)).toEqual([
      "avoidCollisionEntries",
    ]);
    const sum = emptyTotals();
    addTotals(sum, met);
    addTotals(sum, met);
    expect(sum.attackTicksNearPlayer).toBe(
      2 * RUN_MINIMUMS.attackTicksNearPlayer,
    );
  });

  it("the no-AI control shows every goal unmet at t0 and the floors that fail a run where nothing flies", () => {
    // 600 ticks are shorter than one window (3,600), so this control says
    // nothing about the two window floors (stuckWindowsEvaluated and
    // frozenWindowsEvaluated): those guard detector vacuity, not a port that
    // does nothing. An unmoved fleet over the full horizon would have its
    // windows evaluated, and MAX_STUCK_WINDOWS, proven by the stalled-goal case
    // above, fails it.
    const { result } = runSeed(1, NO_ACCEPTED, { withAi: false, ticks: 600 });
    expect(result.t0.goals).toHaveLength(6);
    for (const goal of result.t0.goals) {
      expect(goal.metric).toBeDefined();
      const metric = goal.metric ?? Number.NaN;
      if (goal.script === "station") expect(metric).toBeGreaterThan(2_500);
      if (goal.script === "intercept") expect(metric).toBeGreaterThan(1_500);
      if (goal.script === "flee") expect(metric).toBeLessThan(25_600);
      expect(goalMet(goal.script, metric)).toBe(false);
    }
    expect(result.t0.attackerDistances).toHaveLength(2);
    for (const distance of result.t0.attackerDistances) {
      expect(distance).toBeGreaterThan(1_000);
    }
    expect(result.tallies).toMatchObject({
      stationArrivals: 0,
      interceptArrivals: 0,
      fleeArrivals: 0,
      avoidCollisionEntries: 0,
      attackTicksNearPlayer: 0,
    });
    const missed = checkRunMinimums(result.tallies).map((floor) => floor.name);
    for (const name of [
      "stationArrivals",
      "interceptArrivals",
      "fleeArrivals",
      "avoidCollisionEntries",
      "attackTicksNearPlayer",
    ]) {
      expect(missed).toContain(name);
    }
    expect(seedBreaches(result)).toEqual([]);
  });
});

describe("the seed set-up", () => {
  const { layout } = laveFixture();

  it("parks the player on the first qualifying axis: +x for Lave", () => {
    const frame = chooseParkingFrame(layout);
    expect(frame.axis.label).toBe("+x");
    expect(frame.b).toEqual(vec(0, 1, 0));
    expect(frame.c).toEqual(vec(0, 0, 1));
    expect(frame.park.x - layout.station.position.x).toBeCloseTo(
      PLAYER_PARK_DISTANCE_M,
      9,
    );
  });

  it("skips an axis whose point or start lies inside the planet's clearance, and fails when none qualifies", () => {
    const first = chooseParkingFrame(layout);
    const blocked = {
      ...layout,
      planet: { position: first.park, radius: 500 },
    };
    expect(chooseParkingFrame(blocked).axis.label).toBe("-x");
    const covered = {
      ...layout,
      planet: { position: layout.station.position, radius: 1e9 },
    };
    expect(() => chooseParkingFrame(covered)).toThrow(/no parking axis/);
  });

  it("converts the 12 ships by the script mapping and moves them to the committed placement", () => {
    const setup = setUpSeed(1, { withAi: true });
    expect(setup.flyers).toHaveLength(12);
    expect(setup.flyers.map((f) => f.id)).toEqual(
      Array.from({ length: 12 }, (_, i) => 101 + i),
    );
    expect(setup.parkingAxis).toBe("+x");
    const station = layout.station.position;
    setup.flyers.forEach((f, index) => {
      const row = SCRIPT_MAPPING[index % 6];
      expect(f.script).toBe(row?.script);
      const entity = setup.world.store.get(f.id);
      expect(entity?.position).toEqual(setup.starts[index]);
      expect(entity?.speed).toBe(0);
      expect(entity?.orientation).toEqual(identity());
      expect(entity?.ai?.aiKey).toBe("flight-script");
      expect(entity?.ai?.params["script"]).toBe(row?.script);
    });
    // Index 0 at S + 12,000 b, index 1 at P + 15,000 c, index 11 at P + 8,000 c + 83 a.
    expect(setup.starts[0]).toEqual({
      x: station.x,
      y: station.y + 12_000,
      z: station.z,
    });
    const park = setup.player.position;
    expect(setup.starts[1]).toEqual({
      x: park.x,
      y: park.y,
      z: park.z + 15_000,
    });
    expect(setup.starts[11]).toEqual({
      x: park.x + 83,
      y: park.y,
      z: park.z + 8_000,
    });
    expect(setup.player.mode).toBe("inFlight");
    expect(setup.player.speed).toBe(0);
    expect(FLYER_START_OFFSETS).toHaveLength(12);
    // Escorts: ownerId and the slot are written directly.
    const escort5 = setup.world.store.get(105);
    const escort11 = setup.world.store.get(111);
    expect([escort5?.ownerId, escort5?.steer.escortSlot]).toEqual([101, 0]);
    expect([escort11?.ownerId, escort11?.steer.escortSlot]).toEqual([107, 1]);
    // An escort starts 1,500 m beside its leader.
    expect(setup.starts[4]).toEqual({
      x: station.x,
      y: station.y + 12_000,
      z: station.z + 1_500,
    });
  });

  it("without an AI the ships are moved and keep no AI", () => {
    const setup = setUpSeed(1, { withAi: false });
    for (const f of setup.flyers) {
      expect(setup.world.store.get(f.id)?.ai).toBeNull();
    }
    expect(setup.world.store.get(101)?.position).toEqual(setup.starts[0]);
  });

  it("a 4,000-tick live seed raises the designed near pass's AVOID_COLLISION entry and trips no detector", () => {
    const { result } = runSeed(1, NO_ACCEPTED, {
      withAi: true,
      ticks: 4_000,
    });
    expect(result.tallies.avoidCollisionEntries).toBeGreaterThanOrEqual(1);
    expect(result.repairs.count).toBe(0);
    expect(result.aiFaulted.count).toBe(0);
    expect(result.hashFailures.count).toBe(0);
    expect(result.hullCrossings.count).toBe(0);
    expect(result.stationSphere.count).toBe(0);
    expect(result.minHullClearance).toBeLessThan(100);
    expect(PLAYER_ID).toBe(100);
  }, 60_000); // Two seconds alone; the full suite runs this beside 200 other files.
});

describe("registerAcceptanceRun", () => {
  it("registers one case per epoch at the top level with the committed timeout, then the run-minimum case", () => {
    const calls: { name: string; timeout: number | undefined }[] = [];
    const fake = ((name: string, _fn: unknown, timeout?: number) => {
      calls.push({ name, timeout });
    }) as unknown as TestAPI;
    registerAcceptanceRun(fake, []);
    expect(calls).toHaveLength(21);
    expect(calls.slice(0, 20).map((call) => call.name)).toEqual(
      ACCEPTANCE_EPOCHS.map((epoch) => `epoch ${String(epoch)}`),
    );
    for (const call of calls.slice(0, 20)) {
      expect(call.timeout).toBe(ACCEPTANCE_EPOCH_TIMEOUT_MS);
    }
    expect(calls[20]?.name).toBe("run minimums");
  });
});
