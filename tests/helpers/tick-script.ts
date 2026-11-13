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
 * session semantics; `recorded-flights.ts` remains the frozen pre-split v1
 * baseline artifact and is never updated (review 820a435 L582).
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
 * Not mirrored: the hyperspace edge mapping (no script commits a target) and
 * the arrival (a jump is proven through the real driver in Vitest only).
 *
 * Node only. It imports `src/sim`, two pure session modules
 * (`step-options.ts`, `world-lifecycle.ts`), `newProfile` and the readFileSync
 * based fixtures; nothing that touches the DOM, Three or `import.meta.glob`, so
 * the Playwright Node runner can import it (RESEARCH A7).
 */

import type { Command } from "../../src/sim/commands.js";
import {
  PlayerController,
  ScriptedLaunchController,
  flightView,
} from "../../src/sim/flight/controller.js";
import { initFlightState } from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
import { marketSeedForSystem } from "../../src/sim/economy/market.js";
import { newProfile } from "../../src/sim/player/profile.js";
import type { InputFrame } from "../../src/sim/state.js";
import { stepSim } from "../../src/sim/sim.js";
import { DT } from "../../src/sim/time.js";
import { hashWorld } from "../../src/sim/world/serialize.js";
import type { World } from "../../src/sim/world/world.js";
import { buildStepOptions } from "../../src/app/session/step-options.js";
import { createWorldLifecycle } from "../../src/app/session/world-lifecycle.js";
import { laveDockGeometry } from "./dock-pose.js";
import { laveFixture } from "./lave.js";

/** One `advanceTicks`-shaped step: the commands go to the first tick only. */
export interface TickStep {
  readonly commands: readonly Command[];
  readonly ticks: number;
}

export interface TickScriptOptions {
  /** The session's effective traffic flag; it only reaches the populate seam. */
  readonly traffic?: boolean;
  /** Also return the `hashWorld` value after every tick. */
  readonly trace?: boolean;
}

export interface TickScriptResult {
  readonly state: FlightState;
  /** The live world at the end, or undefined while docked. */
  readonly world: World | undefined;
  readonly epoch: number;
  /** `hashWorld(state, world)` at the end. */
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
  const lifecycle = createWorldLifecycle({ traffic: options.traffic === true });
  const trace: string[] = [];

  for (const step of steps) {
    // The drain: a launch command passes only while docked.
    const commands = step.commands.filter(
      (command) => command.kind !== "launch" || state.mode === "docked",
    );
    for (let tick = 0; tick < step.ticks; tick += 1) {
      const controller = state.mode === "launching" ? scripted : player;
      const intent = controller.update(flightView(state), IDLE_FRAME);
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
        }),
      );
      for (const event of events) {
        if (event.kind === "launched") lifecycle.begin(marketSeed);
        else if (event.kind === "docked") lifecycle.end();
      }
      if (options.trace === true) trace.push(hashWorld(state, lifecycle.world));
    }
  }

  return {
    state,
    world: lifecycle.world,
    epoch: lifecycle.epoch,
    hash: hashWorld(state, lifecycle.world),
    ...(options.trace === true ? { trace } : {}),
  };
}
