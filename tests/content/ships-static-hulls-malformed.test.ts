// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * A malformed static hull file (Phase 22.1 review IN-03).
 *
 * A corrupt chunk must reach the boot failure surface as a `StaticHullsError`
 * that names the file, not as a bare `SyntaxError` with no path. The shared
 * artifact is replaced here by text that is not JSON.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/content/generated/ships-static-hulls.json?raw", () => ({
  default: "{ this is not json",
}));

import {
  StaticHullsError,
  loadStaticHulls,
  loadStationHulls,
} from "../../src/content/ships-static-hulls.js";

describe("a static hull file that is not valid JSON", () => {
  it("rejects loadStaticHulls with a StaticHullsError naming the file", async () => {
    const load = loadStaticHulls();
    await expect(load).rejects.toBeInstanceOf(StaticHullsError);
    await expect(load).rejects.toThrow(
      /ships-static-hulls\.json is not valid JSON/,
    );
  });

  it("rejects the Coriolis station load the same way", async () => {
    const load = loadStationHulls("coriolis");
    await expect(load).rejects.toBeInstanceOf(StaticHullsError);
    await expect(load).rejects.toThrow(
      /ships-static-hulls\.json is not valid JSON/,
    );
  });
});
