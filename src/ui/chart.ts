// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The galactic chart DOM shell (NAV-01, NAV-02, D-01, D-02, D-04).
 *
 * This module owns the `#chart` overlay, the single `#chart-canvas`, its
 * backing store and the pointer listener. It is deliberately dumb: the pure
 * `chart-model.ts` decides what exists, `chart-draw.ts` paints it, and the
 * session decides what a click means. The shell never mutates the selection.
 *
 * Canvas lifecycle follows `src/render/hud/hud.ts`: the backing store is the
 * CSS size times a DPR capped at 2, a 0x0 size paints nothing, and repaints
 * happen on open, selection, range and non-zero resize only. There is no
 * `requestAnimationFrame` loop (T-06-10).
 *
 * Every dynamic string is written with `textContent`. The overlay is a sibling
 * of `#docked` and contains no `<footer>` element; the document disclaimer
 * stays the only one.
 */

import { CHART_FONT, drawChart, needsChartRepaint } from "./chart-draw.js";
import { chartGoodsReadout, hitTest, selectLabels } from "./chart-model.js";
import type { ChartView, ChartViewport } from "./chart-model.js";

const MAX_DEVICE_PIXEL_RATIO = 2;
const HIT_RADIUS = 14;
const KEY_HINT =
  "Click: select  Arrows: next  Tab: range  Enter: commit  Esc: close";

/** The chart shell was handed markup it cannot drive. */
export class ChartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChartError";
  }
}

export interface ChartOverlay {
  /** Reveal the overlay and paint one frame. */
  show(view: ChartView): void;
  /** Install the session's view builder for the current viewport. */
  setViewBuilder(build: (viewport: ChartViewport) => ChartView): void;
  /** The current CSS-pixel canvas size. */
  viewport(): ChartViewport;
  /** Offer a new view; repaint only when the policy agrees. */
  view(next: ChartView): void;
  hide(): void;
  /** Route a marker click to the session. */
  onSelect(handler: (systemId: string) => void): void;
  dispose(): void;
}

function requireElement<T extends HTMLElement>(
  root: HTMLElement,
  selector: string,
  description: string,
): T {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new ChartError(
      `Wegolite: the chart shell is missing ${description}.`,
    );
  }
  return element as T;
}

function requireContext2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new ChartError(
      "Wegolite: the chart canvas has no 2D rendering context; the galactic chart cannot be drawn.",
    );
  }
  return context;
}

export function createChart(root: HTMLElement): ChartOverlay {
  const overlay =
    root.id === "chart"
      ? root
      : requireElement<HTMLElement>(root, "#chart", 'the "#chart" overlay');
  const canvas = requireElement<HTMLCanvasElement>(
    overlay,
    "#chart-canvas",
    'the "#chart-canvas" canvas',
  );
  const targetField = requireElement<HTMLElement>(
    overlay,
    '[data-field="chart-target"]',
    'the "chart-target" field',
  );
  const distanceField = requireElement<HTMLElement>(
    overlay,
    '[data-field="chart-distance"]',
    'the "chart-distance" field',
  );
  const fuelField = requireElement<HTMLElement>(
    overlay,
    '[data-field="chart-fuel"]',
    'the "chart-fuel" field',
  );
  const keysField = requireElement<HTMLElement>(
    overlay,
    '[data-field="chart-keys"]',
    'the "chart-keys" field',
  );

  const context = requireContext2d(canvas);
  const controller = new AbortController();
  let current: ChartView | undefined;
  let builder: ((viewport: ChartViewport) => ChartView) | undefined;
  let selectHandler: ((systemId: string) => void) | undefined;
  let paints = 0;
  let lastSize: ChartViewport = { width: 0, height: 0 };

  function viewport(): ChartViewport {
    return { width: canvas.clientWidth, height: canvas.clientHeight };
  }

  function applyBackingStore(size: ChartViewport): void {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    const width = Math.round(size.width * dpr);
    const height = Math.round(size.height * dpr);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function complete(view: ChartView): ChartView {
    context.font = CHART_FONT;
    return {
      ...view,
      labels: selectLabels(view, (text) => context.measureText(text).width),
    };
  }

  function renderReadout(view: ChartView): void {
    const selectedId = view.selectedId ?? view.currentId;
    const readout = chartGoodsReadout(view, selectedId);
    const reason =
      readout !== undefined && readout.reason !== undefined
        ? ` (${readout.reason})`
        : "";
    targetField.textContent =
      readout === undefined ? "No system" : `${readout.name}${reason}`;
    distanceField.textContent =
      readout === undefined ? "--" : `${readout.distanceLy.toFixed(1)} LY`;
    fuelField.textContent =
      readout === undefined ? "--" : `${String(readout.fuelCost)} fuel units`;
    keysField.textContent = KEY_HINT;
  }

  function paint(view: ChartView): void {
    const size = viewport();
    if (size.width < 1 || size.height < 1) return;
    applyBackingStore(size);
    if (!drawChart(context, view, size)) return;
    paints += 1;
    canvas.setAttribute("data-paints", String(paints));
    renderReadout(view);
    lastSize = size;
  }

  function handleResize(): void {
    const size = viewport();
    if (size.width < 1 || size.height < 1) return;
    if (size.width === lastSize.width && size.height === lastSize.height) {
      return;
    }
    lastSize = size;
    applyBackingStore(size);
    if (current === undefined) return;
    // The projection is baked into the view, so repainting the old view after
    // a resize would place markers with the old scale and origin.
    if (builder !== undefined) current = complete(builder(size));
    paint(current);
  }

  function onClick(event: MouseEvent): void {
    if (current === undefined || selectHandler === undefined) return;
    const size = viewport();
    const rect = canvas.getBoundingClientRect();
    if (
      size.width < 1 ||
      size.height < 1 ||
      rect.width < 1 ||
      rect.height < 1
    ) {
      return;
    }
    const x = ((event.clientX - rect.left) / rect.width) * size.width;
    const y = ((event.clientY - rect.top) / rect.height) * size.height;
    const marker = hitTest(current, { x, y }, HIT_RADIUS);
    if (marker !== undefined) selectHandler(marker.id);
  }

  canvas.addEventListener("click", onClick, { signal: controller.signal });

  let resizeObserver: ResizeObserver | undefined;
  if (typeof ResizeObserver === "function") {
    resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(canvas);
  } else {
    window.addEventListener("resize", handleResize, {
      signal: controller.signal,
    });
  }

  return {
    show(view: ChartView): void {
      overlay.hidden = false;
      lastSize = { width: 0, height: 0 };
      const size = viewport();
      if (size.width >= 1 && size.height >= 1) applyBackingStore(size);
      current = complete(view);
      paint(current);
    },
    setViewBuilder(build: (viewport: ChartViewport) => ChartView): void {
      builder = build;
    },
    viewport,
    view(next: ChartView): void {
      const completed = complete(next);
      if (!needsChartRepaint(current, completed)) return;
      current = completed;
      if (!overlay.hidden) paint(completed);
    },
    hide(): void {
      overlay.hidden = true;
    },
    onSelect(handler: (systemId: string) => void): void {
      selectHandler = handler;
    },
    dispose(): void {
      controller.abort();
      resizeObserver?.disconnect();
      resizeObserver = undefined;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      current = undefined;
      builder = undefined;
      selectHandler = undefined;
      overlay.hidden = true;
    },
  };
}
