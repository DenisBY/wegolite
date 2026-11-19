// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The NPC fire gate and its helpers are total (CBT-15, Phase 17 plan 17-04,
 * D-17, Pitfall 16, T-17-08, T-17-09, T-17-10, T-17-27). Combat sits outside AI
 * fault containment and has no try/catch, so a bad number must never throw
 * and must never reach the hash as a non-finite value.
 *
 * For any doubles, including NaN, the infinities, negatives and 1e308:
 * `npcFireGate`, `npcFireBlocked`, `onTargetCone`, `npcOnTarget`,
 * `rangeToTargetIn`, `coolWeapon`, `heatWeapon` and `adjustMissedShots` never
 * throw; with finite inputs they return finite numbers; the gate takes at most
 * one draw; `coolWeapon` stays in `[0, MAX_WEAPON_TEMPERATURE]` as a float32
 * value; `adjustMissedShots` stays a whole number in `[0, MAX_UINT32]`. The
 * entity properties run on generated entities whose `nav.targetId` is drawn
 * from its own id, none, a missing id, a planet and a live ship, and the self
 * target gives range 0 and no fire.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { LASER_KEYS, NO_LASER } from "../../../src/sim/combat/mounts.js";
import type { MountKey } from "../../../src/sim/combat/mounts.js";
import { quat, vec } from "../../../src/sim/math.js";
import {
  adjustMissedShots,
  coolWeapon,
  heatWeapon,
  npcFireBlocked,
  npcFireGate,
  npcOnTarget,
  onTargetCone,
} from "../../../src/sim/npc/fire.js";
import { PLAYER_COLLISION_RADIUS_M } from "../../../src/sim/npc/stats.js";
import { rangeToTargetIn } from "../../../src/sim/npc/target.js";
import {
  MAX_ENTITY_MAGNITUDE,
  MAX_UINT32,
  MAX_WEAPON_TEMPERATURE,
} from "../../../src/sim/world/limits.js";
import { createWorldView } from "../../../src/sim/world/view-impl.js";
import { createWorld } from "../../../src/sim/world/world.js";
import { layout, playerAt, spawnShip } from "./world-support.js";

/** Any double: NaN, the infinities, negatives, subnormals and 1e308 included. */
const anyDouble = fc.oneof(
  fc.double(),
  fc.constantFrom(
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    1e308,
    -1e308,
    0,
    -0,
    Number.MIN_VALUE,
  ),
);

/** A finite double of any magnitude. */
const finiteDouble = fc.double({ noNaN: true, noDefaultInfinity: true });

const mounts: readonly MountKey[] = [...LASER_KEYS, NO_LASER];
const anyMount = fc.constantFrom(...mounts);

/** A draw value the gate might meet: a unit value or anything at all. */
const anyDraw = fc.oneof(fc.double({ min: 0, max: 1 }), anyDouble);

const anyTick = fc.oneof(fc.integer({ min: 0, max: MAX_UINT32 }), anyDouble);

function countingDraw(value: number): {
  draw: () => number;
  count: () => number;
} {
  let calls = 0;
  return {
    draw: () => {
      calls += 1;
      return value;
    },
    count: () => calls,
  };
}

describe("npcFireGate is total and takes at most one draw (T-17-08, T-17-10)", () => {
  it("never throws, draws at most once and reports the draw it took, for any numbers", () => {
    fc.assert(
      fc.property(
        anyDouble, // temperature
        anyDouble, // energy
        anyTick, // tick
        anyTick, // lastShotTick
        anyMount,
        anyDouble, // accuracy
        anyDouble, // range
        fc.boolean(), // onTarget
        anyDraw,
        (
          temperature,
          energy,
          tick,
          lastShotTick,
          laser,
          accuracy,
          range,
          onTarget,
          drawValue,
        ) => {
          const stub = countingDraw(drawValue);
          let onTargetCalls = 0;
          const result = npcFireGate(
            {
              temperature,
              energy,
              tick,
              lastShotTick,
              laser,
              accuracy,
              range,
              onTarget: () => {
                onTargetCalls += 1;
                return onTarget;
              },
            },
            stub.draw,
          );
          expect(stub.count()).toBeLessThanOrEqual(1);
          expect(onTargetCalls).toBeLessThanOrEqual(1);
          if (result.kind === "refused") {
            expect(result.drew).toBe(stub.count() === 1);
            if (
              result.reason === "unresolved" ||
              result.reason === "heat" ||
              result.reason === "energy" ||
              result.reason === "timer"
            ) {
              expect(stub.count()).toBe(0);
            } else {
              expect(stub.count()).toBe(1);
            }
          } else {
            expect(stub.count()).toBe(1);
            expect(onTargetCalls).toBe(1);
            expect(laser).not.toBe(NO_LASER);
          }
        },
      ),
      { numRuns: 2000 },
    );
  });

  it("a non-finite accuracy, temperature or energy never fires and never draws", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY),
        anyMount,
        finiteDouble,
        fc.integer({ min: 1, max: MAX_UINT32 }),
        (bad, laser, other, tick) => {
          for (const input of [
            { accuracy: bad, temperature: 0, energy: 100 },
            { accuracy: 3, temperature: bad, energy: 100 },
            { accuracy: 3, temperature: 0, energy: bad },
          ]) {
            const stub = countingDraw(0.5);
            const result = npcFireGate(
              {
                ...input,
                tick,
                lastShotTick: 0,
                laser,
                range: Math.abs(other) % 1000,
                onTarget: () => true,
              },
              stub.draw,
            );
            expect(result.kind).toBe("refused");
            expect(stub.count()).toBe(0);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("onTargetCone is total", () => {
  it("never throws for any numbers and answers a boolean", () => {
    fc.assert(
      fc.property(
        fc.tuple(anyDouble, anyDouble, anyDouble),
        fc.tuple(anyDouble, anyDouble, anyDouble, anyDouble),
        fc.tuple(anyDouble, anyDouble, anyDouble),
        anyDouble,
        anyDouble,
        (position, orientation, aimPoint, radius, aim) => {
          const answer = onTargetCone(
            vec(...position),
            quat(...orientation),
            vec(...aimPoint),
            radius,
            aim,
          );
          expect(typeof answer).toBe("boolean");
        },
      ),
      { numRuns: 1000 },
    );
  });
});

describe("the weapon-state updates are total and bounded (T-17-09)", () => {
  it("coolWeapon never throws, stays a float32 value in [0, MAX_WEAPON_TEMPERATURE] and is never -0", () => {
    fc.assert(
      fc.property(anyDouble, anyDouble, (temperature, dt) => {
        const cooled = coolWeapon(temperature, dt);
        expect(Number.isFinite(cooled)).toBe(true);
        expect(cooled).toBeGreaterThanOrEqual(0);
        expect(cooled).toBeLessThanOrEqual(MAX_WEAPON_TEMPERATURE);
        expect(Math.fround(cooled)).toBe(cooled);
        expect(Object.is(cooled, -0)).toBe(false);
      }),
      { numRuns: 1000 },
    );
  });

  it("coolWeapon with a positive step never raises a finite temperature", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: MAX_WEAPON_TEMPERATURE, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (temperature, dt) => {
          expect(coolWeapon(temperature, dt)).toBeLessThanOrEqual(
            Math.fround(temperature),
          );
        },
      ),
      { numRuns: 500 },
    );
  });

  it("heatWeapon never throws, stays a float32 value in [0, MAX_WEAPON_TEMPERATURE] and is never -0", () => {
    fc.assert(
      fc.property(anyDouble, anyDouble, (temperature, shot) => {
        const heated = heatWeapon(temperature, shot);
        expect(Number.isFinite(heated)).toBe(true);
        expect(heated).toBeGreaterThanOrEqual(0);
        expect(heated).toBeLessThanOrEqual(MAX_WEAPON_TEMPERATURE);
        expect(Math.fround(heated)).toBe(heated);
        expect(Object.is(heated, -0)).toBe(false);
      }),
      { numRuns: 1000 },
    );
  });

  it("adjustMissedShots never throws and answers a whole number in [0, MAX_UINT32], never -0", () => {
    fc.assert(
      fc.property(anyDouble, anyDouble, (current, delta) => {
        const next = adjustMissedShots(current, delta);
        expect(Number.isInteger(next)).toBe(true);
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThanOrEqual(MAX_UINT32);
        expect(Object.is(next, -0)).toBe(false);
      }),
      { numRuns: 1000 },
    );
  });

  it("adjustMissedShots by +1 and -1 on a counter in range moves it by exactly one and floors at 0", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_UINT32 }), (current) => {
        expect(adjustMissedShots(current, 1)).toBe(
          Math.min(current + 1, MAX_UINT32),
        );
        expect(adjustMissedShots(current, -1)).toBe(Math.max(current - 1, 0));
      }),
      { numRuns: 500 },
    );
  });
});

type TargetChoice = "self" | "none" | "missing" | "planet" | "ship";
const TARGET_CHOICES: readonly TargetChoice[] = [
  "self",
  "none",
  "missing",
  "planet",
  "ship",
];

describe("the entity readers are total, a self target is no target (D-17, Pitfall 16, T-17-27)", () => {
  const position = fc.oneof(
    fc.double({ min: -1e6, max: 1e6, noNaN: true }),
    fc.double({
      min: -MAX_ENTITY_MAGNITUDE,
      max: MAX_ENTITY_MAGNITUDE,
      noNaN: true,
    }),
  );
  const orientation = fc
    .tuple(
      fc.double({ min: -1, max: 1, noNaN: true }),
      fc.double({ min: -1, max: 1, noNaN: true }),
      fc.double({ min: -1, max: 1, noNaN: true }),
      fc.double({ min: -1, max: 1, noNaN: true }),
    )
    .map(([w, x, y, z]) => {
      const norm = Math.hypot(w, x, y, z);
      return norm < 1e-6
        ? quat(1, 0, 0, 0)
        : quat(w / norm, x / norm, y / norm, z / norm);
    });

  it("rangeToTargetIn, npcOnTarget and npcFireBlocked never throw, the range is finite and a self target gives 0 and false", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...TARGET_CHOICES),
        fc.tuple(position, position, position),
        fc.tuple(position, position, position),
        orientation,
        orientation,
        fc.double({ min: -5, max: 10, noNaN: true }),
        fc.integer({ min: 0, max: MAX_UINT32 }),
        fc.boolean(), // has an AI
        fc.integer({ min: 1, max: MAX_UINT32 }),
        (
          choice,
          selfPosition,
          otherPosition,
          selfOrientation,
          otherOrientation,
          accuracy,
          missedShots,
          steered,
          tick,
        ) => {
          const world = createWorld(1);
          const player = playerAt();
          const self = spawnShip(world, {
            specKey: "viper",
            position: vec(...selfPosition),
            orientation: selfOrientation,
            radius: 40,
            steered,
          });
          const other = spawnShip(world, {
            specKey: "thargoid",
            position: vec(...otherPosition),
            orientation: otherOrientation,
            radius: 30,
            steered: true,
          });
          self.steer.accuracy = accuracy;
          self.weapon.missedShots = missedShots;
          const view = createWorldView(
            world,
            player,
            layout,
            PLAYER_COLLISION_RADIUS_M,
          );
          const ids: Record<TargetChoice, number> = {
            self: self.id,
            none: 0,
            missing: 987654,
            planet: view.mainPlanet(),
            ship: other.id,
          };
          self.nav.targetId = ids[choice];

          const range = rangeToTargetIn(self, view);
          const aimed = npcOnTarget(self, view, tick);
          const blocked = npcFireBlocked(self);

          expect(Number.isFinite(range)).toBe(true);
          expect(typeof aimed).toBe("boolean");
          if (choice === "self" || choice === "none") {
            expect(range).toBe(0);
            expect(aimed).toBe(false);
          }
          if (choice === "planet" || choice === "missing") {
            expect(range).toBe(0);
            expect(aimed).toBe(false);
          }
          expect(blocked).toBe(
            !steered ? "noAi" : choice === "self" ? "selfTarget" : null,
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  it("the gate fed by the readers on a self target never draws when the caller blocks first", () => {
    fc.assert(
      fc.property(
        position,
        fc.double({ min: -5, max: 10, noNaN: true }),
        (selfPosition, accuracy) => {
          const world = createWorld(1);
          const self = spawnShip(world, {
            specKey: "viper",
            position: vec(selfPosition, 0, 0),
            radius: 40,
            steered: true,
          });
          self.steer.accuracy = accuracy;
          self.nav.targetId = self.id;
          const stub = countingDraw(0.5);
          // The drain's order (plan 17-05): the blocked check comes first.
          if (npcFireBlocked(self) === null) {
            npcFireGate(
              {
                temperature: 0,
                energy: 100,
                tick: 10,
                lastShotTick: 0,
                laser: "EQ_WEAPON_BEAM_LASER",
                accuracy,
                range: 0,
                onTarget: () => true,
              },
              stub.draw,
            );
          }
          expect(stub.count()).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
