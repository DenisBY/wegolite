// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The event boundary (Pattern 4).
 *
 * The simulation reports what happened; the app owns the wording. No UI copy
 * lives here, and no event carries a string the HUD would print verbatim.
 */

import type { CompassTarget } from "./flight/state.js";
import type {
  HyperspaceRefusal,
  WitchspaceBlocker,
} from "./hyperspace/countdown.js";
import type { Vec3 } from "./math.js";
import type { EntityId } from "./world/ids.js";

export type { HyperspaceRefusal, WitchspaceBlocker };

export type TorusDisengageReason = "input" | "massLock" | "toggle";

/** Why a contact response fired: a straddle or the hull SAT (D-05, D-09). */
export type BounceCause = "hull" | "straddle";

/** The port-frame axis a bounce normal is most aligned with. */
export type BounceAxis = "x" | "y" | "z";

/** Why a Shift+C docking request was refused (D-11/D-12). */
export type DockDeniedReason = "notInstalled" | "outsideAegis";

/** Oolite's five laser weapon types (ShipEntity.h:152-162); the Thargoid laser is NPC-only. */
export type LaserKind = "pulse" | "beam" | "military" | "mining" | "thargoid";

/** Where a contained AI fault happened: a `think` call or an `onEvent` delivery. */
export type AiFaultSite = "think" | "event";

/** The player's legal standing, reserved for the legal-status phase. */
export type LegalStatus = "clean" | "offender" | "fugitive";

export type SimEvent =
  | { kind: "launched" }
  | { kind: "launchComplete" }
  | { kind: "torusEngaged"; factor: number }
  | { kind: "torusDisengaged"; reason: TorusDisengageReason }
  /**
   * A `j` request refused while mass-locked (a body or a ship). The drive never
   * ran, so this is not a disengage; the app prints Oolite's "Hyperspeed
   * mass-locked." for it and keeps "Torus disengaged" for a running drive.
   */
  | { kind: "torusRefused"; reason: "massLock" }
  | { kind: "massLockChanged"; locked: boolean }
  | { kind: "compassTargetChanged"; target: CompassTarget }
  | { kind: "docked"; via: "manual" | "computer"; clockDelta: number }
  | { kind: "dockDenied"; reason: DockDeniedReason }
  | {
      kind: "hyperspaceCountdownStarted";
      destinationId: string;
      fuelCost: number;
      countdownSteps: number;
    }
  | { kind: "hyperspaceCountdownCancelled"; destinationId: string }
  | {
      kind: "hyperspaceJumped";
      destinationId: string;
      /** Exactly `576 * dist^2`; the app adds it to the profile's clock. */
      clockDeltaSeconds: number;
      /** Exact integer fuel to deduct from the profile (never a float). */
      fuelCost: number;
    }
  | {
      kind: "hyperspaceRefused";
      reason: HyperspaceRefusal;
      /** Present exactly when `reason` is `blocked`: what blocked the jump. */
      blocker?: WitchspaceBlocker;
    }
  | { kind: "scrape" }
  | {
      kind: "bounce";
      /** The impact speed along the contact normal, in m/s. */
      speed: number;
      cause: BounceCause;
      axis: BounceAxis;
    }
  // Reserved presentation and audio kinds (ARCHITECTURE section 7.6; see the
  // RESERVED_EVENT_KINDS comment below for who emits what and when).
  | {
      kind: "laserFired";
      shooter: EntityId;
      from: Vec3;
      to: Vec3;
      laserKind: LaserKind;
    }
  | {
      kind: "shipHit";
      target: EntityId;
      source: EntityId;
      /** The damage the hit delivered. */
      amount: number;
      /** True when the struck shield absorbed all of it (PlayerEntity.m:5639-5668). */
      shield: boolean;
    }
  | {
      kind: "shipDestroyed";
      id: EntityId;
      position: Vec3;
      radius: number;
      specKey: string;
      /** `NO_ENTITY` when nothing is credited. */
      killer: EntityId;
    }
  | { kind: "entityRemoved"; id: EntityId }
  | {
      kind: "commsMessage";
      from: EntityId;
      /** A comms string-table key; the app owns the wording. */
      key: string;
      /** String substitutions for the key; empty when there are none. */
      params: Readonly<Record<string, string>>;
    }
  | {
      kind: "missileLaunched";
      missile: EntityId;
      shooter: EntityId;
      target: EntityId;
    }
  | { kind: "missileDetonated"; missile: EntityId; position: Vec3 }
  | { kind: "ecmFired"; source: EntityId; position: Vec3 }
  | {
      kind: "cargoScooped";
      scooper: EntityId;
      commodity: string;
      amount: number;
    }
  | { kind: "shipSpawned"; id: EntityId; specKey: string }
  | { kind: "legalStatusChanged"; from: LegalStatus; to: LegalStatus }
  | { kind: "playerDestroyed"; position: Vec3 }
  | { kind: "podEjected"; pod: EntityId; owner: EntityId }
  | { kind: "proximityWarning"; id: EntityId; other: EntityId }
  | { kind: "energyLow"; id: EntityId }
  // A diagnostic kind, not a reserved presentation kind (FOUND-15, D-04):
  // `stepWorld` emits it once per contained AI fault. See the comment below.
  | { kind: "aiFaulted"; id: EntityId; site: AiFaultSite };

/**
 * The 15 presentation and audio kinds reserved ahead of their producers so the
 * vocabulary is fixed before Phases 13 and 17 consume it (Pitfall 13). Only
 * `entityRemoved` is emitted in Phase 8 (by `stepWorld`, one per committed
 * removal, ascending). The others first appear in: 13 lasers and hits
 * (`laserFired`, `shipHit`, `energyLow`, `proximityWarning`), 15 destruction
 * and scooping (`shipDestroyed`, `shipSpawned`, `playerDestroyed`,
 * `cargoScooped`, `commsMessage`), 16 pods (`podEjected`), 19 legal status
 * (`legalStatusChanged`), 21 missiles and ECM (`missileLaunched`,
 * `missileDetonated`, `ecmFired`).
 *
 * The field names follow ARCHITECTURE section 7.6, with the one deviation
 * recorded as PROJECT.md Key Decisions row (g): section 7.6's laser `kind` is
 * `laserKind` here because `kind` is the SimEvent discriminant.
 *
 * Id lifetime: an EntityId in a payload is valid only for the world and tick
 * that emitted the event. A consumer reacts to it within that tick and never
 * stores it, because the next world reissues 101 for a different entity
 * (per-world id scope, CONTEXT D-06 as amended 2026-11-12).
 */
export const RESERVED_EVENT_KINDS = [
  "laserFired",
  "shipHit",
  "shipDestroyed",
  "entityRemoved",
  "commsMessage",
  "missileLaunched",
  "missileDetonated",
  "ecmFired",
  "cargoScooped",
  "shipSpawned",
  "legalStatusChanged",
  "playerDestroyed",
  "podEjected",
  "proximityWarning",
  "energyLow",
] as const satisfies readonly SimEvent["kind"][];

/*
 * `aiFaulted` (FOUND-15, D-04) is a diagnostic kind and is not part of
 * `RESERVED_EVENT_KINDS` (the 15-kind pin stays). `stepWorld` emits one per
 * fault: an AI module that throws in `think` or `onEvent` is replaced by nullAI
 * (`entity.ai = null`) and the entity stays in the world. The app router does
 * not route it (an unrouted kind is ignored). Its `id` follows the id-lifetime
 * rule above: valid only for the world and tick that emitted it. It carries no
 * exception text, only the entity id and the call site.
 */
