// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The real NPC weapon map for sim tests (CBT-07, FOUND-20).
 *
 * `src/sim` receives NPC weapon data only as a caller-supplied map, and may not
 * import the generated file. A test reads the committed `ships-npc.json` with
 * `readFileSync` and builds the map the app would build from the content layer
 * (`trafficContent`): each hull's weapons per facing from the compiled
 * `forwardWeapon`/`aftWeapon`/`portWeapon`/`starboardWeapon` and their
 * positions (Oolite model frame), keyed by spec key. The forward entry is always
 * present; an unarmed aft, port or starboard facing is absent.
 */

import { readFileSync } from "node:fs";

import type { NpcWeapon, NpcWeapons } from "../../src/sim/combat/aim.js";
import { isMountKey, NO_LASER } from "../../src/sim/combat/mounts.js";
import { vec } from "../../src/sim/math.js";

type Position = readonly [number, number, number];

interface NpcRecord {
  readonly key: string;
  readonly forwardWeapon: string;
  readonly forwardWeaponPosition: Position;
  readonly aftWeapon?: string;
  readonly aftWeaponPosition?: Position;
  readonly portWeapon?: string;
  readonly portWeaponPosition?: Position;
  readonly starboardWeapon?: string;
  readonly starboardWeaponPosition?: Position;
}

function mount(laser: string, position: Position | undefined): NpcWeapon {
  const [x, y, z] = position ?? [0, 0, 0];
  return {
    laser: isMountKey(laser) ? laser : NO_LASER,
    offset: vec(x, y, z),
  };
}

function armed(
  laser: string | undefined,
  position: Position | undefined,
): NpcWeapon | undefined {
  if (laser === undefined || !isMountKey(laser) || laser === NO_LASER) {
    return undefined;
  }
  return mount(laser, position);
}

/** The generated NPC hulls' weapons per facing, keyed by spec key. */
export function realNpcWeapons(): ReadonlyMap<string, NpcWeapons> {
  const records = JSON.parse(
    readFileSync(
      new URL("../../src/content/generated/ships-npc.json", import.meta.url),
      "utf8",
    ),
  ) as NpcRecord[];
  const map = new Map<string, NpcWeapons>();
  for (const record of records) {
    const aft = armed(record.aftWeapon, record.aftWeaponPosition);
    const port = armed(record.portWeapon, record.portWeaponPosition);
    const starboard = armed(
      record.starboardWeapon,
      record.starboardWeaponPosition,
    );
    map.set(record.key, {
      fore: mount(record.forwardWeapon, record.forwardWeaponPosition),
      ...(aft === undefined ? {} : { aft }),
      ...(port === undefined ? {} : { port }),
      ...(starboard === undefined ? {} : { starboard }),
    });
  }
  return map;
}
