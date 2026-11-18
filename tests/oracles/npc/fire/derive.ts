// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Independent derivation of Oolite's NPC fire gate (Phase 17, plan 17-01):
 * `fireWeapon:direction:range:` (`ShipEntity.m:9912-9993`), `onTarget:withWeapon:`
 * (9851-9910), `currentAimTolerance` (9761-9810), the weapon heat and cooling
 * (2213-2221, 9968-9973) and the literal shot-timer frame count.
 *
 * Independence: this module imports nothing outside `tests/oracles` (a type
 * import of this tree's own `schema.ts` only). Its sole input is the pinned
 * Oolite source (commit `7437f22`), read with `git show 7437f22:<path>`, cited
 * line by line below. The fixtures' expected values are written from the same
 * reading and the self-test re-derives every one of them here.
 *
 * Scope cuts (Phase 14 recorded them and they apply to every derivation here):
 *
 * - no sun glare and no shadow: both ships are sunlit, so the `onTarget:`
 *   clause `isSunlit && target->isSunlit == NO && randf() < 0.75`
 *   (`ShipEntity.m:9868-9870`) is false at its second operand and never reaches
 *   `randf()`, and the glare term of `currentAimTolerance` (9786-9803) never
 *   applies;
 * - every weapon is forward: the aft, port and starboard terms at 9777-9784
 *   never apply, and `fireMainWeapon:` (10009-10043) is the only entry;
 * - no `_multiplyWeapons`: no record authors a multi-barrel mode, so the
 *   `multiplier` of 9938-9942 is 1;
 * - no turret lasers and no subentity lasers.
 *
 * Float widths. `forward_weapon_temp`, `weapon_temp`, `weapon_energy_use`,
 * `weapon_shot_temperature`, `weaponRange`, `accuracy`, `aim_tolerance`,
 * `energy`, `collision_radius`, and every `Vector` component are `GLfloat`
 * (`ShipEntity.h:298-304, 362-364`, `Entity.h:103, 134`, `OOVector.h` with
 * `OOScalar` = `GLfloat`, `OOMaths.h:49`). `shot_time` is `OOTimeDelta`, a
 * double (`ShipEntity.h:186`, `OOTypes.h:193`), and `weapon_recharge_rate` is a
 * `float` (`ShipEntity.h:345`). Temperatures are float32 here (`Math.fround`).
 * Energy is float64 by the plan's contract (the divergence is stated per
 * fixture); the onTarget maths is done in float32 by default, with an explicit
 * float64 mode so a fixture can state both widths.
 */

import type { FireWeapon } from "./schema.js";

/** One native update step (1/120 s exactly). */
export const DT = 1 / 120;

/** `WEAPON_COOLING_FACTOR 6.0f` (`ShipEntity.h:115`). */
export const COOLING_FACTOR = 6;
/** `NPC_MAX_WEAPON_TEMP 256.0f` (`ShipEntity.h:116`). */
export const MAX_WEAPON_TEMP = 256;
/** `WEAPON_COOLING_CUTOUT 0.85f` (`ShipEntity.h:117`): a float32 constant. */
export const COOLING_CUTOUT = Math.fround(0.85);
/**
 * The smallest temperature the cutout refuses: `weapon_temp / 256.0f >= 0.85f`
 * (9935-9936). Division by 256 is exact in binary, so the refusal threshold is
 * `fround(0.85) x 256`.
 */
export const CUTOUT_TEMPERATURE = COOLING_CUTOUT * MAX_WEAPON_TEMP;
/** `fmaxf(t - (float)(WEAPON_COOLING_FACTOR * delta_t), 0.0f)` (2214-2218). */
export const COOLING_PER_TICK = Math.fround(COOLING_FACTOR * DT);

/**
 * The `weapon_info` of `equipment.plist` (pin line ranges in the comments) as
 * `OOEquipmentType` returns it (`OOEquipmentType.m:655-678`): `weaponRange`,
 * `weaponEnergyUse`, `weaponRechargeRate` and `weaponShotTemperature`, each a
 * `GLfloat` read from the plist number. `setWeaponDataFromType:`
 * (`ShipEntity.m:6461-6475`) copies them into the ship at every
 * `fireMainWeapon:` (10011-10014).
 */
export interface WeaponInfo {
  /** `range`, metres (`getWeaponRangeFromType`, 13041-13044). */
  readonly range: number;
  /** `energy`: the cost of one shot (9968-9969). */
  readonly energy: number;
  /** `recharge_rate`, seconds (9946). */
  readonly rechargeRate: number;
  /** `shot_temperature` (9971-9973 forward). */
  readonly shotTemperature: number;
}

export const WEAPON_INFO: Readonly<Record<FireWeapon, WeaponInfo>> = {
  // equipment.plist:125-136 (weapon_info 131-139): range 12500, energy 0.8,
  // recharge_rate 0.5, shot_temperature 7.0
  EQ_WEAPON_PULSE_LASER: {
    range: 12500,
    energy: 0.8,
    rechargeRate: 0.5,
    shotTemperature: 7.0,
  },
  // equipment.plist:143-154 (weapon_info 149-159): range 15000, energy 0.5,
  // recharge_rate 0.1, shot_temperature 3.2
  EQ_WEAPON_BEAM_LASER: {
    range: 15000,
    energy: 0.5,
    rechargeRate: 0.1,
    shotTemperature: 3.2,
  },
  // equipment.plist:163-174 (weapon_info 169-180): range 12500, energy 1.4,
  // recharge_rate 2.5, shot_temperature 10.0
  EQ_WEAPON_MINING_LASER: {
    range: 12500,
    energy: 1.4,
    rechargeRate: 2.5,
    shotTemperature: 10.0,
  },
  // equipment.plist:184-195 (weapon_info 190-200): range 30000, energy 1.1,
  // recharge_rate 0.1, shot_temperature 4.25
  EQ_WEAPON_MILITARY_LASER: {
    range: 30000,
    energy: 1.1,
    rechargeRate: 0.1,
    shotTemperature: 4.25,
  },
  // equipment.plist:107-121 (weapon_info 114-121): range 32000, energy 0.0,
  // recharge_rate 100.0, shot_temperature 0.0. An unarmed NPC holds THIS
  // object, not nil: `forward_weapon_type` is
  // OOWeaponTypeFromString(@"EQ_WEAPON_NONE" default) (ShipEntity.m:299-300),
  // which is OOWeaponTypeFromEquipmentIdentifierSloppy and returns the
  // registered EQ_WEAPON_NONE equipment type (OOConstToString.m:258-281), and
  // isWeaponNone(weapon) tests `weapon == nil || identifier == NONE`
  // (ShipEntity.m:13046-13049).
  EQ_WEAPON_NONE: {
    range: 32000,
    energy: 0.0,
    rechargeRate: 100.0,
    shotTemperature: 0.0,
  },
};

/** The float32 shot-timer period of a weapon in seconds (`float` field). */
export function rechargeRateF32(weapon: FireWeapon): number {
  return Math.fround(WEAPON_INFO[weapon].rechargeRate);
}

/**
 * The recorded rule (D-07): the shot is allowed once `ticksSinceShot` is at
 * least `round(weapon_recharge_rate x 120)` whole ticks.
 */
export function rechargeTicks(weapon: FireWeapon): number {
  return Math.round(rechargeRateF32(weapon) * 120);
}

/**
 * The LITERAL Oolite frame count at exactly 1/120 s per frame: after a shot
 * `shot_time = 0.0` (`resetShotTime`, 10080-10083, called from
 * `fireLaserShotInDirection` at 10463), every later `update:` adds `delta_t`
 * once (2221, a double sum) BEFORE the behaviours run (cooling and the add at
 * 2213-2221, `processBehaviour:` dispatch from 2485 on), and the gate refuses
 * while `[self shotTime] < weapon_recharge_rate` (9946: a double compared with
 * the float field promoted to double). The first frame that is not refused is
 * the smallest k with `!(sum_k < rate)`, where `sum_k` is `k` successive
 * double additions of 1/120.
 */
export function literalShotFrames(rateF32: number): number {
  let shotTime = 0;
  for (let frames = 1; frames < 1_000_000; frames += 1) {
    shotTime += DT;
    if (!(shotTime < rateF32)) return frames;
  }
  throw new Error("shot timer never opens");
}

// ---------------------------------------------------------------------------
// the gate

export interface GateInput {
  /** `forward_weapon_temp` as `fireWeapon:` reads it (a float32 value). */
  readonly temperature: number;
  readonly energy: number;
  /** Whole ticks since the last fired shot; null = never fired. */
  readonly ticksSinceShot: number | null;
  readonly accuracy: number;
  /** `rangeToPrimaryTarget` as passed to `fireMainWeapon:`. */
  readonly range: number;
  /** What `onTarget:withWeapon:` returns. */
  readonly onTarget: boolean;
}

export interface GateCase {
  readonly weapon: FireWeapon;
  readonly input: GateInput;
  /** The scripted unit draws: the gate takes `draws[0]` when it rolls. */
  readonly draws: readonly number[];
}

export interface GateOutcome {
  readonly fired: boolean;
  readonly refusedAt:
    | "heat"
    | "energy"
    | "timer"
    | "roll"
    | "range"
    | "onTarget"
    | "noWeapon"
    | null;
  readonly drawsUsed: 0 | 1;
  readonly energyAfter: number;
  readonly temperatureAfter: number;
  readonly shotTimerReset: boolean;
}

/**
 * One call of `fireWeapon:direction:range:` for the forward weapon, line by
 * line (ShipEntity.m, pin line numbers):
 *
 * - 9912-9934: `weapon_temp = forward_weapon_temp` (the switch copies the
 *   facing's temperature);
 * - 9935-9936: `weapon_temp / NPC_MAX_WEAPON_TEMP >= WEAPON_COOLING_CUTOUT`
 *   refuses (float / float: an exact division by 256 against `0.85f`);
 * - 9938-9945: `energy <= weapon_energy_use * multiplier` refuses (equality
 *   refuses; the multiplier is 1);
 * - 9946-9947: `shotTime < weapon_recharge_rate` refuses; the recorded rule
 *   turns it into `ticksSinceShot < rechargeTicks`, so equality fires, and a
 *   ship that has never fired (`shot_time = INITIAL_SHOT_TIME` 100.0,
 *   `ShipEntity.m:208`, `ShipEntity.h:102`) is ready;
 * - 9948: `![weapon_type isTurretLaser]` is true for every laser and for
 *   `EQ_WEAPON_NONE` (none has `is_turret_laser`, `OOEquipmentType.m:640-643`),
 *   so the ONE draw is taken here, armed or not and target or not:
 *   `range > randf() * weaponRange * (accuracy + 7.5)` refuses (9949-9950; the
 *   product is `float * float` first, then times a double), then
 *   `range > weaponRange` refuses (9951-9952, strict);
 * - 9954-9955: `onTarget:withWeapon:` refuses;
 * - 9958: `isWeaponNone(weapon_type)` never fires (nothing to refuse earlier);
 * - 9968-9973: a fired shot costs `weapon_energy_use` (energy is a `GLfloat`,
 *   `Entity.h:134`) and adds `weapon_shot_temperature` in float32
 *   (`float += float`); the shot timer resets in `fireLaserShotInDirection`
 *   (`resetShotTime`, 10463).
 *
 * An unarmed ship's gate call reads the NONE object (range 32000, energy 0,
 * recharge 100 s, shot temperature 0): with positive energy it passes the
 * energy test (`energy <= 0` is false), it passes the timer when never fired,
 * it takes the one draw, its `range` test is against 32000, and it never
 * fires: `noWeapon`, one draw.
 */
export function deriveGate(c: GateCase): GateOutcome {
  const info = WEAPON_INFO[c.weapon];
  const temperature = Math.fround(c.input.temperature);
  const unchanged = {
    energyAfter: c.input.energy,
    temperatureAfter: temperature,
    shotTimerReset: false,
  };
  const refuse = (
    refusedAt: NonNullable<GateOutcome["refusedAt"]>,
    drawsUsed: 0 | 1,
  ): GateOutcome => ({ fired: false, refusedAt, drawsUsed, ...unchanged });

  // 9935-9936
  if (Math.fround(temperature / MAX_WEAPON_TEMP) >= COOLING_CUTOUT) {
    return refuse("heat", 0);
  }
  // 9944-9945
  if (c.input.energy <= info.energy) return refuse("energy", 0);
  // 9946-9947 under the recorded whole-tick rule
  if (
    c.input.ticksSinceShot !== null &&
    c.input.ticksSinceShot < rechargeTicks(c.weapon)
  ) {
    return refuse("timer", 0);
  }
  // 9948-9952: the one draw
  const draw = c.draws[0];
  if (draw === undefined) throw new Error("the gate needs a scripted draw");
  const weaponRange = Math.fround(info.range);
  const rollLimit =
    Math.fround(draw * weaponRange) * (Math.fround(c.input.accuracy) + 7.5);
  if (c.input.range > rollLimit) return refuse("roll", 1);
  if (c.input.range > weaponRange) return refuse("range", 1);
  // 9954-9955
  if (!c.input.onTarget) return refuse("onTarget", 1);
  // 9958
  if (c.weapon === "EQ_WEAPON_NONE") return refuse("noWeapon", 1);
  // 9968-9973
  return {
    fired: true,
    refusedAt: null,
    drawsUsed: 1,
    energyAfter: c.input.energy - info.energy,
    temperatureAfter: Math.fround(
      temperature + Math.fround(info.shotTemperature),
    ),
    shotTimerReset: true,
  };
}

// ---------------------------------------------------------------------------
// the aim tolerance and onTarget

export type Width = "f32" | "f64";

function rounder(width: Width): (x: number) => number {
  return width === "f32" ? Math.fround : (x) => x;
}

/**
 * `currentAimTolerance` (ShipEntity.m:9761-9810) for a forward weapon with no
 * sun and no side facing:
 *
 * - `aim_tolerance = 240.0 - 18.0f * accuracy` (`setAccuracy:`, 1138), a
 *   `GLfloat`;
 * - `best_cos = 0.99999` (9763);
 * - accuracy >= COMBAT_AI_ISNT_AWFUL (0.0f, `ShipEntity.h:124`):
 *   `best_cos = 0.999999` and `basic_aim /= 1.0 + (GLfloat)missedShots / 4.0`
 *   (9765-9770: the divisor is a double, the quotient is stored as a float);
 * - accuracy >= COMBAT_AI_TRACKS_CLOSER (7.5): `best_cos = 0.9999999` and
 *   `basic_aim /= 5.0` (9771-9776);
 * - `max_cos = sqrt(1 - basic_aim * basic_aim / 100000000.0)` (9804): the
 *   product is float * float, the division by the double literal and the
 *   square root are double, the result is stored in a `GLfloat`;
 * - the result is the smaller of `max_cos` and `best_cos` (9806-9810).
 *
 * A missed shot therefore makes the aim stricter: the cosine moves toward 1.
 * accuracy below zero (`COMBAT_AI_ISNT_AWFUL`) takes neither division, so
 * `missedShots` has no effect there.
 */
export function deriveAimTolerance(
  accuracy: number,
  missedShots: number,
  width: Width = "f32",
): number {
  const r = rounder(width);
  const acc = r(accuracy);
  let basicAim = r(240 - r(18 * acc));
  let bestCos = r(0.99999);
  if (acc >= 0) {
    bestCos = r(0.999999);
    basicAim = r(basicAim / (1 + r(missedShots) / 4));
  }
  if (acc >= 7.5) {
    bestCos = r(0.9999999);
    basicAim = r(basicAim / 5);
  }
  const maxCos = r(Math.sqrt(1 - r(basicAim * basicAim) / 100000000));
  return maxCos < bestCos ? maxCos : bestCos;
}

export interface OnTargetInput {
  readonly accuracy: number;
  readonly missedShots: number;
  readonly position: readonly [number, number, number];
  readonly forward: readonly [number, number, number];
  readonly targetPresent: boolean;
  readonly aimPoint: readonly [number, number, number];
  readonly targetRadius: number;
}

export interface OnTargetOutcome {
  readonly aimTolerance: number;
  readonly onTarget: boolean;
}

/**
 * `onTarget:withWeapon:` for a forward laser (ShipEntity.m:9851-9909), in the
 * requested width (default float32, Oolite's own: `dq`, `d2`, `radius`, `aim`,
 * `astq` and every `Vector` component are `GLfloat`, 9855-9856):
 *
 * - no live target answers NO (9863-9866);
 * - `rel_pos = (HPVector)calculateTargetPosition - position` is a double
 *   subtraction narrowed to a float vector (9872);
 * - `d2 = magnitude2(rel_pos)` is `x*x + y*y + z*z` in float (OOVector.h:237);
 * - `urp = vector_normal_or_zbasis(rel_pos)`: a zero vector gives the +z basis,
 *   otherwise each component times `1.0f / sqrt(mag2)` (a double square root
 *   narrowed to a float scale, OOVector.h:247-253);
 * - `dq = urp . v_forward` in float (OOVector.h:299-302); `dq < 0` is NO (9897-9898);
 * - `dq > aim * aim` is YES (9900-9902), the product in float;
 * - `astq = sqrt(1.0 - radius * radius / (d2 * 9))`: the quotient is float, the
 *   `1.0 -` and the root are double, stored in a float (9907): a radius with
 *   `radius^2 > 9 d2`, or a zero `d2`, makes it NaN and the answer NO;
 * - the answer is `fabs(dq) >= astq` (9909), so equality is YES.
 */
export function deriveOnTarget(
  input: OnTargetInput,
  width: Width = "f32",
): OnTargetOutcome {
  const trace = traceOnTarget(input, width);
  return { aimTolerance: trace.aimTolerance, onTarget: trace.onTarget };
}

/** Every intermediate value of one `onTarget:` evaluation. */
export interface OnTargetTrace extends OnTargetOutcome {
  /** `dq`; NaN when the target is absent. */
  readonly dq: number;
  /** `aim * aim`. */
  readonly aimSquared: number;
  /** `astq`; NaN when it is not reached or not a number. */
  readonly astq: number;
  /** Which test decided: the order of 9863-9909. */
  readonly decidedBy: "noTarget" | "behind" | "aimCircle" | "astq";
}

export function traceOnTarget(
  input: OnTargetInput,
  width: Width = "f32",
): OnTargetTrace {
  const r = rounder(width);
  const aim = deriveAimTolerance(input.accuracy, input.missedShots, width);
  if (!input.targetPresent) {
    return {
      aimTolerance: aim,
      onTarget: false,
      dq: Number.NaN,
      aimSquared: r(aim * aim),
      astq: Number.NaN,
      decidedBy: "noTarget",
    };
  }

  const radius = r(input.targetRadius);
  const rel: [number, number, number] = [
    r(input.aimPoint[0] - input.position[0]),
    r(input.aimPoint[1] - input.position[1]),
    r(input.aimPoint[2] - input.position[2]),
  ];
  const d2 = r(r(r(rel[0] * rel[0]) + r(rel[1] * rel[1])) + r(rel[2] * rel[2]));
  let urp: [number, number, number];
  if (d2 === 0) {
    urp = [0, 0, 1];
  } else {
    const scale = r(1 / Math.sqrt(d2));
    urp = [r(rel[0] * scale), r(rel[1] * scale), r(rel[2] * scale)];
  }
  const fwd: [number, number, number] = [
    r(input.forward[0]),
    r(input.forward[1]),
    r(input.forward[2]),
  ];
  const dq = r(r(r(urp[0] * fwd[0]) + r(urp[1] * fwd[1])) + r(urp[2] * fwd[2]));
  const aimSquared = r(aim * aim);
  if (dq < 0) {
    return {
      aimTolerance: aim,
      onTarget: false,
      dq,
      aimSquared,
      astq: Number.NaN,
      decidedBy: "behind",
    };
  }
  if (dq > aimSquared) {
    return {
      aimTolerance: aim,
      onTarget: true,
      dq,
      aimSquared,
      astq: Number.NaN,
      decidedBy: "aimCircle",
    };
  }
  const astq = r(Math.sqrt(1 - r(r(radius * radius) / r(d2 * 9))));
  return {
    aimTolerance: aim,
    onTarget: Math.abs(dq) >= astq,
    dq,
    aimSquared,
    astq,
    decidedBy: "astq",
  };
}

// ---------------------------------------------------------------------------
// the heat run

export interface HeatInput {
  readonly weapon: FireWeapon;
  readonly startTemperature: number;
  readonly startTicksSinceShot: number | null;
  readonly horizon: number;
}

export interface HeatOutcome {
  readonly shotTicks: number[];
  /** `reads[k - 1]` is the temperature the gate reads at tick k. */
  readonly reads: number[];
  readonly firstHeatRefusalTick: number | null;
  readonly firstResumeTick: number | null;
  readonly drawsUsed: number;
}

/**
 * The per-tick run of contract item 6: ticks 1 to `horizon`, one gate call per
 * tick with energy 1e9, range 0, accuracy 0 and onTarget true. Tick 1 reads
 * `startTemperature`. At the top of every later tick the weapon cools,
 * `fmaxf(t - (float)(6.0f * delta_t), 0.0f)` (ShipEntity.m:2214-2218, float
 * subtraction, floored at 0), and `shot_time` gains one tick (2221), both
 * BEFORE the behaviour calls `fireMainWeapon:`, so the gate reads the cooled
 * temperature (the advisor's warning). A fired shot adds `fround(shot
 * temperature)` after the read and resets the timer; the next tick is one
 * tick after the shot.
 */
export function deriveHeat(input: HeatInput): HeatOutcome {
  let temperature = Math.fround(input.startTemperature);
  let since = input.startTicksSinceShot;
  const shotTicks: number[] = [];
  const reads: number[] = [];
  let firstHeatRefusalTick: number | null = null;
  let firstResumeTick: number | null = null;
  for (let tick = 1; tick <= input.horizon; tick += 1) {
    if (tick > 1) {
      temperature = Math.max(Math.fround(temperature - COOLING_PER_TICK), 0);
      if (since !== null) since += 1;
    }
    reads.push(temperature);
    const outcome = deriveGate({
      weapon: input.weapon,
      input: {
        temperature,
        energy: 1e9,
        ticksSinceShot: since,
        accuracy: 0,
        range: 0,
        onTarget: true,
      },
      draws: [0.5, 0.25],
    });
    if (outcome.fired) {
      shotTicks.push(tick);
      temperature = outcome.temperatureAfter;
      since = 0;
      if (firstHeatRefusalTick !== null && firstResumeTick === null) {
        firstResumeTick = tick;
      }
    } else if (outcome.refusedAt === "heat" && firstHeatRefusalTick === null) {
      firstHeatRefusalTick = tick;
    }
  }
  return {
    shotTicks,
    reads,
    firstHeatRefusalTick,
    firstResumeTick,
    drawsUsed: shotTicks.length,
  };
}
