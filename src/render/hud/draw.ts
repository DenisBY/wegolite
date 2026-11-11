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
const HUD_GAUGE_FONT =
  "20px ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";

/** Oolite's 288x64 ellipse, scaled 1.75x to 504x112 for 1080p readability (D-08). */
export const SCANNER_WIDTH = 504;
export const SCANNER_HEIGHT = 112;
export const COMPASS_RADIUS = 48;

/** Oolite's default vertical field-of-view in degrees (`MyOpenGLView.m:1287`, `57.2°`). */
const SCANNER_FOV_DEG = 57.2;
/** Lollipop geometry scaled from Oolite's 288x64 scanner (`HeadUpDisplay.m:1265-1275`) to 504x112 (1.75x). */
const LOLLIPOP_HEAD_WIDTH = 8.75;
const LOLLIPOP_HEAD_HEIGHT = 5.25;
const LOLLIPOP_HEAD_LEFT_OFFSET = 5.25;
const LOLLIPOP_STALK_WIDTH = 3.5;
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
    y: 868 - SCANNER_HEIGHT / 2,
    width: SCANNER_WIDTH,
    height: SCANNER_HEIGHT,
  },
  compass: {
    x: 1276 - COMPASS_RADIUS,
    y: 868 - COMPASS_RADIUS,
    width: COMPASS_RADIUS * 2,
    height: COMPASS_RADIUS * 2,
  },
  aegis: { x: 596, y: 820, width: 96, height: 96 },
  speed: { x: 1356, y: 812, width: 404, height: 22 },
  roll: { x: 1356, y: 840, width: 404, height: 18 },
  pitch: { x: 1356, y: 858, width: 404, height: 18 },
  fuel: { x: 160, y: 872, width: 404, height: 18 },
  clock: { x: 60, y: 40, width: 360, height: 40 },
  condition: { x: 1848, y: 48, width: 24, height: 24 },
  message: { x: 510, y: 944, width: 900, height: 40 },
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

  // Range graduation ticks (HeadUpDisplay.m:3977-4001, scaled from Oolite's 288px width).
  const kmScan = 0.001 * (scannerRange > 0 ? scannerRange : SCANNER_MAX_RANGE);
  const hdiv = hh / kmScan;
  let wdiv = (0.5 * ww) / kmScan;
  let stepKm = 1;
  if (wdiv < (4 * ww) / 144) {
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
  const ringRadius = COMPASS_RADIUS;

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
  context.arc(x + compass.x, y + compass.y, 4.5, 0, Math.PI * 2);
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
  context.lineWidth = 2.5;
  context.strokeRect(x - 16, y - 22, 32, 32);
  context.strokeRect(x - 8, y - 14, 16, 16);

  context.fillStyle = HUD_COLOR;
  context.font = HUD_SMALL_FONT;
  context.textAlign = "center";
  context.fillText(aegisLabel(status), x, y + 28);
}

const GAUGE_BAR_WIDTH = 220;
const GAUGE_BAR_HEIGHT = 14;
const GAUGE_SURROUND_PAD = 4;
const GAUGE_SURROUND_WIDTH = GAUGE_BAR_WIDTH + GAUGE_SURROUND_PAD * 2;
const LEFT_SURROUND_X = 336;
const LEFT_BAR_X = LEFT_SURROUND_X + GAUGE_SURROUND_PAD;
const LEFT_LABEL_X = LEFT_SURROUND_X - 14;
const RIGHT_SURROUND_X =
  HUD_DESIGN_WIDTH - LEFT_SURROUND_X - GAUGE_SURROUND_WIDTH;
const RIGHT_BAR_X = RIGHT_SURROUND_X + GAUGE_SURROUND_PAD;
const RIGHT_LABEL_X = RIGHT_SURROUND_X + GAUGE_SURROUND_WIDTH + 14;

function drawFillGauge(
  context: CanvasRenderingContext2D,
  barX: number,
  barY: number,
  value: number,
  fillColor: string,
  surroundColor?: string,
): void {
  if (surroundColor !== undefined) {
    context.strokeStyle = surroundColor;
    context.lineWidth = 1.75;
    context.strokeRect(
      barX - GAUGE_SURROUND_PAD,
      barY - GAUGE_SURROUND_PAD,
      GAUGE_SURROUND_WIDTH,
      GAUGE_BAR_HEIGHT + GAUGE_SURROUND_PAD * 2,
    );
  }
  const fillWidth = GAUGE_BAR_WIDTH * clamp(value, 0, 1);
  if (fillWidth > 0) {
    context.fillStyle = fillColor;
    context.fillRect(barX, barY, fillWidth, GAUGE_BAR_HEIGHT);
  }
}

/**
 * Oolite's `hudDrawIndicatorAt` (`HeadUpDisplay.m:3135-3146`):
 * green surround with a yellow diamond indicator for signed `-1..1` axes (`ROLL`, `PITCH`).
 */
function drawSignedDiamondGauge(
  context: CanvasRenderingContext2D,
  surroundX: number,
  surroundY: number,
  surroundHeight: number,
  value: number,
): void {
  context.strokeStyle = HUD_COLOR;
  context.lineWidth = 1.75;
  context.strokeRect(
    surroundX,
    surroundY,
    GAUGE_SURROUND_WIDTH,
    surroundHeight,
  );

  const centerX = surroundX + GAUGE_SURROUND_WIDTH / 2;
  const centerY = surroundY + surroundHeight / 2;
  const position = centerX + clamp(value, -1, 1) * ((GAUGE_BAR_WIDTH - 8) / 2);
  const halfHeight = Math.max(4, surroundHeight / 2 - 2.5);

  context.fillStyle = HUD_SCANNER_NEUTRAL_COLOR;
  context.beginPath();
  context.moveTo(position, centerY - halfHeight);
  context.lineTo(position + 4.5, centerY);
  context.lineTo(position, centerY + halfHeight);
  context.lineTo(position - 4.5, centerY);
  context.closePath();
  context.fill();
}

function drawMissileIcon(
  context: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  filled: boolean,
  selected: boolean,
): void {
  context.beginPath();
  context.moveTo(cx, cy - 11);
  context.lineTo(cx + 8, cy - 1);
  context.lineTo(cx + 3.5, cy - 1);
  context.lineTo(cx + 5, cy + 10);
  context.lineTo(cx - 5, cy + 10);
  context.lineTo(cx - 3.5, cy - 1);
  context.lineTo(cx - 8, cy - 1);
  context.closePath();

  if (filled) {
    context.fillStyle = HUD_COLOR;
    context.fill();
    if (selected) {
      context.strokeStyle = HUD_SCANNER_NEUTRAL_COLOR;
      context.lineWidth = 1.5;
      context.stroke();
    }
  } else {
    context.strokeStyle = "rgba(180, 190, 180, 0.55)";
    context.lineWidth = 1.5;
    context.stroke();
  }
}

/**
 * Left-hand Oolite gauge stack (`hud.plist` LHS):
 * - `FWD` and `AFT` shield bars (green surrounds, 100% placeholder fill)
 * - yellow system surround enclosing `FUEL` (live yellow bar), `CT`, `LT`, `ALT`
 * - `MISS` missile pylon display placeholder below the yellow surround
 */
function drawLeftGauges(
  context: CanvasRenderingContext2D,
  model: HudModel,
): void {
  context.font = HUD_GAUGE_FONT;
  context.textAlign = "right";

  // FWD shield placeholder (top aligned with scanner top y = 812).
  drawFillGauge(context, LEFT_BAR_X, 816, 1, HUD_COLOR, HUD_COLOR);
  context.fillStyle = HUD_COLOR;
  context.fillText("FWD", LEFT_LABEL_X, 823);

  // AFT shield placeholder.
  drawFillGauge(context, LEFT_BAR_X, 844, 1, HUD_COLOR, HUD_COLOR);
  context.fillStyle = HUD_COLOR;
  context.fillText("AFT", LEFT_LABEL_X, 851);

  // Shared yellow surround for FUEL, CT, LT, ALT (hud.plist drawSurround:).
  context.strokeStyle = HUD_SCANNER_NEUTRAL_COLOR;
  context.lineWidth = 1.75;
  context.strokeRect(LEFT_SURROUND_X, 868, GAUGE_SURROUND_WIDTH, 88);

  // Live FUEL bar (yellow, with fuelText to the left of the label).
  drawFillGauge(
    context,
    LEFT_BAR_X,
    874,
    model.bars.fuel,
    HUD_SCANNER_NEUTRAL_COLOR,
  );
  context.fillStyle = HUD_COLOR;
  context.fillText("FUEL", LEFT_LABEL_X, 881);
  context.fillText(model.fuelText, LEFT_LABEL_X - 66, 881);

  // Cabin temperature (CT), laser temperature (LT), altitude (ALT) placeholders.
  drawFillGauge(context, LEFT_BAR_X, 894, 0.22, HUD_COLOR);
  context.fillStyle = HUD_COLOR;
  context.fillText("CT", LEFT_LABEL_X, 901);

  drawFillGauge(context, LEFT_BAR_X, 914, 0, HUD_COLOR);
  context.fillStyle = HUD_COLOR;
  context.fillText("LT", LEFT_LABEL_X, 921);

  drawFillGauge(context, LEFT_BAR_X, 934, 0.92, HUD_COLOR);
  context.fillStyle = HUD_COLOR;
  context.fillText("ALT", LEFT_LABEL_X, 941);

  // Missile display placeholder (MISS + 4 pylons), kept clear of the bottom HTML footer.
  context.fillStyle = HUD_COLOR;
  context.fillText("MISS", LEFT_LABEL_X, 978);
  for (let i = 0; i < 4; i += 1) {
    drawMissileIcon(context, LEFT_BAR_X + 14 + i * 30, 978, i < 3, i === 0);
  }
}

/**
 * Right-hand Oolite gauge stack (`hud.plist` RHS):
 * - `SPD` speed bar (live, top aligned with scanner top y = 812)
 * - `ROLL` and `PITCH` signed yellow-diamond indicators (live)
 * - yellow energy surround enclosing 4 energy banks `E1`..`E4` (placeholders)
 */
function drawRightGauges(
  context: CanvasRenderingContext2D,
  model: HudModel,
): void {
  context.font = HUD_GAUGE_FONT;
  context.textAlign = "left";

  // Live SPD bar.
  drawFillGauge(
    context,
    RIGHT_BAR_X,
    816,
    model.bars.speed,
    HUD_COLOR,
    HUD_COLOR,
  );
  context.fillStyle = HUD_COLOR;
  context.fillText("SPD", RIGHT_LABEL_X, 823);
  context.fillText(model.speedText, RIGHT_LABEL_X + 54, 823);

  // Live ROLL and PITCH diamond indicators sharing their middle border.
  drawSignedDiamondGauge(
    context,
    RIGHT_SURROUND_X,
    HUD_LAYOUT.roll.y,
    HUD_LAYOUT.roll.height,
    model.bars.roll,
  );
  context.fillStyle = HUD_COLOR;
  context.fillText("ROLL", RIGHT_LABEL_X, 849);

  drawSignedDiamondGauge(
    context,
    RIGHT_SURROUND_X,
    HUD_LAYOUT.pitch.y,
    HUD_LAYOUT.pitch.height,
    model.bars.pitch,
  );
  context.fillStyle = HUD_COLOR;
  context.fillText("PITCH", RIGHT_LABEL_X, 867);

  // Shared yellow surround for energy banks E1..E4 (hud.plist drawEnergyGauge:).
  context.strokeStyle = HUD_SCANNER_NEUTRAL_COLOR;
  context.lineWidth = 1.75;
  context.strokeRect(RIGHT_SURROUND_X, 884, GAUGE_SURROUND_WIDTH, 88);

  for (let i = 0; i < 4; i += 1) {
    const bankY = 890 + i * 20;
    drawFillGauge(context, RIGHT_BAR_X, bankY, 1, HUD_SCANNER_NEUTRAL_COLOR);
    context.fillStyle = HUD_COLOR;
    context.fillText(`E${String(i + 1)}`, RIGHT_LABEL_X, bankY + 7);
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
  drawLeftGauges(context, model);
  drawRightGauges(context, model);
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
