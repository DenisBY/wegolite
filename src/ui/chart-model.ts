// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The pure galactic chart view model (NAV-01, NAV-02, D-01..D-04).
 *
 * One function turns the compiled system array, the current and target ids,
 * the camera and a viewport into drawable primitives: projected markers, the
 * 7 LY graph edges, the fuel circle and the label candidates. The camera is a
 * continuous `{ centre, spanX }` pair; the local and whole-galaxy views are
 * presets over it. The DOM shell writes the result and the canvas painter draws
 * it; this module never touches the DOM, a canvas or Three.js.
 *
 * Projection. Oolite's chart is a 2:1 rectangle because the distance formula
 * halves Δy (`legacy_random.h:154-160`): two chart-y units span one distance
 * unit. This module letterboxes that rectangle and maps both axes
 * isotropically, so equal jump distances are equal on screen and the fuel
 * circle is a true circle. `screenX = width/2 + (x - centre.x) * k` and
 * `screenY = height/2 + ((y - centre.y) / 2) * k`, where
 * `k = min(width / chartSpanX, height / (chartSpanY / 2))`. The chart follows
 * Oolite's orientation, so screen y grows downward with galaxy y.
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

/**
 * The continuous chart camera (D-01).
 *
 * `centre` is in chart coordinates and `spanX` is the visible width in chart-x
 * units. The visible height is always `2 * spanX` because the projection halves
 * the y axis, so one camera scalar controls both axes (see `chartSpanY`).
 */
export interface ChartCamera {
  readonly centre: ChartPoint;
  readonly spanX: number;
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
  /**
   * True when the marker's projected screen position lies inside the current
   * viewport (D-02). All 256 markers stay in the model; off-viewport systems
   * keep their names but are skipped by hit-testing and arrow selection. The
   * one exception is current/target/selected, which the painter and the label
   * set keep even after a pan or zoom moves them off-screen.
   */
  readonly visible: boolean;
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

/** The local preset is ±40 chart-x and ±40 distance units around the system. */
export const CHART_LOCAL_SPAN_X = 80;

/** The whole-galaxy preset covers the 256 x 256 chart (256 x 128 in distance). */
export const CHART_GALAXY_SPAN_X = 256;

/** The closest zoom the wheel may reach (D-03). */
export const CHART_MIN_SPAN_X = 20;

/** The centre of the whole 256 x 256 chart. */
export const CHART_GALAXY_CENTRE: ChartPoint = Object.freeze({
  x: 128,
  y: 128,
});

/**
 * The visible height of a camera. Two chart-y units span one distance unit, so
 * a half-y span is a full `spanX` and the projection is isotropic.
 */
export function chartSpanY(camera: ChartCamera): number {
  return 2 * camera.spanX;
}

/** Projection scale for a clamped camera on a viewport, in CSS pixels. */
function cameraScale(viewport: ChartViewport, spanX: number): number {
  return projectionScale(viewport, spanX, 2 * spanX);
}

function finitePoint(point: ChartPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function finiteViewport(viewport: ChartViewport): boolean {
  return (
    Number.isFinite(viewport.width) &&
    Number.isFinite(viewport.height) &&
    viewport.width > 0 &&
    viewport.height > 0
  );
}

/**
 * Force a camera into the galaxy's finite 0..256 extent (D-05, T-261109-02).
 *
 * Non-finite input falls back to the whole-galaxy preset. `spanX` clamps to
 * `[CHART_MIN_SPAN_X, CHART_GALAXY_SPAN_X]`; the centre then clamps per axis so
 * the visible window cannot leave the galaxy. The x window is `spanX` wide and
 * the y window is `spanY` tall, where `spanY / 2 === spanX`; at whole-galaxy
 * zoom both axes pin the centre to 128.
 */
export function clampChartCamera(camera: ChartCamera): ChartCamera {
  if (
    camera === undefined ||
    camera === null ||
    !finitePoint(camera.centre) ||
    !Number.isFinite(camera.spanX)
  ) {
    return galaxyPreset();
  }
  const spanX = Math.min(
    CHART_GALAXY_SPAN_X,
    Math.max(CHART_MIN_SPAN_X, camera.spanX),
  );
  const halfX = spanX / 2;
  const halfY = spanX; // spanY / 2, because spanY = 2 * spanX.
  const x = Math.min(
    Math.max(camera.centre.x, Math.min(128, halfX)),
    Math.max(128, 256 - halfX),
  );
  const y = Math.min(
    Math.max(camera.centre.y, Math.min(128, halfY)),
    Math.max(128, 256 - halfY),
  );
  return { centre: { x, y }, spanX };
}

/** The local preset centred on a system (D-06). */
export function localPreset(system: System): ChartCamera {
  return clampChartCamera({
    centre: { x: system.chartX, y: system.chartY },
    spanX: CHART_LOCAL_SPAN_X,
  });
}

/** The whole-galaxy preset (D-06). */
export function galaxyPreset(): ChartCamera {
  return clampChartCamera({
    centre: { ...CHART_GALAXY_CENTRE },
    spanX: CHART_GALAXY_SPAN_X,
  });
}

/**
 * Zoom a camera around a screen anchor (D-03), purely and deterministically.
 *
 * `factor` is the multiplicative span change (below 1 zooms in) and is clamped
 * to `[0.5, 2]` before use, so one event can never jump the whole range. The
 * chart point under `anchorScreen` stays under it after the zoom. A non-finite
 * anchor or viewport returns the clamped input camera unchanged.
 */
export function zoomChartCamera(
  camera: ChartCamera,
  viewport: ChartViewport,
  anchorScreen: ChartPoint,
  factor: number,
): ChartCamera {
  const base = clampChartCamera(camera);
  if (!finiteViewport(viewport) || !finitePoint(anchorScreen)) return base;
  const safeFactor = Number.isFinite(factor)
    ? Math.min(2, Math.max(0.5, factor))
    : 1;
  const spanX = Math.min(
    CHART_GALAXY_SPAN_X,
    Math.max(CHART_MIN_SPAN_X, base.spanX * safeFactor),
  );
  const scale = cameraScale(viewport, base.spanX);
  const nextScale = cameraScale(viewport, spanX);
  // The chart point currently under the anchor.
  const anchorChartX =
    base.centre.x + (anchorScreen.x - viewport.width / 2) / scale;
  const anchorChartY =
    base.centre.y + ((anchorScreen.y - viewport.height / 2) * 2) / scale;
  // Place the new centre so that same chart point stays under the anchor.
  const centreX =
    anchorChartX - (anchorScreen.x - viewport.width / 2) / nextScale;
  const centreY =
    anchorChartY - ((anchorScreen.y - viewport.height / 2) * 2) / nextScale;
  return clampChartCamera({ centre: { x: centreX, y: centreY }, spanX });
}

/**
 * Pan a camera by a screen-pixel delta (D-04), purely and deterministically.
 *
 * A positive `dxPixels` (dragging right) moves the map right, so the centre
 * moves left. The y effect is halved by the 2:1 projection. A non-finite
 * viewport or delta returns the clamped input camera unchanged.
 */
export function panChartCamera(
  camera: ChartCamera,
  viewport: ChartViewport,
  dxPixels: number,
  dyPixels: number,
): ChartCamera {
  const base = clampChartCamera(camera);
  if (
    !finiteViewport(viewport) ||
    !Number.isFinite(dxPixels) ||
    !Number.isFinite(dyPixels)
  ) {
    return base;
  }
  const scale = cameraScale(viewport, base.spanX);
  return clampChartCamera({
    centre: {
      x: base.centre.x - dxPixels / scale,
      y: base.centre.y - (2 * dyPixels) / scale,
    },
    spanX: base.spanX,
  });
}

/** Label metrics the shell's measure callback is paired with. */
const LABEL_HEIGHT = 12;
const LABEL_OFFSET_X = 5;
const LABEL_OFFSET_Y = -5;

/** The local-zoom threshold below which collision culling sees every marker. */
const LABEL_NEAR_LIMIT = 12;

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
  return Math.min(
    viewport.width / chartSpanX,
    viewport.height / (chartSpanY / 2),
  );
}

/**
 * Map chart coordinates to screen coordinates on a centred, letterboxed 2:1
 * rectangle.
 *
 * The chart follows Oolite's orientation: screen y grows downward with galaxy
 * y. Oolite's `drawStarChart` derives a negative vertical scale
 * (`GuiDisplayGen.m:1575`) and places each star at `sys.y * vscale + voffset`
 * (`GuiDisplayGen.m:1948`), so a larger galaxy y is drawn lower. Connectivity,
 * distance and selection stay on chart coordinates and never read these pixels.
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
    y: originY + ((point.y - centre.y) / 2) * k,
  });
}

function emptyChartView(
  camera: ChartCamera,
  viewport: ChartViewport,
  currentId: string,
  targetId: string | undefined,
  selectedId: string | undefined,
): ChartView {
  const safe = clampChartCamera(camera);
  const centre: ChartPoint = { x: 0, y: 0 };
  return {
    markers: [],
    edges: [],
    labels: [],
    circle: undefined,
    projection: chartProjection(viewport, centre, safe.spanX, chartSpanY(safe)),
    currentId,
    targetId,
    selectedId,
    viewport,
    centre,
    chartSpanX: safe.spanX,
    chartSpanY: chartSpanY(safe),
  };
}

/**
 * Build the whole chart view for one frame of interaction.
 *
 * @param systems The compiled galaxy (256 records in production).
 * @param currentId The system the ship is in.
 * @param targetId The committed hyperspace target, if any.
 * @param camera The continuous camera; clamped before projection.
 * @param fuel The current fuel units (0..70); display only.
 * @param viewport The CSS-pixel canvas size.
 * @param selectedId The system currently highlighted, if any.
 */
export function buildChartView(
  systems: readonly System[],
  currentId: string,
  targetId: string | undefined,
  camera: ChartCamera,
  fuel: number,
  viewport: ChartViewport,
  selectedId: string | undefined,
): ChartView {
  const current = systems.find((system) => system.id === currentId);
  if (current === undefined) {
    // NAV-01 empty: an absent current system is a typed empty view, not a throw.
    return emptyChartView(camera, viewport, currentId, targetId, selectedId);
  }

  const safe = clampChartCamera(camera);
  const centre = safe.centre;
  const spanX = safe.spanX;
  const spanY = chartSpanY(safe);
  const projection = chartProjection(viewport, centre, spanX, spanY);
  // D-02: `visible` means inside the viewport rectangle, never a fixed window.
  const inViewport = (screen: ChartPoint): boolean =>
    screen.x >= 0 &&
    screen.x <= viewport.width &&
    screen.y >= 0 &&
    screen.y <= viewport.height;

  // Stable output order: markers, edges and labels all follow systemIndex.
  const ordered = [...systems].sort(
    (left, right) => left.systemIndex - right.systemIndex,
  );
  // All 256 systems stay in the model, so every system keeps its name.
  // `visible` says whether the marker's projected point lies inside the
  // viewport. Only visible systems are arrow-selectable and clickable, and only
  // visible markers are painted (plus current/target/selected, see chart-draw).
  const visibleIds = new Set<string>();

  const markers: ChartMarker[] = ordered.map((system) => {
    const isCurrent = system.id === currentId;
    const route = isCurrent
      ? { distanceLy: 0, fuelCost: 0, reachable: true, dist: 0 }
      : jumpBetween(
          { x: current.chartX, y: current.chartY },
          { x: system.chartX, y: system.chartY },
        );
    const reachable = isCurrent || (route.reachable && fuel >= route.fuelCost);
    let unreachableReason: ChartUnreachableReason | undefined;
    if (!reachable) {
      unreachableReason =
        route.dist > MAX_JUMP_DIST ? "too far" : "insufficient fuel";
    }
    const screen = projection({ x: system.chartX, y: system.chartY });
    const visible = inViewport(screen);
    if (visible) visibleIds.add(system.id);
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
      visible,
    };
  });

  const edges: ChartEdge[] = [];
  for (let left = 0; left < ordered.length; left += 1) {
    const from = ordered[left];
    if (from === undefined) continue;
    for (let right = left + 1; right < ordered.length; right += 1) {
      const to = ordered[right];
      if (to === undefined) continue;
      // Generalised range filter: skip an edge only when both endpoints are
      // off-viewport. At galaxy zoom every system is visible, so all 7 LY
      // edges draw.
      if (!visibleIds.has(from.id) && !visibleIds.has(to.id)) {
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
            (Math.max(0, fuel) / 4) * projectionScale(viewport, spanX, spanY),
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
    viewport,
    centre,
    chartSpanX: spanX,
    chartSpanY: spanY,
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
    if (!marker.visible) continue;
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
 * The ids the player can see in the current viewport. Arrow selection may only
 * land on these, so a press never names an unpainted system.
 */
export function visibleSystemIds(view: ChartView): ReadonlySet<string> {
  return new Set(
    view.markers.filter((marker) => marker.visible).map((marker) => marker.id),
  );
}

/**
 * The nearest system in the forward cone of `(dirX, dirY)`, in distance space.
 *
 * A candidate is in the cone only when it makes forward progress and its
 * lateral offset is no larger than that progress (a 45-degree half-angle), so
 * a system well off the requested axis is never chosen. Among cone candidates
 * the score is the squared distance, so the nearest system wins and an
 * alignment-dominated far system cannot beat a near one. Exact ties resolve by
 * `systemIndex`. Pass only the visible systems to get a painted selection.
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
    if (lateral > forward) continue;
    const score = dx * dx + dy * dy;
    if (
      best === undefined ||
      score < bestScore ||
      (score === bestScore && candidate.systemIndex < best.systemIndex)
    ) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/** The four arrow keys the galactic chart answers to. */
export type ChartArrow = "up" | "down" | "left" | "right";

/**
 * The direction one arrow points, in distance space, for `nearestInDirection`.
 *
 * The chart follows Oolite's orientation (`GuiDisplayGen.m:1575`, negative
 * vertical scale), so screen-up is decreasing chart-y: up is `dirY = -1` and
 * down is `dirY = +1`. `nearestInDirection` halves chart-y itself, so only the
 * sign of `dirY` depends on the orientation. The candidate rule and the
 * distance metric do not.
 */
const CHART_ARROW_VECTORS: Readonly<
  Record<ChartArrow, { readonly dirX: number; readonly dirY: number }>
> = {
  up: { dirX: 0, dirY: -1 },
  down: { dirX: 0, dirY: 1 },
  left: { dirX: -1, dirY: 0 },
  right: { dirX: 1, dirY: 0 },
};

/** The distance-space direction an arrow key selects along. */
export function chartArrowVector(arrow: ChartArrow): {
  readonly dirX: number;
  readonly dirY: number;
} {
  return { ...CHART_ARROW_VECTORS[arrow] };
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
  left: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  },
  right: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  },
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
 * Systems are visited in `systemIndex` order. The current system, the committed
 * target and the selection always draw, even off-viewport. At galaxy zoom
 * (`chartSpanX >= 128`) the only non-forced candidates are the 12 visible
 * systems nearest the camera centre, so 256 names never cover the map; as the
 * view zooms in, collision culling over every visible marker applies and more
 * names appear (D-08). Unreachable systems are dimmed, never suppressed. Text
 * measurement is injected because the model has no canvas.
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
  const forced = (marker: ChartMarker): boolean =>
    marker.isCurrent || marker.isTarget || marker.isSelected;

  // At far zoom, restrict non-forced candidates to the nearest few visible
  // systems by squared chart distance (distance space: the y delta is halved).
  let nearCandidateIds: ReadonlySet<string> | undefined;
  if (view.chartSpanX >= 128) {
    const scored = view.markers
      .filter((marker) => marker.visible && !forced(marker))
      .map((marker) => {
        const dx = marker.chartX - view.centre.x;
        const dy = (marker.chartY - view.centre.y) / 2;
        return { marker, score: dx * dx + dy * dy };
      })
      .sort(
        (left, right) =>
          left.score - right.score ||
          left.marker.systemIndex - right.marker.systemIndex,
      )
      .slice(0, LABEL_NEAR_LIMIT);
    nearCandidateIds = new Set(scored.map((entry) => entry.marker.id));
  }

  for (const marker of view.markers) {
    const forcedLabel = forced(marker);
    if (!forcedLabel) {
      if (!marker.visible) continue;
      if (nearCandidateIds !== undefined && !nearCandidateIds.has(marker.id)) {
        continue;
      }
    }
    const width = measure(marker.name);
    const x = marker.screenX + LABEL_OFFSET_X;
    const y = marker.screenY + LABEL_OFFSET_Y;
    const box = { x, y: y - LABEL_HEIGHT, width, height: LABEL_HEIGHT };
    if (!forcedLabel && accepted.some((other) => intersects(other, box))) {
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
