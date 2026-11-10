// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The redraw gate: a docked or paused session draws its unchanging scene a
 * fixed number of times and then leaves the GPU alone.
 *
 * The session wiring is checked by reading the source, because the session has
 * no unit harness: the loop must ask the gate, every direct `renderFrame` call
 * must still draw, and the paths that invalidate the canvas must ask for a
 * redraw.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  createRedrawGate,
  IDLE_SETTLE_DRAWS,
} from "../../src/app/redraw-gate.js";

const STATE = { name: "state" };
const SCENE = { name: "scene" };

/** Run `frames` loop frames the way the session does: decide, then draw. */
function run(
  gate: ReturnType<typeof createRedrawGate>,
  frames: number,
  idle: boolean,
  keys: readonly unknown[],
): number {
  let draws = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    if (gate.next(idle, keys)) {
      gate.drawn(keys);
      draws += 1;
    }
  }
  return draws;
}

describe("createRedrawGate", () => {
  it("draws every frame while the session simulates", () => {
    const gate = createRedrawGate();
    expect(run(gate, 50, false, [STATE, SCENE, 0])).toBe(50);
  });

  it("draws the settle count and then nothing while idle", () => {
    const gate = createRedrawGate();
    expect(run(gate, 50, true, [STATE, SCENE, 0])).toBe(IDLE_SETTLE_DRAWS);
    expect(run(gate, 50, true, [STATE, SCENE, 0])).toBe(0);
  });

  it("draws the first idle frames even when no frame simulated before", () => {
    // A session that starts docked: the very first loop frame is idle.
    const gate = createRedrawGate(1);
    expect(gate.next(true, [STATE, SCENE, 0])).toBe(true);
  });

  it("settles again after a frame that simulated", () => {
    const gate = createRedrawGate();
    const keys = [STATE, SCENE, 0];
    run(gate, 10, true, keys);
    expect(run(gate, 3, false, keys)).toBe(3);
    expect(run(gate, 10, true, keys)).toBe(IDLE_SETTLE_DRAWS);
  });

  it("settles again after a redraw request", () => {
    const gate = createRedrawGate();
    const keys = [STATE, SCENE, 0];
    run(gate, 10, true, keys);
    gate.request();
    expect(run(gate, 10, true, keys)).toBe(IDLE_SETTLE_DRAWS);
  });

  it.each([
    ["the flight state object", [{ name: "loaded" }, SCENE, 0]],
    ["the scene", [STATE, { name: "rebuilt" }, 0]],
    ["a texture revision", [STATE, SCENE, 1]],
  ])("settles again when %s changes", (_label, changed) => {
    const gate = createRedrawGate();
    run(gate, 10, true, [STATE, SCENE, 0]);
    expect(run(gate, 10, true, changed)).toBe(IDLE_SETTLE_DRAWS);
  });

  it("does not redraw for keys a direct draw already recorded", () => {
    const gate = createRedrawGate();
    run(gate, 10, true, [STATE, SCENE, 0]);
    // A quality change rebuilds the scene and draws it outside the loop.
    const rebuilt = [STATE, { name: "rebuilt" }, 0];
    gate.drawn(rebuilt);
    expect(run(gate, 10, true, rebuilt)).toBe(0);
  });

  it("compares keys by identity, so an equal copy counts as a change", () => {
    const gate = createRedrawGate();
    run(gate, 10, true, [STATE, SCENE, 0]);
    expect(run(gate, 10, true, [{ ...STATE }, SCENE, 0])).toBe(
      IDLE_SETTLE_DRAWS,
    );
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects a settle count of %s",
    (settle) => {
      expect(() => createRedrawGate(settle)).toThrow(RangeError);
    },
  );
});

describe("the session wiring", () => {
  const source = readFileSync("src/app/game-session.ts", "utf8");

  it("asks the gate in exactly one place: the frame loop", () => {
    expect(source.match(/renderFrame\(alpha, shouldDraw\(\)\)/g)).toHaveLength(
      1,
    );
    // Every other caller passes one argument and therefore always draws.
    const calls = source.match(/renderFrame\([^)]*\)/g) ?? [];
    const gated = calls.filter((call) => call.includes(","));
    expect(gated).toEqual([
      "renderFrame(alpha: number, draw = true)",
      "renderFrame(alpha, shouldDraw()",
    ]);
  });

  it("treats exactly docked and paused as idle", () => {
    expect(source).toContain(
      'redrawGate.next(paused || state?.mode === "docked", drawKeys())',
    );
  });

  it("keys the image on the state, the scene and the nebula textures", () => {
    expect(source).toContain(
      "return [state, scene, scene?.nebulae?.revision() ?? 0];",
    );
  });

  it("asks for a redraw after every path that can leave the canvas stale", () => {
    // The chart, the save screen, `resize()`, the `?test=1` taint callback and
    // the tab becoming visible again.
    expect(source.match(/redrawGate\.request\(\);/g)).toHaveLength(5);
    expect(readFileSync("src/main.ts", "utf8")).toContain(
      "else session.shown();",
    );
  });

  it("counts loop frames separately from drawn frames", () => {
    expect(source).toContain("probe.frames += 1;");
    expect(source).toContain("probe.renders = renderer.info.render.frame;");
  });
});
