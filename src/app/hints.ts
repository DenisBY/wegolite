// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * First-use hints on the message line only (D-11, FLGT-05).
 *
 * D-11 forbids a modal tutorial and a permanent controls overlay. The app maps
 * simulation state to one short message at a time; the HUD (or the docked
 * panel, while docked) prints it. Each hint is enqueued once, uses the *current*
 * binding label rather than a hard-coded key (D-12), and is marked seen only
 * after its action is first used — that is what dismisses it.
 *
 * The gauge hints (quick task 261118-ioj) are Wegolite-only: each explains one
 * of Oolite's abbreviated HUD legends the first time its drawn gauge starts to
 * matter. They read the bars the HUD drew this frame (`HintContext.gauges`).
 *
 * `HintId` is owned by `src/settings/schema.ts`; this module imports the union
 * and never redeclares it.
 */

import { labelFor } from "../input/bindings.js";
import type { BindingMap } from "../input/bindings.js";
import { HINT_IDS } from "../settings/schema.js";
import type { HintId } from "../settings/schema.js";
import type { HudBars } from "../render/hud/draw.js";
import type { FlightMode } from "../sim/flight/state.js";

/**
 * The drawn HUD gauges a gauge hint reads, each 0..1 (quick task 261118-ioj).
 */
export interface HintGauges {
  /** The LT gauge: laser temperature of the current facing. */
  readonly laserTemp: number;
  /** The CT gauge: cabin temperature. */
  readonly cabinTemp: number;
  /** The FWD/AFT gauges: the lower of the two shields. */
  readonly shields: number;
  /** The E1-E4 gauges: the mean of the four energy banks. */
  readonly energy: number;
  /** The FUEL gauge: the tank over its capacity. */
  readonly fuel: number;
}

/** A pristine ship: cold lasers, cool cabin, full shields, banks and tank. */
export const CALM_HINT_GAUGES: HintGauges = Object.freeze({
  laserTemp: 0,
  cabinTemp: 0,
  shields: 1,
  energy: 1,
  fuel: 1,
});

/**
 * The gauges a hint decision reads, from the bars the HUD drew (or the calm set
 * before the first frame has been built).
 */
export function hintGauges(bars: HudBars | undefined): HintGauges {
  if (bars === undefined) return CALM_HINT_GAUGES;
  const [e1, e2, e3, e4] = bars.energyBanks;
  return {
    laserTemp: bars.laserTemp,
    cabinTemp: bars.cabinTemp,
    shields: Math.min(bars.shieldFwd, bars.shieldAft),
    energy: (e1 + e2 + e3 + e4) / 4,
    fuel: bars.fuel,
  };
}

/**
 * The LT gauge level at which its hint appears: about 8 s of continuous pulse
 * fire (7 heat per 0.508 s shot against 6 per second cooling), when the bar is
 * clearly rising (quick task 261118-ioj, D-03).
 */
export const LASER_TEMP_HINT_LEVEL = 0.25;

/** The state slice a hint decision may read. */
export interface HintContext {
  readonly mode: FlightMode;
  readonly massLocked: boolean;
  readonly torusEngaged: boolean;
  /** -1, 0 or 1 from this frame's speed axis. */
  readonly speedInput: number;
  /** Whether pitch or roll is held this frame. */
  readonly pitchRollInput: boolean;
  /**
   * The flight clock. `massLocked` is refreshed only by an in-flight step, and
   * the step that completes a launch (or restores a flight) leaves it stale, so
   * a frame can show `inFlight` with `massLocked: false` inside the station's
   * lock. The torus hint waits until this clock has advanced past the first
   * in-flight frame, which proves a step has refreshed the flag.
   */
  readonly flightTime: number;
  /**
   * Whether the ship is inside the station's docking range (`aegisStatus`
   * "dockingRange"), the rule that draws the aegis "S" (quick task
   * 261118-cyn, D-07).
   */
  readonly inDockingRange: boolean;
  /**
   * The HUD's drawn bars of this frame, so a hint explains what the player
   * sees (quick task 261118-ioj).
   */
  readonly gauges: HintGauges;
}

export interface HintController {
  /**
   * Return the one message to show now, or `null`. Marks a hint announced so
   * the same hint is never enqueued twice, and marks a hint seen when its
   * action has been used.
   */
  maybeShow(context: HintContext): string | null;
  /** Mark a hint dismissed (its action was used). */
  markSeen(id: HintId): void;
  isSeen(id: HintId): boolean;
  readonly seen: readonly HintId[];
}

export interface HintOptions {
  readonly bindings: BindingMap;
  /** Hints already dismissed, from the persisted settings blob. */
  readonly seen?: readonly HintId[];
  /** Called once per newly dismissed hint so the session can persist it. */
  readonly onSeen?: (id: HintId) => void;
}

/** The message for one hint, using the live binding labels. */
export function hintText(id: HintId, bindings: BindingMap): string {
  switch (id) {
    case "launch":
      return `Press ${labelFor(bindings, "launch")} to launch`;
    case "torus":
      return `Torus drive: press ${labelFor(bindings, "torus")} to engage`;
    case "torusDisengage":
      return `Torus engaged — press ${labelFor(bindings, "torus")} or any control to disengage`;
    case "speed":
      return `Press ${labelFor(bindings, "speedUp")} / ${labelFor(bindings, "speedDown")} to change speed`;
    case "pitchRoll":
      return `${labelFor(bindings, "pitchForward")} / ${labelFor(bindings, "pitchBack")} pitch, ${labelFor(bindings, "rollLeft")} / ${labelFor(bindings, "rollRight")} roll`;
    case "aegis":
      // Wegolite-only (D-07): Oolite draws the "S" without explaining it.
      return "S: you are inside the station's safe zone";
    case "laserTemp":
      // Wegolite-only (quick task 261118-ioj): Oolite does not explain LT.
      return "LT: laser temperature — ease off before it overheats";
  }
}

/**
 * The gauge hints in the order they are offered when two trigger on the same
 * frame. Every predicate is a plain comparison, false for NaN, so a non-finite
 * gauge never posts or spends a hint.
 */
const GAUGE_HINTS: readonly (readonly [
  HintId,
  (gauges: HintGauges) => boolean,
])[] = [["laserTemp", (g) => g.laserTemp >= LASER_TEMP_HINT_LEVEL]];

export function createHintController(options: HintOptions): HintController {
  const { bindings, onSeen } = options;
  const seen = new Set<HintId>();
  for (const id of options.seen ?? []) {
    if (HINT_IDS.includes(id)) seen.add(id);
  }
  const announced = new Set<HintId>();
  let wasEngaged = false;
  /** The flight clock when `inFlight` was first seen, or null outside flight. */
  let inFlightSince: number | null = null;

  function markSeen(id: HintId): void {
    if (seen.has(id)) return;
    seen.add(id);
    onSeen?.(id);
  }

  function take(id: HintId): string | null {
    if (seen.has(id) || announced.has(id)) return null;
    announced.add(id);
    return hintText(id, bindings);
  }

  return {
    maybeShow(context: HintContext): string | null {
      // First successful use dismisses the hint.
      if (context.mode !== "docked") markSeen("launch");
      if (context.mode === "inFlight") {
        if (context.speedInput !== 0) markSeen("speed");
        if (context.pitchRollInput) markSeen("pitchRoll");
        if (context.torusEngaged) markSeen("torus");
      }
      // Leaving torus after an engagement is the "disengage" use.
      if (wasEngaged && !context.torusEngaged) markSeen("torusDisengage");
      wasEngaged = context.torusEngaged;

      if (context.mode !== "inFlight") inFlightSince = null;
      else inFlightSince ??= context.flightTime;

      if (context.mode === "docked") return take("launch");
      if (context.mode !== "inFlight") return null;

      // Torus teaching only once the ship is clear of mass lock: a hint to
      // press `j` inside the station lock would be wrong. The flag is trusted
      // only after a step has run in flight (see `HintContext.flightTime`);
      // taking the hint on a stale `false` would spend it for the session.
      const flagFresh =
        inFlightSince !== null && context.flightTime > inFlightSince;
      if (flagFresh && !context.massLocked) {
        const torus = take("torus");
        if (torus !== null) return torus;
      }
      if (context.torusEngaged) {
        const disengage = take("torusDisengage");
        if (disengage !== null) return disengage;
      }
      const speed = take("speed");
      if (speed !== null) return speed;
      const pitchRoll = take("pitchRoll");
      if (pitchRoll !== null) return pitchRoll;
      // The safe-zone hint teaches a fact, not a control, so it is marked
      // seen as soon as it is shown (quick task 261118-cyn, D-07).
      if (context.inDockingRange) {
        const aegis = take("aegis");
        if (aegis !== null) {
          markSeen("aegis");
          return aegis;
        }
      }
      // Gauge hints teach a fact, so each is marked seen as soon as it is shown
      // (quick task 261118-ioj, D-05).
      for (const [id, triggered] of GAUGE_HINTS) {
        if (!triggered(context.gauges)) continue;
        const gaugeHint = take(id);
        if (gaugeHint !== null) {
          markSeen(id);
          return gaugeHint;
        }
      }
      return null;
    },
    markSeen,
    isSeen(id: HintId): boolean {
      return seen.has(id);
    },
    get seen(): readonly HintId[] {
      return [...seen];
    },
  };
}
