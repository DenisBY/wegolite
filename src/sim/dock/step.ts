// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The docking step (DOCK-01, DOCK-02, DOCK-03, DOCK-04, D-03, D-04, D-07, D-09).
 *
 * `stepDocking` runs on every `inFlight` tick, after the station angle has been
 * advanced, so the corridor never lags the visible slot. The capture decision
 * is the port-frame box test from Oolite: it reads no speed term at all (D-04),
 * so a fast but aligned approach docks exactly like a slow one.
 *
 * Arming is a clearance latch, not a precondition (the fix for the deadlocking
 * single gate): the step always computes the snapshot first, and while
 * `dockArmed` is false it
 *
 * 1. clamps a ship whose whole box is past the 250 m tunnel end forward along
 *    `k` (a positional-only unstick, no bounce),
 * 2. returns silently while any part of the box still overlaps the contact
 *    proxy's outward face,
 * 3. otherwise sets `dockArmed = true` and classifies on that same tick.
 *
 * The strict `box.min.z > contactPort.zMax` threshold is the launch exemption:
 * Oolite skips the safety block for `STATUS_LAUNCHING`, but a Space-skipped
 * launch hands over at the mouth with no launching status. Arming past the
 * proxy's outward face makes the arming tick provably response-free (the box
 * z-axis separates it from `contactPort`, and the nose gate stays closed).
 *
 * The armed branch is a strictly ordered, exclusive pipeline (T-04-39):
 * capture, else straddle, else band/lane, else outside + hull SAT. At most one
 * response is emitted per tick, so a straddle tick can never also run the hull
 * test and double-push or double-count. Lane and band outcomes suppress hull
 * contact for the tick because the tunnel interior is not collidable inside the
 * footprint.
 *
 * Contact physics (D-07): the combined velocity `forward*speed + impulse` is
 * reflected about the contact normal with restitution, an outward normal speed
 * floor guarantees separation even from a zero-speed brush, the scalar `speed`
 * is the damped forward component, and the remainder becomes the decaying
 * impulse. Orientation is never changed and the mode stays `inFlight`.
 */

import { add, dot, rotate, scale, sub, vec } from "../math.js";
import type { Vec3 } from "../math.js";
import type { BounceAxis, BounceCause, SimEvent } from "../events.js";
import { clearHyperspaceAttempt, dockMouthPosition } from "../flight/state.js";
import type { FlightState } from "../flight/state.js";
import type { SystemLayout } from "../world/layout.js";
import { classifyCorridor, dockSnapshot, isFiniteBox } from "./corridor.js";
import type { DockGeometry } from "./geometry.js";
import { hullContact } from "./hull.js";

/** Ship local forward (-Z) in ship space. */
const FORWARD = vec(0, 0, -1);

/** D-07's damping factor on the forward component after a contact. */
export const BOUNCE_RESTITUTION = 0.5;
/** The surviving scalar speed after a contact (feel only, A2). */
export const BOUNCE_SPEED_DAMPING = 0.35;
/** The impulse decay time constant (feel only, A2). */
export const IMPULSE_DECAY_TAU = 0.6;
/** The outward normal speed floor, so a zero-speed brush still separates. */
export const MIN_OUTWARD_SPEED = 8;
/**
 * A numerical separation margin. The push is the SAT's minimum translation, so
 * the projections touch exactly; one micron keeps floating-point noise from
 * reporting a residual overlap on the next tick.
 */
const SEPARATION_MARGIN = 1e-6;

function finiteVec(value: Vec3): boolean {
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z)
  );
}

/** Integrate and decay the transient impulse before this tick's classification. */
function advanceImpulse(state: FlightState, dt: number): void {
  if (!finiteVec(state.impulse)) {
    state.impulse = vec(0, 0, 0);
    return;
  }
  if (!(dt > 0) || !Number.isFinite(dt)) return;
  state.position = add(state.position, scale(state.impulse, dt));
  state.impulse = scale(state.impulse, 1 / (1 + dt / IMPULSE_DECAY_TAU));
}

/**
 * Apply the elastic response with `normal` and return the one bounce event.
 *
 * The impact speed is measured before the reflection, so the event reports how
 * hard the contact was rather than how fast the ship left it.
 */
function respondToContact(
  state: FlightState,
  normal: Vec3,
  cause: BounceCause,
  axis: BounceAxis,
): SimEvent {
  const forward = rotate(state.orientation, FORWARD);
  const velocity = add(scale(forward, state.speed), state.impulse);
  const impactSpeed = Math.abs(dot(velocity, normal));

  let reflected = velocity;
  const approach = dot(velocity, normal);
  if (approach < 0) {
    reflected = sub(
      velocity,
      scale(normal, (1 + BOUNCE_RESTITUTION) * approach),
    );
  }

  const outward = dot(reflected, normal);
  if (outward < MIN_OUTWARD_SPEED) {
    reflected = add(reflected, scale(normal, MIN_OUTWARD_SPEED - outward));
  }

  const forwardSpeed = Math.max(0, dot(reflected, forward));
  state.speed = forwardSpeed * BOUNCE_SPEED_DAMPING;
  state.impulse = sub(reflected, scale(forward, state.speed));
  state.bounceCount += 1;

  return { kind: "bounce", speed: impactSpeed, cause, axis };
}

/**
 * Advance the docking state machine by one fixed step.
 *
 * @param dt the fixed step; `0` skips impulse integration (direct unit calls).
 * @returns the events produced by this tick (`docked`, `scrape` or `bounce`).
 */
export function stepDocking(
  state: FlightState,
  layout: SystemLayout,
  geometry: DockGeometry,
  dt = 0,
): SimEvent[] {
  if (state.mode !== "inFlight") return [];

  // The impulse moves the ship between contacts; it is integrated before the
  // snapshot so classification reads the pose that actually exists this tick.
  advanceImpulse(state, dt);

  const snapshot = dockSnapshot(layout, state, geometry, state.stationAngle);
  // A non-finite pose is left untouched: plan 04-03's sanitize step owns the
  // repair, and a NaN comparison must not be allowed to flip the latch.
  if (!isFiniteBox(snapshot.box)) return [];

  if (!state.dockArmed) {
    // (1) The whole box is past the tunnel end: clamp it to the end. The
    // response is positional only; a disarmed departure must not bounce.
    if (snapshot.box.min.z < -geometry.port.depth) {
      const shift = -geometry.port.depth - snapshot.box.min.z;
      state.position = add(state.position, scale(snapshot.frame.k, shift));
      return [];
    }

    // (2) The box still overlaps the contact proxy: hold the latch.
    if (snapshot.box.min.z <= geometry.contactPort.zMax) return [];

    // (3) Clear of the proxy: arm and classify on this tick.
    state.dockArmed = true;
  }

  const classification = classifyCorridor(snapshot, geometry);

  // Capture: dock and return, so no other branch can run.
  if (classification.outcome === "capture") {
    state.mode = "docked";
    state.speed = 0;
    state.pitchRate = 0;
    state.rollRate = 0;
    state.impulse = vec(0, 0, 0);
    state.position = dockMouthPosition(layout);
    state.orientation = layout.stationBaseQuat;
    state.torus = {
      engaged: false,
      factor: 1,
      massLocked: false,
      lastFactor: 1,
    };
    state.dockArmed = false;
    state.dockCount += 1;
    // A dock ends the jump attempt; a relaunch must not resume the countdown.
    clearHyperspaceAttempt(state);
    return [{ kind: "docked", via: "manual", clockDelta: 0 }];
  }

  // Straddle: the opposite-edge failure (D-05). It resolves first and
  // exclusively. The classifier gates it on `box.min.z < 0` (DockEntity.m:727),
  // so `-min.z` below is strictly positive.
  if (classification.outcome === "straddle") {
    const push = -snapshot.box.min.z;
    if (push > 0) {
      state.position = add(
        state.position,
        scale(snapshot.frame.k, push + SEPARATION_MARGIN),
      );
    }
    const event = respondToContact(state, snapshot.frame.k, "straddle", "z");
    return [event];
  }

  // Band: Oolite's positional correction with no velocity change, once per
  // fixed tick (D-03 / D-02). Lane is a silent pass-through: the tunnel
  // interior is not collidable inside the footprint.
  if (classification.outcome === "band") {
    state.position = add(
      state.position,
      add(
        scale(snapshot.frame.i, -classification.deltaX),
        scale(snapshot.frame.j, -classification.deltaY),
      ),
    );
    state.scrapeTicks += 1;
    return [{ kind: "scrape" }];
  }

  if (classification.outcome === "lane") return [];

  // Outside: the only branch that runs the hull SAT. On the arming tick the
  // box begins above `contactPort.zMax`, so the SAT separates along the box
  // z-axis and this returns null — the launch-departure invariant (T-04-54).
  const contact = hullContact(snapshot, geometry.contactPort);
  if (contact === null) return [];

  state.position = add(
    state.position,
    scale(contact.normalWorld, contact.depth + SEPARATION_MARGIN),
  );
  return [respondToContact(state, contact.normalWorld, "hull", contact.axis)];
}
