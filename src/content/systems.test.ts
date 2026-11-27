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

import type { AnyGalaxyIndex } from "./systems.js";
import {
  GALAXY_CHUNK_PATHS,
  galaxy0,
  loadAnyGalaxy,
  loadGalaxy,
} from "./systems.js";
import { STATION_KINDS, STATION_RECORDS } from "./stations.js";

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

describe("each system's main station kind (Phase 22.1)", () => {
  const COUNTS: readonly (readonly [number, number, number])[] = [
    [225, 22, 9],
    [232, 17, 7],
    [228, 22, 6],
    [238, 14, 4],
    [226, 23, 7],
    [228, 22, 6],
    [220, 28, 8],
    [227, 19, 10],
  ];

  const GALAXIES = [0, 1, 2, 3, 4, 5, 6, 7] as const;

  async function countKinds(galaxy: AnyGalaxyIndex): Promise<number[]> {
    const chunk = await loadAnyGalaxy(galaxy);
    return STATION_KINDS.map(
      (kind) => chunk.filter((system) => system.station === kind).length,
    );
  }

  it("counts 1,824 coriolis, 167 dodecahedron and 57 icosahedron overall", async () => {
    const totals = [0, 0, 0];
    for (const galaxy of GALAXIES) {
      (await countKinds(galaxy)).forEach((count, index) => {
        totals[index] = (totals[index] ?? 0) + count;
      });
    }
    // STATION_KINDS order: coriolis, dodecahedron, icosahedron.
    expect(totals).toEqual([1824, 167, 57]);
  });

  it("counts each galaxy's kinds", async () => {
    for (const galaxy of GALAXIES) {
      expect(await countKinds(galaxy), `galaxy ${String(galaxy)}`).toEqual(
        COUNTS[galaxy],
      );
    }
  });

  it("maps every system's kind to a ships-client.json entry", async () => {
    const shipKeys = new Set(
      (
        JSON.parse(
          readFileSync(
            new URL("./generated/ships-client.json", import.meta.url),
            "utf8",
          ),
        ) as { key: string }[]
      ).map((entry) => entry.key),
    );
    for (const galaxy of GALAXIES) {
      for (const system of await loadAnyGalaxy(galaxy)) {
        const record = STATION_RECORDS[system.station];
        expect(shipKeys.has(record.shipKey), system.id).toBe(true);
      }
    }
  });

  it("builds Lave a Coriolis, Zaonce an Icosahedron and Biarge a Dodecahedron", () => {
    const stationOf = (id: string): string | undefined =>
      galaxy0().find((system) => system.id === id)?.station;
    expect(stationOf("g0-s7")).toBe("coriolis");
    expect(stationOf("g0-s129")).toBe("icosahedron");
    expect(stationOf("g0-s3")).toBe("dodecahedron");
  });
});
