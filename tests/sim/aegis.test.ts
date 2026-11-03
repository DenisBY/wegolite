// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The aegis and compass boundaries (FLGT-05, D-06, D-07).
 *
 * The table asserts one metre either side of both thresholds, so a re-derived
 * or off-by-one range fails. Lave's station is 82,273.476 m from the planet, so
 * a point 51,201 m from the station *away* from the planet is outside both
 * aegides — the direction matters, and a naive "near the station" point would
 * silently still be inside the planetary aegis.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  aegisStatus,
  autoCompassTarget,
  nextCompassMode,
  resolveCompassTarget,
} from "../../src/sim/world/aegis.js";
import { ZERO_INTENT } from "../../src/sim/flight/controller.js";
import { initFlightState } from "../../src/sim/flight/state.js";
import { stepFlight } from "../../src/sim/flight/step.js";
import { add, scale, vec } from "../../src/sim/math.js";
import type { Vec3 } from "../../src/sim/math.js";
import { DT } from "../../src/sim/time.js";
import { laveFixture } from "../helpers/lave.js";

const fixture = laveFixture();
const { layout, config } = fixture;
const awayFromPlanet = scale(layout.stationToPlanet, -1);

function fromStation(distance: number): Vec3 {
  return add(layout.station.position, scale(awayFromPlanet, distance));
}

function fromPlanet(distance: number): Vec3 {
  return add(layout.planet.position, scale(layout.stationToPlanet, distance));
}

describe("aegisStatus", () => {
  it("pins the station aegis at 51,199 / 51,200 / 51,201 m", () => {
    expect(layout.stationAegisRange).toBe(51_200);
    expect(aegisStatus(fromStation(51_199), layout)).toBe("dockingRange");
    // The boundary itself is inside: Oolite's comparison is <=.
    expect(aegisStatus(fromStation(51_200), layout)).toBe("dockingRange");
    // 51,201 m away from the planet leaves the planetary aegis too.
    expect(aegisStatus(fromStation(51_201), layout)).toBe("none");
  });

  it("pins the planetary aegis at 123,479 / 123,480 / 123,481 m", () => {
    expect(layout.planetAegisRange).toBe(123_480);
    expect(aegisStatus(fromPlanet(123_479), layout)).toBe("planet");
    expect(aegisStatus(fromPlanet(123_480), layout)).toBe("planet");
    expect(aegisStatus(fromPlanet(123_481), layout)).toBe("none");
  });

  it("reports docking range at the dock mouth and planet far out", () => {
    expect(aegisStatus(fromStation(0), layout)).toBe("dockingRange");
    expect(aegisStatus(fromPlanet(60_000), layout)).toBe("planet");
    expect(aegisStatus(vec(1_000_000, 1_000_000, 1_000_000), layout)).toBe(
      "none",
    );
  });
});

describe("compass target", () => {
  it("uses the station inside either aegis and the planet outside both", () => {
    expect(autoCompassTarget(fromStation(10_000), layout)).toBe("station");
    // Inside the planetary aegis but well outside the station aegis.
    expect(autoCompassTarget(fromPlanet(60_000), layout)).toBe("station");
    expect(autoCompassTarget(fromPlanet(200_000), layout)).toBe("planet");
  });

  it("cycles auto -> planet -> station -> witchpoint -> auto", () => {
    expect(nextCompassMode("auto")).toBe("planet");
    expect(nextCompassMode("planet")).toBe("station");
    expect(nextCompassMode("station")).toBe("witchpoint");
    expect(nextCompassMode("witchpoint")).toBe("auto");
  });

  it("resolves manual modes literally and auto through the aegis", () => {
    const position = fromStation(10_000);
    expect(resolveCompassTarget(position, "planet", layout)).toBe("planet");
    expect(resolveCompassTarget(position, "station", layout)).toBe("station");
    expect(resolveCompassTarget(position, "witchpoint", layout)).toBe(
      "witchpoint",
    );
    expect(resolveCompassTarget(position, "auto", layout)).toBe("station");
    expect(resolveCompassTarget(fromPlanet(200_000), "auto", layout)).toBe(
      "planet",
    );
  });

  it("applies cycleCompass and targetStation through stepFlight", () => {
    const state = initFlightState(layout);
    stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
    stepFlight(
      state,
      layout,
      config,
      ZERO_INTENT,
      [{ kind: "skipLaunch" }],
      DT,
    );

    // Auto resolves to the station inside the docking-range aegis.
    expect(state.compassMode).toBe("auto");
    expect(state.compassTarget).toBe("station");

    stepFlight(
      state,
      layout,
      config,
      ZERO_INTENT,
      [{ kind: "cycleCompass" }],
      DT,
    );
    expect(state.compassMode).toBe("planet");
    expect(state.compassTarget).toBe("planet");

    stepFlight(
      state,
      layout,
      config,
      ZERO_INTENT,
      [{ kind: "targetStation" }],
      DT,
    );
    expect(state.compassMode).toBe("station");
    expect(state.compassTarget).toBe("station");
  });
});

describe("module purity", () => {
  it("has no Three, DOM, clock or randomness in its executable source", () => {
    const source = readFileSync(
      new URL("../../src/sim/world/aegis.ts", import.meta.url),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    expect(source).not.toContain('from "three"');
    expect(source).not.toContain("document");
    expect(source).not.toContain("window");
    expect(source).not.toContain("CanvasRenderingContext2D");
    expect(source).not.toContain("Math.random");
    expect(source).not.toContain("Date");
    expect(source).not.toContain("performance");
  });
});
