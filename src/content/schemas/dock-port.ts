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
const finite = z.number().finite();

/**
 * One collision box in station-local Wegolite coordinates: `halfX`/`halfY` are
 * the symmetric x/y half-extents about the station origin, and `zMin`/`zMax`
 * are already in Wegolite's negated-Z frame. `min < max` on every axis is the
 * positive-span invariant; a zero-span box is a degenerate mesh, not geometry.
 */
const BoxSchema = z
  .strictObject({
    halfX: halfExtent,
    halfY: halfExtent,
    zMin: finite,
    zMax: finite,
  })
  .superRefine((box, ctx) => {
    if (!(box.zMin < box.zMax)) {
      ctx.addIssue({
        code: "custom",
        path: ["zMax"],
        message: `box zMin ${String(box.zMin)} must be less than zMax ${String(box.zMax)}`,
      });
    }
  });

const Coordinate = z.tuple([finite, finite, finite]);

/** An axis-aligned box with explicit min/max corners, every axis ordered. */
const ShipBoxSchema = z
  .strictObject({
    min: Coordinate,
    max: Coordinate,
  })
  .superRefine((box, ctx) => {
    for (let axis = 0; axis < 3; axis++) {
      const min = box.min[axis];
      const max = box.max[axis];
      if (min === undefined || max === undefined || !(min < max)) {
        ctx.addIssue({
          code: "custom",
          path: ["max", axis],
          message: `ship min[${String(axis)}] ${String(min)} must be less than max[${String(axis)}] ${String(max)}`,
        });
      }
    }
  });

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
    /** The Coriolis hull as a collision box, station-local Wegolite z. */
    hull: BoxSchema,
    /**
     * The contact proxy: the union of the hull, triangle and faceplate bounds.
     * It is a conservative box, not the mesh, and it may only grow past the
     * hull — never shrink inside it.
     */
    contact: BoxSchema,
    /** The committed Cobra Mk III bbox in the Wegolite frame (nose at -Z). */
    ship: ShipBoxSchema,
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
    // T-04-35: the contact proxy must cover the protruding faceplate, so its
    // -Z face can only sit at or beyond the hull's.
    if (!(value.contact.zMin <= value.hull.zMin)) {
      ctx.addIssue({
        code: "custom",
        path: ["contact", "zMin"],
        message: `contact.zMin ${String(value.contact.zMin)} must not be greater than hull.zMin ${String(value.hull.zMin)}`,
      });
    }
  });

export type DockPort = z.infer<typeof DockPortSchema>;
