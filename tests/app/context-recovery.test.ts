// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The WebGL context-recovery timer and idempotency rules (QUAL-05, D-16).
 *
 * The controller is driven by a fake scheduler, so every deadline is exact and
 * no browser timer runs. A lost context must time out once after 10 s; a restore
 * before the deadline must cancel it; a restore after the failure is ignored.
 */

import { describe, expect, it } from "vitest";

import {
  CONTEXT_RESTORE_TIMEOUT_MS,
  createContextRecovery,
} from "../../src/app/context-recovery.js";

interface PendingTimer {
  readonly handle: number;
  readonly at: number;
  readonly callback: () => void;
}

interface FakeClock {
  readonly schedule: (callback: () => void, ms: number) => number;
  readonly cancel: (handle: number) => void;
  readonly advance: (ms: number) => void;
  readonly scheduled: () => number;
  readonly pending: () => number;
}

function fakeClock(): FakeClock {
  let now = 0;
  let nextHandle = 1;
  let scheduled = 0;
  let pending: PendingTimer[] = [];

  return {
    schedule(callback, ms): number {
      const handle = nextHandle;
      nextHandle += 1;
      scheduled += 1;
      pending = [...pending, { handle, at: now + ms, callback }];
      return handle;
    },
    cancel(handle): void {
      pending = pending.filter((timer) => timer.handle !== handle);
    },
    advance(ms): void {
      const target = now + ms;
      for (;;) {
        const due = pending
          .filter((timer) => timer.at <= target)
          .sort((a, b) => a.at - b.at || a.handle - b.handle)[0];
        if (due === undefined) break;
        pending = pending.filter((timer) => timer !== due);
        now = due.at;
        due.callback();
      }
      now = target;
    },
    scheduled(): number {
      return scheduled;
    },
    pending(): number {
      return pending.length;
    },
  };
}

function harness() {
  const clock = fakeClock();
  const calls = { lost: 0, restored: 0, timeout: 0 };
  const recovery = createContextRecovery({
    timeoutMs: CONTEXT_RESTORE_TIMEOUT_MS,
    schedule: clock.schedule,
    cancel: clock.cancel,
    onLost: () => {
      calls.lost += 1;
    },
    onRestored: () => {
      calls.restored += 1;
    },
    onTimeout: () => {
      calls.timeout += 1;
    },
  });
  return { clock, calls, recovery };
}

describe("context recovery timer", () => {
  it("keeps waiting for the restore just before the 10 s deadline", () => {
    const { clock, calls, recovery } = harness();

    recovery.lost();
    clock.advance(9_999);

    expect(calls.timeout).toBe(0);
    expect(recovery.state()).toBe("lost");
  });

  it("fails exactly once at the 10 s deadline", () => {
    const { clock, calls, recovery } = harness();

    recovery.lost();
    clock.advance(10_000);
    clock.advance(60_000);

    expect(calls.timeout).toBe(1);
    expect(recovery.state()).toBe("failed");
  });

  it("cancels the deadline when the restore arrives in time", () => {
    const { clock, calls, recovery } = harness();

    recovery.lost();
    clock.advance(4_000);
    recovery.restored();
    expect(clock.pending()).toBe(0);
    clock.advance(20_000);

    expect(calls.timeout).toBe(0);
    expect(recovery.state()).toBe("live");
    expect(recovery.losses()).toBe(1);
    expect(recovery.restores()).toBe(1);
  });

  it("starts no second timer for a loss while already lost", () => {
    const { clock, calls, recovery } = harness();

    recovery.lost();
    recovery.lost();

    expect(clock.scheduled()).toBe(1);
    expect(calls.lost).toBe(1);
    expect(recovery.losses()).toBe(1);
  });

  it("ignores a restore while live", () => {
    const { calls, recovery } = harness();

    recovery.restored();

    expect(calls.restored).toBe(0);
    expect(recovery.restores()).toBe(0);
    expect(recovery.state()).toBe("live");
  });

  it("ignores a restore that arrives after the failure", () => {
    const { clock, calls, recovery } = harness();

    recovery.lost();
    clock.advance(CONTEXT_RESTORE_TIMEOUT_MS);
    recovery.restored();

    expect(calls.restored).toBe(0);
    expect(calls.timeout).toBe(1);
    expect(recovery.state()).toBe("failed");
    expect(recovery.restores()).toBe(0);
  });

  it("recovers the same way through a second full loss and restore", () => {
    const { clock, calls, recovery } = harness();

    recovery.lost();
    clock.advance(1_000);
    recovery.restored();
    recovery.lost();
    clock.advance(1_000);
    recovery.restored();

    expect(calls.lost).toBe(2);
    expect(calls.restored).toBe(2);
    expect(calls.timeout).toBe(0);
    expect(recovery.losses()).toBe(2);
    expect(recovery.restores()).toBe(2);
    expect(recovery.state()).toBe("live");
  });

  it("cancels a pending deadline on dispose and never times out", () => {
    const { clock, calls, recovery } = harness();

    recovery.lost();
    recovery.dispose();
    clock.advance(CONTEXT_RESTORE_TIMEOUT_MS * 2);

    expect(clock.pending()).toBe(0);
    expect(calls.timeout).toBe(0);
  });

  it("uses a 10 000 ms restore timeout", () => {
    expect(CONTEXT_RESTORE_TIMEOUT_MS).toBe(10_000);
  });
});
