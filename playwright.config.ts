// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  // The browser gate is measured on a 4-CPU host with two concurrent pages, and
  // pinning makes that contention reproducible instead of depending on the runner's core count.
  workers: 2,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    // D-08 forbids pixel diffing, so no traces or screenshots.
    trace: "off",
    screenshot: "off",
  },
  projects: [
    {
      // The device descriptor sets its own `viewport`, and a later explicit key
      // would be flagged as overwritten (TS2783), so it is spread first. Desktop
      // Chrome and Desktop Firefox are both 1280x720, the size every assertion
      // in tests/e2e was written against.
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Firefox runs headed (firefox-xvfb, the 07-04 owner decision): headless
      // Firefox has no WebGL2 context in this container. `npm run test:e2e:cross`
      // wraps the run in xvfb-run, which supplies the display. Only the engine
      // smoke and the core-loop journey run here.
      name: "firefox",
      use: { ...devices["Desktop Firefox"], headless: false },
      testMatch: /(engine|core-loop)\.spec\.ts$/,
    },
  ],
  webServer: [
    {
      // `vite preview` serves dist/, so the caller must build first (`npm run build`
      // in the e2e/verify service command).
      command: "npx vite preview --host 127.0.0.1 --port 4173 --strictPort",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // The test-only build (D-18, WR-04). It is built and served here and never
      // written to dist/, so the fault seam is reachable only from this origin.
      command:
        "npx vite build -c vite.seams.config.ts && npx vite preview -c vite.seams.config.ts --host 127.0.0.1 --port 4175 --strictPort",
      url: "http://127.0.0.1:4175",
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
