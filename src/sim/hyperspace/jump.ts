// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Oolite's chart distance and every observable value derived from it
 * (WORLD-06, NAV-01, NAV-03, NAV-06, D-05).
 *
 * This module is the **only** definition of the formula. Oolite computes in
 * integer chart units (`src/Core/legacy_random.h:154-160`):
 *
 *     int dx = x1 - x2;
 *     int dy = (y1 - y2) / 2;
 *     int dist = sqrt(dx * dx + dy * dy);   // truncation is desired
 *     return 0.4 * dist;
 *
 * C integer division truncates **toward zero**, so `Math.trunc` is mandatory
 * and `Math.floor` is a defect: for a negative odd y delta the two disagree,
 * which changes galaxy 0 from 875 edges to 866. A single zero-distance pair
 * (Legees -> Laeden) is the cheapest discriminator.
 *
 * Every derived value has an exact integer identity, and none may be produced
 * through the display float:
 *
 * - `fuelCost = dist === 0 ? 1 : 4 * dist` (Oolite's `10 * max(0.1, 0.4 d)`).
 *   The float route returns `13.999999999999993` at Zaonce and the integer save
 *   schema rejects it, which silently kills the arrival autosave.
 * - `jumpTimeSeconds = 576 * dist * dist` (`(0.4 d)^2 * 3600`).
 *
 * The module is pure: no Three, no DOM, no content import, no clock and no
 * random source.
 */

/** Oolite's `0.4 * dist`; display only, never a fuel or clock input. */
export const CHART_LY_PER_UNIT = 0.4;

/** `MAX_JUMP_RANGE` (`ShipEntity.h:109`). */
export const MAX_JUMP_RANGE_LY = 7.0;

/**
 * 17 x 0.4 = 6.8 <= 7.0; 18 x 0.4 = 7.2 > 7.0. The integer-exact range gate,
 * so no route is judged by a float comparison.
 */
export const MAX_JUMP_DIST = 17;

/** The jump facts one chart route produces. */
export interface JumpMath {
  /** Integer chart units, the truncation Oolite performs. */
  readonly dist: number;
  /** `0.4 * dist`, display only. */
  readonly distanceLy: number;
  /** Integer tenths of a light year (Oolite fuel units). One tank is 70. */
  readonly fuelCost: number;
  /** Seconds added to the ship clock at the point of no return. */
  readonly jumpTimeSeconds: number;
  /** `dist <= MAX_JUMP_DIST`; the 7.0 LY rule in integer form. */
  readonly reachable: boolean;
}

/** The two integers a chart record contributes to the distance formula. */
export interface ChartPoint {
  readonly x: number;
  readonly y: number;
}

function requireFiniteCoordinate(field: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(
      `Wegolite: the chart coordinate "${field}" must be finite, received ${String(value)}.`,
    );
  }
}

/**
 * Oolite's `distanceBetweenPlanetPositions`, in integer chart units.
 *
 * @throws {RangeError} when a coordinate is not finite, or when the truncated
 * result is not a safe integer. Content is validated at load and step options
 * are app-built, so this is a programming error; a silent `NaN`/`Infinity`
 * distance must never reach a comparison (T-06-02).
 */
export function chartDistance(from: ChartPoint, to: ChartPoint): number {
  requireFiniteCoordinate("from.x", from.x);
  requireFiniteCoordinate("from.y", from.y);
  requireFiniteCoordinate("to.x", to.x);
  requireFiniteCoordinate("to.y", to.y);

  const dx = from.x - to.x;
  // Math.trunc, never Math.floor: C integer division truncates toward zero.
  const dy = Math.trunc((from.y - to.y) / 2);
  const dist = Math.trunc(Math.sqrt(dx * dx + dy * dy));
  if (!Number.isSafeInteger(dist)) {
    throw new RangeError(
      `Wegolite: the chart distance must be a safe integer, received ${String(dist)}.`,
    );
  }
  return dist;
}

/**
 * The exact clock advance for an integer chart distance.
 *
 * `(0.4 d)^2 * 3600 === 576 d^2`, so the commit path can derive it from the
 * countdown snapshot without re-reading coordinates.
 */
export function jumpTimeSecondsForDist(dist: number): number {
  return 576 * dist * dist;
}

/** Every jump fact for one route, all derived by exact integer algebra. */
export function jumpBetween(from: ChartPoint, to: ChartPoint): JumpMath {
  const dist = chartDistance(from, to);
  return {
    dist,
    distanceLy: dist * CHART_LY_PER_UNIT,
    // 10 * max(0.1, 0.4 d) == 4d for d >= 1; == 1 for d == 0.
    fuelCost: dist === 0 ? 1 : 4 * dist,
    // (0.4 d)^2 * 3600 == 576 d^2 exactly.
    jumpTimeSeconds: jumpTimeSecondsForDist(dist),
    reachable: dist <= MAX_JUMP_DIST,
  };
}
