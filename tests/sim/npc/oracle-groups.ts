// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The static manifest that assigns every oracle fixture file to exactly one
 * oracle test file (Phase 14, plan 14-09).
 *
 * A module-level record of "which fixtures ran" cannot cross Vitest test files
 * (each file has its own module registry), so the assignment is data instead:
 * each oracle test file runs and asserts exactly its own manifest entry, and
 * plan 14-15's coverage test compares this manifest with every fixture id that
 * `loadOracleFiles()` loads, so a fixture no test file runs fails there.
 *
 * Paths are repository-relative with forward slashes. Later plans add their
 * rows here when they add an oracle test file or a fixture file.
 */

export interface OracleGroup {
  /** A fixture file of `tests/oracles/npc/fixtures` or its `pursuit` subtree. */
  readonly fixtureFile: string;
  /** The one oracle test file that runs every fixture of `fixtureFile`. */
  readonly testFile: string;
}

const FLIGHT_TEST = "tests/sim/npc/flight.oracle.test.ts";
const NAVIGATION_TEST = "tests/sim/npc/navigation.oracle.test.ts";
const RATE_RULE_TEST = "tests/sim/npc/rate-rule.oracle.test.ts";
const PURSUIT_TEST = "tests/sim/npc/pursuit.oracle.test.ts";
const ATTACK_TEST = "tests/sim/npc/attack.oracle.test.ts";

export const ORACLE_GROUPS: readonly OracleGroup[] = Object.freeze([
  Object.freeze({
    fixtureFile: "tests/oracles/npc/fixtures/flight-model.json",
    testFile: FLIGHT_TEST,
  }),
  Object.freeze({
    fixtureFile: "tests/oracles/npc/fixtures/idle.json",
    testFile: FLIGHT_TEST,
  }),
  Object.freeze({
    fixtureFile: "tests/oracles/npc/fixtures/tumble.json",
    testFile: FLIGHT_TEST,
  }),
  Object.freeze({
    fixtureFile: "tests/oracles/npc/fixtures/fly-to-destination.json",
    testFile: NAVIGATION_TEST,
  }),
  Object.freeze({
    fixtureFile: "tests/oracles/npc/fixtures/face-destination.json",
    testFile: NAVIGATION_TEST,
  }),
  Object.freeze({
    fixtureFile: "tests/oracles/npc/fixtures/rate-rule.json",
    testFile: RATE_RULE_TEST,
  }),
  Object.freeze({
    fixtureFile: "tests/oracles/npc/pursuit/fixtures/intercept.json",
    testFile: PURSUIT_TEST,
  }),
  Object.freeze({
    fixtureFile: "tests/oracles/npc/pursuit/fixtures/flee.json",
    testFile: PURSUIT_TEST,
  }),
  Object.freeze({
    fixtureFile: "tests/oracles/npc/pursuit/fixtures/attack-dispatch.json",
    testFile: ATTACK_TEST,
  }),
  Object.freeze({
    fixtureFile: "tests/oracles/npc/pursuit/fixtures/attack-close.json",
    testFile: ATTACK_TEST,
  }),
  Object.freeze({
    fixtureFile: "tests/oracles/npc/pursuit/fixtures/attack-evade.json",
    testFile: ATTACK_TEST,
  }),
]);

/** The fixture files `testFile` must run, in manifest order. */
export function fixtureFilesFor(testFile: string): readonly string[] {
  return ORACLE_GROUPS.filter((group) => group.testFile === testFile).map(
    (group) => group.fixtureFile,
  );
}
