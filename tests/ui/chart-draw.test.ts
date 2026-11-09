// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The pure Canvas2D chart painter and its repaint policy (NAV-01, D-02, D-04,
 * T-06-10).
 *
 * The painter receives an already-transformed context, exactly like
 * `src/render/hud/draw.ts`. A hand-written recording stub stands in for the
 * context so the draw order and the 0x0 skip are proved in Node without a DOM
 * or jsdom.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { System } from "../../src/content/types.js";
import {
  buildChartView,
  galaxyPreset,
  localPreset,
  selectLabels,
} from "../../src/ui/chart-model.js";
import type {
  ChartCamera,
  ChartView,
  ChartViewport,
} from "../../src/ui/chart-model.js";
import { drawChart, needsChartRepaint } from "../../src/ui/chart-draw.js";

interface RecordedCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

interface Recorder {
  readonly context: CanvasRenderingContext2D;
  readonly calls: RecordedCall[];
}

function createRecorder(): Recorder {
  const calls: RecordedCall[] = [];
  const record =
    (method: string) =>
    (...args: unknown[]): void => {
      calls.push({ method, args });
    };
  const context = {
    clearRect: record("clearRect"),
    beginPath: record("beginPath"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    stroke: record("stroke"),
    arc: record("arc"),
    fill: record("fill"),
    fillText: record("fillText"),
    setLineDash: record("setLineDash"),
  } as unknown as CanvasRenderingContext2D;
  return { context, calls };
}

function indexesOf(calls: readonly RecordedCall[], method: string): number[] {
  const found: number[] = [];
  for (let index = 0; index < calls.length; index += 1) {
    if (calls[index]?.method === method) found.push(index);
  }
  return found;
}

function first(indexes: readonly number[]): number {
  const value = indexes[0];
  if (value === undefined) throw new Error("the recorder has no such call");
  return value;
}

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

const lave = byName("Lave");
const diso = byName("Diso");
const leesti = byName("Leesti");
const viewport: ChartViewport = { width: 1200, height: 600 };

function labelledView(
  currentId = lave.id,
  targetId: string | undefined = diso.id,
  camera: ChartCamera = galaxyPreset(),
  selectedId: string | undefined = diso.id,
  size: ChartViewport = viewport,
): ChartView {
  const base = buildChartView(
    systems,
    currentId,
    targetId,
    camera,
    70,
    size,
    selectedId,
  );
  return { ...base, labels: selectLabels(base, () => 18) };
}

const view = labelledView();

describe("drawChart", () => {
  it("returns false and issues no context call for a 0x0 size", () => {
    const { context, calls } = createRecorder();

    expect(drawChart(context, view, { width: 0, height: 600 })).toBe(false);
    expect(drawChart(context, view, { width: 600, height: 0 })).toBe(false);
    expect(calls).toEqual([]);
  });

  it("paints edges, then the circle, then the target line, then markers, then labels", () => {
    const { context, calls } = createRecorder();

    expect(drawChart(context, view, viewport)).toBe(true);

    expect(calls[0]?.method).toBe("clearRect");
    const strokes = indexesOf(calls, "stroke");
    const arcs = indexesOf(calls, "arc");
    const fills = indexesOf(calls, "fill");
    const texts = indexesOf(calls, "fillText");

    expect(strokes.length).toBeGreaterThanOrEqual(3);
    expect(first(strokes)).toBeLessThan(first(arcs));
    expect(first(arcs)).toBeLessThan(strokes[1] ?? Number.NaN);
    expect(strokes[1] ?? Number.NaN).toBeLessThan(first(strokes.slice(2)));
    expect(first(strokes.slice(2))).toBeLessThan(first(fills));
    expect(first(fills)).toBeLessThan(first(texts));
  });

  it("writes every label string through fillText", () => {
    const { context, calls } = createRecorder();

    drawChart(context, view, viewport);

    const drawn = calls
      .filter((call) => call.method === "fillText")
      .map((call) => call.args[0]);
    const expected = new Set(view.labels.map((label) => label.text));

    expect(drawn.length).toBeGreaterThan(0);
    expect(expected.has(String(view.labels[0]?.text))).toBe(true);
    for (const text of drawn) {
      expect(expected.has(String(text))).toBe(true);
    }
  });
});

describe("drawChart off-window selection", () => {
  it("paints and labels a selected marker that a camera move left off-window", () => {
    const ermaso = byName("Ermaso");
    const offWindow = labelledView(
      lave.id,
      diso.id,
      localPreset(lave),
      ermaso.id,
    );
    const selected = offWindow.markers.find(
      (marker) => marker.id === ermaso.id,
    );
    expect(selected?.visible).toBe(false);
    if (selected === undefined) return;

    const { context, calls } = createRecorder();
    drawChart(context, offWindow, viewport);

    const painted = calls.some(
      (call) =>
        call.method === "arc" &&
        call.args[0] === selected.screenX &&
        call.args[1] === selected.screenY,
    );
    const labelled = calls.some(
      (call) => call.method === "fillText" && call.args[0] === ermaso.name,
    );
    expect(painted).toBe(true);
    expect(labelled).toBe(true);
  });

  it("does not paint an off-window system that is neither selected, current nor target", () => {
    const ermaso = byName("Ermaso");
    const offWindow = labelledView(
      lave.id,
      diso.id,
      localPreset(lave),
      diso.id,
    );
    const hidden = offWindow.markers.find((marker) => marker.id === ermaso.id);
    expect(hidden?.visible).toBe(false);
    if (hidden === undefined) return;

    const { context, calls } = createRecorder();
    drawChart(context, offWindow, viewport);

    const painted = calls.some(
      (call) =>
        call.method === "arc" &&
        call.args[0] === hidden.screenX &&
        call.args[1] === hidden.screenY,
    );
    expect(painted).toBe(false);
  });
});

describe("needsChartRepaint", () => {
  it("is false for the same reference and for a fresh equal view", () => {
    expect(needsChartRepaint(view, view)).toBe(false);
    expect(needsChartRepaint(view, labelledView())).toBe(false);
  });

  it("is false for a 0x0 next view", () => {
    expect(
      needsChartRepaint(view, {
        ...view,
        viewport: { width: 0, height: 600 },
      }),
    ).toBe(false);
  });

  it("is true for a selection, target, camera, marker or size change", () => {
    expect(
      needsChartRepaint(
        view,
        labelledView(lave.id, diso.id, galaxyPreset(), leesti.id),
      ),
    ).toBe(true);
    expect(needsChartRepaint(view, labelledView(lave.id, leesti.id))).toBe(
      true,
    );
    expect(
      needsChartRepaint(
        view,
        labelledView(lave.id, diso.id, localPreset(lave)),
      ),
    ).toBe(true);
    expect(
      needsChartRepaint(view, { ...view, markers: view.markers.slice(0, 1) }),
    ).toBe(true);
    expect(
      needsChartRepaint(view, {
        ...view,
        viewport: { width: 800, height: 600 },
      }),
    ).toBe(true);
  });

  it("is false for two independently built identical camera views", () => {
    expect(needsChartRepaint(labelledView(), labelledView())).toBe(false);
  });

  it("is true for a camera centre, spanX or spanY change", () => {
    const camera = { centre: { x: 100, y: 100 }, spanX: 100 };
    const moved = { centre: { x: 110, y: 100 }, spanX: 100 };
    const zoomed = { centre: { x: 100, y: 100 }, spanX: 120 };

    expect(
      needsChartRepaint(labelledView(), labelledView(lave.id, diso.id, camera)),
    ).toBe(true);
    expect(
      needsChartRepaint(
        labelledView(lave.id, diso.id, camera),
        labelledView(lave.id, diso.id, moved),
      ),
    ).toBe(true);
    expect(
      needsChartRepaint(
        labelledView(lave.id, diso.id, camera),
        labelledView(lave.id, diso.id, zoomed),
      ),
    ).toBe(true);
    expect(
      needsChartRepaint(labelledView(lave.id, diso.id, camera), {
        ...labelledView(lave.id, diso.id, camera),
        chartSpanY: 202,
      }),
    ).toBe(true);
  });

  it("is true for a first paint", () => {
    expect(needsChartRepaint(undefined, view)).toBe(true);
  });
});
