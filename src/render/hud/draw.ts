// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The flight HUD (FLGT-05, D-05, D-06, D-08).
 *
 * Canvas2D only: no DOM, no SVG and no in-scene geometry. `draw.ts` receives an
 * already-transformed context and draws in the fixed 1920x1080 design space, so
 * the letterbox maths lives once in `hud.ts`. Every position here is a design
 * unit; `HUD_LAYOUT` is the single table the probe publishes for the browser
 * proof, so "inside the design rect" is a numeric assertion rather than a
 * screenshot.
 *
 * The scanner projection and the compass maths live in `projection.ts`; this
 * module only draws their results. The model is built by
 * `src/app/hud-model.ts`, never read from the simulation directly.
 */

import { clamp } from "../../sim/math.js";
import type { CompassTarget } from "../../sim/flight/state.js";
import type { AegisStatus } from "../../sim/world/aegis.js";
import { aegisLabel } from "./projection.js";
import type { CompassBlip, ScannerBlip } from "./projection.js";

export const HUD_DESIGN_WIDTH = 1920;
export const HUD_DESIGN_HEIGHT = 1080;

/** The classic green vector palette (D-06, A5). */
export const HUD_COLOR = "#33ff66";
export const HUD_AMBER = "#ffb000";
export const HUD_RED = "#ff4444";
export const HUD_FONT =
  "28px ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";
export const HUD_SMALL_FONT =
  "20px ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";

/** Oolite's 288x64 ellipse, enlarged to 360x80 for readability (D-08). */
export const SCANNER_WIDTH = 360;
export const SCANNER_HEIGHT = 80;
export const COMPASS_RADIUS = 48;

export type HudElementId =
  | "crosshair"
  | "scanner"
  | "compass"
  | "aegis"
  | "speed"
  | "roll"
  | "pitch"
  | "fuel"
  | "clock"
  | "condition"
  | "message";

/** The eleven-element v1 set (FLGT-05, D-06); nothing post-v1 is drawn. */
export const HUD_ELEMENTS: readonly HudElementId[] = [
  "crosshair",
  "scanner",
  "compass",
  "aegis",
  "speed",
  "roll",
  "pitch",
  "fuel",
  "clock",
  "condition",
  "message",
];

export interface HudRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Design-space bounding boxes, one per drawn element. */
export const HUD_LAYOUT: Readonly<Record<HudElementId, HudRect>> = {
  crosshair: { x: 920, y: 500, width: 80, height: 80 },
  scanner: {
    x: 960 - SCANNER_WIDTH / 2,
    y: 930 - SCANNER_HEIGHT / 2,
    width: SCANNER_WIDTH,
    height: SCANNER_HEIGHT,
  },
  compass: {
    x: 1450 - COMPASS_RADIUS,
    y: 940 - COMPASS_RADIUS,
    width: COMPASS_RADIUS * 2,
    height: COMPASS_RADIUS * 2,
  },
  aegis: { x: 410, y: 890, width: 120, height: 100 },
  speed: { x: 1500, y: 740, width: 200, height: 45 },
  roll: { x: 1500, y: 680, width: 200, height: 45 },
  pitch: { x: 1500, y: 620, width: 200, height: 45 },
  fuel: { x: 220, y: 740, width: 200, height: 45 },
  clock: { x: 60, y: 40, width: 360, height: 40 },
  condition: { x: 1848, y: 48, width: 24, height: 24 },
  message: { x: 510, y: 980, width: 900, height: 40 },
};

export interface HudContact extends ScannerBlip {
  readonly id: "station" | "navBuoy" | "witchpoint";
  readonly kind: "station" | "buoy" | "beacon";
}

export interface HudCompass extends CompassBlip {
  readonly target: CompassTarget;
}

export interface HudBars {
  /** 0..1 against the ship's top speed. */
  readonly speed: number;
  /** -1..1 signed, centre-zero. */
  readonly roll: number;
  /** -1..1 signed, centre-zero. */
  readonly pitch: number;
  /** 0..1 of a full tank. */
  readonly fuel: number;
}

export interface HudModel {
  readonly speed: number;
  readonly clockSeconds: number;
  readonly message: string;
  readonly condition: "green" | "yellow" | "red";
  /** 0..1 red frame overlay from the dock feedback envelope (D-08). */
  readonly flashAlpha: number;
  readonly massLocked: boolean;
  readonly scannerRange: number;
  readonly contacts: readonly HudContact[];
  readonly compass: HudCompass;
  readonly aegis: AegisStatus;
  readonly bars: HudBars;
  readonly speedText: string;
  readonly fuelText: string;
  readonly clockText: string;
}

const CROSSHAIR_GAP = 10;
const CROSSHAIR_ARM = 26;

function rectCentre(rect: HudRect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function drawCrosshair(context: CanvasRenderingContext2D): void {
  const { x, y } = rectCentre(HUD_LAYOUT.crosshair);
  context.strokeStyle = HUD_COLOR;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(x - CROSSHAIR_GAP - CROSSHAIR_ARM, y);
  context.lineTo(x - CROSSHAIR_GAP, y);
  context.moveTo(x + CROSSHAIR_GAP, y);
  context.lineTo(x + CROSSHAIR_GAP + CROSSHAIR_ARM, y);
  context.moveTo(x, y - CROSSHAIR_GAP - CROSSHAIR_ARM);
  context.lineTo(x, y - CROSSHAIR_GAP);
  context.moveTo(x, y + CROSSHAIR_GAP);
  context.lineTo(x, y + CROSSHAIR_GAP + CROSSHAIR_ARM);
  context.stroke();
}

function drawScanner(context: CanvasRenderingContext2D, model: HudModel): void {
  const rect = HUD_LAYOUT.scanner;
  const { x, y } = rectCentre(rect);

  // Clip the whole scanner so a tall tail can never cross the message line.
  context.save();
  context.beginPath();
  context.rect(rect.x, rect.y, rect.width, rect.height);
  context.clip();

  context.strokeStyle = HUD_COLOR;
  context.lineWidth = 2;
  context.beginPath();
  context.ellipse(x, y, rect.width / 2, rect.height / 2, 0, 0, Math.PI * 2);
  context.stroke();

  // The two grid lines Oolite draws through the ellipse's centre.
  context.globalAlpha = 0.45;
  context.beginPath();
  context.moveTo(rect.x, y);
  context.lineTo(rect.x + rect.width, y);
  context.moveTo(x, rect.y);
  context.lineTo(x, rect.y + rect.height);
  context.stroke();
  context.globalAlpha = 1;

  for (const contact of model.contacts) {
    if (!contact.visible) continue;
    const baseX = x + contact.x;
    const baseY = y + contact.yBase;
    context.beginPath();
    context.moveTo(baseX, baseY);
    context.lineTo(baseX, baseY + contact.yTail);
    context.stroke();

    if (contact.kind === "station") {
      // A diamond for the Coriolis, a dot for the beacons.
      context.beginPath();
      context.moveTo(baseX, baseY - 4);
      context.lineTo(baseX + 4, baseY);
      context.lineTo(baseX, baseY + 4);
      context.lineTo(baseX - 4, baseY);
      context.closePath();
      context.fillStyle = HUD_COLOR;
      context.fill();
    } else {
      context.beginPath();
      context.arc(baseX, baseY, 3, 0, Math.PI * 2);
      context.fillStyle = HUD_COLOR;
      context.fill();
    }
  }

  context.restore();
}

function compassLabel(target: CompassTarget): string {
  switch (target) {
    case "planet":
      return "P";
    case "station":
      return "S";
    case "witchpoint":
      return "W";
  }
}

function drawCompass(
  context: CanvasRenderingContext2D,
  compass: HudCompass,
): void {
  const rect = HUD_LAYOUT.compass;
  const { x, y } = rectCentre(rect);

  context.strokeStyle = HUD_COLOR;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(x, y, COMPASS_RADIUS, 0, Math.PI * 2);
  context.stroke();

  context.beginPath();
  context.moveTo(x - COMPASS_RADIUS * 0.125, y);
  context.lineTo(x - COMPASS_RADIUS * 0.375, y);
  context.moveTo(x + COMPASS_RADIUS * 0.125, y);
  context.lineTo(x + COMPASS_RADIUS * 0.375, y);
  context.moveTo(x, y - COMPASS_RADIUS * 0.125);
  context.lineTo(x, y - COMPASS_RADIUS * 0.375);
  context.moveTo(x, y + COMPASS_RADIUS * 0.125);
  context.lineTo(x, y + COMPASS_RADIUS * 0.375);
  context.stroke();

  context.fillStyle = compass.forward ? HUD_COLOR : HUD_AMBER;
  context.beginPath();
  context.arc(x + compass.x, y + compass.y, 4, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = HUD_COLOR;
  context.font = HUD_SMALL_FONT;
  context.textAlign = "center";
  context.fillText(compassLabel(compass.target), x, rect.y + rect.height - 4);
}

function drawAegis(
  context: CanvasRenderingContext2D,
  status: AegisStatus,
): void {
  // Oolite's drawAegis only shows the indicator in docking range.
  if (status !== "dockingRange") return;
  const rect = HUD_LAYOUT.aegis;
  const { x, y } = rectCentre(rect);

  context.strokeStyle = HUD_COLOR;
  context.lineWidth = 2;
  context.strokeRect(x - 12, y - 18, 24, 24);
  context.strokeRect(x - 6, y - 12, 12, 12);

  context.fillStyle = HUD_COLOR;
  context.font = HUD_SMALL_FONT;
  context.textAlign = "center";
  context.fillText(aegisLabel(status), x, y + 26);
}

function drawBar(
  context: CanvasRenderingContext2D,
  rect: HudRect,
  value: number,
  signed: boolean,
  label: string,
  text?: string,
): void {
  context.fillStyle = HUD_COLOR;
  context.strokeStyle = HUD_COLOR;
  context.lineWidth = 2;
  context.font = HUD_SMALL_FONT;
  context.textAlign = "left";
  context.fillText(label, rect.x, rect.y + 8);

  if (text !== undefined) {
    context.textAlign = "right";
    context.fillText(text, rect.x + rect.width, rect.y + 8);
  }

  const barY = rect.y + 20;
  const barHeight = 14;
  context.strokeRect(rect.x, barY, rect.width, barHeight);

  const innerX = rect.x + 2;
  const innerY = barY + 2;
  const innerWidth = rect.width - 4;
  const innerHeight = barHeight - 4;

  if (signed) {
    const centre = innerX + innerWidth / 2;
    const half = (innerWidth / 2) * clamp(value, -1, 1);
    context.fillRect(
      half >= 0 ? centre : centre + half,
      innerY,
      Math.abs(half),
      innerHeight,
    );
    context.beginPath();
    context.moveTo(centre, barY - 2);
    context.lineTo(centre, barY + barHeight + 2);
    context.stroke();
  } else {
    context.fillRect(
      innerX,
      innerY,
      innerWidth * clamp(value, 0, 1),
      innerHeight,
    );
  }
}

function drawCondition(
  context: CanvasRenderingContext2D,
  condition: HudModel["condition"],
): void {
  const colors: Record<HudModel["condition"], string> = {
    green: HUD_COLOR,
    yellow: HUD_AMBER,
    red: HUD_RED,
  };
  const { x, y } = rectCentre(HUD_LAYOUT.condition);
  context.fillStyle = colors[condition];
  context.beginPath();
  context.arc(x, y, 10, 0, Math.PI * 2);
  context.fill();
}

/** The band width of the D-08 red frame, in design units. */
const FLASH_BAND = 24;

/** A red frame overlay, drawn only while the dock-feedback envelope is live. */
function drawFlash(context: CanvasRenderingContext2D, alpha: number): void {
  if (!(alpha > 0)) return;
  context.fillStyle = `rgba(255, 68, 68, ${String(alpha * 0.45)})`;
  context.fillRect(0, 0, HUD_DESIGN_WIDTH, FLASH_BAND);
  context.fillRect(
    0,
    HUD_DESIGN_HEIGHT - FLASH_BAND,
    HUD_DESIGN_WIDTH,
    FLASH_BAND,
  );
  context.fillRect(0, 0, FLASH_BAND, HUD_DESIGN_HEIGHT);
  context.fillRect(
    HUD_DESIGN_WIDTH - FLASH_BAND,
    0,
    FLASH_BAND,
    HUD_DESIGN_HEIGHT,
  );
}

/** Clear the design space and draw the model. */
export function drawHud(
  context: CanvasRenderingContext2D,
  model: HudModel,
): void {
  context.clearRect(0, 0, HUD_DESIGN_WIDTH, HUD_DESIGN_HEIGHT);
  context.textBaseline = "middle";

  drawCrosshair(context);
  drawScanner(context, model);
  drawCompass(context, model.compass);
  drawAegis(context, model.aegis);
  drawBar(
    context,
    HUD_LAYOUT.speed,
    model.bars.speed,
    false,
    "SPD",
    model.speedText,
  );
  drawBar(context, HUD_LAYOUT.roll, model.bars.roll, true, "ROLL");
  drawBar(context, HUD_LAYOUT.pitch, model.bars.pitch, true, "PITCH");
  drawBar(
    context,
    HUD_LAYOUT.fuel,
    model.bars.fuel,
    false,
    "FUEL",
    model.fuelText,
  );
  drawCondition(context, model.condition);

  context.fillStyle = HUD_COLOR;
  context.font = HUD_FONT;
  context.textAlign = "left";
  context.fillText(
    model.clockText,
    HUD_LAYOUT.clock.x,
    HUD_LAYOUT.clock.y + 20,
  );

  if (model.message !== "") {
    context.textAlign = "center";
    context.fillStyle = HUD_COLOR;
    context.fillText(
      model.message,
      HUD_LAYOUT.message.x + HUD_LAYOUT.message.width / 2,
      HUD_LAYOUT.message.y + HUD_LAYOUT.message.height / 2,
    );
  }

  // Drawn last so the red frame is never covered by a HUD element.
  drawFlash(context, model.flashAlpha);
}
