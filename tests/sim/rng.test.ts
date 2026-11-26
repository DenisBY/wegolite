// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The seeded simulation stream (FOUND-12, D-02, D-04).
 *
 * The first describe pins the shipped `createSeededRandom` closure, captured
 * from the unmodified mulberry32 implementation before it was delegated to a
 * plain-data `RngState`. The vectors are exact literals: a delegation that
 * changes one bit of one draw fails here, and so would the arrival goldens.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { marketSeedForSystem } from "../../src/sim/economy/market.js";
import { createSeededRandom } from "../../src/sim/math.js";
import {
  createRngState,
  ENTITY_RNG_PURPOSES,
  fmix32,
  forkSeed,
  mix32,
  RNG_PURPOSE_CODES,
  rngNext,
  worldSeedFor,
} from "../../src/sim/rng.js";
import type { RngPurpose, RngState } from "../../src/sim/rng.js";

const LAVE_MARKET_SEED = marketSeedForSystem("g0-s7");

const PINNED_DRAWS: readonly {
  readonly label: string;
  readonly seed: number;
  readonly draws: readonly number[];
}[] = [
  {
    label: "0",
    seed: 0,
    draws: [
      0.26642920868471265, 0.0003297457005828619, 0.2232720274478197,
      0.1462021479383111, 0.46732782293111086, 0.5450490827206522,
      0.6152513844426721, 0.6489853798411787,
    ],
  },
  {
    label: "1",
    seed: 1,
    draws: [
      0.6270739405881613, 0.002735721180215478, 0.5274470399599522,
      0.9810509674716741, 0.9683778982143849, 0.281103502959013,
      0.6128388606011868, 0.7207431411370635,
    ],
  },
  {
    label: "0x9e3779b9",
    seed: 0x9e3779b9,
    draws: [
      0.3588899802416563, 0.10590326134115458, 0.675290479324758,
      0.9179345588199794, 0.10157715040259063, 0.30100292386487126,
      0.02499035419896245, 0.4663846483454108,
    ],
  },
  {
    label: "0xffffffff",
    seed: 0xffffffff,
    draws: [
      0.8964226141106337, 0.189478256739676, 0.7156526781618595,
      0.9440599093213677, 0.8452364315744489, 0.5391399988438934,
      0.6804977387655526, 0.4755720964167267,
    ],
  },
  {
    label: 'marketSeedForSystem("g0-s7")',
    seed: 3545325333,
    draws: [
      0.2966661495156586, 0.9948010963853449, 0.579061423195526,
      0.7173839812166989, 0.9125157159287483, 0.2853475143201649,
      0.6751659333240241, 0.8015725647564977,
    ],
  },
];

describe("createSeededRandom (pinned before delegation)", () => {
  it("uses the Lave market seed the vectors were captured with", () => {
    expect(LAVE_MARKET_SEED).toBe(3545325333);
  });

  for (const vector of PINNED_DRAWS) {
    it(`reproduces the first eight outputs for seed ${vector.label}`, () => {
      const next = createSeededRandom(vector.seed);
      const drawn = Array.from({ length: 8 }, () => next());
      for (let index = 0; index < 8; index += 1) {
        expect(drawn[index]).toBe(vector.draws[index]);
      }
    });
  }
});

describe("rngNext over a plain RngState", () => {
  for (const vector of PINNED_DRAWS) {
    it(`reproduces every pinned draw for seed ${vector.label}`, () => {
      const state = createRngState(vector.seed);
      for (let index = 0; index < 8; index += 1) {
        expect(rngNext(state)).toBe(vector.draws[index]);
      }
    });
  }

  it("continues identically after a JSON round trip mid-sequence", () => {
    const state = createRngState(LAVE_MARKET_SEED);
    for (let index = 0; index < 3; index += 1) rngNext(state);
    const restored = JSON.parse(JSON.stringify(state)) as RngState;
    expect(restored).toEqual(state);
    for (let index = 0; index < 5; index += 1) {
      expect(rngNext(restored)).toBe(rngNext(state));
    }
  });

  it("keeps the state an unsigned 32-bit integer across 1,000 draws", () => {
    const state = createRngState(0xffffffff);
    for (let index = 0; index < 1000; index += 1) {
      const value = rngNext(state);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(Number.isInteger(state.s)).toBe(true);
      expect(state.s).toBeGreaterThanOrEqual(0);
      expect(state.s).toBeLessThan(2 ** 32);
    }
  });

  it("coerces the seed to an unsigned 32-bit integer", () => {
    expect(createRngState(-1)).toEqual({ s: 0xffffffff });
    expect(createRngState(2 ** 32 + 5)).toEqual({ s: 5 });
  });
});

/*
 * One-way contract vectors (D-02, review 10b4108 L61). Every expected value was
 * computed by an independent BigInt re-implementation of the owner-confirmed
 * definition (Task 2 option-a) that imports nothing from src/sim/rng.ts:
 *
 *   fmix32(h)   = MurmurHash3 finaliser (>>16, *0x85ebca6b, >>13, *0xc2b2ae35, >>16)
 *   mix32(a, b) = fmix32(a ^ fmix32((b + 0x9e3779b9) mod 2^32))
 *   worldSeedFor(marketSeed, epoch)   = mix32(marketSeed, epoch)
 *   forkSeed(worldSeed, id, purpose)  = mix32(mix32(worldSeed, id), code)
 *   codes: world 1, ai 2, combat 3
 *
 * Phase 11 re-checks these before it persists epoch. Do not edit a literal to
 * make a failing run pass: a moved vector re-rolls every saved world.
 */
describe("fmix32 and mix32 vectors (D-02)", () => {
  it("pins fmix32", () => {
    expect(fmix32(0)).toBe(0x00000000);
    expect(fmix32(1)).toBe(0x514e28b7);
    expect(fmix32(0xffffffff)).toBe(0x81f16f39);
  });

  it("pins mix32", () => {
    expect(mix32(0, 0)).toBe(0xaa3e5b61);
    expect(mix32(1, 0)).toBe(0x6f0b28e6);
    expect(mix32(0, 1)).toBe(0x70f6c6d8);
    expect(mix32(0xffffffff, 7)).toBe(0xb31d5126);
  });

  it("is a bijection in each argument over a sampled range", () => {
    const overB = new Set<number>();
    const overA = new Set<number>();
    for (let value = 0; value < 5000; value += 1) {
      overB.add(mix32(0xdeadbeef, value));
      overA.add(mix32(value, 0xdeadbeef));
    }
    expect(overB.size).toBe(5000);
    expect(overA.size).toBe(5000);
  });

  it("returns unsigned 32-bit integers", () => {
    for (const [a, b] of [
      [0, 0],
      [0xffffffff, 0xffffffff],
      [123456789, 987654321],
    ] as const) {
      const value = mix32(a, b);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(2 ** 32);
    }
  });
});

describe("worldSeedFor and forkSeed vectors (D-02, D-04)", () => {
  it("pins the purpose codes by key and the entity purposes", () => {
    expect(RNG_PURPOSE_CODES).toEqual({
      world: 1,
      ai: 2,
      combat: 3,
      cargo: 4,
      damage: 5,
      pod: 6,
      scoop: 7,
      repop: 8,
      inj: 9,
    });
    expect(Object.isFrozen(RNG_PURPOSE_CODES)).toBe(true);
    expect([...ENTITY_RNG_PURPOSES]).toEqual(["ai", "combat"]);
  });

  it("registers the four v2.4 stateless purposes (FOUND-20) apart from each other and from the entity purposes", () => {
    const purposes = [
      "world",
      "ai",
      "combat",
      "cargo",
      "damage",
      "pod",
      "scoop",
      "repop",
      "inj",
    ] as const;
    // Codes are appended, never renumbered: the five old codes keep their value.
    expect(RNG_PURPOSE_CODES.world).toBe(1);
    expect(RNG_PURPOSE_CODES.damage).toBe(5);
    expect(RNG_PURPOSE_CODES.pod).toBe(6);
    expect(RNG_PURPOSE_CODES.scoop).toBe(7);
    expect(RNG_PURPOSE_CODES.repop).toBe(8);
    expect(RNG_PURPOSE_CODES.inj).toBe(9);
    for (const purpose of ["pod", "scoop", "repop", "inj"] as const) {
      expect([...ENTITY_RNG_PURPOSES]).not.toContain(purpose);
    }
    for (const seed of [0, 1, 0x1234abcd, 726532988, 0xffffffff]) {
      for (const id of [0, 100, 101, 4242, 0xffffffff]) {
        const forks = purposes.map((purpose) => forkSeed(seed, id, purpose));
        expect(new Set(forks).size, `seed ${seed} id ${id}`).toBe(
          purposes.length,
        );
        expect(forkSeed(seed, id, "pod")).toBe(mix32(mix32(seed, id), 6));
      }
    }
  });

  it("forks the stateless damage purpose (code 5) apart from every other stream (Phase 19)", () => {
    const world = worldSeedFor(LAVE_MARKET_SEED, 1);
    const damage = forkSeed(world, 100, "damage");
    expect(damage).toBe(mix32(mix32(world, 100), 5));
    for (const other of ["ai", "combat", "cargo", "world"] as const) {
      expect(damage).not.toBe(forkSeed(world, 100, other));
    }
    // "damage" is forked per player-damage tick and never stored: not an entity purpose.
    expect([...ENTITY_RNG_PURPOSES]).not.toContain("damage");
  });

  it("forks the stateless cargo purpose (code 4) apart from the stored streams (plan 15-03)", () => {
    const world = worldSeedFor(LAVE_MARKET_SEED, 1);
    const cargo = forkSeed(world, 101, "cargo");
    expect(cargo).toBe(mix32(mix32(world, 101), 4));
    expect(cargo).not.toBe(forkSeed(world, 101, "combat"));
    expect(cargo).not.toBe(forkSeed(world, 101, "ai"));
    expect(cargo).not.toBe(forkSeed(world, 102, "cargo"));
    // "cargo" is forked per spawn and never stored: not an entity purpose.
    expect([...ENTITY_RNG_PURPOSES]).not.toContain("cargo");
  });

  it("pins worldSeedFor for the Lave market seed at epochs 0, 1 and 2", () => {
    expect(worldSeedFor(LAVE_MARKET_SEED, 0)).toBe(0xbeeeb287);
    expect(worldSeedFor(LAVE_MARKET_SEED, 1)).toBe(0x2b4e037c);
    expect(worldSeedFor(LAVE_MARKET_SEED, 2)).toBe(0x8c95b06e);
    expect(worldSeedFor(LAVE_MARKET_SEED, 0)).toBe(mix32(LAVE_MARKET_SEED, 0));
  });

  it("pins forkSeed for ids 101 and 102 and both entity purposes", () => {
    const world = worldSeedFor(LAVE_MARKET_SEED, 1);
    expect(forkSeed(world, 101, "ai")).toBe(0xc1560f16);
    expect(forkSeed(world, 101, "combat")).toBe(0xfcbfc8e0);
    expect(forkSeed(world, 102, "ai")).toBe(0xf7113db3);
    expect(forkSeed(world, 102, "combat")).toBe(0xa4390060);
    expect(forkSeed(world, 0, "world")).toBe(0x0d279bea);
    expect(forkSeed(world, 101, "ai")).toBe(
      mix32(mix32(world, 101), RNG_PURPOSE_CODES.ai),
    );
  });

  it("pins forkSeed for id 101 at epochs 0, 1 and 2", () => {
    expect(forkSeed(worldSeedFor(LAVE_MARKET_SEED, 0), 101, "ai")).toBe(
      0xbef32200,
    );
    expect(forkSeed(worldSeedFor(LAVE_MARKET_SEED, 1), 101, "ai")).toBe(
      0xc1560f16,
    );
    expect(forkSeed(worldSeedFor(LAVE_MARKET_SEED, 2), 101, "ai")).toBe(
      0x33c884e7,
    );
  });

  it("accepts the largest legal epoch, entity id and seed", () => {
    expect(forkSeed(0xffffffff, 0xffffffff, "combat")).toBe(0x65b4d1ed);
    expect(() => worldSeedFor(0xffffffff, 0xffffffff)).not.toThrow();
  });
});

describe("stream independence edges (FOUND-12)", () => {
  it("separates adjacent ids and the two entity purposes", () => {
    const world = worldSeedFor(LAVE_MARKET_SEED, 1);
    const seeds = [
      forkSeed(world, 101, "ai"),
      forkSeed(world, 101, "combat"),
      forkSeed(world, 102, "ai"),
      forkSeed(world, 102, "combat"),
    ];
    expect(new Set(seeds).size).toBe(4);
    const firstDraws = seeds.map((seed) => rngNext(createRngState(seed)));
    expect(new Set(firstDraws).size).toBe(4);
  });

  it("gives 1,000 distinct world seeds for epochs 0 to 999", () => {
    const seeds = new Set<number>();
    for (let epoch = 0; epoch < 1000; epoch += 1) {
      seeds.add(worldSeedFor(LAVE_MARKET_SEED, epoch));
    }
    expect(seeds.size).toBe(1000);
  });

  it("id 101 across worlds: only worldSeed separates two worlds", () => {
    // CONTEXT D-06 (amended 2026-11-12): every new world restarts dynamic ids
    // at 101, so the same id draws differently only through worldSeed.
    const seeds = new Set<number>();
    for (let epoch = 0; epoch < 1000; epoch += 1) {
      const seed = forkSeed(worldSeedFor(LAVE_MARKET_SEED, epoch), 101, "ai");
      seeds.add(seed);
      expect(forkSeed(worldSeedFor(LAVE_MARKET_SEED, epoch), 101, "ai")).toBe(
        seed,
      );
    }
    expect(seeds.size).toBe(1000);
  });

  it("reproduces identical inputs (the same world regenerated, D-02)", () => {
    const first = forkSeed(worldSeedFor(42, 7), 500, "combat");
    const second = forkSeed(worldSeedFor(42, 7), 500, "combat");
    expect(second).toBe(first);
  });
});

describe("worldSeedFor and forkSeed argument checks (T-08-04)", () => {
  it("rejects a bad epoch", () => {
    for (const epoch of [-1, 1.5, Number.NaN, 2 ** 32, Infinity]) {
      expect(() => worldSeedFor(LAVE_MARKET_SEED, epoch)).toThrow(RangeError);
    }
  });

  it("rejects a non-finite market seed or world seed", () => {
    for (const seed of [Number.NaN, Infinity, -Infinity]) {
      expect(() => worldSeedFor(seed, 0)).toThrow(RangeError);
      expect(() => forkSeed(seed, 101, "ai")).toThrow(RangeError);
    }
  });

  it("rejects a bad entity id", () => {
    for (const entityId of [-1, 1.5, Number.NaN, 2 ** 32, Infinity]) {
      expect(() => forkSeed(1, entityId, "ai")).toThrow(RangeError);
    }
  });

  it("rejects an unknown or inherited purpose key (B2)", () => {
    for (const purpose of [
      "constructor",
      "__proto__",
      "toString",
      "hasOwnProperty",
      "valueOf",
      "",
      "Combat",
    ]) {
      expect(() => forkSeed(1, 101, purpose as RngPurpose)).toThrow(RangeError);
    }
    for (const purpose of ["world", "ai", "combat"] as const) {
      expect(() => forkSeed(1, 101, purpose)).not.toThrow();
    }
  });
});

/** Remove block comments and whole-line `//` comments before scanning. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}

/** Every `.ts` file under `directory`, tolerating transient probe entries. */
function collectSimFiles(directory: string, found: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    // A parallel guard test may remove a transient probe directory mid-walk.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return found;
    throw error;
  }
  for (const entry of entries) {
    if (entry.name.startsWith("__purity_")) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectSimFiles(path, found);
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      found.push(path);
    }
  }
  return found;
}

describe("only serialisable streams in src/sim", () => {
  // src/sim/math.ts is on plan 08-09's AI-zone import allow-list, and plan 08-09
  // also bans importing createSeededRandom there by lint (`importNames`).
  // Raising the count or adding an importer needs an AI-zone review, not just a
  // new number here.
  const root = new URL("../../src/sim", import.meta.url).pathname;
  const sources = new Map<string, string>();
  for (const path of collectSimFiles(root)) {
    try {
      sources.set(
        relative(new URL("../..", import.meta.url).pathname, path),
        withoutComments(readFileSync(path, "utf8")),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  it("scans a non-trivial set of files", () => {
    expect(sources.size).toBeGreaterThan(20);
    expect(sources.has("src/sim/math.ts")).toBe(true);
  });

  it("holds createSeededRandom( only at its declaration and the arrival call", () => {
    const hits: string[] = [];
    for (const [path, text] of sources) {
      const count = text.split("createSeededRandom(").length - 1;
      for (let index = 0; index < count; index += 1) hits.push(path);
    }
    expect(hits.sort()).toEqual([
      "src/sim/hyperspace/arrival.ts",
      "src/sim/math.ts",
    ]);
  });

  it("lets only arrival.ts import createSeededRandom, under any alias", () => {
    const importer =
      /\b(import|export)\s*(type\s+)?\{[^}]*\bcreateSeededRandom\b[^}]*\}\s*from/;
    const importers = [...sources]
      .filter(([, text]) => importer.test(text))
      .map(([path]) => path)
      .sort();
    expect(importers).toEqual(["src/sim/hyperspace/arrival.ts"]);
  });

  it("has no namespace import of math.js in src/sim", () => {
    const namespaceImport =
      /import\s*\*\s*as\s+[A-Za-z_$][A-Za-z0-9_$]*\s+from\s*["'][^"']*math\.js["']/;
    const offenders = [...sources]
      .filter(([, text]) => namespaceImport.test(text))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
