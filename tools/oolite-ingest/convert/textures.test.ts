// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The texture reference closure, the byte-identical copy and the emissive bake
 * (DATA-04, DATA-07, DATA-09, D-03, D-20, D-21, T-02-19, T-02-20).
 *
 * The closure is asserted in both directions against the two emitted GLBs: a
 * referenced-but-absent texture and an allowlisted-but-unreferenced texture each
 * fail. Copied bytes are compared with their source bytes, so "vendored
 * verbatim" is a test result rather than a promise.
 */

import { readFileSync, readdirSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isContentError } from "../content-error.js";
import { parseOpenStep } from "../openstep/parser.js";
import { compileShips } from "./ships.js";
import {
  VENDORED_TEXTURES,
  copyTextures,
  resolveReferencedTextures,
} from "./textures.js";
import type { ShipCatalogue } from "../../../src/content/schemas/ship.js";

const REPO_ROOT = process.cwd();
const SHIPDATA = "third_party/oolite/Config/shipdata.plist";
const OVERRIDES = "third_party/oolite/Config/shipdata-overrides.plist";

/** A fresh catalogue: a test may mutate it without affecting its siblings. */
function catalogue(): ShipCatalogue {
  return compileShips(
    parseOpenStep(readFileSync(join(REPO_ROOT, SHIPDATA), "utf8"), SHIPDATA),
    parseOpenStep(readFileSync(join(REPO_ROOT, OVERRIDES), "utf8"), OVERRIDES),
  ).entries;
}

function nameList(references: Map<string, unknown>): string[] {
  return [...references.keys()].sort();
}

function withDiffuse(name: string): ShipCatalogue {
  const entries = catalogue();
  const player = entries.find((entry) => entry.key === "cobra3-player");
  if (player === undefined) throw new Error("cobra3-player is missing");
  const hull = player.shipDef.materials.Hull ?? {};
  player.shipDef.materials.Hull = { ...hull, diffuse_map: name };
  return entries;
}

function caught(body: () => void): { message: string; code?: string } {
  try {
    body();
  } catch (error) {
    if (isContentError(error)) {
      return { message: error.message, code: error.code };
    }
    throw error;
  }
  throw new Error("expected the call to throw");
}

describe("texture reference closure", () => {
  it("resolves exactly the 16 allowlisted names, in both directions", () => {
    const references = resolveReferencedTextures(catalogue());

    expect(nameList(references)).toEqual([...VENDORED_TEXTURES].sort());
    expect([...VENDORED_TEXTURES].sort()).toEqual(nameList(references));
    expect(references.size).toBe(16);
  });

  it("keeps the Cobra variant textures out of the closure and both trees", () => {
    const references = resolveReferencedTextures(catalogue());
    const names = nameList(references);

    for (const variant of [
      "oolite_cobra3_diffuse_alt.png",
      "oolite_cobra3_diffuse_pirate.png",
    ]) {
      expect(names).not.toContain(variant);
      expect(VENDORED_TEXTURES).not.toContain(variant);
    }
    for (const directory of [
      "third_party/oolite/Textures",
      "public/textures",
    ]) {
      const entries = readdirSync(join(REPO_ROOT, directory));
      expect(entries.some((name) => name.includes("diffuse_alt"))).toBe(false);
      expect(entries.some((name) => name.includes("diffuse_pirate"))).toBe(
        false,
      );
    }
  });

  it("resolves every reference from the material sets the two GLBs emit", () => {
    const references = resolveReferencedTextures(catalogue());

    // Cobra: Hull and Gun maps. The Hull's diffuse is also its emission source.
    expect([...(references.get("oolite_cobra3_diffuse.png") ?? [])]).toEqual([
      { shipKey: "cobra3-player", materialKey: "Hull", mapKind: "diffuse" },
      { shipKey: "cobra3-player", materialKey: "Hull", mapKind: "emission" },
    ]);
    expect([...(references.get("oolite_cobra3_subents.png") ?? [])]).toEqual([
      { shipKey: "cobra3-player", materialKey: "Gun", mapKind: "diffuse" },
    ]);

    // The Coriolis hull's diffuse is both the material key and the emissive
    // source; the four parts each own their own map set.
    const hull = references.get("oolite_coriolis_diffuse.png") ?? [];
    expect(hull).toEqual([
      {
        shipKey: "coriolis-station",
        materialKey: "oolite_coriolis_diffuse.png",
        mapKind: "diffuse",
      },
      {
        shipKey: "coriolis-station",
        materialKey: "oolite_coriolis_diffuse.png",
        mapKind: "emission",
      },
    ]);
  });

  it("throws TEXTURE_MISSING naming the ship, material and snapshot path", () => {
    const failure = caught(() =>
      resolveReferencedTextures(withDiffuse("missing.png")),
    );

    expect(failure.code).toBe("TEXTURE_MISSING");
    expect(failure.message).toContain("cobra3-player");
    expect(failure.message).toContain("Hull");
    expect(failure.message).toContain(
      "third_party/oolite/Textures/missing.png",
    );
  });

  it("rejects a traversal name with the attempted path and reads nothing", () => {
    const failure = caught(() =>
      resolveReferencedTextures(withDiffuse("../../etc/passwd")),
    );

    expect(failure.code).toBe("TEXTURE_MISSING");
    expect(failure.message).toContain("../../etc/passwd");
    // The failure happens in the pure closure, before any file is opened.
    expect(failure.message).toContain("third_party/oolite/Textures");
  });
});

describe("copyTextures", () => {
  it("copies all 16 files byte-for-byte and reports their paths", async () => {
    const outRoot = await mkdtemp(join(tmpdir(), "wegolite-textures-"));
    try {
      const emitted = await copyTextures({ inputRoot: REPO_ROOT, outRoot });
      expect(emitted.map((file) => file.path)).toEqual(
        [...VENDORED_TEXTURES].map((name) => `public/textures/${name}`).sort(),
      );
      for (const name of VENDORED_TEXTURES) {
        const source = readFileSync(
          join(REPO_ROOT, "third_party/oolite/Textures", name),
        );
        const copied = await readFile(join(outRoot, "public/textures", name));
        expect(copied.equals(source), name).toBe(true);
      }
    } finally {
      await rm(outRoot, { recursive: true, force: true });
    }
  });

  it("keeps the committed copies identical to their vendored sources", () => {
    for (const name of VENDORED_TEXTURES) {
      const source = readFileSync(
        join(REPO_ROOT, "third_party/oolite/Textures", name),
      );
      const copied = readFileSync(join(REPO_ROOT, "public/textures", name));
      expect(copied.equals(source), name).toBe(true);
    }
  });
});
