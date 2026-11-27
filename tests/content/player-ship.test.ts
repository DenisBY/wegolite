// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The player and station catalogue values (FLGT-01, FLGT-03, T-3-26).
 *
 * These are the authored numbers every flight value is derived from. The wrong
 * Cobra entry (`cobra3-trader` 300/30 or `cobra3-alternate` 300/32/35 t) and a
 * missing field are the two realistic ways this drifts, so both are pinned:
 * the values by exact equality, and the failure by a named error that names
 * the field. `deriveFlightConfig` must never default a missing flight value to
 * zero — a ship that cannot turn would look like a physics bug.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { CatalogEntry } from "../../src/content/schemas/ship.js";
import {
  StationRecordError,
  stationSpecFor,
} from "../../src/content/stations.js";
import type { ShipDef, StationSpec } from "../../src/content/types.js";
import {
  deriveFlightConfig,
  FlightConfigError,
} from "../../src/sim/flight/config.js";
import { deriveSystemLayout, LayoutError } from "../../src/sim/world/layout.js";
import { laveFixture } from "../helpers/lave.js";
import {
  clientCatalogue,
  dockGeometryOf,
  dockPortOf,
  stationSpecOf,
} from "../helpers/stations.js";

/** Run a call that must throw and return its message for assertion. */
function messageOf(call: () => unknown): string {
  try {
    call();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("expected the call to throw, but it returned normally");
}

/** The compiled `ships-client.json` entry of one key. */
function clientEntry(key: string): CatalogEntry {
  const entry = clientCatalogue().find((candidate) => candidate.key === key);
  if (entry === undefined) throw new Error(`no catalogue entry "${key}"`);
  return entry;
}

/** The client catalogue with the Coriolis entry rewritten. */
function withStationEntry(
  rewrite: (entry: CatalogEntry) => CatalogEntry,
): readonly CatalogEntry[] {
  return clientCatalogue().map((entry) =>
    entry.key === "coriolis-station" ? rewrite(entry) : entry,
  );
}

describe("player ship catalogue entry", () => {
  const fixture = laveFixture();

  it("pins the Cobra Mk III player template", () => {
    const player = fixture.playerDef;
    expect(player.maxFlightSpeed).toBe(350);
    expect(player.thrust).toBe(32);
    expect(player.maxFlightPitch).toBe(1);
    expect(player.maxFlightRoll).toBe(2);
    expect(player.maxCargo).toBe(20);
    expect(player.fuel).toBe(70);
  });

  it("pins the Coriolis station roll, rotation and dock subentity", () => {
    const station = clientEntry("coriolis-station").shipDef;
    expect(station.stationRoll).toBe(0.08);
    expect(station.rotating).toBe(true);

    const dock = station.subentities.find(
      (subentity) => subentity.isDock === true,
    );
    if (dock === undefined) {
      throw new Error("the Coriolis catalogue entry has no dock subentity");
    }
    expect(dock.position).toEqual([0, 0, 500.2561]);
  });

  it("keeps the Coriolis shipDef of ships-client.json equal to ships.json (the fixture's data source moved)", () => {
    const full = JSON.parse(
      readFileSync(
        new URL("../../src/content/generated/ships.json", import.meta.url),
        "utf8",
      ),
    ) as { key: string; shipDef: ShipDef }[];
    const coriolis = full.find((entry) => entry.key === "coriolis-station");
    expect(coriolis?.shipDef).toEqual(clientEntry("coriolis-station").shipDef);
  });

  it("derives the Cobra flight config from the catalogue values", () => {
    const config = deriveFlightConfig(fixture.playerDef);
    // The raw catalogue thrust brakes the player's drift (PlayerEntity.m:3388);
    // only the engine uses SHIP_THRUST_FACTOR x thrust.
    expect(config.thrust).toBe(32);
    expect(config.thrustAccel).toBe(160);
    expect(config.pitchAccel).toBe(2);
    expect(config.rollAccel).toBe(4);
    expect(config.maxPitch).toBe(1);
    expect(config.precisionFactor).toBe(0.5);
    expect(config.launchSpeed).toBe(175);
  });

  it("throws a named FlightConfigError naming a missing thrust field", () => {
    const playerWithoutThrust: ShipDef = { ...fixture.playerDef };
    delete (playerWithoutThrust as { thrust?: number }).thrust;

    expect(() => deriveFlightConfig(playerWithoutThrust)).toThrow(
      FlightConfigError,
    );
    expect(messageOf(() => deriveFlightConfig(playerWithoutThrust))).toContain(
      "thrust",
    );
  });

  it("throws a named StationRecordError naming the dock when the station has no subentities", () => {
    const stationWithoutDock = withStationEntry((entry) => ({
      ...entry,
      shipDef: { ...entry.shipDef, subentities: [] },
    }));

    expect(() => stationSpecFor(stationWithoutDock, "coriolis")).toThrow(
      StationRecordError,
    );
    expect(
      messageOf(() => stationSpecFor(stationWithoutDock, "coriolis")),
    ).toContain("dock");
  });

  it("throws a named StationRecordError when the dock has no position", () => {
    const stationDockWithoutPosition = withStationEntry((entry) => ({
      ...entry,
      shipDef: {
        ...entry.shipDef,
        subentities: entry.shipDef.subentities.map((subentity) => {
          const { position: _position, ...rest } = subentity;
          void _position;
          return rest;
        }),
      },
    }));

    expect(
      messageOf(() => stationSpecFor(stationDockWithoutPosition, "coriolis")),
    ).toContain("position");
  });

  it("names the ship key when the station entry is absent, with no Coriolis fallback", () => {
    const entries = clientCatalogue().filter(
      (entry) => entry.key !== "icosahedron-station",
    );
    expect(() => stationSpecFor(entries, "icosahedron")).toThrow(
      StationRecordError,
    );
    expect(messageOf(() => stationSpecFor(entries, "icosahedron"))).toContain(
      "icosahedron-station",
    );
  });

  it.each(["mass", "collisionRadius"] as const)(
    "throws a named StationRecordError for a missing %s",
    (field) => {
      const entries = withStationEntry((entry) => {
        const copy: Record<string, unknown> = { ...entry };
        delete copy[field];
        return copy as unknown as CatalogEntry;
      });
      expect(() => stationSpecFor(entries, "coriolis")).toThrow(
        StationRecordError,
      );
      expect(messageOf(() => stationSpecFor(entries, "coriolis"))).toContain(
        field,
      );
    },
  );

  it("throws a named StationRecordError for a missing name or station_roll", () => {
    const noName = withStationEntry((entry) => ({ ...entry, extras: {} }));
    expect(messageOf(() => stationSpecFor(noName, "coriolis"))).toContain(
      "name",
    );
    const noRoll = withStationEntry((entry) => {
      const shipDef: Record<string, unknown> = { ...entry.shipDef };
      delete shipDef["stationRoll"];
      return { ...entry, shipDef: shipDef as unknown as ShipDef };
    });
    expect(messageOf(() => stationSpecFor(noRoll, "coriolis"))).toContain(
      "station_roll",
    );
  });

  it("builds the compiled spec of each station kind", () => {
    expect(stationSpecOf("coriolis")).toEqual({
      kind: "coriolis",
      key: "coriolis-station",
      name: "Coriolis Station",
      mass: 515_483_904,
      collisionRadius: 779.3702392578125,
      dockOffset: 500.2561,
      stationRoll: 0.08,
    });
    const icosahedron = stationSpecOf("icosahedron");
    expect(icosahedron.key).toBe("icosahedron-station");
    expect(icosahedron.name).toBe("Icosahedron Station");
    expect(icosahedron.dockOffset).toBe(642.8881);
    expect(icosahedron.stationRoll).toBe(0.08);
    expect(stationSpecOf("dodecahedron").dockOffset).toBe(560.3216);
  });

  it("parses the catalogue once: the same object on every call", () => {
    expect(stationSpecOf("icosahedron")).toBe(stationSpecOf("icosahedron"));
    expect(dockPortOf("dodecahedron")).toBe(dockPortOf("dodecahedron"));
    expect(dockGeometryOf("coriolis")).toBe(dockGeometryOf("coriolis"));
  });

  it.each([
    ["a zero collisionRadius", { collisionRadius: 0 }],
    ["a non-finite mass", { mass: Number.POSITIVE_INFINITY }],
    ["a negative dockOffset", { dockOffset: -1 }],
    ["a NaN stationRoll", { stationRoll: Number.NaN }],
  ] as const)("throws a LayoutError for %s", (_label, patch) => {
    const spec: StationSpec = { ...fixture.stationDef, ...patch };
    expect(() => deriveSystemLayout(fixture.system, spec)).toThrow(LayoutError);
  });
});
