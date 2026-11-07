// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The pure hyperspace core (WORLD-06, NAV-03, NAV-04, NAV-06).
 *
 * The fixtures are Oolite's, not this implementation's: the five route rows
 * come from the research table and the truncation discriminator is computed by
 * hand. A "plausible" implementation that uses `Math.floor`, `hypot` or the
 * display float (`0.4 * dist`) fails at least one row here:
 *
 * - Legees (4,253) -> Laeden (4,254) is dist 0: the y delta is -1, and C's
 *   integer division truncates -0.5 toward zero.
 * - Lave -> Zaonce is 112,896 s and 56 fuel, never 112,896.00000000003 or
 *   56.00000000000001.
 *
 * The galaxy file is read in the test only. `src/sim` never imports generated
 * content.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { SimEvent } from "../../src/sim/events.js";
import type { Command } from "../../src/sim/commands.js";
import { DOCK_COMPUTER_KEY } from "../../src/sim/dock/computer.js";
import { ZERO_INTENT } from "../../src/sim/flight/controller.js";
import {
  hashFlight,
  initFlightState,
  serializeFlight,
} from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
import { stepFlight } from "../../src/sim/flight/step.js";
import type { StepOptions } from "../../src/sim/flight/step.js";
import {
  canStartJump,
  countdownSecondsRemaining,
  HYPERSPACE_COUNTDOWN_STEPS,
} from "../../src/sim/hyperspace/countdown.js";
import {
  CHART_LY_PER_UNIT,
  MAX_JUMP_DIST,
  MAX_JUMP_RANGE_LY,
  chartDistance,
  jumpBetween,
} from "../../src/sim/hyperspace/jump.js";
import { vec } from "../../src/sim/math.js";
import { DT } from "../../src/sim/time.js";
import {
  laveDockGeometry,
  placeShipInPortFrame,
} from "../helpers/dock-pose.js";
import { laveFixture } from "../helpers/lave.js";

interface ChartSystem {
  readonly id: string;
  readonly name: string;
  readonly chartX: number;
  readonly chartY: number;
}

const systems = JSON.parse(
  readFileSync(
    new URL("../../src/content/generated/systems/g0.json", import.meta.url),
    "utf8",
  ),
) as ChartSystem[];

function byName(name: string): ChartSystem {
  const found = systems.find((system) => system.name === name);
  if (found === undefined) throw new Error(`galaxy 0 has no system "${name}"`);
  return found;
}

function point(system: ChartSystem): { x: number; y: number } {
  return { x: system.chartX, y: system.chartY };
}

function pointWithId(system: ChartSystem): {
  id: string;
  x: number;
  y: number;
} {
  return { id: system.id, x: system.chartX, y: system.chartY };
}

const lave = byName("Lave");
const diso = byName("Diso");
const leesti = byName("Leesti");
const zaonce = byName("Zaonce");
const riedquat = byName("Riedquat");
const tibedied = byName("Tibedied");
const legees = byName("Legees");
const laeden = byName("Laeden");

interface RouteFixture {
  readonly name: string;
  readonly from: ChartSystem;
  readonly to: ChartSystem;
  readonly dist: number;
  readonly distanceLy: number;
  readonly fuelCost: number;
  readonly jumpTimeSeconds: number;
  readonly reachable: boolean;
}

const ROUTES: readonly RouteFixture[] = [
  {
    name: "Lave -> Diso (3.6 LY)",
    from: lave,
    to: diso,
    dist: 9,
    distanceLy: 3.6,
    fuelCost: 36,
    jumpTimeSeconds: 46_656,
    reachable: true,
  },
  {
    name: "Lave -> Leesti (3.6 LY)",
    from: lave,
    to: leesti,
    dist: 9,
    distanceLy: 3.6,
    fuelCost: 36,
    jumpTimeSeconds: 46_656,
    reachable: true,
  },
  {
    name: "Lave -> Zaonce (5.6 LY)",
    from: lave,
    to: zaonce,
    dist: 14,
    distanceLy: 5.6,
    fuelCost: 56,
    jumpTimeSeconds: 112_896,
    reachable: true,
  },
  {
    name: "Lave -> Riedquat (6.8 LY, the range boundary)",
    from: lave,
    to: riedquat,
    dist: 17,
    distanceLy: 6.8,
    fuelCost: 68,
    jumpTimeSeconds: 166_464,
    reachable: true,
  },
  {
    name: "Lave -> Tibedied (17.6 LY, too far)",
    from: lave,
    to: tibedied,
    dist: 44,
    distanceLy: 17.6,
    fuelCost: 176,
    jumpTimeSeconds: 1_115_136,
    reachable: false,
  },
];

describe("Oolite chart arithmetic", () => {
  it("pins the exported constants", () => {
    expect(CHART_LY_PER_UNIT).toBe(0.4);
    expect(MAX_JUMP_RANGE_LY).toBe(7.0);
    expect(MAX_JUMP_DIST).toBe(17);
  });

  for (const route of ROUTES) {
    it(`computes ${route.name} exactly`, () => {
      const result = jumpBetween(point(route.from), point(route.to));
      expect(result.dist).toBe(route.dist);
      // `0.4 * dist` is the display float only; 14 * 0.4 is not exactly 5.6.
      expect(result.distanceLy).toBeCloseTo(route.distanceLy, 10);
      expect(result.fuelCost).toBe(route.fuelCost);
      expect(result.jumpTimeSeconds).toBe(route.jumpTimeSeconds);
      expect(result.reachable).toBe(route.reachable);
      expect(Number.isSafeInteger(result.dist)).toBe(true);
      expect(Number.isSafeInteger(result.fuelCost)).toBe(true);
      expect(Number.isSafeInteger(result.jumpTimeSeconds)).toBe(true);
    });
  }

  it("is symmetric in its endpoints", () => {
    expect(jumpBetween(point(lave), point(diso))).toEqual(
      jumpBetween(point(diso), point(lave)),
    );
  });

  it("truncates the y delta toward zero: Legees -> Laeden is dist 0", () => {
    // y delta = -1. `Math.trunc(-0.5)` is 0; `Math.floor(-0.5)` is -1, which
    // would give 0.4 LY / 4 fuel / 0.16 h and drop nine galaxy-0 edges.
    const result = jumpBetween(point(legees), point(laeden));
    expect(result).toEqual({
      dist: 0,
      distanceLy: 0,
      fuelCost: 1,
      jumpTimeSeconds: 0,
      reachable: true,
    });
  });

  it("pins the exact integer fuel identity for every reachable distance", () => {
    // 0..17 covers the entire legal jump range, including the dist-0 minimum.
    for (let dist = 0; dist <= MAX_JUMP_DIST; dist += 1) {
      const fuelCost = dist === 0 ? 1 : 4 * dist;
      expect(fuelCost).toBe(dist === 0 ? 1 : 4 * dist);
      expect(Number.isSafeInteger(70 - fuelCost)).toBe(true);
      expect(70 - fuelCost).toBeGreaterThanOrEqual(0);
      expect(Number.isSafeInteger(576 * dist * dist)).toBe(true);
    }
  });

  it("derives the display float without ever feeding it to fuel or time", () => {
    // The float route is exactly the defect this module exists to prevent.
    expect(0.4 * 14).not.toBe(5.6);
    expect((0.4 * 14) ** 2 * 3600).not.toBe(112_896);
    expect(jumpBetween(point(lave), point(zaonce))).toMatchObject({
      fuelCost: 56,
      jumpTimeSeconds: 112_896,
    });
  });

  it("throws a RangeError for a non-finite coordinate", () => {
    expect(() =>
      chartDistance({ x: Number.NaN, y: 0 }, { x: 0, y: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      chartDistance({ x: 0, y: 0 }, { x: Number.POSITIVE_INFINITY, y: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      chartDistance({ x: 0, y: Number.NEGATIVE_INFINITY }, { x: 0, y: 0 }),
    ).toThrow(RangeError);
  });
});

describe("canStartJump", () => {
  const origin = pointWithId(lave);

  it("accepts a reachable, fuelled route and returns its exact facts", () => {
    expect(
      canStartJump({ origin, target: pointWithId(diso), fuel: 70 }),
    ).toEqual({
      ok: true,
      target: pointWithId(diso),
      dist: 9,
      fuelCost: 36,
    });
  });

  it("refuses a missing target and the current system as no target", () => {
    expect(canStartJump({ origin, fuel: 70 })).toEqual({
      ok: false,
      reason: "no target",
    });
    expect(
      canStartJump({ origin, target: pointWithId(lave), fuel: 70 }),
    ).toEqual({ ok: false, reason: "no target" });
  });

  it("refuses a distance above 17 with too far", () => {
    expect(
      canStartJump({ origin, target: pointWithId(tibedied), fuel: 70 }),
    ).toEqual({ ok: false, reason: "too far" });
  });

  it("refuses a tank below the exact integer cost", () => {
    expect(
      canStartJump({ origin, target: pointWithId(diso), fuel: 35 }),
    ).toEqual({ ok: false, reason: "insufficient fuel" });
  });

  it("accepts exactly fuel === cost", () => {
    expect(
      canStartJump({ origin, target: pointWithId(diso), fuel: 36 }),
    ).toMatchObject({ ok: true, dist: 9, fuelCost: 36 });
  });

  it("accepts exactly dist === 17", () => {
    expect(
      canStartJump({ origin, target: pointWithId(riedquat), fuel: 68 }),
    ).toMatchObject({ ok: true, dist: 17, fuelCost: 68 });
  });

  it("reports a malformed tank as insufficient fuel and never throws", () => {
    for (const fuel of [Number.NaN, Number.POSITIVE_INFINITY, -1, 3.5]) {
      expect(() =>
        canStartJump({ origin, target: pointWithId(diso), fuel }),
      ).not.toThrow();
      expect(canStartJump({ origin, target: pointWithId(diso), fuel })).toEqual(
        { ok: false, reason: "insufficient fuel" },
      );
    }
  });

  it("reports a non-finite coordinate as too far and never throws", () => {
    const targets = [
      { id: "bad-x", x: Number.NaN, y: 0 },
      { id: "bad-y", x: 0, y: Number.POSITIVE_INFINITY },
    ];
    for (const target of targets) {
      expect(() => canStartJump({ origin, target, fuel: 70 })).not.toThrow();
      expect(canStartJump({ origin, target, fuel: 70 })).toEqual({
        ok: false,
        reason: "too far",
      });
    }
  });
});

describe("countdown rounding", () => {
  it("reads 1800 steps as 15 whole seconds", () => {
    expect(HYPERSPACE_COUNTDOWN_STEPS).toBe(1800);
    expect(countdownSecondsRemaining(1800)).toBe(15);
  });

  it("rounds a partial second up and a sub-half second down", () => {
    expect(countdownSecondsRemaining(1799)).toBe(15);
    expect(countdownSecondsRemaining(1)).toBe(0);
    expect(countdownSecondsRemaining(0)).toBe(0);
  });

  it("never returns a negative or non-finite second count", () => {
    expect(countdownSecondsRemaining(-10)).toBe(0);
    expect(countdownSecondsRemaining(Number.NaN)).toBe(0);
  });
});

describe("fixed-step hyperspace countdown", () => {
  const fixture = laveFixture();
  const { layout, config } = fixture;
  const laveOrigin = { id: lave.id, x: lave.chartX, y: lave.chartY };

  function optionsFor(target: ChartSystem | undefined, fuel = 70): StepOptions {
    return {
      hyperspace: {
        fuel,
        origin: laveOrigin,
        ...(target === undefined
          ? {}
          : { target: { id: target.id, x: target.chartX, y: target.chartY } }),
      },
    };
  }

  function inFlightState(): FlightState {
    const state = initFlightState(layout);
    state.mode = "inFlight";
    state.dockArmed = false;
    return state;
  }

  function step(
    state: FlightState,
    commands: readonly Command[] = [],
    options: StepOptions = optionsFor(diso),
  ): SimEvent[] {
    return stepFlight(
      state,
      layout,
      config,
      ZERO_INTENT,
      commands,
      DT,
      options,
    );
  }

  it("initialises the new fields and includes both in the replay hash", () => {
    const state = initFlightState(layout);
    expect(state.hyperspaceCountdown).toBe(0);
    expect(state.hyperspaceTarget).toBeNull();

    const serialized = serializeFlight(state);
    const hashed = hashFlight(state);
    expect(serialized).toContain("hyperspaceCountdown=0");
    expect(serialized).toContain("hyperspaceTarget=none");

    state.hyperspaceCountdown = 1;
    expect(serializeFlight(state)).not.toBe(serialized);
    expect(hashFlight(state)).not.toBe(hashed);

    state.hyperspaceCountdown = 0;
    state.hyperspaceTarget = { id: diso.id, dist: 9, fuelCost: 36 };
    expect(serializeFlight(state)).toContain(
      `hyperspaceTarget=${diso.id},9,36`,
    );
    expect(hashFlight(state)).not.toBe(hashed);
  });

  it("starts one countdown on begin and ignores a second begin", () => {
    const state = inFlightState();
    const options = optionsFor(diso);

    const startEvents = step(state, [{ kind: "beginHyperspace" }], options);
    expect(startEvents).toContainEqual({
      kind: "hyperspaceCountdownStarted",
      destinationId: diso.id,
      fuelCost: 36,
      countdownSteps: HYPERSPACE_COUNTDOWN_STEPS,
    });
    expect(state.hyperspaceCountdown).toBe(HYPERSPACE_COUNTDOWN_STEPS);
    expect(state.hyperspaceTarget).toEqual({
      id: diso.id,
      dist: 9,
      fuelCost: 36,
    });

    const secondEvents = step(state, [{ kind: "beginHyperspace" }], options);
    expect(
      secondEvents.some((event) => event.kind.startsWith("hyperspace")),
    ).toBe(false);
    expect(state.hyperspaceCountdown).toBe(HYPERSPACE_COUNTDOWN_STEPS - 1);
  });

  const COMMIT_ROUTES = [
    { system: diso, fuelCost: 36, jumpTimeSeconds: 46_656 },
    { system: leesti, fuelCost: 36, jumpTimeSeconds: 46_656 },
    { system: zaonce, fuelCost: 56, jumpTimeSeconds: 112_896 },
    { system: riedquat, fuelCost: 68, jumpTimeSeconds: 166_464 },
  ] as const;

  for (const route of COMMIT_ROUTES) {
    it(`commits exactly 1800 steps after the drain (${route.system.name})`, () => {
      const state = inFlightState();
      const options = optionsFor(route.system);

      step(state, [{ kind: "beginHyperspace" }], options);
      const clockAfterStart = state.clockSeconds;

      for (let index = 1; index <= HYPERSPACE_COUNTDOWN_STEPS; index += 1) {
        const clockBefore = state.clockSeconds;
        const events = step(state, [], options);
        const delta = state.clockSeconds - clockBefore;

        if (index < HYPERSPACE_COUNTDOWN_STEPS) {
          expect(
            events.some((event) => event.kind === "hyperspaceJumped"),
          ).toBe(false);
          expect(state.hyperspaceCountdown).toBe(
            HYPERSPACE_COUNTDOWN_STEPS - index,
          );
        } else {
          expect(events).toContainEqual({
            kind: "hyperspaceJumped",
            destinationId: route.system.id,
            clockDeltaSeconds: route.jumpTimeSeconds,
            fuelCost: route.fuelCost,
          });
          expect(state.hyperspaceCountdown).toBe(0);
          // Exactly the jump time: terminalTransition must suppress step 5's
          // +dt, or this delta would be jumpTimeSeconds + 1/120.
          expect(delta).toBeCloseTo(route.jumpTimeSeconds, 2);
          expect(delta).toBeLessThan(route.jumpTimeSeconds + 0.008);
        }

        expect(state.hyperspaceCountdown).toBeGreaterThanOrEqual(0);
      }

      // From the post-start clock: 1799 ordinary steps plus the jump time; the
      // commit step itself adds no DT.
      const total = state.clockSeconds - clockAfterStart;
      expect(total).toBeCloseTo(1799 * DT + route.jumpTimeSeconds, 1);
    });
  }

  it("aborts at no cost: exactly one DT on the cancel step, matching a control run", () => {
    const options = optionsFor(diso);

    const state = inFlightState();
    step(state, [{ kind: "beginHyperspace" }], options);
    step(state, [], options);
    const before = state.clockSeconds;
    const events = step(state, [{ kind: "cancelHyperspace" }], options);
    const delta = state.clockSeconds - before;

    expect(events).toContainEqual({
      kind: "hyperspaceCountdownCancelled",
      destinationId: diso.id,
    });
    expect(state.hyperspaceCountdown).toBe(0);
    expect(state.hyperspaceTarget).toBeNull();
    // A cancel is not terminal: the ordinary fixed step still advances the
    // clock, and no jump time is added.
    expect(delta).toBeCloseTo(DT, 3);
    expect(delta).toBeLessThan(1);

    const control = inFlightState();
    step(control, [{ kind: "beginHyperspace" }], options);
    step(control, [], options);
    const controlBefore = control.clockSeconds;
    step(control, [], options);
    expect(delta).toBeCloseTo(control.clockSeconds - controlBefore, 9);

    // No delayed commit: stepping past the original deadline adds no jump.
    for (let index = 0; index < HYPERSPACE_COUNTDOWN_STEPS; index += 1) {
      const later = step(state, [], options);
      expect(later.some((event) => event.kind === "hyperspaceJumped")).toBe(
        false,
      );
    }
    expect(state.hyperspaceCountdown).toBe(0);
  });

  it("ignores a begin while docked, with no countdown and no false refusal", () => {
    const state = initFlightState(layout);
    const before = state.clockSeconds;
    const events = step(state, [{ kind: "beginHyperspace" }], optionsFor(diso));

    expect(events.some((event) => event.kind.startsWith("hyperspace"))).toBe(
      false,
    );
    expect(state.hyperspaceCountdown).toBe(0);
    expect(state.hyperspaceTarget).toBeNull();
    expect(state.clockSeconds).toBe(before);
  });

  it("emits exactly one refusal with the matching reason and adds no jump time", () => {
    const cases = [
      { name: "no target", target: undefined, fuel: 70, reason: "no target" },
      {
        name: "too far",
        target: tibedied,
        fuel: 70,
        reason: "too far",
      },
      {
        name: "insufficient fuel",
        target: diso,
        fuel: 35,
        reason: "insufficient fuel",
      },
    ] as const;

    for (const row of cases) {
      const state = inFlightState();
      const before = state.clockSeconds;
      const events = step(
        state,
        [{ kind: "beginHyperspace" }],
        optionsFor(row.target, row.fuel),
      );
      const refusals = events.filter(
        (event) => event.kind === "hyperspaceRefused",
      );

      expect(refusals, row.name).toEqual([
        { kind: "hyperspaceRefused", reason: row.reason },
      ]);
      expect(state.hyperspaceCountdown).toBe(0);
      expect(state.hyperspaceTarget).toBeNull();
      expect(state.clockSeconds - before).toBeCloseTo(DT, 3);
    }
  });

  it("cancels the countdown when a different target is committed", () => {
    const state = inFlightState();
    step(state, [{ kind: "beginHyperspace" }], optionsFor(diso));
    expect(state.hyperspaceCountdown).toBeGreaterThan(0);

    const events = step(state, [], optionsFor(zaonce));
    expect(events).toContainEqual({
      kind: "hyperspaceCountdownCancelled",
      destinationId: diso.id,
    });
    expect(state.hyperspaceCountdown).toBe(0);
    expect(state.hyperspaceTarget).toBeNull();
  });

  it("keeps pitch, roll and speed live during the countdown", () => {
    const state = inFlightState();
    const options = optionsFor(diso);
    step(state, [{ kind: "beginHyperspace" }], options);

    const orientationBefore = state.orientation;
    const intent = {
      pitch: 1,
      roll: 1,
      speed: 1,
      precision: false,
      torusToggle: false,
    };
    stepFlight(state, layout, config, intent, [], DT, options);

    expect(state.hyperspaceCountdown).toBe(HYPERSPACE_COUNTDOWN_STEPS - 1);
    expect(Math.abs(state.pitchRate)).toBeGreaterThan(0);
    expect(Math.abs(state.rollRate)).toBeGreaterThan(0);
    expect(state.orientation).not.toEqual(orientationBefore);
    expect(state.speed).toBeGreaterThan(0);
  });

  it("keeps the torus drive engaged during the countdown", () => {
    const state = inFlightState();
    // Far from every mass-locking body so the drive can engage.
    state.position = vec(1e7, 0, 0);
    const options = optionsFor(diso);
    step(state, [{ kind: "beginHyperspace" }], options);

    stepFlight(
      state,
      layout,
      config,
      { ...ZERO_INTENT, torusToggle: true },
      [],
      DT,
      options,
    );
    expect(state.torus.engaged).toBe(true);
    expect(state.hyperspaceCountdown).toBe(HYPERSPACE_COUNTDOWN_STEPS - 1);

    step(state, [], options);
    expect(state.torus.engaged).toBe(true);
    expect(state.hyperspaceCountdown).toBe(HYPERSPACE_COUNTDOWN_STEPS - 2);
  });

  it("skips docking on the commit step even with a dock geometry supplied", () => {
    const state = inFlightState();
    // Start far away so the countdown can run without an early capture.
    state.position = vec(1e7, 0, 0);
    const options: StepOptions = {
      ...optionsFor(diso),
      dock: laveDockGeometry(),
    };

    step(state, [{ kind: "beginHyperspace" }], options);
    for (let index = 1; index < HYPERSPACE_COUNTDOWN_STEPS; index += 1) {
      step(state, [], options);
    }
    expect(state.hyperspaceCountdown).toBe(1);

    // A capture pose would dock this tick without the jumpedThisStep guard.
    const pose = placeShipInPortFrame(layout, laveDockGeometry(), {
      nosePastPlane: 90,
      rollFromMatched: 0,
      lateral: 0,
      forwardSpeed: 0,
    });
    state.position = pose.position;
    state.orientation = pose.orientation;
    state.speed = pose.speed;
    state.dockArmed = true;

    const events = step(state, [], options);
    const kinds = events.map((event) => event.kind);
    expect(kinds).toContain("hyperspaceJumped");
    expect(kinds).not.toContain("docked");
    expect(kinds).not.toContain("bounce");
    expect(state.mode).toBe("inFlight");
    expect(state.hyperspaceCountdown).toBe(0);
  });

  it("a computer dock ends the attempt: 1800 steps after a relaunch emit no jump", () => {
    // Gap G-2 regression. Before the fix the dock froze the countdown at 1798
    // and the relaunch resumed it, so the commit fired with no player input.
    const state = inFlightState();
    const equipped: StepOptions = {
      ...optionsFor(diso),
      equipment: new Set([DOCK_COMPUTER_KEY]),
    };

    step(state, [{ kind: "beginHyperspace" }], equipped);
    step(state, [], equipped);
    step(state, [], equipped);
    expect(state.hyperspaceCountdown).toBe(HYPERSPACE_COUNTDOWN_STEPS - 2);

    const docked = step(state, [{ kind: "dockingComputer" }], equipped);
    expect(docked.map((event) => event.kind)).toEqual(["docked"]);
    expect(state.mode).toBe("docked");
    expect(state.hyperspaceCountdown).toBe(0);
    expect(state.hyperspaceTarget).toBeNull();

    step(state, [{ kind: "launch" }], equipped);
    step(state, [{ kind: "skipLaunch" }], equipped);
    expect(state.mode).toBe("inFlight");

    const clockBeforeResume = state.clockSeconds;
    const resumed: SimEvent[] = [];
    for (let index = 0; index < HYPERSPACE_COUNTDOWN_STEPS; index += 1) {
      resumed.push(...step(state, [], equipped));
    }

    expect(resumed.some((event) => event.kind === "hyperspaceJumped")).toBe(
      false,
    );
    expect(state.hyperspaceCountdown).toBe(0);
    // Only ordinary fixed steps advance the clock: about 15 s, never the
    // 46,656 s jump the stale target would have added.
    expect(state.clockSeconds - clockBeforeResume).toBeCloseTo(
      HYPERSPACE_COUNTDOWN_STEPS * DT,
      0,
    );
  });

  it("a computer dock on the timer-at-1 tick emits docked only, with +1200 s", () => {
    // Gap G-2 regression, commit-tick variant. Before the fix this tick emitted
    // [docked, hyperspaceJumped] and left the station overlay over flight.
    const state = inFlightState();
    const equipped: StepOptions = {
      ...optionsFor(diso),
      equipment: new Set([DOCK_COMPUTER_KEY]),
    };
    state.hyperspaceCountdown = 1;
    state.hyperspaceTarget = { id: diso.id, dist: 9, fuelCost: 36 };
    const clockBefore = state.clockSeconds;

    const events = step(state, [{ kind: "dockingComputer" }], equipped);

    expect(events.map((event) => event.kind)).toEqual(["docked"]);
    expect(events).toEqual([
      { kind: "docked", via: "computer", clockDelta: 1200 },
    ]);
    expect(state.mode).toBe("docked");
    expect(state.hyperspaceCountdown).toBe(0);
    expect(state.hyperspaceTarget).toBeNull();
    expect(state.clockSeconds - clockBefore).toBe(1200);
  });
});
