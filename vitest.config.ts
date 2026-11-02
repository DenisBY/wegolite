// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
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
          include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
        },
      },
    ],
  },
});
