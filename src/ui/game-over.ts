// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The game-over view: Oolite's `showGameOver` lines plus the cause-of-death
 * line (D-02). The view ends only on player input, with no timer (D-06): a
 * fresh Space press or a click (D-07) reloads the page (D-12).
 *
 * `pollGameOverControls` (`PlayerEntityControls.m:4016-4027` at the pin)
 * restarts on a Space press that was not already down, so the auto-repeat of a
 * key held from before the view is ignored here as well (`event.repeat`).
 */

import type { PlayerDeathCause } from "../sim/events";
import { formatDecicredits } from "../sim/player/profile";
import { formatRating } from "./station-model";

/** `descriptions.plist:1993` at the pin, `gameoverscreen-game-over`. */
export const GAME_OVER_TITLE = "Game Over";

/**
 * `descriptions.plist:1991` at the pin, `gameoverscreen-score-@`. The
 * character before the credit sign is U+00A0 (bytes `c2 a0` in Oolite's
 * file), written as an escape so it is visible in review.
 */
export const GAME_OVER_SCORE_TEMPLATE = "Score: %@, [credits_number]\u00A0₢";

/** `descriptions.plist:1992` at the pin, `gameoverscreen-press-space`. */
export const GAME_OVER_PRESS_SPACE = "Press Space";

/** The four lines of the view, in display order. */
export interface GameOverLines {
  readonly title: string;
  readonly cause: string;
  readonly score: string;
  readonly prompt: string;
}

export interface GameOverOverlayOptions {
  /** The `#game-over` element holding the four `data-game-over-line` lines. */
  readonly root: HTMLElement;
  /** Where the Space keydown is heard; the window by default. */
  readonly keyTarget?: Pick<
    EventTarget,
    "addEventListener" | "removeEventListener"
  >;
  /** Ends the view; reloads the page by default (D-12). */
  readonly reload?: () => void;
}

export interface GameOverOverlay {
  /** Write the lines, unhide and focus the root, and start listening. */
  show(lines: GameOverLines): void;
  isShown(): boolean;
  /**
   * Write the root's CSS filter, shown or not, so the render driver can fade
   * the text with the scene as Oolite's saturation fade covers the whole
   * frame (`gameOverFadeToBW`, `PlayerEntity.m:3566-3590` at the pin).
   */
  setFilter(filter: string): void;
  /** Remove the listeners and hide the root. */
  dispose(): void;
}

/**
 * The cause line templates (D-02, D-03). Wegolite text, the owner's divergence
 * from Oolite's screen; there is no Oolite source for them. `%@` stands for the
 * culprit's compiled display name.
 */
export const CAUSE_DESTROYED_BY_TEMPLATE = "Destroyed by %@";
export const CAUSE_COLLIDED_WITH_TEMPLATE = "Collided with %@";
/** The name-free wording of a laser death whose culprit has no name. */
export const CAUSE_DESTROYED = "Destroyed";
/** The name-free wording of a ram death whose culprit has no name. */
export const CAUSE_DESTROYED_IN_COLLISION = "Destroyed in a collision";

/**
 * The display name of a culprit key: the NPC catalogue's name, else the
 * compiled static name, else `undefined`. Never the key itself, so no spec key
 * or id can reach the screen (D-03).
 */
export function resolveCulpritName(
  key: string | undefined,
  catalogue:
    readonly { readonly key: string; readonly name: string }[] | undefined,
  targetNames: ReadonlyMap<string, string> | undefined,
): string | undefined {
  if (key === undefined) return undefined;
  return (
    catalogue?.find((record) => record.key === key)?.name ??
    targetNames?.get(key)
  );
}

/** Oolite's credits unit as `formatDecicredits` ends it: a space and the sign. */
const CREDIT_SUFFIX = " ₢";

function causeLine(
  cause: PlayerDeathCause,
  culpritName: string | undefined,
): string {
  const named = culpritName !== undefined && culpritName !== "";
  if (cause.damage === "laser") {
    return named
      ? CAUSE_DESTROYED_BY_TEMPLATE.replace("%@", () => culpritName)
      : CAUSE_DESTROYED;
  }
  return named
    ? CAUSE_COLLIDED_WITH_TEMPLATE.replace("%@", () => culpritName)
    : CAUSE_DESTROYED_IN_COLLISION;
}

/**
 * The four lines for a death. The score is Oolite's template with the rating
 * (`formatRating(rating, 0)`, the kill tally stays deferred, D-05) and the
 * credits number. `formatDecicredits` ends with U+0020 and the sign; both are
 * cut so the template supplies Oolite's U+00A0 and the sign, once.
 */
export function buildGameOverLines(
  cause: PlayerDeathCause,
  culpritName: string | undefined,
  creditsDecicredits: number,
  ratingLabel: string,
): GameOverLines {
  const credits = formatDecicredits(creditsDecicredits);
  if (!credits.endsWith(CREDIT_SUFFIX)) {
    throw new Error(
      "Wegolite: formatDecicredits no longer ends with its credit sign.",
    );
  }
  const number = credits.slice(0, credits.length - CREDIT_SUFFIX.length);
  const rating = formatRating(ratingLabel, 0);
  const score = GAME_OVER_SCORE_TEMPLATE.replace("%@", () => rating).replace(
    "[credits_number]",
    () => number,
  );
  return {
    title: GAME_OVER_TITLE,
    cause: causeLine(cause, culpritName),
    score,
    prompt: GAME_OVER_PRESS_SPACE,
  };
}

const LINE_KEYS = ["title", "cause", "score", "prompt"] as const;

function requireLine(root: HTMLElement, name: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(
    `[data-game-over-line="${name}"]`,
  );
  if (element === null) {
    throw new Error(
      `Wegolite: the game-over overlay is missing its "${name}" line.`,
    );
  }
  return element;
}

export function createGameOverOverlay(
  options: GameOverOverlayOptions,
): GameOverOverlay {
  const { root } = options;
  const elements = {
    title: requireLine(root, "title"),
    cause: requireLine(root, "cause"),
    score: requireLine(root, "score"),
    prompt: requireLine(root, "prompt"),
  };
  const keyTarget = options.keyTarget ?? window;
  const reload =
    options.reload ??
    ((): void => {
      window.location.reload();
    });
  let controller: AbortController | undefined;
  let shown = false;
  let triggered = false;

  /** The one guarded trigger: ends the view at most once. */
  function trigger(): void {
    if (triggered) return;
    triggered = true;
    reload();
  }

  function onKeyDown(event: Event): void {
    const key = event as KeyboardEvent;
    if (key.code !== "Space" || key.repeat) return;
    key.preventDefault();
    trigger();
  }

  return {
    show(lines: GameOverLines): void {
      if (shown) return;
      shown = true;
      for (const name of LINE_KEYS) {
        elements[name].textContent = lines[name];
      }
      root.hidden = false;
      root.focus({ preventScroll: true });
      controller = new AbortController();
      const { signal } = controller;
      keyTarget.addEventListener("keydown", onKeyDown, { signal });
      root.addEventListener("click", trigger, { signal });
    },
    isShown(): boolean {
      return shown;
    },
    setFilter(filter: string): void {
      root.style.filter = filter;
    },
    dispose(): void {
      controller?.abort();
      controller = undefined;
      shown = false;
      root.hidden = true;
    },
  };
}
