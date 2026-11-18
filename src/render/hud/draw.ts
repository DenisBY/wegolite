// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The flight HUD (FLGT-05, D-05, D-06, D-08; Oolite's geometry since quick
 * task 261118-cyn).
 *
 * Canvas2D only: no DOM, no SVG and no in-scene geometry. `draw.ts` receives an
 * already-transformed context and draws in the fixed 1920x1080 design space, so
 * the letterbox maths lives once in `hud.ts`. Every position here is a design
 * unit; `HUD_LAYOUT` is the single table the probe publishes for the browser
 * proof, so "inside the design rect" is a numeric assertion rather than a
 * screenshot.
 *
 * The geometry is Oolite's `hud.plist`. Oolite's HUD space wider than 4:3 is
 * 480 units high and scaled by the window height (`MyOpenGLView.m:498-505`);
 * x is measured from the centre, `y_origin = -1` measures y up from the bottom
 * edge and no `y_origin` measures y up from the centre
 * (`HeadUpDisplay.m:969-970`). The design space is 1080 px high, so one unit is
 * `HUD_UNIT` = 1080 / 480 = 2.25 design px: design x = 960 + 2.25 x, design
 * y = 1080 - 2.25 y for `y_origin = -1` and 540 - 2.25 y for a centre-anchored
 * item. Bars are centred on (x, y) (`hudDrawBarAt`, `HeadUpDisplay.m:3181-3184`)
 * and `draw_surround` adds 2 units on each side. The top-left clock is not
 * Oolite's position: it stays where it was by owner decision (261118-cyn D-01).
 *
 * `drawHud` takes a vertical lift: the HUD block except the crosshair, the
 * ident frame, the clock lines and the flash is drawn that many design px
 * higher, so it rests on the document disclaimer's top edge instead of the
 * window's bottom edge (HUD-ANCHOR option B, owner 2026-11-18). `HUD_LAYOUT`
 * stays the plain table.
 *
 * The scanner projection and the compass maths live in `projection.ts`; this
 * module only draws their results. The model is built by
 * `src/app/hud-model.ts`, never read from the simulation directly.
 */

import { clamp } from "../../sim/math.js";
import type { CompassTarget } from "../../sim/flight/state.js";
import type { AegisStatus } from "../../sim/world/aegis.js";
import { SCANNER_MAX_RANGE } from "./projection.js";
import type { CompassBlip, IdentFrame, ScannerBlip } from "./projection.js";
import { drawCapText } from "./cap-text.js";
import { MESSAGE_ROWS } from "./messages.js";
import type { MessageRow } from "./messages.js";

export const HUD_DESIGN_WIDTH = 1920;
export const HUD_DESIGN_HEIGHT = 1080;

/** One `hud.plist` unit in design px: 1080 / 480 (`MyOpenGLView.m:498-505`). */
export const HUD_UNIT = HUD_DESIGN_HEIGHT / 480;

/** Design x of a `hud.plist` x (from the centre). */
function unitX(x: number): number {
  return HUD_DESIGN_WIDTH / 2 + HUD_UNIT * x;
}

/** Design y of a `hud.plist` y with `y_origin = -1` (up from the bottom). */
function unitY(y: number): number {
  return HUD_DESIGN_HEIGHT - HUD_UNIT * y;
}

/** The classic green vector palette (D-06, A5). */
export const HUD_COLOR = "#33ff66";
export const HUD_AMBER = "#ffb000";
export const HUD_RED = "#ff4444";
/** Oolite's default red scanner grid (`hud.plist` `drawScanner:` `rgb_color = (1, 0, 0)`). */
export const HUD_SCANNER_GRID_COLOR = "#cc2222";
/** Oolite's neutral/buoy lollipop colour (`ShipEntity.m` `neutral_color`). */
export const HUD_SCANNER_NEUTRAL_COLOR = "#ffee33";
/**
 * Oolite's police scanner colour (`ShipEntity.m:5585`, `police_color1` =
 * `{0.5, 0.0, 1.0}`, "purpley-blue"): the colour of a police ship's lollipop.
 */
export const HUD_SCANNER_POLICE_COLOR = "#8000ff";
/** `hud.plist` `message_gui` `text_color = "yellowColor"` (D-08). */
export const HUD_MESSAGE_COLOR = "rgb(255, 255, 0)";
/** `drawCompass:` `rgb_color = (0.0, 0.0, 1.0)` (`hud.plist:45-52`). */
const COMPASS_RING_COLOR = "rgb(0, 0, 255)";
/** `SetCompassBlipColor`: green in front, red behind (`HeadUpDisplay.m`). */
const COMPASS_FRONT_COLOR = "rgb(0, 255, 0)";
const COMPASS_BEHIND_COLOR = "rgb(255, 0, 0)";
/** `drawAegis:` fills green at half alpha. */
const AEGIS_COLOR = "rgba(0, 255, 0, 0.5)";
/** `drawStatusLight:` outlines the light in 0.25 grey. */
const CONDITION_OUTLINE_COLOR = "rgb(64, 64, 64)";

const HUD_FONT_FAMILY =
  "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";
/** The clock and its hyperspace line (D-01: unchanged). */
export const HUD_SMALL_FONT = `20px ${HUD_FONT_FAMILY}`;
/**
 * The message rows' size, in design px of a font whose glyphs advance 0.6 em
 * (`NOMINAL_ADVANCE`). Oolite's font is proportional and the HUD's is
 * monospace, so only the message rows are sized by width, calibrated on
 * Oolite's own text at 1280x720 (quick task 261118-cyn): "Hyperspeed
 * mass-locked." (cell 14) is 208 screen px wide there, 312 design px, which
 * 23.2 px at 0.6 em matches in the comparison capture. `hudFont` rescales the
 * size by the advance the browser's monospace font really has, so the width
 * holds on every machine (a CJK monospace advances 0.5 em, Consolas 0.55 em).
 * The legends, the two readouts, the energy bank labels and the beacon letter
 * are sized by capital height instead, in `cap-text.ts` (owner option 1,
 * 2026-11-18, quick task 261118-ih8).
 */
const NOMINAL_ADVANCE = 0.6;
const HUD_MESSAGE_FONT_PX = 23.2;

/** The message font at the nominal advance (what a context without `measureText` gets). */
export const HUD_MESSAGE_FONT = `${String(HUD_MESSAGE_FONT_PX)}px ${HUD_FONT_FAMILY}`;

/** The HUD font's measured advance per px, per context (read once). */
const measuredAdvance = new WeakMap<CanvasRenderingContext2D, number>();

function advanceOf(context: CanvasRenderingContext2D): number {
  const known = measuredAdvance.get(context);
  if (known !== undefined) return known;
  let advance = NOMINAL_ADVANCE;
  if (typeof context.measureText === "function") {
    const previous = context.font;
    context.font = `100px ${HUD_FONT_FAMILY}`;
    const width = context.measureText("0000000000").width / 1000;
    context.font = previous;
    if (Number.isFinite(width) && width > 0.3 && width < 1) advance = width;
  }
  measuredAdvance.set(context, advance);
  return advance;
}

/** A HUD font whose glyphs advance as a `px` font at 0.6 em would. */
function hudFont(context: CanvasRenderingContext2D, px: number): string {
  const size = (px * NOMINAL_ADVANCE) / advanceOf(context);
  return `${String(Math.round(size * 100) / 100)}px ${HUD_FONT_FAMILY}`;
}

/** Oolite's 288x64 scanner (`hud.plist:19-28`) at 2.25 px per unit (D-05). */
export const SCANNER_WIDTH = 648;
export const SCANNER_HEIGHT = 144;
/**
 * Oolite's compass `siz`: `COMPASS_HALF_SIZE` 28 units (`HeadUpDisplay.h:57`),
 * which `GLDrawOval` draws as the full ring size (`OOOpenGL.m:132-146`).
 */
export const COMPASS_SIZE = 63;

/**
 * Lollipop geometry from `drawScanner:` (`HeadUpDisplay.m:1334-1347`): a 5x3
 * unit head starting 3 units left of the stalk, a 2-unit stalk, at 2.25 px
 * per unit.
 */
const LOLLIPOP_HEAD_WIDTH = 11.25;
const LOLLIPOP_HEAD_HEIGHT = 6.75;
const LOLLIPOP_HEAD_LEFT_OFFSET = 6.75;
const LOLLIPOP_STALK_WIDTH = 4.5;
const LOLLIPOP_STALK_ALPHA = 0.65;

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

/** A gauge bar's width: 80 units. */
const BAR_WIDTH = 180;
/** `draw_surround` adds 2 units on each side (`hudDrawSurroundAt`). */
const SURROUND_PAD = 4.5;
/** Left edge of the left-hand bars: x -200, minus half of 80 units. */
const LEFT_BAR_X = unitX(-200) - BAR_WIDTH / 2;
/** Left edge of the right-hand bars: x 200, minus half of 80 units. */
const RIGHT_BAR_X = unitX(200) - BAR_WIDTH / 2;
/** The left legends are right-aligned at x -245 (`hud.plist:244-310`). */
const LEFT_LEGEND_X = unitX(-245);
/** The right legends are left-aligned at x 242 (`hud.plist:311-351`). */
const RIGHT_LEGEND_X = unitX(242);
/** The kept "7.0 LY" readout (D-10): right-aligned left of the FUEL legend. */
const FUEL_READOUT_RIGHT = 350;
/** The kept "0.000 LS" readout (D-10): left-aligned right of the SPD legend. */
const SPEED_READOUT_X = RIGHT_LEGEND_X + 54;

/** Design-space bounding boxes, one per drawn element. */
export const HUD_LAYOUT: Readonly<Record<HudElementId, HudRect>> = {
  // `crosshairs.plist` OTHER at `crosshair_scale` 32: arms 16 to 32 units out.
  crosshair: { x: 888, y: 468, width: 144, height: 144 },
  // `hud.plist:19-28`: x 0, y 68, 288x64.
  scanner: {
    x: 960 - SCANNER_WIDTH / 2,
    y: 927 - SCANNER_HEIGHT / 2,
    width: SCANNER_WIDTH,
    height: SCANNER_HEIGHT,
  },
  // `hud.plist:45-52`: x 132, y 32.
  compass: {
    x: 1257 - COMPASS_SIZE / 2,
    y: 1008 - COMPASS_SIZE / 2,
    width: COMPASS_SIZE,
    height: COMPASS_SIZE,
  },
  // `hud.plist:53-59`: x -132, y 32, `AEGIS_WIDTH` x `AEGIS_HEIGHT` 24.
  aegis: { x: 636, y: 981, width: 54, height: 54 },
  // `hud.plist:67-75` and the SPD legend (`hud.plist:311-319`): the surround
  // around the 80x8 bar at (200, 95), the legend and the readout.
  speed: { x: 1315.5, y: 852.75, width: 335, height: 27 },
  // `hud.plist:76-93`: ROLL (200, 80) and PITCH (200, 70), 80x6 bars whose
  // surrounds share their middle border, with their legends.
  roll: { x: 1315.5, y: 888.75, width: 243, height: 22.5 },
  pitch: { x: 1315.5, y: 911.25, width: 256, height: 22.5 },
  // `hud.plist:140-147`: the 80x8 FUEL bar at (-200, 61), its legend and the
  // readout to its left.
  fuel: { x: 300, y: 933.75, width: 300, height: 18 },
  // D-01 (owner 2026-11-18): the clock stays at the top left.
  clock: { x: 60, y: 40, width: 360, height: 40 },
  // `hud.plist:191-198`: `drawStatusLight:` x -108, y 32, 8x8.
  condition: { x: 708, y: 999, width: 18, height: 18 },
  // `hud.plist:368-380` `message_gui`: x 128, y -60 (centre-anchored), 252x140.
  message: { x: 964.5, y: 517.5, width: 567, height: 315 },
};

/**
 * How many of Oolite's message rows the HUD draws: all ten (`message_gui`
 * height 140 over rows of 14), in ten 31.5 px bands of `HUD_LAYOUT.message`,
 * newest at the bottom (quick task 261118-cyn, D-03).
 */
export const HUD_MESSAGE_ROWS = MESSAGE_ROWS;

export interface HudContact extends ScannerBlip {
  readonly id: "station" | "navBuoy" | "witchpoint" | "ship";
  readonly kind: "station" | "buoy" | "beacon" | "ship" | "police";
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
  /** 0..1 forward shield (the FWD gauge). */
  readonly shieldFwd: number;
  /** 0..1 aft shield (the AFT gauge). */
  readonly shieldAft: number;
  /** The four energy banks `[E1, E2, E3, E4]` from the top, each 0..1. */
  readonly energyBanks: readonly [number, number, number, number];
  /** 0..1 laser temperature of the current facing (the LT gauge). */
  readonly laserTemp: number;
  /** 0..1 cabin temperature (the CT gauge), always visible. */
  readonly cabinTemp: number;
}

export interface HudModel {
  readonly speed: number;
  readonly clockSeconds: number;
  /** The newest message still shown (the probe publishes it as `hud.message`). */
  readonly message: string;
  /**
   * The drawn message rows, top to bottom, `HUD_MESSAGE_ROWS` of them at most;
   * a blank row has empty text and draws nothing.
   */
  readonly messageRows: readonly MessageRow[];
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
  /**
   * The ident lock frame around the locked ship in the 3D view (D-03), or null
   * when nothing is locked or the ship is out of view. A deliberate non-element
   * drawing: it is not in `HUD_ELEMENTS` and has no `HUD_LAYOUT` rectangle, as
   * the hyperspace target line is not (plan 13-14 records the Key Decisions row).
   */
  readonly identFrame: IdentFrame | null;
  /**
   * Oolite's scanner flash phase, `((int)(time * 4)) & 1`
   * (`HeadUpDisplay.m:1113`): buoys draw friendly green when it is set and
   * neutral yellow otherwise (D-08).
   */
  readonly scannerFlash: boolean;
  /**
   * The tangent of the forward view's horizontal half-angle, Oolite's `tanfov`
   * (`HeadUpDisplay.m:4002-4006`): the scanner's forward-view lines open to it.
   * `buildHudModel` writes it from the shared rule in `src/render/viewport.ts`.
   */
  readonly viewTanX: number;
}

/**
 * Oolite's `OTHER` crosshair (`crosshairs.plist:45-51`) at `crosshair_scale`
 * 32 (`hud.plist:2`): four arms from 0.5 to 1.0 of the scale, 36 to 72 design
 * px out (D-05).
 */
const CROSSHAIR_INNER = 36;
const CROSSHAIR_OUTER = 72;

function rectCentre(rect: HudRect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function drawCrosshair(context: CanvasRenderingContext2D): void {
  const { x, y } = rectCentre(HUD_LAYOUT.crosshair);
  context.strokeStyle = HUD_COLOR;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(x - CROSSHAIR_OUTER, y);
  context.lineTo(x - CROSSHAIR_INNER, y);
  context.moveTo(x + CROSSHAIR_INNER, y);
  context.lineTo(x + CROSSHAIR_OUTER, y);
  context.moveTo(x, y - CROSSHAIR_OUTER);
  context.lineTo(x, y - CROSSHAIR_INNER);
  context.moveTo(x, y + CROSSHAIR_INNER);
  context.lineTo(x, y + CROSSHAIR_OUTER);
  context.stroke();
}

/** The arm length of an ident corner bracket: a third of the half-size, at least 8. */
function identArm(half: number): number {
  return Math.max(8, half * 0.35);
}

/**
 * Four corner brackets around the locked ship (D-03), in the HUD colour. Drawn
 * only for a frame with finite numbers inside the design space.
 */
function drawIdentFrame(
  context: CanvasRenderingContext2D,
  frame: IdentFrame | null,
): void {
  if (
    frame === null ||
    !Number.isFinite(frame.x) ||
    !Number.isFinite(frame.y) ||
    !(frame.half > 0)
  ) {
    return;
  }
  const { x, y, half } = frame;
  const arm = identArm(half);
  context.strokeStyle = HUD_COLOR;
  context.lineWidth = 2;
  context.beginPath();
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const cx = x + sx * half;
      const cy = y + sy * half;
      context.moveTo(cx - sx * arm, cy);
      context.lineTo(cx, cy);
      context.lineTo(cx, cy - sy * arm);
    }
  }
  context.stroke();
}

/**
 * The lollipop colour of a contact kind: Oolite's per-class scanner colours.
 * The nav buoy and the witchpoint buoy are both Oolite's `CLASS_BUOY`, which
 * alternates the friendly and neutral colours on the scanner flash
 * (`ShipEntity.m:5667-5671`, D-08); the other kinds ignore `flash`.
 */
export function scannerContactColor(
  kind: HudContact["kind"],
  flash: boolean,
): string {
  switch (kind) {
    case "station":
      return HUD_COLOR;
    case "buoy":
    case "beacon":
      return flash ? HUD_COLOR : HUD_SCANNER_NEUTRAL_COLOR;
    case "ship":
      return HUD_SCANNER_NEUTRAL_COLOR;
    case "police":
      return HUD_SCANNER_POLICE_COLOR;
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
  viewTanX: number,
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

  // Forward field-of-view V-cone lines (HeadUpDisplay.m:4002-4012): the
  // flight view's horizontal half-angle tangent, `tanfov`.
  const tanFov = viewTanX;
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
  flash: boolean,
): void {
  for (const contact of contacts) {
    if (!contact.visible) continue;
    const baseX = x + contact.x;
    const baseY = y + contact.yBase;
    const headY = baseY + contact.yTail;
    const color = scannerContactColor(contact.kind, flash);

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
  drawScannerGrid(context, x, y, ww, hh, model.scannerRange, model.viewTanX);
  drawScannerContacts(context, x, y, model.contacts, model.scannerFlash);
  context.restore();
}

/** The compass blip size: `siz` times 0.2 (`drawCompass:`). */
const COMPASS_BLIP = 0.2 * COMPASS_SIZE;
/**
 * The compass ring and blips use twice Oolite's line width, 2 screen px,
 * which is 3 design px at 1280x720.
 */
const COMPASS_LINE_WIDTH = 3;
/** The witchpoint beacon's code letter (`shipdata.plist:1113`, "W0100 ..."). */
const WITCHPOINT_BEACON_CODE = "W";

/**
 * Oolite's `drawCompass:` (`HeadUpDisplay.m:1455-1546`): a blue ring of the
 * compass size, four cross ticks from 0.125 to 0.375 of it at half alpha, and
 * the target's blip at the projected point (D-06). Wegolite's compass targets
 * are the planet (`drawCompassPlanetBlipAt`), the station
 * (`drawCompassStationBlipAt`) and the witchpoint buoy, a beacon
 * (`drawCompassBeaconBlipAt` plus its code letter, `oo_drawHUDBeaconIconAt`);
 * Wegolite has no sun or target mode. No caption is drawn.
 */
function drawCompass(
  context: CanvasRenderingContext2D,
  compass: HudCompass,
): void {
  const { x, y } = rectCentre(HUD_LAYOUT.compass);
  const size = COMPASS_SIZE;

  context.save();
  context.strokeStyle = COMPASS_RING_COLOR;
  context.lineWidth = COMPASS_LINE_WIDTH;
  context.beginPath();
  context.arc(x, y, size / 2, 0, Math.PI * 2);
  context.stroke();

  context.globalAlpha = 0.5;
  context.beginPath();
  context.moveTo(x - size * 0.125, y);
  context.lineTo(x - size * 0.375, y);
  context.moveTo(x + size * 0.125, y);
  context.lineTo(x + size * 0.375, y);
  context.moveTo(x, y - size * 0.125);
  context.lineTo(x, y - size * 0.375);
  context.moveTo(x, y + size * 0.125);
  context.lineTo(x, y + size * 0.375);
  context.stroke();
  context.globalAlpha = 1;

  const bx = x + compass.x;
  const by = y + compass.y;
  const blip = COMPASS_BLIP;
  const color = compass.forward ? COMPASS_FRONT_COLOR : COMPASS_BEHIND_COLOR;
  context.strokeStyle = color;
  context.fillStyle = color;
  switch (compass.target) {
    case "planet":
      context.beginPath();
      context.arc(bx, by, blip / 2, 0, Math.PI * 2);
      if (compass.forward) {
        context.globalAlpha = 0.75;
        context.fill();
        context.globalAlpha = 1;
      }
      context.stroke();
      break;
    case "station":
      context.strokeRect(bx - blip / 2, by - blip / 2, blip, blip);
      break;
    case "witchpoint": {
      const d = 0.6 * blip;
      context.beginPath();
      context.moveTo(bx + d, by);
      context.lineTo(bx, by - d);
      context.lineTo(bx - d, by);
      context.lineTo(bx, by + d);
      context.closePath();
      context.stroke();
      // `oo_drawHUDBeaconIconAt` (NSString, `HeadUpDisplay.m:4127`): the code
      // letter in a cell twice the blip whose bottom-left corner is at
      // (x - 2.5 s, y - 3 s) in Oolite's y-up space, below and left of the
      // centre; sized by capital height like the legends.
      context.textAlign = "left";
      drawCapText(
        context,
        WITCHPOINT_BEACON_CODE,
        x - 2.5 * blip,
        y + 3 * blip,
        2 * blip,
        HUD_FONT_FAMILY,
      );
      break;
    }
  }
  context.restore();
}

/**
 * The 32 numbers of `drawAegis:`'s quad strip (`HeadUpDisplay.m:1656`): 16
 * vertices on a 16x16 grid that draw an "S".
 */
const AEGIS_STRIP = [
  -7, 8, -6, 5, 5, 8, 3, 5, 7, 2, 4, 2, 6, -1, 4, 2, -4, -1, -6, 2, -4, -1, -7,
  -1, -3, -4, -5, -7, 6, -4, 7, -7,
] as const;

/**
 * Oolite's `drawAegis:` (`HeadUpDisplay.m:1638-1665`): only in docking range,
 * a green "S" quad strip at half alpha, no caption (D-07). Oolite's y points
 * up, so vertex i is at (x + w strip[2i], y + h strip[2i+1]) on the canvas.
 */
function drawAegis(
  context: CanvasRenderingContext2D,
  status: AegisStatus,
): void {
  if (status !== "dockingRange") return;
  const rect = HUD_LAYOUT.aegis;
  const { x, y } = rectCentre(rect);
  const w = rect.width / 16;
  const h = rect.height / 16;
  const vertex = (i: number): [number, number] => [
    x + w * (AEGIS_STRIP[2 * i] ?? 0),
    y + h * (AEGIS_STRIP[2 * i + 1] ?? 0),
  ];
  context.fillStyle = AEGIS_COLOR;
  const count = AEGIS_STRIP.length / 2;
  // GL_QUAD_STRIP: quad k is vertices 2k, 2k+1, 2k+3, 2k+2.
  for (let k = 0; k + 3 < count; k += 2) {
    const quad = [vertex(k), vertex(k + 1), vertex(k + 3), vertex(k + 2)];
    context.beginPath();
    quad.forEach(([qx, qy], index) => {
      if (index === 0) context.moveTo(qx, qy);
      else context.lineTo(qx, qy);
    });
    context.closePath();
    context.fill();
  }
}

/**
 * A bar centred on `centreY` with its left edge at `barX` (`hudDrawBarAt`),
 * filled to `value` of `BAR_WIDTH`, with an optional surround 2 units out
 * (`hudDrawSurroundAt`).
 */
function drawBar(
  context: CanvasRenderingContext2D,
  barX: number,
  centreY: number,
  height: number,
  value: number,
  fillColor: string,
  surroundColor?: string,
): void {
  const top = centreY - height / 2;
  if (surroundColor !== undefined) {
    context.strokeStyle = surroundColor;
    context.lineWidth = 1.75;
    context.strokeRect(
      barX - SURROUND_PAD,
      top - SURROUND_PAD,
      BAR_WIDTH + SURROUND_PAD * 2,
      height + SURROUND_PAD * 2,
    );
  }
  const fillWidth = BAR_WIDTH * clamp(value, 0, 1);
  if (fillWidth > 0) {
    context.fillStyle = fillColor;
    context.fillRect(barX, top, fillWidth, height);
  }
}

/**
 * Oolite's `hudDrawIndicatorAt` (`HeadUpDisplay.m:3135-3146`) inside a green
 * surround: a yellow diamond 2 units either side of `x + amount w / 2`, the
 * bar's full height, for the signed -1..1 ROLL and PITCH dials.
 */
function drawIndicator(
  context: CanvasRenderingContext2D,
  barX: number,
  centreY: number,
  height: number,
  value: number,
): void {
  context.strokeStyle = HUD_COLOR;
  context.lineWidth = 1.75;
  context.strokeRect(
    barX - SURROUND_PAD,
    centreY - height / 2 - SURROUND_PAD,
    BAR_WIDTH + SURROUND_PAD * 2,
    height + SURROUND_PAD * 2,
  );
  const position = barX + BAR_WIDTH / 2 + (clamp(value, -1, 1) * BAR_WIDTH) / 2;
  context.fillStyle = HUD_SCANNER_NEUTRAL_COLOR;
  context.beginPath();
  context.moveTo(position, centreY - height / 2);
  context.lineTo(position + 2 * HUD_UNIT, centreY);
  context.lineTo(position, centreY + height / 2);
  context.lineTo(position - 2 * HUD_UNIT, centreY);
  context.closePath();
  context.fill();
}

/** `hud.plist:182-190` `drawMissileDisplay:`: x -228, y 16, 12x12 icons 16 apart. */
const MISSILE_X = -228;
const MISSILE_Y = 16;
const MISSILE_ICON_UNITS = 12;
const MISSILE_SPACING_UNITS = 16;
/**
 * `oolite-default-missile-icon` (`descriptions.plist:916-925`): the arrow
 * polygon in sprite units, y up.
 */
const MISSILE_ICON_POLYGON: ReadonlyArray<readonly [number, number]> = [
  [0, 3],
  [2, 0],
  [1, 0],
  [1, -2],
  [-1, -2],
  [-1, 0],
  [-2, 0],
];

/**
 * Oolite's pylon icon (`drawIconForMissile:`, `drawIconForEmptyPylonAtX:`):
 * pylon i sits at x + 16 i + 2 units (`HeadUpDisplay.m:2446-2459`); the
 * polygon is scaled by a quarter of the icon size (3 units) and translated to
 * (x - 6, y - 6) units, so an icon is 12 units wide and 15 high.
 */
function drawMissileIcon(
  context: CanvasRenderingContext2D,
  index: number,
  filled: boolean,
  selected: boolean,
): void {
  const scale = (MISSILE_ICON_UNITS / 4) * HUD_UNIT;
  const originX = unitX(
    MISSILE_X + index * MISSILE_SPACING_UNITS + 2 - MISSILE_ICON_UNITS / 2,
  );
  const originY = unitY(MISSILE_Y - MISSILE_ICON_UNITS / 2);
  context.beginPath();
  MISSILE_ICON_POLYGON.forEach(([px, py], point) => {
    const x = originX + px * scale;
    const y = originY - py * scale;
    if (point === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
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
 * Draw a legend whose Oolite cell (`cell` units high) has its bottom on
 * `bottom`, as `OODrawStringAligned` does. Oolite's capitals sit in the upper
 * part of the cell (measured at 1280x720: every legend's capitals are centred
 * 2/3 of a cell above its bottom, on its bar's centre line). The text is
 * sized by capital height for a cell of `sizeCell` units (`drawCapText`) and
 * its capitals stay centred 2/3 of `cell` above `bottom`; the two cells
 * differ only for the speed readout, placed on the SPD cell (14) and sized
 * by a 10-unit one.
 */
function drawLegend(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  bottom: number,
  cell: number,
  sizeCell: number,
): void {
  drawCapText(
    context,
    text,
    x,
    bottom - (2 / 3) * (cell - sizeCell) * HUD_UNIT,
    sizeCell * HUD_UNIT,
    HUD_FONT_FAMILY,
  );
}

/**
 * Left-hand Oolite gauge stack (`hud.plist:113-190`, legends `hud.plist:244-310`):
 * - `FWD` (y 94) and `AFT` (y 78) shield bars in green surrounds
 * - the yellow surround (y 46, 80x40) around `FUEL` (61), `CT` (51), `LT` (41)
 *   and the `ALT` placeholder (31)
 * - the `MISS` pylon placeholder at y 16
 */
function drawLeftGauges(
  context: CanvasRenderingContext2D,
  model: HudModel,
): void {
  const barHeight = 8 * HUD_UNIT;
  drawBar(
    context,
    LEFT_BAR_X,
    unitY(94),
    barHeight,
    model.bars.shieldFwd,
    HUD_COLOR,
    HUD_COLOR,
  );
  drawBar(
    context,
    LEFT_BAR_X,
    unitY(78),
    barHeight,
    model.bars.shieldAft,
    HUD_COLOR,
    HUD_COLOR,
  );

  // `drawSurround:` (`hud.plist:131-139`): yellow, 2 units around 80x40.
  context.strokeStyle = HUD_SCANNER_NEUTRAL_COLOR;
  context.lineWidth = 1.75;
  context.strokeRect(
    LEFT_BAR_X - SURROUND_PAD,
    unitY(46) - (40 * HUD_UNIT) / 2 - SURROUND_PAD,
    BAR_WIDTH + SURROUND_PAD * 2,
    40 * HUD_UNIT + SURROUND_PAD * 2,
  );
  drawBar(
    context,
    LEFT_BAR_X,
    unitY(61),
    barHeight,
    model.bars.fuel,
    HUD_SCANNER_NEUTRAL_COLOR,
  );
  drawBar(
    context,
    LEFT_BAR_X,
    unitY(51),
    barHeight,
    model.bars.cabinTemp,
    HUD_COLOR,
  );
  drawBar(
    context,
    LEFT_BAR_X,
    unitY(41),
    barHeight,
    model.bars.laserTemp,
    HUD_COLOR,
  );
  // The altitude (ALT) gauge stays a placeholder.
  drawBar(context, LEFT_BAR_X, unitY(31), barHeight, 0.92, HUD_COLOR);

  context.fillStyle = HUD_COLOR;
  context.textAlign = "right";
  const left = LEFT_LEGEND_X;
  drawLegend(context, "FWD", left, unitY(86), 12, 12);
  drawLegend(context, "AFT", left, unitY(70), 12, 12);
  drawLegend(context, "FUEL", left, unitY(55), 10, 10);
  // D-10: the "7.0 LY" readout stays, right-aligned left of the FUEL legend.
  drawLegend(context, model.fuelText, FUEL_READOUT_RIGHT, unitY(55), 10, 10);
  drawLegend(context, "CT", left, unitY(45), 10, 10);
  drawLegend(context, "LT", left, unitY(34), 10, 10);
  drawLegend(context, "ALT", left, unitY(24), 10, 10);
  drawLegend(context, "MISS", left, unitY(3), 14, 14);

  // Missile pylon placeholder (4 pylons, three loaded).
  for (let i = 0; i < 4; i += 1) {
    drawMissileIcon(context, i, i < 3, i === 0);
  }
}

/** `drawEnergyGauge:` (`hud.plist:103-112`): x 200, y 35, 80x48, four banks. */
const ENERGY_Y = 35;
const ENERGY_HEIGHT = 48;
const ENERGY_BANKS = 4;

/**
 * Right-hand Oolite gauge stack (`hud.plist:67-112`, legends `hud.plist:311-351`):
 * - `SPD` speed bar (y 95) with the kept "0.000 LS" readout (D-10)
 * - `ROLL` (y 80) and `PITCH` (y 70) yellow-diamond indicators
 * - the energy gauge's yellow surround around the four banks `E1`..`E4`
 */
function drawRightGauges(
  context: CanvasRenderingContext2D,
  model: HudModel,
): void {
  drawBar(
    context,
    RIGHT_BAR_X,
    unitY(95),
    8 * HUD_UNIT,
    model.bars.speed,
    HUD_COLOR,
    HUD_COLOR,
  );
  drawIndicator(context, RIGHT_BAR_X, unitY(80), 6 * HUD_UNIT, model.bars.roll);
  drawIndicator(
    context,
    RIGHT_BAR_X,
    unitY(70),
    6 * HUD_UNIT,
    model.bars.pitch,
  );

  // The energy surround, then the banks: `bankHeight = 48 / 4` units, each bar
  // 2 units shorter, E1 at the top (`HeadUpDisplay.m:1977-2040`).
  const centreY = unitY(ENERGY_Y);
  const gaugeHeight = ENERGY_HEIGHT * HUD_UNIT;
  context.strokeStyle = HUD_SCANNER_NEUTRAL_COLOR;
  context.lineWidth = 1.75;
  context.strokeRect(
    RIGHT_BAR_X - SURROUND_PAD,
    centreY - gaugeHeight / 2 - SURROUND_PAD,
    BAR_WIDTH + SURROUND_PAD * 2,
    gaugeHeight + SURROUND_PAD * 2,
  );
  const bankHeight = gaugeHeight / ENERGY_BANKS;
  const top = centreY - gaugeHeight / 2;
  for (let i = 0; i < ENERGY_BANKS; i += 1) {
    drawBar(
      context,
      RIGHT_BAR_X,
      top + bankHeight * (i + 0.5),
      bankHeight - 2 * HUD_UNIT,
      model.bars.energyBanks[i] ?? 0,
      HUD_SCANNER_NEUTRAL_COLOR,
    );
  }

  context.fillStyle = HUD_COLOR;
  context.textAlign = "left";
  const right = RIGHT_LEGEND_X;
  drawLegend(context, "SPD", right, unitY(86), 14, 14);
  // D-10: the "0.000 LS" readout stays, right of the SPD legend.
  drawLegend(context, model.speedText, SPEED_READOUT_X, unitY(86), 14, 10);
  drawLegend(context, "ROLL", right, unitY(72), 12, 12);
  drawLegend(context, "PITCH", right, unitY(62), 12, 12);
  // The bank labels start 3 units right of the gauge (`labelStartX`) in cells
  // 12 units high whose bottom is 1 unit below the bank's bottom edge.
  const labelX = RIGHT_BAR_X + BAR_WIDTH + 3 * HUD_UNIT;
  for (let i = 0; i < ENERGY_BANKS; i += 1) {
    drawLegend(
      context,
      `E${String(i + 1)}`,
      labelX,
      top + bankHeight * (i + 1) + HUD_UNIT,
      12,
      12,
    );
  }
}

/**
 * Oolite's `drawStatusLight:` (`HeadUpDisplay.m:2545-2595`): the octagon of
 * `hudDrawStatusIconAt` (`HeadUpDisplay.m:3220-3234`, corners cut at a
 * quarter of the size) filled in the condition colour and outlined in grey
 * (D-04). The colours stay Wegolite's (D-10); Oolite's alpha pulse is not
 * ported.
 */
function drawCondition(
  context: CanvasRenderingContext2D,
  condition: HudModel["condition"],
): void {
  const colors: Record<HudModel["condition"], string> = {
    green: HUD_COLOR,
    yellow: HUD_AMBER,
    red: HUD_RED,
  };
  const rect = HUD_LAYOUT.condition;
  const ox = rect.x;
  const oy = rect.y;
  const w = rect.width / 4;
  const h = rect.height / 4;
  const points: ReadonlyArray<readonly [number, number]> = [
    [ox, oy + h],
    [ox, oy + 3 * h],
    [ox + w, oy + 4 * h],
    [ox + 3 * w, oy + 4 * h],
    [ox + 4 * w, oy + 3 * h],
    [ox + 4 * w, oy + h],
    [ox + 3 * w, oy],
    [ox + w, oy],
  ];
  context.beginPath();
  points.forEach(([px, py], index) => {
    if (index === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  });
  context.closePath();
  context.fillStyle = colors[condition];
  context.fill();
  context.strokeStyle = CONDITION_OUTLINE_COLOR;
  context.lineWidth = 1.5;
  context.stroke();
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

/**
 * Oolite's message area (`hud.plist` `message_gui`, `GuiDisplayGen.m:1327-1336`):
 * slot i of `HUD_MESSAGE_ROWS` is centred in the ith of ten 31.5 px bands of
 * the message rectangle, the newest at the bottom, centred on its x, in
 * Oolite's yellow, each at its own alpha (a row fades over its last second).
 */
function drawMessageRows(
  context: CanvasRenderingContext2D,
  rows: readonly MessageRow[],
): void {
  const { message } = HUD_LAYOUT;
  const band = message.height / HUD_MESSAGE_ROWS;
  const slots = rows.slice(-HUD_MESSAGE_ROWS);
  const offset = HUD_MESSAGE_ROWS - slots.length;
  context.font = hudFont(context, HUD_MESSAGE_FONT_PX);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = HUD_MESSAGE_COLOR;
  slots.forEach((row, index) => {
    if (row.text === "" || !(row.alpha > 0)) return;
    const slot = offset + index;
    context.globalAlpha = clamp(row.alpha, 0, 1);
    context.fillText(
      row.text,
      message.x + message.width / 2,
      message.y + band * (slot + 0.5),
    );
  });
  context.globalAlpha = 1;
}

/**
 * Clear the design space and draw the model.
 *
 * @param lift The HUD-ANCHOR lift in design px (option B, owner 2026-11-18):
 *   everything but the crosshair, the ident frame, the clock lines and the
 *   flash is drawn this much higher, so the block rests on the document
 *   disclaimer's top edge. 0, negative or non-finite draws the plain table.
 */
export function drawHud(
  context: CanvasRenderingContext2D,
  model: HudModel,
  lift = 0,
): void {
  context.clearRect(0, 0, HUD_DESIGN_WIDTH, HUD_DESIGN_HEIGHT);
  context.textBaseline = "middle";

  drawCrosshair(context);
  drawIdentFrame(context, model.identFrame);

  context.save();
  if (Number.isFinite(lift) && lift > 0) context.translate(0, -lift);
  drawScanner(context, model);
  drawCompass(context, model.compass);
  drawAegis(context, model.aegis);
  drawLeftGauges(context, model);
  drawRightGauges(context, model);
  drawCondition(context, model.condition);
  drawMessageRows(context, model.messageRows);
  context.restore();

  context.fillStyle = HUD_COLOR;
  // D-01 (owner 2026-11-18): the clock and its hyperspace line stay at the top
  // left in the 20px small font, centred on the first and third quarters of
  // the clock rectangle.
  context.font = HUD_SMALL_FONT;
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText(
    model.clockText,
    HUD_LAYOUT.clock.x,
    HUD_LAYOUT.clock.y + HUD_LAYOUT.clock.height / 4,
  );

  // D-12/A2: the committed target is a second line inside the existing clock
  // rectangle. HUD_ELEMENTS and every HUD_LAYOUT rectangle stay unchanged.
  context.fillText(
    `Hyperspace: ${model.hyperspaceTarget === "" ? "(Unknown)" : model.hyperspaceTarget}`,
    HUD_LAYOUT.clock.x,
    HUD_LAYOUT.clock.y + (3 * HUD_LAYOUT.clock.height) / 4,
  );

  // Drawn last so the red frame is never covered by a HUD element.
  drawFlash(context, model.flashAlpha);
}
