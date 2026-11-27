// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The ident lock message names a static target from compiled content (CBT-17,
 * plan 18-06, criterion 3).
 *
 * The sim's `identLocked` carries a spec key only. The HUD names it from the
 * NPC traffic catalogue, then from the static artifact's compiled names
 * (`ctx.core.targetNames`, installed at the boot load from
 * `loadSessionContent(...).staticNames`), then falls back to the key. With
 * traffic off neither table is loaded, so the HUD prints the raw key, as it
 * does for an NPC today (review L510@b45e113, accepted).
 *
 * No display name is typed here or in app code: every expected name is read
 * from the generated static artifact.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createSessionState } from "../../../src/app/session/context.js";
import type { SessionState } from "../../../src/app/session/context.js";
import {
  createEventRouter,
  createHudMessages,
} from "../../../src/app/session/event-router.js";
import {
  SESSION_CONTENT_LOADERS,
  loadSessionContent,
  targetNameMap,
} from "../../../src/app/session/start-session.js";
import { StaticHullArtifactSchema } from "../../../src/content/schemas/ship-static-hull.js";
import { ensureStationHulls } from "../../../src/app/session/station-install.js";
import { stationRecord } from "../../../src/content/stations.js";
import type { StationKind } from "../../../src/content/stations.js";
import type { System } from "../../../src/content/types.js";
import type { SimEvent } from "../../../src/sim/events.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import {
  STATIC_TARGETS,
  staticIdentKey,
} from "../../../src/sim/world/statics.js";
import { deriveSystemLayout } from "../../../src/sim/world/layout.js";
import { laveFixture } from "../../helpers/lave.js";
import { stationSpecOf } from "../../helpers/stations.js";

const lave = laveFixture();

/** The compiled static names, read from the generated artifact. */
const COMPILED = new Map(
  StaticHullArtifactSchema.parse(
    JSON.parse(
      readFileSync("src/content/generated/ships-static-hulls.json", "utf8"),
    ),
  ).names.map((entry) => [entry.key, entry.name]),
);

function compiled(key: string): string {
  const name = COMPILED.get(key);
  if (name === undefined) throw new Error(`no compiled name for ${key}`);
  return name;
}

function sessionCtx(traffic: boolean): SessionState {
  const ctx = createSessionState({
    system: lave.system,
    saveStatus: "absent",
    saveSkipReason: "",
  });
  ctx.runtime.testFlags = { ...ctx.runtime.testFlags, traffic };
  ctx.core.state = initFlightState(lave.layout);
  return ctx;
}

/**
 * A session whose content was loaded the way the boot loads it, with the
 * target names installed as `startSession` installs them, and a router whose
 * HUD messages are recorded.
 */
async function booted(traffic: boolean) {
  const ctx = sessionCtx(traffic);
  const failures: string[] = [];
  const content = await loadSessionContent(
    ctx,
    SESSION_CONTENT_LOADERS,
    (reason) => {
      failures.push(reason);
    },
  );
  expect(failures).toEqual([]);
  if (content === undefined) throw new Error("the content load failed");
  ctx.core.targetNames = targetNameMap(content.staticNames);
  const log: string[] = [];
  const router = createEventRouter(ctx, {
    stationFlow: () => undefined,
    damageFlow: () => undefined,
    hudMessages: createHudMessages(
      {
        messages: {
          enqueue: (text: string, seconds: number) => {
            log.push(`${text} for ${seconds}`);
          },
          clearPrevious: () => undefined,
        },
      },
      ctx,
    ),
    dockFeedback: () => undefined,
    hyperspaceFlow: () => undefined,
  });
  /** Offer `event` one simulated second after the last, past the gate. */
  let clock = 0;
  const dispatch = (event: SimEvent): void => {
    clock += 1;
    if (ctx.core.state !== undefined) ctx.core.state.flightTime = clock;
    router.dispatch(event);
  };
  return { ctx, log, dispatch };
}

function locked(specKey: string): SimEvent {
  return { kind: "identLocked", specKey };
}

describe("the ident lock names the station (tracer)", () => {
  it("prints the compiled station name with traffic on", async () => {
    const h = await booted(true);
    h.dispatch(locked("coriolis-station"));
    expect(h.log).toEqual([
      `Ident system locked onto ${compiled("coriolis-station")}. for 4.5`,
    ]);
  });

  it("prints the raw key with traffic off, where no name is loaded", async () => {
    const h = await booted(false);
    expect(h.ctx.core.targetNames).toBeUndefined();
    h.dispatch(locked("coriolis-station"));
    expect(h.log).toEqual([
      "Ident system locked onto coriolis-station. for 4.5",
    ]);
  });

  it("names an NPC from the traffic catalogue, not the target names", async () => {
    const h = await booted(true);
    const viper = h.ctx.core.npcTraffic?.catalogue.find(
      (record) => record.key === "viper",
    );
    if (viper === undefined) throw new Error("no viper record");
    h.dispatch(locked("viper"));
    expect(h.log).toEqual([`Ident system locked onto ${viper.name}. for 4.5`]);
  });

  it("falls back to the key for a key no table knows", async () => {
    const h = await booted(true);
    h.dispatch(locked("mystery"));
    expect(h.log).toEqual(["Ident system locked onto mystery. for 4.5"]);
  });
});

describe("the ident lock names the buoys, pods and plates", () => {
  it.each(["buoy", "buoy-witchpoint", "barrel", "alloy"])(
    "prints the compiled name of %s with traffic on",
    async (specKey) => {
      const h = await booted(true);
      h.dispatch(locked(specKey));
      expect(h.log).toEqual([
        `Ident system locked onto ${compiled(specKey)}. for 4.5`,
      ]);
    },
  );

  it("prints each raw key with traffic off", async () => {
    const h = await booted(false);
    for (const specKey of ["buoy", "buoy-witchpoint", "barrel", "alloy"]) {
      h.dispatch(locked(specKey));
    }
    expect(h.log).toEqual([
      "Ident system locked onto buoy. for 4.5",
      "Ident system locked onto buoy-witchpoint. for 4.5",
      "Ident system locked onto barrel. for 4.5",
      "Ident system locked onto alloy. for 4.5",
    ]);
  });
});

describe("startSession installs the target names (source fact)", () => {
  it("builds ctx.core.targetNames from the boot load's static names and clears it on dispose", () => {
    // startSession has no Node harness (it builds the renderer, HUD and
    // input), so the wiring is pinned as source facts, as start-session.test
    // pins the content load.
    const source = readFileSync("src/app/session/start-session.ts", "utf8");
    const install =
      "ctx.core.targetNames = targetNameMap(content.staticNames);";
    expect(source.split(install)).toHaveLength(2);
    const load = source.indexOf("const content = await loadSessionContent(");
    expect(load).toBeGreaterThan(0);
    expect(source.indexOf(install)).toBeGreaterThan(load);
    expect(source).toContain("ctx.core.targetNames = undefined;");
  });

  it("awaits the starting station's hulls after the content load and before the first scene", () => {
    const source = readFileSync("src/app/session/start-session.ts", "utf8");
    const ensure = "await ensureStationHulls(ctx, station.kind);";
    const content = source.indexOf("const content = await loadSessionContent(");
    const scene = source.indexOf(
      "scenes.enterSystem(ctx.core.system, station)",
    );
    expect(source.split(ensure)).toHaveLength(2);
    expect(source.indexOf(ensure)).toBeGreaterThan(content);
    expect(scene).toBeGreaterThan(source.indexOf(ensure));
  });
});

describe("the ident lock names the Dodecahedron and Icosahedron stations (Phase 22.1, WORLD-20)", () => {
  const galaxy = JSON.parse(
    readFileSync("src/content/generated/systems/g0.json", "utf8"),
  ) as System[];
  const stationRow = STATIC_TARGETS.find((row) => row.layoutKey === "station");

  /** The compiled name of a kind's station, read from its own artifact. */
  function artifactName(kind: StationKind): string {
    const key = stationRecord(kind).shipKey;
    const artifact = StaticHullArtifactSchema.parse(
      JSON.parse(
        readFileSync(
          `src/content/generated/${stationRecord(kind).hullsFile}`,
          "utf8",
        ),
      ),
    );
    const named = artifact.names.find((entry) => entry.key === key);
    if (named === undefined) throw new Error(`no compiled name for ${key}`);
    return named.name;
  }

  it.each(["dodecahedron", "icosahedron"] as const)(
    "%s: the key the lock emits comes from the layout, the name from the merged names",
    async (kind) => {
      const h = await booted(true);
      const key = stationRecord(kind).shipKey;
      const system = galaxy.find((entry) => entry.station === kind);
      if (system === undefined || stationRow === undefined) {
        throw new Error("no system or station row");
      }

      // The key is the layout's, whatever the table holds.
      const emitted = staticIdentKey(
        stationRow,
        deriveSystemLayout(system, stationSpecOf(kind)),
      );
      expect(emitted).toBe(key);

      // Before the station's artifact is merged the HUD prints the key; after
      // it, the compiled name, looked up in the same map as the Coriolis name.
      h.dispatch(locked(emitted));
      await ensureStationHulls(h.ctx, kind);
      h.dispatch(locked(emitted));
      expect(h.log).toEqual([
        `Ident system locked onto ${key}. for 4.5`,
        `Ident system locked onto ${artifactName(kind)}. for 4.5`,
      ]);
    },
  );
});
