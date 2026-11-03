// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Negative proofs for the drift gate (DATA-08, T-02-08).
 *
 * Every case runs on a throwaway copy: the real working tree is never mutated,
 * because Vitest runs test files in parallel. `checkAssets` is called directly
 * rather than through a spawned process, so the report shape is part of the
 * contract, not stdout text.
 */

import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { checkAssets } from "./cli.js";

const REPO_ROOT = process.cwd();
const GENERATED = "src/content/generated";
const COMMODITIES = `${GENERATED}/commodities.json`;
const MANIFEST = `${GENERATED}/manifest.json`;

async function withTempTree(
  body: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "wegolite-drift-"));
  try {
    await cp(
      join(REPO_ROOT, "third_party/oolite"),
      join(root, "third_party/oolite"),
      {
        recursive: true,
      },
    );
    await cp(join(REPO_ROOT, GENERATED), join(root, GENERATED), {
      recursive: true,
    });
    await body(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function entryFor(
  report: Awaited<ReturnType<typeof checkAssets>>,
  path: string,
): { readonly status: string } | undefined {
  const matches = report.filter((entry) => entry.path === path);
  // Exactly one label per file: a changed byte and a stale manifest hash for
  // the same path must not produce two lines.
  expect(matches.length).toBeLessThanOrEqual(1);
  return matches[0];
}

describe("drift gate", () => {
  it("reports no differences on an unmodified copy", async () => {
    await withTempTree(async (root) => {
      expect(await checkAssets(root)).toEqual([]);
    });
  });

  it("reports CHANGED bytes naming a file with one byte changed", async () => {
    await withTempTree(async (root) => {
      const file = join(root, COMMODITIES);
      const text = await readFile(file, "utf8");
      await writeFile(file, text.replace('"food"', '"foos"'), "utf8");

      const report = await checkAssets(root);
      expect(report.length).toBeGreaterThan(0);
      expect(entryFor(report, COMMODITIES)?.status).toBe("CHANGED bytes");
    });
  });

  it("reports MISSING naming a deleted emitted file", async () => {
    await withTempTree(async (root) => {
      await rm(join(root, COMMODITIES));

      const report = await checkAssets(root);
      expect(entryFor(report, COMMODITIES)?.status).toBe("MISSING");
    });
  });

  it("reports EXTRA naming an added file under the generated directory", async () => {
    await withTempTree(async (root) => {
      await writeFile(join(root, GENERATED, "extra.json"), "{}\n", "utf8");

      const report = await checkAssets(root);
      expect(entryFor(report, `${GENERATED}/extra.json`)?.status).toBe("EXTRA");
    });
  });

  it("reports CHANGED hash when the manifest digest no longer matches the file", async () => {
    await withTempTree(async (root) => {
      const manifestPath = join(root, MANIFEST);
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
        files: { path: string; sha256: string }[];
      };
      const row = manifest.files.find((file) => file.path === COMMODITIES);
      if (row === undefined) throw new Error("manifest has no commodities row");
      row.sha256 = "0".repeat(64);
      await writeFile(
        manifestPath,
        `${JSON.stringify(manifest, null, 2)}\n`,
        "utf8",
      );

      const report = await checkAssets(root);
      expect(entryFor(report, COMMODITIES)?.status).toBe("CHANGED hash");
    });
  });
});
