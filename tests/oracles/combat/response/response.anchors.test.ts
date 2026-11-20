// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Hand anchors for the response oracle branches the self test leaves to the
 * generated fixtures (Phase 18 code review WR-02).
 *
 * `fixtures/*.json` were produced by a scratch script that imports
 * `reference.ts`, and `response.self.test.ts` re-derives them through the same
 * function, so that check is circular. Each anchor here works one branch from
 * the quoted Oolite C (pin `7437f22`, `/home/opencode/git/oolite/src/`) with
 * explicit `Math.fround` steps, never by calling `reference.ts`, and then
 * requires: hand value === fixture value === `reference.ts` output.
 *
 * Still open (out of scope here): the fixture generator is not committed, so a
 * regeneration is not reviewable as a diff.
 *
 * Nothing here reads Wegolite code or the Oolite checkout.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  blastReference,
  collideWithShipReference,
  npcBrakeReference,
  playerBrakeReference,
  playerScrapeReference,
} from "./reference.js";
import {
  BLAST_FIXTURE_FILE,
  BRAKING_NPC_FIXTURE_FILE,
  BRAKING_PLAYER_FIXTURE_FILE,
  BlastFileSchema,
  BrakingFileSchema,
  COLLIDE_FIXTURE_FILE,
  CollideFileSchema,
  SCRAPE_FIXTURE_FILE,
  ScrapeFileSchema,
} from "./schema.js";

const HERE = fileURLToPath(new URL("./", import.meta.url));
const f = Math.fround;
const DT = 1 / 120;

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(`${HERE}${name}`, "utf8"));
}

function byId<T extends { readonly id: string }>(
  list: readonly T[],
  id: string,
): T {
  const found = list.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no fixture ${id}`);
  return found;
}

const playerBraking = (id: string) =>
  byId(BrakingFileSchema.parse(readJson(BRAKING_PLAYER_FIXTURE_FILE)), id);
const npcBraking = (id: string) =>
  byId(BrakingFileSchema.parse(readJson(BRAKING_NPC_FIXTURE_FILE)), id);

/** `magnitude` (OOVector.h:242-245): sqrt of the float magnitude2, as float. */
function magnitudeHand(v: readonly number[]): number {
  const m2 = f(f(f(v[0]! * v[0]!) + f(v[1]! * v[1]!)) + f(v[2]! * v[2]!));
  return f(Math.sqrt(m2));
}

const speedOf = (v: readonly number[]): number =>
  Math.sqrt(v[0]! * v[0]! + v[1]! * v[1]! + v[2]! * v[2]!);

describe("player braking hand anchors (PlayerEntity.m:3372-3405)", () => {
  // PlayerEntity.m:3346-3348
  //   #define VELOCITY_CLEANUP_MIN 2000.0f
  //   #define VELOCITY_CLEANUP_FULL 5000.0f
  //   #define VELOCITY_CLEANUP_RATE 0.001f
  // PlayerEntity.m:3387-3404
  //   GLfloat velmag = magnitude(velocity);
  //   GLfloat velmag2 = velmag - (float)delta_t * thrust * thrust_factor;
  //   if (velmag > 0) {
  //     if (velmag > VELOCITY_CLEANUP_MIN) {
  //       GLfloat rate;
  //       if (velmag > VELOCITY_CLEANUP_FULL) rate = VELOCITY_CLEANUP_RATE;
  //       else rate = (velmag - VELOCITY_CLEANUP_MIN) /
  //         (VELOCITY_CLEANUP_FULL - VELOCITY_CLEANUP_MIN) * VELOCITY_CLEANUP_RATE;
  //       velmag2 -= velmag * rate;
  //     }
  //     if (velmag2 < 0.0f) velocity = kZeroVector;
  //     else velocity = vector_multiply_scalar(velocity, velmag2 / velmag);
  //   }

  it("cleanup band: tick 1 of a 3000 m/s drift loses 1.2666015625 m/s", () => {
    const fixture = playerBraking("brake-player-cleanup-band");
    // velocity (1800, 0, 2400): magnitude2 = f(3240000 + 5760000) = 9e6,
    // velmag = f(sqrt) = 3000 exactly.
    const velmag = magnitudeHand([1800, 0, 2400]);
    expect(velmag).toBe(3000);
    // (float)dt x thrust 32 x thrust_factor 1 (flightSpeed 0 <= 350).
    const perTick = f(f(f(DT) * 32) * 1);
    expect(perTick).toBe(0.2666666805744171);
    let velmag2 = f(velmag - perTick); // 2999.7333984375 (float ulp 2^-12)
    expect(velmag2).toBe(2999.7333984375);
    // 2000 < 3000 <= 5000: rate = f(f(f(3000 - 2000) / 3000) x 0.001f).
    const rate = f(f(f(velmag - f(2000)) / f(f(5000) - f(2000))) * f(0.001));
    expect(rate).toBe(0.0003333333588670939);
    const cleanup = f(velmag * rate); // 1.0000001192092896
    expect(cleanup).toBe(1.0000001192092896);
    velmag2 = f(velmag2 - cleanup);
    expect(velmag2).toBe(2998.7333984375);
    // The loss is 1.2666015625, not the real-number 0.26667 + 1.0000001:
    // velmag2 sits on the 2^-12 float grid near 3000 and rounds twice.
    const handLoss = velmag - velmag2;
    expect(handLoss).toBe(1.2666015625);
    // Tick-1 speed: velocity x f(velmag2 / velmag), components rounded.
    const s = f(velmag2 / velmag);
    const handSpeed1 = speedOf([f(1800 * s), 0, f(2400 * s)]);
    expect(handSpeed1).toBe(2998.7335205078125);

    expect(fixture.expected.firstTickLoss).toBe(handLoss);
    expect(fixture.expected.samples[0]).toEqual({ tick: 1, speed: handSpeed1 });
    const ref = playerBrakeReference(fixture);
    expect(ref.firstTickLoss).toBe(handLoss);
    expect(ref.samples[0]?.speed).toBe(handSpeed1);
  });

  it("torus factor 32: perTickLoss, tick-1 loss, stopTick and positionChange", () => {
    const fixture = playerBraking("brake-player-torus-32");
    // PlayerEntity.m:3378-3385: flightSpeed 11200 > maxFlightSpeed 350 and no
    // afterburner -> thrust_factor = HYPERSPEED_FACTOR (32 here).
    expect(fixture.speed! > fixture.maxSpeed!).toBe(true);
    const perTick = f(f(f(DT) * 32) * 32);
    expect(perTick).toBe(8.533333778381348);
    // Tick 1: velmag 200, velmag2 = f(200 - 8.5333338) = 191.46665954589844.
    expect(f(200 - perTick)).toBe(191.46665954589844);
    const handLoss = 200 - f(200 - perTick);
    // 8.533340454101562 (written as the difference: the literal trips
    // no-loss-of-precision although it round-trips)
    expect(handLoss).toBe(200 - 191.46665954589844);

    // The whole run, transliterated from the C above: applyVelocity: first
    // (3376; Entity.m:878-881 position += velocity x dt, in double), then
    // the brake (no cleanup term: velmag <= 2000).
    let v = [0, 0, -200];
    let p = [0, 0, 0];
    let stopTick: number | null = null;
    for (let tick = 1; tick <= fixture.ticks; tick += 1) {
      const moving = speedOf(v) > 0;
      p = p.map((x, i) => x + v[i]! * DT);
      const velmag = magnitudeHand(v);
      if (velmag > 0) {
        const velmag2 = f(velmag - perTick);
        v = velmag2 < 0 ? [0, 0, 0] : v.map((x) => f(x * f(velmag2 / velmag)));
      }
      if (moving && stopTick === null && speedOf(v) === 0) stopTick = tick;
    }
    // 200 / 8.5333 = 23.44: tick 24 is the first whose velmag2 goes negative.
    expect(stopTick).toBe(24);
    expect(p[2]).toBe(-20.37332457502683);

    const e = fixture.expected;
    expect(e.perTickLoss).toBe(perTick);
    expect(e.firstTickLoss).toBe(handLoss);
    expect(e.stopTick).toBe(stopTick);
    expect(e.positionChange[2]).toBe(p[2]);
    const ref = playerBrakeReference(fixture);
    expect(ref.perTickLoss).toBe(perTick);
    expect(ref.firstTickLoss).toBe(handLoss);
    expect(ref.stopTick).toBe(stopTick);
    expect(ref.positionChange[2]).toBe(p[2]);
  });
});

describe("NPC braking hand anchor: the fmaxf clamp (ShipEntity.m:5808-5823)", () => {
  // ShipEntity.m:5810  GLfloat dt_thrust = SHIP_THRUST_FACTOR * thrust * delta_t;
  // ShipEntity.m:5816-5822
  //   if (thrust) {
  //     GLfloat velmag = magnitude(velocity);
  //     if (velmag) {
  //       GLfloat vscale = fmaxf((velmag - dt_thrust) / velmag, 0.0f);
  //       scale_vector(&velocity, vscale);
  //     }
  //   }
  it("a 1.43e-5 m/s residue is clamped to 0, not flipped by vscale -291270", () => {
    const fixture = npcBraking("brake-ship-buoy-thrust-100-from-100");
    const dtThrust = f(f(5 * f(100)) * DT);
    expect(dtThrust).toBe(4.166666507720947);
    const residue = 1.430511474609375e-5; // the fixture's speed at tick 24
    expect(fixture.expected.samples.find((s) => s.tick === 24)?.speed).toBe(
      residue,
    );
    const raw = f(f(residue - dtThrust) / residue);
    expect(raw).toBe(-291270.09375); // what an unclamped port would scale by
    expect(Math.max(raw, 0)).toBe(0);

    // The whole run: brake first (processBehaviour, 2415), then move
    // ([super update:], 2462; Entity.m:878-881).
    let v = [0, 0, 100];
    let p = [0, 0, 0];
    let stopTick: number | null = null;
    for (let tick = 1; tick <= fixture.ticks; tick += 1) {
      const moving = speedOf(v) > 0;
      const velmag = magnitudeHand(v);
      if (velmag !== 0) {
        const vscale = Math.max(f(f(velmag - dtThrust) / velmag), 0);
        v = v.map((x) => f(x * vscale));
      }
      p = p.map((x, i) => x + v[i]! * DT);
      if (moving && stopTick === null && speedOf(v) === 0) stopTick = tick;
    }
    expect(stopTick).toBe(25);
    expect(p[2]).toBe(9.583335928122201);

    expect(fixture.expected.stopTick).toBe(stopTick);
    expect(fixture.expected.positionChange[2]).toBe(p[2]);
    expect(fixture.expected.samples.find((s) => s.tick === 25)?.speed).toBe(0);
    const ref = npcBrakeReference(fixture);
    expect(ref.stopTick).toBe(stopTick);
    expect(ref.positionChange[2]).toBe(p[2]);
  });
});

describe("player scrape hand anchors (PlayerEntity.m:5701-5744)", () => {
  // PlayerEntity.m:5710-5713  if (amount < 0) { ...; amount = -amount; }
  // PlayerEntity.m:5720  d_forward = dot_product(HPVectorToVector(rel_pos), v_forward);
  // PlayerEntity.m:5726-5742
  //   if (d_forward >= 0) { forward_shield -= amount;
  //     if (forward_shield < 0.0) { amount = -forward_shield; forward_shield = 0.0f; }
  //     else amount = 0.0;
  //   } else { aft_shield -= amount; (same) }
  // PlayerEntity.m:5744  [super takeScrapeDamage:amount from:ent];
  //   -> ShipEntity.m:11651 energy -= amount (GLfloat)
  const scrapes = () => ScrapeFileSchema.parse(readJson(SCRAPE_FIXTURE_FILE));

  it("aft overflow: 50 from behind empties aft 20, 30 reaches energy", () => {
    const fixture = byId(scrapes(), "scrape-aft-overflow-from-behind");
    // rel (0, 10, -100) . forward (0, 0, 1) = f(f(0 + 0) + -100) = -100 < 0.
    const dForward = f(f(f(0 * 0) + f(10 * 0)) + f(-100 * 1));
    expect(dForward).toBe(-100);
    const aftAfter = f(f(20) - 50); // -30 < 0
    const remainder = -aftAfter; // 30
    const want = {
      dForward,
      shieldHit: "aft",
      shields: { forward: 128, aft: 0 },
      remainder,
      energy: f(200 - remainder),
      heatChange: 0,
    };
    expect(want.energy).toBe(170);
    expect(fixture.expected).toEqual(want);
    expect(playerScrapeReference(fixture)).toEqual(want);
  });

  it("negative amount: -15 is made 15 before the forward shield", () => {
    const fixture = byId(scrapes(), "scrape-negative-amount-made-positive");
    const amount = -fixture.amount; // 5710-5713
    expect(amount).toBe(15);
    const dForward = f(f(f(0 * 0) + f(0 * 0)) + f(50 * 1)); // 50 >= 0
    const forwardAfter = f(f(10) - amount); // -5
    const remainder = -forwardAfter; // 5
    const want = {
      dForward,
      shieldHit: "forward",
      shields: { forward: 0, aft: 128 },
      remainder,
      energy: f(256 - remainder),
      heatChange: 0,
    };
    expect(want.remainder).toBe(5);
    expect(want.energy).toBe(251);
    expect(fixture.expected).toEqual(want);
    expect(playerScrapeReference(fixture)).toEqual(want);
  });
});

describe("blast hand anchor: the unfloored d2 (ShipEntity.m:7680-7698)", () => {
  // ShipEntity.m:8124-8125
  //   desired_range = collision_radius * 2.5f;
  //   [self dealMomentumWithinDesiredRange:0.125f * mass];
  // ShipEntity.m:7685-7692
  //   Vector p2 = [self vectorTo:e2];
  //   double ecr = [e2 collisionRadius];
  //   double d2 = magnitude2(p2) - ecr * ecr;
  //   if (d2 < 0.1) { d2 = 0.1; }
  //   double moment = amount * desired_range / d2;
  //   [e2 addImpactMoment:vector_normal(p2) fraction:moment];
  // ShipEntity.m:11178-11181
  //   velocity = vector_add(velocity, vector_multiply_scalar(moment, howmuch / mass));
  it("a pod 8 m from an exploding pod: d2 = 64 - r^2 = 30.375937137854635", () => {
    const fixture = byId(
      BlastFileSchema.parse(readJson(BLAST_FIXTURE_FILE)),
      "blast-pod-pod-8m",
    );
    const r = 5.798625946044922;
    const mass = 993.3700561523438;
    const range = f(f(r) * f(2.5));
    const amount = f(f(0.125) * f(mass));
    expect(range).toBe(14.496564865112305);
    expect(amount).toBe(124.17125701904297);
    // Universe.m:5862-5868: in range when distance^2 64 < f((range + r)^2).
    expect(64 < f(f(range + f(r)) * f(range + f(r)))).toBe(true);
    // magnitude2(p2) of the float (0, 0, 8) is 64; ecr^2 in double.
    const d2 = f(f(f(0) + f(0)) + f(8 * 8)) - r * r;
    expect(d2).toBe(30.375937137854635);
    expect(d2 < 0.1).toBe(false); // the unfloored branch
    const moment = (amount * range) / d2;
    expect(moment).toBe(59.2592970412705);
    // vector_normal((0,0,8)) = (0, 0, 1) exactly; howmuch = f(moment) / mass.
    const k = f(f(moment) / f(mass));
    const dvz = f(f(8 * f(1 / Math.sqrt(64))) * k);
    expect(dvz).toBe(0.059654805809259415);

    const c = fixture.expected.receivers[0]?.contributions[0];
    expect(c).toEqual({
      inRange: true,
      d2,
      floored: false,
      moment,
      dv: [0, 0, dvz],
    });
    const got = blastReference(fixture).receivers[0]?.contributions[0];
    expect(got).toEqual(c);
  });
});

describe('collide hand anchor: dam2Receiver "otherParent" (ShipEntity.m:11123-11129)', () => {
  // ShipEntity.m:11074  v1a = sqrt(v2b * v2b * m2 / m1);
  // ShipEntity.m:11089-11090
  //   dam1 = m2 * v2b * v2b / 50000000;
  //   dam2 = m1 * v2b * v2b / 50000000;
  // ShipEntity.m:11102-11106
  //   if (otherParent != nil) { [otherParent adjustVelocity:vel2a]; }
  //   else { [other adjustVelocity:vel2a]; }
  // ShipEntity.m:11123-11128
  //   if (dam2 > 0.05) {
  //     if (otherParent != nil && ![otherParent isFrangible]) {
  //       [otherParent takeScrapeDamage:dam2 from:self];
  //     } else { [other takeScrapeDamage:dam2 from:self]; }
  it("the player rams a subentity of a non-frangible parent at 100 m/s", () => {
    const fixture = byId(
      CollideFileSchema.parse(readJson(COLLIDE_FIXTURE_FILE)),
      "collide-subentity-nonfrangible-parent",
    );
    expect(fixture.other.isSubentityOf?.frangible).toBe(false);
    const m1 = f(214737.6875);
    const m2 = f(7646.7861328125);
    const v2b = 100; // loc (0,0,1), v = (0,0,100) - parent (0,0,0)
    const v1a = f(Math.sqrt(f(f(f(v2b * v2b) * m2) / m1)));
    const dam1 = f(f(f(m2 * v2b) * v2b) / f(50000000));
    const dam2 = f(f(f(m1 * v2b) * v2b) / f(50000000));
    expect(v1a).toBe(18.87058448791504);
    expect(dam1).toBe(1.5293573141098022);
    expect(dam2).toBe(42.94753646850586);
    expect(dam2 > 0.05).toBe(true);
    // Nudge (11138-11146): t = f(10 x dt); self += loc x f(t x v1a), the
    // subentity's own position += loc x f(t x v2b); the parent does not move.
    const t = f(10 * DT);
    const want = {
      v1a,
      dam1,
      dam2,
      dam2Receiver: "otherParent",
      dv1: [0, 0, -v1a],
      dvOtherBody: [0, 0, 100],
      dvOtherSubentity: [0, 0, 0],
      dp1: [0, 0, f(t * v1a)],
      dpOther: [0, 0, 0],
      dpOtherSubentity: [0, 0, f(t * v2b)],
    };
    expect(want.dp1[2]).toBe(1.572548747062683);
    expect(want.dpOtherSubentity[2]).toBe(8.333333969116211);
    expect(fixture.expected).toMatchObject(want);
    expect(collideWithShipReference(fixture)).toMatchObject(want);
  });
});
