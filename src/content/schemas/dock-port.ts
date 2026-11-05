// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The dock-port geometry schema (DOCK-01, T-04-02, T-04-33).
 *
 * `DockPortSchema` is strict because it describes our own generated output, and
 * it is shared by the build-time emitter (`tools/oolite-ingest/convert/dock-port.ts`)
 * and the runtime loader (`src/content/dock-port.ts`): the emitter cannot write
 * a record the loader would reject, and the loader cannot accept one the emitter
 * could not have written.
 *
 * Every dimension is bounded away from zero on purpose. A zero or subnormal
 * aperture would make the Oolite x1.25 corridor expansion non-terminating
 * (`value * 1.25 === value`), so `0`, `-1`, `NaN`, `Infinity`, `MIN_VALUE` and
 * `MAX_VALUE` are all unrepresentable rather than merely unlikely.
 */

import { z } from "zod";

/** Smallest accepted port dimension, in metres. */
export const PORT_DIMENSION_MIN = 1e-3;

/** Largest accepted port dimension, in metres. */
export const PORT_DIMENSION_MAX = 1e5;

const portDimension = z
  .number()
  .finite()
  .min(PORT_DIMENSION_MIN)
  .max(PORT_DIMENSION_MAX);

const halfExtent = z.number().finite().positive();

export const DockPortSchema = z
  .strictObject({
    version: z.literal(1),
    /** The vendored snapshot every number in this record is measured from. */
    source: z.string().min(1),
    port: z.strictObject({
      width: portDimension,
      height: portDimension,
      depth: portDimension,
    }),
    corridor: z.strictObject({
      ww: halfExtent,
      hh: halfExtent,
    }),
  })
  .superRefine((value, ctx) => {
    // The corridor half-extents are derived from the aperture and can never
    // exceed the full port dimension they are paired with.
    if (value.corridor.ww > value.port.width) {
      ctx.addIssue({
        code: "custom",
        path: ["corridor", "ww"],
        message: `corridor.ww ${String(value.corridor.ww)} exceeds port.width ${String(value.port.width)}`,
      });
    }
    if (value.corridor.hh > value.port.height) {
      ctx.addIssue({
        code: "custom",
        path: ["corridor", "hh"],
        message: `corridor.hh ${String(value.corridor.hh)} exceeds port.height ${String(value.port.height)}`,
      });
    }
  });

export type DockPort = z.infer<typeof DockPortSchema>;
