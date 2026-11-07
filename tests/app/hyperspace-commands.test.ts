// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Same-frame H edge mapping (D-06, G-6).
 *
 * Two presses drained into one frame must start then cancel; a press while a
 * countdown is live must cancel; a cancel followed by a begin starts a new
 * attempt. The mapper must not mutate its input.
 */

import { describe, expect, it } from "vitest";

import { mapHyperspaceBeginEdges } from "../../src/app/hyperspace-commands.js";
import type { Command } from "../../src/sim/commands.js";

const BEGIN: Command = { kind: "beginHyperspace" };
const CANCEL: Command = { kind: "cancelHyperspace" };

describe("mapHyperspaceBeginEdges", () => {
  it("turns two begins drained into one frame into begin then cancel", () => {
    const mapped = mapHyperspaceBeginEdges([BEGIN, BEGIN], false);

    expect(mapped).toEqual([BEGIN, CANCEL]);
  });

  it("turns a begin into a cancel while a countdown is already live", () => {
    const mapped = mapHyperspaceBeginEdges([BEGIN], true);

    expect(mapped).toEqual([CANCEL]);
  });

  it("keeps a cancel-then-begin pair as a restart when a countdown is live", () => {
    const mapped = mapHyperspaceBeginEdges([CANCEL, BEGIN], true);

    expect(mapped).toEqual([CANCEL, BEGIN]);
  });

  it("preserves unrelated commands in order and does not mutate the input", () => {
    const input: Command[] = [
      { kind: "toggleTorus" },
      BEGIN,
      { kind: "cycleCompass" },
      BEGIN,
      { kind: "setPaused", paused: false },
    ];
    const snapshot = structuredClone(input);

    const mapped = mapHyperspaceBeginEdges(input, false);

    expect(mapped).toEqual([
      { kind: "toggleTorus" },
      BEGIN,
      { kind: "cycleCompass" },
      CANCEL,
      { kind: "setPaused", paused: false },
    ]);
    expect(input).toEqual(snapshot);
    expect(mapped).not.toBe(input);
  });

  it("returns an empty array for no commands", () => {
    expect(mapHyperspaceBeginEdges([], true)).toEqual([]);
  });
});
