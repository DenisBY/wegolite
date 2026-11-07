// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The WebGL context-loss recovery policy (QUAL-05, D-15, D-16, research Pattern 3).
 *
 * A lost context pauses the session at once and never resumes by itself. The
 * browser may restore the context; the app then recreates render resources
 * while still paused, and the player resumes by action (D-15). If no restore
 * arrives within `CONTEXT_RESTORE_TIMEOUT_MS`, the failure surface is shown and
 * the save is left untouched (D-16).
 *
 * This module is a DOM-free state machine. The timer is injected, so the rules
 * are unit-testable without a browser, and `src/main.ts` owns every DOM event
 * and every effect on the session. Nothing here may import Three.js or touch
 * `src/sim`.
 */

/** D-16: a restore that does not arrive within this window fails the session. */
export const CONTEXT_RESTORE_TIMEOUT_MS = 10_000;

// Placeholder copy (D-16 open item). The owner's wording replaces these three
// constants in this one module and nowhere else.

/** Placeholder: pause-overlay notice while the context is lost. */
export const CONTEXT_LOST_NOTICE = "Graphics interrupted. Restoring...";
/** Placeholder: pause-overlay notice once the context is back. */
export const CONTEXT_RESTORED_NOTICE =
  "Graphics restored. Press P or Esc to resume.";
/** Placeholder: failure-surface copy when no restore arrives in time. */
export const CONTEXT_RESTORE_FAILURE_COPY =
  "The graphics context was lost and did not come back within 10 seconds. Reload the page to restart Wegolite. Your last save is unchanged.";

export type ContextRecoveryState = "live" | "lost" | "failed";

export interface ContextRecoveryOptions {
  readonly timeoutMs: number;
  /** Schedule `callback` after `ms`; returns an opaque handle. */
  readonly schedule: (callback: () => void, ms: number) => number;
  readonly cancel: (handle: number) => void;
  readonly onLost: () => void;
  readonly onRestored: () => void;
  readonly onTimeout: () => void;
}

export interface ContextRecovery {
  /** The browser reported a lost context. */
  lost(): void;
  /** The browser reported a restored context. */
  restored(): void;
  state(): ContextRecoveryState;
  losses(): number;
  restores(): number;
  /** Cancel any pending timer and ignore every later event. */
  dispose(): void;
}

export function createContextRecovery(
  options: ContextRecoveryOptions,
): ContextRecovery {
  let state: ContextRecoveryState = "live";
  let losses = 0;
  let restores = 0;
  let timer: number | undefined;
  let disposed = false;

  function clearTimer(): void {
    if (timer === undefined) return;
    options.cancel(timer);
    timer = undefined;
  }

  return {
    lost(): void {
      // A second loss while lost or failed starts no second timer.
      if (disposed || state !== "live") return;
      state = "lost";
      losses += 1;
      timer = options.schedule(() => {
        timer = undefined;
        if (disposed || state !== "lost") return;
        state = "failed";
        options.onTimeout();
      }, options.timeoutMs);
      options.onLost();
    },
    restored(): void {
      // A restore while live, or after the timeout, is ignored: the failure
      // surface has already taken over.
      if (disposed || state !== "lost") return;
      clearTimer();
      state = "live";
      restores += 1;
      options.onRestored();
    },
    state(): ContextRecoveryState {
      return state;
    },
    losses(): number {
      return losses;
    },
    restores(): number {
      return restores;
    },
    dispose(): void {
      disposed = true;
      clearTimer();
    },
  };
}
