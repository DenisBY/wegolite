// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The player's internal-damage facts and their place in the step options
 * (Phase 19, plan 19-11, CBT-08, D-01, D-03).
 *
 * Node only, with the real compiled catalogues: `internalDamageFactsFor` is pure
 * and the roll's damageable set must be the one the F3 repair door repairs.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildStepOptions,
  internalDamageFactsFor,
} from "../../../src/app/session/step-options.js";
import type { StepOptionsInput } from "../../../src/app/session/step-options.js";
import {
  debrisContentFrom,
  trafficContent,
} from "../../../src/app/session/traffic.js";
import { parseEquipment } from "../../../src/content/equipment.js";
import { DebrisCatalogueSchema } from "../../../src/content/schemas/ship-debris.js";
import type { NpcShip } from "../../../src/content/types.js";
import {
  generateMarket,
  marketSeedForSystem,
} from "../../../src/sim/economy/market.js";
import { holdPods } from "../../../src/sim/economy/cargo.js";
import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import {
  consideredCount,
  internalDamageWork,
  rollInternalDamage,
} from "../../../src/sim/combat/internal-damage.js";
import type { InternalDamageFacts } from "../../../src/sim/combat/internal-damage.js";
import type { SimEvent } from "../../../src/sim/events.js";
import { DAMAGEABLE_EQUIPMENT_KEYS } from "../../../src/sim/player/outfitting.js";
import { newProfile } from "../../../src/sim/player/profile.js";
import { commoditiesFixture } from "../../helpers/commodities.js";
import { laveFixture } from "../../helpers/lave.js";
import { committedTrafficContent } from "../../helpers/tick-script.js";

const catalogue = parseEquipment(
  JSON.parse(
    readFileSync(
      new URL("../../../src/content/generated/equipment.json", import.meta.url),
      "utf8",
    ),
  ) as unknown,
);
const commodities = commoditiesFixture();
const lave = laveFixture();

/** Every key F3 can install in `equipment` (`SINGLE_INSTANCE_KEYS`). */
const F3_KEYS = [
  "EQ_CARGO_BAY",
  "EQ_DOCK_COMP",
  "EQ_GAL_DRIVE",
  "EQ_ADVANCED_COMPASS",
  "EQ_ADVANCED_NAVIGATIONAL_ARRAY",
];

function holding(
  equipment: readonly string[],
  extra: { passengerBerths?: number; cargo?: Record<string, number> } = {},
) {
  return { ...newProfile(), equipment, ...extra };
}

describe("internalDamageFactsFor", () => {
  it("lists the items in profile.equipment order with their compiled probability", () => {
    const facts = internalDamageFactsFor(
      holding(["EQ_DOCK_COMP", "EQ_CARGO_BAY", "EQ_GAL_DRIVE"]),
      catalogue,
      commodities,
    );
    expect(facts.items).toEqual([
      { key: "EQ_DOCK_COMP", damageProbability: 1 },
      { key: "EQ_CARGO_BAY", damageProbability: 0 },
      { key: "EQ_GAL_DRIVE", damageProbability: 1 },
    ]);
  });

  it("gives a key the catalogue lacks probability 0 and keeps zero-probability keys listed (they add no slot)", () => {
    const facts = internalDamageFactsFor(
      holding(["EQ_NOT_IN_THE_CATALOGUE", "EQ_CARGO_BAY"]),
      catalogue,
      commodities,
    );
    expect(facts.items).toEqual([
      { key: "EQ_NOT_IN_THE_CATALOGUE", damageProbability: 0 },
      { key: "EQ_CARGO_BAY", damageProbability: 0 },
    ]);
  });

  it("reports the hold's capacity, not its free space", () => {
    const capacity = (
      equipment: readonly string[],
      passengerBerths: number,
      cargo: Record<string, number> = {},
    ): number =>
      internalDamageFactsFor(
        holding(equipment, { passengerBerths, cargo }),
        catalogue,
        commodities,
      ).capacityPods;
    expect(capacity([], 0)).toBe(20);
    expect(capacity(["EQ_CARGO_BAY"], 0)).toBe(35);
    expect(capacity([], 1)).toBe(15);
    // A full hold does not change the capacity.
    expect(capacity([], 0, { gold: 2700 })).toBe(20);
  });

  it("builds the pods exactly as holdPods does for the same hold", () => {
    const cargo = { gold: 2700, food: 3 };
    const facts = internalDamageFactsFor(
      holding([], { cargo }),
      catalogue,
      commodities,
    );
    expect(facts.pods).toEqual(holdPods(cargo, commodities));
    expect(facts.pods.length).toBeGreaterThan(0);
  });

  it("never mutates the profile or the catalogues", () => {
    const profile = holding(["EQ_DOCK_COMP"], { cargo: { gold: 2700 } });
    const profileBefore = JSON.stringify(profile);
    const catalogueBefore = JSON.stringify(catalogue);
    const commoditiesBefore = JSON.stringify(commodities);
    internalDamageFactsFor(profile, catalogue, commodities);
    expect(JSON.stringify(profile)).toBe(profileBefore);
    expect(JSON.stringify(catalogue)).toBe(catalogueBefore);
    expect(JSON.stringify(commodities)).toBe(commoditiesBefore);
  });

  it("D-03: the items above probability 0 are exactly the keys the repair door repairs", () => {
    const facts = internalDamageFactsFor(
      holding(F3_KEYS),
      catalogue,
      commodities,
    );
    const damageable = facts.items
      .filter((item) => item.damageProbability > 0)
      .map((item) => item.key);
    // The profile order is EQ_CARGO_BAY, EQ_DOCK_COMP, EQ_GAL_DRIVE, ...
    const expected = F3_KEYS.filter((key) =>
      (DAMAGEABLE_EQUIPMENT_KEYS as readonly string[]).includes(key),
    );
    expect(damageable).toEqual(expected);
    expect([...damageable].sort()).toEqual(
      [...DAMAGEABLE_EQUIPMENT_KEYS].sort(),
    );
  });

  it("CR-01: the compiled bay is no damageable slot, so bay + docking computer is one slot", () => {
    // Hand-derived from PlayerEntity.m:6099-6137: capacity 35, considered
    // (35 + 21) * 95 / 100 = 53. Gate draw 0 passes at amount 32. A die of 51
    // reverses to 53 - 52 = 1, and Oolite's damageableCounter is 1 (the bay's
    // canBeDamaged is NO), so 1 < 1 fails: no pick draw, nothing damaged.
    const roll = (equipment: readonly string[], die: number) => {
      const facts = internalDamageFactsFor(
        holding(equipment),
        catalogue,
        commodities,
      );
      expect(facts.capacityPods).toBe(35);
      expect(consideredCount(facts.capacityPods)).toBe(53);
      const queue = [0, (die + 0.5) / 53, 0.5];
      let draws = 0;
      const events: SimEvent[] = [];
      rollInternalDamage(
        32,
        internalDamageWork(facts),
        () => {
          const value = queue[draws];
          if (value === undefined) throw new Error("draw queue exhausted");
          draws += 1;
          return value;
        },
        events,
      );
      return { draws, events };
    };
    expect(roll(["EQ_CARGO_BAY", "EQ_DOCK_COMP"], 51)).toEqual({
      draws: 2,
      events: [],
    });
    expect(roll(["EQ_CARGO_BAY", "EQ_DOCK_COMP"], 52)).toEqual({
      draws: 3,
      events: [{ kind: "equipmentDamaged", key: "EQ_DOCK_COMP" }],
    });
    // The bay alone: no slot, so even reversed 0 draws no pick.
    expect(roll(["EQ_CARGO_BAY"], 52)).toEqual({ draws: 2, events: [] });
  });
});

describe("buildStepOptions and the internal-damage facts", () => {
  const input: StepOptionsInput = {
    fuel: 70,
    system: lave.system,
    target: undefined,
    equipment: new Set<string>(),
    dock: undefined,
    laserMounts: DEFAULT_LASER_MOUNTS,
  };

  it("leaves the key out of combat when no facts are given", () => {
    const options = buildStepOptions(input);
    expect(options.combat).not.toHaveProperty("internalDamage");
  });

  it("places the given facts under combat, by identity", () => {
    const facts: InternalDamageFacts = {
      items: [{ key: "EQ_DOCK_COMP", damageProbability: 1 }],
      capacityPods: 20,
      pods: [],
    };
    const options = buildStepOptions({ ...input, internalDamage: facts });
    expect(options.combat?.internalDamage).toBe(facts);
  });
});

/**
 * Lave's first-generation stock per commodity, in catalogue order, pinned from
 * `generateMarket` at the system's first-generation seed (plan 21-15), equal to
 * the stock column of the committed `tests/golden/market/lave.json`.
 */
const LAVE_STOCK: readonly number[] = [
  16, 15, 20, 19, 28, 15, 37, 0, 10, 27, 0, 47, 58, 11, 21, 9, 0,
];

describe("buildStepOptions and the pod market (plan 21-15, CBT-11 pod clause)", () => {
  const input: StepOptionsInput = {
    fuel: 70,
    system: lave.system,
    target: undefined,
    equipment: new Set<string>(),
    dock: undefined,
    laserMounts: DEFAULT_LASER_MOUNTS,
  };
  const npc = JSON.parse(
    readFileSync("src/content/generated/ships-npc.json", "utf8"),
  ) as NpcShip[];
  const records = DebrisCatalogueSchema.parse(
    JSON.parse(readFileSync("src/content/generated/ships-debris.json", "utf8")),
  );
  const goodsContent = debrisContentFrom(npc, records, commodities);
  if (goodsContent === undefined) throw new Error("no debris content");
  const plainContent = debrisContentFrom(npc, records);
  if (plainContent === undefined) throw new Error("no debris content");

  /** The oracle: the first-generation stock per key, from the market itself. */
  const stockOf = (system: typeof lave.system) =>
    generateMarket(
      system,
      commodities,
      marketSeedForSystem(system.id),
    ).goods.map((good) => ({ key: good.key, quantity: good.stock }));

  it("adds the current system's first-generation stock per key as combat.debris.market", () => {
    const options = buildStepOptions({ ...input, debris: goodsContent });
    expect(options.combat?.debris?.market).toEqual(stockOf(lave.system));
    expect(options.combat?.debris?.goods).toBe(goodsContent.goods);
    expect(options.combat?.debris?.hulls).toBe(goodsContent.hulls);
    // The input content is never mutated.
    expect(goodsContent).not.toHaveProperty("market");
  });

  it("pins Lave's market: every good in catalogue order, each stock 0..127", () => {
    const market = buildStepOptions({ ...input, debris: goodsContent }).combat
      ?.debris?.market;
    if (market === undefined) throw new Error("no market");
    expect(market.map((entry) => entry.key)).toEqual(
      commodities.map((good) => good.key),
    );
    for (const entry of market) {
      expect(Number.isInteger(entry.quantity)).toBe(true);
      expect(entry.quantity).toBeGreaterThanOrEqual(0);
      expect(entry.quantity).toBeLessThanOrEqual(127);
    }
    expect(market.map((entry) => entry.quantity)).toEqual(LAVE_STOCK);
  });

  it("is derived once per system and content: the same object for repeated calls", () => {
    const a = buildStepOptions({ ...input, debris: goodsContent });
    const b = buildStepOptions({ ...input, debris: goodsContent });
    expect(a.combat?.debris).toBe(b.combat?.debris);
    expect(Object.isFrozen(a.combat?.debris)).toBe(true);
    expect(Object.isFrozen(a.combat?.debris?.market)).toBe(true);
  });

  it("gives another system its own market", () => {
    const other = { ...lave.system, id: "tibedied", economy: 3 };
    const options = buildStepOptions({
      ...input,
      system: other,
      debris: goodsContent,
    });
    expect(options.combat?.debris?.market).toEqual(stockOf(other));
    expect(options.combat?.debris?.market).not.toEqual(
      buildStepOptions({ ...input, debris: goodsContent }).combat?.debris
        ?.market,
    );
  });

  it("is a function of the system and its seed only, never of the live market or the profile", () => {
    const equipped = buildStepOptions({
      ...input,
      equipment: new Set(["EQ_FUEL_SCOOPS"]),
      fuel: 3,
      debris: goodsContent,
    });
    expect(equipped.combat?.debris?.market).toEqual(stockOf(lave.system));
  });

  it("passes content without goods through unchanged (anonymous pods)", () => {
    const options = buildStepOptions({ ...input, debris: plainContent });
    expect(options.combat?.debris).toBe(plainContent);
    expect(buildStepOptions(input).combat).not.toHaveProperty("debris");
  });

  it("the live session's input and the Node replay's build equal combat.debris for Lave", () => {
    // The session builds its content from the loaded catalogues
    // (start-session.ts); the replay reads the committed files with the strict
    // schemas (tests/helpers/tick-script.ts). One builder, equal options.
    const live = trafficContent(npc, { debris: records, commodities });
    const replay = committedTrafficContent();
    const liveOptions = buildStepOptions({
      ...input,
      ...(live.debris === undefined ? {} : { debris: live.debris }),
    });
    const replayOptions = buildStepOptions({
      ...input,
      ...(replay.debris === undefined ? {} : { debris: replay.debris }),
    });
    expect(replayOptions.combat?.debris).toEqual(liveOptions.combat?.debris);
    expect(
      replayOptions.combat?.debris?.market?.map((entry) => entry.quantity),
    ).toEqual(LAVE_STOCK);
  });
});
