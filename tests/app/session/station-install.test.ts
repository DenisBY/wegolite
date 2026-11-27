// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The per-system station install (Phase 22.1, WORLD-20, Pitfall P2).
 *
 * `loadStationRecords` and `stationFor` are the one use path of every station
 * kind: the boot, an F2 Load and a hyperspace arrival all resolve the system's
 * station through them. The per-kind loop below is the invariant of the
 * assumption-delta decision (plan 22.1-04): it iterates `STATION_KINDS`, never a
 * typed list, so a fourth kind that did not round-trip fails here.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  loadStationRecords,
  stationFor,
} from "../../../src/app/session/station-install.js";
import type { StationRecords } from "../../../src/app/session/station-install.js";
import type { DockPort } from "../../../src/content/schemas/dock-port.js";
import {
  STATION_KINDS,
  StationRecordError,
  stationRecord,
} from "../../../src/content/stations.js";
import type { StationKind } from "../../../src/content/stations.js";
import type { System } from "../../../src/content/types.js";
import { createDockGeometry } from "../../../src/sim/dock/geometry.js";
import { deriveSystemLayout } from "../../../src/sim/world/layout.js";
import {
  clientCatalogue,
  dockGeometryOf,
  dockPortOf,
  stationRecordsOf,
} from "../../helpers/stations.js";

const galaxy = JSON.parse(
  readFileSync(
    new URL("../../../src/content/generated/systems/g0.json", import.meta.url),
    "utf8",
  ),
) as System[];

function systemOf(name: string): System {
  const found = galaxy.find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`no system named ${name}`);
  return found;
}

/** The first galaxy-0 system whose own station is this kind. */
function firstSystemOfKind(kind: StationKind): System {
  const found = galaxy.find((entry) => entry.station === kind);
  if (found === undefined) throw new Error(`no ${kind} system in galaxy 0`);
  return found;
}

const dockPortsOf = (): Promise<Readonly<Record<StationKind, DockPort>>> =>
  Promise.resolve({
    coriolis: dockPortOf("coriolis"),
    dodecahedron: dockPortOf("dodecahedron"),
    icosahedron: dockPortOf("icosahedron"),
  });

describe("loadStationRecords", () => {
  it("resolves a spec and a dock record for every station kind", async () => {
    const records = await loadStationRecords(clientCatalogue(), dockPortsOf);
    expect([...records.specs.keys()]).toEqual([...STATION_KINDS]);
    expect([...records.dockPorts.keys()]).toEqual([...STATION_KINDS]);
    for (const kind of STATION_KINDS) {
      expect(records.specs.get(kind)?.key).toBe(stationRecord(kind).shipKey);
    }
  });

  it("reads the committed dock-port files through the session's own loader", async () => {
    const records = await loadStationRecords(clientCatalogue());
    for (const kind of STATION_KINDS) {
      expect(records.dockPorts.get(kind)).toEqual(dockPortOf(kind));
    }
  });

  it("rejects a catalogue without the Icosahedron entry with a StationRecordError naming it", async () => {
    const withoutIcosahedron = clientCatalogue().filter(
      (entry) => entry.key !== "icosahedron-station",
    );
    await expect(
      loadStationRecords(withoutIcosahedron, dockPortsOf),
    ).rejects.toThrow(StationRecordError);
    await expect(
      loadStationRecords(withoutIcosahedron, dockPortsOf),
    ).rejects.toThrow(/icosahedron-station/);
  });

  it("rejects a spec that fails the schema, naming the kind and the field", async () => {
    const broken = clientCatalogue().map((entry) =>
      entry.key === "dodecahedron-station" ? { ...entry, mass: -1 } : entry,
    );
    await expect(loadStationRecords(broken, dockPortsOf)).rejects.toThrow(
      StationRecordError,
    );
    await expect(loadStationRecords(broken, dockPortsOf)).rejects.toThrow(
      /dodecahedron.*mass/,
    );
  });

  it("never falls back to a Coriolis when a dock record fails to load (O8)", async () => {
    await expect(
      loadStationRecords(clientCatalogue(), () =>
        Promise.reject(new Error("dock record missing")),
      ),
    ).rejects.toThrow("dock record missing");
  });
});

describe("stationFor", () => {
  const records = stationRecordsOf();

  it("gives Zaonce the Icosahedron spec and its dock record's port", () => {
    const { spec, dockGeometry } = stationFor(records, systemOf("Zaonce"));
    expect(spec.key).toBe("icosahedron-station");
    expect(spec.kind).toBe("icosahedron");
    expect(dockGeometry.port).toEqual(dockPortOf("icosahedron").port);
  });

  it("gives Lave the Coriolis spec and the dock-port.json geometry", () => {
    const { spec, dockGeometry } = stationFor(records, systemOf("Lave"));
    expect(spec.key).toBe("coriolis-station");
    expect(dockGeometry).toEqual(dockGeometryOf("coriolis"));
    expect(dockGeometry.port).toEqual(dockPortOf("coriolis").port);
  });

  it("throws a named error when the system's kind has no loaded spec", () => {
    const partial: StationRecords = {
      specs: new Map(
        [...records.specs].filter(([kind]) => kind !== "coriolis"),
      ),
      dockPorts: records.dockPorts,
    };
    expect(() => stationFor(partial, systemOf("Lave"))).toThrow(
      StationRecordError,
    );
  });

  it("throws a named error when the system's kind has no dock record", () => {
    const partial: StationRecords = {
      specs: records.specs,
      dockPorts: new Map(
        [...records.dockPorts].filter(([kind]) => kind !== "icosahedron"),
      ),
    };
    expect(() => stationFor(partial, systemOf("Zaonce"))).toThrow(
      /icosahedron dock-port record/,
    );
  });
});

describe("every station kind through the one use path (assumption-delta invariant)", () => {
  it.each(STATION_KINDS)(
    "%s: records, stationFor, the layout and the dock geometry agree on kind, key, dock offset and port",
    async (kind) => {
      const records = await loadStationRecords(clientCatalogue(), dockPortsOf);
      const system = firstSystemOfKind(kind);
      const { spec, dockGeometry } = stationFor(records, system);
      const layout = deriveSystemLayout(system, spec);

      expect(spec.kind).toBe(kind);
      expect(system.station).toBe(kind);
      expect(layout.stationKind).toBe(kind);
      expect(layout.stationKey).toBe(spec.key);
      expect(layout.stationKey).toBe(stationRecord(kind).shipKey);
      expect(layout.dockOffset).toBe(spec.dockOffset);
      expect(dockGeometry.port).toEqual(dockPortOf(kind).port);
      expect(dockGeometry).toEqual(
        createDockGeometry(dockPortOf(kind), layout.dockOffset),
      );
    },
  );
});
