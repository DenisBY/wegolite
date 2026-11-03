// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The content generator: vendored plist bytes in, canonical JSON bytes out
 * (D-04, D-05, T-02-10).
 *
 * Two path rules hold for every emitter that will ever be added here:
 *
 * - every input resolves under `<inputRoot>/third_party/oolite/`; anything that
 *   escapes that directory throws and names the attempted path;
 * - every output is written under `<outRoot>` at a caller-independent
 *   repository-relative path, and `--check` gives it a throwaway `mkdtemp`.
 *
 * A parsed value never chooses a path. Every directory listing that can affect
 * output is sorted first. This plan wires exactly one emitter (commodities);
 * later plans add theirs beside it without changing these rules.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

import { contentError } from "./content-error.js";
import { emitCommodities } from "./convert/commodities.js";
import { parseOpenStep } from "./openstep/parser.js";
import type { PlistValue } from "./openstep/plist-value.js";

export const SNAPSHOT_DIR = "third_party/oolite";
export const GENERATED_DIR = "src/content/generated";

const TRADE_GOODS_RELATIVE = "Config/trade-goods.plist";
const TRADE_GOODS_FILE = `${SNAPSHOT_DIR}/${TRADE_GOODS_RELATIVE}`;

export interface EmittedFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface GenerateOptions {
  readonly inputRoot: string;
  readonly outRoot: string;
}

/** Resolve a vendored input path, refusing anything outside the snapshot. */
export function resolveSnapshotFile(
  inputRoot: string,
  relativePath: string,
): string {
  const base = resolve(inputRoot, SNAPSHOT_DIR);
  const target = resolve(base, relativePath);
  if (target !== base && !target.startsWith(`${base}${sep}`)) {
    throw contentError(
      "SCHEMA",
      `${SNAPSHOT_DIR}/${relativePath}`,
      "input path",
      {
        excerpt: `input path escapes ${SNAPSHOT_DIR}`,
      },
    );
  }
  return target;
}

/** Resolve an output path, refusing anything outside the output root. */
function resolveOutputFile(outRoot: string, relativePath: string): string {
  const base = resolve(outRoot);
  const target = resolve(base, relativePath);
  if (target !== base && !target.startsWith(`${base}${sep}`)) {
    throw contentError("SCHEMA", relativePath, "output path", {
      excerpt: "output path escapes the output root",
    });
  }
  return target;
}

function parseTradeGoods(source: string): PlistValue {
  return parseOpenStep(source, TRADE_GOODS_FILE);
}

/** Full generation run: writes every emitted file under `outRoot`. */
export async function generateContent({
  inputRoot,
  outRoot,
}: GenerateOptions): Promise<EmittedFile[]> {
  const source = await readFile(
    resolveSnapshotFile(inputRoot, TRADE_GOODS_RELATIVE),
    "utf8",
  );
  const emitted: EmittedFile[] = [emitCommodities(parseTradeGoods(source))];

  for (const file of emitted) {
    const target = resolveOutputFile(outRoot, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.bytes);
  }

  return emitted;
}
