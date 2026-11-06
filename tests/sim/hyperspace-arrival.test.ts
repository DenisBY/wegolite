// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The deterministic witchpoint arrival (NAV-05, D-08).
 *
 * Three properties are load-bearing and none can pass by accident:
 *
 * 1. the same route produces a deep-equal pose, and the reversed route does
 *    not — so the pose is a function of the two ids, not of ambient state;
 * 2. the offset magnitude is clamped to the witchpoint safety distance and
 *    scanner range **by construction**, for every destination in galaxy 0;
 * 3. the source contains no global random source and no wall clock, which is
 *    what makes a replay reproducable across reloads.
 *
 * The source scan strips comments first, so prose about "no random source"
 * cannot satisfy or falsify it.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ARRIVAL_SPEED,
  applyWitchpointArrival,
  arrivalWord,
  OOLITE_ORIENTATION_EPSILON,
} from "../../src/sim/hyperspace/arrival.js";
import { initFlightState } from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
import { vec } from "../../src/sim/math.js";
import { LAVE_SYSTEM_ID, laveFixture } from "../helpers/lave.js";

const fixture = laveFixture();
const { layout, config } = fixture;
const LAVE = LAVE_SYSTEM_ID;
const LEESTI = "g0-s55";
const SAFE_DISTANCE = layout.witchpoint.radius + 750;
const SCANNER_HALF = layout.scannerRange * 0.5;

function freshState(): FlightState {
  // A docked state is the harshest input: arrival must overwrite every field
  // that would otherwise keep it at the dock mouth.
  return initFlightState(layout);
}

function arrive(
  originId: string,
  destinationId: string,
  flightConfig = config,
): FlightState {
  const state = freshState();
  applyWitchpointArrival(state, layout, flightConfig, originId, destinationId);
  return state;
}

/** Remove block comments and whole-line `//` comments before scanning. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}

describe("arrival pose determinism", () => {
  it("is deep-equal for the same origin and destination", () => {
    const first = arrive(LAVE, LEESTI);
    const second = arrive(LAVE, LEESTI);
    expect(first.position).toEqual(second.position);
    expect(first.orientation).toEqual(second.orientation);
  });

  it("differs for the reversed route", () => {
    const forward = arrive(LAVE, LEESTI);
    const reverse = arrive(LEESTI, LAVE);
    expect(reverse.position).not.toEqual(forward.position);
    expect(reverse.orientation).not.toEqual(forward.orientation);
  });

  it("derives the word from the route, stably and as a uint32", () => {
    const word = arrivalWord(LAVE, LEESTI);
    expect(arrivalWord(LAVE, LEESTI)).toBe(word);
    expect(arrivalWord(LEESTI, LAVE)).not.toBe(word);
    expect(Number.isSafeInteger(word)).toBe(true);
    expect(word).toBeGreaterThanOrEqual(0);
    expect(word).toBeLessThanOrEqual(0xff_ff_ff_ff);
  });
});

describe("arrival offset clamp", () => {
  it("keeps every galaxy-0 destination inside the safety and scanner bounds", () => {
    for (let index = 0; index < 256; index += 1) {
      const destination = `g0-s${String(index)}`;
      if (destination === LAVE) continue;
      const state = arrive(LAVE, destination);

      // The offset is horizontal: y is the witchpoint's y, so the distance is
      // measured on X/Z (the planet lies on -Z).
      expect(state.position.y).toBe(layout.witchpoint.position.y);
      const dx = state.position.x - layout.witchpoint.position.x;
      const dz = state.position.z - layout.witchpoint.position.z;
      const horizontal = Math.sqrt(dx * dx + dz * dz);

      expect(horizontal, destination).toBeGreaterThanOrEqual(SAFE_DISTANCE);
      expect(horizontal, destination).toBeLessThanOrEqual(SCANNER_HALF);
    }
  });

  it("places the Lave arrival on the witchpoint's horizontal plane", () => {
    const state = arrive(LAVE, LEESTI);
    // The offset is on X/Z only; y stays exactly the witchpoint's y.
    expect(state.position.y).toBe(layout.witchpoint.position.y);

    const dx = state.position.x - layout.witchpoint.position.x;
    const dz = state.position.z - layout.witchpoint.position.z;
    expect(Math.sqrt(dx * dx + dz * dz)).toBeGreaterThan(0);
  });
});

describe("arrival pose checklist", () => {
  it("normalises the near-identity orientation to unit length", () => {
    const state = arrive(LAVE, LEESTI);
    const { w, x, y, z } = state.orientation;
    expect(Math.sqrt(w * w + x * x + y * y + z * z)).toBeCloseTo(1, 12);
    // Near identity: it faces the planet down -Z with only the Oolite tilt.
    expect(state.orientation.w).toBeGreaterThan(0.95);
    for (const component of [
      state.orientation.x,
      state.orientation.y,
      state.orientation.z,
    ]) {
      expect(Math.abs(component)).toBeLessThan(0.15);
    }
  });

  it("takes exactly min(maxSpeed, 50) and zeroes the rates", () => {
    const state = arrive(LAVE, LEESTI);
    expect(state.speed).toBe(Math.min(config.maxSpeed, ARRIVAL_SPEED));
    if (config.maxSpeed >= ARRIVAL_SPEED) {
      expect(state.speed).toBe(50);
    }
    expect(state.pitchRate).toBe(0);
    expect(state.rollRate).toBe(0);
  });

  it("caps the speed on a slower ship", () => {
    const state = arrive(LAVE, LEESTI, { ...config, maxSpeed: 30 });
    expect(state.speed).toBe(30);
    expect(ARRIVAL_SPEED).toBe(50);
    expect(OOLITE_ORIENTATION_EPSILON).toBe(1 / 1024);
  });

  it("installs a complete in-flight pose", () => {
    const state = arrive(LAVE, LEESTI);
    expect(state.mode).toBe("inFlight");
    expect(state.dockArmed).toBe(false);
    expect(state.launchElapsed).toBe(0);
    expect(state.stationAngle).toBe(0);
    expect(state.impulse).toEqual(vec(0, 0, 0));
    expect(state.compassMode).toBe("auto");
    expect(state.torus).toEqual({
      engaged: false,
      factor: 1,
      massLocked: false,
      lastFactor: 1,
    });
  });
});

describe("arrival determinism source scan", () => {
  it("contains no global random source and no wall clock", () => {
    const source = withoutComments(
      readFileSync(
        new URL("../../src/sim/hyperspace/arrival.ts", import.meta.url),
        "utf8",
      ),
    );
    expect(source).not.toMatch(/Math\.random/);
    expect(source).not.toMatch(/Date\.now/);
    expect(source).not.toMatch(/performance\.now/);
    expect(source).not.toMatch(/new\s+Date/);
  });
});
