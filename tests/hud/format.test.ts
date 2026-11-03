// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * HUD text formatting (FLGT-05, D-06).
 *
 * Oolite's clock is `%07d:%02d:%02d:%02d`; speed is displayed in LS (1 LS =
 * 1,000 game units/s) and fuel in tenths of a light year. The strings are
 * pinned exactly, and the module is checked for locale APIs so a machine with a
 * different default locale cannot change a pixel.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  MAX_MESSAGE_CHARS,
  clampMessage,
  formatClock,
  formatFuel,
  formatSpeed,
} from "../../src/render/hud/format.js";

const CLOCK_START = 2_084_004 * 86_400;

describe("formatClock", () => {
  it("formats Oolite's start day and the +600 s launch advance", () => {
    expect(formatClock(CLOCK_START)).toBe("2084004:00:00:00");
    expect(formatClock(CLOCK_START + 600)).toBe("2084004:00:10:00");
  });

  it("pads day, hour, minute and second independently", () => {
    expect(formatClock(0)).toBe("0000000:00:00:00");
    expect(formatClock(86_400 + 3_661)).toBe("0000001:01:01:01");
    expect(formatClock(CLOCK_START + 3_661)).toBe("2084004:01:01:01");
  });
});

describe("formatSpeed and formatFuel", () => {
  it("renders the Cobra's top speed and a full tank exactly", () => {
    expect(formatSpeed(350)).toBe("0.350 LS");
    expect(formatSpeed(0)).toBe("0.000 LS");
    expect(formatSpeed(175)).toBe("0.175 LS");
    expect(formatFuel(70)).toBe("7.0 LY");
    expect(formatFuel(0)).toBe("0.0 LY");
    expect(formatFuel(65)).toBe("6.5 LY");
  });
});

describe("clampMessage", () => {
  it("leaves a short message alone and ellipsises an overflow", () => {
    expect(clampMessage("abc", 5)).toBe("abc");
    expect(clampMessage("abcdef", 6)).toBe("abcdef");
    expect(clampMessage("abcdef", 5)).toBe("abcd…");
    expect(clampMessage("abcdef", 0)).toBe("");
    expect(MAX_MESSAGE_CHARS).toBeGreaterThan(0);
    expect(
      clampMessage("x".repeat(MAX_MESSAGE_CHARS + 10), MAX_MESSAGE_CHARS),
    ).toHaveLength(MAX_MESSAGE_CHARS);
  });
});

describe("locale independence", () => {
  it("uses no Intl or locale formatting in its executable source", () => {
    const source = readFileSync(
      new URL("../../src/render/hud/format.ts", import.meta.url),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    expect(source).not.toContain("Intl");
    expect(source).not.toContain("toLocaleString");
    expect(source).not.toContain("toLocaleDateString");
  });
});
