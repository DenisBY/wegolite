// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/** RED stub of plan 18-09: the port of `ShipEntity.m:1878-1942` follows. */

import type { Quat, Vec3 } from "../math.js";
import type { HullData } from "./hit.js";

export interface HullPose {
  readonly position: Vec3;
  readonly orientation: Quat;
}

export type ContactPart =
  | { readonly kind: "hull" }
  | { readonly kind: "subentity"; readonly index: number };

export function doOctreesCollide(
  prime: Pick<HullData, "octree" | "subentities">,
  primePose: HullPose,
  other: Pick<HullData, "octree" | "subentities">,
  otherPose: HullPose,
  otherDetached?: ReadonlySet<number>,
  primeDetached?: ReadonlySet<number>,
): ContactPart | null {
  void prime;
  void primePose;
  void other;
  void otherPose;
  void otherDetached;
  void primeDetached;
  return null;
}
