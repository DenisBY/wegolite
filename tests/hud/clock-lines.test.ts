// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The top-left clock and the Hyperspace target line share the 20px HUD small
 * font and sit inside the 40px clock rectangle (owner request 261117-glc).
 * Oolite's `hud.plist` `drawClock:` uses a character size of 12, which is
 * about 21px at the 1.75x HUD scale (D-08); the rectangle is unchanged
 * (D-12/A2).
 */

import { describe, expect, it, vi } from "vitest";

import { buildHudModel } from "../../src/app/hud-model.js";
import { initFlightState } from "../../src/sim/flight/state.js";
import {
  HUD_LAYOUT,
  HUD_SMALL_FONT,
  drawHud,
} from "../../src/render/hud/draw.js";
import { laveFixture } from "../helpers/lave.js";

interface TextCall {
  text: string;
  x: number;
  y: number;
  font: string;
}

const MESSAGE = "Test message";
const TARGET = "Diso";

function recordDraw(): { calls: TextCall[]; clockText: string } {
  const fixture = laveFixture();
  const model = buildHudModel(
    initFlightState(fixture.layout),
    fixture.layout,
    fixture.config,
    MESSAGE,
    70,
    0,
    TARGET,
  );
  const calls: TextCall[] = [];
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
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
      this: { font: string },
      text: string,
      x: number,
      y: number,
    ) {
      calls.push({ text, x, y, font: this.font });
    }),
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
  } as unknown as CanvasRenderingContext2D;
  drawHud(context, model);
  return { calls, clockText: model.clockText };
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

  it("keeps the centre message in the HUD small font", () => {
    expect(find(calls, MESSAGE).font).toBe(HUD_SMALL_FONT);
  });
});
