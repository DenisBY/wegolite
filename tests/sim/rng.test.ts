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

import { describe, expect, it } from "vitest";

import { marketSeedForSystem } from "../../src/sim/economy/market.js";
import { createSeededRandom } from "../../src/sim/math.js";

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
