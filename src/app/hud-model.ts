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
 * since Phase 12 one contact per inert NPC ship (`NpcContact`, id-free). Since
 * plan 18-08 a buoy is plotted where it is and a destroyed one not at all
 * (`HudModelOptions.buoys`). The
 * planet and sun are deliberately absent because a 41 km planet would fill the
 * 25.6 km display. The aegis/compass rules come from `src/sim/world/aegis`,
 * which is the single owner of the 51,200 m and 3r boundaries.
 */

import { aegisStatus, resolveCompassTarget } from "../sim/world/aegis.js";
import type { AegisStatus } from "../sim/world/aegis.js";
import type { CompassTarget, FlightPose } from "../sim/flight/state.js";
import type { FlightConfig } from "../sim/flight/config.js";
import type { FlightState } from "../sim/flight/state.js";
import { beginLaunch } from "../sim/flight/launch.js";
import type { DockGeometry } from "../sim/dock/geometry.js";
import { massLocked as bodyMassLocked } from "../sim/flight/torus.js";
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
  COMPASS_SIZE,
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

/** One buoy as the HUD reads it: where it is and whether it is destroyed. */
export interface HudBuoy {
  readonly position: Vec3;
  readonly destroyed: boolean;
}

/** Both buoys, named by their layout keys. */
export interface HudBuoys {
  readonly witchpoint: HudBuoy;
  readonly navBuoy: HudBuoy;
}

/**
 * The buoy `key` as a body: at its live position when `buoys` is given
 * (PD-02), else at its layout position. The radius is always the layout's.
 */
function buoyBody(
  layout: SystemLayout,
  key: keyof HudBuoys,
  buoys: HudBuoys | undefined,
): Body {
  if (buoys === undefined) return layout[key];
  return { position: buoys[key].position, radius: layout[key].radius };
}

function bodyFor(
  target: CompassTarget,
  layout: SystemLayout,
  buoys: HudBuoys | undefined,
): Body {
  switch (target) {
    case "planet":
      return layout.planet;
    case "station":
      return layout.station;
    case "witchpoint":
      return buoyBody(layout, "witchpoint", buoys);
  }
}

/**
 * The static contacts: the station, then the nav buoy and the witchpoint
 * buoy where they are. A destroyed buoy is not plotted (D-05).
 */
function scannerTargets(
  layout: SystemLayout,
  buoys: HudBuoys | undefined,
): readonly ScannerTarget[] {
  const targets: ScannerTarget[] = [
    { id: "station", kind: "station", body: layout.station },
  ];
  if (buoys?.navBuoy.destroyed !== true) {
    targets.push({
      id: "navBuoy",
      kind: "buoy",
      body: buoyBody(layout, "navBuoy", buoys),
    });
  }
  if (buoys?.witchpoint.destroyed !== true) {
    targets.push({
      id: "witchpoint",
      kind: "beacon",
      body: buoyBody(layout, "witchpoint", buoys),
    });
  }
  return targets;
}

function buildContacts(
  state: FlightState,
  layout: SystemLayout,
  npc: readonly NpcContact[],
  buoys: HudBuoys | undefined,
): readonly HudContact[] {
  const statics = scannerTargets(layout, buoys).map((target): HudContact => {
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

function buildCompass(
  state: FlightState,
  layout: SystemLayout,
  buoys: HudBuoys | undefined,
): HudCompass {
  const target = resolveCompassTarget(
    state.position,
    state.compassMode,
    layout,
  );
  // PD-02: the witchpoint target is the buoy where it is. A destroyed
  // witchpoint buoy is left by the sim's compass rule (PlayerEntity.m:4655-4659
  // at 7437f22), so the HUD does not repeat it.
  const relative = sub(bodyFor(target, layout, buoys).position, state.position);
  // D-06: Oolite's compass size, the full ring diameter (HeadUpDisplay.h:57).
  const blip = projectToCompass(relative, state.orientation, COMPASS_SIZE);
  // PD-2 (quick 261118-spu): Oolite draws the target blip only in system
  // flight and not while launching (`HeadUpDisplay.m:1494` at 7437f22). The
  // target is still resolved, so the probe's `hud.compass.target` keeps its
  // meaning.
  return { target, ...blip, blip: state.mode === "inFlight" };
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
  /**
   * The buoys as the live world has them (plan 18-08, D-05, PD-02): a
   * destroyed buoy has no scanner contact, and a live one is plotted, and the
   * witchpoint compass target pointed at, where it is. Absent (no world) reads
   * as both buoys alive at their layout positions.
   */
  readonly buoys?: HudBuoys | undefined;
}

/**
 * The condition light: Oolite's alert condition from its flags
 * (`PlayerEntity.m:2976-2993`, `5129-5137`) in every mode but docked.
 *
 * Oolite computes the flags in every in-space status, launching included
 * (`Entity.m:1033-1048`), and clears them only outside space or while docking
 * (`PlayerEntity.m:2893-2899`); a station in range mass-locks the ship
 * (`PlayerEntity.m:3053-3060`), so the light is yellow from the launch on.
 * Wegolite has no docking phase (a capture docks at once), and the countdown
 * and the docking computer run inside `inFlight`, so only `docked` is green,
 * and the flight HUD is hidden then. The launch pre-roll (quick 261118-os8)
 * is docked in the sim, but its HUD is drawn from the launch start state
 * (`preRollHudState`, quick 261118-spu), so it reads yellow like the launch.
 *
 * The body mass-lock rule is read live and ORed with the sim's flag: the sim
 * refreshes `state.torus.massLocked` only in in-flight steps, so the flag is
 * stale (false) through the launch and on the frame after the completing
 * launch step. The sim must not change for this, because the torus fields are
 * hashed (`hashFlight`) and pinned by the recorded launch-and-fly golden. In
 * flight the sim flag still carries the ship-caused locks.
 */
function conditionOf(
  state: FlightState,
  layout: SystemLayout,
  combat: PlayerCombatState,
  hostiles: boolean,
): HudModel["condition"] {
  if (state.mode === "docked") return "green";
  return flightAlertCondition(
    alertFlags({
      massLocked:
        state.torus.massLocked || bodyMassLocked(state.position, layout),
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
  // OD-3 (quick 261118-spu): Oolite holds `flightRoll` at 0 while it shows
  // the launch break pattern (`PlayerEntity.m:6469-6470`), so the roll bar
  // reads 0 while launching. Presentation only: the sim's `rollRate` is the
  // station rate while launching (D-10), and the hull keeps rolling with it.
  const rollRate = state.mode === "launching" ? 0 : state.rollRate;
  return {
    speed: config.maxSpeed > 0 ? clamp(state.speed / config.maxSpeed, 0, 1) : 0,
    roll: config.maxRoll > 0 ? clamp(rollRate / config.maxRoll, -1, 1) : 0,
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
 * Oolite's scanner flash phase, `((int)([UNIVERSE getTime] * 4)) & 1`
 * (`HeadUpDisplay.m:1110`), on the flight time: it flips every 0.25 s.
 */
export function scannerFlashAt(flightTime: number): boolean {
  if (!Number.isFinite(flightTime)) return false;
  return (Math.trunc(flightTime * 4) & 1) === 1;
}

/**
 * The state the flight HUD reads during the launch pre-roll (quick 261118-spu,
 * PD-1): a presentation copy of the launch start state.
 *
 * The sim stays docked through the pre-roll, but the camera already shows the
 * launch about to happen, and Oolite shows the launch speed from the first
 * launch frame. So the HUD reads what `beginLaunch` will set: the +600 s
 * clock, the dock mouth position, half top speed, pitch 0 and mode
 * `launching` (yellow condition, aegis "S", compass ring without its blip,
 * roll bar 0). `beginLaunch` is applied to a shallow copy of `state`, so there
 * is one source of truth for those values; it only reassigns top-level fields,
 * so the live state's nested objects are shared but never written. The copy's
 * pose is then set to `pose`, the pre-roll pose the camera is drawn from
 * (`preRollPose`, which equals the `beginLaunch` pose at the end of the
 * pre-roll). The HUD on the last pre-roll frame therefore equals the HUD on
 * the first launch frame.
 *
 * Accepted boundary changes, none of them a flash: NPC contacts appear on the
 * scanner at the launch step, where the sim creates the world; the
 * "Launching" message row appears at the launch step; the scanner buoy flash
 * phase is frozen in the pre-roll, because flight time does not advance while
 * docked.
 *
 * The live state is never written. A state that is not docked is copied
 * without the launch values (`beginLaunch` ignores it).
 */
export function preRollHudState(
  state: FlightState,
  layout: SystemLayout,
  config: FlightConfig,
  dock: DockGeometry | undefined,
  pose: FlightPose,
): FlightState {
  const copy: FlightState = { ...state };
  beginLaunch(copy, layout, config, dock);
  copy.position = pose.position;
  copy.orientation = pose.orientation;
  return copy;
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
    contacts: buildContacts(state, layout, npc, options.buoys),
    scannerFlash: scannerFlashAt(state.flightTime),
    compass: buildCompass(state, layout, options.buoys),
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
