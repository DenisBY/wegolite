// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // D-19: v8 coverage over the three source globs. Thresholds are set only
    // from the measured baseline (see the per-glob comments below).
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "test-results/coverage",
      include: [
        "src/sim/**/*.ts",
        "src/persistence/**/*.ts",
        "src/content/**/*.ts",
      ],
      exclude: [
        // D-20: IndexedDB is covered by the browser suite only; fake-indexeddb
        // is not added, so this file is excluded from unit coverage.
        "src/persistence/idb-store.ts",
        "src/content/generated/**",
        "**/*.test.ts",
        "**/*.d.ts",
      ],
      // Measured 2026-11-08 with `docker compose run --rm test` before any
      // threshold existed (v8, all workers merged; each glob is the sum of
      // covered over the sum of total). Floors of the measured percentages:
      //   src/sim/**           lines 93.5697  stmts 91.8507  funcs 97.7273  branches 86.9988
      //   src/sim/economy/**   lines 94.1176  stmts 91.7391  funcs 100.0000 branches 85.8025
      //   src/sim/hyperspace/** lines 97.7528 stmts 97.7778  funcs 100.0000 branches 92.5000
      //   src/persistence/**   lines 88.7500  stmts 87.0849  funcs 85.7143  branches 85.5140
      //   src/content/**       lines 66.8367  stmts 64.9289  funcs 57.1429  branches 53.3333
      thresholds: {
        "src/sim/**/*.ts": {
          lines: 93,
          statements: 91,
          functions: 97,
          branches: 86,
        },
        "src/sim/economy/**/*.ts": {
          lines: 94,
          statements: 91,
          functions: 100,
          branches: 85,
        },
        "src/sim/hyperspace/**/*.ts": {
          lines: 97,
          statements: 97,
          functions: 100,
          branches: 92,
        },
        "src/persistence/**/*.ts": {
          lines: 88,
          statements: 87,
          functions: 85,
          branches: 85,
        },
        "src/content/**/*.ts": {
          lines: 66,
          statements: 64,
          functions: 57,
          branches: 53,
        },
      },
    },
    // D-12: one Node-only project. Browser-mode Vitest arrives with the DOM
    // station screens in Phase 5; until then `e2e` is the only browser surface.
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          // `src/**/*.test.ts` (not `src/sim/**`): the reference scaffold's
          // narrower glob silently skipped src/render/camera-relative.test.ts,
          // which is FOUND-08's numeric half.
          include: [
            "src/**/*.test.ts",
            "tests/**/*.test.ts",
            "tools/**/*.test.ts",
          ],
        },
      },
    ],
  },
});
