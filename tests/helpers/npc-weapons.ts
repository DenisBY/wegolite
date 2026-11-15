// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The real NPC weapon map for sim tests (CBT-07).
 *
 * `src/sim` receives NPC weapon data only as a caller-supplied map, and may not
 * import the generated file. A test reads the committed `ships-npc.json` with
 * `readFileSync` and builds the map the app would build from the content layer:
 * each hull's `forwardWeapon` and `forwardWeaponPosition` (Oolite model frame),
 * keyed by spec key.
 */

import { readFileSync } from "node:fs";

import type { NpcWeapon } from "../../src/sim/combat/aim.js";
import { isMountKey, NO_LASER } from "../../src/sim/combat/mounts.js";
import { vec } from "../../src/sim/math.js";

interface NpcRecord {
  readonly key: string;
  readonly forwardWeapon: string;
  readonly forwardWeaponPosition: readonly [number, number, number];
}

/** The nine generated NPC hulls' forward weapons, keyed by spec key. */
export function realNpcWeapons(): ReadonlyMap<string, NpcWeapon> {
  const records = JSON.parse(
    readFileSync(
      new URL("../../src/content/generated/ships-npc.json", import.meta.url),
      "utf8",
    ),
  ) as NpcRecord[];
  const map = new Map<string, NpcWeapon>();
  for (const record of records) {
    const [x, y, z] = record.forwardWeaponPosition;
    map.set(record.key, {
      laser: isMountKey(record.forwardWeapon) ? record.forwardWeapon : NO_LASER,
      offset: vec(x, y, z),
    });
  }
  return map;
}
