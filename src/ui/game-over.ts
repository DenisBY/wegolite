// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The game-over view: Oolite's `showGameOver` lines plus the cause-of-death
 * line (D-02). The view ends only on player input, with no timer (D-06): a
 * fresh Space press or a click (D-07) reloads the page (D-12).
 *
 * Skeleton for the red phase: the real shell follows in the green commit.
 */

/** `descriptions.plist:1993` at the pin, `gameoverscreen-game-over`. */
export const GAME_OVER_TITLE = "Game Over";

/**
 * `descriptions.plist:1991` at the pin, `gameoverscreen-score-@`. The
 * character before the credit sign is U+00A0, as in Oolite's file.
 */
export const GAME_OVER_SCORE_TEMPLATE = "Score: %@, [credits_number] ₢";

/** `descriptions.plist:1992` at the pin, `gameoverscreen-press-space`. */
export const GAME_OVER_PRESS_SPACE = "Press Space";

export interface GameOverLines {
  readonly title: string;
  readonly cause: string;
  readonly score: string;
  readonly prompt: string;
}

export interface GameOverOverlayOptions {
  readonly root: HTMLElement;
  readonly keyTarget?: Pick<
    EventTarget,
    "addEventListener" | "removeEventListener"
  >;
  readonly reload?: () => void;
}

export interface GameOverOverlay {
  show(lines: GameOverLines): void;
  isShown(): boolean;
  setFilter(filter: string): void;
  dispose(): void;
}

export function createGameOverOverlay(
  options: GameOverOverlayOptions,
): GameOverOverlay {
  void options;
  return {
    show(): void {},
    isShown(): boolean {
      return false;
    },
    setFilter(): void {},
    dispose(): void {},
  };
}
