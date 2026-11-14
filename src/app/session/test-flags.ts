// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The `?test=1` family of URL flags (Phase 8, D-09, D-10).
 *
 * The flags are parsed once, at start-up, into `ctx.runtime.testFlags`, and
 * never re-read from the URL afterwards (D-10). Every comparison is exact: only
 * `test=1` enables the hook, and `clock=manual` and `traffic=1` mean nothing
 * without it, so a crafted link cannot change a normal session.
 *
 * `traffic` is the effective setting rather than the raw flag. Without the hook
 * it is the bundle's build-time default (`trafficDefault`), which is true in
 * every deployed bundle and false in the browser-test bundles (vite.e2e.config.ts,
 * vite.seams.config.ts), so plain browser specs run with no NPC traffic
 * (WORLD-16, owner decision 1). With the hook it is exactly `traffic=1`. The URL
 * never overrides the build default without the hook.
 */

export interface TestFlags {
  /** Exactly `test=1`. */
  readonly hook: boolean;
  /** Exactly `test=1&clock=manual`: the frame loop never self-steps. */
  readonly manualClock: boolean;
  /** The effective traffic setting (see the module comment). */
  readonly traffic: boolean;
}

export function parseTestFlags(
  search: string,
  trafficDefault = true,
): TestFlags {
  const params = new URLSearchParams(search);
  const hook = params.get("test") === "1";
  return {
    hook,
    manualClock: hook && params.get("clock") === "manual",
    traffic: hook ? params.get("traffic") === "1" : trafficDefault,
  };
}
