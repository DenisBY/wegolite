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
  chartArrowVector,
  chartGoodsReadout,
  chartProjection,
  galaxyPreset,
  hitTest,
  localPreset,
  nearestInDirection,
  selectLabels,
  visibleSystemIds,
} from "../../src/ui/chart-model.js";
import type {
  ChartArrow,
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
    // GuiDisplayGen.m:1575: the negative vscale draws a larger chart-y lower.
    expect(yStep.y - origin.y).toBeCloseTo(8, 10);
  });

  it("draws a larger galaxy y lower on screen, as Oolite's negative vscale does", () => {
    // GuiDisplayGen.m:1575 (negative vscale) and GuiDisplayGen.m:1948
    // (star y = sys.y * vscale + voffset): a larger y is drawn lower.
    const projection = chartProjection(viewport, { x: 0, y: 0 }, 100, 100);

    expect(projection({ x: 0, y: 2 }).y).toBeGreaterThan(
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
    // GuiDisplayGen.m:1575: a larger chart-y sits below the centre, so 500 + 100.
    expect(projection({ x: 0, y: 50 }).y).toBe(600);
  });
});

describe("buildChartView", () => {
  it("places Lave at the current-system position and reads Diso's route", () => {
    const view = buildChartView(
      systems,
      lave.id,
      undefined,
      localPreset(lave),
      fullFuel,
      viewport,
      diso.id,
    );

    const laveMarker = marker(view, lave.id);
    const disoMarker = marker(view, diso.id);

    expect(laveMarker.isCurrent).toBe(true);
    // Lave's chart-x is 20, so the local preset's centre clamps to x=40 and
    // keeps the whole ±40 window inside the galaxy (D-05).
    expect(laveMarker.screenX).toBeCloseTo(300, 10);
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
      localPreset(lave),
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
      localPreset(lave),
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
      galaxyPreset(),
      fullFuel,
      { width: 1200, height: 600 },
      lave.id,
    );
    const floorCount = countEdges(
      (left, right) => floorDistance(left, right) <= 17,
    );

    expect(view.markers).toHaveLength(256);
    expect(view.markers.every((candidate) => candidate.visible)).toBe(true);
    expect(view.edges).toHaveLength(875);
    // A floor-based y delta produces 866 edges and a different graph.
    expect(floorCount).toBe(866);
    expect(view.edges).toHaveLength(875);
    expect(view.edges.length).not.toBe(floorCount);
  });

  it("keeps all 256 markers in the short range and only clips their visibility", () => {
    const view = buildChartView(
      systems,
      lave.id,
      undefined,
      localPreset(lave),
      fullFuel,
      viewport,
      lave.id,
    );
    const hidden = view.markers.find((candidate) => !candidate.visible);

    expect(view.markers).toHaveLength(256);
    expect(marker(view, lave.id).visible).toBe(true);
    expect(hidden).toBeDefined();
    if (hidden !== undefined) {
      expect(
        hitTest(view, { x: hidden.screenX, y: hidden.screenY }, 10),
      ).not.toBe(hidden);
    }
  });

  it("derives the same graph regardless of the viewport", () => {
    const wide = buildChartView(
      systems,
      lave.id,
      undefined,
      galaxyPreset(),
      fullFuel,
      { width: 1600, height: 400 },
      undefined,
    );
    const tall = buildChartView(
      systems,
      lave.id,
      undefined,
      galaxyPreset(),
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
      localPreset(lave),
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
    const arrows: readonly ChartArrow[] = ["up", "down", "left", "right"];

    for (const arrow of arrows) {
      const { dirX, dirY } = chartArrowVector(arrow);
      const next = nearestInDirection(systems, lave, dirX, dirY);
      expect(next, arrow).toBeDefined();
      if (next === undefined) continue;
      const dx = next.chartX - lave.chartX;
      const dy = (next.chartY - lave.chartY) / 2;
      expect(dx * dirX + dy * dirY, arrow).toBeGreaterThan(0);
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

  it("rejects a candidate whose lateral offset exceeds its forward progress", () => {
    const current = chartSystem("current", 0, 0, 0);
    // dx 2, dy 5 (distance space): lateral 5 is more than forward 2.
    const steep = chartSystem("steep", 1, 2, 10);

    expect(nearestInDirection([current, steep], current, 1, 0)).toBeUndefined();
  });

  it("picks the nearest squared distance inside the cone, not the most aligned", () => {
    const current = chartSystem("current", 0, 0, 0);
    const near = chartSystem("near", 1, 4, 4); // squared 20, lateral 2 <= 4
    const aligned = chartSystem("aligned", 2, 7, 0); // squared 49
    const far = chartSystem("far", 3, 20, 0); // squared 400

    expect(
      nearestInDirection([current, aligned, far, near], current, 1, 0)?.id,
    ).toBe("near");
  });
});

describe("short-range arrow selection", () => {
  it("lists only visible systems, a strict subset of the galaxy at short range", () => {
    const view = buildChartView(
      systems,
      lave.id,
      undefined,
      localPreset(lave),
      fullFuel,
      viewport,
      undefined,
    );
    const visible = visibleSystemIds(view);

    expect(visible.size).toBeGreaterThan(0);
    expect(visible.size).toBeLessThan(systems.length);
    expect(visible.has(lave.id)).toBe(true);
    expect(visible.has(byName("Ermaso").id)).toBe(false);
  });

  it("keeps every system visible at long range", () => {
    const view = buildChartView(
      systems,
      lave.id,
      undefined,
      galaxyPreset(),
      fullFuel,
      viewport,
      undefined,
    );

    expect(visibleSystemIds(view).size).toBe(systems.length);
  });

  it("steps from Lave to a system whose marker is painted, never Ermaso", () => {
    const view = buildChartView(
      systems,
      lave.id,
      undefined,
      localPreset(lave),
      fullFuel,
      viewport,
      undefined,
    );
    const visible = visibleSystemIds(view);
    const candidates = systems.filter((system) => visible.has(system.id));
    const next = nearestInDirection(candidates, lave, 1, 0);

    expect(next).toBeDefined();
    if (next === undefined) return;
    expect(next.id).not.toBe(byName("Ermaso").id);
    expect(marker(view, next.id).visible).toBe(true);
  });

  it("keeps an off-window selection in the label set", () => {
    const ermaso = byName("Ermaso");
    const view = buildChartView(
      systems,
      lave.id,
      undefined,
      localPreset(lave),
      fullFuel,
      viewport,
      ermaso.id,
    );

    expect(marker(view, ermaso.id).visible).toBe(false);
    expect(marker(view, ermaso.id).isSelected).toBe(true);
    const labelled = selectLabels(view, () => 18).map(
      (label) => label.systemId,
    );
    expect(labelled).toContain(ermaso.id);
  });
});

describe("chartArrowVector follows the drawn screen", () => {
  /** The short-range view centred on Lave, with the candidates it paints. */
  function shortRangeFromLave(): {
    readonly view: ChartView;
    readonly candidates: readonly System[];
  } {
    const view = buildChartView(
      systems,
      lave.id,
      undefined,
      localPreset(lave),
      fullFuel,
      viewport,
      undefined,
    );
    const visible = visibleSystemIds(view);
    return {
      view,
      candidates: systems.filter((system) => visible.has(system.id)),
    };
  }

  it("points up at decreasing chart-y, as GuiDisplayGen.m:1575 draws it", () => {
    // GuiDisplayGen.m:1575: the negative vscale draws a larger chart-y lower,
    // so screen-up is the smaller chart-y and dirY is -1.
    expect(chartArrowVector("up")).toEqual({ dirX: 0, dirY: -1 });
    expect(chartArrowVector("down")).toEqual({ dirX: 0, dirY: 1 });
    expect(chartArrowVector("left")).toEqual({ dirX: -1, dirY: 0 });
    expect(chartArrowVector("right")).toEqual({ dirX: 1, dirY: 0 });
  });

  it("picks, for each arrow from Lave, a system drawn in that direction", () => {
    const { view, candidates } = shortRangeFromLave();
    const laveMarker = marker(view, lave.id);
    const expectations: ReadonlyArray<
      readonly [ChartArrow, "screenX" | "screenY", -1 | 1]
    > = [
      ["up", "screenY", -1],
      ["down", "screenY", 1],
      ["left", "screenX", -1],
      ["right", "screenX", 1],
    ];

    for (const [arrow, axis, sign] of expectations) {
      const { dirX, dirY } = chartArrowVector(arrow);
      const next = nearestInDirection(candidates, lave, dirX, dirY);
      expect(next, arrow).toBeDefined();
      if (next === undefined) continue;
      const delta = marker(view, next.id)[axis] - laveMarker[axis];
      expect(Math.sign(delta), arrow).toBe(sign);
    }
  });

  it("selects Reorte above Lave on ArrowUp, the system the browser test presses", () => {
    const { view, candidates } = shortRangeFromLave();
    const { dirX, dirY } = chartArrowVector("up");
    const reorte = byName("Reorte");
    const up = nearestInDirection(candidates, lave, dirX, dirY);

    expect(up?.id).toBe(reorte.id);
    expect(marker(view, reorte.id).screenY).toBeLessThan(
      marker(view, lave.id).screenY,
    );
  });

  it("walks the browser chain: up to Reorte, down to Lave, right to Zaonce, left to Lave", () => {
    const { candidates } = shortRangeFromLave();
    const steps: ReadonlyArray<readonly [ChartArrow, string]> = [
      ["up", "Reorte"],
      ["down", "Lave"],
      ["right", "Zaonce"],
      ["left", "Lave"],
    ];

    let base = lave;
    for (const [arrow, name] of steps) {
      const { dirX, dirY } = chartArrowVector(arrow);
      const next = nearestInDirection(candidates, base, dirX, dirY);
      expect(next?.id, arrow).toBe(byName(name).id);
      if (next === undefined) return;
      base = next;
    }
  });
});

describe("reachability", () => {
  it("keeps far systems in the marker array, named and marked too far", () => {
    const view = buildChartView(
      systems,
      lave.id,
      undefined,
      galaxyPreset(),
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
      localPreset(lave),
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
      galaxyPreset(),
      fullFuel,
      { width: 1000, height: 500 },
      diso.id,
    );
    const second = buildChartView(
      systems,
      lave.id,
      diso.id,
      galaxyPreset(),
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
      localPreset(lave),
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
    // GuiDisplayGen.m:1575: a larger chart-y is drawn lower, so the south edge
    // of the circle sits below the centre.
    expect(yEdge.y - centre.y).toBeCloseTo(circle.radius, 10);
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
    visible: true,
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
    viewport: { width: 800, height: 400 },
    centre: { x: 0, y: 0 },
    chartSpanX: 256,
    chartSpanY: 256,
  };
}
