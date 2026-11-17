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
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

import {
  IDLE_SETTLE_DRAWS,
  createRedrawGate,
} from "../../../src/app/redraw-gate.js";
import type { RedrawGate } from "../../../src/app/redraw-gate.js";
import { createLaunchSequence } from "../../../src/app/launch-sequence.js";
import { createNpcModelLoader } from "../../../src/app/npc-models.js";
import type { NpcModelLoader } from "../../../src/app/npc-models.js";
import { createSessionState } from "../../../src/app/session/context.js";
import type { SessionState } from "../../../src/app/session/context.js";
import { createRenderDriver } from "../../../src/app/session/render-driver.js";
import type { RenderDriver } from "../../../src/app/session/render-driver.js";
import type { WegoliteProbe } from "../../../src/app/probe.js";
import { createWorldLifecycle } from "../../../src/app/session/world-lifecycle.js";
import type { Hud } from "../../../src/render/hud/hud.js";
import { createMessageQueue } from "../../../src/render/hud/messages.js";
import type { SystemScene } from "../../../src/render/system-scene.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { marketSeedForSystem } from "../../../src/sim/economy/market.js";
import { identity, vec } from "../../../src/sim/math.js";
import { NO_ENTITY } from "../../../src/sim/world/ids.js";
import {
  debrisContacts,
  npcContacts,
} from "../../../src/sim/world/contacts.js";
import type {
  DebrisContact,
  NpcContact,
} from "../../../src/sim/world/contacts.js";
import { spawnEntity } from "../../../src/sim/world/world.js";
import type { TrafficContent } from "../../../src/app/session/traffic.js";
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

/** A loader no test opens or feeds: the rows that do not care about models. */
function idleLoader(): NpcModelLoader {
  return createNpcModelLoader(
    { loadNpcModel: () => new Promise<GLTF>(() => undefined) },
    () => undefined,
  );
}

interface HarnessOptions {
  readonly npcModels?: NpcModelLoader;
  /** Called from inside `renderer.render`, to order it against other calls. */
  readonly onRender?: () => void;
}

function harness(options: HarnessOptions = {}): Harness {
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
      render: () => {
        renders.push(1);
        options.onRender?.();
      },
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
    npcModels: options.npcModels ?? idleLoader(),
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

/** What the NPC layer double is handed each frame. */
type NpcUpdate = (
  contacts: readonly NpcContact[],
  cameraWorld: unknown,
  models: ReadonlyMap<string, GLTF>,
) => void;

/** What the explosion layer double is handed each frame. */
type ExplosionUpdate = (
  cameraWorld: unknown,
  cameraQuaternion: unknown,
  flightTime: number,
) => void;

/** What the debris layer double is handed each frame. */
type DebrisUpdate = (
  contacts: readonly DebrisContact[],
  cameraWorld: unknown,
  models: ReadonlyMap<string, GLTF>,
  info: unknown,
  flightTime: number,
) => void;

/** A scene double complete enough for a full `renderFrame` in flight. */
function flyableScene(
  nebula: { revision: number },
  npcUpdate: NpcUpdate = () => undefined,
  explosionUpdate: ExplosionUpdate = () => undefined,
  debrisUpdate: DebrisUpdate = () => undefined,
): SystemScene {
  return {
    npcs: { update: npcUpdate },
    debris: { update: debrisUpdate },
    shots: { update: () => undefined },
    explosions: { update: explosionUpdate },
    camera: { aspect: 1.5, fov: 57.2, ...fakeObject() },
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
  function flying(
    withWorld: boolean,
    harnessOptions: HarnessOptions = {},
    npcUpdate: NpcUpdate = () => undefined,
  ): {
    readonly h: Harness;
    readonly models: HudModel[];
  } {
    const h = harness(harnessOptions);
    const models: HudModel[] = [];
    h.ctx.core.layout = layout;
    h.ctx.core.config = config;
    h.ctx.core.scene = flyableScene(h.nebula, npcUpdate);
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

describe("renderFrame explosions (WORLD-17)", () => {
  it("updates the explosion layer with the camera, its orientation and the flight clock before the render", () => {
    const log: string[] = [];
    const calls: unknown[][] = [];
    const h = harness({ onRender: () => log.push("render") });
    h.ctx.core.layout = layout;
    h.ctx.core.config = config;
    const scene = flyableScene(h.nebula, undefined, (...args) => {
      log.push("explosions.update");
      calls.push(args);
    });
    h.ctx.core.scene = scene;
    h.ctx.runtime.hud = { draw: () => undefined } as unknown as Hud;
    h.ctx.core.state = {
      ...initFlightState(layout),
      mode: "inFlight",
      flightTime: 42.5,
    };
    h.driver.renderFrame(0);
    expect(calls).toHaveLength(1);
    const [cameraWorld, quaternion, flightTime] = calls[0] ?? [];
    expect(quaternion).toBe(scene.camera.quaternion);
    expect(flightTime).toBe(42.5);
    expect(cameraWorld).toMatchObject({
      x: expect.any(Number) as number,
      y: expect.any(Number) as number,
      z: expect.any(Number) as number,
    });
    expect(log).toEqual(["explosions.update", "render"]);
  });
});

describe("renderFrame debris (WORLD-17)", () => {
  const DEBRIS_MODELS = [
    { key: "barrel", glb: "models/barrel.glb", radius: 4 },
    { key: "wreck1", glb: "models/wreck1.glb", radius: 20 },
  ];

  /** A flying session whose world holds two pods and a wreck beside its ships. */
  function debrisWorld() {
    const log: string[] = [];
    const requested: string[] = [];
    const calls: unknown[][] = [];
    const real = createNpcModelLoader(
      {
        loadNpcModel: (glb) => {
          requested.push(glb);
          return new Promise<GLTF>(() => undefined);
        },
      },
      (key) => `models/${key}.glb`,
    );
    const loader: NpcModelLoader = {
      ...real,
      open: () => {
        log.push("open");
        real.open();
      },
    };
    const h = harness({
      npcModels: loader,
      onRender: () => log.push("render"),
    });
    h.ctx.core.layout = layout;
    h.ctx.core.config = config;
    h.ctx.core.scene = flyableScene(
      h.nebula,
      () => log.push("npcs.update"),
      undefined,
      (...args) => {
        log.push("debris.update");
        calls.push(args);
      },
    );
    h.ctx.runtime.hud = { draw: () => undefined } as unknown as Hud;
    h.ctx.core.npcTraffic = {
      debrisModels: DEBRIS_MODELS,
    } as unknown as TrafficContent;
    const lifecycle = createWorldLifecycle({
      traffic: true,
      populate: (world) => {
        populateInertWorld(world, layout, laveInertRecords());
        for (const [kind, specKey, x] of [
          ["cargo", "barrel", 100],
          ["wreckage", "wreck1", 200],
          ["cargo", "barrel", 300],
        ] as const) {
          const result = spawnEntity(
            world,
            {
              kind,
              specKey,
              scanClass: "CLASS_CARGO",
              position: { x, y: 0, z: 0 },
              orientation: identity(),
              radius: 4,
            },
            0,
          );
          if (!result.ok) throw new Error(result.reason);
        }
      },
    });
    lifecycle.begin(marketSeedForSystem(system.id));
    h.ctx.core.worldLifecycle = lifecycle;
    h.ctx.core.state = {
      ...initFlightState(layout),
      mode: "inFlight",
      flightTime: 7.25,
    };
    return { h, log, requested, calls, loader };
  }

  it("hands the debris layer the frame's debris contacts, the loader's models, the catalogue and the flight time", () => {
    const { h, log, calls, loader } = debrisWorld();
    h.driver.renderFrame(0);
    expect(calls).toHaveLength(1);
    const [contacts, cameraWorld, models, info, flightTime] = calls[0] ?? [];
    expect(contacts).toEqual(debrisContacts(h.ctx.core.worldLifecycle?.world));
    expect((contacts as DebrisContact[]).map((c) => c.specKey)).toEqual([
      "barrel",
      "wreck1",
      "barrel",
    ]);
    expect(models).toBe(loader.loaded());
    expect(info).toBe(h.ctx.core.npcTraffic?.debrisModels);
    expect(flightTime).toBe(7.25);
    expect(cameraWorld).toMatchObject({
      x: expect.any(Number) as number,
      y: expect.any(Number) as number,
      z: expect.any(Number) as number,
    });
    // After the NPC layer, before the render.
    expect(log.slice(0, 3)).toEqual(["npcs.update", "debris.update", "render"]);
  });

  it("requests the debris keys through the same loader only once its latch is open", () => {
    const { h, requested } = debrisWorld();
    h.driver.renderFrame(0);
    // The first in-flight frame opens the latch after its render: no fetch.
    expect(requested).toEqual([]);
    h.driver.renderFrame(0);
    expect(requested).toContain("models/barrel.glb");
    expect(requested).toContain("models/wreck1.glb");
    // One fetch per key, however many pieces share it.
    expect(requested.filter((glb) => glb === "models/barrel.glb")).toHaveLength(
      1,
    );
  });

  it("hands an empty catalogue with no traffic content and empty contacts with no world", () => {
    const { h, calls } = debrisWorld();
    h.ctx.core.npcTraffic = undefined;
    h.ctx.core.worldLifecycle?.end();
    h.driver.renderFrame(0);
    expect(calls[0]?.[0]).toEqual([]);
    expect(calls[0]?.[3]).toEqual([]);
  });
});

describe("renderFrame NPC models (WORLD-15, DATA-13)", () => {
  /** The calls the driver makes, in order, as the rows below read them. */
  function observed() {
    const log: string[] = [];
    const requested: string[] = [];
    const updates: {
      readonly contacts: readonly NpcContact[];
      readonly models: ReadonlyMap<string, GLTF>;
    }[] = [];
    const real = createNpcModelLoader(
      {
        loadNpcModel: (glb) => {
          log.push(`fetch ${glb}`);
          requested.push(glb);
          return new Promise<GLTF>(() => undefined);
        },
      },
      (key) => `models/${key}.glb`,
    );
    const loader: NpcModelLoader = {
      ...real,
      open: () => {
        log.push("open");
        real.open();
      },
    };
    const { h } = flyingWorld(loader, log, updates);
    return { h, log, requested, updates, loader };
  }

  function flyingWorld(
    loader: NpcModelLoader,
    log: string[],
    updates: {
      readonly contacts: readonly NpcContact[];
      readonly models: ReadonlyMap<string, GLTF>;
    }[],
  ) {
    const h = harness({
      npcModels: loader,
      onRender: () => log.push("render"),
    });
    h.ctx.core.layout = layout;
    h.ctx.core.config = config;
    h.ctx.core.scene = flyableScene(h.nebula, (contacts, _camera, models) => {
      log.push("npcs.update");
      updates.push({ contacts, models });
    });
    h.ctx.runtime.hud = { draw: () => undefined } as unknown as Hud;
    const lifecycle = createWorldLifecycle({
      traffic: true,
      populate: (world) => {
        populateInertWorld(world, layout, laveInertRecords());
      },
    });
    lifecycle.begin(marketSeedForSystem(system.id));
    h.ctx.core.worldLifecycle = lifecycle;
    return { h, lifecycle };
  }

  function setMode(h: Harness, mode: FlightState["mode"]): void {
    if (h.ctx.core.state === undefined) throw new Error("no state");
    h.ctx.core.state = { ...h.ctx.core.state, mode };
  }

  it("requests no model in a docked or launching frame, even though the world is populated", () => {
    const { h, requested, log } = observed();
    expect(npcContacts(h.ctx.core.worldLifecycle?.world)).toHaveLength(12);
    setMode(h, "docked");
    h.driver.renderFrame(0);
    h.driver.renderFrame(0);
    setMode(h, "launching");
    h.driver.renderFrame(0);
    h.driver.renderFrame(0);
    expect(requested).toEqual([]);
    expect(log).not.toContain("open");
  });

  it("renders, then opens, in the first in-flight frame, and fetches in the next one", () => {
    const { h, requested, log } = observed();
    setMode(h, "launching");
    h.driver.renderFrame(0);
    log.length = 0;

    setMode(h, "inFlight");
    h.driver.renderFrame(0);
    // The first in-flight frame draws, then opens, and starts no fetch.
    expect(log).toEqual(["npcs.update", "render", "open"]);
    expect(requested).toEqual([]);
    expect(h.probeUpdates).toHaveLength(2);

    h.driver.renderFrame(0);
    const keys = new Set(
      npcContacts(h.ctx.core.worldLifecycle?.world).map(
        (contact) => contact.specKey,
      ),
    );
    expect(keys.size).toBeGreaterThan(0);
    expect(new Set(requested)).toEqual(
      new Set([...keys].map((key) => `models/${key}.glb`)),
    );
    // One fetch per key, however many ships share it.
    expect(requested).toHaveLength(keys.size);
    // The fetches start before this frame's render, after the previous one.
    expect(log.indexOf("render", 3)).toBeGreaterThan(
      log.findIndex((entry) => entry.startsWith("fetch ")),
    );
  });

  it("never opens the loader from a frame the redraw gate skipped", () => {
    const { h, requested, log } = observed();
    setMode(h, "inFlight");
    h.driver.renderFrame(0, false);
    h.driver.renderFrame(0, false);
    expect(log).not.toContain("render");
    expect(log).not.toContain("open");
    expect(requested).toEqual([]);
    // The skipped frames still feed the layer, so it never lags the world.
    expect(log.filter((entry) => entry === "npcs.update")).toHaveLength(2);
  });

  it("feeds the layer the frame's contacts and the loader's models before every render", () => {
    const { h, log, updates, loader } = observed();
    setMode(h, "inFlight");
    h.driver.renderFrame(0);
    h.driver.renderFrame(0);
    expect(updates).toHaveLength(2);
    for (const update of updates) {
      expect(update.contacts).toHaveLength(12);
      expect(update.models).toBe(loader.loaded());
    }
    expect(log.slice(0, 2)).toEqual(["npcs.update", "render"]);
  });

  it("keeps the scanner showing a ship whose model never loaded", () => {
    const { h } = observed();
    const models: HudModel[] = [];
    h.ctx.runtime.hud = {
      draw: (model: HudModel) => models.push(model),
    } as unknown as Hud;
    const first = npcContacts(h.ctx.core.worldLifecycle?.world)[0];
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
    h.driver.renderFrame(0);
    h.driver.renderFrame(0);
    // Every fetch is still pending: no model is loaded, the ships are listed.
    expect(models.at(-1)?.contacts.filter((c) => c.id === "ship")).toHaveLength(
      12,
    );
  });
});

describe("renderFrame ident frame (INPUT-01, D-03)", () => {
  /**
   * A flying session whose camera sits `behind` metres behind the first ship
   * along +Z (the ship is dead ahead of the fore view), with that ship locked.
   */
  function locked(behind: number) {
    const models: HudModel[] = [];
    const h = harness();
    h.ctx.core.layout = layout;
    h.ctx.core.config = config;
    h.ctx.core.scene = flyableScene(h.nebula);
    h.ctx.runtime.hud = {
      draw: (model: HudModel) => models.push(model),
    } as unknown as Hud;
    const lifecycle = createWorldLifecycle({
      traffic: true,
      populate: (world) => {
        populateInertWorld(world, layout, laveInertRecords());
      },
    });
    lifecycle.begin(marketSeedForSystem(system.id));
    h.ctx.core.worldLifecycle = lifecycle;
    const ship = [...(lifecycle.world?.store.live ?? [])].find(
      (entity) => entity.kind === "ship",
    );
    if (ship === undefined) throw new Error("the world has no ship");
    const pose = {
      position: vec(ship.position.x, ship.position.y, ship.position.z + behind),
      orientation: identity(),
    };
    h.ctx.core.previousPose = pose;
    h.ctx.core.currentPose = pose;
    h.ctx.core.state = {
      ...initFlightState(layout),
      mode: "inFlight",
      position: pose.position,
    };
    const combat = createPlayerCombatState();
    combat.identTarget = ship.id;
    h.ctx.core.combat = combat;
    return { h, models, combat };
  }

  it("frames the locked ship dead ahead of the view, near the sights", () => {
    const { h, models } = locked(5_000);
    h.driver.renderFrame(0);
    const frame = models[0]?.identFrame;
    expect(frame).not.toBeNull();
    // The view sits 7.25 m above the ship's centre line, so the ship is a
    // hair below the sights; it is dead ahead horizontally.
    expect(frame?.x).toBeCloseTo(960, 3);
    expect(frame?.y).toBeGreaterThan(540);
    expect(frame?.y).toBeLessThan(560);
  });

  it("draws no frame with the locked ship behind the camera", () => {
    const { h, models } = locked(-5_000);
    h.driver.renderFrame(0);
    expect(models[0]?.identFrame).toBeNull();
  });

  it("draws no frame once the lock is dropped", () => {
    const { h, models, combat } = locked(5_000);
    h.driver.renderFrame(0);
    expect(models[0]?.identFrame).not.toBeNull();
    combat.identTarget = NO_ENTITY;
    h.driver.renderFrame(0);
    expect(models[1]?.identFrame).toBeNull();
  });

  it("looks the locked ship up through the view: an aft view sees it behind", () => {
    const { h, models, combat } = locked(-5_000);
    combat.view = "aft";
    h.driver.renderFrame(0);
    expect(models[0]?.identFrame).not.toBeNull();
    combat.view = "fore";
    h.driver.renderFrame(0);
    expect(models[1]?.identFrame).toBeNull();
  });

  it("draws no frame with no combat state or no world", () => {
    const { h, models } = locked(5_000);
    h.ctx.core.combat = undefined;
    h.driver.renderFrame(0);
    expect(models[0]?.identFrame).toBeNull();
    const second = locked(5_000);
    second.h.ctx.core.worldLifecycle?.end();
    second.h.driver.renderFrame(0);
    expect(second.models[0]?.identFrame).toBeNull();
  });
});
