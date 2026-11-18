// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Three recorded Node flights and their sampled flight hashes (FOUND-12, D-08).
 *
 * These pins are a FROZEN pre-split v1 phase-baseline artifact of the
 * unmodified simulation stepping in Node: they were captured from the tree at
 * the start of Phase 8 and are never updated after the split. Post-split
 * session semantics and browser-versus-Node parity are proven separately by
 * plan 08-16's `tests/helpers/tick-script.ts` (Round 2 review 820a435 L582).
 *
 * Session mirroring (review concern 10b4108 L63): every step builds the
 * `StepOptions` the session's step callback builds, so the replay cannot drift
 * from what the session steps. Each field names the `src/app/game-session.ts`
 * line it mirrors:
 *
 * - controller choice: `ZERO_INTENT` while the mode is `launching`, the player
 *   intent (here a tick-indexed script, the flight-cadence SCRIPT) otherwise
 *   (line 2810, ScriptedLaunchController versus PlayerController);
 * - `equipment`: the New-game equipment set (empty), plus EQ_DOCK_COMP only in
 *   dock-approach (line 2814, `equipmentSet()` over `profile.equipment`);
 * - `hyperspace.fuel`: the profile fuel, `NEW_GAME_FUEL` and then
 *   `fuel - fuelCost` after a jump (lines 2820 and 2091, 2127);
 * - `hyperspace.origin`: `{ id, x: chartX, y: chartY }` of the live system
 *   (line 2821), the Leesti system after the arrival swap;
 * - `hyperspace.target`: present only when a target is committed (lines
 *   2822-2830), Leesti in hyperspace-lave-leesti and retained through the
 *   arrival as `hyperspaceTargetId` is (lines 2130-2132);
 * - `hyperspace.stationMass`: present only when
 *   `witchspaceStationMass(system.station)` is defined (lines 2818 and 2831);
 * - `dock`: the dock geometry built from the live layout's `dockOffset` (lines
 *   2833-2836 and 2974), rebuilt for the Leesti layout after the arrival;
 * - the arrival: `drawWitchpointExit(marketSeedForSystem(originId))` then
 *   `applyWitchpointArrival(state, destinationLayout, config, exit)` (lines
 *   2084-2133), applied before the jump sample is taken.
 *
 * Node only: imports `src/sim`, generated content read with `readFileSync`
 * (as `lave.ts` does) and tests/helpers. It never imports a test file.
 */

import { readFileSync } from "node:fs";

import type { DockPort } from "../../src/content/schemas/dock-port.js";
import type { System } from "../../src/content/types.js";
import { DOCK_COMPUTER_KEY } from "../../src/sim/dock/computer.js";
import { createDockGeometry } from "../../src/sim/dock/geometry.js";
import type { DockGeometry } from "../../src/sim/dock/geometry.js";
import { marketSeedForSystem } from "../../src/sim/economy/market.js";
import type { Command } from "../../src/sim/commands.js";
import type { SimEvent } from "../../src/sim/events.js";
import type { FlightConfig } from "../../src/sim/flight/config.js";
import { ZERO_INTENT } from "../../src/sim/flight/controller.js";
import type { ControlIntent } from "../../src/sim/flight/controller.js";
import {
  CLOCK_START,
  hashFlight,
  initFlightState,
} from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
import { stepFlight } from "../../src/sim/flight/step.js";
import { stepSim } from "../../src/sim/sim.js";
import type { PlayerCombatState } from "../../src/sim/combat/state.js";
import type { StepOptions } from "../../src/sim/flight/step.js";
import { witchspaceStationMass } from "../../src/sim/hyperspace/countdown.js";
import {
  applyWitchpointArrival,
  drawWitchpointExit,
} from "../../src/sim/hyperspace/arrival.js";
import { vec } from "../../src/sim/math.js";
import { NEW_GAME_FUEL } from "../../src/sim/player/profile.js";
import { DT } from "../../src/sim/time.js";
import { deriveSystemLayout } from "../../src/sim/world/layout.js";
import type { SystemLayout } from "../../src/sim/world/layout.js";
import { laveDockGeometry } from "./dock-pose.js";
import { LAVE_SYSTEM_ID, laveFixture } from "./lave.js";

export const RECORDED_FLIGHT_NAMES = [
  "launch-and-fly",
  "dock-approach",
  "hyperspace-lave-leesti",
] as const;

export type RecordedFlightName = (typeof RECORDED_FLIGHT_NAMES)[number];

export interface RecordedFlightSample {
  readonly flight: RecordedFlightName;
  readonly tick: number;
  readonly state: FlightState;
  readonly layout: SystemLayout;
}

const LEESTI_SYSTEM_ID = "g0-s55";

/** The flight-cadence SCRIPT intent values, replayed by tick. */
const SCRIPT: readonly ControlIntent[] = [
  { ...ZERO_INTENT, roll: 1, speed: 1 },
  { ...ZERO_INTENT, pitch: 0.5, speed: 1 },
  { ...ZERO_INTENT, pitch: -0.25, roll: -1 },
  { ...ZERO_INTENT, speed: -1 },
];

const intentAtTick = (tick: number): ControlIntent =>
  SCRIPT[tick % SCRIPT.length] as ControlIntent;

/** Everything the session's step callback reads besides the flight state. */
interface StepContext {
  readonly system: System;
  readonly layout: SystemLayout;
  readonly config: FlightConfig;
  readonly dock: DockGeometry;
  readonly equipment: ReadonlySet<string>;
  readonly fuel: number;
  readonly target?: System;
}

const SAMPLE_EVERY = 60;
const KEY_EVENTS: ReadonlySet<string> = new Set([
  "launched",
  "launchComplete",
  "docked",
  "hyperspaceJumped",
]);

function readJson<T>(relativePath: string): T {
  return JSON.parse(
    readFileSync(new URL(relativePath, import.meta.url), "utf8"),
  ) as T;
}

/** Steps one flight and reports every sample through `visit`. */
class Recorder {
  readonly seen = new Set<string>();
  context: StepContext;
  readonly state: FlightState;

  constructor(
    private readonly flight: RecordedFlightName,
    state: FlightState,
    context: StepContext,
    private readonly visit: (sample: RecordedFlightSample) => void,
    private readonly onJump?: (
      recorder: Recorder,
      event: Extract<SimEvent, { kind: "hyperspaceJumped" }>,
    ) => void,
    private readonly combat?: PlayerCombatState,
  ) {
    this.state = state;
    this.context = context;
  }

  step(commands: readonly Command[] = []): SimEvent[] {
    const { state, context } = this;
    const intent =
      state.mode === "launching" ? ZERO_INTENT : intentAtTick(state.tick);
    const stationMass = witchspaceStationMass(context.system.station);
    const hyperspace = {
      fuel: context.fuel,
      origin: {
        id: context.system.id,
        x: context.system.chartX,
        y: context.system.chartY,
      },
      ...(context.target === undefined
        ? {}
        : {
            target: {
              id: context.target.id,
              x: context.target.chartX,
              y: context.target.chartY,
            },
          }),
      ...(stationMass === undefined ? {} : { stationMass }),
    };
    const options: StepOptions = {
      dock: context.dock,
      equipment: context.equipment,
      hyperspace,
    };
    // With a combat state the replay goes through the composed step, which is
    // what the session calls; without one it is the bare flight step the
    // golden was captured from.
    const events =
      this.combat === undefined
        ? stepFlight(
            state,
            context.layout,
            context.config,
            intent,
            commands,
            DT,
            options,
          )
        : stepSim(
            state,
            undefined,
            context.layout,
            context.config,
            intent,
            commands,
            DT,
            options,
            this.combat,
          );
    baselineLaunchPose(state, events, this.context.layout);
    let keyed = false;
    for (const event of events) {
      this.seen.add(event.kind);
      if (KEY_EVENTS.has(event.kind)) keyed = true;
      if (event.kind === "hyperspaceJumped") this.onJump?.(this, event);
    }
    if (keyed || state.tick % SAMPLE_EVERY === 0) {
      this.visit({
        flight: this.flight,
        tick: state.tick,
        state,
        layout: this.context.layout,
      });
    }
    return events;
  }

  run(steps: number): void {
    for (let index = 0; index < steps; index += 1) this.step();
  }

  require(eventKind: string): void {
    if (!this.seen.has(eventKind)) {
      throw new Error(
        `recorded flight "${this.flight}" never produced a ${eventKind} event`,
      );
    }
  }
}

function launchContext(equipment: ReadonlySet<string>): StepContext {
  const fixture = laveFixture();
  return {
    system: fixture.system,
    layout: fixture.layout,
    config: fixture.config,
    dock: laveDockGeometry(),
    equipment,
    fuel: NEW_GAME_FUEL,
  };
}

/**
 * A new game's docked state at the frozen baseline's clock. The pins were
 * captured when a new game started at `CLOCK_START`; quick task 261117-pij
 * moved the new-game start to the standard scenario's `ship_clock`
 * (`NEW_GAME_CLOCK_SECONDS`), and the flight hash includes the clock
 * (`clock=` in `hashFlight`). Starting the recorded flights at the baseline's
 * clock keeps the frozen pins a check of flight stepping, which is what they
 * guard, without regenerating them.
 */
function baselineFlightState(layout: SystemLayout): FlightState {
  return { ...initFlightState(layout), clockSeconds: CLOCK_START };
}

/**
 * Restore the frozen baseline's launch pose on the step that launched. The pins
 * were captured when a launch left the ship at the untwisted `stationBaseQuat`;
 * quick task 261118-mb5 added Oolite's launch twist (`launchOrientation`, a
 * quarter turn about the nose axis), and the flight hash includes the
 * orientation. Resetting only the orientation on the `launched` step, before
 * the sample, keeps the frozen pins a check of flight stepping, which is what
 * they guard, without regenerating them (as `baselineFlightState` does for the
 * clock). The twist itself is pinned by `tests/sim/launch.test.ts`.
 */
function baselineLaunchPose(
  state: FlightState,
  events: readonly SimEvent[],
  layout: SystemLayout,
): void {
  if (events.some((event) => event.kind === "launched")) {
    state.orientation = layout.stationBaseQuat;
  }
}

/** Launch and fly the full 240-step launch (no skipLaunch), then 1200 steps. */
function launchAndFly(
  visit: (sample: RecordedFlightSample) => void,
  combat?: PlayerCombatState,
): void {
  const context = launchContext(new Set<string>());
  const recorder = new Recorder(
    "launch-and-fly",
    baselineFlightState(context.layout),
    context,
    visit,
    undefined,
    combat,
  );
  recorder.step([{ kind: "launch" }]);
  for (let guard = 0; guard < 400 && recorder.state.mode === "launching";) {
    recorder.step();
    guard += 1;
  }
  recorder.require("launchComplete");
  recorder.run(1200);
}

/** Launch, skip, fly the script, dock with the computer, then 120 docked steps. */
function dockApproach(
  visit: (sample: RecordedFlightSample) => void,
  combat?: PlayerCombatState,
): void {
  const context = launchContext(new Set([DOCK_COMPUTER_KEY]));
  const recorder = new Recorder(
    "dock-approach",
    baselineFlightState(context.layout),
    context,
    visit,
    undefined,
    combat,
  );
  recorder.step([{ kind: "launch" }]);
  recorder.step([{ kind: "skipLaunch" }]);
  recorder.run(600);
  recorder.step([{ kind: "dockingComputer" }]);
  recorder.require("docked");
  recorder.run(120);
}

/** The Lave to Leesti jump with the session's arrival draw, then 600 steps. */
function hyperspaceLaveLeesti(
  visit: (sample: RecordedFlightSample) => void,
  combat?: PlayerCombatState,
): void {
  const fixture = laveFixture();
  const systems = readJson<System[]>(
    "../../src/content/generated/systems/g0.json",
  );
  const leesti = systems.find((candidate) => candidate.id === LEESTI_SYSTEM_ID);
  if (leesti === undefined) {
    throw new Error(`the fixture has no system "${LEESTI_SYSTEM_ID}"`);
  }
  const leestiLayout = deriveSystemLayout(leesti, fixture.stationDef);
  const rawDockPort = readJson<DockPort>(
    "../../src/content/generated/dock-port.json",
  );
  const leestiDock = createDockGeometry(rawDockPort, leestiLayout.dockOffset);

  const context: StepContext = {
    ...launchContext(new Set<string>()),
    target: leesti,
  };
  const recorder = new Recorder(
    "hyperspace-lave-leesti",
    baselineFlightState(context.layout),
    context,
    visit,
    (self, event) => {
      // The session's arrival (game-session.ts:2084-2133): one draw from the
      // origin's market seed, then the pose on the destination layout.
      const exit = drawWitchpointExit(marketSeedForSystem(LAVE_SYSTEM_ID));
      applyWitchpointArrival(
        self.state,
        leestiLayout,
        self.context.config,
        exit,
      );
      self.context = {
        ...self.context,
        system: leesti,
        layout: leestiLayout,
        dock: leestiDock,
        fuel: Math.max(0, self.context.fuel - event.fuelCost),
      };
    },
    combat,
  );
  recorder.step([{ kind: "launch" }]);
  recorder.step([{ kind: "skipLaunch" }]);
  // Move clear of the station's mass lock: the blockage is evaluated at the
  // commit only (step.ts), as tests/sim/hyperspace.test.ts does it.
  recorder.state.position = vec(1e7, 0, 0);
  recorder.run(30);
  recorder.step([{ kind: "beginHyperspace" }]);
  for (let guard = 0; guard < 2000 && !recorder.seen.has("hyperspaceJumped");) {
    recorder.step();
    guard += 1;
  }
  recorder.require("hyperspaceJumped");
  recorder.run(600);
}

/**
 * Replay one recorded flight, calling `visit` at every sampled tick. With a
 * `combat` state the flight is stepped through `stepSim` with that state
 * (the composed step the session calls); without one it is the bare
 * `stepFlight` the golden was captured from.
 */
export function replayRecordedFlight(
  name: RecordedFlightName,
  visit: (sample: RecordedFlightSample) => void,
  combat?: PlayerCombatState,
): void {
  switch (name) {
    case "launch-and-fly":
      launchAndFly(visit, combat);
      return;
    case "dock-approach":
      dockApproach(visit, combat);
      return;
    case "hyperspace-lave-leesti":
      hyperspaceLaveLeesti(visit, combat);
      return;
  }
}

/** The sampled `hashFlight` values of every recorded flight. */
export function recordFlightHashes(): Record<
  RecordedFlightName,
  { tick: number; hash: string }[]
> {
  const result: Record<RecordedFlightName, { tick: number; hash: string }[]> = {
    "launch-and-fly": [],
    "dock-approach": [],
    "hyperspace-lave-leesti": [],
  };
  for (const name of RECORDED_FLIGHT_NAMES) {
    replayRecordedFlight(name, (sample) => {
      result[name].push({ tick: sample.tick, hash: hashFlight(sample.state) });
    });
  }
  return result;
}
