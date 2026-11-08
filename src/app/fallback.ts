// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The WebGL2 fallback (WORLD-05, T-3-19, T-3-20, Pitfall 14).
 *
 * This composes plan 01's single `#failure` surface rather than adding a second
 * root: the WebGL2 path, the content path and the GLB-load path all share one
 * `role="alert"` and one `textContent` write.
 *
 * The two calls are separate by design:
 *
 * - `showBootFailure` owns the DOM surface (hides the canvas and the HUD, keeps
 *   the footer visible);
 * - `publishFailure` owns the probe, so `window.__wegolite` reports
 *   `{ ready: false, webgl2: false, error }`.
 *
 * Calling only the first would leave `fallback.spec.ts`'s `ready === false`
 * assertion nothing to read; calling only the second would leave a blank
 * canvas. Both are required.
 */

import {
  hideBootFailure,
  isBootFailureVisible,
  showBootFailure,
} from "./boot-failure.js";
import { publishFailure } from "./probe.js";

/** Short, app-owned, plain text: no HTML, no stack, no host path. */
export const WEBGL2_FALLBACK_MESSAGE =
  "Wegolite needs WebGL2. Try a current Chrome or Firefox with hardware acceleration enabled.";

/** Show the visible WebGL2 explanation and publish the failure probe. */
export function showWebgl2Fallback(reason: string): void {
  showBootFailure(WEBGL2_FALLBACK_MESSAGE);
  publishFailure(reason);
}

/** Hide the fallback surface (delegates to plan 01's single root). */
export function hideFallback(): void {
  hideBootFailure();
}

/** True while the fallback surface is the visible one. */
export function isFallbackVisible(): boolean {
  return isBootFailureVisible();
}
