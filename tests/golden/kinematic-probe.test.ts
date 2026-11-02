// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { runToSteps } from "../../src/sim/loop.js";
import { DT } from "../../src/sim/step.js";
import { hashState, initState } from "../../src/sim/state.js";
import type { InputFrame } from "../../src/sim/state.js";

/**
 * The checked-in golden fixture (D-11). `version` exists so a future
 * serialization change fails loudly here instead of silently re-baselining the
 * hash. `node:fs` + `JSON.parse` keeps `resolveJsonModule` out of tsconfig.
 */
interface Fixture {
  version: number;
  dt: number;
  targetSteps: number;
  script: readonly InputFrame[];
  expected: { algorithm: string; hash: string };
}

const fixture = JSON.parse(
  readFileSync(new URL("./kinematic-probe.json", import.meta.url), "utf8"),
) as Fixture;

const inputAtTick = (tick: number): InputFrame =>
  fixture.script[tick % fixture.script.length] as InputFrame;

describe("golden fixture: kinematic probe", () => {
  it("replays the versioned input script to the recorded FNV-1a hash", () => {
    expect(fixture.version).toBe(1);
    // `toBe`, not `toBeCloseTo`: the recorded literal parses to the same
    // IEEE-754 double as 1/120, so any transcription slip is caught here.
    expect(fixture.dt).toBe(DT);
    expect(fixture.expected.algorithm).toBe("fnv1a32");
    expect(fixture.expected.hash).toMatch(/^[0-9a-f]{8}$/);

    const state = initState();
    const frames = Array.from({ length: fixture.targetSteps + 10 }, () => DT);
    const result = runToSteps(state, frames, inputAtTick, fixture.targetSteps);

    expect(result.steps).toBe(fixture.targetSteps);
    expect(hashState(state)).toBe(fixture.expected.hash);
  });
});
