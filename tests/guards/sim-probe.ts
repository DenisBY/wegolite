// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Write a throwaway guard probe under `src/sim/`, lint it, and always remove it.
 *
 * Two parallel hazards shape this helper:
 *
 * - `tsconfig.sim.json` globs `src/sim/**`, so a probe written by one guard file
 *   can be globbed by another file's `tsc` run and then deleted mid-run
 *   (TS6053). The write therefore happens inside `withProbeLock`, held until the
 *   body settles.
 * - `tests/compliance.test.ts` and `tests/guards/sim-purity.test.ts` walk the
 *   repository in parallel and skip every entry whose name starts with
 *   `__purity_`. Every probe basename is normalised to that prefix, and the
 *   two-line SPDX header is prepended, so a walker that does see a probe
 *   mid-run neither reports a missing header nor scans it as source.
 *
 * Every file and directory the probe created is removed again, deepest first, so
 * nothing is left behind even when the body throws.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";

import { withProbeLock } from "./probe-lock.js";

const REPO_ROOT = process.cwd();
const PROBE_PREFIX = "__purity_";
const SPDX_HEADER =
  "// SPDX-License-Identifier: GPL-2.0-or-later\n// Copyright (c) 2026 Wegolite contributors\n";

/** `__ban_x.ts` and `__purity_ban_x.ts` both become `__purity_ban_x.ts`. */
function normalizeProbeName(relativePath: string): string {
  const directory = posix.dirname(relativePath.split("\\").join("/"));
  const name = posix.basename(relativePath.split("\\").join("/"));
  const stem = name.startsWith(PROBE_PREFIX)
    ? name.slice(PROBE_PREFIX.length)
    : name.replace(/^_+/, "");
  const normalized = `${PROBE_PREFIX}${stem}`;
  return directory === "." ? normalized : posix.join(directory, normalized);
}

/**
 * Run `body` against a probe at `src/sim/<relativePath>` (the basename is
 * normalised to start with `__purity_`). `body` receives the repo-relative path
 * of the written file, the form `lintProbe` expects.
 */
export function withSimProbe(
  relativePath: string,
  source: string,
  body: (file: string) => Promise<void>,
): Promise<void> {
  return withProbeLock(async () => {
    const normalized = normalizeProbeName(relativePath);
    const file = join("src", "sim", normalized);
    const absolute = join(REPO_ROOT, file);

    // Remember each directory this probe creates so cleanup removes only those.
    const created: string[] = [];
    const missing: string[] = [];
    for (
      let directory = dirname(absolute);
      directory !== join(REPO_ROOT, "src") && !existsSync(directory);
      directory = dirname(directory)
    ) {
      missing.push(directory);
    }
    for (const directory of missing.reverse()) {
      mkdirSync(directory);
      created.push(directory);
    }

    const text = source.startsWith(SPDX_HEADER) ? source : SPDX_HEADER + source;
    writeFileSync(absolute, text);
    try {
      await body(file);
    } finally {
      rmSync(absolute, { force: true });
      for (const directory of created.reverse()) {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  });
}
