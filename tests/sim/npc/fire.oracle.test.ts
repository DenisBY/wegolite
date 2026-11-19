// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The NPC fire gate, onTarget, the weapon heat and the missed-shot feedback
 * against the independent fire oracles (Phase 17, plan 17-04; ROADMAP criterion
 * 4): the gate fixtures (`gate.json`), the onTarget and aim-tolerance fixtures
 * (`on-target.json`), the float32 heat trajectories (`heat.json`) of plan
 * 17-01 and the `missedShots` aim-feedback fixtures (`aim-feedback.json`) of
 * plan 17-02.
 *
 * Expected values live in the fixture files and nothing here copies Wegolite
 * output into them. A failing fixture is an oracle dispute to record, never a
 * tolerance to widen. This file runs exactly its manifest entry
 * (`oracle-groups.ts`, `FIRE_ORACLE_GROUPS`) and asserts that the ids it ran
 * equal the ids of that entry.
 *
 * It also confirms the three fire rows of the frame-rate rule (cooling 2214-2218,
 * the shot timer 9946, the range roll 9949): `rate-rule.oracle.test.ts` resolves
 * fixtures only through `ORACLE_GROUPS` and keeps a `PORTED` list that never
 * names these lines, so the port-side confirmation lives here.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { LASER_STATS } from "../../../src/sim/combat/constants.js";
import type { LaserKey, MountKey } from "../../../src/sim/combat/mounts.js";
import { LASER_KEYS, NO_LASER } from "../../../src/sim/combat/mounts.js";
import { DT } from "../../../src/sim/time.js";
import { SCANNER_MAX_RANGE } from "../../../src/sim/npc/constants.js";
import {
  coolWeapon,
  heatWeapon,
  npcFireGate,
  npcOnTarget,
  npcRechargeTicks,
  onTargetCone,
} from "../../../src/sim/npc/fire.js";
import { currentAimTolerance } from "../../../src/sim/npc/target.js";
import { identity } from "../../../src/sim/math.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import type { Entity } from "../../../src/sim/world/entity.js";
import {
  literalShotFrames,
  rechargeRateF32,
} from "../../oracles/npc/fire/derive.js";
import {
  FireGateFileSchema,
  OnTargetFileSchema,
  WeaponHeatFileSchema,
} from "../../oracles/npc/fire/schema.js";
import type {
  FireGateFixture,
  FireWeapon,
  OnTargetFixture,
  WeaponHeatFixture,
} from "../../oracles/npc/fire/schema.js";
import { AimFeedbackFileSchema } from "../../oracles/npc/fire-sites/schema.js";
import type { AimFeedbackFixture } from "../../oracles/npc/fire-sites/schema.js";
import { FrameRateRuleSchema } from "../../oracles/npc/schema.js";
import { fireFixtureFilesFor } from "./oracle-groups.js";
import {
  createSyntheticView,
  emptyHooks,
  fromOolite,
  orientationFromFrame,
  runFixture,
} from "./oracle-runner.js";
import type { RunnerBody } from "./oracle-runner.js";

const THIS_FILE = "tests/sim/npc/fire.oracle.test.ts";
const FILES = fireFixtureFilesFor(THIS_FILE);

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

const GATE_FILE = "tests/oracles/npc/fire/fixtures/gate.json";
const ON_TARGET_FILE = "tests/oracles/npc/fire/fixtures/on-target.json";
const HEAT_FILE = "tests/oracles/npc/fire/fixtures/heat.json";
const AIM_FEEDBACK_FILE =
  "tests/oracles/npc/fire-sites/fixtures/aim-feedback.json";

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(`${REPO_ROOT}${path}`, "utf8")) as unknown;
}

const gateFixtures: readonly FireGateFixture[] = FireGateFileSchema.parse(
  readJson(GATE_FILE),
);
const onTargetFixtures: readonly OnTargetFixture[] = OnTargetFileSchema.parse(
  readJson(ON_TARGET_FILE),
);
const heatFixtures: readonly WeaponHeatFixture[] = WeaponHeatFileSchema.parse(
  readJson(HEAT_FILE),
);
const aimFeedbackFixtures: readonly AimFeedbackFixture[] =
  AimFeedbackFileSchema.parse(readJson(AIM_FEEDBACK_FILE));

const ran: string[] = [];

/** The ids of the fixtures of one fire fixture file. */
function idsOf(file: string): string[] {
  switch (file) {
    case GATE_FILE:
      return gateFixtures.map((fixture) => fixture.id);
    case ON_TARGET_FILE:
      return onTargetFixtures.map((fixture) => fixture.id);
    case HEAT_FILE:
      return heatFixtures.map((fixture) => fixture.id);
    case AIM_FEEDBACK_FILE:
      return aimFeedbackFixtures.map((entry) => entry.fixture.id);
    default:
      throw new Error(`fire.oracle.test.ts does not know the file ${file}`);
  }
}

function within(actual: number, expected: number, tolerance: number): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

/** The world tick the gate fixtures place "now" at, so 0 is never a shot tick. */
const NOW = 1000;

/* ---------------------------------------------------------------------------
 * The gate (gate.json)
 * ------------------------------------------------------------------------- */

describe(GATE_FILE, () => {
  for (const fixture of gateFixtures) {
    it(fixture.id, () => {
      ran.push(fixture.id);
      const laser: MountKey = fixture.weapon;
      const { input } = fixture;
      const lastShotTick = input.ticksSinceShot === null ? 0 : NOW;
      const tick =
        input.ticksSinceShot === null ? NOW : NOW + input.ticksSinceShot;
      let used = 0;
      const draw = (): number => {
        const value = fixture.draws[used];
        if (value === undefined) throw new Error("the gate drew too often");
        used += 1;
        return value;
      };
      let onTargetCalls = 0;
      const result = npcFireGate(
        {
          temperature: input.temperature,
          energy: input.energy,
          tick,
          lastShotTick,
          laser,
          accuracy: input.accuracy,
          range: input.range,
          onTarget: () => {
            onTargetCalls += 1;
            return input.onTarget;
          },
        },
        draw,
      );

      const { expected } = fixture;
      expect(result.kind === "fired").toBe(expected.fired);
      expect(used).toBe(expected.drawsUsed);
      if (result.kind === "refused") {
        expect(result.reason).toBe(expected.refusedAt);
        expect(result.drew).toBe(expected.drawsUsed === 1);
      } else {
        expect(expected.refusedAt).toBeNull();
      }
      // onTarget is evaluated only after the draw, the roll and the range.
      const reachedOnTarget =
        result.kind === "fired" ||
        (result.kind === "refused" &&
          (result.reason === "onTarget" || result.reason === "noWeapon"));
      expect(onTargetCalls).toBe(reachedOnTarget ? 1 : 0);

      // The caller's side of a fired shot (9968-9973): cost, heat, the timer.
      let energyAfter = input.energy;
      let temperatureAfter = input.temperature;
      let lastShotAfter = lastShotTick;
      if (result.kind === "fired") {
        if (laser === NO_LASER) throw new Error("an unarmed shot fired");
        const stats = LASER_STATS[laser];
        energyAfter = input.energy - stats.energy;
        temperatureAfter = heatWeapon(input.temperature, stats.shotTemperature);
        lastShotAfter = tick;
      }
      expect(within(energyAfter, expected.energyAfter, fixture.tolerance)).toBe(
        true,
      );
      expect(
        within(temperatureAfter, expected.temperatureAfter, fixture.tolerance),
      ).toBe(true);
      expect(lastShotAfter === tick && result.kind === "fired").toBe(
        expected.shotTimerReset,
      );
      if (result.kind === "fired") {
        // The reset timer refuses the same tick with no draw.
        const again = npcFireGate(
          {
            temperature: 0,
            energy: 1e9,
            tick,
            lastShotTick: lastShotAfter,
            laser,
            accuracy: input.accuracy,
            range: input.range,
            onTarget: () => input.onTarget,
          },
          () => {
            throw new Error("the timer refusal takes no draw");
          },
        );
        expect(again).toEqual({
          kind: "refused",
          reason: "timer",
          drew: false,
        });
      }
    });
  }
});

/* ---------------------------------------------------------------------------
 * onTarget and the aim tolerance (on-target.json)
 * ------------------------------------------------------------------------- */

function shooterFor(fixture: OnTargetFixture): Entity {
  const { input } = fixture;
  const result = spawnEntity(
    createWorld(1),
    {
      kind: "ship",
      specKey: fixture.id,
      scanClass: "CLASS_NEUTRAL",
      position: fromOolite(input.position),
      orientation: orientationFromFrame(input.forward, input.up, input.right),
      radius: 10,
    },
    0,
  );
  if (!result.ok) throw new Error("spawn refused");
  result.entity.steer.accuracy = input.accuracy;
  result.entity.weapon.missedShots = input.missedShots;
  return result.entity;
}

describe(ON_TARGET_FILE, () => {
  for (const fixture of onTargetFixtures) {
    it(fixture.id, () => {
      ran.push(fixture.id);
      const { input, expected } = fixture;
      const shooter = shooterFor(fixture);

      const tolerance = currentAimTolerance(shooter);
      expect(within(tolerance, expected.aimTolerance, fixture.tolerance)).toBe(
        true,
      );

      // The cone alone, with the fixture's aim point and radius.
      const cone = onTargetCone(
        shooter.position,
        shooter.orientation,
        fromOolite(input.aimPoint),
        input.targetRadius,
        tolerance,
      );

      // The whole reader: a target body at the aim point (no tracking curve is
      // started, so calculateTargetPosition is the target's position), or none.
      const bodies: RunnerBody[] = input.targetPresent
        ? [
            {
              id: 102,
              kind: "ship",
              scanClass: "CLASS_NEUTRAL",
              radius: input.targetRadius,
              mass: 0,
              position: fromOolite(input.aimPoint),
              orientation: identity(),
              speed: 0,
              behaviour: "IDLE",
              targetId: 0,
            },
          ]
        : [];
      shooter.nav.targetId = input.targetPresent ? 102 : 0;
      const view = createSyntheticView(bodies, shooter, 1);
      const whole = npcOnTarget(shooter, view, 1);

      if (input.targetPresent) {
        expect(cone).toBe(expected.onTarget);
        expect(whole).toBe(expected.onTarget);
      } else {
        expect(expected.onTarget).toBe(false);
        expect(whole).toBe(false);
      }
    });
  }
});

/* ---------------------------------------------------------------------------
 * Heat and cooling (heat.json)
 * ------------------------------------------------------------------------- */

describe(HEAT_FILE, () => {
  for (const fixture of heatFixtures) {
    it(fixture.id, () => {
      ran.push(fixture.id);
      const laser: LaserKey = fixture.weapon;
      const stats = LASER_STATS[laser];
      let temperature = fixture.startTemperature;
      // The fixture's tick 1 is world tick NOW + 1; the last shot is placed so
      // that startTicksSinceShot ticks have passed at tick 1 (null: never).
      let lastShotTick =
        fixture.startTicksSinceShot === null
          ? 0
          : NOW + 1 - fixture.startTicksSinceShot;
      let draws = 0;
      const shotTicks: number[] = [];
      const reads = new Map<number, number>();
      let firstRefusal: number | null = null;
      let firstResume: number | null = null;

      for (let t = 1; t <= fixture.horizon; t += 1) {
        // The cooling of the top of every update; the stated start is the read
        // at tick 1 itself.
        if (t > 1) temperature = coolWeapon(temperature, DT);
        reads.set(t, temperature);
        const result = npcFireGate(
          {
            temperature,
            energy: 1e9,
            tick: NOW + t,
            lastShotTick,
            laser,
            accuracy: 0,
            range: 0,
            onTarget: () => true,
          },
          () => {
            draws += 1;
            return 0.5;
          },
        );
        if (result.kind === "fired") {
          shotTicks.push(t);
          temperature = heatWeapon(temperature, stats.shotTemperature);
          lastShotTick = NOW + t;
          if (firstRefusal !== null && firstResume === null) firstResume = t;
        } else if (result.reason === "heat" && firstRefusal === null) {
          firstRefusal = t;
        }
      }

      const { expected } = fixture;
      expect(shotTicks).toEqual(expected.shotTicks);
      for (const check of expected.temperatureChecks) {
        const actual = reads.get(check.tick);
        expect(actual, `tick ${String(check.tick)}`).toBeDefined();
        expect(
          within(actual ?? Number.NaN, check.temperature, fixture.tolerance),
          `tick ${String(check.tick)}: ${String(actual)} vs ${String(check.temperature)}`,
        ).toBe(true);
      }
      expect(firstRefusal).toBe(expected.firstHeatRefusalTick);
      expect(firstResume).toBe(expected.firstResumeTick);
      expect(draws).toBe(expected.drawsUsed);
    });
  }
});

/* ---------------------------------------------------------------------------
 * The missed-shot feedback (aim-feedback.json), through the runner
 * ------------------------------------------------------------------------- */

describe(AIM_FEEDBACK_FILE, () => {
  for (const entry of aimFeedbackFixtures) {
    it(entry.fixture.id, () => {
      ran.push(entry.fixture.id);
      if (entry.fixture.stats.scannerRange !== SCANNER_MAX_RANGE) {
        throw new Error(
          `oracle dispute: ${entry.fixture.id} has scannerRange ${String(entry.fixture.stats.scannerRange)}`,
        );
      }
      const hooks = emptyHooks();
      hooks.afterAssign.push(({ self }) => {
        self.weapon.missedShots = entry.weapon.missedShots;
      });
      const result = runFixture(entry.fixture, hooks);
      expect(result.failures).toEqual([]);
      expect(result.checks).toBe(entry.fixture.checks.length);
    });
  }
});

/* ---------------------------------------------------------------------------
 * The frame-rate rows of the fire port
 * ------------------------------------------------------------------------- */

const rule = FrameRateRuleSchema.parse(
  readJson("tests/oracles/npc/frame-rate-rule.json"),
);

const FIRE_ROWS = [
  "src/Core/Entities/ShipEntity.m:2214-2218",
  "src/Core/Entities/ShipEntity.m:9946-9946",
  "src/Core/Entities/ShipEntity.m:9949-9949",
] as const;

describe("the fire rows of the frame-rate rule", () => {
  const fixtureIds = new Set(FILES.flatMap((file) => idsOf(file)));

  it.each(FIRE_ROWS)("%s is confirmed by fixtures this file runs", (site) => {
    const row = rule.rows.find((candidate) => candidate.oolite === site);
    expect(row, site).toBeDefined();
    expect(row?.confirmedBy.length, site).toBeGreaterThan(0);
    for (const id of row?.confirmedBy ?? []) {
      expect(
        fixtureIds.has(id),
        `${site}: ${id} is a fixture of this file`,
      ).toBe(true);
      expect(ran, `${site}: ${id} ran`).toContain(id);
    }
  });

  it("the shot-timer row records no divergence and names the revision", () => {
    const row = rule.rows.find(
      (candidate) => candidate.oolite === FIRE_ROWS[1],
    );
    expect(row?.treatment).toMatch(/revised by the owner 2026-11-19/);
    expect(row?.treatment).not.toMatch(/\bDIVERGENCE\b/);
    expect(row?.measuredDifference).toBe(0);
  });

  // The port's loop is a copy of the oracle's, so this catches the two drifting
  // apart, not a misreading they share; the independent pin of the counts is
  // the hand-derived literals in tests/sim/npc/fire.test.ts.
  it.each([...LASER_KEYS, NO_LASER] as const)(
    "npcRechargeTicks(%s) has not drifted from the oracle's literal frame count",
    (laser) => {
      const weapon: FireWeapon = laser === NO_LASER ? "EQ_WEAPON_NONE" : laser;
      expect(npcRechargeTicks(laser)).toBe(
        literalShotFrames(rechargeRateF32(weapon)),
      );
    },
  );
});

describe("the manifest entry", () => {
  it("runs exactly the fixtures of its files", () => {
    const expected: string[] = [];
    for (const file of FILES) expected.push(...idsOf(file));
    expect(expected.length).toBeGreaterThan(0);
    expect([...ran].sort()).toEqual(expected.sort());
  });

  it("the entry holds the four fire files this plan consumes", () => {
    expect([...FILES].sort()).toEqual(
      [GATE_FILE, ON_TARGET_FILE, HEAT_FILE, AIM_FEEDBACK_FILE].sort(),
    );
    expect(gateFixtures.length).toBeGreaterThanOrEqual(33);
    expect(onTargetFixtures.length).toBeGreaterThanOrEqual(23);
    expect(heatFixtures.length).toBeGreaterThanOrEqual(7);
    expect(aimFeedbackFixtures.length).toBeGreaterThanOrEqual(17);
  });
});
