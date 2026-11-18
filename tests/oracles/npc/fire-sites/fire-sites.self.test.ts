// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Self-test of the fire-site oracle (Phase 17, plan 17-02).
 *
 * The oracle has to be right before the port exists, so this file checks it
 * against itself: every embedded fixture parses with the strict schemas of
 * `./schema.ts`, every check, event, scripted-draw count and fire-request tick
 * is re-derived through `../pursuit/derive.ts` (the one-update transliteration
 * of the Oolite behaviours, now weapon-aware), and the facts the fixtures rely
 * on are asserted (a held pose is exact, no proximity alert can start, ids are
 * unique).
 *
 * Nothing here reads Wegolite code or the Oolite checkout: the expected values
 * come from the pinned Oolite source (commit 7437f22) cited line by line in each
 * fixture, and this file reads its own fixture files only.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import * as derive from "../pursuit/derive.js";
import {
  FireSiteFileSchema,
  FireSiteFixtureSchema,
  type FireSiteFixture,
} from "./schema.js";

const FIXTURE_DIR = fileURLToPath(new URL("./fixtures/", import.meta.url));

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(`${FIXTURE_DIR}${name}`, "utf8")) as unknown;
}

const FIRE_SITE_FILES = ["fire-sites.json"] as const;

function loadFireSites(name: string): FireSiteFixture[] {
  return FireSiteFileSchema.parse(readJson(name));
}

function allFireSiteFixtures(): FireSiteFixture[] {
  return FIRE_SITE_FILES.flatMap((name) => loadFireSites(name));
}

/** The fixture as the derivation reads it: the embedded fixture plus the weapon state. */
function like(entry: FireSiteFixture): derive.FixtureLike {
  return { ...entry.fixture, weapon: entry.weapon };
}

/**
 * A replay of more than one update holds the steered ship's pose (derive.ts
 * does not move it), so a fixture with a horizon above 1 must prove the held
 * pose is exact: the largest displacement of ship and target over the horizon
 * stays clear of every range threshold the behaviours read, as listed here.
 * Temperature thresholds need no entry: the cooling is exact.
 */
const FROZEN_THRESHOLDS: Record<string, number[]> = {
  // 15,000 (slow-down range, 4648) and 437.5 (in-range, 4630) at range 19,920
  "fire-site-fly-to-requests-every-update": [15000, 437.5],
  // the dispatcher at update 2 reads 437.5 (4128) and 12,500 (4160, never true for a pulse laser)
  "fire-site-fly-to-frustration-hand-over-still-requests": [437.5, 12500],
  // no target: the range is 0 and nothing reads it
  "fire-site-fly-to-lost-target-requests-nothing": [],
};

describe("fire-site fixture files", () => {
  it("parses every fire-site file against the strict schema", () => {
    for (const name of FIRE_SITE_FILES) {
      expect(() => loadFireSites(name), name).not.toThrow();
    }
  });

  it("keeps fixture ids unique across the fire-site files", () => {
    const ids = allFireSiteFixtures().map((entry) => entry.fixture.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cites every fixture to Oolite lines and explains its derivation", () => {
    for (const entry of allFireSiteFixtures()) {
      expect(entry.fixture.oolite.length, entry.fixture.id).toBeGreaterThan(0);
      expect(entry.fixture.derivation.length, entry.fixture.id).toBeGreaterThan(
        200,
      );
    }
  });
});

describe("the fire-site schema refuses what it must", () => {
  const first = allFireSiteFixtures()[0];
  if (first === undefined) throw new Error("no fire-site fixture");
  const base = structuredClone(first);

  it("accepts a clean entry", () => {
    expect(FireSiteFixtureSchema.safeParse(base).success).toBe(true);
  });

  it("refuses request ticks beyond the horizon", () => {
    const bad = { ...base, fireRequestTicks: [base.fixture.horizon + 1] };
    expect(FireSiteFixtureSchema.safeParse(bad).success).toBe(false);
  });

  it("refuses request ticks that do not strictly ascend", () => {
    expect(
      FireSiteFixtureSchema.safeParse({ ...base, fireRequestTicks: [2, 1] })
        .success,
    ).toBe(false);
    expect(
      FireSiteFixtureSchema.safeParse({ ...base, fireRequestTicks: [1, 1] })
        .success,
    ).toBe(false);
  });

  it("refuses a negative or non-integer missedShots", () => {
    for (const missedShots of [-1, 1.5]) {
      const bad = { ...base, weapon: { ...base.weapon, missedShots } };
      expect(
        FireSiteFixtureSchema.safeParse(bad).success,
        String(missedShots),
      ).toBe(false);
    }
  });

  it("refuses a negative temperature and a temperature that is not float32", () => {
    for (const forwardWeaponTemp of [-0.25, 217.6]) {
      const bad = { ...base, weapon: { ...base.weapon, forwardWeaponTemp } };
      expect(
        FireSiteFixtureSchema.safeParse(bad).success,
        String(forwardWeaponTemp),
      ).toBe(false);
    }
  });

  it("refuses an unknown key", () => {
    expect(
      FireSiteFixtureSchema.safeParse({ ...base, extra: true }).success,
    ).toBe(false);
    expect(
      FireSiteFixtureSchema.safeParse({
        ...base,
        weapon: { ...base.weapon, extra: 1 },
      }).success,
    ).toBe(false);
  });

  it("refuses an id outside the fire-site prefixes", () => {
    const bad = structuredClone(base);
    bad.fixture.id = "attack-something";
    expect(FireSiteFixtureSchema.safeParse(bad).success).toBe(false);
  });
});

describe("the derivation's weapon state", () => {
  it("cools a stated temperature once per later update in float32", () => {
    const read = Math.fround(100);
    const step = Math.fround(6 / 120);
    expect(derive.temperatureAtUpdate(read, 1)).toBe(read);
    expect(derive.temperatureAtUpdate(read, 2)).toBe(
      Math.fround(Math.fround(read - step)),
    );
    expect(derive.temperatureAtUpdate(0, 5)).toBe(0);
    expect(derive.temperatureAtUpdate(Math.fround(0.01), 2)).toBe(0);
  });

  it("holds the thresholds as float32 products (ShipEntity.h:115-120)", () => {
    expect(derive.WEAPON_TEMP_READY).toBe(64);
    expect(derive.WEAPON_TEMP_USABLE).toBe(
      Math.fround(Math.fround(0.85) * 256),
    );
    // the float32 product is not the float64 product 0.85 * 256 = 217.6
    expect(derive.WEAPON_TEMP_USABLE).not.toBe(217.6);
    expect(derive.WEAPON_TEMP_USABLE).toBeCloseTo(217.6000061, 6);
  });
});

describe("every check, event, draw count and fire request re-derives through derive.ts", () => {
  for (const name of FIRE_SITE_FILES) {
    for (const entry of loadFireSites(name)) {
      it(`${entry.fixture.id}: checks, events, draws and fire requests`, () => {
        const fixture = like(entry);
        for (const check of entry.fixture.checks) {
          const derived = derive.deriveCheck(fixture, check);
          if (typeof check.expected === "string") {
            expect(derived, `${check.field}@${String(check.tick)}`).toBe(
              check.expected,
            );
          } else {
            expect(typeof derived, `${check.field}@${String(check.tick)}`).toBe(
              "number",
            );
            expect(
              Math.abs((derived as number) - check.expected),
              `${check.field}@${String(check.tick)}: derived ${String(derived)} vs ${String(check.expected)}`,
            ).toBeLessThanOrEqual(check.tolerance + 1e-12);
          }
        }
        expect(derive.deriveEvents(fixture)).toEqual(entry.fixture.events);
        expect(derive.deriveDrawCount(fixture)).toBe(
          entry.fixture.draws.length,
        );
        expect(derive.deriveFireRequests(fixture)).toEqual(
          entry.fireRequestTicks,
        );
      });
    }
  }
});

describe("later updates come from an exact held pose", () => {
  for (const entry of allFireSiteFixtures()) {
    const { fixture } = entry;
    if (fixture.horizon < 2) continue;
    it(`${fixture.id}: the held pose is exact`, () => {
      const thresholds = FROZEN_THRESHOLDS[fixture.id];
      expect(
        thresholds,
        `${fixture.id} needs a FROZEN_THRESHOLDS entry`,
      ).toBeDefined();
      const world = derive.tickZeroWorld(like(entry));
      const target = derive.primaryTarget(world);
      const range0 = derive.rangeToPrimaryTarget(world);
      const shipTravel =
        fixture.horizon * fixture.dt * fixture.stats.maxFlightSpeed;
      const targetTravel =
        target === null || fixture.motion === "static"
          ? 0
          : fixture.horizon * fixture.dt * Math.abs(target.speed);
      const reach = shipTravel + targetTravel;
      for (const threshold of thresholds ?? []) {
        expect(
          Math.abs(range0 - threshold),
          `${fixture.id} threshold ${String(threshold)}`,
        ).toBeGreaterThan(reach);
      }
    });
  }
});

describe("no proximity alert can start before the horizon ends", () => {
  it("keeps every body outside four radii of the ship through the held poses", () => {
    for (const entry of allFireSiteFixtures()) {
      const { fixture } = entry;
      const reach =
        fixture.horizon *
        fixture.dt *
        Math.max(fixture.stats.maxFlightSpeed, Math.abs(fixture.self.speed));
      const world = derive.tickZeroWorld(like(entry));
      // the alert set at update k is read at update k + 1
      for (let k = 1; k <= fixture.horizon - 1; k += 1) {
        for (const body of fixture.bodies) {
          if (body.kind === "planet" || body.kind === "sun") continue;
          const position = derive.bodyPosition(world, body, k);
          const dist = derive.mag(derive.sub(position, fixture.self.position));
          const zone = 4 * Math.max(fixture.self.radius, body.radius);
          expect(
            dist - reach,
            `${fixture.id} update ${String(k)}`,
          ).toBeGreaterThan(zone);
        }
      }
    }
  });
});
