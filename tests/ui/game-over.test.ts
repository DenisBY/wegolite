// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The game-over overlay shell and line model (D-02, D-03, D-05, D-06, D-07,
 * D-12). The Vitest unit project runs in Node with no DOM, so the shell takes
 * its key target, its reload function and its root by injection and these
 * tests use `EventTarget` doubles.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  GAME_OVER_PRESS_SPACE,
  GAME_OVER_TITLE,
  createGameOverOverlay,
  type GameOverLines,
} from "../../src/ui/game-over";

const LINE_NAMES = ["title", "cause", "score", "prompt"] as const;

/** A text-bearing element double. */
class LineDouble {
  textContent = "";
}

/** A root double: an EventTarget with the surface the shell touches. */
class RootDouble extends EventTarget {
  hidden = true;
  readonly style = { filter: "" };
  focusCalls: unknown[] = [];
  readonly lines = new Map<string, LineDouble>();

  constructor(names: readonly string[] = LINE_NAMES) {
    super();
    for (const name of names) this.lines.set(name, new LineDouble());
  }

  focus(options?: unknown): void {
    this.focusCalls.push(options);
  }

  querySelector(selector: string): LineDouble | null {
    const match = /^\[data-game-over-line="(\w+)"\]$/.exec(selector);
    if (match === null) return null;
    return this.lines.get(match[1] ?? "") ?? null;
  }
}

function keyEvent(code: string, repeat: boolean): Event {
  return Object.assign(new Event("keydown", { cancelable: true }), {
    code,
    repeat,
  });
}

const LINES: GameOverLines = {
  title: "Game Over",
  cause: "Destroyed by Krait",
  score: "Score: Harmless   (0), 100.0 ₢",
  prompt: "Press Space",
};

interface Fixture {
  readonly root: RootDouble;
  readonly keys: EventTarget;
  readonly reloads: { count: number };
  readonly overlay: ReturnType<typeof createGameOverOverlay>;
}

function fixture(): Fixture {
  const root = new RootDouble();
  const keys = new EventTarget();
  const reloads = { count: 0 };
  const overlay = createGameOverOverlay({
    root: root as unknown as HTMLElement,
    keyTarget: keys,
    reload: () => {
      reloads.count += 1;
    },
  });
  return { root, keys, reloads, overlay };
}

describe("the game-over overlay shell", () => {
  it("does nothing on Space or a click before show", () => {
    const { root, keys, reloads, overlay } = fixture();
    keys.dispatchEvent(keyEvent("Space", false));
    root.dispatchEvent(new Event("click"));
    expect(reloads.count).toBe(0);
    expect(overlay.isShown()).toBe(false);
    expect(root.hidden).toBe(true);
  });

  it("writes the four lines in order, unhides the root and focuses it", () => {
    const { root, overlay } = fixture();
    overlay.show(LINES);
    expect(LINE_NAMES.map((name) => root.lines.get(name)?.textContent)).toEqual(
      [LINES.title, LINES.cause, LINES.score, LINES.prompt],
    );
    expect(root.hidden).toBe(false);
    expect(root.focusCalls).toEqual([{ preventScroll: true }]);
    expect(overlay.isShown()).toBe(true);
  });

  it("ignores the auto-repeat of a Space held from before the overlay", () => {
    const { keys, reloads, overlay } = fixture();
    overlay.show(LINES);
    keys.dispatchEvent(keyEvent("Space", true));
    expect(reloads.count).toBe(0);
  });

  it("reloads once on a fresh Space press and prevents its default", () => {
    const { keys, root, reloads, overlay } = fixture();
    overlay.show(LINES);
    const press = keyEvent("Space", false);
    keys.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
    expect(reloads.count).toBe(1);
    keys.dispatchEvent(keyEvent("Space", false));
    root.dispatchEvent(new Event("click"));
    expect(reloads.count).toBe(1);
  });

  it("reloads once on a click on the overlay", () => {
    const { root, keys, reloads, overlay } = fixture();
    overlay.show(LINES);
    root.dispatchEvent(new Event("click"));
    expect(reloads.count).toBe(1);
    root.dispatchEvent(new Event("click"));
    keys.dispatchEvent(keyEvent("Space", false));
    expect(reloads.count).toBe(1);
  });

  it("does nothing for Escape, KeyP, F2 and KeyA", () => {
    const { keys, reloads, overlay } = fixture();
    overlay.show(LINES);
    for (const code of ["Escape", "KeyP", "F2", "KeyA"]) {
      const press = keyEvent(code, false);
      keys.dispatchEvent(press);
      expect(press.defaultPrevented).toBe(false);
    }
    expect(reloads.count).toBe(0);
  });

  it("show is idempotent: a second call does not rewrite the lines", () => {
    const { root, overlay } = fixture();
    overlay.show(LINES);
    overlay.show({ ...LINES, cause: "Destroyed" });
    expect(root.lines.get("cause")?.textContent).toBe(LINES.cause);
    expect(root.focusCalls).toHaveLength(1);
  });

  it("dispose removes the listeners and hides the root", () => {
    const { root, keys, reloads, overlay } = fixture();
    overlay.show(LINES);
    overlay.dispose();
    keys.dispatchEvent(keyEvent("Space", false));
    root.dispatchEvent(new Event("click"));
    expect(reloads.count).toBe(0);
    expect(root.hidden).toBe(true);
    expect(overlay.isShown()).toBe(false);
  });

  it("throws a message naming a missing line", () => {
    for (const missing of LINE_NAMES) {
      const names = LINE_NAMES.filter((name) => name !== missing);
      const root = new RootDouble(names);
      expect(() =>
        createGameOverOverlay({ root: root as unknown as HTMLElement }),
      ).toThrow(
        `Wegolite: the game-over overlay is missing its "${missing}" line.`,
      );
    }
  });

  it("setFilter writes and clears the root filter, shown or not", () => {
    const { root, overlay } = fixture();
    overlay.setFilter("saturate(0.5)");
    expect(root.style.filter).toBe("saturate(0.5)");
    overlay.show(LINES);
    overlay.setFilter("saturate(0.25)");
    expect(root.style.filter).toBe("saturate(0.25)");
    overlay.setFilter("");
    expect(root.style.filter).toBe("");
  });
});

describe("the game-over constants and markup", () => {
  it("carries Oolite's title and prompt", () => {
    expect(GAME_OVER_TITLE).toBe("Game Over");
    expect(GAME_OVER_PRESS_SPACE).toBe("Press Space");
  });

  const html = readFileSync(join(process.cwd(), "index.html"), "utf8");

  it("has the hidden #game-over overlay with its four line elements", () => {
    expect(html.includes('id="game-over"')).toBe(true);
    for (const name of LINE_NAMES) {
      expect(html.includes(`data-game-over-line="${name}"`)).toBe(true);
    }
  });

  it("hides the version and system lines for the dead view", () => {
    expect(html.includes("#hud[data-dead] ~ #overlay #title")).toBe(true);
    expect(html.includes("#hud[data-dead] ~ #overlay #status")).toBe(true);
  });
});
