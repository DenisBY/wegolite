// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The settings controller against a fake session context (Phase 8, D-12 step
 * 4, G-8; threat T-08-11).
 *
 * Node only, no DOM: a real `SessionState` and recording doubles for the input
 * source, the game loop, the pause overlay and the two sub-panels. The
 * controller registers no listener, so constructing it needs no `window`.
 */

import { describe, expect, it } from "vitest";

import {
  CONTEXT_LOST_NOTICE,
  CONTEXT_RESTORED_NOTICE,
} from "../../../src/app/context-recovery.js";
import { createSessionState } from "../../../src/app/session/context.js";
import type { SessionState } from "../../../src/app/session/context.js";
import { createSettingsController } from "../../../src/app/session/settings-controller.js";
import type { SettingsController } from "../../../src/app/session/settings-controller.js";
import type { GameLoop } from "../../../src/app/game-loop.js";
import type { KeyboardInputSource } from "../../../src/input/keyboard.js";
import type {
  GraphicsQuality,
  SettingsV1,
} from "../../../src/settings/schema.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { ControlsPanel } from "../../../src/ui/controls.js";
import type { PauseOverlay } from "../../../src/ui/pause.js";
import type { SettingsPanel } from "../../../src/ui/settings-panel.js";
import { laveFixture } from "../../helpers/lave.js";

const { system, layout } = laveFixture();

interface Harness {
  readonly ctx: SessionState;
  readonly controller: SettingsController;
  /** Every recorded call, in order, as "target.method". */
  readonly calls: string[];
  readonly frames: number[];
  readonly qualities: GraphicsQuality[];
  swapFails: boolean;
}

function harness(pauseOnFocusLoss = true): Harness {
  const ctx = createSessionState({
    system,
    saveStatus: "absent",
    saveSkipReason: "",
  });
  const calls: string[] = [];
  const frames: number[] = [];
  const qualities: GraphicsQuality[] = ["standard"];
  const record = (name: string) => () => calls.push(name);
  ctx.core.state = initFlightState(layout);
  ctx.runtime.settings = {
    pauseOnFocusLoss,
    quality: "standard",
    showFps: false,
  } as unknown as SettingsV1;
  ctx.runtime.input = {
    clearAll: record("input.clearAll"),
    setPaused: (paused: boolean) =>
      calls.push(`input.setPaused(${String(paused)})`),
  } as unknown as KeyboardInputSource;
  ctx.runtime.loop = { reset: record("loop.reset") } as unknown as GameLoop;
  ctx.runtime.pauseOverlay = {
    show: record("overlay.show"),
    hide: record("overlay.hide"),
    setNotice: (text: string) => calls.push(`overlay.setNotice(${text})`),
  } as unknown as PauseOverlay;
  ctx.runtime.controlsPanel = {
    show: record("controls.show"),
    hide: record("controls.hide"),
  } as unknown as ControlsPanel;
  ctx.runtime.settingsPanel = {
    show: record("settings.show"),
    hide: record("settings.hide"),
    setPauseOnFocusLoss: (on: boolean) =>
      calls.push(`settings.setPauseOnFocusLoss(${String(on)})`),
    setQuality: (quality: GraphicsQuality) =>
      calls.push(`settings.setQuality(${quality})`),
    setShowFps: (on: boolean) =>
      calls.push(`settings.setShowFps(${String(on)})`),
  } as unknown as SettingsPanel;
  const h: Harness = {
    ctx,
    calls,
    frames,
    qualities,
    swapFails: false,
    controller: undefined as unknown as SettingsController,
  };
  const controller = createSettingsController(ctx, {
    scenes: {
      quality: () => qualities[qualities.length - 1] ?? "standard",
      setQuality: (quality: GraphicsQuality) => {
        qualities.push(quality);
      },
    },
    renderFrame: (alpha: number) => {
      frames.push(alpha);
    },
    syncStationNav: record("syncStationNav"),
    refreshStationChrome: record("refreshStationChrome"),
    performSwap: () => {
      calls.push("performSwap");
      if (h.swapFails) throw new Error("rebuild failed");
    },
  });
  return Object.assign(h, { controller });
}

describe("pause and resume", () => {
  it("pause freezes the session, resets the loop and shows the overlay", () => {
    const h = harness();
    h.controller.pause();
    expect(h.ctx.runtime.paused).toBe(true);
    expect(h.calls).toEqual([
      "input.clearAll",
      "input.setPaused(true)",
      "loop.reset",
      "overlay.show",
      "syncStationNav",
    ]);
  });

  it("pause then resume resets the game loop both times", () => {
    const h = harness();
    h.controller.pause();
    h.calls.length = 0;
    h.controller.resume();
    expect(h.ctx.runtime.paused).toBe(false);
    expect(h.calls).toEqual([
      "input.clearAll",
      "input.setPaused(false)",
      "loop.reset",
      "overlay.hide",
      "overlay.setNotice()",
      "controls.hide",
      "settings.hide",
      "syncStationNav",
    ]);
  });

  it("a repeated pause only clears input", () => {
    const h = harness();
    h.controller.pause();
    h.calls.length = 0;
    h.controller.pause();
    expect(h.calls).toEqual(["input.clearAll"]);
  });

  it("pausing before a session exists only clears input", () => {
    const h = harness();
    h.ctx.core.state = undefined;
    h.controller.pause();
    expect(h.ctx.runtime.paused).toBe(false);
    expect(h.calls).toEqual(["input.clearAll"]);
  });

  it("resume is refused while the WebGL context is lost (QUAL-05)", () => {
    const h = harness();
    h.controller.enterContextLoss();
    h.calls.length = 0;
    h.controller.resume();
    expect(h.ctx.runtime.paused).toBe(true);
    expect(h.ctx.runtime.contextLost).toBe(true);
    expect(h.calls).toEqual([]);
  });

  it("resume works again once the context is restored", () => {
    const h = harness();
    h.controller.enterContextLoss();
    h.controller.exitContextLoss();
    h.controller.resume();
    expect(h.ctx.runtime.paused).toBe(false);
  });
});

describe("focusLost", () => {
  it("pauses when pauseOnFocusLoss is on", () => {
    const h = harness(true);
    h.controller.focusLost();
    expect(h.ctx.runtime.paused).toBe(true);
    expect(h.calls[0]).toBe("input.clearAll");
  });

  it("only clears held input when pauseOnFocusLoss is off", () => {
    const h = harness(false);
    h.controller.focusLost();
    expect(h.ctx.runtime.paused).toBe(false);
    expect(h.calls).toEqual(["input.clearAll"]);
  });

  it("pauses when the settings are not loaded yet (absent reads as on)", () => {
    const h = harness(false);
    h.ctx.runtime.settings = undefined;
    h.controller.focusLost();
    expect(h.ctx.runtime.paused).toBe(true);
  });
});

describe("context loss", () => {
  it("entering pauses at once and shows the lost notice", () => {
    const h = harness();
    h.controller.enterContextLoss();
    expect(h.ctx.runtime.contextLost).toBe(true);
    expect(h.ctx.runtime.paused).toBe(true);
    expect(h.calls.at(-1)).toBe(`overlay.setNotice(${CONTEXT_LOST_NOTICE})`);
  });

  it("exiting stays paused, shows the restored notice and draws one frame", () => {
    const h = harness();
    h.controller.enterContextLoss();
    h.calls.length = 0;
    h.controller.exitContextLoss();
    expect(h.ctx.runtime.contextLost).toBe(false);
    expect(h.ctx.runtime.paused).toBe(true);
    expect(h.calls).toEqual([`overlay.setNotice(${CONTEXT_RESTORED_NOTICE})`]);
    expect(h.frames).toEqual([0]);
  });

  it("exiting draws nothing before a session exists", () => {
    const h = harness();
    h.ctx.core.state = undefined;
    h.controller.exitContextLoss();
    expect(h.frames).toEqual([]);
  });
});

describe("panels and quality", () => {
  it("openSettings hides the controls panel and mirrors the stored toggles", () => {
    const h = harness(false);
    h.controller.openSettings();
    expect(h.calls).toEqual([
      "controls.hide",
      "settings.setPauseOnFocusLoss(false)",
      "settings.setQuality(standard)",
      "settings.setShowFps(false)",
      "settings.show",
    ]);
  });

  it("backToPause hides both panels and shows the pause overlay", () => {
    const h = harness();
    h.controller.backToPause();
    expect(h.calls).toEqual(["controls.hide", "settings.hide", "overlay.show"]);
  });

  it("applyQuality rebuilds the scene and draws one frame", () => {
    const h = harness();
    ctx(h).stationDef = {} as never;
    expect(h.controller.applyQuality("high")).toBe(true);
    expect(h.qualities.at(-1)).toBe("high");
    expect(h.calls).toContain("performSwap");
    expect(h.frames).toEqual([0]);
  });

  it("a failed rebuild restores the previous quality and reports false", () => {
    const h = harness();
    ctx(h).stationDef = {} as never;
    h.swapFails = true;
    const logged = console.error;
    console.error = () => undefined;
    try {
      expect(h.controller.applyQuality("high")).toBe(false);
    } finally {
      console.error = logged;
    }
    expect(h.qualities.at(-1)).toBe("standard");
    expect(h.frames).toEqual([]);
  });

  it("the same quality is a no-op", () => {
    const h = harness();
    expect(h.controller.applyQuality("standard")).toBe(true);
    expect(h.calls).toEqual([]);
  });
});

function ctx(h: Harness): SessionState["core"] {
  return h.ctx.core;
}
