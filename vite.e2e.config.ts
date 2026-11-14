// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The browser-test bundle (Phase 12, WORLD-16, owner decision 1).
 *
 * This is the production config with one define changed:
 * `__WEGOLITE_TRAFFIC_DEFAULT__` is `"false"`, so a plain session (no
 * `?test=1`) has no NPC traffic and the plain browser specs, including the
 * cold-start budget spec, run unchanged. `?test=1&traffic=1` opts a session in.
 *
 * It keeps the default `dist/` output so the Playwright webServer
 * (`vite preview`) serves it. It is never deployed: the Pages workflow and the
 * `preview` service run `npm run build`, the production bundle with traffic on.
 * tests/contract/container-contract.test.ts pins that split.
 */

import { mergeConfig } from "vite";

import base from "./vite.config.js";

export default mergeConfig(base, {
  define: {
    __WEGOLITE_TRAFFIC_DEFAULT__: "false",
  },
});
