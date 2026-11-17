// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Oolite's HUD message rows (FLGT-05, quick task 261117-pij).
 *
 * Expected values come from Oolite at the pin 7437f22: a new message scrolls
 * the area up one row and takes the bottom row (`GuiDisplayGen.m:751-766`),
 * each row counts its own duration down, blanks at zero and fades over its
 * last second (`GuiDisplayGen.m:1327-1336`), the area has ten rows
 * (`hud.plist` `message_gui` 140/14), and a repeat of the last shown message
 * within 6 s is dropped unless the last message was cleared
 * (`Universe.m:6235-6240`, `6340-6355`). The J refusal is 1.5 s
 * (`PlayerEntityControls.m:1172`).
 */

import { describe, expect, it } from "vitest";

import {
  MESSAGE_DURATION_SECONDS,
  MESSAGE_REPEAT_SECONDS,
  MESSAGE_ROWS,
  createMessageQueue,
} from "../../src/render/hud/messages.js";

const J_REPLY = "Hyperspeed mass-locked.";

describe("message rows: the J reply is not delayed by hints (tracer)", () => {
  it("shows the J reply at once on the bottom row after two hints", () => {
    const queue = createMessageQueue();
    queue.enqueue("hint one", MESSAGE_DURATION_SECONDS);
    queue.enqueue("hint two", MESSAGE_DURATION_SECONDS);
    queue.enqueue(J_REPLY, 1.5);

    const t0 = 100;
    expect(queue.rows(t0, 2)).toEqual([
      { text: "hint two", alpha: 1 },
      { text: J_REPLY, alpha: 1 },
    ]);
    expect(queue.current(t0)).toBe(J_REPLY);
  });

  it("fades the J reply over its last second and blanks it at 1.5 s", () => {
    const queue = createMessageQueue();
    queue.enqueue("hint one", MESSAGE_DURATION_SECONDS);
    queue.enqueue("hint two", MESSAGE_DURATION_SECONDS);
    queue.enqueue(J_REPLY, 1.5);
    const t0 = 100;
    queue.rows(t0, 2);

    expect(queue.rows(t0 + 0.5, 2)[1]).toEqual({ text: J_REPLY, alpha: 1 });
    const half = queue.rows(t0 + 1.0, 2)[1];
    expect(half?.text).toBe(J_REPLY);
    expect(half?.alpha).toBeCloseTo(0.5, 9);
    // Blank at 1.5 s; the slot stays in place (rows are never compacted).
    expect(queue.rows(t0 + 1.5, 2)).toEqual([
      { text: "hint two", alpha: 1 },
      { text: "", alpha: 0 },
    ]);
    expect(queue.current(t0 + 1.5)).toBe("hint two");
    expect(queue.size).toBe(2);
  });
});

describe("message rows: scrolling and size", () => {
  it("keeps ten rows and scrolls the oldest out on the eleventh message", () => {
    expect(MESSAGE_ROWS).toBe(10);
    const queue = createMessageQueue();
    for (let i = 1; i <= 11; i += 1) queue.enqueue(`m${String(i)}`, 30);

    expect(queue.size).toBe(10);
    const all = queue.rows(0, MESSAGE_ROWS);
    expect(all.map((row) => row.text)).toEqual([
      "m2",
      "m3",
      "m4",
      "m5",
      "m6",
      "m7",
      "m8",
      "m9",
      "m10",
      "m11",
    ]);
  });

  it("counts live rows only, and each row keeps its own duration", () => {
    const queue = createMessageQueue();
    queue.enqueue("long", 4);
    queue.enqueue("short", 1);
    queue.rows(0, 2);
    expect(queue.size).toBe(2);
    expect(queue.rows(1, 2)).toEqual([
      { text: "long", alpha: 1 },
      { text: "", alpha: 0 },
    ]);
    expect(queue.size).toBe(1);
    // The next message scrolls the blank slot up with the others.
    queue.enqueue("next", 4);
    expect(queue.rows(1, 3).map((row) => row.text)).toEqual([
      "long",
      "",
      "next",
    ]);
  });
});

describe("message rows: the 6 s repeat rule", () => {
  it("drops a repeat within 6 s and shows it at 6 s", () => {
    expect(MESSAGE_REPEAT_SECONDS).toBe(6);
    const queue = createMessageQueue();
    queue.rows(10, 2);
    queue.enqueue("again", 30);
    queue.rows(15.9, 2);
    queue.enqueue("again", 30);
    expect(queue.size).toBe(1);
    queue.rows(16, 2);
    queue.enqueue("again", 30);
    expect(queue.size).toBe(2);
  });

  it("shows a repeat at once after clearPrevious", () => {
    const queue = createMessageQueue();
    queue.rows(10, 2);
    queue.enqueue("refusal", 4.5);
    queue.enqueue("refusal", 4.5);
    expect(queue.size).toBe(1);
    queue.clearPrevious();
    queue.enqueue("refusal", 4.5);
    expect(queue.size).toBe(2);
  });

  it("compares with the last shown message only", () => {
    const queue = createMessageQueue();
    queue.enqueue("a", 4);
    queue.enqueue("b", 4);
    queue.enqueue("a", 4);
    expect(queue.rows(0, 3).map((row) => row.text)).toEqual(["a", "b", "a"]);
  });
});

describe("message rows: pause, bad input and clear", () => {
  it("expires nothing while the flight clock does not move (pause)", () => {
    const queue = createMessageQueue();
    queue.enqueue("hint", MESSAGE_DURATION_SECONDS);
    expect(queue.current(10)).toBe("hint");
    expect(queue.current(10)).toBe("hint");
    expect(queue.current(10 + MESSAGE_DURATION_SECONDS - 0.001)).toBe("hint");
    expect(queue.current(10 + MESSAGE_DURATION_SECONDS)).toBe("");
  });

  it("ignores empty text and a non-finite or non-positive duration", () => {
    const queue = createMessageQueue();
    queue.enqueue("", 4);
    queue.enqueue("x", 0);
    queue.enqueue("x", -1);
    queue.enqueue("x", Number.NaN);
    queue.enqueue("x", Number.POSITIVE_INFINITY);
    expect(queue.size).toBe(0);
    expect(queue.current(0)).toBe("");
  });

  it("clear blanks every row and forgets the last shown message", () => {
    const queue = createMessageQueue();
    queue.enqueue("pre-load", 4);
    queue.enqueue("second", 4);
    expect(queue.size).toBe(2);

    queue.clear();

    expect(queue.size).toBe(0);
    expect(queue.current(0)).toBe("");
    queue.enqueue("second", 4);
    expect(queue.size).toBe(1);
    expect(queue.current(0)).toBe("second");
  });
});
