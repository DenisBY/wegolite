// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The render driver's redraw decision against a fake session context (Phase 8,
 * D-12 step 3, G-8).
 *
 * Node only, no DOM, no WebGL: a real `SessionState`, the real redraw gate and
 * recording doubles for everything the driver draws with. The decision keys on
 * the identity of the live flight state, the live scene and the live nebula
 * revision, so each of them is replaced or advanced behind the driver's back and
 * the next frame must draw. A driver that had captured any of them at
 * construction would keep skipping.
 */

import type * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  IDLE_SETTLE_DRAWS,
  createRedrawGate,
} from "../../../src/app/redraw-gate.js";
import type { RedrawGate } from "../../../src/app/redraw-gate.js";
import { createLaunchSequence } from "../../../src/app/launch-sequence.js";
import { createSessionState } from "../../../src/app/session/context.js";
import type { SessionState } from "../../../src/app/session/context.js";
import { createRenderDriver } from "../../../src/app/session/render-driver.js";
import type { RenderDriver } from "../../../src/app/session/render-driver.js";
import type { WegoliteProbe } from "../../../src/app/probe.js";
import { createMessageQueue } from "../../../src/render/hud/messages.js";
import type { SystemScene } from "../../../src/render/system-scene.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { laveFixture } from "../../helpers/lave.js";

const { system, layout } = laveFixture();

interface Harness {
  readonly ctx: SessionState;
  readonly gate: RedrawGate;
  readonly driver: RenderDriver;
  readonly renders: number[];
  readonly probeUpdates: number[];
  readonly nebula: { revision: number };
}

/** A scene double: the driver's gate only reads the nebula revision. */
function fakeScene(nebula: { revision: number }): SystemScene {
  return {
    nebulae: { revision: () => nebula.revision },
  } as unknown as SystemScene;
}

function harness(): Harness {
  const ctx = createSessionState({
    system,
    saveStatus: "absent",
    saveSkipReason: "",
  });
  const gate = createRedrawGate();
  const renders: number[] = [];
  const probeUpdates: number[] = [];
  const nebula = { revision: 0 };
  ctx.core.state = initFlightState(layout);
  ctx.core.scene = fakeScene(nebula);
  const driver = createRenderDriver(ctx, {
    renderer: {
      render: () => renders.push(1),
    } as unknown as THREE.WebGLRenderer,
    hudCanvas: { hidden: false } as HTMLCanvasElement,
    probe: {} as WegoliteProbe,
    redrawGate: gate,
    messages: createMessageQueue(4),
    launchSequence: createLaunchSequence(),
    galaxyById: new Map(),
    updateProbe: () => probeUpdates.push(1),
    renderStation: () => undefined,
    targetSystem: () => undefined,
  });
  return { ctx, gate, driver, renders, probeUpdates, nebula };
}

/** Run `frames` loop frames as frame() does: decide, then record a drawn frame. */
function runFrames(h: Harness, frames: number): number {
  let drawn = 0;
  for (let index = 0; index < frames; index += 1) {
    if (h.driver.shouldDraw()) {
      drawn += 1;
      h.gate.drawn(h.driver.drawKeys());
    }
  }
  return drawn;
}

describe("shouldDraw", () => {
  it("draws the settle frames of a docked session and then stops", () => {
    const h = harness();
    expect(h.ctx.core.state?.mode).toBe("docked");
    for (let index = 0; index < IDLE_SETTLE_DRAWS; index += 1) {
      expect(h.driver.shouldDraw()).toBe(true);
      h.gate.drawn(h.driver.drawKeys());
    }
    expect(h.driver.shouldDraw()).toBe(false);
    expect(runFrames(h, 20)).toBe(0);
  });

  it("draws again when the live FlightState object is replaced (a Load)", () => {
    const h = harness();
    expect(runFrames(h, 10)).toBe(IDLE_SETTLE_DRAWS);
    const before = h.ctx.core.state;
    // Structurally equal, a different object: identity is the key (G-8).
    h.ctx.core.state = { ...(before as FlightState) };
    expect(runFrames(h, 10)).toBe(IDLE_SETTLE_DRAWS);
    expect(runFrames(h, 10)).toBe(0);
  });

  it("draws again when the live scene object is replaced (a jump or a quality change)", () => {
    const h = harness();
    expect(runFrames(h, 10)).toBe(IDLE_SETTLE_DRAWS);
    h.ctx.core.scene = fakeScene(h.nebula);
    expect(runFrames(h, 10)).toBe(IDLE_SETTLE_DRAWS);
    expect(runFrames(h, 10)).toBe(0);
  });

  it("draws again when the live scene's nebula revision advances", () => {
    const h = harness();
    expect(runFrames(h, 10)).toBe(IDLE_SETTLE_DRAWS);
    h.nebula.revision += 1;
    expect(runFrames(h, 10)).toBe(IDLE_SETTLE_DRAWS);
    expect(runFrames(h, 10)).toBe(0);
  });

  it("draws again after a redraw request", () => {
    const h = harness();
    expect(runFrames(h, 10)).toBe(IDLE_SETTLE_DRAWS);
    h.gate.request();
    expect(runFrames(h, 10)).toBe(IDLE_SETTLE_DRAWS);
  });

  it("goes quiet while paused in flight and wakes when resumed", () => {
    const h = harness();
    (h.ctx.core.state as FlightState).mode = "inFlight";
    expect(runFrames(h, 5)).toBe(5);
    h.ctx.runtime.paused = true;
    expect(runFrames(h, 10)).toBe(IDLE_SETTLE_DRAWS);
    expect(runFrames(h, 10)).toBe(0);
    h.ctx.runtime.paused = false;
    expect(runFrames(h, 5)).toBe(5);
  });

  it("always draws an inFlight session", () => {
    const h = harness();
    (h.ctx.core.state as FlightState).mode = "inFlight";
    expect(runFrames(h, 30)).toBe(30);
  });

  it("drawKeys returns the live state, scene and nebula revision", () => {
    const h = harness();
    const state = h.ctx.core.state;
    const scene = h.ctx.core.scene;
    h.nebula.revision = 4;
    expect(h.driver.drawKeys()).toEqual([state, scene, 4]);
    expect(h.driver.drawKeys()[0]).toBe(state);
    expect(h.driver.drawKeys()[1]).toBe(scene);
    h.ctx.core.scene = undefined;
    expect(h.driver.drawKeys()).toEqual([state, undefined, 0]);
  });
});

describe("renderFrame", () => {
  it("returns without drawing or publishing while the session is not loaded", () => {
    const h = harness();
    h.ctx.core.state = undefined;
    h.driver.renderFrame(0);
    expect(h.renders).toHaveLength(0);
    expect(h.probeUpdates).toHaveLength(0);
  });
});
