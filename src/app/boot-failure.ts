// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The single boot-failure surface (T-3-02, Pitfall 14, WORLD-05 groundwork).
 *
 * A missing or corrupt GLB must never leave a blank canvas over a live page. The
 * surface is one `#failure` element with `role="alert"`, plain text written with
 * `textContent`, the WebGL canvas and the HUD hidden, and the footer left
 * visible. Plan 08's WebGL2 fallback composes this surface rather than adding a
 * second root.
 *
 * The message is app-owned and short: a reason such as
 * `models/coriolis.glb` may be named, a stack trace or a host path may not.
 */

const FAILURE_ID = "failure";
const HIDDEN_ON_FAILURE = ["view", "hud"] as const;

function requireFailureElement(): HTMLElement {
  const element = document.getElementById(FAILURE_ID);
  if (!(element instanceof HTMLElement)) {
    throw new Error(
      'Wegolite: expected an element with id "failure" to report a boot failure, but it is missing.',
    );
  }
  return element;
}

/** Show a plain-text failure and hide the canvas and HUD. */
export function showBootFailure(reason: string): void {
  const failure = requireFailureElement();
  failure.setAttribute("role", "alert");
  failure.textContent = `Wegolite could not start: ${reason}`;
  failure.hidden = false;

  for (const id of HIDDEN_ON_FAILURE) {
    const element = document.getElementById(id);
    if (element !== null) element.hidden = true;
  }
}

/** Hide the failure and restore the canvas (used by the WebGL2 fallback path). */
export function hideBootFailure(): void {
  const failure = requireFailureElement();
  failure.hidden = true;
  failure.textContent = "";

  const view = document.getElementById("view");
  if (view !== null) view.hidden = false;
}

/** True when the failure surface is the visible one. */
export function isBootFailureVisible(): boolean {
  const failure = document.getElementById("failure");
  return failure instanceof HTMLElement && !failure.hidden;
}
