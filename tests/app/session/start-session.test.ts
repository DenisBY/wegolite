// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The session lifecycle's scene swap, listeners and teardown (Phase 8, D-12
 * step 9, plan 08-12; review 10b4108 L301, L303 and Round 2 review 820a435
 * L389, L477).
 *
 * Node only, no DOM: a real Lave `FlightState` and layout, and recording
 * doubles for every collaborator. `window`, `requestAnimationFrame` and
 * `cancelAnimationFrame` are stubbed per test with `vi.stubGlobal`. The
 * teardown list below is written out literally from the pre-move `dispose()`
 * (the "Lifecycle order" the plan's SUMMARY records), never derived from
 * running the code under test.
 */

import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createSessionState } from "../../../src/app/session/context.js";
import type { SessionState } from "../../../src/app/session/context.js";
import {
  createSessionLifecycle,
  resolveStartTarget,
} from "../../../src/app/session/start-session.js";
import type { LifecycleDeps } from "../../../src/app/session/start-session.js";
import type { SystemScene } from "../../../src/render/system-scene.js";
import {
  createPlayerCombatState,
  isPristineCombat,
} from "../../../src/sim/combat/state.js";
import type { Command } from "../../../src/sim/commands.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import { vec } from "../../../src/sim/math.js";
import type { SystemLayout } from "../../../src/sim/world/layout.js";
import { laveFixture } from "../../helpers/lave.js";
import { sessionSourceFiles } from "../../helpers/session-source.js";

const lave = laveFixture();

interface Harness {
  readonly ctx: SessionState;
  readonly lifecycle: ReturnType<typeof createSessionLifecycle>;
  readonly log: string[];
  readonly pending: Command[];
  readonly uiController: AbortController;
  readonly deps: LifecycleDeps;
  /** The layout and scene the scenes double hands out next. */
  readonly next: { scene: SystemScene; layout: SystemLayout };
  readonly onSubpanelKeyDown: (event: KeyboardEvent) => void;
}

/** A recording double for one disposable collaborator. */
function disposable(log: string[], name: string): { dispose: () => void } {
  return {
    dispose: () => {
      log.push(`${name}.dispose`);
    },
  };
}

/**
 * A lifecycle over a docked Lave session with every collaborator a recording
 * double. Only the fields `performSwap`, `swapSystem`, the two listeners and
 * `dispose` touch carry a real double; the rest of the deps are never reached
 * and are filled by the cast.
 */
function harness(): Harness {
  const ctx = createSessionState({
    system: lave.system,
    saveStatus: "absent",
    saveSkipReason: "",
  });
  ctx.core.state = initFlightState(lave.layout);
  ctx.core.layout = lave.layout;
  ctx.core.config = lave.config;
  ctx.core.stationDef = lave.stationDef;

  const log: string[] = [];
  const pending: Command[] = [];
  const uiController = new AbortController();
  uiController.signal.addEventListener("abort", () => {
    log.push("uiController.abort");
  });
  const next = {
    scene: { name: "next scene" } as unknown as SystemScene,
    layout: { ...lave.layout },
  };
  const onSubpanelKeyDown = vi.fn();

  const deps = {
    assets: disposable(log, "assets"),
    scenes: {
      enterSystem: () => {
        log.push("scenes.enterSystem");
        return next.scene;
      },
      layout: () => next.layout,
      disposeSystem: () => {
        log.push("scenes.disposeSystem");
      },
      dispose: () => {
        log.push("scenes.dispose");
      },
    },
    title: disposable(log, "title"),
    docked: disposable(log, "docked"),
    saveBoot: { store: disposable(log, "store") },
    pending,
    launchSequence: {
      canSkip: () => true,
      markSeen: () => undefined,
    },
    uiController,
    redrawGate: {
      request: () => {
        log.push("redrawGate.request");
      },
    },
    renderFrame: (alpha: number) => {
      log.push(`renderFrame ${String(alpha)}`);
    },
    probePublisher: {
      withdrawProbe: () => {
        // Recorded with the state at call time: the state is already dropped.
        log.push(
          `withdrawProbe stateDropped=${String(ctx.core.state === undefined)}`,
        );
      },
    },
    onSubpanelKeyDown,
  } as unknown as LifecycleDeps;

  const lifecycle = createSessionLifecycle(ctx, deps);
  return {
    ctx,
    lifecycle,
    log,
    pending,
    uiController,
    deps,
    next,
    onSubpanelKeyDown,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("performSwap", () => {
  it("installs the new scene, re-reads the layout from the scene manager and clears the camera history", () => {
    const { ctx, lifecycle, next } = harness();
    const previousLayout = ctx.core.layout;
    ctx.core.previousCameraWorld = vec(1, 2, 3);

    lifecycle.performSwap();

    expect(ctx.core.scene).toBe(next.scene);
    expect(ctx.core.layout).toBe(next.layout);
    expect(ctx.core.layout).not.toBe(previousLayout);
    expect(ctx.core.previousCameraWorld).toBeUndefined();
  });

  it("keeps the current layout when the scene manager reports none", () => {
    const { ctx, lifecycle, deps } = harness();
    const previousLayout = ctx.core.layout;
    (deps.scenes as { layout: () => undefined }).layout = () => undefined;

    lifecycle.performSwap();

    expect(ctx.core.layout).toBe(previousLayout);
  });

  it("changes nothing without a flight state", () => {
    const { ctx, lifecycle, log } = harness();
    ctx.core.state = undefined;
    ctx.core.previousCameraWorld = vec(1, 2, 3);

    lifecycle.performSwap();

    expect(log).toEqual([]);
    expect(ctx.core.scene).toBeUndefined();
    expect(ctx.core.previousCameraWorld).toEqual(vec(1, 2, 3));
  });

  it("changes nothing without a station definition", () => {
    const { ctx, lifecycle, log } = harness();
    ctx.core.stationDef = undefined;

    lifecycle.performSwap();

    expect(log).toEqual([]);
    expect(ctx.core.scene).toBeUndefined();
  });
});

describe("disposeSystem", () => {
  it("disposes the system scene, drops the scene reference and the camera history", () => {
    const { ctx, lifecycle, log } = harness();
    ctx.core.scene = { name: "live" } as unknown as SystemScene;
    ctx.core.previousCameraWorld = vec(1, 2, 3);

    lifecycle.disposeSystem();

    expect(log).toEqual(["scenes.disposeSystem"]);
    expect(ctx.core.scene).toBeUndefined();
    expect(ctx.core.previousCameraWorld).toBeUndefined();
  });
});

describe("swapSystem", () => {
  function stubFrames(): {
    readonly callbacks: FrameRequestCallback[];
    readonly cancelled: number[];
  } {
    const callbacks: FrameRequestCallback[] = [];
    const cancelled: number[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return 40 + callbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      cancelled.push(id);
    });
    return { callbacks, cancelled };
  }

  it("swaps, draws, waits one real frame, then draws again", async () => {
    const { callbacks } = stubFrames();
    const { ctx, lifecycle, log } = harness();

    const swapping = lifecycle.swapSystem();
    expect(log).toEqual(["scenes.enterSystem", "renderFrame 0"]);
    expect(callbacks).toHaveLength(1);
    expect(ctx.runtime.swapRafId).toBe(41);

    callbacks[0]?.(0);
    await swapping;

    expect(log).toEqual([
      "scenes.enterSystem",
      "renderFrame 0",
      "renderFrame 0",
    ]);
    expect(ctx.runtime.swapRafId).toBe(0);
  });

  it("does nothing without a flight state", async () => {
    const { callbacks } = stubFrames();
    const { ctx, lifecycle, log } = harness();
    ctx.core.state = undefined;

    await lifecycle.swapSystem();

    expect(log).toEqual([]);
    expect(callbacks).toHaveLength(0);
  });

  it("is cancelled by dispose before its frame fires: no second draw into a torn-down session", async () => {
    const { callbacks, cancelled } = stubFrames();
    const { ctx, lifecycle, log } = harness();

    const swapping = lifecycle.swapSystem();
    expect(callbacks).toHaveLength(1);
    lifecycle.dispose();

    // dispose cancelled the pending settlement frame and released the wait.
    expect(cancelled).toEqual([41]);
    expect(ctx.runtime.swapRafId).toBe(0);
    await swapping;

    // Even a callback the platform still delivers draws nothing.
    callbacks[0]?.(0);
    const draws = log.filter((entry) => entry.startsWith("renderFrame"));
    expect(draws).toEqual(["renderFrame 0"]);
  });
});

describe("the window keydown listeners", () => {
  function stubWindow(): {
    readonly calls: {
      readonly type: string;
      readonly listener: (event: KeyboardEvent) => void;
      readonly options: AddEventListenerOptions;
    }[];
  } {
    const calls: {
      type: string;
      listener: (event: KeyboardEvent) => void;
      options: AddEventListenerOptions;
    }[] = [];
    vi.stubGlobal("window", {
      addEventListener: (
        type: string,
        listener: (event: KeyboardEvent) => void,
        options: AddEventListenerOptions,
      ) => {
        calls.push({ type, listener, options });
      },
    });
    return { calls };
  }

  it("builds in Node without a window and registers nothing", () => {
    expect(typeof window).toBe("undefined");
    expect(() => harness()).not.toThrow();
  });

  it("registers exactly two capture keydown listeners on the session signal, sub-panel first", () => {
    const { calls } = stubWindow();
    const { uiController, onSubpanelKeyDown } = harness();

    expect(calls.map((call) => call.type)).toEqual(["keydown", "keydown"]);
    expect(calls[0]?.listener).toBe(onSubpanelKeyDown);
    expect(calls[1]?.listener).not.toBe(onSubpanelKeyDown);
    for (const call of calls) {
      expect(call.options.capture).toBe(true);
      expect(call.options.signal).toBe(uiController.signal);
    }
  });

  function keyEvent(
    overrides: Partial<Record<string, boolean>> = {},
  ): KeyboardEvent & { readonly prevented: () => boolean } {
    let prevented = false;
    return {
      repeat: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      ...overrides,
      preventDefault: () => {
        prevented = true;
      },
      prevented: () => prevented,
    } as unknown as KeyboardEvent & { readonly prevented: () => boolean };
  }

  it("the launch listener queues skipLaunch only while launching, unpaused and not a repeat", () => {
    const { calls } = stubWindow();
    const { ctx, pending } = harness();
    const onLaunchKeyDown = calls[1]?.listener;
    expect(onLaunchKeyDown).toBeDefined();
    if (ctx.core.state === undefined) throw new Error("no state");

    // Docked: ignored.
    const docked = keyEvent();
    onLaunchKeyDown?.(docked);
    expect(pending).toEqual([]);
    expect(docked.prevented()).toBe(false);

    ctx.core.state.mode = "launching";
    const accepted = keyEvent();
    onLaunchKeyDown?.(accepted);
    expect(pending).toEqual([{ kind: "skipLaunch" }]);
    expect(accepted.prevented()).toBe(true);

    pending.length = 0;
    onLaunchKeyDown?.(keyEvent({ repeat: true }));
    onLaunchKeyDown?.(keyEvent({ ctrlKey: true }));
    onLaunchKeyDown?.(keyEvent({ metaKey: true }));
    onLaunchKeyDown?.(keyEvent({ altKey: true }));
    ctx.runtime.paused = true;
    onLaunchKeyDown?.(keyEvent());
    expect(pending).toEqual([]);
  });
});

describe("dispose order", () => {
  /** A session with every optional owner present, each a recording double. */
  function liveHarness(): Harness {
    const built = harness();
    const { ctx, log } = built;
    ctx.runtime.rafId = 11;
    ctx.station.stationNav = disposable(log, "stationNav") as never;
    ctx.runtime.input = {
      clearAll: () => {
        log.push("input.clearAll");
      },
      dispose: () => {
        log.push("input.dispose");
      },
    } as never;
    ctx.runtime.pauseOverlay = disposable(log, "pauseOverlay") as never;
    ctx.runtime.controlsPanel = disposable(log, "controlsPanel") as never;
    ctx.runtime.settingsPanel = disposable(log, "settingsPanel") as never;
    ctx.runtime.fpsCounter = disposable(log, "fpsCounter") as never;
    ctx.runtime.hud = disposable(log, "hud") as never;
    ctx.chart.chart = disposable(log, "chart") as never;
    ctx.chart.chartOpen = true;
    ctx.save.saveLoad = disposable(log, "saveLoad") as never;
    ctx.save.saveScreenOpen = true;
    ctx.core.scene = { name: "live" } as unknown as SystemScene;
    return built;
  }

  /** The pre-move `dispose()` order, written out literally. */
  const TEARDOWN = [
    "cancelAnimationFrame 11",
    "uiController.abort",
    "stationNav.dispose",
    "input.clearAll",
    "input.dispose",
    "pauseOverlay.dispose",
    "controlsPanel.dispose",
    "settingsPanel.dispose",
    "fpsCounter.dispose",
    "scenes.dispose",
    "assets.dispose",
    "hud.dispose",
    "chart.dispose",
    "saveLoad.dispose",
    "docked.dispose",
    "title.dispose",
    "withdrawProbe stateDropped=true",
    "store.dispose",
  ];

  function stubCancel(log: string[]): void {
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      log.push(`cancelAnimationFrame ${String(id)}`);
    });
  }

  it("tears down in the recorded order, exactly once", () => {
    const { ctx, lifecycle, log } = liveHarness();
    stubCancel(log);

    lifecycle.dispose();

    expect(log).toEqual(TEARDOWN);
    expect(ctx.runtime.disposed).toBe(true);
    expect(ctx.runtime.rafId).toBe(0);
    expect(ctx.station.stationNav).toBeUndefined();
    expect(ctx.chart.chart).toBeUndefined();
    expect(ctx.chart.chartOpen).toBe(false);
    expect(ctx.save.saveLoad).toBeUndefined();
    expect(ctx.save.saveScreenOpen).toBe(false);
    expect(ctx.core.state).toBeUndefined();
    expect(ctx.core.scene).toBeUndefined();
    expect(ctx.core.layout).toBeUndefined();
  });

  it("drops the combat state and the hull table with the flight state (plan 13-11)", () => {
    const { ctx, lifecycle, log } = liveHarness();
    stubCancel(log);
    ctx.core.combat = createPlayerCombatState();
    ctx.core.hulls = new Map();

    lifecycle.dispose();

    expect(ctx.core.combat).toBeUndefined();
    expect(ctx.core.hulls).toBeUndefined();
  });

  it("is idempotent: a second dispose records nothing and double-frees nothing", () => {
    const { lifecycle, log } = liveHarness();
    stubCancel(log);

    lifecycle.dispose();
    const afterFirst = [...log];
    lifecycle.dispose();

    expect(log).toEqual(afterFirst);
    expect(log).toEqual(TEARDOWN);
  });

  it("skips the frame cancel when no frame is scheduled", () => {
    const { ctx, lifecycle, log } = liveHarness();
    ctx.runtime.rafId = 0;
    stubCancel(log);

    lifecycle.dispose();

    expect(log).toEqual(TEARDOWN.slice(1));
  });

  it("copes with a session that never finished starting (every owner absent)", () => {
    const { ctx, lifecycle, log } = harness();
    stubCancel(log);
    ctx.core.state = undefined;

    expect(() => {
      lifecycle.dispose();
    }).not.toThrow();

    expect(log).toEqual([
      "uiController.abort",
      "scenes.dispose",
      "assets.dispose",
      "docked.dispose",
      "title.dispose",
      "withdrawProbe stateDropped=true",
      "store.dispose",
    ]);
  });
});

/**
 * The boot wiring of the combat state and the hull data (plan 13-11). startSession
 * has no Node harness (it builds the renderer, HUD and input), so these are pinned
 * as ordered source facts, as the lifecycle and populator wiring are in
 * world-lifecycle.test.ts; the traffic browser spec exercises the load end to end.
 */
describe("combat and hull wiring at start-up (plan 13-11)", () => {
  const source = readFileSync("src/app/session/start-session.ts", "utf8");
  const flat = (text: string): string => text.replace(/\s+/g, " ");

  it("loads the hull data once, only behind the traffic flag, in the boot Promise.all beside the NPC catalogue", () => {
    expect(source.match(/loadShipHulls\(\)/g)).toHaveLength(1);
    const load = source.indexOf("loadShipHulls()");
    expect(flat(source.slice(Math.max(0, load - 80), load))).toContain(
      "ctx.runtime.testFlags.traffic ?",
    );
    const all = source.indexOf("await Promise.all([");
    const closed = source.indexOf("]);", all);
    expect(load).toBeGreaterThan(source.indexOf("loadNpcCatalogue()"));
    expect(load).toBeGreaterThan(all);
    expect(load).toBeLessThan(closed);
    // The same visible boot-failure surface (T-13-23).
    expect(source.slice(closed, closed + 1200)).toContain("showBootFailure");
    expect(source).toContain("ctx.core.hulls =");
    expect(source).toContain("hullTable(hullCatalogue)");
  });

  it("loads the debris and explosion catalogues once, only behind the traffic flag, in the boot Promise.all (plan 16-06)", () => {
    const all = source.indexOf("await Promise.all([");
    const closed = source.indexOf("]);", all);
    for (const call of ["loadDebrisCatalogue()", "loadExplosionCatalogue()"]) {
      expect(source.split(call)).toHaveLength(2);
      const load = source.indexOf(call);
      expect(flat(source.slice(Math.max(0, load - 80), load))).toContain(
        "ctx.runtime.testFlags.traffic ?",
      );
      expect(load).toBeGreaterThan(source.indexOf("loadShipHulls()"));
      expect(load).toBeLessThan(closed);
    }
    // The same visible boot-failure surface (T-16-19), and both reach the
    // shared traffic content.
    expect(source.slice(closed, closed + 1500)).toContain("showBootFailure");
    expect(source).toContain("debris: debrisCatalogue");
    expect(source).toContain("explosions: explosionCatalogue");
  });

  it("creates a pristine combat state beside the flight state, for a new game and a Continue alike", () => {
    expect(source.match(/createPlayerCombatState\(\)/g)).toHaveLength(1);
    const state = source.indexOf("ctx.core.state = flightState;");
    const combat = source.indexOf(
      "ctx.core.combat = createPlayerCombatState();",
    );
    expect(state).toBeGreaterThan(-1);
    // Installed by the one assignment that serves both branches of the restore.
    expect(combat).toBeGreaterThan(state);
    expect(combat - state).toBeLessThan(400);
    expect(isPristineCombat(createPlayerCombatState())).toBe(true);
  });

  it("creates the combat state only at the two install points, so a hyperspace jump carries it over", () => {
    const owners = [
      "src/app/session/start-session.ts",
      "src/app/session/save-controller.ts",
    ];
    for (const file of readdirSession()) {
      const text = readFileSync(file, "utf8");
      // `probe.combat = ...` publishes values from the state (plan 13-14); it
      // creates nothing, so it is not an install point.
      const creates = /createPlayerCombatState\(\)|(?<!probe)\.combat = /.test(
        text,
      );
      expect(creates, file).toBe(owners.includes(file));
    }
  });
});

function readdirSession(): string[] {
  return sessionSourceFiles().filter((file) =>
    file.startsWith("src/app/session/"),
  );
}

describe("resolveStartTarget (quick task 261117-pij)", () => {
  // oolite-standard.oolite-save target_system_name: a new commander targets
  // the start system (Lave). A restore keeps the T-06-12 allow-list rule.
  const galaxyById = new Map([
    [lave.system.id, lave.system],
    ["g0-s3", { ...lave.system, id: "g0-s3", name: "Diso" }],
  ]);

  it("gives a new game the start system", () => {
    expect(
      resolveStartTarget(false, undefined, lave.system.id, galaxyById),
    ).toBe(lave.system.id);
    // A saved target is ignored for a new game.
    expect(resolveStartTarget(false, "g0-s3", lave.system.id, galaxyById)).toBe(
      lave.system.id,
    );
  });

  it("keeps a saved target the catalogue knows on a restore", () => {
    expect(resolveStartTarget(true, "g0-s3", lave.system.id, galaxyById)).toBe(
      "g0-s3",
    );
  });

  it("has no target for a restore without one or with an unknown one", () => {
    expect(
      resolveStartTarget(true, undefined, lave.system.id, galaxyById),
    ).toBeUndefined();
    expect(
      resolveStartTarget(true, "no-such-system", lave.system.id, galaxyById),
    ).toBeUndefined();
  });
});
