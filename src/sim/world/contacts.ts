// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `npcContacts`: the scanner's view of the world's NPC ships (Phase 12,
 * WORLD-15, scanner half).
 *
 * This is the only world-to-presentation channel for NPC ships. A contact is a
 * plain snapshot with no entity identifier: the HUD, the probe and any later
 * presentation holder receive positions and a colour class, never a handle
 * into the world, so nothing outside the world can outlive it (per-world id
 * scope, CONTEXT D-06 as amended 2026-11-12). Every vector and quaternion is
 * copied, so mutating a contact never changes an entity.
 *
 * Like `view-impl.ts` it reads the live store without changing it and walks it
 * in ascending id order, so the order of the contacts is the order of spawning.
 * It allocates one small array per rendered frame, outside the fixed step.
 *
 * The kind is the scanner colour class only: Oolite draws a police ship in
 * `police_color1` and every other non-hostile ship in `neutral_color`
 * (`ShipEntity.m` lines 5582-5586). Hostility, cargo and the other classes
 * come with the phases that give them meaning.
 */

import type { Quat, Vec3 } from "../math.js";
import type { World } from "./world.js";

/** The scanner colour class of a ship contact. */
export type NpcContactKind = "neutral" | "police";

/** One NPC ship as the scanner sees it. Plain data, no entity id. */
export interface NpcContact {
  readonly position: Vec3;
  readonly orientation: Quat;
  readonly radius: number;
  readonly specKey: string;
  readonly kind: NpcContactKind;
}

/**
 * The live ships of `world` as id-free contacts, in ascending id order; empty
 * for no world. Dead entities (awaiting the tick-end commit) are skipped.
 */
export function npcContacts(world: World | undefined): readonly NpcContact[] {
  if (world === undefined) return [];
  const contacts: NpcContact[] = [];
  for (const entity of world.store.live) {
    if (entity.dead || entity.kind !== "ship") continue;
    contacts.push({
      position: {
        x: entity.position.x,
        y: entity.position.y,
        z: entity.position.z,
      },
      orientation: {
        w: entity.orientation.w,
        x: entity.orientation.x,
        y: entity.orientation.y,
        z: entity.orientation.z,
      },
      radius: entity.radius,
      specKey: entity.specKey,
      kind: entity.scanClass === "CLASS_POLICE" ? "police" : "neutral",
    });
  }
  return contacts;
}

/**
 * One piece of debris (a cargo pod, a metal plate or a wreck) as the render
 * sees it (WORLD-17). Plain data, no entity id, every vector and quaternion
 * copied, like `NpcContact`.
 *
 * Debris is presentation-only here: it is drawn, never shown on the scanner.
 * Oolite draws `CLASS_CARGO` on the scanner; that gap is recorded (D16-26) and
 * deferred with scooping (CBT-11), so `npcContacts` stays ships only.
 */
export interface DebrisContact {
  readonly position: Vec3;
  readonly orientation: Quat;
  readonly radius: number;
  readonly specKey: string;
}

/**
 * The live cargo and wreckage of `world` as id-free contacts, in ascending id
 * order; empty for no world. Dead entities (awaiting the tick-end commit) are
 * skipped. Ships and every other kind are left to `npcContacts`.
 */
export function debrisContacts(
  world: World | undefined,
): readonly DebrisContact[] {
  if (world === undefined) return [];
  const contacts: DebrisContact[] = [];
  for (const entity of world.store.live) {
    if (entity.dead) continue;
    if (entity.kind !== "cargo" && entity.kind !== "wreckage") continue;
    contacts.push({
      position: {
        x: entity.position.x,
        y: entity.position.y,
        z: entity.position.z,
      },
      orientation: {
        w: entity.orientation.w,
        x: entity.orientation.x,
        y: entity.orientation.y,
        z: entity.orientation.z,
      },
      radius: entity.radius,
      specKey: entity.specKey,
    });
  }
  return contacts;
}
