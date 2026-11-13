// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The per-step `StepOptions` builder (Phase 8, D-12 step 8, D-14).
 *
 * The session derives the same read-only facts for every fixed step: the owned
 * equipment, the fuel, the origin system, the committed target, the origin
 * station's witchspace mass and the dock geometry. This module is the one place
 * that assembles them, so the live session and a Node tick replay (plans 08-14
 * and 08-16) cannot drift apart.
 *
 * It must stay importable by the Playwright Node runner: pure, no DOM, no Three,
 * no `import.meta.glob`, and nothing beyond `src/sim` and one type import from
 * `src/content/types.ts`.
 */

import type { System } from "../../content/types.js";
import type { DockGeometry } from "../../sim/dock/geometry.js";
import type { StepOptions } from "../../sim/flight/step.js";
import { witchspaceStationMass } from "../../sim/hyperspace/countdown.js";

/** The facts one fixed step needs; every field is read live by the caller. */
export interface StepOptionsInput {
  readonly fuel: number;
  /** The live origin system. */
  readonly system: System;
  /** The committed target record, when one is committed. */
  readonly target: System | undefined;
  /** One read-only set per step, derived from the profile (T-04-19). */
  readonly equipment: ReadonlySet<string>;
  /** The validated dock geometry; absent before the boot install. */
  readonly dock: DockGeometry | undefined;
}

/**
 * Build one step's options. Optional keys are omitted rather than set to
 * `undefined` (`exactOptionalPropertyTypes`): `target` only when a target is
 * committed, `stationMass` only when the origin's station kind has a recorded
 * mass, and `dock` only when the geometry exists.
 */
export function buildStepOptions(input: StepOptionsInput): StepOptions {
  const { fuel, system, target, equipment, dock } = input;
  // The read-only station mass of the live system's station kind. Only a
  // Coriolis station has a recorded mass; the others omit the fact.
  const stationMass = witchspaceStationMass(system.station);
  const hyperspace = {
    fuel,
    origin: {
      id: system.id,
      x: system.chartX,
      y: system.chartY,
    },
    ...(target === undefined
      ? {}
      : {
          target: {
            id: target.id,
            x: target.chartX,
            y: target.chartY,
          },
        }),
    ...(stationMass === undefined ? {} : { stationMass }),
  };
  return dock === undefined
    ? { equipment, hyperspace }
    : { dock, equipment, hyperspace };
}
