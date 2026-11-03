// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The label record schema (D-23, D-25, D-16).
 *
 * Six arrays and the `sysdata-*` format templates, nothing else. The pinned
 * `descriptions.plist` has **no** tech-level label array — the tech-level
 * display is the `sysdata-tl-value` template plus the raw + 1 rule — so this
 * schema deliberately does not model one.
 *
 * Every value is a template, not prose: `%@`, `%R`, `[n]`, `[techLevel]` and
 * the star glyphs are preserved verbatim for Phase 5/7 to expand.
 */

import { z } from "zod";

export const LabelsSchema = z.strictObject({
  economy: z.array(z.string()).length(8),
  government: z.array(z.string()).length(8),
  legalStatus: z.array(z.string()).length(3),
  rating: z.array(z.string()).length(9),
  inhabitants: z.array(z.array(z.string())).length(5),
  systemDescription: z.array(z.array(z.string())).length(36),
  formatTemplates: z.record(z.string(), z.string()),
});

export type Labels = z.infer<typeof LabelsSchema>;
export type LabelArrays = Pick<
  Labels,
  | "economy"
  | "government"
  | "legalStatus"
  | "rating"
  | "inhabitants"
  | "systemDescription"
>;
