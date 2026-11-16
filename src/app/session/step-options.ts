// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The per-step `StepOptions` builder (Phase 8, D-12 step 8, D-14).
 *
 * The session derives the same read-only facts for every fixed step: the owned
 * equipment, the fuel, the origin system, the committed target, the origin
 * station's witchspace mass and the dock geometry. This module is the one place
 * that assembles them, so the live session and a Node tick replay (plans 08-14
 * and 08-16) cannot drift apart.
 *
 * It must stay importable by the Playwright Node runner: pure, no DOM, no Three,
 * no `import.meta.glob`, and nothing beyond `src/sim` and one type import from
 * `src/content/types.ts`.
 */

import type { System } from "../../content/types.js";
import type { NpcWeapon } from "../../sim/combat/aim.js";
import type { HullTable } from "../../sim/combat/hit.js";
import type { LaserMounts } from "../../sim/combat/mounts.js";
import type { DockGeometry } from "../../sim/dock/geometry.js";
import type { StepOptions } from "../../sim/flight/step.js";
import { witchspaceStationMass } from "../../sim/hyperspace/countdown.js";
import type { NpcFlightStats } from "../../sim/npc/stats.js";
import type { ShipMass } from "../../sim/world/ship-field.js";

/** The facts one fixed step needs; every field is read live by the caller. */
export interface StepOptionsInput {
  readonly fuel: number;
  /** The live origin system. */
  readonly system: System;
  /** The committed target record, when one is committed. */
  readonly target: System | undefined;
  /** One read-only set per step, derived from the profile (T-04-19). */
  readonly equipment: ReadonlySet<string>;
  /** The validated dock geometry; absent before the boot install. */
  readonly dock: DockGeometry | undefined;
  /**
   * The compiled NPC ship masses keyed by spec key, for ship jump blockage
   * (WORLD-10). Absent when the session has none; the session and the Node
   * replay hand the same list to the step.
   */
  readonly shipMasses?: readonly ShipMass[];
  /**
   * The laser fitted on each facing, read from the validated profile (T-13-24);
   * a mount never travels in a command.
   */
  readonly laserMounts: LaserMounts;
  /**
   * The loaded hull table (CBT-07, D-01). Absent until the lazy hull chunk has
   * loaded, and always absent with traffic off: a shot is then drawn but hits
   * nothing.
   */
  readonly hulls?: HullTable;
  /** The NPC forward weapons keyed by spec key; absent with traffic off. */
  readonly npcWeapons?: ReadonlyMap<string, NpcWeapon>;
  /**
   * The compiled NPC flight table (AI-01, plan 14-18), from `flightTableFrom`;
   * absent with traffic off. The session and the Node replay hand the same list
   * to the step.
   */
  readonly npcFlight?: readonly NpcFlightStats[];
}

/**
 * Build one step's options. Optional keys are omitted rather than set to
 * `undefined` (`exactOptionalPropertyTypes`): `target` only when a target is
 * committed, `stationMass` only when the origin's station kind has a recorded
 * mass, `shipMasses` only when the caller has them, `dock` only when the
 * geometry exists, `npcFlight` only when the caller has the table, and
 * `combat.hulls` and `combat.npcWeapons` only when the caller has them. `combat` itself is always present: it carries the mounts.
 */
export function buildStepOptions(input: StepOptionsInput): StepOptions {
  const {
    fuel,
    system,
    target,
    equipment,
    dock,
    shipMasses,
    laserMounts,
    hulls,
    npcWeapons,
    npcFlight,
  } = input;
  // The read-only station mass of the live system's station kind. Only a
  // Coriolis station has a recorded mass; the others omit the fact.
  const stationMass = witchspaceStationMass(system.station);
  const hyperspace = {
    fuel,
    origin: {
      id: system.id,
      x: system.chartX,
      y: system.chartY,
    },
    ...(target === undefined
      ? {}
      : {
          target: {
            id: target.id,
            x: target.chartX,
            y: target.chartY,
          },
        }),
    ...(stationMass === undefined ? {} : { stationMass }),
    ...(shipMasses === undefined ? {} : { shipMasses }),
  };
  const combat = {
    mounts: laserMounts,
    ...(hulls === undefined ? {} : { hulls }),
    ...(npcWeapons === undefined ? {} : { npcWeapons }),
  };
  const base = {
    equipment,
    hyperspace,
    combat,
    ...(npcFlight === undefined ? {} : { npcFlight }),
  };
  return dock === undefined ? base : { dock, ...base };
}
