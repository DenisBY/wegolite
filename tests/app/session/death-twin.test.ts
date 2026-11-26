// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The Node twin of the browser death (plan 20-09; DEATH-01, DEATH-06, D-14,
 * D-16).
 *
 * Node only. The real sim driver, router (with its latch-only `deathFlow`),
 * world lifecycle and probe publisher run over a fake session context, as in
 * the combat twin of `tick-parity.test.ts`, but the session starts the way a
 * browser Continue does: the blob of `inFlightSaveAt("Lave", DEATH_RAM_POSE,
 * "Diso", ...)` goes through the production parser (`parseSave`) and
 * `restoreFromSave`, the profile comes from `profileFromSave`, and the world is
 * rebuilt by `restoreWorldAnchor` (an in-flight Continue resumes the world from
 * the market seed without a bump). The twin then steps the manual clock with
 * zero input, so its tick and cause are what `tests/e2e/death-and-reload.spec.ts`
 * and `tests/e2e/game-over-guard.spec.ts` read in a real browser.
 *
 * The route is the full-speed ram into the Lave nav buoy (RESEARCH Open
 * Question 5, resolved; orchestrator ruling 2026-11-22): plan 20-01 measured the
 * 350 m/s nose-on ram from full shields and bank as lethal on a bare world, and
 * this twin confirms it on the real restore path, with the traffic world on, the
 * session's step options and the bank and shields a restored save always starts
 * with (a combat state is not saved). The pins are `DEATH_TICK_OFFSET`, the death
 * tick relative to the restored tick, and `DEATH_CAUSE`, the cause with the
 * culprit pinned so traffic crossing the path would show. The browser specs
 * repeat both as `TWIN_DEATH_TICK_OFFSET` and `TWIN_DEATH_CAUSE`; never edit them
 * to make the browser pass: a difference is a divergence to report.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createLaunchSequence } from "../../../src/app/launch-sequence.js";
import { createRedrawGate } from "../../../src/app/redraw-gate.js";
import type { WegoliteProbe } from "../../../src/app/probe.js";
import { createSessionState } from "../../../src/app/session/context.js";
import type { SessionState } from "../../../src/app/session/context.js";
import {
  createDeathFlow,
  createEventRouter,
  createHyperspaceFlow,
} from "../../../src/app/session/event-router.js";
import type { EventRouter } from "../../../src/app/session/event-router.js";
import { createHyperspaceController } from "../../../src/app/session/hyperspace-controller.js";
import type { HyperspaceControllerDeps } from "../../../src/app/session/hyperspace-controller.js";
import { createProbePublisher } from "../../../src/app/session/probe-publisher.js";
import { createSimDriver } from "../../../src/app/session/sim-driver.js";
import type { SimDriver } from "../../../src/app/session/sim-driver.js";
import { parseTestFlags } from "../../../src/app/session/test-flags.js";
import {
  createSystemPopulate,
  trafficContent,
} from "../../../src/app/session/traffic.js";
import {
  createWorldLifecycle,
  restoreWorldAnchor,
} from "../../../src/app/session/world-lifecycle.js";
import type { WorldLifecycle } from "../../../src/app/session/world-lifecycle.js";
import { parseEquipment } from "../../../src/content/equipment.js";
import { ExplosionCatalogueSchema } from "../../../src/content/schemas/explosion.js";
import { DebrisCatalogueSchema } from "../../../src/content/schemas/ship-debris.js";
import type { NpcShip, System } from "../../../src/content/types.js";
import type { KeyboardInputSource } from "../../../src/input/keyboard.js";
import {
  profileFromSave,
  restoreFromSave,
} from "../../../src/persistence/autosave.js";
import {
  equipmentAllowLists,
  parseSave,
} from "../../../src/persistence/save.js";
import type { SaveV5 } from "../../../src/persistence/save.js";
import { createMessageQueue } from "../../../src/render/hud/messages.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import type { Command } from "../../../src/sim/commands.js";
import type { SimEvent } from "../../../src/sim/events.js";
import {
  PlayerController,
  ScriptedLaunchController,
} from "../../../src/sim/flight/controller.js";
import { marketSeedForSystem } from "../../../src/sim/economy/market.js";
import { generateMarket } from "../../../src/sim/economy/market.js";
import type { PlayerDeathCause } from "../../../src/sim/events.js";
import { PLAYER_ID } from "../../../src/sim/world/ids.js";
import { deriveSystemLayout } from "../../../src/sim/world/layout.js";
import { commoditiesFixture } from "../../helpers/commodities.js";
import { laveDockGeometry } from "../../helpers/dock-pose.js";
import { fullHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";
import { saveAllowLists } from "../../helpers/save-builders.js";
import {
  DEATH_RAM_POSE,
  DEATH_RAM_RUN_UP_M,
  DEATH_SEED_ITEMS,
  DEATH_TARGET,
  inFlightSaveAt,
} from "../../e2e/helpers/save-fixtures.js";

const lave = laveFixture();
const catalogue = commoditiesFixture();
/** The browser's manual-clock URL with traffic on (the specs' URL). */
const TWIN_URL = "?test=1&traffic=1&clock=manual";

/**
 * The death tick relative to the restored tick: the ram's sim time at 350 m/s
 * over `DEATH_RAM_POSE`'s 5,000 m to the buoy, less the Cobra's nose and the
 * buoy's hull (the contact is 94.17 m from the buoy's centre), 14.02 s at
 * 120 Hz. Measured on this twin (printed once, then pinned); the browser specs
 * repeat it as `TWIN_DEATH_TICK_OFFSET`.
 */
const DEATH_TICK_OFFSET = 1682;
/** The cause of the lethal record; the culprit is the nav buoy's ident key. */
const DEATH_CAUSE: PlayerDeathCause = { damage: "scrape", culprit: "buoy" };
/** The ticks per simulated second (`DT` is 1/120 s). */
const TICKS_PER_SECOND = 120;
/** The facing shield and the bank a restored save starts with (not saved). */
const FULL_SHIELD = 128;
const FULL_BANK = 256;

const equipmentCatalogue = parseEquipment(
  JSON.parse(
    readFileSync(
      new URL("../../../src/content/generated/equipment.json", import.meta.url),
      "utf8",
    ),
  ) as unknown,
);
const galaxy = JSON.parse(
  readFileSync(
    new URL("../../../src/content/generated/systems/g0.json", import.meta.url),
    "utf8",
  ),
) as System[];
const galaxyById = new Map(galaxy.map((entry) => [entry.id, entry]));

interface Twin {
  readonly ctx: SessionState;
  readonly driver: SimDriver;
  readonly lifecycle: WorldLifecycle;
  readonly probe: WegoliteProbe;
  /** Every sim event the router was handed, in order. */
  readonly events: SimEvent[];
  /** The save the session restored from, as the production parser read it. */
  readonly save: SaveV5;
  /** The restored tick (the sim's first tick of this Continue). */
  readonly restoredTick: number;
}

/**
 * A Continue of the seeded in-flight save over the real driver, router,
 * lifecycle and probe publisher, with traffic on and the real hull table.
 */
function continueSeed(): Twin {
  const raw = inFlightSaveAt(
    "Lave",
    DEATH_RAM_POSE,
    DEATH_TARGET,
    DEATH_SEED_ITEMS,
  );
  const allow = saveAllowLists({
    ...equipmentAllowLists(equipmentCatalogue),
    systems: new Set(galaxy.map((entry) => entry.id)),
  });
  const parsed = parseSave(raw, allow);
  if (!parsed.ok) throw new Error(`the seed does not parse: ${parsed.reason}`);
  const save = parsed.save;
  const restored = restoreFromSave(save, lave.layout, profileFromSave);

  const ctx = createSessionState({
    system: lave.system,
    saveStatus: "absent",
    saveSkipReason: "",
  });
  ctx.core.state = restored.state;
  // As start-up does beside the restored flight state: a pristine combat state
  // (full shields and bank; a combat state is not saved).
  ctx.core.combat = createPlayerCombatState();
  ctx.core.layout = lave.layout;
  ctx.core.config = lave.config;
  ctx.core.dockGeometry = laveDockGeometry();
  ctx.core.stationDef = lave.stationDef;
  ctx.core.commodities = catalogue;
  ctx.core.profile = restored.profile;
  ctx.core.hyperspaceTargetId = save.targetSystem;
  ctx.core.marketSeed =
    restored.market?.seed ??
    restored.marketSeed ??
    marketSeedForSystem(lave.system.id);
  ctx.core.market =
    restored.market ??
    generateMarket(lave.system, catalogue, ctx.core.marketSeed);
  ctx.runtime.testFlags = parseTestFlags(TWIN_URL);
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
  ctx.core.hulls = fullHullTable();
  const lifecycle = createWorldLifecycle({
    traffic: true,
    // Plan 22-13 (WORLD-08): the session's populate is the system populator, so
    // the twin populates the Lave world with it, as the browser will (22-14).
    populate: createSystemPopulate(
      () => ctx.core.npcTraffic,
      () => ctx.core.layout,
      () => ctx.core.system,
      () => galaxy,
    ),
  });
  ctx.core.worldLifecycle = lifecycle;
  // The Continue's anchor: the saved epoch, then the in-flight world rebuilt
  // from the market seed without a bump (start-session.ts).
  restoreWorldAnchor(lifecycle, save.epoch, ctx.core.marketSeed, true);
  ctx.runtime.input = {
    drainCommands: () => [],
    // The game-over latch clears the held keys (D-07).
    clearAll: () => undefined,
    frame: () => ({ pitch: 0, roll: 0, speed: 0, precision: false }),
  } as unknown as KeyboardInputSource;

  const pending: Command[] = [];
  const messages = createMessageQueue();
  const quiet = (): void => undefined;
  const events: SimEvent[] = [];
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
  const inner = createEventRouter(ctx, {
    stationFlow: quiet,
    damageFlow: quiet,
    hudMessages: quiet,
    dockFeedback: quiet,
    hyperspaceFlow: createHyperspaceFlow(ctx, {
      messages,
      refusalCopy: controller.refusalCopy,
      handleHyperspaceJumped: controller.handleHyperspaceJumped,
    }),
    deathFlow: createDeathFlow(ctx),
  });
  const router: EventRouter = {
    dispatch(event) {
      events.push(event);
      inner.dispatch(event);
    },
  };
  const bound: { publisher?: ReturnType<typeof createProbePublisher> } = {};
  const driver = createSimDriver(ctx, {
    pending,
    player: new PlayerController(),
    scripted: new ScriptedLaunchController(),
    launchSequence: createLaunchSequence(() => 0),
    onPreRollStart: () => undefined,
    router,
    equipmentSet: () => new Set(ctx.core.profile.equipment),
    targetSystem: () => controller.targetSystem(),
    autosave: quiet,
    markHookMutation: () => {
      bound.publisher?.markHookMutation();
    },
  });
  const probe = {} as WegoliteProbe;
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
  } as const;
  const publisher = createProbePublisher(ctx, {
    probe,
    renderer: {
      info: {
        render: { calls: 0, triangles: 0, frame: 0 },
        memory: { geometries: 0, textures: 0 },
        programs: [],
      },
    } as never,
    scenes: { quality: () => "standard" },
    saveProbe: { ...saveProbe },
    redrawGate: createRedrawGate(),
    messages,
    commitProfile: () => false,
    swapSystem: () => Promise.resolve(),
    disposeSystem: () => undefined,
    advanceTicks: (n) => driver.advanceTicks(n),
    launchSequence: { preRolling: false, preRollElapsed: 0 },
  });
  bound.publisher = publisher;
  return {
    ctx,
    driver,
    lifecycle,
    probe,
    events,
    save,
    restoredTick: restored.state.tick,
  };
}

/** The upper bound of the run: the ram's ~2 000 ticks, never a think count. */
const RUN_BOUND_TICKS = 4000;

/** Step one tick at a time to the death; the bound is a correctness fence. */
function runToDeath(twin: Twin): number {
  const { ctx, driver } = twin;
  for (let n = 0; n < RUN_BOUND_TICKS; n += 1) {
    driver.advanceTicks(1);
    if (ctx.core.state?.mode === "dead") return ctx.core.state.tick;
  }
  return -1;
}

describe("the death twin (plan 20-09, DEATH-01, D-14, D-16)", () => {
  it("the seed is the nav buoy's +Z side, 5,000 m out, nose on, at 350 m/s", () => {
    const buoy = lave.layout.navBuoy.position;
    const [x, y, z] = DEATH_RAM_POSE.position;
    expect(x).toBeCloseTo(buoy.x, 6);
    expect(y).toBeCloseTo(buoy.y, 6);
    expect(z - buoy.z).toBeCloseTo(DEATH_RAM_RUN_UP_M, 6);
    // At least 5 km out: no wall-clock race for the real-time spec (T-20-39).
    expect(
      Math.hypot(x - buoy.x, y - buoy.y, z - buoy.z),
    ).toBeGreaterThanOrEqual(5000);
    // The identity orientation looks along -Z, at the buoy.
    expect(DEATH_RAM_POSE.orientation).toEqual([1, 0, 0, 0]);
    expect(DEATH_RAM_POSE.speed).toBe(350);
  });

  it("a Continue of the seed restores the flight, the lists, the target and the full shields and bank", () => {
    const { ctx, save, restoredTick, lifecycle } = continueSeed();
    const state = ctx.core.state;
    const combat = ctx.core.combat;
    if (state === undefined || combat === undefined) {
      throw new Error("no state");
    }
    expect(state.mode).toBe("inFlight");
    expect(restoredTick).toBe(0);
    expect(state.position).toEqual({
      x: DEATH_RAM_POSE.position[0],
      y: DEATH_RAM_POSE.position[1],
      z: DEATH_RAM_POSE.position[2],
    });
    expect(state.speed).toBe(350);
    expect(save.damagedEquipment).toEqual(["EQ_DOCK_COMP"]);
    expect(ctx.core.profile.damagedEquipment).toEqual(["EQ_DOCK_COMP"]);
    expect(ctx.core.profile.equipment).toEqual(["EQ_CARGO_BAY"]);
    expect(ctx.core.hyperspaceTargetId).toBe(save.targetSystem);
    // A combat state is not saved: the bank and the shields start full, which
    // is what the ram's lethality is measured against.
    expect(combat.fwdShield).toBe(FULL_SHIELD);
    expect(combat.energy).toBe(FULL_BANK);
    // The in-flight Continue rebuilt the traffic world without a bump.
    expect(lifecycle.epoch).toBe(0);
    // Re-pinned once in plan 22-13 (WORLD-08, owner-sanctioned under the Phase 21
    // D-04 standing approval) from 113 (the 12 inert ships at ids 101 to 112): the
    // twin populates through the system populator, and Lave at epoch 0, which the
    // census does not cover (epochs 1 to 20), holds 16 ships, ids 101 to 116.
    // Measured. The death tick and the cause do not move: the ram still meets
    // only the nav buoy.
    expect(lifecycle.world?.store.nextId).toBe(117);
  });

  it("the ram kills the restored player at DEATH_TICK_OFFSET with DEATH_CAUSE, from full shields and bank", () => {
    const twin = continueSeed();
    const { ctx, events, restoredTick } = twin;
    const state = ctx.core.state;
    const combat = ctx.core.combat;
    if (state === undefined || combat === undefined) {
      throw new Error("no state");
    }
    const deathTick = runToDeath(twin);
    // The run ended on the death, not on its bound (the vacuity guard).
    expect(deathTick).toBeGreaterThan(-1);
    expect(state.mode).toBe("dead");
    expect(deathTick - restoredTick).toBe(DEATH_TICK_OFFSET);
    // No wall-clock race: the death is at least 13 s of sim time after the
    // Continue, so a real-time session's baselines and held key come first.
    expect(DEATH_TICK_OFFSET / TICKS_PER_SECOND).toBeGreaterThanOrEqual(13);

    const deaths = events.filter(
      (event): event is Extract<SimEvent, { kind: "playerDestroyed" }> =>
        event.kind === "playerDestroyed",
    );
    expect(deaths.map((event) => event.cause)).toEqual([DEATH_CAUSE]);
    expect(ctx.runtime.gameOver).toBe(true);
    expect(ctx.runtime.gameOverCause).toEqual(DEATH_CAUSE);

    // The lethality is the ram's own: the hit on the player is past the
    // forward shield and the whole bank (20-01 measured 1711.793 from 400 m).
    const playerHits = events.filter(
      (event): event is Extract<SimEvent, { kind: "shipHit" }> =>
        event.kind === "shipHit" && event.target === PLAYER_ID,
    );
    expect(playerHits).toHaveLength(1);
    expect(playerHits[0]?.amount).toBeGreaterThan(FULL_SHIELD + FULL_BANK);
    expect(combat.energy).toBe(0);
    // The buoy dies with it (dam2 526 against its 250), credited to the player.
    expect(
      events.filter((event) => event.kind === "shipDestroyed"),
    ).toHaveLength(1);
  });

  it("the browser's call pattern lands on the same tick: chunks of advanceTicks stop at the death, and a further advanceTicks returns it", () => {
    const twin = continueSeed();
    const { ctx, driver, restoredTick } = twin;
    const CHUNK = 100;
    let tick = restoredTick;
    for (let n = 0; n < RUN_BOUND_TICKS / CHUNK; n += 1) {
      tick = driver.advanceTicks(CHUNK);
      if (ctx.core.state?.mode === "dead") break;
    }
    expect(ctx.core.state?.mode).toBe("dead");
    expect(tick - restoredTick).toBe(DEATH_TICK_OFFSET);
    // 20-06's refusal: a latched game over steps nothing and returns the tick.
    expect(driver.advanceTicks(10)).toBe(tick);
    expect(ctx.core.state?.tick).toBe(tick);
  });
});
