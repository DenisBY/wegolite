// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Every oracle fixture of the phase is assigned to exactly one oracle test file
 * and every in-scope behaviour id is routed to its own behaviour (Phase 14, plan
 * 14-15; ROADMAP criterion 1).
 *
 * A static check, by design: Vitest gives each test file its own module
 * registry, so no record of "which fixtures ran" can cross files. Instead the
 * assignment is data (`oracle-groups.ts`), this file compares it with what
 * `loadOracleFiles()` loads from disk, and each oracle test file asserts it ran
 * exactly its own manifest entry (`runs exactly the fixtures of its files`).
 * Together the two give "every fixture ran once".
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { behaviourAttackTarget } from "../../../src/sim/npc/behaviours/attack.js";
import {
  behaviourAttackFlyFromTarget,
  behaviourAttackFlyToTarget,
  behaviourFlyToTargetSix,
} from "../../../src/sim/npc/behaviours/attack-close.js";
import {
  behaviourAttackBreakOffTarget,
  behaviourAttackSlowDogfight,
  behaviourAttackSniper,
} from "../../../src/sim/npc/behaviours/attack-evade.js";
import { behaviourAvoidCollision } from "../../../src/sim/npc/behaviours/avoid-collision.js";
import { behaviourEvasiveAction } from "../../../src/sim/npc/behaviours/evasive.js";
import { behaviourFaceDestination } from "../../../src/sim/npc/behaviours/face-destination.js";
import { behaviourFleeTarget } from "../../../src/sim/npc/behaviours/flee.js";
import { behaviourFormationFormUp } from "../../../src/sim/npc/behaviours/formation.js";
import {
  behaviourFlyFromDestination,
  behaviourFlyRangeFromDestination,
  behaviourFlyToDestination,
} from "../../../src/sim/npc/behaviours/fly-to-destination.js";
import {
  behaviourIdle,
  behaviourStopStill,
} from "../../../src/sim/npc/behaviours/idle.js";
import { behaviourInterceptTarget } from "../../../src/sim/npc/behaviours/intercept.js";
import { behaviourTumble } from "../../../src/sim/npc/behaviours/tumble.js";
import { BEHAVIOUR_ROUTES } from "../../../src/sim/npc/dispatch.js";
import type { BehaviourStep } from "../../../src/sim/npc/dispatch.js";
import { BEHAVIOUR_IDS } from "../../../src/sim/world/ids.js";
import type { BehaviourId } from "../../../src/sim/world/ids.js";
import {
  FIRE_ORACLE_GROUPS,
  FIRE_ORACLE_PENDING,
  ORACLE_GROUPS,
  fireFixtureFilesFor,
} from "./oracle-groups.js";
import { loadOracleFiles } from "./oracle-runner.js";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

describe("every fixture is assigned to exactly one oracle test file", () => {
  const loaded = loadOracleFiles();

  it("the manifest names every fixture file of both trees, each once", () => {
    const named = ORACLE_GROUPS.map((group) => group.fixtureFile);
    expect(new Set(named).size).toBe(named.length);
    expect([...named].sort()).toEqual([...loaded.keys()].sort());
  });

  it("every fixture id is unique across both trees", () => {
    const ids: string[] = [];
    for (const fixtures of loaded.values()) {
      for (const fixture of fixtures) ids.push(fixture.id);
    }
    expect(ids.length).toBeGreaterThan(100); // the check is not vacuous
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every manifest entry names an oracle test file that exists, reads the manifest and asserts it ran its whole entry", () => {
    const testFiles = new Set(ORACLE_GROUPS.map((group) => group.testFile));
    expect(testFiles.size).toBeGreaterThan(4);
    for (const testFile of testFiles) {
      const absolute = `${REPO_ROOT}${testFile}`;
      expect(existsSync(absolute), `${testFile} exists`).toBe(true);
      const source = readFileSync(absolute, "utf8");
      expect(source, `${testFile} names itself`).toContain(
        `const THIS_FILE = "${testFile}";`,
      );
      expect(source, `${testFile} reads the manifest`).toContain(
        "fixtureFilesFor(THIS_FILE)",
      );
      expect(source, `${testFile} asserts its whole entry`).toContain(
        "runs exactly the fixtures of its files",
      );
    }
  });

  it("every fire manifest entry names an oracle test file that exists, reads the fire manifest and asserts it ran its whole entry", () => {
    const testFiles = new Set(
      FIRE_ORACLE_GROUPS.map((group) => group.testFile),
    );
    expect(testFiles.size).toBeGreaterThan(0);
    for (const testFile of testFiles) {
      const absolute = `${REPO_ROOT}${testFile}`;
      expect(existsSync(absolute), `${testFile} exists`).toBe(true);
      const source = readFileSync(absolute, "utf8");
      expect(source, `${testFile} names itself`).toContain(
        `const THIS_FILE = "${testFile}";`,
      );
      expect(source, `${testFile} reads the fire manifest`).toContain(
        "fireFixtureFilesFor(THIS_FILE)",
      );
      expect(source, `${testFile} asserts its whole entry`).toContain(
        "runs exactly the fixtures of its files",
      );
      expect(fireFixtureFilesFor(testFile).length).toBeGreaterThan(0);
    }
  });

  it("every oracle test file on disk is in one of the two manifests", () => {
    const onDisk = readdirSync(`${REPO_ROOT}tests/sim/npc`)
      .filter((name) => name.endsWith(".oracle.test.ts"))
      .map((name) => `tests/sim/npc/${name}`)
      .sort();
    const named = [
      ...new Set([
        ...ORACLE_GROUPS.map((group) => group.testFile),
        ...FIRE_ORACLE_GROUPS.map((group) => group.testFile),
      ]),
    ].sort();
    expect(named).toEqual(onDisk);
  });
});

/**
 * The Phase 17 fire trees (`tests/oracles/npc/fire/fixtures` and
 * `tests/oracles/npc/fire-sites/fixtures`) have their own schemas and are not
 * loaded by `loadOracleFiles()`. Their files are assigned by
 * `FIRE_ORACLE_GROUPS` (an oracle test file runs them) or listed in
 * `FIRE_ORACLE_PENDING` (their consumer is a later plan); the two lists
 * together equal the files on disk, and every id is unique across all four
 * oracle trees.
 */
describe("every fire fixture file is assigned or pending", () => {
  const FIRE_DIRS = [
    "tests/oracles/npc/fire/fixtures",
    "tests/oracles/npc/fire-sites/fixtures",
  ] as const;

  const onDisk = FIRE_DIRS.flatMap((dir) =>
    readdirSync(`${REPO_ROOT}${dir}`)
      .filter((name) => name.endsWith(".json"))
      .map((name) => `${dir}/${name}`),
  ).sort();

  it("the groups plus the pending rows equal the fire fixture files on disk, each once", () => {
    const named = [
      ...FIRE_ORACLE_GROUPS.map((group) => group.fixtureFile),
      ...FIRE_ORACLE_PENDING.map((row) => row.fixtureFile),
    ];
    expect(new Set(named).size).toBe(named.length);
    expect([...named].sort()).toEqual(onDisk);
  });

  it("every pending row names the plan that will run it", () => {
    for (const row of FIRE_ORACLE_PENDING) {
      expect(row.plan, row.fixtureFile).toMatch(/^17-\d\d$/);
    }
  });

  it("every fixture id is unique across all four oracle trees", () => {
    const ids: string[] = [];
    for (const fixtures of loadOracleFiles().values()) {
      for (const fixture of fixtures) ids.push(fixture.id);
    }
    const phase14 = ids.length;
    for (const file of onDisk) {
      const parsed = JSON.parse(
        readFileSync(`${REPO_ROOT}${file}`, "utf8"),
      ) as { id?: string; fixture?: { id: string } }[];
      for (const entry of parsed) {
        const id = entry.id ?? entry.fixture?.id;
        expect(id, `${file} has an id on every entry`).toBeDefined();
        ids.push(id ?? "");
      }
    }
    expect(ids.length).toBeGreaterThan(phase14 + 100); // the fire trees are read
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/**
 * The ids the phase ports natively: the nine behaviours of AI-01 with the
 * sub-behaviours the attack dispatcher reaches (RESEARCH, the in-scope list).
 */
const IN_SCOPE: readonly BehaviourId[] = [
  "IDLE",
  "STOP_STILL",
  "STATION_KEEPING",
  "TUMBLE",
  "FLY_RANGE_FROM_DESTINATION",
  "FLY_TO_DESTINATION",
  "FLY_FROM_DESTINATION",
  "FORMATION_BREAK",
  "FACE_DESTINATION",
  "INTERCEPT_TARGET",
  "FLEE_TARGET",
  "EVASIVE_ACTION",
  "FLEE_EVASIVE_ACTION",
  "ATTACK_TARGET",
  "ATTACK_FLY_TO_TARGET",
  "ATTACK_FLY_FROM_TARGET",
  "ATTACK_FLY_TO_TARGET_SIX",
  "ATTACK_FLY_TO_TARGET_TWELVE",
  "ATTACK_SNIPER",
  "ATTACK_BREAK_OFF_TARGET",
  "ATTACK_SLOW_DOGFIGHT",
  "FORMATION_FORM_UP",
  "AVOID_COLLISION",
];

/** The behaviour each in-scope id runs, written from Oolite's switch (`ShipEntity.m:2485-2638`). */
const EXPECTED: readonly (readonly [BehaviourId, BehaviourStep])[] = [
  ["IDLE", behaviourIdle],
  ["STOP_STILL", behaviourStopStill],
  ["STATION_KEEPING", behaviourStopStill], // 2493-2496
  ["TUMBLE", behaviourTumble],
  ["FLY_RANGE_FROM_DESTINATION", behaviourFlyRangeFromDestination],
  ["FLY_TO_DESTINATION", behaviourFlyToDestination],
  ["FLY_FROM_DESTINATION", behaviourFlyFromDestination],
  ["FORMATION_BREAK", behaviourFlyFromDestination], // 2604-2607
  ["FACE_DESTINATION", behaviourFaceDestination],
  ["INTERCEPT_TARGET", behaviourInterceptTarget],
  ["FLEE_TARGET", behaviourFleeTarget],
  ["EVASIVE_ACTION", behaviourEvasiveAction],
  ["FLEE_EVASIVE_ACTION", behaviourEvasiveAction], // 2575-2578
  ["ATTACK_TARGET", behaviourAttackTarget],
  ["ATTACK_FLY_TO_TARGET", behaviourAttackFlyToTarget],
  ["ATTACK_FLY_FROM_TARGET", behaviourAttackFlyFromTarget],
  ["ATTACK_FLY_TO_TARGET_SIX", behaviourFlyToTargetSix],
  ["ATTACK_FLY_TO_TARGET_TWELVE", behaviourFlyToTargetSix], // 2536-2539
  ["ATTACK_SNIPER", behaviourAttackSniper],
  ["ATTACK_BREAK_OFF_TARGET", behaviourAttackBreakOffTarget],
  ["ATTACK_SLOW_DOGFIGHT", behaviourAttackSlowDogfight],
  ["FORMATION_FORM_UP", behaviourFormationFormUp],
  ["AVOID_COLLISION", behaviourAvoidCollision],
];

describe("every in-scope behaviour id routes to its own behaviour", () => {
  it("lists exactly the in-scope ids, each a known behaviour id", () => {
    for (const id of IN_SCOPE) expect(BEHAVIOUR_IDS).toContain(id);
    expect(new Set(IN_SCOPE).size).toBe(IN_SCOPE.length);
    expect(EXPECTED.map(([id]) => id)).toEqual([...IN_SCOPE]);
  });

  it.each(EXPECTED)("%s runs its own ported behaviour", (id, expected) => {
    expect(BEHAVIOUR_ROUTES.get(id)).toBe(expected);
  });

  it("only an in-scope id has a route: every other id takes the idle fallback", () => {
    const outOfScope = BEHAVIOUR_IDS.filter((id) => !IN_SCOPE.includes(id));
    expect(outOfScope).toHaveLength(BEHAVIOUR_IDS.length - IN_SCOPE.length);
    for (const id of outOfScope) {
      expect(BEHAVIOUR_ROUTES.has(id), id).toBe(false);
    }
    expect([...BEHAVIOUR_ROUTES.keys()].sort()).toEqual([...IN_SCOPE].sort());
  });

  it("no in-scope id other than IDLE routes to the idle behaviour", () => {
    for (const id of IN_SCOPE) {
      if (id === "IDLE") continue;
      expect(BEHAVIOUR_ROUTES.get(id), id).not.toBe(behaviourIdle);
    }
  });
});
