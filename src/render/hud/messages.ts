// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The HUD message rows (FLGT-05, D-11; Oolite's message area since quick task
 * 261117-pij).
 *
 * The simulation emits events; the app maps them to strings and posts them
 * here with their duration. The model is Oolite's message area:
 *
 * - `hud.plist` `message_gui` is 140 px high with 14 px rows, so it holds ten
 *   rows (`MESSAGE_ROWS`).
 * - `printLongText` (`GuiDisplayGen.m:736-766`) writes at `currentRow`, which
 *   starts at the last row (`GuiDisplayGen.m:214`), so every new message
 *   scrolls the area up one row (`scrollUp`, `GuiDisplayGen.m:863-880`) and
 *   takes the bottom row with its own duration (`rowFadeTime`). The top row
 *   falls off.
 * - `drawGUI` (`GuiDisplayGen.m:1327-1336`) counts each row's time down while
 *   it is drawn, blanks the row when the time runs out (rows are never moved
 *   to close the gap) and multiplies the row's alpha by the time left during
 *   its last second.
 * - `addMessage:forCount:forceDisplay:` (`Universe.m:6340-6355`) drops a
 *   message equal to the last shown one while less than 6 s have passed since
 *   it was shown (`MESSAGE_REPEAT_SECONDS`); `clearPreviousMessage`
 *   (`Universe.m:6235-6240`) forgets the last shown message, so the next
 *   message shows whatever it is.
 * - `displayCountdownMessage:forCount:` (`Universe.m:6258-6267`) writes the
 *   hyperspace countdown (`displayCountdown`): only when the text differs from
 *   the last shown message AND its own repeat time
 *   (`countdown_messageRepeatTime`, kept apart from the 6 s one) has passed;
 *   it then sets that repeat time to `count` seconds ahead and writes the text
 *   into the bottom row without scrolling (`printLineNoScroll`,
 *   `GuiDisplayGen.m:797-812`) with a row time of `count`. The player's
 *   countdown update calls it on every frame with a count of 1 s
 *   (`PlayerEntity.m:3443-3450`), so each new count replaces the bottom row and
 *   fades over its second: the row pulses. The last shown message is shared
 *   with `enqueue`, as Oolite shares `currentMessage`.
 *
 * Wegolite choices: a row's countdown starts at its first read (`advance`,
 * `rows` or `current`), as Oolite counts a row down only while `drawGUI` draws
 * it. Oolite draws the message area on every screen, docked ones included
 * (`Universe.m:4735-4736`, `4810-4827`), so the render driver advances the
 * queue on every frame, docked or not drawn (quick task 261117-u3m). The clock
 * passed in is the session's message clock: the flight time plus the wall time
 * spent docked (the flight time stands still while docked), never `Date` or
 * `performance` read here, so a paused game freezes the rows instead of
 * expiring them. The 6 s repeat window runs on the clock of the queue's latest
 * read. Oolite's word wrap of a long message into extra rows is not ported;
 * the HUD clamps a long line instead.
 */

/** One drawn message row: its text and its alpha (0 for a blank row). */
export interface MessageRow {
  readonly text: string;
  readonly alpha: number;
}

export interface MessageQueue {
  /**
   * Post `text` for `seconds` of message-clock time on the bottom row, scrolling the
   * other rows up one. Ignored for empty text or a non-finite or non-positive
   * duration, and dropped when `text` equals the last shown message within
   * `MESSAGE_REPEAT_SECONDS` of it (`Universe.m:6340-6355`).
   */
  enqueue(text: string, seconds: number): void;
  /**
   * Oolite's `displayCountdownMessage:forCount:` (`Universe.m:6258-6267`):
   * write `text` into the bottom row without scrolling the others
   * (`printLineNoScroll`, `GuiDisplayGen.m:797-812`), with a row time of
   * `seconds`, but only when `text` differs from the last shown message and
   * the countdown repeat time has passed; the write sets that repeat time
   * `seconds` ahead. Ignored for empty text or a non-finite or non-positive
   * duration.
   */
  displayCountdown(text: string, seconds: number): void;
  /**
   * Forget the last shown message (`Universe.m:6235-6240`), so the next post
   * shows even when it repeats it. Every hyperspace refusal calls this first,
   * as `witchJumpChecklist` does (`PlayerEntity.m:6552-6600`).
   */
  clearPrevious(): void;
  /**
   * Set the queue clock to `now` (the session's message clock), start the
   * countdown of every row not read yet and blank every row whose time has
   * run out.
   */
  advance(now: number): void;
  /**
   * Advance to `now` and return the bottom `count` rows, top to bottom.
   * A blank row is empty text with alpha 0; a live row's alpha is the time it
   * has left, capped at 1 (`GuiDisplayGen.m:1334-1336`).
   */
  rows(now: number, count: number): readonly MessageRow[];
  /**
   * Blank every row, forget the last shown message and reset both repeat
   * times (G-8). An in-session Load calls this at install time: a row keyed
   * to the replaced session's clock would otherwise outlive the restored
   * clock, and the first countdown write after the Load must show.
   */
  clear(): void;
  /**
   * Advance to `now` and return the text of the lowest live row, the
   * newest message still shown; `""` when every row is blank.
   */
  current(now: number): string;
  /** The number of live (non-blank) rows. */
  readonly size: number;
}

/** Oolite's message area rows: `hud.plist` `message_gui` height 140 over row height 14. */
export const MESSAGE_ROWS = 10;

/** Oolite's repeat window (`messageRepeatTime = universal_time + 6.0`, `Universe.m:6353`). */
export const MESSAGE_REPEAT_SECONDS = 6;

/**
 * Wegolite's duration, in simulated seconds, for a message Oolite does not
 * have (first-use hints, launch, arrival and dock-feedback copy). A message
 * with an Oolite counterpart is posted with Oolite's own duration.
 */
export const MESSAGE_DURATION_SECONDS = 4;

interface Slot {
  text: string;
  duration: number;
  /** Set at the first read after posting; null until then. */
  expiresAt: number | null;
}

function blankSlot(): Slot {
  return { text: "", duration: 0, expiresAt: null };
}

export function createMessageQueue(rows = MESSAGE_ROWS): MessageQueue {
  const count = Math.max(1, Math.floor(rows));
  const slots: Slot[] = Array.from({ length: count }, blankSlot);
  let lastShown: string | null = null;
  let repeatDeadline = -Infinity;
  /** Oolite's `countdown_messageRepeatTime`, apart from `repeatDeadline`. */
  let countdownRepeatDeadline = -Infinity;
  let clock = 0;

  function advance(now: number): void {
    if (!Number.isFinite(now)) return;
    clock = now;
    for (const slot of slots) {
      if (slot.text === "") continue;
      if (slot.expiresAt === null) {
        slot.expiresAt = now + slot.duration;
      } else if (now >= slot.expiresAt) {
        slot.text = "";
        slot.duration = 0;
        slot.expiresAt = null;
      }
    }
  }

  function alphaOf(slot: Slot): number {
    if (slot.text === "") return 0;
    const left =
      slot.expiresAt === null ? slot.duration : slot.expiresAt - clock;
    return Math.min(1, Math.max(0, left));
  }

  return {
    enqueue(text: string, seconds: number): void {
      if (text === "") return;
      if (!Number.isFinite(seconds) || seconds <= 0) return;
      if (text === lastShown && clock < repeatDeadline) return;
      slots.shift();
      slots.push({ text, duration: seconds, expiresAt: null });
      lastShown = text;
      repeatDeadline = clock + MESSAGE_REPEAT_SECONDS;
    },
    displayCountdown(text: string, seconds: number): void {
      if (text === "") return;
      if (!Number.isFinite(seconds) || seconds <= 0) return;
      if (text === lastShown || clock < countdownRepeatDeadline) return;
      lastShown = text;
      countdownRepeatDeadline = clock + seconds;
      // `printLineNoScroll` writes at `currentRow`, the bottom row.
      slots[slots.length - 1] = {
        text,
        duration: seconds,
        expiresAt: null,
      };
    },
    clearPrevious(): void {
      lastShown = null;
    },
    advance,
    rows(now: number, wanted: number): readonly MessageRow[] {
      advance(now);
      const n = Number.isFinite(wanted)
        ? Math.max(0, Math.min(slots.length, Math.floor(wanted)))
        : 0;
      return slots
        .slice(slots.length - n)
        .map((slot) => ({ text: slot.text, alpha: alphaOf(slot) }));
    },
    clear(): void {
      for (let i = 0; i < slots.length; i += 1) slots[i] = blankSlot();
      lastShown = null;
      repeatDeadline = -Infinity;
      countdownRepeatDeadline = -Infinity;
    },
    current(now: number): string {
      advance(now);
      for (let i = slots.length - 1; i >= 0; i -= 1) {
        const text = slots[i]?.text ?? "";
        if (text !== "") return text;
      }
      return "";
    },
    get size(): number {
      return slots.reduce((n, slot) => (slot.text === "" ? n : n + 1), 0);
    },
  };
}
