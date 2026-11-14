// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The lazy hull-octree artifact (CBT-07, D-01, T-13-06, T-13-07).
 *
 * The generated file is compiled at build time from the vendored `.dat` models
 * with the existing octree and radius ports. These cases pin that it parses
 * under the strict, bounded schema, holds exactly the ten hulls a laser can hit,
 * stays under its size gate, agrees with the NPC records on every collision
 * radius, matches a golden digest, and that nothing on the boot path imports the
 * loader. The expected digest lives in `tests/golden/content/ships-hulls.json`.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  MAX_HULL_ARTIFACT_BYTES,
  MAX_HULL_DEPTH,
  MAX_HULL_NODES,
  ShipHullCatalogueSchema,
  ShipHullSchema,
} from "../../src/content/schemas/ship-hull.js";
import type { ShipHull } from "../../src/content/schemas/ship-hull.js";
import { loadShipHulls } from "../../src/content/ships-hulls.js";
import { NpcShipCatalogueSchema } from "../../src/content/schemas/ship-npc.js";
import {
  HULL_SHIP_KEYS,
  PLAYER_HULL_KEY,
} from "../../tools/oolite-ingest/convert/ship-hulls.js";
import { NPC_SHIP_KEYS } from "../../tools/oolite-ingest/convert/npc-ships.js";

const REPO_ROOT = process.cwd();
const LOADER = "src/content/ships-hulls.ts";
const GENERATED = "src/content/generated/ships-hulls.json";
const NPC_GENERATED = "src/content/generated/ships-npc.json";

function readText(relative: string): string {
  return readFileSync(join(REPO_ROOT, relative), "utf8");
}

const generated: unknown = JSON.parse(readText(GENERATED));

function firstHull(): Record<string, unknown> {
  const hull = (generated as Record<string, unknown>[])[0];
  if (hull === undefined) throw new Error("generated file has no hull");
  return hull;
}

/** A hull record with its octree replaced, for the rejection cases. */
function withOctree(octree: Record<string, unknown>): unknown {
  const hull = firstHull();
  return {
    ...hull,
    octree: { ...(hull["octree"] as Record<string, unknown>), ...octree },
  };
}

function accepts(record: unknown): boolean {
  return ShipHullSchema.safeParse(record).success;
}

/** `levels` arrays nested on the first child, the rest empty leaves. */
function nested(levels: number): unknown {
  let node: unknown = -1;
  for (let level = 0; level < levels; level++) {
    node = [node, 0, 0, 0, 0, 0, 0, 0];
  }
  return node;
}

interface Digest {
  readonly key: string;
  readonly depth: number;
  readonly nodes: number;
  readonly solidLeaves: number;
  readonly rootHalfWidth: number;
  readonly collisionRadius: number;
}

/** Per hull: depth, node count, solid-leaf count, root half-width and radius. */
function digestOf(hulls: readonly ShipHull[]): Digest[] {
  return hulls.map((hull) => {
    let nodes = 0;
    let solidLeaves = 0;
    const stack: unknown[] = [hull.octree.root];
    for (;;) {
      const node = stack.pop();
      if (node === undefined) break;
      nodes++;
      if (node === -1) solidLeaves++;
      else if (Array.isArray(node)) stack.push(...(node as unknown[]));
    }
    return {
      key: hull.key,
      depth: hull.octree.depth,
      nodes,
      solidLeaves,
      rootHalfWidth: hull.octree.radius,
      collisionRadius: hull.collisionRadius,
    };
  });
}

function sourceFiles(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(join(REPO_ROOT, directory), {
    withFileTypes: true,
  })) {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (relative === "src/content/generated") continue;
      sourceFiles(relative, found);
    } else if (
      /\.tsx?$/.test(entry.name) &&
      !/\.test\.tsx?$/.test(entry.name)
    ) {
      found.push(relative);
    }
  }
  return found;
}

describe("the generated hull file", () => {
  it("parses under the strict hull catalogue schema", () => {
    expect(ShipHullCatalogueSchema.safeParse(generated).success).toBe(true);
  });

  it("holds exactly the ten keys in HULL_SHIP_KEYS order", () => {
    const parsed = ShipHullCatalogueSchema.parse(generated);
    expect(parsed.map((hull) => hull.key)).toEqual([...HULL_SHIP_KEYS]);
    expect(parsed).toHaveLength(10);
  });

  it("includes the Cobra player key, so a firing NPC can hit the player", () => {
    const parsed = ShipHullCatalogueSchema.parse(generated);
    expect(parsed[0]?.key).toBe(PLAYER_HULL_KEY);
    expect(PLAYER_HULL_KEY).toBe("oolite_template_cobra3-player");
  });

  it("is at most MAX_HULL_ARTIFACT_BYTES, so the lazy chunk stays small", () => {
    expect(statSync(join(REPO_ROOT, GENERATED)).size).toBeLessThanOrEqual(
      MAX_HULL_ARTIFACT_BYTES,
    );
  });

  it("gives each NPC hull the collision radius of its NPC record", () => {
    const npc = NpcShipCatalogueSchema.parse(
      JSON.parse(readText(NPC_GENERATED)),
    );
    const hulls = ShipHullCatalogueSchema.parse(generated);
    for (const key of NPC_SHIP_KEYS) {
      const record = npc.find((candidate) => candidate.key === key);
      const hull = hulls.find((candidate) => candidate.key === key);
      expect(record, key).toBeDefined();
      expect(hull?.collisionRadius, key).toBe(record?.radius);
    }
  });

  it("matches the golden digest", () => {
    const golden = JSON.parse(
      readText("tests/golden/content/ships-hulls.json"),
    ) as { version: number; hulls: Digest[] };
    expect(golden.version).toBe(1);
    expect(digestOf(ShipHullCatalogueSchema.parse(generated))).toEqual(
      golden.hulls,
    );
  });
});

describe("ShipHullSchema bounds", () => {
  it("accepts the generated first hull", () => {
    expect(accepts(firstHull())).toBe(true);
  });

  it("rejects a node array of seven children", () => {
    expect(accepts(withOctree({ root: [0, 0, 0, 0, 0, 0, 0] }))).toBe(false);
  });

  it("rejects a node array of nine children", () => {
    expect(accepts(withOctree({ root: [0, 0, 0, 0, 0, 0, 0, 0, 0] }))).toBe(
      false,
    );
  });

  it("rejects a node value of 2, a string and null", () => {
    for (const leaf of [2, "0", null, 1]) {
      expect(accepts(withOctree({ root: [leaf, 0, 0, 0, 0, 0, 0, 0] }))).toBe(
        false,
      );
    }
  });

  it("rejects a tree nested deeper than MAX_HULL_DEPTH, whatever it declares", () => {
    expect(
      accepts(withOctree({ depth: MAX_HULL_DEPTH, root: nested(8) })),
    ).toBe(false);
    expect(
      accepts(withOctree({ depth: MAX_HULL_DEPTH + 1, root: nested(8) })),
    ).toBe(false);
    expect(
      accepts(withOctree({ depth: MAX_HULL_DEPTH, root: nested(7) })),
    ).toBe(true);
  });

  it("rejects a declared depth smaller than the real nesting", () => {
    expect(accepts(withOctree({ depth: 2, root: nested(3) }))).toBe(false);
    expect(accepts(withOctree({ depth: 3, root: nested(3) }))).toBe(true);
  });

  it("rejects an extra key on the hull and on the octree", () => {
    expect(accepts({ ...firstHull(), mass: 1 })).toBe(false);
    expect(accepts(withOctree({ extra: 1 }))).toBe(false);
  });

  it("rejects a non-positive or non-finite radius", () => {
    for (const radius of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(accepts(withOctree({ radius }))).toBe(false);
      expect(accepts({ ...firstHull(), collisionRadius: radius })).toBe(false);
    }
  });

  it("rejects a hull over the node cap", () => {
    // Four full levels of eight is 4,681 nodes, inside the cap; five is 37,449,
    // far over MAX_HULL_NODES while staying within the depth cap.
    function full(levels: number): unknown {
      return levels === 0
        ? -1
        : Array.from({ length: 8 }, () => full(levels - 1));
    }
    expect(MAX_HULL_NODES).toBeLessThan((8 ** 6 - 1) / 7);
    expect(accepts(withOctree({ depth: 7, root: full(4) }))).toBe(true);
    expect(accepts(withOctree({ depth: 7, root: full(5) }))).toBe(false);
  });

  it("rejects an empty catalogue and one over sixteen hulls", () => {
    expect(ShipHullCatalogueSchema.safeParse([]).success).toBe(false);
    const seventeen = Array.from({ length: 17 }, () => firstHull());
    expect(ShipHullCatalogueSchema.safeParse(seventeen).success).toBe(false);
  });
});

describe("loadShipHulls", () => {
  it("resolves the parsed catalogue, equal to the generated file", async () => {
    const catalogue = await loadShipHulls();
    expect(catalogue.map((hull) => hull.key)).toEqual([...HULL_SHIP_KEYS]);
    expect(catalogue).toEqual(generated);
  });

  it("returns the same promise on every call", () => {
    expect(loadShipHulls()).toBe(loadShipHulls());
  });
});

describe("boot-path isolation", () => {
  it("names the generated file and no other generated file", () => {
    const source = readText(LOADER);
    expect(source).toContain("./generated/ships-hulls.json");
    const named = source.match(/generated\/[A-Za-z0-9._-]+/g) ?? [];
    expect(new Set(named)).toEqual(new Set(["generated/ships-hulls.json"]));
  });

  it("is named by no non-test source file other than the loader", () => {
    // Nothing imports the loader yet. Plan 13-11 adds start-session to this
    // list in the commit that wires the load.
    // The loader names its own generated file; any other file naming the module
    // or the file is an importer (a doc comment is not an import).
    const importsIt =
      /(?:from|import\()\s*["'][^"']*ships-hulls(?:\.js)?["']|ships-hulls\.json/;
    const named = sourceFiles("src").filter((file) =>
      importsIt.test(readText(file)),
    );
    expect([...named]).toEqual([LOADER]);
  });
});
