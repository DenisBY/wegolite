// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The fs-backed galaxy-0 reader and chart screen-point helper (NAV-01/NAV-02).
 *
 * A browser spec must never import `src/content/systems.ts`: that module is
 * built on Vite-only `import.meta.glob`, which the Playwright Node runner cannot
 * evaluate. Reading the committed JSON with `node:fs` gives the same 256
 * records the build shipped, and the pure `buildChartView` turns them into the
 * exact marker the DOM shell painted.
 */

import { readFileSync } from "node:fs";

import type { System } from "../../../src/content/types.js";
import { buildChartView } from "../../../src/ui/chart-model.js";

export const GALAXY0: readonly System[] = JSON.parse(
  readFileSync(
    new URL("../../../src/content/generated/systems/g0.json", import.meta.url),
    "utf8",
  ),
) as System[];

/** One system by its compiled display name; throws when the fixture drifts. */
export function systemByName(name: string): System {
  const system = GALAXY0.find((candidate) => candidate.name === name);
  if (system === undefined) {
    throw new Error(`the galaxy-0 fixture has no system named "${name}"`);
  }
  return system;
}

export interface ChartScreenOptions {
  readonly currentId: string;
  readonly targetId: string | undefined;
  readonly camera: {
    readonly centre: { readonly x: number; readonly y: number };
    readonly spanX: number;
  };
  readonly fuel: number;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly selectedId: string | undefined;
}

/**
 * The CSS-pixel point of one marker, computed by the same pure view model the
 * shell paints. The canvas bounding box is the viewport the shell measured.
 */
export function chartScreenPoint(
  systemId: string,
  options: ChartScreenOptions,
): { readonly x: number; readonly y: number } {
  const view = buildChartView(
    GALAXY0,
    options.currentId,
    options.targetId,
    options.camera,
    options.fuel,
    options.viewport,
    options.selectedId,
  );
  const marker = view.markers.find((candidate) => candidate.id === systemId);
  if (marker === undefined) {
    throw new Error(`the chart view has no marker for "${systemId}"`);
  }
  return { x: marker.screenX, y: marker.screenY };
}
