// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The equipment record schema (D-10, D-15, D-16, T-02-07).
 *
 * `EquipmentSchema` is **strict** because it describes our own output. The
 * `conditions` record is the opposite on purpose: it is Oolite's dictionary,
 * and the next snapshot bump may add a key. It is carried verbatim and never
 * evaluated here — Phase 5 filters the v1-functional set from this metadata.
 *
 * `price` is integer decicredits with an explicit `priceUnit`, so a 10× unit
 * error fails a pinned anchor instead of surfacing as an economy bug.
 */

import { z } from "zod";

export const EquipmentConditionsSchema = z.record(z.string(), z.unknown());

export const EquipmentSchema = z.strictObject({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  techLevel: z.number().int(),
  price: z.number().int(),
  priceUnit: z.literal("decicredits"),
  conditions: EquipmentConditionsSchema,
  // Authored `purchase_sort_order` when the entry declares one.
  sortHint: z.number().int().optional(),
});

export type Equipment = z.infer<typeof EquipmentSchema>;
export type EquipmentConditions = z.infer<typeof EquipmentConditionsSchema>;
