// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The `check:dist` unit tests: both directions on fixture directories, the
 * three-member marker list, and the rule that no tracked file under `src/` or
 * `public/` (nor the committed `ships-npc.json`) contains a marker, so a
 * clean-tree failure shows up in `test` before any build.
 */

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listFilesUnder } from "../../tests/guards/source-scan.js";
import { checkDist, DIST_MARKERS, runCheckDist } from "./dist-check.js";
import { AI_HARNESS_SENTINEL } from "./host.js";

let root = "";

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "wegolite-dist-check-"));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Build a fixture directory from relative path -> content. */
function fixture(name: string, files: Record<string, string>): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  for (const [relative, content] of Object.entries(files)) {
    const path = join(dir, relative);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, content);
  }
  return dir;
}

describe("DIST_MARKERS", () => {
  it("has exactly the three markers only the harness and the AILib code contain", () => {
    expect([...DIST_MARKERS]).toEqual([
      AI_HARNESS_SENTINEL,
      "PriorityAIController",
      "oolite-libPriorityAI",
    ]);
    expect(DIST_MARKERS).toHaveLength(3);
  });

  it("holds no bare Oolite script file name", () => {
    for (const marker of DIST_MARKERS) {
      expect(marker).not.toMatch(/\.js$/);
      expect(marker).not.toMatch(/shuttleAI/);
    }
  });
});

describe("checkDist", () => {
  it("passes a clean tree, including shipped content that names a script file", () => {
    const dir = fixture("clean", {
      "index.html": "<html></html>",
      "assets/app.js": 'const aiType = "oolite-shuttleAI.js";',
      "assets/blob.bin": "binary-ish",
    });
    const result = checkDist(dir);
    expect(result.exitCode).toBe(0);
    expect(result.filesScanned).toBe(3);
    expect(result.findings).toEqual([]);
  });

  it.each(DIST_MARKERS.map((marker, index) => [index, marker] as const))(
    "fails (exit 1) when marker %i is in a .js file",
    (index, marker) => {
      const dir = fixture(`marker-${index}`, {
        "assets/clean.js": "export {};",
        "assets/chunk.js": `const x = "${marker}";`,
      });
      const result = checkDist(dir);
      expect(result.exitCode).toBe(1);
      expect(result.findings).toEqual([{ file: "assets/chunk.js", marker }]);
    },
  );

  it("finds a marker in a non-js shipped file", () => {
    const dir = fixture("html-marker", {
      "index.html": `<!-- ${DIST_MARKERS[1]} -->`,
    });
    expect(checkDist(dir).exitCode).toBe(1);
  });

  it("skips a marker that appears only in a source map", () => {
    const dir = fixture("map-only", {
      "assets/app.js": "export {};",
      "assets/app.js.map": `{"sourcesContent":["// ${DIST_MARKERS.join(" ")}"]}`,
    });
    const result = checkDist(dir);
    expect(result.exitCode).toBe(0);
    expect(result.filesScanned).toBe(1);
  });

  it("returns 2 for a missing directory", () => {
    const result = checkDist(join(root, "does-not-exist"));
    expect(result.exitCode).toBe(2);
    expect(result.filesScanned).toBe(0);
  });

  it("returns 2 for an empty directory and for one holding no file", () => {
    const empty = join(root, "empty");
    mkdirSync(empty);
    expect(checkDist(empty).exitCode).toBe(2);

    const nested = join(root, "only-dirs", "a", "b");
    mkdirSync(nested, { recursive: true });
    expect(checkDist(join(root, "only-dirs")).exitCode).toBe(2);
  });

  it("returns 2 for a directory that holds only source maps", () => {
    const dir = fixture("maps-only", { "assets/app.js.map": "{}" });
    expect(checkDist(dir).exitCode).toBe(2);
  });

  it("returns 2 when the path is a file, not a directory", () => {
    const dir = fixture("a-file", { "x.js": "export {};" });
    expect(checkDist(join(dir, "x.js")).exitCode).toBe(2);
  });
});

describe("runCheckDist", () => {
  it("returns the exit code of each outcome", () => {
    const quiet = { log: console.log, error: console.error };
    console.log = () => undefined;
    console.error = () => undefined;
    try {
      expect(runCheckDist(fixture("cli-clean", { "a.js": "export {};" }))).toBe(
        0,
      );
      expect(
        runCheckDist(fixture("cli-hit", { "a.js": DIST_MARKERS[2] ?? "" })),
      ).toBe(1);
      expect(runCheckDist(join(root, "cli-missing"))).toBe(2);
    } finally {
      console.log = quiet.log;
      console.error = quiet.error;
    }
  });
});

describe("the committed tree holds no marker", () => {
  it("has none in src/content/generated/ships-npc.json", () => {
    const text = readFileSync("src/content/generated/ships-npc.json", "utf8");
    for (const marker of DIST_MARKERS) {
      expect(text.includes(marker), marker).toBe(false);
    }
  });

  it("has none in any file under src/ or public/, comments included", () => {
    // The purity guards' `__purity_*` probes are skipped by the shared walker
    // (todo 2026-11-20-dist-check-purity-probe-race).
    const files = [...listFilesUnder("src"), ...listFilesUnder("public")];
    expect(files.length).toBeGreaterThan(100);
    const offenders: string[] = [];
    for (const file of files) {
      const bytes = readFileSync(file);
      for (const marker of DIST_MARKERS) {
        if (bytes.includes(marker)) {
          offenders.push(`${file}: ${marker}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
