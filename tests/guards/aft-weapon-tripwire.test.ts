// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Tripwire: aft, port and starboard NPC weapons without the attack branches
 * that use them (FOUND-20; pitfall C9; Phase 23, CBT-19; plan 21-12).
 *
 * Six compiled hulls carry an aft weapon (anaconda, anaconda-pirate, boa,
 * boa-pirate, boa-mk2, boa-mk2-pirate; plan 21-08), and plan 21-12 gives the
 * fire path its per-facing shape. The attack dispatcher still treats the
 * `aft/port/starboard_weapon_ready` terms as false and never selects
 * RUNNING_DEFENSE or ATTACK_BROADSIDE (`ShipEntity.m:4131-4136, 4171-4176`,
 * `src/sim/npc/behaviours/attack.ts`), because no AI-driven aft shot exists
 * before Phase 23. Until then the cut is only correct while no attacking AI can
 * be handed an aft-armed record. While `AFT_ATTACK_BRANCHES_PORTED` is false,
 * this guard fails when
 *
 * - (a) the compiled aft-armed set is not exactly the six named hulls, or any
 *   record mounts a port or starboard weapon;
 * - (b) a record a spawn path of this phase gives an attacking AI
 *   (`spawnTestShooter`, `spawnTestAttacker` through `TEST_SHOOTER_KEY`, and the
 *   flyer hook's `TEST_FLYER_KEYS`) has a non-none aft, port or starboard
 *   weapon;
 * - (c) a member of `INERT_RECORD_KEYS` (the populator's nine) has one;
 * - (d) the marker is not declared exactly once as a boolean constant.
 *
 * Phase 23 removes the marker and this guard together when it ports the aft
 * attack branches. It keys on records and key sets, so it is green on the
 * current tree and each trigger has a synthetic input that fails.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { TEST_FLYER_KEYS } from "../../src/app/session/traffic.js";
import { TEST_SHOOTER_KEY } from "../../src/sim/ai/test-spawn.js";
import { INERT_RECORD_KEYS } from "../../src/sim/world/populate.js";
import { withoutComments } from "./source-scan.js";

const ATTACK_MODULE = "src/sim/npc/behaviours/attack.ts";

const RULE_PREFIX =
  "aft, port or starboard weapons exist but AFT_ATTACK_BRANCHES_PORTED is false: port RUNNING_DEFENSE and ATTACK_BROADSIDE first (Phase 23 (CBT-19))";

/** The six hulls that carry an aft weapon (plan 21-08). */
const AFT_ARMED = Object.freeze([
  "anaconda",
  "anaconda-pirate",
  "boa",
  "boa-mk2",
  "boa-mk2-pirate",
  "boa-pirate",
]);

interface NpcRecord {
  readonly key: string;
  readonly aftWeapon: string;
  readonly portWeapon: string;
  readonly starboardWeapon: string;
}

interface TripwireInput {
  /** The marker's value; `undefined` when it is not declared exactly once. */
  readonly ported: boolean | undefined;
  readonly records: readonly NpcRecord[];
  /** Keys a spawn path gives an attacking AI. */
  readonly attackerKeys: readonly string[];
  readonly inertKeys: readonly string[];
}

function hasNonForwardWeapon(record: NpcRecord): boolean {
  return [record.aftWeapon, record.portWeapon, record.starboardWeapon].some(
    (weapon) => weapon !== "EQ_WEAPON_NONE",
  );
}

/** The violations of one input: empty when the marker is true (the cut is gone). */
function aftTripwireViolations(input: TripwireInput): string[] {
  if (input.ported === undefined) {
    return [
      `${ATTACK_MODULE}: ${RULE_PREFIX}: the marker AFT_ATTACK_BRANCHES_PORTED is not declared exactly once as a boolean constant`,
    ];
  }
  if (input.ported) return [];
  const found: string[] = [];
  const byKey = new Map(input.records.map((record) => [record.key, record]));
  const aftArmed = input.records
    .filter((record) => record.aftWeapon !== "EQ_WEAPON_NONE")
    .map((record) => record.key)
    .sort();
  if (JSON.stringify(aftArmed) !== JSON.stringify(AFT_ARMED)) {
    found.push(
      `${RULE_PREFIX}: the aft-armed set is [${aftArmed.join(", ")}], expected [${AFT_ARMED.join(", ")}]`,
    );
  }
  for (const record of input.records) {
    if (
      record.portWeapon !== "EQ_WEAPON_NONE" ||
      record.starboardWeapon !== "EQ_WEAPON_NONE"
    ) {
      found.push(
        `${RULE_PREFIX}: "${record.key}" mounts a port or starboard weapon`,
      );
    }
  }
  for (const key of input.attackerKeys) {
    const record = byKey.get(key);
    if (record !== undefined && hasNonForwardWeapon(record)) {
      found.push(
        `${RULE_PREFIX}: the attacking-AI spawn key "${key}" is aft-armed`,
      );
    }
  }
  for (const key of input.inertKeys) {
    const record = byKey.get(key);
    if (record !== undefined && hasNonForwardWeapon(record)) {
      found.push(
        `${RULE_PREFIX}: INERT_RECORD_KEYS member "${key}" is aft-armed`,
      );
    }
  }
  return found;
}

function committedRecords(): NpcRecord[] {
  return JSON.parse(
    readFileSync("src/content/generated/ships-npc.json", "utf8"),
  ) as NpcRecord[];
}

/** The marker's value in the attack module, or undefined when not declared once. */
function markerOf(source: string): boolean | undefined {
  const matches = [
    ...withoutComments(source).matchAll(
      /^export const AFT_ATTACK_BRANCHES_PORTED = (true|false);$/gm,
    ),
  ];
  if (matches.length !== 1) return undefined;
  return matches[0]?.[1] === "true";
}

const ATTACKER_KEYS = Object.freeze([
  TEST_SHOOTER_KEY,
  TEST_FLYER_KEYS.station,
  TEST_FLYER_KEYS.intercept,
  TEST_FLYER_KEYS.flee,
]);

function treeInput(): TripwireInput {
  return {
    ported: markerOf(readFileSync(ATTACK_MODULE, "utf8")),
    records: committedRecords(),
    attackerKeys: ATTACKER_KEYS,
    inertKeys: INERT_RECORD_KEYS,
  };
}

describe("the aft attack branches tripwire (plan 21-12, Phase 23, CBT-19)", () => {
  it("passes on the tree: the marker is false and no attacking AI reaches an aft-armed record", () => {
    const input = treeInput();
    expect(input.ported).toBe(false);
    expect(aftTripwireViolations(input)).toEqual([]);
  });

  it("pins the compiled aft-armed set to the six hulls, with no port or starboard weapon", () => {
    const records = committedRecords();
    expect(
      records
        .filter((record) => record.aftWeapon !== "EQ_WEAPON_NONE")
        .map((record) => record.key)
        .sort(),
    ).toEqual([...AFT_ARMED]);
    for (const record of records) {
      expect(record.portWeapon, record.key).toBe("EQ_WEAPON_NONE");
      expect(record.starboardWeapon, record.key).toBe("EQ_WEAPON_NONE");
    }
  });

  it("reads the hook keys from their sources: the stock Viper shooter and the three flyers", () => {
    expect(ATTACKER_KEYS).toEqual(["viper", "shuttle", "viper", "adder"]);
  });

  it("fails, naming Phase 23 and the marker, when a hook key is an aft-armed hull", () => {
    const input = { ...treeInput(), attackerKeys: ["anaconda"] };
    const found = aftTripwireViolations(input);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("Phase 23 (CBT-19)");
    expect(found[0]).toContain("AFT_ATTACK_BRANCHES_PORTED");
    expect(found[0]).toContain('"anaconda"');
  });

  it("fails when the compiled aft-armed set grows: python gains an aft weapon", () => {
    const records = committedRecords().map((record) =>
      record.key === "python"
        ? { ...record, aftWeapon: "EQ_WEAPON_PULSE_LASER" }
        : record,
    );
    const found = aftTripwireViolations({ ...treeInput(), records });
    expect(found.some((line) => line.includes("aft-armed set"))).toBe(true);
    expect(found.every((line) => line.includes("Phase 23 (CBT-19)"))).toBe(
      true,
    );
  });

  it("fails when any record mounts a port weapon", () => {
    const records = committedRecords().map((record) =>
      record.key === "adder"
        ? { ...record, portWeapon: "EQ_WEAPON_PULSE_LASER" }
        : record,
    );
    const found = aftTripwireViolations({ ...treeInput(), records });
    expect(found.some((line) => line.includes('"adder" mounts a port'))).toBe(
      true,
    );
  });

  it("fails when an INERT_RECORD_KEYS member is aft-armed", () => {
    const records = committedRecords().map((record) =>
      record.key === "gecko"
        ? { ...record, aftWeapon: "EQ_WEAPON_PULSE_LASER" }
        : record,
    );
    const found = aftTripwireViolations({ ...treeInput(), records });
    expect(found.some((line) => line.includes('member "gecko"'))).toBe(true);
  });

  it("fails when the marker is missing or declared twice, and is silent once it is true", () => {
    expect(markerOf("export const OTHER = 1;")).toBeUndefined();
    expect(
      markerOf(
        "export const AFT_ATTACK_BRANCHES_PORTED = false;\nexport const AFT_ATTACK_BRANCHES_PORTED = false;",
      ),
    ).toBeUndefined();
    expect(
      markerOf("// export const AFT_ATTACK_BRANCHES_PORTED = true;\n"),
    ).toBeUndefined();
    expect(
      aftTripwireViolations({ ...treeInput(), ported: undefined }),
    ).toHaveLength(1);
    expect(
      aftTripwireViolations({
        ...treeInput(),
        ported: true,
        attackerKeys: ["anaconda"],
      }),
    ).toEqual([]);
  });
});
