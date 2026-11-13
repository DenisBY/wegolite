// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The world lifecycle (Phase 8, plan 08-15; D-02, D-03, D-05, D-06 as amended
 * 2026-11-12, D-08, D-14).
 *
 * Node only. Expected values come from the decisions (the bump-then-derive rule,
 * epoch starting at 0, ids restarting at 101 in every new world, the world hash
 * equal to the flight hash while no NPC exists), never from running the code
 * under test twice.
 */

import { readFileSync } from "node:fs";
import { dirname, posix } from "node:path";

import { describe, expect, it } from "vitest";

import type { GameLoop } from "../../../src/app/game-loop.js";
import { createSessionState } from "../../../src/app/session/context.js";
import type { SessionState } from "../../../src/app/session/context.js";
import { createEventRouter } from "../../../src/app/session/event-router.js";
import { createSimDriver } from "../../../src/app/session/sim-driver.js";
import { createWorldLifecycle } from "../../../src/app/session/world-lifecycle.js";
import type { WorldLifecycle } from "../../../src/app/session/world-lifecycle.js";
import type { KeyboardInputSource } from "../../../src/input/keyboard.js";
import type { Command } from "../../../src/sim/commands.js";
import { DOCK_COMPUTER_KEY } from "../../../src/sim/dock/computer.js";
import {
  PlayerController,
  ScriptedLaunchController,
} from "../../../src/sim/flight/controller.js";
import { hashFlight, initFlightState } from "../../../src/sim/flight/state.js";
import { DT } from "../../../src/sim/time.js";
import { hashWorld } from "../../../src/sim/world/serialize.js";
import { laveFixture } from "../../helpers/lave.js";

const lave = laveFixture();
const MARKET_SEED = 0x12345678;
const launch: Command = { kind: "launch" };

interface Tracer {
  readonly ctx: SessionState;
  readonly lifecycle: WorldLifecycle;
  readonly queue: Command[];
  readonly step: () => void;
}

/**
 * A docked Lave session over the real sim driver, the real router (with the
 * real lifecycle subscriber) and a real lifecycle. The input double drains the
 * `queue`; the loop double runs exactly one fixed step per frame.
 */
function tracer(): Tracer {
  const ctx = createSessionState({
    system: lave.system,
    saveStatus: "absent",
    saveSkipReason: "",
  });
  ctx.core.state = initFlightState(lave.layout);
  ctx.core.layout = lave.layout;
  ctx.core.config = lave.config;
  ctx.core.marketSeed = MARKET_SEED;
  const lifecycle = createWorldLifecycle({ traffic: false });
  ctx.core.worldLifecycle = lifecycle;
  const queue: Command[] = [];
  ctx.runtime.input = {
    drainCommands: () => queue.splice(0),
    frame: () => ({ pitch: 0, roll: 0, speed: 0, precision: false }),
  } as unknown as KeyboardInputSource;
  ctx.runtime.loop = {
    advance: (
      _delta: number,
      commands: readonly Command[],
      stepOnce: (commands: readonly Command[]) => void,
    ) => {
      stepOnce(commands);
      return 0;
    },
  } as unknown as GameLoop;
  const quiet = (): void => undefined;
  const driver = createSimDriver(ctx, {
    pending: [],
    player: new PlayerController(),
    scripted: new ScriptedLaunchController(),
    launchSequence: { advance: () => "flash" },
    router: createEventRouter(ctx, {
      stationFlow: quiet,
      hudMessages: quiet,
      dockFeedback: quiet,
      hyperspaceFlow: quiet,
    }),
    equipmentSet: () => new Set([DOCK_COMPUTER_KEY]),
    targetSystem: () => undefined,
    autosave: quiet,
    markHookMutation: quiet,
  });
  return {
    ctx,
    lifecycle,
    queue,
    step: () => {
      driver.advanceFrame(DT);
    },
  };
}

describe("launch creates a world that steps through stepSim; docking drops it (tracer)", () => {
  it("has no world while docked and epoch 0 before the first launch", () => {
    const { ctx, lifecycle, step } = tracer();
    step();
    expect(ctx.core.state?.mode).toBe("docked");
    expect(lifecycle.world).toBeUndefined();
    expect(lifecycle.epoch).toBe(0);
  });

  it("the launched event bumps epoch to 1 and creates a world from worldSeedFor(marketSeed, 1)", () => {
    const { ctx, lifecycle, queue, step } = tracer();
    queue.push(launch);
    step();
    expect(ctx.core.state?.mode).toBe("launching");
    expect(lifecycle.epoch).toBe(1);
    const world = lifecycle.world;
    expect(world).toBeDefined();
    if (world === undefined) return;
    expect(world.store.nextId).toBe(101);
    expect(world.statics).toHaveLength(5);
  });

  it("keeps the world hash equal to the flight hash at every step of a launch and flight", () => {
    const { ctx, lifecycle, queue, step } = tracer();
    queue.push(launch);
    step();
    const world = lifecycle.world;
    expect(world).toBeDefined();
    for (let tick = 0; tick < 300; tick += 1) {
      step();
      const state = ctx.core.state;
      expect(state).toBeDefined();
      if (state === undefined) return;
      expect(hashWorld(state, lifecycle.world)).toBe(hashFlight(state));
      // One world for the whole flight: nothing recreated it.
      expect(lifecycle.world).toBe(world);
    }
    expect(ctx.core.state?.mode).toBe("inFlight");
  });

  it("drops the world on the docked event but keeps the epoch, so the next launch advances it", () => {
    const { ctx, lifecycle, queue, step } = tracer();
    queue.push(launch);
    for (let tick = 0; tick < 300; tick += 1) step();
    expect(ctx.core.state?.mode).toBe("inFlight");
    expect(lifecycle.epoch).toBe(1);

    queue.push({ kind: "dockingComputer" });
    step();
    expect(ctx.core.state?.mode).toBe("docked");
    expect(lifecycle.world).toBeUndefined();
    expect(lifecycle.epoch).toBe(1);

    queue.push(launch);
    step();
    expect(lifecycle.epoch).toBe(2);
    expect(lifecycle.world).toBeDefined();
    expect(lifecycle.world?.store.nextId).toBe(101);
  });
});

/**
 * The static imports, `export ... from`, side-effect imports and dynamic
 * `import(` specifiers of a source text, each flagged when it is an
 * `import type`. Comments never count.
 */
function importSpecifiers(
  text: string,
): { specifier: string; typeOnly: boolean }[] {
  const code = text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
  const found: { specifier: string; typeOnly: boolean }[] = [];
  const named =
    /\b(?:import|export)\s+(type\s+)?[^"';]*?\bfrom\s+["']([^"']+)["']/g;
  for (const match of code.matchAll(named)) {
    found.push({
      specifier: match[2] ?? "",
      typeOnly: match[1] !== undefined && /^import/.test(match[0]),
    });
  }
  for (const match of code.matchAll(/\bimport\s+["']([^"']+)["']/g)) {
    found.push({ specifier: match[1] ?? "", typeOnly: false });
  }
  for (const match of code.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    found.push({ specifier: match[1] ?? "", typeOnly: false });
  }
  return found;
}

/** The offending specifiers of one file, named as `<path>: <specifier>`. */
function nodeImportViolations(path: string, text: string): string[] {
  const offenders: string[] = [];
  for (const { specifier, typeOnly } of importSpecifiers(text)) {
    if (!specifier.startsWith(".")) {
      offenders.push(`${path}: ${specifier}`);
      continue;
    }
    const resolved = posix
      .normalize(posix.join(dirname(path), specifier))
      .replace(/\.(?:js|ts)$/, "");
    const underSim = resolved === "src/sim" || resolved.startsWith("src/sim/");
    const contentTypes = typeOnly && resolved === "src/content/types";
    if (!underSim && !contentTypes) offenders.push(`${path}: ${specifier}`);
  }
  return offenders;
}

describe("Node-importable session modules", () => {
  const FILES = [
    "src/app/session/world-lifecycle.ts",
    "src/app/session/step-options.ts",
  ];

  it("every import of world-lifecycle.ts and step-options.ts resolves under src/sim or is an import type from src/content/types", () => {
    for (const file of FILES) {
      const text = readFileSync(file, "utf8");
      expect(importSpecifiers(text).length).toBeGreaterThan(0);
      expect(nodeImportViolations(file, text)).toEqual([]);
    }
  });

  it("names the offending file and specifier for a DOM, Three, UI or value-content import", () => {
    const path = "src/app/session/world-lifecycle.ts";
    const text = [
      'import { a } from "../../sim/rng.js";',
      'import type { System } from "../../content/types.js";',
      'import { b } from "../../content/types.js";',
      'import * as THREE from "three";',
      'import { c } from "../../ui/station.js";',
      'export { d } from "../probe.js";',
      'import "../../render/hud/hud.js";',
      'const lazy = () => import("../../render/system-scene.js");',
      '// import { ignored } from "../../ui/ignored.js";',
      '/* import { alsoIgnored } from "three"; */',
    ].join("\n");
    expect(nodeImportViolations(path, text)).toEqual([
      `${path}: ../../content/types.js`,
      `${path}: three`,
      `${path}: ../../ui/station.js`,
      `${path}: ../probe.js`,
      `${path}: ../../render/hud/hud.js`,
      `${path}: ../../render/system-scene.js`,
    ]);
  });
});
