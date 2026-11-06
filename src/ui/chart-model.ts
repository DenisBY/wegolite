// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The pure galactic chart view model (NAV-01, NAV-02, D-01..D-04).
 *
 * One function turns the compiled system array, the current and target ids,
 * the range window and a viewport into drawable primitives: projected markers,
 * the 7 LY graph edges, the fuel circle and the label candidates. The DOM shell
 * writes the result and the canvas painter draws it; this module never touches
 * the DOM, a canvas or Three.js.
 *
 * Projection. Oolite's chart is a 2:1 rectangle because the distance formula
 * halves Δy (`legacy_random.h:154-160`): two chart-y units span one distance
 * unit. This module letterboxes that rectangle and maps both axes
 * isotropically, so equal jump distances are equal on screen and the fuel
 * circle is a true circle. `screenX = width/2 + (x - centre.x) * k` and
 * `screenY = height/2 - ((y - centre.y) / 2) * k`, where
 * `k = min(width / chartSpanX, height / (chartSpanY / 2))`.
 *
 * Connectivity is **never** derived from pixels. Every edge and every
 * reachability decision comes from the integer `chartDistance` in
 * `src/sim/hyperspace/jump.ts`.
 */

import type { System } from "../content/types.js";
import {
  MAX_JUMP_DIST,
  chartDistance,
  jumpBetween,
} from "../sim/hyperspace/jump.js";

export type ChartRange = "short" | "long";

/** The CSS-pixel size the overlay paints into. */
export interface ChartViewport {
  readonly width: number;
  readonly height: number;
}

/** A point in chart coordinates (chart-x units, chart-y units). */
export interface ChartPoint {
  readonly x: number;
  readonly y: number;
}

/** Why a system cannot be jumped to from the current system. */
export type ChartUnreachableReason = "too far" | "insufficient fuel";

export interface ChartMarker {
  readonly id: string;
  readonly name: string;
  readonly systemIndex: number;
  readonly economy: number;
  readonly chartX: number;
  readonly chartY: number;
  /** Screen position in CSS pixels. */
  readonly screenX: number;
  readonly screenY: number;
  /** `0.4 * dist`, display only (the sim recomputes at commit). */
  readonly distanceLy: number;
  /** Integer fuel units, display only (the sim recomputes at commit). */
  readonly fuelCost: number;
  readonly reachable: boolean;
  readonly unreachableReason: ChartUnreachableReason | undefined;
  readonly isCurrent: boolean;
  readonly isTarget: boolean;
  readonly isSelected: boolean;
}

export interface ChartEdge {
  readonly fromId: string;
  readonly toId: string;
  readonly fromIndex: number;
  readonly toIndex: number;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface ChartLabel {
  readonly systemId: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** True when the label's marker is unreachable (drawn dimmer). */
  readonly dimmed: boolean;
}

export interface ChartCircle {
  readonly x: number;
  readonly y: number;
  /** Pixel radius; a true circle because both axes are isotropic. */
  readonly radius: number;
  /** Radius in chart-x units: `fuel / 4`, i.e. `fuel / 10` LY. */
  readonly chartRadius: number;
  readonly centreId: string;
}

export type ChartProjection = (point: ChartPoint) => ChartPoint;

export interface ChartView {
  readonly markers: readonly ChartMarker[];
  readonly edges: readonly ChartEdge[];
  /**
   * Always empty when the model returns the view: measuring text needs a
   * canvas, which this module may not touch. The shell fills it with
   * `selectLabels(view, measure)` before painting.
   */
  readonly labels: readonly ChartLabel[];
  readonly circle: ChartCircle | undefined;
  readonly projection: ChartProjection;
  readonly currentId: string;
  readonly targetId: string | undefined;
  readonly selectedId: string | undefined;
  readonly range: ChartRange;
  readonly viewport: ChartViewport;
  readonly centre: ChartPoint;
  readonly chartSpanX: number;
  readonly chartSpanY: number;
}

/** The distance/fuel readout for one selected system. */
export interface ChartSelection {
  readonly systemId: string;
  readonly name: string;
  readonly distanceLy: number;
  readonly fuelCost: number;
  readonly reachable: boolean;
  readonly reason: ChartUnreachableReason | undefined;
}

/** The short window is ±40 chart-x and ±80 chart-y (±40 distance units). */
const SHORT_SPAN_X = 80;
const SHORT_SPAN_Y = 160;

/** The long window is the whole 256 x 256 chart (256 x 128 in distance space). */
const LONG_SPAN_X = 256;
const LONG_SPAN_Y = 256;
const LONG_CENTRE_X = 128;
const LONG_CENTRE_Y = 128;

/** Label metrics the shell's measure callback is paired with. */
const LABEL_HEIGHT = 12;
const LABEL_OFFSET_X = 5;
const LABEL_OFFSET_Y = -5;

/** A pure chart model was asked to describe something it cannot. */
export class ChartModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChartModelError";
  }
}

function projectionScale(
  viewport: ChartViewport,
  chartSpanX: number,
  chartSpanY: number,
): number {
  if (!(chartSpanX > 0) || !(chartSpanY > 0)) {
    throw new ChartModelError(
      `Wegolite: the chart span must be positive, received ${String(chartSpanX)} x ${String(chartSpanY)}.`,
    );
  }
  // Two chart-y units span one distance unit, hence the halved y span.
  return Math.min(viewport.width / chartSpanX, viewport.height / (chartSpanY / 2));
}

/**
 * Map chart coordinates to screen coordinates on a centred, letterboxed 2:1
 * rectangle. `screenY` is negated so chart north is up.
 */
export function chartProjection(
  viewport: ChartViewport,
  centre: ChartPoint,
  chartSpanX: number,
  chartSpanY: number,
): ChartProjection {
  const k = projectionScale(viewport, chartSpanX, chartSpanY);
  const originX = viewport.width / 2;
  const originY = viewport.height / 2;
  return (point) => ({
    x: originX + (point.x - centre.x) * k,
    y: originY - ((point.y - centre.y) / 2) * k,
  });
}

function centreFor(
  range: ChartRange,
  current: System,
): ChartPoint {
  return range === "short"
    ? { x: current.chartX, y: current.chartY }
    : { x: LONG_CENTRE_X, y: LONG_CENTRE_Y };
}

function spanFor(range: ChartRange): { x: number; y: number } {
  return range === "short"
    ? { x: SHORT_SPAN_X, y: SHORT_SPAN_Y }
    : { x: LONG_SPAN_X, y: LONG_SPAN_Y };
}

function emptyChartView(
  range: ChartRange,
  viewport: ChartViewport,
  currentId: string,
  targetId: string | undefined,
  selectedId: string | undefined,
): ChartView {
  const spans = spanFor(range);
  const centre: ChartPoint = { x: 0, y: 0 };
  return {
    markers: [],
    edges: [],
    labels: [],
    circle: undefined,
    projection: chartProjection(viewport, centre, spans.x, spans.y),
    currentId,
    targetId,
    selectedId,
    range,
    viewport,
    centre,
    chartSpanX: spans.x,
    chartSpanY: spans.y,
  };
}

/**
 * Build the whole chart view for one frame of interaction.
 *
 * @param systems The compiled galaxy (256 records in production).
 * @param currentId The system the ship is in.
 * @param targetId The committed hyperspace target, if any.
 * @param range The short fixed window or the whole galaxy.
 * @param fuel The current fuel units (0..70); display only.
 * @param viewport The CSS-pixel canvas size.
 * @param selectedId The system currently highlighted, if any.
 */
export function buildChartView(
  systems: readonly System[],
  currentId: string,
  targetId: string | undefined,
  range: ChartRange,
  fuel: number,
  viewport: ChartViewport,
  selectedId: string | undefined,
): ChartView {
  const current = systems.find((system) => system.id === currentId);
  if (current === undefined) {
    // NAV-01 empty: an absent current system is a typed empty view, not a throw.
    return emptyChartView(range, viewport, currentId, targetId, selectedId);
  }

  const spans = spanFor(range);
  const centre = centreFor(range, current);
  const projection = chartProjection(viewport, centre, spans.x, spans.y);
  const halfX = spans.x / 2;
  const halfY = spans.y / 2;
  const inWindow = (system: System): boolean =>
    Math.abs(system.chartX - centre.x) <= halfX &&
    Math.abs(system.chartY - centre.y) <= halfY;

  // Stable output order: markers, edges and labels all follow systemIndex.
  const ordered = [...systems].sort(
    (left, right) => left.systemIndex - right.systemIndex,
  );
  const visible = ordered.filter(inWindow);
  const visibleIds = new Set(visible.map((system) => system.id));

  const markers: ChartMarker[] = visible.map((system) => {
    const isCurrent = system.id === currentId;
    const route = isCurrent
      ? { distanceLy: 0, fuelCost: 0, reachable: true, dist: 0 }
      : jumpBetween(
          { x: current.chartX, y: current.chartY },
          { x: system.chartX, y: system.chartY },
        );
    const reachable =
      isCurrent || (route.reachable && fuel >= route.fuelCost);
    let unreachableReason: ChartUnreachableReason | undefined;
    if (!reachable) {
      unreachableReason =
        route.dist > MAX_JUMP_DIST ? "too far" : "insufficient fuel";
    }
    const screen = projection({ x: system.chartX, y: system.chartY });
    return {
      id: system.id,
      name: system.name,
      systemIndex: system.systemIndex,
      economy: system.economy,
      chartX: system.chartX,
      chartY: system.chartY,
      screenX: screen.x,
      screenY: screen.y,
      distanceLy: route.distanceLy,
      fuelCost: route.fuelCost,
      reachable,
      unreachableReason,
      isCurrent,
      isTarget: targetId !== undefined && system.id === targetId,
      isSelected: selectedId !== undefined && system.id === selectedId,
    };
  });

  const edges: ChartEdge[] = [];
  for (let left = 0; left < ordered.length; left += 1) {
    const from = ordered[left];
    if (from === undefined) continue;
    for (let right = left + 1; right < ordered.length; right += 1) {
      const to = ordered[right];
      if (to === undefined) continue;
      if (range === "short" && !visibleIds.has(from.id) && !visibleIds.has(to.id)) {
        continue;
      }
      const dist = chartDistance(
        { x: from.chartX, y: from.chartY },
        { x: to.chartX, y: to.chartY },
      );
      if (dist > MAX_JUMP_DIST) continue;
      const start = projection({ x: from.chartX, y: from.chartY });
      const end = projection({ x: to.chartX, y: to.chartY });
      edges.push({
        fromId: from.id,
        toId: to.id,
        fromIndex: from.systemIndex,
        toIndex: to.systemIndex,
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
      });
    }
  }

  const currentMarker = markers.find((marker) => marker.id === currentId);
  const circle: ChartCircle | undefined =
    currentMarker === undefined
      ? undefined
      : {
          x: currentMarker.screenX,
          y: currentMarker.screenY,
          // A fuel/4 chart-x radius is a true circle because y is halved.
          radius:
            (Math.max(0, fuel) / 4) *
            projectionScale(viewport, spans.x, spans.y),
          chartRadius: Math.max(0, fuel) / 4,
          centreId: currentId,
        };

  return {
    markers,
    edges,
    labels: [],
    circle,
    projection,
    currentId,
    targetId,
    selectedId,
    range,
    viewport,
    centre,
    chartSpanX: spans.x,
    chartSpanY: spans.y,
  };
}

/**
 * The nearest marker whose screen position is within `radius` pixels, or
 * `undefined` outside every marker. Ties resolve by `systemIndex`.
 */
export function hitTest(
  view: ChartView,
  point: ChartPoint,
  radius: number,
): ChartMarker | undefined {
  let best: ChartMarker | undefined;
  let bestDistance = radius * radius;
  for (const marker of view.markers) {
    const dx = marker.screenX - point.x;
    const dy = marker.screenY - point.y;
    const distance = dx * dx + dy * dy;
    if (distance > bestDistance) continue;
    if (
      best === undefined ||
      distance < bestDistance ||
      (distance === bestDistance && marker.systemIndex < best.systemIndex)
    ) {
      best = marker;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * The nearest system that makes progress along `(dirX, dirY)` in distance
 * space. Candidates behind the current system are rejected; the score favours
 * straight-ahead travel, then proximity, and breaks exact ties by
 * `systemIndex`.
 */
export function nearestInDirection(
  systems: readonly System[],
  current: System,
  dirX: number,
  dirY: number,
): System | undefined {
  let best: System | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of systems) {
    if (candidate.id === current.id) continue;
    const dx = candidate.chartX - current.chartX;
    const dy = (candidate.chartY - current.chartY) / 2;
    const forward = dx * dirX + dy * dirY;
    if (forward <= 0) continue;
    const lateral = Math.abs(dx * dirY - dy * dirX);
    const score = lateral * 1000 + forward + candidate.systemIndex * 1e-6;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

/** The distance/fuel readout for one selected system, or `undefined`. */
export function chartGoodsReadout(
  view: ChartView,
  systemId: string,
): ChartSelection | undefined {
  const marker = view.markers.find((candidate) => candidate.id === systemId);
  if (marker === undefined) return undefined;
  return {
    systemId: marker.id,
    name: marker.name,
    distanceLy: marker.distanceLy,
    fuelCost: marker.fuelCost,
    reachable: marker.reachable,
    reason: marker.unreachableReason,
  };
}

function intersects(
  left: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  right: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): boolean {
  return (
    left.x < right.x + right.width &&
    right.x < left.x + left.width &&
    left.y < right.y + right.height &&
    right.y < left.y + left.height
  );
}

/**
 * Fill `ChartView.labels` deterministically.
 *
 * Systems are visited in `systemIndex` order. A label is skipped when its
 * measured box intersects an already accepted box, but the current system and
 * the committed target always draw. Unreachable systems are dimmed, never
 * suppressed. Text measurement is injected because the model has no canvas.
 */
export function selectLabels(
  view: ChartView,
  measure: (text: string) => number,
): ChartLabel[] {
  const accepted: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }> = [];
  const labels: ChartLabel[] = [];
  for (const marker of view.markers) {
    const width = measure(marker.name);
    const x = marker.screenX + LABEL_OFFSET_X;
    const y = marker.screenY + LABEL_OFFSET_Y;
    const box = { x, y: y - LABEL_HEIGHT, width, height: LABEL_HEIGHT };
    const forced = marker.isCurrent || marker.isTarget;
    if (!forced && accepted.some((other) => intersects(other, box))) {
      continue;
    }
    accepted.push(box);
    labels.push({
      systemId: marker.id,
      text: marker.name,
      x,
      y,
      width,
      height: LABEL_HEIGHT,
      dimmed: !marker.reachable,
    });
  }
  return labels;
}
