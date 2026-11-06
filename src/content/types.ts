// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The type-only content surface for `src/sim` (D-16, DATA-07).
 *
 * Every export is `export type … from` a schema module. There is no runtime
 * import and no `export const` here, so importing a content type cannot drag
 * zod or generated data into the simulation bundle. The schema remains the
 * single source of truth: each alias is `z.infer`red from it, so the record and
 * its type cannot drift.
 *
 * The sim may import this module and nothing else from `src/content`; the
 * ESLint sim zone denies `content/index*`, `content/schemas/**` and
 * `content/generated/**`, and `tests/guards/content-boundary.test.ts` proves
 * both the denial and this type-only door.
 */

export type { Commodity, CommodityUnit } from "./schemas/commodity.js";
export type { System, SystemChunk } from "./schemas/system.js";
export type { Equipment } from "./schemas/equipment.js";
export type { Labels } from "./schemas/labels.js";
export type { CatalogEntry, ShipCatalogue } from "./schemas/ship.js";
export type { ShipDef, Subentity } from "./schemas/ship.js";
export type { ContentManifest, ManifestFileEntry } from "./schemas/manifest.js";
