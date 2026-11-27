// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Behaviour of the shared source-tree walker: probe skipping, vanished
 * directories and the non-vacuity of a missing scan root (todo
 * 2026-11-20-dist-check-purity-probe-race).
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  listFilesUnder,
  listSrcFiles,
  readdirIfPresent,
} from "./source-scan.js";

let root = "";

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "wegolite-source-scan-"));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Write empty files at the given paths below `base`, creating directories. */
function touch(base: string, paths: readonly string[]): void {
  for (const path of paths) {
    const full = join(base, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, "");
  }
}

/** The error a callback throws, or undefined when it does not throw. */
function thrown(action: () => unknown): { code?: string } | undefined {
  try {
    action();
  } catch (error) {
    return error as { code?: string };
  }
  return undefined;
}

describe("listFilesUnder", () => {
  it("should list every regular file recursively as sorted posix paths", () => {
    // Arrange
    const base = join(root, "list");
    touch(base, [
      "scan/b.ts",
      "scan/a.json",
      "scan/Z.ts",
      "scan/sub/c.png",
      "scan/sub/deeper/d.ts",
    ]);

    // Act
    const files = listFilesUnder("scan", base);

    // Assert
    expect(files).toEqual([
      "scan/Z.ts",
      "scan/a.json",
      "scan/b.ts",
      "scan/sub/c.png",
      "scan/sub/deeper/d.ts",
    ]);
  });

  it("should skip probe files and probe directories at any depth and nothing else", () => {
    // Arrange
    const base = join(root, "probes");
    touch(base, [
      "scan/__purity_probe.ts",
      "scan/sub/__purity_ban_x.ts",
      "scan/__purity_dir/real.ts",
      "scan/sub/__purity_deep/inner/x.ts",
      "scan/not__purity_x.ts",
      "scan/_purity_x.ts",
      "scan/keep.ts",
    ]);

    // Act
    const files = listFilesUnder("scan", base);

    // Assert
    expect(files).toEqual([
      "scan/_purity_x.ts",
      "scan/keep.ts",
      "scan/not__purity_x.ts",
    ]);
  });

  it("should throw ENOENT for a scan root that does not exist", () => {
    // Arrange
    const base = join(root, "missing-root");
    mkdirSync(base, { recursive: true });

    // Act
    const error = thrown(() => listFilesUnder("srcc", base));

    // Assert
    expect(error?.code).toBe("ENOENT");
  });
});

describe("readdirIfPresent", () => {
  it("should return the entries of an existing directory", () => {
    // Arrange
    const dir = join(root, "present");
    touch(dir, ["one.ts", "two.ts"]);

    // Act
    const names = readdirIfPresent(dir)
      .map((entry) => entry.name)
      .sort();

    // Assert
    expect(names).toEqual(["one.ts", "two.ts"]);
  });

  it("should return an empty array for a directory that was removed", () => {
    // Arrange
    const dir = join(root, "vanished");
    mkdirSync(dir, { recursive: true });
    rmSync(dir, { recursive: true });

    // Act
    const entries = readdirIfPresent(dir);

    // Assert
    expect(entries).toEqual([]);
  });

  it("should throw ENOTDIR for a path that is a regular file", () => {
    // Arrange
    const dir = join(root, "a-file");
    touch(dir, ["plain.ts"]);

    // Act
    const error = thrown(() => readdirIfPresent(join(dir, "plain.ts")));

    // Assert
    expect(error?.code).toBe("ENOTDIR");
  });
});

describe("listSrcFiles", () => {
  it("should list the committed src tree as sorted repo-relative .ts paths", () => {
    // Act
    const files = listSrcFiles();

    // Assert
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain("src/sim/ai/time.ts");
    expect(files).toContain("src/ui/game-over.ts");
    expect(files.every((path) => path.startsWith("src/"))).toBe(true);
    expect(files.every((path) => path.endsWith(".ts"))).toBe(true);
    expect(
      files.some((path) =>
        path.split("/").some((segment) => segment.startsWith("__purity_")),
      ),
    ).toBe(false);
    const sorted = [...files].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(files).toEqual(sorted);
  });
});
