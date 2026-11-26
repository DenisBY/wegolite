// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The contents of a released cargo pod (CBT-11's pod clause, staged; plan 21-14,
 * orchestrator decision 3).
 *
 * The oracles are written here from the C lines, never by calling the draw's
 * internals: `getContainersOfGoods` (`Universe.m:3894-3955`),
 * `getRandomAmountOfCommodity` (`Universe.m:3977-3996`) and `setCargoFlag:`
 * (`ShipEntity.m:7318-7373`), with `Ranrot() % N` = `floor(u * N)`. The tests
 * prove four things: the contents come from the stateless `pod` fork, so no
 * combat-stream draw moves; the kind is resolved at release by the stated
 * rule; the commodity and amount follow Oolite's rules in distribution; and
 * both new functions are total on malformed input.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Commodity } from "../../../src/content/types.js";
import { identity, vec } from "../../../src/sim/math.js";
import { createRngState, forkSeed, rngNext } from "../../../src/sim/rng.js";
import {
  arrivalMarketSeed,
  generateMarket,
  marketSeedForSystem,
} from "../../../src/sim/economy/market.js";
import {
  drawPodContents,
  POD_DRAWS_PER_SURVIVOR,
  resolvePodCargoKind,
} from "../../../src/sim/world/debris.js";
import type {
  DebrisContent,
  PodMarketEntry,
} from "../../../src/sim/world/debris.js";
import { CARGO_KINDS } from "../../../src/sim/world/entity.js";
import type { Entity } from "../../../src/sim/world/entity.js";
import { PLAYER_ID } from "../../../src/sim/world/ids.js";
import { killShip } from "../../../src/sim/world/kill.js";
import {
  MAX_ENTITY_CARGO,
  MAX_POD_AMOUNT,
} from "../../../src/sim/world/limits.js";
import { serializeEntity } from "../../../src/sim/world/serialize.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { commoditiesFixture } from "../../helpers/commodities.js";
import { debrisFixture } from "../../helpers/debris-fixture.js";
import { laveFixture } from "../../helpers/lave.js";

const COMMODITIES = commoditiesFixture();
const { system } = laveFixture();

const KIND = {
  plentiful: CARGO_KINDS.indexOf("plentiful"),
  scarce: CARGO_KINDS.indexOf("scarce"),
  medical: CARGO_KINDS.indexOf("medical"),
  contraband: CARGO_KINDS.indexOf("contraband"),
  pirate: CARGO_KINDS.indexOf("pirate"),
  uniform: CARGO_KINDS.indexOf("uniform"),
} as const;

/** Lave's first-generation market as the content carries it (RESEARCH A6). */
const LAVE_MARKET: readonly PodMarketEntry[] = generateMarket(
  system,
  COMMODITIES,
  marketSeedForSystem(system.id),
).goods.map((good) => ({ key: good.key, quantity: good.stock }));

const KEYS = new Set(COMMODITIES.map((good) => good.key));

/** The debris content with goods and the Lave market (or without, `bare`). */
function content(bare = false): DebrisContent {
  return bare
    ? debrisFixture()
    : { ...debrisFixture(), goods: COMMODITIES, market: LAVE_MARKET };
}

/** A hand-built commodity: only the fields the draw reads are meaningful. */
function good(
  key: string,
  unit: "t" | "kg" | "g" = "t",
  legalityExport = 0,
): Commodity {
  return { ...COMMODITIES[0], key, unit, legalityExport } as Commodity;
}

function spawnVictim(
  world: World,
  options: {
    readonly cargo: number;
    readonly role?: string;
    readonly cargoKind?: number;
  },
): Entity {
  const result = spawnEntity(
    world,
    {
      kind: "ship",
      specKey: "adder",
      scanClass: "CLASS_NEUTRAL",
      position: vec(100, 200, 300),
      orientation: identity(),
      radius: 30,
      maxEnergy: 85,
      cargo: options.cargo,
      ...(options.role === undefined ? {} : { role: options.role }),
      ...(options.cargoKind === undefined
        ? {}
        : { cargoKind: options.cargoKind }),
    },
    0,
  );
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return result.entity;
}

/** Kill a fresh victim of `cargo` pods in a world of `seed`. */
function release(
  seed: number,
  debris: DebrisContent,
  options: {
    readonly cargo: number;
    readonly role?: string;
    readonly cargoKind?: number;
  },
): { readonly world: World; readonly victim: Entity } {
  const world = createWorld(seed);
  const victim = spawnVictim(world, options);
  expect(
    killShip(world, victim.id, PLAYER_ID, [], { tick: 5, content: debris }),
  ).toBe(true);
  return { world, victim };
}

function podsOf(world: World): Entity[] {
  return world.store.live.filter(
    (e) => !e.dead && e.kind === "cargo" && e.specKey === "barrel",
  );
}

/** The unit range a drawn amount must lie in (`Universe.m:3984-3991`). */
function amountRange(unit: string | undefined): readonly [number, number] {
  if (unit === "kg") return [1, 16];
  if (unit === "g") return [4, 34];
  return [1, 1];
}

// ---------------------------------------------------------------------------
// The independent oracle: the C lines, over a plain list of weights.

/** `getContainersOfGoods`' weights (`Universe.m:3905-3925`). */
function oracleWeights(
  goods: readonly Commodity[],
  stock: Readonly<Record<string, number>>,
  scarce: boolean,
  legal: boolean,
): number[] {
  return goods.map((g) => {
    let q = stock[g.key] ?? 0;
    if (scarce) q = q < 64 ? 64 - q : 0;
    if (legal && g.legalityExport > 0) q &= 1;
    if (q > 64) q = 64;
    return Math.trunc((q * 100) / 64);
  });
}

describe("the pod fork leaves every combat-stream draw unchanged (T-21-28)", () => {
  it("keeps 13 draws per survivor", () => {
    expect(POD_DRAWS_PER_SURVIVOR).toBe(13);
  });

  it("places pods, wrecks and plates identically with and without contents", () => {
    let withPods = 0;
    let withOthers = 0;
    for (let seed = 1; seed <= 24; seed += 1) {
      const options = { cargo: 12, role: "trader" };
      const a = release(seed, content(), options);
      const b = release(seed, content(true), options);
      const strip = (e: Entity): string =>
        serializeEntity({ ...e, podCommodity: "", podAmount: 0 });
      expect(a.world.store.live.map(strip)).toEqual(
        b.world.store.live.map(strip),
      );
      expect(a.victim.rng.combat).toBe(b.victim.rng.combat);
      expect(a.world.store.nextId).toBe(b.world.store.nextId);
      withPods += podsOf(a.world).length;
      withOthers += a.world.store.live.filter(
        (e) => e.kind === "wreckage" || e.specKey === "alloy",
      ).length;
    }
    // Vacuity floor: the comparison covered pods and the other pieces.
    expect(withPods).toBeGreaterThan(20);
    expect(withOthers).toBeGreaterThan(0);
  });

  it("draws the contents of every survivor, in capsule order, from the pod fork", () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const { world, victim } = release(seed, content(), {
        cargo: 10,
        role: "trader",
      });
      const pods = podsOf(world);
      expect(pods.length).toBeGreaterThan(0);
      const expected = drawPodContents(
        KIND.plentiful,
        createRngState(forkSeed(world.worldSeed, victim.id, "pod")),
        COMMODITIES,
        LAVE_MARKET,
        pods.length,
      );
      expect(pods.map((p) => [p.podCommodity, p.podAmount])).toEqual(
        expected.map((c) => [c.commodity, c.amount]),
      );
      for (const pod of pods) {
        expect(KEYS.has(pod.podCommodity)).toBe(true);
        const unit = COMMODITIES.find((c) => c.key === pod.podCommodity)?.unit;
        const [low, high] = amountRange(unit);
        expect(pod.podAmount).toBeGreaterThanOrEqual(low);
        expect(pod.podAmount).toBeLessThanOrEqual(high);
        // The pod: segment prints, as the last segment of the entity line.
        expect(serializeEntity(pod)).toContain(
          `pod:"${pod.podCommodity}",${pod.podAmount}`,
        );
      }
    }
  });

  it("gives the same contents for the same seed and a different seed another", () => {
    const run = (seed: number): string[] =>
      podsOf(release(seed, content(), { cargo: 12, role: "trader" }).world).map(
        (p) => `${p.podCommodity}:${p.podAmount}`,
      );
    expect(run(7)).toEqual(run(7));
    const seen = new Set<string>();
    for (let seed = 1; seed <= 10; seed += 1) seen.add(run(seed).join("|"));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("leaves pods anonymous without goods or without a market", () => {
    const goodsOnly: DebrisContent = { ...debrisFixture(), goods: COMMODITIES };
    const marketOnly: DebrisContent = {
      ...debrisFixture(),
      market: LAVE_MARKET,
    };
    for (const variant of [goodsOnly, marketOnly, content(true)]) {
      const pods = podsOf(release(3, variant, { cargo: 12 }).world);
      expect(pods.length).toBeGreaterThan(0);
      for (const pod of pods) {
        expect(pod.podCommodity).toBe("");
        expect(pod.podAmount).toBe(0);
      }
    }
  });

  it("releases no pod and no content for a victim with cargo 0", () => {
    const { world } = release(5, content(), { cargo: 0, role: "trader" });
    expect(podsOf(world)).toHaveLength(0);
    const rng = createRngState(99);
    const before = rng.s;
    expect(
      drawPodContents(KIND.plentiful, rng, COMMODITIES, LAVE_MARKET, 0),
    ).toEqual([]);
    expect(rng.s).toBe(before);
  });
});

describe("resolvePodCargoKind (orchestrator decision 3)", () => {
  it("lets an explicit kind win over the role", () => {
    for (let kind = 1; kind < CARGO_KINDS.length; kind += 1) {
      expect(resolvePodCargoKind({ cargoKind: kind, role: "pirate" })).toBe(
        kind,
      );
    }
  });

  it("maps the trader and shuttle families to plentiful", () => {
    for (const role of ["trader", "trader-courier", "shuttle", "shuttle-x"]) {
      expect(resolvePodCargoKind({ cargoKind: 0, role })).toBe(KIND.plentiful);
    }
  });

  it("maps the pirate family to pirate", () => {
    for (const role of [
      "pirate",
      "pirate-light-fighter",
      "pirate-heavy-freighter",
    ]) {
      expect(resolvePodCargoKind({ cargoKind: 0, role })).toBe(KIND.pirate);
    }
  });

  it("falls back to scarce for any other or unknown role", () => {
    for (const role of [
      "",
      "police",
      "hunter",
      "traders",
      "pirates",
      "constructor",
      "__proto__",
      "Trader",
    ]) {
      expect(resolvePodCargoKind({ cargoKind: 0, role })).toBe(KIND.scarce);
    }
  });

  it("falls back by role for an invalid stored kind", () => {
    for (const cargoKind of [Number.NaN, -1, 0, 7, 2.5, 1e9, Infinity]) {
      expect(resolvePodCargoKind({ cargoKind, role: "trader" })).toBe(
        KIND.plentiful,
      );
      expect(resolvePodCargoKind({ cargoKind, role: "" })).toBe(KIND.scarce);
    }
  });
});

describe("drawPodContents follows Oolite's distribution", () => {
  const A = good("alpha");
  const B = good("bravo");
  const ILLEGAL = good("narcotics", "t", 2);

  /** Every drawn commodity of `count` pods. */
  const draw = (
    kind: number,
    goods: readonly Commodity[],
    market: readonly PodMarketEntry[],
    count = 200,
    seed = 11,
  ): string[] =>
    drawPodContents(kind, createRngState(seed), goods, market, count).map(
      (c) => c.commodity,
    );

  it("weights plentiful by stock and scarce by its reverse", () => {
    const market = [
      { key: "alpha", quantity: 100 },
      { key: "bravo", quantity: 0 },
    ];
    // plentiful: alpha 64 -> 100, bravo 0; scarce: alpha 0, bravo 64 -> 100.
    expect(new Set(draw(KIND.plentiful, [A, B], market))).toEqual(
      new Set(["alpha"]),
    );
    expect(new Set(draw(KIND.scarce, [A, B], market))).toEqual(
      new Set(["bravo"]),
    );
  });

  it("matches the C selection exactly over a fixed market", () => {
    const stock = { alpha: 10, bravo: 40, charlie: 5 };
    const goods = [A, B, good("charlie")];
    const market = Object.entries(stock).map(([key, quantity]) => ({
      key,
      quantity,
    }));
    for (const kind of [KIND.plentiful, KIND.scarce]) {
      const weights = oracleWeights(goods, stock, kind === KIND.scarce, true);
      const total = weights.reduce((a, b) => a + b, 0);
      const rng = createRngState(2024);
      const expected: string[] = [];
      for (let i = 0; i < 100; i += 1) {
        let qr = 1 + Math.floor(rngNext(rng) * total);
        let at = 0;
        while (qr > 0) qr -= weights[at++] as number;
        expected.push((goods[at - 1] as Commodity).key);
      }
      expect(draw(kind, goods, market, 100, 2024)).toEqual(expected);
    }
  });

  it("never picks an export-illegal good of even stock under a legal kind", () => {
    const market = [
      { key: "alpha", quantity: 30 },
      { key: "narcotics", quantity: 100 },
    ];
    for (const kind of [KIND.plentiful, KIND.scarce]) {
      expect(new Set(draw(kind, [A, ILLEGAL], market))).toEqual(
        new Set(["alpha"]),
      );
    }
  });

  it("keeps Oolite's small chance of an illegal good at odd stock (q & 1)", () => {
    // Oolite `Universe.m:3915-3918`: legal wants `q &= 1`, so an odd stock keeps
    // weight 1 * 100 / 64 = 1 and an even stock none. Ported as written.
    const odd = [
      { key: "alpha", quantity: 0 },
      { key: "narcotics", quantity: 101 },
    ];
    expect(new Set(draw(KIND.plentiful, [A, ILLEGAL], odd, 30))).toEqual(
      new Set(["narcotics"]),
    );
  });

  it("lets the contraband and pirate kinds pick illegal goods", () => {
    // scarce:YES legal:NO: alpha 100 -> 0, narcotics 0 -> 64 -> 100.
    const market = [
      { key: "alpha", quantity: 100 },
      { key: "narcotics", quantity: 0 },
    ];
    for (const kind of [KIND.contraband, KIND.pirate]) {
      expect(new Set(draw(kind, [A, ILLEGAL], market))).toEqual(
        new Set(["narcotics"]),
      );
    }
  });

  it("gives Narcotics for medical without a commodity draw", () => {
    const rng = createRngState(5);
    const contents = drawPodContents(
      KIND.medical,
      rng,
      COMMODITIES,
      LAVE_MARKET,
      6,
    );
    expect(contents.map((c) => c.commodity)).toEqual(
      Array(6).fill("narcotics"),
    );
    // Narcotics is tonnes: no amount draw either.
    expect(rng.s).toBe(createRngState(5).s);
  });

  it("takes the first good, with no draw, when every weight is 0", () => {
    const rng = createRngState(77);
    const market = [
      { key: "alpha", quantity: 0 },
      { key: "bravo", quantity: 0 },
    ];
    // plentiful over an all-zero market: total 0, `co_type = 0`, as written
    // (`Universe.m:3930-3945`). Tonnes need no amount draw, so no draw at all.
    const contents = drawPodContents(KIND.plentiful, rng, [A, B], market, 4);
    expect(contents.map((c) => c.commodity)).toEqual(Array(4).fill("alpha"));
    expect(rng.s).toBe(createRngState(77).s);
  });

  it("draws amounts by unit, only for the pods asked for", () => {
    const kg = good("gold", "kg");
    const g = good("gem_stones", "g");
    const t = good("food", "t");
    const only = (c: Commodity): readonly PodMarketEntry[] => [
      { key: c.key, quantity: 64 },
    ];
    for (const [c, low, high] of [
      [t, 1, 1],
      [kg, 1, 16],
      [g, 4, 34],
    ] as const) {
      const seen = new Set<number>();
      const rng = createRngState(31);
      for (let i = 0; i < 60; i += 1) {
        const [pod] = drawPodContents(KIND.plentiful, rng, [c], only(c), 1);
        expect(pod?.commodity).toBe(c.key);
        expect(Number.isInteger(pod?.amount)).toBe(true);
        expect(pod?.amount).toBeGreaterThanOrEqual(low);
        expect(pod?.amount).toBeLessThanOrEqual(high);
        seen.add(pod?.amount as number);
      }
      if (high > low) expect(seen.size).toBeGreaterThan(3);
    }
  });

  it("draws kilogram and gram amounts as the C does, left to right", () => {
    const kg = good("gold", "kg");
    const g = good("gem_stones", "g");
    const one = [{ key: "gold", quantity: 64 }];
    const gem = [{ key: "gem_stones", quantity: 64 }];
    const a = createRngState(8);
    const o = createRngState(8);
    const r = (n: number): number => Math.floor(rngNext(o) * n);
    // One kilogram pod: a single-good market has total 100, so one commodity
    // draw comes first; then `1 + r%6 + r%6 + r%6`.
    r(100);
    const expectedKg = 1 + r(6) + r(6) + r(6);
    expect(drawPodContents(KIND.plentiful, a, [kg], one, 1)[0]?.amount).toBe(
      expectedKg,
    );
    r(100);
    const expectedG = 4 + r(16) + r(11) + r(6);
    expect(drawPodContents(KIND.plentiful, a, [g], gem, 1)[0]?.amount).toBe(
      expectedG,
    );
  });

  it("returns no contents without a usable good", () => {
    expect(draw(KIND.plentiful, [], LAVE_MARKET)).toEqual([]);
    expect(draw(KIND.plentiful, [good("Bad Key!")], LAVE_MARKET)).toEqual([]);
  });

  it("is unchanged by a market key absent from the goods", () => {
    const market = [...LAVE_MARKET, { key: "not_a_good", quantity: 50 }];
    expect(draw(KIND.plentiful, COMMODITIES, market, 20)).toEqual(
      draw(KIND.plentiful, COMMODITIES, LAVE_MARKET, 20),
    );
  });

  it("uses a market the arrival seed generates, unchanged by the draw", () => {
    // The generator is a pure function of the seed; a different system market
    // changes weights, never throws.
    const other = generateMarket(
      system,
      COMMODITIES,
      arrivalMarketSeed(system.id, 1),
    ).goods.map((g) => ({ key: g.key, quantity: g.stock }));
    for (const kind of Object.values(KIND)) {
      const contents = drawPodContents(
        kind,
        createRngState(3),
        COMMODITIES,
        other,
        9,
      );
      expect(contents).toHaveLength(9);
      for (const c of contents) expect(KEYS.has(c.commodity)).toBe(true);
    }
  });
});

describe("totality (T-21-36, the milestone rule)", () => {
  const roleArb = fc.oneof(
    fc.string(),
    fc.constantFrom(
      "trader",
      "trader-x",
      "shuttle",
      "pirate",
      "pirate-light-fighter",
      "constructor",
      "toString",
      "",
    ),
    fc.constantFrom(null, undefined, 4, {}, []),
  );
  const kindArb = fc.oneof(
    fc.integer({ min: -3, max: 10 }),
    fc.double(),
    fc.constantFrom(Number.NaN, Infinity, -Infinity, 2 ** 53, undefined, null),
  );

  it("resolvePodCargoKind never throws and returns a valid index", () => {
    fc.assert(
      fc.property(kindArb, roleArb, (cargoKind, role) => {
        const kind = resolvePodCargoKind({
          cargoKind: cargoKind as number,
          role: role as string,
        });
        expect(Number.isInteger(kind)).toBe(true);
        expect(kind).toBeGreaterThanOrEqual(1);
        expect(kind).toBeLessThanOrEqual(CARGO_KINDS.length - 1);
        if (
          typeof cargoKind === "number" &&
          Number.isInteger(cargoKind) &&
          cargoKind >= 1 &&
          cargoKind <= 6
        ) {
          expect(kind).toBe(cargoKind);
        }
      }),
      { numRuns: 500 },
    );
  });

  const keyArb = fc.oneof(
    fc.constantFrom("food", "gold", "gem_stones", "narcotics", "x"),
    fc.string({ maxLength: 80 }),
    fc.constantFrom(undefined, null, 3),
  );
  const goodArb = fc.oneof(
    fc.record(
      {
        key: keyArb,
        unit: fc.constantFrom("t", "kg", "g", "lb", undefined, 5),
        legalityExport: fc.oneof(
          fc.integer({ min: -3, max: 5 }),
          fc.double(),
          fc.constantFrom(undefined, null, "1"),
        ),
      },
      { requiredKeys: [] },
    ),
    fc.constantFrom(null, undefined, 4, "str"),
  );
  const quantityArb = fc.oneof(
    fc.integer({ min: -10, max: 300 }),
    fc.double(),
    fc.constantFrom(Number.NaN, Infinity, -Infinity, undefined, null, "9"),
  );
  const entryArb = fc.oneof(
    fc.record({ key: keyArb, quantity: quantityArb }, { requiredKeys: [] }),
    fc.constantFrom(null, undefined, 4, "str"),
  );
  const countArb = fc.oneof(
    fc.integer({ min: -5, max: 400 }),
    fc.double(),
    fc.constantFrom(Number.NaN, Infinity, -Infinity, 0.5, 2.9, 1e9),
  );

  it("drawPodContents never throws and stays within its bounds", () => {
    fc.assert(
      fc.property(
        kindArb,
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.array(goodArb, { maxLength: 8 }),
        fc.array(entryArb, { maxLength: 8 }),
        countArb,
        (kind, seed, goods, market, count) => {
          const run = (): ReturnType<typeof drawPodContents> =>
            drawPodContents(
              kind as number,
              createRngState(seed),
              goods as unknown as readonly Commodity[],
              market as unknown as readonly PodMarketEntry[],
              count,
            );
          const contents = run();
          const limit = Number.isFinite(count)
            ? Math.min(Math.max(0, Math.floor(count)), MAX_ENTITY_CARGO)
            : 0;
          expect(contents.length).toBeLessThanOrEqual(limit);
          const records = (goods as unknown[]).filter(
            (g): g is Commodity =>
              typeof g === "object" &&
              g !== null &&
              typeof (g as { key?: unknown }).key === "string",
          );
          for (const pod of contents) {
            const owners = records.filter((g) => g.key === pod.commodity);
            expect(owners.length).toBeGreaterThan(0);
            expect(Number.isInteger(pod.amount)).toBe(true);
            expect(pod.amount).toBeGreaterThanOrEqual(1);
            expect(pod.amount).toBeLessThanOrEqual(MAX_POD_AMOUNT);
            expect(
              owners.some((o) => {
                const [low, high] = amountRange(o.unit as string | undefined);
                return pod.amount >= low && pod.amount <= high;
              }),
            ).toBe(true);
          }
          if (records.length === 0) expect(contents).toEqual([]);
          // A pure function of its inputs and the fork seed.
          expect(run()).toEqual(contents);
        },
      ),
      { numRuns: 500 },
    );
  });
});
