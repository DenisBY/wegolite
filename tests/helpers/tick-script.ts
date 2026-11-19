// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The pure Node tick replay (Phase 8, plan 08-16; D-09, D-13; FOUND-14).
 *
 * `runTickScript` replays what a session does for `advanceTicks` calls on a
 * New game: the same state, profile, market seed, dock geometry, controllers,
 * `StepOptions` and world lifecycle, then hashes the result with `hashWorld`. The
 * Vitest parity test (tests/app/session/tick-parity.test.ts) and the Playwright
 * spec (tests/e2e/tick-hook.spec.ts) both import it, so a browser and a Node run
 * of the same ticks can be compared by value.
 *
 * `tick-script.ts` supersedes plan 08-02's `recorded-flights.ts` for post-split
 * session semantics; `recorded-flights.ts` is the deliberate baseline of the
 * current flight stepping, regenerated only by an owner-approved decision
 * (quick 261118-n7z, 2026-11-18; review 820a435 L582).
 *
 * Every setup value and the source it mirrors (a parity mismatch is a
 * diagnosable setup drift, not a false failure; review 10b4108 L400):
 *
 * - the New-game state: `initFlightState(layout)` over the Lave layout, as
 *   src/app/session/start-session.ts:423 (`initFlightState(systemLayout)`);
 * - the New-game profile: `newProfile()`, as start-session.ts:431; its fuel is
 *   NEW_GAME_FUEL (70) and its equipment is empty, so the equipment set is empty;
 * - the market seed: `marketSeedForSystem("g0-s7")`, as start-session.ts:450-451
 *   (the world lifecycle derives its seed from it, event-router.ts:358);
 * - the dock geometry: `laveDockGeometry()`, the committed dock port converted at
 *   the Lave layout's `dockOffset`, as start-session.ts:391-394;
 * - the controllers: a fresh `PlayerController` and `ScriptedLaunchController`;
 *   the scripted one drives while the mode is `launching`, the player one
 *   otherwise, as src/app/session/sim-driver.ts:111;
 * - the input frame: one idle frame per `TickStep`, `{ pitch: 0, roll: 0,
 *   speed: 0, precision: false }`, as the keyboard source returns outside a
 *   held key (src/input/keyboard.ts:222) and as sim-driver.ts advanceTicks takes
 *   one frame per call;
 * - the drain: a `launch` command passes only while the state is docked (the
 *   station is on its home screen in a New game), as sim-driver.ts:157-162; the
 *   commands go to the first tick of the step only (sim-driver.ts advanceTicks);
 * - the `StepOptions`: `buildStepOptions` with the profile's fuel, the Lave
 *   system, no committed target, the equipment set and the dock geometry, the
 *   same pure builder the driver calls at sim-driver.ts:115-121;
 * - the step: `stepSim(state, lifecycle.world, layout, config, intent, commands,
 *   DT, options)`, as sim-driver.ts:124-133, with the world read live each tick;
 * - the lifecycle reactions: `launched` begins a world from the market seed and
 *   `docked` ends it, after the step that emitted the event, as
 *   event-router.ts:354-362 (the one-tick latency of world-lifecycle.ts rule
 *   (i): a world made in the launch step is first stepped on the next tick).
 *
 * - the populated world (Phase 12, plan 12-09; Phase 8 deferred populated parity
 *   to Phase 12): with `traffic: true` the replay builds the same populate and
 *   the same step masses as the session, through the one shared source
 *   `src/app/session/traffic.ts` (`trafficContent`, `createInertPopulate`). The
 *   catalogue is read from `src/content/generated/ships-npc.json` with
 *   `readFileSync` and validated with the strict schema (no `import.meta.glob`),
 *   the populate reads the Lave layout, and `shipMasses` goes to
 *   `buildStepOptions`, as start-up and sim-driver.ts do. With traffic off the
 *   file is not read, the lifecycle keeps its default populator and no mass is
 *   passed, so every traffic-off replay is unchanged (D-01).
 *
 * - combat (Phase 13, plan 13-11): the replay creates the same pristine combat
 *   state as a New game (`createPlayerCombatState`, as start-session.ts does
 *   beside the flight state), passes `laserMounts` from the profile (or the
 *   script's own mounts), and with traffic on the hull table and the NPC weapon
 *   map, through the one builder `buildStepOptions` and the shared
 *   `hullTable`/`trafficContent`; `stepSim` receives the combat state as its
 *   ninth argument and `hashWorld` hashes with it, as sim-driver.ts and the
 *   probe publisher do. A step may hold the fire key (`TickStep.fire`), the
 *   frame field the keyboard source sets. The hull data is read from the
 *   committed generated file with `readFileSync` and the strict schema, like
 *   the NPC catalogue, and only with traffic on (the session loads it only
 *   then, D-01); since plan 18-04 the static hulls are merged in as the
 *   session merges them, because the station is a laser candidate.
 *
 * - the flying NPCs (Phase 14, plan 14-18): a step with `spawnFlyers` calls the
 *   one `spawnTestFlyers` the `?test=1` hook calls, with the records of the
 *   shared `testFlyerRecords`, the content's flight table, the state's tick and
 *   the layout's station centre, before the step's ticks, as the hook runs
 *   between two `advanceTicks` calls. The flight table also reaches every step
 *   as `StepOptions.npcFlight` with traffic on, as sim-driver.ts passes it.
 *
 * - the debris (Phase 16, plan 16-06): with traffic on the replay reads the
 *   committed `ships-debris.json` and `explosions.json` with `readFileSync` and
 *   the strict schemas (`DebrisCatalogueSchema`, `ExplosionCatalogueSchema`)
 *   and hands them to `trafficContent`, as start-session.ts's boot load does
 *   beside the NPC catalogue; the content's `debris` (built by the one builder
 *   `debrisContentFrom`) reaches every step as `StepOptions.combat.debris`, as
 *   sim-driver.ts passes it. No replay script kills a ship, so every existing
 *   replay pin is unchanged.
 *
 * Not mirrored: the hyperspace edge mapping (no script commits a target) and
 * the arrival (a jump is proven through the real driver in Vitest only).
 *
 * Node only. It imports `src/sim`, three pure session modules
 * (`step-options.ts`, `traffic.ts`, `world-lifecycle.ts`), the NPC, hull,
 * static hull, debris and explosion catalogue schemas, `newProfile` and the
 * readFileSync based fixtures; nothing that touches the DOM, Three or
 * `import.meta.glob`, so the Playwright Node runner
 * can import it (RESEARCH A7).
 */

import { readFileSync } from "node:fs";

import type { Command } from "../../src/sim/commands.js";
import {
  PlayerController,
  ScriptedLaunchController,
  flightView,
} from "../../src/sim/flight/controller.js";
import { initFlightState } from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
import { marketSeedForSystem } from "../../src/sim/economy/market.js";
import { createPlayerCombatState } from "../../src/sim/combat/state.js";
import type { LaserMounts } from "../../src/sim/combat/mounts.js";
import { newProfile } from "../../src/sim/player/profile.js";
import type { InputFrame } from "../../src/sim/state.js";
import { spawnTestFlyers } from "../../src/sim/ai/test-spawn.js";
import { stepSim } from "../../src/sim/sim.js";
import { DT } from "../../src/sim/time.js";
import { hashWorld } from "../../src/sim/world/serialize.js";
import type { HullTable } from "../../src/sim/combat/hit.js";
import type { PlayerCombatState } from "../../src/sim/combat/state.js";
import type { World } from "../../src/sim/world/world.js";
import { buildStepOptions } from "../../src/app/session/step-options.js";
import {
  createInertPopulate,
  hullTable,
  testFlyerRecords,
  trafficContent,
} from "../../src/app/session/traffic.js";
import type { TrafficContent } from "../../src/app/session/traffic.js";
import { createWorldLifecycle } from "../../src/app/session/world-lifecycle.js";
import { ExplosionCatalogueSchema } from "../../src/content/schemas/explosion.js";
import { DebrisCatalogueSchema } from "../../src/content/schemas/ship-debris.js";
import { ShipHullCatalogueSchema } from "../../src/content/schemas/ship-hull.js";
import { StaticHullArtifactSchema } from "../../src/content/schemas/ship-static-hull.js";
import { NpcShipCatalogueSchema } from "../../src/content/schemas/ship-npc.js";
import { laveDockGeometry } from "./dock-pose.js";
import { laveFixture } from "./lave.js";

/** One `advanceTicks`-shaped step: the commands go to the first tick only. */
export interface TickStep {
  readonly commands: readonly Command[];
  readonly ticks: number;
  /** Hold the fire key for every tick of the step (the frame's `fire` field). */
  readonly fire?: boolean;
  /**
   * Spawn the three `?test=1` flying NPCs (`spawnTestFlyers`, WORLD-07) before
   * the step's ticks, the same call the hook makes between two `advanceTicks`.
   * It needs traffic, a live world and flight; otherwise the replay throws,
   * because a script that silently spawned nothing would hash as a browser that
   * did the same.
   */
  readonly spawnFlyers?: boolean;
}

export interface TickScriptOptions {
  /**
   * The session's effective traffic flag: with it the replay populates the
   * world and passes the NPC masses exactly as the session does.
   */
  readonly traffic?: boolean;
  /** Also return the `hashWorld` value after every tick. */
  readonly trace?: boolean;
  /** The fitted lasers; the New game's stock fit (the profile's) when absent. */
  readonly laserMounts?: LaserMounts;
}

export interface TickScriptResult {
  readonly state: FlightState;
  /** The live world at the end, or undefined while docked. */
  readonly world: World | undefined;
  readonly epoch: number;
  /** The player's combat state at the end. */
  readonly combat: PlayerCombatState;
  /** `hashWorld(state, world, combat)` at the end. */
  readonly hash: string;
  /** `hashWorld` after each tick, in order; present only with `trace: true`. */
  readonly trace?: string[];
}

/** The idle keyboard frame (src/input/keyboard.ts:222). */
const IDLE_FRAME: InputFrame = {
  pitch: 0,
  roll: 0,
  speed: 0,
  precision: false,
};

/** A committed generated file, read with `readFileSync` and parsed. */
function committedJson(name: string): unknown {
  return JSON.parse(
    readFileSync(
      new URL(`../../src/content/generated/${name}`, import.meta.url),
      "utf8",
    ),
  );
}

/**
 * The committed NPC records, debris records and explosion settings as the
 * session loads them: read with `readFileSync` and validated with the strict
 * schemas, then built into the shared content (debris included).
 */
function committedTrafficContent(): TrafficContent {
  return trafficContent(
    NpcShipCatalogueSchema.parse(committedJson("ships-npc.json")),
    {
      debris: DebrisCatalogueSchema.parse(committedJson("ships-debris.json")),
      explosions: ExplosionCatalogueSchema.parse(
        committedJson("explosions.json"),
      ),
    },
  );
}

/**
 * The committed hull data as the traffic-on session loads it (read with
 * `readFileSync`, validated with the strict schemas) and built into the shared
 * hull table: the ten ship hulls merged with the static hulls of
 * `ships-static-hulls.json` (`hullTable(hulls, statics)`, plan 18-13), so the
 * replay's laser candidates include the station as the session's do (plan
 * 18-04).
 */
function committedHullTable(): HullTable {
  return hullTable(
    ShipHullCatalogueSchema.parse(committedJson("ships-hulls.json")),
    StaticHullArtifactSchema.parse(committedJson("ships-static-hulls.json"))
      .hulls,
  );
}

/** Replay `steps` over a New game and hash the result. */
export function runTickScript(
  steps: readonly TickStep[],
  options: TickScriptOptions = {},
): TickScriptResult {
  const { layout, config, system } = laveFixture();
  const state = initFlightState(layout);
  const profile = newProfile();
  const marketSeed = marketSeedForSystem(system.id);
  const dock = laveDockGeometry();
  const equipment: ReadonlySet<string> = new Set(profile.equipment);
  const player = new PlayerController();
  const scripted = new ScriptedLaunchController();
  const traffic = options.traffic === true;
  // Traffic on: the same populate and masses as the session (traffic.ts). Traffic
  // off reads nothing and keeps the default populator.
  const content = traffic ? committedTrafficContent() : undefined;
  const hulls = traffic ? committedHullTable() : undefined;
  const combat = createPlayerCombatState();
  const laserMounts = options.laserMounts ?? profile.laserMounts;
  const lifecycle = createWorldLifecycle({
    traffic,
    ...(content === undefined
      ? {}
      : {
          populate: createInertPopulate(
            () => content,
            () => layout,
          ),
        }),
  });
  const trace: string[] = [];

  for (const step of steps) {
    // The drain: a launch command passes only while docked.
    const commands = step.commands.filter(
      (command) => command.kind !== "launch" || state.mode === "docked",
    );
    if (step.spawnFlyers === true) {
      const flyers =
        content === undefined ? undefined : testFlyerRecords(content);
      const world = lifecycle.world;
      if (
        content === undefined ||
        flyers === undefined ||
        world === undefined ||
        state.mode !== "inFlight" ||
        !spawnTestFlyers(
          world,
          state,
          flyers,
          content.flight,
          state.tick,
          layout.station.position,
        )
      ) {
        throw new Error("the spawnFlyers step could not spawn the flyers");
      }
    }
    for (let tick = 0; tick < step.ticks; tick += 1) {
      const controller = state.mode === "launching" ? scripted : player;
      const intent = controller.update(
        flightView(state),
        step.fire === true ? { ...IDLE_FRAME, fire: true } : IDLE_FRAME,
      );
      const events = stepSim(
        state,
        lifecycle.world,
        layout,
        config,
        intent,
        tick === 0 ? commands : [],
        DT,
        buildStepOptions({
          fuel: profile.fuel,
          system,
          target: undefined,
          equipment,
          dock,
          ...(content === undefined ? {} : { shipMasses: content.masses }),
          laserMounts,
          ...(hulls === undefined ? {} : { hulls }),
          ...(content === undefined ? {} : { npcWeapons: content.weapons }),
          ...(content === undefined ? {} : { npcFlight: content.flight }),
          ...(content?.debris === undefined ? {} : { debris: content.debris }),
        }),
        combat,
      );
      for (const event of events) {
        if (event.kind === "launched") lifecycle.begin(marketSeed);
        else if (event.kind === "docked") lifecycle.end();
      }
      if (options.trace === true)
        trace.push(hashWorld(state, lifecycle.world, combat));
    }
  }

  return {
    state,
    world: lifecycle.world,
    epoch: lifecycle.epoch,
    combat,
    hash: hashWorld(state, lifecycle.world, combat),
    ...(options.trace === true ? { trace } : {}),
  };
}
