// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The lazy debris catalogue (DATA-16).
 *
 * The debris records (the cargo barrel, the alloy plate and the wrecks: model,
 * GLB path, mass, collision radius and tumble rates) live in their own
 * generated file and are loaded only when something asks for them: the glob
 * below is non-eager, so Vite splits the file into its own chunk that the first
 * load never fetches. Nothing imports this module yet; plan 16-06 wires it into
 * the session start, where it loads only when traffic is on, beside the NPC
 * ship records.
 *
 * The module name starts with `ships` on purpose, so the simulation's ESLint
 * denial of `**\/content/ships*` covers it: `src/sim` sees `DebrisRecord` only
 * as a type, through `src/content/types.ts`.
 *
 * The file is loaded as a `?raw` string, parsed, and validated against the
 * strict schema, so a malformed or extended record fails here with the path
 * named instead of reaching the sim (T-16-08).
 */

import { DebrisCatalogueSchema } from "./schemas/ship-debris.js";
import type { DebrisCatalogue } from "./schemas/ship-debris.js";

const DEBRIS_PATH = "./generated/ships-debris.json";

const lazyDebris = import.meta.glob("./generated/ships-debris.json", {
  query: "?raw",
  import: "default",
});

let cachedCatalogue: Promise<DebrisCatalogue> | undefined;

/** Load, parse and validate the debris records once; later calls share the promise. */
export function loadDebrisCatalogue(): Promise<DebrisCatalogue> {
  cachedCatalogue ??= (async () => {
    const load = lazyDebris[DEBRIS_PATH];
    if (load === undefined) {
      throw new Error(
        `Wegolite: expected the debris records at ${DEBRIS_PATH}, but they are missing.`,
      );
    }
    const parsed = DebrisCatalogueSchema.safeParse(
      JSON.parse(await load()) as unknown,
    );
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(
        `Wegolite: ${DEBRIS_PATH} is not a valid debris catalogue: ${
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
