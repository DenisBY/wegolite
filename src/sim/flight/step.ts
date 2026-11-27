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
import type { CombatOptions } from "../combat/step.js";
import type { SimEvent } from "../events.js";
import type { NpcFlightStats } from "../npc/stats.js";
import { nextCompassMode, resolveCompassTarget } from "../world/aegis.js";
import type { SystemLayout } from "../world/layout.js";
import type { ShipField, ShipMass } from "../world/ship-field.js";
import { DOCK_COMPUTER_KEY, dockWithComputer } from "../dock/computer.js";
import { stepDocking } from "../dock/step.js";
import type { DockGeometry } from "../dock/geometry.js";
import {
  BUOY_SUBENTITY_MASS,
  canStartJump,
  HYPERSPACE_COUNTDOWN_STEPS,
  witchspaceBlockedAt,
} from "../hyperspace/countdown.js";
import { jumpTimeSecondsForDist, MAX_JUMP_DIST } from "../hyperspace/jump.js";
import { add, scale } from "../math.js";
import type { Vec3 } from "../math.js";
import { stepAttitude } from "./attitude.js";
import type { FlightConfig } from "./config.js";
import type { ControlIntent } from "./controller.js";
import { brakePlayerDrift, hasDrift } from "./drift.js";
import { beginLaunch, completeLaunch, stepLaunch } from "./launch.js";
import { sanitizeFlightState } from "./sanitize.js";
import { stepSpeed } from "./speed.js";
import { stepTorus } from "./torus.js";
import { clearHyperspaceAttempt } from "./state.js";
import type { FlightState } from "./state.js";

/**
 * The Advanced Space Compass. Without it the compass is Oolite's basic one,
 * which has only COMPASS_MODE_BASIC (Wegolite's `"auto"`): the mode keys switch
 * only when the mode is not basic (`PlayerEntityControls.m:3629-3637` at
 * 7437f22), and a non-basic mode falls back to basic once the ASC is gone
 * (`PlayerEntity.m:10258-10260`). Ownership is read from
 * `StepOptions.equipment` only, never from a command (T-04-19).
 */
export const ADVANCED_COMPASS_KEY = "EQ_ADVANCED_COMPASS";

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
    /**
     * The read-only mass of the origin system's main station (NAV-04, plan
     * 06-16), supplied by the app each step from the live layout's
     * `stationMass` (Phase 22.1, WORLD-20). Absent means no blockage check; the
     * app always supplies it, and only the frozen acceptance harness omits it.
     */
    readonly stationMass?: number;
    /**
     * The read-only compiled masses of the NPC ship kinds (WORLD-10), supplied
     * by the app each step from the compiled NPC records, exactly as
     * `stationMass` is. A ship blocks a completing jump only when its `specKey`
     * has an entry here; absent means no ship blocks.
     */
    readonly shipMasses?: readonly ShipMass[];
    /**
     * The read-only mass of a whole navigation buoy (D-09), supplied by the app
     * each step as `NAV_BUOY_MASS`, exactly as `stationMass` is. Both buoys
     * block a completing jump only when it is a finite positive number; absent
     * (world-less unit flights, the frozen worlds) means no buoy blocks.
     */
    readonly buoyMass?: number;
  };
  /**
   * The read-only combat facts (CBT-05, CBT-07): the laser on each facing and
   * the loaded hull data. Derived from the profile and the loaded content each
   * step, exactly as `equipment` is, and never carried in a command, so a
   * command cannot forge a laser. `stepFlight` ignores it; `stepSim` hands it to
   * `stepPlayerCombat` and `resolveShots`. Later plans extend `CombatOptions` in
   * `../combat/step.ts` only.
   */
  readonly combat?: CombatOptions;
  /**
   * The read-only per-kind flight constants of the NPC ships (AI-01, plan
   * 14-11), keyed by spec key and built from the compiled NPC records by
   * `flightTableFrom` (`../npc/stats.ts`), exactly as `shipMasses` is supplied.
   * Never carried in a command. `stepFlight` ignores it; `stepSim` hands it to
   * the world step, where a kind with no row flies with Oolite's defaults.
   */
  readonly npcFlight?: readonly NpcFlightStats[];
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
  ships?: ShipField,
): SimEvent[] {
  // A dead player is never stepped (D-01): the clock block's negative mode gate
  // would otherwise keep a dead clock running.
  if (state.mode === "dead") return [];
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

  // 0b. Without the Advanced Space Compass the compass has only the basic mode,
  // so a carried non-basic mode (an old session, any other path) falls back to
  // "auto" here, as Oolite's removeEquipmentItem does (PlayerEntity.m:10258-10260
  // at 7437f22). It depends only on the state and the step options, so a replay
  // stays deterministic.
  const hasAdvancedCompass =
    options?.equipment?.has(ADVANCED_COMPASS_KEY) === true;
  if (!hasAdvancedCompass && state.compassMode !== "auto") {
    state.compassMode = "auto";
  }

  // 1. Drain this frame's commands exactly once. Every mode-changing command
  // is gated on `modeAtStart`, so a dock and a launch drained on the same tick
  // cannot both take effect (T-04-44).
  for (const command of commands) {
    switch (command.kind) {
      case "launch":
        if (
          modeAtStart === "docked" &&
          beginLaunch(state, layout, config, options?.dock)
        ) {
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
        // The basic compass has only COMPASS_MODE_BASIC: Oolite switches modes
        // only when the mode is not basic (PlayerEntityControls.m:3629-3637).
        if (!hasAdvancedCompass) break;
        // D-05: a destroyed witchpoint beacon is skipped, as Oolite's cycle
        // walks live beacons only (PlayerEntity.m:4761-4808). Without a field
        // (no world) the buoy counts as alive.
        state.compassMode = nextCompassMode(
          state.compassMode,
          ships?.buoy("witchpoint").alive ?? true,
        );
        break;
      case "targetStation":
        // Wegolite's KeyQ action selects a non-basic mode, so it needs the ASC
        // as the cycle does (PlayerEntityControls.m:3629-3637).
        if (!hasAdvancedCompass) break;
        state.compassMode = "station";
        break;
      case "beginHyperspace": {
        // D-06 / A1: only a ship in flight can start a jump. A docked or
        // launching key press is inert — no countdown and no false refusal.
        // The live mode is checked as well: a dock drained earlier in this same
        // command loop has already ended the flight, and the amended D-06 rule
        // (PROJECT.md, "Cancel an active hyperspace countdown when the ship
        // docks") forbids a countdown that would then never tick while docked.
        if (modeAtStart !== "inFlight" || state.mode !== "inFlight") break;
        // A begin while a countdown is running is a no-op; the app maps the
        // second key press to `cancelHyperspace` (plan 06-04).
        if (state.hyperspaceCountdown > 0) break;
        // The begin never consults the mass blockage: Oolite's checklist guards
        // that clause on the countdown status (PlayerEntity.m line 6547), so a
        // ship beside the station may start a countdown and fly out during it.
        // The blockage is evaluated at completion only (see the tick below).
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
    events.push(
      ...stepTorus(state, layout, config, effectiveIntent, dt, ships),
    );
    stepSpeed(state, effectiveIntent, config, dt);
    // 4a. The Newtonian drift (D-02): moved into the position, then braked by
    // the raw thrust x the thrust factor (PlayerEntity.m:3376-3404). A zero
    // drift skips the block, so a flight that never collided is unchanged.
    if (hasDrift(state.drift)) {
      state.position = add(state.position, scale(state.drift, dt));
      state.drift = brakePlayerDrift(
        state.drift,
        dt,
        config.thrust,
        state.speed > config.maxSpeed ? state.torus.factor : 1,
      );
    }
  }

  // 4b. The countdown tick. The decrement starts on the step after the drain,
  // so the commit lands exactly 1800 steps later. Only the commit is a
  // terminal transition: a refusal or cancel leaves the ordinary DT as the
  // tick's only clock effect, because steps 3/4 stay live (D-06). The tick
  // also requires the live mode: a command-phase dock has already ended the
  // attempt, and this gate is the defence in depth if a future terminal
  // transition does not.
  // The mass blockage is checked here, at countdown completion only, never at
  // the H press and never during the countdown (PlayerEntity.m lines 6547 and
  // 6772-6775). It runs before the route and fuel validation, as Oolite's
  // enterWitchspace calls the checklist first.
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
      const stationMass = options?.hyperspace?.stationMass;
      const blockingBuoy = buoyBlocker(
        state.position,
        layout,
        options?.hyperspace?.buoyMass,
        ships,
      );
      if (
        stationMass !== undefined &&
        witchspaceBlockedAt(
          state.position,
          layout.station.position,
          stationMass,
          layout.scannerRange,
        )
      ) {
        // Oolite's blocked jump failure: the countdown and target clear, and no
        // fuel or jump time is spent. The ordinary per-step time still advances.
        events.push({
          kind: "hyperspaceRefused",
          reason: "blocked",
          blocker: "station",
        });
        state.hyperspaceTarget = null;
      } else if (blockingBuoy !== undefined) {
        // A live buoy inside its blockage radius (D-09): the witchpoint buoy,
        // then the nav buoy, after the station and before the NPC ships, with
        // the station's clearing.
        events.push({
          kind: "hyperspaceRefused",
          reason: "blocked",
          blocker: blockingBuoy,
        });
        state.hyperspaceTarget = null;
      } else if (ships?.blocks(state.position, layout.scannerRange) === true) {
        // An NPC ship inside its own blockage radius (WORLD-10), checked after
        // the station as Oolite's loop is, with the same clearing.
        events.push({
          kind: "hyperspaceRefused",
          reason: "blocked",
          blocker: "ship",
        });
        state.hyperspaceTarget = null;
      } else if (
        snapshot !== null &&
        snapshot.dist <= MAX_JUMP_DIST &&
        fuelOk
      ) {
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

    // D-05: a compass left on a destroyed witchpoint beacon turns to the
    // planet, mode and target, as Oolite's validateCompassTarget does for a
    // target that is gone (PlayerEntity.m:4655-4659 at 7437f22). The mode
    // stays "planet" for the life of the world; the field reports the buoy as
    // the previous tick left it, so this is the first stepped tick that sees
    // the destruction.
    if (
      state.compassMode === "witchpoint" &&
      ships?.buoy("witchpoint").alive === false
    ) {
      state.compassMode = "planet";
    }

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

/** The blocker kind of each buoy, named after its Oolite name. */
const BUOY_BLOCKERS = [
  { key: "witchpoint", blocker: "witchpointBeacon" },
  { key: "navBuoy", blocker: "navBuoy" },
] as const;

/**
 * The first buoy that blocks a jump completing at `position` (D-09), the
 * witchpoint buoy before the nav buoy, or `undefined`. Both buoys use Oolite's
 * mass rule through `witchspaceBlockedAt`, from where the buoy is (its layout
 * position plus the field's offset, PD-02) and with the mass it has: the whole
 * `buoyMass`, or once its subentity is detached the float32 of `buoyMass`
 * minus the subentity's mass, as Oolite's GLfloat `mass -= [sub mass]` holds it
 * (ShipEntity.m line 8194; 691,044.375 for `NAV_BUOY_MASS`, PD-01). A
 * destroyed buoy never blocks (D-05). Without a field (no world) both buoys
 * count as alive, unmoved and whole. A missing, non-finite or non-positive
 * `buoyMass` blocks nothing (T-18-16), so a forged option can neither block
 * every jump nor reach the predicate as `NaN`.
 */
function buoyBlocker(
  position: Vec3,
  layout: SystemLayout,
  buoyMass: number | undefined,
  ships: ShipField | undefined,
): "witchpointBeacon" | "navBuoy" | undefined {
  if (buoyMass === undefined || !Number.isFinite(buoyMass) || buoyMass <= 0) {
    return undefined;
  }
  for (const { key, blocker } of BUOY_BLOCKERS) {
    const buoy = ships?.buoy(key);
    if (buoy !== undefined && !buoy.alive) continue;
    const base = layout[key].position;
    const centre = buoy === undefined ? base : add(base, buoy.offset);
    const mass =
      buoy === undefined || buoy.subentityAttached
        ? buoyMass
        : Math.fround(buoyMass - BUOY_SUBENTITY_MASS);
    if (witchspaceBlockedAt(position, centre, mass, layout.scannerRange)) {
      return blocker;
    }
  }
  return undefined;
}
