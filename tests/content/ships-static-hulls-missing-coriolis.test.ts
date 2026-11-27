// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The Coriolis station-hull assertion (Phase 22.1 review WR-02).
 *
 * `loadStationHulls` promises that an artifact without the kind's ship key is
 * rejected, because a station without its hull would be silently immune to
 * lasers. The Coriolis hull lives in the shared artifact, so the promise has to
 * hold for the shared file too: here the shared file is replaced by one that
 * dropped `coriolis-station`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { StaticHullArtifact } from "../../src/content/schemas/ship-static-hull.js";

const SHARED_FILE = "src/content/generated/ships-static-hulls.json";

vi.mock("../../src/content/generated/ships-static-hulls.json?raw", () => {
  const full = JSON.parse(
    readFileSync(join(process.cwd(), SHARED_FILE), "utf8"),
  ) as StaticHullArtifact;
  const withoutCoriolis = {
    ...full,
    hulls: full.hulls.filter((hull) => hull.key !== "coriolis-station"),
  };
  return { default: JSON.stringify(withoutCoriolis) };
});

import {
  StaticHullsError,
  loadStationHulls,
} from "../../src/content/ships-static-hulls.js";

describe("loadStationHulls with a shared artifact that dropped the Coriolis hull", () => {
  it("rejects the Coriolis with a StaticHullsError naming its ship key", async () => {
    const load = loadStationHulls("coriolis");
    await expect(load).rejects.toBeInstanceOf(StaticHullsError);
    await expect(load).rejects.toThrow(/coriolis-station/);
  });
});
