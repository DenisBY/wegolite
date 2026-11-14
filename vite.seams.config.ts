// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The test-only build (Phase 6 WR-04, D-18).
 *
 * This config compiles the test-fault read in (`__WEGOLITE_TEST_SEAMS__` is
 * `"true"`) and writes the bundle under `node_modules/.wegolite-seams`, never
 * under `dist/`. Only Playwright serves it, on 127.0.0.1:4175
 * (playwright.seams.config.ts).
 * It is never deployed, so the seam is unreachable from a URL of the shipped site.
 *
 * The output sits under `node_modules/` because tests/compliance.test.ts skips
 * that directory in its SPDX walk, so the test bundle is not policed as source.
 */

import { mergeConfig } from "vite";

import base from "./vite.config.js";

export default mergeConfig(base, {
  define: {
    __WEGOLITE_TEST_SEAMS__: "true",
    // A test-only bundle: the WR-04 spec boots a plain session, which has no
    // NPC traffic here (WORLD-16, owner decision 1).
    __WEGOLITE_TRAFFIC_DEFAULT__: "false",
  },
  build: {
    outDir: "node_modules/.wegolite-seams",
    emptyOutDir: true,
  },
});
