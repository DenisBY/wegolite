// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The committed label fixture for Node tests (ECON-07, D-05).
 *
 * Reads `src/content/generated/labels.json` with `readFileSync` rather than
 * importing the UI module: a Node test must exercise the same bytes the build
 * shipped and must not depend on Vite's `?raw` glob. `parseLabels` is the
 * production validator, so a fixture that drifted from the emitted shape fails
 * here first.
 */

import { readFileSync } from "node:fs";

import { parseLabels } from "../../src/content/labels.js";
import type { Labels } from "../../src/content/types.js";

/** Load and validate the committed label record. */
export function labelsFixture(): Labels {
  const raw = readFileSync(
    new URL("../../src/content/generated/labels.json", import.meta.url),
    "utf8",
  );
  return parseLabels(JSON.parse(raw) as unknown);
}
