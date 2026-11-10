// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The WR-04 fault-seam browser test (Phase 7 plan 07-07, D-18).
 *
 * The seam is compiled only into the test-only bundle produced by
 * vite.seams.config.ts, served on 127.0.0.1:4175. That bundle is a second full
 * Vite build, so it lives in its own Playwright config rather than in the
 * default webServer array: ordinary and targeted runs (including the `verify`
 * fast gate) no longer pay for it. Run it after `npm run build`, via
 * `npm run test:e2e:seams`; the spec's synchronous guard also reads dist/assets
 * from disk to prove the shipped bundle carries no seam.
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /hyperspace-failure\.spec\.ts$/,
  fullyParallel: false,
  // A single spec file: two workers match the default gate's posture without
  // adding SwiftShader contention.
  workers: 2,
  retries: 0,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4175",
    // D-08 forbids pixel diffing, so no traces or screenshots.
    trace: "off",
    screenshot: "off",
  },
  webServer: {
    // The test-only build (D-18, WR-04). It is built and served here and never
    // written to dist/, so the fault seam is reachable only from this origin.
    command:
      "npx vite build -c vite.seams.config.ts && npx vite preview -c vite.seams.config.ts --host 127.0.0.1 --port 4175 --strictPort",
    url: "http://127.0.0.1:4175",
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
