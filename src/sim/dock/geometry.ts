// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The docking geometry (DOCK-01, D-01, T-04-02, T-04-35).
 *
 * `createDockGeometry` is the single trust boundary between the generated
 * `dock-port.json` record and the pure simulation. It validates every number
 * once, then converts the emitted station-local contact proxy into the
 * docking-port frame so no downstream module ever re-projects it:
 *
 * - station-local +Z points inward (into the hull);
 * - the port frame's `k` points outward (toward the planet), so port
 *   `z = -stationLocalZ - dockOffset`.
 *
 * The conversion is therefore `contactPort.zMin = -contact.zMax - dockOffset`
 * and `contactPort.zMax = -contact.zMin - dockOffset`, with `halfX`/`halfY`
 * unchanged. For the committed Coriolis that is about -1000.2561 .. +34.0419.
 *
 * Every dimension is bounded away from zero because Oolite's x1.25 aperture
 * expansion cannot make progress on a subnormal value and would otherwise hang
 * (`T-04-38`). A named `DockGeometryError` is thrown instead.
 */

import type { Vec3 } from "../math.js";

/** Largest accepted port/corridor dimension, in metres. */
export const DOCK_DIMENSION_MAX = 1e5;

export interface DockPortDimensions {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

export interface DockCorridorExtents {
  readonly ww: number;
  readonly hh: number;
}

/** One collision box in station-local Wegolite coordinates. */
export interface DockBox {
  readonly halfX: number;
  readonly halfY: number;
  readonly zMin: number;
  readonly zMax: number;
}

/** The committed Cobra bbox (Wegolite frame, nose at -Z). */
export interface DockShipBox {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/**
 * The structural shape of `src/content/generated/dock-port.json`.
 *
 * It is declared here rather than imported from `src/content` because the sim
 * may only name content types through the type-only door; the app passes the
 * validated record in.
 */
export interface DockPortData {
  readonly port: DockPortDimensions;
  readonly corridor: DockCorridorExtents;
  readonly hull: DockBox;
  readonly contact: DockBox;
  readonly ship: DockShipBox;
}

export interface DockGeometry {
  readonly port: DockPortDimensions;
  readonly corridor: DockCorridorExtents;
  /** The station-local hull box. */
  readonly hull: DockBox;
  /** The station-local contact proxy (hull + tris + faceplate union). */
  readonly contact: DockBox;
  /** The same contact proxy converted once into the docking-port frame. */
  readonly contactPort: DockBox;
  /** The Cobra bbox as plain vectors. */
  readonly ship: { readonly min: Vec3; readonly max: Vec3 };
}

/** An unusable docking geometry (non-finite, degenerate or out of range). */
export class DockGeometryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DockGeometryError";
  }
}

function requireFinite(label: string, value: number): number {
  if (!Number.isFinite(value)) {
    throw new DockGeometryError(
      `Wegolite: the docking geometry has a non-finite ${label} (${String(value)}).`,
    );
  }
  return value;
}

function requireDimension(label: string, value: number): number {
  requireFinite(label, value);
  if (value <= 0 || value > DOCK_DIMENSION_MAX) {
    throw new DockGeometryError(
      `Wegolite: the docking geometry ${label} (${String(value)}) must be positive and no greater than ${String(DOCK_DIMENSION_MAX)}.`,
    );
  }
  return value;
}

function requirePositive(label: string, value: number): number {
  requireFinite(label, value);
  if (value <= 0) {
    throw new DockGeometryError(
      `Wegolite: the docking geometry ${label} (${String(value)}) must be positive.`,
    );
  }
  return value;
}

function requireBox(label: string, box: DockBox): DockBox {
  requirePositive(`${label}.halfX`, box.halfX);
  requirePositive(`${label}.halfY`, box.halfY);
  requireFinite(`${label}.zMin`, box.zMin);
  requireFinite(`${label}.zMax`, box.zMax);
  if (!(box.zMin < box.zMax)) {
    throw new DockGeometryError(
      `Wegolite: the docking geometry ${label}.zMin (${String(box.zMin)}) must be less than zMax (${String(box.zMax)}).`,
    );
  }
  return box;
}

function requireShipBox(
  label: string,
  ship: DockShipBox,
): { min: Vec3; max: Vec3 } {
  const { min, max } = ship;
  for (let axis = 0; axis < 3; axis += 1) {
    const low = min[axis];
    const high = max[axis];
    if (low === undefined || high === undefined) {
      throw new DockGeometryError(
        `Wegolite: the docking geometry ${label} is missing axis ${String(axis)}.`,
      );
    }
    requireFinite(`${label}.min[${String(axis)}]`, low);
    requireFinite(`${label}.max[${String(axis)}]`, high);
    if (!(low < high)) {
      throw new DockGeometryError(
        `Wegolite: the docking geometry ${label}.min[${String(axis)}] (${String(low)}) must be less than max[${String(axis)}] (${String(high)}).`,
      );
    }
  }
  return {
    min: { x: min[0], y: min[1], z: min[2] },
    max: { x: max[0], y: max[1], z: max[2] },
  };
}

/**
 * Validate the emitted geometry and precompute the single port-frame contact
 * box that plan 04-03's SAT consumes.
 *
 * @throws {DockGeometryError} naming the first invalid field.
 */
export function createDockGeometry(
  raw: DockPortData,
  dockOffset: number,
): DockGeometry {
  requireDimension("port.width", raw.port.width);
  requireDimension("port.height", raw.port.height);
  requireDimension("port.depth", raw.port.depth);
  requireDimension("corridor.ww", raw.corridor.ww);
  requireDimension("corridor.hh", raw.corridor.hh);

  if (raw.corridor.ww > raw.port.width) {
    throw new DockGeometryError(
      `Wegolite: corridor.ww (${String(raw.corridor.ww)}) exceeds port.width (${String(raw.port.width)}).`,
    );
  }
  if (raw.corridor.hh > raw.port.height) {
    throw new DockGeometryError(
      `Wegolite: corridor.hh (${String(raw.corridor.hh)}) exceeds port.height (${String(raw.port.height)}).`,
    );
  }

  requireFinite("dockOffset", dockOffset);
  if (dockOffset <= 0) {
    throw new DockGeometryError(
      `Wegolite: the docking geometry dockOffset (${String(dockOffset)}) must be positive.`,
    );
  }

  const hull = requireBox("hull", raw.hull);
  const contact = requireBox("contact", raw.contact);
  const ship = requireShipBox("ship", raw.ship);

  const contactPort: DockBox = {
    halfX: contact.halfX,
    halfY: contact.halfY,
    // stationLocal z = -port z - dockOffset, so the interval endpoints swap.
    zMin: -contact.zMax - dockOffset,
    zMax: -contact.zMin - dockOffset,
  };
  if (!(contactPort.zMin < contactPort.zMax)) {
    throw new DockGeometryError(
      `Wegolite: the docking geometry contactPort has an inverted z span (${String(contactPort.zMin)} .. ${String(contactPort.zMax)}).`,
    );
  }

  return {
    port: {
      width: raw.port.width,
      height: raw.port.height,
      depth: raw.port.depth,
    },
    corridor: { ww: raw.corridor.ww, hh: raw.corridor.hh },
    hull,
    contact,
    contactPort,
    ship,
  };
}
