// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The controller seam (FLGT-07, FLGT-08, T-3-08).
 *
 * The seam is behavioural, not nominal: a fake controller that emits the same
 * intents as `PlayerController` must produce the same trajectory and hash, and
 * `stepFlight` must contain no `isPlayer` branch and import no device/DOM
 * module. `ScriptedLaunchController` emits zeros.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  PlayerController,
  ScriptedLaunchController,
  ZERO_INTENT,
  flightView,
} from "../../src/sim/flight/controller.js";
import type {
  ControlIntent,
  ShipController,
} from "../../src/sim/flight/controller.js";
import { hashFlight, initFlightState } from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
import { stepFlight } from "../../src/sim/flight/step.js";
import type { InputFrame } from "../../src/sim/state.js";
import { DT } from "../../src/sim/time.js";
import { laveFixture } from "../helpers/lave.js";

const fixture = laveFixture();
const { layout, config } = fixture;
const player = new PlayerController();

function flyingState(): FlightState {
  const state = initFlightState(layout);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "skipLaunch" }], DT);
  return state;
}

/** Source text with comments removed, so a doc sentence cannot satisfy a scan. */
function executableSource(relativePath: string): string {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** A fake controller that replays a fixed intent log, ignoring devices. */
class ScriptedController implements ShipController {
  private index = 0;

  constructor(private readonly intents: readonly ControlIntent[]) {}

  update(): ControlIntent {
    const next = this.intents[this.index % this.intents.length];
    this.index += 1;
    if (next === undefined) {
      throw new Error("the scripted controller has no intents");
    }
    return next;
  }
}

const FRAMES: readonly InputFrame[] = [
  { pitch: 0.5, roll: 0, speed: 1, precision: false },
  { pitch: 0, roll: -1, speed: 1, precision: false },
  { pitch: -0.25, roll: 1, speed: -1, precision: true },
  { pitch: 0, roll: 0, speed: 0, precision: false },
];

function run(controller: ShipController): string {
  const state = flyingState();
  for (let index = 0; index < 600; index += 1) {
    const frame = FRAMES[index % FRAMES.length] as InputFrame;
    stepFlight(
      state,
      layout,
      config,
      controller.update(flightView(state), frame),
      [],
      DT,
    );
  }
  return hashFlight(state);
}

describe("PlayerController", () => {
  it("maps the frame axes and the precision modifier", () => {
    const view = flightView(flyingState());
    const intent = player.update(view, {
      pitch: 0.5,
      roll: -1,
      speed: 1,
      precision: true,
    });
    expect(intent).toEqual({
      pitch: 0.5,
      roll: -1,
      speed: 1,
      precision: true,
      torusToggle: false,
    });
  });

  it("clamps every axis to [-1, 1]", () => {
    const view = flightView(flyingState());
    const intent = player.update(view, {
      pitch: 5,
      roll: -9,
      speed: 3,
      precision: false,
    });
    expect(intent.pitch).toBe(1);
    expect(intent.roll).toBe(-1);
    expect(intent.speed).toBe(1);
  });

  it("emits zeros outside flight", () => {
    const docked = initFlightState(layout);
    expect(
      player.update(flightView(docked), {
        pitch: 1,
        roll: 1,
        speed: 1,
        precision: true,
      }),
    ).toEqual(ZERO_INTENT);
  });
});

describe("ScriptedLaunchController", () => {
  it("emits zeros", () => {
    const scripted = new ScriptedLaunchController();
    expect(scripted.update()).toEqual(ZERO_INTENT);
  });
});

describe("the seam is behavioural", () => {
  it("gives a fake controller and PlayerController the same hash", () => {
    const view = flightView(flyingState());
    const intents = FRAMES.map((frame) => player.update(view, frame));

    expect(run(player)).toBe(run(new ScriptedController(intents)));
  });

  it("has no isPlayer branch and no device/DOM import in stepFlight", () => {
    const source = executableSource("../../src/sim/flight/step.ts");
    expect(source.length).toBeGreaterThan(500);
    expect(source).toContain("export function stepFlight");
    expect(source).not.toMatch(/isPlayer/);
    expect(source).not.toMatch(/\b(window|document|navigator|localStorage)\b/);
    expect(source).not.toMatch(/from\s+"three/);
    expect(source).not.toMatch(/\.\.\/(input|render|ui|app)\//);
    expect(source).not.toMatch(/Math\.random|Date\.now|performance\.now/);
  });

  it("keeps the controller module device-free", () => {
    const source = executableSource("../../src/sim/flight/controller.ts");
    expect(source).not.toMatch(/\b(window|document|navigator)\b/);
    expect(source).not.toMatch(/from\s+"three/);
    expect(source).not.toMatch(/\.\.\/input\//);
  });
});
