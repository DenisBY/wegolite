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
import {
  MESSAGE_DURATION_SECONDS,
  createMessageQueue,
} from "../../src/render/hud/messages.js";

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

describe("message queue", () => {
  it("shows one message at a time, FIFO, and expires on flightTime", () => {
    const queue = createMessageQueue(4);
    queue.enqueue("first");
    queue.enqueue("second");
    expect(queue.size).toBe(2);

    expect(queue.current(0)).toBe("first");
    expect(queue.current(MESSAGE_DURATION_SECONDS - 0.001)).toBe("first");
    expect(queue.current(MESSAGE_DURATION_SECONDS)).toBe("second");
    expect(queue.current(MESSAGE_DURATION_SECONDS * 2 - 0.001)).toBe("second");
    expect(queue.current(MESSAGE_DURATION_SECONDS * 2)).toBe("");
    expect(queue.size).toBe(0);
  });

  it("caps at four and drops the oldest message", () => {
    const queue = createMessageQueue(4);
    for (const text of ["a", "b", "c", "d", "e"]) queue.enqueue(text);

    expect(queue.size).toBe(4);
    // "a" was dropped when "e" arrived.
    expect(queue.current(0)).toBe("b");
  });

  it("freezes expiry when flightTime does not advance (pause)", () => {
    const queue = createMessageQueue();
    queue.enqueue("hint");

    expect(queue.current(10)).toBe("hint");
    // A paused frame samples the same flightTime repeatedly.
    expect(queue.current(10)).toBe("hint");
    expect(queue.current(10 + MESSAGE_DURATION_SECONDS - 0.001)).toBe("hint");
  });

  it("ignores an empty message", () => {
    const queue = createMessageQueue();
    queue.enqueue("");
    expect(queue.size).toBe(0);
    expect(queue.current(0)).toBe("");
  });

  it("clear drops a non-empty queue and later enqueues still show", () => {
    const queue = createMessageQueue(4);
    queue.enqueue("pre-load");
    queue.enqueue("second");
    expect(queue.size).toBe(2);

    queue.clear();

    expect(queue.size).toBe(0);
    expect(queue.current(0)).toBe("");
    queue.enqueue("after");
    expect(queue.size).toBe(1);
    expect(queue.current(0)).toBe("after");
  });
});
