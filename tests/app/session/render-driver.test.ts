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
import { createWorldLifecycle } from "../../../src/app/session/world-lifecycle.js";
import type { Hud } from "../../../src/render/hud/hud.js";
import { createMessageQueue } from "../../../src/render/hud/messages.js";
import type { SystemScene } from "../../../src/render/system-scene.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { marketSeedForSystem } from "../../../src/sim/economy/market.js";
import { npcContacts } from "../../../src/sim/world/contacts.js";
import { populateInertWorld } from "../../../src/sim/world/populate.js";
import type { HudModel } from "../../../src/render/hud/draw.js";
import { laveInertRecords } from "../../helpers/inert-world.js";
import { laveFixture } from "../../helpers/lave.js";

const { system, layout, config } = laveFixture();

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

/** An Object3D double: the sync step only sets position and quaternion. */
function fakeObject() {
  return {
    visible: true,
    position: { set: () => undefined },
    quaternion: { set: () => undefined },
  };
}

/** A scene double complete enough for a full `renderFrame` in flight. */
function flyableScene(nebula: { revision: number }): SystemScene {
  return {
    camera: { aspect: 1.5, ...fakeObject() },
    planet: { mesh: fakeObject(), update: () => undefined },
    sun: { sun: fakeObject(), corona: fakeObject(), update: () => undefined },
    station: { root: fakeObject(), update: () => undefined },
    ship: fakeObject(),
    navBuoy: fakeObject(),
    witchpoint: fakeObject(),
    buoys: [],
    starfield: fakeObject(),
    dust: { update: () => undefined },
    scene: {},
    nebulae: { revision: () => nebula.revision },
  } as unknown as SystemScene;
}

describe("renderFrame NPC contacts (WORLD-15)", () => {
  /** An in-flight harness whose HUD double records the model it is handed. */
  function flying(withWorld: boolean): {
    readonly h: Harness;
    readonly models: HudModel[];
  } {
    const h = harness();
    const models: HudModel[] = [];
    h.ctx.core.layout = layout;
    h.ctx.core.config = config;
    h.ctx.core.scene = flyableScene(h.nebula);
    h.ctx.runtime.hud = {
      draw: (model: HudModel) => models.push(model),
    } as unknown as Hud;
    if (withWorld) {
      const lifecycle = createWorldLifecycle({
        traffic: true,
        populate: (world) => {
          populateInertWorld(world, layout, laveInertRecords());
        },
      });
      lifecycle.begin(marketSeedForSystem(system.id));
      h.ctx.core.worldLifecycle = lifecycle;
      // Fly 5 km from the first ship so at least one contact is in range.
      const first = npcContacts(lifecycle.world)[0];
      if (first === undefined) throw new Error("the world has no ship");
      h.ctx.core.state = {
        ...initFlightState(layout),
        mode: "inFlight",
        position: {
          x: first.position.x + 5_000,
          y: first.position.y,
          z: first.position.z,
        },
      };
    } else {
      h.ctx.core.state = { ...initFlightState(layout), mode: "inFlight" };
    }
    return { h, models };
  }

  it("hands buildHudModel the live world's contacts: the three static ones, then one per ship", () => {
    const { h, models } = flying(true);
    h.driver.renderFrame(0);

    expect(models).toHaveLength(1);
    const contacts = models[0]?.contacts ?? [];
    expect(contacts).toHaveLength(3 + 12);
    expect(contacts.slice(0, 3).map((contact) => contact.id)).toEqual([
      "station",
      "navBuoy",
      "witchpoint",
    ]);
    const ships = contacts.slice(3);
    expect(ships.every((contact) => contact.id === "ship")).toBe(true);
    expect(
      ships.every(
        (contact) => contact.kind === "ship" || contact.kind === "police",
      ),
    ).toBe(true);
    // The probe lists the ids of visible contacts from this model: the ship 5 km away is one.
    expect(ships.some((contact) => contact.visible)).toBe(true);
    expect(h.ctx.core.lastModel).toBe(models[0]);
  });

  it("shows exactly today's three contacts with no world (docked, traffic off)", () => {
    const { h, models } = flying(false);
    expect(h.ctx.core.worldLifecycle).toBeUndefined();
    h.driver.renderFrame(0);
    expect(models[0]?.contacts.map((contact) => contact.id)).toEqual([
      "station",
      "navBuoy",
      "witchpoint",
    ]);
  });

  it("shows exactly the three contacts for a lifecycle whose world has ended", () => {
    const { h, models } = flying(true);
    h.ctx.core.worldLifecycle?.end();
    h.driver.renderFrame(0);
    expect(models[0]?.contacts).toHaveLength(3);
  });
});
