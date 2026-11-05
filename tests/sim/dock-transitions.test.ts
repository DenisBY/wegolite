// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The transition matrix (DOCK-05, D-10, D-11, D-12, T-04-44).
 *
 * One table pins the four ways a tick can end, each against the same five
 * values: mode, tick, `flightTime`, `stationAngle` and `clockSeconds`. The
 * point is the clock contract:
 *
 * - launch: `modeAtStart` is `docked`, so no step-5 advance; exactly +600 s.
 * - manual capture: happens after step 5, so its tick legitimately carries +dt.
 * - computer dock: `terminalTransition` suppresses step 5, so exactly +1200 s
 *   and neither `flightTime` nor `stationAngle` moves.
 * - denied computer dock: a normal in-flight tick, +dt on both clocks.
 */

import { describe, expect, it } from "vitest";

import type { Command } from "../../src/sim/commands.js";
import { DOCK_COMPUTER_KEY } from "../../src/sim/dock/computer.js";
import type { DockGeometry } from "../../src/sim/dock/geometry.js";
import { ZERO_INTENT } from "../../src/sim/flight/controller.js";
import { initFlightState } from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
import { stepFlight } from "../../src/sim/flight/step.js";
import type { StepOptions } from "../../src/sim/flight/step.js";
import { DT } from "../../src/sim/time.js";
import {
  laveDockGeometry,
  placeShipInPortFrame,
} from "../helpers/dock-pose.js";
import { laveFixture } from "../helpers/lave.js";

const fixture = laveFixture();
const { layout, config } = fixture;
const geometry: DockGeometry = laveDockGeometry();
const equipped: StepOptions = { equipment: new Set([DOCK_COMPUTER_KEY]) };
const unequipped: StepOptions = { equipment: new Set<string>() };

interface Row {
  readonly name: string;
  readonly build: () => {
    state: FlightState;
    commands: readonly Command[];
    options: StepOptions | undefined;
  };
  readonly mode: string;
  /** Expected deltas; `null` means a close comparison, not exact equality. */
  readonly flightTimeDelta: number;
  readonly stationAngleDelta: number | null;
  readonly clockDelta: number;
  readonly clockExact: boolean;
}

const rows: readonly Row[] = [
  {
    name: "launch from docked: tick +1, +600 s, no flight time",
    build: () => ({
      state: initFlightState(layout),
      commands: [{ kind: "launch" }],
      options: undefined,
    }),
    mode: "launching",
    flightTimeDelta: 0,
    stationAngleDelta: 0,
    clockDelta: 600,
    clockExact: true,
  },
  {
    name: "manual capture: tick +1, +dt on flight time, angle and clock",
    build: () => {
      const state = initFlightState(layout);
      state.mode = "inFlight";
      const pose = placeShipInPortFrame(layout, geometry, {
        nosePastPlane: 90,
        rollFromMatched: 0,
        lateral: 0,
        forwardSpeed: 0,
      });
      state.position = pose.position;
      state.orientation = pose.orientation;
      state.speed = pose.speed;
      return { state, commands: [], options: { dock: geometry } };
    },
    mode: "docked",
    flightTimeDelta: DT,
    stationAngleDelta: layout.stationRollRadPerSec * DT,
    clockDelta: DT,
    clockExact: false,
  },
  {
    name: "computer dock: tick +1, exactly +1200 s, no flight time",
    build: () => {
      const state = initFlightState(layout);
      state.mode = "inFlight";
      return {
        state,
        commands: [{ kind: "dockingComputer" }],
        options: equipped,
      };
    },
    mode: "docked",
    flightTimeDelta: 0,
    stationAngleDelta: 0,
    clockDelta: 1200,
    clockExact: true,
  },
  {
    name: "denied computer dock: in flight, tick +1, +dt on both clocks",
    build: () => {
      const state = initFlightState(layout);
      state.mode = "inFlight";
      return {
        state,
        commands: [{ kind: "dockingComputer" }],
        options: unequipped,
      };
    },
    mode: "inFlight",
    flightTimeDelta: DT,
    stationAngleDelta: layout.stationRollRadPerSec * DT,
    clockDelta: DT,
    clockExact: false,
  },
];

interface Snapshot {
  readonly tick: number;
  readonly flightTime: number;
  readonly stationAngle: number;
  readonly clockSeconds: number;
}

function snapshot(state: FlightState): Snapshot {
  return {
    tick: state.tick,
    flightTime: state.flightTime,
    stationAngle: state.stationAngle,
    clockSeconds: state.clockSeconds,
  };
}

describe("the four transition rows", () => {
  for (const row of rows) {
    it(row.name, () => {
      const { state, commands, options } = row.build();
      const before = snapshot(state);

      stepFlight(state, layout, config, ZERO_INTENT, commands, DT, options);

      const after = snapshot(state);
      expect(state.mode).toBe(row.mode);
      expect(after.tick - before.tick).toBe(1);
      expect(after.flightTime - before.flightTime).toBeCloseTo(
        row.flightTimeDelta,
        9,
      );
      if (row.stationAngleDelta !== null) {
        expect(after.stationAngle - before.stationAngle).toBeCloseTo(
          row.stationAngleDelta,
          9,
        );
      }
      if (row.clockExact) {
        expect(after.clockSeconds - before.clockSeconds).toBe(row.clockDelta);
      } else {
        // The ship clock is ~2.08e11 s, so one ULP is ~3e-5 s; the delta is a
        // step, not a fixed literal.
        expect(after.clockSeconds - before.clockSeconds).toBeCloseTo(
          row.clockDelta,
          4,
        );
      }
    });
  }
});
