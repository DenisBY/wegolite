// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The ordered event router (Phase 8, D-12 step 8, ARCHITECTURE.md section 4.2).
 *
 * `handleEvent` used to be one switch over every `SimEvent` kind. It is now four
 * gameplay subscribers (`stationFlow`, `hudMessages`, `dockFeedback`,
 * `hyperspaceFlow`), the world lifecycle subscriber the router builds itself
 * (`worldLifecycle`, plan 08-15) and a router that offers each event to them in
 * `EVENT_SUBSCRIBER_ORDER`. Which subscribers handle which kind is the
 * declarative table `EVENT_KIND_SUBSCRIBER`; the order tests pin it. The
 * `worldLifecycle` subscriber runs right after `stationFlow` on `launched` and
 * `docked`, so every station side effect completes before the world is begun
 * or ended. Every gameplay arm body is the one `handleEvent` carried before the
 * split, with its statement order unchanged.
 *
 * Order independence with plan 08-11 (which widens `SimEvent` with reserved
 * kinds in the same wave): the table is keyed to the literal `RoutedKind` union
 * of the 22 routed kinds, never to the full `SimEvent` kind union, and every
 * read of it with a value that is not already a `RoutedKind` goes through
 * `isRoutedKind`. The only mention of the full union's kind type is the
 * `satisfies` check on `ROUTED_EVENT_KINDS`. There is no exhaustive check and no
 * throwing default: an unrouted kind passes through harmlessly.
 *
 * Node-safe: every collaborator arrives through the subscriber deps, so a unit
 * test passes recording doubles.
 */

import { MESSAGE_DURATION_SECONDS } from "../../render/hud/messages.js";
import type { MessageQueue } from "../../render/hud/messages.js";
import type {
  HyperspaceRefusal,
  SimEvent,
  WitchspaceBlocker,
} from "../../sim/events.js";
import { poseOf } from "../../sim/flight/state.js";
import {
  shouldEmitScrapeMessage,
  shouldEmitThrottledMessage,
} from "../dock-feedback.js";
import type { LaunchSequence } from "../launch-sequence.js";
import type { StationShell } from "../../ui/station.js";
import type { CombatMessageKind, SessionState } from "./context.js";

/** The dispatch order: each event is offered to the subscribers in this order. */
export const EVENT_SUBSCRIBER_ORDER = [
  "stationFlow",
  "worldLifecycle",
  "hudMessages",
  "dockFeedback",
  "hyperspaceFlow",
] as const;

export type SubscriberName = (typeof EVENT_SUBSCRIBER_ORDER)[number];

/** The subscribers the facade supplies; the router builds `worldLifecycle`. */
export type GameplaySubscriberName = Exclude<SubscriberName, "worldLifecycle">;

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
};

/** Whether `kind` is one of the routed kinds; a reserved or unknown kind is not. */
export function isRoutedKind(kind: string): kind is RoutedKind {
  return Object.hasOwn(EVENT_KIND_SUBSCRIBER, kind);
}

/** A subscriber handles the kinds it owns and ignores every other event. */
export type EventSubscriber = (event: SimEvent) => void;

/**
 * What the facade passes: the four gameplay subscribers. `worldLifecycle` is
 * optional and only for a test that records it; the router builds the real one
 * from `ctx` when it is absent, so the facade never changes.
 */
export type EventRouterSubscribers = Readonly<
  Record<GameplaySubscriberName, EventSubscriber>
> & { readonly worldLifecycle?: EventSubscriber };

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
        // `displayCountdownMessage` writes the countdown over the bottom row
        // without scrolling (PlayerEntityControls.m:834-839,
        // Universe.m:6258-6267). Nothing is posted here: the render driver
        // draws the countdown in place over the bottom row every frame.
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
          // The event carries the spec key only; the name and class come from
          // the session's own catalogue, falling back to the key (never an id).
          const ship = ctx.core.npcTraffic?.catalogue.find(
            (candidate) => candidate.key === event.specKey,
          );
          return formatIdentLocked(
            IDENT_LOCKED_TEMPLATE,
            ship ?? { name: event.specKey, scanClass: event.specKey },
          );
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
 * unchanged. A shot goes to the scene's shot layer as positions and a laser
 * kind only; the shooter id is never stored. An explosion goes to the scene's
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
 * Build the router. `ctx` is required, never optional: the `worldLifecycle`
 * subscriber is wired here from `ctx.core.worldLifecycle` and
 * `ctx.core.marketSeed`, so the facade never has to change for it.
 */
export function createEventRouter(
  ctx: SessionState,
  subscribers: EventRouterSubscribers,
): EventRouter {
  const all: Readonly<Record<SubscriberName, EventSubscriber>> = {
    ...subscribers,
    worldLifecycle: subscribers.worldLifecycle ?? createWorldLifecycleFlow(ctx),
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
