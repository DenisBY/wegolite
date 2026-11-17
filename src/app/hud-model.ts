// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The HUD view model (Pattern 5, FLGT-05).
 *
 * A pure read-only projection of the simulation into what the canvas draws. It
 * lives in `src/app` because it is app-owned presentation, not simulation, and
 * it is Node-testable: no canvas, no DOM, no state mutation.
 *
 * The scanner plots the Coriolis, the nav buoy and the witchpoint (D-07), and
 * since Phase 12 one contact per inert NPC ship (`NpcContact`, id-free); the
 * planet and sun are deliberately absent because a 41 km planet would fill the
 * 25.6 km display. The aegis/compass rules come from `src/sim/world/aegis`,
 * which is the single owner of the 51,200 m and 3r boundaries.
 */

import { aegisStatus, resolveCompassTarget } from "../sim/world/aegis.js";
import type { AegisStatus } from "../sim/world/aegis.js";
import type { CompassTarget } from "../sim/flight/state.js";
import type { FlightConfig } from "../sim/flight/config.js";
import type { FlightState } from "../sim/flight/state.js";
import { clamp, sub } from "../sim/math.js";
import type { Vec3 } from "../sim/math.js";
import {
  cabinTempGauge,
  energyBanks,
  shieldGauge,
} from "../sim/combat/shields.js";
import {
  alertFlags,
  dialAltitude,
  flightAlertCondition,
} from "../sim/combat/alert.js";
import { COBRA_MAX_ENERGY } from "../sim/combat/constants.js";
import { createPlayerCombatState } from "../sim/combat/state.js";
import type { PlayerCombatState } from "../sim/combat/state.js";
import { laserTempGauge } from "../sim/combat/weapons.js";
import type { NpcContact } from "../sim/world/contacts.js";
import type { Body, SystemLayout } from "../sim/world/layout.js";
import {
  COMPASS_RADIUS,
  HUD_DESIGN_HEIGHT,
  HUD_DESIGN_WIDTH,
  SCANNER_HEIGHT,
  SCANNER_WIDTH,
} from "../render/hud/draw.js";
import type {
  HudBars,
  HudCompass,
  HudContact,
  HudModel,
} from "../render/hud/draw.js";
import type { MessageRow } from "../render/hud/messages.js";
import {
  MAX_MESSAGE_CHARS,
  clampMessage,
  formatClock,
  formatFuel,
  formatSpeed,
} from "../render/hud/format.js";
import {
  projectToCompass,
  projectToScanner,
} from "../render/hud/projection.js";
import type { IdentFrame } from "../render/hud/projection.js";
import { viewTangents } from "../render/viewport.js";

interface ScannerTarget {
  readonly id: HudContact["id"];
  readonly kind: HudContact["kind"];
  readonly body: Body;
}

function bodyFor(target: CompassTarget, layout: SystemLayout): Body {
  switch (target) {
    case "planet":
      return layout.planet;
    case "station":
      return layout.station;
    case "witchpoint":
      return layout.witchpoint;
  }
}

function scannerTargets(layout: SystemLayout): readonly ScannerTarget[] {
  return [
    { id: "station", kind: "station", body: layout.station },
    { id: "navBuoy", kind: "buoy", body: layout.navBuoy },
    { id: "witchpoint", kind: "beacon", body: layout.witchpoint },
  ];
}

function buildContacts(
  state: FlightState,
  layout: SystemLayout,
  npc: readonly NpcContact[],
): readonly HudContact[] {
  const statics = scannerTargets(layout).map((target): HudContact => {
    const relative: Vec3 = sub(target.body.position, state.position);
    const blip = projectToScanner(
      relative,
      state.orientation,
      SCANNER_WIDTH,
      SCANNER_HEIGHT,
      layout.scannerRange,
      target.body.radius,
    );
    return { id: target.id, kind: target.kind, ...blip };
  });
  const ships = npc.map((contact): HudContact => {
    const blip = projectToScanner(
      sub(contact.position, state.position),
      state.orientation,
      SCANNER_WIDTH,
      SCANNER_HEIGHT,
      layout.scannerRange,
      contact.radius,
    );
    return {
      id: "ship",
      kind: contact.kind === "police" ? "police" : "ship",
      ...blip,
    };
  });
  return [...statics, ...ships];
}

function buildCompass(state: FlightState, layout: SystemLayout): HudCompass {
  const target = resolveCompassTarget(
    state.position,
    state.compassMode,
    layout,
  );
  const relative = sub(bodyFor(target, layout).position, state.position);
  const blip = projectToCompass(relative, state.orientation, COMPASS_RADIUS);
  return { target, ...blip };
}

/**
 * The live tank in integer tenths of a light year. A non-finite or negative
 * value is treated as an empty tank so neither the bar nor the text can lie
 * about a state the sim never produces.
 */
function tankTenths(fuelTenths: number): number {
  return Number.isFinite(fuelTenths) ? Math.max(0, fuelTenths) : 0;
}

/** Optional trailing inputs of `buildHudModel` (one options object, Pitfall 10). */
export interface HudModelOptions {
  /**
   * The player's combat state, which feeds the shield, energy, laser and
   * cabin gauges (CBT-06). Absent (no world yet) reads as a pristine ship:
   * full shields and banks, a cold laser and the 60/256 cabin floor.
   */
  readonly combat?: PlayerCombatState | undefined;
  /**
   * The ident lock frame already projected into the HUD design space (D-03),
   * or null / absent when nothing is locked or the ship is out of view. Passed
   * through unchanged; it is not a HUD element.
   */
  readonly identFrame?: IdentFrame | null | undefined;
  /**
   * The live flight camera's width/height aspect, which sets the scanner's
   * forward-view lines. Absent or unusable falls back to the HUD design
   * aspect (1920/1080).
   */
  readonly viewAspect?: number | undefined;
  /**
   * The drawn message rows, top to bottom (Oolite's message area, quick task
   * 261117-pij), each clamped to `MAX_MESSAGE_CHARS`. Absent, a non-empty
   * `message` is one row at full alpha.
   */
  readonly messageRows?: readonly MessageRow[] | undefined;
  /**
   * Whether a hostile is near the player (`hostilesNearPlayer`, Oolite's
   * `ALERT_FLAG_HOSTILES`). Absent reads as none.
   */
  readonly hostiles?: boolean | undefined;
}

/**
 * The condition light. In flight it is Oolite's alert condition from its
 * flags (`PlayerEntity.m:2976-2993`, `5129-5137`); in any other mode it is
 * green, because Oolite clears every flag outside space
 * (`PlayerEntity.m:2894-2899`).
 */
function conditionOf(
  state: FlightState,
  layout: SystemLayout,
  combat: PlayerCombatState,
  hostiles: boolean,
): HudModel["condition"] {
  if (state.mode !== "inFlight") return "green";
  return flightAlertCondition(
    alertFlags({
      massLocked: state.torus.massLocked,
      energy: combat.energy,
      maxEnergy: COBRA_MAX_ENERGY,
      heatLevel: cabinTempGauge(combat),
      altitudeDial: dialAltitude(state.position, layout),
      hostiles,
    }),
  );
}

function messageRowsOf(
  message: string,
  rows: readonly MessageRow[] | undefined,
): readonly MessageRow[] {
  if (rows === undefined) {
    const text = clampMessage(message, MAX_MESSAGE_CHARS);
    return text === "" ? [] : [{ text, alpha: 1 }];
  }
  return rows.map((row) => ({
    text: clampMessage(row.text, MAX_MESSAGE_CHARS),
    alpha: row.alpha,
  }));
}

function buildBars(
  state: FlightState,
  config: FlightConfig,
  fuelTenths: number,
  combat: PlayerCombatState,
): HudBars {
  return {
    speed: config.maxSpeed > 0 ? clamp(state.speed / config.maxSpeed, 0, 1) : 0,
    roll:
      config.maxRoll > 0 ? clamp(state.rollRate / config.maxRoll, -1, 1) : 0,
    pitch:
      config.maxPitch > 0 ? clamp(state.pitchRate / config.maxPitch, -1, 1) : 0,
    // G-4: the bar is the live tank over the full tank, never a constant.
    fuel:
      config.maxFuel > 0
        ? clamp(tankTenths(fuelTenths) / config.maxFuel, 0, 1)
        : 0,
    shieldFwd: shieldGauge(combat.fwdShield),
    shieldAft: shieldGauge(combat.aftShield),
    energyBanks: energyBanks(combat.energy),
    laserTemp: laserTempGauge(combat),
    cabinTemp: cabinTempGauge(combat),
  };
}

/**
 * Build the flight HUD. `fuelTenths` is the live profile tank (0..70) and is
 * required: the bar and the fuel text are both derived from that one value.
 * `npc` is the world's id-free ship contacts (`npcContacts`), empty with no
 * world or traffic off, which leaves exactly the three static contacts.
 * `options.combat` feeds the combat gauges (D-06, D-07); `options.identFrame`
 * is the projected ident lock frame (D-03), passed through.
 * `options.viewAspect` gives `viewTanX`, the flight view's horizontal
 * half-angle tangent from Oolite's frustum rule (`HeadUpDisplay.m:4002-4006`).
 * `options.messageRows` are the drawn message rows and `options.hostiles`
 * feeds the condition light's hostiles flag.
 */
export function buildHudModel(
  state: FlightState,
  layout: SystemLayout,
  config: FlightConfig,
  message: string,
  fuelTenths: number,
  flashAlpha = 0,
  hyperspaceTarget = "",
  npc: readonly NpcContact[] = [],
  options: HudModelOptions = {},
): HudModel {
  const aegis: AegisStatus = aegisStatus(state.position, layout);
  const tank = tankTenths(fuelTenths);
  const requested = options.viewAspect;
  const viewAspect =
    requested !== undefined && Number.isFinite(requested) && requested > 0
      ? requested
      : HUD_DESIGN_WIDTH / HUD_DESIGN_HEIGHT;
  const combat = options.combat ?? createPlayerCombatState();

  return {
    speed: state.speed,
    clockSeconds: state.clockSeconds,
    message: clampMessage(message, MAX_MESSAGE_CHARS),
    messageRows: messageRowsOf(message, options.messageRows),
    condition: conditionOf(state, layout, combat, options.hostiles === true),
    // D-08: the red frame overlay is app-owned feedback, clamped so a bad
    // envelope can never paint outside the canvas.
    flashAlpha: clamp(flashAlpha, 0, 1),
    massLocked: state.torus.massLocked,
    scannerRange: layout.scannerRange,
    contacts: buildContacts(state, layout, npc),
    compass: buildCompass(state, layout),
    aegis,
    bars: buildBars(state, config, tank, combat),
    speedText: formatSpeed(state.speed),
    fuelText: formatFuel(tank),
    clockText: formatClock(state.clockSeconds),
    hyperspaceTarget,
    identFrame: options.identFrame ?? null,
    viewTanX: viewTangents(viewAspect, "flight").x,
  };
}
