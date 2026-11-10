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
 * stays the only one. Its bottom area is the shared two-line station footer:
 * the session pushes the live key hints, and the readout is one info status
 * line.
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
import { createStationFooter } from "./station-footer.js";

const MAX_DEVICE_PIXEL_RATIO = 2;
const HIT_RADIUS = 14;
const DRAG_THRESHOLD = 3;

/** The chart shell was handed markup it cannot drive. */
export class ChartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChartError";
  }
}

/** One labelled row in the hover card. */
export interface ChartTooltipField {
  readonly label: string;
  readonly value: string;
}

/** The hover card contents, built by the session from the system record. */
export interface ChartTooltipModel {
  readonly title: string;
  readonly fields: readonly ChartTooltipField[];
  readonly description?: string | undefined;
}

export interface ChartOverlay {
  /** Reveal the overlay and paint one frame. */
  show(view: ChartView): void;
  /** Install the session's view builder for the current viewport. */
  setViewBuilder(build: (viewport: ChartViewport) => ChartView): void;
  /** Install the session's hover-card builder. */
  setTooltipBuilder(
    build: (systemId: string) => ChartTooltipModel | undefined,
  ): void;
  /** The current CSS-pixel canvas size. */
  viewport(): ChartViewport;
  /** Write the live key-hint line; the session owns the binding map. */
  setHints(text: string): void;
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
  const footer = createStationFooter(overlay);
  const tooltip = requireElement<HTMLElement>(
    overlay,
    "#chart-tooltip",
    'the "#chart-tooltip" card',
  );
  const tooltipTitle = requireElement<HTMLElement>(
    tooltip,
    '[data-field="chart-tooltip-title"]',
    'the "chart-tooltip-title" field',
  );
  const tooltipFields = requireElement<HTMLElement>(
    tooltip,
    "[data-chart-tooltip-fields]",
    'the "chart-tooltip-fields" list',
  );
  const tooltipDescription = requireElement<HTMLElement>(
    tooltip,
    '[data-field="chart-tooltip-description"]',
    'the "chart-tooltip-description" field',
  );

  const context = requireContext2d(canvas);
  const controller = new AbortController();
  let current: ChartView | undefined;
  let builder: ((viewport: ChartViewport) => ChartView) | undefined;
  let selectHandler: ((systemId: string) => void) | undefined;
  let cameraHandler: ((camera: ChartCamera) => void) | undefined;
  let tooltipBuilder:
    ((systemId: string) => ChartTooltipModel | undefined) | undefined;
  let hoveredId: string | undefined;
  let hoverClient:
    { readonly clientX: number; readonly clientY: number } | undefined;
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
    // One information line: target · distance · fuel. The old separate amber
    // target line is intentionally replaced by this single info-tone line.
    const target =
      readout === undefined ? "No system" : `${readout.name}${reason}`;
    const distance =
      readout === undefined ? "--" : `${readout.distanceLy.toFixed(1)} LY`;
    const fuel =
      readout === undefined ? "--" : `${String(readout.fuelCost)} fuel units`;
    footer.setStatus({ info: `${target} · ${distance} · ${fuel}` });
  }

  /** Hide the hover card without forgetting where the pointer is. */
  function clearTooltip(): void {
    hoveredId = undefined;
    tooltip.hidden = true;
    canvas.classList.remove("over-marker");
  }

  function renderTooltipContent(model: ChartTooltipModel): void {
    tooltipTitle.textContent = model.title;
    tooltipFields.replaceChildren();
    for (const field of model.fields) {
      const term = document.createElement("dt");
      const value = document.createElement("dd");
      term.textContent = field.label;
      value.textContent = field.value;
      tooltipFields.append(term, value);
    }
    const description = model.description?.trim() ?? "";
    tooltipDescription.textContent = description;
    tooltipDescription.hidden = description.length === 0;
  }

  /** Place the card beside the pointer, clamped inside the overlay. */
  function positionTooltip(clientX: number, clientY: number): void {
    const rect = overlay.getBoundingClientRect();
    const gap = 16;
    const margin = 8;
    let left = clientX - rect.left + gap;
    let top = clientY - rect.top + gap;
    if (left + tooltip.offsetWidth + margin > rect.width) {
      left = clientX - rect.left - tooltip.offsetWidth - gap;
    }
    if (top + tooltip.offsetHeight + margin > rect.height) {
      top = clientY - rect.top - tooltip.offsetHeight - gap;
    }
    tooltip.style.left = `${Math.max(margin, left)}px`;
    tooltip.style.top = `${Math.max(margin, top)}px`;
  }

  /**
   * Resolve the marker under a client point and refresh the card when the
   * hovered system changes. The session owns the contents; the shell owns the
   * positioning and the show/hide policy.
   */
  function refreshHover(clientX: number, clientY: number): void {
    hoverClient = { clientX, clientY };
    if (drag !== undefined || current === undefined) {
      clearTooltip();
      return;
    }
    const point = clientToCanvas(clientX, clientY);
    if (point === undefined) {
      clearTooltip();
      return;
    }
    const marker = hitTest(current, point, HIT_RADIUS);
    if (marker === undefined) {
      clearTooltip();
      return;
    }
    canvas.classList.add("over-marker");
    if (marker.id !== hoveredId) {
      hoveredId = marker.id;
      const model = tooltipBuilder?.(marker.id);
      if (model === undefined) {
        clearTooltip();
        return;
      }
      renderTooltipContent(model);
    }
    tooltip.hidden = false;
    positionTooltip(clientX, clientY);
  }

  function refreshHoverAtPointer(): void {
    if (hoverClient === undefined) return;
    refreshHover(hoverClient.clientX, hoverClient.clientY);
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
    hoverClient = undefined;
    clearTooltip();
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
    if (drag === undefined) {
      if (event.pointerType !== "touch") {
        refreshHover(event.clientX, event.clientY);
      }
      return;
    }
    if (event.pointerId !== drag.pointerId) return;
    const totalX = event.clientX - drag.startX;
    const totalY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(totalX, totalY) > DRAG_THRESHOLD) {
      drag.moved = true;
      hoverClient = undefined;
      clearTooltip();
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

  function onPointerLeave(): void {
    if (drag !== undefined) return;
    hoverClient = undefined;
    clearTooltip();
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
  canvas.addEventListener("pointerleave", onPointerLeave, {
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
    // The in-flow footer changes the canvas height on mount and on any footer
    // reflow; observing it as well makes that resize repaint the plot at the
    // new viewport instead of leaving a stale projection.
    resizeObserver.observe(canvas);
    resizeObserver.observe(footer.element);
  } else {
    window.addEventListener("resize", handleResize, {
      signal: controller.signal,
    });
  }

  return {
    show(view: ChartView): void {
      resetGestures();
      hoverClient = undefined;
      clearTooltip();
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
    setTooltipBuilder(
      build: (systemId: string) => ChartTooltipModel | undefined,
    ): void {
      tooltipBuilder = build;
    },
    viewport,
    setHints(text: string): void {
      footer.setHints(text);
    },
    view(next: ChartView): void {
      const completed = complete(next);
      if (!needsChartRepaint(current, completed)) return;
      current = completed;
      if (!overlay.hidden) {
        paint(completed);
        refreshHoverAtPointer();
      }
    },
    hide(): void {
      resetGestures();
      hoverClient = undefined;
      clearTooltip();
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
      footer.dispose();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      current = undefined;
      builder = undefined;
      tooltipBuilder = undefined;
      selectHandler = undefined;
      cameraHandler = undefined;
      hoverClient = undefined;
      clearTooltip();
      overlay.hidden = true;
    },
  };
}
