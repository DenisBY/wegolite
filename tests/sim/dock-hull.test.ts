// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The hull SAT and the launch-departure negative (DOCK-03, DOCK-06, T-04-54,
 * T-04-55).
 *
 * The packed contact box is a conservative 1000 x 1000 x ~1034 proxy in port
 * coordinates, so an approach 200 m in front of the aperture must report no
 * contact even when it is outside the safety band and the SAT is exercised.
 * The edge case is built directly: a ship OBB rotated 45 degrees about the
 * port's y-axis crosses the box corner with *no* ship corner inside it, which a
 * corner-inside test would miss.
 */

import { describe, expect, it } from "vitest";

import { STATION_KINDS } from "../../src/content/stations.js";
import type { StationKind } from "../../src/content/stations.js";
import { classifyCorridor, dockSnapshot } from "../../src/sim/dock/corridor.js";
import type { DockSnapshot } from "../../src/sim/dock/corridor.js";
import { hullContact, obbsIntersect } from "../../src/sim/dock/hull.js";
import { stepDocking } from "../../src/sim/dock/step.js";
import type { PortFrame } from "../../src/sim/dock/port-frame.js";
import { ZERO_INTENT } from "../../src/sim/flight/controller.js";
import { initFlightState } from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
import { sanitizeFlightState } from "../../src/sim/flight/sanitize.js";
import { stepFlight } from "../../src/sim/flight/step.js";
import { add, length, scale, vec } from "../../src/sim/math.js";
import type { Vec3 } from "../../src/sim/math.js";
import { DT } from "../../src/sim/time.js";
import { deriveSystemLayout } from "../../src/sim/world/layout.js";
import type { SystemLayout } from "../../src/sim/world/layout.js";
import {
  laveDockGeometry,
  placeShipInPortFrame,
  type PortPose,
} from "../helpers/dock-pose.js";
import { laveFixture } from "../helpers/lave.js";
import { dockGeometryOf, stationSpecOf } from "../helpers/stations.js";

const fixture = laveFixture();
const { layout, config } = fixture;
const geometry = laveDockGeometry();

const FRAME: PortFrame = {
  origin: vec(0, 0, 0),
  i: vec(1, 0, 0),
  j: vec(0, 1, 0),
  k: vec(0, 0, 1),
};

/** A hand-built snapshot for a chosen OBB, used only by the SAT unit cases. */
function snapshotFromObb(
  centre: Vec3,
  axes: readonly [Vec3, Vec3, Vec3],
  half: Vec3,
): DockSnapshot {
  const corners: Vec3[] = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const corner = add(
          centre,
          add(
            scale(axes[0], sx * half.x),
            add(scale(axes[1], sy * half.y), scale(axes[2], sz * half.z)),
          ),
        );
        corners.push(corner);
        minX = Math.min(minX, corner.x);
        minY = Math.min(minY, corner.y);
        minZ = Math.min(minZ, corner.z);
        maxX = Math.max(maxX, corner.x);
        maxY = Math.max(maxY, corner.y);
        maxZ = Math.max(maxZ, corner.z);
      }
    }
  }
  return {
    frame: FRAME,
    corners,
    box: { min: vec(minX, minY, minZ), max: vec(maxX, maxY, maxZ) },
    centre,
    axes,
  };
}

function inFlightAt(pose: PortPose): FlightState {
  const state = initFlightState(layout);
  state.mode = "inFlight";
  state.position = pose.position;
  state.orientation = pose.orientation;
  state.speed = pose.speed;
  return state;
}

function step(state: FlightState): ReturnType<typeof stepFlight> {
  return stepFlight(state, layout, config, ZERO_INTENT, [], DT, {
    dock: geometry,
  });
}

function snapshotOf(
  state: FlightState,
  stationAngle = state.stationAngle,
): DockSnapshot {
  return dockSnapshot(layout, state, geometry, stationAngle);
}

function insidePoint(point: Vec3): boolean {
  const box = geometry.contactPort;
  return (
    point.x > -box.halfX &&
    point.x < box.halfX &&
    point.y > -box.halfY &&
    point.y < box.halfY &&
    point.z > box.zMin &&
    point.z < box.zMax
  );
}

describe("hull SAT against the contact proxy", () => {
  it("finds an edge intersection even when no ship corner is inside the box", () => {
    const angle = Math.PI / 4;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const axes: [Vec3, Vec3, Vec3] = [
      vec(c, 0, -s),
      vec(0, 1, 0),
      vec(s, 0, c),
    ];
    const snapshot = snapshotFromObb(vec(530, 0, 24), axes, vec(65, 35, 44));

    // The OBB crosses the box's +x/+z corner: every corner is outside, yet the
    // boxes overlap along the crossing edge.
    for (const corner of snapshot.corners) {
      expect(insidePoint(corner)).toBe(false);
    }

    const contact = hullContact(snapshot, geometry.contactPort);
    expect(contact).not.toBeNull();
    expect(obbsIntersect(snapshot, geometry.contactPort)).toBe(true);
    expect(contact?.depth).toBeGreaterThan(0);
    expect(length(contact?.normalWorld ?? vec(0, 0, 0))).toBeCloseTo(1, 9);
  });

  it("reports no contact for a ship 200 m in front of the aperture, outside the band", () => {
    const state = inFlightAt(
      placeShipInPortFrame(layout, geometry, {
        nosePastPlane: -200,
        lateral: 200,
        rollFromMatched: 0,
      }),
    );
    const snapshot = snapshotOf(state, 0);

    expect(classifyCorridor(snapshot, geometry).outcome).toBe("outside");
    expect(hullContact(snapshot, geometry.contactPort)).toBeNull();
    expect(obbsIntersect(snapshot, geometry.contactPort)).toBe(false);
  });

  it("returns a face normal, depth and dominant axis for a simple +x contact", () => {
    const snapshot = snapshotFromObb(
      vec(550, 0, 0),
      [vec(1, 0, 0), vec(0, 1, 0), vec(0, 0, 1)],
      vec(65, 35, 44),
    );

    const contact = hullContact(snapshot, geometry.contactPort);
    expect(contact).not.toBeNull();
    expect(contact?.axis).toBe("x");
    expect(contact?.normalWorld.x).toBeCloseTo(1, 9);
    expect(contact?.depth).toBeCloseTo(15, 6);
  });

  it("breaks an exact x/y overlap tie toward the earliest axis", () => {
    // x: 500 + 65 - 100 = 465; y: 500 + 35 - 70 = 465. The fixed order must
    // choose x, so two engines never disagree on the push direction.
    const snapshot = snapshotFromObb(
      vec(100, 70, -483.1),
      [vec(1, 0, 0), vec(0, 1, 0), vec(0, 0, 1)],
      vec(65, 35, 44),
    );

    const contact = hullContact(snapshot, geometry.contactPort);
    expect(contact).not.toBeNull();
    expect(contact?.axis).toBe("x");
    expect(contact?.depth).toBeCloseTo(465, 6);
  });

  it("resolves a ship centre inside the proxy and separates it in one step", () => {
    // The centre is inside the box but the footprint is far outside the
    // corridor, so the classifier is `outside` and the hull branch owns it.
    const state = inFlightAt(
      placeShipInPortFrame(layout, geometry, {
        nosePastPlane: 300,
        lateral: 300,
        rollFromMatched: 0,
      }),
    );
    const before = snapshotOf(state);
    expect(classifyCorridor(before, geometry).outcome).toBe("outside");
    expect(insidePoint(before.centre)).toBe(true);
    expect(obbsIntersect(before, geometry.contactPort)).toBe(true);

    const events = step(state);

    expect(events.filter((event) => event.kind === "bounce")).toHaveLength(1);
    expect(state.mode).toBe("inFlight");
    expect(state.bounceCount).toBe(1);
    expect(obbsIntersect(snapshotOf(state), geometry.contactPort)).toBe(false);
  });

  it("keeps a natural launch departure response-free", () => {
    const state = initFlightState(layout);
    stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT, {
      dock: geometry,
    });
    expect(state.mode).toBe("launching");

    let sawBounce = false;
    for (let tick = 0; tick < 480; tick += 1) {
      const events = step(state);
      if (events.some((event) => event.kind === "bounce")) sawBounce = true;
    }

    expect(sawBounce).toBe(false);
    expect(state.bounceCount).toBe(0);
    expect(state.mode).toBe("inFlight");
    expect(state.dockArmed).toBe(true);
  });

  it("emits no event for a wings-across pose 500 m in front of the aperture", () => {
    const state = inFlightAt(
      placeShipInPortFrame(layout, geometry, {
        nosePastPlane: -500,
        rollFromMatched: Math.PI / 2,
      }),
    );
    state.dockArmed = true;

    const events = stepDocking(state, layout, geometry, DT);

    expect(events).toEqual([]);
    expect(state.bounceCount).toBe(0);
    expect(state.mode).toBe("inFlight");
  });
});

describe("orientation invariance through a bounce", () => {
  it("emits exactly one straddle bounce and leaves the orientation deep-equal", () => {
    const state = inFlightAt(
      placeShipInPortFrame(layout, geometry, {
        nosePastPlane: 10,
        rollFromMatched: Math.PI / 2,
        lateral: 0,
        forwardSpeed: 100,
      }),
    );
    state.dockArmed = true;

    const beforeOrientation = { ...state.orientation };
    const snapshot = snapshotOf(state, state.stationAngle);
    expect(classifyCorridor(snapshot, geometry).outcome).toBe("straddle");

    const events = stepDocking(state, layout, geometry, DT);

    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("bounce");
    expect(events[0]).toMatchObject({ kind: "bounce", cause: "straddle" });
    expect(state.orientation).toEqual(beforeOrientation);
    expect(state.mode).toBe("inFlight");
    expect(state.bounceCount).toBe(1);
  });

  it("emits exactly one hull bounce and leaves the orientation deep-equal", () => {
    const state = inFlightAt(
      placeShipInPortFrame(layout, geometry, {
        nosePastPlane: 300,
        lateral: 300,
        rollFromMatched: 0,
      }),
    );
    state.dockArmed = true;

    const beforeOrientation = { ...state.orientation };
    const snapshot = snapshotOf(state, state.stationAngle);
    expect(classifyCorridor(snapshot, geometry).outcome).toBe("outside");
    expect(obbsIntersect(snapshot, geometry.contactPort)).toBe(true);

    const events = stepDocking(state, layout, geometry, DT);

    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("bounce");
    expect(events[0]).toMatchObject({ kind: "bounce", cause: "hull" });
    expect(state.orientation).toEqual(beforeOrientation);
    expect(state.mode).toBe("inFlight");
    expect(state.bounceCount).toBe(1);
  });
});

/**
 * The player's dock hull contact per station kind (Phase 22.1, WORLD-20, owner
 * decision D-B). Each kind's proxy is the contact box of its own dock record
 * (`dockGeometryOf`), never a typed number. These cases prove the proxy is
 * used: that a ship pressed into it bounces and one just outside it does not.
 * They do not prove the box fits the visible hull; the E-135 todo paragraph
 * "Contact proxy per station kind (Phase 22.1)" records what the box costs per
 * kind (Phase 22.2 decides whether it stays a box).
 */
describe("hull contact per station kind (Phase 22.1, D-B)", () => {
  function kindFixture(kind: StationKind) {
    const own = deriveSystemLayout(
      { ...fixture.system, station: kind },
      stationSpecOf(kind),
    );
    const dock = dockGeometryOf(kind);
    const aligned = dock.port.width < dock.port.height ? 0 : Math.PI / 2;
    // Half a proxy half-width off the axis: outside every kind's aperture.
    const lateral = dock.contactPort.halfX / 2;
    return { own, dock, aligned, lateral };
  }

  function armedAt(own: SystemLayout, pose: PortPose): FlightState {
    const state = initFlightState(own);
    state.mode = "inFlight";
    state.position = pose.position;
    state.orientation = pose.orientation;
    state.speed = pose.speed;
    state.dockArmed = true;
    return state;
  }

  it.each(STATION_KINDS)(
    "gives a ship box pressed into the %s proxy outside the aperture a hull contact and a hull bounce",
    (kind) => {
      const { own, dock, aligned, lateral } = kindFixture(kind);
      const state = armedAt(
        own,
        placeShipInPortFrame(own, dock, {
          nosePastPlane: 300,
          lateral,
          rollFromMatched: aligned,
        }),
      );
      const snapshot = dockSnapshot(own, state, dock, state.stationAngle);
      expect(classifyCorridor(snapshot, dock).outcome).toBe("outside");

      const contact = hullContact(snapshot, dock.contactPort);
      expect(contact).not.toBeNull();
      expect(contact?.depth).toBeGreaterThan(0);
      expect(length(contact?.normalWorld ?? vec(0, 0, 0))).toBeCloseTo(1, 9);

      const events = stepDocking(state, own, dock, DT);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ kind: "bounce", cause: "hull" });
      expect(state.mode).toBe("inFlight");
      expect(state.bounceCount).toBe(1);
    },
  );

  it.each(STATION_KINDS)(
    "gives the same box just past the %s proxy's outward face no contact",
    (kind) => {
      const { own, dock, aligned, lateral } = kindFixture(kind);
      // box.min.z = nose - 0, so a nose one metre past zMax is clear of it.
      const state = armedAt(
        own,
        placeShipInPortFrame(own, dock, {
          nosePastPlane: -(dock.contactPort.zMax + 1),
          lateral,
          rollFromMatched: aligned,
        }),
      );
      const snapshot = dockSnapshot(own, state, dock, state.stationAngle);
      expect(snapshot.box.min.z).toBeCloseTo(dock.contactPort.zMax + 1, 6);

      expect(hullContact(snapshot, dock.contactPort)).toBeNull();
      expect(obbsIntersect(snapshot, dock.contactPort)).toBe(false);
      expect(stepDocking(state, own, dock, DT)).toEqual([]);
      expect(state.bounceCount).toBe(0);
    },
  );

  it("counts the Dodecahedron's protruding faceplate as hull: a box touching it is a bounce, not a dock", () => {
    const { own, dock, aligned, lateral } = kindFixture("dodecahedron");
    // The faceplate stands about 25.7 m out of the mouth plane.
    expect(dock.contactPort.zMax).toBeCloseTo(25.7, 1);
    const state = armedAt(
      own,
      placeShipInPortFrame(own, dock, {
        nosePastPlane: -(dock.contactPort.zMax - 5),
        lateral,
        rollFromMatched: aligned,
      }),
    );

    const events = stepDocking(state, own, dock, DT);

    expect(events.map((event) => event.kind)).toEqual(["bounce"]);
    expect(events[0]).toMatchObject({ cause: "hull" });
    expect(state.mode).toBe("inFlight");
    expect(state.dockCount).toBe(0);
  });
});

describe("sanitize and hook poisoning", () => {
  it("clamps a 1e308 speed before it can integrate the position to Infinity", () => {
    const state = initFlightState(layout);
    state.mode = "inFlight";
    state.speed = 1e308;

    step(state);

    expect(Number.isFinite(state.position.x)).toBe(true);
    expect(Number.isFinite(state.position.y)).toBe(true);
    expect(Number.isFinite(state.position.z)).toBe(true);
    expect(state.speed).toBeLessThanOrEqual(config.maxSpeed * 1024);
    expect(state.repairCount).toBe(1);
  });

  it("repairs a non-finite pose and impulse deterministically", () => {
    const state = initFlightState(layout);
    state.mode = "inFlight";
    state.position = vec(Number.NaN, 0, 0);
    state.impulse = vec(Number.POSITIVE_INFINITY, 0, 0);

    expect(sanitizeFlightState(state, layout, config)).toBe(true);
    expect(state.impulse).toEqual(vec(0, 0, 0));
    expect(Number.isFinite(state.position.x)).toBe(true);
    expect(state.repairCount).toBe(1);

    step(state);
    expect(Number.isFinite(state.position.x)).toBe(true);
    expect(state.mode).toBe("inFlight");
  });
});
