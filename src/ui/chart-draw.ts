// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The pure Canvas2D chart painter and repaint policy (NAV-01, D-02, D-04,
 * T-06-10).
 *
 * Following `src/render/hud/draw.ts`, this module receives an
 * already-transformed `CanvasRenderingContext2D` and a model view. It never
 * queries the DOM, sizes a canvas or schedules a frame: the shell owns the
 * canvas lifecycle, and this painter only draws. That split makes the draw
 * order, the 0x0 skip and the paint-on-change policy unit-testable in the
 * Node-only Vitest project.
 *
 * Paint order is fixed: clear, graph edges, the fuel circle, the
 * current-to-target line, the markers, then the labels. The chart is a static
 * plot: the shell paints on open, selection, camera and resize only. Wheel and
 * drag gestures are coalesced by the shell into one requestAnimationFrame; this
 * module never schedules a frame itself (T-06-10, D-09).
 */

import type { ChartView } from "./chart-model.js";

export const CHART_FONT =
  "12px ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";
export const CHART_EDGE_COLOR = "#1a5a2c";
export const CHART_CIRCLE_COLOR = "#245f30";
export const CHART_TARGET_LINE_COLOR = "#ffb000";
export const CHART_MARKER_COLOR = "#33ff66";
export const CHART_CURRENT_COLOR = "#ffffff";
export const CHART_TARGET_COLOR = "#ffb000";
export const CHART_SELECTED_COLOR = "#ffd966";
export const CHART_UNREACHABLE_COLOR = "#2a5a35";
export const CHART_LABEL_COLOR = "#33ff66";
export const CHART_DIMMED_LABEL_COLOR = "#2a5a35";

/** The CSS-pixel canvas size the shell measured. */
export interface ChartSize {
  readonly width: number;
  readonly height: number;
}

function markerColour(marker: ChartView["markers"][number]): string {
  if (marker.isCurrent) return CHART_CURRENT_COLOR;
  if (marker.isTarget) return CHART_TARGET_COLOR;
  if (marker.isSelected) return CHART_SELECTED_COLOR;
  return marker.reachable ? CHART_MARKER_COLOR : CHART_UNREACHABLE_COLOR;
}

function markerRadius(marker: ChartView["markers"][number]): number {
  if (marker.isCurrent) return 5;
  if (marker.isTarget || marker.isSelected) return 4.5;
  return 3.5;
}

/**
 * Paint one chart view into the given CSS-pixel size.
 *
 * @returns `false` (and makes no context call) when the size is empty.
 */
export function drawChart(
  context: CanvasRenderingContext2D,
  view: ChartView,
  size: ChartSize,
): boolean {
  // A 0x0 backing store has nothing to clear or draw; skip before touching the
  // context at all (Pitfall 10).
  if (size.width < 1 || size.height < 1) return false;

  context.clearRect(0, 0, size.width, size.height);

  // 1. The 7 LY graph. One path keeps the 875 edges to a single stroke.
  context.strokeStyle = CHART_EDGE_COLOR;
  context.lineWidth = 1;
  context.beginPath();
  for (const edge of view.edges) {
    context.moveTo(edge.x1, edge.y1);
    context.lineTo(edge.x2, edge.y2);
  }
  context.stroke();

  // 2. The fuel circle, from the model's chart-unit radius, never pixels.
  if (view.circle !== undefined) {
    context.strokeStyle = CHART_CIRCLE_COLOR;
    context.lineWidth = 1;
    context.beginPath();
    context.arc(
      view.circle.x,
      view.circle.y,
      view.circle.radius,
      0,
      Math.PI * 2,
    );
    context.stroke();
  }

  // 3. The current-to-target line, dashed and amber so it cannot be mistaken
  // for a graph edge.
  const current = view.markers.find((marker) => marker.isCurrent);
  const target =
    view.targetId === undefined
      ? undefined
      : view.markers.find((marker) => marker.id === view.targetId);
  if (
    current !== undefined &&
    target !== undefined &&
    target.id !== current.id
  ) {
    context.strokeStyle = CHART_TARGET_LINE_COLOR;
    context.lineWidth = 1.5;
    context.setLineDash([6, 4]);
    context.beginPath();
    context.moveTo(current.screenX, current.screenY);
    context.lineTo(target.screenX, target.screenY);
    context.stroke();
    context.setLineDash([]);
  }

  // 4. Markers: current, target and selection are visually distinct;
  // unreachable systems stay present and dimmed.
  context.font = CHART_FONT;
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  for (const marker of view.markers) {
    // G-5: a selection that a pan or zoom moved off-viewport still paints, so
    // the readout never names a marker the player cannot see.
    if (
      !marker.visible &&
      !marker.isCurrent &&
      !marker.isTarget &&
      !marker.isSelected
    ) {
      continue;
    }
    context.fillStyle = markerColour(marker);
    context.beginPath();
    context.arc(
      marker.screenX,
      marker.screenY,
      markerRadius(marker),
      0,
      Math.PI * 2,
    );
    context.fill();
  }

  // 5. Labels, filled by the shell with `selectLabels`.
  context.font = CHART_FONT;
  for (const label of view.labels) {
    context.fillStyle = label.dimmed
      ? CHART_DIMMED_LABEL_COLOR
      : CHART_LABEL_COLOR;
    context.fillText(label.text, label.x, label.y);
  }

  return true;
}

/**
 * Whether the shell must repaint for `next`.
 *
 * False for the same reference, for a structurally equal view, and whenever
 * the next viewport is 0x0. True for a first paint and for any change in the
 * camera centre or span, current/target/selection, the marker/edge/label set
 * or the viewport (D-09).
 */
export function needsChartRepaint(
  previous: ChartView | undefined,
  next: ChartView,
): boolean {
  if (next.viewport.width < 1 || next.viewport.height < 1) return false;
  if (previous === undefined) return true;
  if (previous === next) return false;
  return (
    previous.centre.x !== next.centre.x ||
    previous.centre.y !== next.centre.y ||
    previous.chartSpanX !== next.chartSpanX ||
    previous.chartSpanY !== next.chartSpanY ||
    previous.currentId !== next.currentId ||
    previous.targetId !== next.targetId ||
    previous.selectedId !== next.selectedId ||
    previous.markers.length !== next.markers.length ||
    previous.edges.length !== next.edges.length ||
    previous.labels.length !== next.labels.length ||
    previous.viewport.width !== next.viewport.width ||
    previous.viewport.height !== next.viewport.height
  );
}
