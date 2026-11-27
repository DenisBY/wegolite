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

import { afterEach, describe, expect, it, vi } from "vitest";

import { createSessionState } from "../../../src/app/session/context.js";
import type { SessionState } from "../../../src/app/session/context.js";
import {
  ensureStationHulls,
  loadStationRecords,
  prefetchStationFor,
  stationFor,
} from "../../../src/app/session/station-install.js";
import type {
  StationHullLoader,
  StationRecords,
} from "../../../src/app/session/station-install.js";
import { targetNameMap } from "../../../src/app/session/start-session.js";
import { hullTable } from "../../../src/app/session/traffic.js";
import type { DockPort } from "../../../src/content/schemas/dock-port.js";
import { StaticHullArtifactSchema } from "../../../src/content/schemas/ship-static-hull.js";
import type { StaticHullArtifact } from "../../../src/content/schemas/ship-static-hull.js";
import {
  STATION_KINDS,
  StationRecordError,
  stationRecord,
} from "../../../src/content/stations.js";
import type { StationKind } from "../../../src/content/stations.js";
import type { ShipHullCatalogue, System } from "../../../src/content/types.js";
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

describe("the station hulls of the traffic-on session (Phase 22.1, WORLD-20)", () => {
  const generated = (file: string): StaticHullArtifact =>
    StaticHullArtifactSchema.parse(
      JSON.parse(
        readFileSync(
          new URL(`../../../src/content/generated/${file}`, import.meta.url),
          "utf8",
        ),
      ),
    );
  const ships = JSON.parse(
    readFileSync(
      new URL(
        "../../../src/content/generated/ships-hulls.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as ShipHullCatalogue;
  const shared = generated("ships-static-hulls.json");
  /** Each kind's own artifact, read from the generated files. */
  const artifactOf = (kind: StationKind): StaticHullArtifact =>
    generated(stationRecord(kind).hullsFile);

  /** A session as the boot leaves it: the shared artifact merged, names in. */
  function sessionOf(system: System, traffic = true): SessionState {
    const ctx = createSessionState({
      system,
      saveStatus: "absent",
      saveSkipReason: "",
    });
    ctx.runtime.testFlags = { ...ctx.runtime.testFlags, traffic };
    if (traffic) {
      ctx.core.hulls = hullTable(ships, shared.hulls);
      ctx.core.targetNames = targetNameMap(shared.names);
    }
    return ctx;
  }

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
      resolve = res;
    });
    return { promise, resolve };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("ensureStationHulls", () => {
    it.each(["dodecahedron", "icosahedron"] as const)(
      "%s: merges the kind's hull and names it from the artifact's own names",
      async (kind) => {
        const ctx = sessionOf(firstSystemOfKind(kind));
        const key = stationRecord(kind).shipKey;
        expect(ctx.core.hulls?.has(key)).toBe(false);

        await ensureStationHulls(ctx, kind);

        expect(ctx.core.hulls?.has(key)).toBe(true);
        const named = artifactOf(kind).names.find((entry) => entry.key === key);
        expect(named).toBeDefined();
        expect(ctx.core.targetNames?.get(key)).toBe(named?.name);
        // The shared artifact's names stay.
        expect(ctx.core.targetNames?.get("coriolis-station")).toBe(
          shared.names.find((entry) => entry.key === "coriolis-station")?.name,
        );
      },
    );

    it("is a no-op for the Coriolis, whose hull the boot already merged", async () => {
      const ctx = sessionOf(systemOf("Lave"));
      const before = ctx.core.hulls;
      const load = vi.fn(() => Promise.resolve(shared));
      await ensureStationHulls(ctx, "coriolis", load);
      expect(load).not.toHaveBeenCalled();
      expect(ctx.core.hulls).toBe(before);
    });

    it("loads nothing with traffic off", async () => {
      const ctx = sessionOf(firstSystemOfKind("icosahedron"), false);
      const load = vi.fn(() => Promise.resolve(artifactOf("icosahedron")));
      await ensureStationHulls(ctx, "icosahedron", load);
      expect(load).not.toHaveBeenCalled();
      expect(ctx.core.hulls).toBeUndefined();
      expect(ctx.core.targetNames).toBeUndefined();
    });

    it("starts one load per kind however many callers ask while it is in flight", async () => {
      const ctx = sessionOf(firstSystemOfKind("icosahedron"));
      const gate = deferred<StaticHullArtifact>();
      const load = vi.fn(() => gate.promise);
      const first = ensureStationHulls(ctx, "icosahedron", load);
      const second = ensureStationHulls(ctx, "icosahedron", load);
      expect(load).toHaveBeenCalledTimes(1);
      gate.resolve(artifactOf("icosahedron"));
      await Promise.all([first, second]);
      expect(ctx.core.hulls?.has("icosahedron-station")).toBe(true);
      // Present now: a later call does not load again.
      await ensureStationHulls(ctx, "icosahedron", load);
      expect(load).toHaveBeenCalledTimes(1);
    });

    it("writes nothing when the session is disposed before the load lands", async () => {
      const ctx = sessionOf(firstSystemOfKind("dodecahedron"));
      const before = ctx.core.hulls;
      const names = ctx.core.targetNames;
      const gate = deferred<StaticHullArtifact>();
      const pending = ensureStationHulls(
        ctx,
        "dodecahedron",
        () => gate.promise,
      );
      ctx.runtime.disposed = true;
      gate.resolve(artifactOf("dodecahedron"));
      await pending;
      expect(ctx.core.hulls).toBe(before);
      expect(ctx.core.targetNames).toBe(names);
    });

    it("rejects when the load fails, leaves the session as it was, and loads again on a later ask", async () => {
      const ctx = sessionOf(firstSystemOfKind("icosahedron"));
      const before = ctx.core.hulls;
      const names = ctx.core.targetNames;
      const failing = vi.fn(() => Promise.reject(new Error("artifact lost")));
      await expect(
        ensureStationHulls(ctx, "icosahedron", failing),
      ).rejects.toThrow("artifact lost");
      expect(ctx.core.hulls).toBe(before);
      expect(ctx.core.targetNames).toBe(names);
      await ensureStationHulls(ctx, "icosahedron", () =>
        Promise.resolve(artifactOf("icosahedron")),
      );
      expect(ctx.core.hulls?.has("icosahedron-station")).toBe(true);
    });

    it("yields equal hulls and names when the same kind is merged into a fresh table", async () => {
      const ctx = sessionOf(firstSystemOfKind("dodecahedron"));
      await ensureStationHulls(ctx, "dodecahedron");
      const merged = ctx.core.hulls;
      const names = ctx.core.targetNames;
      // A second session boots with the shared artifact only, and the same
      // kind is ensured there: the result equals the first merge.
      const again = sessionOf(firstSystemOfKind("dodecahedron"));
      await ensureStationHulls(again, "dodecahedron");
      expect(again.core.hulls).toEqual(merged);
      expect(again.core.targetNames).toEqual(names);
    });
  });

  describe("prefetchStationFor", () => {
    const galaxyById = new Map(galaxy.map((entry) => [entry.id, entry]));

    it("starts exactly one load of the destination's artifact, and none for a second countdown", async () => {
      const zaonce = systemOf("Zaonce");
      const ctx = sessionOf(systemOf("Lave"));
      const gate = deferred<StaticHullArtifact>();
      const load = vi.fn<StationHullLoader>(() => gate.promise);
      prefetchStationFor(ctx, galaxyById, zaonce.id, load);
      expect(load).toHaveBeenCalledTimes(1);
      expect(load).toHaveBeenCalledWith("icosahedron");
      // The same countdown asked again while the load is in flight.
      prefetchStationFor(ctx, galaxyById, zaonce.id, load);
      expect(load).toHaveBeenCalledTimes(1);
      gate.resolve(artifactOf("icosahedron"));
      await vi.waitFor(() =>
        expect(ctx.core.hulls?.has("icosahedron-station")).toBe(true),
      );
      // A second countdown toward Zaonce, the artifact being present.
      prefetchStationFor(ctx, galaxyById, zaonce.id, load);
      expect(load).toHaveBeenCalledTimes(1);
    });

    it("never throws and leaves the table alone while the artifact is still pending", () => {
      const ctx = sessionOf(systemOf("Lave"));
      const before = ctx.core.hulls;
      const gate = deferred<StaticHullArtifact>();
      expect(() =>
        prefetchStationFor(
          ctx,
          galaxyById,
          systemOf("Zaonce").id,
          () => gate.promise,
        ),
      ).not.toThrow();
      expect(ctx.core.hulls).toBe(before);
      expect(ctx.core.hulls?.has("icosahedron-station")).toBe(false);
    });

    it("requests no artifact in a traffic-off session or for a Coriolis destination", () => {
      const load = vi.fn(() => Promise.resolve(shared));
      prefetchStationFor(
        sessionOf(systemOf("Lave"), false),
        galaxyById,
        systemOf("Zaonce").id,
        load,
      );
      prefetchStationFor(
        sessionOf(firstSystemOfKind("icosahedron")),
        galaxyById,
        systemOf("Lave").id,
        load,
      );
      expect(load).not.toHaveBeenCalled();
    });

    it("ignores a destination the galaxy does not hold", () => {
      const load = vi.fn(() => Promise.resolve(shared));
      prefetchStationFor(
        sessionOf(systemOf("Lave")),
        galaxyById,
        "nowhere",
        load,
      );
      expect(load).not.toHaveBeenCalled();
    });

    it("logs a rejected load with the file name and leaves the session as it is", async () => {
      const ctx = sessionOf(systemOf("Lave"));
      const before = ctx.core.hulls;
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      prefetchStationFor(ctx, galaxyById, systemOf("Zaonce").id, () =>
        Promise.reject(new Error("offline")),
      );
      await vi.waitFor(() => expect(logged).toHaveBeenCalledTimes(1));
      expect(String(logged.mock.calls[0]?.[0])).toContain(
        stationRecord("icosahedron").hullsFile,
      );
      expect(ctx.core.hulls).toBe(before);
    });
  });
});
