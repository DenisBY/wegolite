// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Per-file provenance for the vendored Oolite snapshot (DATA-09, D-01, D-03).
 *
 * The claim is strong and easy to fake: "every committed vendored byte has a
 * provenance row and a checksum". A walk that finds nothing would pass every
 * assertion below, so the vacuity guard runs first. A malformed row is treated
 * as missing rather than parsed leniently, because a lenient parser is how an
 * unprovenanced file slips through.
 *
 * Three sources must agree: the filesystem walk, the `ASSETS.md` table, and
 * `CHECKSUMS.sha256`. The checksum file excludes itself (it cannot hash its own
 * final bytes), so its own provenance is proven by its `ASSETS.md` row.
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const VENDORED_DIR = "third_party/oolite";
const CHECKSUMS_PATH = "third_party/oolite/CHECKSUMS.sha256";
const ASSETS_PATH = "ASSETS.md";

/** The eight-column contract pinned by tests/compliance.test.ts. */
const ASSETS_HEADER =
  "| Path | Kind | Origin | Source URL | Author / Copyright | Licence | Modifications | SHA-256 |";

interface AssetRow {
  readonly cells: readonly string[];
  readonly line: number;
}

/** Code-unit ordering: `localeCompare` is ICU-dependent and forbidden here. */
function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Every regular file under `directory`, recursively, in stable order. */
function collectFiles(directory: string, found: string[] = []): string[] {
  const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
    compareCodeUnits(a.name, b.name),
  );
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectFiles(path, found);
      continue;
    }
    if (!entry.isFile()) continue;
    found.push(path.split("\\").join("/"));
  }
  return found;
}

/**
 * Parse the `ASSETS.md` table strictly: eight cells after the leading and
 * trailing pipe, header and separator excluded. A row of any other shape is
 * not a row — it cannot be used to provenance a file.
 */
function parseAssetRows(): AssetRow[] {
  const rows: AssetRow[] = [];
  readFileSync(join(REPO_ROOT, ASSETS_PATH), "utf8")
    .split("\n")
    .forEach((line, index) => {
      if (!line.startsWith("|")) return;
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());
      if (cells.length !== 8) {
        // Fail closed: a malformed row silently dropped here would let an
        // asset ship with no provenance (CR-01 / WR-01, phase 02 review).
        throw new Error(
          `${ASSETS_PATH}:${String(index + 1)}: row has ${String(cells.length)} cells, expected 8`,
        );
      }
      const path = cells[0] ?? "";
      if (path === "Path" || /^-+$/.test(path)) return;
      rows.push({ cells, line: index + 1 });
    });
  return rows;
}

function readProse(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8").replace(
    /\s+/g,
    " ",
  );
}

function sha256Of(relativePath: string): string {
  return createHash("sha256")
    .update(readFileSync(join(REPO_ROOT, relativePath)))
    .digest("hex");
}

const FILES = collectFiles(VENDORED_DIR);
const ROWS = parseAssetRows();
const HASHES = new Map(FILES.map((file) => [file, sha256Of(file)]));

describe("vendored Oolite snapshot", () => {
  it("walks at least 60 vendored files (vacuity guard)", () => {
    // Vacuity guard: a broken walk must fail rather than pass on an empty list.
    expect(FILES.length).toBeGreaterThanOrEqual(60);
  });

  it("gives every vendored file exactly one ASSETS.md row", () => {
    expect(FILES.length).toBeGreaterThanOrEqual(60);

    const problems = FILES.flatMap((file) => {
      const matches = ROWS.filter((row) => row.cells[0] === file);
      return matches.length === 1
        ? []
        : [`${file}: ${String(matches.length)} ASSETS.md rows`];
    });

    expect(problems).toEqual([]);
  });

  it("records the actual SHA-256 of every vendored file", () => {
    expect(FILES.length).toBeGreaterThanOrEqual(60);

    const problems = FILES.flatMap((file) => {
      const row = ROWS.find((candidate) => candidate.cells[0] === file);
      if (row === undefined) return [`${file}: no ASSETS.md row`];
      const actual = HASHES.get(file);
      return row.cells[7] === actual
        ? []
        : [
            `${file}: row has ${String(row.cells[7])}, actual ${String(actual)}`,
          ];
    });

    expect(problems).toEqual([]);
  });

  it("never names a third_party/ file that does not exist", () => {
    expect(FILES.length).toBeGreaterThanOrEqual(60);

    const known = new Set(FILES);
    const orphans = ROWS.map((row) => row.cells[0]).filter(
      (path): path is string =>
        typeof path === "string" &&
        path.startsWith("third_party/") &&
        !known.has(path),
    );

    expect(orphans).toEqual([]);
  });

  it("agrees with CHECKSUMS.sha256 on every file except the checksum file itself", () => {
    expect(FILES.length).toBeGreaterThanOrEqual(60);

    const entries = readFileSync(join(REPO_ROOT, CHECKSUMS_PATH), "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .map((line) => {
        const [hash, ...rest] = line.split(/\s+/);
        return { hash: hash ?? "", path: rest.join(" ") };
      });

    const walked = FILES.filter((file) => file !== CHECKSUMS_PATH).sort(
      compareCodeUnits,
    );
    const listed = entries.map((entry) => entry.path);

    // The set is equal, not a subset: a missing row and an extra row both fail.
    expect([...listed].sort(compareCodeUnits)).toEqual(walked);
    // And the file itself is canonical: its rows are in code-unit order.
    expect(listed).toEqual([...listed].sort(compareCodeUnits));

    const mismatched = entries.flatMap((entry) =>
      entry.hash === HASHES.get(entry.path)
        ? []
        : [
            `${entry.path}: ${entry.hash} in CHECKSUMS, ${String(HASHES.get(entry.path))} on disk`,
          ],
    );
    expect(mismatched).toEqual([]);
  });

  it("provenances CHECKSUMS.sha256 itself with an ASSETS.md row", () => {
    expect(FILES.length).toBeGreaterThanOrEqual(60);

    const rows = ROWS.filter((row) => row.cells[0] === CHECKSUMS_PATH);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.cells[7]).toBe(HASHES.get(CHECKSUMS_PATH));
  });

  it("keeps the eight-column header and the no-unaudited-asset sentence", () => {
    const assets = readProse(ASSETS_PATH);

    expect(assets).toContain(ASSETS_HEADER);
    expect(assets).toMatch(/No asset may be committed/);
  });

  it("vendors no .js file the SPDX walk would treat as source", () => {
    expect(FILES.length).toBeGreaterThanOrEqual(60);

    expect(FILES.filter((file) => file.endsWith(".js"))).toEqual([]);
  });
});

/**
 * CR-01 / WR-01 (phase 02 review): committed assets under `public/` are
 * redistributed artwork and must carry the same provenance as the vendored
 * inputs. Previously nothing walked this directory, so a bare path row passed
 * the gate. `.gitkeep` placeholders are not assets.
 */
const PUBLIC_FILES = collectFiles("public").filter(
  (file) => !file.split("/").pop()?.startsWith("."),
);

describe("committed public assets", () => {
  it("walks at least the 23 emitted assets (vacuity guard)", () => {
    expect(PUBLIC_FILES.length).toBeGreaterThanOrEqual(23);
  });

  it("gives every public file exactly one ASSETS.md row", () => {
    const problems = PUBLIC_FILES.flatMap((file) => {
      const matches = ROWS.filter((row) => row.cells[0] === file);
      return matches.length === 1
        ? []
        : [`${file}: ${String(matches.length)} ASSETS.md rows`];
    });

    expect(problems).toEqual([]);
  });

  it("records the actual SHA-256 of every public file", () => {
    const problems = PUBLIC_FILES.flatMap((file) => {
      const row = ROWS.find((candidate) => candidate.cells[0] === file);
      if (row === undefined) return [`${file}: no ASSETS.md row`];
      const actual = sha256Of(file);
      return row.cells[7] === actual
        ? []
        : [`${file}: row has ${String(row.cells[7])}, actual ${actual}`];
    });

    expect(problems).toEqual([]);
  });

  it("states a licence for every public file", () => {
    const problems = PUBLIC_FILES.flatMap((file) => {
      const row = ROWS.find((candidate) => candidate.cells[0] === file);
      return row === undefined || row.cells[5] === ""
        ? [`${file}: no licence cell`]
        : [];
    });

    expect(problems).toEqual([]);
  });
});
