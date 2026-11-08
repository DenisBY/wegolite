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

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

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
