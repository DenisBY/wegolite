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

/** `descriptions.plist:1993` at the pin, `gameoverscreen-game-over`. */
export const GAME_OVER_TITLE = "Game Over";

/**
 * `descriptions.plist:1991` at the pin, `gameoverscreen-score-@`. The
 * character before the credit sign is U+00A0 (bytes `c2 a0` in Oolite's
 * file), written as an escape so it is visible in review.
 */
export const GAME_OVER_SCORE_TEMPLATE = "Score: %@, [credits_number] ₢";

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

/** Red-phase skeleton of the line model. */
export function resolveCulpritName(
  key: string | undefined,
  catalogue:
    readonly { readonly key: string; readonly name: string }[] | undefined,
  targetNames: ReadonlyMap<string, string> | undefined,
): string | undefined {
  void key;
  void catalogue;
  void targetNames;
  return undefined;
}

export function buildGameOverLines(
  cause: PlayerDeathCause,
  culpritName: string | undefined,
  creditsDecicredits: number,
  ratingLabel: string,
): GameOverLines {
  void cause;
  void culpritName;
  void creditsDecicredits;
  void ratingLabel;
  return { title: "", cause: "", score: "", prompt: "" };
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
