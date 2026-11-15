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
import { axisAngle, identity, vec } from "../../src/sim/math.js";
import type { Vec3 } from "../../src/sim/math.js";
import { initFlightState } from "../../src/sim/flight/state.js";
import {
  HUD_COLOR,
  HUD_LAYOUT,
  HUD_SCANNER_GRID_COLOR,
  HUD_SCANNER_NEUTRAL_COLOR,
  HUD_SCANNER_POLICE_COLOR,
  drawHud,
  scannerContactColor,
} from "../../src/render/hud/draw.js";
import {
  IDENT_FRAME_MAX_HALF,
  IDENT_FRAME_MIN_HALF,
  aegisLabel,
  projectIdentFrame,
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

describe("scannerContactColor", () => {
  it("uses Oolite's colours: green station, neutral yellow for buoys, beacons and ships, police purple", () => {
    expect(scannerContactColor("station")).toBe(HUD_COLOR);
    expect(scannerContactColor("buoy")).toBe(HUD_SCANNER_NEUTRAL_COLOR);
    expect(scannerContactColor("beacon")).toBe(HUD_SCANNER_NEUTRAL_COLOR);
    expect(scannerContactColor("ship")).toBe(HUD_SCANNER_NEUTRAL_COLOR);
    expect(scannerContactColor("police")).toBe(HUD_SCANNER_POLICE_COLOR);
    // ShipEntity.m:5585 police_color1 = {0.5, 0.0, 1.0}
    expect(HUD_SCANNER_POLICE_COLOR).toBe("#8000ff");
  });
});

describe("projectIdentFrame (INPUT-01, D-03)", () => {
  const FOV = 57.2;
  const ASPECT = 16 / 9;
  const DESIGN_WIDTH = 1920;
  const DESIGN_HEIGHT = 1080;
  /** The cotangent of half the vertical field of view. */
  const COT = 1 / Math.tan((FOV * Math.PI) / 360);
  const camera = { position: vec(0, 0, 0), quaternion: identity() };

  function project(
    target: { position: Vec3; radius: number },
    pose = camera,
    aspect = ASPECT,
  ) {
    return projectIdentFrame(
      pose,
      FOV,
      aspect,
      target,
      DESIGN_WIDTH,
      DESIGN_HEIGHT,
    );
  }

  it("puts a target straight ahead at the design-space centre", () => {
    const frame = project({ position: vec(0, 0, -1_000), radius: 50 });
    expect(frame).not.toBeNull();
    expect(frame?.x).toBeCloseTo(960, 9);
    expect(frame?.y).toBeCloseTo(540, 9);
    // 50 m at 1000 m: 0.05 * cot(fov/2) * half the design height (540).
    expect(frame?.half).toBeCloseTo(0.05 * COT * 540, 9);
  });

  it("puts a target to the right of the sights right of centre and one above them above", () => {
    const depth = 1_000;
    const halfWidthAtDepth = depth * Math.tan((FOV * Math.PI) / 360) * ASPECT;
    const right = project({
      position: vec(halfWidthAtDepth * 0.5, 0, -depth),
      radius: 50,
    });
    expect(right?.x).toBeCloseTo(960 + 0.5 * 960, 9);
    expect(right?.y).toBeCloseTo(540, 9);
    const above = project({
      position: vec(0, depth * Math.tan((FOV * Math.PI) / 360) * 0.5, -depth),
      radius: 50,
    });
    expect(above?.x).toBeCloseTo(960, 9);
    expect(above?.y).toBeCloseTo(540 - 0.5 * 540, 9);
  });

  it("returns null for a target behind the camera or on its plane", () => {
    expect(project({ position: vec(0, 0, 1_000), radius: 50 })).toBeNull();
    expect(project({ position: vec(0, 0, 0), radius: 50 })).toBeNull();
    expect(project({ position: vec(500, 0, 0), radius: 50 })).toBeNull();
  });

  it("returns null once the centre projects outside the window", () => {
    const depth = 1_000;
    const edge = depth * Math.tan((FOV * Math.PI) / 360) * ASPECT;
    expect(
      project({ position: vec(edge * 0.99, 0, -depth), radius: 50 }),
    ).not.toBeNull();
    expect(
      project({ position: vec(edge * 1.01, 0, -depth), radius: 50 }),
    ).toBeNull();
    expect(
      project({ position: vec(0, -depth * 0.6, -depth), radius: 50 }),
    ).toBeNull();
  });

  it("grows as the target gets closer", () => {
    const far = project({ position: vec(0, 0, -2_000), radius: 50 });
    const near = project({ position: vec(0, 0, -1_000), radius: 50 });
    expect(near?.half).toBeGreaterThan(far?.half ?? Number.POSITIVE_INFINITY);
  });

  it("clamps the half-size to the minimum and the maximum in design pixels", () => {
    expect(IDENT_FRAME_MIN_HALF).toBeLessThan(IDENT_FRAME_MAX_HALF);
    const tiny = project({ position: vec(0, 0, -20_000), radius: 10 });
    expect(tiny?.half).toBe(IDENT_FRAME_MIN_HALF);
    const huge = project({ position: vec(0, 0, -60), radius: 100 });
    expect(huge?.half).toBe(IDENT_FRAME_MAX_HALF);
    const negative = project({ position: vec(0, 0, -1_000), radius: -5 });
    expect(negative?.half).toBe(IDENT_FRAME_MIN_HALF);
  });

  it("follows the camera orientation: a yawed camera sees what lies along its forward", () => {
    // +90 degrees about up turns local -Z toward world -X (A1, the port view).
    const port = {
      position: vec(0, 0, 0),
      quaternion: axisAngle(0, 1, 0, Math.PI / 2),
    };
    const ahead = project({ position: vec(-1_000, 0, 0), radius: 50 }, port);
    expect(ahead?.x).toBeCloseTo(960, 9);
    expect(ahead?.y).toBeCloseTo(540, 9);
    expect(
      project({ position: vec(0, 0, -1_000), radius: 50 }, port),
    ).toBeNull();
  });

  it("is translation invariant: only the offset from the camera matters", () => {
    const shifted = {
      position: vec(1e6, -2e6, 3e6),
      quaternion: identity(),
    };
    const frame = project(
      { position: vec(1e6, -2e6, 3e6 - 1_000), radius: 50 },
      shifted,
    );
    expect(frame?.x).toBeCloseTo(960, 6);
    expect(frame?.half).toBeCloseTo(0.05 * COT * 540, 6);
  });

  it("maps NDC onto the letterboxed design space for a window of any shape", () => {
    const depth = 1_000;
    const tanHalf = Math.tan((FOV * Math.PI) / 360);
    // Wider than 16:9: the design height spans the window height, so the design
    // width spans less than the window width.
    const wide = 2.5;
    const wideFrame = project(
      { position: vec(depth * tanHalf * wide * 0.5, 0, -depth), radius: 50 },
      camera,
      wide,
    );
    expect(wideFrame?.x).toBeCloseTo(960 + 0.5 * 540 * wide, 9);
    // Narrower than 16:9: the design width spans the window width.
    const square = 1;
    const squareFrame = project(
      { position: vec(0, depth * tanHalf * 0.5, -depth), radius: 50 },
      camera,
      square,
    );
    expect(squareFrame?.x).toBeCloseTo(960, 9);
    expect(squareFrame?.y).toBeCloseTo(540 - 0.5 * 960, 9);
  });

  it("returns null for any non-finite or unusable input (T-13-26)", () => {
    const good = { position: vec(0, 0, -1_000), radius: 50 };
    const nan = Number.NaN;
    expect(project({ ...good, position: vec(nan, 0, -1_000) })).toBeNull();
    expect(project({ ...good, radius: nan })).toBeNull();
    expect(
      project(good, { position: vec(0, nan, 0), quaternion: identity() }),
    ).toBeNull();
    expect(
      project(good, {
        position: vec(0, 0, 0),
        quaternion: { w: nan, x: 0, y: 0, z: 0 },
      }),
    ).toBeNull();
    expect(project(good, camera, nan)).toBeNull();
    expect(project(good, camera, 0)).toBeNull();
    expect(projectIdentFrame(camera, nan, ASPECT, good, 1920, 1080)).toBeNull();
    expect(projectIdentFrame(camera, 0, ASPECT, good, 1920, 1080)).toBeNull();
    expect(projectIdentFrame(camera, 180, ASPECT, good, 1920, 1080)).toBeNull();
    expect(projectIdentFrame(camera, FOV, ASPECT, good, 0, 1080)).toBeNull();
    expect(projectIdentFrame(camera, FOV, ASPECT, good, 1920, nan)).toBeNull();
    expect(
      project({ position: vec(Number.POSITIVE_INFINITY, 0, -1), radius: 1 }),
    ).toBeNull();
  });
});

describe("the ident frame drawing (D-03, a non-element drawing)", () => {
  function recordingContext(): {
    readonly context: CanvasRenderingContext2D;
    readonly points: Array<readonly [number, number]>;
  } {
    const points: Array<readonly [number, number]> = [];
    const record = (x: number, y: number): void => {
      points.push([x, y]);
    };
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(record),
      lineTo: vi.fn(record),
      ellipse: vi.fn(),
      arc: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      strokeRect: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      strokeStyle: "",
      fillStyle: "",
      lineWidth: 1,
      globalAlpha: 1,
      font: "",
      textAlign: "left",
    } as unknown as CanvasRenderingContext2D;
    return { context, points };
  }

  function modelWith(
    identFrame: { x: number; y: number; half: number } | null,
  ) {
    const fixture = laveFixture();
    return buildHudModel(
      initFlightState(fixture.layout),
      fixture.layout,
      fixture.config,
      "",
      70,
      0,
      "",
      [],
      { identFrame },
    );
  }

  it("draws a corner bracket on each of the four corners of the frame", () => {
    const frame = { x: 700, y: 300, half: 60 };
    const withFrame = recordingContext();
    drawHud(withFrame.context, modelWith(frame));
    const without = recordingContext();
    drawHud(without.context, modelWith(null));
    const has = (
      list: Array<readonly [number, number]>,
      x: number,
      y: number,
    ): boolean => list.some(([px, py]) => px === x && py === y);
    for (const [cx, cy] of [
      [640, 240],
      [760, 240],
      [640, 360],
      [760, 360],
    ] as const) {
      expect(has(withFrame.points, cx, cy)).toBe(true);
      expect(has(without.points, cx, cy)).toBe(false);
    }
    // Twelve extra path points: four corners of one move and two line segments.
    expect(withFrame.points.length - without.points.length).toBe(12);
  });

  it("draws nothing for a null or non-finite frame", () => {
    const base = recordingContext();
    drawHud(base.context, modelWith(null));
    const bad = recordingContext();
    drawHud(bad.context, modelWith({ x: Number.NaN, y: 100, half: 40 }));
    expect(bad.points).toEqual(base.points);
  });
});
