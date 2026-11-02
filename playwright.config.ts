// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    // Spread the device descriptor first: it carries its own `viewport`, and a
    // later explicit key would be flagged as overwritten (TS2783). The Desktop
    // Chrome viewport is already 1280x720, which is the size every assertion in
    // tests/e2e was written against.
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4173",
    // D-08 forbids pixel diffing, so no traces or screenshots.
    trace: "off",
    screenshot: "off",
  },
  webServer: {
    // `vite preview` serves dist/, so the caller must build first (`npm run build`
    // in the e2e/verify service command).
    command: "npx vite preview --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
