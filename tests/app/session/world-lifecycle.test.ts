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

import { afterEach, describe, expect, it, vi } from "vitest";

import type { GameLoop } from "../../../src/app/game-loop.js";
import { createSessionState } from "../../../src/app/session/context.js";
import type { SessionState } from "../../../src/app/session/context.js";
import { createEventRouter } from "../../../src/app/session/event-router.js";
import { createSimDriver } from "../../../src/app/session/sim-driver.js";
import { createSessionLifecycle } from "../../../src/app/session/start-session.js";
import type { LifecycleDeps } from "../../../src/app/session/start-session.js";
import { createWorldLifecycle } from "../../../src/app/session/world-lifecycle.js";
import type {
  Populate,
  WorldLifecycle,
} from "../../../src/app/session/world-lifecycle.js";
import type { KeyboardInputSource } from "../../../src/input/keyboard.js";
import type { Command } from "../../../src/sim/commands.js";
import { DOCK_COMPUTER_KEY } from "../../../src/sim/dock/computer.js";
import { identity, vec } from "../../../src/sim/math.js";
import { worldSeedFor } from "../../../src/sim/rng.js";
import { liveEntityCount, spawnEntity } from "../../../src/sim/world/world.js";
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

describe("lifecycle rules (D-02, D-03, D-05)", () => {
  const SEED_A = 0x00c0ffee;
  const SEED_B = 0xdeadbeef;

  /** begin(a), end(), begin(a), begin(b), resume(b): the plan's driven sequence. */
  function drive(traffic: boolean, populate?: Populate) {
    const lifecycle = createWorldLifecycle(
      populate === undefined ? { traffic } : { traffic, populate },
    );
    const epochs: number[] = [];
    const seeds: (number | undefined)[] = [];
    const nextIds: (number | undefined)[] = [];
    const worlds: unknown[] = [];
    const record = (): void => {
      epochs.push(lifecycle.epoch);
      seeds.push(lifecycle.world?.worldSeed);
      nextIds.push(lifecycle.world?.store.nextId);
      worlds.push(lifecycle.world);
    };
    lifecycle.begin(SEED_A);
    record();
    lifecycle.end();
    record();
    lifecycle.begin(SEED_A);
    record();
    lifecycle.begin(SEED_B);
    record();
    lifecycle.resume(SEED_B);
    record();
    return { lifecycle, epochs, seeds, nextIds, worlds };
  }

  it("starts at epoch 0 with no world", () => {
    const lifecycle = createWorldLifecycle({ traffic: true });
    expect(lifecycle.epoch).toBe(0);
    expect(lifecycle.world).toBeUndefined();
  });

  it("reports the same epochs, seeds and starting counters with traffic on and off (D-05)", () => {
    const off = drive(false);
    const on = drive(true);
    expect(off.epochs).toEqual([1, 1, 2, 3, 3]);
    expect(on.epochs).toEqual(off.epochs);
    expect(off.seeds).toEqual([
      worldSeedFor(SEED_A, 1),
      undefined,
      worldSeedFor(SEED_A, 2),
      worldSeedFor(SEED_B, 3),
      worldSeedFor(SEED_B, 3),
    ]);
    expect(on.seeds).toEqual(off.seeds);
    expect(off.nextIds).toEqual([101, undefined, 101, 101, 101]);
    expect(on.nextIds).toEqual(off.nextIds);
  });

  it("runs populate at every creation (four times) with the mode's traffic value", () => {
    for (const traffic of [true, false]) {
      const calls: { traffic: boolean; nextId: number }[] = [];
      drive(traffic, (world, options) => {
        calls.push({ traffic: options.traffic, nextId: world.store.nextId });
      });
      expect(calls).toHaveLength(4);
      for (const call of calls) {
        expect(call).toEqual({ traffic, nextId: 101 });
      }
    }
  });

  it("leaves every world empty with the default populator, in both modes", () => {
    for (const traffic of [true, false]) {
      const lifecycle = createWorldLifecycle({ traffic });
      for (const create of [
        () => {
          lifecycle.begin(SEED_A);
        },
        () => {
          lifecycle.resume(SEED_A);
        },
      ]) {
        create();
        const world = lifecycle.world;
        expect(world).toBeDefined();
        if (world === undefined) return;
        expect(liveEntityCount(world)).toBe(0);
        expect(world.store.nextId).toBe(101);
      }
    }
  });

  it("builds a new world with ids restarting at 101 at every begin and every resume", () => {
    const lifecycle = createWorldLifecycle({ traffic: false });
    lifecycle.begin(SEED_A);
    let previous = lifecycle.world;
    expect(previous).toBeDefined();
    for (const create of [
      () => {
        lifecycle.begin(SEED_A);
      },
      () => {
        lifecycle.resume(SEED_A);
      },
      () => {
        lifecycle.begin(SEED_B);
      },
    ]) {
      const old = previous;
      if (old === undefined) return;
      // Dirty the old world: spawn one entity so its counter moves on.
      const spawned = spawnEntity(
        old,
        {
          kind: "ship",
          specKey: "viper",
          scanClass: "CLASS_POLICE",
          position: vec(0, 0, 0),
          orientation: identity(),
          radius: 1,
        },
        0,
      );
      expect(spawned?.id).toBe(101);
      expect(old.store.nextId).toBe(102);
      create();
      const fresh = lifecycle.world;
      expect(fresh).toBeDefined();
      expect(fresh).not.toBe(old);
      expect(fresh?.store.nextId).toBe(101);
      expect(liveEntityCount(fresh ?? old)).toBe(0);
      previous = fresh;
    }
  });

  it("resume and end leave the epoch unchanged", () => {
    const lifecycle = createWorldLifecycle({ traffic: false });
    lifecycle.begin(SEED_A);
    lifecycle.begin(SEED_A);
    expect(lifecycle.epoch).toBe(2);
    lifecycle.resume(SEED_A);
    expect(lifecycle.epoch).toBe(2);
    expect(lifecycle.world?.worldSeed).toBe(worldSeedFor(SEED_A, 2));
    lifecycle.end();
    expect(lifecycle.epoch).toBe(2);
    expect(lifecycle.world).toBeUndefined();
  });

  it("resetForRestore(0) sets epoch 0 and drops the world", () => {
    const lifecycle = createWorldLifecycle({ traffic: false });
    lifecycle.begin(SEED_A);
    lifecycle.begin(SEED_A);
    expect(lifecycle.resetForRestore(0)).toBe(true);
    expect(lifecycle.epoch).toBe(0);
    expect(lifecycle.world).toBeUndefined();
    lifecycle.begin(SEED_A);
    expect(lifecycle.epoch).toBe(1);
  });

  it("refuses a non-finite seed without a change and without a RangeError", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -Infinity]) {
      const lifecycle = createWorldLifecycle({ traffic: false });
      lifecycle.begin(SEED_A);
      const world = lifecycle.world;
      expect(() => {
        lifecycle.begin(bad);
      }).not.toThrow();
      expect(lifecycle.epoch).toBe(1);
      expect(lifecycle.world).toBe(world);
      expect(() => {
        lifecycle.resume(bad);
      }).not.toThrow();
      expect(lifecycle.epoch).toBe(1);
      expect(lifecycle.world).toBe(world);
    }
  });

  it("saturates at the top of the epoch domain: one last begin succeeds, the next changes nothing", () => {
    const lifecycle = createWorldLifecycle({ traffic: false });
    expect(lifecycle.resetForRestore(0xfffffffe)).toBe(true);
    lifecycle.begin(SEED_A);
    expect(lifecycle.epoch).toBe(0xffffffff);
    const world = lifecycle.world;
    expect(world?.worldSeed).toBe(worldSeedFor(SEED_A, 0xffffffff));
    expect(() => {
      lifecycle.begin(SEED_A);
    }).not.toThrow();
    expect(lifecycle.epoch).toBe(0xffffffff);
    expect(lifecycle.world).toBe(world);
  });

  it("accepts exactly the restore epochs from which begin can still bump", () => {
    const lifecycle = createWorldLifecycle({ traffic: false });
    expect(lifecycle.resetForRestore(0)).toBe(true);
    expect(lifecycle.epoch).toBe(0);
    expect(lifecycle.resetForRestore(7)).toBe(true);
    expect(lifecycle.epoch).toBe(7);
    for (const bad of [0xffffffff, -1, 1.5, Number.NaN, 0x100000000]) {
      lifecycle.begin(SEED_A);
      expect(lifecycle.world).toBeDefined();
      expect(lifecycle.resetForRestore(bad)).toBe(false);
      expect(lifecycle.epoch).toBe(0);
      expect(lifecycle.world).toBeUndefined();
      // A refused restore still leaves a session that can create its next world.
      lifecycle.begin(SEED_A);
      expect(lifecycle.epoch).toBe(1);
      lifecycle.end();
      lifecycle.resetForRestore(0);
    }
  });
});

describe("session wiring (start-up and dispose)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** A lifecycle whose collaborators are never reached except by dispose. */
  function disposeHarness(): {
    readonly ctx: SessionState;
    readonly dispose: () => void;
    readonly calls: string[];
  } {
    const ctx = createSessionState({
      system: lave.system,
      saveStatus: "absent",
      saveSkipReason: "",
    });
    ctx.core.state = initFlightState(lave.layout);
    const calls: string[] = [];
    const none = { dispose: () => undefined };
    const deps = {
      assets: none,
      scenes: { disposeSystem: () => undefined, dispose: () => undefined },
      title: none,
      docked: none,
      saveBoot: { store: none },
      pending: [],
      launchSequence: {},
      uiController: new AbortController(),
      redrawGate: { request: () => undefined },
      renderFrame: () => undefined,
      probePublisher: { withdrawProbe: () => undefined },
      onSubpanelKeyDown: () => undefined,
    } as unknown as LifecycleDeps;
    ctx.core.worldLifecycle = {
      world: undefined,
      epoch: 0,
      begin: () => undefined,
      resume: () => undefined,
      end: () => {
        calls.push("end");
      },
      resetForRestore: () => true,
    };
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    return { ctx, dispose: createSessionLifecycle(ctx, deps).dispose, calls };
  }

  it("dispose ends the world, and a second dispose does it no more", () => {
    const { dispose, calls } = disposeHarness();
    dispose();
    expect(calls).toEqual(["end"]);
    dispose();
    expect(calls).toEqual(["end"]);
  });

  it("dispose on the real lifecycle drops the world and keeps the epoch", () => {
    const { ctx, dispose } = disposeHarness();
    const real = createWorldLifecycle({ traffic: false });
    real.begin(MARKET_SEED);
    ctx.core.worldLifecycle = real;
    dispose();
    expect(real.world).toBeUndefined();
    expect(real.epoch).toBe(1);
    expect(() => {
      dispose();
    }).not.toThrow();
  });

  it("start-up creates the lifecycle from the parsed traffic flag before the restore branch and resumes an in-flight restore", () => {
    // startSession has no Node harness (it builds the renderer, HUD and
    // input), so its three lifecycle points are pinned as ordered source facts;
    // the save-load browser specs exercise the in-flight Continue end to end.
    const source = readFileSync("src/app/session/start-session.ts", "utf8");
    const at = (needle: string, from = 0): number =>
      source.indexOf(needle, from);
    const parsed = at("ctx.runtime.testFlags = parseTestFlags(");
    const created = at("createWorldLifecycle({");
    const restoreBranch = at("if (restoring && restore !== undefined) {");
    const seed = at("ctx.core.marketSeed =\n");
    const resumed = at("worldLifecycle?.resume(");
    expect(parsed).toBeGreaterThan(-1);
    expect(created).toBeGreaterThan(parsed);
    expect(restoreBranch).toBeGreaterThan(created);
    expect(source.slice(created, created + 120)).toContain(
      "traffic: ctx.runtime.testFlags.traffic",
    );
    expect(seed).toBeGreaterThan(restoreBranch);
    expect(resumed).toBeGreaterThan(seed);
    expect(source.slice(seed, resumed)).toContain("restoredInFlight");
    expect(source.match(/createWorldLifecycle\(/g)).toHaveLength(1);
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
