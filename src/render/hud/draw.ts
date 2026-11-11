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
import { SCANNER_MAX_RANGE, aegisLabel } from "./projection.js";
import type { CompassBlip, ScannerBlip } from "./projection.js";

export const HUD_DESIGN_WIDTH = 1920;
export const HUD_DESIGN_HEIGHT = 1080;

/** The classic green vector palette (D-06, A5). */
export const HUD_COLOR = "#33ff66";
export const HUD_AMBER = "#ffb000";
export const HUD_RED = "#ff4444";
/** Oolite's default red scanner grid (`hud.plist` `drawScanner:` `rgb_color = (1, 0, 0)`). */
export const HUD_SCANNER_GRID_COLOR = "#cc2222";
/** Oolite's neutral/buoy lollipop colour (`ShipEntity.m` `neutral_color`). */
export const HUD_SCANNER_NEUTRAL_COLOR = "#ffee33";
export const HUD_FONT =
  "28px ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";
export const HUD_SMALL_FONT =
  "20px ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";

/** Oolite's 288x64 ellipse, enlarged to 360x80 for readability (D-08). */
export const SCANNER_WIDTH = 360;
export const SCANNER_HEIGHT = 80;
export const COMPASS_RADIUS = 48;

/** Oolite's default vertical field-of-view in degrees (`MyOpenGLView.m:1287`, `57.2°`). */
const SCANNER_FOV_DEG = 57.2;
/** Lollipop geometry scaled from Oolite's 288x64 scanner (`HeadUpDisplay.m:1265-1275`) to 360x80 (1.25x). */
const LOLLIPOP_HEAD_WIDTH = 6.25;
const LOLLIPOP_HEAD_HEIGHT = 3.75;
const LOLLIPOP_HEAD_LEFT_OFFSET = 3.75;
const LOLLIPOP_STALK_WIDTH = 2.5;
const LOLLIPOP_STALK_ALPHA = 1 / 3;

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
    x: 1196 - COMPASS_RADIUS,
    y: 930 - COMPASS_RADIUS,
    width: COMPASS_RADIUS * 2,
    height: COMPASS_RADIUS * 2,
  },
  aegis: { x: 676, y: 890, width: 96, height: 80 },
  speed: { x: 1276, y: 885, width: 304, height: 24 },
  roll: { x: 1276, y: 918, width: 304, height: 24 },
  pitch: { x: 1276, y: 951, width: 304, height: 24 },
  fuel: { x: 340, y: 918, width: 304, height: 24 },
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
  /** The committed hyperspace target name, or "" when none (D-12). */
  readonly hyperspaceTarget: string;
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

function scannerContactColor(kind: HudContact["kind"]): string {
  switch (kind) {
    case "station":
      return HUD_COLOR;
    case "buoy":
    case "beacon":
      return HUD_SCANNER_NEUTRAL_COLOR;
  }
}

/**
 * Oolite's `drawScannerGrid` (`HeadUpDisplay.m:3914-4048`):
 * - outer ellipse at 2x stroke width
 * - central horizontal/vertical crosshair axes
 * - 5 km range graduation ticks along the vertical axis (doubled at 10/20 km)
 * - forward view-cone lines in the upper (forward) half of the ellipse
 */
function drawScannerGrid(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  ww: number,
  hh: number,
  scannerRange: number,
): void {
  context.strokeStyle = HUD_SCANNER_GRID_COLOR;
  context.lineWidth = 2;
  context.globalAlpha = 0.9;
  context.beginPath();
  context.ellipse(x, y, ww, hh, 0, 0, Math.PI * 2);
  context.stroke();

  context.lineWidth = 1;
  context.globalAlpha = 0.65;
  context.beginPath();

  // Central horizontal and vertical axes.
  context.moveTo(x - ww, y);
  context.lineTo(x + ww, y);
  context.moveTo(x, y - hh);
  context.lineTo(x, y + hh);

  // Range graduation ticks (HeadUpDisplay.m:3977-4001).
  const kmScan = 0.001 * (scannerRange > 0 ? scannerRange : SCANNER_MAX_RANGE);
  const hdiv = hh / kmScan;
  let wdiv = (0.5 * ww) / kmScan;
  let stepKm = 1;
  if (wdiv < 4) {
    wdiv *= 2;
    stepKm = 5;
  }
  for (let i = stepKm; hdiv * i < hh; i += stepKm) {
    const h1 = i * hdiv;
    let w1 = wdiv;
    if (i % 5 === 0) w1 *= 2.5;
    if (i % 10 === 0) w1 *= 2;
    context.moveTo(x - w1, y - h1);
    context.lineTo(x + w1, y - h1);
    context.moveTo(x - w1, y + h1);
    context.lineTo(x + w1, y + h1);
  }

  // Forward field-of-view V-cone lines (HeadUpDisplay.m:4005-4012).
  const tanFov = Math.tan((SCANNER_FOV_DEG * Math.PI) / 360);
  const cosFov = 1 / Math.hypot(1, tanFov);
  const sinFov = tanFov * cosFov;
  context.moveTo(x - ww * sinFov, y - hh * cosFov);
  context.lineTo(x, y);
  context.lineTo(x + ww * sinFov, y - hh * cosFov);

  context.stroke();
  context.globalAlpha = 1;
}

/**
 * Oolite's `drawScanner` lollipop loop (`HeadUpDisplay.m:1211-1277`):
 * - translucent vertical stalk (`alpha = 1/3`) from `(baseX, baseY)` on the
 *   XZ scanner plane to the elevated lollipop head `(baseX, headY)`
 * - solid rectangular lollipop cap at `(baseX, headY)`
 */
function drawScannerContacts(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  contacts: readonly HudContact[],
): void {
  for (const contact of contacts) {
    if (!contact.visible) continue;
    const baseX = x + contact.x;
    const baseY = y + contact.yBase;
    const headY = baseY + contact.yTail;
    const color = scannerContactColor(contact.kind);

    context.fillStyle = color;
    const stalkHeight = Math.abs(contact.yTail);
    if (stalkHeight > 0.5) {
      context.globalAlpha = LOLLIPOP_STALK_ALPHA;
      context.fillRect(
        baseX,
        Math.min(baseY, headY),
        LOLLIPOP_STALK_WIDTH,
        stalkHeight,
      );
    }

    context.globalAlpha = 1;
    context.fillRect(
      baseX - LOLLIPOP_HEAD_LEFT_OFFSET,
      headY - LOLLIPOP_HEAD_HEIGHT,
      LOLLIPOP_HEAD_WIDTH,
      LOLLIPOP_HEAD_HEIGHT,
    );
  }
}

function drawScanner(context: CanvasRenderingContext2D, model: HudModel): void {
  const rect = HUD_LAYOUT.scanner;
  const { x, y } = rectCentre(rect);
  const ww = rect.width / 2;
  const hh = rect.height / 2;

  context.save();
  drawScannerGrid(context, x, y, ww, hh, model.scannerRange);
  drawScannerContacts(context, x, y, model.contacts);
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
  const ringRadius = SCANNER_HEIGHT / 2;

  context.strokeStyle = HUD_COLOR;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(x, y, ringRadius, 0, Math.PI * 2);
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
  context.fillText(compassLabel(compass.target), x, y + ringRadius - 10);
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

const BAR_GAUGE_WIDTH = 160;
const BAR_GAUGE_HEIGHT = 14;
const BAR_LABEL_GAP = 12;

function drawBar(
  context: CanvasRenderingContext2D,
  rect: HudRect,
  value: number,
  signed: boolean,
  label: string,
  side: "left" | "right",
  text?: string,
): void {
  const centerY = rect.y + rect.height / 2;
  const barX = side === "left" ? rect.x + rect.width - BAR_GAUGE_WIDTH : rect.x;
  const barY = Math.round(centerY - BAR_GAUGE_HEIGHT / 2);

  context.fillStyle = HUD_COLOR;
  context.strokeStyle = HUD_COLOR;
  context.lineWidth = 2;
  context.font = HUD_SMALL_FONT;

  if (side === "left") {
    context.textAlign = "left";
    context.fillText(label, rect.x, centerY);
    if (text !== undefined) {
      context.textAlign = "right";
      context.fillText(text, barX - BAR_LABEL_GAP, centerY);
    }
  } else {
    context.textAlign = "left";
    context.fillText(label, barX + BAR_GAUGE_WIDTH + BAR_LABEL_GAP, centerY);
    if (text !== undefined) {
      context.textAlign = "right";
      context.fillText(text, rect.x + rect.width, centerY);
    }
  }

  context.strokeRect(barX, barY, BAR_GAUGE_WIDTH, BAR_GAUGE_HEIGHT);

  const innerX = barX + 2;
  const innerY = barY + 2;
  const innerWidth = BAR_GAUGE_WIDTH - 4;
  const innerHeight = BAR_GAUGE_HEIGHT - 4;

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
    context.lineTo(centre, barY + BAR_GAUGE_HEIGHT + 2);
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
    "right",
    model.speedText,
  );
  drawBar(context, HUD_LAYOUT.roll, model.bars.roll, true, "ROLL", "right");
  drawBar(context, HUD_LAYOUT.pitch, model.bars.pitch, true, "PITCH", "right");
  drawBar(
    context,
    HUD_LAYOUT.fuel,
    model.bars.fuel,
    false,
    "FUEL",
    "left",
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

  // D-12/A2: the committed target is a second line inside the existing clock
  // rectangle. HUD_ELEMENTS and every HUD_LAYOUT rectangle stay unchanged.
  context.font = HUD_SMALL_FONT;
  context.textAlign = "left";
  context.fillText(
    `Hyperspace: ${model.hyperspaceTarget === "" ? "(Unknown)" : model.hyperspaceTarget}`,
    HUD_LAYOUT.clock.x,
    HUD_LAYOUT.clock.y + 38,
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
