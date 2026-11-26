// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The launch-corridor measurement of Phase 22 plan 22-12 (D-02).
 *
 * Until Phase 23 an inert ship can sit on the dock axis, where a launching player
 * would hit it. This counts the live ships whose centre lies inside the docking
 * aperture of `src/sim/dock/corridor.ts` (the half extents `ww` and `hh` of the
 * dock geometry, on the port frame's `i` and `j` axes), widened by the ship's
 * radius, between the port plane and the end of the launch path along the
 * station's outward axis `k`. No exclusion zone is added and no ship is moved
 * (D-02); the number is a measurement handed to Phase 23.
 *
 * The launch path is the scripted exit: `beginLaunch` parks the ship at the dock
 * mouth and `stepLaunch` holds `config.launchSpeed` (half the player's top speed)
 * for `LAUNCH_DURATION` seconds along the nose axis, which is the port's outward
 * axis. The frame is the port frame at station angle 0, the angle `beginLaunch`
 * sets; the station rolls during the exit, but the hull rolls with it (D-10), so
 * the slot stays fixed relative to the player.
 */

import type { DockGeometry } from "../../src/sim/dock/geometry.js";
import { portFrame } from "../../src/sim/dock/port-frame.js";
import { LAUNCH_DURATION } from "../../src/sim/flight/launch.js";
import { dot, sub } from "../../src/sim/math.js";
import type { Entity } from "../../src/sim/world/entity.js";
import type { SystemLayout } from "../../src/sim/world/layout.js";
import type { World } from "../../src/sim/world/world.js";
import { laveFixture } from "./lave.js";

let cachedPath: number | undefined;

/**
 * The length of the scripted launch path in metres: the launch speed held for
 * `LAUNCH_DURATION` seconds (the Cobra Mk III, the only ship a player launches).
 */
export function launchPathLength(): number {
  // `laveFixture` reads and parses the content files on every call; the path is
  // the same for every system, so it is computed once.
  cachedPath ??= laveFixture().config.launchSpeed * LAUNCH_DURATION;
  return cachedPath;
}

/**
 * The live ships of `world` whose centre lies in the launch corridor of the
 * station in `layout`: within `ww + radius` and `hh + radius` of the dock axis and
 * between `-radius` and `launchDistance + radius` along it, measured from the dock
 * mouth.
 */
export function launchCorridorShips(
  world: World,
  layout: SystemLayout,
  dock: DockGeometry,
  launchDistance: number = launchPathLength(),
): readonly Entity[] {
  const frame = portFrame(layout, 0);
  const { ww, hh } = dock.corridor;
  const hits: Entity[] = [];
  for (const ship of world.store.live) {
    const relative = sub(ship.position, frame.origin);
    const x = dot(relative, frame.i);
    const y = dot(relative, frame.j);
    const z = dot(relative, frame.k);
    const reach = ship.radius;
    if (
      Math.abs(x) < ww + reach &&
      Math.abs(y) < hh + reach &&
      z > -reach &&
      z < launchDistance + reach
    ) {
      hits.push(ship);
    }
  }
  return hits;
}

/** How many live ships of `world` lie in the launch corridor (see {@link launchCorridorShips}). */
export function launchCorridorHits(
  world: World,
  layout: SystemLayout,
  dock: DockGeometry,
  launchDistance: number = launchPathLength(),
): number {
  return launchCorridorShips(world, layout, dock, launchDistance).length;
}
