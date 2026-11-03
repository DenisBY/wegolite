// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The shipdata catalogue contract (DATA-02, DATA-07, D-07, D-11, D-24,
 * T-02-16, T-02-17).
 *
 * Measured on the pinned snapshot: 194 resolved entries, 81 templates, 102
 * usable, seven usable entries whose model we vendor, and a `market_definition`
 * tri-state of 180 absent / 8 empty / 6 explicit. The two representative
 * entries are the player's Cobra and the Coriolis station, because they are the
 * two models plan 06 converts into GLBs.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ShipCatalogueSchema } from "../../../src/content/schemas/ship.js";
import type { CatalogEntry } from "../../../src/content/schemas/ship.js";
import { isContentError } from "../content-error.js";
import type { ContentError } from "../content-error.js";
import { parseOpenStep } from "../openstep/parser.js";
import type { PlistValue } from "../openstep/plist-value.js";
import { compileShips, emitShips, SHIPS_PATH } from "./ships.js";
import type { ShipCatalogue } from "./ships.js";

const SHIPDATA = "third_party/oolite/Config/shipdata.plist";
const OVERRIDES = "third_party/oolite/Config/shipdata-overrides.plist";

function load(relative: string, file: string): PlistValue {
  return parseOpenStep(
    readFileSync(new URL(`../../../${relative}`, import.meta.url), "utf8"),
    file,
  );
}

const shipdata = load(SHIPDATA, SHIPDATA);
const overrides = load(OVERRIDES, OVERRIDES);
const catalogue: ShipCatalogue = compileShips(shipdata, overrides);

function requireEntry(key: string): CatalogEntry {
  const match = catalogue.entries.find((item) => item.key === key);
  if (match === undefined)
    throw new Error(`catalogue entry "${key}" is missing`);
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

describe("shipdata catalogue", () => {
  it("resolves 194 entries and ignores an override that cannot add one", () => {
    expect(catalogue.entries).toHaveLength(194);
    expect(catalogue.entries.map((item) => item.key)).not.toContain(
      "griff_spacebar_subent_template",
    );
    expect(ShipCatalogueSchema.safeParse(catalogue.entries).success).toBe(true);
  });

  it("classifies 81 templates, 102 usable entries and a depth of 3 hops", () => {
    const templates = catalogue.entries.filter((item) => item.isTemplate);
    const usable = catalogue.entries.filter((item) => item.usable);

    expect(templates).toHaveLength(81);
    expect(usable).toHaveLength(102);
    expect(catalogue.maxChainDepth).toBe(3);
  });

  it("resolves the player's Cobra with its flight stats and roles", () => {
    const cobra = requireEntry("cobra3-player");

    expect(cobra.model).toBe("oolite_cobra3.dat");
    expect(cobra.modelVendored).toBe(true);
    expect(cobra.isTemplate).toBe(false);
    expect(cobra.roles).toEqual(["player"]);
    expect(cobra.shipDef.maxFlightSpeed).toBe(350);
    expect(cobra.shipDef.thrust).toBe(32);
    expect(cobra.shipDef.maxCargo).toBe(20);
    expect(cobra.shipDef.fuel).toBe(70);
    expect(cobra.shipDef.materials).toHaveProperty("Hull");
  });

  it("resolves the Coriolis with 17 subentities and the dock found by key", () => {
    const station = requireEntry("coriolis-station");

    expect(station.model).toBe("oolite_coriolis.dat");
    expect(station.modelVendored).toBe(true);
    expect(station.marketDefinition.kind).toBe("empty");
    expect(station.shipDef.rotating).toBe(true);
    expect(station.shipDef.stationRoll).toBe(0.08);
    expect(station.shipDef.subentities).toHaveLength(17);

    const entitySubentities = station.shipDef.subentities.filter(
      (subentity) => subentity.subentity_key !== undefined,
    );
    expect(
      entitySubentities.map((subentity) => subentity.subentity_key),
    ).toEqual([
      "oolite_coriolis_faceplate",
      "oolite_coriolis_tris",
      "oolite_coriolis_dock",
    ]);
    expect(
      station.shipDef.subentities.filter(
        (subentity) => subentity.type === "flasher",
      ),
    ).toHaveLength(14);

    const rawSubentities: unknown = station.extras.subentities;
    if (!Array.isArray(rawSubentities))
      throw new Error("raw subentities missing");
    const rawDock: unknown = rawSubentities[2];
    if (rawDock === null || typeof rawDock !== "object")
      throw new Error("raw dock missing");

    expect(rawDock).toMatchObject({
      subentity_key: "oolite_coriolis_dock",
      is_dock: "true",
      position: [0, 0, 500.2561],
    });
    expect(station.shipDef.subentities[2]?.isDock).toBe(true);
    expect(station.shipDef.subentities[2]?.position).toEqual([0, 0, 500.2561]);
    expect(station.shipDef.subentities[2]?.subentity_key).toBe(
      "oolite_coriolis_dock",
    );
  });

  it("pins the market_definition tri-state on the resolved entries", () => {
    const counts = { absent: 0, empty: 0, explicit: 0 };
    for (const entry of catalogue.entries)
      counts[entry.marketDefinition.kind] += 1;

    expect(counts).toEqual({ absent: 180, empty: 8, explicit: 6 });
    expect(requireEntry("coriolis-station").marketDefinition.kind).toBe(
      "empty",
    );

    const explicit = catalogue.entries.find(
      (entry) => entry.marketDefinition.kind === "explicit",
    );
    if (
      explicit === undefined ||
      explicit.marketDefinition.kind !== "explicit"
    ) {
      throw new Error("no explicit market definition found");
    }
    expect(explicit.marketDefinition.definitions[0]).toMatchObject({
      type: "class",
      name: "oolite-mining",
    });
  });

  it("marks exactly seven usable entries as vendored", () => {
    const vendored = catalogue.entries
      .filter((entry) => entry.usable && entry.modelVendored)
      .map((entry) => entry.key)
      .sort();

    expect(vendored).toEqual([
      "cobra3-alternate",
      "cobra3-pirate",
      "cobra3-player",
      "cobra3-trader",
      "coriolis-station",
      "oolite-cobra3-strict",
      "oolite-tutorial-station",
    ]);
  });

  it("keeps every remaining resolved key in extras", () => {
    const cobra = requireEntry("cobra3-player");

    expect(cobra.extras).toHaveProperty("max_flight_pitch");
    expect(cobra.extras).toHaveProperty("roles", "player");
    expect(cobra.extras).toHaveProperty("forward_weapon_type");
    expect(cobra.extras).not.toHaveProperty("materials");
    expect(cobra.extras).not.toHaveProperty("is_template");
  });

  it("stays a bounded projection rather than a full-duplication dump", () => {
    // The canonical, fully inlined catalogue measures ~496 KB; this projection
    // carries the typed surface plus every remaining key, so the bound is a
    // regression guard: a future change that starts inlining a second copy of
    // materials or subentities shows up here. (The plan's ~532 KB figure was a
    // compact-JSON measurement; canonical output is indented.)
    const emitted = emitShips(shipdata, overrides);
    expect(emitted.path).toBe(SHIPS_PATH);
    expect(emitted.bytes.length).toBeLessThan(750_000);
  });

  it("refuses a model path that escapes the Models directory", () => {
    const synthetic = parseOpenStep(
      `{ hostile = { model = "../../etc/passwd"; roles = "player"; }; }`,
      "synthetic.plist",
    );
    const empty = parseOpenStep("{}", "empty.plist");

    const error = capture(() => compileShips(synthetic, empty));
    expect(error.code).toBe("DAT_MESH");
    expect(error.construct).toContain("hostile");
    expect(error.message).toContain("../../etc/passwd");
  });
});

/** The versioned golden: counts plus the two entries plan 06 converts. */
interface ShipFixture {
  readonly version: number;
  readonly entryCount: number;
  readonly templateCount: number;
  readonly usableCount: number;
  readonly maxChainDepth: number;
  readonly vendoredModelEntries: readonly string[];
  readonly marketDefinition: {
    readonly absent: number;
    readonly empty: number;
    readonly explicit: number;
  };
  readonly cobra3Player: {
    readonly model: string;
    readonly modelVendored: boolean;
    readonly isTemplate: boolean;
    readonly usable: boolean;
    readonly roles: readonly string[];
    readonly maxFlightSpeed: number;
    readonly thrust: number;
    readonly maxFlightPitch: number;
    readonly maxFlightRoll: number;
    readonly maxCargo: number;
    readonly fuel: number;
    readonly materialKeys: readonly string[];
  };
  readonly coriolisStation: {
    readonly model: string;
    readonly modelVendored: boolean;
    readonly isTemplate: boolean;
    readonly usable: boolean;
    readonly roles: readonly string[];
    readonly marketDefinitionKind: string;
    readonly rotating: boolean;
    readonly stationRoll: number;
    readonly subentityCount: number;
    readonly entitySubentities: readonly string[];
    readonly flasherCount: number;
    readonly dockSubentity: {
      readonly subentity_key: string;
      readonly is_dock: string;
      readonly isDock: boolean;
      readonly position: readonly [number, number, number];
    };
  };
}

const shipFixture = JSON.parse(
  readFileSync(
    new URL("../../../tests/golden/content/ships.json", import.meta.url),
    "utf8",
  ),
) as ShipFixture;

describe("ship golden fixture", () => {
  it("pins the version, the four counts and the seven vendored entries", () => {
    expect(shipFixture.version).toBe(1);
    expect(shipFixture.entryCount).toBe(194);
    expect(catalogue.entries).toHaveLength(shipFixture.entryCount);
    expect(shipFixture.templateCount).toBe(81);
    expect(catalogue.entries.filter((entry) => entry.isTemplate)).toHaveLength(
      shipFixture.templateCount,
    );
    expect(shipFixture.usableCount).toBe(102);
    expect(catalogue.entries.filter((entry) => entry.usable)).toHaveLength(
      shipFixture.usableCount,
    );
    expect(shipFixture.maxChainDepth).toBe(3);
    expect(catalogue.maxChainDepth).toBe(shipFixture.maxChainDepth);

    const vendored = catalogue.entries
      .filter((entry) => entry.usable && entry.modelVendored)
      .map((entry) => entry.key)
      .sort();
    expect(vendored).toEqual([...shipFixture.vendoredModelEntries].sort());
  });

  it("pins the market_definition tri-state", () => {
    const counts = { absent: 0, empty: 0, explicit: 0 };
    for (const entry of catalogue.entries)
      counts[entry.marketDefinition.kind] += 1;
    expect(counts).toEqual(shipFixture.marketDefinition);
  });

  it("pins the Cobra player anchors", () => {
    const cobra = requireEntry("cobra3-player");
    const expected = shipFixture.cobra3Player;

    expect(cobra.model).toBe(expected.model);
    expect(cobra.modelVendored).toBe(expected.modelVendored);
    expect(cobra.isTemplate).toBe(expected.isTemplate);
    expect(cobra.usable).toBe(expected.usable);
    expect(cobra.roles).toEqual([...expected.roles]);
    expect(cobra.shipDef.maxFlightSpeed).toBe(expected.maxFlightSpeed);
    expect(cobra.shipDef.thrust).toBe(expected.thrust);
    expect(cobra.shipDef.maxFlightPitch).toBe(expected.maxFlightPitch);
    expect(cobra.shipDef.maxFlightRoll).toBe(expected.maxFlightRoll);
    expect(cobra.shipDef.maxCargo).toBe(expected.maxCargo);
    expect(cobra.shipDef.fuel).toBe(expected.fuel);
    expect(Object.keys(cobra.shipDef.materials).sort()).toEqual(
      [...expected.materialKeys].sort(),
    );
  });

  it("pins the Coriolis anchors and the keyed dock subentity", () => {
    const station = requireEntry("coriolis-station");
    const expected = shipFixture.coriolisStation;

    expect(station.model).toBe(expected.model);
    expect(station.modelVendored).toBe(expected.modelVendored);
    expect(station.isTemplate).toBe(expected.isTemplate);
    expect(station.usable).toBe(expected.usable);
    expect(station.roles).toEqual([...expected.roles]);
    expect(station.marketDefinition.kind).toBe(expected.marketDefinitionKind);
    expect(station.shipDef.rotating).toBe(expected.rotating);
    expect(station.shipDef.stationRoll).toBe(expected.stationRoll);
    expect(station.shipDef.subentities).toHaveLength(expected.subentityCount);
    expect(
      station.shipDef.subentities
        .filter((subentity) => subentity.subentity_key !== undefined)
        .map((subentity) => subentity.subentity_key),
    ).toEqual([...expected.entitySubentities]);
    expect(
      station.shipDef.subentities.filter(
        (subentity) => subentity.type === "flasher",
      ),
    ).toHaveLength(expected.flasherCount);

    const typedDock = station.shipDef.subentities.find(
      (subentity) =>
        subentity.subentity_key === expected.dockSubentity.subentity_key,
    );
    if (typedDock === undefined)
      throw new Error("typed dock subentity missing");
    expect(typedDock.isDock).toBe(expected.dockSubentity.isDock);
    expect(typedDock.position).toEqual([...expected.dockSubentity.position]);

    const raw = station.extras.subentities;
    if (!Array.isArray(raw)) throw new Error("raw subentities missing");
    const rawDock: unknown = raw.find(
      (item: unknown) =>
        item !== null &&
        typeof item === "object" &&
        "subentity_key" in item &&
        (item as { subentity_key?: unknown }).subentity_key ===
          expected.dockSubentity.subentity_key,
    );
    expect(rawDock).toMatchObject({
      subentity_key: expected.dockSubentity.subentity_key,
      is_dock: expected.dockSubentity.is_dock,
      position: [...expected.dockSubentity.position],
    });
  });
});
