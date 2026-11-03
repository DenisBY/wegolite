// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The minimal flight HUD (FLGT-05, D-05, D-06, D-08).
 *
 * Canvas2D only: no DOM, no SVG and no in-scene geometry. `draw.ts` receives an
 * already-transformed context and draws in the fixed 1920x1080 design space, so
 * the letterbox maths lives once in `hud.ts`. The tracer draws the five elements
 * the phase needs to be playable; plan 05 adds the scanner, compass, aegis and
 * bars to the same model.
 */

import { formatClock, formatSpeed } from "./format.js";

export const HUD_DESIGN_WIDTH = 1920;
export const HUD_DESIGN_HEIGHT = 1080;

/** The classic green vector palette (D-06, A5). */
export const HUD_COLOR = "#33ff66";

/** The element ids the probe publishes; plan 05 extends this list. */
export const HUD_ELEMENTS: readonly string[] = [
  "crosshair",
  "speed",
  "clock",
  "condition",
  "message",
];

export interface HudModel {
  readonly speed: number;
  readonly clockSeconds: number;
  readonly message: string;
  readonly condition: "green" | "yellow" | "red";
  readonly massLocked: boolean;
  readonly scannerRange: number;
}

const CROSSHAIR_X = HUD_DESIGN_WIDTH / 2;
const CROSSHAIR_Y = HUD_DESIGN_HEIGHT / 2;
const CROSSHAIR_GAP = 10;
const CROSSHAIR_ARM = 26;

function drawCrosshair(context: CanvasRenderingContext2D): void {
  context.strokeStyle = HUD_COLOR;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(CROSSHAIR_X - CROSSHAIR_GAP - CROSSHAIR_ARM, CROSSHAIR_Y);
  context.lineTo(CROSSHAIR_X - CROSSHAIR_GAP, CROSSHAIR_Y);
  context.moveTo(CROSSHAIR_X + CROSSHAIR_GAP, CROSSHAIR_Y);
  context.lineTo(CROSSHAIR_X + CROSSHAIR_GAP + CROSSHAIR_ARM, CROSSHAIR_Y);
  context.moveTo(CROSSHAIR_X, CROSSHAIR_Y - CROSSHAIR_GAP - CROSSHAIR_ARM);
  context.lineTo(CROSSHAIR_X, CROSSHAIR_Y - CROSSHAIR_GAP);
  context.moveTo(CROSSHAIR_X, CROSSHAIR_Y + CROSSHAIR_GAP);
  context.lineTo(CROSSHAIR_X, CROSSHAIR_Y + CROSSHAIR_GAP + CROSSHAIR_ARM);
  context.stroke();
}

function drawCondition(
  context: CanvasRenderingContext2D,
  condition: HudModel["condition"],
): void {
  const colors: Record<HudModel["condition"], string> = {
    green: HUD_COLOR,
    yellow: "#ffd633",
    red: "#ff4444",
  };
  context.fillStyle = colors[condition];
  context.beginPath();
  context.arc(HUD_DESIGN_WIDTH - 80, 60, 12, 0, Math.PI * 2);
  context.fill();
}

/** Clear the design space and draw the model. */
export function drawHud(
  context: CanvasRenderingContext2D,
  model: HudModel,
): void {
  context.clearRect(0, 0, HUD_DESIGN_WIDTH, HUD_DESIGN_HEIGHT);
  context.textBaseline = "middle";

  drawCrosshair(context);
  drawCondition(context, model.condition);

  context.fillStyle = HUD_COLOR;
  context.font = "28px monospace";
  context.textAlign = "left";
  context.fillText(formatClock(model.clockSeconds), 60, 60);
  context.fillText(formatSpeed(model.speed), 60, HUD_DESIGN_HEIGHT - 60);

  if (model.message !== "") {
    context.textAlign = "center";
    context.fillStyle = HUD_COLOR;
    context.fillText(model.message, CROSSHAIR_X, HUD_DESIGN_HEIGHT - 140);
  }
}
