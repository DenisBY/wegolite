// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The per-galaxy system loader (D-14, D-15, DATA-05).
 *
 * Galaxy 0 is **eager**: its chunk is part of the main bundle, because the
 * player always starts in galaxy 0 and a station screen must not wait on a
 * network round trip. Galaxies 1-7 are seven separate `import.meta.glob`
 * dynamic entries, so Vite emits one code-split chunk per galaxy and a jump to
 * g7 never downloads g1.
 *
 * The chunks are loaded as `?raw` strings and `JSON.parse`d here rather than
 * imported as JSON modules: a literal-typed import of eight 256-record chunks
 * would make `tsc` infer eight large object types, and the runtime record shape
 * is already validated at build time by `SystemSchema` (D-15). `import type`
 * keeps this module free of any runtime schema import.
 *
 * A missing chunk throws a named error instead of returning `[]` — an empty
 * galaxy would silently look like a galaxy with no systems.
 */

import type { SystemChunk } from "./schemas/system.js";

/** The dynamically imported galaxies, in galaxy order. */
const LAZY_GALAXY_PATHS = [
  "./generated/systems/g1.json",
  "./generated/systems/g2.json",
  "./generated/systems/g3.json",
  "./generated/systems/g4.json",
  "./generated/systems/g5.json",
  "./generated/systems/g6.json",
  "./generated/systems/g7.json",
] as const;

export type GalaxyIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type AnyGalaxyIndex = 0 | GalaxyIndex;

/**
 * The glob keys for g1-g7. Exported so a test can prove the lazy set is
 * exactly seven galaxies and that g0 is not among them.
 */
export const GALAXY_CHUNK_PATHS: Record<GalaxyIndex, string> = {
  1: LAZY_GALAXY_PATHS[0],
  2: LAZY_GALAXY_PATHS[1],
  3: LAZY_GALAXY_PATHS[2],
  4: LAZY_GALAXY_PATHS[3],
  5: LAZY_GALAXY_PATHS[4],
  6: LAZY_GALAXY_PATHS[5],
  7: LAZY_GALAXY_PATHS[6],
};

const EAGER_GALAXY_0_PATH = "./generated/systems/g0.json";

const eagerGalaxies = import.meta.glob("./generated/systems/g0.json", {
  eager: true,
  query: "?raw",
  import: "default",
});

const lazyGalaxies = import.meta.glob(
  [
    "./generated/systems/g1.json",
    "./generated/systems/g2.json",
    "./generated/systems/g3.json",
    "./generated/systems/g4.json",
    "./generated/systems/g5.json",
    "./generated/systems/g6.json",
    "./generated/systems/g7.json",
  ],
  { query: "?raw", import: "default" },
);

/**
 * The number of code-split galaxies. The app probe reads this so the seven
 * dynamic entries stay in the production build graph before Phase 3's first
 * consumer: an unused dynamic glob is tree-shaken away, which would silently
 * leave `loadGalaxy` with no chunk to fetch.
 */
export const LAZY_GALAXY_COUNT = Object.keys(lazyGalaxies).length;

function parseChunk(raw: string, galaxy: AnyGalaxyIndex): SystemChunk {
  const parsed: unknown = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(
      `Wegolite: galaxy ${String(galaxy)} content is not a system array.`,
    );
  }
  return parsed as SystemChunk;
}

let cachedGalaxy0: SystemChunk | undefined;

/** Galaxy 0, synchronously: 256 records, no promise, no network request. */
export function galaxy0(): SystemChunk {
  if (cachedGalaxy0 !== undefined) return cachedGalaxy0;
  const raw = eagerGalaxies[EAGER_GALAXY_0_PATH];
  if (raw === undefined) {
    throw new Error(
      `Wegolite: expected the eager galaxy 0 chunk at ${EAGER_GALAXY_0_PATH}, but it is missing.`,
    );
  }
  cachedGalaxy0 = parseChunk(raw, 0);
  return cachedGalaxy0;
}

/** A code-split galaxy: 256 records, fetched on demand. */
export async function loadGalaxy(galaxy: GalaxyIndex): Promise<SystemChunk> {
  const path = GALAXY_CHUNK_PATHS[galaxy];
  const load = lazyGalaxies[path];
  if (load === undefined) {
    throw new Error(
      `Wegolite: expected a dynamic chunk for galaxy ${String(galaxy)} at ${path}, but it is missing.`,
    );
  }
  return parseChunk(await load(), galaxy);
}

/** Either galaxy 0 (eager) or one of the seven code-split galaxies. */
export async function loadAnyGalaxy(
  galaxy: AnyGalaxyIndex,
): Promise<SystemChunk> {
  return galaxy === 0 ? galaxy0() : loadGalaxy(galaxy);
}
