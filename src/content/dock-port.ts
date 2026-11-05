// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The dock-port loader (DOCK-01, D-01, T-04-34).
 *
 * `generated/dock-port.json` is a shipped static asset, so it is loaded as a
 * `?raw` string and `JSON.parse`d exactly like the ship catalogue: a literal
 * JSON import would put the whole record in `tsc`'s inferred type for no
 * benefit. Unlike `ships.ts` the parsed value is validated with the same strict
 * schema the emitter used, because the loader is the trust boundary between a
 * build artefact and the numbers `src/sim/dock` will consume (plan 04-02).
 *
 * The promise is cached, and a missing or invalid file throws a named
 * `DockPortError` instead of returning a half-formed record — a silent fallback
 * would become a docking corridor built from `undefined`.
 */

import { DockPortSchema } from "./schemas/dock-port.js";
import type { DockPort } from "./schemas/dock-port.js";

const DOCK_PORT_PATH = "./generated/dock-port.json";

const lazyDockPort = import.meta.glob("./generated/dock-port.json", {
  query: "?raw",
  import: "default",
});

/** A missing or invalid generated dock-port record. */
export class DockPortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DockPortError";
  }
}

let cachedDockPort: Promise<DockPort> | undefined;

/** Load and validate the committed dock-port geometry once. */
export function loadDockPort(): Promise<DockPort> {
  cachedDockPort ??= (async () => {
    const load = lazyDockPort[DOCK_PORT_PATH];
    if (load === undefined) {
      throw new DockPortError(
        `Wegolite: expected the dock-port geometry at ${DOCK_PORT_PATH}, but it is missing.`,
      );
    }
    const parsed: unknown = JSON.parse(await load()) as unknown;
    const result = DockPortSchema.safeParse(parsed);
    if (!result.success) {
      const issue = result.error.issues[0];
      const where =
        issue === undefined || issue.path.length === 0
          ? "record"
          : issue.path.join(".");
      throw new DockPortError(
        `Wegolite: the dock-port geometry is invalid at ${where}: ${
          issue === undefined ? "unknown issue" : issue.message
        }.`,
      );
    }
    return result.data;
  })();
  return cachedDockPort;
}
