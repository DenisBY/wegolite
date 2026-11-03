// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The runtime content boundary (D-15, D-16, T-02-23).
 *
 * Only the manifest is validated at boot: every record was already validated
 * by the build-time schemas, so the app needs exactly one small assertion that
 * the content it loaded is the content it was built for. These tests pin the
 * failures that matter: a wrong schema version, an unknown format, and a file
 * row that lost its hash. Each must name the failing path and the expected
 * value rather than degrading into a blank page.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ContentBoundaryError, assertContentManifest } from "./index.js";

interface MutableManifest {
  format: string;
  schemaVersion: number;
  generator: string;
  oolite: { release: string; commit: string; retrieved: string };
  files: Array<{ path: string; bytes: number; sha256: string }>;
}

const COMMITTED = JSON.parse(
  readFileSync(new URL("./generated/manifest.json", import.meta.url), "utf8"),
) as MutableManifest;

function committedCopy(): MutableManifest {
  return JSON.parse(JSON.stringify(COMMITTED)) as MutableManifest;
}

/** Run a call that must throw and return its message for assertion. */
function messageOf(call: () => unknown): string {
  try {
    call();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("expected the call to throw, but it returned normally");
}

describe("assertContentManifest", () => {
  it("accepts the committed manifest and returns it typed", () => {
    const manifest = assertContentManifest(COMMITTED);

    expect(manifest.format).toBe("wegolite-content-manifest");
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.files.length).toBeGreaterThan(0);
    expect(manifest.oolite.commit).toBe("7437f22");
  });

  it("rejects a mismatched schemaVersion and names the field and expected value", () => {
    const manifest = committedCopy();
    manifest.schemaVersion = 2;

    expect(() => assertContentManifest(manifest)).toThrow(ContentBoundaryError);
    const message = messageOf(() => assertContentManifest(manifest));

    expect(message).toContain("schemaVersion");
    expect(message).toContain("expected 1");
    expect(message).not.toMatch(/^Wegolite content manifest is invalid\.$/);
  });

  it("rejects an unknown format and names the field", () => {
    const manifest = committedCopy();
    manifest.format = "other";

    const message = messageOf(() => assertContentManifest(manifest));

    expect(message).toContain("format");
    expect(message).toContain("wegolite-content-manifest");
  });

  it("rejects a file row without a sha256 and names the row path", () => {
    const manifest = committedCopy();
    const row = manifest.files[3];
    if (row === undefined)
      throw new Error("fixture manifest has no fourth row");
    delete (row as Partial<typeof row>).sha256;

    const message = messageOf(() => assertContentManifest(manifest));

    expect(message).toContain("files[3].sha256");
    expect(message).toContain("expected");
  });
});
