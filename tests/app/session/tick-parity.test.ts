// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Tick parity and the sim hook (Phase 8, plan 08-16; D-09, D-13; FOUND-14;
 * success criterion 5).
 *
 * Node only. The real sim driver, router, hyperspace controller, world
 * lifecycle and probe publisher run over a fake session context, and the result
 * is compared with the pure Node replay of tests/helpers/tick-script.ts, which
 * the Playwright spec compares with the browser. The expected values are the
 * replay's and `hashFlight`'s, never the driver's own output run twice: with no
 * populator the world is empty, so `hashWorld` must equal `hashFlight` there (D-08)
 * and a pair of runs cannot agree on the same wrong value.
 *
 * Scope honesty (RESEARCH Pattern 10): this proves tick control, the shared
 * `StepOptions` and the lifecycle's epoch bumps and world creation, not the
 * determinism of a populated world; that is proven in plans 08-11 and 08-13.
 */

import { createLaunchSequence } from "../../../src/app/launch-sequence.js";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type {
  WegoliteProbe,
  WegoliteSaveProbe,
} from "../../../src/app/probe.js";
import { createRedrawGate } from "../../../src/app/redraw-gate.js";
import type { RedrawGate } from "../../../src/app/redraw-gate.js";
import { createSessionState } from "../../../src/app/session/context.js";
import type { SessionState } from "../../../src/app/session/context.js";
import {
  EQUIPMENT_DAMAGED_TEMPLATE,
  createDamageFlow,
  createEventRouter,
  createHudMessages,
  createHyperspaceFlow,
  formatDamageMessage,
} from "../../../src/app/session/event-router.js";
import { createHyperspaceController } from "../../../src/app/session/hyperspace-controller.js";
import type { HyperspaceControllerDeps } from "../../../src/app/session/hyperspace-controller.js";
import { createProbePublisher } from "../../../src/app/session/probe-publisher.js";
import type { ProbePublisher } from "../../../src/app/session/probe-publisher.js";
import { createSimDriver } from "../../../src/app/session/sim-driver.js";
import type { SimDriver } from "../../../src/app/session/sim-driver.js";
import { parseTestFlags } from "../../../src/app/session/test-flags.js";
import {
  createInertPopulate,
  trafficContent,
} from "../../../src/app/session/traffic.js";
import { createWorldLifecycle } from "../../../src/app/session/world-lifecycle.js";
import type { WorldLifecycle } from "../../../src/app/session/world-lifecycle.js";
import { parseEquipment } from "../../../src/content/equipment.js";
import { ExplosionCatalogueSchema } from "../../../src/content/schemas/explosion.js";
import { DebrisCatalogueSchema } from "../../../src/content/schemas/ship-debris.js";
import type { Equipment, NpcShip, System } from "../../../src/content/types.js";
import type { KeyboardInputSource } from "../../../src/input/keyboard.js";
import { createMessageQueue } from "../../../src/render/hud/messages.js";
import type { MessageQueue } from "../../../src/render/hud/messages.js";
import type { Command } from "../../../src/sim/commands.js";
import type { PlayerProfile } from "../../../src/sim/player/profile.js";
import {
  arrivalMarketSeed,
  generateMarket,
  marketSeedForSystem,
} from "../../../src/sim/economy/market.js";
import {
  PlayerController,
  ScriptedLaunchController,
} from "../../../src/sim/flight/controller.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import type { LaserMounts } from "../../../src/sim/combat/mounts.js";
import {
  DEFAULT_LASER_MOUNTS,
  NO_LASER,
} from "../../../src/sim/combat/mounts.js";
import { hashFlight, initFlightState } from "../../../src/sim/flight/state.js";
import { identity, vec } from "../../../src/sim/math.js";
import { worldSeedFor } from "../../../src/sim/rng.js";
import { npcContacts } from "../../../src/sim/world/contacts.js";
import { STATION_NAV_BUOY_ID } from "../../../src/sim/world/ids.js";
import { hashWorld } from "../../../src/sim/world/serialize.js";
import { deriveSystemLayout } from "../../../src/sim/world/layout.js";
import { liveEntityCount, spawnEntity } from "../../../src/sim/world/world.js";
import { commoditiesFixture } from "../../helpers/commodities.js";
import { laveDockGeometry } from "../../helpers/dock-pose.js";
import { laveFixture } from "../../helpers/lave.js";
import { fullHullTable } from "../../helpers/hull-table.js";
import { sessionSourceFiles } from "../../helpers/session-source.js";
import { runTickScript } from "../../helpers/tick-script.js";

const lave = laveFixture();
const catalogue = commoditiesFixture();
/** The real compiled equipment catalogue, loaded as the boot loads it. */
const equipmentCatalogue: readonly Equipment[] = parseEquipment(
  JSON.parse(
    readFileSync(
      new URL("../../../src/content/generated/equipment.json", import.meta.url),
      "utf8",
    ),
  ) as unknown,
);
const LEESTI_ID = "g0-s55";

const galaxy = JSON.parse(
  readFileSync(
    new URL("../../../src/content/generated/systems/g0.json", import.meta.url),
    "utf8",
  ),
) as System[];
const galaxyById = new Map(galaxy.map((entry) => [entry.id, entry]));
const leesti = galaxyById.get(LEESTI_ID);
if (leesti === undefined) throw new Error(`the galaxy has no ${LEESTI_ID}`);

const launch: Command = { kind: "launch" };
const LAVE_SEED = marketSeedForSystem(lave.system.id);

interface Session {
  readonly ctx: SessionState;
  readonly driver: SimDriver;
  readonly pending: Command[];
  readonly lifecycle: WorldLifecycle;
  readonly probe: WegoliteProbe;
  readonly gate: RedrawGate;
  readonly publisher: ProbePublisher;
  /** What the fake keyboard reports as held; `fire` is the laser key. */
  readonly held: { fire: boolean };
  /** The HUD message queue the router's message subscriber writes to. */
  readonly messages: MessageQueue;
  /**
   * Every event kind the router handed to the HUD message subscriber, in order.
   * Filled only when the session was built with `hudRouting`; empty otherwise.
   */
  readonly routed: string[];
}

/**
 * A docked Lave New game over the real driver, router, lifecycle and probe
 * publisher; `search` is parsed exactly as the session parses the URL.
 * `populated` adds the inert populator and the NPC masses (with traffic on).
 * `hudRouting` wires the real HUD message subscriber (`createHudMessages`)
 * behind a recorder, so the routed event kinds and the message queue can be
 * read; every other session keeps the quiet stub.
 * `damage` (plan 19-13, CBT-08) loads the real equipment catalogue, lets the
 * probe publisher's `commitProfile` replace `ctx.core.profile` (the identity
 * check of the station controller's `commitProfile`), and wires the real
 * `createDamageFlow` behind the same recorder as `hudRouting` (each kind it is
 * handed is pushed to `routed`), with the session's own message queue. With it
 * false every session is byte-identical to before.
 */
function session(
  search: string,
  populated = false,
  hudRouting = false,
  damage = false,
): Session {
  const ctx = createSessionState({
    system: lave.system,
    saveStatus: "absent",
    saveSkipReason: "",
  });
  ctx.core.state = initFlightState(lave.layout);
  // As start-up does beside the flight state: a pristine combat state.
  ctx.core.combat = createPlayerCombatState();
  ctx.core.layout = lave.layout;
  ctx.core.config = lave.config;
  ctx.core.dockGeometry = laveDockGeometry();
  ctx.core.stationDef = lave.stationDef;
  ctx.core.commodities = catalogue;
  ctx.core.marketSeed = LAVE_SEED;
  ctx.core.market = generateMarket(lave.system, catalogue, LAVE_SEED);
  ctx.runtime.testFlags = parseTestFlags(search);
  // `populated` (traffic on only) wires the real inert populate over the
  // committed NPC records, as start-up does (start-session.ts). Every other
  // session keeps the default populator, so the pre-existing rows, some of which
  // open with `traffic=1` and spawn their own entity, are unchanged.
  const traffic = ctx.runtime.testFlags.traffic;
  const populate = traffic && populated;
  if (populate) {
    // The NPC records, the debris records and the explosion settings, as the
    // boot load hands them to `trafficContent` (start-session.ts, plan 16-06);
    // the two new files through their strict schemas, as their loaders parse.
    ctx.core.npcTraffic = trafficContent(
      JSON.parse(
        readFileSync(
          new URL(
            "../../../src/content/generated/ships-npc.json",
            import.meta.url,
          ),
          "utf8",
        ),
      ) as NpcShip[],
      {
        debris: DebrisCatalogueSchema.parse(
          JSON.parse(
            readFileSync(
              new URL(
                "../../../src/content/generated/ships-debris.json",
                import.meta.url,
              ),
              "utf8",
            ),
          ),
        ),
        explosions: ExplosionCatalogueSchema.parse(
          JSON.parse(
            readFileSync(
              new URL(
                "../../../src/content/generated/explosions.json",
                import.meta.url,
              ),
              "utf8",
            ),
          ),
        ),
      },
    );
    // The merged hull table the traffic-on boot load builds beside the NPC
    // catalogue: the ten ship hulls and the static hulls (plan 18-13).
    ctx.core.hulls = fullHullTable();
  }
  const lifecycle = createWorldLifecycle({
    traffic,
    ...(populate
      ? {
          populate: createInertPopulate(
            () => ctx.core.npcTraffic,
            () => ctx.core.layout,
          ),
        }
      : {}),
  });
  ctx.core.worldLifecycle = lifecycle;
  const held = { fire: false };
  ctx.runtime.input = {
    drainCommands: () => [],
    frame: () => ({
      pitch: 0,
      roll: 0,
      speed: 0,
      precision: false,
      ...(held.fire ? { fire: true } : {}),
    }),
  } as unknown as KeyboardInputSource;

  const pending: Command[] = [];
  const messages = createMessageQueue();
  const quiet = (): void => undefined;
  const routed: string[] = [];
  // The commit the damage session runs: the station controller's identity
  // check (a refused operation returns the same profile and commits nothing),
  // without its station render, which this twin has no station for.
  const commitProfile = (next: PlayerProfile): boolean => {
    if (!damage || next === ctx.core.profile) return false;
    ctx.core.profile = next;
    return true;
  };
  if (damage) ctx.core.equipmentCatalogue = equipmentCatalogue;
  const damageFlow = damage
    ? (() => {
        const real = createDamageFlow(ctx, { commitProfile, messages });
        return (event: Parameters<typeof real>[0]): void => {
          routed.push(event.kind);
          real(event);
        };
      })()
    : quiet;
  const hudMessages = hudRouting
    ? (() => {
        const real = createHudMessages({ messages }, ctx);
        return (event: Parameters<typeof real>[0]): void => {
          routed.push(event.kind);
          real(event);
        };
      })()
    : quiet;
  // The driver and the publisher need each other; bind late.
  const bound: { publisher?: ProbePublisher } = {};

  // The real hyperspace controller (for the scripted jump case); its scene
  // manager double installs the destination layout it is asked for.
  let entered: System = lave.system;
  const controllerDeps: HyperspaceControllerDeps = {
    scenes: {
      enterSystem: (system) => {
        entered = system;
        return {} as ReturnType<
          HyperspaceControllerDeps["scenes"]["enterSystem"]
        >;
      },
      layout: () => deriveSystemLayout(entered, lave.stationDef),
    },
    galaxyById,
    messages,
    faults: undefined,
    showBootFailure: quiet,
    publishFailure: quiet,
    autosave: quiet,
    syncEconomyProbe: quiet,
    closeChart: quiet,
  };
  const controller = createHyperspaceController(ctx, controllerDeps);

  const driver = createSimDriver(ctx, {
    pending,
    player: new PlayerController(),
    scripted: new ScriptedLaunchController(),
    // The zero-length pre-roll: the manual-clock path (quick 261118-os8).
    launchSequence: createLaunchSequence(() => 0),
    onPreRollStart: () => undefined,
    router: createEventRouter(ctx, {
      stationFlow: quiet,
      damageFlow,
      hudMessages,
      dockFeedback: quiet,
      hyperspaceFlow: createHyperspaceFlow(ctx, {
        messages,
        refusalCopy: controller.refusalCopy,
        handleHyperspaceJumped: controller.handleHyperspaceJumped,
      }),
    }),
    equipmentSet: () => new Set(ctx.core.profile.equipment),
    targetSystem: () => controller.targetSystem(),
    autosave: quiet,
    markHookMutation: () => {
      bound.publisher?.markHookMutation();
    },
  });

  const probe = {} as WegoliteProbe;
  const gate = createRedrawGate();
  const saveProbe = {
    status: "absent",
    attempts: 0,
    writes: 0,
    committed: 0,
    revision: 0,
    lastClock: null,
    continueVisible: false,
    skipReason: "",
    unavailable: false,
  } satisfies WegoliteSaveProbe;
  const renderer = {
    info: {
      render: { calls: 0, triangles: 0, frame: 0 },
      memory: { geometries: 0, textures: 0 },
      programs: [],
    },
  };
  const publisher = createProbePublisher(ctx, {
    probe,
    renderer: renderer as never,
    scenes: { quality: () => "standard" },
    saveProbe,
    redrawGate: gate,
    messages,
    commitProfile,
    swapSystem: () => Promise.resolve(),
    disposeSystem: () => undefined,
    advanceTicks: (n) => driver.advanceTicks(n),
    launchSequence: { preRolling: false, preRollElapsed: 0 },
  });
  bound.publisher = publisher;
  return {
    ctx,
    driver,
    pending,
    lifecycle,
    probe,
    gate,
    publisher,
    held,
    messages,
    routed,
  };
}

/** The state and the live world of a session, hashed the way the hook does. */
function sessionHash(s: Session): string {
  const state = s.ctx.core.state;
  if (state === undefined) throw new Error("the session has no state");
  return hashWorld(state, s.lifecycle.world, s.ctx.core.combat);
}

/** The launch-and-fly script: a launch on the first tick, then 600 more. */
const LAUNCH_AND_FLY = [
  { commands: [launch], ticks: 1 },
  { commands: [], ticks: 600 },
] as const;

/** Let a gate settle on the current keys so its next decision is observable. */
function settle(gate: RedrawGate, keys: readonly unknown[]): void {
  while (gate.next(true, keys)) gate.drawn(keys);
}

describe("tick parity with the Node replay (success criterion 5)", () => {
  it("advanceTicks(1) then advanceTicks(600) gives the replay's hash, which is hashFlight (D-08)", () => {
    const s = session("?test=1&clock=manual");
    s.pending.push(launch);

    expect(s.driver.advanceTicks(1)).toBe(1);
    expect(s.ctx.core.state?.mode).toBe("launching");
    expect(s.driver.advanceTicks(600)).toBe(601);
    expect(s.ctx.core.state?.mode).toBe("inFlight");

    const replay = runTickScript(LAUNCH_AND_FLY);
    const state = s.ctx.core.state;
    if (state === undefined) throw new Error("no state");
    expect(replay.state.tick).toBe(state.tick);
    expect(replay.state.mode).toBe(state.mode);
    expect(sessionHash(s)).toBe(replay.hash);
    // No NPC exists, so the world hash is the flight hash on both sides.
    expect(replay.hash).toBe(hashFlight(replay.state));
    expect(sessionHash(s)).toBe(hashFlight(state));
    expect(s.lifecycle.epoch).toBe(1);
    expect(replay.epoch).toBe(1);
    const world = s.lifecycle.world;
    if (world === undefined) throw new Error("no world after the launch");
    expect(liveEntityCount(world)).toBe(0);
  });

  it("601 single-tick calls match the replay's per-tick trace, naming the first diverging tick", () => {
    const s = session("?test=1&clock=manual");
    s.pending.push(launch);
    const replay = runTickScript(LAUNCH_AND_FLY, { trace: true });
    const trace = replay.trace;
    if (trace === undefined) throw new Error("no trace");
    expect(trace).toHaveLength(601);

    const driven: string[] = [];
    for (let tick = 0; tick < 601; tick += 1) {
      s.driver.advanceTicks(1);
      driven.push(sessionHash(s));
    }
    const firstDivergence = driven.findIndex(
      (value, index) => value !== trace[index],
    );
    expect(
      firstDivergence,
      `the first diverging tick is ${String(firstDivergence + 1)}`,
    ).toBe(-1);
    // The final value equals the single-call result.
    const single = session("?test=1&clock=manual");
    single.pending.push(launch);
    single.driver.advanceTicks(1);
    single.driver.advanceTicks(600);
    expect(driven[600]).toBe(sessionHash(single));
  });

  it("a scripted jump under advanceTicks bumps the epoch on launch and arrival and recreates the world", () => {
    const s = session("?test=1&clock=manual");
    const state = s.ctx.core.state;
    if (state === undefined) throw new Error("no state");
    expect(s.lifecycle.epoch).toBe(0);
    expect(s.lifecycle.world).toBeUndefined();

    s.pending.push(launch);
    s.driver.advanceTicks(1);
    expect(s.lifecycle.epoch).toBe(1);
    expect(s.lifecycle.world?.worldSeed).toBe(worldSeedFor(LAVE_SEED, 1));

    s.pending.push({ kind: "skipLaunch" });
    s.driver.advanceTicks(1);
    expect(state.mode).toBe("inFlight");
    // Move clear of the station's mass lock (the blockage is checked at the
    // commit only), as the recorded hyperspace flight does.
    state.position = vec(1e7, 0, 0);
    s.driver.advanceTicks(30);

    s.ctx.core.hyperspaceTargetId = LEESTI_ID;
    s.pending.push({ kind: "beginHyperspace" });
    s.driver.advanceTicks(1);
    expect(state.hyperspaceCountdown).toBeGreaterThan(0);
    const worldBefore = s.lifecycle.world;
    expect(s.lifecycle.epoch).toBe(1);

    for (let guard = 0; guard < 2400 && s.ctx.core.lastJump === null;) {
      s.driver.advanceTicks(1);
      guard += 1;
    }
    expect(s.ctx.core.lastJump?.destinationId).toBe(LEESTI_ID);
    expect(s.ctx.core.system).toBe(leesti);

    const arrivalSeed = arrivalMarketSeed(LEESTI_ID, LAVE_SEED);
    expect(s.ctx.core.marketSeed).toBe(arrivalSeed);
    expect(s.lifecycle.epoch).toBe(2);
    expect(s.lifecycle.world).not.toBe(worldBefore);
    expect(s.lifecycle.world?.worldSeed).toBe(worldSeedFor(arrivalSeed, 2));
    expect(s.lifecycle.world?.store.nextId).toBe(101);
    expect(hashWorld(state, s.lifecycle.world)).toBe(hashFlight(state));
  });
});

describe("tick parity with the populated world (plan 12-09, WORLD-14)", () => {
  const TRAFFIC_ON = "?test=1&clock=manual&traffic=1";

  it("the replay populates 12 inert ships with traffic on and none with traffic off, with the same epoch and flight hash", () => {
    const on = runTickScript(LAUNCH_AND_FLY, { traffic: true });
    const off = runTickScript(LAUNCH_AND_FLY, { traffic: false });
    if (on.world === undefined || off.world === undefined) {
      throw new Error("no world after the launch");
    }
    expect(liveEntityCount(on.world)).toBe(12);
    expect(on.epoch).toBe(1);
    expect(on.world.store.nextId).toBe(113);
    expect(liveEntityCount(off.world)).toBe(0);
    expect(off.world.store.nextId).toBe(101);
    expect(off.epoch).toBe(1);
    // D-01: a world with no NPC hashes as the v1 flight hash.
    expect(off.hash).toBe(hashFlight(off.state));
    // Not vacuous: the 12 ships change the world hash, not the flight.
    expect(on.hash).not.toBe(hashFlight(on.state));
    expect(hashFlight(on.state)).toBe(hashFlight(off.state));
  });

  it("with traffic on, advanceTicks(1) then advanceTicks(600) gives the replay's hash", () => {
    const s = session(TRAFFIC_ON, true);
    expect(s.ctx.runtime.testFlags.traffic).toBe(true);
    s.pending.push(launch);

    expect(s.driver.advanceTicks(1)).toBe(1);
    expect(s.driver.advanceTicks(600)).toBe(601);
    expect(s.ctx.core.state?.mode).toBe("inFlight");

    const replay = runTickScript(LAUNCH_AND_FLY, { traffic: true });
    const world = s.lifecycle.world;
    if (world === undefined) throw new Error("no world after the launch");
    expect(liveEntityCount(world)).toBe(12);
    expect(sessionHash(s)).toBe(replay.hash);
    expect(s.lifecycle.epoch).toBe(replay.epoch);
  });

  it("with traffic on, 601 single-tick calls match the replay's per-tick trace, naming the first diverging tick", () => {
    const s = session(TRAFFIC_ON, true);
    s.pending.push(launch);
    const trace = runTickScript(LAUNCH_AND_FLY, {
      traffic: true,
      trace: true,
    }).trace;
    if (trace === undefined) throw new Error("no trace");
    expect(trace).toHaveLength(601);
    const driven: string[] = [];
    for (let tick = 0; tick < 601; tick += 1) {
      s.driver.advanceTicks(1);
      driven.push(sessionHash(s));
    }
    const firstDivergence = driven.findIndex(
      (value, index) => value !== trace[index],
    );
    expect(
      firstDivergence,
      `the first diverging tick is ${String(firstDivergence + 1)}`,
    ).toBe(-1);
  });
});

describe("tick parity with combat (plan 13-11, CBT-04 to CBT-07)", () => {
  const MOUNTS: LaserMounts = {
    ...DEFAULT_LASER_MOUNTS,
    aft: "EQ_WEAPON_BEAM_LASER",
  };

  /** Launch, fly, then fire on the aft view and on the fore view. */
  const COMBAT_SCRIPT = [
    { commands: [launch], ticks: 1 },
    { commands: [], ticks: 600 },
    {
      commands: [{ kind: "setView", view: "aft" } as const],
      ticks: 90,
      fire: true,
    },
    {
      commands: [{ kind: "setView", view: "fore" } as const],
      ticks: 90,
      fire: true,
    },
  ] as const;

  /** Drive the real session through `COMBAT_SCRIPT`, one call per step. */
  function driveSession(s: Session, record?: string[]): void {
    s.ctx.core.profile = { ...s.ctx.core.profile, laserMounts: MOUNTS };
    for (const step of COMBAT_SCRIPT) {
      s.held.fire = "fire" in step && step.fire;
      s.pending.push(...step.commands);
      if (record === undefined) {
        s.driver.advanceTicks(step.ticks);
      } else {
        for (let tick = 0; tick < step.ticks; tick += 1) {
          s.driver.advanceTicks(1);
          record.push(sessionHash(s));
        }
      }
    }
  }

  for (const traffic of [false, true]) {
    const label = traffic ? "traffic on" : "traffic off";
    const search = traffic
      ? "?test=1&clock=manual&traffic=1"
      : "?test=1&clock=manual";

    it(`${label}: the session and the Node replay hash the same after a scripted run that changes view and fires`, () => {
      const s = session(search, traffic);
      driveSession(s);
      const replay = runTickScript(COMBAT_SCRIPT, {
        traffic,
        laserMounts: MOUNTS,
      });

      const state = s.ctx.core.state;
      const combat = s.ctx.core.combat;
      if (state === undefined || combat === undefined) {
        throw new Error("no state");
      }
      expect(sessionHash(s)).toBe(replay.hash);
      // Not vacuous: the run changed the view and heated the lasers, so the
      // combat state is in the hash and the hash is no longer the flight hash.
      expect(replay.combat.view).toBe("fore");
      expect(replay.combat.laserTemp.aft).toBeGreaterThan(0);
      expect(replay.combat.laserTemp.fore).toBeGreaterThan(0);
      expect(combat.laserTemp).toEqual(replay.combat.laserTemp);
      expect(replay.hash).not.toBe(hashWorld(replay.state, replay.world));
    });

    it(`${label}: the per-tick traces agree, naming the first diverging tick`, () => {
      const s = session(search, traffic);
      const driven: string[] = [];
      driveSession(s, driven);
      const trace = runTickScript(COMBAT_SCRIPT, {
        traffic,
        laserMounts: MOUNTS,
        trace: true,
      }).trace;
      if (trace === undefined) throw new Error("no trace");
      expect(driven).toHaveLength(trace.length);
      const firstDivergence = driven.findIndex(
        (value, index) => value !== trace[index],
      );
      expect(
        firstDivergence,
        `the first diverging tick is ${String(firstDivergence + 1)}`,
      ).toBe(-1);
    });
  }

  it("a replay with nothing held and the stock mounts hashes as the flight hash, so every earlier pin stands", () => {
    const replay = runTickScript(LAUNCH_AND_FLY);
    expect(replay.hash).toBe(hashFlight(replay.state));
    expect(replay.combat.laserTemp).toEqual({
      fore: 0,
      aft: 0,
      port: 0,
      starboard: 0,
    });
  });

  it("an empty mount fires nothing in the replay either", () => {
    const empty = runTickScript(
      [
        { commands: [launch], ticks: 1 },
        { commands: [], ticks: 600 },
        { commands: [], ticks: 30, fire: true },
      ],
      { laserMounts: { ...DEFAULT_LASER_MOUNTS, fore: NO_LASER } },
    );
    expect(empty.combat.laserTemp.fore).toBe(0);
  });
});

function liveWorldOf(s: Session): NonNullable<WorldLifecycle["world"]> {
  const world = s.lifecycle.world;
  if (world === undefined) throw new Error("no world");
  return world;
}

/**
 * The gated fight's pins (plan 17-05, D-08; re-measured in plan 17-12 for the
 * literal beam period, D-07 revised by the owner 2026-11-19, G-17-1), measured
 * on this twin and equal to the browser spec's `TWIN_*` literals in
 * tests/e2e/combat.spec.ts.
 *
 * The shooter's shots are the NPC fire gate's: the first within 13 ticks of the
 * spawn, then never less than 13 ticks apart (Oolite's literal frame count for
 * the beam at 120 Hz), so the shooter fires up to 120 / 13 = 9.2 times a second
 * and its 6-point hits empty the forward shield (128, refilled at 2 a second)
 * and then the energy bank.
 *
 * `KILL_OFFSET` is the kill tick relative to the spawn: the player's pulse
 * fires on the spawn tick + 1 and every 61 ticks (the strict `>` of the pulse
 * period) and each pulse hit takes 15 from the Viper. The Viper's 180 energy
 * pays 0.5 a shot: at 9.2 shots a second that is 4.6 a second against a
 * recharge of 4, so it loses about 0.6 a second and holds about 176.6 by the
 * 12th pulse (5.6 s). Eleven pulses (165) leave it alive and the 12th (180 >=
 * 176.6) kills it, at spawn + 1 + 11 x 61 = 672. The kill offset is set by the
 * player's pulse period, so the 13-tick period does not move it (the ungated
 * 15-tick shooter lost no energy and needed the 14th pulse, at 794, the old
 * pin).
 *
 * The bank at the kill is re-derived by hand. In `T` ticks the shooter fires at
 * most `floor((T - 1) / 13) + 1` shots, 52 at T = 672, so at most 52 x 6 = 312
 * points land. The shield absorbs 128 plus whatever it refills (every refilled
 * point is paid by the bank), the player's own 12 pulses cost 12 x 0.8 = 9.6,
 * and the bank regenerates 4 a second (22.4 over the 5.6 s) that this bound
 * ignores. Energy at the kill is therefore at least 256 - 9.6 - (312 - 128) =
 * 62.4. The measured bank, 83.8, sits above it: not every shot lands on the
 * player and part of the regeneration counts. `ENERGY_AT_KILL` is pinned exactly
 * so that any drift of the gate's shot count (6 points a shot) fails here, and
 * the floor guards the modelled minimum. Measured at plan 17-12 on the working
 * tree: the shield 0.18333... -> 0.13333... and the bank 210.13... -> 222.18...
 * 360 ticks after the spawn, the bank at the kill 59.75 -> 83.8.
 */
const KILL_OFFSET = 672;
const ENERGY_AT_KILL = 83.7999999999947;
const ENERGY_AT_KILL_FLOOR = 62.4;
/** The forward shield and the bank 360 ticks after the spawn, fire held. */
const SHIELD_AFTER_SHOOTING = 0.13333333333333333;
const ENERGY_AFTER_SHOOTING = 222.18333333333135;

describe("the browser kill step's twin (plan 15-04, FOUND-19, R2-1)", () => {
  it("fire held from the spawn destroys the hook-spawned shooter before its return fire empties the bank", () => {
    const s = session("?test=1&clock=manual&traffic=1", true, true);
    const state = s.ctx.core.state;
    const combat = s.ctx.core.combat;
    if (state === undefined || combat === undefined) {
      throw new Error("no state");
    }
    s.publisher.bindTestHook(state);
    const hook = s.probe.test;
    if (hook === undefined) throw new Error("no hook");
    const world = (): ReturnType<typeof liveWorldOf> => liveWorldOf(s);

    // Launch and fly the scripted exit out, then park the ship.
    s.pending.push(launch);
    s.driver.advanceTicks(1);
    s.driver.advanceTicks(300);
    expect(state.mode).toBe("inFlight");
    hook.setSpeed(0);

    // 1. Holding fire for 30 ticks heats the fore laser; then 60 ticks with
    //    fire released (the pulse period is 61 ticks) leave it ready.
    s.held.fire = true;
    s.driver.advanceTicks(30);
    s.held.fire = false;
    expect(combat.laserTemp.fore).toBeGreaterThan(0);
    s.driver.advanceTicks(60);

    // 2. Fire is held from the moment the shooter spawns.
    expect(combat.fwdShield).toBe(128);
    s.held.fire = true;
    expect(hook.spawnTestShooter()).toBe(true);
    const spawnTick = state.tick;
    const routedAtSpawn = s.routed.length;
    const before = npcContacts(world()).length;
    s.driver.advanceTicks(360);
    expect(combat.fwdShield).toBeLessThan(128);
    // The gated fight's literals at spawn + 360, pinned in the browser spec
    // too (criterion 3: the route from a hook-spawned shooter to the readout).
    expect(combat.fwdShield).toBeCloseTo(SHIELD_AFTER_SHOOTING, 9);
    expect(combat.energy).toBeCloseTo(ENERGY_AFTER_SHOOTING, 9);

    // 3. R engages ident and locks the ship in the sights.
    s.pending.push({ kind: "ident" });
    s.driver.advanceTicks(2);
    expect(s.routed).toContain("identLocked");
    expect(s.messages.current(state.flightTime)).toMatch(
      /^Ident system locked onto/,
    );

    // 4. One tick at a time until the scanner loses a ship.
    const bound = spawnTick + 1500;
    let killTick = -1;
    let routedBeforeKillTick = routedAtSpawn;
    while (state.tick < bound) {
      routedBeforeKillTick = s.routed.length;
      s.driver.advanceTicks(1);
      if (npcContacts(world()).length === before - 1) {
        killTick = state.tick;
        break;
      }
    }

    // The scanner lost exactly one ship, and the loop ended on the kill, not on
    // its bound (the vacuity guard).
    expect(killTick, "the kill landed before the bound").toBeGreaterThan(-1);
    expect(npcContacts(world()).length).toBe(before - 1);
    // The 12th pulse hit is lethal at spawn + 1 + 11 * 61 (measured: 672; see
    // KILL_OFFSET for the derivation under the gated shooter).
    expect(killTick - spawnTick).toBe(KILL_OFFSET);
    // The bank still paid for every shot: no refusal reached the HUD, the bank
    // at the kill is pinned exactly, and it is above the hand-derived modelled
    // minimum (see ENERGY_AT_KILL).
    expect(s.routed.slice(routedAtSpawn)).not.toContain("laserRefused");
    expect(combat.energy).toBeGreaterThanOrEqual(ENERGY_AT_KILL_FLOOR);
    expect(combat.energy).toBeCloseTo(ENERGY_AT_KILL, 9);
    // The lock on the destroyed ship ends on the kill tick with identLost, and
    // ident then re-locks the nav buoy on the sight line (plan 18-06: ident
    // locks buoys; owner decision 2026-11-20).
    const kindsOfKillTick = s.routed.slice(routedBeforeKillTick);
    const lostAt = kindsOfKillTick.indexOf("identLost");
    expect(lostAt).toBeGreaterThan(-1);
    expect(kindsOfKillTick.indexOf("identLocked", lostAt)).toBeGreaterThan(
      lostAt,
    );
    expect(combat.identTarget).toBe(STATION_NAV_BUOY_ID);
    // The fresh lock's message replaces "Target lost." (this twin installs no
    // static names, so the HUD shows the raw key).
    expect(s.messages.current(state.flightTime)).toMatch(
      /^Ident system locked onto/,
    );
  });
});

/**
 * The debris twin's pins (plan 16-06), measured through the real driver and
 * recorded in 16-06-SUMMARY.md for the browser step of plan 16-09: the pieces
 * live on the kill tick, the probe's entity count then, and the world hash 60
 * ticks after the kill.
 */
// Re-pinned in plan 17-05 (D-08) from { pods: 3, plates: 1, wrecks: 3 }, 19
// entities and "34393ce1": the shooter's own combat stream now also serves the
// gate's draws, so the debris released at the kill (drawn from that stream)
// differs, and the kill lands 122 ticks earlier. Measured, not derived.
// Re-pinned in plan 17-12 (G-17-1): the beam period is now 13, so the shooter's
// combat stream is at a different point when the debris is drawn; wrecks 1 -> 2,
// entities 15 -> 16 (2 pods + 2 wrecks + the rest of the world, unchanged).
const DEBRIS_AT_KILL = { pods: 2, plates: 0, wrecks: 2 } as const;
const ENTITIES_AT_KILL = 16;
// Re-pinned in quick task 261117-pij from "a10b2dfc": a new game's clock now
// starts at the standard scenario's ship_clock, and the hash includes the clock.
// Re-pinned in quick task 261118-mb5 from "ca59f800": the launch now applies
// Oolite's launch twist (a quarter turn about the nose axis), and the hash
// includes the orientation. Passing no dock to `beginLaunch` restores the old
// value.
// Re-pinned in plan 17-12 (G-17-1) from "a545cb4b": the literal beam period
// moves every shot and the shooter's stream. Measured, not derived.
// Follows plan 18-05: the warm-up burst now hits the nav buoy (owner decision 2026-11-20).
// Follows plan 18-06: ident now re-locks the nav buoy on the kill tick (owner decision 2026-11-20).
const HASH_60_AFTER_KILL = "f6927215";

/** The world's live debris by kind: pods, plates and wrecks. */
function debrisCounts(world: NonNullable<WorldLifecycle["world"]>): {
  readonly pods: number;
  readonly plates: number;
  readonly wrecks: number;
} {
  let pods = 0;
  let plates = 0;
  let wrecks = 0;
  for (const entity of world.store.live) {
    if (entity.dead) continue;
    if (entity.kind === "cargo" && entity.specKey === "barrel") pods += 1;
    if (entity.kind === "cargo" && entity.specKey === "alloy") plates += 1;
    if (entity.kind === "wreckage") wrecks += 1;
  }
  return { pods, plates, wrecks };
}

describe("the debris twin (plan 16-06, WORLD-17, D16-09)", () => {
  it("a hook-spawned shooter with cargo 20 dies into pods, wrecks and a plate through the real driver, with the hash pinned", () => {
    const s = session("?test=1&clock=manual&traffic=1", true, true);
    const state = s.ctx.core.state;
    const combat = s.ctx.core.combat;
    if (state === undefined || combat === undefined) {
      throw new Error("no state");
    }
    // The traffic content carries the compiled debris, as the boot builds it.
    expect(s.ctx.core.npcTraffic?.debris).toBeDefined();
    s.publisher.bindTestHook(state);
    const hook = s.probe.test;
    if (hook === undefined) throw new Error("no hook");
    const world = (): ReturnType<typeof liveWorldOf> => liveWorldOf(s);

    // The 15-04 twin's sequence: launch, park, heat and cool the fore laser.
    s.pending.push(launch);
    s.driver.advanceTicks(1);
    s.driver.advanceTicks(300);
    expect(state.mode).toBe("inFlight");
    hook.setSpeed(0);
    s.held.fire = true;
    s.driver.advanceTicks(30);
    s.held.fire = false;
    s.driver.advanceTicks(60);

    // Fire is held from the moment the shooter (with 20 capsules) spawns.
    expect(debrisCounts(world())).toEqual({ pods: 0, plates: 0, wrecks: 0 });
    s.held.fire = true;
    expect(hook.spawnTestShooter(20)).toBe(true);
    expect(
      world().store.live.filter(
        (entity) => entity.kind === "ship" && entity.cargo === 20,
      ),
    ).toHaveLength(1);
    expect(hook.tainted).toBe(true);
    expect(s.ctx.runtime.testTainted).toBe(true);
    const spawnTick = state.tick;
    const before = npcContacts(world()).length;
    s.driver.advanceTicks(360);
    s.pending.push({ kind: "ident" });
    s.driver.advanceTicks(2);

    // One tick at a time until the scanner loses a ship.
    const bound = spawnTick + 1500;
    let killTick = -1;
    while (state.tick < bound) {
      s.driver.advanceTicks(1);
      if (npcContacts(world()).length === before - 1) {
        killTick = state.tick;
        break;
      }
    }
    expect(killTick, "the kill landed before the bound").toBeGreaterThan(-1);
    // The cargo changes no combat value: the same relative kill tick as the
    // 15-04 twin.
    expect(killTick - spawnTick).toBe(KILL_OFFSET);

    // The kill tick released the debris: at least one pod, at most the pod
    // limit, at most three wrecks and one plate (debris.ts), and the probe's
    // entity count is the world's live count, debris included.
    s.publisher.updateProbe();
    const atKill = debrisCounts(world());
    expect(atKill.pods).toBeGreaterThanOrEqual(1);
    expect(atKill).toEqual(DEBRIS_AT_KILL);
    expect(s.probe.sim?.entities).toBe(liveEntityCount(world()));
    expect(s.probe.sim?.entities).toBe(ENTITIES_AT_KILL);

    // 60 ticks later: pods and the plate never expire; the hash is pinned for
    // the browser step of plan 16-09, which must reproduce it with the render
    // layers on (success criterion 3).
    s.held.fire = false;
    s.driver.advanceTicks(60);
    expect(state.tick - killTick).toBe(60);
    expect(debrisCounts(world()).pods).toBe(DEBRIS_AT_KILL.pods);
    expect(debrisCounts(world()).plates).toBe(DEBRIS_AT_KILL.plates);
    expect(hook.worldHash()).toBe(HASH_60_AFTER_KILL);
    expect(hook.worldHash()).toBe(sessionHash(s));
  });

  it.each([
    ["a negative count", -1],
    ["a fraction", 1.5],
    ["a count above MAX_ENTITY_CARGO", 201],
    ["NaN", Number.NaN],
    ["a string", "20"],
    ["an object", { cargo: 20 }],
  ] as const)(
    "the hook taints, refuses %s and spawns nothing (T-16-18)",
    (_name, cargo) => {
      const s = session("?test=1&clock=manual&traffic=1", true);
      const state = s.ctx.core.state;
      if (state === undefined) throw new Error("no state");
      s.publisher.bindTestHook(state);
      const hook = s.probe.test;
      if (hook === undefined) throw new Error("no hook");
      s.pending.push(launch);
      s.driver.advanceTicks(1);
      s.driver.advanceTicks(300);
      expect(state.mode).toBe("inFlight");
      const world = liveWorldOf(s);
      const count = liveEntityCount(world);
      const nextId = world.store.nextId;
      // Stepping the manual clock already tainted the session; clear the flag
      // so the hook's own taint is observable.
      s.ctx.runtime.testTainted = false;
      // The page may pass anything; the typing names a number only.
      expect(
        (hook.spawnTestShooter as (cargo?: unknown) => boolean)(cargo),
      ).toBe(false);
      expect(s.ctx.runtime.testTainted).toBe(true);
      expect(liveEntityCount(world)).toBe(count);
      expect(world.store.nextId).toBe(nextId);
    },
  );
});

// --- the CBT-08 fight (plan 19-13) -------------------------------------------
// BEGIN-SCAN-COPY: the plan's scan copies the code between this marker and
// the closing marker, so the pinned literals come from the code the twin runs.

/** The four F3 items the fight grants through the hook while docked (D-03). */
const DAMAGE_ITEMS = [
  "EQ_DOCK_COMP",
  "EQ_GAL_DRIVE",
  "EQ_ADVANCED_COMPASS",
  "EQ_ADVANCED_NAVIGATIONAL_ARRAY",
] as const;

/** What one CBT-08 fight measured. */
interface DamageFight {
  /** The result of each `grantEquipment`, in `DAMAGE_ITEMS` order. */
  readonly granted: readonly boolean[];
  readonly spawnTick: number;
  /** The tick the scanner lost the ship, or -1 when the bound ran out. */
  readonly killTick: number;
  /** The damaged list after the kill tick, in the order it was damaged. */
  readonly damagedAtKill: readonly string[];
  readonly equipmentAtKill: readonly string[];
  readonly debris: ReturnType<typeof debrisCounts>;
  readonly entities: number;
  /** The first `equipmentDamaged` the router handed `damageFlow`. */
  readonly first:
    | {
        readonly tickOffset: number;
        readonly key: string;
        readonly expectedMessage: string;
        readonly shownMessage: string;
      }
    | undefined;
  readonly damageKinds: readonly string[];
  readonly saveAttemptsBefore: number;
  readonly saveAttemptsAtKill: number;
  readonly damagedAt60: readonly string[];
  readonly hash60: string;
  readonly sessionHash60: string;
}

/**
 * The 15-04 sequence with the four F3 items granted while docked and
 * `delay` extra ticks between the cooled laser and the spawn: fire is held from
 * the spawn, the loop steps one tick at a time (so the tick of the first damage
 * is seen) and ident is engaged 360 ticks after the spawn, as the kill twin
 * does. Returns what was measured; asserts nothing.
 */
function runDamageFight(delay: number): DamageFight {
  const s = session("?test=1&clock=manual&traffic=1", true, true, true);
  const state = s.ctx.core.state;
  const combat = s.ctx.core.combat;
  if (state === undefined || combat === undefined) throw new Error("no state");
  s.publisher.bindTestHook(state);
  const hook = s.probe.test;
  if (hook === undefined) throw new Error("no hook");
  const world = (): ReturnType<typeof liveWorldOf> => liveWorldOf(s);

  // Docked: grant the four items through the hook (the only hook shortcut; the
  // damage itself comes from the shooter's hits through the ledger).
  const granted = DAMAGE_ITEMS.map((key) => hook.grantEquipment(key));

  s.pending.push(launch);
  s.driver.advanceTicks(1);
  s.driver.advanceTicks(300);
  hook.setSpeed(0);
  s.held.fire = true;
  s.driver.advanceTicks(30);
  s.held.fire = false;
  s.driver.advanceTicks(60);
  s.driver.advanceTicks(delay);

  s.held.fire = true;
  hook.spawnTestShooter();
  const spawnTick = state.tick;
  const saveAttemptsBefore = s.ctx.save.saveAttempts;
  const before = npcContacts(world()).length;
  const bound = spawnTick + 1500;
  let killTick = -1;
  let first: DamageFight["first"];
  while (state.tick < bound) {
    if (state.tick - spawnTick === 360) s.pending.push({ kind: "ident" });
    const damagedBefore = s.routed.filter(
      (kind) => kind === "equipmentDamaged",
    ).length;
    s.driver.advanceTicks(1);
    if (
      first === undefined &&
      s.routed.filter((kind) => kind === "equipmentDamaged").length >
        damagedBefore
    ) {
      const key = s.ctx.core.profile.damagedEquipment[0] ?? "";
      const name =
        equipmentCatalogue.find((record) => record.key === key)?.name ?? key;
      first = {
        tickOffset: state.tick - spawnTick,
        key,
        expectedMessage: formatDamageMessage(EQUIPMENT_DAMAGED_TEMPLATE, name),
        shownMessage: s.messages.current(state.flightTime),
      };
    }
    if (npcContacts(world()).length === before - 1) {
      killTick = state.tick;
      break;
    }
  }
  if (killTick === -1) {
    return {
      granted,
      spawnTick,
      killTick,
      damagedAtKill: s.ctx.core.profile.damagedEquipment,
      equipmentAtKill: s.ctx.core.profile.equipment,
      debris: debrisCounts(world()),
      entities: -1,
      first,
      damageKinds: s.routed.filter((kind) => kind === "equipmentDamaged"),
      saveAttemptsBefore,
      saveAttemptsAtKill: s.ctx.save.saveAttempts,
      damagedAt60: s.ctx.core.profile.damagedEquipment,
      hash60: "",
      sessionHash60: "",
    };
  }
  s.publisher.updateProbe();
  const damagedAtKill = s.ctx.core.profile.damagedEquipment;
  const equipmentAtKill = s.ctx.core.profile.equipment;
  const debris = debrisCounts(world());
  const entities = s.probe.sim?.entities ?? -1;
  const saveAttemptsAtKill = s.ctx.save.saveAttempts;
  s.held.fire = false;
  s.driver.advanceTicks(60);
  return {
    granted,
    spawnTick,
    killTick,
    damagedAtKill,
    equipmentAtKill,
    debris,
    entities,
    first,
    damageKinds: s.routed.filter((kind) => kind === "equipmentDamaged"),
    saveAttemptsBefore,
    saveAttemptsAtKill,
    damagedAt60: s.ctx.core.profile.damagedEquipment,
    hash60: hook.worldHash(),
    sessionHash60: sessionHash(s),
  };
}
// END-SCAN-COPY

/**
 * The CBT-08 twin's pins (plan 19-13, CBT-08, ROADMAP criterion 5), measured
 * through the real driver, router and probe publisher by the plan's scan over
 * the spawn delays 0 to 240 (one `SCAN-ROW` per delay, the full table in
 * 19-13-SUMMARY.md) and equal to the browser spec's `TWIN_DAMAGE_*` literals in
 * tests/e2e/combat.spec.ts. Every literal is what the chosen scan row printed,
 * none is derived to fit.
 *
 * The chosen delay is the smallest one whose row shows a kill, at least one
 * debris piece and exactly one damaged item: delay 1 (delay 0 damages nothing).
 * Its row: `kill=672 damaged=EQ_GAL_DRIVE debris=0/0/1 entities=13
 * hash60=5028fc8f first=613:EQ_GAL_DRIVE` (the first-damage offset is a
 * seventh literal the same row printed, so the browser can meet the damage on
 * its own tick). The kill offset equals the 15-04 twin's: the damage roll
 * draws from its own stream and changes no combat value.
 *
 * Which item the shooter's hits damage, and when, depends on the
 * `internalDamageSeed` formula and the `damage` stream (plan 19-02): a later
 * change to either re-rolls `DAMAGED_AT_KILL` and the hash. A re-pin then
 * follows the Phase 18 standing approval: the cause measured, Node equal to the
 * browser, the cause in the commit.
 */
/** The ticks held between the cooled laser and the shooter's spawn. */
const DAMAGE_SPAWN_DELAY = 1;
/** The kill tick relative to the spawn. */
const DAMAGE_KILL_OFFSET = 672;
/**
 * The tick of the first damage relative to the spawn (the scan row's
 * `first=613:EQ_GAL_DRIVE`): the HUD shows the message on that tick.
 */
const DAMAGE_FIRST_OFFSET = 613;
/** The damaged list after the kill tick (the one item, EQ_GAL_DRIVE). */
const DAMAGED_AT_KILL = ["EQ_GAL_DRIVE"] as const;
/** The debris live on the kill tick: the one wreck, no pod, no plate. */
const DAMAGE_DEBRIS_AT_KILL = { pods: 0, plates: 0, wrecks: 1 } as const;
const DAMAGE_ENTITIES_AT_KILL = 13;
/** The world hash 60 ticks after the kill, fire released. */
const DAMAGE_HASH_60_AFTER_KILL = "5028fc8f";

describe("the CBT-08 twin (plan 19-13, CBT-08)", () => {
  it("a hook-spawned fight destroys the shooter into its debris and leaves the player a damaged item", () => {
    const fight = runDamageFight(DAMAGE_SPAWN_DELAY);

    // The four F3 items were granted through the hook while docked.
    expect(fight.granted).toEqual([true, true, true, true]);

    // The kill landed before the bound (the vacuity guard) and at the pinned
    // offset from the spawn.
    expect(fight.killTick, "the kill landed before the bound").toBeGreaterThan(
      -1,
    );
    expect(fight.killTick - fight.spawnTick).toBe(DAMAGE_KILL_OFFSET);

    // The player's ship leaves with a damaged item: the profile's list (the
    // world hash never covers it), and none of those keys stays installed.
    expect(fight.damagedAtKill).toEqual(DAMAGED_AT_KILL);
    expect(fight.damagedAtKill.length).toBeGreaterThanOrEqual(1);
    for (const key of fight.damagedAtKill) {
      expect(fight.equipmentAtKill).not.toContain(key);
    }
    expect([...fight.equipmentAtKill, ...fight.damagedAtKill].sort()).toEqual(
      [...DAMAGE_ITEMS].sort(),
    );

    // The enemy ship is destroyed with its debris, not vacuously.
    expect(fight.debris).toEqual(DAMAGE_DEBRIS_AT_KILL);
    expect(
      fight.debris.pods + fight.debris.plates + fight.debris.wrecks,
    ).toBeGreaterThanOrEqual(1);
    expect(fight.entities).toBe(DAMAGE_ENTITIES_AT_KILL);

    // The damage arrived the way it does in play: the router handed the event to
    // damageFlow, and on that tick the HUD showed "<name> damaged.".
    expect(fight.damageKinds).toContain("equipmentDamaged");
    if (fight.first === undefined) throw new Error("no damage event");
    expect(fight.first.key).toBe(DAMAGED_AT_KILL[0]);
    expect(fight.first.expectedMessage).toMatch(/ damaged\.$/);
    expect(fight.first.shownMessage).toBe(fight.first.expectedMessage);
    expect(fight.first.tickOffset).toBe(DAMAGE_FIRST_OFFSET);

    // D-11: damage reaches the profile without any save attempt.
    expect(fight.saveAttemptsAtKill).toBe(fight.saveAttemptsBefore);

    // 60 ticks after the kill: the damaged list is unchanged (asserted on the
    // profile, separately from the hash) and the hash is the pinned one.
    expect(fight.damagedAt60).toEqual(DAMAGED_AT_KILL);
    expect(fight.hash60).toBe(DAMAGE_HASH_60_AFTER_KILL);
    expect(fight.hash60).toBe(fight.sessionHash60);
  });
});

describe("the sim hook reads live objects (G-8)", () => {
  function spawnInto(world: ReturnType<typeof liveWorld>): void {
    const spawned = spawnEntity(
      world,
      {
        kind: "ship",
        specKey: "viper",
        scanClass: "CLASS_POLICE",
        position: vec(0, 0, 0),
        orientation: identity(),
        radius: 1,
      },
      0,
    );
    expect(spawned.ok && spawned.entity.id).toBe(101);
  }

  function liveWorld(lifecycle: WorldLifecycle) {
    const world = lifecycle.world;
    if (world === undefined) throw new Error("no world");
    return world;
  }

  it("worldHash hashes the replaced state and world, and neither taints nor requests a redraw", () => {
    const s = session("?test=1");
    const first = s.ctx.core.state;
    if (first === undefined) throw new Error("no state");
    s.lifecycle.begin(LAVE_SEED);
    s.publisher.bindTestHook(first);
    const hook = s.probe.test;
    if (hook === undefined) throw new Error("no hook");
    const oldHash = hook.worldHash();
    expect(oldHash).toBe(hashWorld(first, s.lifecycle.world));

    // Replace the state and the world, and spawn into the new world.
    const second = initFlightState(lave.layout);
    second.speed = 11;
    s.ctx.core.state = second;
    s.lifecycle.begin(LAVE_SEED);
    spawnInto(liveWorld(s.lifecycle));
    const keys = [second];
    settle(s.gate, keys);
    expect(s.gate.next(true, keys)).toBe(false);

    const next = hook.worldHash();

    expect(next).toBe(hashWorld(second, s.lifecycle.world));
    expect(next).not.toBe(oldHash);
    expect(s.ctx.runtime.testTainted).toBe(false);
    expect(s.gate.next(true, keys)).toBe(false);
  });

  it("a mutation still taints after createTestHook gained its sim parameter", () => {
    const s = session("?test=1");
    const state = s.ctx.core.state;
    if (state === undefined) throw new Error("no state");
    s.publisher.bindTestHook(state);
    const keys = [state];
    settle(s.gate, keys);

    s.probe.test?.setSpeed(42);

    expect(state.speed).toBe(42);
    expect(s.ctx.runtime.testTainted).toBe(true);
    expect(s.gate.next(true, keys)).toBe(true);
  });

  it("under plain ?test=1 advanceTicks is a function that refuses: no step, no taint, no redraw", () => {
    const s = session("?test=1");
    const state = s.ctx.core.state;
    if (state === undefined) throw new Error("no state");
    s.publisher.bindTestHook(state);
    const hook = s.probe.test;
    expect(typeof hook?.advanceTicks).toBe("function");
    expect(typeof hook?.worldHash).toBe("function");
    const keys = [state];
    settle(s.gate, keys);
    const tickBefore = state.tick;

    expect(hook?.advanceTicks(5)).toBe(tickBefore);
    expect(hook?.advanceTicks(100000)).toBe(tickBefore);

    expect(state.tick).toBe(tickBefore);
    expect(s.ctx.runtime.testTainted).toBe(false);
    expect(s.gate.next(true, keys)).toBe(false);
  });

  it("under the manual clock advanceTicks steps through the hook and taints", () => {
    const s = session("?test=1&clock=manual");
    const state = s.ctx.core.state;
    if (state === undefined) throw new Error("no state");
    s.publisher.bindTestHook(state);

    expect(s.probe.test?.advanceTicks(5)).toBe(5);

    expect(state.tick).toBe(5);
    expect(s.ctx.runtime.testTainted).toBe(true);
  });

  it("a retained hook returns the empty sentinel after dispose and without a state", () => {
    const s = session("?test=1");
    const state = s.ctx.core.state;
    if (state === undefined) throw new Error("no state");
    s.publisher.bindTestHook(state);
    const hook = s.probe.test;
    if (hook === undefined) throw new Error("no hook");
    expect(hook.worldHash()).toMatch(/^[0-9a-f]{8}$/);

    s.ctx.runtime.disposed = true;
    expect(() => hook.worldHash()).not.toThrow();
    expect(hook.worldHash()).toBe("");

    s.ctx.runtime.disposed = false;
    s.ctx.core.state = undefined;
    expect(() => hook.worldHash()).not.toThrow();
    expect(hook.worldHash()).toBe("");
  });
});

describe("probe.sim", () => {
  it("publishes primitives only, never a reference into the world, and is immune to mutation", () => {
    const s = session("?test=1&clock=manual&traffic=1");
    const state = s.ctx.core.state;
    if (state === undefined) throw new Error("no state");
    s.lifecycle.begin(LAVE_SEED);
    const world = s.lifecycle.world;
    if (world === undefined) throw new Error("no world");
    spawnEntity(
      world,
      {
        kind: "ship",
        specKey: "viper",
        scanClass: "CLASS_POLICE",
        position: vec(0, 0, 0),
        orientation: identity(),
        radius: 1,
      },
      0,
    );
    s.publisher.bindTestHook(state);

    s.publisher.updateProbe();

    const sim = s.probe.sim;
    if (sim === undefined) throw new Error("no probe.sim");
    expect(sim).toEqual({
      tick: 0,
      epoch: 1,
      entities: 1,
      worldLive: true,
      traffic: true,
      clock: "manual",
    });
    expect(typeof sim.entities).toBe("number");
    for (const value of Object.values(sim)) {
      expect(["number", "boolean", "string"]).toContain(typeof value);
    }

    const hashBefore = s.probe.test?.worldHash();
    sim.entities = 999;
    expect(liveEntityCount(world)).toBe(1);
    expect(s.probe.test?.worldHash()).toBe(hashBefore);
    s.probe.sim = {
      tick: -1,
      epoch: -1,
      entities: -1,
      worldLive: false,
      traffic: false,
      clock: "realtime",
    };
    expect(liveEntityCount(world)).toBe(1);
    expect(s.probe.test?.worldHash()).toBe(hashBefore);
  });

  it("reports the flags, and no world while docked", () => {
    const s = session("?test=1");
    s.publisher.updateProbe();
    expect(s.probe.sim).toEqual({
      tick: 0,
      epoch: 0,
      entities: 0,
      worldLive: false,
      traffic: false,
      clock: "realtime",
    });

    const plain = session("?clock=manual&traffic=0");
    plain.publisher.updateProbe();
    expect(plain.probe.sim?.clock).toBe("realtime");
    expect(plain.probe.sim?.traffic).toBe(true);
  });

  it("is absent without a state and withdrawn by withdrawProbe", () => {
    const s = session("?test=1");
    s.publisher.updateProbe();
    expect(s.probe.sim).toBeDefined();

    s.ctx.core.state = undefined;
    s.publisher.updateProbe();
    expect(s.probe.sim).toBeUndefined();

    s.ctx.core.state = initFlightState(lave.layout);
    s.publisher.updateProbe();
    expect(s.probe.sim).toBeDefined();
    s.publisher.withdrawProbe();
    expect(s.probe.sim).toBeUndefined();
  });

  it("the session sources keep exactly five redraw requests", () => {
    let requests = 0;
    for (const file of sessionSourceFiles()) {
      const text = readFileSync(file, "utf8");
      requests += text.split("redrawGate.request();").length - 1;
    }
    expect(requests).toBe(5);
  });
});
