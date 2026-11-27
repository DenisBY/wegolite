// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The app half of the player's death (DEATH-01, DEATH-06, D-01, D-08, D-12).
 *
 * Node only, no DOM. The events come from a real lethal `resolveShots` tick (the
 * fixture of `tests/sim/combat/death.test.ts`: a Viper's beam against a player
 * with no forward shield and 3 energy), dispatched through the real router. The
 * save controller is the real one on a recording store double, so the latch
 * and the refusals are asserted on what reaches the store, not on a flag.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { GameLoop } from "../../../src/app/game-loop.js";
import { createSessionState } from "../../../src/app/session/context.js";
import type { SessionState } from "../../../src/app/session/context.js";
import {
  PLAYER_EXPLOSION_FACTOR,
  PLAYER_EXPLOSION_SETTINGS,
  createDeathFlow,
  createEventRouter,
  latchGameOver,
} from "../../../src/app/session/event-router.js";
import type { DeathFlowDeps } from "../../../src/app/session/event-router.js";
import { createSaveController } from "../../../src/app/session/save-controller.js";
import type { SaveController } from "../../../src/app/session/save-controller.js";
import type { TrafficContent } from "../../../src/app/session/traffic.js";
import { createWorldLifecycle } from "../../../src/app/session/world-lifecycle.js";
import { ExplosionCatalogueSchema } from "../../../src/content/schemas/explosion.js";
import type { ExplosionAddOptions } from "../../../src/render/bodies/explosions.js";
import type { SystemScene } from "../../../src/render/system-scene.js";
import { PLAYER_COLLISION_RADIUS_M } from "../../../src/sim/npc/stats.js";
import type { KeyboardInputSource } from "../../../src/input/keyboard.js";
import type { Labels } from "../../../src/content/schemas/labels.js";
import type {
  GameOverLines,
  GameOverOverlay,
} from "../../../src/ui/game-over.js";
import type {
  SaveStatus,
  SaveStore,
  WriteResult,
} from "../../../src/persistence/store.js";
import { npcLaserRay } from "../../../src/sim/combat/aim.js";
import type { NpcWeapon, NpcWeapons } from "../../../src/sim/combat/aim.js";
import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import type { PlayerCombatState } from "../../../src/sim/combat/state.js";
import { resolveShots } from "../../../src/sim/combat/step.js";
import type { ShotRequest } from "../../../src/sim/combat/step.js";
import type { SimEvent } from "../../../src/sim/events.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { stepFlight } from "../../../src/sim/flight/step.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import { generateMarket } from "../../../src/sim/economy/market.js";
import { identity, vec } from "../../../src/sim/math.js";
import type { Quat, Vec3 } from "../../../src/sim/math.js";
import { DT } from "../../../src/sim/time.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { commoditiesFixture } from "../../helpers/commodities.js";
import { realHullTable } from "../../helpers/hull-table.js";
import { listSrcFiles } from "../../guards/source-scan.js";
import { laveFixture } from "../../helpers/lave.js";
import { saveAllowLists } from "../../helpers/save-builders.js";

const lave = laveFixture();
const { system, layout, stationDef, config } = lave;
const HULLS = realHullTable();
const catalogue = commoditiesFixture();
const MARKET_SEED = 0x12345678;
const market = generateMarket(system, catalogue, MARKET_SEED);

/** Far from the station and the planet, so nothing mass-locks the player. */
const FAR = vec(1e7, 0, 0);

/** Turned half a turn about up: the ship's nose points at +Z. */
const FACING_PLUS_Z: Quat = { w: 0, x: 0, y: 1, z: 0 };

/** The Viper's forward weapon as `ships-npc.json` carries it. */
const VIPER_BEAM: NpcWeapon = {
  laser: "EQ_WEAPON_BEAM_LASER",
  offset: vec(0, -0.15000000596046448, 35.034400939941406),
};

function stepOptions(): StepOptions {
  return {
    combat: {
      mounts: DEFAULT_LASER_MOUNTS,
      hulls: HULLS,
      npcWeapons: new Map<string, NpcWeapons>([
        ["viper", { fore: VIPER_BEAM }],
      ]),
    },
  };
}

/** A player launched, skipped to flight, parked at `FAR` and facing -Z. */
function flyingPlayer(): FlightState {
  const state = initFlightState(layout);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "skipLaunch" }], DT);
  state.position = FAR;
  state.orientation = identity();
  state.speed = 0;
  return state;
}

function spawnViper(world: World, position: Vec3): number {
  const result = spawnEntity(
    world,
    {
      kind: "ship",
      specKey: "viper",
      scanClass: "CLASS_NEUTRAL",
      position,
      orientation: FACING_PLUS_Z,
      radius: 30,
      maxEnergy: 180,
    },
    0,
  );
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return result.entity.id;
}

/**
 * The events of one real lethal tick: a Viper 1,500 m ahead fires at a player
 * with no forward shield and 3 energy, and the tick kills it (`killPlayer`).
 */
function lethalTick(player: FlightState): SimEvent[] {
  const combat: PlayerCombatState = createPlayerCombatState();
  combat.fwdShield = 0;
  combat.energy = 3;
  const world = createWorld(7);
  const id = spawnViper(world, vec(FAR.x, FAR.y, FAR.z - 1500));
  const entity = world.store.get(id);
  if (entity === undefined) throw new Error("no viper");
  const ray = npcLaserRay(entity, VIPER_BEAM);
  if (ray === null) throw new Error("the weapon has no ray");
  const shot: ShotRequest = {
    shooter: id,
    ray,
    laser: "EQ_WEAPON_BEAM_LASER",
  };
  return resolveShots(
    world,
    true,
    player,
    combat,
    [shot],
    stepOptions(),
    DT,
    layout,
  );
}

function flush(): Promise<void> {
  return new Promise((done) => setTimeout(done, 0));
}

interface Session {
  readonly ctx: SessionState;
  readonly controller: SaveController;
  readonly router: ReturnType<typeof createEventRouter>;
  readonly writes: { json: string; revision: number }[];
  readonly log: string[];
  readonly writeResult: { current: Promise<WriteResult> };
}

/** The real router and the real save controller on one context. */
function session(): Session {
  const ctx = createSessionState({
    system,
    saveStatus: "absent",
    saveSkipReason: "",
  });
  const log: string[] = [];
  const writes: { json: string; revision: number }[] = [];
  const writeResult = {
    current: Promise.resolve<WriteResult>({ committed: true, revision: 1 }),
  };
  ctx.core.worldLifecycle = createWorldLifecycle({ traffic: false });
  ctx.core.state = initFlightState(layout);
  ctx.core.stationDef = stationDef;
  ctx.core.stationKey = "coriolis-station";
  ctx.core.commodities = catalogue;
  ctx.core.market = market;
  ctx.core.marketSeed = market.seed;
  ctx.core.layout = layout;
  ctx.runtime.input = {
    getContext: () => "flight",
    setContext: (next: string) => log.push(`input.setContext ${next}`),
    clearAll: () => log.push("input.clearAll"),
  } as unknown as KeyboardInputSource;
  ctx.runtime.loop = {
    reset: () => log.push("loop.reset"),
  } as unknown as GameLoop;

  const store: SaveStore = {
    read: () => Promise.resolve({ kind: "absent" }),
    write: (json, revision) => {
      log.push(`store.write ${String(revision)}`);
      writes.push({ json, revision });
      return writeResult.current;
    },
    clear: () => Promise.resolve({ committed: true, revision: 1 }),
    backupCorrupt: () => Promise.resolve(),
    dispose: () => undefined,
  };
  const allow = saveAllowLists({
    equipment: new Set(["EQ_DOCK_COMP"]),
    systems: new Set([system.id]),
    stations: new Set(["coriolis-station"]),
    commodities: new Map(
      catalogue
        .filter((commodity) => commodity.tradeable)
        .map((commodity) => [commodity.key, commodity.unit]),
    ),
  });
  const controller = createSaveController(ctx, {
    saveBoot: { store, status: "absent", allow },
    galaxyById: new Map([[system.id, system]]),
    docked: { show: () => undefined, hide: () => undefined },
    hudCanvas: { hidden: false },
    probe: {},
    messages: { clear: () => undefined },
    enterSystemById: () => layout,
    syncStatusOverlay: () => undefined,
    renderFrame: () => undefined,
    renderStation: () => undefined,
    syncStationNav: () => undefined,
    ensureSelection: () => undefined,
    updateProbe: () => undefined,
    syncSaveProbe: () => undefined,
    syncEconomyProbe: () => undefined,
    bindTestHook: () => undefined,
  });
  // No `deathFlow` is supplied: the router must install the latch itself.
  const router = createEventRouter(ctx, {
    stationFlow: () => undefined,
    damageFlow: () => undefined,
    hudMessages: () => undefined,
    dockFeedback: () => undefined,
    hyperspaceFlow: () => undefined,
  });
  return { ctx, controller, router, writes, log, writeResult };
}

describe("the latch (DEATH-06: latch before guards)", () => {
  it("a real lethal tick dispatched through a router with no deathFlow latches the session", () => {
    const { ctx, router, log } = session();
    const player = flyingPlayer();
    const events = lethalTick(player);
    const died = events.find((event) => event.kind === "playerDestroyed");
    expect(died).toBeDefined();
    expect(ctx.runtime.gameOver).toBe(false);

    for (const event of events) router.dispatch(event);

    expect(ctx.runtime.gameOver).toBe(true);
    expect(ctx.runtime.gameOverSeconds).toBe(0);
    expect(ctx.runtime.gameOverCause).toEqual(
      died?.kind === "playerDestroyed" ? died.cause : undefined,
    );
    expect(ctx.runtime.gameOverCause).toEqual({
      damage: "laser",
      culprit: "viper",
    });
    expect(log).toEqual(["loop.reset", "input.clearAll"]);
  });

  it("a second playerDestroyed changes nothing", () => {
    const { ctx, router, log } = session();
    const events = lethalTick(flyingPlayer());
    for (const event of events) router.dispatch(event);
    ctx.runtime.gameOverSeconds = 2.5;
    log.length = 0;

    router.dispatch({
      kind: "playerDestroyed",
      velocity: { x: 0, y: 0, z: 0 },
      position: vec(1, 2, 3),
      cause: { damage: "scrape", culprit: "buoy" },
    });

    expect(ctx.runtime.gameOver).toBe(true);
    expect(ctx.runtime.gameOverSeconds).toBe(2.5);
    expect(ctx.runtime.gameOverCause).toEqual({
      damage: "laser",
      culprit: "viper",
    });
    expect(log).toEqual([]);
  });

  it("latchGameOver reports whether it latched", () => {
    const { ctx } = session();
    expect(latchGameOver(ctx, { damage: "scrape" })).toBe(true);
    expect(latchGameOver(ctx, { damage: "laser" })).toBe(false);
    expect(ctx.runtime.gameOverCause).toEqual({ damage: "scrape" });
  });
});

describe("a latched session refuses every save attempt as dead (DEATH-06)", () => {
  it("one autosave before the death writes once; every attempt after it is refused with dead", async () => {
    const { ctx, controller, router, writes } = session();
    controller.autosave();
    await flush();
    expect(writes).toHaveLength(1);
    const blob = writes[0]?.json;
    expect(ctx.save.saveAttempts).toBe(1);

    for (const event of lethalTick(flyingPlayer())) router.dispatch(event);

    controller.autosave();
    controller.manualSave();
    await flush();

    expect(writes).toHaveLength(1);
    expect(writes[0]?.json).toBe(blob);
    expect(ctx.save.saveWrites).toBe(1);
    expect(ctx.save.saveAttempts).toBe(3);
    expect(ctx.save.saveSkipReason).toBe("dead");
  });

  it("the latch is checked before the recovering and tainted guards", () => {
    const { ctx, controller, router, writes } = session();
    for (const event of lethalTick(flyingPlayer())) router.dispatch(event);
    ctx.runtime.contextLost = true;
    ctx.runtime.testTainted = true;

    controller.autosave();
    expect(ctx.save.saveSkipReason).toBe("dead");
    ctx.save.saveSkipReason = "";
    controller.manualSave();
    expect(ctx.save.saveSkipReason).toBe("dead");

    expect(ctx.save.saveAttempts).toBe(2);
    expect(writes).toEqual([]);
  });
});

/** One recorded `explosions.add` call. */
interface AddCall {
  readonly position: Vec3;
  readonly radius: number;
  readonly settings: unknown;
  readonly flightTime: number;
  readonly options: ExplosionAddOptions | undefined;
}

interface FlowSession {
  readonly ctx: SessionState;
  readonly router: ReturnType<typeof createEventRouter>;
  readonly log: string[];
  readonly adds: AddCall[];
  readonly hud: { hidden: boolean };
  /** The lines each `gameOverOverlay.show` call received (empty without an overlay). */
  readonly shows: GameOverLines[];
  /** `ctx.runtime.gameOver` as seen from inside each `show` call. */
  readonly latchedAtShow: boolean[];
}

const DEATH_AT: Vec3 = { x: 11, y: -22, z: 33 };

/** The router wired with the real death flow on recording doubles. */
function flowSession(
  options: {
    readonly scene?: boolean;
    readonly overlay?: boolean;
    readonly saveStatus?: SaveStatus;
  } = {},
): FlowSession {
  const ctx = createSessionState({
    system,
    saveStatus: options.saveStatus ?? "absent",
    saveSkipReason: "",
  });
  const log: string[] = [];
  const adds: AddCall[] = [];
  const hud = { hidden: false };
  const shows: GameOverLines[] = [];
  const latchedAtShow: boolean[] = [];
  if (options.overlay === true) {
    // The overlay double records each call and what the latch read at that moment.
    ctx.runtime.gameOverOverlay = {
      show: (lines: GameOverLines) => {
        shows.push(lines);
        latchedAtShow.push(ctx.runtime.gameOver);
      },
      isShown: () => shows.length > 0,
      setFilter: () => undefined,
      dispose: () => undefined,
    } satisfies GameOverOverlay;
  }
  ctx.core.state = initFlightState(layout);
  ctx.core.state.flightTime = 12.5;
  ctx.runtime.input = {
    getContext: () => "flight",
    setContext: (next: string) => log.push(`input.setContext ${next}`),
    clearAll: () => log.push("input.clearAll"),
  } as unknown as KeyboardInputSource;
  ctx.runtime.loop = {
    reset: () => log.push("loop.reset"),
  } as unknown as GameLoop;
  if (options.scene !== false) {
    ctx.core.scene = {
      explosions: {
        add: (
          position: Vec3,
          radius: number,
          settings: unknown,
          flightTime: number,
          addOptions?: ExplosionAddOptions,
        ) => {
          log.push("explosions.add");
          adds.push({
            position,
            radius,
            settings,
            flightTime,
            options: addOptions,
          });
        },
      },
    } as unknown as SystemScene;
  }
  const deps: DeathFlowDeps = {
    closeChart: () => {
      log.push("closeChart");
      // The chart restores its saved context when it closes.
      ctx.runtime.input?.setContext("flight");
    },
    closeSaveScreen: () => log.push("closeSaveScreen"),
    launchSequence: { reset: () => log.push("launchSequence.reset") },
    hudCanvas: {
      get hidden(): boolean {
        return hud.hidden;
      },
      set hidden(value: boolean) {
        log.push(`hudCanvas.hidden ${String(value)}`);
        hud.hidden = value;
      },
    },
    messages: { clear: () => log.push("messages.clear") },
  };
  const router = createEventRouter(ctx, {
    stationFlow: () => undefined,
    damageFlow: () => undefined,
    hudMessages: () => undefined,
    dockFeedback: () => undefined,
    hyperspaceFlow: () => undefined,
    deathFlow: createDeathFlow(ctx, deps),
  });
  return { ctx, router, log, adds, hud, shows, latchedAtShow };
}

const PLAYER_DIED: SimEvent = {
  kind: "playerDestroyed",
  velocity: { x: 1, y: 2, z: -3 },
  position: DEATH_AT,
  cause: { damage: "laser", culprit: "viper" },
};

describe("the death flow shuts the session down around the frozen world (D-08, D-01)", () => {
  it("closes the chart and the F2 screen before the gameOver context, then clears the messages, resets the launch sequence and hides the HUD", () => {
    const { router, log, hud } = flowSession();

    router.dispatch(PLAYER_DIED);

    const withoutAdds = log.filter((entry) => entry !== "explosions.add");
    expect(withoutAdds).toEqual([
      "loop.reset",
      "input.clearAll",
      "closeChart",
      // closeChart restores the saved context first ...
      "input.setContext flight",
      "closeSaveScreen",
      // ... and the last context change is gameOver.
      "input.setContext gameOver",
      "messages.clear",
      "launchSequence.reset",
      "hudCanvas.hidden true",
    ]);
    expect(hud.hidden).toBe(true);
  });

  it("a second event repeats nothing: no clear, add or context change", () => {
    const { router, log, adds, ctx } = flowSession();
    router.dispatch(PLAYER_DIED);
    const before = log.length;
    expect(adds).toHaveLength(2 * PLAYER_EXPLOSION_FACTOR);

    router.dispatch({
      kind: "playerDestroyed",
      velocity: { x: 0, y: 0, z: 0 },
      position: { x: 0, y: 0, z: 0 },
      cause: { damage: "scrape" },
    });

    expect(log).toHaveLength(before);
    expect(adds).toHaveLength(2 * PLAYER_EXPLOSION_FACTOR);
    expect(ctx.runtime.gameOverCause).toEqual({
      damage: "laser",
      culprit: "viper",
    });
  });
});

describe("the player's explosion (D-01 as amended, D-01a, D-01b)", () => {
  it("adds eight clouds, four small then four big, each at one collision radius, one flash on the first", () => {
    // Traffic off, as the e2e bundle's default: the setting never comes from
    // the traffic content (defensive today: no lethal record exists traffic-off).
    const { ctx, router, adds } = flowSession();
    expect(ctx.core.npcTraffic).toBeUndefined();

    router.dispatch(PLAYER_DIED);

    expect(PLAYER_EXPLOSION_FACTOR).toBe(4);
    expect(adds).toHaveLength(2 * PLAYER_EXPLOSION_FACTOR);
    for (const add of adds) {
      expect(add.position).toEqual(DEATH_AT);
      // 1x the collision radius: nothing is scaled by the factor.
      expect(add.radius).toBe(PLAYER_COLLISION_RADIUS_M);
      expect(add.settings).toBe(PLAYER_EXPLOSION_SETTINGS);
      expect(add.flightTime).toBe(12.5);
    }
    // Oolite's small-burst loop, then its big-burst loop; flash passed
    // explicitly on every add (an omitted flash defaults to true).
    expect(adds.map((add) => add.options)).toStrictEqual([
      {
        kind: "small",
        variant: 1,
        flash: true,
        velocity: { x: 1, y: 2, z: -3 },
      },
      {
        kind: "small",
        variant: 2,
        flash: false,
        velocity: { x: 1, y: 2, z: -3 },
      },
      {
        kind: "small",
        variant: 3,
        flash: false,
        velocity: { x: 1, y: 2, z: -3 },
      },
      {
        kind: "small",
        variant: 4,
        flash: false,
        velocity: { x: 1, y: 2, z: -3 },
      },
      {
        kind: "big",
        variant: 5,
        flash: false,
        velocity: { x: 1, y: 2, z: -3 },
      },
      {
        kind: "big",
        variant: 6,
        flash: false,
        velocity: { x: 1, y: 2, z: -3 },
      },
      {
        kind: "big",
        variant: 7,
        flash: false,
        velocity: { x: 1, y: 2, z: -3 },
      },
      {
        kind: "big",
        variant: 8,
        flash: false,
        velocity: { x: 1, y: 2, z: -3 },
      },
    ]);
    expect(adds.filter((add) => add.options?.flash === true)).toHaveLength(1);
  });

  it("traffic on: the eight adds still take PLAYER_EXPLOSION_SETTINGS, never the traffic content's", () => {
    const { ctx, router, adds } = flowSession();
    ctx.core.npcTraffic = {
      explosion: { ...PLAYER_EXPLOSION_SETTINGS, count: 99, key: "other" },
    } as unknown as TrafficContent;

    router.dispatch(PLAYER_DIED);

    expect(adds).toHaveLength(2 * PLAYER_EXPLOSION_FACTOR);
    for (const add of adds) {
      expect(add.settings).toBe(PLAYER_EXPLOSION_SETTINGS);
    }
  });

  it("with no live scene adds nothing and does not throw", () => {
    const { ctx, router, adds, log } = flowSession({ scene: false });
    expect(() => {
      router.dispatch(PLAYER_DIED);
    }).not.toThrow();
    expect(adds).toEqual([]);
    expect(ctx.runtime.gameOver).toBe(true);
    expect(log).toContain("hudCanvas.hidden true");
  });

  it("PLAYER_EXPLOSION_SETTINGS is the compiled oolite-default-ship-explosion record without its key (the drift pin)", () => {
    const records = ExplosionCatalogueSchema.parse(
      JSON.parse(readFileSync("src/content/generated/explosions.json", "utf8")),
    );
    const record = records.find(
      (entry) => entry.key === "oolite-default-ship-explosion",
    );
    if (record === undefined) throw new Error("no default explosion record");
    const { key: _key, ...setting } = record;
    void _key;
    expect(PLAYER_EXPLOSION_SETTINGS).toStrictEqual(setting);
    expect(Object.isFrozen(PLAYER_EXPLOSION_SETTINGS)).toBe(true);
  });
});

/** Oolite's U+00A0 before the credit sign (`gameoverscreen-score-@`). */
const SCORE_AT_1000 = "Score: Harmless   (0), 100.0 ₢";

/** Rating labels as the compiled record carries them (the first is the start rating). */
const LABELS = {
  rating: [
    "Harmless",
    "Mostly Harmless",
    "Poor",
    "Average",
    "Above Average",
    "Competent",
    "Dangerous",
    "Deadly",
    "---- E L I T E ----",
  ],
} as unknown as Labels;

/** The live tables the cause line resolves through (D-03). */
function liveTables(ctx: SessionState): void {
  ctx.core.profile = { ...ctx.core.profile, credits: 1000 };
  ctx.core.labels = LABELS;
  ctx.core.npcTraffic = {
    catalogue: [{ key: "krait", name: "Krait" }],
  } as unknown as TrafficContent;
}

describe("the game-over overlay is shown by the death flow (DEATH-01, D-02, D-03, D-05)", () => {
  it("a laser death names the culprit from the catalogue and shows the four lines in the dispatch that latches", () => {
    const { ctx, router, shows, latchedAtShow } = flowSession({
      overlay: true,
    });
    liveTables(ctx);

    router.dispatch({
      kind: "playerDestroyed",
      velocity: { x: 0, y: 0, z: 0 },
      position: DEATH_AT,
      cause: { damage: "laser", culprit: "krait" },
    });

    expect(shows).toStrictEqual([
      {
        title: "Game Over",
        cause: "Destroyed by Krait",
        score: SCORE_AT_1000,
        prompt: "Press Space",
      },
    ]);
    // The latch was already set when the lines were shown: same dispatch.
    expect(latchedAtShow).toEqual([true]);
  });

  it("a second playerDestroyed shows nothing more", () => {
    const { ctx, router, shows } = flowSession({ overlay: true });
    liveTables(ctx);
    router.dispatch({
      kind: "playerDestroyed",
      velocity: { x: 0, y: 0, z: 0 },
      position: DEATH_AT,
      cause: { damage: "laser", culprit: "krait" },
    });

    router.dispatch({
      kind: "playerDestroyed",
      velocity: { x: 0, y: 0, z: 0 },
      position: DEATH_AT,
      cause: { damage: "scrape" },
    });

    expect(shows).toHaveLength(1);
  });

  it("with no overlay (a harness without the DOM) the death flow still latches and does not throw", () => {
    const { ctx, router, adds } = flowSession();
    expect(ctx.runtime.gameOverOverlay).toBeUndefined();
    expect(() => {
      router.dispatch(PLAYER_DIED);
    }).not.toThrow();
    expect(ctx.runtime.gameOver).toBe(true);
    expect(adds).toHaveLength(2 * PLAYER_EXPLOSION_FACTOR);
  });

  it("with no live scene the lines are still shown", () => {
    const { ctx, router, shows } = flowSession({
      scene: false,
      overlay: true,
    });
    liveTables(ctx);

    router.dispatch(PLAYER_DIED);

    expect(shows).toHaveLength(1);
  });
});

/** The static names the session installs as `ctx.core.targetNames` (plan 18-06). */
const STATIC_NAMES: ReadonlyMap<string, string> = new Map([
  ["buoy", "Navigation Buoy"],
  ["buoy-witchpoint", "Witchpoint Beacon"],
]);

describe("the cause line reads the live tables (D-03)", () => {
  it("a ram into the navigation buoy reads Collided with Navigation Buoy", () => {
    const { ctx, router, shows } = flowSession({ overlay: true });
    liveTables(ctx);
    ctx.core.targetNames = STATIC_NAMES;

    router.dispatch({
      kind: "playerDestroyed",
      velocity: { x: 0, y: 0, z: 0 },
      position: DEATH_AT,
      cause: { damage: "scrape", culprit: "buoy" },
    });

    expect(shows.map((lines) => lines.cause)).toEqual([
      "Collided with Navigation Buoy",
    ]);
  });

  it("a ram into the witchpoint beacon reads Collided with Witchpoint Beacon", () => {
    const { ctx, router, shows } = flowSession({ overlay: true });
    liveTables(ctx);
    ctx.core.targetNames = STATIC_NAMES;

    router.dispatch({
      kind: "playerDestroyed",
      velocity: { x: 0, y: 0, z: 0 },
      position: DEATH_AT,
      cause: { damage: "scrape", culprit: "buoy-witchpoint" },
    });

    expect(shows.map((lines) => lines.cause)).toEqual([
      "Collided with Witchpoint Beacon",
    ]);
  });

  it("a culprit key no table resolves gives the name-free wording, never the key", () => {
    const { ctx, router, shows } = flowSession({ overlay: true });
    liveTables(ctx);
    ctx.core.targetNames = STATIC_NAMES;

    router.dispatch({
      kind: "playerDestroyed",
      velocity: { x: 0, y: 0, z: 0 },
      position: DEATH_AT,
      cause: { damage: "laser", culprit: "unknown-ship" },
    });

    expect(shows.map((lines) => lines.cause)).toEqual(["Destroyed"]);
  });

  // Defensive: with traffic off no lethal record exists today (collisions need
  // the hull table and NPC fire needs the traffic content), so a player never
  // sees this wording. It pins that the key is never shown when both tables are
  // absent (review round 1, Sonnet).
  it("traffic off (no catalogue, no targetNames) gives the name-free wording for a laser and a ram", () => {
    const laser = flowSession({ overlay: true });
    expect(laser.ctx.core.npcTraffic).toBeUndefined();
    expect(laser.ctx.core.targetNames).toBeUndefined();
    laser.router.dispatch({
      kind: "playerDestroyed",
      velocity: { x: 0, y: 0, z: 0 },
      position: DEATH_AT,
      cause: { damage: "laser", culprit: "krait" },
    });
    expect(laser.shows.map((lines) => lines.cause)).toEqual(["Destroyed"]);

    const ram = flowSession({ overlay: true });
    ram.router.dispatch({
      kind: "playerDestroyed",
      velocity: { x: 0, y: 0, z: 0 },
      position: DEATH_AT,
      cause: { damage: "scrape", culprit: "buoy" },
    });
    expect(ram.shows.map((lines) => lines.cause)).toEqual([
      "Destroyed in a collision",
    ]);
  });
});

describe("the game-over view does not depend on the save (D-13)", () => {
  const STATUSES: readonly SaveStatus[] = [
    "absent",
    "corrupt",
    "future",
    "unreadable",
    "unavailable",
  ];

  it("the same death shows identical lines for every save status", () => {
    const seen: GameOverLines[] = [];
    for (const saveStatus of STATUSES) {
      const { ctx, router, shows } = flowSession({
        overlay: true,
        saveStatus,
      });
      liveTables(ctx);
      router.dispatch({
        kind: "playerDestroyed",
        velocity: { x: 0, y: 0, z: 0 },
        position: DEATH_AT,
        cause: { damage: "laser", culprit: "krait" },
      });
      expect(shows).toHaveLength(1);
      seen.push(...shows);
    }
    expect(seen).toHaveLength(STATUSES.length);
    for (const lines of seen) expect(lines).toStrictEqual(seen[0]);
  });
});

describe("the reload is the only way forward (D-12)", () => {
  it("no in-session load function exists and only the overlay reloads the page", () => {
    const sources = listSrcFiles();
    const reloaders = sources.filter((path) =>
      readFileSync(path, "utf8").includes("location.reload"),
    );
    expect(reloaders).toEqual(["src/ui/game-over.ts"]);
    for (const path of sources) {
      expect(readFileSync(path, "utf8")).not.toContain("loadSavedGame");
    }
  });
});
