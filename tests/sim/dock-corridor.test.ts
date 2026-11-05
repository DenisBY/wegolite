// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Corridor semantics and roll tolerance (DOCK-01, DOCK-02, D-01, D-02, D-03).
 *
 * Two layers are proved here:
 *
 * - **Synthetic boxes** pin every strict inequality one step either side. The
 *   classifier only reads `snapshot.box`, so crafting the box directly is the
 *   clearest way to state "exactly ±ww is not lane".
 * - **Port-frame poses** prove the same rules through the real snapshot path,
 *   the symmetric auto-centre guard, the rotating frame and the computed roll
 *   boundary over the committed Cobra corners.
 *
 * The nose gate is the important one (`T-04-53`): a wings-across pose at any
 * distance with `min.z >= 0` is `outside`, never band, straddle or capture.
 */

import { describe, expect, it } from "vitest";

import {
  apertureHalfExtents,
  captureWeight,
  classifyCorridor,
  dockSnapshot,
  SAFETY_FACTOR,
} from "../../src/sim/dock/corridor.js";
import type { DockSnapshot } from "../../src/sim/dock/corridor.js";
import { DockGeometryError } from "../../src/sim/dock/geometry.js";
import { portFrame } from "../../src/sim/dock/port-frame.js";
import { stepDocking } from "../../src/sim/dock/step.js";
import { initFlightState } from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
import { add, scale, vec } from "../../src/sim/math.js";
import type { Vec3 } from "../../src/sim/math.js";
import {
  laveDockGeometry,
  placeShipInPortFrame,
  rollLimitRadians,
} from "../helpers/dock-pose.js";
import { laveFixture } from "../helpers/lave.js";

const fixture = laveFixture();
const { layout } = fixture;
const geometry = laveDockGeometry();
const { ww, hh } = geometry.corridor;

function syntheticSnapshot(box: { min: Vec3; max: Vec3 }): DockSnapshot {
  return {
    frame: portFrame(layout, 0),
    corners: [],
    box,
    centre: vec(0, 0, 0),
    axes: [vec(1, 0, 0), vec(0, 1, 0), vec(0, 0, 1)],
  };
}

function classifyBox(
  min: Vec3,
  max: Vec3,
): ReturnType<typeof classifyCorridor> {
  return classifyCorridor(syntheticSnapshot({ min, max }), geometry);
}

function stateAt(pose: {
  readonly position: Vec3;
  readonly orientation: FlightState["orientation"];
  readonly speed: number;
}): FlightState {
  const state = initFlightState(layout);
  state.mode = "inFlight";
  state.position = pose.position;
  state.orientation = pose.orientation;
  state.speed = pose.speed;
  return state;
}

function snapshotAt(
  pose: ReturnType<typeof placeShipInPortFrame>,
  stationAngle = 0,
): DockSnapshot {
  return dockSnapshot(layout, stateAt(pose), geometry, stationAngle);
}

const INSIDE = 1e-9;

describe("strict lane boundaries", () => {
  it("does not treat an x edge exactly at ±ww as lane, but one step inside is lane", () => {
    const baseY = { min: -10, max: 10 };
    const z = { min: 500, max: 581 };

    expect(
      classifyBox(vec(-10, baseY.min, z.min), vec(ww, baseY.max, z.max))
        .outcome,
    ).toBe("outside");
    expect(
      classifyBox(
        vec(-10, baseY.min, z.min),
        vec(ww - INSIDE, baseY.max, z.max),
      ).outcome,
    ).toBe("lane");

    expect(
      classifyBox(vec(-ww, baseY.min, z.min), vec(10, baseY.max, z.max))
        .outcome,
    ).toBe("outside");
    expect(
      classifyBox(
        vec(-ww + INSIDE, baseY.min, z.min),
        vec(10, baseY.max, z.max),
      ).outcome,
    ).toBe("lane");
  });

  it("does not treat a y edge exactly at ±hh as lane, but one step inside is lane", () => {
    const baseX = { min: -10, max: 10 };
    const z = { min: 500, max: 581 };

    expect(
      classifyBox(vec(baseX.min, -10, z.min), vec(baseX.max, hh, z.max))
        .outcome,
    ).toBe("outside");
    expect(
      classifyBox(
        vec(baseX.min, -10, z.min),
        vec(baseX.max, hh - INSIDE, z.max),
      ).outcome,
    ).toBe("lane");

    expect(
      classifyBox(vec(baseX.min, -hh, z.min), vec(baseX.max, 10, z.max))
        .outcome,
    ).toBe("outside");
    expect(
      classifyBox(
        vec(baseX.min, -hh + INSIDE, z.min),
        vec(baseX.max, 10, z.max),
      ).outcome,
    ).toBe("lane");
  });

  it("classifies an in-lane pose 500 m in front of the aperture as lane, not outside", () => {
    const pose = placeShipInPortFrame(layout, geometry, {
      nosePastPlane: -500,
      rollFromMatched: 0,
      lateral: 0,
    });
    expect(snapshotAt(pose).box.min.z).toBeGreaterThan(0);
    expect(classifyCorridor(snapshotAt(pose), geometry).outcome).toBe("lane");
  });

  it("only captures once the weighted plane crosses zero", () => {
    const beforeBox = {
      min: vec(-10, -10, -45),
      max: vec(10, 10, 81.3726 - 45),
    };
    const before = classifyBox(beforeBox.min, beforeBox.max);
    expect(before.outcome).toBe("lane");
    expect(before.capture).toBe(false);
    expect(captureWeight(beforeBox)).toBeGreaterThan(0);

    const afterBox = {
      min: vec(-10, -10, -90),
      max: vec(10, 10, 81.3726 - 90),
    };
    const after = classifyBox(afterBox.min, afterBox.max);
    expect(after.outcome).toBe("capture");
    expect(after.capture).toBe(true);
    expect(captureWeight(afterBox)).toBeLessThan(0);
  });
});

describe("safety band and straddle", () => {
  it("does not treat an x edge exactly at ±1.5*ww as band, but one step inside is band", () => {
    const z = { min: -10, max: 71.3726 };
    const boundary = SAFETY_FACTOR * ww;

    expect(
      classifyBox(vec(-boundary, -10, z.min), vec(10, 10, z.max)).outcome,
    ).toBe("outside");
    expect(
      classifyBox(vec(-boundary + INSIDE, -10, z.min), vec(10, 10, z.max))
        .outcome,
    ).toBe("band");

    expect(
      classifyBox(vec(-10, -10, z.min), vec(boundary, 10, z.max)).outcome,
    ).toBe("outside");
    expect(
      classifyBox(vec(-10, -10, z.min), vec(boundary - INSIDE, 10, z.max))
        .outcome,
    ).toBe("band");
  });

  it("requires min.z < 0 strictly: min.z == 0 is outside, min.z = -1e-9 is band", () => {
    const x = { min: 30, max: 60 }; // not lane: max.x > ww, min.x inside the band
    const y = { min: -10, max: 10 };

    const atPlane = classifyBox(
      vec(x.min, y.min, 0),
      vec(x.max, y.max, 81.3726),
    );
    expect(atPlane.outcome).toBe("outside");
    expect(atPlane.deltaX).toBe(0);
    expect(atPlane.deltaY).toBe(0);

    const justInside = classifyBox(
      vec(x.min, y.min, -INSIDE),
      vec(x.max, y.max, 81.3726 - INSIDE),
    );
    expect(justInside.outcome).toBe("band");
    expect(Math.abs(justInside.deltaX)).toBeLessThan(1e-6);
    expect(Math.abs(justInside.deltaY)).toBeLessThan(1e-6);
  });

  it("classifies a wings-across straddle only with min.z < 0; at 500 m out it is outside", () => {
    const y = { min: -10, max: 10 };
    const straddle = classifyBox(vec(-60, y.min, -10), vec(60, y.max, 71.3726));
    expect(straddle.outcome).toBe("straddle");

    const inFront = classifyBox(vec(-60, y.min, 500), vec(60, y.max, 581));
    expect(inFront.outcome).toBe("outside");

    // The y opposite-edge predicate behaves the same way.
    const yStraddle = classifyBox(vec(-10, -130, -10), vec(10, 130, 71.3726));
    expect(yStraddle.outcome).toBe("straddle");
  });

  it("produces no event for a 500 m wings-across pose", () => {
    const pose = placeShipInPortFrame(layout, geometry, {
      nosePastPlane: -500,
      rollFromMatched: Math.PI / 2,
      lateral: 0,
    });
    const state = stateAt(pose);
    const events = stepDocking(state, layout, geometry);
    expect(events).toEqual([]);
    expect(state.mode).toBe("inFlight");
    expect(state.scrapeTicks).toBe(0);
  });

  it("keeps the y guard symmetric: a y protrusion still corrects where Oolite's bug would not", () => {
    const z = { min: -10, max: 71.3726 };

    // y fully inside the lane: no y correction at all.
    const insideY = classifyBox(vec(-10, -10, z.min), vec(10, 10, z.max));
    expect(insideY.deltaY).toBe(0);

    // max.y above hh but min.y above -hh: Oolite's `max.y > hh && min.y > -hh`
    // would zero this; the symmetric guard must keep the correction.
    const upperProtrusion = classifyBox(
      vec(-10, -4, z.min),
      vec(10, hh + 5, z.max),
    );
    expect(upperProtrusion.outcome).toBe("band");
    expect(upperProtrusion.deltaY).toBeGreaterThan(0);
  });
});

describe("auto-centring applies the port-frame delta", () => {
  it("shifts a +x band ship toward the centre along -i and emits one scrape", () => {
    const pose = placeShipInPortFrame(layout, geometry, {
      nosePastPlane: 10,
      rollFromMatched: 0,
      lateral: 35,
      forwardSpeed: 0,
    });
    const state = stateAt(pose);
    const snapshot = dockSnapshot(layout, state, geometry, state.stationAngle);
    const classification = classifyCorridor(snapshot, geometry);
    expect(classification.outcome).toBe("band");
    expect(classification.deltaX).toBeGreaterThan(0);
    expect(classification.deltaY).toBe(0);

    const before = state.position;
    const events = stepDocking(state, layout, geometry);
    expect(state.position).toEqual(
      add(before, scale(snapshot.frame.i, -classification.deltaX)),
    );
    expect(state.scrapeTicks).toBe(1);
    expect(events).toEqual([{ kind: "scrape" }]);
  });
});

describe("disarmed tunnel-end clamp", () => {
  it("clamps a disarmed past-end ship along the port-frame k with no response", () => {
    const stationAngle = Math.PI / 6;
    const pose = placeShipInPortFrame(layout, geometry, {
      nosePastPlane: geometry.port.depth + 50,
      rollFromMatched: 0,
      lateral: 0,
      stationAngle,
    });
    const state = stateAt(pose);
    state.dockArmed = false;
    state.stationAngle = stationAngle;

    const snapshot = dockSnapshot(layout, state, geometry, state.stationAngle);
    // Precondition: the near face is past the 250 m tunnel end (`port.depth`).
    expect(snapshot.box.min.z).toBeLessThan(-geometry.port.depth);
    const shift = -geometry.port.depth - snapshot.box.min.z;

    const beforePosition = state.position;
    const beforeBounceCount = state.bounceCount;
    const beforeDockCount = state.dockCount;
    const beforeScrapeTicks = state.scrapeTicks;

    const events = stepDocking(state, layout, geometry);

    // The unstick is positional only and follows the port frame's k, not world
    // +Z: a rotated station must not push the ship in the wrong direction.
    expect(state.position).toEqual(
      add(beforePosition, scale(snapshot.frame.k, shift)),
    );
    expect(events).toEqual([]);
    expect(state.mode).toBe("inFlight");
    expect(state.dockArmed).toBe(false);
    expect(state.bounceCount).toBe(beforeBounceCount);
    expect(state.dockCount).toBe(beforeDockCount);
    expect(state.scrapeTicks).toBe(beforeScrapeTicks);

    const after = dockSnapshot(layout, state, geometry, state.stationAngle);
    expect(after.box.min.z).toBeCloseTo(-geometry.port.depth, 6);
  });
});

describe("finite-pose guard", () => {
  it("classifies a non-finite pose outside and leaves the state untouched", () => {
    const pose = placeShipInPortFrame(layout, geometry, {
      nosePastPlane: 90,
      rollFromMatched: 0,
      lateral: 0,
    });
    const state = stateAt(pose);
    state.dockArmed = false;
    state.position = vec(Number.NaN, 0, 0);
    const beforePosition = state.position;
    const beforeTick = state.tick;

    const snapshot = dockSnapshot(layout, state, geometry, state.stationAngle);
    expect(classifyCorridor(snapshot, geometry).outcome).toBe("outside");

    const events = stepDocking(state, layout, geometry);
    expect(events).toEqual([]);
    expect(state.position).toEqual(beforePosition);
    expect(state.dockArmed).toBe(false);
    expect(state.tick).toBe(beforeTick);
  });
});

describe("the corridor follows the station roll", () => {
  it("is identical at stationAngle 0, pi/4, pi/2 and pi and keeps all four strict inequalities", () => {
    const angles = [0, Math.PI / 4, Math.PI / 2, Math.PI];
    const reference = (() => {
      const pose = placeShipInPortFrame(layout, geometry, {
        nosePastPlane: -500,
        rollFromMatched: 0,
        lateral: 12,
        stationAngle: 0,
      });
      return snapshotAt(pose, 0);
    })();

    for (const angle of angles) {
      const pose = placeShipInPortFrame(layout, geometry, {
        nosePastPlane: -500,
        rollFromMatched: 0,
        lateral: 12,
        stationAngle: angle,
      });
      const snapshot = snapshotAt(pose, angle);

      expect(snapshot.box.min.x).toBeCloseTo(reference.box.min.x, 9);
      expect(snapshot.box.max.x).toBeCloseTo(reference.box.max.x, 9);
      expect(snapshot.box.min.y).toBeCloseTo(reference.box.min.y, 9);
      expect(snapshot.box.max.y).toBeCloseTo(reference.box.max.y, 9);
      expect(snapshot.box.min.z).toBeCloseTo(reference.box.min.z, 9);
      expect(snapshot.box.max.z).toBeCloseTo(reference.box.max.z, 9);

      expect(snapshot.box.max.x < ww).toBe(true);
      expect(snapshot.box.min.x > -ww).toBe(true);
      expect(snapshot.box.max.y < hh).toBe(true);
      expect(snapshot.box.min.y > -hh).toBe(true);
      expect(classifyCorridor(snapshot, geometry).outcome).toBe("lane");
    }
  });
});

describe("roll boundary over the committed Cobra corners", () => {
  it("derives the crossing, accepts 30 degrees and rejects 35 degrees", () => {
    const limit = rollLimitRadians(geometry);
    const limitDegrees = (limit * 180) / Math.PI;
    expect(limitDegrees).toBeGreaterThan(30);
    expect(limitDegrees).toBeLessThan(35);
    expect(Math.abs(limitDegrees - 31.296)).toBeLessThan(0.01);

    const pose30 = placeShipInPortFrame(layout, geometry, {
      nosePastPlane: -500,
      rollFromMatched: (30 * Math.PI) / 180,
    });
    const box30 = snapshotAt(pose30).box;
    expect(box30.max.x < ww).toBe(true);
    expect(box30.min.x > -ww).toBe(true);
    expect(box30.max.y < hh).toBe(true);
    expect(box30.min.y > -hh).toBe(true);

    const pose35 = placeShipInPortFrame(layout, geometry, {
      nosePastPlane: -500,
      rollFromMatched: (35 * Math.PI) / 180,
    });
    const snapshot35 = snapshotAt(pose35);
    const lane35 =
      snapshot35.box.max.x < ww &&
      snapshot35.box.min.x > -ww &&
      snapshot35.box.max.y < hh &&
      snapshot35.box.min.y > -hh;
    expect(lane35).toBe(false);
    expect(classifyCorridor(snapshot35, geometry).outcome).not.toBe("lane");
  });
});

describe("aperture derivation is bounded and agrees with the generated corridor", () => {
  it("reproduces the emitted corridor from the committed Cobra extents", () => {
    const shipExtents = {
      width: geometry.ship.max.x - geometry.ship.min.x,
      height: geometry.ship.max.y - geometry.ship.min.y,
    };
    expect(apertureHalfExtents(geometry.port, shipExtents)).toEqual({
      ww: geometry.corridor.ww,
      hh: geometry.corridor.hh,
    });
  });

  it("terminates for a Number.MIN_VALUE width by throwing instead of looping", () => {
    expect(() =>
      apertureHalfExtents(
        { width: Number.MIN_VALUE, height: 1 },
        { width: 1, height: 1 },
      ),
    ).toThrow(DockGeometryError);
  }, 2000);

  it("rejects a non-finite derived value", () => {
    expect(() =>
      apertureHalfExtents(
        { width: Number.POSITIVE_INFINITY, height: 1 },
        { width: 1, height: 1 },
      ),
    ).toThrow(DockGeometryError);
  });
});
