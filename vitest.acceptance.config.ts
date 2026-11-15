// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

import { defineConfig } from "vitest/config";

/**
 * The 20-seed NPC flight acceptance run (`npm run test:acceptance`, plan 14-17).
 *
 * Standalone on purpose: it is not a project of `vitest.config.ts`, so the
 * default `npm test` and `verify` never pick the acceptance file up (it is not a
 * `*.test.ts` file either). It includes only `tests/acceptance/**\/*.acceptance.ts`,
 * has no coverage and no projects. The detector tests (`detectors.test.ts`)
 * stay in the default suite.
 */
export default defineConfig({
  // Restated from vitest.config.ts: a Vitest path that reaches the build-time
  // read sees the production default.
  define: {
    __WEGOLITE_TRAFFIC_DEFAULT__: "true",
  },
  test: {
    name: "acceptance",
    environment: "node",
    include: ["tests/acceptance/**/*.acceptance.ts"],
  },
});
