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
  chartGoodsReadout,
  chartProjection,
  hitTest,
  nearestInDirection,
  selectLabels,
} from "../../src/ui/chart-model.js";
import type {
  ChartMarker,
  ChartView,
  ChartViewport,
} from "../../src/ui/chart-model.js";

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

describe("the 7 LY graph", () => {
  it("plots all 256 systems and exactly 875 edges at the Oolite 7 LY rule", () => {
    const view = buildChartView(
      systems,
      lave.id,
      undefined,
      "long",
      fullFuel,
      { width: 1200, height: 600 },
      lave.id,
    );
    const floorCount = countEdges(
      (left, right) => floorDistance(left, right) <= 17,
    );

    expect(view.markers).toHaveLength(256);
    expect(view.edges).toHaveLength(875);
    // A floor-based y delta produces 866 edges and a different graph.
    expect(floorCount).toBe(866);
    expect(view.edges).toHaveLength(875);
    expect(view.edges.length).not.toBe(floorCount);
  });

  it("derives the same graph regardless of the viewport", () => {
    const wide = buildChartView(
      systems,
      lave.id,
      undefined,
      "long",
      fullFuel,
      { width: 1600, height: 400 },
      undefined,
    );
    const tall = buildChartView(
      systems,
      lave.id,
      undefined,
      "long",
      fullFuel,
      { width: 640, height: 900 },
      undefined,
    );
    const key = (edge: { fromId: string; toId: string }): string =>
      `${edge.fromId}:${edge.toId}`;

    expect(wide.edges.map(key)).toEqual(tall.edges.map(key));
  });

  it("keeps Lave's six exact neighbours and excludes Quator", () => {
    const view = buildChartView(
      systems,
      lave.id,
      undefined,
      "short",
      fullFuel,
      viewport,
      undefined,
    );
    const neighbours: ReadonlyArray<readonly [string, number]> = [
      ["Leesti", 3.6],
      ["Diso", 3.6],
      ["Reorte", 4.4],
      ["Zaonce", 5.6],
      ["Riedquat", 6.8],
      ["Orerve", 6.8],
    ];

    for (const [name, distance] of neighbours) {
      const candidate = byName(name);
      const candidateMarker = marker(view, candidate.id);
      expect(candidateMarker.distanceLy).toBeCloseTo(distance, 10);
      expect(
        view.edges.some(
          (edge) =>
            (edge.fromId === lave.id && edge.toId === candidate.id) ||
            (edge.toId === lave.id && edge.fromId === candidate.id),
        ),
      ).toBe(true);
    }

    const quator = byName("Quator");
    expect(marker(view, quator.id).distanceLy).toBeCloseTo(7.2, 10);
    expect(
      view.edges.some(
        (edge) =>
          (edge.fromId === lave.id && edge.toId === quator.id) ||
          (edge.toId === lave.id && edge.fromId === quator.id),
      ),
    ).toBe(false);
  });
});

describe("nearestInDirection", () => {
  it("returns a system that makes progress for each arrow", () => {
    const directions: ReadonlyArray<readonly [string, number, number]> = [
      ["up", 0, 1],
      ["down", 0, -1],
      ["left", -1, 0],
      ["right", 1, 0],
    ];

    for (const [, dirX, dirY] of directions) {
      const next = nearestInDirection(systems, lave, dirX, dirY);
      expect(next).toBeDefined();
      if (next === undefined) continue;
      const dx = next.chartX - lave.chartX;
      const dy = (next.chartY - lave.chartY) / 2;
      expect(dx * dirX + dy * dirY).toBeGreaterThan(0);
    }
  });

  it("breaks an exact tie by systemIndex and returns undefined with no progress", () => {
    const current = chartSystem("current", 0, 0, 0);
    const high = chartSystem("high", 9, 0, 4);
    const low = chartSystem("low", 3, 0, 4);

    expect(nearestInDirection([current, high, low], current, 0, 1)?.id).toBe(
      "low",
    );
    expect(nearestInDirection([current], current, 0, 1)).toBeUndefined();
  });
});

describe("reachability", () => {
  it("keeps far systems in the marker array, named and marked too far", () => {
    const view = buildChartView(
      systems,
      lave.id,
      undefined,
      "long",
      10,
      { width: 1200, height: 600 },
      undefined,
    );
    const far = view.markers.find(
      (candidate) => !candidate.isCurrent && candidate.distanceLy > 7,
    );

    expect(far).toBeDefined();
    expect(far?.name.length).toBeGreaterThan(0);
    expect(far?.reachable).toBe(false);
    expect(far?.unreachableReason).toBe("too far");
  });

  it("marks an in-range system short of fuel without removing it", () => {
    const view = buildChartView(
      systems,
      lave.id,
      undefined,
      "short",
      0,
      viewport,
      undefined,
    );
    const disoMarker = marker(view, diso.id);

    expect(disoMarker.reachable).toBe(false);
    expect(disoMarker.unreachableReason).toBe("insufficient fuel");
    expect(disoMarker.name).toBe("Diso");
    expect(
      hitTest(view, { x: disoMarker.screenX, y: disoMarker.screenY }, 10)?.id,
    ).toBe(diso.id);
    expect(chartGoodsReadout(view, diso.id)).toEqual({
      systemId: diso.id,
      name: "Diso",
      distanceLy: disoMarker.distanceLy,
      fuelCost: disoMarker.fuelCost,
      reachable: false,
      reason: "insufficient fuel",
    });
    expect(chartGoodsReadout(view, "missing")).toBeUndefined();
  });
});

describe("selectLabels", () => {
  it("skips an intersecting label in systemIndex order but always keeps current and target", () => {
    const current = chartMarker({
      id: "current",
      systemIndex: 0,
      screenX: 100,
      screenY: 100,
      isCurrent: true,
    });
    const close = chartMarker({
      id: "close",
      systemIndex: 1,
      screenX: 104,
      screenY: 100,
    });
    const far = chartMarker({
      id: "far",
      systemIndex: 2,
      screenX: 300,
      screenY: 100,
    });
    const measure = (): number => 40;

    expect(
      selectLabels(
        viewForMarkers([current, close, far], undefined),
        measure,
      ).map((label) => label.systemId),
    ).toEqual(["current", "far"]);

    const targeted = chartMarker({
      id: "close",
      systemIndex: 1,
      screenX: 104,
      screenY: 100,
      isTarget: true,
    });
    expect(
      selectLabels(
        viewForMarkers([current, targeted, far], targeted.id),
        measure,
      ).map((label) => label.systemId),
    ).toEqual(["current", "close", "far"]);
  });

  it("dims an unreachable label instead of hiding it", () => {
    const unreachable = chartMarker({
      id: "far",
      systemIndex: 0,
      screenX: 100,
      screenY: 100,
      reachable: false,
    });
    const labels = selectLabels(
      viewForMarkers([unreachable], undefined),
      () => 20,
    );

    expect(labels).toHaveLength(1);
    expect(labels[0]?.dimmed).toBe(true);
  });
});

describe("purity and the fuel circle", () => {
  it("returns deep-equal data for identical inputs and equal projections", () => {
    const first = buildChartView(
      systems,
      lave.id,
      diso.id,
      "long",
      fullFuel,
      { width: 1000, height: 500 },
      diso.id,
    );
    const second = buildChartView(
      systems,
      lave.id,
      diso.id,
      "long",
      fullFuel,
      { width: 1000, height: 500 },
      diso.id,
    );
    const { projection: firstProjection, ...firstData } = first;
    const { projection: secondProjection, ...secondData } = second;

    expect(firstData).toEqual(secondData);
    for (const point of [
      { x: 0, y: 0 },
      { x: 20, y: 173 },
      { x: 255, y: 255 },
    ]) {
      expect(firstProjection(point)).toEqual(secondProjection(point));
    }
  });

  it("draws the fuel circle as a true circle with a fuel/4 chart-x radius", () => {
    const view = buildChartView(
      systems,
      lave.id,
      undefined,
      "short",
      fullFuel,
      viewport,
      undefined,
    );
    const circle = view.circle;
    if (circle === undefined) throw new Error("the view has no fuel circle");
    const centre = view.projection({ x: lave.chartX, y: lave.chartY });
    const xEdge = view.projection({
      x: lave.chartX + circle.chartRadius,
      y: lave.chartY,
    });
    const yEdge = view.projection({
      x: lave.chartX,
      y: lave.chartY + circle.chartRadius * 2,
    });

    expect(circle.chartRadius).toBeCloseTo(17.5, 10);
    expect(xEdge.x - centre.x).toBeCloseTo(circle.radius, 10);
    expect(centre.y - yEdge.y).toBeCloseTo(circle.radius, 10);
  });
});

function floorDistance(left: System, right: System): number {
  const dx = left.chartX - right.chartX;
  const dy = Math.floor((left.chartY - right.chartY) / 2);
  return Math.trunc(Math.sqrt(dx * dx + dy * dy));
}

function countEdges(
  predicate: (left: System, right: System) => boolean,
): number {
  let count = 0;
  for (let left = 0; left < systems.length; left += 1) {
    const first = systems[left];
    if (first === undefined) continue;
    for (let right = left + 1; right < systems.length; right += 1) {
      const second = systems[right];
      if (second === undefined) continue;
      if (predicate(first, second)) count += 1;
    }
  }
  return count;
}

function chartSystem(
  id: string,
  systemIndex: number,
  chartX: number,
  chartY: number,
): System {
  return {
    id,
    name: id,
    systemIndex,
    chartX,
    chartY,
    economy: 0,
  } as unknown as System;
}

function chartMarker(overrides: {
  readonly id: string;
  readonly systemIndex: number;
  readonly screenX: number;
  readonly screenY: number;
  readonly isCurrent?: boolean;
  readonly isTarget?: boolean;
  readonly isSelected?: boolean;
  readonly reachable?: boolean;
}): ChartMarker {
  return {
    id: overrides.id,
    name: overrides.id,
    systemIndex: overrides.systemIndex,
    economy: 0,
    chartX: overrides.screenX,
    chartY: overrides.screenY,
    screenX: overrides.screenX,
    screenY: overrides.screenY,
    distanceLy: 0,
    fuelCost: 0,
    reachable: overrides.reachable ?? true,
    unreachableReason: overrides.reachable === false ? "too far" : undefined,
    isCurrent: overrides.isCurrent ?? false,
    isTarget: overrides.isTarget ?? false,
    isSelected: overrides.isSelected ?? false,
  };
}

function viewForMarkers(
  markers: readonly ChartMarker[],
  targetId: string | undefined,
): ChartView {
  return {
    markers,
    edges: [],
    labels: [],
    circle: undefined,
    projection: (point) => point,
    currentId: markers.find((marker) => marker.isCurrent)?.id ?? "",
    targetId,
    selectedId: undefined,
    range: "long",
    viewport: { width: 800, height: 400 },
    centre: { x: 0, y: 0 },
    chartSpanX: 256,
    chartSpanY: 256,
  };
}
