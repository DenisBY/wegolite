// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The NPC steering ledger is pinned to the Oolite literals it cites (AI-01,
 * plan 14-09, PITFALLS 6). Each expected number is written from the Oolite
 * source line named beside it, never from the module under test; a drift in the
 * ledger fails here. The pins are the single place a later plan has to touch
 * when it changes a ledger value deliberately.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { TICKS_PER_SECOND } from "../../../src/sim/ai/time.js";
import { SCANNER_MAX_RANGE as COMBAT_SCANNER_MAX_RANGE } from "../../../src/sim/combat/constants.js";
import * as ledger from "../../../src/sim/npc/constants.js";

const SRC_SIM = fileURLToPath(new URL("../../../src/sim/", import.meta.url));

describe("the flight model constants", () => {
  it.each([
    ["SHIP_THRUST_FACTOR", ledger.SHIP_THRUST_FACTOR, 5], // ShipEntity.h:46
    ["STICK_ROLL_RATE", ledger.STICK_ROLL_RATE, 2], // ShipEntity.m:7021
    ["STICK_PITCH_RATE", ledger.STICK_PITCH_RATE, 4], // ShipEntity.m:7022
    ["STICK_REVERSAL_FACTOR", ledger.STICK_REVERSAL_FACTOR, 4], // ShipEntity.m:7026, 7028
    ["STICK_ZERO_FACTOR", ledger.STICK_ZERO_FACTOR, 2], // ShipEntity.m:7034, 7036
    ["MIN_HYPERSPEED_FACTOR", ledger.MIN_HYPERSPEED_FACTOR, 32], // PlayerEntity.h:296
  ])("%s is %d", (_name, actual, expected) => {
    expect(actual).toBe(expected);
  });

  it("the stock stats are 160, 2.0, 1.0 and 15.0 (ShipEntity.m:263-270)", () => {
    expect(ledger.DEFAULT_MAX_FLIGHT_SPEED).toBe(160);
    expect(ledger.DEFAULT_MAX_FLIGHT_ROLL).toBe(2);
    expect(ledger.DEFAULT_MAX_FLIGHT_PITCH).toBe(1);
    expect(ledger.DEFAULT_THRUST).toBe(15);
  });

  it("SCANNER_MAX_RANGE is 25600 (Entity.h:49) and agrees with the combat ledger", () => {
    expect(ledger.SCANNER_MAX_RANGE).toBe(25600);
    expect(ledger.SCANNER_MAX_RANGE).toBe(COMBAT_SCANNER_MAX_RANGE);
  });

  it("MAX_COS is cos(5 degrees) rounded to 0.995 (ShipEntity.h:142-143)", () => {
    expect(ledger.MAX_COS).toBe(0.995);
    expect(ledger.MAX_COS2).toBe(0.995 * 0.995);
    // "cos(5 degrees) is close enough": 0.99619, so 0.995 sits just below it.
    expect(Math.cos((5 * Math.PI) / 180)).toBeGreaterThan(ledger.MAX_COS);
  });
});

describe("the navigation steering constants", () => {
  it.each([
    ["TRACK_MIN_D", ledger.TRACK_MIN_D, 0.004], // ShipEntity.m:9464
    ["TRACK_PRECISION", ledger.TRACK_PRECISION, 0.9025], // :9466
    ["TRACK_MAX_COS_CEILING", ledger.TRACK_MAX_COS_CEILING, 0.99999], // :9488-9490
    ["TRACK_STICK_STEP", ledger.TRACK_STICK_STEP, 0.125], // :9530
    ["TRACK_FACTOR_CAP", ledger.TRACK_FACTOR_CAP, 8], // :9527
    ["TRACK_PITCH_FALLBACK", ledger.TRACK_PITCH_FALLBACK, 0.01], // :9564
    ["PITCHING_OVER_COS", ledger.PITCHING_OVER_COS, 0.707], // :9513
    ["FLY_TO_MIN_CONFIDENCE", ledger.FLY_TO_MIN_CONFIDENCE, 0.2], // :5071-5072
    ["FLY_TO_ETA_SPEED_FACTOR", ledger.FLY_TO_ETA_SPEED_FACTOR, 0.51], // :5085
    ["FLY_TO_NO_THRUST_SLOWDOWN", ledger.FLY_TO_NO_THRUST_SLOWDOWN, 4], // :5086
    [
      "FLY_TO_TURN_SPEED_COEFFICIENT",
      ledger.FLY_TO_TURN_SPEED_COEFFICIENT,
      0.05,
    ], // :5087
    ["FLY_TO_ORBIT_FACTOR", ledger.FLY_TO_ORBIT_FACTOR, 5], // :5095
    ["FLY_TO_SPEED_CUT", ledger.FLY_TO_SPEED_CUT, 0.5], // :5096
    ["FLY_TO_FRUSTRATION_RELIEF", ledger.FLY_TO_FRUSTRATION_RELIEF, 0.25], // :5119
    ["FLY_TO_FRUSTRATION_LIMIT", ledger.FLY_TO_FRUSTRATION_LIMIT, 15], // :5124
    ["FLY_TO_SLOWDOWN_LIMIT_FACTOR", ledger.FLY_TO_SLOWDOWN_LIMIT_FACTOR, 10], // :5124
    ["FLY_TO_SLOWDOWN_RESET_FACTOR", ledger.FLY_TO_SLOWDOWN_RESET_FACTOR, 5], // :5127
    ["FACE_PRECISION", ledger.FACE_PRECISION, 0.9], // :4927
    ["FACE_MIN_RANGE", ledger.FACE_MIN_RANGE, 1], // :4926
    ["FACE_FRUSTRATION_LIMIT", ledger.FACE_FRUSTRATION_LIMIT, 15], // :4945
    ["FACE_ESCAPE_PITCH", ledger.FACE_ESCAPE_PITCH, 0.5], // :4950
    ["FACE_DAMPING_FRUSTRATION", ledger.FACE_DAMPING_FRUSTRATION, 5], // :4958
    ["FACE_DAMPING_CONFIDENCE", ledger.FACE_DAMPING_CONFIDENCE, 0.5], // :4958
    ["FACE_DAMPING_SHARE", ledger.FACE_DAMPING_SHARE, 0.5], // :4959
  ])("%s is %d", (_name, actual, expected) => {
    expect(actual).toBe(expected);
  });
});

describe("the combat AI tiers (ShipEntity.h:123-137)", () => {
  const tiers = {
    COMBAT_AI_CONFIDENCE_FACTOR: 1250000, // :123
    COMBAT_AI_ISNT_AWFUL: 0, // :124
    COMBAT_AI_IS_SMART: 5, // :126
    COMBAT_AI_FLEES_BETTER: 6, // :128
    COMBAT_AI_DOGFIGHTER: 6.5, // :130
    COMBAT_AI_TRACKS_CLOSER: 7.5, // :132
    COMBAT_AI_USES_SNIPING: 8.5, // :133
    COMBAT_AI_FLEES_BETTER_2: 9, // :135
    COMBAT_AI_STANDARD_REACTION_TIME: 1.5, // :137
  } as const;

  it("every tier has its Oolite value", () => {
    for (const [name, value] of Object.entries(tiers)) {
      expect((ledger as Record<string, unknown>)[name], name).toBe(value);
    }
  });

  it("the ledger exports exactly these COMBAT_AI_ names, each once", () => {
    const exported = Object.keys(ledger)
      .filter((name) => name.startsWith("COMBAT_AI_"))
      .sort();
    expect(exported).toEqual(Object.keys(tiers).sort());
  });

  it("no other file under src/sim defines a COMBAT_AI_ constant", () => {
    const definitions = new Map<string, string[]>();
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path);
        } else if (entry.name.endsWith(".ts")) {
          const text = readFileSync(path, "utf8");
          for (const match of text.matchAll(
            /^\s*(?:export\s+)?const\s+(COMBAT_AI_[A-Z0-9_]+)\b/gm,
          )) {
            const name = match[1];
            if (name === undefined) continue;
            definitions.set(name, [...(definitions.get(name) ?? []), path]);
          }
        }
      }
    };
    walk(SRC_SIM);
    for (const [name, files] of definitions) {
      expect(files, name).toHaveLength(1);
    }
    expect([...definitions.keys()].sort()).toEqual(Object.keys(tiers).sort());
  });
});

describe("the target sensing and trackPrimaryTarget constants (plan 14-12)", () => {
  it.each([
    ["CAN_TRACK_RANGE2_FACTOR", ledger.CAN_TRACK_RANGE2_FACTOR, 1.5625], // ShipEntity.m:8706
    ["AIM_TOLERANCE_BASE", ledger.AIM_TOLERANCE_BASE, 240], // :1138
    ["AIM_TOLERANCE_ACCURACY_FACTOR", ledger.AIM_TOLERANCE_ACCURACY_FACTOR, 18], // :1138
    ["AIM_BEST_COS_AWFUL", ledger.AIM_BEST_COS_AWFUL, 0.99999], // :9764
    ["AIM_BEST_COS_BETTER", ledger.AIM_BEST_COS_BETTER, 0.999999], // :9767
    ["AIM_BEST_COS_DEADLY", ledger.AIM_BEST_COS_DEADLY, 0.9999999], // :9773
    ["AIM_DEADLY_DIVISOR", ledger.AIM_DEADLY_DIVISOR, 5], // :9775
    ["AIM_TOLERANCE_SCALE", ledger.AIM_TOLERANCE_SCALE, 100000000], // :9804
    ["PRIMARY_MIN_D", ledger.PRIMARY_MIN_D, 0.004], // :9121
    ["PRIMARY_MIN_D_PRECISE", ledger.PRIMARY_MIN_D_PRECISE, 0.0004], // :9131
    ["PRIMARY_MAX_FACTOR", ledger.PRIMARY_MAX_FACTOR, 8], // :9122
    ["PRIMARY_R_MAX_FACTOR", ledger.PRIMARY_R_MAX_FACTOR, 0.125], // :9123
    ["PRIMARY_PITCH_DIVISOR", ledger.PRIMARY_PITCH_DIVISOR, 0.125], // :9128
    ["PRIMARY_PRECISE_MULTIPLIER", ledger.PRIMARY_PRECISE_MULTIPLIER, 3], // :9132-9133
    ["PRIMARY_PITCH_OVER_START_COS", ledger.PRIMARY_PITCH_OVER_START_COS, -0.5], // :9158
    ["PRIMARY_PITCH_OVER_END_COS", ledger.PRIMARY_PITCH_OVER_END_COS, 0.707], // :9166
    ["PRIMARY_PITCH_LIMIT_SHARE", ledger.PRIMARY_PITCH_LIMIT_SHARE, 0.9], // :9212
    ["PRIMARY_AVOID_RANGE_FACTOR", ledger.PRIMARY_AVOID_RANGE_FACTOR, 100], // :9079
    ["PRIMARY_AVOID_DOT", ledger.PRIMARY_AVOID_DOT, -0.1], // :9084
    ["PRIMARY_JINK_RANGE", ledger.PRIMARY_JINK_RANGE, 2000], // :9090-9091
    ["PRIMARY_JINK_BOOST", ledger.PRIMARY_JINK_BOOST, 3], // :9093
  ])("%s is %d", (_name, actual, expected) => {
    expect(actual).toBe(expected);
  });
});

describe("the tracking-curve sampling gate", () => {
  it("TRACKING_SAMPLE_TICKS is round(reaction time / 3 * 120) = 60 (ShipEntity.m:5444-5449, 717)", () => {
    // A third of the 1.5 s reaction time is 0.5 s, 60 ticks at 120 Hz.
    expect(ledger.TRACKING_SAMPLE_TICKS).toBe(60);
    expect(ledger.TRACKING_SAMPLE_TICKS).toBe(
      Math.round((1.5 / 3) * TICKS_PER_SECOND),
    );
  });
});

describe("the accuracy draw (ShipEntity.m:667)", () => {
  it("is randf() * 10 - 5", () => {
    expect(ledger.ACCURACY_DRAW_SPAN).toBe(10);
    expect(ledger.ACCURACY_DRAW_OFFSET).toBe(-5);
  });
});

describe("avoid collision, flee and evasive action (plan 14-13)", () => {
  it.each([
    [
      "PROXIMITY_AVOID_DISTANCE_FACTOR",
      ledger.PROXIMITY_AVOID_DISTANCE_FACTOR,
      10,
    ], // Universe.h:101
    ["AVOID_MIDPOINT", ledger.AVOID_MIDPOINT, 0.5], // ShipEntity.m:5929
    ["FLEE_FRUSTRATION_RELIEF", ledger.FLEE_FRUSTRATION_RELIEF, 0.25], // :4862
    ["FLEE_FRUSTRATION_LIMIT", ledger.FLEE_FRUSTRATION_LIMIT, 15], // :4867
    ["EVASIVE_JINK_Z", ledger.EVASIVE_JINK_Z, 400], // :9098, ShipEntityAI.m:383
    ["EVASIVE_JINK_SPAN", ledger.EVASIVE_JINK_SPAN, 256], // :8985
    ["EVASIVE_JINK_OFFSET", ledger.EVASIVE_JINK_OFFSET, 128], // :8989-8999
    ["FLEE_EVASIVE_ASPECT", ledger.FLEE_EVASIVE_ASPECT, 0.9995], // ShipEntityAI.m:387
    ["FLEE_EVASIVE_CHANCE", ledger.FLEE_EVASIVE_CHANCE, 0.15], // ShipEntityAI.m:388
    ["EVASIVE_ROLL_AGREEMENT", ledger.EVASIVE_ROLL_AGREEMENT, 0.3], // :9016
    ["EVASIVE_FRUSTRATION_LIMIT", ledger.EVASIVE_FRUSTRATION_LIMIT, 0.5], // :4021
  ])("%s is %d", (_name, actual, expected) => {
    expect(actual).toBe(expected);
  });
});
