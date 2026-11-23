// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The ordered event router (Phase 8, D-12 step 8, ARCHITECTURE.md section 4.2).
 *
 * `handleEvent` used to be one switch over every `SimEvent` kind. It is now six
 * gameplay subscribers (`stationFlow`, `damageFlow`, `hudMessages`,
 * `dockFeedback`, `hyperspaceFlow`, `deathFlow`), the world lifecycle subscriber the
 * router builds itself (`worldLifecycle`, plan 08-15) and a router that offers each event to them in
 * `EVENT_SUBSCRIBER_ORDER`. Which subscribers handle which kind is the
 * declarative table `EVENT_KIND_SUBSCRIBER`; the order tests pin it. The
 * `worldLifecycle` subscriber runs right after `stationFlow` on `launched` and
 * `docked`, so every station side effect completes before the world is begun
 * or ended. Every gameplay arm body is the one `handleEvent` carried before the
 * split, with its statement order unchanged.
 *
 * Phase 19 (D-01, D-04, D-07): `equipmentDamaged` and `cargoDestroyed` are
 * routed to `damageFlow` alone. It commits the profile in one atomic update and
 * prints Oolite's HUD message only when its own commit took effect, as
 * `hyperspaceFlow` prints `hyperspaceRefused`: only the subscriber that ran the
 * commit knows whether it did (a refused, repeated or stale event prints
 * nothing, T-19-17). It writes no save (D-11).
 *
 * Phase 20 (DEATH-01, DEATH-06): `playerDestroyed` is routed to `deathFlow`
 * alone, the seventh and last subscriber. The router installs the session latch
 * even when a caller supplies no `deathFlow` (the `worldLifecycle` precedent), so
 * no wiring can drop it: the latch is set synchronously inside the dispatch of
 * the lethal tick's event, before any later step, frame, timer or key handler.
 *
 * Order independence with plan 08-11 (which widens `SimEvent` with reserved
 * kinds in the same wave): the table is keyed to the literal `RoutedKind` union
 * of the 25 routed kinds, never to the full `SimEvent` kind union, and every
 * read of it with a value that is not already a `RoutedKind` goes through
 * `isRoutedKind`. The only mention of the full union's kind type is the
 * `satisfies` check on `ROUTED_EVENT_KINDS`. There is no exhaustive check and no
 * throwing default: an unrouted kind passes through harmlessly.
 *
 * Node-safe: every collaborator arrives through the subscriber deps, so a unit
 * test passes recording doubles.
 */

import type { ExplosionSettings } from "../../render/bodies/explosions.js";
import { MESSAGE_DURATION_SECONDS } from "../../render/hud/messages.js";
import type { MessageQueue } from "../../render/hud/messages.js";
import type {
  HyperspaceRefusal,
  PlayerDeathCause,
  SimEvent,
  WitchspaceBlocker,
} from "../../sim/events.js";
import { poseOf } from "../../sim/flight/state.js";
import {
  applyCargoDestroyed,
  applyEquipmentDamaged,
} from "../../sim/player/damage.js";
import { PLAYER_COLLISION_RADIUS_M } from "../../sim/npc/stats.js";
import type { PlayerProfile } from "../../sim/player/profile.js";
import {
  shouldEmitScrapeMessage,
  shouldEmitThrottledMessage,
} from "../dock-feedback.js";
import type { LaunchSequence } from "../launch-sequence.js";
import { buildGameOverLines, resolveCulpritName } from "../../ui/game-over.js";
import type { StationShell } from "../../ui/station.js";
import type { CombatMessageKind, SessionState } from "./context.js";

/** The dispatch order: each event is offered to the subscribers in this order. */
export const EVENT_SUBSCRIBER_ORDER = [
  "stationFlow",
  "worldLifecycle",
  "damageFlow",
  "hudMessages",
  "dockFeedback",
  "hyperspaceFlow",
  "deathFlow",
] as const;

export type SubscriberName = (typeof EVENT_SUBSCRIBER_ORDER)[number];

/**
 * The subscribers the facade must supply; the router builds `worldLifecycle`
 * and, when none is given, the latch-only `deathFlow`.
 */
export type GameplaySubscriberName = Exclude<
  SubscriberName,
  "worldLifecycle" | "deathFlow"
>;

/**
 * The event kinds the router handles: a literal list, so it does not depend on
 * how many kinds `SimEvent` has. The `satisfies` clause fails typecheck when a
 * listed kind is not a real `SimEvent` kind.
 */
export const ROUTED_EVENT_KINDS = [
  "launched",
  "launchComplete",
  "docked",
  "dockDenied",
  "torusEngaged",
  "torusDisengaged",
  "torusRefused",
  "massLockChanged",
  "bounce",
  "scrape",
  "compassTargetChanged",
  "hyperspaceCountdownStarted",
  "hyperspaceCountdownCancelled",
  "hyperspaceRefused",
  "hyperspaceJumped",
  "laserRefused",
  "identEngaged",
  "identLocked",
  "identLost",
  "identOff",
  "laserFired",
  // D16-21: the explosion, for the presentation subscriber (Phase 15 OD-2).
  "shipDestroyed",
  // Phase 19 (D-01, D-04): internal damage, committed by `damageFlow`.
  "equipmentDamaged",
  "cargoDestroyed",
  // Phase 20 (DEATH-01): the player's death, handled by `deathFlow` alone.
  "playerDestroyed",
] as const satisfies readonly SimEvent["kind"][];

export type RoutedKind = (typeof ROUTED_EVENT_KINDS)[number];

/**
 * The declarative routing table: each routed kind and the ordered tuple of the
 * subscribers that handle it. Typecheck fails when a routed kind has no entry
 * or an entry names an unknown subscriber.
 */
export const EVENT_KIND_SUBSCRIBER: Readonly<
  Record<RoutedKind, readonly SubscriberName[]>
> = {
  launched: ["stationFlow", "worldLifecycle"],
  launchComplete: ["stationFlow"],
  docked: ["stationFlow", "worldLifecycle"],
  dockDenied: ["hudMessages"],
  torusEngaged: ["hudMessages"],
  torusDisengaged: ["hudMessages"],
  torusRefused: ["hudMessages"],
  massLockChanged: ["hudMessages"],
  bounce: ["dockFeedback"],
  scrape: ["dockFeedback"],
  compassTargetChanged: ["hudMessages"],
  hyperspaceCountdownStarted: ["hudMessages"],
  hyperspaceCountdownCancelled: ["hudMessages"],
  hyperspaceRefused: ["hyperspaceFlow"],
  hyperspaceJumped: ["hyperspaceFlow"],
  laserRefused: ["hudMessages"],
  identEngaged: ["hudMessages"],
  identLocked: ["hudMessages"],
  identLost: ["hudMessages"],
  identOff: ["hudMessages"],
  laserFired: ["dockFeedback"],
  shipDestroyed: ["dockFeedback"],
  equipmentDamaged: ["damageFlow"],
  cargoDestroyed: ["damageFlow"],
  playerDestroyed: ["deathFlow"],
};

/** Whether `kind` is one of the routed kinds; a reserved or unknown kind is not. */
export function isRoutedKind(kind: string): kind is RoutedKind {
  return Object.hasOwn(EVENT_KIND_SUBSCRIBER, kind);
}

/** A subscriber handles the kinds it owns and ignores every other event. */
export type EventSubscriber = (event: SimEvent) => void;

/**
 * What the facade passes: the five gameplay subscribers and `deathFlow`.
 * `worldLifecycle` is optional and only for a test that records it; the router
 * builds the real one from `ctx` when it is absent, so the facade never changes.
 * `deathFlow` is optional for the same reason: when absent the router installs
 * the latch-only `createDeathFlow(ctx)`, so the session latch (DEATH-06) can
 * never be dropped by a construction path (T-20-11).
 */
export type EventRouterSubscribers = Readonly<
  Record<GameplaySubscriberName, EventSubscriber>
> & {
  readonly worldLifecycle?: EventSubscriber;
  readonly deathFlow?: EventSubscriber;
};

/** What the station subscriber calls outside the session context. */
export interface StationFlowDeps {
  readonly launchSequence: Pick<LaunchSequence, "reset" | "markSeen">;
  readonly docked: Pick<StationShell, "show" | "hide">;
  readonly hudCanvas: Pick<HTMLCanvasElement, "hidden">;
  readonly messages: Pick<MessageQueue, "enqueue">;
  readonly syncStationNav: () => void;
  readonly syncEconomyProbe: () => void;
  readonly persistSettings: () => void;
  readonly ensureSelection: () => void;
  readonly renderStation: () => void;
  readonly autosave: () => void;
  /**
   * Close the galactic chart (restoring its saved input context). A dock that
   * completes behind an open chart closes it first (WORLD-11).
   */
  readonly closeChart: () => void;
}

/** launched, launchComplete and docked: the station and launch transitions. */
export function createStationFlow(
  ctx: SessionState,
  deps: StationFlowDeps,
): EventSubscriber {
  const {
    launchSequence,
    docked,
    hudCanvas,
    messages,
    syncStationNav,
    syncEconomyProbe,
    persistSettings,
    ensureSelection,
    renderStation,
    autosave,
    closeChart,
  } = deps;
  return (event) => {
    switch (event.kind) {
      case "launched":
        launchSequence.reset();
        ctx.station.stationScreen = "home";
        ctx.station.stationPending = null;
        ctx.station.stationNotice = "";
        ctx.station.stationMessage = "";
        ctx.station.stationPage = 1;
        ctx.runtime.input?.setContext("flight");
        docked.hide();
        syncStationNav();
        hudCanvas.hidden = false;
        // Quick 261118-os8: collapse the interpolation window onto the launch
        // pose, as the "docked" case does. The docked pose is the untwisted
        // station base orientation and lacks the launch twist, so frames drawn
        // after the launch step would otherwise show the twist half applied.
        if (ctx.core.state !== undefined) {
          ctx.core.previousPose = poseOf(ctx.core.state);
        }
        messages.enqueue("Launching — stand by", MESSAGE_DURATION_SECONDS);
        // D-17: no write here. The pre-launch anchor was taken in `frame()`
        // while the state was still docked.
        syncEconomyProbe();
        break;
      case "launchComplete":
        launchSequence.markSeen();
        ctx.core.launchSeen = true;
        if (
          ctx.runtime.settings !== undefined &&
          !ctx.runtime.settings.launchSeen
        ) {
          ctx.runtime.settings.launchSeen = true;
          persistSettings();
        }
        messages.enqueue(
          "Arrows pitch and roll · W and S change speed",
          MESSAGE_DURATION_SECONDS,
        );
        break;
      case "docked": {
        // A dock behind the chart (WORLD-11): the simulation keeps running
        // behind an open chart, so the dock can complete under it. Close the
        // chart first: it restores its saved input context, then the station
        // sets `dockHome` below, so the station shell never shows beneath an
        // open chart and the final input context is the docked one.
        if (ctx.chart.chartOpen) closeChart();
        // D-12: the exact delta is the event's, never a wall/frame comparison.
        ctx.core.lastDockClockDelta = event.clockDelta;
        launchSequence.reset();
        ctx.station.stationScreen = "home";
        ctx.station.stationPending = null;
        ctx.station.stationNotice = "";
        ctx.station.stationMessage = "";
        ctx.station.stationPage = 1;
        ctx.runtime.input?.setContext("dockHome");
        docked.show(ctx.core.system.name);
        ensureSelection();
        renderStation();
        syncStationNav();
        if (event.via === "computer") {
          // Oolite's docking-computer messages last 4.5 s
          // (PlayerEntityControls.m:4754).
          messages.enqueue("Docking computers engaged", 4.5);
          ctx.station.stationMessage = "Docking computers engaged";
          renderStation();
        }
        // D-09/D-15: stop any held input and collapse the interpolation window
        // onto the docked pose so the camera does not smear across the teleport.
        ctx.runtime.input?.clearAll();
        const currentState = ctx.core.state;
        if (currentState !== undefined) {
          const dockedPose = poseOf(currentState);
          ctx.core.previousPose = dockedPose;
          ctx.core.currentPose = dockedPose;
        }
        // D-17: both manual and computer docking anchor once, after the station
        // screen, selection and docked pose are ready. No other path writes on
        // docking.
        autosave();
        break;
      }
    }
  };
}

/**
 * The ident lock message, Oolite's `ident-locked` string with its `[name]`
 * token (`descriptions.plist:527`). The one place the wording lives, so the
 * decision below is a one-line change.
 *
 * D-03: owner-confirmed 2026-11-15 as Oolite (name only); the literal form is
 * "Ident system locked onto [name] ([class])." and was declined
 * (Key Decisions, plan 13-15). `formatIdentLocked` already renders `[class]`.
 */
export const IDENT_LOCKED_TEMPLATE = "Ident system locked onto [name].";

/** The fields of an NPC record the lock message reads. */
export interface IdentRecord {
  readonly name: string;
  /** The compiled scan class, such as `CLASS_POLICE`. */
  readonly scanClass: string;
}

/**
 * Fill the lock template: `[name]` is the record's name and `[class]` its scan
 * class without the `CLASS_` prefix, lowercased (`CLASS_POLICE` is "police").
 */
export function formatIdentLocked(
  template: string,
  record: IdentRecord,
): string {
  const scanClass = record.scanClass.replace(/^CLASS_/, "").toLowerCase();
  return template
    .split("[name]")
    .join(record.name)
    .split("[class]")
    .join(scanClass);
}

/**
 * The display name of an ident lock's spec key (plan 18-06, CBT-17): the NPC
 * traffic catalogue's name, else the compiled target name (the station, the
 * buoys, pods and plates, from the static artifact), else the key itself.
 * Every name comes from compiled content; with traffic off neither table is
 * loaded and the key is the name.
 */
export function identName(
  specKey: string,
  catalogue:
    readonly { readonly key: string; readonly name: string }[] | undefined,
  targetNames: ReadonlyMap<string, string> | undefined,
): string {
  return (
    catalogue?.find((record) => record.key === specKey)?.name ??
    targetNames?.get(specKey) ??
    specKey
  );
}

/** What the HUD message subscriber calls outside the session context. */
export interface HudMessagesDeps {
  readonly messages: Pick<MessageQueue, "enqueue" | "clearPrevious">;
}

/**
 * The fixed HUD messages the session prints for a sim event, each with
 * Oolite's duration where Oolite has the message and `MESSAGE_DURATION_SECONDS`
 * otherwise. `ctx` supplies the flight clock and the per-kind one-second gate
 * of the weapon and ident messages, and the NPC records the lock message names
 * a ship from.
 */
export function createHudMessages(
  deps: HudMessagesDeps,
  ctx: SessionState,
): EventSubscriber {
  const { messages } = deps;
  /**
   * Post `text` for `seconds` for `kind` unless that kind posted within the
   * last simulated second (OQ5, Pitfall 9, T-13-25). Every message shows at
   * once on its own row, so a reply to a key is never delayed.
   */
  const throttled = (
    kind: CombatMessageKind,
    seconds: number,
    text: () => string,
  ): void => {
    const now = ctx.core.state?.flightTime ?? 0;
    if (!shouldEmitThrottledMessage(ctx.core.lastCombatMessageTimes[kind], now))
      return;
    messages.enqueue(text(), seconds);
    ctx.core.lastCombatMessageTimes[kind] = now;
  };
  return (event) => {
    switch (event.kind) {
      case "dockDenied":
        // D-11: fixed app-owned copy, for Oolite's 4.5 s of a docking
        // computer message (PlayerEntityControls.m:4754).
        messages.enqueue(
          event.reason === "notInstalled"
            ? "No docking computer fitted"
            : "Too far from the station to engage docking computer",
          4.5,
        );
        break;
      case "torusEngaged":
        messages.enqueue(
          `Torus engaged at ${event.factor.toFixed(1)}×`,
          MESSAGE_DURATION_SECONDS,
        );
        break;
      case "torusDisengaged":
        // Oolite descriptions.plist "jump-mass-locked", shown for 4.5 s by
        // PlayerEntity.m:2757 when mass lock stops a running drive (IN-01);
        // an input or toggle stop keeps "Torus disengaged".
        if (event.reason === "massLock") {
          messages.enqueue("Hyperspeed mass-locked.", 4.5);
        } else {
          messages.enqueue("Torus disengaged", MESSAGE_DURATION_SECONDS);
        }
        break;
      case "torusRefused":
        // Oolite descriptions.plist "jump-mass-locked": a refused request, not
        // a drive that stopped, shown for 1.5 s (PlayerEntityControls.m:1172).
        // Oolite posts nothing when a mass lock begins.
        messages.enqueue("Hyperspeed mass-locked.", 1.5);
        break;
      case "compassTargetChanged":
        messages.enqueue(
          `Compass target: ${event.target}`,
          MESSAGE_DURATION_SECONDS,
        );
        break;
      case "hyperspaceCountdownStarted":
        // `beginWitchspaceCountdown:` clears the last message, then
        // `displayCountdownMessage` writes the countdown into the bottom row
        // without scrolling (PlayerEntityControls.m:834-839,
        // Universe.m:6258-6267). Nothing is posted here: the render driver
        // writes the countdown into the queue on every frame
        // (`MessageQueue.displayCountdown`, quick task 261118-cyn).
        messages.clearPrevious();
        break;
      case "hyperspaceCountdownCancelled":
        // `cancelWitchspaceCountdown` clears the last message
        // (PlayerEntityControls.m:853-861), then witch-user-abort is posted
        // for 3 s (PlayerEntityControls.m:1520-1528).
        messages.clearPrevious();
        messages.enqueue("Hyperspace countdown cancelled", 3);
        break;
      case "laserRefused":
        // CBT-05: the sim emits one refusal per tick of a held fire key
        // (descriptions.plist:524, 525). The two reasons gate independently;
        // both last 3 s (PlayerEntity.m:5462, 5479).
        if (event.reason === "overheat") {
          throttled("overheat", 3, () => "Weapon system overheated.");
        } else {
          throttled(
            "noEnergy",
            3,
            () => "Weapon system inactive (no energy left).",
          );
        }
        break;
      case "identEngaged":
        // ident-on lasts 2 s (PlayerEntityControls.m:4768).
        throttled("identEngaged", 2, () => "Ident system active.");
        break;
      case "identLocked":
        // ident-locked-onto-target lasts 4.5 s (PlayerEntity.m:10917).
        throttled("identLocked", 4.5, () => {
          // The event carries the spec key only; the name comes from the
          // session's compiled catalogues (`identName`) and the class from the
          // NPC record, each falling back to the key (never an id).
          const catalogue = ctx.core.npcTraffic?.catalogue;
          const ship = catalogue?.find(
            (candidate) => candidate.key === event.specKey,
          );
          return formatIdentLocked(IDENT_LOCKED_TEMPLATE, {
            name: identName(event.specKey, catalogue, ctx.core.targetNames),
            scanClass: ship?.scanClass ?? event.specKey,
          });
        });
        break;
      case "identLost":
        // target-lost lasts 3 s (PlayerEntity.m:2838).
        throttled("identLost", 3, () => "Target lost.");
        break;
      case "identOff":
        // ident-off and missile-safe last 2 s (PlayerEntityControls.m:1412,
        // 1415).
        throttled("identOff", 2, () =>
          event.wasEngaged
            ? "Ident system deactivated."
            : "Missiles on safety.",
        );
        break;
    }
  };
}

/** D-08 copy is app-owned and fixed; the sim event carries facts only. */
export function bounceMessage(event: {
  cause: "hull" | "straddle";
  axis: "x" | "y" | "z";
}): string {
  if (event.cause === "straddle") {
    return "Too wide for the slot - roll 90 degrees to match the opening";
  }
  if (event.axis === "x") {
    return "Hull contact - roll 90 degrees and line up with the slot";
  }
  return "Hull contact - pull away and line up with the slot";
}

/** What the dock-feedback subscriber calls outside the session context. */
export interface DockFeedbackDeps {
  readonly messages: Pick<MessageQueue, "enqueue">;
}

/**
 * bounce and scrape (the dock-feedback envelopes and their messages),
 * laserFired (CBT-05) and shipDestroyed (WORLD-17, D16-21): the session's
 * presentation-feedback subscriber, so the pinned subscriber order is
 * unchanged. A shot goes to the scene's shot layer as positions, a laser kind
 * and, for an NPC hull with an authored shipdata `laser_color`, its colour; the
 * shooter id is never stored. An explosion goes to the scene's
 * explosion layer as a position and a radius only: the arm never reads the
 * destroyed ship's id or its killer, and writes nothing to the world.
 */
export function createDockFeedbackFlow(
  ctx: SessionState,
  deps: DockFeedbackDeps,
): EventSubscriber {
  const { messages } = deps;
  return (event) => {
    switch (event.kind) {
      case "laserFired":
        // Read the live scene at call time (G-8): a jump replaces it.
        ctx.core.scene?.shots.add(
          event.from,
          event.to,
          event.laserKind,
          ctx.core.state?.flightTime ?? 0,
          // The player's own shots ride with the ship, as in Oolite.
          event.playerShot && ctx.core.state !== undefined
            ? {
                position: ctx.core.state.position,
                orientation: ctx.core.state.orientation,
              }
            : undefined,
          // An NPC hull's authored laser_color replaces its weapon's colour
          // (Oolite, ShipEntity.m:6469-6474). Read at call time (G-8): traffic
          // off has no map, so a shot keeps its laser's colour. The key is the
          // hull's catalogue name, never an entity id.
          event.specKey === undefined
            ? undefined
            : ctx.core.npcTraffic?.laserColors.get(event.specKey),
        );
        break;
      case "shipDestroyed": {
        // Read the live scene and the compiled setting at call time (G-8);
        // traffic off has no setting, so nothing is drawn.
        const setting = ctx.core.npcTraffic?.explosion;
        const scene = ctx.core.scene;
        if (scene !== undefined && setting !== undefined) {
          scene.explosions.add(
            event.position,
            event.radius,
            setting,
            ctx.core.state?.flightTime ?? 0,
          );
        }
        break;
      }
      case "bounce":
        ctx.core.dockFeedback.trigger(
          "bounce",
          ctx.core.state?.flightTime ?? 0,
        );
        messages.enqueue(bounceMessage(event), MESSAGE_DURATION_SECONDS);
        break;
      case "scrape": {
        // Pitfall 8: the sim emits one scrape per correcting tick (120 Hz);
        // the message line is throttled to one per simulated second.
        const now = ctx.core.state?.flightTime ?? 0;
        ctx.core.dockFeedback.trigger("scrape", now);
        if (shouldEmitScrapeMessage(ctx.core.lastScrapeMessageTime, now)) {
          messages.enqueue(
            "Scrape - ease toward the centre of the slot",
            MESSAGE_DURATION_SECONDS,
          );
          ctx.core.lastScrapeMessageTime = now;
        }
        break;
      }
    }
  };
}

/** What the hyperspace subscriber calls outside the session context. */
export interface HyperspaceFlowDeps {
  readonly messages: Pick<MessageQueue, "enqueue" | "clearPrevious">;
  readonly refusalCopy: (
    reason: HyperspaceRefusal,
    blocker?: WitchspaceBlocker,
  ) => string;
  readonly handleHyperspaceJumped: (event: {
    destinationId: string;
    clockDeltaSeconds: number;
    fuelCost: number;
  }) => void;
}

/** hyperspaceRefused and hyperspaceJumped: the refusal copy and the arrival. */
export function createHyperspaceFlow(
  ctx: SessionState,
  deps: HyperspaceFlowDeps,
): EventSubscriber {
  const { messages, refusalCopy, handleHyperspaceJumped } = deps;
  return (event) => {
    switch (event.kind) {
      case "hyperspaceRefused":
        ctx.core.lastRefusal = { reason: event.reason };
        // witchJumpChecklist clears the last message and posts every refusal
        // for 4.5 s (PlayerEntity.m:6552-6600).
        messages.clearPrevious();
        messages.enqueue(refusalCopy(event.reason, event.blocker), 4.5);
        break;
      case "hyperspaceJumped":
        handleHyperspaceJumped(event);
        break;
    }
  };
}

/**
 * Oolite's `"@-damaged"` (`descriptions.plist:895`): the message for an item
 * the internal-damage roll damaged. `%@` is the equipment's display name.
 */
export const EQUIPMENT_DAMAGED_TEMPLATE = "%@ damaged.";

/**
 * Oolite's `"@-destroyed"` (`descriptions.plist:896`): the message for a cargo
 * pod the internal-damage roll destroyed. `%@` is the commodity's display name.
 */
export const CARGO_DESTROYED_TEMPLATE = "%@ destroyed.";

/** Fill a damage template: `%@` is replaced by `name`. */
export function formatDamageMessage(template: string, name: string): string {
  return template.split("%@").join(name);
}

/** What the damage subscriber calls outside the session context. */
export interface DamageFlowDeps {
  /** Replace the live profile; returns false when nothing was committed. */
  readonly commitProfile: (next: PlayerProfile) => boolean;
  readonly messages: Pick<MessageQueue, "enqueue" | "clearPrevious">;
}

/**
 * equipmentDamaged and cargoDestroyed (Phase 19, D-01, D-04, D-07): apply the
 * pure profile operation, commit it once, and print Oolite's message only when
 * `commitProfile` returned true. A refused operation returns the same profile,
 * so nothing is committed and nothing is printed (T-19-17), as Oolite prints
 * each message only for the change it makes (`PlayerEntity.m:6105-6113`,
 * `6155-6171`). Each message clears the previous one first and lasts 4.5 s
 * (`PlayerEntity.m:6110-6111, 6164-6171`). No save is written here (D-11): the
 * damage becomes durable at the existing triggers.
 */
export function createDamageFlow(
  ctx: SessionState,
  deps: DamageFlowDeps,
): EventSubscriber {
  const { commitProfile, messages } = deps;
  return (event) => {
    switch (event.kind) {
      case "equipmentDamaged": {
        // descriptions.plist:895; PlayerEntity.m:6155-6171.
        if (
          !commitProfile(applyEquipmentDamaged(ctx.core.profile, event.key))
        ) {
          return;
        }
        const name =
          ctx.core.equipmentCatalogue?.find(
            (record) => record.key === event.key,
          )?.name ?? event.key;
        messages.clearPrevious();
        messages.enqueue(
          formatDamageMessage(EQUIPMENT_DAMAGED_TEMPLATE, name),
          4.5,
        );
        break;
      }
      case "cargoDestroyed": {
        // descriptions.plist:896; PlayerEntity.m:6105-6113: Oolite prints the
        // message for the pod it removes, so a refused loss (no such goods
        // held, or more than held) prints nothing.
        if (
          !commitProfile(
            applyCargoDestroyed(
              ctx.core.profile,
              event.commodity,
              event.amount,
            ),
          )
        ) {
          return;
        }
        const name =
          ctx.core.commodities?.find((record) => record.key === event.commodity)
            ?.name ?? event.commodity;
        messages.clearPrevious();
        messages.enqueue(
          formatDamageMessage(CARGO_DESTROYED_TEMPLATE, name),
          4.5,
        );
        break;
      }
    }
  };
}

export interface EventRouter {
  /** Offer one event to every subscriber that handles its kind, in order. */
  dispatch(event: SimEvent): void;
}

/**
 * The world lifecycle subscriber (plan 08-15; D-02): `launched` begins a world
 * from the live market seed, `docked` ends it. It tests the kind with `if`, not
 * a `case` label, and reads the lifecycle and the seed from `ctx` at call time.
 */
export function createWorldLifecycleFlow(ctx: SessionState): EventSubscriber {
  return (event) => {
    if (event.kind === "launched") {
      const seed = ctx.core.marketSeed;
      if (seed !== undefined) ctx.core.worldLifecycle?.begin(seed);
    } else if (event.kind === "docked") {
      ctx.core.worldLifecycle?.end();
    }
  };
}

/**
 * Latch the session as game over (DEATH-06, D-12). Called synchronously from
 * the `playerDestroyed` dispatch, so no later step, frame, timer or key handler
 * can run before it. Idempotent: it returns false and changes nothing when the
 * session is already latched (the cause is the first event's). It resets the
 * loop accumulator and clears held input as the first shutdown steps; the rest
 * of the death flow (overlays, HUD, explosion) is `createDeathFlow`'s.
 */
export function latchGameOver(
  ctx: SessionState,
  cause: PlayerDeathCause,
): boolean {
  if (ctx.runtime.gameOver) return false;
  ctx.runtime.gameOver = true;
  ctx.runtime.gameOverSeconds = 0;
  ctx.runtime.gameOverCause = cause;
  ctx.runtime.loop?.reset();
  ctx.runtime.input?.clearAll();
  return true;
}

/**
 * How many bursts each of Oolite's two explosion loops adds for the player:
 * the `becomeLargeExplosion:4.0` argument of `getDestroyedBy:`
 * (`src/Core/Entities/PlayerEntity.m:6208` at the pin `7437f22`), read as
 * Oolite reads it. 4.0 sizes nothing: each of the two loops runs while the
 * remainder is above 0.5, so 4.0 adds four small bursts, fast sparks of 100 to
 * 400 m/s for 1.5 s, and four big ones, slow clouds of `1 + r/2` to four times
 * that for 1.0 s growing from `2r` (`src/Core/Entities/ShipEntity.m:8308-8320`:
 * the small-burst loop at 8311-8314, the big-burst loop at 8317-8320;
 * `src/Core/Entities/OOParticleSystem.m:244-353`), each burst sized from the
 * collision radius `r` itself. Wegolite draws each burst as one Phase 16 cloud
 * at that radius whose kind carries Oolite's speed range, lifetime and start
 * size (D-01a, `ExplosionAddOptions.kind`); the particle form is the one
 * divergence the owner kept (D-01).
 */
export const PLAYER_EXPLOSION_FACTOR = 4;

/**
 * The setting the player's explosion draws with: the compiled
 * `oolite-default-ship-explosion` record of `src/content/generated/explosions.json`
 * without its key, the setting every compiled hull explodes with (D16-22). It
 * is restated like `DEFAULT_SHIP_EXPLOSION_KEY` (`src/app/session/traffic.ts`)
 * and pinned to the generated file by a unit test. It is not loaded: the
 * explosion catalogue joins the boot load only with traffic on, a traffic-off
 * cold start must request no explosion chunk (`tests/e2e/budget.spec.ts`,
 * Phase 16 criterion 4), and a load started at the death would delay the
 * explosion or lose it on a failed fetch. It is defensive today (the
 * orchestrator's decision of 2026-11-22, not an owner decision): no lethal
 * record exists with traffic off, but the constant keeps the death flow
 * independent of the traffic setting for any later damage source.
 */
export const PLAYER_EXPLOSION_SETTINGS: ExplosionSettings = Object.freeze({
  alpha: 0.8500000238418579,
  brightness: 1,
  colorOrder: "rgb",
  count: 25,
  duration: 1.5,
  growthRate: 1.5,
  size: 2.5,
  spread: 1,
  texture: "oolite-particle-cloud2.png",
});

/** What the death flow calls outside the session context. */
export interface DeathFlowDeps {
  /** Close the galactic chart (a no-op when closed; restores its saved context). */
  readonly closeChart: () => void;
  /** Close the F2 screen (a no-op when closed; restores its saved context). */
  readonly closeSaveScreen: () => void;
  readonly launchSequence: Pick<LaunchSequence, "reset">;
  readonly hudCanvas: Pick<HTMLCanvasElement, "hidden">;
  readonly messages: Pick<MessageQueue, "clear">;
}

/**
 * playerDestroyed (DEATH-01, DEATH-06, D-01, D-08): the session's one death
 * subscriber. It latches the session first; everything else the death does
 * follows only a successful latch, so a second event repeats nothing. Without
 * `deps` it is the latch alone (the router's default, T-20-11). With them it
 * also shuts the session down around the frozen world: it closes an open chart
 * and an open F2 screen (both restore a saved context, so the `gameOver`
 * context is set after them), clears the HUD message queue (Oolite's "No
 * messages for the dead"), resets the launch sequence, hides the HUD canvas and
 * adds the player's explosion to the live scene.
 */
export function createDeathFlow(
  ctx: SessionState,
  deps?: DeathFlowDeps,
): EventSubscriber {
  return (event) => {
    if (event.kind !== "playerDestroyed") return;
    if (!latchGameOver(ctx, event.cause)) return;
    if (deps === undefined) return;
    deps.closeChart();
    deps.closeSaveScreen();
    ctx.runtime.input?.setContext("gameOver");
    deps.messages.clear();
    deps.launchSequence.reset();
    deps.hudCanvas.hidden = true;
    // DEATH-01, D-02, D-03, D-05: the four lines in the dispatch that latched.
    // The culprit's name comes from compiled content only (never the key); a
    // harness without the DOM has no overlay and shows nothing.
    ctx.runtime.gameOverOverlay?.show(
      buildGameOverLines(
        event.cause,
        resolveCulpritName(
          event.cause.culprit,
          ctx.core.npcTraffic?.catalogue,
          ctx.core.targetNames,
        ),
        ctx.core.profile.credits,
        ctx.core.labels?.rating[0] ?? "",
      ),
    );
    // Read the live scene at call time (G-8); with no scene nothing is drawn.
    const scene = ctx.core.scene;
    if (scene === undefined) return;
    const flightTime = ctx.core.state?.flightTime ?? 0;
    // Oolite's two loops (becomeLargeExplosion:4.0): the first
    // `PLAYER_EXPLOSION_FACTOR` adds are small bursts, the next as many big
    // ones, each with its own seed variant (1 to 8). One flash for the whole
    // explosion, on the first add (D-01b, DIV-9); `flash` is passed on every
    // add, because an absent `flash` defaults to true.
    for (let k = 1; k <= 2 * PLAYER_EXPLOSION_FACTOR; k += 1) {
      scene.explosions.add(
        event.position,
        PLAYER_COLLISION_RADIUS_M,
        PLAYER_EXPLOSION_SETTINGS,
        flightTime,
        {
          kind: k <= PLAYER_EXPLOSION_FACTOR ? "small" : "big",
          variant: k,
          flash: k === 1,
        },
      );
    }
  };
}

/**
 * Build the router. `ctx` is required, never optional: the `worldLifecycle`
 * subscriber is wired here from `ctx.core.worldLifecycle` and
 * `ctx.core.marketSeed`, and the latch-only `deathFlow` is installed when none
 * is supplied, so the facade never has to change for either.
 */
export function createEventRouter(
  ctx: SessionState,
  subscribers: EventRouterSubscribers,
): EventRouter {
  const all: Readonly<Record<SubscriberName, EventSubscriber>> = {
    ...subscribers,
    worldLifecycle: subscribers.worldLifecycle ?? createWorldLifecycleFlow(ctx),
    deathFlow: subscribers.deathFlow ?? createDeathFlow(ctx),
  };
  return {
    dispatch(event) {
      // An unrouted kind (a reserved or unknown one) is ignored, never thrown.
      const kind: string = event.kind;
      if (!isRoutedKind(kind)) return;
      const handlers = EVENT_KIND_SUBSCRIBER[kind];
      for (const name of EVENT_SUBSCRIBER_ORDER) {
        if (handlers.includes(name)) all[name](event);
      }
    },
  };
}
