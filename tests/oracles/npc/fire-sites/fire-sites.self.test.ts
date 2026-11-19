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

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import * as derive from "../pursuit/derive.js";
import {
  AimFeedbackFileSchema,
  AimFeedbackFixtureSchema,
  FireSiteFileSchema,
  FireSiteFixtureSchema,
  type AimFeedbackFixture,
  type FireSiteFixture,
} from "./schema.js";

const FIXTURE_DIR = fileURLToPath(new URL("./fixtures/", import.meta.url));

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(`${FIXTURE_DIR}${name}`, "utf8")) as unknown;
}

const FIRE_SITE_FILES = ["fire-sites.json", "hot-branches.json"] as const;

function loadFireSites(name: string): FireSiteFixture[] {
  return FireSiteFileSchema.parse(readJson(name));
}

function loadAimFeedback(): AimFeedbackFixture[] {
  return AimFeedbackFileSchema.parse(readJson("aim-feedback.json"));
}

/** An aim-feedback fixture as the derivation reads it: temperature 0 and its `missedShots`. */
function likeAim(entry: AimFeedbackFixture): derive.FixtureLike {
  return {
    ...entry.fixture,
    weapon: { forwardWeaponTemp: 0, missedShots: entry.weapon.missedShots },
  };
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
  // evasive reads no range; the right-axis agreement is -1, far from +-0.3 (9016)
  "fire-site-evasive-requests-every-update": [],
  "fire-site-flee-evasive-requests-every-update": [],
  // the dispatcher at update 2 reads 437.5 and 12,500 at range 4,920
  "fire-site-evasive-hand-over-still-requests": [437.5, 12500],
  // flee at update 2 compares the range 4,920 with its desired range 10,000
  // (4855); its successFactor read is replayed with the ship moving (MOVING_SELF)
  "fire-site-flee-evasive-hand-over-still-requests": [10000],
  "fire-site-evasive-lost-target-still-requests": [],
  // 15,000 (4414, 4417) and 0.8 x scanner range 20,480 (4417) at range 20,000
  "fire-site-sniper-beyond-15000-requests-every-update": [15000, 20480],
  // sniper 15,000; the dispatcher at update 2: 525 (0.035 x 15,000), 12,500 (4160)
  "fire-site-sniper-inside-15000-falls-through-and-requests": [
    15000, 525, 12500,
  ],
  // range 4,920 against the desired range 1,000 (4855) and the improvement test (4860, held)
  "fire-site-flee-with-a-laser-requests-nothing": [1000],
  // fly-to at update 1: 15,000 (4648), 5,000 (4652), 437.5 (4630), 6,127.45 (the
  // confidence range 1,250,000 / 204); the dispatcher at update 2: 6,250 (4122), 437.5
  "hot-fly-to-cooling-carries-the-read-across-usable-between-updates": [
    15000, 5000, 437.5, 6250, 6127.45,
  ],
};

/**
 * Fixtures whose steered ship cannot move at all: it starts at rest, wants
 * speed 0 and, being outside its desired range, never raises it (flee,
 * ShipEntity.m:4855-4858).
 */
const STATIC_SELF = new Set(["fire-site-flee-with-a-laser-requests-nothing"]);

/**
 * Fixtures whose checks read a continuous range after the ship has moved
 * (oracle dispute, 17-08): they replay with `{ moveSelf: true }`, which runs
 * `applyThrust:`'s speed change and `moveForward:` along the stated forward
 * but not `applyAttitudeChanges:`. The rotation left out must move the ship by
 * less than the smallest numeric tolerance (see the bound test below).
 */
const MOVING_SELF = new Set([
  "fire-site-flee-evasive-hand-over-still-requests",
]);

/** The check fields that read the ship's position through a range or directly. */
const RANGE_READ_FIELDS: ReadonlySet<string> = new Set([
  "successFactor",
  "rangeToTarget",
  "positionX",
  "positionY",
  "positionZ",
]);

function stepOptions(id: string): derive.StepOptions {
  return MOVING_SELF.has(id) ? { moveSelf: true } : {};
}

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
        const options = stepOptions(entry.fixture.id);
        for (const check of entry.fixture.checks) {
          const derived = derive.deriveCheck(fixture, check, options);
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
        expect(derive.deriveEvents(fixture, options)).toEqual(
          entry.fixture.events,
        );
        expect(derive.deriveDrawCount(fixture, options)).toBe(
          entry.fixture.draws.length,
        );
        expect(derive.deriveFireRequests(fixture, options)).toEqual(
          entry.fireRequestTicks,
        );
      });
    }
  }
});

describe("a moving replay leaves out only a rotation below its tolerance", () => {
  for (const entry of allFireSiteFixtures()) {
    const { fixture } = entry;
    if (!MOVING_SELF.has(fixture.id)) continue;
    it(`${fixture.id}: the unrotated move is exact within the tolerance`, () => {
      // Each update rotates before it moves (2635-2636), so the forward at
      // update k is off the stated one by at most the summed attitude change
      // (|roll| + |pitch|) * dt of updates 1..k, and the move at update k is
      // off by at most speed * dt times that angle. A check at tick t reads
      // the pose the moves of updates 1..t-1 left.
      const rangeReads = fixture.checks.filter((check) =>
        RANGE_READ_FIELDS.has(check.field),
      );
      expect(rangeReads.length).toBeGreaterThan(0);
      const world = derive.tickZeroWorld(like(entry));
      let angle = 0;
      const offsetBefore: number[] = [0, 0];
      for (let k = 1; k < fixture.horizon; k += 1) {
        derive.stepTick(world, { moveSelf: true });
        angle +=
          (Math.abs(world.self.flightRoll) + Math.abs(world.self.flightPitch)) *
          fixture.dt;
        offsetBefore.push(
          (offsetBefore[k] ?? 0) + world.self.speed * fixture.dt * angle,
        );
      }
      for (const check of rangeReads) {
        const offset = offsetBefore[check.tick] ?? Number.NaN;
        expect(offset, `${check.field}@${String(check.tick)}`).toBeLessThan(
          check.tolerance / 10,
        );
      }
    });
  }
});

describe("later updates come from an exact held pose", () => {
  for (const entry of allFireSiteFixtures()) {
    const { fixture } = entry;
    if (fixture.horizon < 2) continue;
    it(`${fixture.id}: the held pose is exact`, () => {
      if (STATIC_SELF.has(fixture.id)) {
        expect(fixture.self.speed).toBe(0);
        expect(fixture.self.desiredSpeed).toBe(0);
        expect(
          derive.rangeToPrimaryTarget(derive.tickZeroWorld(like(entry))),
        ).toBeGreaterThan(fixture.self.desiredRange);
        expect(
          derive.deriveCheck(like(entry), {
            tick: fixture.horizon,
            field: "desiredSpeed",
            expected: 0,
            tolerance: 0,
            note: "static self",
          }),
        ).toBe(0);
        return;
      }
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

// ---------------------------------------------------------------------------
// the fire calls of the in-scope methods (contract item 4)

interface FireCall {
  /** The Objective-C method that contains the call. */
  method: string;
  /** The line of its `fireMainWeapon:` call at the pin. */
  fireLine: number;
  /** The last line of the method (its closing brace). */
  lastLine: number;
  /** The line of the first `randf()` or `ranrot_rand()` after the call, or null. */
  nextDrawLine: number | null;
}

/**
 * Written by hand from `git -C /home/opencode/git/oolite show
 * 7437f22:src/Core/Entities/ShipEntity.m`; no test reads that checkout (it is
 * not mounted in the containers), so the draw-after-call fact is this recorded
 * table. Every row means: between `fireLine` and `lastLine` there is no `randf()`
 * and no `ranrot_rand()`, so moving the gate's own `randf()` (9949) from the
 * call to the end of the update keeps the stream order, and `draws` of the
 * fixtures can list the steering's draws only.
 */
export const FIRE_CALL_TABLE: readonly FireCall[] = [
  // behaviour_evasive_action, 3996-4036: the call is the last statement (4035),
  // only the closing brace (4036) follows
  {
    method: "behaviour_evasive_action",
    fireLine: 4035,
    lastLine: 4036,
    nextDrawLine: null,
  },
  // behaviour_attack_sniper, 4397-4459: 4454 is followed by the weapon_temp
  // tail (4456-4458) and the closing brace (4459); no draw
  {
    method: "behaviour_attack_sniper",
    fireLine: 4454,
    lastLine: 4459,
    nextDrawLine: null,
  },
  // behaviour_fly_to_target_six (SIX and TWELVE), 4461-4580: 4575 is followed
  // by the weapon_temp tail (4577-4579) and the closing brace (4580); no draw
  {
    method: "behaviour_fly_to_target_six",
    fireLine: 4575,
    lastLine: 4580,
    nextDrawLine: null,
  },
  // behaviour_attack_fly_to_target, 4611-4731: 4711 is followed by the
  // weapon_temp tail and the dodge else-if (4713-4730), which only compare and
  // read the target's weapon types, and the closing brace (4731); no draw
  {
    method: "behaviour_attack_fly_to_target",
    fireLine: 4711,
    lastLine: 4731,
    nextDrawLine: null,
  },
];

/** The behaviours that can be running when each fire call is reached. */
const FIRE_CALL_BEHAVIOURS: Record<number, readonly string[]> = {
  4035: ["EVASIVE_ACTION", "FLEE_EVASIVE_ACTION"],
  4454: ["ATTACK_SNIPER"],
  4575: ["ATTACK_FLY_TO_TARGET_SIX", "ATTACK_FLY_TO_TARGET_TWELVE"],
  4711: ["ATTACK_FLY_TO_TARGET"],
};

/**
 * A fire call is cited as a ONE-line range (`ShipEntity.m:4711-4711`); every
 * other citation in the fire-site files spans several lines.
 */
function citedFireLines(entry: FireSiteFixture): number[] {
  const lines: number[] = [];
  for (const citation of entry.fixture.oolite) {
    const match = /ShipEntity\.m:(\d+)-(\d+)$/.exec(citation);
    if (match === null) continue;
    if (match[1] === match[2]) lines.push(Number(match[1]));
  }
  return lines;
}

describe("the fire calls (contract item 4)", () => {
  it("records that no draw follows any in-scope fire call", () => {
    expect(FIRE_CALL_TABLE).toHaveLength(4);
    for (const row of FIRE_CALL_TABLE) {
      expect(row.nextDrawLine, row.method).toBeNull();
      expect(row.fireLine, row.method).toBeLessThan(row.lastLine);
    }
    expect(new Set(FIRE_CALL_TABLE.map((row) => row.fireLine)).size).toBe(4);
  });

  it("matches the fire calls the fire-sites.json fixtures cite", () => {
    const cited = new Set<number>();
    for (const entry of loadFireSites("fire-sites.json")) {
      const lines = citedFireLines(entry);
      const id = entry.fixture.id;
      if (entry.fireRequestTicks.length > 0) {
        // a requesting fixture cites exactly one fire call, and it is the one
        // its starting behaviour can reach
        expect(lines, id).toHaveLength(1);
        const line = lines[0];
        expect(line, id).toBeDefined();
        const behaviours = FIRE_CALL_BEHAVIOURS[line ?? 0];
        expect(behaviours, `${id} cites ${String(line)}`).toBeDefined();
        expect(behaviours, id).toContain(entry.fixture.self.behaviour);
        cited.add(line ?? 0);
      } else {
        // a fixture that requests nothing cites no fire call
        expect(lines, id).toEqual([]);
      }
    }
    expect([...cited].sort()).toEqual(
      FIRE_CALL_TABLE.map((row) => row.fireLine).sort(),
    );
  });
});

describe("the sites and branches outside the contract (contract item 6)", () => {
  /** Listed, not authored: aft, port and starboard weapons are none on every compiled record and no laser is a turret. */
  const UNREACHABLE = [
    {
      site: "behaviour_flee_target: the turret-only fireMainWeapon: call",
      lines: "ShipEntity.m:4890-4892",
    },
    {
      site: "behaviour_attack_fly_to_target: the aft, port and starboard terms of the hand-over condition",
      lines: "ShipEntity.m:4717",
    },
    {
      site: "behaviour_attack_target: turret-laser and subentity weapons",
      lines: "ShipEntity.m:4056-4074",
    },
    {
      site: "behaviour_attack_target: the aft, port and starboard ready tests",
      lines: "ShipEntity.m:4078-4081, 4086, 4088-4089",
    },
    {
      site: "behaviour_attack_target: RUNNING_DEFENSE and ATTACK_BROADSIDE",
      lines: "ShipEntity.m:4131-4136, 4171-4176",
    },
    {
      site: "behaviour_fly_to_target_six: the turret-laser destinations",
      lines: "ShipEntity.m:4537-4549, 4565",
    },
    {
      site: "behaviour_running_defense: its fire calls (RUNNING_DEFENSE is out of the attack IN list)",
      lines: "ShipEntity.m:4819-4824",
    },
    {
      site: "behaviour_attack_fly_to_target: the gunsight dodge (Phase 14 divergence 21; derive.ts throws where it would be reached)",
      lines: "ShipEntity.m:4721-4730",
    },
  ] as const;

  it("lists every unreachable site with its lines", () => {
    expect(UNREACHABLE.length).toBeGreaterThanOrEqual(8);
    for (const row of UNREACHABLE) {
      expect(row.lines, row.site).toMatch(/^ShipEntity\.m:\d/);
    }
  });

  it("covers flee's turret-only call as a site that requests nothing", () => {
    const flee = loadFireSites("fire-sites.json").find(
      (entry) =>
        entry.fixture.id === "fire-site-flee-with-a-laser-requests-nothing",
    );
    expect(flee).toBeDefined();
    expect(flee?.fireRequestTicks).toEqual([]);
    expect(flee?.fixture.oolite).toContain(
      "src/Core/Entities/ShipEntity.m:4889-4892",
    );
  });

  it("refuses the unmodelled dodge instead of guessing (Phase 14 divergence 21)", () => {
    const base = loadFireSites("hot-branches.json").find(
      (entry) =>
        entry.fixture.id ===
        "hot-fly-to-above-usable-accuracy-9-skips-the-dodge-branch",
    );
    if (base === undefined) throw new Error("no accuracy 9 fixture");
    // temperature 0 makes the 4713 condition false, so accuracy 9 reaches the else-if
    const cold: derive.FixtureLike = {
      ...like(base),
      weapon: { forwardWeaponTemp: 0, missedShots: 0 },
    };
    expect(() => derive.deriveEvents(cold)).toThrow(/not modelled/);
  });
});

// ---------------------------------------------------------------------------
// coverage of the plan's sites and hot branches

describe("fire-site and hot-branch coverage", () => {
  const sites = (): FireSiteFixture[] => loadFireSites("fire-sites.json");
  const hot = (): FireSiteFixture[] => loadFireSites("hot-branches.json");
  const byId = (id: string): FireSiteFixture => {
    const found = [...sites(), ...hot()].find(
      (entry) => entry.fixture.id === id,
    );
    if (found === undefined) throw new Error(`no fixture ${id}`);
    return found;
  };

  it("has at least 12 fire-site and 12 hot-branch fixtures with the right prefixes", () => {
    expect(sites().length).toBeGreaterThanOrEqual(12);
    expect(hot().length).toBeGreaterThanOrEqual(12);
    for (const entry of sites())
      expect(entry.fixture.id).toMatch(/^fire-site-/);
    for (const entry of hot()) expect(entry.fixture.id).toMatch(/^hot-/);
  });

  it("covers every in-scope site, with and without a request", () => {
    const requesting = new Set<string>(
      sites()
        .filter((entry) => entry.fireRequestTicks.length > 0)
        .map((entry) => entry.fixture.self.behaviour),
    );
    for (const behaviour of [
      "EVASIVE_ACTION",
      "FLEE_EVASIVE_ACTION",
      "ATTACK_SNIPER",
      "ATTACK_FLY_TO_TARGET_SIX",
      "ATTACK_FLY_TO_TARGET_TWELVE",
      "ATTACK_FLY_TO_TARGET",
    ]) {
      expect(requesting.has(behaviour), behaviour).toBe(true);
    }
    const silent = new Set<string>(
      sites()
        .filter((entry) => entry.fireRequestTicks.length === 0)
        .map((entry) => entry.fixture.self.behaviour),
    );
    for (const behaviour of [
      "FLEE_TARGET",
      "ATTACK_TARGET",
      "ATTACK_FLY_FROM_TARGET",
      "ATTACK_BREAK_OFF_TARGET",
      "ATTACK_SLOW_DOGFIGHT",
    ]) {
      expect(silent.has(behaviour), behaviour).toBe(true);
    }
  });

  it("pins the sniper's fall-through: the below-15,000 m hand-over still requests in the same update", () => {
    const row = byId(
      "fire-site-sniper-inside-15000-falls-through-and-requests",
    );
    expect(row.fireRequestTicks).toEqual([1]);
    const handOver = row.fixture.checks.find(
      (check) => check.tick === 1 && check.field === "behaviour",
    );
    expect(handOver?.expected).toBe("ATTACK_TARGET");
    // the range that triggers it is below 15,000 m, in the fixture's own pose
    const world = derive.tickZeroWorld(like(row));
    expect(derive.rangeToPrimaryTarget(world)).toBeLessThan(15000);
  });

  it("pins evasive with a vanished target: no target guard, so it still requests", () => {
    const row = byId("fire-site-evasive-lost-target-still-requests");
    expect(row.fireRequestTicks).toEqual([1]);
    expect(row.fixture.bodies).toHaveLength(0);
    expect(row.fixture.events).toEqual([{ tick: 1, name: "shipTargetLost" }]);
  });

  it("pins that a vanished target before a site's call requests nothing", () => {
    for (const id of [
      "fire-site-fly-to-lost-target-requests-nothing",
      "fire-site-sniper-lost-target-requests-nothing",
      "fire-site-six-lost-target-requests-nothing",
    ]) {
      const row = byId(id);
      expect(row.fireRequestTicks, id).toEqual([]);
      expect(row.fixture.bodies, id).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// the temperature each hot-branch fixture reads (contract items 2 and 5)

type ReadClass =
  "below-ready" | "at-ready" | "heating-band" | "at-usable" | "above-usable";

function readClass(temperature: number): ReadClass {
  if (temperature > derive.WEAPON_TEMP_USABLE) return "above-usable";
  if (temperature === derive.WEAPON_TEMP_USABLE) return "at-usable";
  if (temperature < derive.WEAPON_TEMP_READY) return "below-ready";
  if (temperature === derive.WEAPON_TEMP_READY) return "at-ready";
  return "heating-band";
}

/**
 * Where the stated temperature sits against the two thresholds at the updates
 * the fixture's decision depends on (contract item 2): strict `>` against
 * USABLE 217.60000610351562 for the tails, strict `<` against READY 64 for the
 * dispatcher and break-off, `<` against USABLE for the heating band.
 */
const HOT_READS: Record<string, readonly (readonly [number, ReadClass])[]> = {
  "hot-sniper-above-usable-goes-to-attack-target": [[1, "above-usable"]],
  "hot-sniper-just-above-usable-goes-to-attack-target": [[1, "above-usable"]],
  "hot-sniper-at-usable-stays-sniper": [[1, "at-usable"]],
  "hot-sniper-above-usable-negative-accuracy-stays-sniper": [
    [1, "above-usable"],
  ],
  "hot-six-above-usable-goes-to-attack-target": [[1, "above-usable"]],
  "hot-six-above-usable-negative-accuracy-goes-to-attack-target": [
    [1, "above-usable"],
  ],
  "hot-six-at-usable-stays-six": [[1, "at-usable"]],
  "hot-six-below-usable-stays-six": [[1, "heating-band"]],
  "hot-fly-to-above-usable-aspect-below-zero-goes-to-attack-target": [
    [1, "above-usable"],
  ],
  "hot-fly-to-at-usable-changes-nothing": [[1, "at-usable"]],
  "hot-fly-to-above-usable-aspect-zero-changes-nothing": [[1, "above-usable"]],
  "hot-fly-to-above-usable-facing-target-changes-nothing": [
    [1, "above-usable"],
  ],
  "hot-fly-to-above-usable-beyond-confidence-changes-nothing": [
    [1, "above-usable"],
  ],
  "hot-fly-to-above-usable-negative-accuracy-changes-nothing": [
    [1, "above-usable"],
  ],
  "hot-fly-to-above-usable-accuracy-9-skips-the-dodge-branch": [
    [1, "above-usable"],
  ],
  // cooling crosses USABLE between update 1 and update 2 (derivation: 217.62 -> 217.57)
  "hot-fly-to-cooling-carries-the-read-across-usable-between-updates": [
    [1, "above-usable"],
    [2, "heating-band"],
  ],
  "hot-dispatch-below-ready-flies-to-target": [[1, "below-ready"]],
  "hot-dispatch-at-ready-takes-the-heating-branch": [[1, "at-ready"]],
  "hot-dispatch-just-below-usable-takes-the-heating-branch": [
    [1, "heating-band"],
  ],
  "hot-dispatch-heating-target-targets-self-skips-the-branch": [
    [1, "heating-band"],
  ],
  "hot-dispatch-heating-negative-accuracy-skips-the-branch": [
    [1, "heating-band"],
  ],
  "hot-dispatch-heating-beyond-half-weapon-range-skips-the-branch": [
    [1, "heating-band"],
  ],
  "hot-dispatch-at-usable-is-overheated-and-draws-the-evasive-roll": [
    [1, "at-usable"],
  ],
  "hot-dispatch-overheated-roll-above-0-75-flies-from-target": [
    [1, "at-usable"],
  ],
  "hot-dispatch-overheated-below-smart-accuracy-draws-nothing": [
    [1, "above-usable"],
  ],
  "hot-dispatch-overheated-out-of-good-range-flies-to-target": [
    [1, "above-usable"],
  ],
  "hot-dispatch-overheated-aspect-behind-near-flies-from-target": [
    [1, "above-usable"],
  ],
  "hot-dispatch-overheated-aspect-behind-far-flies-to-target": [
    [1, "above-usable"],
  ],
  "hot-dispatch-overheated-aspect-zero-draws-nothing": [[1, "at-usable"]],
  "hot-break-off-below-ready-hands-over": [[1, "below-ready"]],
  "hot-break-off-at-ready-does-not-hand-over": [[1, "at-ready"]],
};

describe("hot-branch fixtures state the temperature they read", () => {
  const hot = loadFireSites("hot-branches.json");

  it("lists every hot fixture in the read table, and nothing else", () => {
    expect(Object.keys(HOT_READS).sort()).toEqual(
      hot.map((entry) => entry.fixture.id).sort(),
    );
  });

  for (const entry of hot) {
    it(`${entry.fixture.id}: the stated temperature sits where its derivation says`, () => {
      const reads = HOT_READS[entry.fixture.id];
      expect(reads).toBeDefined();
      for (const [update, expected] of reads ?? []) {
        const read = derive.temperatureAtUpdate(
          entry.weapon.forwardWeaponTemp,
          update,
        );
        expect(
          readClass(read),
          `update ${String(update)}: ${String(read)}`,
        ).toBe(expected);
        expect(entry.fixture.derivation).toContain(
          update === 1 ? "update 1" : `update ${String(update)}`,
        );
      }
      expect(entry.weapon.missedShots).toBe(0);
    });
  }

  it("shows the thresholds on both sides, including the exact values", () => {
    const classes = new Set(
      Object.values(HOT_READS).flatMap((reads) => reads.map(([, c]) => c)),
    );
    expect([...classes].sort()).toEqual(
      [
        "above-usable",
        "at-ready",
        "at-usable",
        "below-ready",
        "heating-band",
      ].sort(),
    );
  });

  it("cools the carried read across USABLE exactly once, between update 1 and 2", () => {
    const row = hot.find(
      (entry) =>
        entry.fixture.id ===
        "hot-fly-to-cooling-carries-the-read-across-usable-between-updates",
    );
    if (row === undefined) throw new Error("no cooling fixture");
    const read1 = derive.temperatureAtUpdate(row.weapon.forwardWeaponTemp, 1);
    const read2 = derive.temperatureAtUpdate(row.weapon.forwardWeaponTemp, 2);
    expect(read1).toBeGreaterThan(derive.WEAPON_TEMP_USABLE);
    expect(read2).toBeLessThan(derive.WEAPON_TEMP_USABLE);
    expect(read2).toBeGreaterThan(derive.WEAPON_TEMP_READY);
    // one step of fround(6 / 120) = 0.05, and the margin to USABLE dwarfs a float32 ulp
    expect(read1 - read2).toBeCloseTo(0.05, 4);
    expect(derive.WEAPON_TEMP_USABLE - read2).toBeGreaterThan(0.01);
  });
});

// ---------------------------------------------------------------------------
// missedShots feedback (D-15): trackPrimaryTarget's min_d and the aim tolerance

describe("aim-feedback fixture file", () => {
  it("parses against the strict schema and has the three fixture files exactly", () => {
    expect(() => loadAimFeedback()).not.toThrow();
    expect(
      readdirSync(FIXTURE_DIR)
        .filter((name) => name.endsWith(".json"))
        .sort(),
    ).toEqual(["aim-feedback.json", "fire-sites.json", "hot-branches.json"]);
  });

  it("has at least six fixtures, three of them with missedShots 31, citing the min_d lines", () => {
    const rows = loadAimFeedback();
    expect(rows.length).toBeGreaterThanOrEqual(6);
    expect(
      rows.filter((row) => row.weapon.missedShots === 31).length,
    ).toBeGreaterThanOrEqual(3);
    for (const row of rows) {
      expect(row.fixture.id).toMatch(/^aim-feedback-/);
      expect(row.fixture.oolite, row.fixture.id).toContain(
        "src/Core/Entities/ShipEntity.m:9134-9141",
      );
      expect(row.fixture.derivation.length, row.fixture.id).toBeGreaterThan(
        200,
      );
    }
  });

  it("keeps ids unique across the three files and the Phase 14 pursuit and reference fixtures", () => {
    const own = [
      ...allFireSiteFixtures().map((entry) => entry.fixture.id),
      ...loadAimFeedback().map((entry) => entry.fixture.id),
    ];
    expect(new Set(own).size).toBe(own.length);
    const others = new Set<string>();
    for (const dir of ["../pursuit/fixtures/", "../fixtures/"]) {
      const base = fileURLToPath(new URL(dir, import.meta.url));
      for (const name of readdirSync(base).filter((n) => n.endsWith(".json"))) {
        const raw = JSON.parse(
          readFileSync(`${base}${name}`, "utf8"),
        ) as unknown;
        if (!Array.isArray(raw)) continue;
        for (const item of raw as unknown[]) {
          if (typeof item === "object" && item !== null && "id" in item) {
            others.add(String(item.id));
          }
        }
      }
    }
    expect(others.size).toBeGreaterThan(50);
    for (const id of own) expect(others.has(id), id).toBe(false);
  });
});

describe("the aim-feedback schema refuses what it must", () => {
  const first = loadAimFeedback()[0];
  if (first === undefined) throw new Error("no aim-feedback fixture");
  const base = structuredClone(first);

  it("accepts a clean entry and refuses a temperature, a bad count, a bad id and an unknown key", () => {
    expect(AimFeedbackFixtureSchema.safeParse(base).success).toBe(true);
    expect(
      AimFeedbackFixtureSchema.safeParse({
        ...base,
        weapon: { ...base.weapon, forwardWeaponTemp: 0 },
      }).success,
    ).toBe(false);
    for (const missedShots of [-1, 2.5]) {
      expect(
        AimFeedbackFixtureSchema.safeParse({ ...base, weapon: { missedShots } })
          .success,
      ).toBe(false);
    }
    const wrongId = structuredClone(base);
    wrongId.fixture.id = "hot-something";
    expect(AimFeedbackFixtureSchema.safeParse(wrongId).success).toBe(false);
    expect(
      AimFeedbackFixtureSchema.safeParse({ ...base, fireRequestTicks: [] })
        .success,
    ).toBe(false);
  });
});

describe("the min_d terms and the aim circle in closed form (9121-9143, 9761-9810)", () => {
  const near = (value: number, expected: number): void => {
    expect(Math.abs(value - expected)).toBeLessThan(1e-12);
  };

  it("lowers min_d by 0.0001 per miss for accuracy in [0, 7.5) and floors it at 0.001", () => {
    near(derive.trackingFactors(2, 0, 1.4).minD, 0.004);
    near(derive.trackingFactors(2, 3, 1.4).minD, 0.0037);
    near(derive.trackingFactors(2, 7, 1.4).minD, 0.0033);
    // 31 misses: 0.004 - 0.0031 = 0.0009 < 0.001, the floor doubles max_factor and halves the fraction
    const floored = derive.trackingFactors(2, 31, 1.4);
    expect(floored).toEqual({ minD: 0.001, maxFactor: 16, rMaxFactor: 0.0625 });
    // the boundary: 0 is in [0, 7.5)
    expect(derive.trackingFactors(0, 31, 1.4).minD).toBe(0.001);
  });

  it("leaves min_d untouched at accuracy 7.5 and above and below 0", () => {
    for (const missed of [0, 3, 31]) {
      const precise = derive.trackingFactors(8, missed, 1.4);
      near(precise.minD, 0.0004);
      expect(precise.maxFactor).toBe(33);
      near(precise.rMaxFactor, 1 / 33);
      expect(derive.trackingFactors(7.5, missed, 1.4).minD).toBe(0.0004);
      expect(derive.trackingFactors(-2, missed, 1.4)).toEqual({
        minD: 0.004,
        maxFactor: 8,
        rMaxFactor: 0.125,
      });
    }
  });

  it("shrinks the aim circle with misses for accuracy at least 0 only, before the /5", () => {
    // accuracy 2: basic_aim 204 / (1 + missed / 4)
    for (const [missed, basic] of [
      [0, 204],
      [3, 204 / 1.75],
      [31, 204 / 8.75],
    ] as const) {
      near(
        derive.currentAimTolerance(2, missed),
        Math.min(Math.sqrt(1 - (basic * basic) / 1e8), 0.999999),
      );
    }
    // accuracy 8: 96 / (1 + missed / 4) / 5, capped by best_cos 0.9999999
    near(derive.currentAimTolerance(8, 0), Math.sqrt(1 - (19.2 * 19.2) / 1e8));
    near(derive.currentAimTolerance(8, 31), 0.9999999);
    // accuracy -2: no miss term
    expect(derive.currentAimTolerance(-2, 31)).toBe(
      derive.currentAimTolerance(-2, 0),
    );
    // missedShots 0 is the Phase 14 value
    for (const accuracy of [-2, 0, 2, 7.5, 8, 10]) {
      expect(derive.currentAimTolerance(accuracy, 0)).toBe(
        derive.currentAimTolerance(accuracy),
      );
    }
  });
});

describe("every aim-feedback check re-derives through derive.ts", () => {
  for (const entry of loadAimFeedback()) {
    it(`${entry.fixture.id}: checks, events and draws`, () => {
      const fixture = likeAim(entry);
      for (const check of entry.fixture.checks) {
        const derived = derive.deriveCheck(fixture, check);
        if (typeof check.expected === "string") {
          expect(derived, `${check.field}@${String(check.tick)}`).toBe(
            check.expected,
          );
        } else {
          expect(
            Math.abs((derived as number) - check.expected),
            `${check.field}@${String(check.tick)}: derived ${String(derived)} vs ${String(check.expected)}`,
          ).toBeLessThanOrEqual(check.tolerance + 1e-12);
        }
      }
      expect(derive.deriveEvents(fixture)).toEqual(entry.fixture.events);
      expect(derive.deriveDrawCount(fixture)).toBe(entry.fixture.draws.length);
    });

    it(`${entry.fixture.id}: the pose is a one-update fixture clear of every range threshold`, () => {
      const { fixture } = entry;
      expect(fixture.horizon).toBe(1);
      expect(fixture.draws).toEqual([]);
      expect(fixture.self.behaviour).toBe("ATTACK_FLY_TO_TARGET");
      const range = derive.rangeToPrimaryTarget(
        derive.tickZeroWorld(likeAim(entry)),
      );
      // fly-to reads 437.5, 5,000 and 15,000 (4630, 4652, 4648): range 7,920 is clear
      for (const threshold of [437.5, 5000, 15000]) {
        expect(Math.abs(range - threshold)).toBeGreaterThan(1000);
      }
    });
  }

  it("is a no-op at missedShots 0: re-deriving with the default weapon gives the same sticks", () => {
    for (const entry of loadAimFeedback()) {
      if (entry.weapon.missedShots !== 0) continue;
      const withoutWeapon: derive.FixtureLike = { ...entry.fixture };
      for (const check of entry.fixture.checks) {
        expect(derive.deriveCheck(withoutWeapon, check), entry.fixture.id).toBe(
          derive.deriveCheck(likeAim(entry), check),
        );
      }
    }
  });
});

/**
 * Pairs that differ only in missedShots, and whether the expected sticks differ
 * (the miss term binds) or are equal (it does not), as each derivation states.
 */
const AIM_PAIRS: readonly (readonly [string, string, "differ" | "equal"])[] = [
  // accuracy 2, min_d: 0.004 -> 0.0037 -> floored 0.001
  [
    "aim-feedback-accuracy-2-missed-0-keeps-the-base-min-d",
    "aim-feedback-accuracy-2-missed-3-lowers-min-d",
    "differ",
  ],
  [
    "aim-feedback-accuracy-2-missed-3-lowers-min-d",
    "aim-feedback-accuracy-2-missed-31-floors-min-d-and-doubles-max-factor",
    "differ",
  ],
  [
    "aim-feedback-accuracy-2-missed-0-keeps-the-base-min-d",
    "aim-feedback-accuracy-2-missed-31-floors-min-d-and-doubles-max-factor",
    "differ",
  ],
  [
    "aim-feedback-pitch-accuracy-2-missed-0-keeps-the-base-min-d",
    "aim-feedback-pitch-accuracy-2-missed-3-lowers-min-d",
    "differ",
  ],
  [
    "aim-feedback-pitch-accuracy-2-missed-3-lowers-min-d",
    "aim-feedback-pitch-accuracy-2-missed-31-floors-min-d-and-doubles-max-factor",
    "differ",
  ],
  // accuracy 2, aim circle: inside at 0 misses, outside at 3 and 31
  [
    "aim-feedback-accuracy-2-missed-0-pose-inside-the-aim-circle",
    "aim-feedback-accuracy-2-missed-3-same-pose-outside-the-aim-circle",
    "differ",
  ],
  [
    "aim-feedback-accuracy-2-missed-3-same-pose-outside-the-aim-circle",
    "aim-feedback-accuracy-2-missed-31-same-pose-outside-the-aim-circle",
    "differ",
  ],
  // accuracy 8: the aim circle moves, the min_d set does not
  [
    "aim-feedback-accuracy-8-missed-0-pose-inside-the-aim-circle",
    "aim-feedback-accuracy-8-missed-31-same-pose-outside-the-aim-circle",
    "differ",
  ],
  [
    "aim-feedback-accuracy-8-missed-0-far-pose-precise-min-d",
    "aim-feedback-accuracy-8-missed-31-far-pose-sticks-unchanged",
    "equal",
  ],
  // accuracy -2: no miss term at all
  [
    "aim-feedback-accuracy-minus-2-missed-0-far-pose-base-min-d",
    "aim-feedback-accuracy-minus-2-missed-31-far-pose-sticks-unchanged",
    "equal",
  ],
  [
    "aim-feedback-accuracy-minus-2-missed-0-near-pose-inside-the-aim-circle",
    "aim-feedback-accuracy-minus-2-missed-31-near-pose-aim-circle-unchanged",
    "equal",
  ],
];

describe("pairs that differ only in missedShots", () => {
  const rows = loadAimFeedback();
  const sticks = (id: string): [number, number] => {
    const row = rows.find((entry) => entry.fixture.id === id);
    if (row === undefined) throw new Error(`no fixture ${id}`);
    const value = (field: string): number => {
      const check = row.fixture.checks.find(
        (c) => c.tick === 1 && c.field === field,
      );
      if (typeof check?.expected !== "number") {
        throw new Error(`${id} has no ${field} check`);
      }
      return check.expected;
    };
    return [value("stickRoll"), value("stickPitch")];
  };

  for (const [a, b, relation] of AIM_PAIRS) {
    it(`${a} vs ${b}: ${relation}`, () => {
      const rowA = rows.find((entry) => entry.fixture.id === a);
      const rowB = rows.find((entry) => entry.fixture.id === b);
      expect(rowA).toBeDefined();
      expect(rowB).toBeDefined();
      // a pair shares everything but missedShots (and the ids and derivation prose)
      expect(rowA?.fixture.self).toEqual(rowB?.fixture.self);
      expect(rowA?.fixture.bodies).toEqual(rowB?.fixture.bodies);
      expect(rowA?.fixture.stats).toEqual(rowB?.fixture.stats);
      expect(rowA?.weapon.missedShots).not.toBe(rowB?.weapon.missedShots);
      const [rollA, pitchA] = sticks(a);
      const [rollB, pitchB] = sticks(b);
      if (relation === "differ") {
        expect(
          Math.abs(rollA - rollB) + Math.abs(pitchA - pitchB),
          "the sticks must differ",
        ).toBeGreaterThan(1e-3);
      } else {
        expect(rollA).toBeCloseTo(rollB, 9);
        expect(pitchA).toBeCloseTo(pitchB, 9);
      }
    });
  }

  it("lists every aim-feedback fixture in at least one pair", () => {
    const paired = new Set(AIM_PAIRS.flatMap(([a, b]) => [a, b]));
    for (const row of rows) {
      expect(paired.has(row.fixture.id), row.fixture.id).toBe(true);
    }
  });
});
