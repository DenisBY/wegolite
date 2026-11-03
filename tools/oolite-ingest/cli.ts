// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `assets:build` and `assets:check` — the content pipeline's only entry points
 * (D-04, D-06, T-02-08).
 *
 * - no flags: regenerate every emitted file in place and write the manifest.
 * - `--check`: regenerate the whole output set into `mkdtemp(tmpdir())`, compare
 *   file set (missing **and** extra fail), bytes, and each manifest row's
 *   SHA-256 against the committed tree, print one line per failing file and
 *   exit 1. The temp directory is removed in `finally`.
 *
 * There is no `git` dependency, no override flag and no allowlist: the only
 * remedy for a diff is to regenerate, review, and commit — or fix the writer.
 * `checkAssets` is exported so `drift.test.ts` can prove every failure class
 * without spawning a process.
 */

import type { Dirent } from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { sha256Hex } from "./canonical/hash.js";
import {
  contentError,
  formatContentError,
  isContentError,
} from "./content-error.js";
import { EMITTED_MODELS_DIR } from "./convert/glb.js";
import { GENERATED_DIR, SNAPSHOT_DIR, generateContent } from "./generate.js";
import { MANIFEST_PATH, buildManifest, writeManifest } from "./manifest.js";
import type { OolitePin } from "./manifest.js";

export type CheckStatus =
  "MISSING" | "EXTRA" | "CHANGED bytes" | "CHANGED hash";

export interface CheckEntry {
  readonly path: string;
  readonly status: CheckStatus;
  readonly message: string;
}

export type CheckReport = CheckEntry[];

const USAGE = `Usage: tsx tools/oolite-ingest/cli.ts [--check | --help]

  (no flags)  regenerate src/content/generated/ and the manifest in place
  --check     regenerate into a temporary directory and report any drift
  --help      show this message`;

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function parsePin(text: string): OolitePin {
  const record = asRecord(JSON.parse(text) as unknown);
  const release = record?.release;
  const commit = record?.commit;
  const retrieved = record?.retrieved;
  if (
    typeof release !== "string" ||
    typeof commit !== "string" ||
    typeof retrieved !== "string"
  ) {
    throw contentError("SCHEMA", `${SNAPSHOT_DIR}/pin.json`, "oolite", {
      excerpt: "pin.json must carry string release, commit and retrieved",
    });
  }
  return { release, commit, retrieved };
}

async function readPin(root: string): Promise<OolitePin> {
  return parsePin(await readFile(join(root, SNAPSHOT_DIR, "pin.json"), "utf8"));
}

async function listFiles(
  root: string,
  relativeRoot: string,
): Promise<string[]> {
  const found: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    entries.sort((a, b) => compareCodeUnits(a.name, b.name));
    for (const entry of entries) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (entry.isFile()) {
        found.push(relative(root, full).split(sep).join("/"));
      }
    }
  };
  await walk(resolve(root, relativeRoot));
  return found.sort(compareCodeUnits);
}

interface ManifestRow {
  readonly path: string;
  readonly sha256: string;
}

function parseManifestRows(text: string): ManifestRow[] {
  const root = asRecord(JSON.parse(text) as unknown);
  const files = root?.files;
  if (!Array.isArray(files)) return [];
  const rows: ManifestRow[] = [];
  for (const item of files) {
    const record = asRecord(item);
    if (record === undefined) continue;
    if (typeof record.path === "string" && typeof record.sha256 === "string") {
      rows.push({ path: record.path, sha256: record.sha256 });
    }
  }
  return rows;
}

/**
 * Every directory the generator writes into. The drift gate compares all of
 * them: a GLB under `public/models` is an artefact like any generated JSON, and
 * a binary that drifts silently is exactly the failure the gate exists for.
 */
const EMITTED_ROOTS: readonly string[] = [GENERATED_DIR, EMITTED_MODELS_DIR];

async function compareTrees(
  root: string,
  tempRoot: string,
  expectedPaths: readonly string[],
): Promise<CheckReport> {
  const committed = new Set<string>();
  for (const scanned of EMITTED_ROOTS) {
    for (const path of await listFiles(root, scanned)) committed.add(path);
  }
  const regenerated = new Set<string>();
  for (const scanned of EMITTED_ROOTS) {
    for (const path of await listFiles(tempRoot, scanned))
      regenerated.add(path);
  }
  const expected = new Set(expectedPaths);
  const statuses = new Map<string, CheckStatus>();

  const label = (path: string, status: CheckStatus): void => {
    if (!statuses.has(path)) statuses.set(path, status);
  };

  for (const path of expected) {
    if (!committed.has(path)) label(path, "MISSING");
  }
  for (const path of committed) {
    if (!expected.has(path)) label(path, "EXTRA");
  }

  for (const path of expected) {
    if (!committed.has(path) || !regenerated.has(path)) continue;
    const [left, right] = await Promise.all([
      readFile(join(root, path)),
      readFile(join(tempRoot, path)),
    ]);
    if (!left.equals(right)) label(path, "CHANGED bytes");
  }

  let manifestText: string | undefined;
  try {
    manifestText = await readFile(join(root, MANIFEST_PATH), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    manifestText = undefined;
  }
  if (manifestText !== undefined) {
    for (const row of parseManifestRows(manifestText)) {
      if (!committed.has(row.path)) {
        label(row.path, "MISSING");
        continue;
      }
      const bytes = await readFile(join(root, row.path));
      if (sha256Hex(bytes) !== row.sha256) label(row.path, "CHANGED hash");
    }
  }

  return [...statuses.entries()]
    .sort(([left], [right]) => compareCodeUnits(left, right))
    .map(([path, status]) => ({
      path,
      status,
      message: `${status} ${path}`,
    }));
}

/**
 * Regenerate into a throwaway tree and compare it with `root`'s committed
 * output. The temporary tree never outlives the call.
 */
export async function checkAssets(root: string): Promise<CheckReport> {
  const tempRoot = await mkdtemp(join(tmpdir(), "wegolite-assets-"));
  try {
    const emitted = await generateContent({
      inputRoot: root,
      outRoot: tempRoot,
    });
    const manifest = buildManifest(emitted, await readPin(root));
    await writeManifest(tempRoot, manifest);
    const expected = [...emitted.map((file) => file.path), MANIFEST_PATH];
    return await compareTrees(root, tempRoot, expected);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function buildAssets(root: string): Promise<void> {
  const emitted = await generateContent({ inputRoot: root, outRoot: root });
  const manifest = buildManifest(emitted, await readPin(root));
  await writeManifest(root, manifest);
  console.log(
    `assets:build: wrote ${String(emitted.length + 1)} files under ${GENERATED_DIR}/ and ${EMITTED_MODELS_DIR}/`,
  );
}

export async function main(argv: readonly string[]): Promise<number> {
  const [first, ...rest] = argv;

  if (first === undefined) {
    await buildAssets(process.cwd());
    return 0;
  }

  if (first === "--check" && rest.length === 0) {
    const report = await checkAssets(process.cwd());
    if (report.length === 0) {
      console.log("assets:check: no differences");
      return 0;
    }
    for (const entry of report) console.error(entry.message);
    return 1;
  }

  if ((first === "--help" || first === "-h") && rest.length === 0) {
    console.log(USAGE);
    return 0;
  }

  console.error(`assets: unknown argument "${first}"; try --help`);
  return 2;
}

async function run(): Promise<void> {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    if (isContentError(error)) {
      console.error(formatContentError(error));
    } else {
      console.error(error instanceof Error ? error.message : String(error));
    }
    process.exitCode = 1;
  }
}

const entry = process.argv[1];
if (
  entry !== undefined &&
  import.meta.url === pathToFileURL(resolve(entry)).href
) {
  await run();
}
