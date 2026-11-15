// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The probe publisher against a fake session context (Phase 8, D-12 step 2,
 * G-8).
 *
 * Node only, no DOM, no WebGL: a real `SessionState` from `createSessionState`,
 * a plain probe object, a renderer double that exposes the counters the
 * publisher reads, and the real redraw gate and message queue. The publisher
 * must read every live field through `ctx` at each call and must keep the
 * `?test=1` hook pointed at the live flight state.
 */

import type * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createRedrawGate } from "../../../src/app/redraw-gate.js";
import type { RedrawGate } from "../../../src/app/redraw-gate.js";
import { createSessionState } from "../../../src/app/session/context.js";
import type { SessionState } from "../../../src/app/session/context.js";
import { createProbePublisher } from "../../../src/app/session/probe-publisher.js";
import type { ProbePublisher } from "../../../src/app/session/probe-publisher.js";
import type {
  WegoliteProbe,
  WegoliteSaveProbe,
} from "../../../src/app/probe.js";
import { createMessageQueue } from "../../../src/render/hud/messages.js";
import type { MessageQueue } from "../../../src/render/hud/messages.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import { hashWorld } from "../../../src/sim/world/serialize.js";
import { laveFixture } from "../../helpers/lave.js";

const { system, layout } = laveFixture();

interface Harness {
  readonly ctx: SessionState;
  readonly probe: WegoliteProbe;
  readonly saveProbe: WegoliteSaveProbe;
  readonly gate: RedrawGate;
  readonly messages: MessageQueue;
  readonly publisher: ProbePublisher;
  readonly renderer: { info: { render: { frame: number } } };
}

function harness(): Harness {
  const ctx = createSessionState({
    system,
    saveStatus: "absent",
    saveSkipReason: "",
  });
  // The publisher assigns probe fields and reads only `test`; a plain object
  // stands in for the page's probe.
  const probe = {} as WegoliteProbe;
  const saveProbe = {
    status: "absent",
    attempts: 0,
    writes: 0,
    committed: 0,
    revision: 0,
    lastClock: null,
    continueVisible: false,
    skipReason: "",
    unavailable: false,
  } satisfies WegoliteSaveProbe;
  const renderer = {
    info: {
      render: { calls: 3, triangles: 12, frame: 7 },
      memory: { geometries: 4, textures: 5 },
      programs: [{}, {}],
    },
  };
  const gate = createRedrawGate();
  const messages = createMessageQueue(4);
  const publisher = createProbePublisher(ctx, {
    probe,
    renderer: renderer as unknown as THREE.WebGLRenderer,
    scenes: { quality: () => "standard" },
    saveProbe,
    redrawGate: gate,
    messages,
    commitProfile: () => false,
    swapSystem: () => Promise.resolve(),
    disposeSystem: () => undefined,
    advanceTicks: () => 0,
  });
  return { ctx, probe, saveProbe, gate, messages, publisher, renderer };
}

describe("updateProbe", () => {
  it("publishes paused, the system id, the chart camera and the message depth", () => {
    const { ctx, probe, messages, publisher } = harness();
    ctx.runtime.paused = true;
    ctx.chart.chartOpen = true;
    const spanX = 56;
    ctx.chart.chartCamera = { centre: { x: 12, y: 34 }, spanX };
    messages.enqueue("first");
    messages.enqueue("second");

    publisher.updateProbe();

    expect(probe.paused).toBe(true);
    expect(probe.systemId).toBe(system.id);
    expect(probe.quality).toBe("standard");
    expect(probe.chart?.open).toBe(true);
    expect(probe.chart?.camera.centre).toEqual({ x: 12, y: 34 });
    expect(probe.chart?.camera.spanX).toBe(spanX);
    expect(probe.chart?.camera.spanY).toBe(2 * spanX);
    expect(probe.messages).toBe(2);
    expect(probe.calls).toBe(3);
    expect(probe.triangles).toBe(12);
    expect(probe.renders).toBe(7);
    expect(probe.memory).toEqual({ geometries: 4, textures: 5, programs: 2 });
  });

  it("reads the live context at every call, never a copy from construction", () => {
    const { ctx, probe, messages, publisher } = harness();
    publisher.updateProbe();
    expect(probe.paused).toBe(false);
    expect(probe.messages).toBe(0);
    expect(probe.chart?.targetId).toBeUndefined();

    ctx.runtime.paused = true;
    ctx.core.system = { ...system, id: "g0-s9" };
    ctx.core.hyperspaceTargetId = "g0-s3";
    ctx.core.state = initFlightState(layout);
    messages.enqueue("late");
    publisher.updateProbe();

    expect(probe.paused).toBe(true);
    expect(probe.systemId).toBe("g0-s9");
    expect(probe.chart?.targetId).toBe("g0-s3");
    expect(probe.hyperspace?.targetId).toBe("g0-s3");
    expect(probe.mode).toBe("docked");
    expect(probe.messages).toBe(1);
  });

  it("withdrawProbe removes the hook, save and Save/Load screen probes", () => {
    const { probe, publisher, saveProbe } = harness();
    probe.save = saveProbe;
    publisher.updateProbe();
    publisher.bindTestHook(initFlightState(layout));
    expect(probe.test).toBeDefined();
    expect(probe.saveScreen).toBeDefined();

    publisher.withdrawProbe();

    expect(probe.test).toBeUndefined();
    expect(probe.save).toBeUndefined();
    expect(probe.saveScreen).toBeUndefined();
  });
});

describe("bindTestHook", () => {
  it("a hook rebound to a replaced FlightState mutates only the new object and taints", () => {
    const { ctx, probe, gate, publisher } = harness();
    const stateA = initFlightState(layout);
    const stateB = initFlightState(layout);
    const speedBefore = stateA.speed;
    expect(stateB.speed).toBe(speedBefore);

    publisher.bindTestHook(stateA);
    publisher.bindTestHook(stateB);
    expect(ctx.runtime.testTainted).toBe(false);

    // Let the gate settle, then prove the mutate callback asks for a redraw.
    const keys = [stateB];
    while (gate.next(true, keys)) gate.drawn(keys);
    expect(gate.next(true, keys)).toBe(false);

    probe.test?.setSpeed(42);

    expect(stateB.speed).toBe(42);
    expect(stateA.speed).toBe(speedBefore);
    expect(ctx.runtime.testTainted).toBe(true);
    expect(probe.test?.tainted).toBe(true);
    expect(gate.next(true, keys)).toBe(true);
  });

  it("updateProbe mirrors the session taint onto the hook", () => {
    const { ctx, probe, publisher } = harness();
    publisher.bindTestHook(initFlightState(layout));
    expect(probe.test?.tainted).toBe(false);

    ctx.runtime.testTainted = true;
    publisher.updateProbe();

    expect(probe.test?.tainted).toBe(true);
  });

  it("a rejected mutation changes nothing and does not taint", () => {
    const { ctx, probe, publisher } = harness();
    const state = initFlightState(layout);
    const speedBefore = state.speed;
    publisher.bindTestHook(state);

    probe.test?.setSpeed(Number.NaN);

    expect(state.speed).toBe(speedBefore);
    expect(ctx.runtime.testTainted).toBe(false);
    expect(probe.test?.tainted).toBe(false);
  });
});

describe("syncSaveProbe", () => {
  it("publishes the committed revision, never the requested one", () => {
    const { ctx, saveProbe, publisher } = harness();
    ctx.save.saveRevision = 9;
    ctx.save.saveCommittedRevision = 4;
    ctx.save.saveAttempts = 5;
    ctx.save.saveWrites = 3;
    ctx.save.saveCommitted = 2;
    ctx.save.saveScreenNotice = "Saved";

    publisher.syncSaveProbe();

    expect(saveProbe.revision).toBe(4);
    expect(saveProbe.attempts).toBe(5);
    expect(saveProbe.writes).toBe(3);
    expect(saveProbe.committed).toBe(2);
    expect(saveProbe.notice).toBe("Saved");
  });
});

describe("syncEconomyProbe", () => {
  it("publishes nothing until a market and its seed exist", () => {
    const { probe, publisher } = harness();
    publisher.syncEconomyProbe();
    expect(probe.economy).toBeUndefined();
    expect(probe.station).toBeUndefined();
  });
});

describe("worldHash and the combat state (plan 13-11)", () => {
  it("hashes the live combat state when it is not pristine, and as the flight hash while it is", () => {
    const { ctx, probe, publisher } = harness();
    const state = initFlightState(layout);
    ctx.core.state = state;
    publisher.bindTestHook(state);
    const hook = probe.test;
    if (hook === undefined) throw new Error("no hook");

    // No combat state yet, then a pristine one: both are the flight hash.
    expect(hook.worldHash()).toBe(hashWorld(state, undefined));
    ctx.core.combat = createPlayerCombatState();
    expect(hook.worldHash()).toBe(hashWorld(state, undefined));
    expect(hook.worldHash()).toBe(hashWorld(state, undefined, undefined));

    // A shot shield changes the hash, read live (nothing captured).
    ctx.core.combat.fwdShield = 100;
    const damaged = hook.worldHash();
    expect(damaged).toBe(hashWorld(state, undefined, ctx.core.combat));
    expect(damaged).not.toBe(hashWorld(state, undefined));
    expect(ctx.runtime.testTainted).toBe(false);

    // A Load installs a fresh state: the hook follows the live one.
    ctx.core.combat = createPlayerCombatState();
    expect(hook.worldHash()).toBe(hashWorld(state, undefined));
  });
});
