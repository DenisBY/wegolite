// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The galactic chart DOM shell (NAV-01, NAV-02, D-01, D-02, D-04).
 *
 * This module owns the `#chart` overlay, the single `#chart-canvas`, its
 * backing store and the pointer/wheel listeners. It is deliberately dumb: the
 * pure `chart-model.ts` decides what exists, `chart-draw.ts` paints it, and the
 * session decides what a click means. The shell never mutates the selection.
 *
 * Canvas lifecycle follows `src/render/hud/hud.ts`: the backing store is the
 * CSS size times a DPR capped at 2, a 0x0 size paints nothing, and repaints
 * happen on open, selection, camera and non-zero resize only. There is no
 * animation loop; wheel and drag gestures are coalesced into a single
 * requestAnimationFrame slot (D-09, T-06-10). Open, selection and resize paint
 * immediately.
 *
 * Every dynamic string is written with `textContent`. The overlay is a sibling
 * of `#docked` and contains no `<footer>` element; the document disclaimer
 * stays the only one.
 */

import { CHART_FONT, drawChart, needsChartRepaint } from "./chart-draw.js";
import {
  chartGoodsReadout,
  hitTest,
  panChartCamera,
  selectLabels,
  zoomChartCamera,
} from "./chart-model.js";
import type { ChartCamera, ChartView, ChartViewport } from "./chart-model.js";

const MAX_DEVICE_PIXEL_RATIO = 2;
const HIT_RADIUS = 14;
const DRAG_THRESHOLD = 3;
const KEY_HINT =
  "Click: select  Arrows: next  Tab: preset  Enter: commit  Esc: close";

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
  /** Route a coalesced wheel/drag camera change to the session. */
  onCamera(handler: (camera: ChartCamera) => void): void;
  dispose(): void;
}

interface DragState {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
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
  let cameraHandler: ((camera: ChartCamera) => void) | undefined;
  let paints = 0;
  let lastSize: ChartViewport = { width: 0, height: 0 };
  // Gesture state. A candidate camera is computed per event and flushed once
  // per animation frame; nothing here starts a continuous loop (D-09).
  let pendingCamera: ChartCamera | undefined;
  let rafId = 0;
  let drag: DragState | undefined;
  let suppressClick = false;

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

  /** The camera a gesture builds on: the pending one, else the painted view. */
  function gestureCamera(): ChartCamera | undefined {
    if (pendingCamera !== undefined) return pendingCamera;
    if (current === undefined) return undefined;
    return { centre: current.centre, spanX: current.chartSpanX };
  }

  /** Flush the newest candidate camera in the next animation frame (D-09). */
  function scheduleFlush(): void {
    if (rafId !== 0) return;
    rafId = window.requestAnimationFrame(() => {
      rafId = 0;
      const camera = pendingCamera;
      pendingCamera = undefined;
      if (camera !== undefined) cameraHandler?.(camera);
    });
  }

  /** Map a client point to canvas CSS pixels, or undefined outside the box. */
  function clientToCanvas(
    clientX: number,
    clientY: number,
  ): { readonly x: number; readonly y: number } | undefined {
    const size = viewport();
    const rect = canvas.getBoundingClientRect();
    if (
      size.width < 1 ||
      size.height < 1 ||
      rect.width < 1 ||
      rect.height < 1
    ) {
      return undefined;
    }
    return {
      x: ((clientX - rect.left) / rect.width) * size.width,
      y: ((clientY - rect.top) / rect.height) * size.height,
    };
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    const base = gestureCamera();
    if (base === undefined) return;
    const size = viewport();
    const anchor = clientToCanvas(event.clientX, event.clientY);
    if (anchor === undefined) return;
    // Normalise the delta mode, then clamp the per-event factor to 0.5..2 so a
    // flood cannot jump the whole range (D-03, T-261109-01).
    const unit =
      event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.height : 1;
    const factor = Math.min(
      2,
      Math.max(0.5, Math.pow(1.15, (event.deltaY * unit) / 100)),
    );
    pendingCamera = zoomChartCamera(base, size, anchor, factor);
    scheduleFlush();
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    if (gestureCamera() === undefined) return;
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    };
    canvas.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent): void {
    if (drag === undefined || event.pointerId !== drag.pointerId) return;
    const totalX = event.clientX - drag.startX;
    const totalY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(totalX, totalY) > DRAG_THRESHOLD) {
      drag.moved = true;
    }
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    if (!drag.moved) return;
    const base = gestureCamera();
    if (base === undefined) return;
    const size = viewport();
    if (size.width < 1 || size.height < 1) return;
    canvas.classList.add("dragging");
    pendingCamera = panChartCamera(base, size, dx, dy);
    scheduleFlush();
  }

  function endDrag(event: PointerEvent): void {
    if (drag === undefined || event.pointerId !== drag.pointerId) return;
    const moved = drag.moved;
    drag = undefined;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    canvas.classList.remove("dragging");
    // A drag must not select the marker it started on; suppress the click that
    // the browser fires after pointerup (D-04).
    if (moved) suppressClick = true;
  }

  /** Drop gesture state without touching the painted view. */
  function resetGestures(): void {
    pendingCamera = undefined;
    if (rafId !== 0) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    drag = undefined;
    suppressClick = false;
    canvas.classList.remove("dragging");
  }

  function onClick(event: MouseEvent): void {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
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
  canvas.addEventListener("wheel", onWheel, {
    passive: false,
    signal: controller.signal,
  });
  canvas.addEventListener("pointerdown", onPointerDown, {
    signal: controller.signal,
  });
  canvas.addEventListener("pointermove", onPointerMove, {
    signal: controller.signal,
  });
  canvas.addEventListener("pointerup", endDrag, { signal: controller.signal });
  canvas.addEventListener("pointercancel", endDrag, {
    signal: controller.signal,
  });
  canvas.addEventListener("lostpointercapture", endDrag, {
    signal: controller.signal,
  });

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
      resetGestures();
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
      resetGestures();
      overlay.hidden = true;
    },
    onSelect(handler: (systemId: string) => void): void {
      selectHandler = handler;
    },
    onCamera(handler: (camera: ChartCamera) => void): void {
      cameraHandler = handler;
    },
    dispose(): void {
      controller.abort();
      resetGestures();
      resizeObserver?.disconnect();
      resizeObserver = undefined;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      current = undefined;
      builder = undefined;
      selectHandler = undefined;
      cameraHandler = undefined;
      overlay.hidden = true;
    },
  };
}
