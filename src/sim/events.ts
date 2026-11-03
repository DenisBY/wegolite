// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The event boundary (Pattern 4).
 *
 * The simulation reports what happened; the app owns the wording. No UI copy
 * lives here, and no event carries a string the HUD would print verbatim.
 */

import type { CompassTarget } from "./flight/state.js";

export type TorusDisengageReason = "input" | "massLock" | "toggle";

export type SimEvent =
  | { kind: "launched" }
  | { kind: "launchComplete" }
  | { kind: "torusEngaged"; factor: number }
  | { kind: "torusDisengaged"; reason: TorusDisengageReason }
  | { kind: "massLockChanged"; locked: boolean }
  | { kind: "compassTargetChanged"; target: CompassTarget };
