// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The D-14 loader contract: galaxy 0 is eager and synchronous, g1-g7 are seven
 * separate code-split dynamic entries (DATA-05, D-14).
 *
 * The production-build half of this guarantee — seven `g1`-`g7` chunk files and
 * no `g0` chunk in `dist/assets` — is asserted by the plan's build gate, not by
 * this Node-only suite. Here we prove the source shape: one eager glob, seven
 * literal lazy keys, and no `g0.json` in the lazy set.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  GALAXY_CHUNK_PATHS,
  galaxy0,
  loadAnyGalaxy,
  loadGalaxy,
} from "./systems.js";

const source = readFileSync(new URL("./systems.ts", import.meta.url), "utf8");

describe("per-galaxy loader", () => {
  it("returns galaxy 0 synchronously as 256 records", () => {
    const chunk = galaxy0();
    expect(Array.isArray(chunk)).toBe(true);
    expect(chunk).toHaveLength(256);
    expect(chunk[0]?.id).toBe("g0-s0");
    expect(chunk.find((system) => system.id === "g0-s7")?.name).toBe("Lave");
  });

  it("loads a code-split galaxy on demand", async () => {
    const chunk = await loadGalaxy(3);
    expect(chunk).toHaveLength(256);
    expect(chunk.every((system) => system.id.startsWith("g3-"))).toBe(true);
    expect(await loadAnyGalaxy(0)).toHaveLength(256);
  });

  it("names exactly the seven lazy galaxies, in order", () => {
    expect(Object.keys(GALAXY_CHUNK_PATHS)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
    ]);
    expect(Object.values(GALAXY_CHUNK_PATHS)).toEqual([
      "./generated/systems/g1.json",
      "./generated/systems/g2.json",
      "./generated/systems/g3.json",
      "./generated/systems/g4.json",
      "./generated/systems/g5.json",
      "./generated/systems/g6.json",
      "./generated/systems/g7.json",
    ]);
  });

  it("declares exactly one eager glob and seven literal lazy entries with no g0", () => {
    expect(source.match(/eager: true/g)).toHaveLength(1);

    const lazyStart = source.indexOf("const lazyGalaxies = import.meta.glob(");
    expect(lazyStart).toBeGreaterThan(-1);
    const lazyEnd = source.indexOf("{ query:", lazyStart);
    expect(lazyEnd).toBeGreaterThan(lazyStart);
    const lazyBlock = source.slice(lazyStart, lazyEnd);

    const lazyPaths = [
      ...lazyBlock.matchAll(/"\.\/generated\/systems\/g([1-7])\.json"/g),
    ].map((match) => match[1]);
    expect(lazyPaths).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(lazyBlock).not.toContain("g0.json");
  });
});
