// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The docking step (DOCK-01, DOCK-02, DOCK-04, D-03, D-04).
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
 * Band and straddle are classification-only in this plan; plan 04-03 owns the
 * single contact-response pipeline.
 */

import { add, scale } from "../math.js";
import type { SimEvent } from "../events.js";
import { dockMouthPosition } from "../flight/state.js";
import type { FlightState } from "../flight/state.js";
import type { SystemLayout } from "../world/layout.js";
import { classifyCorridor, dockSnapshot, isFiniteBox } from "./corridor.js";
import type { DockGeometry } from "./geometry.js";

/**
 * Advance the docking state machine by one fixed step.
 *
 * @returns the events produced by this tick (`docked` or `scrape`).
 */
export function stepDocking(
  state: FlightState,
  layout: SystemLayout,
  geometry: DockGeometry,
): SimEvent[] {
  if (state.mode !== "inFlight") return [];

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

  if (classification.outcome === "capture") {
    state.mode = "docked";
    state.speed = 0;
    state.pitchRate = 0;
    state.rollRate = 0;
    state.position = dockMouthPosition(layout);
    state.orientation = layout.stationBaseQuat;
    // No impulse field exists in this plan; plan 04-03 adds and zeroes it.
    state.torus = {
      engaged: false,
      factor: 1,
      massLocked: false,
      lastFactor: 1,
    };
    state.dockArmed = false;
    state.dockCount += 1;
    return [{ kind: "docked", via: "manual", clockDelta: 0 }];
  }

  // Band/straddle are no-ops in Task 1. Task 2 applies the auto-centre delta
  // and the scrape counter; outside stays a no-op until 04-03.
  return [];
}
