// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * FOUND-06 pinned in one place: the licence, attribution, provenance and
 * trademark posture of the shipped repository.
 *
 * These assertions read the *source* `index.html`, never `dist/index.html`.
 * The `verify` chain runs `test` before `build`, so a `dist/` read would fail
 * spuriously on a clean tree. The built bundle is covered from the other side
 * by `tests/e2e/precision.spec.ts`, which loads the page through `vite preview`.
 *
 * The md5 below is a fixture checksum over a licence file — a drift detector,
 * not a security control. It is unrelated to the determinism harness, which is
 * FNV-1a in `src/sim/hash.ts` and never uses `node:crypto` (D-11).
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();

/** md5 of https://www.gnu.org/licenses/old-licenses/gpl-2.0.txt, byte for byte. */
const CANONICAL_GPL2_MD5 = "570a9b3749dd0463a1778803b12a6dce";

/** No product identity may carry a Frontier or Oolite mark. */
const TRADEMARK = /\b(elite|oolite)\b/i;

/** Directories that hold generated output or other repositories, never source. */
const SKIP_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  "test-results",
  "playwright-report",
  ".git",
  ".planning",
]);

const SOURCE_EXTENSIONS = [".ts", ".js", ".sh"];

function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

/**
 * Markdown is reflowed by `prettier --check .`, so sentence-level assertions
 * match against one long line rather than against the committed line breaks.
 */
function readProse(relativePath: string): string {
  return read(relativePath).replace(/\s+/g, " ");
}

/**
 * Collect every source file the repository owns, recursively.
 *
 * `__purity_*` probes are skipped: `tests/guards/sim-purity.test.ts` writes
 * them under `src/sim/` at test time and deletes them again, so they are not
 * source files and may legitimately lack a header mid-run.
 */
function collectSourceFiles(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      collectSourceFiles(join(directory, entry.name), found);
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name.startsWith("__purity_")) continue;
    if (!SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension)))
      continue;
    found.push(join(directory, entry.name));
  }
  return found;
}

describe("LICENSE", () => {
  it("is the canonical GNU GPL version 2 text, unmodified", () => {
    const digest = createHash("md5")
      .update(readFileSync(join(REPO_ROOT, "LICENSE")))
      .digest("hex");

    expect(digest).toBe(CANONICAL_GPL2_MD5);
  });
});

describe("NOTICE", () => {
  it("states the GPL-2.0-or-later election in words", () => {
    const notice = readProse("NOTICE");

    expect(notice).toContain("GPL-2.0-or-later");
    expect(notice).toContain(
      "version 2 of the License, or (at your option) any later version",
    );
  });

  it("attributes Oolite and records its licence", () => {
    const notice = readProse("NOTICE");

    expect(notice).toContain("Oolite");
    expect(notice).toContain(
      "Copyright © 2004-2026 Giles C Williams, Jens Ayton and contributors",
    );
    expect(notice).toContain("version 2, or any later version");
  });

  it("records the CC BY-NC-SA 3.0 option for Oolite art and configuration", () => {
    const notice = readProse("NOTICE");

    expect(notice).toContain("CC BY-NC-SA 3.0");
    expect(notice).toContain(
      "http://creativecommons.org/licenses/by-nc-sa/3.0/",
    );
    expect(notice).toMatch(/configuration files/);
    expect(notice).toMatch(/3D models, images and sounds/);
  });

  it("offers the corresponding source and carries the non-affiliation paragraph", () => {
    const notice = readProse("NOTICE");

    expect(notice).toContain("https://github.com/DenisBY/wegolite");
    expect(notice).toContain("unofficial fan project");
    expect(notice).toContain("trademarks of Frontier Developments plc");
    expect(notice).toContain("not legal advice");
  });
});

describe("ASSETS.md", () => {
  it("publishes the provenance column contract", () => {
    const assets = readProse("ASSETS.md");

    expect(assets).toContain(
      "| Path | Kind | Origin | Source URL | Author / Copyright | Licence | Modifications | SHA-256 |",
    );
    expect(assets).toMatch(/No asset may be committed/);
  });
});

describe("shipped shell", () => {
  it("renders the non-affiliation disclaimer in the page text", () => {
    // Prettier wraps this block-level sentence, and HTML collapses the newline,
    // so assert against whitespace-normalised text rather than raw bytes.
    const text = read("index.html").replace(/\s+/g, " ");

    expect(text).toContain("unofficial fan project");
    expect(text).toContain("trademarks of Frontier Developments plc");
  });

  it("keeps the product name free of Frontier and Oolite marks", () => {
    const manifest = JSON.parse(read("package.json")) as { name?: string };

    expect(manifest.name).toBe("wegolite");
    expect(manifest.name ?? "").not.toMatch(TRADEMARK);
  });

  it("keeps the document title free of Frontier and Oolite marks", () => {
    // The footer necessarily names Oolite; the title must not. Extracting the
    // element first is what makes a `<title>Oolite clone</title>` fail while the
    // disclaimer sentence passes.
    const titleMatch = /<title>([\s\S]*?)<\/title>/i.exec(read("index.html"));
    expect(titleMatch).not.toBeNull();

    expect(titleMatch?.[1] ?? "").not.toMatch(TRADEMARK);
  });
});

describe("licence headers", () => {
  it("puts the S-6 SPDX header on every source file", () => {
    const files = collectSourceFiles(REPO_ROOT);

    // Vacuity guard: a broken walk must fail rather than pass on an empty list.
    expect(files.length).toBeGreaterThanOrEqual(8);

    const missing = files.filter((file) => {
      const head = readFileSync(file, "utf8").split("\n", 3).join("\n");
      return !head.includes("SPDX-License-Identifier: GPL-2.0-or-later");
    });

    expect(missing).toEqual([]);
  });
});
