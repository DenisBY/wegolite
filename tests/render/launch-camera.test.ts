// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The cockpit cameras and the launch view from inside the dock slot (D-10,
 * CBT-04; owner decisions 2026-11-18: option 1, quick 261118-l26, and the
 * pre-roll, quick 261118-os8).
 *
 * The camera pose is decided here, in Node, not by a playtest: a cockpit offset
 * with the wrong sign, a view that starts outside the slot, a jump at handover
 * or a Coriolis number baked into the module all fail a numeric assertion. The
 * slot path is the pre-roll pose, then the real simulation launch, with the
 * real Lave layout, Cobra config and committed dock geometry. The browser spec checks only the
 * timeline, the hidden hull and HUD, because a pixel-free browser check cannot
 * tell a camera in the slot from one at the mouth.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  COCKPIT_OFFSET,
  computeCockpitCamera,
  computeSlotLaunchCamera,
  computeViewCamera,
  LAUNCH_PRE_ROLL_DURATION,
  LAUNCH_VIEW_DURATION,
  launchViewAxial,
  launchViewElapsed,
  launchViewStationAngle,
  preRollPose,
  preRollViewTime,
  VIEW_OFFSETS,
} from "../../src/render/launch-camera.js";
import type { CameraPose } from "../../src/render/launch-camera.js";
import { CAMERA_NEAR } from "../../src/render/system-scene.js";
import { portFrame } from "../../src/sim/dock/port-frame.js";
import { ZERO_INTENT } from "../../src/sim/flight/controller.js";
import {
  LAUNCH_DURATION,
  launchOrientation,
} from "../../src/sim/flight/launch.js";
import {
  dockMouthPosition,
  initFlightState,
} from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
import { stepFlight } from "../../src/sim/flight/step.js";
import {
  add,
  axisAngle,
  conjugate,
  dot,
  identity,
  length,
  mul,
  normalize as normalizeQuat,
  rotate,
  scale,
  sub,
  vec,
} from "../../src/sim/math.js";
import type { Quat, Vec3 } from "../../src/sim/math.js";
import { DT } from "../../src/sim/time.js";
import { laserFrame } from "../../src/sim/combat/aim.js";
import { FACINGS } from "../../src/sim/combat/mounts.js";
import { laveDockGeometry } from "../helpers/dock-pose.js";
import { laveFixture } from "../helpers/lave.js";

const { layout, config } = laveFixture();
const port = laveDockGeometry().port;

function expectVecClose(actual: Vec3, expected: Vec3, digits: number): void {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
  expect(actual.z).toBeCloseTo(expected.z, digits);
}

function quatLength(q: Quat): number {
  return Math.hypot(q.w, q.x, q.y, q.z);
}

const launchCameraSource = readFileSync(
  new URL("../../src/render/launch-camera.ts", import.meta.url),
  "utf8",
);

/** Drop comment-only lines so documentation cannot satisfy an assertion. */
function stripComments(source: string): string {
  return source
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n");
}

describe("cockpit camera", () => {
  it("adds the Oolite view offset and keeps the ship orientation", () => {
    const position = vec(1, 2, 3);
    const pose = computeCockpitCamera(position, identity());

    expectVecClose(pose.position, add(position, COCKPIT_OFFSET), 12);
    expect(pose.position.y - position.y).toBeCloseTo(7.25, 12);
    expect(pose.position.z - position.z).toBeCloseTo(-31, 12);
    expect(pose.quaternion).toEqual(identity());
  });

  it("rotates the offset with a 90 degree yaw", () => {
    const position = vec(10, 20, 30);
    const orientation = axisAngle(0, 1, 0, Math.PI / 2);
    const pose = computeCockpitCamera(position, orientation);

    expectVecClose(
      pose.position,
      add(position, rotate(orientation, COCKPIT_OFFSET)),
      12,
    );
    expect(pose.quaternion).toEqual(orientation);
    // The offset must rotate, not stay in world axes.
    expect(pose.position.x - position.x).not.toBeCloseTo(0, 6);
  });
});

describe("view cameras (CBT-04, A1)", () => {
  /** A pose with every axis distinct, so a swapped axis cannot hide. */
  const orientation = normalizeQuat(
    mul(
      axisAngle(0, 1, 0, 0.7),
      mul(axisAngle(1, 0, 0, -0.4), axisAngle(0, 0, 1, 0.3)),
    ),
  );
  const position = vec(1_000, -250, 4_000);
  const shipForward = rotate(orientation, vec(0, 0, -1));
  const shipRight = rotate(orientation, vec(1, 0, 0));
  const shipUp = rotate(orientation, vec(0, 1, 0));

  function cameraForward(view: (typeof FACINGS)[number]): Vec3 {
    return rotate(
      computeViewCamera(position, orientation, view).quaternion,
      vec(0, 0, -1),
    );
  }
  function cameraUp(view: (typeof FACINGS)[number]): Vec3 {
    return rotate(
      computeViewCamera(position, orientation, view).quaternion,
      vec(0, 1, 0),
    );
  }

  it("looks along the ship forward for fore and the opposite way for aft", () => {
    expectVecClose(cameraForward("fore"), shipForward, 12);
    expectVecClose(cameraForward("aft"), scale(shipForward, -1), 12);
  });

  it("looks toward the ship's left for port and its right for starboard", () => {
    expectVecClose(cameraForward("port"), scale(shipRight, -1), 12);
    expectVecClose(cameraForward("starboard"), shipRight, 12);
  });

  it("keeps the ship's up axis for every view", () => {
    for (const view of FACINGS) expectVecClose(cameraUp(view), shipUp, 12);
  });

  it("looks where the laser on the same facing fires", () => {
    for (const view of FACINGS) {
      expectVecClose(
        cameraForward(view),
        laserFrame(orientation, view).forward,
        12,
      );
    }
  });

  it("returns a unit quaternion for every view", () => {
    for (const view of FACINGS) {
      expect(
        quatLength(computeViewCamera(position, orientation, view).quaternion),
      ).toBeCloseTo(1, 12);
    }
  });

  it("makes the fore view exactly the cockpit camera", () => {
    const shake = vec(0.1, -0.2, 0.3);
    expect(computeViewCamera(position, orientation, "fore")).toEqual(
      computeCockpitCamera(position, orientation),
    );
    expect(computeViewCamera(position, orientation, "fore", shake)).toEqual(
      computeCockpitCamera(position, orientation, shake),
    );
  });

  it("places the camera at the rotated view offset plus the shake", () => {
    const shake = vec(0.5, 0, -0.5);
    for (const view of FACINGS) {
      const pose = computeViewCamera(position, orientation, view, shake);
      expectVecClose(
        pose.position,
        add(add(position, rotate(orientation, VIEW_OFFSETS[view])), shake),
        9,
      );
    }
  });

  it("derives each offset from the compiled view_position_* with z negated", () => {
    const plist = readFileSync(
      new URL(
        "../../third_party/oolite/Config/shipdata.plist",
        import.meta.url,
      ),
      "utf8",
    );
    // The Cobra Mk III block: the first view_position_* after its model line.
    const cobra = plist.slice(plist.indexOf('model = "oolite_cobra3.dat"'));
    const read = (key: string): Vec3 => {
      const match = new RegExp(`${key}\\s*=\\s*"([^"]+)"`).exec(cobra);
      if (match?.[1] === undefined) throw new Error(`missing ${key}`);
      const [x, y, z] = match[1].trim().split(/\s+/).map(Number);
      return vec(x ?? Number.NaN, y ?? Number.NaN, -(z ?? Number.NaN));
    };
    expectVecClose(VIEW_OFFSETS.fore, read("view_position_forward"), 12);
    expectVecClose(VIEW_OFFSETS.aft, read("view_position_aft"), 12);
    expectVecClose(VIEW_OFFSETS.port, read("view_position_port"), 12);
    expectVecClose(VIEW_OFFSETS.starboard, read("view_position_starboard"), 12);
    expectVecClose(VIEW_OFFSETS.fore, COCKPIT_OFFSET, 12);
  });
});

describe("determinism", () => {
  it("contains no wall clock and no unseeded randomness", () => {
    expect(launchCameraSource.length).toBeGreaterThan(1_000);
    expect(launchCameraSource).not.toMatch(/Math\.random/);
    expect(launchCameraSource).not.toMatch(/\bperformance\b/);
    expect(launchCameraSource).not.toMatch(/\bDate\.now\b|\bnew Date\b/);
  });
});

describe("launch view from inside the dock slot (quick 261118-l26, 261118-os8)", () => {
  const geometry = laveDockGeometry();
  const mouth = dockMouthPosition(layout);
  const axis = layout.stationToPlanet;
  const speed = config.launchSpeed;
  const lead = -VIEW_OFFSETS.fore.z;
  /** Metres past the mouth along the slot axis: negative is inside the slot. */
  const signedDepth = (point: Vec3): number => dot(sub(point, mouth), axis);
  /** Metres from the slot's centre line. */
  const axisDistance = (point: Vec3): number => {
    const relative = sub(point, mouth);
    return length(sub(relative, scale(axis, dot(relative, axis))));
  };
  /**
   * The furthest one fixed step may move the camera: the curve's peak speed
   * stays under twice the launch speed with this data (m < 2), plus 1 % for
   * the roll of the cockpit offset.
   */
  const stepBound = 1.01 * 2 * speed * DT;

  function step(state: FlightState, launch = false): void {
    stepFlight(
      state,
      layout,
      config,
      ZERO_INTENT,
      launch ? [{ kind: "launch" }] : [],
      DT,
      { dock: geometry },
    );
  }

  /** The launch camera of the pre-roll at view time `tau`. */
  function preRollCamera(tau: number): CameraPose {
    const pose = preRollPose(layout, geometry, tau);
    return computeSlotLaunchCamera(
      layout,
      port.depth,
      speed,
      pose.position,
      pose.orientation,
      tau,
    );
  }

  /** The launch camera of a launching state drawn at alpha 1. */
  function launchCamera(state: FlightState): CameraPose {
    return computeSlotLaunchCamera(
      layout,
      port.depth,
      speed,
      state.position,
      state.orientation,
      LAUNCH_PRE_ROLL_DURATION + launchViewElapsed(state.launchElapsed, 1),
    );
  }

  interface ViewFrame {
    readonly tau: number;
    readonly camera: CameraPose;
    /** The fore cockpit pose of the drawn ship pose. */
    readonly cockpit: CameraPose;
  }

  /**
   * The whole view at alpha 1: every pre-roll step (180 of them, from the
   * press), then every launching step of the real sim launch, then the
   * in-flight cockpit at handover.
   */
  function viewRun(): {
    readonly preRoll: readonly ViewFrame[];
    readonly launch: readonly ViewFrame[];
    readonly handover: CameraPose;
    readonly handoverState: FlightState;
  } {
    const preRoll: ViewFrame[] = [];
    const steps = Math.round(LAUNCH_PRE_ROLL_DURATION / DT);
    for (let index = 0; index < steps; index += 1) {
      const tau = preRollViewTime(index * DT, 1);
      const pose = preRollPose(layout, geometry, tau);
      preRoll.push({
        tau,
        camera: preRollCamera(tau),
        cockpit: computeCockpitCamera(pose.position, pose.orientation),
      });
    }
    const state = initFlightState(layout);
    step(state, true);
    const launch: ViewFrame[] = [];
    while (state.mode === "launching" && launch.length < 1_000) {
      launch.push({
        tau:
          LAUNCH_PRE_ROLL_DURATION + launchViewElapsed(state.launchElapsed, 1),
        camera: launchCamera(state),
        cockpit: computeCockpitCamera(state.position, state.orientation),
      });
      step(state);
    }
    expect(state.mode).toBe("inFlight");
    return {
      preRoll,
      launch,
      handover: computeCockpitCamera(state.position, state.orientation),
      handoverState: state,
    };
  }

  it("runs the curve from the full slot depth at rest to the cockpit at handover, never backwards", () => {
    expect(LAUNCH_VIEW_DURATION).toBe(
      LAUNCH_PRE_ROLL_DURATION + LAUNCH_DURATION,
    );
    expect(Math.abs(launchViewAxial(port.depth, speed, 0) + port.depth)).toBe(
      0,
    );
    expect(
      Math.abs(
        launchViewAxial(port.depth, speed, LAUNCH_VIEW_DURATION) -
          (speed * LAUNCH_DURATION + lead),
      ),
    ).toBeLessThan(1e-9);
    // At rest at the start: the first step moves less than a millimetre.
    expect(
      launchViewAxial(port.depth, speed, DT) -
        launchViewAxial(port.depth, speed, 0),
    ).toBeLessThan(1e-3);
    let previous = Number.NEGATIVE_INFINITY;
    const steps = Math.round(LAUNCH_VIEW_DURATION / DT);
    for (let index = 0; index <= steps; index += 1) {
      const axial = launchViewAxial(port.depth, speed, index * DT);
      expect(axial).toBeGreaterThanOrEqual(previous);
      previous = axial;
    }
    // The owner's 2 to 2.5 s inside the slot (quick 261118-os8).
    expect(launchViewAxial(port.depth, speed, 2)).toBeLessThan(0);
    expect(launchViewAxial(port.depth, speed, 2.5)).toBeGreaterThan(0);
  });

  it("starts the pre-roll at the inner end of the slot, clear of the walls, with the launch twist and the station roll", () => {
    const pose = preRollPose(layout, geometry, 0);
    const camera = preRollCamera(0);
    expect(Math.abs(signedDepth(camera.position) + port.depth)).toBeLessThan(
      1e-9,
    );
    expect(axisDistance(camera.position) + CAMERA_NEAR).toBeLessThan(
      Math.min(port.width, port.height) / 2,
    );
    expect(pose.position).toEqual(mouth);
    expect(camera.quaternion).toEqual(pose.orientation);
    expect(launchViewStationAngle(layout, 0)).toBeCloseTo(
      -layout.stationRollRadPerSec * LAUNCH_PRE_ROLL_DURATION,
      12,
    );
  });

  it("holds the walls still in the pre-roll: the camera rolls from the launch orientation by the station angle", () => {
    const base = launchOrientation(layout, geometry);
    const steps = Math.round(LAUNCH_PRE_ROLL_DURATION / DT);
    for (let index = 0; index <= steps; index += 1) {
      const tau = index * DT;
      const relative = mul(conjugate(base), preRollCamera(tau).quaternion);
      expect(Math.abs(relative.x)).toBeLessThan(1e-12);
      expect(Math.abs(relative.y)).toBeLessThan(1e-12);
      const roll = 2 * Math.atan2(relative.z, relative.w);
      expect(Math.abs(roll - launchViewStationAngle(layout, tau))).toBeLessThan(
        1e-12,
      );
    }
  });

  it("meets the sim launch at the boundary with no jump in position, velocity or orientation", () => {
    const state = initFlightState(layout);
    step(state, true);
    expect(state.mode).toBe("launching");
    const boundary = preRollCamera(LAUNCH_PRE_ROLL_DURATION);
    const launched = launchCamera(state);
    expect(length(sub(boundary.position, launched.position))).toBeLessThan(
      1e-9,
    );
    const q = boundary.quaternion;
    const r = launched.quaternion;
    expect(
      Math.abs(q.w * r.w + q.x * r.x + q.y * r.y + q.z * r.z),
    ).toBeGreaterThan(1 - 1e-12);
    expect(launchViewStationAngle(layout, LAUNCH_PRE_ROLL_DURATION)).toBe(0);

    const before = sub(
      boundary.position,
      preRollCamera(LAUNCH_PRE_ROLL_DURATION - DT).position,
    );
    step(state);
    const next = launchCamera(state);
    const after = sub(next.position, launched.position);
    const velocityJump = length(sub(after, before)) / DT;
    expect(velocityJump).toBeLessThan(0.02 * speed);
    // Both sides move outward at about the curve's speed, not at rest.
    expect(dot(before, axis) / DT).toBeGreaterThan(0.5 * speed);
    // The orientation keeps turning with the station on both sides.
    const r2 = next.quaternion;
    expect(
      Math.abs(q.w * r2.w + q.x * r2.x + q.y * r2.y + q.z * r2.z),
    ).toBeGreaterThan(1 - 1e-6);
  });

  it("flies out through the slot on every step of the pre-roll and the real launch, with no jump", () => {
    const { preRoll, launch } = viewRun();
    expect(preRoll).toHaveLength(Math.round(LAUNCH_PRE_ROLL_DURATION / DT));
    expect(launch).toHaveLength(Math.round(LAUNCH_DURATION / DT));
    let previous: ViewFrame | undefined;
    for (const frame of [...preRoll, ...launch]) {
      const depth = signedDepth(frame.camera.position);
      expect(depth).toBeGreaterThan(-port.depth - 1e-9);
      if (frame.tau <= 2) expect(depth).toBeLessThan(0);
      if (frame.tau >= 2.5) expect(depth).toBeGreaterThan(0);
      expect(frame.camera.quaternion).toEqual(frame.cockpit.quaternion);
      // Never ahead of the cockpit (the pull back is never negative).
      expect(depth).toBeLessThanOrEqual(
        signedDepth(frame.cockpit.position) + 1e-9,
      );
      if (previous !== undefined) {
        expect(depth).toBeGreaterThanOrEqual(
          signedDepth(previous.camera.position),
        );
        expect(
          length(sub(frame.camera.position, previous.camera.position)),
        ).toBeLessThan(stepBound);
      }
      previous = frame;
    }
  });

  it("lands on the cockpit pose at handover and continues into flight without a jump", () => {
    const position = vec(1_000, -250, 4_000);
    const orientation = normalizeQuat(axisAngle(0, 0, 1, 0.3));
    const landed = computeSlotLaunchCamera(
      layout,
      port.depth,
      speed,
      position,
      orientation,
      LAUNCH_VIEW_DURATION,
    );
    const cockpit = computeCockpitCamera(position, orientation);
    expect(length(sub(landed.position, cockpit.position))).toBeLessThan(1e-9);
    expect(landed.quaternion).toEqual(cockpit.quaternion);

    const { launch, handover, handoverState } = viewRun();
    const atHandover = computeSlotLaunchCamera(
      layout,
      port.depth,
      speed,
      handoverState.position,
      handoverState.orientation,
      LAUNCH_VIEW_DURATION,
    );
    expect(length(sub(atHandover.position, handover.position))).toBeLessThan(
      1e-6,
    );
    const last = launch.at(-1);
    if (last === undefined) throw new Error("no launching frame");
    expect(length(sub(handover.position, last.camera.position))).toBeLessThan(
      stepBound,
    );
  });

  it("reads the launch time of the interpolated pose, clamped and finite", () => {
    for (const elapsed of [0, DT, 0.5, 1.25, LAUNCH_DURATION - DT]) {
      expect(launchViewElapsed(elapsed, 1)).toBe(elapsed);
      expect(launchViewElapsed(elapsed, 0)).toBe(Math.max(0, elapsed - DT));
    }
    expect(launchViewElapsed(0.5, 0.25)).toBeCloseTo(0.5 - 0.75 * DT, 12);
    expect(launchViewElapsed(-3, 1)).toBe(0);
    expect(launchViewElapsed(LAUNCH_DURATION + 3, 1)).toBe(LAUNCH_DURATION);
    expect(launchViewElapsed(0.5, 7)).toBe(0.5);
    expect(launchViewElapsed(0.5, -7)).toBe(0.5 - DT);
    for (const [elapsed, alpha] of [
      [Number.NaN, 1],
      [Number.POSITIVE_INFINITY, 0.5],
      [0.5, Number.NaN],
      [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY],
    ] as const) {
      const value = launchViewElapsed(elapsed, alpha);
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(LAUNCH_DURATION);
    }
    expect(launchViewElapsed(0.5, Number.NaN)).toBe(0.5);
  });

  it("reads the pre-roll time of the drawn frame the same way, clamped and finite", () => {
    for (const elapsed of [0, DT, 0.75, LAUNCH_PRE_ROLL_DURATION - DT]) {
      expect(preRollViewTime(elapsed, 1)).toBe(elapsed);
      expect(preRollViewTime(elapsed, 0)).toBe(Math.max(0, elapsed - DT));
    }
    expect(preRollViewTime(-3, 1)).toBe(0);
    expect(preRollViewTime(LAUNCH_PRE_ROLL_DURATION + 3, 1)).toBe(
      LAUNCH_PRE_ROLL_DURATION,
    );
    expect(preRollViewTime(0.5, Number.NaN)).toBe(0.5);
    expect(preRollViewTime(Number.NaN, 1)).toBe(0);
    expect(preRollViewTime(Number.POSITIVE_INFINITY, 0.5)).toBe(0);
  });

  it("rolls the station at the sim's own angle for the view time (the invariant the render relies on)", () => {
    for (const steps of [1, 24, 120, 239]) {
      const state = initFlightState(layout);
      step(state, true);
      for (let index = 0; index < steps; index += 1) step(state);
      expect(state.mode).toBe("launching");
      const angle = launchViewStationAngle(
        layout,
        LAUNCH_PRE_ROLL_DURATION + launchViewElapsed(state.launchElapsed, 1),
      );
      expect(Math.abs(angle - state.stationAngle)).toBeLessThan(1e-12);
    }
  });

  it("takes the depth from the station's dock data, and falls back to the cockpit without it", () => {
    const deeper = computeSlotLaunchCamera(
      layout,
      2 * port.depth,
      speed,
      mouth,
      layout.stationBaseQuat,
      0,
    );
    expect(
      Math.abs(signedDepth(deeper.position) + 2 * port.depth),
    ).toBeLessThan(1e-9);

    const position = vec(10, 20, 30);
    const orientation = normalizeQuat(axisAngle(0, 1, 0, 0.4));
    const cockpit = computeCockpitCamera(position, orientation);
    const cases: readonly [number | undefined, number][] = [
      [undefined, speed],
      [Number.NaN, speed],
      [Number.POSITIVE_INFINITY, speed],
      [0, speed],
      [-5, speed],
      [port.depth, Number.NaN],
      [port.depth, Number.POSITIVE_INFINITY],
      [port.depth, -1],
    ];
    for (const [depth, launchSpeed] of cases) {
      const camera = computeSlotLaunchCamera(
        layout,
        depth,
        launchSpeed,
        position,
        orientation,
        0.4,
      );
      expect(camera).toEqual(cockpit);
      for (const value of [camera.position.x, camera.position.y]) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it("holds no Coriolis dock number, wall clock or randomness in code", () => {
    const code = stripComments(launchCameraSource);
    expect(code).toContain("computeSlotLaunchCamera");
    expect(code).not.toMatch(/\b250\b|500\.2561|103\.41|241\.88/);
    expect(code).not.toMatch(/Math\.random/);
    expect(code).not.toMatch(/\bperformance\b|\bDate\.now\b|\bnew Date\b/);
  });
});

describe("launch view along the slot (quick 261118-mb5)", () => {
  const geometry = laveDockGeometry();

  /** Camera +X against the slot's long axis (port -j) at the sim's angle. */
  function camRightAlongSlot(camera: CameraPose, stationAngle: number): number {
    const j = portFrame(layout, stationAngle).j;
    return length(sub(rotate(camera.quaternion, vec(1, 0, 0)), scale(j, -1)));
  }

  it("shows the slot wide: camera +X lies along port -j at the pre-roll start, the launch step and handover", () => {
    // The pre-roll: the station is drawn at the view-time angle.
    const preRollTau = 0;
    const pose = preRollPose(layout, geometry, preRollTau);
    const preRoll = computeSlotLaunchCamera(
      layout,
      geometry.port.depth,
      config.launchSpeed,
      pose.position,
      pose.orientation,
      preRollTau,
    );
    expect(
      camRightAlongSlot(preRoll, launchViewStationAngle(layout, preRollTau)),
    ).toBeLessThan(1e-9);

    const state = initFlightState(layout);
    stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT, {
      dock: geometry,
    });
    const start = computeSlotLaunchCamera(
      layout,
      geometry.port.depth,
      config.launchSpeed,
      state.position,
      state.orientation,
      LAUNCH_PRE_ROLL_DURATION + launchViewElapsed(state.launchElapsed, 1),
    );
    expect(camRightAlongSlot(start, state.stationAngle)).toBeLessThan(1e-9);

    while (state.mode === "launching") {
      stepFlight(state, layout, config, ZERO_INTENT, [], DT, {
        dock: geometry,
      });
    }
    const handover = computeCockpitCamera(state.position, state.orientation);
    expect(camRightAlongSlot(handover, state.stationAngle)).toBeLessThan(1e-6);
  });
});
