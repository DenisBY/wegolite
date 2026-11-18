// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * HUD text sized by capital height (quick task 261118-ih8, owner option 1,
 * 2026-11-18).
 *
 * The flight HUD's legends, the two readouts, the energy bank labels and the
 * witchpoint beacon letter are sized so that their capitals are as tall as
 * Oolite's (`OOLITE_CAP_PER_CELL` of the Oolite glyph cell) and centred 2/3
 * of the cell above its bottom. The browser font's capital height is
 * measured once per context ("H", `actualBoundingBoxAscent`), with a nominal
 * fallback. The message rows keep their width calibration (261118-cyn) and
 * the clock its small font (D-01).
 */

import { describe, expect, it, vi } from "vitest";

import { buildHudModel } from "../../src/app/hud-model.js";
import {
  OOLITE_CAP_PER_CELL,
  capFontPx,
  drawCapText,
  measuredCapPerPx,
} from "../../src/render/hud/cap-text.js";
import {
  COMPASS_SIZE,
  HUD_LAYOUT,
  HUD_SMALL_FONT,
  HUD_UNIT,
  drawHud,
} from "../../src/render/hud/draw.js";
import type { HudModel } from "../../src/render/hud/draw.js";
import { initFlightState } from "../../src/sim/flight/state.js";
import { laveFixture } from "../helpers/lave.js";

const FAMILY = "monospace";

/** The font size in px of a CSS font string such as "20.5px monospace". */
function fontPx(font: string): number {
  const match = /^([\d.]+)px /.exec(font);
  expect(match, `font "${font}"`).not.toBeNull();
  return Number((match as RegExpExecArray)[1]);
}

/** The font size `drawCapText` sets: `capFontPx` rounded to 0.01 px. */
function roundedCapFont(cellPx: number, ratio: number): number {
  return Math.round(capFontPx(cellPx, ratio) * 100) / 100;
}

interface TextCall {
  text: string;
  x: number;
  y: number;
  font: string;
  textBaseline: string;
}

interface Metrics {
  /** The capital height per px of font size, or a broken value. */
  cap?: number;
  /** The advance per px of font size. */
  advance?: number;
  /** Omit `measureText` entirely. */
  noMeasure?: boolean;
}

/** A recording 2D context whose `measureText` scales with the font size. */
function recordingContext(metrics: Metrics = {}) {
  const calls: TextCall[] = [];
  let offset: [number, number] = [0, 0];
  const stack: Array<[number, number]> = [];
  const measureText = vi.fn(function (this: { font: string }, text: string) {
    const size = fontPx(this.font);
    return {
      width: text.length * (metrics.advance ?? 0.5) * size,
      actualBoundingBoxAscent:
        metrics.cap === undefined ? undefined : metrics.cap * size,
    };
  });
  const context = {
    save: vi.fn(() => stack.push([...offset])),
    restore: vi.fn(() => {
      offset = stack.pop() ?? [0, 0];
    }),
    translate: vi.fn((dx: number, dy: number) => {
      offset = [offset[0] + dx, offset[1] + dy];
    }),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    ellipse: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    strokeRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(function (
      this: { font: string; textBaseline: string },
      text: string,
      x: number,
      y: number,
    ) {
      calls.push({
        text,
        x: x + offset[0],
        y: y + offset[1],
        font: this.font,
        textBaseline: this.textBaseline,
      });
    }),
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    font: "10px sans-serif",
    textAlign: "left",
    textBaseline: "middle",
    ...(metrics.noMeasure === true ? {} : { measureText }),
  };
  return {
    context: context as unknown as CanvasRenderingContext2D,
    calls,
    measureText,
  };
}

describe("OOLITE_CAP_PER_CELL and capFontPx", () => {
  it("pins the capital height per Oolite glyph cell", () => {
    // oolite-font.png: the "H" ink covers rows 13 to 48 of a 64 px cell.
    expect(OOLITE_CAP_PER_CELL).toBe(0.5625);
  });

  it("sizes the font so its capitals are OOLITE_CAP_PER_CELL of the cell", () => {
    for (const cell of [27, 31.5, 22.5]) {
      expect(capFontPx(cell, 0.75)).toBeCloseTo(
        (OOLITE_CAP_PER_CELL * cell) / 0.75,
        9,
      );
    }
    expect(capFontPx(27, 0.75) * 0.75).toBeCloseTo(OOLITE_CAP_PER_CELL * 27, 9);
  });

  it("is linear in the cell and inverse in the font's capital ratio", () => {
    expect(capFontPx(54, 0.75)).toBeCloseTo(2 * capFontPx(27, 0.75), 9);
    expect(capFontPx(27, 0.5)).toBeCloseTo(1.5 * capFontPx(27, 0.75), 9);
  });
});

describe("measuredCapPerPx", () => {
  it("measures the capital H at 100 px and restores the font and baseline", () => {
    const { context, measureText } = recordingContext({ cap: 0.73 });
    expect(measuredCapPerPx(context, FAMILY)).toBeCloseTo(0.73, 9);
    expect(measureText).toHaveBeenCalledWith("H");
    expect(context.font).toBe("10px sans-serif");
    expect(context.textBaseline).toBe("middle");
  });

  it("measures once per context and family", () => {
    const { context, measureText } = recordingContext({ cap: 0.73 });
    measuredCapPerPx(context, FAMILY);
    measuredCapPerPx(context, FAMILY);
    expect(measureText).toHaveBeenCalledTimes(1);
    measuredCapPerPx(context, "serif");
    expect(measureText).toHaveBeenCalledTimes(2);
  });

  it("falls back to 0.7 without measureText or with an unusable ascent", () => {
    const cases: Metrics[] = [
      { noMeasure: true },
      {},
      { cap: Number.NaN },
      { cap: Number.POSITIVE_INFINITY },
      { cap: 0.2 },
      { cap: 1.5 },
    ];
    for (const metrics of cases) {
      const { context } = recordingContext(metrics);
      expect(measuredCapPerPx(context, FAMILY), JSON.stringify(metrics)).toBe(
        0.7,
      );
    }
  });
});

describe("drawCapText", () => {
  it("draws capitals OOLITE_CAP_PER_CELL of the cell tall, centred 2/3 above its bottom", () => {
    const { context, calls } = recordingContext({ cap: 0.73 });
    drawCapText(context, "FWD", 100, 500, 27, FAMILY);
    expect(calls).toHaveLength(1);
    const call = calls[0] as TextCall;
    const size = fontPx(call.font);
    expect(size).toBe(roundedCapFont(27, 0.73));
    expect(call.font).toBe(`${String(size)}px ${FAMILY}`);
    expect(call.textBaseline).toBe("alphabetic");
    expect(call.x).toBe(100);
    const cap = size * 0.73;
    expect(Math.abs(cap - OOLITE_CAP_PER_CELL * 27)).toBeLessThan(0.01);
    // The baseline is the capitals' bottom; their centre is half a cap above.
    expect(call.y).toBeCloseTo(
      500 - (2 / 3) * 27 + (OOLITE_CAP_PER_CELL * 27) / 2,
      9,
    );
    expect(Math.abs(call.y - cap / 2 - (500 - (2 / 3) * 27))).toBeLessThan(
      0.01,
    );
  });

  it("uses the 0.7 fallback on a context without measureText", () => {
    const { context, calls } = recordingContext({ noMeasure: true });
    drawCapText(context, "E1", 0, 0, 27, FAMILY);
    expect(fontPx((calls[0] as TextCall).font)).toBe(roundedCapFont(27, 0.7));
  });
});

describe("drawHud draws its legends by capital height", () => {
  const fixture = laveFixture();
  const base = buildHudModel(
    initFlightState(fixture.layout),
    fixture.layout,
    fixture.config,
    "Hyperspeed mass-locked.",
    70,
    0,
    "Diso",
    [],
  );
  const model: HudModel = {
    ...base,
    compass: { target: "witchpoint", x: 0, y: 0, forward: true, blip: true },
  };
  const { context, calls } = recordingContext({ cap: 0.73, advance: 0.5 });
  drawHud(context, model, 0);
  const find = (text: string): TextCall => {
    const call = calls.find((entry) => entry.text === text);
    expect(call, `fillText call for "${text}"`).toBeDefined();
    return call as TextCall;
  };
  const capCentre = (call: TextCall) => call.y - (fontPx(call.font) * 0.73) / 2;

  it("sizes each legend by its hud.plist cell", () => {
    const cells: Record<string, number> = {
      FWD: 12,
      AFT: 12,
      ROLL: 12,
      PITCH: 12,
      E1: 12,
      E2: 12,
      E3: 12,
      E4: 12,
      MISS: 14,
      SPD: 14,
      FUEL: 10,
      CT: 10,
      LT: 10,
      ALT: 10,
      [model.fuelText]: 10,
      [model.speedText]: 10,
    };
    for (const [text, cell] of Object.entries(cells)) {
      const call = find(text);
      expect(fontPx(call.font), text).toBe(
        roundedCapFont(cell * HUD_UNIT, 0.73),
      );
      expect(call.textBaseline, text).toBe("alphabetic");
    }
  });

  it("puts the speed readout's capitals on the SPD cell's centre line", () => {
    expect(capCentre(find(model.speedText))).toBeCloseTo(
      capCentre(find("SPD")),
      2,
    );
  });

  it("draws the witchpoint W in a cell of twice the blip, its bottom 3 blips below the centre", () => {
    const blip = 0.2 * COMPASS_SIZE;
    const rect = HUD_LAYOUT.compass;
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const w = find("W");
    expect(fontPx(w.font)).toBe(roundedCapFont(2 * blip, 0.73));
    expect(w.x).toBeCloseTo(cx - 2.5 * blip, 9);
    expect(w.y).toBeCloseTo(
      cy + 3 * blip - (2 / 3) * 2 * blip + (OOLITE_CAP_PER_CELL * 2 * blip) / 2,
      9,
    );
  });

  it("keeps the message rows on the width font and the clock on the small font", () => {
    // 23.2 px at a 0.6 em advance, rescaled to the measured 0.5 em.
    expect(fontPx(find("Hyperspeed mass-locked.").font)).toBe(27.84);
    expect(find(model.clockText).font).toBe(HUD_SMALL_FONT);
  });
});
