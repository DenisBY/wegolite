// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * T-3-36: the planet's per-pixel cost and the delivery constraints that keep
 * the software-rasterised suite honest, pinned as source scans.
 *
 * The phase-03 regression escaped because the "16 evaluation" budget was
 * accepted on a scene+hud subset; the full 29-test suite was the instrument
 * nobody ran. These assertions turn the plan's prose into fast, deterministic
 * failures:
 *
 * - the shader's octave `#define`s must equal their mirror exports and their
 *   derived sum must equal `NOISE_EVAL_BUDGET` and stay at or below a pinned
 *   ceiling;
 * - the shader must keep exactly one surface call, exactly three `fbm(` calls
 *   (two relief, one cloud) and the sea gate in front of them;
 * - the step cap, the HUD wait and the implicit 2-worker policy must not move.
 *
 * Every branch has a negative control that feeds a mutated source and asserts a
 * violation that *names* the constant, so a guard that silently ignores one of
 * its inputs cannot pass. The scripts that were allowed to be relaxed (a slower
 * run may lower `CLOUD_OCTAVES` to 1 and the ceiling to 9) are still guarded:
 * the ceiling is a ceiling, not an equality.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  CLOUD_OCTAVES,
  NOISE_EVAL_BUDGET,
  RELIEF_OCTAVES,
  SURFACE_OCTAVES,
} from "../../src/render/planet-noise.js";
import { PLANET_FRAGMENT_SHADER } from "../../src/render/shaders/planet.glsl.js";

/**
 * The largest worst-case budget this phase shipped after measurement.
 *
 * The ten-evaluation build measured a 160 s message test, above the 133 s
 * cadence gate, so the pre-agreed slow-run step lowered `CLOUD_OCTAVES` to 1
 * and this ceiling to 9 in the same commit. A lower budget is exactly what the
 * gate wants, so this is a ceiling rather than an equality. Raising it is a
 * deliberate edit of this test made together with a new full-suite measurement.
 */
export const BUDGET_CEILING = 9;

/** A numeric `#define NAME value` from the source, or `null` when absent. */
function defineValue(source: string, name: string): number | null {
  const match = new RegExp(`#define\\s+${name}\\s+([0-9.]+)`).exec(source);
  return match === null ? null : Number(match[1]);
}

/**
 * Remove one complete `float name(...) { ... }` definition, brace-matched.
 *
 * Counting call sites must not count the definition itself, and the stray-noise
 * check must not see the two legitimate `valueNoise(` calls inside `fbm` and
 * `fbmSurface`.
 */
function stripFunction(source: string, name: string): string {
  const start = source.search(new RegExp(`float\\s+${name}\\s*\\(`));
  if (start < 0) return source;
  const open = source.indexOf("{", start);
  if (open < 0) return source;

  let depth = 0;
  for (let index = open; index < source.length; index++) {
    const char = source[index];
    if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) {
        return source.slice(0, start) + source.slice(index + 1);
      }
    }
  }
  return source;
}

function stripFunctions(source: string, names: readonly string[]): string {
  return names.reduce((text, name) => stripFunction(text, name), source);
}

/** Call sites of `name(` with its own definition removed. */
function countCalls(source: string, name: string): number {
  const stripped = stripFunction(source, name);
  return (stripped.match(new RegExp(`\\b${name}\\s*\\(`, "g")) ?? []).length;
}

/**
 * Every way the shipped fragment shader can grow past its pinned budget.
 *
 * `mirrorBudget` is a parameter so a control can raise the mirror side with the
 * shader and isolate the ceiling branch from the drift branch.
 */
export function budgetViolations(
  source: string,
  mirrorBudget: number = NOISE_EVAL_BUDGET,
): string[] {
  const violations: string[] = [];

  const mirrored: ReadonlyArray<readonly [string, number]> = [
    ["SURFACE_OCTAVES", SURFACE_OCTAVES],
    ["RELIEF_OCTAVES", RELIEF_OCTAVES],
    ["CLOUD_OCTAVES", CLOUD_OCTAVES],
  ];

  const values = new Map<string, number>();
  for (const [name, expected] of mirrored) {
    const value = defineValue(source, name);
    if (value === null) {
      violations.push(`the shader has no #define ${name}`);
      continue;
    }
    values.set(name, value);
    if (value !== expected) {
      violations.push(
        `#define ${name} is ${value}, the mirror exports ${expected}`,
      );
    }
  }

  const sum =
    (values.get("SURFACE_OCTAVES") ?? 0) +
    2 * (values.get("RELIEF_OCTAVES") ?? 0) +
    (values.get("CLOUD_OCTAVES") ?? 0);

  if (sum !== mirrorBudget) {
    violations.push(
      `the #define sum is ${sum}, NOISE_EVAL_BUDGET is ${mirrorBudget}`,
    );
  }
  if (mirrorBudget > BUDGET_CEILING) {
    violations.push(
      `NOISE_EVAL_BUDGET is ${mirrorBudget}, above BUDGET_CEILING ${BUDGET_CEILING}`,
    );
  }
  if (sum > BUDGET_CEILING) {
    violations.push(
      `the #define sum is ${sum}, above BUDGET_CEILING ${BUDGET_CEILING}`,
    );
  }

  const surfaceCalls = countCalls(source, "fbmSurface");
  if (surfaceCalls !== 1) {
    violations.push(
      `expected one fbmSurface( call site, found ${surfaceCalls}`,
    );
  }

  const fieldCalls = countCalls(source, "fbm");
  if (fieldCalls !== 3) {
    violations.push(
      `expected three fbm( call sites (two relief, one cloud), found ${fieldCalls}`,
    );
  }

  const gate = "if (seaishness < 1.0)";
  const gateIndex = source.indexOf(gate);
  if (gateIndex < 0) {
    violations.push(`missing the sea gate literal: ${gate}`);
  } else {
    for (const match of source.matchAll(/\bfbm\s*\(/g)) {
      const index = match.index ?? -1;
      // The definition is `float fbm(`; only calls are gated.
      if (/float\s+$/.test(source.slice(0, index))) continue;
      if (index < gateIndex) {
        violations.push(
          `an fbm( relief tap appears before the sea gate ${gate}`,
        );
        break;
      }
    }
  }

  const noiseBody = stripFunctions(source, ["valueNoise", "fbm", "fbmSurface"]);
  const strayNoise = (noiseBody.match(/\bvalueNoise\s*\(/g) ?? []).length;
  if (strayNoise > 0) {
    violations.push(
      `${strayNoise} extra valueNoise( call site(s) outside fbm/fbmSurface`,
    );
  }

  if (source.includes("texture2D(")) {
    violations.push("the fragment shader samples texture2D(");
  }
  if (source.includes("sampler2D")) {
    violations.push("the fragment shader declares a sampler2D");
  }

  return violations;
}

/**
 * The delivery constraints this plan exists to leave untouched.
 *
 * Each message names the constant it is about, so a failing control can assert
 * message-specifically. A `workers` key is rejected because it would change the
 * contention the 1.3x cadence gate was measured under; serialising workers is
 * the mitigation this plan refuses.
 */
export function frozenContractViolations(
  stepSource: string,
  hudSource: string,
  configSource: string,
): string[] {
  const violations: string[] = [];

  const requiredStep: ReadonlyArray<readonly [string, string]> = [
    ["MAX_STEPS_PER_FRAME = 5", "MAX_STEPS_PER_FRAME"],
    ["DT = 1 / 120", "DT"],
    ["MAX_FRAME_DELTA = 0.25", "MAX_FRAME_DELTA"],
  ];
  for (const [literal, name] of requiredStep) {
    if (!stepSource.includes(literal)) {
      violations.push(
        `src/sim/step.ts no longer contains ${literal} (${name})`,
      );
    }
  }

  if (!hudSource.includes("test.setTimeout(180_000)")) {
    violations.push(
      "tests/e2e/hud.spec.ts no longer contains test.setTimeout(180_000)",
    );
  }
  if (!hudSource.includes("timeout: 150_000")) {
    violations.push(
      "tests/e2e/hud.spec.ts no longer contains the 150 s wait (timeout: 150_000)",
    );
  }

  if (/^\s*workers\s*:/m.test(configSource)) {
    violations.push(
      "playwright.config.ts declares a workers override (the gate is measured at the implicit 2-worker default)",
    );
  }

  return violations;
}

const STEP_SOURCE = readFileSync(
  new URL("../../src/sim/step.ts", import.meta.url),
  "utf8",
);
const HUD_SOURCE = readFileSync(
  new URL("../e2e/hud.spec.ts", import.meta.url),
  "utf8",
);
const CONFIG_SOURCE = readFileSync(
  new URL("../../playwright.config.ts", import.meta.url),
  "utf8",
);

describe("planet noise budget", () => {
  it("accepts the shipped shader", () => {
    expect(budgetViolations(PLANET_FRAGMENT_SHADER)).toEqual([]);
  });

  it("derives the shipped budget from the defines", () => {
    const surface = defineValue(PLANET_FRAGMENT_SHADER, "SURFACE_OCTAVES");
    const relief = defineValue(PLANET_FRAGMENT_SHADER, "RELIEF_OCTAVES");
    const cloud = defineValue(PLANET_FRAGMENT_SHADER, "CLOUD_OCTAVES");

    expect(surface).toBe(6);
    expect(relief).toBe(1);
    expect(cloud).toBe(1);

    const sum = (surface ?? 0) + 2 * (relief ?? 0) + (cloud ?? 0);
    expect(sum).toBe(NOISE_EVAL_BUDGET);
    expect(NOISE_EVAL_BUDGET).toBe(9);
    expect(BUDGET_CEILING).toBe(9);
    expect(NOISE_EVAL_BUDGET).toBeLessThanOrEqual(BUDGET_CEILING);
  });

  it("rejects a raised relief octave count", () => {
    const raised = PLANET_FRAGMENT_SHADER.replace(
      "#define RELIEF_OCTAVES 1",
      "#define RELIEF_OCTAVES 3",
    );
    const violations = budgetViolations(raised);

    expect(
      violations.some((message) => message.includes("RELIEF_OCTAVES")),
    ).toBe(true);
    expect(
      violations.some((message) => message.includes("BUDGET_CEILING")),
    ).toBe(true);
  });

  it("rejects a fourth fbm( tap", () => {
    const extraTap = PLANET_FRAGMENT_SHADER.replace(
      "ground *= shade;",
      "ground *= shade;\n  float extra = fbm(n, 3.0);",
    );

    expect(
      budgetViolations(extraTap).some((message) => message.includes("fbm(")),
    ).toBe(true);
  });

  it("rejects a removed sea gate", () => {
    const ungated = PLANET_FRAGMENT_SHADER.replace(
      "if (seaishness < 1.0) {",
      "if (true) {",
    );

    expect(
      budgetViolations(ungated).some((message) =>
        message.includes("seaishness"),
      ),
    ).toBe(true);
  });

  it("rejects a define sum raised with the mirror budget past the ceiling", () => {
    // One octave above the shipped cloud field with a matching mirror budget:
    // the drift check agrees (6 + 2 + 2 = 10), so the ceiling is the branch
    // that must fire.
    const cloudy = PLANET_FRAGMENT_SHADER.replace(
      "#define CLOUD_OCTAVES 1",
      "#define CLOUD_OCTAVES 2",
    );
    const violations = budgetViolations(cloudy, 10);

    expect(
      violations.some((message) => message.includes("BUDGET_CEILING")),
    ).toBe(true);
  });

  it("rejects an injected texture sample", () => {
    const textured = PLANET_FRAGMENT_SHADER.replace(
      "gl_FragColor = vec4(color, 1.0);",
      "vec4 sampled = texture2D(uTex, vec2(0.0));\n  gl_FragColor = vec4(color, 1.0);",
    );

    expect(
      budgetViolations(textured).some((message) =>
        message.includes("texture2D"),
      ),
    ).toBe(true);
  });

  it("rejects an extra valueNoise( call outside fbm/fbmSurface", () => {
    const stray = PLANET_FRAGMENT_SHADER.replace(
      "gl_FragColor = vec4(color, 1.0);",
      "float noise = valueNoise(n);\n  gl_FragColor = vec4(color, 1.0);",
    );

    expect(
      budgetViolations(stray).some((message) => message.includes("valueNoise")),
    ).toBe(true);
  });
});

describe("frozen delivery contract", () => {
  it("accepts the shipped step, hud and config sources", () => {
    expect(
      frozenContractViolations(STEP_SOURCE, HUD_SOURCE, CONFIG_SOURCE),
    ).toEqual([]);
  });

  it("rejects a relaxed HUD wait", () => {
    const relaxed = HUD_SOURCE.replace("timeout: 150_000", "timeout: 300_000");

    expect(
      frozenContractViolations(STEP_SOURCE, relaxed, CONFIG_SOURCE).some(
        (message) => message.includes("150_000"),
      ),
    ).toBe(true);
  });

  it("rejects a shortened HUD test timeout", () => {
    const shortened = HUD_SOURCE.replace(
      "test.setTimeout(180_000)",
      "test.setTimeout(90_000)",
    );

    expect(
      frozenContractViolations(STEP_SOURCE, shortened, CONFIG_SOURCE).some(
        (message) => message.includes("180_000"),
      ),
    ).toBe(true);
  });

  it("rejects a raised step cap", () => {
    const raised = STEP_SOURCE.replace(
      "MAX_STEPS_PER_FRAME = 5",
      "MAX_STEPS_PER_FRAME = 6",
    );

    expect(
      frozenContractViolations(raised, HUD_SOURCE, CONFIG_SOURCE).some(
        (message) => message.includes("MAX_STEPS_PER_FRAME"),
      ),
    ).toBe(true);
  });

  it("rejects a coarser timestep", () => {
    const coarser = STEP_SOURCE.replace("DT = 1 / 120", "DT = 1 / 60");

    expect(
      frozenContractViolations(coarser, HUD_SOURCE, CONFIG_SOURCE).some(
        (message) => message.includes("DT"),
      ),
    ).toBe(true);
  });

  it("rejects a longer frame delta", () => {
    const longer = STEP_SOURCE.replace(
      "MAX_FRAME_DELTA = 0.25",
      "MAX_FRAME_DELTA = 0.5",
    );

    expect(
      frozenContractViolations(longer, HUD_SOURCE, CONFIG_SOURCE).some(
        (message) => message.includes("MAX_FRAME_DELTA"),
      ),
    ).toBe(true);
  });

  it("rejects a declared workers override", () => {
    const throttled = CONFIG_SOURCE.replace(
      "fullyParallel: false,",
      "fullyParallel: false,\n  workers: 1,",
    );

    expect(
      frozenContractViolations(STEP_SOURCE, HUD_SOURCE, throttled).some(
        (message) => message.includes("workers"),
      ),
    ).toBe(true);
  });
});
