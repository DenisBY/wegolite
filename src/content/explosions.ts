// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The lazy explosion settings (DATA-16, D16-22).
 *
 * Render-only data: the default ship explosion's cloud setting (alpha, colour
 * order, particle count, duration, growth rate, size, spread, brightness and
 * texture), compiled from the vendored `explosions.plist`. The glob below is
 * non-eager, so Vite splits the file into its own chunk that the first load
 * never fetches. Nothing imports this module yet; plan 16-06 loads it with
 * traffic on and hands the setting to the render. `src/sim` never imports it:
 * the ESLint denial of `**\/content/explosions*` and
 * `tests/guards/content-boundary.test.ts` enforce that.
 *
 * The file is loaded as a `?raw` string, parsed, and validated against the
 * strict schema, so a malformed or extended record fails here with the path
 * named instead of sizing a render pool or naming a fetch (T-16-15).
 */

import { ExplosionCatalogueSchema } from "./schemas/explosion.js";
import type { ExplosionCatalogue } from "./schemas/explosion.js";

const EXPLOSIONS_PATH = "./generated/explosions.json";

const lazyExplosions = import.meta.glob("./generated/explosions.json", {
  query: "?raw",
  import: "default",
});

let cachedCatalogue: Promise<ExplosionCatalogue> | undefined;

/** Load, parse and validate the explosion settings once; later calls share the promise. */
export function loadExplosionCatalogue(): Promise<ExplosionCatalogue> {
  cachedCatalogue ??= (async () => {
    const load = lazyExplosions[EXPLOSIONS_PATH];
    if (load === undefined) {
      throw new Error(
        `Wegolite: expected the explosion settings at ${EXPLOSIONS_PATH}, but they are missing.`,
      );
    }
    const parsed = ExplosionCatalogueSchema.safeParse(
      JSON.parse(await load()) as unknown,
    );
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(
        `Wegolite: ${EXPLOSIONS_PATH} is not a valid explosion catalogue: ${
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
