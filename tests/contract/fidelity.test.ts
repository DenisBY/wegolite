// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * QUAL-06 and D-22: FIDELITY.md maps each ported Oolite mechanic to its
 * Wegolite source and to the Oolite lines it follows, and quotes those lines.
 *
 * Two modes, one file:
 * - Always on (every unit run and `verify`): the document's own structure and
 *   the Wegolite side. Every row's Wegolite path exists and its line is inside
 *   the file; every Oolite citation has exactly one excerpt with the same path
 *   and range; every excerpt is at most 20 lines and its block is exactly its
 *   cited range; every Fidelity cell is `faithful` or a divergence that quotes
 *   a PROJECT.md Key Decisions row; the header commit equals
 *   `third_party/oolite/pin.json`; and ASSETS.md carries one GPL-2.0-or-later
 *   row for FIDELITY.md.
 * - Verbatim (only when `OOLITE_SRC` names a directory that holds the pinned
 *   tree, e.g. `git archive 7437f22 src` extracted there): every excerpt must
 *   equal the cited lines of that tree. Without `OOLITE_SRC` this case is
 *   reported as skipped, never as passed, because CI has no Oolite checkout.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const FIDELITY_PATH = "FIDELITY.md";
const ASSETS_PATH = "ASSETS.md";
const PIN_PATH = "third_party/oolite/pin.json";
const PROJECT_PATH = ".planning/PROJECT.md";
const OOLITE_SRC = process.env.OOLITE_SRC ?? "";

const MAX_EXCERPT_LINES = 20;
const MIN_ROWS = 3;
const MIN_EXCERPTS = 3;
const TABLE_HEADER = [
  "Mechanic",
  "Wegolite",
  "Oolite (7437f22)",
  "Fidelity",
  "Excerpt",
];
const ROW_HEADING = /^### (E-\d{2}) (src\/[^:]+):(\d+)-(\d+)$/;
const WEGOLITE_CELL = /^`(src\/[^`:]+):(\d+)`$/;
const OOLITE_CELL = /^`(src\/Core\/[^`:]+):(\d+)-(\d+)`$/;
const EXCERPT_CELL = /^E-\d{2}$/;

interface Row {
  readonly mechanic: string;
  readonly wegolite: string;
  readonly oolite: string;
  readonly fidelity: string;
  readonly excerpt: string;
}

interface Excerpt {
  readonly id: string;
  readonly path: string;
  readonly start: number;
  readonly end: number;
  readonly block: readonly string[];
}

function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

/** The cell values of a markdown table row, trimmed. */
function cellsOf(line: string): string[] {
  return line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

/** A cell with its Markdown code-span backticks removed. */
function bare(cell: string): string {
  return cell.replace(/^`/, "").replace(/`$/, "");
}

function trimEnd(line: string): string {
  return line.replace(/\s+$/, "");
}

function countLines(text: string): number {
  const lines = text.split("\n");
  return text.endsWith("\n") ? lines.length - 1 : lines.length;
}

/** The index of the first `## ` heading at or after `from`, or the end. */
function nextSection(lines: readonly string[], from: number): number {
  for (let index = from; index < lines.length; index += 1) {
    if ((lines[index] ?? "").startsWith("## ")) return index;
  }
  return lines.length;
}

/** The half-open line range of the `## <heading>` section body. */
function sectionBody(
  lines: readonly string[],
  heading: string,
): readonly [number, number] {
  const start = lines.indexOf(`## ${heading}`);
  if (start < 0) throw new Error(`FIDELITY.md has no "## ${heading}" section`);
  return [start + 1, nextSection(lines, start + 1)];
}

function parseRows(lines: readonly string[]): Row[] {
  const [from, to] = sectionBody(lines, "Mechanics");
  const rows: Row[] = [];
  let headerSeen = false;
  for (let index = from; index < to; index += 1) {
    const line = lines[index] ?? "";
    if (!line.startsWith("|")) continue;
    const cells = cellsOf(line);
    if (!headerSeen) {
      expect(cells).toEqual(TABLE_HEADER);
      headerSeen = true;
      continue;
    }
    if (cells.every((cell) => /^-+$/.test(cell))) continue;
    if (cells.length !== TABLE_HEADER.length) {
      throw new Error(
        `FIDELITY.md:${String(index + 1)} has ${String(cells.length)} cells, expected ${String(TABLE_HEADER.length)}`,
      );
    }
    const [mechanic, wegolite, oolite, fidelity, excerpt] = cells;
    rows.push({
      mechanic: mechanic ?? "",
      wegolite: wegolite ?? "",
      oolite: oolite ?? "",
      fidelity: fidelity ?? "",
      excerpt: excerpt ?? "",
    });
  }
  return rows;
}

function parseExcerpts(lines: readonly string[]): Excerpt[] {
  const [from, to] = sectionBody(lines, "Excerpts");
  const excerpts: Excerpt[] = [];
  for (let index = from; index < to; index += 1) {
    const line = lines[index] ?? "";
    if (!line.startsWith("### E-")) continue;
    const match = ROW_HEADING.exec(line);
    if (!match) {
      throw new Error(
        `FIDELITY.md:${String(index + 1)} is not a valid excerpt heading`,
      );
    }
    let fence = index + 1;
    while (fence < to && (lines[fence] ?? "") === "") fence += 1;
    if (lines[fence] !== "```objc") {
      throw new Error(`${match[1] ?? "excerpt"} has no objc fence after it`);
    }
    const block: string[] = [];
    let close = fence + 1;
    while (close < to && lines[close] !== "```") {
      block.push(lines[close] ?? "");
      close += 1;
    }
    if (close >= to) {
      throw new Error(`${match[1] ?? "excerpt"} has an unclosed fence`);
    }
    excerpts.push({
      id: match[1] ?? "",
      path: match[2] ?? "",
      start: Number(match[3]),
      end: Number(match[4]),
      block,
    });
    index = close;
  }
  return excerpts;
}

const lines = read(FIDELITY_PATH).split("\n");
const firstSection = nextSection(lines, 0);
const headerText = lines.slice(0, firstSection).join("\n");
const rows = parseRows(lines);
const excerpts = parseExcerpts(lines);
const pinnedCommit = (JSON.parse(read(PIN_PATH)) as { commit: string }).commit;
const projectText = read(PROJECT_PATH);

function excerptFor(id: string): Excerpt | undefined {
  const matches = excerpts.filter((excerpt) => excerpt.id === id);
  return matches.length === 1 ? matches[0] : undefined;
}

describe("FIDELITY.md contract (QUAL-06, D-22)", () => {
  it("is a real map, not a vacuous one", () => {
    expect(rows.length).toBeGreaterThanOrEqual(MIN_ROWS);
    expect(excerpts.length).toBeGreaterThanOrEqual(MIN_EXCERPTS);
  });

  it("names the Oolite commit that third_party/oolite/pin.json pins", () => {
    const match = /commit `([0-9a-f]{7,40})`/.exec(headerText);
    expect(match?.[1]).toBe(pinnedCommit);
  });

  it("points every row at a Wegolite line that exists in the file", () => {
    for (const row of rows) {
      const match = WEGOLITE_CELL.exec(row.wegolite);
      expect(
        match,
        `${row.mechanic}: Wegolite cell "${row.wegolite}"`,
      ).not.toBeNull();
      const path = match?.[1] ?? "";
      const line = Number(match?.[2]);
      expect(existsSync(join(REPO_ROOT, path)), path).toBe(true);
      const count = countLines(read(path));
      expect(
        line,
        `${path}:${String(line)} is past ${String(count)} lines`,
      ).toBeLessThanOrEqual(count);
      expect(line).toBeGreaterThanOrEqual(1);
    }
  });

  it("gives every Oolite citation exactly one excerpt with the same path and range", () => {
    for (const row of rows) {
      const match = OOLITE_CELL.exec(row.oolite);
      expect(
        match,
        `${row.mechanic}: Oolite cell "${row.oolite}"`,
      ).not.toBeNull();
      expect(EXCERPT_CELL.test(row.excerpt), row.excerpt).toBe(true);
      const excerpt = excerptFor(row.excerpt);
      expect(
        excerpt,
        `${row.excerpt} must have exactly one heading`,
      ).toBeDefined();
      expect(bare(row.oolite)).toBe(
        `${excerpt?.path ?? ""}:${String(excerpt?.start)}-${String(excerpt?.end)}`,
      );
    }
  });

  it("keeps every excerpt at most 20 lines and makes its block exactly its range", () => {
    for (const excerpt of excerpts) {
      const width = excerpt.end - excerpt.start + 1;
      expect(excerpt.start, excerpt.id).toBeGreaterThanOrEqual(1);
      expect(width, `${excerpt.id} range is inverted`).toBeGreaterThanOrEqual(
        1,
      );
      expect(excerpt.block.length, `${excerpt.id} block length`).toBe(width);
      expect(
        width,
        `${excerpt.id} exceeds ${String(MAX_EXCERPT_LINES)} lines`,
      ).toBeLessThanOrEqual(MAX_EXCERPT_LINES);
    }
  });

  it("states each row's fidelity as faithful or a divergence", () => {
    for (const row of rows) {
      const ok =
        row.fidelity === "faithful" || row.fidelity.startsWith("divergence:");
      expect(ok, `${row.mechanic}: "${row.fidelity}"`).toBe(true);
    }
  });

  it("names a PROJECT.md Key Decisions row for every divergence", () => {
    for (const row of rows) {
      if (!row.fidelity.startsWith("divergence:")) continue;
      const decision = /"([^"]+)"/.exec(row.fidelity)?.[1] ?? "";
      expect(decision, `${row.mechanic} quotes no decision`).not.toBe("");
      expect(
        projectText.includes(decision),
        `${row.mechanic}: "${decision}" is not in PROJECT.md`,
      ).toBe(true);
    }
  });

  it("records FIDELITY.md once in ASSETS.md under GPL-2.0-or-later", () => {
    const assetRows = read(ASSETS_PATH)
      .split("\n")
      .filter((line) => line.startsWith("|"))
      .map((line) => cellsOf(line))
      .filter((cells) => cells.length === 8);
    const matching = assetRows.filter((cells) => cells[0] === FIDELITY_PATH);
    expect(matching).toHaveLength(1);
    expect(matching[0]?.[5]).toBe("GPL-2.0-or-later");
  });

  it.skipIf(OOLITE_SRC === "")(
    "reproduces every excerpt verbatim at its cited lines of the pinned tree (OOLITE_SRC)",
    () => {
      for (const excerpt of excerpts) {
        const source = readFileSync(
          join(OOLITE_SRC, excerpt.path),
          "utf8",
        ).split("\n");
        expect(
          source.length,
          `${excerpt.path} is shorter than ${String(excerpt.end)} lines`,
        ).toBeGreaterThanOrEqual(excerpt.end);
        const cited = source.slice(excerpt.start - 1, excerpt.end).map(trimEnd);
        expect(
          cited,
          `${excerpt.id} ${excerpt.path}:${String(excerpt.start)}-${String(excerpt.end)}`,
        ).toEqual(excerpt.block.map(trimEnd));
      }
    },
  );
});
