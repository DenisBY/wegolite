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

import * as THREE from "three";
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
  projectIdentFrame,
  projectToCompass,
  projectToScanner,
} from "../../src/render/hud/projection.js";
import { applyViewport } from "../../src/render/viewport.js";
import { laveFixture } from "../helpers/lave.js";

const WIDTH = 360;
const HEIGHT = 80;
const RANGE = 25_600;
const HALF_WIDTH = WIDTH / 2;
const HALF_HEIGHT = HEIGHT / 2;
const SIZE = 63;
const BLIP_RADIUS = 0.4 * SIZE;

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

describe("projectToCompass (HeadUpDisplay.m drawCompass:, quick task 261118-cyn)", () => {
  // Oolite normalises the full 3D relative vector in the ship frame
  // (vector_normal_or_fallback to +Z) and takes x and y times 0.4 x size, so a
  // target dead ahead sits at the centre (D-06).
  it("puts a target dead ahead at the centre, in front", () => {
    const blip = projectToCompass(vec(0, 0, -1_000), identity(), SIZE);
    expect(blip.forward).toBe(true);
    expect(blip.x).toBeCloseTo(0, 12);
    expect(blip.y).toBeCloseTo(0, 12);
  });

  it("puts a target 90 degrees to starboard on the 0.4 x size circle", () => {
    const blip = projectToCompass(vec(1_000, 0, 0), identity(), SIZE);
    expect(blip.forward).toBe(true);
    expect(blip.x).toBeCloseTo(BLIP_RADIUS, 12);
    expect(blip.y).toBeCloseTo(0, 12);
  });

  it("puts a target 45 degrees to starboard at 0.4 x size x sin 45", () => {
    const blip = projectToCompass(vec(1_000, 0, -1_000), identity(), SIZE);
    expect(blip.forward).toBe(true);
    expect(blip.x).toBeCloseTo(BLIP_RADIUS * Math.SQRT1_2, 12);
    expect(blip.y).toBeCloseTo(0, 12);
  });

  it("draws a target above upward (canvas y negative) and a target behind as not forward", () => {
    const above = projectToCompass(vec(0, 1_000, -1_000), identity(), SIZE);
    expect(above.forward).toBe(true);
    expect(above.y).toBeCloseTo(-BLIP_RADIUS * Math.SQRT1_2, 12);

    const behind = projectToCompass(vec(1_000, 0, 1_000), identity(), SIZE);
    expect(behind.forward).toBe(false);
    expect(behind.x).toBeCloseTo(BLIP_RADIUS * Math.SQRT1_2, 12);
  });

  it("falls back to Oolite's +Z basis for a zero vector: the centre, in front", () => {
    const blip = projectToCompass(vec(0, 0, 0), identity(), SIZE);
    expect(blip).toEqual({ x: 0, y: 0, forward: true });
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
    // Oolite's lollipop head is 5x3 units, 3 units left of the stalk, and
    // the stalk 2 units wide (HeadUpDisplay.m:1334-1347), at 2.25 px per unit.
    // Station lollipop: centre (960, 927), base (940, 935), head (940, 919)
    expect(fillRectCalls).toContainEqual({
      x: 940 - 6.75,
      y: 919 - 6.75,
      w: 11.25,
      h: 6.75,
      fillStyle: HUD_COLOR,
      alpha: 1,
    });
    // Nav buoy lollipop: centre (960, 927), base (975, 915), head (975, 933);
    // flight time 0 is the unflashed (neutral) phase.
    expect(fillRectCalls).toContainEqual({
      x: 975 - 6.75,
      y: 933 - 6.75,
      w: 11.25,
      h: 6.75,
      fillStyle: HUD_SCANNER_NEUTRAL_COLOR,
      alpha: 1,
    });
  });

  it("puts the aegis, condition light and compass on hud.plist's y 32 row under the scanner", () => {
    const centreY = (rect: { y: number; height: number }) =>
      rect.y + rect.height / 2;
    const centreX = (rect: { x: number; width: number }) =>
      rect.x + rect.width / 2;
    // y_origin -1, y 32: 1080 - 2.25 x 32 = 1008.
    expect(centreY(HUD_LAYOUT.aegis)).toBe(1008);
    expect(centreY(HUD_LAYOUT.condition)).toBe(1008);
    expect(centreY(HUD_LAYOUT.compass)).toBe(1008);
    // x -132, -108 and 132: 960 + 2.25 x.
    expect(centreX(HUD_LAYOUT.aegis)).toBe(663);
    expect(centreX(HUD_LAYOUT.condition)).toBe(717);
    expect(centreX(HUD_LAYOUT.compass)).toBe(1257);
    // The scanner centre is y 68 from the bottom.
    expect(centreY(HUD_LAYOUT.scanner)).toBe(927);
    // The message area (x 128, y -60, centre-anchored) sits above the scanner.
    expect(centreX(HUD_LAYOUT.message)).toBe(1248);
    expect(centreY(HUD_LAYOUT.message)).toBe(675);
    expect(HUD_LAYOUT.message.y + HUD_LAYOUT.message.height).toBeLessThan(
      HUD_LAYOUT.scanner.y,
    );
  });
});

describe("scannerContactColor", () => {
  it("uses Oolite's colours: green station, neutral yellow for buoys, beacons and ships, police purple", () => {
    expect(scannerContactColor("station", false)).toBe(HUD_COLOR);
    expect(scannerContactColor("buoy", false)).toBe(HUD_SCANNER_NEUTRAL_COLOR);
    expect(scannerContactColor("beacon", false)).toBe(
      HUD_SCANNER_NEUTRAL_COLOR,
    );
    expect(scannerContactColor("ship", false)).toBe(HUD_SCANNER_NEUTRAL_COLOR);
    expect(scannerContactColor("police", false)).toBe(HUD_SCANNER_POLICE_COLOR);
    // ShipEntity.m:5585 police_color1 = {0.5, 0.0, 1.0}
    expect(HUD_SCANNER_POLICE_COLOR).toBe("#8000ff");
  });

  it("flashes buoys friendly green on the flash phase, as CLASS_BUOY (ShipEntity.m:5667-5671)", () => {
    expect(scannerContactColor("buoy", true)).toBe(HUD_COLOR);
    expect(scannerContactColor("beacon", true)).toBe(HUD_COLOR);
    // Other kinds ignore the flag.
    expect(scannerContactColor("station", true)).toBe(HUD_COLOR);
    expect(scannerContactColor("ship", true)).toBe(HUD_SCANNER_NEUTRAL_COLOR);
    expect(scannerContactColor("police", true)).toBe(HUD_SCANNER_POLICE_COLOR);
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

describe("the ident frame follows the live camera (261117-o8q)", () => {
  const DESIGN_WIDTH = 1920;
  const DESIGN_HEIGHT = 1080;
  const pose = { position: vec(0, 0, 0), quaternion: identity() };

  it.each([
    [1280, 720],
    [1000, 1000],
    [2222, 1000],
  ])("matches Three's projection at %ix%i", (width, height) => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 2_500_000);
    expect(applyViewport(camera, { width, height })).toBe(true);
    camera.updateMatrixWorld(true);
    const aspect = width / height;
    const halfHeight = Math.max(DESIGN_WIDTH / aspect, DESIGN_HEIGHT) / 2;

    const target = new THREE.Vector3(120, -45, -1500);
    const ndc = target.clone().project(camera);
    const radius = 100;
    const frame = projectIdentFrame(
      pose,
      camera.fov,
      camera.aspect,
      { position: vec(target.x, target.y, target.z), radius },
      DESIGN_WIDTH,
      DESIGN_HEIGHT,
    );
    expect(frame).not.toBeNull();
    if (frame === null) return;
    expect(
      Math.abs(frame.x - (DESIGN_WIDTH / 2 + ndc.x * halfHeight * aspect)),
    ).toBeLessThan(1e-6);
    expect(
      Math.abs(frame.y - (DESIGN_HEIGHT / 2 - ndc.y * halfHeight)),
    ).toBeLessThan(1e-6);

    // The frame half is the projected collision radius at the target's depth.
    const rim = new THREE.Vector3(0, radius, -1500).project(camera);
    expect(frame.half).toBeGreaterThan(IDENT_FRAME_MIN_HALF);
    expect(frame.half).toBeLessThan(IDENT_FRAME_MAX_HALF);
    expect(Math.abs(frame.half - rim.y * halfHeight)).toBeLessThan(1e-6);
  });
});

describe("the scanner's forward-view lines (HeadUpDisplay.m:4002-4008)", () => {
  function recordedPoints(
    viewAspect: number,
  ): Array<readonly [number, number]> {
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
    const fixture = laveFixture();
    drawHud(
      context,
      buildHudModel(
        initFlightState(fixture.layout),
        fixture.layout,
        fixture.config,
        "",
        70,
        0,
        "",
        [],
        { viewAspect },
      ),
    );
    return points;
  }

  /** The cone's outer points, found as the move, centre, line sequence. */
  function coneHalfWidth(viewAspect: number): number {
    const rect = HUD_LAYOUT.scanner;
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const ww = rect.width / 2;
    const hh = rect.height / 2;
    const fov = Math.tan((28.6 * Math.PI) / 180);
    const tan = viewAspect < 4 / 3 ? fov * 0.75 * viewAspect : fov;
    const cos = 1 / Math.sqrt(1 + tan * tan);
    const sin = tan * cos;
    const points = recordedPoints(viewAspect);
    const close = (
      point: readonly [number, number] | undefined,
      x: number,
      y: number,
    ): boolean =>
      point !== undefined &&
      Math.abs(point[0] - x) < 1e-9 &&
      Math.abs(point[1] - y) < 1e-9;
    const found = points.some(
      (point, i) =>
        close(point, cx - ww * sin, cy - hh * cos) &&
        close(points[i + 1], cx, cy) &&
        close(points[i + 2], cx + ww * sin, cy - hh * cos),
    );
    expect(found).toBe(true);
    return ww * sin;
  }

  it("uses the flight view's horizontal tangent and narrows below 4:3", () => {
    const wide = coneHalfWidth(16 / 9);
    const square = coneHalfWidth(1);
    expect(square).toBeLessThan(wide);
  });
});
