// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Scanner and compass projection (FLGT-05, D-07).
 *
 * The scanner is Oolite's non-uniform ellipse: a dead-ahead contact at the
 * range sits at the top centre (inside the forward FOV cone), a contact above
 * has an upward tail, and a contact behind sits below the centre. A contact
 * just outside the range but whose collision sphere still intersects it is
 * pinned to the rim; beyond `range + radius` it is omitted.
 */

import { describe, expect, it, vi } from "vitest";

import { buildHudModel } from "../../src/app/hud-model.js";
import { identity, vec } from "../../src/sim/math.js";
import type { Vec3 } from "../../src/sim/math.js";
import { initFlightState } from "../../src/sim/flight/state.js";
import {
  HUD_COLOR,
  HUD_LAYOUT,
  HUD_SCANNER_GRID_COLOR,
  HUD_SCANNER_NEUTRAL_COLOR,
  drawHud,
} from "../../src/render/hud/draw.js";
import {
  aegisLabel,
  projectToCompass,
  projectToScanner,
} from "../../src/render/hud/projection.js";
import { laveFixture } from "../helpers/lave.js";

const WIDTH = 360;
const HEIGHT = 80;
const RANGE = 25_600;
const HALF_WIDTH = WIDTH / 2;
const HALF_HEIGHT = HEIGHT / 2;
const COMPASS_RADIUS = 48;
const BLIP_RADIUS = 0.4 * COMPASS_RADIUS;

function scanner(relative: Vec3, radius = 0) {
  return projectToScanner(relative, identity(), WIDTH, HEIGHT, RANGE, radius);
}

describe("projectToScanner", () => {
  it("puts a dead-ahead contact at the top centre with no tail", () => {
    const blip = scanner(vec(0, 0, -RANGE));
    expect(blip.visible).toBe(true);
    expect(blip.x).toBeCloseTo(0, 12);
    expect(blip.yBase).toBeCloseTo(-HALF_HEIGHT, 12);
    expect(blip.yTail).toBeCloseTo(0, 12);
    expect(blip.distance).toBe(RANGE);
  });

  it("draws a contact above with an upward (negative) tail", () => {
    const blip = scanner(vec(0, 1_000, -10_000));
    expect(blip.visible).toBe(true);
    expect(blip.yTail).toBeLessThan(0);
    // -local.y * (1 - sqrt(h/w)) * (0.5 * width / range)
    expect(blip.yTail).toBeCloseTo(
      (-1_000 * (1 - Math.sqrt(HEIGHT / WIDTH)) * (0.5 * WIDTH)) / RANGE,
      12,
    );
  });

  it("draws a contact behind below the centre", () => {
    const blip = scanner(vec(0, 0, 10_000));
    expect(blip.visible).toBe(true);
    expect(blip.yBase).toBeGreaterThan(0);
    expect(blip.yBase).toBeCloseTo(
      (10_000 * (HEIGHT / WIDTH) * (0.5 * WIDTH)) / RANGE,
      12,
    );
  });

  it("puts a contact at the range on the rim", () => {
    const blip = scanner(vec(RANGE, 0, 0));
    expect(blip.visible).toBe(true);
    expect(blip.x).toBeCloseTo(HALF_WIDTH, 12);
  });

  it("pins a just-outside contact to the rim while its surface is in range", () => {
    const radius = 500;
    const blip = scanner(vec(0, 0, -(RANGE + radius)), radius);
    expect(blip.visible).toBe(true);
    // distance - radius === range, so the base is exactly the top edge.
    expect(blip.yBase).toBeCloseTo(-HALF_HEIGHT, 12);
    expect(blip.distance).toBe(RANGE + radius);
  });

  it("omits a contact beyond range + radius", () => {
    const radius = 500;
    expect(scanner(vec(0, 0, -(RANGE + radius)), radius).visible).toBe(true);
    expect(scanner(vec(0, 0, -(RANGE + radius + 0.001)), radius).visible).toBe(
      false,
    );
  });

  it("omits a non-finite contact instead of drawing off-canvas", () => {
    const blip = scanner(vec(Number.NaN, 0, -1_000));
    expect(blip.visible).toBe(false);
    expect(blip.distance).toBe(0);
  });
});

describe("projectToCompass", () => {
  it("places a target to starboard at 0.4x the radius and ahead", () => {
    const blip = projectToCompass(vec(1_000, 0, -1_000), identity(), 48);
    expect(blip.forward).toBe(true);
    expect(blip.x).toBeCloseTo(BLIP_RADIUS, 12);
    expect(blip.y).toBeCloseTo(0, 12);
  });

  it("places a target above upward and a target behind as amber", () => {
    const above = projectToCompass(vec(0, 1_000, -1_000), identity(), 48);
    expect(above.forward).toBe(true);
    expect(above.y).toBeCloseTo(-BLIP_RADIUS, 12);

    const behind = projectToCompass(vec(1_000, 0, 1_000), identity(), 48);
    expect(behind.forward).toBe(false);
    expect(behind.x).toBeCloseTo(BLIP_RADIUS, 12);
  });

  it("falls back to the centre when the horizontal magnitude is zero", () => {
    const blip = projectToCompass(vec(0, 0, -1_000), identity(), 48);
    expect(blip.forward).toBe(true);
    expect(blip.x).toBe(0);
    expect(blip.y).toBe(0);
  });
});

describe("aegis label", () => {
  it("maps only docking range to the indicator text", () => {
    expect(aegisLabel("dockingRange")).toBe("AEGIS");
    expect(aegisLabel("planet")).toBe("PLANET");
    expect(aegisLabel("none")).toBe("");
  });
});

describe("HUD contacts", () => {
  it("plots only the station, nav buoy and witchpoint — never planet or sun", () => {
    const fixture = laveFixture();
    const state = initFlightState(fixture.layout);
    const model = buildHudModel(state, fixture.layout, fixture.config, "", 70);

    expect(model.contacts.map((contact) => contact.id)).toEqual([
      "station",
      "navBuoy",
      "witchpoint",
    ]);
    expect(model.contacts.map((contact) => contact.id)).not.toContain("planet");
    expect(model.contacts.map((contact) => contact.id)).not.toContain("sun");

    const visible = model.contacts
      .filter((contact) => contact.visible)
      .map((contact) => contact.id);
    expect(visible).toEqual(["station", "navBuoy"]);
  });

  it("starts with the station compass target and the docking-range aegis", () => {
    const fixture = laveFixture();
    const state = initFlightState(fixture.layout);
    const model = buildHudModel(state, fixture.layout, fixture.config, "", 70);

    expect(model.compass.target).toBe("station");
    expect(model.aegis).toBe("dockingRange");
  });

  it("draws Oolite's scanner grid and lollipop contacts at their elevated heads", () => {
    const fixture = laveFixture();
    const state = initFlightState(fixture.layout);
    const baseModel = buildHudModel(
      state,
      fixture.layout,
      fixture.config,
      "",
      70,
    );
    const model = {
      ...baseModel,
      contacts: [
        {
          id: "station" as const,
          kind: "station" as const,
          x: -20,
          yBase: 8,
          yTail: -16,
          visible: true,
          distance: 1_500,
        },
        {
          id: "navBuoy" as const,
          kind: "buoy" as const,
          x: 15,
          yBase: -12,
          yTail: 18,
          visible: true,
          distance: 8_500,
        },
      ],
    };

    const fillRectCalls: Array<{
      x: number;
      y: number;
      w: number;
      h: number;
      fillStyle: string;
      alpha: number;
    }> = [];
    const strokeStyles: string[] = [];

    const fillTextLabels: string[] = [];

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
      stroke: vi.fn(function (this: { strokeStyle: string }) {
        strokeStyles.push(this.strokeStyle);
      }),
      fill: vi.fn(),
      strokeRect: vi.fn(),
      fillRect: vi.fn(function (
        this: { fillStyle: string; globalAlpha: number },
        x: number,
        y: number,
        w: number,
        h: number,
      ) {
        fillRectCalls.push({
          x,
          y,
          w,
          h,
          fillStyle: this.fillStyle,
          alpha: this.globalAlpha,
        });
      }),
      fillText: vi.fn((text: string) => {
        fillTextLabels.push(text);
      }),
      strokeStyle: "",
      fillStyle: "",
      lineWidth: 1,
      globalAlpha: 1,
      font: "",
      textAlign: "left",
    } as unknown as CanvasRenderingContext2D;

    drawHud(context, model);

    expect(strokeStyles).toContain(HUD_SCANNER_GRID_COLOR);
    expect(fillTextLabels).toEqual(
      expect.arrayContaining([
        "FWD",
        "AFT",
        "FUEL",
        "CT",
        "LT",
        "ALT",
        "MISS",
        "SPD",
        "ROLL",
        "PITCH",
        "E1",
        "E2",
        "E3",
        "E4",
      ]),
    );
    // Station lollipop: centre (960, 868), base (940, 876), head (940, 860)
    expect(fillRectCalls).toContainEqual({
      x: 940 - 5.25,
      y: 860 - 5.25,
      w: 8.75,
      h: 5.25,
      fillStyle: HUD_COLOR,
      alpha: 1,
    });
    // Nav buoy lollipop: centre (960, 868), base (975, 856), head (975, 874)
    expect(fillRectCalls).toContainEqual({
      x: 975 - 5.25,
      y: 874 - 5.25,
      w: 8.75,
      h: 5.25,
      fillStyle: HUD_SCANNER_NEUTRAL_COLOR,
      alpha: 1,
    });
  });

  it("aligns the dashboard instruments on the scanner's horizontal grid", () => {
    const scannerTop = HUD_LAYOUT.scanner.y;
    const scannerBottom = HUD_LAYOUT.scanner.y + HUD_LAYOUT.scanner.height;
    const scannerCenterY = scannerTop + HUD_LAYOUT.scanner.height / 2;

    // Speed, roll, and pitch stack top-to-bottom within the scanner's vertical band.
    expect(HUD_LAYOUT.speed.y).toBe(scannerTop);
    expect(HUD_LAYOUT.speed.y).toBeLessThan(HUD_LAYOUT.roll.y);
    expect(HUD_LAYOUT.roll.y).toBeLessThan(HUD_LAYOUT.pitch.y);
    expect(HUD_LAYOUT.pitch.y + HUD_LAYOUT.pitch.height).toBeLessThanOrEqual(
      scannerBottom,
    );

    // Fuel sits inside the scanner's vertical band, and aegis/compass share its centreline.
    expect(HUD_LAYOUT.fuel.y).toBeGreaterThanOrEqual(scannerTop);
    expect(HUD_LAYOUT.fuel.y + HUD_LAYOUT.fuel.height).toBeLessThanOrEqual(
      scannerBottom,
    );
    expect(HUD_LAYOUT.aegis.y + HUD_LAYOUT.aegis.height / 2).toBe(
      scannerCenterY,
    );
    expect(HUD_LAYOUT.compass.y + HUD_LAYOUT.compass.height / 2).toBe(
      scannerCenterY,
    );
  });
});
