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
 * output is sorted first. Each plan wires its emitters beside `commodities`
 * without changing these rules.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

import { contentError } from "./content-error.js";
import { emitCommodities } from "./convert/commodities.js";
import { emitEquipment } from "./convert/equipment.js";
import { emitLabels } from "./convert/labels.js";
import { emitSystems } from "./convert/systems.js";
import { parseOpenStep } from "./openstep/parser.js";
import type { PlistValue } from "./openstep/plist-value.js";

export const SNAPSHOT_DIR = "third_party/oolite";
export const GENERATED_DIR = "src/content/generated";

const TRADE_GOODS_RELATIVE = "Config/trade-goods.plist";
const TRADE_GOODS_FILE = `${SNAPSHOT_DIR}/${TRADE_GOODS_RELATIVE}`;
const PLANETINFO_RELATIVE = "Config/planetinfo.plist";
const PLANETINFO_FILE = `${SNAPSHOT_DIR}/${PLANETINFO_RELATIVE}`;
const EQUIPMENT_RELATIVE = "Config/equipment.plist";
const EQUIPMENT_FILE = `${SNAPSHOT_DIR}/${EQUIPMENT_RELATIVE}`;
const DESCRIPTIONS_RELATIVE = "Config/descriptions.plist";
const DESCRIPTIONS_FILE = `${SNAPSHOT_DIR}/${DESCRIPTIONS_RELATIVE}`;

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

async function readConfig(
  inputRoot: string,
  relativePath: string,
  file: string,
): Promise<PlistValue> {
  return parseOpenStep(
    await readFile(resolveSnapshotFile(inputRoot, relativePath), "utf8"),
    file,
  );
}

/** Full generation run: writes every emitted file under `outRoot`. */
export async function generateContent({
  inputRoot,
  outRoot,
}: GenerateOptions): Promise<EmittedFile[]> {
  const [commodities, systems, equipment, descriptions] = await Promise.all([
    readConfig(inputRoot, TRADE_GOODS_RELATIVE, TRADE_GOODS_FILE),
    readConfig(inputRoot, PLANETINFO_RELATIVE, PLANETINFO_FILE),
    readConfig(inputRoot, EQUIPMENT_RELATIVE, EQUIPMENT_FILE),
    readConfig(inputRoot, DESCRIPTIONS_RELATIVE, DESCRIPTIONS_FILE),
  ]);

  const emitted: EmittedFile[] = [
    emitCommodities(commodities),
    ...emitSystems(systems),
    emitEquipment(equipment),
    emitLabels(descriptions),
  ];

  for (const file of emitted) {
    const target = resolveOutputFile(outRoot, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.bytes);
  }

  return emitted;
}
