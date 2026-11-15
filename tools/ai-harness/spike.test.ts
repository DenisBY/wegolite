// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The AI-11 spike: the original Oolite shuttle AI, run in `node:vm` against a
 * stub host, over three scripted fixtures.
 *
 * The cases that execute Oolite's JavaScript need the pinned tree: run with
 * `OOLITE_SRC` naming a directory built from the local Oolite checkout at
 * 7437f22 (`git archive 7437f22 src Resources`). Without it they skip, which is
 * the state on the remote test machine and in CI (no checkout there).
 *
 * `AI_HARNESS_TRANSCRIPT=1` prints each fixture's trace and the host inventory
 * for 14-SPIKE.md.
 */

import { describe, expect, it } from "vitest";

import {
  createStubHost,
  FRAME_SECONDS,
  formatTrace,
  inventoryOf,
  StubVector3D,
  type HarnessFixture,
  type InventorySummary,
  type StubHost,
  type TraceEntry,
} from "./host.js";
import { callInContext, loadAiLibrary, type LoadedAi } from "./load.js";

const OOLITE_SRC = process.env.OOLITE_SRC ?? "";
const NEEDS_TREE = OOLITE_SRC === "";
const TRANSCRIPT = process.env.AI_HARNESS_TRANSCRIPT === "1";

/** The scripted `Math.random` sequence: exactly representable, so runs compare equal. */
const DRAWS: readonly number[] = [
  0.25, 0.5, 0.75, 0.125, 0.875, 0.375, 0.625, 0.0625,
];

const CALM: HarnessFixture = {
  name: "calm",
  startSeconds: 1000,
  hostileInRange: false,
};
const HOSTILE: HarnessFixture = {
  name: "hostile",
  startSeconds: 1000,
  hostileInRange: true,
};
const RECONSIDER: HarnessFixture = {
  name: "reconsider",
  startSeconds: 1000,
  hostileInRange: false,
};

interface Run {
  readonly host: StubHost;
  readonly ai: LoadedAi;
  readonly lines: string[];
  readonly wakeTimes: number[];
  readonly drawCount: number;
  readonly inventory: InventorySummary;
}

function startAi(fixture: HarnessFixture): { host: StubHost; ai: LoadedAi } {
  const host = createStubHost(fixture, DRAWS);
  const ai = loadAiLibrary(OOLITE_SRC, host);
  // The engine runs a world script's startUp; the library's builds its comms table.
  callInContext(ai.library, "this.startUp()");
  callInContext(ai.role, "this.aiStarted()");
  return { host, ai };
}

/** Drive one fixture from its script; the same script every time. */
function runFixture(fixture: HarnessFixture): Run {
  const { host, ai } = startAi(fixture);
  if (fixture.name === "reconsider") {
    // 1 s entry, then the 30 s entries, across 70 s.
    host.advanceClock(70);
    // The nearest station turns hostile: the 20 s entry runs at the next wake.
    host.setStationHostile(true);
    host.advanceClock(40);
    // The never-later rule: a later request leaves the pending wake alone, an
    // earlier one moves it.
    callInContext(ai.role, "this.oolite_priorityai.reconsiderIn(500)");
    callInContext(ai.role, "this.oolite_priorityai.reconsiderIn(0.5)");
    host.advanceClock(2);
  } else {
    host.advanceClock(1);
  }
  const run: Run = {
    host,
    ai,
    lines: formatTrace(host.trace),
    wakeTimes: host.wakeTimesWritten(),
    drawCount: host.drawCount(),
    inventory: inventoryOf(host),
  };
  if (TRANSCRIPT) {
    console.info(
      [
        `--- fixture ${fixture.name}: ${String(run.lines.length)} trace entries, ${String(run.drawCount)} draws`,
        ...run.lines,
        `inventory ${JSON.stringify(run.inventory)}`,
        `role entries ${JSON.stringify(ai.role.entries)}`,
        `library entries ${JSON.stringify(ai.library.entries)}`,
        `logs ${JSON.stringify(host.logs)}`,
      ].join("\n"),
    );
  }
  return run;
}

function callsOf(trace: readonly TraceEntry[]): string[] {
  return trace.flatMap((entry) =>
    entry.kind === "call" ? [entry.member] : [],
  );
}

describe("AI-11 spike: host pieces that need no checkout", () => {
  it("the scripted draw is counted and fails loudly when exhausted", () => {
    const host = createStubHost(CALM, [0.5, 0.25]);
    expect(host.draw()).toBe(0.5);
    expect(host.draw()).toBe(0.25);
    expect(host.drawCount()).toBe(2);
    expect(() => host.draw()).toThrow(/exhausted after 2 draws/);
    expect(host.trace.filter((entry) => entry.kind === "draw")).toHaveLength(2);
  });

  it("advanceClock refuses to run before a role context is attached", () => {
    const host = createStubHost(CALM, DRAWS);
    // Nothing is waiting, so the clock simply moves.
    host.advanceClock(1);
    expect(host.clock.adjustedSeconds).toBe(1001);
    host.ship.AIScriptWakeTime = 1001.5;
    expect(() => host.advanceClock(1)).toThrow(/before attach/);
  });

  it("Vector3D.distanceTo accepts a vector or an entity, as Oolite's does", () => {
    const origin = new StubVector3D(0, 0, 0);
    expect(origin.distanceTo(new StubVector3D(3, 4, 0))).toBe(5);
    expect(origin.distanceTo({ position: new StubVector3D(0, 0, 2) })).toBe(2);
    expect(() => origin.distanceTo({})).toThrow(/no position/);
  });
});

describe("AI-11 spike: the original shuttle AI in vm", () => {
  it.skipIf(NEEDS_TREE)(
    "wires one context per script as Oolite attaches them",
    () => {
      const { host, ai } = startAi(CALM);
      expect(ai.library.context).not.toBe(ai.role.context);
      expect(ai.library.global).not.toBe(ai.role.global);
      // The library is a world script; the role AI is the ship's AIScript, not a world script.
      expect(host.worldScripts["oolite-libPriorityAI"]).toBe(ai.library.global);
      expect(Object.keys(host.worldScripts)).toEqual(["oolite-libPriorityAI"]);
      expect(host.ship.AIScript).toBe(ai.role.global);
      expect(callInContext(ai.role, "this")).toBe(ai.role.global);
      // Neither script clobbers the other's `this.name` or leaks its globals.
      expect(callInContext(ai.library, "this.name")).toBe(
        "oolite-libPriorityAI",
      );
      expect(callInContext(ai.role, "this.name")).toBe("Oolite Shuttle AI");
      expect(callInContext(ai.role, "typeof PriorityAIController")).toBe(
        "undefined",
      );
      expect(callInContext(ai.library, "typeof PriorityAIController")).toBe(
        "function",
      );
      // The sentinel sits on each context's global.
      expect(callInContext(ai.role, "typeof __aiHarnessSentinel")).toBe(
        "string",
      );
      expect(callInContext(ai.library, "typeof __aiHarnessSentinel")).toBe(
        "string",
      );
    },
  );

  it.skipIf(NEEDS_TREE)(
    "routes Math.random of every context to the one counted draw",
    () => {
      const { host, ai } = startAi(CALM);
      const before = host.drawCount();
      expect(callInContext(ai.role, "Math.random()")).toBe(DRAWS[before]);
      expect(callInContext(ai.library, "Math.random()")).toBe(
        DRAWS[before + 1],
      );
      expect(host.drawCount()).toBe(before + 2);
    },
  );

  it.skipIf(NEEDS_TREE)(
    "terminates a runaway entry with the vm timeout",
    () => {
      const { ai } = startAi(CALM);
      expect(() => callInContext(ai.role, "for (;;) {}")).toThrow(/timed out/i);
      expect(() => callInContext(ai.library, "for (;;) {}")).toThrow(
        /timed out/i,
      );
    },
  );

  it.skipIf(NEEDS_TREE)(
    "calm: the first reconsider selects a destination and flies towards it",
    () => {
      const run = runFixture(CALM);
      const { trace } = run.host;
      expect(trace.length).toBeGreaterThan(0);
      // aiStarted: the constructor draws the player role, setPriorities draws the first delay.
      expect(trace.slice(0, 3).map((entry) => entry.kind)).toEqual([
        "draw",
        "draw",
        "set",
      ]);
      expect(trace[2]).toMatchObject({
        member: "AIScriptWakeTime",
        value: 1000.5,
      });
      // The priority list falls through to configurationSelectShuttleDestination
      // and behaviourApproachDestination (reconsider 1).
      const wake = trace.findIndex((entry) => entry.kind === "wake");
      const afterWake = callsOf(trace.slice(wake));
      expect(afterWake).toEqual([
        "findNearestStation",
        "checkCourseToDestination",
        "performFlyToRangeFromDestination",
      ]);
      expect(run.wakeTimes).toEqual([1000.5, 1001.5625]);
      // The configuration chose the station (draw 0.75 of two candidates).
      const chosen = callInContext(
        run.ai.role,
        "this.oolite_priorityai.getParameter('oolite_selectedStation')",
      );
      expect((chosen as { __label: string }).__label).toBe("station");
      expect(run.drawCount).toBe(3);
    },
  );

  it.skipIf(NEEDS_TREE)(
    "hostile: a hostile in range on red alert makes the shuttle flee",
    () => {
      const run = runFixture(HOSTILE);
      expect(callsOf(run.host.trace)).toEqual([
        "findNearestStation",
        "performFlee",
      ]);
      expect(run.host.trace).toContainEqual({
        kind: "set",
        target: "ship",
        member: "desiredRange",
        value: 25600,
      });
      expect(run.drawCount).toBe(2);
      // Nothing the library asked for was left unanswered.
      expect(run.inventory.missing).toEqual([]);
    },
  );

  it.skipIf(NEEDS_TREE)(
    "reconsider: wakes only through AIScriptWakeTime and aiAwoken",
    () => {
      const run = runFixture(RECONSIDER);
      const { trace } = run.host;
      const wakes = trace.flatMap((entry) =>
        entry.kind === "wake" ? [entry] : [],
      );
      expect(wakes.length).toBeGreaterThanOrEqual(6);
      // The priority AI never reconsiders through Timer.
      expect(trace.some((entry) => entry.kind === "timer")).toBe(false);
      // Each wake comes on the first frame strictly past the written time.
      for (const wake of wakes) {
        expect(wake.at).toBeGreaterThan(wake.wakeTime);
        expect(wake.at - wake.wakeTime).toBeLessThanOrEqual(FRAME_SECONDS);
      }
      // Each wake time was written by the AI: the one before it, not invented.
      const written = new Set(run.wakeTimes);
      for (const wake of wakes) {
        expect(written.has(wake.wakeTime)).toBe(true);
      }
      // Every wake went through aiAwoken in the role context.
      const aiAwokenEntries = run.ai.role.entries.filter(
        (entry) => entry === "this.aiAwoken()",
      );
      expect(aiAwokenEntries).toHaveLength(wakes.length);
      // The AI writes the next wake during the aiAwoken call: the first write
      // after each wake is the delay of the entry it ran (1, 30 or 20).
      const delays = new Set<number>();
      trace.forEach((entry, index) => {
        if (entry.kind !== "wake") {
          return;
        }
        const next = trace
          .slice(index + 1)
          .find(
            (later) =>
              later.kind === "set" &&
              later.member === "AIScriptWakeTime" &&
              typeof later.value === "number",
          );
        if (next?.kind === "set" && typeof next.value === "number") {
          delays.add(Math.round((next.value - entry.at) * 10000) / 10000);
        }
      });
      // delay = write - wake time, quantised by the frame the wake landed on.
      const rounded = [...delays].map((d) => Math.round(d));
      expect(rounded).toContain(1);
      expect(rounded).toContain(30);
      expect(rounded).toContain(20);
      // The never-later rule: reconsiderIn(500) left the pending wake alone
      // (no write), reconsiderIn(0.5) moved it earlier.
      const sets = trace.flatMap((entry) =>
        entry.kind === "set" &&
        entry.member === "AIScriptWakeTime" &&
        typeof entry.value === "number"
          ? [entry.value]
          : [],
      );
      const moved = sets.indexOf(1110.5);
      expect(moved).toBeGreaterThan(0);
      // The write before it was the pending 20 s wake (1111.8125); the earlier
      // request replaced it, so the AI woke at 1110.5, not at 1111.8125.
      expect(sets[moved - 1]).toBe(1111.8125);
      expect(wakes.map((wake) => wake.wakeTime)).toContain(1110.5);
      expect(wakes.map((wake) => wake.wakeTime)).not.toContain(1111.8125);
      expect(sets).not.toContain(1110 + 500);
    },
  );

  it.skipIf(NEEDS_TREE)(
    "two runs of every fixture produce identical traces, wake times and draw counts",
    () => {
      for (const fixture of [CALM, HOSTILE, RECONSIDER]) {
        const first = runFixture(fixture);
        const second = runFixture(fixture);
        expect(second.lines, fixture.name).toEqual(first.lines);
        expect(second.wakeTimes, fixture.name).toEqual(first.wakeTimes);
        expect(second.drawCount, fixture.name).toBe(first.drawCount);
        expect(second.inventory, fixture.name).toEqual(first.inventory);
      }
    },
  );

  it.skipIf(NEEDS_TREE)(
    "every entry into Oolite code ran through runInContext with a timeout",
    () => {
      const run = runFixture(RECONSIDER);
      for (const context of [run.ai.library, run.ai.role]) {
        // Only loads, the installer, the global probe and fixed expressions.
        for (const entry of context.entries) {
          expect(entry).toMatch(/^(load |install |global$|this\.)/);
        }
      }
      expect(
        run.ai.role.entries.filter((entry) => entry === "this.aiStarted()"),
      ).toHaveLength(1);
    },
  );
});
