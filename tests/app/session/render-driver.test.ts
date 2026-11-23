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

import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

import {
  IDLE_SETTLE_DRAWS,
  createRedrawGate,
} from "../../../src/app/redraw-gate.js";
import type { RedrawGate } from "../../../src/app/redraw-gate.js";
import { createNpcModelLoader } from "../../../src/app/npc-models.js";
import type { NpcModelLoader } from "../../../src/app/npc-models.js";
import { createSessionState } from "../../../src/app/session/context.js";
import type { SessionState } from "../../../src/app/session/context.js";
import {
  DEAD_CAMERA_SETBACK_M,
  GAME_OVER_FADE_SECONDS,
  createRenderDriver,
} from "../../../src/app/session/render-driver.js";
import type { RenderDriver } from "../../../src/app/session/render-driver.js";
import type { WegoliteProbe } from "../../../src/app/probe.js";
import { createWorldLifecycle } from "../../../src/app/session/world-lifecycle.js";
import type { Hud } from "../../../src/render/hud/hud.js";
import type { GameOverOverlay } from "../../../src/ui/game-over.js";
import { createMessageQueue } from "../../../src/render/hud/messages.js";
import type { MessageQueue } from "../../../src/render/hud/messages.js";
import type { SystemScene } from "../../../src/render/system-scene.js";
import {
  computeCockpitCamera,
  computeSlotLaunchCamera,
  computeViewCamera,
  LAUNCH_PRE_ROLL_DURATION,
  launchViewElapsed,
  launchViewStationAngle,
  preRollPose,
  preRollViewTime,
} from "../../../src/render/launch-camera.js";
import { createStationFlow } from "../../../src/app/session/event-router.js";
import { launchOrientation } from "../../../src/sim/flight/launch.js";
import { interpolatePose } from "../../../src/render/sync.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import { stepFlight } from "../../../src/sim/flight/step.js";
import { DT } from "../../../src/sim/time.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import {
  hashFlight,
  initFlightState,
  poseOf,
} from "../../../src/sim/flight/state.js";
import { createHintController } from "../../../src/app/hints.js";
import { createBindingMap } from "../../../src/input/bindings.js";
import { formatClock } from "../../../src/render/hud/format.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { marketSeedForSystem } from "../../../src/sim/economy/market.js";
import {
  HYPERSPACE_COUNTDOWN_STEPS,
  countdownSecondsRemaining,
} from "../../../src/sim/hyperspace/countdown.js";
import {
  add,
  axisAngle,
  identity,
  rotate,
  scale,
  vec,
} from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";
import { NO_ENTITY, STATION_NAV_BUOY_ID } from "../../../src/sim/world/ids.js";
import { buoyPosition } from "../../../src/sim/world/statics.js";
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
import { laveDockGeometry } from "../../helpers/dock-pose.js";
import { laveFixture } from "../../helpers/lave.js";

const { system, layout, config } = laveFixture();

interface Harness {
  readonly ctx: SessionState;
  readonly gate: RedrawGate;
  readonly driver: RenderDriver;
  readonly renders: number[];
  readonly probeUpdates: number[];
  readonly nebula: { revision: number };
  /** The driver's real message queue, so a row's countdown can be read. */
  readonly messages: MessageQueue;
  /** The HUD canvas double, so its `hidden` flag and marks can be read. */
  readonly hudCanvas: HudCanvasDouble;
  /**
   * The renderer's canvas style double: `filter` is the live value, `writes`
   * every assignment in order (the dead view's fade, D-01).
   */
  readonly canvasStyle: CanvasStyleDouble;
  /** The launch pre-roll the driver reads (quick 261118-os8); idle by default. */
  readonly preRoll: { preRolling: boolean; preRollElapsed: number };
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

/** The HUD canvas members the driver writes. */
interface HudCanvasDouble {
  hidden: boolean;
  readonly attributes: Set<string>;
  toggleAttribute(name: string, force: boolean): boolean;
}

/** The `#view` canvas style the driver writes its fade filter to. */
interface CanvasStyleDouble {
  filter: string;
  readonly writes: string[];
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
  const messages = createMessageQueue();
  const preRoll = { preRolling: false, preRollElapsed: 0 };
  const hudCanvas: HudCanvasDouble = {
    hidden: false,
    attributes: new Set<string>(),
    toggleAttribute(name: string, force: boolean) {
      if (force) this.attributes.add(name);
      else this.attributes.delete(name);
      return force;
    },
  };
  let filter = "";
  const canvasStyle: CanvasStyleDouble = {
    get filter() {
      return filter;
    },
    set filter(value: string) {
      filter = value;
      this.writes.push(value);
    },
    writes: [],
  };
  ctx.core.state = initFlightState(layout);
  ctx.core.scene = fakeScene(nebula);
  const driver = createRenderDriver(ctx, {
    renderer: {
      domElement: { style: canvasStyle },
      render: () => {
        renders.push(1);
        options.onRender?.();
      },
    } as unknown as THREE.WebGLRenderer,
    hudCanvas: hudCanvas as unknown as HTMLCanvasElement,
    probe: {} as WegoliteProbe,
    redrawGate: gate,
    messages,
    galaxyById: new Map([[system.id, system]]),
    updateProbe: () => probeUpdates.push(1),
    renderStation: () => undefined,
    targetSystem: () => undefined,
    npcModels: options.npcModels ?? idleLoader(),
    launchSequence: preRoll,
  });
  return {
    ctx,
    gate,
    driver,
    renders,
    probeUpdates,
    nebula,
    messages,
    hudCanvas,
    canvasStyle,
    preRoll,
  };
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

  it("frames a locked nav buoy at its live position (plan 18-06, PD-02)", () => {
    const { h, models, combat } = locked(5_000);
    const world = h.ctx.core.worldLifecycle?.world;
    if (world === undefined) throw new Error("no world");
    world.buoys.navBuoy.offset = vec(200, 0, 0);
    const moved = buoyPosition(world, layout, "navBuoy");
    const pose = {
      position: vec(moved.x, moved.y, moved.z + 5_000),
      orientation: identity(),
    };
    h.ctx.core.previousPose = pose;
    h.ctx.core.currentPose = pose;
    if (h.ctx.core.state !== undefined)
      h.ctx.core.state.position = pose.position;
    combat.identTarget = STATION_NAV_BUOY_ID;

    h.driver.renderFrame(0);
    const frame = models[0]?.identFrame;
    expect(frame).not.toBeNull();
    // Dead ahead of the view horizontally: framed where the buoy now is, not
    // 200 m aside at its layout position.
    expect(frame?.x).toBeCloseTo(960, 3);

    // Back at its layout position the buoy is 200 m to the left of the view
    // axis: the frame follows it off centre.
    world.buoys.navBuoy.offset = vec(0, 0, 0);
    h.driver.renderFrame(0);
    const stale = models[1]?.identFrame;
    expect(stale).not.toBeNull();
    expect(stale?.x).toBeLessThan(950);
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

describe("renderFrame hyperspace countdown row (quick task 261118-cyn)", () => {
  // Oolite writes the countdown into the message queue from the update, once
  // per changed count, with a 1 s row time (`PlayerEntity.m:3443-3450`,
  // `Universe.m:6258-6267`, descriptions.plist `witch-to-x-in-y-seconds`).
  /** An in-flight session whose HUD double records every model it is handed. */
  function counting() {
    const models: HudModel[] = [];
    const h = harness();
    h.ctx.core.layout = layout;
    h.ctx.core.config = config;
    h.ctx.core.scene = flyableScene(h.nebula);
    h.ctx.runtime.hud = {
      draw: (model: HudModel) => models.push(model),
    } as unknown as Hud;
    h.ctx.core.state = {
      ...initFlightState(layout),
      mode: "inFlight",
      flightTime: 10,
    };
    return { h, models, state: h.ctx.core.state };
  }

  const countdownText = (steps: number) =>
    `Witchspace to ${system.name} in ${String(countdownSecondsRemaining(steps))} s.`;

  it("writes Oolite's countdown text into the bottom row of the queue at full alpha", () => {
    const { h, models, state } = counting();
    h.messages.enqueue("Torus disengaged", 4);
    state.hyperspaceTarget = { id: system.id, dist: 0, fuelCost: 1 };
    state.hyperspaceCountdown = HYPERSPACE_COUNTDOWN_STEPS;
    h.driver.renderFrame(0);
    const text = countdownText(HYPERSPACE_COUNTDOWN_STEPS);
    expect(text).toBe(`Witchspace to ${system.name} in 15 s.`);
    const model = models.at(-1);
    expect(model?.messageRows.at(-1)).toEqual({ text, alpha: 1 });
    expect(model?.message).toBe(text);
    // The queue holds the row: it replaced "Torus disengaged" without scrolling.
    expect(h.messages.size).toBe(1);
    expect(h.messages.current(10)).toBe(text);
  });

  it("fades the written row over its 1 s row time (the pulse)", () => {
    const { h, models, state } = counting();
    state.hyperspaceTarget = { id: system.id, dist: 0, fuelCost: 1 };
    state.hyperspaceCountdown = HYPERSPACE_COUNTDOWN_STEPS;
    h.driver.renderFrame(0);
    // Half a second later on the message clock, the count is unchanged.
    state.flightTime = 10.5;
    state.hyperspaceCountdown = HYPERSPACE_COUNTDOWN_STEPS - 50;
    h.driver.renderFrame(0);
    const row = models.at(-1)?.messageRows.at(-1);
    expect(row?.text).toBe(countdownText(HYPERSPACE_COUNTDOWN_STEPS));
    expect(row?.alpha).toBeCloseTo(0.5, 9);
  });

  it("writes nothing once the countdown is back at 0, and the last count is gone after 1 s", () => {
    const { h, models, state } = counting();
    state.hyperspaceTarget = { id: system.id, dist: 0, fuelCost: 1 };
    state.hyperspaceCountdown = HYPERSPACE_COUNTDOWN_STEPS;
    h.driver.renderFrame(0);
    state.hyperspaceCountdown = 0;
    state.hyperspaceTarget = null;
    state.flightTime = 11.01;
    h.driver.renderFrame(0);
    expect(
      models
        .at(-1)
        ?.messageRows.some((row) => row.text.startsWith("Witchspace to")),
    ).toBe(false);
    expect(h.messages.size).toBe(0);
  });
});

describe("renderFrame message clock (quick task 261117-u3m)", () => {
  // Oolite draws the message area on every screen, docked ones included, and
  // counts each row down with the frame delta (Universe.m:4735-4736,
  // 4810-4827; GuiDisplayGen.m:1308-1312, 1327-1336). The rows run on the
  // flight time plus the docked wall time the frame loop accumulates.
  function session(mode: FlightState["mode"], flightTime: number) {
    const models: HudModel[] = [];
    const h = harness();
    h.ctx.core.layout = layout;
    h.ctx.core.config = config;
    h.ctx.core.scene = flyableScene(h.nebula);
    h.ctx.runtime.hud = {
      draw: (model: HudModel) => models.push(model),
    } as unknown as Hud;
    h.ctx.core.state = { ...initFlightState(layout), mode, flightTime };
    return { h, models };
  }

  it("counts a row down on docked frames that draw nothing", () => {
    const { h, models } = session("docked", 10);
    h.messages.enqueue("Docking computers engaged", 4.5);
    h.driver.renderFrame(0, false);
    h.ctx.runtime.dockedMessageSeconds += 4.4;
    h.driver.renderFrame(0, false);
    expect(h.messages.size).toBe(1);
    h.ctx.runtime.dockedMessageSeconds += 0.2;
    h.driver.renderFrame(0, false);
    expect(h.messages.size).toBe(0);
    // No HUD is drawn while docked.
    expect(models).toHaveLength(0);
  });

  it("draws the same rows and alpha in flight whatever the constant docked offset", () => {
    const rowsAt = (offset: number) => {
      const { h, models } = session("inFlight", 10);
      h.ctx.runtime.dockedMessageSeconds = offset;
      h.messages.enqueue("Torus disengaged", 4);
      h.driver.renderFrame(0);
      (h.ctx.core.state as FlightState).flightTime = 13.5;
      h.driver.renderFrame(0);
      return models.map((model) => model.messageRows);
    };
    const plain = rowsAt(0);
    expect(rowsAt(250.75)).toEqual(plain);
    expect(plain[1]?.at(-1)).toEqual({ text: "Torus disengaged", alpha: 0.5 });
  });

  it("does not draw a message posted at docking that expired while docked on the first in-flight frame", () => {
    const { h, models } = session("docked", 10);
    h.messages.enqueue("Docking computers engaged", 4.5);
    h.driver.renderFrame(0, false);
    h.ctx.runtime.dockedMessageSeconds += 5;
    h.driver.renderFrame(0, false);
    h.ctx.core.state = {
      ...(h.ctx.core.state as FlightState),
      mode: "inFlight",
    };
    h.driver.renderFrame(0);
    expect(
      models
        .at(-1)
        ?.messageRows.some((row) => row.text === "Docking computers engaged"),
    ).toBe(false);
  });
});

describe("renderFrame launch view from inside the dock slot (quick 261118-l26, 261118-os8, 261118-spu)", () => {
  /** A real sim launch, `steps` launching steps in, with its last two poses. */
  function launchingSession(steps: number) {
    const h = harness();
    const models: HudModel[] = [];
    const angles: number[] = [];
    h.ctx.core.layout = layout;
    h.ctx.core.config = config;
    h.ctx.core.dockGeometry = laveDockGeometry();
    const scene = flyableScene(h.nebula);
    (scene.station as { update: (angle: number) => void }).update = (
      angle: number,
    ) => angles.push(angle);
    h.ctx.core.scene = scene;
    h.ctx.runtime.hud = {
      draw: (model: HudModel) => models.push(model),
    } as unknown as Hud;
    const state = initFlightState(layout);
    stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
    let previous = poseOf(state);
    for (let index = 0; index < steps; index += 1) {
      previous = poseOf(state);
      stepFlight(state, layout, config, ZERO_INTENT, [], DT);
    }
    h.ctx.core.state = state;
    h.ctx.core.previousPose = previous;
    h.ctx.core.currentPose = poseOf(state);
    return { h, models, angles, scene, state };
  }

  it("draws from the slot camera at the interpolated pose and station angle, with the hull hidden and the HUD shown (quick 261118-spu)", () => {
    for (const [steps, alpha] of [
      [0, 0.5],
      [24, 0.25],
      [120, 1],
      [239, 0.75],
    ] as const) {
      const { h, models, angles, scene, state } = launchingSession(steps);
      expect(state.mode).toBe("launching");
      h.driver.renderFrame(alpha);
      // One view timeline: the launch starts where the pre-roll ends.
      const tau =
        LAUNCH_PRE_ROLL_DURATION +
        launchViewElapsed(state.launchElapsed, alpha);
      const pose = interpolatePose(
        h.ctx.core.previousPose,
        h.ctx.core.currentPose,
        alpha,
      );
      const expected = computeSlotLaunchCamera(
        layout,
        laveDockGeometry().port.depth,
        config.launchSpeed,
        pose.position,
        pose.orientation,
        tau,
      );
      expect(h.ctx.core.previousCameraWorld).toEqual(expected.position);
      expect(angles).toEqual([launchViewStationAngle(layout, tau)]);
      expect(scene.ship.visible).toBe(false);
      // Quick 261118-spu (OD-1): the HUD is drawn while launching, as Oolite
      // draws it; the compass blip is hidden and the roll bar reads 0 (OD-2,
      // OD-3) although the sim rolls with the station.
      expect(h.hudCanvas.hidden).toBe(false);
      // The page overlay's version and system lines stay hidden (D-02).
      expect(h.hudCanvas.attributes.has("data-launching")).toBe(true);
      expect(models).toHaveLength(1);
      expect(models[0]?.compass.blip).toBe(false);
      expect(models[0]?.bars.roll).toBe(0);
      expect(state.rollRate).toBe(layout.stationRollRadPerSec);
      expect(h.renders).toHaveLength(1);
    }
  });

  it("shows and draws the HUD in flight, still without the hull", () => {
    const { h, models, angles, scene, state } = launchingSession(10);
    h.ctx.core.state = { ...state, mode: "inFlight" };
    h.driver.renderFrame(1);
    expect(h.hudCanvas.hidden).toBe(false);
    expect(h.hudCanvas.attributes.has("data-launching")).toBe(false);
    expect(models).toHaveLength(1);
    expect(scene.ship.visible).toBe(false);
    expect(angles).toEqual([state.stationAngle]);
  });

  it("draws from the plain cockpit pose when the dock geometry is missing", () => {
    const { h, state } = launchingSession(24);
    h.ctx.core.dockGeometry = undefined;
    expect(() => {
      h.driver.renderFrame(1);
    }).not.toThrow();
    expect(h.ctx.core.previousCameraWorld).toEqual(
      computeCockpitCamera(state.position, state.orientation).position,
    );
  });

  /** A docked session with the real layout, dock data and a recording scene. */
  function dockedSession() {
    const h = harness();
    const models: HudModel[] = [];
    const angles: number[] = [];
    const quaternions: { x: number; y: number; z: number; w: number }[] = [];
    h.ctx.core.layout = layout;
    h.ctx.core.config = config;
    h.ctx.core.dockGeometry = laveDockGeometry();
    const scene = flyableScene(h.nebula);
    (scene.station as { update: (angle: number) => void }).update = (
      angle: number,
    ) => angles.push(angle);
    (
      scene.camera as unknown as {
        quaternion: { set: (...q: number[]) => void };
      }
    ).quaternion.set = (x = 0, y = 0, z = 0, w = 0) => {
      quaternions.push({ x, y, z, w });
    };
    h.ctx.core.scene = scene;
    h.ctx.runtime.hud = {
      draw: (model: HudModel) => models.push(model),
    } as unknown as Hud;
    const state = initFlightState(layout);
    h.ctx.core.state = state;
    h.ctx.core.previousPose = poseOf(state);
    h.ctx.core.currentPose = poseOf(state);
    return { h, models, angles, quaternions, scene, state };
  }

  it("draws a docked session in the pre-roll from the slot, rolled at the view time, with the launch-start HUD shown (quick 261118-os8, 261118-spu)", () => {
    const dock = laveDockGeometry();
    for (const [elapsed, alpha] of [
      [0, 1],
      [DT, 0.5],
      [0.75, 0.25],
      [179 * DT, 1],
    ] as const) {
      const { h, models, angles, scene, state } = dockedSession();
      h.preRoll.preRolling = true;
      h.preRoll.preRollElapsed = elapsed;
      expect(state.mode).toBe("docked");
      const hashBefore = hashFlight(state);
      const clockBefore = state.clockSeconds;
      h.driver.renderFrame(alpha);
      const tau = preRollViewTime(elapsed, alpha);
      const pose = preRollPose(layout, dock, tau);
      const expected = computeSlotLaunchCamera(
        layout,
        dock.port.depth,
        config.launchSpeed,
        pose.position,
        pose.orientation,
        tau,
      );
      expect(h.ctx.core.previousCameraWorld).toEqual(expected.position);
      expect(angles).toEqual([launchViewStationAngle(layout, tau)]);
      expect(scene.ship.visible).toBe(false);
      // Quick 261118-spu (OD-1, PD-1): the HUD is shown and reads the launch
      // start values; the live sim state stays docked and unwritten.
      expect(h.hudCanvas.hidden).toBe(false);
      expect(h.hudCanvas.attributes.has("data-launching")).toBe(true);
      expect(models).toHaveLength(1);
      const model = models[0];
      expect(model?.speed).toBe(config.launchSpeed);
      expect(model?.clockSeconds).toBe(clockBefore + 600);
      expect(model?.clockText).toBe(formatClock(clockBefore + 600));
      expect(model?.condition).toBe("yellow");
      expect(model?.aegis).toBe("dockingRange");
      expect(model?.compass.blip).toBe(false);
      expect(model?.bars.roll).toBe(0);
      expect(h.ctx.core.state).toBe(state);
      expect(h.ctx.core.state?.mode).toBe("docked");
      expect(hashFlight(state)).toBe(hashBefore);
      expect(state.clockSeconds).toBe(clockBefore);
      expect(h.renders).toHaveLength(1);
    }
  });

  it("keeps a docked session drawn every frame while the pre-roll runs, and frozen otherwise (quick 261118-os8)", () => {
    const { h } = dockedSession();
    h.preRoll.preRolling = true;
    expect(runFrames(h, 5)).toBe(5);
    h.preRoll.preRolling = false;
    // The gate's settle draws, then nothing while docked.
    runFrames(h, 10);
    expect(runFrames(h, 5)).toBe(0);
  });

  it("drops data-launching and keeps the HUD hidden for a docked session with no pre-roll", () => {
    const { h, models } = dockedSession();
    h.hudCanvas.attributes.add("data-launching");
    h.driver.renderFrame(1);
    expect(h.hudCanvas.attributes.has("data-launching")).toBe(false);
    expect(h.hudCanvas.hidden).toBe(true);
    expect(models).toHaveLength(0);
  });

  it("fires no hint in the pre-roll or the launch; hints read the live state (quick 261118-spu, PD-3)", () => {
    const { h, state } = dockedSession();
    h.ctx.runtime.hints = createHintController({
      bindings: createBindingMap(),
    });
    const enqueued: string[] = [];
    const enqueue = h.messages.enqueue.bind(h.messages);
    h.messages.enqueue = (text: string, seconds: number) => {
      enqueued.push(text);
      enqueue(text, seconds);
    };
    // The docked panel announces the launch hint before the press, as today.
    h.driver.renderFrame(1);
    const announced = h.ctx.station.stationMessage;
    expect(announced).not.toBe("");
    expect(enqueued).toEqual([]);

    h.preRoll.preRolling = true;
    for (const elapsed of [0, 0.5, 179 * DT]) {
      h.preRoll.preRollElapsed = elapsed;
      h.driver.renderFrame(1);
      expect(h.ctx.station.stationMessage).toBe(announced);
    }
    h.preRoll.preRolling = false;
    stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
    for (let index = 0; index < 120; index += 1) {
      h.ctx.core.previousPose = poseOf(state);
      stepFlight(state, layout, config, ZERO_INTENT, [], DT);
      h.ctx.core.currentPose = poseOf(state);
      expect(state.mode).toBe("launching");
      h.driver.renderFrame(1);
      expect(h.ctx.station.stationMessage).toBe(announced);
    }
    expect(enqueued).toEqual([]);
  });

  it("draws the launch step at the launch pose with the full twist: the launched handler snaps previousPose (quick 261118-os8)", () => {
    const dock = laveDockGeometry();
    const { h, quaternions, state } = dockedSession();
    // As `stepOnce` does: shift the pose window, step, dispatch, then record.
    h.ctx.core.previousPose = h.ctx.core.currentPose;
    stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT, {
      dock,
    });
    expect(state.mode).toBe("launching");
    const none = (): void => undefined;
    const flow = createStationFlow(h.ctx, {
      launchSequence: { reset: none, markSeen: none },
      docked: { show: none, hide: none },
      hudCanvas: { hidden: true },
      messages: { enqueue: none },
      syncStationNav: none,
      syncEconomyProbe: none,
      persistSettings: none,
      ensureSelection: none,
      renderStation: none,
      autosave: none,
      closeChart: none,
    });
    flow({ kind: "launched" });
    h.ctx.core.currentPose = poseOf(state);
    h.driver.renderFrame(0.5);
    const expected = computeSlotLaunchCamera(
      layout,
      dock.port.depth,
      config.launchSpeed,
      state.position,
      launchOrientation(layout, dock),
      LAUNCH_PRE_ROLL_DURATION,
    );
    const camera = h.ctx.core.previousCameraWorld;
    if (camera === undefined) throw new Error("no camera drawn");
    expect(Math.abs(camera.x - expected.position.x)).toBeLessThan(1e-9);
    expect(Math.abs(camera.y - expected.position.y)).toBeLessThan(1e-9);
    expect(Math.abs(camera.z - expected.position.z)).toBeLessThan(1e-9);
    const drawn = quaternions.at(-1);
    if (drawn === undefined) throw new Error("no camera orientation");
    const twisted = launchOrientation(layout, dock);
    const dotq = Math.abs(
      drawn.w * twisted.w +
        drawn.x * twisted.x +
        drawn.y * twisted.y +
        drawn.z * twisted.z,
    );
    expect(dotq).toBeGreaterThan(1 - 1e-12);
  });
});

describe("renderFrame live buoys (plan 18-08, D-05, PD-01, PD-02)", () => {
  /** A buoy body double: its root and every subentity visibility it was given. */
  function bodyDouble(root: THREE.Group) {
    const calls: boolean[] = [];
    return {
      root,
      calls,
      update: () => undefined,
      setSubentityVisible(visible: boolean): void {
        calls.push(visible);
      },
    };
  }

  /** A flying session 5 km from the witchpoint, with real buoy groups. */
  function session(withWorld: boolean) {
    const h = harness();
    const models: HudModel[] = [];
    h.ctx.core.layout = layout;
    h.ctx.core.config = config;
    const navBuoy = new THREE.Group();
    const witchpoint = new THREE.Group();
    const navBody = bodyDouble(navBuoy);
    const witchpointBody = bodyDouble(witchpoint);
    h.ctx.core.scene = {
      ...flyableScene(h.nebula),
      navBuoy,
      witchpoint,
      buoys: [navBody, witchpointBody],
    } as unknown as SystemScene;
    h.ctx.runtime.hud = {
      draw: (model: HudModel) => models.push(model),
    } as unknown as Hud;
    if (withWorld) {
      const lifecycle = createWorldLifecycle({ traffic: true });
      lifecycle.begin(marketSeedForSystem(system.id));
      h.ctx.core.worldLifecycle = lifecycle;
    }
    const w = layout.witchpoint.position;
    const pose = {
      position: vec(w.x, w.y, w.z + 5_000),
      orientation: identity(),
    };
    h.ctx.core.previousPose = pose;
    h.ctx.core.currentPose = pose;
    h.ctx.core.state = {
      ...initFlightState(layout),
      mode: "inFlight",
      position: pose.position,
    };
    return { h, models, navBuoy, witchpoint, navBody, witchpointBody };
  }

  function contactIds(model: HudModel | undefined): string[] {
    return (model?.contacts ?? []).map((contact) => contact.id);
  }

  it("draws both buoys at their layout positions with no world, as with a pristine world", () => {
    const bare = session(false);
    bare.h.driver.renderFrame(0);
    const pristine = session(true);
    pristine.h.driver.renderFrame(0);
    for (const s of [bare, pristine]) {
      expect(s.navBuoy.visible).toBe(true);
      expect(s.witchpoint.visible).toBe(true);
      expect(s.navBody.calls).toEqual([true]);
      expect(s.witchpointBody.calls).toEqual([true]);
      expect(contactIds(s.models[0])).toEqual([
        "station",
        "navBuoy",
        "witchpoint",
      ]);
    }
    expect(pristine.witchpoint.position.toArray()).toEqual(
      bare.witchpoint.position.toArray(),
    );
    expect(pristine.navBuoy.position.toArray()).toEqual(
      bare.navBuoy.position.toArray(),
    );
    expect(pristine.models[0]?.contacts).toEqual(bare.models[0]?.contacts);
  });

  it("hides a destroyed nav buoy, draws a moved witchpoint buoy without its subentity, and plots both so on the next frame", () => {
    const s = session(true);
    s.h.driver.renderFrame(0);
    const before = s.witchpoint.position.clone();
    const witchpointContact = s.models[0]?.contacts[2];

    const world = s.h.ctx.core.worldLifecycle?.world;
    if (world === undefined) throw new Error("no world");
    world.staticHealth.navBuoy = 0;
    world.buoys.witchpoint.offset = vec(50, 0, 0);
    world.buoys.witchpoint.subentityEnergy = 0;
    s.h.driver.renderFrame(0);

    expect(s.navBuoy.visible).toBe(false);
    expect(s.witchpoint.visible).toBe(true);
    expect(s.witchpoint.position.x - before.x).toBeCloseTo(50, 6);
    expect(s.witchpoint.position.y).toBeCloseTo(before.y, 9);
    expect(s.witchpoint.position.z).toBeCloseTo(before.z, 9);
    expect(s.witchpointBody.calls.at(-1)).toBe(false);
    expect(s.navBody.calls.at(-1)).toBe(true);

    const model = s.models[1];
    expect(contactIds(model)).toEqual(["station", "witchpoint"]);
    const moved = model?.contacts[1];
    expect(moved?.id).toBe("witchpoint");
    expect(moved?.x).not.toBeCloseTo(witchpointContact?.x ?? NaN, 6);
  });
});

describe("renderFrame dead scene (D-01)", () => {
  const POSITION = vec(1_000, 200, -300);
  const ORIENTATION = axisAngle(0, 1, 0, 0.7);
  const FLIGHT_TIME = 42.5;

  /** A dead, latched session with recording doubles for what the frame feeds. */
  function dying(seconds = 0) {
    const h = harness();
    const explosionCalls: unknown[][] = [];
    const shotCalls: unknown[][] = [];
    const dustCalls: unknown[][] = [];
    const overlayFilters: string[] = [];
    h.ctx.core.layout = layout;
    h.ctx.core.config = config;
    const scene = flyableScene(h.nebula, undefined, (...args) => {
      explosionCalls.push(args);
    });
    Object.assign(scene, {
      shots: { update: (...args: unknown[]) => shotCalls.push(args) },
      dust: { update: (...args: unknown[]) => dustCalls.push(args) },
    });
    h.ctx.core.scene = scene;
    h.ctx.runtime.hud = { draw: () => undefined } as unknown as Hud;
    h.ctx.runtime.gameOverOverlay = {
      setFilter: (filter: string) => overlayFilters.push(filter),
    } as unknown as GameOverOverlay;
    const state: FlightState = {
      ...initFlightState(layout),
      mode: "dead",
      flightTime: FLIGHT_TIME,
      position: POSITION,
      orientation: ORIENTATION,
    };
    h.ctx.core.state = state;
    h.ctx.core.previousPose = poseOf(state);
    h.ctx.core.currentPose = h.ctx.core.previousPose;
    h.ctx.runtime.gameOver = true;
    h.ctx.runtime.gameOverSeconds = seconds;
    return { h, scene, explosionCalls, shotCalls, dustCalls, overlayFilters };
  }

  /** Back in flight on a fresh state: what a new session shows. */
  function revive(h: Harness): void {
    const state: FlightState = {
      ...initFlightState(layout),
      mode: "inFlight",
      flightTime: FLIGHT_TIME,
    };
    h.ctx.core.state = state;
    h.ctx.core.previousPose = poseOf(state);
    h.ctx.core.currentPose = h.ctx.core.previousPose;
    h.ctx.runtime.gameOver = false;
    h.ctx.runtime.gameOverSeconds = 0;
  }

  it("draws from Oolite's aft view set back 100 m along the ship's forward, with the hull hidden", () => {
    const { h, scene, explosionCalls } = dying();
    expect(DEAD_CAMERA_SETBACK_M).toBe(100);
    h.driver.renderFrame(0);

    const forward = rotate(ORIENTATION, vec(0, 0, -1));
    const expected = computeViewCamera(
      add(POSITION, scale(forward, DEAD_CAMERA_SETBACK_M)),
      ORIENTATION,
      "aft",
      vec(0, 0, 0),
    );
    expect(explosionCalls[0]?.[0]).toEqual(expected.position);
    expect(scene.ship.visible).toBe(false);
  });

  it("hides the HUD canvas and marks it data-dead while dead, and neither once back in flight", () => {
    const { h } = dying();
    h.driver.renderFrame(0);
    expect(h.hudCanvas.hidden).toBe(true);
    expect(h.hudCanvas.attributes.has("data-dead")).toBe(true);

    revive(h);
    h.driver.renderFrame(0);
    expect(h.hudCanvas.hidden).toBe(false);
    expect(h.hudCanvas.attributes.has("data-dead")).toBe(false);
  });

  it("feeds the explosion and shot layers the effect time, the flight time plus the seconds since death", () => {
    const { h, explosionCalls, shotCalls } = dying(2.5);
    h.driver.renderFrame(0);
    expect(explosionCalls[0]?.[2]).toBe(FLIGHT_TIME + 2.5);
    expect(shotCalls[0]?.[1]).toBe(FLIGHT_TIME + 2.5);
  });

  it("feeds both layers the flight time exactly while alive", () => {
    const { h, explosionCalls, shotCalls } = dying();
    revive(h);
    h.driver.renderFrame(0);
    expect(explosionCalls[0]?.[2]).toBe(FLIGHT_TIME);
    expect(shotCalls[0]?.[1]).toBe(FLIGHT_TIME);
  });

  it("fades the canvas and the game-over text to grey over GAME_OVER_FADE_SECONDS", () => {
    expect(GAME_OVER_FADE_SECONDS).toBe(5);
    const { h, overlayFilters } = dying();
    const seen: string[] = [];
    for (const seconds of [0, 2.5, 5, 9]) {
      h.ctx.runtime.gameOverSeconds = seconds;
      h.driver.renderFrame(0);
      seen.push(h.canvasStyle.filter);
    }
    expect(seen).toEqual([
      "saturate(1)",
      "saturate(0.5)",
      "saturate(0)",
      "saturate(0)",
    ]);
    // The overlay gets the same strings, written when they change.
    expect(overlayFilters).toEqual([
      "saturate(1)",
      "saturate(0.5)",
      "saturate(0)",
    ]);
  });

  it("sets no filter in flight, and writes a string only when it changes", () => {
    const { h, overlayFilters } = dying();
    revive(h);
    h.driver.renderFrame(0);
    h.driver.renderFrame(0);
    expect(h.canvasStyle.filter).toBe("");
    expect(h.canvasStyle.writes).toEqual([""]);
    expect(overlayFilters).toEqual([""]);
  });

  it("always writes the filter on a driver's first frame, clearing a stale one", () => {
    const { h } = dying();
    revive(h);
    h.canvasStyle.filter = "saturate(0)";
    h.canvasStyle.writes.length = 0;
    h.driver.renderFrame(0);
    expect(h.canvasStyle.filter).toBe("");
    expect(h.canvasStyle.writes).toEqual([""]);
  });

  it("gives the dust a zero delta on the first dead frame although the camera moved, and on the next", () => {
    const { h, dustCalls } = dying();
    // The camera of the last live frame: far from the 100 m aft camera.
    h.ctx.core.previousCameraWorld = vec(0, 0, 0);
    h.driver.renderFrame(0);
    h.driver.renderFrame(0);
    expect(dustCalls).toHaveLength(2);
    expect(dustCalls[0]?.[0]).toEqual(vec(0, 0, 0));
    expect(dustCalls[1]?.[0]).toEqual(vec(0, 0, 0));
  });

  it("draws every dead frame until the settle time, with or without traffic, then lets the gate idle", () => {
    const { h } = dying(4.9);
    expect(runFrames(h, 20)).toBe(20);
    h.ctx.core.npcTraffic = {
      debrisModels: [],
    } as unknown as TrafficContent;
    expect(runFrames(h, 20)).toBe(20);
    h.ctx.runtime.gameOverSeconds = GAME_OVER_FADE_SECONDS + 1;
    expect(runFrames(h, 20)).toBe(IDLE_SETTLE_DRAWS);
    expect(runFrames(h, 20)).toBe(0);
  });

  it("draws the dead scene from the live fields on a context restore", () => {
    const { h } = dying(7);
    h.driver.renderFrame(0);
    expect(h.renders).toHaveLength(1);
  });
});
