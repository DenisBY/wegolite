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

/** Why a contact response fired: a straddle or the hull SAT (D-05, D-09). */
export type BounceCause = "hull" | "straddle";

/** The port-frame axis a bounce normal is most aligned with. */
export type BounceAxis = "x" | "y" | "z";

/** Why a Shift+C docking request was refused (D-11/D-12). */
export type DockDeniedReason = "notInstalled" | "outsideAegis";

export type SimEvent =
  | { kind: "launched" }
  | { kind: "launchComplete" }
  | { kind: "torusEngaged"; factor: number }
  | { kind: "torusDisengaged"; reason: TorusDisengageReason }
  | { kind: "massLockChanged"; locked: boolean }
  | { kind: "compassTargetChanged"; target: CompassTarget }
  | { kind: "docked"; via: "manual" | "computer"; clockDelta: number }
  | { kind: "dockDenied"; reason: DockDeniedReason }
  | { kind: "scrape" }
  | {
      kind: "bounce";
      /** The impact speed along the contact normal, in m/s. */
      speed: number;
      cause: BounceCause;
      axis: BounceAxis;
    };
