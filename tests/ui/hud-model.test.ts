// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The HUD target line (NAV-02, D-12).
 *
 * The committed hyperspace target is carried on the existing HUD model and
 * drawn inside the clock rectangle; the eleven-element contract is untouched.
 */

import { describe, expect, it } from "vitest";

import { buildHudModel, preRollHudState } from "../../src/app/hud-model.js";
import {
  COMPASS_SIZE,
  HUD_ELEMENTS,
  HUD_LAYOUT,
  HUD_MESSAGE_ROWS,
  SCANNER_HEIGHT,
  SCANNER_WIDTH,
} from "../../src/render/hud/draw.js";
import { MESSAGE_ROWS } from "../../src/render/hud/messages.js";
import {
  MAX_MESSAGE_CHARS,
  clampMessage,
} from "../../src/render/hud/format.js";
import { createPlayerCombatState } from "../../src/sim/combat/state.js";
import { beginLaunch } from "../../src/sim/flight/launch.js";
import {
  LAUNCH_PRE_ROLL_DURATION,
  preRollPose,
} from "../../src/render/launch-camera.js";
import { laveDockGeometry } from "../helpers/dock-pose.js";
import {
  dockMouthPosition,
  hashFlight,
  initFlightState,
} from "../../src/sim/flight/state.js";
import { add, length, sub, vec } from "../../src/sim/math.js";
import type { Vec3 } from "../../src/sim/math.js";
import { npcContacts } from "../../src/sim/world/contacts.js";
import type { NpcContact } from "../../src/sim/world/contacts.js";
import {
  LAVE_EPOCH1_WORLD_SEED,
  buildInertWorld,
  laveInertRecords,
} from "../helpers/inert-world.js";
import { laveFixture } from "../helpers/lave.js";
import {
  laveInertWorld,
  poseNearFirstShip,
} from "../helpers/traffic-fixture.js";

describe("buildHudModel hyperspace target", () => {
  it("carries the committed target name", () => {
    const fixture = laveFixture();
    const state = initFlightState(fixture.layout);

    const model = buildHudModel(
      state,
      fixture.layout,
      fixture.config,
      "",
      70,
      0,
      "Diso",
    );

    expect(model.hyperspaceTarget).toBe("Diso");
  });

  it("is empty when no target is committed", () => {
    const fixture = laveFixture();
    const state = initFlightState(fixture.layout);

    expect(
      buildHudModel(state, fixture.layout, fixture.config, "", 70)
        .hyperspaceTarget,
    ).toBe("");
  });

  it("derives the fuel bar and text from the live tank", () => {
    const fixture = laveFixture();
    const state = initFlightState(fixture.layout);

    const half = buildHudModel(state, fixture.layout, fixture.config, "", 35);
    expect(half.bars.fuel).toBe(0.5);
    expect(half.fuelText).toBe("3.5 LY");

    const empty = buildHudModel(state, fixture.layout, fixture.config, "", 0);
    expect(empty.bars.fuel).toBe(0);
    expect(empty.fuelText).toBe("0.0 LY");

    const full = buildHudModel(state, fixture.layout, fixture.config, "", 70);
    expect(full.bars.fuel).toBe(1);
    expect(full.fuelText).toBe("7.0 LY");
  });

  it("keeps the fuel bar inside 0..1 for a non-finite or negative tank", () => {
    const fixture = laveFixture();
    const state = initFlightState(fixture.layout);

    for (const tank of [Number.NaN, Number.NEGATIVE_INFINITY, -5]) {
      const model = buildHudModel(
        state,
        fixture.layout,
        fixture.config,
        "",
        tank,
      );
      expect(model.bars.fuel).toBe(0);
      expect(model.fuelText).toBe("0.0 LY");
    }
  });

  it("does not add a twelfth HUD element or resize the clock rectangle", () => {
    expect(HUD_ELEMENTS).toHaveLength(11);
    expect(HUD_LAYOUT.clock).toEqual({
      x: 60,
      y: 40,
      width: 360,
      height: 40,
    });
  });
});

const STATIC_CONTACT_IDS = ["station", "navBuoy", "witchpoint"];

/** A contact `distance` metres from `origin` along +x. */
function contactAt(
  origin: Vec3,
  distance: number,
  kind: NpcContact["kind"],
): NpcContact {
  return {
    position: vec(origin.x + distance, origin.y, origin.z),
    orientation: { w: 1, x: 0, y: 0, z: 0 },
    radius: 40,
    specKey: "adder",
    kind,
  };
}

describe("buildHudModel NPC contacts (WORLD-15)", () => {
  it("is exactly today's three static contacts with no NPC argument or an empty list", () => {
    const fixture = laveFixture();
    const state = initFlightState(fixture.layout);

    const none = buildHudModel(state, fixture.layout, fixture.config, "", 70);
    const empty = buildHudModel(
      state,
      fixture.layout,
      fixture.config,
      "",
      70,
      0,
      "",
      [],
    );
    const absent = buildHudModel(
      state,
      fixture.layout,
      fixture.config,
      "",
      70,
      0,
      "",
      npcContacts(undefined),
    );

    for (const model of [none, empty, absent]) {
      expect(model.contacts.map((contact) => contact.id)).toEqual(
        STATIC_CONTACT_IDS,
      );
      expect(model.contacts.map((contact) => contact.kind)).toEqual([
        "station",
        "buoy",
        "beacon",
      ]);
    }
    expect(empty.contacts).toEqual(none.contacts);
  });

  it("appends one ship or police contact per NPC after the three static ones", () => {
    const fixture = laveFixture();
    const state = initFlightState(fixture.layout);

    const model = buildHudModel(
      state,
      fixture.layout,
      fixture.config,
      "",
      70,
      0,
      "",
      [
        contactAt(state.position, 10_000, "neutral"),
        contactAt(state.position, 12_000, "police"),
      ],
    );

    expect(model.contacts.map((contact) => contact.id)).toEqual([
      ...STATIC_CONTACT_IDS,
      "ship",
      "ship",
    ]);
    expect(model.contacts.slice(3).map((contact) => contact.kind)).toEqual([
      "ship",
      "police",
    ]);
    expect(model.contacts.slice(3).every((contact) => contact.visible)).toBe(
      true,
    );
  });

  it("keeps a ship beyond the scanner range and its radius in the list, not visible", () => {
    const fixture = laveFixture();
    const state = initFlightState(fixture.layout);
    const range = fixture.layout.scannerRange;
    expect(range).toBe(25_600);

    const model = buildHudModel(
      state,
      fixture.layout,
      fixture.config,
      "",
      70,
      0,
      "",
      [
        contactAt(state.position, range + 1_000, "neutral"),
        contactAt(state.position, range + 20, "neutral"),
      ],
    );

    const [far, rim] = model.contacts.slice(3);
    expect(far?.visible).toBe(false);
    // 20 m past the range but inside the 40 m radius: pinned to the rim, drawn.
    expect(rim?.visible).toBe(true);
  });

  it("lists the populated Lave world's ships, each visible exactly when within range plus radius", () => {
    const fixture = laveFixture();
    const state = initFlightState(fixture.layout);
    const { world, count } = buildInertWorld(
      LAVE_EPOCH1_WORLD_SEED,
      fixture.layout,
      laveInertRecords(),
    );
    expect(count).toBe(12);
    const npc = npcContacts(world);
    expect(npc).toHaveLength(12);

    const model = buildHudModel(
      state,
      fixture.layout,
      fixture.config,
      "",
      70,
      0,
      "",
      npc,
    );

    expect(model.contacts).toHaveLength(3 + 12);
    expect(model.contacts.slice(0, 3).map((contact) => contact.id)).toEqual(
      STATIC_CONTACT_IDS,
    );
    const ships = model.contacts.slice(3);
    ships.forEach((contact, index) => {
      const source = npc[index] as NpcContact;
      expect(contact.id).toBe("ship");
      expect(contact.kind).toBe(source.kind === "police" ? "police" : "ship");
      const distance = length(sub(source.position, state.position));
      expect(contact.visible).toBe(
        distance - source.radius <= fixture.layout.scannerRange,
      );
    });
  });
});

describe("the regenerated Lave world next to a ship (WORLD-15, plan 12-12's fixture)", () => {
  it("laveInertWorld(1) is the epoch-1 launch world: 12 ships built the way the session builds them", () => {
    const fixture = laveFixture();
    const direct = buildInertWorld(
      LAVE_EPOCH1_WORLD_SEED,
      fixture.layout,
      laveInertRecords(),
    ).world;
    expect(laveInertWorld(1).worldSeed).toBe(LAVE_EPOCH1_WORLD_SEED);
    expect(npcContacts(laveInertWorld(1))).toEqual(npcContacts(direct));
    const epoch0 = laveInertWorld(0);
    expect(npcContacts(epoch0)).toHaveLength(12);
    expect(epoch0.store.live.map((entity) => entity.id)).toEqual(
      Array.from({ length: 12 }, (_, index) => 101 + index),
    );
  });

  it("poseNearFirstShip puts the player 5,000 m from the lowest-id ship along +x", () => {
    const first = npcContacts(laveInertWorld(0))[0] as NpcContact;
    const pose = poseNearFirstShip(0, 5_000);

    expect(pose.position).toEqual({
      x: first.position.x + 5_000,
      y: first.position.y,
      z: first.position.z,
    });
    expect(pose.orientation).toEqual({ w: 1, x: 0, y: 0, z: 0 });
    expect(pose.speed).toBe(0);
    expect(length(sub(pose.position, first.position))).toBeCloseTo(5_000, 9);
  });

  it("lists at least that ship as a visible ship or police contact at that pose", () => {
    const fixture = laveFixture();
    const pose = poseNearFirstShip(0, 5_000);
    const state = {
      ...initFlightState(fixture.layout),
      mode: "inFlight" as const,
      position: pose.position,
      orientation: pose.orientation,
      speed: pose.speed,
    };

    const npc = npcContacts(laveInertWorld(0));
    const model = buildHudModel(
      state,
      fixture.layout,
      fixture.config,
      "",
      70,
      0,
      "",
      npc,
    );

    const first = model.contacts[3];
    expect(first?.id).toBe("ship");
    expect(first?.kind === "ship" || first?.kind === "police").toBe(true);
    expect(first?.visible).toBe(true);
    expect(first?.distance).toBeCloseTo(5_000, 6);
  });
});

describe("buildHudModel combat gauges (CBT-06, D-06, D-07)", () => {
  it("keeps the eleven-element set and the layout (D-07)", () => {
    expect(HUD_ELEMENTS).toHaveLength(11);
    expect(Object.keys(HUD_LAYOUT)).toHaveLength(11);
  });

  it("reads a pristine ship without a combat state: full shields and banks, a cold laser, CT 60/256", () => {
    const fixture = laveFixture();
    const state = initFlightState(fixture.layout);
    const bars = buildHudModel(
      state,
      fixture.layout,
      fixture.config,
      "",
      70,
    ).bars;

    expect(bars.shieldFwd).toBe(1);
    expect(bars.shieldAft).toBe(1);
    expect(bars.energyBanks).toEqual([1, 1, 1, 1]);
    expect(bars.laserTemp).toBe(0);
    expect(bars.cabinTemp).toBe(0.234375);
  });

  it("reads the same pristine gauges from a fresh combat state", () => {
    const fixture = laveFixture();
    const state = initFlightState(fixture.layout);
    const bars = buildHudModel(
      state,
      fixture.layout,
      fixture.config,
      "",
      70,
      0,
      "",
      [],
      { combat: createPlayerCombatState() },
    ).bars;

    expect(bars.cabinTemp).toBe(0.234375);
    expect(bars.shieldFwd).toBe(1);
  });

  it("projects a damaged combat state onto the bars", () => {
    const fixture = laveFixture();
    const state = initFlightState(fixture.layout);
    const combat = createPlayerCombatState();
    combat.fwdShield = 64;
    combat.aftShield = 32;
    combat.energy = 96;
    combat.cabinTemp = 128;
    combat.view = "aft";
    combat.laserTemp = { fore: 0, aft: 64, port: 0, starboard: 0 };

    const bars = buildHudModel(
      state,
      fixture.layout,
      fixture.config,
      "",
      70,
      0,
      "",
      [],
      { combat },
    ).bars;

    expect(bars.shieldFwd).toBe(0.5);
    expect(bars.shieldAft).toBe(0.25);
    // 96 / 256 of four banks is one and a half: the bottom bank (E4) first.
    expect(bars.energyBanks).toEqual([0, 0, 0.5, 1]);
    expect(bars.cabinTemp).toBe(0.5);
    // LT reads the current facing (aft), not the hottest.
    expect(bars.laserTemp).toBe(0.25);
  });
});

describe("buildHudModel ident frame (INPUT-01, D-03)", () => {
  function model(identFrame?: { x: number; y: number; half: number } | null) {
    const fixture = laveFixture();
    return buildHudModel(
      initFlightState(fixture.layout),
      fixture.layout,
      fixture.config,
      "",
      70,
      0,
      "",
      [],
      identFrame === undefined ? {} : { identFrame },
    );
  }

  it("is null when no frame is given", () => {
    expect(model().identFrame).toBeNull();
    expect(model(null).identFrame).toBeNull();
    const fixture = laveFixture();
    expect(
      buildHudModel(
        initFlightState(fixture.layout),
        fixture.layout,
        fixture.config,
        "",
        70,
      ).identFrame,
    ).toBeNull();
  });

  it("passes a projected frame through unchanged", () => {
    const frame = { x: 812.5, y: 301.25, half: 64 };
    expect(model(frame).identFrame).toBe(frame);
  });

  it("is a non-element drawing: the HUD element set and layout stay at eleven", () => {
    expect(HUD_ELEMENTS).toHaveLength(11);
    expect(Object.keys(HUD_LAYOUT)).toHaveLength(11);
    expect(HUD_ELEMENTS).not.toContain("identFrame");
    expect(Object.keys(HUD_LAYOUT)).not.toContain("identFrame");
  });
});

describe("buildHudModel forward-view tangent (HeadUpDisplay.m:4002-4006)", () => {
  const F = Math.tan((28.6 * Math.PI) / 180);

  function viewTanXFor(viewAspect: number | undefined): number {
    const fixture = laveFixture();
    return buildHudModel(
      initFlightState(fixture.layout),
      fixture.layout,
      fixture.config,
      "",
      70,
      0,
      "",
      [],
      { viewAspect },
    ).viewTanX;
  }

  it("is the flight view's horizontal half-angle tangent", () => {
    expect(Math.abs(viewTanXFor(16 / 9) - F)).toBeLessThan(1e-12);
    expect(Math.abs(viewTanXFor(1) - 0.75 * F)).toBeLessThan(1e-12);
    expect(Math.abs(viewTanXFor(0.75) - 0.5625 * F)).toBeLessThan(1e-12);
  });

  it.each([undefined, Number.NaN, 0, -1])(
    "falls back to the 1920x1080 design aspect for %s",
    (viewAspect) => {
      expect(Math.abs(viewTanXFor(viewAspect) - F)).toBeLessThan(1e-12);
    },
  );
});

describe("buildHudModel condition light (Oolite's alert rule, quick task 261117-pij)", () => {
  // PlayerEntity.m:2976-2993 (flags) and 5129-5137 (condition): mass lock
  // alone is yellow; hostiles, energy below 64, heat above 0.9 and an altitude
  // dial below 0.1 (4,000 m) are red.
  const fixture = laveFixture();
  const { planet } = fixture.layout;

  function inFlightAt(altitude: number) {
    const state = initFlightState(fixture.layout);
    state.mode = "inFlight";
    state.position = vec(
      planet.position.x,
      planet.position.y + planet.radius + altitude,
      planet.position.z,
    );
    state.torus.massLocked = false;
    return state;
  }

  function conditionOf(
    state: ReturnType<typeof initFlightState>,
    options: Parameters<typeof buildHudModel>[8] = {},
  ) {
    return buildHudModel(
      state,
      fixture.layout,
      fixture.config,
      "",
      70,
      0,
      "",
      [],
      options,
    ).condition;
  }

  it("is green for a pristine ship far from everything", () => {
    expect(conditionOf(inFlightAt(200_000))).toBe("green");
  });

  it("is yellow while mass-locked and red with hostiles as well", () => {
    const state = inFlightAt(200_000);
    state.torus.massLocked = true;
    expect(conditionOf(state)).toBe("yellow");
    expect(conditionOf(state, { hostiles: true })).toBe("red");
  });

  it("is red on low energy and 3,000 m above the planet surface", () => {
    const combat = createPlayerCombatState();
    combat.energy = 63;
    expect(conditionOf(inFlightAt(200_000), { combat })).toBe("red");
    expect(conditionOf(inFlightAt(3_000))).toBe("red");
  });

  // Oolite computes the flags in every in-space status, launching included
  // (Entity.m:1033-1048), clears them only outside space or while docking
  // (PlayerEntity.m:2893-2899), and a station in range mass-locks the ship
  // (PlayerEntity.m:3053-3060). The sim's flag is stale (false) through the
  // launch, so the HUD reads the body rule live.
  function atDockMouth(mode: "docked" | "launching" | "inFlight") {
    const state = initFlightState(fixture.layout);
    state.mode = mode;
    state.position = dockMouthPosition(fixture.layout);
    state.torus.massLocked = false;
    return state;
  }

  it("is yellow while launching beside the station and red with hostiles", () => {
    expect(conditionOf(atDockMouth("launching"))).toBe("yellow");
    expect(conditionOf(atDockMouth("launching"), { hostiles: true })).toBe(
      "red",
    );
  });

  it("is yellow on the first in-flight frame after the launch, with the sim flag still stale", () => {
    expect(conditionOf(atDockMouth("inFlight"))).toBe("yellow");
  });

  it("is green only while docked, whatever the flags", () => {
    const combat = createPlayerCombatState();
    combat.energy = 63;
    expect(conditionOf(atDockMouth("docked"), { hostiles: true, combat })).toBe(
      "green",
    );
  });
});

describe("buildHudModel message rows (quick task 261117-pij)", () => {
  const fixture = laveFixture();

  it("passes the rows through, each clamped to MAX_MESSAGE_CHARS", () => {
    const long = "x".repeat(MAX_MESSAGE_CHARS + 10);
    const model = buildHudModel(
      initFlightState(fixture.layout),
      fixture.layout,
      fixture.config,
      long,
      70,
      0,
      "",
      [],
      {
        messageRows: [
          { text: "", alpha: 0 },
          { text: long, alpha: 0.5 },
        ],
      },
    );
    expect(model.messageRows).toEqual([
      { text: "", alpha: 0 },
      { text: clampMessage(long, MAX_MESSAGE_CHARS), alpha: 0.5 },
    ]);
    expect(model.message).toBe(clampMessage(long, MAX_MESSAGE_CHARS));
  });

  it("makes one full-alpha row of a non-empty message without rows", () => {
    const state = initFlightState(fixture.layout);
    expect(
      buildHudModel(state, fixture.layout, fixture.config, "hello", 70)
        .messageRows,
    ).toEqual([{ text: "hello", alpha: 1 }]);
    expect(
      buildHudModel(state, fixture.layout, fixture.config, "", 70).messageRows,
    ).toEqual([]);
  });
});

describe("Oolite HUD geometry (quick task 261118-cyn, D-03 to D-05)", () => {
  // hud.plist is a 480-unit-high design scaled by the window height
  // (MyOpenGLView.m:498-505), so one unit is 1080 / 480 = 2.25 design px:
  // design x = 960 + 2.25 x, design y = 1080 - 2.25 y for y_origin -1 and
  // 540 - 2.25 y for a centre-anchored item.
  it("sizes the scanner as hud.plist's 288x64 at 2.25 px per unit", () => {
    expect(SCANNER_WIDTH).toBe(648);
    expect(SCANNER_HEIGHT).toBe(144);
    expect(HUD_LAYOUT.scanner).toEqual({
      x: 636,
      y: 855,
      width: 648,
      height: 144,
    });
  });

  it("places the crosshair, compass, aegis, condition light and message area at hud.plist's positions", () => {
    expect(HUD_LAYOUT.crosshair).toEqual({
      x: 888,
      y: 468,
      width: 144,
      height: 144,
    });
    expect(COMPASS_SIZE).toBe(63);
    expect(HUD_LAYOUT.compass).toEqual({
      x: 1225.5,
      y: 976.5,
      width: 63,
      height: 63,
    });
    expect(HUD_LAYOUT.aegis).toEqual({ x: 636, y: 981, width: 54, height: 54 });
    expect(HUD_LAYOUT.condition).toEqual({
      x: 708,
      y: 999,
      width: 18,
      height: 18,
    });
    expect(HUD_LAYOUT.message).toEqual({
      x: 964.5,
      y: 517.5,
      width: 567,
      height: 315,
    });
  });

  it("covers the SPD, ROLL, PITCH and FUEL bars with their legends", () => {
    // SPD: bar 180x18 centred on (1410, 866.25), surround 4.5 px out.
    expect(HUD_LAYOUT.speed.x).toBe(1315.5);
    expect(HUD_LAYOUT.speed.y).toBe(852.75);
    // ROLL and PITCH share their middle border (y 80 and 70, height 6).
    expect(HUD_LAYOUT.roll.y).toBe(888.75);
    expect(HUD_LAYOUT.pitch.y).toBe(911.25);
    expect(HUD_LAYOUT.roll.y + 22.5).toBe(HUD_LAYOUT.pitch.y);
    // FUEL: bar centred on (510, 942.75); the rect starts at the readout.
    expect(HUD_LAYOUT.fuel.y).toBe(933.75);
    expect(HUD_LAYOUT.fuel.x + HUD_LAYOUT.fuel.width).toBe(600);
  });

  it("keeps the clock rectangle at the top left (D-01)", () => {
    expect(HUD_LAYOUT.clock).toEqual({ x: 60, y: 40, width: 360, height: 40 });
  });

  it("draws all ten of Oolite's message rows", () => {
    expect(HUD_MESSAGE_ROWS).toBe(MESSAGE_ROWS);
    expect(HUD_MESSAGE_ROWS).toBe(10);
  });
});

describe("buildHudModel compass size and buoy flash (quick task 261118-cyn)", () => {
  const fixture = laveFixture();

  it("projects a sideways target 0.4 x COMPASS_SIZE from the compass centre (D-06)", () => {
    const state = initFlightState(fixture.layout);
    // Put the ship 1 km to the left of the station, facing -z: the station is
    // dead to starboard.
    const station = fixture.layout.station.position;
    const moved = {
      ...state,
      position: vec(station.x - 1_000, station.y, station.z),
      orientation: { w: 1, x: 0, y: 0, z: 0 },
      compassMode: "station" as const,
    };
    const model = buildHudModel(moved, fixture.layout, fixture.config, "", 70);
    expect(model.compass.target).toBe("station");
    expect(model.compass.x).toBeCloseTo(0.4 * 63, 9);
    expect(model.compass.y).toBeCloseTo(0, 9);
  });

  it("flashes on Oolite's ((int)(time * 4)) & 1 (HeadUpDisplay.m:1113)", () => {
    const state = initFlightState(fixture.layout);
    const at = (flightTime: number) =>
      buildHudModel(
        { ...state, flightTime },
        fixture.layout,
        fixture.config,
        "",
        70,
      ).scannerFlash;
    expect(at(0)).toBe(false);
    expect(at(0.24)).toBe(false);
    expect(at(0.25)).toBe(true);
    expect(at(0.49)).toBe(true);
    expect(at(0.5)).toBe(false);
    expect(at(10.3)).toBe(true);
  });
});

describe("the HUD while launching (quick 261118-spu, OD-2, OD-3, PD-1, PD-2)", () => {
  const fixture = laveFixture();
  const { layout, config } = fixture;
  const dock = laveDockGeometry();

  function model(state: ReturnType<typeof initFlightState>) {
    return buildHudModel(state, layout, config, "", 70);
  }

  function atMouth(mode: "docked" | "launching" | "inFlight", rollRate = 0) {
    const state = initFlightState(layout);
    state.mode = mode;
    state.position = dockMouthPosition(layout);
    state.orientation = layout.stationBaseQuat;
    state.rollRate = rollRate;
    state.compassMode = "station";
    return state;
  }

  it("zeroes the roll bar and hides the compass blip while launching, the target still resolved", () => {
    const launching = atMouth("launching", layout.stationRollRadPerSec);
    expect(layout.stationRollRadPerSec).not.toBe(0);
    const built = model(launching);
    expect(built.bars.roll).toBe(0);
    expect(built.compass.blip).toBe(false);
    expect(built.compass.target).toBe("station");
  });

  it("keeps the roll bar on the roll rate and draws the blip in flight; no blip while docked", () => {
    const rate = config.maxRoll / 2;
    const inFlight = model(atMouth("inFlight", rate));
    expect(inFlight.bars.roll).toBeCloseTo(0.5, 12);
    expect(inFlight.compass.blip).toBe(true);
    expect(model(atMouth("inFlight", 4 * config.maxRoll)).bars.roll).toBe(1);
    expect(model(atMouth("docked")).compass.blip).toBe(false);
  });

  it("preRollHudState reads the launch start values on a copy and never writes the live state", () => {
    const docked = initFlightState(layout);
    expect(docked.mode).toBe("docked");
    const pose = preRollPose(layout, dock, 0.5);
    const hashBefore = hashFlight(docked);
    const cloneBefore = structuredClone(docked);

    const hud = preRollHudState(docked, layout, config, dock, pose);

    expect(hud).not.toBe(docked);
    expect(hud.mode).toBe("launching");
    expect(hud.clockSeconds).toBe(docked.clockSeconds + 600);
    expect(hud.speed).toBe(config.launchSpeed);
    expect(hud.pitchRate).toBe(0);
    expect(hud.position).toEqual(dockMouthPosition(layout));
    expect(hud.orientation).toEqual(pose.orientation);
    expect(hashFlight(docked)).toBe(hashBefore);
    expect(docked).toEqual(cloneBefore);
  });

  it("draws the same HUD on the last pre-roll frame as on the first launch frame", () => {
    const docked = initFlightState(layout);
    const pose = preRollPose(layout, dock, LAUNCH_PRE_ROLL_DURATION);
    const preRoll = model(preRollHudState(docked, layout, config, dock, pose));
    const real = { ...docked };
    expect(beginLaunch(real, layout, config, dock)).toBe(true);
    const launch = model(real);

    expect(preRoll.speed).toBe(launch.speed);
    expect(preRoll.speedText).toBe(launch.speedText);
    expect(preRoll.clockText).toBe(launch.clockText);
    expect(preRoll.condition).toBe("yellow");
    expect(launch.condition).toBe("yellow");
    expect(preRoll.aegis).toBe("dockingRange");
    expect(launch.aegis).toBe("dockingRange");
    expect(preRoll.compass.blip).toBe(false);
    expect(launch.compass.blip).toBe(false);
    expect(preRoll.bars.roll).toBe(0);
    expect(launch.bars.roll).toBe(0);
    expect(preRoll.bars.speed).toBeCloseTo(0.5, 12);
    expect(launch.bars.speed).toBeCloseTo(0.5, 12);
    expect(preRoll.contacts).toHaveLength(launch.contacts.length);
    preRoll.contacts.forEach((contact, index) => {
      const other = launch.contacts[index];
      expect(other?.id).toBe(contact.id);
      expect(Math.abs(contact.x - (other?.x ?? NaN))).toBeLessThan(1e-9);
      expect(Math.abs(contact.yBase - (other?.yBase ?? NaN))).toBeLessThan(
        1e-9,
      );
      expect(Math.abs(contact.yTail - (other?.yTail ?? NaN))).toBeLessThan(
        1e-9,
      );
    });
  });
});

describe("buildHudModel live buoys (plan 18-08, D-05, PD-02)", () => {
  const fixture = laveFixture();
  const { layout } = fixture;

  type BuoyKey = "witchpoint" | "navBuoy";
  function buoys(
    overrides: Partial<
      Record<BuoyKey, { position?: Vec3; destroyed?: boolean }>
    > = {},
  ) {
    const one = (key: BuoyKey) => ({
      position: overrides[key]?.position ?? layout[key].position,
      destroyed: overrides[key]?.destroyed ?? false,
    });
    return { witchpoint: one("witchpoint"), navBuoy: one("navBuoy") };
  }

  /** A ship `metres` along +x of the witchpoint, facing -z, compass on it. */
  function nearWitchpoint(metres: number) {
    const state = initFlightState(layout);
    return {
      ...state,
      mode: "inFlight" as const,
      position: add(layout.witchpoint.position, vec(metres, 0, 0)),
      orientation: { w: 1, x: 0, y: 0, z: 0 },
      compassMode: "witchpoint" as const,
    };
  }

  function build(
    state: ReturnType<typeof nearWitchpoint>,
    live?: ReturnType<typeof buoys>,
  ) {
    return buildHudModel(
      state,
      layout,
      fixture.config,
      "",
      70,
      0,
      "",
      [],
      live === undefined ? {} : { buoys: live },
    );
  }

  it("draws the three static contacts exactly as before for live, unmoved buoys", () => {
    const state = nearWitchpoint(1_000);
    expect(build(state, buoys()).contacts).toEqual(build(state).contacts);
    expect(build(state, buoys()).compass).toEqual(build(state).compass);
  });

  it("drops a destroyed nav buoy from the scanner and keeps the others", () => {
    const state = nearWitchpoint(1_000);
    const model = build(state, buoys({ navBuoy: { destroyed: true } }));
    expect(model.contacts.map((contact) => contact.id)).toEqual([
      "station",
      "witchpoint",
    ]);
    const witchpoint = buoys({ witchpoint: { destroyed: true } });
    expect(build(state, witchpoint).contacts.map((c) => c.id)).toEqual([
      "station",
      "navBuoy",
    ]);
  });

  it("plots a moved witchpoint buoy where it is, not at its layout position", () => {
    // 40 km out the layout position is off the 25.6 km scanner; the buoy
    // moved 30 km towards the ship is 10 km away and on it.
    const state = nearWitchpoint(40_000);
    const moved = add(layout.witchpoint.position, vec(30_000, 0, 0));
    const before = build(state, buoys()).contacts[2];
    const after = build(state, buoys({ witchpoint: { position: moved } }))
      .contacts[2];
    expect(before?.id).toBe("witchpoint");
    expect(before?.visible).toBe(false);
    expect(after?.id).toBe("witchpoint");
    expect(after?.visible).toBe(true);
  });

  it("points the witchpoint compass at the moved buoy", () => {
    // The ship sits 1 km to starboard of the layout witchpoint: unmoved, the
    // buoy is dead to port; moved 2 km along +x, it is dead to starboard.
    const state = nearWitchpoint(1_000);
    const unmoved = build(state, buoys()).compass;
    expect(unmoved.target).toBe("witchpoint");
    expect(unmoved.x).toBeCloseTo(-0.4 * COMPASS_SIZE, 9);
    const moved = add(layout.witchpoint.position, vec(2_000, 0, 0));
    const compass = build(state, buoys({ witchpoint: { position: moved } }))
      .compass;
    expect(compass.target).toBe("witchpoint");
    expect(compass.x).toBeCloseTo(0.4 * COMPASS_SIZE, 9);
  });
});
