// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The lazy NPC ship record catalogue (DATA-10, DATA-13).
 *
 * The nine records (roles, AI name, scan class, model, GLB path) live in their
 * own generated file and are loaded only when something asks for them: the
 * glob below is non-eager, so Vite splits the file into its own chunk that the
 * first load never fetches. src/app/session/start-session.ts is the one
 * importer: it calls `loadNpcCatalogue()` in the boot `Promise.all` only when
 * traffic is on, so a traffic-off session never fetches the chunk. The records
 * feed the inert populator and the step masses (src/app/session/traffic.ts).
 * The chunk holds records only: the NPC models and textures stay outside the
 * first-load set, requested by the render driver only after the first in-flight
 * frame has been presented (plan 12-11, DATA-13).
 *
 * The module name starts with `ships` on purpose, so the simulation's ESLint
 * denial of `**\/content/ships*` covers it: `src/sim` sees `NpcShip` only as a
 * type, through `src/content/types.ts`.
 *
 * The file is loaded as a `?raw` string, parsed, and validated against the
 * strict schema, so a malformed or extended record fails here with the path
 * named instead of reaching the populator (T-09-17).
 */

import { NpcShipCatalogueSchema } from "./schemas/ship-npc.js";
import type { NpcShip, NpcShipCatalogue } from "./schemas/ship-npc.js";

const NPC_SHIPS_PATH = "./generated/ships-npc.json";

const lazyNpcShips = import.meta.glob("./generated/ships-npc.json", {
  query: "?raw",
  import: "default",
});

let cachedCatalogue: Promise<NpcShipCatalogue> | undefined;

/** Load, parse and validate the NPC records once; later calls share the promise. */
export function loadNpcCatalogue(): Promise<NpcShipCatalogue> {
  cachedCatalogue ??= (async () => {
    const load = lazyNpcShips[NPC_SHIPS_PATH];
    if (load === undefined) {
      throw new Error(
        `Wegolite: expected the NPC ship records at ${NPC_SHIPS_PATH}, but they are missing.`,
      );
    }
    const parsed = NpcShipCatalogueSchema.safeParse(
      JSON.parse(await load()) as unknown,
    );
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(
        `Wegolite: ${NPC_SHIPS_PATH} is not a valid NPC ship catalogue: ${
          issue === undefined
            ? "invalid"
            : `${issue.path.join(".")}: ${issue.message}`
        }.`,
      );
    }
    return parsed.data;
  })();
  return cachedCatalogue;
}

/**
 * Find one NPC record by key.
 *
 * @throws {Error} naming the key; a silent `undefined` would become a spawn
 * built from nothing.
 */
export function findNpcShip(catalogue: NpcShipCatalogue, key: string): NpcShip {
  const record = catalogue.find((candidate) => candidate.key === key);
  if (record === undefined) {
    throw new Error(
      `Wegolite: the NPC ship catalogue has no record with key "${key}".`,
    );
  }
  return record;
}
