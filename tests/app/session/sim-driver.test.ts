// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The sim driver and the step-options builder (Phase 8, D-12 step 8, D-14).
 *
 * Node only, no DOM: a real Lave `FlightState`, the real layout, config, game
 * loop and flight step, and recording doubles for the input source, the
 * autosave, the launch timeline and the router's subscribers. The flight step
 * is wrapped (not replaced) so the test sees the commands each step received and
 * where the pre-launch autosave sits relative to the first step.
 */

import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createGameLoop } from "../../../src/app/game-loop.js";
import { createLaunchSequence } from "../../../src/app/launch-sequence.js";
import { LAUNCH_PRE_ROLL_DURATION } from "../../../src/render/launch-camera.js";
import type { LaunchSequence } from "../../../src/app/launch-sequence.js";
import {
  createEventRouter,
  type EventRouterSubscribers,
} from "../../../src/app/session/event-router.js";
import { createSessionState } from "../../../src/app/session/context.js";
import type { SessionState } from "../../../src/app/session/context.js";
import { createFrameLoop } from "../../../src/app/session/frame-loop.js";
import { createRedrawGate } from "../../../src/app/redraw-gate.js";
import { createProbePublisher } from "../../../src/app/session/probe-publisher.js";
import {
  createSimDriver,
  MAX_ADVANCE_TICKS,
} from "../../../src/app/session/sim-driver.js";
import { parseTestFlags } from "../../../src/app/session/test-flags.js";
import { createWorldLifecycle } from "../../../src/app/session/world-lifecycle.js";
import { buildStepOptions } from "../../../src/app/session/step-options.js";
import type { System } from "../../../src/content/types.js";
import type { WegoliteProbe } from "../../../src/app/probe.js";
import type { KeyboardInputSource } from "../../../src/input/keyboard.js";
import { createMessageQueue } from "../../../src/render/hud/messages.js";
import { LASER_STATS } from "../../../src/sim/combat/constants.js";
import {
  DEFAULT_LASER_MOUNTS,
  NO_LASER,
} from "../../../src/sim/combat/mounts.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import type { Command } from "../../../src/sim/commands.js";
import type { SimEvent } from "../../../src/sim/events.js";
import {
  PlayerController,
  ScriptedLaunchController,
} from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import { identity, vec } from "../../../src/sim/math.js";
import { flightTableFrom } from "../../../src/sim/npc/stats.js";
import type { FlightRecord } from "../../../src/sim/npc/stats.js";
import { spawnEntity } from "../../../src/sim/world/world.js";
import type { InputFrame } from "../../../src/sim/state.js";
import { MAX_STEPS_PER_FRAME } from "../../../src/sim/step.js";
import { DT } from "../../../src/sim/time.js";
import { sessionSources } from "../../helpers/session-source.js";
import { debrisFixture } from "../../helpers/debris-fixture.js";
import { laveFixture } from "../../helpers/lave.js";
import { realHullTable } from "../../helpers/hull-table.js";
import { realNpcWeapons } from "../../helpers/npc-weapons.js";

/** One flight record for the step-options hand-over cases (plan 14-18). */
const VIPER_FLIGHT_RECORD: FlightRecord = {
  key: "viper",
  maxFlightSpeed: 320,
  maxFlightRoll: 2.5,
  maxFlightPitch: 1.5,
  thrust: 15,
  mass: 34_040.6796875,
  forwardWeapon: "EQ_WEAPON_PULSE_LASER",
};

const hooks = vi.hoisted(() => ({
  onStep: (commands: readonly unknown[]): void => {
    void commands;
  },
  onOptions: (options: unknown): void => {
    void options;
  },
}));

vi.mock("../../../src/sim/flight/step.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/sim/flight/step.js")>();
  return {
    ...actual,
    stepFlight: (
      ...args: Parameters<typeof actual.stepFlight>
    ): ReturnType<typeof actual.stepFlight> => {
      hooks.onStep(args[4]);
      hooks.onOptions(args[6]);
      return actual.stepFlight(...args);
    },
  };
});

const lave = laveFixture();
const launch: Command = { kind: "launch" };

interface Harness {
  readonly ctx: SessionState;
  readonly driver: ReturnType<typeof createSimDriver>;
  readonly log: string[];
  readonly pending: Command[];
  readonly queue: Command[];
  readonly stepCommands: (readonly Command[])[];
  readonly frames: InputFrame[];
  readonly seenFrames: InputFrame[];
  readonly counts: { drains: number; frames: number; advances: number };
  readonly advances: { dt: number; skipped: boolean }[];
  /** Every event the router was handed, in dispatch order. */
  readonly dispatched: SimEvent[];
  /** The real launch sequence behind the recording wrapper. */
  readonly sequence: LaunchSequence;
}

function harness(
  options: {
    readonly mode?: "docked" | "inFlight";
    /** Parse `?test=1&clock=manual` into the session's flags. */
    readonly manual?: boolean;
    /** Hold the fire key in every input frame. */
    readonly fire?: boolean;
    /** Create the player's combat state, as start-up does. */
    readonly combat?: boolean;
    /**
     * Play the real-time launch pre-roll (quick 261118-os8): the default
     * length getter. Without it the sequence has a zero-length pre-roll, the
     * manual-clock path, so the drain launches directly.
     */
    readonly preRoll?: boolean;
  } = {},
): Harness {
  const ctx = createSessionState({
    system: lave.system,
    saveStatus: "absent",
    saveSkipReason: "",
  });
  const state = initFlightState(lave.layout);
  if (options.mode === "inFlight") state.mode = "inFlight";
  ctx.core.state = state;
  if (options.combat === true) ctx.core.combat = createPlayerCombatState();
  ctx.core.layout = lave.layout;
  ctx.core.config = lave.config;
  if (options.manual === true) {
    ctx.runtime.testFlags = parseTestFlags("?test=1&clock=manual");
  }

  const log: string[] = [];
  const pending: Command[] = [];
  const queue: Command[] = [];
  const stepCommands: (readonly Command[])[] = [];
  const frames: InputFrame[] = [];
  const seenFrames: InputFrame[] = [];
  const counts = { drains: 0, frames: 0, advances: 0 };
  const advances: { dt: number; skipped: boolean }[] = [];
  const dispatched: SimEvent[] = [];

  hooks.onStep = (commands) => {
    log.push("stepFlight");
    stepCommands.push(commands as readonly Command[]);
  };

  ctx.runtime.input = {
    drainCommands: () => {
      counts.drains += 1;
      return queue.splice(0);
    },
    frame: () => {
      counts.frames += 1;
      const next: InputFrame = {
        pitch: 0,
        roll: 0,
        speed: 0,
        precision: false,
        ...(options.fire === true ? { fire: true } : {}),
      };
      frames.push(next);
      return next;
    },
  } as unknown as KeyboardInputSource;
  ctx.runtime.loop = createGameLoop();

  const realPlayer = new PlayerController();
  const realScripted = new ScriptedLaunchController();
  const subscribers: EventRouterSubscribers = {
    stationFlow: (event) => log.push(`stationFlow ${event.kind}`),
    hudMessages: (event) => log.push(`hudMessages ${event.kind}`),
    dockFeedback: (event) => log.push(`dockFeedback ${event.kind}`),
    hyperspaceFlow: (event) => log.push(`hyperspaceFlow ${event.kind}`),
  };

  const realRouter = createEventRouter(ctx, subscribers);
  const sequence =
    options.preRoll === true
      ? createLaunchSequence()
      : createLaunchSequence(() => 0);
  const driver = createSimDriver(ctx, {
    pending,
    player: {
      update: (view, frame) => {
        seenFrames.push(frame);
        return realPlayer.update(view, frame);
      },
    },
    scripted: {
      update: () => {
        log.push("scripted.update");
        return realScripted.update();
      },
    },
    launchSequence: {
      advance: (dt, skipped) => {
        counts.advances += 1;
        advances.push({ dt, skipped });
        sequence.advance(dt, skipped);
      },
      startPreRoll: () => sequence.startPreRoll(),
      advancePreRoll: (dt) => sequence.advancePreRoll(dt),
      cancelPreRoll: () => {
        log.push("cancelPreRoll");
        sequence.cancelPreRoll();
      },
      get preRolling() {
        return sequence.preRolling;
      },
      get preRollSkipped() {
        return sequence.preRollSkipped;
      },
    },
    router: {
      ...realRouter,
      dispatch: (event) => {
        dispatched.push(event);
        realRouter.dispatch(event);
      },
    },
    equipmentSet: () => new Set<string>(),
    targetSystem: () => undefined,
    autosave: () => {
      log.push(`autosave ${ctx.core.state?.mode ?? "none"}`);
    },
    onPreRollStart: () => {
      log.push("onPreRollStart");
    },
    markHookMutation: () => {
      log.push("markHookMutation");
      ctx.runtime.testTainted = true;
    },
  });
  return {
    ctx,
    driver,
    log,
    pending,
    queue,
    stepCommands,
    frames,
    seenFrames,
    counts,
    advances,
    dispatched,
    sequence,
  };
}

/** The idle input frame the combat cases add `fire` to. */
const IDLE: InputFrame = { pitch: 0, roll: 0, speed: 0, precision: false };

/** Three whole steps and a remainder: the loop runs exactly three steps. */
const THREE_STEPS = 3.5 * DT;

beforeEach(() => {
  hooks.onStep = () => undefined;
  hooks.onOptions = () => undefined;
});

describe("advanceFrame, the command drain", () => {
  it("hands the drained commands to the first step only", () => {
    const { driver, queue, stepCommands } = harness();
    queue.push(launch);

    driver.advanceFrame(THREE_STEPS);

    expect(stepCommands).toHaveLength(3);
    expect(stepCommands[0]).toEqual([launch]);
    expect(stepCommands[1]).toEqual([]);
    expect(stepCommands[2]).toEqual([]);
  });

  it("runs the pre-launch autosave once, while still docked, before the first step", () => {
    const { driver, queue, log } = harness();
    queue.push(launch);

    driver.advanceFrame(THREE_STEPS);

    const autosaves = log.filter((entry) => entry.startsWith("autosave"));
    expect(autosaves).toEqual(["autosave docked"]);
    expect(log.indexOf("autosave docked")).toBeLessThan(
      log.indexOf("stepFlight"),
    );
  });

  it("filters a launch out unless docked on the home screen", () => {
    const { ctx, driver, queue, stepCommands, log } = harness();
    ctx.station.stationScreen = "market";
    queue.push(launch);

    driver.advanceFrame(THREE_STEPS);

    expect(log.some((entry) => entry.startsWith("autosave"))).toBe(false);
    expect(stepCommands[0]).toEqual([]);
    expect(ctx.core.state?.mode).toBe("docked");
  });

  it("autosaves once across two frames, the second draining nothing", () => {
    const { driver, queue, log } = harness();
    queue.push(launch);

    driver.advanceFrame(THREE_STEPS);
    driver.advanceFrame(THREE_STEPS);

    expect(log.filter((entry) => entry.startsWith("autosave"))).toHaveLength(1);
  });

  it("autosaves once for a double launch and passes both to the first step", () => {
    const { driver, queue, stepCommands, log } = harness();
    queue.push(launch, launch);

    driver.advanceFrame(THREE_STEPS);

    expect(log.filter((entry) => entry.startsWith("autosave"))).toHaveLength(1);
    expect(stepCommands[0]).toEqual([launch, launch]);
    expect(stepCommands[1]).toEqual([]);
  });

  it("takes no autosave for a launch drained in flight", () => {
    const { driver, queue, stepCommands, log } = harness({ mode: "inFlight" });
    queue.push(launch);

    driver.advanceFrame(THREE_STEPS);

    expect(log.some((entry) => entry.startsWith("autosave"))).toBe(false);
    expect(stepCommands[0]).toEqual([]);
  });

  it("drains the keyboard once per frame and empties pending with that drain", () => {
    const { driver, pending, queue, stepCommands, counts, log } = harness();
    pending.push(launch);

    driver.advanceFrame(THREE_STEPS);

    expect(counts.drains).toBe(1);
    expect(pending).toHaveLength(0);
    expect(queue).toHaveLength(0);
    expect(stepCommands[0]).toEqual([launch]);
    expect(log.filter((entry) => entry.startsWith("autosave"))).toHaveLength(1);

    driver.advanceFrame(THREE_STEPS);
    expect(counts.drains).toBe(2);
  });

  it("takes one input frame per rendered frame and shares it with every step", () => {
    const { ctx, driver, frames, seenFrames, counts } = harness({
      mode: "inFlight",
    });

    driver.advanceFrame(THREE_STEPS);

    expect(counts.frames).toBe(1);
    expect(frames).toHaveLength(1);
    expect(seenFrames).toHaveLength(3);
    for (const seen of seenFrames) expect(seen).toBe(frames[0]);
    expect(ctx.core.currentFrame).toBe(frames[0]);

    driver.advanceFrame(THREE_STEPS);
    expect(counts.frames).toBe(2);
  });

  it("returns the loop's interpolation alpha", () => {
    const { driver } = harness();
    const alpha = driver.advanceFrame(3.5 * DT);
    expect(alpha).toBeCloseTo(0.5, 6);
  });
});

describe("the launch pre-roll (quick 261118-os8)", () => {
  const preRollSteps = Math.round(LAUNCH_PRE_ROLL_DURATION / DT);

  /** Run one-step frames until `total` fixed steps have run. */
  function runSteps(h: Harness, total: number): void {
    let guard = 0;
    while (h.stepCommands.length < total && guard < 10_000) {
      h.driver.advanceFrame(DT);
      guard += 1;
    }
    expect(h.stepCommands).toHaveLength(total);
  }

  const launches = (h: Harness): number =>
    h.stepCommands.flat().filter((command) => command.kind === "launch").length;

  it("turns a launch press into the pre-roll: no autosave and no launch command yet", () => {
    const h = harness({ preRoll: true });
    h.queue.push(launch);
    h.driver.advanceFrame(THREE_STEPS);
    expect(h.sequence.preRolling).toBe(true);
    expect(h.log.filter((entry) => entry === "onPreRollStart")).toHaveLength(1);
    expect(h.log.some((entry) => entry.startsWith("autosave"))).toBe(false);
    expect(launches(h)).toBe(0);
    expect(h.ctx.core.state?.mode).toBe("docked");
  });

  it("launches on the step that ends the pre-roll, right after the one D-17 anchor taken while docked", () => {
    const h = harness({ preRoll: true });
    const clock = h.ctx.core.state?.clockSeconds;
    h.queue.push(launch);
    runSteps(h, preRollSteps - 1);
    // The docked steps change nothing the player can see (step.ts block 5).
    expect(h.ctx.core.state?.mode).toBe("docked");
    expect(h.ctx.core.state?.clockSeconds).toBe(clock);
    expect(h.ctx.core.state?.launchCount).toBe(0);
    expect(launches(h)).toBe(0);
    expect(h.log.some((entry) => entry.startsWith("autosave"))).toBe(false);

    runSteps(h, preRollSteps);
    expect(h.ctx.core.state?.mode).toBe("launching");
    expect(h.stepCommands[preRollSteps - 1]?.[0]).toEqual(launch);
    expect(launches(h)).toBe(1);
    const autosaves = h.log.filter((entry) => entry.startsWith("autosave"));
    expect(autosaves).toEqual(["autosave docked"]);
    const steps = h.log
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry === "stepFlight");
    const launchStep = steps[preRollSteps - 1];
    if (launchStep === undefined) throw new Error("no launch step");
    expect(h.log[launchStep.index - 1]).toBe("autosave docked");
    expect(h.sequence.preRolling).toBe(false);
  });

  it("gives one pre-roll, one autosave and one launch for repeated presses", () => {
    const h = harness({ preRoll: true });
    h.queue.push(launch, launch);
    runSteps(h, 10);
    h.pending.push(launch);
    runSteps(h, preRollSteps + 20);
    expect(h.log.filter((entry) => entry === "onPreRollStart")).toHaveLength(1);
    expect(h.log.filter((entry) => entry.startsWith("autosave"))).toHaveLength(
      1,
    );
    expect(launches(h)).toBe(1);
    expect(h.ctx.core.state?.launchCount).toBe(1);
  });

  it("launches on the next step after a skip and leaves skipLaunch for the next frame", () => {
    const h = harness({ preRoll: true });
    h.sequence.markSeen();
    h.queue.push(launch);
    runSteps(h, 10);
    h.sequence.skipPreRoll();
    runSteps(h, 11);
    expect(h.ctx.core.state?.mode).toBe("launching");
    expect(h.stepCommands[10]?.[0]).toEqual(launch);
    expect(h.pending).toEqual([{ kind: "skipLaunch" }]);
    expect(h.log.filter((entry) => entry.startsWith("autosave"))).toEqual([
      "autosave docked",
    ]);
    runSteps(h, 12);
    expect(h.ctx.core.state?.mode).toBe("inFlight");
    expect(h.ctx.core.state?.launchCount).toBe(1);
  });

  it("cancels the pre-roll when the state leaves the docked home screen", () => {
    const h = harness({ preRoll: true });
    h.queue.push(launch);
    runSteps(h, 10);
    h.ctx.station.stationScreen = "market";
    runSteps(h, preRollSteps + 10);
    expect(h.log).toContain("cancelPreRoll");
    expect(h.sequence.preRolling).toBe(false);
    expect(launches(h)).toBe(0);
    expect(h.log.some((entry) => entry.startsWith("autosave"))).toBe(false);
    expect(h.ctx.core.state?.mode).toBe("docked");
  });

  it("keeps the direct path with a zero-length pre-roll (the manual clock)", () => {
    const h = harness();
    h.queue.push(launch);
    h.driver.advanceFrame(DT);
    expect(h.log.filter((entry) => entry === "onPreRollStart")).toHaveLength(0);
    expect(h.stepCommands[0]).toEqual([launch]);
    expect(h.log.slice(0, 2)).toEqual(["autosave docked", "stepFlight"]);
    expect(h.ctx.core.state?.mode).toBe("launching");
  });
});

describe("stepOnce, the single flight step", () => {
  it("dispatches the step's events through the router in emission order", () => {
    const { driver, log } = harness();
    driver.stepOnce([launch], {
      pitch: 0,
      roll: 0,
      speed: 0,
      precision: false,
    });
    expect(log).toEqual(["stepFlight", "stationFlow launched"]);
  });

  it("advances the launch timeline only after a step that started in launching", () => {
    const { driver, queue, advances, counts } = harness();
    queue.push(launch);

    // Step one starts docked and enters launching; steps two and three start in
    // launching, so the timeline advances twice.
    driver.advanceFrame(THREE_STEPS);

    expect(counts.advances).toBe(2);
    expect(advances).toEqual([
      { dt: DT, skipped: false },
      { dt: DT, skipped: false },
    ]);
  });

  it("never advances the timeline for steps that start docked or in flight", () => {
    const docked = harness();
    docked.driver.advanceFrame(THREE_STEPS);
    expect(docked.counts.advances).toBe(0);

    const flying = harness({ mode: "inFlight" });
    flying.driver.advanceFrame(THREE_STEPS);
    expect(flying.counts.advances).toBe(0);
  });

  it("hands the loaded NPC masses to the step, and no key without them (plan 12-08)", () => {
    const seen: unknown[] = [];
    hooks.onOptions = (options) => {
      seen.push(options);
    };
    const plain = harness({ mode: "inFlight" });
    plain.driver.advanceFrame(DT);
    const masses = [{ specKey: "viper", mass: 34_040.6796875 }];
    const flight = flightTableFrom([VIPER_FLIGHT_RECORD]);
    const loaded = harness({ mode: "inFlight" });
    loaded.ctx.core.npcTraffic = {
      catalogue: [],
      records: [],
      masses,
      flight,
      weapons: new Map(),
    };
    loaded.driver.advanceFrame(DT);
    expect(seen).toHaveLength(2);
    const [without, withMasses] = seen as {
      hyperspace?: { shipMasses?: unknown };
      npcFlight?: unknown;
    }[];
    expect(without?.hyperspace).not.toHaveProperty("shipMasses");
    expect(withMasses?.hyperspace?.shipMasses).toBe(masses);
    // The compiled flight table travels the same way (AI-01, plan 14-18): the
    // same list reaches the step, and the key is absent without traffic.
    expect(without).not.toHaveProperty("npcFlight");
    expect(withMasses?.npcFlight).toBe(flight);
  });

  it("moves the pose window forward by one step", () => {
    const { ctx, driver } = harness({ mode: "inFlight" });
    const before = ctx.core.currentPose;
    driver.stepOnce([], { pitch: 0, roll: 0, speed: 1, precision: false });
    expect(ctx.core.previousPose).toBe(before);
    expect(ctx.core.currentPose).not.toBe(before);
  });
});

describe("combat wiring (plan 13-11, CBT-04 to CBT-07)", () => {
  /** Far from the station and the planet, so nothing mass-locks the player. */
  const FAR = vec(1e7, 0, 0);

  /** Park the harness's flying player at `FAR`, nose to -Z, at rest. */
  function parked(options: Parameters<typeof harness>[0]): Harness {
    const built = harness({ mode: "inFlight", combat: true, ...options });
    const state = built.ctx.core.state;
    if (state === undefined) throw new Error("the harness has no state");
    state.position = FAR;
    state.orientation = identity();
    state.speed = 0;
    return built;
  }

  function firedEvents(built: Harness): SimEvent[] {
    return built.dispatched.filter((event) => event.kind === "laserFired");
  }

  it("holding fire in flight fires the profile's laser through the router and heats its facing", () => {
    const built = parked({ fire: true });
    const combat = built.ctx.core.combat;
    if (combat === undefined) throw new Error("no combat state");
    expect(combat.laserTemp.fore).toBe(0);

    built.driver.stepOnce([], { ...IDLE, fire: true });

    expect(firedEvents(built)).toHaveLength(1);
    // The shot heats the nose laser; the same tick's cooling takes a little
    // back, so the temperature sits just under the shot's heat.
    const heat = LASER_STATS.EQ_WEAPON_PULSE_LASER.shotTemperature;
    expect(combat.laserTemp.fore).toBeGreaterThan(heat - 1);
    expect(combat.laserTemp.fore).toBeLessThanOrEqual(heat);
    expect(combat.shotTicks.aft).toBeGreaterThan(combat.shotTicks.fore);
  });

  it("takes the mounts from the profile: an empty nose fires nothing, a fitted aft beam fires on the aft view", () => {
    const emptyNose = parked({ fire: true });
    emptyNose.ctx.core.profile = {
      ...emptyNose.ctx.core.profile,
      laserMounts: { ...DEFAULT_LASER_MOUNTS, fore: NO_LASER },
    };
    emptyNose.driver.stepOnce([], { ...IDLE, fire: true });
    expect(firedEvents(emptyNose)).toHaveLength(0);

    const aft = parked({ fire: true });
    aft.ctx.core.profile = {
      ...aft.ctx.core.profile,
      laserMounts: {
        ...DEFAULT_LASER_MOUNTS,
        fore: NO_LASER,
        aft: "EQ_WEAPON_BEAM_LASER",
      },
    };
    aft.driver.stepOnce([{ kind: "setView", view: "aft" }], {
      ...IDLE,
      fire: true,
    });
    expect(firedEvents(aft)).toHaveLength(1);
    expect(aft.ctx.core.combat?.view).toBe("aft");
    expect(aft.ctx.core.combat?.laserTemp.aft).toBeGreaterThan(0);
    expect(aft.ctx.core.combat?.laserTemp.fore).toBe(0);
  });

  it("hands the hull table and the NPC weapons to the step, so a shot hits a Viper ahead", () => {
    const built = parked({ fire: true });
    const lifecycle = createWorldLifecycle({ traffic: false });
    lifecycle.begin(1);
    built.ctx.core.worldLifecycle = lifecycle;
    built.ctx.core.hulls = realHullTable();
    built.ctx.core.npcTraffic = {
      catalogue: [],
      records: [],
      masses: [],
      flight: [],
      weapons: realNpcWeapons(),
    };
    const world = lifecycle.world;
    if (world === undefined) throw new Error("no world");
    const spawned = spawnEntity(
      world,
      {
        kind: "ship",
        specKey: "viper",
        scanClass: "CLASS_NEUTRAL",
        position: vec(FAR.x, FAR.y, FAR.z - 1500),
        orientation: identity(),
        radius: 30,
        maxEnergy: 180,
      },
      0,
    );
    if (!spawned.ok) throw new Error(`spawn refused: ${spawned.reason}`);
    const seen: unknown[] = [];
    hooks.onOptions = (options) => {
      seen.push(options);
    };

    built.driver.stepOnce([], { ...IDLE, fire: true });

    const hits = built.dispatched.filter((event) => event.kind === "shipHit");
    expect(hits).toHaveLength(1);
    expect(spawned.entity.energy).toBeLessThan(180);
    const [options] = seen as {
      combat?: { hulls?: unknown; npcWeapons?: unknown; mounts?: unknown };
    }[];
    expect(options?.combat?.hulls).toBe(built.ctx.core.hulls);
    expect(options?.combat?.npcWeapons).toBe(built.ctx.core.npcTraffic.weapons);
    expect(options?.combat?.mounts).toBe(built.ctx.core.profile.laserMounts);
  });

  it("hands a traffic-on step the content's debris under combat.debris (plan 16-06)", () => {
    const built = parked({});
    const debris = debrisFixture();
    built.ctx.core.npcTraffic = {
      catalogue: [],
      records: [],
      masses: [],
      flight: [],
      weapons: realNpcWeapons(),
      debris,
    };
    const seen: unknown[] = [];
    hooks.onOptions = (options) => {
      seen.push(options);
    };
    built.driver.stepOnce([], IDLE);
    const [options] = seen as { combat?: { debris?: unknown } }[];
    expect(options?.combat?.debris).toBe(debris);
  });

  it("without the hull chunk (traffic off) a shot is drawn but hits nothing", () => {
    const built = parked({ fire: true });
    const lifecycle = createWorldLifecycle({ traffic: false });
    lifecycle.begin(1);
    built.ctx.core.worldLifecycle = lifecycle;
    const world = lifecycle.world;
    if (world === undefined) throw new Error("no world");
    spawnEntity(
      world,
      {
        kind: "ship",
        specKey: "viper",
        scanClass: "CLASS_NEUTRAL",
        position: vec(FAR.x, FAR.y, FAR.z - 1500),
        orientation: identity(),
        radius: 30,
        maxEnergy: 180,
      },
      0,
    );
    const seen: unknown[] = [];
    hooks.onOptions = (options) => {
      seen.push(options);
    };

    built.driver.stepOnce([], { ...IDLE, fire: true });

    expect(firedEvents(built)).toHaveLength(1);
    expect(built.dispatched.some((event) => event.kind === "shipHit")).toBe(
      false,
    );
    const [options] = seen as { combat?: object }[];
    expect(options?.combat).not.toHaveProperty("hulls");
    expect(options?.combat).not.toHaveProperty("npcWeapons");
    expect(options?.combat).not.toHaveProperty("debris");
  });

  it("steps without combat before the combat state exists, and never fires then", () => {
    const built = harness({ mode: "inFlight", fire: true });
    expect(built.ctx.core.combat).toBeUndefined();
    built.driver.stepOnce([], { ...IDLE, fire: true });
    expect(firedEvents(built)).toHaveLength(0);
  });

  it("the chart-behind steps use the zero frame, so nothing fires there", () => {
    const built = parked({ fire: true });
    built.ctx.chart.chartOpen = true;
    built.driver.advanceBehind(THREE_STEPS);
    expect(firedEvents(built)).toHaveLength(0);
    expect(built.ctx.core.combat?.laserTemp.fore).toBe(0);
  });
});

describe("advanceBehind, the steps behind the open chart (WORLD-11)", () => {
  it("runs the whole steps the delta owes with no commands and the zero frame, never draining the keyboard", () => {
    const h = harness({ mode: "inFlight" });
    // A held pitch input and a queued command must reach nothing here.
    const heldPitch: InputFrame = {
      pitch: 1,
      roll: 1,
      speed: 1,
      precision: true,
    };
    h.queue.push(launch);
    h.pending.push(launch);
    h.ctx.runtime.input = {
      drainCommands: () => {
        h.counts.drains += 1;
        return h.queue.splice(0);
      },
      frame: () => {
        h.counts.frames += 1;
        return heldPitch;
      },
    } as unknown as KeyboardInputSource;
    const start = h.ctx.core.state?.tick ?? -1;

    h.driver.advanceBehind(THREE_STEPS);

    expect(h.ctx.core.state?.tick).toBe(start + 3);
    expect(h.stepCommands).toEqual([[], [], []]);
    expect(h.seenFrames).toHaveLength(3);
    for (const seen of h.seenFrames) {
      expect(seen).toEqual({ pitch: 0, roll: 0, speed: 0, precision: false });
    }
    expect(h.ctx.core.currentFrame).toEqual({
      pitch: 0,
      roll: 0,
      speed: 0,
      precision: false,
    });
    // No drain, no input frame read, `pending` and the queue untouched.
    expect(h.counts.drains).toBe(0);
    expect(h.counts.frames).toBe(0);
    expect(h.queue).toEqual([launch]);
    expect(h.pending).toEqual([launch]);
  });

  it("never autosaves and never taints the session", () => {
    const h = harness({ mode: "inFlight" });
    h.driver.advanceBehind(THREE_STEPS);
    expect(h.log.some((entry) => entry.startsWith("autosave"))).toBe(false);
    expect(h.log).not.toContain("markHookMutation");
    expect(h.ctx.runtime.testTainted).toBe(false);
  });

  it("keeps the same step bounds as advanceFrame: at most MAX_STEPS_PER_FRAME steps", () => {
    const h = harness({ mode: "inFlight" });
    h.driver.advanceBehind(10);
    expect(h.stepCommands).toHaveLength(MAX_STEPS_PER_FRAME);
  });

  it("keeps a running countdown decrementing", () => {
    const h = harness({ mode: "inFlight" });
    const state = h.ctx.core.state;
    if (state === undefined) throw new Error("no state");
    state.hyperspaceCountdown = 100;

    h.driver.advanceBehind(THREE_STEPS);

    expect(state.hyperspaceCountdown).toBe(97);
  });

  it("does nothing without a state, an input source or a game loop", () => {
    const noState = harness({ mode: "inFlight" });
    noState.ctx.core.state = undefined;
    noState.driver.advanceBehind(THREE_STEPS);
    expect(noState.stepCommands).toHaveLength(0);

    const noLoop = harness({ mode: "inFlight" });
    noLoop.ctx.runtime.loop = undefined;
    noLoop.driver.advanceBehind(THREE_STEPS);
    expect(noLoop.stepCommands).toHaveLength(0);

    const noInput = harness({ mode: "inFlight" });
    noInput.ctx.runtime.input = undefined;
    noInput.driver.advanceBehind(THREE_STEPS);
    expect(noInput.stepCommands).toHaveLength(0);
  });
});

describe("the manual clock (tracer)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("advanceTicks steps exactly n ticks, taints before the pre-launch autosave, and a frame then leaves the tick alone", () => {
    const { ctx, driver, log, pending } = harness({ manual: true });
    ctx.station.stationScreen = "home";
    pending.push(launch);
    const startTick = ctx.core.state?.tick ?? -1;

    const tick = driver.advanceTicks(5);

    expect(tick).toBe(startTick + 5);
    expect(ctx.core.state?.tick).toBe(startTick + 5);
    expect(ctx.core.state?.mode).toBe("launching");
    expect(log.indexOf("markHookMutation")).toBeGreaterThanOrEqual(0);
    expect(log.indexOf("markHookMutation")).toBeLessThan(
      log.indexOf("autosave docked"),
    );
    expect(ctx.runtime.testTainted).toBe(true);

    vi.stubGlobal("requestAnimationFrame", () => 1);
    const renders: number[] = [];
    const input = ctx.runtime.input as unknown as Record<string, unknown>;
    ctx.runtime.input = {
      ...input,
      consumePauseToggle: () => false,
      drainChartActions: () => [],
      drainSaveScreenActions: () => [],
      drainStationActions: () => [],
    } as unknown as KeyboardInputSource;
    const frame = createFrameLoop(ctx, {
      probe: { frames: 0 },
      pending,
      redrawGate: { request: () => undefined },
      simDriver: driver,
      renderFrame: (alpha) => {
        renders.push(alpha);
      },
      shouldDraw: () => true,
      pause: () => undefined,
      resume: () => undefined,
      handleChartActions: () => undefined,
      handleSaveScreenActions: () => undefined,
      applyStationAction: () => undefined,
      updateProbe: () => undefined,
    });
    frame(1000);
    frame(2000);

    expect(ctx.core.state?.tick).toBe(startTick + 5);
    expect(renders).toEqual([1, 1]);
  });
});

describe("the docked message clock (quick task 261117-u3m)", () => {
  // Oolite draws the message area on every screen, docked ones included, and
  // counts each row down with the frame delta (Universe.m:4735-4736,
  // 4810-4827; GuiDisplayGen.m:1308-1312, 1327-1336). The flight time stands
  // still while docked, so the loop adds the wall delta to its own clock.
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function looped(
    options: {
      readonly mode?: "docked" | "inFlight";
      readonly manual?: boolean;
    } = {},
  ) {
    const h = harness(options);
    vi.stubGlobal("requestAnimationFrame", () => 1);
    const input = h.ctx.runtime.input as unknown as Record<string, unknown>;
    h.ctx.runtime.input = {
      ...input,
      consumePauseToggle: () => false,
      drainChartActions: () => [],
      drainSaveScreenActions: () => [],
      drainStationActions: () => [],
    } as unknown as KeyboardInputSource;
    const frame = createFrameLoop(h.ctx, {
      probe: { frames: 0 },
      pending: h.pending,
      redrawGate: { request: () => undefined },
      simDriver: { advanceFrame: () => 0, advanceBehind: () => undefined },
      renderFrame: () => undefined,
      shouldDraw: () => false,
      pause: () => undefined,
      resume: () => undefined,
      handleChartActions: () => undefined,
      handleSaveScreenActions: () => undefined,
      applyStationAction: () => undefined,
      updateProbe: () => undefined,
    });
    return { ctx: h.ctx, frame };
  }

  it("adds the frame delta while docked, the first frame adding nothing", () => {
    const { ctx, frame } = looped();
    expect(ctx.runtime.dockedMessageSeconds).toBe(0);
    frame(1000);
    expect(ctx.runtime.dockedMessageSeconds).toBe(0);
    frame(1016);
    expect(ctx.runtime.dockedMessageSeconds).toBeCloseTo(0.016, 12);
  });

  it("keeps counting with the chart open while docked", () => {
    const { ctx, frame } = looped();
    ctx.chart.chartOpen = true;
    frame(1000);
    frame(1500);
    expect(ctx.runtime.dockedMessageSeconds).toBeCloseTo(0.5, 12);
  });

  it("adds nothing while paused, under the manual clock or in flight", () => {
    const paused = looped();
    paused.ctx.runtime.paused = true;
    paused.frame(1000);
    paused.frame(1016);
    expect(paused.ctx.runtime.dockedMessageSeconds).toBe(0);

    const manual = looped({ manual: true });
    manual.frame(1000);
    manual.frame(1016);
    expect(manual.ctx.runtime.dockedMessageSeconds).toBe(0);

    const flying = looped({ mode: "inFlight" });
    flying.frame(1000);
    flying.frame(1016);
    expect(flying.ctx.runtime.dockedMessageSeconds).toBe(0);
  });

  it("adds nothing for a negative or non-finite delta", () => {
    const backwards = looped();
    backwards.frame(2000);
    backwards.frame(1000);
    expect(backwards.ctx.runtime.dockedMessageSeconds).toBe(0);

    const broken = looped();
    broken.frame(1000);
    broken.frame(Number.NaN);
    broken.frame(Number.POSITIVE_INFINITY);
    expect(broken.ctx.runtime.dockedMessageSeconds).toBe(0);
  });
});

describe("advanceTicks, the refusal table", () => {
  const unsafe: readonly [string, number][] = [
    ["zero", 0],
    ["a negative count", -1],
    ["a fraction", 1.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["one past the cap", MAX_ADVANCE_TICKS + 1],
  ];

  /** Nothing stepped, drained, tainted or autosaved; the tick is unchanged. */
  function expectRefused(h: Harness, tick: number, result: number): void {
    expect(result).toBe(tick);
    expect(h.ctx.core.state?.tick ?? 0).toBe(tick);
    expect(h.stepCommands).toHaveLength(0);
    expect(h.counts.drains).toBe(0);
    expect(h.counts.frames).toBe(0);
    expect(h.log).toEqual([]);
    expect(h.ctx.runtime.testTainted).toBe(false);
  }

  it.each(unsafe)("refuses %s", (_name, n) => {
    const h = harness({ manual: true });
    h.ctx.station.stationScreen = "home";
    h.pending.push(launch);
    expectRefused(h, 0, h.driver.advanceTicks(n));
    expect(h.pending).toEqual([launch]);
  });

  it("accepts the cap itself as a valid count (one tick before it is refused)", () => {
    // MAX_ADVANCE_TICKS is the largest accepted n; running it in full is the
    // test's cost, so the boundary is pinned on the constant and on n = 1.
    expect(MAX_ADVANCE_TICKS).toBe(200_000);
    const h = harness({ manual: true });
    expect(h.driver.advanceTicks(1)).toBe(1);
  });

  it("refuses while the session is disposed, before taint and drain", () => {
    const h = harness({ manual: true });
    h.ctx.runtime.disposed = true;
    expectRefused(h, 0, h.driver.advanceTicks(3));
  });

  it("refuses while paused", () => {
    const h = harness({ manual: true });
    h.ctx.runtime.paused = true;
    expectRefused(h, 0, h.driver.advanceTicks(3));
  });

  it("refuses while the chart is open and the ship is docked", () => {
    const h = harness({ manual: true });
    h.ctx.chart.chartOpen = true;
    expectRefused(h, 0, h.driver.advanceTicks(3));
  });

  it("refuses while the chart is open and the ship is launching", () => {
    const h = harness({ manual: true });
    if (h.ctx.core.state !== undefined) h.ctx.core.state.mode = "launching";
    h.ctx.chart.chartOpen = true;
    expectRefused(h, 0, h.driver.advanceTicks(3));
  });

  it("refuses while the Save/Load screen is open", () => {
    const h = harness({ manual: true });
    h.ctx.save.saveScreenOpen = true;
    expectRefused(h, 0, h.driver.advanceTicks(3));
  });

  it("refuses without the manual clock, with or without the hook", () => {
    const plain = harness();
    expectRefused(plain, 0, plain.driver.advanceTicks(3));

    const hooked = harness();
    hooked.ctx.runtime.testFlags = parseTestFlags("?test=1");
    expectRefused(hooked, 0, hooked.driver.advanceTicks(3));

    const inert = harness();
    inert.ctx.runtime.testFlags = parseTestFlags("?clock=manual");
    expectRefused(inert, 0, inert.driver.advanceTicks(3));
  });

  it("returns 0 and does nothing without a state", () => {
    const h = harness({ manual: true });
    h.ctx.core.state = undefined;
    expectRefused(h, 0, h.driver.advanceTicks(5));
  });

  it("returns the live tick, not zero, when it refuses a started state", () => {
    const h = harness({ manual: true });
    expect(h.driver.advanceTicks(2)).toBe(2);
    h.log.length = 0;
    h.stepCommands.length = 0;
    h.counts.drains = 0;
    h.counts.frames = 0;
    h.ctx.runtime.testTainted = false;
    expect(h.driver.advanceTicks(0)).toBe(2);
    expect(h.stepCommands).toHaveLength(0);
    expect(h.log).toEqual([]);
  });
});

describe("advanceTicks, the stepping contract", () => {
  it("taints, then autosaves, then steps three ticks with the commands on the first only", () => {
    const { ctx, driver, log, pending, stepCommands, counts } = harness({
      manual: true,
    });
    ctx.station.stationScreen = "home";
    pending.push(launch);
    const start = ctx.core.state?.tick ?? -1;

    const tick = driver.advanceTicks(3);

    expect(tick).toBe(start + 3);
    expect(counts.drains).toBe(1);
    expect(counts.frames).toBe(1);
    expect(pending).toHaveLength(0);
    expect(log.filter((entry) => entry === "markHookMutation")).toHaveLength(1);
    expect(log.filter((entry) => entry.startsWith("autosave"))).toEqual([
      "autosave docked",
    ]);
    expect(log.slice(0, 3)).toEqual([
      "markHookMutation",
      "autosave docked",
      "stepFlight",
    ]);
    expect(log.filter((entry) => entry === "stepFlight")).toHaveLength(3);
    expect(stepCommands).toEqual([[launch], [], []]);
  });

  it("matches n single-tick drains for the realtime path's per-step commands", () => {
    // The same launch drained through advanceFrame reaches the same first-step
    // command list and the same autosave: the manual clock shares the drain.
    const manual = harness({ manual: true });
    manual.ctx.station.stationScreen = "home";
    manual.queue.push(launch);
    manual.driver.advanceTicks(3);

    const realtime = harness();
    realtime.queue.push(launch);
    realtime.driver.advanceFrame(THREE_STEPS);

    expect(manual.stepCommands).toEqual(realtime.stepCommands);
    expect(manual.log.filter((entry) => entry.startsWith("autosave"))).toEqual(
      realtime.log.filter((entry) => entry.startsWith("autosave")),
    );
    expect(manual.ctx.core.state?.tick).toBe(realtime.ctx.core.state?.tick);
  });

  it("shares one input frame across every step and never mutates it", () => {
    const h = harness({ manual: true, mode: "inFlight" });
    const original = h.ctx.runtime.input as unknown as {
      frame: () => InputFrame;
    };
    let snapshot: InputFrame | undefined;
    h.ctx.runtime.input = {
      ...(original as object),
      drainCommands: () => h.queue.splice(0),
      frame: () => {
        const next = original.frame();
        snapshot = structuredClone(next);
        return next;
      },
    } as unknown as KeyboardInputSource;

    h.driver.advanceTicks(3);

    expect(h.seenFrames).toHaveLength(3);
    for (const seen of h.seenFrames) expect(seen).toBe(h.frames[0]);
    expect(h.ctx.core.currentFrame).toBe(h.frames[0]);
    expect(snapshot).toBeDefined();
    expect(h.frames[0]).toEqual(snapshot);
  });

  it("propagates a throwing step, stays tainted and never autosaves after it", () => {
    const h = harness({ manual: true });
    const start = h.ctx.core.state?.tick ?? -1;
    const boom = new Error("step failed");
    let calls = 0;
    hooks.onStep = () => {
      h.log.push("stepFlight");
      calls += 1;
      if (calls === 2) {
        h.log.push("throw");
        throw boom;
      }
    };

    expect(() => h.driver.advanceTicks(3)).toThrow(boom);

    expect(h.ctx.runtime.testTainted).toBe(true);
    expect(h.ctx.core.state?.tick).toBe(start + 1);
    const thrownAt = h.log.indexOf("throw");
    expect(thrownAt).toBeGreaterThan(0);
    expect(
      h.log.slice(thrownAt).filter((entry) => entry.startsWith("autosave")),
    ).toEqual([]);
  });

  it("stops after the step that pauses the session", () => {
    const h = harness({ manual: true });
    const start = h.ctx.core.state?.tick ?? -1;
    let calls = 0;
    hooks.onStep = () => {
      calls += 1;
      if (calls === 2) h.ctx.runtime.paused = true;
    };

    expect(h.driver.advanceTicks(5)).toBe(start + 2);
    expect(calls).toBe(2);
  });

  it("stops after the step that opens the chart", () => {
    const h = harness({ manual: true });
    const start = h.ctx.core.state?.tick ?? -1;
    let calls = 0;
    hooks.onStep = () => {
      calls += 1;
      if (calls === 2) h.ctx.chart.chartOpen = true;
    };

    expect(h.driver.advanceTicks(5)).toBe(start + 2);
    expect(calls).toBe(2);
  });

  it("steps behind the open chart in flight: no drain, no commands, the zero frame", () => {
    const h = harness({ manual: true, mode: "inFlight" });
    h.ctx.chart.chartOpen = true;
    h.queue.push(launch);
    h.pending.push(launch);
    const start = h.ctx.core.state?.tick ?? -1;

    expect(h.driver.advanceTicks(4)).toBe(start + 4);

    expect(h.stepCommands).toEqual([[], [], [], []]);
    expect(h.counts.drains).toBe(0);
    expect(h.counts.frames).toBe(0);
    expect(h.queue).toEqual([launch]);
    expect(h.pending).toEqual([launch]);
    for (const seen of h.seenFrames) {
      expect(seen).toEqual({ pitch: 0, roll: 0, speed: 0, precision: false });
    }
    expect(h.ctx.core.currentFrame).toEqual({
      pitch: 0,
      roll: 0,
      speed: 0,
      precision: false,
    });
    // Still a test-hook mutation: tainted before the first step, no autosave.
    expect(h.ctx.runtime.testTainted).toBe(true);
    expect(h.log.some((entry) => entry.startsWith("autosave"))).toBe(false);
  });

  it("stops after the step that closes the chart behind which it was stepping", () => {
    const h = harness({ manual: true, mode: "inFlight" });
    h.ctx.chart.chartOpen = true;
    const start = h.ctx.core.state?.tick ?? -1;
    let calls = 0;
    hooks.onStep = () => {
      calls += 1;
      if (calls === 2) h.ctx.chart.chartOpen = false;
    };

    expect(h.driver.advanceTicks(5)).toBe(start + 2);
    expect(calls).toBe(2);
  });

  it("stops after the step that opens the chart in flight", () => {
    const h = harness({ manual: true, mode: "inFlight" });
    const start = h.ctx.core.state?.tick ?? -1;
    let calls = 0;
    hooks.onStep = () => {
      calls += 1;
      if (calls === 2) h.ctx.chart.chartOpen = true;
    };

    expect(h.driver.advanceTicks(5)).toBe(start + 2);
    expect(calls).toBe(2);
  });

  it("stops after the step that opens the Save/Load screen", () => {
    const h = harness({ manual: true });
    const start = h.ctx.core.state?.tick ?? -1;
    let calls = 0;
    hooks.onStep = () => {
      calls += 1;
      if (calls === 2) h.ctx.save.saveScreenOpen = true;
    };

    expect(h.driver.advanceTicks(5)).toBe(start + 2);
    expect(calls).toBe(2);
  });

  it("stops after the step that disposes the session", () => {
    const h = harness({ manual: true });
    const start = h.ctx.core.state?.tick ?? -1;
    let calls = 0;
    hooks.onStep = () => {
      calls += 1;
      if (calls === 2) h.ctx.runtime.disposed = true;
    };

    expect(h.driver.advanceTicks(5)).toBe(start + 2);
    expect(calls).toBe(2);
  });
});

describe("markHookMutation, taint equivalence with the hook's mutate callback", () => {
  function publisherHarness() {
    const ctx = createSessionState({
      system: lave.system,
      saveStatus: "absent",
      saveSkipReason: "",
    });
    const probe = {} as WegoliteProbe;
    const gate = createRedrawGate();
    const renderer = {
      info: {
        render: { calls: 0, triangles: 0, frame: 0 },
        memory: { geometries: 0, textures: 0 },
        programs: [],
      },
    };
    const publisher = createProbePublisher(ctx, {
      probe,
      renderer: renderer as never,
      scenes: { quality: () => "standard" },
      saveProbe: {
        status: "absent",
        attempts: 0,
        writes: 0,
        committed: 0,
        revision: 0,
        lastClock: null,
        continueVisible: false,
        skipReason: "",
        unavailable: false,
      },
      redrawGate: gate,
      messages: createMessageQueue(),
      commitProfile: () => false,
      swapSystem: () => Promise.resolve(),
      disposeSystem: () => undefined,
      advanceTicks: () => 0,
    });
    const state = initFlightState(lave.layout);
    ctx.core.state = state;
    publisher.bindTestHook(state);
    // Let the gate settle on the idle docked state.
    const keys = [state];
    while (gate.next(true, keys)) gate.drawn(keys);
    expect(gate.next(true, keys)).toBe(false);
    return { ctx, probe, gate, publisher, keys };
  }

  it("markHookMutation and a hook mutation have the same observable effects", () => {
    const viaDriver = publisherHarness();
    expect(viaDriver.ctx.runtime.testTainted).toBe(false);
    viaDriver.publisher.markHookMutation();
    viaDriver.publisher.updateProbe();

    const viaHook = publisherHarness();
    expect(viaHook.ctx.runtime.testTainted).toBe(false);
    viaHook.probe.test?.setSpeed(42);
    viaHook.publisher.updateProbe();

    for (const side of [viaDriver, viaHook]) {
      expect(side.ctx.runtime.testTainted).toBe(true);
      expect(side.probe.test?.tainted).toBe(true);
      expect(side.gate.next(true, side.keys)).toBe(true);
    }
  });
});

describe("the session's pending-queue resets", () => {
  it("keeps four `pending` resets across the facade and the session modules", () => {
    const text = sessionSources()
      .map((entry) => entry.text)
      .join("\n");
    const resets = text.match(/pending\.length = 0;/g) ?? [];
    // The chart-open freeze, the save-screen freeze, the paused branch and the
    // sim driver's command drain (Round 2 review 820a435 L142).
    expect(resets).toHaveLength(4);
  });
});

describe("buildStepOptions", () => {
  const systems = JSON.parse(
    readFileSync(
      new URL(
        "../../../src/content/generated/systems/g0.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as System[];
  const target = systems.find((entry) => entry.id !== lave.system.id);
  const noMassSystem = systems.find((entry) => entry.station !== "coriolis");
  if (target === undefined || noMassSystem === undefined) {
    throw new Error("the galaxy lacks a target or a non-Coriolis system");
  }
  const equipment = new Set<string>(["EQ_FUEL_SCOOPS"]);
  const dock = {
    marker: "dock",
  } as unknown as NonNullable<Parameters<typeof buildStepOptions>[0]["dock"]>;

  it("omits the target when none is committed and carries the dock geometry", () => {
    const options = buildStepOptions({
      fuel: 70,
      system: lave.system,
      target: undefined,
      equipment,
      dock,
      laserMounts: DEFAULT_LASER_MOUNTS,
    });
    expect(options).toEqual({
      dock,
      equipment,
      combat: { mounts: DEFAULT_LASER_MOUNTS },
      hyperspace: {
        fuel: 70,
        origin: {
          id: lave.system.id,
          x: lave.system.chartX,
          y: lave.system.chartY,
        },
        stationMass: expect.any(Number) as number,
      },
    });
    expect(options.hyperspace).not.toHaveProperty("target");
  });

  it("carries the target and the Coriolis station mass when both exist", () => {
    const options = buildStepOptions({
      fuel: 35,
      system: lave.system,
      target,
      equipment,
      dock,
      laserMounts: DEFAULT_LASER_MOUNTS,
    });
    expect(options.hyperspace?.target).toEqual({
      id: target.id,
      x: target.chartX,
      y: target.chartY,
    });
    expect(options.hyperspace).toHaveProperty("stationMass");
    expect(options.hyperspace?.fuel).toBe(35);
  });

  it("carries the ship masses under hyperspace.shipMasses and omits the key without them", () => {
    const shipMasses = [{ specKey: "viper", mass: 34_040.6796875 }];
    const withMasses = buildStepOptions({
      fuel: 70,
      system: lave.system,
      target: undefined,
      equipment,
      dock,
      shipMasses,
      laserMounts: DEFAULT_LASER_MOUNTS,
    });
    expect(withMasses.hyperspace?.shipMasses).toBe(shipMasses);
    const without = buildStepOptions({
      fuel: 70,
      system: lave.system,
      target: undefined,
      equipment,
      dock,
      laserMounts: DEFAULT_LASER_MOUNTS,
    });
    expect(without.hyperspace).not.toHaveProperty("shipMasses");
    expect(Object.keys(without.hyperspace ?? {})).not.toContain("shipMasses");
  });

  it("carries the NPC flight table under npcFlight and omits the key without it (plan 14-18)", () => {
    const npcFlight = flightTableFrom([VIPER_FLIGHT_RECORD]);
    const withTable = buildStepOptions({
      fuel: 70,
      system: lave.system,
      target: undefined,
      equipment,
      dock,
      laserMounts: DEFAULT_LASER_MOUNTS,
      npcFlight,
    });
    expect(withTable.npcFlight).toBe(npcFlight);
    const without = buildStepOptions({
      fuel: 70,
      system: lave.system,
      target: undefined,
      equipment,
      dock,
      laserMounts: DEFAULT_LASER_MOUNTS,
    });
    expect(Object.keys(without)).not.toContain("npcFlight");
    const undocked = buildStepOptions({
      fuel: 70,
      system: lave.system,
      target: undefined,
      equipment,
      dock: undefined,
      laserMounts: DEFAULT_LASER_MOUNTS,
      npcFlight,
    });
    expect(undocked.npcFlight).toBe(npcFlight);
    expect(undocked).not.toHaveProperty("dock");
  });

  it("has no dock key at all without a geometry", () => {
    const options = buildStepOptions({
      fuel: 70,
      system: lave.system,
      target: undefined,
      equipment,
      dock: undefined,
      laserMounts: DEFAULT_LASER_MOUNTS,
    });
    expect(Object.keys(options).sort()).toEqual([
      "combat",
      "equipment",
      "hyperspace",
    ]);
    expect(options).not.toHaveProperty("dock");
  });

  it("has no stationMass key for a station kind without a recorded mass", () => {
    const options = buildStepOptions({
      fuel: 70,
      system: noMassSystem,
      target: undefined,
      equipment,
      dock: undefined,
      laserMounts: DEFAULT_LASER_MOUNTS,
    });
    expect(options.hyperspace).not.toHaveProperty("stationMass");
    expect(options.hyperspace?.origin.id).toBe(noMassSystem.id);
  });

  it("always emits combat with the mounts, and the hull table and NPC weapons only when given (plan 13-11)", () => {
    const hulls = realHullTable();
    const npcWeapons = realNpcWeapons();
    const base = {
      fuel: 70,
      system: lave.system,
      target: undefined,
      equipment,
      dock: undefined,
    };
    const bare = buildStepOptions({
      ...base,
      laserMounts: DEFAULT_LASER_MOUNTS,
    });
    expect(bare.combat?.mounts).toBe(DEFAULT_LASER_MOUNTS);
    expect(Object.keys(bare.combat ?? {})).toEqual(["mounts"]);

    const full = buildStepOptions({
      ...base,
      laserMounts: DEFAULT_LASER_MOUNTS,
      hulls,
      npcWeapons,
    });
    expect(full.combat?.hulls).toBe(hulls);
    expect(full.combat?.npcWeapons).toBe(npcWeapons);
    expect(Object.keys(full.combat ?? {}).sort()).toEqual([
      "hulls",
      "mounts",
      "npcWeapons",
    ]);
  });

  it("carries the debris content under combat.debris only when given (plan 16-06)", () => {
    const debris = debrisFixture();
    const base = {
      fuel: 70,
      system: lave.system,
      target: undefined,
      equipment,
      dock: undefined,
      laserMounts: DEFAULT_LASER_MOUNTS,
    };
    expect(buildStepOptions({ ...base, debris }).combat?.debris).toBe(debris);
    expect(buildStepOptions(base).combat).not.toHaveProperty("debris");
  });
});
