// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The sim driver (Phase 8, D-12 step 8, D-14, ARCHITECTURE.md section 4.2).
 *
 * Everything between "the keyboard was drained" and "a fixed step ran" for one
 * rendered frame: the command drain, the launch filter, the pre-launch autosave,
 * the hyperspace edge mapping, one input frame shared by every step, the game
 * loop's accumulator and the single place a flight step is taken.
 *
 * `stepOnce` is that single place: the session has exactly one flight-step call
 * site, so plan 08-15 can swap it for the world step and plans 08-14 and 08-16
 * can share the per-step options through `buildStepOptions`. The bodies are the
 * ones `frame()` carried before the split, in the same order.
 *
 * The other phases of `frame()` (the pause toggle, the chart and save-screen
 * freezes, the station actions, the paused branch and the render) stay in the
 * facade until split step 9.
 */

import type { System } from "../../content/types.js";
import type { Command } from "../../sim/commands.js";
import type {
  PlayerController,
  ScriptedLaunchController,
} from "../../sim/flight/controller.js";
import { flightView } from "../../sim/flight/controller.js";
import { poseOf } from "../../sim/flight/state.js";
import { stepFlight } from "../../sim/flight/step.js";
import type { InputFrame } from "../../sim/state.js";
import { DT } from "../../sim/time.js";
import { mapHyperspaceBeginEdges } from "../hyperspace-commands.js";
import type { LaunchSequence } from "../launch-sequence.js";
import type { SessionState } from "./context.js";
import type { EventRouter } from "./event-router.js";
import { buildStepOptions } from "./step-options.js";

/** What the driver calls outside the session context. */
export interface SimDriverDeps {
  /** The queue the Launch button and the launch-skip key push onto. */
  readonly pending: Command[];
  readonly player: Pick<PlayerController, "update">;
  readonly scripted: Pick<ScriptedLaunchController, "update">;
  readonly launchSequence: Pick<LaunchSequence, "advance">;
  /** Every event of a step is dispatched here, in emission order. */
  readonly router: EventRouter;
  /** The owned equipment, as a read-only set rebuilt only when it changes. */
  readonly equipmentSet: () => ReadonlySet<string>;
  /** The committed target record, resolved through the validated catalogue. */
  readonly targetSystem: () => System | undefined;
  /** The pre-launch anchor write (D-17). */
  readonly autosave: () => void;
}

export function createSimDriver(ctx: SessionState, deps: SimDriverDeps) {
  const {
    pending,
    player,
    scripted,
    launchSequence,
    router,
    equipmentSet,
    targetSystem,
    autosave,
  } = deps;

  /**
   * One fixed step. A jump can commit mid-frame, so the state, the layout, the
   * config and the system are read live for every step after a swap (never a
   * frame-captured origin).
   */
  function stepOnce(
    stepCommands: readonly Command[],
    frameInput: InputFrame,
  ): void {
    const liveState = ctx.core.state;
    const liveLayout = ctx.core.layout;
    const liveConfig = ctx.core.config;
    if (
      liveState === undefined ||
      liveLayout === undefined ||
      liveConfig === undefined
    ) {
      return;
    }
    ctx.core.previousPose = ctx.core.currentPose;
    const modeBefore = liveState.mode;
    const controller = liveState.mode === "launching" ? scripted : player;
    const intent = controller.update(flightView(liveState), frameInput);
    // Ownership travels beside the command, never inside it: one read-only
    // set per step, derived from the profile (T-04-19).
    const stepOptions = buildStepOptions({
      fuel: ctx.core.profile.fuel,
      system: ctx.core.system,
      target: targetSystem(),
      equipment: equipmentSet(),
      dock: ctx.core.dockGeometry,
    });
    const events = stepFlight(
      liveState,
      liveLayout,
      liveConfig,
      intent,
      stepCommands,
      DT,
      stepOptions,
    );
    for (const event of events) router.dispatch(event);
    // The view timeline advances on the same fixed steps as the simulation,
    // and only after the step that entered `launching` (which does not move
    // the ship either).
    if (modeBefore === "launching") {
      launchSequence.advance(DT, liveState.mode === "inFlight");
    }
    ctx.core.currentPose = poseOf(liveState);
  }

  /**
   * The not-paused branch of a rendered frame: drain, filter, anchor, map, take
   * one input frame and run the whole fixed steps the delta owes. Returns the
   * interpolation alpha.
   */
  function advanceFrame(delta: number): number {
    const currentState = ctx.core.state;
    const currentInput = ctx.runtime.input;
    const currentLoop = ctx.runtime.loop;
    if (
      currentState === undefined ||
      currentInput === undefined ||
      currentLoop === undefined
    ) {
      return 0;
    }

    const drained: Command[] = [
      ...currentInput.drainCommands(),
      ...pending,
    ].filter(
      (command) =>
        command.kind !== "launch" ||
        (currentState.mode === "docked" &&
          ctx.station.stationScreen === "home"),
    );
    pending.length = 0;
    // D-17: the pre-launch anchor is taken while the state is still docked,
    // before `beginLaunch` applies the +600 s transition.
    if (
      currentState.mode === "docked" &&
      ctx.station.stationScreen === "home" &&
      drained.some((command) => command.kind === "launch")
    ) {
      autosave();
    }
    // D-06: while a countdown runs, the same key aborts it at no cost. The
    // mapping walks the drained array in input order, so two presses drained
    // into one frame start then cancel (G-6), and no app timer or double
    // command exists.
    const commands = mapHyperspaceBeginEdges(
      drained,
      currentState.hyperspaceCountdown > 0,
    );
    // One immutable frame per rendered frame, shared by every fixed step.
    const frameInput = currentInput.frame();
    ctx.core.currentFrame = frameInput;

    return currentLoop.advance(delta, commands, (stepCommands) => {
      stepOnce(stepCommands, frameInput);
    });
  }

  return { advanceFrame, stepOnce };
}

export type SimDriver = ReturnType<typeof createSimDriver>;
