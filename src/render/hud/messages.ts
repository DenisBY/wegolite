// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The HUD message queue (FLGT-05, D-11).
 *
 * The simulation emits events; the app maps them to strings and enqueues them
 * here. One message is visible at a time, FIFO, capped at four, and expiry is
 * driven by the *simulation* clock passed into `advance`/`current` — never by
 * `Date` or `performance`. That is what makes a paused game freeze the message
 * instead of silently expiring it in wall time.
 */

export interface MessageQueue {
  enqueue(text: string): void;
  /** Drop every message whose expiry has passed at `flightTime`. */
  advance(flightTime: number): void;
  /** The one visible message at `flightTime`; `""` when the queue is empty. */
  current(flightTime: number): string;
  readonly size: number;
}

/** How long one message stays on the line, in simulated seconds. */
export const MESSAGE_DURATION_SECONDS = 4;

interface QueuedMessage {
  readonly text: string;
  /** Set on the first `advance`/`current`; null until then. */
  expiresAt: number | null;
}

export function createMessageQueue(cap = 4): MessageQueue {
  const limit = Math.max(1, Math.floor(cap));
  const queue: QueuedMessage[] = [];

  function advance(flightTime: number): void {
    if (!Number.isFinite(flightTime)) return;

    while (queue.length > 0) {
      const head = queue[0];
      if (head === undefined) return;
      if (head.expiresAt === null) {
        head.expiresAt = flightTime + MESSAGE_DURATION_SECONDS;
        return;
      }
      if (flightTime < head.expiresAt) return;
      queue.shift();
    }
  }

  return {
    enqueue(text: string): void {
      if (text === "") return;
      if (queue.length >= limit) queue.shift();
      queue.push({ text, expiresAt: null });
    },
    advance,
    current(flightTime: number): string {
      advance(flightTime);
      return queue[0]?.text ?? "";
    },
    get size(): number {
      return queue.length;
    },
  };
}
