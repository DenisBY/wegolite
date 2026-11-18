// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * HUD text sized and placed by capital height (quick task 261118-ih8, owner
 * option 1, 2026-11-18).
 *
 * Oolite draws every HUD legend from one proportional font texture in a cell
 * of the legend's `hud.plist` size; the HUD's font here is monospace. Sizing
 * the monospace font by width (261118-cyn) made its capitals 3 to 6 px taller
 * than Oolite's at 1280x720, so the legends, the two readouts, the energy bank
 * labels and the beacon letter are sized by capital height instead: the font
 * size is chosen so that the browser font's measured capital height is
 * `OOLITE_CAP_PER_CELL` of the Oolite cell. The text ends up narrower than
 * Oolite's (accepted by the owner). The message rows keep the width sizing.
 */

/**
 * The capital height of Oolite's HUD font as a fraction of the glyph cell.
 *
 * `Resources/Textures/oolite-font.png` (1024x1024, sixteen 64 px cells): the
 * ink of "H", "F", "W", "D", "M", "I", "P", "T" and "E" covers rows 13 to 48
 * of the 64 px cell at half intensity, 36 / 64 = 0.5625. `drawCharacterQuad`
 * (`HeadUpDisplay.m:3599-3619` at 7437f22) draws a glyph as a full-cell quad
 * lifted by 1/8 of the cell (`HeadUpDisplay.m:3607`), so the capitals span
 * 0.359 to 0.922 of the cell above its bottom. Calibrated on Oolite's 1280x720
 * flight screenshot (one hud.plist unit = 1.5 screen px), where the mask
 * heights are 11 px for the 12-unit cells (FWD, PITCH, E1) and 12 to 13 px for
 * the 14-unit cells (MISS, SPD), about 1 px of antialias above 0.5625.
 */
export const OOLITE_CAP_PER_CELL = 0.5625;

/**
 * The capital height per px of font size assumed when the browser cannot
 * measure it (no `measureText`, or an unusable ascent).
 */
const NOMINAL_CAP_PER_PX = 0.7;
const MIN_CAP_PER_PX = 0.3;
const MAX_CAP_PER_PX = 1.2;

/** The measured capital height per px, per context and font family. */
const measuredCaps = new WeakMap<
  CanvasRenderingContext2D,
  Map<string, number>
>();

/**
 * The font size in px whose capitals are `OOLITE_CAP_PER_CELL` of a cell
 * `cellPx` high, for a font whose capitals are `fontCapPerPx` of its size.
 */
export function capFontPx(cellPx: number, fontCapPerPx: number): number {
  return (OOLITE_CAP_PER_CELL * cellPx) / fontCapPerPx;
}

/**
 * The capital height per px of font size of `family` in `context`: the
 * ascent of "H" above the alphabetic baseline at 100 px, measured once per
 * context and family. Falls back to 0.7 without `measureText` or when the
 * ascent is missing, not finite, or outside 0.3 to 1.2 per px.
 */
export function measuredCapPerPx(
  context: CanvasRenderingContext2D,
  family: string,
): number {
  let perFamily = measuredCaps.get(context);
  const known = perFamily?.get(family);
  if (known !== undefined) return known;
  let cap = NOMINAL_CAP_PER_PX;
  if (typeof context.measureText === "function") {
    const previousFont = context.font;
    const previousBaseline = context.textBaseline;
    context.font = `100px ${family}`;
    context.textBaseline = "alphabetic";
    const ascent = (
      context.measureText("H") as Partial<TextMetrics> | undefined
    )?.actualBoundingBoxAscent;
    context.font = previousFont;
    context.textBaseline = previousBaseline;
    if (typeof ascent === "number" && Number.isFinite(ascent)) {
      const ratio = ascent / 100;
      if (ratio >= MIN_CAP_PER_PX && ratio <= MAX_CAP_PER_PX) cap = ratio;
    }
  }
  if (perFamily === undefined) {
    perFamily = new Map();
    measuredCaps.set(context, perFamily);
  }
  perFamily.set(family, cap);
  return cap;
}

/**
 * Draw `text` with capitals `OOLITE_CAP_PER_CELL` of a cell `cellPx` high
 * whose bottom is at `cellBottom`, centred 2/3 of the cell above that bottom
 * (where 261118-cyn measured Oolite's legends at 1280x720; the texture
 * geometry gives 0.641). It sets the font and an alphabetic baseline, and
 * leaves `textAlign` and `fillStyle` to the caller.
 */
export function drawCapText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  cellBottom: number,
  cellPx: number,
  family: string,
): void {
  const size = capFontPx(cellPx, measuredCapPerPx(context, family));
  context.font = `${String(Math.round(size * 100) / 100)}px ${family}`;
  context.textBaseline = "alphabetic";
  const capCentre = cellBottom - (2 / 3) * cellPx;
  context.fillText(text, x, capCentre + (OOLITE_CAP_PER_CELL * cellPx) / 2);
}
