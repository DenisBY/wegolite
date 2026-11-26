// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The per-step `StepOptions` builder (Phase 8, D-12 step 8, D-14).
 *
 * The session derives the same read-only facts for every fixed step: the owned
 * equipment, the fuel, the origin system, the committed target, the origin
 * station's and the buoys' witchspace masses and the dock geometry. This module is the one place
 * that assembles them, so the live session and a Node tick replay (plans 08-14
 * and 08-16) cannot drift apart.
 *
 * Phase 19 adds the player's internal-damage facts (`internalDamageFactsFor`),
 * which the session derives from the live profile and the loaded catalogues.
 * The Node tick replay (`tests/helpers/tick-script.ts`) builds none: the roll
 * only emits events that the session's damage flow commits to the profile, and
 * the replay neither routes them nor hashes the profile, so its world hash
 * cannot move.
 *
 * It must stay importable by the Playwright Node runner: pure, no DOM, no Three,
 * no `import.meta.glob`, and nothing beyond `src/sim` and one type import from
 * `src/content/types.ts`.
 */

import type { Commodity, Equipment, System } from "../../content/types.js";
import type { NpcWeapons } from "../../sim/combat/aim.js";
import type { HullTable } from "../../sim/combat/hit.js";
import type { InternalDamageFacts } from "../../sim/combat/internal-damage.js";
import type { LaserMounts } from "../../sim/combat/mounts.js";
import type { DockGeometry } from "../../sim/dock/geometry.js";
import { capacityPodsFor, holdPods } from "../../sim/economy/cargo.js";
import { firstGenerationMarket } from "../../sim/economy/market.js";
import type { StepOptions } from "../../sim/flight/step.js";
import {
  NAV_BUOY_MASS,
  witchspaceStationMass,
} from "../../sim/hyperspace/countdown.js";
import type { NpcFlightStats } from "../../sim/npc/stats.js";
import type { PlayerProfile } from "../../sim/player/profile.js";
import type { DebrisContent, PodMarketEntry } from "../../sim/world/debris.js";
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
  /** The NPC weapons per facing keyed by spec key; absent with traffic off. */
  readonly npcWeapons?: ReadonlyMap<string, NpcWeapons>;
  /**
   * The compiled NPC flight table (AI-01, plan 14-18), from `flightTableFrom`;
   * absent with traffic off. The session and the Node replay hand the same list
   * to the step.
   */
  readonly npcFlight?: readonly NpcFlightStats[];
  /**
   * The compiled debris content (WORLD-17, plan 16-06), from
   * `debrisContentFrom`. Absent with traffic off, and absent means a kill
   * releases no debris. The session and the Node replay hand the same content
   * to the step.
   */
  readonly debris?: DebrisContent;
  /**
   * The player's internal-damage facts (CBT-08, D-01, D-03), from
   * `internalDamageFactsFor`. Absent until both the equipment catalogue and the
   * commodities are loaded, and absent means no roll: a probability is never
   * guessed.
   */
  readonly internalDamage?: InternalDamageFacts;
}

/**
 * The read-only facts of the player's internal-damage roll (CBT-08, D-01, D-03)
 * derived from the live profile and the loaded catalogues.
 *
 * `items` follow `profile.equipment` order (Oolite's insertion order), each with
 * its compiled `damageProbability` (0 for a key the catalogue lacks). A key with
 * probability 0 stays listed, as the pick walks every installed item in
 * Oolite (`PlayerEntity.m:6130-6137`), but it adds nothing there and the roll
 * counts it toward neither the damageable slots nor the odds (`:6119-6126`,
 * `canBeDamaged`), so it never changes the roll.
 * `capacityPods` is Oolite's `maxAvailableCargoSpace` (`ShipEntity.m:7198-7201`),
 * the hold's capacity and not its free space. `pods` is `holdPods` of the hold.
 * Pure; never mutates the profile or the catalogues.
 */
export function internalDamageFactsFor(
  profile: Pick<PlayerProfile, "equipment" | "passengerBerths" | "cargo">,
  catalogue: readonly Pick<Equipment, "key" | "damageProbability">[],
  commodities: readonly Pick<Commodity, "key" | "unit" | "sortOrder">[],
): InternalDamageFacts {
  const probabilities = new Map<string, number>();
  for (const record of catalogue) {
    probabilities.set(record.key, record.damageProbability);
  }
  return {
    items: profile.equipment.map((key) => ({
      key,
      damageProbability: probabilities.get(key) ?? 0,
    })),
    capacityPods: capacityPodsFor(profile.equipment, profile.passengerBerths),
    pods: holdPods(profile.cargo, commodities),
  };
}

/**
 * The debris content per system, derived once per content object and system
 * (plan 21-15): a pod's draw is a pure function of the content, so the same
 * object comes back for the same inputs and no step rebuilds the market. The
 * inner key is the system id and its economy, the two inputs
 * `firstGenerationMarket` reads (review APP-IN-02): in shipped content the id
 * determines the economy, but the cache is module-wide, so a caller that reuses
 * one content object with a synthetic system of the same id and another economy
 * must not get the first market.
 */
const debrisBySystem = new WeakMap<DebrisContent, Map<string, DebrisContent>>();

/**
 * The debris content with the current system's first-generation market (plan
 * 21-15, CBT-11's pod clause): the stock per commodity key of the system's
 * first-generation market (`firstGenerationMarket`, the market at
 * `marketSeedForSystem(system.id)`), a pure function of the system and its seed. It is never the player-modified live
 * market (RESEARCH A6): what the player buys or sells must not change a pod's
 * contents, and the Node replay (which has no live market) builds the same
 * options. Content without `goods`, or already carrying a `market`, passes
 * through unchanged. The result is frozen.
 */
function debrisWithMarket(
  debris: DebrisContent,
  system: Pick<System, "id" | "economy">,
): DebrisContent {
  if (debris.goods === undefined || debris.market !== undefined) return debris;
  let bySystem = debrisBySystem.get(debris);
  if (bySystem === undefined) {
    bySystem = new Map();
    debrisBySystem.set(debris, bySystem);
  }
  const key = `${system.id}:${String(system.economy)}`;
  const cached = bySystem.get(key);
  if (cached !== undefined) return cached;
  const market: readonly PodMarketEntry[] = Object.freeze(
    firstGenerationMarket(system, debris.goods).goods.map(
      (good): PodMarketEntry =>
        Object.freeze({
          key: good.key,
          quantity: good.stock,
        }),
    ),
  );
  const derived: DebrisContent = Object.freeze({ ...debris, market });
  bySystem.set(key, derived);
  return derived;
}

/**
 * Build one step's options. `hyperspace.buoyMass` is always `NAV_BUOY_MASS`.
 * Optional keys are omitted rather than set to
 * `undefined` (`exactOptionalPropertyTypes`): `target` only when a target is
 * committed, `stationMass` only when the origin's station kind has a recorded
 * mass, `shipMasses` only when the caller has them, `dock` only when the
 * geometry exists, `npcFlight` only when the caller has the table, and
 * `combat.hulls`, `combat.npcWeapons`, `combat.debris` and
 * `combat.internalDamage` only when the caller has them. `combat.debris`
 * carries the current system's first-generation market when the content has
 * `goods` (plan 21-15). `combat` itself is always present: it carries the mounts.
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
    debris,
    internalDamage,
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
    // Every system has both buoys, so the buoy mass is always supplied (D-09).
    buoyMass: NAV_BUOY_MASS,
    ...(shipMasses === undefined ? {} : { shipMasses }),
  };
  const combat = {
    mounts: laserMounts,
    // The collision stage is opt-in (CBT-18): the app turns it on; the frozen
    // acceptance harness never does.
    collisions: true,
    ...(hulls === undefined ? {} : { hulls }),
    ...(npcWeapons === undefined ? {} : { npcWeapons }),
    ...(debris === undefined
      ? {}
      : { debris: debrisWithMarket(debris, system) }),
    ...(internalDamage === undefined ? {} : { internalDamage }),
  };
  const base = {
    equipment,
    hyperspace,
    combat,
    ...(npcFlight === undefined ? {} : { npcFlight }),
  };
  return dock === undefined ? base : { dock, ...base };
}
