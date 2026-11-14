// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The session's traffic content and populate closure (Phase 12, plan 12-08;
 * WORLD-15, D-01).
 *
 * This is the one populate and mass source shared by the live session and the
 * Node tick replay (Pitfall 11): both build their `TrafficContent` through
 * `trafficContent` and their world lifecycle's `populate` through
 * `createInertPopulate`, so they cannot drift apart.
 *
 * `createInertPopulate` is total, as rule (ii) of the world lifecycle needs: it
 * never awaits, it does nothing unless traffic is on and both the content and the
 * layout exist, and `populateInertWorld` itself skips refusals, caps its loops
 * and drops a record with an unknown scan class before any draw. It reads both
 * getters at call time, so the lifecycle can exist before the catalogue has
 * finished loading and a later system swap is seen.
 *
 * D-01: with traffic off it spawns nothing, draws nothing and burns no id, so a
 * world with no NPC keeps the starting counter 101 and hashes as the flight hash;
 * with traffic on the post-populate counter is 113.
 *
 * The module must stay importable by the Playwright Node runner: pure, no DOM, no
 * Three, and nothing beyond `src/sim` and `import type` from `src/content/types`.
 * `scanClass` is copied as the catalogue's plain string: this module cannot name
 * the id vocabulary, and the populator narrows it.
 */

import type { NpcShip } from "../../content/types.js";
import type { SystemLayout } from "../../sim/world/layout.js";
import { populateInertWorld } from "../../sim/world/populate.js";
import type { InertShipRecord } from "../../sim/world/populate.js";
import type { ShipMass } from "../../sim/world/ship-field.js";
import type { World } from "../../sim/world/world.js";

/** The loaded NPC catalogue as the session uses it. Static content, no entity id. */
export interface TrafficContent {
  readonly catalogue: readonly NpcShip[];
  /** The populator's input, in catalogue order. */
  readonly records: readonly InertShipRecord[];
  /** The step's jump-blockage masses, in catalogue order. */
  readonly masses: readonly ShipMass[];
}

/** Build the populator records and the step masses from the catalogue. */
export function trafficContent(catalogue: readonly NpcShip[]): TrafficContent {
  const ships = Object.freeze([...catalogue]);
  return Object.freeze({
    catalogue: ships,
    records: Object.freeze(
      ships.map((ship): InertShipRecord => ({
        key: ship.key,
        roles: ship.roles,
        scanClass: ship.scanClass,
        radius: ship.radius,
      })),
    ),
    masses: Object.freeze(
      ships.map((ship): ShipMass => ({ specKey: ship.key, mass: ship.mass })),
    ),
  });
}

/**
 * The lifecycle's `Populate` for the inert populator. Structurally the same
 * type as `Populate` in world-lifecycle.ts, which this module does not import.
 */
export function createInertPopulate(
  content: () => TrafficContent | undefined,
  layout: () => SystemLayout | undefined,
): (world: World, options: { readonly traffic: boolean }) => void {
  return (world, { traffic }) => {
    if (!traffic) return;
    const loaded = content();
    const systemLayout = layout();
    if (loaded === undefined || systemLayout === undefined) return;
    populateInertWorld(world, systemLayout, loaded.records);
  };
}
