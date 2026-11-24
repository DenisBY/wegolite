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

import { formatDecicredits } from "../../src/sim/player/profile";
import {
  GAME_OVER_PRESS_SPACE,
  GAME_OVER_TITLE,
  buildGameOverLines,
  createGameOverOverlay,
  resolveCulpritName,
  type GameOverLines,
} from "../../src/ui/game-over";

const LINE_NAMES = ["title", "cause", "score", "prompt"] as const;

/** A text-bearing element double. */
class LineDouble {
  textContent = "";
}

/** The panel double: holds the line doubles and answers the line lookups. */
class PanelDouble {
  readonly lines = new Map<string, LineDouble>();

  constructor(names: readonly string[]) {
    for (const name of names) this.lines.set(name, new LineDouble());
  }

  querySelector(selector: string): LineDouble | null {
    const match = /^\[data-game-over-line="(\w+)"\]$/.exec(selector);
    if (match === null) return null;
    return this.lines.get(match[1] ?? "") ?? null;
  }
}

/**
 * A root double: an EventTarget with the surface the shell touches. The four
 * lines live in a panel inside it, as in the markup; the root itself answers
 * only the panel lookup, so a line outside the panel is not found.
 */
class RootDouble extends EventTarget {
  hidden = true;
  readonly style = { filter: "" };
  focusCalls: unknown[] = [];
  readonly panel: PanelDouble | null;

  constructor(names: readonly string[] = LINE_NAMES, withPanel = true) {
    super();
    this.panel = withPanel ? new PanelDouble(names) : null;
  }

  get lines(): Map<string, LineDouble> {
    return this.panel?.lines ?? new Map<string, LineDouble>();
  }

  focus(options?: unknown): void {
    this.focusCalls.push(options);
  }

  querySelector(selector: string): PanelDouble | null {
    return selector === "[data-game-over-panel]" ? this.panel : null;
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
        createGameOverOverlay({
          root: root as unknown as HTMLElement,
          keyTarget: new EventTarget(),
        }),
      ).toThrow(
        `Wegolite: the game-over overlay is missing its "${missing}" line.`,
      );
    }
  });

  it("throws a message naming a missing backing panel", () => {
    const root = new RootDouble(LINE_NAMES, false);
    expect(() =>
      createGameOverOverlay({
        root: root as unknown as HTMLElement,
        keyTarget: new EventTarget(),
      }),
    ).toThrow("Wegolite: the game-over overlay is missing its backing panel.");
  });

  it("looks the four lines up inside the panel, not the root", () => {
    const root = new RootDouble();
    const overlay = createGameOverOverlay({
      root: root as unknown as HTMLElement,
      keyTarget: new EventTarget(),
    });
    overlay.show(LINES);
    expect(root.panel?.lines.get("score")?.textContent).toBe(LINES.score);
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

  /** The `#game-over` element's markup, from its opening tag to `#pause`. */
  const overlayMarkup = html.slice(
    html.indexOf('id="game-over"'),
    html.indexOf('id="pause"'),
  );

  /** The CSS rule block that starts with `selector {`, braces excluded. */
  function ruleBlock(selector: string): string {
    const start = html.indexOf(`\n      ${selector} {`);
    expect(start, `${selector} rule`).toBeGreaterThanOrEqual(0);
    const open = html.indexOf("{", start);
    return html.slice(open + 1, html.indexOf("}", open));
  }

  it("holds the four lines in one backing panel inside #game-over", () => {
    const panel = overlayMarkup.indexOf("<div data-game-over-panel>");
    expect(panel, "the panel opens inside #game-over").toBeGreaterThan(0);
    expect(overlayMarkup.split("data-game-over-panel")).toHaveLength(2);
    const positions = LINE_NAMES.map((name) =>
      overlayMarkup.indexOf(`data-game-over-line="${name}"`),
    );
    expect(positions[0]).toBeGreaterThan(panel);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(overlayMarkup.lastIndexOf("</div>")).toBeGreaterThan(
      positions[3] ?? 0,
    );
  });

  it("draws the lines in Oolite's yellow on a dark translucent panel", () => {
    const root = ruleBlock("#game-over");
    expect(root).toContain("color: rgb(255, 255, 0);");
    expect(root).not.toContain("#33ff66");
    expect(root).toContain("background: transparent;");
    const panel = ruleBlock("#game-over [data-game-over-panel]");
    expect(panel).toContain("background: rgba(0, 0, 0, 0.6);");
    expect(panel).toContain("padding: 0.6em 1.4em;");
  });

  it("hides the version and system lines for the dead view", () => {
    expect(html.includes("#hud[data-dead] ~ #overlay #title")).toBe(true);
    expect(html.includes("#hud[data-dead] ~ #overlay #status")).toBe(true);
  });
});

describe("buildGameOverLines", () => {
  it("names a laser culprit and prints the new commander's score line", () => {
    const lines = buildGameOverLines(
      { damage: "laser" },
      "Krait",
      1000,
      "Harmless",
    );
    expect(lines.title).toBe(GAME_OVER_TITLE);
    expect(lines.cause).toBe("Destroyed by Krait");
    expect(lines.score).toBe("Score: Harmless   (0), 100.0\u00A0₢");
    expect(lines.prompt).toBe(GAME_OVER_PRESS_SPACE);
  });

  it("has U+00A0 before the credit sign, as Oolite's template does", () => {
    const { score } = buildGameOverLines(
      { damage: "laser" },
      "Krait",
      1000,
      "Harmless",
    );
    expect(score.endsWith("₢")).toBe(true);
    expect(score.codePointAt(score.length - 2)).toBe(0xa0);
  });

  it("names the static a ram hit", () => {
    expect(
      buildGameOverLines({ damage: "scrape" }, "Navigation Buoy", 0, "Harmless")
        .cause,
    ).toBe("Collided with Navigation Buoy");
    expect(
      buildGameOverLines(
        { damage: "scrape" },
        "Witchpoint Beacon",
        0,
        "Harmless",
      ).cause,
    ).toBe("Collided with Witchpoint Beacon");
  });

  it("uses the name-free wording when no name resolves", () => {
    expect(
      buildGameOverLines({ damage: "laser" }, undefined, 0, "Harmless").cause,
    ).toBe("Destroyed");
    expect(
      buildGameOverLines({ damage: "scrape" }, undefined, 0, "Harmless").cause,
    ).toBe("Destroyed in a collision");
    expect(
      buildGameOverLines({ damage: "laser" }, "", 0, "Harmless").cause,
    ).toBe("Destroyed");
  });

  it("writes a name verbatim, even one with replacement patterns", () => {
    expect(
      buildGameOverLines({ damage: "laser" }, "A$&B%@", 0, "Harmless").cause,
    ).toBe("Destroyed by A$&B%@");
  });

  it("groups the credits as formatDecicredits does, with one credit sign", () => {
    const { score } = buildGameOverLines(
      { damage: "laser" },
      "Krait",
      123456789,
      "Dangerous",
    );
    const grouped = formatDecicredits(123456789).replace(/ ₢$/, "");
    expect(score).toBe(`Score: Dangerous   (0), ${grouped}\u00A0₢`);
    expect(score.split("₢")).toHaveLength(2);
    expect(score).toContain("12\u00A0345\u00A0678.9");
  });
});

describe("resolveCulpritName", () => {
  it("returns the catalogue name, else the static name", () => {
    expect(
      resolveCulpritName("krait", [{ key: "krait", name: "Krait" }], undefined),
    ).toBe("Krait");
    expect(
      resolveCulpritName(
        "buoy",
        undefined,
        new Map([["buoy", "Navigation Buoy"]]),
      ),
    ).toBe("Navigation Buoy");
    expect(
      resolveCulpritName(
        "buoy",
        [{ key: "krait", name: "Krait" }],
        new Map([["buoy", "Navigation Buoy"]]),
      ),
    ).toBe("Navigation Buoy");
  });

  it("returns undefined, never the key, for an unknown or absent key", () => {
    expect(
      resolveCulpritName("ghost", [{ key: "krait", name: "Krait" }], new Map()),
    ).toBeUndefined();
    expect(resolveCulpritName(undefined, [], new Map())).toBeUndefined();
    expect(resolveCulpritName("ghost", undefined, undefined)).toBeUndefined();
  });
});
