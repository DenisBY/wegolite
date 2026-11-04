// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The diagnostic Playwright config (quick task 261104-oif).
 *
 * This config is invoked explicitly and is deliberately outside ./tests/e2e:
 *
 *   npx playwright test --config=playwright.diag.config.ts
 *
 * `playwright.config.ts` keeps `testDir: "./tests/e2e"`, so `npm run test:e2e`
 * and `docker compose run --rm verify` never run this harness. The `use` and
 * `webServer` blocks mirror the default config so the measurement environment
 * (1280x720, DPR 1, `vite preview` on 127.0.0.1:4173) is the same one the e2e
 * suite uses.
 *
 * `DIAG_WORKERS` selects concurrency (default 2, matching the e2e suite);
 * `DIAG_WORKERS=1` is the solo reference arm.
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/diag",
  fullyParallel: true,
  workers: Number.parseInt(process.env["DIAG_WORKERS"] ?? "2", 10),
  retries: 0,
  reporter: [["list"]],
  timeout: 240_000,
  use: {
    // Spread the device descriptor first: it carries its own `viewport`, and a
    // later explicit key would be flagged as overwritten (TS2783). Desktop
    // Chrome is 1280x720 at deviceScaleFactor 1 in Playwright, so DPR is 1.
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4173",
    trace: "off",
    screenshot: "off",
  },
  webServer: {
    // `vite preview` serves dist/, so the caller must build first (`npm run
    // build` in the e2e service command); this block mirrors the default config.
    command: "npx vite preview --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
