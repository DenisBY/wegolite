// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * SHA-256 for the content pipeline's manifest rows (D-05, T-02-09).
 *
 * Toolchain only. `src/sim/hash.ts` keeps its in-repo FNV-1a untouched: the
 * simulation must never import a Node builtin.
 */

import { createHash } from "node:crypto";

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
