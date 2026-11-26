// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The player combat state: the pristine predicate, the dock and launch resets
 * (DOCK-10, F7), the repairing sanitiser (T-13-09) and the canonical text.
 *
 * Reset values come from `PlayerEntity.m:6321-6325` (docked) and `:6439-6448`
 * (launch); shot timers are not reset because Oolite only advances them in
 * bookkeeping (`:2487-2491`).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { SHOT_TIMER_SATURATION_TICKS } from "../../../src/sim/combat/constants.js";
import type { Facing } from "../../../src/sim/combat/mounts.js";
import {
  createPlayerCombatState,
  dockReset,
  isPristineCombat,
  launchReset,
  sanitizeCombat,
  serializeCombat,
} from "../../../src/sim/combat/state.js";
import type { PlayerCombatState } from "../../../src/sim/combat/state.js";
import { MAX_BOUNTY, MAX_KILL_TALLY } from "../../../src/sim/world/limits.js";

const FACING_LIST: readonly Facing[] = ["fore", "aft", "port", "starboard"];

/** A state with every field away from its pristine value. */
function dirtyState(): PlayerCombatState {
  return {
    view: "starboard",
    fwdShield: 40,
    aftShield: 50,
    energy: 100,
    cabinTemp: 150,
    laserTemp: { fore: 11, aft: 22, port: 33, starboard: 44 },
    shotTicks: { fore: 1, aft: 2, port: 3, starboard: 4 },
    identEngaged: true,
    identTarget: 77,
    standing: { legalStatus: 0, kills: 0 },
  };
}

/** Every single-field edit of a pristine state, named. */
function singleFieldEdits(): readonly (readonly [
  string,
  (state: PlayerCombatState) => void,
])[] {
  const edits: [string, (state: PlayerCombatState) => void][] = [
    ["view", (s) => void (s.view = "aft")],
    ["fwdShield", (s) => void (s.fwdShield = 127)],
    ["aftShield", (s) => void (s.aftShield = 127)],
    ["energy", (s) => void (s.energy = 255)],
    ["cabinTemp", (s) => void (s.cabinTemp = 61)],
    ["identEngaged", (s) => void (s.identEngaged = true)],
    ["identTarget", (s) => void (s.identTarget = 9)],
    ["standing.legalStatus", (s) => void (s.standing.legalStatus = 64)],
    ["standing.kills", (s) => void (s.standing.kills = 3)],
  ];
  for (const facing of FACING_LIST) {
    edits.push([`laserTemp.${facing}`, (s) => void (s.laserTemp[facing] = 1)]);
    edits.push([`shotTicks.${facing}`, (s) => void (s.shotTicks[facing] = 5)]);
  }
  return edits;
}

describe("createPlayerCombatState and isPristineCombat", () => {
  it("creates the documented start state", () => {
    expect(createPlayerCombatState()).toEqual({
      view: "fore",
      fwdShield: 128,
      aftShield: 128,
      energy: 256,
      cabinTemp: 60,
      laserTemp: { fore: 0, aft: 0, port: 0, starboard: 0 },
      shotTicks: {
        fore: SHOT_TIMER_SATURATION_TICKS,
        aft: SHOT_TIMER_SATURATION_TICKS,
        port: SHOT_TIMER_SATURATION_TICKS,
        starboard: SHOT_TIMER_SATURATION_TICKS,
      },
      identEngaged: false,
      identTarget: 0,
      standing: { legalStatus: 0, kills: 0 },
    });
  });

  it("returns a fresh object every time", () => {
    const first = createPlayerCombatState();
    const second = createPlayerCombatState();
    expect(first).not.toBe(second);
    expect(first.standing).not.toBe(second.standing);
    expect(first.laserTemp).not.toBe(second.laserTemp);
    expect(first.shotTicks).not.toBe(second.shotTicks);
  });

  it("is pristine when freshly created", () => {
    expect(isPristineCombat(createPlayerCombatState())).toBe(true);
  });

  for (const [name, edit] of singleFieldEdits()) {
    it(`is not pristine after changing ${name}`, () => {
      const state = createPlayerCombatState();
      edit(state);
      expect(isPristineCombat(state)).toBe(false);
    });
  }
});

describe("dockReset (DOCK-10)", () => {
  it("restores shields, energy, laser temperatures, cabin, view and ident", () => {
    const state = dirtyState();
    dockReset(state);
    expect(state.fwdShield).toBe(128);
    expect(state.aftShield).toBe(128);
    expect(state.energy).toBe(256);
    expect(state.laserTemp).toEqual({ fore: 0, aft: 0, port: 0, starboard: 0 });
    expect(state.cabinTemp).toBe(60);
    expect(state.view).toBe("fore");
    expect(state.identEngaged).toBe(false);
    expect(state.identTarget).toBe(0);
  });

  it("leaves the shot timers unchanged (F7)", () => {
    const state = dirtyState();
    dockReset(state);
    expect(state.shotTicks).toEqual({ fore: 1, aft: 2, port: 3, starboard: 4 });
  });

  it("brings a dirty state with saturated timers back to pristine", () => {
    const state = dirtyState();
    state.shotTicks = createPlayerCombatState().shotTicks;
    dockReset(state);
    expect(isPristineCombat(state)).toBe(true);
  });
});

describe("the standing survives a dock and a launch (FOUND-20)", () => {
  it("leaves legalStatus and kills equal through dockReset and launchReset", () => {
    const state = dirtyState();
    state.standing = { legalStatus: 64, kills: 12 };
    dockReset(state);
    expect(state.standing).toEqual({ legalStatus: 64, kills: 12 });
    state.view = "aft";
    launchReset(state);
    expect(state.standing).toEqual({ legalStatus: 64, kills: 12 });
  });

  it("a state whose only difference is the standing is not pristine after dockReset", () => {
    const state = createPlayerCombatState();
    state.standing.legalStatus = 64;
    dockReset(state);
    expect(isPristineCombat(state)).toBe(false);
  });
});

describe("launchReset", () => {
  it("sets the view to fore, the four temperatures to 0 and both shields full", () => {
    const state = dirtyState();
    launchReset(state);
    expect(state.view).toBe("fore");
    expect(state.laserTemp).toEqual({ fore: 0, aft: 0, port: 0, starboard: 0 });
    expect(state.fwdShield).toBe(128);
    expect(state.aftShield).toBe(128);
  });

  it("does not touch energy, cabin, timers or ident", () => {
    const state = dirtyState();
    launchReset(state);
    expect(state.energy).toBe(100);
    expect(state.cabinTemp).toBe(150);
    expect(state.shotTicks).toEqual({ fore: 1, aft: 2, port: 3, starboard: 4 });
    expect(state.identEngaged).toBe(true);
    expect(state.identTarget).toBe(77);
  });
});

describe("sanitizeCombat", () => {
  it("changes nothing on a valid state and reports 0 repairs", () => {
    for (const state of [createPlayerCombatState(), dirtyState()]) {
      const before = serializeCombat(state);
      expect(sanitizeCombat(state)).toBe(0);
      expect(serializeCombat(state)).toBe(before);
    }
  });

  it("repairs non-finite shields, energy and cabin to their pristine values", () => {
    const state = createPlayerCombatState();
    state.fwdShield = Number.NaN;
    state.aftShield = Number.POSITIVE_INFINITY;
    state.energy = Number.NEGATIVE_INFINITY;
    state.cabinTemp = Number.NaN;
    expect(sanitizeCombat(state)).toBe(4);
    expect(state.fwdShield).toBe(128);
    expect(state.aftShield).toBe(128);
    expect(state.energy).toBe(256);
    expect(state.cabinTemp).toBe(60);
  });

  it("clamps finite out-of-range shields, energy, cabin and temperatures", () => {
    const state = createPlayerCombatState();
    state.fwdShield = -5;
    state.aftShield = 500;
    state.energy = 999;
    state.cabinTemp = -10;
    state.laserTemp = { fore: -1, aft: 9999, port: 3, starboard: 256 };
    expect(sanitizeCombat(state)).toBe(6);
    expect(state.fwdShield).toBe(0);
    expect(state.aftShield).toBe(128);
    expect(state.energy).toBe(256);
    expect(state.cabinTemp).toBe(0);
    expect(state.laserTemp).toEqual({
      fore: 0,
      aft: 256,
      port: 3,
      starboard: 256,
    });
  });

  it("repairs a non-finite laser temperature to 0", () => {
    const state = createPlayerCombatState();
    state.laserTemp.port = Number.NaN;
    state.laserTemp.starboard = Number.POSITIVE_INFINITY;
    expect(sanitizeCombat(state)).toBe(2);
    expect(state.laserTemp.port).toBe(0);
    expect(state.laserTemp.starboard).toBe(0);
  });

  it("repairs non-integer, negative, non-finite and over-range timers to saturation", () => {
    const state = createPlayerCombatState();
    state.shotTicks = {
      fore: 1.5,
      aft: -1,
      port: Number.NaN,
      starboard: SHOT_TIMER_SATURATION_TICKS + 1,
    };
    expect(sanitizeCombat(state)).toBe(4);
    for (const facing of FACING_LIST) {
      expect(state.shotTicks[facing]).toBe(SHOT_TIMER_SATURATION_TICKS);
    }
  });

  it("keeps a valid integer timer", () => {
    const state = createPlayerCombatState();
    state.shotTicks.fore = 0;
    state.shotTicks.aft = SHOT_TIMER_SATURATION_TICKS - 1;
    expect(sanitizeCombat(state)).toBe(0);
    expect(state.shotTicks.fore).toBe(0);
    expect(state.shotTicks.aft).toBe(SHOT_TIMER_SATURATION_TICKS - 1);
  });

  it("repairs an unknown view to fore", () => {
    const state = createPlayerCombatState();
    (state as { view: unknown }).view = "up";
    expect(sanitizeCombat(state)).toBe(1);
    expect(state.view).toBe("fore");
  });

  it("repairs a non-boolean ident flag and a non-uint32 target", () => {
    for (const target of [
      -1,
      1.5,
      2 ** 32,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      const state = createPlayerCombatState();
      state.identTarget = target;
      expect(sanitizeCombat(state)).toBe(1);
      expect(state.identTarget).toBe(0);
    }
    const flagged = createPlayerCombatState();
    (flagged as { identEngaged: unknown }).identEngaged = "yes";
    expect(sanitizeCombat(flagged)).toBe(1);
    expect(flagged.identEngaged).toBe(false);
  });

  it("keeps the largest valid target id", () => {
    const state = createPlayerCombatState();
    state.identTarget = 0xffffffff;
    expect(sanitizeCombat(state)).toBe(0);
    expect(state.identTarget).toBe(0xffffffff);
  });

  it("is idempotent", () => {
    const state = createPlayerCombatState();
    state.fwdShield = Number.NaN;
    state.laserTemp.fore = 7000;
    state.shotTicks.aft = 0.5;
    (state as { view: unknown }).view = 3;
    state.identTarget = -4;
    expect(sanitizeCombat(state)).toBe(5);
    const once = serializeCombat(state);
    expect(sanitizeCombat(state)).toBe(0);
    expect(serializeCombat(state)).toBe(once);
  });

  it("makes a poisoned state serialisable", () => {
    const state = createPlayerCombatState();
    state.energy = Number.NaN;
    state.laserTemp.aft = Number.POSITIVE_INFINITY;
    expect(() => serializeCombat(state)).toThrow(/non-finite/);
    sanitizeCombat(state);
    expect(() => serializeCombat(state)).not.toThrow();
  });
});

describe("sanitizeCombat on the standing (FOUND-20)", () => {
  it("keeps the bounds and reports 0 repairs", () => {
    const state = createPlayerCombatState();
    state.standing = { legalStatus: MAX_BOUNTY, kills: MAX_KILL_TALLY };
    expect(sanitizeCombat(state)).toBe(0);
    expect(state.standing).toEqual({
      legalStatus: MAX_BOUNTY,
      kills: MAX_KILL_TALLY,
    });
  });

  it("repairs a negative, a non-integer and an over-range leaf to 0 and counts each", () => {
    const state = createPlayerCombatState();
    state.standing = { legalStatus: -1, kills: 2.5 };
    expect(sanitizeCombat(state)).toBe(2);
    expect(state.standing).toEqual({ legalStatus: 0, kills: 0 });
    state.standing = { legalStatus: MAX_BOUNTY + 1, kills: MAX_KILL_TALLY + 1 };
    expect(sanitizeCombat(state)).toBe(2);
    expect(state.standing).toEqual({ legalStatus: 0, kills: 0 });
  });

  it("repairs one leaf without touching its neighbour", () => {
    const state = createPlayerCombatState();
    state.standing = { legalStatus: Number.NaN, kills: 9 };
    expect(sanitizeCombat(state)).toBe(1);
    expect(state.standing).toEqual({ legalStatus: 0, kills: 9 });
  });

  it("replaces a standing that is not an object and counts one repair", () => {
    for (const bad of [undefined, null, 5, "x"]) {
      const state = createPlayerCombatState();
      (state as { standing: unknown }).standing = bad;
      expect(sanitizeCombat(state)).toBe(1);
      expect(state.standing).toEqual({ legalStatus: 0, kills: 0 });
    }
  });

  it("turns -0 into 0 without a repair", () => {
    const state = createPlayerCombatState();
    state.standing = { legalStatus: -0, kills: -0 };
    expect(sanitizeCombat(state)).toBe(0);
    expect(Object.is(state.standing.legalStatus, 0)).toBe(true);
    expect(Object.is(state.standing.kills, 0)).toBe(true);
  });

  /** Any value a corrupted leaf could hold. */
  const malformedLeaf = fc.oneof(
    fc.integer(),
    fc.double({ noNaN: false }),
    fc.constantFrom(
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -0,
      MAX_BOUNTY,
      MAX_BOUNTY + 1,
      MAX_KILL_TALLY,
      MAX_KILL_TALLY + 1,
      Number.MAX_SAFE_INTEGER,
    ),
    fc.string(),
    fc.boolean(),
    fc.constant(null),
    fc.constant(undefined),
    fc.array(fc.integer()),
    fc.record({ a: fc.integer() }),
  );
  const malformedStanding = fc.oneof(
    fc.record({ legalStatus: malformedLeaf, kills: malformedLeaf }),
    malformedLeaf,
  );

  it("property: arbitrary malformed standing never throws, is repaired, valid and idempotent", () => {
    fc.assert(
      fc.property(malformedStanding, (standing) => {
        const state = createPlayerCombatState();
        (state as { standing: unknown }).standing = standing;
        expect(() => sanitizeCombat(state)).not.toThrow();
        const { legalStatus, kills } = state.standing;
        expect(Number.isSafeInteger(legalStatus)).toBe(true);
        expect(legalStatus).toBeGreaterThanOrEqual(0);
        expect(legalStatus).toBeLessThanOrEqual(MAX_BOUNTY);
        expect(Number.isSafeInteger(kills)).toBe(true);
        expect(kills).toBeGreaterThanOrEqual(0);
        expect(kills).toBeLessThanOrEqual(MAX_KILL_TALLY);
        expect(() => isPristineCombat(state)).not.toThrow();
        expect(() => serializeCombat(state)).not.toThrow();
        const text = serializeCombat(state);
        expect(sanitizeCombat(state)).toBe(0);
        expect(serializeCombat(state)).toBe(text);
      }),
      { numRuns: 300 },
    );
  });
});

describe("serializeCombat", () => {
  it("is one combat= line in a fixed field order", () => {
    const text = serializeCombat(createPlayerCombatState());
    expect(text.startsWith("combat=")).toBe(true);
    expect(text).not.toContain("\n");
    expect(text).toBe(
      "combat=view:fore|shield:128.000000,128.000000|energy:256.000000|cabin:60.000000|" +
        "temp:0.000000,0.000000,0.000000,0.000000|" +
        "shot:12000,12000,12000,12000|ident:false:0",
    );
  });

  it("serialises a dirty state field by field", () => {
    expect(serializeCombat(dirtyState())).toBe(
      "combat=view:starboard|shield:40.000000,50.000000|energy:100.000000|cabin:150.000000|" +
        "temp:11.000000,22.000000,33.000000,44.000000|shot:1,2,3,4|ident:true:77",
    );
  });

  it("prints the standing as a |std: suffix only while it is not pristine", () => {
    const pristineText = serializeCombat(createPlayerCombatState());
    expect(pristineText).not.toContain("std:");
    const state = createPlayerCombatState();
    state.standing.legalStatus = 64;
    const text = serializeCombat(state);
    expect(text).toBe(`${pristineText}|std:64,0`);
    state.standing.kills = 7;
    expect(serializeCombat(state)).toBe(`${pristineText}|std:64,7`);
    state.standing = { legalStatus: 0, kills: 7 };
    expect(serializeCombat(state)).toBe(`${pristineText}|std:0,7`);
    // Strip-and-rehash: deleting the suffix reproduces the pristine text.
    state.standing = { legalStatus: 0, kills: 0 };
    expect(serializeCombat(state)).toBe(pristineText);
  });

  it("is deterministic for equal states", () => {
    expect(serializeCombat(dirtyState())).toBe(serializeCombat(dirtyState()));
  });

  it("differs for each field, including view, identEngaged and identTarget", () => {
    const base = serializeCombat(createPlayerCombatState());
    const seen = new Set<string>([base]);
    for (const [name, edit] of singleFieldEdits()) {
      const state = createPlayerCombatState();
      edit(state);
      const text = serializeCombat(state);
      expect(text, name).not.toBe(base);
      seen.add(text);
    }
    // Every edit produced its own text, none collided with another.
    expect(seen.size).toBe(singleFieldEdits().length + 1);
  });

  it("rounds to six digits so float noise below that does not change the text", () => {
    const first = createPlayerCombatState();
    const second = createPlayerCombatState();
    first.energy = 100;
    second.energy = 100 + 1e-9;
    expect(serializeCombat(first)).toBe(serializeCombat(second));
  });
});
