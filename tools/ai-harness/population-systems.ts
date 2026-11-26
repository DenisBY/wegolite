// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The stratified system sample of the population oracle (Phase 22, plan 22-02,
 * D-04): which (system, seed) fixtures `populator-record.ts --all` records.
 *
 * Dev-only, like the rest of `tools/ai-harness`: nothing under `src/` or
 * `public/` imports it. The list is committed as code and is not recomputed at
 * test time; every entry carries the reasons it is in.
 */

/** One system of the sample and why it is there. */
export interface PopulationSystem {
  /** `g<galaxy>-s<index>`. */
  readonly id: string;
  readonly reasons: readonly string[];
}

/** The seeds recorded for every system of the sample (D-04: three). */
export const POPULATION_SEEDS: readonly number[] = Object.freeze([1, 2, 3]);

/** The sample, in galaxy then system order. */
export const POPULATION_SYSTEMS: readonly PopulationSystem[] = Object.freeze([
  Object.freeze({
    id: "g0-s7",
    reasons: Object.freeze([
      "the start system; continuity with every existing traffic-on test",
    ]),
  }),
  Object.freeze({
    id: "g7-s162",
    reasons: Object.freeze([
      "isolated: no neighbour within 7 LY, only the station patrol",
    ]),
  }),
]);
