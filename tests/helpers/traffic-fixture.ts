// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The regenerated Lave inert world and a pose next to its first ship (Phase 12,
 * plan 12-10).
 *
 * One geometry for two proofs: the Node HUD row of tests/ui/hud-model.test.ts
 * and the browser reload check of plan 12-12 both place the player with
 * `poseNearFirstShip`, so the browser scanner check can never be vacuous (a
 * world whose ships are all out of range would pass an "every contact is
 * visible" check for no reason).
 *
 * The world is built the way a session builds it: the committed NPC records go
 * through `trafficContent` and `createInertPopulate` (src/app/session/traffic.ts,
 * the one populate source shared with the Node tick replay), over a world seeded
 * by `worldSeedFor(marketSeedForSystem("g0-s7"), epoch)`. Node-importable:
 * `readFileSync` only, no DOM and no `import.meta.glob`.
 */

import { readFileSync } from "node:fs";

import { NpcShipCatalogueSchema } from "../../src/content/schemas/ship-npc.js";
import {
  createInertPopulate,
  trafficContent,
} from "../../src/app/session/traffic.js";
import type { TrafficContent } from "../../src/app/session/traffic.js";
import { marketSeedForSystem } from "../../src/sim/economy/market.js";
import type { Quat, Vec3 } from "../../src/sim/math.js";
import { worldSeedFor } from "../../src/sim/rng.js";
import { npcContacts } from "../../src/sim/world/contacts.js";
import { createWorld } from "../../src/sim/world/world.js";
import type { World } from "../../src/sim/world/world.js";
import { LAVE_SYSTEM_ID, laveFixture } from "./lave.js";

/** A player pose: where the ship is and how it points. */
export interface FixturePose {
  readonly position: Vec3;
  readonly orientation: Quat;
  readonly speed: number;
}

/** The committed NPC records as the session loads them. */
function committedTrafficContent(): TrafficContent {
  const raw = readFileSync(
    new URL("../../src/content/generated/ships-npc.json", import.meta.url),
    "utf8",
  );
  return trafficContent(NpcShipCatalogueSchema.parse(JSON.parse(raw)));
}

/**
 * The Lave world of `epoch` with traffic on: `createWorld(worldSeedFor(
 * marketSeedForSystem("g0-s7"), epoch))` populated over the Lave layout with the
 * committed records (12 inert ships, ids 101 to 112).
 */
export function laveInertWorld(epoch: number): World {
  const { layout } = laveFixture();
  const content = committedTrafficContent();
  const world = createWorld(
    worldSeedFor(marketSeedForSystem(LAVE_SYSTEM_ID), epoch),
  );
  createInertPopulate(
    () => content,
    () => layout,
  )(world, { traffic: true });
  return world;
}

/**
 * A player pose `metres` from the lowest-id ship of `laveInertWorld(epoch)`,
 * along +x from that ship, with identity orientation and speed 0.
 */
export function poseNearFirstShip(epoch: number, metres: number): FixturePose {
  const first = npcContacts(laveInertWorld(epoch))[0];
  if (first === undefined) {
    throw new Error(`the Lave world of epoch ${epoch} holds no ship`);
  }
  return {
    position: {
      x: first.position.x + metres,
      y: first.position.y,
      z: first.position.z,
    },
    orientation: { w: 1, x: 0, y: 0, z: 0 },
    speed: 0,
  };
}
