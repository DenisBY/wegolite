// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `retireShip`: the non-lethal removal of a live ship (Phase 21, pitfall C11).
 *
 * It is the sibling of `killShip` (`./kill.ts`). A ship that dies goes through
 * `killShip`; a ship that departs (docks, jumps, lands, expires) goes through
 * this function. A departing ship never explodes, never drops cargo or
 * wreckage, credits nothing, posts no `shipDestroyed`, releases no debris and
 * draws from no random stream. Oolite's docking, wormhole and landing exits
 * remove the ship the same way, without `becomeExplosion`.
 *
 * It marks the ship dead through `world.store.kill`; it leaves `live` at the
 * next `commitWorld`, whose caller emits the `entityRemoved` (`stepWorld` and
 * the second commit of `resolveShots`). Every live ship that held the departed
 * ship as its target is told `shipTargetLost`, in ascending id, through
 * `postAiEvent` (never delivered here), exactly as `killShip` tells the holders
 * of a victim, minus the killer's pair.
 *
 * WORLD-09's departure stand-in (Phase 23) is the first caller. Until then no
 * production path calls it; `tests/guards/departure-path.test.ts` keeps the
 * two removal paths apart.
 *
 * Total: a missing, dead, static, non-ship or non-finite id changes nothing
 * and returns false; it never throws and returns true at most once per id.
 */

import type { EntityId } from "./ids.js";
import { postAiEvent } from "./world.js";
import type { World } from "./world.js";

/**
 * Why a ship departs. Telemetry and tests only: it is never stored, hashed or
 * written to an event.
 */
export type RetireReason = "docked" | "jumped" | "landed" | "expired";

/**
 * Remove the live ship `id` without dying: returns true when it was marked
 * dead, false (and nothing changes) for a missing id, a dead entity or an
 * entity that is not a ship. `reason` is accepted for the caller's telemetry
 * and is not used.
 */
export function retireShip(
  world: World,
  id: EntityId,
  reason: RetireReason,
): boolean {
  void reason;
  const entity = world.store.get(id);
  if (entity === undefined || entity.dead || entity.kind !== "ship") {
    return false;
  }
  if (!world.store.kill(id)) return false;
  for (const holder of world.store.live) {
    if (holder.dead || holder.kind !== "ship" || holder.id === id) continue;
    if (holder.nav.targetId !== id) continue;
    postAiEvent(world, { to: holder.id, name: "shipTargetLost" });
  }
  return true;
}
