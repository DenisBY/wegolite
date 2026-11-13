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
import {
  createEventRouter,
  type EventRouterSubscribers,
} from "../../../src/app/session/event-router.js";
import { createSessionState } from "../../../src/app/session/context.js";
import type { SessionState } from "../../../src/app/session/context.js";
import { createFrameLoop } from "../../../src/app/session/frame-loop.js";
import { createSimDriver } from "../../../src/app/session/sim-driver.js";
import { parseTestFlags } from "../../../src/app/session/test-flags.js";
import { buildStepOptions } from "../../../src/app/session/step-options.js";
import type { System } from "../../../src/content/types.js";
import type { KeyboardInputSource } from "../../../src/input/keyboard.js";
import type { Command } from "../../../src/sim/commands.js";
import {
  PlayerController,
  ScriptedLaunchController,
} from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { InputFrame } from "../../../src/sim/state.js";
import { DT } from "../../../src/sim/time.js";
import { sessionSources } from "../../helpers/session-source.js";
import { laveFixture } from "../../helpers/lave.js";

const hooks = vi.hoisted(() => ({
  onStep: (commands: readonly unknown[]): void => {
    void commands;
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
}

function harness(
  options: {
    readonly mode?: "docked" | "inFlight";
    /** Parse `?test=1&clock=manual` into the session's flags. */
    readonly manual?: boolean;
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
        return "flash";
      },
    },
    router: createEventRouter(ctx, subscribers),
    equipmentSet: () => new Set<string>(),
    targetSystem: () => undefined,
    autosave: () => {
      log.push(`autosave ${ctx.core.state?.mode ?? "none"}`);
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
  };
}

/** Three whole steps and a remainder: the loop runs exactly three steps. */
const THREE_STEPS = 3.5 * DT;

beforeEach(() => {
  hooks.onStep = () => undefined;
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

  it("moves the pose window forward by one step", () => {
    const { ctx, driver } = harness({ mode: "inFlight" });
    const before = ctx.core.currentPose;
    driver.stepOnce([], { pitch: 0, roll: 0, speed: 1, precision: false });
    expect(ctx.core.previousPose).toBe(before);
    expect(ctx.core.currentPose).not.toBe(before);
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
    });
    expect(options).toEqual({
      dock,
      equipment,
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
    });
    expect(options.hyperspace?.target).toEqual({
      id: target.id,
      x: target.chartX,
      y: target.chartY,
    });
    expect(options.hyperspace).toHaveProperty("stationMass");
    expect(options.hyperspace?.fuel).toBe(35);
  });

  it("has no dock key at all without a geometry", () => {
    const options = buildStepOptions({
      fuel: 70,
      system: lave.system,
      target: undefined,
      equipment,
      dock: undefined,
    });
    expect(Object.keys(options).sort()).toEqual(["equipment", "hyperspace"]);
    expect(options).not.toHaveProperty("dock");
  });

  it("has no stationMass key for a station kind without a recorded mass", () => {
    const options = buildStepOptions({
      fuel: 70,
      system: noMassSystem,
      target: undefined,
      equipment,
      dock: undefined,
    });
    expect(options.hyperspace).not.toHaveProperty("stationMass");
    expect(options.hyperspace?.origin.id).toBe(noMassSystem.id);
  });
});
