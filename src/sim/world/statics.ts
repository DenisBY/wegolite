// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/** RED skeleton (plan 18-04 Task 1): the types only; GREEN fills the table. */

import { identity } from "../math.js";
import type { Quat, Vec3 } from "../math.js";
import type { StaticHealth } from "./entity.js";
import type { EntityId } from "./ids.js";
import type { SystemLayout } from "./layout.js";

export interface StaticTarget {
  readonly id: EntityId;
  readonly layoutKey: "station" | "witchpoint" | "navBuoy";
  readonly hullKey: string;
  readonly identKey: string;
  readonly healthKey: keyof StaticHealth;
}

export const STATIC_TARGETS: readonly StaticTarget[] = [];

export function staticTargetById(_id: EntityId): StaticTarget | undefined {
  return undefined;
}

export function stationPose(
  layout: SystemLayout,
  _stationAngle: number,
): { readonly position: Vec3; readonly orientation: Quat } {
  return { position: layout.station.position, orientation: identity() };
}
