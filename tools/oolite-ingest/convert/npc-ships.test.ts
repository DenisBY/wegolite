// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The NPC ship records (DATA-10, DATA-11 stage 1, DATA-13, D-02, D-05, D-06).
 *
 * The expected values live in `tests/golden/content/ships-npc.json`, which was
 * written by hand from `shipdata.plist` and is never generated. The compiled
 * records (seven fields: the Phase 9 six plus the Phase 10 `mass`) are compared
 * with it, with the resolved template parents, and with the committed generated
 * file, so a drift in any one of the four fails.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  NpcShipSchema,
  type NpcShip,
} from "../../../src/content/schemas/ship-npc.js";
import { isContentError } from "../content-error.js";
import type { ContentError } from "../content-error.js";
import { parseOpenStep } from "../openstep/parser.js";
import type { PlistValue } from "../openstep/plist-value.js";
import { getEntry } from "../openstep/plist-value.js";
import { parseDat } from "./dat.js";
import type { ParsedMesh } from "./dat.js";
import { MODEL_SOURCE_FILES, NPC_SHIP_GLBS, shipGlbFile } from "./glb.js";
import {
  DEFAULT_AI_TYPE,
  DEFAULT_SCAN_CLASS,
  NPC_SHIP_KEYS,
  NPC_SHIPS_PATH,
  compileNpcShips,
  emitNpcShips,
} from "./npc-ships.js";
import { computeShipMasses, shipMass } from "./ship-mass.js";
import { compileShips } from "./ships.js";
import type { ShipCatalogue } from "./ships.js";

const REPO = new URL("../../../", import.meta.url);
const SHIPDATA = "third_party/oolite/Config/shipdata.plist";
const OVERRIDES = "third_party/oolite/Config/shipdata-overrides.plist";

function readText(relative: string): string {
  return readFileSync(new URL(relative, REPO), "utf8");
}

function load(relative: string): PlistValue {
  return parseOpenStep(readText(relative), relative);
}

const shipdata = load(SHIPDATA);
const catalogue: ShipCatalogue = compileShips(shipdata, load(OVERRIDES));

/** Every vendored mesh a GLB is built from, parsed once. */
function loadMeshes(): Record<string, ParsedMesh> {
  const names = new Set<string>();
  for (const files of Object.values(MODEL_SOURCE_FILES)) {
    for (const file of files) names.add(file);
  }
  const meshes: Record<string, ParsedMesh> = {};
  for (const name of [...names].sort()) {
    const file = `third_party/oolite/Models/${name}`;
    meshes[name] = parseDat(readText(file), file);
  }
  return meshes;
}

const meshes = loadMeshes();
const masses = computeShipMasses(NPC_SHIP_KEYS, catalogue, meshes);
const records = compileNpcShips(catalogue, masses);

interface Golden {
  readonly version: number;
  readonly keys: string[];
  readonly fields: string[];
  readonly defaults: { readonly aiType: string; readonly scanClass: string };
  readonly examples: NpcShip[];
  readonly sources: string[];
}

const golden = JSON.parse(
  readText("tests/golden/content/ships-npc.json"),
) as Golden;

function requireEntry(key: string): ShipCatalogue["entries"][number] {
  const match = catalogue.entries.find((item) => item.key === key);
  if (match === undefined) throw new Error(`catalogue entry "${key}" missing`);
  return match;
}

function requireRecord(key: string): NpcShip {
  const match = records.find((item) => item.key === key);
  if (match === undefined) throw new Error(`NPC record "${key}" missing`);
  return match;
}

function capture(fn: () => unknown): ContentError {
  try {
    fn();
  } catch (error) {
    if (isContentError(error)) return error;
    throw error;
  }
  throw new Error("expected a ContentError, but no error was thrown");
}

function walk(directory: URL, found: string[] = []): string[] {
  for (const name of readdirSync(directory).sort()) {
    const child = new URL(`${name}`, directory);
    if (statSync(child).isDirectory()) {
      walk(new URL(`${name}/`, directory), found);
    } else {
      found.push(name);
    }
  }
  return found;
}

describe("NPC ship records", () => {
  it("holds one record per key, in code-unit order, equal to the golden keys", () => {
    expect(records.map((record) => record.key)).toEqual([...NPC_SHIP_KEYS]);
    expect([...NPC_SHIP_KEYS]).toEqual(golden.keys);
    expect([...NPC_SHIP_KEYS]).toEqual(
      [...NPC_SHIP_KEYS].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    );
    expect(records).toHaveLength(9);
  });

  it("carries exactly the seven fields and passes the strict schema", () => {
    for (const record of records) {
      expect(Object.keys(record).sort()).toEqual(golden.fields);
      expect(NpcShipSchema.safeParse(record).success).toBe(true);
    }
  });

  it("pins the two compiled defaults to the golden", () => {
    expect(DEFAULT_AI_TYPE).toBe(golden.defaults.aiType);
    expect(DEFAULT_SCAN_CLASS).toBe(golden.defaults.scanClass);
  });

  it.each(golden.examples.map((example) => [example.key, example] as const))(
    "compiles %s to the hand-written worked example",
    (key, example) => {
      expect(requireRecord(key)).toEqual(example);
    },
  );

  it("resolves like_ship: each record equals its template parent", () => {
    const root = shipdata;
    if (root.kind !== "dict") throw new Error("shipdata root is not a dict");
    for (const key of NPC_SHIP_KEYS) {
      const raw = getEntry(root, key);
      if (raw === undefined || raw.value.kind !== "dict") {
        throw new Error(`raw shipdata entry "${key}" is not a dictionary`);
      }
      expect(raw.value.entries.map((field) => field.key)).toEqual([
        "like_ship",
      ]);
      const like = getEntry(raw.value, "like_ship");
      expect(like?.value).toMatchObject({
        kind: "string",
        value: `oolite_template_${key}`,
      });

      const template = requireEntry(`oolite_template_${key}`);
      const record = requireRecord(key);
      expect(record.roles).toEqual(template.roles);
      expect(record.model).toBe(template.model);
      expect(record.aiType).toBe(template.extras["ai_type"]);
    }
  });

  it("authors the Viper's scan class and defaults the other eight", () => {
    expect(requireEntry("oolite_template_viper").extras["scan_class"]).toBe(
      "CLASS_POLICE",
    );
    expect(requireRecord("viper").scanClass).toBe("CLASS_POLICE");
    for (const key of NPC_SHIP_KEYS) {
      if (key === "viper") continue;
      expect(requireEntry(`oolite_template_${key}`).extras).not.toHaveProperty(
        "scan_class",
      );
      expect(requireRecord(key).scanClass).toBe(DEFAULT_SCAN_CLASS);
    }
  });

  it("derives each glb from the model and finds the file under public/", () => {
    for (const record of records) {
      expect(record.glb).toBe(`models/${shipGlbFile(record.model)}`);
      expect(existsSync(new URL(`public/${record.glb}`, REPO))).toBe(true);
      expect(NPC_SHIP_GLBS).toContain(record.glb.slice("models/".length));
    }
    expect(
      records.map((record) => record.glb.slice("models/".length)).sort(),
    ).toEqual([...NPC_SHIP_GLBS]);
  });

  it("regenerates the committed file byte for byte", () => {
    const emitted = emitNpcShips(catalogue, masses);
    expect(emitted.path).toBe(NPC_SHIPS_PATH);
    expect(
      Buffer.from(emitted.bytes).equals(
        readFileSync(new URL(NPC_SHIPS_PATH, REPO)),
      ),
    ).toBe(true);
  });

  it("compiles no cargo, rock, wreckage or missile role and ships no audio", () => {
    const forbidden = new Set([
      "1t-cargopod",
      "alloy",
      "asteroid",
      "boulder",
      "cargopod",
      "escape-capsule",
      "missile",
      "oolite-template-cargopod",
      "oolite-wreckage-chunk",
      "rockhermit",
      "rockhermit-chaotic",
      "rockhermit-pirate",
      "splinter",
      "tutorial-asteroid",
      "wreckage",
    ]);
    for (const record of records) {
      for (const role of record.roles) {
        expect(forbidden.has(role.split("(")[0] ?? "")).toBe(false);
      }
    }

    const audio = /\.(ogg|wav|mp3|flac|oga|m4a)$/i;
    for (const root of ["public/", "third_party/oolite/"]) {
      const files = walk(new URL(root, REPO));
      expect(files.filter((name) => audio.test(name))).toEqual([]);
    }
  });

  it("fails naming the key when the catalogue has no viper entry", () => {
    const without: ShipCatalogue = {
      ...catalogue,
      entries: catalogue.entries.filter((entry) => entry.key !== "viper"),
    };
    const error = capture(() => compileNpcShips(without, masses));
    expect(error.code).toBe("SCHEMA");
    expect(error.file).toBe(NPC_SHIPS_PATH);
    expect(error.construct).toBe("viper");
  });

  it("fails when a record's model is a GLB row owned by another key", () => {
    const swapped: ShipCatalogue = {
      ...catalogue,
      entries: catalogue.entries.map((entry) =>
        entry.key === "viper" ? { ...entry, model: "oolite_adder.dat" } : entry,
      ),
    };
    const error = capture(() => compileNpcShips(swapped, masses));
    expect(error.code).toBe("SCHEMA");
    expect(error.construct).toBe("viper");
  });

  it("falls back to the Oolite defaults when ai_type and scan_class are absent", () => {
    const bare: ShipCatalogue = {
      ...catalogue,
      entries: catalogue.entries.map((entry) => {
        if (entry.key !== "viper") return entry;
        const { ai_type: _ai, scan_class: _scan, ...extras } = entry.extras;
        void _ai;
        void _scan;
        return { ...entry, extras };
      }),
    };
    const viper = compileNpcShips(bare, masses).find(
      (item) => item.key === "viper",
    );
    expect(viper?.aiType).toBe(DEFAULT_AI_TYPE);
    expect(viper?.scanClass).toBe(DEFAULT_SCAN_CLASS);
  });

  it("fails when an entry has no roles", () => {
    const noRoles: ShipCatalogue = {
      ...catalogue,
      entries: catalogue.entries.map((entry) =>
        entry.key === "viper" ? { ...entry, roles: null } : entry,
      ),
    };
    expect(capture(() => compileNpcShips(noRoles, masses)).construct).toBe(
      "viper",
    );
  });

  it("fails naming the mass when a record has none", () => {
    const error = capture(() => compileNpcShips(catalogue, new Map()));
    expect(error.code).toBe("SCHEMA");
    expect(error.file).toBe(NPC_SHIPS_PATH);
    expect(error.construct).toBe("adder.mass");
  });

  it("records the mass shipMass computes for each key", () => {
    for (const record of records) {
      expect(record.mass).toBe(shipMass(record.key, catalogue, meshes));
    }
  });

  it("fails naming the field when a value breaks the schema", () => {
    const badScan: ShipCatalogue = {
      ...catalogue,
      entries: catalogue.entries.map((entry) =>
        entry.key === "viper"
          ? { ...entry, extras: { ...entry.extras, scan_class: "police" } }
          : entry,
      ),
    };
    expect(capture(() => compileNpcShips(badScan, masses)).construct).toBe(
      "viper.scanClass",
    );
  });
});
