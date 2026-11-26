// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The forked streams of the initial populator (Phase 22, WORLD-08, pitfall C4).
 *
 * Oolite's populator draws everything from one global `Math.random` stream, so
 * the whole population depends on how many draws every earlier entry took. The
 * port gives every entry, every group of an entry and every draw site of a
 * group a stream of its own, all stateless forks of the world seed:
 *
 * - `countDraws(worldSeed, ordinal)`: the entry's `count` stream, the three
 *   draws of its `randomise`: `createRngState(mix32(forkSeed(worldSeed,
 *   ordinal, "pop"), 0))`;
 * - `populationDraws(worldSeed, ordinal, groupIndex)`: one stream per tag,
 *   created on first use from `mix32(mix32(forkSeed(worldSeed, ordinal,
 *   "pop"), groupIndex + 1), POPULATION_TAG_CODES[tag])`.
 *
 * `ordinal` is the registration index of the entry in `POPULATOR_ENTRIES`, so
 * no stream depends on an entity id, on another entry's count or on the order
 * the groups are placed. The port is therefore statistically equal to Oolite,
 * not stream-equal; the replay tests feed the recorded draws through the same
 * {@link PopulationDraws} interface and are exact (assumption A8).
 *
 * The module is pure: no clock, no platform randomness, no `Math.random`.
 */

import { createRngState, forkSeed, mix32, rngNext } from "../../rng.js";
import type { CountDraws } from "./plan.js";

/**
 * The tag codes of the group streams, by key. Append-only: a code is part of
 * the stream contract (changing one re-rolls every population) and a new tag
 * takes the next number. The compared tags are the draw sites the fixtures
 * record (`body`, `system`, `weapons`, `skill`, `pick`, `escort`, `accuracy`,
 * `injector`); `location`, `scatter`, `orient` and `cargo` are port-only sites
 * the fixtures do not compare. The entry's `count` draws are not a group tag:
 * they come from {@link countDraws}.
 */
export const POPULATION_TAG_CODES = Object.freeze({
  body: 1,
  system: 2,
  weapons: 3,
  skill: 4,
  pick: 5,
  escort: 6,
  accuracy: 7,
  injector: 8,
  location: 9,
  scatter: 10,
  orient: 11,
  cargo: 12,
} as const);

export type PopulationTag = keyof typeof POPULATION_TAG_CODES;

/** The draws of one group, per site. */
export interface PopulationDraws {
  /** The next draw of the tag's stream, in `[0, 1)`. */
  next(tag: PopulationTag): number;
  /** The next draw as the unsigned 32-bit integer it was made from. */
  nextU32(tag: PopulationTag): number;
}

const U32_RANGE = 4_294_967_296;
const MAX_GROUP_INDEX = 0xfffffffe;

/**
 * The `count` stream of one entry: the three draws of its `randomise`, in
 * order, then any further draw.
 */
export function countDraws(worldSeed: number, ordinal: number): () => number {
  const state = createRngState(mix32(forkSeed(worldSeed, ordinal, "pop"), 0));
  return () => rngNext(state);
}

/**
 * The count source `planCounts` takes for a world: each call for an ordinal
 * returns the next draw of that entry's own stream. The streams are created on
 * first use and kept for the life of the source.
 */
export function countDrawSource(worldSeed: number): CountDraws {
  const streams = new Map<number, () => number>();
  return (ordinal) => {
    let next = streams.get(ordinal);
    if (next === undefined) {
      next = countDraws(worldSeed, ordinal);
      streams.set(ordinal, next);
    }
    return next();
  };
}

/**
 * The draws of group `groupIndex` of the entry `ordinal`. Every tag has its own
 * stream, so a group's draws at one site never shift another site's. An
 * unknown tag is a programming error at a module boundary and throws a
 * `RangeError` naming it (an inherited key such as `constructor` is unknown).
 */
export function populationDraws(
  worldSeed: number,
  ordinal: number,
  groupIndex: number,
): PopulationDraws {
  if (
    !Number.isInteger(groupIndex) ||
    groupIndex < 0 ||
    groupIndex > MAX_GROUP_INDEX
  ) {
    throw new RangeError(
      `groupIndex must be an integer in [0, ${String(MAX_GROUP_INDEX)}], got ${String(groupIndex)}`,
    );
  }
  const entrySeed = forkSeed(worldSeed, ordinal, "pop");
  const groupSeed = mix32(entrySeed, groupIndex + 1);
  const streams = new Map<string, ReturnType<typeof createRngState>>();
  const streamOf = (tag: string): ReturnType<typeof createRngState> => {
    let state = streams.get(tag);
    if (state === undefined) {
      if (!Object.hasOwn(POPULATION_TAG_CODES, tag)) {
        throw new RangeError(`tag must be a known PopulationTag, got ${tag}`);
      }
      const code = POPULATION_TAG_CODES[tag as PopulationTag];
      state = createRngState(mix32(groupSeed, code));
      streams.set(tag, state);
    }
    return state;
  };
  return {
    next: (tag) => rngNext(streamOf(tag)),
    nextU32: (tag) => rngNext(streamOf(tag)) * U32_RANGE,
  };
}
