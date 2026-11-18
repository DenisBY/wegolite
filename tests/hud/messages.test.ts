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

describe("message rows: the hyperspace countdown row (quick task 261118-cyn)", () => {
  // Oolite's `displayCountdownMessage` (`Universe.m:6258-6267`) writes the
  // countdown into the bottom row without scrolling (`printLineNoScroll`,
  // `GuiDisplayGen.m:797-812`), only when the text changed and its own repeat
  // time has passed, with a row time of `count` (1 s from
  // `PlayerEntity.m:3443-3450`).
  it("replaces the bottom row without scrolling the rows above", () => {
    const queue = createMessageQueue();
    queue.enqueue("above", 30);
    queue.enqueue("A", 30);
    queue.rows(10, 2);
    queue.displayCountdown("W 15", 1);
    expect(queue.rows(10, 2)).toEqual([
      { text: "above", alpha: 1 },
      { text: "W 15", alpha: 1 },
    ]);
    expect(queue.size).toBe(2);
    expect(queue.current(10)).toBe("W 15");
  });

  it("writes only a changed text, and only once its 1 s repeat time has passed", () => {
    const queue = createMessageQueue();
    queue.rows(10, 1);
    queue.displayCountdown("W 15", 1);
    // The render driver reads the rows in the frame that writes them.
    queue.rows(10, 1);
    queue.rows(10.5, 1);
    queue.displayCountdown("W 14", 1);
    expect(queue.current(10.5)).toBe("W 15");
    queue.rows(10.99, 1);
    queue.displayCountdown("W 14", 1);
    expect(queue.current(10.99)).toBe("W 15");
    // The same text after 1 s equals the last shown one and is ignored.
    queue.rows(11, 1);
    queue.displayCountdown("W 15", 1);
    expect(queue.rows(11, 1)).toEqual([{ text: "", alpha: 0 }]);
    queue.displayCountdown("W 14", 1);
    expect(queue.rows(11, 1)).toEqual([{ text: "W 14", alpha: 1 }]);
  });

  it("gives the written row a 1 s row time, so it fades and blanks within the second (the pulse)", () => {
    const queue = createMessageQueue();
    queue.rows(20, 1);
    queue.displayCountdown("W 15", 1);
    expect(queue.rows(20, 1)).toEqual([{ text: "W 15", alpha: 1 }]);
    const half = queue.rows(20.5, 1)[0];
    expect(half?.text).toBe("W 15");
    expect(half?.alpha).toBeCloseTo(0.5, 9);
    expect(queue.rows(21, 1)).toEqual([{ text: "", alpha: 0 }]);
  });

  it("lets a message posted during the countdown scroll it up, and overwrites that message at the next count", () => {
    const queue = createMessageQueue();
    queue.rows(30, 2);
    queue.displayCountdown("W 15", 1);
    queue.rows(30, 2);
    queue.rows(30.2, 2);
    queue.enqueue("Hyperspeed mass-locked.", 1.5);
    expect(queue.rows(30.2, 2).map((row) => row.text)).toEqual([
      "W 15",
      "Hyperspeed mass-locked.",
    ]);
    queue.rows(31, 2);
    queue.displayCountdown("W 14", 1);
    const rows = queue.rows(31, 2);
    // The scrolled countdown row blanked at 31; the J reply was overwritten.
    expect(rows).toEqual([
      { text: "", alpha: 0 },
      { text: "W 14", alpha: 1 },
    ]);
  });

  it("keeps the scrolled countdown row fading while the next count overwrites the bottom row", () => {
    const queue = createMessageQueue();
    queue.rows(30, 2);
    queue.displayCountdown("W 15", 1);
    queue.rows(30, 2);
    queue.rows(30.5, 2);
    queue.enqueue("Hyperspeed mass-locked.", 1.5);
    const between = queue.rows(30.6, 2);
    expect(between[0]?.text).toBe("W 15");
    expect(between[0]?.alpha).toBeCloseTo(0.4, 9);
    expect(between[1]).toEqual({ text: "Hyperspeed mass-locked.", alpha: 1 });
    // A changed text 1 s after the last write, at 31.
    queue.rows(31, 2);
    queue.displayCountdown("W 14", 1);
    expect(queue.rows(31, 2).map((row) => row.text)).toEqual(["", "W 14"]);
  });

  it("scrolls the last count up after a cancel, where it fades out within 1 s", () => {
    const queue = createMessageQueue();
    queue.rows(40, 2);
    queue.displayCountdown("W 9", 1);
    queue.rows(40, 2);
    queue.rows(40.3, 2);
    queue.clearPrevious();
    queue.enqueue("Hyperspace countdown cancelled", 3);
    const rows = queue.rows(40.3, 2);
    expect(rows[0]?.text).toBe("W 9");
    expect(rows[0]?.alpha).toBeCloseTo(0.7, 9);
    expect(rows[1]).toEqual({
      text: "Hyperspace countdown cancelled",
      alpha: 1,
    });
    expect(queue.rows(41, 2)[0]).toEqual({ text: "", alpha: 0 });
  });

  it("ignores empty text and a non-finite or non-positive duration", () => {
    const queue = createMessageQueue();
    queue.displayCountdown("", 1);
    queue.displayCountdown("W", 0);
    queue.displayCountdown("W", -1);
    queue.displayCountdown("W", Number.NaN);
    queue.displayCountdown("W", Number.POSITIVE_INFINITY);
    expect(queue.size).toBe(0);
  });

  it("clear also resets the countdown repeat time, so the first write after a Load shows", () => {
    const queue = createMessageQueue();
    queue.rows(50, 1);
    queue.displayCountdown("W 15", 1);
    queue.clear();
    queue.rows(0, 1);
    queue.displayCountdown("W 15", 1);
    expect(queue.current(0)).toBe("W 15");
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
