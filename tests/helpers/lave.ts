// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The Lave fixture (Wave 0, VALIDATION § Wave 0 Requirements).
 *
 * Reads the committed generated JSON with `readFileSync` rather than importing
 * it: `src/sim` may not import generated content, and a Node test must exercise
 * the same bytes the build shipped. The fixture derives the layout and flight
 * config through the real modules, so a drift in either fails here first.
 */

import { readFileSync } from "node:fs";

import type { ShipDef, System } from "../../src/content/types.js";
import { deriveFlightConfig } from "../../src/sim/flight/config.js";
import type { FlightConfig } from "../../src/sim/flight/config.js";
import { deriveSystemLayout } from "../../src/sim/world/layout.js";
import type { SystemLayout } from "../../src/sim/world/layout.js";
import type { InputFrame } from "../../src/sim/state.js";

interface CatalogueEntry {
  key: string;
  shipDef: ShipDef;
}

function readJson<T>(relativePath: string): T {
  const raw = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  return JSON.parse(raw) as T;
}

export interface LaveFixture {
  readonly system: System;
  readonly playerDef: ShipDef;
  readonly stationDef: ShipDef;
  readonly layout: SystemLayout;
  readonly config: FlightConfig;
}

export const LAVE_SYSTEM_ID = "g0-s7";
export const PLAYER_SHIP_KEY = "oolite_template_cobra3-player";
export const STATION_SHIP_KEY = "coriolis-station";

export function laveFixture(): LaveFixture {
  const systems = readJson<System[]>(
    "../../src/content/generated/systems/g0.json",
  );
  const system = systems.find((candidate) => candidate.id === LAVE_SYSTEM_ID);
  if (system === undefined) {
    throw new Error(`the fixture has no system "${LAVE_SYSTEM_ID}"`);
  }

  const catalogue = readJson<CatalogueEntry[]>(
    "../../src/content/generated/ships.json",
  );
  const player = catalogue.find((entry) => entry.key === PLAYER_SHIP_KEY);
  if (player === undefined) {
    throw new Error(`the fixture has no ship "${PLAYER_SHIP_KEY}"`);
  }
  const station = catalogue.find((entry) => entry.key === STATION_SHIP_KEY);
  if (station === undefined) {
    throw new Error(`the fixture has no ship "${STATION_SHIP_KEY}"`);
  }

  return {
    system,
    playerDef: player.shipDef,
    stationDef: station.shipDef,
    layout: deriveSystemLayout(system, station.shipDef),
    config: deriveFlightConfig(player.shipDef),
  };
}

/** One frame of scripted input for the deterministic flight tests. */
export function scriptedFrame(
  pitch: number,
  roll: number,
  speed: number,
  precision = false,
): InputFrame {
  return { pitch, roll, speed, precision };
}
