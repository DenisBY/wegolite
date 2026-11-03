// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The HUD canvas lifecycle (D-05, D-08, Pitfall 10).
 *
 * One `<canvas id="hud">` over the WebGL canvas, `pointer-events: none` and
 * `aria-hidden`. The backing store is the CSS size times a DPR capped at 2; the
 * design space is a fixed 1920x1080 and is scaled *uniformly* with centred
 * offsets, so an ultrawide window letterboxes rather than stretching.
 */

import {
  drawHud,
  HUD_DESIGN_HEIGHT,
  HUD_DESIGN_WIDTH,
  HUD_ELEMENTS,
  HUD_LAYOUT,
} from "./draw.js";
import type { HudModel } from "./draw.js";

const MAX_DEVICE_PIXEL_RATIO = 2;

export type HudBounds = Readonly<
  Record<string, readonly [number, number, number, number]>
>;

export interface Hud {
  resize(): void;
  draw(model: HudModel): void;
  readonly elements: readonly string[];
  readonly designScale: number;
  readonly letterbox: readonly [number, number];
  readonly bounds: HudBounds;
  readonly drawn: boolean;
  dispose(): void;
}

function buildBounds(): HudBounds {
  const bounds: Record<string, readonly [number, number, number, number]> = {};
  for (const [id, rect] of Object.entries(HUD_LAYOUT)) {
    bounds[id] = [rect.x, rect.y, rect.width, rect.height];
  }
  return bounds;
}

function requireContext2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error(
      "Wegolite: the HUD canvas has no 2D rendering context; the flight HUD cannot be drawn.",
    );
  }
  return context;
}

export function createHud(canvas: HTMLCanvasElement): Hud {
  const context = requireContext2d(canvas);
  const bounds = buildBounds();

  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let drawn = false;
  let watchedDpr = 0;
  let dprQuery: MediaQueryList | undefined;

  function applyTransform(): void {
    context.setTransform(scale, 0, 0, scale, offsetX, offsetY);
  }

  function onDprChange(): void {
    resize();
  }

  function watchDpr(dpr: number): void {
    if (dpr === watchedDpr) return;
    watchedDpr = dpr;
    dprQuery?.removeEventListener("change", onDprChange);
    // A DPR change without a resize event (moving between displays) must still
    // reallocate the backing store; the media query is the only browser signal.
    if (typeof window.matchMedia !== "function") return;
    dprQuery = window.matchMedia(`(resolution: ${dpr}dppx)`);
    dprQuery.addEventListener("change", onDprChange);
  }

  function resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    // A minimised or hidden window reports zero; resizing to it would compute
    // an empty backing store and a zero scale.
    if (width === 0 || height === 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    scale = Math.min(
      canvas.width / HUD_DESIGN_WIDTH,
      canvas.height / HUD_DESIGN_HEIGHT,
    );
    offsetX = (canvas.width - HUD_DESIGN_WIDTH * scale) / 2;
    offsetY = (canvas.height - HUD_DESIGN_HEIGHT * scale) / 2;
    applyTransform();
    watchDpr(dpr);
  }

  function draw(model: HudModel): void {
    // A 0x0 backing store has no transform to draw with; skip the frame rather
    // than set a zero scale (Pitfall 10).
    if (canvas.width === 0 || canvas.height === 0) return;
    applyTransform();
    drawHud(context, model);
    drawn = true;
  }

  function dispose(): void {
    dprQuery?.removeEventListener("change", onDprChange);
    dprQuery = undefined;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawn = false;
  }

  return {
    resize,
    draw,
    get elements(): readonly string[] {
      return HUD_ELEMENTS;
    },
    get designScale(): number {
      return scale;
    },
    get letterbox(): readonly [number, number] {
      return [offsetX, offsetY];
    },
    get bounds(): HudBounds {
      return bounds;
    },
    get drawn(): boolean {
      return drawn;
    },
    dispose,
  };
}
