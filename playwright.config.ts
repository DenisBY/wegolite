// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

import { defineConfig, devices } from "@playwright/test";

// `CI=1` is baked into the Wegolite image (Dockerfile), so `!process.env["CI"]`
// alone cannot turn preview reuse on inside a container. `WEGOLITE_REUSE_PREVIEW=1`
// is the explicit local opt-in: keep one `npm run preview` alive in the same
// container as Playwright and reuse it across targeted spec runs. CI stays
// `false`, so a stale server fails loudly instead of being silently reused.
const reusePreview =
  process.env["WEGOLITE_REUSE_PREVIEW"] === "1" || !process.env["CI"];

export default defineConfig({
  testDir: "./tests/e2e",
  // The WR-04 seam spec needs its own test-only bundle and origin. It runs from
  // playwright.seams.config.ts (npm run test:e2e:seams), so the ordinary suite
  // no longer pays for a second full Vite build on every run.
  testIgnore: /hyperspace-failure\.spec\.ts$/,
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
      // wraps the run in xvfb-run, which supplies the display, and passes
      // --workers=1: two headed Firefox windows on one display starve the engine
      // smoke's frame sampling (0 renders in 5 s), while each passes alone. Only
      // the engine smoke and the core-loop journey run here.
      name: "firefox",
      use: { ...devices["Desktop Firefox"], headless: false },
      testMatch: /(engine|core-loop)\.spec\.ts$/,
    },
  ],
  webServer: {
    // `vite preview` serves dist/, so the caller must build first (`npm run build`
    // in the e2e/verify service command).
    command: "npx vite preview --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: reusePreview,
    timeout: 60_000,
  },
});
