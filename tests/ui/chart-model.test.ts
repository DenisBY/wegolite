// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The pure galactic chart view model (NAV-01, NAV-02, D-01..D-04).
 *
 * The projection is isotropic on a letterboxed 2:1 chart rectangle: two
 * chart-y units span one distance unit. A click is resolved against the
 * marker screen positions the model produced, never against pixels derived
 * from the galaxy file. The generated galaxy is read here only; the model
 * itself imports content types and the pure jump module.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { System } from "../../src/content/types.js";
import {
  buildChartView,
  chartProjection,
  hitTest,
} from "../../src/ui/chart-model.js";
import type { ChartView, ChartViewport } from "../../src/ui/chart-model.js";

const systems = JSON.parse(
  readFileSync(
    new URL("../../src/content/generated/systems/g0.json", import.meta.url),
    "utf8",
  ),
) as System[];

function byName(name: string): System {
  const found = systems.find((system) => system.name === name);
  if (found === undefined) throw new Error(`galaxy 0 has no system "${name}"`);
  return found;
}

function marker(view: ChartView, id: string) {
  const found = view.markers.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`the view has no marker "${id}"`);
  return found;
}

const lave = byName("Lave");
const diso = byName("Diso");
const viewport: ChartViewport = { width: 800, height: 400 };
const fullFuel = 70;

describe("chart projection", () => {
  it("is isotropic: one chart-x unit and two chart-y units are equal pixels", () => {
    const projection = chartProjection(viewport, { x: 0, y: 0 }, 100, 100);
    const origin = projection({ x: 0, y: 0 });
    const xStep = projection({ x: 1, y: 0 });
    const yStep = projection({ x: 0, y: 2 });

    expect(xStep.x - origin.x).toBeCloseTo(8, 10);
    expect(origin.y - yStep.y).toBeCloseTo(8, 10);
  });

  it("inverts screen y so chart north is up", () => {
    const projection = chartProjection(viewport, { x: 0, y: 0 }, 100, 100);

    expect(projection({ x: 0, y: 2 }).y).toBeLessThan(
      projection({ x: 0, y: 0 }).y,
    );
  });

  it("letterboxes a wider viewport with side margins", () => {
    const projection = chartProjection(
      { width: 1000, height: 400 },
      { x: 0, y: 0 },
      100,
      100,
    );

    expect(projection({ x: 0, y: 0 })).toEqual({ x: 500, y: 200 });
    expect(projection({ x: -50, y: 0 }).x).toBe(100);
    expect(projection({ x: 50, y: 0 }).x).toBe(900);
  });

  it("letterboxes a taller viewport with top and bottom margins", () => {
    const projection = chartProjection(
      { width: 400, height: 1000 },
      { x: 0, y: 0 },
      100,
      100,
    );

    expect(projection({ x: 0, y: 0 })).toEqual({ x: 200, y: 500 });
    expect(projection({ x: 0, y: 50 }).y).toBe(400);
  });
});

describe("buildChartView", () => {
  it("places Lave at the current-system position and reads Diso's route", () => {
    const view = buildChartView(
      systems,
      lave.id,
      undefined,
      "short",
      fullFuel,
      viewport,
      diso.id,
    );

    const laveMarker = marker(view, lave.id);
    const disoMarker = marker(view, diso.id);

    expect(laveMarker.isCurrent).toBe(true);
    expect(laveMarker.screenX).toBeCloseTo(400, 10);
    expect(laveMarker.screenY).toBeCloseTo(200, 10);
    expect(disoMarker.distanceLy).toBeCloseTo(3.6, 10);
    expect(disoMarker.fuelCost).toBe(36);
    expect(disoMarker.reachable).toBe(true);
    expect(disoMarker.isSelected).toBe(true);
    expect(view.labels).toEqual([]);
  });
});

describe("hitTest", () => {
  it("selects the nearest marker inside the hit radius", () => {
    const view = buildChartView(
      systems,
      lave.id,
      undefined,
      "short",
      fullFuel,
      viewport,
      lave.id,
    );
    const laveMarker = marker(view, lave.id);
    const disoMarker = marker(view, diso.id);

    expect(
      hitTest(view, { x: laveMarker.screenX, y: laveMarker.screenY }, 10)?.id,
    ).toBe(lave.id);
    expect(
      hitTest(view, { x: disoMarker.screenX, y: disoMarker.screenY }, 10)?.id,
    ).toBe(diso.id);
  });

  it("returns undefined outside every hit radius", () => {
    const view = buildChartView(
      systems,
      lave.id,
      undefined,
      "short",
      fullFuel,
      viewport,
      lave.id,
    );

    expect(hitTest(view, { x: -100, y: -100 }, 10)).toBeUndefined();
  });
});
