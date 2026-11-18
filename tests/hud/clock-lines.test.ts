// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The HUD text and glyph drawing.
 *
 * The top-left clock and the Hyperspace target line share the 20px HUD small
 * font and sit inside the 40px clock rectangle (owner request 261117-glc); the
 * clock stays at the top left by owner decision (261118-cyn D-01).
 *
 * The message area is Oolite's `hud.plist` `message_gui` (x 128, y -60,
 * 252x140, rows of 14, yellow text) at 2.25 design px per unit: ten 31.5 px
 * rows in the rect (964.5, 517.5, 567, 315), newest at the bottom, centred on
 * x 1248 (quick task 261118-cyn, D-03, D-08). The aegis indicator is Oolite's
 * green "S" strip, drawn only in docking range and without a caption (D-07);
 * the compass draws no caption letter (D-06). Under the HUD-ANCHOR lift
 * (option B) everything but the crosshair, the ident frame, the clock lines
 * and the flash moves up by the lift.
 */

import { describe, expect, it, vi } from "vitest";

import { buildHudModel } from "../../src/app/hud-model.js";
import { hudLift } from "../../src/render/hud/hud.js";
import { initFlightState } from "../../src/sim/flight/state.js";
import {
  HUD_LAYOUT,
  HUD_MESSAGE_COLOR,
  HUD_MESSAGE_FONT,
  HUD_MESSAGE_ROWS,
  HUD_SMALL_FONT,
  drawHud,
} from "../../src/render/hud/draw.js";
import type { HudModel } from "../../src/render/hud/draw.js";
import type { MessageRow } from "../../src/render/hud/messages.js";
import { laveFixture } from "../helpers/lave.js";

interface TextCall {
  text: string;
  x: number;
  y: number;
  font: string;
  alpha: number;
  fillStyle: string;
}

interface Recording {
  calls: TextCall[];
  /** Absolute moveTo points, translation applied. */
  moves: Array<[number, number]>;
  /** Fill styles of every `fill()` call. */
  fills: string[];
  clockText: string;
}

const MESSAGE = "Test message";
const TARGET = "Diso";

function modelOf(
  messageRows?: readonly MessageRow[],
  patch: Partial<HudModel> = {},
): HudModel {
  const fixture = laveFixture();
  const model = buildHudModel(
    initFlightState(fixture.layout),
    fixture.layout,
    fixture.config,
    MESSAGE,
    70,
    0,
    TARGET,
    [],
    { messageRows },
  );
  return { ...model, ...patch };
}

function recordModel(model: HudModel, lift = 0): Recording {
  const calls: TextCall[] = [];
  const moves: Array<[number, number]> = [];
  const fills: string[] = [];
  let offset: [number, number] = [0, 0];
  const stack: Array<[number, number]> = [];
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
    moveTo: vi.fn((x: number, y: number) => {
      moves.push([x + offset[0], y + offset[1]]);
    }),
    lineTo: vi.fn(),
    ellipse: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(function (this: { fillStyle: string }) {
      fills.push(this.fillStyle);
    }),
    strokeRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(function (
      this: { font: string; globalAlpha: number; fillStyle: string },
      text: string,
      x: number,
      y: number,
    ) {
      calls.push({
        text,
        x: x + offset[0],
        y: y + offset[1],
        font: this.font,
        alpha: this.globalAlpha,
        fillStyle: this.fillStyle,
      });
    }),
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
  } as unknown as CanvasRenderingContext2D;
  drawHud(context, model, lift);
  return { calls, moves, fills, clockText: model.clockText };
}

function recordDraw(messageRows?: readonly MessageRow[]): Recording {
  return recordModel(modelOf(messageRows));
}

function find(calls: readonly TextCall[], text: string): TextCall {
  const call = calls.find((entry) => entry.text === text);
  expect(call, `fillText call for "${text}"`).toBeDefined();
  return call as TextCall;
}

describe("HUD clock and Hyperspace lines", () => {
  const { calls, clockText } = recordDraw();
  const clock = find(calls, clockText);
  const target = find(calls, `Hyperspace: ${TARGET}`);
  const { x, y, height } = HUD_LAYOUT.clock;

  it("draws the clock and the Hyperspace line in the HUD small font", () => {
    expect(clock.font).toBe(HUD_SMALL_FONT);
    expect(target.font).toBe(HUD_SMALL_FONT);
  });

  it("puts both lines on the clock x, at the first and third quarters", () => {
    expect(clock.x).toBe(x);
    expect(target.x).toBe(x);
    expect(clock.y).toBe(y + height / 4);
    expect(target.y).toBe(y + (3 * height) / 4);
  });

  it("keeps the two lines apart and inside the clock rectangle", () => {
    const match = /^(\d+)px/.exec(HUD_SMALL_FONT);
    expect(match).not.toBeNull();
    const size = Number((match as RegExpExecArray)[1]);
    expect(target.y - clock.y).toBeGreaterThanOrEqual(size);
    expect(clock.y - size / 2).toBeGreaterThanOrEqual(y);
    expect(target.y + size / 2).toBeLessThanOrEqual(y + height);
  });

  it("draws the messages in their own font, in Oolite's yellow", () => {
    const message = find(calls, MESSAGE);
    expect(message.font).toBe(HUD_MESSAGE_FONT);
    expect(message.fillStyle).toBe(HUD_MESSAGE_COLOR);
    expect(HUD_MESSAGE_COLOR).toBe("rgb(255, 255, 0)");
  });
});

describe("HUD message rows (quick task 261118-cyn, D-03)", () => {
  const { x, y, width, height } = HUD_LAYOUT.message;
  const band = height / HUD_MESSAGE_ROWS;
  const bandCentre = (index: number) => y + band * (index + 0.5);

  it("draws a lone message centred on x 1248 in the tenth 31.5 px band, at full alpha", () => {
    expect(HUD_MESSAGE_ROWS).toBe(10);
    expect(band).toBe(31.5);
    const call = find(recordDraw().calls, MESSAGE);
    expect(call.x).toBe(x + width / 2);
    expect(call.x).toBe(1248);
    expect(call.y).toBe(bandCentre(9));
    expect(call.alpha).toBe(1);
  });

  it("draws two rows, newest at the bottom, each at its own alpha", () => {
    const { calls } = recordDraw([
      { text: "older", alpha: 1 },
      { text: "newest", alpha: 0.25 },
    ]);
    const older = find(calls, "older");
    const newest = find(calls, "newest");
    expect(older.y).toBe(bandCentre(8));
    expect(newest.y).toBe(bandCentre(9));
    expect(older.alpha).toBe(1);
    expect(newest.alpha).toBe(0.25);
    expect(older.font).toBe(HUD_MESSAGE_FONT);
  });

  it("draws ten rows top to bottom and nothing for a blank row", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      text: i === 3 ? "" : `r${String(i)}`,
      alpha: i === 3 ? 0 : 1,
    }));
    const { calls } = recordDraw(rows);
    expect(calls.filter((call) => call.text === "")).toHaveLength(0);
    expect(find(calls, "r0").y).toBe(bandCentre(0));
    expect(find(calls, "r9").y).toBe(bandCentre(9));
  });
});

describe("HUD symbols (quick task 261118-cyn, D-06, D-07)", () => {
  it("draws the aegis strip in green only in docking range, with no caption", () => {
    const docking = recordModel(modelOf(undefined, { aegis: "dockingRange" }));
    const planet = recordModel(modelOf(undefined, { aegis: "planet" }));
    const texts = [...docking.calls, ...planet.calls].map((call) => call.text);
    expect(texts).not.toContain("AEGIS");
    expect(texts).not.toContain("PLANET");
    const aegisFills = (fills: readonly string[]) =>
      fills.filter((fill) => fill === "rgba(0, 255, 0, 0.5)").length;
    // Oolite's 16-vertex quad strip is seven quads.
    expect(aegisFills(docking.fills)).toBe(7);
    expect(aegisFills(planet.fills)).toBe(0);
  });

  it("draws no caption letter under the compass", () => {
    for (const target of ["planet", "station"] as const) {
      const model = modelOf(undefined, {
        compass: { target, x: 0, y: 0, forward: true },
      });
      const texts = recordModel(model).calls.map((call) => call.text);
      expect(texts).not.toContain("P");
      expect(texts).not.toContain("S");
    }
  });

  it("draws the witchpoint beacon's letter W, as oo_drawHUDBeaconIconAt does", () => {
    const model = modelOf(undefined, {
      compass: { target: "witchpoint", x: 0, y: 0, forward: true },
    });
    expect(recordModel(model).calls.map((call) => call.text)).toContain("W");
  });
});

describe("HUD-ANCHOR lift (option B, owner 2026-11-18)", () => {
  const model = modelOf([{ text: MESSAGE, alpha: 1 }]);
  const plain = recordModel(model, 0);
  const lifted = recordModel(model, 62);

  it("keeps the clock and the crosshair where they are", () => {
    expect(find(lifted.calls, plain.clockText).y).toBe(
      find(plain.calls, plain.clockText).y,
    );
    // The crosshair's left arm starts 72 px left of the centre (960, 540).
    expect(plain.moves).toContainEqual([888, 540]);
    expect(lifted.moves).toContainEqual([888, 540]);
  });

  it("moves every other element up by the lift", () => {
    for (const text of ["SPD", "FWD", "MISS", "E1", MESSAGE]) {
      expect(find(lifted.calls, text).y, text).toBeCloseTo(
        find(plain.calls, text).y - 62,
        9,
      );
    }
  });

  it("draws the plain table with no lift", () => {
    expect(find(plain.calls, MESSAGE).y).toBeCloseTo(816.75, 9);
  });
});

describe("hudLift (HUD-ANCHOR option B)", () => {
  it("converts the disclaimer height into design units at 1280x720", () => {
    // 62 CSS px at DPR 1, no letterbox, 720 / 1080 device px per design unit.
    expect(hudLift(62, 1, 0, 720 / 1080)).toBeCloseTo(93, 9);
  });

  it("subtracts a bottom letterbox margin and never goes negative", () => {
    expect(hudLift(45, 1, 15, 1)).toBe(30);
    expect(hudLift(45, 1, 60, 1)).toBe(0);
  });

  it("is 0 for no disclaimer or an unusable input", () => {
    expect(hudLift(0, 1, 0, 1)).toBe(0);
    expect(hudLift(Number.NaN, 1, 0, 1)).toBe(0);
    expect(hudLift(62, 1, 0, 0)).toBe(0);
  });
});
