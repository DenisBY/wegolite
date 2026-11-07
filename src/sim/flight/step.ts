// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The flight step (FLGT-01..FLGT-03, Pattern B).
 *
 * Pure with respect to everything except the state it is handed: `dt` is a
 * parameter, no clock is read, no randomness is used, and nothing outside
 * `state` is mutated. Commands are drained once at the start of the step; the
 * caller passes them on the first step of a frame only, so a click cannot be
 * applied twice because a frame ran two steps.
 *
 * Order (research § Step 2): commands -> mode transition -> attitude ->
 * torus/mass lock -> speed/position -> station angle/flight time/clock ->
 * events. Mass lock is evaluated before the integration step, so a lock
 * discovered this tick disengages before the large torus speed is applied.
 */

import type { Command } from "../commands.js";
import type { SimEvent } from "../events.js";
import { nextCompassMode, resolveCompassTarget } from "../world/aegis.js";
import type { SystemLayout } from "../world/layout.js";
import { DOCK_COMPUTER_KEY, dockWithComputer } from "../dock/computer.js";
import { stepDocking } from "../dock/step.js";
import type { DockGeometry } from "../dock/geometry.js";
import {
  canStartJump,
  HYPERSPACE_COUNTDOWN_STEPS,
} from "../hyperspace/countdown.js";
import { jumpTimeSecondsForDist, MAX_JUMP_DIST } from "../hyperspace/jump.js";
import { stepAttitude } from "./attitude.js";
import type { FlightConfig } from "./config.js";
import type { ControlIntent } from "./controller.js";
import { beginLaunch, completeLaunch, stepLaunch } from "./launch.js";
import { sanitizeFlightState } from "./sanitize.js";
import { stepSpeed } from "./speed.js";
import { stepTorus } from "./torus.js";
import { clearHyperspaceAttempt } from "./state.js";
import type { FlightState } from "./state.js";

/** Optional per-step systems. Plan 04-04 adds the owned-equipment set. */
export interface StepOptions {
  /** The validated docking geometry; absent in Phase 1/2 probe steps. */
  readonly dock?: DockGeometry;
  /**
   * The equipment keys the player owns. Read-only and derived from the
   * profile, so a command never carries a forged ownership flag (T-04-19).
   */
  readonly equipment?: ReadonlySet<string>;
  /**
   * The read-only hyperspace facts (D-07). Fuel never enters `FlightState`;
   * the app derives these from the profile and the committed target each step,
   * exactly as it supplies equipment.
   */
  readonly hyperspace?: {
    readonly fuel: number;
    readonly origin: {
      readonly id: string;
      readonly x: number;
      readonly y: number;
    };
    readonly target?: {
      readonly id: string;
      readonly x: number;
      readonly y: number;
    };
  };
}

/**
 * Advance the flight simulation by one fixed step.
 *
 * @throws {Error} when `dt` is not a positive finite number — a zero or NaN
 * step would silently freeze or poison the state.
 */
export function stepFlight(
  state: FlightState,
  layout: SystemLayout,
  config: FlightConfig,
  intent: ControlIntent,
  commands: readonly Command[],
  dt: number,
  options?: StepOptions,
): SimEvent[] {
  // Repair a poisoned hook/restore value before anything integrates it
  // (T-04-41). Speed is bounded by the torus cap, so it can never drive the
  // position to Infinity.
  sanitizeFlightState(state, layout, config);

  if (!Number.isFinite(dt) || dt <= 0) {
    throw new Error(
      `Wegolite: stepFlight requires a positive finite dt, received ${String(dt)}.`,
    );
  }

  const events: SimEvent[] = [];
  const modeAtStart = state.mode;
  let skipLaunch = false;
  let launchedThisStep = false;
  // A command-phase transition that ends the tick: the launch, or a computer
  // dock. Step 5 must not also run the +dt clock on that tick, which is what
  // makes the computer dock exactly +1200 s (T-04-44).
  let terminalTransition = false;
  let torusToggle = false;
  // The begin was drained on this step, so the countdown must not tick yet:
  // that off-by-one is what makes the commit exactly 1800 steps later.
  let startedThisStep = false;
  // A committed jump ends the tick for docking too: the arrival pose belongs
  // to the destination layout while step 6's geometry belongs to the origin.
  let jumpedThisStep = false;

  // 1. Drain this frame's commands exactly once. Every mode-changing command
  // is gated on `modeAtStart`, so a dock and a launch drained on the same tick
  // cannot both take effect (T-04-44).
  for (const command of commands) {
    switch (command.kind) {
      case "launch":
        if (modeAtStart === "docked" && beginLaunch(state, layout, config)) {
          events.push({ kind: "launched" });
          launchedThisStep = true;
          terminalTransition = true;
        }
        break;
      case "skipLaunch":
        if (modeAtStart === "launching") skipLaunch = true;
        break;
      case "dockingComputer": {
        if (modeAtStart !== "inFlight") break;
        const hasComputer = options?.equipment?.has(DOCK_COMPUTER_KEY) === true;
        events.push(...dockWithComputer(state, layout, hasComputer));
        if (state.mode === "docked") terminalTransition = true;
        break;
      }
      case "toggleTorus":
        // A `j` edge is consumed once, on the first step of the frame that
        // drained it (FLGT-04).
        torusToggle = true;
        break;
      case "setPaused":
        // Pause is app-owned; the sim only sees the absence of steps.
        break;
      case "cycleCompass":
        state.compassMode = nextCompassMode(state.compassMode);
        break;
      case "targetStation":
        state.compassMode = "station";
        break;
      case "beginHyperspace": {
        // D-06 / A1: only a ship in flight can start a jump. A docked or
        // launching key press is inert — no countdown and no false refusal.
        if (modeAtStart !== "inFlight") break;
        // A begin while a countdown is running is a no-op; the app maps the
        // second key press to `cancelHyperspace` (plan 06-04).
        if (state.hyperspaceCountdown > 0) break;
        const facts = options?.hyperspace;
        if (facts === undefined) {
          events.push({ kind: "hyperspaceRefused", reason: "no target" });
          break;
        }
        const start = canStartJump(facts);
        if (!start.ok) {
          events.push({ kind: "hyperspaceRefused", reason: start.reason });
          break;
        }
        state.hyperspaceCountdown = HYPERSPACE_COUNTDOWN_STEPS;
        state.hyperspaceTarget = {
          id: start.target.id,
          dist: start.dist,
          fuelCost: start.fuelCost,
        };
        startedThisStep = true;
        events.push({
          kind: "hyperspaceCountdownStarted",
          destinationId: start.target.id,
          fuelCost: start.fuelCost,
          countdownSteps: HYPERSPACE_COUNTDOWN_STEPS,
        });
        break;
      }
      case "cancelHyperspace": {
        if (state.hyperspaceCountdown > 0 && state.hyperspaceTarget !== null) {
          const destinationId = state.hyperspaceTarget.id;
          clearHyperspaceAttempt(state);
          events.push({ kind: "hyperspaceCountdownCancelled", destinationId });
        }
        break;
      }
    }
  }

  // 1b. The app owns target changes. Committing a different target while a
  // countdown runs cancels it (D-06, Open Question 5): the snapshot is the
  // route actually committed, never a newly selected one.
  const liveTarget = options?.hyperspace?.target;
  if (
    !startedThisStep &&
    state.hyperspaceCountdown > 0 &&
    state.hyperspaceTarget !== null &&
    liveTarget !== undefined &&
    liveTarget.id !== state.hyperspaceTarget.id
  ) {
    const destinationId = state.hyperspaceTarget.id;
    clearHyperspaceAttempt(state);
    events.push({ kind: "hyperspaceCountdownCancelled", destinationId });
  }

  // 2. Apply the mode transition.
  if (state.mode === "launching" && skipLaunch) {
    completeLaunch(state);
    events.push({ kind: "launchComplete" });
  }

  // 3. Attitude and 4. speed/position, per mode. The step that *entered*
  // launching leaves the ship exactly at the dock mouth: the +600 s clock and
  // the dock pose are the whole observable effect of that step.
  if (launchedThisStep) {
    // no motion
  } else if (state.mode === "launching") {
    if (stepLaunch(state, layout, config, dt)) {
      events.push({ kind: "launchComplete" });
    }
  } else if (state.mode === "inFlight") {
    stepAttitude(state, intent, config, dt);
    // A command edge is merged into this step's intent so `stepTorus` owns the
    // engage/disengage decision in one place.
    const effectiveIntent: ControlIntent = torusToggle
      ? { ...intent, torusToggle: true }
      : intent;
    events.push(...stepTorus(state, layout, config, effectiveIntent, dt));
    stepSpeed(state, effectiveIntent, config, dt);
  }

  // 4b. The countdown tick. The decrement starts on the step after the drain,
  // so the commit lands exactly 1800 steps later. Only the commit is a
  // terminal transition: a refusal or cancel leaves the ordinary DT as the
  // tick's only clock effect, because steps 3/4 stay live (D-06). The tick
  // also requires the live mode: a command-phase dock has already ended the
  // attempt, and this gate is the defence in depth if a future terminal
  // transition does not.
  if (
    modeAtStart === "inFlight" &&
    state.mode === "inFlight" &&
    state.hyperspaceCountdown > 0 &&
    !startedThisStep
  ) {
    state.hyperspaceCountdown -= 1;
    if (state.hyperspaceCountdown === 0) {
      const snapshot = state.hyperspaceTarget;
      const fuel = options?.hyperspace?.fuel;
      const fuelOk =
        fuel !== undefined &&
        Number.isSafeInteger(fuel) &&
        fuel >= 0 &&
        fuel >= (snapshot?.fuelCost ?? Number.POSITIVE_INFINITY);
      if (snapshot !== null && snapshot.dist <= MAX_JUMP_DIST && fuelOk) {
        const jumpTimeSeconds = jumpTimeSecondsForDist(snapshot.dist);
        state.clockSeconds += jumpTimeSeconds;
        events.push({
          kind: "hyperspaceJumped",
          destinationId: snapshot.id,
          clockDeltaSeconds: jumpTimeSeconds,
          fuelCost: snapshot.fuelCost,
        });
        state.hyperspaceTarget = null;
        terminalTransition = true;
        jumpedThisStep = true;
      } else {
        // The route or tank changed under the countdown: refuse at the point
        // of no return, exactly as Oolite re-checks its jump checklist.
        events.push({
          kind: "hyperspaceRefused",
          reason:
            snapshot === null || snapshot.dist > MAX_JUMP_DIST
              ? "too far"
              : "insufficient fuel",
        });
        state.hyperspaceTarget = null;
      }
    }
  }

  // 5. Station roll, flight time and the ship clock. A docked ship is static,
  // and a command-phase terminal transition does not advance anything else:
  // the +600 s launch and the +1200 s computer dock are the whole clock effect
  // of their tick, so a test can pin them exactly. A manual capture happens in
  // step 6, after this block, and legitimately carries +dt.
  if (modeAtStart !== "docked" && !terminalTransition) {
    state.stationAngle += layout.stationRollRadPerSec * dt;
    state.flightTime += dt;
    state.clockSeconds += dt;

    // The compass resolves after the position update, so a manual cycle or an
    // aegis crossing is reflected on the same tick. The HUD reads the resolved
    // target from state; the event union stays app-facing and copy-free.
    state.compassTarget = resolveCompassTarget(
      state.position,
      state.compassMode,
      layout,
    );
  }

  // 6. Docking, after the post-increment station angle so the corridor never
  // lags the visible slot, and before the tick counter so the capture tick is
  // the same tick the pose reached the weighted plane. A jump commit skips it:
  // the arrival pose belongs to the destination layout, not this geometry.
  if (options?.dock !== undefined && !jumpedThisStep) {
    events.push(...stepDocking(state, layout, options.dock, dt));
  }

  state.tick += 1;

  // 7. Events were collected in order above.
  return events;
}
