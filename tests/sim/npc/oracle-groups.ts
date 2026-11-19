// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The static manifest that assigns every oracle fixture file to exactly one
 * oracle test file (Phase 14, plan 14-09).
 *
 * A module-level record of "which fixtures ran" cannot cross Vitest test files
 * (each file has its own module registry), so the assignment is data instead:
 * each oracle test file runs and asserts exactly its own manifest entry, and
 * `oracle-coverage.test.ts` (plan 14-15) compares this manifest with every fixture id that
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
const AVOID_ESCORT_TEST = "tests/sim/npc/avoid-escort.oracle.test.ts";

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
  Object.freeze({
    fixtureFile: "tests/oracles/npc/fixtures/avoid-collision.json",
    testFile: AVOID_ESCORT_TEST,
  }),
  Object.freeze({
    fixtureFile: "tests/oracles/npc/fixtures/escort.json",
    testFile: AVOID_ESCORT_TEST,
  }),
]);

/** The fixture files `testFile` must run, in manifest order. */
export function fixtureFilesFor(testFile: string): readonly string[] {
  return ORACLE_GROUPS.filter((group) => group.testFile === testFile).map(
    (group) => group.fixtureFile,
  );
}

/* ---------------------------------------------------------------------------
 * The Phase 17 fire fixtures (plans 17-01, 17-02, 17-04, 17-08)
 * ------------------------------------------------------------------------- */

/**
 * A fire fixture file and the one oracle test file that runs every fixture of
 * it. The two fire trees (`tests/oracles/npc/fire/fixtures` and
 * `tests/oracles/npc/fire-sites/fixtures`) have their own schemas and are not
 * loaded by `loadOracleFiles()`, so their manifest is separate from
 * `ORACLE_GROUPS`; `oracle-coverage.test.ts` compares both.
 */
export interface FireOracleGroup {
  readonly fixtureFile: string;
  readonly testFile: string;
}

/** A fire fixture file whose consumer lands in a later plan. */
export interface FireOraclePending {
  readonly fixtureFile: string;
  /** The plan that adds the oracle test file and moves the row to the groups. */
  readonly plan: string;
}

const FIRE_TEST = "tests/sim/npc/fire.oracle.test.ts";

export const FIRE_ORACLE_GROUPS: readonly FireOracleGroup[] = Object.freeze([
  Object.freeze({
    fixtureFile: "tests/oracles/npc/fire/fixtures/gate.json",
    testFile: FIRE_TEST,
  }),
  Object.freeze({
    fixtureFile: "tests/oracles/npc/fire/fixtures/on-target.json",
    testFile: FIRE_TEST,
  }),
  Object.freeze({
    fixtureFile: "tests/oracles/npc/fire/fixtures/heat.json",
    testFile: FIRE_TEST,
  }),
  Object.freeze({
    fixtureFile: "tests/oracles/npc/fire-sites/fixtures/aim-feedback.json",
    testFile: FIRE_TEST,
  }),
]);

/**
 * The fire fixture files no oracle test file runs yet: the fire sites and the
 * hot-weapon branches need the live fire sites and the dispatcher's weapon
 * temperature, which plans 17-06 and 17-07 land; plan 17-08 runs them.
 */
export const FIRE_ORACLE_PENDING: readonly FireOraclePending[] = Object.freeze([
  Object.freeze({
    fixtureFile: "tests/oracles/npc/fire-sites/fixtures/fire-sites.json",
    plan: "17-08",
  }),
  Object.freeze({
    fixtureFile: "tests/oracles/npc/fire-sites/fixtures/hot-branches.json",
    plan: "17-08",
  }),
]);

/** The fire fixture files `testFile` must run, in manifest order. */
export function fireFixtureFilesFor(testFile: string): readonly string[] {
  return FIRE_ORACLE_GROUPS.filter((group) => group.testFile === testFile).map(
    (group) => group.fixtureFile,
  );
}
