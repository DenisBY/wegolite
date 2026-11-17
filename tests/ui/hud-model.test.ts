// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The HUD target line (NAV-02, D-12).
 *
 * The committed hyperspace target is carried on the existing HUD model and
 * drawn inside the clock rectangle; the eleven-element contract is untouched.
 */

import { describe, expect, it } from "vitest";

import { buildHudModel } from "../../src/app/hud-model.js";
import { HUD_ELEMENTS, HUD_LAYOUT } from "../../src/render/hud/draw.js";
import {
  MAX_MESSAGE_CHARS,
  clampMessage,
} from "../../src/render/hud/format.js";
import { createPlayerCombatState } from "../../src/sim/combat/state.js";
import {
  dockMouthPosition,
  initFlightState,
} from "../../src/sim/flight/state.js";
import { length, sub, vec } from "../../src/sim/math.js";
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
