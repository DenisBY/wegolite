// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The event router's pinned order and routing table (Phase 8, D-12 step 8,
 * review 10b4108 L251 and Round 2 review 820a435 L69).
 *
 * Node only. Part one pins `EVENT_SUBSCRIBER_ORDER` and the declarative
 * `EVENT_KIND_SUBSCRIBER` table, written out literally so a drive-by edit fails
 * here. Part two drives the real subscribers with recording collaborator doubles
 * and asserts, for eight characterized arms, the side-effect sequence the arm
 * had before the move (collaborator calls and context writes, in order), the
 * emission order across a multi-event sequence, and that an unknown kind passes
 * through harmlessly.
 *
 * Indexing the table with a `SimEvent` kind would compile against 14 kinds and
 * fail once plan 08-11 widens the union, so this file indexes it only through
 * `ROUTED_EVENT_KINDS` (typed `RoutedKind`) or after `isRoutedKind`.
 */

import { describe, expect, it } from "vitest";

import { createSessionState } from "../../src/app/session/context.js";
import type { SessionState } from "../../src/app/session/context.js";
import {
  EVENT_KIND_SUBSCRIBER,
  EVENT_SUBSCRIBER_ORDER,
  ROUTED_EVENT_KINDS,
  createDockFeedbackFlow,
  createEventRouter,
  createHudMessages,
  createHyperspaceFlow,
  createStationFlow,
  isRoutedKind,
} from "../../src/app/session/event-router.js";
import type {
  EventRouterSubscribers,
  RoutedKind,
  SubscriberName,
} from "../../src/app/session/event-router.js";
import type { DockFeedback } from "../../src/app/dock-feedback.js";
import type { KeyboardInputSource } from "../../src/input/keyboard.js";
import type { SettingsV1 } from "../../src/settings/schema.js";
import type { SimEvent } from "../../src/sim/events.js";
import { initFlightState, poseOf } from "../../src/sim/flight/state.js";
import { countdownSecondsRemaining } from "../../src/sim/hyperspace/countdown.js";
import { laveFixture } from "../helpers/lave.js";

const lave = laveFixture();

/** One representative event per routed kind (an object per kind, no shared state). */
const EVENTS: Readonly<Record<RoutedKind, SimEvent>> = {
  launched: { kind: "launched" },
  launchComplete: { kind: "launchComplete" },
  docked: { kind: "docked", via: "manual", clockDelta: 1200 },
  dockDenied: { kind: "dockDenied", reason: "notInstalled" },
  torusEngaged: { kind: "torusEngaged", factor: 2 },
  torusDisengaged: { kind: "torusDisengaged", reason: "input" },
  massLockChanged: { kind: "massLockChanged", locked: true },
  bounce: { kind: "bounce", speed: 3, cause: "hull", axis: "x" },
  scrape: { kind: "scrape" },
  compassTargetChanged: { kind: "compassTargetChanged", target: "planet" },
  hyperspaceCountdownStarted: {
    kind: "hyperspaceCountdownStarted",
    destinationId: "g0-s7",
    fuelCost: 10,
    countdownSteps: 1800,
  },
  hyperspaceCountdownCancelled: {
    kind: "hyperspaceCountdownCancelled",
    destinationId: "g0-s7",
  },
  hyperspaceRefused: { kind: "hyperspaceRefused", reason: "insufficient fuel" },
  hyperspaceJumped: {
    kind: "hyperspaceJumped",
    destinationId: "g0-s7",
    clockDeltaSeconds: 576,
    fuelCost: 10,
  },
};

describe("the pinned subscriber order and routing table", () => {
  it("dispatches in the order stationFlow, hudMessages, dockFeedback, hyperspaceFlow", () => {
    expect([...EVENT_SUBSCRIBER_ORDER]).toEqual([
      "stationFlow",
      "hudMessages",
      "dockFeedback",
      "hyperspaceFlow",
    ]);
  });

  it("maps each of the 14 existing kinds to exactly one subscriber tuple", () => {
    expect(EVENT_KIND_SUBSCRIBER).toEqual({
      launched: ["stationFlow"],
      launchComplete: ["stationFlow"],
      docked: ["stationFlow"],
      dockDenied: ["hudMessages"],
      torusEngaged: ["hudMessages"],
      torusDisengaged: ["hudMessages"],
      massLockChanged: ["hudMessages"],
      bounce: ["dockFeedback"],
      scrape: ["dockFeedback"],
      compassTargetChanged: ["hudMessages"],
      hyperspaceCountdownStarted: ["hudMessages"],
      hyperspaceCountdownCancelled: ["hudMessages"],
      hyperspaceRefused: ["hyperspaceFlow"],
      hyperspaceJumped: ["hyperspaceFlow"],
    });
    expect(ROUTED_EVENT_KINDS).toHaveLength(14);
    expect(Object.keys(EVENT_KIND_SUBSCRIBER).sort()).toEqual(
      [...ROUTED_EVENT_KINDS].sort(),
    );
    for (const kind of ROUTED_EVENT_KINDS) {
      expect(EVENT_KIND_SUBSCRIBER[kind]).toHaveLength(1);
    }
  });

  it("keeps every tuple a subsequence of the dispatch order", () => {
    for (const kind of ROUTED_EVENT_KINDS) {
      const positions = EVENT_KIND_SUBSCRIBER[kind].map((name) =>
        EVENT_SUBSCRIBER_ORDER.indexOf(name),
      );
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
      expect(positions.every((position) => position >= 0)).toBe(true);
    }
  });

  it("offers each of the 14 kinds to exactly the subscribers its table entry names", () => {
    for (const kind of ROUTED_EVENT_KINDS) {
      const ctx = createSessionState({
        system: lave.system,
        saveStatus: "absent",
        saveSkipReason: "",
      });
      const offered: string[] = [];
      const record = (name: SubscriberName) => (event: SimEvent) => {
        offered.push(`${name}:${event.kind}`);
      };
      const router = createEventRouter(ctx, {
        stationFlow: record("stationFlow"),
        hudMessages: record("hudMessages"),
        dockFeedback: record("dockFeedback"),
        hyperspaceFlow: record("hyperspaceFlow"),
      });
      router.dispatch(EVENTS[kind]);
      expect(offered).toEqual(
        EVENT_KIND_SUBSCRIBER[kind].map((name) => `${name}:${kind}`),
      );
    }
  });

  it("reaches only stationFlow for a docked event", () => {
    const ctx = createSessionState({
      system: lave.system,
      saveStatus: "absent",
      saveSkipReason: "",
    });
    const offered: string[] = [];
    const record = (name: SubscriberName) => () => {
      offered.push(name);
    };
    createEventRouter(ctx, {
      stationFlow: record("stationFlow"),
      hudMessages: record("hudMessages"),
      dockFeedback: record("dockFeedback"),
      hyperspaceFlow: record("hyperspaceFlow"),
    }).dispatch(EVENTS.docked);
    expect(offered).toEqual(["stationFlow"]);
  });
});

interface Harness {
  readonly ctx: SessionState;
  readonly log: string[];
  readonly router: ReturnType<typeof createEventRouter>;
  /** The scrape-throttle and flight-time knobs the arms read. */
  readonly settings: { launchSeen: boolean };
}

/** The real subscribers wired to doubles that all append to one call log. */
function harness(): Harness {
  const ctx = createSessionState({
    system: lave.system,
    saveStatus: "absent",
    saveSkipReason: "",
  });
  const log: string[] = [];
  ctx.core.state = initFlightState(lave.layout);
  ctx.core.state.flightTime = 12.5;
  const settings = { launchSeen: false };
  ctx.runtime.settings = settings as unknown as SettingsV1;
  ctx.runtime.input = {
    setContext: (context: string) => {
      log.push(
        `input.setContext ${context} screen=${ctx.station.stationScreen} page=${String(ctx.station.stationPage)} pending=${ctx.station.stationPending === null ? "null" : "set"} notice=${ctx.station.stationNotice} message=${ctx.station.stationMessage}`,
      );
    },
    clearAll: () => {
      log.push("input.clearAll");
    },
  } as unknown as KeyboardInputSource;
  ctx.core.dockFeedback = {
    trigger: (kind: string, time: number) => {
      log.push(`dockFeedback.trigger ${kind} ${String(time)}`);
    },
  } as unknown as DockFeedback;

  const messages = {
    enqueue: (text: string) => {
      log.push(`messages.enqueue ${text}`);
    },
    enqueuePriority: (text: string) => {
      log.push(`messages.enqueuePriority ${text}`);
    },
  };
  const initialPose = ctx.core.currentPose;
  const hudCanvas = {
    get hidden(): boolean {
      return false;
    },
    set hidden(value: boolean) {
      log.push(`hudCanvas.hidden ${String(value)}`);
    },
  };
  const subscribers: EventRouterSubscribers = {
    stationFlow: createStationFlow(ctx, {
      launchSequence: {
        reset: () => {
          log.push("launchSequence.reset");
        },
        markSeen: () => {
          log.push("launchSequence.markSeen");
        },
      },
      docked: {
        show: (name: string) => {
          log.push(`docked.show ${name}`);
        },
        hide: () => {
          log.push("docked.hide");
        },
      },
      hudCanvas,
      messages,
      syncStationNav: () => {
        log.push("syncStationNav");
      },
      syncEconomyProbe: () => {
        log.push("syncEconomyProbe");
      },
      persistSettings: () => {
        log.push(
          `persistSettings launchSeen=${String(ctx.core.launchSeen)} settingsLaunchSeen=${String(settings.launchSeen)}`,
        );
      },
      ensureSelection: () => {
        log.push("ensureSelection");
      },
      renderStation: () => {
        log.push(`renderStation message=${ctx.station.stationMessage}`);
      },
      autosave: () => {
        log.push(
          `autosave poseSet=${String(ctx.core.currentPose !== initialPose)} clockDelta=${String(ctx.core.lastDockClockDelta)}`,
        );
      },
    }),
    hudMessages: createHudMessages({
      galaxyById: new Map([[lave.system.id, lave.system]]),
      messages,
    }),
    dockFeedback: createDockFeedbackFlow(ctx, { messages }),
    hyperspaceFlow: createHyperspaceFlow(ctx, {
      messages,
      refusalCopy: (reason) => {
        log.push(
          `refusalCopy ${reason} lastRefusal=${ctx.core.lastRefusal?.reason ?? "none"}`,
        );
        return `copy:${reason}`;
      },
      handleHyperspaceJumped: (event) => {
        log.push(`handleHyperspaceJumped ${event.destinationId}`);
      },
    }),
  };
  return { ctx, log, router: createEventRouter(ctx, subscribers), settings };
}

/** Dirty station fields: the reset writes must precede the first collaborator. */
function dirtyStation(ctx: SessionState): void {
  ctx.station.stationScreen = "market";
  ctx.station.stationPending = { kind: "fit", key: "EQ_FUEL" };
  ctx.station.stationNotice = "n";
  ctx.station.stationMessage = "m";
  ctx.station.stationPage = 2;
}

const LAUNCHED = [
  "launchSequence.reset",
  "input.setContext flight screen=home page=1 pending=null notice= message=",
  "docked.hide",
  "syncStationNav",
  "hudCanvas.hidden false",
  "messages.enqueue Launching — stand by",
  "syncEconomyProbe",
];

const LAUNCH_COMPLETE = [
  "launchSequence.markSeen",
  "persistSettings launchSeen=true settingsLaunchSeen=true",
  "messages.enqueue Arrows pitch and roll · W and S change speed",
];

const DOCKED_MANUAL = [
  "launchSequence.reset",
  "input.setContext dockHome screen=home page=1 pending=null notice= message=",
  "docked.show Lave",
  "ensureSelection",
  "renderStation message=",
  "syncStationNav",
  "input.clearAll",
  "autosave poseSet=true clockDelta=1200",
];

describe("event arm sequences (the pre-move side-effect order)", () => {
  it("launched: station reset, flight context, overlay hidden, HUD shown, message, probe", () => {
    const { ctx, log, router } = harness();
    dirtyStation(ctx);
    router.dispatch(EVENTS.launched);
    expect(log).toEqual(LAUNCHED);
  });

  it("launchComplete: marks the timeline seen, persists the setting once, then the hint", () => {
    const { log, router } = harness();
    router.dispatch(EVENTS.launchComplete);
    expect(log).toEqual(LAUNCH_COMPLETE);
  });

  it("launchComplete: does not persist a setting that is already set", () => {
    const { log, router, settings } = harness();
    settings.launchSeen = true;
    router.dispatch(EVENTS.launchComplete);
    expect(log).toEqual([
      "launchSequence.markSeen",
      "messages.enqueue Arrows pitch and roll · W and S change speed",
    ]);
  });

  it("docked (manual): station reset, dock screen, one render, held input cleared, pose, autosave last", () => {
    const { ctx, log, router } = harness();
    dirtyStation(ctx);
    router.dispatch(EVENTS.docked);
    expect(log).toEqual(DOCKED_MANUAL);
    const state = ctx.core.state;
    expect(state).toBeDefined();
    if (state === undefined) return;
    expect(ctx.core.previousPose).toEqual(poseOf(state));
    expect(ctx.core.currentPose).toBe(ctx.core.previousPose);
  });

  it("docked (computer): announces the computer and renders a second time before the pose and autosave", () => {
    const { ctx, log, router } = harness();
    router.dispatch({ kind: "docked", via: "computer", clockDelta: 1200 });
    expect(log).toEqual([
      "launchSequence.reset",
      "input.setContext dockHome screen=home page=1 pending=null notice= message=",
      "docked.show Lave",
      "ensureSelection",
      "renderStation message=",
      "syncStationNav",
      "messages.enqueuePriority Docking computers engaged",
      "renderStation message=Docking computers engaged",
      "input.clearAll",
      "autosave poseSet=true clockDelta=1200",
    ]);
    expect(ctx.station.stationMessage).toBe("Docking computers engaged");
  });

  it("dockDenied: fixed copy for each reason, as a priority message", () => {
    const first = harness();
    first.router.dispatch({ kind: "dockDenied", reason: "notInstalled" });
    expect(first.log).toEqual([
      "messages.enqueuePriority No docking computer fitted",
    ]);
    const second = harness();
    second.router.dispatch({ kind: "dockDenied", reason: "outsideAegis" });
    expect(second.log).toEqual([
      "messages.enqueuePriority Too far from the station to engage docking computer",
    ]);
  });

  it("bounce: triggers the feedback envelope at the flight time, then the priority message", () => {
    const { log, router } = harness();
    router.dispatch(EVENTS.bounce);
    expect(log).toEqual([
      "dockFeedback.trigger bounce 12.5",
      "messages.enqueuePriority Hull contact - roll 90 degrees and line up with the slot",
    ]);
  });

  it("scrape: triggers every time, but the message at most once per simulated second", () => {
    const { ctx, log, router } = harness();
    router.dispatch(EVENTS.scrape);
    expect(log).toEqual([
      "dockFeedback.trigger scrape 12.5",
      "messages.enqueuePriority Scrape - ease toward the centre of the slot",
    ]);
    expect(ctx.core.lastScrapeMessageTime).toBe(12.5);

    log.length = 0;
    router.dispatch(EVENTS.scrape);
    expect(log).toEqual(["dockFeedback.trigger scrape 12.5"]);
  });

  it("hyperspaceRefused: records the refusal before the copy is looked up and shown", () => {
    const { ctx, log, router } = harness();
    router.dispatch(EVENTS.hyperspaceRefused);
    expect(log).toEqual([
      "refusalCopy insufficient fuel lastRefusal=insufficient fuel",
      "messages.enqueuePriority copy:insufficient fuel",
    ]);
    expect(ctx.core.lastRefusal).toEqual({ reason: "insufficient fuel" });
  });

  it("hyperspaceJumped: hands the event to the arrival and does nothing else", () => {
    const { log, router } = harness();
    router.dispatch(EVENTS.hyperspaceJumped);
    expect(log).toEqual(["handleHyperspaceJumped g0-s7"]);
  });

  it("the HUD-message kinds print their fixed copy", () => {
    const { log, router } = harness();
    router.dispatch(EVENTS.torusEngaged);
    router.dispatch(EVENTS.torusDisengaged);
    router.dispatch(EVENTS.massLockChanged);
    router.dispatch({ kind: "massLockChanged", locked: false });
    router.dispatch(EVENTS.compassTargetChanged);
    router.dispatch({
      kind: "hyperspaceCountdownStarted",
      destinationId: lave.system.id,
      fuelCost: 10,
      countdownSteps: 1800,
    });
    router.dispatch({
      kind: "hyperspaceCountdownStarted",
      destinationId: "no-such-system",
      fuelCost: 10,
      countdownSteps: 1800,
    });
    router.dispatch(EVENTS.hyperspaceCountdownCancelled);
    const seconds = String(countdownSecondsRemaining(1800));
    expect(log).toEqual([
      "messages.enqueue Torus engaged at 2.0×",
      "messages.enqueue Torus disengaged",
      "messages.enqueue Mass locked",
      "messages.enqueue Compass target: planet",
      `messages.enqueue Hyperspace to Lave in ${seconds} seconds`,
      `messages.enqueue Hyperspace to (Unknown) in ${seconds} seconds`,
      "messages.enqueue Hyperspace countdown cancelled",
    ]);
  });
});

describe("a multi-event sequence", () => {
  it("is handled in emission order with no interleaving", () => {
    const { ctx, log, router } = harness();
    dirtyStation(ctx);
    for (const event of [
      EVENTS.launched,
      EVENTS.launchComplete,
      EVENTS.massLockChanged,
      EVENTS.docked,
    ]) {
      router.dispatch(event);
    }
    expect(log).toEqual([
      ...LAUNCHED,
      ...LAUNCH_COMPLETE,
      "messages.enqueue Mass locked",
      ...DOCKED_MANUAL,
    ]);
  });
});

describe("an unrouted kind", () => {
  it("is offered to no subscriber and never throws", () => {
    const { log, router } = harness();
    const reserved = { kind: "reservedFutureKind" } as unknown as SimEvent;
    expect(() => {
      router.dispatch(reserved);
    }).not.toThrow();
    expect(log).toEqual([]);
  });

  it("does not treat inherited object keys as routed kinds", () => {
    const { log, router } = harness();
    for (const kind of ["constructor", "toString", "__proto__"]) {
      router.dispatch({ kind } as unknown as SimEvent);
    }
    expect(log).toEqual([]);
  });

  it("isRoutedKind accepts every routed kind and nothing else", () => {
    for (const kind of ROUTED_EVENT_KINDS) {
      expect(isRoutedKind(kind)).toBe(true);
    }
    expect(isRoutedKind("reservedFutureKind")).toBe(false);
    expect(isRoutedKind("constructor")).toBe(false);
    expect(isRoutedKind("toString")).toBe(false);
  });
});
