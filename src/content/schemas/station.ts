// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The station spec (Phase 22.1, WORLD-20): the numbers the simulation reads
 * about a system's main station, resolved from the station's compiled record.
 *
 * `src/sim` may not import the content catalogue, so it receives the station as
 * this plain record (named through `content/types.ts`, the sim's type-only
 * door) and never as a literal. `stationSpecFor` (`src/content/stations.ts`)
 * builds one from a `ships-client.json` entry; the schema is the shape every
 * consumer, and every test that fabricates a bad spec, agrees on.
 *
 * The bounds mirror what the layout asserts (T-3-01): the radius, mass and dock
 * offset are positive and finite, the roll is finite. A station with a zero
 * radius would put the aegis, proximity and placement maths on a point.
 */

import { z } from "zod";

import { STATION_KINDS } from "../stations.js";

const positiveFinite = z.number().finite().positive();

export const StationSpecSchema = z.strictObject({
  /** Which of the three main stations this is (`system.station`). */
  kind: z.enum(STATION_KINDS),
  /** The shipdata key and `ships-client.json` entry of the station. */
  key: z.string().min(1).max(64),
  /** The display name (`extras.name`). */
  name: z.string().min(1).max(64),
  /** Oolite's float32 collision radius, hull plus solid subentities, metres. */
  collisionRadius: positiveFinite,
  /** The float32 mass computed at build time (the blockage mass). */
  mass: positiveFinite,
  /** Metres from the station centre to the dock mouth. */
  dockOffset: positiveFinite,
  /** `station_roll`, in right-angles per second (Oolite's authored unit). */
  stationRoll: z.number().finite(),
});

export type StationSpec = z.infer<typeof StationSpecSchema>;
