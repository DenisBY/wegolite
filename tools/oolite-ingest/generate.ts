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
 * output is sorted first.
 *
 * This plan's emitter is deliberately thin: it proves the frame
 * (plist → canonical JSON → manifest → drift gate) on the 17 commodities. The
 * full typed projection lives in `convert/commodities.ts` from plan task 3.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

import { canonicalJson } from "./canonical/json.js";
import type { PlistJson } from "./canonical/json.js";
import { contentError } from "./content-error.js";
import { getEntry, getString } from "./openstep/plist-value.js";
import type { PlistDict, PlistValue } from "./openstep/plist-value.js";
import { parseOpenStep } from "./openstep/parser.js";

export const SNAPSHOT_DIR = "third_party/oolite";
export const GENERATED_DIR = "src/content/generated";
export const COMMODITIES_PATH = `${GENERATED_DIR}/commodities.json`;

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

function requireInteger(
  dict: PlistDict,
  key: string,
  construct: string,
): number {
  const entry = getEntry(dict, key);
  if (entry === undefined) {
    throw contentError("SCHEMA", TRADE_GOODS_FILE, construct, {
      excerpt: `missing key "${key}"`,
    });
  }
  if (entry.value.kind !== "integer") {
    throw contentError("SCHEMA", TRADE_GOODS_FILE, construct, {
      line: entry.keyLine,
      column: entry.keyColumn,
      excerpt: `"${key}" must be a bare integer`,
    });
  }
  return entry.value.value;
}

function requireString(
  dict: PlistDict,
  key: string,
  construct: string,
): string {
  const value = getString(dict, key);
  if (value === undefined) {
    throw contentError("SCHEMA", TRADE_GOODS_FILE, construct, {
      excerpt: `"${key}" must be a quoted string`,
    });
  }
  return value;
}

interface TracerCommodity {
  readonly key: string;
  readonly name: string;
  readonly unit: number;
  readonly priceAverage: number;
  readonly sortOrder: number;
}

/** Thin tracer projection: enough to prove plist → JSON → manifest → gate. */
function compileTracerCommodities(parsed: PlistValue): TracerCommodity[] {
  if (parsed.kind !== "dict") {
    throw contentError("SCHEMA", TRADE_GOODS_FILE, "root", {
      excerpt: "trade-goods.plist must be a dictionary",
    });
  }
  if (parsed.entries.length === 0) {
    throw contentError("SCHEMA", TRADE_GOODS_FILE, "root", {
      excerpt: "trade-goods.plist parsed to zero commodities",
    });
  }

  const records = parsed.entries.map((entry) => {
    if (entry.value.kind !== "dict") {
      throw contentError(
        "SCHEMA",
        TRADE_GOODS_FILE,
        `commodities.${entry.key}`,
        {
          line: entry.keyLine,
          column: entry.keyColumn,
          excerpt: `"${entry.key}" must be a dictionary`,
        },
      );
    }
    const construct = `commodities.${entry.key}`;
    return {
      key: entry.key,
      name: requireString(entry.value, "name", `${construct}.name`),
      unit: requireInteger(
        entry.value,
        "quantity_unit",
        `${construct}.quantity_unit`,
      ),
      priceAverage: requireInteger(
        entry.value,
        "price_average",
        `${construct}.price_average`,
      ),
      sortOrder: requireInteger(
        entry.value,
        "sort_order",
        `${construct}.sort_order`,
      ),
    };
  });

  records.sort((a, b) => a.sortOrder - b.sortOrder);
  return records;
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
  const parsed = parseOpenStep(source, TRADE_GOODS_FILE);
  const commodities = compileTracerCommodities(parsed);

  const json: PlistJson = commodities.map((commodity) => ({
    key: commodity.key,
    name: commodity.name,
    unit: commodity.unit,
    priceAverage: commodity.priceAverage,
  }));
  const bytes = Buffer.from(canonicalJson(json), "utf8");

  const target = resolveOutputFile(outRoot, COMMODITIES_PATH);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);

  return [{ path: COMMODITIES_PATH, bytes }];
}
