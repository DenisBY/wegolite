// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Serialise the guard probes that write into `src/sim/`.
 *
 * `tests/guards/sim-purity.test.ts` and `tests/guards/content-boundary.test.ts`
 * both drop a temporary `.ts` probe under `src/sim/` and run a real `tsc`
 * against `tsconfig.sim.json`. Vitest runs test files in parallel worker
 * threads, so one file's `tsc` can glob the other file's probe and then find it
 * deleted mid-run (`TS6053: File … not found`). The gates themselves are fine;
 * the probes must not overlap.
 *
 * The lock is a directory (`mkdir` is atomic across threads and processes) and
 * is released in `finally`. A lock older than `STALE_MS` is treated as a crashed
 * run and reclaimed, so a killed test cannot block the suite forever. Bodies may
 * be async (the guard probes now lint through the ESLint Node API); the lock is
 * held until their promise settles.
 */

import { mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const LOCK_PATH = join(process.cwd(), ".probe-lock");
const STALE_MS = 10 * 60 * 1_000;
const TIMEOUT_MS = 120_000;
const POLL_MS = 25;

const sleeper = new Int32Array(new SharedArrayBuffer(4));

/** A synchronous sleep that does not spin the CPU. */
function sleep(milliseconds: number): void {
  Atomics.wait(sleeper, 0, 0, milliseconds);
}

export async function withProbeLock<T>(body: () => Promise<T> | T): Promise<T> {
  const started = Date.now();
  for (;;) {
    try {
      mkdirSync(LOCK_PATH);
      break;
    } catch {
      try {
        if (Date.now() - statSync(LOCK_PATH).mtimeMs > STALE_MS) {
          rmSync(LOCK_PATH, { recursive: true, force: true });
        }
      } catch {
        // The lock vanished between the failed mkdir and the stat: retry.
      }
      if (Date.now() - started > TIMEOUT_MS) {
        throw new Error(
          "Wegolite: timed out waiting for the guard probe lock; a stale .probe-lock may be present.",
        );
      }
      sleep(POLL_MS);
    }
  }

  try {
    // `await` is essential: releasing the lock before an async body settles
    // would let a parallel guard file glob a probe mid-run again.
    return await body();
  } finally {
    rmSync(LOCK_PATH, { recursive: true, force: true });
  }
}
