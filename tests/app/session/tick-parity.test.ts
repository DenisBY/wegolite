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
  createEventRouter,
  createHudMessages,
  createHyperspaceFlow,
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
import type { NpcShip, System } from "../../../src/content/types.js";
import type { KeyboardInputSource } from "../../../src/input/keyboard.js";
import { createMessageQueue } from "../../../src/render/hud/messages.js";
import type { MessageQueue } from "../../../src/render/hud/messages.js";
import type { Command } from "../../../src/sim/commands.js";
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
import { hashWorld } from "../../../src/sim/world/serialize.js";
import { deriveSystemLayout } from "../../../src/sim/world/layout.js";
import { liveEntityCount, spawnEntity } from "../../../src/sim/world/world.js";
import { commoditiesFixture } from "../../helpers/commodities.js";
import { laveDockGeometry } from "../../helpers/dock-pose.js";
import { laveFixture } from "../../helpers/lave.js";
import { realHullTable } from "../../helpers/hull-table.js";
import { sessionSourceFiles } from "../../helpers/session-source.js";
import { runTickScript } from "../../helpers/tick-script.js";

const lave = laveFixture();
const catalogue = commoditiesFixture();
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
 */
function session(
  search: string,
  populated = false,
  hudRouting = false,
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
    );
    // The hull table the boot load builds beside the NPC catalogue.
    ctx.core.hulls = realHullTable();
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
  const messages = createMessageQueue(4);
  const quiet = (): void => undefined;
  const routed: string[] = [];
  const hudMessages = hudRouting
    ? (() => {
        const real = createHudMessages({ galaxyById, messages }, ctx);
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
    launchSequence: { advance: () => "flash" },
    router: createEventRouter(ctx, {
      stationFlow: quiet,
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
    commitProfile: () => false,
    swapSystem: () => Promise.resolve(),
    disposeSystem: () => undefined,
    advanceTicks: (n) => driver.advanceTicks(n),
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
    // The 14th pulse hit is lethal at spawn + 1 + 13 * 61 (measured: 794).
    expect(killTick - spawnTick).toBe(794);
    // The bank still paid for every shot: no refusal reached the HUD, and the
    // bank at the kill is above a floor under the modelled minimum of 20 (the
    // measured value is about 50), so a drift of a few shooter hits fails here.
    expect(s.routed.slice(routedAtSpawn)).not.toContain("laserRefused");
    expect(combat.energy).toBeGreaterThanOrEqual(16);
    // The lock on the destroyed ship ends on the kill tick with identLost and
    // no fresh lock follows in this world: "Target lost." is what shows.
    const kindsOfKillTick = s.routed.slice(routedBeforeKillTick);
    expect(kindsOfKillTick).toContain("identLost");
    expect(kindsOfKillTick).not.toContain("identLocked");
    expect(s.messages.current(state.flightTime)).toBe("Target lost.");
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
