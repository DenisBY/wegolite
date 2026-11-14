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
 * `stepOnce` is that single place: the session has exactly one step call site.
 * Since plan 08-15 it is `stepSim` (the flight step, then the world step over the
 * live world, which is absent while docked); plans 08-14 and 08-16 share the
 * per-step options through `buildStepOptions`. The bodies are the ones `frame()`
 * carried before the split, in the same order.
 *
 * The other phases of `frame()` (the pause toggle, the chart and save-screen
 * freezes, the station actions, the paused branch and the render) stay in the
 * facade until split step 9. The frame loop's chart branch steps the simulation
 * behind the opaque chart in flight through `advanceBehind` (WORLD-11), which
 * reaches the same single `stepOnce` call site with no commands and the zero
 * input frame.
 */

import type { System } from "../../content/types.js";
import type { KeyboardInputSource } from "../../input/keyboard.js";
import type { Command } from "../../sim/commands.js";
import type {
  PlayerController,
  ScriptedLaunchController,
} from "../../sim/flight/controller.js";
import { flightView } from "../../sim/flight/controller.js";
import type { FlightState } from "../../sim/flight/state.js";
import { poseOf } from "../../sim/flight/state.js";
import type { InputFrame } from "../../sim/state.js";
import { stepSim } from "../../sim/sim.js";
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
  /**
   * Record a `?test=1` live-state mutation (the probe publisher's taint
   * callback): `advanceTicks` calls it before its first step so every autosave
   * during and after the call is skipped.
   */
  readonly markHookMutation: () => void;
}

/**
 * The most ticks one `advanceTicks` call steps (RESEARCH A1): a synchronous
 * bounded loop, so a bad argument cannot freeze the tab for long.
 */
export const MAX_ADVANCE_TICKS = 200_000;

/**
 * The input frame of a step taken behind the opaque chart (WORLD-11): nothing
 * the pilot presses while the chart is open steers the ship, as in Oolite. One
 * frozen frame shared by every such step.
 */
const ZERO_FRAME: InputFrame = Object.freeze({
  pitch: 0,
  roll: 0,
  speed: 0,
  precision: false,
});

/** What one drain hands to the fixed steps. */
interface Drained {
  readonly commands: readonly Command[];
  readonly frameInput: InputFrame;
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
    markHookMutation,
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
      // The compiled NPC masses (WORLD-10), present only with traffic on; the
      // key is omitted without them (exactOptionalPropertyTypes).
      ...(ctx.core.npcTraffic === undefined
        ? {}
        : { shipMasses: ctx.core.npcTraffic.masses }),
    });
    // The one integration point (D-14): the world is read live on every step,
    // so a launch in one step creates the world the next step runs.
    const events = stepSim(
      liveState,
      ctx.core.worldLifecycle?.world,
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
   * The drain both entry points share (Pitfall 3): the keyboard commands plus
   * `pending`, the launch filter, the pre-launch autosave, the hyperspace edge
   * mapping and one input frame stored in `ctx.core.currentFrame`. Keeping one
   * path means the manual clock cannot drift from the realtime one.
   */
  function drain(
    currentState: FlightState,
    currentInput: KeyboardInputSource,
  ): Drained {
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
    return { commands, frameInput };
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

    const { commands, frameInput } = drain(currentState, currentInput);
    return currentLoop.advance(delta, commands, (stepCommands) => {
      stepOnce(stepCommands, frameInput);
    });
  }

  /**
   * The chart branch's steps (WORLD-11): the simulation keeps running behind
   * the opaque chart in flight, as in Oolite. It runs the whole fixed steps the
   * delta owes (the same `MAX_STEPS_PER_FRAME` and `MAX_FRAME_DELTA` bounds as
   * `advanceFrame`, D-03) with no commands and the zero input frame, so
   * nothing pressed while the chart is open steers the ship. It never drains
   * the keyboard (the frame loop already did), never touches `pending` and
   * never autosaves: the pre-launch anchor belongs to the docked drain.
   */
  function advanceBehind(delta: number): void {
    const currentState = ctx.core.state;
    const currentInput = ctx.runtime.input;
    const currentLoop = ctx.runtime.loop;
    if (
      currentState === undefined ||
      currentInput === undefined ||
      currentLoop === undefined
    ) {
      return;
    }
    ctx.core.currentFrame = ZERO_FRAME;
    currentLoop.advance(delta, [], (stepCommands) => {
      stepOnce(stepCommands, ZERO_FRAME);
    });
  }

  /**
   * The manual clock (D-09): step exactly `n` fixed ticks synchronously and
   * return the new tick. Honoured only under `?test=1&clock=manual`; every
   * unsafe call is refused with the tick unchanged and nothing stepped, drained
   * or tainted: a disposed session (checked first), a flag-less session, an `n`
   * that is not a safe integer in 1..`MAX_ADVANCE_TICKS`, a paused session, an
   * open Save/Load screen, an open chart while not in flight, or a session
   * without a state.
   *
   * The session is tainted before the first step (so the pre-launch autosave
   * and every docked or arrival autosave inside or after the call skip), the
   * drain runs once, the drained commands go to the first tick only and every
   * tick shares the one input frame. With the chart open in flight it steps
   * behind the chart as the frame loop does (WORLD-11): no drain, no commands
   * and the zero input frame. The loop stops early when a step disposes or
   * pauses the session, opens the Save/Load screen or changes whether the
   * chart is open (a step that opens it, or a dock or a jump that closes it).
   *
   * A step that throws is not caught: the error reaches the caller (a test
   * spec). The session is already tainted, so no save can be written, and
   * `ctx.core.currentFrame` and `pending` stay as the drain left them; that is
   * accepted for a test-only hook.
   */
  function advanceTicks(n: number): number {
    const currentState = ctx.core.state;
    const currentInput = ctx.runtime.input;
    if (
      ctx.runtime.disposed ||
      !ctx.runtime.testFlags.manualClock ||
      !Number.isSafeInteger(n) ||
      n < 1 ||
      n > MAX_ADVANCE_TICKS ||
      ctx.runtime.paused ||
      (ctx.chart.chartOpen && currentState?.mode !== "inFlight") ||
      ctx.save.saveScreenOpen ||
      currentState === undefined ||
      currentInput === undefined
    ) {
      return currentState?.tick ?? 0;
    }

    markHookMutation();
    const chartOpenAtStart = ctx.chart.chartOpen;
    let commands: readonly Command[] = [];
    let frameInput: InputFrame = ZERO_FRAME;
    if (chartOpenAtStart) {
      // Behind the opaque chart: no drain, no commands, the zero frame.
      ctx.core.currentFrame = ZERO_FRAME;
    } else {
      ({ commands, frameInput } = drain(currentState, currentInput));
    }
    for (let step = 0; step < n; step += 1) {
      stepOnce(step === 0 ? commands : [], frameInput);
      if (
        ctx.runtime.disposed ||
        ctx.runtime.paused ||
        ctx.chart.chartOpen !== chartOpenAtStart ||
        ctx.save.saveScreenOpen
      ) {
        break;
      }
    }
    return ctx.core.state?.tick ?? 0;
  }

  return { advanceFrame, advanceBehind, advanceTicks, stepOnce };
}

export type SimDriver = ReturnType<typeof createSimDriver>;
