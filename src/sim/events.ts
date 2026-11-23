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

/**
 * What killed the player (D-04): the kind of the lethal damage record and its
 * culprit. `culprit` is the spec key of an NPC ship or the ident key of a
 * static (a buoy, the station), omitted when unknown, and never an entity id.
 */
export interface PlayerDeathCause {
  readonly damage: "laser" | "scrape";
  readonly culprit?: string;
}

export type SimEvent =
  | { kind: "launched" }
  | { kind: "launchComplete" }
  | { kind: "torusEngaged"; factor: number }
  | { kind: "torusDisengaged"; reason: TorusDisengageReason }
  /**
   * A `j` request refused while mass-locked (a body or a ship). The drive never
   * ran, so this is not a disengage; the app prints Oolite's "Hyperspeed
   * mass-locked." for it. A running drive that mass lock stops prints the same
   * text (`torusDisengaged` with reason "massLock"); an input or toggle stop
   * keeps "Torus disengaged".
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
      /** True for the player's own shot, which the renderer keeps on the ship. */
      playerShot: boolean;
      from: Vec3;
      to: Vec3;
      laserKind: LaserKind;
      /**
       * The NPC shooter's hull key (the role-name style of PROJECT.md row (g),
       * the name `shipDestroyed` and `identLocked` carry), absent on the
       * player's shots. The app maps it to the shot's colour (an authored
       * shipdata `laser_color`, quick 261119-i9g); the sim reads no colour.
       */
      specKey?: string;
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
  /**
   * CBT-05: the held fire key was refused. `overheat` is the facing's laser at
   * or above the cut-out; `noEnergy` is an energy bank at or below the shot's
   * cost (`PlayerEntity.m:5460`, `:5478`). Emitted every tick the key is held
   * and refused, so the app owns any throttling of the wording. Not a reserved
   * kind: it is the refusal side of `laserFired`.
   */
  | { kind: "laserRefused"; reason: "overheat" | "noEnergy" }
  /**
   * INPUT-01, D-04: the ident key (R) engaged the ident system. Emitted on every
   * R press in flight, also when a lock existed and was cleared first (Oolite's
   * `handleButtonIdent`). The app owns the wording.
   */
  | { kind: "identEngaged" }
  /**
   * The ident system locked the ship in the sights of the current view. Carries
   * the spec key only, never an entity id (an id does not outlive its world);
   * the app owns the wording and looks the ship's name up from its own tables.
   */
  | { kind: "identLocked"; specKey: string }
  /**
   * The locked ship left scanner range or the world (`updateTargeting`,
   * `PlayerEntity.m:3699-3712`). Ident stays engaged.
   */
  | { kind: "identLost" }
  /**
   * The untarget key (U) dropped the lock and switched ident off.
   * `wasEngaged` is false for a press with ident already off (Oolite then says
   * "Missiles on safety."), true otherwise ("Ident system deactivated.").
   */
  | { kind: "identOff"; wasEngaged: boolean }
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
  /**
   * Posted by `killPlayer` (`./combat/death.ts`, DEATH-01), once, on the tick
   * the player's energy bank is emptied in flight. `position` is a copy of the
   * player's position and `cause` names what killed it (D-04).
   */
  | { kind: "playerDestroyed"; position: Vec3; cause: PlayerDeathCause }
  | { kind: "podEjected"; pod: EntityId; owner: EntityId }
  | { kind: "proximityWarning"; id: EntityId; other: EntityId }
  | { kind: "energyLow"; id: EntityId }
  // A diagnostic kind, not a reserved presentation kind (FOUND-15, D-04):
  // `stepWorld` emits it once per contained AI fault. See the comment below.
  | { kind: "aiFaulted"; id: EntityId; site: AiFaultSite }
  /**
   * Phase 19, CBT-08: the player's internal-damage roll took one installed item
   * out of service. `key` is the catalogue equipment key. Carries no entity id
   * and no UI text; the app owns the wording and the profile update. Not a
   * reserved kind.
   */
  | { kind: "equipmentDamaged"; key: string }
  /**
   * Phase 19, CBT-08: the player's internal-damage roll destroyed one cargo pod.
   * `commodity` is the commodity key and `amount` the quantity the pod held. No
   * entity id and no UI text; the app owns the wording and the profile update.
   * Not a reserved kind.
   */
  | { kind: "cargoDestroyed"; commodity: string; amount: number };

/**
 * The 15 presentation and audio kinds reserved ahead of their producers so the
 * vocabulary is fixed before Phases 13 and 17 consume it (Pitfall 13). Where
 * each first appears: 8 `entityRemoved` (by `stepWorld`, one per committed
 * removal, ascending); 13 lasers and hits (`laserFired`, `shipHit`); 15
 * destruction (`shipDestroyed`, through `killShip`, and a second group of
 * `entityRemoved` after the ledger's commit, `combat/step.ts`); the player's
 * death (`playerDestroyed`, posted by `killPlayer`); later, scooping
 * and comms (`cargoScooped`, `commsMessage`), spawning
 * (`shipSpawned`), pods (`podEjected`), legal status
 * (`legalStatusChanged`) and missiles and ECM (`missileLaunched`,
 * `missileDetonated`, `ecmFired`); `energyLow` and `proximityWarning` have no
 * producer yet.
 *
 * Phase 13 emits `laserFired` and `shipHit` (`../sim.ts` through
 * `combat/step.ts`); `energyLow` and `proximityWarning` stay unemitted for now
 * (RESEARCH A5). Phase 13 also adds the non-reserved `laserRefused` and the
 * four ident kinds `identEngaged`, `identLocked`, `identLost` and `identOff`.
 * Phase 15 emits `shipDestroyed` and the second `entityRemoved` group.
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
