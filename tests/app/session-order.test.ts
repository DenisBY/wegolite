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
 *
 * The last describe pins the frame shell's phase order (Phase 8, D-12 step 9,
 * RESEARCH Pattern 1): the drains, the two freeze branches, the station
 * actions, the sim driver and the single gated render.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { createSessionState } from "../../src/app/session/context.js";
import type { SessionState } from "../../src/app/session/context.js";
import { createFrameLoop } from "../../src/app/session/frame-loop.js";
import { parseTestFlags } from "../../src/app/session/test-flags.js";
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
import type { GameLoop } from "../../src/app/game-loop.js";
import type { ActionId } from "../../src/input/actions.js";
import type { KeyboardInputSource } from "../../src/input/keyboard.js";
import type { Command } from "../../src/sim/commands.js";
import type { SettingsV1 } from "../../src/settings/schema.js";
import { RESERVED_EVENT_KINDS } from "../../src/sim/events.js";
import type { SimEvent } from "../../src/sim/events.js";
import type { WorldLifecycle } from "../../src/app/session/world-lifecycle.js";
import { createWorldLifecycle } from "../../src/app/session/world-lifecycle.js";
import { initFlightState, poseOf } from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
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
  torusRefused: { kind: "torusRefused", reason: "massLock" },
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
  it("dispatches in the order stationFlow, worldLifecycle, hudMessages, dockFeedback, hyperspaceFlow", () => {
    expect([...EVENT_SUBSCRIBER_ORDER]).toEqual([
      "stationFlow",
      "worldLifecycle",
      "hudMessages",
      "dockFeedback",
      "hyperspaceFlow",
    ]);
  });

  it("maps each of the 15 routed kinds to exactly one subscriber tuple", () => {
    expect(EVENT_KIND_SUBSCRIBER).toEqual({
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
    });
    expect(ROUTED_EVENT_KINDS).toHaveLength(15);
    expect(Object.keys(EVENT_KIND_SUBSCRIBER).sort()).toEqual(
      [...ROUTED_EVENT_KINDS].sort(),
    );
    // Thirteen kinds have one subscriber; launched and docked have the ordered
    // pair (plan 08-15), so the world lifecycle runs after the station flow.
    const pair = ["launched", "docked"];
    for (const kind of ROUTED_EVENT_KINDS) {
      if (pair.includes(kind)) {
        expect(EVENT_KIND_SUBSCRIBER[kind]).toEqual([
          "stationFlow",
          "worldLifecycle",
        ]);
      } else {
        expect(EVENT_KIND_SUBSCRIBER[kind]).toHaveLength(1);
      }
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
        worldLifecycle: record("worldLifecycle"),
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
      refusalCopy: (reason, blocker) => {
        log.push(
          `refusalCopy ${reason}${blocker === undefined ? "" : ` blocker=${blocker}`} lastRefusal=${ctx.core.lastRefusal?.reason ?? "none"}`,
        );
        return `copy:${reason}${blocker === undefined ? "" : `:${blocker}`}`;
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

  it("hyperspaceRefused with a ship blocker: passes the blocker to the copy and stores only the reason", () => {
    const { ctx, log, router } = harness();
    router.dispatch({
      kind: "hyperspaceRefused",
      reason: "blocked",
      blocker: "ship",
    });
    expect(log).toEqual([
      "refusalCopy blocked blocker=ship lastRefusal=blocked",
      "messages.enqueuePriority copy:blocked:ship",
    ]);
    // The probe shape stays `{ reason }`: the blocker never reaches it (T-12-11).
    expect(ctx.core.lastRefusal).toEqual({ reason: "blocked" });
    expect(Object.keys(ctx.core.lastRefusal ?? {})).toEqual(["reason"]);
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
    router.dispatch(EVENTS.torusRefused);
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
      "messages.enqueue Hyperspeed mass-locked.",
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

describe("the world lifecycle subscriber (plan 08-15)", () => {
  /** A recording lifecycle double on the same log as the station collaborators. */
  function withLifecycle(): Harness & { readonly lifecycle: WorldLifecycle } {
    const built = harness();
    built.ctx.core.marketSeed = 4321;
    const lifecycle: WorldLifecycle = {
      world: undefined,
      epoch: 0,
      anchorNextEntityId: undefined,
      begin: (seed) => {
        built.log.push(`worldLifecycle.begin ${String(seed)}`);
      },
      resume: () => {
        built.log.push("worldLifecycle.resume");
      },
      end: () => {
        built.log.push("worldLifecycle.end");
      },
      resetForRestore: () => {
        built.log.push("worldLifecycle.resetForRestore");
        return true;
      },
    };
    built.ctx.core.worldLifecycle = lifecycle;
    return { ...built, lifecycle };
  }

  it("launched: begins the world with the live market seed after every station side effect", () => {
    const { log, router } = withLifecycle();
    router.dispatch(EVENTS.launched);
    expect(log).toEqual([...LAUNCHED, "worldLifecycle.begin 4321"]);
  });

  it("docked: ends the world after every station side effect, the autosave included", () => {
    const { log, router } = withLifecycle();
    router.dispatch(EVENTS.docked);
    expect(log).toEqual([...DOCKED_MANUAL, "worldLifecycle.end"]);
  });

  it("launched without a market seed begins nothing", () => {
    const { ctx, log, router } = withLifecycle();
    ctx.core.marketSeed = undefined;
    router.dispatch(EVENTS.launched);
    expect(log).toEqual(LAUNCHED);
  });

  it("does nothing without a lifecycle and for every other routed kind", () => {
    const bare = harness();
    bare.router.dispatch(EVENTS.launched);
    bare.router.dispatch(EVENTS.docked);
    expect(bare.log).toEqual([...LAUNCHED, ...DOCKED_MANUAL]);

    for (const kind of ROUTED_EVENT_KINDS) {
      if (kind === "launched" || kind === "docked") continue;
      const { log, router } = withLifecycle();
      router.dispatch(EVENTS[kind]);
      expect(log.some((entry) => entry.startsWith("worldLifecycle"))).toBe(
        false,
      );
    }
  });

  it("drives the real lifecycle: launch begins epoch 1, a second launch is dock-separated", () => {
    const { ctx, router } = harness();
    ctx.core.marketSeed = 99;
    const real = createWorldLifecycle({ traffic: false });
    ctx.core.worldLifecycle = real;
    router.dispatch(EVENTS.launched);
    expect(real.epoch).toBe(1);
    expect(real.world).toBeDefined();
    router.dispatch(EVENTS.docked);
    expect(real.world).toBeUndefined();
    expect(real.epoch).toBe(1);
    router.dispatch(EVENTS.launched);
    expect(real.epoch).toBe(2);
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

  it("reserved kinds pass through", () => {
    const events: Readonly<
      Record<(typeof RESERVED_EVENT_KINDS)[number], SimEvent>
    > = {
      laserFired: {
        kind: "laserFired",
        shooter: 101,
        from: { x: 0, y: 0, z: 0 },
        to: { x: 0, y: 0, z: 1 },
        laserKind: "pulse",
      },
      shipHit: {
        kind: "shipHit",
        target: 101,
        source: 102,
        amount: 1,
        shield: false,
      },
      shipDestroyed: {
        kind: "shipDestroyed",
        id: 101,
        position: { x: 0, y: 0, z: 0 },
        radius: 1,
        specKey: "x",
        killer: 0,
      },
      entityRemoved: { kind: "entityRemoved", id: 101 },
      commsMessage: { kind: "commsMessage", from: 101, key: "k", params: {} },
      missileLaunched: {
        kind: "missileLaunched",
        missile: 102,
        shooter: 101,
        target: 103,
      },
      missileDetonated: {
        kind: "missileDetonated",
        missile: 102,
        position: { x: 0, y: 0, z: 0 },
      },
      ecmFired: {
        kind: "ecmFired",
        source: 101,
        position: { x: 0, y: 0, z: 0 },
      },
      cargoScooped: {
        kind: "cargoScooped",
        scooper: 100,
        commodity: "x",
        amount: 1,
      },
      shipSpawned: { kind: "shipSpawned", id: 101, specKey: "x" },
      legalStatusChanged: {
        kind: "legalStatusChanged",
        from: "clean",
        to: "offender",
      },
      playerDestroyed: {
        kind: "playerDestroyed",
        position: { x: 0, y: 0, z: 0 },
      },
      podEjected: { kind: "podEjected", pod: 101, owner: 102 },
      proximityWarning: { kind: "proximityWarning", id: 101, other: 102 },
      energyLow: { kind: "energyLow", id: 101 },
    };
    for (const kind of RESERVED_EVENT_KINDS) {
      const { ctx, log, router } = harness();
      ctx.core.marketSeed = 7;
      const real = createWorldLifecycle({ traffic: false });
      real.begin(7);
      const worldBefore = real.world;
      ctx.core.worldLifecycle = real;
      expect(() => {
        router.dispatch(events[kind]);
      }).not.toThrow();
      expect(log).toEqual([]);
      expect(real.epoch).toBe(1);
      expect(real.world).toBe(worldBefore);
    }
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

describe("frame phase order", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  interface FrameHarness {
    readonly ctx: SessionState;
    readonly frame: (now: number) => void;
    readonly log: string[];
    readonly pending: Command[];
    readonly probe: { frames: number };
    readonly advanceDeltas: number[];
    readonly handled: {
      chart: (readonly ActionId[])[];
      saveScreen: (readonly ActionId[])[];
    };
    readonly toggle: { pause: boolean };
    /** What `requestAnimationFrame` was asked to run, in call order. */
    readonly scheduled: FrameRequestCallback[];
  }

  /**
   * A frame loop over a docked Lave state with recording doubles. Every
   * collaborator appends its name to one log, written out literally in the
   * expectations from the pre-move `frame()` (never derived from the code
   * under test).
   */
  function frameHarness(
    options: {
      readonly mode?: FlightState["mode"];
      readonly stationActions?: readonly ActionId[];
      /** Parse `?test=1&clock=manual` into the session's flags. */
      readonly manualClock?: boolean;
    } = {},
  ): FrameHarness {
    const ctx = createSessionState({
      system: lave.system,
      saveStatus: "absent",
      saveSkipReason: "",
    });
    const state = initFlightState(lave.layout);
    if (options.mode !== undefined) state.mode = options.mode;
    ctx.core.state = state;
    ctx.core.layout = lave.layout;
    ctx.core.config = lave.config;
    if (options.manualClock === true) {
      ctx.runtime.testFlags = parseTestFlags("?test=1&clock=manual");
    }

    const log: string[] = [];
    const pending: Command[] = [];
    const probe = { frames: 0 };
    const advanceDeltas: number[] = [];
    const handled: FrameHarness["handled"] = { chart: [], saveScreen: [] };
    const toggle = { pause: false };
    const scheduled: FrameRequestCallback[] = [];
    let nextRafId = 100;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      scheduled.push(callback);
      nextRafId += 1;
      return nextRafId;
    });

    const chartActions: readonly ActionId[] = ["chartUp"];
    const saveScreenActions: readonly ActionId[] = ["saveScreenUp"];
    ctx.runtime.input = {
      consumePauseToggle: () => {
        log.push("consumePauseToggle");
        return toggle.pause;
      },
      drainChartActions: () => {
        log.push("drainChartActions");
        return chartActions;
      },
      drainSaveScreenActions: () => {
        log.push("drainSaveScreenActions");
        return saveScreenActions;
      },
      drainStationActions: () => {
        log.push("drainStationActions");
        return options.stationActions ?? [];
      },
      drainCommands: () => {
        log.push("drainCommands");
        return [];
      },
    } as unknown as KeyboardInputSource;
    ctx.runtime.loop = {} as unknown as GameLoop;

    const frame = createFrameLoop(ctx, {
      probe,
      pending,
      redrawGate: {
        request: () => {
          log.push("redrawGate.request");
        },
      },
      simDriver: {
        advanceFrame: (delta) => {
          log.push("advanceFrame");
          advanceDeltas.push(delta);
          return 0.5;
        },
      },
      renderFrame: (alpha, draw) => {
        log.push(`renderFrame ${String(alpha)} ${String(draw)}`);
      },
      shouldDraw: () => {
        log.push("shouldDraw");
        return true;
      },
      pause: () => {
        log.push("pause");
      },
      resume: () => {
        log.push("resume");
      },
      handleChartActions: (actions) => {
        handled.chart.push(actions);
      },
      handleSaveScreenActions: (actions) => {
        handled.saveScreen.push(actions);
      },
      applyStationAction: () => {
        log.push("applyStationAction");
      },
      updateProbe: () => {
        log.push("updateProbe");
      },
    });
    return {
      ctx,
      frame,
      log,
      pending,
      probe,
      advanceDeltas,
      handled,
      toggle,
      scheduled,
    };
  }

  const LAUNCH: Command = { kind: "launch" };

  it("runs a normal docked frame in the pinned phase order", () => {
    const { frame, log, probe, handled, advanceDeltas } = frameHarness({
      stationActions: ["stationMarket"],
    });

    frame(1000);

    expect(log).toEqual([
      "consumePauseToggle",
      "drainChartActions",
      "drainSaveScreenActions",
      "drainStationActions",
      "applyStationAction",
      "advanceFrame",
      "shouldDraw",
      "renderFrame 0.5 true",
    ]);
    // The drained edges reach their handlers, once each.
    expect(handled.chart).toEqual([["chartUp"]]);
    expect(handled.saveScreen).toEqual([["saveScreenUp"]]);
    expect(advanceDeltas).toEqual([0]);
    expect(probe.frames).toBe(1);
  });

  it("under the manual clock keeps every phase except the sim driver and draws at alpha 1", () => {
    const { frame, log, probe, advanceDeltas } = frameHarness({
      manualClock: true,
      stationActions: ["stationMarket"],
    });

    frame(1000);

    expect(log).toEqual([
      "consumePauseToggle",
      "drainChartActions",
      "drainSaveScreenActions",
      "drainStationActions",
      "applyStationAction",
      "shouldDraw",
      "renderFrame 1 true",
    ]);
    expect(log).not.toContain("drainCommands");
    expect(log).not.toContain("advanceFrame");
    expect(advanceDeltas).toEqual([]);
    expect(probe.frames).toBe(1);
  });

  it("without the manual clock the flag-less frame still reaches the sim driver", () => {
    const { frame, log } = frameHarness();
    frame(1000);
    expect(log).toContain("advanceFrame");
    expect(log).toContain("renderFrame 0.5 true");
  });

  it("reschedules itself before anything else and records the id", () => {
    const { ctx, frame, scheduled } = frameHarness();

    frame(1000);

    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]).toBe(frame);
    expect(ctx.runtime.rafId).toBe(101);
  });

  it("passes the elapsed seconds, and zero on the first frame, to the sim driver", () => {
    const { frame, advanceDeltas } = frameHarness();

    frame(1000);
    frame(1016);

    expect(advanceDeltas).toHaveLength(2);
    expect(advanceDeltas[0]).toBe(0);
    expect(advanceDeltas[1]).toBeCloseTo(0.016, 10);
  });

  it("toggles pause before any drain: pause when running, resume when paused", () => {
    const running = frameHarness();
    running.toggle.pause = true;
    running.frame(1000);
    expect(running.log.slice(0, 2)).toEqual(["consumePauseToggle", "pause"]);

    const paused = frameHarness();
    paused.ctx.runtime.paused = true;
    paused.toggle.pause = true;
    paused.frame(1000);
    expect(paused.log.slice(0, 2)).toEqual(["consumePauseToggle", "resume"]);
  });

  it("applies no station action in flight", () => {
    const { frame, log } = frameHarness({
      mode: "inFlight",
      stationActions: ["stationMarket"],
    });

    frame(1000);

    expect(log).not.toContain("applyStationAction");
    expect(log).toContain("advanceFrame");
  });

  it("freezes behind the open chart: drains, empties pending, never steps or draws", () => {
    const { ctx, frame, log, pending, probe, handled } = frameHarness();
    ctx.chart.chartOpen = true;
    pending.push(LAUNCH);

    frame(1000);

    expect(log).toEqual([
      "consumePauseToggle",
      "drainChartActions",
      "drainSaveScreenActions",
      "drainCommands",
      "drainStationActions",
      "redrawGate.request",
      "updateProbe",
    ]);
    // The chart wins a tie: the Save/Load actions are drained, not handled.
    expect(handled.chart).toEqual([["chartUp"]]);
    expect(handled.saveScreen).toEqual([]);
    expect(pending.length).toBe(0);
    expect(log).not.toContain("advanceFrame");
    expect(log.some((entry) => entry.startsWith("renderFrame"))).toBe(false);
    expect(probe.frames).toBe(1);
  });

  it("freezes behind the open save screen: drains, empties pending, never steps or draws", () => {
    const { ctx, frame, log, pending, probe, handled } = frameHarness();
    ctx.save.saveScreenOpen = true;
    pending.push(LAUNCH);

    frame(1000);

    expect(log).toEqual([
      "consumePauseToggle",
      "drainChartActions",
      "drainSaveScreenActions",
      "drainCommands",
      "drainStationActions",
      "redrawGate.request",
      "updateProbe",
    ]);
    expect(handled.saveScreen).toEqual([["saveScreenUp"]]);
    expect(pending.length).toBe(0);
    expect(log).not.toContain("advanceFrame");
    expect(log.some((entry) => entry.startsWith("renderFrame"))).toBe(false);
    expect(probe.frames).toBe(1);
  });

  it("does not fire a launch queued behind the chart once the chart closes", () => {
    const { ctx, frame, log, pending } = frameHarness();
    ctx.chart.chartOpen = true;
    pending.push(LAUNCH);

    frame(1000);
    ctx.chart.chartOpen = false;
    log.length = 0;
    frame(1016);

    expect(pending.length).toBe(0);
    expect(log).toContain("advanceFrame");
  });

  it("drains commands, empties pending, never steps, but still draws while paused", () => {
    const { ctx, frame, log, pending, probe } = frameHarness({
      stationActions: ["stationMarket"],
    });
    ctx.runtime.paused = true;
    pending.push(LAUNCH);

    frame(1000);

    expect(log).toEqual([
      "consumePauseToggle",
      "drainChartActions",
      "drainSaveScreenActions",
      "drainStationActions",
      "drainCommands",
      "shouldDraw",
      "renderFrame 0 true",
    ]);
    expect(pending.length).toBe(0);
    expect(probe.frames).toBe(1);
  });

  it("counts every frame but does nothing else before the session has started", () => {
    const { ctx, frame, log, probe } = frameHarness();
    ctx.core.state = undefined;

    frame(1000);
    frame(1016);

    expect(probe.frames).toBe(2);
    expect(log).toEqual([]);
  });
});
