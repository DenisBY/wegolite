// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The label record loader (ECON-07, D-05, D-21).
 *
 * `generated/labels.json` is a shipped static asset, so it is loaded as a
 * `?raw` string and `JSON.parse`d like `equipment.ts`. Unlike the equipment
 * catalogue the record is an object, not an entry array; it is validated with
 * the strict `LabelsSchema` because its templates become F7 screen text and the
 * view model must never expand a malformed record.
 *
 * `parseLabels` is exported so a Node test can exercise the same validation
 * against the committed bytes without `import.meta.glob`.
 */

import { LabelsSchema } from "./schemas/labels.js";
import type { Labels } from "./schemas/labels.js";

const LABELS_PATH = "./generated/labels.json";

const lazyLabels = import.meta.glob("./generated/labels.json", {
  query: "?raw",
  import: "default",
});

/** A missing or invalid generated label record. */
export class LabelsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LabelsError";
  }
}

/**
 * Validate an untrusted label record.
 *
 * @throws {LabelsError} naming the first failing path or a non-record input.
 */
export function parseLabels(value: unknown): Labels {
  const result = LabelsSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where =
      issue === undefined || issue.path.length === 0
        ? "record"
        : issue.path.join(".");
    throw new LabelsError(
      `Wegolite: the label record is invalid at ${where}: ${
        issue === undefined ? "unknown issue" : issue.message
      }.`,
    );
  }
  return result.data;
}

let cachedLabels: Promise<Labels> | undefined;

/** Load and validate the committed label record once. */
export function loadLabels(): Promise<Labels> {
  cachedLabels ??= (async () => {
    const load = lazyLabels[LABELS_PATH];
    if (load === undefined) {
      throw new LabelsError(
        `Wegolite: expected the label record at ${LABELS_PATH}, but it is missing.`,
      );
    }
    const parsed: unknown = JSON.parse(await load()) as unknown;
    return parseLabels(parsed);
  })();
  return cachedLabels;
}
