// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * QUAL-06 README contract.
 *
 * The Controls tables are checked against the bindings the game itself uses:
 * every action with a default code must have exactly one row whose keys are
 * `labelFor(DEFAULT_BINDINGS, action)`, and the two Shift variants must show
 * `Shift+` plus the base action's code. A binding or label change that is not
 * mirrored in README.md fails this suite (research Pattern 9, T-07-28).
 *
 * The remaining cases pin the Play, release, browser-claim, fidelity,
 * performance, troubleshooting and licence sections, so each public claim has
 * a check that fails when the claim or its source drifts (T-07-27).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CONTEXT_RESTORE_TIMEOUT_MS } from "../../src/app/context-recovery.js";
import type { ActionId } from "../../src/input/actions.js";
import {
  ACTION_IDS,
  ACTION_LABELS,
  DEFAULT_BINDINGS,
  SHIFT_VARIANT_ACTIONS,
} from "../../src/input/actions.js";
import type { BindingMap } from "../../src/input/bindings.js";
import { codeLabel, labelFor } from "../../src/input/bindings.js";

const REPO_ROOT = process.cwd();

/** Vacuity guard: the controls check must compare at least this many rows. */
const MIN_CONTROL_ROWS = 30;

function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

function readVersion(): string {
  const manifest = JSON.parse(read("package.json")) as { version: string };
  return manifest.version;
}

/** The body of a `## ` section: from its heading to the next `## ` heading. */
function section(readme: string, heading: string): string {
  const lines = readme.split("\n");
  const start = lines.indexOf(`## ${heading}`);
  if (start < 0) throw new Error(`README has no "## ${heading}" heading`);
  const next = lines.findIndex(
    (line, index) => index > start && line.startsWith("## "),
  );
  return lines.slice(start + 1, next < 0 ? undefined : next).join("\n");
}

/** A table cell with one surrounding Markdown code span removed. */
function unquote(cell: string): string {
  const match = /^`(.*)`$/.exec(cell);
  return match?.[1] ?? cell;
}

interface ControlRow {
  readonly label: string;
  readonly keys: string;
}

/** Every data row of every table in a section; header and separator rows drop out. */
function controlRows(body: string): ControlRow[] {
  const rows: ControlRow[] = [];
  for (const line of body.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line
      .slice(1, line.lastIndexOf("|"))
      .split("|")
      .map((cell) => cell.trim());
    const label = cells[0];
    const keys = cells[1];
    if (label === undefined || keys === undefined) continue;
    if (label === "Action" || /^:?-+:?$/.test(label)) continue;
    rows.push({ label, keys: unquote(keys) });
  }
  return rows;
}

/** The label -> keys table the README Controls section must reproduce. */
function expectedControls(): Map<string, string> {
  // The game's boot map and this projection share one source, so the README
  // shows the defaults exactly as `labelFor` renders them. The cast only drops
  // `readonly` from the frozen defaults; labelFor never writes to its map.
  const defaults = DEFAULT_BINDINGS as BindingMap;
  const expected = new Map<string, string>();

  for (const action of ACTION_IDS) {
    if (DEFAULT_BINDINGS[action].length === 0) continue;
    expected.set(ACTION_LABELS[action], labelFor(defaults, action));
  }

  for (const [base, variant] of Object.entries(SHIFT_VARIANT_ACTIONS)) {
    if (variant === undefined) continue;
    const code = DEFAULT_BINDINGS[base as ActionId][0];
    if (code === undefined) {
      throw new Error(`Shift variant base ${base} has no default code`);
    }
    expected.set(ACTION_LABELS[variant], `Shift+${codeLabel(code)}`);
  }

  return expected;
}

describe("QUAL-06 Controls table is derived from the bindings", () => {
  const readme = read("README.md");
  const rows = controlRows(section(readme, "Controls"));
  const expected = expectedControls();

  it("has enough rows to be a meaningful check (vacuity guard)", () => {
    expect(expected.size).toBeGreaterThanOrEqual(MIN_CONTROL_ROWS);
    expect(rows.length).toBeGreaterThanOrEqual(MIN_CONTROL_ROWS);
  });

  it("keeps action labels unique so each row is unambiguous", () => {
    const labels = ACTION_IDS.map((action) => ACTION_LABELS[action]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("has exactly one row per action with a default code, and no stale row", () => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.label, (counts.get(row.label) ?? 0) + 1);
    }
    const duplicated = [...counts].filter(([, count]) => count > 1);
    expect(duplicated, "labels listed more than once").toEqual([]);

    const missing = [...expected.keys()].filter((label) => !counts.has(label));
    expect(missing, "actions with no README row").toEqual([]);

    const stale = [...counts.keys()].filter((label) => !expected.has(label));
    expect(stale, "README rows for no bound action").toEqual([]);
  });

  it("shows the exact keys labelFor returns for every row", () => {
    const keysByLabel = new Map(rows.map((row) => [row.label, row.keys]));
    const mismatches = [...expected]
      .filter(([label, keys]) => keysByLabel.get(label) !== keys)
      .map(
        ([label, keys]) =>
          `${label}: README "${keysByLabel.get(label) ?? "<missing>"}" ` +
          `!== game "${keys}"`,
      );
    expect(mismatches).toEqual([]);
  });

  it("documents Shift+C for the docking computer and the Shift+arrow chords", () => {
    const keysByLabel = new Map(rows.map((row) => [row.label, row.keys]));
    expect(keysByLabel.get(ACTION_LABELS.dockingComputer)).toBe("Shift+C");
    expect(keysByLabel.get(ACTION_LABELS.stationSellMax)).toBe(
      "Shift+Left arrow",
    );
    expect(keysByLabel.get(ACTION_LABELS.stationBuyMax)).toBe(
      "Shift+Right arrow",
    );
  });
});

describe("QUAL-06 README sections", () => {
  const readme = read("README.md");
  const headings = [
    "Play",
    "Supported browsers",
    "Controls",
    "Fidelity",
    "Performance",
    "Troubleshooting",
    "Licence and source",
  ];

  it.each(headings)("has the ## %s heading exactly once", (heading) => {
    const count = readme
      .split("\n")
      .filter((line) => line === `## ${heading}`).length;
    expect(count).toBe(1);
  });

  it("states the release title taken from package.json", () => {
    expect(readme).toContain(`Wegolite ${readVersion()}`);
  });

  it("names the Play commands and the two local URLs", () => {
    const body = section(readme, "Play");
    expect(body).toContain("docker compose up preview");
    expect(body).toContain("http://localhost:4173");
    expect(body).toContain("docker compose up app");
    expect(body).toContain("http://localhost:5173");
  });

  it("claims exactly current stable Chrome and Firefox with no version numbers", () => {
    const body = section(readme, "Supported browsers");
    expect(body).toContain("current stable Chrome");
    expect(body).toContain("current stable Firefox");
    expect(body).not.toMatch(/safari|webkit|macos/i);
    expect(body).not.toMatch(/(Chrome|Firefox)\s+\d/);
  });

  it("names the two browser check commands", () => {
    const body = section(readme, "Supported browsers");
    expect(body).toContain("docker compose run --rm verify");
    expect(body).toContain("docker compose run --rm e2e-cross");
  });

  it("states the WebGL2 requirement and the shipped recovery behaviour", () => {
    const body = section(readme, "Troubleshooting");
    expect(body).toContain("WebGL2");
    expect(body).toMatch(/pauses/);
    expect(body).toMatch(/P or Esc/);
    expect(body).toContain(`${CONTEXT_RESTORE_TIMEOUT_MS / 1000} seconds`);
    expect(body).toMatch(/last save is unchanged/i);
    expect(body).toMatch(/hidden/);
  });

  it("links FIDELITY.md and docs/PERFORMANCE.md, and both files exist", () => {
    expect(readme).toContain("](./FIDELITY.md)");
    expect(readme).toContain("](./docs/PERFORMANCE.md)");
    expect(existsSync(join(REPO_ROOT, "FIDELITY.md"))).toBe(true);
    expect(existsSync(join(REPO_ROOT, "docs", "PERFORMANCE.md"))).toBe(true);
  });

  it("states the frame budget numbers the performance document defines", () => {
    const body = section(readme, "Performance");
    expect(body).toContain("50 draw calls");
    expect(body).toContain("250 000 triangles");
    expect(body).toContain("9");
  });

  it("names the Firefox command and the source URL", () => {
    expect(readme).toContain("docker compose run --rm e2e-cross");
    expect(readme).toContain("https://github.com/DenisBY/wegolite");
  });

  it("names NOTICE, LICENSE and ASSETS.md and says the site links them", () => {
    const body = section(readme, "Licence and source");
    expect(body).toContain("NOTICE");
    expect(body).toContain("LICENSE");
    expect(body).toContain("ASSETS.md");
    expect(body).toMatch(/footer/);
    expect(body).toContain("https://github.com/DenisBY/wegolite");
  });
});
