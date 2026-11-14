// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The world lifecycle (Phase 8, plan 08-15; D-02, D-03, D-05, D-06 as amended
 * 2026-11-12, D-14).
 *
 * The session owns at most one `World` and the `epoch` that seeded it. There is
 * no world while the ship is docked: the `launched` event and a hyperspace
 * arrival `begin` one (bump the epoch, then derive `worldSeedFor(marketSeed,
 * epoch)`), a cold boot Continue or a warm in-session Load of an in-flight save
 * `resume`s one without a bump, and the `docked` event and `dispose()` `end` it
 * while preserving the epoch, so a normal dock then launch keeps advancing it.
 *
 * Epoch lives in session memory and starts at 0 (D-03). Since Phase 11
 * (SAVE-07) a v3 save persists the epoch and the anchor counter; the cold
 * Continue and the warm Load both pass `save.epoch` to `resetForRestore` before
 * an in-flight `resume`, so both restore the same epoch and the same world
 * seed. A migrated v1 or v2 save carries epoch 0, which is the Phase 8
 * behaviour (0 after the restore, 1 at the next launch or arrival).
 *
 * The leg-anchor counter (Phase 11, SAVE-07, D-01, D-05) is `anchorNextEntityId`:
 * the `store.nextId` of the world that `begin` or `resume` created, read right
 * after `populate`. It is read there, never mid-leg, because the save layer
 * persists the issuing world's counter at the leg anchor, and a spawn later in
 * the same leg moves the live counter but not the anchor. It counts issued ids
 * and names no entity, so this module still imports no id type.
 *
 * Every creation builds a fresh `World` through `createWorld`, so dynamic ids
 * restart at 101 in each new world, and this module holds no entity id and
 * imports no id type: no id survives `end`, `resetForRestore`, `begin` or
 * `resume` (per-world id scope, CONTEXT D-06 as amended 2026-11-12). A world is
 * never reset or reused, so its queued AI events and every entity's AI state
 * die with it.
 *
 * Three rules for later phases:
 *
 * (i) The one-tick latency is the parity-critical detail. The world is created in the
 * router's reaction to the `launched` event, which runs after the launch step,
 * so it is first stepped on the tick after the launch step. Every replay (plan
 * 08-13's cadence test, plan 08-16's tick script) must mirror that.
 *
 * (ii) `begin` runs `populate` inside the arrival's synchronous install block,
 * whose invariant is that everything that can throw runs before any live
 * reference moves. `populateNothing` cannot throw, and neither can the inert
 * populator of Phase 12: `populateInertWorld` is total (a `spawnEntity` refusal
 * is skipped, every loop is capped, records are pre-validated and a record with
 * an unknown scan class is dropped before any draw), and its closure never
 * awaits. A later populator that can throw must be split into a fallible
 * prepare step that runs before the install block and a commit that cannot
 * fail.
 *
 * (iii) D-01, decided in Phase 12. The epoch and each fresh world's starting
 * counter (next id 101 before populate) are the same with traffic on and off.
 * Populate does not burn ids with traffic off: the post-populate counter, and
 * so the leg anchor, is 113 with traffic on (the 12 inert ships take ids 101 to
 * 112) and 101 with traffic off, and a world with no NPC keeps hashing as the
 * v1 flight hash.
 *
 * The module must stay importable by the Playwright Node runner (plan 08-16):
 * pure, no DOM, no Three, and nothing beyond `src/sim`. A Vitest guard in
 * tests/app/session/world-lifecycle.test.ts enforces that.
 */

import { worldSeedFor } from "../../sim/rng.js";
import { createWorld } from "../../sim/world/world.js";
import type { World } from "../../sim/world/world.js";

/** The largest epoch value (uint32): `worldSeedFor` accepts exactly 0..this. */
const MAX_EPOCH = 0xffffffff;

/**
 * The largest epoch a live session may reach: the largest epoch a v3 save can
 * carry (`MAX_SAVE_EPOCH`, D-04), so every live epoch is writable. `begin`
 * refuses a bump past it; `worldSeedFor` itself still accepts 0xffffffff.
 */
const MAX_LIVE_EPOCH = MAX_EPOCH - 1;

/**
 * Fill a freshly created world. Phase 8 supplies `populateNothing` in both
 * traffic modes; Phase 12 supplies the inert populator and Phase 22 full
 * traffic.
 */
export type Populate = (
  world: World,
  options: { readonly traffic: boolean },
) => void;

/** Adds nothing, in either traffic mode. */
export const populateNothing: Populate = () => undefined;

export interface WorldLifecycle {
  /** The live world, or undefined while docked or before the first launch. */
  readonly world: World | undefined;
  /** The session-memory epoch (D-03); 0 until the first `begin`. */
  readonly epoch: number;
  /**
   * The leg-anchor counter (Phase 11, SAVE-07, D-01, D-05): the `store.nextId`
   * of the world that `begin` or `resume` created, read right after `populate`.
   * A spawn later in the same leg therefore never moves it. It is undefined
   * while no world exists: before the first creation, after `end` and after
   * `resetForRestore`. It counts issued ids and names no entity (per-world id
   * scope, the plan 08-05 Key Decisions row).
   */
  readonly anchorNextEntityId: number | undefined;
  /**
   * Bump the epoch, derive `worldSeedFor(marketSeed, epoch)` and create a
   * world. Refuses (epoch and world unchanged, no throw) when `marketSeed` is
   * not finite or the epoch has reached 0xfffffffe, the largest epoch a v3
   * save can carry (D-04), so a live epoch is always writable.
   */
  begin(marketSeed: number): void;
  /**
   * Create a world from the current epoch without a bump (an in-flight
   * Continue or Load). Refuses like `begin` for a non-finite seed.
   */
  resume(marketSeed: number): void;
  /** Drop the world and keep the epoch. */
  end(): void;
  /**
   * Re-anchor a restored session: drop the world and set the epoch. Accepts
   * exactly the epochs from which `begin` can still bump (0..0xfffffffe) and
   * returns true; any other value sets epoch 0 and returns false, so a saturated
   * or corrupt epoch can be surfaced rather than silently disabling worlds.
   * The restore paths pass the saved epoch; the v3 schema bounds it to
   * 0..0xfffffffe (D-04), so false is unreachable from a valid save.
   */
  resetForRestore(epoch?: number): boolean;
}

/** A lifecycle with epoch 0 and no world (D-03). `populate` defaults to nothing. */
export function createWorldLifecycle(options: {
  readonly traffic: boolean;
  readonly populate?: Populate;
}): WorldLifecycle {
  const { traffic } = options;
  const populate = options.populate ?? populateNothing;
  let epoch = 0;
  let world: World | undefined;
  let anchorNextEntityId: number | undefined;

  function create(marketSeed: number, worldEpoch: number): World {
    const created = createWorld(worldSeedFor(marketSeed, worldEpoch));
    populate(created, { traffic });
    return created;
  }

  return {
    get world() {
      return world;
    },
    get epoch() {
      return epoch;
    },
    get anchorNextEntityId() {
      return anchorNextEntityId;
    },
    begin(marketSeed) {
      if (
        !Number.isFinite(marketSeed) ||
        !Number.isSafeInteger(epoch) ||
        epoch < 0 ||
        epoch >= MAX_LIVE_EPOCH
      ) {
        return;
      }
      // Build first, commit after: a throwing populator leaves both unchanged.
      const next = epoch + 1;
      const created = create(marketSeed, next);
      world = created;
      epoch = next;
      anchorNextEntityId = created.store.nextId;
    },
    resume(marketSeed) {
      if (
        !Number.isFinite(marketSeed) ||
        !Number.isSafeInteger(epoch) ||
        epoch < 0 ||
        epoch > MAX_EPOCH
      ) {
        return;
      }
      const created = create(marketSeed, epoch);
      world = created;
      anchorNextEntityId = created.store.nextId;
    },
    end() {
      world = undefined;
      anchorNextEntityId = undefined;
    },
    resetForRestore(restoredEpoch = 0) {
      world = undefined;
      anchorNextEntityId = undefined;
      if (
        Number.isSafeInteger(restoredEpoch) &&
        restoredEpoch >= 0 &&
        restoredEpoch < MAX_EPOCH
      ) {
        epoch = restoredEpoch;
        return true;
      }
      epoch = 0;
      return false;
    },
  };
}

/**
 * Re-anchor a restored session (D-06): set the saved epoch, then, for an
 * in-flight save, rebuild the anchor world from the market seed without a bump.
 * The cold boot Continue and the warm Load both call this, in the same position
 * (after the market seed is installed), so they give the same epoch and the
 * same world seed. The result of `resetForRestore` is not branched on (D-04):
 * the v3 schema bounds the epoch to the domain the lifecycle accepts. A docked
 * save keeps no world until the next launch bumps the epoch. A lifecycle that
 * is absent is a no-op.
 */
export function restoreWorldAnchor(
  lifecycle: WorldLifecycle | undefined,
  savedEpoch: number,
  marketSeed: number | undefined,
  inFlight: boolean,
): void {
  lifecycle?.resetForRestore(savedEpoch);
  if (inFlight && marketSeed !== undefined) lifecycle?.resume(marketSeed);
}
